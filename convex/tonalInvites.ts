/**
 * tonalInvites
 * ────────────────────────────────────────────────────────────────────────────
 * Shareable invite links so a coach can ask a client to connect their own
 * Tonal account WITHOUT the coach ever seeing or storing the client's
 * password. Replaces the old "coach types client's password" flow which
 * went stale every time a client rotated their Tonal password.
 *
 * Flow:
 *   1. Coach calls `createInvite({ profileId })` from the dashboard — gets
 *      back a `code` that fits in a URL.
 *   2. Coach shares https://tonal.kpifit.com/connect-tonal/<code> with the
 *      client via text/email/whatever.
 *   3. Client opens the link, sees their own name on the page, types their
 *      Tonal email + password. Public action `redeemInvite` validates the
 *      code (not expired, not revoked) and runs the existing internal
 *      `connectTonal` action with the embedded `clientProfileId`.
 *   4. Invite stays reusable until expiry, so a typo on first attempt is
 *      survivable. Each successful redemption updates `usedAt` for audit.
 *
 * Coach also gets `revokeInvite({ inviteId })` for the case where a link
 * leaks or the client never used it before swapping plans.
 */

import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getEffectiveUserId } from "./lib/auth";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** ~10-char base32-ish code: enough entropy (~50 bits) for share links
 *  while staying short enough to read over the phone if it ever came to it. */
function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L confusion
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

// ─── Coach-side: create the invite ──────────────────────────────────────────

export const createInvite = mutation({
  args: {
    /** The pre-existing stub profile the connected token will attach to. */
    clientProfileId: v.id("userProfiles"),
  },
  handler: async (ctx, { clientProfileId }) => {
    const coachUserId = await getEffectiveUserId(ctx);
    if (!coachUserId) throw new Error("Not authenticated");

    // Confirm the profile actually belongs to this coach. Without this a
    // coach with any logged-in session could mint invites for another
    // coach's clients.
    const profile = await ctx.db.get(clientProfileId);
    if (!profile) throw new Error("Profile not found");
    if (profile.userId !== coachUserId) {
      throw new Error("That profile is not owned by you");
    }

    // Best-effort collision dodge — try a few times. With 10 chars from a
    // 32-symbol alphabet, ~50 bits of entropy, real collisions are vanishing.
    let code = generateCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await ctx.db
        .query("tonalConnectInvites")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (!existing) break;
      code = generateCode();
    }

    const clientLabel =
      profile.clientLabel?.trim() ||
      (profile.profileData
        ? `${profile.profileData.firstName} ${profile.profileData.lastName}`.trim()
        : "your client");

    const now = Date.now();
    const id = await ctx.db.insert("tonalConnectInvites", {
      code,
      coachUserId,
      clientProfileId,
      clientLabel,
      createdAt: now,
      expiresAt: now + INVITE_TTL_MS,
    });

    return { inviteId: id, code, expiresAt: now + INVITE_TTL_MS };
  },
});

// ─── Coach-side: list a profile's outstanding invites ──────────────────────

export const listInvitesForProfile = query({
  args: { clientProfileId: v.id("userProfiles") },
  handler: async (ctx, { clientProfileId }) => {
    const coachUserId = await getEffectiveUserId(ctx);
    if (!coachUserId) return [];

    const profile = await ctx.db.get(clientProfileId);
    if (!profile || profile.userId !== coachUserId) return [];

    const invites = await ctx.db
      .query("tonalConnectInvites")
      .withIndex("by_clientProfileId", (q) => q.eq("clientProfileId", clientProfileId))
      .order("desc")
      .take(10);

    return invites.map((i) => ({
      _id: i._id,
      code: i.code,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      usedAt: i.usedAt ?? null,
      revokedAt: i.revokedAt ?? null,
      status: deriveStatus(i),
    }));
  },
});

function deriveStatus(invite: {
  expiresAt: number;
  usedAt?: number;
  revokedAt?: number;
}): "active" | "used" | "expired" | "revoked" {
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt < Date.now()) return "expired";
  if (invite.usedAt) return "used"; // still re-usable; "used" just means at least one success
  return "active";
}

