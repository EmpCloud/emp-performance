export type RuntimePhase = "starting" | "ready" | "draining" | "failed" | "stopped";

export interface RuntimeSnapshot {
  phase: RuntimePhase;
  startedAt: string;
  changedAt: string;
}

/**
 * Small in-process state machine used by readiness checks and shutdown.
 * Readiness is deliberately opt-in: a new process starts as `starting` and is
 * not ready until all startup work and the HTTP listener have completed.
 */
export class RuntimeState {
  private phase: RuntimePhase = "starting";
  private readonly startedAt = new Date();
  private changedAt = this.startedAt;

  snapshot(): RuntimeSnapshot {
    return {
      phase: this.phase,
      startedAt: this.startedAt.toISOString(),
      changedAt: this.changedAt.toISOString(),
    };
  }

  isReady(): boolean {
    return this.phase === "ready";
  }

  markReady(): boolean {
    // Never allow late startup work to undo an active shutdown or failure.
    if (this.phase !== "starting") return false;
    this.transitionTo("ready");
    return true;
  }

  markDraining(): void {
    if (this.phase === "stopped") return;
    this.transitionTo("draining");
  }

  markFailed(): void {
    if (this.phase === "stopped") return;
    this.transitionTo("failed");
  }

  markStopped(): void {
    this.transitionTo("stopped");
  }

  private transitionTo(phase: RuntimePhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.changedAt = new Date();
  }
}

export const runtimeState = new RuntimeState();
