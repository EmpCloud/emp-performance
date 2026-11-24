import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Target,
  AlertTriangle,
  MessageSquare,
  RefreshCw,
  ClipboardCheck,
  TrendingUp,
  Loader2,
  Heart,
  UserPlus,
  Users,
  Sparkles,
} from "lucide-react";
import { apiGet } from "@/api/client";
import { formatDate, getInitials } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import type { CanonicalRole } from "@emp-performance/shared";

interface OverviewData {
  activeCycles?: number;
  pendingReviews: number;
  goalCompletionRate: number;
  pipCount?: number;
  feedbackCount: number;
  totalGoals: number;
  completedGoals: number;
}

// #1: link each stat card to its detail page so users can drill in.
const STAT_CARDS = [
  { key: "activeCycles", labelKey: "dashboard.activeCycles", icon: RefreshCw, color: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400", href: "/review-cycles" },
  { key: "pendingReviews", labelKey: "dashboard.pendingReviews", icon: ClipboardCheck, color: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400", href: "/reviews/my" },
  { key: "goalCompletionRate", labelKey: "dashboard.goalCompletion", icon: Target, color: "bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400", suffix: "%", href: "/goals" },
  { key: "pipCount", labelKey: "dashboard.activePips", icon: AlertTriangle, color: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400", href: "/pips" },
  { key: "feedbackCount", labelKey: "dashboard.totalFeedback", icon: MessageSquare, color: "bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400", href: "/feedback" },
] as const;

const PERSONAL_STAT_CARDS = [
  { ...STAT_CARDS[1], href: "/my/reviews" },
  { ...STAT_CARDS[2], href: "/my/goals" },
  { ...STAT_CARDS[4], labelKey: "dashboard.feedbackReceived", href: "/my/feedback" },
] as const;

// Keep the organization view aligned with the analytics endpoint's roles.
const ORGANIZATION_OVERVIEW_ROLES = new Set<CanonicalRole>([
  "super_admin", "org_admin", "hr_admin", "hr_manager", "service",
]);

// Quick actions — the everyday self-service tasks, visible to every role.
const QUICK_ACTIONS = [
  { labelKey: "nav.myPerformance", icon: TrendingUp, to: "/my", tone: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400" },
  { labelKey: "nav.myGoals", icon: Target, to: "/my/goals", tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" },
  { labelKey: "nav.myReviews", icon: ClipboardCheck, to: "/my/reviews", tone: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400" },
  { labelKey: "nav.myOneOnOnes", icon: Users, to: "/my/one-on-ones", tone: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400" },
  { labelKey: "nav.kudosWall", icon: Heart, to: "/feedback/wall", tone: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400" },
  { labelKey: "nav.nominatePeers", icon: UserPlus, to: "/peer-reviews/nominate", tone: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" },
];

// Goal status → badge + dot styling for the activity feed and the progress
// breakdown. Raw "— in_progress" text reads like a debug dump; a colored
// badge carries the same info at a glance.
const GOAL_STATUS: Record<string, { labelKey: string; badge: string; dot: string }> = {
  completed: { labelKey: "dashboard.status.completed", badge: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400", dot: "bg-green-500" },
  in_progress: { labelKey: "dashboard.status.inProgress", badge: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400", dot: "bg-blue-500" },
  at_risk: { labelKey: "dashboard.status.atRisk", badge: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400", dot: "bg-amber-500" },
  not_started: { labelKey: "dashboard.status.notStarted", badge: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300", dot: "bg-gray-400" },
  cancelled: { labelKey: "dashboard.status.cancelled", badge: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400", dot: "bg-red-500" },
};

interface RecentGoal {
  id: string;
  title: string;
  status: string;
  updated_at?: string;
  created_at: string;
}

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
}

interface PaginatedResp<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

const RANGE_OPTIONS = [
  { labelKey: "dashboard.lastDays", days: 7 },
  { labelKey: "dashboard.lastDays", days: 30 },
  { labelKey: "dashboard.lastDays", days: 90 },
] as const;

type ActivityEntry = {
  id: string;
  to: string;
  text: string;
  time: string;
  kind: "notification" | "goal";
  status?: string;
};

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const [rangeDays, setRangeDays] = useState<number>(30);
  const user = useAuthStore((state) => state.user);
  const userId = user?.empcloudUserId;
  const orgId = user?.empcloudOrgId;
  const organizationView = !!user && ORGANIZATION_OVERVIEW_ROLES.has(user.role);
  const statCards = organizationView ? STAT_CARDS : PERSONAL_STAT_CARDS;
  const displayName = user ? `${user.firstName} ${user.lastName}` : "User";
  const roleLabel = t(`roles.${user?.role ?? "employee"}`, { defaultValue: t("roles.employee") });

  const overviewQuery = useQuery({
    queryKey: organizationView
      ? ["analytics", "overview", orgId, userId]
      : ["analytics", "my-overview", userId, orgId],
    queryFn: () => apiGet<OverviewData>(organizationView ? "/analytics/overview" : "/analytics/my-overview"),
    enabled: !!user,
  });

  const overview = overviewQuery.data?.data;
  const overviewFailed = overviewQuery.isError || (!overviewQuery.isPending && !overview);

  // Real activity feed: recent notifications + recently updated goals, merged
  // and filtered by the selected date range (PL8 — replaces hardcoded data).
  const notificationsQuery = useQuery({
    queryKey: ["dashboard", "activity", "notifications", orgId, userId],
    queryFn: () => apiGet<PaginatedResp<NotificationItem>>("/notifications/feed", { page: 1, perPage: 15 }),
    enabled: !!user,
  });
  const goalsQuery = useQuery({
    queryKey: ["dashboard", "activity", "goals", orgId, userId, organizationView],
    queryFn: () =>
      apiGet<PaginatedResp<RecentGoal>>("/goals", {
        page: 1,
        perPage: 15,
        sort: "updated_at",
        order: "desc",
        ...(!organizationView && { employeeId: userId }),
      }),
    enabled: !!user,
  });
  const notifData = notificationsQuery.data;
  const goalsData = goalsQuery.data;
  const activityLoading = notificationsQuery.isLoading || goalsQuery.isLoading;
  const activityFailed = notificationsQuery.isError || goalsQuery.isError;
  const activityFetching = notificationsQuery.isFetching || goalsQuery.isFetching;

  const since = Date.now() - rangeDays * 24 * 60 * 60 * 1000;

  const activity: ActivityEntry[] = [];
  for (const n of notifData?.data?.data ?? []) {
    if (new Date(n.created_at).getTime() < since) continue;
    activity.push({
      id: `n-${n.id}`,
      to: n.link || "/notifications",
      text: n.title,
      time: n.created_at,
      kind: "notification",
    });
  }
  for (const g of goalsData?.data?.data ?? []) {
    const ts = g.updated_at || g.created_at;
    if (new Date(ts).getTime() < since) continue;
    activity.push({
      id: `g-${g.id}`,
      to: `${organizationView ? "/goals" : "/my/goals"}/${g.id}`,
      text: g.title,
      time: ts,
      kind: "goal",
      status: g.status,
    });
  }
  activity.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  const recentActivity = activity.slice(0, 8);

  // Status breakdown of the recently-updated goals — fills the Goals Progress
  // card with a real distribution instead of a lone progress bar.
  const statusCounts: Record<string, number> = {};
  for (const g of goalsData?.data?.data ?? []) {
    statusCounts[g.status] = (statusCounts[g.status] || 0) + 1;
  }

  return (
    <div className="space-y-4">
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-brand-50 via-white to-white px-5 py-4 dark:border-gray-800 dark:from-brand-500/10 dark:via-transparent">
        <Sparkles className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 text-brand-500/10" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-base font-bold text-white shadow-sm shadow-brand-500/30">
              {getInitials(displayName)}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900">
                {t("dashboard.welcomeBack", { name: user?.firstName || t("dashboard.there") })}
              </h1>
              <p className="text-sm text-gray-500">
                {roleLabel} · {organizationView
                  ? t("dashboard.overviewSubtitle")
                  : t("dashboard.personalOverviewSubtitle", { defaultValue: "Your performance overview and key metrics." })}
              </p>
            </div>
          </div>
          <select
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {RANGE_OPTIONS.map((r) => (
              <option key={r.days} value={r.days}>
                {t(r.labelKey, { count: r.days })}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stat Cards — #1: clickable, each redirects to its detail page */}
      {overviewFailed ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            {t("dashboard.overviewLoadError", { defaultValue: "Unable to load performance metrics." })}
          </p>
          <button
            type="button"
            onClick={() => { void overviewQuery.refetch(); }}
            disabled={overviewQuery.isFetching}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
          >
            {t("dashboard.retryOverview", { defaultValue: "Retry metrics" })}
          </button>
        </div>
      ) : (
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${organizationView ? "lg:grid-cols-5" : "lg:grid-cols-3"}`}>
        {statCards.map((card) => {
          const Icon = card.icon;
          const value = overview?.[card.key];
          return (
            <Link
              key={card.key}
              to={card.href}
              className="group block rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${card.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  {overviewQuery.isLoading ? (
                    <Loader2 role="status" aria-label={t("common.loading")} className="h-6 w-6 animate-spin text-gray-300" />
                  ) : (
                    <p className="text-2xl font-bold tracking-tight text-gray-900">
                      {value ?? "—"}
                      {"suffix" in card ? card.suffix : ""}
                    </p>
                  )}
                  <p className="truncate text-sm text-gray-500">{card.labelKey === "dashboard.feedbackReceived"
                    ? t(card.labelKey, { defaultValue: "Feedback Received" })
                    : t(card.labelKey)}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      )}

      {/* ── Quick Actions ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">{t("dashboard.quickActions")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.labelKey}
              to={a.to}
              className="group flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3 text-center transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl transition group-hover:scale-105 ${a.tone}`}>
                <a.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="text-xs font-medium text-gray-700">{t(a.labelKey)}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Insights Row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Goals Progress */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t("dashboard.goalsProgress")}</h2>
              <p className="mt-0.5 text-sm text-gray-500">{organizationView
                ? t("dashboard.goalsProgressSubtitle")
                : t("dashboard.personalGoalsProgressSubtitle", { defaultValue: "Your goal completion" })}</p>
            </div>
            <Link to={organizationView ? "/goals" : "/my/goals"} className="text-sm font-medium text-brand-600 hover:text-brand-700">
              {t("dashboard.viewAll")}
            </Link>
          </div>
          {overviewQuery.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 role="status" aria-label={t("common.loading")} className="h-6 w-6 animate-spin text-gray-300" />
            </div>
          ) : overviewFailed ? (
            <p className="py-6 text-sm text-red-700">
              {t("dashboard.goalsProgressUnavailable", { defaultValue: "Goal progress is unavailable. Retry the performance metrics above." })}
            </p>
          ) : overview && (
          <div className="mt-4">
            <div className="flex items-end justify-between text-sm">
              <span className="text-gray-600">{t("dashboard.status.completed")}</span>
              <span className="font-semibold text-gray-900">
                {overview.completedGoals}
                <span className="font-normal text-gray-400"> / {t("dashboard.goalsCount", { count: overview.totalGoals })}</span>
              </span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all"
                style={{ width: `${overview.goalCompletionRate}%` }}
              />
            </div>
            <p className="mt-1.5 text-right text-xs font-semibold text-brand-700">
              {overview.goalCompletionRate}%
            </p>
          </div>
          )}
          {/* Status distribution of recently-updated goals */}
          {!goalsQuery.isError && Object.keys(statusCounts).length > 0 && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {t("dashboard.recentlyUpdated")}
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(statusCounts).map(([status, count]) => {
                  const s = GOAL_STATUS[status] ?? GOAL_STATUS.not_started;
                  return (
                    <span
                      key={status}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.badge}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                      {t(s.labelKey)}
                      <span className="font-bold">{count}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Recent Activity — real notification + goal feed (PL8) */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t("dashboard.recentActivity")}</h2>
              <p className="mt-0.5 text-sm text-gray-500">{t("dashboard.recentActivitySubtitle")}</p>
            </div>
            <Link to="/notifications" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              {t("dashboard.viewAll")}
            </Link>
          </div>
          <div className="mt-3 space-y-1">
            {activityFailed && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700">
                  {t("dashboard.activityLoadError", { defaultValue: "Some recent activity could not be loaded." })}
                </p>
                <button
                  type="button"
                  onClick={() => { void Promise.all([notificationsQuery.refetch(), goalsQuery.refetch()]); }}
                  disabled={activityFetching}
                  className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
                >
                  {t("dashboard.retryActivity", { defaultValue: "Retry activity" })}
                </button>
              </div>
            )}
            {activityLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 role="status" aria-label={t("common.loading")} className="h-6 w-6 animate-spin text-gray-300" />
              </div>
            ) : recentActivity.length === 0 && !activityFailed ? (
              <p className="px-3 py-6 text-center text-sm text-gray-400">
                {t("dashboard.noActivity")}
              </p>
            ) : (
              recentActivity.map((a) => {
                const s = a.kind === "goal" ? GOAL_STATUS[a.status ?? ""] ?? GOAL_STATUS.not_started : null;
                return (
                  <Link
                    key={a.id}
                    to={a.to}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        a.kind === "goal"
                          ? "bg-green-50 dark:bg-green-500/15"
                          : "bg-purple-50 dark:bg-purple-500/15"
                      }`}
                    >
                      {a.kind === "goal" ? (
                        <Target className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-700">{a.text}</p>
                      <p className="text-xs text-gray-400">{formatDate(a.time, i18n.resolvedLanguage)}</p>
                    </div>
                    {s && (
                      <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.badge}`}>
                        {t(s.labelKey)}
                      </span>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
