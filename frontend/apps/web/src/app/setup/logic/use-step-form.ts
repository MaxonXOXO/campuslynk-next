"use client";

import * as React from "react";

function sameValues<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Tracks a step against its persisted snapshot, including unsaved defaults. */
export function useStepForm<T>(
  initialValues: T,
  isPersisted: boolean,
  onDirtyChange?: (isDirty: boolean) => void,
  areEqual: (left: T, right: T) => boolean = sameValues
) {
  const [values, setValues] = React.useState(initialValues);
  const [savedSnapshot, setSavedSnapshot] = React.useState({ values: initialValues, isPersisted });
  const previousInitial = React.useRef({ values: initialValues, isPersisted });

  React.useEffect(() => {
    const previous = previousInitial.current;
    if (sameValues(previous.values, initialValues) && previous.isPersisted === isPersisted) return;

    previousInitial.current = { values: initialValues, isPersisted };
    // Hydrate untouched forms, but never replace edits with a background refresh.
    setValues((current) => areEqual(current, previous.values) ? initialValues : current);
    setSavedSnapshot({ values: initialValues, isPersisted });
  }, [initialValues, isPersisted, areEqual]);

  const isDirty = !savedSnapshot.isPersisted || !areEqual(values, savedSnapshot.values);

  React.useLayoutEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const markSaved = (savedValues: T) => {
    setSavedSnapshot({ values: savedValues, isPersisted: true });
    // Clear the page's guard synchronously before Save & Continue navigates.
    onDirtyChange?.(false);
  };

  return { values, setValues, isDirty, markSaved };
}
