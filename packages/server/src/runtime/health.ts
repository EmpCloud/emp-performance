import { getDB } from "../db/adapters";
import { getEmpCloudDB } from "../db/empcloud";
import { config } from "../config";
import { isQueueSystemAvailable } from "../jobs/queue";
import { RuntimeState, runtimeState } from "./runtime-state";

export type DependencyStatus = "up" | "down";

export interface DependencyCheckResult {
  status: DependencyStatus;
  durationMs: number;
  reason?: "timeout" | "unavailable";
}

export interface ReadinessReport {
  status: "ready" | "not_ready";
  timestamp: string;
  runtime: ReturnType<RuntimeState["snapshot"]>;
  checks: Record<string, DependencyCheckResult>;
}

export interface ReadinessProbe {
  name: string;
  check: () => Promise<unknown>;
}

export interface ReadinessOptions {
  state?: RuntimeState;
  probes?: ReadinessProbe[];
  timeoutMs?: number;
}

export const DEFAULT_READINESS_TIMEOUT_MS = 1_000;

class ProbeTimeoutError extends Error {}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

export async function runBoundedProbe(
  probe: () => Promise<unknown>,
  timeoutMs = DEFAULT_READINESS_TIMEOUT_MS,
): Promise<DependencyCheckResult> {
  const startedAt = Date.now();
  let timeout: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      Promise.resolve().then(probe),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new ProbeTimeoutError("Dependency check timed out")),
          Math.max(1, timeoutMs),
        );
        timeout.unref();
      }),
    ]);

    return { status: "up", durationMs: elapsedMs(startedAt) };
  } catch (error) {
    return {
      status: "down",
      durationMs: elapsedMs(startedAt),
      reason: error instanceof ProbeTimeoutError ? "timeout" : "unavailable",
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function defaultReadinessProbes(
  redisRequired = config.runtime.redisRequired,
): ReadinessProbe[] {
  const probes: ReadinessProbe[] = [
    {
      name: "performanceDatabase",
      check: async () => {
        const db = getDB();
        if (!db.isConnected()) throw new Error("Performance database is not connected");
        await db.raw("SELECT 1");
      },
    },
    {
      name: "empCloudDatabase",
      check: async () => {
        await getEmpCloudDB().raw("SELECT 1");
      },
    },
  ];

  if (redisRequired) {
    probes.push({
      name: "redisQueue",
      check: async () => {
        if (!isQueueSystemAvailable()) {
          throw new Error("Redis queue system is unavailable");
        }
      },
    });
  }

  return probes;
}

export async function getReadinessReport(
  options: ReadinessOptions = {},
): Promise<ReadinessReport> {
  const state = options.state ?? runtimeState;
  const runtime = state.snapshot();

  // Do not touch dependencies while starting, draining, failed, or stopped.
  if (!state.isReady()) {
    return {
      status: "not_ready",
      timestamp: new Date().toISOString(),
      runtime,
      checks: {},
    };
  }

  const probes = options.probes ?? defaultReadinessProbes();
  const configuredTimeout = config.runtime.dependencyTimeoutMs;
  const timeoutMs = options.timeoutMs ?? (
    Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : DEFAULT_READINESS_TIMEOUT_MS
  );
  const results = await Promise.all(
    probes.map(async ({ name, check }) => [
      name,
      await runBoundedProbe(check, timeoutMs),
    ] as const),
  );
  const checks = Object.fromEntries(results);
  const ready = results.every(([, result]) => result.status === "up");

  return {
    status: ready ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
    runtime: state.snapshot(),
    checks,
  };
}
