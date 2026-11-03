<?php

declare(strict_types=1);

namespace App\Core\Validation;

use InvalidArgumentException;

class JsonSchemaValidator
{
    /**
     * Validate an associative data array against a JSON schema file.
     *
     * @param  array<string, mixed>|string  $data
     */
    public function validate(array|string $data, string $schemaPath): JsonSchemaValidationResult
    {
        $payload = is_string($data) ? json_decode($data, true) : $data;

        if (! is_array($payload)) {
            return new JsonSchemaValidationResult(false, ['root' => 'Payload must be a valid JSON object.']);
        }

        $resolvedPath = $this->resolveSchemaPath($schemaPath);
        if (! file_exists($resolvedPath)) {
            return new JsonSchemaValidationResult(false, [
                '_schema' => "Schema file not found: [{$schemaPath}].",
            ]);
        }

        $schemaContent = (string) file_get_contents($resolvedPath);
        /** @var array<string, mixed>|null $schema */
        $schema = json_decode($schemaContent, true);

        if (! is_array($schema)) {
            return new JsonSchemaValidationResult(false, [
                '_schema' => "Schema file at [{$resolvedPath}] contains invalid JSON.",
            ]);
        }

        $errors = $this->validateObject($payload, $schema, '');

        return new JsonSchemaValidationResult(empty($errors), $errors);
    }

    /**
     * Validate data and throw an InvalidArgumentException on failure.
     *
     * @param  array<string, mixed>|string  $data
     * @return array<string, mixed>
     *
     * @throws InvalidArgumentException
     */
    public function validateOrFail(array|string $data, string $schemaPath): array
    {
        $result = $this->validate($data, $schemaPath);

        if (! $result->isValid()) {
            $formatted = implode(', ', array_map(
                fn (string $k, string $v) => "{$k}: {$v}",
                array_keys($result->errors()),
                $result->errors()
            ));

            throw new InvalidArgumentException("JSON Schema validation failed: {$formatted}");
        }

        return is_string($data) ? (array) json_decode($data, true) : $data;
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $schema
     * @return array<string, string>
     */
    protected function validateObject(array $data, array $schema, string $pathPrefix): array
    {
        $errors = [];

        // 1. Required keys
        if (isset($schema['required']) && is_array($schema['required'])) {
            foreach ($schema['required'] as $requiredKey) {
                if (! array_key_exists($requiredKey, $data) || $data[$requiredKey] === null) {
                    $keyPath = $pathPrefix !== '' ? "{$pathPrefix}.{$requiredKey}" : (string) $requiredKey;
                    $errors[$keyPath] = "Field [{$keyPath}] is required.";
                }
            }
        }

        // 2. Additional properties
        if (isset($schema['additionalProperties']) && $schema['additionalProperties'] === false) {
            $allowedProperties = isset($schema['properties']) && is_array($schema['properties'])
                ? array_keys($schema['properties'])
                : [];

            foreach (array_keys($data) as $providedKey) {
                if (! in_array($providedKey, $allowedProperties, true)) {
                    $keyPath = $pathPrefix !== '' ? "{$pathPrefix}.{$providedKey}" : (string) $providedKey;
                    $errors[$keyPath] = "Additional property [{$keyPath}] is not permitted.";
                }
            }
        }

        // 3. Properties validation
        $properties = isset($schema['properties']) && is_array($schema['properties']) ? $schema['properties'] : [];
        foreach ($data as $key => $value) {
            if (! isset($properties[$key]) || ! is_array($properties[$key])) {
                continue;
            }

            $propSchema = $properties[$key];
            $keyPath = $pathPrefix !== '' ? "{$pathPrefix}.{$key}" : (string) $key;

            if ($value === null) {
                continue;
            }

            // Type check
            if (isset($propSchema['type'])) {
                $type = $propSchema['type'];
                if ($type === 'string' && ! is_string($value)) {
                    $errors[$keyPath] = "Field [{$keyPath}] must be a string.";

                    continue;
                }
                if ($type === 'integer' && ! is_int($value)) {
                    $errors[$keyPath] = "Field [{$keyPath}] must be an integer.";

                    continue;
                }
                if ($type === 'boolean' && ! is_bool($value)) {
                    $errors[$keyPath] = "Field [{$keyPath}] must be a boolean.";

                    continue;
                }
                if ($type === 'array' && ! is_array($value)) {
                    $errors[$keyPath] = "Field [{$keyPath}] must be an array.";

                    continue;
                }
                if ($type === 'object') {
                    if (! is_array($value) || array_is_list($value)) {
                        $errors[$keyPath] = "Field [{$keyPath}] must be an object.";

                        continue;
                    }

                    // Recursive object validation
                    /** @var array<string, mixed> $value */
                    $nestedErrors = $this->validateObject($value, $propSchema, $keyPath);
                    $errors = array_merge($errors, $nestedErrors);

                    continue;
                }
            }

            // String patterns and lengths
            if (is_string($value)) {
                if (isset($propSchema['pattern'])) {
                    $cleaned = str_replace(['\/', '#'], ['/', '\#'], (string) $propSchema['pattern']);
                    $pattern = '#'.$cleaned.'#';
                    if (! preg_match($pattern, $value)) {
                        $errors[$keyPath] = "Field [{$keyPath}] does not match required pattern.";
                    }
                }

                if (isset($propSchema['maxLength']) && mb_strlen($value) > $propSchema['maxLength']) {
                    $errors[$keyPath] = "Field [{$keyPath}] exceeds maximum length of {$propSchema['maxLength']}.";
                }

                if (isset($propSchema['minLength']) && mb_strlen($value) < $propSchema['minLength']) {
                    $errors[$keyPath] = "Field [{$keyPath}] must be at least {$propSchema['minLength']} characters.";
                }

                if (isset($propSchema['enum']) && is_array($propSchema['enum'])) {
                    if (! in_array($value, $propSchema['enum'], true)) {
                        $errors[$keyPath] = "Field [{$keyPath}] must be one of: ".implode(', ', $propSchema['enum']).'.';
                    }
                }
            }
        }

        return $errors;
    }

    protected function resolveSchemaPath(string $schemaPath): string
    {
        if (file_exists($schemaPath)) {
            return $schemaPath;
        }

        // Relative to contracts directory
        $candidate = realpath(__DIR__.'/../../../../contracts/json-schemas/'.ltrim($schemaPath, '/'));
        if ($candidate && file_exists($candidate)) {
            return $candidate;
        }

        return $schemaPath;
    }
}
