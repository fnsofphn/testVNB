import JSZip from 'jszip';
import { formatQuizOptionText } from '@/features/quiz/quizOptionText';
import { supabase } from '@/lib/supabaseClient';
import { getRumDurationMs, getRumStartedAt, reportVLearningRum } from '@/lib/rum';

export type QuizOption = {
  id: string;
  text: string;
};

export type QuizQuestion = {
  id: string;
  code: string;
  prompt: string;
  options: QuizOption[];
  correctOptionId?: string;
  explanation?: string;
};

export type QuizQuestionSet = {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'draft';
  questionCount: number;
  createdAt: string;
};

export type QuizQuestionSetBundle = {
  set: QuizQuestionSet;
  questions: QuizQuestion[];
};

export type QuizForm = {
  id: string;
  title: string;
  intro: string;
  status: 'active' | 'paused';
  questionSetId: string;
  questionCount: number;
  durationMinutes: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  maxAttempts: number;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type QuizFormBundle = {
  form: QuizForm;
  questionSet: QuizQuestionSet;
  questions: QuizQuestion[];
};

export type VTrainingQuizAttempt = {
  sessionId: string;
  activityId: string;
  classId: string;
  courseId: string | null;
  formId: string;
  attemptNo: number;
  startedAt: string;
  expiresAt: string;
  questions: QuizQuestion[];
  resumed: boolean;
};

export type PublicQuizAttempt = {
  sessionId: string;
  formId: string;
  attemptNo: number;
  startedAt: string;
  expiresAt: string;
  questions: QuizQuestion[];
  resumed: boolean;
  ticket: string;
  startIdempotencyKey: string;
};

export type QuizSubmission = {
  id: string;
  formId: string;
  respondentName: string;
  email: string;
  className: string;
  answers: Record<string, string>;
  questionOrder: string[];
  score: number | null;
  total: number | null;
  studentProfileId?: string | null;
  attemptNo?: number;
  metadata?: Record<string, unknown>;
  submittedAt: string;
};

export type QuizFormInput = Partial<Pick<QuizForm, 'id' | 'title' | 'intro' | 'questionCount' | 'durationMinutes' | 'shuffleQuestions' | 'shuffleOptions'>> & {
  questionSetId?: string;
  maxAttempts?: number;
  metadata?: Record<string, unknown>;
};

export type QuizFormUpdateInput = Partial<Pick<QuizForm, 'title' | 'intro' | 'status' | 'questionSetId' | 'questionCount' | 'durationMinutes' | 'shuffleQuestions' | 'shuffleOptions' | 'maxAttempts' | 'metadata'>>;
export type QuizQuestionSetUpdateInput = Partial<Pick<QuizQuestionSet, 'name' | 'description' | 'status'>>;

const QUESTION_SET_STORAGE_KEY = 'vcontent.quiz.questionSets';
const FORM_STORAGE_KEY = 'vcontent.quiz.forms';
const SUBMISSION_STORAGE_KEY = 'vcontent.quiz.submissions';
const ELEARNING_SUBMISSION_STORAGE_KEY = 'vcontent.elearning.quiz.submissions';
const SAMPLE_SET_ID = 'spc-qt26-e';

const SAMPLE_QUESTIONS: QuizQuestion[] = [
  {
    id: 'spc-qt26-e-1',
    code: '1',
    prompt: 'Theo bài giảng, ba chuyển biến lớn đang ảnh hưởng đến hoạt động chung của doanh nghiệp là gì?',
    options: [
      { id: 'A', text: 'Chuyển đổi số - tài chính - truyền thông' },
      { id: 'B', text: 'Chuyển đổi tổ chức - chuyển đổi số - kỳ vọng khách hàng' },
      { id: 'C', text: 'Nhân sự - công nghệ - pháp lý' },
      { id: 'D', text: 'Quản trị - sản xuất - đầu tư' },
    ],
  },
  {
    id: 'spc-qt26-e-2',
    code: '2',
    prompt: 'Trong môi trường mới, dữ liệu được xem là gì?',
    options: [
      { id: 'A', text: 'Công cụ báo cáo định kỳ' },
      { id: 'B', text: 'Nguồn lực sẵn có hỗ trợ ra quyết định' },
      { id: 'C', text: 'Tài sản chỉ dành cho lãnh đạo' },
      { id: 'D', text: 'Hệ thống lưu trữ hồ sơ' },
    ],
  },
  {
    id: 'spc-qt26-e-3',
    code: '3',
    prompt: 'Theo bài giảng, cách quản lý quen thuộc trong giai đoạn trước thường có đặc điểm nào?',
    options: [
      { id: 'A', text: 'Hoàn toàn dựa trên hệ thống dữ liệu' },
      { id: 'B', text: 'Dựa nhiều vào kinh nghiệm cá nhân' },
      { id: 'C', text: 'Tập trung vào AI và công nghệ' },
      { id: 'D', text: 'Quản lý theo KPI tự động' },
    ],
  },
  {
    id: 'spc-qt26-e-4',
    code: '4',
    prompt: 'Một trong những giới hạn của quản lý theo kinh nghiệm là gì?',
    options: [
      { id: 'A', text: 'Tăng tính tự động hóa' },
      { id: 'B', text: 'Dễ chuẩn hóa toàn hệ thống' },
      { id: 'C', text: 'Khó theo kịp khối lượng và độ phức tạp công việc' },
      { id: 'D', text: 'Tăng khả năng phân tích dữ liệu' },
    ],
  },
  {
    id: 'spc-qt26-e-5',
    code: '5',
    prompt: 'Theo bài giảng, cơ chế điều hành có thể bao gồm nội dung nào dưới đây?',
    options: [
      { id: 'A', text: 'Hệ thống chấm công tự động' },
      { id: 'B', text: 'Giao ban đầu ca, chốt ngày và giao ban tuần' },
      { id: 'C', text: 'Quy trình tuyển dụng nhân sự' },
      { id: 'D', text: 'Hệ thống đánh giá tài chính' },
    ],
  },
  {
    id: 'spc-qt26-e-6',
    code: '6',
    prompt: 'Theo bài giảng, AI phù hợp nhất để hỗ trợ nhóm công việc nào?',
    options: [
      { id: 'A', text: 'Thay thế hoàn toàn người quản lý' },
      { id: 'B', text: 'Quyết định chiến lược doanh nghiệp' },
      { id: 'C', text: 'Các tác vụ hành chính lặp lại' },
      { id: 'D', text: 'Xử lý mọi tình huống khách hàng' },
    ],
  },
  {
    id: 'spc-qt26-e-7',
    code: '7',
    prompt: 'Theo bài học, dữ liệu có vai trò như thế nào đối với trực giác của người quản lý?',
    options: [
      { id: 'A', text: 'Thay thế hoàn toàn trực giác' },
      { id: 'B', text: 'Không liên quan đến trực giác' },
      { id: 'C', text: 'Bổ sung điểm tựa khách quan cho trực giác' },
      { id: 'D', text: 'Làm giảm vai trò của kinh nghiệm' },
    ],
  },
  {
    id: 'spc-qt26-e-8',
    code: '8',
    prompt: 'Theo bài giảng, người quản lý cấp trung là đối tượng như thế nào trong bối cảnh hiện nay?',
    options: [
      { id: 'A', text: 'Chỉ tham gia vận hành kỹ thuật' },
      { id: 'B', text: 'Tiếp nhận trực tiếp tác động của các chuyển biến' },
      { id: 'C', text: 'Không chịu ảnh hưởng từ chuyển đổi số' },
      { id: 'D', text: 'Chủ yếu thực hiện báo cáo hành chính' },
    ],
  },
];

function requireSupabase() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.');
  return supabase;
}

function isMissingSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /vcontent_quiz_|relation .* does not exist|column .* does not exist/i.test(message);
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

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function formatQuizError(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') return error instanceof Error ? error.message : fallback;
  const record = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
  return [record.message, record.details, record.hint, record.code].filter(Boolean).map(String).join(' · ') || fallback;
}

function isDuplicateKeyError(error: unknown) {
  const record = error as { message?: unknown; code?: unknown } | null;
  const message = error instanceof Error ? error.message : String(record?.message || error || '');
  const code = String(record?.code || '');
  return code === '23505' || /duplicate key|already exists/i.test(message);
}

function cleanIdempotencyPart(value: unknown, fallback = 'unknown') {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_.:@-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  return (normalized || fallback).slice(0, 160);
}

function buildElearningQuizSubmissionIdempotencyKey(input: {
  formId: string;
  courseId: string;
  studentProfileId?: string | null;
  userId?: string | null;
  email?: string | null;
  attemptNo?: number | null;
}) {
  const learnerKey = input.studentProfileId || input.userId || input.email || 'anonymous';
  return [
    'vlearning-quiz',
    cleanIdempotencyPart(input.courseId),
    cleanIdempotencyPart(input.formId),
    cleanIdempotencyPart(learnerKey),
    Math.max(1, Number(input.attemptNo || 1)),
  ].join(':');
}

function isTransientRequestError(error: unknown) {
  const record = error as { message?: unknown; code?: unknown; status?: unknown } | null;
  const message = error instanceof Error ? error.message : String(record?.message || error || '');
  const code = String(record?.code || '');
  const status = Number(record?.status || 0);
  return (
    status === 0
    || status === 408
    || status === 425
    || status === 429
    || status >= 500
    || ['57014', '53300', '53400', '57P01', '57P03', '08000', '08003', '08006', 'PGRST301'].includes(code)
    || /timeout|timed out|network|failed to fetch|connection|closed|temporarily|rate limit|too many requests/i.test(message)
  );
}

async function waitForRetry(attempt: number) {
  const delayMs = Math.min(1400, 220 * 2 ** attempt) + Math.floor(Math.random() * 180);
  await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
}

async function runWithTransientRetry<T>(action: () => Promise<T>, retries = 2) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isTransientRequestError(error)) break;
      await waitForRetry(attempt);
    }
  }
  throw lastError;
}

function getSampleSet(): QuizQuestionSet {
  return {
    id: SAMPLE_SET_ID,
    name: 'SPC QT26 E - Quiz cuối khóa',
    description: 'Bộ mẫu từ file Word SPC_QT26_E_Quizz cuối khóa. Import file gốc để lấy đủ 75 câu.',
    status: 'active',
    questionCount: SAMPLE_QUESTIONS.length,
    createdAt: new Date(2026, 4, 14).toISOString(),
  };
}

function getLocalSets() {
  const localSets = getLocal<QuizQuestionSetBundle[]>(QUESTION_SET_STORAGE_KEY, []);
  if (!localSets.some((item) => item.set.id === SAMPLE_SET_ID)) {
    return [{ set: getSampleSet(), questions: SAMPLE_QUESTIONS }, ...localSets];
  }
  return localSets;
}

