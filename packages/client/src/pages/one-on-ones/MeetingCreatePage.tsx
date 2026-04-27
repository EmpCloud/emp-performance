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

export function MeetingCreatePage() {
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState("");
  const [title, setTitle] = useState("Weekly 1-on-1");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("10:00");
  const [duration, setDuration] = useState(30);

  const { data: usersData } = useQuery({
    queryKey: ["users", "list"],
    queryFn: () => apiGet<OrgUser[]>("/users"),
  });
  const orgUsers: OrgUser[] = usersData?.data ?? [];

  const mutation = useMutation({
    mutationFn: (body: any) => apiPost("/meetings", body),
    onSuccess: (res: any) => {
      toast.success("Meeting scheduled");
      const id = res?.data?.id;
      navigate(id ? `/meetings/${id}` : "/meetings");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || "Failed to schedule meeting"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId) return toast.error("Select an employee");
    if (!scheduledDate) return toast.error("Pick a date");
    const isoLocal = `${scheduledDate}T${scheduledTime || "10:00"}:00`;
    const scheduledAt = new Date(isoLocal).toISOString();
    mutation.mutate({
      employee_id: Number(employeeId),
      title: title.trim() || "1-on-1",
      scheduled_at: scheduledAt,
      duration_minutes: Number(duration) || 30,
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
          <h1 className="text-2xl font-bold text-gray-900">Schedule Meeting</h1>
          <p className="mt-1 text-sm text-gray-500">Schedule a new 1-on-1 meeting.</p>
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
          <label className="block text-sm font-medium text-gray-700">Title <span className="text-red-500">*</span></label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={2}
            maxLength={200}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="e.g. Weekly check-in"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              required
              min={new Date().toISOString().slice(0, 10)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Time</label>
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Duration (min)</label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={45}>45</option>
              <option value={60}>60</option>
              <option value={90}>90</option>
              <option value={120}>120</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {mutation.isPending ? "Scheduling..." : "Schedule"}
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
