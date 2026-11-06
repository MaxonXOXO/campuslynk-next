<?php

declare(strict_types=1);

namespace App\Core\Tenancy\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Throwable;

class LandlordMigrateCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'landlord:migrate';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Run pending landlord migrations across the central landlord database';

    public function handle(): int
    {
        $this->info('Running landlord schema migrations...');

        try {
            $exitCode = Artisan::call('migrate', [
                '--database' => 'pgsql_admin',
                '--path' => 'database/migrations/landlord',
                '--force' => true,
            ]);

            $output = Artisan::output();
            if ($exitCode !== 0) {
                $this->error("Landlord migrations failed with code {$exitCode}:\n{$output}");

                return self::FAILURE;
            }

            $this->line(trim($output));
            $this->info('Landlord migrations executed successfully.');

            return self::SUCCESS;
        } catch (Throwable $e) {
            $this->error("Failed to run landlord migrations: {$e->getMessage()}");

            return self::FAILURE;
        }
    }
}
