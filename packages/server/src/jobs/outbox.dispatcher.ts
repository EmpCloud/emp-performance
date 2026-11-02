import { config } from "../config";
import { processOutboxBatch, validateWebhookConfiguration } from "../services/integration/outbox.service";
import { logger } from "../utils/logger";

let timer: NodeJS.Timeout | null = null;
let activeDispatch: Promise<void> | null = null;

function pollInterval(): number {
  const configured = config.empcloudWebhook.pollIntervalMs;
  return Number.isFinite(configured) && configured >= 1_000
    ? Math.floor(configured)
    : 5_000;
}

export async function runOutboxDispatchOnce(): Promise<void> {
  if (activeDispatch) return activeDispatch;

  const dispatch = (async () => {
    try {
      const result = await processOutboxBatch();
      if (result.claimed > 0) {
        logger.info(
          `Outbox batch: claimed=${result.claimed}, delivered=${result.delivered}, retried=${result.retried}, dead=${result.dead}`,
        );
      }
    } catch (error) {
      logger.error("Outbox dispatcher failed:", error);
    }
  })();
  activeDispatch = dispatch;
  await dispatch.finally(() => {
    if (activeDispatch === dispatch) activeDispatch = null;
  });
}

export function startOutboxDispatcher(): void {
  if (timer) return;
  validateWebhookConfiguration();

  if (!config.empcloudWebhook.url) {
    logger.info("EMP Cloud webhook is not configured; outbox dispatcher is idle");
    return;
  }

  void runOutboxDispatchOnce();
  timer = setInterval(() => void runOutboxDispatchOnce(), pollInterval());
  timer.unref();
  logger.info(`Outbox dispatcher started (polling every ${pollInterval()}ms)`);
}

export async function stopOutboxDispatcher(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  await activeDispatch;
}

export function isOutboxDispatcherRunning(): boolean {
  return timer !== null;
}
