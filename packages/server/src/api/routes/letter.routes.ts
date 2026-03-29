// ============================================================================
// PERFORMANCE LETTER ROUTES
// CRUD for templates, letter generation, listing, download, and sending.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import { paginationSchema, idParamSchema } from "@emp-performance/shared";
import * as letterService from "../../services/letter/performance-letter.service";

const router = Router();
router.use(authenticate);

// ---------------------------------------------------------------------------
// SELF-SERVICE (employee access — before admin-only middleware)
// ---------------------------------------------------------------------------

// GET /letters/my — list letters addressed to the current user
router.get("/my", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const employeeId = req.user!.empcloudUserId;
    const pagination = paginationSchema.parse(req.query);
    const result = await letterService.listLetters(orgId, {
      employeeId,
      type: req.query.type as letterService.LetterType | undefined,
      page: pagination.page,
      perPage: pagination.perPage,
    });
    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// ADMIN-ONLY routes below this line
// ---------------------------------------------------------------------------
router.use(authorize("hr_admin", "hr_manager", "org_admin"));

// ---------------------------------------------------------------------------
// TEMPLATES
// ---------------------------------------------------------------------------

// GET /letters/templates — list templates
router.get("/templates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const type = req.query.type as letterService.LetterType | undefined;
    const result = await letterService.listTemplates(orgId, type);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /letters/templates — create template
router.post("/templates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { type, name, content_template, is_default } = req.body;
    if (!type || !name || !content_template) {
      throw new ValidationError("type, name, and content_template are required");
    }
    const result = await letterService.createTemplate(orgId, {
      type,
      name,
      content_template,
      is_default,
    });
    return sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// GET /letters/templates/:id — get template
router.get("/templates/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const result = await letterService.getTemplate(orgId, id);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// PUT /letters/templates/:id — update template
router.put("/templates/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const result = await letterService.updateTemplate(orgId, id, req.body);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// DELETE /letters/templates/:id — delete template
router.delete("/templates/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    await letterService.deleteTemplate(orgId, id);
    return sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GENERATED LETTERS
// ---------------------------------------------------------------------------

// POST /letters/generate — generate a letter
router.post("/generate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { employee_id, template_id, cycle_id } = req.body;
    if (!employee_id || !template_id) {
      throw new ValidationError("employee_id and template_id are required");
    }
    const result = await letterService.generateLetter(
      orgId,
      Number(employee_id),
      template_id,
      cycle_id ?? null,
      req.user!.empcloudUserId,
    );
    return sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// GET /letters — list generated letters
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const pagination = paginationSchema.parse(req.query);
    const result = await letterService.listLetters(orgId, {
      employeeId: req.query.employeeId ? Number(req.query.employeeId) : undefined,
      type: req.query.type as letterService.LetterType | undefined,
      page: pagination.page,
      perPage: pagination.perPage,
    });
    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

// GET /letters/:id — get letter detail / download content
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const result = await letterService.getLetter(orgId, id);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /letters/:id/send — mark letter as sent
router.post("/:id/send", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const result = await letterService.sendLetter(orgId, id);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

export { router as letterRoutes };
