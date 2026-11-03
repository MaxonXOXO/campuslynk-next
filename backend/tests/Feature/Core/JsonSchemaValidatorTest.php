<?php

declare(strict_types=1);

use App\Core\Tenancy\Models\TenantSetting;
use App\Core\Validation\JsonSchemaValidator;

it('successfully validates compliant tenant branding payload', function () {
    $validator = new JsonSchemaValidator;

    $validPayload = [
        'light' => [
            'primary' => '#1A365D',
            'primaryForeground' => '#FFFFFF',
            'ring' => '#2B6CB0',
        ],
        'dark' => [
            'primary' => 'oklch(0.432 0.095 166.913)',
            'primaryForeground' => 'oklch(0.979 0.021 166.113)',
            'ring' => '#4A5568',
        ],
        'logoUrl' => 'https://carmelpoly.in/images/logo.png',
    ];

    $result = $validator->validate($validPayload, 'tenant-branding.schema.json');

    expect($result->isValid())->toBeTrue()
        ->and($result->errors())->toBeEmpty();

    $validated = $validator->validateOrFail($validPayload, 'tenant-branding.schema.json');
    expect($validated)->toBeArray()
        ->and($validated['light']['primary'])->toBe('#1A365D');
});

it('rejects missing required branding fields', function () {
    $validator = new JsonSchemaValidator;

    // Missing required 'dark' object
    $missingDark = [
        'light' => [
            'primary' => '#1A365D',
            'primaryForeground' => '#FFFFFF',
        ],
    ];

    $result = $validator->validate($missingDark, 'tenant-branding.schema.json');
    expect($result->isValid())->toBeFalse()
        ->and($result->errors())->toHaveKey('dark');

    // Missing required 'primaryForeground' inside light
    $missingNestedField = [
        'light' => [
            'primary' => '#1A365D',
        ],
        'dark' => [
            'primary' => '#1A365D',
            'primaryForeground' => '#FFFFFF',
        ],
    ];

    $resultNested = $validator->validate($missingNestedField, 'tenant-branding.schema.json');
    expect($resultNested->isValid())->toBeFalse()
        ->and($resultNested->errors())->toHaveKey('light.primaryForeground');
});

it('rejects wrong field types in schema payload', function () {
    $validator = new JsonSchemaValidator;

    // 'light' given as string instead of object
    $wrongObjectType = [
        'light' => 'not-an-object',
        'dark' => [
            'primary' => '#1A365D',
            'primaryForeground' => '#FFFFFF',
        ],
    ];

    $resultObject = $validator->validate($wrongObjectType, 'tenant-branding.schema.json');
    expect($resultObject->isValid())->toBeFalse()
        ->and($resultObject->errors())->toHaveKey('light');

    // 'primary' given as integer instead of string
    $wrongStringType = [
        'light' => [
            'primary' => 12345,
            'primaryForeground' => '#FFFFFF',
        ],
        'dark' => [
            'primary' => '#1A365D',
            'primaryForeground' => '#FFFFFF',
        ],
    ];

    $resultString = $validator->validate($wrongStringType, 'tenant-branding.schema.json');
    expect($resultString->isValid())->toBeFalse()
        ->and($resultString->errors())->toHaveKey('light.primary');
});

it('fails when an unknown schema name is provided', function () {
    $validator = new JsonSchemaValidator;

    $payload = [
        'foo' => 'bar',
    ];

    $result = $validator->validate($payload, 'non-existent-schema.json');
    expect($result->isValid())->toBeFalse()
        ->and($result->errors())->toHaveKey('_schema');

    expect(fn () => $validator->validateOrFail($payload, 'non-existent-schema.json'))
        ->toThrow(InvalidArgumentException::class);
});

it('enforces JSON Schema validation prior to writing to tenant_settings', function () {
    $invalidBranding = [
        'light' => [
            'primary' => '#1A365D',
            // missing primaryForeground
        ],
    ];

    expect(function () use ($invalidBranding) {
        $setting = new TenantSetting;
        $setting->key = 'branding';
        $setting->value = $invalidBranding;
        $setting->save();
    })->toThrow(InvalidArgumentException::class);
});
