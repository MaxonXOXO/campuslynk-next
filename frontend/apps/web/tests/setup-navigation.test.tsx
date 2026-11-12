import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, Input } from "@academic-suite/ui";
import { useSetupNavigation } from "../src/app/setup/logic/use-setup-navigation";
import { isValidStepId, type StepId } from "../src/app/setup/logic/step-derivation";
import { DirtyStepWarningDialog } from "../src/app/setup/components/DirtyStepWarningDialog";

const routerPopState = vi.fn();
const onHistoryNavigate = vi.fn();
const routerState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: "existing-router-state" } };

function GuardHarness() {
  const [step, setStep] = React.useState<StepId>("institution_profile");
  const [draft, setDraft] = React.useState("");
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const dirtyRef = React.useRef(false);
  const savingRef = React.useRef(false);
  const navigation = useSetupNavigation({
    hasUnsavedChanges: () => dirtyRef.current,
    isSaving: () => savingRef.current,
    protectDocument: dirty || saving,
    onDiscard: () => {
      dirtyRef.current = false;
      setDirty(false);
      setDraft("");
    },
    onHistoryNavigate: (url) => {
      onHistoryNavigate(url.href);
      const target = url.searchParams.get("step");
      if (isValidStepId(target)) setStep(target);
    },
  });
  const goTo = (target: StepId) => {
    setStep(target);
    navigation.pushStep(target);
  };

  return (
    <div>
      <output aria-label="Current step">{step}</output>
      <output aria-label="Dirty state">{dirty ? "dirty" : "clean"}</output>
      <p role="status" aria-label="History restoration">{navigation.isRestoringHistory ? "Restoring history" : "History idle"}</p>
      <Input aria-label="Draft" value={draft} onChange={(event) => {
        const value = event.target.value;
        setDraft(value);
        dirtyRef.current = value !== "";
        setDirty(dirtyRef.current);
      }} />
      <Button onClick={() => navigation.requestNavigation(() => goTo("calendar_basics"))}>Go to calendar</Button>
      <Button onClick={() => navigation.requestNavigation(() => goTo("signup_policy"))}>Go to policy</Button>
      <Button onClick={() => { savingRef.current = true; setSaving(true); }}>Start save</Button>
      <Button onClick={() => { savingRef.current = false; setSaving(false); }}>Finish save</Button>
      <Button onClick={() => {
        dirtyRef.current = false;
        savingRef.current = false;
        setDirty(false);
        setSaving(false);
        navigation.requestNavigation(() => goTo("signup_policy"), true);
      }}>Finish save and continue</Button>
      <DirtyStepWarningDialog
        open={navigation.warningOpen}
        disabled={saving || navigation.isRestoringHistory}
        onConfirm={navigation.confirmDiscard}
        onCancel={navigation.cancelNavigation}
      />
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({ ...routerState, tenantContext: "preserve-existing-state" }, "", "/setup?step=institution_profile");
  const nativePush = window.history.pushState.bind(window.history);
  // Model Next.js's documented native-history integration, not a route blocker.
  vi.spyOn(window.history, "pushState").mockImplementation((data, unused, url) => {
    if (data?.__NA) {
      nativePush(data, unused, url);
      return;
    }
    const current = window.history.state;
    nativePush({ ...data, __NA: current?.__NA, __PRIVATE_NEXTJS_INTERNALS_TREE: current?.__PRIVATE_NEXTJS_INTERNALS_TREE }, unused, url);
  });
  window.addEventListener("popstate", routerPopState);
});

afterEach(() => {
  cleanup();
  window.removeEventListener("popstate", routerPopState);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function dirtyDraft() {
  fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "Unsaved draft" } });
}

async function waitForStep(step: StepId) {
  await waitFor(() => expect(screen.getByLabelText("Current step")).toHaveTextContent(step));
  expect(new URLSearchParams(window.location.search).get("step")).toBe(step);
}

