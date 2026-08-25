import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabaseClient';
import { STUDENT_SURVEY_SCHEMA, type StudentSurveySchema } from '@/lib/studentSurveySchema';
import { getSurveyTypeDefinition, type SurveyTypeId } from '@/modules/surveys/surveyTypes';

export type SurveyQuestionType = 'rating' | 'text' | 'single' | 'multiple';

export type StudentSurveyQuestion = {
  id: string;
  code: string;
  prompt: string;
  type: SurveyQuestionType;
  required: boolean;
  sectionId: string;
  sectionTitle: string;
  groupTitle?: string;
  hint?: string;
  maxSelections?: number;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
};

export type StudentSurveyDisplaySettings = {
  surveyType?: SurveyTypeId;
  templateVariant?: 'default' | 'v2' | 'plx-tna' | 'generic' | 'prompt-practice' | 'ai-power-practice';
  customSections?: Array<{ id: string; title: string; description?: string }>;
  customQuestions?: StudentSurveyQuestion[];
  contractVersion?: string;
  contractSourceName?: string;
  accessMode?: 'public' | 'vtraining';
  loginUrl?: string;
  validFrom?: string;
  validTo?: string;
  requireRespondentName?: boolean;
  requireRespondentEmail?: boolean;
  practiceGuideVideoUrls?: string[];
  browserTitle: string;
  bannerEyebrow: string;
  bannerTitle: string;
  bannerSubtitle: string;
  introTitle: string;
  introBody: string;
  introButtonLabel: string;
  submitButtonLabel: string;
  thankYouMessage: string;
  footerText: string;
  primaryColor: string;
  accentColor: string;
};

export type StudentSurveyForm = {
  id: string;
  title: string;
  intro: string;
  status: 'active' | 'paused';
  createdAt: string;
  settings: StudentSurveyDisplaySettings;
};

export type StudentSurveyRespondent = {
  unitName: string;
  contactName: string;
  positionName: string;
  phone: string;
  email: string;
  completedOn: string;
};

export type StudentSurveySubmission = {
  id: string;
  formId: string;
  respondent: StudentSurveyRespondent;
  answers: Record<string, string>;
  submittedAt: string;
};

export type StudentSurveySubmissionPage = {
  rows: StudentSurveySubmission[];
  total: number;
  page: number;
  pageSize: number;
};

export type StudentSurveyFormBundle = {
  form: StudentSurveyForm;
  questions: StudentSurveyQuestion[];
  sections: Array<{ id: string; title: string; description?: string }>;
};

export type StudentSurveyFormInput = Partial<Pick<StudentSurveyForm, 'id' | 'title' | 'intro'>> & {
  settings?: Partial<StudentSurveyDisplaySettings>;
};

const IMPACT_OPTIONS = [
  { value: '1', label: '1 sao' },
  { value: '2', label: '2 sao' },
  { value: '3', label: '3 sao' },
  { value: '4', label: '4 sao' },
  { value: '5', label: '5 sao' },
];

const DEFAULT_DISPLAY_SETTINGS: StudentSurveyDisplaySettings = {
  surveyType: 'evnspc-tnkh',
  templateVariant: 'default',
  accessMode: 'public',
  loginUrl: '',
  validFrom: '',
  validTo: '',
  requireRespondentName: false,
  requireRespondentEmail: false,
  browserTitle: 'EVNSPC - Khảo sát TNKH',
  bannerEyebrow: 'Tập đoàn Điện lực Việt Nam - Tổng Công ty Điện lực miền Nam',
  bannerTitle: 'Phiếu thu thập thông tin phục vụ xây dựng Bộ Chuẩn mực Hành vi TNKH',
  bannerSubtitle: 'Theo Chỉ thị 840/CT-EVN | Đơn vị tư vấn: PeopleOne',
  introTitle: 'Mục đích',
  introBody:
    'Phiếu khảo sát được tổ chức theo 6 hành trình khách hàng trọng tâm. Người điền lần lượt cung cấp thông tin theo từng nhóm khách hàng để nhận diện khác biệt về kỳ vọng và điểm đau.',
  introButtonLabel: 'Bắt đầu',
  submitButtonLabel: 'Gửi kết quả',
  thankYouMessage: 'Cảm ơn Anh/Chị đã dành thời gian cung cấp thông tin.',
  footerText: 'Tập đoàn Điện lực Việt Nam | Tổng Công ty Điện lực miền Nam | Peopleone | ISO 10001:2018',
  primaryColor: '#003C8F',
  accentColor: '#F7941D',
};

function normalizeSurveyTypeId(value?: string | null): SurveyTypeId {
  return getSurveyTypeDefinition(value || undefined).id;
}

const ALL_SEGMENTS = [...STUDENT_SURVEY_SCHEMA.segments.household, ...STUDENT_SURVEY_SCHEMA.segments.business];

function normalizeVietnameseText(value: string) {
  const text = String(value || '');
  if (!text) return '';
  if (!/[\u00c3\u00c2\u00c4\u00c6]/.test(text)) return text;
  try {
    const bytes = Uint8Array.from([...text].map((char) => char.charCodeAt(0) & 0xff));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return text;
  }
}

