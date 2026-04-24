"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorAlert } from "@/components/ErrorAlert";

type ConnectionPhase = "idle" | "authenticating" | "fetching" | "done" | "coach-setup";

const PHASE_LABELS: Record<Exclude<ConnectionPhase, "idle">, string> = {
  authenticating: "Authenticating with Tonal...",
  fetching: "Pulling your training history...",
  "coach-setup": "Setting up your coach account...",
  done: "Done!",
};

export function ConnectStep({ onComplete }: { readonly onComplete: () => void }) {
  const connectTonal = useAction(api.tonal.connectPublic.connectTonal);
  const skipAsCoach = useAction(api.tonal.connectPublic.skipTonalAsCoach);
  const me = useQuery(api.users.getMe);
  const isCoachEmail = me?.email?.toLowerCase() === "kirby@kpifit.com";
  const [tonalEmail, setTonalEmail] = useState("");
  const [tonalPassword, setTonalPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<ConnectionPhase>("idle");

  const submitting = phase !== "idle";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPhase("authenticating");

    // Brief delay so user sees the phase transition
    const fetchTimer = setTimeout(() => setPhase("fetching"), 1200);

    try {
      await connectTonal({ tonalEmail, tonalPassword });
      clearTimeout(fetchTimer);
      setPhase("done");
      setTimeout(onComplete, 800);
    } catch {
      clearTimeout(fetchTimer);
      setPhase("idle");
      setError(
        "Something went wrong connecting your Tonal account. Please try again or contact support.",
      );
    }
  };

  const handleCoachSkip = async () => {
    setError(null);
    setPhase("coach-setup");
    try {
      await skipAsCoach({});
      setPhase("done");
      setTimeout(onComplete, 800);
    } catch {
      setPhase("idle");
      setError("Something went wrong setting up your coach account. Please try again.");
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Connect Your Tonal</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Link your Tonal account so we can personalize your coaching.
          </p>
        </div>

        {submitting ? (
          <div className="flex flex-col items-center gap-4 py-10">
            {phase === "done" ? (
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 shadow-md shadow-primary/10">
                <Check className="size-6 text-primary" />
              </div>
            ) : (
              <Loader2 className="size-7 animate-spin text-primary" />
            )}
            <p className="text-sm font-medium text-foreground">{PHASE_LABELS[phase]}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tonal-email">Tonal Email</Label>
              <Input
                id="tonal-email"
                type="email"
                value={tonalEmail}
                onChange={(e) => setTonalEmail(e.target.value)}
                placeholder="your-tonal-email@example.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tonal-password">Tonal Password</Label>
              <Input
                id="tonal-password"
                type="password"
                value={tonalPassword}
                onChange={(e) => setTonalPassword(e.target.value)}
                placeholder="Enter your Tonal password"
                required
                autoComplete="off"
              />
            </div>
            {error && <ErrorAlert message={error} />}
            <Button type="submit" className="w-full" size="lg">
              Connect Tonal
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Your password is used only to obtain a token. We never store it.
            </p>

            {isCoachEmail && (
              <>
                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  size="lg"
                  onClick={handleCoachSkip}
                >
                  <ShieldCheck className="size-4" />
                  I&apos;m a coach &mdash; skip Tonal connection
                </Button>
              </>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
