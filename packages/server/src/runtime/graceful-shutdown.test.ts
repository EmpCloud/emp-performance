import type { Server } from "node:http";
import { describe, expect, it, vi } from "vitest";

import { runGracefulShutdown } from "./graceful-shutdown";

describe("runGracefulShutdown", () => {
  it("closes the HTTP listener before dependencies", async () => {
    const events: string[] = [];
    const server = {
      listening: true,
      close: (callback: (error?: Error) => void) => {
        events.push("server");
        callback();
        return server;
      },
    } as unknown as Server;

    const result = await runGracefulShutdown({
      server,
      timeoutMs: 100,
      closeDependencies: async () => {
        events.push("dependencies");
      },
    });

    expect(result).toEqual({ timedOut: false, errors: [] });
    expect(events).toEqual(["server", "dependencies"]);
  });

  it("returns at the deadline and invokes the force-close hook", async () => {
    const onTimeout = vi.fn();
    const server = {
      listening: true,
      close: () => server,
    } as unknown as Server;

    const result = await runGracefulShutdown({
      server,
      timeoutMs: 5,
      closeDependencies: async () => undefined,
      onTimeout,
    });

    expect(result.timedOut).toBe(true);
    expect(onTimeout).toHaveBeenCalledOnce();
  });
});
