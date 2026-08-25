import { supabase } from '@/lib/supabaseClient';
import { buildQuizScoresByProfile } from '@/lib/trainingQuizScoreMatcher';
import { buildReflectionScoresByProfile } from '@/lib/trainingReflectionScoreMatcher';

export class SuniApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SuniApiError';
  }
}

export type SuniUser = {
  id: string;
  email?: string | null;
  fullName?: string | null;
  name?: string | null;
  title?: string | null;
  role?: string | null;
  status?: string | null;
};

export type SuniTrainingProgram = {
  id: string;
  code?: string | null;
  name?: string | null;
  description?: string | null;
  customerName?: string | null;
  executionYear?: number | null;
  plannedCourseCount?: number | null;
  ownerId?: string | null;
  ownerName?: string | null;
  ownerFullName?: string | null;
  coordinatorName?: string | null;
  managerName?: string | null;
  learnerGroup?: string | null;
  status?: string | null;
  owner?: SuniUser | null;
  courses?: unknown[];
  klasses?: unknown[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SuniTrainingCourse = {
  id: string;
  code?: string | null;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  objective?: string | null;
  customerName?: string | null;
  coordinatorName?: string | null;
  programId?: string | null;
  courseProgram?: { id: string; name?: string | null; code?: string | null } | null;
  format?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  durationDays?: number | null;
  expectedDuration?: string | null;
  locationType?: string | null;
  location?: string | null;
  onlineLearningUrl?: string | null;
  targetAudience?: string | null;
  plannedClassCount?: number | null;
  status?: string | null;
  metadata?: Record<string, unknown>;
  customerViewerProfileIds?: string[];
  klasses?: unknown[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SuniTrainingClass = {
  id: string;
  code?: string | null;
  name?: string | null;
  description?: string | null;
  courseId?: string | null;
  course?: SuniTrainingCourse | null;
  instructorId?: string | null;
  instructor?: SuniUser | null;
  instructorIds?: string[];
  instructors?: SuniUser[];
  classManagerId?: string | null;
  classManager?: SuniUser | null;
  startAt?: string | null;
  endAt?: string | null;
  sessionCount?: number | null;
  deliveryMode?: string | null;
  locationType?: string | null;
  location?: string | null;
  opsTeamName?: string | null;
  maxLearnerCount?: number | null;
  currentLearnerCount?: number | null;
  status?: string | null;
  dossierStatus?: string | null;
  metadata?: Record<string, unknown>;
  customerViewerProfileIds?: string[];
  students?: unknown[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SuniClassStudent = {
  id: string;
  profileId?: string | null;
  userId?: string | null;
  email?: string | null;
  fullName: string;
  studentCode?: string | null;
  classId?: string | null;
  classCode?: string | null;
  className?: string | null;
  groupName?: string | null;
  department?: string | null;
  position?: string | null;
  status?: string | null;
};

export type SuniClassDiscussion = {
  id: string;
  classId: string;
  discussionEventId: string;
  sourceDiscussionEventId?: string | null;
  status: string;
};

export type SuniTrainingAgenda = {
  id: string;
  courseId: string;
  classId?: string | null;
  sessionNo: number;
  sessionDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  title: string;
  description?: string | null;
  instructorProfileId?: string | null;
  sortOrder: number;
};

export type SuniTrainingClassInstructor = {
  id: string;
  classId: string;
  instructorProfileId: string;
  instructor?: SuniUser | null;
};

export type SuniInstructorLessonGrant = {
  id: string;
  classId: string;
  courseId?: string | null;
  lessonPlanId: string;
  instructorProfileId: string;
  instructorEmail?: string | null;
};

export type SuniTrainingMaterial = {
  id: string;
  courseId: string;
  classId?: string | null;
  title: string;
  description?: string | null;
  fileName: string;
  fileType?: string | null;
  fileSize?: number | null;
  storageBucket: string;
  storagePath: string;
  publicUrl?: string | null;
  visibleToStudents: boolean;
  createdAt?: string | null;
};

export type SuniTrainingScoreComponent = {
  key: 'attendance' | 'quiz' | 'reflection' | 'discussion' | 'game' | 'discussionBonus';
  label: string;
  weight: number;
};

export type SuniTrainingScoreRule = {
  id: string;
  courseId: string;
  components: SuniTrainingScoreComponent[];
  passingScore?: number | null;
};

export type SuniTrainingClassActivity = {
  id: string;
  classId: string;
  courseId?: string | null;
  type: 'discussion' | 'quiz' | 'reflection' | 'game';
  title: string;
  description?: string | null;
  status: string;
  sourceId?: string | null;
  libraryItemId?: string | null;
  openAt?: string | null;
  closeAt?: string | null;
  metadata?: Record<string, unknown>;
};

export type SuniOperationPhase = 'PRE' | 'DURING' | 'POST';
export type SuniOperationPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type SuniOperationTemplateKey = 'offline' | 'online' | 'hcmc';

export type SuniOperationTask = {
  id: string;
  classId: string;
  courseId?: string | null;
  templateKey?: string | null;
  templateItemKey?: string | null;
  title: string;
  group: string;
  phase: SuniOperationPhase;
  dueAt?: string | null;
  ownerProfileId?: string | null;
  ownerName: string;
  priority: SuniOperationPriority;
  status: string;
  requiresEvidence: boolean;
  evidenceStatus: string;
  evidenceType?: string | null;
  evidenceUrl?: string | null;
  note?: string | null;
  sortOrder: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SuniOperationChecklistItem = {
  id: string;
  classId: string;
  taskId?: string | null;
  templateKey?: string | null;
  templateItemKey?: string | null;
  phase: SuniOperationPhase;
  title: string;
  done: boolean;
  ownerProfileId?: string | null;
  ownerName: string;
  status: string;
  priority: SuniOperationPriority;
  requiresEvidence: boolean;
  evidenceStatus: string;
  evidenceType?: string | null;
  dueAt?: string | null;
  note?: string | null;
  sortOrder: number;
  updatedAt?: string | null;
};

export type SuniOperationEvidence = {
  id: string;
  classId: string;
  taskId?: string | null;
  checklistItemId?: string | null;
  type: string;
  sessionLabel: string;
  title: string;
  fileName?: string | null;
  fileUrl?: string | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  status: string;
  ownerProfileId?: string | null;
  ownerName: string;
  note?: string | null;
  uploadedAt?: string | null;
  updatedAt?: string | null;
};

export type SuniTrainingResult = {
  id: string;
  classId: string;
  courseId?: string | null;
  studentProfileId: string;
  studentName?: string | null;
  studentEmail?: string | null;
  studentCode?: string | null;
  department?: string | null;
  className?: string | null;
  courseTitle?: string | null;
  customerName?: string | null;
  scores: Record<string, unknown>;
  finalScore?: number | null;
  passed?: boolean | null;
  updatedAt?: string | null;
};

export type SuniClassStudentImportRow = {
  rowNumber: number;
  fullName: string;
  groupName: string;
  email: string;
  studentCode: string;
  department?: string;
  position?: string;
  status: 'ready' | 'error';
  message?: string;
};

export type SuniProgramPayload = {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  customerName?: string | null;
  executionYear?: number | null;
  plannedCourseCount?: number;
  ownerId: string;
  learnerGroup?: string;
  status?: string;
};

export type SuniCoursePayload = {
  id?: string;
  code: string;
  title: string;
  description?: string | null;
  objective?: string | null;
  customerName?: string | null;
  coordinatorName?: string | null;
  programId?: string | null;
  format?: string;
  startAt?: string | null;
  endAt?: string | null;
  durationDays?: number | null;
  expectedDuration?: string | null;
  locationType?: string;
  location?: string | null;
  onlineLearningUrl?: string | null;
  targetAudience?: string | null;
  plannedClassCount?: number;
  status?: string;
};

export type SuniClassPayload = {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  courseId?: string | null;
  instructorId?: string | null;
  instructorIds?: string[];
  classManagerId?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  sessionCount?: number | null;
  deliveryMode?: string;
  locationType?: string;
  location?: string | null;
  opsTeamName?: string | null;
  maxLearnerCount?: number | null;
  currentLearnerCount?: number;
  status?: string;
};

export type SuniClassStudentImportPayload = {
  classId: string;
  rows: SuniClassStudentImportRow[];
  createAuthUsers?: boolean;
  initialPassword?: string;
};

export type SuniClassStudentUpdatePayload = {
  id: string;
  classId: string;
  fullName: string;
  groupName: string;
  email: string;
  studentCode?: string;
  department?: string;
  position?: string;
  status?: string;
};

export type SuniAgendaPayload = {
  id?: string;
  courseId: string;
  classId?: string | null;
  sessionNo: number;
  sessionDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  title: string;
  description?: string | null;
};

export type SuniMaterialPayload = {
  courseId?: string | null;
  classId?: string | null;
  title?: string;
  description?: string | null;
  visibleToStudents?: boolean;
  file: File;
};

export type SuniMaterialLinkPayload = {
  courseId?: string | null;
  classId?: string | null;
  title: string;
  description?: string | null;
  visibleToStudents?: boolean;
  url: string;
};

export type SuniActivityPayload = {
  id?: string;
  classId: string;
  courseId?: string | null;
  type: SuniTrainingClassActivity['type'];
  title: string;
  description?: string | null;
  status?: string;
  sourceId?: string | null;
  libraryItemId?: string | null;
  openAt?: string | null;
  closeAt?: string | null;
  metadata?: Record<string, unknown>;
};

export type SuniOperationTaskPayload = {
  id?: string;
  classId: string;
  courseId?: string | null;
  templateKey?: string | null;
  templateItemKey?: string | null;
  title: string;
  group?: string;
  phase?: SuniOperationPhase;
  dueAt?: string | null;
  ownerProfileId?: string | null;
  ownerName?: string;
  priority?: SuniOperationPriority;
  status?: string;
  requiresEvidence?: boolean;
  evidenceStatus?: string;
  evidenceType?: string | null;
  evidenceUrl?: string | null;
  note?: string | null;
  sortOrder?: number;
};

export type SuniOperationChecklistPayload = {
  id?: string;
  classId: string;
  taskId?: string | null;
  templateKey?: string | null;
  templateItemKey?: string | null;
  phase: SuniOperationPhase;
  title: string;
  done?: boolean;
  ownerProfileId?: string | null;
  ownerName?: string;
  status?: string;
  priority?: SuniOperationPriority;
  requiresEvidence?: boolean;
  evidenceStatus?: string;
  evidenceType?: string | null;
  dueAt?: string | null;
  note?: string | null;
  sortOrder?: number;
};

export type SuniOperationEvidencePayload = {
  id?: string;
  classId: string;
  taskId?: string | null;
  checklistItemId?: string | null;
  type: string;
  sessionLabel?: string;
  title?: string;
  fileName?: string | null;
  fileUrl?: string | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  status?: string;
  ownerProfileId?: string | null;
  ownerName?: string;
  note?: string | null;
};

export type SuniOperationEvidenceUploadPayload = SuniOperationEvidencePayload & {
  file?: File | null;
};

export type SuniOperationTemplateTask = {
  key: string;
  title: string;
  group: string;
  phase: SuniOperationPhase;
  priority: SuniOperationPriority;
  relativeDay: number;
  ownerRole?: string;
  requiresEvidence: boolean;
  evidenceType?: string;
  note?: string;
  checklistItems?: SuniOperationTemplateChecklistItem[];
};

export type SuniOperationTemplateChecklistItem = {
  key: string;
  title: string;
  requiresEvidence?: boolean;
  evidenceType?: string;
  ownerRole?: string;
  priority?: SuniOperationPriority;
};

export type SuniOperationTemplate = {
  key: SuniOperationTemplateKey;
  name: string;
  description: string;
  tasks: SuniOperationTemplateTask[];
};

export type SuniScoreRulePayload = {
  courseId: string;
  components: SuniTrainingScoreComponent[];
  passingScore?: number | null;
};

export type SuniTrainingResultPayload = {
  id?: string;
  classId: string;
  courseId?: string | null;
  studentProfileId: string;
  scores: Record<string, unknown>;
  finalScore?: number | null;
  passed?: boolean | null;
};

export type SuniCustomerResultScope = {
  profileId?: string | null;
};

export type SuniCustomerContactPayload = {
  classId: string;
  profileId?: string;
  fullName: string;
  email: string;
  password?: string;
};

function requireSupabase() {
  if (!supabase) throw new SuniApiError('Supabase VContent chua duoc cau hinh.');
  return supabase;
}

async function getSuniAccessToken() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw new SuniApiError(error.message);
  let session = data.session;
  const expiresAt = Number(session?.expires_at || 0);
  if (session && expiresAt > 0 && expiresAt - Math.floor(Date.now() / 1000) < 60) {
    const refreshed = await client.auth.refreshSession();
    if (refreshed.error) throw new SuniApiError(refreshed.error.message);
    session = refreshed.data.session;
  }
  const token = session?.access_token;
  if (!token) throw new SuniApiError('Thiếu phiên đăng nhập để tạo tài khoản Auth.');
  return token;
}

async function createImportedStudentAuthUser(input: {
  accessToken: string;
  email: string;
  password: string;
  fullName: string;
  profileId: string;
}) {
  const response = await fetch('/api/admin-create-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new SuniApiError(payload?.error || `Không tạo được Auth user cho ${input.email}.`);
  }
  return payload?.user || null;
}

async function updateImportedStudentAuthUser(input: {
  accessToken: string;
  userId: string;
  email: string;
  fullName: string;
}) {
  const response = await fetch('/api/admin-update-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new SuniApiError(payload?.error || `Không đổi được email đăng nhập cho ${input.email}.`);
  }
  return payload?.user || null;
}

async function withSuniTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new SuniApiError(`Qua thoi gian tai du lieu VContent: ${label}.`)), 12000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const TRAINING_CLASS_SELECT = '*,course:vcontent_training_courses(id,code,title,status,customer_name,metadata),instructor_profile:vcontent_profiles!vcontent_training_classes_instructor_profile_id_fkey(id,email,full_name,role,active),class_manager_profile:vcontent_profiles!vcontent_training_classes_class_manager_profile_id_fkey(id,email,full_name,role,active)';
const TRAINING_COURSE_SELECT = '*,program_courses:vcontent_training_program_courses(program_id,program:vcontent_training_programs(id,code,name)),classes:vcontent_training_classes(id)';
const TRAINING_PROGRAM_SELECT = '*,owner_profile:vcontent_profiles!vcontent_training_programs_owner_profile_id_fkey(id,email,full_name,role,active),program_courses:vcontent_training_program_courses(course:vcontent_training_courses(id,code,title,status))';

function sanitizeId(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function fallbackId(seed: string, prefix = 'item') {
  const base = sanitizeId(seed);
  if (base) return base;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function sanitizeStorageSegment(value: string) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 120);
}

function mapProfileRow(row: any): SuniUser {
  return {
    id: String(row.id || ''),
    email: row.email || null,
    fullName: row.full_name || '',
    name: row.full_name || row.email || '',
    title: row.title || null,
    role: row.role || null,
    status: row.active === false ? 'inactive' : 'active',
  };
}

function mapProgramRow(row: any): SuniTrainingProgram {
  const owner = row.owner_profile && typeof row.owner_profile === 'object'
    ? mapProfileRow(row.owner_profile)
    : null;
  return {
    id: String(row.id || ''),
    code: row.code || '',
    name: row.name || '',
    description: row.description || '',
    customerName: row.customer_name || '',
    executionYear: row.execution_year == null ? null : Number(row.execution_year),
    plannedCourseCount: row.planned_course_count == null ? 0 : Number(row.planned_course_count),
    ownerId: row.owner_profile_id || null,
    ownerName: owner?.fullName || '',
    ownerFullName: owner?.fullName || '',
    learnerGroup: row.learner_group || 'staff',
    status: row.status || 'not_started',
    owner,
    courses: Array.isArray(row.program_courses)
      ? row.program_courses.map((item: any) => item.course).filter(Boolean)
      : [],
    klasses: [],
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapCourseRow(row: any): SuniTrainingCourse {
  const link = Array.isArray(row.program_courses) ? row.program_courses[0] : null;
  const program = link?.program || null;
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  const customerViewerProfileIds = Array.isArray(metadata.customerViewerProfileIds)
    ? metadata.customerViewerProfileIds.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  return {
    id: String(row.id || ''),
    code: row.code || '',
    title: row.title || '',
    name: row.title || '',
    description: row.description || '',
    objective: row.objective || '',
    customerName: row.customer_name || '',
    coordinatorName: row.coordinator_name || '',
    programId: link?.program_id || null,
    courseProgram: program ? { id: String(program.id || ''), name: program.name || '', code: program.code || '' } : null,
    format: row.format || 'offline',
    startAt: row.start_at || null,
    endAt: row.end_at || null,
    durationDays: row.duration_days == null ? null : Number(row.duration_days),
    expectedDuration: row.expected_duration || '',
    locationType: row.location_type || 'offline',
    location: row.location || '',
    onlineLearningUrl: row.online_learning_url || '',
    targetAudience: row.target_audience || '',
    plannedClassCount: row.planned_class_count == null ? 1 : Number(row.planned_class_count),
    status: row.status || 'published',
    metadata,
    customerViewerProfileIds,
    klasses: Array.isArray(row.classes) ? row.classes : [],
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapClassRow(row: any): SuniTrainingClass {
  const instructor = row.instructor_profile && typeof row.instructor_profile === 'object'
    ? mapProfileRow(row.instructor_profile)
    : null;
  const classManager = row.class_manager_profile && typeof row.class_manager_profile === 'object'
    ? mapProfileRow(row.class_manager_profile)
    : null;
  const course = row.course && typeof row.course === 'object' ? mapCourseRow(row.course) : null;
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  const customerViewerProfileIds = Array.isArray(metadata.customerViewerProfileIds)
    ? metadata.customerViewerProfileIds.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  return {
    id: String(row.id || ''),
    code: row.code || '',
    name: row.name || '',
    description: row.description || '',
    courseId: row.course_id || null,
    course,
    instructorId: row.instructor_profile_id || null,
    instructor,
    instructorIds: row.instructor_profile_id ? [String(row.instructor_profile_id)] : [],
    instructors: instructor ? [instructor] : [],
    classManagerId: row.class_manager_profile_id || null,
    classManager,
    startAt: row.start_at || null,
    endAt: row.end_at || null,
    sessionCount: row.session_count == null ? null : Number(row.session_count),
    deliveryMode: row.delivery_mode || 'offline',
    locationType: row.location_type || 'offline',
    location: row.location || '',
    opsTeamName: row.ops_team_name || '',
    maxLearnerCount: row.max_learner_count == null ? null : Number(row.max_learner_count),
    currentLearnerCount: row.current_learner_count == null ? 0 : Number(row.current_learner_count),
    status: row.status || 'pending',
    dossierStatus: row.dossier_status || 'created',
    metadata,
    customerViewerProfileIds,
    students: [],
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapClassInstructorRow(row: any): SuniTrainingClassInstructor {
  const instructor = row.instructor_profile && typeof row.instructor_profile === 'object'
    ? mapProfileRow(row.instructor_profile)
    : null;
  return {
    id: String(row.id || ''),
    classId: String(row.class_id || ''),
    instructorProfileId: String(row.instructor_profile_id || ''),
    instructor,
  };
}

function mapInstructorLessonGrantRow(row: any): SuniInstructorLessonGrant {
  const instructor = row.instructor_profile && typeof row.instructor_profile === 'object'
    ? mapProfileRow(row.instructor_profile)
    : null;
  return {
    id: String(row.id || ''),
    classId: String(row.class_id || ''),
    courseId: row.course_id || null,
    lessonPlanId: String(row.lesson_plan_id || ''),
    instructorProfileId: String(row.instructor_profile_id || ''),
    instructorEmail: instructor?.email || null,
  };
}

async function hydrateInstructorLessonGrantRows(rows: any[]): Promise<SuniInstructorLessonGrant[]> {
  const profileIds = [...new Set(rows.map((row) => String(row.instructor_profile_id || '').trim()).filter(Boolean))];
  if (!profileIds.length) return rows.map(mapInstructorLessonGrantRow);
  const client = requireSupabase();
  const { data, error } = await client
    .from('vcontent_profiles')
    .select('id,email,full_name,title,role,active')
    .in('id', profileIds);
  if (error) throw new SuniApiError(error.message);
  const profileById = new Map<string, any>((data || []).map((profile: any) => [String(profile.id || ''), profile]));
  return rows.map((row) => mapInstructorLessonGrantRow({
    ...row,
    instructor_profile: profileById.get(String(row.instructor_profile_id || '')) || null,
  }));
}

function mergeClassInstructors(
  klass: SuniTrainingClass,
  assignments: SuniTrainingClassInstructor[],
): SuniTrainingClass {
  const instructors = assignments
    .filter((assignment) => assignment.classId === klass.id && assignment.instructorProfileId)
    .map((assignment) => assignment.instructor)
    .filter(Boolean) as SuniUser[];
  const fallbackInstructors = klass.instructor ? [klass.instructor] : [];
  const byId = new Map<string, SuniUser>();
  [...instructors, ...fallbackInstructors].forEach((instructor) => {
    if (instructor.id) byId.set(instructor.id, instructor);
  });
  const instructorIds = [...byId.keys()];
  return {
    ...klass,
    instructorIds,
    instructors: [...byId.values()],
    instructorId: klass.instructorId || instructorIds[0] || null,
    instructor: klass.instructor || [...byId.values()][0] || null,
  };
}

function mapClassStudentRow(row: any, klass?: SuniTrainingClass | null): SuniClassStudent {
  const student = row.student && typeof row.student === 'object' ? row.student : row;
  return {
    id: String(student.id || row.id || ''),
    profileId: student.profile_id || null,
    userId: student.user_id || row.user_id || null,
    email: student.email || row.email || null,
    fullName: student.full_name || row.full_name || student.name || row.name || student.email || row.email || 'Hoc vien',
    studentCode: student.employee_code || student.student_code || row.employee_code || row.student_code || null,
    classId: row.class_id || klass?.id || null,
    classCode: klass?.code || null,
    className: klass?.name || null,
    groupName: row.group_name || student.student_group || null,
    department: row.department || student.department || null,
    position: row.position || student.position || null,
    status: row.status || student.status || 'active',
  };
}

function mapClassDiscussionRow(row: any): SuniClassDiscussion {
  return {
    id: String(row.id || ''),
    classId: String(row.class_id || ''),
    discussionEventId: String(row.discussion_event_id || ''),
    sourceDiscussionEventId: row.source_discussion_event_id || null,
    status: row.status || 'draft',
  };
}

function mapAgendaRow(row: any): SuniTrainingAgenda {
  return {
    id: String(row.id || ''),
    courseId: String(row.course_id || ''),
    classId: row.class_id || null,
    sessionNo: Number(row.session_no || 1),
    sessionDate: row.session_date || null,
    startTime: row.start_time || null,
    endTime: row.end_time || null,
    title: row.title || '',
    description: row.description || '',
    instructorProfileId: row.instructor_profile_id || null,
    sortOrder: Number(row.sort_order || 0),
  };
}

function mapMaterialRow(row: any): SuniTrainingMaterial {
  return {
    id: String(row.id || ''),
    courseId: String(row.course_id || ''),
    classId: row.class_id || null,
    title: row.title || row.file_name || '',
    description: row.description || '',
    fileName: row.file_name || '',
    fileType: row.file_type || null,
    fileSize: row.file_size == null ? null : Number(row.file_size),
    storageBucket: row.storage_bucket || 'training-materials',
    storagePath: row.storage_path || '',
    publicUrl: row.public_url || null,
    visibleToStudents: row.visible_to_students !== false,
    createdAt: row.created_at || null,
  };
}

function isExternalMaterial(material: Pick<SuniTrainingMaterial, 'storageBucket' | 'fileType'>) {
  return material.storageBucket === 'external-link' || String(material.fileType || '').toLowerCase().includes('link');
}

function mapScoreRuleRow(row: any): SuniTrainingScoreRule {
  const components = Array.isArray(row.components) ? row.components : [];
  return {
    id: String(row.id || ''),
    courseId: String(row.course_id || ''),
    components: components
      .map((component: any) => ({
        key: component.key,
        label: component.label || component.key,
        weight: Number(component.weight || 0),
      }))
      .filter((component: SuniTrainingScoreComponent) => ['attendance', 'quiz', 'reflection', 'discussion', 'game', 'discussionBonus'].includes(component.key)),
    passingScore: row.passing_score == null ? null : Number(row.passing_score),
  };
}

function mapActivityRow(row: any): SuniTrainingClassActivity {
  return {
    id: String(row.id || ''),
    classId: String(row.class_id || ''),
    courseId: row.course_id || null,
    type: row.type || 'discussion',
    title: row.title || '',
    description: row.description || '',
    status: row.status || 'draft',
    sourceId: row.source_id || null,
    libraryItemId: row.library_item_id || null,
    openAt: row.open_at || null,
    closeAt: row.close_at || null,
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {},
  };
}

export function splitOperationRequirementLines(value: string): SuniOperationTemplateChecklistItem[] {
  return String(value || '')
    .replace(/\r/g, '\n')
    .split(/\n+|(?=\d+\s*[.)]\s+)/)
    .map((line) => line.trim())
    .map((line) => line.replace(/^[-•]\s*/, '').replace(/^\d+\s*[.)]\s*/, '').trim())
    .filter(Boolean)
    .map((title, index) => ({ key: `c${index + 1}`, title }));
}

const OPERATION_TEMPLATES: SuniOperationTemplate[] = [
  {
    key: 'offline',
    name: 'Lớp trực tiếp',
    description: 'Checklist chuẩn cho lớp học tại phòng đào tạo, có hậu cần, điểm danh, hình ảnh và hồ sơ nghiệm thu.',
    tasks: [
      { key: 'offline-confirm-schedule-room', title: 'Xác nhận lịch học, địa điểm và phòng học', group: 'Điều phối lớp', phase: 'PRE', priority: 'HIGH', relativeDay: -7, ownerRole: 'CTV điều phối', requiresEvidence: false, evidenceType: '', note: 'Chốt với giảng viên, khách hàng và đầu mối cơ sở vật chất.' },
      { key: 'offline-student-roster', title: 'Kiểm tra danh sách học viên và nhóm lớp', group: 'Học viên', phase: 'PRE', priority: 'HIGH', relativeDay: -5, ownerRole: 'CTV lớp', requiresEvidence: true, evidenceType: 'Danh sách học viên', note: 'Đối chiếu email, mã học viên, đơn vị, nhóm.' },
      { key: 'offline-material-print', title: 'Chuẩn bị tài liệu in ấn, biển tên và vật phẩm lớp', group: 'Tài liệu', phase: 'PRE', priority: 'MEDIUM', relativeDay: -3, ownerRole: 'CTV hậu cần', requiresEvidence: true, evidenceType: 'Ảnh tài liệu/vật phẩm', note: 'Đủ số lượng theo sĩ số dự kiến và dự phòng.' },
      { key: 'offline-equipment-check', title: 'Kiểm tra thiết bị phòng học: máy chiếu, micro, loa, wifi', group: 'Kỹ thuật', phase: 'PRE', priority: 'HIGH', relativeDay: -1, ownerRole: 'CTV kỹ thuật', requiresEvidence: true, evidenceType: 'Ảnh phòng học', note: 'Test share màn hình, âm thanh, đường truyền và phương án dự phòng.' },
      { key: 'offline-instructor-agenda', title: 'Xác nhận giảng viên, agenda và yêu cầu hỗ trợ trong lớp', group: 'Giảng viên', phase: 'PRE', priority: 'HIGH', relativeDay: -1, ownerRole: 'CTV điều phối', requiresEvidence: false, evidenceType: '', note: 'Chốt giờ có mặt, tài liệu, hoạt động nhóm, bài kiểm tra nếu có.' },
      { key: 'offline-checkin', title: 'Check-in học viên và ghi nhận sĩ số đầu buổi', group: 'Trong lớp', phase: 'DURING', priority: 'HIGH', relativeDay: 0, ownerRole: 'CTV lớp', requiresEvidence: true, evidenceType: 'Điểm danh', note: 'Cập nhật vắng/muộn/phát sinh ngay trong buổi.' },
      { key: 'offline-class-photo', title: 'Chụp ảnh khai giảng, toàn cảnh lớp và hoạt động nhóm', group: 'Minh chứng', phase: 'DURING', priority: 'MEDIUM', relativeDay: 0, ownerRole: 'CTV lớp', requiresEvidence: true, evidenceType: 'Ảnh lớp học', note: 'Tối thiểu ảnh toàn cảnh, giảng viên, học viên tương tác.' },
      { key: 'offline-class-support', title: 'Hỗ trợ giảng viên, ghi nhận Q&A và phát sinh vận hành', group: 'Trong lớp', phase: 'DURING', priority: 'MEDIUM', relativeDay: 0, ownerRole: 'CTV lớp', requiresEvidence: false, evidenceType: '', note: 'Log các vấn đề cần follow-up sau buổi.' },
      { key: 'offline-survey', title: 'Kích hoạt khảo sát/QR và nhắc học viên hoàn thành', group: 'Đánh giá', phase: 'DURING', priority: 'HIGH', relativeDay: 0, ownerRole: 'CTV lớp', requiresEvidence: true, evidenceType: 'Kết quả khảo sát', note: 'Theo dõi tỷ lệ phản hồi trước khi lớp kết thúc.' },
      { key: 'offline-attendance-summary', title: 'Tổng hợp điểm danh và xác nhận dữ liệu tham gia', group: 'Sau lớp', phase: 'POST', priority: 'HIGH', relativeDay: 1, ownerRole: 'CTV lớp', requiresEvidence: true, evidenceType: 'Bảng điểm danh', note: 'Dữ liệu dùng cho kết quả lớp và hồ sơ nghiệm thu.' },
      { key: 'offline-upload-evidence', title: 'Upload ảnh, tài liệu, biên bản và minh chứng vận hành', group: 'Hồ sơ nghiệm thu', phase: 'POST', priority: 'HIGH', relativeDay: 1, ownerRole: 'CTV hồ sơ', requiresEvidence: true, evidenceType: 'Hồ sơ nghiệm thu', note: 'Gắn minh chứng theo từng task bắt buộc.' },
      { key: 'offline-feedback-report', title: 'Tổng hợp phản hồi học viên và issue cần xử lý', group: 'Báo cáo', phase: 'POST', priority: 'MEDIUM', relativeDay: 2, ownerRole: 'CTV điều phối', requiresEvidence: true, evidenceType: 'Báo cáo phản hồi', note: 'Gửi manager đào tạo kiểm tra trước khi đóng lớp.' },
    ],
  },
  {
    key: 'online',
    name: 'Lớp trực tuyến',
    description: 'Checklist chuẩn cho lớp Zoom/Teams/Meet, tập trung link học, kỹ thuật online, attendance report, recording và ảnh chụp màn hình.',
    tasks: [
      { key: 'online-create-room', title: 'Tạo phòng học online và cấu hình quyền truy cập', group: 'Nền tảng học', phase: 'PRE', priority: 'HIGH', relativeDay: -7, ownerRole: 'CTV kỹ thuật', requiresEvidence: true, evidenceType: 'Link phòng học', note: 'Zoom/Teams/Meet, waiting room, recording, co-host.' },
      { key: 'online-send-link', title: 'Gửi link học, lịch học và hướng dẫn tham gia cho học viên', group: 'Điều phối lớp', phase: 'PRE', priority: 'HIGH', relativeDay: -5, ownerRole: 'CTV điều phối', requiresEvidence: true, evidenceType: 'Email/thông báo', note: 'Gửi đúng danh sách và có nhắc lịch trước buổi.' },
      { key: 'online-roster', title: 'Kiểm tra danh sách học viên, email và quy tắc đặt tên', group: 'Học viên', phase: 'PRE', priority: 'HIGH', relativeDay: -3, ownerRole: 'CTV lớp', requiresEvidence: true, evidenceType: 'Danh sách học viên', note: 'Đảm bảo attendance report match được học viên.' },
      { key: 'online-tech-rehearsal', title: 'Test camera, micro, share screen và tài liệu với giảng viên', group: 'Kỹ thuật', phase: 'PRE', priority: 'HIGH', relativeDay: -1, ownerRole: 'CTV kỹ thuật', requiresEvidence: true, evidenceType: 'Biên bản test', note: 'Kiểm tra backup link, recording, breakout nếu có.' },
      { key: 'online-open-room', title: 'Mở phòng trước giờ học và admit học viên', group: 'Trong lớp', phase: 'DURING', priority: 'HIGH', relativeDay: 0, ownerRole: 'CTV kỹ thuật', requiresEvidence: false, evidenceType: '', note: 'Mở trước 15-30 phút, kiểm tra tên hiển thị.' },
      { key: 'online-attendance-live', title: 'Theo dõi điểm danh online và thời lượng tham gia', group: 'Trong lớp', phase: 'DURING', priority: 'HIGH', relativeDay: 0, ownerRole: 'CTV lớp', requiresEvidence: true, evidenceType: 'Attendance report', note: 'Ghi nhận học viên rớt mạng/vào muộn.' },
      { key: 'online-tech-support', title: 'Hỗ trợ lỗi kỹ thuật và ghi nhận Q&A/chat quan trọng', group: 'Trong lớp', phase: 'DURING', priority: 'MEDIUM', relativeDay: 0, ownerRole: 'CTV kỹ thuật', requiresEvidence: false, evidenceType: '', note: 'Log issue theo thời điểm và người gặp lỗi.' },
      { key: 'online-screenshot', title: 'Chụp màn hình lớp, hoạt động tương tác và kết thúc buổi', group: 'Minh chứng', phase: 'DURING', priority: 'MEDIUM', relativeDay: 0, ownerRole: 'CTV lớp', requiresEvidence: true, evidenceType: 'Ảnh chụp màn hình', note: 'Tối thiểu ảnh toàn lớp, giảng viên, hoạt động chính.' },
      { key: 'online-recording', title: 'Lưu recording và kiểm tra quyền truy cập file ghi hình', group: 'Minh chứng', phase: 'POST', priority: 'HIGH', relativeDay: 1, ownerRole: 'CTV kỹ thuật', requiresEvidence: true, evidenceType: 'Recording', note: 'Upload/link recording kèm mật khẩu nếu có.' },
      { key: 'online-attendance-export', title: 'Xuất attendance report và chuẩn hóa dữ liệu tham gia', group: 'Sau lớp', phase: 'POST', priority: 'HIGH', relativeDay: 1, ownerRole: 'CTV lớp', requiresEvidence: true, evidenceType: 'Attendance report', note: 'Đối chiếu danh sách lớp và thời lượng tham gia.' },
      { key: 'online-survey-feedback', title: 'Gửi khảo sát, tổng hợp phản hồi và vấn đề phát sinh', group: 'Đánh giá', phase: 'POST', priority: 'HIGH', relativeDay: 2, ownerRole: 'CTV điều phối', requiresEvidence: true, evidenceType: 'Kết quả khảo sát', note: 'Theo dõi tỷ lệ phản hồi và issue cần xử lý.' },
      { key: 'online-dossier', title: 'Hoàn thiện hồ sơ nghiệm thu online', group: 'Hồ sơ nghiệm thu', phase: 'POST', priority: 'HIGH', relativeDay: 2, ownerRole: 'CTV hồ sơ', requiresEvidence: true, evidenceType: 'Hồ sơ nghiệm thu', note: 'Gom link lớp, report, recording, survey, ảnh chụp màn hình.' },
    ],
  },
  {
    key: 'hcmc',
    name: 'Lớp HCMC',
    description: 'Checklist vận hành lớp HCMC lấy từ sheet Công việc vận hành: mỗi gạch đầu dòng là một ô tick done riêng dưới đầu việc cha.',
    tasks: [
      {
        key: 'hcmc-pre-final-check',
        title: 'Rà soát toàn bộ các hạng mục trước khi bắt dầu chương trình',
        group: 'Chuẩn bị trước khi lớp học bắt đầu',
        phase: 'PRE',
        priority: 'HIGH',
        relativeDay: -1,
        ownerRole: 'Anh Đạt',
        requiresEvidence: false,
        note: 'Dòng 1 sheet Công việc vận hành.',
        checklistItems: splitOperationRequirementLines(`1. Các hạng mục trình chiếu đã ok
2. Các bàn đại biểu, GV, học viên đã đầy đủ tài liệu
3. Backdrop, Standee đã trình chiếu, trưng bày
4. Wifi, điều hòa, ánh sáng ok`),
      },
      {
        key: 'hcmc-pre-mc-script',
        title: 'Chốt kịch bản MC lần cuối',
        group: 'Chuẩn bị trước khi lớp học bắt đầu',
        phase: 'PRE',
        priority: 'HIGH',
        relativeDay: -1,
        ownerRole: 'Linh Đan',
        requiresEvidence: false,
        checklistItems: splitOperationRequirementLines('Chốt thành phần giới thiệu trong kịch bản MC và thời gian MC bắt đầu chương trình'),
      },
      {
        key: 'hcmc-pre-customer-confirm',
        title: 'Làm việc với KH',
        group: 'Chuẩn bị trước khi lớp học bắt đầu',
        phase: 'PRE',
        priority: 'HIGH',
        relativeDay: -1,
        ownerRole: 'Linh Đan',
        requiresEvidence: false,
        checklistItems: splitOperationRequirementLines(`1. Xác nhận thành phần lãnh đạo KH có mặt
2. Xác nhận thành phần lãnh đạo PPO có mặt`),
      },
      {
        key: 'hcmc-pre-instructor-welcome',
        title: 'Liên lạc và tiếp đón giảng viên',
        group: 'Chuẩn bị trước khi lớp học bắt đầu',
        phase: 'PRE',
        priority: 'HIGH',
        relativeDay: -1,
        ownerRole: 'Chị Ánh',
        requiresEvidence: false,
        checklistItems: splitOperationRequirementLines(`1. Liên lạc với giảng viên 1 ngày trước khi buổi đào tạo diễn ra để nhắc lịch, địa điểm, thời gian có mặt ở lớp đào tạo
2. Tiếp đón giảng viên, kết nối trình chiếu, chuẩn bị mic, danh sách học viên, agenda cho GV`),
      },
      {
        key: 'hcmc-during-learner-welcome',
        title: 'Đón tiếp học viên',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'HIGH',
        relativeDay: 0,
        ownerRole: 'Minh Khuê + Chiêu Anh',
        requiresEvidence: false,
        checklistItems: splitOperationRequirementLines('Tiếp đón và hướng dẫn học viên ngồi đúng nhóm mà BTC sắp xếp hoặc nhắc học viên quét QR để biết số nhóm'),
      },
      {
        key: 'hcmc-during-mc',
        title: 'MC',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'HIGH',
        relativeDay: 0,
        ownerRole: 'Linh Đan',
        requiresEvidence: false,
        checklistItems: splitOperationRequirementLines(`1. Ổn định lớp
2. Giới thiệu thành phần tham dự theo kịch bản
3. Giới thiệu tổng quan về lịch trình buổi học`),
      },
      {
        key: 'hcmc-during-opening',
        title: 'Khai giảng',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'HIGH',
        relativeDay: 0,
        ownerRole: 'Anh Đạt',
        requiresEvidence: true,
        evidenceType: 'Ảnh/video khai giảng',
        checklistItems: splitOperationRequirementLines(`1. Lãnh đạo KH phát biểu
2. Lãnh đạo PPO phát biểu
3. Tặng hoa cho giảng viên
4. Chụp ảnh khai giảng
5. Chuyển slide giới thiệu giảng viên`),
      },
      {
        key: 'hcmc-during-video',
        title: 'Trình chiếu video',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'MEDIUM',
        relativeDay: 0,
        ownerRole: 'Anh Đạt',
        requiresEvidence: false,
        checklistItems: splitOperationRequirementLines(`1. Kiểm tra âm thanh, hình ảnh video
2. Trình chiếu video theo đúng kịch bản chương trình`),
      },
      {
        key: 'hcmc-during-attendance',
        title: 'Ký điểm Danh học viên',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'HIGH',
        relativeDay: 0,
        ownerRole: 'Minh Khuê + Chiêu Anh',
        requiresEvidence: true,
        evidenceType: 'Danh sách điểm danh',
        checklistItems: splitOperationRequirementLines(`1. Phát danh sách điểm danh cho học viên ký
2. Kiểm tra học viên vắng mặt, đến muộn
3. Chụp ảnh danh sách điểm danh sau khi học viên ký`),
      },
      {
        key: 'hcmc-during-group-discussion',
        title: 'Thảo luận nhóm',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'HIGH',
        relativeDay: 0,
        ownerRole: 'Minh Khuê + Chiêu Anh + Linh Đan',
        requiresEvidence: true,
        evidenceType: 'Kết quả thảo luận nhóm',
        checklistItems: splitOperationRequirementLines(`1. PA1: Thảo luận phần mềm
2. Sẵn sàng phần mềm thảo luận nhóm
3. Thao tác với tài khoản test trước khi bắt đầu lớp học
4. Đề xuất giảng viên chỉ định nhóm trưởng của từng nhóm
5. Sau khi giảng viên hướng dẫn nội dung, người vận hành trình chiếu đường link và mã QR để học viên truy cập vào phần mềm
6. Hỗ trợ học viên thao tác phần mềm
7. Trình chiếu kết quả thảo luận các nhóm trên phần mềm
8. PA2: Thảo luận giấy
9. Chuẩn bị giấy A0 và bút dạ cho mỗi nhóm khi thảo luận
10. Kết thúc thảo luận treo nội dung thảo luận của nhóm trình bày lên bảng flipchart hoặc trên tường lớp học (nếu k có bảng)`),
      },
      {
        key: 'hcmc-during-game',
        title: 'Game (nếu có)',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'MEDIUM',
        relativeDay: 0,
        ownerRole: 'Minh Khuê + Chiêu Anh + Linh Đan',
        requiresEvidence: true,
        evidenceType: 'Ảnh/video hoạt động lớp',
        checklistItems: splitOperationRequirementLines(`1. Chuẩn bị phần mềm game hoặc vật dụng chơi game
2. Hỗ trợ giảng viên tổ chức game
3. Chụp ảnh/video hoạt động
4. Tổng hợp kết quả game nếu có`),
      },
      {
        key: 'hcmc-during-break',
        title: 'Giải lao',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'MEDIUM',
        relativeDay: 0,
        ownerRole: 'Minh Khuê + Chiêu Anh',
        requiresEvidence: false,
        checklistItems: splitOperationRequirementLines(`1. Thông báo thời gian giải lao
2. Kiểm tra teabreak, nước uống
3. Nhắc học viên quay lại lớp đúng giờ`),
      },
      {
        key: 'hcmc-during-lunch',
        title: 'Nghỉ trưa',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'MEDIUM',
        relativeDay: 0,
        ownerRole: 'Minh Khuê + Chiêu Anh',
        requiresEvidence: false,
        checklistItems: splitOperationRequirementLines(`1. Thông báo thời gian nghỉ trưa và giờ quay lại lớp
2. Điều phối suất ăn, khu vực ăn trưa nếu có`),
      },
      {
        key: 'hcmc-during-recording',
        title: 'Quay hình',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'MEDIUM',
        relativeDay: 0,
        ownerRole: 'Anh Đạt',
        requiresEvidence: true,
        evidenceType: 'Video lớp học',
        checklistItems: splitOperationRequirementLines('Quay hình các hoạt động chính của lớp theo yêu cầu truyền thông/nghiệm thu'),
      },
      {
        key: 'hcmc-during-gifts',
        title: 'Tặng quà lớp học',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'MEDIUM',
        relativeDay: 0,
        ownerRole: 'Minh Khuê + Chiêu Anh',
        requiresEvidence: true,
        evidenceType: 'Ảnh tặng quà',
        checklistItems: splitOperationRequirementLines('Chuẩn bị và điều phối tặng quà cho lớp học theo kịch bản'),
      },
      {
        key: 'hcmc-during-survey',
        title: 'Khảo sát sau khóa học',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'HIGH',
        relativeDay: 0,
        ownerRole: 'Linh Đan',
        requiresEvidence: true,
        evidenceType: 'Kết quả khảo sát',
        checklistItems: splitOperationRequirementLines(`1. Kiểm tra link/QR khảo sát
2. Trình chiếu QR khảo sát
3. Nhắc học viên hoàn thành khảo sát trước khi kết thúc lớp
4. Theo dõi tỷ lệ phản hồi khảo sát`),
      },
      {
        key: 'hcmc-during-test',
        title: 'Làm bài kiểm tra',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'HIGH',
        relativeDay: 0,
        ownerRole: 'Linh Đan',
        requiresEvidence: true,
        evidenceType: 'Kết quả kiểm tra',
        checklistItems: splitOperationRequirementLines(`1. Kiểm tra link/QR bài kiểm tra
2. Trình chiếu QR bài kiểm tra
3. Hỗ trợ học viên truy cập và làm bài
4. Theo dõi số lượng học viên hoàn thành bài kiểm tra`),
      },
      {
        key: 'hcmc-during-class-media',
        title: 'Chụp ảnh, quay video lớp học',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'MEDIUM',
        relativeDay: 0,
        ownerRole: 'Anh Đạt',
        requiresEvidence: true,
        evidenceType: 'Ảnh/video lớp học',
        checklistItems: splitOperationRequirementLines(`1. Chụp ảnh toàn cảnh lớp
2. Chụp ảnh giảng viên, học viên tương tác
3. Quay video các hoạt động chính`),
      },
      {
        key: 'hcmc-during-support-ops',
        title: 'Hỗ trợ học viên trong quá trình học',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'HIGH',
        relativeDay: 0,
        ownerRole: 'Chiêu Anh + Linh Đan',
        requiresEvidence: false,
        checklistItems: splitOperationRequirementLines(`1. Hỗ trợ học viên về tài liệu, thiết bị, phần mềm
2. Ghi nhận vấn đề phát sinh của học viên
3. Điều phối câu hỏi giữa học viên và giảng viên
4. Theo dõi học viên rời lớp, vào muộn
5. Tổng hợp các trường hợp cần follow-up`),
      },
      {
        key: 'hcmc-during-support-logistics',
        title: 'Hỗ trợ học viên trong quá trình học',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'HIGH',
        relativeDay: 0,
        ownerRole: 'Minh Khuê + Chiêu Anh + Linh Đan',
        requiresEvidence: false,
        checklistItems: splitOperationRequirementLines(`1. Hỗ trợ học viên ổn định chỗ ngồi, nhóm học
2. Hỗ trợ các yêu cầu hậu cần phát sinh trong lớp
3. Nhắc học viên tham gia đầy đủ hoạt động theo yêu cầu giảng viên`),
      },
      {
        key: 'hcmc-during-lunch-support',
        title: 'Ăn trưa, nghỉ trưa',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'MEDIUM',
        relativeDay: 0,
        ownerRole: 'Minh Khuê + Chiêu Anh',
        requiresEvidence: false,
        checklistItems: splitOperationRequirementLines('Điều phối ăn trưa, nghỉ trưa và nhắc học viên quay lại lớp đúng giờ'),
      },
      {
        key: 'hcmc-during-closing',
        title: 'Bế giảng',
        group: 'Vận hành lớp học',
        phase: 'DURING',
        priority: 'HIGH',
        relativeDay: 0,
        ownerRole: 'Anh Đạt + Linh Đan',
        requiresEvidence: true,
        evidenceType: 'Ảnh/video bế giảng',
        checklistItems: splitOperationRequirementLines(`1. Điều phối phần bế giảng theo kịch bản
2. Chụp ảnh/video bế giảng và trao chứng nhận/quà nếu có`),
      },
      {
        key: 'hcmc-post-cleanup',
        title: 'Thu dọn trang thiết bị, VPP',
        group: 'Sau buổi học',
        phase: 'POST',
        priority: 'HIGH',
        relativeDay: 1,
        ownerRole: 'Minh Khuê + Chiêu Anh',
        requiresEvidence: false,
        checklistItems: splitOperationRequirementLines(`1. Thu dọn tài liệu, VPP, standee, backdrop
2. Kiểm kê thiết bị, vật dụng sau buổi học
3. Bàn giao lại phòng học, thiết bị cho địa điểm`),
      },
      {
        key: 'hcmc-post-improvement',
        title: 'Tổng hợp các vấn đề và phương án cải thiện đào tạo',
        group: 'Sau buổi học',
        phase: 'POST',
        priority: 'HIGH',
        relativeDay: 1,
        ownerRole: 'Linh Đan',
        requiresEvidence: true,
        evidenceType: 'Biên bản vận hành',
        checklistItems: splitOperationRequirementLines(`1. Tổng hợp các vấn đề phát sinh trong buổi học
2. Đề xuất phương án cải thiện cho các buổi tiếp theo
3. Gửi manager đào tạo/đầu mối liên quan kiểm tra và xử lý`),
      },
    ],
  },
];

function mapOperationTaskRow(row: any): SuniOperationTask {
  return {
    id: String(row.id || ''),
    classId: String(row.class_id || ''),
    courseId: row.course_id || null,
    templateKey: row.template_key || null,
    templateItemKey: row.template_item_key || null,
    title: row.title || '',
    group: row.task_group || '',
    phase: row.phase || 'PRE',
    dueAt: row.due_at || null,
    ownerProfileId: row.owner_profile_id || null,
    ownerName: row.owner_name || '',
    priority: row.priority || 'MEDIUM',
    status: row.status || 'Chưa bắt đầu',
    requiresEvidence: row.requires_evidence === true,
    evidenceStatus: row.evidence_status || (row.requires_evidence ? 'missing' : 'not_required'),
    evidenceType: row.evidence_type || null,
    evidenceUrl: row.evidence_url || null,
    note: row.note || null,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapOperationChecklistRow(row: any): SuniOperationChecklistItem {
  return {
    id: String(row.id || ''),
    classId: String(row.class_id || ''),
    taskId: row.task_id || null,
    templateKey: row.template_key || null,
    templateItemKey: row.template_item_key || null,
    phase: row.phase || 'PRE',
    title: row.title || '',
    done: row.is_done === true,
    ownerProfileId: row.owner_profile_id || null,
    ownerName: row.owner_name || '',
    status: row.status || (row.is_done ? 'Hoàn thành' : 'Chưa bắt đầu'),
    priority: row.priority || 'MEDIUM',
    requiresEvidence: row.requires_evidence === true,
    evidenceStatus: row.evidence_status || (row.requires_evidence ? 'missing' : 'not_required'),
    evidenceType: row.evidence_type || null,
    dueAt: row.due_at || null,
    note: row.note || null,
    sortOrder: Number(row.sort_order || 0),
    updatedAt: row.updated_at || null,
  };
}

function mapOperationEvidenceRow(row: any): SuniOperationEvidence {
  return {
    id: String(row.id || ''),
    classId: String(row.class_id || ''),
    taskId: row.task_id || null,
    checklistItemId: row.checklist_item_id || null,
    type: row.evidence_type || '',
    sessionLabel: row.session_label || '',
    title: row.title || '',
    fileName: row.file_name || null,
    fileUrl: row.file_url || null,
    storageBucket: row.storage_bucket || null,
    storagePath: row.storage_path || null,
    status: row.status || 'Chờ',
    ownerProfileId: row.owner_profile_id || null,
    ownerName: row.owner_name || '',
    note: row.note || null,
    uploadedAt: row.uploaded_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapResultRow(row: any): SuniTrainingResult {
  return {
    id: String(row.id || ''),
    classId: String(row.class_id || ''),
    courseId: row.course_id || null,
    studentProfileId: String(row.student_profile_id || ''),
    studentName: row.student_name || null,
    studentEmail: row.student_email || null,
    studentCode: row.student_code || null,
    department: row.department || null,
    className: row.class_name || null,
    courseTitle: row.course_title || null,
    customerName: row.customer_name || null,
    scores: row.scores && typeof row.scores === 'object' ? row.scores : {},
    finalScore: row.final_score == null ? null : Number(row.final_score),
    passed: row.passed,
    updatedAt: row.updated_at || null,
  };
}

function enrichTrainingResults(results: SuniTrainingResult[], classes: SuniTrainingClass[], students: SuniClassStudent[]) {
  const classById = new Map(classes.map((klass) => [klass.id, klass]));
  const studentByProfileId = new Map(students.map((student) => [String(student.profileId || ''), student]));
  return results.map((result) => {
    const klass = classById.get(result.classId);
    const student = studentByProfileId.get(result.studentProfileId);
    return {
      ...result,
      courseId: result.courseId || klass?.courseId || null,
      className: result.className || klass?.name || klass?.code || null,
      courseTitle: result.courseTitle || klass?.course?.title || null,
      customerName: result.customerName || klass?.course?.customerName || null,
      studentName: result.studentName || student?.fullName || null,
      studentEmail: result.studentEmail || student?.email || null,
      studentCode: result.studentCode || student?.studentCode || null,
      department: result.department || student?.department || null,
    };
  });
}

function scoreNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeScore10(value: unknown) {
  const numberValue = scoreNumber(value);
  if (numberValue == null) return null;
  return Math.max(0, Math.min(10, numberValue));
}

function normalizeNonNegativeScore(value: unknown) {
  const numberValue = scoreNumber(value);
  if (numberValue == null) return null;
  return Math.max(0, numberValue);
}

function calculateFinalScore(scores: Record<string, unknown>, rule?: SuniTrainingScoreRule | null) {
  const components = (rule?.components || [])
    .filter((component) => component.key !== 'discussionBonus')
    .filter((component) => Math.max(0, Number(component.weight || 0)) > 0);
  if (!components.length) return null;
  const totalWeight = components.reduce((sum, component) => sum + Math.max(0, Number(component.weight || 0)), 0);
  if (totalWeight <= 0) return null;
  const weighted = components.reduce((sum, component) => {
    const value = normalizeScore10(scores[component.key]);
    if (value == null) return sum;
    return sum + value * Math.max(0, Number(component.weight || 0));
  }, 0);
  const hasAllRequiredScores = components.every((component) => normalizeScore10(scores[component.key]) != null);
  if (!hasAllRequiredScores) return null;
  const discussionBonus = normalizeNonNegativeScore(scores.discussionBonus) ?? 0;
  const finalScore = Math.max(0, Math.min(10, (weighted / totalWeight) + discussionBonus));
  return Math.round(finalScore * 100) / 100;
}

function averageScoreRecord(values: Record<string, unknown>) {
  const numbers = Object.values(values)
    .map(scoreNumber)
    .filter((value): value is number => value != null);
  if (!numbers.length) return null;
  return Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 100) / 100;
}

function sumScoreRecord(values: Record<string, unknown>) {
  const numbers = Object.values(values)
    .map(scoreNumber)
    .filter((value): value is number => value != null);
  if (!numbers.length) return null;
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

async function removeClassDiscussionScores(client: ReturnType<typeof requireSupabase>, classId: string, discussionEventIds: string[]) {
  const ids = Array.from(new Set(discussionEventIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (!classId || !ids.length) return;
  const klass = await client
    .from('vcontent_training_classes')
    .select('course_id')
    .eq('id', classId)
    .maybeSingle();
  const scoreRule = klass.data?.course_id
    ? await client
      .from('vcontent_training_score_rules')
      .select('*')
      .eq('course_id', klass.data.course_id)
      .maybeSingle()
    : null;
  const rule = scoreRule?.data ? mapScoreRuleRow(scoreRule.data) : null;
  const { data, error } = await client
    .from('vcontent_training_results')
    .select('id,scores')
    .eq('class_id', classId);
  if (error) throw new SuniApiError(error.message);
  const now = new Date().toISOString();
  const updates = await Promise.all((data || []).map((row: any) => {
    const scores = row?.scores && typeof row.scores === 'object' ? { ...row.scores } : {};
    const discussionEvents = scores.discussionEvents && typeof scores.discussionEvents === 'object'
      ? { ...(scores.discussionEvents as Record<string, unknown>) }
      : {};
    const discussionBonusEvents = scores.discussionBonusEvents && typeof scores.discussionBonusEvents === 'object'
      ? { ...(scores.discussionBonusEvents as Record<string, unknown>) }
      : {};
    ids.forEach((id) => {
      delete discussionEvents[id];
      delete discussionBonusEvents[id];
    });
    const nextScores = {
      ...scores,
      discussionEvents,
      discussionBonusEvents,
      discussion: averageScoreRecord(discussionEvents),
      discussionBonus: scores.discussionBonusManual === true ? scores.discussionBonus : sumScoreRecord(discussionBonusEvents),
    };
    const finalScore = calculateFinalScore(nextScores, rule);
    return client
      .from('vcontent_training_results')
      .update({
        scores: nextScores,
        final_score: finalScore,
        passed: finalScore == null || rule?.passingScore == null ? null : finalScore >= rule.passingScore,
        updated_at: now,
      })
      .eq('id', row.id);
  }));
  const updateError = updates.find((result: any) => result?.error)?.error;
  if (updateError) throw new SuniApiError(updateError.message);
}

async function loadClassQuizScoresByProfile(client: ReturnType<typeof requireSupabase>, classId: string, students: SuniClassStudent[]) {
  const activities = await client
    .from('vcontent_training_class_activities')
    .select('source_id,metadata')
    .eq('class_id', classId)
    .eq('type', 'quiz');
  if (activities.error) throw new SuniApiError(activities.error.message);
  const formIds = [...new Set((activities.data || [])
    .map((row: any) => String(row.metadata?.formId || row.source_id || '').trim())
    .filter(Boolean))];
  if (!formIds.length) return { hasQuizActivities: false, scoresByProfile: new Map<string, number | null>() };
  const submissions = await client
    .from('vcontent_quiz_submissions')
    .select('form_id,student_profile_id,email,respondent_name,score')
    .in('form_id', formIds);
  if (submissions.error) throw new SuniApiError(submissions.error.message);
  return {
    hasQuizActivities: true,
    scoresByProfile: buildQuizScoresByProfile({
      formIds,
      students,
      submissions: (submissions.data || []).map((row: any) => ({
        formId: row.form_id,
        studentProfileId: row.student_profile_id,
        email: row.email,
        respondentName: row.respondent_name,
        score: row.score,
      })),
    }),
  };
}

async function loadClassReflectionScoresByProfile(client: ReturnType<typeof requireSupabase>, classId: string, students: SuniClassStudent[]) {
  const activities = await client
    .from('vcontent_training_class_activities')
    .select('id')
    .eq('class_id', classId)
    .eq('type', 'reflection');
  if (activities.error) throw new SuniApiError(activities.error.message);
  const activityIds = [...new Set((activities.data || [])
    .map((row: any) => String(row.id || '').trim())
    .filter(Boolean))];
  if (!activityIds.length) return { hasReflectionActivities: false, scoresByProfile: new Map<string, number | null>() };

  const submissions = await client
    .from('vcontent_training_activity_submissions')
    .select('activity_id,student_profile_id,score')
    .in('activity_id', activityIds)
    .not('score', 'is', null);
  if (submissions.error) throw new SuniApiError(submissions.error.message);

  return {
    hasReflectionActivities: true,
    scoresByProfile: buildReflectionScoresByProfile({
      activityIds,
      students,
      submissions: (submissions.data || []).map((row: any) => ({
        activityId: row.activity_id,
        studentProfileId: row.student_profile_id,
        score: row.score,
      })),
    }),
  };
}

async function loadClassDiscussionScoresByProfile(client: ReturnType<typeof requireSupabase>, classId: string) {
  const links = await client
    .from('vcontent_training_class_discussions')
    .select('discussion_event_id')
    .eq('class_id', classId);
  if (links.error) throw new SuniApiError(links.error.message);
  const eventIds = [...new Set((links.data || []).map((row: any) => String(row.discussion_event_id || '').trim()).filter(Boolean))];
  if (!eventIds.length) {
    return {
      hasDiscussionEvents: false,
      scoresByProfile: new Map<string, number | null>(),
      bonusByProfile: new Map<string, number | null>(),
      scoreEventsByProfile: new Map<string, Record<string, number>>(),
      bonusEventsByProfile: new Map<string, Record<string, number>>(),
    };
  }

  const groups = await client
    .from('vcontent_discussion_groups')
    .select('event_id,teacher_score,teacher_comment,members:vcontent_discussion_group_members(participant_id,participant:vcontent_discussion_participants(id,profile_id))')
    .in('event_id', eventIds);
  if (groups.error) throw new SuniApiError(groups.error.message);

  const scoreEventsByProfile = new Map<string, Record<string, number>>();
  const bonusEventsByProfile = new Map<string, Record<string, number>>();
  for (const group of groups.data || []) {
    const eventId = String((group as any).event_id || '');
    const score = scoreNumber((group as any).teacher_score);
    if (!eventId || score == null) continue;
    const comment = parseJson<Record<string, unknown>>((group as any).teacher_comment, {});
    const bonusPoints = scoreNumber(comment.bonusPoints);
    const activeParticipantIds = new Set(asArray<string | number>(comment.activeParticipantIds).map(String));
    for (const member of (group as any).members || []) {
      const participant = member?.participant || null;
      const profileId = String(participant?.profile_id || '');
      const participantId = String(participant?.id || member?.participant_id || '');
      if (!profileId) continue;
      scoreEventsByProfile.set(profileId, {
        ...(scoreEventsByProfile.get(profileId) || {}),
        [eventId]: score,
      });
      if (bonusPoints != null && bonusPoints > 0 && activeParticipantIds.has(participantId)) {
        bonusEventsByProfile.set(profileId, {
          ...(bonusEventsByProfile.get(profileId) || {}),
          [eventId]: bonusPoints,
        });
      }
    }
  }

  return {
    hasDiscussionEvents: true,
    scoresByProfile: new Map([...scoreEventsByProfile.entries()].map(([profileId, events]) => [profileId, averageScoreRecord(events)])),
    bonusByProfile: new Map([...bonusEventsByProfile.entries()].map(([profileId, events]) => [profileId, sumScoreRecord(events)])),
    scoreEventsByProfile,
    bonusEventsByProfile,
  };
}

export function isCourseAssignedToCustomer(course: SuniTrainingCourse | null | undefined, profileId: string | null | undefined) {
  const normalizedProfileId = String(profileId || '').trim();
  if (!course || !normalizedProfileId) return false;
  return (course.customerViewerProfileIds || []).some((viewerId) => viewerId === normalizedProfileId);
}

export function isClassAssignedToCustomer(klass: SuniTrainingClass | null | undefined, profileId: string | null | undefined) {
  const normalizedProfileId = String(profileId || '').trim();
  if (!klass || !normalizedProfileId) return false;
  return (
    (klass.customerViewerProfileIds || []).some((viewerId) => viewerId === normalizedProfileId) ||
    isCourseAssignedToCustomer(klass.course, normalizedProfileId)
  );
}

function parseDelimitedRows(text: string) {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[,\t;]/).map((cell) => cell.trim()));
}

function normalizeImportHeader(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function normalizeImportEmail(value: string) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function normalizeImportGroup(value: string) {
  const raw = String(value || '').trim();
  const numericMatch = raw.match(/\d+/);
  return numericMatch ? numericMatch[0] : raw;
}

function getImportEmailError(email: string) {
  if (!email) return 'Thiếu email';
  const atCount = (email.match(/@/g) || []).length;
  if (atCount === 0) return 'Email thiếu ký tự @';
  if (atCount > 1) return 'Email có nhiều ký tự @';
  const [localPart, domain] = email.split('@');
  if (!localPart) return 'Email thiếu phần trước @';
  if (!domain) return 'Email thiếu tên miền sau @';
  if (!domain.includes('.')) return 'Email thiếu dấu chấm trong tên miền';
  if (domain.startsWith('.') || domain.endsWith('.')) return 'Email tên miền không hợp lệ';
  if (/[^\w.!#$%&'*+/=?^`{|}~@-]/.test(email)) return 'Email có ký tự không hợp lệ';
  return '';
}

export function parseSuniClassStudentImportRows(rawRows: unknown[][], existingEmails: string[] = []): SuniClassStudentImportRow[] {
  const rows = rawRows
    .map((row) => row.map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some(Boolean));
  if (!rows.length) return [];
  const header = rows[0].map(normalizeImportHeader);
  const hasHeader = header.some((cell) => ['email', 'full_name', 'ho_ten', 'name', 'nhom', 'group', 'don_vi', 'department'].includes(cell));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const indexOf = (...keys: string[]) => {
    const found = keys.map((key) => header.indexOf(key)).find((index) => index != null && index >= 0);
    return found == null ? -1 : found;
  };
  const fullNameIndex = hasHeader ? indexOf('ho_ten', 'full_name', 'name', 'ten_hoc_vien') : 0;
  const groupIndex = hasHeader ? indexOf('nhom', 'group', 'group_name', 'student_group') : 1;
  const emailIndex = hasHeader ? indexOf('email', 'mail') : 2;
  const departmentIndex = hasHeader ? indexOf('don_vi', 'department', 'phong_ban') : 3;
  const positionIndex = hasHeader ? indexOf('chuc_vu', 'position', 'chuc_danh') : 4;
  const codeIndex = hasHeader ? indexOf('employee_code', 'student_code', 'ma_hoc_vien', 'ma_nv') : -1;
  const seenEmails = new Set<string>();
  const existingEmailSet = new Set(existingEmails.map(normalizeImportEmail).filter(Boolean));
  return dataRows.map((cells, index) => {
    const fullName = String(cells[fullNameIndex] || '').trim();
    const rawGroupName = groupIndex >= 0 ? String(cells[groupIndex] || '').trim() : '';
    const groupName = normalizeImportGroup(rawGroupName);
    const email = normalizeImportEmail(cells[emailIndex] || '');
    const studentCode = codeIndex >= 0 ? String(cells[codeIndex] || '').trim() : '';
    const department = departmentIndex >= 0 ? String(cells[departmentIndex] || '').trim() : '';
    const position = positionIndex >= 0 ? String(cells[positionIndex] || '').trim() : '';
    const emailError = getImportEmailError(email);
    const isDuplicateInFile = email ? seenEmails.has(email) : false;
    const isDuplicateInClass = email ? existingEmailSet.has(email) : false;
    if (email) seenEmails.add(email);
    const errors = [
      !fullName ? 'Thiếu họ tên' : '',
      !groupName ? 'Thiếu nhóm' : '',
      groupName && !/^\d+$/.test(groupName) ? 'Nhóm phải là số' : '',
      emailError,
      !department ? 'Thiếu đơn vị' : '',
      !position ? 'Thiếu chức vụ' : '',
      isDuplicateInFile ? 'Email trùng trong file import' : '',
      isDuplicateInClass ? '' : '',
    ].filter(Boolean);
    return {
      rowNumber: (hasHeader ? 2 : 1) + index,
      fullName,
      groupName,
      email,
      studentCode,
      department,
      position,
      status: errors.length ? 'error' : 'ready',
      message: errors.join(', '),
    };
  });
}

export function parseSuniClassStudentImport(text: string, existingEmails: string[] = []): SuniClassStudentImportRow[] {
  return parseSuniClassStudentImportRows(parseDelimitedRows(text), existingEmails);
}

function toProgramRow(payload: SuniProgramPayload) {
  const id = payload.id || fallbackId(payload.code || payload.name, 'program');
  return {
    id,
    code: payload.code.trim(),
    name: payload.name.trim(),
    description: payload.description || '',
    customer_name: payload.customerName || '',
    execution_year: payload.executionYear,
    planned_course_count: payload.plannedCourseCount || 0,
    owner_profile_id: payload.ownerId,
    learner_group: payload.learnerGroup || 'staff',
    status: payload.status || 'not_started',
    updated_at: new Date().toISOString(),
  };
}

function normalizeDate(value?: string | null) {
  return value ? value : null;
}

function toCourseRow(payload: SuniCoursePayload) {
  const id = payload.id || fallbackId(payload.code || payload.title, 'course');
  return {
    id,
    code: payload.code.trim(),
    title: payload.title.trim(),
    description: payload.description || '',
    objective: payload.objective || '',
    customer_name: payload.customerName || '',
    coordinator_name: payload.coordinatorName || '',
    format: payload.format || 'offline',
    start_at: normalizeDate(payload.startAt),
    end_at: normalizeDate(payload.endAt),
    duration_days: payload.durationDays,
    expected_duration: payload.expectedDuration || '',
    location_type: payload.locationType || 'offline',
    location: payload.location || '',
    online_learning_url: payload.onlineLearningUrl || '',
    target_audience: payload.targetAudience || '',
    planned_class_count: payload.plannedClassCount || 1,
    status: payload.status || 'published',
    updated_at: new Date().toISOString(),
  };
}

function toClassRow(payload: SuniClassPayload) {
  const id = payload.id || fallbackId(payload.code || payload.name, 'class');
  const instructorIds = [...new Set((payload.instructorIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  return {
    id,
    code: payload.code.trim(),
    name: payload.name.trim(),
    description: payload.description || '',
    course_id: payload.courseId || null,
    instructor_profile_id: instructorIds[0] || payload.instructorId || null,
    class_manager_profile_id: payload.classManagerId || null,
    start_at: normalizeDate(payload.startAt),
    end_at: normalizeDate(payload.endAt),
    session_count: payload.sessionCount,
    delivery_mode: payload.deliveryMode || 'offline',
    location_type: payload.locationType || 'offline',
    location: payload.location || '',
    ops_team_name: payload.opsTeamName || '',
    max_learner_count: payload.maxLearnerCount,
    current_learner_count: payload.currentLearnerCount || 0,
    status: payload.status || 'pending',
    updated_at: new Date().toISOString(),
  };
}

async function syncClassInstructorAssignments(classId: string, instructorIds: string[]) {
  const ids = [...new Set(instructorIds.map((value) => String(value || '').trim()).filter(Boolean))];
  const client = requireSupabase();
  const { error: deleteError } = await client
    .from('vcontent_training_class_instructors')
    .delete()
    .eq('class_id', classId);
  if (deleteError) {
    if (/relation .*vcontent_training_class_instructors|does not exist/i.test(deleteError.message)) return;
    throw new SuniApiError(deleteError.message);
  }
  if (!ids.length) return;
  const rows = ids.map((instructorId) => ({
    id: `${classId}-${instructorId}`,
    class_id: classId,
    instructor_profile_id: instructorId,
    role: 'instructor',
    updated_at: new Date().toISOString(),
  }));
  const { error } = await client.from('vcontent_training_class_instructors').upsert(rows, { onConflict: 'class_id,instructor_profile_id' });
  if (error) throw new SuniApiError(error.message);
}

async function syncCourseProgramLink(courseId: string, programId?: string | null) {
  const client = requireSupabase();
  const { error: deleteError } = await client
    .from('vcontent_training_program_courses')
    .delete()
    .eq('course_id', courseId);
  if (deleteError) throw new SuniApiError(deleteError.message);
  if (!programId) return;
  const { error } = await client.from('vcontent_training_program_courses').insert({
    id: `${programId}-${courseId}`,
    program_id: programId,
    course_id: courseId,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new SuniApiError(error.message);
}

async function syncSingleClassForCourse(course: SuniCoursePayload, courseId: string) {
  if (Number(course.plannedClassCount || 1) !== 1) return;

  const client = requireSupabase();
  const { data: existingClasses, error: listError } = await client
    .from('vcontent_training_classes')
    .select('id')
    .eq('course_id', courseId)
    .order('created_at', { ascending: true });
  if (listError) throw new SuniApiError(listError.message);

  const classes = existingClasses || [];
  const classDates = {
    start_at: normalizeDate(course.startAt),
    end_at: normalizeDate(course.endAt),
    updated_at: new Date().toISOString(),
  };

  if (classes.length === 1) {
    const { error } = await client
      .from('vcontent_training_classes')
      .update(classDates)
      .eq('id', classes[0].id);
    if (error) throw new SuniApiError(error.message);
    return;
  }

  if (classes.length > 1) return;

  const classCode = `${course.code.trim()}-L01`;
  const classId = fallbackId(classCode, 'class');
  const { error } = await client.from('vcontent_training_classes').insert({
    id: classId,
    code: classCode,
    name: `${course.title.trim()} - Lớp 01`,
    description: course.description || '',
    course_id: courseId,
    start_at: normalizeDate(course.startAt),
    end_at: normalizeDate(course.endAt),
    session_count: null,
    delivery_mode: course.format || 'offline',
    location_type: course.locationType || 'offline',
    location: course.location || '',
    ops_team_name: '',
    max_learner_count: null,
    current_learner_count: 0,
    status: 'pending',
    updated_at: new Date().toISOString(),
  });
  if (error) throw new SuniApiError(error.message);
}

export const suniTrainingApi = {
  async listPrograms() {
    const client = requireSupabase();
    const { data, error } = await withSuniTimeout(client
      .from('vcontent_training_programs')
      .select(TRAINING_PROGRAM_SELECT)
      .order('created_at', { ascending: false }), 'training programs');
    if (error) throw new SuniApiError(error.message);
    return (data || []).map(mapProgramRow);
  },

  async listProgramsByIds(ids: string[]) {
    const programIds = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
    if (!programIds.length) return [] as SuniTrainingProgram[];
    const client = requireSupabase();
    const { data, error } = await withSuniTimeout(client
      .from('vcontent_training_programs')
      .select(TRAINING_PROGRAM_SELECT)
      .in('id', programIds)
      .order('created_at', { ascending: false }), 'training programs by ids');
    if (error) throw new SuniApiError(error.message);
    return (data || []).map(mapProgramRow);
  },

  async listCustomerPrograms(profileId?: string | null) {
    const courses = await this.listCustomerCourses(profileId);
    const programIds = courses.map((course) => course.programId || course.courseProgram?.id || '').filter(Boolean);
    return this.listProgramsByIds(programIds);
  },

  async getProgram(id: string) {
    const programs = await this.listProgramsByIds([id]);
    return programs[0] || null;
  },

  async saveProgram(payload: SuniProgramPayload) {
    const client = requireSupabase();
    const row = toProgramRow(payload);
    const { data, error } = await client
      .from('vcontent_training_programs')
      .upsert(row)
      .select('*,owner_profile:vcontent_profiles!vcontent_training_programs_owner_profile_id_fkey(id,email,full_name,role,active)')
      .single();
    if (error) throw new SuniApiError(error.message);
    return mapProgramRow(data);
  },

  async deleteProgram(id: string) {
    const client = requireSupabase();
    const { error } = await client.from('vcontent_training_programs').delete().eq('id', id);
    if (error) throw new SuniApiError(error.message);
    return { success: true };
  },

  async listUsers() {
    const client = requireSupabase();
    const { data, error } = await withSuniTimeout(client
      .from('vcontent_profiles')
      .select('id,email,full_name,title,role,active')
      .order('full_name', { ascending: true }), 'profiles');
    if (error) throw new SuniApiError(error.message);
    const alwaysVisibleEmails = new Set(['lephunghao64@gmail.com', 'nguyenthuhaxinchao@gmail.com']);
    return (data || [])
      .filter((row: any) => row.active !== false || alwaysVisibleEmails.has(String(row.email || '').trim().toLowerCase()))
      .map(mapProfileRow);
  },

  async listCourses() {
    const client = requireSupabase();
    const { data, error } = await withSuniTimeout(client
      .from('vcontent_training_courses')
      .select(TRAINING_COURSE_SELECT)
      .order('created_at', { ascending: false }), 'training courses');
    if (error) throw new SuniApiError(error.message);
    return (data || []).map(mapCourseRow);
  },

  async listCoursesByIds(ids: string[]) {
    const courseIds = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
    if (!courseIds.length) return [] as SuniTrainingCourse[];
    const client = requireSupabase();
    const { data, error } = await withSuniTimeout(client
      .from('vcontent_training_courses')
      .select(TRAINING_COURSE_SELECT)
      .in('id', courseIds)
      .order('created_at', { ascending: false }), 'training courses by ids');
    if (error) throw new SuniApiError(error.message);
    return (data || []).map(mapCourseRow);
  },

  async listCustomerCourses(profileId?: string | null) {
    const id = String(profileId || '').trim();
    if (!id) return [] as SuniTrainingCourse[];
    const client = requireSupabase();
    const { data, error } = await withSuniTimeout(client
      .from('vcontent_training_courses')
      .select(TRAINING_COURSE_SELECT)
      .order('created_at', { ascending: false }), 'customer training courses');
    if (error) throw new SuniApiError(error.message);
    return (data || []).map(mapCourseRow);
  },

  async getCourse(id: string) {
    const courses = await this.listCoursesByIds([id]);
    return courses[0] || null;
  },

  async listProgramCourses(programId: string) {
    const id = String(programId || '').trim();
    if (!id) return [] as SuniTrainingCourse[];
    const client = requireSupabase();
    const { data: links, error: linkError } = await withSuniTimeout(client
      .from('vcontent_training_program_courses')
      .select('course_id')
      .eq('program_id', id), 'training program course links');
    if (linkError) throw new SuniApiError(linkError.message);
    const linkedCourseIds = [...new Set((links || []).map((row: any) => String(row.course_id || '')).filter(Boolean))];
    const courseById = new Map<string, SuniTrainingCourse>();
    const linkedCourses = linkedCourseIds.length ? await this.listCoursesByIds(linkedCourseIds) : [];
    linkedCourses.forEach((course) => courseById.set(course.id, course));
    return [...courseById.values()]
      .sort((left, right) => String(left.startAt || '').localeCompare(String(right.startAt || '')) || String(left.title || '').localeCompare(String(right.title || ''), 'vi'));
  },

  async saveCourse(payload: SuniCoursePayload) {
    const client = requireSupabase();
    const row = toCourseRow(payload);
    const { data, error } = await client
      .from('vcontent_training_courses')
      .upsert(row)
      .select('*,program_courses:vcontent_training_program_courses(program_id,program:vcontent_training_programs(id,code,name)),classes:vcontent_training_classes(id)')
      .single();
    if (error) throw new SuniApiError(error.message);
    await syncCourseProgramLink(row.id, payload.programId);
    await syncSingleClassForCourse(payload, row.id);
    return mapCourseRow(data);
  },

  async updateCourseCustomerViewers(courseId: string, profileIds: string[]) {
    const client = requireSupabase();
    const course = await this.getCourse(courseId);
    if (!course) throw new SuniApiError('Không tìm thấy khóa đào tạo.');
    const uniqueProfileIds = [...new Set(profileIds.map((id) => String(id || '').trim()).filter(Boolean))];
    const metadata = {
      ...(course.metadata || {}),
      customerViewerProfileIds: uniqueProfileIds,
    };
    const { data, error } = await client
      .from('vcontent_training_courses')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('id', courseId)
      .select('*,program_courses:vcontent_training_program_courses(program_id,program:vcontent_training_programs(id,code,name)),classes:vcontent_training_classes(id)')
      .single();
    if (error) throw new SuniApiError(error.message);
    return mapCourseRow(data);
  },

  async updateClassCustomerViewers(classId: string, profileIds: string[]) {
    const client = requireSupabase();
    const klass = await this.getClass(classId);
    if (!klass) throw new SuniApiError('Không tìm thấy lớp đào tạo.');
    const uniqueProfileIds = [...new Set(profileIds.map((id) => String(id || '').trim()).filter(Boolean))];
    const metadata = {
      ...(klass.metadata || {}),
      customerViewerProfileIds: uniqueProfileIds,
    };
    const { data, error } = await client
      .from('vcontent_training_classes')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('id', classId)
      .select('*,course:vcontent_training_courses(id,code,title,status,customer_name,metadata),instructor_profile:vcontent_profiles!vcontent_training_classes_instructor_profile_id_fkey(id,email,full_name,role,active),class_manager_profile:vcontent_profiles!vcontent_training_classes_class_manager_profile_id_fkey(id,email,full_name,role,active)')
      .single();
    if (error) throw new SuniApiError(error.message);
    return mapClassRow(data);
  },

  async updateClassLessonPlanTopics(classId: string, topics: Array<{ id: string; label: string; title: string; lessonUrl?: string; sortOrder?: number }>) {
    const client = requireSupabase();
    const klass = await this.getClass(classId);
    if (!klass) throw new SuniApiError('Không tìm thấy lớp đào tạo.');
    const lessonPlanTopics = topics
      .map((topic, index) => ({
        id: String(topic.id || '').trim(),
        label: String(topic.label || '').trim(),
        title: String(topic.title || '').trim(),
        lessonUrl: String(topic.lessonUrl || '').trim(),
        sortOrder: Number.isFinite(topic.sortOrder) ? Number(topic.sortOrder) : index + 1,
      }))
      .filter((topic) => topic.id && topic.title);
    const metadata = {
      ...(klass.metadata || {}),
      lessonPlanTopics,
    };
    const { data, error } = await client
      .from('vcontent_training_classes')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('id', classId)
      .select('*,course:vcontent_training_courses(id,code,title,status,customer_name,metadata),instructor_profile:vcontent_profiles!vcontent_training_classes_instructor_profile_id_fkey(id,email,full_name,role,active),class_manager_profile:vcontent_profiles!vcontent_training_classes_class_manager_profile_id_fkey(id,email,full_name,role,active)')
      .single();
    if (error) throw new SuniApiError(error.message);
    return mapClassRow(data);
  },

  async listClassCustomerContacts(classId: string) {
    const client = requireSupabase();
    const klass = await this.getClass(classId);
    const profileIds = klass?.customerViewerProfileIds || [];
    if (!profileIds.length) return [] as SuniUser[];
    const { data, error } = await withSuniTimeout(client
      .from('vcontent_profiles')
      .select('id,email,full_name,role,active')
      .in('id', profileIds)
      .order('full_name', { ascending: true }), 'training class customer contacts');
    if (error) throw new SuniApiError(error.message);
    return (data || []).map(mapProfileRow);
  },

  async createClassCustomerContact(payload: SuniCustomerContactPayload) {
    const client = requireSupabase();
    const klass = await this.getClass(payload.classId);
    if (!klass) throw new SuniApiError('Không tìm thấy lớp đào tạo.');
    const selectedProfileId = String(payload.profileId || '').trim();
    if (selectedProfileId) {
      const { data: selectedProfile, error: selectedError } = await client
        .from('vcontent_profiles')
        .select('id,email,full_name,role,auth_user_id,active')
        .eq('id', selectedProfileId)
        .maybeSingle();
      if (selectedError) throw new SuniApiError(selectedError.message);
      if (!selectedProfile) throw new SuniApiError('Không tìm thấy tài khoản khách hàng đã chọn.');
      const selectedRole = String(selectedProfile.role || '').trim().toLowerCase();
      if (!['client', 'client_director'].includes(selectedRole)) {
        throw new SuniApiError('Chỉ được gán tài khoản có role khách hàng vào đầu mối lớp.');
      }
      if (selectedProfile.active === false) {
        throw new SuniApiError('Tài khoản khách hàng đã chọn đang bị khóa.');
      }
      await this.updateClassCustomerViewers(payload.classId, [...(klass.customerViewerProfileIds || []), selectedProfileId]);
      return {
        profileId: selectedProfileId,
        email: String(selectedProfile.email || ''),
        fullName: String(selectedProfile.full_name || ''),
        authUserId: String(selectedProfile.auth_user_id || ''),
      };
    }
    const email = String(payload.email || '').trim().toLowerCase();
    const fullName = String(payload.fullName || '').trim();
    if (!email) throw new SuniApiError('Cần nhập email đầu mối khách hàng.');
    if (!fullName) throw new SuniApiError('Cần nhập họ tên đầu mối khách hàng.');

    const { data: existingProfiles, error: existingError } = await client
      .from('vcontent_profiles')
      .select('id,email,full_name,role,auth_user_id,active')
      .eq('email', email)
      .limit(1);
    if (existingError) throw new SuniApiError(existingError.message);
    const existingProfile = Array.isArray(existingProfiles) ? existingProfiles[0] : null;
    const existingRole = String(existingProfile?.role || '').trim().toLowerCase();
    if (existingProfile && !['client', 'client_director'].includes(existingRole)) {
      throw new SuniApiError('Email này đang thuộc role khác, không thể gán làm đầu mối khách hàng.');
    }

    const profileId = existingProfile?.id || `CUSTOMER_${Date.now()}`;
    const profileRow = {
      id: profileId,
      email,
      full_name: fullName,
      role: existingProfile?.role || 'client',
      active: true,
      access_scope: 'self',
      title: 'Đầu mối khách hàng',
      updated_at: new Date().toISOString(),
    };
    if (existingProfile?.id) {
      const { error } = await client.from('vcontent_profiles').update(profileRow).eq('id', existingProfile.id);
      if (error) throw new SuniApiError(error.message);
    } else {
      const { error } = await client.from('vcontent_profiles').insert(profileRow);
      if (error) throw new SuniApiError(error.message);
    }

    let authUserId = existingProfile?.auth_user_id ? String(existingProfile.auth_user_id) : '';
    if (!authUserId) {
      const authUser: any = await createImportedStudentAuthUser({
        accessToken: await getSuniAccessToken(),
        email,
        password: payload.password || '123456',
        fullName,
        profileId,
      });
      authUserId = String(authUser?.id || authUser?.user?.id || '');
      if (authUserId) {
        const { error } = await client
          .from('vcontent_profiles')
          .update({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
          .eq('id', profileId);
        if (error) throw new SuniApiError(error.message);
      }
    }

    await this.updateClassCustomerViewers(payload.classId, [...(klass.customerViewerProfileIds || []), profileId]);
    return { profileId, email, fullName, authUserId };
  },

  async deleteCourse(id: string) {
    const client = requireSupabase();
    const { error } = await client.from('vcontent_training_courses').delete().eq('id', id);
    if (error) throw new SuniApiError(error.message);
    return { success: true };
  },

  async listClasses() {
    const client = requireSupabase();
    const { data, error } = await withSuniTimeout(client
      .from('vcontent_training_classes')
      .select(TRAINING_CLASS_SELECT)
      .order('created_at', { ascending: false }), 'training classes');
    if (error) throw new SuniApiError(error.message);
    const classes = (data || []).map(mapClassRow);
    const assignments = await this.listClassInstructorAssignments(classes.map((klass) => klass.id));
    return classes.map((klass) => mergeClassInstructors(klass, assignments));
  },

  async listClassesByIds(ids: string[]) {
    const classIds = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
    if (!classIds.length) return [] as SuniTrainingClass[];
    const client = requireSupabase();
    const { data, error } = await withSuniTimeout(client
      .from('vcontent_training_classes')
      .select(TRAINING_CLASS_SELECT)
      .in('id', classIds)
      .order('created_at', { ascending: false }), 'training classes by ids');
    if (error) throw new SuniApiError(error.message);
    const classes = (data || []).map(mapClassRow);
    const assignments = await this.listClassInstructorAssignments(classes.map((klass) => klass.id));
    return classes.map((klass) => mergeClassInstructors(klass, assignments));
  },

  async listClassInstructorAssignments(classIds: string[]) {
    const ids = [...new Set(classIds.map((id) => String(id || '').trim()).filter(Boolean))];
    if (!ids.length) return [] as SuniTrainingClassInstructor[];
    const client = requireSupabase();
    const { data, error } = await withSuniTimeout(client
      .from('vcontent_training_class_instructors')
      .select('id,class_id,instructor_profile_id,instructor_profile:vcontent_profiles!vcontent_training_class_instructors_instructor_profile_id_fkey(id,email,full_name,role,active)')
      .in('class_id', ids)
      .order('created_at', { ascending: true }), 'training class instructors');
    if (error) {
      if (/relation .*vcontent_training_class_instructors|does not exist/i.test(error.message)) return [] as SuniTrainingClassInstructor[];
      throw new SuniApiError(error.message);
    }
    return (data || []).map(mapClassInstructorRow);
  },

  async listInstructorClasses(profileId?: string | null) {
    const instructorProfileId = String(profileId || '').trim();
    if (!instructorProfileId) return [] as SuniTrainingClass[];
    const client = requireSupabase();
    const { data: assignmentRows, error: assignmentError } = await withSuniTimeout(client
      .from('vcontent_training_class_instructors')
      .select('class_id')
      .eq('instructor_profile_id', instructorProfileId)
      .order('created_at', { ascending: false }), 'instructor training class assignments');
    if (assignmentError && !/relation .*vcontent_training_class_instructors|does not exist/i.test(assignmentError.message)) {
      throw new SuniApiError(assignmentError.message);
    }
    const assignedClassIds = [...new Set((assignmentRows || []).map((row: any) => String(row.class_id || '')).filter(Boolean))];
    if (assignedClassIds.length) return this.listClassesByIds(assignedClassIds);

    const { data, error } = await withSuniTimeout(client
      .from('vcontent_training_classes')
      .select(TRAINING_CLASS_SELECT)
      .eq('instructor_profile_id', instructorProfileId)
      .order('created_at', { ascending: false }), 'instructor training classes');
    if (error) throw new SuniApiError(error.message);
    return (data || []).map(mapClassRow);
  },

  async listCustomerClasses(profileId?: string | null, courseIds: string[] = []) {
    const id = String(profileId || '').trim();
    let allowedCourseIds = [...new Set(courseIds.map((courseId) => String(courseId || '').trim()).filter(Boolean))];
    if (id && !allowedCourseIds.length) {
      const courses = await this.listCustomerCourses(id);
      allowedCourseIds = courses.map((course) => course.id);
    }
    if (!id && !allowedCourseIds.length) return [] as SuniTrainingClass[];
    const client = requireSupabase();
    let query = client
      .from('vcontent_training_classes')
      .select(TRAINING_CLASS_SELECT)
      .order('created_at', { ascending: false });
    if (!id && allowedCourseIds.length) query = query.in('course_id', allowedCourseIds);
    const { data, error } = await withSuniTimeout(query, 'customer training classes');
    if (error) throw new SuniApiError(error.message);
    return (data || []).map(mapClassRow);
  },

  async getClass(id: string) {
    const client = requireSupabase();
    const { data, error } = await withSuniTimeout(client
      .from('vcontent_training_classes')
      .select(TRAINING_CLASS_SELECT)
      .eq('id', id)
      .maybeSingle(), 'training class detail');
    if (error) throw new SuniApiError(error.message);
    if (!data) return null;
    const klass = mapClassRow(data);
    const assignments = await this.listClassInstructorAssignments([klass.id]);
    return mergeClassInstructors(klass, assignments);
  },

  async listCourseClasses(courseId: string) {
    const client = requireSupabase();
    const { data, error } = await withSuniTimeout(client
      .from('vcontent_training_classes')
      .select(TRAINING_CLASS_SELECT)
      .eq('course_id', courseId), 'training course classes');
    if (error) throw new SuniApiError(error.message);
    const classes = (data || []).map(mapClassRow);
    const assignments = await this.listClassInstructorAssignments(classes.map((klass) => klass.id));
    return classes
      .map((klass) => mergeClassInstructors(klass, assignments))
      .sort((left, right) => String(left.startAt || '').localeCompare(String(right.startAt || '')) || String(left.name || '').localeCompare(String(right.name || ''), 'vi'));
  },

  async listStudentClasses(_profile: { id?: string | null; email?: string | null; studentCode?: string | null; studentClass?: string | null; studentGroup?: string | null }) {
    const client = requireSupabase();
    const { data, error } = await withSuniTimeout(
      client.rpc('vtraining_get_learner_dashboard'),
      'student training dashboard',
    );
    if (error) throw new SuniApiError(error.message);
    return (Array.isArray(data) ? data : []).slice(0, 100).map(mapClassRow);
  },

  async listClassStudents(classIds: string[], scope?: { profileId?: string | null; email?: string | null }) {
    const ids = [...new Set(classIds.map((id) => String(id || '').trim()).filter(Boolean))];
    if (!ids.length) return [] as SuniClassStudent[];
    const client = requireSupabase();
    const { data: classRows, error: classError } = await withSuniTimeout(client
      .from('vcontent_training_classes')
      .select(TRAINING_CLASS_SELECT)
      .in('id', ids), 'training class student context');
    if (classError) throw new SuniApiError(classError.message);
    const classes = (classRows || []).map(mapClassRow);
    const classById = new Map(classes.map((klass) => [klass.id, klass]));
    const profileId = String(scope?.profileId || '').trim();
    const email = String(scope?.email || '').trim().toLowerCase();
    let nativeQuery = client
      .from('vcontent_training_class_students')
      .select('*')
      .in('class_id', ids)
      .order('full_name', { ascending: true });
    if (profileId && email) {
      nativeQuery = nativeQuery.or(`profile_id.eq.${profileId},email.eq.${email}`);
    } else if (profileId) {
      nativeQuery = nativeQuery.eq('profile_id', profileId);
    } else if (email) {
      nativeQuery = nativeQuery.eq('email', email);
    }
    const { data: nativeRows, error: nativeError } = await withSuniTimeout(nativeQuery, scope ? 'training class student self' : 'training class students');
    if (!nativeError && Array.isArray(nativeRows) && nativeRows.length) {
      return nativeRows
        .map((row: any) => mapClassStudentRow(row, classById.get(String(row.class_id || ''))))
        .filter((student) => student.email || student.studentCode || student.fullName);
    }

    let enrollmentQuery = client
      .from('vcontent_eln_enrollments')
      .select('class_id,user_id,student:vcontent_eln_students(id,user_id,email,full_name,employee_code,status)')
      .in('class_id', ids);
    if (email) {
      enrollmentQuery = enrollmentQuery.eq('student.email', email);
    }
    const { data: enrollments, error: enrollmentError } = await withSuniTimeout(enrollmentQuery, scope ? 'class enrollment self' : 'class enrollments');
    if (!enrollmentError && Array.isArray(enrollments) && enrollments.length) {
      return enrollments
        .map((row: any) => mapClassStudentRow(row, classById.get(String(row.class_id || ''))))
        .filter((student) => student.email || student.studentCode || student.fullName);
    }

    const selectedClasses = ids.map((id) => classById.get(id)).filter(Boolean) as SuniTrainingClass[];
    const classNames = selectedClasses.flatMap((klass) => [klass.code, klass.name].map((value) => String(value || '').trim()).filter(Boolean));
    if (!classNames.length) return [] as SuniClassStudent[];
    const profileScopeFilter = [`id.eq.${profileId}`, `email.eq.${email}`].filter((part) => !part.endsWith('.eq.')).join(',');
    let classProfileQuery = client
      .from('vcontent_profiles')
      .select('id,email,full_name,student_code,student_class,student_group,title,auth_user_id')
      .in('student_class', classNames);
    let groupProfileQuery = client
      .from('vcontent_profiles')
      .select('id,email,full_name,student_code,student_class,student_group,title,auth_user_id')
      .in('student_group', classNames);
    if (profileScopeFilter) {
      classProfileQuery = classProfileQuery.or(profileScopeFilter);
      groupProfileQuery = groupProfileQuery.or(profileScopeFilter);
    }
    const [classProfilesResult, groupProfilesResult] = await Promise.all([
      withSuniTimeout(classProfileQuery, scope ? 'class profile self by student_class' : 'class profiles by student_class'),
      withSuniTimeout(groupProfileQuery, scope ? 'class profile self by student_group' : 'class profiles by student_group'),
    ]);
    if (classProfilesResult.error) throw new SuniApiError(classProfilesResult.error.message);
    if (groupProfilesResult.error) throw new SuniApiError(groupProfilesResult.error.message);
    const profileById = new Map<string, any>();
    [...(classProfilesResult.data || []), ...(groupProfilesResult.data || [])].forEach((profile: any) => {
      profileById.set(String(profile.id || ''), profile);
    });
    const profiles = [...profileById.values()];
    return (profiles || []).map((profile: any) => {
      const matchedClass = selectedClasses.find((klass) =>
        [klass.code, klass.name].some((value) => value && (value === profile.student_class || value === profile.student_group)),
      );
      return {
        id: String(profile.id || ''),
        profileId: profile.id || null,
        userId: profile.auth_user_id || null,
        email: profile.email || null,
        fullName: profile.full_name || profile.email || 'Hoc vien',
        studentCode: profile.student_code || null,
        classId: matchedClass?.id || null,
        classCode: matchedClass?.code || null,
        className: matchedClass?.name || null,
        groupName: profile.student_group || null,
        department: null,
        position: profile.title || null,
      };
    });
  },

  async listClassStudentsFast(classId: string, scope?: { profileId?: string | null; email?: string | null }) {
    const id = String(classId || '').trim();
    if (!id) return [] as SuniClassStudent[];
    const client = requireSupabase();
    const profileId = String(scope?.profileId || '').trim();
    const email = String(scope?.email || '').trim().toLowerCase();
    let query = client
      .from('vcontent_training_class_students')
      .select('*')
      .eq('class_id', id)
      .order('full_name', { ascending: true });
    if (profileId && email) {
      query = query.or(`profile_id.eq.${profileId},email.eq.${email}`);
    } else if (profileId) {
      query = query.eq('profile_id', profileId);
    } else if (email) {
      query = query.eq('email', email);
    }
    const { data, error } = await withSuniTimeout(query, scope ? 'training class student self fast' : 'training class students fast');
    if (error) throw new SuniApiError(error.message);
    if (Array.isArray(data) && data.length) {
      return data
        .map((row: any) => mapClassStudentRow(row))
        .filter((student) => student.email || student.studentCode || student.fullName);
    }
    return this.listClassStudents([id], scope);
  },

  async saveClass(payload: SuniClassPayload) {
    const client = requireSupabase();
    const row = toClassRow(payload);
    const { data, error } = await client
      .from('vcontent_training_classes')
      .upsert(row)
      .select('*,course:vcontent_training_courses(id,code,title,status,customer_name,metadata),instructor_profile:vcontent_profiles!vcontent_training_classes_instructor_profile_id_fkey(id,email,full_name,role,active),class_manager_profile:vcontent_profiles!vcontent_training_classes_class_manager_profile_id_fkey(id,email,full_name,role,active)')
      .single();
    if (error) throw new SuniApiError(error.message);
    const instructorIds = [...new Set([...(payload.instructorIds || []), payload.instructorId].map((value) => String(value || '').trim()).filter(Boolean))];
    await syncClassInstructorAssignments(row.id, instructorIds);
    const assignments = await this.listClassInstructorAssignments([row.id]);
    return mergeClassInstructors(mapClassRow(data), assignments);
  },

  async listInstructorLessonGrants(input: { profileId?: string | null; classId?: string | null } = {}) {
    const client = requireSupabase();
    let query = client
      .from('vcontent_training_instructor_lesson_grants')
      .select('id,class_id,course_id,lesson_plan_id,instructor_profile_id')
      .order('lesson_plan_id', { ascending: true });
    if (input.profileId) query = query.eq('instructor_profile_id', input.profileId);
    if (input.classId) query = query.eq('class_id', input.classId);
    const { data, error } = await withSuniTimeout(query, 'training instructor lesson grants');
    if (error) {
      if (/relation .*vcontent_training_instructor_lesson_grants|does not exist/i.test(error.message)) return [] as SuniInstructorLessonGrant[];
      throw new SuniApiError(error.message);
    }
    return hydrateInstructorLessonGrantRows(data || []);
  },

  async replaceClassInstructorLessonGrants(input: {
    classId: string;
    courseId?: string | null;
    grants: Array<{ instructorProfileId: string; lessonPlanIds: string[] }>;
  }) {
    const classId = String(input.classId || '').trim();
    if (!classId) return [] as SuniInstructorLessonGrant[];
    const client = requireSupabase();
    const { error: deleteError } = await client
      .from('vcontent_training_instructor_lesson_grants')
      .delete()
      .eq('class_id', classId);
    if (deleteError) {
      if (/relation .*vcontent_training_instructor_lesson_grants|does not exist/i.test(deleteError.message)) return [] as SuniInstructorLessonGrant[];
      throw new SuniApiError(deleteError.message);
    }
    const rows = input.grants.flatMap((grant) => {
      const instructorProfileId = String(grant.instructorProfileId || '').trim();
      if (!instructorProfileId) return [];
      return [...new Set(grant.lessonPlanIds.map((id) => String(id || '').trim()).filter(Boolean))].map((lessonPlanId) => ({
        id: `${classId}-${instructorProfileId}-${lessonPlanId}`,
        class_id: classId,
        course_id: input.courseId || null,
        lesson_plan_id: lessonPlanId,
        instructor_profile_id: instructorProfileId,
        updated_at: new Date().toISOString(),
      }));
    });
    if (!rows.length) return [] as SuniInstructorLessonGrant[];
    const { data, error } = await client
      .from('vcontent_training_instructor_lesson_grants')
      .upsert(rows, { onConflict: 'class_id,lesson_plan_id,instructor_profile_id' })
      .select('id,class_id,course_id,lesson_plan_id,instructor_profile_id');
    if (error) throw new SuniApiError(error.message);
    return hydrateInstructorLessonGrantRows(data || []);
  },

  async importClassStudents(payload: SuniClassStudentImportPayload) {
    const klass = await this.getClass(payload.classId);
    if (!klass) throw new SuniApiError('Không tìm thấy lớp đào tạo.');
    const rows = payload.rows.filter((row) => row.status !== 'error');
    if (!rows.length) throw new SuniApiError('Không có dòng học viên hợp lệ để import.');
    const client = requireSupabase();
    const emails = rows.map((row) => row.email).filter(Boolean);
    const { data: existingClassRows, error: existingClassError } = await client
      .from('vcontent_training_class_students')
      .select('*')
      .eq('class_id', payload.classId);
    if (existingClassError) throw new SuniApiError(existingClassError.message);
    const classStudentByEmail = new Map<string, any>((existingClassRows || [])
      .filter((student: any) => student.email)
      .map((student: any) => [String(student.email || '').toLowerCase(), student]));
    const classStudentByCode = new Map<string, any>((existingClassRows || [])
      .filter((student: any) => student.student_code)
      .map((student: any) => [String(student.student_code || '').toLowerCase(), student]));
    const existingProfileIds = [...new Set((existingClassRows || []).map((student: any) => String(student.profile_id || '')).filter(Boolean))];
    const { data: existingProfiles, error: existingError } = emails.length
      ? await client.from('vcontent_profiles').select('id,email,auth_user_id').in('email', emails)
      : { data: [], error: null } as any;
    if (existingError) throw new SuniApiError(existingError.message);
    const { data: classProfiles, error: classProfilesError } = existingProfileIds.length
      ? await client.from('vcontent_profiles').select('id,email,auth_user_id').in('id', existingProfileIds)
      : { data: [], error: null } as any;
    if (classProfilesError) throw new SuniApiError(classProfilesError.message);
    const existingByEmail = new Map<string, { id: string; email: string; authUserId: string }>((existingProfiles || []).map((profile: any) => [
      String(profile.email || '').toLowerCase(),
      {
        id: String(profile.id || ''),
        email: String(profile.email || '').toLowerCase(),
        authUserId: profile.auth_user_id ? String(profile.auth_user_id) : '',
      },
    ]));
    const profileById = new Map<string, { id: string; email: string; authUserId: string }>((classProfiles || []).map((profile: any) => [
      String(profile.id || ''),
      {
        id: String(profile.id || ''),
        email: String(profile.email || '').toLowerCase(),
        authUserId: profile.auth_user_id ? String(profile.auth_user_id) : '',
      },
    ]));
    const now = Date.now();
    const classLabel = klass.code || klass.name || klass.id;
    const shouldCreateAuthUsers = payload.createAuthUsers !== false;
    const defaultPassword = payload.initialPassword || '123456';
    const accessToken = shouldCreateAuthUsers ? await getSuniAccessToken() : '';
    let authCreatedCount = 0;
    await Promise.all(rows.map(async (row, index) => {
      const matchedClassStudent = (row.email ? classStudentByEmail.get(row.email.toLowerCase()) : null)
        || (row.studentCode ? classStudentByCode.get(row.studentCode.toLowerCase()) : null);
      const existingProfile = (matchedClassStudent?.profile_id ? profileById.get(String(matchedClassStudent.profile_id)) : null)
        || (row.email ? existingByEmail.get(row.email) : null);
      const existingId = existingProfile?.id || '';
      const profileUsingNewEmail = row.email ? existingByEmail.get(row.email) : null;
      if (matchedClassStudent?.profile_id && profileUsingNewEmail?.id && profileUsingNewEmail.id !== String(matchedClassStudent.profile_id)) {
        throw new SuniApiError(`Email ${row.email} đang thuộc một profile khác.`);
      }
      const studentId = matchedClassStudent?.id || `${payload.classId}-${sanitizeId(row.email || row.studentCode || row.fullName) || `student-${index + 1}`}`;
      const profileRow = {
        id: existingId || `PROFILE_${now}_${index + 1}`,
        email: row.email || `${row.studentCode || `student-${now}-${index + 1}`}@no-email.local`,
        full_name: row.fullName,
        role: 'hoc_vien',
        active: true,
        access_scope: 'self',
        student_class: classLabel,
        student_group: row.groupName || klass.name || classLabel,
        student_code: row.studentCode || null,
        title: row.position || null,
      };
      if (existingId) {
        const { error } = await client.from('vcontent_profiles').update(profileRow).eq('id', existingId);
        if (error) throw new SuniApiError(error.message);
      } else {
        const { error } = await client.from('vcontent_profiles').insert(profileRow);
        if (error) throw new SuniApiError(error.message);
      }
      let authUserId = existingProfile?.authUserId || '';
      if (shouldCreateAuthUsers && row.email && authUserId && existingProfile?.email && existingProfile.email !== row.email) {
        await updateImportedStudentAuthUser({
          accessToken,
          userId: authUserId,
          email: row.email,
          fullName: row.fullName,
        });
      }
      if (shouldCreateAuthUsers && row.email && !authUserId) {
        const authUser: any = await createImportedStudentAuthUser({
          accessToken,
          email: row.email,
          password: defaultPassword,
          fullName: row.fullName,
          profileId: existingId || profileRow.id,
        });
        authUserId = String(authUser?.id || authUser?.user?.id || '');
        if (authUserId) {
          const { error } = await client
            .from('vcontent_profiles')
            .update({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
            .eq('id', existingId || profileRow.id);
          if (error) throw new SuniApiError(error.message);
        }
        authCreatedCount += 1;
      }
      const studentEmail = row.email || `${row.studentCode || `student-${now}-${index + 1}`}@no-email.local`;
      const classStudentRow = {
        id: studentId,
        class_id: payload.classId,
        profile_id: existingId || profileRow.id,
        email: studentEmail,
        full_name: row.fullName,
        student_code: row.studentCode || '',
        group_name: row.groupName || '',
        department: row.department || '',
        position: row.position || '',
        status: 'active',
        metadata: { source: 'class-detail-import' },
        updated_at: new Date().toISOString(),
      };
      const { error: classStudentError } = await client
        .from('vcontent_training_class_students')
        .upsert(classStudentRow, { onConflict: 'class_id,email' });
      if (classStudentError) throw new SuniApiError(classStudentError.message);
    }));
    const { count, error: countError } = await client
      .from('vcontent_training_class_students')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', payload.classId);
    if (countError) throw new SuniApiError(countError.message);
    const { error: classCountError } = await client
      .from('vcontent_training_classes')
      .update({
        current_learner_count: count ?? rows.length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payload.classId);
    if (classCountError) throw new SuniApiError(classCountError.message);
    return { importedCount: rows.length, authCreatedCount };
  },

  async updateClassStudent(payload: SuniClassStudentUpdatePayload) {
    const client = requireSupabase();
    const email = normalizeImportEmail(payload.email);
    const fullName = String(payload.fullName || '').trim();
    const groupName = normalizeImportGroup(payload.groupName || '');
    if (!fullName) throw new SuniApiError('Cần nhập họ tên học viên.');
    if (!groupName) throw new SuniApiError('Cần nhập nhóm học viên.');
    if (email) {
      const emailError = getImportEmailError(email);
      if (emailError) throw new SuniApiError(emailError);
    }

    const { data: current, error: currentError } = await client
      .from('vcontent_training_class_students')
      .select('*')
      .eq('id', payload.id)
      .eq('class_id', payload.classId)
      .maybeSingle();
    if (currentError) throw new SuniApiError(currentError.message);
    if (!current) throw new SuniApiError('Không tìm thấy học viên trong lớp.');

    const profileId = String(current.profile_id || '');
    const { data: profile, error: profileError } = profileId
      ? await client.from('vcontent_profiles').select('id,email,full_name,auth_user_id,role').eq('id', profileId).maybeSingle()
      : { data: null, error: null } as any;
    if (profileError) throw new SuniApiError(profileError.message);
    const authUserId = profile?.auth_user_id ? String(profile.auth_user_id) : '';
    if (!email && authUserId) throw new SuniApiError('Không thể để trống email khi học viên đang có tài khoản đăng nhập.');

    if (email) {
      const { data: duplicateClassRows, error: duplicateClassError } = await client
        .from('vcontent_training_class_students')
        .select('id')
        .eq('class_id', payload.classId)
        .eq('email', email)
        .neq('id', payload.id)
        .limit(1);
      if (duplicateClassError) throw new SuniApiError(duplicateClassError.message);
      if ((duplicateClassRows || []).length) throw new SuniApiError('Email này đã có trong lớp.');

      if (profileId) {
        const { data: duplicateProfiles, error: duplicateProfileError } = await client
          .from('vcontent_profiles')
          .select('id')
          .eq('email', email)
          .neq('id', profileId)
          .limit(1);
        if (duplicateProfileError) throw new SuniApiError(duplicateProfileError.message);
        if ((duplicateProfiles || []).length) throw new SuniApiError('Email này đang thuộc một profile khác.');
      }
    }

    const previousEmail = String(current.email || profile?.email || '').toLowerCase();
    if (authUserId && email && email !== previousEmail) {
      await updateImportedStudentAuthUser({
        accessToken: await getSuniAccessToken(),
        userId: authUserId,
        email,
        fullName,
      });
    }

    if (profileId) {
      const { error } = await client
        .from('vcontent_profiles')
        .update({
          email: email || profile?.email || current.email || '',
          full_name: fullName,
          student_group: groupName,
          student_code: payload.studentCode || current.student_code || null,
          title: payload.position || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profileId);
      if (error) throw new SuniApiError(error.message);
    }

    const row = {
      email: email || current.email || '',
      full_name: fullName,
      student_code: payload.studentCode ?? current.student_code ?? '',
      group_name: groupName,
      department: payload.department || '',
      position: payload.position || '',
      status: payload.status || current.status || 'active',
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from('vcontent_training_class_students')
      .update(row)
      .eq('id', payload.id)
      .select('*')
      .single();
    if (error) throw new SuniApiError(error.message);

    if (profileId) {
      await Promise.all([
        client.from('vcontent_discussion_participants').update({
          email: row.email,
          full_name: fullName,
          student_code: row.student_code,
          group_name: groupName,
        }).eq('profile_id', profileId),
        client.from('vcontent_quiz_submissions').update({
          email: row.email,
          respondent_name: fullName,
        }).eq('student_profile_id', profileId),
      ]);
    }

    return mapClassStudentRow(data);
  },

  async updateClassStudentsGroup(input: { classId: string; studentIds: string[]; groupName: string }) {
    const client = requireSupabase();
    const ids = [...new Set(input.studentIds.map((id) => String(id || '').trim()).filter(Boolean))];
    const groupName = normalizeImportGroup(input.groupName || '');
    if (!ids.length) return { updatedCount: 0 };
    if (!groupName) throw new SuniApiError('Cần nhập nhóm mới.');
    const { error } = await client
      .from('vcontent_training_class_students')
      .update({ group_name: groupName, updated_at: new Date().toISOString() })
      .eq('class_id', input.classId)
      .in('id', ids);
    if (error) throw new SuniApiError(error.message);
    return { updatedCount: ids.length };
  },

  async deleteClassStudents(input: { classId: string; studentIds: string[] }) {
    const client = requireSupabase();
    const ids = [...new Set(input.studentIds.map((id) => String(id || '').trim()).filter(Boolean))];
    if (!ids.length) return { deletedCount: 0 };
    const { data: rows, error: rowsError } = await client
      .from('vcontent_training_class_students')
      .select('id,profile_id')
      .eq('class_id', input.classId)
      .in('id', ids);
    if (rowsError) throw new SuniApiError(rowsError.message);
    const profileIds = [...new Set((rows || []).map((row: any) => String(row.profile_id || '')).filter(Boolean))];
    const { error } = await client
      .from('vcontent_training_class_students')
      .delete()
      .eq('class_id', input.classId)
      .in('id', ids);
    if (error) throw new SuniApiError(error.message);
    if (profileIds.length) {
      await client
        .from('vcontent_training_results')
        .delete()
        .eq('class_id', input.classId)
        .in('student_profile_id', profileIds);
    }
    const { count } = await client
      .from('vcontent_training_class_students')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', input.classId);
    await client
      .from('vcontent_training_classes')
      .update({ current_learner_count: count || 0, updated_at: new Date().toISOString() })
      .eq('id', input.classId);
    return { deletedCount: ids.length };
  },

  async listClassDiscussions(classId: string) {
    const client = requireSupabase();
    const { data, error } = await withSuniTimeout(client
      .from('vcontent_training_class_discussions')
      .select('*')
      .eq('class_id', classId)
      .order('imported_at', { ascending: false }), 'training class discussions');
    if (error) throw new SuniApiError(error.message);
    return (data || []).map(mapClassDiscussionRow);
  },

  async linkClassDiscussion(payload: { classId: string; discussionEventId: string; sourceDiscussionEventId?: string | null; status?: string; metadata?: Record<string, unknown> }) {
    const client = requireSupabase();
    const row = {
      id: `${payload.classId}-${payload.discussionEventId}`,
      class_id: payload.classId,
      discussion_event_id: payload.discussionEventId,
      source_discussion_event_id: payload.sourceDiscussionEventId || null,
      status: payload.status || 'draft',
      metadata: payload.metadata || {},
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from('vcontent_training_class_discussions')
      .upsert(row, { onConflict: 'class_id,discussion_event_id' })
      .select('*')
      .single();
    if (error) throw new SuniApiError(error.message);
    return mapClassDiscussionRow(data);
  },

  async deleteClassDiscussions(input: { classId: string; discussionEventIds: string[] }) {
    const client = requireSupabase();
    const ids = Array.from(new Set(input.discussionEventIds.filter(Boolean)));
    if (!ids.length) return { deletedCount: 0, unlinkedCount: 0 };

    const { data: events, error: eventError } = await client
      .from('vcontent_discussion_events')
      .select('id, metadata')
      .in('id', ids);
    if (eventError) throw new SuniApiError(eventError.message);

    const classOwnedIds = (events || [])
      .filter((event) => String(event.metadata?.classId || '') === input.classId)
      .map((event) => String(event.id));

    await removeClassDiscussionScores(client, input.classId, ids);

    const { error: linkError } = await client
      .from('vcontent_training_class_discussions')
      .delete()
      .eq('class_id', input.classId)
      .in('discussion_event_id', ids);
    if (linkError) throw new SuniApiError(linkError.message);

    if (classOwnedIds.length) {
      const { error: deleteError } = await client
        .from('vcontent_discussion_events')
        .delete()
        .in('id', classOwnedIds);
      if (deleteError) throw new SuniApiError(deleteError.message);
    }

    return { deletedCount: classOwnedIds.length, unlinkedCount: ids.length - classOwnedIds.length };
  },

  async listAgendas(input: { courseId?: string; classId?: string; includeCourseLevelForClass?: boolean }) {
    const client = requireSupabase();
    let query = client
      .from('vcontent_training_course_agendas')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('session_no', { ascending: true })
      .order('start_time', { ascending: true });
    if (input.courseId) query = query.eq('course_id', input.courseId);
    if (input.classId) {
      query = input.includeCourseLevelForClass && input.courseId
        ? query.or(`class_id.is.null,class_id.eq.${input.classId}`)
        : query.eq('class_id', input.classId);
    } else {
      query = query.is('class_id', null);
    }
    const { data, error } = await withSuniTimeout(query, 'training agendas');
    if (error) throw new SuniApiError(error.message);
    return (data || []).map(mapAgendaRow);
  },

  async saveAgenda(payload: SuniAgendaPayload) {
    const client = requireSupabase();
    const row = {
      ...(payload.id ? { id: payload.id } : {}),
      course_id: payload.courseId,
      class_id: payload.classId || null,
      session_no: payload.sessionNo || 1,
      session_date: payload.sessionDate || null,
      start_time: payload.startTime || null,
      end_time: payload.endTime || null,
      title: payload.title.trim(),
      description: payload.description || '',
      sort_order: payload.sessionNo || 1,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from('vcontent_training_course_agendas')
      .upsert(row)
      .select('*')
      .single();
    if (error) throw new SuniApiError(error.message);
    return mapAgendaRow(data);
  },

  async deleteAgenda(id: string) {
    const client = requireSupabase();
    const { error } = await client.from('vcontent_training_course_agendas').delete().eq('id', id);
    if (error) throw new SuniApiError(error.message);
    return { success: true };
  },

  async listMaterials(input: { courseId?: string; classId?: string; visibleOnly?: boolean; includeCourseLevelForClass?: boolean }) {
    const client = requireSupabase();
    let query = client
      .from('vcontent_training_materials')
      .select('*')
      .order('created_at', { ascending: false });
    if (input.courseId) query = query.eq('course_id', input.courseId);
    if (input.classId) {
      query = input.includeCourseLevelForClass
        ? query.or(`class_id.is.null,class_id.eq.${input.classId}`)
        : query.eq('class_id', input.classId);
    } else {
      query = query.is('class_id', null);
    }
    if (input.visibleOnly) query = query.eq('visible_to_students', true);
    const { data, error } = await withSuniTimeout(query, 'training materials');
    if (error) throw new SuniApiError(error.message);
    return (data || []).map(mapMaterialRow);
  },

  async uploadMaterial(payload: SuniMaterialPayload) {
    const client = requireSupabase();
    const fileName = payload.file.name;
    const safeName = sanitizeStorageSegment(fileName) || `material-${Date.now()}`;
    const objectPath = [
      sanitizeStorageSegment(payload.courseId || '') || 'class-only',
      payload.classId ? sanitizeStorageSegment(payload.classId) : 'course',
      `${Date.now()}-${safeName}`,
    ].join('/');
    const upload = await client.storage.from('training-materials').upload(objectPath, payload.file, {
      contentType: payload.file.type || 'application/octet-stream',
      upsert: true,
    });
    if (upload.error) throw new SuniApiError(upload.error.message);
    const publicUrl = client.storage.from('training-materials').getPublicUrl(objectPath).data.publicUrl;
    const session = await client.auth.getSession();
    const row = {
      course_id: payload.courseId || null,
      class_id: payload.classId || null,
      title: (payload.title || fileName).trim(),
      description: payload.description || '',
      file_name: fileName,
      file_type: payload.file.type || null,
      file_size: payload.file.size,
      storage_bucket: 'training-materials',
      storage_path: objectPath,
      public_url: publicUrl || null,
      visible_to_students: payload.visibleToStudents !== false,
      created_by: session.data.session?.user?.id || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client.from('vcontent_training_materials').insert(row).select('*').single();
    if (error) throw new SuniApiError(error.message);
    return mapMaterialRow(data);
  },

  async createMaterialLink(payload: SuniMaterialLinkPayload) {
    const client = requireSupabase();
    const url = String(payload.url || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new SuniApiError('Link tài liệu phải bắt đầu bằng http:// hoặc https://.');
    }
    const session = await client.auth.getSession();
    const row = {
      course_id: payload.courseId || null,
      class_id: payload.classId || null,
      title: (payload.title || 'Tài liệu học tập').trim(),
      description: payload.description || '',
      file_name: url,
      file_type: 'external-link',
      file_size: null,
      storage_bucket: 'external-link',
      storage_path: '',
      public_url: url,
      visible_to_students: payload.visibleToStudents !== false,
      created_by: session.data.session?.user?.id || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client.from('vcontent_training_materials').insert(row).select('*').single();
    if (error) throw new SuniApiError(error.message);
    return mapMaterialRow(data);
  },

  async updateMaterialVisibility(id: string, visibleToStudents: boolean) {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_training_materials')
      .update({ visible_to_students: visibleToStudents, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new SuniApiError(error.message);
    return mapMaterialRow(data);
  },

  async deleteMaterial(material: SuniTrainingMaterial) {
    const client = requireSupabase();
    if (material.storagePath && !isExternalMaterial(material)) {
      const removed = await client.storage.from(material.storageBucket || 'training-materials').remove([material.storagePath]);
      if (removed.error) throw new SuniApiError(removed.error.message);
    }
    const { error } = await client.from('vcontent_training_materials').delete().eq('id', material.id);
    if (error) throw new SuniApiError(error.message);
    return { success: true };
  },

  async getScoreRule(courseId: string) {
    const client = requireSupabase();
    const { data, error } = await withSuniTimeout(client
      .from('vcontent_training_score_rules')
      .select('*')
      .eq('course_id', courseId)
      .maybeSingle(), 'training score rule');
    if (error) throw new SuniApiError(error.message);
    return data ? mapScoreRuleRow(data) : null;
  },

  async saveScoreRule(payload: SuniScoreRulePayload) {
    const client = requireSupabase();
    const activeComponents = payload.components.filter((component) => Math.max(0, Number(component.weight || 0)) > 0);
    const totalWeight = activeComponents.reduce((sum, component) => sum + Math.max(0, Number(component.weight || 0)), 0);
    if (activeComponents.length && Math.round(totalWeight * 100) / 100 !== 100) {
      throw new SuniApiError('Tổng tỷ trọng điểm phải bằng 100%.');
    }
    const row = {
      course_id: payload.courseId,
      components: activeComponents,
      passing_score: payload.passingScore == null ? null : normalizeScore10(payload.passingScore),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from('vcontent_training_score_rules')
      .upsert(row, { onConflict: 'course_id' })
      .select('*')
      .single();
    if (error) throw new SuniApiError(error.message);
    const rule = mapScoreRuleRow(data);
    const results = await client
      .from('vcontent_training_results')
      .select('id,scores')
      .eq('course_id', payload.courseId);
    if (!results.error && results.data?.length) {
      const now = new Date().toISOString();
      await Promise.all(results.data.map((result: any) => {
        const scores = result?.scores && typeof result.scores === 'object' ? result.scores : {};
        const finalScore = calculateFinalScore(scores, rule);
        return client
          .from('vcontent_training_results')
          .update({
            final_score: finalScore,
            passed: finalScore == null || rule.passingScore == null ? null : finalScore >= rule.passingScore,
            updated_at: now,
          })
          .eq('id', result.id);
      }));
    }
    return rule;
  },

  async listClassActivities(classId: string, visibleOnly = false) {
    const client = requireSupabase();
    if (visibleOnly) {
      const { data: rpcData, error: rpcError } = await client.rpc('vcontent_get_training_class_visible_activities', {
        input_class_id: classId,
      });
      if (!rpcError) {
        const rows = Array.isArray(rpcData) ? rpcData : [];
        return rows.map(mapActivityRow);
      }
    }
    let query = client
      .from('vcontent_training_class_activities')
      .select('*')
      .eq('class_id', classId)
      .order('open_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (visibleOnly) query = query.in('status', ['active', 'published', 'open']);
    const { data, error } = await withSuniTimeout(query, 'training class activities');
    if (error) throw new SuniApiError(error.message);
    return (data || []).map(mapActivityRow);
  },

  async getClassActivity(id: string) {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_training_class_activities')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new SuniApiError(error.message);
    return data ? mapActivityRow(data) : null;
  },

  async saveClassActivity(payload: SuniActivityPayload) {
    const client = requireSupabase();
    const row = {
      ...(payload.id ? { id: payload.id } : {}),
      class_id: payload.classId,
      course_id: payload.courseId || null,
      type: payload.type,
      title: payload.title.trim(),
      description: payload.description || '',
      status: payload.status || 'draft',
      source_id: payload.sourceId || null,
      library_item_id: payload.libraryItemId || null,
      open_at: payload.openAt || null,
      close_at: payload.closeAt || null,
      metadata: payload.metadata || {},
      updated_at: new Date().toISOString(),
    };
    const activityTable = client.from('vcontent_training_class_activities');
    const mutation = !payload.id && payload.sourceId
      ? activityTable.upsert(row, { onConflict: 'class_id,type,source_id' })
      : activityTable.upsert(row);
    const { data, error } = await mutation
      .select('*')
      .single();
    if (error) throw new SuniApiError(error.message);
    return mapActivityRow(data);
  },

  async deleteClassActivity(id: string) {
    const client = requireSupabase();
    const { error } = await client.from('vcontent_training_class_activities').delete().eq('id', id);
    if (error) throw new SuniApiError(error.message);
    return { success: true };
  },

  async listOperationTasks(classId: string) {
    const client = requireSupabase();
    const { data, error } = await withSuniTimeout(client
      .from('vcontent_training_operation_tasks')
      .select('*')
      .eq('class_id', classId)
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }), 'training operation tasks');
    if (error) throw new SuniApiError(error.message);
    return (data || []).map(mapOperationTaskRow);
  },

  listOperationTemplates() {
    return OPERATION_TEMPLATES;
  },

  async applyOperationTemplate(input: { classId: string; templateKey: SuniOperationTemplateKey; ownerProfileId?: string | null; ownerName?: string }) {
    const client = requireSupabase();
    const template = OPERATION_TEMPLATES.find((item) => item.key === input.templateKey);
    if (!template) throw new SuniApiError('Không tìm thấy mẫu vận hành.');
    const klass = await this.getClass(input.classId);
    const existing = await this.listOperationChecklist(input.classId);
    const existingTemplateItems = existing.filter((item) => item.templateKey === input.templateKey);
    if (existingTemplateItems.length) return existingTemplateItems;

    const session = await client.auth.getSession();
    const baseDate = klass?.startAt ? new Date(klass.startAt) : new Date();
    const dueAt = (relativeDay: number) => {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + relativeDay);
      date.setHours(relativeDay < 0 ? 17 : 18, 0, 0, 0);
      return date.toISOString();
    };
    const now = new Date().toISOString();
    const taskRows = template.tasks.map((task, index) => ({
      class_id: input.classId,
      course_id: klass?.courseId || null,
      template_key: template.key,
      template_item_key: task.key,
      title: task.title,
      task_group: task.group,
      phase: task.phase,
      due_at: dueAt(task.relativeDay),
      owner_profile_id: input.ownerProfileId || null,
      owner_name: input.ownerName || task.ownerRole || '',
      priority: task.priority,
      status: 'Chưa bắt đầu',
      requires_evidence: task.requiresEvidence,
      evidence_status: task.requiresEvidence ? 'missing' : 'not_required',
      evidence_type: task.evidenceType || '',
      evidence_url: null,
      note: task.note || '',
      sort_order: index + 1,
      created_by: session.data.session?.user?.id || null,
      updated_by: session.data.session?.user?.id || null,
      updated_at: now,
    }));
    const { data: insertedTasks, error: taskError } = await client
      .from('vcontent_training_operation_tasks')
      .insert(taskRows)
      .select('*');
    if (taskError) throw new SuniApiError(taskError.message);

    const taskByTemplateKey = new Map((insertedTasks || []).map((row: any) => [String(row.template_item_key || ''), row]));
    const checklistRows = template.tasks.flatMap((task, taskIndex) => {
      const taskRow = taskByTemplateKey.get(task.key);
      const checklistItems = task.checklistItems?.length
        ? task.checklistItems
        : [{ key: 'main', title: task.title } satisfies SuniOperationTemplateChecklistItem];
      return checklistItems.map((checklistItem, checklistIndex) => {
        const requiresEvidence = checklistItem.requiresEvidence ?? task.requiresEvidence;
        return {
          class_id: input.classId,
          task_id: taskRow?.id || null,
          template_key: template.key,
          template_item_key: `${task.key}:${checklistItem.key}`,
          phase: task.phase,
          title: checklistItem.title,
          is_done: false,
          owner_profile_id: input.ownerProfileId || null,
          owner_name: input.ownerName || checklistItem.ownerRole || task.ownerRole || '',
          status: 'Chưa bắt đầu',
          priority: checklistItem.priority || task.priority,
          requires_evidence: requiresEvidence,
          evidence_status: requiresEvidence ? 'missing' : 'not_required',
          evidence_type: checklistItem.evidenceType || task.evidenceType || '',
          due_at: dueAt(task.relativeDay),
          note: task.title,
          sort_order: taskIndex * 100 + checklistIndex + 1,
          updated_by: session.data.session?.user?.id || null,
          updated_at: now,
        };
      });
    });
    const { data, error } = await client
      .from('vcontent_training_operation_checklist_items')
      .insert(checklistRows)
      .select('*');
    if (error) throw new SuniApiError(error.message);
    return (data || []).map(mapOperationChecklistRow);
  },

  async saveOperationTask(payload: SuniOperationTaskPayload) {
    const client = requireSupabase();
    const klass = await this.getClass(payload.classId);
    const session = await client.auth.getSession();
    const row = {
      ...(payload.id ? { id: payload.id } : {}),
      class_id: payload.classId,
      course_id: payload.courseId || klass?.courseId || null,
      template_key: payload.templateKey || null,
      template_item_key: payload.templateItemKey || null,
      title: payload.title.trim(),
      task_group: payload.group || '',
      phase: payload.phase || 'PRE',
      due_at: payload.dueAt || null,
      owner_profile_id: payload.ownerProfileId || null,
      owner_name: payload.ownerName || '',
      priority: payload.priority || 'MEDIUM',
      status: payload.status || 'Chưa bắt đầu',
      requires_evidence: payload.requiresEvidence === true,
      evidence_status: payload.requiresEvidence === true ? (payload.evidenceStatus || 'missing') : 'not_required',
      evidence_type: payload.evidenceType || '',
      evidence_url: payload.evidenceUrl || null,
      note: payload.note || '',
      sort_order: payload.sortOrder || 0,
      updated_by: session.data.session?.user?.id || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from('vcontent_training_operation_tasks')
      .upsert(row)
      .select('*')
      .single();
    if (error) throw new SuniApiError(error.message);
    return mapOperationTaskRow(data);
  },

  async deleteOperationTask(id: string) {
    const client = requireSupabase();
    const { error } = await client.from('vcontent_training_operation_tasks').delete().eq('id', id);
    if (error) throw new SuniApiError(error.message);
    return { success: true };
  },

  async listOperationChecklist(classId: string) {
    const client = requireSupabase();
    const { data, error } = await withSuniTimeout(client
      .from('vcontent_training_operation_checklist_items')
      .select('*')
      .eq('class_id', classId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }), 'training operation checklist');
    if (error) throw new SuniApiError(error.message);
    return (data || []).map(mapOperationChecklistRow);
  },

  async saveOperationChecklistItem(payload: SuniOperationChecklistPayload) {
    const client = requireSupabase();
    const session = await client.auth.getSession();
    const row = {
      ...(payload.id ? { id: payload.id } : {}),
      class_id: payload.classId,
      task_id: payload.taskId || null,
      template_key: payload.templateKey || null,
      template_item_key: payload.templateItemKey || null,
      phase: payload.phase,
      title: payload.title.trim(),
      is_done: payload.done === true,
      owner_profile_id: payload.ownerProfileId || null,
      owner_name: payload.ownerName || '',
      status: payload.done === true ? 'Hoàn thành' : (payload.status || 'Chưa bắt đầu'),
      priority: payload.priority || 'MEDIUM',
      requires_evidence: payload.requiresEvidence === true,
      evidence_status: payload.requiresEvidence === true ? (payload.evidenceStatus || 'missing') : 'not_required',
      evidence_type: payload.evidenceType || '',
      due_at: payload.dueAt || null,
      note: payload.note || '',
      sort_order: payload.sortOrder || 0,
      updated_by: session.data.session?.user?.id || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from('vcontent_training_operation_checklist_items')
      .upsert(row)
      .select('*')
      .single();
    if (error) throw new SuniApiError(error.message);
    return mapOperationChecklistRow(data);
  },

  async seedOperationChecklist(classId: string) {
    const client = requireSupabase();
    const existing = await this.listOperationChecklist(classId);
    if (existing.length) return existing;
    const defaults: Array<Omit<SuniOperationChecklistPayload, 'classId'>> = [
      { phase: 'PRE', title: 'Kiểm tra phòng: máy chiếu, micro, loa, WiFi', sortOrder: 1 },
      { phase: 'PRE', title: 'In tài liệu phát tay theo danh sách buổi', sortOrder: 2 },
      { phase: 'PRE', title: 'Setup bàn ghế theo layout yêu cầu', sortOrder: 3 },
      { phase: 'DURING', title: 'Điểm danh học viên đầu buổi', sortOrder: 1 },
      { phase: 'DURING', title: 'Chụp ảnh toàn cảnh lớp và giảng viên', sortOrder: 2 },
      { phase: 'DURING', title: 'Ghi chép Q&A chính', sortOrder: 3 },
      { phase: 'POST', title: 'Upload ảnh, điểm danh và feedback lên hệ thống', sortOrder: 1 },
      { phase: 'POST', title: 'Gửi Q&A và feedback cho ban quản lý', sortOrder: 2 },
      { phase: 'POST', title: 'Thu dọn phòng, kiểm kê thiết bị', sortOrder: 3 },
    ];
    const session = await client.auth.getSession();
    const rows = defaults.map((item) => ({
      class_id: classId,
      phase: item.phase,
      title: item.title,
      is_done: false,
      note: '',
      sort_order: item.sortOrder || 0,
      updated_by: session.data.session?.user?.id || null,
      updated_at: new Date().toISOString(),
    }));
    const { data, error } = await client
      .from('vcontent_training_operation_checklist_items')
      .insert(rows)
      .select('*');
    if (error) throw new SuniApiError(error.message);
    return (data || []).map(mapOperationChecklistRow);
  },

  async deleteOperationChecklistItem(id: string) {
    const client = requireSupabase();
    const { error } = await client.from('vcontent_training_operation_checklist_items').delete().eq('id', id);
    if (error) throw new SuniApiError(error.message);
    return { success: true };
  },

  async listOperationEvidence(classId: string) {
    const client = requireSupabase();
    const { data, error } = await withSuniTimeout(client
      .from('vcontent_training_operation_evidence')
      .select('*')
      .eq('class_id', classId)
      .order('uploaded_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }), 'training operation evidence');
    if (error) throw new SuniApiError(error.message);
    return (data || []).map(mapOperationEvidenceRow);
  },

  async saveOperationEvidence(payload: SuniOperationEvidenceUploadPayload) {
    const client = requireSupabase();
    const session = await client.auth.getSession();
    let fileName = payload.fileName || null;
    let fileUrl = payload.fileUrl || null;
    let storageBucket = payload.storageBucket || null;
    let storagePath = payload.storagePath || null;
    if (payload.file) {
      fileName = payload.file.name;
      const safeName = sanitizeStorageSegment(fileName) || `evidence-${Date.now()}`;
      storageBucket = 'training-materials';
      storagePath = ['operations', sanitizeStorageSegment(payload.classId) || 'class', `${Date.now()}-${safeName}`].join('/');
      const upload = await client.storage.from(storageBucket).upload(storagePath, payload.file, {
        contentType: payload.file.type || 'application/octet-stream',
        upsert: true,
      });
      if (upload.error) throw new SuniApiError(upload.error.message);
      fileUrl = client.storage.from(storageBucket).getPublicUrl(storagePath).data.publicUrl || fileUrl;
    }
    const row = {
      ...(payload.id ? { id: payload.id } : {}),
      class_id: payload.classId,
      task_id: payload.taskId || null,
      checklist_item_id: payload.checklistItemId || null,
      evidence_type: payload.type.trim(),
      session_label: payload.sessionLabel || '',
      title: (payload.title || payload.type || fileName || 'Minh chứng').trim(),
      file_name: fileName || '',
      file_url: fileUrl || null,
      storage_bucket: storageBucket || null,
      storage_path: storagePath || null,
      status: payload.status || 'Chờ',
      owner_profile_id: payload.ownerProfileId || null,
      owner_name: payload.ownerName || '',
      note: payload.note || '',
      uploaded_by: session.data.session?.user?.id || null,
      uploaded_at: fileName || fileUrl ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from('vcontent_training_operation_evidence')
      .upsert(row)
      .select('*')
      .single();
    if (error) throw new SuniApiError(error.message);
    if (payload.taskId) {
      await client
        .from('vcontent_training_operation_tasks')
        .update({ evidence_status: payload.status === 'OK' ? 'approved' : 'submitted', evidence_url: fileUrl || null, updated_at: new Date().toISOString() })
        .eq('id', payload.taskId);
    }
    if (payload.checklistItemId) {
      await client
        .from('vcontent_training_operation_checklist_items')
        .update({ evidence_status: payload.status === 'OK' ? 'approved' : 'submitted', updated_at: new Date().toISOString() })
        .eq('id', payload.checklistItemId);
    }
    return mapOperationEvidenceRow(data);
  },

  async deleteOperationEvidence(id: string) {
    const client = requireSupabase();
    const item = await client.from('vcontent_training_operation_evidence').select('*').eq('id', id).maybeSingle();
    if (item.error) throw new SuniApiError(item.error.message);
    const row = item.data ? mapOperationEvidenceRow(item.data) : null;
    if (row?.storageBucket && row.storagePath) {
      const removed = await client.storage.from(row.storageBucket).remove([row.storagePath]);
      if (removed.error) throw new SuniApiError(removed.error.message);
    }
    const { error } = await client.from('vcontent_training_operation_evidence').delete().eq('id', id);
    if (error) throw new SuniApiError(error.message);
    return { success: true };
  },

  async listTrainingResults(input: { classId?: string; courseId?: string; studentProfileId?: string }) {
    const client = requireSupabase();
    let query = client.from('vcontent_training_results').select('*').order('updated_at', { ascending: false });
    if (input.classId) query = query.eq('class_id', input.classId);
    if (input.courseId) query = query.eq('course_id', input.courseId);
    if (input.studentProfileId) query = query.eq('student_profile_id', input.studentProfileId);
    const { data, error } = await withSuniTimeout(query, 'training results');
    if (error) throw new SuniApiError(error.message);
    const results = (data || []).map(mapResultRow);
    const classIds = [...new Set(results.map((result) => result.classId).filter(Boolean))];
    const classes = classIds.length ? await this.listClassesByIds(classIds) : [];
    const students = classIds.length ? await this.listClassStudents(classIds) : [];
    return enrichTrainingResults(results, classes, students);
  },

  async listClassTrainingResultsFast(input: { classId: string; studentProfileId?: string; classContext?: SuniTrainingClass | null }) {
    const classId = String(input.classId || '').trim();
    if (!classId) return [] as SuniTrainingResult[];
    const client = requireSupabase();
    let query = client
      .from('vcontent_training_results')
      .select('*')
      .eq('class_id', classId)
      .order('updated_at', { ascending: false });
    const studentProfileId = String(input.studentProfileId || '').trim();
    if (studentProfileId) query = query.eq('student_profile_id', studentProfileId);
    const { data, error } = await withSuniTimeout(query, 'training class results fast');
    if (error) throw new SuniApiError(error.message);
    const results = (data || []).map(mapResultRow);
    if (!results.length) return [];
    const students = await this.listClassStudentsFast(classId, studentProfileId ? { profileId: studentProfileId } : undefined);
    return enrichTrainingResults(results, input.classContext ? [input.classContext] : [], students);
  },

  async listCustomerTrainingResults(scope: SuniCustomerResultScope) {
    const profileId = String(scope.profileId || '').trim();
    if (!profileId) return [] as SuniTrainingResult[];
    const courses = await this.listCustomerCourses(profileId);
    const allowedCourseIds = new Set(courses.map((course) => course.id));
    const classes = await this.listCustomerClasses(profileId, [...allowedCourseIds]);
    const allowedClassIds = new Set(classes.map((klass) => klass.id));
    if (!allowedCourseIds.size && !allowedClassIds.size) return [] as SuniTrainingResult[];
    const resultGroups = await Promise.all([
      ...[...allowedCourseIds].map((courseId) => this.listTrainingResults({ courseId })),
      ...[...allowedClassIds].map((classId) => this.listTrainingResults({ classId })),
    ]);
    const resultById = new Map<string, SuniTrainingResult>();
    resultGroups.flat().forEach((result) => resultById.set(result.id, result));
    return [...resultById.values()];
  },

  async saveTrainingResult(payload: SuniTrainingResultPayload) {
    const client = requireSupabase();
    const courseId = payload.courseId || (await this.getClass(payload.classId))?.courseId || null;
    const rule = courseId ? await this.getScoreRule(courseId) : null;
    const normalizedScores = Object.fromEntries(
      Object.entries(payload.scores || {}).map(([key, value]) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) return [key, value];
        if (key === 'discussionBonus') return [key, normalizeNonNegativeScore(value)];
        if (key === 'discussionBonusManual') return [key, value === true];
        return [key, normalizeScore10(value)];
      })
    );
    const computedFinalScore = payload.finalScore == null ? calculateFinalScore(normalizedScores, rule) : normalizeScore10(payload.finalScore);
    const passed = payload.passed ?? (computedFinalScore == null || rule?.passingScore == null ? null : computedFinalScore >= rule.passingScore);
    const row = {
      ...(payload.id ? { id: payload.id } : {}),
      class_id: payload.classId,
      course_id: courseId,
      student_profile_id: payload.studentProfileId,
      scores: normalizedScores,
      final_score: computedFinalScore,
      passed,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from('vcontent_training_results')
      .upsert(row)
      .select('*')
      .single();
    if (error) throw new SuniApiError(error.message);
    return mapResultRow(data);
  },

  async ensureClassResults(classId: string) {
    const klass = await this.getClass(classId);
    if (!klass) throw new SuniApiError('Không tìm thấy lớp đào tạo.');
    const students = await this.listClassStudents([classId]);
    if (!students.length) return [] as SuniTrainingResult[];
    const existing = await this.listTrainingResults({ classId });
    const existingProfileIds = new Set(existing.map((result) => result.studentProfileId));
    const rows = students
      .filter((student) => student.profileId && !existingProfileIds.has(student.profileId))
      .map((student) => ({
        class_id: classId,
        course_id: klass.courseId || null,
        student_profile_id: student.profileId,
        scores: {
          attendance: 0,
          quiz: null,
          reflection: null,
          discussion: null,
          discussionBonus: 0,
          discussionBonusManual: false,
          game: null,
        },
        final_score: null,
        passed: null,
        updated_at: new Date().toISOString(),
      }));
    if (rows.length) {
      const client = requireSupabase();
      const { error } = await client.from('vcontent_training_results').insert(rows);
      if (error) throw new SuniApiError(error.message);
    }
    return this.listTrainingResults({ classId });
  },

  async recalculateClassResults(classId: string) {
    const results = await this.ensureClassResults(classId);
    const klass = await this.getClass(classId);
    const students = await this.listClassStudents([classId]);
    const rule = klass?.courseId ? await this.getScoreRule(klass.courseId) : null;
    const client = requireSupabase();
    const quizScores = await loadClassQuizScoresByProfile(client, classId, students);
    const reflectionScores = await loadClassReflectionScoresByProfile(client, classId, students);
    const discussionScores = await loadClassDiscussionScoresByProfile(client, classId);
    const updatedAt = new Date().toISOString();
    const rows = results.map((result) => {
      const scores = {
        ...result.scores,
        attendance: result.scores.attendance ?? 0,
        quiz: quizScores.hasQuizActivities ? quizScores.scoresByProfile.get(result.studentProfileId) ?? null : result.scores.quiz ?? null,
        reflection: reflectionScores.hasReflectionActivities ? reflectionScores.scoresByProfile.get(result.studentProfileId) ?? null : result.scores.reflection ?? null,
        discussion: discussionScores.hasDiscussionEvents ? discussionScores.scoresByProfile.get(result.studentProfileId) ?? null : null,
        discussionBonus: result.scores.discussionBonusManual === true
          ? result.scores.discussionBonus ?? 0
          : discussionScores.hasDiscussionEvents ? discussionScores.bonusByProfile.get(result.studentProfileId) ?? 0 : result.scores.discussionBonus ?? 0,
        discussionEvents: discussionScores.hasDiscussionEvents ? discussionScores.scoreEventsByProfile.get(result.studentProfileId) || {} : {},
        discussionBonusEvents: discussionScores.hasDiscussionEvents ? discussionScores.bonusEventsByProfile.get(result.studentProfileId) || {} : {},
      };
      const finalScore = calculateFinalScore(scores, rule);
      return {
        id: result.id,
        class_id: result.classId,
        course_id: result.courseId || klass?.courseId || null,
        student_profile_id: result.studentProfileId,
        scores,
        final_score: finalScore,
        passed: finalScore == null || rule?.passingScore == null ? null : finalScore >= rule.passingScore,
        updated_at: updatedAt,
      };
    });
    if (rows.length) {
      const { error } = await client.from('vcontent_training_results').upsert(rows);
      if (error) throw new SuniApiError(error.message);
    }
    return this.listTrainingResults({ classId });
  },

  async deleteClass(id: string) {
    const client = requireSupabase();
    const { error } = await client.from('vcontent_training_classes').delete().eq('id', id);
    if (error) throw new SuniApiError(error.message);
    return { success: true };
  },
};
