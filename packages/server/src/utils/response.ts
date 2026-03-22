import { Response } from "express";

export function sendSuccess<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({
    success: true,
    data,
  });
}

export function sendError(res: Response, statusCode: number, code: string, message: string) {
  return res.status(statusCode).json({
    success: false,
    error: { code, message },
  });
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  perPage: number
) {
  return res.status(200).json({
    success: true,
    data: {
      data,
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    },
  });
}
