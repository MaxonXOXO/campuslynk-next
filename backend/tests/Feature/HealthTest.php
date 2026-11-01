<?php

it('returns healthy status from the default up endpoint', function () {
    $response = $this->get('/up');

    $response->assertOk();
});

it('returns standard envelope from api v1 health endpoint', function () {
    $response = $this->getJson('/api/v1/health');

    $response->assertOk()
        ->assertJsonStructure([
            'data' => [
                'status',
            ],
            'meta' => [
                'timestamp',
                'version',
            ],
            'links' => [
                'self',
            ],
        ])
        ->assertJson([
            'data' => [
                'status' => 'ok',
            ],
        ]);
});
