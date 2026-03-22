// ============================================================================
// CAREER PATH SERVICE
// Manages career paths, levels, and employee track assignments.
// ============================================================================

import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CareerPath {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  department: string | null;
  is_active: boolean;
  created_by: number;
  created_at: Date;
  updated_at: Date;
}

interface CareerPathLevel {
  id: string;
  career_path_id: string;
  title: string;
  level: number;
  description: string | null;
  requirements: string | null;
  min_years_experience: number | null;
  created_at: Date;
}

interface EmployeeCareerTrack {
  id: string;
  employee_id: number;
  career_path_id: string;
  current_level_id: string;
  target_level_id: string | null;
  assigned_at: Date;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CreatePathData {
  name: string;
  description?: string;
  department?: string;
  created_by: number;
}

interface UpdatePathData {
  name?: string;
  description?: string;
  department?: string;
  is_active?: boolean;
}

interface CreateLevelData {
  title: string;
  level: number;
  description?: string;
  requirements?: string;
  min_years_experience?: number;
}

interface UpdateLevelData {
  title?: string;
  level?: number;
  description?: string;
  requirements?: string;
  min_years_experience?: number;
}

// ---------------------------------------------------------------------------
// Career Paths
// ---------------------------------------------------------------------------

export async function createPath(orgId: number, data: CreatePathData): Promise<CareerPath> {
  const db = getDB();
  const path = await db.create<CareerPath>("career_paths", {
    organization_id: orgId,
    name: data.name,
    description: data.description || null,
    department: data.department || null,
    is_active: true,
    created_by: data.created_by,
  });
  logger.info(`Career path created: ${path.name} (org: ${orgId})`);
  return path;
}

export async function listPaths(
  orgId: number,
  params?: { page?: number; limit?: number },
) {
  const db = getDB();
  return db.findMany<CareerPath>("career_paths", {
    page: params?.page || 1,
    limit: params?.limit || 50,
    filters: { organization_id: orgId },
    sort: { field: "name", order: "asc" },
  });
}

export async function getPath(orgId: number, id: string) {
  const db = getDB();
  const path = await db.findOne<CareerPath>("career_paths", {
    id,
    organization_id: orgId,
  });
  if (!path) {
    throw new NotFoundError("Career path", id);
  }

  // Fetch levels ordered by level number
  const levels = await db.findMany<CareerPathLevel>("career_path_levels", {
    filters: { career_path_id: id },
    sort: { field: "level", order: "asc" },
    limit: 100,
  });

  return { ...path, levels: levels.data };
}

export async function updatePath(orgId: number, id: string, data: UpdatePathData): Promise<CareerPath> {
  const db = getDB();
  const existing = await db.findOne<CareerPath>("career_paths", {
    id,
    organization_id: orgId,
  });
  if (!existing) {
    throw new NotFoundError("Career path", id);
  }
  return db.update<CareerPath>("career_paths", id, data);
}

export async function deletePath(orgId: number, id: string): Promise<void> {
  const db = getDB();
  const existing = await db.findOne<CareerPath>("career_paths", {
    id,
    organization_id: orgId,
  });
  if (!existing) {
    throw new NotFoundError("Career path", id);
  }
  await db.delete("career_paths", id);
  logger.info(`Career path deleted: ${id} (org: ${orgId})`);
}

// ---------------------------------------------------------------------------
// Career Path Levels
// ---------------------------------------------------------------------------

export async function addLevel(
  orgId: number,
  pathId: string,
  data: CreateLevelData,
): Promise<CareerPathLevel> {
  const db = getDB();
  // Verify path belongs to org
  const path = await db.findOne<CareerPath>("career_paths", {
    id: pathId,
    organization_id: orgId,
  });
  if (!path) {
    throw new NotFoundError("Career path", pathId);
  }

  return db.create<CareerPathLevel>("career_path_levels", {
    career_path_id: pathId,
    title: data.title,
    level: data.level,
    description: data.description || null,
    requirements: data.requirements || null,
    min_years_experience: data.min_years_experience ?? null,
  });
}

export async function updateLevel(
  orgId: number,
  levelId: string,
  data: UpdateLevelData,
): Promise<CareerPathLevel> {
  const db = getDB();
  const level = await db.findById<CareerPathLevel>("career_path_levels", levelId);
  if (!level) {
    throw new NotFoundError("Career path level", levelId);
  }

  // Verify path belongs to org
  const path = await db.findOne<CareerPath>("career_paths", {
    id: level.career_path_id,
    organization_id: orgId,
  });
  if (!path) {
    throw new NotFoundError("Career path", level.career_path_id);
  }

  return db.update<CareerPathLevel>("career_path_levels", levelId, data);
}

export async function removeLevel(orgId: number, levelId: string): Promise<void> {
  const db = getDB();
  const level = await db.findById<CareerPathLevel>("career_path_levels", levelId);
  if (!level) {
    throw new NotFoundError("Career path level", levelId);
  }

  const path = await db.findOne<CareerPath>("career_paths", {
    id: level.career_path_id,
    organization_id: orgId,
  });
  if (!path) {
    throw new NotFoundError("Career path", level.career_path_id);
  }

  await db.delete("career_path_levels", levelId);
}

// ---------------------------------------------------------------------------
// Employee Career Tracks
// ---------------------------------------------------------------------------

export async function assignTrack(
  orgId: number,
  employeeId: number,
  pathId: string,
  currentLevelId: string,
  targetLevelId?: string,
): Promise<EmployeeCareerTrack> {
  const db = getDB();

  // Verify path belongs to org
  const path = await db.findOne<CareerPath>("career_paths", {
    id: pathId,
    organization_id: orgId,
  });
  if (!path) {
    throw new NotFoundError("Career path", pathId);
  }

  // Check if employee already has a track on this path
  const existing = await db.findOne<EmployeeCareerTrack>("employee_career_tracks", {
    employee_id: employeeId,
    career_path_id: pathId,
  });

  if (existing) {
    // Update existing track
    return db.update<EmployeeCareerTrack>("employee_career_tracks", existing.id, {
      current_level_id: currentLevelId,
      target_level_id: targetLevelId || null,
      assigned_at: new Date(),
    });
  }

  return db.create<EmployeeCareerTrack>("employee_career_tracks", {
    employee_id: employeeId,
    career_path_id: pathId,
    current_level_id: currentLevelId,
    target_level_id: targetLevelId || null,
    assigned_at: new Date(),
  });
}

export async function getEmployeeTrack(orgId: number, employeeId: number) {
  const db = getDB();

  const tracks = await db.findMany<EmployeeCareerTrack>("employee_career_tracks", {
    filters: { employee_id: employeeId },
    limit: 50,
  });

  // Enrich each track with path and level details
  const enriched = await Promise.all(
    tracks.data.map(async (track) => {
      const path = await db.findOne<CareerPath>("career_paths", {
        id: track.career_path_id,
        organization_id: orgId,
      });
      const currentLevel = await db.findById<CareerPathLevel>(
        "career_path_levels",
        track.current_level_id,
      );
      const targetLevel = track.target_level_id
        ? await db.findById<CareerPathLevel>("career_path_levels", track.target_level_id)
        : null;

      return {
        ...track,
        path,
        currentLevel,
        targetLevel,
      };
    }),
  );

  // Filter to only tracks belonging to this org
  return enriched.filter((t) => t.path !== null);
}
