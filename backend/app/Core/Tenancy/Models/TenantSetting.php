<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Models;

use App\Core\Tenancy\Concerns\UsesTenantConnection;
use App\Core\Validation\JsonSchemaValidator;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

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
     * Boot model hooks. Enforces JSON Schema validation prior to writing to tenant_settings.
     */
    protected static function booted(): void
    {
        static::saving(function (TenantSetting $setting): void {
            if (isset(self::SCHEMA_MAP[$setting->key])) {
                $schemaFile = self::SCHEMA_MAP[$setting->key];
                /** @var JsonSchemaValidator $validator */
                $validator = app(JsonSchemaValidator::class);
                $value = is_array($setting->value) ? $setting->value : (array) $setting->value;
                $validator->validateOrFail($value, $schemaFile);
            }
        });
    }
}
