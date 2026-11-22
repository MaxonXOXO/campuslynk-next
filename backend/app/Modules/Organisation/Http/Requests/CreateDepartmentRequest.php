<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CreateDepartmentRequest extends FormRequest
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
            'code' => ['required', 'string', 'max:16'],
            'name' => ['required', 'string', 'max:255'],
            'stream_id' => ['required', 'string', 'max:36'],
            'kind' => ['nullable', 'string', 'in:academic,general,administrative'],
        ];
    }
}
