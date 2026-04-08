import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import knex, { Knex } from "knex";
import { v4 as uuidv4 } from "uuid";

let db: Knex;
const TEST_ORG = 88822;
const TEST_TS = Date.now();
const cleanupIds: { table: string; id: string }[] = [];
function track(table: string, id: string) { cleanupIds.push({ table, id }); }

beforeAll(async () => {
  db = knex({ client: "mysql2", connection: { host: "localhost", port: 3306, user: "empcloud", password: process.env.DB_PASSWORD || "", database: "emp_performance" }, pool: { min: 1, max: 5 } });
  await db.raw("SELECT 1");
});
afterEach(async () => { for (const item of [...cleanupIds].reverse()) { try { await db(item.table).where({ id: item.id }).del(); } catch {} } cleanupIds.length = 0; });
afterAll(async () => { await db.destroy(); });

describe("Performance Improvement Plans", () => {
  it("should create a PIP with objectives", async () => {
    const pipId = uuidv4();
    await db("performance_improvement_plans").insert({ id: pipId, organization_id: TEST_ORG, employee_id: 88830, manager_id: 88820, status: "active", reason: "Underperformance", start_date: "2026-01-15", end_date: "2026-04-15", created_by: 88820 });
    track("performance_improvement_plans", pipId);
    const objs = [
      { id: uuidv4(), pip_id: pipId, title: "Improve code quality", description: "Zero critical bugs", success_criteria: "No P1 bugs in 3 months", due_date: "2026-03-15", status: "not_started" },
      { id: uuidv4(), pip_id: pipId, title: "On-time delivery", description: "Meet sprint deadlines", success_criteria: "90% sprint completion", due_date: "2026-04-01", status: "not_started" },
    ];
    for (const o of objs) { await db("pip_objectives").insert(o); track("pip_objectives", o.id); }
    expect((await db("pip_objectives").where({ pip_id: pipId })).length).toBe(2);
  });
  it("should add PIP updates", async () => {
    const pipId = uuidv4();
    await db("performance_improvement_plans").insert({ id: pipId, organization_id: TEST_ORG, employee_id: 88831, manager_id: 88820, status: "active", reason: "Attendance issues", start_date: "2026-02-01", end_date: "2026-05-01", created_by: 88820 });
    track("performance_improvement_plans", pipId);
    for (let i = 1; i <= 3; i++) {
      const upId = uuidv4();
      await db("pip_updates").insert({ id: upId, pip_id: pipId, author_id: 88820, notes: `Week ${i} check-in`, progress_rating: i + 1 });
      track("pip_updates", upId);
    }
    const updates = await db("pip_updates").where({ pip_id: pipId });
    expect(updates).toHaveLength(3);
  });
  it("should close PIP as success", async () => {
    const pipId = uuidv4();
    await db("performance_improvement_plans").insert({ id: pipId, organization_id: TEST_ORG, employee_id: 88832, manager_id: 88820, status: "active", reason: "Test close", start_date: "2026-01-01", end_date: "2026-04-01", created_by: 88820 });
    track("performance_improvement_plans", pipId);
    await db("performance_improvement_plans").where({ id: pipId }).update({ status: "completed_success", outcome_notes: "Met all objectives" });
    expect((await db("performance_improvement_plans").where({ id: pipId }).first()).status).toBe("completed_success");
  });
  it("should extend a PIP", async () => {
    const pipId = uuidv4();
    await db("performance_improvement_plans").insert({ id: pipId, organization_id: TEST_ORG, employee_id: 88833, manager_id: 88820, status: "active", reason: "Test extend", start_date: "2026-01-01", end_date: "2026-04-01", created_by: 88820 });
    track("performance_improvement_plans", pipId);
    await db("performance_improvement_plans").where({ id: pipId }).update({ status: "extended", extended_end_date: "2026-06-01" });
    const pip = await db("performance_improvement_plans").where({ id: pipId }).first();
    expect(pip.status).toBe("extended");
    expect(pip.extended_end_date).toBeTruthy();
  });
});

