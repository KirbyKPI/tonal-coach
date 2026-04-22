"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { RefreshCw, Users } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ClientCard } from "./ClientCard";
import { CoachToolbar } from "./CoachToolbar";
import { filterAndSort, type SortKey } from "./sortAndFilter";

export default function CoachPage() {
  const clients = useQuery(api.coachDashboard.getClientOverviews);
  const setActive = useMutation(api.clientProfiles.setActiveProfile);
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name-asc");

  const handleSwitch = async (profileId: Id<"userProfiles">) => {
    await setActive({ profileId });
    router.refresh();
  };

  const connectedCount = clients?.filter((c) => c.hasConnectedTonal).length ?? 0;
  const alertCount = clients?.reduce((sum, c) => sum + c.checkInAlerts, 0) ?? 0;

  const visibleClients = useMemo(
    () => (clients ? filterAndSort(clients, { query, sortKey }) : []),
    [clients, query, sortKey],
  );

  const hasAnyClients = !!clients && clients.length > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="size-6 text-muted-foreground" />
            KPI Coach Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and switch between your client accounts
          </p>
        </div>

        {hasAnyClients && (
          <div className="flex gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-foreground">{clients!.length}</p>
              <p className="text-xs text-muted-foreground">Clients</p>
            </div>
            <div className="w-px bg-border" />
            <div>
              <p className="text-2xl font-bold text-green-500">{connectedCount}</p>
              <p className="text-xs text-muted-foreground">Connected</p>
            </div>
            {alertCount > 0 && (
              <>
                <div className="w-px bg-border" />
                <div>
                  <p className="text-2xl font-bold text-orange-500">{alertCount}</p>
                  <p className="text-xs text-muted-foreground">Alerts</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Toolbar — only when there's more than one client to sort/filter */}
      {hasAnyClients && clients!.length > 1 && (
        <CoachToolbar
          query={query}
          onQueryChange={setQuery}
          sortKey={sortKey}
          onSortKeyChange={setSortKey}
        />
      )}

      {/* Loading */}
      {clients === undefined && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" />
          <span className="text-sm">Loading clients...</span>
        </div>
      )}

      {/* Empty state */}
      {clients?.length === 0 && (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <Users className="mx-auto size-10 text-muted-foreground mb-3" />
          <p className="text-foreground font-medium">No client accounts yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the client switcher in the sidebar to add your first client.
          </p>
        </div>
      )}

      {/* No-match state */}
      {hasAnyClients && visibleClients.length === 0 && (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">No clients match &ldquo;{query}&rdquo;.</p>
        </div>
      )}

      {/* Client grid */}
      {visibleClients.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleClients.map((client) => (
            <ClientCard key={client.profileId} client={client} onSwitch={handleSwitch} />
          ))}
        </div>
      )}

      {/* Instructions */}
      {hasAnyClients && (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">How it works:</span> Switching to a client
            loads their Tonal history, workout plans, and AI chat context. All pages (Dashboard,
            Chat, Schedule, Stats) update automatically to show that client&apos;s data. Use the
            switcher in the sidebar to jump between clients at any time.
          </p>
        </div>
      )}
    </div>
  );
}
