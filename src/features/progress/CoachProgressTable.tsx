"use client";

/**
 * Table layout for coach aggregate progress — dense, spreadsheet-style rows.
 */

import { ArrowDown, ArrowUp, Minus } from "lucide-react";

interface ClientRow {
  name: string;
  level: string | null;
  latestOverall: number | null;
  latestUpper: number | null;
  latestLower: number | null;
  latestCore: number | null;
  trend: number;
  workouts30d: number;
  totalVolume: number;
  activeDays: number;
  daysSinceLastWorkout: number | null;
  alerts: string[];
}

function TrendCell({ value }: { value: number }) {
  if (value > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-primary">
        +{value} <ArrowUp className="size-3" />
      </span>
    );
  if (value < 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-rose-400">
        {value} <ArrowDown className="size-3" />
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground">
      0 <Minus className="size-3" />
    </span>
  );
}

function StatusDot({ daysSince }: { daysSince: number | null }) {
  if (daysSince === null) return <span className="size-2 rounded-full bg-muted inline-block" />;
  if (daysSince <= 2) return <span className="size-2 rounded-full bg-emerald-400 inline-block" />;
  if (daysSince <= 7) return <span className="size-2 rounded-full bg-amber-400 inline-block" />;
  return <span className="size-2 rounded-full bg-rose-400 inline-block" />;
}

export function CoachProgressTable({ clients }: { clients: ClientRow[] }) {
  if (clients.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No clients yet</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="px-3 py-2 text-left">Client</th>
            <th className="px-3 py-2 text-center">Overall</th>
            <th className="px-3 py-2 text-center">Upper</th>
            <th className="px-3 py-2 text-center">Lower</th>
            <th className="px-3 py-2 text-center">Core</th>
            <th className="px-3 py-2 text-center">Trend</th>
            <th className="px-3 py-2 text-center">30d Workouts</th>
            <th className="px-3 py-2 text-center">Volume</th>
            <th className="px-3 py-2 text-center">Active Days</th>
            <th className="px-3 py-2 text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.name} className="border-t border-border/50">
              <td className="px-3 py-2">
                <div>
                  <span className="font-medium text-foreground">{c.name}</span>
                  {c.level && (
                    <span className="ml-1.5 text-xs text-muted-foreground">{c.level}</span>
                  )}
                </div>
                {c.alerts.length > 0 && (
                  <div className="mt-0.5 flex gap-1">
                    {c.alerts.map((a) => (
                      <span
                        key={a}
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          a === "declining"
                            ? "bg-rose-400/15 text-rose-400"
                            : a === "plateau"
                              ? "bg-amber-400/15 text-amber-400"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {a === "declining" ? "Declining" : a === "plateau" ? "Plateau" : "Inactive"}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td className="px-3 py-2 text-center font-bold tabular-nums">
                {c.latestOverall ?? "–"}
              </td>
              <td className="px-3 py-2 text-center tabular-nums">{c.latestUpper ?? "–"}</td>
              <td className="px-3 py-2 text-center tabular-nums">{c.latestLower ?? "–"}</td>
              <td className="px-3 py-2 text-center tabular-nums">{c.latestCore ?? "–"}</td>
              <td className="px-3 py-2 text-center tabular-nums">
                <TrendCell value={c.trend} />
              </td>
              <td className="px-3 py-2 text-center tabular-nums">{c.workouts30d}</td>
              <td className="px-3 py-2 text-center tabular-nums">
                {c.totalVolume > 0 ? `${(c.totalVolume / 1000).toFixed(0)}k` : "–"}
              </td>
              <td className="px-3 py-2 text-center tabular-nums">{c.activeDays}</td>
              <td className="px-3 py-2 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <StatusDot daysSince={c.daysSinceLastWorkout} />
                  <span className="text-xs text-muted-foreground">
                    {c.daysSinceLastWorkout === null
                      ? "–"
                      : c.daysSinceLastWorkout === 0
                        ? "Today"
                        : `${c.daysSinceLastWorkout}d`}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
