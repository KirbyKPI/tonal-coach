import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { getEffectiveUserId } from "./lib/auth";

/** Debug: list all userIds that have profiles, and which users they map to. */
export const debugProfileOwnership = internalMutation({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("userProfiles").collect();
    const userIds = [...new Set(profiles.map((p) => p.userId))];
    const results = [];
    for (const uid of userIds) {
      const user = await ctx.db.get(uid);
      const profileCount = profiles.filter((p) => p.userId === uid).length;
      const names = profiles
        .filter((p) => p.userId === uid)
        .map((p) =>
          p.profileData
            ? `${p.profileData.firstName} ${p.profileData.lastName}`
            : (p.clientLabel ?? "no-name"),
        )
        .join(", ");
      results.push({
        userId: uid,
        email: user?.email ?? "DELETED USER",
        profileCount,
        names,
      });
    }
    return results;
  },
});

/** List all users and count their data rows across key tables. */
export const debugAllUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const results = [];
    for (const u of users) {
      const workouts = await ctx.db
        .query("completedWorkouts")
        .withIndex("by_userId", (q) => q.eq("userId", u._id))
        .collect();
      const strength = await ctx.db
        .query("strengthScoreSnapshots")
        .withIndex("by_userId", (q) => q.eq("userId", u._id))
        .collect();
      results.push({
        userId: u._id,
        email: u.email ?? "no-email",
        workouts: workouts.length,
        strengthSnapshots: strength.length,
      });
    }
    return results;
  },
});

/** Clean up duplicate Kirby profiles + orphaned profiles under deleted users.
 *  Keeps: 1 best Kirby profile (most data), Adam, Eunice, Coach Account.
 *  Deletes: all other Kirby duplicates + all profiles under deleted users. */
export const cleanupDuplicates = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allProfiles = await ctx.db.query("userProfiles").collect();
    const deleted: string[] = [];

    // 1. Delete all profiles under deleted users
    for (const p of allProfiles) {
      const user = await ctx.db.get(p.userId);
      if (!user) {
        await ctx.db.delete(p._id);
        deleted.push(`${p._id} (orphan under deleted user ${p.userId})`);
      }
    }

    // 2. Find duplicate Kirby profiles under the coach and keep the best one
    // Find the coach — get the LAST one (newest) since there may be duplicates
    const coaches = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", "kirby@kpifit.com"))
      .collect();
    // Pick the one that actually has profiles
    let coach = null;
    for (const c of coaches) {
      const profiles = await ctx.db
        .query("userProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", c._id))
        .first();
      if (profiles) {
        coach = c;
        break;
      }
    }
    if (!coach) return { deleted, kept: [] };

    const coachProfiles = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", coach._id))
      .collect();

    // Separate by type
    const coachStub = coachProfiles.find(
      (p) => p.isCoachAccount && p.tonalUserId.startsWith("coach-"),
    );
    const adam = coachProfiles.find((p) => p.profileData?.firstName === "Adam");
    const eunice = coachProfiles.find((p) => p.profileData?.firstName === "Eunice");
    const kirbyProfiles = coachProfiles.filter(
      (p) => p.profileData?.firstName === "Kirby" && !p.isCoachAccount,
    );

    // Keep the Kirby profile with the most data (has gemini key, sync complete, etc)
    const bestKirby = kirbyProfiles.sort((a, b) => {
      const score = (p: typeof a) => {
        let s = 0;
        if (p.geminiApiKeyEncrypted) s += 10;
        if (p.claudeApiKeyEncrypted) s += 10;
        if (p.syncStatus === "complete") s += 5;
        if (p.onboardingData?.completedAt) s += 3;
        if (p.trainingPreferences) s += 2;
        if (p.tonalTokenExpiresAt && p.tonalTokenExpiresAt > Date.now()) s += 5;
        return s;
      };
      return score(b) - score(a);
    })[0];

    // Delete extra Kirby profiles
    for (const k of kirbyProfiles) {
      if (bestKirby && k._id === bestKirby._id) continue;
      await ctx.db.delete(k._id);
      deleted.push(`${k._id} (duplicate Kirby)`);
    }

    // Also delete any profiles with no name, no profileData, not coach stub
    const unnamed = coachProfiles.filter(
      (p) => !p.profileData && !p.isCoachAccount && !p.clientLabel,
    );
    for (const u of unnamed) {
      await ctx.db.delete(u._id);
      deleted.push(`${u._id} (unnamed/empty)`);
    }

    return {
      deleted,
      kept: [
        coachStub ? `Coach Account (${coachStub._id})` : null,
        bestKirby ? `Kirby Coggins (${bestKirby._id})` : null,
        adam ? `Adam (${adam._id})` : null,
        eunice ? `Eunice (${eunice._id})` : null,
      ].filter(Boolean),
    };
  },
});

