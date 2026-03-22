import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { isLoggedIn, useAuthStore, extractSSOToken } from "@/lib/auth-store";
import { apiPost } from "@/api/client";

// Layouts (eagerly loaded)
import { DashboardLayout } from "@/components/layout/DashboardLayout";

// Lazy-loaded pages
const LoginPage = lazy(() =>
  import("@/pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const DashboardPage = lazy(() =>
  import("@/pages/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);

// Review Cycles
const ReviewCycleListPage = lazy(() =>
  import("@/pages/review-cycles/ReviewCycleListPage").then((m) => ({ default: m.ReviewCycleListPage })),
);
const ReviewCycleDetailPage = lazy(() =>
  import("@/pages/review-cycles/ReviewCycleDetailPage").then((m) => ({ default: m.ReviewCycleDetailPage })),
);
const ReviewCycleCreatePage = lazy(() =>
  import("@/pages/review-cycles/ReviewCycleCreatePage").then((m) => ({ default: m.ReviewCycleCreatePage })),
);
const ReviewPage = lazy(() =>
  import("@/pages/review-cycles/ReviewPage").then((m) => ({ default: m.ReviewPage })),
);
const MyReviewsPage = lazy(() =>
  import("@/pages/review-cycles/MyReviewsPage").then((m) => ({ default: m.MyReviewsPage })),
);

// Goals
const GoalListPage = lazy(() =>
  import("@/pages/goals/GoalListPage").then((m) => ({ default: m.GoalListPage })),
);
const GoalDetailPage = lazy(() =>
  import("@/pages/goals/GoalDetailPage").then((m) => ({ default: m.GoalDetailPage })),
);
const GoalCreatePage = lazy(() =>
  import("@/pages/goals/GoalCreatePage").then((m) => ({ default: m.GoalCreatePage })),
);

const GoalAlignmentPage = lazy(() =>
  import("@/pages/goals/GoalAlignmentPage").then((m) => ({ default: m.GoalAlignmentPage })),
);

// Competencies
const FrameworkListPage = lazy(() =>
  import("@/pages/competencies/FrameworkListPage").then((m) => ({ default: m.FrameworkListPage })),
);
const FrameworkDetailPage = lazy(() =>
  import("@/pages/competencies/FrameworkDetailPage").then((m) => ({ default: m.FrameworkDetailPage })),
);
const FrameworkCreatePage = lazy(() =>
  import("@/pages/competencies/FrameworkCreatePage").then((m) => ({ default: m.FrameworkCreatePage })),
);

// PIPs
const PIPListPage = lazy(() =>
  import("@/pages/pips/PIPListPage").then((m) => ({ default: m.PIPListPage })),
);
const PIPDetailPage = lazy(() =>
  import("@/pages/pips/PIPDetailPage").then((m) => ({ default: m.PIPDetailPage })),
);
const PIPCreatePage = lazy(() =>
  import("@/pages/pips/PIPCreatePage").then((m) => ({ default: m.PIPCreatePage })),
);

// Self-Service
const MyGoalsPage = lazy(() =>
  import("@/pages/self-service/MyGoalsPage").then((m) => ({ default: m.MyGoalsPage })),
);
const MyGoalDetailPage = lazy(() =>
  import("@/pages/self-service/MyGoalDetailPage").then((m) => ({ default: m.MyGoalDetailPage })),
);
const MyPIPPage = lazy(() =>
  import("@/pages/self-service/MyPIPPage").then((m) => ({ default: m.MyPIPPage })),
);
const MyPerformancePage = lazy(() =>
  import("@/pages/self-service/MyPerformancePage").then((m) => ({ default: m.MyPerformancePage })),
);
const MyCareerPage = lazy(() =>
  import("@/pages/self-service/MyCareerPage").then((m) => ({ default: m.MyCareerPage })),
);
const MyFeedbackPage = lazy(() =>
  import("@/pages/self-service/MyFeedbackPage").then((m) => ({ default: m.MyFeedbackPage })),
);
const MyOneOnOnesPage = lazy(() =>
  import("@/pages/self-service/MyOneOnOnesPage").then((m) => ({ default: m.MyOneOnOnesPage })),
);
const MyOneOnOneDetailPage = lazy(() =>
  import("@/pages/self-service/MyOneOnOneDetailPage").then((m) => ({ default: m.MyOneOnOneDetailPage })),
);
const MySkillsGapPage = lazy(() =>
  import("@/pages/self-service/MySkillsGapPage").then((m) => ({ default: m.MySkillsGapPage })),
);

// Career Paths
const CareerPathListPage = lazy(() =>
  import("@/pages/career-paths/CareerPathListPage").then((m) => ({ default: m.CareerPathListPage })),
);
const CareerPathDetailPage = lazy(() =>
  import("@/pages/career-paths/CareerPathDetailPage").then((m) => ({ default: m.CareerPathDetailPage })),
);
const CareerPathCreatePage = lazy(() =>
  import("@/pages/career-paths/CareerPathCreatePage").then((m) => ({ default: m.CareerPathCreatePage })),
);

// 1-on-1 Meetings
const MeetingListPage = lazy(() =>
  import("@/pages/one-on-ones/MeetingListPage").then((m) => ({ default: m.MeetingListPage })),
);
const MeetingDetailPage = lazy(() =>
  import("@/pages/one-on-ones/MeetingDetailPage").then((m) => ({ default: m.MeetingDetailPage })),
);
const MeetingCreatePage = lazy(() =>
  import("@/pages/one-on-ones/MeetingCreatePage").then((m) => ({ default: m.MeetingCreatePage })),
);

// Feedback
const FeedbackListPage = lazy(() =>
  import("@/pages/feedback/FeedbackListPage").then((m) => ({ default: m.FeedbackListPage })),
);
const GiveFeedbackPage = lazy(() =>
  import("@/pages/feedback/GiveFeedbackPage").then((m) => ({ default: m.GiveFeedbackPage })),
);

// Analytics
const AnalyticsPage = lazy(() =>
  import("@/pages/analytics/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })),
);
const NineBoxPage = lazy(() =>
  import("@/pages/analytics/NineBoxPage").then((m) => ({ default: m.NineBoxPage })),
);
const SkillsGapPage = lazy(() =>
  import("@/pages/analytics/SkillsGapPage").then((m) => ({ default: m.SkillsGapPage })),
);

// Letters
const LetterTemplatePage = lazy(() =>
  import("@/pages/letters/LetterTemplatePage").then((m) => ({ default: m.LetterTemplatePage })),
);
const GeneratedLettersPage = lazy(() =>
  import("@/pages/letters/GeneratedLettersPage").then((m) => ({ default: m.GeneratedLettersPage })),
);

// Succession
const SuccessionPage = lazy(() =>
  import("@/pages/succession/SuccessionPage").then((m) => ({ default: m.SuccessionPage })),
);
const SuccessionDetailPage = lazy(() =>
  import("@/pages/succession/SuccessionDetailPage").then((m) => ({ default: m.SuccessionDetailPage })),
);

// Settings
const SettingsPage = lazy(() =>
  import("@/pages/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
    </div>
  );
}

function AuthRedirect() {
  return isLoggedIn() ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
}

function SSOGate({ children }: { children: React.ReactNode }) {
  const login = useAuthStore((s) => s.login);
  const [ssoToken] = useState(() => extractSSOToken());
  const [ready, setReady] = useState(!ssoToken);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ssoToken) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await apiPost<{
          user: any;
          tokens: { accessToken: string; refreshToken: string };
        }>("/auth/sso", { token: ssoToken });

        if (cancelled) return;

        const { user, tokens } = res.data!;
        login(user, tokens);

        if (window.location.pathname === "/" || window.location.pathname === "/login") {
          window.location.replace("/dashboard");
          return;
        }
        setReady(true);
      } catch (err: any) {
        if (cancelled) return;
        console.error("SSO exchange failed:", err);
        setError("SSO login failed. Please try logging in manually.");
        setReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [ssoToken, login]);

  if (!ready) return <PageLoader />;
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <a href="/login" className="text-brand-600 underline">Go to login</a>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <SSOGate>
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public auth */}
        <Route path="/login" element={<LoginPage />} />

        {/* Root redirect */}
        <Route path="/" element={<AuthRedirect />} />

        {/* Protected routes inside DashboardLayout */}
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Review Cycles */}
          <Route path="/review-cycles" element={<ReviewCycleListPage />} />
          <Route path="/review-cycles/new" element={<ReviewCycleCreatePage />} />
          <Route path="/review-cycles/:id" element={<ReviewCycleDetailPage />} />
          <Route path="/reviews/my" element={<MyReviewsPage />} />
          <Route path="/reviews/:id" element={<ReviewPage />} />

          {/* Goals */}
          <Route path="/goals" element={<GoalListPage />} />
          <Route path="/goals/alignment" element={<GoalAlignmentPage />} />
          <Route path="/goals/new" element={<GoalCreatePage />} />
          <Route path="/goals/:id" element={<GoalDetailPage />} />

          {/* Competencies */}
          <Route path="/competencies" element={<FrameworkListPage />} />
          <Route path="/competencies/new" element={<FrameworkCreatePage />} />
          <Route path="/competencies/:id" element={<FrameworkDetailPage />} />

          {/* PIPs */}
          <Route path="/pips" element={<PIPListPage />} />
          <Route path="/pips/new" element={<PIPCreatePage />} />
          <Route path="/pips/:id" element={<PIPDetailPage />} />

          {/* Self-Service */}
          <Route path="/my/performance" element={<MyPerformancePage />} />
          <Route path="/my/goals" element={<MyGoalsPage />} />
          <Route path="/my/goals/:id" element={<MyGoalDetailPage />} />
          <Route path="/my/pip" element={<MyPIPPage />} />
          <Route path="/my/career" element={<MyCareerPage />} />
          <Route path="/my/feedback" element={<MyFeedbackPage />} />
          <Route path="/my/one-on-ones" element={<MyOneOnOnesPage />} />
          <Route path="/my/one-on-ones/:id" element={<MyOneOnOneDetailPage />} />
          <Route path="/my/skills-gap" element={<MySkillsGapPage />} />

          {/* Career Paths */}
          <Route path="/career-paths" element={<CareerPathListPage />} />
          <Route path="/career-paths/new" element={<CareerPathCreatePage />} />
          <Route path="/career-paths/:id" element={<CareerPathDetailPage />} />

          {/* 1-on-1 Meetings */}
          <Route path="/one-on-ones" element={<MeetingListPage />} />
          <Route path="/one-on-ones/new" element={<MeetingCreatePage />} />
          <Route path="/one-on-ones/:id" element={<MeetingDetailPage />} />

          {/* Feedback */}
          <Route path="/feedback" element={<FeedbackListPage />} />
          <Route path="/feedback/give" element={<GiveFeedbackPage />} />

          {/* Analytics */}
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/analytics/nine-box" element={<NineBoxPage />} />
          <Route path="/analytics/skills-gap" element={<SkillsGapPage />} />

          {/* Letters */}
          <Route path="/letters/templates" element={<LetterTemplatePage />} />
          <Route path="/letters" element={<GeneratedLettersPage />} />

          {/* Succession Planning */}
          <Route path="/succession" element={<SuccessionPage />} />
          <Route path="/succession/:id" element={<SuccessionDetailPage />} />

          {/* Settings */}
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<div className="p-8"><h1 className="text-2xl font-bold text-gray-900">Page Not Found</h1></div>} />
      </Routes>
    </Suspense>
    </SSOGate>
  );
}
