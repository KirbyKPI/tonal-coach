/**
 * Migration: backfill profileId on workout data tables.
 *
 * For single-user accounts (1 profile per userId), all records get that
 * profile's _id. For multi-client coaches, we can't deterministically
 * match old records to profiles since they were all stored under the
 * coach's userId. Instead, we trigger a re-sync for each client profile
 * which will create new records with profileId set.
 *
 * Run after deploying the schema + code changes:
 *   npx convex run migrations/backfillProfileId:backfillSingleUserProfiles
 *   npx convex run migrations/backfillProfileId:requeueCoachClientSyncs
 */

import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

/**
 * For users with exactly one profile, stamp profileId on all their
 * completedWorkouts, exercisePerformance, strengthScoreSnapshots,
 * currentStrengthScores, muscleReadiness, and externalActivities records.
 */
export const backfillSingleUserProfiles = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allProfiles = await ctx.db.query("userProfiles").collect();

    // Group profiles by userId
    const byUser = new Map<string, typeof allProfiles>();
    for (const p of allProfiles) {
      const arr = byUser.get(p.userId) ?? [];
      arr.push(p);
      byUser.set(p.userId, arr);
    }

    let patchedWorkouts = 0;
    let patchedPerformance = 0;
    let patchedStrength = 0;
    let patchedCurrentStrength = 0;
    let patchedReadiness = 0;
    let patchedExternal = 0;

    for (const [userId, profiles] of byUser) {
      // Only handle single-profile users; multi-client coaches get re-synced
      if (profiles.length !== 1) continue;
      const profileId = profiles[0]._id;

      // completedWorkouts
      const workouts = await ctx.db
        .query("completedWorkouts")
        .withIndex("by_userId", (q) => q.eq("userId", userId as Id<"users">))
        .collect();
      for (const w of workouts) {
        if (!w.profileId) {
          await ctx.db.patch(w._id, { profileId });
          patchedWorkouts++;
        }
      }

      // exercisePerformance
      const perfs = await ctx.db
        .query("exercisePerformance")
        .withIndex("by_userId_date", (q) => q.eq("userId", userId as Id<"users">))
        .collect();
      for (const p of perfs) {
        if (!p.profileId) {
          await ctx.db.patch(p._id, { profileId });
          patchedPerformance++;
        }
      }

      // strengthScoreSnapshots
      const snaps = await ctx.db
        .query("strengthScoreSnapshots")
        .withIndex("by_userId", (q) => q.eq("userId", userId as Id<"users">))
        .collect();
      for (const s of snaps) {
        if (!s.profileId) {
          await ctx.db.patch(s._id, { profileId });
          patchedStrength++;
        }
      }

      // currentStrengthScores
      const curScores = await ctx.db
        .query("currentStrengthScores")
        .withIndex("by_userId", (q) => q.eq("userId", userId as Id<"users">))
        .collect();
      for (const cs of curScores) {
        if (!cs.profileId) {
          await ctx.db.patch(cs._id, { profileId });
          patchedCurrentStrength++;
        }
      }

      // muscleReadiness
      const mr = await ctx.db
        .query("muscleReadiness")
        .withIndex("by_userId", (q) => q.eq("userId", userId as Id<"users">))
        .first();
      if (mr && !mr.profileId) {
        await ctx.db.patch(mr._id, { profileId });
        patchedReadiness++;
      }

      // externalActivities
      const ext = await ctx.db
        .query("externalActivities")
        .withIndex("by_userId_beginTime", (q) => q.eq("userId", userId as Id<"users">))
        .collect();
      for (const e of ext) {
        if (!e.profileId) {
          await ctx.db.patch(e._id, { profileId });
          patchedExternal++;
        }
      }
    }

    return {
      patchedWorkouts,
      patchedPerformance,
      patchedStrength,
      patchedCurrentStrength,
      patchedReadiness,
      patchedExternal,
    };
  },
});

/**
 * For multi-client coaches (users with >1 profile), trigger a fresh
 * backfill sync for each client profile. This creates new workout
 * records with profileId set correctly. Old records without profileId
 * can be cleaned up separately.
 */
export const requeueCoachClientSyncs = internalAction({
  args: {},
  handler: async (ctx) => {
    const allProfiles = await ctx.runQuery(internal.migrations.backfillProfileId.getAllProfiles);

    // Group by userId
    const byUser = new Map<string, typeof allProfiles>();
    for (const p of allProfiles) {
      const arr = byUser.get(p.userId) ?? [];
      arr.push(p);
      byUser.set(p.userId, arr);
    }

    let scheduled = 0;
    for (const [userId, profiles] of byUser) {
      if (profiles.length <= 1) continue; // Already handled by single-user migration

      for (const profile of profiles) {
        // Skip coach stub profiles and disconnected profiles
        if (profile.isCoachAccount && profile.tonalUserId.startsWith("coach-")) continue;
        if (!profile.tonalToken) continue;

        // Schedule a backfill for this specific client profile
        await ctx.scheduler.runAfter(
          scheduled * 5000, // Stagger by 5s to avoid rate limits
          internal.tonal.historySync.backfillUserHistory,
          {
            userId: userId as Id<"users">,
            profileId: profile._id as Id<"userProfiles">,
          },
        );
        scheduled++;
      }
    }

    return { scheduledSyncs: scheduled };
  },
});

/** Helper query: return all profiles (used by the action above). */
export const getAllProfiles = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("userProfiles").collect();
  },
});
