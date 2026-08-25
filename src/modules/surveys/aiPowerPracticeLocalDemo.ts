import type {
  StudentSurveyDisplaySettings,
  StudentSurveyForm,
  StudentSurveySubmission,
} from '@/lib/studentSurvey';

export const AI_POWER_PRACTICE_LOCAL_FORM_ID = 'ql01a-ai-dien-luc-4-ung-dung';
export const AI_POWER_PRACTICE_LOCAL_SOURCE = 'DEMO CỤC BỘ · KHÔNG GHI DATABASE';

const LOCAL_FORM_STORAGE_KEY = 'vcontent.aiPowerPractice.localDemoForm.v1';

const APPLICATION_TITLES: Record<number, string> = {
  1: 'Chuẩn bị giao ban đầu ngày',
  2: 'Tổng hợp sự cố lưới điện tuần',
  3: 'Chuẩn bị điểm nhấn giao ban',
  4: 'Chuẩn hóa phản hồi khách hàng',
};

const STEP_LABELS: Record<number, string> = {
  1: 'Đã đọc tình huống',
  2: 'Đã thực hành Prompt',
  3: 'Đã đối chiếu kết quả và quyết định',
  4: 'Đã hoàn thành tình huống',
};

type LocalEventInput = {
  id: string;
  sessionId: string;
  className: string;
  groupName: string;
  submittedAt: string;
  applicationIndex?: number;
  stepIndex?: number;
  prompt?: string;
  finalNote?: string;
};

function buildLocalEvent({
  id,
  sessionId,
  className,
  groupName,
  submittedAt,
  applicationIndex = 0,
  stepIndex = 0,
  prompt = '',
  finalNote = '',
}: LocalEventInput): StudentSurveySubmission {
  const applicationTitle = applicationIndex ? APPLICATION_TITLES[applicationIndex] : 'Nhóm đã vào bài';
  const stepLabel = stepIndex ? STEP_LABELS[stepIndex] : 'Đã vào bài';
  const prefix = applicationIndex ? `ai_power_${applicationIndex}` : '';
  const answers: Record<string, string> = {
    practice_session_id: sessionId,
    practice_event_type: applicationIndex ? 'checkpoint' : 'entered',
    practice_status: stepLabel,
    practice_application_index: String(applicationIndex),
    practice_application_title: applicationTitle,
    practice_step_index: String(stepIndex),
    practice_step_label: stepLabel,
    practice_prompt: prompt,
    practice_final_note: finalNote,
  };

  if (prefix) {
    answers[`${prefix}_situation`] = applicationTitle;
    answers[`${prefix}_prompt`] = prompt;
    answers[`${prefix}_final`] = finalNote;
  }

  return {
    id,
    formId: AI_POWER_PRACTICE_LOCAL_FORM_ID,
    respondent: {
      unitName: className,
      contactName: groupName,
      positionName: applicationIndex ? `Ứng dụng ${applicationIndex} · ${stepLabel}` : 'Đã vào bài',
      phone: '',
      email: '',
      completedOn: submittedAt.slice(0, 10),
    },
    answers,
    submittedAt,
  };
}

