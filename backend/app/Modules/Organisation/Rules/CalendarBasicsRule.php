<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class CalendarBasicsRule implements ValidationRule
{
    private const VALID_WEEKDAYS = [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
    ];

    /**
     * Run the validation rule.
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_array($value)) {
            $fail('The calendar_basics payload must be an object.');

            return;
        }

        // 1. Working days validation
        if (! isset($value['working_days']) || ! is_array($value['working_days'])) {
            $fail('The working_days field is required and must be an array.');

            return;
        }

        $workingDays = $value['working_days'];
        if (count($workingDays) < 1 || count($workingDays) > 7) {
            $fail('The working_days field must contain between 1 and 7 days.');

            return;
        }

        $normalizedDays = [];
        foreach ($workingDays as $day) {
            if (! is_string($day)) {
                $fail('Each item in working_days must be a string.');

                return;
            }
            $lower = strtolower(trim($day));
            if (! in_array($lower, self::VALID_WEEKDAYS, true)) {
                $fail("Invalid weekday [{$day}] specified in working_days.");

                return;
            }
            if (in_array($lower, $normalizedDays, true)) {
                $fail("Duplicate weekday [{$day}] found in working_days.");

                return;
            }
            $normalizedDays[] = $lower;
        }

        // 2. Periods per day validation
        if (! isset($value['periods_per_day']) || ! is_int($value['periods_per_day'])) {
            $fail('The periods_per_day field is required and must be an integer.');

            return;
        }

        $periodsPerDay = $value['periods_per_day'];
        if ($periodsPerDay < 1 || $periodsPerDay > 12) {
            $fail('The periods_per_day field must be between 1 and 12.');

            return;
        }

        // 3. Periods array validation
        if (! isset($value['periods']) || ! is_array($value['periods'])) {
            $fail('The periods field is required and must be an array.');

            return;
        }

        $periods = $value['periods'];
        if (count($periods) !== $periodsPerDay) {
            $fail('The number of periods defined ('.count($periods).") does not match periods_per_day ({$periodsPerDay}).");

            return;
        }

        $intervals = [];
        foreach ($periods as $idx => $period) {
            if (! is_array($period)) {
                $fail("Period at position {$idx} must be an object.");

                return;
            }

            if (! isset($period['index']) || ! is_int($period['index'])) {
                $fail("Period at position {$idx} must have an integer index.");

                return;
            }

            if (! isset($period['start']) || ! is_string($period['start']) || ! preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $period['start'])) {
                $fail("Period at position {$idx} must have a valid HH:MM start time.");

                return;
            }

            if (! isset($period['end']) || ! is_string($period['end']) || ! preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $period['end'])) {
                $fail("Period at position {$idx} must have a valid HH:MM end time.");

                return;
            }

            $startMinutes = $this->timeToMinutes($period['start']);
            $endMinutes = $this->timeToMinutes($period['end']);

            if ($startMinutes >= $endMinutes) {
                $fail("Period {$period['index']} start time ({$period['start']}) must be strictly earlier than end time ({$period['end']}).");

                return;
            }

            $intervals[] = [
                'index' => $period['index'],
                'start' => $startMinutes,
                'end' => $endMinutes,
                'start_str' => $period['start'],
                'end_str' => $period['end'],
            ];
        }

        // Check for chronological ordering and overlapping time ranges
        usort($intervals, fn (array $a, array $b) => $a['start'] <=> $b['start']);

        for ($i = 0; $i < count($intervals) - 1; $i++) {
            $curr = $intervals[$i];
            $next = $intervals[$i + 1];

            if ($curr['end'] > $next['start']) {
                $fail("Periods overlap: period {$curr['index']} ({$curr['start_str']}-{$curr['end_str']}) overlaps with period {$next['index']} ({$next['start_str']}-{$next['end_str']}).");

                return;
            }
        }
    }

    private function timeToMinutes(string $time): int
    {
        [$hours, $minutes] = explode(':', $time);

        return ((int) $hours * 60) + (int) $minutes;
    }
}
