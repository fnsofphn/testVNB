import { supabase } from '@/lib/supabaseClient';
import { dispatchNotice } from '@/services/vcontent';
import {
  createQuizForm,
  createQuizQuestionSet,
  deleteQuizForm,
  deleteQuizQuestionSet,
  getQuizQuestionSetBundle,
  listQuizForms,
  listQuizQuestionSets,
  sanitizeQuizId,
  updateQuizForm,
  updateQuizQuestionSet,
  type QuizForm,
  type QuizFormInput,
  type QuizFormUpdateInput,
  type QuizQuestion,
  type QuizQuestionSet,
  type QuizQuestionSetBundle,
  type QuizQuestionSetUpdateInput,
} from '@/lib/quiz';
import JSZip from 'jszip';

export type ElearningCourseStatus = 'draft' | 'published' | 'closed' | 'archived';
export type ElearningLessonType = 'vimeo_parts' | 'scorm' | 'native_sequence';
export type ElearningScormCompletionRule = 'completed' | 'passed' | 'score';
export type ElearningLessonBlockType = 'video' | 'single_choice' | 'multiple_choice' | 'match' | 'fill_gap' | 'short_answer' | 'final_quiz';

export type ElearningCourse = {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  status: ElearningCourseStatus;
  completionThreshold: number;
  finalQuizFormId: string;
  createdAt: string;
  lessonCount: number;
};

export type ElearningLesson = {
  id: string;
  title: string;
  description: string;
  lessonType: ElearningLessonType;
  scormPackageId: string;
  completionRule: ElearningScormCompletionRule;
  passingScore: number;
  status: 'draft' | 'published';
  createdAt: string;
  partCount: number;
  sortOrder?: number;
};

export type ElearningLessonPart = {
  id: string;
  lessonId: string;
  title: string;
  content: string;
  videoUrl: string;
  videoId: string;
  durationSeconds: number;
  isPreview: boolean;
  isRequired: boolean;
  sortOrder: number;
  status: 'draft' | 'published';
  createdAt: string;
};

export type ElearningLessonBlock = {
  id: string;
  lessonId: string;
  blockType: ElearningLessonBlockType;
  title: string;
  content: string;
  videoUrl: string;
  videoId: string;
  questionType: ElearningLessonBlockType | '';
  options: string[];
  correctAnswer: string | string[] | null;
  points: number;
  durationSeconds: number;
  isRequired: boolean;
  sortOrder: number;
  status: 'draft' | 'published';
  createdAt: string;
};

export type ElearningBlockAttempt = {
  id: string;
  userId: string;
  profileId: string;
  enrollmentId: string;
  courseId: string;
  lessonId: string;
  blockId: string;
  answer: unknown;
  score: number | null;
  isCompleted: boolean;
  completedAt: string | null;
  updatedAt: string;
};

export type ElearningProgress = {
  id: string;
  userId: string;
  profileId: string;
  enrollmentId: string;
  courseId: string;
  lessonId: string;
  partId: string;
  progressPercent: number;
  lastPositionSeconds: number;
  isCompleted: boolean;
  completedAt: string | null;
  updatedAt: string;
};

export type ElearningScormPackage = {
  id: string;
  title: string;
  originalFileName: string;
  scormVersion: '1.2' | '2004';
  manifestIdentifier: string;
  organizationIdentifier: string;
  scoIdentifier: string;
  launchPath: string;
  storageBucket: string;
  storagePrefix: string;
  fileCount: number;
  totalSizeBytes: number;
  slideCount: number;
  quizCount: number;
  quizQuestionCount: number;
  passPercent: number | null;
  manifestJson: Record<string, unknown>;
  status: 'ready' | 'archived';
  createdAt: string;
};

