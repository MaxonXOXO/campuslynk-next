"use client";

import * as React from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@academic-suite/ui";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

export interface UsersByTypeDatum {
  type: string;
  count: number;
}

const CHART_CONFIG = {
  count: {
    label: "Accounts",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function PrincipalUsersChart({ data }: { data: UsersByTypeDatum[] }) {
  return (
    <ChartContainer
      config={CHART_CONFIG}
      className="h-64 w-full"
      aria-label="User accounts by type bar chart"
    >
      <BarChart data={data} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="type"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

