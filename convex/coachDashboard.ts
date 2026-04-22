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

    const profiles = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const user = await ctx.db.get(userId);
    const activeProfileId = user?.activeClientProfileId;

    return Promise.all(
      profiles.map(async (profile) => {
        // Latest workout plan
        const latestPlan = await ctx.db
          .query("workoutPlans")
          .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
          .order("desc")
          .first();

        // Most recent completed workout
        const latestWorkout = await ctx.db
          .query("completedWorkouts")
          .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
          .order("desc")
          .first();

        // Active training block
        const activeBlock = await ctx.db
          .query("trainingBlocks")
          .withIndex("by_userId_status", (q) =>
            q.eq("userId", profile.userId).eq("status", "active"),
          )
          .first();

        // Recent check-ins (unread)
        const recentCheckIns = await ctx.db
          .query("checkIns")
          .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
          .order("desc")
          .take(5);

        // Latest strength score
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
