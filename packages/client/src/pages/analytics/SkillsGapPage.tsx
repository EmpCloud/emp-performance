import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  TrendingDown,
  TrendingUp,
  Minus,
  Lightbulb,
  Users,
  User,
} from "lucide-react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { apiGet } from "@/api/client";
import { cn } from "@/lib/utils";
import type {
  SkillsGapResult,
  CompetencyGap,
  LearningRecommendation,
} from "@emp-performance/shared";

const STATUS_COLORS: Record<string, string> = {
  exceeds: "text-green-600 bg-green-50",
  meets: "text-blue-600 bg-blue-50",
  gap: "text-red-600 bg-red-50",
};

const STATUS_LABELS: Record<string, string> = {
  exceeds: "Exceeds",
  meets: "Meets",
  gap: "Gap",
};

function GapBar({ current, required }: { current: number; required: number }) {
  const max = 5;
  const currentPct = (current / max) * 100;
  const requiredPct = (required / max) * 100;
  const hasGap = current < required;

  return (
    <div className="relative h-4 w-full rounded-full bg-gray-100">
      <div
        className={cn(
          "absolute left-0 top-0 h-full rounded-full transition-all",
          hasGap ? "bg-red-400" : "bg-green-400",
        )}
        style={{ width: `${currentPct}%` }}
      />
      <div
        className="absolute top-0 h-full border-r-2 border-dashed border-gray-500"
        style={{ left: `${requiredPct}%` }}
        title={`Required: ${required}`}
      />
    </div>
  );
}

