import { useState } from "react";
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

const CATEGORY_LABELS: Record<string, string> = {
  individual: "Individual",
  team: "Team",
  department: "Department",
  company: "Company",
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  at_risk: "At Risk",
  completed: "Completed",
  cancelled: "Cancelled",
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
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                STATUS_COLORS[goal.status] ?? "bg-gray-100 text-gray-700",
              )}
            >
              {STATUS_LABELS[goal.status] ?? goal.status}
            </span>
            <span className="text-xs text-gray-500">
              {CATEGORY_LABELS[goal.category] ?? goal.category}
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
                Due {formatDate(goal.due_date)}
              </span>
            )}
          </div>

          {expanded && goal.key_results && goal.key_results.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Key Results
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
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ["goals", page, category, status, search],
    queryFn: () =>
      apiGet<PaginatedResponse<GoalWithKRs>>("/goals", {
        page,
        perPage: 20,
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
          <h1 className="text-2xl font-bold text-gray-900">Goals</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track individual and team goals with key results.
          </p>
        </div>
        <Link
          to="/goals/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Goal
        </Link>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search goals..."
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
          <option value="">All Categories</option>
          <option value="individual">Individual</option>
          <option value="team">Team</option>
          <option value="department">Department</option>
          <option value="company">Company</option>
        </select>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All Statuses</option>
          <option value="not_started">Not Started</option>
          <option value="in_progress">In Progress</option>
          <option value="at_risk">At Risk</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Goals List */}
      <div className="mt-6 space-y-3">
        {isLoading && (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
            <p className="text-sm text-gray-500">Loading goals...</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm text-red-600">Failed to load goals.</p>
          </div>
        )}

        {!isLoading && goals.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
            <Target className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">
              No goals found. Create your first goal to get started.
            </p>
          </div>
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
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
