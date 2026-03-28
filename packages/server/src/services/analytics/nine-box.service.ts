// ============================================================================
// NINE-BOX GRID SERVICE
// Performance vs Potential classification, potential assessments.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError } from "../../utils/errors";
import type {
  NineBoxPosition,
  NineBoxData,
  NineBoxEmployee,
  NineBoxCell,
  PotentialAssessment,
} from "@emp-performance/shared";

// ---------------------------------------------------------------------------
// Nine-Box Classification
// ---------------------------------------------------------------------------

export function classifyNineBox(performance: number, potential: number): NineBoxPosition {
  const perfLevel = performance >= 4 ? "high" : performance >= 2.5 ? "medium" : "low";
  const potLevel = potential >= 4 ? "high" : potential >= 2.5 ? "medium" : "low";

  const matrix: Record<string, Record<string, NineBoxPosition>> = {
    high: {
      high: "Star",
      medium: "High Performer",
      low: "Solid Performer",
    },
    medium: {
      high: "High Potential",
      medium: "Core Player",
      low: "Average",
    },
    low: {
      high: "Inconsistent",
      medium: "Improvement Needed",
      low: "Action Required",
    },
  };

  return matrix[perfLevel][potLevel];
}

// ---------------------------------------------------------------------------
// Nine-Box Grid Data
// ---------------------------------------------------------------------------

export async function getNineBoxData(
  orgId: number,
  cycleId: string,
): Promise<NineBoxData> {
  const db = getDB();

  const cycle = await db.findOne<any>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);

  const participants = await db.findMany<any>("review_cycle_participants", {
    filters: { cycle_id: cycleId },
    limit: 10000,
  });

  const assessments = await db.findMany<PotentialAssessment>("potential_assessments", {
    filters: { organization_id: orgId, cycle_id: cycleId },
    limit: 10000,
  });

  const potentialMap = new Map<number, number>();
  for (const a of assessments.data) {
    potentialMap.set(a.employee_id, a.potential_rating);
  }

  const boxNames: NineBoxPosition[] = [
    "Star", "High Performer", "Solid Performer",
    "High Potential", "Core Player", "Average",
    "Inconsistent", "Improvement Needed", "Action Required",
  ];

  const boxes: Record<string, NineBoxCell> = {};
  for (const name of boxNames) {
    boxes[name] = { employees: [], count: 0 };
  }

  let totalEmployees = 0;

  for (const p of participants.data) {
    const performance = p.final_rating;
    const potential = potentialMap.get(p.employee_id);

    if (performance == null || potential == null) continue;

    const position = classifyNineBox(performance, potential);

    const employee: NineBoxEmployee = {
      id: p.employee_id,
      name: `Employee ${p.employee_id}`,
      department: null,
      rating: performance,
      potential,
    };

    boxes[position].employees.push(employee);
    boxes[position].count++;
    totalEmployees++;
  }

  return {
    boxes: boxes as Record<NineBoxPosition, NineBoxCell>,
    totalEmployees,
  };
}

// ---------------------------------------------------------------------------
// Potential Assessments
// ---------------------------------------------------------------------------

export async function createPotentialAssessment(
  orgId: number,
  data: {
    cycle_id: string;
    employee_id: number;
    potential_rating: number;
    notes?: string;
  },
  assessedBy: number,
): Promise<PotentialAssessment> {
  const db = getDB();

  if (data.potential_rating < 1 || data.potential_rating > 5) {
    throw new ValidationError("potential_rating must be between 1 and 5");
  }

  const cycle = await db.findOne<any>("review_cycles", {
    id: data.cycle_id,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", data.cycle_id);

  const existing = await db.findOne<PotentialAssessment>("potential_assessments", {
    cycle_id: data.cycle_id,
    employee_id: data.employee_id,
  });

  if (existing) {
    return db.update<PotentialAssessment>("potential_assessments", existing.id, {
      potential_rating: data.potential_rating,
      notes: data.notes ?? null,
      assessed_by: assessedBy,
    } as any);
  }

  const record: Record<string, any> = {
    id: uuidv4(),
    organization_id: orgId,
    cycle_id: data.cycle_id,
    employee_id: data.employee_id,
    assessed_by: assessedBy,
    potential_rating: data.potential_rating,
    notes: data.notes ?? null,
  };

  return db.create<PotentialAssessment>("potential_assessments", record as any);
}

export async function listPotentialAssessments(
  orgId: number,
  cycleId: string,
): Promise<PotentialAssessment[]> {
  const db = getDB();

  const cycle = await db.findOne<any>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);

  const result = await db.findMany<PotentialAssessment>("potential_assessments", {
    filters: { organization_id: orgId, cycle_id: cycleId },
    limit: 10000,
  });

  return result.data;
}