describe("One-on-One Meetings", () => {
  it("should create a meeting with agenda items", async () => {
    const mtgId = uuidv4();
    await db("one_on_one_meetings").insert({ id: mtgId, organization_id: TEST_ORG, employee_id: 88834, manager_id: 88820, title: `Weekly 1:1 ${TEST_TS}`, scheduled_at: "2026-04-04 10:00:00", duration_minutes: 30, status: "scheduled" });
    track("one_on_one_meetings", mtgId);
    const agendas = [
      { id: uuidv4(), meeting_id: mtgId, title: "Project status", added_by: 88820, order: 1 },
      { id: uuidv4(), meeting_id: mtgId, title: "Career growth", added_by: 88834, order: 2 },
      { id: uuidv4(), meeting_id: mtgId, title: "Blockers", added_by: 88834, order: 3 },
    ];
    for (const a of agendas) { await db("meeting_agenda_items").insert(a); track("meeting_agenda_items", a.id); }
    expect((await db("meeting_agenda_items").where({ meeting_id: mtgId })).length).toBe(3);
  });
  it("should complete a meeting with notes", async () => {
    const mtgId = uuidv4();
    await db("one_on_one_meetings").insert({ id: mtgId, organization_id: TEST_ORG, employee_id: 88835, manager_id: 88820, title: `Sync ${TEST_TS}`, scheduled_at: "2026-04-04 14:00:00", duration_minutes: 45, status: "scheduled" });
    track("one_on_one_meetings", mtgId);
    await db("one_on_one_meetings").where({ id: mtgId }).update({ status: "completed", meeting_notes: "Discussed Q2 goals", action_items: "Update OKRs by Friday" });
    const mtg = await db("one_on_one_meetings").where({ id: mtgId }).first();
    expect(mtg.status).toBe("completed");
    expect(mtg.meeting_notes).toContain("Q2 goals");
  });
  it("should mark agenda items as discussed", async () => {
    const mtgId = uuidv4();
    await db("one_on_one_meetings").insert({ id: mtgId, organization_id: TEST_ORG, employee_id: 88836, manager_id: 88820, title: `Discuss ${TEST_TS}`, scheduled_at: "2026-04-05 10:00:00", status: "scheduled" });
    track("one_on_one_meetings", mtgId);
    const agId = uuidv4();
    await db("meeting_agenda_items").insert({ id: agId, meeting_id: mtgId, title: "Review prep", added_by: 88820, is_discussed: false });
    track("meeting_agenda_items", agId);
    await db("meeting_agenda_items").where({ id: agId }).update({ is_discussed: true });
    expect((await db("meeting_agenda_items").where({ id: agId }).first()).is_discussed).toBe(1);
  });
});

describe("Succession Plans", () => {
  it("should create a succession plan with candidates", async () => {
    const planId = uuidv4();
    await db("succession_plans").insert({ id: planId, organization_id: TEST_ORG, position_title: "Engineering Manager", current_holder_id: 88820, department: "Engineering", criticality: "high", status: "identified" });
    track("succession_plans", planId);
    const candidates = [
      { id: uuidv4(), plan_id: planId, employee_id: 88837, readiness: "ready_now", development_notes: "Strong leadership" },
      { id: uuidv4(), plan_id: planId, employee_id: 88838, readiness: "1_2_years", development_notes: "Needs training" },
    ];
    for (const c of candidates) { await db("succession_candidates").insert(c); track("succession_candidates", c.id); }
    expect((await db("succession_candidates").where({ plan_id: planId })).length).toBe(2);
  });
});

describe("Competency Frameworks", () => {
  it("should create a framework with competencies", async () => {
    const fwId = uuidv4();
    await db("competency_frameworks").insert({ id: fwId, organization_id: TEST_ORG, name: `Engineering-${TEST_TS}`, description: "Core skills", is_active: true, created_by: 88820 });
    track("competency_frameworks", fwId);
    const competencies = [
      { id: uuidv4(), framework_id: fwId, name: "Problem Solving", category: "technical", weight: 2.0, order: 1 },
      { id: uuidv4(), framework_id: fwId, name: "Code Quality", category: "technical", weight: 1.5, order: 2 },
      { id: uuidv4(), framework_id: fwId, name: "Collaboration", category: "soft_skills", weight: 1.0, order: 3 },
    ];
    for (const c of competencies) { await db("competencies").insert(c); track("competencies", c.id); }
    const comps = await db("competencies").where({ framework_id: fwId }).orderBy("order");
    expect(comps).toHaveLength(3);
    expect(comps[0].name).toBe("Problem Solving");
  });
  it("should soft-delete a framework", async () => {
    const fwId = uuidv4();
    await db("competency_frameworks").insert({ id: fwId, organization_id: TEST_ORG, name: `Deprecated-${TEST_TS}`, is_active: true, created_by: 88820 });
    track("competency_frameworks", fwId);
    await db("competency_frameworks").where({ id: fwId }).update({ deleted_at: new Date() });
    expect((await db("competency_frameworks").where({ id: fwId }).first()).deleted_at).toBeTruthy();
  });
});

describe("Performance Letters", () => {
  it("should create a letter template", async () => {
    const tmplId = uuidv4();
    await db("performance_letter_templates").insert({ id: tmplId, organization_id: TEST_ORG, name: `Appraisal-${TEST_TS}`, type: "appraisal", content_template: "Dear {{name}}, Your rating is {{rating}}." });
    track("performance_letter_templates", tmplId);
    const tmpl = await db("performance_letter_templates").where({ id: tmplId }).first();
    expect(tmpl.type).toBe("appraisal");
    expect(tmpl.content_template).toContain("{{name}}");
  });
  it("should generate a letter for an employee", async () => {
    const tmplId = uuidv4();
    await db("performance_letter_templates").insert({ id: tmplId, organization_id: TEST_ORG, name: `Warning Letter-${TEST_TS}`, type: "warning", content_template: "Warning for {{name}}." });
    track("performance_letter_templates", tmplId);
    const letterId = uuidv4();
    await db("generated_performance_letters").insert({ id: letterId, organization_id: TEST_ORG, template_id: tmplId, employee_id: 88839, type: "warning", content: "Warning for John Doe.", generated_by: 88820 });
    track("generated_performance_letters", letterId);
    const letter = await db("generated_performance_letters").where({ id: letterId }).first();
    expect(letter.content).toContain("John Doe");
  });
});

