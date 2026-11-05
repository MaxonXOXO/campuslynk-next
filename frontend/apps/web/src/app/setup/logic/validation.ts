/**
 * First-Run Setup Wizard Validation Logic
 * Mirrors backend schema rules and CalendarBasicsRule
 */

export const VALID_WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type Weekday = (typeof VALID_WEEKDAYS)[number];

export interface PeriodDefinition {
  index: number;
  start: string;
  end: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  errors?: Record<string, string>;
}

export function timeToMinutes(time: string): number {
  const parts = time.split(':');
  if (parts.length !== 2) return 0;
  const hours = parseInt(parts[0] ?? '', 10);
  const minutes = parseInt(parts[1] ?? '', 10);
  return (isNaN(hours) ? 0 : hours) * 60 + (isNaN(minutes) ? 0 : minutes);
}

export function isValidTimeFormat(time: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time.trim());
}

export function validateWorkingDays(days: string[]): ValidationResult {
  if (!Array.isArray(days)) {
    return { valid: false, error: 'Working days must be provided as an array.' };
  }

  if (days.length < 1 || days.length > 7) {
    return { valid: false, error: 'Please select between 1 and 7 working days.' };
  }

  const seen = new Set<string>();
  for (const day of days) {
    const lower = day.toLowerCase().trim();
    if (!VALID_WEEKDAYS.includes(lower as Weekday)) {
      return { valid: false, error: `Invalid weekday "${day}" selected.` };
    }
    if (seen.has(lower)) {
      return { valid: false, error: `Duplicate weekday "${day}" detected.` };
    }
    seen.add(lower);
  }

  return { valid: true };
}

export function validatePeriodsPerDay(count: number): ValidationResult {
  if (!Number.isInteger(count) || count < 1 || count > 12) {
    return { valid: false, error: 'Periods per day must be an integer between 1 and 12.' };
  }
  return { valid: true };
}

export function validatePeriods(
  periods: PeriodDefinition[],
  expectedCount: number
): ValidationResult {
  if (!Array.isArray(periods)) {
    return { valid: false, error: 'Periods must be provided as an array.' };
  }

  if (periods.length !== expectedCount) {
    return {
      valid: false,
      error: `Number of periods defined (${periods.length}) does not match periods per day (${expectedCount}).`,
    };
  }

  const parsedIntervals: Array<{ index: number; start: number; end: number; startStr: string; endStr: string }> = [];

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    if (!p) continue;
    const periodNumber = p.index || i + 1;

    if (!isValidTimeFormat(p.start)) {
      return {
        valid: false,
        error: `Period ${periodNumber} start time "${p.start}" must be in HH:MM (24-hour) format.`,
      };
    }

    if (!isValidTimeFormat(p.end)) {
      return {
        valid: false,
        error: `Period ${periodNumber} end time "${p.end}" must be in HH:MM (24-hour) format.`,
      };
    }

    const startMin = timeToMinutes(p.start);
    const endMin = timeToMinutes(p.end);

    if (startMin >= endMin) {
      return {
        valid: false,
        error: `Period ${periodNumber} start time (${p.start}) must be strictly earlier than end time (${p.end}).`,
      };
    }

    parsedIntervals.push({
      index: periodNumber,
      start: startMin,
      end: endMin,
      startStr: p.start,
      endStr: p.end,
    });
  }

  // Check chronological order and overlaps
  const sorted = [...parsedIntervals].sort((a, b) => a.start - b.start);

  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    if (!curr || !next) continue;

    if (curr.end > next.start) {
      return {
        valid: false,
        error: `Periods overlap: Period ${curr.index} (${curr.startStr}–${curr.endStr}) overlaps with Period ${next.index} (${next.startStr}–${next.endStr}).`,
      };
    }
  }

  return { valid: true };
}

export function formatDayOrderPreview(
  format: 'roman' | 'numeric' | 'alpha',
  count: number = 5
): string[] {
  const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const previews: string[] = [];

  for (let i = 1; i <= Math.min(count, 12); i++) {
    if (format === 'roman') {
      previews.push(`Day ${romanNumerals[i - 1] || i}`);
    } else if (format === 'alpha') {
      previews.push(`Day ${String.fromCharCode(64 + i)}`);
    } else {
      previews.push(`Day ${i}`);
    }
  }

  return previews;
}

export interface InstitutionProfileFormValues {
  name: string;
  short_code: string;
  board?: string;
  board_code?: string;
  affiliation?: string;
  affiliation_code?: string;
  contact_email?: string;
  contact_phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  website?: string;
}

export function validateInstitutionProfile(
  values: Partial<InstitutionProfileFormValues>
): Record<string, string> {
  const errors: Record<string, string> = {};

  const name = values.name?.trim() || '';
  if (!name) {
    errors.name = 'Institution name is required.';
  } else if (name.length > 255) {
    errors.name = 'Institution name cannot exceed 255 characters.';
  }

  const shortCode = values.short_code?.trim() || '';
  if (!shortCode) {
    errors.short_code = 'Short code is required.';
  } else if (shortCode.length > 32) {
    errors.short_code = 'Short code cannot exceed 32 characters.';
  }

  if (values.board && values.board.length > 255) {
    errors.board = 'Board / affiliation cannot exceed 255 characters.';
  }
  if (values.board_code && values.board_code.length > 64) {
    errors.board_code = 'Board code cannot exceed 64 characters.';
  }
  if (values.affiliation && values.affiliation.length > 255) {
    errors.affiliation = 'Affiliation cannot exceed 255 characters.';
  }
  if (values.affiliation_code && values.affiliation_code.length > 64) {
    errors.affiliation_code = 'Affiliation code cannot exceed 64 characters.';
  }

  if (values.contact_email?.trim()) {
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailRegex.test(values.contact_email.trim())) {
      errors.contact_email = 'Invalid contact email format.';
    }
  }

  if (values.contact_phone && values.contact_phone.length > 32) {
    errors.contact_phone = 'Contact phone cannot exceed 32 characters.';
  }

  if (values.address_line1 && values.address_line1.length > 255) {
    errors.address_line1 = 'Address line 1 cannot exceed 255 characters.';
  }
  if (values.address_line2 && values.address_line2.length > 255) {
    errors.address_line2 = 'Address line 2 cannot exceed 255 characters.';
  }
  if (values.city && values.city.length > 100) {
    errors.city = 'City cannot exceed 100 characters.';
  }
  if (values.state && values.state.length > 100) {
    errors.state = 'State cannot exceed 100 characters.';
  }
  if (values.postal_code && values.postal_code.length > 20) {
    errors.postal_code = 'Postal code cannot exceed 20 characters.';
  }

  if (values.website?.trim()) {
    const urlRegex = /^https?:\/\/[^\s$.?#].[^\s]*$/;
    if (!urlRegex.test(values.website.trim())) {
      errors.website = 'Website must be a valid URL starting with http:// or https://.';
    }
  }

  return errors;
}

export interface SignupPolicyFormValues {
  student_self_registration_enabled: boolean;
  parent_self_registration_enabled: boolean;
  approval_mode: 'manual' | 'auto';
}

export function validateSignupPolicy(values: Partial<SignupPolicyFormValues>): Record<string, string> {
  const errors: Record<string, string> = {};

  if (values.approval_mode !== undefined && values.approval_mode !== 'manual' && values.approval_mode !== 'auto') {
    errors.approval_mode = 'Approval mode must be either "manual" or "auto".';
  }

  return errors;
}
