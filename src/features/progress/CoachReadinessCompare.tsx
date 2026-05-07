"use client";

/**
 * Side-by-side muscle readiness comparison across clients.
 * Each muscle group shows a horizontal bar per client.
 */

const MUSCLES = [
  "chest",
  "shoulders",
  "back",
  "triceps",
  "biceps",
  "abs",
  "obliques",
  "quads",
  "glutes",
  "hamstrings",
  "calves",
] as const;

type MuscleKey = (typeof MUSCLES)[number];

interface ReadinessData {
  [key: string]: number;
}

interface ClientReadiness {
  name: string;
  readiness: ReadinessData | null;
}

// Consistent colors per client slot
const CLIENT_COLORS = ["bg-primary", "bg-blue-400", "bg-amber-400", "bg-rose-400", "bg-violet-400"];

function readinessColor(value: number): string {
  if (value >= 80) return "text-emerald-400";
  if (value >= 50) return "text-amber-400";
  return "text-rose-400";
}

export function CoachReadinessCompare({ clients }: { clients: ClientReadiness[] }) {
  const activeClients = clients.filter((c) => c.readiness !== null);
  if (activeClients.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No muscle readiness data synced yet.
      </p>
    );
  }

  return (
    <div>
      {/* Legend */}
      <div className="mb-3 flex flex-wrap gap-3">
        {activeClients.map((c, i) => (
          <div key={c.name} className="flex items-center gap-1.5">
            <div className={`size-2.5 rounded-full ${CLIENT_COLORS[i % CLIENT_COLORS.length]}`} />
            <span className="text-xs font-medium text-foreground">{c.name}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {MUSCLES.map((muscle) => (
          <div key={muscle} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-xs capitalize text-muted-foreground">{muscle}</span>
            <div className="flex flex-1 flex-col gap-0.5">
              {activeClients.map((c, i) => {
                const value = c.readiness?.[muscle as MuscleKey] ?? 0;
                return (
                  <div key={c.name} className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/40">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${CLIENT_COLORS[i % CLIENT_COLORS.length]}`}
                        style={{ width: `${value}%` }}
                      />
                    </div>
                    <span
                      className={`w-8 text-right text-xs tabular-nums font-medium ${readinessColor(value)}`}
                    >
                      {value}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
