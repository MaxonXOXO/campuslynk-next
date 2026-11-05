import { describe, it, expect } from "vitest";
import {
  mapProblemFieldErrors,
  extractMissingPrerequisites,
  getGeneralErrorMessage,
} from "../src/app/setup/logic/error-mapping";

describe("RFC 7807 Problem Details Error Mapping (Part 5 & Part 6)", () => {
  describe("mapProblemFieldErrors", () => {
    it("maps Laravel validation format { errors: { field: [msg] } } to field errors", () => {
      const error = {
        status: 422,
        title: "Validation Error",
        errors: {
          name: ["The name field is required.", "Second error"],
          short_code: ["The short code must be between 2 and 10 characters."],
        },
      };

      const mapped = mapProblemFieldErrors(error);
      expect(mapped).toEqual({
        name: "The name field is required.",
        short_code: "The short code must be between 2 and 10 characters.",
      });
    });

    it("maps single string error messages in errors object", () => {
      const error = {
        errors: {
          email: "Invalid email address format.",
          website: "Must be a valid URL.",
        },
      };

      const mapped = mapProblemFieldErrors(error);
      expect(mapped).toEqual({
        email: "Invalid email address format.",
        website: "Must be a valid URL.",
      });
    });

    it("maps RFC 7807 invalid_params list format", () => {
      const error = {
        type: "https://errors.campuslynk.net/validation-error",
        invalid_params: [
          { name: "periods_per_day", reason: "Must be an integer between 1 and 12" },
          { name: "periods", reason: "Periods must not overlap" },
        ],
      };

      const mapped = mapProblemFieldErrors(error);
      expect(mapped).toEqual({
        periods_per_day: "Must be an integer between 1 and 12",
        periods: "Periods must not overlap",
      });
    });

    it("handles nested problem payload from ApiError wrapper", () => {
      const apiError = {
        status: 422,
        problem: {
          status: 422,
          type: "https://errors.campuslynk.net/validation-error",
          errors: {
            code: ["Department code already exists in this stream."],
          },
        },
      };

      const mapped = mapProblemFieldErrors(apiError);
      expect(mapped).toEqual({
        code: "Department code already exists in this stream.",
      });
    });

    it("returns empty object for empty or non-object errors", () => {
      expect(mapProblemFieldErrors(null)).toEqual({});
      expect(mapProblemFieldErrors(undefined)).toEqual({});
      expect(mapProblemFieldErrors("Server error")).toEqual({});
      expect(mapProblemFieldErrors({})).toEqual({});
    });
  });

  describe("extractMissingPrerequisites (422 setup-prerequisites-missing)", () => {
    it("extracts missing prerequisites list from errors.missing array", () => {
      const error422 = {
        status: 422,
        type: "https://errors.campuslynk.net/setup-prerequisites-missing",
        detail: "Cannot complete setup because prerequisites are missing.",
        errors: {
          missing: ["streams", "departments", "academic_years"],
        },
      };

      const missing = extractMissingPrerequisites(error422);
      expect(missing).toEqual(["streams", "departments", "academic_years"]);
    });

    it("extracts from nested problem envelope", () => {
      const apiError = {
        problem: {
          status: 422,
          errors: {
            missing: ["departments"],
          },
        },
      };

      const missing = extractMissingPrerequisites(apiError);
      expect(missing).toEqual(["departments"]);
    });

    it("extracts from top-level missing field if provided", () => {
      const directError = {
        status: 422,
        missing: ["academic_years"],
      };

      const missing = extractMissingPrerequisites(directError);
      expect(missing).toEqual(["academic_years"]);
    });

    it("returns empty array when missing prerequisites are not present", () => {
      expect(extractMissingPrerequisites({})).toEqual([]);
      expect(extractMissingPrerequisites(null)).toEqual([]);
      expect(extractMissingPrerequisites({ errors: { name: ["Required"] } })).toEqual([]);
    });
  });

  describe("getGeneralErrorMessage", () => {
    it("extracts detail from top-level or problem envelope", () => {
      expect(getGeneralErrorMessage({ detail: "Direct detail message" })).toBe(
        "Direct detail message"
      );
      expect(
        getGeneralErrorMessage({
          problem: { detail: "Nested problem detail message" },
        })
      ).toBe("Nested problem detail message");
    });

    it("falls back to message or title if detail is not available", () => {
      expect(getGeneralErrorMessage({ message: "Network error occurred" })).toBe(
        "Network error occurred"
      );
      expect(getGeneralErrorMessage({ title: "Conflict" })).toBe("Conflict");
    });

    it("returns fallback string when error is empty or undefined", () => {
      expect(getGeneralErrorMessage(null, "Default fallback")).toBe("Default fallback");
      expect(getGeneralErrorMessage(undefined, "Default fallback")).toBe("Default fallback");
    });

    it("returns string error as is", () => {
      expect(getGeneralErrorMessage("Something went wrong")).toBe("Something went wrong");
    });
  });
});

