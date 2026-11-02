import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, History, LoaderCircle, Pencil, Scale, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiGet, apiPost, apiPut } from "@/api/client";
import { useConfirm } from "@/components/ConfirmDialog";

type CycleStatus = "draft" | "active" | "in_review" | "calibration" | "completed" | "cancelled";

export type CalibrationDecision = {
  id?: string;
  rating: number;
  reason: string;
  version?: number;
  decidedBy?: number | string | null;
  decidedByName?: string | null;
  createdAt?: string | null;
};

export type CalibrationParticipant = {
  participantId: string;
  employeeId: number;
  employeeName: string;
  baselineRating: number | null;
  calibratedRating: number | null;
  finalRating: number | null;
  hasDecision: boolean;
  latestDecision?: CalibrationDecision | null;
  incompleteRequiredReviews: string[];
};

export type CalibrationSnapshot = {
  cycleId: string;
  status: CycleStatus;
  finalizedAt: string | null;
  finalizedBy: number | string | null;
  participants: CalibrationParticipant[];
  participantCount: number;
  readyCount: number;
  isComplete: boolean;
};

type CalibrationPanelProps = {
  cycleId: string;
  cycleStatus: CycleStatus;
  snapshot?: CalibrationSnapshot;
  isLoading: boolean;
  error: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDecision(value: unknown): CalibrationDecision | null {
  if (!isRecord(value)) return null;
  const rating = asNumber(value.rating ?? value.calibratedRating ?? value.calibrated_rating);
  if (rating === null) return null;
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    rating,
    reason: String(value.reason ?? ""),
    version: asNumber(value.version) ?? undefined,
    decidedBy: (value.decidedBy ?? value.decided_by ?? null) as number | string | null,
    decidedByName:
      typeof (value.decidedByName ?? value.decided_by_name) === "string"
        ? String(value.decidedByName ?? value.decided_by_name)
        : null,
    createdAt:
      typeof (value.createdAt ?? value.created_at) === "string"
        ? String(value.createdAt ?? value.created_at)
        : null,
  };
}

function normalizeSnapshot(payload: unknown): CalibrationSnapshot {
  const initial = isRecord(payload) ? payload : {};
  const root = isRecord(initial.data) && !Array.isArray(initial.data) && !("participants" in initial)
    ? initial.data
    : initial;
  const rawParticipants = Array.isArray(root.participants)
    ? root.participants
    : Array.isArray(root.roster)
      ? root.roster
      : [];
  const participants: CalibrationParticipant[] = rawParticipants
    .filter(isRecord)
    .map((participant) => {
      const latestDecision = normalizeDecision(
        participant.latestDecision ?? participant.latest_decision,
      );
      const participantId = String(
        participant.participantId ?? participant.participant_id ?? participant.id ?? "",
      );
      const employeeId = asNumber(participant.employeeId ?? participant.employee_id) ?? 0;
      const calibratedRating = asNumber(
        participant.calibratedRating ?? participant.calibrated_rating ?? latestDecision?.rating,
      );
      const rawIncompleteRequiredReviews =
        participant.incompleteRequiredReviews ?? participant.incomplete_required_reviews;
      const incompleteRequiredReviews = Array.isArray(rawIncompleteRequiredReviews)
        ? rawIncompleteRequiredReviews.map(String)
        : [];
      return {
        participantId,
        employeeId,
        employeeName: String(
          participant.employeeName ?? participant.employee_name ?? `Employee #${employeeId}`,
        ),
        baselineRating: asNumber(participant.baselineRating ?? participant.baseline_rating),
        calibratedRating,
        finalRating: asNumber(participant.finalRating ?? participant.final_rating),
        hasDecision: Boolean(
          participant.hasDecision ??
            participant.has_decision ??
            (latestDecision !== null || calibratedRating !== null),
        ),
        latestDecision,
        incompleteRequiredReviews,
      };
    });
  const participantCount =
    asNumber(root.participantCount ?? root.participant_count) ?? participants.length;
  const readyCount =
    asNumber(root.readyCount ?? root.ready_count) ??
    participants.filter((participant) => participant.baselineRating !== null).length;

  return {
    cycleId: String(root.cycleId ?? root.cycle_id ?? ""),
    status: String(root.status ?? "calibration") as CycleStatus,
    finalizedAt:
      typeof (root.finalizedAt ?? root.finalized_at ?? root.calibration_finalized_at) === "string"
        ? String(root.finalizedAt ?? root.finalized_at ?? root.calibration_finalized_at)
        : null,
    finalizedBy: (root.finalizedBy ?? root.finalized_by ?? root.calibration_finalized_by ?? null) as
      | number
      | string
      | null,
    participants,
    participantCount,
    readyCount,
    isComplete: Boolean(
      root.isComplete ?? root.is_complete ?? (participantCount > 0 && readyCount === participantCount),
    ),
  };
}

