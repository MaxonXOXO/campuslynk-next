"use client";

import * as React from "react";
import {
  Button,
  Input,
  Label,
  Alert,
  AlertTitle,
  AlertDescription,
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Skeleton,
} from "@academic-suite/ui";
import {
  RiAddLine,
  RiAlertLine,
  RiDeleteBinLine,
  RiEditLine,
  RiCheckLine,
  RiInformationLine,
  RiLoader4Line,
} from "@remixicon/react";

export interface StreamItem {
  id: string;
  code: string;
  name: string;
  departments_count?: number;
}

export interface DepartmentItem {
  id: string;
  code: string;
  name: string;
  kind?: string;
  stream_id?: string;
  stream?:
  | string
  | {
    id?: string;
    code?: string;
    name?: string;
  };
}

export interface AcademicYearItem {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  is_current?: boolean;
}

interface OrganisationBasicsStepProps {
  streams: StreamItem[];
  departments: DepartmentItem[];
  academicYears: AcademicYearItem[];
  isLoading?: boolean;
  onRefresh: () => Promise<void>;
  onCreateStream: (code: string, name: string) => Promise<boolean>;
  onRenameStream: (id: string, name: string) => Promise<boolean>;
  onDeleteStream: (id: string) => Promise<{ success: boolean; error?: string }>;
  onCreateDepartment: (data: {
    stream_id: string;
    code: string;
    name: string;
    kind: "academic" | "general" | "administrative";
  }) => Promise<boolean>;
  onDeleteDepartment?: (id: string) => Promise<{ success: boolean; error?: string }>;
  onCreateAcademicYear: (data: {
    label: string;
    start_date: string;
    end_date: string;
    is_current?: boolean;
  }) => Promise<boolean>;
  onNext: () => void;
  onBack: () => void;
}

export function deriveStreamCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

