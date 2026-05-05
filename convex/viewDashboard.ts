/**
 * Read-only dashboard queries for delegated view access.
 * Uses locally synced data (no live Tonal API calls needed).
 */

import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/** Verify the caller has view access to the given profile. Returns profile info or null. */
async function verifyViewAccess(ctx: QueryCtx, profileId: Id<"userProfiles">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", identity.email))
    .first();
  if (!user) return null;

  const profile = await ctx.db.get(profileId);
  if (!profile) return null;

  // Allow if the user owns the profile OR has a view grant
  if (profile.userId === user._id) return { user, profile };

  const grant = await ctx.db
    .query("viewAccess")
    .withIndex("by_viewerUserId", (q) => q.eq("viewerUserId", user._id))
    .collect();

  if (!grant.some((g: Doc<"viewAccess">) => g.profileId === profileId)) return null;
  return { user, profile };
}

/** Get profile summary for the view dashboard header. */
export const getViewProfileSummary = query({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, { profileId }) => {
    const access = await verifyViewAccess(ctx, profileId);
    if (!access) return null;

    const { profile } = access;
    const name = profile.profileData
      ? `${profile.profileData.firstName} ${profile.profileData.lastName}`
      : (profile.clientLabel ?? "Unknown");

    return {
      name,
      level: profile.profileData?.level ?? null,
      gender: profile.profileData?.gender ?? null,
      workoutsPerWeek: profile.profileData?.workoutsPerWeek ?? null,
      tonalStatus: profile.syncStatus ?? "unknown",
    };
  },
});

/** Get recent completed workouts for a viewed profile (synced data). */
export const getViewWorkoutHistory = query({
  args: { profileId: v.id("userProfiles"), limit: v.optional(v.number()) },
  handler: async (ctx, { profileId, limit = 10 }) => {
    const access = await verifyViewAccess(ctx, profileId);
    if (!access) return [];

    return ctx.db
      .query("completedWorkouts")
      .withIndex("by_profileId_date", (q) => q.eq("profileId", profileId))
      .order("desc")
      .take(limit);
  },
});

/** Get current strength scores for a viewed profile (synced data). */
export const getViewStrengthScores = query({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, { profileId }) => {
    const access = await verifyViewAccess(ctx, profileId);
    if (!access) return [];

    return ctx.db
      .query("currentStrengthScores")
      .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
      .collect();
  },
});

/** Get muscle readiness for a viewed profile (synced data). */
export const getViewMuscleReadiness = query({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, { profileId }) => {
    const access = await verifyViewAccess(ctx, profileId);
    if (!access) return null;

    return ctx.db
      .query("muscleReadiness")
      .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
      .first();
  },
});

/** Get strength history for a viewed profile (synced snapshots). */
export const getViewStrengthHistory = query({
  args: { profileId: v.id("userProfiles"), limit: v.optional(v.number()) },
  handler: async (ctx, { profileId, limit = 30 }) => {
    const access = await verifyViewAccess(ctx, profileId);
    if (!access) return [];

    return ctx.db
      .query("strengthScoreSnapshots")
      .withIndex("by_profileId_date", (q) => q.eq("profileId", profileId))
      .order("desc")
      .take(limit);
  },
});

/** Get training frequency (last 30 days) for a viewed profile. */
export const getViewTrainingFrequency = query({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, { profileId }) => {
    const access = await verifyViewAccess(ctx, profileId);
    if (!access) return { total: 0, byArea: [] };

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const workouts = await ctx.db
      .query("completedWorkouts")
      .withIndex("by_profileId_date", (q) =>
        q.eq("profileId", profileId).gte("date", thirtyDaysAgo),
      )
      .collect();

    const counts: Record<string, number> = {};
    for (const w of workouts) {
      const area = w.targetArea || "General";
      counts[area] = (counts[area] ?? 0) + 1;
    }

    return {
      total: workouts.length,
      byArea: Object.entries(counts)
        .map(([targetArea, count]) => ({ targetArea, count }))
        .sort((a, b) => b.count - a.count),
    };
  },
});
