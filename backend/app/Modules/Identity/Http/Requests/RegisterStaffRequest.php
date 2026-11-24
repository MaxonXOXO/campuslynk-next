<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Requests;

use App\Modules\Identity\Rules\PasswordPolicyRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class RegisterStaffRequest extends FormRequest
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
            'name' => ['required', 'string', 'min:2', 'max:100'],
            'email' => ['nullable', 'email', 'max:150'],
            'mobile' => ['nullable', 'string', 'regex:/^[0-9+\-\s]{10,20}$/'],
            'password' => ['required', 'string', new PasswordPolicyRule],
            'requested_department_id' => ['nullable', 'string', 'size:26'],
            'designation' => ['nullable', 'string', 'max:100'],
            'employee_id' => ['nullable', 'string', 'max:64'],
            'website' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $email = trim((string) ($this->input('email') ?? ''));
                $mobile = trim((string) ($this->input('mobile') ?? ''));

                if ($email === '' && $mobile === '') {
                    $validator->errors()->add(
                        'email',
                        'At least one contact identifier (email or mobile) is required.'
                    );
                }
            },
        ];
    }
}