describe("Career Paths", () => {
  it("should create a career path with levels", async () => {
    const pathId = uuidv4();
    await db("career_paths").insert({ id: pathId, organization_id: TEST_ORG, name: `SWE Track-${TEST_TS}`, description: "IC track", department: "Engineering", is_active: true, created_by: 88820 });
    track("career_paths", pathId);
    const levels = [
      { id: uuidv4(), career_path_id: pathId, title: "SDE I", level: 1, min_years_experience: 0 },
      { id: uuidv4(), career_path_id: pathId, title: "SDE II", level: 2, min_years_experience: 2 },
      { id: uuidv4(), career_path_id: pathId, title: "Senior SDE", level: 3, min_years_experience: 5 },
      { id: uuidv4(), career_path_id: pathId, title: "Staff SDE", level: 4, min_years_experience: 8 },
    ];
    for (const l of levels) { await db("career_path_levels").insert(l); track("career_path_levels", l.id); }
    const dbLevels = await db("career_path_levels").where({ career_path_id: pathId }).orderBy("level");
    expect(dbLevels).toHaveLength(4);
    expect(dbLevels[0].title).toBe("SDE I");
    expect(dbLevels[3].title).toBe("Staff SDE");
  });
  it("should assign employee to career track", async () => {
    const pathId = uuidv4();
    await db("career_paths").insert({ id: pathId, organization_id: TEST_ORG, name: `PM Track-${TEST_TS}`, is_active: true, created_by: 88820 });
    track("career_paths", pathId);
    const l1Id = uuidv4(), l2Id = uuidv4();
    await db("career_path_levels").insert({ id: l1Id, career_path_id: pathId, title: "PM I", level: 1 });
    await db("career_path_levels").insert({ id: l2Id, career_path_id: pathId, title: "PM II", level: 2 });
    track("career_path_levels", l1Id); track("career_path_levels", l2Id);
    const trackId = uuidv4();
    await db("employee_career_tracks").insert({ id: trackId, employee_id: 88840, career_path_id: pathId, current_level_id: l1Id, target_level_id: l2Id, notes: "Targeting PM II by 2027" });
    track("employee_career_tracks", trackId);
    const et = await db("employee_career_tracks").where({ id: trackId }).first();
    expect(et.current_level_id).toBe(l1Id);
    expect(et.target_level_id).toBe(l2Id);
  });
});

describe("Manager Effectiveness", () => {
  it("should store manager effectiveness scores", async () => {
    const id = uuidv4();
    await db("manager_effectiveness_scores").insert({ id, organization_id: TEST_ORG, manager_user_id: 88820, period: "2026-Q1", overall_score: 4.2, team_performance_score: 4.0, review_quality_score: 4.5, engagement_score: 3.8, team_size: 8, avg_team_rating: 3.7, reviews_completed_on_time_pct: 95.0, one_on_one_frequency: 4.0, goal_completion_rate: 85.0, feedback_given_count: 24 });
    track("manager_effectiveness_scores", id);
    const score = await db("manager_effectiveness_scores").where({ id }).first();
    expect(Number(score.overall_score)).toBe(4.2);
    expect(score.team_size).toBe(8);
  });
});

describe("Notification Settings", () => {
  it("should create and update notification settings", async () => {
    const id = uuidv4();
    await db("notification_settings").insert({ id, organization_id: TEST_ORG, review_reminders_enabled: true, pip_reminders_enabled: true, meeting_reminders_enabled: true, goal_reminders_enabled: true, reminder_days_before_deadline: 5, rating_scale: 5 });
    track("notification_settings", id);
    await db("notification_settings").where({ id }).update({ reminder_days_before_deadline: 3, rating_scale: 10 });
    const settings = await db("notification_settings").where({ id }).first();
    expect(settings.reminder_days_before_deadline).toBe(3);
    expect(settings.rating_scale).toBe(10);
  });
});

describe("Continuous Feedback", () => {
  it("should create feedback entries", async () => {
    for (let i = 0; i < 3; i++) {
      const id = uuidv4();
      await db("continuous_feedback").insert({ id, organization_id: TEST_ORG, from_user_id: 88820, to_user_id: 88841 + i, type: ["praise", "suggestion", "concern"][i], message: `Feedback ${i + 1} ${TEST_TS}`, visibility: i === 0 ? "public" : "manager_visible" });
      track("continuous_feedback", id);
    }
    const feedback = await db("continuous_feedback").where({ organization_id: TEST_ORG, from_user_id: 88820 });
    expect(feedback.length).toBeGreaterThanOrEqual(3);
    expect(feedback.map((f: any) => f.type)).toContain("praise");
  });
});
