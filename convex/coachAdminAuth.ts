/**
 * Auth-related admin/debug utilities for the coach system.
 * All internal mutations and actions — not callable from the client.
 * Run via: npx convex run coachAdminAuth:<functionName> --prod
 */

import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Deep auth audit: dump ALL fields from authAccounts for this email,
 * check for duplicates, check if secret (password hash) exists,
 * and consolidate to a single working auth account.
 */
export const deepAuthAudit = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalizedEmail = email.trim().toLowerCase();

    // Find ALL authAccounts matching this email
    const allAuthAccounts = await ctx.db.query("authAccounts").collect();
    const matching = allAuthAccounts.filter(
      (a) =>
        a.providerAccountId === normalizedEmail ||
        a.providerAccountId === email ||
        a.providerAccountId === email.toUpperCase(),
    );

    // Dump every field on each account
    const details = await Promise.all(
      matching.map(async (a) => {
        const user = await ctx.db.get(a.userId);
        // Get all keys on the document (including secret/hash)
        const allKeys = Object.keys(a);
        return {
          _id: a._id,
          _creationTime: a._creationTime,
          userId: a.userId,
          userExists: !!user,
          userEmail: user?.email ?? "DELETED",
          provider: a.provider,
          providerAccountId: a.providerAccountId,
          hasSecret: "secret" in a && !!a.secret,
          secretLength: "secret" in a && a.secret ? String(a.secret).length : 0,
          allFields: allKeys,
          // Show all non-standard fields
          extras: Object.fromEntries(
            allKeys
              .filter(
                (k) =>
                  !["_id", "_creationTime", "userId", "provider", "providerAccountId"].includes(k),
              )
              .map((k) => [k, typeof (a as Record<string, unknown>)[k]]),
          ),
        };
      }),
    );

    // Find the target user
    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalizedEmail))
      .collect();
    const targetUser = users[0];

    // Count profiles on the target user
    const profiles = targetUser
      ? await ctx.db
          .query("userProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", targetUser._id))
          .collect()
      : [];

    return {
      userCount: users.length,
      targetUserId: targetUser?._id ?? "NONE",
      targetUserProfileCount: profiles.length,
      targetUserProfileNames: profiles.map((p) =>
        p.profileData
          ? `${p.profileData.firstName} ${p.profileData.lastName}`
          : (p.clientLabel ?? "unnamed"),
      ),
      authAccountCount: matching.length,
      authAccounts: details,
      recommendation:
        matching.length > 1
          ? "Multiple auth accounts found — keep the one with a secret, delete the rest."
          : matching.length === 1 && details[0]?.hasSecret
            ? "Single auth account with password hash — should work. Check Resend domain for reset."
            : "Auth account exists but may be missing password hash.",
    };
  },
});

/**
 * Consolidate auth: keep only the auth account that has a secret (password
 * hash), delete duplicates, and ensure it points to the correct user.
 */
export const consolidateAuthAccounts = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalizedEmail = email.trim().toLowerCase();

    const allAuthAccounts = await ctx.db.query("authAccounts").collect();
    const matching = allAuthAccounts.filter(
      (a) => a.providerAccountId === normalizedEmail || a.providerAccountId === email,
    );

    if (matching.length === 0) {
      return { status: "none_found" };
    }

    // Find the target user (the one with profiles)
    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalizedEmail))
      .collect();
    const targetUser = users[0];

    if (!targetUser) {
      return { status: "no_user" };
    }

    // Prefer the account with a secret (password hash)
    const withSecret = matching.filter((a) => "secret" in a && !!a.secret);
    const keeper = withSecret[0] ?? matching[0];
    const actions: string[] = [];

    // Make sure the keeper points to the right user
    if (keeper.userId !== targetUser._id) {
      await ctx.db.patch(keeper._id, { userId: targetUser._id });
      actions.push(`Repointed keeper ${keeper._id} → ${targetUser._id}`);
    }

    // Delete all others
    for (const account of matching) {
      if (account._id !== keeper._id) {
        await ctx.db.delete(account._id);
        actions.push(`Deleted duplicate authAccount ${account._id}`);
      }
    }

    return {
      status: "consolidated",
      keptAccountId: keeper._id,
      keeperHasSecret: "secret" in keeper && !!keeper.secret,
      targetUserId: targetUser._id,
      actions,
    };
  },
});

/**
 * Diagnose auth state: find all users with a given email, their auth accounts,
 * and which user actually owns the profiles. Run this first to understand the
 * damage from the broken createOrUpdateUser callback.
 */
export const diagnosAuthState = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Find all user records with this email
    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalizedEmail))
      .collect();

    const userDetails = [];
    for (const u of users) {
      // Count profiles owned by this user
      const profiles = await ctx.db
        .query("userProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", u._id))
        .collect();

      // Find auth accounts pointing to this user
      const authAccounts = await ctx.db
        .query("authAccounts")
        .filter((q) => q.eq(q.field("userId"), u._id))
        .collect();

      // Find active sessions for this user
      const sessions = await ctx.db
        .query("authSessions")
        .filter((q) => q.eq(q.field("userId"), u._id))
        .collect();

      userDetails.push({
        userId: u._id,
        email: u.email,
        createdAt: u._creationTime,
        activeClientProfileId: u.activeClientProfileId ?? null,
        profileCount: profiles.length,
        profileNames: profiles.map((p) =>
          p.profileData
            ? `${p.profileData.firstName} ${p.profileData.lastName}`
            : (p.clientLabel ?? "unnamed"),
        ),
        authAccountCount: authAccounts.length,
        authAccounts: authAccounts.map((a) => ({
          id: a._id,
          provider: a.provider,
          providerAccountId: a.providerAccountId,
        })),
        sessionCount: sessions.length,
      });
    }

    // Identify the "real" user (the one with profiles)
    const realUser = userDetails.find((u) => u.profileCount > 0);
    const orphans = userDetails.filter((u) => u.profileCount === 0);

    return {
      totalUsersWithEmail: users.length,
      realUser: realUser ?? "NONE FOUND",
      orphanUsers: orphans,
      recommendation:
        realUser && orphans.length > 0
          ? `Repoint auth accounts from orphan(s) to real user ${realUser.userId}, then delete orphans.`
          : realUser
            ? "No orphans found — auth may already be correct."
            : "No user with profiles found — manual investigation needed.",
    };
  },
});

