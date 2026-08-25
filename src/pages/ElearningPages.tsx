import { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, BookOpen, CalendarRange, ClipboardList, Copy, FileSpreadsheet, GraduationCap, Layers, Library, PackageCheck, PauseCircle, PlayCircle, Plus, Pencil, Trash2, Upload, Users, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useToast } from '@/components/system/ToastProvider';
import { Badge, Card, Kpi, SectionHeader } from '@/components/ui/Primitives';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeAppRole } from '@/data/vcontent';
import {
  addLessonToCourse,
  assignVTrainingClassToElearningCourse,
  buildCourseLearnLink,
  buildVimeoEmbedUrl,
  cloneElearningCourse,
  cloneElearningLesson,
  createElearningClass,
  createElearningClient,
  createElearningCourse,
  createElearningLesson,
  createElearningLessonBlock,
  createElearningLessonPart,
  createElearningLearnerGroup,
  createElearningProject,
  createElearningQuizForm,
  createElearningQuizQuestionSet,
  assignElearningTargetsToLearningRun,
  deleteElearningCourse,
  deleteElearningClass,
  deleteElearningLessonBlock,
  deleteElearningLesson,
  deleteElearningLearnerGroup,
  deleteElearningQuizForm,
  deleteElearningQuizQuestionSet,
  getElearningCourseBundle,
  getElearningClassLearnerCount,
  getElearningOptimizedReport,
  getElearningQuizQuestionSetBundle,
  importElearningStudentsToClass,
  listElearningDeploymentBundle,
  listElearningCourses,
  listElearningLessonParts,
  listElearningLessonBlocks,
  listElearningLessons,
  listElearningQuizForms,
  listElearningQuizQuestionSets,
  listElearningScormPackages,
  listVTrainingClassesForElearning,
  listVTrainingStudentsForElearning,
  parseElearningStudentImport,
  removeLessonFromCourse,
  removeElearningClassStudentFromClass,
  removeElearningEnrollmentFromClass,
  runOptionalElearningLearnerNotice,
  sanitizeElearningId,
  notifyElearningLearners,
  updateElearningCourseQuiz,
  updateElearningCourse,
  updateElearningCourseStatus,
  updateElearningClass,
  updateElearningClassStatus,
  updateElearningLesson,
  updateElearningLessonBlock,
  updateElearningLearnerGroup,
  updateElearningQuizForm,
  updateElearningQuizQuestionSet,
  syncVTrainingRosterToElearningClass,
  uploadElearningCourseThumbnail,
  uploadElearningScormPackage,
  type ElearningCourse,
  type ElearningClass,
  type ElearningClassReportRow,
  type ElearningClient,
  type ElearningDeploymentBundle,
  type ElearningLesson,
  type ElearningLessonBlock,
  type ElearningLessonBlockType,
  type ElearningLessonPart,
  type ElearningLearnerGroup,
  type ElearningProgress,
  type ElearningProject,
  type ElearningImportPreviewRow,
  type ElearningScormAttempt,
  type ElearningScormPackage,
  type VTrainingClassForElearning,
  type VTrainingStudentForElearning,
} from '@/lib/elearning';
import {
  extractTextFromDocx,
  parseQuizTextToQuestions,
  parseQuizWorkbookFile,
  type QuizForm,
  type QuizQuestion,
  type QuizQuestionSet,
} from '@/lib/quiz';

type ElearningAdminLayer = 'library' | 'lesson' | 'course' | 'class' | 'group' | 'deployment' | 'quiz' | 'question' | 'reports';
type ElearningLibraryLayer = 'lesson' | 'course' | 'quiz' | 'question';
type ElearningLibraryView = 'index' | 'detail' | 'create';
type ElearningDeploymentLayer = 'classes' | 'groups' | 'runs';
type ElearningEditorMode = 'closed' | 'create' | 'edit';

const ELEARNING_ADMIN_LAYERS: Array<{
  id: ElearningAdminLayer;
  label: string;
  icon: typeof Library;
}> = [
  { id: 'lesson', label: 'Bài giảng', icon: BookOpen },
  { id: 'course', label: 'Khóa học', icon: GraduationCap },
  { id: 'class', label: 'Lớp học', icon: Users },
  { id: 'group', label: 'Nhóm học viên', icon: Users },
  { id: 'deployment', label: 'Đợt học', icon: CalendarRange },
  { id: 'quiz', label: 'Đề kiểm tra', icon: ClipboardList },
  { id: 'question', label: 'Câu hỏi', icon: ClipboardList },
  { id: 'reports', label: 'Thống kê kết quả học', icon: FileSpreadsheet },
];

const VLEARNING_LIBRARY_LAYERS: Array<{ id: ElearningLibraryLayer; label: string; routeSegment: string }> = [
  { id: 'lesson', label: 'Bài giảng', routeSegment: 'lessons' },
  { id: 'course', label: 'Khóa học', routeSegment: 'courses' },
  { id: 'quiz', label: 'Đề kiểm tra', routeSegment: 'quizzes' },
  { id: 'question', label: 'Câu hỏi', routeSegment: 'questions' },
];

const VLEARNING_LIBRARY_ROUTE_TO_LAYER: Record<string, ElearningLibraryLayer> = {
  lessons: 'lesson',
  courses: 'course',
  quizzes: 'quiz',
  questions: 'question',
};

const VLEARNING_DEPLOYMENT_ROUTE_TO_LAYER: Record<string, ElearningDeploymentLayer> = {
  classes: 'classes',
  groups: 'groups',
  runs: 'runs',
};
const VLEARNING_DEPLOYMENT_ROUTE_TO_ADMIN_LAYER: Record<string, ElearningAdminLayer> = {
  classes: 'class',
  groups: 'group',
  runs: 'deployment',
};

const VLEARNING_DEPLOYMENT_LAYERS: Array<{ id: ElearningDeploymentLayer; label: string; routeSegment: string; route: string }> = [
  { id: 'classes', label: 'Lớp học', routeSegment: 'classes', route: '/vlearning/admin/deployment/classes' },
  { id: 'groups', label: 'Nhóm học viên', routeSegment: 'groups', route: '/vlearning/admin/deployment/groups' },
  { id: 'runs', label: 'Đợt học', routeSegment: 'runs', route: '/vlearning/admin/deployment/runs' },
];

function getDeploymentLayerRoute(layer: ElearningDeploymentLayer) {
  const config = VLEARNING_DEPLOYMENT_LAYERS.find((item) => item.id === layer);
  return config?.route || '/vlearning/admin/deployment/runs';
}

function getLibraryLayerRoute(layer: ElearningLibraryLayer) {
  const config = VLEARNING_LIBRARY_LAYERS.find((item) => item.id === layer);
  return `/vlearning/admin/library/${config?.routeSegment || 'lessons'}`;
}

function getLibraryLayerTitle(layer: ElearningLibraryLayer) {
  if (layer === 'course') return 'Thư viện khóa học';
  if (layer === 'quiz') return 'Thư viện đề kiểm tra';
  if (layer === 'question') return 'Thư viện câu hỏi';
  return 'Thư viện bài giảng';
}

function getLibraryLayerActionLabel(layer: ElearningLibraryLayer) {
  if (layer === 'course') return 'Thêm khóa học';
  if (layer === 'quiz') return 'Thêm đề kiểm tra';
  if (layer === 'question') return 'Thêm câu hỏi';
  return 'Thêm bài giảng';
}

function getAdminLayerRoute(layer: ElearningAdminLayer) {
  if (layer === 'library') return '/vlearning/admin/library/lessons';
  if (layer === 'lesson') return '/vlearning/admin/library/lessons';
  if (layer === 'course') return '/vlearning/admin/library/courses';
  if (layer === 'quiz') return '/vlearning/admin/library/quizzes';
  if (layer === 'question') return '/vlearning/admin/library/questions';
  return `/vlearning/admin?layer=${layer}`;
}

function formatDuration(seconds: number) {
  if (!seconds) return '-';
  return `${Math.round(seconds / 60)} phut`;
}

function formatDateOnly(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('vi-VN');
}

function isInternalStorageUrl(value: string | null | undefined) {
  const url = String(value || '').trim();
  return /\/storage\/v1\/object\//i.test(url) || /\.supabase\.co\//i.test(url);
}

