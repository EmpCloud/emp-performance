import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  CalendarClock,
  Loader2,
} from "lucide-react";
import { apiGet } from "@/api/client";
import { Pagination } from "@/components/Pagination";
import { useAuthStore } from "@/lib/auth-store";
import { formatDate } from "@/lib/utils";
import type { PaginatedResponse, ReviewOutcomeView } from "@emp-performance/shared";

const PAGE_SIZE = 12;

function pageFromSearchParams(searchParams: URLSearchParams): number {
  const candidate = Number(searchParams.get("page") ?? "1");
  return Number.isInteger(candidate) && candidate > 0 ? candidate : 1;
}

function useCurrentTime(): number {
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return currentTime;
}

export function MyReviewOutcomesPage() {
  const { t } = useTranslation();
  const userId = useAuthStore((state) => state.user?.empcloudUserId);
  const [searchParams, setSearchParams] = useSearchParams();
  const page = pageFromSearchParams(searchParams);
  const currentTime = useCurrentTime();

  const outcomesQuery = useQuery({
    queryKey: ["review-outcomes", "mine", userId, "archive", page],
    queryFn: () =>
      apiGet<PaginatedResponse<ReviewOutcomeView>>("/review-outcomes/mine", {
        page,
        perPage: PAGE_SIZE,
      }),
    enabled: Boolean(userId),
    retry: 1,
  });

  const outcomes = outcomesQuery.data?.data?.data ?? [];
  const total = outcomesQuery.data?.data?.total ?? 0;
  const totalPages = outcomesQuery.data?.data?.totalPages ?? 1;

  function changePage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    setSearchParams(next);
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6" aria-labelledby="review-outcomes-title">
      <header>
        <Link
          to="/my/performance"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-gray-600 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("reviewOutcome.backToPerformance")}
        </Link>
        <div className="mt-2 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <Award className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 id="review-outcomes-title" className="text-2xl font-bold text-gray-900">
              {t("reviewOutcome.allOutcomesTitle")}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-600">
              {t("reviewOutcome.allOutcomesDescription")}
            </p>
          </div>
        </div>
      </header>

      {outcomesQuery.isLoading ? (
        <div className="flex min-h-64 items-center justify-center gap-2" role="status">
          <Loader2
            className="h-7 w-7 animate-spin text-brand-600 motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span className="sr-only">{t("reviewOutcome.loadingList")}</span>
        </div>
      ) : outcomesQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center" role="alert">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" aria-hidden="true" />
          <p className="mt-3 text-sm text-red-700">{t("reviewOutcome.listLoadFailed")}</p>
          <button
            type="button"
            onClick={() => void outcomesQuery.refetch()}
            disabled={outcomesQuery.isFetching}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-wait disabled:opacity-60"
          >
            {outcomesQuery.isFetching
              ? t("reviewOutcome.retrying")
              : t("reviewOutcome.retryAction")}
          </button>
        </div>
      ) : outcomes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <p className="font-medium text-gray-800">{t("reviewOutcome.emptyTitle")}</p>
          <p className="mt-1 text-sm text-gray-500">{t("reviewOutcome.emptyDescription")}</p>
        </div>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {outcomes.map((outcome) => {
              const appealOpen =
                !outcome.appeal_status &&
                new Date(outcome.appeal_deadline_at).getTime() >= currentTime;

              return (
                <li key={outcome.id}>
                  <Link
                    to={`/my/performance/reviews/${outcome.id}`}
                    className="group flex h-full min-h-44 flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-[border-color,box-shadow] hover:border-brand-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="break-words font-semibold text-gray-900 group-hover:text-brand-700">
                          {outcome.cycle_name ?? t("reviewOutcome.releasedReview")}
                        </h2>
                        <p className="mt-1 text-xs text-gray-500">
                          {t("reviewOutcome.releasedOnShort", {
                            date: formatDate(outcome.released_at),
                          })}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-brand-50 px-2.5 py-1 text-lg font-bold text-brand-700">
                        {Number(outcome.released_rating).toFixed(2).replace(/\.00$/, "")}
                        <span className="text-xs font-medium text-gray-500">/5</span>
                      </span>
                    </div>
                    <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                      <div className="flex min-w-0 items-center gap-1.5 text-xs text-gray-600">
                        <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="break-words">
                          {outcome.appeal_status
                            ? t(`reviewOutcome.appealStatus.${outcome.appeal_status}`)
                            : appealOpen
                              ? t("reviewOutcome.appealBy", {
                                  date: formatDate(outcome.appeal_deadline_at),
                                })
                              : t("reviewOutcome.appealWindowClosed")}
                        </span>
                      </div>
                      <ArrowRight
                        className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600 motion-reduce:transform-none"
                        aria-hidden="true"
                      />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={changePage}
          />
        </>
      )}
    </main>
  );
}
