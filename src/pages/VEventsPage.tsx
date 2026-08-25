import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { QRCodeSVG } from 'qrcode.react';
import {
  BarChart3,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FilePlus2,
  Link2,
  ListChecks,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  Radio,
  Trash2,
  Upload,
} from 'lucide-react';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  buildVEventCopyDraft,
  buildVEventJoinLink,
  buildVEventPresentLink,
  canEditVEventQuestionStructure,
  clearVEventResults,
  createVEvent,
  deleteVEvent,
  getVEvent,
  listVEvents,
  listVEventStats,
  makeVEventCode,
  parseVEventQuestionsFromText,
  sanitizeVEventCode,
  updateVEventDetails,
  updateVEventQuestionDetails,
  updateVEventQuestionStatus,
  updateVEventState,
  type VEvent,
  type VEventOption,
  type VEventQuestion,
  type VEventQuestionDraft,
  type VEventQuestionStats,
  type VEventResultsVisibility,
  type VEventStatus,
} from '@/lib/vEvents';
import { getRuntimePollMs, shouldUseRuntimePolling } from '@/lib/runtimeLoadMode';

const HCMC_SAMPLE_TEXT = `NỘI DUNG TƯƠNG TÁC SỬ DỤNG MENTIMETER
ĐÀO TẠO CMHV EVNHCMC
Mentimeter 1
Câu hỏi: Theo Anh/Chị, điều gì khiến khách hàng mất niềm tin vào EVNHCMC nhanh nhất?
Các đáp án lựa chọn:
Hứa nhưng không thực hiện.
Chậm phản hồi, để khách hàng phải chờ.
Giải thích khó hiểu, dùng nhiều thuật ngữ chuyên môn.
Thiếu tôn trọng, nói năng cộc lốc.
Đùn đẩy trách nhiệm.
Không xin lỗi khi khách hàng gặp bất tiện.
Không theo sát vấn đề đến cùng.
Mentimeter 2
Câu hỏi: Nếu chỉ có 30 giây đầu tiên để đánh giá một nhân viên EVNHCMC, theo Anh/Chị, khách hàng sẽ nhìn vào điều gì?
Các đáp án lựa chọn:
Đồng phục.
Bảng tên.
Ánh mắt.
Nụ cười.
Cách chào hỏi.
Tư thế đứng/ngồi.
Giọng nói.
Thái độ tập trung.
Không gian làm việc.
Mentimeter 3
Câu hỏi: Theo Anh/Chị, nhóm nào trong 5 nhóm thực hành nhập vai thể hiện tốt nhất Gương mặt đại sứ EVNHCMC
Các đáp án lựa chọn:
Cặp thứ 1
Cặp thứ 2
Cặp thứ 3
Cặp thứ 4
Cặp thứ 5
Mentimeter 4
Câu hỏi: Theo Anh/Chị, đối với EVNHCMC, khách hàng thường khó chịu nhất ở điểm chạm nào?
Các đáp án lựa chọn:
Qua kênh Tổng đài/điện thoại.
Qua kênh Email/Zalo OA/Website
Qua App CSKH EVNHCMC
Tại Quầy giao dịch.
Tại Hiện trường.
Khi phải chờ phản hồi.
Khi phải trình bày lại nhiều lần cùng 1 vấn đề`;

type VEventPanel = 'events' | 'create' | 'results' | 'links';

function statusTone(status: VEvent['status']): 'success' | 'warning' | 'neutral' | 'danger' | 'violet' | 'purple' {
  if (status === 'active') return 'success';
  if (status === 'draft') return 'warning';
  if (status === 'completed') return 'violet';
  return 'neutral';
}

function visibilityLabel(value: VEventResultsVisibility) {
  if (value === 'instant') return 'Hiện ngay';
  if (value === 'private') return 'Riêng tư';
  return 'Ẩn tới khi reveal';
}

function activeStats(stats: VEventQuestionStats[], questionId?: string | null) {
  return stats.filter((item) => item.questionId === questionId);
}

function questionVoteCount(stats: VEventQuestionStats[], questionId?: string | null) {
  return activeStats(stats, questionId).reduce((sum, item) => sum + item.count, 0);
}

function questionsToVEventSourceText(questions: VEventQuestionDraft[]) {
  return questions
    .map((question) => [
      `Mentimeter ${question.questionNumber}`,
      `Câu hỏi: ${question.title}`,
      'Các đáp án lựa chọn:',
      ...question.options.map((option) => option.label),
    ].join('\n'))
    .join('\n\n');
}

