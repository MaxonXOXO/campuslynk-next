import { describe, it, expect } from "vitest";
import {
  validateWorkingDays,
  validatePeriodsPerDay,
  validatePeriods,
  formatDayOrderPreview,
  timeToMinutes,
  isValidTimeFormat,
  validateInstitutionProfile,
  validateSignupPolicy,
} from "../src/app/setup/logic/validation";

describe("Setup Validation Logic", () => {
  describe("Calendar Validation (mirrors CalendarBasicsRule)", () => {
    it("validates working days count (1 to 7 unique valid weekdays)", () => {
      // Valid weekdays
      expect(validateWorkingDays(["monday", "tuesday", "wednesday", "thursday", "friday"]).valid).toBe(true);
      expect(validateWorkingDays(["MONDAY", "Friday"]).valid).toBe(true);
      expect(validateWorkingDays(["sunday"]).valid).toBe(true);

      // Invalid: empty array
      const emptyRes = validateWorkingDays([]);
      expect(emptyRes.valid).toBe(false);
      expect(emptyRes.error).toContain("between 1 and 7 working days");

      // Invalid: duplicate weekday
      const dupRes = validateWorkingDays(["monday", "tuesday", "Monday"]);
      expect(dupRes.valid).toBe(false);
      expect(dupRes.error).toContain("Duplicate weekday");

      // Invalid: bogus weekday string
      const bogusRes = validateWorkingDays(["monday", "funday"]);
      expect(bogusRes.valid).toBe(false);
      expect(bogusRes.error).toContain("Invalid weekday");
    });

    it("validates periods_per_day (1 to 12 integer)", () => {
      expect(validatePeriodsPerDay(1).valid).toBe(true);
      expect(validatePeriodsPerDay(6).valid).toBe(true);
      expect(validatePeriodsPerDay(12).valid).toBe(true);

      expect(validatePeriodsPerDay(0).valid).toBe(false);
      expect(validatePeriodsPerDay(13).valid).toBe(false);
      expect(validatePeriodsPerDay(4.5).valid).toBe(false);
    });

    it("validates period HH:MM time parsing and format", () => {
      expect(isValidTimeFormat("09:00")).toBe(true);
      expect(isValidTimeFormat("23:59")).toBe(true);
      expect(isValidTimeFormat("00:00")).toBe(true);

      expect(isValidTimeFormat("24:00")).toBe(false);
      expect(isValidTimeFormat("9:00")).toBe(false);
      expect(isValidTimeFormat("09:60")).toBe(false);
      expect(isValidTimeFormat("abc")).toBe(false);

      expect(timeToMinutes("09:30")).toBe(570);
      expect(timeToMinutes("00:00")).toBe(0);
      expect(timeToMinutes("01:15")).toBe(75);
    });

    it("validates periods count matching periods_per_day", () => {
      const periods = [
        { index: 1, start: "09:00", end: "09:55" },
        { index: 2, start: "10:00", end: "10:55" },
      ];

      const res = validatePeriods(periods, 3);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("does not match periods per day");
    });

    it("validates that start time is strictly earlier than end time", () => {
      const inverted = [
        { index: 1, start: "10:00", end: "09:00" },
      ];
      const res = validatePeriods(inverted, 1);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("strictly earlier than end time");

      const equal = [
        { index: 1, start: "10:00", end: "10:00" },
      ];
      const resEqual = validatePeriods(equal, 1);
      expect(resEqual.valid).toBe(false);
      expect(resEqual.error).toContain("strictly earlier than end time");
    });

    it("detects overlapping period time ranges", () => {
      const overlapping = [
        { index: 1, start: "09:00", end: "10:00" },
        { index: 2, start: "09:45", end: "10:45" }, // Overlaps with period 1
      ];

      const res = validatePeriods(overlapping, 2);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Periods overlap");
      expect(res.errors?.["periods.1.start"]).toBe(res.error);
    });

    it("accepts valid chronological, non-overlapping periods", () => {
      const valid = [
        { index: 1, start: "09:00", end: "09:55" },
        { index: 2, start: "10:05", end: "11:00" },
        { index: 3, start: "11:10", end: "12:05" },
      ];

      const res = validatePeriods(valid, 3);
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it("rejects non-overlapping periods scheduled backwards by period number", () => {
      const res = validatePeriods([
        { index: 1, start: "11:00", end: "12:00" },
        { index: 2, start: "09:00", end: "10:00" },
      ], 2);

      expect(res.valid).toBe(false);
      expect(res.errors).toEqual({
        "periods.1.start": "Period 2 must start at or after Period 1 ends (12:00).",
      });
    });

    it("allows the next period to start exactly when the previous period ends", () => {
      expect(validatePeriods([
        { index: 1, start: "09:00", end: "10:00" },
        { index: 2, start: "10:00", end: "11:00" },
      ], 2).valid).toBe(true);
    });

    it("checks numerical period order and maps errors to the original table row", () => {
      const res = validatePeriods([
        { index: 2, start: "09:00", end: "10:00" },
        { index: 1, start: "11:00", end: "12:00" },
      ], 2);

      expect(res.valid).toBe(false);
      expect(res.errors).toEqual({
        "periods.0.start": "Period 2 must start at or after Period 1 ends (12:00).",
      });

      expect(validatePeriods([
        { index: 2, start: "10:00", end: "11:00" },
        { index: 1, start: "09:00", end: "10:00" },
      ], 2).valid).toBe(true);
    });

    it("generates day order preview for roman, numeric, and alpha formats", () => {
      const roman = formatDayOrderPreview("roman", 5);
      expect(roman).toEqual(["Day I", "Day II", "Day III", "Day IV", "Day V"]);

      const numeric = formatDayOrderPreview("numeric", 4);
      expect(numeric).toEqual(["Day 1", "Day 2", "Day 3", "Day 4"]);

      const alpha = formatDayOrderPreview("alpha", 3);
      expect(alpha).toEqual(["Day A", "Day B", "Day C"]);
    });
  });

  describe("Institution Profile Validation", () => {
    it("requires name and short_code", () => {
      const errors = validateInstitutionProfile({});
      expect(errors.name).toBe("Institution name is required.");
      expect(errors.short_code).toBe("Short code is required.");
    });

    it("validates optional email and website formats when provided", () => {
      const invalid = validateInstitutionProfile({
        name: "Test Polytechnic",
        short_code: "TP",
        contact_email: "not-an-email",
        website: "not-a-url",
      });

      expect(invalid.contact_email).toContain("Invalid contact email");
      expect(invalid.website).toContain("valid URL starting with http");

      const valid = validateInstitutionProfile({
        name: "Test Polytechnic",
        short_code: "TP",
        contact_email: "info@polytechnic.edu",
        website: "https://polytechnic.edu",
      });

      expect(valid.contact_email).toBeUndefined();
      expect(valid.website).toBeUndefined();
      expect(Object.keys(valid).length).toBe(0);
    });
  });

  describe("Sign-up Policy Validation", () => {
    it("validates approval mode is manual or auto", () => {
      expect(validateSignupPolicy({ approval_mode: "manual" })).toEqual({});
      expect(validateSignupPolicy({ approval_mode: "auto" })).toEqual({});

      // @ts-expect-error testing invalid enum
      const invalid = validateSignupPolicy({ approval_mode: "other" });
      expect(invalid.approval_mode).toContain('must be either "manual" or "auto"');
    });
  });
});