export type ElearningScormAttempt = {
  id: string;
  userId: string;
  profileId: string;
  enrollmentId: string;
  courseId: string;
  lessonId: string;
  scormPackageId: string;
  attemptNumber: number;
  runtimeData: Record<string, string>;
  completionStatus: string;
  successStatus: string;
  scoreRaw: number | null;
  scoreScaled: number | null;
  location: string;
  suspendData: string;
  sessionTime: string;
  totalTime: string;
  isCompleted: boolean;
  isPassed: boolean;
  initializedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type ElearningClient = {
  id: string;
  code: string;
  name: string;
  contactName: string;
  contactEmail: string;
  status: 'active' | 'inactive' | 'archived';
  createdAt: string;
};

export type ElearningProject = {
  id: string;
  clientId: string;
  code: string;
  name: string;
  linkedOrderId: string;
  startDate: string;
  endDate: string;
  status: 'planning' | 'active' | 'completed' | 'archived';
  createdAt: string;
};

export type ElearningClass = {
  id: string;
  projectId: string;
  courseId: string;
  trainingClassId: string;
  code: string;
  name: string;
  startAt: string;
  endAt: string;
  enrollmentDeadline: string;
  completionThreshold: number;
  finalQuizFormId: string;
  status: 'draft' | 'scheduled' | 'open' | 'paused' | 'closed' | 'archived';
  createdAt: string;
};

export type ElearningClassStudent = {
  classId: string;
  studentId: string;
  sourceModule: string;
  sourceId: string;
  status: 'active' | 'removed' | 'archived';
  createdAt: string;
};

export type ElearningStudent = {
  id: string;
  clientId: string;
  userId: string;
  profileId: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  unit: string;
  status: 'active' | 'inactive' | 'archived';
  createdAt: string;
};

export type ElearningLearnerGroup = {
  id: string;
  clientId: string;
  name: string;
  description: string;
  emails: string[];
  studentIds: string[];
  status: 'active' | 'archived';
  createdAt: string;
};

export type ElearningRunTarget = {
  id: string;
  runClassId: string;
  targetType: 'class' | 'group';
  targetId: string;
  status: 'active' | 'removed' | 'archived';
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ElearningEnrollment = {
  id: string;
  classId: string;
  courseId: string;
  studentId: string;
  userId: string;
  profileId: string;
  inviteToken: string;
  inviteStatus: 'created' | 'sent' | 'opened' | 'expired';
  learningStatus: 'not_started' | 'in_progress' | 'completed' | 'passed' | 'failed' | 'expired';
  assignedAt: string;
  firstAccessAt: string | null;
  lastAccessAt: string | null;
  completedAt: string | null;
  metadata: Record<string, unknown>;
};

export type ElearningLearningResult = {
  enrollmentId: string;
  studentId: string;
  classId: string;
  courseId: string;
  profileId: string;
  progressPercent: number;
  lessonCompletedCount: number;
  lessonTotalCount: number;
  scormCompletionStatus: string;
  scormSuccessStatus: string;
  scormScore: number | null;
  quizScore: number | null;
  quizPassed: boolean | null;
  finalStatus: ElearningEnrollment['learningStatus'];
  startedAt: string | null;
  completedAt: string | null;
  lastAccessAt: string | null;
};

export type ElearningLearnerDashboardCourse = {
  course: ElearningCourse;
  classSession: ElearningClass | null;
  enrollment: ElearningEnrollment;
  result: ElearningLearningResult;
};

export type ElearningDeploymentBundle = {
  clients: ElearningClient[];
  projects: ElearningProject[];
  classes: ElearningClass[];
  students: ElearningStudent[];
  classStudents: ElearningClassStudent[];
  enrollments: ElearningEnrollment[];
  learnerGroups: ElearningLearnerGroup[];
  runTargets: ElearningRunTarget[];
};

export type VTrainingClassForElearning = {
  id: string;
  code: string;
  name: string;
  courseId: string;
  startAt: string | null;
  endAt: string | null;
  currentLearnerCount: number;
  status: string;
};

export type VTrainingStudentForElearning = {
  id: string;
  profileId: string;
  userId: string;
  email: string;
  fullName: string;
  studentCode: string;
  department: string;
  position: string;
  status: string;
};

export type ElearningTrainingClassAssignmentResult = {
  classId: string;
  trainingClassId: string;
  enrolled: number;
  updated: number;
  removed: number;
  skipped: number;
};

export type ElearningClassReportRow = {
  enrollment: ElearningEnrollment;
  student: ElearningStudent;
  result: ElearningLearningResult;
  sourceStatus: 'source_active' | 'source_removed' | 'vlearning_only';
};

export type ElearningImportPreviewRow = {
  rowNumber: number;
  employeeCode: string;
  fullName: string;
  email: string;
  password: string;
  phone: string;
  department: string;
  position: string;
  unit: string;
  errors: string[];
  action: 'create' | 'update' | 'skip' | 'error';
};

export type ElearningOptimizedReportInput = {
  scopeType: 'class' | 'group' | 'deployment';
  scopeId: string;
  previewLimit?: number;
};

export type ElearningLearnerNoticeKind = 'course_assigned' | 'study_reminder' | 'lesson_assigned';

export type ElearningLearnerNoticeResult = {
  recipientCount: number;
  profileCount: number;
  directEmailCount: number;
};

export type ElearningOptimizedReport = {
  rows: ElearningClassReportRow[];
  totalRows: number;
  previewLimit: number;
  scopeType: ElearningOptimizedReportInput['scopeType'];
  scopeId: string;
};

function getReportRowActivityTime(row: ElearningClassReportRow) {
  return Math.max(
    timestampValue(row.result.lastAccessAt),
    timestampValue(row.result.completedAt),
    timestampValue(row.result.startedAt),
    timestampValue(row.enrollment.lastAccessAt),
    timestampValue(row.enrollment.completedAt),
    timestampValue(row.enrollment.firstAccessAt),
    timestampValue(row.enrollment.assignedAt),
  );
}

function getReportRowProgressRank(row: ElearningClassReportRow) {
  return Math.max(
    Number(row.result.progressPercent || 0),
    row.result.finalStatus === 'completed' || row.result.finalStatus === 'passed' ? 100 : 0,
    row.enrollment.learningStatus === 'completed' || row.enrollment.learningStatus === 'passed' ? 100 : 0,
    row.result.finalStatus === 'in_progress' || row.enrollment.learningStatus === 'in_progress' ? 1 : 0,
  );
}

function sortElearningReportRows(rows: ElearningClassReportRow[]) {
  return [...rows].sort((a, b) => {
    const activityDiff = getReportRowActivityTime(b) - getReportRowActivityTime(a);
    if (activityDiff) return activityDiff;
    const progressDiff = getReportRowProgressRank(b) - getReportRowProgressRank(a);
    if (progressDiff) return progressDiff;
    return a.student.fullName.localeCompare(b.student.fullName, 'vi') || a.student.email.localeCompare(b.student.email, 'vi');
  });
}

export type ElearningCourseBundle = {
  course: ElearningCourse;
  enrollment: ElearningEnrollment | null;
  learningResult: ElearningLearningResult | null;
  lessons: ElearningLesson[];
  parts: ElearningLessonPart[];
  lessonBlocks: ElearningLessonBlock[];
  blockAttempts: ElearningBlockAttempt[];
  progress: ElearningProgress[];
  scormPackages: ElearningScormPackage[];
  scormAttempts: ElearningScormAttempt[];
};

export type ElearningResumeTarget =
  | { type: 'part'; partId: string }
  | { type: 'scorm'; lessonId: string }
  | { type: 'native'; lessonId: string }
  | { type: 'empty' };

export type ElearningCourseInput = {
  id?: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  status?: ElearningCourseStatus;
  completionThreshold?: number;
  finalQuizFormId?: string;
};

export type ElearningCourseUpdateInput = Partial<Pick<ElearningCourse, 'title' | 'description' | 'thumbnailUrl' | 'status' | 'completionThreshold' | 'finalQuizFormId'>>;

export type ElearningLessonInput = {
  id?: string;
  title: string;
  description?: string;
  lessonType?: ElearningLessonType;
  scormPackageId?: string;
  completionRule?: ElearningScormCompletionRule;
  passingScore?: number;
  status?: 'draft' | 'published';
};

export type ElearningLessonUpdateInput = Partial<Pick<ElearningLesson, 'title' | 'description' | 'completionRule' | 'passingScore' | 'status'>>;

export type ElearningLessonPartInput = {
  id?: string;
  lessonId: string;
  title: string;
  content?: string;
  videoUrl: string;
  durationSeconds?: number;
  isPreview?: boolean;
  isRequired?: boolean;
  sortOrder?: number;
  status?: 'draft' | 'published';
};

export type ElearningLessonBlockInput = {
  id?: string;
  lessonId: string;
  blockType: ElearningLessonBlockType;
  title: string;
  content?: string;
  videoUrl?: string;
  options?: string[];
  correctAnswer?: string | string[] | null;
  points?: number;
  durationSeconds?: number;
  isRequired?: boolean;
  sortOrder?: number;
  status?: 'draft' | 'published';
};

export type ElearningClassUpdateInput = Partial<Pick<
  ElearningClass,
  'projectId' | 'courseId' | 'trainingClassId' | 'code' | 'name' | 'startAt' | 'endAt' | 'enrollmentDeadline' | 'completionThreshold' | 'finalQuizFormId' | 'status'
>>;

const COURSE_STORAGE_KEY = 'vcontent.elearning.courses.v2';
const LESSON_STORAGE_KEY = 'vcontent.elearning.lessons.v2';
const PART_STORAGE_KEY = 'vcontent.elearning.parts.v2';
const LESSON_BLOCK_STORAGE_KEY = 'vcontent.elearning.lessonBlocks.v1';
const BLOCK_ATTEMPT_STORAGE_KEY = 'vcontent.elearning.blockAttempts.v1';
const COURSE_LESSON_STORAGE_KEY = 'vcontent.elearning.courseLessons.v2';
const PROGRESS_STORAGE_KEY = 'vcontent.elearning.progress.v2';
const SCORM_PACKAGE_STORAGE_KEY = 'vcontent.elearning.scormPackages.v1';
const SCORM_ATTEMPT_STORAGE_KEY = 'vcontent.elearning.scormAttempts.v1';
const CLIENT_STORAGE_KEY = 'vcontent.elearning.clients.v1';
const PROJECT_STORAGE_KEY = 'vcontent.elearning.projects.v1';
const CLASS_STORAGE_KEY = 'vcontent.elearning.classes.v1';
const STUDENT_STORAGE_KEY = 'vcontent.elearning.students.v1';
const CLASS_STUDENT_STORAGE_KEY = 'vcontent.elearning.classStudents.v1';
const ENROLLMENT_STORAGE_KEY = 'vcontent.elearning.enrollments.v1';
const LEARNER_GROUP_STORAGE_KEY = 'vcontent.elearning.learnerGroups.v1';
const RUN_TARGET_STORAGE_KEY = 'vcontent.elearning.runTargets.v1';
const SAMPLE_COURSE_ID = 'vimeo-onboarding';
const SAMPLE_LESSON_ID = 'bai-mo-dau-vimeo';
const SCORM_STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_SCORM_BUCKET || import.meta.env.VITE_SUPABASE_WORKFLOW_BUCKET || import.meta.env.VITE_SUPABASE_INTAKE_BUCKET || 'vcontent-intake';
const COURSE_THUMBNAIL_STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_ELEARNING_THUMBNAIL_BUCKET || import.meta.env.VITE_SUPABASE_INTAKE_BUCKET || 'vcontent-intake';

type LocalCourseLesson = {
  courseId: string;
  lessonId: string;
  sortOrder: number;
};

const SAMPLE_COURSE: ElearningCourse = {
  id: SAMPLE_COURSE_ID,
  title: 'Khóa học mẫu video',
  description: 'Mẫu khóa học gồm nhiều bài, mỗi bài gồm nhiều phần video.',
  thumbnailUrl: '',
  status: 'published',
  completionThreshold: 90,
  finalQuizFormId: '',
  createdAt: new Date(2026, 4, 14).toISOString(),
  lessonCount: 1,
};

const SAMPLE_LESSON: ElearningLesson = {
  id: SAMPLE_LESSON_ID,
  title: 'Bài 1 - Làm quen module video',
  description: 'Một bài học có nhiều phần video ngắn.',
  lessonType: 'vimeo_parts',
  scormPackageId: '',
  completionRule: 'completed',
  passingScore: 70,
  status: 'published',
  createdAt: new Date(2026, 4, 14).toISOString(),
  partCount: 2,
  sortOrder: 1,
};

const SAMPLE_PARTS: ElearningLessonPart[] = [
  {
    id: 'phan-1-gioi-thieu',
    lessonId: SAMPLE_LESSON_ID,
    title: 'Phần 1 - Giới thiệu',
    content: 'Học viên xem phần preview trước khi vào nội dung chính.',
    videoUrl: 'https://vimeo.com/76979871',
    videoId: '76979871',
    durationSeconds: 900,
    isPreview: true,
    isRequired: true,
    sortOrder: 1,
    status: 'published',
    createdAt: new Date(2026, 4, 14).toISOString(),
  },
  {
    id: 'phan-2-tracking',
    lessonId: SAMPLE_LESSON_ID,
    title: 'Phần 2 - Lưu tiến độ',
    content: 'Hệ thống ghi nhận tiến độ xem từng phần video.',
    videoUrl: 'https://vimeo.com/76979871',
    videoId: '76979871',
    durationSeconds: 900,
    isPreview: false,
    isRequired: true,
    sortOrder: 2,
    status: 'published',
    createdAt: new Date(2026, 4, 14).toISOString(),
  },
];

function requireSupabase() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.');
  return supabase;
}

function getSupabaseErrorText(error: unknown) {
  if (!error) return '';
  if (error instanceof Error) return error.message;
  if (typeof error === 'object') {
    const record = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    return [record.message, record.details, record.hint, record.code].filter(Boolean).map(String).join(' ');
  }
  return String(error);
}

function isMissingSchemaError(error: unknown) {
  const message = getSupabaseErrorText(error);
  return /PGRST20\d|42P01|42703|vcontent_eln_|relation .* does not exist|column .* does not exist|schema cache/i.test(message);
}

function isLocalFallbackSafeError(error: unknown) {
  if (isMissingSchemaError(error)) return true;
  const message = getSupabaseErrorText(error);
  return /foreign key|violates foreign key constraint|23503/i.test(message);
}

function formatElearningError(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') return error instanceof Error ? error.message : fallback;
  const record = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
  return [record.message, record.details, record.hint, record.code].filter(Boolean).map(String).join(' - ') || fallback;
}

function timestampValue(value: string | null | undefined) {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function selectElearningResumeTarget(bundle: ElearningCourseBundle | null | undefined): ElearningResumeTarget {
  if (!bundle) return { type: 'empty' };

  const lessonsById = new Map(bundle.lessons.map((lesson) => [lesson.id, lesson]));
  const partsById = new Map(bundle.parts.map((part) => [part.id, part]));
  const candidates: Array<{ target: ElearningResumeTarget; updatedAt: number; progressRank: number }> = [];

  for (const progress of bundle.progress) {
    const part = partsById.get(progress.partId);
    if (!part || part.status !== 'published') continue;
    candidates.push({
      target: { type: 'part', partId: part.id },
      updatedAt: timestampValue(progress.updatedAt),
      progressRank: progress.progressPercent,
    });
  }

  for (const attempt of bundle.scormAttempts) {
    const lesson = lessonsById.get(attempt.lessonId);
    if (!lesson || lesson.lessonType !== 'scorm' || lesson.status !== 'published') continue;
    candidates.push({
      target: { type: 'scorm', lessonId: lesson.id },
      updatedAt: timestampValue(attempt.updatedAt),
      progressRank: attempt.isCompleted || attempt.isPassed ? 100 : 50,
    });
  }

  for (const attempt of bundle.blockAttempts) {
    const lesson = lessonsById.get(attempt.lessonId);
    if (!lesson || lesson.lessonType !== 'native_sequence' || lesson.status !== 'published') continue;
    candidates.push({
      target: { type: 'native', lessonId: lesson.id },
      updatedAt: timestampValue(attempt.updatedAt || attempt.completedAt),
      progressRank: attempt.isCompleted ? 100 : 50,
    });
  }

  const latest = candidates.sort((a, b) => b.updatedAt - a.updatedAt || b.progressRank - a.progressRank)[0];
  if (latest) return latest.target;

  const firstLesson = bundle.lessons.find((lesson) => lesson.status === 'published') || bundle.lessons[0];
  if (firstLesson?.lessonType === 'scorm') return { type: 'scorm', lessonId: firstLesson.id };
  if (firstLesson?.lessonType === 'native_sequence') return { type: 'native', lessonId: firstLesson.id };

  const firstPart = firstLesson
    ? bundle.parts.find((part) => part.lessonId === firstLesson.id && part.status === 'published') || bundle.parts.find((part) => part.lessonId === firstLesson.id)
    : bundle.parts.find((part) => part.status === 'published') || bundle.parts[0];
  return firstPart ? { type: 'part', partId: firstPart.id } : { type: 'empty' };
}

export type VLearningAdmissionResult = {
  ok: boolean;
  status: 'ready' | 'wait' | 'degraded' | 'denied';
  ticket?: string;
  expiresInSeconds?: number;
  position?: number;
  retryAfterMs?: number;
  scope?: string;
  message?: string;
};

export type VLearningProgressSyncEvent =
  | {
      type: 'lesson_progress';
      idempotencyKey?: string;
      occurredAt?: string;
      queuedAt?: number;
      userId: string;
      profileId?: string;
      enrollmentId?: string;
      courseId: string;
      lessonId: string;
      partId: string;
      progressPercent: number;
      lastPositionSeconds: number;
      isCompleted?: boolean;
    }
  | {
      type: 'block_attempt';
      idempotencyKey?: string;
      occurredAt?: string;
      queuedAt?: number;
      userId: string;
      profileId?: string;
      enrollmentId?: string;
      courseId: string;
      lessonId: string;
      blockId: string;
      answer: unknown;
      score?: number | null;
      isCompleted?: boolean;
    };

type VLearningProgressSyncResult = {
  index: number;
  type: VLearningProgressSyncEvent['type'];
  key?: string;
  status: 'saved' | 'duplicate' | 'retryable_error' | 'failed';
  row?: any;
  error?: string;
};

const VLEARNING_PROGRESS_SYNC_BUFFER_KEY = 'vlearning.progress-sync.buffer.v1';
const VLEARNING_PROGRESS_SYNC_MAX_BUFFERED_EVENTS = 100;
const VLEARNING_PROGRESS_SYNC_MAX_BUFFER_BYTES = 96 * 1024;
const VLEARNING_PROGRESS_SYNC_BUFFER_TTL_MS = 24 * 60 * 60 * 1000;
const VLEARNING_SCORM_SYNC_BUFFER_KEY = 'vlearning.scorm-sync.buffer.v1';
const VLEARNING_SCORM_SYNC_MAX_BUFFERED_EVENTS = 20;
const VLEARNING_SCORM_SYNC_MAX_BUFFER_BYTES = 512 * 1024;
const VLEARNING_SCORM_SYNC_BUFFER_TTL_MS = 24 * 60 * 60 * 1000;
const vlearningAdmissionTickets: Record<string, { token: string; expiresAt: number }> = {};
const vlearningCorrelationIds: Record<string, string> = {};

function getVLearningCorrelationId(courseId: string) {
  const normalizedCourseId = String(courseId || '').trim() || 'unknown';
  if (!vlearningCorrelationIds[normalizedCourseId]) {
    const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
    vlearningCorrelationIds[normalizedCourseId] = `vlearn-${randomId}`;
  }
  return vlearningCorrelationIds[normalizedCourseId];
}

function getLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setLocal<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

async function requestAppApi(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : payload?.error || payload?.message || `HTTP ${response.status}`;
    const error = new Error(message) as Error & { statusCode?: number };
    error.statusCode = response.status;
    throw error;
  }
  return payload;
}

export async function requestVLearningAdmission(input: {
  courseId: string;
  lessonId?: string;
  classId?: string;
  runId?: string;
}): Promise<VLearningAdmissionResult> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return { ok: true, status: 'ready', retryAfterMs: 0 };
  }
  const params = new URLSearchParams();
  params.set('courseId', input.courseId);
  if (input.lessonId) params.set('lessonId', input.lessonId);
  if (input.classId) params.set('classId', input.classId);
  if (input.runId) params.set('runId', input.runId);
  try {
    const payload = await requestAppApi(`/api/vlearning/gateway/admit?${params.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-VLearning-Correlation-Id': getVLearningCorrelationId(input.courseId),
      },
      cache: 'no-store',
    });
    if (payload?.ok && (payload.status === 'ready' || payload.status === 'wait' || payload.status === 'degraded')) {
      if (payload.status === 'ready' && payload.ticket) {
        vlearningAdmissionTickets[input.courseId] = {
          token: String(payload.ticket),
          expiresAt: Date.now() + Math.max(0, Number(payload.expiresInSeconds || 0) * 1000 - 5000),
        };
      }
      return payload as VLearningAdmissionResult;
    }
  } catch (error) {
    const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
    if (statusCode === 401 || statusCode === 403) {
      return {
        ok: false,
        status: 'denied',
        retryAfterMs: 0,
        message: statusCode === 401
          ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
          : 'Bạn chưa được ghi danh hoặc không còn quyền truy cập khóa học này.',
      };
    }
    return {
      ok: false,
      status: 'degraded',
      retryAfterMs: 1500,
      message: 'Hệ thống đang điều tiết lượt vào lớp. Vui lòng chờ trong giây lát.',
    };
  }
  return {
    ok: false,
    status: 'degraded',
    retryAfterMs: 1500,
    message: 'Hệ thống đang điều tiết lượt vào lớp. Vui lòng chờ trong giây lát.',
  };
}

function shouldUseVLearningProgressSync() {
  return typeof window !== 'undefined' && typeof fetch !== 'undefined' && Boolean(supabase);
}

function getVLearningProgressEventKey(event: VLearningProgressSyncEvent) {
  if (event.idempotencyKey) return event.idempotencyKey;
  if (event.type === 'lesson_progress') return `progress:${event.userId}:${event.courseId}:${event.partId}`;
  return `block:${event.userId}:${event.courseId}:${event.blockId}`;
}

function getVLearningProgressEntityKey(event: VLearningProgressSyncEvent) {
  if (event.type === 'lesson_progress') return `progress:${event.userId}:${event.courseId}:${event.partId}`;
  return `block:${event.userId}:${event.courseId}:${event.blockId}`;
}

function readBufferedVLearningProgressEvents() {
  const now = Date.now();
  return getLocal<VLearningProgressSyncEvent[]>(VLEARNING_PROGRESS_SYNC_BUFFER_KEY, [])
    .filter((event) => {
      const queuedAt = Number(event?.queuedAt || Date.parse(String(event?.occurredAt || '')));
      return Number.isFinite(queuedAt) && now - queuedAt <= VLEARNING_PROGRESS_SYNC_BUFFER_TTL_MS;
    });
}

function writeBufferedVLearningProgressEvents(events: VLearningProgressSyncEvent[]) {
  const deduped = new Map<string, VLearningProgressSyncEvent>();
  const now = Date.now();
  for (const event of events) {
    const queuedAt = Number(event?.queuedAt || Date.parse(String(event?.occurredAt || '')) || now);
    if (now - queuedAt > VLEARNING_PROGRESS_SYNC_BUFFER_TTL_MS) continue;
    deduped.set(getVLearningProgressEntityKey(event), { ...event, queuedAt });
  }
  const bounded = Array.from(deduped.values()).slice(-VLEARNING_PROGRESS_SYNC_MAX_BUFFERED_EVENTS);
  while (bounded.length > 1 && JSON.stringify(bounded).length > VLEARNING_PROGRESS_SYNC_MAX_BUFFER_BYTES) {
    bounded.shift();
  }
  setLocal(VLEARNING_PROGRESS_SYNC_BUFFER_KEY, bounded);
}

function bufferVLearningProgressEvents(events: VLearningProgressSyncEvent[]) {
  if (!events.length) return;
  writeBufferedVLearningProgressEvents([...readBufferedVLearningProgressEvents(), ...events]);
}

function clearSavedVLearningProgressEvents(sentEvents: VLearningProgressSyncEvent[], results: VLearningProgressSyncResult[]) {
  const resultByKey = new Map(
    results.map((result) => [
      result.key || (sentEvents[result.index] ? getVLearningProgressEventKey(sentEvents[result.index]) : ''),
      result,
    ]),
  );
  const retryable = sentEvents.filter((event) => {
    const result = resultByKey.get(getVLearningProgressEventKey(event));
    return !result || result.status === 'retryable_error';
  });
  writeBufferedVLearningProgressEvents(retryable);
}

export async function syncVLearningProgressEvents(events: VLearningProgressSyncEvent[]): Promise<VLearningProgressSyncResult[]> {
  const pending = readBufferedVLearningProgressEvents();
  const merged = [...pending, ...events];
  const requested = merged
    .slice(pending.length)
    .map((event) => ({ ...event, queuedAt: event.queuedAt || Date.now() }));
  writeBufferedVLearningProgressEvents([...pending, ...requested]);
  const sentEvents = readBufferedVLearningProgressEvents();
  if (!sentEvents.length) return [];
  try {
    const grouped = new Map<string, Array<{ event: VLearningProgressSyncEvent; index: number }>>();
    sentEvents.forEach((event, index) => {
      const courseId = String(event.courseId || '').trim();
      const group = grouped.get(courseId) || [];
      group.push({ event, index });
      grouped.set(courseId, group);
    });
    const results = (
      await Promise.all(Array.from(grouped.entries()).map(async ([courseId, group]) => {
        let admission = vlearningAdmissionTickets[courseId];
        if (!admission || admission.expiresAt <= Date.now()) {
          const admitted = await requestVLearningAdmission({ courseId });
          if (admitted.status !== 'ready' || !admitted.ticket) {
            throw new Error('Không thể cấp quyền đồng bộ tiến độ cho khóa học.');
          }
          admission = vlearningAdmissionTickets[courseId];
        }
        if (!admission?.token) throw new Error('Thiếu admission ticket cho tiến độ học.');
        const payload = await requestAppApi('/api/vlearning/progress-sync', {
          method: 'POST',
          headers: {
            'X-VLearning-Admission-Ticket': admission.token,
            'X-VLearning-Correlation-Id': getVLearningCorrelationId(courseId),
          },
          cache: 'no-store',
          body: JSON.stringify({ events: group.map((item) => item.event) }),
        });
        const groupResults = Array.isArray(payload?.results)
          ? payload.results as VLearningProgressSyncResult[]
          : [];
        return groupResults.map((result) => ({
          ...result,
          index: group[result.index]?.index ?? result.index,
        }));
      }))
    ).flat().sort((a, b) => a.index - b.index);
    clearSavedVLearningProgressEvents(sentEvents, results);
    const resultByKey = new Map(
      results.map((result) => [
        result.key || (sentEvents[result.index] ? getVLearningProgressEventKey(sentEvents[result.index]) : ''),
        result,
      ]),
    );
    return requested.map((event, index) => {
      const result = resultByKey.get(getVLearningProgressEventKey(event));
      return result
        ? { ...result, index }
        : { index, type: event.type, key: getVLearningProgressEventKey(event), status: 'retryable_error', error: 'Máy chủ chưa xác nhận sự kiện.' };
    });
  } catch (error) {
    bufferVLearningProgressEvents(sentEvents);
    throw error;
  }
}

export async function flushBufferedVLearningProgressEvents(): Promise<VLearningProgressSyncResult[]> {
  const pending = readBufferedVLearningProgressEvents();
  if (!pending.length || !shouldUseVLearningProgressSync()) return [];
  return syncVLearningProgressEvents([]);
}

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function contentTypeForScormPath(filePath: string) {
  const normalized = filePath.toLowerCase();
  if (normalized.endsWith('.html') || normalized.endsWith('.htm')) return 'text/html; charset=utf-8';
  if (normalized.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (normalized.endsWith('.css')) return 'text/css; charset=utf-8';
  if (normalized.endsWith('.json')) return 'application/json; charset=utf-8';
  if (normalized.endsWith('.xml')) return 'application/xml; charset=utf-8';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.svg')) return 'image/svg+xml';
  if (normalized.endsWith('.mp4')) return 'video/mp4';
  if (normalized.endsWith('.woff')) return 'font/woff';
  if (normalized.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

function cleanScormPath(value: string) {
  return String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/');
}

function getLocalCourses() {
  const courses = getLocal<ElearningCourse[]>(COURSE_STORAGE_KEY, []);
  return courses.some((course) => course.id === SAMPLE_COURSE_ID) ? courses : [SAMPLE_COURSE, ...courses];
}

function getLocalLessons() {
  const lessons = getLocal<ElearningLesson[]>(LESSON_STORAGE_KEY, []);
  return lessons.some((lesson) => lesson.id === SAMPLE_LESSON_ID) ? lessons : [SAMPLE_LESSON, ...lessons];
}

function getLocalParts() {
  const parts = getLocal<ElearningLessonPart[]>(PART_STORAGE_KEY, []);
  return parts.some((part) => part.lessonId === SAMPLE_LESSON_ID) ? parts : [...SAMPLE_PARTS, ...parts];
}

function getLocalLessonBlocks() {
  return getLocal<ElearningLessonBlock[]>(LESSON_BLOCK_STORAGE_KEY, []);
}

function getLocalCourseLessons() {
  const rows = getLocal<LocalCourseLesson[]>(COURSE_LESSON_STORAGE_KEY, []);
  return rows.some((row) => row.courseId === SAMPLE_COURSE_ID && row.lessonId === SAMPLE_LESSON_ID)
    ? rows
    : [{ courseId: SAMPLE_COURSE_ID, lessonId: SAMPLE_LESSON_ID, sortOrder: 1 }, ...rows];
}

function mapCourseRow(row: any, lessonCount = 0): ElearningCourse {
  return {
    id: String(row.id),
    title: String(row.title || ''),
    description: String(row.description || ''),
    thumbnailUrl: String(row.thumbnail_url || ''),
    status: ['draft', 'closed', 'archived'].includes(row.status) ? row.status : 'published',
    completionThreshold: Number(row.completion_threshold || 90),
    finalQuizFormId: String(row.final_quiz_form_id || ''),
    createdAt: String(row.created_at || new Date().toISOString()),
    lessonCount,
  };
}

function mapLessonRow(row: any, partCount = 0, sortOrder?: number): ElearningLesson {
  const lessonType: ElearningLessonType = row.lesson_type === 'scorm' ? 'scorm' : row.lesson_type === 'native_sequence' ? 'native_sequence' : 'vimeo_parts';
  return {
    id: String(row.id),
    title: String(row.title || ''),
    description: String(row.description || ''),
    lessonType,
    scormPackageId: String(row.scorm_package_id || ''),
    completionRule: ['passed', 'score'].includes(row.completion_rule) ? row.completion_rule : 'completed',
    passingScore: Math.max(0, Math.min(100, Number(row.passing_score ?? 70))),
    status: row.status === 'draft' ? 'draft' : 'published',
    createdAt: String(row.created_at || new Date().toISOString()),
    partCount,
    sortOrder,
  };
}

function mapLessonBlockRow(row: any): ElearningLessonBlock {
  const blockType: ElearningLessonBlockType = ['single_choice', 'multiple_choice', 'match', 'fill_gap', 'short_answer', 'final_quiz'].includes(row.block_type)
    ? row.block_type
    : 'video';
  const options = Array.isArray(row.options_json) ? row.options_json.map(String) : [];
  const correctAnswer = Array.isArray(row.correct_answer_json) || typeof row.correct_answer_json === 'string' ? row.correct_answer_json : null;
  return {
    id: String(row.id),
    lessonId: String(row.lesson_id),
    blockType,
    title: String(row.title || ''),
    content: String(row.content || ''),
    videoUrl: String(row.video_url || ''),
    videoId: String(row.video_id || ''),
    questionType: row.question_type ? blockType : '',
    options,
    correctAnswer,
    points: Number(row.points || 0),
    durationSeconds: Number(row.duration_seconds || 0),
    isRequired: row.is_required !== false,
    sortOrder: Number(row.sort_order || 0),
    status: row.status === 'draft' ? 'draft' : 'published',
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapBlockAttemptRow(row: any): ElearningBlockAttempt {
  return {
    id: String(row.id),
    userId: String(row.user_id || ''),
    profileId: String(row.profile_id || ''),
    enrollmentId: String(row.enrollment_id || ''),
    courseId: String(row.course_id || ''),
    lessonId: String(row.lesson_id || ''),
    blockId: String(row.block_id || ''),
    answer: row.answer_json ?? null,
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    isCompleted: row.is_completed === true,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function mapPartRow(row: any): ElearningLessonPart {
  return {
    id: String(row.id),
    lessonId: String(row.lesson_id),
    title: String(row.title || ''),
    content: String(row.content || ''),
    videoUrl: String(row.video_url || ''),
    videoId: String(row.video_id || ''),
    durationSeconds: Number(row.duration_seconds || 0),
    isPreview: row.is_preview === true,
    isRequired: row.is_required !== false,
    sortOrder: Number(row.sort_order || 0),
    status: row.status === 'draft' ? 'draft' : 'published',
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapProgressRow(row: any): ElearningProgress {
  return {
    id: String(row.id),
    userId: String(row.user_id || ''),
    profileId: String(row.profile_id || ''),
    enrollmentId: String(row.enrollment_id || ''),
    courseId: String(row.course_id || ''),
    lessonId: String(row.lesson_id || ''),
    partId: String(row.part_id || ''),
    progressPercent: Number(row.progress_percent || 0),
    lastPositionSeconds: Number(row.last_position_seconds || 0),
    isCompleted: row.is_completed === true,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function mapScormPackageRow(row: any): ElearningScormPackage {
  return {
    id: String(row.id),
    title: String(row.title || ''),
    originalFileName: String(row.original_file_name || ''),
    scormVersion: row.scorm_version === '1.2' ? '1.2' : '2004',
    manifestIdentifier: String(row.manifest_identifier || ''),
    organizationIdentifier: String(row.organization_identifier || ''),
    scoIdentifier: String(row.sco_identifier || ''),
    launchPath: cleanScormPath(row.launch_path || 'index_lms.html'),
    storageBucket: String(row.storage_bucket || SCORM_STORAGE_BUCKET),
    storagePrefix: String(row.storage_prefix || ''),
    fileCount: Number(row.file_count || 0),
    totalSizeBytes: Number(row.total_size_bytes || 0),
    slideCount: Number(row.slide_count || 0),
    quizCount: Number(row.quiz_count || 0),
    quizQuestionCount: Number(row.quiz_question_count || 0),
    passPercent: row.pass_percent === null || row.pass_percent === undefined ? null : Number(row.pass_percent),
    manifestJson: typeof row.manifest_json === 'object' && row.manifest_json ? row.manifest_json : {},
    status: row.status === 'archived' ? 'archived' : 'ready',
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapScormAttemptRow(row: any): ElearningScormAttempt {
  return {
    id: String(row.id),
    userId: String(row.user_id || ''),
    profileId: String(row.profile_id || ''),
    enrollmentId: String(row.enrollment_id || ''),
    courseId: String(row.course_id || ''),
    lessonId: String(row.lesson_id || ''),
    scormPackageId: String(row.scorm_package_id || ''),
    attemptNumber: Number(row.attempt_number || 1),
    runtimeData: typeof row.runtime_data === 'object' && row.runtime_data ? row.runtime_data : {},
    completionStatus: String(row.completion_status || 'unknown'),
    successStatus: String(row.success_status || 'unknown'),
    scoreRaw: row.score_raw === null || row.score_raw === undefined ? null : Number(row.score_raw),
    scoreScaled: row.score_scaled === null || row.score_scaled === undefined ? null : Number(row.score_scaled),
    location: String(row.location || ''),
    suspendData: String(row.suspend_data || ''),
    sessionTime: String(row.session_time || ''),
    totalTime: String(row.total_time || ''),
    isCompleted: row.is_completed === true,
    isPassed: row.is_passed === true,
    initializedAt: row.initialized_at ? String(row.initialized_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function mapClientRow(row: any): ElearningClient {
  return {
    id: String(row.id || ''),
    code: String(row.code || ''),
    name: String(row.name || ''),
    contactName: String(row.contact_name || ''),
    contactEmail: String(row.contact_email || ''),
    status: ['inactive', 'archived'].includes(row.status) ? row.status : 'active',
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapProjectRow(row: any): ElearningProject {
  return {
    id: String(row.id || ''),
    clientId: String(row.client_id || ''),
    code: String(row.code || ''),
    name: String(row.name || ''),
    linkedOrderId: String(row.linked_order_id || ''),
    startDate: String(row.start_date || ''),
    endDate: String(row.end_date || ''),
    status: ['active', 'completed', 'archived'].includes(row.status) ? row.status : 'planning',
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapClassRow(row: any): ElearningClass {
  return {
    id: String(row.id || ''),
    projectId: String(row.project_id || ''),
    courseId: String(row.course_id || ''),
    trainingClassId: String(row.training_class_id || ''),
    code: String(row.code || ''),
    name: String(row.name || ''),
    startAt: String(row.start_at || ''),
    endAt: String(row.end_at || ''),
    enrollmentDeadline: String(row.enrollment_deadline || ''),
    completionThreshold: Number(row.completion_threshold || 90),
    finalQuizFormId: String(row.final_quiz_form_id || ''),
    status: ['scheduled', 'open', 'paused', 'closed', 'archived'].includes(row.status) ? row.status : 'draft',
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapClassStudentRow(row: any): ElearningClassStudent {
  return {
    classId: String(row.class_id || ''),
    studentId: String(row.student_id || ''),
    sourceModule: String(row.source_module || 'manual'),
    sourceId: String(row.source_id || ''),
    status: ['removed', 'archived'].includes(row.status) ? row.status : 'active',
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapStudentRow(row: any): ElearningStudent {
  return {
    id: String(row.id || ''),
    clientId: String(row.client_id || ''),
    userId: String(row.user_id || ''),
    profileId: String(row.profile_id || ''),
    employeeCode: String(row.employee_code || ''),
    fullName: String(row.full_name || ''),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    department: String(row.department || ''),
    position: String(row.position || ''),
    unit: String(row.unit || ''),
    status: ['inactive', 'archived'].includes(row.status) ? row.status : 'active',
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapLearnerGroupRow(row: any): ElearningLearnerGroup {
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  const emails: unknown[] = Array.isArray(row.emails_json)
    ? row.emails_json
    : Array.isArray(metadata.emails)
      ? metadata.emails
      : [];
  const studentIds: unknown[] = Array.isArray(row.student_ids_json)
    ? row.student_ids_json
    : Array.isArray(metadata.studentIds)
      ? metadata.studentIds
      : [];
  return {
    id: String(row.id || ''),
    clientId: String(row.client_id || ''),
    name: String(row.name || ''),
    description: String(row.description || ''),
    emails: emails.map(String).map((email) => email.trim().toLowerCase()).filter(Boolean),
    studentIds: studentIds.map(String).filter(Boolean),
    status: row.status === 'archived' ? 'archived' : 'active',
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapRunTargetRow(row: any): ElearningRunTarget {
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  return {
    id: String(row.id || ''),
    runClassId: String(row.run_class_id || ''),
    targetType: row.target_type === 'group' ? 'group' : 'class',
    targetId: String(row.target_id || ''),
    status: ['removed', 'archived'].includes(row.status) ? row.status : 'active',
    metadata,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapEnrollmentRow(row: any): ElearningEnrollment {
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  return {
    id: String(row.id || ''),
    classId: String(row.class_id || ''),
    courseId: String(row.course_id || ''),
    studentId: String(row.student_id || ''),
    userId: String(row.user_id || ''),
    profileId: String(row.profile_id || ''),
    inviteToken: String(row.invite_token || ''),
    inviteStatus: ['sent', 'opened', 'expired'].includes(row.invite_status) ? row.invite_status : 'created',
    learningStatus: ['in_progress', 'completed', 'passed', 'failed', 'expired'].includes(row.learning_status) ? row.learning_status : 'not_started',
    assignedAt: String(row.assigned_at || new Date().toISOString()),
    firstAccessAt: row.first_access_at ? String(row.first_access_at) : null,
    lastAccessAt: row.last_access_at ? String(row.last_access_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    metadata,
  };
}

function createEmptyLearningResult(enrollment: ElearningEnrollment): ElearningLearningResult {
  return {
    enrollmentId: enrollment.id,
    studentId: enrollment.studentId,
    classId: enrollment.classId,
    courseId: enrollment.courseId,
    profileId: enrollment.profileId,
    progressPercent: 0,
    lessonCompletedCount: 0,
    lessonTotalCount: 0,
    scormCompletionStatus: 'unknown',
    scormSuccessStatus: 'unknown',
    scormScore: null,
    quizScore: null,
    quizPassed: null,
    finalStatus: enrollment.learningStatus,
    startedAt: enrollment.firstAccessAt,
    completedAt: enrollment.completedAt,
    lastAccessAt: enrollment.lastAccessAt,
  };
}

function getEnrollmentActivityTime(enrollment: ElearningEnrollment) {
  const value = enrollment.lastAccessAt || enrollment.completedAt || enrollment.firstAccessAt || enrollment.assignedAt;
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getEnrollmentStatusRank(status: ElearningEnrollment['learningStatus']) {
  if (status === 'completed' || status === 'passed') return 5;
  if (status === 'in_progress') return 4;
  if (status === 'failed') return 3;
  if (status === 'not_started') return 2;
  return 1;
}

export function selectPreferredLearnerCourseEnrollments(enrollments: ElearningEnrollment[]) {
  const courseEnrollmentMap = new Map<string, ElearningEnrollment>();
  for (const enrollment of enrollments) {
    if (!enrollment.courseId || enrollment.learningStatus === 'expired') continue;
    const current = courseEnrollmentMap.get(enrollment.courseId);
    if (!current) {
      courseEnrollmentMap.set(enrollment.courseId, enrollment);
      continue;
    }
    const nextRank = getEnrollmentStatusRank(enrollment.learningStatus);
    const currentRank = getEnrollmentStatusRank(current.learningStatus);
    if (
      nextRank > currentRank ||
      (nextRank === currentRank && getEnrollmentActivityTime(enrollment) > getEnrollmentActivityTime(current))
    ) {
      courseEnrollmentMap.set(enrollment.courseId, enrollment);
    }
  }
  return [...courseEnrollmentMap.values()];
}

function mapLearningResultRow(row: any, enrollment: ElearningEnrollment): ElearningLearningResult {
  return {
    enrollmentId: String(row.enrollment_id || enrollment.id),
    studentId: String(row.student_id || enrollment.studentId),
    classId: String(row.class_id || enrollment.classId),
    courseId: String(row.course_id || enrollment.courseId),
    profileId: String(row.profile_id || enrollment.profileId),
    progressPercent: Math.max(0, Math.min(100, Number(row.progress_percent || 0))),
    lessonCompletedCount: Number(row.lesson_completed_count || 0),
    lessonTotalCount: Number(row.lesson_total_count || 0),
    scormCompletionStatus: String(row.scorm_completion_status || 'unknown'),
    scormSuccessStatus: String(row.scorm_success_status || 'unknown'),
    scormScore: row.scorm_score === null || row.scorm_score === undefined ? null : Number(row.scorm_score),
    quizScore: row.quiz_score === null || row.quiz_score === undefined ? null : Number(row.quiz_score),
    quizPassed: row.quiz_passed === null || row.quiz_passed === undefined ? null : row.quiz_passed === true,
    finalStatus: ['in_progress', 'completed', 'passed', 'failed', 'expired'].includes(row.final_status) ? row.final_status : enrollment.learningStatus,
    startedAt: row.started_at ? String(row.started_at) : enrollment.firstAccessAt,
    completedAt: row.completed_at ? String(row.completed_at) : enrollment.completedAt,
    lastAccessAt: row.last_access_at ? String(row.last_access_at) : enrollment.lastAccessAt,
  };
}

export function sanitizeElearningId(value: string) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const VLEARNING_QUIZ_SOURCE = 'vlearning';
const VLEARNING_QUIZ_ID_PREFIX = 'vlearning';

function buildElearningQuizId(value: string | undefined, fallback: string) {
  const base = sanitizeQuizId(value || '') || `${fallback}-${Date.now()}`;
  return base.startsWith(`${VLEARNING_QUIZ_ID_PREFIX}-`) ? base : `${VLEARNING_QUIZ_ID_PREFIX}-${base}`;
}

function isElearningQuizForm(form: QuizForm) {
  const source = String(form.metadata?.source || form.metadata?.module || '').toLowerCase();
  return source === VLEARNING_QUIZ_SOURCE || form.id.startsWith(`${VLEARNING_QUIZ_ID_PREFIX}-`);
}

function isElearningQuizQuestionSet(set: QuizQuestionSet, linkedSetIds: Set<string>) {
  return set.id.startsWith(`${VLEARNING_QUIZ_ID_PREFIX}-`) || linkedSetIds.has(set.id);
}

function withElearningQuizMetadata(metadata?: Record<string, unknown>) {
  return {
    ...(metadata || {}),
    source: VLEARNING_QUIZ_SOURCE,
    module: VLEARNING_QUIZ_SOURCE,
  };
}

export async function listElearningQuizForms() {
  const forms = await listQuizForms();
  return forms.filter(isElearningQuizForm);
}

export async function listElearningQuizQuestionSets() {
  const [sets, forms] = await Promise.all([listQuizQuestionSets(), listElearningQuizForms()]);
  const linkedSetIds = new Set(forms.map((form) => form.questionSetId).filter(Boolean));
  return sets.filter((set) => isElearningQuizQuestionSet(set, linkedSetIds));
}

export async function getElearningQuizQuestionSetBundle(questionSetId: string): Promise<QuizQuestionSetBundle> {
  return getQuizQuestionSetBundle(questionSetId);
}

export async function createElearningQuizQuestionSet(input: { id?: string; name: string; description?: string; questions?: QuizQuestion[] }) {
  return createQuizQuestionSet({
    id: buildElearningQuizId(input.id || input.name, 'question-set'),
    name: input.name,
    description: input.description,
    questions: input.questions || [],
  });
}

export async function updateElearningQuizQuestionSet(questionSetId: string, input: QuizQuestionSetUpdateInput) {
  return updateQuizQuestionSet(questionSetId, input);
}

export async function deleteElearningQuizQuestionSet(questionSetId: string) {
  return deleteQuizQuestionSet(questionSetId);
}

export async function createElearningQuizForm(input: QuizFormInput) {
  return createQuizForm({
    ...input,
    id: buildElearningQuizId(input.id || input.title, 'quiz'),
    metadata: withElearningQuizMetadata(input.metadata),
  });
}

export async function updateElearningQuizForm(formId: string, input: QuizFormUpdateInput) {
  const existing = (await listQuizForms()).find((form) => form.id === formId);
  return updateQuizForm(formId, {
    ...input,
    metadata: withElearningQuizMetadata({
      ...(existing?.metadata || {}),
      ...(input.metadata || {}),
    }),
  });
}

export async function deleteElearningQuizForm(formId: string) {
  return deleteQuizForm(formId);
}

export function parseVimeoVideoId(value: string) {
  const trimmed = String(value || '').trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/i) || trimmed.match(/player\.vimeo\.com\/video\/(\d+)/i);
  return match?.[1] || '';
}

function parseVimeoPrivacyHash(value: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const queryHash = trimmed.match(/[?&]h=([a-z0-9]+)/i)?.[1];
  if (queryHash) return queryHash;
  return trimmed.match(/vimeo\.com\/(?:video\/)?\d+\/([a-z0-9]+)/i)?.[1] || '';
}

export function buildVimeoEmbedUrl(value: string) {
  const videoId = parseVimeoVideoId(value);
  const privacyHash = parseVimeoPrivacyHash(value);
  const searchParams = new URLSearchParams();
  if (privacyHash) searchParams.set('h', privacyHash);
  searchParams.set('api', '1');
  searchParams.set('dnt', '1');
  searchParams.set('autoplay', '0');
  searchParams.set('muted', '0');
  searchParams.set('autopause', '0');
  searchParams.set('playsinline', '1');
  searchParams.set('responsive', '1');
  searchParams.set('controls', '1');
  searchParams.set('preload', 'auto');
  searchParams.set('texttrack', 'vi');
  searchParams.set('transcript', '0');
  searchParams.set('title', '0');
  searchParams.set('byline', '0');
  searchParams.set('portrait', '0');
  searchParams.set('badge', '0');
  return `https://player.vimeo.com/video/${videoId}?${searchParams.toString()}`;
}

export function buildCourseLearnLink(courseId: string) {
  if (typeof window === 'undefined') return `/vlearning/${courseId}`;
  return `${window.location.origin}/vlearning/${courseId}`;
}

export function buildScormLaunchUrl(packageId: string, launchPath: string) {
  return `/api/scorm-content-file/${encodeURIComponent(packageId)}/${cleanScormPath(launchPath || 'index_lms.html')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

function firstXmlText(parent: Element | Document, selector: string) {
  return parent.querySelector(selector)?.textContent?.trim() || '';
}

function attrByLocalName(element: Element | null | undefined, localName: string) {
  if (!element) return '';
  for (let index = 0; index < element.attributes.length; index += 1) {
    const attr = element.attributes.item(index);
    if (attr?.localName === localName) return attr.value;
  }
  return '';
}

async function readStorylineData(zip: JSZip) {
  const dataFile = zip.file('html5/data/js/data.js');
  if (!dataFile) return { slideCount: 0, quizCount: 0, quizQuestionCount: 0, passPercent: null as number | null };
  const dataText = await dataFile.async('text');
  const slideCount = (dataText.match(/"kind":"slide"/g) || []).length;
  const quizCount = (dataText.match(/"kind":"quiz"/g) || []).length;
  const passPercentMatch = dataText.match(/"passPercent":(\d+)/);
  const passPercent = passPercentMatch ? Number(passPercentMatch[1]) : null;
  const quizRefsMatch = dataText.match(/"quizzes":\[\{[\s\S]*?"sliderefs":\[([\s\S]*?)\]/);
  const quizQuestionCount = quizRefsMatch ? (quizRefsMatch[1].match(/"kind":"slideref"/g) || []).length : 0;
  return { slideCount, quizCount, quizQuestionCount, passPercent };
}

async function parseScormPackage(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const manifestFile = zip.file('imsmanifest.xml');
  if (!manifestFile) throw new Error('File ZIP khong co imsmanifest.xml.');
  const manifestXml = await manifestFile.async('text');
  const documentXml = new DOMParser().parseFromString(manifestXml, 'application/xml');
  const parserError = documentXml.querySelector('parsererror');
  if (parserError) throw new Error('imsmanifest.xml khong hop le.');

  const manifest = documentXml.documentElement;
  const manifestIdentifier = manifest.getAttribute('identifier') || '';
  const schemaVersion = firstXmlText(documentXml, 'schemaversion');
  const scormVersion: '1.2' | '2004' = /1\.2/i.test(schemaVersion) ? '1.2' : '2004';
  const defaultOrgId = documentXml.querySelector('organizations')?.getAttribute('default') || '';
  const organization = defaultOrgId
    ? Array.from(documentXml.querySelectorAll('organization')).find((item) => item.getAttribute('identifier') === defaultOrgId) || documentXml.querySelector('organization')
    : documentXml.querySelector('organization');
  const organizationIdentifier = organization?.getAttribute('identifier') || '';
  const title = firstXmlText(organization || documentXml, 'title') || file.name.replace(/\.zip$/i, '');
  const item = organization?.querySelector('item[identifierref]') || documentXml.querySelector('item[identifierref]');
  const scoIdentifier = item?.getAttribute('identifier') || '';
  const resourceId = item?.getAttribute('identifierref') || '';
  const resources = Array.from(documentXml.querySelectorAll('resource'));
  const resource = resources.find((item) => item.getAttribute('identifier') === resourceId) || resources.find((item) => /sco/i.test(attrByLocalName(item, 'scormType'))) || resources[0];
  const launchPath = cleanScormPath(resource?.getAttribute('href') || '');
  if (!launchPath) throw new Error('Manifest SCORM khong co launch href.');
  if (!zip.file(launchPath)) throw new Error(`Không tìm thấy launch file ${launchPath} trong ZIP.`);

  const files = Object.values(zip.files).filter((entry) => !entry.dir && cleanScormPath(entry.name));
  const storyline = await readStorylineData(zip);
  return {
    zip,
    title,
    scormVersion,
    manifestIdentifier,
    organizationIdentifier,
    scoIdentifier,
    launchPath,
    fileCount: files.length,
    totalSizeBytes: files.reduce((sum, entry: any) => sum + Number(entry?._data?.uncompressedSize || 0), 0),
    ...storyline,
    entries: files.map((entry) => ({
      path: cleanScormPath(entry.name),
      contentType: contentTypeForScormPath(entry.name),
      entry,
    })),
  };
}

export async function uploadElearningScormPackage(input: { file: File; createdBy?: string | null }) {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.');
  const parsed = await parseScormPackage(input.file);
  const packageIdBase = sanitizeElearningId(parsed.title) || 'scorm';
  const packageId = `${packageIdBase}-${Date.now()}`;
  const payload = await requestAppApi('/api/scorm-upload', {
    method: 'POST',
    body: JSON.stringify({
      packageId,
      entries: parsed.entries.map((entry) => ({ path: entry.path, contentType: entry.contentType })),
    }),
  });
  type ScormSignedUpload = { path: string; objectPath: string; token: string; contentType?: string };
  const uploads: ScormSignedUpload[] = Array.isArray(payload.uploads) ? payload.uploads.map((item: any) => ({
    path: String(item.path || ''),
    objectPath: String(item.objectPath || ''),
    token: String(item.token || ''),
    contentType: String(item.contentType || ''),
  })) : [];
  const uploadsByPath = new Map<string, ScormSignedUpload>(uploads.map((item) => [item.path, item]));
  for (const entry of parsed.entries) {
    const upload = uploadsByPath.get(entry.path);
    if (!upload?.token) throw new Error(`Server khong cap upload URL cho ${entry.path}.`);
    const blob = await entry.entry.async('blob');
    const uploadResult = await supabase.storage.from(String(payload.bucket || SCORM_STORAGE_BUCKET)).uploadToSignedUrl(String(upload.objectPath), String(upload.token), blob, {
      contentType: entry.contentType,
    });
    if (uploadResult.error) throw uploadResult.error;
  }

  const row = {
    id: packageId,
    title: parsed.title,
    original_file_name: input.file.name,
    scorm_version: parsed.scormVersion,
    manifest_identifier: parsed.manifestIdentifier,
    organization_identifier: parsed.organizationIdentifier,
    sco_identifier: parsed.scoIdentifier,
    launch_path: parsed.launchPath,
    storage_bucket: String(payload.bucket || SCORM_STORAGE_BUCKET),
    storage_prefix: String(payload.storagePrefix || `elearning/scorm/${packageId}`),
    file_count: parsed.fileCount,
    total_size_bytes: parsed.totalSizeBytes,
    slide_count: parsed.slideCount,
    quiz_count: parsed.quizCount,
    quiz_question_count: parsed.quizQuestionCount,
    pass_percent: parsed.passPercent,
    manifest_json: {
      title: parsed.title,
      launchPath: parsed.launchPath,
      scormVersion: parsed.scormVersion,
      slideCount: parsed.slideCount,
      quizCount: parsed.quizCount,
      quizQuestionCount: parsed.quizQuestionCount,
      passPercent: parsed.passPercent,
    },
    status: 'ready',
    created_by: input.createdBy || null,
  };

  try {
    const { data, error } = await supabase.from('vcontent_eln_scorm_packages').upsert(row).select('*').single();
    if (error) throw error;
    return mapScormPackageRow(data);
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    const local = mapScormPackageRow({ ...row, created_at: new Date().toISOString() });
    setLocal(SCORM_PACKAGE_STORAGE_KEY, [local, ...getLocal<ElearningScormPackage[]>(SCORM_PACKAGE_STORAGE_KEY, []).filter((item) => item.id !== local.id)]);
    return local;
  }
}

export async function uploadElearningCourseThumbnail(input: { file: File; courseId?: string | null }) {
  const client = requireSupabase();
  const file = input.file;
  if (!file.type.startsWith('image/')) {
    throw new Error('Vui lòng chọn file ảnh PNG, JPG hoặc WebP.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Thumbnail không được vượt quá 5MB.');
  }
  const safeCourseId = sanitizeElearningId(input.courseId || 'new-course') || 'new-course';
  const payload = await requestAppApi('/api/intake-upload', {
    method: 'POST',
    body: JSON.stringify({
      action: 'signed_upload_url',
      orderId: safeCourseId,
      productId: 'course',
      itemCode: 'thumbnail',
      module: 'vlearning-thumbnails',
      fileName: file.name,
      contentType: file.type || 'image/png',
    }),
  });
  const upload = (payload as { upload?: { bucket?: string; path?: string; token?: string; signedUrl?: string; fileName?: string } }).upload;
  if (!upload?.bucket || !upload.path || !upload.token) {
    throw new Error('Server không cấp được URL upload thumbnail.');
  }
  const uploadResult = await client.storage.from(upload.bucket || COURSE_THUMBNAIL_STORAGE_BUCKET).uploadToSignedUrl(upload.path, upload.token, file, {
    contentType: file.type || 'image/png',
  });
  if (uploadResult.error) throw uploadResult.error;
  const publicUrl = client.storage.from(upload.bucket || COURSE_THUMBNAIL_STORAGE_BUCKET).getPublicUrl(upload.path).data.publicUrl;
  if (!publicUrl) throw new Error('Không lấy được URL thumbnail sau khi upload.');
  return publicUrl;
}

export async function listElearningCourses() {
  try {
    const client = requireSupabase();
    const [coursesResult, linksResult] = await Promise.all([
      client.from('vcontent_eln_courses').select('*').order('created_at', { ascending: false }),
      client.from('vcontent_eln_course_lessons').select('course_id'),
    ]);
    if (coursesResult.error) throw coursesResult.error;
    if (linksResult.error) throw linksResult.error;
    const counts = new Map<string, number>();
    for (const row of linksResult.data || []) {
      const id = String((row as any).course_id || '');
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const courses = (coursesResult.data || []).map((row) => mapCourseRow(row, counts.get(String((row as any).id)) || 0));
    return courses.length ? courses : getLocalCourses();
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const counts = new Map<string, number>();
    for (const row of getLocalCourseLessons()) counts.set(row.courseId, (counts.get(row.courseId) || 0) + 1);
    return getLocalCourses().map((course) => ({ ...course, lessonCount: counts.get(course.id) || 0 }));
  }
}

export async function listElearningLearnerDashboard(userId?: string, profileId?: string): Promise<ElearningLearnerDashboardCourse[]> {
  const normalizedUserId = String(userId || '').trim();
  const normalizedProfileId = String(profileId || '').trim();
  if (!normalizedUserId && !normalizedProfileId) return [];

  if (supabase) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('vlearning_get_learner_dashboard');
    if (error) throw error;
    if (!Array.isArray(data)) return [];
    return data
      .slice(0, 100)
      .map((row: any): ElearningLearnerDashboardCourse | null => {
        if (!row?.course || !row?.classSession || !row?.enrollment) return null;
        const enrollment = mapEnrollmentRow(row.enrollment);
        const course = mapCourseRow(row.course, Number(row.course.lesson_count || 0));
        const classSession = mapClassRow(row.classSession);
        return {
          course,
          classSession,
          enrollment,
          result: row.result ? mapLearningResultRow(row.result, enrollment) : createEmptyLearningResult(enrollment),
        };
      })
      .filter((item): item is ElearningLearnerDashboardCourse => Boolean(item));
  }

  const enrollments = selectPreferredLearnerCourseEnrollments(
    getLocal<ElearningEnrollment[]>(ENROLLMENT_STORAGE_KEY, [])
      .filter((item) => item.learningStatus !== 'expired' && (item.userId === normalizedUserId || (!!normalizedProfileId && item.profileId === normalizedProfileId)))
      .slice(0, 100),
  );
  const courses = getLocalCourses();
  const classMap = new Map(getLocal<ElearningClass[]>(CLASS_STORAGE_KEY, []).map((item) => [item.id, item]));
  const counts = new Map<string, number>();
  for (const row of getLocalCourseLessons()) counts.set(row.courseId, (counts.get(row.courseId) || 0) + 1);
  return enrollments
    .map((enrollment): ElearningLearnerDashboardCourse | null => {
      const classItem = classMap.get(enrollment.classId);
      if (!classItem || classItem.status !== 'open') return null;
      const course = courses.find((item) => item.id === enrollment.courseId && item.status !== 'archived');
      if (!course) return null;
      return {
        course: { ...course, lessonCount: counts.get(course.id) || 0 },
        classSession: classItem,
        enrollment,
        result: createEmptyLearningResult(enrollment),
      };
    })
    .filter((item): item is ElearningLearnerDashboardCourse => Boolean(item));
}

export async function listElearningLessons() {
  try {
    const client = requireSupabase();
    const [lessonsResult, partsResult, blocksResult] = await Promise.all([
      client.from('vcontent_eln_lessons').select('*').order('created_at', { ascending: false }),
      client.from('vcontent_eln_lesson_parts').select('lesson_id'),
      client.from('vcontent_eln_lesson_blocks').select('lesson_id'),
    ]);
    if (lessonsResult.error) throw lessonsResult.error;
    if (partsResult.error) throw partsResult.error;
    if (blocksResult.error && !isMissingSchemaError(blocksResult.error)) throw blocksResult.error;
    const counts = new Map<string, number>();
    for (const row of partsResult.data || []) {
      const id = String((row as any).lesson_id || '');
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    for (const row of blocksResult.data || []) {
      const id = String((row as any).lesson_id || '');
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const lessons = (lessonsResult.data || []).map((row) => mapLessonRow(row, counts.get(String((row as any).id)) || 0));
    return lessons.length ? lessons : getLocalLessons();
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const counts = new Map<string, number>();
    for (const part of getLocalParts()) counts.set(part.lessonId, (counts.get(part.lessonId) || 0) + 1);
    for (const block of getLocalLessonBlocks()) counts.set(block.lessonId, (counts.get(block.lessonId) || 0) + 1);
    return getLocalLessons().map((lesson) => ({ ...lesson, partCount: counts.get(lesson.id) || 0 }));
  }
}

export async function listElearningLessonParts(lessonId: string) {
  try {
    const client = requireSupabase();
    const { data, error } = await client.from('vcontent_eln_lesson_parts').select('*').eq('lesson_id', lessonId).order('sort_order', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapPartRow);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    return getLocalParts().filter((part) => part.lessonId === lessonId).sort((a, b) => a.sortOrder - b.sortOrder);
  }
}

export async function listElearningLessonBlocks(lessonId: string) {
  try {
    const client = requireSupabase();
    const { data, error } = await client.from('vcontent_eln_lesson_blocks').select('*').eq('lesson_id', lessonId).order('sort_order', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapLessonBlockRow);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    return getLocalLessonBlocks().filter((block) => block.lessonId === lessonId).sort((a, b) => a.sortOrder - b.sortOrder);
  }
}

export async function listElearningScormPackages() {
  try {
    const client = requireSupabase();
    const { data, error } = await client.from('vcontent_eln_scorm_packages').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapScormPackageRow);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    return getLocal<ElearningScormPackage[]>(SCORM_PACKAGE_STORAGE_KEY, []);
  }
}

export async function listElearningDeploymentBundle(): Promise<ElearningDeploymentBundle> {
  try {
    const client = requireSupabase();
    const [clientsResult, projectsResult, classesResult, studentsResult, classStudentsResult, enrollmentsResult, learnerGroupsResult, runTargetsResult] = await Promise.all([
      client.from('vcontent_eln_clients').select('*').order('created_at', { ascending: false }),
      client.from('vcontent_eln_projects').select('*').order('created_at', { ascending: false }),
      client.from('vcontent_eln_classes').select('*').order('created_at', { ascending: false }),
      client.from('vcontent_eln_students').select('*').order('created_at', { ascending: false }),
      client.from('vcontent_eln_class_students').select('*').order('created_at', { ascending: false }),
      client.from('vcontent_eln_enrollments').select('*').order('created_at', { ascending: false }),
      client.from('vcontent_eln_learner_groups').select('*').order('created_at', { ascending: false }),
      client.from('vcontent_eln_run_targets').select('*').order('created_at', { ascending: false }),
    ]);
    if (clientsResult.error) throw clientsResult.error;
    if (projectsResult.error) throw projectsResult.error;
    if (classesResult.error) throw classesResult.error;
    if (studentsResult.error) throw studentsResult.error;
    if (classStudentsResult.error && !isMissingSchemaError(classStudentsResult.error)) throw classStudentsResult.error;
    if (enrollmentsResult.error) throw enrollmentsResult.error;
    if (learnerGroupsResult.error && !isMissingSchemaError(learnerGroupsResult.error)) throw learnerGroupsResult.error;
    if (runTargetsResult.error && !isMissingSchemaError(runTargetsResult.error)) throw runTargetsResult.error;
    return {
      clients: (clientsResult.data || []).map(mapClientRow),
      projects: (projectsResult.data || []).map(mapProjectRow),
      classes: (classesResult.data || []).map(mapClassRow),
      students: (studentsResult.data || []).map(mapStudentRow),
      classStudents: classStudentsResult.error ? getLocal<ElearningClassStudent[]>(CLASS_STUDENT_STORAGE_KEY, []) : (classStudentsResult.data || []).map(mapClassStudentRow),
      enrollments: (enrollmentsResult.data || []).map(mapEnrollmentRow),
      learnerGroups: learnerGroupsResult.error ? getLocal<ElearningLearnerGroup[]>(LEARNER_GROUP_STORAGE_KEY, []) : (learnerGroupsResult.data || []).map(mapLearnerGroupRow),
      runTargets: runTargetsResult.error ? getLocal<ElearningRunTarget[]>(RUN_TARGET_STORAGE_KEY, []) : (runTargetsResult.data || []).map(mapRunTargetRow),
    };
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    return {
      clients: getLocal<ElearningClient[]>(CLIENT_STORAGE_KEY, []),
      projects: getLocal<ElearningProject[]>(PROJECT_STORAGE_KEY, []),
      classes: getLocal<ElearningClass[]>(CLASS_STORAGE_KEY, []),
      students: getLocal<ElearningStudent[]>(STUDENT_STORAGE_KEY, []),
      classStudents: getLocal<ElearningClassStudent[]>(CLASS_STUDENT_STORAGE_KEY, []),
      enrollments: getLocal<ElearningEnrollment[]>(ENROLLMENT_STORAGE_KEY, []),
      learnerGroups: getLocal<ElearningLearnerGroup[]>(LEARNER_GROUP_STORAGE_KEY, []),
      runTargets: getLocal<ElearningRunTarget[]>(RUN_TARGET_STORAGE_KEY, []),
    };
  }
}

export async function createElearningClient(input: { name: string; code?: string; contactName?: string; contactEmail?: string }) {
  const id = sanitizeElearningId(input.code || input.name) || `client-${Date.now()}`;
  const row = {
    id,
    code: (sanitizeElearningId(input.code || input.name) || id).toUpperCase(),
    name: input.name.trim(),
    contact_name: input.contactName?.trim() || '',
    contact_email: input.contactEmail?.trim().toLowerCase() || '',
    status: 'active',
  };
  try {
    const client = requireSupabase();
    const { data, error } = await client.from('vcontent_eln_clients').upsert(row).select('*').single();
    if (error) throw error;
    return mapClientRow(data);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const local = mapClientRow({ ...row, created_at: new Date().toISOString() });
    setLocal(CLIENT_STORAGE_KEY, [local, ...getLocal<ElearningClient[]>(CLIENT_STORAGE_KEY, []).filter((item) => item.id !== local.id)]);
    return local;
  }
}

export async function createElearningProject(input: { clientId: string; name: string; code?: string; linkedOrderId?: string; startDate?: string; endDate?: string }) {
  const id = sanitizeElearningId(`${input.clientId}-${input.code || input.name}`) || `project-${Date.now()}`;
  const row = {
    id,
    client_id: input.clientId,
    code: (sanitizeElearningId(input.code || input.name) || id).toUpperCase(),
    name: input.name.trim(),
    linked_order_id: input.linkedOrderId?.trim() || null,
    start_date: input.startDate || null,
    end_date: input.endDate || null,
    status: 'planning',
  };
  try {
    const client = requireSupabase();
    const { data, error } = await client.from('vcontent_eln_projects').upsert(row).select('*').single();
    if (error) throw error;
    return mapProjectRow(data);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const local = mapProjectRow({ ...row, created_at: new Date().toISOString() });
    setLocal(PROJECT_STORAGE_KEY, [local, ...getLocal<ElearningProject[]>(PROJECT_STORAGE_KEY, []).filter((item) => item.id !== local.id)]);
    return local;
  }
}

export async function createElearningClass(input: {
  projectId?: string;
  courseId?: string;
  name: string;
  code?: string;
  trainingClassId?: string;
  startAt?: string;
  endAt?: string;
  enrollmentDeadline?: string;
  completionThreshold?: number;
  finalQuizFormId?: string;
}) {
  const id = sanitizeElearningId(input.code || input.name) || `class-${Date.now()}`;
  const row = {
    id,
    project_id: input.projectId || null,
    course_id: input.courseId || null,
    code: (sanitizeElearningId(input.code || input.name) || id).toUpperCase(),
    name: input.name.trim(),
    start_at: input.startAt || null,
    end_at: input.endAt || null,
    enrollment_deadline: input.enrollmentDeadline || null,
    completion_threshold: Math.max(1, Math.min(100, Number(input.completionThreshold || 90))),
    final_quiz_form_id: input.finalQuizFormId?.trim() || null,
    status: input.startAt ? 'scheduled' : 'draft',
    ...(input.trainingClassId?.trim() ? { training_class_id: input.trainingClassId.trim() } : {}),
  };
  try {
    const client = requireSupabase();
    const { data, error } = await client.from('vcontent_eln_classes').upsert(row).select('*').single();
    if (error) throw error;
    return mapClassRow(data);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const local = mapClassRow({ ...row, created_at: new Date().toISOString() });
    setLocal(CLASS_STORAGE_KEY, [local, ...getLocal<ElearningClass[]>(CLASS_STORAGE_KEY, []).filter((item) => item.id !== local.id)]);
    return local;
  }
}

export async function updateElearningClass(classId: string, input: ElearningClassUpdateInput) {
  const id = String(classId || '').trim();
  if (!id) throw new Error('Thiếu lớp / đợt học cần sửa.');
  if (input.name !== undefined && !input.name.trim()) throw new Error('Cần nhập tên lớp / đợt học.');
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.projectId !== undefined) row.project_id = input.projectId || null;
  if (input.courseId !== undefined) row.course_id = input.courseId || null;
  if (input.trainingClassId !== undefined) row.training_class_id = input.trainingClassId || null;
  if (input.code !== undefined) row.code = input.code.trim() || (input.name ? sanitizeElearningId(input.name).toUpperCase() : undefined);
  if (input.name !== undefined) row.name = input.name.trim();
  if (input.startAt !== undefined) row.start_at = input.startAt || null;
  if (input.endAt !== undefined) row.end_at = input.endAt || null;
  if (input.enrollmentDeadline !== undefined) row.enrollment_deadline = input.enrollmentDeadline || null;
  if (input.completionThreshold !== undefined) row.completion_threshold = Math.max(1, Math.min(100, Number(input.completionThreshold || 90)));
  if (input.finalQuizFormId !== undefined) row.final_quiz_form_id = input.finalQuizFormId || null;
  if (input.status !== undefined) row.status = input.status;

  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_eln_classes')
      .update(row)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return mapClassRow(data);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const classes = getLocal<ElearningClass[]>(CLASS_STORAGE_KEY, []);
    const existing = classes.find((item) => item.id === id);
    if (!existing) throw new Error('Không tìm thấy lớp / đợt học cần sửa.');
    const updated: ElearningClass = {
      ...existing,
      projectId: input.projectId !== undefined ? input.projectId : existing.projectId,
      courseId: input.courseId !== undefined ? input.courseId : existing.courseId,
      trainingClassId: input.trainingClassId !== undefined ? input.trainingClassId : existing.trainingClassId,
      code: input.code !== undefined ? input.code : existing.code,
      name: input.name !== undefined ? input.name.trim() : existing.name,
      startAt: input.startAt !== undefined ? input.startAt : existing.startAt,
      endAt: input.endAt !== undefined ? input.endAt : existing.endAt,
      enrollmentDeadline: input.enrollmentDeadline !== undefined ? input.enrollmentDeadline : existing.enrollmentDeadline,
      completionThreshold: input.completionThreshold !== undefined ? Math.max(1, Math.min(100, Number(input.completionThreshold || 90))) : existing.completionThreshold,
      finalQuizFormId: input.finalQuizFormId !== undefined ? input.finalQuizFormId : existing.finalQuizFormId,
      status: input.status !== undefined ? input.status : existing.status,
    };
    setLocal(CLASS_STORAGE_KEY, classes.map((item) => (item.id === id ? updated : item)));
    return updated;
  }
}

export async function deleteElearningClass(classId: string) {
  const id = String(classId || '').trim();
  if (!id) throw new Error('Thiếu lớp / đợt học cần xóa.');
  try {
    const client = requireSupabase();
    const { data: enrollments, error: enrollmentLookupError } = await client
      .from('vcontent_eln_enrollments')
      .select('id')
      .eq('class_id', id);
    if (enrollmentLookupError && !isMissingSchemaError(enrollmentLookupError)) throw enrollmentLookupError;
    const enrollmentIds = (enrollments || []).map((row: any) => String(row.id || '')).filter(Boolean);
    if (enrollmentIds.length) {
      await client.from('vcontent_eln_learning_results').delete().in('enrollment_id', enrollmentIds);
      await client.from('vcontent_eln_lesson_progress').delete().in('enrollment_id', enrollmentIds);
      await client.from('vcontent_eln_scorm_attempts').delete().in('enrollment_id', enrollmentIds);
      await client.from('vcontent_eln_block_attempts').delete().in('enrollment_id', enrollmentIds);
      const { error: enrollmentDeleteError } = await client.from('vcontent_eln_enrollments').delete().in('id', enrollmentIds);
      if (enrollmentDeleteError && !isMissingSchemaError(enrollmentDeleteError)) throw enrollmentDeleteError;
    }
    const { error } = await client.from('vcontent_eln_classes').delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    setLocal(CLASS_STORAGE_KEY, getLocal<ElearningClass[]>(CLASS_STORAGE_KEY, []).filter((item) => item.id !== id));
    setLocal(CLASS_STUDENT_STORAGE_KEY, getLocal<ElearningClassStudent[]>(CLASS_STUDENT_STORAGE_KEY, []).filter((item) => item.classId !== id));
    setLocal(ENROLLMENT_STORAGE_KEY, getLocal<ElearningEnrollment[]>(ENROLLMENT_STORAGE_KEY, []).filter((item) => item.classId !== id));
  }
}

export function getElearningClassLearnerCount(bundle: Pick<ElearningDeploymentBundle, 'classStudents' | 'enrollments'>, classId: string) {
  const activeRosterStudents = new Set(
    bundle.classStudents
      .filter((row) => row.classId === classId && row.status === 'active')
      .map((row) => row.studentId),
  );
  const enrollmentStudents = new Set(
    bundle.enrollments
      .filter((row) => row.classId === classId && row.learningStatus !== 'expired')
      .map((row) => row.studentId),
  );
  return new Set([...activeRosterStudents, ...enrollmentStudents]).size;
}

function splitDelimitedLine(line: string) {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if ((char === ',' || char === ';' || char === '\t') && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function normalizeImportHeader(value: string) {
  return sanitizeElearningId(value)
    .replace(/^ma-nhan-vien$/, 'employee-code')
    .replace(/^ho-ten$/, 'full-name')
    .replace(/^so-dien-thoai$/, 'phone')
    .replace(/^phong-ban$/, 'department')
    .replace(/^chuc-danh$/, 'position')
    .replace(/^don-vi$/, 'unit');
}

function getImportValue(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value) return value.trim();
  }
  return '';
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function parseElearningStudentImport(text: string, existingStudents: ElearningStudent[] = []): ElearningImportPreviewRow[] {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = splitDelimitedLine(lines[0]).map(normalizeImportHeader);
  const seenEmails = new Set<string>();
  const existingEmails = new Set(existingStudents.map((student) => student.email.toLowerCase()).filter(Boolean));
  return lines.slice(1).map((line, index) => {
    const cells = splitDelimitedLine(line);
    const raw: Record<string, string> = {};
    headers.forEach((header, cellIndex) => {
      raw[header] = cells[cellIndex] || '';
    });
    const email = getImportValue(raw, ['email']).toLowerCase();
    const fullName = getImportValue(raw, ['full-name', 'fullname', 'name']);
    const password = getImportValue(raw, ['password', 'mat-khau', 'matkhau']);
    const errors: string[] = [];
    if (!fullName) errors.push('Thiếu họ tên');
    if (!email) errors.push('Thiếu email');
    else if (!isValidEmail(email)) errors.push('Email không hợp lệ');
    else if (seenEmails.has(email)) errors.push('Email bị trùng trong file');
    if (!password) errors.push('Thieu mat khau');
    else if (password.length < 6) errors.push('Mat khau toi thieu 6 ky tu');
    if (email) seenEmails.add(email);
    const action: ElearningImportPreviewRow['action'] = errors.length ? 'error' : existingEmails.has(email) ? 'update' : 'create';
    return {
      rowNumber: index + 2,
      employeeCode: getImportValue(raw, ['employee-code', 'employee-code', 'ma-nv', 'manv']),
      fullName,
      email,
      password,
      phone: getImportValue(raw, ['phone', 'mobile']),
      department: getImportValue(raw, ['department']),
      position: getImportValue(raw, ['position']),
      unit: getImportValue(raw, ['unit']),
      errors,
      action,
    };
  });
}

export function parseElearningGroupEmailPaste(text: string) {
  return Array.from(new Set(
    String(text || '')
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email && isValidEmail(email)),
  ));
}

function buildEmailOrFilter(emails: string[]) {
  return emails.map((email) => `email.ilike.${email}`).join(',');
}

async function resolveElearningStudentIdsForEmails(client: ReturnType<typeof requireSupabase>, clientId: string, emails: string[]) {
  const normalizedClientId = String(clientId || '').trim();
  const normalizedEmails = parseElearningGroupEmailPaste(emails.join('\n'));
  if (!normalizedClientId || !normalizedEmails.length) return [];

  const { data: existingStudents, error: existingStudentError } = await client
    .from('vcontent_eln_students')
    .select('*')
    .eq('client_id', normalizedClientId)
    .or(buildEmailOrFilter(normalizedEmails));
  if (existingStudentError && !isMissingSchemaError(existingStudentError)) throw existingStudentError;

  const studentsByEmail = new Map<string, any>();
  for (const student of existingStudents || []) {
    const email = String(student.email || '').trim().toLowerCase();
    if (email) studentsByEmail.set(email, student);
  }

  const missingEmails = normalizedEmails.filter((email) => !studentsByEmail.has(email));
  if (missingEmails.length) {
    const bridgeRows: any[] = [];
    const { data: trainingStudents, error: trainingStudentError } = await client
      .from('vcontent_training_class_students')
      .select('id,profile_id,email,full_name,student_code,department,position,status')
      .or(buildEmailOrFilter(missingEmails));
    if (trainingStudentError && !isMissingSchemaError(trainingStudentError)) throw trainingStudentError;

    const bridgedEmails = new Set<string>();
    for (const row of trainingStudents || []) {
      const student = mapVTrainingStudentForElearning(row);
      if (!student.email || !missingEmails.includes(student.email) || bridgedEmails.has(student.email)) continue;
      bridgedEmails.add(student.email);
      bridgeRows.push({
        id: sanitizeElearningId(`${normalizedClientId}-${student.email}`) || `student-${Date.now()}`,
        client_id: normalizedClientId,
        user_id: student.userId || null,
        profile_id: student.profileId || null,
        employee_code: student.studentCode,
        full_name: student.fullName,
        email: student.email,
        department: student.department,
        position: student.position,
        status: student.status === 'inactive' ? 'inactive' : 'active',
        metadata: {
          sourceModule: 'vtraining',
          trainingStudentId: student.id,
        },
        updated_at: new Date().toISOString(),
      });
    }

    const profileOnlyEmails = missingEmails.filter((email) => !bridgedEmails.has(email));
    if (profileOnlyEmails.length) {
      const { data: profiles, error: profileError } = await client
        .from('vcontent_profiles')
        .select('id,auth_user_id,email,full_name')
        .or(buildEmailOrFilter(profileOnlyEmails));
      if (profileError && !isMissingSchemaError(profileError)) throw profileError;

      for (const profile of profiles || []) {
        const email = String(profile.email || '').trim().toLowerCase();
        if (!email || !profileOnlyEmails.includes(email) || bridgedEmails.has(email)) continue;
        bridgedEmails.add(email);
        bridgeRows.push({
          id: sanitizeElearningId(`${normalizedClientId}-${email}`) || `student-${Date.now()}`,
          client_id: normalizedClientId,
          user_id: profile.auth_user_id ? String(profile.auth_user_id) : null,
          profile_id: String(profile.id || '') || null,
          full_name: String(profile.full_name || profile.email || 'Học viên'),
          email,
          status: 'active',
          metadata: { sourceModule: 'profile' },
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (bridgeRows.length) {
      const { error: upsertError } = await client.from('vcontent_eln_students').upsert(bridgeRows, { onConflict: 'client_id,email' });
      if (upsertError) throw upsertError;

      const { data: resolvedStudents, error: resolvedStudentError } = await client
        .from('vcontent_eln_students')
        .select('*')
        .eq('client_id', normalizedClientId)
        .or(buildEmailOrFilter(normalizedEmails));
      if (resolvedStudentError && !isMissingSchemaError(resolvedStudentError)) throw resolvedStudentError;

      for (const student of resolvedStudents || []) {
        const email = String(student.email || '').trim().toLowerCase();
        if (email) studentsByEmail.set(email, student);
      }
    }
  }

  return normalizedEmails
    .map((email) => String(studentsByEmail.get(email)?.id || ''))
    .filter(Boolean);
}

export async function createElearningLearnerGroup(input: {
  clientId: string;
  name: string;
  description?: string;
  emailText: string;
}) {
  const emails = parseElearningGroupEmailPaste(input.emailText);
  if (!emails.length) throw new Error('Cần dán ít nhất một email học viên hợp lệ.');
  const id = sanitizeElearningId(`${input.clientId}-${input.name}`) || `group-${Date.now()}`;
  const now = new Date().toISOString();
  try {
    const client = requireSupabase();
    const studentIds = await resolveElearningStudentIdsForEmails(client, input.clientId, emails);
    const row = {
      id,
      client_id: input.clientId,
      name: input.name.trim(),
      description: input.description?.trim() || '',
      emails_json: emails,
      student_ids_json: studentIds,
      metadata: { emails, studentIds },
      status: 'active',
      updated_at: now,
    };
    const { data, error } = await client.from('vcontent_eln_learner_groups').upsert(row).select('*').single();
    if (error) throw error;
    return mapLearnerGroupRow(data);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const localStudents = getLocal<ElearningStudent[]>(STUDENT_STORAGE_KEY, []);
    const studentIds = localStudents
      .filter((student) => emails.includes(student.email.toLowerCase()))
      .map((student) => student.id);
    const local = mapLearnerGroupRow({
      id,
      client_id: input.clientId,
      name: input.name.trim(),
      description: input.description?.trim() || '',
      emails_json: emails,
      student_ids_json: studentIds,
      status: 'active',
      created_at: now,
    });
    setLocal(LEARNER_GROUP_STORAGE_KEY, [local, ...getLocal<ElearningLearnerGroup[]>(LEARNER_GROUP_STORAGE_KEY, []).filter((group) => group.id !== local.id)]);
    return local;
  }
}

export async function updateElearningLearnerGroup(input: {
  groupId: string;
  name: string;
  description?: string;
  emailText: string;
}) {
  const groupId = String(input.groupId || '').trim();
  if (!groupId) throw new Error('Thiếu nhóm học viên cần sửa.');
  const emails = parseElearningGroupEmailPaste(input.emailText);
  if (!emails.length) throw new Error('Cần dán ít nhất một email học viên hợp lệ.');
  const bundle = await listElearningDeploymentBundle();
  const existingGroup = bundle.learnerGroups.find((group) => group.id === groupId);
  if (!existingGroup) throw new Error('Không tìm thấy nhóm học viên cần sửa.');
  const students = bundle.students.filter((student) => emails.includes(student.email.toLowerCase()));
  const localStudentIds = students.map((student) => student.id);
  const now = new Date().toISOString();
  try {
    const client = requireSupabase();
    const studentIds = await resolveElearningStudentIdsForEmails(client, existingGroup.clientId, emails);
    const { data, error } = await client
      .from('vcontent_eln_learner_groups')
      .update({
        name: input.name.trim(),
        description: input.description?.trim() || '',
        emails_json: emails,
        student_ids_json: studentIds,
        metadata: { emails, studentIds },
        updated_at: now,
      })
      .eq('id', groupId)
      .select('*')
      .single();
    if (error) throw error;
    return mapLearnerGroupRow(data);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const updated = mapLearnerGroupRow({
      id: existingGroup.id,
      client_id: existingGroup.clientId,
      name: input.name.trim(),
      description: input.description?.trim() || '',
      emails_json: emails,
      student_ids_json: localStudentIds,
      status: existingGroup.status,
      created_at: existingGroup.createdAt,
    });
    setLocal(LEARNER_GROUP_STORAGE_KEY, getLocal<ElearningLearnerGroup[]>(LEARNER_GROUP_STORAGE_KEY, []).map((group) => (group.id === groupId ? updated : group)));
    return updated;
  }
}

export async function deleteElearningLearnerGroup(groupId: string) {
  const id = String(groupId || '').trim();
  if (!id) throw new Error('Thiếu nhóm học viên cần xóa.');
  try {
    const client = requireSupabase();
    const { error } = await client.from('vcontent_eln_learner_groups').delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    setLocal(LEARNER_GROUP_STORAGE_KEY, getLocal<ElearningLearnerGroup[]>(LEARNER_GROUP_STORAGE_KEY, []).filter((group) => group.id !== id));
  }
}

export async function importElearningStudentsToClass(input: {
  clientId: string;
  classId: string;
  courseId?: string;
  fileName?: string;
  importedBy?: string | null;
  rows: ElearningImportPreviewRow[];
}) {
  const validRows = input.rows.filter((row) => row.action !== 'error');
  const now = new Date().toISOString();
  const studentRows = validRows.map((row) => ({
    id: sanitizeElearningId(`${input.clientId}-${row.email}`) || `student-${Date.now()}`,
    client_id: input.clientId,
    employee_code: row.employeeCode,
    full_name: row.fullName,
    email: row.email.toLowerCase(),
    phone: row.phone,
    department: row.department,
    position: row.position,
    unit: row.unit,
    status: 'active',
    updated_at: now,
  }));

  try {
    const provisioned = await requestAppApi('/api/eln-student-import', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (Number(provisioned?.errors || 0) > 0) {
      const failed = Array.isArray(provisioned?.results) ? provisioned.results.filter((result: any) => !result.ok) : [];
      const detail = failed
        .slice(0, 3)
        .map((item: any) => `dong ${item.rowNumber}: ${Array.isArray(item.errors) ? item.errors.join(', ') : 'loi import'}`)
        .join('; ');
      throw new Error(`Import ${Number(provisioned?.imported || 0)} hoc vien, ${Number(provisioned?.errors || 0)} dong loi${detail ? ` (${detail})` : ''}.`);
    }
    return { imported: Number(provisioned?.imported || validRows.length), errors: Number(provisioned?.errors || 0) };
  } catch (apiError) {
    if (supabase && !isMissingSchemaError(apiError)) throw apiError;
  }

  try {
    const client = requireSupabase();
    if (studentRows.length) {
      const { error } = await client.from('vcontent_eln_students').upsert(studentRows, { onConflict: 'client_id,email' });
      if (error) throw error;
    }
    if (validRows.length) {
      const { data: students, error: studentError } = await client
        .from('vcontent_eln_students')
        .select('*')
        .eq('client_id', input.clientId)
        .in('email', validRows.map((row) => row.email.toLowerCase()));
      if (studentError) throw studentError;
      const classStudentRows = (students || []).map((student: any) => ({
        class_id: input.classId,
        student_id: student.id,
        source_module: 'manual',
        source_id: input.fileName || '',
        status: 'active',
        metadata: {
          sourceModule: 'manual',
          importedBy: input.importedBy || null,
        },
        updated_at: now,
      }));
      if (classStudentRows.length) {
        const { error: classStudentError } = await client.from('vcontent_eln_class_students').upsert(classStudentRows, { onConflict: 'class_id,student_id' });
        if (classStudentError) throw classStudentError;
      }
      if (!input.courseId) {
        await client.from('vcontent_eln_import_batches').insert({
          class_id: input.classId,
          file_name: input.fileName || '',
          total_rows: input.rows.length,
          success_rows: validRows.length,
          error_rows: input.rows.length - validRows.length,
          updated_rows: validRows.filter((row) => row.action === 'update').length,
          skipped_rows: 0,
          imported_by: input.importedBy || null,
          errors: input.rows.filter((row) => row.errors.length).map((row) => ({ row: row.rowNumber, errors: row.errors })),
        });
        return { imported: validRows.length, errors: input.rows.length - validRows.length };
      }
      const enrollments = (students || []).map((student: any) => ({
        class_id: input.classId,
        course_id: input.courseId,
        student_id: student.id,
        user_id: student.user_id || null,
        invite_status: 'created',
        learning_status: 'not_started',
        updated_at: now,
      }));
      if (enrollments.length) {
        const { error } = await client.from('vcontent_eln_enrollments').upsert(enrollments, { onConflict: 'class_id,student_id' });
        if (error) throw error;
      }
    }
    await client.from('vcontent_eln_import_batches').insert({
      class_id: input.classId,
      file_name: input.fileName || '',
      total_rows: input.rows.length,
      success_rows: validRows.length,
      error_rows: input.rows.length - validRows.length,
      updated_rows: validRows.filter((row) => row.action === 'update').length,
      skipped_rows: 0,
      imported_by: input.importedBy || null,
      errors: input.rows.filter((row) => row.errors.length).map((row) => ({ row: row.rowNumber, errors: row.errors })),
    });
    return { imported: validRows.length, errors: input.rows.length - validRows.length };
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const students = getLocal<ElearningStudent[]>(STUDENT_STORAGE_KEY, []);
    const classStudents = getLocal<ElearningClassStudent[]>(CLASS_STUDENT_STORAGE_KEY, []);
    const enrollments = getLocal<ElearningEnrollment[]>(ENROLLMENT_STORAGE_KEY, []);
    const nextStudents = [...students];
    const nextClassStudents = [...classStudents];
    const nextEnrollments = [...enrollments];
    for (const row of validRows) {
      const existingIndex = nextStudents.findIndex((student) => student.clientId === input.clientId && student.email.toLowerCase() === row.email.toLowerCase());
      const student = mapStudentRow({
        id: existingIndex >= 0 ? nextStudents[existingIndex].id : sanitizeElearningId(`${input.clientId}-${row.email}`),
        client_id: input.clientId,
        employee_code: row.employeeCode,
        full_name: row.fullName,
        email: row.email.toLowerCase(),
        phone: row.phone,
        department: row.department,
        position: row.position,
        unit: row.unit,
        status: 'active',
        created_at: existingIndex >= 0 ? nextStudents[existingIndex].createdAt : now,
      });
      if (existingIndex >= 0) nextStudents[existingIndex] = student;
      else nextStudents.push(student);
      const classStudentIndex = nextClassStudents.findIndex((item) => item.classId === input.classId && item.studentId === student.id);
      const classStudent: ElearningClassStudent = {
        classId: input.classId,
        studentId: student.id,
        sourceModule: 'manual',
        sourceId: input.fileName || '',
        status: 'active',
        createdAt: classStudentIndex >= 0 ? nextClassStudents[classStudentIndex].createdAt : now,
      };
      if (classStudentIndex >= 0) nextClassStudents[classStudentIndex] = classStudent;
      else nextClassStudents.push(classStudent);
      if (input.courseId && !nextEnrollments.some((enrollment) => enrollment.classId === input.classId && enrollment.studentId === student.id)) {
        nextEnrollments.push(mapEnrollmentRow({
          id: createClientId(),
          class_id: input.classId,
          course_id: input.courseId,
          student_id: student.id,
          invite_token: createClientId().replace(/-/g, ''),
          invite_status: 'created',
          learning_status: 'not_started',
          assigned_at: now,
        }));
      }
    }
    setLocal(STUDENT_STORAGE_KEY, nextStudents);
    setLocal(CLASS_STUDENT_STORAGE_KEY, nextClassStudents);
    setLocal(ENROLLMENT_STORAGE_KEY, nextEnrollments);
    return { imported: validRows.length, errors: input.rows.length - validRows.length };
  }
}

export async function removeElearningClassStudentFromClass(classId: string, studentId: string, removedBy?: string | null) {
  const normalizedClassId = String(classId || '').trim();
  const normalizedStudentId = String(studentId || '').trim();
  if (!normalizedClassId || !normalizedStudentId) throw new Error('Thiếu học viên cần gỡ khỏi lớp.');
  try {
    const client = requireSupabase();
    const { error } = await client
      .from('vcontent_eln_class_students')
      .update({
        status: 'removed',
        metadata: {
          manualRemovedFromClass: true,
          manualRemovedAt: new Date().toISOString(),
          manualRemovedBy: removedBy || null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('class_id', normalizedClassId)
      .eq('student_id', normalizedStudentId);
    if (error) throw error;
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    setLocal(
      CLASS_STUDENT_STORAGE_KEY,
      getLocal<ElearningClassStudent[]>(CLASS_STUDENT_STORAGE_KEY, []).map((item) => (
        item.classId === normalizedClassId && item.studentId === normalizedStudentId
          ? { ...item, status: 'removed' }
          : item
      )),
    );
  }
}

export async function assignElearningLearnerGroupToClass(input: {
  classId: string;
  groupId: string;
}) {
  const bundle = await listElearningDeploymentBundle();
  const targetClass = bundle.classes.find((item) => item.id === input.classId);
  const group = bundle.learnerGroups.find((item) => item.id === input.groupId);
  if (!targetClass) throw new Error('Không tìm thấy đợt học cần gán nhóm.');
  if (!group) throw new Error('Không tìm thấy nhóm học viên.');
  const studentsByEmail = new Map(bundle.students.map((student) => [student.email.toLowerCase(), student]));
  const students = group.emails.map((email) => studentsByEmail.get(email)).filter((student): student is ElearningStudent => Boolean(student));
  const now = new Date().toISOString();
  try {
    const client = requireSupabase();
    const enrollments = students.map((student) => ({
      class_id: targetClass.id,
      course_id: targetClass.courseId,
      student_id: student.id,
      user_id: student.userId || null,
      profile_id: student.profileId || null,
      invite_status: 'created',
      learning_status: 'not_started',
      metadata: { sourceModule: 'vlearning_group', learnerGroupId: group.id },
      updated_at: now,
    }));
    if (enrollments.length) {
      const { error } = await client.from('vcontent_eln_enrollments').upsert(enrollments, { onConflict: 'class_id,student_id' });
      if (error) throw error;
    }
    return { assigned: enrollments.length, unresolved: group.emails.length - students.length };
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const current = getLocal<ElearningEnrollment[]>(ENROLLMENT_STORAGE_KEY, []);
    const next = [...current];
    for (const student of students) {
      const existingIndex = next.findIndex((enrollment) => enrollment.classId === targetClass.id && enrollment.studentId === student.id);
      const enrollment = mapEnrollmentRow({
        id: existingIndex >= 0 ? next[existingIndex].id : createClientId(),
        class_id: targetClass.id,
        course_id: targetClass.courseId,
        student_id: student.id,
        user_id: student.userId || null,
        profile_id: student.profileId || null,
        invite_token: existingIndex >= 0 ? next[existingIndex].inviteToken : createClientId().replace(/-/g, ''),
        invite_status: 'created',
        learning_status: existingIndex >= 0 ? next[existingIndex].learningStatus : 'not_started',
        assigned_at: existingIndex >= 0 ? next[existingIndex].assignedAt : now,
        metadata: { sourceModule: 'vlearning_group', learnerGroupId: group.id },
      });
      if (existingIndex >= 0) next[existingIndex] = enrollment;
      else next.push(enrollment);
    }
    setLocal(ENROLLMENT_STORAGE_KEY, next);
    return { assigned: students.length, unresolved: group.emails.length - students.length };
  }
}

export async function assignElearningClassRosterToLearningRun(input: {
  sourceClassId: string;
  runClassId: string;
  courseId: string;
}) {
  return assignElearningTargetsToLearningRun({
    runClassId: input.runClassId,
    courseId: input.courseId,
    targets: [{ targetType: 'class', targetId: input.sourceClassId }],
  });
}

export async function assignElearningTargetsToLearningRun(input: {
  runClassId: string;
  courseId: string;
  targets: Array<{ targetType: 'class' | 'group'; targetId: string }>;
}) {
  const runClassId = String(input.runClassId || '').trim();
  const courseId = String(input.courseId || '').trim();
  const targets = input.targets
    .map((target) => ({
      targetType: target.targetType === 'group' ? 'group' as const : 'class' as const,
      targetId: String(target.targetId || '').trim(),
    }))
    .filter((target) => target.targetId);
  const uniqueTargets = Array.from(
    new Map(targets.map((target) => [`${target.targetType}:${target.targetId}`, target])).values(),
  );
  if (!runClassId || !courseId || !uniqueTargets.length) {
    throw new Error('Can chon khoa hoc va it nhat mot lop/nhom hoc vien truoc khi tao dot hoc.');
  }
  const now = new Date().toISOString();
  const activeTargetKeys = new Set(uniqueTargets.map((target) => `${target.targetType}:${target.targetId}`));
  try {
    const client = requireSupabase();
    const { data: existingTargetRows, error: existingTargetError } = await client
      .from('vcontent_eln_run_targets')
      .select('id,target_type,target_id,metadata')
      .eq('run_class_id', runClassId)
      .eq('status', 'active');
    if (existingTargetError) throw existingTargetError;
    const removedTargetRows = (existingTargetRows || [])
      .filter((row: any) => row.id && !activeTargetKeys.has(`${row.target_type}:${row.target_id}`));
    if (removedTargetRows.length) {
      const removeResults = await Promise.all(removedTargetRows.map((row: any) => client
        .from('vcontent_eln_run_targets')
        .update({
          status: 'removed',
          metadata: { ...(row.metadata || {}), removedAt: now },
          updated_at: now,
        })
        .eq('id', row.id)));
      const removeTargetError = removeResults.find((result) => result.error)?.error;
      if (removeTargetError) throw removeTargetError;
    }
    const targetRows = uniqueTargets.map((target) => ({
      run_class_id: runClassId,
      target_type: target.targetType,
      target_id: target.targetId,
      status: 'active',
      metadata: { sourceModule: 'vlearning_run_target' },
      updated_at: now,
    }));
    const { error: targetError } = await client.from('vcontent_eln_run_targets').upsert(targetRows, { onConflict: 'run_class_id,target_type,target_id' });
    if (targetError) throw targetError;

    const classTargetIds = uniqueTargets.filter((target) => target.targetType === 'class').map((target) => target.targetId);
    const groupTargetIds = uniqueTargets.filter((target) => target.targetType === 'group').map((target) => target.targetId);
    const [rosterResult, groupResult] = await Promise.all([
      classTargetIds.length
        ? client.from('vcontent_eln_class_students').select('class_id,student_id').in('class_id', classTargetIds).eq('status', 'active')
        : Promise.resolve({ data: [], error: null }),
      groupTargetIds.length
        ? client.from('vcontent_eln_learner_groups').select('*').in('id', groupTargetIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (rosterResult.error) throw rosterResult.error;
    if (groupResult.error) throw groupResult.error;

    const studentTargetById = new Map<string, { targetType: 'class' | 'group'; targetId: string }>();
    for (const row of rosterResult.data || []) {
      const studentId = String((row as any).student_id || '');
      const targetId = String((row as any).class_id || '');
      if (studentId && targetId) studentTargetById.set(studentId, { targetType: 'class', targetId });
    }
    const groups = (groupResult.data || []).map(mapLearnerGroupRow);
    for (const group of groups) {
      for (const studentId of group.studentIds) {
        if (studentId) studentTargetById.set(studentId, { targetType: 'group', targetId: group.id });
      }
    }
    const groupEmails = groups.flatMap((group) => group.emails);
    if (groupEmails.length) {
      const { data: emailStudents, error: emailStudentError } = await client
        .from('vcontent_eln_students')
        .select('id,email')
        .in('email', Array.from(new Set(groupEmails)));
      if (emailStudentError) throw emailStudentError;
      const groupByEmail = new Map(groups.flatMap((group) => group.emails.map((email) => [email, group.id] as const)));
      for (const student of emailStudents || []) {
        const email = String((student as any).email || '').toLowerCase();
        const targetId = groupByEmail.get(email);
        const studentId = String((student as any).id || '');
        if (targetId && studentId) studentTargetById.set(studentId, { targetType: 'group', targetId });
      }
    }
    const studentIds = Array.from(studentTargetById.keys());
    if (!studentIds.length) return { assigned: 0, unresolved: 0 };
    const { data: students, error: studentError } = await client
      .from('vcontent_eln_students')
      .select('id,user_id,profile_id')
      .in('id', studentIds);
    if (studentError) throw studentError;
    const enrollments = (students || []).map((student: any) => {
      const target = studentTargetById.get(String(student.id || ''));
      return {
      class_id: runClassId,
      course_id: courseId,
      student_id: student.id,
      user_id: student.user_id || null,
      profile_id: student.profile_id || null,
      invite_status: 'created',
      learning_status: 'not_started',
      metadata: {
        sourceModule: 'vlearning_run_target',
        targetType: target?.targetType || 'class',
        targetId: target?.targetId || '',
        sourceClassId: target?.targetType === 'class' ? target.targetId : undefined,
        learnerGroupId: target?.targetType === 'group' ? target.targetId : undefined,
      },
      updated_at: now,
    };
    });
    if (enrollments.length) {
      const { error } = await client.from('vcontent_eln_enrollments').upsert(enrollments, { onConflict: 'class_id,student_id' });
      if (error) throw error;
    }
    const { data: existingEnrollmentRows, error: existingEnrollmentError } = await client
      .from('vcontent_eln_enrollments')
      .select('id,metadata,learning_status')
      .eq('class_id', runClassId);
    if (existingEnrollmentError) throw existingEnrollmentError;
    const removedEnrollmentRows = (existingEnrollmentRows || [])
      .filter((row: any) => {
        const metadata = row.metadata || {};
        const targetType = String(metadata.targetType || (metadata.learnerGroupId ? 'group' : metadata.sourceClassId ? 'class' : ''));
        const targetId = String(metadata.targetId || metadata.learnerGroupId || metadata.sourceClassId || '');
        return row.id && targetType && targetId && !activeTargetKeys.has(`${targetType}:${targetId}`) && row.learning_status !== 'expired';
      });
    if (removedEnrollmentRows.length) {
      const expireResults = await Promise.all(removedEnrollmentRows.map((row: any) => client
        .from('vcontent_eln_enrollments')
        .update({
          learning_status: 'expired',
          metadata: { ...(row.metadata || {}), removedFromRunAt: now },
          updated_at: now,
        })
        .eq('id', row.id)));
      const expireEnrollmentError = expireResults.find((result) => result.error)?.error;
      if (expireEnrollmentError) throw expireEnrollmentError;
    }
    return { assigned: enrollments.length, unresolved: studentIds.length - enrollments.length };
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const classStudents = getLocal<ElearningClassStudent[]>(CLASS_STUDENT_STORAGE_KEY, []);
    const students = getLocal<ElearningStudent[]>(STUDENT_STORAGE_KEY, []);
    const learnerGroups = getLocal<ElearningLearnerGroup[]>(LEARNER_GROUP_STORAGE_KEY, []);
    const runTargets = getLocal<ElearningRunTarget[]>(RUN_TARGET_STORAGE_KEY, []);
    const enrollments = getLocal<ElearningEnrollment[]>(ENROLLMENT_STORAGE_KEY, []);
    const sourceStudentIds = new Map<string, { targetType: 'class' | 'group'; targetId: string }>();
    for (const target of uniqueTargets) {
      if (target.targetType === 'class') {
        for (const row of classStudents.filter((item) => item.classId === target.targetId && item.status === 'active')) {
          sourceStudentIds.set(row.studentId, target);
        }
        continue;
      }
      const group = learnerGroups.find((item) => item.id === target.targetId);
      if (!group) continue;
      for (const studentId of group.studentIds) sourceStudentIds.set(studentId, target);
      for (const email of group.emails) {
        const student = students.find((item) => item.email.toLowerCase() === email.toLowerCase());
        if (student) sourceStudentIds.set(student.id, target);
      }
    }
    const assignedStudents = students.filter((item) => sourceStudentIds.has(item.id));
    let next = [...enrollments];
    for (const student of assignedStudents) {
      const target = sourceStudentIds.get(student.id);
      const existingIndex = next.findIndex((enrollment) => enrollment.classId === runClassId && enrollment.studentId === student.id);
      const enrollment = mapEnrollmentRow({
        id: existingIndex >= 0 ? next[existingIndex].id : createClientId(),
        class_id: runClassId,
        course_id: courseId,
        student_id: student.id,
        user_id: student.userId || null,
        profile_id: student.profileId || null,
        invite_token: existingIndex >= 0 ? next[existingIndex].inviteToken : createClientId().replace(/-/g, ''),
        invite_status: 'created',
        learning_status: existingIndex >= 0 ? next[existingIndex].learningStatus : 'not_started',
        assigned_at: existingIndex >= 0 ? next[existingIndex].assignedAt : now,
        metadata: {
          sourceModule: 'vlearning_run_target',
          targetType: target?.targetType || 'class',
          targetId: target?.targetId || '',
          sourceClassId: target?.targetType === 'class' ? target.targetId : undefined,
          learnerGroupId: target?.targetType === 'group' ? target.targetId : undefined,
        },
      });
      if (existingIndex >= 0) next[existingIndex] = enrollment;
      else next.push(enrollment);
    }
    next = next.map((enrollment) => {
      if (enrollment.classId !== runClassId || enrollment.learningStatus === 'expired') return enrollment;
      const targetType = String(enrollment.metadata?.targetType || (enrollment.metadata?.learnerGroupId ? 'group' : enrollment.metadata?.sourceClassId ? 'class' : ''));
      const targetId = String(enrollment.metadata?.targetId || enrollment.metadata?.learnerGroupId || enrollment.metadata?.sourceClassId || '');
      if (!targetType || !targetId || activeTargetKeys.has(`${targetType}:${targetId}`)) return enrollment;
      return { ...enrollment, learningStatus: 'expired' as const, metadata: { ...enrollment.metadata, removedFromRunAt: now } };
    });
    const nextRunTargets = [
      ...runTargets.filter((target) => target.runClassId !== runClassId),
      ...uniqueTargets.map((target) => ({
        id: createClientId(),
        runClassId,
        targetType: target.targetType,
        targetId: target.targetId,
        status: 'active' as const,
        metadata: { sourceModule: 'vlearning_run_target' },
        createdAt: now,
      })),
    ];
    setLocal(RUN_TARGET_STORAGE_KEY, nextRunTargets);
    setLocal(ENROLLMENT_STORAGE_KEY, next);
    return { assigned: assignedStudents.length, unresolved: Math.max(0, sourceStudentIds.size - assignedStudents.length) };
  }
}

function uniqStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function getElearningNoticeCopy(kind: ElearningLearnerNoticeKind, input: {
  courseTitle?: string;
  className?: string;
  groupName?: string;
  lessonTitle?: string;
}) {
  const courseTitle = input.courseTitle || 'khóa học VLearning';
  const className = input.className ? `Đợt học: ${input.className}` : '';
  const groupName = input.groupName ? `Nhóm học viên: ${input.groupName}` : '';
  if (kind === 'study_reminder') {
    return {
      title: 'Nhắc nhở tiến độ học tập',
      body: [`Bạn chưa hoàn thành khóa học: ${courseTitle}.`, className, groupName, 'Vui lòng vào VLearning để tiếp tục học và hoàn thành các phần còn lại.'].filter(Boolean).join('\n'),
      level: 'warning' as const,
    };
  }
  if (kind === 'lesson_assigned') {
    return {
      title: 'Khóa học có bài học mới',
      body: [`Khóa học ${courseTitle} vừa được cập nhật bài học${input.lessonTitle ? `: ${input.lessonTitle}` : ' mới'}.`, className, 'Bạn có thể vào VLearning để học nội dung mới.'].filter(Boolean).join('\n'),
      level: 'info' as const,
    };
  }
  return {
    title: 'Khóa học mới khả dụng',
    body: [`Bạn vừa được gán khóa học: ${courseTitle}.`, className, groupName, 'Vào VLearning để bắt đầu học.'].filter(Boolean).join('\n'),
    level: 'info' as const,
  };
}

export async function notifyElearningLearners(input: {
  kind: ElearningLearnerNoticeKind;
  courseId?: string;
  classId?: string;
  groupId?: string;
  lessonId?: string;
  lessonTitle?: string;
  actorProfileId?: string | null;
  eventKeySuffix?: string;
}): Promise<ElearningLearnerNoticeResult> {
  const bundle = await listElearningDeploymentBundle();
  const targetClass = input.classId ? bundle.classes.find((item) => item.id === input.classId) || null : null;
  const courseId = input.courseId || targetClass?.courseId || '';
  const selectedCourse = courseId
    ? (await listElearningCourses()).find((item) => item.id === courseId) || null
    : null;
  const group = input.groupId ? bundle.learnerGroups.find((item) => item.id === input.groupId) || null : null;
  const studentById = new Map(bundle.students.map((student) => [student.id, student]));
  const studentByEmail = new Map(bundle.students.map((student) => [student.email.toLowerCase(), student]));
  const studentIds = new Set<string>();
  const directEmails = new Set<string>();

  if (group) {
    for (const studentId of group.studentIds) studentIds.add(studentId);
    for (const email of group.emails) {
      const student = studentByEmail.get(email.toLowerCase());
      if (student) studentIds.add(student.id);
      else directEmails.add(email.toLowerCase());
    }
  }

  for (const enrollment of bundle.enrollments) {
    const matchesClass = input.classId ? enrollment.classId === input.classId : true;
    const matchesCourse = courseId ? enrollment.courseId === courseId : true;
    const matchesGroup = input.groupId ? String(enrollment.metadata?.learnerGroupId || '') === input.groupId : true;
    if (matchesClass && matchesCourse && matchesGroup) studentIds.add(enrollment.studentId);
  }

  const students = [...studentIds].map((studentId) => studentById.get(studentId)).filter((student): student is ElearningStudent => Boolean(student));
  for (const student of students) if (student.email) directEmails.add(student.email.toLowerCase());
  const recipientProfileIds = uniqStrings(students.map((student) => student.profileId));
  const recipientAccountIds = uniqStrings(students.map((student) => student.userId));
  const recipientEmails = uniqStrings([...directEmails]);
  const recipientCount = new Set([...recipientProfileIds, ...recipientAccountIds, ...recipientEmails]).size;
  if (!recipientCount) return { recipientCount: 0, profileCount: 0, directEmailCount: 0 };

  const copy = getElearningNoticeCopy(input.kind, {
    courseTitle: selectedCourse?.title || courseId,
    className: targetClass?.name || '',
    groupName: group?.name || '',
    lessonTitle: input.lessonTitle,
  });
  await dispatchNotice({
    eventType: `vlearning_${input.kind}`,
    objectType: 'vlearning_course',
    objectId: courseId || input.classId || input.groupId || 'vlearning',
    actorProfileId: input.actorProfileId || null,
    title: copy.title,
    body: copy.body,
    level: copy.level,
    linkPage: courseId ? `vlearning/${courseId}` : 'vlearning',
    recipientProfileIds,
    recipientAccountIds,
    recipientEmails,
    eventKey: `vlearning:${input.kind}:${courseId || 'all'}:${input.classId || 'no-class'}:${input.groupId || 'no-group'}:${input.lessonId || 'no-lesson'}:${input.eventKeySuffix || new Date().toISOString().slice(0, 10)}`,
    metadata: {
      module: 'vlearning',
      source: 'vlearning',
      course_id: courseId || null,
      course_title: selectedCourse?.title || '',
      class_id: input.classId || null,
      class_name: targetClass?.name || '',
      learner_group_id: input.groupId || null,
      learner_group_name: group?.name || '',
      lesson_id: input.lessonId || null,
      lesson_title: input.lessonTitle || '',
      recipient_emails: recipientEmails,
    },
  });
  return {
    recipientCount,
    profileCount: recipientProfileIds.length,
    directEmailCount: Math.max(0, recipientEmails.length - recipientProfileIds.length),
  };
}

export async function runOptionalElearningLearnerNotice(input: Parameters<typeof notifyElearningLearners>[0]) {
  try {
    return await notifyElearningLearners(input);
  } catch {
    return { recipientCount: 0, profileCount: 0, directEmailCount: 0 };
  }
}

export async function updateElearningClassStatus(classId: string, status: ElearningClass['status']) {
  const id = String(classId || '').trim();
  if (!id) throw new Error('Thiếu đợt học cần cập nhật trạng thái.');
  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_eln_classes')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return mapClassRow(data);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const classes = getLocal<ElearningClass[]>(CLASS_STORAGE_KEY, []);
    const nextClasses = classes.map((item) => (item.id === id ? { ...item, status } : item));
    setLocal(CLASS_STORAGE_KEY, nextClasses);
    return nextClasses.find((item) => item.id === id) || null;
  }
}

function mapVTrainingClassForElearning(row: any): VTrainingClassForElearning {
  return {
    id: String(row.id || ''),
    code: String(row.code || ''),
    name: String(row.name || row.code || 'Lớp VTraining'),
    courseId: String(row.course_id || ''),
    startAt: row.start_at ? String(row.start_at) : null,
    endAt: row.end_at ? String(row.end_at) : null,
    currentLearnerCount: Number(row.current_learner_count || 0),
    status: String(row.status || 'pending'),
  };
}

function mapVTrainingStudentForElearning(row: any): VTrainingStudentForElearning {
  return {
    id: String(row.id || ''),
    profileId: String(row.profile_id || ''),
    userId: String(row.user_id || ''),
    email: String(row.email || '').trim().toLowerCase(),
    fullName: String(row.full_name || row.name || row.email || 'Học viên'),
    studentCode: String(row.student_code || row.employee_code || ''),
    department: String(row.department || ''),
    position: String(row.position || ''),
    status: String(row.status || 'active'),
  };
}

export async function listVTrainingClassesForElearning(): Promise<VTrainingClassForElearning[]> {
  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_training_classes')
      .select('id,code,name,course_id,start_at,end_at,current_learner_count,status')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data || []).map(mapVTrainingClassForElearning);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    return [];
  }
}

export async function listVTrainingStudentsForElearning(classId: string): Promise<VTrainingStudentForElearning[]> {
  const normalizedClassId = String(classId || '').trim();
  if (!normalizedClassId) return [];
  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_training_class_students')
      .select('id,class_id,profile_id,email,full_name,student_code,department,position,status')
      .eq('class_id', normalizedClassId)
      .order('full_name', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapVTrainingStudentForElearning);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    return [];
  }
}

export async function syncVTrainingRosterToElearningClass(input: {
  classId: string;
  clientId: string;
  trainingClassId: string;
  syncedBy?: string | null;
}): Promise<{ classId: string; trainingClassId: string; synced: number; skipped: number; removed: number }> {
  const classId = String(input.classId || '').trim();
  const clientId = String(input.clientId || '').trim();
  const trainingClassId = String(input.trainingClassId || '').trim();
  if (!classId || !clientId || !trainingClassId) {
    throw new Error('Cần chọn lớp E-learning, khách hàng và lớp VTraining trước khi đồng bộ roster.');
  }

  const students = await listVTrainingStudentsForElearning(trainingClassId);
  const validStudents = students.filter((student) => student.email);
  const sourceEmailSet = new Set(validStudents.map((student) => student.email));
  const now = new Date().toISOString();
  let removed = 0;

  try {
    const client = requireSupabase();
    if (validStudents.length) {
      const studentRows = validStudents.map((student) => ({
        id: sanitizeElearningId(`${clientId}-${student.email}`) || `student-${Date.now()}`,
        client_id: clientId,
        user_id: student.userId || null,
        profile_id: student.profileId || null,
        employee_code: student.studentCode,
        full_name: student.fullName,
        email: student.email,
        department: student.department,
        position: student.position,
        status: student.status === 'inactive' ? 'inactive' : 'active',
        metadata: {
          sourceModule: 'vtraining',
          trainingClassId,
          trainingStudentId: student.id,
        },
        updated_at: now,
      }));
      const { error: studentError } = await client.from('vcontent_eln_students').upsert(studentRows, { onConflict: 'client_id,email' });
      if (studentError) throw studentError;

      const { data: elnStudents, error: selectStudentError } = await client
        .from('vcontent_eln_students')
        .select('id,email')
        .eq('client_id', clientId)
        .in('email', validStudents.map((student) => student.email));
      if (selectStudentError) throw selectStudentError;

      const rosterRows = (elnStudents || []).map((student: any) => ({
        class_id: classId,
        student_id: String(student.id || ''),
        source_module: 'vtraining',
        source_id: trainingClassId,
        status: 'active',
        metadata: {
          sourceModule: 'vtraining',
          trainingClassId,
          syncedBy: input.syncedBy || null,
        },
        updated_at: now,
      })).filter((row) => row.student_id);
      if (rosterRows.length) {
        const { error: rosterError } = await client.from('vcontent_eln_class_students').upsert(rosterRows, { onConflict: 'class_id,student_id' });
        if (rosterError) throw rosterError;
      }
    }

    const { data: existingRows, error: existingError } = await client
      .from('vcontent_eln_class_students')
      .select('student_id,student:vcontent_eln_students(email)')
      .eq('class_id', classId)
      .eq('source_module', 'vtraining')
      .eq('source_id', trainingClassId)
      .eq('status', 'active');
    if (existingError) throw existingError;

    const staleRows = (existingRows || []).filter((row: any) => {
      const email = String(row.student?.email || '').trim().toLowerCase();
      return !email || !sourceEmailSet.has(email);
    });
    if (staleRows.length) {
      const { error: staleError } = await client
        .from('vcontent_eln_class_students')
        .update({
          status: 'removed',
          metadata: {
            sourceModule: 'vtraining',
            trainingClassId,
            removedFromVTrainingAt: now,
            syncedBy: input.syncedBy || null,
          },
          updated_at: now,
        })
        .eq('class_id', classId)
        .eq('source_module', 'vtraining')
        .eq('source_id', trainingClassId)
        .in('student_id', staleRows.map((row: any) => String(row.student_id || '')).filter(Boolean));
      if (staleError) throw staleError;
      removed = staleRows.length;
    }
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const currentStudents = getLocal<ElearningStudent[]>(STUDENT_STORAGE_KEY, []);
    const nextStudents = [...currentStudents];
    const classStudents = getLocal<ElearningClassStudent[]>(CLASS_STUDENT_STORAGE_KEY, [])
      .filter((row) => !(row.classId === classId && row.sourceModule === 'vtraining' && row.sourceId === trainingClassId));
    for (const student of validStudents) {
      const studentId = sanitizeElearningId(`${clientId}-${student.email}`) || `student-${Date.now()}`;
      const existingIndex = nextStudents.findIndex((item) => item.clientId === clientId && item.email === student.email);
      const localStudent: ElearningStudent = {
        id: existingIndex >= 0 ? nextStudents[existingIndex].id : studentId,
        clientId,
        userId: student.userId,
        profileId: student.profileId,
        employeeCode: student.studentCode,
        fullName: student.fullName,
        email: student.email,
        phone: '',
        department: student.department,
        position: student.position,
        unit: '',
        status: student.status === 'inactive' ? 'inactive' : 'active',
        createdAt: existingIndex >= 0 ? nextStudents[existingIndex].createdAt : now,
      };
      if (existingIndex >= 0) nextStudents[existingIndex] = localStudent;
      else nextStudents.push(localStudent);
      classStudents.push({
        classId,
        studentId: localStudent.id,
        sourceModule: 'vtraining',
        sourceId: trainingClassId,
        status: 'active',
        createdAt: now,
      });
    }
    setLocal(STUDENT_STORAGE_KEY, nextStudents);
    setLocal(CLASS_STUDENT_STORAGE_KEY, classStudents);
  }

  return {
    classId,
    trainingClassId,
    synced: validStudents.length,
    skipped: students.length - validStudents.length,
    removed,
  };
}

export async function assignVTrainingClassToElearningCourse(input: {
  clientId: string;
  projectId: string;
  courseId: string;
  trainingClassId: string;
  completionThreshold?: number;
  finalQuizFormId?: string;
  assignedBy?: string | null;
}): Promise<ElearningTrainingClassAssignmentResult> {
  const clientId = String(input.clientId || '').trim();
  const projectId = String(input.projectId || '').trim();
  const courseId = String(input.courseId || '').trim();
  const trainingClassId = String(input.trainingClassId || '').trim();
  if (!clientId || !projectId || !courseId || !trainingClassId) {
    throw new Error('Cần chọn khách hàng, dự án, khóa học và lớp VTraining trước khi gán.');
  }

  const client = requireSupabase();
  const { data: classRow, error: classError } = await client
    .from('vcontent_training_classes')
    .select('id,code,name,course_id,start_at,end_at,current_learner_count,status')
    .eq('id', trainingClassId)
    .maybeSingle();
  if (classError) throw classError;
  if (!classRow) throw new Error('Không tìm thấy lớp VTraining đã chọn.');

  const trainingClass = mapVTrainingClassForElearning(classRow);
  const students = await listVTrainingStudentsForElearning(trainingClassId);
  const validStudents = students.filter((student) => student.email);
  const sourceEmailSet = new Set(validStudents.map((student) => student.email));
  const now = new Date().toISOString();
  const classId = sanitizeElearningId(`vtraining-${trainingClassId}-${courseId}`) || `class-${Date.now()}`;
  const classCode = (sanitizeElearningId(`VT-${trainingClass.code || trainingClassId}-${courseId}`) || classId).toUpperCase();
  let removedCount = 0;

  const { data: elnClassRow, error: elnClassError } = await client
    .from('vcontent_eln_classes')
    .upsert({
      id: classId,
      project_id: projectId,
      course_id: courseId,
      training_class_id: trainingClassId,
      code: classCode,
      name: trainingClass.name,
      start_at: trainingClass.startAt,
      end_at: trainingClass.endAt,
      completion_threshold: Math.max(1, Math.min(100, Number(input.completionThreshold || 90))),
      final_quiz_form_id: input.finalQuizFormId?.trim() || null,
      status: trainingClass.startAt ? 'scheduled' : 'open',
      metadata: {
        sourceModule: 'vtraining',
        trainingClassId,
        trainingClassCode: trainingClass.code,
        assignedBy: input.assignedBy || null,
      },
      updated_at: now,
    }, { onConflict: 'id' })
    .select('*')
    .single();
  if (elnClassError) throw elnClassError;

  const { data: existingEnrollments, error: existingEnrollmentError } = await client
    .from('vcontent_eln_enrollments')
    .select('id,student_id,invite_status,learning_status,metadata,student:vcontent_eln_students(email)')
    .eq('class_id', elnClassRow.id);
  if (existingEnrollmentError) throw existingEnrollmentError;
  const existingByStudentId = new Map((existingEnrollments || []).map((row: any) => [String(row.student_id || ''), row]));

  if (validStudents.length) {
    const studentRows = validStudents.map((student) => ({
      id: sanitizeElearningId(`${clientId}-${student.email}`) || `student-${Date.now()}`,
      client_id: clientId,
      user_id: student.userId || null,
      profile_id: student.profileId || null,
      employee_code: student.studentCode,
      full_name: student.fullName,
      email: student.email,
      department: student.department,
      position: student.position,
      status: student.status === 'inactive' ? 'inactive' : 'active',
      metadata: {
        sourceModule: 'vtraining',
        trainingClassId,
        trainingStudentId: student.id,
      },
      updated_at: now,
    }));
    const { error: studentError } = await client.from('vcontent_eln_students').upsert(studentRows, { onConflict: 'client_id,email' });
    if (studentError) throw studentError;

    const { data: elnStudents, error: selectStudentError } = await client
      .from('vcontent_eln_students')
      .select('id,user_id,profile_id,email')
      .eq('client_id', clientId)
      .in('email', validStudents.map((student) => student.email));
    if (selectStudentError) throw selectStudentError;

    const enrollments = (elnStudents || []).map((student: any) => ({
      student,
      existing: existingByStudentId.get(String(student.id || '')),
    })).map(({ student, existing }: any) => {
      const existingMetadata = existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
        ? existing.metadata as Record<string, unknown>
        : {};
      const manualRemoved = existingMetadata.manualRemovedFromVLearning === true;
      const wasRemovedFromSource = Boolean(existingMetadata.removedFromVTrainingAt);
      return {
        class_id: elnClassRow.id,
        course_id: courseId,
        student_id: student.id,
        user_id: student.user_id || null,
        profile_id: student.profile_id || null,
        invite_status: existing?.invite_status || 'created',
        learning_status: manualRemoved ? 'expired' : wasRemovedFromSource ? 'not_started' : existing?.learning_status || 'not_started',
        metadata: {
          ...existingMetadata,
          sourceModule: 'vtraining',
          trainingClassId,
          removedFromVTrainingAt: null,
        },
        updated_at: now,
      };
    });
    if (enrollments.length) {
      const { error: enrollmentError } = await client.from('vcontent_eln_enrollments').upsert(enrollments, { onConflict: 'class_id,student_id' });
      if (enrollmentError) throw enrollmentError;
    }

  }

  const removedEnrollments = (existingEnrollments || []).filter((row: any) => {
    const email = String(row.student?.email || '').trim().toLowerCase();
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
    return metadata.sourceModule === 'vtraining'
      && metadata.trainingClassId === trainingClassId
      && metadata.manualRemovedFromVLearning !== true
      && row.learning_status !== 'expired'
      && (!email || !sourceEmailSet.has(email));
  });
  if (removedEnrollments.length) {
    const removeResults = await Promise.all(removedEnrollments.map((row: any) => {
      const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
      return client
        .from('vcontent_eln_enrollments')
        .update({
          learning_status: 'expired',
          metadata: {
            ...metadata,
            sourceModule: 'vtraining',
            trainingClassId,
            removedFromVTrainingAt: now,
          },
          updated_at: now,
        })
        .eq('id', row.id);
    }));
    const removeError = removeResults.find((result) => result.error)?.error;
    if (removeError) throw removeError;
    removedCount = removedEnrollments.length;
  }

  const { data: finalEnrollments, error: finalEnrollmentError } = await client
    .from('vcontent_eln_enrollments')
    .select('id')
    .eq('class_id', elnClassRow.id);
  if (finalEnrollmentError) throw finalEnrollmentError;

  return {
    classId: String(elnClassRow.id),
    trainingClassId,
    enrolled: validStudents.length,
    updated: Number(finalEnrollments?.length || 0),
    removed: removedCount,
    skipped: students.length - validStudents.length,
  };
}

export async function removeElearningEnrollmentFromClass(enrollmentId: string, removedBy?: string | null) {
  const id = String(enrollmentId || '').trim();
  if (!id) throw new Error('Thiếu enrollment cần gỡ khỏi khóa.');
  const client = requireSupabase();
  const { data, error } = await client
    .from('vcontent_eln_enrollments')
    .select('metadata')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  const metadata = data?.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
    ? data.metadata as Record<string, unknown>
    : {};
  const { error: updateError } = await client
    .from('vcontent_eln_enrollments')
    .update({
      learning_status: 'expired',
      metadata: {
        ...metadata,
        manualRemovedFromVLearning: true,
        manualRemovedAt: new Date().toISOString(),
        manualRemovedBy: removedBy || null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (updateError) throw updateError;
  return { success: true };
}

export async function getElearningClassReport(classId: string): Promise<ElearningClassReportRow[]> {
  const bundle = await listElearningDeploymentBundle();
  const selectedClass = bundle.classes.find((item) => item.id === classId) || null;
  const sourceStudents = selectedClass?.trainingClassId ? await listVTrainingStudentsForElearning(selectedClass.trainingClassId) : [];
  const sourceEmails = new Set(sourceStudents.map((student) => student.email).filter(Boolean));
  const enrollments = bundle.enrollments.filter((enrollment) => enrollment.classId === classId);
  let resultMap = new Map<string, any>();
  if (enrollments.length) {
    try {
      const client = requireSupabase();
      const { data, error } = await client
        .from('vcontent_eln_learning_results')
        .select('*')
        .in('enrollment_id', enrollments.map((enrollment) => enrollment.id));
      if (error && !isMissingSchemaError(error)) throw error;
      resultMap = new Map((data || []).map((row: any) => [String(row.enrollment_id || ''), row]));
    } catch (error) {
      if (!isMissingSchemaError(error) && supabase) throw error;
    }
  }
  return enrollments.map((enrollment) => {
    const student = bundle.students.find((item) => item.id === enrollment.studentId) || mapStudentRow({ id: enrollment.studentId, full_name: 'Không rõ', email: '' });
    const resultRow = resultMap.get(enrollment.id);
    const sourceStatus: ElearningClassReportRow['sourceStatus'] = !selectedClass?.trainingClassId
      ? 'vlearning_only'
      : sourceEmails.has(student.email.toLowerCase())
        ? 'source_active'
        : enrollment.metadata.sourceModule === 'vtraining'
          ? 'source_removed'
          : 'vlearning_only';
    return {
      enrollment,
      student,
      result: resultRow ? mapLearningResultRow(resultRow, enrollment) : createEmptyLearningResult(enrollment),
      sourceStatus,
    };
  });
}

export async function getElearningOptimizedReport(input: ElearningOptimizedReportInput): Promise<ElearningOptimizedReport> {
  const previewLimit = Math.max(1, Math.min(10000, Number(input.previewLimit || 100)));
  const bundle = await listElearningDeploymentBundle();
  let scopedClassIds: string[] = [];
  let scopedStudentIds: string[] = [];
  const scopeId = String(input.scopeId || '');

  if (input.scopeType === 'deployment') {
    scopedClassIds = scopeId ? [scopeId] : [];
  }
  if (input.scopeType === 'class') {
    const targetRunIds = bundle.runTargets
      .filter((target) => target.status === 'active' && target.targetType === 'class' && target.targetId === scopeId)
      .map((target) => target.runClassId);
    scopedClassIds = Array.from(new Set([scopeId, ...targetRunIds].filter(Boolean)));
  }
  if (input.scopeType === 'group') {
    const group = bundle.learnerGroups.find((item) => item.id === scopeId) || null;
    scopedStudentIds = group?.studentIds.length
      ? group.studentIds
      : bundle.students.filter((student) => group?.emails.includes(student.email.toLowerCase())).map((student) => student.id);
  }

  const scopedEnrollments = bundle.enrollments.filter((enrollment) => {
    if (input.scopeType === 'group') {
      return scopedStudentIds.includes(enrollment.studentId)
        || String(enrollment.metadata?.learnerGroupId || '') === scopeId
        || (String(enrollment.metadata?.targetType || '') === 'group' && String(enrollment.metadata?.targetId || '') === scopeId);
    }
    if (input.scopeType === 'class') {
      return scopedClassIds.includes(enrollment.classId)
        || String(enrollment.metadata?.sourceClassId || '') === scopeId
        || (String(enrollment.metadata?.targetType || '') === 'class' && String(enrollment.metadata?.targetId || '') === scopeId);
    }
    return scopedClassIds.includes(enrollment.classId);
  });
  const sourceClassIds = Array.from(new Set(scopedEnrollments.map((enrollment) => enrollment.classId)));
  const reports = await Promise.all(sourceClassIds.map((classId) => getElearningClassReport(classId)));
  const rows = reports.flat().filter((row) => {
    if (input.scopeType === 'group') {
      return scopedStudentIds.includes(row.student.id)
        || String(row.enrollment.metadata?.learnerGroupId || '') === scopeId
        || (String(row.enrollment.metadata?.targetType || '') === 'group' && String(row.enrollment.metadata?.targetId || '') === scopeId);
    }
    if (input.scopeType === 'class') {
      return scopedClassIds.includes(row.enrollment.classId)
        || String(row.enrollment.metadata?.sourceClassId || '') === scopeId
        || (String(row.enrollment.metadata?.targetType || '') === 'class' && String(row.enrollment.metadata?.targetId || '') === scopeId);
    }
    return scopedClassIds.includes(row.enrollment.classId);
  });
  const sortedRows = sortElearningReportRows(rows);
  return {
    rows: sortedRows.slice(0, previewLimit),
    totalRows: rows.length,
    previewLimit,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
  };
}

export function buildElearningClassExportCsv(rows: ElearningClassReportRow[]) {
  const header = ['Họ tên', 'Email', 'Mã nhân viên', 'Phòng ban', 'Chức danh', 'Trạng thái học', 'Tiến độ', 'Hoàn thành lúc'];
  const body = rows.map(({ student, result }) => [
    student.fullName,
    student.email,
    student.employeeCode,
    student.department,
    student.position,
    result.finalStatus,
    `${result.progressPercent}%`,
    result.completedAt || '',
  ]);
  return [header, ...body]
    .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export async function createElearningCourse(input: ElearningCourseInput) {
  const id = sanitizeElearningId(input.id || input.title) || `course-${Date.now()}`;
  const course: ElearningCourse = {
    id,
    title: input.title.trim() || id,
    description: input.description?.trim() || '',
    thumbnailUrl: input.thumbnailUrl?.trim() || '',
    status: input.status || 'draft',
    completionThreshold: Math.max(1, Math.min(100, Number(input.completionThreshold || 90))),
    finalQuizFormId: input.finalQuizFormId?.trim() || '',
    createdAt: new Date().toISOString(),
    lessonCount: 0,
  };

  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_eln_courses')
      .upsert({
        id: course.id,
        title: course.title,
        description: course.description,
        thumbnail_url: course.thumbnailUrl,
        status: course.status,
        completion_threshold: course.completionThreshold,
        final_quiz_form_id: course.finalQuizFormId || null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return mapCourseRow(data, 0);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    setLocal(COURSE_STORAGE_KEY, [course, ...getLocalCourses().filter((item) => item.id !== course.id && item.id !== SAMPLE_COURSE_ID)]);
    return course;
  }
}

export async function createElearningLesson(input: ElearningLessonInput) {
  const id = sanitizeElearningId(input.id || input.title) || `lesson-${Date.now()}`;
  const lessonType: ElearningLessonType = input.lessonType === 'scorm' ? 'scorm' : input.lessonType === 'native_sequence' ? 'native_sequence' : 'vimeo_parts';
  const lesson: ElearningLesson = {
    id,
    title: input.title.trim() || id,
    description: input.description?.trim() || '',
    lessonType,
    scormPackageId: lessonType === 'scorm' ? input.scormPackageId?.trim() || '' : '',
    completionRule: input.completionRule || 'completed',
    passingScore: Math.max(0, Math.min(100, Number(input.passingScore ?? 70))),
    status: input.status || 'published',
    createdAt: new Date().toISOString(),
    partCount: 0,
  };

  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_eln_lessons')
      .upsert({
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        lesson_type: lesson.lessonType,
        scorm_package_id: lesson.scormPackageId || null,
        completion_rule: lesson.completionRule,
        passing_score: lesson.passingScore,
        status: lesson.status,
      })
      .select('*')
      .single();
    if (error) throw error;
    return mapLessonRow(data, 0);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    setLocal(LESSON_STORAGE_KEY, [lesson, ...getLocalLessons().filter((item) => item.id !== lesson.id && item.id !== SAMPLE_LESSON_ID)]);
    return lesson;
  }
}

export async function updateElearningLesson(lessonId: string, input: ElearningLessonUpdateInput) {
  const normalizedLessonId = lessonId.trim();
  if (!normalizedLessonId) throw new Error('Cần chọn bài giảng để sửa.');
  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.description !== undefined) updates.description = input.description.trim();
  if (input.completionRule !== undefined) updates.completion_rule = input.completionRule;
  if (input.passingScore !== undefined) updates.passing_score = Math.max(0, Math.min(100, Number(input.passingScore || 0)));
  if (input.status !== undefined) updates.status = input.status;

  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_eln_lessons')
      .update(updates)
      .eq('id', normalizedLessonId)
      .select('*')
      .single();
    if (error) throw error;
    return mapLessonRow(data, 0);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const nextLessons = getLocalLessons().map((lesson) => (lesson.id === normalizedLessonId ? {
      ...lesson,
      title: input.title !== undefined ? input.title.trim() || lesson.title : lesson.title,
      description: input.description !== undefined ? input.description.trim() : lesson.description,
      completionRule: input.completionRule ?? lesson.completionRule,
      passingScore: input.passingScore !== undefined ? Math.max(0, Math.min(100, Number(input.passingScore || 0))) : lesson.passingScore,
      status: input.status ?? lesson.status,
    } : lesson)).filter((lesson) => lesson.id !== SAMPLE_LESSON_ID);
    setLocal(LESSON_STORAGE_KEY, nextLessons);
    const updated = nextLessons.find((lesson) => lesson.id === normalizedLessonId);
    if (!updated) throw new Error('Không tìm thấy bài giảng cần sửa.');
    return updated;
  }
}

export async function createElearningLessonBlock(input: ElearningLessonBlockInput) {
  const isVideoBlock = input.blockType === 'video';
  const videoId = isVideoBlock ? parseVimeoVideoId(input.videoUrl || '') : '';
  if (isVideoBlock && !videoId) throw new Error('Link Vimeo không hợp lệ.');
  const id = sanitizeElearningId(input.id || `${input.lessonId}-${input.title}`) || `block-${Date.now()}`;
  const block: ElearningLessonBlock = {
    id,
    lessonId: input.lessonId,
    blockType: input.blockType,
    title: input.title.trim() || id,
    content: input.content?.trim() || '',
    videoUrl: isVideoBlock ? (input.videoUrl || '').trim() : '',
    videoId,
    questionType: isVideoBlock ? '' : input.blockType,
    options: (input.options || []).map((option) => option.trim()).filter(Boolean),
    correctAnswer: input.correctAnswer ?? null,
    points: Math.max(0, Number(input.points || 0)),
    durationSeconds: Math.max(0, Number(input.durationSeconds || 0)),
    isRequired: input.isRequired !== false,
    sortOrder: Number(input.sortOrder || 0),
    status: input.status || 'published',
    createdAt: new Date().toISOString(),
  };

  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_eln_lesson_blocks')
      .upsert({
        id: block.id,
        lesson_id: block.lessonId,
        block_type: block.blockType,
        title: block.title,
        content: block.content,
        video_url: block.videoUrl || null,
        video_id: block.videoId || null,
        question_type: block.questionType || null,
        options_json: block.options,
        correct_answer_json: block.correctAnswer,
        points: block.points,
        duration_seconds: block.durationSeconds,
        is_required: block.isRequired,
        sort_order: block.sortOrder,
        status: block.status,
      })
      .select('*')
      .single();
    if (error) throw error;
    return mapLessonBlockRow(data);
  } catch (error) {
    if (!isLocalFallbackSafeError(error) && supabase) throw new Error(formatElearningError(error, 'Không tạo được block bài học native.'));
    setLocal(LESSON_BLOCK_STORAGE_KEY, [block, ...getLocalLessonBlocks().filter((item) => item.id !== block.id)]);
    return block;
  }
}

export async function updateElearningLessonBlock(blockId: string, input: ElearningLessonBlockInput) {
  const normalizedBlockId = blockId.trim();
  if (!normalizedBlockId) throw new Error('Can chon block native de cap nhat.');
  const isVideoBlock = input.blockType === 'video';
  const videoId = isVideoBlock ? parseVimeoVideoId(input.videoUrl || '') : '';
  if (isVideoBlock && !videoId) throw new Error('Link Vimeo khong hop le.');
  const block: ElearningLessonBlock = {
    id: normalizedBlockId,
    lessonId: input.lessonId,
    blockType: input.blockType,
    title: input.title.trim() || normalizedBlockId,
    content: input.content?.trim() || '',
    videoUrl: isVideoBlock ? (input.videoUrl || '').trim() : '',
    videoId,
    questionType: isVideoBlock ? '' : input.blockType,
    options: (input.options || []).map((option) => option.trim()).filter(Boolean),
    correctAnswer: input.correctAnswer ?? null,
    points: Math.max(0, Number(input.points || 0)),
    durationSeconds: Math.max(0, Number(input.durationSeconds || 0)),
    isRequired: input.isRequired !== false,
    sortOrder: Number(input.sortOrder || 0),
    status: input.status || 'published',
    createdAt: new Date().toISOString(),
  };

  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_eln_lesson_blocks')
      .update({
        lesson_id: block.lessonId,
        block_type: block.blockType,
        title: block.title,
        content: block.content,
        video_url: block.videoUrl || null,
        video_id: block.videoId || null,
        question_type: block.questionType || null,
        options_json: block.options,
        correct_answer_json: block.correctAnswer,
        points: block.points,
        duration_seconds: block.durationSeconds,
        is_required: block.isRequired,
        sort_order: block.sortOrder,
        status: block.status,
      })
      .eq('id', normalizedBlockId)
      .select('*')
      .single();
    if (error) throw error;
    return mapLessonBlockRow(data);
  } catch (error) {
    if (!isLocalFallbackSafeError(error) && supabase) throw new Error(formatElearningError(error, 'Khong cap nhat duoc block bai hoc native.'));
    const current = getLocalLessonBlocks().find((item) => item.id === normalizedBlockId);
    const nextBlock = { ...block, createdAt: current?.createdAt || block.createdAt };
    setLocal(LESSON_BLOCK_STORAGE_KEY, [nextBlock, ...getLocalLessonBlocks().filter((item) => item.id !== normalizedBlockId)]);
    return nextBlock;
  }
}

export async function deleteElearningLessonBlock(blockId: string) {
  const normalizedBlockId = blockId.trim();
  if (!normalizedBlockId) throw new Error('Can chon block native de xoa.');

  try {
    const client = requireSupabase();
    const { error } = await client.from('vcontent_eln_lesson_blocks').delete().eq('id', normalizedBlockId);
    if (error) throw error;
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw new Error(formatElearningError(error, 'Khong xoa duoc block bai hoc native.'));
    setLocal(LESSON_BLOCK_STORAGE_KEY, getLocalLessonBlocks().filter((block) => block.id !== normalizedBlockId));
    setLocal(BLOCK_ATTEMPT_STORAGE_KEY, getLocal<ElearningBlockAttempt[]>(BLOCK_ATTEMPT_STORAGE_KEY, []).filter((attempt) => attempt.blockId !== normalizedBlockId));
  }
}

export async function createElearningLessonPart(input: ElearningLessonPartInput) {
  const videoId = parseVimeoVideoId(input.videoUrl);
  if (!videoId) throw new Error('Link Vimeo khong hop le.');
  const id = sanitizeElearningId(input.id || `${input.lessonId}-${input.title}`) || `part-${Date.now()}`;
  const part: ElearningLessonPart = {
    id,
    lessonId: input.lessonId,
    title: input.title.trim() || id,
    content: input.content?.trim() || '',
    videoUrl: input.videoUrl.trim(),
    videoId,
    durationSeconds: Math.max(0, Number(input.durationSeconds || 0)),
    isPreview: input.isPreview === true,
    isRequired: input.isRequired !== false,
    sortOrder: Number(input.sortOrder || 0),
    status: input.status || 'published',
    createdAt: new Date().toISOString(),
  };

  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_eln_lesson_parts')
      .upsert({
        id: part.id,
        lesson_id: part.lessonId,
        title: part.title,
        content: part.content,
        video_url: part.videoUrl,
        video_id: part.videoId,
        duration_seconds: part.durationSeconds,
        is_preview: part.isPreview,
        is_required: part.isRequired,
        sort_order: part.sortOrder,
        status: part.status,
      })
      .select('*')
      .single();
    if (error) throw error;
    return mapPartRow(data);
  } catch (error) {
    if (!isLocalFallbackSafeError(error) && supabase) throw new Error(formatElearningError(error, 'Không tạo được phần bài học.'));
    setLocal(PART_STORAGE_KEY, [part, ...getLocalParts().filter((item) => item.id !== part.id && item.lessonId !== SAMPLE_LESSON_ID)]);
    return part;
  }
}

export async function saveElearningBlockAttempt(payload: {
  userId: string;
  profileId?: string;
  enrollmentId?: string;
  courseId: string;
  lessonId: string;
  blockId: string;
  answer: unknown;
  score?: number | null;
  isCompleted?: boolean;
  syncLearningResult?: boolean;
}) {
  const now = new Date().toISOString();
  const attempt: ElearningBlockAttempt = {
    id: `block-attempt-${payload.userId}-${payload.courseId}-${payload.blockId}`,
    userId: payload.userId,
    profileId: payload.profileId || '',
    enrollmentId: payload.enrollmentId || '',
    courseId: payload.courseId,
    lessonId: payload.lessonId,
    blockId: payload.blockId,
    answer: payload.answer,
    score: payload.score ?? null,
    isCompleted: payload.isCompleted !== false,
    completedAt: payload.isCompleted === false ? null : now,
    updatedAt: now,
  };

  if (shouldUseVLearningProgressSync()) {
    const [result] = await syncVLearningProgressEvents([
      {
        type: 'block_attempt',
        idempotencyKey: `block:${createClientId()}`,
        occurredAt: now,
        userId: payload.userId,
        profileId: payload.profileId,
        enrollmentId: payload.enrollmentId,
        courseId: payload.courseId,
        lessonId: payload.lessonId,
        blockId: payload.blockId,
        answer: payload.answer,
        score: payload.score ?? null,
        isCompleted: payload.isCompleted,
      },
    ]);
    if ((result?.status === 'saved' || result?.status === 'duplicate') && result.row) {
      return mapBlockAttemptRow(result.row);
    }
    throw new Error(result?.error || 'Tiến độ đang chờ đồng bộ lại với máy chủ.');
  }

  if (supabase) {
    throw new Error('Tiến độ học viên chỉ được ghi qua cổng xác thực của máy chủ.');
  }
  const rows = getLocal<ElearningBlockAttempt[]>(BLOCK_ATTEMPT_STORAGE_KEY, []);
  setLocal(
    BLOCK_ATTEMPT_STORAGE_KEY,
    [attempt, ...rows.filter((item) => !(item.userId === attempt.userId && item.courseId === attempt.courseId && item.blockId === attempt.blockId))],
  );
  return attempt;
}

export async function addLessonToCourse(courseId: string, lessonId: string, sortOrder = 0) {
  try {
    const client = requireSupabase();
    const { error } = await client.from('vcontent_eln_course_lessons').upsert(
      {
        course_id: courseId,
        lesson_id: lessonId,
        sort_order: sortOrder,
      },
      { onConflict: 'course_id,lesson_id' },
    );
    if (error) throw error;
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const rows = getLocalCourseLessons().filter((row) => !(row.courseId === courseId && row.lessonId === lessonId) && row.courseId !== SAMPLE_COURSE_ID);
    setLocal(COURSE_LESSON_STORAGE_KEY, [{ courseId, lessonId, sortOrder }, ...rows]);
  }
}

export async function removeLessonFromCourse(courseId: string, lessonId: string) {
  const normalizedCourseId = courseId.trim();
  const normalizedLessonId = lessonId.trim();
  if (!normalizedCourseId || !normalizedLessonId) throw new Error('Cần chọn khóa học và bài giảng để gỡ.');
  try {
    const client = requireSupabase();
    const { error } = await client
      .from('vcontent_eln_course_lessons')
      .delete()
      .eq('course_id', normalizedCourseId)
      .eq('lesson_id', normalizedLessonId);
    if (error) throw error;
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    setLocal(
      COURSE_LESSON_STORAGE_KEY,
      getLocalCourseLessons().filter((row) => !(row.courseId === normalizedCourseId && row.lessonId === normalizedLessonId)),
    );
  }
}

export async function cloneElearningLesson(sourceLessonId: string, overrides: { title?: string; description?: string } = {}) {
  const sourceLesson = (await listElearningLessons()).find((lesson) => lesson.id === sourceLessonId);
  if (!sourceLesson) throw new Error('Không tìm thấy bài giảng cần sao chép.');
  const copyTitle = overrides.title?.trim() || `${sourceLesson.title} - Bản sao`;
  const copyId = sanitizeElearningId(`${copyTitle}-${Date.now()}`);
  const copy = await createElearningLesson({
    id: copyId,
    title: copyTitle,
    description: overrides.description ?? sourceLesson.description,
    lessonType: sourceLesson.lessonType,
    scormPackageId: sourceLesson.scormPackageId,
    completionRule: sourceLesson.completionRule,
    passingScore: sourceLesson.passingScore,
    status: 'draft',
  });

  const [parts, blocks] = await Promise.all([
    listElearningLessonParts(sourceLesson.id),
    listElearningLessonBlocks(sourceLesson.id),
  ]);

  await Promise.all(parts.map((part, index) => createElearningLessonPart({
    id: sanitizeElearningId(`${copy.id}-${part.title}-${index + 1}`),
    lessonId: copy.id,
    title: part.title,
    content: part.content,
    videoUrl: part.videoUrl || part.videoId,
    durationSeconds: part.durationSeconds,
    isPreview: part.isPreview,
    isRequired: part.isRequired,
    sortOrder: part.sortOrder || index + 1,
    status: 'draft',
  })));

  await Promise.all(blocks.map((block, index) => createElearningLessonBlock({
    id: sanitizeElearningId(`${copy.id}-${block.title}-${index + 1}`),
    lessonId: copy.id,
    blockType: block.blockType,
    title: block.title,
    content: block.content,
    videoUrl: block.videoUrl || block.videoId,
    options: block.options,
    correctAnswer: block.correctAnswer,
    points: block.points,
    durationSeconds: block.durationSeconds,
    isRequired: block.isRequired,
    sortOrder: block.sortOrder || index + 1,
    status: 'draft',
  })));

  return copy;
}

export async function deleteElearningLesson(lessonId: string) {
  const normalizedLessonId = lessonId.trim();
  if (!normalizedLessonId) throw new Error('Cần chọn bài giảng để xóa.');

  try {
    const client = requireSupabase();
    const { data: courseLinks, error: linkError } = await client
      .from('vcontent_eln_course_lessons')
      .select('course_id')
      .eq('lesson_id', lessonId);
    if (linkError) throw linkError;
    if ((courseLinks || []).length) {
      throw new Error('Bài giảng đang được gắn vào khóa học. Hãy gỡ bài khỏi khóa trước khi xóa.');
    }

    const { error } = await client.from('vcontent_eln_lessons').delete().eq('id', normalizedLessonId);
    if (error) throw error;
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const linkedRows = getLocalCourseLessons().filter((row) => row.lessonId === normalizedLessonId && row.courseId !== SAMPLE_COURSE_ID);
    if (linkedRows.length) {
      throw new Error('Bài giảng đang được gắn vào khóa học. Hãy gỡ bài khỏi khóa trước khi xóa.');
    }
    setLocal(LESSON_STORAGE_KEY, getLocalLessons().filter((lesson) => lesson.id !== normalizedLessonId && lesson.id !== SAMPLE_LESSON_ID));
    setLocal(PART_STORAGE_KEY, getLocalParts().filter((part) => part.lessonId !== normalizedLessonId && part.lessonId !== SAMPLE_LESSON_ID));
    setLocal(LESSON_BLOCK_STORAGE_KEY, getLocalLessonBlocks().filter((block) => block.lessonId !== normalizedLessonId));
    setLocal(BLOCK_ATTEMPT_STORAGE_KEY, getLocal<ElearningBlockAttempt[]>(BLOCK_ATTEMPT_STORAGE_KEY, []).filter((attempt) => attempt.lessonId !== normalizedLessonId));
    setLocal(PROGRESS_STORAGE_KEY, getLocal<ElearningProgress[]>(PROGRESS_STORAGE_KEY, []).filter((progress) => progress.lessonId !== normalizedLessonId));
    setLocal(SCORM_ATTEMPT_STORAGE_KEY, getLocal<ElearningScormAttempt[]>(SCORM_ATTEMPT_STORAGE_KEY, []).filter((attempt) => attempt.lessonId !== normalizedLessonId));
  }
}

export async function cloneElearningCourse(sourceCourseId: string, overrides: { title?: string; description?: string } = {}) {
  const sourceCourse = (await listElearningCourses()).find((course) => course.id === sourceCourseId);
  if (!sourceCourse) throw new Error('Không tìm thấy khóa học cần sao chép.');
  const copyTitle = overrides.title?.trim() || `${sourceCourse.title} - Bản sao`;
  const copy = await createElearningCourse({
    id: sanitizeElearningId(`${copyTitle}-${Date.now()}`),
    title: copyTitle,
    description: overrides.description ?? sourceCourse.description,
    thumbnailUrl: sourceCourse.thumbnailUrl,
    finalQuizFormId: sourceCourse.finalQuizFormId,
    completionThreshold: sourceCourse.completionThreshold,
    status: 'draft',
  });
  const bundle = await getElearningCourseBundle(sourceCourse.id, 'copy-admin');
  const lessons = bundle?.lessons || [];
  await Promise.all(lessons.map((lesson, index) => addLessonToCourse(copy.id, lesson.id, lesson.sortOrder || index + 1)));
  return copy;
}

export async function updateElearningCourseStatus(courseId: string, status: ElearningCourseStatus) {
  try {
    const client = requireSupabase();
    const { error } = await client.from('vcontent_eln_courses').update({ status }).eq('id', courseId);
    if (error) throw error;
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    setLocal(
      COURSE_STORAGE_KEY,
      getLocalCourses().map((course) => (course.id === courseId ? { ...course, status } : course)).filter((course) => course.id !== SAMPLE_COURSE_ID),
    );
  }
}

export async function updateElearningCourse(courseId: string, input: ElearningCourseUpdateInput) {
  const normalizedCourseId = courseId.trim();
  if (!normalizedCourseId) throw new Error('Cần chọn khóa học để sửa.');
  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.description !== undefined) updates.description = input.description.trim();
  if (input.thumbnailUrl !== undefined) updates.thumbnail_url = input.thumbnailUrl.trim();
  if (input.status !== undefined) updates.status = input.status;
  if (input.completionThreshold !== undefined) updates.completion_threshold = Math.max(1, Math.min(100, Number(input.completionThreshold || 90)));
  if (input.finalQuizFormId !== undefined) updates.final_quiz_form_id = input.finalQuizFormId.trim() || null;

  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_eln_courses')
      .update(updates)
      .eq('id', normalizedCourseId)
      .select('*')
      .single();
    if (error) throw error;
    return mapCourseRow(data, 0);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const nextCourses = getLocalCourses().map((course) => (course.id === normalizedCourseId ? {
      ...course,
      title: input.title !== undefined ? input.title.trim() || course.title : course.title,
      description: input.description !== undefined ? input.description.trim() : course.description,
      thumbnailUrl: input.thumbnailUrl !== undefined ? input.thumbnailUrl.trim() : course.thumbnailUrl,
      status: input.status ?? course.status,
      completionThreshold: input.completionThreshold !== undefined ? Math.max(1, Math.min(100, Number(input.completionThreshold || 90))) : course.completionThreshold,
      finalQuizFormId: input.finalQuizFormId !== undefined ? input.finalQuizFormId.trim() : course.finalQuizFormId,
    } : course)).filter((course) => course.id !== SAMPLE_COURSE_ID);
    setLocal(COURSE_STORAGE_KEY, nextCourses);
    const updated = nextCourses.find((course) => course.id === normalizedCourseId);
    if (!updated) throw new Error('Không tìm thấy khóa học cần sửa.');
    return updated;
  }
}

export async function deleteElearningCourse(courseId: string) {
  const normalizedCourseId = courseId.trim();
  if (!normalizedCourseId) throw new Error('Cần chọn khóa học để xóa.');

  try {
    const client = requireSupabase();
    const [{ data: classes, error: classError }, { data: enrollments, error: enrollmentError }] = await Promise.all([
      client.from('vcontent_eln_classes').select('id').eq('course_id', normalizedCourseId).limit(1),
      client.from('vcontent_eln_enrollments').select('id').eq('course_id', normalizedCourseId).limit(1),
    ]);
    if (classError) throw classError;
    if (enrollmentError) throw enrollmentError;
    if ((classes || []).length || (enrollments || []).length) {
      throw new Error('Khóa học đã có lớp/ghi danh liên quan. Hãy đóng hoặc lưu trữ khóa thay vì xóa.');
    }
    const { error: linkError } = await client.from('vcontent_eln_course_lessons').delete().eq('course_id', normalizedCourseId);
    if (linkError) throw linkError;
    const { error } = await client.from('vcontent_eln_courses').delete().eq('id', normalizedCourseId);
    if (error) throw error;
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const localClasses = getLocal<ElearningClass[]>(CLASS_STORAGE_KEY, []).filter((item) => item.courseId === normalizedCourseId);
    const localEnrollments = getLocal<ElearningEnrollment[]>(ENROLLMENT_STORAGE_KEY, []).filter((item) => item.courseId === normalizedCourseId);
    if (localClasses.length || localEnrollments.length) {
      throw new Error('Khóa học đã có lớp/ghi danh liên quan. Hãy đóng hoặc lưu trữ khóa thay vì xóa.');
    }
    setLocal(COURSE_LESSON_STORAGE_KEY, getLocalCourseLessons().filter((row) => row.courseId !== normalizedCourseId));
    setLocal(COURSE_STORAGE_KEY, getLocalCourses().filter((course) => course.id !== normalizedCourseId && course.id !== SAMPLE_COURSE_ID));
  }
}

export async function updateElearningCourseQuiz(courseId: string, finalQuizFormId: string) {
  try {
    const client = requireSupabase();
    const { error } = await client
      .from('vcontent_eln_courses')
      .update({ final_quiz_form_id: finalQuizFormId.trim() || null })
      .eq('id', courseId);
    if (error) throw error;
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    setLocal(
      COURSE_STORAGE_KEY,
      getLocalCourses()
        .map((course) => (course.id === courseId ? { ...course, finalQuizFormId: finalQuizFormId.trim() } : course))
        .filter((course) => course.id !== SAMPLE_COURSE_ID),
    );
  }
}

function applyLearnerFilter(query: any, userId?: string, profileId?: string) {
  if (userId && profileId) return query.or(`user_id.eq.${userId},profile_id.eq.${profileId}`);
  if (profileId) return query.eq('profile_id', profileId);
  if (userId) return query.eq('user_id', userId);
  return query;
}

function mapRpcCourseBundle(row: any): ElearningCourseBundle | null {
  if (!row?.course) return null;
  const links = Array.isArray(row.links) ? row.links : [];
  const lessonRows = Array.isArray(row.lessons) ? row.lessons : [];
  const parts = (Array.isArray(row.parts) ? row.parts : []).map(mapPartRow);
  const lessonBlocks = (Array.isArray(row.lessonBlocks) ? row.lessonBlocks : []).map(mapLessonBlockRow);
  const partCounts = new Map<string, number>();
  for (const part of parts) partCounts.set(part.lessonId, (partCounts.get(part.lessonId) || 0) + 1);
  for (const block of lessonBlocks) partCounts.set(block.lessonId, (partCounts.get(block.lessonId) || 0) + 1);
  const lessonMap = new Map<string, any>(lessonRows.map((lesson: any) => [String(lesson.id), lesson]));
  const sortOrders = new Map<string, number>(links.map((link: any) => [String(link.lesson_id), Number(link.sort_order || 0)]));
  const lessonIds = links.map((link: any) => String(link.lesson_id));
  const lessons = lessonIds
    .map((id: string) => lessonMap.get(id))
    .filter(Boolean)
    .map((lesson: any) => mapLessonRow(lesson, partCounts.get(String(lesson.id)) || 0, sortOrders.get(String(lesson.id))));

  return {
    course: mapCourseRow(row.course, lessons.length),
    enrollment: row.enrollment ? mapEnrollmentRow(row.enrollment) : null,
    learningResult: row.learningResult && row.enrollment ? mapLearningResultRow(row.learningResult, mapEnrollmentRow(row.enrollment)) : null,
    lessons,
    parts,
    lessonBlocks,
    blockAttempts: (Array.isArray(row.blockAttempts) ? row.blockAttempts : []).map(mapBlockAttemptRow),
    progress: (Array.isArray(row.progress) ? row.progress : []).map(mapProgressRow),
    scormPackages: (Array.isArray(row.scormPackages) ? row.scormPackages : []).map(mapScormPackageRow),
    scormAttempts: (Array.isArray(row.scormAttempts) ? row.scormAttempts : []).map(mapScormAttemptRow),
  };
}

async function getElearningStaticCourseContent(courseId: string) {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return null;
  let admission = vlearningAdmissionTickets[courseId];
  if (!admission || admission.expiresAt <= Date.now()) {
    const result = await requestVLearningAdmission({ courseId });
    if (result.status !== 'ready' || !result.ticket) return null;
    admission = vlearningAdmissionTickets[courseId];
  }
  if (!admission?.token) return null;
  const payload = await requestAppApi(`/api/vlearning-course-content?courseId=${encodeURIComponent(courseId)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-VLearning-Admission-Ticket': admission.token,
      'X-VLearning-Correlation-Id': getVLearningCorrelationId(courseId),
    },
    cache: 'no-store',
  });
  if (!payload?.ok || !payload.course) return null;
  return payload;
}

