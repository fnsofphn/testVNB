import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AppSplash } from '@/components/system/AppSplash';
import { SuniTrainingRoleLayout } from '@/components/training/SuniTrainingRoleLayout';
import { useAuth, type AuthProfile } from '@/contexts/AuthContext';
import { getAllowedPages, normalizeAppRole, type PageKey } from '@/data/vcontent';

const AppLayout = lazy(() => import('@/components/layout/AppLayout').then((module) => ({ default: module.AppLayout })));
const LearnerAppFrame = lazy(() => import('@/components/layout/LearnerAppFrame').then((module) => ({ default: module.LearnerAppFrame })));
const WorkspaceAuthenticatedFrame = lazy(() => import('@/components/layout/WorkspaceAuthenticatedFrame').then((module) => ({ default: module.WorkspaceAuthenticatedFrame })));
const LoginPage = lazy(() => import('@/pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const ElearningLibraryHomePage = lazy(() => import('@/pages/vlearning/ElearningLibraryHomePage').then((module) => ({ default: module.ElearningLibraryHomePage })));
const ElearningLearnerCourseDetailPage = lazy(() => import('@/pages/vlearning/ElearningCourseDetailPage').then((module) => ({ default: module.ElearningLearnerCourseDetailPage })));
const ElearningAdminConsolePage = lazy(() => import('@/pages/vlearning/ElearningCourseDetailPage').then((module) => ({ default: module.ElearningAdminConsolePage })));
const ElearningPlayerPage = lazy(() => import('@/pages/vlearning/ElearningPlayerPage').then((module) => ({ default: module.ElearningPlayerPage })));
const SuniTrainingDashboardPage = lazy(() => import('@/pages/SuniTrainingDashboardPage').then((module) => ({ default: module.SuniTrainingDashboardPage })));
const SuniTrainingProgramsPage = lazy(() => import('@/pages/SuniTrainingProgramsPage').then((module) => ({ default: module.SuniTrainingProgramsPage })));
const SuniTrainingProgramDetailPage = lazy(() => import('@/pages/SuniTrainingProgramDetailPage').then((module) => ({ default: module.SuniTrainingProgramDetailPage })));
const SuniTrainingCoursesPage = lazy(() => import('@/pages/SuniTrainingCoursesPage').then((module) => ({ default: module.SuniTrainingCoursesPage })));
const SuniTrainingCourseDetailPage = lazy(() => import('@/pages/SuniTrainingCourseDetailPage').then((module) => ({ default: module.SuniTrainingCourseDetailPage })));
const SuniTrainingClassesPage = lazy(() => import('@/pages/SuniTrainingClassesPage').then((module) => ({ default: module.SuniTrainingClassesPage })));
const SuniTrainingClassDetailPage = lazy(() => import('@/pages/SuniTrainingClassDetailPage').then((module) => ({ default: module.SuniTrainingClassDetailPage })));
const InstructorClassLessonPlansPage = lazy(() => import('@/pages/InstructorClassLessonPlansPage').then((module) => ({ default: module.InstructorClassLessonPlansPage })));
const SuniTrainingLessonPlansPage = lazy(() => import('@/pages/SuniTrainingLessonPlansPage').then((module) => ({ default: module.SuniTrainingLessonPlansPage })));
const SuniTrainingDataPage = lazy(() => import('@/modules/vtraining/data/SuniTrainingDataPage').then((module) => ({ default: module.SuniTrainingDataPage })));
const SuniTrainingReflectionPage = lazy(() => import('@/pages/SuniTrainingReflectionPage').then((module) => ({ default: module.SuniTrainingReflectionPage })));
const SuniTrainingLibraryPage = lazy(() => import('@/pages/SuniTrainingLibraryPage'));
const PublicDiscussionGuidePage = lazy(() => import('@/pages/SuniTrainingLibraryPage').then((module) => ({ default: module.PublicDiscussionGuidePage })));
const PublicDiscussionPlxGuidePage = lazy(() => import('@/pages/SuniTrainingLibraryPage').then((module) => ({ default: module.PublicDiscussionPlxGuidePage })));
const PublicDiscussionEvnGuidePage = lazy(() => import('@/pages/SuniTrainingLibraryPage').then((module) => ({ default: module.PublicDiscussionEvnGuidePage })));
const PublicClassActivitiesGuidePage = lazy(() => import('@/pages/SuniTrainingLibraryPage').then((module) => ({ default: module.PublicClassActivitiesGuidePage })));
const PublicSurveyGuidePage = lazy(() => import('@/pages/SuniTrainingLibraryPage').then((module) => ({ default: module.PublicSurveyGuidePage })));
const PublicGuideHubPage = lazy(() => import('@/pages/SuniTrainingLibraryPage').then((module) => ({ default: module.PublicGuideHubPage })));
const SuniTrainingResourcesPage = lazy(() => import('@/pages/SuniTrainingResourcesPage').then((module) => ({ default: module.SuniTrainingResourcesPage })));
const SuniTrainingOperationsPage = lazy(() => import('@/pages/SuniTrainingOperationsPage').then((module) => ({ default: module.SuniTrainingOperationsPage })));
const SuniTrainingChecklistPage = lazy(() => import('@/pages/SuniTrainingChecklistPage').then((module) => ({ default: module.SuniTrainingChecklistPage })));
const InstructorLessonPlanPage = lazy(() => import('@/pages/InstructorLessonPlanPage').then((module) => ({ default: module.InstructorLessonPlanPage })));
const VDiscussionEventsPage = lazy(() => import('@/pages/VDiscussionEventsPage').then((module) => ({ default: module.VDiscussionEventsPage })));
const VDiscussionEventDetailPage = lazy(() => import('@/pages/VDiscussionEventDetailPage').then((module) => ({ default: module.VDiscussionEventDetailPage })));
const VDiscussionEventMonitorPage = lazy(() => import('@/pages/VDiscussionEventDetailPage').then((module) => ({ default: module.VDiscussionEventMonitorPage })));
const VDiscussionGroupResultPage = lazy(() => import('@/pages/VDiscussionEventDetailPage').then((module) => ({ default: module.VDiscussionGroupResultPage })));
const VDiscussionSessionPage = lazy(() => import('@/pages/VDiscussionSessionPage').then((module) => ({ default: module.VDiscussionSessionPage })));
const VEventsPage = lazy(() => import('@/pages/VEventsPage').then((module) => ({ default: module.VEventsPage })));
const PublicVEventPage = lazy(() => import('@/pages/PublicVEventPage').then((module) => ({ default: module.PublicVEventPage })));
const PublicVEventPresentPage = lazy(() => import('@/pages/PublicVEventPage').then((module) => ({ default: module.PublicVEventPresentPage })));
const VCulturePage = lazy(() => import('@/pages/VCulturePage').then((module) => ({ default: module.VCulturePage })));
const PlxCeoPlaybookPage = lazy(() => import('@/modules/vculture/playbook/PlxCeoPlaybookPage').then((module) => ({ default: module.PlxCeoPlaybookPage })));
const PublicGamePage = lazy(() => import('@/pages/PublicGamePage').then((module) => ({ default: module.PublicGamePage })));
const PublicLecturerAssessmentPage = lazy(() => import('@/pages/PublicLecturerAssessmentPage').then((module) => ({ default: module.PublicLecturerAssessmentPage })));
const PublicQuizPage = lazy(() => import('@/pages/QuizPages').then((module) => ({ default: module.PublicQuizPage })));
const PublicHelpdeskPage = lazy(() => import('@/pages/PublicHelpdeskPage'));
const PublicStudentSurveyPage = lazy(() => import('@/pages/PublicStudentSurveyPage').then((module) => ({ default: module.PublicStudentSurveyPage })));
const PublicStudentSurveyPreviewPage = lazy(() => import('@/pages/PublicStudentSurveyPage').then((module) => ({ default: module.PublicStudentSurveyPreviewPage })));
const StudentSurveyResultsPage = lazy(() => import('@/pages/StudentSurveyResultsPage').then((module) => ({ default: module.StudentSurveyResultsPage })));
const AiPowerPracticeTrackingPage = lazy(() => import('@/pages/AiPowerPracticeTrackingPage').then((module) => ({ default: module.AiPowerPracticeTrackingPage })));
const GameCatalogPage = lazy(() => import('@/pages/GameCatalogPage').then((module) => ({ default: module.GameCatalogPage })));
const VHelpdeskPage = lazy(() => import('@/pages/VHelpdeskPage'));
const VToolsPage = lazy(() => import('@/pages/VToolsPage'));
const VSuitePage = lazy(() => import('@/modules/vsuite/pages/VSuitePage'));
const VPlanningNativePage = lazy(() => import('@/modules/vplanning/VPlanningNativePage'));
const VWorkTrainingOperationsPage = lazy(() => import('@/modules/vplanning/trainingOperations/TrainingOperationsPage'));
const WorkspacePage = lazy(() => import('@/pages/WorkspacePage').then((module) => ({ default: module.WorkspacePage })));

function isVLearningLearnerPath(pathname: string) {
  if (pathname.startsWith('/vlearning/admin') || pathname.startsWith('/vlearning/detail') || pathname.startsWith('/vlearning/manage')) {
    return false;
  }
  if (pathname === '/vlearning') return true;
  return pathname.startsWith('/vlearning/');
}

function LegacyLearnRedirect() {
  const { courseId = '' } = useParams();
  return <Navigate to={`/vlearning/${courseId}`} replace />;
}

function VLearningLegacyCourseRedirect() {
  const { courseId = '' } = useParams();
  const { loading, profile } = useAuth();
  if (loading) return <AppSplash />;
  const role = normalizeAppRole(profile?.role);
  const canManage = ['admin', 'content_manager', 'production_manager'].includes(role);
  if (!canManage) return <Navigate to={`/vlearning/${courseId}`} replace />;
  return <Navigate to={`/vlearning/admin/library/courses/${courseId}`} replace />;
}

function StaticVBusinessRedirect() {
  const { loading, session, profile } = useAuth();
  const allowedPages = getAllowedPages(normalizeAppRole(profile?.role));
  useEffect(() => {
    if (loading || !session || !allowedPages.includes('vbusiness')) return;
    window.location.replace('/vbusiness/index.html');
  }, [allowedPages, loading, session]);

  if (loading) return <AppSplash />;
  if (!session) return <Navigate to="/login?next=%2Fvbusiness" replace />;
  if (!allowedPages.includes('vbusiness')) return <Navigate to="/login" replace />;
  return <AppSplash />;
}

function normalizeAccessText(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-z0-9@.]+/g, '_');
}

function isPeopleOneEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  const domain = email.includes('@') ? email.split('@').pop() : '';
  return ['peopleone.com', 'peopleone.com.vn', 'peopleone.vn'].includes(domain || '');
}

function hasVPlanningSpecificAccess(profile: AuthProfile | null) {
  if (!profile) return false;
  if (isPeopleOneEmail(profile.email)) return true;
  const vplanningRoles = Array.isArray(profile.vplanningRoles) ? profile.vplanningRoles : [];
  const hasModuleRole = vplanningRoles.some((item) => {
    const normalized = normalizeAccessText(item);
    return (
      normalized.startsWith('vplanning_') ||
      ['admin', 'director', 'giam_doc', 'haile', 'hai_le', 'hailt'].includes(normalized)
    );
  });
  const hasModuleScope = Boolean(profile.vplanningDepartments.length || profile.vplanningOwnerIds.length);
  const identity = normalizeAccessText([profile.email, profile.fullName, profile.title, profile.role].filter(Boolean).join(' '));
  const isDirectorAlias =
    identity.includes('hailt@peopleone.com.vn') ||
    identity.includes('haile') ||
    identity.includes('hai_le') ||
    identity.includes('giam_doc') ||
    identity.includes('director');
  return hasModuleRole || hasModuleScope || isDirectorAlias;
}

