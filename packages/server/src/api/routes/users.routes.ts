// ============================================================================
// USERS ROUTES
// Lookup helpers for selecting employees in pickers/dropdowns.
// Source of truth is the EmpCloud master users table (org-scoped).
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { sendSuccess } from "../../utils/response";
import { getEmpCloudDB } from "../../db/empcloud";

const router = Router();
router.use(authenticate);

// GET /users — list active employees in the caller's org
// Optional q= for substring filter on name, email, or emp_code
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const q = ((req.query.q as string) || "").trim();
    const limit = Math.min(parseInt((req.query.limit as string) || "100", 10) || 100, 500);

    const db = getEmpCloudDB();
    let query = db("users")
      .where({ organization_id: orgId, status: 1 })
      .select(
        "id",
        "first_name",
        "last_name",
        "email",
        "emp_code",
        "designation",
        "department_id",
      );

    if (q) {
      query = query.andWhere((b) =>
        b
          .where("first_name", "like", `%${q}%`)
          .orWhere("last_name", "like", `%${q}%`)
          .orWhere("email", "like", `%${q}%`)
          .orWhere("emp_code", "like", `%${q}%`),
      );
    }

    const rows = await query.orderBy("first_name", "asc").limit(limit);

    const data = rows.map((u) => ({
      id: u.id,
      first_name: u.first_name,
      last_name: u.last_name,
      full_name: `${u.first_name} ${u.last_name}`.trim(),
      email: u.email,
      emp_code: u.emp_code,
      designation: u.designation,
      department_id: u.department_id,
    }));

    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// GET /users/departments — active departments in the caller's org
router.get("/departments", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const db = getEmpCloudDB();
    const rows = await db("organization_departments")
      .where({ organization_id: orgId, is_deleted: false })
      .select("id", "name")
      .orderBy("name", "asc");
    sendSuccess(res, rows);
  } catch (err) {
    next(err);
  }
});

export { router as usersRoutes };
