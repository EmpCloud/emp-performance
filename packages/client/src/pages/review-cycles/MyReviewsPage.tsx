import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Star, Clock, CheckCircle, FileText, PenLine } from "lucide-react";
import { apiGet } from "@/api/client";
import { getUser } from "@/lib/auth-store";
import type { ReviewView, PaginatedResponse } from "@emp-performance/shared";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";

const STATUS_BADGE: Record<string, { class: string; icon: typeof Clock }> = {
  pending: { class: "bg-gray-100 text-gray-700", icon: Clock },
  draft: { class: "bg-amber-100 text-amber-700", icon: PenLine },
  submitted: { class: "bg-green-100 text-green-700", icon: CheckCircle },
};

export function MyReviewsPage() {
  const { t } = useTranslation();
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

  const pendingCount = toComplete.filter((r) => r.status !== "submitted").length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("myReviews.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {pendingCount > 0
            ? t(
                pendingCount > 1
                  ? "myReviews.pendingCountPlural"
                  : "myReviews.pendingCountSingular",
                { count: pendingCount }
              )
            : t("myReviews.allCaughtUp")}
        </p>
      </div>

      {/* Reviews I need to complete */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{t("myReviews.reviewsToComplete")}</h2>
        {toCompleteError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm text-red-600">{t("myReviews.loadError")}</p>
          </div>
        ) : loadingToComplete ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
          </div>
        ) : toComplete.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">{t("myReviews.noReviewsAssigned")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {toComplete.map((review) => {
              const badge = STATUS_BADGE[review.status] ?? STATUS_BADGE.pending;
              const Icon = badge.icon;
              return (
                <Link
                  key={review.id}
                  to={
                    review.status === "submitted"
                      ? `/reviews/${review.id}`
                      : `/reviews/${review.id}/edit`
                  }
                  className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-200 hover:shadow-sm transition-all"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {typeLabel(review.type)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {t("myReviews.forEmployee", { id: review.employee_id })}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {t("myReviews.createdDate", { date: formatDate(review.created_at) })}
                    </p>
                  </div>
                  {review.overall_rating !== null && (
                    <div className="flex items-center gap-1 text-sm text-amber-500">
                      <Star className="h-4 w-4 fill-amber-400" />
                      {review.overall_rating}
                    </div>
                  )}
                  <StatusBadge
                    colorClass={badge.class}
                    icon={<Icon className="h-3 w-3" />}
                    className="capitalize"
                  >
                    {statusLabel(review.status)}
                  </StatusBadge>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Reviews completed for me */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{t("myReviews.reviewsAboutMe")}</h2>
        {aboutMeError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm text-red-600">{t("myReviews.loadError")}</p>
          </div>
        ) : loadingAboutMe ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
          </div>
        ) : aboutMe.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">{t("myReviews.noReviewsAboutYou")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {aboutMe.map((review) => {
              const badge = STATUS_BADGE[review.status] ?? STATUS_BADGE.pending;
              const Icon = badge.icon;
              return (
                <div
                  key={review.id}
                  className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {typeLabel(review.type)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {review.reviewer_anonymous
                          ? t("myReviews.anonymousPeer")
                          : t("myReviews.byReviewer", { id: review.reviewer_id })}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {review.submitted_at
                        ? t("myReviews.submittedDate", { date: formatDate(review.submitted_at) })
                        : t("myReviews.createdDate", { date: formatDate(review.created_at) })}
                    </p>
                  </div>
                  {review.overall_rating !== null && review.status === "submitted" && (
                    <div className="flex items-center gap-1 text-sm text-amber-500">
                      <Star className="h-4 w-4 fill-amber-400" />
                      {review.overall_rating}/5
                    </div>
                  )}
                  <StatusBadge
                    colorClass={badge.class}
                    icon={<Icon className="h-3 w-3" />}
                    className="capitalize"
                  >
                    {statusLabel(review.status)}
                  </StatusBadge>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