export async function gradeElearningNativeBlock(payload: {
  courseId: string;
  blockId: string;
  answer: unknown;
}): Promise<{ correct: boolean; attempt: ElearningBlockAttempt }> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('vlearning_grade_native_block', {
    p_course_id: payload.courseId,
    p_block_id: payload.blockId,
    p_answer: payload.answer ?? null,
  });
  if (error) throw error;
  if (!data?.attempt) throw new Error('Máy chủ không trả về kết quả chấm hợp lệ.');
  return {
    correct: data.correct === true,
    attempt: mapBlockAttemptRow(data.attempt),
  };
}

async function getElearningLearnerStateViaRpc(client: ReturnType<typeof requireSupabase>, courseId: string) {
  const { data, error } = await client.rpc('vlearning_get_learner_course_state', { p_course_id: courseId });
  if (error) {
    if (isMissingSchemaError(error) || String(error.message || '').includes('vlearning_get_learner_course_state')) return null;
    throw error;
  }
  return data || null;
}

async function getElearningCourseBundleViaCachedContent(client: ReturnType<typeof requireSupabase>, courseId: string) {
  const [content, state] = await Promise.all([
    getElearningStaticCourseContent(courseId),
    getElearningLearnerStateViaRpc(client, courseId),
  ]);
  if (!content || !state?.enrollment) return null;
  return mapRpcCourseBundle({
    ...content,
    enrollment: state.enrollment,
    learningResult: state.learningResult || state.result || null,
    progress: state.progress || [],
    blockAttempts: state.blockAttempts || [],
    scormAttempts: state.scormAttempts || [],
  });
}

