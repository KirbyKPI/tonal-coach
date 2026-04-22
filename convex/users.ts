import { query } from "./_generated/server";
import { getEffectiveUserId } from "./lib/auth";

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getEffectiveUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);

    // Multi-client: use the active profile if set, otherwise fall back to first
    let profile = null;
    if (user?.activeClientProfileId) {
      const active = await ctx.db.get(user.activeClientProfileId);
      if (active && active.userId === userId) profile = active;
    }
    if (!profile) {
      profile = await ctx.db
        .query("userProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
    }

    const tonalTokenExpired =
      !!profile &&
      typeof profile.tonalTokenExpiresAt === "number" &&
      profile.tonalTokenExpiresAt < Date.now();

    // Check if user has multiple profiles (coach mode)
    const allProfiles = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    return {
      userId,
      email: user?.email as string | undefined,
      hasTonalProfile: !!profile,
      onboardingCompleted: !!profile?.onboardingData?.completedAt,
      tonalName: profile?.profileData
        ? `${profile.profileData.firstName} ${profile.profileData.lastName}`
        : (profile?.clientLabel ?? undefined),
      tonalEmail: profile?.tonalEmail,
      tonalTokenExpired,
      syncStatus: profile?.syncStatus,
      isMultiClient: allProfiles.length > 1,
      activeProfileId: profile?._id,
    };
  },
});
