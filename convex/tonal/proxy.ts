import { v } from "convex/values";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { decrypt } from "./encryption";
import { TonalApiError, tonalFetch } from "./client";
import { CACHE_TTLS } from "./cache";
import { withTokenRetry } from "./tokenRetry";
import type {
  Activity,
  ExternalActivity,
  FormattedWorkoutSummary,
  MuscleReadiness,
  StrengthDistribution,
  StrengthScore,
  StrengthScoreHistoryEntry,
  TonalUser,
  UserWorkout,
  WorkoutActivityDetail,
} from "./types";

// /workout-activities → Activity mapping.
// Tonal deprecated `/activities` (returns []). The replacement `/workout-activities`
// returns flat fields; this adapter reshapes them into the nested `workoutPreview`
// the rest of the codebase expects.

interface WorkoutActivityListItem {
  id: string;
  userId: string;
  workoutId: string;
  workoutType: string;
  beginTime: string;
  endTime?: string;
  totalDuration: number;
  activeDuration?: number;
  totalVolume: number;
  totalConcentricWork?: number;
  totalMovements?: number;
  totalSets?: number;
  totalReps?: number;
  percentCompleted?: number;
  deletedAt?: string | null;
  [key: string]: unknown;
}

function workoutActivityToActivity(wa: WorkoutActivityListItem): Activity {
  return {
    activityId: wa.id,
    userId: wa.userId,
    activityTime: wa.beginTime,
    activityType: "Workout",
    workoutPreview: {
      activityId: wa.id,
      workoutId: wa.workoutId,
      workoutTitle: "",
      programName: "",
      coachName: "",
      level: "",
      targetArea: "",
      isGuidedWorkout: false,
      workoutType: wa.workoutType,
      beginTime: wa.beginTime,
      totalDuration: wa.totalDuration,
      totalVolume: wa.totalVolume,
      totalWork: wa.totalConcentricWork ?? 0,
      totalAchievements: 0,
      activityType: "Workout",
    },
  };
}

/** Resolve encrypted token + tonalUserId for a given Convex user. */
export async function withTonalToken(
  ctx: ActionCtx,
  userId: Id<"users">,
  profileId?: Id<"userProfiles">,
): Promise<{ token: string; tonalUserId: string }> {
  const profile = await ctx.runQuery(internal.tonal.cache.getUserProfile, {
    userId,
    profileId,
  });
  if (!profile) {
    throw new Error("No Tonal profile found — user must link their account");
  }

  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error("TOKEN_ENCRYPTION_KEY env var is not set");
  }

  const token = await decrypt(profile.tonalToken, keyHex);
  return { token, tonalUserId: profile.tonalUserId };
}

/** Generic cache-check-then-fetch helper with stale-while-revalidate. */
export async function cachedFetch<T>(
  ctx: ActionCtx,
  opts: {
    userId?: Id<"users">;
    dataType: string;
    ttl: number;
    fetcher: () => Promise<T>;
  },
): Promise<T> {
  const { userId, dataType, ttl, fetcher } = opts;

  const cached = await ctx.runQuery(internal.tonal.cache.getCacheEntry, {
    userId,
    dataType,
  });

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }

  // Circuit breaker: if Tonal is unhealthy, serve stale data without attempting fetch
  const circuitOpen = await ctx.runQuery(internal.systemHealth.isCircuitOpen, { service: "tonal" });
  if (circuitOpen && cached) {
    console.warn(`cachedFetch(${dataType}): circuit open, serving stale data`);
    return cached.data as T;
  }

  // Stale-while-revalidate: try to refresh, fall back to stale data
  try {
    const data = await fetcher();
    const now = Date.now();

    // Truncate large arrays before caching (Convex 8192 element limit)
    const MAX_CACHE_ARRAY_LENGTH = 500;
    const cacheData =
      Array.isArray(data) && data.length > MAX_CACHE_ARRAY_LENGTH
        ? data.slice(0, MAX_CACHE_ARRAY_LENGTH)
        : data;

    try {
      await ctx.runMutation(internal.tonal.cache.setCacheEntry, {
        userId,
        dataType,
        data: cacheData,
        fetchedAt: now,
        expiresAt: now + ttl,
      });
    } catch (cacheErr) {
      console.warn(`cachedFetch(${dataType}): cache write failed`, cacheErr);
    }

    // Record success for circuit breaker
    void ctx.runMutation(internal.systemHealth.recordSuccess, { service: "tonal" });

    return data;
  } catch (error) {
    // Never swallow auth errors -- the user must reconnect
    if (error instanceof TonalApiError && error.status === 401) throw error;
    if (error instanceof Error && error.message.includes("session expired")) throw error;

    // Record failure for circuit breaker (non-auth errors only)
    void ctx.runMutation(internal.systemHealth.recordFailure, { service: "tonal" });

    // For non-auth errors, fall back to stale data if available
    if (cached) {
      console.warn(`cachedFetch(${dataType}): refresh failed, serving stale data`, error);
      return cached.data as T;
    }
    throw error;
  }
}

