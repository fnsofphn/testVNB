import JSZip from 'jszip';
import { supabase } from '@/lib/supabaseClient';
import { buildReflectionActivityMetadata } from '@/features/vtraining/domain/reflectionActivity';
import { createQuizForm, createQuizQuestionSet, sanitizeQuizId, updateQuizFormStatus, type QuizQuestion } from '@/lib/quiz';
import { suniTrainingApi, type SuniTrainingClassActivity } from '@/lib/suni';

export type TrainingLibraryType = 'quiz' | 'reflection' | 'discussion' | 'game';

export type ReflectionQuestion = {
  id: string;
  code: string;
  prompt: string;
  guidance?: string;
};

export type ReflectionVariant = {
  id: string;
  title: string;
  courseTitle?: string;
  questions: ReflectionQuestion[];
};

export const DEFAULT_REFLECTION_QUESTIONS: ReflectionQuestion[] = [
  {
    id: 'q-1',
    code: '1',
    prompt: 'Nêu rõ nội dung cốt lõi mà Anh/Chị cho là quan trọng nhất và lý do tại sao nội dung đó có ý nghĩa đối với công tác quản lý của phòng.',
    guidance: 'Ví dụ: nguyên tắc công bằng - minh bạch, khen thưởng kịp thời, căn cứ minh chứng, chấm điểm thi đua, phối hợp liên phòng...',
  },
  {
    id: 'q-2',
    code: '2',
    prompt: 'Phân tích cách nội dung đó giúp Anh/Chị nhìn lại thực trạng công tác thi đua - khen thưởng của phòng.',
    guidance: 'Nêu 2-3 điểm mà khóa học giúp Anh/Chị nhận ra rõ hơn về những vấn đề phòng đang gặp: chậm trễ trong khen thưởng, thiếu minh chứng, phối hợp yếu, phong trào hình thức...',
  },
  {
    id: 'q-3',
    code: '3',
    prompt: 'Trình bày kế hoạch áp dụng nội dung đã chọn vào công tác quản lý phòng trong 1-3 tháng tới, gồm ít nhất 03 hành động cụ thể, đo lường được.',
    guidance: 'Ví dụ: chuẩn hóa biểu mẫu minh chứng; tổ chức họp rà soát hàng tháng; công bố tiêu chí thi đua của phòng; thiết lập cơ chế khen thưởng nhanh...',
  },
];

export const PLX_REFLECTION_LIBRARY_TITLE = 'Bài thu hoạch cuối khóa Petrolimex';

export const PLX_REFLECTION_QUESTIONS: ReflectionQuestion[] = [
  {
    id: 'plx-part-1',
    code: '1',
    prompt: 'Phần 1 - Đánh giá thực trạng Cửa hàng xăng dầu đang quản lý',
    guidance: [
      'Hãy mô tả ngắn thực trạng đội ngũ CHXD mà Anh/Chị đang quản lý theo 04 nhóm tiêu chí dưới đây.',
      'Chấm điểm từng tiêu chí theo thang 1-5.',
      'Điểm 1: Rất yếu, tồn tại nghiêm trọng, thường xuyên xảy ra sai sót hoặc vi phạm',
      'Điểm 2: Yếu, đã có quy định nhưng thực hiện không ổn định, nhiều điểm cần cải thiện',
      'Điểm 3: Trung bình, đáp ứng mức tối thiểu nhưng chưa tạo được sự khác biệt',
      'Điểm 4: Khá tốt, được thực hiện tương đối ổn định, vẫn còn một số điểm cần nâng cao',
      'Điểm 5: Tốt, thực hiện hiệu quả, ổn định, có thể làm hình mẫu cho cửa hàng khác',
    ].join('\n'),
  },
  {
    id: 'plx-part-2-strengths',
    code: '2.1',
    prompt: 'Phần 2 - Nhận diện vấn đề: 03 điểm mạnh cần phát huy',
    guidance: '03 điểm mạnh theo Anh/Chị đội ngũ CHXD cần phát huy trong thời gian tới là gì?',
  },
  {
    id: 'plx-part-2-issues',
    code: '2.2',
    prompt: 'Phần 2 - Nhận diện vấn đề: 03 vấn đề/tồn tại cần ưu tiên khắc phục',
    guidance: 'Chỉ ra nguyên nhân của các vấn đề/tồn tại đó, gắn với thực tế tại CHXD.',
  },
  {
    id: 'plx-part-3',
    code: '3',
    prompt: 'Phần 3 - Đề xuất giải pháp và kế hoạch hành động 90 ngày',
    guidance: 'Với vai trò là Cửa hàng trưởng CHXD, Anh/Chị hãy đề xuất 03 việc cải tiến trọng tâm nhằm giúp cải thiện phong cách quản lý, thương hiệu và uy tín của Petrolimex tại các CHXD.',
  },
  {
    id: 'plx-part-4',
    code: '4',
    prompt: 'Phần 4 - Cam kết cá nhân của Cửa hàng trưởng',
    guidance: 'Sau khóa học, Anh/Chị cam kết thay đổi điều gì trong phong cách quản lý của bản thân?',
  },
];

