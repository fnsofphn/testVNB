import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  CheckCircle2,
  Copy,
  Edit,
  Eye,
  LayoutGrid,
  List,
  MessageCircle,
  Plus,
  Search,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import {
  VDiscussionApiError,
  getDiscussionKind,
  isDiscussionClassInstance,
  isDiscussionLibraryTemplate,
  vdiscussionApi,
  type VDiscussionEvent,
  type VDiscussionEventPayload,
  type VDiscussionParticipantPayload,
  type VDiscussionStudentAssignment,
  type VDiscussionStatus,
} from '@/lib/suniDiscussion';
import { suniTrainingApi, type SuniClassStudent, type SuniTrainingClass, type SuniUser } from '@/lib/suni';
import { queries, toVDiscussionDisplayStepNumber } from '@/features/vdiscussion';
import { queries as sharedQueries } from '@/features/shared';
import { queries as trainingQueries } from '@/features/vtraining';
import { useAuth } from '@/contexts/AuthContext';
import { isTrainingAdminRole, normalizeAppRole } from '@/data/vcontent';

type WizardTopic = {
  title: string;
  description: string;
  durationMinutes: string;
};

const COACHING_3B_SOURCE = 'evnspc-coaching-3b';

const COACHING_3B_STEPS = [
  { step: 1, title: 'Chọn & chẩn đoán nhân viên', short: 'Chọn & chẩn đoán', desc: '5 đặc điểm + 5 nội dung chẩn đoán', heroTitle: 'Chọn & chẩn đoán nhân viên' },
  { step: 2, title: 'Kế hoạch kèm cặp 4 tuần', short: 'Kế hoạch kèm cặp 4 tuần', desc: 'Điền đủ 5 thành tố: Đích, Thực trạng, Phương án, Nhịp & mốc, Đo & chốt.', heroTitle: 'Kế hoạch kèm cặp 4 tuần' },
  { step: 3, title: 'Kế hoạch phát triển 6 tháng', short: 'Kế hoạch phát triển 6 tháng', desc: 'Điền khung phát triển 6 tháng, nối tầng từ kế hoạch kèm cặp 4 tuần.', heroTitle: 'Kế hoạch phát triển 6 tháng' },
  { step: 4, title: 'Hoàn thành & trình bày', short: 'Hoàn thành & trình bày', desc: 'Tự kiểm 5 tiêu chí và cử đại diện trình bày.', heroTitle: 'Hoàn thành & trình bày' },
  { step: 5, title: 'Tổng kết', short: 'Tổng kết', desc: 'Xem lại bài trình bày của nhóm và gửi cho giảng viên.', heroTitle: 'Bài trình bày của nhóm' },
] as const;

const COACHING_3B_PERSONAS = [
  {
    title: 'A. Nhân viên Kinh doanh',
    description: 'Còn yếu một kỹ năng. Chăm chỉ, nắm quy trình nhưng lúng túng khi khách gay gắt; hay đẩy ca khó lên cấp trên. Gốc điển hình: thiếu kỹ năng xử lý cảm xúc khách hàng.',
  },
  {
    title: 'B. Công nhân điện',
    description: 'Chậm thay đổi. Tay nghề ổn nhưng ngại ghi phiếu kèm ảnh, ngại quy trình số mới; quen cách làm cũ. Gốc điển hình: động lực/tâm lý ngại thay đổi thói quen.',
  },
  {
    title: 'C. Đội trưởng / Tổ trưởng',
    description: 'Tiềm năng cần nâng tầm. Giỏi chuyên môn cá nhân nhưng ôm việc, chưa biết điều phối và phát triển tổ viên. Gốc điển hình: thiếu kỹ năng quản lý.',
  },
];

function isCoaching3bTopic(topic: Pick<WizardTopic, 'title' | 'description'>, eventTitle = '') {
  const text = `${eventTitle} ${topic.title} ${topic.description}`.toLowerCase();
  return text.includes('3b') && (text.includes('kèm cặp') || text.includes('kem cap')) && (text.includes('phát triển') || text.includes('phat trien'));
}

function getCoaching3bTopicMetadata(topic: Pick<WizardTopic, 'title' | 'description'>, eventTitle = '') {
  if (!isCoaching3bTopic(topic, eventTitle)) return undefined;
  return {
    sourceStructure: COACHING_3B_SOURCE,
    templateKey: COACHING_3B_SOURCE,
    vdiscussionTemplate: COACHING_3B_SOURCE,
    discussionSteps: COACHING_3B_STEPS,
    visualSpec: {
      sourceFolder: 'project content/vdiscussion/Thảo luận EVNSPC 3b',
      colors: { red: '#C00000', ink: '#1A1A1A', paper: '#FBF9F6', line: '#E4DED6', gold: '#B7852B' },
      layout: 'black-header-timer-horizontal-step-cards',
    },
  };
}

type WizardParticipant = {
  email: string;
  fullName: string;
  studentCode: string;
  profileId?: string | null;
  source?: string;
};

type EventFormState = {
  id?: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  status: VDiscussionStatus;
  autoCreateGroups: boolean;
  metadata: Record<string, unknown>;
};

