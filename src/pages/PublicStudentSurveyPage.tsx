import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import surveyHtmlTemplate from '@/assets/EVNSPC_KhaoSat_TNKH.template.html?raw';
import surveyHtmlTemplate2 from '@/assets/EVNSPC_KhaoSat_TNKH_2.template.html?raw';
import genericSurveyTemplate from '@/assets/GenericSurvey.template.html?raw';
import promptPracticeSurveyTemplate from '@/assets/PromptPracticeSurvey.template.html?raw';
import { supabase } from '@/lib/supabaseClient';
import {
  getStudentSurveyAvailability,
  getDefaultStudentSurveyDisplaySettings,
  getJourneyDefinitions,
  getStudentSurveyFormBundle,
  getStudentSurveyQuestions,
  getStudentSurveySchema,
  saveStudentSurveySubmission,
  type StudentSurveyDisplaySettings,
  type StudentSurveyQuestion,
} from '@/lib/studentSurvey';

type SurveyBlockReason = 'missing' | 'paused' | 'not_started' | 'expired' | 'login_required' | '';

type AiPowerPracticeProgressMessage = {
  type: 'vcontent.aiPowerPractice.progress';
  formId: string;
  requestId: string;
  sessionId: string;
  className: string;
  groupName: string;
  eventType: 'entered' | 'checkpoint';
  applicationIndex: number;
  applicationTitle: string;
  stepIndex: number;
  stepLabel: string;
  status: string;
  prompt: string;
  finalNote: string;
  attachment?: AiPowerPracticeAttachment;
};

type AiPowerPracticeAttachment = {
  name: string;
  size: number;
  type: string;
  bucket: string;
  path: string;
};

type AiPowerPracticeUploadMessage = {
  type: 'vcontent.aiPowerPractice.upload';
  formId: string;
  requestId: string;
  sessionId: string;
  applicationIndex: number;
  file: File;
};

const AI_POWER_PRACTICE_TITLES = [
  'Chuẩn bị giao ban đầu ngày',
  'Tổng hợp sự cố lưới điện tuần',
  'Chuẩn bị điểm nhấn giao ban',
  'Chuẩn hóa phản hồi khách hàng',
] as const;

const PRACTICE_FILE_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
};

function cleanPracticeText(value: unknown, maxLength: number) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, maxLength);
}

function safeInlineJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function injectRuntimeConfig(
  template: string,
  formId: string,
  settings: StudentSurveyDisplaySettings,
  questions: StudentSurveyQuestion[],
  sections: Array<{ id: string; title: string; description?: string }>,
) {
  const surveyType = settings.surveyType || 'evnspc-tnkh';
  return template
    .replaceAll('__SURVEY_TITLE__', String(settings.browserTitle || 'Khảo sát'))
    .replaceAll('__FORM_ID__', formId)
    .replaceAll('__SUPABASE_URL__', String(import.meta.env.VITE_SUPABASE_URL || ''))
    .replaceAll('__SUPABASE_ANON_KEY__', String(import.meta.env.VITE_SUPABASE_ANON_KEY || ''))
    .replaceAll('__SURVEY_SCHEMA__', safeInlineJson(getStudentSurveySchema(surveyType)))
    .replaceAll('__SURVEY_QUESTIONS__', safeInlineJson(questions))
    .replaceAll('__SURVEY_SECTIONS__', safeInlineJson(sections.length ? sections : getJourneyDefinitions(surveyType)))
    .replaceAll('__DISPLAY_CONFIG__', safeInlineJson(settings));
}

function SurveyLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#f5f7fa',
        color: '#0f172a',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: 14,
      }}
    >
      Đang tải phiếu khảo sát...
    </div>
  );
}

