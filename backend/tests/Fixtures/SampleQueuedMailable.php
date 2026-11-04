<?php

declare(strict_types=1);

namespace Tests\Fixtures;

use App\Core\Tenancy\Models\TenantSetting;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class SampleQueuedMailable extends Mailable implements ShouldQueue
{
    use Queueable;

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Tenant Mailable Test');
    }

    public function content(): Content
    {
        TenantSetting::updateOrCreate(
            ['key' => 'auth.token_lifetime_web_hours'],
            ['value' => ['hours' => 5]]
        );

        return new Content(htmlString: '<p>Test email</p>');
    }
}
