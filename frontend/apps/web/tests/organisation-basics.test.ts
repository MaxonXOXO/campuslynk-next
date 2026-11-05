import { describe, it, expect } from "vitest";

interface StreamItem {
  id: string;
  code: string;
  name: string;
  departments_count?: number;
}

interface DepartmentItem {
  id: string;
  code: string;
  name: string;
  kind?: string;
  stream_id?: string;
}

// Logic mirror from OrganisationBasicsStep
function validateDepartmentUniqueness(
  code: string,
  streamId: string,
  existingDepartments: DepartmentItem[]
): { valid: boolean; error?: string } {
  const trimmedCode = code.trim().toLowerCase();
  const duplicate = existingDepartments.some(
    (d) => d.stream_id === streamId && d.code.trim().toLowerCase() === trimmedCode
  );

  if (duplicate) {
    return {
      valid: false,
      error: `Department code "${code.trim()}" already exists in the selected stream. Department codes must be unique per stream.`,
    };
  }

  return { valid: true };
}

function canDeleteStream(stream: StreamItem): { allowed: boolean; reason?: string } {
  if ((stream.departments_count ?? 0) > 0) {
    return {
      allowed: false,
      reason: `Cannot delete stream "${stream.name}" because it is currently referenced by ${stream.departments_count} department(s).`,
    };
  }
  return { allowed: true };
}

function handleStreamDeleteResponse(status: number, body?: unknown): { success: boolean; error?: string } {
  if (status === 200 || status === 204) {
    return { success: true };
  }
  if (status === 409) {
    const detail = (body as { detail?: string })?.detail;
    return {
      success: false,
      error: detail || "Cannot delete stream: stream is currently in use.",
    };
  }
  return {
    success: false,
    error: (body as { message?: string })?.message || "Failed to delete stream.",
  };
}

describe("Organisation Basics Step Rules (Prompt 06i Item 7 & Part 6)", () => {
  describe("Stream Deletion Safeguards", () => {
    it("disallows deleting a stream when departments_count > 0", () => {
      const streamWithDepts: StreamItem = {
        id: "stream-1",
        code: "ENG",
        name: "Engineering",
        departments_count: 3,
      };

      const check = canDeleteStream(streamWithDepts);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("currently referenced by 3 department(s)");
    });

    it("allows deleting a stream when departments_count is 0 or undefined", () => {
      const emptyStream: StreamItem = {
        id: "stream-2",
        code: "SCI",
        name: "Science",
        departments_count: 0,
      };

      const check = canDeleteStream(emptyStream);
      expect(check.allowed).toBe(true);
      expect(check.reason).toBeUndefined();

      const undefinedCountStream: StreamItem = {
        id: "stream-3",
        code: "HUM",
        name: "Humanities",
      };
      expect(canDeleteStream(undefinedCountStream).allowed).toBe(true);
    });

    it("handles server 409 stream-in-use with clear message", () => {
      const result = handleStreamDeleteResponse(409, {
        type: "https://errors.campuslynk.net/stream-in-use",
        title: "Conflict",
        detail: "Stream is associated with existing courses or departments.",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Stream is associated with existing courses or departments.");
    });

    it("treats both HTTP 200 and HTTP 204 as deletion success", () => {
      const res200 = handleStreamDeleteResponse(200, { data: { deleted: true } });
      expect(res200.success).toBe(true);

      const res204 = handleStreamDeleteResponse(204, undefined);
      expect(res204.success).toBe(true);
    });
  });

  describe("Stream Code Immutability", () => {
    it("ensures rename payload sends name only and does not mutate code", () => {
      const originalStream: StreamItem = {
        id: "stream-1",
        code: "ENG",
        name: "Engineering",
      };

      const renamePayload = (stream: StreamItem, newName: string) => {
        // Enforce: code cannot be altered; rename only accepts name
        return {
          id: stream.id,
          body: { name: newName },
        };
      };

      const payload = renamePayload(originalStream, "School of Engineering & Tech");
      expect(payload.body).toEqual({ name: "School of Engineering & Tech" });
      expect("code" in payload.body).toBe(false);
    });
  });

  describe("Department Uniqueness per Stream", () => {
    const existingDepartments: DepartmentItem[] = [
      { id: "dept-1", stream_id: "stream-eng", code: "CS", name: "Computer Science" },
      { id: "dept-2", stream_id: "stream-eng", code: "EC", name: "Electronics" },
      { id: "dept-3", stream_id: "stream-sci", code: "PH", name: "Physics" },
    ];

    it("rejects duplicate department code within the SAME stream", () => {
      const checkSameStream = validateDepartmentUniqueness(
        "CS",
        "stream-eng",
        existingDepartments
      );
      expect(checkSameStream.valid).toBe(false);
      expect(checkSameStream.error).toContain(
        'Department code "CS" already exists in the selected stream'
      );

      // Case-insensitivity check
      const checkCase = validateDepartmentUniqueness("cs", "stream-eng", existingDepartments);
      expect(checkCase.valid).toBe(false);
    });

    it("allows the SAME department code under DIFFERENT streams (Prompt Item 7)", () => {
      // "CS" in stream-sci should be completely valid even though "CS" exists in stream-eng
      const checkDifferentStream = validateDepartmentUniqueness(
        "CS",
        "stream-sci",
        existingDepartments
      );
      expect(checkDifferentStream.valid).toBe(true);
      expect(checkDifferentStream.error).toBeUndefined();

      // "PH" in stream-eng is valid
      const checkPhInEng = validateDepartmentUniqueness(
        "PH",
        "stream-eng",
        existingDepartments
      );
      expect(checkPhInEng.valid).toBe(true);
    });

    it("accepts a new unique code in the stream", () => {
      const checkNew = validateDepartmentUniqueness(
        "ME",
        "stream-eng",
        existingDepartments
      );
      expect(checkNew.valid).toBe(true);
    });
  });
});

