/**
 * Tonal API diagnostic and debugging utilities for the coach system.
 * All internal actions — not callable from the client.
 * Run via: npx convex run coachAdminDebug:<functionName> --prod
 */

import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/** Debug view access for a user by email — check grants and identity matching. */
export const debugViewAccess = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalizedEmail))
      .first();
    if (!user) return { error: `No user found with email ${normalizedEmail}` };
    const grants = await ctx.db
      .query("viewAccess")
      .withIndex("by_viewerUserId", (q) => q.eq("viewerUserId", user._id))
      .collect();
    const grantDetails = await Promise.all(
      grants.map(async (g) => {
        const profile = await ctx.db.get(g.profileId);
        return {
          grantId: g._id,
          profileId: g.profileId,
          profileExists: !!profile,
          profileName: profile?.profileData
            ? `${profile.profileData.firstName} ${profile.profileData.lastName}`
            : (profile?.clientLabel ?? "MISSING"),
        };
      }),
    );
    const allGrants = await ctx.db.query("viewAccess").collect();
    return {
      userId: user._id,
      userEmail: user.email,
      grantCount: grants.length,
      grants: grantDetails,
      totalViewAccessRows: allGrants.length,
      allGrantViewerUserIds: allGrants.map((g) => g.viewerUserId),
    };
  },
});

