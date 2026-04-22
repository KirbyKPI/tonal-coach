import { describe, expect, test } from "vitest";
import type { ClientOverview } from "./ClientCard";
import type { Id } from "../../../../convex/_generated/dataModel";
import { filterAndSort, matchesSearch } from "./sortAndFilter";

const base = (overrides: Partial<ClientOverview>): ClientOverview => ({
  profileId: "p1" as Id<"userProfiles">,
  isActive: false,
  clientLabel: "Client",
  tonalUsername: null,
  firstName: null,
  lastName: null,
  level: null,
  lastActiveAt: 0,
  currentBlockType: null,
  currentBlockLabel: null,
  currentBlockWeek: null,
  currentPlanStatus: null,
  lastWorkoutDate: null,
  lastWorkoutName: null,
  strengthScore: null,
  checkInAlerts: 0,
  hasConnectedTonal: false,
  isCoachAccount: false,
  ...overrides,
});

describe("matchesSearch", () => {
  test("empty query matches every client", () => {
    expect(matchesSearch(base({ clientLabel: "Anyone" }), "")).toBe(true);
    expect(matchesSearch(base({ clientLabel: "Anyone" }), "   ")).toBe(true);
  });

  test("matches clientLabel case-insensitively", () => {
    expect(matchesSearch(base({ clientLabel: "Eunice Reger" }), "eun")).toBe(true);
    expect(matchesSearch(base({ clientLabel: "Eunice Reger" }), "REGER")).toBe(true);
  });

  test("matches firstName, lastName, or tonalUsername", () => {
    const c = base({
      clientLabel: "Account Slot 1",
      firstName: "Adam",
      lastName: "Kofinas",
      tonalUsername: "akofinas",
    });
    expect(matchesSearch(c, "adam")).toBe(true);
    expect(matchesSearch(c, "kofinas")).toBe(true);
    expect(matchesSearch(c, "akof")).toBe(true);
  });

  test("returns false when no field contains the query", () => {
    expect(matchesSearch(base({ clientLabel: "Eunice" }), "zebra")).toBe(false);
  });
});

describe("filterAndSort", () => {
  const eunice = base({ clientLabel: "Eunice Reger", lastActiveAt: 100, hasConnectedTonal: true });
  const adam = base({ clientLabel: "Adam Kofinas", lastActiveAt: 300, hasConnectedTonal: true });
  const kirby = base({ clientLabel: "Kirby", lastActiveAt: 200, hasConnectedTonal: false });

  test("sorts by name ascending by default", () => {
    const out = filterAndSort([eunice, adam, kirby], { query: "", sortKey: "name-asc" });
    expect(out.map((c) => c.clientLabel)).toEqual(["Adam Kofinas", "Eunice Reger", "Kirby"]);
  });

  test("sorts by name descending", () => {
    const out = filterAndSort([eunice, adam, kirby], { query: "", sortKey: "name-desc" });
    expect(out.map((c) => c.clientLabel)).toEqual(["Kirby", "Eunice Reger", "Adam Kofinas"]);
  });

  test("sorts by last-synced newest first", () => {
    const out = filterAndSort([eunice, adam, kirby], { query: "", sortKey: "last-synced" });
    expect(out.map((c) => c.clientLabel)).toEqual(["Adam Kofinas", "Kirby", "Eunice Reger"]);
  });

  test("connection sort puts connected clients first, name-asc within groups", () => {
    const out = filterAndSort([eunice, adam, kirby], { query: "", sortKey: "connection" });
    expect(out.map((c) => c.clientLabel)).toEqual(["Adam Kofinas", "Eunice Reger", "Kirby"]);
  });

  test("query narrows the result set before sorting", () => {
    const out = filterAndSort([eunice, adam, kirby], { query: "k", sortKey: "name-asc" });
    expect(out.map((c) => c.clientLabel)).toEqual(["Adam Kofinas", "Kirby"]);
  });

  test("returns a new array without mutating the input", () => {
    const input = [eunice, adam, kirby];
    const out = filterAndSort(input, { query: "", sortKey: "name-asc" });
    expect(out).not.toBe(input);
    expect(input.map((c) => c.clientLabel)).toEqual(["Eunice Reger", "Adam Kofinas", "Kirby"]);
  });

  test("name sort uses Tonal firstName+lastName when it differs from clientLabel", () => {
    // Coach typed a short label but the Tonal profile has the real name.
    // Sorting should order by the visible (Tonal) name, not the raw label.
    const zoeLabelledAlice = base({
      clientLabel: "Zoe",
      firstName: "Alice",
      lastName: "Anderson",
    });
    const bob = base({ clientLabel: "Bob Brown", firstName: "Bob", lastName: "Brown" });
    const out = filterAndSort([bob, zoeLabelledAlice], { query: "", sortKey: "name-asc" });
    // Displayed names: "Alice Anderson", "Bob Brown" — Alice sorts first.
    expect(out.map((c) => c.clientLabel)).toEqual(["Zoe", "Bob Brown"]);
  });
});
