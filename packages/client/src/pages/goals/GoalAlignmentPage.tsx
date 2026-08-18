import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Loader2, GitBranch } from "lucide-react";
import { apiGet } from "@/api/client";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import type { GoalTreeNode } from "@emp-performance/shared";

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-400",
  in_progress: "bg-blue-500",
  at_risk: "bg-red-500",
  completed: "bg-green-500",
  cancelled: "bg-gray-300",
};

const STATUS_BADGE_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  at_risk: "bg-red-100 text-red-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const CATEGORY_COLORS: Record<string, string> = {
  company: "border-l-green-500",
  department: "border-l-amber-500",
  team: "border-l-purple-500",
  individual: "border-l-blue-500",
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

function GoalTreeNodeComponent({
  node,
  depth,
  expandedIds,
  onToggle,
  onNavigate,
}: {
  node: GoalTreeNode;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onNavigate: (id: string) => void;
}) {
  const { t } = useTranslation();
  const isExpanded = expandedIds.has(node.id);
  const children = node.children ?? [];
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:shadow-sm transition-shadow border-l-4",
          CATEGORY_COLORS[node.category] ?? "border-l-gray-300",
        )}
        style={{ marginLeft: depth * 28 }}
      >
        {/* Expand/collapse button */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (hasChildren) onToggle(node.id);
          }}
          disabled={!hasChildren}
          aria-label={
            hasChildren
              ? isExpanded
                ? t("goalAlignment.collapse")
                : t("goalAlignment.expand")
              : t("goalAlignment.noChildren")
          }
          className={cn(
            "shrink-0 rounded p-1",
            hasChildren
              ? "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              : "text-transparent cursor-default",
          )}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* Goal info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onNavigate(node.id)}
              className="text-sm font-semibold text-gray-900 hover:text-brand-600 truncate text-left"
            >
              {node.title}
            </button>
            <StatusBadge colorClass={STATUS_BADGE_COLORS[node.status] ?? "bg-gray-100 text-gray-700"}>
              {t(`goalAlignment.status.${node.status}`, { defaultValue: node.status })}
            </StatusBadge>
            <span className="text-xs text-gray-400">
              {t(`goalAlignment.category.${node.category}`, { defaultValue: node.category })}
            </span>
            <span className="text-xs text-gray-400">
              {t("goalAlignment.employeeNumber", { id: node.employee_id })}
            </span>
          </div>

          <div className="mt-1.5 flex items-center gap-3">
            <div className="flex-1 max-w-xs">
              <ProgressBar value={node.rollup_progress ?? node.progress ?? 0} />
            </div>
            <span className="text-xs font-medium text-gray-600">
              {node.rollup_progress ?? node.progress ?? 0}%
            </span>
            {hasChildren && (node.rollup_progress ?? node.progress) !== node.progress && (
              <span className="text-xs text-gray-400" title={t("goalAlignment.ownProgressVsRollup")}>
                {t("goalAlignment.ownProgress", { progress: node.progress })}
              </span>
            )}
          </div>
        </div>

        {/* Status dot */}
        <div
          className={cn(
            "h-3 w-3 shrink-0 rounded-full",
            STATUS_COLORS[node.status] ?? "bg-gray-400",
          )}
          title={t(`goalAlignment.status.${node.status}`, { defaultValue: node.status })}
        />
      </div>

      {/* Children */}
      {isExpanded &&
        hasChildren &&
        children.map((child) => (
          <div key={child.id} className="mt-1">
            <GoalTreeNodeComponent
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          </div>
        ))}
    </div>
  );
}

interface CycleOption {
  id: string;
  name: string;
}

interface OwnerOption {
  id: number;
  full_name: string;
  email: string;
}

/**
 * Recursively prune the tree to nodes matching the owner/status filters. A
 * parent is kept if it matches OR any descendant matches, so context isn't
 * lost (G8).
 */
function filterTree(
  nodes: GoalTreeNode[],
  ownerId: string,
  status: string,
): GoalTreeNode[] {
  const out: GoalTreeNode[] = [];
  for (const node of nodes) {
    const children = filterTree(node.children ?? [], ownerId, status);
    const ownerMatch = !ownerId || String(node.employee_id) === ownerId;
    const statusMatch = !status || node.status === status;
    if ((ownerMatch && statusMatch) || children.length > 0) {
      out.push({ ...node, children });
    }
  }
  return out;
}

