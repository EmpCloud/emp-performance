import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ClipboardCheck,
  Target,
  Users,
  MessageSquare,
  ArrowRight,
  Award,
  CalendarClock,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { apiGet } from "@/api/client";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuthStore } from "@/lib/auth-store";
import { formatDate } from "@/lib/utils";
import type { PaginatedResponse, ReviewOutcomeView } from "@emp-performance/shared";

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

  const {
    data: outcomesData,
    isLoading: outcomesLoading,
    error: outcomesError,
  } = useQuery({
    queryKey: ["review-outcomes", "mine", user?.empcloudUserId, 1],
    queryFn: () =>
      apiGet<PaginatedResponse<ReviewOutcomeView>>("/review-outcomes/mine", {
        page: 1,
        perPage: 3,
      }),
    enabled: !!user,
    retry: 1,
  });

  const overview = overviewData?.data;
  const recentFeedback = feedbackData?.data?.data || [];
  const upcomingMeetings = meetingsData?.data?.data || [];
  const releasedOutcomes = outcomesData?.data?.data ?? [];
  const releasedOutcomeTotal = outcomesData?.data?.total ?? releasedOutcomes.length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">My Performance</h1>
      <p className="mt-1 text-sm text-gray-500">Your performance overview at a glance.</p>

      <ReleasedOutcomesSection
        outcomes={releasedOutcomes}
        total={releasedOutcomeTotal}
        isLoading={outcomesLoading}
        error={outcomesError}
      />

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
                        <StatusBadge colorClass="bg-pink-50 text-pink-600" className="px-2">
                          {f.type}
                        </StatusBadge>
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

function ReleasedOutcomesSection({
  outcomes,
  total,
  isLoading,
  error,
}: {
  outcomes: ReviewOutcomeView[];
  total: number;
  isLoading: boolean;
  error: unknown;
}) {
  const { t } = useTranslation();

  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="released-outcomes-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <Award className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="released-outcomes-heading" className="text-lg font-semibold text-gray-900">
              {t("reviewOutcome.releasedOutcomesTitle")}
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {t("reviewOutcome.releasedOutcomesDescription")}
            </p>
          </div>
        </div>
        {total > 3 && (
          <Link
            to="/my/performance/outcomes"
            className="inline-flex min-h-11 items-center gap-1 self-start rounded-lg px-2 text-sm font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {t("reviewOutcome.viewAllReviews")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="flex min-h-28 items-center justify-center" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-hidden="true" />
          <span className="sr-only">{t("reviewOutcome.loadingList")}</span>
        </div>
      ) : error ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4" role="alert">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
          <p className="text-sm text-red-700">{t("reviewOutcome.listLoadFailed")}</p>
        </div>
      ) : outcomes.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center">
          <p className="text-sm font-medium text-gray-700">{t("reviewOutcome.emptyTitle")}</p>
          <p className="mt-1 text-sm text-gray-500">{t("reviewOutcome.emptyDescription")}</p>
        </div>
      ) : (
        <ul className="mt-5 grid gap-3 lg:grid-cols-3">
          {outcomes.map((outcome) => {
            const appealOpen = new Date(outcome.appeal_deadline_at).getTime() >= Date.now();
            return (
              <li key={outcome.id}>
                <Link
                  to={`/my/performance/reviews/${outcome.id}`}
                  className="group flex h-full min-h-40 flex-col rounded-xl border border-gray-200 p-4 transition-[border-color,box-shadow] hover:border-brand-300 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="break-words font-semibold text-gray-900 group-hover:text-brand-700">
                        {outcome.cycle_name ?? t("reviewOutcome.releasedReview")}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {t("reviewOutcome.releasedOnShort", { date: formatDate(outcome.released_at) })}
                      </p>
                    </div>
                    <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-lg font-bold text-brand-700">
                      {Number(outcome.released_rating).toFixed(2).replace(/\.00$/, "")}
                      <span className="text-xs font-medium text-gray-500">/5</span>
                    </span>
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                      {outcome.appeal_status
                        ? t(`reviewOutcome.appealStatus.${outcome.appeal_status}`)
                        : appealOpen
                          ? t("reviewOutcome.appealBy", { date: formatDate(outcome.appeal_deadline_at) })
                          : t("reviewOutcome.appealWindowClosed")}
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600 motion-reduce:transform-none" aria-hidden="true" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
