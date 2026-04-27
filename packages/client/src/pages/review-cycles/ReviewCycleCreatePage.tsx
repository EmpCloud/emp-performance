import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { apiPost, apiGet } from "@/api/client";
import type { CompetencyFramework, ReviewCycle } from "@emp-performance/shared";

const CYCLE_TYPES = [
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "mid_year", label: "Mid-Year" },
  { value: "360_degree", label: "360-Degree" },
  { value: "probation", label: "Probation" },
];

export function ReviewCycleCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    type: "annual",
    start_date: "",
    end_date: "",
    review_deadline: "",
    framework_id: "",
    description: "",
  });

  const { data: frameworksData } = useQuery({
    queryKey: ["frameworks"],
    queryFn: () => apiGet<CompetencyFramework[]>("/competencies"),
  });
  const frameworks = frameworksData?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiPost<ReviewCycle>("/review-cycles", {
        ...data,
        framework_id: data.framework_id || undefined,
        review_deadline: data.review_deadline || undefined,
      }),
    onSuccess: (res) => {
      navigate(`/review-cycles/${res.data!.id}`);
    },
  });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  const dateError =
    form.start_date && form.end_date && form.end_date < form.start_date
      ? "End date cannot be before start date"
      : form.start_date && form.review_deadline && form.review_deadline < form.start_date
        ? "Review deadline cannot be before start date"
        : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (dateError) return;
    createMutation.mutate(form);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("/review-cycles")}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Review Cycle</h1>
          <p className="mt-1 text-sm text-gray-500">
            Set up a new performance review cycle.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cycle Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="e.g. Q1 2026 Performance Review"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cycle Type <span className="text-red-500">*</span>
            </label>
            <select
              name="type"
              value={form.type}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {CYCLE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="start_date"
                value={form.start_date}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="end_date"
                value={form.end_date}
                onChange={handleChange}
                min={form.start_date || undefined}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {dateError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {dateError}
            </div>
          )}

          {/* Review deadline */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Review Deadline
            </label>
            <input
              type="date"
              name="review_deadline"
              value={form.review_deadline}
              onChange={handleChange}
              min={form.start_date || undefined}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Optional deadline for review submissions.
            </p>
          </div>

          {/* Framework selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Competency Framework
            </label>
            <select
              name="framework_id"
              value={form.framework_id}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">No framework</option>
              {frameworks.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              placeholder="Optional description or instructions for this cycle..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Error message */}
        {createMutation.isError && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
            {(createMutation.error as any)?.response?.data?.error?.message ??
              "Failed to create cycle. Please try again."}
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createMutation.isPending || !!dateError}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            <Save className="h-4 w-4" />
            {createMutation.isPending ? "Creating..." : "Create Cycle"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/review-cycles")}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