function mapSetRow(row: any, questionCount = 0): QuizQuestionSet {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    description: String(row.description || ''),
    status: row.status === 'draft' ? 'draft' : 'active',
    questionCount,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapQuestionRow(row: any): QuizQuestion {
  const options = Array.isArray(row.options) ? row.options : [];
  return {
    id: String(row.id),
    code: String(row.code || ''),
    prompt: String(row.prompt || ''),
    options: options.map((item: any) => ({ id: String(item.id || ''), text: String(item.text || '') })).filter((item: QuizOption) => item.id && item.text),
    correctOptionId: row.correct_option_id ? String(row.correct_option_id) : undefined,
    explanation: row.explanation ? String(row.explanation) : undefined,
  };
}

function mapFormRow(row: any): QuizForm {
  return {
    id: String(row.id),
    title: String(row.title || ''),
    intro: String(row.intro || ''),
    status: row.status === 'paused' ? 'paused' : 'active',
    questionSetId: String(row.question_set_id || ''),
    questionCount: Number(row.question_count || 20),
    durationMinutes: Number(row.duration_minutes || 20),
    shuffleQuestions: row.shuffle_questions !== false,
    shuffleOptions: row.shuffle_options === true,
    maxAttempts: Math.max(1, Number(row.max_attempts || 1)),
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {},
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapSubmissionRow(row: any): QuizSubmission {
  return {
    id: String(row.id),
    formId: String(row.form_id),
    respondentName: String(row.respondent_name || ''),
    email: String(row.email || ''),
    className: String(row.class_name || ''),
    answers: row.answers && typeof row.answers === 'object' ? row.answers : {},
    questionOrder: Array.isArray(row.question_order) ? row.question_order.map(String) : [],
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    total: row.total === null || row.total === undefined ? null : Number(row.total),
    studentProfileId: row.student_profile_id || null,
    attemptNo: Number(row.attempt_no || 1),
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {},
    submittedAt: String(row.submitted_at || new Date().toISOString()),
  };
}

export function sanitizeQuizId(value: string) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function buildQuizShareLink(formId: string) {
  if (typeof window === 'undefined') return `/quiz/${formId}`;
  return `${window.location.origin}/quiz/${formId}`;
}

export async function listQuizQuestionSets() {
  try {
    const client = requireSupabase();
    const [setsResult, questionsResult] = await Promise.all([
      client.from('vcontent_quiz_question_sets').select('id,name,description,status,created_at').order('created_at', { ascending: false }),
      client.from('vcontent_quiz_questions').select('question_set_id'),
    ]);
    if (setsResult.error) throw setsResult.error;
    if (questionsResult.error) throw questionsResult.error;
    const counts = new Map<string, number>();
    for (const row of questionsResult.data || []) {
      const id = String((row as any).question_set_id || '');
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const sets = (setsResult.data || []).map((row) => mapSetRow(row, counts.get(String((row as any).id)) || 0));
    return sets.length ? sets : [getSampleSet()];
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    return getLocalSets().map((item) => item.set);
  }
}

export async function getQuizQuestionSetBundle(questionSetId: string): Promise<QuizQuestionSetBundle> {
  try {
    const client = requireSupabase();
    const [setResult, questionsResult] = await Promise.all([
      client.from('vcontent_quiz_question_sets').select('id,name,description,status,created_at').eq('id', questionSetId).maybeSingle(),
      client
        .from('vcontent_quiz_questions')
        .select('id,code,prompt,options,correct_option_id,explanation,sort_order')
        .eq('question_set_id', questionSetId)
        .order('sort_order', { ascending: true }),
    ]);
    if (setResult.error) throw setResult.error;
    if (questionsResult.error) throw questionsResult.error;
    if (!setResult.data) throw new Error('Không tìm thấy bộ câu hỏi.');
    const questions = (questionsResult.data || []).map(mapQuestionRow);
    return { set: mapSetRow(setResult.data, questions.length), questions };
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const bundle = getLocalSets().find((item) => item.set.id === questionSetId) || getLocalSets()[0];
    if (!bundle) throw new Error('Không tìm thấy bộ câu hỏi.');
    return bundle;
  }
}

export async function createQuizQuestionSet(input: { id?: string; name: string; description?: string; questions: QuizQuestion[] }) {
  const requestedId = sanitizeQuizId(input.id || input.name);
  const id = requestedId || `quiz-set-${Date.now()}`;
  const set: QuizQuestionSet = {
    id,
    name: input.name.trim() || id,
    description: input.description?.trim() || '',
    status: 'active',
    questionCount: input.questions.length,
    createdAt: new Date().toISOString(),
  };
  const questions = input.questions.map((question, index) => ({
    ...question,
    id: `${id}-${sanitizeQuizId(question.code || question.id || String(index + 1)) || index + 1}`,
    code: question.code || String(index + 1),
  }));

  try {
    const client = requireSupabase();
    const { error: setError } = await client.from('vcontent_quiz_question_sets').upsert({
      id: set.id,
      name: set.name,
      description: set.description,
      status: set.status,
    });
    if (setError) throw setError;
    await client.from('vcontent_quiz_questions').delete().eq('question_set_id', set.id);
    if (questions.length) {
      const { error: questionsError } = await client.from('vcontent_quiz_questions').insert(
        questions.map((question, index) => ({
          id: question.id,
          question_set_id: set.id,
          code: question.code,
          prompt: question.prompt,
          options: question.options,
          correct_option_id: question.correctOptionId || null,
          explanation: question.explanation || null,
          sort_order: index + 1,
        })),
      );
      if (questionsError) throw questionsError;
    }
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const bundles = getLocalSets().filter((item) => item.set.id !== set.id && item.set.id !== SAMPLE_SET_ID);
    setLocal(QUESTION_SET_STORAGE_KEY, [{ set, questions }, ...bundles]);
  }

  return { set, questions };
}

export async function updateQuizQuestionSet(questionSetId: string, input: QuizQuestionSetUpdateInput) {
  const normalizedSetId = questionSetId.trim();
  if (!normalizedSetId) throw new Error('Cần chọn bộ câu hỏi để sửa.');
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.description !== undefined) updates.description = input.description.trim();
  if (input.status !== undefined) updates.status = input.status;

  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_quiz_question_sets')
      .update(updates)
      .eq('id', normalizedSetId)
      .select('id,name,description,status,created_at')
      .single();
    if (error) throw error;
    const bundle = await getQuizQuestionSetBundle(normalizedSetId);
    return mapSetRow(data, bundle.questions.length);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const bundles = getLocalSets().map((bundle) => (bundle.set.id === normalizedSetId ? {
      ...bundle,
      set: {
        ...bundle.set,
        name: input.name !== undefined ? input.name.trim() || bundle.set.name : bundle.set.name,
        description: input.description !== undefined ? input.description.trim() : bundle.set.description,
        status: input.status ?? bundle.set.status,
      },
    } : bundle)).filter((bundle) => bundle.set.id !== SAMPLE_SET_ID);
    setLocal(QUESTION_SET_STORAGE_KEY, bundles);
    const updated = bundles.find((bundle) => bundle.set.id === normalizedSetId)?.set;
    if (!updated) throw new Error('Không tìm thấy bộ câu hỏi cần sửa.');
    return updated;
  }
}

export async function deleteQuizQuestionSet(questionSetId: string) {
  const normalizedSetId = questionSetId.trim();
  if (!normalizedSetId) throw new Error('Cần chọn bộ câu hỏi để xóa.');
  if (normalizedSetId === SAMPLE_SET_ID) throw new Error('Không xóa bộ câu hỏi mẫu.');

  try {
    const client = requireSupabase();
    const { data: forms, error: formError } = await client
      .from('vcontent_quiz_forms')
      .select('id')
      .eq('question_set_id', normalizedSetId)
      .limit(1);
    if (formError) throw formError;
    if ((forms || []).length) throw new Error('Bộ câu hỏi đang được gắn vào đề kiểm tra. Hãy gỡ đề trước khi xóa.');
    const { error } = await client.from('vcontent_quiz_question_sets').delete().eq('id', normalizedSetId);
    if (error) throw error;
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const linkedForms = getLocal<QuizForm[]>(FORM_STORAGE_KEY, []).filter((form) => form.questionSetId === normalizedSetId);
    if (linkedForms.length) throw new Error('Bộ câu hỏi đang được gắn vào đề kiểm tra. Hãy gỡ đề trước khi xóa.');
    setLocal(QUESTION_SET_STORAGE_KEY, getLocalSets().filter((bundle) => bundle.set.id !== normalizedSetId && bundle.set.id !== SAMPLE_SET_ID));
  }
}

export async function listQuizForms() {
  try {
    const client = requireSupabase();
    const { data, error } = await client.from('vcontent_quiz_forms').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapFormRow);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    return getLocal<QuizForm[]>(FORM_STORAGE_KEY, []);
  }
}

export async function createQuizForm(input: QuizFormInput) {
  const questionSetId = input.questionSetId || SAMPLE_SET_ID;
  const form: QuizForm = {
    id: sanitizeQuizId(input.id || input.title || '') || `quiz-${Date.now()}`,
    title: input.title?.trim() || 'Bài kiểm tra mới',
    intro: input.intro?.trim() || '',
    status: 'active',
    questionSetId,
    questionCount: Number(input.questionCount || 20),
    durationMinutes: Number(input.durationMinutes || 20),
    shuffleQuestions: input.shuffleQuestions !== false,
    shuffleOptions: input.shuffleOptions === true,
    maxAttempts: Math.max(1, Number(input.maxAttempts || 1)),
    metadata: input.metadata || {},
    createdAt: new Date().toISOString(),
  };
  try {
    const client = requireSupabase();
    if (questionSetId === SAMPLE_SET_ID) {
      await createQuizQuestionSet({ id: SAMPLE_SET_ID, name: getSampleSet().name, description: getSampleSet().description, questions: SAMPLE_QUESTIONS });
    }
    const { data, error } = await client
      .from('vcontent_quiz_forms')
      .insert({
        id: form.id,
        title: form.title,
        intro: form.intro,
        status: form.status,
        question_set_id: form.questionSetId,
        question_count: form.questionCount,
        duration_minutes: form.durationMinutes,
        shuffle_questions: form.shuffleQuestions,
        shuffle_options: form.shuffleOptions,
        max_attempts: form.maxAttempts,
        metadata: form.metadata,
      })
      .select('*')
      .single();
    if (error) throw error;
    return mapFormRow(data);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const forms = getLocal<QuizForm[]>(FORM_STORAGE_KEY, []).filter((item) => item.id !== form.id);
    setLocal(FORM_STORAGE_KEY, [form, ...forms]);
    return form;
  }
}

export async function updateQuizFormStatus(formId: string, status: QuizForm['status']) {
  try {
    const client = requireSupabase();
    const { error } = await client.from('vcontent_quiz_forms').update({ status }).eq('id', formId);
    if (error) throw error;
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    setLocal(
      FORM_STORAGE_KEY,
      getLocal<QuizForm[]>(FORM_STORAGE_KEY, []).map((item) => (item.id === formId ? { ...item, status } : item)),
    );
  }
}

export async function updateQuizForm(formId: string, input: QuizFormUpdateInput) {
  const normalizedFormId = formId.trim();
  if (!normalizedFormId) throw new Error('Cần chọn đề kiểm tra để sửa.');
  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.intro !== undefined) updates.intro = input.intro.trim();
  if (input.status !== undefined) updates.status = input.status;
  if (input.questionSetId !== undefined) updates.question_set_id = input.questionSetId.trim();
  if (input.questionCount !== undefined) updates.question_count = Math.max(1, Number(input.questionCount || 1));
  if (input.durationMinutes !== undefined) updates.duration_minutes = Math.max(1, Number(input.durationMinutes || 1));
  if (input.shuffleQuestions !== undefined) updates.shuffle_questions = input.shuffleQuestions;
  if (input.shuffleOptions !== undefined) updates.shuffle_options = input.shuffleOptions;
  if (input.maxAttempts !== undefined) updates.max_attempts = Math.max(1, Number(input.maxAttempts || 1));
  if (input.metadata !== undefined) updates.metadata = input.metadata;

  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_quiz_forms')
      .update(updates)
      .eq('id', normalizedFormId)
      .select('*')
      .single();
    if (error) throw error;
    return mapFormRow(data);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const nextForms = getLocal<QuizForm[]>(FORM_STORAGE_KEY, []).map((form) => (form.id === normalizedFormId ? {
      ...form,
      title: input.title !== undefined ? input.title.trim() || form.title : form.title,
      intro: input.intro !== undefined ? input.intro.trim() : form.intro,
      status: input.status ?? form.status,
      questionSetId: input.questionSetId !== undefined ? input.questionSetId.trim() : form.questionSetId,
      questionCount: input.questionCount !== undefined ? Math.max(1, Number(input.questionCount || 1)) : form.questionCount,
      durationMinutes: input.durationMinutes !== undefined ? Math.max(1, Number(input.durationMinutes || 1)) : form.durationMinutes,
      shuffleQuestions: input.shuffleQuestions ?? form.shuffleQuestions,
      shuffleOptions: input.shuffleOptions ?? form.shuffleOptions,
      maxAttempts: input.maxAttempts !== undefined ? Math.max(1, Number(input.maxAttempts || 1)) : form.maxAttempts,
      metadata: input.metadata ?? form.metadata,
    } : form));
    setLocal(FORM_STORAGE_KEY, nextForms);
    const updated = nextForms.find((form) => form.id === normalizedFormId);
    if (!updated) throw new Error('Không tìm thấy đề kiểm tra cần sửa.');
    return updated;
  }
}

