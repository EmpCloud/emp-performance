import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  Loader2,
  MessageSquare,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/api/client";
import { cn, formatDate } from "@/lib/utils";
import type { Goal, KeyResult, GoalCheckIn } from "@emp-performance/shared";

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  at_risk: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  at_risk: "At Risk",
  completed: "Completed",
  cancelled: "Cancelled",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-gray-500",
  medium: "text-blue-600",
  high: "text-amber-600",
  critical: "text-red-600",
};

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const color =
    value >= 75
      ? "bg-green-500"
      : value >= 40
        ? "bg-blue-500"
        : value > 0
          ? "bg-amber-500"
          : "bg-gray-300";

  return (
    <div className={cn("h-2.5 w-full rounded-full bg-gray-200", className)}>
      <div
        className={cn("h-2.5 rounded-full transition-all", color)}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

interface GoalFull extends Goal {
  key_results: KeyResult[];
  check_ins: GoalCheckIn[];
}

export function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [showAddKR, setShowAddKR] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [krTitle, setKrTitle] = useState("");
  const [krTarget, setKrTarget] = useState("");
  const [krUnit, setKrUnit] = useState("");
  const [krWeight, setKrWeight] = useState("1");
  const [ciProgress, setCiProgress] = useState("");
  const [ciNotes, setCiNotes] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["goal-detail", id],
    queryFn: () => apiGet<GoalFull>(`/goals/${id}`),
    enabled: !!id,
  });

  const goal = data?.data;

  const addKRMutation = useMutation({
    mutationFn: (body: any) => apiPost(`/goals/${id}/key-results`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goal-detail", id] });
      setShowAddKR(false);
      setKrTitle("");
      setKrTarget("");
      setKrUnit("");
      setKrWeight("1");
    },
  });

  const deleteKRMutation = useMutation({
    mutationFn: (krId: string) => apiDelete(`/goals/${id}/key-results/${krId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goal-detail", id] }),
  });

  const checkInMutation = useMutation({
    mutationFn: (body: any) => apiPost(`/goals/${id}/check-in`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goal-detail", id] });
      setShowCheckIn(false);
      setCiProgress("");
      setCiNotes("");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => apiPut(`/goals/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goal-detail", id] }),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !goal) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-600">Failed to load goal.</p>
        <Link to="/goals" className="mt-2 text-sm text-brand-600 hover:underline">
          Back to Goals
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/goals" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{goal.title}</h1>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                STATUS_COLORS[goal.status],
              )}
            >
              {STATUS_LABELS[goal.status]}
            </span>
            <span
              className={cn(
                "text-xs font-medium capitalize",
                PRIORITY_COLORS[goal.priority] ?? "text-gray-500",
              )}
            >
              {goal.priority} priority
            </span>
          </div>
          {goal.description && (
            <p className="mt-1 text-sm text-gray-500">{goal.description}</p>
          )}
        </div>
        {goal.status !== "completed" && goal.status !== "cancelled" && (
          <select
            value={goal.status}
            onChange={(e) => updateStatusMutation.mutate(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          >
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="at_risk">At Risk</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        )}
      </div>

      {/* Progress */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Progress</span>
              <span className="text-lg font-bold text-gray-900">{goal.progress}%</span>
            </div>
            <ProgressBar value={goal.progress} />
          </div>
        </div>
        <div className="mt-3 flex gap-6 text-xs text-gray-500">
          <span className="capitalize">Category: {goal.category}</span>
          {goal.start_date && <span>Started: {formatDate(goal.start_date)}</span>}
          {goal.due_date && <span>Due: {formatDate(goal.due_date)}</span>}
          {goal.completed_at && <span>Completed: {formatDate(goal.completed_at)}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Key Results */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Key Results ({goal.key_results.length})
              </h2>
              <button
                onClick={() => setShowAddKR(true)}
                className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>

            {goal.key_results.length === 0 && !showAddKR && (
              <div className="p-8 text-center">
                <Target className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">
                  No key results yet. Add measurable outcomes to track progress.
                </p>
              </div>
            )}

            <div className="divide-y divide-gray-100">
              {goal.key_results.map((kr) => {
                const krProgress =
                  kr.target_value > 0
                    ? Math.min(100, Math.round((kr.current_value / kr.target_value) * 100))
                    : 0;

                return (
                  <div key={kr.id} className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">{kr.title}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-700">
                          {kr.current_value}/{kr.target_value}
                          {kr.unit ? ` ${kr.unit}` : ""}
                        </span>
                        <button
                          onClick={() => deleteKRMutation.mutate(kr.id)}
                          className="text-gray-300 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <ProgressBar value={krProgress} className="flex-1 h-2" />
                      <span className="text-xs font-medium text-gray-500 w-10 text-right">
                        {krProgress}%
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      <span className="capitalize">{kr.metric_type}</span>
                      {kr.weight > 1 && <span className="ml-2">Weight: {kr.weight}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {showAddKR && (
              <div className="border-t border-gray-200 px-5 py-4 bg-gray-50">
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Key result title"
                    value={krTitle}
                    onChange={(e) => setKrTitle(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <div className="flex gap-3">
                    <input
                      type="number"
                      placeholder="Target value"
                      value={krTarget}
                      onChange={(e) => setKrTarget(e.target.value)}
                      className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <input
                      type="text"
                      placeholder="Unit (optional)"
                      value={krUnit}
                      onChange={(e) => setKrUnit(e.target.value)}
                      className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <input
                      type="number"
                      placeholder="Weight"
                      value={krWeight}
                      onChange={(e) => setKrWeight(e.target.value)}
                      className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        addKRMutation.mutate({
                          title: krTitle,
                          target_value: Number(krTarget),
                          unit: krUnit || undefined,
                          weight: Number(krWeight) || 1,
                        })
                      }
                      disabled={!krTitle.trim() || !krTarget || addKRMutation.isPending}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {addKRMutation.isPending ? "Adding..." : "Add Key Result"}
                    </button>
                    <button
                      onClick={() => setShowAddKR(false)}
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

        {/* Check-ins */}
        <div>
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Check-ins</h2>
              {goal.status !== "completed" && goal.status !== "cancelled" && (
                <button
                  onClick={() => setShowCheckIn(true)}
                  className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New
                </button>
              )}
            </div>

            {showCheckIn && (
              <div className="border-b border-gray-200 px-5 py-4 bg-gray-50">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Progress (0-100)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={ciProgress}
                      onChange={(e) => setCiProgress(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <textarea
                    placeholder="Notes (optional)"
                    value={ciNotes}
                    onChange={(e) => setCiNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        checkInMutation.mutate({
                          progress: Number(ciProgress),
                          notes: ciNotes || undefined,
                        })
                      }
                      disabled={!ciProgress || checkInMutation.isPending}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {checkInMutation.isPending ? "Saving..." : "Submit"}
                    </button>
                    <button
                      onClick={() => setShowCheckIn(false)}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {goal.check_ins.length === 0 && !showCheckIn && (
              <div className="p-8 text-center">
                <MessageSquare className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">No check-ins yet.</p>
              </div>
            )}

            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {goal.check_ins.map((ci) => (
                <div key={ci.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Calendar className="h-3 w-3" />
                      {formatDate(ci.created_at)}
                    </div>
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {ci.progress}%
                    </span>
                  </div>
                  {ci.notes && (
                    <p className="mt-1 text-sm text-gray-700">{ci.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