function getEditableExternalAssetUrl(value: string | null | undefined) {
  const url = String(value || '').trim();
  return isInternalStorageUrl(url) ? '' : url;
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function getPartProgress(progress: ElearningProgress[], partId: string) {
  return progress.find((item) => item.partId === partId) || null;
}

function getLessonParts(parts: ElearningLessonPart[], lessonId: string) {
  return parts.filter((part) => part.lessonId === lessonId).sort((a, b) => a.sortOrder - b.sortOrder);
}

function isScormLessonComplete(lesson: ElearningLesson, attempt: ElearningScormAttempt | null) {
  if (!attempt) return false;
  if (lesson.completionRule === 'passed') return attempt.isPassed;
  if (lesson.completionRule === 'score') {
    const score = attempt.scoreScaled !== null ? attempt.scoreScaled * 100 : attempt.scoreRaw;
    return Number(score || 0) >= lesson.passingScore;
  }
  return attempt.isCompleted || attempt.isPassed;
}

function getCourseCompletion(lessons: ElearningLesson[], parts: ElearningLessonPart[], progress: ElearningProgress[], scormAttempts: ElearningScormAttempt[] = []) {
  const scormLessons = lessons.filter((lesson) => lesson.lessonType === 'scorm' && lesson.status === 'published');
  const vimeoLessons = lessons.filter((lesson) => lesson.lessonType !== 'scorm' && lesson.status === 'published');
  const required = parts.filter((part) => part.isRequired && part.status === 'published');
  const totalUnits = required.length + scormLessons.length;
  if (!totalUnits) return 0;
  const completedParts = required.filter((part) => {
    const lesson = vimeoLessons.find((item) => item.id === part.lessonId);
    return lesson && getPartProgress(progress, part.id)?.isCompleted;
  }).length;
  const completedScorm = scormLessons.filter((lesson) => {
    const attempt = scormAttempts.find((item) => item.lessonId === lesson.id && item.scormPackageId === lesson.scormPackageId) || null;
    return isScormLessonComplete(lesson, attempt);
  }).length;
  return Math.round(((completedParts + completedScorm) / totalUnits) * 100);
}

function getCourseStatusTone(status: ElearningCourse['status']): 'danger' | 'warning' | 'success' | 'neutral' {
  if (status === 'published') return 'success';
  if (status === 'draft') return 'warning';
  if (status === 'closed') return 'danger';
  return 'neutral';
}

function getCourseStatusLabel(status: ElearningCourse['status']) {
  if (status === 'published') return 'Đang active';
  if (status === 'draft') return 'Bản nháp';
  if (status === 'closed') return 'Đã đóng';
  return status;
}

function getLearnerSourceLabel(status: ElearningClassReportRow['sourceStatus']) {
  if (status === 'source_active') return 'Từ VTraining';
  if (status === 'source_removed') return 'Đã rời VTraining';
  return 'Bổ sung VLearning';
}

function getLearnerSourceTone(status: ElearningClassReportRow['sourceStatus']): 'danger' | 'warning' | 'success' | 'neutral' {
  if (status === 'source_active') return 'success';
  if (status === 'source_removed') return 'warning';
  return 'neutral';
}

function getLearningStatusLabel(status: ElearningClassReportRow['result']['finalStatus']) {
  if (status === 'completed' || status === 'passed') return 'Hoàn thành';
  if (status === 'in_progress' || status === 'failed') return 'Đang học';
  return 'Chưa học';
}

function getLearningStatusTone(status: ElearningClassReportRow['result']['finalStatus']): 'danger' | 'warning' | 'success' | 'neutral' {
  if (status === 'completed' || status === 'passed') return 'success';
  if (status === 'in_progress' || status === 'failed') return 'warning';
  return 'neutral';
}

function getReportAudienceLabel(row: ElearningClassReportRow, deployment: ElearningDeploymentBundle) {
  const learnerGroupId = String(row.enrollment.metadata?.learnerGroupId || '');
  if (learnerGroupId) {
    const group = deployment.learnerGroups.find((item) => item.id === learnerGroupId);
    return group ? `Nhóm: ${group.name}` : `Nhóm: ${learnerGroupId}`;
  }
  const targetClass = deployment.classes.find((item) => item.id === row.enrollment.classId);
  return targetClass ? `Lớp: ${targetClass.name}` : 'Lớp / nhóm chưa rõ';
}

export function ElearningLibraryPage() {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const managerCourseId = params.courseId || '';
  const { profile, session } = useAuth();
  const { pushToast } = useToast();
  const createThumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const editThumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const role = normalizeAppRole(profile?.role);
  const canManage = ['admin', 'content_manager', 'production_manager'].includes(role);
  const userId = profile?.id || session?.user?.id || session?.user?.email || 'anonymous';
  const libraryRouteMatch = useMemo(() => location.pathname.match(/^\/vlearning\/admin\/library\/([^/]+)(?:\/([^/]+))?/), [location.pathname]);
  const deploymentRouteMatch = useMemo(() => location.pathname.match(/^\/vlearning\/admin\/deployment\/([^/]+)(?:\/([^/]+))?/), [location.pathname]);
  const isLibraryRoute = Boolean(libraryRouteMatch);
  const routeDeploymentAdminLayer = deploymentRouteMatch ? VLEARNING_DEPLOYMENT_ROUTE_TO_ADMIN_LAYER[deploymentRouteMatch[1]] || 'deployment' : null;

  const [courses, setCourses] = useState<ElearningCourse[]>([]);
  const [lessonLibrary, setLessonLibrary] = useState<ElearningLesson[]>([]);
  const [scormPackages, setScormPackages] = useState<ElearningScormPackage[]>([]);
  const [quizForms, setQuizForms] = useState<QuizForm[]>([]);
  const [quizQuestionSets, setQuizQuestionSets] = useState<QuizQuestionSet[]>([]);
  const [selectedLessonParts, setSelectedLessonParts] = useState<ElearningLessonPart[]>([]);
  const [activeCourseId, setActiveCourseId] = useState('');
  const [courseStatusFilter, setCourseStatusFilter] = useState<'all' | ElearningCourse['status']>('all');
  const [courseKeyword, setCourseKeyword] = useState('');
  const [adminLayer, setAdminLayer] = useState<ElearningAdminLayer>('library');
  const effectiveAdminLayer: ElearningAdminLayer = isLibraryRoute ? 'library' : routeDeploymentAdminLayer || adminLayer;
  const [libraryLayer, setLibraryLayer] = useState<ElearningLibraryLayer>('lesson');
  const [libraryView, setLibraryView] = useState<ElearningLibraryView>('index');
  const effectiveLibraryLayer: ElearningLibraryLayer = isLibraryRoute
    ? VLEARNING_LIBRARY_ROUTE_TO_LAYER[libraryRouteMatch?.[1] || ''] || 'lesson'
    : libraryLayer;
  const effectiveLibraryView: ElearningLibraryView = isLibraryRoute
    ? libraryRouteMatch?.[2]
      ? libraryRouteMatch[2] === 'new'
        ? 'create'
        : 'detail'
      : 'index'
    : libraryView;
  const [lessonEditTitle, setLessonEditTitle] = useState('');
  const [lessonEditDescription, setLessonEditDescription] = useState('');
  const [lessonEditStatus, setLessonEditStatus] = useState<ElearningLesson['status']>('published');
  const [courseEditTitle, setCourseEditTitle] = useState('');
  const [courseEditDescription, setCourseEditDescription] = useState('');
  const [courseEditThumbnailUrl, setCourseEditThumbnailUrl] = useState('');
  const [courseEditThreshold, setCourseEditThreshold] = useState(90);
  const [courseEditQuizFormId, setCourseEditQuizFormId] = useState('');
  const [courseEditStatus, setCourseEditStatus] = useState<ElearningCourse['status']>('draft');
  const [quizEditTitle, setQuizEditTitle] = useState('');
  const [quizEditIntro, setQuizEditIntro] = useState('');
  const [quizEditQuestionSetId, setQuizEditQuestionSetId] = useState('');
  const [quizEditQuestionCount, setQuizEditQuestionCount] = useState(20);
  const [quizEditDurationMinutes, setQuizEditDurationMinutes] = useState(20);
  const [quizEditMaxAttempts, setQuizEditMaxAttempts] = useState(1);
  const [quizEditStatus, setQuizEditStatus] = useState<QuizForm['status']>('active');
  const [quizEditShuffleQuestions, setQuizEditShuffleQuestions] = useState(true);
  const [quizEditShuffleOptions, setQuizEditShuffleOptions] = useState(false);
  const [questionSetEditName, setQuestionSetEditName] = useState('');
  const [questionSetEditDescription, setQuestionSetEditDescription] = useState('');
  const [questionSetEditStatus, setQuestionSetEditStatus] = useState<QuizQuestionSet['status']>('active');
  const [newQuizTitle, setNewQuizTitle] = useState('Đề kiểm tra mới');
  const [newQuizIntro, setNewQuizIntro] = useState('');
  const [newQuizQuestionSetId, setNewQuizQuestionSetId] = useState('');
  const [newQuizQuestionCount, setNewQuizQuestionCount] = useState(20);
  const [newQuizDurationMinutes, setNewQuizDurationMinutes] = useState(20);
  const [newQuizMaxAttempts, setNewQuizMaxAttempts] = useState(1);
  const [newQuizShuffleQuestions, setNewQuizShuffleQuestions] = useState(true);
  const [newQuizShuffleOptions, setNewQuizShuffleOptions] = useState(false);
  const [newQuestionSetName, setNewQuestionSetName] = useState('Bộ câu hỏi mới');
  const [newQuestionSetDescription, setNewQuestionSetDescription] = useState('');
  const [newQuestionSetRawText, setNewQuestionSetRawText] = useState('');
  const [newQuestionSetAnswerKey, setNewQuestionSetAnswerKey] = useState('');
  const [deploymentLayer, setDeploymentLayer] = useState<ElearningDeploymentLayer>('runs');
  const effectiveDeploymentLayer: ElearningDeploymentLayer = deploymentRouteMatch
    ? VLEARNING_DEPLOYMENT_ROUTE_TO_LAYER[deploymentRouteMatch?.[1] || ''] || 'runs'
    : deploymentLayer;
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardMode, setWizardMode] = useState<'native' | 'scorm'>('native');
  const [wizardQuizOptional, setWizardQuizOptional] = useState(false);
  const [activeLessonId, setActiveLessonId] = useState('');
  const [bundle, setBundle] = useState<Awaited<ReturnType<typeof getElearningCourseBundle>>>(null);
  const [courseTitle, setCourseTitle] = useState('Khóa học ELN mới');
  const [courseDescription, setCourseDescription] = useState('');
  const [courseThumbnailUrl, setCourseThumbnailUrl] = useState('');
  const [courseQuizFormId, setCourseQuizFormId] = useState('');
  const [selectedCourseQuizFormId, setSelectedCourseQuizFormId] = useState('');
  const [lessonTitle, setLessonTitle] = useState('Bài 1 - Tên bài học');
  const [lessonDescription, setLessonDescription] = useState('');
  const [nativeLessonTitle, setNativeLessonTitle] = useState('Bài native mới');
  const [nativeLessonDescription, setNativeLessonDescription] = useState('');
  const [selectedLessonBlocks, setSelectedLessonBlocks] = useState<ElearningLessonBlock[]>([]);
  const [nativeBuilderMode, setNativeBuilderMode] = useState<'block' | 'question_library'>('block');
  const [nativeBlockType, setNativeBlockType] = useState<ElearningLessonBlockType>('video');
  const [nativeBlockTitle, setNativeBlockTitle] = useState('Phần mở đầu');
  const [nativeBlockVideoUrl, setNativeBlockVideoUrl] = useState('');
  const [nativeBlockContent, setNativeBlockContent] = useState('');
  const [nativeBlockOptions, setNativeBlockOptions] = useState('Lựa chọn A\nLựa chọn B\nLựa chọn C');
  const [nativeBlockCorrectAnswer, setNativeBlockCorrectAnswer] = useState('');
  const [nativeBulkVimeoLinks, setNativeBulkVimeoLinks] = useState('');
  const [editingNativeBlockId, setEditingNativeBlockId] = useState('');
  const [editNativeBlockType, setEditNativeBlockType] = useState<ElearningLessonBlockType>('video');
  const [editNativeBlockTitle, setEditNativeBlockTitle] = useState('');
  const [editNativeBlockVideoUrl, setEditNativeBlockVideoUrl] = useState('');
  const [editNativeBlockContent, setEditNativeBlockContent] = useState('');
  const [editNativeBlockOptions, setEditNativeBlockOptions] = useState('');
  const [editNativeBlockCorrectAnswer, setEditNativeBlockCorrectAnswer] = useState('');
  const [selectedQuestionLibraryIds, setSelectedQuestionLibraryIds] = useState<string[]>([]);
  const [nativeQuestionInsertAfterBlockId, setNativeQuestionInsertAfterBlockId] = useState('');
  const [nativeBlockInsertAfterBlockId, setNativeBlockInsertAfterBlockId] = useState('');
  const [quizSourceFormId, setQuizSourceFormId] = useState('');
  const [quizSourceQuestionId, setQuizSourceQuestionId] = useState('');
  const [activeQuizFormId, setActiveQuizFormId] = useState('');
  const [activeQuestionSetId, setActiveQuestionSetId] = useState('');
  const [quizQuestionBank, setQuizQuestionBank] = useState<QuizQuestion[]>([]);
  const [scormLessonTitle, setScormLessonTitle] = useState('Bài SCORM mới');
  const [scormLessonDescription, setScormLessonDescription] = useState('');
  const [scormFile, setScormFile] = useState<File | null>(null);
  const [scormCompletionRule, setScormCompletionRule] = useState<'completed' | 'passed' | 'score'>('completed');
  const [scormPassingScore, setScormPassingScore] = useState(70);
  const [partTitle, setPartTitle] = useState('Phần 1 - Tiêu đề phần');
  const [partVideoUrl, setPartVideoUrl] = useState('');
  const [partContent, setPartContent] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [isPreview, setIsPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [deployment, setDeployment] = useState<ElearningDeploymentBundle>({ clients: [], projects: [], classes: [], students: [], classStudents: [], enrollments: [], learnerGroups: [], runTargets: [] });
  const [activeClientId, setActiveClientId] = useState('');
  const [activeProjectId, setActiveProjectId] = useState('');
  const [activeClassId, setActiveClassId] = useState('');
  const [runName, setRunName] = useState('Đợt học mới');
  const [runCode, setRunCode] = useState('');
  const [runCourseId, setRunCourseId] = useState('');
  const [runAudienceType, setRunAudienceType] = useState<'class' | 'group'>('class');
  const [runClassId, setRunClassId] = useState('');
  const [runTargetClassIds, setRunTargetClassIds] = useState<string[]>([]);
  const [runTargetGroupIds, setRunTargetGroupIds] = useState<string[]>([]);
  const [runVTrainingClassId, setRunVTrainingClassId] = useState('');
  const [runLearnerGroupId, setRunLearnerGroupId] = useState('');
  const [runStartAt, setRunStartAt] = useState('');
  const [runEndAt, setRunEndAt] = useState('');
  const [runEditorMode, setRunEditorMode] = useState<ElearningEditorMode>('closed');
  const [clientName, setClientName] = useState('Khách hàng mới');
  const [clientCode, setClientCode] = useState('');
  const [projectName, setProjectName] = useState('Dự án đào tạo mới');
  const [projectCode, setProjectCode] = useState('');
  const [className, setClassName] = useState('Lớp triển khai mới');
  const [classCode, setClassCode] = useState('');
  const [classStartAt, setClassStartAt] = useState('');
  const [classEndAt, setClassEndAt] = useState('');
  const [classEditorMode, setClassEditorMode] = useState<ElearningEditorMode>('closed');
  const [vtrainingClasses, setVTrainingClasses] = useState<VTrainingClassForElearning[]>([]);
  const [activeVTrainingClassId, setActiveVTrainingClassId] = useState('');
  const [vtrainingStudents, setVTrainingStudents] = useState<VTrainingStudentForElearning[]>([]);
  const [importRows, setImportRows] = useState<ElearningImportPreviewRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [classReportRows, setClassReportRows] = useState<ElearningClassReportRow[]>([]);
  const [classReportPage, setClassReportPage] = useState(1);
  const [learnerGroupName, setLearnerGroupName] = useState('Nhóm học viên mới');
  const [learnerGroupDescription, setLearnerGroupDescription] = useState('');
  const [learnerGroupEmailText, setLearnerGroupEmailText] = useState('');
  const [activeLearnerGroupId, setActiveLearnerGroupId] = useState('');
  const [editingLearnerGroupId, setEditingLearnerGroupId] = useState('');
  const [editingLearnerGroupName, setEditingLearnerGroupName] = useState('');
  const [editingLearnerGroupDescription, setEditingLearnerGroupDescription] = useState('');
  const [editingLearnerGroupEmailText, setEditingLearnerGroupEmailText] = useState('');
  const [learnerGroupEditorMode, setLearnerGroupEditorMode] = useState<ElearningEditorMode>('closed');
  const [reportScopeType, setReportScopeType] = useState<'class' | 'group' | 'deployment'>('deployment');
  const [reportScopeId, setReportScopeId] = useState('');
  const reportPageSize = 50;
  const reportPreviewLimit = reportPageSize;

  useEffect(() => {
    const match = libraryRouteMatch;
    if (match) {
      const nextLayer = VLEARNING_LIBRARY_ROUTE_TO_LAYER[match[1]] || 'lesson';
      const assetId = decodeURIComponent(match[2] || '');
      setAdminLayer('library');
      setLibraryLayer(nextLayer);
      setLibraryView(assetId ? 'detail' : 'index');
      if (nextLayer === 'lesson' && assetId) setActiveLessonId(assetId);
      if (nextLayer === 'course' && assetId) setActiveCourseId(assetId);
      if (nextLayer === 'quiz' && assetId) setActiveQuizFormId(assetId);
      if (nextLayer === 'question' && assetId) setActiveQuestionSetId(assetId);
      return;
    }
    const deploymentMatch = deploymentRouteMatch;
    if (deploymentMatch) {
      const nextLayer = VLEARNING_DEPLOYMENT_ROUTE_TO_LAYER[deploymentMatch[1]] || 'runs';
      setAdminLayer(VLEARNING_DEPLOYMENT_ROUTE_TO_ADMIN_LAYER[deploymentMatch[1]] || 'deployment');
      setDeploymentLayer(nextLayer);
      return;
    }
    if (location.pathname === '/vlearning/admin' && !searchParams.get('layer')) {
      navigate('/vlearning/admin/library/lessons', { replace: true });
      return;
    }
    const requestedLayer = searchParams.get('layer') as ElearningAdminLayer | null;
    if (requestedLayer && ELEARNING_ADMIN_LAYERS.some((layer) => layer.id === requestedLayer)) {
      setAdminLayer(requestedLayer);
    }
  }, [deploymentRouteMatch, libraryRouteMatch, location.pathname, navigate, searchParams]);

  useEffect(() => {
    if (adminLayer !== 'class') {
      setErrorMessage((current) => (current.includes('VTraining') ? '' : current));
    }
  }, [adminLayer]);

  useEffect(() => {
    if (adminLayer === 'lesson' && wizardStep > 3) {
      setWizardStep(1);
    }
  }, [adminLayer, wizardStep]);

  const activeCourse = courses.find((course) => course.id === activeCourseId) || courses.find((course) => course.id === managerCourseId) || courses[0] || null;
  const activeLesson = lessonLibrary.find((lesson) => lesson.id === activeLessonId) || lessonLibrary[0] || null;
  const activeQuizForm = quizForms.find((form) => form.id === activeQuizFormId) || quizForms[0] || null;
  const activeQuestionSet = quizQuestionSets.find((set) => set.id === activeQuestionSetId) || quizQuestionSets[0] || null;
  const nativeVideoBlockCount = selectedLessonBlocks.filter((block) => block.blockType === 'video').length;
  const nativeQuestionBlockCount = selectedLessonBlocks.filter((block) => block.blockType !== 'video').length;
  const newQuestionSetPreviewQuestions = useMemo(
    () => parseQuizTextToQuestions(newQuestionSetRawText, newQuestionSetAnswerKey),
    [newQuestionSetRawText, newQuestionSetAnswerKey],
  );
  const rosterClasses = useMemo(() => deployment.classes.filter((item) => !item.courseId), [deployment.classes]);
  const learningRuns = useMemo(() => deployment.classes.filter((item) => item.courseId), [deployment.classes]);
  const activeClient = deployment.clients.find((client) => client.id === activeClientId) || deployment.clients[0] || null;
  const activeProject = deployment.projects.find((project) => project.id === activeProjectId) || deployment.projects.find((project) => project.clientId === activeClient?.id) || null;
  const activeRosterClass = rosterClasses.find((item) => item.id === activeClassId) || rosterClasses[0] || null;
  const activeLearningRun = learningRuns.find((item) => item.id === activeClassId) || learningRuns.find((item) => item.courseId === activeCourseId) || learningRuns[0] || null;
  const activeClass = effectiveAdminLayer === 'class' ? activeRosterClass : activeLearningRun || activeRosterClass;
  const activeLearnerGroup = deployment.learnerGroups.find((group) => group.id === activeLearnerGroupId) || deployment.learnerGroups[0] || null;
  const activeVTrainingClass = vtrainingClasses.find((item) => item.id === activeVTrainingClassId) || null;
  const activeRunCourse = courses.find((course) => course.id === runCourseId) || activeCourse;
  const linkedVLearningClass = activeVTrainingClass
    ? rosterClasses.find((item) => item.trainingClassId === activeVTrainingClass.id)
    : null;
  const activeVTrainingRosterCount = activeVTrainingClass ? vtrainingStudents.length || activeVTrainingClass.currentLearnerCount || 0 : 0;
  const linkedVLearningClassName = linkedVLearningClass?.name || '';
  const selectedRunTargetCount = runTargetClassIds.length + runTargetGroupIds.length;
  const activeClassEnrollments = activeClass ? deployment.enrollments.filter((item) => item.classId === activeClass.id) : [];
  const activeClassRosterRows = useMemo(() => {
    if (!activeClass) return [];
    const studentsById = new Map(deployment.students.map((student) => [student.id, student]));
    const enrollmentsByStudentId = new Map(activeClassEnrollments.map((enrollment) => [enrollment.studentId, enrollment]));
    const rows: Array<{
      roster: ElearningDeploymentBundle['classStudents'][number] | null;
      enrollment: ElearningDeploymentBundle['enrollments'][number] | null;
      student: ElearningDeploymentBundle['students'][number] | null;
    }> = deployment.classStudents
      .filter((row) => row.classId === activeClass.id && row.status === 'active')
      .map((roster) => ({
        roster,
        enrollment: enrollmentsByStudentId.get(roster.studentId) || null,
        student: studentsById.get(roster.studentId) || null,
      }))
      .filter((row) => row.student);
    const rosterStudentIds = new Set(rows.map((row) => row.roster?.studentId).filter(Boolean));
    activeClassEnrollments
      .filter((enrollment) => enrollment.learningStatus !== 'expired' && !rosterStudentIds.has(enrollment.studentId))
      .forEach((enrollment) => {
        rows.push({
          roster: null,
          enrollment,
          student: studentsById.get(enrollment.studentId) || null,
        });
      });
    return rows.filter((row) => row.student);
  }, [activeClass?.id, activeClassEnrollments, deployment.classStudents, deployment.students]);
  const completionPercent = bundle ? getCourseCompletion(bundle.lessons, bundle.parts, bundle.progress, bundle.scormAttempts) : 0;
  const nativeLessonCount = lessonLibrary.filter((lesson) => lesson.lessonType === 'native_sequence').length;
  const scormLessonCount = lessonLibrary.filter((lesson) => lesson.lessonType === 'scorm').length;
  const vimeoLessonCount = lessonLibrary.filter((lesson) => lesson.lessonType === 'vimeo_parts').length;
  useEffect(() => {
    if (!runCourseId && activeCourse?.id) setRunCourseId(activeCourse.id);
  }, [activeCourse?.id, runCourseId]);

  useEffect(() => {
    if (!runVTrainingClassId && activeVTrainingClassId) setRunVTrainingClassId(activeVTrainingClassId);
  }, [activeVTrainingClassId, runVTrainingClassId]);

  useEffect(() => {
    if (!runLearnerGroupId && activeLearnerGroupId) setRunLearnerGroupId(activeLearnerGroupId);
  }, [activeLearnerGroupId, runLearnerGroupId]);

  const filteredCourses = useMemo(() => {
    const keyword = courseKeyword.trim().toLowerCase();
    return courses.filter((course) => {
      const matchesStatus = courseStatusFilter === 'all' || course.status === courseStatusFilter;
      const matchesKeyword = !keyword || [course.id, course.title, course.description || ''].some((value) => value.toLowerCase().includes(keyword));
      return matchesStatus && matchesKeyword;
    });
  }, [courseKeyword, courseStatusFilter, courses]);
  const wizardCourseReady = Boolean(activeCourse);
  const wizardLessonReady = Boolean(activeLesson);
  const wizardContentReady = Boolean(selectedLessonParts.length || selectedLessonBlocks.length || activeLesson?.lessonType === 'scorm');
  const wizardQuizReady = Boolean(selectedCourseQuizFormId || activeCourse?.finalQuizFormId || wizardQuizOptional);
  const activeAdminNavLayer: ElearningAdminLayer =
    effectiveAdminLayer === 'library'
      ? effectiveLibraryLayer === 'lesson'
        ? 'lesson'
        : effectiveLibraryLayer === 'course'
          ? 'course'
          : effectiveLibraryLayer === 'quiz'
            ? 'quiz'
            : 'question'
      : effectiveAdminLayer;

  useEffect(() => {
    if (!activeLesson) return;
    setLessonEditTitle(activeLesson.title);
    setLessonEditDescription(activeLesson.description);
    setLessonEditStatus(activeLesson.status);
  }, [activeLesson?.id, activeLesson?.title, activeLesson?.description, activeLesson?.status]);

  useEffect(() => {
    if (!activeCourse) return;
    setCourseEditTitle(activeCourse.title);
    setCourseEditDescription(activeCourse.description);
    setCourseEditThumbnailUrl(activeCourse.thumbnailUrl);
    setCourseEditThreshold(activeCourse.completionThreshold);
    setCourseEditQuizFormId(activeCourse.finalQuizFormId);
    setCourseEditStatus(activeCourse.status);
  }, [activeCourse?.id, activeCourse?.title, activeCourse?.description, activeCourse?.thumbnailUrl, activeCourse?.completionThreshold, activeCourse?.finalQuizFormId, activeCourse?.status]);

  useEffect(() => {
    if (!activeQuizForm) return;
    setQuizEditTitle(activeQuizForm.title);
    setQuizEditIntro(activeQuizForm.intro);
    setQuizEditQuestionSetId(activeQuizForm.questionSetId);
    setQuizEditQuestionCount(activeQuizForm.questionCount);
    setQuizEditDurationMinutes(activeQuizForm.durationMinutes);
    setQuizEditMaxAttempts(activeQuizForm.maxAttempts);
    setQuizEditStatus(activeQuizForm.status);
    setQuizEditShuffleQuestions(activeQuizForm.shuffleQuestions);
    setQuizEditShuffleOptions(activeQuizForm.shuffleOptions);
  }, [activeQuizForm?.id, activeQuizForm?.title, activeQuizForm?.intro, activeQuizForm?.questionSetId, activeQuizForm?.questionCount, activeQuizForm?.durationMinutes, activeQuizForm?.maxAttempts, activeQuizForm?.status, activeQuizForm?.shuffleQuestions, activeQuizForm?.shuffleOptions]);

  useEffect(() => {
    if (!activeQuestionSet) return;
    setQuestionSetEditName(activeQuestionSet.name);
    setQuestionSetEditDescription(activeQuestionSet.description);
    setQuestionSetEditStatus(activeQuestionSet.status);
  }, [activeQuestionSet?.id, activeQuestionSet?.name, activeQuestionSet?.description, activeQuestionSet?.status]);

  useEffect(() => {
    if (!newQuizQuestionSetId && quizQuestionSets[0]?.id) {
      const firstSet = quizQuestionSets[0];
      setNewQuizQuestionSetId(firstSet.id);
      setNewQuizQuestionCount(Math.max(1, Math.min(20, firstSet.questionCount || 1)));
    }
  }, [newQuizQuestionSetId, quizQuestionSets]);

  async function loadData(preferredCourseId?: string, preferredLessonId?: string) {
    setBusy(true);
    setErrorMessage('');
    try {
      const [nextCourses, nextLessons, nextQuizForms, nextQuestionSets, nextScormPackages, nextDeployment] = await Promise.all([
        listElearningCourses(),
        listElearningLessons(),
        listElearningQuizForms(),
        listElearningQuizQuestionSets(),
        listElearningScormPackages(),
        listElearningDeploymentBundle(),
      ]);
      const nextCourseId = preferredCourseId || activeCourseId || nextCourses[0]?.id || '';
      const nextLessonId = preferredLessonId || activeLessonId || nextLessons[0]?.id || '';
      const nextClientId = activeClientId || nextDeployment.clients[0]?.id || '';
      const nextProjectId = activeProjectId || nextDeployment.projects.find((project) => project.clientId === nextClientId)?.id || nextDeployment.projects[0]?.id || '';
      const nextLearningRunId = nextDeployment.classes.find((item) => item.courseId === nextCourseId)?.id || nextDeployment.classes.find((item) => item.courseId)?.id || '';
      const nextRosterClassId = nextDeployment.classes.find((item) => !item.courseId)?.id || '';
      const nextClassId = activeClassId || nextLearningRunId || nextRosterClassId;
      const nextLearnerGroupId = activeLearnerGroupId || nextDeployment.learnerGroups[0]?.id || '';
      setCourses(nextCourses);
      setLessonLibrary(nextLessons);
      setQuizForms(nextQuizForms);
      setQuizQuestionSets(nextQuestionSets);
      setScormPackages(nextScormPackages);
      setDeployment(nextDeployment);
      setActiveCourseId(nextCourseId);
      setActiveLessonId(nextLessonId);
      setActiveQuizFormId((current) => current || nextQuizForms[0]?.id || '');
      setActiveQuestionSetId((current) => current || nextQuestionSets[0]?.id || '');
      setActiveClientId(nextClientId);
      setActiveProjectId(nextProjectId);
      setActiveClassId(nextClassId);
      setActiveLearnerGroupId(nextLearnerGroupId);
      setReportScopeId((current) => current || nextClassId);
      const nextBundle = nextCourseId ? await getElearningCourseBundle(nextCourseId, userId) : null;
      setBundle(nextBundle);
      setSelectedCourseQuizFormId(nextBundle?.course.finalQuizFormId || '');
      setSelectedLessonParts(nextLessonId ? await listElearningLessonParts(nextLessonId) : []);
      setSelectedLessonBlocks(nextLessonId ? await listElearningLessonBlocks(nextLessonId) : []);
      setClassReportRows(nextClassId ? (await getElearningOptimizedReport({ scopeType: 'deployment', scopeId: nextClassId, previewLimit: 10000 })).rows : []);
      setClassReportPage(1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được dữ liệu e-learning.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadData(managerCourseId || undefined);
  }, [managerCourseId]);

  useEffect(() => {
    if (!canManage || (adminLayer !== 'class' && !managerCourseId)) return;
    listVTrainingClassesForElearning()
      .then((rows) => {
        setVTrainingClasses(rows);
        setActiveVTrainingClassId((current) => current || rows[0]?.id || '');
      })
      .catch((error) => {
        if (adminLayer === 'class') setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách lớp VTraining.');
      });
  }, [adminLayer, canManage, managerCourseId]);

  useEffect(() => {
    if (!canManage || (adminLayer !== 'class' && !managerCourseId) || !activeVTrainingClassId) {
      setVTrainingStudents([]);
      return;
    }
    listVTrainingStudentsForElearning(activeVTrainingClassId)
      .then(setVTrainingStudents)
      .catch((error) => {
        if (adminLayer === 'class') setErrorMessage(error instanceof Error ? error.message : 'Không tải được học viên VTraining.');
      });
  }, [adminLayer, activeVTrainingClassId, canManage, managerCourseId]);

  useEffect(() => {
    if (!activeLessonId) return;
    listElearningLessonParts(activeLessonId).then(setSelectedLessonParts).catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Không tải được phần bài học.'));
    listElearningLessonBlocks(activeLessonId).then(setSelectedLessonBlocks).catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Không tải được block native.'));
  }, [activeLessonId]);

  useEffect(() => {
    const scopeId = reportScopeType === 'group' ? activeLearnerGroupId : activeClassId;
    if (!scopeId) {
      setClassReportRows([]);
      setClassReportPage(1);
      return;
    }
    setReportScopeId(scopeId);
    getElearningOptimizedReport({ scopeType: reportScopeType, scopeId, previewLimit: 10000 })
      .then((report) => {
        setClassReportRows(report.rows);
        setClassReportPage(1);
      })
      .catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Không tải được thống kê học viên.'));
  }, [activeClassId, activeLearnerGroupId, reportScopeType]);

  const classReportTotalPages = Math.max(1, Math.ceil(classReportRows.length / reportPageSize));
  const classReportCurrentPage = Math.min(classReportPage, classReportTotalPages);
  const classReportStartIndex = (classReportCurrentPage - 1) * reportPageSize;
  const classReportVisibleRows = classReportRows.slice(classReportStartIndex, classReportStartIndex + reportPageSize);

  function openLibraryDetail(nextLayer: ElearningLibraryLayer) {
    setLibraryLayer(nextLayer);
    setLibraryView('detail');
    navigate(getLibraryLayerRoute(nextLayer));
  }

  function openLessonDetail(lessonId: string) {
    setActiveLessonId(lessonId);
    setLibraryLayer('lesson');
    setLibraryView('detail');
    navigate(`/vlearning/admin/library/lessons/${encodeURIComponent(lessonId)}`);
  }

  function openCourseDetail(courseId: string) {
    setActiveCourseId(courseId);
    setLibraryLayer('course');
    setLibraryView('detail');
    navigate(`/vlearning/admin/library/courses/${encodeURIComponent(courseId)}`);
  }

  function openQuizDetail(formId: string) {
    setActiveQuizFormId(formId);
    setLibraryLayer('quiz');
    setLibraryView('detail');
    navigate(`/vlearning/admin/library/quizzes/${encodeURIComponent(formId)}`);
  }

  function openQuestionDetail(questionSetId: string) {
    setActiveQuestionSetId(questionSetId);
    setLibraryLayer('question');
    setLibraryView('detail');
    navigate(`/vlearning/admin/library/questions/${encodeURIComponent(questionSetId)}`);
  }

  async function handleDeleteLesson(targetLesson = activeLesson) {
    if (!targetLesson) return;
    const confirmed = window.confirm(`Xóa bài giảng "${targetLesson.title}"? Chỉ xóa được khi bài chưa gắn vào khóa học.`);
    if (!confirmed) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await deleteElearningLesson(targetLesson.id);
      pushToast({ title: 'Đã xóa bài giảng', tone: 'success' });
      setActiveLessonId('');
      setLibraryView('index');
      await loadData(activeCourseId, '');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không xóa được bài giảng.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveLibraryLesson() {
    if (!activeLesson) return;
    if (!lessonEditTitle.trim()) {
      setErrorMessage('Cần nhập tên bài giảng.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      await updateElearningLesson(activeLesson.id, {
        title: lessonEditTitle,
        description: lessonEditDescription,
        status: lessonEditStatus,
      });
      pushToast({ title: 'Đã lưu bài giảng', tone: 'success' });
      await loadData(activeCourseId, activeLesson.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không lưu được bài giảng.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveLibraryCourse() {
    if (!activeCourse) return;
    if (!courseEditTitle.trim()) {
      setErrorMessage('Cần nhập tên khóa học.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      await updateElearningCourse(activeCourse.id, {
        title: courseEditTitle,
        description: courseEditDescription,
        thumbnailUrl: courseEditThumbnailUrl,
        completionThreshold: courseEditThreshold,
        finalQuizFormId: courseEditQuizFormId,
        status: courseEditStatus,
      });
      pushToast({ title: 'Đã lưu khóa học', tone: 'success' });
      await loadData(activeCourse.id, activeLessonId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không lưu được khóa học.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadCourseThumbnail(file: File | null | undefined, mode: 'create' | 'edit') {
    if (!file) return;
    setBusy(true);
    setErrorMessage('');
    try {
      const publicUrl = await uploadElearningCourseThumbnail({
        file,
        courseId: mode === 'edit' ? activeCourse?.id : courseTitle,
      });
      if (mode === 'edit') {
        setCourseEditThumbnailUrl(publicUrl);
      } else {
        setCourseThumbnailUrl(publicUrl);
      }
      pushToast({
        title: 'Đã upload thumbnail',
        message: 'Thumbnail đã được upload và sẵn sàng lưu cho khóa học.',
        tone: 'success',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không upload được thumbnail.';
      setErrorMessage(message);
      pushToast({ title: message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteLibraryCourse() {
    if (!activeCourse) return;
    const confirmed = window.confirm(`Xóa khóa học "${activeCourse.title}"? Chỉ xóa được khi khóa chưa có lớp hoặc ghi danh.`);
    if (!confirmed) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await deleteElearningCourse(activeCourse.id);
      pushToast({ title: 'Đã xóa khóa học', tone: 'success' });
      setActiveCourseId('');
      setLibraryView('index');
      navigate('/vlearning/admin/library/courses');
      await loadData('', activeLessonId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không xóa được khóa học.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveLibraryQuiz() {
    if (!activeQuizForm) return;
    if (!quizEditTitle.trim()) {
      setErrorMessage('Cần nhập tên đề kiểm tra.');
      return;
    }
    if (!quizEditQuestionSetId) {
      setErrorMessage('Cần chọn bộ câu hỏi cho đề kiểm tra.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      await updateElearningQuizForm(activeQuizForm.id, {
        title: quizEditTitle,
        intro: quizEditIntro,
        questionSetId: quizEditQuestionSetId,
        questionCount: quizEditQuestionCount,
        durationMinutes: quizEditDurationMinutes,
        maxAttempts: quizEditMaxAttempts,
        status: quizEditStatus,
        shuffleQuestions: quizEditShuffleQuestions,
        shuffleOptions: quizEditShuffleOptions,
      });
      pushToast({ title: 'Đã lưu đề kiểm tra', tone: 'success' });
      await loadData(activeCourseId, activeLessonId);
      setActiveQuizFormId(activeQuizForm.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không lưu được đề kiểm tra.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteLibraryQuiz(targetForm = activeQuizForm) {
    if (!targetForm) return;
    const confirmed = window.confirm(`Xóa đề kiểm tra "${targetForm.title}"? Chỉ xóa được khi đề chưa có bài nộp và chưa gắn vào khóa học.`);
    if (!confirmed) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await deleteElearningQuizForm(targetForm.id);
      pushToast({ title: 'Đã xóa đề kiểm tra', tone: 'success' });
      setActiveQuizFormId('');
      setLibraryView('index');
      navigate('/vlearning/admin/library/quizzes');
      await loadData(activeCourseId, activeLessonId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không xóa được đề kiểm tra.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateLibraryQuiz() {
    const questionSetId = newQuizQuestionSetId || quizQuestionSets[0]?.id || '';
    const selectedSet = quizQuestionSets.find((set) => set.id === questionSetId) || quizQuestionSets[0];
    setNewQuizTitle('Đề kiểm tra mới');
    setNewQuizIntro('');
    setNewQuizQuestionSetId(questionSetId);
    setNewQuizQuestionCount(Math.max(1, Math.min(20, selectedSet?.questionCount || 1)));
    setNewQuizDurationMinutes(20);
    setNewQuizMaxAttempts(1);
    setNewQuizShuffleQuestions(true);
    setNewQuizShuffleOptions(false);
    setLibraryLayer('quiz');
    setLibraryView('create');
    navigate('/vlearning/admin/library/quizzes/new');
  }

  async function handleSaveNewLibraryQuiz() {
    const selectedQuestionSetId = newQuizQuestionSetId || quizQuestionSets[0]?.id || '';
    if (!selectedQuestionSetId) {
      pushToast({ title: 'Cần tạo bộ câu hỏi trước khi tạo đề kiểm tra.', tone: 'warning' });
      navigate('/vlearning/admin/library/questions');
      return;
    }
    if (!newQuizTitle.trim()) {
      setErrorMessage('Cần nhập tên đề kiểm tra.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const created = await createElearningQuizForm({
        title: newQuizTitle.trim(),
        intro: newQuizIntro,
        questionSetId: selectedQuestionSetId,
        questionCount: newQuizQuestionCount,
        durationMinutes: newQuizDurationMinutes,
        maxAttempts: newQuizMaxAttempts,
        shuffleQuestions: newQuizShuffleQuestions,
        shuffleOptions: newQuizShuffleOptions,
      });
      const nextForms = await listElearningQuizForms();
      setQuizForms(nextForms);
      setActiveQuizFormId(created.id);
      setLibraryLayer('quiz');
      setLibraryView('index');
      navigate('/vlearning/admin/library/quizzes');
      pushToast({ title: 'Đã lưu đề kiểm tra mới', tone: 'success' });
    } catch (error) {
      pushToast({ title: error instanceof Error ? error.message : 'Không tạo được đề kiểm tra.', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveLibraryQuestionSet() {
    if (!activeQuestionSet) return;
    if (!questionSetEditName.trim()) {
      setErrorMessage('Cần nhập tên bộ câu hỏi.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      await updateElearningQuizQuestionSet(activeQuestionSet.id, {
        name: questionSetEditName,
        description: questionSetEditDescription,
        status: questionSetEditStatus,
      });
      pushToast({ title: 'Đã lưu bộ câu hỏi', tone: 'success' });
      await loadData(activeCourseId, activeLessonId);
      setActiveQuestionSetId(activeQuestionSet.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không lưu được bộ câu hỏi.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateLibraryQuestionSet() {
    setNewQuestionSetName('Bộ câu hỏi mới');
    setNewQuestionSetDescription('');
    setNewQuestionSetRawText('');
    setNewQuestionSetAnswerKey('');
    setLibraryLayer('question');
    setLibraryView('create');
    navigate('/vlearning/admin/library/questions/new');
  }

  async function handleLibraryQuestionImportFile(file: File | null) {
    if (!file) return;
    setErrorMessage('');
    try {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        const parsed = await parseQuizWorkbookFile(file);
        if (parsed.title && (!newQuestionSetName.trim() || newQuestionSetName === 'Bộ câu hỏi mới')) setNewQuestionSetName(parsed.title);
        setNewQuestionSetRawText(parsed.questions.map((question, index) => {
          const options = question.options.map((option) => `${option.id}. ${option.text}`).join('\n');
          return `Câu ${index + 1}: ${question.prompt}\n${options}`;
        }).join('\n\n'));
        setNewQuestionSetAnswerKey(parsed.questions.map((question, index) => `${index + 1}:${question.correctOptionId || ''}`).filter((item) => !item.endsWith(':')).join(', '));
        if (parsed.errors.length) setErrorMessage(parsed.errors.join('\n'));
        return;
      }
      const text = lowerName.endsWith('.docx') ? await extractTextFromDocx(file) : await file.text();
      setNewQuestionSetRawText(text);
      if (!newQuestionSetName.trim() || newQuestionSetName === 'Bộ câu hỏi mới') setNewQuestionSetName(file.name.replace(/\.[^.]+$/, ''));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không đọc được file câu hỏi.');
    }
  }

  async function handleSaveNewLibraryQuestionSet() {
    if (!newQuestionSetName.trim()) {
      setErrorMessage('Cần nhập tên bộ câu hỏi.');
      return;
    }
    if (!newQuestionSetPreviewQuestions.length) {
      setErrorMessage('Cần import hoặc nhập tay ít nhất 1 câu hỏi trước khi lưu.');
      return;
    }
    const missingAnswerCount = newQuestionSetPreviewQuestions.filter((question) => !question.correctOptionId).length;
    if (missingAnswerCount) {
      setErrorMessage(`Chưa nhận diện đáp án đúng cho ${missingAnswerCount}/${newQuestionSetPreviewQuestions.length} câu. Hãy kiểm tra file hoặc dán key, ví dụ: 1:B, 2:C, 3:A.`);
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const bundle = await createElearningQuizQuestionSet({
        name: newQuestionSetName.trim(),
        description: newQuestionSetDescription,
        questions: newQuestionSetPreviewQuestions,
      });
      const nextSets = await listElearningQuizQuestionSets();
      setQuizQuestionSets(nextSets);
      setActiveQuestionSetId(bundle.set.id);
      setLibraryLayer('question');
      setLibraryView('index');
      navigate('/vlearning/admin/library/questions');
      pushToast({ title: 'Đã lưu bộ câu hỏi mới', tone: 'success' });
    } catch (error) {
      pushToast({ title: error instanceof Error ? error.message : 'Không tạo được bộ câu hỏi.', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteLibraryQuestionSet(targetSet = activeQuestionSet) {
    if (!targetSet) return;
    const confirmed = window.confirm(`Xóa bộ câu hỏi "${targetSet.name}"? Chỉ xóa được khi chưa có đề kiểm tra sử dụng.`);
    if (!confirmed) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await deleteElearningQuizQuestionSet(targetSet.id);
      pushToast({ title: 'Đã xóa bộ câu hỏi', tone: 'success' });
      setActiveQuestionSetId('');
      setLibraryView('index');
      navigate('/vlearning/admin/library/questions');
      await loadData(activeCourseId, activeLessonId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không xóa được bộ câu hỏi.');
    } finally {
      setBusy(false);
    }
  }

  async function handleLoadQuizQuestionBank(questionSetId: string) {
    setQuizSourceFormId(questionSetId);
    setQuizSourceQuestionId('');
    setSelectedQuestionLibraryIds([]);
    if (!questionSetId) {
      setQuizQuestionBank([]);
      return;
    }
    try {
      const questionSetBundle = await getElearningQuizQuestionSetBundle(questionSetId);
      setQuizQuestionBank(questionSetBundle.questions || []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được câu hỏi từ kho quiz.');
    }
  }

  function handleUseQuizQuestion(questionId: string) {
    setQuizSourceQuestionId(questionId);
    const question = quizQuestionBank.find((item) => item.id === questionId);
    if (!question) return;
    setNativeBlockType('single_choice');
    setNativeBlockTitle(`Câu hỏi ${question.code || selectedLessonBlocks.length + 1}`);
    setNativeBlockContent(question.prompt);
    setNativeBlockOptions(question.options.map((option) => option.text).join('\n'));
    const correctOption = question.options.find((option) => option.id === question.correctOptionId);
    setNativeBlockCorrectAnswer(correctOption?.text || '');
  }

  function toggleQuestionLibrarySelection(questionId: string) {
    setSelectedQuestionLibraryIds((current) => (
      current.includes(questionId)
        ? current.filter((id) => id !== questionId)
        : [...current, questionId]
    ));
  }

  function getNativeBlockCorrectAnswerText(block: ElearningLessonBlock) {
    if (Array.isArray(block.correctAnswer)) return block.correctAnswer.join(', ');
    return block.correctAnswer || '';
  }

  function buildNativeQuestionBlockInput(question: QuizQuestion, sortOrder: number) {
    const correctOption = question.options.find((option) => option.id === question.correctOptionId);
    return {
      lessonId: activeLesson?.id || '',
      blockType: 'single_choice' as ElearningLessonBlockType,
      title: `Câu hỏi ${question.code || sortOrder}`,
      content: question.prompt,
      videoUrl: undefined,
      options: question.options.map((option) => option.text),
      correctAnswer: correctOption?.text || null,
      points: 1,
      durationSeconds: 0,
      isRequired: true,
      sortOrder,
      status: 'published' as const,
    };
  }

  async function updateNativeBlockSortOrders(blocks: ElearningLessonBlock[]) {
    const updates = blocks.map((block, index) => updateElearningLessonBlock(block.id, {
      lessonId: block.lessonId,
      blockType: block.blockType,
      title: block.title,
      content: block.content,
      videoUrl: block.blockType === 'video' ? block.videoUrl || block.videoId : undefined,
      options: block.options,
      correctAnswer: block.correctAnswer,
      points: block.points,
      durationSeconds: block.durationSeconds,
      isRequired: block.isRequired,
      sortOrder: index + 1,
      status: block.status,
    }));
    return Promise.all(updates);
  }

  function getNativeBulkVideoTitle(index: number, total: number, explicitTitle = '') {
    if (explicitTitle.trim()) return explicitTitle.trim();
    if (index === 0) return 'Mở đầu';
    if (index === total - 1) return 'Kết luận';
    return `Phần ${index}`;
  }

  function parseNativeVimeoBlockDrafts(input: string) {
    const rows = input
      .split(/\r?\n/)
      .map((line) => {
        const source = line.trim();
        if (!source) return null;
        const iframeSrc = source.match(/src=["']([^"']+)["']/i)?.[1] || source;
        const iframeTitle = source.match(/title=["']([^"']+)["']/i)?.[1]?.trim();
        const videoId = iframeSrc.match(/player\.vimeo\.com\/video\/(\d+)/i)?.[1]
          || iframeSrc.match(/vimeo\.com\/(?:video\/)?(\d+)/i)?.[1]
          || (/^\d+$/.test(iframeSrc.trim()) ? iframeSrc.trim() : '');
        if (!videoId) return null;
        const explicitTitle = iframeTitle || source
          .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
          .replace(/https?:\/\/(?:player\.)?vimeo\.com\/(?:video\/)?\d+\S*/gi, '')
          .replace(/\b\d{6,}\b/g, '')
          .trim();
        return {
          videoUrl: videoId,
          explicitTitle,
        };
      })
      .filter((item): item is { videoUrl: string; explicitTitle: string } => Boolean(item));
    return rows.map((row, index) => ({
      videoUrl: row.videoUrl,
      title: getNativeBulkVideoTitle(index, rows.length, row.explicitTitle),
    }));
  }

  function handleEditNativeBlock(block: ElearningLessonBlock) {
    setEditingNativeBlockId(block.id);
    setEditNativeBlockType(block.blockType);
    setEditNativeBlockTitle(block.title);
    setEditNativeBlockVideoUrl(block.videoUrl || block.videoId);
    setEditNativeBlockContent(block.content);
    setEditNativeBlockOptions(block.options.join('\n'));
    setEditNativeBlockCorrectAnswer(getNativeBlockCorrectAnswerText(block));
  }

  function handleCancelNativeBlockEdit() {
    setEditingNativeBlockId('');
    setEditNativeBlockType('video');
    setEditNativeBlockTitle('');
    setEditNativeBlockVideoUrl('');
    setEditNativeBlockContent('');
    setEditNativeBlockOptions('');
    setEditNativeBlockCorrectAnswer('');
  }

  function handlePrepareInsertNativeBlock(afterBlockId: string) {
    setNativeBuilderMode('block');
    setNativeBlockInsertAfterBlockId(afterBlockId);
    setEditingNativeBlockId('');
    const afterBlock = selectedLessonBlocks.find((block) => block.id === afterBlockId);
    setNativeBlockTitle(`Block ${afterBlock ? afterBlock.sortOrder + 1 : 1}`);
    setNativeBlockType('video');
    setNativeBlockVideoUrl('');
    setNativeBlockContent('');
    setNativeBlockOptions('');
    setNativeBlockCorrectAnswer('');
  }

  function handleCancelInsertNativeBlock() {
    setNativeBlockInsertAfterBlockId('');
    setNativeBlockTitle(`Block ${selectedLessonBlocks.length + 1}`);
    setNativeBlockVideoUrl('');
    setNativeBlockContent('');
    setNativeBlockOptions('');
    setNativeBlockCorrectAnswer('');
  }

  async function handleSaveNativeBlockEdit(block: ElearningLessonBlock) {
    if (!activeLesson || activeLesson.lessonType !== 'native_sequence') return;
    const normalizedOptions = editNativeBlockOptions.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const normalizedCorrectAnswer = editNativeBlockType === 'multiple_choice'
      ? editNativeBlockCorrectAnswer.split(',').map((item) => item.trim()).filter(Boolean)
      : editNativeBlockCorrectAnswer.trim() || null;
    if (!editNativeBlockTitle.trim()) {
      setErrorMessage('Vui lòng nhập tiêu đề block.');
      return;
    }
    if (editNativeBlockType !== 'video' && !editNativeBlockContent.trim()) {
      setErrorMessage('Vui lòng nhập nội dung câu hỏi.');
      return;
    }
    if ((editNativeBlockType === 'single_choice' || editNativeBlockType === 'multiple_choice') && normalizedOptions.length < 2) {
      setErrorMessage('Vui lòng nhập ít nhất 2 đáp án, mỗi đáp án một dòng.');
      return;
    }
    if (editNativeBlockType !== 'video' && (!normalizedCorrectAnswer || (Array.isArray(normalizedCorrectAnswer) && !normalizedCorrectAnswer.length))) {
      setErrorMessage('Vui lòng nhập đáp án đúng.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const updatedBlock = await updateElearningLessonBlock(block.id, {
        lessonId: activeLesson.id,
        blockType: editNativeBlockType,
        title: editNativeBlockTitle,
        content: editNativeBlockContent,
        videoUrl: editNativeBlockType === 'video' ? editNativeBlockVideoUrl : undefined,
        options: editNativeBlockType === 'video' ? [] : normalizedOptions,
        correctAnswer: editNativeBlockType === 'video' ? null : normalizedCorrectAnswer,
        points: editNativeBlockType === 'video' ? 0 : block.points || 1,
        durationSeconds: editNativeBlockType === 'video' ? Math.max(block.durationSeconds, durationMinutes * 60) : 0,
        isRequired: block.isRequired,
        sortOrder: block.sortOrder,
        status: block.status,
      });
      setSelectedLessonBlocks((current) => current.map((item) => (item.id === updatedBlock.id ? updatedBlock : item)).sort((a, b) => a.sortOrder - b.sortOrder));
      handleCancelNativeBlockEdit();
      pushToast({ title: 'Đã lưu block native', tone: 'success' });
      await loadData(activeCourseId, activeLesson.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không lưu được block native.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteNativeBlock(block: ElearningLessonBlock) {
    if (!activeLesson) return;
    const confirmed = window.confirm(`Xóa block "${block.title}" khỏi bài "${activeLesson.title}"? Học viên sẽ không còn thấy block này khi tải lại bài.`);
    if (!confirmed) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await deleteElearningLessonBlock(block.id);
      setSelectedLessonBlocks((current) => current.filter((item) => item.id !== block.id));
      if (editingNativeBlockId === block.id) handleCancelNativeBlockEdit();
      pushToast({ title: 'Đã xóa block native', tone: 'success' });
      await loadData(activeCourseId, activeLesson.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không xóa được block native.');
    } finally {
      setBusy(false);
    }
  }

  function renderNativeBlockPreview(block: ElearningLessonBlock) {
    return (
      <div className="elearning-native-block-preview" key={block.id}>
        <div>
          <strong>{block.title}</strong>
          <span>{block.blockType === 'video' ? 'Video Vimeo' : block.blockType}</span>
        </div>
        {block.content ? <p>{block.content}</p> : null}
        {block.blockType === 'video' && block.videoId ? (
          <div className="elearning-video-frame elearning-video-frame-preview">
            <iframe src={buildVimeoEmbedUrl(block.videoUrl || block.videoId)} title={block.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
          </div>
        ) : null}
        {block.options.length ? (
          <div className="elearning-native-question-preview">
            {block.options.map((option) => (
              <label className="checkbox-row" key={option}>
                <input type={block.blockType === 'multiple_choice' ? 'checkbox' : 'radio'} disabled />
                {option}
              </label>
            ))}
            {block.correctAnswer ? <span className="muted-text">Đáp án đúng: {Array.isArray(block.correctAnswer) ? block.correctAnswer.join(', ') : block.correctAnswer}</span> : null}
          </div>
        ) : null}
      </div>
    );
  }

  function renderEditableNativeBlockList() {
    if (!activeLesson || activeLesson.lessonType !== 'native_sequence') return null;
    return (
      <div className="elearning-native-preview-list">
        <div className="elearning-native-block-summary">
          <span><strong>{selectedLessonBlocks.length}</strong> block</span>
          <span><strong>{nativeVideoBlockCount}</strong> Vimeo</span>
          <span><strong>{nativeQuestionBlockCount}</strong> câu hỏi</span>
        </div>
        {selectedLessonBlocks.map((block) => {
          const isEditing = editingNativeBlockId === block.id;
          const isInsertingAfterThisBlock = nativeBuilderMode === 'block' && nativeBlockInsertAfterBlockId === block.id;
          return (
            <div className="elearning-native-timeline-item" key={block.id}>
              <article className="elearning-native-block-preview">
                <div className="elearning-native-block-media">
                  {block.blockType === 'video' && block.videoId ? (
                    <div className="elearning-video-frame elearning-video-frame-preview">
                      <iframe src={buildVimeoEmbedUrl(block.videoUrl || block.videoId)} title={block.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
                    </div>
                  ) : (
                    <div className="elearning-native-question-tile">
                      <strong>Q</strong>
                      <span>{block.options.length || 1} đáp án</span>
                    </div>
                  )}
                </div>
                <div className="elearning-native-block-body">
                  <div className="elearning-native-block-head">
                    <div>
                      <strong>{block.sortOrder}. {block.title}</strong>
                      <span>{block.blockType === 'video' ? 'Video Vimeo' : block.blockType}</span>
                    </div>
                    <div className="action-row">
                      <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={() => handleEditNativeBlock(block)}>Sửa</button>
                      <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={() => void handleDeleteNativeBlock(block)}>Xóa</button>
                    </div>
                  </div>
                  {isEditing ? (
                    <div className="form-grid">
                      <label>
                        <span>Loại block</span>
                        <select value={editNativeBlockType} onChange={(event) => setEditNativeBlockType(event.target.value as ElearningLessonBlockType)}>
                          <option value="video">Video</option>
                          <option value="single_choice">Single choice</option>
                          <option value="multiple_choice">Multiple choice</option>
                          <option value="fill_gap">Fill in gap</option>
                          <option value="short_answer">Short answer</option>
                        </select>
                      </label>
                      <label>
                        <span>Tiêu đề block</span>
                        <input value={editNativeBlockTitle} onChange={(event) => setEditNativeBlockTitle(event.target.value)} />
                      </label>
                      {editNativeBlockType === 'video' ? (
                        <label>
                          <span>Link Vimeo / ID</span>
                          <input value={editNativeBlockVideoUrl} onChange={(event) => setEditNativeBlockVideoUrl(event.target.value)} placeholder="https://vimeo.com/123456789" />
                        </label>
                      ) : null}
                      <label className="full">
                        <span>{editNativeBlockType === 'video' ? 'Nội dung / hướng dẫn' : 'Nội dung câu hỏi'}</span>
                        <textarea rows={2} value={editNativeBlockContent} onChange={(event) => setEditNativeBlockContent(event.target.value)} />
                      </label>
                      {editNativeBlockType !== 'video' ? (
                        <>
                          <label className="full">
                            <span>Đáp án</span>
                            <textarea rows={3} value={editNativeBlockOptions} onChange={(event) => setEditNativeBlockOptions(event.target.value)} placeholder="Mỗi đáp án một dòng" />
                          </label>
                          <label className="full">
                            <span>Đáp án đúng</span>
                            <input value={editNativeBlockCorrectAnswer} onChange={(event) => setEditNativeBlockCorrectAnswer(event.target.value)} placeholder={editNativeBlockType === 'multiple_choice' ? 'Nhập các đáp án đúng, cách nhau bằng dấu phẩy' : 'Nhập đúng nội dung đáp án'} />
                          </label>
                        </>
                      ) : null}
                      <div className="full action-row">
                        <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void handleSaveNativeBlockEdit(block)}>Lưu</button>
                        <button className="btn btn-ghost" type="button" disabled={busy} onClick={handleCancelNativeBlockEdit}>Hủy</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {block.content ? <p>{block.content}</p> : null}
                      {block.options.length ? (
                        <div className="elearning-native-question-preview">
                          {block.options.map((option) => (
                            <label className="checkbox-row" key={option}>
                              <input type={block.blockType === 'multiple_choice' ? 'checkbox' : 'radio'} disabled />
                              {option}
                            </label>
                          ))}
                          {block.correctAnswer ? <span className="muted-text">Đáp án đúng: {getNativeBlockCorrectAnswerText(block)}</span> : null}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </article>
              <button className="elearning-native-insert-button" type="button" disabled={busy} onClick={() => handlePrepareInsertNativeBlock(block.id)}>
                <span>+</span>
                <em>Thêm block sau phần {block.sortOrder}</em>
              </button>
              {isInsertingAfterThisBlock ? (
                <div className="elearning-native-inline-insert">
                  <div className="elearning-native-inline-insert-head">
                    <strong>Thêm block sau phần {block.sortOrder}</strong>
                    <span>Block mới sẽ được chèn ngay trước phần {block.sortOrder + 1}.</span>
                  </div>
                  <div className="form-grid">
                    <label>
                      <span>Loại block</span>
                      <select value={nativeBlockType} onChange={(event) => setNativeBlockType(event.target.value as ElearningLessonBlockType)}>
                        <option value="video">Video</option>
                        <option value="single_choice">Single choice</option>
                        <option value="multiple_choice">Multiple choice</option>
                        <option value="fill_gap">Fill in gap</option>
                        <option value="short_answer">Short answer</option>
                      </select>
                    </label>
                    <label>
                      <span>Tiêu đề block</span>
                      <input value={nativeBlockTitle} onChange={(event) => setNativeBlockTitle(event.target.value)} />
                    </label>
                    {nativeBlockType === 'video' ? (
                      <label>
                        <span>Link Vimeo / ID</span>
                        <input value={nativeBlockVideoUrl} onChange={(event) => setNativeBlockVideoUrl(event.target.value)} placeholder="https://vimeo.com/123456789" />
                      </label>
                    ) : null}
                    {nativeBlockType !== 'video' ? (
                      <>
                        <label>
                          <span>Chọn từ thư viện câu hỏi</span>
                          <select value={quizSourceFormId} onChange={(event) => void handleLoadQuizQuestionBank(event.target.value)}>
                            <option value="">Nhập nhanh thủ công</option>
                            {quizQuestionSets.map((set) => <option value={set.id} key={set.id}>{set.name} ({set.questionCount} câu)</option>)}
                          </select>
                        </label>
                        <label>
                          <span>Câu hỏi lẻ</span>
                          <select value={quizSourceQuestionId} onChange={(event) => handleUseQuizQuestion(event.target.value)} disabled={!quizQuestionBank.length}>
                            <option value="">Chọn câu hỏi</option>
                            {quizQuestionBank.map((question) => <option value={question.id} key={question.id}>{question.code}. {question.prompt}</option>)}
                          </select>
                        </label>
                      </>
                    ) : null}
                    <label className="full">
                      <span>{nativeBlockType === 'video' ? 'Nội dung / hướng dẫn' : 'Nội dung câu hỏi'}</span>
                      <textarea rows={3} value={nativeBlockContent} onChange={(event) => setNativeBlockContent(event.target.value)} />
                    </label>
                    {nativeBlockType !== 'video' ? (
                      <>
                        <label className="full">
                          <span>Đáp án</span>
                          <textarea rows={4} value={nativeBlockOptions} onChange={(event) => setNativeBlockOptions(event.target.value)} placeholder="Mỗi đáp án một dòng" />
                        </label>
                        <label className="full">
                          <span>Đáp án đúng</span>
                          <input value={nativeBlockCorrectAnswer} onChange={(event) => setNativeBlockCorrectAnswer(event.target.value)} placeholder={nativeBlockType === 'multiple_choice' ? 'Nhập các đáp án đúng, cách nhau bằng dấu phẩy' : 'Nhập đúng nội dung đáp án'} />
                        </label>
                      </>
                    ) : null}
                    <div className="full action-row">
                      <button className="btn btn-primary" type="button" disabled={busy || !nativeBlockTitle.trim()} onClick={() => void handleCreateNativeBlock()}>
                        Lưu block
                      </button>
                      <button className="btn btn-ghost" type="button" disabled={busy} onClick={handleCancelInsertNativeBlock}>Hủy</button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        {!selectedLessonBlocks.length ? <div className="muted-text">Bài native này chưa có block.</div> : null}
      </div>
    );
  }

  async function handleCreateLesson() {
    if (!lessonTitle.trim()) {
      setErrorMessage('Cần nhập tên bài học.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const lesson = await createElearningLesson({
        id: sanitizeElearningId(lessonTitle),
        title: lessonTitle,
        description: lessonDescription,
        status: 'published',
      });
      setLessonTitle('Bài 1 - Tên bài học');
      setLessonDescription('');
      await loadData(activeCourseId, lesson.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được bài học.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateNativeLesson() {
    if (!nativeLessonTitle.trim()) {
      setErrorMessage('Cần nhập tên bài native.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const lesson = await createElearningLesson({
        id: sanitizeElearningId(nativeLessonTitle),
        title: nativeLessonTitle,
        description: nativeLessonDescription,
        lessonType: 'native_sequence',
        status: 'published',
      });
      setNativeLessonTitle('Bài native mới');
      setNativeLessonDescription('');
      await loadData(activeCourseId, lesson.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được bài native.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateNativeBlock() {
    if (!activeLesson || activeLesson.lessonType !== 'native_sequence') {
      setErrorMessage('Vui lòng chọn một bài native để thêm block.');
      return;
    }
    const normalizedOptions = nativeBlockOptions.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const normalizedCorrectAnswer = nativeBlockType === 'multiple_choice'
      ? nativeBlockCorrectAnswer.split(',').map((item) => item.trim()).filter(Boolean)
      : nativeBlockCorrectAnswer.trim() || null;
    if (nativeBlockType !== 'video' && !nativeBlockContent.trim()) {
      setErrorMessage('Vui lòng nhập nội dung câu hỏi.');
      return;
    }
    if ((nativeBlockType === 'single_choice' || nativeBlockType === 'multiple_choice') && normalizedOptions.length < 2) {
      setErrorMessage('Vui lòng nhập ít nhất 2 đáp án, mỗi đáp án một dòng.');
      return;
    }
    if (nativeBlockType !== 'video' && (!normalizedCorrectAnswer || (Array.isArray(normalizedCorrectAnswer) && !normalizedCorrectAnswer.length))) {
      setErrorMessage('Vui lòng nhập đáp án đúng.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const currentBlocks = [...selectedLessonBlocks].sort((a, b) => a.sortOrder - b.sortOrder);
      const afterBlockIndex = nativeBlockInsertAfterBlockId
        ? currentBlocks.findIndex((block) => block.id === nativeBlockInsertAfterBlockId)
        : -1;
      const insertIndex = nativeBlockInsertAfterBlockId ? Math.max(afterBlockIndex + 1, 0) : currentBlocks.length;
      const createdBlock = await createElearningLessonBlock({
        lessonId: activeLesson.id,
        blockType: nativeBlockType,
        title: nativeBlockTitle,
        content: nativeBlockContent,
        videoUrl: nativeBlockType === 'video' ? nativeBlockVideoUrl : undefined,
        options: nativeBlockType === 'video' ? [] : normalizedOptions,
        correctAnswer: nativeBlockType === 'video' ? null : normalizedCorrectAnswer,
        points: nativeBlockType === 'video' ? 0 : 1,
        durationSeconds: nativeBlockType === 'video' ? durationMinutes * 60 : 0,
        isRequired: true,
        sortOrder: currentBlocks.length + 1,
        status: 'published',
      });
      const reorderedBlocks = nativeBlockInsertAfterBlockId
        ? [
          ...currentBlocks.slice(0, insertIndex),
          createdBlock,
          ...currentBlocks.slice(insertIndex),
        ]
        : [...currentBlocks, createdBlock];
      const normalizedBlocks = await updateNativeBlockSortOrders(reorderedBlocks);
      setSelectedLessonBlocks(normalizedBlocks.sort((a, b) => a.sortOrder - b.sortOrder));
      setNativeBlockTitle(`Block ${normalizedBlocks.length + 1}`);
      setNativeBlockInsertAfterBlockId('');
      setNativeBlockVideoUrl('');
      setNativeBlockContent('');
      setNativeBlockCorrectAnswer('');
      await loadData(activeCourseId, activeLesson.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được block native.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateNativeVideoBlocks() {
    if (!activeLesson || activeLesson.lessonType !== 'native_sequence') {
      setErrorMessage('Vui lòng chọn một bài native để tạo block video.');
      return;
    }
    const drafts = parseNativeVimeoBlockDrafts(nativeBulkVimeoLinks);
    if (!drafts.length) {
      setErrorMessage('Vui lòng dán ít nhất một link Vimeo, video ID hoặc iframe embed hợp lệ.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const startOrder = selectedLessonBlocks.length;
      const createdBlocks: ElearningLessonBlock[] = [];
      for (const [index, draft] of drafts.entries()) {
        const createdBlock = await createElearningLessonBlock({
          lessonId: activeLesson.id,
          blockType: 'video',
          title: draft.title,
          content: '',
          videoUrl: draft.videoUrl,
          options: [],
          correctAnswer: null,
          points: 0,
          durationSeconds: durationMinutes * 60,
          isRequired: true,
          sortOrder: startOrder + index + 1,
          status: 'published',
        });
        createdBlocks.push(createdBlock);
      }
      setSelectedLessonBlocks((current) => [...current, ...createdBlocks].sort((a, b) => a.sortOrder - b.sortOrder));
      setNativeBulkVimeoLinks('');
      setNativeBlockTitle(`Block ${startOrder + createdBlocks.length + 1}`);
      pushToast({ title: `Đã tạo ${createdBlocks.length} block video`, tone: 'success' });
      await loadData(activeCourseId, activeLesson.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được block video từ danh sách Vimeo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateNativeQuestionBlocks() {
    if (!activeLesson || activeLesson.lessonType !== 'native_sequence') {
      setErrorMessage('Vui lòng chọn một bài native để thêm câu hỏi.');
      return;
    }
    const selectedQuestions = quizQuestionBank.filter((question) => selectedQuestionLibraryIds.includes(question.id));
    if (!selectedQuestions.length) {
      setErrorMessage('Vui lòng tích ít nhất một câu hỏi trong thư viện Question.');
      return;
    }
    const missingCorrectAnswer = selectedQuestions.find((question) => !question.options.find((option) => option.id === question.correctOptionId));
    if (missingCorrectAnswer) {
      setErrorMessage(`Câu hỏi ${missingCorrectAnswer.code || missingCorrectAnswer.id} chưa có đáp án đúng.`);
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const currentBlocks = [...selectedLessonBlocks].sort((a, b) => a.sortOrder - b.sortOrder);
      const afterBlockIndex = nativeQuestionInsertAfterBlockId
        ? currentBlocks.findIndex((block) => block.id === nativeQuestionInsertAfterBlockId)
        : -1;
      const insertIndex = afterBlockIndex >= 0 ? afterBlockIndex + 1 : currentBlocks.length;
      const createdBlocks: ElearningLessonBlock[] = [];
      for (const [index, question] of selectedQuestions.entries()) {
        const createdBlock = await createElearningLessonBlock(buildNativeQuestionBlockInput(question, currentBlocks.length + index + 1));
        createdBlocks.push(createdBlock);
      }
      const reorderedBlocks = [
        ...currentBlocks.slice(0, insertIndex),
        ...createdBlocks,
        ...currentBlocks.slice(insertIndex),
      ];
      const normalizedBlocks = await updateNativeBlockSortOrders(reorderedBlocks);
      setSelectedLessonBlocks(normalizedBlocks.sort((a, b) => a.sortOrder - b.sortOrder));
      setSelectedQuestionLibraryIds([]);
      setNativeQuestionInsertAfterBlockId('');
      pushToast({ title: `Đã thêm ${createdBlocks.length} câu hỏi vào bài native`, tone: 'success' });
      await loadData(activeCourseId, activeLesson.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thêm được câu hỏi từ thư viện Question.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateScormLesson() {
    if (!scormFile) {
      setErrorMessage('Cần chọn file SCORM .zip.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const scormPackage = await uploadElearningScormPackage({ file: scormFile, createdBy: profile?.id || session?.user?.id || null });
      const title = scormLessonTitle.trim() && scormLessonTitle !== 'Bài SCORM mới' ? scormLessonTitle : scormPackage.title;
      const lesson = await createElearningLesson({
        id: sanitizeElearningId(title),
        title,
        description: scormLessonDescription || `${scormPackage.scormVersion.toUpperCase()} · ${scormPackage.slideCount || 0} slide`,
        lessonType: 'scorm',
        scormPackageId: scormPackage.id,
        completionRule: scormCompletionRule,
        passingScore: scormPassingScore,
        status: 'published',
      });
      setScormLessonTitle('Bài SCORM mới');
      setScormLessonDescription('');
      setScormFile(null);
      await loadData(activeCourseId, lesson.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được bài học SCORM.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePart() {
    if (!activeLesson) {
      setErrorMessage('Cần chọn bài học trước khi thêm phần.');
      return;
    }
    if (activeLesson.lessonType === 'scorm') {
      setErrorMessage('Bài học SCORM là một package đầy đủ, không thêm phần Vimeo vào bài này.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      await createElearningLessonPart({
        lessonId: activeLesson.id,
        title: partTitle,
        content: partContent,
        videoUrl: partVideoUrl,
        durationSeconds: durationMinutes * 60,
        isPreview,
        isRequired: true,
        sortOrder: selectedLessonParts.length + 1,
        status: 'published',
      });
      setPartTitle(`Phần ${selectedLessonParts.length + 2} - Tiêu đề phần`);
      setPartVideoUrl('');
      setPartContent('');
      setIsPreview(false);
      await loadData(activeCourseId, activeLesson.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được phần bài học.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateCourse() {
    if (!courseTitle.trim()) {
      setErrorMessage('Cần nhập tên khóa học.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const course = await createElearningCourse({
        id: sanitizeElearningId(courseTitle),
        title: courseTitle,
        description: courseDescription,
        thumbnailUrl: courseThumbnailUrl,
        finalQuizFormId: courseQuizFormId,
        status: 'draft',
        completionThreshold: 90,
      });
      setCourseTitle('Khóa học ELN mới');
      setCourseDescription('');
      setCourseThumbnailUrl('');
      setCourseQuizFormId('');
      await loadData(course.id, activeLessonId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được khóa học.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddLessonToCourse(lesson: ElearningLesson) {
    if (!activeCourse) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await addLessonToCourse(activeCourse.id, lesson.id, (bundle?.lessons.length || 0) + 1);
      void runOptionalElearningLearnerNotice({
        kind: 'lesson_assigned',
        courseId: activeCourse.id,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        actorProfileId: profile?.id || session?.user?.id || null,
        eventKeySuffix: String(Date.now()),
      });
      await loadData(activeCourse.id, lesson.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không gán được bài học vào khóa.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveLessonFromCourse(lesson: ElearningLesson) {
    if (!activeCourse) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await removeLessonFromCourse(activeCourse.id, lesson.id);
      await loadData(activeCourse.id, activeLessonId === lesson.id ? '' : activeLessonId);
      pushToast({ title: 'Đã gỡ bài giảng khỏi khóa', tone: 'success' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không gỡ được bài giảng khỏi khóa.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemindLearnerGroup(group: ElearningLearnerGroup) {
    const courseId = runCourseId || activeRunCourse?.id || activeCourse?.id || activeCourseId;
    if (!courseId) {
      setErrorMessage('Cần chọn khóa học hoặc đợt học trước khi nhắc học.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const result = await notifyElearningLearners({
        kind: 'study_reminder',
        courseId,
        groupId: group.id,
        actorProfileId: profile?.id || session?.user?.id || null,
        eventKeySuffix: String(Date.now()),
      });
      pushToast({
        title: 'Đã nhắc học',
        message: result.recipientCount ? `Đã gửi thông báo tới ${result.recipientCount} học viên/email.` : 'Nhóm chưa có học viên/email hợp lệ để nhắc.',
        tone: result.recipientCount ? 'success' : 'warning',
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không gửi được thông báo nhắc học.');
    } finally {
      setBusy(false);
    }
  }

  async function handleWizardCreateCourse() {
    await handleCreateCourse();
    setWizardStep(2);
  }

  async function handleWizardCreateLesson() {
    if (wizardMode === 'native') {
      await handleCreateNativeLesson();
    } else {
      await handleCreateScormLesson();
    }
    setWizardStep(3);
  }

  function handleWizardGoToLessonBuilder() {
    setAdminLayer('lesson');
    setWizardStep(2);
    setErrorMessage('');
  }

  function handleWizardGoToQuizBuilder() {
    setAdminLayer('quiz');
    setWizardStep(4);
    setErrorMessage('');
  }

  async function handleWizardAttachLesson() {
    if (!activeLesson) {
      handleWizardGoToLessonBuilder();
      setErrorMessage('Vui lòng tạo hoặc chọn bài giảng trước khi gắn vào khóa.');
      return;
    }
    await handleAddLessonToCourse(activeLesson);
    setWizardStep(4);
  }

  async function handleWizardFinish() {
    if (!activeCourse) {
      setErrorMessage('Vui lòng tạo hoặc chọn khóa học trước khi hoàn thành.');
      return;
    }
    if (!wizardContentReady) {
      setErrorMessage('Vui lòng thêm ít nhất một nội dung bài học hoặc SCORM trước khi hoàn thành.');
      setWizardStep(3);
      return;
    }
    if (!wizardQuizReady) {
      setErrorMessage('Vui lòng gắn đề kiểm tra hoặc chọn bỏ qua để thêm sau.');
      setWizardStep(4);
      return;
    }
    if (selectedCourseQuizFormId && selectedCourseQuizFormId !== activeCourse.finalQuizFormId) {
      await handleUpdateCourseQuiz();
    }
    if (activeCourse.status !== 'published') {
      await toggleCourseStatus(activeCourse);
    }
    setWizardStep(5);
  }

  async function handleCloneLesson(lesson: ElearningLesson) {
    setBusy(true);
    setErrorMessage('');
    try {
      const copy = await cloneElearningLesson(lesson.id);
      setAdminLayer('lesson');
      await loadData(activeCourseId, copy.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không sao chép được bài giảng.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCloneCourse(course: ElearningCourse) {
    setBusy(true);
    setErrorMessage('');
    try {
      const copy = await cloneElearningCourse(course.id);
      setAdminLayer('course');
      await loadData(copy.id, activeLessonId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không sao chép được khóa học.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleCourseStatus(course: ElearningCourse) {
    const nextStatus = course.status === 'published' ? 'draft' : 'published';
    setBusy(true);
    setErrorMessage('');
    try {
      await updateElearningCourseStatus(course.id, nextStatus);
      await loadData(course.id, activeLessonId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không active được khóa học.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateCourseQuiz() {
    if (!activeCourse) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await updateElearningCourseQuiz(activeCourse.id, selectedCourseQuizFormId);
      await loadData(activeCourse.id, activeLessonId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không gán được bài kiểm tra cho khóa học.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateClient() {
    if (!clientName.trim()) {
      setErrorMessage('Cần nhập tên khách hàng.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const client = await createElearningClient({ name: clientName, code: clientCode });
      setClientName('Khách hàng mới');
      setClientCode('');
      setActiveClientId(client.id);
      await loadData(activeCourseId, activeLessonId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được khách hàng.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateProject() {
    const clientId = activeClient?.id || activeClientId;
    if (!clientId) {
      setErrorMessage('Cần tạo hoặc chọn khách hàng trước.');
      return;
    }
    if (!projectName.trim()) {
      setErrorMessage('Cần nhập tên dự án.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const project = await createElearningProject({ clientId, name: projectName, code: projectCode });
      setProjectName('Dự án đào tạo mới');
      setProjectCode('');
      setActiveProjectId(project.id);
      await loadData(activeCourseId, activeLessonId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được dự án đào tạo.');
    } finally {
      setBusy(false);
    }
  }

  function resetClassEditorFields() {
    setClassName('Lớp triển khai mới');
    setClassCode('');
    setClassStartAt('');
    setClassEndAt('');
    setActiveVTrainingClassId('');
  }

  function handlePrepareCreateClass() {
    resetClassEditorFields();
    setClassEditorMode('create');
    setErrorMessage('');
  }

  function handlePrepareEditClass(item: ElearningClass) {
    setActiveClassId(item.id);
    setActiveCourseId(item.courseId);
    setClassName(item.name);
    setClassCode(item.code);
    setClassStartAt(toDatetimeLocal(item.startAt));
    setClassEndAt(toDatetimeLocal(item.endAt));
    setActiveVTrainingClassId(item.trainingClassId);
    setClassEditorMode('edit');
    setErrorMessage('');
  }

  async function handleCreateClass() {
    if (!className.trim()) {
      setErrorMessage('Cần nhập tên lớp triển khai.');
      return;
    }
    let clientId = activeClient?.id || activeClientId || deployment.clients[0]?.id || '';
    let projectId = activeProject?.id || activeProjectId || deployment.projects[0]?.id || '';
    setBusy(true);
    setErrorMessage('');
    try {
      if (!clientId) {
        const client = await createElearningClient({ name: 'VLearning', code: 'VLEARNING' });
        clientId = client.id;
      }
      if (!projectId) {
        const project = await createElearningProject({ clientId, name: 'VLearning default deployment', code: 'VLEARNING-DEFAULT' });
        projectId = project.id;
      }
      const nextClass = await createElearningClass({
        projectId,
        name: className,
        code: classCode,
        startAt: classStartAt,
        endAt: classEndAt,
        completionThreshold: 90,
      });
      setClassName('Lớp triển khai mới');
      setClassCode('');
      setClassStartAt('');
      setClassEndAt('');
      setClassEditorMode('closed');
      setActiveClassId(nextClass.id);
      await loadData(activeCourseId, activeLessonId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được lớp triển khai.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateClassFromVTraining() {
    if (!activeVTrainingClassId || !activeVTrainingClass) {
      setErrorMessage('Cần chọn lớp VTraining trước khi tạo lớp E-learning.');
      return;
    }
    let clientId = activeClient?.id || activeClientId || deployment.clients[0]?.id || '';
    let projectId = activeProject?.id || activeProjectId || deployment.projects[0]?.id || '';
    setBusy(true);
    setErrorMessage('');
    try {
      if (!clientId) {
        const client = await createElearningClient({ name: 'VLearning', code: 'VLEARNING' });
        clientId = client.id;
      }
      if (!projectId) {
        const project = await createElearningProject({ clientId, name: 'VLearning default deployment', code: 'VLEARNING-DEFAULT' });
        projectId = project.id;
      }
      const nextClass = await createElearningClass({
        projectId,
        name: className.trim() || activeVTrainingClass.name,
        code: classCode || activeVTrainingClass.code,
        trainingClassId: activeVTrainingClassId,
        startAt: classStartAt || activeVTrainingClass.startAt || '',
        endAt: classEndAt || activeVTrainingClass.endAt || '',
        completionThreshold: 90,
      });
      const result = await syncVTrainingRosterToElearningClass({
        classId: nextClass.id,
        clientId,
        trainingClassId: activeVTrainingClassId,
        syncedBy: profile?.id || session?.user?.id || null,
      });
      setClassEditorMode('closed');
      resetClassEditorFields();
      setActiveClassId(nextClass.id);
      await loadData(activeCourseId, activeLessonId);
      pushToast({
        title: 'Đã tạo lớp từ VTraining',
        message: result.skipped
          ? `Đã đồng bộ ${result.synced} học viên, bỏ qua ${result.skipped} học viên chưa có email.`
          : `Đã đồng bộ ${result.synced} học viên vào roster lớp.`,
        tone: result.skipped ? 'warning' : 'success',
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được lớp từ VTraining.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveClassEdit() {
    if (!activeClassId) return;
    if (!className.trim()) {
      setErrorMessage('Cần nhập tên lớp học.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      await updateElearningClass(activeClassId, {
        courseId: '',
        name: className,
        code: classCode,
        trainingClassId: activeVTrainingClassId,
        startAt: classStartAt,
        endAt: classEndAt,
        completionThreshold: 90,
        finalQuizFormId: '',
      });
      setClassEditorMode('closed');
      resetClassEditorFields();
      await loadData(activeCourseId, activeLessonId);
      pushToast({ title: 'Đã lưu lớp học', tone: 'success' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không lưu được lớp học.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteClass(item: ElearningClass) {
    if (!window.confirm(`Xóa lớp "${item.name}" và các gán học viên liên quan?`)) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await deleteElearningClass(item.id);
      if (activeClassId === item.id) setActiveClassId('');
      if (classEditorMode === 'edit') {
        setClassEditorMode('closed');
        resetClassEditorFields();
      }
      await loadData(activeCourseId, activeLessonId);
      pushToast({ title: 'Đã xóa lớp học', tone: 'success' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không xóa được lớp học.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignVTrainingClass() {
    let clientId = activeClient?.id || activeClientId || deployment.clients[0]?.id || '';
    let projectId = activeProject?.id || activeProjectId || deployment.projects[0]?.id || '';
    const courseId = activeCourse?.id || activeCourseId;
    if (!courseId || !activeVTrainingClassId) {
      setErrorMessage('Cần chọn khóa học và lớp VTraining trước khi gán.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      if (!clientId) {
        const client = await createElearningClient({ name: 'VLearning', code: 'VLEARNING' });
        clientId = client.id;
      }
      if (!projectId) {
        const project = await createElearningProject({ clientId, name: 'VLearning default deployment', code: 'VLEARNING-DEFAULT' });
        projectId = project.id;
      }
      const result = await assignVTrainingClassToElearningCourse({
        clientId,
        projectId,
        courseId,
        trainingClassId: activeVTrainingClassId,
        completionThreshold: activeCourse?.completionThreshold || 90,
        finalQuizFormId: activeCourse?.finalQuizFormId || '',
        assignedBy: profile?.id || session?.user?.id || null,
      });
      setActiveClassId(result.classId);
      void runOptionalElearningLearnerNotice({
        kind: 'course_assigned',
        courseId,
        classId: result.classId,
        actorProfileId: profile?.id || session?.user?.id || null,
        eventKeySuffix: String(Date.now()),
      });
      await loadData(courseId, activeLessonId);
      pushToast({
        title: 'Đã gán lớp VTraining',
        message: result.skipped
          ? `Đã đồng bộ ${result.enrolled} học viên, gỡ ${result.removed}, bỏ qua ${result.skipped} học viên chưa có email.`
          : `Đã đồng bộ ${result.enrolled} học viên vào khóa VLearning, gỡ ${result.removed}.`,
        tone: result.skipped || result.removed ? 'warning' : 'success',
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không gán được lớp VTraining vào VLearning.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncActiveVTrainingClass(target?: ElearningClass) {
    const targetClass = target || activeClass;
    let clientId = activeClient?.id || activeClientId || deployment.clients[0]?.id || '';
    let projectId = activeProject?.id || activeProjectId || targetClass?.projectId || deployment.projects[0]?.id || '';
    const courseId = targetClass?.courseId || activeCourseId;
    const trainingClassId = targetClass?.trainingClassId || activeVTrainingClassId;
    if (!targetClass?.trainingClassId && !trainingClassId) {
      setErrorMessage('Lớp đang chọn chưa liên kết lớp VTraining.');
      return;
    }
    if (!trainingClassId) {
      setErrorMessage('Cần chọn lớp VTraining trước khi đồng bộ.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      if (!clientId) {
        const client = await createElearningClient({ name: 'VLearning', code: 'VLEARNING' });
        clientId = client.id;
      }
      if (!projectId) {
        const project = await createElearningProject({ clientId, name: 'VLearning default deployment', code: 'VLEARNING-DEFAULT' });
        projectId = project.id;
      }
      if (!courseId && targetClass?.id) {
        const rosterResult = await syncVTrainingRosterToElearningClass({
          classId: targetClass.id,
          clientId,
          trainingClassId,
          syncedBy: profile?.id || session?.user?.id || null,
        });
        await loadData(activeCourseId, activeLessonId);
        pushToast({
          title: 'Đã đồng bộ roster VTraining',
          message: `Roster hiện có ${rosterResult.synced} học viên hợp lệ, bỏ qua ${rosterResult.skipped} học viên thiếu email.`,
          tone: rosterResult.skipped ? 'warning' : 'success',
        });
        return;
      }
      if (!courseId) {
        setErrorMessage('Cần chọn khóa học nếu muốn đồng bộ thành ghi danh học.');
        return;
      }
      const result = await assignVTrainingClassToElearningCourse({
        clientId,
        projectId,
        courseId,
        trainingClassId,
        completionThreshold: activeCourse?.completionThreshold || 90,
        finalQuizFormId: activeCourse?.finalQuizFormId || '',
        assignedBy: profile?.id || session?.user?.id || null,
      });
      setActiveClassId(result.classId);
      await loadData(courseId, activeLessonId);
      pushToast({
        title: 'Đã đồng bộ lại từ VTraining',
        message: `Roster hiện có ${result.enrolled} học viên hợp lệ, gỡ ${result.removed}, bỏ qua ${result.skipped} học viên thiếu email.`,
        tone: result.removed || result.skipped ? 'warning' : 'success',
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không đồng bộ được lớp VTraining.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveEnrollment(enrollmentId: string) {
    if (!activeClass) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await removeElearningEnrollmentFromClass(enrollmentId, profile?.id || session?.user?.id || null);
      await loadData(activeClass.courseId, activeLessonId);
      pushToast({ title: 'Đã gỡ khỏi khóa VLearning', message: 'Học viên vẫn còn trong roster VTraining nếu lớp nguồn chưa thay đổi.', tone: 'success' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không gỡ được học viên khỏi khóa VLearning.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveClassRosterStudent(studentId: string, enrollmentId?: string | null) {
    if (!activeClass) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await removeElearningClassStudentFromClass(activeClass.id, studentId, profile?.id || session?.user?.id || null);
      if (enrollmentId) {
        await removeElearningEnrollmentFromClass(enrollmentId, profile?.id || session?.user?.id || null);
      }
      await loadData(activeClass.courseId, activeLessonId);
      pushToast({ title: 'Đã gỡ học viên khỏi lớp', message: 'Học viên không bị xóa khỏi hồ sơ nguồn VTraining.', tone: 'success' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không gỡ được học viên khỏi lớp.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePreviewStudentImport(file: File | null) {
    if (!file) return;
    setImportFileName(file.name);
    const text = await file.text();
    const rows = parseElearningStudentImport(text, deployment.students.filter((student) => student.clientId === activeClient?.id));
    setImportRows(rows);
  }

  async function handleImportStudents() {
    if (!activeClient || !activeClass) {
      setErrorMessage('Cần chọn khách hàng và lớp triển khai trước khi import học viên.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      await importElearningStudentsToClass({
        clientId: activeClient.id,
        classId: activeClass.id,
        courseId: activeClass.courseId,
        fileName: importFileName,
        importedBy: profile?.id || session?.user?.id || null,
        rows: importRows,
      });
      setImportRows([]);
      setImportFileName('');
      await loadData(activeClass.courseId, activeLessonId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không import được học viên.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateLearnerGroup() {
    const clientId = activeClient?.id || activeClientId || 'default';
    if (!learnerGroupName.trim()) {
      setErrorMessage('Cần nhập tên nhóm học viên.');
      return;
    }
    if (!learnerGroupEmailText.trim()) {
      setErrorMessage('Cần dán danh sách email học viên.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const group = await createElearningLearnerGroup({
        clientId,
        name: learnerGroupName,
        description: learnerGroupDescription,
        emailText: learnerGroupEmailText,
      });
      setActiveLearnerGroupId(group.id);
      setLearnerGroupName('Nhóm học viên mới');
      setLearnerGroupDescription('');
      setLearnerGroupEmailText('');
      setLearnerGroupEditorMode('closed');
      await loadData(activeCourseId, activeLessonId);
      pushToast({ title: 'Đã tạo nhóm học viên', message: `${group.emails.length} email trong nhóm.`, tone: 'success' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được nhóm học viên.');
    } finally {
      setBusy(false);
    }
  }

  function handleEditLearnerGroup(group: ElearningLearnerGroup) {
    setActiveLearnerGroupId(group.id);
    setLearnerGroupEditorMode('edit');
    setEditingLearnerGroupId(group.id);
    setEditingLearnerGroupName(group.name);
    setEditingLearnerGroupDescription(group.description);
    setEditingLearnerGroupEmailText(group.emails.join('\n'));
  }

  function handleCancelEditLearnerGroup() {
    setLearnerGroupEditorMode('closed');
    setEditingLearnerGroupId('');
    setEditingLearnerGroupName('');
    setEditingLearnerGroupDescription('');
    setEditingLearnerGroupEmailText('');
  }

  async function handleUpdateLearnerGroup() {
    if (!editingLearnerGroupId) return;
    if (!editingLearnerGroupName.trim()) {
      setErrorMessage('Cần nhập tên nhóm học viên.');
      return;
    }
    if (!editingLearnerGroupEmailText.trim()) {
      setErrorMessage('Cần dán danh sách email học viên.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const group = await updateElearningLearnerGroup({
        groupId: editingLearnerGroupId,
        name: editingLearnerGroupName,
        description: editingLearnerGroupDescription,
        emailText: editingLearnerGroupEmailText,
      });
      setActiveLearnerGroupId(group.id);
      handleCancelEditLearnerGroup();
      await loadData(activeCourseId, activeLessonId);
      pushToast({ title: 'Đã lưu nhóm học viên', message: `${group.emails.length} email trong nhóm.`, tone: 'success' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không lưu được nhóm học viên.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteLearnerGroup(groupId: string) {
    if (!window.confirm('Xóa nhóm học viên này khỏi thư viện?')) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await deleteElearningLearnerGroup(groupId);
      setActiveLearnerGroupId('');
      if (editingLearnerGroupId === groupId) handleCancelEditLearnerGroup();
      if (learnerGroupEditorMode === 'create') setLearnerGroupEditorMode('closed');
      await loadData(activeCourseId, activeLessonId);
      pushToast({ title: 'Đã xóa nhóm học viên', tone: 'success' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không xóa được nhóm học viên.');
    } finally {
      setBusy(false);
    }
  }

  function resetRunEditorFields() {
    setRunName('Đợt học mới');
    setRunCode('');
    setRunCourseId(activeCourse?.id || activeCourseId || courses[0]?.id || '');
    setRunAudienceType('class');
    setRunClassId(activeRosterClass?.id || rosterClasses[0]?.id || '');
    setRunTargetClassIds(activeRosterClass?.id ? [activeRosterClass.id] : rosterClasses[0]?.id ? [rosterClasses[0].id] : []);
    setRunTargetGroupIds([]);
    setRunVTrainingClassId('');
    setRunLearnerGroupId(activeLearnerGroupId || deployment.learnerGroups[0]?.id || '');
    setRunStartAt('');
    setRunEndAt('');
  }

  function handlePrepareCreateLearningRun() {
    resetRunEditorFields();
    setRunEditorMode('create');
    setErrorMessage('');
  }

  function toggleRunTargetClass(classId: string) {
    setRunTargetClassIds((current) => (
      current.includes(classId) ? current.filter((id) => id !== classId) : [...current, classId]
    ));
    setRunAudienceType('class');
    setRunClassId((current) => current || classId);
  }

  function toggleRunTargetGroup(groupId: string) {
    setRunTargetGroupIds((current) => (
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    ));
    setRunAudienceType('group');
    setRunLearnerGroupId((current) => current || groupId);
  }

  function handlePrepareAssignLearnerGroupToRun(group: ElearningLearnerGroup) {
    const courseId = activeCourse?.id || activeCourseId || runCourseId || courses[0]?.id || '';
    const selectedCourse = courses.find((course) => course.id === courseId);
    setActiveLearnerGroupId(group.id);
    setRunName(selectedCourse ? `${group.name} - ${selectedCourse.title}` : group.name);
    setRunCode('');
    setRunCourseId(courseId);
    setRunAudienceType('group');
    setRunClassId('');
    setRunTargetClassIds([]);
    setRunTargetGroupIds([group.id]);
    setRunVTrainingClassId('');
    setRunLearnerGroupId(group.id);
    setRunStartAt('');
    setRunEndAt('');
    setRunEditorMode('create');
    setErrorMessage('');
    setDeploymentLayer('runs');
    navigate(getDeploymentLayerRoute('runs'));
  }

  function handlePrepareEditLearningRun(item: ElearningClass) {
    const activeTargets = deployment.runTargets.filter((target) => target.runClassId === item.id && target.status === 'active');
    const targetClassIds = activeTargets.filter((target) => target.targetType === 'class').map((target) => target.targetId);
    const targetGroupIds = activeTargets.filter((target) => target.targetType === 'group').map((target) => target.targetId);
    const learnerGroupIds = deployment.enrollments
      .filter((enrollment) => enrollment.classId === item.id)
      .map((enrollment) => String(enrollment.metadata?.learnerGroupId || ''))
      .filter(Boolean);
    const learnerGroupId = targetGroupIds[0] || learnerGroupIds[0] || '';
    const sourceClassIds = deployment.enrollments
      .filter((enrollment) => enrollment.classId === item.id)
      .map((enrollment) => String(enrollment.metadata?.sourceClassId || ''))
      .filter(Boolean);
    const sourceClassId = targetClassIds[0] || sourceClassIds[0] || rosterClasses.find((classItem) => classItem.trainingClassId && classItem.trainingClassId === item.trainingClassId)?.id || '';
    const nextClassTargets = Array.from(new Set(targetClassIds.length ? targetClassIds : sourceClassId ? [sourceClassId] : []));
    const nextGroupTargets = Array.from(new Set(targetGroupIds.length ? targetGroupIds : learnerGroupId ? [learnerGroupId] : []));
    setActiveClassId(item.id);
    setRunName(item.name);
    setRunCode(item.code);
    setRunCourseId(item.courseId);
    setRunAudienceType(sourceClassId ? 'class' : 'group');
    setRunClassId(sourceClassId);
    setRunTargetClassIds(nextClassTargets);
    setRunTargetGroupIds(nextGroupTargets);
    setRunVTrainingClassId(item.trainingClassId);
    setRunLearnerGroupId(learnerGroupId);
    setRunStartAt(toDatetimeLocal(item.startAt));
    setRunEndAt(toDatetimeLocal(item.endAt));
    setRunEditorMode('edit');
    setErrorMessage('');
  }

  async function handleCreateLearningRun() {
    const courseId = runCourseId || activeRunCourse?.id || activeCourseId;
    let projectId = activeProject?.id || activeProjectId || deployment.projects[0]?.id || '';
    let clientId = activeClient?.id || activeClientId || deployment.clients[0]?.id || '';
    if (!courseId) {
      setErrorMessage('Cần chọn khóa học cho đợt học.');
      return;
    }
    if (!runName.trim()) {
      setErrorMessage('Cần nhập tên đợt học.');
      return;
    }
    if (runAudienceType === 'class' && !runClassId) {
      setErrorMessage('Cần chọn lớp học cho đợt học.');
      return;
    }
    if (runAudienceType === 'group' && !runLearnerGroupId) {
      setErrorMessage('Cần chọn nhóm học viên cho đợt học.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      if (!clientId) {
        const client = await createElearningClient({ name: 'VLearning', code: 'VLEARNING' });
        clientId = client.id;
      }
      if (!projectId) {
        const project = await createElearningProject({ clientId, name: 'VLearning default deployment', code: 'VLEARNING-DEFAULT' });
        projectId = project.id;
      }
      const selectedCourse = courses.find((course) => course.id === courseId) || activeCourse;
      const selectedRosterClass = rosterClasses.find((item) => item.id === runTargetClassIds[0] || item.id === runClassId) || null;
      const nextRun = await createElearningClass({
        projectId,
        courseId,
        name: runName,
        code: runCode,
        trainingClassId: selectedRosterClass?.trainingClassId || '',
        startAt: runStartAt,
        endAt: runEndAt,
        completionThreshold: selectedCourse?.completionThreshold || 90,
        finalQuizFormId: selectedCourse?.finalQuizFormId || '',
      });

      let assignedCount = 0;
      let unresolvedCount = 0;
      const result = await assignElearningTargetsToLearningRun({
        runClassId: nextRun.id,
        courseId,
        targets: [
          ...runTargetClassIds.map((targetId) => ({ targetType: 'class' as const, targetId })),
          ...runTargetGroupIds.map((targetId) => ({ targetType: 'group' as const, targetId })),
        ],
      });
      assignedCount = result.assigned;
      unresolvedCount = result.unresolved;

      setActiveClassId(nextRun.id);
      setActiveCourseId(courseId);
      void runOptionalElearningLearnerNotice({
        kind: 'course_assigned',
        courseId,
        classId: nextRun.id,
        groupId: runTargetGroupIds[0] || undefined,
        actorProfileId: profile?.id || session?.user?.id || null,
        eventKeySuffix: String(Date.now()),
      });
      setRunName('Đợt học mới');
      setRunCode('');
      setRunStartAt('');
      setRunEndAt('');
      setRunEditorMode('closed');
      await loadData(courseId, activeLessonId);
      pushToast({
        title: 'Đã tạo đợt học',
        message: unresolvedCount
          ? `Đã gán ${assignedCount} học viên, còn ${unresolvedCount} học viên/email chưa đủ dữ liệu.`
          : `Đã gán ${assignedCount} học viên vào đợt học.`,
        tone: unresolvedCount ? 'warning' : 'success',
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được đợt học.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveLearningRunEdit() {
    if (!activeClassId) return;
    const courseId = runCourseId || activeRunCourse?.id || activeCourseId;
    if (!courseId) {
      setErrorMessage('Cần chọn khóa học cho đợt học.');
      return;
    }
    if (!runName.trim()) {
      setErrorMessage('Cần nhập tên đợt học.');
      return;
    }
    if (runAudienceType === 'class' && !runClassId) {
      setErrorMessage('Cần chọn lớp học cho đợt học.');
      return;
    }
    if (runAudienceType === 'group' && !runLearnerGroupId) {
      setErrorMessage('Cần chọn nhóm học viên cho đợt học.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const selectedCourse = courses.find((course) => course.id === courseId) || activeCourse;
      const selectedRosterClass = rosterClasses.find((item) => item.id === runTargetClassIds[0] || item.id === runClassId) || null;
      await updateElearningClass(activeClassId, {
        courseId,
        name: runName,
        code: runCode,
        trainingClassId: selectedRosterClass?.trainingClassId || '',
        startAt: runStartAt,
        endAt: runEndAt,
        completionThreshold: selectedCourse?.completionThreshold || 90,
        finalQuizFormId: selectedCourse?.finalQuizFormId || '',
      });
      await assignElearningTargetsToLearningRun({
        runClassId: activeClassId,
        courseId,
        targets: [
          ...runTargetClassIds.map((targetId) => ({ targetType: 'class' as const, targetId })),
          ...runTargetGroupIds.map((targetId) => ({ targetType: 'group' as const, targetId })),
        ],
      });
      void runOptionalElearningLearnerNotice({
        kind: 'course_assigned',
        courseId,
        classId: activeClassId,
        groupId: runTargetGroupIds[0] || undefined,
        actorProfileId: profile?.id || session?.user?.id || null,
        eventKeySuffix: String(Date.now()),
      });
      setRunEditorMode('closed');
      resetRunEditorFields();
      await loadData(courseId, activeLessonId);
      pushToast({ title: 'Đã lưu đợt học', tone: 'success' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không lưu được đợt học.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteLearningRun(item: ElearningClass) {
    if (!window.confirm(`Xóa đợt học "${item.name}" và các gán học viên liên quan?`)) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await deleteElearningClass(item.id);
      if (activeClassId === item.id) setActiveClassId('');
      if (runEditorMode === 'edit') {
        setRunEditorMode('closed');
        resetRunEditorFields();
      }
      await loadData(activeCourseId, activeLessonId);
      pushToast({ title: 'Đã xóa đợt học', tone: 'success' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không xóa được đợt học.');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleClassStatus(targetClass: ElearningClass) {
    const nextStatus = targetClass.status === 'open' ? 'paused' : 'open';
    setBusy(true);
    setErrorMessage('');
    try {
      await updateElearningClassStatus(targetClass.id, nextStatus);
      await loadData(targetClass.courseId, activeLessonId);
      pushToast({ title: nextStatus === 'open' ? 'Đã active đợt học' : 'Đã tạm dừng đợt học', tone: 'success' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không cập nhật được trạng thái đợt học.');
    } finally {
      setBusy(false);
    }
  }

  async function handleExportClassReport() {
    const XLSX = await import('xlsx');
    const rows = classReportRows.map((row) => ({
      'Họ tên': row.student.fullName,
      Email: row.student.email,
      'Mã nhân viên': row.student.employeeCode,
      'Lớp / Nhóm học viên': getReportAudienceLabel(row, deployment),
      'Chức danh': row.student.position,
      'Trạng thái học': getLearningStatusLabel(row.result.finalStatus),
      'Tiến độ': row.result.progressPercent,
      'Điểm': row.result.quizScore ?? row.result.scormScore ?? '',
      'Hoàn thành lúc': row.result.completedAt || '',
      'Nguồn học viên': getLearnerSourceLabel(row.sourceStatus),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'KetQuaHoc');
    XLSX.writeFile(workbook, `${activeClass?.code || 'bao-cao-vlearning'}.xlsx`);
  }

  function openCourseManagement(course: ElearningCourse) {
    setActiveCourseId(course.id);
    navigate(`/vlearning/admin/library/courses/${encodeURIComponent(course.id)}`);
  }

  function handleSelectManagedCourse(courseId: string) {
    setActiveCourseId(courseId);
    if (courseId) navigate(`/vlearning/admin/library/courses/${encodeURIComponent(courseId)}`);
  }

  if (!canManage) {
    const publishedCourses = courses.filter((course) => course.status === 'published');
    const completedCourseCount = activeCourse && completionPercent >= activeCourse.completionThreshold ? 1 : 0;
    const learnerName = profile?.fullName || session?.user?.email || 'Học viên';
    const learnerProfileCode = profile?.id || session?.user?.id || 'Chưa liên kết';
    return (
      <>
        <section className="elearning-learner-portal" aria-label="Cổng học viên VLearning">
          <div className="elearning-learner-welcome">
            <div>
              <span className="section-eye">Cổng học viên · Learner Portal</span>
              <h1>Chào mừng trở lại, {learnerName}</h1>
              <p>Hồ sơ liên kết: <strong>{learnerProfileCode}</strong></p>
            </div>
            <div className="elearning-learner-summary" aria-label="Tóm tắt học tập">
              <div>
                <span>Khóa học tham gia</span>
                <strong>{publishedCourses.length}</strong>
              </div>
              <div>
                <span>Đã hoàn thành</span>
                <strong>{completedCourseCount}</strong>
              </div>
              <div>
                <span>Hồ sơ</span>
                <strong>{profile?.id ? 'Đã nối' : 'Chưa nối'}</strong>
              </div>
            </div>
          </div>

          {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

          <div className="elearning-student-grid">
            {publishedCourses.map((course, index) => {
              const progress = activeCourse?.id === course.id ? completionPercent : 0;
              const durationHint = Math.max(45, course.lessonCount * 55);
              return (
                <article className="elearning-student-course" key={course.id}>
                  <div
                    className={`elearning-student-course-thumb tone-${index % 3}`}
                    style={course.thumbnailUrl ? { backgroundImage: `url("${course.thumbnailUrl}")` } : undefined}
                    aria-hidden="true"
                  >
                    <span>{course.status === 'published' ? 'Đang học' : course.status}</span>
                    <strong>{course.id.slice(0, 2).toUpperCase()}</strong>
                  </div>
                  <div className="elearning-student-course-body">
                    <div className="section-eye">E-learning</div>
                    <h3>{course.title}</h3>
                    <p>{course.description || 'Khóa học video trực tuyến.'}</p>
                    <div className="elearning-student-progress">
                      <div>
                        <span>Tiến độ: {Math.round(progress)}%</span>
                        <strong>{course.lessonCount} bài học</strong>
                      </div>
                      <div className="elearning-student-progress-bar" aria-hidden="true">
                        <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
                      </div>
                    </div>
                    <div className="elearning-student-course-meta">
                      <span>{Math.floor(durationHint / 60)} giờ {durationHint % 60} phút</span>
                      <span>Ngưỡng {course.completionThreshold}%</span>
                    </div>
                    <div className="action-row">
                      <Link className="btn btn-primary" to={`/vlearning/${course.id}`}>Vào học</Link>
                      <button className="btn btn-ghost" onClick={() => void navigator.clipboard.writeText(buildCourseLearnLink(course.id))}>
                        Copy link
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
            {!publishedCourses.length && !busy ? (
              <Card title="Chưa có khóa học">
                <div className="muted-text">Hiện chưa có khóa e-learning nào đang mở cho học viên.</div>
              </Card>
            ) : null}
          </div>
        </section>
      </>
    );
  }

  if (!managerCourseId) {
    return (
      <>
        <section className="elearning-console-head" aria-label="Không gian quản trị VLearning">
          <div>
            <span><strong>VLearning</strong> / Quản trị & Manager</span>
            <h1>Quản trị V-Learning</h1>
          </div>
          <span>VINABRAIN VLEARNING ADMIN SPACE V3.0</span>
        </section>

        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

        <section className="elearning-layer-console">
          <nav className="elearning-layer-nav" aria-label="Điều hướng quản trị VLearning">
            {ELEARNING_ADMIN_LAYERS.map((layer) => {
              const Icon = layer.icon;
              return (
                <button
                  className={activeAdminNavLayer === layer.id ? 'is-active' : ''}
                  key={layer.id}
                  type="button"
                  onClick={() => {
                    setAdminLayer(layer.id);
                    navigate(getAdminLayerRoute(layer.id));
                  }}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{layer.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="elearning-layer-body">
            {effectiveAdminLayer === 'library' ? (
              <div className="elearning-layer-grid">
                {effectiveLibraryView === 'index' ? (
                <Card
                  title={getLibraryLayerTitle(effectiveLibraryLayer)}
                  action={(
                    <button
                      className="btn btn-primary btn-small"
                      type="button"
                      onClick={() => {
                        if (effectiveLibraryLayer === 'lesson') {
                          setAdminLayer('lesson');
                          setWizardStep(1);
                          navigate('/vlearning/admin?layer=lesson');
                          return;
                        }
                        if (effectiveLibraryLayer === 'course') {
                          setAdminLayer('course');
                          navigate('/vlearning/admin?layer=course');
                          return;
                        }
                        if (effectiveLibraryLayer === 'quiz') {
                          void handleCreateLibraryQuiz();
                          return;
                        }
                        if (effectiveLibraryLayer === 'question') {
                          void handleCreateLibraryQuestionSet();
                        }
                      }}
                    >
                      {getLibraryLayerActionLabel(effectiveLibraryLayer)}
                    </button>
                  )}
                >
                  <div className="stack compact">
                    {effectiveLibraryLayer === 'course' ? (
                      <>
                        <div className="production-plan-filter-grid vsurvey-table-filters">
                          <label>
                            <span>Trạng thái</span>
                            <select value={courseStatusFilter} onChange={(event) => setCourseStatusFilter(event.target.value as typeof courseStatusFilter)}>
                              <option value="all">Tất cả</option>
                              <option value="published">Đang active</option>
                              <option value="draft">Bản nháp</option>
                              <option value="closed">Đã đóng</option>
                            </select>
                          </label>
                          <label>
                            <span>Tìm khóa học</span>
                            <input value={courseKeyword} onChange={(event) => setCourseKeyword(event.target.value)} placeholder="Mã, tên khóa, mô tả" />
                          </label>
                          <div className="vsurvey-table-meta">Hiển thị {filteredCourses.length} khóa học</div>
                        </div>
                        <div className="production-plan-table-wrap production-plan-glass-panel">
                          <table className="data-table production-plan-table production-plan-table-compact production-plan-table-corporate elearning-courses-table">
                            <thead>
                              <tr>
                                <th>Thumbnail</th>
                                <th>Mã khóa</th>
                                <th>Tên khóa học</th>
                                <th>Cấu trúc</th>
                                <th>Lớp</th>
                                <th>Ngưỡng</th>
                                <th>Bài kiểm tra</th>
                                <th>Trạng thái</th>
                                <th>Thao tác</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredCourses.map((course) => {
                                const courseClassCount = learningRuns.filter((item) => item.courseId === course.id).length;
                                return (
                                  <tr className={activeCourse?.id === course.id ? 'is-active' : ''} key={course.id} onClick={() => openCourseDetail(course.id)}>
                                    <td>
                                      <div
                                        className={`elearning-course-thumb${course.thumbnailUrl ? ' has-image' : ''}`}
                                        style={course.thumbnailUrl ? { backgroundImage: `url("${course.thumbnailUrl}")` } : undefined}
                                        aria-label={`Thumbnail ${course.title}`}
                                      >
                                        {!course.thumbnailUrl ? 'IMG' : null}
                                      </div>
                                    </td>
                                    <td>
                                      <div className="fw6 text-ellipsis">{course.id}</div>
                                      <div className="muted-text">{course.createdAt ? formatDateOnly(course.createdAt) : '-'}</div>
                                    </td>
                                    <td className="production-plan-col-product-name">
                                      <div className="fw6">{course.title}</div>
                                      <div className="muted-text text-ellipsis">{course.description || 'Chưa có mô tả khóa học.'}</div>
                                    </td>
                                    <td>{course.lessonCount} bài</td>
                                    <td>{courseClassCount}</td>
                                    <td>{course.completionThreshold}%</td>
                                    <td>{course.finalQuizFormId ? 'Đã gắn' : 'Chưa gắn'}</td>
                                    <td><Badge tone={getCourseStatusTone(course.status)}>{getCourseStatusLabel(course.status)}</Badge></td>
                                    <td>
                                      <button className="btn btn-ghost btn-small" type="button" onClick={(event) => { event.stopPropagation(); openCourseDetail(course.id); }}>
                                        Chi tiết
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                              {!filteredCourses.length ? (
                                <tr>
                                  <td colSpan={9}><div className="muted-text">Không có khóa học khớp bộ lọc.</div></td>
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : null}

                    {effectiveLibraryLayer === 'lesson' ? (
                      <div className="production-plan-table-wrap production-plan-glass-panel">
                        <table className="data-table production-plan-table production-plan-table-compact production-plan-table-corporate elearning-lessons-table">
                          <thead>
                            <tr>
                              <th>Bài giảng</th>
                              <th>Loại</th>
                              <th>Nội dung</th>
                              <th>Trạng thái</th>
                              <th>Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lessonLibrary.map((lesson) => (
                              <tr className={activeLesson?.id === lesson.id ? 'is-active' : ''} key={lesson.id} onClick={() => openLessonDetail(lesson.id)}>
                                <td>
                                  <strong>{lesson.title}</strong>
                                  <div className="muted-text text-ellipsis">{lesson.description || 'Chưa có mô tả bài học.'}</div>
                                </td>
                                <td>{lesson.lessonType === 'scorm' ? 'SCORM/iSpring' : lesson.lessonType === 'native_sequence' ? 'Native Builder' : 'Vimeo'}</td>
                                <td>{lesson.partCount} phần</td>
                                <td><Badge tone={lesson.status === 'published' ? 'success' : 'neutral'}>{lesson.status}</Badge></td>
                                <td>
                                  <div className="action-row compact-actions">
                                    <button className="btn btn-ghost btn-small" type="button" onClick={(event) => { event.stopPropagation(); openLessonDetail(lesson.id); }} title="Sửa bài giảng">
                                      <Pencil size={16} aria-hidden="true" />
                                    </button>
                                    <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); void handleDeleteLesson(lesson); }} title="Xóa bài giảng">
                                      <Trash2 size={16} aria-hidden="true" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {!lessonLibrary.length ? <tr><td colSpan={5}><div className="muted-text">Chưa có bài giảng trong thư viện.</div></td></tr> : null}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    {effectiveLibraryLayer === 'quiz' ? (
                      <div className="production-plan-table-wrap production-plan-glass-panel">
                        <table className="data-table production-plan-table production-plan-table-compact production-plan-table-corporate elearning-quizzes-table">
                          <thead>
                            <tr>
                              <th>Đề kiểm tra</th>
                              <th>Bộ câu hỏi</th>
                              <th>Cấu hình</th>
                              <th>Trạng thái</th>
                              <th>Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {quizForms.map((form) => {
                              const questionSet = quizQuestionSets.find((set) => set.id === form.questionSetId);
                              return (
                                <tr className={activeQuizForm?.id === form.id ? 'is-active' : ''} key={form.id} onClick={() => openQuizDetail(form.id)}>
                                  <td><strong>{form.title}</strong><div className="muted-text text-ellipsis">{form.intro || form.id}</div></td>
                                  <td>{questionSet?.name || form.questionSetId || '-'}</td>
                                  <td>Chọn {form.questionCount} câu · {form.durationMinutes} phút · {form.maxAttempts} lượt</td>
                                  <td><Badge tone={form.status === 'active' ? 'success' : 'warning'}>{form.status}</Badge></td>
                                  <td>
                                    <div className="action-row compact-actions">
                                      <button className="btn btn-ghost btn-small" type="button" onClick={(event) => { event.stopPropagation(); openQuizDetail(form.id); }} title="Sửa đề kiểm tra">
                                        <Pencil size={16} aria-hidden="true" />
                                      </button>
                                      <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); void handleDeleteLibraryQuiz(form); }} title="Xóa đề kiểm tra">
                                        <Trash2 size={16} aria-hidden="true" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {!quizForms.length ? <tr><td colSpan={5}><div className="muted-text">Chưa có đề kiểm tra.</div></td></tr> : null}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    {effectiveLibraryLayer === 'question' ? (
                      <div className="production-plan-table-wrap production-plan-glass-panel">
                        <table className="data-table production-plan-table production-plan-table-compact production-plan-table-corporate elearning-question-sets-table">
                          <thead>
                            <tr>
                              <th>Bộ câu hỏi</th>
                              <th>Số câu</th>
                              <th>Mô tả</th>
                              <th>Trạng thái</th>
                              <th>Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {quizQuestionSets.map((set) => (
                              <tr className={activeQuestionSet?.id === set.id ? 'is-active' : ''} key={set.id} onClick={() => openQuestionDetail(set.id)}>
                                <td><strong>{set.name}</strong><div className="muted-text text-ellipsis">{set.id}</div></td>
                                <td>{set.questionCount} câu</td>
                                <td className="text-ellipsis">{set.description || 'Chưa có mô tả bộ câu hỏi.'}</td>
                                <td><Badge tone={set.status === 'active' ? 'success' : 'neutral'}>{set.status}</Badge></td>
                                <td>
                                  <div className="action-row compact-actions">
                                    <button className="btn btn-ghost btn-small" type="button" onClick={(event) => { event.stopPropagation(); openQuestionDetail(set.id); }} title="Sửa bộ câu hỏi">
                                      <Pencil size={16} aria-hidden="true" />
                                    </button>
                                    <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); void handleDeleteLibraryQuestionSet(set); }} title="Xóa bộ câu hỏi">
                                      <Trash2 size={16} aria-hidden="true" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {!quizQuestionSets.length ? <tr><td colSpan={5}><div className="muted-text">Chưa có bộ câu hỏi.</div></td></tr> : null}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                </Card>
                ) : null}

                {effectiveLibraryView === 'detail' || effectiveLibraryView === 'create' ? (
                <Card title="Chi tiết tài sản">
                  <div className="action-row">
                    <button className="btn btn-ghost btn-small" type="button" onClick={() => { setLibraryView('index'); navigate(getLibraryLayerRoute(effectiveLibraryLayer)); }}>Quay lại thư viện</button>
                  </div>
                  {effectiveLibraryLayer === 'lesson' && activeLesson ? (
                    <div className="stack compact">
                      <SectionHeader eye="Bài giảng" title={activeLesson.title} subtitle={`${activeLesson.partCount} phần · ${activeLesson.lessonType === 'scorm' ? 'SCORM/iSpring' : activeLesson.lessonType === 'native_sequence' ? 'Native Builder' : 'Vimeo'}`} />
                      <div className="form-grid">
                        <label>
                          <span>Tên bài giảng</span>
                          <input value={lessonEditTitle} onChange={(event) => setLessonEditTitle(event.target.value)} />
                        </label>
                        <label>
                          <span>Trạng thái</span>
                          <select value={lessonEditStatus} onChange={(event) => setLessonEditStatus(event.target.value as ElearningLesson['status'])}>
                            <option value="published">Published</option>
                            <option value="draft">Draft</option>
                          </select>
                        </label>
                        <label className="full">
                          <span>Mô tả</span>
                          <textarea rows={3} value={lessonEditDescription} onChange={(event) => setLessonEditDescription(event.target.value)} />
                        </label>
                      </div>
                      <div className="action-row">
                        <button className="btn btn-primary" type="button" onClick={() => { setAdminLayer('lesson'); setWizardStep(1); navigate('/vlearning/admin?layer=lesson'); }}>Thêm mới</button>
                        <button className="btn btn-primary" type="button" disabled={busy || !lessonEditTitle.trim()} onClick={() => void handleSaveLibraryLesson()}>Lưu bài giảng</button>
                        <button className="btn btn-ghost" type="button" onClick={() => { setAdminLayer('lesson'); setWizardStep(2); navigate('/vlearning/admin?layer=lesson'); }}>Sửa nội dung</button>
                        <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void handleDeleteLesson()}>Xóa</button>
                      </div>
                      {activeLesson.lessonType === 'native_sequence' ? (
                        <div className="stack compact">
                          <SectionHeader eye="Block native" title="Nội dung bài giảng" subtitle={`${selectedLessonBlocks.length} block · Native Builder`} />
                          {renderEditableNativeBlockList()}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {effectiveLibraryLayer === 'course' && activeCourse ? (
                    <div className="stack compact">
                      <SectionHeader eye="Khóa học" title={activeCourse.title} subtitle={`${activeCourse.lessonCount} bài · ${activeCourse.completionThreshold}% hoàn thành`} />
                      <div className="form-grid">
                        <label>
                          <span>Tên khóa học</span>
                          <input value={courseEditTitle} onChange={(event) => setCourseEditTitle(event.target.value)} />
                        </label>
                        <label>
                          <span>Trạng thái</span>
                          <select value={courseEditStatus} onChange={(event) => setCourseEditStatus(event.target.value as ElearningCourse['status'])}>
                            <option value="draft">Bản nháp</option>
                            <option value="published">Active</option>
                            <option value="closed">Đóng</option>
                            <option value="archived">Lưu trữ</option>
                          </select>
                        </label>
                        <label>
                          <span>Ngưỡng hoàn thành</span>
                          <input type="number" min={1} max={100} value={courseEditThreshold} onChange={(event) => setCourseEditThreshold(Number(event.target.value || 90))} />
                        </label>
                        <label>
                          <span>Bài kiểm tra</span>
                          <select value={courseEditQuizFormId} onChange={(event) => setCourseEditQuizFormId(event.target.value)}>
                            <option value="">Chưa gắn quiz</option>
                            {quizForms.map((form) => <option value={form.id} key={form.id}>{form.title}</option>)}
                          </select>
                        </label>
                        <label className="full">
                          <span>Thumbnail khóa học</span>
                          <input value={getEditableExternalAssetUrl(courseEditThumbnailUrl)} onChange={(event) => setCourseEditThumbnailUrl(event.target.value)} placeholder="https://.../thumbnail.jpg" />
                        </label>
                        <div className="full action-row">
                          <input
                            ref={editThumbnailInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            style={{ display: 'none' }}
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0] || null;
                              event.currentTarget.value = '';
                              void handleUploadCourseThumbnail(file, 'edit');
                            }}
                          />
                          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => editThumbnailInputRef.current?.click()}>
                            <Upload size={16} />
                            Upload thumbnail
                          </button>
                        </div>
                        <div className="full elearning-course-thumbnail-preview">
                          <div
                            className={`elearning-course-thumb large${courseEditThumbnailUrl ? ' has-image' : ''}`}
                            style={courseEditThumbnailUrl ? { backgroundImage: `url("${courseEditThumbnailUrl}")` } : undefined}
                            aria-label="Preview thumbnail khóa học"
                          >
                            {!courseEditThumbnailUrl ? 'IMG' : null}
                          </div>
                          <span className="muted-text">Ảnh này hiển thị ở thư viện khóa học và trang học viên.</span>
                        </div>
                        <label className="full">
                          <span>Mô tả</span>
                          <textarea rows={3} value={courseEditDescription} onChange={(event) => setCourseEditDescription(event.target.value)} />
                        </label>
                      </div>
                      <div className="action-row">
                        <button className="btn btn-primary" type="button" onClick={() => { setAdminLayer('course'); navigate('/vlearning/admin?layer=course'); }}>Thêm mới</button>
                        <button className="btn btn-primary" type="button" disabled={busy || !courseEditTitle.trim()} onClick={() => void handleSaveLibraryCourse()}>Lưu khóa học</button>
                        <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void handleDeleteLibraryCourse()}>Xóa</button>
                        <Link className="btn btn-ghost" to={`/vlearning/${activeCourse.id}`}>Vào học</Link>
                      </div>
                      <div className="stack compact">
                        <div className="section-eyebrow">Bài giảng trong khóa</div>
                        {bundle?.lessons.length ? (
                          <div className="elearning-lesson-table">
                            {bundle.lessons.map((lesson) => (
                              <div className="elearning-lesson-row" key={lesson.id}>
                                <div>
                                  <strong>{lesson.title}</strong>
                                  <span>{lesson.partCount} phần · {lesson.description || 'Chưa có mô tả bài học.'}</span>
                                </div>
                                <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={() => void handleRemoveLessonFromCourse(lesson)}>
                                  Gỡ khỏi khóa
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="muted-text">Khóa học này chưa có bài giảng.</p>
                        )}
                        <div className="section-eyebrow">Thư viện bài giảng</div>
                        <div className="elearning-lesson-table">
                          {lessonLibrary.map((lesson) => {
                            const added = bundle?.lessons.some((item) => item.id === lesson.id);
                            return (
                              <div className="elearning-lesson-row" key={lesson.id}>
                                <div>
                                  <strong>{lesson.title}</strong>
                                  <span>{lesson.partCount} phần · {lesson.description || 'Chưa có mô tả bài học.'}</span>
                                </div>
                                <button className="btn btn-ghost btn-small" type="button" disabled={busy || added || !activeCourse} onClick={() => void handleAddLessonToCourse(lesson)}>
                                  {added ? 'Đã chọn' : 'Chọn vào khóa'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {effectiveLibraryLayer === 'quiz' && effectiveLibraryView === 'create' ? (
                    <div className="stack compact">
                      <SectionHeader eye="Đề kiểm tra" title="Tạo đề kiểm tra" subtitle="Chọn bộ câu hỏi và cấu hình trước khi lưu vào thư viện." />
                      <div className="form-grid">
                        <label>
                          <span>Tên đề</span>
                          <input value={newQuizTitle} onChange={(event) => setNewQuizTitle(event.target.value)} />
                        </label>
                        <label>
                          <span>Bộ câu hỏi</span>
                          <select value={newQuizQuestionSetId} onChange={(event) => {
                            const nextSetId = event.target.value;
                            const nextSet = quizQuestionSets.find((set) => set.id === nextSetId);
                            setNewQuizQuestionSetId(nextSetId);
                            if (nextSet) setNewQuizQuestionCount(Math.max(1, Math.min(20, nextSet.questionCount || 1)));
                          }}>
                            <option value="">Chưa chọn</option>
                            {quizQuestionSets.map((set) => <option value={set.id} key={set.id}>{set.name} ({set.questionCount} câu)</option>)}
                          </select>
                        </label>
                        <label>
                          <span>Số câu chọn</span>
                          <input type="number" min={1} value={newQuizQuestionCount} onChange={(event) => setNewQuizQuestionCount(Number(event.target.value || 1))} />
                        </label>
                        <label>
                          <span>Thời lượng phút</span>
                          <input type="number" min={1} value={newQuizDurationMinutes} onChange={(event) => setNewQuizDurationMinutes(Number(event.target.value || 1))} />
                        </label>
                        <label>
                          <span>Số lượt làm</span>
                          <input type="number" min={1} value={newQuizMaxAttempts} onChange={(event) => setNewQuizMaxAttempts(Number(event.target.value || 1))} />
                        </label>
                        <label className="checkbox-row">
                          <input type="checkbox" checked={newQuizShuffleQuestions} onChange={(event) => setNewQuizShuffleQuestions(event.target.checked)} />
                          <span className="checkbox-label">Trộn câu hỏi</span>
                        </label>
                        <label className="checkbox-row">
                          <input type="checkbox" checked={newQuizShuffleOptions} onChange={(event) => setNewQuizShuffleOptions(event.target.checked)} />
                          <span className="checkbox-label">Trộn đáp án</span>
                        </label>
                        <label className="full">
                          <span>Giới thiệu</span>
                          <textarea rows={3} value={newQuizIntro} onChange={(event) => setNewQuizIntro(event.target.value)} />
                        </label>
                      </div>
                      <div className="action-row">
                        <button className="btn btn-primary" type="button" disabled={busy || !newQuizTitle.trim() || !newQuizQuestionSetId} onClick={() => void handleSaveNewLibraryQuiz()}>Lưu đề kiểm tra</button>
                        <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => { setLibraryView('index'); navigate('/vlearning/admin/library/quizzes'); }}>Hủy</button>
                      </div>
                    </div>
                  ) : null}

                  {effectiveLibraryLayer === 'question' && effectiveLibraryView === 'create' ? (
                    <div className="stack compact">
                      <SectionHeader eye="Câu hỏi" title="Import / nhập tay bộ câu hỏi" subtitle={`${newQuestionSetPreviewQuestions.length} câu đang nhận diện trước khi lưu.`} />
                      <div className="form-grid">
                        <label>
                          <span>Tên bộ câu hỏi</span>
                          <input value={newQuestionSetName} onChange={(event) => setNewQuestionSetName(event.target.value)} />
                        </label>
                        <label>
                          <span>File import</span>
                          <input type="file" accept=".docx,.txt,.xlsx,.xls" onChange={(event) => void handleLibraryQuestionImportFile(event.target.files?.[0] || null)} />
                        </label>
                        <label className="full">
                          <span>Mô tả</span>
                          <input value={newQuestionSetDescription} onChange={(event) => setNewQuestionSetDescription(event.target.value)} />
                        </label>
                        <label className="full">
                          <span>Đáp án đúng nếu có</span>
                          <input value={newQuestionSetAnswerKey} onChange={(event) => setNewQuestionSetAnswerKey(event.target.value)} placeholder="Ví dụ: 1:B, 2:C, 3:A" />
                        </label>
                        <label className="full">
                          <span>Nội dung câu hỏi</span>
                          <textarea rows={10} value={newQuestionSetRawText} onChange={(event) => setNewQuestionSetRawText(event.target.value)} placeholder="Câu 1: ...&#10;A. ...&#10;B. ...&#10;C. ...&#10;D. ..." />
                        </label>
                      </div>
                      <div className="kpi-row">
                        <Kpi label="Câu nhận diện" value={String(newQuestionSetPreviewQuestions.length)} sub="Từ import / nhập tay" tone="success" />
                        <Kpi label="Có đáp án" value={String(newQuestionSetPreviewQuestions.filter((item) => item.correctOptionId).length)} sub="Sẵn sàng chấm" tone="neutral" />
                      </div>
                      {newQuestionSetPreviewQuestions.length ? (
                        <div className="production-plan-table-wrap production-plan-glass-panel">
                          <table className="data-table production-plan-table production-plan-table-compact production-plan-table-corporate">
                            <thead>
                              <tr>
                                <th>Mã</th>
                                <th>Câu hỏi</th>
                                <th>Đáp án</th>
                              </tr>
                            </thead>
                            <tbody>
                              {newQuestionSetPreviewQuestions.slice(0, 20).map((question) => (
                                <tr key={question.id}>
                                  <td>{question.code}</td>
                                  <td>{question.prompt}</td>
                                  <td>{question.correctOptionId || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                      <div className="action-row">
                        <button className="btn btn-primary" type="button" disabled={busy || !newQuestionSetName.trim() || !newQuestionSetPreviewQuestions.length} onClick={() => void handleSaveNewLibraryQuestionSet()}>Lưu bộ câu hỏi</button>
                        <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => { setLibraryView('index'); navigate('/vlearning/admin/library/questions'); }}>Hủy</button>
                      </div>
                    </div>
                  ) : null}

                  {effectiveLibraryLayer === 'quiz' && effectiveLibraryView === 'detail' && activeQuizForm ? (
                    <div className="stack compact">
                      <SectionHeader eye="Đề kiểm tra" title={activeQuizForm.title} subtitle={`Bộ câu hỏi ${activeQuizForm.questionSetId || 'chưa chọn'}`} />
                      <div className="form-grid">
                        <label>
                          <span>Tên đề</span>
                          <input value={quizEditTitle} onChange={(event) => setQuizEditTitle(event.target.value)} />
                        </label>
                        <label>
                          <span>Trạng thái</span>
                          <select value={quizEditStatus} onChange={(event) => setQuizEditStatus(event.target.value as QuizForm['status'])}>
                            <option value="active">Active</option>
                            <option value="paused">Tạm dừng</option>
                          </select>
                        </label>
                        <label>
                          <span>Bộ câu hỏi</span>
                          <select value={quizEditQuestionSetId} onChange={(event) => setQuizEditQuestionSetId(event.target.value)}>
                            <option value="">Chưa chọn</option>
                            {quizQuestionSets.map((set) => <option value={set.id} key={set.id}>{set.name} ({set.questionCount} câu)</option>)}
                          </select>
                        </label>
                        <label>
                          <span>Số câu chọn</span>
                          <input type="number" min={1} value={quizEditQuestionCount} onChange={(event) => setQuizEditQuestionCount(Number(event.target.value || 1))} />
                        </label>
                        <label>
                          <span>Thời lượng phút</span>
                          <input type="number" min={1} value={quizEditDurationMinutes} onChange={(event) => setQuizEditDurationMinutes(Number(event.target.value || 1))} />
                        </label>
                        <label>
                          <span>Số lượt làm</span>
                          <input type="number" min={1} value={quizEditMaxAttempts} onChange={(event) => setQuizEditMaxAttempts(Number(event.target.value || 1))} />
                        </label>
                        <label className="checkbox-row">
                          <input type="checkbox" checked={quizEditShuffleQuestions} onChange={(event) => setQuizEditShuffleQuestions(event.target.checked)} />
                          <span className="checkbox-label">Trộn câu hỏi</span>
                        </label>
                        <label className="checkbox-row">
                          <input type="checkbox" checked={quizEditShuffleOptions} onChange={(event) => setQuizEditShuffleOptions(event.target.checked)} />
                          <span className="checkbox-label">Trộn đáp án</span>
                        </label>
                        <label className="full">
                          <span>Giới thiệu</span>
                          <textarea rows={3} value={quizEditIntro} onChange={(event) => setQuizEditIntro(event.target.value)} />
                        </label>
                      </div>
                      <div className="action-row">
                        <button className="btn btn-primary" type="button" onClick={() => { setAdminLayer('quiz'); navigate('/vlearning/admin?layer=quiz'); }}>Thêm mới</button>
                        <button className="btn btn-primary" type="button" disabled={busy || !quizEditTitle.trim() || !quizEditQuestionSetId} onClick={() => void handleSaveLibraryQuiz()}>Lưu đề</button>
                        <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void handleDeleteLibraryQuiz()}>Xóa</button>
                      </div>
                    </div>
                  ) : null}

                  {effectiveLibraryLayer === 'question' && effectiveLibraryView === 'detail' && activeQuestionSet ? (
                    <div className="stack compact">
                      <SectionHeader eye="Câu hỏi" title={activeQuestionSet.name} subtitle={`${activeQuestionSet.questionCount} câu hỏi · ${activeQuestionSet.status}`} />
                      <div className="form-grid">
                        <label>
                          <span>Tên bộ câu hỏi</span>
                          <input value={questionSetEditName} onChange={(event) => setQuestionSetEditName(event.target.value)} />
                        </label>
                        <label>
                          <span>Trạng thái</span>
                          <select value={questionSetEditStatus} onChange={(event) => setQuestionSetEditStatus(event.target.value as QuizQuestionSet['status'])}>
                            <option value="active">Active</option>
                            <option value="draft">Bản nháp</option>
                          </select>
                        </label>
                        <label className="full">
                          <span>Mô tả</span>
                          <textarea rows={3} value={questionSetEditDescription} onChange={(event) => setQuestionSetEditDescription(event.target.value)} />
                        </label>
                      </div>
                      <div className="action-row">
                        <button className="btn btn-primary" type="button" onClick={() => { setAdminLayer('lesson'); navigate('/vlearning/admin?layer=lesson'); }}>Thêm vào bài giảng</button>
                        <button className="btn btn-primary" type="button" disabled={busy || !questionSetEditName.trim()} onClick={() => void handleSaveLibraryQuestionSet()}>Lưu bộ câu hỏi</button>
                        <button className="btn btn-ghost" type="button" onClick={() => void handleLoadQuizQuestionBank(activeQuestionSet.id)}>Xem câu hỏi</button>
                        <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void handleDeleteLibraryQuestionSet()}>Xóa</button>
                      </div>
                    </div>
                  ) : null}
                </Card>
                ) : null}
              </div>
            ) : null}

            {effectiveAdminLayer === 'lesson' ? (
              <div className="elearning-layer-grid two">
                <div className="elearning-wizard-panel">
                  <Card title="Wizard tạo bài giảng">
                    <div className="elearning-wizard">
                      <div className="elearning-wizard-steps" aria-label="Các bước tạo bài giảng VLearning">
                        {[
                          ['1', 'Tạo bài', wizardLessonReady],
                          ['2', 'Nội dung', wizardContentReady],
                          ['3', 'Hoàn thành', wizardStep === 3],
                        ].map(([step, label, done]) => (
                          <button
                            className={`${wizardStep === Number(step) ? 'is-active' : ''}${done ? ' is-done' : ''}`}
                            key={String(step)}
                            type="button"
                            onClick={() => setWizardStep(Number(step))}
                          >
                            <span>{String(step)}</span>
                            <strong>{String(label)}</strong>
                          </button>
                        ))}
                      </div>

                      {false ? (
                        <div className="elearning-wizard-grid">
                          <div className="elearning-wizard-copy">
                            <span className="section-eye">Bước 1</span>
                            <h3>Khởi tạo khóa học dạng bản nháp</h3>
                            <p>Nhập tên khóa, mô tả ngắn và quiz nếu đã có. Nếu chưa có quiz, bạn có thể bỏ trống và thêm ở bước 4.</p>
                          </div>
                          <div className="form-grid">
                            <label>
                              <span>Tên khóa học</span>
                              <input value={courseTitle} onChange={(event) => setCourseTitle(event.target.value)} />
                            </label>
                            <label>
                              <span>Quiz tổng kết nếu đã có</span>
                              <select value={courseQuizFormId} onChange={(event) => setCourseQuizFormId(event.target.value)}>
                                <option value="">Chưa gắn quiz</option>
                                {quizForms.map((form) => <option value={form.id} key={form.id}>{form.title}</option>)}
                              </select>
                            </label>
                            <label className="full">
                              <span>Mô tả khóa học</span>
                              <textarea rows={3} value={courseDescription} onChange={(event) => setCourseDescription(event.target.value)} />
                            </label>
                          </div>
                          <div className="action-row">
                            <button className="btn btn-primary" disabled={busy || !courseTitle.trim()} onClick={() => void handleWizardCreateCourse()}>Tạo khóa và tiếp tục</button>
                            {activeCourse ? <button className="btn btn-ghost" type="button" onClick={() => setWizardStep(2)}>Dùng khóa đang chọn</button> : null}
                          </div>
                        </div>
                      ) : null}

                      {wizardStep === 1 ? (
                        <div className="elearning-wizard-grid">
                          <div className="elearning-wizard-copy">
                            <span className="section-eye">Bước 1</span>
                            <h3>Chọn cách tạo bài giảng</h3>
                            <p>Native phù hợp với chuỗi video Vimeo và câu hỏi inline. SCORM phù hợp file iSpring/Storyline đã xuất bản.</p>
                          </div>
                          <div className="elearning-wizard-choice">
                            <button className={wizardMode === 'native' ? 'is-active' : ''} type="button" onClick={() => setWizardMode('native')}>Native Builder</button>
                            <button className={wizardMode === 'scorm' ? 'is-active' : ''} type="button" onClick={() => setWizardMode('scorm')}>SCORM/iSpring</button>
                          </div>
                          {wizardMode === 'native' ? (
                            <div className="form-grid">
                              <label>
                                <span>Tên bài native</span>
                                <input value={nativeLessonTitle} onChange={(event) => setNativeLessonTitle(event.target.value)} />
                              </label>
                              <label className="full">
                                <span>Mô tả bài native</span>
                                <textarea rows={3} value={nativeLessonDescription} onChange={(event) => setNativeLessonDescription(event.target.value)} />
                              </label>
                            </div>
                          ) : (
                            <div className="form-grid">
                              <label>
                                <span>Tên bài SCORM</span>
                                <input value={scormLessonTitle} onChange={(event) => setScormLessonTitle(event.target.value)} />
                              </label>
                              <label>
                                <span>File .zip</span>
                                <input type="file" accept=".zip,application/zip,application/x-zip-compressed" onChange={(event) => setScormFile(event.target.files?.[0] || null)} />
                              </label>
                              <label className="full">
                                <span>Mô tả</span>
                                <textarea rows={3} value={scormLessonDescription} onChange={(event) => setScormLessonDescription(event.target.value)} />
                              </label>
                            </div>
                          )}
                          <div className="action-row">
                            <button className="btn btn-primary" disabled={busy || (wizardMode === 'scorm' && !scormFile)} onClick={() => void handleWizardCreateLesson()}>Tạo bài và tiếp tục</button>
                          </div>
                        </div>
                      ) : null}

                      {wizardStep === 2 ? (
                        <div className="elearning-wizard-grid">
                          <div className="elearning-wizard-copy">
                            <span className="section-eye">Bước 2</span>
                            <h3>Thêm nội dung bài giảng</h3>
                            <p>Với Native, thêm video hoặc câu hỏi. Với SCORM, bước này sẽ tự đạt khi package đã upload.</p>
                          </div>
                          <div className="form-grid">
                            <label className="full">
                              <span>Bài giảng đang tạo nội dung</span>
                              <select value={activeLessonId} onChange={(event) => setActiveLessonId(event.target.value)}>
                                {lessonLibrary.map((lesson) => (
                                  <option value={lesson.id} key={lesson.id}>
                                    {lesson.title} · {lesson.lessonType === 'scorm' ? 'SCORM/iSpring' : lesson.lessonType === 'native_sequence' ? 'Native Builder' : 'Vimeo'}
                                  </option>
                                ))}
                              </select>
                            </label>
                              {activeLesson ? (
                              <div className="full notice">
                                Đang chỉnh: <strong>{activeLesson.title}</strong> · {activeLesson.lessonType === 'scorm' ? 'SCORM/iSpring' : activeLesson.lessonType === 'native_sequence' ? 'Native Builder' : 'Vimeo'} · {selectedLessonBlocks.length + selectedLessonParts.length} nội dung
                              </div>
                            ) : (
                              <div className="full notice">Chưa có bài giảng. Hãy tạo bài ở bước 1 trước khi thêm nội dung.</div>
                            )}
                          </div>
                          {activeLesson?.lessonType === 'native_sequence' ? (
                            <div className="elearning-native-workspace full">
                              <div className="elearning-native-toolpane form-grid">
                              <div className="full action-row" role="tablist" aria-label="Chế độ thêm nội dung native">
                                <button
                                  className={`btn ${nativeBuilderMode === 'block' ? 'btn-primary' : 'btn-ghost'}`}
                                  type="button"
                                  onClick={() => setNativeBuilderMode('block')}
                                >
                                  Thêm block
                                </button>
                                <button
                                  className={`btn ${nativeBuilderMode === 'question_library' ? 'btn-primary' : 'btn-ghost'}`}
                                  type="button"
                                  onClick={() => setNativeBuilderMode('question_library')}
                                >
                                  Thư viện Question
                                </button>
                              </div>

                              {nativeBuilderMode === 'block' ? (
                                <>
                                  <label className="full">
                                    <span>Dán nhiều link Vimeo</span>
                                    <textarea
                                      rows={5}
                                      value={nativeBulkVimeoLinks}
                                      onChange={(event) => setNativeBulkVimeoLinks(event.target.value)}
                                      placeholder={'Mỗi dòng một link, ID hoặc iframe embed\nhttps://player.vimeo.com/video/1205176117\n1205176120'}
                                    />
                                  </label>
                                  <div className="full action-row">
                                    <button className="btn btn-primary" type="button" disabled={busy || !nativeBulkVimeoLinks.trim()} onClick={() => void handleCreateNativeVideoBlocks()}>
                                      Tạo block video
                                    </button>
                                  </div>
                                  <label>
                                    <span>Loại block</span>
                                    <select value={nativeBlockType} onChange={(event) => setNativeBlockType(event.target.value as ElearningLessonBlockType)}>
                                      <option value="video">Video</option>
                                      <option value="single_choice">Single choice</option>
                                      <option value="multiple_choice">Multiple choice</option>
                                      <option value="fill_gap">Fill in gap</option>
                                      <option value="short_answer">Short answer</option>
                                    </select>
                                  </label>
                                  <label>
                                    <span>Tiêu đề block</span>
                                    <input value={nativeBlockTitle} onChange={(event) => setNativeBlockTitle(event.target.value)} />
                                  </label>
                                  <label>
                                    <span>Chèn sau block</span>
                                    <select value={nativeBlockInsertAfterBlockId} onChange={(event) => setNativeBlockInsertAfterBlockId(event.target.value)}>
                                      <option value="">Cuối bài</option>
                                      {selectedLessonBlocks.map((block) => <option value={block.id} key={block.id}>{block.sortOrder}. {block.title}</option>)}
                                    </select>
                                  </label>
                                  {nativeBlockType === 'video' ? (
                                    <label>
                                      <span>Link Vimeo / ID</span>
                                      <input value={nativeBlockVideoUrl} onChange={(event) => setNativeBlockVideoUrl(event.target.value)} placeholder="https://vimeo.com/123456789" />
                                    </label>
                                  ) : null}
                                  {nativeBlockType !== 'video' ? (
                                    <>
                                      <label>
                                        <span>Chọn từ thư viện câu hỏi</span>
                                        <select value={quizSourceFormId} onChange={(event) => void handleLoadQuizQuestionBank(event.target.value)}>
                                          <option value="">Nhập nhanh thủ công</option>
                                          {quizQuestionSets.map((set) => <option value={set.id} key={set.id}>{set.name} ({set.questionCount} câu)</option>)}
                                        </select>
                                      </label>
                                      <label>
                                        <span>Câu hỏi lẻ</span>
                                        <select value={quizSourceQuestionId} onChange={(event) => handleUseQuizQuestion(event.target.value)} disabled={!quizQuestionBank.length}>
                                          <option value="">Chọn câu hỏi</option>
                                          {quizQuestionBank.map((question) => <option value={question.id} key={question.id}>{question.code}. {question.prompt}</option>)}
                                        </select>
                                      </label>
                                    </>
                                  ) : null}
                                  <label className="full">
                                    <span>{nativeBlockType === 'video' ? 'Nội dung / hướng dẫn' : 'Nội dung câu hỏi'}</span>
                                    <textarea rows={3} value={nativeBlockContent} onChange={(event) => setNativeBlockContent(event.target.value)} />
                                  </label>
                                  {nativeBlockType !== 'video' ? (
                                    <>
                                      <label className="full">
                                        <span>Đáp án</span>
                                        <textarea rows={4} value={nativeBlockOptions} onChange={(event) => setNativeBlockOptions(event.target.value)} placeholder="Mỗi đáp án một dòng" />
                                      </label>
                                      <label className="full">
                                        <span>Đáp án đúng</span>
                                        <input value={nativeBlockCorrectAnswer} onChange={(event) => setNativeBlockCorrectAnswer(event.target.value)} placeholder={nativeBlockType === 'multiple_choice' ? 'Nhập các đáp án đúng, cách nhau bằng dấu phẩy' : 'Nhập đúng nội dung đáp án'} />
                                      </label>
                                    </>
                                  ) : null}
                                </>
                              ) : (
                                <>
                                  <label className="full">
                                    <span>Bộ câu hỏi</span>
                                    <select value={quizSourceFormId} onChange={(event) => void handleLoadQuizQuestionBank(event.target.value)}>
                                      <option value="">Chọn bộ câu hỏi</option>
                                      {quizQuestionSets.map((set) => <option value={set.id} key={set.id}>{set.name} ({set.questionCount} câu)</option>)}
                                    </select>
                                  </label>
                                  <div className="full elearning-question-picker-list">
                                    {quizQuestionBank.map((question) => (
                                      <label className="elearning-question-picker-item checkbox-row" key={question.id}>
                                        <input
                                          type="checkbox"
                                          checked={selectedQuestionLibraryIds.includes(question.id)}
                                          onChange={() => toggleQuestionLibrarySelection(question.id)}
                                        />
                                        <span>
                                          <strong>{question.code}. {question.prompt}</strong>
                                          <em>{question.options.length} đáp án</em>
                                        </span>
                                      </label>
                                    ))}
                                    {!quizQuestionBank.length ? <div className="muted-text">Chọn một bộ câu hỏi để xem và tích câu hỏi cần chèn.</div> : null}
                                  </div>
                                  <label>
                                    <span>Chèn sau block</span>
                                    <select value={nativeQuestionInsertAfterBlockId} onChange={(event) => setNativeQuestionInsertAfterBlockId(event.target.value)}>
                                      <option value="">Cuối bài</option>
                                      {selectedLessonBlocks.map((block) => <option value={block.id} key={block.id}>{block.sortOrder}. {block.title}</option>)}
                                    </select>
                                  </label>
                                  <div className="full action-row">
                                    <button className="btn btn-primary" type="button" disabled={busy || !selectedQuestionLibraryIds.length} onClick={() => void handleCreateNativeQuestionBlocks()}>
                                      Thêm câu hỏi đã chọn
                                    </button>
                                  </div>
                                </>
                              )}
                              </div>
                              <aside className="elearning-native-slide-rail" aria-label="Danh sách block bài native">
                                <div className="elearning-native-slide-head">
                                  <span className="section-eye">Slide blocks</span>
                                  <strong>{selectedLessonBlocks.length + selectedLessonParts.length} nội dung</strong>
                                </div>
                                {selectedLessonBlocks.length ? renderEditableNativeBlockList() : <div className="muted-text">Bài native này chưa có block.</div>}
                                {selectedLessonParts.length ? (
                                  <div className="elearning-native-preview-list">
                                  {selectedLessonParts.map((part) => (
                                    <div className="elearning-native-block-preview" key={part.id}>
                                      <div>
                                        <strong>{part.title}</strong>
                                        <span>Vimeo part</span>
                                      </div>
                                      {part.content ? <p>{part.content}</p> : null}
                                      {part.videoId ? (
                                        <div className="elearning-video-frame elearning-video-frame-preview">
                                          <iframe src={buildVimeoEmbedUrl(part.videoUrl || part.videoId)} title={part.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}
                                  </div>
                                ) : null}
                              </aside>
                            </div>
                          ) : (
                            <div className="notice">Bài SCORM đã có nội dung trong package. Bạn có thể chuyển sang bước gắn bài vào khóa.</div>
                          )}
                          <div className="action-row elearning-native-sticky-actions">
                            <button className="btn btn-ghost" type="button" onClick={() => setWizardStep(1)}>Quay lại</button>
                            {!activeLesson ? <button className="btn btn-ghost" type="button" onClick={handleWizardGoToLessonBuilder}>Tạo nhanh bài giảng</button> : null}
                            {activeLesson?.lessonType === 'native_sequence' && nativeBuilderMode === 'block' ? <button className="btn btn-primary" disabled={busy || !nativeBlockTitle.trim()} onClick={() => void handleCreateNativeBlock()}>Thêm block</button> : null}
                            <button className="btn btn-primary" disabled={busy || !activeLesson} onClick={() => setWizardStep(3)}>Hoàn thành bài giảng</button>
                          </div>
                        </div>
                      ) : null}

                      {false ? (
                        <div className="elearning-wizard-grid">
                          <div className="elearning-wizard-copy">
                            <span className="section-eye">Bước 4</span>
                            <h3>Gắn bài kiểm tra cuối khóa</h3>
                            <p>Nếu chưa có đề kiểm tra, chọn bỏ qua để lưu bản nháp và thêm sau trong layer Đề kiểm tra E-learning.</p>
                          </div>
                          <div className="form-grid">
                            <label>
                              <span>Đề kiểm tra</span>
                              <select value={selectedCourseQuizFormId} onChange={(event) => setSelectedCourseQuizFormId(event.target.value)}>
                                <option value="">Chưa gắn quiz</option>
                                {quizForms.map((form) => <option value={form.id} key={form.id}>{form.title}</option>)}
                              </select>
                            </label>
                            <label className="checkbox-row">
                              <input type="checkbox" checked={wizardQuizOptional} onChange={(event) => setWizardQuizOptional(event.target.checked)} />
                              Bỏ qua, thêm quiz sau
                            </label>
                          </div>
                          <div className="action-row">
                            <button className="btn btn-ghost" type="button" onClick={() => setWizardStep(3)}>Quay lại</button>
                            <button className="btn btn-ghost" type="button" onClick={handleWizardGoToQuizBuilder}>Tạo đề kiểm tra</button>
                            <button className="btn btn-primary" disabled={busy || !wizardQuizReady} onClick={() => void handleWizardFinish()}>Hoàn thành</button>
                          </div>
                        </div>
                      ) : null}

                      {wizardStep === 3 ? (
                        <div className="elearning-wizard-grid">
                          <div className="elearning-wizard-copy">
                            <span className="section-eye">Hoàn thành</span>
                            <h3>Bài giảng đã sẵn sàng để gán vào khóa học</h3>
                            <p>Chuyển sang tab Tạo khóa học để chọn bài giảng này hoặc gán thêm bài giảng khác vào khóa.</p>
                          </div>
                          <div className="elearning-wizard-review">
                            <span>Bài giảng: <strong>{activeLesson?.title || 'Chưa chọn'}</strong></span>
                            <span>Loại bài: <strong>{activeLesson?.lessonType === 'scorm' ? 'SCORM/iSpring' : activeLesson?.lessonType === 'native_sequence' ? 'Native Builder' : 'Chưa chọn'}</strong></span>
                            <span>Nội dung: <strong>{wizardContentReady ? 'Đã có nội dung' : 'Chưa có nội dung'}</strong></span>
                          </div>
                          <div className="action-row">
                            <button className="btn btn-ghost" type="button" onClick={() => setWizardStep(1)}>Tạo bài khác</button>
                            <Link className="btn btn-primary" to="/vlearning/admin?layer=course">Gán vào khóa học</Link>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </Card>
                </div>
              </div>
            ) : null}

            {effectiveAdminLayer === 'course' ? (
              <div className="elearning-layer-grid two">
                <Card title="Wizard tạo khóa học">
                  <div className="form-grid single">
                    <label>
                      <span>Tên khóa học</span>
                      <input value={courseTitle} onChange={(event) => setCourseTitle(event.target.value)} />
                    </label>
                    <label>
                      <span>Mô tả khóa học</span>
                      <textarea rows={3} value={courseDescription} onChange={(event) => setCourseDescription(event.target.value)} />
                    </label>
                    <label>
                      <span>Thumbnail khóa học</span>
                      <input value={getEditableExternalAssetUrl(courseThumbnailUrl)} onChange={(event) => setCourseThumbnailUrl(event.target.value)} placeholder="https://.../thumbnail.jpg" />
                    </label>
                    <div className="action-row">
                      <input
                        ref={createThumbnailInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{ display: 'none' }}
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0] || null;
                          event.currentTarget.value = '';
                          void handleUploadCourseThumbnail(file, 'create');
                        }}
                      />
                      <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => createThumbnailInputRef.current?.click()}>
                        <Upload size={16} />
                        Upload thumbnail
                      </button>
                    </div>
                    <label>
                      <span>Bài kiểm tra cuối khóa</span>
                      <select value={courseQuizFormId} onChange={(event) => setCourseQuizFormId(event.target.value)}>
                        <option value="">Chưa gắn bài kiểm tra</option>
                        {quizForms.map((form) => (
                          <option value={form.id} key={form.id}>{form.title}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="action-row">
                    <button className="btn btn-primary" onClick={() => void handleCreateCourse()} disabled={busy || !canManage}>Tạo khóa</button>
                    <button className="btn btn-ghost" type="button" disabled={busy || !activeCourse} onClick={() => activeCourse && void handleCloneCourse(activeCourse)}><Copy size={14} aria-hidden="true" /> Sao chép khóa</button>
                  </div>
                </Card>

                <Card title="Chọn bài vào khóa">
                  <div className="form-grid single">
                    <label>
                      <span>Khóa học</span>
                      <select value={activeCourseId} onChange={(event) => setActiveCourseId(event.target.value)}>
                        {courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Bài kiểm tra cuối khóa</span>
                      <select value={selectedCourseQuizFormId} onChange={(event) => setSelectedCourseQuizFormId(event.target.value)}>
                        <option value="">Chưa gắn bài kiểm tra</option>
                        {quizForms.map((form) => (
                          <option value={form.id} key={form.id}>{form.title}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="action-row">
                    <button className="btn btn-primary" disabled={!activeCourse || busy} onClick={() => void handleUpdateCourseQuiz()}>
                      Lưu bài kiểm tra
                    </button>
                    <button className="btn btn-ghost" disabled={!activeCourse} onClick={() => activeCourse && void toggleCourseStatus(activeCourse)}>
                      {activeCourse?.status === 'published' ? 'Tắt active' : 'Active khóa'}
                    </button>
                    {activeCourse ? <button className="btn btn-ghost" onClick={() => void navigator.clipboard.writeText(buildCourseLearnLink(activeCourse.id))}>Copy link học</button> : null}
                  </div>
                  {activeCourse && bundle?.lessons.length ? (
                    <>
                      <div className="section-eyebrow">Bài giảng trong khóa</div>
                      <div className="elearning-lesson-table">
                        {bundle.lessons.map((lesson) => (
                          <div className="elearning-lesson-row" key={lesson.id}>
                            <div>
                              <strong>{lesson.title}</strong>
                              <span>{lesson.partCount} phần · {lesson.description || 'Chưa có mô tả bài học.'}</span>
                            </div>
                            <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => void handleRemoveLessonFromCourse(lesson)}>
                              Gỡ khỏi khóa
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                  <div className="section-eyebrow">Thư viện bài giảng</div>
                  <div className="elearning-lesson-table">
                    {lessonLibrary.map((lesson) => {
                      const added = bundle?.lessons.some((item) => item.id === lesson.id);
                      return (
                        <div className="elearning-lesson-row" key={lesson.id}>
                          <div>
                            <strong>{lesson.title}</strong>
                            <span>{lesson.partCount} phần · {lesson.description || 'Chưa có mô tả bài học.'}</span>
                          </div>
                          <button className="btn btn-ghost btn-small" disabled={busy || added || !activeCourse} onClick={() => void handleAddLessonToCourse(lesson)}>
                            {added ? 'Đã chọn' : 'Chọn vào khóa'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>
            ) : null}

            {effectiveAdminLayer === 'class' ? (
              <div className="elearning-layer-grid">
                <Card
                  title="Lớp học"
                  action={
                    <div className="action-row compact-actions">
                      <button className="btn btn-primary btn-small" type="button" onClick={handlePrepareCreateClass} title="Thêm lớp học">
                        <Plus size={16} aria-hidden="true" />
                        <span>Thêm</span>
                      </button>
                      <Link className="btn btn-ghost btn-small" to="/vtraining/classes">Mở VTraining</Link>
                    </div>
                  }
                >
                  {classEditorMode !== 'closed' ? (
                    <>
                      <div className="section-eyebrow">{classEditorMode === 'edit' ? 'Sửa lớp học' : 'Thêm lớp học'}</div>
                      <div className="form-grid">
                    <label>
                      <span>Tên lớp</span>
                      <input value={className} onChange={(event) => setClassName(event.target.value)} />
                    </label>
                    <label>
                      <span>Mã lớp</span>
                      <input value={classCode} onChange={(event) => setClassCode(event.target.value)} placeholder="VD: PO-ONB-2026-05" />
                    </label>
                    <label>
                      <span>Khóa học áp dụng</span>
                      <select value={activeCourseId} onChange={(event) => setActiveCourseId(event.target.value)}>
                        <option value="">Chưa gán khóa học</option>
                        {courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}
                      </select>
                    </label>
                    <label className="full">
                      <span>Lớp VTraining dùng chung roster</span>
                      <select value={activeVTrainingClassId} onChange={(event) => setActiveVTrainingClassId(event.target.value)}>
                        <option value="">Chọn lớp VTraining</option>
                        {vtrainingClasses.map((item) => (
                          <option value={item.id} key={item.id}>{item.code ? `${item.code} - ${item.name}` : item.name}</option>
                        ))}
                      </select>
                    </label>
                    {activeVTrainingClass ? (
                      <div className="full muted-text">
                        Roster VTraining: {activeVTrainingRosterCount} học viên
                        {linkedVLearningClassName ? ` · Đã gán vào VLearning: ${linkedVLearningClassName}` : ''}
                      </div>
                    ) : null}
                    <label>
                      <span>Thời gian mở lớp</span>
                      <input type="datetime-local" value={classStartAt} onChange={(event) => setClassStartAt(event.target.value)} />
                    </label>
                    <label>
                      <span>Thời gian đóng lớp</span>
                      <input type="datetime-local" value={classEndAt} onChange={(event) => setClassEndAt(event.target.value)} />
                    </label>
                    <label>
                      <span>File học viên CSV</span>
                      <input type="file" accept=".csv,text/csv" onChange={(event) => void handlePreviewStudentImport(event.target.files?.[0] || null)} />
                    </label>
                      </div>
                      <div className="action-row">
                        {classEditorMode === 'edit' ? (
                          <button className="btn btn-primary" disabled={busy} onClick={() => void handleSaveClassEdit()}>Lưu lớp học</button>
                        ) : (
                          <>
                            <button className="btn btn-primary" disabled={busy || !activeVTrainingClassId} onClick={() => void handleCreateClassFromVTraining()}>Tạo lớp từ VTraining</button>
                            <button className="btn btn-ghost" disabled={busy || Boolean(activeVTrainingClassId)} onClick={() => void handleCreateClass()} title="Bỏ chọn lớp VTraining nếu muốn tạo lớp trống để tự import học viên.">Tạo lớp trống</button>
                          </>
                        )}
                        <button className="btn btn-ghost" disabled={busy || !activeClass?.trainingClassId} onClick={() => void handleSyncActiveVTrainingClass()}>Đồng bộ lại từ VTraining</button>
                        <button className="btn btn-ghost" disabled={busy || !activeClass || !importRows.length || importRows.every((row) => row.action === 'error')} onClick={() => void handleImportStudents()}>
                          Import học viên hợp lệ
                        </button>
                        <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => { setClassEditorMode('closed'); resetClassEditorFields(); }}>
                          <X size={16} aria-hidden="true" />
                          Đóng
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="muted-text">Chọn biểu tượng thêm hoặc sửa trong bảng để quản lý lớp học.</div>
                  )}
                </Card>

                <Card
                  title="Danh sách lớp E-learning"
                  action={
                    <button className="btn btn-primary btn-small" type="button" onClick={handlePrepareCreateClass} title="Thêm lớp E-learning">
                      <Plus size={16} aria-hidden="true" />
                      <span>Thêm</span>
                    </button>
                  }
                >
                  <div className="production-plan-table-wrap production-plan-glass-panel elearning-class-management-table">
                    <table className="data-table production-plan-table production-plan-table-compact production-plan-table-corporate">
                      <thead>
                        <tr>
                          <th>Lớp E-learning</th>
                          <th>Khóa học</th>
                          <th>Nguồn roster</th>
                          <th>Học viên</th>
                          <th>Thời gian</th>
                          <th>Trạng thái</th>
                          <th>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rosterClasses.map((item) => {
                          const course = courses.find((courseItem) => courseItem.id === item.courseId);
                          const trainingClass = item.trainingClassId ? vtrainingClasses.find((classItem) => classItem.id === item.trainingClassId) : null;
                          const learnerCount = getElearningClassLearnerCount(deployment, item.id);
                          return (
                            <tr className={activeClassId === item.id ? 'is-active' : ''} key={item.id} onClick={() => setActiveClassId(item.id)}>
                              <td><strong>{item.name}</strong><div className="muted-text">{item.code || item.id}</div></td>
                              <td>{course?.title || item.courseId || 'Chưa gán khóa'}</td>
                              <td>{item.trainingClassId ? trainingClass?.name || 'Lớp VTraining' : 'Lớp E-learning riêng'}</td>
                              <td>{learnerCount}</td>
                              <td>{formatDateOnly(item.startAt)} - {formatDateOnly(item.endAt)}</td>
                              <td><Badge tone={item.status === 'open' ? 'success' : item.status === 'paused' ? 'warning' : 'neutral'}>{item.status}</Badge></td>
                              <td>
                                <div className="action-row compact-actions">
                                  <button className="btn btn-ghost btn-small" type="button" onClick={(event) => { event.stopPropagation(); setActiveClassId(item.id); }}>
                                    Chọn
                                  </button>
                                  <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); handlePrepareEditClass(item); }} title="Sửa lớp học">
                                    <Pencil size={16} aria-hidden="true" />
                                  </button>
                                  <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); void handleDeleteClass(item); }} title="Xóa lớp học">
                                    <Trash2 size={16} aria-hidden="true" />
                                  </button>
                                  {item.trainingClassId ? (
                                    <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); setActiveClassId(item.id); void handleSyncActiveVTrainingClass(item); }}>
                                      Đồng bộ
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {!rosterClasses.length ? <tr><td colSpan={7}><div className="muted-text">Chưa có lớp E-learning.</div></td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                </Card>
                <Card title="Học viên trong lớp">
                  <div className="elearning-course-head">
                    <div>
                      <strong>{activeClass?.name || 'Chưa chọn lớp E-learning'}</strong>
                      <p>{activeClassRosterRows.length} học viên trong roster lớp · {activeClass?.trainingClassId ? 'Nguồn VTraining có thể đồng bộ lại' : 'Lớp trống/import thủ công'}</p>
                    </div>
                    {activeClass?.trainingClassId ? <Badge tone="success">Từ VTraining</Badge> : <Badge tone="neutral">Roster riêng</Badge>}
                  </div>
                  {importRows.length ? (
                    <div className="elearning-lesson-table">
                      {importRows.slice(0, 8).map((row) => (
                        <div className="elearning-lesson-row" key={row.rowNumber}>
                          <div>
                            <strong>Dòng {row.rowNumber}: {row.fullName || 'Chưa có họ tên'}</strong>
                            <span>{row.email || 'Thiếu email'} · {row.department || 'Chưa có phòng ban'} · {row.errors.join(', ') || (row.action === 'update' ? 'Cập nhật hồ sơ đã có' : 'Tạo học viên mới')}</span>
                          </div>
                          <Badge tone={row.action === 'error' ? 'danger' : row.action === 'update' ? 'warning' : 'success'}>{row.action === 'error' ? 'Lỗi' : row.action === 'update' ? 'Cập nhật' : 'Tạo mới'}</Badge>
                        </div>
                      ))}
                      {importRows.length > 8 ? <div className="muted-text">Còn {importRows.length - 8} dòng khác trong file import.</div> : null}
                    </div>
                  ) : (
                    <div className="muted-text">Có thể import CSV để thêm học viên vào lớp trước, rồi gán khóa ở đợt học sau.</div>
                  )}
                  <div className="elearning-lesson-table">
                    {activeClassRosterRows.slice(0, 20).map((row) => {
                      const student = row.student;
                      if (!student) return null;
                      return (
                        <div className="elearning-lesson-row" key={`${activeClass?.id}-${student.id}`}>
                          <div>
                            <strong>{student.fullName || 'Chưa có tên'}</strong>
                            <span>{student.email} · {student.department || 'Chưa có phòng ban'} · {row.roster?.sourceModule === 'vtraining' ? 'Từ VTraining' : 'Bổ sung VLearning'}</span>
                          </div>
                          <div className="action-row">
                            <Badge tone={row.roster?.sourceModule === 'vtraining' ? 'success' : 'neutral'}>{row.roster?.sourceModule === 'vtraining' ? 'Từ VTraining' : 'Roster riêng'}</Badge>
                            <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={() => void handleRemoveClassRosterStudent(student.id, row.enrollment?.id)}>Gỡ khỏi lớp</button>
                          </div>
                        </div>
                      );
                    })}
                    {!activeClassRosterRows.length ? <div className="muted-text">Chưa có học viên trong lớp đang chọn.</div> : null}
                  </div>
                </Card>
              </div>
            ) : null}

            {(effectiveAdminLayer === 'group' || effectiveAdminLayer === 'deployment') ? (
              <div className="elearning-layer-grid">
                <Card title={effectiveAdminLayer === 'group' ? 'Nhóm học viên' : 'Đợt học'}>
                  {false ? (
                  <div className="action-row" role="tablist" aria-label="Layer triển khai VLearning">
                    {VLEARNING_DEPLOYMENT_LAYERS.map((layer) => (
                      <button
                        className={`btn ${effectiveDeploymentLayer === layer.id ? 'btn-primary' : 'btn-ghost'}`}
                        key={layer.id}
                        type="button"
                        onClick={() => {
                          setDeploymentLayer(layer.id);
                          navigate(getDeploymentLayerRoute(layer.id));
                        }}
                      >
                        {layer.label}
                      </button>
                    ))}
                  </div>
                  ) : null}

                  {false ? (
                    <div className="stack compact">
                      <div className="action-row">
                        <button className="btn btn-primary btn-small" type="button" onClick={handlePrepareCreateClass} title="Thêm lớp học">
                          <Plus size={16} aria-hidden="true" />
                          <span>Thêm lớp học</span>
                        </button>
                      </div>
                      {classEditorMode !== 'closed' ? (
                        <>
                          <div className="section-eyebrow">{classEditorMode === 'edit' ? 'Sửa lớp học' : 'Thêm lớp học'}</div>
                          <div className="form-grid">
                            <label>
                              <span>Tên lớp học</span>
                              <input value={className} onChange={(event) => setClassName(event.target.value)} />
                            </label>
                            <label>
                              <span>Mã lớp</span>
                              <input value={classCode} onChange={(event) => setClassCode(event.target.value)} placeholder="VD: VNPT-E02-L01" />
                            </label>
                            <label>
                              <span>Khóa học áp dụng</span>
                              <select value={activeCourseId} onChange={(event) => setActiveCourseId(event.target.value)}>
                                {courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}
                              </select>
                            </label>
                            <label>
                              <span>Mở học</span>
                              <input type="datetime-local" value={classStartAt} onChange={(event) => setClassStartAt(event.target.value)} />
                            </label>
                            <label>
                              <span>Đóng học</span>
                              <input type="datetime-local" value={classEndAt} onChange={(event) => setClassEndAt(event.target.value)} />
                            </label>
                          </div>
                          <div className="action-row">
                            <button className="btn btn-primary" disabled={busy || !activeCourseId} onClick={() => void (classEditorMode === 'edit' ? handleSaveClassEdit() : handleCreateClass())}>
                              {classEditorMode === 'edit' ? 'Lưu lớp học' : 'Tạo lớp học'}
                            </button>
                            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => { setClassEditorMode('closed'); resetClassEditorFields(); }}>
                              <X size={16} aria-hidden="true" />
                              Đóng
                            </button>
                          </div>
                        </>
                      ) : null}
                      <div className="production-plan-table-wrap production-plan-glass-panel">
                        <table className="data-table production-plan-table production-plan-table-compact production-plan-table-corporate">
                          <thead>
                            <tr>
                              <th>Lớp học</th>
                              <th>Khóa học</th>
                              <th>Học viên</th>
                              <th>Thời gian</th>
                              <th>Trạng thái</th>
                              <th>Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rosterClasses.map((item) => {
                              const course = courses.find((courseItem) => courseItem.id === item.courseId);
                              const learnerCount = deployment.enrollments.filter((enrollment) => enrollment.classId === item.id).length;
                              return (
                                <tr className={activeClassId === item.id ? 'is-active' : ''} key={item.id} onClick={() => setActiveClassId(item.id)}>
                                  <td><strong>{item.name}</strong><div className="muted-text">{item.code || item.id}</div></td>
                                  <td>{course?.title || item.courseId}</td>
                                  <td>{learnerCount}</td>
                                  <td>{formatDateOnly(item.startAt)} - {formatDateOnly(item.endAt)}</td>
                                  <td><Badge tone={item.status === 'open' ? 'success' : item.status === 'paused' ? 'warning' : 'neutral'}>{item.status}</Badge></td>
                                  <td>
                                    <div className="action-row compact-actions">
                                      <button className="btn btn-ghost btn-small" type="button" onClick={(event) => { event.stopPropagation(); setActiveClassId(item.id); setDeploymentLayer('runs'); navigate(getDeploymentLayerRoute('runs')); }}>
                                        Chi tiết
                                      </button>
                                      <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); handlePrepareEditClass(item); }} title="Sửa lớp học">
                                        <Pencil size={16} aria-hidden="true" />
                                      </button>
                                      <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); void handleDeleteClass(item); }} title="Xóa lớp học">
                                        <Trash2 size={16} aria-hidden="true" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {!rosterClasses.length ? <tr><td colSpan={6}><div className="muted-text">Chưa có lớp học.</div></td></tr> : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {effectiveAdminLayer === 'group' ? (
                    <div className="stack compact">
                      <div className="action-row">
                        <button
                          className="btn btn-primary btn-small"
                          type="button"
                          onClick={() => {
                            handleCancelEditLearnerGroup();
                            setLearnerGroupEditorMode('create');
                            setLearnerGroupName('Nhóm học viên mới');
                            setLearnerGroupDescription('');
                            setLearnerGroupEmailText('');
                          }}
                          title="Thêm nhóm học viên"
                        >
                          <Plus size={16} aria-hidden="true" />
                          <span>Thêm nhóm</span>
                        </button>
                      </div>
                      {learnerGroupEditorMode === 'create' ? (
                        <>
                          <div className="section-eyebrow">Thêm nhóm học viên</div>
                          <div className="form-grid">
                            <label>
                              <span>Tên nhóm học viên</span>
                              <input value={learnerGroupName} onChange={(event) => setLearnerGroupName(event.target.value)} />
                            </label>
                            <label>
                              <span>Mô tả</span>
                              <input value={learnerGroupDescription} onChange={(event) => setLearnerGroupDescription(event.target.value)} />
                            </label>
                            <label className="full">
                              <span>Dán email học viên</span>
                              <textarea rows={5} value={learnerGroupEmailText} onChange={(event) => setLearnerGroupEmailText(event.target.value)} placeholder="mỗi dòng hoặc cách nhau bằng dấu phẩy" />
                            </label>
                          </div>
                          <div className="action-row">
                            <button className="btn btn-primary" disabled={busy || !learnerGroupName.trim() || !learnerGroupEmailText.trim()} onClick={() => void handleCreateLearnerGroup()}>Tạo nhóm học viên</button>
                            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setLearnerGroupEditorMode('closed')}>
                              <X size={16} aria-hidden="true" />
                              Đóng
                            </button>
                          </div>
                        </>
                      ) : null}
                      <div className="production-plan-table-wrap production-plan-glass-panel">
                        <table className="data-table production-plan-table production-plan-table-compact production-plan-table-corporate">
                          <thead>
                            <tr>
                              <th>Nhóm học viên</th>
                              <th>Email</th>
                              <th>Sẵn sàng gán</th>
                              <th>Trạng thái</th>
                              <th>Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deployment.learnerGroups.map((group) => {
                              const isEditing = editingLearnerGroupId === group.id;
                              return [
                                <tr className={activeLearnerGroupId === group.id ? 'is-active' : ''} key={group.id} onClick={() => setActiveLearnerGroupId(group.id)}>
                                  <td><strong>{group.name}</strong><div className="muted-text">{group.description || group.id}</div></td>
                                  <td>{group.emails.length}</td>
                                  <td>{group.studentIds.length}/{group.emails.length}</td>
                                  <td><Badge tone={group.status === 'active' ? 'success' : 'neutral'}>{group.status}</Badge></td>
                                  <td>
                                    <div className="action-row compact-actions">
                                      <button className="btn btn-ghost btn-small" type="button" onClick={(event) => { event.stopPropagation(); handleEditLearnerGroup(group); }}>
                                        <Pencil size={16} aria-hidden="true" />
                                      </button>
                                      <button className="btn btn-ghost btn-small" type="button" disabled={busy || !group.studentIds.length} title="Gán nhóm vào khóa" onClick={(event) => { event.stopPropagation(); handlePrepareAssignLearnerGroupToRun(group); }}>
                                        <Plus size={16} aria-hidden="true" />
                                      </button>
                                      <button className="btn btn-ghost btn-small" type="button" disabled={busy} title="Nhắc học" onClick={(event) => { event.stopPropagation(); void handleRemindLearnerGroup(group); }}>
                                        <BellRing size={16} aria-hidden="true" />
                                      </button>
                                      <button className="btn btn-ghost btn-small" type="button" onClick={(event) => { event.stopPropagation(); void handleDeleteLearnerGroup(group.id); }}>
                                        <Trash2 size={16} aria-hidden="true" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>,
                                isEditing ? (
                                  <tr key={`${group.id}-edit`}>
                                    <td colSpan={5}>
                                      <div className="form-grid">
                                        <label>
                                          <span>Tên nhóm học viên</span>
                                          <input value={editingLearnerGroupName} onChange={(event) => setEditingLearnerGroupName(event.target.value)} />
                                        </label>
                                        <label>
                                          <span>Mô tả</span>
                                          <input value={editingLearnerGroupDescription} onChange={(event) => setEditingLearnerGroupDescription(event.target.value)} />
                                        </label>
                                        <label className="full">
                                          <span>Email học viên</span>
                                          <textarea rows={4} value={editingLearnerGroupEmailText} onChange={(event) => setEditingLearnerGroupEmailText(event.target.value)} />
                                        </label>
                                      </div>
                                      <div className="action-row">
                                        <button className="btn btn-primary" disabled={busy || !editingLearnerGroupName.trim() || !editingLearnerGroupEmailText.trim()} type="button" onClick={() => void handleUpdateLearnerGroup()}>Lưu nhóm</button>
                                        <button className="btn btn-ghost" disabled={busy} type="button" onClick={handleCancelEditLearnerGroup}>Hủy</button>
                                      </div>
                                    </td>
                                  </tr>
                                ) : null,
                              ];
                            })}
                            {!deployment.learnerGroups.length ? <tr><td colSpan={5}><div className="muted-text">Chưa có nhóm học viên.</div></td></tr> : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {effectiveAdminLayer === 'deployment' ? (
                    <div className="stack compact">
                      <div className="action-row">
                        <button className="btn btn-primary btn-small" type="button" onClick={handlePrepareCreateLearningRun} title="Thêm đợt học">
                          <Plus size={16} aria-hidden="true" />
                          <span>Thêm đợt học</span>
                        </button>
                      </div>
                      {runEditorMode !== 'closed' ? (
                        <>
                          <div className="section-eyebrow">{runEditorMode === 'edit' ? 'Sửa đợt học' : 'Thêm đợt học'}</div>
                          <div className="form-grid">
                            <label>
                              <span>Tên đợt học</span>
                              <input value={runName} onChange={(event) => setRunName(event.target.value)} placeholder="VD: Đợt học VNPT E02" />
                            </label>
                            <label>
                              <span>Mã đợt học</span>
                              <input value={runCode} onChange={(event) => setRunCode(event.target.value)} placeholder="VD: VNPT-E02-2026" />
                            </label>
                            <label>
                              <span>Khóa học</span>
                              <select value={runCourseId} onChange={(event) => setRunCourseId(event.target.value)}>
                                <option value="">Chọn khóa học</option>
                                {courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}
                              </select>
                            </label>
                            <div className="full stack compact">
                              <div className="section-eyebrow">Lop hoc trong dot</div>
                              <div className="elearning-run-target-grid">
                                {rosterClasses.map((item) => (
                                  <label className="checkbox-row elearning-run-target-item" key={item.id}>
                                    <input
                                      type="checkbox"
                                      checked={runTargetClassIds.includes(item.id)}
                                      onChange={() => toggleRunTargetClass(item.id)}
                                    />
                                    <span className="elearning-run-target-label">{item.name} ({getElearningClassLearnerCount(deployment, item.id)} hoc vien)</span>
                                  </label>
                                ))}
                                {!rosterClasses.length ? <div className="muted-text">Chua co lop hoc nao.</div> : null}
                              </div>
                            </div>
                            <div className="full stack compact">
                              <div className="section-eyebrow">Nhom hoc vien trong dot</div>
                              <div className="elearning-run-target-grid">
                                {deployment.learnerGroups.map((group) => (
                                  <label className="checkbox-row elearning-run-target-item" key={group.id}>
                                    <input
                                      type="checkbox"
                                      checked={runTargetGroupIds.includes(group.id)}
                                      onChange={() => toggleRunTargetGroup(group.id)}
                                    />
                                    <span className="elearning-run-target-label">{group.name} ({group.studentIds.length}/{group.emails.length} san sang)</span>
                                  </label>
                                ))}
                                {!deployment.learnerGroups.length ? <div className="muted-text">Chua co nhom hoc vien nao.</div> : null}
                              </div>
                            </div>
                            <label>
                              <span>Ngày active</span>
                              <input type="datetime-local" value={runStartAt} onChange={(event) => setRunStartAt(event.target.value)} />
                            </label>
                            <label>
                              <span>Ngày đóng</span>
                              <input type="datetime-local" value={runEndAt} onChange={(event) => setRunEndAt(event.target.value)} />
                            </label>
                          </div>
                          <div className="action-row">
                            <button
                              className="btn btn-primary"
                              disabled={busy || !runName.trim() || !runCourseId || !selectedRunTargetCount}
                              onClick={() => void (runEditorMode === 'edit' ? handleSaveLearningRunEdit() : handleCreateLearningRun())}
                            >
                              {runEditorMode === 'edit' ? 'Lưu đợt học' : 'Tạo đợt học'}
                            </button>
                            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => { setRunEditorMode('closed'); resetRunEditorFields(); }}>
                              <X size={16} aria-hidden="true" />
                              Đóng
                            </button>
                          </div>
                        </>
                      ) : null}
                      <div className="production-plan-table-wrap production-plan-glass-panel">
                        <table className="data-table production-plan-table production-plan-table-compact production-plan-table-corporate">
                          <thead>
                            <tr>
                              <th>Đợt học</th>
                              <th>Khóa học</th>
                              <th>Lớp / nhóm</th>
                              <th>Học viên</th>
                              <th>Thời gian</th>
                              <th>Trạng thái</th>
                              <th>Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {learningRuns.map((item) => {
                              const course = courses.find((courseItem) => courseItem.id === item.courseId);
                              const learnerCount = deployment.enrollments.filter((enrollment) => enrollment.classId === item.id).length;
                              const trainingClass = item.trainingClassId ? vtrainingClasses.find((classItem) => classItem.id === item.trainingClassId) : null;
                              const runTargets = deployment.runTargets.filter((target) => target.runClassId === item.id && target.status === 'active');
                              const targetClassNames = runTargets
                                .filter((target) => target.targetType === 'class')
                                .map((target) => rosterClasses.find((classItem) => classItem.id === target.targetId)?.name || target.targetId);
                              const targetGroupNames = runTargets
                                .filter((target) => target.targetType === 'group')
                                .map((target) => deployment.learnerGroups.find((group) => group.id === target.targetId)?.name || target.targetId);
                              const learnerGroupIds = deployment.enrollments
                                .filter((enrollment) => enrollment.classId === item.id)
                                .map((enrollment) => String(enrollment.metadata?.learnerGroupId || ''))
                                .filter(Boolean);
                              const learnerGroup = deployment.learnerGroups.find((group) => learnerGroupIds.includes(group.id));
                              const audienceLabel = [...targetClassNames, ...targetGroupNames].join(', ')
                                || (item.trainingClassId ? trainingClass?.name || 'Lop hoc' : learnerGroup?.name || 'Nhom hoc vien');
                              return (
                                <tr className={activeClassId === item.id ? 'is-active' : ''} key={item.id} onClick={() => setActiveClassId(item.id)}>
                                  <td><strong>{item.name}</strong><div className="muted-text">{item.code || item.id}</div></td>
                                  <td>{course?.title || item.courseId}</td>
                                  <td>{audienceLabel}</td>
                                  <td>{learnerCount}</td>
                                  <td>{formatDateOnly(item.startAt)} - {formatDateOnly(item.endAt)}</td>
                                  <td><Badge tone={item.status === 'open' ? 'success' : item.status === 'paused' ? 'warning' : 'neutral'}>{item.status}</Badge></td>
                                  <td>
                                    <div className="action-row compact-actions">
                                      <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); handlePrepareEditLearningRun(item); }} title="Sửa đợt học">
                                        <Pencil size={16} aria-hidden="true" />
                                      </button>
                                      <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); void handleDeleteLearningRun(item); }} title="Xóa đợt học">
                                        <Trash2 size={16} aria-hidden="true" />
                                      </button>
                                      <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); void handleToggleClassStatus(item); }} title={item.status === 'open' ? 'Tạm dừng đợt học' : 'Active đợt học'}>
                                        {item.status === 'open' ? <PauseCircle size={16} aria-hidden="true" /> : <PlayCircle size={16} aria-hidden="true" />}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {!learningRuns.length ? <tr><td colSpan={7}><div className="muted-text">Chưa có đợt học.</div></td></tr> : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </Card>
              </div>
            ) : null}

            {effectiveAdminLayer === 'quiz' ? (
              <div className="elearning-layer-grid two">
                <Card title="Đề kiểm tra E-learning">
                  <div className="elearning-lesson-table">
                    {quizForms.map((form) => (
                      <div className="elearning-lesson-row" key={form.id}>
                        <div>
                          <strong>{form.title}</strong>
                          <span>
                            Bộ câu hỏi: {form.questionSetId || 'Chưa chọn'} · Chọn {form.questionCount} câu · {form.durationMinutes} phút · {form.maxAttempts} lượt làm
                          </span>
                          <span>
                            {form.shuffleQuestions ? 'Trộn thứ tự câu hỏi' : 'Giữ thứ tự câu hỏi'} · {form.shuffleOptions ? 'Trộn đáp án' : 'Giữ thứ tự đáp án'} · Mã đề: {form.id}
                          </span>
                        </div>
                        <Badge tone="neutral">Bài kiểm tra</Badge>
                      </div>
                    ))}
                    {!quizForms.length ? <div className="muted-text">Chưa có đề kiểm tra.</div> : null}
                  </div>
                </Card>

                <Card title="Gắn đề vào khóa">
                  <div className="form-grid single">
                    <label>
                      <span>Khóa học</span>
                      <select value={activeCourseId} onChange={(event) => setActiveCourseId(event.target.value)}>
                        {courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Đề kiểm tra</span>
                      <select value={selectedCourseQuizFormId} onChange={(event) => setSelectedCourseQuizFormId(event.target.value)}>
                        <option value="">Chưa gắn bài kiểm tra</option>
                        {quizForms.map((form) => (
                          <option value={form.id} key={form.id}>{form.title}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="action-row">
                    <button className="btn btn-primary" disabled={!activeCourse || busy} onClick={() => void handleUpdateCourseQuiz()}>
                      Lưu đề kiểm tra
                    </button>
                  </div>
                </Card>
              </div>
            ) : null}

            {effectiveAdminLayer === 'reports' ? (
              <Card
                title="Thống kê kết quả học"
                action={<button className="btn btn-ghost btn-small" disabled={!classReportRows.length} onClick={handleExportClassReport}>Export Excel</button>}
              >
                <div className="form-grid">
                  <label>
                    <span>Loại thống kê</span>
                    <select value={reportScopeType} onChange={(event) => setReportScopeType(event.target.value as typeof reportScopeType)}>
                      <option value="deployment">Theo đợt học</option>
                      <option value="class">Theo lớp học</option>
                      <option value="group">Theo nhóm học viên</option>
                    </select>
                  </label>
                  {reportScopeType === 'group' ? (
                    <label>
                      <span>Nhóm học viên</span>
                      <select value={activeLearnerGroupId} onChange={(event) => setActiveLearnerGroupId(event.target.value)}>
                        {deployment.learnerGroups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}
                      </select>
                    </label>
                  ) : (
                    <label>
                      <span>Đợt học / lớp học</span>
                      <select value={activeClassId} onChange={(event) => setActiveClassId(event.target.value)}>
                        {(reportScopeType === 'class' ? rosterClasses : learningRuns).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                      </select>
                    </label>
                  )}
                  <div className="full muted-text">
                    Hiển thị {reportPageSize} dòng mỗi trang. Dùng Export Excel để lấy đầy đủ dữ liệu theo scope đang chọn.
                  </div>
                </div>

                <div className="elearning-course-head">
                  <div>
                    <strong>{reportScopeType === 'group' ? activeLearnerGroup?.name || 'Chưa chọn nhóm' : activeClass?.name || 'Chưa chọn đợt học'}</strong>
                    <p>{classReportRows.length} dòng · trang {classReportCurrentPage}/{classReportTotalPages} · scope {reportScopeType} · {reportScopeId || 'chưa chọn'}</p>
                  </div>
                  <Badge tone={activeClass?.status === 'open' ? 'success' : activeClass?.status === 'paused' ? 'warning' : 'neutral'}>{activeClass?.status || 'n/a'}</Badge>
                </div>

                <div className="production-plan-table-wrap production-plan-glass-panel">
                  <table className="data-table production-plan-table production-plan-table-compact production-plan-table-corporate">
                    <thead>
                      <tr>
                        <th>Học viên</th>
                        <th>Email</th>
                        <th>Lớp / Nhóm học viên</th>
                        <th>Tiến độ</th>
                        <th>Điểm</th>
                        <th>Tình trạng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classReportVisibleRows.map((row) => (
                        <tr key={row.enrollment.id}>
                          <td><strong>{row.student.fullName || 'Chưa có tên'}</strong><div className="muted-text">{row.student.employeeCode || row.student.id}</div></td>
                          <td>{row.student.email}</td>
                          <td>{getReportAudienceLabel(row, deployment)}</td>
                          <td>{row.result.progressPercent}%</td>
                          <td>{row.result.scormScore ?? row.result.quizScore ?? '-'}</td>
                          <td><Badge tone={getLearningStatusTone(row.result.finalStatus)}>{getLearningStatusLabel(row.result.finalStatus)}</Badge></td>
                        </tr>
                      ))}
                      {!classReportRows.length ? <tr><td colSpan={6}><div className="muted-text">Chưa có dữ liệu thống kê theo scope đang chọn.</div></td></tr> : null}
                    </tbody>
                  </table>
                </div>
                {classReportRows.length > reportPageSize ? (
                  <div className="action-row">
                    <button
                      className="btn btn-ghost btn-small"
                      type="button"
                      disabled={classReportCurrentPage <= 1}
                      onClick={() => setClassReportPage((page) => Math.max(1, page - 1))}
                    >
                      Trước
                    </button>
                    <span className="muted-text">
                      {classReportStartIndex + 1}-{Math.min(classReportStartIndex + reportPageSize, classReportRows.length)} / {classReportRows.length}
                    </span>
                    <button
                      className="btn btn-ghost btn-small"
                      type="button"
                      disabled={classReportCurrentPage >= classReportTotalPages}
                      onClick={() => setClassReportPage((page) => Math.min(classReportTotalPages, page + 1))}
                    >
                      Sau
                    </button>
                  </div>
                ) : null}
              </Card>
            ) : null}
          </div>
        </section>
      </>
    );

    return (
      <>
        <section className="elearning-console-head" aria-label="Không gian quản trị VLearning">
          <div>
            <span><strong>VLearning</strong> / Quản trị & Manager</span>
            <h1>Không gian quản trị khóa học</h1>
          </div>
          <span>VINABRAIN VLEARNING ADMIN SPACE V3.0</span>
        </section>

        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

        <section className="elearning-admin-guard" aria-label="Hệ thống phân tích đợt học tập">
          <div>
            <Layers size={20} aria-hidden="true" />
            <div>
              <strong>Hệ thống phân tích đợt học tập</strong>
              <span>Dữ liệu quản trị đọc theo khóa, lớp và học viên; màn học viên vẫn chạy nhẹ, tách khỏi dashboard báo cáo.</span>
            </div>
          </div>
          <div className="elearning-admin-guard-meta">
            <span>SCORM 2004</span>
            <span>Bài native</span>
            <span>Vimeo iframe</span>
          </div>
        </section>

        <section className="elearning-library-hero" aria-label="Thư viện bài giảng">
          <div className="elearning-library-copy">
            <span className="section-eye"><Library size={14} aria-hidden="true" /> Thư viện bài giảng</span>
            <h2>Khởi tạo bài giảng bằng SCORM hoặc bài native</h2>
            <p>Tạo bài từ SCORM/iSpring hoặc bài native gồm video Vimeo nhúng trực tiếp, câu hỏi inline và bài kiểm tra cuối khóa.</p>
          </div>
          <div className="elearning-library-actions">
            <Link className="btn btn-primary" to="/vlearning/admin?layer=lesson">
              Tạo bài native
            </Link>
            <Link className="btn btn-ghost" to="/vlearning/admin?layer=lesson">
              Upload SCORM
            </Link>
          </div>
          <div className="elearning-library-modes" aria-label="Loại bài trong thư viện">
            <div>
              <BookOpen size={16} aria-hidden="true" />
              <strong>{nativeLessonCount}</strong>
              <span>Bài native</span>
            </div>
            <div>
              <PackageCheck size={16} aria-hidden="true" />
              <strong>{scormLessonCount}</strong>
              <span>SCORM/iSpring</span>
            </div>
            <div>
              <PlayCircle size={16} aria-hidden="true" />
              <strong>{vimeoLessonCount}</strong>
              <span>Bài Vimeo</span>
            </div>
          </div>
        </section>

        <section className="lecturer-bank-shell student-survey-results-shell elearning-management-shell">
          <div className="vsurvey-module-layout elearning-module-layout">
            <aside className="vsurvey-sidebar" aria-label="Điều hướng VLearning">
              <button className="is-active" type="button">Danh sách khóa học</button>
              <button type="button" onClick={() => activeCourse && openCourseManagement(activeCourse)} disabled={!activeCourse}>
                Layer chi tiết
              </button>
            </aside>

            <div className="vsurvey-module-main">
              <div className="kpi-row elearning-kpi-row">
                <Kpi label="Khóa học" value={String(courses.length)} sub="Tổng số khóa" tone="violet" />
                <Kpi label="Đang active" value={String(courses.filter((course) => course.status === 'published').length)} sub="Học viên có thể vào học" tone="success" />
                <Kpi label="Kho bài học" value={String(lessonLibrary.length)} sub="Bài tái sử dụng" tone="warning" />
                <Kpi label="SCORM" value={String(scormPackages.length)} sub="Package đã upload" tone="neutral" />
              </div>

              <div className="lecturer-bank-content-grid elearning-list-layer-grid">
                <div className="lecturer-bank-main">
                  <Card title="Danh sách khóa học">
                    <div className="stack compact">
                      <div className="production-plan-filter-grid vsurvey-table-filters">
                        <label>
                          <span>Trạng thái</span>
                          <select value={courseStatusFilter} onChange={(event) => setCourseStatusFilter(event.target.value as typeof courseStatusFilter)}>
                            <option value="all">Tất cả</option>
                            <option value="published">Đang active</option>
                            <option value="draft">Bản nháp</option>
                            <option value="closed">Đã đóng</option>
                          </select>
                        </label>
                        <label>
                          <span>Tìm khóa học</span>
                          <input value={courseKeyword} onChange={(event) => setCourseKeyword(event.target.value)} placeholder="Mã, tên khóa, mô tả" />
                        </label>
                        <div className="vsurvey-table-meta">Hiển thị {filteredCourses.length} khóa học</div>
                      </div>

                      <div className="elearning-course-card-grid" aria-label="Khóa học nổi bật">
                        {filteredCourses.slice(0, 4).map((course) => {
                          const courseClassCount = learningRuns.filter((item) => item.courseId === course.id).length;
                          return (
                            <article className={`elearning-course-card${activeCourse?.id === course.id ? ' is-active' : ''}`} key={course.id}>
                              <div className="elearning-course-card-media">
                                <span>{course.status === 'published' ? 'ACTIVE' : course.status.toUpperCase()}</span>
                                <strong>{course.id.slice(0, 2).toUpperCase()}</strong>
                              </div>
                              <div className="elearning-course-card-body">
                                <div className="elearning-course-card-kicker">
                                  <BookOpen size={13} aria-hidden="true" />
                                  {course.lessonCount} bài học · {courseClassCount} lớp
                                </div>
                                <h3>{course.title}</h3>
                                <p>{course.description || 'Khóa học chưa có mô tả.'}</p>
                                <div className="elearning-course-card-footer">
                                  <Badge tone={getCourseStatusTone(course.status)}>{getCourseStatusLabel(course.status)}</Badge>
                                  <button className="btn btn-ghost btn-small" type="button" onClick={() => openCourseManagement(course)}>
                                    Mở layer
                                  </button>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>

                      <div className="production-plan-table-wrap production-plan-glass-panel">
                        <table className="data-table production-plan-table production-plan-table-compact production-plan-table-corporate elearning-courses-table">
                          <thead>
                            <tr>
                              <th>Mã khóa</th>
                              <th>Tên khóa học</th>
                              <th>Cấu trúc</th>
                              <th>Lớp</th>
                              <th>Ngưỡng</th>
                              <th>Quiz</th>
                              <th>Trạng thái</th>
                              <th>Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredCourses.map((course) => {
                              const courseClassCount = learningRuns.filter((item) => item.courseId === course.id).length;
                              return (
                                <tr className={activeCourse?.id === course.id ? 'is-active' : ''} key={course.id} onClick={() => openCourseManagement(course)}>
                                  <td>
                                    <div className="fw6 text-ellipsis">{course.id}</div>
                                    <div className="muted-text">{course.createdAt ? formatDateOnly(course.createdAt) : '-'}</div>
                                  </td>
                                  <td className="production-plan-col-product-name">
                                    <div className="fw6">{course.title}</div>
                                    <div className="muted-text text-ellipsis">{course.description || 'Chưa có mô tả khóa học.'}</div>
                                  </td>
                                  <td>{course.lessonCount} bài</td>
                                  <td>{courseClassCount}</td>
                                  <td>{course.completionThreshold}%</td>
                                  <td>{course.finalQuizFormId ? 'Đã gắn' : 'Chưa gắn'}</td>
                                  <td><Badge tone={getCourseStatusTone(course.status)}>{getCourseStatusLabel(course.status)}</Badge></td>
                                  <td>
                                    <div className="production-plan-row-actions production-plan-row-actions-icons">
                                      <button className="btn btn-ghost btn-small" type="button" onClick={(event) => { event.stopPropagation(); openCourseManagement(course); }}>
                                        Chi tiết
                                      </button>
                                      <Link className="btn btn-primary btn-small" to={`/vlearning/${course.id}`} onClick={(event) => event.stopPropagation()}>
                                        Vào học
                                      </Link>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {!filteredCourses.length ? (
                              <tr>
                                <td colSpan={8}><div className="muted-text">Không có khóa học khớp bộ lọc.</div></td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </Card>
                </div>

                <aside className="lecturer-bank-side">
                  <Card title="Tạo khóa học nhanh">
                    <div className="stack compact">
                      <label className="lecturer-bank-inline-field">
                        <span>Tên khóa học</span>
                        <input value={courseTitle} onChange={(event) => setCourseTitle(event.target.value)} />
                      </label>
                      <label className="lecturer-bank-inline-field">
                        <span>Mô tả khóa học</span>
                        <textarea rows={4} value={courseDescription} onChange={(event) => setCourseDescription(event.target.value)} />
                      </label>
                      <label className="lecturer-bank-inline-field">
                        <span>Quiz tổng kết sau khóa</span>
                        <select value={courseQuizFormId} onChange={(event) => setCourseQuizFormId(event.target.value)}>
                          <option value="">Chưa gắn quiz</option>
                          {quizForms.map((form) => (
                            <option value={form.id} key={form.id}>{form.title}</option>
                          ))}
                        </select>
                      </label>
                      <div className="action-row">
                        <button className="btn btn-primary" onClick={() => void handleCreateCourse()} disabled={busy || !canManage}>
                          {busy ? 'Đang tạo...' : 'Tạo khóa'}
                        </button>
                      </div>
                    </div>
                  </Card>
                </aside>
              </div>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <SectionHeader
        eye="E-learning"
        title={activeCourse ? activeCourse.title : 'Chi tiết khóa học'}
        subtitle="Layer chi tiết quản lý khóa học: bài học, SCORM, quiz, active và link học viên."
        actions={(
          <div className="action-row">
            <Link className="btn btn-ghost" to="/vlearning">← Danh sách khóa học</Link>
            {activeCourse ? <Link className="btn btn-primary" to={`/vlearning/${activeCourse.id}`}>Xem giao diện học</Link> : null}
          </div>
        )}
      />

      <section className="vsurvey-brand-panel elearning-brand-panel" aria-label="VLearning detail">
        <div className="vsurvey-brand-lockup">
          <span className="vsurvey-brand-logo elearning-brand-logo" aria-hidden="true">EL</span>
          <div>
            <strong>{activeCourse?.title || 'VLearning'}</strong>
            <span>{activeCourse?.description || 'Cấu hình nội dung học, SCORM package và trạng thái phát hành.'}</span>
          </div>
        </div>
        <div className="vsurvey-brand-actions">
          {activeCourse ? <Badge tone={getCourseStatusTone(activeCourse.status)}>{getCourseStatusLabel(activeCourse.status)}</Badge> : null}
        </div>
      </section>

      <section className="elearning-shell elearning-detail-layer">
        <div className="kpi-row">
          <Kpi label="Khóa học" value={String(courses.length)} sub="Có thể active" tone="violet" />
          <Kpi label="Kho bài học" value={String(lessonLibrary.length)} sub="Tái sử dụng trong khóa" tone="success" />
          <Kpi label="Phần trong bài" value={String(selectedLessonParts.length)} sub={activeLesson?.title || 'Chưa chọn'} tone="warning" />
          <Kpi label="Tiến độ mẫu" value={`${completionPercent}%`} sub="Tài khoản hiện tại" tone="neutral" />
        </div>

        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

        <div className="elearning-layout">
          <aside className="elearning-side">
            <Card title="1. Tạo bài học">
              <div className="form-grid single">
                <label>
                  <span>Tên bài</span>
                  <input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} />
                </label>
                <label>
                  <span>Mô tả bài</span>
                  <textarea rows={3} value={lessonDescription} onChange={(event) => setLessonDescription(event.target.value)} />
                </label>
              </div>
              <div className="action-row">
                <button className="btn btn-primary" onClick={() => void handleCreateLesson()} disabled={busy || !canManage}>Tạo bài</button>
              </div>
            </Card>

            <Card title="1A. Tạo bài native">
              <div className="form-grid single">
                <label>
                  <span>Tên bài native</span>
                  <input value={nativeLessonTitle} onChange={(event) => setNativeLessonTitle(event.target.value)} />
                </label>
                <label>
                  <span>Mô tả bài native</span>
                  <textarea rows={3} value={nativeLessonDescription} onChange={(event) => setNativeLessonDescription(event.target.value)} />
                </label>
              </div>
              <div className="action-row">
                <button className="btn btn-primary" onClick={() => void handleCreateNativeLesson()} disabled={busy || !canManage}>Tạo bài native</button>
              </div>
              <div className="muted-text">Bài native dùng Vimeo nhúng trực tiếp và câu hỏi inline, không cần SCORM.</div>
            </Card>

            <Card title="1B. Upload bài học SCORM">
              <div className="form-grid single">
                <label>
                  <span>Tên bài SCORM</span>
                  <input value={scormLessonTitle} onChange={(event) => setScormLessonTitle(event.target.value)} />
                </label>
                <label>
                  <span>Mô tả</span>
                  <textarea rows={3} value={scormLessonDescription} onChange={(event) => setScormLessonDescription(event.target.value)} />
                </label>
                <label>
                  <span>File SCORM .zip</span>
                  <input type="file" accept=".zip,application/zip,application/x-zip-compressed" onChange={(event) => setScormFile(event.target.files?.[0] || null)} />
                </label>
                <label>
                  <span>Điều kiện hoàn thành</span>
                  <select value={scormCompletionRule} onChange={(event) => setScormCompletionRule(event.target.value as typeof scormCompletionRule)}>
                    <option value="completed">SCORM completed</option>
                    <option value="passed">SCORM passed</option>
                    <option value="score">Điểm tối thiểu</option>
                  </select>
                </label>
                <label>
                  <span>Điểm tối thiểu</span>
                  <input type="number" min={0} max={100} value={scormPassingScore} onChange={(event) => setScormPassingScore(Number(event.target.value || 70))} />
                </label>
              </div>
              <div className="action-row">
                <button className="btn btn-primary" onClick={() => void handleCreateScormLesson()} disabled={busy || !canManage || !scormFile}>
                  Upload và tạo bài SCORM
                </button>
              </div>
              {scormPackages.length ? <div className="muted-text">Đã có {scormPackages.length} package SCORM trong thư viện.</div> : null}
            </Card>

            <Card title="Kho bài học">
              <div className="elearning-list">
                {lessonLibrary.map((lesson) => (
                  <button className={`elearning-list-row${activeLesson?.id === lesson.id ? ' active' : ''}`} key={lesson.id} onClick={() => setActiveLessonId(lesson.id)}>
                    <span>
                      <strong>{lesson.title}</strong>
                      <em>{lesson.id} · {lesson.partCount} phần</em>
                    </span>
                    <Badge tone={lesson.status === 'published' ? 'success' : 'warning'}>{lesson.status}</Badge>
                  </button>
                ))}
              </div>
            </Card>
          </aside>

          <main className="elearning-main">
            <Card title="2. Thêm phần vào bài">
              <div className="form-grid">
                <label>
                  <span>Bài đang chọn</span>
                  <select value={activeLessonId} onChange={(event) => setActiveLessonId(event.target.value)}>
                    {lessonLibrary.filter((lesson) => lesson.lessonType !== 'scorm').map((lesson) => <option value={lesson.id} key={lesson.id}>{lesson.title}</option>)}
                  </select>
                </label>
                <label>
                  <span>Tiêu đề phần</span>
                  <input value={partTitle} onChange={(event) => setPartTitle(event.target.value)} />
                </label>
                <label>
                  <span>Link Vimeo / ID</span>
                  <input value={partVideoUrl} onChange={(event) => setPartVideoUrl(event.target.value)} placeholder="https://vimeo.com/123456789" />
                </label>
                <label>
                  <span>Thời lượng phút</span>
                  <input type="number" min={1} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value || 1))} />
                </label>
                <label className="full">
                  <span>Mô tả / ghi chú phần</span>
                  <textarea rows={3} value={partContent} onChange={(event) => setPartContent(event.target.value)} />
                </label>
              </div>
              <div className="action-row">
                <label className="checkbox-row"><input type="checkbox" checked={isPreview} onChange={(event) => setIsPreview(event.target.checked)} /> Cho xem preview</label>
                <button className="btn btn-primary" onClick={() => void handleCreatePart()} disabled={busy || !activeLesson || !canManage}>Thêm phần Vimeo</button>
              </div>
            </Card>

            <Card title="2B. Thêm block native">
              <div className="form-grid">
                <label>
                  <span>Bài native đang chọn</span>
                  <select value={activeLessonId} onChange={(event) => setActiveLessonId(event.target.value)}>
                    {lessonLibrary.filter((lesson) => lesson.lessonType === 'native_sequence').map((lesson) => <option value={lesson.id} key={lesson.id}>{lesson.title}</option>)}
                  </select>
                </label>
                <label>
                  <span>Loại block</span>
                  <select value={nativeBlockType} onChange={(event) => setNativeBlockType(event.target.value as ElearningLessonBlockType)}>
                    <option value="video">Video Vimeo</option>
                    <option value="single_choice">Câu hỏi single choice</option>
                    <option value="multiple_choice">Câu hỏi multiple choice</option>
                    <option value="fill_gap">Fill in gap</option>
                    <option value="short_answer">Short answer</option>
                  </select>
                </label>
                <label>
                  <span>Tiêu đề block</span>
                  <input value={nativeBlockTitle} onChange={(event) => setNativeBlockTitle(event.target.value)} />
                </label>
                {nativeBlockType === 'video' ? (
                  <label>
                    <span>Link Vimeo / ID</span>
                    <input value={nativeBlockVideoUrl} onChange={(event) => setNativeBlockVideoUrl(event.target.value)} placeholder="https://vimeo.com/123456789" />
                  </label>
                ) : (
                  <>
                    <label>
                      <span>Chọn từ kho quiz</span>
                      <select value={quizSourceFormId} onChange={(event) => void handleLoadQuizQuestionBank(event.target.value)}>
                        <option value="">Nhập câu hỏi mới</option>
                        {quizForms.map((form) => <option value={form.id} key={form.id}>{form.title}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Câu hỏi trong quiz</span>
                      <select value={quizSourceQuestionId} onChange={(event) => handleUseQuizQuestion(event.target.value)} disabled={!quizQuestionBank.length}>
                        <option value="">Chọn câu hỏi</option>
                        {quizQuestionBank.map((question) => <option value={question.id} key={question.id}>{question.code}. {question.prompt}</option>)}
                      </select>
                    </label>
                    <label className="full">
                      <span>Các lựa chọn, mỗi dòng một đáp án</span>
                      <textarea rows={4} value={nativeBlockOptions} onChange={(event) => setNativeBlockOptions(event.target.value)} />
                    </label>
                    <label>
                      <span>Đáp án đúng</span>
                      <input value={nativeBlockCorrectAnswer} onChange={(event) => setNativeBlockCorrectAnswer(event.target.value)} placeholder="Nhập đúng nội dung đáp án" />
                    </label>
                  </>
                )}
                <label className="full">
                  <span>{nativeBlockType === 'video' ? 'Nội dung / hướng dẫn' : 'Nội dung câu hỏi'}</span>
                  <textarea rows={3} value={nativeBlockContent} onChange={(event) => setNativeBlockContent(event.target.value)} />
                </label>
              </div>
              <div className="action-row">
                <button className="btn btn-primary" onClick={() => void handleCreateNativeBlock()} disabled={busy || !canManage || activeLesson?.lessonType !== 'native_sequence'}>Thêm block native</button>
              </div>
            </Card>

            <Card title="Các phần trong bài đang chọn">
              <div className="elearning-lesson-table">
                {selectedLessonParts.map((part) => (
                  <div className="elearning-lesson-row" key={part.id}>
                    <div>
                      <strong>{part.title}</strong>
                      <span>{part.videoId} · {formatDuration(part.durationSeconds)} · {part.isPreview ? 'preview' : 'locked'}</span>
                    </div>
                    <Badge tone={part.isPreview ? 'success' : 'neutral'}>{part.isPreview ? 'preview' : 'học viên'}</Badge>
                  </div>
                ))}
                {!selectedLessonParts.length ? <div className="muted-text">Chưa có phần trong bài này.</div> : null}
              </div>
            </Card>

            <Card title="Các block native trong bài đang chọn">
              <div className="elearning-lesson-table">
                {selectedLessonBlocks.map(renderNativeBlockPreview)}
                {!selectedLessonBlocks.length ? <div className="muted-text">Chưa có block native trong bài này.</div> : null}
              </div>
            </Card>

            <div className="elearning-layout">
              <Card title="3. Tạo khóa học">
                <div className="form-grid single">
                  <label>
                    <span>Tên khóa học</span>
                    <input value={courseTitle} onChange={(event) => setCourseTitle(event.target.value)} />
                  </label>
                  <label>
                    <span>Mô tả khóa học</span>
                    <textarea rows={3} value={courseDescription} onChange={(event) => setCourseDescription(event.target.value)} />
                  </label>
                  <label>
                    <span>Quiz tổng kết sau khóa</span>
                    <select value={courseQuizFormId} onChange={(event) => setCourseQuizFormId(event.target.value)}>
                      <option value="">Chưa gắn quiz</option>
                      {quizForms.map((form) => (
                        <option value={form.id} key={form.id}>{form.title}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="action-row">
                  <button className="btn btn-primary" onClick={() => void handleCreateCourse()} disabled={busy || !canManage}>Tạo khóa</button>
                </div>
              </Card>

              <Card title="4. Chọn bài vào khóa và active">
                <div className="form-grid single">
                  <label>
                    <span>Khóa học</span>
                    <select value={activeCourseId} onChange={(event) => handleSelectManagedCourse(event.target.value)}>
                      {courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}
                    </select>
                  </label>
                </div>
                {activeCourse ? (
                  <div className="elearning-course-head">
                    <div>
                      <p>{activeCourse.description || 'Chưa có mô tả khóa học.'}</p>
                      <div className="muted-text">{buildCourseLearnLink(activeCourse.id)}</div>
                    </div>
                    <Badge tone={getCourseStatusTone(activeCourse.status)}>{activeCourse.status}</Badge>
                  </div>
                ) : null}
                <div className="form-grid single">
                  <label>
                    <span>Bài kiểm tra cuối khóa</span>
                    <select value={selectedCourseQuizFormId} onChange={(event) => setSelectedCourseQuizFormId(event.target.value)}>
                      <option value="">Chưa gắn quiz</option>
                      {quizForms.map((form) => (
                        <option value={form.id} key={form.id}>{form.title}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="action-row">
                  <button className="btn btn-primary" disabled={!activeCourse || busy} onClick={() => void handleUpdateCourseQuiz()}>
                    Lưu quiz cho khóa
                  </button>
                  <button className="btn btn-ghost" disabled={!activeCourse} onClick={() => activeCourse && void toggleCourseStatus(activeCourse)}>
                    {activeCourse?.status === 'published' ? 'Tắt active' : 'Active khóa'}
                  </button>
                  {activeCourse ? <button className="btn btn-ghost" onClick={() => void navigator.clipboard.writeText(buildCourseLearnLink(activeCourse.id))}>Copy link học</button> : null}
                </div>
                <div className="elearning-lesson-table">
                  {lessonLibrary.map((lesson) => {
                    const added = bundle?.lessons.some((item) => item.id === lesson.id);
                    return (
                      <div className="elearning-lesson-row" key={lesson.id}>
                        <div>
                          <strong>{lesson.title}</strong>
                          <span>{lesson.partCount} phần · {lesson.description || 'Bài học Vimeo'}</span>
                        </div>
                        <button className="btn btn-ghost btn-small" disabled={busy || added || !activeCourse} onClick={() => void handleAddLessonToCourse(lesson)}>
                          {added ? 'Đã chọn' : 'Chọn vào khóa'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>

            {false ? <Card
              title="5. Triển khai lớp học và import học viên"
              action={<button className="btn btn-ghost btn-small" disabled={!classReportRows.length} onClick={handleExportClassReport}>Xuất báo cáo lớp</button>}
            >
              <div className="form-grid">
                <label>
                  <span>Khách hàng</span>
                  <select value={activeClientId} onChange={(event) => setActiveClientId(event.target.value)}>
                    <option value="">Chọn khách hàng</option>
                    {deployment.clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Dự án đào tạo</span>
                  <select value={activeProjectId} onChange={(event) => setActiveProjectId(event.target.value)}>
                    <option value="">Chọn dự án</option>
                    {deployment.projects.filter((project) => !activeClientId || project.clientId === activeClientId).map((project) => (
                      <option value={project.id} key={project.id}>{project.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Lớp triển khai</span>
                  <select value={activeClassId} onChange={(event) => setActiveClassId(event.target.value)}>
                    <option value="">Chọn lớp</option>
                    {deployment.classes.filter((item) => !activeProjectId || item.projectId === activeProjectId).map((item) => (
                      <option value={item.id} key={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="elearning-layout">
                <div className="form-grid single">
                  <label>
                    <span>Tên khách hàng</span>
                    <input value={clientName} onChange={(event) => setClientName(event.target.value)} />
                  </label>
                  <label>
                    <span>Mã khách hàng</span>
                    <input value={clientCode} onChange={(event) => setClientCode(event.target.value)} placeholder="VD: PO" />
                  </label>
                  <button className="btn btn-primary" disabled={busy} onClick={() => void handleCreateClient()}>Tạo khách hàng</button>
                </div>

                <div className="form-grid single">
                  <label>
                    <span>Tên dự án</span>
                    <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
                  </label>
                  <label>
                    <span>Mã dự án</span>
                    <input value={projectCode} onChange={(event) => setProjectCode(event.target.value)} placeholder="VD: ONB-2026" />
                  </label>
                  <button className="btn btn-primary" disabled={busy || !activeClient} onClick={() => void handleCreateProject()}>Tạo dự án</button>
                </div>
              </div>

              <div className="form-grid">
                <label>
                  <span>Tên lớp</span>
                  <input value={className} onChange={(event) => setClassName(event.target.value)} />
                </label>
                <label>
                  <span>Mã lớp</span>
                  <input value={classCode} onChange={(event) => setClassCode(event.target.value)} placeholder="VD: PO-ONB-2026-05" />
                </label>
                <label>
                  <span>Khóa học áp dụng</span>
                  <select value={activeCourseId} onChange={(event) => handleSelectManagedCourse(event.target.value)}>
                    {courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}
                  </select>
                </label>
                <label className="full">
                  <span>Lớp VTraining dùng chung roster</span>
                  <select value={activeVTrainingClassId} onChange={(event) => setActiveVTrainingClassId(event.target.value)}>
                    <option value="">Chọn lớp VTraining</option>
                    {vtrainingClasses.map((item) => (
                      <option value={item.id} key={item.id}>{item.code ? `${item.code} - ${item.name}` : item.name}</option>
                    ))}
                  </select>
                </label>
                {activeVTrainingClass ? (
                  <div className="full muted-text">
                    Roster VTraining: {activeVTrainingRosterCount} học viên
                    {linkedVLearningClassName ? ` · Đã gán vào VLearning: ${linkedVLearningClassName}` : ''}
                  </div>
                ) : null}
                <label>
                  <span>Thời gian mở lớp</span>
                  <input type="datetime-local" value={classStartAt} onChange={(event) => setClassStartAt(event.target.value)} />
                </label>
                <label>
                  <span>Thời gian đóng lớp</span>
                  <input type="datetime-local" value={classEndAt} onChange={(event) => setClassEndAt(event.target.value)} />
                </label>
                <label>
                  <span>File học viên CSV</span>
                  <input type="file" accept=".csv,text/csv" onChange={(event) => void handlePreviewStudentImport(event.target.files?.[0] || null)} />
                </label>
              </div>

              <div className="action-row">
                <button className="btn btn-ghost" disabled={busy || !activeClass?.trainingClassId} onClick={() => void handleSyncActiveVTrainingClass()}>Đồng bộ lại từ VTraining</button>
                <button className="btn btn-ghost" disabled={busy || !activeProject || !activeCourse || Boolean(activeVTrainingClassId)} onClick={() => void handleCreateClass()}>Tạo lớp trống</button>
                <button className="btn btn-ghost" disabled={busy || !activeClass || !importRows.length || importRows.every((row) => row.action === 'error')} onClick={() => void handleImportStudents()}>
                  Import học viên hợp lệ
                </button>
              </div>

              <div className="elearning-course-head">
                <div>
                  <strong>{activeClass?.name || 'Chưa chọn lớp triển khai'}</strong>
                  <p>{activeClient?.name || 'Chưa có khách hàng'} · {activeProject?.name || 'Chưa có dự án'} · {activeClassEnrollments.length} học viên</p>
                </div>
                <Badge tone={activeClass?.status === 'open' ? 'success' : activeClass?.status === 'closed' ? 'neutral' : 'warning'}>{activeClass?.status || 'draft'}</Badge>
              </div>

              {importRows.length ? (
                <div className="elearning-lesson-table">
                  {importRows.slice(0, 8).map((row) => (
                    <div className="elearning-lesson-row" key={row.rowNumber}>
                      <div>
                        <strong>Dòng {row.rowNumber}: {row.fullName || 'Chưa có họ tên'}</strong>
                        <span>{row.email || 'Thiếu email'} · {row.department || 'Chưa có phòng ban'} · {row.errors.join(', ') || (row.action === 'update' ? 'Cập nhật hồ sơ đã có' : 'Tạo học viên mới')}</span>
                      </div>
                      <Badge tone={row.action === 'error' ? 'danger' : row.action === 'update' ? 'warning' : 'success'}>{row.action === 'error' ? 'Lỗi' : row.action === 'update' ? 'Cập nhật' : 'Tạo mới'}</Badge>
                    </div>
                  ))}
                  {importRows.length > 8 ? <div className="muted-text">Còn {importRows.length - 8} dòng khác trong file import.</div> : null}
                </div>
              ) : (
                <div className="muted-text">Mẫu CSV: employee_code, full_name, email, password, phone, department, position, unit.</div>
              )}

              <div className="elearning-lesson-table">
                {classReportRows.slice(0, 10).map((row) => (
                  <div className="elearning-lesson-row" key={row.enrollment.id}>
                    <div>
                      <strong>{row.student.fullName}</strong>
                      <span>{row.student.email} · {row.student.department || 'Chưa có phòng ban'} · tiến độ {row.result.progressPercent}%</span>
                    </div>
                    <div className="action-row">
                      <Badge tone={getLearnerSourceTone(row.sourceStatus)}>{getLearnerSourceLabel(row.sourceStatus)}</Badge>
                      <Badge tone={row.result.finalStatus === 'passed' || row.result.finalStatus === 'completed' ? 'success' : row.result.finalStatus === 'failed' ? 'danger' : 'warning'}>{row.result.finalStatus}</Badge>
                      <button className="btn btn-ghost btn-small" type="button" disabled={busy || row.enrollment.learningStatus === 'expired'} onClick={() => void handleRemoveEnrollment(row.enrollment.id)}>Gỡ khỏi khóa</button>
                    </div>
                  </div>
                ))}
                {!classReportRows.length ? <div className="muted-text">Chưa có học viên trong lớp đang chọn.</div> : null}
              </div>
            </Card> : null}
          </main>
        </div>
      </section>
    </>
  );
}
