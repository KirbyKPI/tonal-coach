import { internalMutation } from "../_generated/server";

export const normalizeUserEmails = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const patched: string[] = [];
    for (const user of users) {
      if (!user.email) continue;
      const normalized = user.email.trim().toLowerCase();
      if (normalized !== user.email) {
        await ctx.db.patch(user._id, { email: normalized });
        patched.push(`${user._id}: ${user.email} -> ${normalized}`);
      }
    }
    return { patched, total: users.length };
  },
});

export const normalizeAuthAccounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query("authAccounts").collect();
    const patched: string[] = [];
    for (const account of accounts) {
      if (account.provider !== "password") continue;
      const current = account.providerAccountId;
      const normalized = current.trim().toLowerCase();
      if (normalized !== current) {
        await ctx.db.patch(account._id, { providerAccountId: normalized });
        patched.push(`${account._id}: ${current} -> ${normalized}`);
      }
    }
    return { patched, total: accounts.length };
  },
});