function IndividualView({ employeeId }: { employeeId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["skills-gap", employeeId],
    queryFn: () =>
      apiGet<SkillsGapResult & { recommendations: LearningRecommendation[] }>(
        `/analytics/skills-gap/${employeeId}`,
      ),
    enabled: !!employeeId,
  });

  const result = data?.data;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-600">Failed to load skills gap data.</p>
      </div>
    );
  }

  if (!result || result.competencies.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
        <TrendingDown className="mx-auto h-10 w-10 text-gray-300" />
        <p className="mt-2 text-sm text-gray-500">
          No competency data found for this employee. Ensure they have completed reviews and are assigned to a career path.
        </p>
      </div>
    );
  }

  // Radar chart data
  const radarData = result.competencies.map((c) => ({
    competency: c.name.length > 15 ? c.name.slice(0, 15) + "..." : c.name,
    current: c.currentRating,
    required: c.requiredRating,
  }));

  return (
    <div className="space-y-6">
      {/* Readiness Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Overall Readiness</p>
            <p className="text-3xl font-bold text-gray-900">{result.overallReadiness}%</p>
          </div>
          <div
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold",
              result.overallReadiness >= 75
                ? "bg-green-100 text-green-700"
                : result.overallReadiness >= 50
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700",
            )}
          >
            {result.overallReadiness >= 75 ? (
              <TrendingUp className="h-7 w-7" />
            ) : result.overallReadiness >= 50 ? (
              <Minus className="h-7 w-7" />
            ) : (
              <TrendingDown className="h-7 w-7" />
            )}
          </div>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          {result.competencies.filter((c) => c.status === "gap").length} competencies need development out of{" "}
          {result.competencies.length} total.
        </p>
      </div>

      {/* Radar Chart */}
      {radarData.length > 2 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Skills Radar</h2>
          <p className="mt-1 text-sm text-gray-500">Current vs required competency ratings</p>
          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="competency" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                <Radar
                  name="Current"
                  dataKey="current"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.3}
                />
                <Radar
                  name="Required"
                  dataKey="required"
                  stroke="#ef4444"
                  fill="#ef4444"
                  fillOpacity={0.1}
                />
                <Legend />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Gap Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Competency Gap Details</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Competency</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Category</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">Current</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 w-40">Progress</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">Required</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">Gap</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.competencies
                .sort((a, b) => b.gap - a.gap)
                .map((comp) => (
                  <tr key={comp.competency_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{comp.name}</td>
                    <td className="px-4 py-3 text-gray-500">{comp.category ?? "-"}</td>
                    <td className="px-4 py-3 text-center font-medium">{comp.currentRating}</td>
                    <td className="px-4 py-3">
                      <GapBar current={comp.currentRating} required={comp.requiredRating} />
                    </td>
                    <td className="px-4 py-3 text-center font-medium">{comp.requiredRating}</td>
                    <td className="px-4 py-3 text-center font-medium">
                      {comp.gap > 0 ? `-${comp.gap}` : comp.gap === 0 ? "0" : `+${Math.abs(comp.gap)}`}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          STATUS_COLORS[comp.status],
                        )}
                      >
                        {STATUS_LABELS[comp.status]}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Learning Recommendations */}
      {result.recommendations && result.recommendations.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-gray-900">Learning Recommendations</h2>
          </div>
          <div className="space-y-3">
            {result.recommendations.map((rec, idx) => (
              <div key={idx} className="rounded-lg border border-amber-100 bg-amber-50 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-gray-900">{rec.competency}</span>
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    Gap: {rec.gap}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{rec.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface OrgUser {
  id: number;
  full_name: string;
  email: string;
}

interface OrgDepartment {
  id: number;
  name: string;
}

export function SkillsGapPage() {
  const [employeeId, setEmployeeId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [viewMode, setViewMode] = useState<"individual" | "department">("individual");

  const { data: usersData } = useQuery({
    queryKey: ["users", "list"],
    queryFn: () => apiGet<OrgUser[]>("/users"),
  });
  const orgUsers: OrgUser[] = usersData?.data ?? [];

  const { data: departmentsData } = useQuery({
    queryKey: ["users", "departments"],
    queryFn: () => apiGet<OrgDepartment[]>("/users/departments"),
  });
  const departments: OrgDepartment[] = departmentsData?.data ?? [];

  const { data: deptData, isLoading: deptLoading } = useQuery({
    queryKey: ["skills-gap-dept", departmentId],
    queryFn: () =>
      apiGet<any>(`/analytics/skills-gap/department/${encodeURIComponent(departmentId)}`),
    enabled: viewMode === "department" && !!departmentId,
  });

  const deptResult = deptData?.data;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Skills Gap Analysis</h1>
          <p className="mt-1 text-sm text-gray-500">
            Compare competency ratings against career path requirements.
          </p>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="mt-4 flex items-center gap-4">
        <div className="flex rounded-lg border border-gray-300 bg-white">
          <button
            onClick={() => setViewMode("individual")}
            className={cn(
              "inline-flex items-center gap-2 rounded-l-lg px-4 py-2 text-sm font-medium transition-colors",
              viewMode === "individual"
                ? "bg-brand-600 text-white"
                : "text-gray-700 hover:bg-gray-50",
            )}
          >
            <User className="h-4 w-4" />
            Individual
          </button>
          <button
            onClick={() => setViewMode("department")}
            className={cn(
              "inline-flex items-center gap-2 rounded-r-lg px-4 py-2 text-sm font-medium transition-colors",
              viewMode === "department"
                ? "bg-brand-600 text-white"
                : "text-gray-700 hover:bg-gray-50",
            )}
          >
            <Users className="h-4 w-4" />
            Department
          </button>
        </div>

        {viewMode === "individual" ? (
          <div className="flex items-center gap-2">
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 w-72"
            >
              <option value="">— Select an employee —</option>
              {orgUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.email})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 w-64"
            >
              <option value="">— Select a department —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="mt-6">
        {viewMode === "individual" ? (
          employeeId ? (
            <IndividualView employeeId={employeeId} />
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
              <User className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">
                Pick an employee to view their skills gap analysis.
              </p>
            </div>
          )
        ) : departmentId ? (
          deptLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            </div>
          ) : deptResult ? (
            <div className="space-y-6">
              {/* Department Summary */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">
                  Department: {deptResult.department}
                </h2>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Average Readiness</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {deptResult.averageReadiness}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Team Members</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {deptResult.employees.length}
                    </p>
                  </div>
                </div>
              </div>

              {/* Department Heatmap */}
              {deptResult.aggregatedGaps.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900">
                      Department Skills Heatmap
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Aggregated competency gaps across team members
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-gray-500">
                            Competency
                          </th>
                          <th className="px-4 py-3 text-center font-medium text-gray-500">
                            Avg Current
                          </th>
                          <th className="px-4 py-3 text-center font-medium text-gray-500">
                            Avg Required
                          </th>
                          <th className="px-4 py-3 text-center font-medium text-gray-500">
                            Avg Gap
                          </th>
                          <th className="px-4 py-3 text-center font-medium text-gray-500">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {deptResult.aggregatedGaps
                          .sort((a: CompetencyGap, b: CompetencyGap) => b.gap - a.gap)
                          .map((gap: CompetencyGap) => (
                            <tr key={gap.competency_id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-900">
                                {gap.name}
                              </td>
                              <td className="px-4 py-3 text-center">{gap.currentRating}</td>
                              <td className="px-4 py-3 text-center">{gap.requiredRating}</td>
                              <td
                                className={cn(
                                  "px-4 py-3 text-center font-medium",
                                  gap.gap > 0
                                    ? "text-red-600"
                                    : gap.gap < 0
                                      ? "text-green-600"
                                      : "text-gray-600",
                                )}
                              >
                                {gap.gap > 0
                                  ? `-${gap.gap}`
                                  : gap.gap === 0
                                    ? "0"
                                    : `+${Math.abs(gap.gap)}`}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                    STATUS_COLORS[gap.status],
                                  )}
                                >
                                  {STATUS_LABELS[gap.status]}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Per-employee readiness */}
              {deptResult.employees.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Employee Readiness Overview
                  </h2>
                  <div className="mt-4 space-y-2">
                    {deptResult.employees.map((emp: SkillsGapResult) => (
                      <div
                        key={emp.employee_id}
                        className="flex items-center gap-3 rounded-lg border border-gray-100 p-3"
                      >
                        <span className="text-sm font-medium text-gray-900 w-32">
                          Employee #{emp.employee_id}
                        </span>
                        <div className="flex-1">
                          <div className="h-3 w-full rounded-full bg-gray-200">
                            <div
                              className={cn(
                                "h-3 rounded-full transition-all",
                                emp.overallReadiness >= 75
                                  ? "bg-green-500"
                                  : emp.overallReadiness >= 50
                                    ? "bg-amber-500"
                                    : "bg-red-500",
                              )}
                              style={{ width: `${emp.overallReadiness}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-sm font-medium text-gray-600 w-12 text-right">
                          {emp.overallReadiness}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
              <Users className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">
                No data found for this department.
              </p>
            </div>
          )
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
            <Users className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">
              Pick a department to view its aggregated skills gap analysis.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
