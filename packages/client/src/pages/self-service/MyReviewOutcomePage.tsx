import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  MessageSquareWarning,
  ShieldCheck,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiGet, apiPost } from "@/api/client";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuthStore } from "@/lib/auth-store";
import { formatDate } from "@/lib/utils";
import type {
  ReviewOutcomeAppealStatus,
  ReviewOutcomeDetail,
  ReviewOutcomeView,
} from "@emp-performance/shared";

const APPEAL_STATUS_STYLE: Record<ReviewOutcomeAppealStatus, string> = {
  submitted: "bg-amber-100 text-amber-800",
  under_review: "bg-blue-100 text-blue-800",
  upheld: "bg-green-100 text-green-800",
  not_upheld: "bg-gray-100 text-gray-700",
  withdrawn: "bg-gray-100 text-gray-600",
};

function apiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { error?: { message?: unknown } } } })
      .response;
    if (typeof response?.data?.error?.message === "string") {
      return response.data.error.message;
    }
  }
  return fallback;
}

function reviewTypeLabel(type: string, t: ReturnType<typeof useTranslation>["t"]): string {
  if (type === "self") return t("reviewOutcome.reviewTypeSelf");
  if (type === "manager") return t("reviewOutcome.reviewTypeManager");
  if (type === "peer") return t("reviewOutcome.reviewTypePeer");
  return type;
}

function useAppealWindowOpen(deadline: string | undefined, hasAppeal: boolean): boolean {
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline || hasAppeal) return;
    const deadlineTime = new Date(deadline).getTime();
    if (!Number.isFinite(deadlineTime) || deadlineTime <= currentTime) return;

    const timer = window.setTimeout(
      () => setCurrentTime(Date.now()),
      Math.min(deadlineTime - currentTime + 50, 60_000),
    );
    return () => window.clearTimeout(timer);
  }, [currentTime, deadline, hasAppeal]);

  if (!deadline || hasAppeal) return false;
  const deadlineTime = new Date(deadline).getTime();
  return Number.isFinite(deadlineTime) && deadlineTime >= currentTime;
}

