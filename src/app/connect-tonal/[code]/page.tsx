"use client";

/**
 * /connect-tonal/[code]
 * ────────────────────────────────────────────────────────────────────────────
 * Public landing page for an invite link. The client opens this on their own
 * device, sees the client label the coach attached (so they know it's for
 * them), types their Tonal email + password, and the token gets attached
 * to the right profile. The coach is never in the password's path.
 *
 * Three states:
 *   - loading: looking up the invite
 *   - invalid: invite expired / revoked / not found (don't leak which)
 *   - form: ready for the client to enter credentials
 *   - success: token attached, client can close the tab
 */

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorAlert } from "@/components/ErrorAlert";
import { CheckCircle2, Link as LinkIcon, Loader2 } from "lucide-react";

export default function InvitePage() {
  const params = useParams<{ code: string }>();
  const code = (params?.code ?? "").toString();

  const invite = useQuery(api.tonalInvites.lookupInvite, { code });
  const redeem = useAction(api.tonalInvites.redeemInvite);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await redeem({
        code,
        tonalEmail: email.trim().toLowerCase(),
        tonalPassword: password,
      });
      if (res.success) {
        setSuccess(true);
      } else {
        setError(res.reason);
      }
    } catch (err) {
      setError(
        (err as Error)?.message ?? "Something went wrong — please try again or contact your coach.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Loading the invite ─────────────────────────────────────────────
  if (invite === undefined) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Checking your invite…
        </div>
      </Shell>
    );
  }

  // ─── Invalid invite (expired/revoked/wrong code) ────────────────────
  if (invite === null) {
    return (
      <Shell>
        <div className="space-y-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-destructive/10">
            <LinkIcon className="size-6 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold">This link is no longer valid</h1>
          <p className="text-sm text-muted-foreground">
            The invite may have expired, been revoked, or the link was typed wrong. Reach out to
            your coach for a fresh one.
          </p>
          <Link
            href="/"
            className="inline-block text-sm font-medium text-primary underline decoration-primary/40 underline-offset-4 transition-colors duration-300 hover:decoration-primary"
          >
            Back to home
          </Link>
        </div>
      </Shell>
    );
  }

  // ─── Success — token attached ───────────────────────────────────────
  if (success) {
    return (
      <Shell>
        <div className="space-y-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-green-500/10">
            <CheckCircle2 className="size-6 text-green-500" />
          </div>
          <h1 className="text-xl font-semibold">You&apos;re connected!</h1>
          <p className="text-sm text-muted-foreground">
            Your Tonal account is linked to your coach&apos;s dashboard. You can close this tab — no
            further action needed on your end.
          </p>
        </div>
      </Shell>
    );
  }

  // ─── Form ───────────────────────────────────────────────────────────
  return (
    <Shell>
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">
            Connect Tonal for {invite.clientLabel}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your coach asked you to link your Tonal account so they can see your training data. We
            only use your password once to mint an access token — we don&apos;t store the password
            itself.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tonal-email" className="text-sm font-medium">
              Tonal email
            </Label>
            <Input
              id="tonal-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              disabled={submitting}
              className="h-11 rounded-xl px-4 text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tonal-password" className="text-sm font-medium">
              Tonal password
            </Label>
            <Input
              id="tonal-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your Tonal app password"
              required
              autoComplete="current-password"
              disabled={submitting}
              className="h-11 rounded-xl px-4 text-base"
            />
          </div>

          {error && <ErrorAlert message={error} />}

          <Button
            type="submit"
            className="h-11 w-full text-base shadow-lg shadow-primary/25 transition-all duration-300 hover:shadow-xl hover:shadow-primary/40"
            size="lg"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-5 animate-spin" />
                Connecting…
              </>
            ) : (
              "Connect my Tonal"
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Your password is sent securely and used only to get an authentication token from Tonal.
            We never store your password.
          </p>
        </form>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className="h-[500px] w-[500px] rounded-full blur-[120px] sm:h-[600px] sm:w-[600px]"
          style={{
            background:
              "conic-gradient(from 0deg, oklch(0.82 0.24 145), oklch(0.90 0.08 150), oklch(0.92 0.05 150), oklch(0.82 0.24 145))",
            opacity: 0.5,
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <Link
          href="/"
          className="mb-10 block text-center text-2xl font-bold tracking-tight"
          style={{
            background: "linear-gradient(135deg, oklch(0.82 0.24 145), oklch(0.92 0.05 150))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          KPI·FIT Tonal Coach
        </Link>

        <div
          className="rounded-2xl p-px"
          style={{
            background:
              "linear-gradient(135deg, oklch(1 0 0 / 12%), oklch(0.82 0.24 145 / 20%), oklch(1 0 0 / 8%))",
          }}
        >
          <div className="rounded-2xl bg-card/80 px-8 py-8 backdrop-blur-xl">{children}</div>
        </div>
      </div>
    </div>
  );
}
