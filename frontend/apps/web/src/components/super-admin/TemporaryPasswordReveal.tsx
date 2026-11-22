"use client";

import * as React from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Label,
} from "@academic-suite/ui";
import {
  RiCheckLine,
  RiEyeLine,
  RiEyeOffLine,
  RiFileCopyLine,
  RiKey2Line,
} from "@remixicon/react";
import { formatDisplayDateTime } from "@/lib/format-date";

export interface TemporaryPasswordPayload {
  temporary_password: string;
  expires_at?: string | null;
}

export interface TemporaryPasswordRevealProps {
  recipientName: string;
  payload: TemporaryPasswordPayload;
  onDismiss: () => void;
}

const MASKED_PASSWORD = "••••••••••••••••";

/**
 * Ephemeral one-time display for a server-generated temporary password.
 * Holds reveal/copy state strictly in component memory and clears on dismiss/unmount.
 */
export function TemporaryPasswordReveal({
  recipientName,
  payload,
  onDismiss,
}: TemporaryPasswordRevealProps) {
  const [revealed, setRevealed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [copyError, setCopyError] = React.useState<string | null>(null);
  const checkboxId = React.useId();

  React.useEffect(() => {
    return () => {
      setRevealed(false);
      setCopied(false);
      setAcknowledged(false);
    };
  }, []);

  async function handleCopy() {
    setCopyError(null);
    try {
      if (!navigator.clipboard?.writeText) {
        setCopyError("Clipboard access is unavailable. Reveal and copy the password manually.");
        return;
      }
      await navigator.clipboard.writeText(payload.temporary_password);
      setCopied(true);
    } catch {
      setCopyError("Could not copy to clipboard. Reveal and copy the password manually.");
    }
  }

  function handleDismiss() {
    if (!acknowledged) return;
    setRevealed(false);
    setCopied(false);
    setAcknowledged(false);
    setCopyError(null);
    onDismiss();
  }

  const formattedExpiry = React.useMemo(
    () => (payload.expires_at ? formatDisplayDateTime(payload.expires_at) : null),
    [payload.expires_at]
  );

  return (
    <Card className="border-primary/40 bg-primary/5" data-slot="temporary-password-reveal">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <RiKey2Line className="size-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base">
              One-Time Temporary Password for {recipientName}
            </CardTitle>
            <CardDescription>
              This password is displayed once and cannot be retrieved again after you dismiss
              this notice.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Alert>
          <AlertTitle>Share securely</AlertTitle>
          <AlertDescription>
            {formattedExpiry
              ? `The recipient must change this password on first sign-in. Expires ${formattedExpiry}.`
              : "The recipient will be required to change this password on first sign-in."}
          </AlertDescription>
        </Alert>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-border bg-card p-3">
          <code
            data-testid="temporary-password-value"
            className="flex-1 font-mono text-sm tracking-wider text-foreground break-all select-all"
          >
            {revealed ? payload.temporary_password : MASKED_PASSWORD}
          </code>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={revealed}
              aria-label={revealed ? "Hide temporary password" : "Show temporary password"}
              onClick={() => setRevealed((v) => !v)}
            >
              {revealed ? (
                <>
                  <RiEyeOffLine className="size-4" aria-hidden="true" />
                  Hide
                </>
              ) : (
                <>
                  <RiEyeLine className="size-4" aria-hidden="true" />
                  Show
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void handleCopy()}
            >
              {copied ? (
                <>
                  <RiCheckLine className="size-4" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <RiFileCopyLine className="size-4" aria-hidden="true" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>

        {copyError && (
          <p role="alert" className="text-xs text-destructive">
            {copyError}
          </p>
        )}

        <div className="flex items-start gap-2.5 pt-1">
          <Checkbox
            id={checkboxId}
            checked={acknowledged}
            onCheckedChange={(checked) => setAcknowledged(checked === true)}
          />
          <Label
            htmlFor={checkboxId}
            className="text-sm font-normal leading-snug cursor-pointer"
          >
            I have copied it and recorded this temporary password securely.
          </Label>
        </div>
      </CardContent>

      <CardFooter className="justify-end border-t border-border/60 pt-4">
        <Button type="button" disabled={!acknowledged} onClick={handleDismiss}>
          Done
        </Button>
      </CardFooter>
    </Card>
  );
}