function normalizeHistory(payload: unknown): CalibrationDecision[] {
  const initial = isRecord(payload) ? payload : {};
  const root = Array.isArray(payload)
    ? payload
    : Array.isArray(initial.data)
      ? initial.data
      : isRecord(initial.data) && Array.isArray(initial.data.data)
        ? initial.data.data
        : isRecord(initial.data) && Array.isArray(initial.data.history)
          ? initial.data.history
          : Array.isArray(initial.history)
            ? initial.history
            : [];
  return root.map(normalizeDecision).filter((decision): decision is CalibrationDecision => Boolean(decision));
}

function errorMessage(error: unknown, fallback: string): string {
  if (!isRecord(error)) return fallback;
  const response = isRecord(error.response) ? error.response : null;
  const data = response && isRecord(response.data) ? response.data : null;
  const nestedError = data && isRecord(data.error) ? data.error : null;
  if (nestedError && typeof nestedError.message === "string") return nestedError.message;
  if (data && typeof data.message === "string") return data.message;
  return fallback;
}

export function useCalibrationSnapshot(cycleId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["review-cycle-calibration", cycleId],
    queryFn: async () => {
      const response = await apiGet<unknown>(`/review-cycles/${cycleId}/calibration`);
      return normalizeSnapshot(response.data);
    },
    enabled: Boolean(cycleId) && enabled,
  });
}

