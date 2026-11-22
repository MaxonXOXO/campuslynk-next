<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class AppointPrincipalRequest extends FormRequest
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
            'user_id' => ['nullable', 'string'],
            'new_user' => ['nullable', 'array'],
            'new_user.name' => ['required_with:new_user', 'string', 'min:2', 'max:100'],
            'new_user.email' => ['nullable', 'email', 'max:150'],
            'new_user.mobile' => ['nullable', 'string', 'regex:/^[0-9+\-\s]{10,20}$/'],
            'new_user.registration_number' => ['nullable', 'string', 'regex:/^[a-zA-Z0-9\-_]{3,32}$/'],
            'order_record' => ['nullable', 'string', 'max:255'],
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $userId = trim((string) ($this->input('user_id') ?? ''));
                $newUser = $this->input('new_user');
                $hasNewUser = is_array($newUser) && $newUser !== [];

                if ($userId === '' && ! $hasNewUser) {
                    $validator->errors()->add('user_id', 'Either user_id or new_user must be provided.');

                    return;
                }

                if ($userId !== '' && $hasNewUser) {
                    $validator->errors()->add('user_id', 'Provide either user_id or new_user, not both.');

                    return;
                }

                if ($hasNewUser) {
                    $email = trim((string) ($newUser['email'] ?? ''));
                    $mobile = trim((string) ($newUser['mobile'] ?? ''));
                    $regNo = trim((string) ($newUser['registration_number'] ?? ''));

                    if ($email === '' && $mobile === '' && $regNo === '') {
                        $validator->errors()->add(
                            'new_user.email',
                            'At least one login identifier (email, mobile, or registration number) is required.'
                        );
                    }
                }
            },
        ];
    }
}
