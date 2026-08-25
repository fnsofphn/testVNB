import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BarChart3, CheckCircle2, ChevronLeft, ChevronRight, Radio, Send } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  buildVEventPresentInviteModel,
  getVEventPresentLayout,
  getOrCreateAnonymousVEventParticipantKey,
  getVEvent,
  getPublicVEventByCode,
  listVEventStats,
  sanitizeVEventCode,
  submitVEventResponse,
  switchVEventQuestion,
  touchPublicVEventParticipant,
  type VEvent,
  type VEventPublicBundle,
  type VEventQuestion,
  type VEventQuestionStats,
} from '@/lib/vEvents';
import { getRuntimePollMs, shouldUseRuntimePolling, shouldUseRuntimeRealtime } from '@/lib/runtimeLoadMode';

const V_EVENT_PRESENT_PALETTE = ['#1d4ed8', '#2563eb', '#0284c7', '#0ea5e9', '#06b6d4', '#38bdf8', '#60a5fa', '#3b82f6'];

function getPresentOptionColor(index: number) {
  return V_EVENT_PRESENT_PALETTE[index % V_EVENT_PRESENT_PALETTE.length];
}

function JoinCard({ code, setCode, onJoin }: { code: string; setCode: (value: string) => void; onJoin: () => void }) {
  return (
    <div className="vdiscussion-vote-loading">
      <Radio size={36} />
      <h2>V-events</h2>
      <p>Nhập mã tham gia trên màn hình giảng viên hoặc quét QR để vào thẳng câu hỏi.</p>
      <div className="vdiscussion-inline-form is-compact">
        <input value={code} onChange={(event) => setCode(sanitizeVEventCode(event.target.value))} placeholder="Ví dụ: HCMC26" />
        <button className="btn btn-primary" onClick={onJoin} disabled={!code.trim()}>Tham gia</button>
      </div>
    </div>
  );
}

function getQuestionStats(stats: VEventQuestionStats[], questionId?: string | null) {
  return stats.filter((item) => item.questionId === questionId);
}

function getQuestionVoteCount(stats: VEventQuestionStats[], questionId?: string | null) {
  return getQuestionStats(stats, questionId).reduce((sum, item) => sum + item.count, 0);
}

