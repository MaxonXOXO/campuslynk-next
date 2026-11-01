<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Models;

use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $email
 * @property string $password_hash
 * @property string $name
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class PlatformUser extends LandlordModel
{
    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'platform_users';

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password_hash',
    ];
}
