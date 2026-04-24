/**
 * Coach dashboard queries.
 *
 * getClientOverviews — card data for the /coach client grid.
 * getCoachOverview  — aggregate stats shown when the coach stub profile is active.
 *
 * Admin/debug/migration utilities live in coachAdmin.ts.
 */

import { query } from "./_generated/server";
import { getEffectiveUserId } from "./lib/auth";

/**
 * Returns a summary card for every client profile owned by the current user.
 * Used exclusively by the /coach dashboard page.
 */
export const getClientOverviews = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getEffectiveUserId(ctx);
    if (!userId) return [];

    const allProfiles = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    // Hide the coach's own stub profile — it's not a real client
    const profiles = allProfiles.filter(
      (p) => !(p.isCoachAccount && p.tonalUserId.startsWith("coach-")),
    );

    const user = await ctx.db.get(userId);
    const activeProfileId = user?.activeClientProfileId;

    return Promise.all(
      profiles.map(async (profile) => {
        const latestPlan = await ctx.db
          .query("workoutPlans")
          .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
          .order("desc")
          .first();

        const latestWorkout = await ctx.db
          .query("completedWorkouts")
          .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
          .order("desc")
          .first();

        const activeBlock = await ctx.db
          .query("trainingBlocks")
          .withIndex("by_userId_status", (q) =>
            q.eq("userId", profile.userId).eq("status", "active"),
          )
          .first();

        const recentCheckIns = await ctx.db
          .query("checkIns")
          .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
          .order("desc")
          .take(5);

        const latestStrength = await ctx.db
          .query("strengthScoreSnapshots")
          .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
          .order("desc")
          .first();

        return {
          profileId: profile._id,
          isActive: profile._id === activeProfileId,
          clientLabel:
            profile.clientLabel ??
            (`${profile.profileData?.firstName ?? ""} ${profile.profileData?.lastName ?? ""}`.trim() ||
              (profile.tonalEmail ?? "Unnamed client")),
          tonalUsername: profile.profileData?.username ?? null,
          firstName: profile.profileData?.firstName ?? null,
          lastName: profile.profileData?.lastName ?? null,
          level: profile.profileData?.level ?? null,
          lastActiveAt: profile.lastActiveAt,
          currentBlockType: activeBlock?.blockType ?? null,
          currentBlockLabel: activeBlock?.label ?? null,
          currentBlockWeek: activeBlock?.weekNumber ?? null,
          currentPlanStatus: latestPlan?.status ?? null,
          lastWorkoutDate: latestWorkout?.date ?? null,
          lastWorkoutName: latestWorkout?.title ?? null,
          strengthScore: latestStrength?.overall ?? null,
          checkInAlerts: recentCheckIns.filter(
            (c) =>
              !profile.checkInsReadAllBeforeAt ||
              c._creationTime > (profile.checkInsReadAllBeforeAt ?? 0),
          ).length,
          hasConnectedTonal: !!profile.tonalToken && profile.tonalToken !== "",
          isCoachAccount: profile.isCoachAccount ?? false,
        };
      }),
    );
  },
});

/** Aggregate overview for the coach dashboard — stats across all clients. */
export const getCoachOverview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getEffectiveUserId(ctx);
    if (!userId) return null;

    const allProfiles = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const clients = allProfiles.filter(
      (p) => !(p.isCoachAccount && p.tonalUserId.startsWith("coach-")),
    );

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const clientSummaries = await Promise.all(
      clients.map(async (profile) => {
        const name = profile.profileData
          ? `${profile.profileData.firstName} ${profile.profileData.lastName}`
          : (profile.clientLabel ?? "Unnamed");

        const recentWorkouts = await ctx.db
          .query("completedWorkouts")
          .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
          .order("desc")
          .take(50);

        const workoutsLast7d = recentWorkouts.filter(
          (w) => new Date(w.date).getTime() > sevenDaysAgo,
        ).length;
        const workoutsLast30d = recentWorkouts.filter(
          (w) => new Date(w.date).getTime() > thirtyDaysAgo,
        ).length;

        const lastWorkout = recentWorkouts[0];
        const daysSinceLastWorkout = lastWorkout
          ? Math.floor((now - new Date(lastWorkout.date).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const latestStrength = await ctx.db
          .query("strengthScoreSnapshots")
          .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
          .order("desc")
          .first();

        const prevStrength = await ctx.db
          .query("strengthScoreSnapshots")
          .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
          .order("desc")
          .take(2);

        const strengthTrend =
          prevStrength.length === 2 ? prevStrength[0].overall - prevStrength[1].overall : 0;

        const recentCheckIns = await ctx.db
          .query("checkIns")
          .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
          .order("desc")
          .take(5);
        const unreadAlerts = recentCheckIns.filter(
          (c) =>
            !profile.checkInsReadAllBeforeAt ||
            c._creationTime > (profile.checkInsReadAllBeforeAt ?? 0),
        ).length;

        const connected =
          !!profile.tonalToken &&
          profile.tonalToken !== "" &&
          profile.tonalToken !== "coach-no-token";

        return {
          profileId: profile._id,
          name,
          connected,
          workoutsLast7d,
          workoutsLast30d,
          daysSinceLastWorkout,
          strengthScore: latestStrength?.overall ?? null,
          strengthTrend,
          unreadAlerts,
          level: profile.profileData?.level ?? null,
        };
      }),
    );

    return {
      totalClients: clients.length,
      connectedClients: clientSummaries.filter((c) => c.connected).length,
      activeThisWeek: clientSummaries.filter((c) => c.workoutsLast7d > 0).length,
      totalWorkoutsThisWeek: clientSummaries.reduce((sum, c) => sum + c.workoutsLast7d, 0),
      totalAlerts: clientSummaries.reduce((sum, c) => sum + c.unreadAlerts, 0),
      fallingBehind: clientSummaries.filter(
        (c) => c.connected && c.daysSinceLastWorkout !== null && c.daysSinceLastWorkout > 7,
      ),
      clients: clientSummaries,
    };
  },
});
