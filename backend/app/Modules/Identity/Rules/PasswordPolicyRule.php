<?php

declare(strict_types=1);

namespace App\Modules\Identity\Rules;

use App\Core\Tenancy\TenantContext;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\DB;
use Illuminate\Translation\PotentiallyTranslatedString;

class PasswordPolicyRule implements ValidationRule
{
    /**
     * Local list of top common / breached passwords to reject (no composition theatre).
     *
     * @var array<string>
     */
    protected const COMMON_PASSWORDS = [
        'password',
        'password123',
        'password1234',
        'admin123',
        'admin1234',
        'administrator',
        '12345678',
        '123456789',
        '1234567890',
        'qwertyuiop',
        'polytechnic',
        'campuslynk',
        'academic123',
        'welcome123',
        'welcome2026',
        'letmein123',
        'changeme',
        'changeme123',
        'iloveyou',
        'monkey123',
        'dragon123',
        'master123',
        'football',
        'superadmin',
        'superadmin123',
        'secret123',
        'test1234',
        'default123',
    ];

    public function __construct(
        protected ?TenantContext $tenantContext = null
    ) {}

    /**
     * Run the validation rule.
     *
     * @param  Closure(string, ?string=): PotentiallyTranslatedString  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value)) {
            $fail('The password must be a string.');

            return;
        }

        $length = strlen($value);

        // 1. Length constraint: minimum 8 characters, maximum 128 characters
        if ($length < 8) {
            $fail('The password must be at least 8 characters in length.');

            return;
        }

        if ($length > 128) {
            $fail('The password must not exceed 128 characters.');

            return;
        }

        // 2. Reject trivial repeating characters (e.g. 'aaaaaaaa')
        if (preg_match('/^(.)\1+$/', $value)) {
            $fail('The password is too simple and easily guessed.');

            return;
        }

        // 3. Reject common / breached passwords
        $lower = strtolower($value);
        if (in_array($lower, self::COMMON_PASSWORDS, true)) {
            $fail('This password is on a known list of breached or common passwords. Please choose a more secure password.');

            return;
        }

        // 4. Reject institutional terms dynamically derived from tenant slug/name (ADR-0011 / ADR-0015)
        $dynamicBanned = $this->getDynamicBannedTerms();
        if (in_array($lower, $dynamicBanned, true)) {
            $fail('This password contains institutional or college terms that are easily guessed. Please choose a more secure password.');
        }
    }

    /**
     * Resolve dynamic banned terms from the tenant's institution name and slug.
     *
     * @return list<string>
     */
    public function getDynamicBannedTerms(): array
    {
        $terms = [];
        $slug = null;
        $name = null;

        // Try landlord tenant context
        $context = $this->tenantContext ?? (app()->bound(TenantContext::class) ? app(TenantContext::class) : null);
        if ($context !== null) {
            $tenant = $context->getTenant();
            if ($tenant !== null) {
                $slug = $tenant->slug;
                $name = $tenant->name;
            }
        }

        // Try tenant institution table if name/slug not yet resolved
        if ($slug === null) {
            try {
                /** @var object{name: string, code: string}|null $inst */
                $inst = DB::connection('tenant')->table('institution')->first();
                if ($inst !== null) {
                    $name = $inst->name;
                    $slug = strtolower($inst->code);
                }
            } catch (\Throwable) {
                // Not in a tenant context or unmigrated
            }
        }

        if ($slug !== null && trim($slug) !== '') {
            $cleanSlug = strtolower(trim($slug));
            $terms[] = $cleanSlug;
            $terms[] = $cleanSlug.'123';
            $terms[] = $cleanSlug.'1234';
            $terms[] = $cleanSlug.'2026';
            $terms[] = $cleanSlug.'2027';
        }

        if ($name !== null && trim($name) !== '') {
            $words = preg_split('/[\s\-_]+/', strtolower(trim($name)));
            if (is_array($words)) {
                foreach ($words as $word) {
                    if (strlen($word) >= 3) {
                        $terms[] = $word;
                        $terms[] = $word.'123';
                        $terms[] = $word.'1234';
                        $terms[] = $word.'2026';
                        $terms[] = $word.'2027';
                    }
                }
            }
        }

        return array_values(array_unique($terms));
    }
}
