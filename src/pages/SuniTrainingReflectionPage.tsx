import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, FileText } from 'lucide-react';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { useAuth } from '@/contexts/AuthContext';
import { suniTrainingApi } from '@/lib/suni';
import {
  DEFAULT_REFLECTION_QUESTIONS,
  trainingLibraryApi,
  type ReflectionVariant,
  type TrainingActivitySubmission,
  type TrainingLibraryItem,
} from '@/lib/trainingLibrary';
import { createSubmitActionGuard } from '@/lib/submitActionGuard';
import {
  formatReflectionCountdown,
  formatReflectionQuestionPrompt,
  getReflectionDraftStorageKey,
  getReflectionRemainingSeconds,
  hasReflectionDraftContent,
  normalizeReflectionDurationMinutes,
  shouldAllowEmptyReflectionSubmission,
  shouldSaveReflectionServerDraft,
  shouldAutoSubmitReflection,
} from '@/features/vtraining/domain/reflectionActivity';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Không thực hiện được thao tác.';
}

function activityStatusLabel(status?: string | null) {
  const normalized = String(status || '').toLowerCase();
  if (['active', 'published', 'open'].includes(normalized)) return 'Đang phát hành';
  if (['completed', 'closed'].includes(normalized)) return 'Đã đóng';
  if (normalized === 'archived') return 'Lưu trữ';
  return 'Bản nháp';
}

function getDescriptionLines(value?: string | null) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\s+(?=\d+[\).]\s+)/g, '\n')
    .replace(/\s+(?=(?:G\u1ee3i \u00fd|Goi y|V\u00ed d\u1ee5|\u0110i\u1ec3m \u0111\u00e1nh gi\u00e1)\s*:)/giu, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .map((line) => line
      .replace(/^C(?:\u00e2u|au)\s+h(?:\u1ecfi|oi)\s+l(?:\u1edbn|on)\s*:\s*/iu, '')
      .replace(/^Goi\s+y\s*:/iu, 'G\u1ee3i \u00fd:')
      .trim())
    .filter(Boolean);
}

function DescriptionText({ value }: { value?: string | null }) {
  const lines = getDescriptionLines(value);
  if (!lines.length) return null;
  return <DescriptionLines lines={lines} />;
}

function DescriptionLines({ lines }: { lines: string[] }) {
  return (
    <div className="vtraining-reflection-description muted-text">
      {lines.map((line, index) => <p key={`${index}-${line.slice(0, 16)}`}>{line}</p>)}
    </div>
  );
}

function normalizeHcmcIntroLines(lines: string[]) {
  return lines.reduce<string[]>((items, line) => {
    if (/^\d+\.$/.test(line) && items.length) {
      items[items.length - 1] = `${items[items.length - 1]} ${line}`;
      return items;
    }
    items.push(line);
    return items;
  }, []);
}

function splitHcmcGuidanceList(line: string) {
  const normalized = line.trim();
  const contentMatch = normalized.match(/^(C\u00e1c n\u1ed9i dung c\u00f3 th\u1ec3 xem x\u00e9t):\s*(.+)$/iu);
  if (contentMatch) {
    const items = contentMatch[2]
      .split(/;\s*/)
      .map((item) => item.trim().replace(/^(\d+)\)\s*/, '$1. '))
      .filter(Boolean);
    return [`${contentMatch[1]}:`, ...items];
  }

  const standardMatch = normalized.match(/^(C\u00e1c ti\u00eau chu\u1ea9n c\u00f3 th\u1ec3 xem x\u00e9t):\s*(.+)$/iu);
  if (standardMatch) {
    const items = standardMatch[2]
      .split(/;\s*(?=TC\d+)/)
      .map((item) => item.trim())
      .filter(Boolean);
    return [`${standardMatch[1]}:`, ...items];
  }

  return [line];
}

function getSimpleGuidanceLines(question: { code?: string; guidance?: string | null }) {
  const lines = getDescriptionLines(question.guidance).flatMap(splitHcmcGuidanceList);
  if (question.code === '2') return lines;
  return lines;
}

function getReflectionSubQuestions(value?: string | null) {
  const intro: string[] = [];
  const subQuestions: Array<{ id: string; code: string; prompt: string; notes: string[] }> = [];

  for (const line of getDescriptionLines(value)) {
    const match = line.match(/^(\d+)[\).]\s*(.+)$/);
    if (match) {
      subQuestions.push({
        id: `sub-${match[1]}`,
        code: match[1],
        prompt: match[2].trim(),
        notes: [],
      });
      continue;
    }

    const current = subQuestions[subQuestions.length - 1];
    if (current) current.notes.push(line);
    else intro.push(line);
  }

  return { intro, mode: subQuestions.length ? 'numberedTable' as const : 'single' as const, subQuestions };
}

function getSubQuestionFields(notes: string[]) {
  const fields = notes
    .filter((line) => /:\s*$/.test(line))
    .map((line, index) => ({
      id: `field-${index + 1}`,
      label: line.replace(/:\s*$/, ''),
    }));
  return fields.length ? fields : [{ id: 'answer', label: '\u00dd ki\u1ebfn' }];
}

function getSubQuestionHints(notes: string[]) {
  return notes.filter((line) => !/:\s*$/.test(line));
}

function getSubAnswerBaseKey(questionId: string, subQuestionId: string) {
  return `${questionId}__${subQuestionId}`;
}

function getSubAnswerKey(questionId: string, subQuestionId: string, index: number) {
  return `${getSubAnswerBaseKey(questionId, subQuestionId)}__${index}`;
}

function getTableAnswerKey(baseKey: string, rowIndex: number, fieldId: string) {
  return `${baseKey}__row_${rowIndex}__${fieldId}`;
}