export async function deleteQuizForm(formId: string) {
  const normalizedFormId = formId.trim();
  if (!normalizedFormId) throw new Error('Cần chọn đề kiểm tra để xóa.');

  try {
    const client = requireSupabase();
    const [{ data: submissions, error: submissionError }, { data: courses, error: courseError }] = await Promise.all([
      client.from('vcontent_quiz_submissions').select('id').eq('form_id', normalizedFormId).limit(1),
      client.from('vcontent_eln_courses').select('id').eq('final_quiz_form_id', normalizedFormId).limit(1),
    ]);
    if (submissionError) throw submissionError;
    if (courseError && !isMissingSchemaError(courseError)) throw courseError;
    if ((submissions || []).length || (courses || []).length) {
      throw new Error('Đề kiểm tra đã có bài nộp hoặc đang gắn vào khóa học. Hãy tạm dừng/lưu trữ thay vì xóa.');
    }
    const { error } = await client.from('vcontent_quiz_forms').delete().eq('id', normalizedFormId);
    if (error) throw error;
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const hasSubmissions = getLocal<QuizSubmission[]>(SUBMISSION_STORAGE_KEY, []).some((submission) => submission.formId === normalizedFormId);
    if (hasSubmissions) throw new Error('Đề kiểm tra đã có bài nộp. Hãy tạm dừng/lưu trữ thay vì xóa.');
    setLocal(FORM_STORAGE_KEY, getLocal<QuizForm[]>(FORM_STORAGE_KEY, []).filter((form) => form.id !== normalizedFormId));
  }
}