async function docxToPlainText(file: File) {
  const zip = await JSZip.loadAsync(file);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml || typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(documentXml, 'application/xml');
  return Array.from(doc.getElementsByTagName('w:p'))
    .map((paragraph) => Array.from(paragraph.getElementsByTagName('w:t')).map((node) => node.textContent || '').join(''))
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function eventPanelSubtitle(panel: VEventPanel, events: VEvent[], activeEvent: VEvent | null) {
  if (panel === 'events') return `${events.length} event đã tạo`;
  if (panel === 'create') return 'Dán nội dung hoặc import Word/TXT';
  if (panel === 'results') return activeEvent ? `Đang xem: ${activeEvent.title}` : 'Chọn event để xem kết quả';
  return activeEvent ? buildVEventJoinLink(activeEvent.code) : 'Chọn event để lấy link';
}

export function VEventsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { eventId: routeEventId = '' } = useParams();
  const panel = useMemo<VEventPanel>(() => {
    if (location.pathname.endsWith('/create')) return 'create';
    if (routeEventId && location.pathname.endsWith('/links')) return 'links';
    if (routeEventId && location.pathname.endsWith('/results')) return 'results';
    return 'events';
  }, [location.pathname, routeEventId]);
  const [events, setEvents] = useState<VEvent[]>([]);
  const [activeEventId, setActiveEventId] = useState('');
  const [activeEvent, setActiveEvent] = useState<VEvent | null>(null);
  const [questions, setQuestions] = useState<VEventQuestion[]>([]);
  const [stats, setStats] = useState<VEventQuestionStats[]>([]);
  const [sourceText, setSourceText] = useState(HCMC_SAMPLE_TEXT);
  const [eventTitle, setEventTitle] = useState('Đào tạo CMHV EVNHCMC - Bộ câu hỏi tương tác');
  const [eventCode, setEventCode] = useState('HCMC26');
  const [eventDescription, setEventDescription] = useState('Live interaction event tạo từ nội dung Mentimeter.');
  const [eventResultsVisibility, setEventResultsVisibility] = useState<VEventResultsVisibility>('hidden_until_reveal');
  const [createDraftSource, setCreateDraftSource] = useState('');
  const [draftQuestions, setDraftQuestions] = useState<VEventQuestionDraft[]>(() => parseVEventQuestionsFromText(HCMC_SAMPLE_TEXT));
  const [editingEventId, setEditingEventId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<VEventStatus>('draft');
  const [editParticipationEnabled, setEditParticipationEnabled] = useState(true);
  const [editResultsVisibility, setEditResultsVisibility] = useState<VEventResultsVisibility>('hidden_until_reveal');
  const [editingQuestionId, setEditingQuestionId] = useState('');
  const [editQuestionTitle, setEditQuestionTitle] = useState('');
  const [editQuestionOptions, setEditQuestionOptions] = useState<VEventOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const activeQuestion = questions.find((question) => question.id === activeEvent?.activeQuestionId) || null;
  const joinLink = activeEvent ? buildVEventJoinLink(activeEvent.code) : '';
  const presentLink = activeEvent ? buildVEventPresentLink(activeEvent.id) : '';
  const currentStats = activeStats(stats, activeQuestion?.id);
  const responseCount = questionVoteCount(stats, activeQuestion?.id);
  const pollMs = shouldUseRuntimePolling('events') ? getRuntimePollMs('events', 3000) : 0;
  const parsedSummary = useMemo(() => `${draftQuestions.length} câu hỏi, ${draftQuestions.reduce((sum, item) => sum + item.options.length, 0)} lựa chọn`, [draftQuestions]);

  async function refreshEvents(nextActiveId = activeEventId) {
    const rows = await listVEvents();
    setEvents(rows);
    const preferredId = routeEventId || nextActiveId;
    if (preferredId && rows.some((item) => item.id === preferredId)) {
      setActiveEventId(preferredId);
      return;
    }
    if (!routeEventId) setActiveEventId(rows[0]?.id || '');
  }

  async function refreshActiveEvent(targetId = activeEventId) {
    if (!targetId) {
      setActiveEvent(null);
      setQuestions([]);
      setStats([]);
      return;
    }
    const bundle = await getVEvent(targetId);
    if (!bundle) return;
    setActiveEvent(bundle.event);
    setQuestions(bundle.questions);
    setStats(await listVEventStats(targetId));
  }

  useEffect(() => {
    void refreshEvents().catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách V-events.'));
  }, []);

  useEffect(() => {
    if (routeEventId) setActiveEventId(routeEventId);
  }, [routeEventId]);

  useEffect(() => {
    void refreshActiveEvent(activeEventId).catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Không tải được event.'));
  }, [activeEventId]);

  useEffect(() => {
    if (!activeEventId || !pollMs) return undefined;
    const timer = window.setInterval(() => {
      void refreshActiveEvent(activeEventId).catch(() => undefined);
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [activeEventId, pollMs]);

  function selectEvent(eventId: string, nextPanel: VEventPanel = 'results') {
    setActiveEventId(eventId);
    navigate(`/v-events/${eventId}/${nextPanel === 'links' ? 'links' : 'results'}`);
  }

  function handleParse() {
    const parsed = parseVEventQuestionsFromText(sourceText);
    setDraftQuestions(parsed);
    setNotice(parsed.length ? `Đã đọc ${parsed.length} câu hỏi từ nội dung.` : 'Chưa nhận diện được câu hỏi Mentimeter.');
  }

  async function handleImportFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setErrorMessage('');
    try {
      const text = file.name.toLowerCase().endsWith('.docx') ? await docxToPlainText(file) : await file.text();
      setSourceText(text);
      const parsed = parseVEventQuestionsFromText(text);
      setDraftQuestions(parsed);
      setEventTitle(file.name.replace(/\.[^.]+$/, ''));
      setEventCode(makeVEventCode(file.name));
      setEventDescription('Live interaction event tạo từ nội dung Mentimeter.');
      setEventResultsVisibility('hidden_until_reveal');
      setCreateDraftSource('');
      navigate('/v-events/create');
      setNotice(`Đã import ${file.name}: ${parsed.length} câu hỏi.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không import được file.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateEvent() {
    if (!draftQuestions.length) {
      setErrorMessage('Cần parse ít nhất một câu hỏi trước khi tạo event.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const event = await createVEvent({
        title: eventTitle,
        code: eventCode,
        description: eventDescription,
        questions: draftQuestions,
        resultsVisibility: eventResultsVisibility,
      });
      setNotice(`Đã tạo V-event ${event.code}.`);
      setCreateDraftSource('');
      await refreshEvents(event.id);
      setActiveEventId(event.id);
      navigate(`/v-events/${event.id}/results`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được V-event.');
    } finally {
      setBusy(false);
    }
  }

  async function runEventAction(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setErrorMessage('');
    try {
      await action();
      setNotice(message);
      await refreshEvents(activeEventId);
      await refreshActiveEvent(activeEventId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thực hiện được thao tác.');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(event: VEvent) {
    setEditingEventId(event.id);
    setEditTitle(event.title);
    setEditCode(event.code);
    setEditDescription(event.description || '');
    setEditStatus(event.status);
    setEditParticipationEnabled(event.participationEnabled);
    setEditResultsVisibility(event.resultsVisibility);
  }

  async function saveEdit(event: VEvent) {
    await runEventAction(async () => {
      await updateVEventDetails(event.id, {
        title: editTitle,
        code: editCode,
        description: editDescription,
      });
      await updateVEventState(event.id, {
        status: editStatus,
        participationEnabled: editParticipationEnabled,
        resultsVisibility: editResultsVisibility,
        activeQuestionId: editStatus === 'completed' || !editParticipationEnabled ? null : event.activeQuestionId,
      });
      setEditingEventId('');
    }, 'Đã lưu thông tin event.');
  }

  async function duplicateEvent(event: VEvent) {
    setBusy(true);
    setErrorMessage('');
    try {
      const bundle = await getVEvent(event.id);
      if (!bundle) return;
      const draft = buildVEventCopyDraft(bundle.event, bundle.questions);
      setEventTitle(draft.title);
      setEventCode(draft.code);
      setEventDescription(draft.description);
      setEventResultsVisibility(draft.resultsVisibility);
      setDraftQuestions(draft.questions);
      setSourceText(questionsToVEventSourceText(draft.questions));
      setCreateDraftSource(draft.sourceEventTitle);
      setNotice('Da copy event thanh ban nhap. Kiem tra noi dung roi bam Tao V-event de luu phien moi.');
      navigate('/v-events/create');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không copy được event.');
    } finally {
      setBusy(false);
    }
  }

  async function removeEvent(event: VEvent) {
    const ok = window.confirm(`Xoá V-event "${event.title}"? Kết quả phản hồi của event này cũng sẽ bị xoá.`);
    if (!ok) return;
    await runEventAction(async () => {
      await deleteVEvent(event.id);
      if (event.id === activeEventId) {
        setActiveEventId('');
        navigate('/v-events');
      }
    }, 'Đã xoá V-event.');
  }

  async function copyJoinLink(event = activeEvent) {
    if (!event) return;
    await navigator.clipboard?.writeText(buildVEventJoinLink(event.code));
    setNotice('Đã copy link tham gia.');
  }

  async function copyPresentLink(event = activeEvent) {
    if (!event) return;
    await navigator.clipboard?.writeText(buildVEventPresentLink(event.id));
    setNotice('Đã copy link present kết quả live.');
  }

  async function openQuestion(question: VEventQuestion) {
    if (!activeEvent) return;
    await runEventAction(async () => {
      await Promise.all(questions.filter((item) => item.status === 'open' && item.id !== question.id).map((item) => updateVEventQuestionStatus(item.id, 'closed')));
      await updateVEventQuestionStatus(question.id, 'open');
      await updateVEventState(activeEvent.id, {
        status: 'active',
        participationEnabled: true,
        activeQuestionId: question.id,
      });
    }, `Đã mở câu ${question.questionNumber}.`);
  }

  async function closeQuestion(question: VEventQuestion) {
    if (!activeEvent) return;
    await runEventAction(async () => {
      await updateVEventQuestionStatus(question.id, 'closed');
      await updateVEventState(activeEvent.id, { participationEnabled: true });
    }, `Đã đóng câu ${question.questionNumber}.`);
  }

  async function setVisibility(resultsVisibility: VEventResultsVisibility) {
    if (!activeEvent) return;
    await runEventAction(() => updateVEventState(activeEvent.id, { resultsVisibility }), `Chế độ kết quả: ${visibilityLabel(resultsVisibility)}.`);
  }

  async function endEvent() {
    if (!activeEvent) return;
    await runEventAction(() => updateVEventState(activeEvent.id, { status: 'completed', participationEnabled: false, activeQuestionId: null }), 'Đã kết thúc V-event.');
  }

  async function clearResults() {
    if (!activeEvent) return;
    const ok = window.confirm(`Làm trống kết quả V-event "${activeEvent.title}"?\n\nTất cả phản hồi hiện tại sẽ bị xóa để dùng lại event này. Câu hỏi, mã tham gia và link public vẫn được giữ nguyên.`);
    if (!ok) return;
    await runEventAction(() => clearVEventResults(activeEvent.id), 'Đã làm trống kết quả. Event sẵn sàng dùng lại.');
  }

  function startEditQuestion(question: VEventQuestion) {
    setEditingQuestionId(question.id);
    setEditQuestionTitle(question.title);
    setEditQuestionOptions(question.options.map((option) => ({ ...option })));
  }

  function cancelEditQuestion() {
    setEditingQuestionId('');
    setEditQuestionTitle('');
    setEditQuestionOptions([]);
  }

  function updateEditQuestionOption(optionId: string, label: string) {
    setEditQuestionOptions((current) => current.map((option) => option.id === optionId ? { ...option, label } : option));
  }

  function makeEditQuestionOptionId(question: VEventQuestion) {
    const usedIds = new Set(editQuestionOptions.map((option) => option.id));
    for (let index = editQuestionOptions.length + 1; index <= editQuestionOptions.length + 20; index += 1) {
      const candidate = `q${question.questionNumber}-o${index}`;
      if (!usedIds.has(candidate)) return candidate;
    }
    return `q${question.questionNumber}-o${Date.now().toString(36)}`;
  }

  function addEditQuestionOption(question: VEventQuestion) {
    if (!canEditVEventQuestionStructure(question, stats)) return;
    setEditQuestionOptions((current) => [...current, { id: makeEditQuestionOptionId(question), label: '' }]);
  }

  function removeEditQuestionOption(question: VEventQuestion, optionId: string) {
    if (!canEditVEventQuestionStructure(question, stats)) return;
    setEditQuestionOptions((current) => current.filter((option) => option.id !== optionId));
  }

  async function saveEditQuestion(question: VEventQuestion) {
    const canEditStructure = canEditVEventQuestionStructure(question, stats);
    const title = editQuestionTitle.trim();
    if (!title) {
      setErrorMessage('Câu hỏi không được để trống.');
      return;
    }

    const options = canEditStructure
      ? editQuestionOptions
      : question.options.map((option) => ({
        ...option,
        label: editQuestionOptions.find((item) => item.id === option.id)?.label ?? option.label,
      }));
    if (!options.some((option) => option.label.trim())) {
      setErrorMessage('Cần ít nhất một đáp án hợp lệ.');
      return;
    }
    if (!canEditStructure && options.some((option) => !option.label.trim())) {
      setErrorMessage('Câu đã có dữ liệu live không được để trống nhãn đáp án.');
      return;
    }

    await runEventAction(async () => {
      await updateVEventQuestionDetails(question.id, { title, options });
      cancelEditQuestion();
    }, `Đã lưu câu ${question.questionNumber}.`);
  }

  function updateDraftQuestion(questionId: string, patch: Partial<VEventQuestionDraft>) {
    setDraftQuestions((current) => current.map((question) => question.id === questionId ? { ...question, ...patch } : question));
  }

  function updateDraftOption(questionId: string, optionId: string, label: string) {
    setDraftQuestions((current) => current.map((question) => question.id === questionId ? {
      ...question,
      options: question.options.map((option) => option.id === optionId ? { ...option, label } : option),
    } : question));
  }

  function addDraftOption(questionId: string) {
    setDraftQuestions((current) => current.map((question) => {
      if (question.id !== questionId) return question;
      const nextIndex = question.options.length + 1;
      return {
        ...question,
        options: [...question.options, { id: `${question.id}-o${nextIndex}-${Date.now().toString(36)}`, label: '' }],
      };
    }));
  }

  function removeDraftOption(questionId: string, optionId: string) {
    setDraftQuestions((current) => current.map((question) => question.id === questionId ? {
      ...question,
      options: question.options.filter((option) => option.id !== optionId),
    } : question));
  }

  function resetCreateDraft() {
    const parsed = parseVEventQuestionsFromText(HCMC_SAMPLE_TEXT);
    setSourceText(HCMC_SAMPLE_TEXT);
    setEventTitle('Đào tạo CMHV EVNHCMC - Bộ câu hỏi tương tác');
    setEventCode('HCMC26');
    setEventDescription('Live interaction event tạo từ nội dung Mentimeter.');
    setEventResultsVisibility('hidden_until_reveal');
    setCreateDraftSource('');
    setDraftQuestions(parsed);
    setNotice('Đã làm mới form khởi tạo event.');
  }

  function renderLayerNav() {
    const items: Array<{ id: VEventPanel; label: string; path: string; disabled?: boolean }> = [
      { id: 'create', label: 'Khởi tạo event', path: '/v-events/create' },
      { id: 'events', label: 'Danh sách event', path: '/v-events' },
      { id: 'links', label: 'Link public', path: activeEvent ? `/v-events/${activeEvent.id}/links` : '/v-events', disabled: !activeEvent },
    ];
    return (
      <aside className="vsurvey-sidebar">
        {items.map((item) => (
          <button
            className={panel === item.id ? 'is-active' : ''}
            disabled={item.disabled}
            key={item.id}
            type="button"
            onClick={() => navigate(item.path)}
          >
            {item.label}
          </button>
        ))}
      </aside>
    );
  }

  function renderEventsPanel() {
    return (
      <Card title="Danh sách V-events">
        <SectionHeader eye="Events" title="Phiên đã tạo" subtitle="Dạng bảng giống V-survey: xem nhanh, lấy link, copy, sửa, xoá." />
        <div className="vdiscussion-inline-form vsurvey-table-filters">
          <label>
            <span>Trạng thái</span>
            <select value="all" disabled>
              <option>Tất cả</option>
            </select>
          </label>
          <label>
            <span>Tìm event</span>
            <input placeholder="Mã, tiêu đề, mô tả" readOnly />
          </label>
          <div className="vsurvey-table-meta">Hiển thị {events.length} event</div>
        </div>
        <table className="vsurvey-forms-table vevents-events-table">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên event</th>
              <th>Mô tả</th>
              <th>Câu hỏi</th>
              <th>Phản hồi</th>
              <th>Trạng thái</th>
              <th>Link</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const isEditing = editingEventId === event.id;
              const isActive = event.id === activeEventId;
              const questionCount = isActive ? questions.length : '-';
              const responseTotal = isActive ? stats.reduce((sum, item) => sum + item.count, 0) : '-';
              if (isEditing) {
                return (
                  <tr className="is-active" key={event.id}>
                    <td><input value={editCode} onChange={(inputEvent) => setEditCode(sanitizeVEventCode(inputEvent.target.value))} /></td>
                    <td><input value={editTitle} onChange={(inputEvent) => setEditTitle(inputEvent.target.value)} /></td>
                    <td><input value={editDescription} onChange={(inputEvent) => setEditDescription(inputEvent.target.value)} /></td>
                    <td>{questionCount}</td>
                    <td>
                      <select value={editParticipationEnabled ? 'open' : 'closed'} onChange={(inputEvent) => setEditParticipationEnabled(inputEvent.target.value === 'open')}>
                        <option value="open">Mo tham gia</option>
                        <option value="closed">Dong tham gia</option>
                      </select>
                    </td>
                    <td>
                      <select value={editStatus} onChange={(inputEvent) => setEditStatus(inputEvent.target.value as VEventStatus)}>
                        <option value="draft">draft</option>
                        <option value="active">active</option>
                        <option value="completed">completed</option>
                        <option value="archived">archived</option>
                      </select>
                    </td>
                    <td>
                      <select value={editResultsVisibility} onChange={(inputEvent) => setEditResultsVisibility(inputEvent.target.value as VEventResultsVisibility)}>
                        <option value="hidden_until_reveal">An ket qua</option>
                        <option value="instant">Hien ngay</option>
                        <option value="private">Rieng tu</option>
                      </select>
                    </td>
                    <td>
                      <div className="production-plan-row-actions-icons">
                        <button className="data-action-icon" type="button" title="Lưu" disabled={busy} onClick={() => void saveEdit(event)}>✓</button>
                        <button className="data-action-icon" type="button" title="Huỷ" onClick={() => setEditingEventId('')}>×</button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr className={isActive ? 'is-active' : ''} key={event.id} onClick={() => selectEvent(event.id, 'results')}>
                  <td><strong>{event.code}</strong></td>
                  <td>{event.title}</td>
                  <td>{event.description || 'Live interaction'}</td>
                  <td>{questionCount}</td>
                  <td>{responseTotal}</td>
                  <td><Badge tone={statusTone(event.status)}>{event.status}</Badge></td>
                  <td>{buildVEventJoinLink(event.code)}</td>
                  <td onClick={(clickEvent) => clickEvent.stopPropagation()}>
                    <div className="production-plan-row-actions-icons">
                      <button className="vevents-delete-action" type="button" title="Xóa event" aria-label="Xóa event" disabled={busy} onClick={() => void removeEvent(event)}><Trash2 size={14} /><span>Xóa</span></button>
                      <button className="data-action-icon" type="button" title="Xem kết quả" onClick={() => selectEvent(event.id, 'results')}><BarChart3 size={14} /></button>
                      <button className="data-action-icon" type="button" title="Lấy link" onClick={() => { setActiveEventId(event.id); navigate(`/v-events/${event.id}/links`); }}><Link2 size={14} /></button>
                      <button className="data-action-icon" type="button" title="Copy link học viên" onClick={() => void copyJoinLink(event)}><Copy size={14} /></button>
                      <a className="data-action-icon" title="Mở present kết quả" href={buildVEventPresentLink(event.id)} target="_blank" rel="noreferrer"><ExternalLink size={14} /></a>
                      <button className="data-action-icon" type="button" title="Copy event" onClick={() => void duplicateEvent(event)}><FilePlus2 size={14} /></button>
                      <button className="data-action-icon" type="button" title="Sửa" onClick={() => startEdit(event)}><Pencil size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!events.length ? <div className="vdiscussion-empty">Chưa có V-event nào. Chuyển sang "Khởi tạo event" để tạo phiên đầu tiên.</div> : null}
      </Card>
    );
  }

  function renderCreatePanel() {
    return (
      <>
        <Card title="Tạo event từ nội dung Mentimeter">
          <SectionHeader eye="Khởi tạo" title="Nguồn câu hỏi" subtitle={parsedSummary} />
          <div className="vdiscussion-inline-form">
            {createDraftSource ? (
              <div className="notice success full">Ban nhap dang copy tu event: {createDraftSource}</div>
            ) : null}
            <label>
              <span>Tiêu đề event</span>
              <input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} />
            </label>
            <label>
              <span>Mã tham gia</span>
              <input value={eventCode} onChange={(event) => setEventCode(sanitizeVEventCode(event.target.value))} />
            </label>
            <label>
              <span>Mo ta</span>
              <input value={eventDescription} onChange={(event) => setEventDescription(event.target.value)} />
            </label>
            <label>
              <span>Hien thi ket qua</span>
              <select value={eventResultsVisibility} onChange={(event) => setEventResultsVisibility(event.target.value as VEventResultsVisibility)}>
                <option value="hidden_until_reveal">An toi khi reveal</option>
                <option value="instant">Hien ngay</option>
                <option value="private">Rieng tu</option>
              </select>
            </label>
            <label className="full">
              <span>Dan noi dung Word/Mentimeter</span>
              <textarea rows={10} value={sourceText} onChange={(event) => setSourceText(event.target.value)} />
            </label>
            <div className="action-row">
              <button className="btn btn-ghost" type="button" onClick={resetCreateDraft} disabled={busy}><Plus size={16} /> Lam moi form</button>
              <button className="btn btn-ghost" type="button" onClick={handleParse} disabled={busy}><Radio size={16} /> Parse câu hỏi</button>
              <label className="btn btn-ghost">
                <Upload size={16} /> Import Word/TXT
                <input type="file" accept=".docx,.txt,.md,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={{ display: 'none' }} onChange={(event) => void handleImportFile(event.target.files?.[0] || null)} />
              </label>
              <button className="btn btn-primary" type="button" onClick={() => void handleCreateEvent()} disabled={busy || !draftQuestions.length}><Plus size={16} /> {createDraftSource ? 'Tao ban copy moi' : 'Tao V-event'}</button>
            </div>
          </div>
        </Card>

        <Card title="Câu hỏi đã parse">
          <SectionHeader eye="Review" title="Nội dung sẽ đưa lên live event" subtitle="Rà lại trước khi tạo event hoặc dùng làm bản nháp cho lớp tiếp theo." />
          <div className="vdiscussion-list vevents-results-list">
            {draftQuestions.map((question) => (
              <div className="vdiscussion-list-row is-rich" key={question.id}>
                <strong>Câu {question.questionNumber}</strong>
                <textarea rows={2} value={question.title} onChange={(event) => updateDraftQuestion(question.id, { title: event.target.value })} />
                <div className="vevents-draft-options">
                  <div className="vevents-draft-options-head">
                    <span>{question.options.length} lựa chọn</span>
                    <button className="btn btn-ghost btn-small" type="button" onClick={() => addDraftOption(question.id)}><Plus size={14} /> Thêm đáp án</button>
                  </div>
                  {question.options.map((option, index) => (
                    <div className="vevents-draft-option-row" key={option.id}>
                      <span>{index + 1}</span>
                      <textarea rows={2} value={option.label} onChange={(event) => updateDraftOption(question.id, option.id, event.target.value)} />
                      <button className="btn btn-ghost btn-small" type="button" onClick={() => removeDraftOption(question.id, option.id)} disabled={question.options.length <= 1}><Trash2 size={14} /> Xóa</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!draftQuestions.length ? <div className="vdiscussion-empty">Chưa có câu hỏi hợp lệ.</div> : null}
          </div>
        </Card>
      </>
    );
  }

  function renderResultsPanel() {
    if (!activeEvent) {
      return <Card title="Kết quả"><div className="vdiscussion-empty">Chọn một event trong danh sách để xem kết quả.</div></Card>;
    }
    return (
      <>
        <Card title="Presenter console">
          <SectionHeader eye="Presenter" title={activeEvent.title} subtitle={`Mã tham gia: ${activeEvent.code} · ${visibilityLabel(activeEvent.resultsVisibility)}`} />
          <div className="vdiscussion-monitor-presentation-layout">
            <div className="vdiscussion-monitor-presentation-main">
              <div className="vdiscussion-step-hero">
                <span>Câu đang live</span>
                <h2>{activeQuestion ? activeQuestion.title : 'Chưa mở câu hỏi'}</h2>
                <p>{activeQuestion ? `${responseCount} phản hồi cho câu này` : 'Chọn một câu bên dưới để bắt đầu.'}</p>
              </div>
              <div className="vdiscussion-card-list">
                {currentStats.map((item) => (
                  <div className="vdiscussion-work-card" key={`${item.questionId}-${item.optionId}`}>
                    <div className="vdiscussion-card-head">
                      <h3>{item.label}</h3>
                      <strong>{item.count}</strong>
                    </div>
                    <div className="vdiscussion-monitor-meter"><span style={{ width: `${Math.min(100, item.percent)}%` }} /></div>
                    <p>{item.percent}%</p>
                  </div>
                ))}
                {activeQuestion && !currentStats.length ? <div className="vdiscussion-empty">Chưa có dữ liệu kết quả.</div> : null}
              </div>
            </div>
            <aside className="vdiscussion-monitor-side">
              <section>
                <h3>Điều khiển</h3>
                <button className="btn btn-ghost btn-small" onClick={() => void setVisibility('hidden_until_reveal')}><EyeOff size={15} /> Ẩn kết quả</button>
                <button className="btn btn-ghost btn-small" onClick={() => void setVisibility('instant')}><Eye size={15} /> Hiện kết quả</button>
                <button className="btn btn-primary btn-small" onClick={() => void refreshActiveEvent()}><BarChart3 size={15} /> Refresh stats</button>
                <button className="btn btn-danger btn-small" onClick={() => void clearResults()} disabled={busy}><Trash2 size={15} /> Làm trống kết quả</button>
                <button className="btn btn-danger btn-small" onClick={() => void endEvent()} disabled={busy}><PauseCircle size={15} /> Kết thúc</button>
              </section>
            </aside>
          </div>
        </Card>

        <Card title="Kết quả theo từng câu">
          <SectionHeader eye="Results" title="Tổng hợp phản hồi" subtitle="Click Mở để đưa câu hỏi lên màn học viên." />
          <div className="vdiscussion-list">
            {questions.map((question) => {
              const questionStats = activeStats(stats, question.id);
              const votes = questionVoteCount(stats, question.id);
              const isEditingQuestion = editingQuestionId === question.id;
              const canEditQuestionStructure = canEditVEventQuestionStructure(question, stats);
              return (
                <div className="vdiscussion-list-row is-rich vevents-question-result-row" key={question.id}>
                  <div className="vevents-question-result-copy">
                    <strong>Câu {question.questionNumber}: {question.title}</strong>
                    <span>{question.options.length} lựa chọn · {votes} phản hồi · <Badge tone={question.status === 'open' ? 'success' : question.status === 'closed' ? 'neutral' : 'warning'}>{question.status}</Badge></span>
                  </div>
                  {isEditingQuestion ? (
                    <div className="vdiscussion-inline-form full">
                      <label className="full">
                        <span>Nội dung câu hỏi</span>
                        <textarea rows={2} value={editQuestionTitle} onChange={(event) => setEditQuestionTitle(event.target.value)} />
                      </label>
                      <div className="vevents-draft-options full">
                        <div className="vevents-draft-options-head">
                          <span>{canEditQuestionStructure ? 'Có thể thêm/xóa đáp án vì câu chưa có phản hồi.' : 'Câu đang mở hoặc đã có phản hồi: chỉ sửa nội dung và nhãn đáp án.'}</span>
                          {canEditQuestionStructure ? (
                            <button className="btn btn-ghost btn-small" type="button" onClick={() => addEditQuestionOption(question)}><Plus size={14} /> Thêm đáp án</button>
                          ) : null}
                        </div>
                        {editQuestionOptions.map((option, index) => (
                          <div className="vevents-draft-option-row" key={option.id}>
                            <span>{index + 1}</span>
                            <textarea rows={2} value={option.label} onChange={(event) => updateEditQuestionOption(option.id, event.target.value)} />
                            {canEditQuestionStructure ? (
                              <button className="btn btn-ghost btn-small" type="button" onClick={() => removeEditQuestionOption(question, option.id)} disabled={editQuestionOptions.length <= 1}><Trash2 size={14} /> Xóa</button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="vdiscussion-card-list">
                    {questionStats.map((item) => (
                      <div className="vdiscussion-work-card" key={`${question.id}-${item.optionId}`}>
                        <div className="vdiscussion-card-head">
                          <h3>{item.label}</h3>
                          <strong>{item.count}</strong>
                        </div>
                        <div className="vdiscussion-monitor-meter"><span style={{ width: `${Math.min(100, item.percent)}%` }} /></div>
                        <p>{item.percent}%</p>
                      </div>
                    ))}
                  </div>
                  <div className="vdiscussion-row-actions">
                    {isEditingQuestion ? (
                      <>
                        <button className="btn btn-primary btn-small" onClick={() => void saveEditQuestion(question)} disabled={busy}>Lưu</button>
                        <button className="btn btn-ghost btn-small" onClick={cancelEditQuestion} disabled={busy}>Hủy</button>
                      </>
                    ) : (
                      <button className="btn btn-ghost btn-small" onClick={() => startEditQuestion(question)} disabled={busy}><Pencil size={15} /> Sửa</button>
                    )}
                    <button className="btn btn-primary btn-small" onClick={() => void openQuestion(question)} disabled={busy}><PlayCircle size={15} /> Mở</button>
                    <button className="btn btn-ghost btn-small" onClick={() => void closeQuestion(question)} disabled={busy || question.status !== 'open'}><PauseCircle size={15} /> Đóng</button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </>
    );
  }

  function renderLinksPanel() {
    if (!activeEvent) {
      return <Card title="Link public"><div className="vdiscussion-empty">Chọn một event để lấy link, mã QR và mã tham gia.</div></Card>;
    }
    return (
      <Card title="Link public">
        <SectionHeader eye="Share" title="Link, QR và mã tham gia" subtitle="Dùng cho học viên ẩn danh; presenter vẫn điều khiển câu nào đang mở." />
        <div className="vdiscussion-monitor-presentation-layout">
          <div className="vdiscussion-monitor-presentation-main">
            <div className="vdiscussion-step-hero">
              <span>Mã tham gia</span>
              <h2>{activeEvent.code}</h2>
              <p>{joinLink}</p>
            </div>
            <div className="vdiscussion-row-actions">
              <button className="btn btn-primary" type="button" onClick={() => void copyJoinLink()}><Copy size={16} /> Copy link</button>
              <a className="btn btn-ghost" href={joinLink} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Mở trang học viên</a>
            </div>
            <div className="vdiscussion-step-hero vevents-present-link-card">
              <span>Present kết quả live</span>
              <h2>Màn trình chiếu kết quả</h2>
              <p>{presentLink}</p>
            </div>
            <div className="vdiscussion-row-actions">
              <button className="btn btn-primary" type="button" onClick={() => void copyPresentLink()}><Copy size={16} /> Copy present link</button>
              <a className="btn btn-ghost" href={presentLink} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Mở present</a>
            </div>
          </div>
          <aside className="vdiscussion-monitor-side">
            <section>
              <h3>QR</h3>
              <div style={{ display: 'grid', placeItems: 'center', padding: 12, background: '#fff', borderRadius: 8 }}>
                <QRCodeSVG value={joinLink} size={180} />
              </div>
            </section>
          </aside>
        </div>
      </Card>
    );
  }

  function renderMainPanel() {
    if (panel === 'create') return renderCreatePanel();
    if (panel === 'results') return renderResultsPanel();
    if (panel === 'links') return renderLinksPanel();
    return renderEventsPanel();
  }

  return (
    <div className="vdiscussion-page">
      <header className="vdiscussion-head">
        <div>
          <span className="section-eyebrow">V-events</span>
          <h1>Live interaction theo triết lý Mentimeter</h1>
          <p>Ẩn danh mặc định, tham gia bằng mã QR/link/code, presenter điều khiển từng câu và kết quả aggregate realtime/polling.</p>
        </div>
        <div className="vdiscussion-row-actions">
          <a className="btn btn-ghost" href="/dashboard">Workspace</a>
          <button className="btn btn-ghost" type="button" onClick={() => navigate('/v-events')}><ListChecks size={16} /> Danh sách</button>
          <a className="btn btn-primary" href="/v-events/join" target="_blank" rel="noreferrer"><ExternalLink size={16} /> Mở trang join</a>
        </div>
      </header>

      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <div className="vsurvey-module-layout vevents-module-layout">
        {renderLayerNav()}
        <section className="vsurvey-module-main vevents-module-main">
          <div className="vsurvey-brand-panel vevents-brand-panel">
            <div className="vsurvey-brand-lockup">
              <div>
                <strong>{panel === 'events' ? 'Danh sách event' : panel === 'create' ? 'Tạo event mới' : panel === 'results' ? 'Xem kết quả' : 'Link public'}</strong>
                <span>{eventPanelSubtitle(panel, events, activeEvent)}</span>
              </div>
            </div>
            <div className="vsurvey-brand-actions">
              <button className="btn btn-ghost btn-small" type="button" onClick={() => navigate('/v-events/create')}><Plus size={15} /> Tạo event</button>
              {activeEvent ? <button className="btn btn-ghost btn-small" type="button" onClick={() => navigate(`/v-events/${activeEvent.id}/links`)}><Link2 size={15} /> Lấy link</button> : null}
            </div>
          </div>
          {renderMainPanel()}
        </section>
      </div>
    </div>
  );
}