function formatRating(value: number | null) {
  return value === null ? "—" : value.toFixed(2).replace(/\.00$/, "");
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function CalibrationPanel({
  cycleId,
  cycleStatus,
  snapshot,
  isLoading,
  error,
}: CalibrationPanelProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [rating, setRating] = useState("3");
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState("");

  const historyQuery = useQuery({
    queryKey: ["review-cycle-calibration-history", cycleId, historyId],
    queryFn: async () => {
      const response = await apiGet<unknown>(
        `/review-cycles/${cycleId}/calibration/${historyId}/history`,
      );
      return normalizeHistory(response.data);
    },
    enabled: Boolean(historyId),
  });

  const decisionMutation = useMutation({
    mutationFn: ({ participantId, nextRating, nextReason }: {
      participantId: string;
      nextRating: number;
      nextReason: string;
    }) => apiPut(`/review-cycles/${cycleId}/calibration/${participantId}`, {
      rating: nextRating,
      reason: nextReason,
    }),
    onSuccess: async () => {
      setEditingId(null);
      setReason("");
      setValidationError("");
      await queryClient.invalidateQueries({ queryKey: ["review-cycle-calibration", cycleId] });
      await queryClient.invalidateQueries({ queryKey: ["review-cycle-calibration-history", cycleId] });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: () => apiPost(`/review-cycles/${cycleId}/calibration/finalize`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["review-cycle-calibration", cycleId] });
      await queryClient.invalidateQueries({ queryKey: ["review-cycle", cycleId] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white py-12 text-sm text-gray-500" aria-live="polite">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
        {t("reviewCycleDetail.calibrationLoading")}
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {errorMessage(error, t("reviewCycleDetail.calibrationLoadFailed"))}
      </div>
    );
  }

  if (cycleStatus !== "calibration" && cycleStatus !== "completed") {
    return (
      <div className="rounded-xl border border-dashed border-purple-300 bg-purple-50/50 px-6 py-10 text-center">
        <Scale className="mx-auto h-9 w-9 text-purple-500" aria-hidden="true" />
        <h3 className="mt-3 text-base font-semibold text-gray-900">
          {t("reviewCycleDetail.calibrationNotStarted")}
        </h3>
        <p className="mx-auto mt-1 max-w-xl text-sm text-gray-600">
          {t("reviewCycleDetail.calibrationNotStartedDescription")}
        </p>
      </div>
    );
  }

  const participants = snapshot?.participants ?? [];
  const decisionCount = participants.filter((participant) => participant.hasDecision).length;
  const canFinalize =
    cycleStatus === "calibration" &&
    !snapshot?.finalizedAt &&
    Boolean(snapshot?.isComplete);
  const readOnly = cycleStatus === "completed" || Boolean(snapshot?.finalizedAt);

  function beginAdjustment(participant: CalibrationParticipant) {
    setEditingId(participant.participantId);
    setRating(String(participant.calibratedRating ?? participant.baselineRating ?? 3));
    setReason("");
    setValidationError("");
  }

  function saveDecision(participantId: string) {
    const nextRating = Number(rating);
    const nextReason = reason.trim();
    if (!Number.isFinite(nextRating) || nextRating < 1 || nextRating > 5) {
      setValidationError(t("reviewCycleDetail.calibrationRatingError"));
      return;
    }
    if (nextReason.length < 10) {
      setValidationError(t("reviewCycleDetail.calibrationReasonError"));
      return;
    }
    decisionMutation.mutate({ participantId, nextRating, nextReason });
  }

  async function handleFinalize() {
    if (!canFinalize || finalizeMutation.isPending) return;
    const approved = await confirm({
      title: t("reviewCycleDetail.calibrationFinalizeTitle"),
      message: t("reviewCycleDetail.calibrationFinalizeMessage"),
      confirmLabel: t("reviewCycleDetail.calibrationFinalize"),
      variant: "default",
    });
    if (approved) finalizeMutation.mutate();
  }

  return (
    <section aria-labelledby="calibration-heading" className="space-y-4">
      <div className="flex flex-col gap-4 rounded-xl border border-purple-200 bg-purple-50/50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-purple-600" aria-hidden="true" />
            <h3 id="calibration-heading" className="text-lg font-semibold text-gray-900">
              {t("reviewCycleDetail.calibrationWorkspace")}
            </h3>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {t("reviewCycleDetail.calibrationProgress", {
              ready: snapshot?.readyCount ?? 0,
              total: snapshot?.participantCount ?? participants.length,
              adjustments: decisionCount,
            })}
          </p>
          {snapshot?.finalizedAt && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {t("reviewCycleDetail.calibrationFinalizedAt", {
                date: formatTimestamp(snapshot.finalizedAt),
              })}
            </p>
          )}
        </div>
        {cycleStatus === "calibration" && !snapshot?.finalizedAt && (
          <div className="sm:text-right">
            <button
              type="button"
              aria-disabled={!canFinalize || finalizeMutation.isPending}
              aria-describedby="finalize-calibration-help"
              onClick={() => void handleFinalize()}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 ${
                canFinalize
                  ? "bg-purple-600 hover:bg-purple-700"
                  : "cursor-not-allowed bg-purple-300"
              }`}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {finalizeMutation.isPending
                ? t("reviewCycleDetail.calibrationFinalizing")
                : t("reviewCycleDetail.calibrationFinalize")}
            </button>
            <p id="finalize-calibration-help" className="mt-1 max-w-xs text-xs text-gray-500">
              {canFinalize
                ? t("reviewCycleDetail.calibrationFinalizeReady")
                : t("reviewCycleDetail.calibrationFinalizeBlocked")}
            </p>
          </div>
        )}
      </div>

      {finalizeMutation.isError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage(finalizeMutation.error, t("reviewCycleDetail.calibrationFinalizeFailed"))}
        </div>
      )}

      {participants.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-500">
          {t("reviewCycleDetail.calibrationNoParticipants")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("reviewCycleDetail.columnEmployee")}
                </th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("reviewCycleDetail.calibrationBaseline")}
                </th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("reviewCycleDetail.calibrationDecision")}
                </th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("reviewCycleDetail.calibrationRationale")}
                </th>
                <th scope="col" className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("reviewCycleDetail.calibrationActions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {participants.map((participant) => {
                const editing = editingId === participant.participantId;
                const showingHistory = historyId === participant.participantId;
                const formId = `calibration-form-${participant.participantId}`;
                return (
                  <tr key={participant.participantId} className="align-top">
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-gray-900">{participant.employeeName}</p>
                      <p className="text-xs text-gray-500">
                        {t("reviewCycleDetail.employeeNumber", { id: participant.employeeId })}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-gray-800">
                      {formatRating(participant.baselineRating)}
                      {participant.incompleteRequiredReviews.length > 0 && (
                        <p className="mt-1 text-xs font-normal text-amber-700">
                          {t("reviewCycleDetail.calibrationMissingReviews", {
                            reviews: participant.incompleteRequiredReviews.join(", "),
                          })}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {participant.hasDecision ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-sm font-semibold text-green-700">
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          {formatRating(participant.calibratedRating)}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                          {t("reviewCycleDetail.calibrationPendingDecision")}
                        </span>
                      )}
                    </td>
                    <td className="max-w-sm px-5 py-4 text-sm text-gray-600">
                      {participant.latestDecision?.reason || "—"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-2">
                        {!readOnly && participant.baselineRating !== null && (
                          <button
                            type="button"
                            onClick={() => (editing ? setEditingId(null) : beginAdjustment(participant))}
                            aria-expanded={editing}
                            aria-controls={formId}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            {editing
                              ? t("common.cancel")
                              : participant.hasDecision
                                ? t("reviewCycleDetail.calibrationRevise")
                                : t("reviewCycleDetail.calibrationDecide")}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setHistoryId(showingHistory ? null : participant.participantId)}
                          aria-expanded={showingHistory}
                          aria-controls={`calibration-history-${participant.participantId}`}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          <History className="h-4 w-4" aria-hidden="true" />
                          {t("reviewCycleDetail.calibrationHistory")}
                        </button>
                      </div>

                      {editing && (
                        <form
                          id={formId}
                          onSubmit={(event) => {
                            event.preventDefault();
                            saveDecision(participant.participantId);
                          }}
                          className="mt-3 min-w-72 rounded-lg border border-purple-200 bg-purple-50/50 p-3 text-left"
                        >
                          <div className="grid gap-3">
                            <div>
                              <label htmlFor={`${formId}-rating`} className="block text-xs font-medium text-gray-700">
                                {t("reviewCycleDetail.calibrationRatingLabel")}
                              </label>
                              <input
                                id={`${formId}-rating`}
                                type="number"
                                min={1}
                                max={5}
                                step={0.01}
                                required
                                value={rating}
                                onChange={(event) => setRating(event.target.value)}
                                aria-invalid={Boolean(validationError)}
                                aria-describedby={`${formId}-help`}
                                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                              />
                            </div>
                            <div>
                              <label htmlFor={`${formId}-reason`} className="block text-xs font-medium text-gray-700">
                                {t("reviewCycleDetail.calibrationReasonLabel")}
                              </label>
                              <textarea
                                id={`${formId}-reason`}
                                required
                                minLength={10}
                                rows={3}
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                aria-invalid={Boolean(validationError)}
                                aria-describedby={`${formId}-help`}
                                className="mt-1 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                              />
                            </div>
                            <p id={`${formId}-help`} className="text-xs text-gray-500">
                              {t("reviewCycleDetail.calibrationReasonHelp")}
                            </p>
                            {validationError && (
                              <p role="alert" className="text-xs font-medium text-red-600">{validationError}</p>
                            )}
                            {decisionMutation.isError && (
                              <p role="alert" className="text-xs font-medium text-red-600">
                                {errorMessage(decisionMutation.error, t("reviewCycleDetail.calibrationDecisionFailed"))}
                              </p>
                            )}
                            <button
                              type="submit"
                              disabled={decisionMutation.isPending}
                              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
                            >
                              {decisionMutation.isPending
                                ? t("reviewCycleDetail.calibrationSaving")
                                : t("reviewCycleDetail.calibrationSaveDecision")}
                            </button>
                          </div>
                        </form>
                      )}

                      {showingHistory && (
                        <div
                          id={`calibration-history-${participant.participantId}`}
                          className="mt-3 min-w-72 rounded-lg border border-gray-200 bg-gray-50 p-3 text-left"
                          aria-live="polite"
                        >
                          {historyQuery.isLoading ? (
                            <p className="text-xs text-gray-500">{t("reviewCycleDetail.calibrationHistoryLoading")}</p>
                          ) : historyQuery.isError ? (
                            <p role="alert" className="text-xs text-red-600">
                              {errorMessage(historyQuery.error, t("reviewCycleDetail.calibrationHistoryFailed"))}
                            </p>
                          ) : (historyQuery.data ?? []).length === 0 ? (
                            <p className="text-xs text-gray-500">{t("reviewCycleDetail.calibrationNoHistory")}</p>
                          ) : (
                            <ol className="space-y-2">
                              {(historyQuery.data ?? []).map((decision, index) => (
                                <li key={decision.id ?? `${decision.version ?? index}-${decision.createdAt ?? index}`} className="border-b border-gray-200 pb-2 last:border-0 last:pb-0">
                                  <div className="flex justify-between gap-3 text-xs">
                                    <span className="font-semibold text-gray-800">
                                      {t("reviewCycleDetail.calibrationHistoryRating", { rating: formatRating(decision.rating) })}
                                    </span>
                                    <span className="text-gray-500">{formatTimestamp(decision.createdAt)}</span>
                                  </div>
                                  <p className="mt-1 text-xs text-gray-600">{decision.reason}</p>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