function getPrimaryColumnLabel(questionCode: string) {
  if (questionCode === '1') return 'Tiêu chí';
  if (questionCode === '5') return 'Cam kết';
  return 'Ý';
}

type ReflectionWordTableSpec =
  | {
    kind: 'handling' | 'commitment' | 'plx-labelled';
    intro: string[];
    columns: string[];
    rows: Array<{ id: string; label: string; hint?: string }>;
  }
  | {
    kind: 'plx-rating';
    intro: string[];
    columns: string[];
    rows: Array<{ id: string; label: string; hint?: string }>;
  }
  | {
    kind: 'plx-free';
    intro: string[];
    columns: string[];
    rows: Array<{ id: string; label?: string }>;
  };

function getHcmcWordTableSpec(question: { code?: string; prompt?: string; guidance?: string | null }) {
  const prompt = String(question.prompt || '');
  const lines = getDescriptionLines(question.guidance);

  if (question.code === '3' || /^Ph\u1ea7n 3:/i.test(prompt)) {
    const firstRowIndex = lines.findIndex((line) => /^T\u00f4i s\u1ebd n\u00f3i g\u00ec \u0111\u1ea7u ti\u00ean\?/i.test(line));
    if (firstRowIndex < 0) return null;
    const rowLines = lines.slice(firstRowIndex);
    const rows = [];
    for (let index = 0; index < rowLines.length; index += 2) {
      const label = rowLines[index];
      if (!label) continue;
      rows.push({
        id: `row-${rows.length + 1}`,
        label,
        hint: rowLines[index + 1] || '',
      });
    }
    return {
      kind: 'handling' as const,
      intro: normalizeHcmcIntroLines(lines.slice(0, firstRowIndex).filter((line) => !/^(N\u1ed9i dung c\u1ea7n chu\u1ea9n|Anh\/Ch\u1ecb s\u1ebd l\u00e0m g\u00ec\?|Kh\u00e1ch h\u00e0ng s\u1ebd c\u1ea3m nh\u1eadn g\u00ec)$/i.test(line))),
      columns: ['N\u1ed9i dung c\u1ea7n chu\u1ea9n', 'Anh/Ch\u1ecb s\u1ebd l\u00e0m g\u00ec?', 'Kh\u00e1ch h\u00e0ng s\u1ebd c\u1ea3m nh\u1eadn g\u00ec'],
      rows,
    };
  }

  if (question.code === '4' || /^Ph\u1ea7n 4:/i.test(prompt)) {
    const rows = lines
      .filter((line) => /^M\u1ed9t h\u00e0nh vi/i.test(line))
      .map((line, index) => ({
        id: `row-${index + 1}`,
        label: line,
        hint: '',
      }));
    if (!rows.length) return null;
    const firstRowIndex = lines.findIndex((line) => /^M\u1ed9t h\u00e0nh vi/i.test(line));
    return {
      kind: 'commitment' as const,
      intro: normalizeHcmcIntroLines(lines.slice(0, firstRowIndex).filter((line) => !/^(Lo\u1ea1i cam k\u1ebft|N\u1ed9i dung h\u1ecdc vi\u00ean t\u1ef1 \u0111i\u1ec1n)$/i.test(line))),
      columns: ['Lo\u1ea1i cam k\u1ebft', 'N\u1ed9i dung h\u1ecdc vi\u00ean t\u1ef1 \u0111i\u1ec1n'],
      rows,
    };
  }

  return null;
}

function getPlxWordTableSpec(question: { code?: string; prompt?: string; guidance?: string | null }): ReflectionWordTableSpec | null {
  const prompt = String(question.prompt || '');
  const lines = getDescriptionLines(question.guidance);
  const normalizedLines = lines.reduce<string[]>((items, line, index) => {
    if (/Với mỗi tiêu chí, đánh giá theo thang điểm từ 1 đến(?:\s*5\.)?$/i.test(line)) {
      items.push('Chấm điểm từng tiêu chí theo thang 1-5.');
      return items;
    }
    if (index > 0 && /^5\.$/.test(line) && /Với mỗi tiêu chí, đánh giá theo thang điểm từ 1 đến$/i.test(lines[index - 1] || '')) {
      return items;
    }
    items.push(line);
    return items;
  }, []);

  if (/Phần 1/i.test(prompt)) {
    return {
      kind: 'plx-rating',
      intro: normalizedLines,
      columns: ['Tiêu chí đánh giá', 'Mức điểm 1-5', 'Thực trạng đáng báo động nhất'],
      rows: [
        {
          id: 'safety',
          label: 'Tiêu chí về An toàn - kỷ luật vận hành',
          hint: 'Gợi ý: tuân thủ quy trình, ý thức an toàn, kỷ luật ca làm việc...',
        },
        {
          id: 'service',
          label: 'Tiêu chí về Chất lượng phục vụ và trải nghiệm khách hàng',
          hint: 'Gợi ý: tốc độ phục vụ, thái độ phục vụ, xử lý phản ánh, khả năng phục vụ để khách hàng quay lại...',
        },
        {
          id: 'brand',
          label: 'Tiêu chí về Hình ảnh thương hiệu - tác phong - điểm chạm',
          hint: 'Gợi ý: đồng phục, tác phong, vệ sinh cửa hàng, nhận diện thương hiệu, trải nghiệm khách hàng tại điểm bán...',
        },
        {
          id: 'team',
          label: 'Tiêu chí về Năng lực đội ngũ và phong cách quản lý hiện nay',
          hint: 'Gợi ý: sự chủ động, trách nhiệm quản lý, cách giao việc, cách kiểm tra, cách phản hồi nhân viên...',
        },
      ],
    };
  }

  if (/03 điểm mạnh/i.test(prompt)) {
    return {
      kind: 'plx-free',
      intro: lines,
      columns: ['Điểm mạnh', 'Vì sao được xem là điểm mạnh?', 'Cần phát huy như thế nào?'],
      rows: [{ id: 'strength-1' }, { id: 'strength-2' }, { id: 'strength-3' }],
    };
  }

  if (/03 vấn đề|tồn tại cần ưu tiên/i.test(prompt)) {
    return {
      kind: 'plx-free',
      intro: lines,
      columns: ['Vấn đề/Tồn tại', 'Nguyên nhân gốc rễ', 'Ảnh hưởng đến khách hàng hoặc CHXD như thế nào?'],
      rows: [{ id: 'issue-1' }, { id: 'issue-2' }, { id: 'issue-3' }],
    };
  }

  if (/90 ngày|kế hoạch hành động/i.test(prompt)) {
    return {
      kind: 'plx-free',
      intro: lines,
      columns: ['Việc cải tiến', 'Ai thực hiện', 'Thời hạn', 'Dự kiến kết quả đạt được sau 3 tháng', 'Cách kiểm tra và đo lường'],
      rows: [{ id: 'improvement-1' }, { id: 'improvement-2' }, { id: 'improvement-3' }],
    };
  }

  if (/Cam kết cá nhân/i.test(prompt)) {
    return {
      kind: 'plx-labelled',
      intro: lines,
      columns: ['Cam kết', 'Nội dung học viên tự điền'],
      rows: [
        { id: 'start', label: 'Cam kết 1: Một việc Anh/Chị sẽ BẮT ĐẦU thực hiện ngay sau khóa học này?' },
        { id: 'stop', label: 'Cam kết 2: Một việc Anh/Chị nhận thấy mình đang làm CHƯA ĐÚNG và sẽ DỪNG thực hiện ngay sau khóa học này?' },
        { id: 'maintain', label: 'Cam kết 3: Một việc Anh/Chị sẽ DUY TRÌ VÀ LÀM TỐT HƠN ngay sau khóa học này?' },
      ],
    };
  }

  return null;
}

