import { useState, useEffect } from "react";
import { Outlet, Navigate, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  RefreshCw,
  Target,
  Award,
  AlertTriangle,
  Route,
  Users,
  MessageSquare,
  BarChart3,
  Grid3X3,
  Shield,
  Settings,
  LogOut,
  Menu,
  X,
  TrendingUp,
  GitBranch,
  FileText,
  Radar,
} from "lucide-react";
import { isLoggedIn, getUser, useAuthStore } from "@/lib/auth-store";
import { cn, getInitials } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";

type Role = "org_admin" | "hr_admin" | "hr_manager" | "employee";

interface NavItem {
  to: string;
  label: string;
  icon: any;
  adminOnly?: boolean; // if true, hidden from employee role
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  // Self-service (visible to all roles)
  { to: "/my", label: "My Performance", icon: TrendingUp },
  { to: "/my/reviews", label: "My Reviews", icon: RefreshCw },
  { to: "/my/goals", label: "My Goals", icon: Target },
  { to: "/my/feedback", label: "My Feedback", icon: MessageSquare },
  { to: "/my/one-on-ones", label: "My 1-on-1s", icon: Users },
  { to: "/my/skills", label: "My Skills", icon: Radar },
  { to: "/my/letters", label: "My Letters", icon: FileText },
  // Admin
  { to: "/review-cycles", label: "Review Cycles", icon: RefreshCw, adminOnly: true },
  { to: "/goals", label: "All Goals", icon: Target, adminOnly: true },
  { to: "/goals/alignment", label: "Goal Alignment", icon: GitBranch, adminOnly: true },
  { to: "/competencies", label: "Competencies", icon: Award, adminOnly: true },
  { to: "/pips", label: "PIPs", icon: AlertTriangle, adminOnly: true },
  { to: "/career-paths", label: "Career Paths", icon: Route },
  { to: "/one-on-ones", label: "All 1-on-1s", icon: Users, adminOnly: true },
  { to: "/feedback", label: "All Feedback", icon: MessageSquare, adminOnly: true },
  { to: "/letters", label: "Letters", icon: FileText, adminOnly: true },
  { to: "/analytics", label: "Analytics", icon: BarChart3, adminOnly: true },
  { to: "/analytics/nine-box", label: "9-Box Grid", icon: Grid3X3, adminOnly: true },
  { to: "/analytics/skills-gap", label: "Skills Gap", icon: Radar, adminOnly: true },
  { to: "/succession", label: "Succession", icon: Shield, adminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

const ADMIN_ROLES: Role[] = ["org_admin", "hr_admin", "hr_manager"];

export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);

  if (!isLoggedIn()) return <Navigate to="/login" replace />;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const user = getUser();
  const displayName = user ? `${user.firstName} ${user.lastName}` : "User";
  const roleLabel =
    user?.role === "org_admin"
      ? "Org Admin"
      : user?.role === "hr_admin"
        ? "HR Admin"
        : user?.role === "hr_manager"
          ? "HR Manager"
          : "Employee";

  function SidebarContent() {
    return (
      <div className="flex h-full w-64 flex-col bg-white border-r border-gray-200">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-6 border-b border-gray-100">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">EMP Performance</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.filter((item) => {
            if (item.adminOnly && !ADMIN_ROLES.includes((user?.role || "employee") as Role)) return false;
            return true;
          }).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User card */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-sm font-semibold">
              {getInitials(displayName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
              <p className="text-xs text-gray-500">{roleLabel}</p>
            </div>
            <button
              onClick={logout}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <SidebarContent />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="fixed left-0 top-0 z-50 h-full">
            <SidebarContent />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <BackToDashboard />
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
              {getInitials(displayName)}
            </div>
            <span className="hidden md:block text-sm font-medium text-gray-700">{displayName}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
