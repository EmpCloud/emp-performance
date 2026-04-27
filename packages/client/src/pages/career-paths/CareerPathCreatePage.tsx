import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { apiPost } from "@/api/client";
import toast from "react-hot-toast";

export function CareerPathCreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("");
  const [isActive, setIsActive] = useState(true);

  const mutation = useMutation({
    mutationFn: (body: any) => apiPost("/career-paths", body),
    onSuccess: (res: any) => {
      toast.success("Career path created");
      const id = res?.data?.id;
      navigate(id ? `/career-paths/${id}` : "/career-paths");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to create career path"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error("Name is required");
    mutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      department: department.trim() || undefined,
      is_active: isActive,
    });
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Career Path</h1>
          <p className="mt-1 text-sm text-gray-500">Define a new career progression path. Add levels after creation.</p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-6 max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700">Name <span className="text-red-500">*</span></label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={200}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="e.g. Software Engineer Track"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Outline the progression and what this track is intended for..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Department</label>
          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            maxLength={100}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="e.g. Engineering"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <label htmlFor="active" className="text-sm text-gray-700">
            Active (employees can be assigned to this path)
          </label>
        </div>

        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {mutation.isPending ? "Creating..." : "Create Path"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
