import { type FormEvent, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  Scale,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAuthStore } from "@/lib/auth-store";
import { formatDate } from "@/lib/utils";
import type {
  ReviewOutcomeRevision,
  ReviewOutcomeRevisionStatus,
  ReviewOutcomeView,
} from "@emp-performance/shared";

export interface OutcomeCorrectionPanelProps {
  outcome: ReviewOutcomeView;
  enabled?: boolean;
  onChanged?: () => void | Promise<void>;
}

type ReviewAction = "approve" | "reject";

const REVISION_STATUS_STYLES: Record<ReviewOutcomeRevisionStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  applied: "border-green-200 bg-green-50 text-green-800",
  rejected: "border-red-200 bg-red-50 text-red-700",
};

function apiErrorMessage(error: unknown, fallback: string): string {
  const candidate = error as {
    response?: { data?: { error?: { message?: string } } };
  };
  return candidate.response?.data?.error?.message ?? fallback;
}

function formatRating(value: number | string | null | undefined): string {
  const rating = Number(value);
  return Number.isFinite(rating) ? rating.toFixed(2).replace(/\.00$/, "") : "—";
}

export function OutcomeCorrectionPanel({
  outcome,
  enabled = true,
  onChanged,
}: OutcomeCorrectionPanelProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [rating, setRating] = useState(() => String(outcome.effective_rating));
  const [reason, setReason] = useState("");
  const [proposalValidationError, setProposalValidationError] = useState("");
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewValidationError, setReviewValidationError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const ratingRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const proposalApiErrorRef = useRef<HTMLParagraphElement>(null);
  const reviewNoteRef = useRef<HTMLTextAreaElement>(null);
  const reviewApiErrorRef = useRef<HTMLParagraphElement>(null);

  const revisionsQuery = useQuery({
    queryKey: ["review-outcome-revisions", outcome.id],
    queryFn: () =>
      apiGet<ReviewOutcomeRevision[]>(`/review-outcomes/${outcome.id}/revisions`),
    enabled,
    retry: 1,
  });

  const refreshCorrectionData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["review-outcome-revisions", outcome.id],
      }),
      queryClient.invalidateQueries({ queryKey: ["review-outcome-appeals"] }),
      queryClient.invalidateQueries({ queryKey: ["review-outcome"] }),
      queryClient.invalidateQueries({ queryKey: ["review-outcomes"] }),
    ]);
    await onChanged?.();
  };

  const proposalMutation = useMutation({
    mutationFn: (input: { rating: number; reason: string }) =>
      apiPost<ReviewOutcomeRevision>(`/review-outcomes/${outcome.id}/corrections`, input),
    onSuccess: async () => {
      setShowProposalForm(false);
      setReason("");
      setProposalValidationError("");
      setStatusMessage(t("outcomeCorrection.proposal.success"));
      await refreshCorrectionData();
    },
    onError: () => {
      requestAnimationFrame(() => proposalApiErrorRef.current?.focus());
    },
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      revisionId,
      action,
      note,
    }: {
      revisionId: string;
      action: ReviewAction;
      note: string;
    }) =>
      apiPost<ReviewOutcomeRevision>(
        `/review-outcomes/${outcome.id}/corrections/${revisionId}/${action}`,
        { review_note: note.trim() || undefined },
      ),
    onSuccess: async (_response, variables) => {
      setReviewAction(null);
      setReviewNote("");
      setReviewValidationError("");
      setStatusMessage(
        variables.action === "approve"
          ? t("outcomeCorrection.review.approvedSuccess")
          : t("outcomeCorrection.review.rejectedSuccess"),
      );
      await refreshCorrectionData();
    },
    onError: () => {
      requestAnimationFrame(() => reviewApiErrorRef.current?.focus());
    },
  });

  const revisions = revisionsQuery.data?.data ?? [];
  const correctionRevisions = revisions.filter(
    (revision) => revision.source === "appeal_correction",
  );
  const pendingRevision = correctionRevisions.find(
    (revision) => revision.status === "pending",
  );
  const completedRevisions = correctionRevisions.filter(
    (revision) => revision.status !== "pending",
  );
  const actorIds = [user?.id, user?.empcloudUserId].filter(
    (value): value is number => typeof value === "number",
  );
  const isOwnProposal = Boolean(
    pendingRevision?.proposed_by !== null &&
      pendingRevision?.proposed_by !== undefined &&
      actorIds.includes(pendingRevision.proposed_by),
  );
  const originalRating = Number(outcome.released_rating);
  const effectiveRating = Number(outcome.effective_rating ?? outcome.released_rating);
  const ratingWasCorrected =
    Number.isFinite(originalRating) &&
    Number.isFinite(effectiveRating) &&
    originalRating !== effectiveRating;
  const actorLabel = (actorId: number | null) =>
    actorId === null
      ? t("outcomeCorrection.actor.system")
      : t("outcomeCorrection.actor.administrator", { id: actorId });

  async function submitProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage("");
    const nextRating = Number(rating);
    const trimmedReason = reason.trim();

    if (!Number.isFinite(nextRating) || nextRating < 1 || nextRating > 5) {
      setProposalValidationError(t("outcomeCorrection.proposal.ratingInvalid"));
      requestAnimationFrame(() => ratingRef.current?.focus());
      return;
    }
    if (Math.round(nextRating * 100) === Math.round(effectiveRating * 100)) {
      setProposalValidationError(t("outcomeCorrection.proposal.ratingUnchanged"));
      requestAnimationFrame(() => ratingRef.current?.focus());
      return;
    }
    if (trimmedReason.length < 20) {
      setProposalValidationError(t("outcomeCorrection.proposal.reasonInvalid"));
      requestAnimationFrame(() => reasonRef.current?.focus());
      return;
    }

    setProposalValidationError("");
    const approved = await confirm({
      title: t("outcomeCorrection.proposal.submitConfirmTitle"),
      message: t("outcomeCorrection.proposal.submitConfirmMessage", {
        proposed: formatRating(nextRating),
        current: formatRating(effectiveRating),
      }),
      confirmLabel: t("outcomeCorrection.proposal.submitConfirmAction"),
      variant: "default",
    });
    if (approved) proposalMutation.mutate({ rating: nextRating, reason: trimmedReason });
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage("");
    if (!pendingRevision || !reviewAction || isOwnProposal) return;

    const trimmedNote = reviewNote.trim();
    if (reviewAction === "reject" && trimmedNote.length < 20) {
      setReviewValidationError(t("outcomeCorrection.review.rejectionInvalid"));
      requestAnimationFrame(() => reviewNoteRef.current?.focus());
      return;
    }
    if (trimmedNote.length > 4000) {
      setReviewValidationError(t("outcomeCorrection.review.noteTooLong"));
      requestAnimationFrame(() => reviewNoteRef.current?.focus());
      return;
    }

    setReviewValidationError("");
    const approved = await confirm({
      title:
        reviewAction === "approve"
          ? t("outcomeCorrection.review.approveConfirmTitle")
          : t("outcomeCorrection.review.rejectConfirmTitle"),
      message:
        reviewAction === "approve"
          ? t("outcomeCorrection.review.approveConfirmMessage", {
              current: formatRating(effectiveRating),
              proposed: formatRating(pendingRevision.rating),
            })
          : t("outcomeCorrection.review.rejectConfirmMessage", {
              current: formatRating(effectiveRating),
              proposed: formatRating(pendingRevision.rating),
            }),
      confirmLabel:
        reviewAction === "approve"
          ? t("outcomeCorrection.review.approveConfirmAction")
          : t("outcomeCorrection.review.rejectConfirmAction"),
      variant: reviewAction === "reject" ? "danger" : "default",
    });
    if (approved) {
      reviewMutation.mutate({
        revisionId: pendingRevision.id,
        action: reviewAction,
        note: trimmedNote,
      });
    }
  }

  return (
    <section
      className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-5"
      aria-labelledby={`outcome-correction-heading-${outcome.id}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 shadow-sm">
            <Scale className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h4
              id={`outcome-correction-heading-${outcome.id}`}
              className="font-semibold text-gray-950"
            >
              {t("outcomeCorrection.title")}
            </h4>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">
              {t("outcomeCorrection.description")}
            </p>
          </div>
        </div>
        {!pendingRevision && !showProposalForm && revisionsQuery.isSuccess && (
          <button
            type="button"
            onClick={() => {
              setRating(String(effectiveRating));
              setShowProposalForm(true);
            }}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {t("outcomeCorrection.proposeAction")}
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("outcomeCorrection.originalRating")}
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-950">
            {formatRating(originalRating)}<span className="text-sm text-gray-500">/5</span>
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {t("outcomeCorrection.originalSnapshot")}
          </p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
            {t("outcomeCorrection.effectiveRating")}
          </p>
          <p className="mt-1 text-2xl font-bold text-green-950">
            {formatRating(effectiveRating)}<span className="text-sm text-green-700">/5</span>
          </p>
          <p className="mt-1 text-xs text-green-800">
            {ratingWasCorrected
              ? t("outcomeCorrection.correctionApplied")
              : t("outcomeCorrection.matchesOriginal")}
          </p>
        </div>
        {pendingRevision && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 sm:col-span-2 lg:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              {t("outcomeCorrection.proposedRating")}
            </p>
            <p className="mt-1 text-2xl font-bold text-amber-950">
              {formatRating(pendingRevision.rating)}
              <span className="text-sm text-amber-700">/5</span>
            </p>
            <p className="mt-1 text-xs text-amber-800">
              {t("outcomeCorrection.awaitingReview")}
            </p>
          </div>
        )}
      </div>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </div>

      {revisionsQuery.isLoading ? (
        <div className="mt-4 flex min-h-24 items-center justify-center gap-2 text-sm text-gray-600" role="status">
          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {t("outcomeCorrection.loadingHistory")}
        </div>
      ) : revisionsQuery.isError ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4" role="alert">
          <div className="flex items-start gap-2 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              {apiErrorMessage(
                revisionsQuery.error,
                t("outcomeCorrection.loadHistoryError"),
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void revisionsQuery.refetch()}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            {t("outcomeCorrection.retry")}
          </button>
        </div>
      ) : (
        <>
          {showProposalForm && !pendingRevision && (
            <form
              onSubmit={(event) => void submitProposal(event)}
              className="mt-4 rounded-lg border border-brand-200 bg-white p-4"
              aria-label={t("outcomeCorrection.proposal.formLabel")}
            >
              <h5 className="font-semibold text-gray-900">
                {t("outcomeCorrection.proposal.title")}
              </h5>
              <p className="mt-1 text-sm text-gray-600">
                {t("outcomeCorrection.proposal.description")}
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-[10rem_minmax(0,1fr)]">
                <div>
                  <label htmlFor={`correction-rating-${outcome.id}`} className="block text-sm font-medium text-gray-800">
                    {t("outcomeCorrection.proposal.ratingLabel")}
                  </label>
                  <input
                    ref={ratingRef}
                    id={`correction-rating-${outcome.id}`}
                    type="number"
                    min="1"
                    max="5"
                    step="0.01"
                    value={rating}
                    onChange={(event) => {
                      setRating(event.target.value);
                      setProposalValidationError("");
                    }}
                    required
                    aria-invalid={Boolean(proposalValidationError)}
                    aria-describedby={`correction-rating-help-${outcome.id}`}
                    className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                  <p id={`correction-rating-help-${outcome.id}`} className="mt-1 text-xs text-gray-500">
                    {t("outcomeCorrection.proposal.ratingHelp")}
                  </p>
                </div>
                <div>
                  <label htmlFor={`correction-reason-${outcome.id}`} className="block text-sm font-medium text-gray-800">
                    {t("outcomeCorrection.proposal.reasonLabel")}
                  </label>
                  <textarea
                    ref={reasonRef}
                    id={`correction-reason-${outcome.id}`}
                    rows={4}
                    maxLength={4000}
                    value={reason}
                    onChange={(event) => {
                      setReason(event.target.value);
                      setProposalValidationError("");
                    }}
                    required
                    aria-invalid={Boolean(proposalValidationError)}
                    aria-describedby={`correction-reason-help-${outcome.id} correction-reason-count-${outcome.id}`}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                  <div className="mt-1 flex justify-between gap-3 text-xs text-gray-500">
                    <p id={`correction-reason-help-${outcome.id}`}>
                      {t("outcomeCorrection.proposal.reasonHelp")}
                    </p>
                    <p id={`correction-reason-count-${outcome.id}`}>{reason.length}/4000</p>
                  </div>
                </div>
              </div>
              {proposalValidationError && (
                <p className="mt-3 text-sm text-red-700" role="alert">
                  {proposalValidationError}
                </p>
              )}
              {proposalMutation.isError && (
                <p
                  ref={proposalApiErrorRef}
                  tabIndex={-1}
                  className="mt-3 text-sm text-red-700 outline-none"
                  role="alert"
                >
                  {apiErrorMessage(
                    proposalMutation.error,
                    t("outcomeCorrection.proposal.submitError"),
                  )}
                </p>
              )}
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowProposalForm(false);
                    setProposalValidationError("");
                  }}
                  disabled={proposalMutation.isPending}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={proposalMutation.isPending}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  {proposalMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  )}
                  {proposalMutation.isPending
                    ? t("outcomeCorrection.proposal.submitting")
                    : t("outcomeCorrection.proposal.reviewAndSubmit")}
                </button>
              </div>
            </form>
          )}

          {pendingRevision && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h5 className="font-semibold text-gray-950">
                      {t("outcomeCorrection.pending.title")}
                    </h5>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      {t("outcomeCorrection.pending.status")}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {t("outcomeCorrection.pending.proposedBy", {
                      actor: actorLabel(pendingRevision.proposed_by),
                      date: formatDate(
                        pendingRevision.proposed_at ?? pendingRevision.created_at,
                      ),
                    })}
                  </p>
                </div>
                <p className="text-lg font-bold text-amber-900">
                  {formatRating(pendingRevision.rating)}/5
                </p>
              </div>
              {pendingRevision.reason && (
                <div className="mt-3 rounded-lg bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                    {t("outcomeCorrection.pending.evidence")}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">
                    {pendingRevision.reason}
                  </p>
                </div>
              )}

              {isOwnProposal ? (
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">
                      {t("outcomeCorrection.pending.independentTitle")}
                    </p>
                    <p className="mt-1 leading-6">
                      {t("outcomeCorrection.pending.independentDescription")}
                    </p>
                  </div>
                </div>
              ) : reviewAction ? (
                <form
                  onSubmit={(event) => void submitReview(event)}
                  className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4"
                  aria-label={
                    reviewAction === "approve"
                      ? t("outcomeCorrection.review.formLabelApprove")
                      : t("outcomeCorrection.review.formLabelReject")
                  }
                >
                  <label htmlFor={`correction-review-note-${outcome.id}`} className="block text-sm font-medium text-gray-800">
                    {reviewAction === "approve"
                      ? t("outcomeCorrection.review.approvalNote")
                      : t("outcomeCorrection.review.rejectionReason")}
                  </label>
                  <textarea
                    ref={reviewNoteRef}
                    id={`correction-review-note-${outcome.id}`}
                    rows={3}
                    maxLength={4000}
                    value={reviewNote}
                    onChange={(event) => {
                      setReviewNote(event.target.value);
                      setReviewValidationError("");
                    }}
                    required={reviewAction === "reject"}
                    aria-invalid={Boolean(reviewValidationError)}
                    aria-describedby={`correction-review-help-${outcome.id} correction-review-count-${outcome.id}`}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                  <div className="mt-1 flex justify-between gap-3 text-xs text-gray-500">
                    <p id={`correction-review-help-${outcome.id}`}>
                      {reviewAction === "reject"
                        ? t("outcomeCorrection.review.rejectionHelp")
                        : t("outcomeCorrection.review.approvalHelp")}
                    </p>
                    <p id={`correction-review-count-${outcome.id}`}>{reviewNote.length}/4000</p>
                  </div>
                  {reviewValidationError && (
                    <p className="mt-3 text-sm text-red-700" role="alert">
                      {reviewValidationError}
                    </p>
                  )}
                  {reviewMutation.isError && (
                    <p
                      ref={reviewApiErrorRef}
                      tabIndex={-1}
                      className="mt-3 text-sm text-red-700 outline-none"
                      role="alert"
                    >
                      {apiErrorMessage(
                        reviewMutation.error,
                        t("outcomeCorrection.review.saveError"),
                      )}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReviewAction(null);
                        setReviewNote("");
                        setReviewValidationError("");
                      }}
                      disabled={reviewMutation.isPending}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={reviewMutation.isPending}
                      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                        reviewAction === "approve"
                          ? "bg-green-700 hover:bg-green-800 focus-visible:outline-green-700"
                          : "bg-red-700 hover:bg-red-800 focus-visible:outline-red-700"
                      }`}
                    >
                      {reviewMutation.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      )}
                      {reviewMutation.isPending
                        ? t("outcomeCorrection.review.saving")
                        : reviewAction === "approve"
                          ? t("outcomeCorrection.review.reviewAndApprove")
                          : t("outcomeCorrection.review.reviewAndReject")}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewAction("reject")}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                  >
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                    {t("outcomeCorrection.review.reject")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewAction("approve")}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    {t("outcomeCorrection.review.approve")}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mt-5 border-t border-gray-200 pt-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-gray-500" aria-hidden="true" />
              <h5 className="text-sm font-semibold text-gray-900">
                {t("outcomeCorrection.history.title")}
              </h5>
            </div>
            {completedRevisions.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">
                {t("outcomeCorrection.history.empty")}
              </p>
            ) : (
              <ol className="mt-3 space-y-3">
                {completedRevisions.map((revision) => (
                  <li key={revision.id} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-2">
                        {revision.status === "applied" ? (
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" aria-hidden="true" />
                        ) : (
                          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
                        )}
                        <div>
                          <p className="font-medium text-gray-900">
                            {t("outcomeCorrection.history.versionRating", {
                              version: revision.version,
                              rating: formatRating(revision.rating),
                            })}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {revision.proposed_at
                              ? t("outcomeCorrection.history.proposedByOn", {
                                  actor: actorLabel(revision.proposed_by),
                                  date: formatDate(revision.proposed_at),
                                })
                              : t("outcomeCorrection.history.proposedBy", {
                                  actor: actorLabel(revision.proposed_by),
                                })}
                          </p>
                        </div>
                      </div>
                      <span className={`self-start rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${REVISION_STATUS_STYLES[revision.status]}`}>
                        {t(`outcomeCorrection.status.${revision.status}`)}
                      </span>
                    </div>
                    {revision.reason && (
                      <div className="mt-3 text-sm text-gray-700">
                        <span className="font-medium text-gray-900">
                          {t("outcomeCorrection.history.evidence")}
                        </span>{" "}
                        <span className="whitespace-pre-wrap break-words">{revision.reason}</span>
                      </div>
                    )}
                    {revision.review_note && (
                      <div className="mt-2 text-sm text-gray-700">
                        <span className="font-medium text-gray-900">
                          {t("outcomeCorrection.history.decisionNote")}
                        </span>{" "}
                        <span className="whitespace-pre-wrap break-words">{revision.review_note}</span>
                      </div>
                    )}
                    {revision.reviewed_at && (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-500">
                        <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("outcomeCorrection.history.reviewedByOn", {
                          actor: actorLabel(revision.reviewed_by),
                          date: formatDate(revision.reviewed_at),
                        })}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </section>
  );
}
