import { describe, expect, it, vi } from "vitest";

import { defaultReadinessProbes, getReadinessReport, runBoundedProbe } from "./health";
import { RuntimeState } from "./runtime-state";

describe("runtime readiness", () => {
  it("is not ready during startup and does not probe dependencies", async () => {
    const state = new RuntimeState();
    const probe = vi.fn(async () => undefined);

    const report = await getReadinessReport({
      state,
      probes: [{ name: "database", check: probe }],
    });

    expect(report.status).toBe("not_ready");
    expect(report.runtime.phase).toBe("starting");
    expect(report.checks).toEqual({});
    expect(probe).not.toHaveBeenCalled();
  });

  it("is ready only when every required dependency is up", async () => {
    const state = new RuntimeState();
    state.markReady();

    const report = await getReadinessReport({
      state,
      probes: [
        { name: "performanceDatabase", check: async () => undefined },
        { name: "empCloudDatabase", check: async () => undefined },
      ],
    });

    expect(report.status).toBe("ready");
    expect(report.runtime.phase).toBe("ready");
    expect(report.checks.performanceDatabase.status).toBe("up");
    expect(report.checks.empCloudDatabase.status).toBe("up");
  });

  it("becomes unavailable immediately when draining", async () => {
    const state = new RuntimeState();
    state.markReady();
    state.markDraining();

    const report = await getReadinessReport({ state, probes: [] });

    expect(report.status).toBe("not_ready");
    expect(report.runtime.phase).toBe("draining");
  });

  it("bounds a dependency check that does not settle", async () => {
    const result = await runBoundedProbe(
      () => new Promise(() => undefined),
      5,
    );

    expect(result.status).toBe("down");
    expect(result.reason).toBe("timeout");
  });

  it("reports a failed dependency without exposing its error", async () => {
    const result = await runBoundedProbe(
      async () => {
        throw new Error("contains private connection details");
      },
      20,
    );

    expect(result).toMatchObject({ status: "down", reason: "unavailable" });
    expect(result).not.toHaveProperty("error");
  });

  it("adds Redis queue health only when Redis is required", async () => {
    const optionalProbeNames = defaultReadinessProbes(false).map(({ name }) => name);
    const requiredProbes = defaultReadinessProbes(true);
    const redisProbe = requiredProbes.find(({ name }) => name === "redisQueue");

    expect(optionalProbeNames).not.toContain("redisQueue");
    expect(redisProbe).toBeDefined();
    await expect(redisProbe!.check()).rejects.toThrow("unavailable");
  });
});
