"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { components } from "@academic-suite/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  PageHeader,
  Skeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type SemanticStatus,
} from "@academic-suite/ui";
import {
  RiAlertLine,
  RiArrowLeftLine,
  RiCheckDoubleLine,
  RiDownloadLine,
  RiEyeLine,
  RiEyeOffLine,
  RiLoader4Line,
  RiUploadCloud2Line,
} from "@remixicon/react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { scopedQueryKey, useApiMutation, useApiQuery, useQueryScope } from "@/lib/query/api-query";
import { useApiClient, useSession } from "@/lib/auth/session-provider";
import { problemStatus } from "@/lib/auth/problem";
import { getGeneralErrorMessage } from "@/app/setup/logic/error-mapping";

type BatchSchema = components["schemas"]["StaffImportBatchSchema"];
type PreviewRow = components["schemas"]["StaffImportPreviewEnvelope"]["data"]["rows_preview"][number];
type BulkApproveData = components["schemas"]["BulkApproveEnvelope"]["data"];

type WizardStep = 1 | 2 | 3 | 4;

const STEP_LABELS: ReadonlyArray<{ step: WizardStep; title: string }> = [
  { step: 1, title: "Upload" },
  { step: 2, title: "Preview" },
  { step: 3, title: "Commit" },
  { step: 4, title: "Progress & Summary" },
];

function rowStatusSemantic(status: PreviewRow["status"]): SemanticStatus {
  if (status === "valid") return "success";
  if (status === "duplicate") return "warning";
  return "danger";
}

function batchStatusSemantic(status: BatchSchema["status"]): SemanticStatus {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "processing" || status === "queued") return "warning";
  return "neutral";
}