/** Clear Tonal API cache for a profile and test the raw API response. */
export const debugDashboardData = internalAction({
  args: { profileId: v.id("userProfiles") },
  handler: async (
    ctx,
    { profileId },
  ): Promise<{
    profileName: string;
    tonalUserId: string;
    cacheCleared: number;
    rawActivityCount: number;
    tonalWorkoutCount: number;
    sampleActivities: Array<{
      activityType: string;
      activityTime: string;
      targetArea: string | undefined;
      totalVolume: number | undefined;
      passesFilter: boolean;
    }>;
    error?: string;
  }> => {
    const profile = await ctx.runQuery(internal.tonal.cache.getUserProfile, {
      userId: "n972dghnsr15w024n4rsw2x3rh85e60v" as Id<"users">,
      profileId,
    });
    if (!profile)
      return {
        profileName: "not found",
        tonalUserId: "",
        cacheCleared: 0,
        rawActivityCount: 0,
        tonalWorkoutCount: 0,
        sampleActivities: [],
        error: "Profile not found",
      };

    const name = profile.profileData
      ? `${profile.profileData.firstName} ${profile.profileData.lastName}`
      : (profile.clientLabel ?? "unnamed");

    // 1. Clear all cache entries for this user's Tonal data
    const cacheTypes = [
      `workoutHistory:${profile.tonalUserId}:20`,
      `workoutHistory:${profile.tonalUserId}:50`,
      `muscleReadiness:${profile.tonalUserId}`,
      `strengthScores:${profile.tonalUserId}`,
      `strengthDistribution:${profile.tonalUserId}`,
    ];
    await ctx.runMutation(internal.tonal.cache.deleteUserCacheEntries, {
      userId: profile.userId,
      dataTypes: cacheTypes,
    });

    // 2. Fetch fresh workout history from Tonal API
    try {
      const activities: Array<{
        activityType: string;
        activityTime: string;
        workoutPreview?: {
          targetArea?: string;
          totalVolume?: number;
        };
      }> = await ctx.runAction(internal.tonal.proxy.fetchWorkoutHistory, {
        userId: profile.userId,
        profileId,
        limit: 20,
      });

      const tonalWorkouts = activities.filter((a) => {
        const wp = a.workoutPreview;
        if (!wp) return false;
        return a.activityType !== "External" && (wp.totalVolume ?? 0) > 0;
      });

      return {
        profileName: name,
        tonalUserId: profile.tonalUserId,
        cacheCleared: cacheTypes.length,
        rawActivityCount: activities.length,
        tonalWorkoutCount: tonalWorkouts.length,
        sampleActivities: activities.slice(0, 5).map((a) => ({
          activityType: a.activityType,
          activityTime: a.activityTime,
          targetArea: a.workoutPreview?.targetArea,
          totalVolume: a.workoutPreview?.totalVolume,
          passesFilter:
            a.activityType !== "External" &&
            !!a.workoutPreview &&
            (a.workoutPreview.totalVolume ?? 0) > 0,
        })),
      };
    } catch (err) {
      return {
        profileName: name,
        tonalUserId: profile.tonalUserId,
        cacheCleared: cacheTypes.length,
        rawActivityCount: 0,
        tonalWorkoutCount: 0,
        sampleActivities: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

/** Verify a profile's Tonal identity (also tests Kirby's profile as control). */
export const verifyTonalIdentity = internalAction({
  args: { profileId: v.id("userProfiles") },
  handler: async (
    ctx,
    { profileId },
  ): Promise<{
    target: {
      profileName: string;
      storedTonalUserId: string;
      apiProfile: Record<string, unknown> | null;
      apiError?: string;
      activityCount: number;
    };
    control: {
      profileName: string;
      storedTonalUserId: string;
      activityCount: number;
      apiError?: string;
    };
  }> => {
    const userId = "n972dghnsr15w024n4rsw2x3rh85e60v" as Id<"users">;

    // Target profile (Adam)
    const targetResult = await fetchProfileData(ctx, userId, profileId);

    // Control profile (Kirby — first non-coach profile)
    const kirbyProfileId = "n57b03p6yfbh8ap056731qt24n8564vg" as Id<"userProfiles">;
    const controlResult = await fetchProfileData(ctx, userId, kirbyProfileId);

    return { target: targetResult, control: controlResult };
  },
});

async function fetchProfileData(
  ctx: ActionCtx,
  userId: Id<"users">,
  profileId: Id<"userProfiles">,
): Promise<{
  profileName: string;
  storedTonalUserId: string;
  apiProfile: Record<string, unknown> | null;
  apiError?: string;
  activityCount: number;
}> {
  const profile = await ctx.runQuery(internal.tonal.cache.getUserProfile, {
    userId,
    profileId,
  });
  if (!profile)
    return {
      profileName: "not found",
      storedTonalUserId: "",
      apiProfile: null,
      activityCount: 0,
      apiError: "Profile not found",
    };

  const name = profile.profileData
    ? `${profile.profileData.firstName} ${profile.profileData.lastName}`
    : (profile.clientLabel ?? "unnamed");

  try {
    // Fetch the Tonal user profile to verify identity
    const apiProfile: Record<string, unknown> = await ctx.runAction(
      internal.tonal.proxy.fetchUserProfile,
      { userId, profileId },
    );

    // Fetch activities count
    let activityCount = 0;
    try {
      const activities: unknown[] = await ctx.runAction(internal.tonal.proxy.fetchWorkoutHistory, {
        userId,
        profileId,
        limit: 50,
      });
      activityCount = activities.length;
    } catch {
      // ignore
    }

    return {
      profileName: name,
      storedTonalUserId: profile.tonalUserId,
      apiProfile,
      activityCount,
    };
  } catch (err) {
    return {
      profileName: name,
      storedTonalUserId: profile.tonalUserId,
      apiProfile: null,
      activityCount: 0,
      apiError: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Raw Tonal API probe — tests multiple endpoints to find which return data. */
export const rawTonalApiTest = internalAction({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, { profileId }): Promise<Record<string, unknown>> => {
    const { decrypt: dec } = await import("./tonal/encryption");
    const userId = "n972dghnsr15w024n4rsw2x3rh85e60v" as Id<"users">;

    const profile = await ctx.runQuery(internal.tonal.cache.getUserProfile, {
      userId,
      profileId,
    });
    if (!profile) throw new Error("Profile not found");

    const name = profile.profileData
      ? `${profile.profileData.firstName} ${profile.profileData.lastName}`
      : "unnamed";

    const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
    if (!keyHex) throw new Error("No TOKEN_ENCRYPTION_KEY");
    const token = await dec(profile.tonalToken, keyHex);
    const tid = profile.tonalUserId;

    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    async function probe(url: string): Promise<{
      status: number;
      isArray: boolean;
      length: number | string;
      topKeys: string[];
      preview: string;
    }> {
      try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
        if (res.status === 204)
          return { status: 204, isArray: false, length: 0, topKeys: [], preview: "(no content)" };
        const body = await res.json();
        const isArr = Array.isArray(body);
        return {
          status: res.status,
          isArray: isArr,
          length: isArr
            ? body.length
            : typeof body === "object" && body !== null
              ? Object.keys(body).length
              : "N/A",
          topKeys: typeof body === "object" && body !== null ? Object.keys(body).slice(0, 15) : [],
          preview: JSON.stringify(body).slice(0, 500),
        };
      } catch (err: unknown) {
        return {
          status: -1,
          isArray: false,
          length: 0,
          topKeys: [],
          preview: err instanceof Error ? err.message : String(err),
        };
      }
    }

    const base = `https://api.tonal.com/v6/users/${tid}`;
    const results = await Promise.all([
      probe(`${base}/activities?limit=5`),
      probe(`${base}/activities?limit=50`),
      probe(`${base}/activities`),
      probe(`${base}/workout-activities`),
      probe(`${base}/strength-scores`),
      probe(`${base}/strength-scores/current`),
      probe(`${base}/strength-scores/history?limit=10`),
      probe(`${base}/muscle-readiness/current`),
      probe(`${base}/external-activities?limit=5`),
    ]);

    const labels = [
      "activities?limit=5",
      "activities?limit=50",
      "activities (no limit)",
      "workout-activities",
      "strength-scores",
      "strength-scores/current",
      "strength-scores/history?limit=10",
      "muscle-readiness/current",
      "external-activities?limit=5",
    ];

    const endpoints: Record<string, unknown> = {};
    for (let i = 0; i < labels.length; i++) {
      endpoints[labels[i]] = results[i];
    }

    return {
      profileName: name,
      tonalUserId: tid,
      endpoints,
    };
  },
});

/** Manually refresh the Tonal token for a specific client profile. */
export const refreshProfileToken = internalAction({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, { profileId }): Promise<Record<string, unknown>> => {
    const { decrypt: dec, encrypt: enc } = await import("./tonal/encryption");
    const { refreshTonalToken } = await import("./tonal/auth");
    const userId = "n972dghnsr15w024n4rsw2x3rh85e60v" as Id<"users">;

    const profile = await ctx.runQuery(internal.tonal.cache.getUserProfile, {
      userId,
      profileId,
    });
    if (!profile) return { error: "Profile not found" };

    const name = (profile as Record<string, unknown>).name ?? "unknown";
    const refreshToken = (profile as Record<string, unknown>).tonalRefreshToken as
      | string
      | undefined;
    if (!refreshToken) return { error: "No refresh token stored", profileName: name };

    const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
    if (!keyHex) return { error: "TOKEN_ENCRYPTION_KEY not set" };

    try {
      const decryptedRefresh = await dec(refreshToken, keyHex);
      const result = await refreshTonalToken(decryptedRefresh);

      const encryptedToken = await enc(result.idToken, keyHex);
      const encryptedNewRefresh = result.refreshToken
        ? await enc(result.refreshToken, keyHex)
        : undefined;

      await ctx.runMutation(internal.userProfiles.updateTonalToken, {
        userId,
        profileId,
        tonalToken: encryptedToken,
        tonalRefreshToken: encryptedNewRefresh,
        tonalTokenExpiresAt: result.expiresAt,
      });

      return {
        status: "refreshed",
        profileName: name,
        expiresAt: new Date(result.expiresAt).toISOString(),
      };
    } catch (err) {
      return {
        error: `Refresh failed: ${err instanceof Error ? err.message : String(err)}`,
        profileName: name,
      };
    }
  },
});
