"use client";

/**
 * Strength trend visualization for multiple clients.
 * Card mode: one card per client with sparkline-style trend.
 * Chart mode: overlaid lines on a shared axis.
 * Table mode: rendered by CoachProgressTable instead.
 */

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { ProgressRing } from "./ProgressRing";

interface StrengthPoint {
  date: string;
  overall: number;
  upper: number;
  lower: number;
  core: number;
}

interface ClientStrength {
  name: string;
  level: string | null;
  strengthHistory: StrengthPoint[];
  currentScores: { region: string; score: number }[];
  alerts: string[];
}

const CHART_COLORS = [
  "oklch(0.82 0.24 145)",
  "oklch(0.7 0.15 250)",
  "oklch(0.75 0.18 55)",
  "oklch(0.65 0.2 0)",
  "oklch(0.7 0.2 300)",
];

function TrendArrow({ history }: { history: StrengthPoint[] }) {
  if (history.length < 2) return <Minus className="size-3.5 text-muted-foreground" />;
  const diff = history[history.length - 1].overall - history[history.length - 2].overall;
  if (diff > 0) return <ArrowUp className="size-3.5 text-primary" />;
  if (diff < 0) return <ArrowDown className="size-3.5 text-rose-400" />;
  return <Minus className="size-3.5 text-muted-foreground" />;
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const h = 32;
  const w = 120;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(" ");

  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function alertBadge(alert: string) {
  switch (alert) {
    case "declining":
      return (
        <span className="rounded-full bg-rose-400/15 px-2 py-0.5 text-xs font-medium text-rose-400">
          Declining
        </span>
      );
    case "plateau":
      return (
        <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-400">
          Plateau
        </span>
      );
    case "inactive":
      return (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          Inactive 7d+
        </span>
      );
    default:
      return null;
  }
}

/* ─── Card Layout ─── */

export function StrengthCards({ clients }: { clients: ClientStrength[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {clients.map((c, i) => {
        const latest = c.strengthHistory[c.strengthHistory.length - 1];
        const findScore = (region: string) =>
          c.currentScores.find((s) => s.region.toLowerCase().includes(region.toLowerCase()))?.score;

        return (
          <div key={c.name} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-foreground">{c.name}</h4>
                {c.level && <span className="text-xs text-muted-foreground">{c.level}</span>}
              </div>
              <div className="flex items-center gap-1">
                <TrendArrow history={c.strengthHistory} />
                {c.alerts.map((a) => (
                  <span key={a}>{alertBadge(a)}</span>
                ))}
              </div>
            </div>

            {latest ? (
              <>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <ProgressRing
                      score={latest.overall}
                      size={56}
                      strokeWidth={4}
                      label="Overall"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Upper", score: findScore("upper") ?? latest.upper },
                        { label: "Lower", score: findScore("lower") ?? latest.lower },
                        { label: "Core", score: findScore("core") ?? latest.core },
                      ].map((r) => (
                        <div key={r.label} className="text-center">
                          <p className="text-lg font-bold tabular-nums text-foreground">
                            {r.score}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{r.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <MiniSparkline
                    data={c.strengthHistory.map((s) => s.overall)}
                    color={CHART_COLORS[i % CHART_COLORS.length]}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No strength data yet</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Chart Layout (overlaid lines) ─── */

export function StrengthChart({ clients }: { clients: ClientStrength[] }) {
  // Gather all dates across all clients
  const allDates = new Set<string>();
  for (const c of clients) {
    for (const s of c.strengthHistory) allDates.add(s.date);
  }
  const dates = Array.from(allDates).sort();
  if (dates.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No data yet</p>;
  }

  // Scale
  let minScore = Infinity;
  let maxScore = -Infinity;
  for (const c of clients) {
    for (const s of c.strengthHistory) {
      if (s.overall < minScore) minScore = s.overall;
      if (s.overall > maxScore) maxScore = s.overall;
    }
  }
  const range = maxScore - minScore || 1;
  const W = 600;
  const H = 200;
  const pad = 30;

  const xScale = (d: string) =>
    pad + (dates.indexOf(d) / Math.max(dates.length - 1, 1)) * (W - 2 * pad);
  const yScale = (v: number) => H - pad - ((v - minScore) / range) * (H - 2 * pad);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Y-axis labels */}
        {[minScore, Math.round((minScore + maxScore) / 2), maxScore].map((v) => (
          <g key={v}>
            <line
              x1={pad}
              y1={yScale(v)}
              x2={W - pad}
              y2={yScale(v)}
              stroke="currentColor"
              strokeWidth={0.5}
              className="text-border"
            />
            <text
              x={pad - 4}
              y={yScale(v) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize={9}
            >
              {v}
            </text>
          </g>
        ))}

        {/* Client lines */}
        {clients.map((c, i) => {
          const points = c.strengthHistory
            .map((s) => `${xScale(s.date)},${yScale(s.overall)}`)
            .join(" ");
          return (
            <polyline
              key={c.name}
              points={points}
              fill="none"
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap justify-center gap-4">
        {clients.map((c, i) => (
          <div key={c.name} className="flex items-center gap-1.5">
            <div
              className="size-2.5 rounded-full"
              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="text-xs font-medium text-foreground">{c.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
