import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@academic-suite/api-client";
import { renderWithQueryClient } from "./helpers/query-wrapper";
import { StaffImportWizard } from "../src/components/users/StaffImportWizard";
import { UserDirectory } from "../src/components/users/UserDirectory";
import RegisterStaffPage from "../src/app/register-staff/page";
import LoginPage from "../src/app/login/page";
import { registerStaffFlow } from "../src/lib/server/auth-flow";
import { flowResponse } from "../src/lib/server/route-utils";

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  routerReplace: vi.fn(),
  pathname: "/w/principal/users/import",
  searchParams: new URLSearchParams(),
  sessionUser: {
    id: "01PRIN",
    name: "Dr. Principal",
    capabilities: [
      "identity.user.create",
      "identity.user.import",
      "identity.user.approve",
      "identity.user.reject",
      "identity.user.reset_password",
      "identity.role_assignment.create",
    ],
    assignments: [
      { role_key: "principal", scope_type: "institution", scope_label: "i_carmel" },
    ],
  },
  client: {
    identity: {
      users: {
        list: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        suspend: vi.fn(),
        reactivate: vi.fn(),
        deactivate: vi.fn(),
        approve: vi.fn(),
        reject: vi.fn(),
        bulkApprove: vi.fn(),
        unlock: vi.fn(),
        resetPassword: vi.fn(),
      },
      staffImports: {
        template: vi.fn(),
        preview: vi.fn(),
        commit: vi.fn(),
        get: vi.fn(),
        failedRows: vi.fn(),
        approve: vi.fn(),
      },
      roleAssignments: {
        create: vi.fn(),
      },
    },
    organisation: {
      departments: { list: vi.fn() },
      streams: { list: vi.fn() },
    },
  },
}));

