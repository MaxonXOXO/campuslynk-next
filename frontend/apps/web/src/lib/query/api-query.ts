"use client";

import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
  type QueryKey,
} from "@tanstack/react-query";
import { useApiClient, useSession } from "../auth/session-provider";

export const STALE_TIME_LIST_MS = 45_000;
export const STALE_TIME_REFERENCE_MS = 5 * 60_000;
export const STALE_TIME_ABILITIES_MS = 0;

const NO_RETRY_STATUSES = new Set([401, 403, 422]);

function extractHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  if (typeof record.status === "number") return record.status;
  if (record.problem && typeof record.problem === "object") {
    const p = record.problem as Record<string, unknown>;
    if (typeof p.status === "number") return p.status;
  }
  return undefined;
}

export function shouldRetryApiError(failureCount: number, error: unknown): boolean {
  const status = extractHttpStatus(error);
  if (status !== undefined && (NO_RETRY_STATUSES.has(status) || (status >= 400 && status < 500))) {
    return false;
  }
  return failureCount < 2;
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_LIST_MS,
        gcTime: 10 * 60_000,
        retry: shouldRetryApiError,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function useQueryScope(): { userId: string; tenant: string } {
  const { state } = useSession();
  const userId = state.user?.id ?? "anonymous";
  const tenant = typeof window !== "undefined" ? window.location.host : "server";
  return { userId, tenant };
}

export function scopedQueryKey(
  scope: { userId: string; tenant: string },
  ...parts: readonly unknown[]
): readonly unknown[] {
  return [scope.userId, scope.tenant, ...parts];
}

export interface UseApiQueryOptions<TData>
  extends Omit<UseQueryOptions<TData, unknown, TData, QueryKey>, "queryKey" | "queryFn"> {
  queryKey: readonly unknown[];
  queryFn: (client: ReturnType<typeof useApiClient>) => Promise<TData>;
}

export function useApiQuery<TData>({
  queryKey,
  queryFn,
  ...options
}: UseApiQueryOptions<TData>) {
  const client = useApiClient();
  const scope = useQueryScope();
  const fullKey = scopedQueryKey(scope, ...queryKey);

  const query = useQuery<TData, unknown, TData, QueryKey>({
    queryKey: fullKey,
    queryFn: () => queryFn(client),
    ...options,
  });

  return {
    ...query,
    isRefreshing: query.isFetching && !query.isPending,
  };
}

export interface UseApiMutationOptions<TData, TVariables>
  extends Omit<UseMutationOptions<TData, unknown, TVariables>, "mutationFn"> {
  mutationFn: (client: ReturnType<typeof useApiClient>, variables: TVariables) => Promise<TData>;
  invalidateKeys?: readonly (readonly unknown[])[];
}

export function useApiMutation<TData = unknown, TVariables = void>({
  mutationFn,
  invalidateKeys,
  onSuccess,
  ...options
}: UseApiMutationOptions<TData, TVariables>) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const scope = useQueryScope();

  return useMutation<TData, unknown, TVariables>({
    mutationFn: (variables) => mutationFn(client, variables),
    onSuccess: async (data, variables, onMutateResult, context) => {
      if (invalidateKeys && invalidateKeys.length > 0) {
        await Promise.all(
          invalidateKeys.map((key) =>
            queryClient.invalidateQueries({ queryKey: scopedQueryKey(scope, ...key) })
          )
        );
      }
      await onSuccess?.(data, variables, onMutateResult, context);
    },
    ...options,
  });
}

