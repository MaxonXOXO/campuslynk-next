import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TemporaryPasswordReveal } from "../src/components/super-admin/TemporaryPasswordReveal";

const TEMP_PASSWORD_FIXTURE = {
  temporary_password: "Tmp#9xK2!mQ7vL4z",
  expires_at: "2026-11-24T12:00:00Z",
};

describe("TemporaryPasswordReveal", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("masks by default, toggles Show/Hide, copies to clipboard, and requires checkbox acknowledgment before dismissal", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const logSpy = vi.spyOn(console, "log");
    const warnSpy = vi.spyOn(console, "warn");
    const errorSpy = vi.spyOn(console, "error");
    const onDismiss = vi.fn();

    const { unmount } = render(
      <TemporaryPasswordReveal
        recipientName="Dr. Asha Nair"
        payload={TEMP_PASSWORD_FIXTURE}
        onDismiss={onDismiss}
      />
    );

    const passwordEl = screen.getByTestId("temporary-password-value");
    expect(passwordEl.textContent).not.toContain(TEMP_PASSWORD_FIXTURE.temporary_password);
    expect(passwordEl.textContent).toBe("••••••••••••••••");

    const toggleBtn = screen.getByRole("button", { name: "Show temporary password" });
    expect(toggleBtn).toHaveAttribute("aria-pressed", "false");
    await user.click(toggleBtn);
    expect(passwordEl.textContent).toBe(TEMP_PASSWORD_FIXTURE.temporary_password);
    expect(screen.getByRole("button", { name: "Hide temporary password" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await user.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith(TEMP_PASSWORD_FIXTURE.temporary_password);
    expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument();

    const doneBtn = screen.getByRole("button", { name: "Done" });
    expect(doneBtn).toBeDisabled();

    const ackCheckbox = screen.getByRole("checkbox", {
      name: /i have copied it/i,
    });
    await user.click(ackCheckbox);
    expect(doneBtn).toBeEnabled();

    await user.click(doneBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    // Ensure temporary password never leaked into web storage, URL, or console
    expect(JSON.stringify(localStorage)).not.toContain(TEMP_PASSWORD_FIXTURE.temporary_password);
    expect(JSON.stringify(sessionStorage)).not.toContain(TEMP_PASSWORD_FIXTURE.temporary_password);
    expect(window.location.href).not.toContain(TEMP_PASSWORD_FIXTURE.temporary_password);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    unmount();
  });
});