function triggerCsvDownload(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface StaffImportWizardProps {
  usersHref: string;
}

export function StaffImportWizard({ usersHref }: StaffImportWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeBatchId = searchParams.get("batch");

  const { state: sessionState } = useSession();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const scope = useQueryScope();
  const capabilities = React.useMemo(
    () => new Set(sessionState.user?.capabilities ?? []),
    [sessionState.user?.capabilities]
  );
  const canImport = capabilities.has("identity.user.import");
  const canApprove = capabilities.has("identity.user.approve");

  const [step, setStep] = React.useState<WizardStep>(1);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewBatch, setPreviewBatch] = React.useState<BatchSchema | null>(null);
  const [previewRows, setPreviewRows] = React.useState<PreviewRow[]>([]);
  const [autoApprove, setAutoApprove] = React.useState(false);
  const [commitError, setCommitError] = React.useState<string | null>(null);
  const [committing, setCommitting] = React.useState(false);
  const [needsPasswordReentry, setNeedsPasswordReentry] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [approveSummary, setApproveSummary] = React.useState<BulkApproveData | null>(null);

  // Password is held strictly in an uncontrolled input ref, never in React state,
  // TanStack Query cache, URL, storage, or error payloads.
  const passwordRef = React.useRef<HTMLInputElement | null>(null);
  const stepHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const errorAlertRef = React.useRef<HTMLDivElement | null>(null);
  const hasPreviewedInSessionRef = React.useRef(false);

  // Generated once per wizard session and reused on retry of the same commit.
  const idempotencyKeyRef = React.useRef<string>(
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `import-${Date.now()}`
  );

  const clearPasswordInput = React.useCallback(() => {
    if (passwordRef.current) {
      passwordRef.current.value = "";
    }
    setShowPassword(false);
  }, []);

  React.useEffect(() => {
    return () => {
      clearPasswordInput();
    };
  }, [clearPasswordInput]);

  React.useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [step]);

  const activeBatchId = previewBatch?.id ?? resumeBatchId;

  const {
    data: resumedBatchEnvelope,
    isPending: batchLoading,
    error: batchFetchError,
  } = useApiQuery<{ data: BatchSchema }>({
    queryKey: ["staff-imports", "batch", activeBatchId],
    enabled: canImport && Boolean(activeBatchId) && (step === 4 || Boolean(resumeBatchId)),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      if (step === 4 && (status === "queued" || status === "processing")) {
        return 2000;
      }
      return false;
    },
    queryFn: (api) =>
      api.identity.staffImports.get(activeBatchId as string),
  });

  const currentBatch = resumedBatchEnvelope?.data ?? previewBatch;

  // Sync wizard step when resuming via ?batch=<id> (skip if previewed in the current session)
  React.useEffect(() => {
    if (!resumeBatchId || !resumedBatchEnvelope?.data) return;
    if (hasPreviewedInSessionRef.current) return;
    const batch = resumedBatchEnvelope.data;
    setPreviewBatch(batch);
    if (batch.status === "previewed") {
      setStep((prev) => (prev < 3 ? 3 : prev));
    } else {
      setStep(4);
    }
  }, [resumeBatchId, resumedBatchEnvelope?.data]);

  const templateMutation = useApiMutation({
    mutationFn: (api) => api.identity.staffImports.template(),
  });

  const previewMutation = useApiMutation({
    mutationFn: (api, file: File) => api.identity.staffImports.preview(file),
  });

  const failedRowsMutation = useApiMutation({
    mutationFn: (api, id: string) => api.identity.staffImports.failedRows(id),
  });

  const approveBatchMutation = useApiMutation({
    mutationFn: (api, id: string) => api.identity.staffImports.approve(id),
    invalidateKeys: [["users"], ["staff-imports", "batch"]],
  });

  function handleStartNewImport() {
    hasPreviewedInSessionRef.current = false;
    clearPasswordInput();
    setSelectedFile(null);
    setPreviewBatch(null);
    setPreviewRows([]);
    setAutoApprove(false);
    setCommitError(null);
    setNeedsPasswordReentry(false);
    setUploadError(null);
    setApproveSummary(null);
    idempotencyKeyRef.current =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `import-${Date.now()}`;
    setStep(1);
    router.replace(usersHref + "/import");
  }

  async function handleDownloadTemplate() {
    try {
      const csv = await templateMutation.mutateAsync();
      triggerCsvDownload("staff_import_template.csv", csv);
    } catch (err: unknown) {
      toast.error(getGeneralErrorMessage(err, "Failed to download template."));
    }
  }

  async function handlePreviewUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || previewMutation.isPending) return;
    setUploadError(null);

    try {
      const res = await previewMutation.mutateAsync(selectedFile);
      hasPreviewedInSessionRef.current = true;
      setPreviewBatch(res.data.batch);
      setPreviewRows(res.data.rows_preview ?? []);
      setStep(2);
      router.replace(`${usersHref}/import?batch=${encodeURIComponent(res.data.batch.id)}`);
    } catch (err: unknown) {
      setUploadError(getGeneralErrorMessage(err, "Failed to preview import file."));
      errorAlertRef.current?.focus();
    }
  }

  async function handleCommitSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentBatch || committing) return;

    const rawPassword = passwordRef.current?.value ?? "";
    // Immediately wipe the DOM input before dispatching the network request.
    clearPasswordInput();

    if (rawPassword.trim() === "") {
      setCommitError("Enter a common temporary password before committing.");
      errorAlertRef.current?.focus();
      return;
    }

    setCommitError(null);
    setNeedsPasswordReentry(false);
    setCommitting(true);

    try {
      // Direct client call (outside TanStack MutationCache) so common_password
      // is never retained in mutation.state.variables.
      const res = (await apiClient.identity.staffImports.commit(currentBatch.id, {
        common_password: rawPassword,
        auto_approve: canApprove ? autoApprove : false,
        idempotency_key: idempotencyKeyRef.current,
      })) as { data: BatchSchema };
      setPreviewBatch(res.data);
      const batchKey = scopedQueryKey(scope, "staff-imports", "batch", res.data.id);
      queryClient.setQueryData(batchKey, res);
      setStep(4);
      void queryClient.invalidateQueries({
        queryKey: batchKey,
      });
      void queryClient.invalidateQueries({
        queryKey: scopedQueryKey(scope, "users"),
      });
    } catch (err: unknown) {
      if (problemStatus(err) === 409) {
        setCommitError(
          "This import batch has already been committed or is currently processing. View its progress or start a new import."
        );
        setNeedsPasswordReentry(false);
      } else {
        setCommitError(getGeneralErrorMessage(err, "Failed to commit staff import."));
        setNeedsPasswordReentry(true);
      }
      errorAlertRef.current?.focus();
    } finally {
      setCommitting(false);
    }
  }

  async function handleDownloadFailedRows() {
    if (!currentBatch || failedRowsMutation.isPending) return;
    try {
      const csv = await failedRowsMutation.mutateAsync(currentBatch.id);
      triggerCsvDownload(`staff_import_${currentBatch.id}_failed.csv`, csv);
    } catch (err: unknown) {
      toast.error(getGeneralErrorMessage(err, "Failed to download failed rows CSV."));
    }
  }

  async function handleApproveBatch() {
    if (!currentBatch || approveBatchMutation.isPending) return;
    try {
      const res = await approveBatchMutation.mutateAsync(currentBatch.id);
      setApproveSummary(res.data);
      toast.success(
        `Approved ${res.data.summary.approved} imported staff account(s).`
      );
    } catch (err: unknown) {
      toast.error(getGeneralErrorMessage(err, "Failed to approve batch."));
    }
  }

  if (!canImport) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Import Staff"
          description="Bulk staff onboarding is restricted to authorised administrators."
          actions={
            <Link href={usersHref} className={buttonVariants({ variant: "outline" })}>
              <RiArrowLeftLine className="size-4" aria-hidden="true" />
              Back to Users
            </Link>
          }
        />
        <Alert variant="destructive">
          <RiAlertLine className="size-4" aria-hidden="true" />
          <AlertTitle>Permission required</AlertTitle>
          <AlertDescription>
            You do not have the <code>identity.user.import</code> permission to import staff.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (resumeBatchId && batchFetchError) {
    const isNotFound = problemStatus(batchFetchError) === 404;
    return (
      <div className="space-y-6">
        <PageHeader
          title="Import Staff"
          actions={
            <Link href={usersHref} className={buttonVariants({ variant: "outline" })}>
              <RiArrowLeftLine className="size-4" aria-hidden="true" />
              Back to Users
            </Link>
          }
        />
        <Alert variant="destructive">
          <RiAlertLine className="size-4" aria-hidden="true" />
          <AlertTitle>{isNotFound ? "Import batch not found" : "Unable to load batch"}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {isNotFound
                ? "This import batch could not be found or has expired."
                : getGeneralErrorMessage(batchFetchError, "Unable to load import batch.")}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={handleStartNewImport}>
              Start a new import
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import Staff"
        description="Upload a CSV or XLSX roster, review validation results, and issue a one-time batch temporary password."
        actions={
          <Link href={usersHref} className={buttonVariants({ variant: "outline" })}>
            <RiArrowLeftLine className="size-4" aria-hidden="true" />
            Back to Users
          </Link>
        }
      />

      {/* Stepper */}
      <nav aria-label="Import steps" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEP_LABELS.map((item) => {
          const isCurrent = step === item.step;
          const isComplete = step > item.step;
          return (
            <div
              key={item.step}
              aria-current={isCurrent ? "step" : undefined}
              className={`rounded-md border px-3 py-2 text-xs font-medium ${
                isCurrent
                  ? "border-primary bg-primary/10 text-primary"
                  : isComplete
                    ? "border-border bg-muted text-foreground"
                    : "border-border bg-card text-muted-foreground"
              }`}
            >
              <span className="mr-1.5 font-mono">{item.step}.</span>
              {item.title}
            </div>
          );
        })}
      </nav>

      {resumeBatchId && batchLoading && !currentBatch && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 ref={stepHeadingRef} tabIndex={-1} className="outline-none">
                Step 1: Upload CSV or XLSX
              </h2>
            </CardTitle>
            <CardDescription>
              Download the template first to match the required column headers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadTemplate}
                disabled={templateMutation.isPending}
              >
                <RiDownloadLine className="size-4" aria-hidden="true" />
                {templateMutation.isPending ? "Downloading..." : "Download Template (CSV)"}
              </Button>
            </div>

            {uploadError && (
              <div ref={errorAlertRef} tabIndex={-1} role="alert" className="outline-none">
                <Alert variant="destructive">
                  <RiAlertLine className="size-4" aria-hidden="true" />
                  <AlertDescription>{uploadError}</AlertDescription>
                </Alert>
              </div>
            )}

            <form onSubmit={handlePreviewUpload} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="staff-import-file">Staff roster file (.csv or .xlsx)</Label>
                <Input
                  id="staff-import-file"
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setSelectedFile(file);
                    setUploadError(null);
                  }}
                />
              </div>

              <Button type="submit" disabled={!selectedFile || previewMutation.isPending}>
                {previewMutation.isPending ? (
                  <>
                    <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                    Validating file...
                  </>
                ) : (
                  <>
                    <RiUploadCloud2Line className="size-4" aria-hidden="true" />
                    Preview Import
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 2 && currentBatch && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 ref={stepHeadingRef} tabIndex={-1} className="outline-none">
                Step 2: Review Preview ({currentBatch.filename})
              </h2>
            </CardTitle>
            <CardDescription>
              {currentBatch.valid_rows} valid, {currentBatch.duplicate_rows} duplicate,{" "}
              {currentBatch.invalid_rows} invalid row(s) out of {currentBatch.total_rows} total.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Valid: {currentBatch.valid_rows}</Badge>
              <Badge variant="outline">Duplicates: {currentBatch.duplicate_rows}</Badge>
              <Badge variant="outline">Invalid: {currentBatch.invalid_rows}</Badge>
            </div>

            {previewRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No preview rows returned.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email / Mobile</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row) => {
                      const payload = row.payload ?? {};
                      const name = typeof payload.name === "string" ? payload.name : "—";
                      const contact =
                        (typeof payload.email === "string" && payload.email) ||
                        (typeof payload.mobile === "string" && payload.mobile) ||
                        "—";
                      return (
                        <TableRow key={row.row_number}>
                          <TableCell className="font-mono text-xs">{row.row_number}</TableCell>
                          <TableCell>
                            <StatusBadge status={rowStatusSemantic(row.status)}>
                              {row.status}
                            </StatusBadge>
                          </TableCell>
                          <TableCell>{name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{contact}</TableCell>
                          <TableCell className="text-xs text-destructive">
                            {row.errors.length > 0 ? row.errors.join("; ") : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={handleStartNewImport}>
                Start Over
              </Button>
              <Button
                type="button"
                disabled={currentBatch.valid_rows === 0}
                onClick={() => setStep(3)}
              >
                Continue to Commit
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && currentBatch && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 ref={stepHeadingRef} tabIndex={-1} className="outline-none">
                Step 3: Set Common Temporary Password
              </h2>
            </CardTitle>
            <CardDescription>
              The temporary password is hashed once on submission and is never stored or displayed again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {commitError && (
              <div ref={errorAlertRef} tabIndex={-1} role="alert" className="outline-none">
                <Alert variant="destructive">
                  <RiAlertLine className="size-4" aria-hidden="true" />
                  <AlertTitle>Commit failed</AlertTitle>
                  <AlertDescription>
                    {commitError}
                    {needsPasswordReentry &&
                      " For security, your previous entry was cleared — re-enter the temporary password to retry safely with the same idempotency key."}
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <form onSubmit={handleCommitSubmit} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="batch-common-password">Common temporary password</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="batch-common-password"
                    ref={passwordRef}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    disabled={committing}
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowPassword((prev) => !prev)}
                    disabled={committing}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? (
                      <RiEyeOffLine className="size-4" aria-hidden="true" />
                    ) : (
                      <RiEyeLine className="size-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </div>

              {canApprove && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="batch-auto-approve"
                    checked={autoApprove}
                    onCheckedChange={(checked) => setAutoApprove(checked === true)}
                    disabled={committing}
                  />
                  <Label htmlFor="batch-auto-approve" className="text-sm font-normal">
                    Approve on import (starts the 48-hour temporary password window immediately)
                  </Label>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(2)}
                  disabled={committing}
                >
                  Back
                </Button>
                <Button type="submit" disabled={committing}>
                  {committing ? (
                    <>
                      <RiLoader4Line className="size-4 animate-spin" aria-hidden="true" />
                      Committing...
                    </>
                  ) : (
                    "Commit Import"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 4 && currentBatch && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <h2 ref={stepHeadingRef} tabIndex={-1} className="outline-none">
                Step 4: Import Progress & Summary
              </h2>
              <StatusBadge status={batchStatusSemantic(currentBatch.status)}>
                {currentBatch.status}
              </StatusBadge>
            </CardTitle>
            <CardDescription>Batch ID: {currentBatch.id}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div aria-live="polite" className="text-sm text-muted-foreground">
              {currentBatch.status === "queued" || currentBatch.status === "processing"
                ? "Processing staff import rows..."
                : `Import finished with status: ${currentBatch.status}.`}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Created</div>
                <div className="text-xl font-semibold">{currentBatch.created_count}</div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Skipped duplicates</div>
                <div className="text-xl font-semibold">{currentBatch.skipped_duplicate_count}</div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Failed</div>
                <div className="text-xl font-semibold">{currentBatch.failed_count}</div>
              </div>
            </div>

            {approveSummary && (
              <Alert>
                <RiCheckDoubleLine className="size-4" aria-hidden="true" />
                <AlertTitle>
                  Batch Approval: {approveSummary.summary.approved} approved,{" "}
                  {approveSummary.summary.failed} not approved
                </AlertTitle>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              {(currentBatch.failed_count > 0 ||
                currentBatch.duplicate_rows > 0 ||
                currentBatch.invalid_rows > 0) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadFailedRows}
                  disabled={failedRowsMutation.isPending}
                >
                  <RiDownloadLine className="size-4" aria-hidden="true" />
                  Download failed rows CSV
                </Button>
              )}

              {canApprove &&
                currentBatch.status === "completed" &&
                !currentBatch.auto_approve &&
                currentBatch.created_count > 0 && (
                  <Button
                    type="button"
                    onClick={handleApproveBatch}
                    disabled={approveBatchMutation.isPending}
                  >
                    <RiCheckDoubleLine className="size-4" aria-hidden="true" />
                    {approveBatchMutation.isPending ? "Approving..." : "Approve Pending Batch"}
                  </Button>
                )}

              <Button type="button" variant="outline" onClick={handleStartNewImport}>
                Start a new import
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

