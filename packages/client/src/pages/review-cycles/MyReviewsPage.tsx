import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ClipboardCheck,
  Clock,
  FileText,
  PenLine,
  Star,
  Users,
} from "lucide-react";
import { apiGet } from "@/api/client";
import { getUser } from "@/lib/auth-store";
import type { ReviewView, PaginatedResponse } from "@emp-performance/shared";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";

const STATUS_BADGE: Record<string, { class: string; accent: string; icon: LucideIcon }> = {
  pending: {
    class: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
    accent: "bg-slate-400",
    icon: Clock,
  },
  draft: {
    class: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    accent: "bg-amber-500",
    icon: PenLine,
  },
  submitted: {
    class: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    accent: "bg-emerald-500",
    icon: CheckCircle,
  },
};

const REVIEW_TYPE_ICON: Record<string, LucideIcon> = {
  self: PenLine,
  manager: ClipboardCheck,
  peer: Users,
};

type ReviewTab = "to-complete" | "submitted" | "about-me";

type ReviewCardProps = {
  review: ReviewView;
  title: string;
  context: string;
  dateText: string;
  statusText: string;
  showRating: boolean;
  href?: string;
};

function ReviewCard({
  review,
  title,
  context,
  dateText,
  statusText,
  showRating,
  href,
}: ReviewCardProps) {
  const badge = STATUS_BADGE[review.status] ?? STATUS_BADGE.pending;
  const StatusIcon = badge.icon;
  const TypeIcon = REVIEW_TYPE_ICON[review.type] ?? FileText;
  const cardClassName = [
    "group relative flex min-h-[144px] flex-col justify-between overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm",
    "transition-[border-color,box-shadow] duration-200 dark:border-gray-800 dark:bg-gray-900",
    href
      ? "hover:border-brand-200 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20 dark:hover:border-brand-500/40"
      : "",
  ].join(" ");

  const content = (
    <>
      <span
        className={["absolute inset-y-4 left-0 w-1 rounded-r-full", badge.accent].join(" ")}
        aria-hidden="true"
      />
      <div className="flex items-start gap-3 pl-1">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/20">
          <TypeIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-start justify-between gap-2">
            <span>
              <span className="block text-sm font-semibold text-gray-950 dark:text-white">{title}</span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{context}</span>
            </span>
            <StatusBadge
              colorClass={badge.class}
              icon={<StatusIcon className="h-3 w-3" aria-hidden="true" />}
              className="shrink-0 capitalize"
            >
              {statusText}
            </StatusBadge>
          </span>
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3 pl-1 dark:border-gray-800">
        <span className="text-xs text-gray-500 dark:text-gray-400">{dateText}</span>
        <span className="flex items-center gap-3">
          {showRating && review.overall_rating !== null && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600 tabular-nums dark:text-amber-300">
              <Star className="h-4 w-4 fill-amber-400" aria-hidden="true" />
              {review.overall_rating}/5
            </span>
          )}
          {href && (
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-400 transition-[border-color,color,background-color] group-hover:border-brand-200 group-hover:bg-brand-50 group-hover:text-brand-600 dark:border-gray-700 dark:text-gray-500 dark:group-hover:border-brand-500/30 dark:group-hover:bg-brand-500/10 dark:group-hover:text-brand-300">
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          )}
        </span>
      </div>
    </>
  );

  if (href) {
    return (
      <Link to={href} className={cardClassName}>
        {content}
      </Link>
    );
  }

  return <article className={cardClassName}>{content}</article>;
}