function repairLegacyQuestionMarkText(value: string, fallback = '') {
  const text = String(value || '');
  if (!text.includes('?')) return text;

  let next = text;
  const replacements: Array<[RegExp, string]> = [
    [/Phi\?u/gi, 'Phiếu'],
    [/Kh\?o s\?t/gi, 'Khảo sát'],
    [/kh\?o s\?t/gi, 'khảo sát'],
    [/nguy\?n/gi, 'nguyên'],
    [/giao di\?n/gi, 'giao diện'],
    [/g\?c/gi, 'gốc'],
    [/h\?nh tr\?nh/gi, 'hành trình'],
    [/kh\?ch h\?ng/gi, 'khách hàng'],
    [/n\?i dung/gi, 'nội dung'],
    [/th\?ng tin/gi, 'thông tin'],
    [/hi\?n th\?/gi, 'hiển thị'],
    [/v\?/gi, 'về'],
    [/c\?u h\?i/gi, 'câu hỏi'],
    [/m\?/gi, 'mở'],
    [/t\?o/gi, 'tạo'],
    [/li?n k?t/gi, 'liên kết'],
  ];

  for (const [pattern, replacement] of replacements) {
    next = next.replace(pattern, replacement);
  }

  const remainQuestionMarks = (next.match(/\?/g) || []).length;
  if (remainQuestionMarks >= 2 && fallback) return fallback;
  return next;
}

function repairDisplayText(value: string | undefined, fallback: string) {
  const normalized = normalizeVietnameseText(value || '');
  if (!normalized.trim()) return fallback;
  if (/\uFFFD/.test(normalized)) return fallback;
  return repairLegacyQuestionMarkText(normalized, fallback);
}

function repairOptionalDisplayText(value: string | undefined | null, fallback: string) {
  if (value === undefined || value === null) return fallback;
  const normalized = normalizeVietnameseText(value);
  if (!normalized.trim()) return '';
  if (/\uFFFD/.test(normalized)) return fallback;
  return repairLegacyQuestionMarkText(normalized, fallback);
}

function normalizeDisplaySettings(
  settings?: Partial<StudentSurveyDisplaySettings> | null,
  fallbacks: StudentSurveyDisplaySettings = DEFAULT_DISPLAY_SETTINGS,
): Partial<StudentSurveyDisplaySettings> {
  if (!settings) return {};
  const surveyType = normalizeSurveyTypeId(settings.surveyType || (settings.templateVariant === 'plx-tna' ? 'plx-tna' : undefined));
  const templateVariant =
    settings.templateVariant === 'v2' ||
    settings.templateVariant === 'plx-tna' ||
    settings.templateVariant === 'generic' ||
    settings.templateVariant === 'prompt-practice' ||
    settings.templateVariant === 'ai-power-practice'
      ? settings.templateVariant
      : settings.templateVariant
        ? 'default'
        : fallbacks.templateVariant;
  return {
    surveyType,
    templateVariant,
    customSections: Array.isArray(settings.customSections) ? settings.customSections : undefined,
    customQuestions: Array.isArray(settings.customQuestions) ? settings.customQuestions : undefined,
    contractVersion: String(settings.contractVersion || '').trim(),
    contractSourceName: String(settings.contractSourceName || '').trim(),
    accessMode: settings.accessMode === 'vtraining' ? 'vtraining' : 'public',
    loginUrl: String(settings.loginUrl || '').trim(),
    validFrom: String(settings.validFrom || '').trim(),
    validTo: String(settings.validTo || '').trim(),
    requireRespondentName: Boolean(settings.requireRespondentName),
    requireRespondentEmail: Boolean(settings.requireRespondentEmail),
    practiceGuideVideoUrls: Array.isArray(settings.practiceGuideVideoUrls)
      ? settings.practiceGuideVideoUrls.slice(0, 4).map((value) => String(value || '').trim())
      : fallbacks.practiceGuideVideoUrls?.slice(0, 4).map((value) => String(value || '').trim()),
    browserTitle: repairDisplayText(settings.browserTitle, fallbacks.browserTitle),
    bannerEyebrow: repairDisplayText(settings.bannerEyebrow, fallbacks.bannerEyebrow),
    bannerTitle: repairOptionalDisplayText(settings.bannerTitle, fallbacks.bannerTitle),
    bannerSubtitle: repairOptionalDisplayText(settings.bannerSubtitle, fallbacks.bannerSubtitle),
    introTitle: repairDisplayText(settings.introTitle, fallbacks.introTitle),
    introBody: repairDisplayText(settings.introBody, fallbacks.introBody),
    introButtonLabel: repairDisplayText(settings.introButtonLabel, fallbacks.introButtonLabel),
    submitButtonLabel: repairDisplayText(settings.submitButtonLabel, fallbacks.submitButtonLabel),
    thankYouMessage: repairDisplayText(settings.thankYouMessage, fallbacks.thankYouMessage),
    footerText: repairDisplayText(settings.footerText, fallbacks.footerText),
    primaryColor: settings.primaryColor || '',
    accentColor: settings.accentColor || '',
  };
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.');
  return supabase;
}

function isMissingSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /student_survey|settings|relation .* does not exist|column .* does not exist/i.test(message);
}

function getSegmentLabel(segmentId: string) {
  return ALL_SEGMENTS.find((item) => item.id === segmentId)?.label || segmentId;
}

function normalizeTouchpointTitle(title: string) {
  return String(title || '').replace(/^\d+\.\d+\s*/, '');
}

function makeFormId() {
  return `evnspc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function makeSubmissionId() {
  return `SSS-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function mergeDisplaySettings(settings?: Partial<StudentSurveyDisplaySettings> | null): StudentSurveyDisplaySettings {
  const surveyType = normalizeSurveyTypeId(settings?.surveyType || (settings?.templateVariant === 'plx-tna' ? 'plx-tna' : undefined));
  const surveyDefaults = {
    ...DEFAULT_DISPLAY_SETTINGS,
    ...getSurveyTypeDefinition(surveyType).defaultSettings,
    surveyType,
  } as StudentSurveyDisplaySettings;
  return {
    ...surveyDefaults,
    ...normalizeDisplaySettings(settings, surveyDefaults),
    surveyType,
  };
}

function buildJourneyQuestions() {
  const questions: StudentSurveyQuestion[] = [];

  for (const journey of STUDENT_SURVEY_SCHEMA.journeys) {
    for (const segmentId of journey.segmentIds) {
      const segmentLabel = getSegmentLabel(segmentId);

      for (const touchpoint of journey.touchpoints) {
        const touchpointTitle = normalizeTouchpointTitle(touchpoint.title);
        const prefix = `${segmentId}_${journey.id}_${touchpoint.id}`;

        touchpoint.issues.forEach((issue, issueIndex) => {
          questions.push({
            id: `${prefix}_issue_${issueIndex + 1}`,
            code: `${journey.id.toUpperCase()}-${segmentId.toUpperCase()}-${touchpoint.id.toUpperCase()}-I${issueIndex + 1}`,
            prompt: issue,
            type: 'rating',
            required: true,
            sectionId: journey.id,
            sectionTitle: journey.title,
            groupTitle: `${segmentLabel} · ${touchpointTitle}`,
            options: IMPACT_OPTIONS,
          });
        });

        questions.push({
          id: `${prefix}_note`,
          code: `${journey.id.toUpperCase()}-${segmentId.toUpperCase()}-${touchpoint.id.toUpperCase()}-NOTE`,
          prompt: `Ghi chú thực tế tại đơn vị cho "${touchpointTitle}"`,
          type: 'text',
          required: false,
          sectionId: journey.id,
          sectionTitle: journey.title,
          groupTitle: `${segmentLabel} · ${touchpointTitle}`,
          placeholder: 'Nhập ghi chú, bối cảnh hoặc ví dụ cụ thể...',
        });
      }
    }
  }

  return questions;
}

function buildExtraQuestions() {
  const questions: StudentSurveyQuestion[] = [
    {
      id: 'extra_common_questions',
      code: 'EXTRA-C1',
      prompt: 'Nội dung 1 - Câu hỏi và tình huống thường gặp nhất',
      type: 'text',
      required: false,
      sectionId: 'extra',
      sectionTitle: 'Nội dung bổ sung',
      placeholder: 'Liệt kê các câu hỏi hoặc tình huống thường gặp...',
    },
  ];

  STUDENT_SURVEY_SCHEMA.extras.negativeBehaviors.forEach((item, index) => {
    questions.push({
      id: `negative_behavior_${index + 1}`,
      code: `EXTRA-NB${index + 1}`,
      prompt: item,
      type: 'rating',
      required: false,
      sectionId: 'extra',
      sectionTitle: 'Nội dung bổ sung',
      groupTitle: 'Nội dung 2 - Hành vi tiêu cực lặp lại trong 12 tháng',
      options: IMPACT_OPTIONS,
    });
  });

  questions.push(
    {
      id: 'negative_behavior_other',
      code: 'EXTRA-NB-OTHER',
      prompt: 'Hành vi tiêu cực khác (bổ sung)',
      type: 'text',
      required: false,
      sectionId: 'extra',
      sectionTitle: 'Nội dung bổ sung',
      groupTitle: 'Nội dung 2 - Hành vi tiêu cực lặp lại trong 12 tháng',
    },
    {
      id: 'negative_behavior_example',
      code: 'EXTRA-NB-EXAMPLE',
      prompt: 'Ví dụ cụ thể (bối cảnh, lời nói, phản ứng khách hàng)',
      type: 'text',
      required: false,
      sectionId: 'extra',
      sectionTitle: 'Nội dung bổ sung',
      groupTitle: 'Nội dung 2 - Hành vi tiêu cực lặp lại trong 12 tháng',
    },
  );

  STUDENT_SURVEY_SCHEMA.extras.supportNeeds.forEach((group) => {
    group.fields.forEach((field, fieldIndex) => {
      questions.push({
        id: `${group.id}_${fieldIndex + 1}`,
        code: `EXTRA-${group.id.toUpperCase()}-${fieldIndex + 1}`,
        prompt: field,
        type: 'text',
        required: false,
        sectionId: 'extra',
        sectionTitle: 'Nội dung bổ sung',
        groupTitle: `Nội dung 3 - ${group.title}`,
      });
    });
  });

  STUDENT_SURVEY_SCHEMA.extras.energyFields.forEach((field, index) => {
    questions.push({
      id: `energy_${index + 1}`,
      code: `EXTRA-ENERGY-${index + 1}`,
      prompt: field.label,
      type: 'text',
      required: false,
      sectionId: 'extra',
      sectionTitle: 'Nội dung bổ sung',
      groupTitle: 'Chuyển dịch năng lượng - Nhu cầu thực tế tại địa bàn',
    });
  });

  STUDENT_SURVEY_SCHEMA.extras.measurementFields.forEach((field, index) => {
    questions.push({
      id: `measurement_${index + 1}`,
      code: `EXTRA-MEASURE-${index + 1}`,
      prompt: field.label,
      type: 'text',
      required: false,
      sectionId: 'extra',
      sectionTitle: 'Nội dung bổ sung',
      groupTitle: 'Đo lường CSAT/NPS/CES và phối hợp nội bộ TTCSKH – Công ty Điện lực',
    });
  });

  return questions;
}

const DEFAULT_QUESTIONS = [...buildJourneyQuestions(), ...buildExtraQuestions()];

function getQuestionsForSurveyType(surveyType?: string) {
  const definition = getSurveyTypeDefinition(surveyType);
  const questions = definition.id === 'evnspc-tnkh' ? DEFAULT_QUESTIONS : definition.questions;
  return questions.map((question) => ({
    ...question,
    prompt: normalizeVietnameseText(question.prompt || ''),
    sectionTitle: normalizeVietnameseText(question.sectionTitle || ''),
    groupTitle: question.groupTitle ? normalizeVietnameseText(question.groupTitle) : undefined,
    placeholder: question.placeholder ? normalizeVietnameseText(question.placeholder) : undefined,
  }));
}

function mapFormRow(row: any): StudentSurveyForm {
  const settings = mergeDisplaySettings(row.settings);
  const title = repairDisplayText(String(row.title || ''), settings.browserTitle || DEFAULT_DISPLAY_SETTINGS.browserTitle);
  const intro = repairDisplayText(String(row.intro || ''), settings.introBody || DEFAULT_DISPLAY_SETTINGS.introBody);
  return {
    id: String(row.id || ''),
    title,
    intro,
    status: row.status === 'paused' ? 'paused' : 'active',
    createdAt: String(row.created_at || new Date().toISOString()),
    settings,
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSubmissionAnswers(rawAnswers: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObjectRecord(rawAnswers)) return out;

  const put = (key: string, value: unknown) => {
    if (!key) return;
    if (value === null || value === undefined) return;
    const text = normalizeVietnameseText(String(value)).trim();
    if (!text) return;
    out[key] = text;
  };

  const hasLegacyShape =
    isObjectRecord(rawAnswers.iw) ||
    isObjectRecord(rawAnswers.notes) ||
    isObjectRecord(rawAnswers.dr) ||
    isObjectRecord(rawAnswers.ns) ||
    isObjectRecord(rawAnswers.nn) ||
    isObjectRecord(rawAnswers.snd) ||
    isObjectRecord(rawAnswers.ed) ||
    isObjectRecord(rawAnswers.mf);

  if (!hasLegacyShape) {
    for (const [key, value] of Object.entries(rawAnswers)) {
      if (Array.isArray(value)) {
        put(key, value.map((item) => String(item || '').trim()).filter(Boolean).join('; '));
        continue;
      }
      if (isObjectRecord(value)) continue;
      put(key, value);
    }
    return out;
  }

  const iw = isObjectRecord(rawAnswers.iw) ? rawAnswers.iw : {};
  for (const [key, value] of Object.entries(iw)) {
    const match = key.match(/^(.*)_i(\d+)$/);
    if (match) {
      const issueIndex = Number(match[2]) + 1;
      put(`${match[1]}_issue_${issueIndex}`, value);
      continue;
    }
    put(key, value);
  }

  const notes = isObjectRecord(rawAnswers.notes) ? rawAnswers.notes : {};
  for (const [key, value] of Object.entries(notes)) put(key, value);

  const dr = isObjectRecord(rawAnswers.dr) ? rawAnswers.dr : {};
  const c1 = Array.isArray(dr.c1) ? dr.c1 : [];
  const mergedC1 = c1.map((item) => String(item || '').trim()).filter(Boolean).join('\n');
  if (mergedC1) put('extra_common_questions', mergedC1);

  const ns = isObjectRecord(rawAnswers.ns) ? rawAnswers.ns : {};
  for (const [key, value] of Object.entries(ns)) {
    const match = key.match(/^nb(\d+)$/i);
    if (!match) continue;
    put(`negative_behavior_${Number(match[1]) + 1}`, value);
  }

  const nn = isObjectRecord(rawAnswers.nn) ? rawAnswers.nn : {};
  put('negative_behavior_other', nn.other);
  put('negative_behavior_example', nn.ex);

  const snd = isObjectRecord(rawAnswers.snd) ? rawAnswers.snd : {};
  for (const [key, value] of Object.entries(snd)) {
    const match = key.match(/^([a-z0-9]+)_(\d+)$/i);
    if (!match) continue;
    put(`${match[1]}_${Number(match[2]) + 1}`, value);
  }

  const ed = isObjectRecord(rawAnswers.ed) ? rawAnswers.ed : {};
  for (const [key, value] of Object.entries(ed)) {
    const match = key.match(/^pv(\d+)$/i);
    if (!match) continue;
    put(`energy_${Number(match[1])}`, value);
  }

  const mf = isObjectRecord(rawAnswers.mf) ? rawAnswers.mf : {};
  for (const [key, value] of Object.entries(mf)) {
    const match = key.match(/^m(\d+)$/i);
    if (!match) continue;
    put(`measurement_${Number(match[1])}`, value);
  }

  return out;
}

function mapSubmissionRow(row: any): StudentSurveySubmission {
  const rawAnswers = row.answers && typeof row.answers === 'object' ? row.answers : {};
  return {
    id: String(row.id || ''),
    formId: String(row.form_id || ''),
    respondent: {
      unitName: normalizeVietnameseText(String(row.unit_name || '')),
      contactName: normalizeVietnameseText(String(row.contact_name || '')),
      positionName: normalizeVietnameseText(String(row.position_name || '')),
      phone: normalizeVietnameseText(String(row.phone || '')),
      email: normalizeVietnameseText(String(row.email || '')),
      completedOn: normalizeVietnameseText(String(row.completed_on || '')),
    },
    answers: normalizeSubmissionAnswers(rawAnswers),
    submittedAt: String(row.submitted_at || new Date().toISOString()),
  };
}

async function listStudentSurveyFormsPrimary() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('vcontent_student_survey_forms')
    .select('id,title,intro,status,created_at,settings')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapFormRow);
}

