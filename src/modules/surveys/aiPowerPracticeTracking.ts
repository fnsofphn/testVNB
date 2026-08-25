import type { StudentSurveySubmission } from '@/lib/studentSurvey';

export const AI_POWER_APPLICATION_TITLES: Record<number, string> = {
  1: 'Chuẩn bị giao ban đầu ngày',
  2: 'Tổng hợp sự cố lưới điện tuần',
  3: 'Chuẩn bị điểm nhấn giao ban',
  4: 'Chuẩn hóa phản hồi khách hàng',
};

export type AiPowerPracticeEvent = {
  id: string;
  submittedAt: string;
  applicationIndex: number;
  applicationTitle: string;
  stepIndex: number;
  stepLabel: string;
  prompt: string;
  finalNote: string;
  attachment: AiPowerPracticeAttachment | null;
};

export type AiPowerPracticeAttachment = {
  name: string;
  size: number;
  type: string;
  bucket: string;
  path: string;
};

export type AiPowerPracticeApplicationProgress = {
  applicationIndex: number;
  applicationTitle: string;
  stepIndex: number;
  prompt: string;
  finalNote: string;
  attachment: AiPowerPracticeAttachment | null;
};

export type AiPowerPracticeSession = {
  sessionId: string;
  className: string;
  groupName: string;
  enteredAt: string;
  updatedAt: string;
  latestStatus: string;
  completedApplications: number;
  checkpointCount: number;
  completionPercent: number;
  applications: AiPowerPracticeApplicationProgress[];
  events: AiPowerPracticeEvent[];
};

function cleanText(value: unknown, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function readAnswer(submission: StudentSurveySubmission, key: string) {
  return cleanText(submission.answers?.[key]);
}

export function buildAiPowerPracticeSessions(submissions: StudentSurveySubmission[]): AiPowerPracticeSession[] {
  const sessions = new Map<string, AiPowerPracticeSession>();
  const ordered = [...submissions].sort((left, right) => Date.parse(left.submittedAt) - Date.parse(right.submittedAt));

  ordered.forEach((submission) => {
    const className = cleanText(submission.respondent.unitName, 'Chưa rõ lớp');
    const groupName = cleanText(submission.respondent.contactName, 'Chưa rõ nhóm');
    const sessionId = readAnswer(submission, 'practice_session_id') || `legacy:${className.toLowerCase()}::${groupName.toLowerCase()}`;
    const applicationIndex = Number(readAnswer(submission, 'practice_application_index') || String(submission.respondent.positionName || '').match(/Ứng dụng\s+(\d+)/i)?.[1] || 0);
    const stepIndex = Number(readAnswer(submission, 'practice_step_index') || 0);
    const applicationTitle = readAnswer(submission, 'practice_application_title') || AI_POWER_APPLICATION_TITLES[applicationIndex] || 'Nhóm đã vào bài';
    const stepLabel = readAnswer(submission, 'practice_step_label') || readAnswer(submission, 'practice_status') || cleanText(submission.respondent.positionName, 'Đã vào bài');
    const prefix = applicationIndex ? `ai_power_${applicationIndex}` : '';
    const prompt = readAnswer(submission, 'practice_prompt') || (prefix ? readAnswer(submission, `${prefix}_prompt`) : '');
    const finalNote = readAnswer(submission, 'practice_final_note') || (prefix ? readAnswer(submission, `${prefix}_final`) : '');
    const attachmentName = readAnswer(submission, 'practice_attachment_name') || (prefix ? readAnswer(submission, `${prefix}_attachment_name`) : '');
    const attachmentPath = readAnswer(submission, 'practice_attachment_path') || (prefix ? readAnswer(submission, `${prefix}_attachment_path`) : '');
    const attachment = attachmentName && attachmentPath
      ? {
          name: attachmentName,
          size: Number(readAnswer(submission, 'practice_attachment_size') || 0),
          type: readAnswer(submission, 'practice_attachment_type'),
          bucket: readAnswer(submission, 'practice_attachment_bucket'),
          path: attachmentPath,
        }
      : null;
    const event: AiPowerPracticeEvent = { id: submission.id, submittedAt: submission.submittedAt, applicationIndex, applicationTitle, stepIndex, stepLabel, prompt, finalNote, attachment };
    const current = sessions.get(sessionId) || {
      sessionId,
      className,
      groupName,
      enteredAt: submission.submittedAt,
      updatedAt: submission.submittedAt,
      latestStatus: 'Đã vào bài',
      completedApplications: 0,
      checkpointCount: 0,
      completionPercent: 0,
      applications: [],
      events: [],
    };
    current.className = className;
    current.groupName = groupName;
    current.enteredAt = current.enteredAt < submission.submittedAt ? current.enteredAt : submission.submittedAt;
    current.updatedAt = submission.submittedAt;
    current.latestStatus = applicationIndex ? `Ứng dụng ${applicationIndex} · ${stepLabel}` : 'Đã vào bài';
    current.events.push(event);
    sessions.set(sessionId, current);
  });

  return [...sessions.values()].map((session) => {
    session.applications = [1, 2, 3, 4].map((applicationIndex) => {
      const applicationEvents = session.events.filter((event) => event.applicationIndex === applicationIndex);
      const latestEvent = applicationEvents[applicationEvents.length - 1];
      return {
        applicationIndex,
        applicationTitle: AI_POWER_APPLICATION_TITLES[applicationIndex],
        stepIndex: Math.max(0, ...applicationEvents.map((event) => event.stepIndex)),
        prompt: [...applicationEvents].reverse().find((event) => event.prompt)?.prompt || '',
        finalNote: [...applicationEvents].reverse().find((event) => event.finalNote)?.finalNote || '',
        attachment: [...applicationEvents].reverse().find((event) => event.attachment)?.attachment || null,
        ...(latestEvent ? { applicationTitle: latestEvent.applicationTitle || AI_POWER_APPLICATION_TITLES[applicationIndex] } : {}),
      };
    });
    session.checkpointCount = session.applications.reduce((sum, application) => sum + application.stepIndex, 0);
    session.completedApplications = session.applications.filter((application) => application.stepIndex >= 4).length;
    session.completionPercent = Math.round((session.checkpointCount / 16) * 100);
    return session;
  }).sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export function getAiPowerPracticeSessionStatus(session: AiPowerPracticeSession) {
  if (session.completedApplications >= 4) return 'completed' as const;
  if (session.checkpointCount > 0) return 'active' as const;
  return 'entered' as const;
}
