"use client";

import * as React from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@academic-suite/ui";
import { RiAlertLine } from "@remixicon/react";

interface DirtyStepWarningDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DirtyStepWarningDialog({
  open,
  onConfirm,
  onCancel,
}: DirtyStepWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive mb-1">
            <RiAlertLine className="size-5 shrink-0" aria-hidden="true" />
            <DialogTitle>Unsaved Changes</DialogTitle>
          </div>
          <DialogDescription>
            You have unsaved changes on this step. If you navigate away now, your modifications
            will not be saved.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onCancel}>
            Stay on Step
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Discard &amp; Leave
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

