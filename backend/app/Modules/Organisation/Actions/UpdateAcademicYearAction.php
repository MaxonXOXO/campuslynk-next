<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Modules\Organisation\Models\AcademicYear;
use Carbon\Carbon;

class UpdateAcademicYearAction
{
    /**
     * @param array{
     *     label?: string,
     *     start_date?: Carbon,
     *     end_date?: Carbon,
     *     is_current?: bool
     * } $attributes
     */
    public function execute(AcademicYear $year, array $attributes): AcademicYear
    {
        if (! empty($attributes['is_current'])) {
            AcademicYear::where('id', '!=', $year->id)
                ->whereRaw('is_current is true')
                ->update(['is_current' => false]);
        }

        $year->fill($attributes);
        $year->save();

        return $year;
    }
}
