/**
 * Supplementary userProfile mutations/queries extracted to keep
 * userProfiles.ts under the 400-line limit.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/** Create a bare-bones coach profile that skips Tonal connection entirely. */
export const createCoachStub = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    // Bail if the user already has a profile
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (existing) return existing._id;

    const now = Date.now();
    return await ctx.db.insert("userProfiles", {
      userId,
      tonalUserId: `coach-${userId}`,
      tonalToken: "coach-no-token",
      isCoachAccount: true,
      clientLabel: "Coach Account",
      lastActiveAt: now,
      tonalConnectedAt: now,
      onboardingData: {
        goal: "coach",
        completedAt: now,
      },
    });
  },
});

/** Get thread staleness threshold for a user (server-only). */
export const getThreadStaleHours = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    return profile?.threadStaleHours ?? 24;
  },
});
