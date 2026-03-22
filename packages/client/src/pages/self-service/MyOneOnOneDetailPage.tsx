import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  CheckCircle2,
  Circle,
  Loader2,
  Calendar,
  Clock,
  Save,
} from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/api/client";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

interface AgendaItem {
  id: string;
  title: string;
  description: string | null;
  is_discussed: boolean;
  order: number;
}

interface MeetingDetail {
  id: string;
  title: string;
  employee_id: number;
  manager_id: number;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  meeting_notes: string | null;
  action_items: string | null;
  agendaItems: AgendaItem[];
}

export function MyOneOnOneDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [newItemTitle, setNewItemTitle] = useState("");
  const [notes, setNotes] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["meetings", id],
    queryFn: () => apiGet<MeetingDetail>(`/meetings/${id}`),
    enabled: !!id,
  });

  const addItemMutation = useMutation({
    mutationFn: (title: string) => apiPost(`/meetings/${id}/agenda`, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings", id] });
      setNewItemTitle("");
      toast.success("Agenda item added");
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to add item"),
  });

  const completeItemMutation = useMutation({
    mutationFn: (itemId: string) => apiPost(`/meetings/agenda/${itemId}/complete`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetings", id] }),
  });

  const saveNotesMutation = useMutation({
    mutationFn: (meeting_notes: string) => apiPut(`/meetings/${id}`, { meeting_notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings", id] });
      toast.success("Notes saved");
    },
  });

  const meeting = data?.data;
  const currentNotes = notes ?? meeting?.meeting_notes ?? "";
  const isCompleted = meeting?.status === "completed";

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Meeting not found.</p>
        <Link to="/my/one-on-ones" className="mt-2 text-brand-600 underline">
          Back to meetings
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/my/one-on-ones"
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
          <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(meeting.scheduled_at)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {meeting.duration_minutes} min
            </span>
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            isCompleted ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"
          }`}
        >
          {meeting.status}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Agenda */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Agenda</h2>
          <div className="mt-4 space-y-2">
            {(meeting.agendaItems || []).map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-gray-50"
              >
                <button
                  onClick={() => {
                    if (!item.is_discussed && !isCompleted) completeItemMutation.mutate(item.id);
                  }}
                  disabled={item.is_discussed || isCompleted}
                  className="mt-0.5 flex-shrink-0"
                >
                  {item.is_discussed ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <Circle className="h-5 w-5 text-gray-300 hover:text-brand-500" />
                  )}
                </button>
                <div>
                  <p
                    className={`text-sm font-medium ${
                      item.is_discussed ? "text-gray-400 line-through" : "text-gray-900"
                    }`}
                  >
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>
                  )}
                </div>
              </div>
            ))}

            {meeting.agendaItems?.length === 0 && (
              <p className="text-sm text-gray-400 italic">No agenda items yet.</p>
            )}
          </div>

          {!isCompleted && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newItemTitle.trim()) addItemMutation.mutate(newItemTitle.trim());
              }}
              className="mt-4 flex gap-2"
            >
              <input
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                placeholder="Add agenda item..."
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button
                type="submit"
                disabled={!newItemTitle.trim() || addItemMutation.isPending}
                className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>

        {/* Notes */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Notes</h2>
          <textarea
            value={currentNotes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isCompleted}
            rows={12}
            className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
            placeholder="Meeting notes..."
          />
          {!isCompleted && (
            <button
              onClick={() => saveNotesMutation.mutate(currentNotes)}
              disabled={saveNotesMutation.isPending}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saveNotesMutation.isPending ? "Saving..." : "Save Notes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