function getReflectionWordTableSpec(question: { code?: string; prompt?: string; guidance?: string | null }, isPlxReflection: boolean) {
  return getHcmcWordTableSpec(question) || (isPlxReflection ? getPlxWordTableSpec(question) : null);
}

function isPlxReflectionVariant(variant?: ReflectionVariant | null) {
  if (!variant) return false;
  const haystack = [
    variant.id,
    variant.title,
    variant.courseTitle,
    ...variant.questions.map((question) => `${question.id} ${question.code} ${question.prompt}`),
  ].join(' ');
  return /(?:^|[^a-z0-9])plx(?:[^a-z0-9]|$)|petrolimex/i.test(haystack);
}

function getReflectionQuestionCodeLabel(question: { code?: string }, isPlxReflection: boolean) {
  const code = String(question.code || '').trim();
  if (!code) return isPlxReflection ? 'Phần' : 'Câu';
  return `${isPlxReflection ? 'Phần' : 'Câu'} ${code}`;
}

function getVariants(activity: Awaited<ReturnType<typeof suniTrainingApi.getClassActivity>>, libraryItems: TrainingLibraryItem[]) {
  if (!activity) return [] as ReflectionVariant[];
  const activityVariants = Array.isArray(activity.metadata?.variants) ? activity.metadata.variants : [];
  if (activityVariants.length) return activityVariants as ReflectionVariant[];
  const libraryItemId = String(activity.libraryItemId || activity.sourceId || '');
  const libraryItem = libraryItems.find((item) => item.id === libraryItemId || item.sourceId === libraryItemId);
  const libraryVariants = Array.isArray(libraryItem?.metadata?.variants) ? libraryItem.metadata.variants : [];
  if (libraryVariants.length) return libraryVariants as ReflectionVariant[];
  return [{ id: 'mau-thu-hoach', title: 'Mẫu bài thu hoạch', questions: DEFAULT_REFLECTION_QUESTIONS }];
}

function getRequiredReflectionAnswerKeys(questions: ReflectionVariant['questions'], isPlxReflection: boolean) {
  if (!questions.length) return ['general_reflection'];
  const keys: string[] = [];

  questions.forEach((question) => {
    const wordTableSpec = getReflectionWordTableSpec(question, isPlxReflection);
    if (wordTableSpec) {
      wordTableSpec.rows.forEach((row, rowIndex) => {
        const baseKey = `${question.id}__word_${row.id}`;
        if (wordTableSpec.kind === 'plx-free') {
          wordTableSpec.columns.forEach((_, columnIndex) => {
            keys.push(getTableAnswerKey(baseKey, 0, `column_${columnIndex}`));
          });
        } else if (wordTableSpec.kind === 'plx-rating') {
          keys.push(getTableAnswerKey(baseKey, rowIndex, 'score'));
          keys.push(getTableAnswerKey(baseKey, rowIndex, 'warning'));
        } else if (wordTableSpec.kind === 'handling') {
          keys.push(getTableAnswerKey(baseKey, rowIndex, 'action'));
          keys.push(getTableAnswerKey(baseKey, rowIndex, 'customer'));
        } else {
          keys.push(getTableAnswerKey(baseKey, rowIndex, 'content'));
        }
      });
      return;
    }

    const { subQuestions } = getReflectionSubQuestions(question.guidance);
    if (subQuestions.length) {
      subQuestions.forEach((subQuestion) => {
        const baseKey = getSubAnswerBaseKey(question.id, subQuestion.id);
        getSubQuestionFields(subQuestion.notes).forEach((field) => {
          keys.push(getTableAnswerKey(baseKey, 0, field.id));
        });
      });
      return;
    }

    keys.push(question.id);
  });

  return keys;
}