export function GoalAlignmentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [cycleId, setCycleId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: cyclesData } = useQuery({
    queryKey: ["review-cycles", "alignment"],
    queryFn: () => apiGet<any>("/review-cycles", { perPage: 100 }),
  });
  const cycles: CycleOption[] = cyclesData?.data?.data ?? cyclesData?.data ?? [];

  const { data: usersData } = useQuery({
    queryKey: ["users", "list"],
    queryFn: () => apiGet<OwnerOption[]>("/users"),
  });
  const owners: OwnerOption[] = usersData?.data ?? [];

  const { data, isLoading, error } = useQuery({
    queryKey: ["goals", "tree", cycleId],
    queryFn: () =>
      apiGet<GoalTreeNode[]>("/goals/tree", cycleId ? { cycleId } : undefined),
  });

  const rawTree = data?.data ?? [];
  const tree = useMemo(
    () => filterTree(rawTree, ownerId, statusFilter),
    [rawTree, ownerId, statusFilter],
  );

  // Pre-collect every node id that has children — used by both Expand All
  // and the per-row toggle. Memoized so the buttons read stable data
  // instead of recomputing the whole tree on each click (#15).
  const expandableIds = useMemo(() => {
    const ids: string[] = [];
    function collect(nodes: GoalTreeNode[]) {
      for (const n of nodes) {
        const ch = n.children ?? [];
        if (ch.length > 0) {
          ids.push(n.id);
          collect(ch);
        }
      }
    }
    collect(tree);
    return ids;
  }, [tree]);

  // Auto-expand the first level on initial load so the page doesn't look
  // collapsed when the user lands on it.
  useEffect(() => {
    if (tree.length === 0) return;
    setExpandedIds((prev) => {
      if (prev.size > 0) return prev;
      const next = new Set<string>();
      for (const root of tree) {
        if ((root.children ?? []).length > 0) next.add(root.id);
      }
      return next;
    });
  }, [tree]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(expandableIds));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  const allExpanded =
    expandableIds.length > 0 && expandableIds.every((id) => expandedIds.has(id));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("goalAlignment.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("goalAlignment.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            disabled={expandableIds.length === 0 || allExpanded}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("goalAlignment.expandAll")}
          </button>
          <button
            type="button"
            onClick={collapseAll}
            disabled={expandedIds.size === 0}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("goalAlignment.collapseAll")}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          value={cycleId}
          onChange={(e) => setCycleId(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">{t("goalAlignment.allCycles")}</option>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">{t("goalAlignment.allOwners")}</option>
          {owners.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">{t("goalAlignment.allStatuses")}</option>
          <option value="not_started">{t("goalAlignment.status.not_started")}</option>
          <option value="in_progress">{t("goalAlignment.status.in_progress")}</option>
          <option value="at_risk">{t("goalAlignment.status.at_risk")}</option>
          <option value="completed">{t("goalAlignment.status.completed")}</option>
        </select>

        {(cycleId || ownerId || statusFilter) && (
          <button
            type="button"
            onClick={() => {
              setCycleId("");
              setOwnerId("");
              setStatusFilter("");
            }}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("goalAlignment.clearFilters")}
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white p-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("goalAlignment.categories")}:</span>
        {(["company", "department", "team", "individual"] as const).map((cat) => (
          <div key={cat} className="flex items-center gap-1.5">
            <div
              className={cn("h-3 w-1 rounded-full", {
                "bg-green-500": cat === "company",
                "bg-amber-500": cat === "department",
                "bg-purple-500": cat === "team",
                "bg-blue-500": cat === "individual",
              })}
            />
            <span className="text-xs text-gray-600">{t(`goalAlignment.category.${cat}`)}</span>
          </div>
        ))}
        <span className="mx-2 text-gray-300">|</span>
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("goalAlignment.statusLabel")}:</span>
        {(["completed", "in_progress", "at_risk", "not_started"] as const).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className={cn("h-2.5 w-2.5 rounded-full", STATUS_COLORS[s])} />
            <span className="text-xs text-gray-600">{t(`goalAlignment.status.${s}`)}</span>
          </div>
        ))}
      </div>

      {/* Tree */}
      <div className="mt-6 space-y-1">
        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm text-red-600">{t("goalAlignment.loadError")}</p>
          </div>
        )}

        {!isLoading && tree.length === 0 && (
          <EmptyState
            icon={GitBranch}
            title={t("goalAlignment.emptyTitle")}
            className=""
          />
        )}

        {tree.map((node) => (
          <GoalTreeNodeComponent
            key={node.id}
            node={node}
            depth={0}
            expandedIds={expandedIds}
            onToggle={toggleExpand}
            onNavigate={(id) => navigate(`/goals/${id}`)}
          />
        ))}
      </div>
    </div>
  );
}
