# Per-client training data refactor (Branch 2 design)

## Why this exists

The multi-client refactor (commit `a798a4a`) introduced `userProfiles` so a
single coach can own many Tonal profiles, but it did not migrate any of the
per-user **training data** tables to be per-profile. Every training row is
still keyed on `userId: v.id("users")`, which for a coach with three clients
means every client's history lands in the same pile under the coach's single
`users._id`.

The symptom that surfaced this: every client card on `/coach` shows
`strengthScore: null`, `lastWorkoutDate: null`, `lastWorkoutName: null`, even
for clients whose Tonal account clearly has data (because `/progress` renders
their scores correctly when they're the active client). The
`getClientOverviews` query defensively returns null for these joins because
the underlying rows aren't identifiable as belonging to a specific client.

This refactor introduces a `profileId` column on every per-user training
table so reads can filter by client, sync writes the right association, and
the coach dashboard can surface real per-client stats (including "total
workouts" and the "sort by tonal score" feature request).

## Tables affected

All tables below currently use `userId: v.id("users")`. Each needs a new
`profileId: v.id("userProfiles")` column and a new
`by_profileId` (or `by_profileId_<col>`) index.

| Table                    | Current indexes                                                  | Owner of the data                                      |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------ |
| `completedWorkouts`      | `by_userId`, `by_userId_activityId`, `by_userId_date`            | Per Tonal profile                                      |
| `exercisePerformance`    | `by_userId_movementId`, `by_userId_activityId`, `by_userId_date` | Per Tonal profile                                      |
| `strengthScoreSnapshots` | `by_userId`, `by_userId_date`                                    | Per Tonal profile                                      |
| `currentStrengthScores`  | `by_userId`                                                      | Per Tonal profile                                      |
| `muscleReadiness`        | `by_userId`                                                      | Per Tonal profile                                      |
| `workoutPlans`           | `by_userId`, `by_status`                                         | Per Tonal profile (AI generates for the active client) |
| `trainingBlocks`         | `by_userId`, `by_userId_status`                                  | Per Tonal profile                                      |
| `weekPlans`              | `by_userId`, `by_userId_weekStartDate`                           | Per Tonal profile                                      |
| `workoutFeedback`        | `by_userId`, `by_userId_createdAt`, `by_userId_activityId`       | Per Tonal profile                                      |
| `externalActivities`     | `by_userId_externalId`, `by_userId_beginTime`                    | Per Tonal profile                                      |
| `checkIns`               | `by_userId`, `by_userId_readAt`, `by_userId_createdAt`           | Per Tonal profile (triggered off client activity)      |

Tables that legitimately stay user-scoped (the coach's account, not the
client): `goals`, `injuries`, `aiUsage`, `emailChangeRequests`.

## Schema change

Add `profileId: v.id("userProfiles")` to every row of every table in the
table above. Keep the existing `userId` column during the transition for two
reasons: (1) so partial deployments don't break queries on the old key,
(2) so the backfill has both ends to verify itself.

Add parallel `by_profileId` / `by_profileId_<col>` indexes next to every
existing `by_userId*` index. Example for `completedWorkouts`:

```ts
completedWorkouts: defineTable({
  userId: v.id("users"),                   // keep during transition
  profileId: v.id("userProfiles"),         // new
  activityId: v.string(),
  date: v.string(),
  // ...existing fields
})
  .index("by_userId_activityId", ["userId", "activityId"])
  .index("by_userId_date", ["userId", "date"])
  .index("by_userId", ["userId"])
  .index("by_profileId_activityId", ["profileId", "activityId"])
  .index("by_profileId_date", ["profileId", "date"])
  .index("by_profileId", ["profileId"]),
```

## Sync pipeline changes

`historySync.backfillUserHistory` and the incremental sync actions currently
take a single `userId` arg. They need to take `profileId` instead (or in
addition) and thread it through `persistCompletedWorkouts`,
`persistExercisePerformance`, `persistStrengthSnapshots`, and
`persistCurrentStrengthScores` so each insert gets both `userId` (the
coach's, unchanged) and `profileId` (the client's).

`connect.ts` line 82-84:

```ts
await ctx.scheduler.runAfter(0, internal.tonal.historySync.backfillUserHistory, {
  userId,
  profileId, // new — already available when this action is called
});
```

Incremental sync cron similarly passes `profileId` into each invocation
(likely by iterating `userProfiles` instead of `users`).

`enrichmentSync.persistNewTableData` receives `{ userId, profileId }` and
writes both to every enrichment row.

## Read-side changes

Every query that reads a training table needs to resolve `profileId` from
the active client and filter by it. The three affected call sites:

1. `coachDashboard.getClientOverviews` — already iterates `userProfiles`, so
   it has `profile._id` in scope. Swap every
   `.withIndex("by_userId", q => q.eq("userId", profile.userId))` to
   `.withIndex("by_profileId", q => q.eq("profileId", profile._id))`.
2. `dashboard.*` and `stats.*` actions — read the active client from
   `activeClientProfileId` on the coach's user row, then filter training
   reads by that profile id.
3. The AI coach's tool actions (`convex/ai/tools/*`) — same treatment.

Once all reads pass, drop the `userId` column and its indexes (that's a
second deploy, intentionally after the profile-indexed reads have been live
long enough to prove correctness).

## Backfill plan

The commingled historical data **cannot be reliably split per client** after
the fact — there's no stored association between a training row and the
profile it was synced for. Two options:

### Option A (recommended): nuke and re-sync

1. Delete every row in the training tables listed above.
2. Deploy the schema change (columns added, reads unchanged — still using
   `userId`).
3. For each profile, run `historySync.backfillUserHistory({ profileId })`
   which refetches fresh data from Tonal and writes rows with the correct
   `profileId`.
4. Flip reads to use `profileId`.
5. Drop `userId` from the affected tables in a later deploy.

The trade-off: any workout feedback or plans that were generated against
commingled data are lost. That's probably fine since `workoutFeedback` and
`workoutPlans` are linked to `activityId`s that Tonal will re-serve.

### Option B: best-effort heuristic

For rows where `activityId` or `workoutActivityId` is set, call the Tonal
activity endpoint for each known profile's token. Whichever profile's Tonal
account acknowledges the activityId gets the row. Rows that no profile claims
are deleted. This preserves `workoutFeedback` rows and user-written notes,
but it's O(rows × profiles) API calls and may be slow for heavy users.

Recommend Option A unless you have users who've written feedback notes you
want to preserve.

## Rollout order (per commit)

1. **Commit: schema + sync writes.** Add `profileId` column + `by_profileId`
   indexes to every table. Update sync/enrichment pipelines to write both.
   Old reads still work. Ship and let it run for a sync cycle.
2. **Commit: backfill migration.** Either the nuke-and-resync migration or
   the heuristic variant. Deploy via Convex dashboard after reviewing
   dry-run output.
3. **Commit: flip reads.** Every query filters by `profileId`. Old `userId`
   reads removed.
4. **Commit: drop `userId` column and indexes.** Final cleanup.

This is safer than a single-commit flip because each step is independently
deployable and rollback-able.

## What unlocks

Once this lands, Branch 1 can wire these back into the card:

- `strengthScore` becomes a join against `currentStrengthScores` by
  `profileId` — always correct per client.
- `lastWorkoutDate`, `lastWorkoutName` become joins against
  `completedWorkouts` by `profileId` ordered desc.
- `totalWorkouts` becomes `.query("completedWorkouts").withIndex("by_profileId", …).collect().length`
  (or a paginated count helper).
- The Branch 1 toolbar can grow a "Sort by tonal score" option that reads
  `strengthScore` descending, with nulls at the bottom.

## Estimated size

- Schema: ~10 tables × (1 column + 2-3 indexes) = ~30 schema-file lines.
- Sync writes: ~8 call sites updated to pass `profileId`.
- Reads: ~5 files, maybe 40-80 total lines of index swaps.
- Backfill migration: ~100 lines, similar shape to
  `convex/migrations/mergeDuplicateCoachByEmail.ts`.
- Tests: add `profileId`-join tests to
  `convex/tonal/syncQueries.test.ts` and `convex/dashboard.test.ts`.

Rough estimate: ~1 day of focused work, plus one sync-cycle's wait between
commits 1 and 2 for safety.
