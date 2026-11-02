<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateUserRequest extends FormRequest
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
            'name' => ['sometimes', 'string', 'min:2', 'max:100'],
            'email' => ['sometimes', 'nullable', 'email', 'max:150'],
            'mobile' => ['sometimes', 'nullable', 'string', 'regex:/^[0-9+\-\s]{10,20}$/'],
            'status' => ['sometimes', 'string', 'in:active,suspended,pending'],
        ];
    }
}
