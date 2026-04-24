"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Dumbbell,
  Minus,
  TrendingUp,
  Users,
  Wifi,
} from "lucide-react";
import { Loader2 } from "lucide-react";

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`size-4 ${color}`} />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export function CoachOverview() {
  const data = useQuery(api.coachDashboard.getCoachOverview);

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6 lg:py-10 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Users className="size-6 text-primary" />
          Coach Overview
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Aggregate view across all your clients</p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Clients"
          value={data.totalClients}
          icon={Users}
          color="text-foreground"
        />
        <StatCard
          label="Connected"
          value={data.connectedClients}
          icon={Wifi}
          color="text-primary"
        />
        <StatCard
          label="Active This Week"
          value={data.activeThisWeek}
          icon={Dumbbell}
          color="text-primary"
        />
        <StatCard
          label="Workouts This Week"
          value={data.totalWorkoutsThisWeek}
          icon={TrendingUp}
          color="text-primary"
        />
      </div>

      {/* Alerts */}
      {data.totalAlerts > 0 && (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
          <div className="flex items-center gap-2 text-orange-400">
            <AlertCircle className="size-4" />
            <span className="text-sm font-medium">
              {data.totalAlerts} unread check-in{data.totalAlerts > 1 ? "s" : ""} across clients
            </span>
          </div>
        </div>
      )}

      {/* Falling behind */}
      {data.fallingBehind.length > 0 && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
          <p className="text-sm font-medium text-rose-400 mb-2">
            Clients who haven&apos;t trained in 7+ days:
          </p>
          <div className="flex flex-wrap gap-2">
            {data.fallingBehind.map((c) => (
              <span
                key={c.profileId}
                className="rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-400 border border-rose-500/20"
              >
                {c.name} — {c.daysSinceLastWorkout}d ago
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Client table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Client</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">7d</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">30d</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Strength</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Trend</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                Last Workout
              </th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.clients.map((client) => (
              <tr key={client.profileId} className="transition-colors hover:bg-muted/20">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-foreground">{client.name}</p>
                    {client.level && (
                      <p className="text-xs text-muted-foreground capitalize">{client.level}</p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-center font-mono text-foreground">
                  {client.workoutsLast7d}
                </td>
                <td className="px-4 py-3 text-center font-mono text-foreground">
                  {client.workoutsLast30d}
                </td>
                <td className="px-4 py-3 text-center font-mono text-foreground">
                  {client.strengthScore ?? "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  {client.strengthTrend > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-primary">
                      <ArrowUp className="size-3" />
                      {client.strengthTrend}
                    </span>
                  ) : client.strengthTrend < 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-rose-400">
                      <ArrowDown className="size-3" />
                      {Math.abs(client.strengthTrend)}
                    </span>
                  ) : (
                    <Minus className="mx-auto size-3 text-muted-foreground" />
                  )}
                </td>
                <td className="px-4 py-3 text-center text-muted-foreground">
                  {client.daysSinceLastWorkout !== null
                    ? client.daysSinceLastWorkout === 0
                      ? "Today"
                      : `${client.daysSinceLastWorkout}d ago`
                    : "Never"}
                </td>
                <td className="px-4 py-3 text-center">
                  {!client.connected ? (
                    <span className="text-xs text-muted-foreground">Not connected</span>
                  ) : client.daysSinceLastWorkout !== null && client.daysSinceLastWorkout <= 3 ? (
                    <span className="inline-block size-2 rounded-full bg-primary" title="Active" />
                  ) : client.daysSinceLastWorkout !== null && client.daysSinceLastWorkout <= 7 ? (
                    <span className="inline-block size-2 rounded-full bg-amber-400" title="Idle" />
                  ) : (
                    <span
                      className="inline-block size-2 rounded-full bg-rose-400"
                      title="Inactive"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quick links */}
      <div className="flex gap-3">
        <Link
          href="/coach"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Manage Clients
        </Link>
        <Link
          href="/chat"
          className="rounded-lg bg-muted px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
        >
          Open Chat
        </Link>
      </div>
    </div>
  );
}
