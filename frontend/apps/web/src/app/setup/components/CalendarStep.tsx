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
  Skeleton,
} from "@academic-suite/ui";
import { RiLoader4Line, RiAlertLine, RiCheckLine, RiMagicLine } from "@remixicon/react";
import {
  VALID_WEEKDAYS,
  validateWorkingDays,
  validatePeriodsPerDay,
  validatePeriods,
  formatDayOrderPreview,
  type PeriodDefinition,
} from "../logic/validation";

export interface CalendarFormValues {
  working_days: string[];
  periods_per_day: number;
  periods: PeriodDefinition[];
  day_order_format: "roman" | "numeric" | "alpha";
}

interface CalendarStepProps {
  initialValues?: Partial<CalendarFormValues>;
  isLoading?: boolean;
  isSaving?: boolean;
  serverErrors?: Record<string, string>;
  generalError?: string | null;
  onSave: (values: CalendarFormValues) => Promise<boolean>;
  onNext: () => void;
  onBack: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

function generateDefaultPeriods(count: number): PeriodDefinition[] {
  const defaults: PeriodDefinition[] = [];
  let currentStartMinutes = 9 * 60; // 09:00 AM
  const periodDurationMinutes = 55;
  const breakDurationMinutes = 10;

  for (let i = 1; i <= count; i++) {
    const endMinutes = currentStartMinutes + periodDurationMinutes;

    const startH = String(Math.floor(currentStartMinutes / 60)).padStart(2, "0");
    const startM = String(currentStartMinutes % 60).padStart(2, "0");

    const endH = String(Math.floor(endMinutes / 60)).padStart(2, "0");
    const endM = String(endMinutes % 60).padStart(2, "0");

    defaults.push({
      index: i,
      start: `${startH}:${startM}`,
      end: `${endH}:${endM}`,
    });

    currentStartMinutes = endMinutes + breakDurationMinutes;
  }

  return defaults;
}

export function CalendarStep({
  initialValues,
  isLoading = false,
  isSaving = false,
  serverErrors = {},
  generalError = null,
  onSave,
  onNext,
  onBack,
  onDirtyChange,
}: CalendarStepProps) {
  const [workingDays, setWorkingDays] = React.useState<string[]>(
    initialValues?.working_days || ["monday", "tuesday", "wednesday", "thursday", "friday"]
  );

  const [periodsPerDay, setPeriodsPerDay] = React.useState<number>(
    initialValues?.periods_per_day || 6
  );

  const [periods, setPeriods] = React.useState<PeriodDefinition[]>(
    initialValues?.periods && initialValues.periods.length > 0
      ? initialValues.periods
      : generateDefaultPeriods(initialValues?.periods_per_day || 6)
  );

  const [dayOrderFormat, setDayOrderFormat] = React.useState<"roman" | "numeric" | "alpha">(
    initialValues?.day_order_format || "roman"
  );

  const [clientErrors, setClientErrors] = React.useState<Record<string, string>>({});
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  React.useEffect(() => {
    if (initialValues) {
      if (initialValues.working_days) setWorkingDays(initialValues.working_days);
      if (initialValues.periods_per_day) {
        setPeriodsPerDay(initialValues.periods_per_day);
        if (!initialValues.periods || initialValues.periods.length === 0) {
          setPeriods(generateDefaultPeriods(initialValues.periods_per_day));
        }
      }
      if (initialValues.periods && initialValues.periods.length > 0) {
        setPeriods(initialValues.periods);
      }
      if (initialValues.day_order_format) {
        setDayOrderFormat(initialValues.day_order_format);
      }
    }
  }, [initialValues]);

  const handleWeekdayToggle = (day: string) => {
    setWorkingDays((prev) => {
      const exists = prev.includes(day);
      const next = exists ? prev.filter((d) => d !== day) : [...prev, day];
      onDirtyChange?.(true);
      return next;
    });
    setSaveSuccess(false);
  };

  const handlePeriodsPerDayChange = (newCount: number) => {
    if (isNaN(newCount) || newCount < 1 || newCount > 12) return;
    setPeriodsPerDay(newCount);
    onDirtyChange?.(true);
    setSaveSuccess(false);

    // Synchronize periods length
    setPeriods((prev) => {
      if (prev.length === newCount) return prev;
      if (prev.length < newCount) {
        // Expand
        const additional = generateDefaultPeriods(newCount).slice(prev.length);
        return [...prev, ...additional];
      }
      // Shrink
      return prev.slice(0, newCount);
    });
  };

  const handlePeriodChange = (
    index: number,
    field: "start" | "end",
    value: string
  ) => {
    setPeriods((prev) =>
      prev.map((p, idx) => (idx === index ? { ...p, [field]: value } : p))
    );
    onDirtyChange?.(true);
    setSaveSuccess(false);
  };

  const handleResetDefaultPeriods = () => {
    setPeriods(generateDefaultPeriods(periodsPerDay));
    onDirtyChange?.(true);
    setSaveSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(false);

    const errors: Record<string, string> = {};

    // 1. Validate working days
    const daysResult = validateWorkingDays(workingDays);
    if (!daysResult.valid && daysResult.error) {
      errors.working_days = daysResult.error;
    }

    // 2. Validate periods per day
    const countResult = validatePeriodsPerDay(periodsPerDay);
    if (!countResult.valid && countResult.error) {
      errors.periods_per_day = countResult.error;
    }

    // 3. Validate periods table
    const periodsResult = validatePeriods(periods, periodsPerDay);
    if (!periodsResult.valid && periodsResult.error) {
      errors.periods = periodsResult.error;
    }

    if (Object.keys(errors).length > 0) {
      setClientErrors(errors);
      return;
    }

    setClientErrors({});
    const success = await onSave({
      working_days: workingDays,
      periods_per_day: periodsPerDay,
      periods,
      day_order_format: dayOrderFormat,
    });

    if (success) {
      setSaveSuccess(true);
      onDirtyChange?.(false);
    }
  };

  const dayPreviews = formatDayOrderPreview(dayOrderFormat, workingDays.length || 5);

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Academic Calendar Basics
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure institutional instructional schedule fundamentals: instructional weekdays,
          daily periods, and timetable period intervals.
        </p>
      </div>

      {generalError && (
        <Alert variant="destructive">
          <RiAlertLine className="size-4 shrink-0" aria-hidden="true" />
          <AlertTitle>Calendar Configuration Error</AlertTitle>
          <AlertDescription>{generalError}</AlertDescription>
        </Alert>
      )}

      {saveSuccess && (
        <Alert className="border-primary/30 bg-primary/5 text-primary">
          <RiCheckLine className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <AlertTitle className="text-foreground">Calendar Saved</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            Academic calendar basics have been validated and saved.
          </AlertDescription>
        </Alert>
      )}

      {/* SECTION 1: WORKING DAYS */}
      <div className="space-y-3 border border-border rounded-xl p-5 bg-card">
        <div>
          <Label className="text-base font-semibold text-foreground">
            1. Instructional Working Days (1 to 7)
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select the days of the week on which instructional periods occur.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          {VALID_WEEKDAYS.map((day) => {
            const isSelected = workingDays.includes(day);
            return (
              <Button
                key={day}
                type="button"
                variant={isSelected ? "default" : "outline"}
                size="sm"
                onClick={() => handleWeekdayToggle(day)}
                disabled={isSaving}
                className="capitalize text-xs font-medium"
              >
                {day}
              </Button>
            );
          })}
        </div>

        {(clientErrors.working_days || serverErrors.working_days) && (
          <p className="text-xs text-destructive font-medium" role="alert">
            {clientErrors.working_days || serverErrors.working_days}
          </p>
        )}
      </div>

      {/* SECTION 2: PERIODS PER DAY */}
      <div className="space-y-3 border border-border rounded-xl p-5 bg-card">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="periods-count" className="text-base font-semibold text-foreground">
              2. Periods Per Working Day (1 to 12)
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Specify the exact number of instructional periods per day.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              id="periods-count"
              type="number"
              min={1}
              max={12}
              value={periodsPerDay}
              onChange={(e) => handlePeriodsPerDayChange(parseInt(e.target.value, 10))}
              disabled={isSaving}
              className="w-20 text-center font-mono font-bold"
            />
          </div>
        </div>

        {(clientErrors.periods_per_day || serverErrors.periods_per_day) && (
          <p className="text-xs text-destructive font-medium" role="alert">
            {clientErrors.periods_per_day || serverErrors.periods_per_day}
          </p>
        )}
      </div>

      {/* SECTION 3: PERIOD TIMINGS TABLE */}
      <div className="space-y-4 border border-border rounded-xl p-5 bg-card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              3. Period Schedule Intervals
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Set start and end times (24-hour HH:MM). Times must be chronological and cannot
              overlap.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetDefaultPeriods}
            disabled={isSaving}
          >
            <RiMagicLine className="size-4 mr-1" aria-hidden="true" /> Auto-fill Defaults
          </Button>
        </div>