export async function getQuizFormBundle(formId: string): Promise<QuizFormBundle | null> {
  const forms = await listQuizForms();
  const form = forms.find((item) => item.id === formId && item.status === 'active');
  if (!form) return null;
  const bundle = await getQuizQuestionSetBundle(form.questionSetId);
  return { form, questionSet: bundle.set, questions: buildQuizQuestionsForForm(bundle.questions, form) };
}

export async function getPublicQuizFormBundle(formId: string): Promise<QuizFormBundle | null> {
  try {
    const client = requireSupabase();
    const { data: formRow, error: formError } = await client.from('vcontent_quiz_forms').select('*').eq('id', formId).eq('status', 'active').maybeSingle();
    if (formError) throw formError;
    if (!formRow) return null;
    const form = mapFormRow(formRow);
    const [setResult, questionsResult] = await Promise.all([
      client.from('vcontent_quiz_question_sets').select('id,name,description,status,created_at').eq('id', form.questionSetId).eq('status', 'active').maybeSingle(),
      client.rpc('vcontent_get_public_quiz_questions', { input_question_set_id: form.questionSetId }),
    ]);
    if (setResult.error) throw setResult.error;
    if (questionsResult.error) throw questionsResult.error;
    if (!setResult.data) return null;
    const questions = (questionsResult.data || []).map((row: any) => ({
      ...mapQuestionRow(row),
      correctOptionId: undefined,
      explanation: undefined,
    }));
    return { form, questionSet: mapSetRow(setResult.data, questions.length), questions: buildQuizQuestionsForForm(questions, form) };
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    return getQuizFormBundle(formId);
  }
}

