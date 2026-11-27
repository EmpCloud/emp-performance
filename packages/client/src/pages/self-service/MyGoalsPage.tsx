import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Target,
  Plus,
  ChevronDown,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { invalidateGoalQueries } from "@/api/goal-cache";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import type {
  Goal,
  KeyResult,
  PaginatedResponse,
} from "@emp-performance/shared";

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  at_risk: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  not_started: "dashboard.status.notStarted",
  in_progress: "dashboard.status.inProgress",
  at_risk: "dashboard.status.atRisk",
  completed: "dashboard.status.completed",
  cancelled: "dashboard.status.cancelled",
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
    <div className={cn("h-2 w-full rounded-full bg-gray-200", className)}>
      <div
        className={cn("h-2 rounded-full transition-all", color)}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

interface GoalWithKRs extends Goal {
  key_results?: KeyResult[];
}

function GoalRow({ goal }: { goal: GoalWithKRs }) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState<string | null>(null);
  const [checkInValue, setCheckInValue] = useState("");
  const [checkInNotes, setCheckInNotes] = useState("");
  const queryClient = useQueryClient();

  const checkInMutation = useMutation({
    mutationFn: (body: any) => apiPost(`/goals/${goal.id}/check-in`, body),
    onSuccess: async () => {
      await invalidateGoalQueries(queryClient);
      setShowCheckIn(null);
      setCheckInValue("");
      setCheckInNotes("");
    },
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-600"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/my/goals/${goal.id}`}
              className="text-sm font-semibold text-gray-900 hover:text-brand-600"
            >
              {goal.title}
            </Link>
            <StatusBadge colorClass={STATUS_COLORS[goal.status]}>
              {t(STATUS_LABEL_KEYS[goal.status] || "dashboard.status.notStarted")}
            </StatusBadge>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1 max-w-sm">
              <ProgressBar value={goal.progress} />
            </div>
            <span className="text-xs font-medium text-gray-600">{goal.progress}%</span>
            {goal.due_date && (
              <span className="text-xs text-gray-400">
                {t("myGoals.dueDate", { date: formatDate(goal.due_date, i18n.resolvedLanguage) })}
              </span>
            )}
          </div>

          {expanded && (
            <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
              {goal.key_results && goal.key_results.length > 0 ? (
                goal.key_results.map((kr) => {
                  const krProgress =
                    kr.target_value > 0
                      ? Math.min(100, Math.round((kr.current_value / kr.target_value) * 100))
                      : 0;

                  return (
                    <div key={kr.id}>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-700">{kr.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <ProgressBar value={krProgress} className="h-1.5 flex-1" />
                            <span className="shrink-0 text-xs text-gray-500">
                              {kr.current_value}/{kr.target_value}
                              {kr.unit ? ` ${kr.unit}` : ""}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            setShowCheckIn(showCheckIn === kr.id ? null : kr.id)
                          }
                          className="shrink-0 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          {t("myGoals.checkIn")}
                        </button>
                      </div>

                      {showCheckIn === kr.id && (
                        <div className="mt-2 ml-0 rounded-lg bg-gray-50 p-3 space-y-2">
                          <div className="flex gap-2">
                            <input
                              type="number"
                              placeholder={t("myGoals.newValue")}
                              value={checkInValue}
                              onChange={(e) => setCheckInValue(e.target.value)}
                              className="w-28 rounded border border-gray-300 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                            />
                            <span className="text-xs text-gray-400 self-center">
                              {t("myGoals.ofTarget", { target: kr.target_value })}
                              {kr.unit ? ` ${kr.unit}` : ""}
                            </span>
                          </div>
                          <textarea
                            placeholder={t("myGoals.notesOptional")}
                            value={checkInNotes}
                            onChange={(e) => setCheckInNotes(e.target.value)}
                            rows={2}
                            className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                const newValue = Number(checkInValue);
                                const progress =
                                  kr.target_value > 0
                                    ? Math.min(
                                        100,
                                        Math.round((newValue / kr.target_value) * 100),
                                      )
                                    : 0;
                                checkInMutation.mutate({
                                  progress,
                                  notes: checkInNotes || undefined,
                                  key_result_id: kr.id,
                                  current_value: newValue,
                                });
                              }}
                              disabled={!checkInValue || checkInMutation.isPending}
                              className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                            >
                              {checkInMutation.isPending ? t("myGoals.saving") : t("common.save")}
                            </button>
                            <button
                              onClick={() => setShowCheckIn(null)}
                              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                            >
                              {t("common.cancel")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-gray-400">
                  {t("myGoals.noKeyResults")}{" "}
                  <Link to={`/goals/${goal.id}`} className="text-brand-600 hover:underline">
                    {t("myGoals.addKeyResults")}
                  </Link>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MyGoalsPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-goals", page, user?.empcloudUserId],
    queryFn: () =>
      apiGet<PaginatedResponse<GoalWithKRs>>("/goals", {
        page,
        perPage: 20,
        employeeId: user?.empcloudUserId,
      }),
    enabled: !!user,
  });

  const goals = data?.data?.data ?? [];
  const pagination = data?.data;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("myGoals.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("myGoals.subtitle")}
          </p>
        </div>
        <Link
          to="/goals/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("myGoals.createGoal")}
        </Link>
      </div>

      <div className="mt-6 space-y-3">
        {isLoading && (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
            <p className="text-sm text-gray-500">{t("myGoals.loading")}</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm text-red-600">{t("myGoals.loadError")}</p>
          </div>
        )}

        {!isLoading && goals.length === 0 && (
          <EmptyState
            icon={Target}
            title={t("myGoals.emptyTitle")}
            description={t("myGoals.emptyDescription")}
            className=""
            action={
              <Link
                to="/goals/new"
                className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
              >
                {t("myGoals.createAGoal")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
        )}

        {goals.map((goal) => (
          <GoalRow key={goal.id} goal={goal} />
        ))}
      </div>

      {pagination && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
