import { Request, Response, NextFunction } from "express";
import { logger } from "../../utils/logger";
import { AppError } from "../../utils/errors";
import type { ApiResponse } from "@emp-performance/shared";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
    return res.status(err.statusCode).json(response);
  }

  logger.error("Unhandled error:", err);

  const isDev = process.env.NODE_ENV !== "production";
  const response: ApiResponse<null> = {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: isDev ? err.message : "An unexpected error occurred",
    },
  };
  return res.status(500).json(response);
}
