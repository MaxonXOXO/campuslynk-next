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
import { RiLoader4Line, RiAlertLine, RiMagicLine } from "@remixicon/react";
import {
  VALID_WEEKDAYS,
  validateWorkingDays,
  validatePeriodsPerDay,
  validatePeriods,
  formatDayOrderPreview,
  type PeriodDefinition,
} from "../logic/validation";
import { useStepForm } from "../logic/use-step-form";

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
  isPersisted?: boolean;
  navigationDisabled?: boolean;
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

function sameCalendarValues(left: CalendarFormValues, right: CalendarFormValues): boolean {
  // Weekday buttons represent a selection; compare it without changing API payload order.
  return JSON.stringify({ ...left, working_days: [...left.working_days].sort() }) ===
    JSON.stringify({ ...right, working_days: [...right.working_days].sort() });
}

export function CalendarStep({
  initialValues,
  isLoading = false,
  isSaving = false,
  isPersisted = false,
  navigationDisabled = false,
  serverErrors = {},
  generalError = null,
  onSave,
  onNext,
  onBack,
  onDirtyChange,
}: CalendarStepProps) {
  const initialFormValues = React.useMemo<CalendarFormValues>(() => ({
    working_days: initialValues?.working_days || ["monday", "tuesday", "wednesday", "thursday", "friday"],
    periods_per_day: initialValues?.periods_per_day || 6,
    periods: initialValues?.periods && initialValues.periods.length > 0
      ? initialValues.periods
      : generateDefaultPeriods(initialValues?.periods_per_day || 6),
    day_order_format: initialValues?.day_order_format || "roman",
  }), [initialValues]);
  const { values, setValues, isDirty, markSaved } = useStepForm(
    initialFormValues, isPersisted, onDirtyChange, sameCalendarValues
  );
  const {
    working_days: workingDays,
    periods_per_day: periodsPerDay,
    periods,
    day_order_format: dayOrderFormat,
  } = values;
  const submitting = React.useRef(false);

  const [clientErrors, setClientErrors] = React.useState<Record<string, string>>({});

  const handleWeekdayToggle = (day: string) => {
    setValues((prev) => ({
      ...prev,
      working_days: prev.working_days.includes(day)
        ? prev.working_days.filter((d) => d !== day)
        : [...prev.working_days, day],
    }));
  };

  const handlePeriodsPerDayChange = (newCount: number) => {
    if (isNaN(newCount) || newCount < 1 || newCount > 12) return;
    setValues((prev) => ({
      ...prev,
      periods_per_day: newCount,
      periods: prev.periods.length < newCount
        ? [...prev.periods, ...generateDefaultPeriods(newCount).slice(prev.periods.length)]
        : prev.periods.slice(0, newCount),
    }));
  };

  const handlePeriodChange = (
    index: number,
    field: "start" | "end",
    value: string
  ) => {
    setValues((prev) => ({
      ...prev,
      periods: prev.periods.map((p, idx) => (idx === index ? { ...p, [field]: value } : p)),
    }));
  };

  const handleResetDefaultPeriods = () => {
    setValues((prev) => ({ ...prev, periods: generateDefaultPeriods(prev.periods_per_day) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || navigationDisabled || submitting.current) return;
    if (!isDirty) {
      onNext();
      return;
    }

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
      Object.assign(errors, periodsResult.errors);
    }

    if (Object.keys(errors).length > 0) {
      setClientErrors(errors);
      return;
    }

    setClientErrors({});
    submitting.current = true;
    try {
      if (await onSave(values)) {
        markSaved(values);
        onNext();
      }
    } finally {
      submitting.current = false;
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
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
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
              {periods.map((p, idx) => {
                const periodNumber = p.index || idx + 1;
                const startError = clientErrors[`periods.${idx}.start`];
                const startErrorId = `period-${idx}-start-error`;

                return (
                  <TableRow key={p.index || idx}>
                    <TableCell className="font-mono text-xs font-semibold">
                      Period {periodNumber}
                    </TableCell>
                    <TableCell className="space-y-1.5">
                      <Input
                        type="text"
                        value={p.start}
                        onChange={(e) => handlePeriodChange(idx, "start", e.target.value)}
                        placeholder="09:00"
                        maxLength={5}
                        className="w-32 font-mono text-xs"
                        aria-label={`Period ${periodNumber} start time`}
                        aria-invalid={Boolean(startError)}
                        aria-describedby={startError ? startErrorId : undefined}
                        disabled={isSaving}
                      />
                      {startError && (
                        <p id={startErrorId} className="text-xs text-destructive font-medium" role="alert">
                          {startError}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        value={p.end}
                        onChange={(e) => handlePeriodChange(idx, "end", e.target.value)}
                        placeholder="09:55"
                        maxLength={5}
                        className="w-32 font-mono text-xs"
                        aria-label={`Period ${periodNumber} end time`}
                        disabled={isSaving}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
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
              <Button
                key={item.id}
                type="button"
                variant="outline"
                onClick={() => setValues((prev) => ({ ...prev, day_order_format: item.id }))}
                disabled={isSaving}
                aria-pressed={isSelected}
                className={`h-auto flex-col items-start gap-1 whitespace-normal p-4 rounded-lg border text-left transition-all ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-muted/20 hover:bg-muted/40"
                }`}
              >
                <div className="font-semibold text-sm text-foreground">{item.title}</div>
                <div className="text-xs text-muted-foreground mt-1 font-mono">
                  {item.sample}
                </div>
              </Button>
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
        <Button type="button" variant="outline" onClick={onBack} disabled={isSaving || navigationDisabled}>
          ← Back to Organisation
        </Button>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSaving || navigationDisabled}>
            {isSaving ? (
              <>
                <RiLoader4Line className="size-4 animate-spin mr-2" aria-hidden="true" />
                Saving...
              </>
            ) : (
              isDirty ? "Save & Continue" : "Continue"
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
