<?php

declare(strict_types=1);

use App\Core\Validation\JsonSchemaValidator;

it('successfully validates compliant tenant branding payload', function () {
    $validator = new JsonSchemaValidator;

    $validPayload = [
        'primary_color' => '#1A365D',
        'secondary_color' => '#2B6CB0',
        'logo_url' => 'https://carmelpoly.in/images/logo.png',
        'favicon_url' => 'https://carmelpoly.in/favicon.ico',
        'font_family' => 'Inter, system-ui, sans-serif',
    ];

    $result = $validator->validate($validPayload, 'tenant-branding.schema.json');

    expect($result->isValid())->toBeTrue()
        ->and($result->errors())->toBeEmpty();

    $validated = $validator->validateOrFail($validPayload, 'tenant-branding.schema.json');
    expect($validated)->toBeArray()
        ->and($validated['primary_color'])->toBe('#1A365D');
});

it('rejects missing required branding fields', function () {
    $validator = new JsonSchemaValidator;

    $invalidPayload = [
        'primary_color' => '#1A365D',
        // missing secondary_color
    ];

    $result = $validator->validate($invalidPayload, 'tenant-branding.schema.json');

    expect($result->isValid())->toBeFalse()
        ->and($result->errors())->toHaveKey('secondary_color');
});

it('rejects invalid color formats and CSS injections', function () {
    $validator = new JsonSchemaValidator;

    $maliciousColors = [
        'red',
        '#12345',
        'rgb(0,0,0)',
        '#ZZZZZZ',
        '#1A365D; background: red;',
        '<script>alert(1)</script>',
    ];

    foreach ($maliciousColors as $badColor) {
        $result = $validator->validate([
            'primary_color' => $badColor,
            'secondary_color' => '#2B6CB0',
        ], 'tenant-branding.schema.json');

        expect($result->isValid())->toBeFalse()
            ->and($result->errors())->toHaveKey('primary_color');
    }
});

it('rejects malicious or non-HTTP logo URLs preventing XSS', function () {
    $validator = new JsonSchemaValidator;

    $maliciousUrls = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        'not a url',
    ];

    foreach ($maliciousUrls as $badUrl) {
        $result = $validator->validate([
            'primary_color' => '#1A365D',
            'secondary_color' => '#2B6CB0',
            'logo_url' => $badUrl,
        ], 'tenant-branding.schema.json');

        expect($result->isValid())->toBeFalse()
            ->and($result->errors())->toHaveKey('logo_url');
    }
});

it('strictly rejects arbitrary additional properties', function () {
    $validator = new JsonSchemaValidator;

    $injectedPayload = [
        'primary_color' => '#1A365D',
        'secondary_color' => '#2B6CB0',
        'custom_css' => 'body { display: none; }',
        'injected_script' => '<script>window.steal()</script>',
    ];

    $result = $validator->validate($injectedPayload, 'tenant-branding.schema.json');

    expect($result->isValid())->toBeFalse()
        ->and($result->errors())->toHaveKey('custom_css')
        ->and($result->errors())->toHaveKey('injected_script');
});
