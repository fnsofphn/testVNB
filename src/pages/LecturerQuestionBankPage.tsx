import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, Kpi, SectionHeader } from '@/components/ui/Primitives';
import {
  buildAssessmentShareLink,
  createAssessmentForm,
  downloadTextFile,
  exportSubmissionsToCsv,
  getQuestionSetBundle,
  listAssessmentForms,
  listAssessmentSubmissions,
  listQuestionSets,
  sanitizeAssessmentFormId,
  updateAssessmentFormStatus,
  type LecturerAssessmentForm,
  type LecturerAssessmentQuestion,
  type LecturerAssessmentSection,
  type LecturerAssessmentSubmission,
  type LecturerQuestionSet,
  type LecturerQuestionSetBundle,
} from '@/lib/lecturerAssessment';
import { formatLecturerAssessmentAnswer, type LecturerAnswerValue } from '@/lib/lecturerAssessmentForm';

type QuestionSetPreviewMap = Record<string, LecturerQuestionSetBundle>;

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString('vi-VN');
}

function previewAnswer(value: LecturerAnswerValue) {
  const clean = formatLecturerAssessmentAnswer(value).replace(/\s+/g, ' ').trim();
  if (!clean) return 'Chưa trả lời';
  return clean.length > 120 ? `${clean.slice(0, 120)}...` : clean;
}

