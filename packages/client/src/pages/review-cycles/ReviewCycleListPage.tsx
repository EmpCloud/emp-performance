import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  Search,
  RefreshCw,
  Calendar,
  Users,
  MoreVertical,
  Pencil,
  Trash2,
  Eye,
  PlayCircle,
  CheckCircle2,
} from "lucide-react";
import { apiGet, apiDelete, apiPost } from "@/api/client";
import toast from "react-hot-toast";
import type {
  ReviewCycle,
  PaginatedResponse,
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

const TYPE_LABEL: Record<string, string> = {
  quarterly: "Quarterly",
  annual: "Annual",
  mid_year: "Mid-Year",
  "360_degree": "360-Degree",
  probation: "Probation",
};

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "in_review", label: "In Review" },
  { value: "completed", label: "Completed" },
];

type CycleWithCount = ReviewCycle & { participant_count: number };

export function ReviewCycleListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(searchInput);
  const page = Number(searchParams.get("page") ?? "1");
  const statusFilter = searchParams.get("status") ?? "";
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Debounce input -> URL/query so the search bar actually filters as the
  // user types, not only on Enter (#13).
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const current = next.get("search") ?? "";
    if (debouncedSearch === current) return;
    if (debouncedSearch) next.set("search", debouncedSearch);
    else next.delete("search");
    next.delete("page");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    if (!openMenuId) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [openMenuId]);

  const { data, isLoading } = useQuery({
    queryKey: ["review-cycles", { page, status: statusFilter, search: debouncedSearch }],
    queryFn: () =>
      apiGet<PaginatedResponse<CycleWithCount>>("/review-cycles", {
        page,
        perPage: 20,
        status: statusFilter || undefined,
        search: debouncedSearch || undefined,
      }),
  });

  const cycles = data?.data?.data ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = data?.data?.totalPages ?? 1;

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["review-cycles"] });
  }

  const launchMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/review-cycles/${id}/launch`, {}),
    onSuccess: () => {
      toast.success("Cycle launched");
      refresh();
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to launch cycle"),
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/review-cycles/${id}/close`, {}),
    onSuccess: () => {
      toast.success("Cycle closed");
      refresh();
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to close cycle"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/review-cycles/${id}`),
    onSuccess: () => {
      toast.success("Cycle deleted");
      refresh();
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to delete cycle"),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Cycles</h1>
          <p className="mt-1 text-sm text-gray-500">
            {total} cycle{total !== 1 ? "s" : ""} total
          </p>
        </div>
        <Link
          to="/review-cycles/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Cycle
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter("status", tab.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search cycles by name or description..."
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : cycles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
          <RefreshCw className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-2 text-sm font-medium text-gray-900">No review cycles found</p>
          <p className="mt-1 text-sm text-gray-500">
            Create your first review cycle to get started.
          </p>
          <Link
            to="/review-cycles/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Create Cycle
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white -mx-4 lg:mx-0">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Dates
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Participants
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {cycles.map((cycle) => (
                <tr key={cycle.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <Link
                      to={`/review-cycles/${cycle.id}`}
                      className="font-medium text-gray-900 hover:text-brand-600"
                    >
                      {cycle.name}
                    </Link>
                    {cycle.description && (
                      <p className="mt-0.5 text-xs text-gray-500 truncate max-w-xs">
                        {cycle.description}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {TYPE_LABEL[cycle.type] ?? cycle.type}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[cycle.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {cycle.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(cycle.start_date)} - {formatDate(cycle.end_date)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {cycle.participant_count}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === cycle.id ? null : cycle.id);
                      }}
                      className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      aria-label="Cycle actions"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </button>

                    {openMenuId === cycle.id && (
                      <div
                        ref={menuRef}
                        className="absolute right-6 top-12 z-20 w-52 rounded-lg border border-gray-200 bg-white py-1 text-left shadow-lg"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            navigate(`/review-cycles/${cycle.id}`);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Eye className="h-4 w-4" />
                          View details
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            navigate(`/review-cycles/${cycle.id}?edit=1`);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </button>
                        {cycle.status === "draft" && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              launchMutation.mutate(cycle.id);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <PlayCircle className="h-4 w-4 text-green-600" />
                            Launch cycle
                          </button>
                        )}
                        {cycle.status === "active" && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              closeMutation.mutate(cycle.id);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                            Close cycle
                          </button>
                        )}
                        {cycle.status === "draft" && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              if (window.confirm(`Delete cycle "${cycle.name}"? This cannot be undone.`)) {
                                deleteMutation.mutate(cycle.id);
                              }
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setFilter("page", String(page - 1))}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setFilter("page", String(page + 1))}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
