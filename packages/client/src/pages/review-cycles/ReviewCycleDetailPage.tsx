import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Play,
  CheckCircle,
  Users,
  BarChart3,
  Settings,
  UserPlus,
  Trash2,
  Calendar,
} from "lucide-react";
import { apiGet, apiPost, apiDelete } from "@/api/client";
import type {
  ReviewCycle,
  ReviewCycleParticipant,
  RatingDistribution,
} from "@emp-performance/shared";
import { formatDate } from "@/lib/utils";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-700",
  in_review: "bg-blue-100 text-blue-700",
  calibration: "bg-purple-100 text-purple-700",
  completed: "bg-indigo-100 text-indigo-700",
  cancelled: "bg-red-100 text-red-700",
};

type CycleDetail = ReviewCycle & {
  participant_count: number;
  stats: { pending: number; submitted: number; draft: number };
};

const TABS = ["participants", "ratings", "settings"] as const;
type Tab = (typeof TABS)[number];

export function ReviewCycleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("participants");
  const [addEmployeeId, setAddEmployeeId] = useState("");
  const [addManagerId, setAddManagerId] = useState("");

  const { data: cycleData, isLoading } = useQuery({
    queryKey: ["review-cycle", id],
    queryFn: () => apiGet<CycleDetail>(`/review-cycles/${id}`),
    enabled: Boolean(id),
  });

  const { data: participantsData } = useQuery({
    queryKey: ["review-cycle-participants", id],
    queryFn: () => apiGet<ReviewCycleParticipant[]>(`/review-cycles/${id}/participants`),
    enabled: Boolean(id) && activeTab === "participants",
  });

  const { data: distributionData } = useQuery({
    queryKey: ["review-cycle-distribution", id],
    queryFn: () => apiGet<RatingDistribution[]>(`/review-cycles/${id}/ratings-distribution`),
    enabled: Boolean(id) && activeTab === "ratings",
  });

  const cycle = cycleData?.data;
  const participants = participantsData?.data ?? [];
  const distribution = distributionData?.data ?? [];

  const launchMutation = useMutation({
    mutationFn: () => apiPost(`/review-cycles/${id}/launch`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["review-cycle", id] }),
  });

  const closeMutation = useMutation({
    mutationFn: () => apiPost(`/review-cycles/${id}/close`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["review-cycle", id] }),
  });

  const addParticipantMutation = useMutation({
    mutationFn: (data: { participants: { employee_id: number; manager_id?: number }[] }) =>
      apiPost(`/review-cycles/${id}/participants`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-cycle-participants", id] });
      queryClient.invalidateQueries({ queryKey: ["review-cycle", id] });
      setAddEmployeeId("");
      setAddManagerId("");
    },
  });

  const removeParticipantMutation = useMutation({
    mutationFn: (participantId: string) =>
      apiDelete(`/review-cycles/${id}/participants/${participantId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-cycle-participants", id] });
      queryClient.invalidateQueries({ queryKey: ["review-cycle", id] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">Review cycle not found.</p>
      </div>
    );
  }

  const maxCount = Math.max(...distribution.map((d) => d.count), 1);

  function handleAddParticipant(e: React.FormEvent) {
    e.preventDefault();
    if (!addEmployeeId) return;
    addParticipantMutation.mutate({
      participants: [
        {
          employee_id: Number(addEmployeeId),
          manager_id: addManagerId ? Number(addManagerId) : undefined,
        },
      ],
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate("/review-cycles")}
          className="mt-1 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{cycle.name}</h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[cycle.status] ?? "bg-gray-100 text-gray-700"}`}
            >
              {cycle.status.replace(/_/g, " ")}
            </span>
          </div>
          {cycle.description && (
            <p className="mt-1 text-sm text-gray-500">{cycle.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          {cycle.status === "draft" && (
            <button
              onClick={() => launchMutation.mutate()}
              disabled={launchMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {launchMutation.isPending ? "Launching..." : "Launch"}
            </button>
          )}
          {(cycle.status === "active" || cycle.status === "in_review" || cycle.status === "calibration") && (
            <button
              onClick={() => closeMutation.mutate()}
              disabled={closeMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              {closeMutation.isPending ? "Closing..." : "Close Cycle"}
            </button>
          )}
        </div>
      </div>

      {/* Error banners */}
      {launchMutation.isError && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {(launchMutation.error as any)?.response?.data?.error?.message ?? "Failed to launch cycle."}
        </div>
      )}
      {closeMutation.isError && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {(closeMutation.error as any)?.response?.data?.error?.message ?? "Failed to close cycle."}
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Participants</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{cycle.participant_count}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Submitted</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{cycle.stats.submitted}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">In Draft</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{cycle.stats.draft}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Pending</p>
          <p className="mt-1 text-2xl font-bold text-gray-500">{cycle.stats.pending}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {tab === "participants" && <Users className="h-4 w-4" />}
                {tab === "ratings" && <BarChart3 className="h-4 w-4" />}
                {tab === "settings" && <Settings className="h-4 w-4" />}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "participants" && (
        <div className="space-y-4">
          {/* Add participant form */}
          {(cycle.status === "draft" || cycle.status === "active") && (
            <form onSubmit={handleAddParticipant} className="flex gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Employee ID
                </label>
                <input
                  type="number"
                  value={addEmployeeId}
                  onChange={(e) => setAddEmployeeId(e.target.value)}
                  placeholder="Employee ID"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Manager ID (optional)
                </label>
                <input
                  type="number"
                  value={addManagerId}
                  onChange={(e) => setAddManagerId(e.target.value)}
                  placeholder="Manager ID"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <button
                type="submit"
                disabled={addParticipantMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" />
                Add
              </button>
            </form>
          )}

          {/* Participants table */}
          {participants.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center">
              <Users className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">No participants added yet.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Employee ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Manager ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Added
                    </th>
                    {cycle.status === "draft" && <th className="px-6 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {participants.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {p.employee_id}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {p.manager_id ?? "--"}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 capitalize">
                          {p.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatDate(p.created_at)}
                      </td>
                      {cycle.status === "draft" && (
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => removeParticipantMutation.mutate(p.id)}
                            className="text-red-400 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "ratings" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Rating Distribution</h3>
          {distribution.length === 0 || distribution.every((d) => d.count === 0) ? (
            <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center">
              <BarChart3 className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">
                No submitted reviews yet. Distribution will appear after reviews are submitted.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="flex items-end gap-4 h-48">
                {distribution.map((bucket) => (
                  <div key={bucket.rating} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs font-medium text-gray-500">
                      {bucket.count} ({bucket.percentage}%)
                    </span>
                    <div className="w-full flex justify-center">
                      <div
                        className="w-12 rounded-t-md bg-brand-500"
                        style={{
                          height: `${Math.max((bucket.count / maxCount) * 150, 4)}px`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {bucket.rating}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-center text-xs text-gray-500">Rating (1-5)</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "settings" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Cycle Settings</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Type</p>
              <p className="mt-1 text-sm text-gray-900 capitalize">
                {cycle.type.replace(/_/g, " ")}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Status</p>
              <p className="mt-1 text-sm text-gray-900 capitalize">
                {cycle.status.replace(/_/g, " ")}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Start Date</p>
              <p className="mt-1 text-sm text-gray-900">{formatDate(cycle.start_date)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">End Date</p>
              <p className="mt-1 text-sm text-gray-900">{formatDate(cycle.end_date)}</p>
            </div>
            {cycle.review_deadline && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Review Deadline</p>
                <p className="mt-1 text-sm text-gray-900">
                  {formatDate(cycle.review_deadline)}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Framework</p>
              <p className="mt-1 text-sm text-gray-900">
                {cycle.framework_id ? (
                  <Link
                    to={`/competencies/${cycle.framework_id}`}
                    className="text-brand-600 hover:underline"
                  >
                    View Framework
                  </Link>
                ) : (
                  "None"
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
