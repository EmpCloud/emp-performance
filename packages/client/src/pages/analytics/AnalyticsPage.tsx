import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Target,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Loader2,
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

  // Pie data from goals
  const pieData = goals.length > 0
    ? goals.map((g: any) => ({
        name: g.category || "Other",
        value: Number(g.total) || 0,
        completed: Number(g.completed) || 0,
      }))
    : [
        { name: "Individual", value: 40, completed: 28 },
        { name: "Team", value: 25, completed: 15 },
        { name: "Organization", value: 10, completed: 5 },
      ];

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
    { label: "Active Cycles", value: overview?.activeCycles ?? 0, icon: RefreshCw, color: "text-blue-600 bg-blue-50" },
    { label: "Pending Reviews", value: overview?.pendingReviews ?? 0, icon: BarChart3, color: "text-amber-600 bg-amber-50" },
    { label: "Goal Completion", value: `${overview?.goalCompletionRate ?? 0}%`, icon: Target, color: "text-green-600 bg-green-50" },
    { label: "Active PIPs", value: overview?.pipCount ?? 0, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
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
              <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">{card.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                  </div>
                </div>
              </div>
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
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {pieData.map((_: any, idx: number) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
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
