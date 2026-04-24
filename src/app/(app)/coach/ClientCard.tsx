"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import {
  AlertCircle,
  Check,
  ChevronRight,
  LayoutDashboard,
  Pencil,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
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
 * Display name shown on the card. Prefers the Tonal profile's real first +
 * last name; falls back to the coach-entered clientLabel when Tonal hasn't
 * filled in profile data yet.
 */
export function displayNameFor(client: ClientOverview): string {
  const tonalName = [client.firstName, client.lastName].filter(Boolean).join(" ");
  return tonalName || client.clientLabel;
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
  const displayName = displayNameFor(client);
  const hasTonalName = !!(client.firstName || client.lastName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(client.clientLabel);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Rename only makes sense before Tonal connects — once it does, the card
  // shows the Tonal profile name and any clientLabel value is ignored.
  const canRename = !client.isCoachAccount && !hasTonalName;

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
      <div className="mt-4 flex gap-2">
        {!client.hasConnectedTonal ? (
          <Link
            href={`/connect-tonal?profileId=${client.profileId}`}
            className="flex-1 rounded-lg bg-primary py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors duration-150"
          >
            Connect Tonal
          </Link>
        ) : (
          <>
            <button
              onClick={() => onSwitch(client.profileId)}
              className={cn(
                "flex-1 rounded-lg py-2 text-sm font-medium transition-colors duration-150",
                client.isActive
                  ? "bg-primary/10 text-primary cursor-default"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
              disabled={client.isActive}
            >
              {client.isActive ? "Active" : "Switch to"}
            </button>

            <Link
              href="/dashboard"
              onClick={() => !client.isActive && onSwitch(client.profileId)}
              className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors duration-150"
            >
              <LayoutDashboard className="size-3.5" />
              Dashboard
              <ChevronRight className="size-3.5" />
            </Link>

            <Link
              href="/chat"
              onClick={() => !client.isActive && onSwitch(client.profileId)}
              className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors duration-150"
            >
              Chat
              <ChevronRight className="size-3.5" />
            </Link>

            <Link
              href="/schedule"
              onClick={() => !client.isActive && onSwitch(client.profileId)}
              className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors duration-150"
            >
              Schedule
              <ChevronRight className="size-3.5" />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
