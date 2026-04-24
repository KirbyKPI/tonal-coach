import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";

export const connectTonal = action({
  args: {
    tonalEmail: v.string(),
    tonalPassword: v.string(),
    /** When connecting a specific client profile, pass its ID to patch instead of upsert. */
    profileId: v.optional(v.id("userProfiles")),
  },
  handler: async (
    ctx,
    { tonalEmail, tonalPassword, profileId },
  ): Promise<{ success: boolean; tonalUserId: string }> => {
    const userId = await ctx.runQuery(internal.lib.auth.resolveEffectiveUserId, {});
    if (!userId) throw new Error("Not authenticated");

    return await ctx.runAction(internal.tonal.connect.connectTonal, {
      userId,
      tonalEmail,
      tonalPassword,
      profileId,
    });
  },
});

/** Create a coach-only account that skips the Tonal connection entirely. */
export const skipTonalAsCoach = action({
  args: {},
  handler: async (ctx): Promise<{ success: boolean }> => {
    const userId = await ctx.runQuery(internal.lib.auth.resolveEffectiveUserId, {});
    if (!userId) throw new Error("Not authenticated");

    await ctx.runMutation(internal.userProfiles.createCoachStub, { userId });

    return { success: true };
  },
});
