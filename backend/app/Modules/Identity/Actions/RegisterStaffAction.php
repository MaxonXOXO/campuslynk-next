<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Core\Tenancy\Models\TenantSetting;
use App\Core\Tenancy\TenantContext;
use App\Modules\Identity\Models\StaffProfile;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Models\UserIdentifier;
use App\Modules\Organisation\Contracts\ScopeDirectoryContract;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

final class RegisterStaffAction
{
    private const DEFAULT_DAILY_CAP = 100;

    private const DEFAULT_REJECTED_COOLDOWN_DAYS = 7;

    public function __construct(
        private readonly TenantContext $tenantContext,
        private readonly ScopeDirectoryContract $scopeDirectory,
    ) {}

    /**
     * @param array{
     *     name: string,
     *     email?: string|null,
     *     mobile?: string|null,
     *     password: string,
     *     requested_department_id?: string|null,
     *     designation?: string|null,
     *     employee_id?: string|null,
     *     website?: string|null
     * } $attributes
     */
    public function execute(array $attributes, string $ip): void
    {
        // Honeypot check: silently accept without creating any record
        if (isset($attributes['website']) && trim((string) $attributes['website']) !== '') {
            return;
        }

        $requestedDeptId = isset($attributes['requested_department_id']) && trim((string) $attributes['requested_department_id']) !== ''
            ? trim((string) $attributes['requested_department_id'])
            : null;

        if ($requestedDeptId !== null) {
            $deptExists = $this->scopeDirectory->query()
                ->where('scope_type', 'department')
                ->where('scope_id', $requestedDeptId)
                ->exists();

            if (! $deptExists) {
                throw ValidationException::withMessages([
                    'requested_department_id' => ['The selected department does not exist.'],
                ]);
            }
        }

        $email = isset($attributes['email']) && trim((string) $attributes['email']) !== ''
            ? strtolower(trim((string) $attributes['email']))
            : null;
        $mobile = isset($attributes['mobile']) && trim((string) $attributes['mobile']) !== ''
            ? trim((string) $attributes['mobile'])
            : null;

        $normalisedHandles = [];
        if ($email !== null) {
            $normalisedHandles[] = UserIdentifier::normalise($email, 'email');
        }
        if ($mobile !== null) {
            $normalisedHandles[] = UserIdentifier::normalise($mobile, 'mobile');
        }

        $existingUsers = User::query()
            ->whereHas('identifiers', fn ($q) => $q->whereIn('value_normalised', $normalisedHandles))
            ->get();

        if ($existingUsers->isNotEmpty()) {
            // Re-submission allowed only if a single matching account was rejected past cooldown
            if ($existingUsers->count() === 1) {
                /** @var User $existing */
                $existing = $existingUsers->first();
                if ($this->canResubmitRejected($existing)) {
                    DB::connection('tenant')->transaction(function () use ($existing, $attributes, $email, $mobile, $requestedDeptId, $ip): void {
                        $existing->forceFill([
                            'name' => trim((string) $attributes['name']),
                            'email' => $email,
                            'mobile' => $mobile,
                            'password' => Hash::make((string) $attributes['password']),
                            'must_change_password' => false,
                            'temporary_password_expires_at' => null,
                            'status' => 'pending',
                            'status_reason' => null,
                            'rejected_at' => null,
                        ])->save();

                        StaffProfile::updateOrCreate(
                            ['user_id' => $existing->id],
                            [
                                'requested_department_id' => $requestedDeptId,
                                'designation' => isset($attributes['designation']) ? trim((string) $attributes['designation']) : null,
                                'employee_id' => isset($attributes['employee_id']) ? trim((string) $attributes['employee_id']) : null,
                            ]
                        );

                        activity('identity')
                            ->event('staff.resubmitted')
                            ->performedOn($existing)
                            ->withProperties([
                                'target_user_id' => $existing->id,
                                'ip' => $ip,
                                'department_id' => $requestedDeptId,
                            ])
                            ->log("Rejected staff account [{$existing->name}] re-submitted registration.");
                    });
                }
            }

            // Always return silently to prevent account enumeration
            return;
        }

        DB::connection('tenant')->transaction(function () use ($attributes, $email, $mobile, $requestedDeptId, $ip): void {
            /** @var User $user */
            $user = User::create([
                'type' => 'staff',
                'name' => trim((string) $attributes['name']),
                'email' => $email,
                'mobile' => $mobile,
                'password' => Hash::make((string) $attributes['password']),
                'must_change_password' => false,
                'temporary_password_expires_at' => null,
                'status' => 'pending',
            ]);

            StaffProfile::create([
                'user_id' => $user->id,
                'requested_department_id' => $requestedDeptId,
                'designation' => isset($attributes['designation']) && trim((string) $attributes['designation']) !== ''
                    ? trim((string) $attributes['designation'])
                    : null,
                'employee_id' => isset($attributes['employee_id']) && trim((string) $attributes['employee_id']) !== ''
                    ? trim((string) $attributes['employee_id'])
                    : null,
            ]);

            activity('identity')
                ->event('staff.self_registered')
                ->performedOn($user)
                ->withProperties([
                    'target_user_id' => $user->id,
                    'ip' => $ip,
                    'tenant' => $this->tenantContext->tenant()->slug,
                    'department_id' => $requestedDeptId,
                ])
                ->log("Staff self-registration submitted for [{$user->name}].");
        });
    }

    public function isSelfRegistrationEnabled(): bool
    {
        try {
            /** @var TenantSetting|null $setting */
            $setting = TenantSetting::where('key', 'auth.staff_self_registration_enabled')->first();
            if ($setting === null) {
                return false;
            }
            $val = is_array($setting->value)
                ? ($setting->value['enabled'] ?? $setting->value['value'] ?? false)
                : $setting->value;

            return (bool) $val;
        } catch (\Throwable) {
            return false;
        }
    }

    public function dailyPendingCount(): int
    {
        return User::query()
            ->where('type', 'staff')
            ->where('status', 'pending')
            ->where('created_at', '>=', Carbon::now()->startOfDay())
            ->count();
    }

    public function dailyPendingCap(): int
    {
        try {
            /** @var TenantSetting|null $setting */
            $setting = TenantSetting::where('key', 'auth.staff_self_registration_daily_cap')->first();
            if ($setting !== null) {
                $raw = is_array($setting->value)
                    ? ($setting->value['cap'] ?? $setting->value['value'] ?? null)
                    : $setting->value;
                if (is_numeric($raw) && (int) $raw >= 1) {
                    return (int) $raw;
                }
            }
        } catch (\Throwable) {
            // Fall through to default
        }

        return self::DEFAULT_DAILY_CAP;
    }

    private function canResubmitRejected(User $user): bool
    {
        if ($user->status !== 'rejected' || $user->rejected_at === null) {
            return false;
        }

        $cooldownDays = self::DEFAULT_REJECTED_COOLDOWN_DAYS;
        try {
            /** @var TenantSetting|null $setting */
            $setting = TenantSetting::where('key', 'auth.rejected_resubmit_cooldown_days')->first();
            if ($setting !== null) {
                $raw = is_array($setting->value)
                    ? ($setting->value['days'] ?? $setting->value['value'] ?? null)
                    : $setting->value;
                if (is_numeric($raw) && (int) $raw >= 0) {
                    $cooldownDays = (int) $raw;
                }
            }
        } catch (\Throwable) {
            $cooldownDays = self::DEFAULT_REJECTED_COOLDOWN_DAYS;
        }

        return $user->rejected_at->copy()->addDays($cooldownDays)->lte(Carbon::now());
    }
}