/**
 * Fix auth linkage: consolidate duplicate users into the one with the most
 * profiles. Moves authAccounts, sessions, and any stray profiles from
 * secondary users to the primary, then deletes the secondary users.
 */
export const fixAuthLinkage = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalizedEmail = email.trim().toLowerCase();

    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalizedEmail))
      .collect();

    if (users.length <= 1) {
      return { status: "no_duplicates", message: "Only one user record found." };
    }

    // Score each user: the one with the most profiles is the primary
    const scored = await Promise.all(
      users.map(async (u) => {
        const profiles = await ctx.db
          .query("userProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", u._id))
          .collect();
        const authAccounts = await ctx.db
          .query("authAccounts")
          .filter((q) => q.eq(q.field("userId"), u._id))
          .collect();
        return { user: u, profiles, authAccounts, score: profiles.length };
      }),
    );

    // Primary = most profiles; break ties by preferring the one with auth
    scored.sort((a, b) => b.score - a.score || b.authAccounts.length - a.authAccounts.length);
    const primary = scored[0];
    const secondaries = scored.slice(1);

    const actions: string[] = [];

    for (const sec of secondaries) {
      // Move auth accounts
      for (const account of sec.authAccounts) {
        await ctx.db.patch(account._id, { userId: primary.user._id });
        actions.push(
          `Moved authAccount ${account._id} (${account.provider}) → ${primary.user._id}`,
        );
      }

      // Move sessions
      const sessions = await ctx.db
        .query("authSessions")
        .filter((q) => q.eq(q.field("userId"), sec.user._id))
        .collect();
      for (const session of sessions) {
        await ctx.db.patch(session._id, { userId: primary.user._id });
        actions.push(`Moved session ${session._id} → ${primary.user._id}`);
      }

      // Move any profiles that don't already exist on primary
      for (const profile of sec.profiles) {
        const existsOnPrimary = primary.profiles.some((p) => p.tonalUserId === profile.tonalUserId);
        if (existsOnPrimary) {
          await ctx.db.delete(profile._id);
          actions.push(`Deleted duplicate profile ${profile._id} (${profile.tonalUserId})`);
        } else {
          await ctx.db.patch(profile._id, { userId: primary.user._id });
          actions.push(`Moved profile ${profile._id} → ${primary.user._id}`);
        }
      }

      // Refresh tokens reference sessionId (not userId), so they
      // follow automatically since we already moved the sessions.

      // Delete the secondary user
      await ctx.db.delete(sec.user._id);
      actions.push(`Deleted secondary user ${sec.user._id}`);
    }

    return {
      status: "fixed",
      primaryUserId: primary.user._id,
      primaryProfileCount: primary.profiles.length,
      secondariesRemoved: secondaries.length,
      actions,
    };
  },
});

/**
 * Force-reset a password for a given email.
 * This is an internalAction so it can use Scrypt (lucia) for hashing,
 * then calls a mutation to store the new hash in the authAccount.
 *
 * Usage: npx convex run coachAdminAuth:forceResetPassword '{"email":"kirby@kpifit.com","newPassword":"YOUR_NEW_PASSWORD"}' --prod
 */
export const forceResetPassword = internalAction({
  args: { email: v.string(), newPassword: v.string() },
  handler: async (
    ctx,
    { email, newPassword },
  ): Promise<{
    status: string;
    authAccountId: string;
    email: string;
    newHashLength: number;
  }> => {
    const { Scrypt } = await import("lucia");
    const hashedPassword = await new Scrypt().hash(newPassword);

    const result: {
      status: string;
      authAccountId: string;
      email: string;
      newHashLength: number;
    } = await ctx.runMutation(internal.coachAdminAuth.setAuthAccountSecret, {
      email: email.trim().toLowerCase(),
      hashedSecret: hashedPassword,
    });
    return result;
  },
});

/** Internal mutation called by forceResetPassword to write the new hash. */
export const setAuthAccountSecret = internalMutation({
  args: { email: v.string(), hashedSecret: v.string() },
  handler: async (ctx, { email, hashedSecret }) => {
    // Find the auth account by provider + email
    const authAccount = await ctx.db
      .query("authAccounts")
      .filter((q) =>
        q.and(q.eq(q.field("provider"), "password"), q.eq(q.field("providerAccountId"), email)),
      )
      .first();

    if (!authAccount) {
      throw new Error(`No password auth account found for ${email}`);
    }

    await ctx.db.patch(authAccount._id, { secret: hashedSecret });

    return {
      status: "password_reset",
      authAccountId: authAccount._id,
      email,
      newHashLength: hashedSecret.length,
    };
  },
});
