import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Star, Clock, CheckCircle, FileText, PenLine } from "lucide-react";
import { apiGet } from "@/api/client";
import { getUser } from "@/lib/auth-store";
import type { Review, PaginatedResponse } from "@emp-performance/shared";
import { formatDate } from "@/lib/utils";

const STATUS_BADGE: Record<string, { class: string; icon: typeof Clock }> = {
  pending: { class: "bg-gray-100 text-gray-700", icon: Clock },
  draft: { class: "bg-amber-100 text-amber-700", icon: PenLine },
  submitted: { class: "bg-green-100 text-green-700", icon: CheckCircle },
};

const TYPE_LABEL: Record<string, string> = {
  self: "Self Assessment",
  manager: "Manager Review",
  peer: "Peer Review",
};

export function MyReviewsPage() {
  const user = getUser();
  const userId = user?.empcloudUserId;

  const { data: toCompleteData, isLoading: loadingToComplete, error: toCompleteError } = useQuery({
    queryKey: ["self-service-reviews-to-complete", userId],
    queryFn: () =>
      apiGet<PaginatedResponse<Review>>("/reviews", {
        reviewer_id: userId,
        perPage: 50,
      }),
    enabled: Boolean(userId),
    retry: 1,
  });

  const { data: aboutMeData, isLoading: loadingAboutMe, error: aboutMeError } = useQuery({
    queryKey: ["self-service-reviews-about-me", userId],
    queryFn: () =>
      apiGet<PaginatedResponse<Review>>("/reviews", {
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Reviews</h1>
        <p className="mt-1 text-sm text-gray-500">
          {pendingCount > 0
            ? `You have ${pendingCount} review${pendingCount > 1 ? "s" : ""} to complete.`
            : "You are all caught up!"}
        </p>
      </div>

      {/* Reviews to Complete */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Reviews to Complete</h2>
        {toCompleteError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm text-red-600">Failed to load reviews. Please try again later.</p>
          </div>
        ) : loadingToComplete ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
          </div>
        ) : toComplete.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">No reviews assigned to you.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {toComplete.map((review) => {
              const badge = STATUS_BADGE[review.status] ?? STATUS_BADGE.pending;
              const Icon = badge.icon;
              return (
                <Link
                  key={review.id}
                  to={`/reviews/${review.id}`}
                  className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-200 hover:shadow-sm transition-all"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {TYPE_LABEL[review.type] ?? review.type}
                      </span>
                      <span className="text-xs text-gray-400">
                        for Employee #{review.employee_id}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Created {formatDate(review.created_at)}
                    </p>
                  </div>
                  {review.overall_rating !== null && (
                    <div className="flex items-center gap-1 text-sm text-amber-500">
                      <Star className="h-4 w-4 fill-amber-400" />
                      {review.overall_rating}
                    </div>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${badge.class}`}
                  >
                    <Icon className="h-3 w-3" />
                    {review.status}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Reviews About Me */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Reviews About Me</h2>
        {aboutMeError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm text-red-600">Failed to load reviews. Please try again later.</p>
          </div>
        ) : loadingAboutMe ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
          </div>
        ) : aboutMe.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">No reviews about you yet.</p>
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
                        {TYPE_LABEL[review.type] ?? review.type}
                      </span>
                      <span className="text-xs text-gray-400">
                        by Reviewer #{review.reviewer_id}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {review.submitted_at
                        ? `Submitted ${formatDate(review.submitted_at)}`
                        : `Created ${formatDate(review.created_at)}`}
                    </p>
                  </div>
                  {review.overall_rating !== null && review.status === "submitted" && (
                    <div className="flex items-center gap-1 text-sm text-amber-500">
                      <Star className="h-4 w-4 fill-amber-400" />
                      {review.overall_rating}/5
                    </div>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${badge.class}`}
                  >
                    <Icon className="h-3 w-3" />
                    {review.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
