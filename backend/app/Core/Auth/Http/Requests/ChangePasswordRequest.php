<?php

declare(strict_types=1);

namespace App\Core\Auth\Http\Requests;

use App\Core\Auth\Rules\PasswordPolicyRule;
use Illuminate\Foundation\Http\FormRequest;

class ChangePasswordRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string', 'max:128'],
            'new_password' => ['required', 'string', new PasswordPolicyRule],
        ];
    }
}
