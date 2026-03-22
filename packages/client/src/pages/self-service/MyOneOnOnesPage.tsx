import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Users,
  Calendar,
  Clock,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { apiGet } from "@/api/client";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";

interface Meeting {
  id: string;
  title: string;
  employee_id: number;
  manager_id: number;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
}

export function MyOneOnOnesPage() {
  const user = useAuthStore((s) => s.user);

  const { data, isLoading } = useQuery({
    queryKey: ["meetings", "my", user?.empcloudUserId],
    queryFn: () =>
      apiGet<{ data: Meeting[]; total: number }>("/meetings", {
        employeeId: user?.empcloudUserId,
      }),
    enabled: !!user,
  });

  const meetings = data?.data?.data || [];
  const upcoming = meetings.filter((m) => m.status === "scheduled");
  const past = meetings.filter((m) => m.status === "completed");

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">My 1-on-1s</h1>
      <p className="mt-1 text-sm text-gray-500">
        Your upcoming and past one-on-one meetings.
      </p>

      {isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No meetings yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Your 1-on-1 meetings will appear here once scheduled.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                Upcoming ({upcoming.length})
              </h2>
              <div className="space-y-3">
                {upcoming.map((m) => (
                  <MeetingRow key={m.id} meeting={m} />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-500 mb-3">
                Past ({past.length})
              </h2>
              <div className="space-y-3">
                {past.map((m) => (
                  <MeetingRow key={m.id} meeting={m} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function MeetingRow({ meeting }: { meeting: Meeting }) {
  const isCompleted = meeting.status === "completed";

  return (
    <Link
      to={`/my/one-on-ones/${meeting.id}`}
      className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
          isCompleted ? "bg-green-50" : "bg-blue-50"
        }`}
      >
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        ) : (
          <Calendar className="h-5 w-5 text-blue-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-gray-900 truncate">{meeting.title}</h3>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(meeting.scheduled_at)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {meeting.duration_minutes} min
          </span>
        </div>
      </div>
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          isCompleted ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"
        }`}
      >
        {meeting.status}
      </span>
    </Link>
  );
}
