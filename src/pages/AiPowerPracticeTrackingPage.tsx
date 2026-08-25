import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Paperclip,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import {
  buildStudentSurveyShareLink,
  deleteStudentSurveySubmission,
  getDefaultStudentSurveyDisplaySettings,
  listStudentSurveyForms,
  listStudentSurveySubmissions,
  type StudentSurveyForm,
  type StudentSurveySubmission,
} from '@/lib/studentSurvey';
import { supabase } from '@/lib/supabaseClient';
import {
  AI_POWER_PRACTICE_LOCAL_FORM_ID,
  buildAiPowerPracticeLocalForm,
  buildAiPowerPracticeLocalSubmissions,
  isAiPowerPracticeLocalForm,
} from '@/modules/surveys/aiPowerPracticeLocalDemo';
import {
  buildAiPowerPracticeSessions,
  getAiPowerPracticeSessionStatus,
  type AiPowerPracticeAttachment,
  type AiPowerPracticeSession,
} from '@/modules/surveys/aiPowerPracticeTracking';

const TRACKING_ROUTE = '/v-survey/ql01a-ai-dien-luc-4-ung-dung/tracking';
const MANAGE_ROUTE = '/v-survey/ql01a-ai-dien-luc-4-ung-dung';
const AUTO_REFRESH_MS = 15_000;

