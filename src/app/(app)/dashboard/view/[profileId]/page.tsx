"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, Loader2, ShieldCheck } from "lucide-react";

export default function ViewDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const profileId = params.profileId as Id<"userProfiles">;

  const summary = useQuery(api.viewDashboard.getViewProfileSummary, { profileId });
  const workouts = useQuery(api.viewDashboard.getViewWorkoutHistory, { profileId, limit: 10 });
  const strength = useQuery(api.viewDashboard.getViewStrengthScores, { profileId });
  const readiness = useQuery(api.viewDashboard.getViewMuscleReadiness, { profileId });
  const frequency = useQuery(api.viewDashboard.getViewTrainingFrequency, { profileId });
  const history = useQuery(api.viewDashboard.getViewStrengthHistory, { profileId, limit: 20 });

  if (summary === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (summary === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <ShieldCheck className="mx-auto size-10 text-muted-foreground mb-3" />
        <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have permission to view this profile.
        </p>
        <button
          onClick={() => router.push("/dashboard")}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex size-8 items-center justify-center rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{summary.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Eye className="size-3.5 text-blue-400" />
            <span className="text-sm text-blue-400 font-medium">View Only</span>
            {summary.level && (
              <span className="text-sm text-muted-foreground">· {summary.level}</span>
            )}
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Workouts (30d)" value={frequency?.total ?? 0} />
        <StatCard
          label="Overall Strength"
          value={history && history.length > 0 ? history[0].overall : "–"}
        />
        <StatCard
          label="Upper"
          value={strength?.find((s) => s.bodyRegion === "Upper Body")?.score ?? "–"}
        />
        <StatCard
          label="Lower"
          value={strength?.find((s) => s.bodyRegion === "Lower Body")?.score ?? "–"}
        />
      </div>

      {/* Training Frequency */}
      {frequency && frequency.byArea.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Training Frequency (30d)</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {frequency.byArea.map((entry) => (
              <div
                key={entry.targetArea}
                className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
              >
                <span className="text-sm text-foreground">{entry.targetArea}</span>
                <span className="text-sm font-bold text-primary">{entry.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Muscle Readiness */}
      {readiness && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Muscle Readiness</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(readiness)
              .filter(
                ([k]) => !["_id", "_creationTime", "userId", "profileId", "fetchedAt"].includes(k),
              )
              .sort(([, a], [, b]) => (a as number) - (b as number))
              .map(([muscle, value]) => (
                <div
                  key={muscle}
                  className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
                >
                  <span className="text-sm capitalize text-foreground">{muscle}</span>
                  <ReadinessBar value={value as number} />
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Recent Workouts */}
      {workouts && workouts.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Recent Workouts</h2>
          <div className="space-y-2">
            {workouts.map((w) => (
              <div
                key={w._id}
                className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{w.title || "Workout"}</p>
                  <p className="text-xs text-muted-foreground">
                    {w.targetArea} · {Math.round(w.totalDuration / 60)}min ·{" "}
                    {w.totalVolume.toLocaleString()} lbs
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{w.date}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Strength History */}
      {history && history.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Strength History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs">
                  <th className="text-left py-2 px-3">Date</th>
                  <th className="text-center py-2 px-3">Overall</th>
                  <th className="text-center py-2 px-3">Upper</th>
                  <th className="text-center py-2 px-3">Lower</th>
                  <th className="text-center py-2 px-3">Core</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => {
                  const prev = history[i + 1];
                  return (
                    <tr key={h._id} className="border-t border-border/50">
                      <td className="py-2 px-3 text-muted-foreground">{h.date}</td>
                      <td className="py-2 px-3 text-center font-medium">
                        <TrendValue current={h.overall} previous={prev?.overall} />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <TrendValue current={h.upper} previous={prev?.upper} />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <TrendValue current={h.lower} previous={prev?.lower} />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <TrendValue current={h.core} previous={prev?.core} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Empty state */}
      {(!workouts || workouts.length === 0) && (!strength || strength.length === 0) && (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-foreground font-medium">No data synced yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Workout data will appear here once it&apos;s been synced by the coach.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function ReadinessBar({ value }: { value: number }) {
  const color = value >= 80 ? "bg-green-500" : value >= 50 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-medium text-muted-foreground w-7 text-right">{value}%</span>
    </div>
  );
}

function TrendValue({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined) {
    return <span>{current}</span>;
  }
  const diff = current - previous;
  if (diff > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-primary">
        {current} <ArrowUp className="size-3" />
      </span>
    );
  }
  if (diff < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-rose-400">
        {current} <ArrowDown className="size-3" />
      </span>
    );
  }
  return <span>{current}</span>;
}