export async function listQuizSubmissions(formId?: string) {
  try {
    const client = requireSupabase();
    let query = client.from('vcontent_quiz_submissions').select('*').order('submitted_at', { ascending: false });
    if (formId) query = query.eq('form_id', formId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(mapSubmissionRow);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const rows = getLocal<QuizSubmission[]>(SUBMISSION_STORAGE_KEY, []);
    return formId ? rows.filter((item) => item.formId === formId) : rows;
  }
}

export async function listMyQuizSubmissions(formId: string, identity: { studentProfileId?: string | null; email?: string | null; courseId?: string | null }) {
  const studentProfileId = String(identity.studentProfileId || '').trim();
  const email = String(identity.email || '').trim().toLowerCase();
  const courseId = String(identity.courseId || '').trim();
  try {
    const client = requireSupabase();
    let query = client.from('vcontent_quiz_submissions').select('*').eq('form_id', formId).order('submitted_at', { ascending: false }).limit(5);
    if (studentProfileId) {
      query = query.eq('student_profile_id', studentProfileId);
    } else if (email) {
      query = query.ilike('email', email);
    } else {
      return [] as QuizSubmission[];
    }
    if (courseId) {
      query = query.eq('metadata->>courseId', courseId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(mapSubmissionRow);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const rows = getLocal<QuizSubmission[]>(SUBMISSION_STORAGE_KEY, []).filter((item) => item.formId === formId);
    return rows.filter((row) => {
      const sameLearner = (studentProfileId && row.studentProfileId === studentProfileId) || (email && row.email.toLowerCase() === email);
      if (!sameLearner) return false;
      return !courseId || String(row.metadata?.courseId || '') === courseId;
    });
  }
}

export async function saveQuizSubmission(payload: Omit<QuizSubmission, 'id' | 'submittedAt'>) {
  const submission: QuizSubmission = {
    ...payload,
    id: createClientId(),
    score: payload.score,
    total: payload.total,
    attemptNo: Math.max(1, Number(payload.attemptNo || 1)),
    metadata: payload.metadata || {},
    submittedAt: new Date().toISOString(),
  };
  try {
    const client = requireSupabase();
    await runWithTransientRetry(async () => {
      const { error } = await client.from('vcontent_quiz_submissions').insert({
        id: submission.id,
        form_id: submission.formId,
        respondent_name: submission.respondentName,
        email: submission.email,
        class_name: submission.className,
        answers: submission.answers,
        question_order: submission.questionOrder,
        score: submission.score,
        total: submission.total,
        student_profile_id: submission.studentProfileId || null,
        attempt_no: submission.attemptNo || 1,
        metadata: submission.metadata || {},
      });
      if (!error || isDuplicateKeyError(error)) return true;
      throw error;
    });
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw new Error(formatQuizError(error, 'Không gửi được bài kiểm tra.'));
    setLocal(SUBMISSION_STORAGE_KEY, [submission, ...getLocal<QuizSubmission[]>(SUBMISSION_STORAGE_KEY, [])]);
  }
  return submission;
}

async function publicQuizRequest<T>(
  payload: Record<string, unknown>,
  accessToken = '',
): Promise<T> {
  const response = await fetch('/api/public-quiz', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(String(data?.error || 'Máy chủ public quiz tạm thời không khả dụng.'));
  }
  return data as T;
}

export async function startPublicQuizAttempt(input: {
  formId: string;
  respondentName: string;
  email: string;
  className: string;
  accessToken?: string;
  idempotencyKey?: string;
}): Promise<PublicQuizAttempt> {
  const startIdempotencyKey = input.idempotencyKey
    || `public-quiz-start:${input.formId}:${createClientId()}`;
  const data = await publicQuizRequest<{ attempt: Omit<PublicQuizAttempt, 'startIdempotencyKey'> }>({
    action: 'start',
    formId: input.formId,
    respondentName: input.respondentName,
    email: input.email,
    className: input.className,
    idempotencyKey: startIdempotencyKey,
  }, input.accessToken);
  if (!data.attempt?.sessionId || !data.attempt?.ticket || !Array.isArray(data.attempt?.questions)) {
    throw new Error('Máy chủ không trả về phiên public quiz hợp lệ.');
  }
  return {
    ...data.attempt,
    startIdempotencyKey,
    attemptNo: Math.max(1, Number(data.attempt.attemptNo || 1)),
    resumed: Boolean(data.attempt.resumed),
  };
}

export async function submitPublicQuizAttempt(input: {
  attempt: PublicQuizAttempt;
  answers: Record<string, string>;
  autoSubmitted?: boolean;
  idempotencyKey?: string;
}): Promise<QuizSubmission> {
  const data = await publicQuizRequest<{ submission: QuizSubmission }>({
    action: 'submit',
    sessionId: input.attempt.sessionId,
    formId: input.attempt.formId,
    ticket: input.attempt.ticket,
    answers: input.answers,
    autoSubmitted: Boolean(input.autoSubmitted),
    idempotencyKey: input.idempotencyKey
      || `public-quiz-submit:${input.attempt.sessionId}:${createClientId()}`,
  });
  if (!data.submission?.id) {
    throw new Error('Máy chủ không trả về bài nộp public quiz hợp lệ.');
  }
  return data.submission;
}

export async function startVTrainingQuizAttempt(formId: string): Promise<VTrainingQuizAttempt> {
  const normalizedFormId = String(formId || '').trim();
  if (!normalizedFormId) throw new Error('Thiếu mã bài kiểm tra VTraining.');
  const client = requireSupabase();
  const { data, error } = await client.rpc('vtraining_start_quiz_attempt', {
    p_form_id: normalizedFormId,
    p_idempotency_key: `vtraining-quiz-start:${normalizedFormId}:${createClientId()}`,
  });
  if (error) throw new Error(formatQuizError(error, 'Không bắt đầu được bài kiểm tra VTraining.'));
  if (!data?.sessionId || !Array.isArray(data?.questions)) {
    throw new Error('Máy chủ không trả về phiên làm bài VTraining hợp lệ.');
  }
  return {
    sessionId: String(data.sessionId),
    activityId: String(data.activityId || ''),
    classId: String(data.classId || ''),
    courseId: data.courseId ? String(data.courseId) : null,
    formId: String(data.formId || normalizedFormId),
    attemptNo: Math.max(1, Number(data.attemptNo || 1)),
    startedAt: String(data.startedAt || new Date().toISOString()),
    expiresAt: String(data.expiresAt || new Date().toISOString()),
    questions: data.questions.map((question: any) => ({
      id: String(question.id || ''),
      code: String(question.code || ''),
      prompt: String(question.prompt || ''),
      options: Array.isArray(question.options)
        ? question.options
          .map((option: any) => ({ id: String(option.id || ''), text: String(option.text || '') }))
          .filter((option: QuizOption) => option.id && option.text)
        : [],
      sortOrder: Number(question.sortOrder || 0),
    })).filter((question: QuizQuestion) => question.id && question.prompt),
    resumed: data.resumed === true,
  };
}

export async function submitVTrainingQuizAttempt(input: {
  sessionId: string;
  answers: Record<string, string>;
  metadata?: Record<string, unknown>;
}) {
  const sessionId = String(input.sessionId || '').trim();
  if (!sessionId) throw new Error('Thiếu phiên làm bài VTraining.');
  const client = requireSupabase();
  const { data, error } = await client.rpc('vtraining_submit_quiz_attempt', {
    p_session_id: sessionId,
    p_answers: input.answers,
    p_idempotency_key: `vtraining-quiz-submit:${sessionId}`,
    p_client_metadata: input.metadata || {},
  });
  if (error) throw new Error(formatQuizError(error, 'Không gửi được bài kiểm tra VTraining.'));
  if (!data?.submission?.id) {
    throw new Error('Máy chủ không trả về bài nộp VTraining hợp lệ.');
  }
  return mapSubmissionRow(data.submission);
}

export async function listMyElearningQuizSubmissions(formId: string, identity: { courseId: string; studentProfileId?: string | null; email?: string | null; userId?: string | null }) {
  const courseId = String(identity.courseId || '').trim();
  const studentProfileId = String(identity.studentProfileId || '').trim();
  const email = String(identity.email || '').trim().toLowerCase();
  const userId = String(identity.userId || '').trim();
  if (!courseId) return [] as QuizSubmission[];
  try {
    const client = requireSupabase();
    let query = client
      .from('vcontent_eln_quiz_submissions')
      .select('*')
      .eq('form_id', formId)
      .eq('course_id', courseId)
      .order('submitted_at', { ascending: false })
      .limit(5);
    if (studentProfileId) {
      query = query.eq('student_profile_id', studentProfileId);
    } else if (userId) {
      query = query.eq('user_id', userId);
    } else if (email) {
      query = query.ilike('email', email);
    } else {
      return [] as QuizSubmission[];
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(mapSubmissionRow);
  } catch (error) {
    if (!isMissingSchemaError(error) && supabase) throw error;
    const rows = getLocal<QuizSubmission[]>(ELEARNING_SUBMISSION_STORAGE_KEY, []).filter((item) => item.formId === formId && String(item.metadata?.courseId || '') === courseId);
    return rows.filter((row) => {
      if (studentProfileId && row.studentProfileId === studentProfileId) return true;
      if (email && row.email.toLowerCase() === email) return true;
      return Boolean(userId && String(row.metadata?.userId || '') === userId);
    });
  }
}

export async function saveElearningQuizSubmission(payload: Omit<QuizSubmission, 'id' | 'submittedAt'> & {
  courseId: string;
  userId?: string | null;
}) {
  const rumStartedAt = getRumStartedAt();
  const courseId = String(payload.courseId || '').trim();
  if (!courseId) throw new Error('Thiếu mã khóa học VLearning.');
  const userId = String(payload.userId || '').trim();
  const attemptNo = Math.max(1, Number(payload.attemptNo || 1));
  const idempotencyKey = buildElearningQuizSubmissionIdempotencyKey({
    formId: payload.formId,
    courseId,
    studentProfileId: payload.studentProfileId || null,
    userId: userId || null,
    email: payload.email,
    attemptNo,
  });
  const submission: QuizSubmission = {
    ...payload,
    id: createClientId(),
    score: payload.score,
    total: payload.total,
    attemptNo,
    metadata: { ...(payload.metadata || {}), source: 'vlearning', courseId, userId: userId || null, idempotencyKey },
    submittedAt: new Date().toISOString(),
  };
  try {
    const client = requireSupabase();
    const { data, error } = await client.rpc('vlearning_submit_final_quiz', {
      p_course_id: courseId,
      p_form_id: submission.formId,
      p_answers: submission.answers,
      p_question_order: submission.questionOrder,
      p_idempotency_key: idempotencyKey,
      p_client_metadata: {
        autoSubmitted: submission.metadata?.autoSubmitted === true,
        autoSubmittedAt: submission.metadata?.autoSubmittedAt || null,
        reason: submission.metadata?.reason || null,
      },
    });
    if (error) throw error;
    const savedSubmissionRow = data?.submission;
    if (!savedSubmissionRow?.id) {
      throw new Error('Máy chủ không trả về bài nộp VLearning hợp lệ.');
    }
    void reportVLearningRum('submit_quiz', getRumDurationMs(rumStartedAt), {
      scopeType: 'quiz',
      scopeId: submission.formId,
    });
    return mapSubmissionRow(savedSubmissionRow);
  } catch (error) {
    if (supabase) {
      void reportVLearningRum('submit_quiz', getRumDurationMs(rumStartedAt), { status: 'error', scopeType: 'quiz', scopeId: submission.formId });
      throw new Error(formatQuizError(error, 'Không gửi được bài kiểm tra VLearning.'));
    }
    const rows = getLocal<QuizSubmission[]>(ELEARNING_SUBMISSION_STORAGE_KEY, []);
    const existing = rows.find((row) => String(row.metadata?.idempotencyKey || '') === idempotencyKey);
    if (existing) return existing;
    setLocal(ELEARNING_SUBMISSION_STORAGE_KEY, [submission, ...rows]);
  }
  void reportVLearningRum('submit_quiz', getRumDurationMs(rumStartedAt), {
    scopeType: 'quiz',
    scopeId: submission.formId,
  });
  return submission;
}

export async function deleteVTrainingQuizSubmission(submissionId: string) {
  const id = String(submissionId || '').trim();
  if (!id) return { deleted: false };
  const client = requireSupabase();
  const { data, error } = await client.rpc('vtraining_delete_quiz_submission', {
    p_submission_id: id,
    p_idempotency_key: `vtraining-quiz-delete:${id}`,
  });
  if (error) throw new Error(formatQuizError(error, 'Không xóa được kết quả quiz VTraining.'));
  if (data?.deleted !== true) throw new Error('Máy chủ không xác nhận đã xóa kết quả quiz VTraining.');
  return data;
}

function toBooleanCell(value: unknown) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'đúng', 'dung', 'x'].includes(normalized);
}

function cellText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function parseQuizWorkbookRows(rows: unknown[][]) {
  const metadataRow = rows[0] || [];
  const titleIndex = metadataRow.findIndex((cell) => /tên bài kiểm tra|ten bai kiem tra/i.test(cellText(cell)));
  const durationIndex = metadataRow.findIndex((cell) => /thời lượng|thoi luong/i.test(cellText(cell)));
  const title = titleIndex >= 0 ? cellText(metadataRow[titleIndex + 1]) : '';
  const durationRaw = durationIndex >= 0 ? cellText(metadataRow[durationIndex + 1]) : '';
  const durationMinutes = Number(durationRaw.match(/\d+/)?.[0] || 0) || 20;
  const headerIndex = rows.findIndex((row) => row.some((cell) => /mã câu hỏi|ma cau hoi/i.test(cellText(cell))) && row.some((cell) => /nội dung câu hỏi|noi dung cau hoi/i.test(cellText(cell))));
  if (headerIndex < 0) {
    return { title, durationMinutes, questions: [] as QuizQuestion[], errors: ['Không tìm thấy dòng header câu hỏi trong file Excel.'] };
  }
  const header = rows[headerIndex].map(cellText);
  const codeCol = header.findIndex((cell) => /mã câu hỏi|ma cau hoi/i.test(cell));
  const typeCol = header.findIndex((cell) => /^loại$|^loai$/i.test(cell));
  const promptCol = header.findIndex((cell) => /nội dung câu hỏi|noi dung cau hoi/i.test(cell));
  const optionCols = header
    .map((cell, index) => ({ cell, index }))
    .filter((item) => /câu trả lời\s*\d+|cau tra loi\s*\d+/i.test(item.cell));
  const answerCols = header
    .map((cell, index) => ({ cell, index }))
    .filter((item) => /kq câu tl\s*\d+|kq cau tl\s*\d+/i.test(item.cell));
  const errors: string[] = [];
  const questions: QuizQuestion[] = [];
  rows.slice(headerIndex + 1).forEach((row, rowOffset) => {
    const rowNumber = headerIndex + rowOffset + 2;
    const code = cellText(row[codeCol]) || String(rowOffset + 1);
    const prompt = cellText(row[promptCol]);
    if (!prompt) return;
    const type = cellText(row[typeCol] || 'Singlechoice').toLowerCase();
    if (type && !type.includes('single')) errors.push(`Dòng ${rowNumber}: hiện chỉ hỗ trợ Singlechoice.`);
    const options = optionCols
      .map((item, index) => {
        const id = String.fromCharCode(65 + index);
        return { id, text: formatQuizOptionText(cellText(row[item.index]), id) };
      })
      .filter((option) => option.text);
    const correctOptionIds = answerCols
      .map((item, index) => (toBooleanCell(row[item.index]) ? String.fromCharCode(65 + index) : ''))
      .filter(Boolean);
    if (options.length < 2) errors.push(`Dòng ${rowNumber}: cần ít nhất 2 phương án trả lời.`);
    if (correctOptionIds.length !== 1) errors.push(`Dòng ${rowNumber}: Singlechoice cần đúng 1 đáp án đúng.`);
    questions.push({
      id: `q-${code}`,
      code,
      prompt,
      options,
      correctOptionId: correctOptionIds[0],
    });
  });
  return { title, durationMinutes, questions, errors };
}

export async function parseQuizWorkbookFile(file: File) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
  if (!worksheet) throw new Error('File Excel không có sheet dữ liệu.');
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as unknown[][];
  return parseQuizWorkbookRows(rows);
}

export function scoreQuizAnswers(questions: QuizQuestion[], answers: Record<string, string>) {
  const scoredQuestions = questions.filter((question) => question.correctOptionId);
  if (!scoredQuestions.length) return { score: null, total: null };
  const correct = scoredQuestions.reduce((sum, question) => sum + (answers[question.id] === question.correctOptionId ? 1 : 0), 0);
  const score = Math.round((correct / scoredQuestions.length) * 100) / 10;
  return { score, total: 10, correct, questionTotal: scoredQuestions.length };
}

function getDisplayScore(row: QuizSubmission, questions: QuizQuestion[]) {
  if (row.score !== null && row.total !== null) {
    const total = Number(row.total || 0);
    const score = total && total !== 10
      ? Math.round((Number(row.score || 0) / total) * 100) / 10
      : Number(row.score);
    return { score, total: 10 };
  }
  return scoreQuizAnswers(questions, row.answers);
}

function seededShuffle<T>(items: T[], seed: string) {
  const output = [...items];
  let state = 0;
  for (let index = 0; index < seed.length; index += 1) state = (state * 31 + seed.charCodeAt(index)) >>> 0;
  for (let index = output.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const nextIndex = state % (index + 1);
    [output[index], output[nextIndex]] = [output[nextIndex], output[index]];
  }
  return output;
}

export function buildQuizQuestionsForForm(questions: QuizQuestion[], form: Pick<QuizForm, 'id' | 'questionCount' | 'shuffleQuestions' | 'shuffleOptions'>) {
  const ordered = form.shuffleQuestions ? seededShuffle(questions, form.id) : [...questions];
  return ordered.slice(0, Math.max(1, form.questionCount)).map((question) => ({
    ...question,
    options: form.shuffleOptions ? seededShuffle(question.options, `${form.id}:${question.id}`) : question.options,
  }));
}

export function parseAnswerKey(value: string) {
  const byCode = new Map<string, string>();
  const normalized = value
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/Câu\s+(\d(?:\s*\n\s*\d+)*)\s*:/gi, (_match, code) => `Câu ${String(code).replace(/\s+/g, '')}:`);
  const patterns = [
    /(?:Câu\s*)?(\d+)\s*[:.\-=]\s*([A-D])\b/gi,
    /(?:Đáp\s*án|Dap\s*an|Answer)\s*(?:câu\s*)?(\d+)\s*[:.\-=]?\s*([A-D])\b/gi,
    /(?:Đáp\s*án|Dap\s*an|Answer)\s*[:.\-=]\s*(\d+)\s*([A-D])\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      byCode.set(match[1], match[2].toUpperCase());
    }
  }
  return byCode;
}

