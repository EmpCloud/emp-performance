import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { NotFoundError } from "../../utils/errors";
import type { CompetencyFramework, Competency } from "@emp-performance/shared";

// ---------------------------------------------------------------------------
// Frameworks
// ---------------------------------------------------------------------------

export async function createFramework(
  orgId: number,
  data: {
    name: string;
    description?: string;
    is_active?: boolean;
  },
  createdBy: number,
): Promise<CompetencyFramework> {
  const db = getDB();
  const record: Record<string, any> = {
    id: uuidv4(),
    organization_id: orgId,
    name: data.name,
    description: data.description ?? null,
    is_active: data.is_active ?? true,
    created_by: createdBy,
  };
  return db.create<CompetencyFramework>("competency_frameworks", record as any);
}

export async function listFrameworks(orgId: number): Promise<CompetencyFramework[]> {
  const db = getDB();
  const result = await db.findMany<CompetencyFramework>("competency_frameworks", {
    filters: { organization_id: orgId, deleted_at: null },
  });
  return result.data;
}

export async function getFramework(
  orgId: number,
  id: string,
): Promise<CompetencyFramework & { competencies: Competency[] }> {
  const db = getDB();
  const framework = await db.findOne<CompetencyFramework>("competency_frameworks", {
    id,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!framework) throw new NotFoundError("CompetencyFramework", id);

  const competencies = await db.findMany<Competency>("competencies", {
    filters: { framework_id: id },
    sort: { field: "order", order: "asc" },
  });

  return { ...framework, competencies: competencies.data };
}

export async function updateFramework(
  orgId: number,
  id: string,
  data: { name?: string; description?: string; is_active?: boolean },
): Promise<CompetencyFramework> {
  const db = getDB();
  const existing = await db.findOne<CompetencyFramework>("competency_frameworks", {
    id,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!existing) throw new NotFoundError("CompetencyFramework", id);

  return db.update<CompetencyFramework>("competency_frameworks", id, data as any);
}

export async function deleteFramework(orgId: number, id: string): Promise<void> {
  const db = getDB();
  const existing = await db.findOne<CompetencyFramework>("competency_frameworks", {
    id,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!existing) throw new NotFoundError("CompetencyFramework", id);

  await db.update("competency_frameworks", id, { deleted_at: new Date().toISOString() } as any);
}

// ---------------------------------------------------------------------------
// Competencies within a framework
// ---------------------------------------------------------------------------

export async function addCompetency(
  orgId: number,
  frameworkId: string,
  data: {
    name: string;
    description?: string;
    category?: string;
    weight?: number;
    order?: number;
  },
): Promise<Competency> {
  const db = getDB();
  // verify framework belongs to org
  const framework = await db.findOne<CompetencyFramework>("competency_frameworks", {
    id: frameworkId,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!framework) throw new NotFoundError("CompetencyFramework", frameworkId);

  const record: Record<string, any> = {
    id: uuidv4(),
    framework_id: frameworkId,
    name: data.name,
    description: data.description ?? null,
    category: data.category ?? null,
    weight: data.weight ?? 1,
    order: data.order ?? 0,
  };

  return db.create<Competency>("competencies", record as any);
}

export async function updateCompetency(
  orgId: number,
  frameworkId: string,
  compId: string,
  data: { name?: string; description?: string; category?: string; weight?: number; order?: number },
): Promise<Competency> {
  const db = getDB();
  // verify framework belongs to org
  const framework = await db.findOne<CompetencyFramework>("competency_frameworks", {
    id: frameworkId,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!framework) throw new NotFoundError("CompetencyFramework", frameworkId);

  const existing = await db.findOne<Competency>("competencies", {
    id: compId,
    framework_id: frameworkId,
  });
  if (!existing) throw new NotFoundError("Competency", compId);

  return db.update<Competency>("competencies", compId, data as any);
}

export async function removeCompetency(
  orgId: number,
  frameworkId: string,
  compId: string,
): Promise<void> {
  const db = getDB();
  const framework = await db.findOne<CompetencyFramework>("competency_frameworks", {
    id: frameworkId,
    organization_id: orgId,
    deleted_at: null,
  });
  if (!framework) throw new NotFoundError("CompetencyFramework", frameworkId);

  const existing = await db.findOne<Competency>("competencies", {
    id: compId,
    framework_id: frameworkId,
  });
  if (!existing) throw new NotFoundError("Competency", compId);

  await db.delete("competencies", compId);
}