const EMPTY_FORM: EventFormState = {
  title: '',
  description: '',
  startAt: '',
  endAt: '',
  status: 'draft',
  autoCreateGroups: true,
  metadata: {},
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Ban nhap',
  active: 'Dang phat hanh',
  completed: 'Da ket thuc',
  archived: 'Da luu tru',
};

function getErrorMessage(error: unknown) {
  if (error instanceof VDiscussionApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Không thực hiện được thao tác với VDiscussion.';
}

function dateInputValue(value?: string | null) {
  if (!value) return '';
  return value.slice(0, 16);
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function statusClass(status: string) {
  if (status === 'active') return 'is-green';
  if (status === 'completed') return 'is-blue';
  if (status === 'archived') return 'is-gray';
  return 'is-amber';
}

function groupStudentAssignments(assignments: VDiscussionStudentAssignment[]) {
  const grouped = new Map<string, { event: NonNullable<VDiscussionStudentAssignment['event']>; sessions: VDiscussionStudentAssignment[] }>();
  assignments.forEach((assignment) => {
    if (!assignment.event?.id || !assignment.session?.id || !assignment.group?.id) return;
    const existing = grouped.get(assignment.event.id);
    if (existing) {
      existing.sessions.push(assignment);
    } else {
      grouped.set(assignment.event.id, { event: assignment.event, sessions: [assignment] });
    }
  });
  return [...grouped.values()];
}

function getUserName(user: SuniUser) {
  return user.fullName || user.name || user.email || user.id;
}

function participantKey(participant: Pick<WizardParticipant, 'email' | 'studentCode' | 'fullName'>) {
  return participant.email.trim().toLowerCase() || participant.studentCode.trim().toLowerCase() || participant.fullName.trim().toLowerCase();
}

function dedupeParticipants(rows: WizardParticipant[]) {
  const map = new Map<string, WizardParticipant>();
  rows.forEach((row) => {
    const fullName = row.fullName.trim();
    const key = participantKey(row);
    if (!key || !fullName) return;
    if (!map.has(key)) {
      map.set(key, {
        email: row.email.trim().toLowerCase(),
        fullName,
        studentCode: row.studentCode.trim(),
        profileId: row.profileId || null,
        source: row.source,
      });
    }
  });
  return [...map.values()];
}

function parseParticipantText(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\t;]/).map((part) => part.trim());
      const emailPart = parts.find((part) => /\S+@\S+\.\S+/.test(part)) || '';
      const [first = '', second = '', third = ''] = parts;
      const fullName = emailPart === first ? second : first;
      return {
        fullName: fullName || emailPart || 'Học viên',
        email: emailPart || second,
        studentCode: emailPart === first ? third : third || '',
        source: 'manual',
      } satisfies WizardParticipant;
    });
}

function classStudentToParticipant(student: SuniClassStudent): WizardParticipant {
  return {
    email: student.email || '',
    fullName: student.fullName || student.email || 'Học viên',
    studentCode: student.studentCode || '',
    profileId: student.profileId || null,
    source: student.classCode || student.className || 'class',
  };
}

