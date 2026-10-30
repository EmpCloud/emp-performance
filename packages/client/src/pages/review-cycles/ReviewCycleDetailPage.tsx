import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Play,
  CheckCircle,
  Users,
  BarChart3,
  Settings,
  UserPlus,
  Trash2,
  Search,
  X,
  Save,
  ArrowRight,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/api/client";
import { useConfirm } from "@/components/ConfirmDialog";
import type {
  ReviewCycle,
  ReviewCycleParticipant,
  RatingDistribution,
  PaginatedResponse,
} from "@emp-performance/shared";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { CalibrationPanel, useCalibrationSnapshot } from "./CalibrationPanel";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-700",
  in_review: "bg-blue-100 text-blue-700",
  calibration: "bg-purple-100 text-purple-700",
  completed: "bg-indigo-100 text-indigo-700",
  cancelled: "bg-red-100 text-red-700",
};

type CycleDetail = ReviewCycle & {
  participant_count: number;
  stats: { pending: number; submitted: number; draft: number };
  calibration_finalized_at?: string | null;
  calibration_finalized_by?: number | null;
};

type ParticipantWithNames = ReviewCycleParticipant & {
  employee_name: string | null;
  manager_name: string | null;
};

type OrgUser = {
  id: number;
  full_name: string;
  email: string;
  emp_code: string | null;
  designation: string | null;
};

const TABS = ["participants", "calibration", "ratings", "settings"] as const;
type Tab = (typeof TABS)[number];