async function attachElearningLearningResultSnapshot(client: ReturnType<typeof requireSupabase>, bundle: ElearningCourseBundle | null) {
  if (!bundle?.enrollment || bundle.learningResult) return bundle;
  const { data, error } = await client
    .from('vcontent_eln_learning_results')
    .select('*')
    .eq('enrollment_id', bundle.enrollment.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && !isMissingSchemaError(error)) throw error;
  if (!data) return bundle;
  return { ...bundle, learningResult: mapLearningResultRow(data, bundle.enrollment) };
}

export async function getElearningCourseBundle(courseId: string, userId?: string, profileId?: string): Promise<ElearningCourseBundle | null> {
  try {
    const client = requireSupabase();
    if (userId || profileId) {
      const cachedBundle = await getElearningCourseBundleViaCachedContent(client, courseId);
      if (!cachedBundle) {
        throw new Error(
          'Không tải được khóa học qua contract learner chính thức. Vui lòng thử lại; hệ thống không chuyển sang nguồn dữ liệu dự phòng.',
        );
      }
      return attachElearningLearningResultSnapshot(client, cachedBundle);
    }
    const progressQuery = client.from('vcontent_eln_lesson_progress').select('*').eq('course_id', courseId);
    const scormAttemptQuery = client.from('vcontent_eln_scorm_attempts').select('*').eq('course_id', courseId);
    const blockAttemptQuery = client.from('vcontent_eln_block_attempts').select('*').eq('course_id', courseId);
    const enrollmentQuery = client.from('vcontent_eln_enrollments').select('*').eq('course_id', courseId);
    const [courseResult, linksResult, progressResult, scormAttemptResult, blockAttemptResult, enrollmentResult] = await Promise.all([
      client.from('vcontent_eln_courses').select('*').eq('id', courseId).maybeSingle(),
      client.from('vcontent_eln_course_lessons').select('lesson_id,sort_order').eq('course_id', courseId).order('sort_order', { ascending: true }),
      userId || profileId
        ? applyLearnerFilter(progressQuery, userId, profileId)
        : Promise.resolve({ data: [], error: null }),
      userId || profileId
        ? applyLearnerFilter(scormAttemptQuery, userId, profileId)
        : Promise.resolve({ data: [], error: null }),
      userId || profileId
        ? applyLearnerFilter(blockAttemptQuery, userId, profileId)
        : Promise.resolve({ data: [], error: null }),
      userId || profileId
        ? applyLearnerFilter(enrollmentQuery, userId, profileId)
            .order('last_access_at', { ascending: false, nullsFirst: false })
            .order('assigned_at', { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (courseResult.error) throw courseResult.error;
    if (linksResult.error) throw linksResult.error;
    if (progressResult.error) throw progressResult.error;
    if (scormAttemptResult.error) throw scormAttemptResult.error;
    if (blockAttemptResult.error && !isMissingSchemaError(blockAttemptResult.error)) throw blockAttemptResult.error;
    if (enrollmentResult.error && !isMissingSchemaError(enrollmentResult.error)) throw enrollmentResult.error;
    if (!courseResult.data) return null;

    const links = linksResult.data || [];
    const lessonIds = links.map((row: any) => String(row.lesson_id));
    const [lessonsResult, partsResult, blocksResult] = lessonIds.length
      ? await Promise.all([
          client.from('vcontent_eln_lessons').select('*').in('id', lessonIds),
          client.from('vcontent_eln_lesson_parts').select('*').in('lesson_id', lessonIds).order('sort_order', { ascending: true }),
          client.from('vcontent_eln_lesson_blocks').select('*').in('lesson_id', lessonIds).order('sort_order', { ascending: true }),
        ])
      : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
    if (lessonsResult.error) throw lessonsResult.error;
    if (partsResult.error) throw partsResult.error;
    if (blocksResult.error && !isMissingSchemaError(blocksResult.error)) throw blocksResult.error;

    const parts = (partsResult.data || []).map(mapPartRow);
    const lessonBlocks = blocksResult.error ? [] : (blocksResult.data || []).map(mapLessonBlockRow);
    const partCounts = new Map<string, number>();
    for (const part of parts) partCounts.set(part.lessonId, (partCounts.get(part.lessonId) || 0) + 1);
    for (const block of lessonBlocks) partCounts.set(block.lessonId, (partCounts.get(block.lessonId) || 0) + 1);
    const lessonRows = new Map((lessonsResult.data || []).map((row: any) => [String(row.id), row]));
    const sortOrders = new Map(links.map((row: any) => [String(row.lesson_id), Number(row.sort_order || 0)]));
    const lessons = lessonIds
      .map((id) => lessonRows.get(id))
      .filter(Boolean)
      .map((row: any) => mapLessonRow(row, partCounts.get(String(row.id)) || 0, sortOrders.get(String(row.id))));

    const scormPackageIds = lessons.map((lesson) => lesson.scormPackageId).filter(Boolean);
    const packagesResult = scormPackageIds.length
      ? await client.from('vcontent_eln_scorm_packages').select('*').in('id', scormPackageIds)
      : { data: [], error: null };
    if (packagesResult.error) throw packagesResult.error;

    return attachElearningLearningResultSnapshot(client, {
      course: mapCourseRow(courseResult.data, lessons.length),
      enrollment: selectPreferredLearnerCourseEnrollments((enrollmentResult.data || []).map(mapEnrollmentRow))[0] || null,
      learningResult: null,
      lessons,
      parts,
      lessonBlocks,
      blockAttempts: blockAttemptResult.error ? [] : (blockAttemptResult.data || []).map(mapBlockAttemptRow),
      progress: (progressResult.data || []).map(mapProgressRow),
      scormPackages: (packagesResult.data || []).map(mapScormPackageRow),
      scormAttempts: (scormAttemptResult.data || []).map(mapScormAttemptRow),
    });
  } catch (error) {
    if (userId || profileId) throw error;
    if (!isMissingSchemaError(error) && supabase) throw error;
    const course = getLocalCourses().find((item) => item.id === courseId);
    if (!course) return null;
    const links = getLocalCourseLessons().filter((row) => row.courseId === courseId).sort((a, b) => a.sortOrder - b.sortOrder);
    const allLessons = getLocalLessons();
    const lessons = links
      .map((link) => allLessons.find((lesson) => lesson.id === link.lessonId))
      .filter(Boolean)
      .map((lesson, index) => ({ ...(lesson as ElearningLesson), sortOrder: links[index]?.sortOrder || index + 1 }));
    const lessonIds = new Set(lessons.map((lesson) => lesson.id));
    const parts = getLocalParts().filter((part) => lessonIds.has(part.lessonId)).sort((a, b) => a.sortOrder - b.sortOrder);
    const lessonBlocks = getLocalLessonBlocks().filter((block) => lessonIds.has(block.lessonId)).sort((a, b) => a.sortOrder - b.sortOrder);
    const hasLearner = Boolean(userId || profileId);
    const progress = getLocal<ElearningProgress[]>(PROGRESS_STORAGE_KEY, []).filter((item) => item.courseId === courseId && (!hasLearner || item.userId === userId || item.profileId === profileId));
    const blockAttempts = getLocal<ElearningBlockAttempt[]>(BLOCK_ATTEMPT_STORAGE_KEY, []).filter((item) => item.courseId === courseId && (!hasLearner || item.userId === userId || item.profileId === profileId));
    const packageIds = new Set(lessons.map((lesson) => lesson.scormPackageId).filter(Boolean));
    const scormPackages = getLocal<ElearningScormPackage[]>(SCORM_PACKAGE_STORAGE_KEY, []).filter((item) => packageIds.has(item.id));
    const scormAttempts = getLocal<ElearningScormAttempt[]>(SCORM_ATTEMPT_STORAGE_KEY, []).filter((item) => item.courseId === courseId && (!hasLearner || item.userId === userId || item.profileId === profileId));
    return { course: { ...course, lessonCount: lessons.length }, enrollment: null, learningResult: null, lessons, parts, lessonBlocks, blockAttempts, progress, scormPackages, scormAttempts };
  }
}

export async function saveElearningProgress(payload: {
  userId: string;
  profileId?: string;
  enrollmentId?: string;
  courseId: string;
  lessonId: string;
  partId: string;
  progressPercent: number;
  lastPositionSeconds: number;
  isCompleted?: boolean;
}) {
  const progressPercent = Math.max(0, Math.min(100, Math.round(payload.progressPercent)));
  const now = new Date().toISOString();
  const completedAt = payload.isCompleted ? now : null;

  if (shouldUseVLearningProgressSync()) {
    const [result] = await syncVLearningProgressEvents([
      {
        type: 'lesson_progress',
        idempotencyKey: `progress:${createClientId()}`,
        occurredAt: now,
        userId: payload.userId,
        profileId: payload.profileId,
        enrollmentId: payload.enrollmentId,
        courseId: payload.courseId,
        lessonId: payload.lessonId,
        partId: payload.partId,
        progressPercent,
        lastPositionSeconds: payload.lastPositionSeconds,
        isCompleted: payload.isCompleted,
      },
    ]);
    if ((result?.status === 'saved' || result?.status === 'duplicate') && result.row) {
      return mapProgressRow(result.row);
    }
    throw new Error(result?.error || 'Tiến độ đang chờ đồng bộ lại với máy chủ.');
  }

  if (supabase) {
    throw new Error('Tiến độ học viên chỉ được ghi qua cổng xác thực của máy chủ.');
  }

  const rows = getLocal<ElearningProgress[]>(PROGRESS_STORAGE_KEY, []);
  const current = rows.find(
    (item) =>
      item.courseId === payload.courseId &&
      item.partId === payload.partId &&
      (item.userId === payload.userId || (!!payload.profileId && item.profileId === payload.profileId)),
  );
  const next: ElearningProgress = {
    id: current?.id || createClientId(),
    userId: payload.userId,
    profileId: payload.profileId || '',
    enrollmentId: payload.enrollmentId || '',
    courseId: payload.courseId,
    lessonId: payload.lessonId,
    partId: payload.partId,
    progressPercent: Math.max(progressPercent, current?.progressPercent || 0),
    lastPositionSeconds: Math.max(0, Math.round(payload.lastPositionSeconds)),
    isCompleted: payload.isCompleted === true || progressPercent >= 100 || current?.isCompleted === true,
    completedAt: current?.completedAt || completedAt,
    updatedAt: now,
  };
  setLocal(
    PROGRESS_STORAGE_KEY,
    [next, ...rows.filter((item) => !(item.courseId === payload.courseId && item.partId === payload.partId && (item.userId === payload.userId || (!!payload.profileId && item.profileId === payload.profileId))))],
  );
  return next;
}

function deriveScormAttempt(runtimeData: Record<string, string>) {
  const completionStatus = runtimeData['cmi.completion_status'] || runtimeData['cmi.core.lesson_status'] || 'unknown';
  const successStatus = runtimeData['cmi.success_status'] || (completionStatus === 'passed' ? 'passed' : completionStatus === 'failed' ? 'failed' : 'unknown');
  const scoreRawValue = runtimeData['cmi.score.raw'] || runtimeData['cmi.core.score.raw'] || '';
  const scoreScaledValue = runtimeData['cmi.score.scaled'] || '';
  const scoreRaw = scoreRawValue === '' ? null : Number(scoreRawValue);
  const scoreScaled = scoreScaledValue === '' ? null : Number(scoreScaledValue);
  const normalizedRaw = Number.isFinite(scoreRaw as number) ? scoreRaw : null;
  const normalizedScaled = Number.isFinite(scoreScaled as number) ? scoreScaled : null;
  return {
    completionStatus,
    successStatus,
    scoreRaw: normalizedRaw,
    scoreScaled: normalizedScaled,
    location: runtimeData['cmi.location'] || runtimeData['cmi.core.lesson_location'] || '',
    suspendData: runtimeData['cmi.suspend_data'] || '',
    sessionTime: runtimeData['cmi.session_time'] || runtimeData['cmi.core.session_time'] || '',
    totalTime: runtimeData['cmi.total_time'] || runtimeData['cmi.core.total_time'] || '',
    isCompleted: ['completed', 'passed'].includes(completionStatus),
    isPassed: successStatus === 'passed' || completionStatus === 'passed',
  };
}

async function saveElearningScormRuntimeViaRpc(
  client: ReturnType<typeof requireSupabase>,
  payload: {
    userId: string;
    profileId?: string;
    enrollmentId?: string;
    courseId: string;
    lessonId: string;
    scormPackageId: string;
    runtimeData: Record<string, string>;
    idempotencyKey: string;
    occurredAt: string;
  },
) {
  const { data, error } = await client.rpc('vlearning_save_scorm_runtime', {
    p_enrollment_id: payload.enrollmentId || null,
    p_course_id: payload.courseId,
    p_lesson_id: payload.lessonId,
    p_scorm_package_id: payload.scormPackageId,
    p_runtime_data: payload.runtimeData,
    p_profile_id: null,
    p_idempotency_key: payload.idempotencyKey,
    p_occurred_at: payload.occurredAt,
  });
  if (error) throw error;
  const attemptRow = data?.attempt || data;
  if (!attemptRow?.id) throw new Error('Máy chủ không trả về SCORM attempt hợp lệ.');
  return mapScormAttemptRow(attemptRow);
}

type BufferedVLearningScormRuntime = {
  userId: string;
  profileId?: string;
  enrollmentId?: string;
  courseId: string;
  lessonId: string;
  scormPackageId: string;
  runtimeData: Record<string, string>;
  idempotencyKey: string;
  occurredAt: string;
  queuedAt: number;
};

function getVLearningScormRuntimeEntityKey(payload: Pick<BufferedVLearningScormRuntime, 'userId' | 'courseId' | 'lessonId' | 'scormPackageId'>) {
  return `${payload.userId}:${payload.courseId}:${payload.lessonId}:${payload.scormPackageId}`;
}

function readBufferedVLearningScormRuntime() {
  const now = Date.now();
  return getLocal<BufferedVLearningScormRuntime[]>(VLEARNING_SCORM_SYNC_BUFFER_KEY, [])
    .filter((item) => Number.isFinite(item?.queuedAt) && now - item.queuedAt <= VLEARNING_SCORM_SYNC_BUFFER_TTL_MS);
}

function writeBufferedVLearningScormRuntime(events: BufferedVLearningScormRuntime[]) {
  const now = Date.now();
  const deduped = new Map<string, BufferedVLearningScormRuntime>();
  for (const event of events) {
    if (!Number.isFinite(event?.queuedAt) || now - event.queuedAt > VLEARNING_SCORM_SYNC_BUFFER_TTL_MS) continue;
    deduped.set(getVLearningScormRuntimeEntityKey(event), event);
  }
  const bounded = Array.from(deduped.values()).slice(-VLEARNING_SCORM_SYNC_MAX_BUFFERED_EVENTS);
  while (bounded.length > 1 && JSON.stringify(bounded).length > VLEARNING_SCORM_SYNC_MAX_BUFFER_BYTES) {
    bounded.shift();
  }
  setLocal(VLEARNING_SCORM_SYNC_BUFFER_KEY, bounded);
}

function removeBufferedVLearningScormRuntime(idempotencyKey: string) {
  writeBufferedVLearningScormRuntime(
    readBufferedVLearningScormRuntime().filter((item) => item.idempotencyKey !== idempotencyKey),
  );
}

function isRetryableVLearningWriteError(error: unknown) {
  const candidate = error as { code?: string; status?: number; statusCode?: number; message?: string };
  const code = String(candidate?.code || '').toUpperCase();
  const status = Number(candidate?.status || candidate?.statusCode || 0);
  if (status === 408 || status === 429 || status >= 500) return true;
  if (['40001', '40P01', '53300', '57P01', '57P03', 'PGRST000', 'PGRST001', 'PGRST002'].includes(code)) return true;
  return /fetch|network|timeout|connection|temporar/i.test(String(candidate?.message || ''));
}

export async function flushBufferedVLearningScormRuntime(): Promise<ElearningScormAttempt[]> {
  if (!supabase) return [];
  const client = requireSupabase();
  const saved: ElearningScormAttempt[] = [];
  for (const event of readBufferedVLearningScormRuntime()) {
    try {
      const attempt = await saveElearningScormRuntimeViaRpc(client, event);
      removeBufferedVLearningScormRuntime(event.idempotencyKey);
      saved.push(attempt);
    } catch (error) {
      if (!isRetryableVLearningWriteError(error)) removeBufferedVLearningScormRuntime(event.idempotencyKey);
    }
  }
  return saved;
}

export async function saveElearningScormRuntime(payload: {
  userId: string;
  profileId?: string;
  enrollmentId?: string;
  courseId: string;
  lessonId: string;
  scormPackageId: string;
  runtimeData: Record<string, string>;
  idempotencyKey?: string;
  occurredAt?: string;
}) {
  const now = new Date().toISOString();
  const derived = deriveScormAttempt(payload.runtimeData);
  const event: BufferedVLearningScormRuntime = {
    ...payload,
    idempotencyKey: payload.idempotencyKey || `scorm:${createClientId()}`,
    occurredAt: payload.occurredAt || now,
    queuedAt: Date.now(),
  };
  try {
    const client = requireSupabase();
    writeBufferedVLearningScormRuntime([...readBufferedVLearningScormRuntime(), event]);
    const attempt = await saveElearningScormRuntimeViaRpc(client, event);
    removeBufferedVLearningScormRuntime(event.idempotencyKey);
    return attempt;
  } catch (error) {
    if (supabase) {
      if (!isRetryableVLearningWriteError(error)) removeBufferedVLearningScormRuntime(event.idempotencyKey);
      throw error;
    }
    const rows = getLocal<ElearningScormAttempt[]>(SCORM_ATTEMPT_STORAGE_KEY, []);
    const current = rows.find(
      (item) =>
        item.courseId === payload.courseId &&
        item.lessonId === payload.lessonId &&
        item.scormPackageId === payload.scormPackageId &&
        (item.userId === payload.userId || (!!payload.profileId && item.profileId === payload.profileId)),
    );
    const next: ElearningScormAttempt = {
      id: current?.id || createClientId(),
      userId: payload.userId,
      profileId: payload.profileId || '',
      enrollmentId: payload.enrollmentId || '',
      courseId: payload.courseId,
      lessonId: payload.lessonId,
      scormPackageId: payload.scormPackageId,
      attemptNumber: 1,
      runtimeData: payload.runtimeData,
      completionStatus: derived.completionStatus,
      successStatus: derived.successStatus,
      scoreRaw: derived.scoreRaw,
      scoreScaled: derived.scoreScaled,
      location: derived.location,
      suspendData: derived.suspendData,
      sessionTime: derived.sessionTime,
      totalTime: derived.totalTime,
      isCompleted: derived.isCompleted,
      isPassed: derived.isPassed,
      initializedAt: current?.initializedAt || now,
      completedAt: current?.completedAt || (derived.isCompleted ? now : null),
      updatedAt: now,
    };
    setLocal(
      SCORM_ATTEMPT_STORAGE_KEY,
      [next, ...rows.filter((item) => !(item.courseId === payload.courseId && item.lessonId === payload.lessonId && item.scormPackageId === payload.scormPackageId && (item.userId === payload.userId || (!!payload.profileId && item.profileId === payload.profileId))))],
    );
    return next;
  }
}
