import * as React from "react";
import { cn } from "cn";

export interface PageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn("flex flex-col gap-4 pb-6 border-b border-border", className)}
      {...props}
    >
      {breadcrumb && (
        <div data-slot="page-header-breadcrumb" className="w-full">
          {breadcrumb}
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div
            data-slot="page-header-actions"
            className="flex items-center gap-2 shrink-0 flex-wrap"
          >
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
