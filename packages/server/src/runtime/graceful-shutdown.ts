import type { Server } from "node:http";

export interface GracefulShutdownOptions {
  server: Server | null;
  closeDependencies: () => Promise<void>;
  timeoutMs: number;
  onTimeout?: () => void;
}

export interface GracefulShutdownResult {
  timedOut: boolean;
  errors: unknown[];
}

export async function closeHttpServer(server: Server | null): Promise<void> {
  if (!server || !server.listening) return;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

/**
 * Stop accepting HTTP traffic before closing background workers and storage.
 * The caller decides how to terminate the process after the bounded deadline.
 */
export async function runGracefulShutdown({
  server,
  closeDependencies,
  timeoutMs,
  onTimeout,
}: GracefulShutdownOptions): Promise<GracefulShutdownResult> {
  const errors: unknown[] = [];
  let timeout: NodeJS.Timeout | undefined;

  const shutdown = (async () => {
    try {
      await closeHttpServer(server);
    } catch (error) {
      errors.push(error);
    }

    try {
      await closeDependencies();
    } catch (error) {
      errors.push(error);
    }

    return { timedOut: false, errors } satisfies GracefulShutdownResult;
  })();

  const deadline = new Promise<GracefulShutdownResult>((resolve) => {
    timeout = setTimeout(() => {
      onTimeout?.();
      resolve({ timedOut: true, errors });
    }, Math.max(1, timeoutMs));
    timeout.unref();
  });

  const result = await Promise.race([shutdown, deadline]);
  if (timeout) clearTimeout(timeout);
  return result;
}
