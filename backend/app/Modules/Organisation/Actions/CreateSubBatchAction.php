<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Actions;

use App\Modules\Identity\Services\ScopeAuthorizer;
use App\Modules\Organisation\Models\Batch;
use App\Modules\Organisation\Models\SubBatch;
use Illuminate\Support\Str;

class CreateSubBatchAction
{
    public function execute(
        Batch $batch,
        string $kind,
        string $name,
        ?string $courseOfferingId = null
    ): SubBatch {
        $randomSuffix = strtolower(Str::random(6));
        $cleanName = (string) preg_replace('/[^a-zA-Z0-9_]/', '_', strtolower($name));
        $scopeLabel = 'sb_'.substr($cleanName, 0, 20).'_'.$randomSuffix;
        ScopeAuthorizer::validateScopeLabel($scopeLabel);

        $homePath = "{$batch->home_path}.{$scopeLabel}";
        $managingPath = "{$batch->managing_path}.{$scopeLabel}";

        /** @var SubBatch $subBatch */
        $subBatch = SubBatch::create([
            'batch_id' => $batch->id,
            'kind' => $kind,
            'name' => $name,
            'course_offering_id' => $courseOfferingId,
            'scope_label' => $scopeLabel,
            'home_path' => $homePath,
            'managing_path' => $managingPath,
        ]);

        return $subBatch;
    }
}
