import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Star, Send, Save } from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/api/client";
import type {
  Review,
  ReviewCompetencyRating,
  CompetencyFramework,
  Competency,
  ReviewCycle,
} from "@emp-performance/shared";

type ReviewWithRatings = Review & { competency_ratings: ReviewCompetencyRating[] };
type FrameworkWithCompetencies = CompetencyFramework & { competencies: Competency[] };

function StarInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5"
        >
          <Star
            className={`h-6 w-6 transition-colors ${
              star <= (hover || value)
                ? "fill-amber-400 text-amber-400"
                : "fill-gray-200 text-gray-200"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export function MyReviewFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [overallRating, setOverallRating] = useState(0);
  const [summary, setSummary] = useState("");
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [competencyRatings, setCompetencyRatings] = useState<
    Record<string, { rating: number; comments: string }>
  >({});

  // Fetch review
  const { data: reviewData, isLoading } = useQuery({
    queryKey: ["review", id],
    queryFn: () => apiGet<ReviewWithRatings>(`/reviews/${id}`),
    enabled: Boolean(id),
  });

  const review = reviewData?.data;

  // Fetch cycle for framework info
  const { data: cycleData } = useQuery({
    queryKey: ["review-cycle", review?.cycle_id],
    queryFn: () => apiGet<ReviewCycle>(`/review-cycles/${review!.cycle_id}`),
    enabled: Boolean(review?.cycle_id),
  });

  const cycle = cycleData?.data;

  // Fetch framework competencies
  const { data: frameworkData } = useQuery({
    queryKey: ["framework", cycle?.framework_id],
    queryFn: () => apiGet<FrameworkWithCompetencies>(`/competencies/${cycle!.framework_id}`),
    enabled: Boolean(cycle?.framework_id),
  });

  const competencies = frameworkData?.data?.competencies ?? [];

  // Initialize form with existing data
  useEffect(() => {
    if (review) {
      setOverallRating(review.overall_rating ?? 0);
      setSummary(review.summary ?? "");
      setStrengths(review.strengths ?? "");
      setImprovements(review.improvements ?? "");

      if (review.competency_ratings.length > 0) {
        const ratings: Record<string, { rating: number; comments: string }> = {};
        for (const cr of review.competency_ratings) {
          ratings[cr.competency_id] = {
            rating: cr.rating,
            comments: cr.comments ?? "",
          };
        }
        setCompetencyRatings(ratings);
      }
    }
  }, [review]);

  // Rate competency mutation
  const rateMutation = useMutation({
    mutationFn: (data: { competency_id: string; rating: number; comments?: string }) =>
      apiPost(`/reviews/${id}/competency-ratings`, data),
  });

  // Save draft
  const saveDraftMutation = useMutation({
    mutationFn: () =>
      apiPut(`/reviews/${id}`, {
        overall_rating: overallRating || undefined,
        summary: summary || undefined,
        strengths: strengths || undefined,
        improvements: improvements || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review", id] });
    },
  });

  // Submit review
  const submitMutation = useMutation({
    mutationFn: () =>
      apiPost(`/reviews/${id}/submit`, {
        overall_rating: overallRating,
        summary,
        strengths: strengths || undefined,
        improvements: improvements || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review", id] });
      navigate("/reviews/my");
    },
  });

  function handleCompetencyRating(competencyId: string, rating: number) {
    setCompetencyRatings((prev) => ({
      ...prev,
      [competencyId]: { ...prev[competencyId], rating, comments: prev[competencyId]?.comments ?? "" },
    }));
    rateMutation.mutate({ competency_id: competencyId, rating });
  }

  function handleCompetencyComment(competencyId: string, comments: string) {
    setCompetencyRatings((prev) => ({
      ...prev,
      [competencyId]: { ...prev[competencyId], comments, rating: prev[competencyId]?.rating ?? 0 },
    }));
  }

  function saveCompetencyComment(competencyId: string) {
    const cr = competencyRatings[competencyId];
    if (cr?.rating > 0) {
      rateMutation.mutate({
        competency_id: competencyId,
        rating: cr.rating,
        comments: cr.comments || undefined,
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Save all competency ratings first
    for (const [compId, cr] of Object.entries(competencyRatings)) {
      if (cr.rating > 0) {
        await rateMutation.mutateAsync({
          competency_id: compId,
          rating: cr.rating,
          comments: cr.comments || undefined,
        });
      }
    }
    submitMutation.mutate();
  }

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

  const isSubmitted = review.status === "submitted";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {review.type === "self" ? "Self Assessment" : `${review.type} Review`}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isSubmitted
              ? "This review has been submitted."
              : "Rate each competency and provide your assessment."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        {/* Competency ratings */}
        {competencies.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Competency Ratings</h2>
            <div className="space-y-5">
              {competencies.map((comp) => {
                const cr = competencyRatings[comp.id];
                return (
                  <div key={comp.id} className="space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{comp.name}</p>
                        {comp.description && (
                          <p className="text-xs text-gray-500">{comp.description}</p>
                        )}
                        {comp.category && (
                          <span className="inline-flex mt-1 items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                            {comp.category}
                          </span>
                        )}
                      </div>
                      <StarInput
                        value={cr?.rating ?? 0}
                        onChange={(r) =>
                          isSubmitted ? undefined : handleCompetencyRating(comp.id, r)
                        }
                      />
                    </div>
                    <input
                      type="text"
                      value={cr?.comments ?? ""}
                      onChange={(e) =>
                        isSubmitted ? undefined : handleCompetencyComment(comp.id, e.target.value)
                      }
                      onBlur={() => saveCompetencyComment(comp.id)}
                      disabled={isSubmitted}
                      placeholder="Add a comment (optional)"
                      className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Overall rating */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">Overall Assessment</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Overall Rating <span className="text-red-500">*</span>
            </label>
            <StarInput
              value={overallRating}
              onChange={(r) => (isSubmitted ? undefined : setOverallRating(r))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Summary <span className="text-red-500">*</span>
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              disabled={isSubmitted}
              rows={3}
              placeholder="Provide an overall summary of the performance..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Key Strengths
            </label>
            <textarea
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
              disabled={isSubmitted}
              rows={2}
              placeholder="What are the key strengths demonstrated?"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Areas for Improvement
            </label>
            <textarea
              value={improvements}
              onChange={(e) => setImprovements(e.target.value)}
              disabled={isSubmitted}
              rows={2}
              placeholder="What areas need improvement?"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
            />
          </div>
        </div>

        {/* Error */}
        {(saveDraftMutation.isError || submitMutation.isError) && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
            {(submitMutation.error as any)?.response?.data?.error?.message ??
              (saveDraftMutation.error as any)?.response?.data?.error?.message ??
              "An error occurred. Please try again."}
          </div>
        )}

        {/* Actions */}
        {!isSubmitted && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => saveDraftMutation.mutate()}
              disabled={saveDraftMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saveDraftMutation.isPending ? "Saving..." : "Save Draft"}
            </button>
            <button
              type="submit"
              disabled={submitMutation.isPending || overallRating === 0 || !summary}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              <Send className="h-4 w-4" />
              {submitMutation.isPending ? "Submitting..." : "Submit Review"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
