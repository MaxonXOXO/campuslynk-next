<?php

declare(strict_types=1);

use App\Core\Tenancy\Exceptions\UnconfiguredDefaultConnectionException;
use Illuminate\Support\Facades\DB;
use Tests\Fixtures\TestUnscopedModel;

it('prohibits raw database queries on the default connection when no tenant context is established', function () {
    expect(fn () => DB::table('some_table')->get())
        ->toThrow(
            UnconfiguredDefaultConnectionException::class,
            'No tenant context has been established. Direct queries on the default database connection are prohibited.'
        );
});

it('prohibits Eloquent queries on models without explicit connections when no tenant context is established', function () {
    expect(fn () => TestUnscopedModel::all())
        ->toThrow(
            UnconfiguredDefaultConnectionException::class,
            'No tenant context has been established. Direct queries on the default database connection are prohibited.'
        );
});

it('allows explicit landlord connection queries even when no tenant context is established', function () {
    $result = DB::connection('landlord')->selectOne('SELECT 1 as alive');
    expect($result)->not->toBeNull()
        ->and((int) $result->alive)->toBe(1);
});
