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

export function ApiAccessControlPane() {
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

  const data = settingsQuery.data?.data;
  const webHoursSetting = data?.settings?.["auth.token_lifetime_web_hours"];
  const mobileDaysSetting = data?.settings?.["auth.token_lifetime_mobile_days"];

  const [webHours, setWebHours] = React.useState("12");
  const [mobileDays, setMobileDays] = React.useState("30");
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setWebHours(String(readSettingNumber(webHoursSetting?.value, "hours", 12)));
    setMobileDays(String(readSettingNumber(mobileDaysSetting?.value, "days", 30)));
  }, [webHoursSetting, mobileDaysSetting]);

  async function handleSaveTokens(e: React.FormEvent) {
    e.preventDefault();
    const parsedWeb = Number.parseInt(webHours, 10);
    const parsedMobile = Number.parseInt(mobileDays, 10);

    if (!Number.isInteger(parsedWeb) || parsedWeb < 1) {
      setSaveError("Web token lifetime must be at least 1 hour.");
      return;
    }
    if (!Number.isInteger(parsedMobile) || parsedMobile < 1) {
      setSaveError("Mobile token lifetime must be at least 1 day.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      await client.identity.settings.update("auth.token_lifetime_web_hours", {
        value: { hours: parsedWeb },
      });
      await client.identity.settings.update("auth.token_lifetime_mobile_days", {
        value: { days: parsedMobile },
      });
      toast.success("Token lifetimes updated.");
      await queryClient.invalidateQueries({
        queryKey: scopedQueryKey(scope, ...settingsQueryKey),
      });
    } catch {
      setSaveError("Could not update token lifetimes.");
    } finally {
      setSaving(false);
    }
  }

  if (settingsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <Alert variant="destructive">
        <RiAlertLine className="size-4" aria-hidden="true" />
        <AlertTitle>Unable to load API access policy</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>Could not retrieve token policy and active token counts.</span>
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

  const activeTokens = data?.token_summary?.active_tokens_count ?? 0;
  const activeUsers = data?.token_summary?.active_users_with_tokens_count ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Token Inventory</CardTitle>
          <CardDescription>
            Live count of unexpired Sanctum personal access tokens in this tenant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">Active Tokens</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">
                {activeTokens}
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground">
                Users with Active Tokens
              </div>
              <div className="mt-1 text-2xl font-semibold text-foreground">
                {activeUsers}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Token Lifetime Policy</CardTitle>
          <CardDescription>
            Configure session token expiration for web and mobile clients.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSaveTokens(e)} className="space-y-4">
            {saveError && (
              <Alert variant="destructive">
                <RiAlertLine className="size-4" aria-hidden="true" />
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cp-web-token-hours">
                  Web Token Lifetime (hours)
                </Label>
                <Input
                  id="cp-web-token-hours"
                  type="number"
                  min={1}
                  value={webHours}
                  onChange={(e) => setWebHours(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-mobile-token-days">
                  Mobile Token Lifetime (days)
                </Label>
                <Input
                  id="cp-mobile-token-days"
                  type="number"
                  min={1}
                  value={mobileDays}
                  onChange={(e) => setMobileDays(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving && (
                  <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                )}
                Save Token Policy
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

