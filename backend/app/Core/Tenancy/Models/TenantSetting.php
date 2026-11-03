<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Models;

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use App\Core\Validation\JsonSchemaValidator;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use InvalidArgumentException;

/**
 * @property string $key
 * @property array<string, mixed>|mixed $value
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class TenantSetting extends Model
{
    use UsesTenantConnection;

    /**
     * Map of setting keys to their canonical JSON schema files.
     *
     * @var array<string, string>
     */
    public const SCHEMA_MAP = [
        'branding' => 'tenant-branding.schema.json',
        'auth.token_lifetime_web_hours' => 'auth-token-lifetime-web-hours.schema.json',
        'auth.token_lifetime_mobile_days' => 'auth-token-lifetime-mobile-days.schema.json',
    ];

    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'tenant_settings';

    /**
     * The primary key associated with the table.
     *
     * @var string
     */
    protected $primaryKey = 'key';

    /**
     * Indicates if the model's ID is auto-incrementing.
     *
     * @var bool
     */
    public $incrementing = false;

    /**
     * The data type of the primary key ID.
     *
     * @var string
     */
    protected $keyType = 'string';

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'key',
        'value',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'value' => 'array',
    ];

    /**
     * Boot model hooks. Enforces fail-closed JSON Schema validation prior to writing to tenant_settings.
     */
    protected static function booted(): void
    {
        static::saving(function (TenantSetting $setting): void {
            if (! isset(self::SCHEMA_MAP[$setting->key])) {
                throw new InvalidArgumentException(
                    "Unknown or unregistered tenant setting key [{$setting->key}]. All tenant settings must be defined in SCHEMA_MAP."
                );
            }

            $schemaFile = self::SCHEMA_MAP[$setting->key];
            /** @var JsonSchemaValidator $validator */
            $validator = app(JsonSchemaValidator::class);

            $raw = $setting->value;
            if (is_int($raw) || (is_string($raw) && ctype_digit($raw))) {
                $raw = str_ends_with($setting->key, '_hours')
                    ? ['hours' => (int) $raw]
                    : (str_ends_with($setting->key, '_days') ? ['days' => (int) $raw] : ['value' => (int) $raw]);
                $setting->value = $raw;
            }

            $value = is_array($raw) ? $raw : (array) $raw;
            $validator->validateOrFail($value, $schemaFile);
        });
    }
}
