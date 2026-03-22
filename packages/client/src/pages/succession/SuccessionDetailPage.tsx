import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  ArrowLeft,
  Plus,
  Shield,
  Users,
  X,
} from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/api/client";

interface SuccessionCandidate {
  id: string;
  plan_id: string;
  employee_id: number;
  readiness: string;
  development_notes: string | null;
  nine_box_position: string | null;
  created_at: string;
}

interface SuccessionPlanDetail {
  id: string;
  organization_id: number;
  position_title: string;
  current_holder_id: number | null;
  department: string | null;
  criticality: string;
  status: string;
  candidates: SuccessionCandidate[];
  created_at: string;
  updated_at: string;
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

const READINESS_COLORS: Record<string, string> = {
  ready_now: "bg-green-100 text-green-700",
  "1_2_years": "bg-yellow-100 text-yellow-700",
  "3_5_years": "bg-orange-100 text-orange-700",
};

const READINESS_LABELS: Record<string, string> = {
  ready_now: "Ready Now",
  "1_2_years": "1-2 Years",
  "3_5_years": "3-5 Years",
};

const NINE_BOX_COLORS: Record<string, string> = {
  Star: "bg-green-100 text-green-700",
  "High Performer": "bg-green-50 text-green-600",
  "Solid Performer": "bg-yellow-100 text-yellow-700",
  "High Potential": "bg-blue-100 text-blue-700",
  "Core Player": "bg-yellow-50 text-yellow-600",
  Average: "bg-orange-50 text-orange-600",
  Inconsistent: "bg-amber-100 text-amber-700",
  "Improvement Needed": "bg-orange-100 text-orange-700",
  "Action Required": "bg-red-100 text-red-700",
};

export function SuccessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [candidateForm, setCandidateForm] = useState({
    employee_id: "",
    readiness: "3_5_years",
    development_notes: "",
    nine_box_position: "",
  });

  const { data: planData, isLoading } = useQuery({
    queryKey: ["succession-plan", id],
    queryFn: () => apiGet<SuccessionPlanDetail>(`/succession-plans/${id}`),
    enabled: !!id,
  });

  const plan = planData?.data;

  const addCandidateMutation = useMutation({
    mutationFn: (body: any) => apiPost(`/succession-plans/${id}/candidates`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["succession-plan", id] });
      setShowAddCandidate(false);
      setCandidateForm({ employee_id: "", readiness: "3_5_years", development_notes: "", nine_box_position: "" });
    },
  });

  const updateCandidateMutation = useMutation({
    mutationFn: ({ candidateId, body }: { candidateId: string; body: any }) =>
      apiPut(`/succession-plans/${id}/candidates/${candidateId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["succession-plan", id] });
    },
  });

  const handleAddCandidate = (e: React.FormEvent) => {
    e.preventDefault();
    addCandidateMutation.mutate({
      employee_id: Number(candidateForm.employee_id),
      readiness: candidateForm.readiness,
      development_notes: candidateForm.development_notes || undefined,
      nine_box_position: candidateForm.nine_box_position || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Succession plan not found.</p>
        <Link to="/succession" className="mt-4 text-brand-600 hover:underline">
          Back to plans
        </Link>
      </div>
    );
  }

  // Sort candidates by readiness priority
  const readinessOrder: Record<string, number> = { ready_now: 0, "1_2_years": 1, "3_5_years": 2 };
  const sortedCandidates = [...plan.candidates].sort(
    (a, b) => (readinessOrder[a.readiness] ?? 3) - (readinessOrder[b.readiness] ?? 3),
  );

  return (
    <div>
      {/* Header */}
      <Link
        to="/succession"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Succession Plans
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-7 w-7 text-brand-600" />
            {plan.position_title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {plan.department && (
              <span className="text-sm text-gray-500">{plan.department}</span>
            )}
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${CRITICALITY_COLORS[plan.criticality]}`}>
              {plan.criticality}
            </span>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[plan.status]}`}>
              {plan.status}
            </span>
          </div>
          {plan.current_holder_id && (
            <p className="mt-1 text-sm text-gray-500">
              Current holder: Employee #{plan.current_holder_id}
            </p>
          )}
        </div>

        <button
          onClick={() => setShowAddCandidate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Add Candidate
        </button>
      </div>

      {/* Add Candidate Modal */}
      {showAddCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Add Succession Candidate</h2>
              <button
                onClick={() => setShowAddCandidate(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddCandidate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Employee ID *
                </label>
                <input
                  type="number"
                  value={candidateForm.employee_id}
                  onChange={(e) => setCandidateForm({ ...candidateForm, employee_id: e.target.value })}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Readiness
                </label>
                <select
                  value={candidateForm.readiness}
                  onChange={(e) => setCandidateForm({ ...candidateForm, readiness: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="ready_now">Ready Now</option>
                  <option value="1_2_years">1-2 Years</option>
                  <option value="3_5_years">3-5 Years</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  9-Box Position
                </label>
                <select
                  value={candidateForm.nine_box_position}
                  onChange={(e) => setCandidateForm({ ...candidateForm, nine_box_position: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Not assessed</option>
                  <option value="Star">Star</option>
                  <option value="High Performer">High Performer</option>
                  <option value="Solid Performer">Solid Performer</option>
                  <option value="High Potential">High Potential</option>
                  <option value="Core Player">Core Player</option>
                  <option value="Average">Average</option>
                  <option value="Inconsistent">Inconsistent</option>
                  <option value="Improvement Needed">Improvement Needed</option>
                  <option value="Action Required">Action Required</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Development Notes
                </label>
                <textarea
                  value={candidateForm.development_notes}
                  onChange={(e) => setCandidateForm({ ...candidateForm, development_notes: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Development plan, key skills to build..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCandidate(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addCandidateMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {addCandidateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Add Candidate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Candidates */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-gray-500" />
          Candidates ({plan.candidates.length})
        </h2>

        {sortedCandidates.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            No candidates added yet. Click "Add Candidate" to start.
          </div>
        ) : (
          <div className="space-y-3">
            {sortedCandidates.map((candidate) => (
              <div
                key={candidate.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-sm font-semibold">
                        #{candidate.employee_id}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          Employee #{candidate.employee_id}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${READINESS_COLORS[candidate.readiness] || "bg-gray-100 text-gray-600"}`}>
                            {READINESS_LABELS[candidate.readiness] || candidate.readiness}
                          </span>
                          {candidate.nine_box_position && (
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${NINE_BOX_COLORS[candidate.nine_box_position] || "bg-gray-100 text-gray-600"}`}>
                              {candidate.nine_box_position}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {candidate.development_notes && (
                      <p className="mt-3 text-sm text-gray-600 ml-13">
                        {candidate.development_notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <select
                      value={candidate.readiness}
                      onChange={(e) => {
                        updateCandidateMutation.mutate({
                          candidateId: candidate.id,
                          body: { readiness: e.target.value },
                        });
                      }}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 focus:border-brand-500 focus:outline-none"
                    >
                      <option value="ready_now">Ready Now</option>
                      <option value="1_2_years">1-2 Years</option>
                      <option value="3_5_years">3-5 Years</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
