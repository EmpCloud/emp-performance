import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import toast from "react-hot-toast";

interface OrgUser {
  id: number;
  full_name: string;
  email: string;
}

export function PIPCreatePage() {
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState("");
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: usersData } = useQuery({
    queryKey: ["users", "list"],
    queryFn: () => apiGet<OrgUser[]>("/users"),
  });
  const orgUsers: OrgUser[] = usersData?.data ?? [];

  const mutation = useMutation({
    mutationFn: (body: any) => apiPost("/pips", body),
    onSuccess: (res: any) => {
      toast.success("PIP created");
      const id = res?.data?.id;
      navigate(id ? `/pips/${id}` : "/pips");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to create PIP"),
  });

  const dateError =
    startDate && endDate && endDate < startDate
      ? "End date cannot be before start date"
      : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId) return toast.error("Select an employee");
    if (reason.trim().length < 10) return toast.error("Reason must be at least 10 characters");
    if (dateError) return;
    mutation.mutate({
      employee_id: Number(employeeId),
      reason: reason.trim(),
      start_date: startDate,
      end_date: endDate,
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
          <h1 className="text-2xl font-bold text-gray-900">Create PIP</h1>
          <p className="mt-1 text-sm text-gray-500">Start a new performance improvement plan.</p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-6 max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700">Employee <span className="text-red-500">*</span></label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">— Select an employee —</option>
            {orgUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.email})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Reason <span className="text-red-500">*</span></label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            required
            minLength={10}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Document specific performance gaps and the rationale for opening this PIP."
          />
          <p className="mt-1 text-xs text-gray-500">Minimum 10 characters.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Start Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">End Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate || undefined}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {dateError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {dateError}
          </div>
        )}

        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <button
            type="submit"
            disabled={mutation.isPending || !!dateError}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {mutation.isPending ? "Creating..." : "Create PIP"}
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
