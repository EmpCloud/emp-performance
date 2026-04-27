import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ClipboardCheck,
  Target,
  Users,
  MessageSquare,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { apiGet } from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";

export function MyPerformancePage() {
  const user = useAuthStore((s) => s.user);

  const { data: overviewData, isLoading, error: overviewError } = useQuery({
    queryKey: ["analytics", "my-overview", user?.empcloudUserId],
    queryFn: () => apiGet<any>("/analytics/my-overview"),
    enabled: !!user,
    retry: 1,
  });

  const { data: feedbackData } = useQuery({
    queryKey: ["feedback", "received"],
    queryFn: () => apiGet<any>("/feedback/received", { limit: 3 }),
    retry: 1,
  });

  const { data: meetingsData } = useQuery({
    queryKey: ["meetings", "my", user?.empcloudUserId],
    queryFn: () =>
      apiGet<any>("/meetings", {
        employeeId: user?.empcloudUserId,
        limit: 3,
        status: "scheduled",
      }),
    enabled: !!user,
    retry: 1,
  });

  const overview = overviewData?.data;
  const recentFeedback = feedbackData?.data?.data || [];
  const upcomingMeetings = meetingsData?.data?.data || [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">My Performance</h1>
      <p className="mt-1 text-sm text-gray-500">Your performance overview at a glance.</p>

      {isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : overviewError ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">Unable to load performance overview. Please try again later.</p>
        </div>
      ) : (
        <>
          {/* Quick Stats */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <QuickStatCard
              icon={<ClipboardCheck className="h-5 w-5 text-blue-600" />}
              label="Pending Reviews"
              value={overview?.pendingReviews ?? 0}
              linkTo="/reviews/my"
              linkLabel="View reviews"
              color="bg-blue-50"
            />
            <QuickStatCard
              icon={<Target className="h-5 w-5 text-green-600" />}
              label="Goal Completion"
              value={`${overview?.goalCompletionRate ?? 0}%`}
              linkTo="/my/goals"
              linkLabel="View goals"
              color="bg-green-50"
            />
            <QuickStatCard
              icon={<Users className="h-5 w-5 text-purple-600" />}
              label="Upcoming 1-on-1s"
              value={upcomingMeetings.length}
              linkTo="/my/one-on-ones"
              linkLabel="View meetings"
              color="bg-purple-50"
            />
            <QuickStatCard
              icon={<MessageSquare className="h-5 w-5 text-amber-600" />}
              label="Feedback Received"
              value={overview?.feedbackCount ?? 0}
              linkTo="/my/feedback"
              linkLabel="View feedback"
              color="bg-amber-50"
            />
          </div>

          {/* Two column layout */}
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Upcoming 1-on-1s */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Upcoming 1-on-1s</h2>
                <Link
                  to="/my/one-on-ones"
                  className="text-sm text-brand-600 hover:text-brand-700"
                >
                  View all
                </Link>
              </div>
              {upcomingMeetings.length === 0 ? (
                <p className="text-sm text-gray-400">No upcoming meetings.</p>
              ) : (
                <div className="space-y-3">
                  {upcomingMeetings.map((m: any) => (
                    <Link
                      key={m.id}
                      to={`/my/one-on-ones/${m.id}`}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50"
                    >
                      <Users className="h-4 w-4 text-gray-400" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{m.title}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(m.scheduled_at).toLocaleDateString()} - {m.duration_minutes}min
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-300" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Feedback */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Recent Feedback</h2>
                <Link
                  to="/my/feedback"
                  className="text-sm text-brand-600 hover:text-brand-700"
                >
                  View all
                </Link>
              </div>
              {recentFeedback.length === 0 ? (
                <p className="text-sm text-gray-400">No feedback received yet.</p>
              ) : (
                <div className="space-y-3">
                  {recentFeedback.map((f: any) => (
                    <div key={f.id} className="rounded-lg px-3 py-2 hover:bg-gray-50">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-pink-50 px-2 py-0.5 text-xs font-medium text-pink-600">
                          {f.type}
                        </span>
                        <span className="text-xs text-gray-400">
                          from {f.is_anonymous ? "Anonymous" : `User #${f.from_user_id}`}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-700 line-clamp-2">{f.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function QuickStatCard({
  icon,
  label,
  value,
  linkTo,
  linkLabel,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  linkTo: string;
  linkLabel: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
      <Link
        to={linkTo}
        className="mt-3 flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
      >
        {linkLabel} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