export const fetchUserProfile = internalAction({
  args: { userId: v.id("users"), profileId: v.optional(v.id("userProfiles")) },
  handler: async (ctx, { userId, profileId }): Promise<TonalUser> =>
    withTokenRetry(
      ctx,
      userId,
      (token, tonalUserId) =>
        cachedFetch<TonalUser>(ctx, {
          userId,
          dataType: `profile:${tonalUserId}`,
          ttl: CACHE_TTLS.profile,
          fetcher: () => tonalFetch<TonalUser>(token, `/v6/users/${tonalUserId}`),
        }),
      profileId,
    ),
});

export const fetchStrengthScores = internalAction({
  args: { userId: v.id("users"), profileId: v.optional(v.id("userProfiles")) },
  handler: async (ctx, { userId, profileId }): Promise<StrengthScore[]> =>
    withTokenRetry(
      ctx,
      userId,
      (token, tonalUserId) =>
        cachedFetch<StrengthScore[]>(ctx, {
          userId,
          dataType: `strengthScores:${tonalUserId}`,
          ttl: CACHE_TTLS.strengthScores,
          fetcher: () =>
            tonalFetch<StrengthScore[]>(token, `/v6/users/${tonalUserId}/strength-scores/current`),
        }),
      profileId,
    ),
});

export const fetchStrengthDistribution = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<StrengthDistribution> =>
    withTokenRetry(ctx, userId, (token, tonalUserId) =>
      cachedFetch<StrengthDistribution>(ctx, {
        userId,
        dataType: `strengthDistribution:${tonalUserId}`,
        ttl: CACHE_TTLS.strengthDistribution,
        fetcher: () =>
          tonalFetch<StrengthDistribution>(
            token,
            `/v6/users/${tonalUserId}/strength-scores/distribution`,
          ),
      }),
    ),
});

export const fetchStrengthHistory = internalAction({
  args: { userId: v.id("users"), profileId: v.optional(v.id("userProfiles")) },
  handler: async (ctx, { userId, profileId }): Promise<StrengthScoreHistoryEntry[]> =>
    withTokenRetry(
      ctx,
      userId,
      (token, tonalUserId) =>
        cachedFetch<StrengthScoreHistoryEntry[]>(ctx, {
          userId,
          dataType: `strengthHistory:${tonalUserId}`,
          ttl: CACHE_TTLS.strengthHistory,
          fetcher: () =>
            tonalFetch<StrengthScoreHistoryEntry[]>(
              token,
              `/v6/users/${tonalUserId}/strength-scores/history?limit=200`,
            ),
        }),
      profileId,
    ),
});

export const fetchMuscleReadiness = internalAction({
  args: { userId: v.id("users"), profileId: v.optional(v.id("userProfiles")) },
  handler: async (ctx, { userId, profileId }): Promise<MuscleReadiness> =>
    withTokenRetry(
      ctx,
      userId,
      (token, tonalUserId) =>
        cachedFetch<MuscleReadiness>(ctx, {
          userId,
          dataType: `muscleReadiness:${tonalUserId}`,
          ttl: CACHE_TTLS.muscleReadiness,
          fetcher: () =>
            tonalFetch<MuscleReadiness>(token, `/v6/users/${tonalUserId}/muscle-readiness/current`),
        }),
      profileId,
    ),
});

