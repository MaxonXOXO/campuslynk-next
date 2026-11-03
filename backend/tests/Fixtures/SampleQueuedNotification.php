<?php

declare(strict_types=1);

namespace Tests\Fixtures;

use App\Core\Tenancy\Models\TenantSetting;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SampleQueuedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * @return array<string>
     */
    public function via(mixed $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(mixed $notifiable): MailMessage
    {
        TenantSetting::updateOrCreate(
            ['key' => 'auth.token_lifetime_web_hours'],
            ['value' => ['hours' => 4]]
        );

        return (new MailMessage)
            ->subject('Tenant Notification Test')
            ->line('Notification content');
    }
}
