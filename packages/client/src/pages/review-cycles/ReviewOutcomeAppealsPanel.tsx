import { useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Flag,
  Loader2,
  Scale,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { Pagination } from "@/components/Pagination";
import { StatusBadge } from "@/components/StatusBadge";
import { useConfirm } from "@/components/ConfirmDialog";
import { formatDate } from "@/lib/utils";
import type {
  PaginatedResponse,
  ReviewOutcomeAppealStatus,
  ReviewOutcomeView,
} from "@emp-performance/shared";

const FILTERS = [
  "all",
  "submitted",
  "under_review",
  "upheld",
  "not_upheld",
  "withdrawn",
] as const;

type AppealFilter = (typeof FILTERS)[number];
type ResolutionOutcome = "upheld" | "not_upheld";

const STATUS_STYLES: Record<ReviewOutcomeAppealStatus, string> = {
  submitted: "bg-amber-100 text-amber-800",
  under_review: "bg-blue-100 text-blue-800",
  upheld: "bg-green-100 text-green-800",
  not_upheld: "bg-gray-100 text-gray-700",
  withdrawn: "bg-gray-100 text-gray-700",
};

function apiError(error: unknown, fallback: string): string {
  const candidate = error as {
    response?: { data?: { error?: { message?: string } } };
  };
  return candidate.response?.data?.error?.message ?? fallback;
}

function statusLabel(
  status: ReviewOutcomeAppealStatus,
  t: (key: string) => string,
): string {
  return t(`reviewCycleDetail.appeals.status.${status}`);
}

export function ReviewOutcomeAppealsPanel({ cycleId }: { cycleId: string }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<AppealFilter>("all");
  const [page, setPage] = useState(1);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const appealsQuery = useQuery({
    queryKey: ["review-outcome-appeals", cycleId, filter, page],
    queryFn: () =>
      apiGet<PaginatedResponse<ReviewOutcomeView>>("/review-outcomes/appeals", {
        cycleId,
        status: filter === "all" ? undefined : filter,
        page,
        perPage: 20,
      }),
  });

  const countQueries = useQueries({
    queries: FILTERS.map((status) => ({
      queryKey: ["review-outcome-appeals", cycleId, "count", status],
      queryFn: () =>
        apiGet<PaginatedResponse<ReviewOutcomeView>>("/review-outcomes/appeals", {
          cycleId,
          status: status === "all" ? undefined : status,
          page: 1,
          perPage: 1,
        }),
    })),
  });

  const invalidateAppeals = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["review-outcome-appeals", cycleId],
    });
  };

  const startReviewMutation = useMutation({
    mutationFn: (outcomeId: string) =>
      apiPost(`/review-outcomes/${outcomeId}/appeals/start-review`),
    onSuccess: async () => {
      setStatusMessage(t("reviewCycleDetail.appeals.reviewStarted"));
      await invalidateAppeals();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({
      outcomeId,
      outcome,
      resolutionNote,
    }: {
      outcomeId: string;
      outcome: ResolutionOutcome;
      resolutionNote: string;
    }) =>
      apiPost(`/review-outcomes/${outcomeId}/appeals/resolve`, {
        outcome,
        resolution_note: resolutionNote,
      }),
    onSuccess: async () => {
      setResolvingId(null);
      setStatusMessage(t("reviewCycleDetail.appeals.resolved"));
      await invalidateAppeals();
    },
  });

  const appeals = appealsQuery.data?.data?.data ?? [];
  const total = appealsQuery.data?.data?.total ?? 0;
  const totalPages = appealsQuery.data?.data?.totalPages ?? 1;
  const counts = FILTERS.reduce<Record<AppealFilter, number | null>>(
    (result, status, index) => {
      result[status] = countQueries[index]?.data?.data?.total ?? null;
      return result;
    },
    {
      all: null,
      submitted: null,
      under_review: null,
      upheld: null,
      not_upheld: null,
      withdrawn: null,
    },
  );
  const openCount =
    counts.submitted !== null && counts.under_review !== null
      ? counts.submitted + counts.under_review
      : null;

  async function handleStartReview(outcomeId: string) {
    setStatusMessage("");
    const approved = await confirm({
      title: t("reviewCycleDetail.appeals.startReviewConfirmTitle"),
      message: t("reviewCycleDetail.appeals.startReviewConfirmMessage"),
      confirmLabel: t("reviewCycleDetail.appeals.startReviewConfirmAction"),
      variant: "default",
    });
    if (approved) startReviewMutation.mutate(outcomeId);
  }

  async function handleResolve(
    outcomeId: string,
    resolutionOutcome: ResolutionOutcome,
    resolutionNote: string,
  ) {
    setStatusMessage("");
    const approved = await confirm({
      title: t("reviewCycleDetail.appeals.resolveConfirmTitle"),
      message: t("reviewCycleDetail.appeals.resolveConfirmMessage", {
        outcome: statusLabel(resolutionOutcome, t),
      }),
      confirmLabel: t("reviewCycleDetail.appeals.resolveConfirmAction"),
      variant: "default",
    });
    if (approved) {
      resolveMutation.mutate({
        outcomeId,
        outcome: resolutionOutcome,
        resolutionNote,
      });
    }
  }

  return (
    <section aria-labelledby="appeals-heading" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="appeals-heading" className="text-lg font-semibold text-gray-900">
            {t("reviewCycleDetail.appeals.title")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            {t("reviewCycleDetail.appeals.description")}
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">{openCount ?? "—"}</span>{" "}
          {t("reviewCycleDetail.appeals.openCount")}
        </div>
      </div>

      <fieldset>
        <legend className="sr-only">{t("reviewCycleDetail.appeals.filterLegend")}</legend>
        <div className="flex flex-wrap gap-2" aria-label={t("reviewCycleDetail.appeals.filterLegend")}>
          {FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={filter === status}
              onClick={() => {
                setFilter(status);
                setPage(1);
              }}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
                filter === status
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {status === "all"
                ? t("reviewCycleDetail.appeals.filterAll")
                : statusLabel(status, t)}
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  filter === status ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {counts[status] ?? "—"}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <div role="status" aria-live="polite" className="sr-only">
        {statusMessage}
      </div>

      {appealsQuery.isLoading ? (
        <div aria-live="polite" className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {t("reviewCycleDetail.appeals.loading")}
        </div>
      ) : appealsQuery.isError ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mr-2 inline h-4 w-4" aria-hidden="true" />
          {apiError(appealsQuery.error, t("reviewCycleDetail.appeals.loadFailed"))}
        </div>
      ) : appeals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white py-12 text-center">
          <Flag className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-semibold text-gray-900">
            {t("reviewCycleDetail.appeals.emptyTitle")}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {t("reviewCycleDetail.appeals.emptyDescription")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {appeals.map((outcome) => {
            const appealStatus = outcome.appeal_status;
            if (!appealStatus) return null;
            const startPending =
              startReviewMutation.isPending && startReviewMutation.variables === outcome.id;
            const resolvePending =
              resolveMutation.isPending && resolveMutation.variables?.outcomeId === outcome.id;
            const panelId = `appeal-resolution-${outcome.id}`;

            return (
              <article key={outcome.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-gray-900">
                        {outcome.employee_name ??
                          t("reviewCycleDetail.employeeNumber", { id: outcome.employee_id })}
                      </h3>
                      <StatusBadge colorClass={STATUS_STYLES[appealStatus]}>
                        {statusLabel(appealStatus, t)}
                      </StatusBadge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600">
                      <span className="inline-flex items-center gap-1.5">
                        <Scale className="h-4 w-4 text-brand-600" aria-hidden="true" />
                        {t("reviewCycleDetail.appeals.releasedRating", {
                          rating: Number(outcome.released_rating).toFixed(2),
                        })}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="h-4 w-4 text-gray-400" aria-hidden="true" />
                        {t("reviewCycleDetail.appeals.submittedOn", {
                          date: outcome.appeal_submitted_at
                            ? formatDate(outcome.appeal_submitted_at)
                            : t("reviewCycleDetail.appeals.notAvailable"),
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {appealStatus === "submitted" && (
                      <button
                        type="button"
                        onClick={() => void handleStartReview(outcome.id)}
                        disabled={startPending}
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                      >
                        {startPending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                        {startPending
                          ? t("reviewCycleDetail.appeals.startingReview")
                          : t("reviewCycleDetail.appeals.startReview")}
                      </button>
                    )}
                    {appealStatus === "under_review" && (
                      <button
                        type="button"
                        aria-expanded={resolvingId === outcome.id}
                        aria-controls={panelId}
                        onClick={() =>
                          setResolvingId((current) => (current === outcome.id ? null : outcome.id))
                        }
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        {t("reviewCycleDetail.appeals.resolveAction")}
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 rounded-lg bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t("reviewCycleDetail.appeals.employeeReason")}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">
                    {outcome.appeal_reason ?? t("reviewCycleDetail.appeals.notAvailable")}
                  </p>
                </div>

                {outcome.appeal_resolution_note && (
                  <div className="mt-4 rounded-lg border border-gray-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {t("reviewCycleDetail.appeals.resolutionNote")}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">
                      {outcome.appeal_resolution_note}
                    </p>
                  </div>
                )}

                {appealStatus === "upheld" && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    {t("reviewCycleDetail.appeals.correctionPending")}
                  </div>
                )}

                {appealStatus === "under_review" && resolvingId === outcome.id && (
                  <ResolutionForm
                    id={panelId}
                    outcomeId={outcome.id}
                    isPending={resolvePending}
                    error={
                      resolveMutation.isError &&
                      resolveMutation.variables?.outcomeId === outcome.id
                        ? apiError(
                            resolveMutation.error,
                            t("reviewCycleDetail.appeals.resolveFailed"),
                          )
                        : null
                    }
                    onCancel={() => setResolvingId(null)}
                    onResolve={(resolutionOutcome, resolutionNote) =>
                      void handleResolve(outcome.id, resolutionOutcome, resolutionNote)
                    }
                  />
                )}

                {startReviewMutation.isError &&
                  startReviewMutation.variables === outcome.id && (
                    <p role="alert" className="mt-3 text-sm text-red-700">
                      {apiError(
                        startReviewMutation.error,
                        t("reviewCycleDetail.appeals.startFailed"),
                      )}
                    </p>
                  )}
              </article>
            );
          })}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        onPageChange={setPage}
      />
    </section>
  );
}

function ResolutionForm({
  id,
  outcomeId,
  isPending,
  error,
  onCancel,
  onResolve,
}: {
  id: string;
  outcomeId: string;
  isPending: boolean;
  error: string | null;
  onCancel: () => void;
  onResolve: (outcome: ResolutionOutcome, note: string) => void;
}) {
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState<ResolutionOutcome | null>(null);
  const [note, setNote] = useState("");
  const [outcomeError, setOutcomeError] = useState("");
  const [validationError, setValidationError] = useState("");
  const noteId = `appeal-resolution-note-${outcomeId}`;
  const helpId = `${noteId}-help`;
  const errorId = `${noteId}-error`;
  const outcomeErrorId = `appeal-resolution-outcome-${outcomeId}-error`;
  const firstOutcomeRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!outcome) {
      setOutcomeError(t("reviewCycleDetail.appeals.resolutionOutcomeRequired"));
      requestAnimationFrame(() => firstOutcomeRef.current?.focus());
      return;
    }
    const normalized = note.trim();
    if (normalized.length < 20) {
      setValidationError(t("reviewCycleDetail.appeals.resolutionNoteTooShort"));
      requestAnimationFrame(() => noteRef.current?.focus());
      return;
    }
    setOutcomeError("");
    setValidationError("");
    onResolve(outcome, normalized);
  }

  return (
    <form
      id={id}
      onSubmit={handleSubmit}
      className="mt-4 space-y-4 rounded-lg border border-brand-200 bg-brand-50/40 p-4"
      aria-labelledby={`${id}-heading`}
    >
      <div>
        <h4 id={`${id}-heading`} className="font-semibold text-gray-900">
          {t("reviewCycleDetail.appeals.resolutionTitle")}
        </h4>
        <p className="mt-1 text-sm text-gray-600">
          {t("reviewCycleDetail.appeals.resolutionDescription")}
        </p>
      </div>

      <fieldset aria-describedby={outcomeError ? outcomeErrorId : undefined}>
        <legend className="text-sm font-medium text-gray-800">
          {t("reviewCycleDetail.appeals.resolutionOutcome")}
        </legend>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          {(["upheld", "not_upheld"] as const).map((value) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus-within:ring-2 focus-within:ring-brand-500"
            >
              <input
                ref={value === "upheld" ? firstOutcomeRef : undefined}
                type="radio"
                name={`appeal-resolution-${outcomeId}`}
                value={value}
                checked={outcome === value}
                onChange={() => {
                  setOutcome(value);
                  setOutcomeError("");
                }}
                required
              />
              {statusLabel(value, t)}
            </label>
          ))}
        </div>
        {outcomeError && (
          <p id={outcomeErrorId} role="alert" className="mt-2 text-sm text-red-700">
            {outcomeError}
          </p>
        )}
      </fieldset>

      <div>
        <label htmlFor={noteId} className="block text-sm font-medium text-gray-800">
          {t("reviewCycleDetail.appeals.resolutionNoteLabel")}
        </label>
        <textarea
          id={noteId}
          ref={noteRef}
          name="appeal_resolution_note"
          autoComplete="off"
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            if (validationError && event.target.value.trim().length >= 20) {
              setValidationError("");
            }
          }}
          rows={4}
          minLength={20}
          maxLength={4000}
          required
          aria-invalid={Boolean(validationError)}
          aria-describedby={validationError ? errorId : helpId}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        {validationError ? (
          <p id={errorId} role="alert" className="mt-1 text-sm text-red-700">
            {validationError}
          </p>
        ) : (
          <p id={helpId} className="mt-1 text-xs text-gray-500">
            {t("reviewCycleDetail.appeals.resolutionNoteHelp")}
          </p>
        )}
      </div>

      {outcome === "upheld" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {t("reviewCycleDetail.appeals.upheldWarning")}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {isPending
            ? t("reviewCycleDetail.appeals.resolving")
            : t("reviewCycleDetail.appeals.submitResolution")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
