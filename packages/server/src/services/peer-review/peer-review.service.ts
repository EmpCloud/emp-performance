// ============================================================================
// PEER REVIEW SERVICE
// Manages peer review nominations and approval workflow.
// ============================================================================

import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError, ConflictError } from "../../utils/errors";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PeerNomination {
  id: string;
  cycle_id: string;
  employee_id: number;
  nominee_id: number;
  status: string;
  nominated_by: number;
  approved_by: number | null;
  created_at: Date;
  updated_at: Date;
}

interface ListNominationsParams {
  page?: number;
  limit?: number;
  employeeId?: number;
  nomineeId?: number;
  status?: string;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function nominate(
  orgId: number,
  cycleId: string,
  employeeId: number,
  peerId: number,
  nominatedBy: number,
): Promise<PeerNomination> {
  const db = getDB();

  // Verify cycle belongs to org
  const cycle = await db.findOne<any>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) {
    throw new NotFoundError("Review cycle", cycleId);
  }

  // Prevent self-nomination
  if (employeeId === peerId) {
    throw new ValidationError("Cannot nominate self as peer reviewer");
  }

  // Check for duplicate nomination
  const existing = await db.findOne<PeerNomination>("peer_review_nominations", {
    cycle_id: cycleId,
    employee_id: employeeId,
    nominee_id: peerId,
  });
  if (existing) {
    throw new ConflictError("This peer has already been nominated for this employee in this cycle");
  }

  const nomination = await db.create<PeerNomination>("peer_review_nominations", {
    cycle_id: cycleId,
    employee_id: employeeId,
    nominee_id: peerId,
    status: "pending",
    nominated_by: nominatedBy,
    approved_by: null,
  });

  logger.info(`Peer nomination created: employee=${employeeId}, peer=${peerId}, cycle=${cycleId}`);
  return nomination;
}

export async function listNominations(
  orgId: number,
  cycleId: string,
  params?: ListNominationsParams,
) {
  const db = getDB();

  // Verify cycle belongs to org
  const cycle = await db.findOne<any>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) {
    throw new NotFoundError("Review cycle", cycleId);
  }

  const filters: Record<string, any> = { cycle_id: cycleId };
  if (params?.employeeId) filters.employee_id = params.employeeId;
  if (params?.nomineeId) filters.nominee_id = params.nomineeId;
  if (params?.status) filters.status = params.status;

  return db.findMany<PeerNomination>("peer_review_nominations", {
    page: params?.page || 1,
    limit: params?.limit || 50,
    filters,
    sort: { field: "created_at", order: "desc" },
  });
}

export async function approveNomination(
  orgId: number,
  nominationId: string,
  approvedBy: number,
): Promise<PeerNomination> {
  const db = getDB();
  const nomination = await db.findById<PeerNomination>("peer_review_nominations", nominationId);
  if (!nomination) {
    throw new NotFoundError("Peer nomination", nominationId);
  }

  // Verify cycle belongs to org
  const cycle = await db.findOne<any>("review_cycles", {
    id: nomination.cycle_id,
    organization_id: orgId,
  });
  if (!cycle) {
    throw new NotFoundError("Review cycle", nomination.cycle_id);
  }

  if (nomination.status !== "pending") {
    throw new ValidationError(`Cannot approve nomination with status '${nomination.status}'`);
  }

  const updated = await db.update<PeerNomination>("peer_review_nominations", nominationId, {
    status: "approved",
    approved_by: approvedBy,
  });

  logger.info(`Peer nomination approved: ${nominationId} by user ${approvedBy}`);
  return updated;
}

export async function declineNomination(
  orgId: number,
  nominationId: string,
  declinedBy: number,
): Promise<PeerNomination> {
  const db = getDB();
  const nomination = await db.findById<PeerNomination>("peer_review_nominations", nominationId);
  if (!nomination) {
    throw new NotFoundError("Peer nomination", nominationId);
  }

  // Verify cycle belongs to org
  const cycle = await db.findOne<any>("review_cycles", {
    id: nomination.cycle_id,
    organization_id: orgId,
  });
  if (!cycle) {
    throw new NotFoundError("Review cycle", nomination.cycle_id);
  }

  if (nomination.status !== "pending") {
    throw new ValidationError(`Cannot decline nomination with status '${nomination.status}'`);
  }

  const updated = await db.update<PeerNomination>("peer_review_nominations", nominationId, {
    status: "declined",
    approved_by: declinedBy,
  });

  logger.info(`Peer nomination declined: ${nominationId} by user ${declinedBy}`);
  return updated;
}