export function LecturerQuestionBankPage() {
  const [forms, setForms] = useState<LecturerAssessmentForm[]>([]);
  const [questionSets, setQuestionSets] = useState<LecturerQuestionSet[]>([]);
  const [setBundles, setSetBundles] = useState<QuestionSetPreviewMap>({});
  const [activeFormId, setActiveFormId] = useState('');
  const [submissions, setSubmissions] = useState<LecturerAssessmentSubmission[]>([]);
  const [formTitle, setFormTitle] = useState('Đánh giá giảng viên EVNSPC');
  const [formCode, setFormCode] = useState('');
  const [intro, setIntro] = useState('');
  const [selectedQuestionSetId, setSelectedQuestionSetId] = useState('');
  const [previewSetId, setPreviewSetId] = useState('');
  const [copyState, setCopyState] = useState('');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const activeForm = forms.find((item) => item.id === activeFormId) || forms[0] || null;
  const activeQuestionSet =
    questionSets.find((item) => item.id === (activeForm?.questionSetId || selectedQuestionSetId)) || questionSets[0] || null;
  const previewBundle = previewSetId ? setBundles[previewSetId] : null;
  const activeBundle = activeQuestionSet ? setBundles[activeQuestionSet.id] : null;
  const selectedSubmission = submissions.find((item) => item.id === selectedSubmissionId) || submissions[0] || null;
  const shareLink = activeForm ? buildAssessmentShareLink(activeForm.id) : '';
  const currentQuestions = activeBundle?.questions || [];

  const totalQuestionCount = useMemo(
    () => questionSets.reduce((sum, item) => sum + item.questionCount, 0),
    [questionSets],
  );

  useEffect(() => {
    void loadBootData();
  }, []);

  useEffect(() => {
    if (!activeForm) return;
    setFormTitle(activeForm.title);
    setFormCode(activeForm.id);
    setIntro(activeForm.intro);
    setSelectedQuestionSetId(activeForm.questionSetId);
    void ensureBundle(activeForm.questionSetId);
    void loadSubmissions(activeForm.id);
  }, [activeFormId, forms]);

  useEffect(() => {
    if (!previewSetId && questionSets[0]) {
      setPreviewSetId(questionSets[0].id);
    }
  }, [previewSetId, questionSets]);

  async function loadBootData(preferredFormId?: string) {
    setLoading(true);
    setErrorMessage('');
    try {
      const [nextForms, nextQuestionSets] = await Promise.all([listAssessmentForms(), listQuestionSets()]);
      setForms(nextForms);
      setQuestionSets(nextQuestionSets);

      const nextActiveFormId = preferredFormId || activeFormId || nextForms[0]?.id || '';
      const nextSelectedQuestionSetId = nextForms.find((item) => item.id === nextActiveFormId)?.questionSetId || nextQuestionSets[0]?.id || '';
      const nextPreviewSetId = previewSetId || nextSelectedQuestionSetId || nextQuestionSets[0]?.id || '';

      setActiveFormId(nextActiveFormId);
      setSelectedQuestionSetId(nextSelectedQuestionSetId);
      setPreviewSetId(nextPreviewSetId);

      const bundleIds = new Set(
        [nextSelectedQuestionSetId, nextPreviewSetId, nextForms[0]?.questionSetId]
          .map((value) => String(value || ''))
          .filter(Boolean),
      );
      await Promise.all(Array.from(bundleIds).map((id) => ensureBundle(id)));

      if (!nextForms.length) {
        setSubmissions([]);
        setSelectedSubmissionId('');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được dữ liệu thư viện bộ câu hỏi.');
    } finally {
      setLoading(false);
    }
  }

  async function ensureBundle(questionSetId: string) {
    if (!questionSetId || setBundles[questionSetId]) return;
    const bundle = await getQuestionSetBundle(questionSetId);
    setSetBundles((current) => ({
      ...current,
      [questionSetId]: bundle,
    }));
  }

  async function loadSubmissions(formId: string) {
    setBusy(true);
    setErrorMessage('');
    try {
      const nextSubmissions = await listAssessmentSubmissions(formId);
      setSubmissions(nextSubmissions);
      setSelectedSubmissionId(nextSubmissions[0]?.id || '');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được danh sách bài nộp.');
      setSubmissions([]);
      setSelectedSubmissionId('');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateForm() {
    setBusy(true);
    setErrorMessage('');
    try {
      const nextForm = await createAssessmentForm({
        id: formCode,
        title: formTitle,
        intro,
        questionSetId: selectedQuestionSetId || questionSets[0]?.id,
      });
      await ensureBundle(nextForm.questionSetId);
      await loadBootData(nextForm.id);
      setCopyState('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được link mới.');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleFormStatus(form: LecturerAssessmentForm) {
    setBusy(true);
    setErrorMessage('');
    try {
      await updateAssessmentFormStatus(form.id, form.status === 'active' ? 'paused' : 'active');
      await loadBootData(form.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không cập nhật được trạng thái link.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRefreshSubmissions() {
    if (!activeForm) return;
    await loadSubmissions(activeForm.id);
  }

  async function handleCopyLink() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopyState('Đã copy link');
      window.setTimeout(() => setCopyState(''), 1800);
    } catch {
      setCopyState('Không copy được, hãy copy thủ công');
    }
  }

  function handleSelectPreview(questionSetId: string) {
    setPreviewSetId(questionSetId);
    void ensureBundle(questionSetId);
  }

  return (
    <>
      <SectionHeader eye="Hệ thống" title="Thư viện bộ câu hỏi giảng viên" subtitle="Quản lý bộ câu hỏi, tạo link khảo sát và theo dõi bài nộp." />

      <section className="lecturer-bank-shell">
        <div className="kpi-row">
          <Kpi label="Bộ câu hỏi" value={String(questionSets.length)} sub="Trong thư viện" tone="warning" />
          <Kpi label="Tổng câu hỏi" value={String(totalQuestionCount)} sub="Trên tất cả bộ đang có" tone="danger" />
          <Kpi label="Link đang bật" value={String(forms.filter((item) => item.status === 'active').length)} sub="Có thể gửi giảng viên" tone="success" />
          <Kpi label="Bài đã nộp" value={String(submissions.length)} sub={activeForm ? `Cho link ${activeForm.id}` : 'Chưa chọn link'} tone="violet" />
        </div>

        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

        <div className="lecturer-bank-management-grid">
          <Card title="Tạo link mới">
            <div className="stack compact">
              <label className="lecturer-bank-inline-field">
                <span>Tiêu đề</span>
                <input value={formTitle} onChange={(event) => setFormTitle(event.target.value)} />
              </label>

              <label className="lecturer-bank-inline-field">
                <span>Mã link</span>
                <input
                  value={formCode}
                  onChange={(event) => setFormCode(sanitizeAssessmentFormId(event.target.value))}
                  placeholder="Ví dụ: vnpt01"
                />
              </label>

              <label className="lecturer-bank-inline-field">
                <span>Bộ câu hỏi</span>
                <select
                  value={selectedQuestionSetId}
                  onChange={(event) => {
                    setSelectedQuestionSetId(event.target.value);
                    void ensureBundle(event.target.value);
                  }}
                >
                  {questionSets.map((set) => (
                    <option value={set.id} key={set.id}>
                      {set.name} · {set.questionCount} câu
                    </option>
                  ))}
                </select>
              </label>

              <div className="action-row">
                <button className="btn btn-primary" onClick={() => void handleCreateForm()} disabled={busy || !selectedQuestionSetId}>
                  {busy ? 'Đang xử lý...' : 'Tạo link'}
                </button>
              </div>
            </div>
          </Card>

          <Card title="Link đang chọn">
            <div className="lecturer-bank-share-box">
              <div className="lecturer-bank-share-url">{shareLink || 'Chưa có link'}</div>
              <div className="action-row">
                <button className="btn btn-primary" onClick={() => void handleCopyLink()} disabled={!shareLink}>
                  Copy link
                </button>
                <a className="btn btn-ghost" href={shareLink || '#'} target="_blank" rel="noreferrer">
                  Mở form public
                </a>
                <button className="btn btn-ghost" onClick={() => void handleRefreshSubmissions()} disabled={!activeForm || busy}>
                  Làm mới bài nộp
                </button>
              </div>
              {activeForm ? (
                <div className="muted-text">
                  {activeForm.id} · {activeForm.status === 'active' ? 'Đang bật' : 'Đang tắt'} · {activeQuestionSet?.name || 'Chưa có bộ câu hỏi'}
                </div>
              ) : null}
              {copyState ? <div className="muted-text">{copyState}</div> : null}
            </div>
          </Card>
        </div>

        <div className="lecturer-bank-content-grid">
          <div className="lecturer-bank-main">
            <Card title="Thư viện bộ câu hỏi">
              {loading ? (
                <div className="muted-text">Đang tải...</div>
              ) : questionSets.length ? (
                <div className="lecturer-bank-submission-list">
                  {questionSets.map((set) => (
                    <div className={`lecturer-bank-submission-item${previewSetId === set.id ? ' active' : ''}`} key={set.id}>
                      <button onClick={() => handleSelectPreview(set.id)}>
                        <div className="list-title">{set.name}</div>
                        <div className="muted-text">
                          {set.code} · {set.sectionCount} phần · {set.questionCount} câu
                        </div>
                      </button>
                      <div className="stack compact right">
                        <Badge tone={set.status === 'active' ? 'success' : 'warning'}>
                          {set.status === 'active' ? 'Đang dùng' : 'Nháp'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted-text">Chưa có bộ câu hỏi nào.</div>
              )}
            </Card>

            <Card title="Danh sách link">
              {loading ? (
                <div className="muted-text">Đang tải...</div>
              ) : forms.length ? (
                <div className="lecturer-bank-submission-list">
                  {forms.map((form) => {
                    const set = questionSets.find((item) => item.id === form.questionSetId);
                    return (
                      <div className={`lecturer-bank-submission-item${activeForm?.id === form.id ? ' active' : ''}`} key={form.id}>
                        <button onClick={() => setActiveFormId(form.id)}>
                          <div className="list-title">{form.title}</div>
                          <div className="muted-text">
                            {form.id} · {set?.name || 'Bộ 1'}
                          </div>
                        </button>
                        <div className="stack compact right">
                          <Badge tone={form.status === 'active' ? 'success' : 'warning'}>
                            {form.status === 'active' ? 'Đang bật' : 'Đang tắt'}
                          </Badge>
                          <button className="btn btn-ghost btn-small" onClick={() => void handleToggleFormStatus(form)} disabled={busy}>
                            {form.status === 'active' ? 'Tắt' : 'Bật'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="muted-text">Chưa có link nào.</div>
              )}
            </Card>

            <Card title="Danh sách bài nộp">
              {loading ? (
                <div className="muted-text">Đang tải dữ liệu...</div>
              ) : submissions.length ? (
                <div className="lecturer-bank-submission-list">
                  {submissions.map((item) => (
                    <button
                      key={item.id}
                      className={`lecturer-bank-submission-item${selectedSubmission?.id === item.id ? ' active' : ''}`}
                      onClick={() => setSelectedSubmissionId(item.id)}
                    >
                      <div>
                        <div className="list-title">{item.lecturerName || 'Chưa có tên'}</div>
                        <div className="muted-text">{item.email || 'Không có email'}</div>
                      </div>
                      <div className="stack compact right">
                        <Badge tone="success">Đã nộp</Badge>
                        <span className="muted-text">{formatTimestamp(item.submittedAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="muted-text">Chưa có bài nộp nào.</div>
              )}
            </Card>
          </div>

          <aside className="lecturer-bank-side">
            <Card title="Xem trước bộ câu hỏi">
              {previewBundle ? (
                <div className="lecturer-bank-result-panel">
                  <div className="lecturer-bank-result-meta">
                    <strong>{previewBundle.set.name}</strong>
                    <span>{previewBundle.set.description}</span>
                    <span>
                      {previewBundle.sections.length} phần · {previewBundle.questions.length} câu
                    </span>
                  </div>

                  <div className="lecturer-bank-results-table">
                    <div className="lecturer-bank-results-header">
                      <span>Câu</span>
                      <span>Tiêu đề</span>
                      <span>Phần</span>
                    </div>
                    {previewBundle.questions.map((question) => {
                      const section = previewBundle.sections.find((item) => item.id === question.sectionId);
                      return (
                        <div className="lecturer-bank-results-row" key={question.id}>
                          <strong>{question.code}</strong>
                          <span>{question.title}</span>
                          <span>{section?.title || section?.code || ''}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="muted-text">Chưa có dữ liệu để xem trước.</div>
              )}
            </Card>

            <Card title="Import bộ câu hỏi">
              <div className="stack compact">
                <div className="muted-text">Chưa bật import file ở bản này. Mình đã chừa sẵn cấu trúc thư viện để thêm bước import sau.</div>
                <button className="btn btn-ghost" disabled>
                  Sắp có import file
                </button>
              </div>
            </Card>

            <Card title="Tải kết quả">
              <div className="action-row">
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    activeForm &&
                    downloadTextFile(
                      `${activeForm.id}-submissions.csv`,
                      exportSubmissionsToCsv(submissions, currentQuestions),
                      'text/csv;charset=utf-8',
                    )
                  }
                  disabled={!submissions.length || !activeForm}
                >
                  Tải CSV
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() =>
                    activeForm &&
                    downloadTextFile(`${activeForm.id}-submissions.json`, JSON.stringify(submissions, null, 2), 'application/json;charset=utf-8')
                  }
                  disabled={!submissions.length || !activeForm}
                >
                  Tải JSON
                </button>
              </div>
            </Card>

            <Card title="Kết quả đang chọn">
              {selectedSubmission ? (
                <div className="lecturer-bank-result-panel">
                  <div className="lecturer-bank-result-meta">
                    <strong>{selectedSubmission.lecturerName}</strong>
                    <span>{selectedSubmission.email}</span>
                    <span>{selectedSubmission.phone}</span>
                    <span>{selectedSubmission.yearsTeaching || 'Chưa khai báo'} năm kinh nghiệm</span>
                    <span>Nộp lúc {formatTimestamp(selectedSubmission.submittedAt)}</span>
                  </div>

                  <div className="lecturer-bank-results-table">
                    <div className="lecturer-bank-results-header">
                      <span>Câu</span>
                      <span>Tiêu đề</span>
                      <span>Trả lời</span>
                    </div>
                    {currentQuestions.map((question) => (
                      <div className="lecturer-bank-results-row" key={question.id}>
                        <strong>{question.code}</strong>
                        <span>{question.title}</span>
                        <span>{previewAnswer(selectedSubmission.answers[question.code])}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="muted-text">Chưa có bài nộp để xem.</div>
              )}
            </Card>
          </aside>
        </div>
      </section>
    </>
  );
}