export function PublicVEventPresentPage() {
  const { eventId = '' } = useParams();
  const [event, setEvent] = useState<VEvent | null>(null);
  const [questions, setQuestions] = useState<VEventQuestion[]>([]);
  const [stats, setStats] = useState<VEventQuestionStats[]>([]);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [switching, setSwitching] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const pollMs = getRuntimePollMs('events', 3000);
  const useRealtime = shouldUseRuntimeRealtime('events');
  const usePolling = shouldUseRuntimePolling('events');

  const activeQuestion = questions.find((question) => question.id === event?.activeQuestionId) || questions.find((question) => question.status === 'open') || questions[0] || null;
  const activeQuestionIndex = activeQuestion ? questions.findIndex((question) => question.id === activeQuestion.id) : -1;
  const activeStats = getQuestionStats(stats, activeQuestion?.id);
  const responseCount = getQuestionVoteCount(stats, activeQuestion?.id);
  const canMovePrevious = questions.length > 1 && activeQuestionIndex > 0;
  const canMoveNext = questions.length > 1 && activeQuestionIndex >= 0 && activeQuestionIndex < questions.length - 1;
  const inviteModel = useMemo(() => buildVEventPresentInviteModel(event), [event]);
  const presentLayout = activeQuestion ? getVEventPresentLayout(activeQuestion.questionNumber) : 'cards';
  const maxResultCount = Math.max(1, ...activeStats.map((item) => item.count));

  const loadStats = useCallback(async () => {
    if (!eventId) return;
    try {
      setStats(await listVEventStats(eventId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được kết quả V-event.');
    }
  }, [eventId]);

  const loadPresent = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!eventId) return;
    if (!options.silent) setLoading(true);
    setErrorMessage('');
    try {
      const [bundle, nextStats] = await Promise.all([
        getVEvent(eventId),
        listVEventStats(eventId).catch(() => [] as VEventQuestionStats[]),
      ]);
      if (!bundle) {
        setEvent(null);
        setQuestions([]);
        setStats([]);
        setErrorMessage('Không tìm thấy V-event để trình chiếu.');
        return;
      }
      setEvent(bundle.event);
      setQuestions(bundle.questions);
      setStats(nextStats);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được màn present V-event.');
    } finally {
      if (!options.silent) setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadPresent();
  }, [loadPresent]);

  useEffect(() => {
    if (!eventId || !usePolling) return undefined;
    const timer = window.setInterval(() => {
      void loadPresent({ silent: true });
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [eventId, loadPresent, pollMs, usePolling]);

  useEffect(() => {
    let presentRefreshTimer: number | undefined;
    let statsRefreshTimer: number | undefined;
    let channel: any = null;
    let client: any = null;
    let cancelled = false;
    if (!eventId || !useRealtime) return undefined;
    const schedulePresentRefresh = () => {
      if (presentRefreshTimer) window.clearTimeout(presentRefreshTimer);
      presentRefreshTimer = window.setTimeout(() => {
        void loadPresent({ silent: true });
      }, 120);
    };
    const scheduleStatsRefresh = () => {
      if (statsRefreshTimer) window.clearTimeout(statsRefreshTimer);
      statsRefreshTimer = window.setTimeout(() => {
        void loadStats();
      }, 650);
    };
    void import('@/lib/supabaseClient').then((module) => {
      if (cancelled || !module.supabase) return;
      client = module.supabase;
      channel = client
        .channel(`vevent-present:${eventId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_live_events', filter: `id=eq.${eventId}` }, schedulePresentRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_live_event_questions', filter: `event_id=eq.${eventId}` }, schedulePresentRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_live_event_responses', filter: `event_id=eq.${eventId}` }, scheduleStatsRefresh)
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (presentRefreshTimer) window.clearTimeout(presentRefreshTimer);
      if (statsRefreshTimer) window.clearTimeout(statsRefreshTimer);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [eventId, loadPresent, loadStats, useRealtime]);

  useEffect(() => {
    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === 'ArrowLeft') {
        keyboardEvent.preventDefault();
        void movePresentQuestion(-1);
      }
      if (keyboardEvent.key === 'ArrowRight') {
        keyboardEvent.preventDefault();
        void movePresentQuestion(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeQuestionIndex, event, questions, switching]);

  async function movePresentQuestion(direction: -1 | 1) {
    if (!event || !questions.length || switching) return;
    const currentIndex = activeQuestionIndex >= 0 ? activeQuestionIndex : 0;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= questions.length) return;
    const nextQuestion = questions[nextIndex];
    setSwitching(true);
    setErrorMessage('');
    try {
      const nextBundle = await switchVEventQuestion(event.id, nextQuestion.id);
      setEvent(nextBundle.event);
      setQuestions(nextBundle.questions);
      void loadStats();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không chuyển được câu hỏi. Hãy kiểm tra quyền presenter.');
    } finally {
      setSwitching(false);
    }
  }

  function resultStyle(item: VEventQuestionStats, index: number): CSSProperties {
    const scaledPercent = Math.max(item.percent, item.count ? Math.round((item.count / maxResultCount) * 100) : 0);
    return {
      '--vevent-option-color': getPresentOptionColor(index),
      '--vevent-result-width': `${Math.min(100, scaledPercent)}%`,
    } as CSSProperties;
  }

  function renderPresentResults() {
    if (presentLayout === 'donut') {
      return (
        <div className="vevent-present-donut-board">
          <div className="vevent-present-donut-visual" aria-hidden="true">
            <span />
          </div>
          <div className="vevent-present-donut-legend">
            {activeStats.map((item, index) => (
              <article className="vevent-present-donut-row" key={`${item.questionId}-${item.optionId}`} style={resultStyle(item, index)}>
                <i />
                <strong>{item.label}</strong>
                <b>{item.count}</b>
              </article>
            ))}
          </div>
          {!activeStats.length ? <div className="vevent-present-empty is-card">Chưa có phản hồi cho câu hỏi này.</div> : null}
        </div>
      );
    }

    return (
      <div className={`vevent-present-results vevent-present-results--${presentLayout}`}>
        {activeStats.map((item, index) => (
          <article className="vevent-present-result" key={`${item.questionId}-${item.optionId}`} style={resultStyle(item, index)}>
            <div>
              <strong>{item.label}</strong>
              <b>{item.count}</b>
            </div>
            <div className="vevent-present-meter">
              <span />
            </div>
            <em>{item.percent}%</em>
          </article>
        ))}
        {presentLayout === 'scale' ? (
          <div className="vevent-present-scale-labels">
            <span>Strongly disagree</span>
            <span>Strongly agree</span>
          </div>
        ) : null}
        {!activeStats.length ? <div className="vevent-present-empty is-card">Chưa có phản hồi cho câu hỏi này.</div> : null}
      </div>
    );
  }

  return (
    <main className={`vevent-present-shell vevent-present-shell--${presentLayout}`}>
      <header className="vevent-present-topbar">
        <div>
          <span>V-events live results</span>
          <strong>{event?.title || 'Tổng hợp phản hồi'}</strong>
        </div>
        <div>
          <small>Mã tham gia</small>
          <strong>{event?.code || '-'}</strong>
        </div>
      </header>

      {loading && !event ? (
        <section className="vevent-present-stage vevent-present-stage--cards vevent-present-stage--loading" aria-busy="true">
          <div className="vevent-present-question is-loading">
            <span className="vevent-present-skeleton-line is-eyebrow" />
            <h1>
              <span className="vevent-present-skeleton-line is-title" />
              <span className="vevent-present-skeleton-line is-title is-short" />
            </h1>
            <div className="vevent-present-controls is-loading">
              <span className="vevent-present-skeleton-pill" />
              <strong>...</strong>
              <span className="vevent-present-skeleton-pill" />
            </div>
          </div>
          <div className="vevent-present-results vevent-present-results--cards">
            {[0, 1, 2, 3].map((item) => (
              <article className="vevent-present-result is-loading" key={item}>
                <div>
                  <strong><span className="vevent-present-skeleton-line" /></strong>
                  <b><span className="vevent-present-skeleton-dot" /></b>
                </div>
                <div className="vevent-present-meter" />
                <em><span className="vevent-present-skeleton-line is-percent" /></em>
              </article>
            ))}
          </div>
          <aside className="vevent-present-invite-card is-loading" aria-label="QR tham gia V-events">
            <div className="vevent-present-qr-frame">
              <span className="vevent-present-qr-placeholder" />
            </div>
            <div className="vevent-present-invite-copy">
              <span>v-events/join</span>
              <strong>...</strong>
              <small>Đang tải mã tham gia</small>
            </div>
          </aside>
        </section>
      ) : null}

      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

      {!loading && event && !activeQuestion ? (
        <section className="vevent-present-empty">
          <BarChart3 size={38} />
          <h1>Chưa có câu hỏi để trình chiếu</h1>
          <p>Mở một câu hỏi trong màn quản trị để kết quả cập nhật tại đây.</p>
        </section>
      ) : null}

      {event && activeQuestion ? (
        <section className={`vevent-present-stage vevent-present-stage--${presentLayout}`}>
          <div className="vevent-present-question">
            <span>Câu {activeQuestion.questionNumber} · {activeQuestion.status === 'open' ? 'đang mở' : 'đã đóng'} · {responseCount} phản hồi</span>
            <h1>{activeQuestion.title}</h1>
            <div className="vevent-present-controls" aria-label="Chuyển câu hỏi đang trình chiếu">
              <button type="button" onClick={() => void movePresentQuestion(-1)} disabled={!canMovePrevious || switching}>
                <ChevronLeft size={22} />
                <span>Câu trước</span>
              </button>
              <strong>Câu {activeQuestionIndex + 1} / {questions.length}</strong>
              <button type="button" onClick={() => void movePresentQuestion(1)} disabled={!canMoveNext || switching}>
                <span>Câu sau</span>
                <ChevronRight size={22} />
              </button>
            </div>
          </div>
          {renderPresentResults()}
          <aside className="vevent-present-invite-card" aria-label="QR tham gia V-events">
            <div className="vevent-present-qr-frame">
              {inviteModel.qrValue ? <QRCodeSVG value={inviteModel.qrValue} size={188} level="M" marginSize={2} /> : null}
            </div>
            <div className="vevent-present-invite-copy">
              <span>{inviteModel.shortUrlLabel}</span>
              <strong>{inviteModel.code}</strong>
              <small>Quét QR hoặc nhập mã để tham gia</small>
            </div>
          </aside>
        </section>
      ) : null}
    </main>
  );
}

export function PublicVEventPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(sanitizeVEventCode(params.code || ''));
  const [bundle, setBundle] = useState<VEventPublicBundle | null>(null);
  const [participantKey, setParticipantKey] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
  const [loading, setLoading] = useState(Boolean(params.code));
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const activeQuestion = bundle?.activeQuestion || null;
  const existingResponse = bundle?.response || null;
  const canAnswer = Boolean(bundle?.event.status === 'active' && bundle.event.participationEnabled && activeQuestion?.status === 'open');
  const selectedOrSaved = selectedOption || existingResponse?.optionId || '';

  const eventCode = useMemo(() => sanitizeVEventCode(params.code || code), [code, params.code]);
  const pollMs = getRuntimePollMs('events', 3000);
  const useRealtime = shouldUseRuntimeRealtime('events');
  const usePolling = shouldUseRuntimePolling('events');

  async function loadEvent(targetCode = eventCode, options: { silent?: boolean; touchParticipant?: boolean } = {}) {
    const cleanCode = sanitizeVEventCode(targetCode);
    if (!cleanCode) return;
    if (!options.silent) setLoading(true);
    setErrorMessage('');
    try {
      const nextParticipantKey = participantKey || getOrCreateAnonymousVEventParticipantKey(cleanCode);
      setParticipantKey(nextParticipantKey);
      const nextBundle = await getPublicVEventByCode(cleanCode, nextParticipantKey, {
        touchParticipant: options.touchParticipant !== false,
      });
      const currentQuestionId = bundle?.activeQuestion?.id || '';
      const nextQuestionId = nextBundle?.activeQuestion?.id || '';
      setBundle(nextBundle);
      if (currentQuestionId !== nextQuestionId) setSelectedOption('');
      if (!nextBundle) setErrorMessage('Mã V-event không tồn tại hoặc chưa được mở.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được V-event.');
    } finally {
      if (!options.silent) setLoading(false);
    }
  }

  function queueParticipantHeartbeat(targetCode = eventCode, targetParticipantKey = participantKey) {
    const cleanCode = sanitizeVEventCode(targetCode);
    const cleanParticipantKey = targetParticipantKey.trim();
    if (!cleanCode || !cleanParticipantKey) return;
    window.setTimeout(() => {
      void touchPublicVEventParticipant(cleanCode, cleanParticipantKey).catch(() => undefined);
    }, 0);
  }

  useEffect(() => {
    if (!params.code) return;
    const cleanCode = sanitizeVEventCode(params.code);
    const nextParticipantKey = participantKey || getOrCreateAnonymousVEventParticipantKey(cleanCode);
    setCode(cleanCode);
    setParticipantKey(nextParticipantKey);
    void loadEvent(cleanCode, { touchParticipant: false }).then(() => {
      queueParticipantHeartbeat(cleanCode, nextParticipantKey);
    });
  }, [params.code]);

  useEffect(() => {
    if (!eventCode || !bundle || !usePolling) return undefined;
    const timer = window.setInterval(() => {
      void loadEvent(eventCode, { silent: true, touchParticipant: false });
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [bundle, eventCode, participantKey, pollMs, usePolling]);

  useEffect(() => {
    const currentEventId = bundle?.event.id;
    let refreshTimer: number | undefined;
    let channel: any = null;
    let client: any = null;
    let cancelled = false;
    if (!currentEventId || !eventCode || !useRealtime) return undefined;
    const scheduleRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void loadEvent(eventCode, { silent: true, touchParticipant: false });
      }, 120);
    };
    void import('@/lib/supabaseClient').then((module) => {
      if (cancelled || !module.supabase) return;
      client = module.supabase;
      channel = client
        .channel(`vevent-public:${currentEventId}:${participantKey || 'viewer'}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_live_events', filter: `id=eq.${currentEventId}` }, scheduleRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_live_event_questions', filter: `event_id=eq.${currentEventId}` }, scheduleRefresh)
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [bundle?.event.id, eventCode, participantKey, useRealtime]);

  function joinByCode() {
    const cleanCode = sanitizeVEventCode(code);
    if (!cleanCode) return;
    navigate(`/v-events/join/${cleanCode}`);
  }

  async function submitAnswer() {
    if (!activeQuestion || !selectedOrSaved || !eventCode) return;
    setSubmitting(true);
    setErrorMessage('');
    try {
      const nextParticipantKey = participantKey || getOrCreateAnonymousVEventParticipantKey(eventCode);
      setParticipantKey(nextParticipantKey);
      const nextResponse = await submitVEventResponse({
        code: eventCode,
        questionId: activeQuestion.id,
        participantKey: nextParticipantKey,
        optionId: selectedOrSaved,
      });
      setBundle((currentBundle) => currentBundle ? { ...currentBundle, response: nextResponse } : currentBundle);
      setNotice('Đã ghi nhận câu trả lời.');
      queueParticipantHeartbeat(eventCode, nextParticipantKey);
      void loadEvent(eventCode, { silent: true, touchParticipant: false });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không gửi được câu trả lời.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!params.code) {
    return (
      <main className="vdiscussion-student-shell vevent-public-shell">
        <div className="vdiscussion-student-content">
          <JoinCard code={code} setCode={setCode} onJoin={joinByCode} />
        </div>
      </main>
    );
  }

  return (
    <main className="vdiscussion-student-shell vevent-public-shell">
      <header className="vdiscussion-student-topbar">
        <div className="vdiscussion-student-brand">
          <span>VE</span>
          <div>
            <small>V-events</small>
            <strong>{bundle?.event.title || 'Live interaction'}</strong>
          </div>
        </div>
        <div className="vdiscussion-student-account">
          <span>{eventCode}</span>
          <div>
            <small>Mã tham gia</small>
          </div>
        </div>
      </header>

      <div className="vdiscussion-student-content vevent-public-content">
        {loading && !bundle ? (
          <div className="vdiscussion-vote-loading">
            <Radio size={34} />
            <h2>Đang tải câu hỏi...</h2>
          </div>
        ) : null}

        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
        {notice ? <div className="notice success">{notice}</div> : null}

        {!loading && bundle && !activeQuestion ? (
          <section className="vdiscussion-vote-loading">
            <CheckCircle2 size={36} />
            <h2>Chờ giảng viên mở câu hỏi</h2>
            <p>Khi presenter chuyển slide, màn hình này sẽ tự cập nhật.</p>
          </section>
        ) : null}

        {!loading && bundle && activeQuestion ? (
          <section className="vdiscussion-vote-grid vevent-answer-layout">
            <div className="vdiscussion-vote-hero vevent-question-card">
              <span>{activeQuestion.status === 'open' ? 'Đang mở bình chọn' : 'Câu hỏi đã đóng'}</span>
              <h1>{activeQuestion.title}</h1>
              <p>
                {existingResponse
                  ? canAnswer
                    ? 'Bạn đã gửi câu trả lời. Có thể đổi đáp án khi câu hỏi còn mở.'
                    : 'Bạn đã gửi câu trả lời. Câu hỏi hiện đã đóng.'
                  : 'Chọn một phương án rồi bấm gửi.'}
              </p>
            </div>
            <div className="vdiscussion-flow vevent-answer-card">
              <div className="vdiscussion-option-list vevent-option-list">
                {activeQuestion.options.map((option) => {
                  const selected = selectedOrSaved === option.id;
                  return (
                    <button
                      className={`vdiscussion-leader-candidate ${selected ? 'is-selected' : ''}`}
                      key={option.id}
                      type="button"
                      disabled={!canAnswer || submitting}
                      onClick={() => setSelectedOption(option.id)}
                    >
                      <strong>{option.label}</strong>
                      {existingResponse?.optionId === option.id ? <small>Đã gửi</small> : null}
                    </button>
                  );
                })}
              </div>
              <div className="vdiscussion-step4-actions">
                <button className="btn btn-primary" disabled={!canAnswer || !selectedOrSaved || submitting} onClick={() => void submitAnswer()}>
                  <Send size={16} /> {submitting ? 'Đang gửi...' : existingResponse ? 'Cập nhật đáp án' : 'Gửi câu trả lời'}
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