export type TrainingLibraryItem = {
  id: string;
  type: TrainingLibraryType;
  title: string;
  description: string;
  status: 'draft' | 'active' | 'archived';
  sourceId?: string | null;
  sourceType?: string | null;
  metadata: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type TrainingActivitySubmission = {
  id: string;
  activityId: string;
  classId: string;
  studentProfileId?: string | null;
  attemptNo: number;
  answers: Record<string, string>;
  attachments: Array<{ name: string; url?: string; path?: string; size?: number; type?: string }>;
  score?: number | null;
  feedback: string;
  status: 'submitted' | 'graded' | 'needs_resubmission' | 'archived';
  submittedAt: string;
  gradedAt?: string | null;
  gradedBy?: string | null;
  metadata: Record<string, unknown>;
};

export type TrainingActivityDraft = {
  id: string;
  activityId: string;
  classId: string;
  studentProfileId: string;
  answers: Record<string, string>;
  metadata: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function requireSupabase() {
  if (!supabase) throw new Error('Supabase VContent chưa được cấu hình.');
  return supabase;
}

function sanitizeId(value: string) {
  return sanitizeQuizId(value) || `item-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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

function mapLibraryRow(row: any): TrainingLibraryItem {
  return {
    id: String(row.id || ''),
    type: row.type || 'quiz',
    title: String(row.title || ''),
    description: String(row.description || ''),
    status: row.status === 'draft' || row.status === 'archived' ? row.status : 'active',
    sourceId: row.source_id || null,
    sourceType: row.source_type || null,
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapSubmissionRow(row: any): TrainingActivitySubmission {
  return {
    id: String(row.id || ''),
    activityId: String(row.activity_id || ''),
    classId: String(row.class_id || ''),
    studentProfileId: row.student_profile_id || null,
    attemptNo: Number(row.attempt_no || 1),
    answers: row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers) ? row.answers : {},
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    score: row.score == null ? null : Number(row.score),
    feedback: String(row.feedback || ''),
    status: row.status || 'submitted',
    submittedAt: String(row.submitted_at || new Date().toISOString()),
    gradedAt: row.graded_at || null,
    gradedBy: row.graded_by || null,
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {},
  };
}

function mapDraftRow(row: any): TrainingActivityDraft {
  return {
    id: String(row.id || ''),
    activityId: String(row.activity_id || ''),
    classId: String(row.class_id || ''),
    studentProfileId: String(row.student_profile_id || ''),
    answers: row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers) ? row.answers : {},
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function extractTextFromDocxFile(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file('word/document.xml')?.async('text');
  if (!documentXml) throw new Error('Không đọc được nội dung Word.');
  const decoded = new DOMParser().parseFromString(documentXml, 'application/xml');
  const lines: string[] = [];
  const appendParagraph = (paragraph: Element) => {
    const value = Array.from(paragraph.getElementsByTagName('w:t')).map((node) => node.textContent || '').join('');
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (trimmed) lines.push(trimmed);
  };
  const appendTable = (table: Element) => {
    const rows = Array.from(table.getElementsByTagName('w:tr'))
      .map((row) => Array.from(row.getElementsByTagName('w:tc'))
        .map((cell) => Array.from(cell.getElementsByTagName('w:t')).map((node) => node.textContent || '').join('').replace(/\s+/g, ' ').trim())
        .filter(Boolean))
      .filter((cells) => cells.length);
    if (rows.length) {
      lines.push('[TABLE]');
      rows.forEach((cells) => lines.push(cells.join(' | ')));
      lines.push('[/TABLE]');
    }
  };
  const body = decoded.getElementsByTagName('w:body')[0];
  for (const child of Array.from(body?.children || [])) {
    if (child.tagName === 'w:p') appendParagraph(child);
    if (child.tagName === 'w:tbl') appendTable(child);
  }
  return lines.join('\n');
}

export function parseReflectionText(text: string) {
  const normalized = text.replace(/\r/g, '').replace(/\u00a0/g, ' ').replace(/&amp;/g, '&');
  const normalizedPlain = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (
    normalizedPlain.includes('bai thu hoach cuoi khoa')
    && normalizedPlain.includes('petrolimex')
    && normalizedPlain.includes('cua hang xang dau')
  ) {
    return {
      title: PLX_REFLECTION_LIBRARY_TITLE,
      variants: [{
        id: 'plx-cht26',
        title: 'PLX CHT26',
        courseTitle: 'Đổi mới phong cách quản lý, văn hoá thương hiệu - trải nghiệm khách hàng',
        questions: PLX_REFLECTION_QUESTIONS,
      }],
    };
  }
  const simpleQuestions = parseSimpleReflectionQuestions(normalized);
  if (simpleQuestions.length) {
    return {
      title: 'Bài thu hoạch',
      variants: [{ id: 'mau-chung', title: 'Mẫu chung', questions: simpleQuestions }],
    };
  }
  const variantMatches = [...normalized.matchAll(/(?:^|\n)\s*BẢN\s+(\d+)\s*[–-]\s*([^\n]+)/gi)];
  const variants: ReflectionVariant[] = [];
  if (!variantMatches.length) {
    const questions = parseReflectionQuestions(normalized);
    return {
      title: normalized.split('\n').find(Boolean)?.trim() || 'Bài thu hoạch',
      variants: [{ id: 'ban-1', title: 'Bản 1', questions: questions.length ? questions : parseParagraphReflectionQuestions(normalized) }],
    };
  }
  variantMatches.forEach((match, index) => {
    const start = match.index || 0;
    const end = variantMatches[index + 1]?.index || normalized.length;
    const block = normalized.slice(start, end).trim();
    const title = `Bản ${match[1]} - ${match[2].trim()}`;
    const courseTitle = block.match(/\(Khóa:\s*([^)]+)\)/i)?.[1]?.trim();
    variants.push({
      id: `ban-${match[1]}`,
      title,
      courseTitle,
      questions: parseReflectionQuestions(block),
    });
  });
  return {
    title: variants[0]?.courseTitle || 'Bài thu hoạch',
    variants,
  };
}

function parseSimpleReflectionQuestions(block: string): ReflectionQuestion[] {
  const questionMatches = [...block.matchAll(/(?:^|\n)\s*Câu\s*hỏi\s*(\d+)\s*:\s*/gi)];
  return questionMatches.map((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = questionMatches[index + 1]?.index || block.length;
    const body = block.slice(start, end).trim();
    const answerMarker = body.search(/(?:^|\n)\s*Câu\s*trả\s*lời\s*:/i);
    const beforeAnswer = answerMarker >= 0 ? body.slice(0, answerMarker).trim() : body;
    const guidanceMatch = beforeAnswer.match(/\(?\s*Gợi\s*ý\s*:\s*([\s\S]*?)\)?\s*$/i);
    const prompt = (guidanceMatch ? beforeAnswer.slice(0, guidanceMatch.index).trim() : beforeAnswer)
      .replace(/\n+/g, ' ')
      .trim();
    const guidance = guidanceMatch?.[1]?.replace(/[()]+$/g, '').trim();
    return {
      id: `q-${match[1]}`,
      code: match[1],
      prompt,
      guidance,
    };
  }).filter((question) => question.prompt);
}

function parseReflectionQuestions(block: string): ReflectionQuestion[] {
  const questionMatches = [...block.matchAll(/(?:^|\n)\s*Câu\s+(\d+)\s*(?:\(([^)]*)\))?\s*:/gi)];
  return questionMatches.map((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = questionMatches[index + 1]?.index || block.length;
    const body = block.slice(start, end).trim();
    const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
    return {
      id: `q-${match[1]}`,
      code: match[1],
      prompt: lines[0] || body,
      guidance: lines.slice(1).join('\n'),
    };
  }).filter((question) => question.prompt);
}

function parseParagraphReflectionQuestions(block: string): ReflectionQuestion[] {
  const paragraphs = block
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return paragraphs.map((paragraph, index) => {
    const guidanceMatch = paragraph.match(/\((?:Ví dụ|Gợi ý)\s*:\s*([^)]+)\)\.?\s*$/i);
    const prompt = (guidanceMatch ? paragraph.slice(0, guidanceMatch.index).trim() : paragraph)
      .replace(/^\d+[\).:-]\s*/, '')
      .trim();
    return {
      id: `q-${index + 1}`,
      code: String(index + 1),
      prompt,
      guidance: guidanceMatch?.[1]?.trim(),
    };
  }).filter((question) => question.prompt);
}

export const trainingLibraryApi = {
  async listItems(type?: TrainingLibraryType) {
    const client = requireSupabase();
    let query = client.from('vcontent_training_library_items').select('*').order('created_at', { ascending: false });
    if (type) query = query.eq('type', type);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map(mapLibraryRow);
  },

  async saveItem(input: {
    id?: string;
    type: TrainingLibraryType;
    title: string;
    description?: string;
    status?: 'draft' | 'active' | 'archived';
    sourceId?: string | null;
    sourceType?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const client = requireSupabase();
    const session = await client.auth.getSession();
    const row = {
      id: input.id || sanitizeId(`${input.type}-${input.title}`),
      type: input.type,
      title: input.title.trim(),
      description: input.description || '',
      status: input.status || 'active',
      source_id: input.sourceId || null,
      source_type: input.sourceType || null,
      metadata: input.metadata || {},
      created_by: session.data.session?.user?.id || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client.from('vcontent_training_library_items').upsert(row).select('*').single();
    if (error) throw new Error(error.message);
    return mapLibraryRow(data);
  },

  async createQuizLibraryItem(input: {
    id?: string;
    questionSetId?: string;
    title: string;
    description?: string;
    questions: QuizQuestion[];
    sourceFileName?: string;
  }) {
    const bundle = await createQuizQuestionSet({
      id: input.questionSetId || input.title,
      name: input.title,
      description: input.description,
      questions: input.questions,
    });
    return this.saveItem({
      id: input.id,
      type: 'quiz',
      title: input.title,
      description: input.description || '',
      sourceId: bundle.set.id,
      sourceType: 'quiz_question_set',
      metadata: {
        questionSetId: bundle.set.id,
        questionCount: input.questions.length,
        sourceFileName: input.sourceFileName || '',
      },
    });
  },

  async createReflectionLibraryItem(input: {
    id?: string;
    title: string;
    description?: string;
    variants: ReflectionVariant[];
    sourceFileName?: string;
  }) {
    return this.saveItem({
      id: input.id,
      type: 'reflection',
      title: input.title,
      description: input.description || '',
      sourceType: 'reflection_template',
      metadata: {
        variants: input.variants,
        sourceFileName: input.sourceFileName || '',
      },
    });
  },

  async deleteItem(id: string) {
    const client = requireSupabase();
    const { error } = await client.from('vcontent_training_library_items').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { deleted: true };
  },

  async assignQuizToClass(input: {
    classId: string;
    courseId?: string | null;
    libraryItem: TrainingLibraryItem;
    title: string;
    questionCount: number;
    durationMinutes: number;
    shuffleQuestions: boolean;
    maxAttempts: number;
    published: boolean;
  }) {
    const questionSetId = String(input.libraryItem.metadata.questionSetId || input.libraryItem.sourceId || '');
    if (!questionSetId) throw new Error('Bài kiểm tra chưa có bộ câu hỏi.');
    const formIdBase = sanitizeQuizId(`${input.classId}-${input.libraryItem.id}-${input.title}`) || 'quiz';
    const formId = `${formIdBase}-${Date.now().toString(36)}`;
    const form = await createQuizForm({
      id: formId,
      title: input.title,
      questionSetId,
      questionCount: input.questionCount,
      durationMinutes: input.durationMinutes,
      shuffleQuestions: input.shuffleQuestions,
      shuffleOptions: false,
      maxAttempts: input.maxAttempts,
      metadata: {
        classId: input.classId,
        courseId: input.courseId || null,
        libraryItemId: input.libraryItem.id,
        activityType: 'quiz',
      },
    });
    const activity = await suniTrainingApi.saveClassActivity({
      classId: input.classId,
      courseId: input.courseId || null,
      type: 'quiz',
      title: input.title,
      description: input.libraryItem.description,
      status: input.published ? 'active' : 'draft',
      sourceId: form.id,
      libraryItemId: input.libraryItem.id,
      metadata: {
        formId: form.id,
        questionSetId,
        questionCount: input.questionCount,
        durationMinutes: input.durationMinutes,
        shuffleQuestions: input.shuffleQuestions,
        maxAttempts: input.maxAttempts,
        retakeCount: Math.max(0, Number(input.maxAttempts || 1) - 1),
      },
    });
    if (!input.published) await updateQuizFormStatus(form.id, 'paused');
    return { form, activity };
  },

  async assignReflectionToClass(input: {
    classId: string;
    courseId?: string | null;
    libraryItem: TrainingLibraryItem;
    title: string;
    maxAttempts: number;
    durationMinutes?: number | string | null;
    published: boolean;
    dueAt?: string | null;
  }) {
    return suniTrainingApi.saveClassActivity({
      classId: input.classId,
      courseId: input.courseId || null,
      type: 'reflection',
      title: input.title,
      description: input.libraryItem.description,
      status: input.published ? 'active' : 'draft',
      sourceId: input.libraryItem.id,
      libraryItemId: input.libraryItem.id,
      closeAt: input.dueAt || null,
      metadata: buildReflectionActivityMetadata({
        libraryItemId: input.libraryItem.id,
        libraryMetadata: input.libraryItem.metadata,
        maxAttempts: input.maxAttempts,
        durationMinutes: input.durationMinutes,
      }),
    });
  },

  async listActivitySubmissions(activityId: string) {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_training_activity_submissions')
      .select('*')
      .eq('activity_id', activityId)
      .order('submitted_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(mapSubmissionRow);
  },

  async listMyActivitySubmissions(activityId: string, studentProfileId?: string | null) {
    const profileId = String(studentProfileId || '').trim();
    if (!profileId) return [] as TrainingActivitySubmission[];
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_training_activity_submissions')
      .select('*')
      .eq('activity_id', activityId)
      .eq('student_profile_id', profileId)
      .order('submitted_at', { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);
    return (data || []).map(mapSubmissionRow);
  },

  async getReflectionDraft(activityId: string, studentProfileId?: string | null) {
    const profileId = String(studentProfileId || '').trim();
    if (!activityId || !profileId) return null as TrainingActivityDraft | null;
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_training_activity_drafts')
      .select('*')
      .eq('activity_id', activityId)
      .eq('student_profile_id', profileId)
      .maybeSingle();
    if (error) {
      if (/vcontent_training_activity_drafts|relation .* does not exist|column .* does not exist/i.test(error.message || '')) return null;
      throw new Error(error.message);
    }
    return data ? mapDraftRow(data) : null;
  },

  async upsertReflectionDraft(input: {
    activity: SuniTrainingClassActivity;
    studentProfileId?: string | null;
    answers: Record<string, string>;
    metadata?: Record<string, unknown>;
  }) {
    const profileId = String(input.studentProfileId || '').trim();
    if (!profileId) return null as TrainingActivityDraft | null;
    const client = requireSupabase();
    const row = {
      activity_id: input.activity.id,
      class_id: input.activity.classId,
      student_profile_id: profileId,
      answers: input.answers || {},
      metadata: input.metadata || {},
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from('vcontent_training_activity_drafts')
      .upsert(row, { onConflict: 'activity_id,student_profile_id' })
      .select('*')
      .single();
    if (error) {
      if (/vcontent_training_activity_drafts|relation .* does not exist|column .* does not exist/i.test(error.message || '')) return null;
      throw new Error(error.message);
    }
    return data ? mapDraftRow(data) : null;
  },

  async deleteReflectionDraft(activityId: string, studentProfileId?: string | null) {
    const profileId = String(studentProfileId || '').trim();
    if (!activityId || !profileId) return { deleted: false };
    const client = requireSupabase();
    const { error } = await client
      .from('vcontent_training_activity_drafts')
      .delete()
      .eq('activity_id', activityId)
      .eq('student_profile_id', profileId);
    if (error) {
      if (/vcontent_training_activity_drafts|relation .* does not exist|column .* does not exist/i.test(error.message || '')) return { deleted: false };
      throw new Error(error.message);
    }
    return { deleted: true };
  },

  async submitReflection(input: {
    activity: SuniTrainingClassActivity;
    answers: Record<string, string>;
    allowEmpty?: boolean;
    metadata?: Record<string, unknown>;
  }) {
    const client = requireSupabase();
    const hasTextAnswer = Object.values(input.answers || {}).some((value) => String(value || '').trim());
    if (!input.allowEmpty && !hasTextAnswer) throw new Error('Cần nhập bài làm trước khi gửi.');
    const idempotencyKey = createClientId();
    const data = await runWithTransientRetry(async () => {
      const result = await client.rpc('vtraining_submit_reflection', {
        p_activity_id: input.activity.id,
        p_answers: input.answers || {},
        p_attachments: [],
        p_metadata: input.metadata || {},
        p_idempotency_key: idempotencyKey,
        p_submission_id: null,
        p_allow_empty: Boolean(input.allowEmpty),
      });
      if (result.error) throw result.error;
      return result.data;
    });
    return mapSubmissionRow(data);
  },

  async gradeReflection(input: {
    submission: TrainingActivitySubmission;
    score: number;
    feedback?: string;
    status?: 'graded' | 'needs_resubmission';
  }) {
    const client = requireSupabase();
    const score = Math.max(0, Math.min(10, Number(input.score || 0)));
    const idempotencyKey = createClientId();
    const data = await runWithTransientRetry(async () => {
      const result = await client.rpc('vtraining_grade_reflection', {
        p_submission_id: input.submission.id,
        p_score: score,
        p_feedback: input.feedback || '',
        p_status: input.status || 'graded',
        p_idempotency_key: idempotencyKey,
      });
      if (result.error) throw result.error;
      return result.data;
    });
    return mapSubmissionRow(data?.submission);
  },

  async updateReflectionSubmissionAnswers(input: {
    submission: TrainingActivitySubmission;
    answers: Record<string, string>;
    status?: 'submitted' | 'graded' | 'needs_resubmission' | 'archived';
    metadata?: Record<string, unknown>;
  }) {
    const client = requireSupabase();
    const idempotencyKey = createClientId();
    const data = await runWithTransientRetry(async () => {
      const result = await client.rpc('vtraining_submit_reflection', {
        p_activity_id: input.submission.activityId,
        p_answers: input.answers || {},
        p_attachments: input.submission.attachments || [],
        p_metadata: input.metadata || {},
        p_idempotency_key: idempotencyKey,
        p_submission_id: input.submission.id,
        p_allow_empty: true,
      });
      if (result.error) throw result.error;
      return result.data;
    });
    return mapSubmissionRow(data);
  },

  async deleteReflectionSubmission(submission: TrainingActivitySubmission | string) {
    const client = requireSupabase();
    const id = typeof submission === 'string' ? submission.trim() : String(submission.id || '').trim();
    if (!id) return { deleted: false };
    const idempotencyKey = createClientId();
    const data = await runWithTransientRetry(async () => {
      const result = await client.rpc('vtraining_delete_reflection', {
        p_submission_id: id,
        p_idempotency_key: idempotencyKey,
      });
      if (result.error) throw result.error;
      return result.data;
    });
    return {
      deleted: Boolean(data?.deleted),
      orphanAttachments: Array.isArray(data?.orphanAttachments) ? data.orphanAttachments : [],
    };
  },
};
