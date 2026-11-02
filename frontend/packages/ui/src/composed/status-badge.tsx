import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

export type SemanticStatus = "success" | "warning" | "danger" | "info" | "neutral";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors select-none",
  {
    variants: {
      status: {
        success: "border-primary/25 bg-primary/10 text-primary dark:bg-primary/20",
        warning: "border-chart-4/30 bg-chart-4/15 text-chart-4 dark:border-chart-4/40 dark:bg-chart-4/25",
        danger: "border-destructive/25 bg-destructive/10 text-destructive dark:bg-destructive/20",
        info: "border-chart-2/30 bg-chart-2/15 text-chart-2 dark:border-chart-2/40 dark:bg-chart-2/25",
        neutral: "border-border bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      status: "neutral",
    },
  }
);

const statusDotVariants = cva("size-1.5 rounded-full shrink-0", {
  variants: {
    status: {
      success: "bg-primary",
      warning: "bg-chart-4",
      danger: "bg-destructive",
      info: "bg-chart-2",
      neutral: "bg-muted-foreground",
    },
  },
  defaultVariants: {
    status: "neutral",
  },
});

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  status?: SemanticStatus;
  showDot?: boolean;
}

export function StatusBadge({
  status = "neutral",
  showDot = true,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      data-slot="status-badge"
      data-status={status}
      className={cn(statusBadgeVariants({ status, className }))}
      {...props}
    >
      {showDot && (
        <span
          data-slot="status-badge-dot"
          className={cn(statusDotVariants({ status }))}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

export { statusBadgeVariants };
