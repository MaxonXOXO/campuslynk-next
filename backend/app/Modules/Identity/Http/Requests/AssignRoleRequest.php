<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AssignRoleRequest extends FormRequest
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
            'role_key' => ['required', 'string'],
            'scope_type' => ['required', 'string', 'in:institution,stream,department,batch,sub_batch,course_offering,workshop_section,own'],
            'scope_label' => ['required', 'string'],
            'scope_id' => ['nullable', 'string'],
            'order_record' => ['nullable', 'string', 'max:255'],
            'valid_from' => ['nullable', 'date'],
            'valid_to' => ['nullable', 'date', 'after:valid_from'],
        ];
    }
}
