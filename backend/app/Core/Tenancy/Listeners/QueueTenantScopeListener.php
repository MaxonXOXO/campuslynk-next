<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Listeners;

use App\Core\Tenancy\Contracts\LandlordJobContract;
use App\Core\Tenancy\Contracts\TenantAwareJobContract;
use App\Core\Tenancy\Exceptions\MissingTenantContextException;
use App\Core\Tenancy\Models\Tenant;
use App\Core\Tenancy\TenantContext;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Queue\Events\JobFailed;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Queue\Events\JobProcessing;

class QueueTenantScopeListener
{
    public function __construct(
        protected TenantContext $tenantContext
    ) {}

    /**
     * Register the listeners for the subscriber.
     */
    public function subscribe(Dispatcher $events): void
    {
        $events->listen(JobProcessing::class, [$this, 'handleJobProcessing']);
        $events->listen(JobProcessed::class, [$this, 'handleJobProcessed']);
        $events->listen(JobFailed::class, [$this, 'handleJobFailed']);
    }

    /**
     * Handle queue JobProcessing event to enforce tenant context or fail closed.
     *
     * @throws MissingTenantContextException
     */
    public function handleJobProcessing(JobProcessing $event): void
    {
        $command = $this->resolveJobCommand($event);

        // 1. Explicit Landlord jobs are permitted without tenant context
        if ($command instanceof LandlordJobContract) {
            return;
        }

        // 2. Tenant aware jobs must provide a valid tenant context
        if ($command instanceof TenantAwareJobContract) {
            $tenantId = $command->getTenantId();

            $tenant = Tenant::with(['database', 'license'])->find($tenantId);

            if ($tenant === null) {
                throw new MissingTenantContextException(sprintf(
                    'Tenant [%s] specified in queued job could not be found.',
                    $tenantId
                ));
            }

            $this->tenantContext->setTenant($tenant);

            return;
        }

        // 3. Fail closed on any unrecognized job without tenant context
        throw new MissingTenantContextException(sprintf(
            'Queued job [%s] does not implement LandlordJobContract or TenantAwareJobContract.',
            $event->job->resolveName()
        ));
    }

    /**
     * Handle queue JobProcessed event to teardown tenant context.
     */
    public function handleJobProcessed(JobProcessed $event): void
    {
        $this->tenantContext->forget();
    }

    /**
     * Handle queue JobFailed event to teardown tenant context.
     */
    public function handleJobFailed(JobFailed $event): void
    {
        $this->tenantContext->forget();
    }

    /**
     * Safely extract the queued command from job payload.
     */
    protected function resolveJobCommand(JobProcessing $event): mixed
    {
        $payload = $event->job->payload();

        $command = $payload['data']['command'] ?? null;

        if (is_string($command)) {
            return unserialize($command);
        }

        return null;
    }
}
