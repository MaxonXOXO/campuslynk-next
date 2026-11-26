<?php

declare(strict_types=1);

use App\Core\Validation\JsonSchemaValidator;

it('accepts valid per-section unlocks in setup-state schema and rejects organisation_basics', function () {
    /** @var JsonSchemaValidator $validator */
    $validator = app(JsonSchemaValidator::class);

    $valid = [
        'completed_at' => '2026-11-26T10:00:00+00:00',
        'steps' => [
            'institution_profile' => ['completed_at' => '2026-11-26T09:50:00+00:00'],
            'calendar_basics' => ['completed_at' => '2026-11-26T09:55:00+00:00'],
            'signup_policy' => ['completed_at' => '2026-11-26T10:00:00+00:00'],
        ],
        'unlocks' => [
            'institution_profile' => [
                'unlocked_by_user_id' => '01HZX876543210ABCDEFGHJKMN',
                'unlocked_at' => '2026-11-26T11:00:00+00:00',
                'expires_at' => '2026-11-27T11:00:00+00:00',
                'reason' => 'Updating official email for new academic year.',
            ],
        ],
    ];

    expect($validator->validate($valid, 'setup-state.schema.json')->isValid())->toBeTrue()
        ->and(config('setup.unlock_safety_ttl_hours'))->toBe(24);

    $invalid = $valid;
    $invalid['unlocks']['organisation_basics'] = $valid['unlocks']['institution_profile'];

    expect($validator->validate($invalid, 'setup-state.schema.json')->isValid())->toBeFalse();
});