export function ReviewCycleDetailPage() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>("participants");

  const editMode = searchParams.get("edit") === "1";

  // ---- Participant picker state ----
  const [pickerQuery, setPickerQuery] = useState("");
  const [selected, setSelected] = useState<OrgUser[]>([]);
  const [managerId, setManagerId] = useState("");

  // ---- Participant list paging/search ----
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantPage, setParticipantPage] = useState(1);

  const { data: cycleData, isLoading } = useQuery({
    queryKey: ["review-cycle", id],
    queryFn: () => apiGet<CycleDetail>(`/review-cycles/${id}`),
    enabled: Boolean(id),
  });

  const calibrationQuery = useCalibrationSnapshot(
    id,
    cycleData?.data?.status === "calibration" || cycleData?.data?.status === "completed",
  );

  const { data: participantsData } = useQuery({
    queryKey: ["review-cycle-participants", id, participantPage, participantSearch],
    queryFn: () =>
      apiGet<PaginatedResponse<ParticipantWithNames>>(`/review-cycles/${id}/participants`, {
        page: participantPage,
        perPage: 20,
        search: participantSearch || undefined,
      }),
    enabled: Boolean(id) && activeTab === "participants",
  });

  const { data: distributionData } = useQuery({
    queryKey: ["review-cycle-distribution", id],
    queryFn: () => apiGet<RatingDistribution[]>(`/review-cycles/${id}/ratings-distribution`),
    enabled: Boolean(id) && activeTab === "ratings",
  });

  // Employee picker search against the org user directory.
  const { data: userSearchData, isFetching: searchingUsers } = useQuery({
    queryKey: ["org-users", pickerQuery],
    queryFn: () => apiGet<OrgUser[]>("/users", { q: pickerQuery || undefined, limit: 25 }),
    enabled: pickerQuery.trim().length >= 2,
  });

  const cycle = cycleData?.data;
  const participants = participantsData?.data?.data ?? [];
  const participantTotalPages = participantsData?.data?.totalPages ?? 1;
  const distribution = distributionData?.data ?? [];
  const userResults = userSearchData?.data ?? [];

  const launchMutation = useMutation({
    mutationFn: () => apiPost(`/review-cycles/${id}/launch`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["review-cycle", id] }),
  });

  const transitionMutation = useMutation({
    mutationFn: (status: "in_review" | "calibration") =>
      apiPost(`/review-cycles/${id}/transition`, { status }),
    onSuccess: async (_data, status) => {
      await queryClient.invalidateQueries({ queryKey: ["review-cycle", id] });
      if (status === "calibration") {
        setActiveTab("calibration");
        await queryClient.invalidateQueries({ queryKey: ["review-cycle-calibration", id] });
      }
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => apiPost(`/review-cycles/${id}/close`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["review-cycle", id] });
      await queryClient.invalidateQueries({ queryKey: ["review-cycle-calibration", id] });
      await queryClient.invalidateQueries({ queryKey: ["review-cycle-distribution", id] });
    },
  });

  const addParticipantMutation = useMutation({
    mutationFn: (data: { participants: { employee_id: number; manager_id?: number }[] }) =>
      apiPost(`/review-cycles/${id}/participants`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-cycle-participants", id] });
      queryClient.invalidateQueries({ queryKey: ["review-cycle", id] });
      setSelected([]);
      setManagerId("");
      setPickerQuery("");
    },
  });

  const removeParticipantMutation = useMutation({
    mutationFn: (participantId: string) =>
      apiDelete(`/review-cycles/${id}/participants/${participantId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-cycle-participants", id] });
      queryClient.invalidateQueries({ queryKey: ["review-cycle", id] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">{t("reviewCycleDetail.notFound")}</p>
      </div>
    );
  }

  const calibrationFinalizedAt =
    calibrationQuery.data?.finalizedAt ?? cycle.calibration_finalized_at ?? null;
  const maxCount = Math.max(...distribution.map((d) => d.count), 1);

  function toggleSelect(user: OrgUser) {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
  }

  function handleBulkAdd(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length === 0) return;
    const mgr = managerId ? Number(managerId) : undefined;
    addParticipantMutation.mutate({
      participants: selected.map((u) => ({ employee_id: u.id, manager_id: mgr })),
    });
  }

  function closeEdit() {
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === "ArrowLeft") nextIndex = index === 0 ? TABS.length - 1 : index - 1;
    else if (event.key === "ArrowRight") nextIndex = index === TABS.length - 1 ? 0 : index + 1;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = TABS.length - 1;
    else return;

    event.preventDefault();
    const nextTab = TABS[nextIndex];
    setActiveTab(nextTab);
    document.getElementById(`review-cycle-tab-${nextTab}`)?.focus();
  }

  async function handleRelease() {
    const approved = await confirm({
      title: t("reviewCycleDetail.releaseTitle"),
      message: t("reviewCycleDetail.releaseMessage"),
      confirmLabel: t("reviewCycleDetail.releaseResults"),
      variant: "default",
    });
    if (approved) closeMutation.mutate();
  }

  async function handleTransition(status: "in_review" | "calibration") {
    const approved = await confirm({
      title: t(
        status === "calibration"
          ? "reviewCycleDetail.startCalibrationTitle"
          : "reviewCycleDetail.beginReviewTitle",
      ),
      message: t(
        status === "calibration"
          ? "reviewCycleDetail.startCalibrationMessage"
          : "reviewCycleDetail.beginReviewMessage",
      ),
      confirmLabel: t(
        status === "calibration"
          ? "reviewCycleDetail.startCalibration"
          : "reviewCycleDetail.beginReview",
      ),
      variant: "default",
    });
    if (approved) transitionMutation.mutate(status);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          type="button"
          aria-label={t("reviewCycleDetail.backToCycles")}
          onClick={() => navigate("/review-cycles")}
          className="mt-1 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{cycle.name}</h1>
            <StatusBadge
              colorClass={STATUS_BADGE[cycle.status] ?? "bg-gray-100 text-gray-700"}
              className="capitalize"
            >
              {cycle.status.replace(/_/g, " ")}
            </StatusBadge>
          </div>
          {cycle.description && (
            <p className="mt-1 text-sm text-gray-500">{cycle.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          {cycle.status === "draft" && (
            <button
              type="button"
              onClick={() => launchMutation.mutate()}
              disabled={launchMutation.isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {launchMutation.isPending
                ? t("reviewCycleDetail.launching")
                : t("reviewCycleDetail.launch")}
            </button>
          )}
          {cycle.status === "active" && (
            <button
              type="button"
              onClick={() => void handleTransition("in_review")}
              disabled={transitionMutation.isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
              {transitionMutation.isPending
                ? t("reviewCycleDetail.transitioning")
                : t("reviewCycleDetail.beginReview")}
            </button>
          )}
          {cycle.status === "in_review" && (
            <button
              type="button"
              onClick={() => void handleTransition("calibration")}
              disabled={transitionMutation.isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
            >
              <Scale className="h-4 w-4" aria-hidden="true" />
              {transitionMutation.isPending
                ? t("reviewCycleDetail.transitioning")
                : t("reviewCycleDetail.startCalibration")}
            </button>
          )}
          {cycle.status === "calibration" && !calibrationFinalizedAt && (
            <button
              type="button"
              onClick={() => setActiveTab("calibration")}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-purple-300 bg-white px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
            >
              <Scale className="h-4 w-4" aria-hidden="true" />
              {t("reviewCycleDetail.reviewCalibration")}
            </button>
          )}
          {cycle.status === "calibration" && calibrationFinalizedAt && (
            <button
              type="button"
              onClick={handleRelease}
              disabled={closeMutation.isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {closeMutation.isPending
                ? t("reviewCycleDetail.releasing")
                : t("reviewCycleDetail.releaseResults")}
            </button>
          )}
        </div>
      </div>

      {/* Error banners */}
      {launchMutation.isError && (
        <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {(launchMutation.error as any)?.response?.data?.error?.message ??
            t("reviewCycleDetail.failedToLaunch")}
        </div>
      )}
      {transitionMutation.isError && (
        <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {(transitionMutation.error as any)?.response?.data?.error?.message ??
            t("reviewCycleDetail.failedToTransition")}
        </div>
      )}
      {closeMutation.isError && (
        <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {(closeMutation.error as any)?.response?.data?.error?.message ??
            t("reviewCycleDetail.failedToClose")}
        </div>
      )}

      {/* Edit form (behind ?edit=1) */}
      {editMode && <EditCycleForm cycle={cycle} onClose={closeEdit} />}

      {/* Info cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">{t("reviewCycleDetail.participants")}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{cycle.participant_count}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">{t("reviewCycleDetail.submitted")}</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{cycle.stats.submitted}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">{t("reviewCycleDetail.inDraft")}</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{cycle.stats.draft}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">{t("reviewCycleDetail.pending")}</p>
          <p className="mt-1 text-2xl font-bold text-gray-500">{cycle.stats.pending}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div role="tablist" aria-label={t("reviewCycleDetail.tabsLabel")} className="flex gap-6 overflow-x-auto">
          {TABS.map((tab, index) => (
            <button
              key={tab}
              id={`review-cycle-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`review-cycle-panel-${tab}`}
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
                activeTab === tab
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {tab === "participants" && <Users className="h-4 w-4" aria-hidden="true" />}
                {tab === "calibration" && <Scale className="h-4 w-4" aria-hidden="true" />}
                {tab === "ratings" && <BarChart3 className="h-4 w-4" aria-hidden="true" />}
                {tab === "settings" && <Settings className="h-4 w-4" aria-hidden="true" />}
                {tab === "participants"
                  ? t("reviewCycleDetail.tabParticipants")
                  : tab === "calibration"
                    ? t("reviewCycleDetail.tabCalibration")
                  : tab === "ratings"
                    ? t("reviewCycleDetail.tabRatings")
                    : t("reviewCycleDetail.tabSettings")}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "participants" && (
        <div
          id="review-cycle-panel-participants"
          role="tabpanel"
          aria-labelledby="review-cycle-tab-participants"
          tabIndex={0}
          className="space-y-4 focus:outline-none"
        >
          {/* Add participant — searchable employee picker + bulk add */}
          {(cycle.status === "draft" || cycle.status === "active") && (
            <form onSubmit={handleBulkAdd} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder={t("reviewCycleDetail.searchEmployeesPlaceholder")}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Search results */}
              {pickerQuery.trim().length >= 2 && (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200">
                  {searchingUsers ? (
                    <p className="px-3 py-3 text-sm text-gray-400">{t("reviewCycleDetail.searching")}</p>
                  ) : userResults.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-gray-400">{t("reviewCycleDetail.noMatchingEmployees")}</p>
                  ) : (
                    userResults.map((u) => {
                      const isSelected = selected.some((s) => s.id === u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleSelect(u)}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                            isSelected ? "bg-brand-50" : ""
                          }`}
                        >
                          <span>
                            <span className="font-medium text-gray-900">{u.full_name}</span>
                            <span className="ml-2 text-xs text-gray-400">
                              {u.emp_code ?? u.email}
                            </span>
                          </span>
                          {isSelected && <CheckCircle className="h-4 w-4 text-brand-600" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              {/* Selected chips */}
              {selected.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selected.map((u) => (
                    <span
                      key={u.id}
                      className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-700"
                    >
                      {u.full_name}
                      <button type="button" onClick={() => toggleSelect(u)}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t("reviewCycleDetail.managerIdLabel")}
                  </label>
                  <input
                    type="number"
                    value={managerId}
                    onChange={(e) => setManagerId(e.target.value)}
                    placeholder={t("reviewCycleDetail.managerIdPlaceholder")}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={addParticipantMutation.isPending || selected.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <UserPlus className="h-4 w-4" />
                  {addParticipantMutation.isPending
                    ? t("reviewCycleDetail.adding")
                    : t("reviewCycleDetail.addParticipants", { count: selected.length })}
                </button>
              </div>
              {addParticipantMutation.isError && (
                <p className="text-sm text-red-600">
                  {(addParticipantMutation.error as any)?.response?.data?.error?.message ??
                    t("reviewCycleDetail.failedToAddParticipants")}
                </p>
              )}
            </form>
          )}

          {/* Participant search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={participantSearch}
              onChange={(e) => {
                setParticipantSearch(e.target.value);
                setParticipantPage(1);
              }}
              placeholder={t("reviewCycleDetail.filterParticipantsPlaceholder")}
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Participants table */}
          {participants.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center">
              <Users className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">{t("reviewCycleDetail.noParticipantsFound")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white -mx-4 lg:mx-0">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      {t("reviewCycleDetail.columnEmployee")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      {t("reviewCycleDetail.columnManager")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      {t("common.status")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      {t("reviewCycleDetail.columnAdded")}
                    </th>
                    {cycle.status === "draft" && <th className="px-6 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {participants.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {p.employee_name ??
                          t("reviewCycleDetail.employeeNumber", { id: p.employee_id })}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {p.manager_name ??
                          (p.manager_id
                            ? t("reviewCycleDetail.managerNumber", { id: p.manager_id })
                            : "--")}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge colorClass="bg-gray-100 text-gray-700" className="capitalize">
                          {p.status}
                        </StatusBadge>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatDate(p.created_at)}
                      </td>
                      {cycle.status === "draft" && (
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={async () => {
                              if (
                                await confirm({
                                  title: t("reviewCycleDetail.removeParticipantTitle"),
                                  message: t("reviewCycleDetail.removeParticipantMessage", {
                                    name:
                                      p.employee_name ??
                                      t("reviewCycleDetail.employeeNumberLower", {
                                        id: p.employee_id,
                                      }),
                                  }),
                                  confirmLabel: t("reviewCycleDetail.remove"),
                                  variant: "danger",
                                })
                              ) {
                                removeParticipantMutation.mutate(p.id);
                              }
                            }}
                            className="text-red-400 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Participant pagination */}
          <Pagination
            page={participantPage}
            totalPages={participantTotalPages}
            onPageChange={setParticipantPage}
            className=""
          />
        </div>
      )}

      {activeTab === "calibration" && (
        <div
          id="review-cycle-panel-calibration"
          role="tabpanel"
          aria-labelledby="review-cycle-tab-calibration"
          tabIndex={0}
          className="focus:outline-none"
        >
          <CalibrationPanel
            cycleId={cycle.id}
            cycleStatus={cycle.status}
            snapshot={calibrationQuery.data}
            isLoading={calibrationQuery.isLoading}
            error={calibrationQuery.error}
          />
        </div>
      )}

      {activeTab === "ratings" && (
        <div
          id="review-cycle-panel-ratings"
          role="tabpanel"
          aria-labelledby="review-cycle-tab-ratings"
          tabIndex={0}
          className="space-y-4 focus:outline-none"
        >
          <h3 className="text-lg font-semibold text-gray-900">{t("reviewCycleDetail.ratingDistribution")}</h3>
          {distribution.length === 0 || distribution.every((d) => d.count === 0) ? (
            <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center">
              <BarChart3 className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">
                {t("reviewCycleDetail.noSubmittedReviews")}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="flex items-end gap-4 h-48">
                {distribution.map((bucket) => (
                  <div key={bucket.rating} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs font-medium text-gray-500">
                      {t("reviewCycleDetail.ratingCount", {
                        num: bucket.count,
                        percentage: bucket.percentage,
                      })}
                    </span>
                    <div className="w-full flex justify-center">
                      <div
                        className="w-12 rounded-t-md bg-brand-500"
                        style={{
                          height: `${Math.max((bucket.count / maxCount) * 150, 4)}px`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {bucket.rating}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-center text-xs text-gray-500">{t("reviewCycleDetail.ratingAxisLabel")}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "settings" && (
        <div
          id="review-cycle-panel-settings"
          role="tabpanel"
          aria-labelledby="review-cycle-tab-settings"
          tabIndex={0}
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 focus:outline-none"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">{t("reviewCycleDetail.cycleSettings")}</h3>
            {cycle.status !== "completed" && cycle.status !== "cancelled" && (
              <button
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.set("edit", "1");
                  setSearchParams(next);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Settings className="h-4 w-4" />
                {t("common.edit")}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">{t("reviewCycleDetail.type")}</p>
              <p className="mt-1 text-sm text-gray-900 capitalize">
                {cycle.type.replace(/_/g, " ")}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">{t("common.status")}</p>
              <p className="mt-1 text-sm text-gray-900 capitalize">
                {cycle.status.replace(/_/g, " ")}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">{t("reviewCycleDetail.startDate")}</p>
              <p className="mt-1 text-sm text-gray-900">{formatDate(cycle.start_date)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">{t("reviewCycleDetail.endDate")}</p>
              <p className="mt-1 text-sm text-gray-900">{formatDate(cycle.end_date)}</p>
            </div>
            {cycle.review_deadline && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">{t("reviewCycleDetail.reviewDeadline")}</p>
                <p className="mt-1 text-sm text-gray-900">
                  {formatDate(cycle.review_deadline)}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">{t("reviewCycleDetail.framework")}</p>
              <p className="mt-1 text-sm text-gray-900">
                {cycle.framework_id ? (
                  <Link
                    to={`/competencies/${cycle.framework_id}`}
                    className="text-brand-600 hover:underline"
                  >
                    {t("reviewCycleDetail.viewFramework")}
                  </Link>
                ) : (
                  t("reviewCycleDetail.none")
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit cycle form (rendered when ?edit=1). PUTs the editable fields (#R5).
// ---------------------------------------------------------------------------
function EditCycleForm({ cycle, onClose }: { cycle: CycleDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState(cycle.name);
  const [description, setDescription] = useState(cycle.description ?? "");
  const [startDate, setStartDate] = useState(cycle.start_date?.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(cycle.end_date?.slice(0, 10) ?? "");
  const [reviewDeadline, setReviewDeadline] = useState(
    cycle.review_deadline?.slice(0, 10) ?? "",
  );

  // Keep the form in sync if the underlying cycle changes (e.g. refetch).
  useEffect(() => {
    setName(cycle.name);
    setDescription(cycle.description ?? "");
    setStartDate(cycle.start_date?.slice(0, 10) ?? "");
    setEndDate(cycle.end_date?.slice(0, 10) ?? "");
    setReviewDeadline(cycle.review_deadline?.slice(0, 10) ?? "");
  }, [cycle]);

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPut(`/review-cycles/${cycle.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-cycle", cycle.id] });
      onClose();
    },
  });

  const dateError = useMemo(
    () => Boolean(startDate && endDate && endDate < startDate),
    [startDate, endDate],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (dateError) return;
    updateMutation.mutate({
      name,
      description: description || undefined,
      start_date: startDate,
      end_date: endDate,
      review_deadline: reviewDeadline || undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-brand-200 bg-brand-50/40 p-6 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{t("reviewCycleDetail.editCycle")}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t("reviewCycleDetail.name")}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t("reviewCycleDetail.description")}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("reviewCycleDetail.startDate")}</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("reviewCycleDetail.endDate")}</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("reviewCycleDetail.reviewDeadline")}</label>
          <input
            type="date"
            value={reviewDeadline}
            onChange={(e) => setReviewDeadline(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {dateError && (
        <p className="text-sm text-red-600">{t("reviewCycleDetail.endDateBeforeStart")}</p>
      )}
      {updateMutation.isError && (
        <p className="text-sm text-red-600">
          {(updateMutation.error as any)?.response?.data?.error?.message ??
            t("reviewCycleDetail.failedToUpdate")}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={updateMutation.isPending || dateError}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {updateMutation.isPending
            ? t("reviewCycleDetail.saving")
            : t("reviewCycleDetail.saveChanges")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