        {(clientErrors.periods || serverErrors.periods) && (
          <Alert variant="destructive">
            <RiAlertLine className="size-4 shrink-0" aria-hidden="true" />
            <AlertDescription>
              {clientErrors.periods || serverErrors.periods}
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Period</TableHead>
                <TableHead>Start Time (HH:MM)</TableHead>
                <TableHead>End Time (HH:MM)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((p, idx) => (
                <TableRow key={p.index || idx}>
                  <TableCell className="font-mono text-xs font-semibold">
                    Period {p.index || idx + 1}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="text"
                      value={p.start}
                      onChange={(e) => handlePeriodChange(idx, "start", e.target.value)}
                      placeholder="09:00"
                      maxLength={5}
                      className="w-32 font-mono text-xs"
                      disabled={isSaving}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="text"
                      value={p.end}
                      onChange={(e) => handlePeriodChange(idx, "end", e.target.value)}
                      placeholder="09:55"
                      maxLength={5}
                      className="w-32 font-mono text-xs"
                      disabled={isSaving}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* SECTION 4: DAY ORDER FORMAT */}
      <div className="space-y-4 border border-border rounded-xl p-5 bg-card">
        <div>
          <Label className="text-base font-semibold text-foreground">
            4. Day-Order Format Representation
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select how cyclic timetable day orders will be numbered and displayed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(
            [
              { id: "roman", title: "Roman Numerals", sample: "Day I, Day II, Day III" },
              { id: "numeric", title: "Numeric Digits", sample: "Day 1, Day 2, Day 3" },
              { id: "alpha", title: "Alphabetic Letters", sample: "Day A, Day B, Day C" },
            ] as const
          ).map((item) => {
            const isSelected = dayOrderFormat === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setDayOrderFormat(item.id);
                  onDirtyChange?.(true);
                  setSaveSuccess(false);
                }}
                disabled={isSaving}
                className={`p-4 rounded-lg border text-left transition-all ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-muted/20 hover:bg-muted/40"
                }`}
              >
                <div className="font-semibold text-sm text-foreground">{item.title}</div>
                <div className="text-xs text-muted-foreground mt-1 font-mono">
                  {item.sample}
                </div>
              </button>
            );
          })}
        </div>

        {/* Live Preview */}
        <div className="p-4 rounded-lg bg-muted/30 border border-border">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Live Preview of Day Order Cycle:
          </div>
          <div className="flex flex-wrap gap-2">
            {dayPreviews.map((preview, i) => (
              <Badge key={i} variant="secondary" className="font-mono text-xs py-1 px-2.5">
                {preview}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER ACTIONS */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onBack}>
          ← Back to Organisation
        </Button>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <RiLoader4Line className="size-4 animate-spin mr-2" aria-hidden="true" />
                Saving...
              </>
            ) : (
              "Save Calendar"
            )}
          </Button>
          <Button type="button" variant="outline" onClick={onNext}>
            Next Step: Sign-up Policy →
          </Button>
        </div>
      </div>
    </form>
  );
}

