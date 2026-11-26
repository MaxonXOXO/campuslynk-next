<?php

declare(strict_types=1);

namespace App\Modules\Identity\Actions;

use App\Modules\Identity\Models\RoleAssignment;
use App\Modules\Identity\Models\User;
use App\Modules\Identity\Services\AuditPropertyRedactor;
use Illuminate\Support\Facades\DB;

final class ListAuditLogsAction
{
    public const DEFAULT_PER_PAGE = 25;

    public const MAX_PER_PAGE = 100;

    /** @var list<string> */
    private const PRINCIPAL_ALLOWED_LOGS = ['identity', 'organisation', 'rbac'];

    /**
     * @param array{
     *     log_name?: string|null,
     *     event?: string|null,
     *     causer_id?: string|null,
     *     from?: string|null,
     *     to?: string|null,
     *     search?: string|null,
     *     page?: int,
     *     per_page?: int
     * } $filters
     * @return array{
     *     data: list<array<string, mixed>>,
     *     meta: array{current_page: int, last_page: int, per_page: int, total: int}
     * }
     */
    public function execute(User $actor, array $filters): array
    {
        $isSuperAdmin = RoleAssignment::query()
            ->where('user_id', $actor->id)
            ->where('scope_type', 'institution')
            ->whereRaw('is_active IS TRUE')
            ->whereHas('role', fn ($q) => $q->where('key', 'super_admin'))
            ->exists();

        $perPage = min(
            max((int) ($filters['per_page'] ?? self::DEFAULT_PER_PAGE), 1),
            self::MAX_PER_PAGE
        );
        $page = max((int) ($filters['page'] ?? 1), 1);

        $query = DB::connection('tenant')
            ->table('activity_log')
            ->leftJoin('users', 'users.id', '=', 'activity_log.causer_id')
            ->select([
                'activity_log.id',
                'activity_log.log_name',
                'activity_log.event',
                'activity_log.description',
                'activity_log.subject_type',
                'activity_log.subject_id',
                'activity_log.causer_id',
                'users.name as causer_name',
                'users.email as causer_email',
                'activity_log.properties',
                'activity_log.created_at',
            ]);

        if (! $isSuperAdmin) {
            $query->whereIn('activity_log.log_name', self::PRINCIPAL_ALLOWED_LOGS);
        }

        if (isset($filters['log_name']) && trim($filters['log_name']) !== '') {
            $query->where('activity_log.log_name', trim($filters['log_name']));
        }

        if (isset($filters['event']) && trim($filters['event']) !== '') {
            $query->where('activity_log.event', trim($filters['event']));
        }

        if (isset($filters['causer_id']) && trim($filters['causer_id']) !== '') {
            $query->where('activity_log.causer_id', trim($filters['causer_id']));
        }

        if (isset($filters['from']) && trim($filters['from']) !== '') {
            $query->where('activity_log.created_at', '>=', trim($filters['from']));
        }

        if (isset($filters['to']) && trim($filters['to']) !== '') {
            $query->where('activity_log.created_at', '<=', trim($filters['to']));
        }

        // Search matches ONLY event, log_name, and causer's name — never LIKE over JSON properties.
        if (isset($filters['search']) && trim($filters['search']) !== '') {
            $needle = '%'.str_replace(['%', '_'], ['\\%', '\\_'], trim($filters['search'])).'%';
            $query->where(function ($q) use ($needle): void {
                $q->where('activity_log.event', 'ILIKE', $needle)
                    ->orWhere('activity_log.log_name', 'ILIKE', $needle)
                    ->orWhere('users.name', 'ILIKE', $needle);
            });
        }

        $total = (int) (clone $query)->count();
        $lastPage = max((int) ceil($total / $perPage), 1);

        $rows = $query
            ->orderByDesc('activity_log.created_at')
            ->orderByDesc('activity_log.id')
            ->forPage($page, $perPage)
            ->get();

        $items = [];
        foreach ($rows as $row) {
            $decoded = is_string($row->properties) ? json_decode($row->properties, true) : $row->properties;
            /** @var array<string, mixed> $props */
            $props = is_array($decoded) ? $decoded : [];

            $items[] = [
                'id' => (string) $row->id,
                'log_name' => $row->log_name !== null ? (string) $row->log_name : null,
                'event' => $row->event !== null ? (string) $row->event : null,
                'description' => (string) $row->description,
                'subject_type' => $row->subject_type !== null ? (string) $row->subject_type : null,
                'subject_id' => $row->subject_id !== null ? (string) $row->subject_id : null,
                'causer_id' => $row->causer_id !== null ? (string) $row->causer_id : null,
                'causer_name' => $row->causer_name !== null ? (string) $row->causer_name : null,
                'causer_email' => $row->causer_email !== null ? (string) $row->causer_email : null,
                'properties' => AuditPropertyRedactor::redact($props),
                'created_at' => $row->created_at !== null ? (string) $row->created_at : null,
            ];
        }

        return [
            'data' => $items,
            'meta' => [
                'current_page' => $page,
                'last_page' => $lastPage,
                'per_page' => $perPage,
                'total' => $total,
            ],
        ];
    }
}