async function listStudentSurveyFormsLegacy() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('vcontent_student_survey_forms')
    .select('id,title,intro,status,created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => mapFormRow({ ...row, settings: null }));
}

export async function listStudentSurveyForms() {
  try {
    return await listStudentSurveyFormsPrimary();
  } catch (error) {
    if (isMissingSchemaError(error)) {
      try {
        return await listStudentSurveyFormsLegacy();
      } catch (legacyError) {
        if (isMissingSchemaError(legacyError)) return [];
        throw legacyError;
      }
    }
    throw error;
  }
}

export function sanitizeStudentSurveyFormId(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getStudentSurveyQuestions(surveyType?: string) {
  return getQuestionsForSurveyType(surveyType);
}

export function getJourneyDefinitions(surveyType?: string) {
  return getSurveyTypeDefinition(surveyType).sections;
}

export function getStudentSurveySchema(surveyType?: string): StudentSurveySchema {
  return getSurveyTypeDefinition(surveyType).schema || STUDENT_SURVEY_SCHEMA;
}

export function getDefaultStudentSurveyDisplaySettings(surveyType?: string) {
  return mergeDisplaySettings({ surveyType: normalizeSurveyTypeId(surveyType) });
}

export async function createStudentSurveyForm(input?: StudentSurveyFormInput) {
  const client = requireSupabase();
  const sessionResult = await client.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;

  const requestedId = sanitizeStudentSurveyFormId(String(input?.id || ''));
  const formId = requestedId || makeFormId();
  const surveyType = normalizeSurveyTypeId(input?.settings?.surveyType);
  if (requestedId) {
    const existing = await getStudentSurveyForm(formId);
    if (existing) throw new Error('Mã link này đã tồn tại. Hãy chọn mã khác.');
  }

  const payload = {
    id: formId,
    title: input?.title?.trim() || 'EVNSPC - Phiếu khảo sát TNKH',
    intro:
      input?.intro?.trim() ||
      'Phiếu khảo sát được tổ chức theo 6 hành trình khách hàng trọng tâm, giữ nguyên giao diện HTML mẫu và lưu dữ liệu trên Supabase.',
    status: 'active',
    settings: mergeDisplaySettings({ ...input?.settings, surveyType }),
    created_by_auth_user_id: sessionResult.data.session?.user?.id || null,
  };

  try {
    const { data, error } = await client
      .from('vcontent_student_survey_forms')
      .insert(payload)
      .select('id,title,intro,status,created_at,settings')
      .single();
    if (error) throw error;
    return mapFormRow(data);
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    const { data, error: legacyError } = await client
      .from('vcontent_student_survey_forms')
      .insert({
        id: payload.id,
        title: payload.title,
        intro: payload.intro,
        status: payload.status,
        created_by_auth_user_id: payload.created_by_auth_user_id,
      })
      .select('id,title,intro,status,created_at')
      .single();
    if (legacyError) throw legacyError;
    return mapFormRow({ ...data, settings: payload.settings });
  }
}

export async function getStudentSurveyForm(formId: string) {
  const client = requireSupabase();
  try {
    const { data, error } = await client
      .from('vcontent_student_survey_forms')
      .select('id,title,intro,status,created_at,settings')
      .eq('id', formId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapFormRow(data) : null;
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    const { data, error: legacyError } = await client
      .from('vcontent_student_survey_forms')
      .select('id,title,intro,status,created_at')
      .eq('id', formId)
      .maybeSingle();
    if (legacyError) throw legacyError;
    return data ? mapFormRow({ ...data, settings: null }) : null;
  }
}

export async function getStudentSurveyFormBundle(formId: string): Promise<StudentSurveyFormBundle | null> {
  try {
    const form = await getStudentSurveyForm(formId);
    if (!form) return null;
    return {
      form,
      questions: form.settings.customQuestions?.length ? form.settings.customQuestions : getQuestionsForSurveyType(form.settings.surveyType),
      sections: form.settings.customSections?.length ? form.settings.customSections : getSurveyTypeDefinition(form.settings.surveyType).sections,
    };
  } catch (error) {
    if (isMissingSchemaError(error)) return null;
    throw error;
  }
}

export function getStudentSurveyAvailability(
  form: StudentSurveyForm | null,
  options: { authenticated?: boolean; now?: Date } = {},
) {
  if (!form) return { available: false, reason: 'missing' as const };
  if (form.status !== 'active') return { available: false, reason: 'paused' as const };

  const now = options.now || new Date();
  const validFrom = form.settings.validFrom ? new Date(form.settings.validFrom) : null;
  const validTo = form.settings.validTo ? new Date(form.settings.validTo) : null;
  if (validFrom && !Number.isNaN(validFrom.getTime()) && now < validFrom) return { available: false, reason: 'not_started' as const };
  if (validTo && !Number.isNaN(validTo.getTime()) && now > validTo) return { available: false, reason: 'expired' as const };
  if (form.settings.accessMode === 'vtraining' && !options.authenticated) return { available: false, reason: 'login_required' as const };

  return { available: true, reason: 'available' as const };
}

export async function updateStudentSurveyFormDetails(formId: string, input: Omit<StudentSurveyFormInput, 'id'>) {
  const client = requireSupabase();
  const surveyType = normalizeSurveyTypeId(input.settings?.surveyType);
  const payload = {
    title: input.title?.trim() || 'EVNSPC - Phiếu khảo sát TNKH',
    intro: input.intro?.trim() || '',
    settings: mergeDisplaySettings({ ...input.settings, surveyType }),
  };

  try {
    const { data, error } = await client
      .from('vcontent_student_survey_forms')
      .update(payload)
      .eq('id', formId)
      .select('id,title,intro,status,created_at,settings')
      .single();
    if (error) throw error;
    return mapFormRow(data);
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    const { data, error: legacyError } = await client
      .from('vcontent_student_survey_forms')
      .update({
        title: payload.title,
        intro: payload.intro,
      })
      .eq('id', formId)
      .select('id,title,intro,status,created_at')
      .single();
    if (legacyError) throw legacyError;
    return mapFormRow({ ...data, settings: payload.settings });
  }
}

export async function updateStudentSurveyFormStatus(formId: string, status: StudentSurveyForm['status']) {
  const client = requireSupabase();
  try {
    const { data, error } = await client
      .from('vcontent_student_survey_forms')
      .update({ status })
      .eq('id', formId)
      .select('id,title,intro,status,created_at,settings')
      .single();
    if (error) throw error;
    return mapFormRow(data);
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    const { data, error: legacyError } = await client
      .from('vcontent_student_survey_forms')
      .update({ status })
      .eq('id', formId)
      .select('id,title,intro,status,created_at')
      .single();
    if (legacyError) throw legacyError;
    return mapFormRow({ ...data, settings: null });
  }
}

export async function deleteStudentSurveyForm(formId: string) {
  const client = requireSupabase();
  const targetId = sanitizeStudentSurveyFormId(formId);
  if (!targetId) throw new Error('Thiếu mã form cần xóa.');

  const { data, error } = await client
    .from('vcontent_student_survey_forms')
    .delete()
    .eq('id', targetId)
    .select('id');

  if (error) throw error;
  if (!(data || []).length) throw new Error('Không tìm thấy form cần xóa hoặc tài khoản chưa có quyền xóa.');
}

export async function listStudentSurveySubmissions(formId?: string) {
  return listAllStudentSurveySubmissions(formId);
}

export async function listStudentSurveySubmissionsPage(input: { formId?: string; page?: number; pageSize?: number } = {}): Promise<StudentSurveySubmissionPage> {
  const client = requireSupabase();
  const page = Math.max(1, Math.floor(Number(input.page || 1)));
  const pageSize = Math.max(1, Math.min(500, Math.floor(Number(input.pageSize || 50))));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = client
    .from('vcontent_student_survey_submissions')
    .select('id,form_id,unit_name,contact_name,position_name,phone,email,completed_on,answers,submitted_at', { count: 'exact' })
    .order('submitted_at', { ascending: false })
    .range(from, to);
  if (input.formId) query = query.eq('form_id', input.formId);
  const { data, error, count } = await query;
  if (error) throw error;
  return {
    rows: (data || []).map(mapSubmissionRow),
    total: Number(count || 0),
    page,
    pageSize,
  };
}

export async function countStudentSurveySubmissionsByFormIds(formIds: string[]) {
  const client = requireSupabase();
  const uniqueFormIds = [...new Set(formIds.map((item) => sanitizeStudentSurveyFormId(item)).filter(Boolean))];
  const entries = await Promise.all(
    uniqueFormIds.map(async (formId) => {
      const { count, error } = await client
        .from('vcontent_student_survey_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('form_id', formId);
      if (error) throw error;
      return [formId, Number(count || 0)] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<string, number>;
}

export async function listAllStudentSurveySubmissions(formId?: string, pageSize = 500) {
  const rows: StudentSurveySubmission[] = [];
  let page = 1;
  let total = Infinity;
  const safePageSize = Math.max(1, Math.min(500, Math.floor(Number(pageSize || 500))));
  while (rows.length < total) {
    const chunk = await listStudentSurveySubmissionsPage({ formId, page, pageSize: safePageSize });
    rows.push(...chunk.rows);
    total = chunk.total;
    if (!chunk.rows.length || rows.length >= total) break;
    page += 1;
  }
  return rows;
}

export async function deleteStudentSurveySubmission(submissionId: string) {
  const client = requireSupabase();
  const targetId = String(submissionId || '').trim();
  if (!targetId) throw new Error('Thiếu mã phản hồi cần xóa.');

  const tryServerFallback = async () => {
    const session = await client.auth.getSession();
    if (session.error) throw session.error;
    const accessToken = session.data.session?.access_token || '';
    if (!accessToken) return false;

    const response = await fetch('/api/student-survey-delete-submission', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ submissionId: targetId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || `HTTP ${response.status}`);
    }
    return Boolean(payload?.deleted);
  };

  const { data, error } = await client
    .from('vcontent_student_survey_submissions')
    .delete()
    .eq('id', targetId)
    .select('id');

  if (error) {
    const deletedViaApi = await tryServerFallback();
    if (deletedViaApi) return;
    throw error;
  }

  if ((data || []).length > 0) return;

  const deletedViaApi = await tryServerFallback();
  if (deletedViaApi) return;
  throw new Error('Không xóa được phản hồi. Tài khoản hiện tại có thể chưa được cấp quyền xóa.');
}

export async function saveStudentSurveySubmission(payload: Omit<StudentSurveySubmission, 'id' | 'submittedAt'>) {
  const client = requireSupabase();
  const submissionId = makeSubmissionId();
  const { error } = await client.from('vcontent_student_survey_submissions').insert({
    id: submissionId,
    form_id: payload.formId,
    unit_name: payload.respondent.unitName.trim(),
    contact_name: payload.respondent.contactName.trim(),
    position_name: payload.respondent.positionName.trim() || null,
    phone: payload.respondent.phone.trim() || null,
    email: payload.respondent.email.trim() || null,
    completed_on: payload.respondent.completedOn.trim() || null,
    answers: payload.answers || {},
  });
  if (error) throw error;

  return {
    id: submissionId,
    formId: payload.formId,
    respondent: payload.respondent,
    answers: payload.answers || {},
    submittedAt: new Date().toISOString(),
  };
}

export function buildStudentSurveyShareLink(formId: string) {
  const path = `/apply/student/${formId}`;
  const configuredBaseUrl = String(import.meta.env.VITE_STUDENT_SURVEY_PUBLIC_BASE_URL || import.meta.env.VITE_PUBLIC_APP_BASE_URL || '').replace(/\/+$/, '');
  if (configuredBaseUrl) return `${configuredBaseUrl}${path}`;
  if (typeof window === 'undefined') return path;
  if (window.location.hostname === 'vcontent-pro.vercel.app') return `https://vinabrain.com.vn/vcontent${path}`;
  if (window.location.hostname === 'vinabrain.com.vn') return `${window.location.origin}/vcontent${path}`;
  return `${window.location.origin}${path}`;
}

function buildQuestionColumnLabels(questions: StudentSurveyQuestion[]) {
  const usedLabels = new Set<string>();

  return questions.map((question) => {
    const promptLabel = normalizeVietnameseText(question.prompt || '').trim();
    const codeLabel = normalizeVietnameseText(question.code || '').trim();
    const fallbackLabel = promptLabel || codeLabel || question.id;

    let nextLabel = fallbackLabel;
    if (usedLabels.has(nextLabel) && codeLabel) {
      nextLabel = `${fallbackLabel} (${codeLabel})`;
    }

    let duplicateIndex = 2;
    while (usedLabels.has(nextLabel)) {
      nextLabel = `${fallbackLabel} (${duplicateIndex})`;
      duplicateIndex += 1;
    }

    usedLabels.add(nextLabel);
    return nextLabel;
  });
}

export function exportStudentSurveyToCsv(rows: StudentSurveySubmission[], questions = DEFAULT_QUESTIONS) {
  const normalizedQuestions = questions.map((question) => ({
    ...question,
    prompt: normalizeVietnameseText(question.prompt || ''),
    code: normalizeVietnameseText(question.code || ''),
  }));
  const questionColumnLabels = buildQuestionColumnLabels(normalizedQuestions);
  const header = [
    'submitted_at',
    'unit_name',
    'contact_name',
    'position_name',
    'phone',
    'email',
    'completed_on',
    ...questionColumnLabels,
  ];
  const escapeCell = (value: string) => `"${String(value || '').replace(/"/g, '""')}"`;
  return [
    header.join(','),
    ...rows.map((row) =>
      [
        row.submittedAt,
        row.respondent.unitName,
        row.respondent.contactName,
        row.respondent.positionName,
        row.respondent.phone,
        row.respondent.email,
        row.respondent.completedOn,
        ...normalizedQuestions.map((question) => normalizeVietnameseText(row.answers[question.id] || '')),
      ]
        .map(escapeCell)
        .join(','),
    ),
  ].join('\n');
}

export function exportStudentSurveyToWorkbook(rows: StudentSurveySubmission[], questions = DEFAULT_QUESTIONS) {
  const normalizedQuestions = questions.map((question) => ({
    ...question,
    prompt: normalizeVietnameseText(question.prompt || ''),
    code: normalizeVietnameseText(question.code || ''),
    sectionTitle: normalizeVietnameseText(question.sectionTitle || ''),
    groupTitle: question.groupTitle ? normalizeVietnameseText(question.groupTitle) : '',
  }));
  const questionColumnLabels = buildQuestionColumnLabels(normalizedQuestions);
  const workbook = XLSX.utils.book_new();

  const rawSheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      submitted_at: row.submittedAt,
      unit_name: row.respondent.unitName,
      contact_name: row.respondent.contactName,
      position_name: row.respondent.positionName,
      phone: row.respondent.phone,
      email: row.respondent.email,
      completed_on: row.respondent.completedOn,
      ...Object.fromEntries(
        normalizedQuestions.map((question, index) => [questionColumnLabels[index], normalizeVietnameseText(row.answers[question.id] || '')]),
      ),
    })),
  );
  XLSX.utils.book_append_sheet(workbook, rawSheet, 'Responses');

  const summarySheet = XLSX.utils.json_to_sheet(
    normalizedQuestions
      .filter((question) => question.type === 'rating')
      .flatMap((question) =>
        summarizeChoiceCounts(question, rows).map((item) => ({
          section: question.sectionTitle,
          group: question.groupTitle || '',
          code: question.code,
          question: question.prompt,
          choice: item.label,
          count: item.count,
        })),
      ),
  );
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
}

export function exportSingleStudentSurveySubmissionToWorkbook(submission: StudentSurveySubmission, questions = DEFAULT_QUESTIONS) {
  const normalizedQuestions = questions.map((question) => ({
    ...question,
    prompt: normalizeVietnameseText(question.prompt || ''),
    sectionTitle: normalizeVietnameseText(question.sectionTitle || ''),
    groupTitle: question.groupTitle ? normalizeVietnameseText(question.groupTitle) : '',
  }));
  const workbook = XLSX.utils.book_new();

  const metaSheet = XLSX.utils.json_to_sheet([
    {
      submission_id: submission.id,
      submitted_at: submission.submittedAt,
      unit_name: submission.respondent.unitName,
      contact_name: submission.respondent.contactName,
      position_name: submission.respondent.positionName,
      phone: submission.respondent.phone,
      email: submission.respondent.email,
      completed_on: submission.respondent.completedOn,
    },
  ]);
  XLSX.utils.book_append_sheet(workbook, metaSheet, 'Respondent');

  const answersSheet = XLSX.utils.json_to_sheet(
    normalizedQuestions.map((question) => ({
      section: question.sectionTitle,
      group: question.groupTitle || '',
      code: question.code,
      prompt: question.prompt,
      answer: normalizeVietnameseText(submission.answers[question.id] || ''),
    })),
  );
  XLSX.utils.book_append_sheet(workbook, answersSheet, 'Answers');

  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
}

export function summarizeChoiceCounts(question: StudentSurveyQuestion, rows: StudentSurveySubmission[]) {
  const counts = new Map<string, number>();
  for (const option of question.options || []) counts.set(option.value, 0);
  for (const row of rows) {
    const value = row.answers[question.id] || '';
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return (question.options || []).map((option) => ({
    value: option.value,
    label: option.label,
    count: counts.get(option.value) || 0,
  }));
}
