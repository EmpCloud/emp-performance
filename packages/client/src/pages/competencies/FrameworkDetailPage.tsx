import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  GripVertical,
} from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/api/client";
import type { CompetencyFramework, Competency } from "@emp-performance/shared";

type FrameworkWithCompetencies = CompetencyFramework & { competencies: Competency[] };

export function FrameworkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [addMode, setAddMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", category: "", weight: "1", order: "0" });

  const { data: fwData, isLoading } = useQuery({
    queryKey: ["framework", id],
    queryFn: () => apiGet<FrameworkWithCompetencies>(`/competencies/${id}`),
    enabled: Boolean(id),
  });

  const framework = fwData?.data;
  const competencies = framework?.competencies ?? [];

  const addMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiPost<Competency>(`/competencies/${id}/competencies`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["framework", id] });
      setAddMode(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ compId, data }: { compId: string; data: Record<string, any> }) =>
      apiPut<Competency>(`/competencies/${id}/competencies/${compId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["framework", id] });
      setEditId(null);
      resetForm();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (compId: string) =>
      apiDelete(`/competencies/${id}/competencies/${compId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["framework", id] });
    },
  });

  function resetForm() {
    setForm({ name: "", description: "", category: "", weight: "1", order: "0" });
  }

  function startEdit(comp: Competency) {
    setEditId(comp.id);
    setForm({
      name: comp.name,
      description: comp.description ?? "",
      category: comp.category ?? "",
      weight: String(comp.weight),
      order: String(comp.order),
    });
  }

  function handleSave() {
    const payload = {
      name: form.name,
      description: form.description || undefined,
      category: form.category || undefined,
      weight: Number(form.weight),
      order: Number(form.order),
    };
    if (editId) {
      updateMutation.mutate({ compId: editId, data: payload });
    } else {
      addMutation.mutate(payload);
    }
  }

  function handleCancel() {
    setAddMode(false);
    setEditId(null);
    resetForm();
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!framework) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">Framework not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate("/competencies")}
          className="mt-1 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{framework.name}</h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                framework.is_active
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {framework.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          {framework.description && (
            <p className="mt-1 text-sm text-gray-500">{framework.description}</p>
          )}
        </div>
      </div>

      {/* Competencies */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Competencies ({competencies.length})
          </h2>
          {!addMode && !editId && (
            <button
              onClick={() => setAddMode(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" />
              Add Competency
            </button>
          )}
        </div>

        {/* Add/Edit form */}
        {(addMode || editId) && (
          <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-900">
              {editId ? "Edit Competency" : "Add Competency"}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  placeholder="e.g. Technical, Leadership"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Weight</label>
                <input
                  type="number"
                  value={form.weight}
                  onChange={(e) => setForm((p) => ({ ...p, weight: e.target.value }))}
                  min="0"
                  max="100"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Order</label>
                <input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm((p) => ({ ...p, order: e.target.value }))}
                  min="0"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={!form.name || addMutation.isPending || updateMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {editId ? "Update" : "Add"}
              </button>
              <button
                onClick={handleCancel}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Competency list */}
        {competencies.length === 0 && !addMode ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center">
            <p className="text-sm text-gray-500">
              No competencies defined yet. Add your first competency to this framework.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {competencies.map((comp) => (
              <div
                key={comp.id}
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-gray-300 transition-colors"
              >
                <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 text-sm">{comp.name}</span>
                    {comp.category && (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {comp.category}
                      </span>
                    )}
                  </div>
                  {comp.description && (
                    <p className="mt-0.5 text-xs text-gray-500 truncate">{comp.description}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  Weight: {comp.weight}
                </span>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => startEdit(comp)}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => removeMutation.mutate(comp.id)}
                    className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
