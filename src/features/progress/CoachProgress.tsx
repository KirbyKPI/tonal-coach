"use client";

/**
 * Aggregate coach progress view — replaces the per-client progress page
 * when the coach stub profile is active.
 *
 * Three layout modes: Cards · Charts · Table, togglable via buttons.
 * Sections: Strength, Activity Calendar, Training Stats, Muscle Readiness, Alerts.
 */

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  BarChart3,
  CalendarDays,
  Grid3X3,
  LayoutGrid,
  LineChart,
  Loader2,
  TrendingUp,
} from "lucide-react";

import { CoachActivityCalendar } from "./CoachActivityCalendar";
import { CoachReadinessCompare } from "./CoachReadinessCompare";
import { CoachProgressTable } from "./CoachProgressTable";
import { StrengthCards, StrengthChart } from "./CoachStrengthTrends";

/** Shape returned by coachProgress.getAggregateProgress per client. */
interface ClientProgress {
  profileId: string;
  name: string;
  level: string | null;
  strengthHistory: { date: string; overall: number; upper: number; lower: number; core: number }[];
  currentScores: { region: string; score: number }[];
  training: {
    workouts30d: number;
    totalVolume: number;
    totalDuration: number;
    byArea: { area: string; count: number }[];
  };
  activeDates: string[];
  dateVolume?: Record<string, number>;
  readiness: Record<string, number> | null;
  alerts: string[];
  daysSinceLastWorkout: number | null;
}

type Layout = "cards" | "charts" | "table";

const LAYOUT_OPTIONS: { value: Layout; icon: typeof LayoutGrid; label: string }[] = [
  { value: "cards", icon: LayoutGrid, label: "Cards" },
  { value: "charts", icon: LineChart, label: "Charts" },
  { value: "table", icon: Grid3X3, label: "Table" },
];

// Section visibility toggles
type Section = "strength" | "activity" | "training" | "readiness" | "alerts";

const SECTION_OPTIONS: { value: Section; icon: typeof TrendingUp; label: string }[] = [
  { value: "strength", icon: TrendingUp, label: "Strength" },
  { value: "activity", icon: CalendarDays, label: "Activity" },
  { value: "training", icon: BarChart3, label: "Training" },
  { value: "readiness", icon: Grid3X3, label: "Readiness" },
];

export function CoachProgress() {
  const data = useQuery(api.coachProgress.getAggregateProgress);
  const [layout, setLayout] = useState<Layout>("cards");
  const [sections, setSections] = useState<Set<Section>>(
    new Set(["strength", "activity", "training", "readiness", "alerts"]),
  );

  const toggleSection = (s: Section) => {
    setSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.clients.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <TrendingUp className="mx-auto size-10 text-muted-foreground mb-3" />
        <h2 className="text-lg font-semibold text-foreground">No Client Data Yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect client accounts and sync their Tonal data to see aggregate progress here.
        </p>
      </div>
    );
  }

  const clients = data.clients as ClientProgress[];

  // Alert summary
  const alertClients = clients.filter((c: ClientProgress) => c.alerts.length > 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Header + Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Client Progress</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Aggregate view across {clients.length} client{clients.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Layout toggle */}
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
          {LAYOUT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => setLayout(opt.value)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  layout === opt.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-3.5" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section toggles */}
      <div className="flex flex-wrap gap-2">
        {SECTION_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = sections.has(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => toggleSection(opt.value)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/20"
              }`}
            >
              <Icon className="size-3" />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Alert Banner */}
      {sections.has("alerts") && alertClients.length > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
          <h3 className="text-sm font-semibold text-amber-400 mb-2">Attention Needed</h3>
          <div className="space-y-1">
            {alertClients.map((c) => (
              <p key={c.name} className="text-sm text-foreground">
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground">
                  {" — "}
                  {c.alerts
                    .map((a) =>
                      a === "declining"
                        ? "strength declining"
                        : a === "plateau"
                          ? "strength plateaued"
                          : a === "inactive"
                            ? `inactive ${c.daysSinceLastWorkout}d`
                            : a === "no_data"
                              ? "no data synced"
                              : a,
                    )
                    .join(", ")}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Table layout replaces individual sections */}
      {layout === "table" && sections.has("strength") && (
        <Section title="All Clients">
          <CoachProgressTable
            clients={clients.map((c) => {
              const latest = c.strengthHistory[c.strengthHistory.length - 1];
              const prev =
                c.strengthHistory.length >= 2
                  ? c.strengthHistory[c.strengthHistory.length - 2]
                  : null;
              return {
                name: c.name,
                level: c.level,
                latestOverall: latest?.overall ?? null,
                latestUpper: latest?.upper ?? null,
                latestLower: latest?.lower ?? null,
                latestCore: latest?.core ?? null,
                trend: latest && prev ? latest.overall - prev.overall : 0,
                workouts30d: c.training.workouts30d,
                totalVolume: c.training.totalVolume,
                activeDays: c.activeDates.length,
                daysSinceLastWorkout: c.daysSinceLastWorkout,
                alerts: c.alerts,
              };
            })}
          />
        </Section>
      )}

      {/* Strength Section (cards or charts) */}
      {layout !== "table" && sections.has("strength") && (
        <Section title="Strength Trends">
          {layout === "cards" ? (
            <StrengthCards clients={clients} />
          ) : (
            <StrengthChart clients={clients} />
          )}
        </Section>
      )}

      {/* Activity Calendar */}
      {sections.has("activity") && (
        <Section title="Activity Calendar">
          <CoachActivityCalendar clients={clients} />
        </Section>
      )}

      {/* Training Stats */}
      {sections.has("training") && (
        <Section title="Training Volume (30d)">
          <div className={layout === "cards" ? "grid gap-4 sm:grid-cols-2" : "space-y-3"}>
            {clients.map((c) => (
              <div key={c.name} className="rounded-lg bg-muted/30 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.training.workouts30d} workouts
                  </span>
                </div>
                <div className="flex gap-4 text-xs">
                  <div>
                    <p className="text-muted-foreground">Volume</p>
                    <p className="font-bold tabular-nums text-foreground">
                      {c.training.totalVolume > 0
                        ? `${(c.training.totalVolume / 1000).toFixed(0)}k lbs`
                        : "–"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Duration</p>
                    <p className="font-bold tabular-nums text-foreground">
                      {c.training.totalDuration > 0
                        ? `${Math.round(c.training.totalDuration / 3600)}h`
                        : "–"}
                    </p>
                  </div>
                  {c.training.byArea.slice(0, 3).map((a) => (
                    <div key={a.area}>
                      <p className="text-muted-foreground">{a.area}</p>
                      <p className="font-bold tabular-nums text-foreground">{a.count}x</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Muscle Readiness */}
      {sections.has("readiness") && (
        <Section title="Muscle Readiness">
          <CoachReadinessCompare
            clients={clients.map((c) => ({ name: c.name, readiness: c.readiness }))}
          />
        </Section>
      )}
    </div>
  );
}

/** Reusable section wrapper with title. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}