export function buildAiPowerPracticeLocalSubmissions(): StudentSurveySubmission[] {
  return [
    buildLocalEvent({
      id: 'local-entry-01',
      sessionId: 'local-session-nhom-01',
      className: 'QL01A · Lớp 1',
      groupName: 'Nhóm 01',
      submittedAt: '2026-07-21T01:10:00.000Z',
    }),
    buildLocalEvent({
      id: 'local-entry-02',
      sessionId: 'local-session-nhom-02',
      className: 'QL01A · Lớp 1',
      groupName: 'Nhóm 02',
      submittedAt: '2026-07-21T01:14:00.000Z',
    }),
    buildLocalEvent({
      id: 'local-02-app1-step1',
      sessionId: 'local-session-nhom-02',
      className: 'QL01A · Lớp 1',
      groupName: 'Nhóm 02',
      submittedAt: '2026-07-21T01:18:00.000Z',
      applicationIndex: 1,
      stepIndex: 1,
    }),
    buildLocalEvent({
      id: 'local-02-app1-step2',
      sessionId: 'local-session-nhom-02',
      className: 'QL01A · Lớp 1',
      groupName: 'Nhóm 02',
      submittedAt: '2026-07-21T01:24:00.000Z',
      applicationIndex: 1,
      stepIndex: 2,
      prompt: 'Hãy phân loại 12 đầu việc theo mức ưu tiên an toàn, khách hàng và điều hành; trình bày dạng bảng, kèm đầu mối phụ trách.',
    }),
    buildLocalEvent({
      id: 'local-entry-03',
      sessionId: 'local-session-nhom-03',
      className: 'QL01A · Lớp 2',
      groupName: 'Nhóm 03',
      submittedAt: '2026-07-21T01:30:00.000Z',
    }),
    ...[1, 2, 3, 4].map((stepIndex) => buildLocalEvent({
      id: `local-03-app1-step${stepIndex}`,
      sessionId: 'local-session-nhom-03',
      className: 'QL01A · Lớp 2',
      groupName: 'Nhóm 03',
      submittedAt: `2026-07-21T01:${30 + stepIndex * 6}:00.000Z`,
      applicationIndex: 1,
      stepIndex,
      prompt: stepIndex >= 2 ? 'Đóng vai Trưởng Điện lực, phân loại các đầu việc theo bốn mức ưu tiên và đề xuất bốn ý chính cho giao ban sáng.' : '',
      finalNote: stepIndex === 4 ? 'Điều chỉnh Prompt: bổ sung thời hạn và người phụ trách.\nBối cảnh cần bổ sung: nguồn lực trực ca.\nThắc mắc còn lại: cách kiểm chứng mức ưu tiên do AI đề xuất.' : '',
    })),
    buildLocalEvent({
      id: 'local-03-app2-step1',
      sessionId: 'local-session-nhom-03',
      className: 'QL01A · Lớp 2',
      groupName: 'Nhóm 03',
      submittedAt: '2026-07-21T02:02:00.000Z',
      applicationIndex: 2,
      stepIndex: 1,
    }),
    buildLocalEvent({
      id: 'local-03-app2-step2',
      sessionId: 'local-session-nhom-03',
      className: 'QL01A · Lớp 2',
      groupName: 'Nhóm 03',
      submittedAt: '2026-07-21T02:08:00.000Z',
      applicationIndex: 2,
      stepIndex: 2,
      prompt: 'Tổng hợp danh sách sự cố lưới điện tuần theo nhóm nguyên nhân, mức ảnh hưởng và hành động khắc phục; chỉ dùng dữ liệu đã ẩn danh.',
    }),
  ].sort((left, right) => Date.parse(right.submittedAt) - Date.parse(left.submittedAt));
}

export function buildAiPowerPracticeLocalForm(defaultSettings: StudentSurveyDisplaySettings): StudentSurveyForm {
  const fallback: StudentSurveyForm = {
    id: AI_POWER_PRACTICE_LOCAL_FORM_ID,
    title: 'QL01A - Thực hành AI trong quản lý Điện lực',
    intro: 'Bài thực hành nhóm gồm 4 ứng dụng AI trong quản lý Điện lực. Nhóm được ghi nhận khi vào bài và sau mỗi checkpoint.',
    status: 'active',
    createdAt: '2026-07-21T00:00:00.000Z',
    settings: {
      ...defaultSettings,
      surveyType: 'ql01a-ai-dien-luc-4-ung-dung',
      templateVariant: 'ai-power-practice',
      contractSourceName: AI_POWER_PRACTICE_LOCAL_SOURCE,
      contractVersion: 'local-demo-v1',
    },
  };

  if (typeof window === 'undefined') return fallback;
  try {
    const saved = window.localStorage.getItem(LOCAL_FORM_STORAGE_KEY);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved) as Partial<StudentSurveyForm>;
    return {
      ...fallback,
      ...parsed,
      id: fallback.id,
      settings: {
        ...fallback.settings,
        ...(parsed.settings || {}),
        surveyType: fallback.settings.surveyType,
        templateVariant: fallback.settings.templateVariant,
        contractSourceName: AI_POWER_PRACTICE_LOCAL_SOURCE,
      },
    };
  } catch {
    return fallback;
  }
}

export function saveAiPowerPracticeLocalForm(form: StudentSurveyForm) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_FORM_STORAGE_KEY, JSON.stringify(form));
}

export function isAiPowerPracticeLocalForm(form: StudentSurveyForm | null | undefined) {
  return Boolean(
    import.meta.env.DEV
      && form?.id === AI_POWER_PRACTICE_LOCAL_FORM_ID
      && form.settings.contractSourceName === AI_POWER_PRACTICE_LOCAL_SOURCE,
  );
}
