import { type ClientOverview, displayNameFor } from "./ClientCard";

/** Keys the toolbar sort dropdown can produce. */
export type SortKey = "name-asc" | "name-desc" | "last-synced" | "connection";

const byName = (a: ClientOverview, b: ClientOverview) =>
  displayNameFor(a).localeCompare(displayNameFor(b), undefined, { sensitivity: "base" });

const SORTERS: Record<SortKey, (a: ClientOverview, b: ClientOverview) => number> = {
  "name-asc": byName,
  "name-desc": (a, b) => -byName(a, b),
  "last-synced": (a, b) => b.lastActiveAt - a.lastActiveAt,
  connection: (a, b) => {
    if (a.hasConnectedTonal !== b.hasConnectedTonal) return a.hasConnectedTonal ? -1 : 1;
    return byName(a, b);
  },
};

/**
 * Returns whether a client matches a free-text search. Empty query returns
 * true for every client. Matches against clientLabel, firstName, lastName,
 * and tonalUsername, case-insensitively.
 */
export function matchesSearch(client: ClientOverview, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [client.clientLabel, client.firstName, client.lastName, client.tonalUsername]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/**
 * Filters + sorts the client list for the /coach dashboard. Pure and
 * deterministic: given the same inputs, returns a new array with the same
 * elements in the requested order.
 */
export function filterAndSort(
  clients: readonly ClientOverview[],
  options: { query: string; sortKey: SortKey },
): ClientOverview[] {
  const filtered = clients.filter((c) => matchesSearch(c, options.query));
  return [...filtered].sort(SORTERS[options.sortKey]);
}
