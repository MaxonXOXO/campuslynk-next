<?php

declare(strict_types=1);

/**
 * Real Octane Worker-Mode HTTP Leak Test (Prompt 04b, ADR-0010, A2)
 *
 * Exercises the real running FrankenPHP / Octane container over keep-alive
 * connections with parallel requests and interleaved error paths.
 */

$baseUrl = $argv[1] ?? 'http://127.0.0.1:8000';
$targetRequests = isset($argv[2]) ? (int) $argv[2] : 500;
$concurrency = 20;

echo "=================================================================\n";
echo " OCTANE WORKER-MODE HTTP LEAK TEST (500+ Keep-Alive Requests)\n";
echo " Target Base URL:  {$baseUrl}\n";
echo " Total Requests:   {$targetRequests}\n";
echo " Max Concurrency:  {$concurrency} in parallel\n";
echo "=================================================================\n\n";

// 1. Verify health
$ch = curl_init("{$baseUrl}/up");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 5,
]);
$upResp = curl_exec($ch);
$upCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($upCode !== 200) {
    fwrite(STDERR, "FATAL: Octane /up probe failed with HTTP {$upCode}. Server is not ready.\n");
    exit(1);
}
echo "✓ Octane HTTP server is responsive at {$baseUrl}/up\n";

$mh = curl_multi_init();
$active = null;

$requestsCompleted = 0;
$tenantACount = 0;
$tenantBCount = 0;
$errorPathCount = 0;
$leaksDetected = 0;

$runningHandles = [];

/**
 * Create a cURL handle for keep-alive requests.
 *
 * @param array<string, mixed> $customOptions
 * @return \CurlHandle
 */
function createRequestHandle(string $url, string $host, array $customOptions = []): \CurlHandle
{
    $ch = curl_init($url);
    $headers = [
        "Host: {$host}",
        "Accept: application/json",
        "Connection: keep-alive",
    ];

    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_FORBID_REUSE => false,
        CURLOPT_FRESH_CONNECT => false,
        CURLOPT_TIMEOUT => 10,
    ] + $customOptions;

    curl_setopt_array($ch, $options);

    return $ch;
}

$iteration = 0;

while ($requestsCompleted < $targetRequests) {
    // Fill handle pool up to concurrency
    while (count($runningHandles) < $concurrency && ($iteration < $targetRequests)) {
        $iteration++;
        $pattern = $iteration % 7;

        if ($pattern === 0) {
            // Error path 1: Unknown host -> Expects 404
            $ch = createRequestHandle("{$baseUrl}/api/v1/meta", "rogue-unknown-host.test");
            $meta = ['type' => 'error_unknown_host', 'expected_status' => 404];
        } elseif ($pattern === 1) {
            // Error path 2: Malformed JSON -> Expects 400 or 422
            $ch = createRequestHandle("{$baseUrl}/api/v1/auth/login", "carmel.test", [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => '{"broken_json":',
                CURLOPT_HTTPHEADER => [
                    "Host: carmel.test",
                    "Content-Type: application/json",
                    "Accept: application/json",
                    "Connection: keep-alive",
                ],
            ]);
            $meta = ['type' => 'error_malformed_json', 'expected_status' => [400, 422]];
        } elseif ($pattern === 2) {
            // Error path 3: Wrong token / Unauthorized -> Expects 401
            $ch = createRequestHandle("{$baseUrl}/api/v1/me", "carmel.test", [
                CURLOPT_HTTPHEADER => [
                    "Host: carmel.test",
                    "Authorization: Bearer invalid_token_12345",
                    "Accept: application/json",
                    "Connection: keep-alive",
                ],
            ]);
            $meta = ['type' => 'error_unauthorized', 'expected_status' => 401];
        } elseif ($iteration % 2 === 0) {
            // Good path: Tenant A (carmel)
            $ch = createRequestHandle("{$baseUrl}/api/v1/meta", "carmel.test");
            $meta = ['type' => 'meta', 'expected_slug' => 'carmel'];
        } else {
            // Good path: Tenant B (stmarys)
            $ch = createRequestHandle("{$baseUrl}/api/v1/meta", "stmarys.test");
            $meta = ['type' => 'meta', 'expected_slug' => 'stmarys'];
        }

        $id = (int) $ch;
        $runningHandles[$id] = ['handle' => $ch, 'meta' => $meta];
        curl_multi_add_handle($mh, $ch);
    }

    // Execute multi handles
    do {
        $status = curl_multi_exec($mh, $active);
    } while ($status === CURLM_CALL_MULTI_PERFORM);

    if ($active) {
        curl_multi_select($mh, 0.05);
    }

    // Check finished requests
    while ($info = curl_multi_info_read($mh)) {
        $ch = $info['handle'];
        $id = (int) $ch;
        $meta = $runningHandles[$id]['meta'];
        $body = curl_multi_getcontent($ch);
        $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
        unset($runningHandles[$id]);

        $requestsCompleted++;

        if ($meta['type'] === 'meta') {
            $expectedSlug = $meta['expected_slug'];
            $json = json_decode((string) $body, true);
            $actualSlug = $json['meta']['tenant']['slug'] ?? null;

            if ($statusCode !== 200 || $actualSlug !== $expectedSlug) {
                $leaksDetected++;
                fwrite(STDERR, "LEAK DETECTED at request #{$requestsCompleted}!\n");
                fwrite(STDERR, "Expected tenant: '{$expectedSlug}', Got: '{$actualSlug}' (HTTP {$statusCode})\n");
                fwrite(STDERR, "Response: {$body}\n");
            } else {
                if ($expectedSlug === 'carmel') {
                    $tenantACount++;
                } else {
                    $tenantBCount++;
                }
            }
        } else {
            // Error path verification
            $expected = $meta['expected_status'];
            $isExpected = is_array($expected) ? in_array($statusCode, $expected, true) : $statusCode === $expected;

            if (! $isExpected) {
                $leaksDetected++;
                fwrite(STDERR, "ERROR PATH FAILED at request #{$requestsCompleted} ({$meta['type']})!\n");
                fwrite(STDERR, "Expected status: " . (is_array($expected) ? implode('/', $expected) : $expected) . ", Got: {$statusCode}\n");
                fwrite(STDERR, "Response: {$body}\n");
            } else {
                $errorPathCount++;
            }
        }

        if ($requestsCompleted % 50 === 0 || $requestsCompleted === $targetRequests) {
            echo " Progress: {$requestsCompleted}/{$targetRequests} requests verified (A: {$tenantACount}, B: {$tenantBCount}, Error paths: {$errorPathCount}, Leaks: {$leaksDetected})\n";
        }
    }
}

curl_multi_close($mh);

echo "\n=================================================================\n";
echo " TEST SUMMARY\n";
echo " Total Requests Executed:    {$requestsCompleted}\n";
echo " Tenant Carmel Verified:     {$tenantACount}\n";
echo " Tenant StMarys Verified:    {$tenantBCount}\n";
echo " Interleaved Error Paths:    {$errorPathCount}\n";
echo " Cross-Tenant Leaks Found:   {$leaksDetected}\n";
echo "=================================================================\n";

if ($leaksDetected > 0) {
    fwrite(STDERR, "FAILED: {$leaksDetected} cross-tenant leaks or error path anomalies detected!\n");
    exit(1);
}

echo "✓ 100% PASS: Octane worker-mode persistent connections isolated cleanly with zero leaks.\n";
exit(0);

