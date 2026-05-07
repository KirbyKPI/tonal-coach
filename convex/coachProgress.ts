/**
 * Aggregate progress data for the coach progress view.
 * Returns cross-client strength trends, training stats, activity calendars,
 * muscle readiness, and progress alerts.
 */

import { query } from "./_generated/server";
import { getEffectiveUserId } from "./lib/auth";
import type { Doc } from "./_generated/dataModel";

/** Helper: filter out the coach stub profile. */
function isRealClient(p: Doc<"userProfiles">) {
  return !(p.isCoachAccount && p.tonalUserId.startsWith("coach-"));
}

/** Aggregate progress data across all coach clients. */
export const getAggregateProgress = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getEffectiveUserId(ctx);
    if (!userId) return null;

    const allProfiles = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const clients = allProfiles.filter(isRealClient);
    if (clients.length === 0) return { clients: [] };

    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const results = await Promise.all(
      clients.map(async (profile) => {
        const name =
          profile.clientLabel ??
          (profile.profileData
            ? `${profile.profileData.firstName} ${profile.profileData.lastName}`.trim()
            : "Unnamed");

        // Strength history (last 20 snapshots)
        const strengthHistory = await ctx.db
          .query("strengthScoreSnapshots")
          .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
          .order("desc")
          .take(20);

        // Completed workouts (last 30 days)
        const workouts = await ctx.db
          .query("completedWorkouts")
          .withIndex("by_profileId_date", (q) =>
            q.eq("profileId", profile._id).gte("date", thirtyDaysAgo),
          )
          .collect();

        // Activity calendar — set of dates with workouts
        const activeDates: string[] = [];
        const areaCount: Record<string, number> = {};
        let totalVolume = 0;
        let totalDuration = 0;

        for (const w of workouts) {
          if (!activeDates.includes(w.date)) activeDates.push(w.date);
          const area = w.targetArea || "General";
          areaCount[area] = (areaCount[area] ?? 0) + 1;
          totalVolume += w.totalVolume ?? 0;
          totalDuration += w.totalDuration ?? 0;
        }

        // Muscle readiness
        const readiness = await ctx.db
          .query("muscleReadiness")
          .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
          .first();

        // Current strength scores
        const currentScores = await ctx.db
          .query("currentStrengthScores")
          .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
          .collect();

        // Progress alerts
        const alerts: string[] = [];
        const latest = strengthHistory[0];
        const previous = strengthHistory[1];
        if (latest && previous && latest.overall < previous.overall - 5) {
          alerts.push("declining");
        }
        if (
          strengthHistory.length >= 3 &&
          Math.abs(strengthHistory[0].overall - strengthHistory[2].overall) <= 2
        ) {
          alerts.push("plateau");
        }
        const lastWorkout =
          workouts.length > 0 ? workouts.reduce((a, b) => (a.date > b.date ? a : b)) : null;
        const daysSinceLast = lastWorkout
          ? Math.floor((now - new Date(lastWorkout.date).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        if (daysSinceLast !== null && daysSinceLast >= 7) {
          alerts.push("inactive");
        }
        if (workouts.length === 0 && strengthHistory.length === 0) {
          alerts.push("no_data");
        }

        return {
          profileId: profile._id,
          name,
          level: profile.profileData?.level ?? null,
          strengthHistory: strengthHistory
            .map((s) => ({
              date: s.date,
              overall: s.overall,
              upper: s.upper,
              lower: s.lower,
              core: s.core,
            }))
            .reverse(),
          currentScores: currentScores.map((s) => ({
            region: s.bodyRegion,
            score: s.score,
          })),
          training: {
            workouts30d: workouts.length,
            totalVolume,
            totalDuration,
            byArea: Object.entries(areaCount)
              .map(([area, count]) => ({ area, count }))
              .sort((a, b) => b.count - a.count),
          },
          activeDates,
          readiness: readiness
            ? {
                chest: readiness.chest,
                shoulders: readiness.shoulders,
                back: readiness.back,
                triceps: readiness.triceps,
                biceps: readiness.biceps,
                abs: readiness.abs,
                obliques: readiness.obliques,
                quads: readiness.quads,
                glutes: readiness.glutes,
                hamstrings: readiness.hamstrings,
                calves: readiness.calves,
              }
            : null,
          alerts,
          daysSinceLastWorkout: daysSinceLast,
        };
      }),
    );

    return { clients: results };
  },
});
