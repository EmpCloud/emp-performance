import { lazy } from "react";
import { Route } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

// Lazy-loaded pages
const LoginPage = lazy(() =>
  import("@/pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import("@/pages/auth/RegisterPage").then((m) => ({ default: m.RegisterPage })),
);
const ForgotPasswordPage = lazy(() =>
  import("@/pages/auth/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import("@/pages/auth/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })),
);
const DashboardPage = lazy(() =>
  import("@/pages/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const ProfilePage = lazy(() =>
  import("@/pages/profile/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const NotificationsPage = lazy(() =>
  import("@/pages/notifications/NotificationsPage").then((m) => ({ default: m.NotificationsPage })),
);
const NotificationLogPage = lazy(() =>
  import("@/pages/settings/NotificationLogPage").then((m) => ({ default: m.NotificationLogPage })),
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
const MyReviewFormPage = lazy(() =>
  import("@/pages/self-service/MyReviewFormPage").then((m) => ({ default: m.MyReviewFormPage })),
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
const MyReviewOutcomesPage = lazy(() =>
  import("@/pages/self-service/MyReviewOutcomesPage").then((m) => ({
    default: m.MyReviewOutcomesPage,
  })),
);
const MyReviewOutcomePage = lazy(() =>
  import("@/pages/self-service/MyReviewOutcomePage").then((m) => ({ default: m.MyReviewOutcomePage })),
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
// /my/reviews and /reviews/my render the same self-service reviews page.
const MySelfServiceReviewsPage = MyReviewsPage;
const MyLettersPage = lazy(() =>
  import("@/pages/self-service/MyLettersPage").then((m) => ({ default: m.MyLettersPage })),
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
const EmployeeTrackPage = lazy(() =>
  import("@/pages/career-paths/EmployeeTrackPage").then((m) => ({ default: m.EmployeeTrackPage })),
);
const CareerTrackRosterPage = lazy(() =>
  import("@/pages/career-paths/CareerTrackRosterPage").then((m) => ({ default: m.CareerTrackRosterPage })),
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
const KudosWallPage = lazy(() =>
  import("@/pages/feedback/KudosWallPage").then((m) => ({ default: m.KudosWallPage })),
);

// Peer Reviews
const PeerReviewNominatePage = lazy(() =>
  import("@/pages/peer-reviews/PeerReviewNominatePage").then((m) => ({ default: m.PeerReviewNominatePage })),
);
const PeerReviewQueuePage = lazy(() =>
  import("@/pages/peer-reviews/PeerReviewQueuePage").then((m) => ({ default: m.PeerReviewQueuePage })),
);
const PeerReviewSubmitPage = lazy(() =>
  import("@/pages/peer-reviews/PeerReviewSubmitPage").then((m) => ({ default: m.PeerReviewSubmitPage })),
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
const ManagerEffectivenessPage = lazy(() =>
  import("@/pages/manager-effectiveness/ManagerEffectivenessPage").then((m) => ({ default: m.ManagerEffectivenessPage })),
);
const ManagerDetailPage = lazy(() =>
  import("@/pages/manager-effectiveness/ManagerDetailPage").then((m) => ({ default: m.ManagerDetailPage })),
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

export function AppRoutes() {
  return (
    <>
      {/* Public auth */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Protected routes inside DashboardLayout */}
      <Route element={<DashboardLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />

        {/* Review Cycles */}
        <Route path="/review-cycles" element={<ReviewCycleListPage />} />
        <Route path="/review-cycles/new" element={<ReviewCycleCreatePage />} />
        <Route path="/review-cycles/:id" element={<ReviewCycleDetailPage />} />
        <Route path="/reviews/my" element={<MyReviewsPage />} />
        <Route path="/reviews/:id/edit" element={<MyReviewFormPage />} />
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
        <Route path="/my" element={<MyPerformancePage />} />
        <Route path="/my/performance" element={<MyPerformancePage />} />
        <Route path="/my/performance/outcomes" element={<MyReviewOutcomesPage />} />
        <Route path="/my/performance/reviews/:outcomeId" element={<MyReviewOutcomePage />} />
        <Route path="/my/goals" element={<MyGoalsPage />} />
        <Route path="/my/goals/:id" element={<MyGoalDetailPage />} />
        <Route path="/my/pip" element={<MyPIPPage />} />
        <Route path="/my/career" element={<MyCareerPage />} />
        <Route path="/my/feedback" element={<MyFeedbackPage />} />
        <Route path="/my/one-on-ones" element={<MyOneOnOnesPage />} />
        <Route path="/my/one-on-ones/:id" element={<MyOneOnOneDetailPage />} />
        <Route path="/my/reviews" element={<MySelfServiceReviewsPage />} />
        <Route path="/my/skills" element={<MySkillsGapPage />} />
        <Route path="/my/skills-gap" element={<MySkillsGapPage />} />
        <Route path="/my/letters" element={<MyLettersPage />} />

        {/* Career Paths */}
        <Route path="/career-paths" element={<CareerPathListPage />} />
        <Route path="/career-paths/new" element={<CareerPathCreatePage />} />
        <Route path="/career-paths/roster" element={<CareerTrackRosterPage />} />
        <Route path="/career-paths/tracks" element={<EmployeeTrackPage />} />
        <Route path="/career-paths/:id" element={<CareerPathDetailPage />} />

        {/* 1-on-1 Meetings */}
        <Route path="/one-on-ones" element={<MeetingListPage />} />
        <Route path="/one-on-ones/new" element={<MeetingCreatePage />} />
        <Route path="/one-on-ones/:id" element={<MeetingDetailPage />} />

        {/* Feedback */}
        <Route path="/feedback" element={<FeedbackListPage />} />
        <Route path="/feedback/give" element={<GiveFeedbackPage />} />
        <Route path="/feedback/wall" element={<KudosWallPage />} />

        {/* Peer Reviews */}
        <Route path="/peer-reviews/nominate" element={<PeerReviewNominatePage />} />
        <Route path="/peer-reviews/submit" element={<PeerReviewSubmitPage />} />
        <Route path="/peer-reviews/queue" element={<PeerReviewQueuePage />} />

        {/* Analytics */}
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/analytics/nine-box" element={<NineBoxPage />} />
        <Route path="/analytics/skills-gap" element={<SkillsGapPage />} />

        {/* Manager Effectiveness */}
        <Route path="/manager-effectiveness" element={<ManagerEffectivenessPage />} />
        <Route path="/manager-effectiveness/:managerId" element={<ManagerDetailPage />} />

        {/* Letters */}
        <Route path="/letters/templates" element={<LetterTemplatePage />} />
        <Route path="/letters" element={<GeneratedLettersPage />} />

        {/* Succession Planning */}
        <Route path="/succession" element={<SuccessionPage />} />
        <Route path="/succession/:id" element={<SuccessionDetailPage />} />

        {/* Settings */}
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/notification-log" element={<NotificationLogPage />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<div className="p-8"><h1 className="text-2xl font-bold text-gray-900">Page Not Found</h1></div>} />
    </>
  );
}