export function parseQuizTextToQuestions(text: string, answerKeyText = '') {
  const normalized = text
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/Câu\s+(\d(?:\s*\n\s*\d+)*)\s*:/gi, (_match, code) => `Câu ${String(code).replace(/\s+/g, '')}:`);
  const answerKey = new Map([...parseAnswerKey(normalized), ...parseAnswerKey(answerKeyText)]);
  const questionRegex = /Câu\s+(\d+)\s*:\s*([\s\S]*?)(?=\n\s*Câu\s+\d+\s*:|$)/gi;
  const questions: QuizQuestion[] = [];
  for (const match of normalized.matchAll(questionRegex)) {
    const code = match[1];
    const rawBody = match[2].trim();
    const localAnswer = rawBody.match(/(?:Đáp\s*án|Dap\s*an|Answer)\s*[:.\-=]?\s*([A-D])\b/i)?.[1]?.toUpperCase();
    const body = rawBody
      .replace(/(?:Đáp\s*án|Dap\s*an|Answer)\s*[:.\-=]?\s*[A-D]\b/gi, '')
      .replace(/(?:Đáp\s*án|Dap\s*an|Answer)\s*(?:câu\s*)?\d+\s*[:.\-=]?\s*[A-D]\b/gi, '')
      .trim();
    const optionStart = body.search(/\bA\./i);
    const prompt = (optionStart >= 0 ? body.slice(0, optionStart) : body).replace(/\s+/g, ' ').trim();
    const optionText = optionStart >= 0 ? body.slice(optionStart) : '';
    const options = [...optionText.matchAll(/([A-D])\.\s*([\s\S]*?)(?=(?:[A-D]\.\s*)|$)/g)]
      .map((optionMatch) => ({ id: optionMatch[1].toUpperCase(), text: optionMatch[2].replace(/\s+/g, ' ').trim() }))
      .filter((option) => option.id && option.text);
    if (prompt && options.length >= 2) {
      questions.push({
        id: `q-${code}`,
        code,
        prompt,
        options,
        correctOptionId: answerKey.get(code) || localAnswer,
      });
    }
  }
  return questions;
}

