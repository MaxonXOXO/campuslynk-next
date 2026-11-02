<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

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
}
