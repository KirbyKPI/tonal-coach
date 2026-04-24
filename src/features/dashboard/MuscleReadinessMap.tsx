"use client";

import Link from "next/link";
import type { MuscleReadiness } from "../../../convex/tonal/types";
import { ArrowRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a continuous hue (0-145) mapped from readiness 0-100.
 *  0 → red (25°), 50 → amber (80°), 100 → lime green (145°). */
function readinessHue(value: number): number {
  const clamped = Math.max(0, Math.min(100, value));
  // Piecewise: 0-50 maps 25→80, 50-100 maps 80→145
  if (clamped <= 50) return 25 + (clamped / 50) * 55;
  return 80 + ((clamped - 50) / 50) * 65;
}

/** Inline styles for the continuous gradient background. */
function readinessStyle(value: number): React.CSSProperties {
  const hue = readinessHue(value);
  const lightness = value <= 30 ? 0.65 : value <= 60 ? 0.75 : 0.8;
  const chroma = value <= 30 ? 0.22 : value <= 60 ? 0.18 : 0.2;
  // Intensity scales with how far from 50 the value is (extremes are more vivid)
  const intensity = value >= 80 ? 0.15 : value <= 20 ? 0.18 : 0.1;
  return {
    backgroundColor: `oklch(${lightness} ${chroma} ${hue} / ${intensity})`,
    borderColor: `oklch(${lightness} ${chroma} ${hue} / 0.25)`,
    color: `oklch(${lightness} ${chroma} ${hue})`,
  };
}

function readinessLabel(value: number): string {
  if (value <= 30) return "Fatigued";
  if (value <= 60) return "Recovering";
  return "Ready";
}

// ---------------------------------------------------------------------------
// MuscleReadinessMap
// ---------------------------------------------------------------------------

interface MuscleReadinessMapProps {
  readiness: MuscleReadiness;
}

export function MuscleReadinessMap({ readiness }: MuscleReadinessMapProps) {
  // Sort ready muscles first -- positive framing
  const entries = Object.entries(readiness)
    .map(([muscle, value]) => ({ muscle, value: value as number }))
    .sort((a, b) => b.value - a.value);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {entries.map(({ muscle, value }) => (
          <Link
            key={muscle}
            href={`/exercises?muscleGroup=${encodeURIComponent(muscle)}`}
            className="group flex items-center justify-between rounded-lg border px-3 py-3 transition-all duration-200"
            style={readinessStyle(value)}
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold">{muscle}</span>
              <span className="text-xs opacity-60">{readinessLabel(value)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold tabular-nums">{value}</span>
              <ArrowRight className="size-3 opacity-0 transition-opacity duration-150 group-hover:opacity-60" />
            </div>
          </Link>
        ))}
      </div>

      {/* Links section */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
        {(() => {
          const readyCount = entries.filter((e) => e.value > 80).length;
          if (readyCount === 0) return null;
          const upper = ["Chest", "Back", "Shoulders", "Biceps", "Triceps"];
          const lower = ["Quads", "Hamstrings", "Glutes", "Calves"];
          const upperReady = entries.filter((e) => upper.includes(e.muscle) && e.value > 80).length;
          const lowerReady = entries.filter((e) => lower.includes(e.muscle) && e.value > 80).length;
          const label =
            readyCount >= 10
              ? "Full body"
              : upperReady >= 4 && lowerReady < 3
                ? "Upper body"
                : lowerReady >= 3 && upperReady < 3
                  ? "Lower body"
                  : "Full body";
          const prompt = encodeURIComponent(
            `Muscle readiness is high across ${label.toLowerCase()} groups. Program me a ${label.toLowerCase()} workout.`,
          );
          return (
            <Link
              href={`/chat?prompt=${prompt}`}
              className="text-xs text-primary/80 transition-colors duration-200 hover:text-primary"
            >
              {label} recovered — program a workout &rarr;
            </Link>
          );
        })()}
        {(() => {
          const fatigued = entries.find((e) => e.value <= 30);
          if (!fatigued) return null;
          const prompt = encodeURIComponent(
            `My ${fatigued.muscle.toLowerCase()} is fatigued at ${fatigued.value}% readiness. What should I do for recovery?`,
          );
          return (
            <Link
              href={`/chat?prompt=${prompt}`}
              className="text-xs text-muted-foreground/80 transition-colors duration-200 hover:text-foreground"
            >
              Rest day tips for {fatigued.muscle.toLowerCase()} &rarr;
            </Link>
          );
        })()}
      </div>
    </div>
  );
}
