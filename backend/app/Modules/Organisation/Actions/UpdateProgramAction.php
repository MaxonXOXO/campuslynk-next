<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Modules\Organisation\Models\Program;

class UpdateProgramAction
{
    /**
     * @param array{
     *     name?: string,
     *     duration_semesters?: int
     * } $attributes
     */
    public function execute(Program $program, array $attributes): Program
    {
        $program->fill($attributes);
        $program->save();

        return $program;
    }
}
