"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import type { AnalyticsChatResponse } from "@/lib/types";

const COLORS = ["#8b7cff", "#2dd4bf", "#f59e0b", "#f472b6", "#38bdf8", "#a3e635", "#fb7185"];

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  borderColor: "hsl(var(--border))",
  color: "hsl(var(--foreground))",
  fontSize: "12px",
  borderRadius: "10px",
  boxShadow: "0 10px 30px -12px rgba(0,0,0,0.5)"
} as const;

function compact(value: unknown): string {
  if (typeof value !== "number") return String(value);
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function AnalyticsChart({ response }: { response: AnalyticsChatResponse }) {
  const { chart, rows } = response;

  if (chart.type === "none" || !chart.x || !chart.y || rows.length === 0) {
    return null;
  }

  const x = chart.x;
  const y = chart.y;

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <ResponsiveContainer width="100%" height={280}>
        {chart.type === "line" ? (
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="finLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8b7cff" />
                <stop offset="100%" stopColor="#2dd4bf" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="currentColor" className="text-border" strokeDasharray="3 3" opacity={0.4} />
            <XAxis dataKey={x} stroke="currentColor" className="text-muted-foreground" tick={{ fontSize: 10 }} tickLine={false} />
            <YAxis stroke="currentColor" className="text-muted-foreground" tick={{ fontSize: 10 }} tickLine={false} tickFormatter={compact} width={44} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "hsl(var(--primary))", strokeOpacity: 0.2 }} />
            <Line type="monotone" dataKey={y} stroke="url(#finLine)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
          </LineChart>
        ) : chart.type === "pie" ? (
          <PieChart>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Pie data={rows} dataKey={y} nameKey={x} innerRadius={55} outerRadius={95} paddingAngle={2} stroke="hsl(var(--card))">
              {rows.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        ) : (
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="finBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b7cff" />
                <stop offset="100%" stopColor="#6d5ef0" stopOpacity={0.75} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="currentColor" className="text-border" strokeDasharray="3 3" opacity={0.4} vertical={false} />
            <XAxis dataKey={x} stroke="currentColor" className="text-muted-foreground" tick={{ fontSize: 10 }} tickLine={false} interval={0} angle={rows.length > 6 ? -25 : 0} textAnchor={rows.length > 6 ? "end" : "middle"} height={rows.length > 6 ? 56 : 28} />
            <YAxis stroke="currentColor" className="text-muted-foreground" tick={{ fontSize: 10 }} tickLine={false} tickFormatter={compact} width={44} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--primary))", fillOpacity: 0.08 }} />
            <Bar dataKey={y} fill="url(#finBar)" radius={[6, 6, 0, 0]} maxBarSize={56} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