type TrackingStatusFilter = 'all' | 'entered' | 'active' | 'completed';

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function formatFileSize(value: number) {
  if (!value) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusCopy(session: AiPowerPracticeSession) {
  const status = getAiPowerPracticeSessionStatus(session);
  if (status === 'completed') return { label: session.completedApplications >= 4 ? 'Hoàn thành toàn bộ' : `Hoàn thành ${session.completedApplications} tình huống`, tone: 'success' };
  if (status === 'active') return { label: 'Đang thực hành', tone: 'active' };
  return { label: 'Mới vào bài', tone: 'neutral' };
}

function getLocalShareLink() {
  return `${window.location.origin}/suni/vtraining/practice/ai-dien-luc-4-ung-dung.html`;
}

export function AiPowerPracticeTrackingPage() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState<StudentSurveyForm | null>(null);
  const [submissions, setSubmissions] = useState<StudentSurveySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [keyword, setKeyword] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<TrackingStatusFilter>('all');
  const [deletingSessionId, setDeletingSessionId] = useState('');

  const loadTracking = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setErrorMessage('');
    try {
      const forms = await listStudentSurveyForms();
      const persistedForm = forms.find((item) => item.id === AI_POWER_PRACTICE_LOCAL_FORM_ID) || null;
      const nextForm = persistedForm || (import.meta.env.DEV
        ? buildAiPowerPracticeLocalForm(getDefaultStudentSurveyDisplaySettings('ql01a-ai-dien-luc-4-ung-dung'))
        : null);
      setForm(nextForm);
      if (!nextForm) {
        setSubmissions([]);
        setErrorMessage('Chưa có form QL01A AI Điện lực trên hệ thống. Hãy tạo form tại trang quản lý VSurvey trước.');
        return;
      }
      const rows = isAiPowerPracticeLocalForm(nextForm)
        ? buildAiPowerPracticeLocalSubmissions()
        : await listStudentSurveySubmissions(nextForm.id);
      setSubmissions(rows);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      if (import.meta.env.DEV) {
        const localForm = buildAiPowerPracticeLocalForm(getDefaultStudentSurveyDisplaySettings('ql01a-ai-dien-luc-4-ung-dung'));
        setForm(localForm);
        setSubmissions(buildAiPowerPracticeLocalSubmissions());
        setLastUpdatedAt(new Date().toISOString());
        setErrorMessage('');
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Không tải được dữ liệu tiến độ.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadTracking();
  }, [loadTracking]);

  useEffect(() => {
    if (!form || isAiPowerPracticeLocalForm(form) || sessionId) return;
    const intervalId = window.setInterval(() => void loadTracking(true), AUTO_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [form, loadTracking, sessionId]);

  const sessions = useMemo(() => buildAiPowerPracticeSessions(submissions), [submissions]);
  const classes = useMemo(() => [...new Set(sessions.map((session) => session.className))].sort((left, right) => left.localeCompare(right, 'vi')), [sessions]);
  const filteredSessions = useMemo(() => {
    const search = keyword.trim().toLowerCase();
    return sessions.filter((session) => {
      if (classFilter !== 'all' && session.className !== classFilter) return false;
      if (statusFilter !== 'all' && getAiPowerPracticeSessionStatus(session) !== statusFilter) return false;
      if (!search) return true;
      return [session.groupName, session.className, session.sessionId, session.latestStatus].some((value) => value.toLowerCase().includes(search));
    });
  }, [classFilter, keyword, sessions, statusFilter]);
  const selectedSession = sessions.find((session) => session.sessionId === sessionId) || null;
  const requestedApplicationIndex = Number(searchParams.get('application') || 0);
  const latestApplicationIndex = selectedSession
    ? [...selectedSession.events].reverse().find((event) => event.applicationIndex > 0)?.applicationIndex || 1
    : 1;
  const selectedApplicationIndex = Number.isInteger(requestedApplicationIndex) && requestedApplicationIndex >= 1 && requestedApplicationIndex <= 4
    ? requestedApplicationIndex
    : latestApplicationIndex;
  const enteredOnly = sessions.filter((session) => getAiPowerPracticeSessionStatus(session) === 'entered').length;
  const activeCount = sessions.filter((session) => getAiPowerPracticeSessionStatus(session) === 'active').length;
  const completedCount = sessions.filter((session) => getAiPowerPracticeSessionStatus(session) === 'completed').length;
  const totalCheckpoints = sessions.reduce((sum, session) => sum + session.checkpointCount, 0);
  const shareLink = form ? (isAiPowerPracticeLocalForm(form) ? getLocalShareLink() : buildStudentSurveyShareLink(form.id)) : '#';

  async function deleteSessionResponses(session: AiPowerPracticeSession) {
    if (deletingSessionId) return;
    const eventIds = [...new Set(session.events.map((event) => event.id).filter(Boolean))];
    if (!eventIds.length) return;
    const ok = window.confirm(`Xóa toàn bộ ${eventIds.length} phản hồi/checkpoint của ${session.groupName}? Thao tác này không hoàn tác trên dữ liệu khảo sát.`);
    if (!ok) return;
    setDeletingSessionId(session.sessionId);
    setErrorMessage('');
    try {
      if (!form || isAiPowerPracticeLocalForm(form)) {
        setSubmissions((rows) => rows.filter((submission) => !eventIds.includes(submission.id)));
      } else {
        for (const submissionId of eventIds) {
          await deleteStudentSurveySubmission(submissionId);
        }
        setSubmissions((rows) => rows.filter((submission) => !eventIds.includes(submission.id)));
      }
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không xóa được phản hồi.');
    } finally {
      setDeletingSessionId('');
    }
  }

  if (sessionId) {
    return (
      <div className="ai-tracking-page">
        <div className="ai-tracking-page-head">
          <Link className="btn btn-ghost btn-small" to={TRACKING_ROUTE}><ArrowLeft size={15} /> Quay lại tổng quan</Link>
          <div>
            <span className="ai-tracking-eyebrow">VSurvey · Chi tiết phiếu nhóm</span>
            <h1>{selectedSession?.groupName || 'Không tìm thấy nhóm'}</h1>
            <p>{selectedSession ? `${selectedSession.className} · ${selectedSession.latestStatus}` : 'Phiếu nhóm không tồn tại hoặc chưa được tải.'}</p>
          </div>
        </div>
        {loading ? <div className="ai-tracking-empty">Đang tải chi tiết phiếu...</div> : null}
        {!loading && !selectedSession ? <div className="notice danger">Không tìm thấy phiếu nhóm cần xem.</div> : null}
        {selectedSession ? (
          <TrackingSessionDetail
            session={selectedSession}
            selectedApplicationIndex={selectedApplicationIndex}
            onSelectApplication={(applicationIndex) => {
              const next = new URLSearchParams(searchParams);
              next.set('application', String(applicationIndex));
              setSearchParams(next, { replace: true });
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="ai-tracking-page">
      <div className="ai-tracking-page-head">
        <Link className="btn btn-ghost btn-small" to={MANAGE_ROUTE}><ArrowLeft size={15} /> Quản lý phiếu</Link>
        <div>
          <span className="ai-tracking-eyebrow">SPC · QL01A · VSurvey</span>
          <h1>Theo dõi tiến độ thực hành AI</h1>
          <p>Quét nhanh nhóm nào đã vào bài, đang ở bước nào và mở nội dung Prompt/phản ánh khi cần.</p>
        </div>
        <div className="ai-tracking-head-actions">
          <span>{lastUpdatedAt ? `Cập nhật ${formatTimestamp(lastUpdatedAt)}` : 'Chưa cập nhật'}</span>
          <button className="btn btn-ghost btn-small" type="button" onClick={() => void loadTracking(true)} disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? 'is-spinning' : ''} /> {refreshing ? 'Đang tải' : 'Làm mới'}
          </button>
          <a className="btn btn-primary btn-small" href={shareLink} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Form học viên</a>
        </div>
      </div>

      {form && isAiPowerPracticeLocalForm(form) ? (
        <div className="notice warning ai-tracking-demo-notice"><strong>Chế độ demo LAN</strong><span>Dữ liệu bên dưới là dữ liệu mẫu cục bộ, không ghi Supabase.</span></div>
      ) : null}
      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

      <section className="ai-tracking-kpis" aria-label="Tổng quan tiến độ">
        <article><span className="is-blue"><Users size={18} /></span><div><small>Nhóm đã vào bài</small><strong>{sessions.length}</strong><em>{enteredOnly} nhóm mới vào</em></div></article>
        <article><span className="is-violet"><Clock3 size={18} /></span><div><small>Đang thực hành</small><strong>{activeCount}</strong><em>Có ít nhất 1 checkpoint</em></div></article>
        <article><span className="is-green"><CheckCircle2 size={18} /></span><div><small>Đã hoàn thành</small><strong>{completedCount}</strong><em>Ít nhất 1 tình huống</em></div></article>
        <article><span className="is-amber"><BarChart3 size={18} /></span><div><small>Checkpoint đã lưu</small><strong>{totalCheckpoints}</strong><em>Trên {sessions.length * 16 || 0} checkpoint</em></div></article>
      </section>

      <section className="ai-tracking-panel">
        <div className="ai-tracking-panel-head">
          <div><h2>Toàn cảnh tiến độ các nhóm</h2><p>Mỗi thanh thể hiện 4 bước của một tình huống thực hành.</p></div>
          <strong>{filteredSessions.length}/{sessions.length} nhóm</strong>
        </div>
        <div className="ai-tracking-toolbar">
          <label className="ai-tracking-search"><Search size={16} /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm nhóm, lớp hoặc trạng thái..." /></label>
          <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} aria-label="Lọc theo lớp">
            <option value="all">Tất cả lớp</option>
            {classes.map((className) => <option value={className} key={className}>{className}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TrackingStatusFilter)} aria-label="Lọc theo tiến độ">
            <option value="all">Tất cả trạng thái</option>
            <option value="entered">Mới vào bài</option>
            <option value="active">Đang thực hành</option>
            <option value="completed">Đã hoàn thành</option>
          </select>
        </div>
        {loading ? <div className="ai-tracking-empty">Đang tải tiến độ nhóm...</div> : null}
        {!loading && !filteredSessions.length ? <div className="ai-tracking-empty">Không có nhóm phù hợp bộ lọc.</div> : null}
        <div className="ai-tracking-list">
          {filteredSessions.map((session) => (
            <TrackingSessionRow
              session={session}
              key={session.sessionId}
              deleting={deletingSessionId === session.sessionId}
              onDelete={() => void deleteSessionResponses(session)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function TrackingSessionRow({ session, deleting, onDelete }: { session: AiPowerPracticeSession; deleting: boolean; onDelete: () => void }) {
  const status = getStatusCopy(session);
  return (
    <article className="ai-tracking-row">
      <div className="ai-tracking-group">
        <div><strong>{session.groupName}</strong><span>{session.className}</span></div>
        <span className={`ai-tracking-status is-${status.tone}`}>{status.label}</span>
        <small>Cập nhật {formatTimestamp(session.updatedAt)}</small>
      </div>
      <div className="ai-tracking-applications">
        {session.applications.map((application) => (
          <div className="ai-tracking-application" key={application.applicationIndex} title={application.applicationTitle}>
            <div><span>Ứng dụng {application.applicationIndex}</span><strong>{application.stepIndex}/4</strong></div>
            <div className="ai-tracking-meter" aria-label={`Ứng dụng ${application.applicationIndex}: ${application.stepIndex}/4 bước`}>
              <span style={{ width: `${application.stepIndex * 25}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="ai-tracking-overall">
        <div><span>Tổng tiến độ</span><strong>{session.completionPercent}%</strong></div>
        <div className="ai-tracking-meter is-overall"><span style={{ width: `${session.completionPercent}%` }} /></div>
        <small>{session.checkpointCount}/16 checkpoint · {session.completedApplications} tình huống hoàn thành</small>
      </div>
      <div className="ai-tracking-row-actions">
        <Link className="btn btn-primary btn-small ai-tracking-detail-link" to={`${TRACKING_ROUTE}/${encodeURIComponent(session.sessionId)}`} aria-label={`Xem chi tiết ${session.groupName}`}>
          <FileText size={15} /> Chi tiết
        </Link>
        <button
          className="ai-tracking-delete-btn"
          type="button"
          onClick={onDelete}
          disabled={deleting}
          title={`Xóa phản hồi của ${session.groupName}`}
          aria-label={`Xóa phản hồi của ${session.groupName}`}
        >
          {deleting ? <RefreshCw size={15} className="is-spinning" /> : <Trash2 size={15} />}
        </button>
      </div>
    </article>
  );
}

function TrackingSessionDetail({
  session,
  selectedApplicationIndex,
  onSelectApplication,
}: {
  session: AiPowerPracticeSession;
  selectedApplicationIndex: number;
  onSelectApplication: (applicationIndex: number) => void;
}) {
  const status = getStatusCopy(session);
  const selectedApplication = session.applications.find((application) => application.applicationIndex === selectedApplicationIndex) || session.applications[0];
  const applicationEvents = session.events.filter((event) => event.applicationIndex === selectedApplication.applicationIndex);
  return (
    <div className="ai-tracking-detail-layout">
      <section className="ai-tracking-detail-summary">
        <div><span>Nhóm</span><strong>{session.groupName}</strong></div>
        <div><span>Lớp</span><strong>{session.className}</strong></div>
        <div><span>Trạng thái</span><strong>{status.label}</strong></div>
        <div><span>Tổng tiến độ</span><strong>{session.checkpointCount}/16 checkpoint</strong></div>
      </section>
      <section className="ai-tracking-detail-app-picker" aria-label="Chọn ứng dụng cần xem">
        {session.applications.map((application) => (
          <button
            className={application.applicationIndex === selectedApplication.applicationIndex ? 'is-active' : ''}
            key={application.applicationIndex}
            type="button"
            onClick={() => onSelectApplication(application.applicationIndex)}
            aria-pressed={application.applicationIndex === selectedApplication.applicationIndex}
          >
            <span><small>Ứng dụng {application.applicationIndex}</small><strong>{application.stepIndex}/4 bước</strong></span>
            <b>{application.applicationTitle}</b>
            <span className="ai-tracking-meter"><i style={{ width: `${application.stepIndex * 25}%` }} /></span>
            <em>{application.attachment ? 'Có file' : application.prompt ? 'Có Prompt' : 'Chưa nhập nội dung'}</em>
          </button>
        ))}
      </section>
      <article className="ai-tracking-selected-app">
        <header>
          <div><span>Ứng dụng {selectedApplication.applicationIndex}</span><h2>{selectedApplication.applicationTitle}</h2></div>
          <strong>{selectedApplication.stepIndex}/4 bước</strong>
        </header>
        <div className="ai-tracking-meter is-overall"><span style={{ width: `${selectedApplication.stepIndex * 25}%` }} /></div>
        <div className="ai-tracking-detail-content">
          <section><span>Prompt nhóm nhập</span><p>{selectedApplication.prompt || 'Chưa nhập Prompt.'}</p></section>
          <section><span>Phản ánh cuối bài</span><p>{selectedApplication.finalNote || 'Chưa có nội dung phản ánh cuối bài.'}</p></section>
          <section><span>File kết quả thực hành</span>{selectedApplication.attachment ? <PracticeAttachmentButton attachment={selectedApplication.attachment} /> : <p>Nhóm chưa gửi file.</p>}</section>
        </div>
      </article>
      <section className="ai-tracking-timeline">
        <div className="ai-tracking-panel-head"><div><h2>Nhật ký ứng dụng {selectedApplication.applicationIndex}</h2><p>{applicationEvents.length} checkpoint được ghi nhận theo thời gian.</p></div></div>
        {!applicationEvents.length ? <div className="ai-tracking-empty">Ứng dụng này chưa có checkpoint.</div> : null}
        {[...applicationEvents].reverse().map((event) => (
          <article key={event.id}><span>Bước {event.stepIndex}</span><div><strong>{event.stepLabel}</strong><small>{event.applicationTitle}</small></div><time>{formatTimestamp(event.submittedAt)}</time></article>
        ))}
      </section>
    </div>
  );
}

function PracticeAttachmentButton({ attachment }: { attachment: AiPowerPracticeAttachment }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');

  async function openAttachment() {
    if (opening) return;
    setOpening(true);
    setError('');
    try {
      const sessionResult = await supabase?.auth.getSession();
      const token = sessionResult?.data.session?.access_token || '';
      if (!token) throw new Error('Vui lòng đăng nhập lại để mở file.');
      const response = await fetch('/api/student-survey-attachment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'signed_download_url',
          formId: AI_POWER_PRACTICE_LOCAL_FORM_ID,
          bucket: attachment.bucket,
          path: attachment.path,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) throw new Error(payload?.error || 'Chưa mở được file.');
      window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Chưa mở được file.');
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="ai-tracking-attachment">
      <button className="btn btn-ghost btn-small" type="button" onClick={() => void openAttachment()} disabled={opening}>
        <Paperclip size={15} /> {opening ? 'Đang mở...' : attachment.name}
      </button>
      <small>{formatFileSize(attachment.size)}{attachment.type ? ` · ${attachment.type}` : ''}</small>
      {error ? <em>{error}</em> : null}
    </div>
  );
}
