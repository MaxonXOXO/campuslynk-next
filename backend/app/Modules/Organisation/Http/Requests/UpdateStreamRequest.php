<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Requests;

use App\Core\Http\ProblemDetails;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Symfony\Component\HttpFoundation\Response;

class UpdateStreamRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'name' => [
                'required',
                'string',
                'min:1',
                'max:100',
            ],
            'code' => [
                'sometimes',
                'string',
            ],
        ];
    }

    /**
     * Return RFC 7807 problem+json on validation failure.
     */
    protected function failedValidation(Validator $validator): void
    {
        $response = ProblemDetails::response(
            title: 'Unprocessable Content',
            detail: 'The given data was invalid.',
            status: Response::HTTP_UNPROCESSABLE_ENTITY,
            type: ProblemDetails::type('unprocessable'),
            errors: $validator->errors()->toArray()
        );

        throw new HttpResponseException($response);
    }
}