export async function extractTextFromDocx(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file('word/document.xml')?.async('text');
  if (!documentXml) throw new Error('Không đọc được nội dung Word.');
  const doc = new DOMParser().parseFromString(documentXml, 'application/xml');
  const lines: string[] = [];
  const isRedRun = (run: Element) => {
    const color = run.getElementsByTagName('w:color')[0]?.getAttribute('w:val') || '';
    const red = parseInt(color.slice(0, 2), 16);
    const green = parseInt(color.slice(2, 4), 16);
    const blue = parseInt(color.slice(4, 6), 16);
    return color.length === 6 && red >= 180 && green <= 80 && blue <= 80;
  };
  const pushLine = (value: string, hasRedAnswer: boolean) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    lines.push(trimmed);
    const optionMatch = trimmed.match(/^([A-D])\./i);
    if (hasRedAnswer && optionMatch) lines.push(`Đáp án: ${optionMatch[1].toUpperCase()}`);
  };

  for (const paragraph of Array.from(doc.getElementsByTagName('w:p'))) {
    let currentLine = '';
    let currentLineHasRed = false;
    for (const run of Array.from(paragraph.getElementsByTagName('w:r'))) {
      const runIsRed = isRedRun(run);
      for (const child of Array.from(run.childNodes)) {
        if (child.nodeName === 'w:br' || child.nodeName === 'w:cr') {
          pushLine(currentLine, currentLineHasRed);
          currentLine = '';
          currentLineHasRed = false;
          continue;
        }
        if (child.nodeName === 'w:tab') {
          currentLine += ' ';
          continue;
        }
        if (child.nodeName === 'w:t') {
          currentLine += child.textContent || '';
          currentLineHasRed = currentLineHasRed || runIsRed;
        }
      }
    }
    pushLine(currentLine, currentLineHasRed);
  }
  return lines.join('\n');
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function exportQuizSubmissionsToCsv(rows: QuizSubmission[], questions: QuizQuestion[]) {
  const header = ['submitted_at', 'name', 'email', 'class', 'score', 'total', ...questions.map((question) => `Câu ${question.code}`)];
  const lines = rows.map((row) => {
    const computed = getDisplayScore(row, questions);
    return [
      row.submittedAt,
      row.respondentName,
      row.email,
      row.className,
      computed.score ?? '',
      computed.total ?? '',
      ...questions.map((question) => row.answers[question.id] || ''),
    ].map(csvCell).join(',');
  });
  return [header.map(csvCell).join(','), ...lines].join('\n');
}

export async function exportQuizSubmissionsToWorkbook(rows: QuizSubmission[], questions: QuizQuestion[]) {
  const XLSX = await import('xlsx');
  const data = rows.map((row) => {
    const computed = getDisplayScore(row, questions);
    const record: Record<string, unknown> = {
      'Thời gian nộp': row.submittedAt,
      'Họ tên': row.respondentName,
      Email: row.email,
      Lớp: row.className,
      Điểm: computed.score ?? '',
      'Tổng điểm': computed.total ?? '',
    };
    for (const question of questions) {
      record[`Câu ${question.code}`] = row.answers[question.id] || '';
    }
    return record;
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), 'Ket qua');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

export function downloadArrayBuffer(filename: string, content: ArrayBuffer, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
