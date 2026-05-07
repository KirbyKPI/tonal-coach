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
  }[];
}

function getDaysInMonth(year: number, month: number): string[] {
  const days: string[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    days.push(date.toISOString().slice(0, 10));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

function intensityClass(count: number): string {
  if (count === 0) return "bg-muted/40";
  if (count === 1) return "bg-emerald-400/40";
  if (count === 2) return "bg-emerald-400/70";
  return "bg-emerald-400";
}

export function CoachActivityCalendar({ clients }: CalendarProps) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const days = getDaysInMonth(year, month);
  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });

  // Build a lookup: client index → date → count
  const countMap = new Map<string, Map<string, number>>();
  for (const c of clients) {
    const dateMap = new Map<string, number>();
    for (const d of c.activeDates) {
      dateMap.set(d, (dateMap.get(d) ?? 0) + 1);
    }
    countMap.set(c.name, dateMap);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Activity — {monthLabel}</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Less</span>
          <div className="flex gap-0.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`size-2.5 rounded-sm ${intensityClass(i)}`} />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>

      <div className="space-y-2 overflow-x-auto">
        {clients.map((client) => {
          const dateMap = countMap.get(client.name);
          const totalDays = dateMap ? Array.from(dateMap.values()).filter((v) => v > 0).length : 0;

          return (
            <div key={client.name} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate text-xs font-medium text-foreground">
                {client.name}
              </span>
              <div className="flex gap-0.5">
                {days.map((day) => {
                  const count = dateMap?.get(day) ?? 0;
                  const dayNum = parseInt(day.slice(8, 10));
                  return (
                    <div
                      key={day}
                      className={`size-3.5 rounded-sm ${intensityClass(count)} transition-colors`}
                      title={`${client.name} — ${day}: ${count} workout${count !== 1 ? "s" : ""}`}
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
          {days.map((day) => {
            const d = parseInt(day.slice(8, 10));
            return (
              <div key={day} className="flex size-3.5 items-center justify-center">
                {d % 5 === 1 ? <span className="text-[8px] text-muted-foreground">{d}</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
