<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Requests;

use App\Core\Http\ProblemDetails;
use App\Modules\Organisation\Models\Stream;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Symfony\Component\HttpFoundation\Response;

class CreateStreamRequest extends FormRequest
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
            'code' => [
                'required',
                'string',
                'max:32',
                'regex:/^[A-Za-z0-9]+([_-][A-Za-z0-9]+)*$/',
            ],
            'name' => [
                'required',
                'string',
                'min:1',
                'max:100',
            ],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v): void {
            $code = $this->input('code');
            if (is_string($code) && trim($code) !== '') {
                if (Stream::where('code', trim($code))->exists()) {
                    $v->errors()->add('code', 'The code has already been taken.');
                }
            }
        });
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
