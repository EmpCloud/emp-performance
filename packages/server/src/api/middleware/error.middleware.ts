import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../../utils/logger";
import { AppError } from "../../utils/errors";
import type { ApiResponse } from "@emp-performance/shared";
import { config } from "../../config";

type ErrorResponse = ApiResponse<null> & { requestId?: string };

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error("request_failed", {
        requestId: req.requestId,
        statusCode: err.statusCode,
        code: err.code,
        error: err,
      });
    }
    const response: ErrorResponse = {
      success: false,
      requestId: req.requestId,
      error: {
        code: err.code,
        message:
          config.env === "production" && err.statusCode >= 500
            ? "An unexpected error occurred"
            : err.message,
        details: config.env === "production" && err.statusCode >= 500 ? undefined : err.details,
      },
    };
    return res.status(err.statusCode).json(response);
  }

  // Handle Zod validation errors as 400
  if (err instanceof ZodError) {
    const response: ErrorResponse = {
      success: false,
      requestId: req.requestId,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: err.flatten().fieldErrors as Record<string, string[]>,
      },
    };
    return res.status(400).json(response);
  }

  logger.error("unhandled_request_error", { requestId: req.requestId, error: err });

  const response: ErrorResponse = {
    success: false,
    requestId: req.requestId,
    error: {
      code: "INTERNAL_ERROR",
      message: config.env !== "production" ? err.message : "An unexpected error occurred",
    },
  };
  return res.status(500).json(response);
}
