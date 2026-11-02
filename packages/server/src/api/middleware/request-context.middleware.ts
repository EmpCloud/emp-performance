import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../../utils/logger";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function requestIdFromHeader(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return REQUEST_ID_PATTERN.test(candidate) ? candidate : null;
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = requestIdFromHeader(req.headers["x-request-id"]) || crypto.randomUUID();
  const startedAt = process.hrtime.bigint();

  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  res.once("finish", () => {
    const elapsedNs = process.hrtime.bigint() - startedAt;
    logger.info("http_request", {
      requestId,
      method: req.method,
      path: (req.originalUrl || req.url).split("?", 1)[0],
      statusCode: res.statusCode,
      durationMs: Number(elapsedNs) / 1_000_000,
      organizationId: req.actor?.organizationId ?? req.user?.empcloudOrgId,
      actorId: req.actor?.userId ?? req.user?.empcloudUserId,
    });
  });

  next();
}

export const __requestContextTestUtils = { requestIdFromHeader };
