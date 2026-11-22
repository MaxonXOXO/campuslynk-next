<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateDepartmentRequest extends FormRequest
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
            'name' => ['sometimes', 'string', 'max:255'],
            'kind' => ['sometimes', 'string', 'in:academic,general,administrative'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
