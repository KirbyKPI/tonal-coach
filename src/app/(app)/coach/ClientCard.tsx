"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { AlertCircle, Check, LayoutDashboard, Link2, Pencil, Wifi, WifiOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export interface ClientOverview {
  profileId: Id<"userProfiles">;
  isActive: boolean;
  clientLabel: string;
  tonalUsername: string | null;
  firstName: string | null;
  lastName: string | null;
  level: string | null;
  lastActiveAt: number;
  currentBlockType: string | null;
  currentBlockLabel: string | null;
  currentBlockWeek: number | null;
  currentPlanStatus: string | null;
  lastWorkoutDate: string | null;
  lastWorkoutName: string | null;
  strengthScore: number | null;
  checkInAlerts: number;
  hasConnectedTonal: boolean;
  /** True for the coach's own profile. Coach profiles are not renameable. */
  isCoachAccount?: boolean;
}

/**
 * Display name shown on the card. Prefers the coach-entered clientLabel;
 * falls back to the Tonal profile name when no label has been set.
 */
export function displayNameFor(client: ClientOverview): string {
  if (client.clientLabel) return client.clientLabel;
  const tonalName = [client.firstName, client.lastName].filter(Boolean).join(" ");
  return tonalName || "Unnamed";
}

function initialsFor(client: ClientOverview): string {
  const fromName = [client.firstName, client.lastName]
    .filter(Boolean)
    .map((n) => n!.charAt(0))
    .join("")
    .toUpperCase();
  if (fromName) return fromName;

  const tokens = client.clientLabel.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "?";
  if (tokens.length === 1) return tokens[0].charAt(0).toUpperCase();
  return (tokens[0].charAt(0) + tokens[1].charAt(0)).toUpperCase();
}

function syncAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ClientCard({
  client,
  onSwitch,
}: {
  client: ClientOverview;
  onSwitch: (id: Id<"userProfiles">) => void;
}) {
  const renameProfile = useMutation(api.clientProfiles.renameClientProfile);
  const createInvite = useMutation(api.tonalInvites.createInvite);
  const displayName = displayNameFor(client);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(client.clientLabel);
  const [saving, setSaving] = useState(false);
  const [inviteState, setInviteState] = useState<
    | { kind: "idle" }
    | { kind: "creating" }
    | { kind: "copied"; url: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleShareInvite = async () => {
    setInviteState({ kind: "creating" });
    try {
      const { code } = await createInvite({ clientProfileId: client.profileId });
      const url = `${window.location.origin}/connect-tonal/${code}`;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // Clipboard may be unavailable in some browsers — still surface the URL.
      }
      setInviteState({ kind: "copied", url });
      // Reset the chip back to idle after a few seconds so the coach can
      // generate another invite if needed.
      setTimeout(() => {
        setInviteState((s) => (s.kind === "copied" ? { kind: "idle" } : s));
      }, 5000);
    } catch (err) {
      setInviteState({
        kind: "error",
        message: (err as Error)?.message ?? "Could not create invite",
      });
    }
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Keep draft in sync if the underlying label changes (eg. another device renamed it)
  useEffect(() => {
    if (!editing) setDraft(client.clientLabel);
  }, [client.clientLabel, editing]);

  // Coach can always rename client profiles (clientLabel overrides Tonal name).
  const canRename = !client.isCoachAccount;

  const commitRename = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === client.clientLabel) {
      setEditing(false);
      setDraft(client.clientLabel);
      return;
    }
    try {
      setSaving(true);
      await renameProfile({ profileId: client.profileId, clientLabel: trimmed });
      setEditing(false);
    } catch (err) {
      console.error("Failed to rename client profile", err);
      // Leave the editor open so the user can correct
    } finally {
      setSaving(false);
    }
  };

  const cancelRename = () => {
    setDraft(client.clientLabel);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "rounded-xl border p-5 bg-card transition-all duration-200",
        client.isActive
          ? "border-primary/40 ring-1 ring-primary/20"
          : "border-border hover:border-border/80",
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary shrink-0">
            {initialsFor(client)}
          </div>
          <div className="min-w-0 flex-1">
            {editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void commitRename();
                }}
                className="flex items-center gap-1"
              >
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") cancelRename();
                  }}
                  disabled={saving}
                  maxLength={64}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Save"
                >
                  <Check className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={cancelRename}
                  disabled={saving}
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Cancel"
                >
                  <X className="size-3.5" />
                </button>
              </form>
            ) : (
              <div className="group flex items-center gap-1.5">
                <h3 className="font-semibold text-foreground truncate">{displayName}</h3>
                {canRename && (
                  <button
                    onClick={() => setEditing(true)}
                    className="hidden group-hover:flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
                    title="Rename client"
                    aria-label={`Rename ${displayName}`}
                  >
                    <Pencil className="size-3" />
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              {client.hasConnectedTonal ? (
                <Wifi className="size-3.5 text-green-500" />
              ) : (
                <WifiOff className="size-3.5 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {client.hasConnectedTonal ? "Tonal connected" : "Not connected"}
              </span>
              {client.level && (
                <span className="text-xs text-muted-foreground/60">· {client.level}</span>
              )}
              {client.hasConnectedTonal && (
                <span className="text-xs text-muted-foreground/60">
                  · Synced {syncAgo(client.lastActiveAt)}
                </span>
              )}
            </div>
          </div>
        </div>

        {client.checkInAlerts > 0 && (
          <div className="flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-500 border border-orange-500/20 shrink-0">
            <AlertCircle className="size-3" />
            {client.checkInAlerts} alert{client.checkInAlerts > 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-4 space-y-2">
        {!client.hasConnectedTonal ? (
          <>
            <Link
              href={`/connect-tonal?profileId=${client.profileId}`}
              className="block rounded-lg bg-primary py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors duration-150"
            >
              Connect Tonal
            </Link>
            <InviteShareControl
              state={inviteState}
              onShare={handleShareInvite}
              variant="primary-secondary"
            />
          </>
        ) : (
          <>
            <button
              onClick={() => onSwitch(client.profileId)}
              className={cn(
                "w-full rounded-lg py-2 text-sm font-medium transition-colors duration-150",
                client.isActive
                  ? "bg-primary/10 text-primary cursor-default"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
              disabled={client.isActive}
            >
              {client.isActive ? "Active" : "Switch to"}
            </button>

            <div className="flex gap-2">
              <Link
                href="/dashboard"
                onClick={() => !client.isActive && onSwitch(client.profileId)}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-muted px-2 py-2 text-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors duration-150"
              >
                <LayoutDashboard className="size-3.5 shrink-0" />
                Dashboard
              </Link>

              <Link
                href="/chat"
                onClick={() => !client.isActive && onSwitch(client.profileId)}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-muted px-2 py-2 text-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors duration-150"
              >
                Chat
              </Link>

              <Link
                href="/schedule"
                onClick={() => !client.isActive && onSwitch(client.profileId)}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-muted px-2 py-2 text-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors duration-150"
              >
                Schedule
              </Link>
            </div>

            {/* Even on connected clients, a reshare option is useful when
                the stored Tonal token expires and they need to reconnect. */}
            <InviteShareControl
              state={inviteState}
              onShare={handleShareInvite}
              variant="reconnect"
            />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Invite-link share button (used in both connected + unconnected states) ──

function InviteShareControl({
  state,
  onShare,
  variant,
}: {
  state:
    | { kind: "idle" }
    | { kind: "creating" }
    | { kind: "copied"; url: string }
    | { kind: "error"; message: string };
  onShare: () => void;
  variant: "primary-secondary" | "reconnect";
}) {
  if (state.kind === "copied") {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 text-primary">
          <Check className="size-3.5" />
          Invite link copied
        </div>
        <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{state.url}</div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Send to the client — link is valid for 7 days, reusable until then.
        </p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        {state.message}
        <button
          type="button"
          onClick={onShare}
          className="ml-2 underline decoration-destructive/40 underline-offset-2 hover:decoration-destructive"
        >
          Try again
        </button>
      </div>
    );
  }

  const label =
    variant === "primary-secondary"
      ? state.kind === "creating"
        ? "Generating invite…"
        : "Share invite link instead"
      : state.kind === "creating"
        ? "Generating reconnect link…"
        : "Share reconnect link";

  return (
    <button
      type="button"
      onClick={onShare}
      disabled={state.kind === "creating"}
      className="flex w-full items-center justify-center gap-1 rounded-lg border border-muted-foreground/20 bg-transparent px-2 py-2 text-xs text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground transition-colors duration-150 disabled:opacity-60"
    >
      <Link2 className="size-3.5 shrink-0" />
      {label}
    </button>
  );
}
