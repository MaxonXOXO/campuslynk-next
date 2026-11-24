<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Requests;

use App\Modules\Identity\Rules\PasswordPolicyRule;
use Illuminate\Foundation\Http\FormRequest;

class CommitStaffImportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'common_password' => ['required', 'string', new PasswordPolicyRule],
            'auto_approve' => ['sometimes', 'boolean'],
            'idempotency_key' => ['nullable', 'string', 'max:100'],
        ];
    }
}
