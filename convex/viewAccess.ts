/**
 * Delegated view access — lets a coach grant read-only dashboard access
 * for specific client profiles to another user (e.g. a gym owner, training
 * partner, or secondary coach).
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Return all profiles the current user has been granted view access to. */
export const getViewableProfiles = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .first();
    if (!user) return [];

    const grants = await ctx.db
      .query("viewAccess")
      .withIndex("by_viewerUserId", (q) => q.eq("viewerUserId", user._id))
      .collect();

    const profiles = await Promise.all(
      grants.map(async (g) => {
        const profile = await ctx.db.get(g.profileId);
        if (!profile) return null;

        const name = profile.profileData
          ? `${profile.profileData.firstName} ${profile.profileData.lastName}`
          : (profile.clientLabel ?? "Unknown");

        return {
          profileId: profile._id,
          name,
          tonalUserId: profile.tonalUserId,
          ownerId: profile.userId,
          grantId: g._id,
        };
      }),
    );

    return profiles.filter(Boolean);
  },
});

/** List all view access grants for a given profile (admin view). */
export const getGrantsForProfile = query({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, { profileId }) => {
    return ctx.db
      .query("viewAccess")
      .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
      .collect();
  },
});

// ---------------------------------------------------------------------------
// Mutations (coach-facing)
// ---------------------------------------------------------------------------

/** Grant view access to a user by email. Coach must own the profile. */
export const grantAccess = mutation({
  args: {
    viewerEmail: v.string(),
    profileId: v.id("userProfiles"),
  },
  handler: async (ctx, { viewerEmail, profileId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const coach = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .first();
    if (!coach) throw new Error("Coach user not found");

    // Verify coach owns the profile
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== coach._id) {
      throw new Error("Profile not found or not owned by you");
    }

    // Find the viewer by email
    const viewer = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", viewerEmail.toLowerCase().trim()))
      .first();
    if (!viewer) throw new Error(`No user found with email ${viewerEmail}`);

    // Check for existing grant
    const existing = await ctx.db
      .query("viewAccess")
      .withIndex("by_viewerUserId", (q) => q.eq("viewerUserId", viewer._id))
      .collect();
    if (existing.some((g) => g.profileId === profileId)) {
      return { status: "already_granted" };
    }

    await ctx.db.insert("viewAccess", {
      viewerUserId: viewer._id,
      profileId,
      grantedBy: coach._id,
      createdAt: Date.now(),
    });

    return { status: "granted", viewerName: viewer.name ?? viewerEmail };
  },
});

/** Revoke view access. Coach must own the profile. */
export const revokeAccess = mutation({
  args: { grantId: v.id("viewAccess") },
  handler: async (ctx, { grantId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const coach = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .first();
    if (!coach) throw new Error("Coach user not found");

    const grant = await ctx.db.get(grantId);
    if (!grant) throw new Error("Grant not found");

    // Verify coach owns the profile
    const profile = await ctx.db.get(grant.profileId);
    if (!profile || profile.userId !== coach._id) {
      throw new Error("Not authorized to revoke this grant");
    }

    await ctx.db.delete(grantId);
    return { status: "revoked" };
  },
});

// ---------------------------------------------------------------------------
// Admin mutations (CLI only)
// ---------------------------------------------------------------------------

/** Grant view access by emails — admin shortcut (public so CLI can call it). */
export const adminGrantAccess = mutation({
  args: {
    viewerEmail: v.string(),
    profileId: v.id("userProfiles"),
    grantedByEmail: v.string(),
  },
  handler: async (ctx, { viewerEmail, profileId, grantedByEmail }) => {
    const viewer = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", viewerEmail.toLowerCase().trim()))
      .first();
    if (!viewer) return { error: `No user found with email ${viewerEmail}` };

    const grantor = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", grantedByEmail.toLowerCase().trim()))
      .first();
    if (!grantor) return { error: `No grantor found with email ${grantedByEmail}` };

    const profile = await ctx.db.get(profileId);
    if (!profile) return { error: "Profile not found" };

    const name = profile.profileData
      ? `${profile.profileData.firstName} ${profile.profileData.lastName}`
      : (profile.clientLabel ?? "Unknown");

    // Check for existing grant
    const existing = await ctx.db
      .query("viewAccess")
      .withIndex("by_viewerUserId", (q) => q.eq("viewerUserId", viewer._id))
      .collect();
    if (existing.some((g) => g.profileId === profileId)) {
      return { status: "already_granted", profileName: name };
    }

    await ctx.db.insert("viewAccess", {
      viewerUserId: viewer._id,
      profileId,
      grantedBy: grantor._id,
      createdAt: Date.now(),
    });

    return { status: "granted", profileName: name, viewerName: viewer.name ?? viewerEmail };
  },
});
