/**
 * Merges two user rows that were accidentally created for the same coach
 * because the auth layer didn't normalize the email case (eg. an old
 * "KIRBY@KPIFIT.COM" user sitting next to a newer "kirby@kpifit.com" user).
 *
 * Run via the Convex dashboard:
 *   internal.migrations.mergeDuplicateCoachByEmail.run
 *   args: { fromEmail: "KIRBY@KPIFIT.COM", toEmail: "kirby@kpifit.com" }
 *
 * Always run with `dryRun: true` first. The returned `historyCounts` tells
 * you how many training rows will be deleted (or moved, if you opt into
 * `preserveHistory`). This migration is idempotent — a second run with the
 * same inputs is a no-op because the source row is gone.
 *
 * What moves unconditionally:
 *   - Every `userProfiles` row owned by the source is repointed to the target
 *   - `goals` and `injuries` (coach-scoped domain data)
 *   - `activeClientProfileId` is adopted by the target if unset there
 *
 * What happens to per-user training rows (commingled pool that all clients
 * currently share because the multi-client refactor didn't split training
 * data by profile):
 *   - Default: deleted. Reconnect Tonal for each profile afterwards and
 *     `historySync.backfillUserHistory` rebuilds clean data.
 *   - `preserveHistory: true`: repoint to the target user (brings the
 *     commingled pool along for the ride).
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

async function findUserByEmail(ctx: MutationCtx, email: string): Promise<Doc<"users"> | null> {
  return ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .unique();
}

/**
 * Returns every history row owned by `userId` across all per-user training
 * tables, tagged with the table name so the caller can delete or repoint
 * each one with the right schema.
 */
async function collectHistoryRows(ctx: MutationCtx, userId: Id<"users">) {
  const completedWorkouts = await ctx.db
    .query("completedWorkouts")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const exercisePerformance = await ctx.db
    .query("exercisePerformance")
    .withIndex("by_userId_date", (q) => q.eq("userId", userId))
    .collect();
  const strengthScoreSnapshots = await ctx.db
    .query("strengthScoreSnapshots")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const currentStrengthScores = await ctx.db
    .query("currentStrengthScores")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const muscleReadiness = await ctx.db
    .query("muscleReadiness")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const workoutPlans = await ctx.db
    .query("workoutPlans")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const trainingBlocks = await ctx.db
    .query("trainingBlocks")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const weekPlans = await ctx.db
    .query("weekPlans")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const workoutFeedback = await ctx.db
    .query("workoutFeedback")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const checkIns = await ctx.db
    .query("checkIns")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  return {
    completedWorkouts,
    exercisePerformance,
    strengthScoreSnapshots,
    currentStrengthScores,
    muscleReadiness,
    workoutPlans,
    trainingBlocks,
    weekPlans,
    workoutFeedback,
    checkIns,
  };
}