function canAccessVPlanning(profile: AuthProfile | null) {
  if (!profile) return false;
  const allowedPages = getAllowedPages(normalizeAppRole(profile.role));
  return allowedPages.includes('vplanning') || hasVPlanningSpecificAccess(profile);
}

function hasTrainingOperationsProfileAccess(profile: AuthProfile | null) {
  if (!profile) return false;
  const explicitRoles = (profile.vplanningRoles || []).map(normalizeAccessText);
  if (explicitRoles.some((role) => ['vplanning_intake', 'vplanning_content', 'vplanning_vtraining', 'vplanning_manager', 'vplanning_member'].includes(role))) return true;
  const profileRole = normalizeAccessText(profile.role);
  const title = normalizeAccessText(profile.title);
  if (profileRole === 'client' && ['dau_moi', 'sale', 'account_manager'].some((token) => title.includes(token))) return true;
  if (profileRole === 'specialist' && ['chuyen_vien_noi_dung', 'content', 'van_hanh_vtraining', 'vtraining'].some((token) => title.includes(token))) return true;
  return false;
}

function trainingOperationsEnabled() {
  return !import.meta.env.PROD || import.meta.env.VITE_ENABLE_VWORK_TRAINING_OPERATIONS === 'true';
}

function StaticVPlanningPage() {
  const { loading, session, profile, signOut } = useAuth();

  if (loading) return <AppSplash />;
  if (!session) return <Navigate to="/login?next=%2Fvwork" replace />;
  if (!canAccessVPlanning(profile)) {
    if (trainingOperationsEnabled() && hasTrainingOperationsProfileAccess(profile)) return <Navigate to="/vwork/training-operations" replace />;
    return <Navigate to="/login" replace />;
  }
  return (
    <Suspense fallback={<AppSplash />}>
      <VPlanningNativePage onSignOut={signOut} />
    </Suspense>
  );
}