function beforeUnload() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe("Setup history and document-exit guards", () => {
  it("preserves existing Next.js history state and allows clean Back and Forward", async () => {
    const user = userEvent.setup();
    render(<GuardHarness />);
    expect(window.history.state).toMatchObject({ ...routerState, tenantContext: "preserve-existing-state" });
    await user.click(screen.getByRole("button", { name: "Go to calendar" }));
    await user.click(screen.getByRole("button", { name: "Go to policy" }));
    expect(window.history.state).toMatchObject(routerState);

    await act(async () => { window.history.back(); });
    await waitForStep("calendar_basics");
    await act(async () => { window.history.forward(); });
    await waitForStep("signup_policy");
    expect(routerPopState).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("rewinds dirty Back before Next.js sees it; Stay retains the mounted draft and Discard replays Back", async () => {
    const user = userEvent.setup();
    render(<GuardHarness />);
    await user.click(screen.getByRole("button", { name: "Go to calendar" }));
    dirtyDraft();
    const input = screen.getByLabelText("Draft");
    const sourceHref = window.location.href;
    const sourceState = window.history.state;
    const historyLength = window.history.length;

    await act(async () => { window.history.back(); });
    await screen.findByRole("dialog", { name: "Unsaved Changes" });
    expect(window.location.href).toBe(sourceHref);
    expect(window.history.state).toEqual(sourceState);
    expect(window.history.length).toBe(historyLength);
    expect(screen.getByLabelText("Draft")).toBe(input);
    expect(input).toHaveValue("Unsaved draft");
    expect(routerPopState).not.toHaveBeenCalled();
    expect(onHistoryNavigate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Stay on Step" }));
    expect(input).toHaveValue("Unsaved draft");
    expect(screen.getByLabelText("Dirty state")).toHaveTextContent("dirty");

    await act(async () => { window.history.back(); });
    await screen.findByRole("dialog", { name: "Unsaved Changes" });
    await user.click(screen.getByRole("button", { name: "Discard & Leave" }));
    await waitForStep("institution_profile");
    expect(screen.getByLabelText("Dirty state")).toHaveTextContent("clean");
    expect(screen.getByLabelText("Draft")).toHaveValue("");
    expect(routerPopState).toHaveBeenCalledOnce();
    expect(window.history.length).toBe(historyLength);
  });

  it("guards dirty Forward and preserves the forward entry after choosing Stay", async () => {
    const user = userEvent.setup();
    render(<GuardHarness />);
    await user.click(screen.getByRole("button", { name: "Go to calendar" }));
    await user.click(screen.getByRole("button", { name: "Go to policy" }));
    await act(async () => { window.history.back(); });
    await waitForStep("calendar_basics");
    routerPopState.mockClear();
    dirtyDraft();
    const length = window.history.length;

    await act(async () => { window.history.forward(); });
    await screen.findByRole("dialog", { name: "Unsaved Changes" });
    expect(new URLSearchParams(window.location.search).get("step")).toBe("calendar_basics");
    expect(routerPopState).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Stay on Step" }));

    await act(async () => { window.history.forward(); });
    await screen.findByRole("dialog", { name: "Unsaved Changes" });
    await user.click(screen.getByRole("button", { name: "Discard & Leave" }));
    await waitForStep("signup_policy");
    expect(window.history.length).toBe(length);
    expect(routerPopState).toHaveBeenCalledOnce();
  });

  it("rewinds and replays a multi-entry wizard traversal without creating history entries", async () => {
    const user = userEvent.setup();
    render(<GuardHarness />);
    await user.click(screen.getByRole("button", { name: "Go to calendar" }));
    await user.click(screen.getByRole("button", { name: "Go to policy" }));
    dirtyDraft();
    const length = window.history.length;
    const go = vi.spyOn(window.history, "go");

    await act(async () => { window.history.go(-2); });
    await screen.findByRole("dialog", { name: "Unsaved Changes" });
    expect(go).toHaveBeenCalledWith(2);
    expect(screen.getByLabelText("Current step")).toHaveTextContent("signup_policy");
    await user.click(screen.getByRole("button", { name: "Discard & Leave" }));
    await waitForStep("institution_profile");
    expect(window.history.length).toBe(length);
  });

  it("protects an adjacent Back exit from the first wizard entry", async () => {
    const user = userEvent.setup();
    const outsideState = { ...routerState, outside: "unchanged" };
    window.history.replaceState(outsideState, "", "/home");
    window.history.pushState(routerState, "", "/setup?step=institution_profile");
    render(<GuardHarness />);
    dirtyDraft();

    await act(async () => { window.history.back(); });
    await screen.findByRole("dialog", { name: "Unsaved Changes" });
    expect(window.location.pathname).toBe("/setup");
    expect(screen.getByLabelText("Draft")).toHaveValue("Unsaved draft");
    await user.click(screen.getByRole("button", { name: "Discard & Leave" }));
    await waitFor(() => expect(window.location.pathname).toBe("/home"));
    expect(window.history.state).toEqual(outsideState);
    expect(routerPopState).toHaveBeenCalledOnce();
  });

  it("blocks step requests and Back during a save without queuing the attempted navigation", async () => {
    const user = userEvent.setup();
    render(<GuardHarness />);
    await user.click(screen.getByRole("button", { name: "Go to calendar" }));
    await user.click(screen.getByRole("button", { name: "Start save" }));
    await user.click(screen.getByRole("button", { name: "Go to policy" }));
    expect(screen.getByLabelText("Current step")).toHaveTextContent("calendar_basics");

    const go = vi.spyOn(window.history, "go");
    await act(async () => { window.history.back(); });
    await waitFor(() => expect(go).toHaveBeenCalledWith(1));
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get("step")).toBe("calendar_basics");
      expect(screen.getByRole("status", { name: "History restoration" })).toHaveTextContent("History idle");
    });
    expect(routerPopState).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Finish save" }));
    expect(screen.getByLabelText("Current step")).toHaveTextContent("calendar_basics");
    await act(async () => { window.history.back(); });
    await waitForStep("institution_profile");
  });

  it("still advances after a successful save that resolves before a blocked Back rewind", async () => {
    const user = userEvent.setup();
    render(<GuardHarness />);
    await user.click(screen.getByRole("button", { name: "Go to calendar" }));
    dirtyDraft();
    await user.click(screen.getByRole("button", { name: "Start save" }));
    const nativeGo = window.history.go.bind(window.history);
    const go = vi.spyOn(window.history, "go").mockImplementation(() => undefined);

    await act(async () => { window.history.back(); });
    await waitFor(() => expect(go).toHaveBeenCalledWith(1));
    await user.click(screen.getByRole("button", { name: "Finish save and continue" }));
    expect(screen.getByLabelText("Current step")).toHaveTextContent("calendar_basics");
    expect(screen.getByRole("status", { name: "History restoration" })).toHaveTextContent("Restoring history");

    await act(async () => { nativeGo(1); });
    await waitForStep("signup_policy");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "History restoration" })).toHaveTextContent("History idle");
  });

  it("protects refresh/close only while dirty or saving, and cleans up on unmount", async () => {
    const user = userEvent.setup();
    const view = render(<GuardHarness />);
    expect(beforeUnload().defaultPrevented).toBe(false);
    dirtyDraft();
    expect(beforeUnload().defaultPrevented).toBe(true);

    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "" } });
    expect(beforeUnload().defaultPrevented).toBe(false);
    await user.click(screen.getByRole("button", { name: "Start save" }));
    expect(beforeUnload().defaultPrevented).toBe(true);
    await user.click(screen.getByRole("button", { name: "Finish save" }));
    expect(beforeUnload().defaultPrevented).toBe(false);

    dirtyDraft();
    view.unmount();
    expect(beforeUnload().defaultPrevented).toBe(false);
  });

  it("records an adjacent SPA exit without extra history entries and guards Forward after returning", async () => {
    const user = userEvent.setup();
    const view = render(<GuardHarness />);
    const outsideState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: "portal-router-state" }, routeState: "keep" };
    await act(async () => { window.history.pushState(outsideState, "", "/home"); });
    const historyLength = window.history.length;
    view.unmount();
    expect(window.history.length).toBe(historyLength);
    expect(window.history.state).toMatchObject(outsideState);

    await act(async () => { window.history.back(); });
    await waitFor(() => expect(window.location.pathname).toBe("/setup"));
    routerPopState.mockClear();
    render(<GuardHarness />);
    dirtyDraft();
    await act(async () => { window.history.forward(); });
    await screen.findByRole("dialog", { name: "Unsaved Changes" });
    expect(window.location.pathname).toBe("/setup");
    expect(screen.getByLabelText("Draft")).toHaveValue("Unsaved draft");
    expect(routerPopState).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Discard & Leave" }));
    await waitFor(() => expect(window.location.pathname).toBe("/home"));
    expect(window.history.state).toMatchObject(outsideState);
    expect(window.history.length).toBe(historyLength);
  });

  it("uses Navigation API positions to guard Forward to an unindexed same-document route", async () => {
    const user = userEvent.setup();
    const outsideState = { ...routerState, outside: "unindexed" };
    window.history.pushState(outsideState, "", "/home");
    await act(async () => { window.history.back(); });
    await waitFor(() => expect(window.location.pathname).toBe("/setup"));
    routerPopState.mockClear();
    const descriptor = Object.getOwnPropertyDescriptor(window, "navigation");
    const navigation = { currentEntry: { index: 0 } };
    const updateIndex = () => { navigation.currentEntry.index = window.location.pathname === "/home" ? 1 : 0; };
    Object.defineProperty(window, "navigation", { configurable: true, value: navigation });
    window.addEventListener("popstate", updateIndex, true);
    try {
      render(<GuardHarness />);
      dirtyDraft();
      await act(async () => { window.history.forward(); });
      await screen.findByRole("dialog", { name: "Unsaved Changes" });
      expect(window.location.pathname).toBe("/setup");
      expect(routerPopState).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Discard & Leave" }));
      await waitFor(() => expect(window.location.pathname).toBe("/home"));
      expect(window.history.state).toEqual(outsideState);
    } finally {
      window.removeEventListener("popstate", updateIndex, true);
      if (descriptor) Object.defineProperty(window, "navigation", descriptor);
      else Reflect.deleteProperty(window, "navigation");
    }
  });
});
