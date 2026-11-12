"use client";

import * as React from "react";
import type { StepId } from "./step-derivation";

const HISTORY_KEY = "campuslynkSetupHistory";

interface HistoryMarker {
  session: string;
  index: number;
}

interface ActiveEntry {
  marker: HistoryMarker;
  href: string;
  navigationIndex: number | null;
  historyLength: number;
}

type PendingNavigation =
  | { kind: "wizard"; action: () => void }
  | { kind: "history"; delta: number };

interface SetupNavigationOptions {
  hasUnsavedChanges: () => boolean;
  isSaving: () => boolean;
  protectDocument: boolean;
  onDiscard: () => void;
  onHistoryNavigate: (url: URL) => void;
}

function readMarker(state: unknown): HistoryMarker | null {
  if (!state || typeof state !== "object") return null;
  const marker = (state as Record<string, unknown>)[HISTORY_KEY];
  if (!marker || typeof marker !== "object") return null;
  const { session, index } = marker as Partial<HistoryMarker>;
  return typeof session === "string" && typeof index === "number" && Number.isInteger(index)
    ? { session, index }
    : null;
}

function navigationIndex(): number | null {
  // The Navigation API can also identify same-document entries outside the wizard.
  const navigation = (window as Window & {
    navigation?: { currentEntry?: { index: number } | null };
  }).navigation;
  return navigation?.currentEntry?.index ?? null;
}

