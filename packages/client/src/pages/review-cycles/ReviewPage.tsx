import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Star, User, Users, FileText } from "lucide-react";
import { apiGet } from "@/api/client";
import type { Review, ReviewCompetencyRating } from "@emp-performance/shared";
import { formatDate } from "@/lib/utils";

type ReviewWithRatings = Review & { competency_ratings: ReviewCompetencyRating[] };

const TYPE_COLORS: Record<string, string> = {
  self: "bg-blue-100 text-blue-700",
  manager: "bg-purple-100 text-purple-700",
  peer: "bg-amber-100 text-amber-700",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  draft: "bg-amber-100 text-amber-700",
  submitted: "bg-green-100 text-green-700",
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= rating
              ? "fill-amber-400 text-amber-400"
              : "fill-gray-200 text-gray-200"
          }`}
        />
      ))}
    </div>
  );
}

export function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: reviewData, isLoading } = useQuery({
    queryKey: ["review", id],
    queryFn: () => apiGet<ReviewWithRatings>(`/reviews/${id}`),
    enabled: Boolean(id),
  });

  const review = reviewData?.data;

  // If this is a detail view for one employee, also fetch sibling reviews (same cycle + employee)
  const { data: siblingData } = useQuery({
    queryKey: ["reviews-for-employee", review?.cycle_id, review?.employee_id],
    queryFn: () =>
      apiGet<{ data: Review[] }>("/reviews", {
        cycle_id: review!.cycle_id,
        employee_id: review!.employee_id,
        perPage: 50,
      }),
    enabled: Boolean(review),
  });

  const siblingReviews = siblingData?.data?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!review) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">Review not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate(-1)}
          className="mt-1 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employee Review</h1>
          <p className="mt-1 text-sm text-gray-500">
            Employee #{review.employee_id} - All reviews for this participant
          </p>
        </div>
      </div>

      {/* Side-by-side reviews */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {(siblingReviews.length > 0 ? siblingReviews : [review]).map((rev) => {
          const isCurrent = rev.id === review.id;
          return (
            <div
              key={rev.id}
              className={`rounded-lg border bg-white p-5 space-y-4 ${
                isCurrent ? "border-brand-300 ring-1 ring-brand-200" : "border-gray-200"
              }`}
            >
              {/* Review header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {rev.type === "self" && <User className="h-4 w-4 text-blue-500" />}
                  {rev.type === "manager" && <Users className="h-4 w-4 text-purple-500" />}
                  {rev.type === "peer" && <FileText className="h-4 w-4 text-amber-500" />}
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${TYPE_COLORS[rev.type] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {rev.type} Review
                  </span>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[rev.status] ?? "bg-gray-100 text-gray-700"}`}
                >
                  {rev.status}
                </span>
              </div>

              {/* Reviewer info */}
              <div className="text-sm text-gray-500">
                <p>Reviewer: #{rev.reviewer_id}</p>
                {rev.submitted_at && (
                  <p>Submitted: {formatDate(rev.submitted_at)}</p>
                )}
              </div>

              {/* Overall rating */}
              {rev.overall_rating !== null && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                    Overall Rating
                  </p>
                  <div className="flex items-center gap-2">
                    <StarRating rating={rev.overall_rating} />
                    <span className="text-sm font-medium text-gray-700">
                      {rev.overall_rating}/5
                    </span>
                  </div>
                </div>
              )}

              {/* Competency ratings (only for current review with full data) */}
              {isCurrent && review.competency_ratings.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2">
                    Competency Ratings
                  </p>
                  <div className="space-y-2">
                    {review.competency_ratings.map((cr) => (
                      <div key={cr.id} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700 truncate max-w-[140px]">
                          {cr.competency_id.slice(0, 8)}...
                        </span>
                        <StarRating rating={cr.rating} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              {rev.summary && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Summary</p>
                  <p className="text-sm text-gray-700">{rev.summary}</p>
                </div>
              )}

              {/* Strengths */}
              {rev.strengths && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Strengths</p>
                  <p className="text-sm text-gray-700">{rev.strengths}</p>
                </div>
              )}

              {/* Areas for improvement */}
              {rev.improvements && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                    Areas for Improvement
                  </p>
                  <p className="text-sm text-gray-700">{rev.improvements}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
