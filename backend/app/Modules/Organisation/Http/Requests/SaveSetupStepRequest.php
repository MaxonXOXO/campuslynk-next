<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Http\Requests;

use App\Core\Http\ProblemDetails;
use App\Core\Validation\JsonSchemaValidator;
use App\Modules\Organisation\Rules\CalendarBasicsRule;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Translation\PotentiallyTranslatedString;
use Symfony\Component\HttpFoundation\Response;

class SaveSetupStepRequest extends FormRequest
{
    public const VALID_STEPS = [
        'institution_profile' => 'institution-profile.schema.json',
        'calendar_basics' => 'calendar-basics.schema.json',
        'signup_policy' => 'signup-policy.schema.json',
    ];

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $step = (string) $this->route('step');
        if (! array_key_exists($step, self::VALID_STEPS)) {
            throw new HttpResponseException(
                ProblemDetails::response(
                    title: 'Not Found',
                    detail: "Setup step [{$step}] not found.",
                    status: Response::HTTP_NOT_FOUND,
                    type: ProblemDetails::type('not-found')
                )
            );
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }

    /**
     * Additional validation against JSON Schema and custom domain rules.
     */
    public function withValidator(Validator $validator): void
    {
        $step = (string) $this->route('step');
        if (! array_key_exists($step, self::VALID_STEPS)) {
            return;
        }

        $schemaFile = self::VALID_STEPS[$step];
        /** @var array<string, mixed> $payload */
        $payload = $this->all();

        $validator->after(function (Validator $v) use ($step, $schemaFile, $payload): void {
            /** @var JsonSchemaValidator $jsonValidator */
            $jsonValidator = app(JsonSchemaValidator::class);
            $result = $jsonValidator->validate($payload, $schemaFile);

            if (! $result->isValid()) {
                foreach ($result->errors() as $key => $message) {
                    $v->errors()->add($key, $message);
                }
            }

            if ($step === 'calendar_basics') {
                $calendarRule = new CalendarBasicsRule;
                $calendarRule->validate('calendar_basics', $payload, function (string $message) use ($v): PotentiallyTranslatedString {
                    $v->errors()->add('calendar_basics', $message);

                    return new PotentiallyTranslatedString($message, app('translator'));
                });
            }
        });
    }

    protected function failedValidation(Validator $validator): void
    {
        throw new HttpResponseException(
            ProblemDetails::response(
                title: 'Unprocessable Content',
                detail: 'The given data was invalid: '.implode(' ', $validator->errors()->all()),
                status: Response::HTTP_UNPROCESSABLE_ENTITY,
                type: ProblemDetails::type('unprocessable'),
                errors: $validator->errors()->toArray()
            )
        );
    }
}