export function OrganisationBasicsStep({
  streams,
  departments,
  academicYears,
  isLoading = false,
  onRefresh,
  onCreateStream,
  onRenameStream,
  onDeleteStream,
  onCreateDepartment,
  onDeleteDepartment,
  onCreateAcademicYear,
  onNext,
  onBack,
}: OrganisationBasicsStepProps) {
  // Dialog States
  const [createStreamOpen, setCreateStreamOpen] = React.useState(false);
  const [streamCode, setStreamCode] = React.useState("");
  const [streamName, setStreamName] = React.useState("");
  const [isCodeManuallyEdited, setIsCodeManuallyEdited] = React.useState(false);
  const [streamError, setStreamError] = React.useState<string | null>(null);
  const [isSubmittingStream, setIsSubmittingStream] = React.useState(false);

  const [renameStreamOpen, setRenameStreamOpen] = React.useState(false);
  const [editingStream, setEditingStream] = React.useState<StreamItem | null>(null);
  const [renameName, setRenameName] = React.useState("");
  const [renameError, setRenameError] = React.useState<string | null>(null);

  const [deleteStreamError, setDeleteStreamError] = React.useState<string | null>(null);
  const [deleteDeptError, setDeleteDeptError] = React.useState<string | null>(null);

  const [createDeptOpen, setCreateDeptOpen] = React.useState(false);
  const [deptStreamId, setDeptStreamId] = React.useState("");
  const [deptCode, setDeptCode] = React.useState("");
  const [deptName, setDeptName] = React.useState("");
  const [deptKind, setDeptKind] = React.useState<"academic" | "general" | "administrative">("academic");
  const [deptError, setDeptError] = React.useState<string | null>(null);
  const [isSubmittingDept, setIsSubmittingDept] = React.useState(false);

  const [createYearOpen, setCreateYearOpen] = React.useState(false);
  const [yearLabel, setYearLabel] = React.useState("");
  const [yearStart, setYearStart] = React.useState("");
  const [yearEnd, setYearEnd] = React.useState("");
  const [yearCurrent, setYearCurrent] = React.useState(false);
  const [yearError, setYearError] = React.useState<string | null>(null);
  const [isSubmittingYear, setIsSubmittingYear] = React.useState(false);

  const streamsCount = streams.length;
  const departmentsCount = departments.length;
  const yearsCount = academicYears.length;
  const isPrerequisitesSatisfied = streamsCount >= 1 && departmentsCount >= 1 && yearsCount >= 1;

  // Stream Handlers
  const handleOpenCreateStream = () => {
    setStreamCode("");
    setStreamName("");
    setIsCodeManuallyEdited(false);
    setStreamError(null);
    setCreateStreamOpen(true);
  };

  const handleStreamNameChange = (value: string) => {
    setStreamName(value);
    if (!isCodeManuallyEdited) {
      setStreamCode(deriveStreamCode(value));
    }
  };

  const handleStreamCodeChange = (value: string) => {
    setIsCodeManuallyEdited(true);
    const sanitized = value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
    setStreamCode(sanitized);
  };

  const handleQuickFillStream = (name: string, code: string) => {
    setStreamName(name);
    setStreamCode(code);
    setIsCodeManuallyEdited(false);
  };

  const handleCreateStreamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = streamCode.trim();
    const name = streamName.trim();

    if (!code || !name) {
      setStreamError("Both stream code and stream name are required.");
      return;
    }
    if (code.length > 32) {
      setStreamError("Stream code cannot exceed 32 characters.");
      return;
    }
    if (!/^[A-Za-z0-9]+([_-][A-Za-z0-9]+)*$/.test(code)) {
      setStreamError("Stream code must start and end with alphanumeric characters and can contain underscores or hyphens.");
      return;
    }
    if (name.length > 100) {
      setStreamError("Stream name cannot exceed 100 characters.");
      return;
    }

    setIsSubmittingStream(true);
    setStreamError(null);
    try {
      const ok = await onCreateStream(code, name);
      if (ok) {
        setCreateStreamOpen(false);
        await onRefresh();
      }
    } catch (err: unknown) {
      setStreamError(err instanceof Error ? err.message : "Failed to create stream.");
    } finally {
      setIsSubmittingStream(false);
    }
  };

  const handleOpenRenameStream = (stream: StreamItem) => {
    setEditingStream(stream);
    setRenameName(stream.name);
    setRenameError(null);
    setRenameStreamOpen(true);
  };

  const handleRenameStreamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStream || !renameName.trim()) {
      setRenameError("Stream name cannot be blank.");
      return;
    }
    setIsSubmittingStream(true);
    setRenameError(null);
    try {
      const ok = await onRenameStream(editingStream.id, renameName.trim());
      if (ok) {
        setRenameStreamOpen(false);
        await onRefresh();
      }
    } catch (err: unknown) {
      setRenameError(err instanceof Error ? err.message : "Failed to rename stream.");
    } finally {
      setIsSubmittingStream(false);
    }
  };

  const handleDeleteStreamClick = async (stream: StreamItem) => {
    setDeleteStreamError(null);
    if ((stream.departments_count ?? 0) > 0) {
      setDeleteStreamError(
        `Cannot delete stream "${stream.name}" because it is currently referenced by ${stream.departments_count} department(s).`
      );
      return;
    }

    const res = await onDeleteStream(stream.id);
    if (!res.success) {
      setDeleteStreamError(res.error || "Cannot delete stream in use.");
    } else {
      await onRefresh();
    }
  };

  // Department Handlers
  const handleOpenCreateDept = () => {
    setDeptStreamId(streams[0]?.id || "");
    setDeptCode("");
    setDeptName("");
    setDeptKind("academic");
    setDeptError(null);
    setCreateDeptOpen(true);
  };

  const handleCreateDeptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptStreamId) {
      setDeptError("Please select a stream.");
      return;
    }
    if (!deptCode.trim() || !deptName.trim()) {
      setDeptError("Department code and name are required.");
      return;
    }

    // Client-side rule: duplicate code within the same stream is an error
    const isDuplicateInStream = departments.some((d) => {
      const dStreamId =
        d.stream_id ||
        (typeof d.stream === "object" && d.stream !== null
          ? d.stream.id
          : streams.find((s) => s.code === d.stream)?.id);
      return (
        dStreamId === deptStreamId &&
        d.code.toLowerCase().trim() === deptCode.toLowerCase().trim()
      );
    });

    if (isDuplicateInStream) {
      setDeptError(
        `Department code "${deptCode.trim()}" already exists in the selected stream. Department codes must be unique per stream.`
      );
      return;
    }

    setIsSubmittingDept(true);
    setDeptError(null);
    try {
      const ok = await onCreateDepartment({
        stream_id: deptStreamId,
        code: deptCode.trim(),
        name: deptName.trim(),
        kind: deptKind,
      });
      if (ok) {
        setCreateDeptOpen(false);
        await onRefresh();
      }
    } catch (err: unknown) {
      setDeptError(err instanceof Error ? err.message : "Failed to create department.");
    } finally {
      setIsSubmittingDept(false);
    }
  };

  const handleDeleteDepartmentClick = async (dept: DepartmentItem) => {
    setDeleteDeptError(null);
    if (!onDeleteDepartment) return;

    const res = await onDeleteDepartment(dept.id);
    if (!res.success) {
      setDeleteDeptError(
        res.error || `Cannot delete department "${dept.name}" because it is currently in use.`
      );
    } else {
      await onRefresh();
    }
  };

  // Academic Year Handlers
  const handleOpenCreateYear = () => {
    setYearLabel("");
    setYearStart("");
    setYearEnd("");
    setYearCurrent(false);
    setYearError(null);
    setCreateYearOpen(true);
  };

  const handleCreateYearSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!yearLabel.trim() || !yearStart.trim() || !yearEnd.trim()) {
      setYearError("Label, start date, and end date are required.");
      return;
    }
    if (yearStart >= yearEnd) {
      setYearError("Academic year start date must be earlier than end date.");
      return;
    }

    setIsSubmittingYear(true);
    setYearError(null);
    try {
      const ok = await onCreateAcademicYear({
        label: yearLabel.trim(),
        start_date: yearStart.trim(),
        end_date: yearEnd.trim(),
        is_current: yearCurrent,
      });
      if (ok) {
        setCreateYearOpen(false);
        await onRefresh();
      }
    } catch (err: unknown) {
      setYearError(err instanceof Error ? err.message : "Failed to create academic year.");
    } finally {
      setIsSubmittingYear(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16 w-full" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Organisation Basics
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Define institutional streams, departments, and academic years. This configuration
          establishes core institutional structure without assigning setup state keys.
        </p>
      </div>

      {/* Live Prerequisite Banner */}
      <div
        className={
          isPrerequisitesSatisfied
            ? "p-4 rounded-lg border border-primary/20 bg-primary/5 text-primary flex items-center justify-between"
            : "p-4 rounded-lg border border-border bg-muted/40 text-foreground flex items-center justify-between"
        }
      >
        <div className="flex items-center gap-3">
          {isPrerequisitesSatisfied ? (
            <RiCheckLine className="size-5 shrink-0 text-primary" aria-hidden="true" />
          ) : (
            <RiInformationLine className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <div>
            <div className="text-sm font-semibold text-foreground">
              Structural Prerequisites: At least one of each is required
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Streams: <span className="font-semibold text-foreground">{streamsCount}</span> •
              Departments: <span className="font-semibold text-foreground">{departmentsCount}</span> •
              Academic Years: <span className="font-semibold text-foreground">{yearsCount}</span>
            </div>
          </div>
        </div>
        <Badge variant={isPrerequisitesSatisfied ? "default" : "outline"}>
          {isPrerequisitesSatisfied ? "Prerequisites Met" : "Action Required"}
        </Badge>
      </div>

      {deleteStreamError && (
        <Alert variant="destructive">
          <RiAlertLine className="size-4 shrink-0" aria-hidden="true" />
          <AlertTitle>Stream Operation Blocked</AlertTitle>
          <AlertDescription>{deleteStreamError}</AlertDescription>
        </Alert>
      )}

      {deleteDeptError && (
        <Alert variant="destructive">
          <RiAlertLine className="size-4 shrink-0" aria-hidden="true" />
          <AlertTitle>Department Operation Blocked</AlertTitle>
          <AlertDescription>{deleteDeptError}</AlertDescription>
        </Alert>
      )}

      {/* SECTION 1: STREAMS */}
      <section className="space-y-4 border border-border rounded-xl p-5 bg-card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">1. Streams</h3>
            <p className="text-xs text-muted-foreground">
              Streams represent academic administration branches (e.g. Aided, Self-Financing).
            </p>
          </div>
          <Button type="button" size="sm" onClick={handleOpenCreateStream}>
            <RiAddLine className="size-4 mr-1" aria-hidden="true" /> Add Stream
          </Button>
        </div>

        {streams.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-border rounded-lg text-sm text-muted-foreground">
            No streams created yet. Click &quot;Add Stream&quot; above to create your first stream.
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Stream Name</TableHead>
                  <TableHead>Departments Assigned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {streams.map((stream) => {
                  const deptCount = stream.departments_count ?? 0;
                  const isDeleteBlocked = deptCount > 0;

                  return (
                    <TableRow key={stream.id}>
                      <TableCell className="font-mono text-xs font-semibold">
                        {stream.code}
                      </TableCell>
                      <TableCell className="font-medium">{stream.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {deptCount} dept{deptCount === 1 ? "" : "s"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenRenameStream(stream)}
                        >
                          <RiEditLine className="size-4 mr-1" aria-hidden="true" /> Rename
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          disabled={isDeleteBlocked}
                          title={
                            isDeleteBlocked
                              ? "Cannot delete stream while departments are assigned to it."
                              : "Delete stream"
                          }
                          onClick={() => handleDeleteStreamClick(stream)}
                        >
                          <RiDeleteBinLine className="size-4 mr-1" aria-hidden="true" /> Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* SECTION 2: DEPARTMENTS */}
      <section className="space-y-4 border border-border rounded-xl p-5 bg-card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">2. Departments</h3>
            <p className="text-xs text-muted-foreground">
              Academic, general, and administrative divisions grouped under institutional streams.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleOpenCreateDept}
            disabled={streams.length === 0}
            title={streams.length === 0 ? "Create a stream first before adding departments." : ""}
          >
            <RiAddLine className="size-4 mr-1" aria-hidden="true" /> Add Department
          </Button>
        </div>

        {departments.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-border rounded-lg text-sm text-muted-foreground">
            No departments created yet.{" "}
            {streams.length === 0
              ? "Create a stream first to assign departments."
              : 'Click "Add Department" above.'}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Department Name</TableHead>
                  <TableHead>Stream</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((dept) => {
                  const streamObj =
                    typeof dept.stream === "object" && dept.stream !== null
                      ? dept.stream
                      : streams.find(
                        (s) =>
                          s.id === dept.stream_id ||
                          (typeof dept.stream === "string" &&
                            (s.code === dept.stream || s.id === dept.stream))
                      );
                  const streamDisplayName =
                    streamObj?.name && streamObj?.code
                      ? `${streamObj.name} (${streamObj.code})`
                      : streamObj?.name || streamObj?.code
                        ? streamObj.name || streamObj.code
                        : typeof dept.stream === "string" && dept.stream
                          ? dept.stream
                          : "Unknown Stream";

                  return (
                    <TableRow key={dept.id}>
                      <TableCell className="font-mono text-xs font-semibold">
                        {dept.code}
                      </TableCell>
                      <TableCell className="font-medium">{dept.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {streamDisplayName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">
                          {dept.kind || "academic"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          title={`Delete department ${dept.name}`}
                          onClick={() => void handleDeleteDepartmentClick(dept)}
                        >
                          <RiDeleteBinLine className="size-4 mr-1" aria-hidden="true" /> Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* SECTION 3: ACADEMIC YEARS */}
      <section className="space-y-4 border border-border rounded-xl p-5 bg-card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">3. Academic Years</h3>
            <p className="text-xs text-muted-foreground">
              Institutional academic calendar sessions for enrollment and terms.
            </p>
          </div>
          <Button type="button" size="sm" onClick={handleOpenCreateYear}>
            <RiAddLine className="size-4 mr-1" aria-hidden="true" /> Add Academic Year
          </Button>
        </div>

        {academicYears.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-border rounded-lg text-sm text-muted-foreground">
            No academic years created yet. Click &quot;Add Academic Year&quot; above.
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Academic Session</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {academicYears.map((ay) => (
                  <TableRow key={ay.id}>
                    <TableCell className="font-medium font-mono text-xs">
                      {ay.label}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ay.start_date}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ay.end_date}
                    </TableCell>
                    <TableCell>
                      {ay.is_current ? (
                        <Badge variant="default" className="text-xs">
                          Current
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Scheduled
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Programs Note */}
      <div className="p-4 rounded-lg bg-muted/20 border border-border text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Programs Note:</span> Academic programs can
        be configured anytime post-setup in academic administration settings. This step is
        optional and skippable.
      </div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onBack}>
          ← Back to Profile
        </Button>
        <Button type="button" onClick={onNext}>
          Next Step: Calendar →
        </Button>
      </div>

      {/* CREATE STREAM DIALOG */}
      <Dialog open={createStreamOpen} onOpenChange={setCreateStreamOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateStreamSubmit}>
            <DialogHeader>
              <DialogTitle>Create Institutional Stream</DialogTitle>
              <DialogDescription>
                Define an administrative stream code and name. Stream codes cannot be modified
                after creation.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {streamError && (
                <Alert variant="destructive">
                  <RiAlertLine className="size-4 shrink-0" aria-hidden="true" />
                  <AlertDescription>{streamError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="stream-name">Stream Name</Label>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>Quick-fill:</span>
                    <button
                      type="button"
                      onClick={() => handleQuickFillStream("Aided", "AIDED")}
                      className="rounded px-1.5 py-0.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs font-medium cursor-pointer transition-colors"
                    >
                      Aided
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickFillStream("Self-financing", "SELF_FINANCING")}
                      className="rounded px-1.5 py-0.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs font-medium cursor-pointer transition-colors"
                    >
                      Self-financing
                    </button>
                  </div>
                </div>
                <Input
                  id="stream-name"
                  value={streamName}
                  onChange={(e) => handleStreamNameChange(e.target.value)}
                  placeholder="Government Aided"
                  maxLength={100}
                  disabled={isSubmittingStream}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="stream-code">Stream Code</Label>
                <Input
                  id="stream-code"
                  value={streamCode}
                  onChange={(e) => handleStreamCodeChange(e.target.value)}
                  placeholder="AIDED"
                  maxLength={32}
                  disabled={isSubmittingStream}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Short unique uppercase identifier (e.g. AIDED, SELF_FINANCING). Max 32 characters.
                </p>
                <p className="text-xs font-medium text-destructive/90">
                  Note: The stream code cannot be changed after creation.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateStreamOpen(false)}
                disabled={isSubmittingStream}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmittingStream}>
                {isSubmittingStream ? (
                  <>
                    <RiLoader4Line className="size-4 animate-spin mr-2" aria-hidden="true" />
                    Creating...
                  </>
                ) : (
                  "Create Stream"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* RENAME STREAM DIALOG */}
      <Dialog open={renameStreamOpen} onOpenChange={setRenameStreamOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleRenameStreamSubmit}>
            <DialogHeader>
              <DialogTitle>Rename Stream</DialogTitle>
              <DialogDescription>
                Update the display name for this stream. The stream code is immutable.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {renameError && (
                <Alert variant="destructive">
                  <RiAlertLine className="size-4 shrink-0" aria-hidden="true" />
                  <AlertDescription>{renameError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="rename-stream-code">Stream Code</Label>
                <Input
                  id="rename-stream-code"
                  value={editingStream?.code || ""}
                  disabled
                  className="bg-muted text-muted-foreground font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Stream code is immutable and cannot be changed after creation.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rename-stream-name">Stream Name</Label>
                <Input
                  id="rename-stream-name"
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  placeholder="Updated Stream Name"
                  maxLength={255}
                  disabled={isSubmittingStream}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameStreamOpen(false)}
                disabled={isSubmittingStream}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmittingStream}>
                {isSubmittingStream ? (
                  <>
                    <RiLoader4Line className="size-4 animate-spin mr-2" aria-hidden="true" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CREATE DEPARTMENT DIALOG */}
      <Dialog open={createDeptOpen} onOpenChange={setCreateDeptOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateDeptSubmit}>
            <DialogHeader>
              <DialogTitle>Add Department</DialogTitle>
              <DialogDescription>
                Create a department under an assigned institutional stream.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {deptError && (
                <Alert variant="destructive">
                  <RiAlertLine className="size-4 shrink-0" aria-hidden="true" />
                  <AlertDescription>{deptError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="dept-stream">Stream Picker</Label>
                <select
                  id="dept-stream"
                  value={deptStreamId}
                  onChange={(e) => setDeptStreamId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={isSubmittingDept}
                >
                  {streams.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dept-code">Department Code</Label>
                <Input
                  id="dept-code"
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value.toUpperCase())}
                  placeholder="ME"
                  maxLength={16}
                  disabled={isSubmittingDept}
                />
                <p className="text-xs text-muted-foreground">
                  The same code may be used across different streams (e.g. ME in Aided and ME in SF).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dept-name">Department Name</Label>
                <Input
                  id="dept-name"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="Mechanical Engineering"
                  maxLength={255}
                  disabled={isSubmittingDept}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dept-kind">Department Kind</Label>
                <select
                  id="dept-kind"
                  value={deptKind}
                  onChange={(e) =>
                    setDeptKind(
                      e.target.value as "academic" | "general" | "administrative"
                    )
                  }
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={isSubmittingDept}
                >
                  <option value="academic">Academic</option>
                  <option value="general">General</option>
                  <option value="administrative">Administrative</option>
                </select>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDeptOpen(false)}
                disabled={isSubmittingDept}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmittingDept}>
                {isSubmittingDept ? (
                  <>
                    <RiLoader4Line className="size-4 animate-spin mr-2" aria-hidden="true" />
                    Creating...
                  </>
                ) : (
                  "Create Department"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CREATE ACADEMIC YEAR DIALOG */}
      <Dialog open={createYearOpen} onOpenChange={setCreateYearOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateYearSubmit}>
            <DialogHeader>
              <DialogTitle>Add Academic Year</DialogTitle>
              <DialogDescription>
                Define an institutional academic calendar session.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {yearError && (
                <Alert variant="destructive">
                  <RiAlertLine className="size-4 shrink-0" aria-hidden="true" />
                  <AlertDescription>{yearError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="year-label">Session Label</Label>
                <Input
                  id="year-label"
                  value={yearLabel}
                  onChange={(e) => setYearLabel(e.target.value)}
                  placeholder="2026-2027"
                  disabled={isSubmittingYear}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="year-start">Start Date</Label>
                  <Input
                    id="year-start"
                    type="date"
                    value={yearStart}
                    onChange={(e) => setYearStart(e.target.value)}
                    disabled={isSubmittingYear}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="year-end">End Date</Label>
                  <Input
                    id="year-end"
                    type="date"
                    value={yearEnd}
                    onChange={(e) => setYearEnd(e.target.value)}
                    disabled={isSubmittingYear}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  id="year-current"
                  type="checkbox"
                  checked={yearCurrent}
                  onChange={(e) => setYearCurrent(e.target.checked)}
                  className="size-4 rounded border-input"
                  disabled={isSubmittingYear}
                />
                <Label htmlFor="year-current" className="text-sm font-normal cursor-pointer">
                  Mark as current active academic session
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateYearOpen(false)}
                disabled={isSubmittingYear}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmittingYear}>
                {isSubmittingYear ? (
                  <>
                    <RiLoader4Line className="size-4 animate-spin mr-2" aria-hidden="true" />
                    Creating...
                  </>
                ) : (
                  "Create Academic Year"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