export function MyReviewsPage() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<ReviewTab>("to-complete");
  const user = getUser();
  const userId = user?.empcloudUserId;

  const typeLabel = (type: string) => {
    switch (type) {
      case "self":
        return t("myReviews.typeSelf");
      case "manager":
        return t("myReviews.typeManager");
      case "peer":
        return t("myReviews.typePeer");
      default:
        return type;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "submitted":
        return t("myReviews.statusSubmitted");
      case "draft":
        return t("myReviews.statusDraft");
      default:
        return t("myReviews.statusPending");
    }
  };

  // Reviews I need to complete (where I am the reviewer)
  const { data: toCompleteData, isLoading: loadingToComplete, error: toCompleteError } = useQuery({
    queryKey: ["my-reviews-to-complete", userId],
    queryFn: () =>
      apiGet<PaginatedResponse<ReviewView>>("/reviews", {
        reviewer_id: userId,
        perPage: 50,
      }),
    enabled: Boolean(userId),
    retry: 1,
  });

  // Reviews about me (where I am the employee/reviewee)
  const { data: aboutMeData, isLoading: loadingAboutMe, error: aboutMeError } = useQuery({
    queryKey: ["my-reviews-about-me", userId],
    queryFn: () =>
      apiGet<PaginatedResponse<ReviewView>>("/reviews", {
        employee_id: userId,
        perPage: 50,
      }),
    enabled: Boolean(userId),
    retry: 1,
  });

  const toComplete = toCompleteData?.data?.data ?? [];
  const aboutMe = aboutMeData?.data?.data ?? [];

  const actionableReviews = toComplete.filter((review) => review.status !== "submitted");
  const submittedReviews = toComplete.filter((review) => review.status === "submitted");
  const draftCount = actionableReviews.filter((review) => review.status === "draft").length;
  const pendingCount = actionableReviews.length;

  const activeReviews =
    activeTab === "to-complete"
      ? actionableReviews
      : activeTab === "submitted"
        ? submittedReviews
        : aboutMe;
  const activeLoading = activeTab === "about-me" ? loadingAboutMe : loadingToComplete;
  const activeError = activeTab === "about-me" ? aboutMeError : toCompleteError;
  const activeTitle =
    activeTab === "to-complete"
      ? t("myReviews.reviewsToComplete")
      : activeTab === "submitted"
        ? t("myReviews.statusSubmitted")
        : t("myReviews.reviewsAboutMe");
  const activeEmptyText =
    activeTab === "about-me"
      ? t("myReviews.noReviewsAboutYou")
      : activeTab === "submitted"
        ? t("myReviews.allCaughtUp")
        : t("myReviews.noReviewsAssigned");

  const summaryMetrics: Array<{
    label: string;
    value: number | string;
    icon: LucideIcon;
    iconClass: string;
    iconSurface: string;
  }> = [
    {
      label: t("myReviews.reviewsToComplete"),
      value: loadingToComplete || toCompleteError ? "—" : pendingCount,
      icon: ClipboardCheck,
      iconClass: "text-blue-600 dark:text-blue-300",
      iconSurface: "bg-blue-50 ring-blue-100 dark:bg-blue-500/15 dark:ring-blue-500/20",
    },
    {
      label: t("myReviews.statusDraft"),
      value: loadingToComplete || toCompleteError ? "—" : draftCount,
      icon: PenLine,
      iconClass: "text-amber-600 dark:text-amber-300",
      iconSurface: "bg-amber-50 ring-amber-100 dark:bg-amber-500/15 dark:ring-amber-500/20",
    },
    {
      label: t("myReviews.statusSubmitted"),
      value: loadingToComplete || toCompleteError ? "—" : submittedReviews.length,
      icon: CheckCircle,
      iconClass: "text-emerald-600 dark:text-emerald-300",
      iconSurface:
        "bg-emerald-50 ring-emerald-100 dark:bg-emerald-500/15 dark:ring-emerald-500/20",
    },
    {
      label: t("myReviews.reviewsAboutMe"),
      value: loadingAboutMe || aboutMeError ? "—" : aboutMe.length,
      icon: Users,
      iconClass: "text-violet-600 dark:text-violet-300",
      iconSurface:
        "bg-violet-50 ring-violet-100 dark:bg-violet-500/15 dark:ring-violet-500/20",
    },
  ];

  const tabs: Array<{ id: ReviewTab; label: string; count: number }> = [
    { id: "to-complete", label: t("myReviews.reviewsToComplete"), count: pendingCount },
    { id: "submitted", label: t("myReviews.statusSubmitted"), count: submittedReviews.length },
    { id: "about-me", label: t("myReviews.reviewsAboutMe"), count: aboutMe.length },
  ];

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 pb-10">
      <header className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-white via-white to-emerald-50 p-5 shadow-sm dark:border-emerald-500/20 dark:from-gray-900 dark:via-gray-900 dark:to-emerald-950/30 sm:p-6">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full border-[32px] border-emerald-100/50 dark:border-emerald-500/10"
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
            <ClipboardCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-950 dark:text-white">
              {t("myReviews.title")}
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300" aria-live="polite">
              {loadingToComplete
                ? t("common.loading")
                : toCompleteError
                  ? t("myReviews.loadError")
                  : pendingCount > 0
                    ? t(
                        pendingCount > 1
                          ? "myReviews.pendingCountPlural"
                          : "myReviews.pendingCountSingular",
                        { count: pendingCount }
                      )
                    : t("myReviews.allCaughtUp")}
            </p>
          </div>
        </div>
      </header>

      <section
        aria-label={t("myReviews.title")}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {summaryMetrics.map((metric) => {
          const MetricIcon = metric.icon;
          return (
            <article
              key={metric.label}
              className="flex min-h-[108px] items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:gap-4"
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${metric.iconSurface} ${metric.iconClass}`}
              >
                <MetricIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-2xl font-bold tabular-nums text-gray-950 dark:text-white">
                  {metric.value}
                </p>
                <p className="mt-0.5 truncate text-xs font-medium text-gray-500 dark:text-gray-400 sm:text-sm">
                  {metric.label}
                </p>
              </div>
            </article>
          );
        })}
      </section>

      <section aria-labelledby="review-list-heading" className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 px-1">
            <h2
              id="review-list-heading"
              className="truncate text-base font-semibold text-gray-950 dark:text-white"
            >
              {activeTitle}
            </h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {activeLoading ? "—" : activeReviews.length}
            </span>
          </div>
          <div
            role="group"
            aria-label={t("myReviews.title")}
            className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 dark:bg-gray-800"
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 ${
                    isActive
                      ? "bg-white text-gray-950 shadow-sm dark:bg-gray-700 dark:text-white"
                      : "text-gray-600 hover:bg-white/60 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-gray-700/60 dark:hover:text-white"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${
                      isActive
                        ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                        : "bg-white text-gray-500 dark:bg-gray-900 dark:text-gray-400"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {activeError ? (
          <div
            role="alert"
            className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center dark:border-red-500/20 dark:bg-red-950/20"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">
              {t("myReviews.loadError")}
            </p>
          </div>
        ) : activeLoading ? (
          <div
            role="status"
            className="grid grid-cols-1 gap-3 xl:grid-cols-2"
            aria-label={t("common.loading")}
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="min-h-[144px] animate-pulse rounded-2xl border border-gray-200 bg-white p-4 motion-reduce:animate-none dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex gap-3">
                  <div className="h-11 w-11 rounded-xl bg-gray-100 dark:bg-gray-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-36 rounded bg-gray-100 dark:bg-gray-800" />
                    <div className="h-3 w-48 max-w-full rounded bg-gray-100 dark:bg-gray-800" />
                  </div>
                </div>
                <div className="mt-8 h-px bg-gray-100 dark:bg-gray-800" />
                <div className="mt-3 h-3 w-28 rounded bg-gray-100 dark:bg-gray-800" />
              </div>
            ))}
            <span className="sr-only">{t("common.loading")}</span>
          </div>
        ) : activeReviews.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-900">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
              <FileText className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-300">
              {activeEmptyText}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {activeReviews.map((review) => {
              const isAboutMe = activeTab === "about-me";
              const context = isAboutMe
                ? review.reviewer_anonymous || !review.reviewer_id
                  ? t("myReviews.anonymousPeer")
                  : t("myReviews.byReviewer", { id: review.reviewer_id })
                : t("myReviews.forEmployee", { id: review.employee_id });
              const dateText =
                isAboutMe && review.submitted_at
                  ? t("myReviews.submittedDate", {
                      date: formatDate(review.submitted_at, i18n.resolvedLanguage),
                    })
                  : t("myReviews.createdDate", {
                      date: formatDate(review.created_at, i18n.resolvedLanguage),
                    });
              const href = isAboutMe
                ? undefined
                : review.status === "submitted"
                  ? `/reviews/${review.id}`
                  : `/reviews/${review.id}/edit`;

              return (
                <li key={review.id}>
                  <ReviewCard
                    review={review}
                    title={typeLabel(review.type)}
                    context={context}
                    dateText={dateText}
                    statusText={statusLabel(review.status)}
                    showRating={!isAboutMe || review.status === "submitted"}
                    href={href}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
