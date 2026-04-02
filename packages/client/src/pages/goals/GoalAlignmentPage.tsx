import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Target, ChevronDown, ChevronRight, Loader2, GitBranch } from "lucide-react";
import { apiGet } from "@/api/client";
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

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  at_risk: "At Risk",
  completed: "Completed",
  cancelled: "Cancelled",
};

const CATEGORY_LABELS: Record<string, string> = {
  company: "Company",
  department: "Department",
  team: "Team",
  individual: "Individual",
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
          onClick={() => hasChildren && onToggle(node.id)}
          className={cn(
            "shrink-0 rounded p-0.5",
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
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                STATUS_BADGE_COLORS[node.status] ?? "bg-gray-100 text-gray-700",
              )}
            >
              {STATUS_LABELS[node.status] ?? node.status}
            </span>
            <span className="text-xs text-gray-400">
              {CATEGORY_LABELS[node.category] ?? node.category}
            </span>
            <span className="text-xs text-gray-400">
              Employee #{node.employee_id}
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
              <span className="text-xs text-gray-400" title="Own progress vs rollup">
                (own: {node.progress}%)
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
          title={STATUS_LABELS[node.status] ?? node.status}
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

export function GoalAlignmentPage() {
  const navigate = useNavigate();
  const [cycleId, setCycleId] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ["goals", "tree", cycleId],
    queryFn: () =>
      apiGet<GoalTreeNode[]>("/goals/tree", cycleId ? { cycleId } : undefined),
  });

  const tree = data?.data ?? [];

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const allIds = new Set<string>();
    function collect(nodes: GoalTreeNode[]) {
      for (const n of nodes) {
        const ch = n.children ?? [];
        if (ch.length > 0) {
          allIds.add(n.id);
          collect(ch);
        }
      }
    }
    collect(tree);
    setExpandedIds(allIds);
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Goal Alignment</h1>
          <p className="mt-1 text-sm text-gray-500">
            Visualize how goals cascade from company to individual level.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white p-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Categories:</span>
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
            <span className="text-xs text-gray-600">{CATEGORY_LABELS[cat]}</span>
          </div>
        ))}
        <span className="mx-2 text-gray-300">|</span>
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status:</span>
        {(["completed", "in_progress", "at_risk", "not_started"] as const).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className={cn("h-2.5 w-2.5 rounded-full", STATUS_COLORS[s])} />
            <span className="text-xs text-gray-600">{STATUS_LABELS[s]}</span>
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
            <p className="text-sm text-red-600">Failed to load goal alignment tree.</p>
          </div>
        )}

        {!isLoading && tree.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
            <GitBranch className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">
              No goals found. Create goals with parent relationships to see the alignment tree.
            </p>
          </div>
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