export function MyReviewOutcomePage() {
  const { outcomeId } = useParams<{ outcomeId: string }>();
  const { t } = useTranslation();
  const userId = useAuthStore((state) => state.user?.empcloudUserId);
  const queryClient = useQueryClient();
  const [acknowledgementNote, setAcknowledgementNote] = useState("");
  const [acknowledgementConfirmed, setAcknowledgementConfirmed] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [appealValidationError, setAppealValidationError] = useState<string | null>(null);
  const appealErrorRef = useRef<HTMLParagraphElement>(null);
  const appealErrorId = "appeal-reason-error";

  const outcomeQuery = useQuery({
    queryKey: ["review-outcome", userId, outcomeId],
    queryFn: () => apiGet<ReviewOutcomeDetail>(`/review-outcomes/${outcomeId}`),
    enabled: Boolean(userId && outcomeId),
    retry: 1,
  });

  const refreshOutcome = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["review-outcome", userId, outcomeId] }),
      queryClient.invalidateQueries({ queryKey: ["review-outcomes", "mine"] }),
    ]);
  };

  const acknowledgeMutation = useMutation({
    mutationFn: () =>
      apiPost<ReviewOutcomeView>(`/review-outcomes/${outcomeId}/acknowledge`, {
        note: acknowledgementNote.trim() || undefined,
      }),
    onSuccess: async () => {
      await refreshOutcome();
      toast.success(t("reviewOutcome.acknowledgeSuccess"));
    },
  });

  const appealMutation = useMutation({
    mutationFn: () =>
      apiPost<ReviewOutcomeView>(`/review-outcomes/${outcomeId}/appeals`, {
        reason: appealReason.trim(),
      }),
    onSuccess: async () => {
      setAppealReason("");
      setAppealValidationError(null);
      await refreshOutcome();
      toast.success(t("reviewOutcome.appealSuccess"));
    },
    onError: () => {
      requestAnimationFrame(() => appealErrorRef.current?.focus());
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: () =>
      apiPost<ReviewOutcomeView>(`/review-outcomes/${outcomeId}/appeals/withdraw`),
    onSuccess: async () => {
      await refreshOutcome();
      toast.success(t("reviewOutcome.withdrawSuccess"));
    },
  });

  const outcome = outcomeQuery.data?.data;
  const appealIsOpen = useAppealWindowOpen(
    outcome?.appeal_deadline_at,
    Boolean(outcome?.appeal_status),
  );

  function submitAcknowledgement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acknowledgementConfirmed || acknowledgeMutation.isPending) return;
    acknowledgeMutation.mutate();
  }

  function submitAppeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = appealReason.trim();
    if (reason.length < 20) {
      setAppealValidationError(t("reviewOutcome.appealReasonTooShort"));
      requestAnimationFrame(() => appealErrorRef.current?.focus());
      return;
    }
    setAppealValidationError(null);
    appealMutation.mutate();
  }

  if (outcomeQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600 motion-reduce:animate-none" aria-hidden="true" />
        <span className="sr-only">{t("reviewOutcome.loading")}</span>
      </div>
    );
  }

  if (outcomeQuery.isError || !outcome) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-red-600" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-semibold text-gray-900">
          {t("reviewOutcome.loadFailedTitle")}
        </h1>
        <p className="mt-1 text-sm text-red-700">
          {apiErrorMessage(outcomeQuery.error, t("reviewOutcome.loadFailed"))}
        </p>
        <Link
          to="/my/performance"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-brand-700 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {t("reviewOutcome.backToPerformance")}
        </Link>
      </div>
    );
  }

  const appealMutationError = appealMutation.error
    ? apiErrorMessage(appealMutation.error, t("reviewOutcome.appealFailed"))
    : null;
  const acknowledgeMutationError = acknowledgeMutation.error
    ? apiErrorMessage(acknowledgeMutation.error, t("reviewOutcome.acknowledgeFailed"))
    : null;

  return (
    <main className="mx-auto max-w-6xl space-y-6" aria-labelledby="review-outcome-title">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to="/my/performance"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-gray-600 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("reviewOutcome.backToPerformance")}
          </Link>
          <h1 id="review-outcome-title" className="mt-2 text-2xl font-bold text-gray-900">
            {outcome.cycle_name ?? t("reviewOutcome.releasedReview")}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            {t("reviewOutcome.releasedOn", { date: formatDate(outcome.released_at) })}
          </p>
        </div>
        {outcome.appeal_status ? (
          <StatusBadge colorClass={APPEAL_STATUS_STYLE[outcome.appeal_status]} className="px-3 py-1.5">
            {t(`reviewOutcome.appealStatus.${outcome.appeal_status}`)}
          </StatusBadge>
        ) : (
          <StatusBadge colorClass="bg-green-100 text-green-800" className="px-3 py-1.5">
            {t("reviewOutcome.released")}
          </StatusBadge>
        )}
      </header>

      <section className="grid gap-4 md:grid-cols-3" aria-label={t("reviewOutcome.summaryLabel")}>
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-brand-700 shadow-sm">
              <Award className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-medium text-gray-600">{t("reviewOutcome.finalRating")}</p>
              <p className="text-3xl font-bold text-gray-950">
                {Number(outcome.released_rating).toFixed(2).replace(/\.00$/, "")}
                <span className="ml-1 text-base font-medium text-gray-500">/ 5</span>
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 h-5 w-5 text-gray-500" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-gray-900">{t("reviewOutcome.reviewPeriod")}</p>
              <p className="mt-1 text-sm text-gray-600">
                {outcome.cycle_start_date && outcome.cycle_end_date
                  ? `${formatDate(outcome.cycle_start_date)} – ${formatDate(outcome.cycle_end_date)}`
                  : t("reviewOutcome.notAvailable")}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 h-5 w-5 text-gray-500" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-gray-900">{t("reviewOutcome.appealDeadline")}</p>
              <p className="mt-1 text-sm text-gray-600">{formatDate(outcome.appeal_deadline_at)}</p>
              {!outcome.appeal_status && (
                <p className={`mt-1 text-xs font-medium ${appealIsOpen ? "text-green-700" : "text-gray-500"}`}>
                  {appealIsOpen ? t("reviewOutcome.appealWindowOpen") : t("reviewOutcome.appealWindowClosed")}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="feedback-heading">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-brand-600" aria-hidden="true" />
          <div>
            <h2 id="feedback-heading" className="text-lg font-semibold text-gray-900">
              {t("reviewOutcome.releasedFeedback")}
            </h2>
            <p className="text-sm text-gray-500">{t("reviewOutcome.feedbackDescription")}</p>
          </div>
        </div>
        {outcome.reviews.length === 0 ? (
          <p className="mt-5 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
            {t("reviewOutcome.noFeedback")}
          </p>
        ) : (
          <ul className="mt-5 grid gap-4 lg:grid-cols-2">
            {outcome.reviews.map((review) => (
              <li key={review.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{reviewTypeLabel(review.type, t)}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {review.reviewer_anonymous
                        ? t("reviewOutcome.anonymousReviewer")
                        : t("reviewOutcome.releasedReviewer")}
                    </p>
                  </div>
                  {review.overall_rating !== null && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-800">
                      {review.overall_rating}/5
                    </span>
                  )}
                </div>
                {review.summary && <p className="mt-3 line-clamp-3 text-sm text-gray-700">{review.summary}</p>}
                <Link
                  to={`/reviews/${review.id}`}
                  className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  {t("reviewOutcome.readFullFeedback")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="acknowledgement-heading">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-green-600" aria-hidden="true" />
            <div>
              <h2 id="acknowledgement-heading" className="text-lg font-semibold text-gray-900">
                {t("reviewOutcome.acknowledgementTitle")}
              </h2>
              <p className="mt-1 text-sm text-gray-600">{t("reviewOutcome.acknowledgementDisclaimer")}</p>
            </div>
          </div>

          {outcome.acknowledged_at ? (
            <div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-2 font-medium text-green-900">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                {t("reviewOutcome.acknowledgedOn", { date: formatDate(outcome.acknowledged_at) })}
              </div>
              {outcome.acknowledgement_note && (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-green-900">
                  {outcome.acknowledgement_note}
                </p>
              )}
            </div>
          ) : (
            <form className="mt-5 space-y-4" onSubmit={submitAcknowledgement}>
              <div>
                <label htmlFor="acknowledgement-note" className="block text-sm font-medium text-gray-800">
                  {t("reviewOutcome.optionalNote")}
                </label>
                <textarea
                  id="acknowledgement-note"
                  name="acknowledgement_note"
                  autoComplete="off"
                  value={acknowledgementNote}
                  onChange={(event) => setAcknowledgementNote(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  aria-describedby="acknowledgement-note-count"
                />
                <p id="acknowledgement-note-count" className="mt-1 text-right text-xs text-gray-500">
                  {acknowledgementNote.length}/2000
                </p>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="acknowledgement_confirmation"
                  checked={acknowledgementConfirmed}
                  onChange={(event) => setAcknowledgementConfirmed(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  required
                />
                <span>{t("reviewOutcome.acknowledgementConfirmation")}</span>
              </label>
              {acknowledgeMutationError && (
                <p role="alert" className="text-sm text-red-700">{acknowledgeMutationError}</p>
              )}
              <button
                type="submit"
                disabled={!acknowledgementConfirmed || acknowledgeMutation.isPending}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {acknowledgeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {acknowledgeMutation.isPending
                  ? t("reviewOutcome.acknowledging")
                  : t("reviewOutcome.acknowledgeAction")}
              </button>
            </form>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="appeal-heading">
          <div className="flex items-start gap-3">
            <MessageSquareWarning className="mt-0.5 h-5 w-5 text-amber-600" aria-hidden="true" />
            <div>
              <h2 id="appeal-heading" className="text-lg font-semibold text-gray-900">
                {t("reviewOutcome.appealTitle")}
              </h2>
              <p className="mt-1 text-sm text-gray-600">{t("reviewOutcome.appealDescription")}</p>
            </div>
          </div>

          {outcome.appeal_status ? (
            <AppealTimeline outcome={outcome} />
          ) : appealIsOpen ? (
            <form className="mt-5 space-y-4" onSubmit={submitAppeal} noValidate>
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {t("reviewOutcome.appealOneTimeWarning")}
              </p>
              <div>
                <label htmlFor="appeal-reason" className="block text-sm font-medium text-gray-800">
                  {t("reviewOutcome.appealReasonLabel")}
                </label>
                <textarea
                  id="appeal-reason"
                  name="appeal_reason"
                  autoComplete="off"
                  value={appealReason}
                  onChange={(event) => {
                    setAppealReason(event.target.value);
                    if (appealValidationError && event.target.value.trim().length >= 20) {
                      setAppealValidationError(null);
                    }
                  }}
                  minLength={20}
                  maxLength={4000}
                  rows={5}
                  required
                  aria-invalid={Boolean(appealValidationError || appealMutationError)}
                  aria-describedby={`appeal-reason-help appeal-reason-count${
                    appealValidationError || appealMutationError ? ` ${appealErrorId}` : ""
                  }`}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
                <div className="mt-1 flex items-start justify-between gap-4 text-xs text-gray-500">
                  <p id="appeal-reason-help">{t("reviewOutcome.appealReasonHelp")}</p>
                  <p id="appeal-reason-count" className="shrink-0">{appealReason.length}/4000</p>
                </div>
              </div>
              {(appealValidationError || appealMutationError) && (
                <p
                  id={appealErrorId}
                  ref={appealErrorRef}
                  tabIndex={-1}
                  role="alert"
                  className="text-sm text-red-700"
                >
                  {appealValidationError || appealMutationError}
                </p>
              )}
              <button
                type="submit"
                disabled={appealMutation.isPending}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-wait disabled:opacity-60"
              >
                {appealMutation.isPending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {appealMutation.isPending ? t("reviewOutcome.submittingAppeal") : t("reviewOutcome.submitAppeal")}
              </button>
            </form>
          ) : (
            <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              <p className="font-medium">{t("reviewOutcome.appealWindowClosed")}</p>
              <p className="mt-1">{t("reviewOutcome.appealClosedDescription")}</p>
            </div>
          )}

          {outcome.appeal_status === "submitted" && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              {withdrawMutation.error && (
                <p role="alert" className="mb-3 text-sm text-red-700">
                  {apiErrorMessage(withdrawMutation.error, t("reviewOutcome.withdrawFailed"))}
                </p>
              )}
              <button
                type="button"
                disabled={withdrawMutation.isPending}
                onClick={() => {
                  if (window.confirm(t("reviewOutcome.withdrawConfirm"))) {
                    withdrawMutation.mutate();
                  }
                }}
                className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-wait disabled:opacity-60"
              >
                {withdrawMutation.isPending ? t("reviewOutcome.withdrawing") : t("reviewOutcome.withdrawAppeal")}
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function AppealTimeline({ outcome }: { outcome: ReviewOutcomeView }) {
  const { t } = useTranslation();
  const status = outcome.appeal_status;
  if (!status) return null;

  const events = [
    outcome.appeal_submitted_at && {
      label: t("reviewOutcome.timelineSubmitted"),
      date: outcome.appeal_submitted_at,
    },
    outcome.appeal_review_started_at && {
      label: t("reviewOutcome.timelineReviewStarted"),
      date: outcome.appeal_review_started_at,
    },
    outcome.appeal_resolved_at && {
      label: t(`reviewOutcome.appealStatus.${status}`),
      date: outcome.appeal_resolved_at,
    },
  ].filter(Boolean) as Array<{ label: string; date: string }>;

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-lg bg-amber-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-gray-900">{t("reviewOutcome.currentAppealStatus")}</p>
          <StatusBadge colorClass={APPEAL_STATUS_STYLE[status]}>
            {t(`reviewOutcome.appealStatus.${status}`)}
          </StatusBadge>
        </div>
        {outcome.appeal_reason && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("reviewOutcome.yourReason")}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800">{outcome.appeal_reason}</p>
          </div>
        )}
        {outcome.appeal_resolution_note && (
          <div className="mt-3 border-t border-amber-200 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("reviewOutcome.resolutionNote")}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800">
              {outcome.appeal_resolution_note}
            </p>
          </div>
        )}
      </div>
      <ol className="space-y-3" aria-label={t("reviewOutcome.appealTimelineLabel")}>
        {events.map((event) => (
          <li key={`${event.label}-${event.date}`} className="flex items-start gap-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
            <div>
              <p className="font-medium text-gray-800">{event.label}</p>
              <time dateTime={event.date} className="text-gray-500">{formatDate(event.date)}</time>
            </div>
          </li>
        ))}
      </ol>
      {status === "upheld" && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          {t("reviewOutcome.upheldCorrectionPending")}
        </p>
      )}
    </div>
  );
}
