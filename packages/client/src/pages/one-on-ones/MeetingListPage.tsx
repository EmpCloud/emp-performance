import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Users, Calendar, Clock, Loader2, CheckCircle2 } from "lucide-react";
import { apiGet } from "@/api/client";
import { formatDate } from "@/lib/utils";

interface Meeting {
  id: string;
  title: string;
  employee_id: number;
  manager_id: number;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
}

export function MeetingListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["meetings"],
    queryFn: () => apiGet<{ data: Meeting[]; total: number }>("/meetings"),
  });

  const meetings = data?.data?.data || [];
  const upcoming = meetings.filter((m) => m.status === "scheduled");
  const past = meetings.filter((m) => m.status === "completed");

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">1-on-1 Meetings</h1>
          <p className="mt-1 text-sm text-gray-500">Schedule and track one-on-one meetings.</p>
        </div>
        <Link
          to="/one-on-ones/new"
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          New Meeting
        </Link>
      </div>

      {isLoading ? (
        <div className="mt-12 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No meetings yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Schedule your first 1-on-1 meeting.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                Upcoming ({upcoming.length})
              </h2>
              <div className="space-y-3">
                {upcoming.map((meeting) => (
                  <MeetingCard key={meeting.id} meeting={meeting} />
                ))}
              </div>
            </section>
          )}

          {/* Past */}
          {past.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-500 mb-3">
                Past ({past.length})
              </h2>
              <div className="space-y-3">
                {past.map((meeting) => (
                  <MeetingCard key={meeting.id} meeting={meeting} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const isCompleted = meeting.status === "completed";

  return (
    <Link
      to={`/one-on-ones/${meeting.id}`}
      className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
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
          isCompleted
            ? "bg-green-50 text-green-700"
            : "bg-blue-50 text-blue-700"
        }`}
      >
        {meeting.status}
      </span>
    </Link>
  );
}
