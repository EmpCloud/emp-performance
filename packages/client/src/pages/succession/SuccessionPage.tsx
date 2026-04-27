import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Loader2,
  Plus,
  Users,
  Shield,
  ChevronRight,
  X,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";

interface SuccessionPlan {
  id: string;
  organization_id: number;
  position_title: string;
  current_holder_id: number | null;
  department: string | null;
  criticality: string;
  status: string;
  candidate_count: number;
  created_at: string;
}

const CRITICALITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const STATUS_COLORS: Record<string, string> = {
  identified: "bg-blue-100 text-blue-700",
  developing: "bg-amber-100 text-amber-700",
  ready: "bg-green-100 text-green-700",
};

export function SuccessionPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    position_title: "",
    department: "",
    criticality: "medium",
    current_holder_id: "",
  });

  const { data: plansData, isLoading } = useQuery({
    queryKey: ["succession-plans"],
    queryFn: () => apiGet<SuccessionPlan[]>("/succession-plans"),
  });

  const plans = plansData?.data || [];

  const createMutation = useMutation({
    mutationFn: (body: any) => apiPost("/succession-plans", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["succession-plans"] });
      setShowCreate(false);
      setForm({ position_title: "", department: "", criticality: "medium", current_holder_id: "" });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      position_title: form.position_title,
      department: form.department || undefined,
      criticality: form.criticality,
      current_holder_id: form.current_holder_id ? Number(form.current_holder_id) : undefined,
    });
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-7 w-7 text-brand-600" />
            Succession Planning
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Identify and develop future leaders for critical positions.
          </p>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          New Plan
        </button>
      </div>

      {/* Create Form Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Create Succession Plan</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Position Title *
                </label>
                <input
                  type="text"
                  value={form.position_title}
                  onChange={(e) => setForm({ ...form, position_title: e.target.value })}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="e.g., VP Engineering"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Department
                </label>
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="e.g., Engineering"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Holder ID
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.current_holder_id}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^\d+$/.test(v)) {
                      setForm({ ...form, current_holder_id: v });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "-" || e.key === "e" || e.key === "+") {
                      e.preventDefault();
                    }
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Employee ID (optional)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Criticality
                </label>
                <select
                  value={form.criticality}
                  onChange={(e) => setForm({ ...form, criticality: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Plans List */}
      {isLoading ? (
        <div className="mt-12 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : plans.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center text-gray-400">
          <Shield className="h-16 w-16 mb-4" />
          <p className="text-lg font-medium">No succession plans yet</p>
          <p className="text-sm">Create your first succession plan to start identifying future leaders.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {plans.map((plan) => (
            <Link
              key={plan.id}
              to={`/succession/${plan.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-brand-200 hover:shadow-md transition-all"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-semibold text-gray-900 truncate">
                    {plan.position_title}
                  </h3>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${CRITICALITY_COLORS[plan.criticality] || CRITICALITY_COLORS.medium}`}>
                    {plan.criticality}
                  </span>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[plan.status] || STATUS_COLORS.identified}`}>
                    {plan.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
                  {plan.department && <span>{plan.department}</span>}
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {plan.candidate_count} candidate{plan.candidate_count !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