// ─── Coach-side: revoke before expiry ──────────────────────────────────────

export const revokeInvite = mutation({
  args: { inviteId: v.id("tonalConnectInvites") },
  handler: async (ctx, { inviteId }) => {
    const coachUserId = await getEffectiveUserId(ctx);
    if (!coachUserId) throw new Error("Not authenticated");

    const invite = await ctx.db.get(inviteId);
    if (!invite) throw new Error("Invite not found");
    if (invite.coachUserId !== coachUserId) {
      throw new Error("Not your invite");
    }
    if (invite.revokedAt) return { alreadyRevoked: true };

    await ctx.db.patch(inviteId, { revokedAt: Date.now() });
    return { revoked: true };
  },
});

// ─── Client-side public: validate code for the public page ─────────────────

/**
 * Look up the invite for the connect-tonal/<code> public page so it can
 * show the right client name + verify the link before the client types
 * their password. Returns null for expired/revoked/missing codes so the
 * UI shows a "link no longer valid" state without leaking why.
 */
export const lookupInvite = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalizedCode = code.trim().toUpperCase();
    const invite = await ctx.db
      .query("tonalConnectInvites")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .first();
    if (!invite) return null;

    const status = deriveStatus(invite);
    if (status === "expired" || status === "revoked") return null;

    return {
      code: invite.code,
      clientLabel: invite.clientLabel,
      expiresAt: invite.expiresAt,
      reusable: true,
    };
  },
});

// ─── Client-side public: redeem ────────────────────────────────────────────

/**
 * Public action — no auth required. The client opens the link on their
 * own device, types their Tonal credentials, and we attach the resulting
 * token to the invite's `clientProfileId`. The coach is never in the
 * password's path.
 */
export const redeemInvite = action({
  args: {
    code: v.string(),
    tonalEmail: v.string(),
    tonalPassword: v.string(),
  },
  handler: async (
    ctx,
    { code, tonalEmail, tonalPassword },
  ): Promise<{ success: true; tonalUserId: string } | { success: false; reason: string }> => {
    const normalizedCode = code.trim().toUpperCase();

    // We need a runQuery to fetch the invite from inside an action.
    const invite = await ctx.runQuery(internal.tonalInvites.getInviteByCodeInternal, {
      code: normalizedCode,
    });
    if (!invite) {
      return { success: false, reason: "This link is no longer valid." };
    }

    // Call the existing internal connect flow with the coach's userId so
    // the resulting profile is attached to the coach, and `profileId` so
    // it patches the existing client stub instead of creating a new row.
    let result: { success: boolean; tonalUserId: string };
    try {
      result = await ctx.runAction(internal.tonal.connect.connectTonal, {
        userId: invite.coachUserId,
        tonalEmail: tonalEmail.trim().toLowerCase(),
        tonalPassword,
        profileId: invite.clientProfileId,
      });
    } catch (err) {
      // Distinguish "wrong password" (expected, user can retry) from other
      // errors. The Auth0 helper throws with that exact text.
      const msg = (err as Error)?.message ?? "Tonal connection failed";
      if (msg.toLowerCase().includes("wrong email or password")) {
        return { success: false, reason: "Wrong Tonal email or password — try again." };
      }
      return { success: false, reason: msg };
    }

    // Mark the invite as used. Reusable links don't get consumed — we just
    // stamp the timestamp for audit.
    await ctx.runMutation(internal.tonalInvites.stampInviteUsedInternal, {
      inviteId: invite._id,
    });

    return { success: true, tonalUserId: result.tonalUserId };
  },
});

// ─── Internal helpers used by the redeem action ────────────────────────────

export const getInviteByCodeInternal = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const invite = await ctx.db
      .query("tonalConnectInvites")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!invite) return null;
    if (deriveStatus(invite) !== "active" && deriveStatus(invite) !== "used") return null;
    return invite;
  },
});

export const stampInviteUsedInternal = internalMutation({
  args: { inviteId: v.id("tonalConnectInvites") },
  handler: async (ctx, { inviteId }) => {
    await ctx.db.patch(inviteId, { usedAt: Date.now() });
  },
});
