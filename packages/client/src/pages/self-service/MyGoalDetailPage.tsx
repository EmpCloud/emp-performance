import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Plus,
  Target,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
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

function ProgressRing({ value, size = 80 }: { value: number; size?: number }) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color =
    value >= 75 ? "#22c55e" : value >= 40 ? "#3b82f6" : value > 0 ? "#f59e0b" : "#d1d5db";

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90 origin-center text-lg font-bold fill-gray-900"
      >
        {value}%
      </text>
    </svg>
  );
}

interface GoalFull extends Goal {
  key_results: KeyResult[];
  check_ins: GoalCheckIn[];
}

export function MyGoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkInProgress, setCheckInProgress] = useState("");
  const [checkInNotes, setCheckInNotes] = useState("");
  const [checkInKrId, setCheckInKrId] = useState("");
  const [checkInValue, setCheckInValue] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["goal-detail", id],
    queryFn: () => apiGet<GoalFull>(`/goals/${id}`),
    enabled: !!id,
  });

  const goal = data?.data;

  const checkInMutation = useMutation({
    mutationFn: (body: any) => apiPost(`/goals/${id}/check-in`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goal-detail", id] });
      setShowCheckIn(false);
      setCheckInProgress("");
      setCheckInNotes("");
      setCheckInKrId("");
      setCheckInValue("");
    },
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
        <Link to="/my/goals" className="mt-2 text-sm text-brand-600 hover:underline">
          Back to My Goals
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/my/goals" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{goal.title}</h1>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                STATUS_COLORS[goal.status],
              )}
            >
              {STATUS_LABELS[goal.status]}
            </span>
          </div>
          {goal.description && (
            <p className="mt-1 text-sm text-gray-500">{goal.description}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Progress Overview */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-6">
              <ProgressRing value={goal.progress} />
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-gray-900">Overall Progress</h2>
                <ProgressBar value={goal.progress} className="mt-2" />
                <div className="mt-2 flex gap-4 text-xs text-gray-500">
                  {goal.start_date && <span>Started: {formatDate(goal.start_date)}</span>}
                  {goal.due_date && <span>Due: {formatDate(goal.due_date)}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Key Results */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Key Results</h2>
            </div>

            {goal.key_results.length === 0 && (
              <div className="p-8 text-center">
                <Target className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">No key results defined.</p>
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
                      <span className="text-sm font-semibold text-gray-700">
                        {kr.current_value}/{kr.target_value}
                        {kr.unit ? ` ${kr.unit}` : ""}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <ProgressBar value={krProgress} className="flex-1 h-2" />
                      <span className="text-xs font-medium text-gray-500 w-10 text-right">
                        {krProgress}%
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                      <span className="capitalize">{kr.metric_type}</span>
                      {kr.weight > 1 && <span>Weight: {kr.weight}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar: Check-in Form + History */}
        <div className="space-y-6">
          {/* Check-in Form */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Check In</h2>
              {!showCheckIn && goal.status !== "completed" && goal.status !== "cancelled" && (
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
              <div className="px-5 py-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Overall Progress (0-100)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={checkInProgress}
                    onChange={(e) => setCheckInProgress(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                {goal.key_results.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Update Key Result (optional)
                    </label>
                    <select
                      value={checkInKrId}
                      onChange={(e) => setCheckInKrId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="">None</option>
                      {goal.key_results.map((kr) => (
                        <option key={kr.id} value={kr.id}>
                          {kr.title}
                        </option>
                      ))}
                    </select>
                    {checkInKrId && (
                      <input
                        type="number"
                        placeholder="New value"
                        value={checkInValue}
                        onChange={(e) => setCheckInValue(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={checkInNotes}
                    onChange={(e) => setCheckInNotes(e.target.value)}
                    rows={3}
                    placeholder="What have you accomplished?"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      checkInMutation.mutate({
                        progress: Number(checkInProgress),
                        notes: checkInNotes || undefined,
                        ...(checkInKrId && {
                          key_result_id: checkInKrId,
                          current_value: Number(checkInValue),
                        }),
                      })
                    }
                    disabled={!checkInProgress || checkInMutation.isPending}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {checkInMutation.isPending ? "Saving..." : "Submit Check-in"}
                  </button>
                  <button
                    onClick={() => setShowCheckIn(false)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!showCheckIn && (
              <div className="px-5 py-4 text-center text-xs text-gray-400">
                {goal.status === "completed"
                  ? "Goal completed."
                  : goal.status === "cancelled"
                    ? "Goal cancelled."
                    : "Click \"New\" to log a check-in."}
              </div>
            )}
          </div>

          {/* Check-in History */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Check-in History</h2>
            </div>

            {goal.check_ins.length === 0 && (
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
