import winston from "winston";
import { config } from "../config";

export const logger = winston.createLogger({
  level: config.env === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    config.env === "production"
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), winston.format.simple())
  ),
  // Emit to stdout/stderr only. PM2 or the container platform owns durable
  // retention, rotation, access control, and forwarding to the log backend.
  transports: [new winston.transports.Console()],
  defaultMeta: { service: "emp-performance", release: config.runtime.releaseSha },
});
