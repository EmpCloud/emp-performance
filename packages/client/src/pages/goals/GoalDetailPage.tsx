import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiGet, apiPost, apiPut, apiDelete } from "@/api/client";
import { invalidateGoalQueries } from "@/api/goal-cache";
import { useConfirm } from "@/components/ConfirmDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
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
  const confirm = useConfirm();
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
  const [ciKrId, setCiKrId] = useState("");
  const [ciCurrentValue, setCiCurrentValue] = useState("");

  // Full check-in history timeline (G13)
  const [showHistory, setShowHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  // Goal edit form (G1)
  const [showEditGoal, setShowEditGoal] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("individual");
  const [editPriority, setEditPriority] = useState("medium");
  const [editStartDate, setEditStartDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editParentId, setEditParentId] = useState("");

  // KR edit form (G2)
  const [editingKrId, setEditingKrId] = useState<string | null>(null);
  const [ekrTitle, setEkrTitle] = useState("");
  const [ekrTarget, setEkrTarget] = useState("");
  const [ekrCurrent, setEkrCurrent] = useState("");
  const [ekrUnit, setEkrUnit] = useState("");
  const [ekrWeight, setEkrWeight] = useState("1");

  const { data, isLoading, error } = useQuery({
    queryKey: ["goal-detail", id],
    queryFn: () => apiGet<GoalFull>(`/goals/${id}`),
    enabled: !!id,
  });

  const goal = data?.data;

  // Candidate parent goals for re-alignment in the edit form (G1). Excludes the
  // current goal so it can't be its own parent.
  const { data: parentData } = useQuery({
    queryKey: ["goals", "parent-options-detail", goal?.cycle_id ?? ""],
    queryFn: () =>
      apiGet<any>("/goals", {
        perPage: 100,
        sort: "title",
        order: "asc",
        ...(goal?.cycle_id ? { cycleId: goal.cycle_id } : {}),
      }),
    enabled: !!goal,
  });
  const parentOptions: { id: string; title: string }[] = (
    parentData?.data?.data ?? []
  ).filter((g: { id: string }) => g.id !== id);

  // Paginated full check-in history (G13). Only fetched when the timeline is open.
  const { data: historyData, isFetching: historyLoading } = useQuery({
    queryKey: ["goal-checkins", id, historyPage],
    queryFn: () =>
      apiGet<{
        data: GoalCheckIn[];
        total: number;
        page: number;
        perPage: number;
        totalPages: number;
      }>(`/goals/${id}/check-ins`, { page: historyPage, perPage: 20 }),
    enabled: !!id && showHistory,
  });
  const historyCheckIns = historyData?.data?.data ?? [];
  const historyPager = historyData?.data;

  function openEditGoal() {
    if (!goal) return;
    setEditTitle(goal.title);
    setEditDescription(goal.description ?? "");
    setEditCategory(goal.category);
    setEditPriority(goal.priority);
    setEditStartDate(goal.start_date ? goal.start_date.slice(0, 10) : "");
    setEditDueDate(goal.due_date ? goal.due_date.slice(0, 10) : "");
    setEditParentId(goal.parent_goal_id ?? "");
    setShowEditGoal(true);
  }

  function openEditKR(kr: KeyResult) {
    setEditingKrId(kr.id);
    setEkrTitle(kr.title);
    setEkrTarget(String(kr.target_value));
    setEkrCurrent(String(kr.current_value));
    setEkrUnit(kr.unit ?? "");
    setEkrWeight(String(kr.weight));
  }

  const addKRMutation = useMutation({
    mutationFn: (body: any) => apiPost(`/goals/${id}/key-results`, body),
    onSuccess: async () => {
      await invalidateGoalQueries(queryClient);
      setShowAddKR(false);
      setKrTitle("");
      setKrTarget("");
      setKrUnit("");
      setKrWeight("1");
    },
  });

  const editKRMutation = useMutation({
    mutationFn: ({ krId, body }: { krId: string; body: any }) =>
      apiPut(`/goals/${id}/key-results/${krId}`, body),
    onSuccess: async () => {
      await invalidateGoalQueries(queryClient);
      setEditingKrId(null);
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to update key result"),
  });

  const deleteKRMutation = useMutation({
    mutationFn: (krId: string) => apiDelete(`/goals/${id}/key-results/${krId}`),
    onSuccess: () => invalidateGoalQueries(queryClient),
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to delete key result"),
  });

  const checkInMutation = useMutation({
    mutationFn: (body: any) => apiPost(`/goals/${id}/check-in`, body),
    onSuccess: async () => {
      await invalidateGoalQueries(queryClient);
      setShowCheckIn(false);
      setCiProgress("");
      setCiNotes("");
      setCiKrId("");
      setCiCurrentValue("");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to save check-in"),
  });

  const editGoalMutation = useMutation({
    mutationFn: (body: any) => apiPut(`/goals/${id}`, body),
    onSuccess: async () => {
      await invalidateGoalQueries(queryClient);
      setShowEditGoal(false);
      toast.success("Goal updated");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to update goal"),
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => apiPut(`/goals/${id}`, { status }),
    onSuccess: () => invalidateGoalQueries(queryClient),
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to update status"),
  });

  function submitEditGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!editTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    editGoalMutation.mutate({
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      category: editCategory,
      priority: editPriority,
      start_date: editStartDate || null,
      due_date: editDueDate || null,
      parent_goal_id: editParentId || null,
    });
  }

  function submitEditKR() {
    if (!editingKrId) return;
    if (!ekrTitle.trim() || !ekrTarget) {
      toast.error("Title and target value are required");
      return;
    }
    editKRMutation.mutate({
      krId: editingKrId,
      body: {
        title: ekrTitle.trim(),
        target_value: Number(ekrTarget),
        current_value: Number(ekrCurrent) || 0,
        unit: ekrUnit || null,
        weight: Number(ekrWeight) || 1,
      },
    });
  }

  async function confirmDeleteKR(krId: string, krName: string) {
    if (
      await confirm({
        title: "Delete key result?",
        message: `Delete key result "${krName}"? This cannot be undone.`,
        confirmLabel: "Delete",
        variant: "danger",
      })
    ) {
      deleteKRMutation.mutate(krId);
    }
  }

  async function handleStatusChange(value: string) {
    if (value === "cancelled") {
      if (
        !(await confirm({
          title: "Cancel goal?",
          message: "Cancel this goal? It will be archived and hidden from lists.",
          confirmLabel: "Cancel goal",
          variant: "danger",
        }))
      ) {
        return;
      }
    }
    updateStatusMutation.mutate(value);
  }

  function submitCheckIn() {
    const body: Record<string, any> = {
      progress: Number(ciProgress),
      notes: ciNotes || undefined,
    };
    if (ciKrId) {
      if (ciCurrentValue === "") {
        toast.error("Enter the key result's current value");
        return;
      }
      body.key_result_id = ciKrId;
      body.current_value = Number(ciCurrentValue);
    }
    checkInMutation.mutate(body);
  }

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
            <StatusBadge colorClass={STATUS_COLORS[goal.status]}>
              {STATUS_LABELS[goal.status]}
            </StatusBadge>
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
        <div className="flex items-center gap-2">
          <button
            onClick={openEditGoal}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          {goal.status !== "completed" && goal.status !== "cancelled" && (
            <select
              value={goal.status}
              onChange={(e) => handleStatusChange(e.target.value)}
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
      </div>

      {/* Edit Goal form (G1) */}
      {showEditGoal && (
        <form
          onSubmit={submitEditGoal}
          className="mb-6 rounded-lg border border-gray-200 bg-white p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-gray-900">Edit Goal</h2>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={300}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="individual">Individual</option>
                <option value="team">Team</option>
                <option value="department">Department</option>
                <option value="company">Company</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
              <select
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
              <input
                type="date"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Due Date</label>
              <input
                type="date"
                value={editDueDate}
                min={editStartDate || undefined}
                onChange={(e) => setEditDueDate(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Parent Goal</label>
              <select
                value={editParentId}
                onChange={(e) => setEditParentId(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">— None (top-level goal) —</option>
                {parentOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={editGoalMutation.isPending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {editGoalMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => setShowEditGoal(false)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

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

                if (editingKrId === kr.id) {
                  return (
                    <div key={kr.id} className="px-5 py-4 bg-gray-50 space-y-3">
                      <input
                        type="text"
                        placeholder="Key result title"
                        value={ekrTitle}
                        onChange={(e) => setEkrTitle(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                      <div className="flex flex-wrap gap-3">
                        <input
                          type="number"
                          placeholder="Current"
                          value={ekrCurrent}
                          onChange={(e) => setEkrCurrent(e.target.value)}
                          className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <input
                          type="number"
                          placeholder="Target"
                          value={ekrTarget}
                          onChange={(e) => setEkrTarget(e.target.value)}
                          className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <input
                          type="text"
                          placeholder="Unit"
                          value={ekrUnit}
                          onChange={(e) => setEkrUnit(e.target.value)}
                          className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <input
                          type="number"
                          placeholder="Weight"
                          value={ekrWeight}
                          onChange={(e) => setEkrWeight(e.target.value)}
                          className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={submitEditKR}
                          disabled={editKRMutation.isPending}
                          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                          {editKRMutation.isPending ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingKrId(null)}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                }

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
                          onClick={() => openEditKR(kr)}
                          className="text-gray-300 hover:text-brand-600"
                          title="Edit key result"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => confirmDeleteKR(kr.id, kr.title)}
                          className="text-gray-300 hover:text-red-500"
                          title="Delete key result"
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

                  {goal.key_results.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Update Key Result (optional)
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={ciKrId}
                          onChange={(e) => {
                            setCiKrId(e.target.value);
                            const kr = goal.key_results.find((k) => k.id === e.target.value);
                            setCiCurrentValue(kr ? String(kr.current_value) : "");
                          }}
                          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        >
                          <option value="">— No key result —</option>
                          {goal.key_results.map((kr) => (
                            <option key={kr.id} value={kr.id}>
                              {kr.title}
                            </option>
                          ))}
                        </select>
                        {ciKrId && (
                          <input
                            type="number"
                            placeholder="Current value"
                            value={ciCurrentValue}
                            onChange={(e) => setCiCurrentValue(e.target.value)}
                            className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                          />
                        )}
                      </div>
                    </div>
                  )}

                  <textarea
                    placeholder="Notes (optional)"
                    value={ciNotes}
                    onChange={(e) => setCiNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={submitCheckIn}
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

            {goal.check_ins.length > 0 && (
              <div className="border-t border-gray-100 px-5 py-2 text-center">
                <button
                  onClick={() => {
                    setShowHistory((v) => !v);
                    setHistoryPage(1);
                  }}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  {showHistory ? "Hide full history" : "View full history"}
                </button>
              </div>
            )}
          </div>

          {/* Full check-in history timeline (G13) */}
          {showHistory && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-5 py-3">
                <h2 className="text-sm font-semibold text-gray-900">Check-in History</h2>
              </div>
              {historyLoading && (
                <div className="p-6 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand-600" />
                </div>
              )}
              {!historyLoading && historyCheckIns.length === 0 && (
                <div className="p-6 text-center text-sm text-gray-500">No check-ins yet.</div>
              )}
              <ol className="relative divide-y divide-gray-100">
                {historyCheckIns.map((ci) => (
                  <li key={ci.id} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Calendar className="h-3 w-3" />
                        {formatDate(ci.created_at)}
                      </div>
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {ci.progress}%
                      </span>
                    </div>
                    {ci.notes && <p className="mt-1 text-sm text-gray-700">{ci.notes}</p>}
                  </li>
                ))}
              </ol>
              {historyPager && (
                <Pagination
                  page={historyPager.page}
                  totalPages={historyPager.totalPages}
                  onPageChange={setHistoryPage}
                  className="border-t border-gray-100 px-5 py-2"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
