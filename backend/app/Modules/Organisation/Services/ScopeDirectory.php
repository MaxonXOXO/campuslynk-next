<?php

declare(strict_types=1);

namespace App\Modules\Organisation\Services;

use App\Modules\Organisation\Contracts\ScopeDirectoryContract;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

final class ScopeDirectory implements ScopeDirectoryContract
{
    public function query(): Builder
    {
        $connection = DB::connection('tenant');
        $root = '(SELECT scope_label FROM institution ORDER BY id LIMIT 1)';

        $institution = $connection->table('institution')->selectRaw(
            "'institution' AS scope_type, id AS scope_id, scope_label, scope_label::ltree AS home_path, scope_label::ltree AS managing_path"
        );

        $streams = $connection->table('streams')->selectRaw(
            "'stream' AS scope_type, id AS scope_id, scope_label, concat_ws('.', {$root}, scope_label)::ltree AS home_path, concat_ws('.', {$root}, scope_label)::ltree AS managing_path"
        );

        $departments = $connection->table('departments')
            ->join('streams', 'streams.id', '=', 'departments.stream_id')
            ->selectRaw(
                "'department' AS scope_type, departments.id AS scope_id, departments.scope_label, concat_ws('.', {$root}, streams.scope_label, departments.scope_label)::ltree AS home_path, concat_ws('.', {$root}, streams.scope_label, departments.scope_label)::ltree AS managing_path"
            );

        $batches = $connection->table('batches')->selectRaw(
            "'batch' AS scope_type, id AS scope_id, scope_label, home_path, managing_path"
        );

        $subBatches = $connection->table('sub_batches')->selectRaw(
            "'sub_batch' AS scope_type, id AS scope_id, scope_label, home_path, managing_path"
        );

        $workshops = $connection->table('workshop_sections')->selectRaw(
            "'workshop_section' AS scope_type, id AS scope_id, scope_label, concat_ws('.', {$root}, scope_label)::ltree AS home_path, concat_ws('.', {$root}, scope_label)::ltree AS managing_path"
        );

        return $connection->query()->fromSub(
            $institution->unionAll($streams)->unionAll($departments)
                ->unionAll($batches)->unionAll($subBatches)->unionAll($workshops),
            'scopes'
        );
    }
}
