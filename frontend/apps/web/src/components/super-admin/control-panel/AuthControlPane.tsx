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
  CardHeader,
  CardTitle,
  Input,
  Label,
  Skeleton,
  StatusBadge,
  Switch,
} from "@academic-suite/ui";
import { RiAlertLine, RiLoader4Line } from "@remixicon/react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/auth/session-provider";
import {
  STALE_TIME_LIST_MS,
  scopedQueryKey,
  useApiQuery,
  useQueryScope,
} from "@/lib/query/api-query";
import { AuditedReasonDialog } from "@/components/common/AuditedReasonDialog";

function readSettingBoolean(
  valueObj: Record<string, unknown> | undefined,
  primaryKey: string
): boolean {
  if (!valueObj) return false;
  if (typeof valueObj[primaryKey] === "boolean") {
    return valueObj[primaryKey];
  }
  return valueObj.value === true;
}

function readSettingNumber(
  valueObj: Record<string, unknown> | undefined,
  primaryKey: string,
  fallback: number
): number {
  if (!valueObj) return fallback;
  const primary = valueObj[primaryKey];
  if (typeof primary === "number" && Number.isFinite(primary)) {
    return primary;
  }
  if (typeof valueObj.value === "number" && Number.isFinite(valueObj.value)) {
    return valueObj.value;
  }
  return fallback;
}

export function AuthControlPane() {
  const client = useApiClient();
  const scope = useQueryScope();
  const queryClient = useQueryClient();

  const settingsQueryKey = React.useMemo(
    () => ["identity", "settings", "list"] as const,
    []
  );

  const settingsQuery = useApiQuery({
    queryKey: settingsQueryKey,
    queryFn: () => client.identity.settings.list(),
    staleTime: STALE_TIME_LIST_MS,
  });

  const settings = settingsQuery.data?.data?.settings;
  const selfRegSetting = settings?.["auth.staff_self_registration_enabled"];
  const dailyCapSetting = settings?.["auth.staff_self_registration_daily_cap"];
  const cooldownSetting = settings?.["auth.rejected_resubmit_cooldown_days"];

  const selfRegEnabled = readSettingBoolean(selfRegSetting?.value, "enabled");
  const [dailyCap, setDailyCap] = React.useState("25");
  const [cooldownDays, setCooldownDays] = React.useState("7");
  const [enableDialogOpen, setEnableDialogOpen] = React.useState(false);
  const [savingToggle, setSavingToggle] = React.useState(false);
  const [savingOnboardingLimits, setSavingOnboardingLimits] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDailyCap(String(readSettingNumber(dailyCapSetting?.value, "cap", 25)));
    setCooldownDays(String(readSettingNumber(cooldownSetting?.value, "days", 7)));
  }, [dailyCapSetting, cooldownSetting]);

  async function refreshSettings() {
    await queryClient.invalidateQueries({
      queryKey: scopedQueryKey(scope, ...settingsQueryKey),
    });
  }

  async function handleToggleSelfReg(nextChecked: boolean) {
    if (nextChecked) {
      setEnableDialogOpen(true);
      return;
    }

    setSavingToggle(true);
    setSaveError(null);
    try {
      await client.identity.settings.update("auth.staff_self_registration_enabled", {
        value: { enabled: false },
      });
      toast.success("Staff self-registration disabled.");
      await refreshSettings();
    } catch {
      setSaveError("Could not disable staff self-registration.");
    } finally {
      setSavingToggle(false);
    }
  }

  async function handleConfirmEnableSelfReg({ reason }: { reason: string }) {
    await client.identity.settings.update("auth.staff_self_registration_enabled", {
      value: { enabled: true },
      reason,
    });
    toast.success("Staff self-registration enabled.");
    setEnableDialogOpen(false);
    await refreshSettings();
  }

  async function handleSaveLimits(e: React.FormEvent) {
    e.preventDefault();
    const parsedCap = Number.parseInt(dailyCap, 10);
    const parsedCooldown = Number.parseInt(cooldownDays, 10);

    if (!Number.isInteger(parsedCap) || parsedCap < 1) {
      setSaveError("Daily cap must be an integer of at least 1.");
      return;
    }
    if (!Number.isInteger(parsedCooldown) || parsedCooldown < 0) {
      setSaveError("Resubmit cooldown must be 0 or more days.");
      return;
    }

    setSavingOnboardingLimits(true);
    setSaveError(null);
    try {
      await client.identity.settings.update("auth.staff_self_registration_daily_cap", {
        value: { cap: parsedCap },
      });
      await client.identity.settings.update("auth.rejected_resubmit_cooldown_days", {
        value: { days: parsedCooldown },
      });
      toast.success("Onboarding limits saved.");
      await refreshSettings();
    } catch {
      setSaveError("Could not save onboarding limits.");
    } finally {
      setSavingOnboardingLimits(false);
    }
  }

  if (settingsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <Alert variant="destructive">
        <RiAlertLine className="size-4" aria-hidden="true" />
        <AlertTitle>Unable to load authentication settings</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>Could not retrieve tenant authentication and onboarding settings.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void settingsQuery.refetch()}
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {saveError && (
        <Alert variant="destructive">
          <RiAlertLine className="size-4" aria-hidden="true" />
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Staff Self-Registration</CardTitle>
            <CardDescription>
              Control whether prospective staff can request an account from the sign-in page.
            </CardDescription>
          </div>
          <StatusBadge status={selfRegEnabled ? "success" : "neutral"}>
            {selfRegEnabled ? "Enabled" : "Disabled"}
          </StatusBadge>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="cp-staff-self-reg">
                Allow staff self-registration
              </Label>
              <p className="text-xs text-muted-foreground">
                Enabling requires an audited reason; disabling takes effect immediately.
              </p>
            </div>
            <Switch
              id="cp-staff-self-reg"
              checked={selfRegEnabled}
              onCheckedChange={(checked) => void handleToggleSelfReg(checked)}
              disabled={savingToggle}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Onboarding Limits</CardTitle>
          <CardDescription>
            Rate-limit pending requests and define cooldowns after rejection.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSaveLimits(e)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cp-daily-cap">Daily Pending Request Cap</Label>
                <Input
                  id="cp-daily-cap"
                  type="number"
                  min={1}
                  value={dailyCap}
                  onChange={(e) => setDailyCap(e.target.value)}
                  disabled={savingOnboardingLimits}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-cooldown-days">
                  Rejected Resubmit Cooldown (days)
                </Label>
                <Input
                  id="cp-cooldown-days"
                  type="number"
                  min={0}
                  value={cooldownDays}
                  onChange={(e) => setCooldownDays(e.target.value)}
                  disabled={savingOnboardingLimits}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={savingOnboardingLimits}>
                {savingOnboardingLimits && (
                  <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                )}
                Save Onboarding Limits
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AuditedReasonDialog
        open={enableDialogOpen}
        onOpenChange={setEnableDialogOpen}
        title="Enable staff self-registration"
        description="Turning on staff self-registration exposes the request-access flow on the login screen."
        reasonLabel="Audit reason"
        reasonPlaceholder="e.g. Opening faculty onboarding window for Fall semester"
        confirmLabel="Enable self-registration"
        onConfirm={handleConfirmEnableSelfReg}
      />
    </div>
  );
}

