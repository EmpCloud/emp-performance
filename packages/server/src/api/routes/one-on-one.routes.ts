// ============================================================================
// ONE-ON-ONE MEETING ROUTES
// CRUD for meetings, agenda items, and meeting completion.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware";
import * as meetingService from "../../services/one-on-one/one-on-one.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";

const router = Router();
router.use(authenticate);

// GET /meetings
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await meetingService.listMeetings(orgId, {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      managerId: req.query.managerId ? parseInt(req.query.managerId as string) : undefined,
      employeeId: req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined,
      status: req.query.status as string | undefined,
    });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /meetings/:id
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await meetingService.getMeeting(orgId, req.params.id as string);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /meetings
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { employee_id, manager_id, title, scheduled_at, duration_minutes } = req.body;
    if (!employee_id || !manager_id || !title || !scheduled_at) {
      throw new ValidationError("employee_id, manager_id, title, and scheduled_at are required");
    }
    const result = await meetingService.createMeeting(orgId, {
      employee_id,
      manager_id,
      title,
      scheduled_at,
      duration_minutes,
    });
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// PUT /meetings/:id
router.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await meetingService.updateMeeting(orgId, req.params.id as string, req.body);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /meetings/:id/complete
router.post("/:id/complete", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await meetingService.completeMeeting(orgId, req.params.id as string);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Agenda Items
// ---------------------------------------------------------------------------

// POST /meetings/:meetingId/agenda (also aliased as /:meetingId/agenda-items)
const agendaHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { title, description, order } = req.body;
    if (!title) throw new ValidationError("Title is required");
    const result = await meetingService.addAgendaItem(orgId, req.params.meetingId as string, {
      title,
      description,
      added_by: req.user!.empcloudUserId,
      order,
    });
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
};
router.post("/:meetingId/agenda", agendaHandler);
router.post("/:meetingId/agenda-items", agendaHandler);

// PUT /meetings/agenda/:itemId
router.put("/agenda/:itemId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await meetingService.updateAgendaItem(orgId, req.params.itemId as string, req.body);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /meetings/agenda/:itemId/complete
router.post("/agenda/:itemId/complete", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await meetingService.completeAgendaItem(orgId, req.params.itemId as string);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

export { router as oneOnOneRoutes };
