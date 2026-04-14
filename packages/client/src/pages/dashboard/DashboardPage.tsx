import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Target,
  AlertTriangle,
  MessageSquare,
  RefreshCw,
  ClipboardCheck,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { apiGet } from "@/api/client";

interface OverviewData {
  activeCycles: number;
  pendingReviews: number;
  goalCompletionRate: number;
  pipCount: number;
  feedbackCount: number;
  totalGoals: number;
  completedGoals: number;
}

// #1: link each stat card to its detail page so users can drill in.
const STAT_CARDS = [
  { key: "activeCycles", label: "Active Cycles", icon: RefreshCw, color: "bg-blue-50 text-blue-600", href: "/review-cycles" },
  { key: "pendingReviews", label: "Pending Reviews", icon: ClipboardCheck, color: "bg-amber-50 text-amber-600", href: "/reviews/my" },
  { key: "goalCompletionRate", label: "Goal Completion", icon: Target, color: "bg-green-50 text-green-600", suffix: "%", href: "/goals" },
  { key: "pipCount", label: "Active PIPs", icon: AlertTriangle, color: "bg-red-50 text-red-600", href: "/pips" },
  { key: "feedbackCount", label: "Total Feedback", icon: MessageSquare, color: "bg-purple-50 text-purple-600", href: "/feedback" },
] as const;

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: () => apiGet<OverviewData>("/analytics/overview"),
  });

  const overview = data?.data;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Performance management overview and key metrics.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <TrendingUp className="h-4 w-4" />
          <span>EMP Performance</span>
        </div>
      </div>

      {/* Stat Cards — #1: clickable, each redirects to its detail page */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {STAT_CARDS.map((card) => {
          const Icon = card.icon;
          const value = overview ? (overview as any)[card.key] : null;
          return (
            <Link
              key={card.key}
              to={card.href}
              className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-brand-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">{card.label}</p>
                  {isLoading ? (
                    <Loader2 className="mt-1 h-5 w-5 animate-spin text-gray-300" />
                  ) : (
                    <p className="text-2xl font-bold text-gray-900">
                      {value ?? 0}
                      {"suffix" in card ? card.suffix : ""}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Insights Row */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Goals Progress */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Goals Progress</h2>
          <p className="mt-1 text-sm text-gray-500">Organization-wide goal completion</p>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Completed</span>
              <span className="font-medium text-gray-900">
                {overview?.completedGoals ?? 0} / {overview?.totalGoals ?? 0}
              </span>
            </div>
            <div className="mt-2 h-3 w-full rounded-full bg-gray-100">
              <div
                className="h-3 rounded-full bg-green-500 transition-all"
                style={{ width: `${overview?.goalCompletionRate ?? 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Recent Activity — #2: each entry links to its relevant module */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          <p className="mt-1 text-sm text-gray-500">Latest performance events</p>
          <div className="mt-4 space-y-3">
            <ActivityItem
              to="/review-cycles"
              icon={<RefreshCw className="h-4 w-4 text-blue-500" />}
              text="Review cycle status updated"
              time="Recently"
            />
            <ActivityItem
              to="/feedback"
              icon={<MessageSquare className="h-4 w-4 text-purple-500" />}
              text="New feedback received"
              time="Recently"
            />
            <ActivityItem
              to="/goals"
              icon={<Target className="h-4 w-4 text-green-500" />}
              text="Goal progress updated"
              time="Recently"
            />
            <ActivityItem
              to="/analytics"
              icon={<BarChart3 className="h-4 w-4 text-amber-500" />}
              text="Analytics data refreshed"
              time="Recently"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityItem({ to, icon, text, time }: { to: string; icon: React.ReactNode; text: string; time: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50">{icon}</div>
      <div className="flex-1">
        <p className="text-sm text-gray-700">{text}</p>
      </div>
      <span className="text-xs text-gray-400">{time}</span>
    </Link>
  );
}
