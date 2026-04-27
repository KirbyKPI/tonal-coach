import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

// Exported for tests
export const userIdArgsValidator = { userId: v.id("users") };
export const userIdWithLimitArgsValidator = { userId: v.id("users"), limit: v.number() };
export const profileIdArgsValidator = {
  userId: v.id("users"),
  profileId: v.optional(v.id("userProfiles")),
};
export const profileIdWithLimitArgsValidator = {
  userId: v.id("users"),
  profileId: v.optional(v.id("userProfiles")),
  limit: v.number(),
};

/** Get current strength scores for a user from the local DB. */
export const getCurrentStrengthScores = internalQuery({
  args: profileIdArgsValidator,
  handler: async (ctx, { userId, profileId }) => {
    if (profileId) {
      return await ctx.db
        .query("currentStrengthScores")
        .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
        .collect();
    }
    return await ctx.db
      .query("currentStrengthScores")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

/** Get the latest muscle readiness snapshot for a user. Returns null if none. */
export const getMuscleReadiness = internalQuery({
  args: profileIdArgsValidator,
  handler: async (ctx, { userId, profileId }) => {
    if (profileId) {
      return await ctx.db
        .query("muscleReadiness")
        .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
        .first();
    }
    return await ctx.db
      .query("muscleReadiness")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

/** Get recent completed workouts, ordered by date descending. */
export const getRecentCompletedWorkouts = internalQuery({
  args: profileIdWithLimitArgsValidator,
  handler: async (ctx, { userId, profileId, limit }) => {
    if (profileId) {
      return await ctx.db
        .query("completedWorkouts")
        .withIndex("by_profileId_date", (q) => q.eq("profileId", profileId))
        .order("desc")
        .take(limit);
    }
    return await ctx.db
      .query("completedWorkouts")
      .withIndex("by_userId_date", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

/** Get recent external activities, ordered by beginTime descending. */
export const getRecentExternalActivities = internalQuery({
  args: userIdWithLimitArgsValidator,
  handler: async (ctx, { userId, limit }) => {
    return await ctx.db
      .query("externalActivities")
      .withIndex("by_userId_beginTime", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});
