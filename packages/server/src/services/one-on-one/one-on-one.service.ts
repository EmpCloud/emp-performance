// ============================================================================
// ONE-ON-ONE MEETING SERVICE
// Manages 1-on-1 meetings, agenda items, and meeting lifecycle.
// ============================================================================

import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Meeting {
  id: string;
  organization_id: number;
  employee_id: number;
  manager_id: number;
  title: string;
  scheduled_at: Date;
  duration_minutes: number;
  status: string;
  meeting_notes: string | null;
  action_items: string | null;
  created_at: Date;
  updated_at: Date;
}

interface AgendaItem {
  id: string;
  meeting_id: string;
  title: string;
  description: string | null;
  added_by: number;
  order: number;
  is_discussed: boolean;
  created_at: Date;
}

interface CreateMeetingData {
  employee_id: number;
  manager_id: number;
  title: string;
  scheduled_at: string;
  duration_minutes?: number;
}

interface UpdateMeetingData {
  title?: string;
  scheduled_at?: string;
  duration_minutes?: number;
  meeting_notes?: string;
  action_items?: string;
}

interface ListMeetingsParams {
  page?: number;
  limit?: number;
  managerId?: number;
  employeeId?: number;
  status?: string;
}

interface CreateAgendaItemData {
  title: string;
  description?: string;
  added_by: number;
  order?: number;
}

interface UpdateAgendaItemData {
  title?: string;
  description?: string;
  order?: number;
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

export async function createMeeting(orgId: number, data: CreateMeetingData): Promise<Meeting> {
  const db = getDB();
  const meeting = await db.create<Meeting>("one_on_one_meetings", {
    organization_id: orgId,
    employee_id: data.employee_id,
    manager_id: data.manager_id,
    title: data.title,
    scheduled_at: new Date(data.scheduled_at),
    duration_minutes: data.duration_minutes || 30,
    status: "scheduled",
  });
  logger.info(`1-on-1 meeting created: ${meeting.title} (org: ${orgId})`);
  return meeting;
}

export async function listMeetings(orgId: number, params?: ListMeetingsParams) {
  const db = getDB();
  const filters: Record<string, any> = { organization_id: orgId };

  if (params?.managerId) filters.manager_id = params.managerId;
  if (params?.employeeId) filters.employee_id = params.employeeId;
  if (params?.status) filters.status = params.status;

  return db.findMany<Meeting>("one_on_one_meetings", {
    page: params?.page || 1,
    limit: params?.limit || 20,
    filters,
    sort: { field: "scheduled_at", order: "desc" },
  });
}

export async function getMeeting(orgId: number, id: string) {
  const db = getDB();
  const meeting = await db.findOne<Meeting>("one_on_one_meetings", {
    id,
    organization_id: orgId,
  });
  if (!meeting) {
    throw new NotFoundError("Meeting", id);
  }

  const agendaItems = await db.findMany<AgendaItem>("meeting_agenda_items", {
    filters: { meeting_id: id },
    sort: { field: "order", order: "asc" },
    limit: 100,
  });

  return { ...meeting, agendaItems: agendaItems.data };
}

export async function updateMeeting(
  orgId: number,
  id: string,
  data: UpdateMeetingData,
): Promise<Meeting> {
  const db = getDB();
  const existing = await db.findOne<Meeting>("one_on_one_meetings", {
    id,
    organization_id: orgId,
  });
  if (!existing) {
    throw new NotFoundError("Meeting", id);
  }

  const updateData: Record<string, any> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.scheduled_at !== undefined) updateData.scheduled_at = new Date(data.scheduled_at);
  if (data.duration_minutes !== undefined) updateData.duration_minutes = data.duration_minutes;
  if (data.meeting_notes !== undefined) updateData.meeting_notes = data.meeting_notes;
  if (data.action_items !== undefined) updateData.action_items = data.action_items;

  return db.update<Meeting>("one_on_one_meetings", id, updateData);
}

export async function completeMeeting(orgId: number, id: string): Promise<Meeting> {
  const db = getDB();
  const existing = await db.findOne<Meeting>("one_on_one_meetings", {
    id,
    organization_id: orgId,
  });
  if (!existing) {
    throw new NotFoundError("Meeting", id);
  }

  if (existing.status === "completed") {
    throw new ValidationError("Meeting is already completed");
  }

  logger.info(`1-on-1 meeting completed: ${id} (org: ${orgId})`);
  return db.update<Meeting>("one_on_one_meetings", id, { status: "completed" });
}

// ---------------------------------------------------------------------------
// Agenda Items
// ---------------------------------------------------------------------------

export async function addAgendaItem(
  orgId: number,
  meetingId: string,
  data: CreateAgendaItemData,
): Promise<AgendaItem> {
  const db = getDB();
  // Verify meeting belongs to org
  const meeting = await db.findOne<Meeting>("one_on_one_meetings", {
    id: meetingId,
    organization_id: orgId,
  });
  if (!meeting) {
    throw new NotFoundError("Meeting", meetingId);
  }

  return db.create<AgendaItem>("meeting_agenda_items", {
    meeting_id: meetingId,
    title: data.title,
    description: data.description || null,
    added_by: data.added_by,
    order: data.order ?? 0,
    is_discussed: false,
  });
}

export async function updateAgendaItem(
  orgId: number,
  itemId: string,
  data: UpdateAgendaItemData,
): Promise<AgendaItem> {
  const db = getDB();
  const item = await db.findById<AgendaItem>("meeting_agenda_items", itemId);
  if (!item) {
    throw new NotFoundError("Agenda item", itemId);
  }

  // Verify meeting belongs to org
  const meeting = await db.findOne<Meeting>("one_on_one_meetings", {
    id: item.meeting_id,
    organization_id: orgId,
  });
  if (!meeting) {
    throw new NotFoundError("Meeting", item.meeting_id);
  }

  return db.update<AgendaItem>("meeting_agenda_items", itemId, data);
}

export async function completeAgendaItem(orgId: number, itemId: string): Promise<AgendaItem> {
  const db = getDB();
  const item = await db.findById<AgendaItem>("meeting_agenda_items", itemId);
  if (!item) {
    throw new NotFoundError("Agenda item", itemId);
  }

  const meeting = await db.findOne<Meeting>("one_on_one_meetings", {
    id: item.meeting_id,
    organization_id: orgId,
  });
  if (!meeting) {
    throw new NotFoundError("Meeting", item.meeting_id);
  }

  return db.update<AgendaItem>("meeting_agenda_items", itemId, { is_discussed: true });
}
