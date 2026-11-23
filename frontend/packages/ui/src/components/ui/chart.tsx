"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "cn";

const THEME_SELECTORS = {
  light: "",
  dark: ".dark",
} as const;

export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEME_SELECTORS, string> }
  );
};

interface ChartContextValue {
  config: ChartConfig;
}

const ChartContext = React.createContext<ChartContextValue | null>(null);

export function useChart(): ChartContextValue {
  const ctx = React.useContext(ChartContext);
  if (!ctx) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }
  return ctx;
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const entries = Object.entries(config).filter(
    ([, item]) => Boolean(item.theme || item.color)
  );

  if (entries.length === 0) {
    return null;
  }

  const cssRules = Object.entries(THEME_SELECTORS)
    .map(([themeKey, prefix]) => {
      const vars = entries
        .map(([key, item]) => {
          const val =
            item.theme?.[themeKey as keyof typeof THEME_SELECTORS] ??
            item.color;
          return val ? `  --color-${key}: ${val};` : null;
        })
        .filter(Boolean)
        .join("\n");

      return `${prefix} [data-chart=${id}] {\n${vars}\n}`;
    })
    .join("\n");

  return <style dangerouslySetInnerHTML={{ __html: cssRules }} />;
}

export function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"];
}) {
  const generatedId = React.useId();
  const chartId = `chart-${id ?? generatedId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export const ChartTooltip = RechartsPrimitive.Tooltip;
export const ChartLegend = RechartsPrimitive.Legend;

interface TooltipPayloadEntry {
  name?: string | number;
  dataKey?: string | number;
  value?: number | string | Array<number | string>;
  color?: string;
  payload?: Record<string, unknown>;
}

function resolveItemConfig(
  config: ChartConfig,
  entry: TooltipPayloadEntry,
  fallbackKey: string
) {
  const payloadObj = entry.payload;
  let resolvedKey = fallbackKey;

  if (typeof entry[fallbackKey as keyof TooltipPayloadEntry] === "string") {
    resolvedKey = entry[fallbackKey as keyof TooltipPayloadEntry] as string;
  } else if (payloadObj && typeof payloadObj[fallbackKey] === "string") {
    resolvedKey = payloadObj[fallbackKey] as string;
  }

  return config[resolvedKey] ?? config[fallbackKey];
}

export function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<"div"> & {
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: "line" | "dot" | "dashed";
    nameKey?: string;
    labelKey?: string;
  }) {
  const { config } = useChart();

  const headerLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) return null;

    const first = payload[0] as TooltipPayloadEntry;
    const key = `${labelKey ?? first?.dataKey ?? first?.name ?? "value"}`;
    const itemCfg = resolveItemConfig(config, first, key);

    const raw =
      !labelKey && typeof label === "string"
        ? (config[label]?.label ?? label)
        : itemCfg?.label;

    if (labelFormatter) {
      return (
        <div className={cn("font-medium", labelClassName)}>
          {labelFormatter(raw, payload)}
        </div>
      );
    }

    return raw ? (
      <div className={cn("font-medium", labelClassName)}>{raw}</div>
    ) : null;
  }, [hideLabel, payload, labelKey, config, label, labelFormatter, labelClassName]);

  if (!active || !payload?.length) {
    return null;
  }

  const singleLine = payload.length === 1 && indicator !== "dot";

  return (
    <div
      className={cn(
        "grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
        className
      )}
    >
      {!singleLine && headerLabel}
      <div className="grid gap-1.5">
        {payload.map((entry, idx) => {
          const typedEntry = entry as TooltipPayloadEntry;
          const key = `${nameKey ?? typedEntry.name ?? typedEntry.dataKey ?? "value"}`;
          const itemCfg = resolveItemConfig(config, typedEntry, key);
          const indicatorColor =
            color ??
            (typedEntry.payload?.fill as string | undefined) ??
            typedEntry.color;

          return (
            <div
              key={`${typedEntry.dataKey ?? idx}`}
              className={cn(
                "flex w-full flex-wrap items-stretch gap-2",
                indicator === "dot" && "items-center"
              )}
            >
              {formatter &&
              typedEntry.value !== undefined &&
              typedEntry.name !== undefined ? (
                formatter(
                  typedEntry.value,
                  typedEntry.name,
                  entry,
                  idx,
                  typedEntry.payload as never
                )
              ) : (
                <>
                  {!hideIndicator &&
                    (itemCfg?.icon ? (
                      <itemCfg.icon />
                    ) : (
                      <div
                        className={cn(
                          "shrink-0 rounded-xs border-(--color-border) bg-(--color-bg)",
                          indicator === "dot" && "size-2.5",
                          indicator === "line" && "w-1",
                          indicator === "dashed" &&
                            "w-0 border-[1.5px] border-dashed bg-transparent",
                          singleLine && indicator === "dashed" && "my-0.5"
                        )}
                        style={
                          {
                            "--color-bg": indicatorColor,
                            "--color-border": indicatorColor,
                          } as React.CSSProperties
                        }
                      />
                    ))}
                  <div
                    className={cn(
                      "flex flex-1 justify-between gap-2 leading-none",
                      singleLine ? "items-end" : "items-center"
                    )}
                  >
                    <div className="grid gap-1.5">
                      {singleLine && headerLabel}
                      <span className="text-muted-foreground">
                        {itemCfg?.label ?? typedEntry.name}
                      </span>
                    </div>
                    {typedEntry.value !== undefined && (
                      <span className="font-mono font-medium tabular-nums text-foreground">
                        {typedEntry.value.toLocaleString()}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: React.ComponentProps<"div"> &
  Pick<RechartsPrimitive.LegendProps, "payload" | "verticalAlign"> & {
    hideIcon?: boolean;
    nameKey?: string;
  }) {
  const { config } = useChart();

  if (!payload?.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className
      )}
    >
      {payload.map((entry, idx) => {
        const key = `${nameKey ?? entry.dataKey ?? "value"}`;
        const itemCfg = resolveItemConfig(
          config,
          entry as unknown as TooltipPayloadEntry,
          key
        );

        return (
          <div
            key={`${entry.value ?? idx}`}
            className="flex items-center gap-1.5"
          >
            {itemCfg?.icon && !hideIcon ? (
              <itemCfg.icon />
            ) : (
              <div
                className="size-2 shrink-0 rounded-xs"
                style={{ backgroundColor: entry.color }}
              />
            )}
            <span>{itemCfg?.label ?? entry.value}</span>
          </div>
        );
      })}
    </div>
  );
}