function resolveTrainingOperationsRole(profile: AuthProfile | null) {
  const profileRole = normalizeAccessText(profile?.role || '');
  const title = normalizeAccessText(profile?.title || '');
  const grants = (profile?.vplanningRoles || []).map(normalizeAccessText);
  const hasGrant = (...values: string[]) => values.some((value) => grants.includes(value));
  if (['admin', 'training_ops_admin', 'training_manager', 'training_admin', 'production_manager', 'vplanning_director'].includes(profileRole) || hasGrant('vplanning_admin', 'vplanning_director')) return 'operations';
  if (['client', 'sale', 'account_manager'].includes(profileRole) || ['dau_moi', 'dau_moi_sale', 'sale'].includes(title)) return 'intake';
  if (['chuyen_vien_van_hanh_vtraining', 'van_hanh_vtraining', 'vtraining'].includes(title)) return 'vtraining';
  if (['chuyen_vien_noi_dung', 'noi_dung', 'content'].includes(title)) return 'content';
  if (['quan_ly_ekip', 'manager', 'teamlead'].includes(title)) return 'manager';
  if (['thanh_vien_ekip', 'member', 'cong_tac_vien'].includes(title)) return 'member';
  if (hasGrant('account_manager', 'vplanning_intake')) return 'intake';
  if (hasGrant('content_manager', 'vplanning_content')) return 'content';
  if (hasGrant('vtraining', 'vplanning_vtraining')) return 'vtraining';
  if (hasGrant('vplanning_manager')) return 'manager';
  if (hasGrant('vplanning_member', 'vplanning_collaborator')) return 'member';
  return 'member';
}

function StaticVWorkTrainingOperationsPage() {
  const { loading, session, profile, signOut } = useAuth();
  if (loading) return <AppSplash />;
  if (!session) return <Navigate to="/login?next=%2Fvwork%2Ftraining-operations" replace />;
  if (!canAccessVPlanning(profile) && !hasTrainingOperationsProfileAccess(profile)) return <Navigate to="/login" replace />;
  if (!trainingOperationsEnabled()) {
    return <Navigate to="/vwork" replace />;
  }
  return (
    <Suspense fallback={<AppSplash />}>
      <VWorkTrainingOperationsPage
        initialRole={resolveTrainingOperationsRole(profile)}
        allowRolePreview={import.meta.env.DEV}
        onSignOut={signOut}
      />
    </Suspense>
  );
}

function LegacyVPlanningRedirect() {
  const { loading, session, profile } = useAuth();
  if (loading) return <AppSplash />;
  if (!session) return <Navigate to="/login?next=%2Fvplanning" replace />;
  if (!canAccessVPlanning(profile)) return <Navigate to="/login" replace />;
  return <Navigate to="/vwork" replace />;
}

function GameCatalogRoute() {
  const { gameId = null } = useParams();
  return <GameCatalogPage gameId={gameId} />;
}

function LegacyGameCatalogRedirect() {
  const { gameId = '' } = useParams();
  return <Navigate to={gameId ? `/v-gamification/${gameId}` : '/v-gamification'} replace />;
}