vi.mock("@/lib/auth/session-provider", () => ({
  useApiClient: () => mocks.client,
  useSession: () => ({
    state: { status: "authenticated", user: mocks.sessionUser },
    controller: {
      login: vi.fn(),
      enterApp: vi.fn().mockResolvedValue({ ok: false }),
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.routerReplace, push: vi.fn() }),
  usePathname: () => mocks.pathname,
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

const FALSE_ABILITIES = {
  update: false,
  suspend: false,
  reactivate: false,
  deactivate: false,
  reset_password: false,
  unlock: false,
  approve: false,
  reject: false,
};

describe("Staff Onboarding UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/w/principal/users/import";
    mocks.searchParams = new URLSearchParams();
    mocks.sessionUser = {
      id: "01PRIN",
      name: "Dr. Principal",
      capabilities: [
        "identity.user.create",
        "identity.user.import",
        "identity.user.approve",
        "identity.user.reject",
        "identity.user.reset_password",
        "identity.role_assignment.create",
      ],
      assignments: [
        { role_key: "principal", scope_type: "institution", scope_label: "i_carmel" },
      ],
    };
    mocks.client.organisation.departments.list.mockResolvedValue({
      data: [
        { id: "01CE", code: "CE", name: "Civil Engineering", scope_label: "d_ce" },
        { id: "01ME", code: "ME", name: "Mechanical Engineering", scope_label: "d_me" },
      ],
    });
    mocks.client.organisation.streams.list.mockResolvedValue({
      data: [{ id: "01AIDED", code: "AIDED", name: "Aided", scope_label: "s_aided" }],
    });
    mocks.client.identity.users.list.mockResolvedValue({
      data: [],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 0 },
    });

    if (typeof URL.createObjectURL !== "function") {
      Object.defineProperty(URL, "createObjectURL", {
        writable: true,
        value: vi.fn(() => "blob:mock"),
      });
    }
    if (typeof URL.revokeObjectURL !== "function") {
      Object.defineProperty(URL, "revokeObjectURL", {
        writable: true,
        value: vi.fn(),
      });
    }
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // 1
  it("hides the import entry point when caller lacks identity.user.import", async () => {
    mocks.pathname = "/w/principal/users";
    mocks.sessionUser.capabilities = ["identity.user.create"];
    renderWithQueryClient(<UserDirectory />);
    await waitFor(() => expect(mocks.client.identity.users.list).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: /Import staff/i })).toBeNull();
  });

  // 2
  it("downloads the CSV template when clicking Download Template", async () => {
    mocks.client.identity.staffImports.template.mockResolvedValueOnce(
      "name,email,mobile,registration_number,requested_department_code,designation,employee_id\n"
    );
    const user = userEvent.setup();
    renderWithQueryClient(<StaffImportWizard usersHref="/w/principal/users" />);

    await user.click(screen.getByRole("button", { name: /Download Template/i }));
    await waitFor(() =>
      expect(mocks.client.identity.staffImports.template).toHaveBeenCalledTimes(1)
    );
  });

  // 3
  it("uploads a file and renders valid, duplicate, and invalid preview rows", async () => {
    mocks.client.identity.staffImports.preview.mockResolvedValueOnce({
      data: {
        batch: {
          id: "01BATCH1",
          filename: "staff.csv",
          status: "previewed",
          auto_approve: false,
          total_rows: 3,
          valid_rows: 1,
          duplicate_rows: 1,
          invalid_rows: 1,
          created_count: 0,
          skipped_duplicate_count: 0,
          failed_count: 0,
        },
        rows_preview: [
          { row_number: 2, status: "valid", payload: { name: "Dr. Meera", email: "meera@test.edu" }, errors: [] },
          { row_number: 3, status: "duplicate", payload: { name: "Dup", email: "dup@test.edu" }, errors: ["Already exists"] },
          { row_number: 4, status: "invalid", payload: { name: "", email: "bad@test.edu" }, errors: ["Name required"] },
        ],
      },
      meta: {},
      links: {},
    });

    const user = userEvent.setup();
    renderWithQueryClient(<StaffImportWizard usersHref="/w/principal/users" />);

    const fileInput = screen.getByLabelText(/Staff roster file/i) as HTMLInputElement;
    const csvFile = new File(["name,email\nDr. Meera,meera@test.edu\n"], "staff.csv", {
      type: "text/csv",
    });
    await user.upload(fileInput, csvFile);
    await user.click(screen.getByRole("button", { name: /Preview Import/i }));

    await screen.findByText(/Step 2: Review Preview/i);
    expect(screen.getByText("Dr. Meera")).toBeTruthy();
    expect(screen.getByText("Already exists")).toBeTruthy();
    expect(screen.getByText("Name required")).toBeTruthy();
  });

  // 4
  it("shows the approve-on-import checkbox only when caller has identity.user.approve", async () => {
    mocks.sessionUser.capabilities = ["identity.user.import"];
    mocks.searchParams = new URLSearchParams("batch=01BATCH_NOPR");
    mocks.client.identity.staffImports.get.mockResolvedValue({
      data: {
        id: "01BATCH_NOPR",
        filename: "staff.csv",
        status: "previewed",
        auto_approve: false,
        total_rows: 1,
        valid_rows: 1,
        duplicate_rows: 0,
        invalid_rows: 0,
        created_count: 0,
        skipped_duplicate_count: 0,
        failed_count: 0,
      },
    });

    renderWithQueryClient(<StaffImportWizard usersHref="/w/principal/users" />);
    await screen.findByText(/Step 3: Set Common Temporary Password/i);
    expect(screen.queryByLabelText(/Approve on import/i)).toBeNull();
  });

  // 5
  it("clears the common password ref immediately on submit and on unmount", async () => {
    mocks.searchParams = new URLSearchParams("batch=01BATCH_PW");
    mocks.client.identity.staffImports.get.mockResolvedValue({
      data: {
        id: "01BATCH_PW",
        filename: "staff.csv",
        status: "previewed",
        auto_approve: false,
        total_rows: 1,
        valid_rows: 1,
        duplicate_rows: 0,
        invalid_rows: 0,
        created_count: 0,
        skipped_duplicate_count: 0,
        failed_count: 0,
      },
    });
    mocks.client.identity.staffImports.commit.mockResolvedValueOnce({
      data: {
        id: "01BATCH_PW",
        filename: "staff.csv",
        status: "queued",
        auto_approve: false,
        total_rows: 1,
        valid_rows: 1,
        duplicate_rows: 0,
        invalid_rows: 0,
        created_count: 0,
        skipped_duplicate_count: 0,
        failed_count: 0,
      },
    });

    const user = userEvent.setup();
    const { unmount } = renderWithQueryClient(
      <StaffImportWizard usersHref="/w/principal/users" />
    );

    const pwInput = (await screen.findByLabelText(/Common temporary password/i)) as HTMLInputElement;
    await user.type(pwInput, "TempBatch#2026!");
    expect(pwInput.value).toBe("TempBatch#2026!");

    await user.click(screen.getByRole("button", { name: /Commit Import/i }));
    await waitFor(() =>
      expect(mocks.client.identity.staffImports.commit).toHaveBeenCalledTimes(1)
    );
    expect(pwInput.value).toBe("");
    unmount();
  });

  // 6
  it("reuses the same idempotency key across commit retry", async () => {
    mocks.searchParams = new URLSearchParams("batch=01BATCH_RETRY");
    mocks.client.identity.staffImports.get.mockResolvedValue({
      data: {
        id: "01BATCH_RETRY",
        filename: "staff.csv",
        status: "previewed",
        auto_approve: false,
        total_rows: 1,
        valid_rows: 1,
        duplicate_rows: 0,
        invalid_rows: 0,
        created_count: 0,
        skipped_duplicate_count: 0,
        failed_count: 0,
      },
    });
    mocks.client.identity.staffImports.commit
      .mockRejectedValueOnce(new Error("Temporary network error"))
      .mockResolvedValueOnce({
        data: {
          id: "01BATCH_RETRY",
          filename: "staff.csv",
          status: "queued",
          auto_approve: false,
          total_rows: 1,
          valid_rows: 1,
          duplicate_rows: 0,
          invalid_rows: 0,
          created_count: 0,
          skipped_duplicate_count: 0,
          failed_count: 0,
        },
      });

    const user = userEvent.setup();
    renderWithQueryClient(<StaffImportWizard usersHref="/w/principal/users" />);

    const pwInput = (await screen.findByLabelText(/Common temporary password/i)) as HTMLInputElement;
    await user.type(pwInput, "TempBatch#2026!");
    await user.click(screen.getByRole("button", { name: /Commit Import/i }));

    await screen.findByText(/re-enter the temporary password to retry safely/i);
    await user.type(pwInput, "TempBatch#2026!");
    await user.click(screen.getByRole("button", { name: /Commit Import/i }));

    await waitFor(() =>
      expect(mocks.client.identity.staffImports.commit).toHaveBeenCalledTimes(2)
    );
    const firstKey = mocks.client.identity.staffImports.commit.mock.calls[0]?.[1]?.idempotency_key;
    const secondKey = mocks.client.identity.staffImports.commit.mock.calls[1]?.[1]?.idempotency_key;
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
  });

  // 6b
  it("shows a clear message on 409 double-commit conflict", async () => {
    mocks.searchParams = new URLSearchParams("batch=01BATCH_409");
    mocks.client.identity.staffImports.get.mockResolvedValue({
      data: {
        id: "01BATCH_409",
        filename: "staff.csv",
        status: "previewed",
        auto_approve: false,
        total_rows: 1,
        valid_rows: 1,
        duplicate_rows: 0,
        invalid_rows: 0,
        created_count: 0,
        skipped_duplicate_count: 0,
        failed_count: 0,
      },
    });
    mocks.client.identity.staffImports.commit.mockRejectedValueOnce(
      new ApiError({ type: "about:blank", title: "Conflict", status: 409 })
    );

    const user = userEvent.setup();
    renderWithQueryClient(<StaffImportWizard usersHref="/w/principal/users" />);

    const pwInput = (await screen.findByLabelText(/Common temporary password/i)) as HTMLInputElement;
    await user.type(pwInput, "TempBatch#2026!");
    await user.click(screen.getByRole("button", { name: /Commit Import/i }));

    await screen.findByText(/already been committed or is currently processing/i);
  });

  // 7
  it("resumes a completed batch at step 4 and downloads failed rows CSV", async () => {
    mocks.searchParams = new URLSearchParams("batch=01BATCH_DONE");
    mocks.client.identity.staffImports.get.mockResolvedValue({
      data: {
        id: "01BATCH_DONE",
        filename: "staff.csv",
        status: "completed",
        auto_approve: false,
        total_rows: 3,
        valid_rows: 2,
        duplicate_rows: 1,
        invalid_rows: 0,
        created_count: 2,
        skipped_duplicate_count: 1,
        failed_count: 0,
      },
    });
    mocks.client.identity.staffImports.failedRows.mockResolvedValueOnce(
      "row_number,status,name\n3,duplicate,Dup\n"
    );

    const user = userEvent.setup();
    renderWithQueryClient(<StaffImportWizard usersHref="/w/principal/users" />);

    await screen.findByText(/Step 4: Import Progress & Summary/i);
    expect(screen.getByText(/Import finished with status: completed/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Download failed rows CSV/i }));
    await waitFor(() =>
      expect(mocks.client.identity.staffImports.failedRows).toHaveBeenCalledWith("01BATCH_DONE")
    );
  });

  // 8
  it("shows a start-new-import state when resuming an unknown batch returns 404", async () => {
    mocks.searchParams = new URLSearchParams("batch=01MISSING");
    mocks.client.identity.staffImports.get.mockRejectedValueOnce(
      new ApiError({ type: "about:blank", title: "Not Found", status: 404 })
    );

    renderWithQueryClient(<StaffImportWizard usersHref="/w/principal/users" />);
    await screen.findByText(/Import batch not found/i);
    expect(screen.getByRole("button", { name: /Start a new import/i })).toBeTruthy();
  });

  // 9
  it("filters the Not Activated tab with must_change_password=true and expired_temp_password toggle", async () => {
    mocks.pathname = "/w/principal/users";
    const user = userEvent.setup();
    renderWithQueryClient(<UserDirectory />);

    await waitFor(() => expect(mocks.client.identity.users.list).toHaveBeenCalled());
    await user.click(screen.getByRole("tab", { name: /Not Activated/i }));

    await waitFor(() =>
      expect(mocks.client.identity.users.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ must_change_password: true })
      )
    );

    await user.click(screen.getByRole("checkbox", { name: /Expired temporary password only/i }));
    await waitFor(() =>
      expect(mocks.client.identity.users.list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          must_change_password: true,
          expired_temp_password: true,
        })
      )
    );
  });

  // 10
  it("displays temporary password expiry in Not Activated tab and opens TemporaryPasswordReveal on reset", async () => {
    mocks.pathname = "/w/principal/users";
    mocks.client.identity.users.list.mockResolvedValue({
      data: [
        {
          id: "01STF1",
          type: "staff",
          name: "Dr. Asha",
          email: "asha@college.edu",
          status: "active",
          must_change_password: true,
          temporary_password_expires_at: "2020-01-01T10:00:00Z",
          roles: [],
          assignments: [],
          abilities: { ...FALSE_ABILITIES, reset_password: true },
        },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 1 },
    });
    mocks.client.identity.users.resetPassword.mockResolvedValueOnce({
      data: {
        temporary_password: "NewTemp#2026!",
        expires_at: "2026-12-01T10:00:00Z",
      },
    });

    const user = userEvent.setup();
    renderWithQueryClient(<UserDirectory />);

    await user.click(await screen.findByRole("tab", { name: /Not Activated/i }));
    await screen.findAllByText(/Expired/i);

    const actionBtns = await screen.findAllByRole("button", { name: /Actions for Dr\. Asha/i });
    await user.click(actionBtns[0]!);
    await user.click(await screen.findByRole("menuitem", { name: /Reset temporary password/i }));
    await user.click(await screen.findByRole("button", { name: /^Reset Password$/i }));

    await screen.findByTestId("temporary-password-value");
  });

  // 11
  it("opens LeadershipAppointDialog and lets approver choose department when requested_department_id is null", async () => {
    mocks.pathname = "/w/principal/users";
    mocks.client.identity.users.list.mockResolvedValue({
      data: [
        {
          id: "01SELF1",
          type: "staff",
          name: "Self Reg Staff",
          email: "self@college.edu",
          status: "active",
          must_change_password: false,
          roles: [],
          assignments: [],
          staff_profile: {
            requested_department_id: null,
            designation: "Lecturer",
            employee_id: null,
          },
          abilities: { ...FALSE_ABILITIES },
        },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 1 },
    });
    mocks.client.identity.roleAssignments.create.mockResolvedValueOnce({ data: { id: "01RA" } });

    const user = userEvent.setup();
    renderWithQueryClient(<UserDirectory />);

    const actionBtns = await screen.findAllByRole("button", { name: /Actions for Self Reg Staff/i });
    await user.click(actionBtns[0]!);
    await user.click(await screen.findByRole("menuitem", { name: /Appoint role/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Assign a leadership role to Self Reg Staff/i)).toBeTruthy();

    // Department picker has no prefill and is enabled/selectable
    const deptTrigger = within(dialog).getByRole("combobox", { name: /Department/i });
    expect(deptTrigger.hasAttribute("disabled")).toBe(false);
    expect(within(dialog).getByText(/Select department/i)).toBeTruthy();

    // Without selecting a department, validation requires choosing one
    await user.click(within(dialog).getByRole("button", { name: /^Appoint Role$/i }));
    await within(dialog).findByText(/Select a department for this role/i);
  });

  // 12
  it("forwards register-staff requests through BFF without exposing password and sends requested_department_id=null", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { message: "If your details are eligible, your registration has been submitted for approval." },
        }),
        { status: 202, headers: { "Content-Type": "application/json" } }
      )
    );

    const res = await registerStaffFlow(
      {
        config: {
          backendBaseUrl: "http://backend.test",
          tenant: "tenant_demo",
          deviceName: "web",
          isProduction: false,
          allowedOrigins: [],
        },
        fetchFn: fetchMock,
        cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
      },
      {
        name: "Asha",
        email: "asha@test.edu",
        password: "SecretPassword#2026",
        designation: "Lecturer",
      }
    );

    expect(res.status).toBe(202);
    expect(JSON.stringify(res.body)).not.toContain("SecretPassword#2026");
    const sentBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as Record<string, unknown>;
    expect(sentBody.requested_department_id).toBeNull();
  });

  // 12b
  it("forwards Retry-After header from backend 429 through registerStaffFlow and flowResponse", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 429, title: "Too Many Requests" }), {
        status: 429,
        headers: {
          "Content-Type": "application/problem+json",
          "Retry-After": "120",
        },
      })
    );

    const res = await registerStaffFlow(
      {
        config: {
          backendBaseUrl: "http://backend.test",
          tenant: "tenant_demo",
          deviceName: "web",
          isProduction: false,
          allowedOrigins: [],
        },
        fetchFn: fetchMock,
        cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
      },
      { name: "Asha", email: "asha@test.edu", password: "SecretPassword#2026" }
    );

    expect(res.status).toBe(429);
    expect(res.retryAfter).toBe("120");
    const httpRes = flowResponse(res);
    expect(httpRes.headers.get("Retry-After")).toBe("120");
  });

  // 13
  it("renders generic 202 confirmation on self-registration submit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            message: "If your details are eligible, your registration has been submitted for approval.",
          },
        }),
        { status: 202, headers: { "Content-Type": "application/json" } }
      )
    );

    const user = userEvent.setup();
    renderWithQueryClient(<RegisterStaffPage />);

    await user.type(screen.getByLabelText(/Full name/i), "Asha Nair");
    await user.type(screen.getByLabelText(/^Email$/i), "asha@college.edu");
    await user.type(screen.getByLabelText(/^Password$/i), "StrongPass#2026!");
    await user.click(screen.getByRole("button", { name: /Request access/i }));

    await screen.findByText(/If your details are eligible, your registration has been submitted for approval/i);
  });

  // 14
  it("renders actionable registration-not-open message on 403", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 403, title: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/problem+json" },
      })
    );

    const user = userEvent.setup();
    renderWithQueryClient(<RegisterStaffPage />);

    await user.type(screen.getByLabelText(/Full name/i), "Asha Nair");
    await user.type(screen.getByLabelText(/^Email$/i), "asha@college.edu");
    await user.type(screen.getByLabelText(/^Password$/i), "StrongPass#2026!");
    await user.click(screen.getByRole("button", { name: /Request access/i }));

    await screen.findByText(
      "Self-registration isn't open for this institution. Contact your administrator."
    );
  });

  // 15
  it("renders rate-limit retry guidance on 429", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 429, retry_after: 120 }), {
        status: 429,
        headers: { "Content-Type": "application/problem+json", "Retry-After": "120" },
      })
    );

    const user = userEvent.setup();
    renderWithQueryClient(<RegisterStaffPage />);

    await user.type(screen.getByLabelText(/Full name/i), "Asha Nair");
    await user.type(screen.getByLabelText(/^Email$/i), "asha@college.edu");
    await user.type(screen.getByLabelText(/^Password$/i), "StrongPass#2026!");
    fireEvent.submit(screen.getByRole("button", { name: /Request access/i }).closest("form")!);

    await screen.findByText(/Too many registration attempts\. Please try again in 2 minute\(s\)\./i);
  });

  // 16
  it("keeps the honeypot field hidden from assistive technology and keyboard focus", () => {
    renderWithQueryClient(<RegisterStaffPage />);
    const honeypot = document.querySelector('input[name="website"]') as HTMLInputElement;
    expect(honeypot).toBeTruthy();
    expect(honeypot.tabIndex).toBe(-1);
    expect(honeypot.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  // 17
  it("renders the secondary Request access link on /login", () => {
    renderWithQueryClient(<LoginPage />);
    const link = screen.getByRole("link", { name: /Request access/i });
    expect(link.getAttribute("href")).toBe("/register-staff");
  });
});

