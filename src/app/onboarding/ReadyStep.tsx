"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  Dumbbell,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
  Users,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const CHAT_PROMPT_ACTIVATION = "I just finished setting up. What do you see in my training data?";

export function ReadyStep({
  firstName,
  isCoach,
}: {
  readonly firstName: string | undefined;
  readonly isCoach?: boolean;
}) {
  const displayName = firstName ?? "there";

  if (isCoach) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="mb-8 text-center">
            <div
              className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl shadow-lg shadow-primary/15"
              style={{
                background: "linear-gradient(135deg, oklch(0.80 0.20 142), oklch(0.65 0.15 85))",
              }}
            >
              <ShieldCheck className="size-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Coach account ready!
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              You can now add and manage your clients from the coach dashboard.
            </p>
          </div>

          <ul className="mb-8 space-y-3.5 text-sm text-muted-foreground">
            <li className="flex items-start gap-3 rounded-lg bg-primary/5 px-3 py-2.5 ring-1 ring-primary/10">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              Add clients by connecting their Tonal accounts
            </li>
            <li className="flex items-start gap-3 rounded-lg bg-primary/5 px-3 py-2.5 ring-1 ring-primary/10">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              Program AI-powered workouts for each client
            </li>
            <li className="flex items-start gap-3 rounded-lg bg-primary/5 px-3 py-2.5 ring-1 ring-primary/10">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              Monitor strength trends and training progress
            </li>
          </ul>

          <Link
            href="/coach"
            className={cn(buttonVariants({ size: "lg" }), "w-full justify-center")}
          >
            <Users className="size-4" />
            Go to Coach Dashboard
            <ArrowRight className="size-4" />
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl shadow-lg shadow-primary/15"
            style={{
              background: "linear-gradient(135deg, oklch(0.80 0.20 142), oklch(0.65 0.15 85))",
            }}
          >
            <Dumbbell className="size-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            You&apos;re all set, {displayName}!
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Your coach is ready. Here&apos;s what you can do:
          </p>
        </div>

        <ul className="mb-8 space-y-3.5 text-sm text-muted-foreground">
          <li className="flex items-start gap-3 rounded-lg bg-primary/5 px-3 py-2.5 ring-1 ring-primary/10">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            Get AI-programmed workouts tailored to your goals
          </li>
          <li className="flex items-start gap-3 rounded-lg bg-primary/5 px-3 py-2.5 ring-1 ring-primary/10">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            Track strength trends and muscle readiness
          </li>
          <li className="flex items-start gap-3 rounded-lg bg-primary/5 px-3 py-2.5 ring-1 ring-primary/10">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            Ask anything about your training data
          </li>
        </ul>

        <div className="flex flex-col gap-3">
          <Link
            href={`/chat?prompt=${encodeURIComponent(CHAT_PROMPT_ACTIVATION)}`}
            className={cn(buttonVariants({ size: "lg" }), "w-full justify-center")}
          >
            <MessageSquare className="size-4" />
            Start chatting
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "w-full justify-center",
            )}
          >
            <LayoutDashboard className="size-4" />
            Explore dashboard
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
