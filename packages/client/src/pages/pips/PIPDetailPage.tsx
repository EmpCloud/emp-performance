import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  MessageSquare,
  Plus,
  XCircle,
  AlertTriangle,
  CalendarPlus,
} from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/api/client";
import { cn, formatDate } from "@/lib/utils";
import type {
  PerformanceImprovementPlan,
  PIPObjective,
  PIPUpdate,
  GoalStatus,
} from "@emp-performance/shared";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-blue-100 text-blue-700",
  extended: "bg-amber-100 text-amber-700",
  completed_success: "bg-green-100 text-green-700",
  completed_failure: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  extended: "Extended",
  completed_success: "Completed (Success)",
  completed_failure: "Completed (Failure)",
  cancelled: "Cancelled",
};

const OBJ_STATUS_ICON: Record<string, React.ReactNode> = {
  not_started: <Circle className="h-4 w-4 text-gray-400" />,
  in_progress: <Clock className="h-4 w-4 text-blue-500" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  at_risk: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  cancelled: <XCircle className="h-4 w-4 text-red-400" />,
};

const OBJ_STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Met" },
  { value: "cancelled", label: "Not Met" },
];

interface PIPFull extends PerformanceImprovementPlan {
  objectives: PIPObjective[];
  updates: PIPUpdate[];
}

