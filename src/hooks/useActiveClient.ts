"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Returns the currently active client profile and a setter to switch profiles.
 * Drop-in replacement for anywhere the app previously fetched the single profile.
 */
export function useActiveClient() {
  const activeProfile = useQuery(api.clientProfiles.getActiveProfile);
  const allProfiles = useQuery(api.clientProfiles.listMyProfiles);
  const setActiveProfile = useMutation(api.clientProfiles.setActiveProfile);

  const switchToClient = async (profileId: Id<"userProfiles">) => {
    await setActiveProfile({ profileId });
  };

  return {
    activeProfile,
    allProfiles: allProfiles ?? [],
    switchToClient,
    isMultiClient: (allProfiles?.length ?? 0) > 1,
  };
}