export const fetchWorkoutHistory = internalAction({
  args: {
    userId: v.id("users"),
    profileId: v.optional(v.id("userProfiles")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, profileId, limit = 20 }): Promise<Activity[]> =>
    withTokenRetry(
      ctx,
      userId,
      (token, tonalUserId) =>
        cachedFetch<Activity[]>(ctx, {
          userId,
          dataType: `workoutHistory:${tonalUserId}:${limit}`,
          ttl: CACHE_TTLS.workoutHistory,
          fetcher: async () => {
            // Tonal deprecated /activities (returns []). Use /workout-activities instead.
            const raw = await tonalFetch<WorkoutActivityListItem[]>(
              token,
              `/v6/users/${tonalUserId}/workout-activities?limit=${limit}`,
            );
            // Filter out soft-deleted entries and map to legacy Activity shape
            return raw.filter((wa) => !wa.deletedAt).map(workoutActivityToActivity);
          },
        }),
      profileId,
    ),
});

// Convex caps array fields at 8192 elements. Tonal can return thousands of
// set entries for some activities. Apply after every return path (fresh + cached).
const MAX_SETS_RETURN = 4000;
function truncateWorkoutDetail(detail: WorkoutActivityDetail | null): WorkoutActivityDetail | null {
  if (!detail?.workoutSetActivity || detail.workoutSetActivity.length <= MAX_SETS_RETURN)
    return detail;
  return { ...detail, workoutSetActivity: detail.workoutSetActivity.slice(0, MAX_SETS_RETURN) };
}

export const fetchWorkoutDetail = internalAction({
  args: {
    userId: v.id("users"),
    profileId: v.optional(v.id("userProfiles")),
    activityId: v.string(),
  },
  handler: async (
    ctx,
    { userId, profileId, activityId },
  ): Promise<WorkoutActivityDetail | null> => {
    const result = await withTokenRetry(
      ctx,
      userId,
      (token, tonalUserId) =>
        cachedFetch<WorkoutActivityDetail | null>(ctx, {
          userId,
          dataType: `workoutDetail:${tonalUserId}:${activityId}`,
          ttl: CACHE_TTLS.workoutHistory,
          fetcher: async () => {
            try {
              const detail = await tonalFetch<WorkoutActivityDetail>(
                token,
                `/v6/users/${tonalUserId}/workout-activities/${activityId}`,
              );
              return truncateWorkoutDetail(detail);
            } catch (error) {
              if (error instanceof TonalApiError && error.status === 404) {
                return null;
              }
              throw error;
            }
          },
        }),
      profileId,
    );
    // Truncate after cachedFetch too: stale cache may predate the truncation.
    return truncateWorkoutDetail(result);
  },
});

export const fetchFormattedSummary = internalAction({
  args: {
    userId: v.id("users"),
    profileId: v.optional(v.id("userProfiles")),
    summaryId: v.string(),
  },
  handler: async (ctx, { userId, profileId, summaryId }): Promise<FormattedWorkoutSummary> =>
    withTokenRetry(
      ctx,
      userId,
      (token, tonalUserId) =>
        cachedFetch<FormattedWorkoutSummary>(ctx, {
          userId,
          dataType: `formattedSummary:${tonalUserId}:${summaryId}`,
          ttl: CACHE_TTLS.workoutHistory,
          fetcher: () =>
            tonalFetch<FormattedWorkoutSummary>(
              token,
              `/v6/formatted/users/${tonalUserId}/workout-summaries/${summaryId}`,
            ),
        }),
      profileId,
    ),
});

export const fetchCustomWorkouts = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<UserWorkout[]> =>
    withTokenRetry(ctx, userId, (token, tonalUserId) =>
      cachedFetch<UserWorkout[]>(ctx, {
        userId,
        dataType: `customWorkouts:${tonalUserId}`,
        ttl: CACHE_TTLS.customWorkouts,
        fetcher: () => tonalFetch<UserWorkout[]>(token, `/v6/user-workouts`),
      }),
    ),
});

export const fetchExternalActivities = internalAction({
  args: {
    userId: v.id("users"),
    profileId: v.optional(v.id("userProfiles")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, profileId, limit = 20 }): Promise<ExternalActivity[]> =>
    withTokenRetry(
      ctx,
      userId,
      (token, tonalUserId) =>
        cachedFetch<ExternalActivity[]>(ctx, {
          userId,
          dataType: `externalActivities:${tonalUserId}:${limit}`,
          ttl: CACHE_TTLS.workoutHistory,
          fetcher: () =>
            tonalFetch<ExternalActivity[]>(
              token,
              `/v6/users/${tonalUserId}/external-activities?limit=${limit}`,
            ),
        }),
      profileId,
    ),
});
