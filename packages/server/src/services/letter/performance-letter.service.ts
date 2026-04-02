// ============================================================================
// PERFORMANCE LETTER SERVICE
// Business logic for letter templates and generated letters.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LetterType = "appraisal" | "increment" | "promotion" | "confirmation" | "warning";

export interface PerformanceLetterTemplate {
  id: string;
  organization_id: number;
  type: LetterType;
  name: string;
  content_template: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface GeneratedPerformanceLetter {
  id: string;
  organization_id: number;
  employee_id: number;
  cycle_id: string | null;
  template_id: string;
  type: LetterType;
  content: string;
  file_path: string | null;
  generated_by: number;
  sent_at: string | null;
  created_at: string;
}

interface CreateTemplateInput {
  type: LetterType;
  name: string;
  content_template: string;
  is_default?: boolean;
}

interface ListLettersParams {
  employeeId?: number;
  type?: LetterType;
  page?: number;
  perPage?: number;
}

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

export async function createTemplate(
  orgId: number,
  data: CreateTemplateInput,
): Promise<PerformanceLetterTemplate> {
  const db = getDB();

  const template = await db.create<PerformanceLetterTemplate>("performance_letter_templates", {
    id: uuidv4(),
    organization_id: orgId,
    type: data.type,
    name: data.name,
    content_template: data.content_template,
    is_default: data.is_default ?? false,
  });

  return template;
}

export async function listTemplates(
  orgId: number,
  type?: LetterType,
): Promise<PerformanceLetterTemplate[]> {
  const db = getDB();

  const filters: Record<string, any> = { organization_id: orgId };
  if (type) filters.type = type;

  const result = await db.findMany<PerformanceLetterTemplate>("performance_letter_templates", {
    filters,
    sort: { field: "created_at", order: "desc" },
    limit: 1000,
  });

  return result.data;
}

export async function getTemplate(
  orgId: number,
  id: string,
): Promise<PerformanceLetterTemplate> {
  const db = getDB();

  const template = await db.findOne<PerformanceLetterTemplate>("performance_letter_templates", {
    id,
    organization_id: orgId,
  });
  if (!template) throw new NotFoundError("LetterTemplate", id);

  return template;
}

export async function updateTemplate(
  orgId: number,
  id: string,
  data: Partial<CreateTemplateInput>,
): Promise<PerformanceLetterTemplate> {
  const db = getDB();

  const existing = await db.findOne<PerformanceLetterTemplate>("performance_letter_templates", {
    id,
    organization_id: orgId,
  });
  if (!existing) throw new NotFoundError("LetterTemplate", id);

  const updates: Record<string, any> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.type !== undefined) updates.type = data.type;
  if (data.content_template !== undefined) updates.content_template = data.content_template;
  if (data.is_default !== undefined) updates.is_default = data.is_default;

  return db.update<PerformanceLetterTemplate>("performance_letter_templates", id, updates);
}

export async function deleteTemplate(
  orgId: number,
  id: string,
): Promise<void> {
  const db = getDB();

  const existing = await db.findOne<PerformanceLetterTemplate>("performance_letter_templates", {
    id,
    organization_id: orgId,
  });
  if (!existing) throw new NotFoundError("LetterTemplate", id);

  await db.delete("performance_letter_templates", id);
}

// ---------------------------------------------------------------------------
// Letter Generation
// ---------------------------------------------------------------------------

function renderTemplate(template: string, variables: Record<string, string>): string {
  // Simple Handlebars-like variable replacement: {{variable_name}}
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    return variables[key] ?? `{{${key}}}`;
  });
}

export async function generateLetter(
  orgId: number,
  employeeId: number,
  templateId: string,
  cycleId: string | null,
  generatedBy: number,
): Promise<GeneratedPerformanceLetter> {
  const db = getDB();

  const template = await db.findOne<PerformanceLetterTemplate>("performance_letter_templates", {
    id: templateId,
    organization_id: orgId,
  });
  if (!template) throw new NotFoundError("LetterTemplate", templateId);

  // Gather employee data for template rendering
  const variables: Record<string, string> = {
    employee_id: String(employeeId),
    organization_id: String(orgId),
    date: new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    letter_type: template.type,
  };

  // Try to gather review data if cycle is provided
  if (cycleId) {
    variables.cycle_id = cycleId;

    const review = await db.findOne<any>("reviews", {
      organization_id: orgId,
      employee_id: employeeId,
      cycle_id: cycleId,
      status: "submitted",
    });

    if (review) {
      variables.overall_rating = String(review.overall_rating ?? "N/A");
      variables.review_summary = review.summary ?? "";
      variables.strengths = review.strengths ?? "";
      variables.improvements = review.improvements ?? "";
    }
  }

  // Render the template
  const content = renderTemplate(template.content_template, variables);

  const letter = await db.create<GeneratedPerformanceLetter>("generated_performance_letters", {
    id: uuidv4(),
    organization_id: orgId,
    employee_id: employeeId,
    cycle_id: cycleId ?? null,
    template_id: templateId,
    type: template.type,
    content,
    file_path: null,
    generated_by: generatedBy,
    sent_at: null,
  });

  logger.info(`Performance letter generated: ${letter.id} for employee ${employeeId}`);

  return letter;
}

// ---------------------------------------------------------------------------
// Letter Listing / Retrieval
// ---------------------------------------------------------------------------

export async function listLetters(
  orgId: number,
  params: ListLettersParams,
): Promise<{ data: GeneratedPerformanceLetter[]; total: number; page: number; perPage: number; totalPages: number }> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;

  const filters: Record<string, any> = { organization_id: orgId };
  if (params.employeeId) filters.employee_id = params.employeeId;
  if (params.type) filters.type = params.type;

  const result = await db.findMany<GeneratedPerformanceLetter>("generated_performance_letters", {
    page,
    limit: perPage,
    sort: { field: "created_at", order: "desc" },
    filters,
  });

  return {
    data: result.data,
    total: result.total,
    page: result.page,
    perPage,
    totalPages: result.totalPages,
  };
}

export async function getLetter(
  orgId: number,
  id: string,
): Promise<GeneratedPerformanceLetter> {
  const db = getDB();

  const letter = await db.findOne<GeneratedPerformanceLetter>("generated_performance_letters", {
    id,
    organization_id: orgId,
  });
  if (!letter) throw new NotFoundError("PerformanceLetter", id);

  return letter;
}

export async function sendLetter(
  orgId: number,
  letterId: string,
): Promise<GeneratedPerformanceLetter> {
  const db = getDB();

  const letter = await db.findOne<GeneratedPerformanceLetter>("generated_performance_letters", {
    id: letterId,
    organization_id: orgId,
  });
  if (!letter) throw new NotFoundError("PerformanceLetter", letterId);

  if (letter.sent_at) {
    throw new ValidationError("Letter has already been sent");
  }

  const updated = await db.update<GeneratedPerformanceLetter>(
    "generated_performance_letters",
    letterId,
    { sent_at: new Date() } as any,
  );

  logger.info(`Performance letter sent: ${letterId}`);

  return updated;
}
