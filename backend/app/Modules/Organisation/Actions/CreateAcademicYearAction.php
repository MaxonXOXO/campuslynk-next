<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Modules\Organisation\Models\AcademicYear;
use Carbon\Carbon;

final class CreateAcademicYearAction
{
    public function execute(
        string $label,
        Carbon $startDate,
        Carbon $endDate,
        bool $isCurrent = false
    ): AcademicYear {
        if ($isCurrent) {
            AcademicYear::whereRaw('is_current is true')->update(['is_current' => false]);
        }

        /** @var AcademicYear $year */
        $year = AcademicYear::create([
            'label' => $label,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'is_current' => $isCurrent,
        ]);

        return $year;
    }
}
