/**
 * Multi-client (coach) profile management.
 *
 * A coach owns many `userProfiles` rows — one per client + optionally one for
 * themselves. This module holds everything that operates on that set: which
 * profile is currently active, listing them, adding, renaming, removing.
 *
 * Split out of `userProfiles.ts` because the combined file exceeded the
 * 400-line file-size cap and this is a natural responsibility boundary.
 */

import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { getEffectiveUserId } from "./lib/auth";

/** Returns all client profiles owned by a user (coach use-case: multiple clients). */
export const listByUserId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

/** Sets which profile is currently "active" for this user/coach. */
export const setActiveProfile = mutation({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, { profileId }) => {
    const userId = await getEffectiveUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Verify the profile belongs to this user
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) {
      throw new Error("Profile not found or not owned by this user");
    }

    await ctx.db.patch(userId, { activeClientProfileId: profileId });
    return profileId;
  },
});

/** Returns the currently active profile for this user, falling back to the first profile. */
export const getActiveProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getEffectiveUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    // If user has an explicit active profile set, use it
    if (user.activeClientProfileId) {
      const active = await ctx.db.get(user.activeClientProfileId);
      if (active && active.userId === userId) return active;
    }

    // Fall back to the first profile (preserves existing single-user behavior)
    return ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

/** Returns all profiles owned by the current user (for the switcher dropdown). */
export const listMyProfiles = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getEffectiveUserId(ctx);
    if (!userId) return [];

    return ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

/** Adds a new client profile under the current coach account. */
export const addClientProfile = mutation({
  args: {
    clientLabel: v.string(),
    tonalEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getEffectiveUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Create a stub profile — the OAuth/connect flow will fill in the token
    const profileId = await ctx.db.insert("userProfiles", {
      userId,
      tonalUserId: "",
      tonalToken: "",
      clientLabel: args.clientLabel,
      tonalEmail: args.tonalEmail,
      isCoachAccount: false,
      lastActiveAt: Date.now(),
    });

    // Auto-activate the new profile
    await ctx.db.patch(userId, { activeClientProfileId: profileId });
    return profileId;
  },
});

export const MAX_CLIENT_LABEL_LENGTH = 64;

/**
 * Validates and normalizes a client label input. Returns the trimmed value
 * on success, throws with a user-facing message on invalid input. Extracted
 * so it can be unit-tested without a Convex runtime.
 */
export function validateClientLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Client name cannot be empty");
  if (trimmed.length > MAX_CLIENT_LABEL_LENGTH) {
    throw new Error(`Client name is too long (max ${MAX_CLIENT_LABEL_LENGTH} chars)`);
  }
  return trimmed;
}

/**
 * Renames a client profile. The coach owning the profile is the only one
 * who can rename it, and coach-own profiles (isCoachAccount: true) cannot
 * be renamed — those always render as "KPI Coach Overview" from the UI.
 */
export const renameClientProfile = mutation({
  args: {
    profileId: v.id("userProfiles"),
    clientLabel: v.string(),
  },
  handler: async (ctx, { profileId, clientLabel }) => {
    const userId = await getEffectiveUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) {
      throw new Error("Profile not found");
    }

    if (profile.isCoachAccount) {
      throw new Error("Cannot rename the coach's own profile");
    }

    await ctx.db.patch(profileId, { clientLabel: validateClientLabel(clientLabel) });
  },
});

/** Removes a client profile (cannot remove if it's the only one). */
export const removeClientProfile = mutation({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, { profileId }) => {
    const userId = await getEffectiveUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) {
      throw new Error("Profile not found");
    }

    const all = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    if (all.length <= 1) throw new Error("Cannot remove the only profile");

    await ctx.db.delete(profileId);

    // If we just deleted the active profile, activate the first remaining one
    const user = await ctx.db.get(userId);
    if (user?.activeClientProfileId === profileId) {
      const next = all.find((p) => p._id !== profileId);
      if (next) await ctx.db.patch(userId, { activeClientProfileId: next._id });
    }
  },
});
