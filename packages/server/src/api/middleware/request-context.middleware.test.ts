import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { requestContext } from "./request-context.middleware";

describe("requestContext", () => {
  it("accepts a safe upstream request id and returns it", () => {
    const req: any = {
      headers: { "x-request-id": "edge-123" },
      method: "GET",
      originalUrl: "/health/live?secret=no",
    };
    const res: any = new EventEmitter();
    res.statusCode = 200;
    res.setHeader = vi.fn();
    const next = vi.fn();

    requestContext(req, res, next);

    expect(req.requestId).toBe("edge-123");
    expect(res.setHeader).toHaveBeenCalledWith("X-Request-ID", "edge-123");
    expect(next).toHaveBeenCalledOnce();
  });

  it("replaces malformed request ids", () => {
    const req: any = {
      headers: { "x-request-id": "bad id with spaces" },
      method: "GET",
      url: "/health/live",
    };
    const res: any = new EventEmitter();
    res.statusCode = 200;
    res.setHeader = vi.fn();

    requestContext(req, res, vi.fn());

    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
