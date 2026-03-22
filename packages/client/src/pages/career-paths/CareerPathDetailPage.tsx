import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Award,
  Clock,
  Check,
  X,
} from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/api/client";
import toast from "react-hot-toast";

interface CareerPathLevel {
  id: string;
  career_path_id: string;
  title: string;
  level: number;
  description: string | null;
  requirements: string | null;
  min_years_experience: number | null;
}

interface CareerPathDetail {
  id: string;
  name: string;
  description: string | null;
  department: string | null;
  is_active: boolean;
  levels: CareerPathLevel[];
}

export function CareerPathDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showAddLevel, setShowAddLevel] = useState(false);
  const [editingLevel, setEditingLevel] = useState<string | null>(null);

  // Level form state
  const [levelTitle, setLevelTitle] = useState("");
  const [levelNum, setLevelNum] = useState(1);
  const [levelDesc, setLevelDesc] = useState("");
  const [levelReqs, setLevelReqs] = useState("");
  const [levelExp, setLevelExp] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["career-paths", id],
    queryFn: () => apiGet<CareerPathDetail>(`/career-paths/${id}`),
    enabled: !!id,
  });

  const addLevelMutation = useMutation({
    mutationFn: (body: any) => apiPost(`/career-paths/${id}/levels`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["career-paths", id] });
      toast.success("Level added");
      resetLevelForm();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to add level"),
  });

  const updateLevelMutation = useMutation({
    mutationFn: ({ levelId, body }: { levelId: string; body: any }) =>
      apiPut(`/career-paths/levels/${levelId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["career-paths", id] });
      toast.success("Level updated");
      setEditingLevel(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || "Failed to update level"),
  });

  const deleteLevelMutation = useMutation({
    mutationFn: (levelId: string) => apiDelete(`/career-paths/levels/${levelId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["career-paths", id] });
      toast.success("Level removed");
    },
  });

  function resetLevelForm() {
    setShowAddLevel(false);
    setLevelTitle("");
    setLevelNum((data?.data?.levels?.length || 0) + 1);
    setLevelDesc("");
    setLevelReqs("");
    setLevelExp("");
  }

  function handleAddLevel(e: React.FormEvent) {
    e.preventDefault();
    addLevelMutation.mutate({
      title: levelTitle,
      level: levelNum,
      description: levelDesc || undefined,
      requirements: levelReqs || undefined,
      min_years_experience: levelExp ? parseFloat(levelExp) : undefined,
    });
  }

  const path = data?.data;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!path) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Career path not found.</p>
        <Link to="/career-paths" className="mt-2 text-brand-600 underline">
          Back to list
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/career-paths"
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{path.name}</h1>
          {path.description && <p className="mt-1 text-sm text-gray-500">{path.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {path.department && (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              {path.department}
            </span>
          )}
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              path.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {path.is_active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {/* Career Ladder */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Career Ladder</h2>
          <button
            onClick={() => {
              setShowAddLevel(true);
              setLevelNum((path.levels?.length || 0) + 1);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Add Level
          </button>
        </div>

        {/* Levels stacked vertically */}
        <div className="space-y-3">
          {(path.levels || []).map((level, idx) => (
            <LevelCard
              key={level.id}
              level={level}
              isTop={idx === (path.levels?.length || 0) - 1}
              isEditing={editingLevel === level.id}
              onEdit={() => setEditingLevel(level.id)}
              onCancelEdit={() => setEditingLevel(null)}
              onSaveEdit={(data) =>
                updateLevelMutation.mutate({ levelId: level.id, body: data })
              }
              onDelete={() => {
                if (confirm("Remove this level?")) deleteLevelMutation.mutate(level.id);
              }}
            />
          ))}

          {path.levels?.length === 0 && !showAddLevel && (
            <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
              <Award className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">No levels defined yet. Add your first level.</p>
            </div>
          )}
        </div>

        {/* Inline Add Level Form */}
        {showAddLevel && (
          <form
            onSubmit={handleAddLevel}
            className="mt-4 rounded-xl border border-brand-200 bg-brand-50/30 p-5 space-y-3"
          >
            <h3 className="font-medium text-gray-900">New Level</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Title</label>
                <input
                  value={levelTitle}
                  onChange={(e) => setLevelTitle(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="e.g. Senior Engineer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Level Number</label>
                <input
                  type="number"
                  value={levelNum}
                  onChange={(e) => setLevelNum(parseInt(e.target.value))}
                  min={1}
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={levelDesc}
                onChange={(e) => setLevelDesc(e.target.value)}
                rows={2}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Describe this level..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Requirements</label>
              <textarea
                value={levelReqs}
                onChange={(e) => setLevelReqs(e.target.value)}
                rows={2}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Skills and competencies required..."
              />
            </div>
            <div className="w-48">
              <label className="block text-sm font-medium text-gray-700">Min Years Experience</label>
              <input
                type="number"
                step="0.5"
                value={levelExp}
                onChange={(e) => setLevelExp(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="e.g. 3"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={addLevelMutation.isPending}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {addLevelMutation.isPending ? "Adding..." : "Add Level"}
              </button>
              <button
                type="button"
                onClick={resetLevelForm}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function LevelCard({
  level,
  isTop,
  isEditing,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  level: CareerPathLevel;
  isTop: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (data: any) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(level.title);
  const [desc, setDesc] = useState(level.description || "");
  const [reqs, setReqs] = useState(level.requirements || "");
  const [exp, setExp] = useState(level.min_years_experience?.toString() || "");

  if (isEditing) {
    return (
      <div className="rounded-xl border border-brand-200 bg-white p-5 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <input
            value={exp}
            onChange={(e) => setExp(e.target.value)}
            placeholder="Min years exp"
            type="number"
            step="0.5"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={2}
          placeholder="Description"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <textarea
          value={reqs}
          onChange={(e) => setReqs(e.target.value)}
          rows={2}
          placeholder="Requirements"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <div className="flex gap-2">
          <button
            onClick={() =>
              onSaveEdit({
                title,
                description: desc || undefined,
                requirements: reqs || undefined,
                min_years_experience: exp ? parseFloat(exp) : undefined,
              })
            }
            className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Check className="h-3.5 w-3.5" /> Save
          </button>
          <button
            onClick={onCancelEdit}
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border bg-white p-5 shadow-sm transition-colors ${
        isTop ? "border-brand-200 ring-1 ring-brand-100" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
              isTop ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-600"
            }`}
          >
            {level.level}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{level.title}</h3>
            {level.min_years_experience != null && (
              <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                {level.min_years_experience}+ years experience
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {level.description && <p className="mt-2 text-sm text-gray-600">{level.description}</p>}
      {level.requirements && (
        <div className="mt-2">
          <p className="text-xs font-medium text-gray-500 uppercase">Requirements</p>
          <p className="mt-0.5 text-sm text-gray-600">{level.requirements}</p>
        </div>
      )}
    </div>
  );
}
