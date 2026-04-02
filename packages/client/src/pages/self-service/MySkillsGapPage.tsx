import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  TrendingDown,
  TrendingUp,
  Minus,
  Lightbulb,
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
import { getUser } from "@/lib/auth-store";
import type {
  SkillsGapResult,
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

export function MySkillsGapPage() {
  const user = getUser();
  const employeeId = user?.empcloudUserId;

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-skills-gap", employeeId],
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Skills Gap</h1>
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">Failed to load your skills gap data.</p>
        </div>
      </div>
    );
  }

  if (!result || result.competencies.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Skills Gap</h1>
        <p className="mt-1 text-sm text-gray-500">
          See how your skills compare to your career path requirements.
        </p>
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-12 text-center">
          <TrendingDown className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">
            No competency data available yet. Complete a performance review and ensure you are assigned to a career path.
          </p>
        </div>
      </div>
    );
  }

  const radarData = result.competencies.map((c) => ({
    competency: c.name.length > 15 ? c.name.slice(0, 15) + "..." : c.name,
    current: c.currentRating,
    required: c.requiredRating,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">My Skills Gap</h1>
      <p className="mt-1 text-sm text-gray-500">
        See how your skills compare to your career path requirements.
      </p>

      <div className="mt-6 space-y-6 overflow-hidden">
        {/* Readiness Card */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Your Readiness</p>
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
            {result.competencies.filter((c) => c.status === "gap").length} areas need development out of{" "}
            {result.competencies.length} total competencies.
          </p>
        </div>

        {/* Radar Chart */}
        {radarData.length > 2 && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm overflow-hidden">
            <h2 className="text-lg font-semibold text-gray-900">Your Skills Radar</h2>
            <p className="mt-1 text-sm text-gray-500">Current ratings vs required levels</p>
            <div className="mt-4 h-80 w-full max-w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="competency" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                  <Radar
                    name="Your Rating"
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
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden max-w-full">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Competency Details</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Competency</th>
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
                      <td className="px-4 py-3 text-center font-medium">{comp.currentRating}</td>
                      <td className="px-4 py-3">
                        <GapBar current={comp.currentRating} required={comp.requiredRating} />
                      </td>
                      <td className="px-4 py-3 text-center font-medium">{comp.requiredRating}</td>
                      <td className="px-4 py-3 text-center font-medium">
                        {comp.gap > 0
                          ? `-${comp.gap}`
                          : comp.gap === 0
                            ? "0"
                            : `+${Math.abs(comp.gap)}`}
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

        {/* Learning Suggestions */}
        {result.recommendations && result.recommendations.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-semibold text-gray-900">
                Recommended Learning
              </h2>
            </div>
            <div className="space-y-3">
              {result.recommendations.map((rec, idx) => (
                <div key={idx} className="rounded-lg border border-amber-100 bg-amber-50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-900">
                      {rec.competency}
                    </span>
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
    </div>
  );
}