export const run = internalMutation({
  args: {
    fromEmail: v.string(),
    toEmail: v.string(),
    /** If true, repoint history rows to the target user instead of deleting. */
    preserveHistory: v.optional(v.boolean()),
    /** If true, don't write anything; return the plan only. */
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { fromEmail, toEmail, preserveHistory, dryRun }) => {
    if (fromEmail === toEmail) {
      throw new Error("fromEmail and toEmail must differ");
    }

    const fromUser = await findUserByEmail(ctx, fromEmail);
    const toUser = await findUserByEmail(ctx, toEmail);

    if (!toUser) {
      throw new Error(`Target user not found for email "${toEmail}"`);
    }
    if (!fromUser) {
      return { status: "noop" as const, reason: "source user not found (already merged?)" };
    }
    if (fromUser._id === toUser._id) {
      return { status: "noop" as const, reason: "source and target resolve to the same user" };
    }

    const movedProfiles = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", fromUser._id))
      .collect();
    const goals = await ctx.db
      .query("goals")
      .withIndex("by_userId", (q) => q.eq("userId", fromUser._id))
      .collect();
    const injuries = await ctx.db
      .query("injuries")
      .withIndex("by_userId", (q) => q.eq("userId", fromUser._id))
      .collect();
    const history = await collectHistoryRows(ctx, fromUser._id);

    const historyCounts = {
      completedWorkouts: history.completedWorkouts.length,
      exercisePerformance: history.exercisePerformance.length,
      strengthScoreSnapshots: history.strengthScoreSnapshots.length,
      currentStrengthScores: history.currentStrengthScores.length,
      muscleReadiness: history.muscleReadiness.length,
      workoutPlans: history.workoutPlans.length,
      trainingBlocks: history.trainingBlocks.length,
      weekPlans: history.weekPlans.length,
      workoutFeedback: history.workoutFeedback.length,
      checkIns: history.checkIns.length,
    };

    if (dryRun) {
      return {
        status: "dry-run" as const,
        fromUserId: fromUser._id,
        toUserId: toUser._id,
        profilesToMove: movedProfiles.length,
        goalsToMove: goals.length,
        injuriesToMove: injuries.length,
        historyCounts,
        willAdoptActiveProfile: !toUser.activeClientProfileId && !!fromUser.activeClientProfileId,
      };
    }

    // 1. Repoint userProfiles, goals, injuries to the target user
    for (const p of movedProfiles) await ctx.db.patch(p._id, { userId: toUser._id });
    for (const g of goals) await ctx.db.patch(g._id, { userId: toUser._id });
    for (const i of injuries) await ctx.db.patch(i._id, { userId: toUser._id });

    // 2. Adopt the source's activeClientProfileId if the target has none
    if (!toUser.activeClientProfileId && fromUser.activeClientProfileId) {
      await ctx.db.patch(toUser._id, {
        activeClientProfileId: fromUser.activeClientProfileId,
      });
    }

    // 3. Handle history tables — delete (default) or repoint.
    // Inlined per-table so TS can narrow each _id to the correct table.
    if (preserveHistory) {
      for (const r of history.completedWorkouts) await ctx.db.patch(r._id, { userId: toUser._id });
      for (const r of history.exercisePerformance)
        await ctx.db.patch(r._id, { userId: toUser._id });
      for (const r of history.strengthScoreSnapshots)
        await ctx.db.patch(r._id, { userId: toUser._id });
      for (const r of history.currentStrengthScores)
        await ctx.db.patch(r._id, { userId: toUser._id });
      for (const r of history.muscleReadiness) await ctx.db.patch(r._id, { userId: toUser._id });
      for (const r of history.workoutPlans) await ctx.db.patch(r._id, { userId: toUser._id });
      for (const r of history.trainingBlocks) await ctx.db.patch(r._id, { userId: toUser._id });
      for (const r of history.weekPlans) await ctx.db.patch(r._id, { userId: toUser._id });
      for (const r of history.workoutFeedback) await ctx.db.patch(r._id, { userId: toUser._id });
      for (const r of history.checkIns) await ctx.db.patch(r._id, { userId: toUser._id });
    } else {
      for (const r of history.completedWorkouts) await ctx.db.delete(r._id);
      for (const r of history.exercisePerformance) await ctx.db.delete(r._id);
      for (const r of history.strengthScoreSnapshots) await ctx.db.delete(r._id);
      for (const r of history.currentStrengthScores) await ctx.db.delete(r._id);
      for (const r of history.muscleReadiness) await ctx.db.delete(r._id);
      for (const r of history.workoutPlans) await ctx.db.delete(r._id);
      for (const r of history.trainingBlocks) await ctx.db.delete(r._id);
      for (const r of history.weekPlans) await ctx.db.delete(r._id);
      for (const r of history.workoutFeedback) await ctx.db.delete(r._id);
      for (const r of history.checkIns) await ctx.db.delete(r._id);
    }

    // 4. Delete the source user row last
    await ctx.db.delete(fromUser._id);

    return {
      status: "ok" as const,
      fromUserId: fromUser._id,
      toUserId: toUser._id,
      profilesMoved: movedProfiles.length,
      goalsMoved: goals.length,
      injuriesMoved: injuries.length,
      historyAction: preserveHistory ? ("repointed" as const) : ("deleted" as const),
      historyCounts,
    };
  },
});
