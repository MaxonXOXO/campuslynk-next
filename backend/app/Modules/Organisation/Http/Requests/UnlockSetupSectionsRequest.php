<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Requests;

use App\Modules\Organisation\Actions\UnlockSetupSectionsAction;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UnlockSetupSectionsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'sections' => ['required', 'array', 'min:1'],
            'sections.*' => ['required', 'string', 'distinct', Rule::in(UnlockSetupSectionsAction::LOCKABLE_SECTIONS)],
            'reason' => ['required', 'string', 'min:5', 'max:500'],
        ];
    }
}
