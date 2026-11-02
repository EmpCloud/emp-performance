import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { apiGet, apiPost } from "@/api/client";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAuthStore } from "@/lib/auth-store";
import type { PaginatedResponse } from "@emp-performance/shared";

type OutboxStatus = "pending" | "processing" | "retry" | "delivered" | "dead";

interface IntegrationOutboxSummary {
  total: number;
  pending: number;
  processing: number;
  retry: number;
  delivered: number;
  dead: number;
  ready: number;
  oldest_pending_at: string | null;
}

interface IntegrationOutboxEvent {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  status: OutboxStatus;
  attempts: number;
  max_attempts: number;
  replay_count: number;
  next_attempt_at: string | null;
  last_error: string | null;
  delivered_at: string | null;
  dead_at: string | null;
  last_replayed_at: string | null;
  created_at: string;
  updated_at: string;
  replayable: boolean;
}

interface IntegrationDeliveryAttempt {
  id: string;
  replay_generation: number;
  attempt_number: number;
  result: "delivered" | "retry" | "dead";
  http_status: number | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

interface IntegrationOutboxDetail extends IntegrationOutboxEvent {
  payload_metadata: {
    byte_size: number;
    property_count: number;
  };
  attempt_history: IntegrationDeliveryAttempt[];
}

const PAGE_SIZE = 12;
const STATUSES: Array<"" | OutboxStatus> = [
  "",
  "pending",
  "processing",
  "retry",
  "delivered",
  "dead",
];

const STATUS_STYLES: Record<OutboxStatus, string> = {
  pending: "border-blue-200 bg-blue-50 text-blue-800",
  processing: "border-violet-200 bg-violet-50 text-violet-800",
  retry: "border-amber-200 bg-amber-50 text-amber-800",
  delivered: "border-green-200 bg-green-50 text-green-800",
  dead: "border-red-200 bg-red-50 text-red-800",
};

function apiErrorMessage(error: unknown, fallback: string): string {
  const candidate = error as {
    response?: { data?: { error?: { message?: string } } };
  };
  return candidate.response?.data?.error?.message ?? fallback;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(document.documentElement.lang || "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function IntegrationOutboxPage() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const userRole = useAuthStore((state) => state.user?.role);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"" | OutboxStatus>("");
  const [eventTypeInput, setEventTypeInput] = useState("");
  const [eventType, setEventType] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const detailPanelRef = useRef<HTMLElement>(null);
  const replayErrorRef = useRef<HTMLParagraphElement>(null);
  const detailTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const detailTriggerIdRef = useRef<string | null>(null);
  const canRead =
    userRole === "super_admin" ||
    userRole === "org_admin" ||
    userRole === "hr_admin";
  const canReplay = userRole === "super_admin" || userRole === "org_admin";

  const summaryQuery = useQuery({
    queryKey: ["integration-outbox", "summary"],
    queryFn: () => apiGet<IntegrationOutboxSummary>("/integrations/outbox/summary"),
    enabled: canRead,
    refetchInterval: 30_000,
    retry: 1,
  });

  const eventsQuery = useQuery({
    queryKey: ["integration-outbox", "events", status, eventType, page],
    queryFn: () =>
      apiGet<PaginatedResponse<IntegrationOutboxEvent>>("/integrations/outbox", {
        status: status || undefined,
        eventType: eventType || undefined,
        page,
        perPage: PAGE_SIZE,
      }),
    enabled: canRead,
    refetchInterval: 30_000,
    retry: 1,
  });

  const detailQuery = useQuery({
    queryKey: ["integration-outbox", "detail", selectedId],
    queryFn: () =>
      apiGet<IntegrationOutboxDetail>(`/integrations/outbox/${selectedId}`),
    enabled: canRead && Boolean(selectedId),
    retry: 1,
  });

  const replayMutation = useMutation({
    mutationFn: (eventId: string) =>
      apiPost<IntegrationOutboxDetail>(`/integrations/outbox/${eventId}/replay`),
    onSuccess: async () => {
      setLiveMessage(t("integrationOutbox.live.replayQueued"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["integration-outbox", "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["integration-outbox", "events"] }),
        queryClient.invalidateQueries({
          queryKey: ["integration-outbox", "detail", selectedId],
        }),
      ]);
    },
    onError: () => {
      requestAnimationFrame(() => replayErrorRef.current?.focus());
    },
  });

  useEffect(() => {
    if (!selectedId) return;
    requestAnimationFrame(() => detailPanelRef.current?.focus());
  }, [selectedId, detailQuery.status]);

  const summary = summaryQuery.data?.data;
  const events = eventsQuery.data?.data?.data ?? [];
  const pager = eventsQuery.data?.data;
  const detail = detailQuery.data?.data;

  useEffect(() => {
    if (!pager || eventsQuery.isFetching) return;
    const lastPage = Math.max(1, pager.totalPages);
    if (page > lastPage) {
      setPage(lastPage);
      setSelectedId(null);
      setLiveMessage(
        t("integrationOutbox.pagination.pageAdjusted", { page: lastPage }),
      );
    }
  }, [eventsQuery.isFetching, page, pager, t]);

  function closeDetails() {
    const triggerId = detailTriggerIdRef.current;
    setSelectedId(null);
    requestAnimationFrame(() => {
      if (triggerId) detailTriggerRefs.current.get(triggerId)?.focus();
    });
  }

  function toggleDetails(eventId: string) {
    if (selectedId === eventId) {
      closeDetails();
      return;
    }
    detailTriggerIdRef.current = eventId;
    setSelectedId(eventId);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEventType(eventTypeInput.trim());
    setPage(1);
    setSelectedId(null);
    setLiveMessage(t("integrationOutbox.live.filtersApplied"));
  }

  function clearFilters() {
    setStatus("");
    setEventTypeInput("");
    setEventType("");
    setPage(1);
    setSelectedId(null);
    setLiveMessage(t("integrationOutbox.live.filtersCleared"));
  }

  async function replayEvent(event: IntegrationOutboxDetail) {
    setLiveMessage("");
    if (!event.replayable || event.status !== "dead") return;
    const approved = await confirm({
      title: t("integrationOutbox.replay.confirmTitle"),
      message: t("integrationOutbox.replay.confirmMessage", {
        eventType: event.event_type,
      }),
      confirmLabel: t("integrationOutbox.replay.confirmAction"),
      variant: "default",
    });
    if (approved) replayMutation.mutate(event.id);
  }

  if (!canRead) {
    return (
      <main className="mx-auto max-w-3xl" aria-labelledby="integration-access-denied-title">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6" role="alert">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-700" aria-hidden="true" />
            <div>
              <h1 id="integration-access-denied-title" className="text-xl font-bold text-red-950">
                {t("integrationOutbox.accessDeniedTitle")}
              </h1>
              <p className="mt-2 leading-6 text-red-800">
                {t("integrationOutbox.accessDeniedDescription")}
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6" aria-labelledby="integration-outbox-title">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <Activity className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 id="integration-outbox-title" className="text-2xl font-bold text-gray-950">
              {t("integrationOutbox.title")}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">
              {t("integrationOutbox.description")}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            void summaryQuery.refetch();
            void eventsQuery.refetch();
            if (selectedId) void detailQuery.refetch();
            setLiveMessage(t("integrationOutbox.live.refreshed"));
          }}
          disabled={summaryQuery.isFetching || eventsQuery.isFetching}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <RefreshCw
            className={`h-4 w-4 motion-reduce:animate-none ${
              summaryQuery.isFetching || eventsQuery.isFetching ? "animate-spin" : ""
            }`}
            aria-hidden="true"
          />
          {t("integrationOutbox.refresh")}
        </button>
      </header>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      {!canReplay && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t("integrationOutbox.readOnlyTitle")}</p>
            <p className="mt-1 leading-6">
              {t("integrationOutbox.readOnlyDescription")}
            </p>
          </div>
        </div>
      )}

      {summaryQuery.isLoading ? (
        <div className="flex min-h-28 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-brand-600 motion-reduce:animate-none" aria-hidden="true" />
          {t("integrationOutbox.health.loading")}
        </div>
      ) : summaryQuery.isError || !summary ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5" role="alert">
          <div className="flex items-start gap-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>
              {apiErrorMessage(
                summaryQuery.error,
                t("integrationOutbox.health.loadError"),
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void summaryQuery.refetch()}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            {t("integrationOutbox.health.retry")}
          </button>
        </div>
      ) : (
        <section aria-labelledby="integration-health-heading">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="integration-health-heading" className="text-lg font-semibold text-gray-950">
                {t("integrationOutbox.health.title")}
              </h2>
              <p className="text-sm text-gray-600">
                {t("integrationOutbox.health.autoRefresh")}
              </p>
            </div>
            <p className="text-xs text-gray-500">
              {t("integrationOutbox.health.oldestPending", {
                date: formatDateTime(summary.oldest_pending_at),
              })}
            </p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <HealthCard label={t("integrationOutbox.health.total")} value={summary.total} icon={<Send className="h-5 w-5" />} tone="blue" />
            <HealthCard label={t("integrationOutbox.health.ready")} value={summary.ready} icon={<Clock3 className="h-5 w-5" />} tone="blue" />
            <HealthCard label={t("integrationOutbox.health.pending")} value={summary.pending} icon={<Clock3 className="h-5 w-5" />} tone="gray" />
            <HealthCard label={t("integrationOutbox.health.retry")} value={summary.retry} icon={<RefreshCw className="h-5 w-5" />} tone="amber" />
            <HealthCard label={t("integrationOutbox.health.dead")} value={summary.dead} icon={<AlertTriangle className="h-5 w-5" />} tone="red" />
            <HealthCard label={t("integrationOutbox.health.delivered")} value={summary.delivered} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
          </div>
          {summary.processing > 0 && (
            <p className="mt-2 text-xs font-medium text-violet-700">
              {t("integrationOutbox.health.processing", { count: summary.processing })}
            </p>
          )}
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="integration-events-heading">
        <div>
          <h2 id="integration-events-heading" className="text-lg font-semibold text-gray-950">
            {t("integrationOutbox.events.title")}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {t("integrationOutbox.events.description")}
          </p>
        </div>

        <form onSubmit={applyFilters} className="mt-4 grid gap-3 md:grid-cols-[13rem_minmax(0,1fr)_auto]" aria-label={t("integrationOutbox.events.filterLabel")}>
          <div>
            <label htmlFor="outbox-status-filter" className="block text-sm font-medium text-gray-800">
              {t("integrationOutbox.events.statusLabel")}
            </label>
            <select
              id="outbox-status-filter"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as "" | OutboxStatus);
                setPage(1);
                setSelectedId(null);
              }}
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              {STATUSES.map((item) => (
                <option key={item || "all"} value={item}>
                  {t(`integrationOutbox.status.${item || "all"}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="outbox-event-type-filter" className="block text-sm font-medium text-gray-800">
              {t("integrationOutbox.events.typeLabel")}
            </label>
            <input
              id="outbox-event-type-filter"
              type="search"
              value={eventTypeInput}
              onChange={(event) => setEventTypeInput(event.target.value)}
              placeholder={t("integrationOutbox.events.typePlaceholder")}
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              {t("integrationOutbox.events.apply")}
            </button>
            {(status || eventType || eventTypeInput) && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                {t("integrationOutbox.events.clear")}
              </button>
            )}
          </div>
        </form>

        {eventsQuery.isLoading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-gray-600" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-brand-600 motion-reduce:animate-none" aria-hidden="true" />
            {t("integrationOutbox.events.loading")}
          </div>
        ) : eventsQuery.isError ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700" role="alert">
            <p>
              {apiErrorMessage(
                eventsQuery.error,
                t("integrationOutbox.events.loadError"),
              )}
            </p>
            <button
              type="button"
              onClick={() => void eventsQuery.refetch()}
              className="mt-3 inline-flex min-h-11 items-center rounded-lg px-3 font-semibold hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            >
              {t("integrationOutbox.events.retry")}
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-5 py-12 text-center">
            <Send className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" />
            <h3 className="mt-3 font-semibold text-gray-900">
              {t("integrationOutbox.events.emptyTitle")}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {t("integrationOutbox.events.emptyDescription")}
            </p>
          </div>
        ) : (
          <ul className="mt-5 grid gap-3 lg:grid-cols-2">
            {events.map((event) => (
              <li key={event.id}>
                <article className="h-full rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-gray-950">{event.event_type}</p>
                      <p className="mt-1 break-all text-xs text-gray-500">
                        {event.aggregate_type} · {event.aggregate_id}
                      </p>
                    </div>
                    <span className={`self-start rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[event.status]}`}>
                      {t(`integrationOutbox.status.${event.status}`)}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-gray-500">
                        {t("integrationOutbox.events.attempts")}
                      </dt>
                      <dd className="mt-0.5 font-medium text-gray-900">
                        {event.attempts}/{event.max_attempts}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">
                        {t("integrationOutbox.events.replayCount")}
                      </dt>
                      <dd className="mt-0.5 font-medium text-gray-900">{event.replay_count}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">
                        {t("integrationOutbox.events.created")}
                      </dt>
                      <dd className="mt-0.5 text-gray-700">{formatDateTime(event.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">
                        {t("integrationOutbox.events.nextAttempt")}
                      </dt>
                      <dd className="mt-0.5 text-gray-700">{formatDateTime(event.next_attempt_at)}</dd>
                    </div>
                  </dl>
                  {event.last_error && (
                    <p className="mt-3 line-clamp-2 break-words rounded-lg bg-red-50 p-2 text-xs text-red-700">
                      {t("integrationOutbox.events.sanitizedError", {
                        error: event.last_error,
                      })}
                    </p>
                  )}
                  <button
                    ref={(node) => {
                      if (node) detailTriggerRefs.current.set(event.id, node);
                      else detailTriggerRefs.current.delete(event.id);
                    }}
                    type="button"
                    aria-expanded={selectedId === event.id}
                    aria-controls="integration-outbox-detail"
                    onClick={() => toggleDetails(event.id)}
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    {selectedId === event.id
                      ? t("integrationOutbox.events.hideDetails")
                      : t("integrationOutbox.events.viewDetails")}
                  </button>
                </article>
              </li>
            ))}
          </ul>
        )}

        {pager && (pager.totalPages > 1 || page > 1) && (
          <nav className="mt-5 flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between" aria-label={t("integrationOutbox.pagination.label")}>
            <p className="text-sm text-gray-600">
              {t("integrationOutbox.pagination.summary", {
                page: pager.page,
                totalPages: Math.max(1, pager.totalPages),
                total: pager.total,
              })}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => {
                  setPage((current) => Math.max(1, current - 1));
                  setSelectedId(null);
                }}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:flex-none"
              >
                {t("integrationOutbox.pagination.previous")}
              </button>
              <button
                type="button"
                disabled={page >= pager.totalPages}
                onClick={() => {
                  setPage((current) => Math.min(pager.totalPages, current + 1));
                  setSelectedId(null);
                }}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:flex-none"
              >
                {t("integrationOutbox.pagination.next")}
              </button>
            </div>
          </nav>
        )}
      </section>

      {selectedId && (
        <section
          id="integration-outbox-detail"
          ref={detailPanelRef}
          tabIndex={-1}
          className="scroll-mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:p-5"
          aria-labelledby="integration-event-detail-heading"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="integration-event-detail-heading" className="text-lg font-semibold text-gray-950">
                {t("integrationOutbox.details.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                {t("integrationOutbox.details.description")}
              </p>
            </div>
            <button
              type="button"
              onClick={closeDetails}
              aria-label={t("integrationOutbox.details.closeLabel")}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {detailQuery.isLoading ? (
            <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-gray-600" role="status">
              <Loader2 className="h-5 w-5 animate-spin text-brand-600 motion-reduce:animate-none" aria-hidden="true" />
              {t("integrationOutbox.details.loading")}
            </div>
          ) : detailQuery.isError || !detail ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4" role="alert">
              <p className="text-sm text-red-700">
                {apiErrorMessage(
                  detailQuery.error,
                  t("integrationOutbox.details.loadError"),
                )}
              </p>
              <button
                type="button"
                onClick={() => void detailQuery.refetch()}
                className="mt-3 inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
              >
                {t("integrationOutbox.details.retry")}
              </button>
            </div>
          ) : (
            <>
              <div className="mt-5 flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-words font-semibold text-gray-950">{detail.event_type}</p>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[detail.status]}`}>
                      {t(`integrationOutbox.status.${detail.status}`)}
                    </span>
                  </div>
                  <p className="mt-1 break-all text-sm text-gray-600">
                    {detail.aggregate_type} · {detail.aggregate_id}
                  </p>
                </div>
                {canReplay && detail.replayable && detail.status === "dead" && (
                  <button
                    type="button"
                    onClick={() => void replayEvent(detail)}
                    disabled={replayMutation.isPending}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    {replayMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    ) : (
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    )}
                    {replayMutation.isPending
                      ? t("integrationOutbox.replay.queuing")
                      : t("integrationOutbox.replay.action")}
                  </button>
                )}
              </div>

              {!canReplay && detail.replayable && detail.status === "dead" && (
                <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                  {t("integrationOutbox.replay.eligibleReadOnly")}
                </p>
              )}

              {replayMutation.isError && (
                <p
                  ref={replayErrorRef}
                  tabIndex={-1}
                  className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 outline-none"
                  role="alert"
                >
                  {apiErrorMessage(
                    replayMutation.error,
                    t("integrationOutbox.replay.error"),
                  )}
                </p>
              )}

              <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <DetailItem label={t("integrationOutbox.details.attempts")} value={`${detail.attempts}/${detail.max_attempts}`} />
                <DetailItem label={t("integrationOutbox.details.replayGeneration")} value={String(detail.replay_count)} />
                <DetailItem label={t("integrationOutbox.details.created")} value={formatDateTime(detail.created_at)} />
                <DetailItem label={t("integrationOutbox.details.lastUpdated")} value={formatDateTime(detail.updated_at)} />
                <DetailItem label={t("integrationOutbox.details.nextAttempt")} value={formatDateTime(detail.next_attempt_at)} />
                <DetailItem label={t("integrationOutbox.details.delivered")} value={formatDateTime(detail.delivered_at)} />
                <DetailItem label={t("integrationOutbox.details.deadLettered")} value={formatDateTime(detail.dead_at)} />
                <DetailItem label={t("integrationOutbox.details.lastReplayed")} value={formatDateTime(detail.last_replayed_at)} />
                <DetailItem label={t("integrationOutbox.details.payloadSize")} value={t("integrationOutbox.details.payloadBytes", { count: detail.payload_metadata.byte_size })} />
                <DetailItem label={t("integrationOutbox.details.payloadProperties")} value={String(detail.payload_metadata.property_count)} />
              </dl>

              {detail.last_error && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-800">
                    {t("integrationOutbox.details.latestError")}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-red-700">{detail.last_error}</p>
                </div>
              )}

              <div className="mt-6">
                <h3 className="font-semibold text-gray-950">
                  {t("integrationOutbox.timeline.title")}
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  {t("integrationOutbox.timeline.description")}
                </p>
                {detail.attempt_history.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                    {t("integrationOutbox.timeline.empty")}
                  </p>
                ) : (
                  <ol className="mt-4 space-y-3">
                    {detail.attempt_history.map((attempt) => {
                      const succeeded = attempt.result === "delivered";
                      return (
                        <li key={attempt.id} className="rounded-lg border border-gray-200 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3">
                              {succeeded ? (
                                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" aria-hidden="true" />
                              ) : (
                                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
                              )}
                              <div>
                                <p className="font-medium text-gray-900">
                                  {t("integrationOutbox.timeline.attempt", {
                                    generation: attempt.replay_generation,
                                    attempt: attempt.attempt_number,
                                  })}
                                </p>
                                <p className="mt-0.5 text-xs text-gray-500">
                                  {attempt.completed_at
                                    ? t("integrationOutbox.timeline.startedCompleted", {
                                        started: formatDateTime(attempt.started_at),
                                        completed: formatDateTime(attempt.completed_at),
                                      })
                                    : t("integrationOutbox.timeline.started", {
                                        date: formatDateTime(attempt.started_at),
                                      })}
                                </p>
                              </div>
                            </div>
                            <span className={`self-start rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${succeeded ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                              {t(`integrationOutbox.timeline.result.${attempt.result}`)}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
                            <span>
                              {t("integrationOutbox.timeline.httpStatus", {
                                status:
                                  attempt.http_status ??
                                  t("integrationOutbox.timeline.notAvailable"),
                              })}
                            </span>
                          </div>
                          {attempt.error && (
                            <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-red-50 p-3 text-sm text-red-700">
                              {t("integrationOutbox.timeline.sanitizedError", {
                                error: attempt.error,
                              })}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}

function HealthCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone: "blue" | "gray" | "amber" | "red" | "green";
}) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    gray: "border-gray-200 bg-gray-50 text-gray-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
    green: "border-green-200 bg-green-50 text-green-800",
  } as const;

  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <span aria-hidden="true">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-950">{value}</p>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-gray-900">{value}</dd>
    </div>
  );
}