export function PIPDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showAddObjective, setShowAddObjective] = useState(false);
  const [showAddUpdate, setShowAddUpdate] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showExtend, setShowExtend] = useState(false);

  // Form state
  const [objTitle, setObjTitle] = useState("");
  const [objDescription, setObjDescription] = useState("");
  const [objCriteria, setObjCriteria] = useState("");
  const [objDueDate, setObjDueDate] = useState("");

  const [updateNotes, setUpdateNotes] = useState("");
  const [updateRating, setUpdateRating] = useState<number | undefined>();

  const [closeOutcome, setCloseOutcome] = useState<string>("completed_success");
  const [closeNotes, setCloseNotes] = useState("");

  const [extendDate, setExtendDate] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["pip", id],
    queryFn: () => apiGet<PIPFull>(`/pips/${id}`),
    enabled: !!id,
  });

  const pip = data?.data;
  const isActive = pip && ["active", "extended"].includes(pip.status);

  // Mutations
  const addObjectiveMutation = useMutation({
    mutationFn: (body: any) => apiPost(`/pips/${id}/objectives`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pip", id] });
      setShowAddObjective(false);
      setObjTitle("");
      setObjDescription("");
      setObjCriteria("");
      setObjDueDate("");
    },
  });

  const updateObjectiveMutation = useMutation({
    mutationFn: ({ objId, body }: { objId: string; body: any }) =>
      apiPut(`/pips/${id}/objectives/${objId}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pip", id] }),
  });

  const addUpdateMutation = useMutation({
    mutationFn: (body: any) => apiPost(`/pips/${id}/updates`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pip", id] });
      setShowAddUpdate(false);
      setUpdateNotes("");
      setUpdateRating(undefined);
    },
  });

  const closeMutation = useMutation({
    mutationFn: (body: any) => apiPost(`/pips/${id}/close`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pip", id] });
      setShowClose(false);
    },
  });

  const extendMutation = useMutation({
    mutationFn: (body: any) => apiPost(`/pips/${id}/extend`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pip", id] });
      setShowExtend(false);
      setExtendDate("");
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !pip) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-600">Failed to load PIP details.</p>
        <Link to="/pips" className="mt-2 text-sm text-brand-600 hover:underline">
          Back to PIPs
        </Link>
      </div>
    );
  }

  const objectivesMet = pip.objectives.filter((o) => o.status === "completed").length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/pips" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              PIP - Employee #{pip.employee_id}
            </h1>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                STATUS_COLORS[pip.status],
              )}
            >
              {STATUS_LABELS[pip.status]}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{pip.reason}</p>
        </div>
        {isActive && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowExtend(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <CalendarPlus className="h-4 w-4" />
              Extend
            </button>
            <button
              onClick={() => setShowClose(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Close PIP
            </button>
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Start Date
            </p>
            <p className="mt-1 text-sm text-gray-900">{formatDate(pip.start_date)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              End Date
            </p>
            <p className="mt-1 text-sm text-gray-900">
              {pip.extended_end_date
                ? formatDate(pip.extended_end_date)
                : formatDate(pip.end_date)}
              {pip.extended_end_date && (
                <span className="ml-1 text-xs text-amber-600">(extended)</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Manager
            </p>
            <p className="mt-1 text-sm text-gray-900">#{pip.manager_id}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Objectives Progress
            </p>
            <p className="mt-1 text-sm text-gray-900">
              {objectivesMet}/{pip.objectives.length} met
            </p>
          </div>
        </div>
        {pip.outcome_notes && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Outcome Notes
            </p>
            <p className="mt-1 text-sm text-gray-700">{pip.outcome_notes}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Objectives */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Objectives</h2>
              {isActive && (
                <button
                  onClick={() => setShowAddObjective(true)}
                  className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              )}
            </div>

            {pip.objectives.length === 0 && !showAddObjective && (
              <div className="p-8 text-center">
                <p className="text-sm text-gray-500">No objectives defined yet.</p>
              </div>
            )}

            <div className="divide-y divide-gray-100">
              {pip.objectives.map((obj) => (
                <div key={obj.id} className="px-5 py-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {OBJ_STATUS_ICON[obj.status] ?? OBJ_STATUS_ICON.not_started}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{obj.title}</p>
                      {obj.description && (
                        <p className="mt-0.5 text-xs text-gray-500">{obj.description}</p>
                      )}
                      {obj.success_criteria && (
                        <p className="mt-1 text-xs text-gray-400">
                          Success: {obj.success_criteria}
                        </p>
                      )}
                      {obj.due_date && (
                        <p className="mt-1 text-xs text-gray-400">
                          Due: {formatDate(obj.due_date)}
                        </p>
                      )}
                    </div>
                    {isActive && (
                      <select
                        value={obj.status}
                        onChange={(e) =>
                          updateObjectiveMutation.mutate({
                            objId: obj.id,
                            body: { status: e.target.value },
                          })
                        }
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:border-brand-500 focus:outline-none"
                      >
                        {OBJ_STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Objective Form */}
            {showAddObjective && (
              <div className="border-t border-gray-200 px-5 py-4 bg-gray-50">
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Objective title"
                    value={objTitle}
                    onChange={(e) => setObjTitle(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <textarea
                    placeholder="Description (optional)"
                    value={objDescription}
                    onChange={(e) => setObjDescription(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <input
                    type="text"
                    placeholder="Success criteria (optional)"
                    value={objCriteria}
                    onChange={(e) => setObjCriteria(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <input
                    type="date"
                    value={objDueDate}
                    onChange={(e) => setObjDueDate(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        addObjectiveMutation.mutate({
                          title: objTitle,
                          description: objDescription || undefined,
                          success_criteria: objCriteria || undefined,
                          due_date: objDueDate || undefined,
                        })
                      }
                      disabled={!objTitle.trim() || addObjectiveMutation.isPending}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {addObjectiveMutation.isPending ? "Adding..." : "Add Objective"}
                    </button>
                    <button
                      onClick={() => setShowAddObjective(false)}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Updates Timeline */}
        <div>
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Updates</h2>
              {isActive && (
                <button
                  onClick={() => setShowAddUpdate(true)}
                  className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              )}
            </div>

            {showAddUpdate && (
              <div className="border-b border-gray-200 px-5 py-4 bg-gray-50">
                <div className="space-y-3">
                  <textarea
                    placeholder="Add an update or note..."
                    value={updateNotes}
                    onChange={(e) => setUpdateNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Progress Rating (optional, 1-5)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={updateRating ?? ""}
                      onChange={(e) =>
                        setUpdateRating(e.target.value ? Number(e.target.value) : undefined)
                      }
                      className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        addUpdateMutation.mutate({
                          notes: updateNotes,
                          progress_rating: updateRating,
                        })
                      }
                      disabled={!updateNotes.trim() || addUpdateMutation.isPending}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {addUpdateMutation.isPending ? "Saving..." : "Add Update"}
                    </button>
                    <button
                      onClick={() => setShowAddUpdate(false)}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {pip.updates.length === 0 && !showAddUpdate && (
              <div className="p-8 text-center">
                <MessageSquare className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">No updates yet.</p>
              </div>
            )}

            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {pip.updates.map((update) => (
                <div key={update.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Calendar className="h-3 w-3" />
                    {formatDate(update.created_at)}
                    {update.progress_rating && (
                      <span className="ml-auto rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                        Rating: {update.progress_rating}/5
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{update.notes}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Close PIP Modal */}
      {showClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Close PIP</h3>
            <p className="mt-1 text-sm text-gray-500">
              Select the outcome for this performance improvement plan.
            </p>
            <div className="mt-4 space-y-3">
              <select
                value={closeOutcome}
                onChange={(e) => setCloseOutcome(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="completed_success">Completed (Success)</option>
                <option value="completed_failure">Completed (Failure)</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <textarea
                placeholder="Outcome notes (optional)"
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowClose(false)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    closeMutation.mutate({
                      status: closeOutcome,
                      outcome_notes: closeNotes || undefined,
                    })
                  }
                  disabled={closeMutation.isPending}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {closeMutation.isPending ? "Closing..." : "Close PIP"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Extend PIP Modal */}
      {showExtend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Extend PIP</h3>
            <p className="mt-1 text-sm text-gray-500">Set a new end date for this PIP.</p>
            <div className="mt-4 space-y-3">
              <input
                type="date"
                value={extendDate}
                onChange={(e) => setExtendDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowExtend(false)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    extendMutation.mutate({ end_date: extendDate })
                  }
                  disabled={!extendDate || extendMutation.isPending}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {extendMutation.isPending ? "Extending..." : "Extend"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
