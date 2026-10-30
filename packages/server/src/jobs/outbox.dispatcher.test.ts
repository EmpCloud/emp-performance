import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockProcessOutboxBatch, mockValidateWebhookConfiguration } = vi.hoisted(() => ({
  mockProcessOutboxBatch: vi.fn(),
  mockValidateWebhookConfiguration: vi.fn(),
}));

vi.mock("../services/integration/outbox.service", () => ({
  processOutboxBatch: mockProcessOutboxBatch,
  validateWebhookConfiguration: mockValidateWebhookConfiguration,
}));

vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { config } from "../config";
import {
  isOutboxDispatcherRunning,
  runOutboxDispatchOnce,
  startOutboxDispatcher,
  stopOutboxDispatcher,
} from "./outbox.dispatcher";

describe("outbox dispatcher", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await stopOutboxDispatcher();
    vi.clearAllMocks();
    Object.assign(config.empcloudWebhook as any, {
      url: "https://empcloud.example.test/hooks/performance",
      pollIntervalMs: 1000,
    });
    mockProcessOutboxBatch.mockResolvedValue({
      claimed: 0,
      delivered: 0,
      retried: 0,
      dead: 0,
    });
  });

  afterEach(async () => {
    await stopOutboxDispatcher();
    vi.useRealTimers();
  });

  it("starts once, dispatches immediately, and stops cleanly", async () => {
    startOutboxDispatcher();
    startOutboxDispatcher();
    await vi.runAllTicks();

    expect(mockValidateWebhookConfiguration).toHaveBeenCalledTimes(1);
    expect(mockProcessOutboxBatch).toHaveBeenCalledTimes(1);
    expect(isOutboxDispatcherRunning()).toBe(true);

    await stopOutboxDispatcher();
    expect(isOutboxDispatcherRunning()).toBe(false);
  });

  it("does not overlap dispatch runs", async () => {
    let resolve!: (value: { claimed: number; delivered: number; retried: number; dead: number }) => void;
    mockProcessOutboxBatch.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );

    const first = runOutboxDispatchOnce();
    const concurrent = runOutboxDispatchOnce();
    expect(mockProcessOutboxBatch).toHaveBeenCalledTimes(1);

    resolve({ claimed: 0, delivered: 0, retried: 0, dead: 0 });
    await Promise.all([first, concurrent]);
  });

  it("stays idle when no endpoint is configured", () => {
    (config.empcloudWebhook as any).url = undefined;

    startOutboxDispatcher();

    expect(isOutboxDispatcherRunning()).toBe(false);
    expect(mockProcessOutboxBatch).not.toHaveBeenCalled();
  });
});
