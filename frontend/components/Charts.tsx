"use client";

import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Charts } from "@/lib/types";
import { useTheme } from "./ThemeProvider";

const RED = "#e63946";
const TEAL = "#2a9d8f";
const YELLOW = "#f4c430";

// Recharts writes colors as SVG presentation attributes, which can't resolve
// CSS variables — so charts pick a concrete palette from the active theme.
const PALETTES = {
  dark: {
    tick: "#8b95a8",
    grid: "#2a3344",
    ringTrack: "#222a39",
    pieStroke: "#0c0f17",
    cursor: "#ffffff10",
    tooltip: {
      backgroundColor: "#151a25",
      border: "1px solid #232b3a",
      borderRadius: "8px",
      color: "#e7ebf3",
      fontSize: "12px",
    },
    tooltipText: "#e7ebf3",
  },
  light: {
    tick: "#52525b",
    grid: "#d4d4d8",
    ringTrack: "#e4e4e7",
    pieStroke: "#ffffff",
    cursor: "#00000010",
    tooltip: {
      backgroundColor: "#ffffff",
      border: "1px solid #e4e4e7",
      borderRadius: "8px",
      color: "#111111",
      fontSize: "12px",
    },
    tooltipText: "#111111",
  },
} as const;

function usePalette() {
  const { theme } = useTheme();
  return PALETTES[theme];
}

/** Small ⓘ icon that reveals a brief explanation on hover. */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group/tip relative inline-flex align-middle">
      <span
        aria-label={text}
        className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-muted text-[9px] font-semibold text-faint transition-colors group-hover/tip:border-brand-teal group-hover/tip:text-brand-teal"
      >
        i
      </span>
      <span className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 w-60 -translate-x-1/2 rounded-lg border border-borderline bg-card p-2.5 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-soft opacity-0 shadow-xl transition-opacity duration-150 group-hover/tip:visible group-hover/tip:opacity-100">
        {text}
      </span>
    </span>
  );
}

/** Word-wraps long axis labels onto multiple lines so they never get clipped. */
function RadarTick({
  x,
  y,
  textAnchor,
  payload,
  fillColor,
}: {
  x?: number;
  y?: number;
  textAnchor?: "inherit" | "start" | "middle" | "end";
  payload?: { value?: string };
  fillColor?: string;
}) {
  const words = String(payload?.value ?? "").split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > 10 && current) {
      lines.push(current);
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  // Nudge multi-line labels up so they stay vertically centered on the axis point
  const startDy = -((lines.length - 1) * 11) / 2 + 4;
  return (
    <text x={x} y={y} textAnchor={textAnchor} fill={fillColor} fontSize={10}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? startDy : 11}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function FitRadar({ data }: { data: Charts["fit_radar"] }) {
  const palette = usePalette();
  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} outerRadius="62%" margin={{ top: 24, right: 36, bottom: 24, left: 36 }}>
        <PolarGrid stroke={palette.grid} />
        <PolarAngleAxis
          dataKey="dimension"
          tick={<RadarTick fillColor={palette.tick} />}
        />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar
          dataKey="score"
          stroke={TEAL}
          fill={TEAL}
          fillOpacity={0.35}
          strokeWidth={2}
        />
        <Tooltip contentStyle={palette.tooltip} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

const SENTIMENT_COLORS: Record<string, string> = {
  Positive: TEAL,
  Neutral: YELLOW,
  Negative: RED,
};

export function SentimentDonut({ data }: { data: Charts["news_sentiment"] }) {
  const palette = usePalette();
  const filtered = data.filter((d) => d.value > 0);
  if (filtered.length === 0)
    return <p className="text-sm text-muted">No classified headlines.</p>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <Pie
          data={filtered}
          dataKey="value"
          nameKey="name"
          innerRadius={50}
          outerRadius={78}
          paddingAngle={3}
          labelLine={false}
        >
          {filtered.map((entry) => (
            <Cell
              key={entry.name}
              fill={SENTIMENT_COLORS[entry.name] ?? palette.tick}
              stroke={palette.pieStroke}
            />
          ))}
        </Pie>
        <Legend
          formatter={(name: string) => {
            const item = filtered.find((d) => d.name === name);
            return (
              <span style={{ color: palette.tick, fontSize: 12 }}>
                {name} ({item?.value ?? 0})
              </span>
            );
          }}
        />
        <Tooltip
          contentStyle={palette.tooltip}
          itemStyle={{ color: palette.tooltipText }}
          formatter={(value, name) => [
            `${value ?? 0} ${String(name ?? "").toLowerCase()} headline${Number(value) === 1 ? "" : "s"}`,
            "",
          ]}
          separator=""
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

const SEVERITY_COLORS: Record<string, string> = {
  Low: YELLOW,
  Medium: "#e07b39",
  High: RED,
};

export function RiskBars({ data }: { data: Charts["risk_severity"] }) {
  const palette = usePalette();
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0)
    return (
      <div className="flex h-[240px] items-center justify-center rounded-xl border border-brand-teal/40 bg-brand-teal/10">
        <p className="text-sm font-medium text-brand-teal">
          No red flags surfaced in the scan ✓
        </p>
      </div>
    );
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fill: palette.tick, fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fill: palette.tick, fontSize: 12 }} />
        <Tooltip
          contentStyle={palette.tooltip}
          itemStyle={{ color: palette.tooltipText }}
          labelStyle={{ display: "none" }}
          formatter={(value, _name, item) => {
            const severity = String(
              (item?.payload as { name?: string } | undefined)?.name ?? ""
            ).toLowerCase();
            return [
              `${value ?? 0} ${severity}-severity flag${Number(value) === 1 ? "" : "s"}`,
              "",
            ];
          }}
          separator=""
          cursor={{ fill: palette.cursor }}
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.name}
              fill={SEVERITY_COLORS[entry.name] ?? palette.tick}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ScoreRing({ score }: { score: number }) {
  const palette = usePalette();
  const clamped = Math.max(0, Math.min(100, score));
  const color = clamped >= 70 ? TEAL : clamped >= 45 ? YELLOW : RED;
  const circumference = 2 * Math.PI * 52;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-36 w-36">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke={palette.ringTrack}
            strokeWidth="10"
          />
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped / 100)}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-4xl font-bold" style={{ color }}>
            {clamped}
          </span>
        </div>
      </div>
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted">
        company score
        <InfoTip text="How strong this company looks as an employer (0–100), judged purely from public web signals: business health, benefits, reputation, momentum, and risk. It does not assess your resume or your personal fit." />
      </span>
    </div>
  );
}
