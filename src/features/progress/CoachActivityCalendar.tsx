"use client";

/**
 * GitHub-style activity calendar showing workout days for multiple clients.
 * Each client gets a row of day-cells for the current month, colored green
 * on days they trained.
 */

interface CalendarProps {
  clients: {
    name: string;
    activeDates: string[];
    dateVolume?: Record<string, number>;
  }[];
}

function getLast30Days(): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/** Volume-based intensity: lighter green for low volume, darker for high. */
function intensityClass(volume: number): string {
  if (volume === 0) return "bg-muted/40";
  if (volume < 5000) return "bg-emerald-400/40";
  if (volume < 15000) return "bg-emerald-400/70";
  return "bg-emerald-400";
}

export function CoachActivityCalendar({ clients }: CalendarProps) {
  const days = getLast30Days();

  // Build a lookup: client name → date → volume
  const volumeMap = new Map<string, Map<string, number>>();
  for (const c of clients) {
    const dateMap = new Map<string, number>();
    if (c.dateVolume) {
      for (const [date, vol] of Object.entries(c.dateVolume)) {
        dateMap.set(date, vol);
      }
    } else {
      // Fallback: mark active dates with a default volume
      for (const d of c.activeDates) {
        dateMap.set(d, 5000);
      }
    }
    volumeMap.set(c.name, dateMap);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Activity — Last 30 Days</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Low vol.</span>
          <div className="flex gap-0.5">
            {[0, 2000, 8000, 20000].map((v) => (
              <div key={v} className={`size-2.5 rounded-sm ${intensityClass(v)}`} />
            ))}
          </div>
          <span>High vol.</span>
        </div>
      </div>

      <div className="space-y-2 overflow-x-auto">
        {clients.map((client) => {
          const dateMap = volumeMap.get(client.name);
          const totalDays = dateMap ? Array.from(dateMap.values()).filter((v) => v > 0).length : 0;

          return (
            <div key={client.name} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate text-xs font-medium text-foreground">
                {client.name}
              </span>
              <div className="flex gap-0.5">
                {days.map((day) => {
                  const vol = dateMap?.get(day) ?? 0;
                  const dayNum = parseInt(day.slice(8, 10));
                  return (
                    <div
                      key={day}
                      className={`size-3.5 rounded-sm ${intensityClass(vol)} transition-colors`}
                      title={`${client.name} — ${day}: ${vol > 0 ? `${vol.toLocaleString()} lbs` : "Rest day"}`}
                    >
                      {dayNum === 1 || dayNum === 15 ? (
                        <span className="sr-only">{day}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {totalDays}d
              </span>
            </div>
          );
        })}
      </div>

      {/* Day labels */}
      <div className="mt-1.5 flex items-center gap-3">
        <span className="w-24 shrink-0" />
        <div className="flex gap-0.5">
          {days.map((day, i) => {
            const d = parseInt(day.slice(8, 10));
            return (
              <div key={day} className="flex size-3.5 items-center justify-center">
                {i % 5 === 0 ? <span className="text-[8px] text-muted-foreground">{d}</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