/** Migrate ALL user data from one userId to another. */
export const migrateAllUserData = internalMutation({
  args: { fromUserId: v.id("users"), toUserId: v.id("users") },
  handler: async (ctx, { fromUserId, toUserId }) => {
    const counts: Record<string, number> = {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function migrate(tableName: string, rows: Array<{ _id: any }>) {
      for (const row of rows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ctx.db.patch(row._id, { userId: toUserId } as any);
      }
      counts[tableName] = rows.length;
    }

    await migrate(
      "completedWorkouts",
      await ctx.db
        .query("completedWorkouts")
        .withIndex("by_userId", (q) => q.eq("userId", fromUserId))
        .collect(),
    );
    await migrate(
      "exercisePerformance",
      await ctx.db
        .query("exercisePerformance")
        .withIndex("by_userId_date", (q) => q.eq("userId", fromUserId))
        .collect(),
    );
    await migrate(
      "strengthScoreSnapshots",
      await ctx.db
        .query("strengthScoreSnapshots")
        .withIndex("by_userId", (q) => q.eq("userId", fromUserId))
        .collect(),
    );
    await migrate(
      "currentStrengthScores",
      await ctx.db
        .query("currentStrengthScores")
        .withIndex("by_userId", (q) => q.eq("userId", fromUserId))
        .collect(),
    );
    await migrate(
      "muscleReadiness",
      await ctx.db
        .query("muscleReadiness")
        .withIndex("by_userId", (q) => q.eq("userId", fromUserId))
        .collect(),
    );
    await migrate(
      "workoutPlans",
      await ctx.db
        .query("workoutPlans")
        .withIndex("by_userId", (q) => q.eq("userId", fromUserId))
        .collect(),
    );
    await migrate(
      "weekPlans",
      await ctx.db
        .query("weekPlans")
        .withIndex("by_userId", (q) => q.eq("userId", fromUserId))
        .collect(),
    );
    await migrate(
      "workoutFeedback",
      await ctx.db
        .query("workoutFeedback")
        .withIndex("by_userId", (q) => q.eq("userId", fromUserId))
        .collect(),
    );
    await migrate(
      "trainingBlocks",
      await ctx.db
        .query("trainingBlocks")
        .withIndex("by_userId", (q) => q.eq("userId", fromUserId))
        .collect(),
    );
    await migrate(
      "goals",
      await ctx.db
        .query("goals")
        .withIndex("by_userId", (q) => q.eq("userId", fromUserId))
        .collect(),
    );
    await migrate(
      "injuries",
      await ctx.db
        .query("injuries")
        .withIndex("by_userId", (q) => q.eq("userId", fromUserId))
        .collect(),
    );
    await migrate(
      "checkIns",
      await ctx.db
        .query("checkIns")
        .withIndex("by_userId", (q) => q.eq("userId", fromUserId))
        .collect(),
    );
    await migrate(
      "externalActivities",
      await ctx.db
        .query("externalActivities")
        .withIndex("by_userId_beginTime", (q) => q.eq("userId", fromUserId))
        .collect(),
    );
    await migrate(
      "aiUsage",
      await ctx.db
        .query("aiUsage")
        .withIndex("by_userId", (q) => q.eq("userId", fromUserId))
        .collect(),
    );
    await migrate(
      "tonalCache",
      await ctx.db
        .query("tonalCache")
        .withIndex("by_userId_dataType", (q) => q.eq("userId", fromUserId))
        .collect(),
    );

    return { fromUserId, toUserId, counts };
  },
});

/** Reassign ALL profiles from one userId to another.
 *  npx convex run coachDashboard:migrateProfiles '{"fromUserId":"old","toUserId":"new"}' --prod */
export const migrateProfiles = internalMutation({
  args: { fromUserId: v.id("users"), toUserId: v.id("users") },
  handler: async (ctx, { fromUserId, toUserId }) => {
    const profiles = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", fromUserId))
      .collect();

    for (const p of profiles) {
      await ctx.db.patch(p._id, { userId: toUserId });
    }

    return { migrated: profiles.length, fromUserId, toUserId };
  },
});

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
