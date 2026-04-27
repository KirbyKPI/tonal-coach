import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ResendOTP } from "./ResendOTP";
import { rateLimiter } from "./rateLimits";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Password({
      reset: ResendOTP(),
      // Normalize email to lowercase on every auth flow (signUp, signIn,
      // reset, reset-verification) so that case variations can never
      // create duplicate accounts or fail to find existing ones.
      profile(params) {
        const raw = params.email as string | undefined;
        if (!raw) throw new Error("Email is required");
        const email = raw.trim().toLowerCase();
        return { email };
      },
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      // Blunt abuse deterrent. Only run on actual account creation, not on
      // updates to an existing user. If the global bucket is empty, the
      // caller sees a clear rate-limit error and the auth library rolls
      // back the half-created auth account (which is why we throw before
      // inserting the users row).
      if (args.existingUserId === null) {
        await rateLimiter.limit(ctx, "newSignup", { throws: true });
      }

      const normalizedEmail = args.profile.email
        ? args.profile.email.trim().toLowerCase()
        : undefined;

      const userId = await ctx.db.insert("users", {
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        ...(args.profile.name ? { name: args.profile.name as string } : {}),
      });
      return userId;
    },
  },
});