function getMissingRequiredReflectionAnswerKeys(input: {
  questions: ReflectionVariant['questions'];
  answers: Record<string, string>;
  isPlxReflection: boolean;
}) {
  return getRequiredReflectionAnswerKeys(input.questions, input.isPlxReflection).filter((key) => !String(input.answers[key] || '').trim());
}

export function SuniTrainingReflectionPage() {
  const { activityId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof suniTrainingApi.getClassActivity>>>(null);
  const [libraryItems, setLibraryItems] = useState<TrainingLibraryItem[]>([]);
  const [submissions, setSubmissions] = useState<TrainingActivitySubmission[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answerLineCounts, setAnswerLineCounts] = useState<Record<string, number>>({});
  const [errorMessage, setErrorMessage] = useState('');
  const [completionWarning, setCompletionWarning] = useState<{ message: string; missingCount: number } | null>(null);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [draftStatus, setDraftStatus] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const autoSubmitStartedRef = useRef(false);
  const submitActionGuardRef = useRef(createSubmitActionGuard());
  const lastServerDraftSavedAtRef = useRef(Date.now());
  const lastServerDraftAnswersRef = useRef<Record<string, string>>({});
  const viewSubmissionId = searchParams.get('submissionId') || '';
  const viewStudentLabel = searchParams.get('student') || '';
  const draftStorageKey = useMemo(
    () => (activityId ? getReflectionDraftStorageKey(activityId, profile?.id || null) : ''),
    [activityId, profile?.id],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      suniTrainingApi.getClassActivity(activityId),
      trainingLibraryApi.listItems('reflection'),
    ])
      .then(async ([nextActivity, items]) => {
        if (!active) return;
        setActivity(nextActivity);
        setLibraryItems(items);
        if (nextActivity) {
          const rows = viewSubmissionId
            ? await trainingLibraryApi.listActivitySubmissions(nextActivity.id)
            : await trainingLibraryApi.listMyActivitySubmissions(nextActivity.id, profile?.id || null);
          if (active) setSubmissions(rows);
        }
      })
      .catch((error) => {
        if (active) setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activityId, profile?.id, viewSubmissionId]);

  const variants = useMemo(() => getVariants(activity, libraryItems), [activity, libraryItems]);
  const firstVariant = variants[0];
  const questions = firstVariant?.questions || [];
  const isPlxReflection = isPlxReflectionVariant(firstVariant);
  const viewSubmission = viewSubmissionId ? submissions.find((row) => row.id === viewSubmissionId) : null;
  const ownSubmissions = submissions.filter((row) => row.studentProfileId === profile?.id);
  const editableSubmission = ownSubmissions.find((row) => row.status === 'needs_resubmission');
  const maxAttempts = Math.max(1, Number(activity?.metadata?.maxAttempts || 1));
  const isReadonlyView = Boolean(viewSubmission);
  const durationMinutes = isPlxReflection ? 30 : normalizeReflectionDurationMinutes(activity?.metadata?.durationMinutes as number | string | null | undefined);
  const isTimeUp = Boolean(startedAt && !isReadonlyView && !completed && remainingSeconds <= 0);
  const countdownLabel = formatReflectionCountdown(startedAt ? remainingSeconds : durationMinutes * 60);
  const remainingAttempts = Math.max(0, maxAttempts - ownSubmissions.length);
  const canUpdateSubmission = Boolean(editableSubmission && !isReadonlyView);
  const alreadySubmitted = !isReadonlyView && !canUpdateSubmission && ownSubmissions.length >= maxAttempts;
  const canAttemptSubmission = Boolean(activity && !isReadonlyView && !completed && (remainingAttempts > 0 || canUpdateSubmission));
  const canSubmit = Boolean(canAttemptSubmission && !isTimeUp);
  const isSubmitLocked = submitting || !canSubmit;
  const formAnswers = isReadonlyView ? (viewSubmission?.answers || {}) : answers;

  function readLocalDraft() {
    if (!draftStorageKey || typeof window === 'undefined') return null as null | { answers: Record<string, string>; savedAt: string };
    try {
      const raw = window.localStorage.getItem(draftStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { answers?: Record<string, string>; savedAt?: string };
      if (!parsed.answers || typeof parsed.answers !== 'object') return null;
      return { answers: parsed.answers, savedAt: parsed.savedAt || '' };
    } catch {
      return null;
    }
  }

  useEffect(() => {
    lastServerDraftSavedAtRef.current = Date.now();
    lastServerDraftAnswersRef.current = {};
    setDraftStatus('');
  }, [activityId, profile?.id]);

  useEffect(() => {
    if (!activity || isReadonlyView || completed || alreadySubmitted) return;
    setStartedAt((current) => current || Date.now());
  }, [activity?.id, alreadySubmitted, completed, isReadonlyView]);

  useEffect(() => {
    if (!activity || !startedAt || isReadonlyView || completed || alreadySubmitted) {
      setRemainingSeconds(durationMinutes * 60);
      return;
    }
    const updateRemaining = () => {
      setRemainingSeconds(getReflectionRemainingSeconds({ durationMinutes, startedAt }));
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [activity?.id, alreadySubmitted, completed, durationMinutes, isReadonlyView, startedAt]);

  useEffect(() => {
    if (!editableSubmission || isReadonlyView) return;
    setAnswers({ ...(editableSubmission.answers || {}) });
  }, [editableSubmission?.id, isReadonlyView]);

  useEffect(() => {
    if (!activity || isReadonlyView || completed || alreadySubmitted || editableSubmission) return;
    if (!profile?.id) return;
    let cancelled = false;
    const localDraft = readLocalDraft();
    void trainingLibraryApi.getReflectionDraft(activity.id, profile.id)
      .then((serverDraft) => {
        if (cancelled) return;
        const serverTime = serverDraft?.updatedAt ? Date.parse(serverDraft.updatedAt) || 0 : 0;
        const localTime = localDraft?.savedAt ? Date.parse(localDraft.savedAt) || 0 : 0;
        const selectedAnswers = serverTime >= localTime ? (serverDraft?.answers || {}) : (localDraft?.answers || {});
        if (!hasReflectionDraftContent(selectedAnswers)) return;
        setAnswers((current) => (hasReflectionDraftContent(current) ? current : selectedAnswers));
        const restoredTime = Math.max(serverTime, localTime);
        if (restoredTime) setDraftStatus(`Đã khôi phục nháp lúc ${new Date(restoredTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`);
        lastServerDraftSavedAtRef.current = Date.now();
        lastServerDraftAnswersRef.current = selectedAnswers;
      })
      .catch(() => {
        if (cancelled || !localDraft || !hasReflectionDraftContent(localDraft.answers)) return;
        setAnswers((current) => (hasReflectionDraftContent(current) ? current : localDraft.answers));
      });
    return () => {
      cancelled = true;
    };
  }, [activity?.id, alreadySubmitted, completed, editableSubmission?.id, isReadonlyView, profile?.id]);

  useEffect(() => {
    if (!draftStorageKey || !canAttemptSubmission || isReadonlyView || completed || alreadySubmitted) return;
    if (!hasReflectionDraftContent(answers)) return;
    try {
      window.localStorage.setItem(draftStorageKey, JSON.stringify({ answers, savedAt: new Date().toISOString() }));
    } catch {
      // Local draft persistence is best effort.
    }
  }, [alreadySubmitted, answers, canAttemptSubmission, completed, draftStorageKey, isReadonlyView]);

  useEffect(() => {
    const profileId = profile?.id || '';
    if (!activity || !profileId || !canAttemptSubmission || isReadonlyView || completed || alreadySubmitted || submitting) return;
    let cancelled = false;
    const saveServerDraft = async () => {
      if (!shouldSaveReflectionServerDraft({
        answers,
        lastSavedAnswers: lastServerDraftAnswersRef.current,
        lastSavedAt: lastServerDraftSavedAtRef.current,
        disabled: submitting,
      })) return;
      try {
        const saved = await trainingLibraryApi.upsertReflectionDraft({
          activity,
          studentProfileId: profileId,
          answers,
          metadata: { source: 'autosave' },
        });
        if (cancelled || !saved) return;
        lastServerDraftSavedAtRef.current = Date.now();
        lastServerDraftAnswersRef.current = answers;
        setDraftStatus(`Đã lưu nháp lúc ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`);
      } catch {
        if (!cancelled) setDraftStatus('Nháp đang được lưu trên trình duyệt');
      }
    };
    const timer = window.setInterval(() => {
      void saveServerDraft();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activity?.id, alreadySubmitted, answers, canAttemptSubmission, completed, isReadonlyView, profile?.id, submitting]);

  useEffect(() => {
    if (!shouldAutoSubmitReflection({
      isTimeUp,
      isReadonlyView,
      completed,
      alreadySubmitted,
      submitting,
      canAttempt: canAttemptSubmission,
    })) return;
    if (autoSubmitStartedRef.current) return;
    autoSubmitStartedRef.current = true;
    void submit({ autoSubmit: true });
  }, [alreadySubmitted, canAttemptSubmission, completed, isReadonlyView, isTimeUp, submitting]);

  useEffect(() => {
    const profileId = profile?.id || '';
    if (!submitting || completed || alreadySubmitted || isReadonlyView || !activity || !profileId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void trainingLibraryApi.listMyActivitySubmissions(activity.id, profileId)
        .then((rows) => {
          if (cancelled || !rows.length) return;
          setSubmissions(rows);
          setErrorMessage('');
          setCompleted(true);
        })
        .catch(() => {
          // Submit reconciliation is best effort; the main submit path will surface real errors.
        });
    }, 8000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activity?.id, alreadySubmitted, completed, isReadonlyView, profile?.id, submitting]);

  function getSubAnswerLineCount(baseKey: string) {
    const existingCount = Object.keys(formAnswers).filter((key) => key.startsWith(`${baseKey}__`)).length;
    return Math.max(1, answerLineCounts[baseKey] || 0, existingCount);
  }

  function addSubAnswerLine(baseKey: string) {
    setAnswerLineCounts((current) => ({ ...current, [baseKey]: Math.max(1, current[baseKey] || getSubAnswerLineCount(baseKey)) + 1 }));
  }

  function getTableAnswerRowCount(baseKey: string) {
    const rowIndexes = new Set<number>();
    Object.keys(formAnswers).forEach((key) => {
      const match = key.match(new RegExp(`^${baseKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}__row_(\\d+)__`));
      if (match) rowIndexes.add(Number(match[1]));
    });
    return Math.max(1, answerLineCounts[baseKey] || 0, rowIndexes.size);
  }

  function addTableAnswerRow(baseKey: string) {
    setAnswerLineCounts((current) => ({ ...current, [baseKey]: Math.max(1, current[baseKey] || getTableAnswerRowCount(baseKey)) + 1 }));
  }

  async function submit(options: { autoSubmit?: boolean } = {}) {
    if (!activity) return;
    if (isTimeUp && !options.autoSubmit) {
      setErrorMessage('Đã hết thời gian làm bài thu hoạch.');
      return;
    }
    const requireAllQuestions = activity.metadata?.requireAllQuestions !== false;
    if (requireAllQuestions && !options.autoSubmit) {
      const missingAnswerKeys = getMissingRequiredReflectionAnswerKeys({ questions, answers, isPlxReflection });
      if (missingAnswerKeys.length) {
        const message = `Vui lòng trả lời đầy đủ tất cả câu hỏi trước khi gửi bài thu hoạch. Còn thiếu ${missingAnswerKeys.length} mục.`;
        setErrorMessage(message);
        setCompletionWarning({ message, missingCount: missingAnswerKeys.length });
        return;
      }
    }
    await submitActionGuardRef.current.run(`reflection:${activity.id}:${profile?.id || 'anon'}`, async () => {
      setErrorMessage('');
      setSubmitting(true);
      try {
        let savedSubmission: TrainingActivitySubmission | null = null;
        if (editableSubmission) {
          savedSubmission = await trainingLibraryApi.updateReflectionSubmissionAnswers({
            submission: editableSubmission,
            answers,
            status: 'submitted',
            metadata: options.autoSubmit ? { autoSubmitted: true, autoSubmittedAt: new Date().toISOString(), reason: 'time_up' } : undefined,
          });
        } else {
          savedSubmission = await trainingLibraryApi.submitReflection({
            activity,
            answers,
            allowEmpty: shouldAllowEmptyReflectionSubmission({
              requireAllQuestions,
              autoSubmit: options.autoSubmit,
            }),
            metadata: options.autoSubmit ? { autoSubmitted: true, autoSubmittedAt: new Date().toISOString(), reason: 'time_up' } : undefined,
          });
        }
        if (savedSubmission) {
          setSubmissions((current) => [savedSubmission, ...current.filter((item) => item.id !== savedSubmission.id)]);
        }
        if (draftStorageKey) {
          try {
            window.localStorage.removeItem(draftStorageKey);
          } catch {
            // Local draft cleanup is best effort.
          }
        }
        if (profile?.id) {
          void trainingLibraryApi.deleteReflectionDraft(activity.id, profile.id).catch(() => {});
        }
        setCompleted(true);
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setSubmitting(false);
      }
    });
  }

  if (loading) {
    return <div className="suni-native-page vtraining-reflection-page"><div className="notice">Đang tải bài thu hoạch...</div></div>;
  }

  if (!activity) {
    return <div className="suni-native-page vtraining-reflection-page"><div className="notice danger">Không tìm thấy bài thu hoạch.</div></div>;
  }

  return (
    <div className="suni-native-page vtraining-reflection-page">
      <SectionHeader
        eye="VTRAINING"
        title={activity.title}
        actions={<Link className="btn btn-ghost" to={`/vtraining/classes/${activity.classId}`}><ArrowLeft size={15} /> Quay lại lớp</Link>}
      />

      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      {completionWarning ? (
        <div className="vtraining-reflection-warning-backdrop" role="presentation" onClick={() => setCompletionWarning(null)}>
          <div
            aria-describedby="reflection-completion-warning-detail"
            aria-labelledby="reflection-completion-warning-title"
            aria-modal="true"
            className="vtraining-reflection-warning-modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="vtraining-reflection-warning-mark" aria-hidden="true">!</div>
            <div className="vtraining-reflection-warning-copy">
              <h2 id="reflection-completion-warning-title">Chưa hoàn thành bài thu hoạch</h2>
              <p id="reflection-completion-warning-detail">{completionWarning.message}</p>
              <div className="vtraining-reflection-warning-count">
                <strong>{completionWarning.missingCount}</strong>
                <span>mục cần bổ sung trước khi nộp</span>
              </div>
            </div>
            <div className="vtraining-reflection-warning-actions">
              <button className="btn btn-primary" type="button" onClick={() => setCompletionWarning(null)}>
                Quay lại hoàn thành
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {completed || alreadySubmitted ? (
        <Card title="Đã hoàn thành">
          <div className="vtraining-reflection-complete">
            <CheckCircle2 size={42} />
            <span>Hệ thống đã ghi nhận bài nộp của bạn.</span>
          </div>
        </Card>
      ) : (
        <Card
          title={isReadonlyView ? 'Nội dung bài thu hoạch' : isPlxReflection ? 'Bài thu hoạch cuối khóa Petrolimex' : 'Bài thu hoạch'}
          action={(
            <div className="vtraining-reflection-timer-actions">
              {!isReadonlyView ? (
                <div className={`quiz-timer-card vtraining-reflection-timer${startedAt ? ' running' : ''}${isTimeUp ? ' expired' : ''}`}>
                  <span>Thời gian còn lại</span>
                  <strong>{countdownLabel}</strong>
                </div>
              ) : null}
              <Badge tone={activity.status === 'active' ? 'success' : 'warning'}>{activityStatusLabel(activity.status)}</Badge>
            </div>
          )}
        >
          <div className="vtraining-detail-stack">
            <div className="suni-native-toolbar suni-native-toolbar-compact">
              <span><FileText size={16} /> {isReadonlyView ? (viewStudentLabel || viewSubmission?.studentProfileId || 'Học viên') : (profile?.fullName || profile?.email || 'Học viên')} · {durationMinutes} phút</span>
            </div>
            {submitting ? (
              <div className="notice warning vtraining-reflection-submit-lock-notice">
                Đang lưu bài thu hoạch của bạn. Vui lòng giữ nguyên màn hình, hệ thống sẽ tự xác nhận khi lưu xong.
              </div>
            ) : null}
            {draftStatus && !submitting ? <div className="muted-text">{draftStatus}</div> : null}
            {isTimeUp ? <div className="notice warning">Đã hết thời gian làm bài thu hoạch.</div> : null}

            <div className="lecturer-bank-question-stack">
              {questions.length ? questions.map((question) => {
                const details = getReflectionSubQuestions(question.guidance);
                const wordTableSpec = getReflectionWordTableSpec(question, isPlxReflection);
                const simpleGuidanceLines = getSimpleGuidanceLines(question);
                return (
                  <article className="lecturer-bank-question" key={question.id}>
                    <div className="lecturer-bank-question-code">{getReflectionQuestionCodeLabel(question, isPlxReflection)}</div>
                    <h4>{formatReflectionQuestionPrompt(question.prompt)}</h4>
                    {wordTableSpec ? (
                      <>
                        {wordTableSpec.intro.length ? <DescriptionLines lines={wordTableSpec.intro} /> : null}
                        <div className="vtraining-reflection-table-wrap vtraining-reflection-word-table-wrap">
                          <table className={`vtraining-reflection-field-table vtraining-reflection-word-table vtraining-reflection-word-table-${wordTableSpec.kind}`}>
                            <colgroup>
                              {wordTableSpec.kind === 'plx-free' ? (
                                wordTableSpec.columns.map((column) => <col className="vtraining-reflection-word-free-col" key={column} />)
                              ) : wordTableSpec.kind === 'plx-rating' ? (
                                <>
                                  <col className="vtraining-reflection-word-rating-label-col" />
                                  <col className="vtraining-reflection-word-rating-score-col" />
                                  <col className="vtraining-reflection-word-rating-note-col" />
                                </>
                              ) : wordTableSpec.kind === 'handling' ? (
                                <>
                                  <col className="vtraining-reflection-word-label-col" />
                                  <col className="vtraining-reflection-word-answer-col" />
                                  <col className="vtraining-reflection-word-answer-col" />
                                </>
                              ) : (
                                <>
                                  <col className="vtraining-reflection-word-label-col" />
                                  <col className="vtraining-reflection-word-wide-answer-col" />
                                </>
                              )}
                            </colgroup>
                            <thead>
                              <tr>
                                {wordTableSpec.columns.map((column) => <th key={column}>{column}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {wordTableSpec.kind === 'plx-free' ? wordTableSpec.rows.map((row, rowIndex) => (
                                <tr key={row.id}>
                                  {wordTableSpec.columns.map((column, columnIndex) => {
                                    const answerKey = getTableAnswerKey(`${question.id}__word_${row.id}`, 0, `column_${columnIndex}`);
                                    return (
                                      <td key={column} data-label={column}>
                                        <textarea
                                          rows={5}
                                          value={formAnswers[answerKey] || ''}
                                          onChange={(event) => setAnswers((current) => ({ ...current, [answerKey]: event.target.value }))}
                                          placeholder={`Dòng ${rowIndex + 1} - ${column.toLowerCase()}`}
                                          disabled={isSubmitLocked}
                                          readOnly={isReadonlyView}
                                        />
                                      </td>
                                    );
                                  })}
                                </tr>
                              )) : wordTableSpec.kind === 'plx-rating' ? wordTableSpec.rows.map((row, rowIndex) => {
                                const scoreKey = getTableAnswerKey(`${question.id}__word_${row.id}`, rowIndex, 'score');
                                const noteKey = getTableAnswerKey(`${question.id}__word_${row.id}`, rowIndex, 'warning');
                                const selectedScore = formAnswers[scoreKey] || '';
                                return (
                                  <tr key={row.id}>
                                    <td data-label={wordTableSpec.columns[0]} className="vtraining-reflection-word-row-label">
                                      <strong>{row.label}</strong>
                                      {row.hint ? <DescriptionLines lines={[row.hint]} /> : null}
                                    </td>
                                    <td data-label={wordTableSpec.columns[1]}>
                                      <div className="vtraining-reflection-score-options" role="group" aria-label={`Chấm điểm ${row.label}`}>
                                        {[1, 2, 3, 4, 5].map((score) => (
                                          <button
                                            className={selectedScore === String(score) ? 'selected' : ''}
                                            disabled={isSubmitLocked}
                                            key={score}
                                            onClick={() => setAnswers((current) => ({ ...current, [scoreKey]: String(score) }))}
                                            type="button"
                                          >
                                            {score}
                                          </button>
                                        ))}
                                      </div>
                                    </td>
                                    <td data-label={wordTableSpec.columns[2]}>
                                      <textarea
                                        rows={5}
                                        value={formAnswers[noteKey] || ''}
                                        onChange={(event) => setAnswers((current) => ({ ...current, [noteKey]: event.target.value }))}
                                        placeholder="Nhập thực trạng đáng báo động nhất"
                                        disabled={isSubmitLocked}
                                        readOnly={isReadonlyView}
                                      />
                                    </td>
                                  </tr>
                                );
                              }) : wordTableSpec.rows.map((row, rowIndex) => (
                                <tr key={row.id}>
                                  <td data-label={wordTableSpec.columns[0]} className="vtraining-reflection-word-row-label">
                                    <strong>{row.label}</strong>
                                    {row.hint ? <DescriptionLines lines={[row.hint]} /> : null}
                                  </td>
                                  {wordTableSpec.kind === 'handling' ? (
                                    <>
                                      {['action', 'customer'].map((fieldId, fieldIndex) => {
                                        const answerKey = getTableAnswerKey(`${question.id}__word_${row.id}`, rowIndex, fieldId);
                                        const label = wordTableSpec.columns[fieldIndex + 1];
                                        return (
                                          <td key={fieldId} data-label={label}>
                                            <textarea
                                              rows={5}
                                              value={formAnswers[answerKey] || ''}
                                              onChange={(event) => setAnswers((current) => ({ ...current, [answerKey]: event.target.value }))}
                                              placeholder={`Nh\u1eadp ${label.toLowerCase()}`}
                                              disabled={isSubmitLocked}
                                              readOnly={isReadonlyView}
                                            />
                                          </td>
                                        );
                                      })}
                                    </>
                                  ) : (
                                    <td data-label={wordTableSpec.columns[1]}>
                                      <textarea
                                        rows={5}
                                        value={formAnswers[getTableAnswerKey(`${question.id}__word_${row.id}`, rowIndex, 'content')] || ''}
                                        onChange={(event) => setAnswers((current) => ({ ...current, [getTableAnswerKey(`${question.id}__word_${row.id}`, rowIndex, 'content')]: event.target.value }))}
                                        placeholder={`Nh\u1eadp ${wordTableSpec.columns[1].toLowerCase()}`}
                                        disabled={isSubmitLocked}
                                        readOnly={isReadonlyView}
                                      />
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : false ? (
                      <div className="vtraining-reflection-table-wrap">
                        <table className="vtraining-reflection-field-table">
                          <thead>
                            <tr>
                              {details.subQuestions.map((field) => <th key={field.id}>{field.prompt}</th>)}
                              {!isReadonlyView ? <th className="vtraining-reflection-table-action"><span className="sr-only">Thao tác</span></th> : null}
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: getTableAnswerRowCount(`${question.id}__table`) }).map((_, rowIndex) => (
                              <tr key={`${question.id}-row-${rowIndex}`}>
                                {details.subQuestions.map((field) => {
                                  const answerKey = getTableAnswerKey(`${question.id}__table`, rowIndex, field.id);
                                  return (
                                    <td key={field.id} data-label={field.prompt}>
                                      <textarea
                                        rows={3}
                                        value={formAnswers[answerKey] || ''}
                                        onChange={(event) => setAnswers((current) => ({ ...current, [answerKey]: event.target.value }))}
                                        placeholder={`Nh\u1eadp ${field.prompt.toLowerCase()}`}
                                        disabled={isSubmitLocked}
                                        readOnly={isReadonlyView}
                                      />
                                    </td>
                                  );
                                })}
                                {!isReadonlyView ? (
                                  <td className="vtraining-reflection-table-action">
                                    {rowIndex === getTableAnswerRowCount(`${question.id}__table`) - 1 ? (
                                      <button
                                        type="button"
                                        className="vtraining-reflection-add-line"
                                        onClick={() => addTableAnswerRow(`${question.id}__table`)}
                                        disabled={isSubmitLocked}
                                        aria-label={`Th\u00eam d\u00f2ng tr\u1ea3 l\u1eddi cho c\u00e2u ${question.code}`}
                                      >
                                        +
                                      </button>
                                    ) : null}
                                  </td>
                                ) : null}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : details.subQuestions.length ? (
                      <div className="vtraining-reflection-subquestion-stack">
                        {details.intro.length ? <DescriptionLines lines={details.intro} /> : null}
                        {details.subQuestions.map((subQuestion) => {
                          const fields = getSubQuestionFields(subQuestion.notes);
                          const hints = getSubQuestionHints(subQuestion.notes);
                          return (
                            <section className="vtraining-reflection-subquestion" key={subQuestion.id}>
                              <div className="vtraining-reflection-subquestion-head">
                                <div>
                                  <strong>{question.code}.{subQuestion.code} {subQuestion.prompt}</strong>
                                  {hints.length ? <DescriptionLines lines={hints} /> : null}
                                </div>
                              </div>
                              <div className="vtraining-reflection-answer-lines">
                                {fields.map((field) => {
                                  const answerKey = getTableAnswerKey(getSubAnswerBaseKey(question.id, subQuestion.id), 0, field.id);
                                  return (
                                    <label className="vtraining-reflection-answer-line" key={field.id}>
                                      {fields.length > 1 ? <span>{field.label}</span> : null}
                                      <textarea
                                        rows={4}
                                        value={formAnswers[answerKey] || ''}
                                        onChange={(event) => setAnswers((current) => ({ ...current, [answerKey]: event.target.value }))}
                                        placeholder={`Nh\u1eadp ${field.label.toLowerCase()}`}
                                        disabled={isSubmitLocked}
                                        readOnly={isReadonlyView}
                                      />
                                    </label>
                                  );
                                })}
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    ) : question.code === '2' ? (
                      <>
                        <DescriptionLines lines={simpleGuidanceLines} />
                        <textarea
                          rows={8}
                          value={formAnswers[question.id] || ''}
                          onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                          placeholder={'Nh\u1eadp c\u00e2u tr\u1ea3 l\u1eddi c\u1ee7a b\u1ea1n'}
                          disabled={isSubmitLocked}
                          readOnly={isReadonlyView}
                        />
                      </>
                    ) : (
                      <>
                        <DescriptionText value={question.guidance} />
                        <textarea
                          rows={6}
                          value={formAnswers[question.id] || ''}
                          onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                          placeholder={'Nh\u1eadp c\u00e2u tr\u1ea3 l\u1eddi c\u1ee7a b\u1ea1n'}
                          disabled={isSubmitLocked}
                          readOnly={isReadonlyView}
                        />
                      </>
                    )}
                  </article>
                );
              }) : (
                <article className="lecturer-bank-question">
                  <div className="lecturer-bank-question-code">Bài thu hoạch</div>
                  <h4>{activity.description ? activity.title : 'Nhập nội dung bài thu hoạch của bạn'}</h4>
                  <DescriptionText value={activity.description} />
                  <textarea
                    rows={10}
                    value={formAnswers.general_reflection || ''}
                    onChange={(event) => setAnswers((current) => ({ ...current, general_reflection: event.target.value }))}
                    placeholder="Nhập bài thu hoạch của bạn"
                    disabled={isSubmitLocked}
                    readOnly={isReadonlyView}
                  />
                </article>
              )}
            </div>

            <div className="action-row">
              {!isReadonlyView ? (
                <button className="btn btn-primary" disabled={isSubmitLocked} onClick={() => void submit()}>
                  {submitting ? 'Đang lưu bài thu hoạch...' : canUpdateSubmission ? 'Cập nhật bài thu hoạch' : remainingAttempts > 0 ? 'Gửi bài thu hoạch' : 'Đã hết lượt nộp'}
                </button>
              ) : null}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
