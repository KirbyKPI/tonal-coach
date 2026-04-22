"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useActiveClient } from "@/hooks/useActiveClient";
import { Check, ChevronDown, Plus, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Doc, Id } from "../../convex/_generated/dataModel";

/**
 * Display label for a profile. Priority is:
 *   1. Coach's own profile → always "KPI Coach Overview"
 *   2. Tonal firstName + lastName → the real name from their Tonal account
 *   3. clientLabel → what the coach typed when adding the client (used before
 *      Tonal connects; superseded once real profile data arrives)
 *   4. tonalEmail → last-ditch identifier
 *   5. fallback
 */
function getProfileLabel(profile: Doc<"userProfiles">, fallback = "Unnamed"): string {
  if (profile.isCoachAccount) return "KPI Coach Overview";
  const tonalName = [profile.profileData?.firstName, profile.profileData?.lastName]
    .filter(Boolean)
    .join(" ");
  return tonalName || profile.clientLabel || profile.tonalEmail || fallback;
}

/**
 * Avatar initials for a label. Takes the first character of the first two
 * whitespace-separated tokens, so "Kirby Coggins" and "KPI Coach Overview"
 * both render as "KC". Falls back to a single character for one-word labels.
 */
function getInitials(label: string): string {
  const tokens = label.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";
  if (tokens.length === 1) return tokens[0].charAt(0).toUpperCase();
  return (tokens[0].charAt(0) + tokens[1].charAt(0)).toUpperCase();
}

export function ClientSwitcher() {
  const { activeProfile, allProfiles, switchToClient } = useActiveClient();
  const addClient = useMutation(api.clientProfiles.addClientProfile);
  const removeClient = useMutation(api.clientProfiles.removeClientProfile);

  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newEmail, setNewEmail] = useState("");

  // Only show the switcher when there are multiple profiles or always show for discoverability
  if (!activeProfile) return null;

  const displayName = getProfileLabel(activeProfile, "My Account");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim() || !newEmail.trim()) return;
    await addClient({ clientLabel: newLabel.trim(), tonalEmail: newEmail.trim() });
    setNewLabel("");
    setNewEmail("");
    setAdding(false);
  };

  const handleSwitch = async (profileId: Id<"userProfiles">) => {
    await switchToClient(profileId);
    setOpen(false);
    // Reload to ensure all cached queries refresh against new profile
    window.location.reload();
  };

  const handleRemove = async (e: React.MouseEvent, profileId: Id<"userProfiles">) => {
    e.stopPropagation();
    if (allProfiles.length <= 1) return;
    if (!confirm("Remove this client profile? This cannot be undone.")) return;
    await removeClient({ profileId });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium",
          "bg-muted/50 hover:bg-muted text-foreground border border-border",
          "transition-colors duration-200",
        )}
      >
        <Users className="size-4 text-muted-foreground" />
        <span className="max-w-[120px] truncate">{displayName}</span>
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-border bg-popover shadow-xl">
            <div className="p-2">
              <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Client Accounts
              </p>

              {allProfiles.map((profile) => {
                const label = getProfileLabel(profile);
                const isActive = profile._id === activeProfile._id;

                return (
                  <button
                    key={profile._id}
                    onClick={() => handleSwitch(profile._id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm",
                      "hover:bg-muted transition-colors duration-150 text-left group",
                      isActive && "text-foreground font-medium",
                    )}
                  >
                    <div className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary shrink-0">
                      {getInitials(label)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{label}</p>
                      {profile.tonalEmail && (
                        <p className="truncate text-xs text-muted-foreground">
                          {profile.tonalEmail}
                        </p>
                      )}
                    </div>
                    {isActive && <Check className="size-4 text-primary shrink-0" />}
                    {!isActive && allProfiles.length > 1 && (
                      <button
                        onClick={(e) => handleRemove(e, profile._id)}
                        className="hidden group-hover:flex size-6 items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        title="Remove client"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </button>
                );
              })}

              <div className="my-1.5 border-t border-border" />

              {adding ? (
                <form onSubmit={handleAdd} className="space-y-2 px-2 py-1">
                  <input
                    autoFocus
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Client name"
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <input
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Tonal email"
                    type="email"
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 rounded-md bg-primary py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Add Client
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdding(false)}
                      className="flex-1 rounded-md bg-muted py-1.5 text-xs text-muted-foreground hover:bg-muted/80 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-150"
                >
                  <Plus className="size-4" />
                  Add client account
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
