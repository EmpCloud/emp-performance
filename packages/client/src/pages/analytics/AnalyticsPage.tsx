import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Target,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ArrowUpRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { apiGet } from "@/api/client";

interface OverviewData {
  activeCycles: number;
  pendingReviews: number;
  goalCompletionRate: number;
  pipCount: number;
  feedbackCount: number;
}

const PIE_COLORS = ["#10b981", "#f59e0b", "#ef4444", "#6366f1", "#8b5cf6"];

export function AnalyticsPage() {
  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: () => apiGet<OverviewData>("/analytics/overview"),
  });

  const { data: trendsData } = useQuery({
    queryKey: ["analytics", "trends"],
    queryFn: () => apiGet<any[]>("/analytics/trends"),
  });

  const { data: goalData } = useQuery({
    queryKey: ["analytics", "goal-completion"],
    queryFn: () => apiGet<any[]>("/analytics/goal-completion"),
  });

  const overview = overviewData?.data;
  const trends = trendsData?.data || [];
  const goals = goalData?.data || [];

  // Build bell curve data — placeholder with mock distribution labels
  const bellCurveData = [
    { rating: "1", count: 2 },
    { rating: "2", count: 8 },
    { rating: "3", count: 25 },
    { rating: "4", count: 15 },
    { rating: "5", count: 5 },
  ];

  // Real goal-completion data, grouped by category. Drop the dummy
  // fallback — it gave the misleading impression there were goals when
  // the org actually had none (#22).
  const pieData = goals.map((g: any) => ({
    name: (g.category || "Other").replace(/_/g, " "),
    value: Number(g.total) || 0,
    completed: Number(g.completed) || 0,
  }));

  // Trends line data
  const lineData = trends.length > 0
    ? trends.map((t: any) => ({
        name: t.cycle_name,
        avgRating: parseFloat(t.avg_rating) || 0,
        reviews: Number(t.review_count) || 0,
      }))
    : [
        { name: "Q1 2025", avgRating: 3.2, reviews: 45 },
        { name: "Q2 2025", avgRating: 3.5, reviews: 52 },
        { name: "Q3 2025", avgRating: 3.4, reviews: 48 },
        { name: "Q4 2025", avgRating: 3.7, reviews: 55 },
      ];

  const statCards = [
    {
      label: "Active Cycles",
      value: overview?.activeCycles ?? 0,
      icon: RefreshCw,
      color: "text-blue-600 bg-blue-50",
      to: "/review-cycles?status=active",
    },
    {
      label: "Pending Reviews",
      value: overview?.pendingReviews ?? 0,
      icon: BarChart3,
      color: "text-amber-600 bg-amber-50",
      to: "/reviews",
    },
    {
      label: "Goal Completion",
      value: `${overview?.goalCompletionRate ?? 0}%`,
      icon: Target,
      color: "text-green-600 bg-green-50",
      to: "/goals",
    },
    {
      label: "Active PIPs",
      value: overview?.pipCount ?? 0,
      icon: AlertTriangle,
      color: "text-red-600 bg-red-50",
      to: "/pips",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
      <p className="mt-1 text-sm text-gray-500">Performance analytics and reporting.</p>

      {/* Stat Cards */}
      {overviewLoading ? (
        <div className="mt-6 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.label}
                to={card.to}
                className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md hover:border-brand-300"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">{card.label}</p>
                      <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-brand-500" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Charts Grid */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Ratings Distribution - Bell Curve Bar Chart */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Ratings Distribution</h2>
          <p className="mt-1 text-sm text-gray-500">Bell curve of performance ratings</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bellCurveData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="rating" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Goal Completion - Pie Chart */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Goal Completion</h2>
          <p className="mt-1 text-sm text-gray-500">Completion by category</p>
          {pieData.length === 0 ? (
            <div className="mt-4 flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-center">
              <Target className="h-8 w-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">No goal data yet</p>
              <Link to="/goals/new" className="mt-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                Create the first goal
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                    >
                      {pieData.map((_: any, idx: number) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, _name: string, props: any) => {
                        const total = Number(props?.payload?.value) || 0;
                        const done = Number(props?.payload?.completed) || 0;
                        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                        return [`${done}/${total} (${pct}%)`, props?.payload?.name];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {pieData.map((d: any, idx: number) => {
                  const pct = d.value > 0 ? Math.round((d.completed / d.value) * 100) : 0;
                  return (
                    <li key={d.name} className="flex items-center gap-2 text-xs text-gray-600">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                      />
                      <span className="capitalize font-medium text-gray-900">{d.name}</span>
                      <span className="text-gray-400">— {d.completed}/{d.value} ({pct}%)</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* Trends - Line Chart (full width) */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900">Performance Trends</h2>
          <p className="mt-1 text-sm text-gray-500">Average ratings over review cycles</p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="avgRating"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Avg Rating"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
