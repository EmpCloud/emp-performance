import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  MessageSquare,
  Plus,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import type {
  PerformanceImprovementPlan,
  PIPObjective,
  PIPUpdate,
  PaginatedResponse,
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

const OBJ_STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Met",
  at_risk: "At Risk",
  cancelled: "Not Met",
};

interface PIPFull extends PerformanceImprovementPlan {
  objectives: PIPObjective[];
  updates: PIPUpdate[];
}

export function MyPIPPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [showAddUpdate, setShowAddUpdate] = useState(false);
  const [updateNotes, setUpdateNotes] = useState("");
  const [updateRating, setUpdateRating] = useState<number | undefined>();

  // Find the user's active PIP
  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ["my-pips", user?.empcloudUserId],
    queryFn: () =>
      apiGet<PaginatedResponse<PerformanceImprovementPlan>>("/pips", {
        employeeId: user?.empcloudUserId,
        status: "active",
        perPage: 1,
      }),
    enabled: !!user,
  });

  const activePipId = listData?.data?.data?.[0]?.id;

  // Also check for extended
  const { data: extendedData } = useQuery({
    queryKey: ["my-pips-extended", user?.empcloudUserId],
    queryFn: () =>
      apiGet<PaginatedResponse<PerformanceImprovementPlan>>("/pips", {
        employeeId: user?.empcloudUserId,
        status: "extended",
        perPage: 1,
      }),
    enabled: !!user && !activePipId,
  });

  const pipId = activePipId || extendedData?.data?.data?.[0]?.id;

  const { data: pipData, isLoading: pipLoading } = useQuery({
    queryKey: ["my-pip-detail", pipId],
    queryFn: () => apiGet<PIPFull>(`/pips/${pipId}`),
    enabled: !!pipId,
  });

  const pip = pipData?.data;

  const addUpdateMutation = useMutation({
    mutationFn: (body: any) => apiPost(`/pips/${pipId}/updates`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-pip-detail", pipId] });
      setShowAddUpdate(false);
      setUpdateNotes("");
      setUpdateRating(undefined);
    },
  });

  if (listLoading || pipLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  // No active PIP
  if (!pipId || !pip) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My PIP</h1>
        <p className="mt-1 text-sm text-gray-500">Performance Improvement Plan status.</p>

        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-12 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-green-400" />
          <p className="mt-3 text-sm font-medium text-gray-700">
            No active performance improvement plan
          </p>
          <p className="mt-1 text-sm text-gray-500">
            You currently do not have an active PIP. Keep up the good work!
          </p>
        </div>
      </div>
    );
  }

  const objectivesMet = pip.objectives.filter((o) => o.status === "completed").length;
  const effectiveEndDate = pip.extended_end_date || pip.end_date;
  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (new Date(effectiveEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    ),
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My PIP</h1>
          <p className="mt-1 text-sm text-gray-500">
            Your performance improvement plan details and progress.
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
            STATUS_COLORS[pip.status],
          )}
        >
          {STATUS_LABELS[pip.status]}
        </span>
      </div>

      {/* Info Card */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
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
              {formatDate(effectiveEndDate)}
              {pip.extended_end_date && (
                <span className="ml-1 text-xs text-amber-600">(extended)</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Days Remaining
            </p>
            <p
              className={cn(
                "mt-1 text-sm font-semibold",
                daysRemaining <= 7 ? "text-red-600" : "text-gray-900",
              )}
            >
              {daysRemaining} days
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Objectives Met
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {objectivesMet}/{pip.objectives.length}
            </p>
          </div>
        </div>
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Reason
          </p>
          <p className="mt-1 text-sm text-gray-700">{pip.reason}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Objectives */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Objectives</h2>
            </div>

            {pip.objectives.length === 0 && (
              <div className="p-8 text-center">
                <p className="text-sm text-gray-500">No objectives defined yet.</p>
              </div>
            )}

            <div className="divide-y divide-gray-100">
              {pip.objectives.map((obj) => (
                <div key={obj.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {OBJ_STATUS_ICON[obj.status] ?? OBJ_STATUS_ICON.not_started}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">{obj.title}</p>
                        <span className="text-xs text-gray-500">
                          {OBJ_STATUS_LABELS[obj.status] ?? obj.status}
                        </span>
                      </div>
                      {obj.description && (
                        <p className="mt-1 text-xs text-gray-500">{obj.description}</p>
                      )}
                      {obj.success_criteria && (
                        <p className="mt-1 text-xs text-gray-400">
                          Success criteria: {obj.success_criteria}
                        </p>
                      )}
                      {obj.due_date && (
                        <p className="mt-1 text-xs text-gray-400">
                          Due: {formatDate(obj.due_date)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Updates / Responses */}
        <div>
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Updates</h2>
              <button
                onClick={() => setShowAddUpdate(true)}
                className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Response
              </button>
            </div>

            {showAddUpdate && (
              <div className="border-b border-gray-200 px-5 py-4 bg-gray-50">
                <div className="space-y-3">
                  <textarea
                    placeholder="Share your progress, ask questions, or respond to feedback..."
                    value={updateNotes}
                    onChange={(e) => setUpdateNotes(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Self-assessment rating (optional, 1-5)
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
                      {addUpdateMutation.isPending ? "Submitting..." : "Submit"}
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
                    {update.author_id === user?.empcloudUserId && (
                      <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                        You
                      </span>
                    )}
                    {update.progress_rating && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                        {update.progress_rating}/5
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
    </div>
  );
}