/** Scoped guard: App Router has no public, global route-change blocking API. */
export function useSetupNavigation(options: SetupNavigationOptions) {
  const optionsRef = React.useRef(options);
  React.useLayoutEffect(() => { optionsRef.current = options; }, [options]);

  const activeEntry = React.useRef<ActiveEntry | null>(null);
  const pendingNavigation = React.useRef<PendingNavigation | null>(null);
  const restoring = React.useRef(false);
  const replaying = React.useRef(false);
  const afterRestoreNavigation = React.useRef<(() => void) | null>(null);
  const [warningOpen, setWarningOpen] = React.useState(false);
  const [isRestoringHistory, setIsRestoringHistory] = React.useState(false);

  React.useEffect(() => {
    const marker = readMarker(window.history.state) ?? { session: crypto.randomUUID(), index: 0 };
    // Preserve the complete Next.js state when annotating an existing entry.
    window.history.replaceState({ ...window.history.state, [HISTORY_KEY]: marker }, "");
    activeEntry.current = {
      marker, href: window.location.href, navigationIndex: navigationIndex(), historyLength: window.history.length,
    };

    const traversalDelta = (targetMarker: HistoryMarker | null): number => {
      const source = activeEntry.current!;
      const targetIndex = navigationIndex();
      if (source.navigationIndex !== null && targetIndex !== null) {
        return targetIndex - source.navigationIndex;
      }
      if (targetMarker?.session === source.marker.session) {
        return targetMarker.index - source.marker.index;
      }
      // Legacy History API has no index for the adjacent, pre-wizard Back entry.
      return -1;
    };

    const adoptEntry = (targetMarker: HistoryMarker | null) => {
      const source = activeEntry.current!;
      activeEntry.current = {
        marker: targetMarker ?? { session: source.marker.session, index: source.marker.index - 1 },
        href: window.location.href,
        navigationIndex: navigationIndex(),
        historyLength: window.history.length,
      };
    };

    const onPopState = (event: PopStateEvent) => {
      const source = activeEntry.current!;
      const targetMarker = readMarker(event.state);

      if (restoring.current && !replaying.current) {
        // Neither the rejected traversal nor its rewind should reach App Router.
        event.stopImmediatePropagation();
        if (window.location.href !== source.href ||
          (targetMarker && (targetMarker.session !== source.marker.session || targetMarker.index !== source.marker.index))) {
          const delta = traversalDelta(targetMarker);
          if (delta !== 0) window.history.go(-delta);
          return;
        }

        restoring.current = false;
        setIsRestoringHistory(false);
        const afterRestore = afterRestoreNavigation.current;
        afterRestoreNavigation.current = null;
        if (afterRestore) {
          pendingNavigation.current = null;
          setWarningOpen(false);
          afterRestore();
        } else if (pendingNavigation.current && optionsRef.current.hasUnsavedChanges()) {
          setWarningOpen(true);
        } else {
          pendingNavigation.current = null;
        }
        return;
      }

      if (replaying.current) {
        replaying.current = false;
        restoring.current = false;
        setIsRestoringHistory(false);
        adoptEntry(targetMarker);
        optionsRef.current.onHistoryNavigate(new URL(window.location.href));
        return;
      }

      if (window.location.href === source.href && !optionsRef.current.isSaving()) {
        adoptEntry(targetMarker);
        return;
      }

      if (optionsRef.current.isSaving() || optionsRef.current.hasUnsavedChanges()) {
        // popstate is not cancelable; capture it before Next.js sees the new URL,
        // then rewind rather than pushing a replacement that destroys Forward.
        event.stopImmediatePropagation();
        const delta = traversalDelta(targetMarker);
        if (delta === 0) return;
        pendingNavigation.current = optionsRef.current.isSaving() ? null : { kind: "history", delta };
        restoring.current = true;
        setIsRestoringHistory(true);
        window.history.go(-delta);
        return;
      }

      adoptEntry(targetMarker);
      optionsRef.current.onHistoryNavigate(new URL(window.location.href));
    };

    window.addEventListener("popstate", onPopState, true);
    return () => {
      window.removeEventListener("popstate", onPopState, true);
      const source = activeEntry.current;
      const currentMarker = readMarker(window.history.state);
      // Record an adjacent SPA push exit so returning with Back can also guard
      // Forward to that route. Only annotate; never add an extra history entry.
      if (source && window.location.href !== source.href &&
        window.history.length === source.historyLength + 1 &&
        (!currentMarker || (currentMarker.session === source.marker.session && currentMarker.index === source.marker.index))) {
        window.history.replaceState({
          ...window.history.state,
          [HISTORY_KEY]: { session: source.marker.session, index: source.marker.index + 1 },
        }, "");
      }
      activeEntry.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (!options.protectDocument) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!optionsRef.current.hasUnsavedChanges() && !optionsRef.current.isSaving()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [options.protectDocument]);

  const requestNavigation = (action: () => void, afterSave = false) => {
    if (optionsRef.current.isSaving()) return;
    if (restoring.current) {
      // A successful save still advances if its response wins the rewind race.
      if (afterSave && !optionsRef.current.hasUnsavedChanges()) afterRestoreNavigation.current = action;
      return;
    }
    if (optionsRef.current.hasUnsavedChanges()) {
      pendingNavigation.current = { kind: "wizard", action };
      setWarningOpen(true);
      return;
    }
    action();
  };

  const pushStep = (step: StepId) => {
    if (optionsRef.current.isSaving() || restoring.current || !activeEntry.current) return;
    const source = activeEntry.current;
    const url = new URL(source.href);
    url.searchParams.set("step", step);
    if (url.href === source.href) return;
    const marker = { session: source.marker.session, index: source.marker.index + 1 };
    // Next.js's documented native-history integration copies its internal fields
    // into this new entry and updates useSearchParams without a route fetch.
    window.history.pushState({ [HISTORY_KEY]: marker }, "", `${url.pathname}${url.search}${url.hash}`);
    activeEntry.current = {
      marker, href: url.href, navigationIndex: navigationIndex(), historyLength: window.history.length,
    };
  };

  const confirmDiscard = () => {
    if (optionsRef.current.isSaving() || restoring.current) return;
    const pending = pendingNavigation.current;
    pendingNavigation.current = null;
    setWarningOpen(false);
    if (!pending) return;
    optionsRef.current.onDiscard();
    if (pending.kind === "wizard") {
      pending.action();
    } else {
      replaying.current = true;
      restoring.current = true;
      setIsRestoringHistory(true);
      window.history.go(pending.delta);
    }
  };

  const cancelNavigation = () => {
    if (optionsRef.current.isSaving() || restoring.current) return;
    pendingNavigation.current = null;
    setWarningOpen(false);
  };

  return { requestNavigation, pushStep, warningOpen, confirmDiscard, cancelNavigation, isRestoringHistory };
}
