<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class CreateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'type' => ['required', 'string', 'in:staff,student,parent'],
            'name' => ['required', 'string', 'min:2', 'max:100'],
            'email' => ['nullable', 'email', 'max:150'],
            'mobile' => ['nullable', 'string', 'regex:/^[0-9+\-\s]{10,20}$/'],
            'registration_number' => ['nullable', 'string', 'regex:/^[a-zA-Z0-9\-_]{3,32}$/'],
            'password' => ['nullable', 'string', 'min:8'],
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
                $regNo = trim((string) ($this->input('registration_number') ?? ''));

                if ($email === '' && $mobile === '' && $regNo === '') {
                    $validator->errors()->add(
                        'email',
                        'At least one login identifier (email, mobile, or registration number) is required.'
                    );
                }
            },
        ];
    }
}
