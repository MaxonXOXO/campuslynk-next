<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ImpersonateRequest extends FormRequest
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
            'user_id' => ['required', 'string'],
            'ticket' => ['required', 'string', 'min:3', 'max:64'],
            'reason' => ['required', 'string', 'min:5', 'max:255'],
        ];
    }
}
