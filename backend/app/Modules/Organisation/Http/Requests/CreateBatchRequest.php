<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CreateBatchRequest extends FormRequest
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
            'program_id' => ['required', 'string'],
            'home_department_id' => ['required', 'string'],
            'academic_year_id' => ['required', 'string'],
            'regulation_id' => ['required', 'string'],
            'name' => ['required', 'string', 'min:3', 'max:100'],
            'entry_type' => ['sometimes', 'string', 'in:regular,lateral'],
            'current_semester' => ['sometimes', 'integer', 'between:1,6'],
        ];
    }
}