function SurveyBlocked({ reason, loginUrl }: { reason: SurveyBlockReason; loginUrl?: string }) {
  const message =
    reason === 'login_required'
      ? 'Phiếu khảo sát này yêu cầu đăng nhập tài khoản V-Training.'
      : reason === 'not_started'
        ? 'Phiếu khảo sát chưa đến thời gian hiệu lực.'
        : reason === 'expired'
          ? 'Phiếu khảo sát đã hết thời gian hiệu lực.'
          : reason === 'paused'
            ? 'Phiếu khảo sát đang tạm dừng.'
            : 'Link khảo sát không tồn tại hoặc đã tắt.';
  const targetLoginUrl =
    loginUrl ||
    (typeof window === 'undefined'
      ? '/login'
      : `/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f5f7fa', color: '#0f172a', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div style={{ width: 'min(520px, 100%)', border: '1px solid #dbe5f3', borderRadius: 12, background: '#fff', padding: 24, boxShadow: '0 18px 44px rgba(15, 23, 42, 0.08)' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>Không thể mở khảo sát</h1>
        <p style={{ margin: 0, lineHeight: 1.6, color: '#4b5f7a' }}>{message}</p>
        {reason === 'login_required' ? (
          <a href={targetLoginUrl} style={{ display: 'inline-flex', marginTop: 18, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, padding: '0 16px', background: '#123a8f', color: '#fff', fontWeight: 700, textDecoration: 'none' }}>
            Đăng nhập V-Training
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function PublicStudentSurveyPage() {
  const params = useParams();
  const formId = params.formId || 'evnspc';
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [settings, setSettings] = useState<StudentSurveyDisplaySettings>(getDefaultStudentSurveyDisplaySettings());
  const [questions, setQuestions] = useState<StudentSurveyQuestion[]>(getStudentSurveyQuestions());
  const [sections, setSections] = useState<Array<{ id: string; title: string; description?: string }>>(getJourneyDefinitions());
  const [missing, setMissing] = useState(false);
  const [blockReason, setBlockReason] = useState<SurveyBlockReason>('');
  const [loginUrl, setLoginUrl] = useState('');
  const [checking, setChecking] = useState(true);
  const savingRequestIdsRef = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;

    async function loadForm() {
      setChecking(true);
      try {
        const bundle = await getStudentSurveyFormBundle(formId);
        if (cancelled) return;
        if (!bundle) {
          setMissing(true);
          setBlockReason('missing');
          return;
        }
        const session = supabase ? await supabase.auth.getSession() : null;
        const authenticated = Boolean(session && !session.error && session.data.session);
        const availability = getStudentSurveyAvailability(bundle.form, { authenticated });
        setMissing(false);
        setSettings(bundle.form.settings);
        setQuestions(bundle.questions);
        setSections(bundle.sections);
        setLoginUrl(bundle.form.settings.loginUrl || '');
        setBlockReason(availability.available ? '' : (availability.reason as SurveyBlockReason));
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    void loadForm();
    return () => {
      cancelled = true;
    };
  }, [formId]);

  useEffect(() => {
    async function handleSurveyMessage(event: MessageEvent) {
      const data = event.data && typeof event.data === 'object' ? event.data : null;
      if (data?.type === 'vcontent.studentSurvey.submitted' && data.formId === formId) {
        iframeRef.current?.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        return;
      }

      if (data?.type === 'vcontent.aiPowerPractice.upload' && data.formId === formId) {
        if (event.source !== iframeRef.current?.contentWindow || settings.templateVariant !== 'ai-power-practice') return;
        const message = data as AiPowerPracticeUploadMessage;
        const requestId = cleanPracticeText(message.requestId, 160);
        if (!requestId || savingRequestIdsRef.current.has(requestId)) return;
        savingRequestIdsRef.current.add(requestId);
        const reply = (attachment?: AiPowerPracticeAttachment, error = '') => {
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: attachment ? 'vcontent.aiPowerPractice.uploaded' : 'vcontent.aiPowerPractice.error',
              formId,
              requestId,
              attachment,
              error,
            },
            window.location.origin,
          );
        };
        try {
          if (!supabase) throw new Error('Dịch vụ lưu file chưa được cấu hình.');
          const sessionId = cleanPracticeText(message.sessionId, 160);
          const applicationIndex = Number(message.applicationIndex || 0);
          const file = message.file;
          if (!sessionId || !Number.isInteger(applicationIndex) || applicationIndex < 1 || applicationIndex > 4) {
            throw new Error('Phiên hoặc ứng dụng thực hành không hợp lệ.');
          }
          if (!(file instanceof File) || !file.name || file.size <= 0) throw new Error('File gửi lên không hợp lệ.');
          const extension = file.name.split('.').pop()?.toLowerCase() || '';
          const fileType = file.type || PRACTICE_FILE_MIME_BY_EXTENSION[extension] || '';
          const signedResponse = await fetch('/api/student-survey-attachment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'signed_upload_url',
              formId,
              sessionId,
              applicationIndex,
              fileName: file.name,
              fileSize: file.size,
              fileType,
            }),
          });
          const signedPayload = await signedResponse.json().catch(() => ({}));
          if (!signedResponse.ok || !signedPayload?.upload?.bucket || !signedPayload?.upload?.path || !signedPayload?.upload?.token) {
            throw new Error(signedPayload?.error || 'Chưa tạo được đường dẫn tải file.');
          }
          const upload = signedPayload.upload as { bucket: string; path: string; token: string };
          const uploadResult = await supabase.storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, file, {
            contentType: fileType,
            upsert: false,
          });
          if (uploadResult.error) throw uploadResult.error;
          reply({ name: file.name, size: file.size, type: fileType, bucket: upload.bucket, path: upload.path });
        } catch (error) {
          reply(undefined, error instanceof Error ? error.message : 'Chưa tải được file. Vui lòng thử lại.');
        } finally {
          savingRequestIdsRef.current.delete(requestId);
        }
        return;
      }

      if (data?.type !== 'vcontent.aiPowerPractice.progress' || data.formId !== formId) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (settings.templateVariant !== 'ai-power-practice') return;

      const message = data as AiPowerPracticeProgressMessage;
      const requestId = cleanPracticeText(message.requestId, 120);
      if (!requestId || savingRequestIdsRef.current.has(requestId)) return;
      savingRequestIdsRef.current.add(requestId);

      const reply = (ok: boolean, error = '') => {
        iframeRef.current?.contentWindow?.postMessage(
          {
            type: ok ? 'vcontent.aiPowerPractice.saved' : 'vcontent.aiPowerPractice.error',
            formId,
            requestId,
            error,
          },
          window.location.origin,
        );
      };

      try {
        const eventType = message.eventType === 'entered' ? 'entered' : 'checkpoint';
        const sessionId = cleanPracticeText(message.sessionId, 160);
        const applicationIndex = Number(message.applicationIndex || 0);
        const stepIndex = Number(message.stepIndex || 0);
        if (!sessionId) throw new Error('Thiếu mã phiên thực hành của nhóm.');
        if (!Number.isInteger(applicationIndex) || applicationIndex < 0 || applicationIndex > 4) {
          throw new Error('Tình huống thực hành không hợp lệ.');
        }
        if (eventType === 'checkpoint' && applicationIndex < 1) throw new Error('Checkpoint phải thuộc một tình huống thực hành.');
        if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex > 4) throw new Error('Bước thực hành không hợp lệ.');
        const className = cleanPracticeText(message.className, 160);
        const groupName = cleanPracticeText(message.groupName, 160);
        const applicationTitle = applicationIndex ? AI_POWER_PRACTICE_TITLES[applicationIndex - 1] : 'Đã vào bài thực hành';
        const stepLabel = cleanPracticeText(message.stepLabel || message.status, 240) || (eventType === 'entered' ? 'Đã vào bài' : `Bước ${stepIndex}`);
        const prompt = cleanPracticeText(message.prompt, 12000);
        const finalNote = cleanPracticeText(message.finalNote, 24000);
        const attachment = message.attachment && typeof message.attachment === 'object'
          ? {
              name: cleanPracticeText(message.attachment.name, 240),
              size: Math.max(0, Number(message.attachment.size || 0)),
              type: cleanPracticeText(message.attachment.type, 160),
              bucket: cleanPracticeText(message.attachment.bucket, 120),
              path: cleanPracticeText(message.attachment.path, 800),
            }
          : null;
        if (!className || !groupName || !applicationTitle) throw new Error('Vui lòng nhập đủ Lớp và Tên nhóm.');
        if (eventType === 'checkpoint' && stepIndex >= 2 && !prompt) throw new Error('Vui lòng nhập Prompt nhóm đã thực hành.');
        if (eventType === 'checkpoint' && stepIndex === 4 && !finalNote) throw new Error('Vui lòng nhập nội dung phản ánh cuối bài.');

        const answerPrefix = applicationIndex ? `ai_power_${applicationIndex}` : '';
        const answers: Record<string, string> = {
          practice_session_id: sessionId,
          practice_event_type: eventType,
          practice_status: stepLabel,
          practice_application_index: String(applicationIndex),
          practice_application_title: applicationTitle,
          practice_step_index: String(stepIndex),
          practice_step_label: stepLabel,
          practice_prompt: prompt,
          practice_final_note: finalNote,
          practice_attachment_name: attachment?.name || '',
          practice_attachment_size: attachment?.size ? String(attachment.size) : '',
          practice_attachment_type: attachment?.type || '',
          practice_attachment_bucket: attachment?.bucket || '',
          practice_attachment_path: attachment?.path || '',
        };
        if (answerPrefix) {
          answers[`${answerPrefix}_situation`] = applicationTitle;
          answers[`${answerPrefix}_prompt`] = prompt;
          answers[`${answerPrefix}_final`] = finalNote;
          answers[`${answerPrefix}_attachment_name`] = attachment?.name || '';
          answers[`${answerPrefix}_attachment_path`] = attachment?.path || '';
        }
        await saveStudentSurveySubmission({
          formId,
          respondent: {
            unitName: className,
            contactName: groupName,
            positionName: eventType === 'entered' ? 'Đã vào bài' : `Ứng dụng ${applicationIndex} · Bước ${stepIndex} · ${stepLabel}`,
            phone: '',
            email: '',
            completedOn: new Date().toISOString().slice(0, 10),
          },
          answers,
        });
        reply(true);
      } catch (error) {
        reply(false, error instanceof Error ? error.message : 'Chưa lưu được kết quả. Vui lòng thử lại.');
      } finally {
        savingRequestIdsRef.current.delete(requestId);
      }
    }

    window.addEventListener('message', handleSurveyMessage);
    return () => window.removeEventListener('message', handleSurveyMessage);
  }, [formId, settings.templateVariant]);

  const selectedTemplate =
    settings.templateVariant === 'prompt-practice'
      ? promptPracticeSurveyTemplate
      : settings.templateVariant === 'plx-tna' || settings.templateVariant === 'generic'
      ? genericSurveyTemplate
      : settings.templateVariant === 'v2'
        ? surveyHtmlTemplate2
        : surveyHtmlTemplate;
  const isAiPowerPractice = settings.templateVariant === 'ai-power-practice';
  const aiPowerPracticeParams = new URLSearchParams({ vsurvey: '1', formId });
  const aiPowerPracticeDefaultSettings = isAiPowerPractice ? getDefaultStudentSurveyDisplaySettings(settings.surveyType) : null;
  const aiPowerPracticeVideoUrls = settings.practiceGuideVideoUrls?.some((videoUrl) => videoUrl.trim())
    ? settings.practiceGuideVideoUrls
    : aiPowerPracticeDefaultSettings?.practiceGuideVideoUrls || [];
  aiPowerPracticeVideoUrls.slice(0, 4).forEach((videoUrl, index) => {
    if (videoUrl.trim()) aiPowerPracticeParams.set(`guideVideo${index + 1}`, videoUrl.trim());
  });
  const aiPowerPracticeSrc = `/suni/vtraining/practice/ai-dien-luc-4-ung-dung.html?${aiPowerPracticeParams.toString()}`;
  const iframeSrcDoc = useMemo(() => injectRuntimeConfig(selectedTemplate, formId, settings, questions, sections), [formId, settings, questions, sections, selectedTemplate]);

  if (checking) return <SurveyLoading />;

  if (missing || blockReason) return <SurveyBlocked reason={blockReason || 'missing'} loginUrl={loginUrl} />;

  return (
    <div style={{ position: 'relative' }}>
      <iframe
        ref={iframeRef}
        title={`Survey ${formId}`}
        src={isAiPowerPractice ? aiPowerPracticeSrc : undefined}
        srcDoc={isAiPowerPractice ? undefined : iframeSrcDoc}
        style={{
          width: '100%',
          minHeight: '100vh',
          border: '0',
          display: 'block',
          background: '#f5f7fa',
        }}
        sandbox="allow-forms allow-modals allow-same-origin allow-scripts allow-downloads"
      />
    </div>
  );
}

export function PublicStudentSurveyPreviewPage() {
  const params = useParams();
  const surveyType = params.formId || 'evnspc-tnkh';
  const settings = getDefaultStudentSurveyDisplaySettings(surveyType);
  const questions = getStudentSurveyQuestions(surveyType);
  const sections = getJourneyDefinitions(surveyType);
  const selectedTemplate =
    settings.templateVariant === 'prompt-practice'
      ? promptPracticeSurveyTemplate
      : settings.templateVariant === 'plx-tna' || settings.templateVariant === 'generic'
      ? genericSurveyTemplate
      : settings.templateVariant === 'v2'
        ? surveyHtmlTemplate2
        : surveyHtmlTemplate;
  const isAiPowerPractice = settings.templateVariant === 'ai-power-practice';
  const aiPowerPracticeSrc = `/suni/vtraining/practice/ai-dien-luc-4-ung-dung.html?vsurvey=1&formId=${encodeURIComponent(`preview-${surveyType}`)}`;
  const iframeSrcDoc = useMemo(
    () => injectRuntimeConfig(selectedTemplate, `preview-${surveyType}`, settings, questions, sections),
    [questions, sections, selectedTemplate, settings, surveyType],
  );

  return (
    <div style={{ position: 'relative' }}>
      <iframe
        title={`Survey preview ${surveyType}`}
        src={isAiPowerPractice ? aiPowerPracticeSrc : undefined}
        srcDoc={isAiPowerPractice ? undefined : iframeSrcDoc}
        style={{
          width: '100%',
          minHeight: '100vh',
          border: '0',
          display: 'block',
          background: '#f5f7fa',
        }}
        sandbox="allow-forms allow-modals allow-same-origin allow-scripts allow-downloads"
      />
    </div>
  );
}