function StudentDiscussionLanding({ assignments, isLoading }: { assignments: VDiscussionStudentAssignment[]; isLoading: boolean }) {
  const visibleAssignments = useMemo(() => assignments.filter((assignment) => assignment.event?.status === 'active' && assignment.session?.id && assignment.group?.id), [assignments]);
  const groupedEvents = useMemo(() => groupStudentAssignments(visibleAssignments), [visibleAssignments]);

  return (
    <div className="vdiscussion-page is-student">
      <div className="vdiscussion-student-hero">
        <div>
          <span>VDiscussion</span>
          <h1>Thảo luận của tôi</h1>
          <p>Vào đúng nhóm và chủ đề được phân công để đóng góp ý kiến trong lớp.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="vdiscussion-empty">Đang tải phiên thảo luận của bạn...</div>
      ) : groupedEvents.length === 0 ? (
        <div className="vdiscussion-empty">
          <MessageCircle size={42} />
          <strong>Chưa có phiên thảo luận</strong>
          <span>Tài khoản của bạn chưa được gán vào sự kiện thảo luận nào.</span>
        </div>
      ) : (
        <div className="vdiscussion-student-event-list">
          {groupedEvents.map(({ event, sessions }) => (
            <article className="vdiscussion-student-event" key={event.id}>
              <div className="vdiscussion-card-head">
                <span className={`vdiscussion-status ${statusClass(event.status)}`}>{STATUS_LABELS[event.status]}</span>
                <span>{formatDate(event.startAt)}</span>
              </div>
              <h2>{event.title}</h2>
              <div className="vdiscussion-student-session-grid">
                {sessions.map((assignment) => {
                  const routeStep = assignment.session.currentStep || 1;
                  const displayStep = toVDiscussionDisplayStepNumber(routeStep) || 1;
                  return (
                    <Link
                      className="vdiscussion-student-session"
                      key={assignment.session.id}
                      to={`/vdiscussion/session/${assignment.session.id}/overview`}
                    >
                      <strong>{assignment.group.name}</strong>
                      <span>{assignment.topic?.title || 'Chủ đề thảo luận'}</span>
                      <em>Vào bài thảo luận</em>
                    </Link>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function toFormState(event?: VDiscussionEvent | null): EventFormState {
  if (!event) return EMPTY_FORM;
  return {
    id: event.id,
    title: event.title,
    description: event.description || '',
    startAt: dateInputValue(event.startAt),
    endAt: dateInputValue(event.endAt),
    status: event.status,
    autoCreateGroups: event.autoCreateGroups,
    metadata: event.metadata || {},
  };
}

function toPayload(form: EventFormState): VDiscussionEventPayload {
  return {
    id: form.id,
    title: form.title.trim(),
    description: form.description.trim() || null,
    startAt: form.startAt || null,
    endAt: form.endAt || null,
    status: form.id ? form.status : 'draft',
    autoCreateGroups: form.autoCreateGroups,
    metadata: {
      ...(form.metadata || {}),
      discussionKind: getDiscussionKind(form.metadata),
    },
  };
}

function EventModal({ initialEvent, onClose }: { initialEvent: VDiscussionEvent | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EventFormState>(() => toFormState(initialEvent));
  const [errorMessage, setErrorMessage] = useState('');
  const isEdit = Boolean(form.id);

  const saveMutation = useMutation({
    mutationFn: (payload: VDiscussionEventPayload) => vdiscussionApi.saveEvent(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queries.events() });
      onClose();
    },
  });

  function setField<K extends keyof EventFormState>(field: K, value: EventFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    if (!form.title.trim()) {
      setErrorMessage('Cần nhập tên sự kiện thảo luận.');
      return;
    }
    try {
      await saveMutation.mutateAsync(toPayload(form));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <div className="suni-native-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <form className="suni-native-modal" onSubmit={(event) => void handleSubmit(event)}>
        <div className="suni-native-modal-head">
          <div>
            <span>VDiscussion</span>
            <h3>{isEdit ? 'Sửa sự kiện thảo luận' : 'Tạo sự kiện thảo luận'}</h3>
          </div>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>Dong</button>
        </div>

        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

        <div className="form-grid">
          <label className="full">
            <span>Ten su kien</span>
            <input value={form.title} onChange={(event) => setField('title', event.target.value)} placeholder="VD: Thao luan tinh huong trong lop quan ly" />
          </label>
          <label>
            <span>Bat dau</span>
            <input type="datetime-local" value={form.startAt} onChange={(event) => setField('startAt', event.target.value)} />
          </label>
          <label>
            <span>Ket thuc</span>
            <input type="datetime-local" value={form.endAt} onChange={(event) => setField('endAt', event.target.value)} />
          </label>
          <label>
            <span>Trạng thái</span>
            <select value={form.status} onChange={(event) => setField('status', event.target.value as VDiscussionStatus)}>
              <option value="draft">Ban nhap</option>
              {isEdit ? <option value="active">Dang phat hanh</option> : null}
              {isEdit ? <option value="completed">Da ket thuc</option> : null}
              {isEdit ? <option value="archived">Da luu tru</option> : null}
            </select>
          </label>
          <label className="suni-native-checkbox">
            <input type="checkbox" checked={form.autoCreateGroups} onChange={(event) => setField('autoCreateGroups', event.target.checked)} />
            <span>Tu dong tao nhom khi phat hanh</span>
          </label>
          <label className="full">
            <span>Mo ta</span>
            <textarea value={form.description} onChange={(event) => setField('description', event.target.value)} />
          </label>
        </div>

        <div className="action-row">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Huy</button>
          <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo sự kiện'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CreateEventWizard({ classes, users, onClose }: { classes: SuniTrainingClass[]; users: SuniUser[]; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [eventInfo, setEventInfo] = useState({
    title: '',
    description: '',
    durationMinutes: '60',
    startAt: '',
    endAt: '',
  });
  const [topics, setTopics] = useState<WizardTopic[]>([{ title: '', description: '', durationMinutes: '60' }]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [manualText, setManualText] = useState('');
  const [classParticipants, setClassParticipants] = useState<WizardParticipant[]>([]);
  const [manualParticipants, setManualParticipants] = useState<WizardParticipant[]>([]);
  const [numberOfGroups, setNumberOfGroups] = useState('1');
  const [topicGroupMode, setTopicGroupMode] = useState<'auto' | 'manual'>('auto');
  const [topicGroupAssignments, setTopicGroupAssignments] = useState<number[]>([]);
  const [publishNow, setPublishNow] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);

  const validTopics = useMemo(
    () => topics.map((topic, index) => ({
      ...topic,
      title: topic.title.trim(),
      topicNumber: index + 1,
    })).filter((topic) => topic.title),
    [topics],
  );
  const userParticipants = useMemo(() => users
    .filter((user) => selectedUserIds.includes(user.id))
    .map((user) => ({
      email: user.email || '',
      fullName: getUserName(user),
      studentCode: '',
      profileId: user.id,
      source: 'profile',
    } satisfies WizardParticipant)), [selectedUserIds, users]);
  const participants = useMemo(
    () => dedupeParticipants([...classParticipants, ...userParticipants, ...manualParticipants]),
    [classParticipants, manualParticipants, userParticipants],
  );
  const groupCount = Math.max(1, Math.min(participants.length || 1, Number(numberOfGroups || 1)));
  const setupMutation = useMutation({
    mutationFn: () => vdiscussionApi.createCompleteEventSetup({
      event: {
        title: eventInfo.title.trim(),
        description: eventInfo.description.trim() || null,
        startAt: eventInfo.startAt || null,
        endAt: eventInfo.endAt || null,
        durationMinutes: Number(eventInfo.durationMinutes || 60),
        autoCreateGroups: true,
        metadata: {
          discussionKind: 'standalone-instance',
          setupSource: 'native-wizard',
        },
      },
      topics: validTopics.map((topic) => ({
        title: topic.title,
        description: topic.description.trim() || '',
        topicNumber: topic.topicNumber,
        durationMinutes: Number(eventInfo.durationMinutes || 60),
        subProblems: isCoaching3bTopic(topic, eventInfo.title) ? COACHING_3B_PERSONAS : undefined,
        metadata: getCoaching3bTopicMetadata(topic, eventInfo.title),
      })),
      participants: participants.map((participant): VDiscussionParticipantPayload => ({
        eventId: '',
        fullName: participant.fullName,
        profileId: participant.profileId || null,
        email: participant.email || null,
        studentCode: participant.studentCode || null,
        status: 'active',
      })),
      numberOfGroups: groupCount,
      topicGroupMode,
      topicGroupAssignments: Array.from({ length: groupCount }, (_, index) => topicGroupMode === 'manual' ? Number(topicGroupAssignments[index] ?? index) : index),
      publish: publishNow,
      metadata: {
        selectedClassIds,
        selectedUserIds,
        topicGroupMode,
        participantSources: participants.map((participant) => participant.source).filter(Boolean),
      },
    }),
    onSuccess: async (event) => {
      await queryClient.invalidateQueries({ queryKey: queries.events() });
      onClose();
      navigate(`/vdiscussion/${event.id}`);
    },
  });
  const saveLibraryMutation = useMutation({
    mutationFn: async () => {
      const event = await vdiscussionApi.saveEvent({
        title: eventInfo.title.trim(),
        description: eventInfo.description.trim() || null,
        startAt: eventInfo.startAt || null,
        endAt: eventInfo.endAt || null,
        status: 'draft',
        durationMinutes: Number(eventInfo.durationMinutes || 60),
        autoCreateGroups: true,
        metadata: {
          setupSource: 'native-library',
          discussionKind: 'library-template',
          templateVersion: 1,
          topicCount: validTopics.length,
        },
      });
      await Promise.all(validTopics.map((topic) => vdiscussionApi.saveTopic({
        eventId: event.id,
        title: topic.title,
        description: topic.description.trim() || '',
        topicNumber: topic.topicNumber,
        durationMinutes: Number(eventInfo.durationMinutes || 60),
        isActive: true,
        subProblems: isCoaching3bTopic(topic, eventInfo.title) ? COACHING_3B_PERSONAS : undefined,
        metadata: getCoaching3bTopicMetadata(topic, eventInfo.title),
      })));
      return event;
    },
    onSuccess: async (event) => {
      await queryClient.invalidateQueries({ queryKey: queries.events() });
      onClose();
      navigate(`/vdiscussion/${event.id}`);
    },
  });

  function setEventField(field: keyof typeof eventInfo, value: string) {
    setEventInfo((current) => ({ ...current, [field]: value }));
  }

  function setTopicField(index: number, field: keyof WizardTopic, value: string) {
    setTopics((current) => current.map((topic, topicIndex) => topicIndex === index ? { ...topic, [field]: value } : topic));
  }

  function nextStep() {
    setErrorMessage('');
    if (step === 1 && !eventInfo.title.trim()) return setErrorMessage('Cần nhập tên thảo luận.');
    if (step === 1 && !validTopics.length) return setErrorMessage('Cần có ít nhất 1 chủ đề thảo luận.');
    setStep((current) => Math.min(2, current + 1));
  }

  async function loadClassParticipants(nextClassIds: string[]) {
    setSelectedClassIds(nextClassIds);
    setErrorMessage('');
    if (!nextClassIds.length) {
      setClassParticipants([]);
      return;
    }
    setIsLoadingClasses(true);
    try {
      const students = await suniTrainingApi.listClassStudents(nextClassIds);
      setClassParticipants(students.map(classStudentToParticipant));
      if (students.length === 0) {
        setErrorMessage('Chưa tìm thấy học viên liên kết với lớp đã chọn. Có thể thêm profile hoặc dán danh sách học viên.');
      }
    } catch (error) {
      setClassParticipants([]);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoadingClasses(false);
    }
  }

  async function handleParticipantFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setManualText(text);
    setManualParticipants(parseParticipantText(text));
  }

  function applyManualParticipants() {
    setManualParticipants(parseParticipantText(manualText));
  }

  async function finalize() {
    setErrorMessage('');
    if (!eventInfo.title.trim()) return setErrorMessage('Cần nhập tên thảo luận.');
    if (!validTopics.length) return setErrorMessage('Cần có ít nhất 1 chủ đề thảo luận.');
    try {
      await saveLibraryMutation.mutateAsync();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <div className="suni-native-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="suni-native-modal vdiscussion-wizard-modal">
        <div className="suni-native-modal-head">
          <div>
            <span>VDiscussion</span>
            <h3>Tạo sự kiện thảo luận mới</h3>
          </div>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>Đóng</button>
        </div>
        <div className="vdiscussion-wizard-steps is-two">
          {['Tạo chủ đề', 'Xem lại'].map((label, index) => (
            <button type="button" className={step === index + 1 ? 'is-active' : step > index + 1 ? 'is-done' : ''} key={label} onClick={() => setStep(index + 1)}>
              {index + 1}. {label}
            </button>
          ))}
        </div>
        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

        {step === 1 ? (
          <div className="vdiscussion-wizard-body">
            <div className="form-grid">
              <label className="full"><span>Tên thảo luận</span><input value={eventInfo.title} onChange={(event) => setEventField('title', event.target.value)} /></label>
              <label><span>Bắt đầu</span><input type="datetime-local" value={eventInfo.startAt} onChange={(event) => setEventField('startAt', event.target.value)} /></label>
              <label><span>Kết thúc</span><input type="datetime-local" value={eventInfo.endAt} onChange={(event) => setEventField('endAt', event.target.value)} /></label>
              <label><span>Thời lượng/phiên</span><input type="number" min="5" value={eventInfo.durationMinutes} onChange={(event) => setEventField('durationMinutes', event.target.value)} /></label>
              <label className="full"><span>Mục tiêu thảo luận</span><textarea value={eventInfo.description} onChange={(event) => setEventField('description', event.target.value)} /></label>
            </div>
            <div className="vdiscussion-topic-editor">
              <div className="vdiscussion-topic-edit-head">
                <span>Chủ đề</span>
                <span>Mô tả / yêu cầu thảo luận</span>
              </div>
              {topics.map((topic, index) => (
                <div className="vdiscussion-topic-edit-row" key={index}>
                  <input value={topic.title} onChange={(event) => setTopicField(index, 'title', event.target.value)} placeholder={`Chủ đề ${index + 1}`} />
                  <textarea value={topic.description} onChange={(event) => setTopicField(index, 'description', event.target.value)} placeholder="Mô tả / yêu cầu thảo luận" />
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setTopics((current) => current.filter((_, topicIndex) => topicIndex !== index))}>Xóa</button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost" onClick={() => setTopics((current) => [...current, { title: '', description: '', durationMinutes: eventInfo.durationMinutes || '60' }])}>Thêm chủ đề</button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="vdiscussion-wizard-body">
            <section className="vdiscussion-review-overview">
              <div className="vdiscussion-review-title">
                <span>Tổng quan thảo luận</span>
                <h4>{eventInfo.title.trim() || 'Chưa đặt tên thảo luận'}</h4>
                <p>{eventInfo.description.trim() || 'Chưa nhập mục tiêu thảo luận.'}</p>
              </div>
              <div className="vdiscussion-review-metrics">
                <div><span>Chủ đề</span><strong>{validTopics.length}</strong></div>
                <div><span>Thời lượng/phiên</span><strong>{eventInfo.durationMinutes || 60} phút</strong></div>
                <div><span>Trạng thái</span><strong>{publishNow ? 'Phát hành' : 'Bản nháp'}</strong></div>
              </div>
              <div className="vdiscussion-review-note">
                Lưu vào thư viện sẽ tạo bản nháp gồm thông tin thảo luận và danh sách chủ đề. Học viên, nhóm và phát hành có thể cấu hình sau trong màn chi tiết.
              </div>
            </section>
            <section className="vdiscussion-review-topics">
              <div className="vdiscussion-panel-head">
                <h2>Danh sách chủ đề</h2>
                <span>{validTopics.length} chủ đề</span>
              </div>
              <div className="vdiscussion-review-topic-table">
                <div className="vdiscussion-review-topic-head">
                  <span>STT</span>
                  <span>Chủ đề</span>
                  <span>Mô tả / yêu cầu thảo luận</span>
                </div>
                {validTopics.map((topic) => (
                  <div className="vdiscussion-review-topic-row" key={topic.topicNumber}>
                    <strong>{topic.topicNumber}</strong>
                    <p>{topic.title}</p>
                    <p>{topic.description || 'Chưa có mô tả'}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="vdiscussion-wizard-body">
            <div className="form-grid">
              <label className="full">
                <span>Chọn lớp đào tạo</span>
                <select multiple value={selectedClassIds} onChange={(event) => void loadClassParticipants(Array.from(event.target.selectedOptions).map((option) => option.value))}>
                  {classes.map((klass) => <option key={klass.id} value={klass.id}>{klass.code} - {klass.name}</option>)}
                </select>
              </label>
              <label className="full">
                <span>Chọn hồ sơ học viên</span>
                <select multiple value={selectedUserIds} onChange={(event) => setSelectedUserIds(Array.from(event.target.selectedOptions).map((option) => option.value))}>
                  {users.map((user) => <option key={user.id} value={user.id}>{getUserName(user)}</option>)}
                </select>
              </label>
              <label><span>Số nhóm</span><input type="number" min="1" value={numberOfGroups} onChange={(event) => setNumberOfGroups(event.target.value)} /></label>
              <label><span>Gán chủ đề</span><select value={topicGroupMode} onChange={(event) => setTopicGroupMode(event.target.value as 'auto' | 'manual')}><option value="auto">Tự động xoay vòng</option><option value="manual">Chọn thủ công</option></select></label>
              <label className="suni-native-checkbox"><input type="checkbox" checked={publishNow} onChange={(event) => setPublishNow(event.target.checked)} /><span>Phát hành sau khi tạo xong</span></label>
              <label className="full"><span>Nhập học viên CSV/TXT</span><input type="file" accept=".csv,.txt" onChange={(event) => void handleParticipantFile(event)} /></label>
              <label className="full"><span>Dán danh sách học viên</span><textarea value={manualText} onChange={(event) => setManualText(event.target.value)} placeholder="Họ tên, email, mã học viên" /></label>
            </div>
            {topicGroupMode === 'manual' ? (
              <div className="vdiscussion-topic-assignment-grid">
                {Array.from({ length: groupCount }, (_, index) => (
                  <label key={index}>
                    <span>Nhóm {index + 1}</span>
                    <select value={topicGroupAssignments[index] ?? index % Math.max(1, validTopics.length)} onChange={(event) => setTopicGroupAssignments((current) => {
                      const next = [...current];
                      next[index] = Number(event.target.value);
                      return next;
                    })}>
                      {validTopics.map((topic, topicIndex) => <option key={topic.topicNumber} value={topicIndex}>{topic.title}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            ) : null}
            <button type="button" className="btn btn-ghost btn-small" onClick={applyManualParticipants}>Cập nhật danh sách dán</button>
            <div className="vdiscussion-wizard-summary">
              <strong>{participants.length} học viên</strong>
              <span>{isLoadingClasses ? 'Đang tải học viên từ lớp...' : `${groupCount} nhóm dự kiến`}</span>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="vdiscussion-wizard-body">
            <div className="vdiscussion-setup-steps">
              <div className="vdiscussion-setup-step is-done"><strong>Chủ đề</strong><span>{validTopics.length}</span></div>
              <div className="vdiscussion-setup-step is-done"><strong>Học viên</strong><span>{participants.length}</span></div>
              <div className="vdiscussion-setup-step is-done"><strong>Nhóm</strong><span>{groupCount}</span></div>
              <div className="vdiscussion-setup-step is-done"><strong>Gán chủ đề</strong><span>{topicGroupMode === 'manual' ? 'Thủ công' : 'Tự động'}</span></div>
              <div className="vdiscussion-setup-step is-done"><strong>Trạng thái</strong><span>{publishNow ? 'Phát hành' : 'Bản nháp'}</span></div>
            </div>
          </div>
        ) : null}

        <div className="action-row">
          <button type="button" className="btn btn-ghost" onClick={() => step === 1 ? onClose() : setStep((current) => Math.max(1, current - 1))}>{step === 1 ? 'Hủy' : 'Quay lại'}</button>
          {step < 2 ? (
            <button type="button" className="btn btn-primary" onClick={nextStep}>Tiếp tục</button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={saveLibraryMutation.isPending} onClick={() => void finalize()}>{saveLibraryMutation.isPending ? 'Đang lưu...' : 'Lưu vào thư viện'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function VDiscussionEventsPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const viewerRole = normalizeAppRole(profile?.role);
  const isStudent = viewerRole === 'hoc_vien';
  const canManage = isTrainingAdminRole(profile?.role);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'templates' | 'classInstances' | 'standalone' | 'all'>('templates');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [editingEvent, setEditingEvent] = useState<VDiscussionEvent | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);

  const eventsQuery = useQuery({
    queryKey: queries.eventsByStatus(statusFilter),
    queryFn: () => vdiscussionApi.listEvents(statusFilter),
    enabled: canManage,
  });

  const studentAssignmentsQuery = useQuery({
    queryKey: queries.studentAssignments(profile?.id, profile?.email, profile?.studentCode),
    queryFn: () => vdiscussionApi.listStudentAssignments({
      id: profile?.id,
      email: profile?.email,
      studentCode: profile?.studentCode,
    }),
    enabled: isStudent && Boolean(profile?.id || profile?.email || profile?.studentCode),
  });

  const classesQuery = useQuery({
    queryKey: trainingQueries.classes(),
    queryFn: () => suniTrainingApi.listClasses(),
    enabled: canManage,
  });

  const usersQuery = useQuery({
    queryKey: sharedQueries.users(),
    queryFn: () => suniTrainingApi.listUsers(),
    enabled: canManage,
    staleTime: 60 * 1000,
  });

  const events = eventsQuery.data || [];
  const filteredEvents = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return events
      .filter((event) => {
        if (scopeFilter === 'all') return true;
        if (scopeFilter === 'templates') return isDiscussionLibraryTemplate(event);
        if (scopeFilter === 'classInstances') return isDiscussionClassInstance(event);
        return getDiscussionKind(event.metadata) === 'standalone-instance';
      })
      .filter((event) => {
        if (!keyword) return true;
        return [event.title, event.description, event.createdByName].some((value) => String(value || '').toLowerCase().includes(keyword));
      });
  }, [events, scopeFilter, searchQuery]);
  const visibleEventIds = useMemo(() => filteredEvents.map((event) => event.id), [filteredEvents]);
  const selectedVisibleEventIds = useMemo(
    () => visibleEventIds.filter((id) => selectedEventIds.includes(id)),
    [selectedEventIds, visibleEventIds],
  );
  const selectedEventIdSet = useMemo(() => new Set(selectedEventIds), [selectedEventIds]);
  const hasVisibleSelection = selectedVisibleEventIds.length > 0;
  const isAllVisibleSelected = visibleEventIds.length > 0 && selectedVisibleEventIds.length === visibleEventIds.length;

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: VDiscussionStatus }) => vdiscussionApi.updateEventStatus(id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queries.events() });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: (id: string) => vdiscussionApi.cloneEvent(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queries.events() });
    },
  });

  const deleteEventsMutation = useMutation({
    mutationFn: (ids: string[]) => vdiscussionApi.deleteEvents(ids),
    onSuccess: async () => {
      setSelectedEventIds([]);
      await queryClient.invalidateQueries({ queryKey: queries.events() });
    },
  });

  useEffect(() => {
    setSelectedEventIds((current) => {
      const next = current.filter((id) => visibleEventIds.includes(id));
      if (next.length === current.length && next.every((id, index) => id === current[index])) return current;
      return next;
    });
  }, [visibleEventIds]);

  async function runAction(action: () => Promise<unknown>) {
    setActionError('');
    try {
      await action();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  function openCreateModal() {
    setIsWizardOpen(true);
  }

  function openEditModal(event: VDiscussionEvent) {
    setEditingEvent(event);
    setIsModalOpen(true);
  }

  function toggleEventSelection(eventId: string, checked: boolean) {
    setSelectedEventIds((current) => {
      if (checked) return current.includes(eventId) ? current : [...current, eventId];
      return current.filter((id) => id !== eventId);
    });
  }

  function toggleAllVisibleSelection(checked: boolean) {
    setSelectedEventIds((current) => {
      if (checked) return Array.from(new Set([...current, ...visibleEventIds]));
      return current.filter((id) => !visibleEventIds.includes(id));
    });
  }

  async function deleteSelectedEvents() {
    if (!hasVisibleSelection || deleteEventsMutation.isPending) return;
    const confirmed = window.confirm(
      selectedVisibleEventIds.length === 1
        ? 'Xóa thật hoạt động thảo luận đã chọn? Chủ đề, nhóm, phiên thảo luận, bài đóng góp và liên kết lớp sẽ bị xóa khỏi dữ liệu.'
        : `Xóa thật ${selectedVisibleEventIds.length} hoạt động thảo luận đã chọn? Chủ đề, nhóm, phiên thảo luận, bài đóng góp và liên kết lớp sẽ bị xóa khỏi dữ liệu.`,
    );
    if (!confirmed) return;
    await runAction(() => deleteEventsMutation.mutateAsync(selectedVisibleEventIds));
  }

  const stats = [
    { label: 'Tong', value: events.length, tone: 'plain' },
    { label: 'Mau thu vien', value: events.filter(isDiscussionLibraryTemplate).length, tone: 'green' },
    { label: 'Ban theo lop', value: events.filter(isDiscussionClassInstance).length, tone: 'amber' },
    { label: 'Doc lap', value: events.filter((event) => getDiscussionKind(event.metadata) === 'standalone-instance').length, tone: 'blue' },
  ];

  if (isStudent) {
    return (
      <StudentDiscussionLanding
        assignments={studentAssignmentsQuery.data || []}
        isLoading={studentAssignmentsQuery.isLoading}
      />
    );
  }

  return (
    <div className="vdiscussion-page">
      {isModalOpen ? <EventModal initialEvent={editingEvent} onClose={() => setIsModalOpen(false)} /> : null}
      {isWizardOpen ? <CreateEventWizard classes={classesQuery.data || []} users={usersQuery.data || []} onClose={() => setIsWizardOpen(false)} /> : null}

      <div className="vdiscussion-head">
        <div>
          <h1>Quản lý Hoạt động Thảo luận</h1>
          <p>Tổ chức và quản lý các hoạt động thảo luận nhóm trên dữ liệu VContent.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreateModal}>
          <Plus size={16} />
          Tao hoat dong moi
        </button>
      </div>

      {actionError ? <div className="notice danger">{actionError}</div> : null}

      <div className="vdiscussion-stats">
        {stats.map((stat) => (
          <div className={`vdiscussion-stat is-${stat.tone}`} key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>

      <div className="vdiscussion-toolbar">
        <label className="vdiscussion-search">
          <Search size={16} />
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Tim kiem hoat dong..." />
        </label>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">Tat ca trang thai</option>
          <option value="draft">Ban nhap</option>
          <option value="active">Dang phat hanh</option>
          <option value="completed">Da ket thuc</option>
          <option value="archived">Da luu tru</option>
        </select>
        <select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as typeof scopeFilter)}>
          <option value="templates">Thu vien mau</option>
          <option value="classInstances">Ban theo lop</option>
          <option value="standalone">Hoat dong doc lap</option>
          <option value="all">Tat ca loai</option>
        </select>
        <div className="vdiscussion-view-toggle">
          <button type="button" className={viewMode === 'card' ? 'is-active' : ''} onClick={() => setViewMode('card')} aria-label="Xem dang the">
            <LayoutGrid size={16} />
          </button>
          <button type="button" className={viewMode === 'table' ? 'is-active' : ''} onClick={() => setViewMode('table')} aria-label="Xem dang bang">
            <List size={16} />
          </button>
        </div>
      </div>

      {hasVisibleSelection ? (
        <div className="vdiscussion-bulk-bar">
          <span>Đã chọn {selectedVisibleEventIds.length} hoạt động thảo luận</span>
          <button type="button" className="btn btn-danger btn-small" disabled={deleteEventsMutation.isPending} onClick={() => void deleteSelectedEvents()}>
            <Trash2 size={15} />
            {deleteEventsMutation.isPending ? 'Đang xóa...' : 'Xóa thật'}
          </button>
        </div>
      ) : null}

      {eventsQuery.isLoading ? (
        <div className="vdiscussion-empty">Đang tải dữ liệu thảo luận...</div>
      ) : filteredEvents.length === 0 ? (
        <div className="vdiscussion-empty">
          <Calendar size={42} />
          <strong>Chưa có hoạt động nào</strong>
          <span>Tao hoat dong dau tien de bat dau quan ly VDiscussion native.</span>
        </div>
      ) : viewMode === 'table' ? (
        <div className="vdiscussion-table-wrap">
          <table className="vdiscussion-table">
            <thead>
              <tr>
                <th className="vdiscussion-select-cell">
                  <input
                    aria-label="Chọn tất cả hoạt động đang hiển thị"
                    checked={isAllVisibleSelected}
                    className="vdiscussion-select-checkbox"
                    type="checkbox"
                    onChange={(event) => toggleAllVisibleSelection(event.target.checked)}
                  />
                </th>
                <th>Hoat dong</th>
                <th>Trạng thái</th>
                <th>Thoi gian</th>
                <th>Chủ đề</th>
                <th>Học viên</th>
                <th>Nhóm</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((event) => (
                <tr key={event.id}>
                  <td className="vdiscussion-select-cell">
                    <input
                      aria-label={`Chọn ${event.title}`}
                      checked={selectedEventIdSet.has(event.id)}
                      className="vdiscussion-select-checkbox"
                      type="checkbox"
                      onChange={(changeEvent) => toggleEventSelection(event.id, changeEvent.target.checked)}
                    />
                  </td>
                  <td>
                    <strong>{event.title}</strong>
                  </td>
                  <td><span className={`vdiscussion-status ${statusClass(event.status)}`}>{STATUS_LABELS[event.status]}</span></td>
                  <td>{formatDate(event.startAt)}</td>
                  <td>{event.topicCount}</td>
                  <td>{event.participantCount}</td>
                  <td>{event.groupCount}</td>
                  <td>
                    <div className="vdiscussion-row-actions">
                      <Link className="btn btn-ghost btn-small" to={`/vdiscussion/${event.id}`}><Eye size={15} /> Xem</Link>
                      <button type="button" className="btn btn-ghost btn-small" onClick={() => openEditModal(event)}><Edit size={15} /> Sua</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="vdiscussion-grid">
          {filteredEvents.map((event) => (
            <article className="vdiscussion-card" key={event.id}>
              <div className="vdiscussion-card-head">
                <label className="vdiscussion-card-select">
                  <input
                    aria-label={`Chọn ${event.title}`}
                    checked={selectedEventIdSet.has(event.id)}
                    className="vdiscussion-select-checkbox"
                    type="checkbox"
                    onChange={(changeEvent) => toggleEventSelection(event.id, changeEvent.target.checked)}
                  />
                  <span className={`vdiscussion-status ${statusClass(event.status)}`}>{STATUS_LABELS[event.status]}</span>
                </label>
                <span>{formatDate(event.startAt)}</span>
              </div>
              <h2>{event.title}</h2>
              <div className="vdiscussion-card-metrics">
                <span><MessageCircle size={15} /> {event.topicCount} chu de</span>
                <span><Users size={15} /> {event.participantCount} hoc vien</span>
                <span><LayoutGrid size={15} /> {event.groupCount} nhom</span>
              </div>
              <div className="vdiscussion-card-actions">
                <Link className="btn btn-primary btn-small" to={`/vdiscussion/${event.id}`}><Eye size={15} /> Chi tiet</Link>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => openEditModal(event)}><Edit size={15} /> Sua</button>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => void runAction(() => cloneMutation.mutateAsync(event.id))}><Copy size={15} /> Nhan ban</button>
                {event.status === 'draft' ? (
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => void runAction(() => statusMutation.mutateAsync({ id: event.id, status: 'active' }))}><Send size={15} /> Phat hanh</button>
                ) : null}
                {event.status === 'active' ? (
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => void runAction(() => statusMutation.mutateAsync({ id: event.id, status: 'completed' }))}><CheckCircle2 size={15} /> Dong</button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
