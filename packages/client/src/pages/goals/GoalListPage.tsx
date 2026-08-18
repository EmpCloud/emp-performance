import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Target,
  Plus,
  Filter,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import { apiGet, apiDelete } from "@/api/client";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { cn, formatDate } from "@/lib/utils";
import type {
  Goal,
  KeyResult,
  PaginatedResponse,
  GoalCategory,
  GoalStatus,
} from "@emp-performance/shared";

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  at_risk: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

interface GoalWithKRs extends Goal {
  key_results?: KeyResult[];
}

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

function GoalCard({ goal, expanded, onToggle }: { goal: GoalWithKRs; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          className="mt-1 shrink-0 text-gray-400 hover:text-gray-600"
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
              to={`/goals/${goal.id}`}
              className="text-sm font-semibold text-gray-900 hover:text-brand-600 truncate"
            >
              {goal.title}
            </Link>
            <StatusBadge colorClass={STATUS_COLORS[goal.status] ?? "bg-gray-100 text-gray-700"}>
              {t(`goalAlignment.status.${goal.status}`, { defaultValue: goal.status })}
            </StatusBadge>
            <span className="text-xs text-gray-500">
              {t(`goalAlignment.category.${goal.category}`, { defaultValue: goal.category })}
            </span>
          </div>

          {goal.description && (
            <p className="mt-1 text-xs text-gray-500 line-clamp-1">
              {goal.description}
            </p>
          )}

          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1 max-w-xs">
              <ProgressBar value={goal.progress} />
            </div>
            <span className="text-xs font-medium text-gray-600">
              {goal.progress}%
            </span>
            {goal.due_date && (
              <span className="text-xs text-gray-400">
                {t("goalList.dueDate", { date: formatDate(goal.due_date) })}
              </span>
            )}
          </div>

          {expanded && goal.key_results && goal.key_results.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {t("goalList.keyResults")}
              </p>
              {goal.key_results.map((kr) => {
                const krProgress =
                  kr.target_value > 0
                    ? Math.min(100, Math.round((kr.current_value / kr.target_value) * 100))
                    : 0;
                return (
                  <div key={kr.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 truncate">{kr.title}</p>
                      <ProgressBar value={krProgress} className="mt-1 h-1.5" />
                    </div>
                    <span className="shrink-0 text-xs text-gray-500">
                      {kr.current_value}/{kr.target_value}
                      {kr.unit ? ` ${kr.unit}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function GoalListPage() {
  const { t } = useTranslation();
  const sortOptions = [
    { value: "created_at:desc", label: t("goalList.sort.newestFirst") },
    { value: "created_at:asc", label: t("goalList.sort.oldestFirst") },
    { value: "title:asc", label: t("goalList.sort.titleAsc") },
    { value: "title:desc", label: t("goalList.sort.titleDesc") },
    { value: "progress:desc", label: t("goalList.sort.progressDesc") },
    { value: "progress:asc", label: t("goalList.sort.progressAsc") },
    { value: "due_date:asc", label: t("goalList.sort.dueDateSoonest") },
    { value: "priority:desc", label: t("goalList.sort.priorityDesc") },
  ];
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [sortValue, setSortValue] = useState("created_at:desc");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [sort, order] = sortValue.split(":") as [string, "asc" | "desc"];

  const { data, isLoading, error } = useQuery({
    queryKey: ["goals", page, category, status, search, sortValue],
    queryFn: () =>
      apiGet<PaginatedResponse<GoalWithKRs>>("/goals", {
        page,
        perPage: 20,
        sort,
        order,
        ...(category && { category }),
        ...(status && { status }),
        ...(search && { search }),
      }),
  });

  const goals = data?.data?.data ?? [];
  const pagination = data?.data;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("goalList.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("goalList.subtitle")}
          </p>
        </div>
        <Link
          to="/goals/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("goalList.createGoal")}
        </Link>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={t("goalList.searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">{t("goalList.allCategories")}</option>
          <option value="individual">{t("goalAlignment.category.individual")}</option>
          <option value="team">{t("goalAlignment.category.team")}</option>
          <option value="department">{t("goalAlignment.category.department")}</option>
          <option value="company">{t("goalAlignment.category.company")}</option>
        </select>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">{t("goalAlignment.allStatuses")}</option>
          <option value="not_started">{t("goalAlignment.status.not_started")}</option>
          <option value="in_progress">{t("goalAlignment.status.in_progress")}</option>
          <option value="at_risk">{t("goalAlignment.status.at_risk")}</option>
          <option value="completed">{t("goalAlignment.status.completed")}</option>
          <option value="cancelled">{t("goalAlignment.status.cancelled")}</option>
        </select>

        <select
          value={sortValue}
          onChange={(e) => {
            setSortValue(e.target.value);
            setPage(1);
          }}
          className="ml-auto rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Goals List */}
      <div className="mt-6 space-y-3">
        {isLoading && (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
            <p className="text-sm text-gray-500">{t("goalList.loading")}</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm text-red-600">{t("goalList.loadError")}</p>
          </div>
        )}

        {!isLoading && goals.length === 0 && (
          <EmptyState
            icon={Target}
            title={t("goalList.emptyTitle")}
            className=""
          />
        )}

        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            expanded={expandedIds.has(goal.id)}
            onToggle={() => toggleExpand(goal.id)}
          />
        ))}
      </div>

      {/* Pagination */}
      {pagination && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
