/**
 * Admin/debug/migration utilities for the coach system.
 * All internal mutations — not callable from the client.
 * Run via: npx convex run coachAdmin:<functionName> --prod
 */

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/** List all profiles with their IDs, names, emails, and labels for debugging. */
export const listAllProfiles = internalMutation({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("userProfiles").collect();
    return profiles.map((p) => ({
      id: p._id,
      userId: p.userId,
      tonalEmail: p.tonalEmail ?? "unset",
      clientLabel: p.clientLabel ?? "unset",
      firstName: p.profileData?.firstName ?? "unset",
      lastName: p.profileData?.lastName ?? "unset",
      isCoachAccount: p.isCoachAccount ?? false,
      tonalUserId: p.tonalUserId,
    }));
  },
});

/** Patch a profile's clientLabel by ID. */
export const patchProfileLabel = internalMutation({
  args: { profileId: v.id("userProfiles"), clientLabel: v.string() },
  handler: async (ctx, { profileId, clientLabel }) => {
    await ctx.db.patch(profileId, { clientLabel });
    return { patched: profileId, clientLabel };
  },
});

/** Clear corrupted profileData so display falls back to clientLabel. */
export const clearProfileData = internalMutation({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, { profileId }) => {
    await ctx.db.patch(profileId, { profileData: undefined });
    return { cleared: profileId };
  },
});

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

/** Reassign ALL profiles from one userId to another. */
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

/** Clean up duplicate Kirby profiles + orphaned profiles under deleted users. */
export const cleanupDuplicates = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allProfiles = await ctx.db.query("userProfiles").collect();
    const deleted: string[] = [];

    for (const p of allProfiles) {
      const user = await ctx.db.get(p.userId);
      if (!user) {
        await ctx.db.delete(p._id);
        deleted.push(`${p._id} (orphan under deleted user ${p.userId})`);
      }
    }

    const coaches = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", "kirby@kpifit.com"))
      .collect();
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

    const coachStub = coachProfiles.find(
      (p) => p.isCoachAccount && p.tonalUserId.startsWith("coach-"),
    );
    const adam = coachProfiles.find((p) => p.profileData?.firstName === "Adam");
    const eunice = coachProfiles.find((p) => p.profileData?.firstName === "Eunice");
    const kirbyProfiles = coachProfiles.filter(
      (p) => p.profileData?.firstName === "Kirby" && !p.isCoachAccount,
    );

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

    for (const k of kirbyProfiles) {
      if (bestKirby && k._id === bestKirby._id) continue;
      await ctx.db.delete(k._id);
      deleted.push(`${k._id} (duplicate Kirby)`);
    }

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
