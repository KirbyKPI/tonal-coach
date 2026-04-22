"use client";

import { Search } from "lucide-react";
import type { SortKey } from "./sortAndFilter";

const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: "name-asc", label: "Name (A–Z)" },
  { value: "name-desc", label: "Name (Z–A)" },
  { value: "last-synced", label: "Last synced" },
  { value: "connection", label: "Connection status" },
];

export function CoachToolbar({
  query,
  onQueryChange,
  sortKey,
  onSortKeyChange,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  sortKey: SortKey;
  onSortKeyChange: (k: SortKey) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="relative flex-1">
        <Search
          aria-hidden
          className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search by name or Tonal username"
          className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="whitespace-nowrap">Sort by</span>
        <select
          value={sortKey}
          onChange={(e) => onSortKeyChange(e.target.value as SortKey)}
          className="rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