function ProductPageShell({ title, product, pageKey, hideTopbarSignOut = false, compact = false, children }: { title: string; product: string; pageKey: PageKey; hideTopbarSignOut?: boolean; compact?: boolean; children: ReactNode }) {
  const { loading, profile, signOut } = useAuth();
  const allowedPages = getAllowedPages(normalizeAppRole(profile?.role));
  if (!loading && !allowedPages.includes(pageKey)) {
    return <Navigate to="/login" replace />;
  }
  return (
    <div className={`product-page-shell product-page-shell-${pageKey}${compact ? ' is-compact' : ''}`}>
      <header className="product-page-topbar">
        <Link className="product-page-brand" to="/login">
          <span>VB</span>
          <strong>{product}</strong>
        </Link>
        {hideTopbarSignOut ? null : (
          <button className="btn btn-ghost btn-small product-page-signout" onClick={() => void signOut()}>Đăng xuất</button>
        )}
      </header>
      <main className={`product-page-content product-page-content-${pageKey}`} aria-label={title}>
        {children}
      </main>
      <footer className="product-page-footer">
        <strong>Vinabrain</strong>
        <span>© 2026 Vinabrain. All rights reserved.</span>
      </footer>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 15,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: false,
      retry: 1,
    },
  },
});

function AuthenticatedAppFrame() {
  return (
    <AuthProvider>
      <AuthenticatedAppFrameContent />
    </AuthProvider>
  );
}

function AuthenticatedAppFrameContent() {
  const location = useLocation();
  const { loading, profile } = useAuth();
  const role = normalizeAppRole(profile?.role);
  const isTrainingLearnerFamily =
    location.pathname === '/vtraining'
    || location.pathname.startsWith('/vtraining/')
    || location.pathname === '/vdiscussion'
    || location.pathname.startsWith('/vdiscussion/');
  const useLeanLearnerFrame =
    isVLearningLearnerPath(location.pathname)
    || (isTrainingLearnerFamily && (loading || role === 'hoc_vien'));

  if (useLeanLearnerFrame) {
    return <LearnerAppFrame />;
  }

  return <WorkspaceAuthenticatedFrame />;
}

function LearningActivityFrame() {
  return (
    <AuthProvider>
      <Suspense fallback={<AppSplash />}>
        <LearnerAppFrame />
      </Suspense>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense
          fallback={<AppSplash />}
        >
          <Routes>
            <Route path="/v-events/join" element={<PublicVEventPage />} />
            <Route path="/v-events/join/:code" element={<PublicVEventPage />} />
            <Route path="/v-events/present/:eventId" element={<PublicVEventPresentPage />} />
            <Route element={<LearningActivityFrame />}>
              <Route path="/quiz/:formId" element={<PublicQuizPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/vtraining/reflections/:activityId" element={<SuniTrainingReflectionPage />} />
              </Route>
            </Route>
            <Route element={<AuthenticatedAppFrame />}>
                  <Route path="/play/:gameId" element={<PublicGamePage />} />
                  <Route path="/play/evnspc" element={<PublicGamePage />} />
                  <Route path="/apply/lecturer/:formId" element={<PublicLecturerAssessmentPage />} />
                  <Route path="/apply/student/:formId" element={<PublicStudentSurveyPage />} />
                  <Route path="/preview/student/:formId" element={<PublicStudentSurveyPreviewPage />} />
                  <Route path="/helpdesk/:slug" element={<PublicHelpdeskPage />} />
                  <Route path="/guide/discussion" element={<PublicDiscussionGuidePage />} />
                  <Route path="/guide/discussion-plx" element={<PublicDiscussionPlxGuidePage />} />
                  <Route path="/guide/discussion-evn" element={<PublicDiscussionEvnGuidePage />} />
                  <Route path="/guide/vtraining-activities" element={<PublicClassActivitiesGuidePage />} />
                  <Route path="/guide/survey" element={<PublicSurveyGuidePage />} />
                  <Route path="/guide/class-activities" element={<PublicGuideHubPage />} />
                  <Route path="/vcontent/apply/student/:formId" element={<PublicStudentSurveyPage />} />
                  <Route path="/vbusiness" element={<StaticVBusinessRedirect />} />
                  <Route path="/vwork" element={<StaticVPlanningPage />} />
                  <Route path="/vwork/training-operations" element={<StaticVWorkTrainingOperationsPage />} />
                  <Route path="/vplanning" element={<LegacyVPlanningRedirect />} />
                  <Route path="/" element={<LoginPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route element={<ProtectedRoute />}>
                    <Route path="/vcontent" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/vcontent/vtraining/manager/*" element={<Navigate to="/vtraining" replace />} />
                    <Route path="/vlearning" element={<ProductPageShell product="VLearning" title="VLearning" pageKey="vlearning" hideTopbarSignOut><ElearningLibraryHomePage /></ProductPageShell>} />
                    <Route path="/vlearning/admin/*" element={<ProductPageShell product="VLearning" title="VLearning" pageKey="vlearning"><ElearningAdminConsolePage /></ProductPageShell>} />
                    <Route path="/vlearning/detail/:courseId" element={<VLearningLegacyCourseRedirect />} />
                    <Route path="/vlearning/manage/:courseId" element={<VLearningLegacyCourseRedirect />} />
                    <Route path="/v-survey" element={<ProductPageShell product="VSurvey" title="VSurvey" pageKey="v-survey"><StudentSurveyResultsPage surveyType="plx-tna" templateVariant="plx-tna" includeAllSurveyTypes pageTitle="V-survey" pageSubtitle="Triển khai khảo sát theo mẫu PLX TNA 2026, phát hành link public hoặc V-Training và kết xuất kết quả tổng hợp." defaultFormTitle="V-survey - Khảo sát TNA 2026" defaultFormCode="v-survey-tna-2026" /></ProductPageShell>} />
                    <Route path="/v-survey/plx-tna" element={<ProductPageShell product="VSurvey" title="VSurvey PLX TNA" pageKey="v-survey"><StudentSurveyResultsPage surveyType="plx-tna" templateVariant="plx-tna" pageTitle="V-survey · PLX TNA 2026" pageSubtitle="Triển khai phiếu khảo sát nhu cầu đào tạo Cửa hàng trưởng Petrolimex 2026 và kết xuất kết quả theo cấu trúc PLX TNA." defaultFormTitle="PLX - Khảo sát nhu cầu đào tạo CHT 2026" defaultFormCode="plx-tna-2026" /></ProductPageShell>} />
                    <Route path="/v-survey/ql01a-prompt-practice" element={<ProductPageShell product="VSurvey" title="QL01A Prompt Practice" pageKey="v-survey"><StudentSurveyResultsPage surveyType="ql01a-prompt-practice" templateVariant="prompt-practice" pageTitle="QL01A · Luyện viết Prompt 3 lớp" pageSubtitle="Phát hành bài tập cá nhân dạng public link, ghi nhận họ tên/email, chấm điểm prompt và xuất kết quả Excel." defaultFormTitle="QL01A - Luyện viết Prompt 3 lớp" defaultFormCode="ql01a-prompt-practice" /></ProductPageShell>} />
                    <Route path="/v-survey/ql01a-ai-dien-luc-4-ung-dung/tracking/:sessionId" element={<ProductPageShell product="VSurvey" title="Theo dõi AI Điện lực" pageKey="v-survey" compact><AiPowerPracticeTrackingPage /></ProductPageShell>} />
                    <Route path="/v-survey/ql01a-ai-dien-luc-4-ung-dung/tracking" element={<ProductPageShell product="VSurvey" title="Theo dõi AI Điện lực" pageKey="v-survey" compact><AiPowerPracticeTrackingPage /></ProductPageShell>} />
                    <Route path="/v-survey/ql01a-ai-dien-luc-4-ung-dung" element={<ProductPageShell product="VSurvey" title="QL01A AI Điện lực" pageKey="v-survey"><StudentSurveyResultsPage surveyType="ql01a-ai-dien-luc-4-ung-dung" templateVariant="ai-power-practice" pageTitle="QL01A · Thực hành AI Điện lực 4 ứng dụng" pageSubtitle="Khởi tạo form nhóm, phát hành link thực hành 4 tình huống và theo dõi kết quả ngay trên VSurvey." defaultFormTitle="QL01A - Thực hành AI trong quản lý Điện lực" defaultFormCode="ql01a-ai-dien-luc-4-ung-dung" /></ProductPageShell>} />
                    <Route path="/v-survey/vnpt-heart-ws2" element={<ProductPageShell product="VSurvey" title="VNPT HEART WS2" pageKey="v-survey"><StudentSurveyResultsPage surveyType="vnpt-heart-ws2" templateVariant="generic" pageTitle="VNPT HEART · WS2" pageSubtitle="Triển khai phiếu khảo sát nhu cầu đào tạo VNPT HEART cho NSQL cấp 3." defaultFormTitle="VNPT HEART - Khảo sát NSQL cấp 3 (WS2)" defaultFormCode="vnpt-heart-ws2" /></ProductPageShell>} />
                    <Route path="/v-survey/vnpt-heart-dt1" element={<ProductPageShell product="VSurvey" title="VNPT HEART ĐT1" pageKey="v-survey"><StudentSurveyResultsPage surveyType="vnpt-heart-dt1" templateVariant="generic" pageTitle="VNPT HEART · ĐT1" pageSubtitle="Triển khai phiếu khảo sát nhu cầu đào tạo VNPT HEART cho NSQL cấp 4 & Tổ trưởng." defaultFormTitle="VNPT HEART - Khảo sát NSQL cấp 4 & Tổ trưởng (ĐT1)" defaultFormCode="vnpt-heart-dt1" /></ProductPageShell>} />
                    <Route path="/v-survey/vnpt-heart-dt2" element={<ProductPageShell product="VSurvey" title="VNPT HEART ĐT2" pageKey="v-survey"><StudentSurveyResultsPage surveyType="vnpt-heart-dt2" templateVariant="generic" pageTitle="VNPT HEART · ĐT2" pageSubtitle="Triển khai phiếu khảo sát nhu cầu đào tạo VNPT HEART cho Người lao động toàn Tập đoàn." defaultFormTitle="VNPT HEART - Khảo sát Người lao động toàn Tập đoàn (ĐT2)" defaultFormCode="vnpt-heart-dt2" /></ProductPageShell>} />
                    <Route path="/v-events" element={<ProductPageShell product="VEvents" title="V-events" pageKey="v-events"><VEventsPage /></ProductPageShell>} />
                    <Route path="/v-events/create" element={<ProductPageShell product="VEvents" title="V-events" pageKey="v-events"><VEventsPage /></ProductPageShell>} />
                    <Route path="/v-events/:eventId/results" element={<ProductPageShell product="VEvents" title="V-events" pageKey="v-events"><VEventsPage /></ProductPageShell>} />
                    <Route path="/v-events/:eventId/links" element={<ProductPageShell product="VEvents" title="V-events" pageKey="v-events"><VEventsPage /></ProductPageShell>} />
                    <Route path="/v-gamification" element={<ProductPageShell product="VGamification" title="VGamification" pageKey="gsmf00"><GameCatalogRoute /></ProductPageShell>} />
                    <Route path="/v-gamification/:gameId" element={<ProductPageShell product="VGamification" title="VGamification" pageKey="gsmf00"><GameCatalogRoute /></ProductPageShell>} />
                    <Route path="/gsmf00" element={<LegacyGameCatalogRedirect />} />
                    <Route path="/gsmf00/:gameId" element={<LegacyGameCatalogRedirect />} />
                    <Route path="/v-tools" element={<ProductPageShell product="VTools" title="VTools" pageKey="utilities"><VToolsPage /></ProductPageShell>} />
                    <Route path="/utilities" element={<Navigate to="/v-tools" replace />} />
                    <Route path="/v-helpdesk" element={<ProductPageShell product="VHelpdesk" title="VHelpdesk" pageKey="v-helpdesk"><VHelpdeskPage /></ProductPageShell>} />
                    <Route path="/v-suite" element={<ProductPageShell product="V-Suite" title="V-Suite" pageKey="v-suite"><VSuitePage /></ProductPageShell>} />
                    <Route path="/vtraining" element={<SuniTrainingRoleLayout><SuniTrainingDashboardPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/programs" element={<SuniTrainingRoleLayout><SuniTrainingProgramsPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/programs/:programId" element={<SuniTrainingRoleLayout><SuniTrainingProgramDetailPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/courses" element={<SuniTrainingRoleLayout><SuniTrainingCoursesPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/courses/:courseId" element={<SuniTrainingRoleLayout><SuniTrainingCourseDetailPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/classes" element={<SuniTrainingRoleLayout><SuniTrainingClassesPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/classes/:classId/giaoan" element={<SuniTrainingRoleLayout><InstructorClassLessonPlansPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/classes/:classId/giaoan/:planId" element={<SuniTrainingRoleLayout><InstructorClassLessonPlansPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/classes/:classId/discussions/:eventId/:discussionView" element={<SuniTrainingRoleLayout><SuniTrainingClassDetailPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/classes/:classId/discussions/:eventId" element={<SuniTrainingRoleLayout><SuniTrainingClassDetailPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/classes/:classId/:classTab/:activityId" element={<SuniTrainingRoleLayout><SuniTrainingClassDetailPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/classes/:classId/:classTab" element={<SuniTrainingRoleLayout><SuniTrainingClassDetailPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/classes/:classId" element={<SuniTrainingRoleLayout><SuniTrainingClassDetailPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/content" element={<SuniTrainingRoleLayout><Navigate to="/vtraining/content/lessonplans" replace /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/content/lessonplans" element={<SuniTrainingRoleLayout><SuniTrainingLessonPlansPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/data" element={<SuniTrainingRoleLayout><SuniTrainingDataPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/library" element={<SuniTrainingRoleLayout><SuniTrainingLibraryPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/operations" element={<SuniTrainingRoleLayout><SuniTrainingOperationsPage mode="operations" /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/checklist" element={<SuniTrainingRoleLayout><SuniTrainingChecklistPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/evidence" element={<SuniTrainingRoleLayout><SuniTrainingOperationsPage mode="evidence" /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/giaoan/:planId" element={<InstructorLessonPlanPage />} />
                    <Route path="/vtraining/instructors" element={<SuniTrainingRoleLayout><SuniTrainingResourcesPage kind="instructors" /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/collaborators" element={<SuniTrainingRoleLayout><SuniTrainingResourcesPage kind="collaborators" /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/learners" element={<SuniTrainingRoleLayout><SuniTrainingResourcesPage kind="learners" /></SuniTrainingRoleLayout>} />
                    <Route path="/vtraining/*" element={<Navigate to="/vtraining" replace />} />
                    <Route path="/vcoaching" element={<VCulturePage />} />
                    <Route path="/vculture" element={<ProductPageShell product="VCulture" title="VCulture" pageKey="vculture"><VCulturePage /></ProductPageShell>} />
                    <Route path="/vculture/plx-ceo-playbook" element={<ProductPageShell product="VCulture" title="PLX CEO Playbook" pageKey="vculture"><PlxCeoPlaybookPage /></ProductPageShell>} />
                    <Route path="/vdiscussion" element={<SuniTrainingRoleLayout><VDiscussionEventsPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vdiscussion/:eventId/monitor" element={<SuniTrainingRoleLayout><VDiscussionEventMonitorPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vdiscussion/:eventId/results/:groupId" element={<SuniTrainingRoleLayout><VDiscussionGroupResultPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vdiscussion/:eventId" element={<SuniTrainingRoleLayout><VDiscussionEventDetailPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vdiscussion/session/:sessionId/overview" element={<SuniTrainingRoleLayout><VDiscussionSessionPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vdiscussion/session/:sessionId/step/:stepNumber" element={<SuniTrainingRoleLayout><VDiscussionSessionPage /></SuniTrainingRoleLayout>} />
                    <Route path="/vdiscussion/*" element={<Navigate to="/vdiscussion" replace />} />
                    <Route path="/vlearning/:courseId/lesson/:lessonId" element={<ElearningPlayerPage />} />
                    <Route path="/vlearning/:courseId" element={<ElearningLearnerCourseDetailPage />} />
                    <Route path="/learn/:courseId" element={<LegacyLearnRedirect />} />
                  </Route>
                  <Route element={<ProtectedRoute />}>
                    <Route element={<AppLayout />}>
                      <Route path=":pageId" element={<WorkspacePage />} />
                      <Route path=":pageId/:gameId" element={<WorkspacePage />} />
                    </Route>
                  </Route>
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
