import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Card, Kpi, SectionHeader } from '@/components/ui/Primitives';
import { useToast } from '@/components/system/ToastProvider';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildQuizShareLink,
  createQuizForm,
  createQuizQuestionSet,
  downloadArrayBuffer,
  downloadTextFile,
  exportQuizSubmissionsToCsv,
  exportQuizSubmissionsToWorkbook,
  extractTextFromDocx,
  getPublicQuizFormBundle,
  getQuizFormBundle,
  getQuizQuestionSetBundle,
  listMyElearningQuizSubmissions,
  listQuizForms,
  listMyQuizSubmissions,
  listQuizQuestionSets,
  listQuizSubmissions,
  parseQuizTextToQuestions,
  sanitizeQuizId,
  saveElearningQuizSubmission,
  saveQuizSubmission,
  scoreQuizAnswers,
  startPublicQuizAttempt,
  startVTrainingQuizAttempt,
  submitPublicQuizAttempt,
  submitVTrainingQuizAttempt,
  updateQuizFormStatus,
  type QuizForm,
  type QuizQuestion,
  type QuizQuestionSet,
  type QuizQuestionSetBundle,
  type QuizSubmission,
  type PublicQuizAttempt,
  type VTrainingQuizAttempt,
} from '@/lib/quiz';
import { queries as trainingQueries } from '@/features/vtraining';
import { createSubmitActionGuard } from '@/lib/submitActionGuard';
import { shouldAutoSubmitTimedActivity } from '@/features/vtraining/domain/reflectionActivity';
import { formatQuizOptionText } from '@/features/quiz/quizOptionText';

type BundleMap = Record<string, QuizQuestionSetBundle>;

function formatTime(value: string) {
  return new Date(value).toLocaleString('vi-VN');
}

function safeFileName(value: string) {
  return sanitizeQuizId(value) || 'quiz-results';
}

function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatQuizScore(score: number | null | undefined, total: number | null | undefined) {
  if (score == null || total == null) return 'Đã nộp';
  return `${score}/${total}`;
}

function formatQuizCorrectSub(score: { correct?: number; questionTotal?: number; score: number | null; total: number | null }) {
  if (score.correct == null || score.questionTotal == null) return '';
  return `${score.correct}/${score.questionTotal} câu đúng`;
}

function useQuizAdminData() {
  const [forms, setForms] = useState<QuizForm[]>([]);
  const [sets, setSets] = useState<QuizQuestionSet[]>([]);
  const [bundles, setBundles] = useState<BundleMap>({});
  const [activeFormId, setActiveFormId] = useState('');
  const [submissions, setSubmissions] = useState<QuizSubmission[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const activeForm = forms.find((item) => item.id === activeFormId) || forms[0] || null;
  const activeBundle = activeForm ? bundles[activeForm.questionSetId] : null;
  const selectedSubmission = submissions.find((item) => item.id === selectedSubmissionId) || submissions[0] || null;

  async function ensureBundle(questionSetId: string) {
    if (!questionSetId || bundles[questionSetId]) return;
    const bundle = await getQuizQuestionSetBundle(questionSetId);
    setBundles((current) => ({ ...current, [questionSetId]: bundle }));
  }

  async function loadData(preferredFormId?: string) {
    setLoading(true);
    setErrorMessage('');
    try {
      const [nextSets, nextForms] = await Promise.all([listQuizQuestionSets(), listQuizForms()]);
      setSets(nextSets);
      setForms(nextForms);
      const nextActiveFormId = preferredFormId || activeFormId || nextForms[0]?.id || '';
      setActiveFormId(nextActiveFormId);
      const bundleIds = new Set([nextSets[0]?.id, nextForms.find((form) => form.id === nextActiveFormId)?.questionSetId].filter(Boolean));
      await Promise.all(Array.from(bundleIds).map((id) => ensureBundle(String(id))));
      if (nextActiveFormId) await loadSubmissions(nextActiveFormId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được dữ liệu trắc nghiệm.');
    } finally {
      setLoading(false);
    }
  }

  async function loadSubmissions(formId: string) {
    setBusy(true);
    setErrorMessage('');
    try {
      const rows = await listQuizSubmissions(formId);
      setSubmissions(rows);
      setSelectedSubmissionId(rows[0]?.id || '');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được kết quả bài kiểm tra.');
      setSubmissions([]);
      setSelectedSubmissionId('');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!activeForm) return;
    void ensureBundle(activeForm.questionSetId);
    void loadSubmissions(activeForm.id);
  }, [activeFormId]);

  return {
    forms,
    sets,
    bundles,
    activeForm,
    activeBundle,
    submissions,
    selectedSubmission,
    loading,
    busy,
    errorMessage,
    setActiveFormId,
    setSelectedSubmissionId,
    setErrorMessage,
    loadData,
    loadSubmissions,
    ensureBundle,
  };
}

export function QuizTestLibraryPage() {
  const data = useQuizAdminData();
  const activeQuestions = data.activeBundle?.questions || [];
  const shareLink = data.activeForm ? buildQuizShareLink(data.activeForm.id) : '';
  const averageScore = useMemo(() => {
    const scored = data.submissions
      .map((item) => scoreQuizAnswers(activeQuestions, item.answers))
      .filter((item) => item.score !== null && item.total);
    if (!scored.length) return '-';
    const average = scored.reduce((sum, item) => sum + Number(item.score || 0), 0) / scored.length;
    return average.toFixed(1);
  }, [data.submissions, activeQuestions]);

  async function toggleStatus(form: QuizForm) {
    try {
      await updateQuizFormStatus(form.id, form.status === 'active' ? 'paused' : 'active');
      await data.loadData(form.id);
    } catch (error) {
      data.setErrorMessage(error instanceof Error ? error.message : 'Không cập nhật được trạng thái bài kiểm tra.');
    }
  }

  return (
    <>
      <SectionHeader eye="Trắc nghiệm" title="Thư viện bài kiểm tra" actions={<a className="btn btn-primary" href="/quiz-create-test">Khởi tạo bài kiểm tra</a>} />

      <section className="lecturer-bank-shell">
        <div className="kpi-row">
          <Kpi label="Bài kiểm tra" value={String(data.forms.length)} sub="Link đã tạo" tone="warning" />
          <Kpi label="Bài nộp" value={String(data.submissions.length)} sub={data.activeForm?.id || 'Chưa chọn bài'} tone="violet" />
          <Kpi label="Điểm TB" value={averageScore} sub="Thang 10 theo bài đang chọn" tone="success" />
          <Kpi label="Kho câu hỏi" value={String(data.sets.length)} sub="Bộ đang có" tone="neutral" />
        </div>

        {data.errorMessage ? <div className="notice danger">{data.errorMessage}</div> : null}

        <div className="lecturer-bank-content-grid">
          <div className="lecturer-bank-main">
            <Card title="Danh sách bài kiểm tra">
              {data.loading ? (
                <div className="muted-text">Đang tải...</div>
              ) : data.forms.length ? (
                <div className="lecturer-bank-submission-list">
                  {data.forms.map((form) => {
                    const set = data.sets.find((item) => item.id === form.questionSetId);
                    return (
                      <div className={`lecturer-bank-submission-item${data.activeForm?.id === form.id ? ' active' : ''}`} key={form.id}>
                        <button onClick={() => data.setActiveFormId(form.id)}>
                          <div className="list-title">{form.title}</div>
                          <div className="muted-text">
                            {form.id} · {set?.name || form.questionSetId} · {form.questionCount} câu · {form.durationMinutes} phút
                          </div>
                        </button>
                        <div className="stack compact right">
                          <Badge tone={form.status === 'active' ? 'success' : 'warning'}>{form.status === 'active' ? 'Đang bật' : 'Đang tắt'}</Badge>
                          <button className="btn btn-ghost btn-small" onClick={() => void toggleStatus(form)}>
                            {form.status === 'active' ? 'Tắt' : 'Bật'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="muted-text">Chưa có bài kiểm tra nào.</div>
              )}
            </Card>

            <Card title="Kết quả học viên">
              <div className="action-row">
                <button className="btn btn-ghost" onClick={() => data.activeForm && void data.loadSubmissions(data.activeForm.id)} disabled={!data.activeForm || data.busy}>
                  Làm mới
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!data.activeForm || !data.submissions.length}
                  onClick={() =>
                    data.activeForm &&
                    downloadTextFile(`${safeFileName(data.activeForm.id)}-results.csv`, exportQuizSubmissionsToCsv(data.submissions, activeQuestions), 'text/csv;charset=utf-8')
                  }
                >
                  Tải CSV
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={!data.activeForm || !data.submissions.length}
                  onClick={() => {
                    if (!data.activeForm) return;
                    const exportFilename = `${safeFileName(data.activeForm.id)}-results.xlsx`;
                    void exportQuizSubmissionsToWorkbook(data.submissions, activeQuestions).then((content) => {
                      downloadArrayBuffer(
                        exportFilename,
                        content,
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                      );
                    });
                  }}
                >
                  Tải Excel
                </button>
              </div>

              {data.submissions.length ? (
                <div className="lecturer-bank-submission-list">
                  {data.submissions.map((item) => (
                    (() => {
                      const computed = scoreQuizAnswers(activeQuestions, item.answers);
                      const scoreLabel = formatQuizScore(computed.score, computed.total);
                      return (
                    <button
                      key={item.id}
                      className={`lecturer-bank-submission-item${data.selectedSubmission?.id === item.id ? ' active' : ''}`}
                      onClick={() => data.setSelectedSubmissionId(item.id)}
                    >
                      <div>
                        <div className="list-title">{item.respondentName || 'Chưa có tên'}</div>
                        <div className="muted-text">{item.email || 'Không có email'} · {item.className || 'Chưa có lớp'}</div>
                      </div>
                      <div className="stack compact right">
                        <Badge tone="success">{scoreLabel}</Badge>
                        <span className="muted-text">{formatTime(item.submittedAt)}</span>
                      </div>
                    </button>
                      );
                    })()
                  ))}
                </div>
              ) : (
                <div className="muted-text">Chưa có học viên nộp bài.</div>
              )}
            </Card>
          </div>

          <aside className="lecturer-bank-side">
            <Card title="Link bài kiểm tra">
              <div className="lecturer-bank-share-box">
                <div className="lecturer-bank-share-url">{shareLink || 'Chưa có link'}</div>
                <div className="action-row">
                  <button className="btn btn-primary" disabled={!shareLink} onClick={() => void navigator.clipboard.writeText(shareLink)}>
                    Copy link
                  </button>
                  <a className="btn btn-ghost" href={shareLink || '#'} target="_blank" rel="noreferrer">
                    Mở link
                  </a>
                </div>
              </div>
            </Card>

            <Card title="Chi tiết bài nộp">
              {data.selectedSubmission ? (
                <div className="lecturer-bank-result-panel">
                  <div className="lecturer-bank-result-meta">
                    {(() => {
                      const computed = scoreQuizAnswers(activeQuestions, data.selectedSubmission.answers);
                      return (
                        <>
                    <strong>{data.selectedSubmission.respondentName}</strong>
                    <span>{data.selectedSubmission.email}</span>
                    <span>{computed.score === null ? 'Chưa có đáp án đúng để chấm điểm' : `Điểm: ${formatQuizScore(computed.score, computed.total)}${formatQuizCorrectSub(computed) ? ` · ${formatQuizCorrectSub(computed)}` : ''}`}</span>
                        </>
                      );
                    })()}
                  </div>
                  <div className="lecturer-bank-results-table">
                    <div className="lecturer-bank-results-header">
                      <span>Câu</span>
                      <span>Chọn</span>
                      <span>Đáp án đúng</span>
                    </div>
                    {activeQuestions.map((question) => {
                      const selectedAnswer = data.selectedSubmission?.answers[question.id] || '';
                      const isCorrect = Boolean(question.correctOptionId && selectedAnswer === question.correctOptionId);
                      const isWrong = Boolean(question.correctOptionId && selectedAnswer && selectedAnswer !== question.correctOptionId);
                      return (
                      <div className={`lecturer-bank-results-row${isCorrect ? ' is-correct' : ''}${isWrong ? ' is-wrong' : ''}`} key={question.id}>
                        <strong>{question.code}</strong>
                        <span>{selectedAnswer || '-'}</span>
                        <span>{question.correctOptionId || '-'}</span>
                      </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="muted-text">Chọn một bài nộp để xem chi tiết.</div>
              )}
            </Card>
          </aside>
        </div>
      </section>
    </>
  );
}

export function QuizQuestionLibraryPage() {
  const [sets, setSets] = useState<QuizQuestionSet[]>([]);
  const [bundles, setBundles] = useState<BundleMap>({});
  const [selectedSetId, setSelectedSetId] = useState('');
  const [name, setName] = useState('SPC QT26 E - Quiz cuối khóa');
  const [description, setDescription] = useState('');
  const [rawText, setRawText] = useState('');
  const [answerKey, setAnswerKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const previewQuestions = useMemo(() => parseQuizTextToQuestions(rawText, answerKey), [rawText, answerKey]);
  const activeBundle = selectedSetId ? bundles[selectedSetId] : null;

  async function loadData(preferredSetId?: string) {
    setBusy(true);
    setErrorMessage('');
    try {
      const nextSets = await listQuizQuestionSets();
      setSets(nextSets);
      const nextSelected = preferredSetId || selectedSetId || nextSets[0]?.id || '';
      setSelectedSetId(nextSelected);
      if (nextSelected) await ensureBundle(nextSelected);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được thư viện câu hỏi.');
    } finally {
      setBusy(false);
    }
  }

  async function ensureBundle(questionSetId: string) {
    if (!questionSetId || bundles[questionSetId]) return;
    const bundle = await getQuizQuestionSetBundle(questionSetId);
    setBundles((current) => ({ ...current, [questionSetId]: bundle }));
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleFileChange(file: File | null) {
    if (!file) return;
    setErrorMessage('');
    try {
      const text = file.name.toLowerCase().endsWith('.docx') ? await extractTextFromDocx(file) : await file.text();
      setRawText(text);
      if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ''));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không đọc được file câu hỏi.');
    }
  }

  async function handleImport() {
    if (!previewQuestions.length) {
      setErrorMessage('Chưa nhận diện được câu hỏi. Cần format dạng "Câu 1: ... A. ... B. ... C. ... D. ...".');
      return;
    }
    const missingAnswerCount = previewQuestions.filter((question) => !question.correctOptionId).length;
    if (missingAnswerCount) {
      setErrorMessage(`Chưa nhận diện đáp án đúng cho ${missingAnswerCount}/${previewQuestions.length} câu. Hãy kiểm tra file Word hoặc dán key vào ô "Đáp án đúng nếu có", ví dụ: 1:B, 2:C, 3:A.`);
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const bundle = await createQuizQuestionSet({ id: name, name, description, questions: previewQuestions });
      setBundles((current) => ({ ...current, [bundle.set.id]: bundle }));
      await loadData(bundle.set.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không import được bộ câu hỏi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionHeader eye="Trắc nghiệm" title="Thư viện câu hỏi kiểm tra" actions={<a className="btn btn-primary" href="/quiz-create-test">Tạo bài kiểm tra</a>} />

      <section className="lecturer-bank-shell">
        <div className="kpi-row">
          <Kpi label="Bộ câu hỏi" value={String(sets.length)} sub="Trong thư viện" tone="warning" />
          <Kpi label="Câu đang xem" value={String(activeBundle?.questions.length || 0)} sub="Theo bộ đã chọn" tone="violet" />
          <Kpi label="Câu nhận diện" value={String(previewQuestions.length)} sub="Từ nội dung import" tone="success" />
          <Kpi label="Có đáp án" value={String((activeBundle?.questions || previewQuestions).filter((item) => item.correctOptionId).length)} sub="Trong bộ đang xem" tone="neutral" />
        </div>

        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

        <div className="lecturer-bank-content-grid">
          <div className="lecturer-bank-main">
            <Card title="Import bộ câu hỏi">
              <div className="form-grid">
                <label>
                  <span>Tên bộ câu hỏi</span>
                  <input value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label>
                  <span>File Word / TXT</span>
                  <input type="file" accept=".docx,.txt" onChange={(event) => void handleFileChange(event.target.files?.[0] || null)} />
                </label>
                <label className="full">
                  <span>Mô tả</span>
                  <input value={description} onChange={(event) => setDescription(event.target.value)} />
                </label>
                <label className="full">
                  <span>Đáp án đúng nếu có</span>
                  <input value={answerKey} onChange={(event) => setAnswerKey(event.target.value)} placeholder="Ví dụ: 1:B, 2:B, 3:C" />
                </label>
                <label className="full">
                  <span>Nội dung câu hỏi</span>
                  <textarea rows={10} value={rawText} onChange={(event) => setRawText(event.target.value)} />
                </label>
              </div>
              <div className="action-row">
                <button className="btn btn-primary" onClick={() => void handleImport()} disabled={busy || !previewQuestions.length}>
                  Import vào thư viện
                </button>
              </div>
            </Card>

            <Card title="Danh sách bộ câu hỏi">
              <div className="lecturer-bank-submission-list">
                {sets.map((set) => (
                  <button
                    className={`lecturer-bank-submission-item${selectedSetId === set.id ? ' active' : ''}`}
                    key={set.id}
                    onClick={() => {
                      setSelectedSetId(set.id);
                      void ensureBundle(set.id);
                    }}
                  >
                    <div>
                      <div className="list-title">{set.name}</div>
                      <div className="muted-text">{set.id} · {set.questionCount} câu</div>
                    </div>
                    <Badge tone={set.status === 'active' ? 'success' : 'warning'}>{set.status === 'active' ? 'Đang dùng' : 'Nháp'}</Badge>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <aside className="lecturer-bank-side">
            <Card title="Xem trước câu hỏi">
              {(activeBundle?.questions || previewQuestions).length ? (
                <div className="lecturer-bank-question-stack">
                  {(activeBundle?.questions || previewQuestions).slice(0, 30).map((question) => (
                    <article className="lecturer-bank-question" key={question.id}>
                      <div className="lecturer-bank-question-head">
                        <div>
                          <div className="lecturer-bank-question-code">Câu {question.code}</div>
                          <h4>{question.prompt}</h4>
                        </div>
                        {question.correctOptionId ? <Badge tone="success">{question.correctOptionId}</Badge> : null}
                      </div>
                      <div className="stack compact">
                        {question.options.map((option) => (
                          <div className="bullet-item" key={option.id}>
                            <strong>{option.id}.</strong> {formatQuizOptionText(option.text, option.id)}
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="muted-text">Chưa có câu hỏi để xem trước.</div>
              )}
            </Card>
          </aside>
        </div>
      </section>
    </>
  );
}

export function QuizCreateTestPage() {
  const [sets, setSets] = useState<QuizQuestionSet[]>([]);
  const [title, setTitle] = useState('Quiz cuối khóa');
  const [formCode, setFormCode] = useState('');
  const [intro, setIntro] = useState('');
  const [questionSetId, setQuestionSetId] = useState('');
  const [questionCount, setQuestionCount] = useState(20);
  const [durationMinutes, setDurationMinutes] = useState(20);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [createdForm, setCreatedForm] = useState<QuizForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    listQuizQuestionSets()
      .then((nextSets) => {
        setSets(nextSets);
        setQuestionSetId(nextSets[0]?.id || '');
      })
      .catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Không tải được kho câu hỏi.'));
  }, []);

  async function handleCreate() {
    setBusy(true);
    setErrorMessage('');
    try {
      const form = await createQuizForm({ id: formCode, title, intro, questionSetId, questionCount, durationMinutes, shuffleQuestions, shuffleOptions });
      setCreatedForm(form);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được bài kiểm tra.');
    } finally {
      setBusy(false);
    }
  }

  const shareLink = createdForm ? buildQuizShareLink(createdForm.id) : '';
  const selectedSet = sets.find((item) => item.id === questionSetId);

  return (
    <>
      <SectionHeader eye="Trắc nghiệm" title="Khởi tạo bài kiểm tra" actions={<a className="btn btn-ghost" href="/quiz-test-library">Về thư viện bài kiểm tra</a>} />
      <section className="lecturer-bank-shell">
        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
        <div className="content-grid two-column">
          <Card title="Cấu hình bài kiểm tra">
            <div className="form-grid">
              <label>
                <span>Tiêu đề</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label>
                <span>Mã link</span>
                <input value={formCode} onChange={(event) => setFormCode(sanitizeQuizId(event.target.value))} placeholder="Để trống để tự sinh" />
              </label>
              <label>
                <span>Bộ câu hỏi</span>
                <select value={questionSetId} onChange={(event) => setQuestionSetId(event.target.value)}>
                  {sets.map((set) => (
                    <option value={set.id} key={set.id}>
                      {set.name} · {set.questionCount} câu
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Số câu lấy ngẫu nhiên</span>
                <input type="number" min={1} max={selectedSet?.questionCount || 200} value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value || 1))} />
              </label>
              <label>
                <span>Thời gian làm bài (phút)</span>
                <input type="number" min={1} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value || 1))} />
              </label>
              <label className="full">
                <span>Ghi chú đầu bài</span>
                <textarea rows={4} value={intro} onChange={(event) => setIntro(event.target.value)} />
              </label>
            </div>
            <div className="action-row">
              <label className="checkbox-row"><input type="checkbox" checked={shuffleQuestions} onChange={(event) => setShuffleQuestions(event.target.checked)} /> Xáo trộn câu hỏi</label>
              <label className="checkbox-row"><input type="checkbox" checked={shuffleOptions} onChange={(event) => setShuffleOptions(event.target.checked)} /> Xáo trộn đáp án</label>
            </div>
            <div className="action-row">
              <button className="btn btn-primary" onClick={() => void handleCreate()} disabled={busy || !questionSetId}>
                {busy ? 'Đang tạo...' : 'Tạo link bài kiểm tra'}
              </button>
            </div>
          </Card>

          <Card title="Link vừa tạo">
            <div className="lecturer-bank-share-box">
              <div className="lecturer-bank-share-url">{shareLink || 'Chưa tạo link'}</div>
              <div className="action-row">
                <button className="btn btn-primary" disabled={!shareLink} onClick={() => void navigator.clipboard.writeText(shareLink)}>
                  Copy link
                </button>
                <a className="btn btn-ghost" href={shareLink || '#'} target="_blank" rel="noreferrer">
                  Mở link học viên
                </a>
              </div>
              {createdForm ? <div className="muted-text">{createdForm.questionCount} câu · {createdForm.durationMinutes} phút · {createdForm.shuffleQuestions ? 'Có xáo trộn câu hỏi' : 'Giữ thứ tự câu hỏi'}</div> : null}
            </div>
          </Card>
        </div>
      </section>
    </>
  );
}

export function PublicQuizPage() {
  const params = useParams();
  const location = useLocation();
  const { profile, session } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const formId = params.formId || '';
  const quizContext = useMemo(() => {
    const search = new URLSearchParams(location.search);
    const source = search.get('source') || '';
    const courseId = search.get('courseId') || '';
    const classId = search.get('classId') || '';
    return {
      source,
      courseId,
      classId,
      isVLearning: source === 'vlearning' && Boolean(courseId),
    };
  }, [location.search]);
  const [bundle, setBundle] = useState<Awaited<ReturnType<typeof getPublicQuizFormBundle>>>(null);
  const [identity, setIdentity] = useState({ respondentName: '', email: '', className: '' });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<QuizSubmission | null>(null);
  const [previousSubmissions, setPreviousSubmissions] = useState<QuizSubmission[]>([]);
  const [previousSubmissionsLoading, setPreviousSubmissionsLoading] = useState(true);
  const [retakeRequested, setRetakeRequested] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [vtrainingAttempt, setVtrainingAttempt] = useState<VTrainingQuizAttempt | null>(null);
  const [publicQuizAttempt, setPublicQuizAttempt] = useState<PublicQuizAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const autoSubmitStartedRef = useRef(false);
  const submitActionGuardRef = useRef(createSubmitActionGuard());
  const draftStorageKey = useMemo(() => {
    const userKey = profile?.id || session?.user?.id || session?.user?.email || 'anonymous';
    return formId ? `vcontent.quiz.draft.${formId}.${userKey}` : '';
  }, [formId, profile?.id, session?.user?.id, session?.user?.email]);
  const isVTrainingClassQuiz = Boolean(
    !quizContext.isVLearning && bundle?.form.metadata?.classId,
  );
  const isGenericPublicQuiz = Boolean(
    bundle && !quizContext.isVLearning && !bundle.form.metadata?.classId,
  );

  useEffect(() => {
    setLoading(true);
    getPublicQuizFormBundle(formId)
      .then(setBundle)
      .catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Không tải được bài kiểm tra.'))
      .finally(() => setLoading(false));
  }, [formId]);

  useEffect(() => {
    setIdentity((current) => ({
      respondentName: current.respondentName || profile?.fullName || '',
      email: current.email || profile?.email || session?.user?.email || '',
      className: current.className || profile?.studentClass || profile?.studentGroup || profile?.title || '',
    }));
  }, [profile?.fullName, profile?.email, profile?.studentClass, profile?.studentGroup, profile?.title, session?.user?.email]);

  useEffect(() => {
    if (!bundle || !draftStorageKey) return;
    try {
      const raw = window.localStorage.getItem(draftStorageKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        identity?: typeof identity;
        answers?: Record<string, string>;
        startedAt?: number | null;
        publicQuizAttempt?: PublicQuizAttempt | null;
      };
      if (draft.identity) {
        setIdentity((current) => ({
          respondentName: draft.identity?.respondentName || current.respondentName,
          email: draft.identity?.email || current.email,
          className: draft.identity?.className || current.className,
        }));
      }
      if (draft.answers && typeof draft.answers === 'object') {
        setAnswers(draft.answers);
      }
      if (isGenericPublicQuiz
          && draft.publicQuizAttempt?.formId === bundle.form.id
          && Date.parse(draft.publicQuizAttempt.expiresAt) > Date.now()) {
        setPublicQuizAttempt(draft.publicQuizAttempt);
        setBundle((current) => current
          ? { ...current, questions: draft.publicQuizAttempt?.questions || current.questions }
          : current);
        setStartedAt(Date.parse(draft.publicQuizAttempt.startedAt));
      } else if (!isVTrainingClassQuiz && !isGenericPublicQuiz && draft.startedAt && Number.isFinite(draft.startedAt)) {
        setStartedAt(draft.startedAt);
      }
    } catch {
      // Ignore broken draft payloads and continue with a clean attempt.
    }
  }, [bundle?.form.id, draftStorageKey, isGenericPublicQuiz, isVTrainingClassQuiz]);

  useEffect(() => {
    if (!bundle) return;
    const durationSeconds = Math.max(1, Number(bundle.form.durationMinutes || 0)) * 60;
    if (!startedAt) {
      setRemainingSeconds(durationSeconds);
      return;
    }

    const updateRemaining = () => {
      if (vtrainingAttempt?.expiresAt) {
        setRemainingSeconds(Math.max(0, Math.ceil((Date.parse(vtrainingAttempt.expiresAt) - Date.now()) / 1000)));
        return;
      }
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      setRemainingSeconds(Math.max(0, durationSeconds - elapsedSeconds));
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [bundle?.form.durationMinutes, startedAt, vtrainingAttempt?.expiresAt]);

  useEffect(() => {
    if (!bundle || !draftStorageKey || submitted) return;
    try {
      window.localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          savedAt: new Date().toISOString(),
          identity,
          answers,
          startedAt,
          publicQuizAttempt,
        }),
      );
    } catch {
      // Local draft persistence is best effort.
    }
  }, [answers, bundle?.form.id, draftStorageKey, identity, publicQuizAttempt, startedAt, submitted]);

  useEffect(() => {
    if (!bundle) {
      setPreviousSubmissions([]);
      setPreviousSubmissionsLoading(false);
      return;
    }
    let isCurrent = true;
    setPreviousSubmissionsLoading(true);
    const loadPreviousSubmissions = quizContext.isVLearning
      ? listMyElearningQuizSubmissions(bundle.form.id, {
          courseId: quizContext.courseId,
          studentProfileId: profile?.id || null,
          email: profile?.email || session?.user?.email || null,
          userId: session?.user?.id || null,
        })
      : listMyQuizSubmissions(bundle.form.id, { studentProfileId: profile?.id || null, email: profile?.email || session?.user?.email || null });
    loadPreviousSubmissions
      .then((rows) => {
        if (!isCurrent) return;
        setPreviousSubmissions(rows);
      })
      .catch(() => {
        if (!isCurrent) return;
        setPreviousSubmissions([]);
      })
      .finally(() => {
        if (!isCurrent) return;
        setPreviousSubmissionsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [bundle?.form.id, profile?.id, profile?.email, quizContext.courseId, quizContext.isVLearning, session?.user?.email, session?.user?.id]);

  const answeredCount = useMemo(
    () => (bundle?.questions || []).filter((question) => Boolean(answers[question.id])).length,
    [answers, bundle?.questions],
  );
  const completionPercent = bundle?.questions.length ? Math.round((answeredCount / bundle.questions.length) * 100) : 0;
  const maxAttempts = Math.max(1, Number(bundle?.form.maxAttempts || 1));
  const attemptsUsed = previousSubmissions.length;
  const submittedQuiz = retakeRequested ? null : submitted || previousSubmissions[0] || null;
  const hasStarted = Boolean(startedAt);
  const isTimeUp = hasStarted && remainingSeconds <= 0;
  const isSubmitLocked = submitting;
  const canAttemptSubmission = attemptsUsed < maxAttempts;
  const configuredDurationSeconds = Math.max(1, Number(bundle?.form.durationMinutes || 0)) * 60;
  const countdownLabel = formatCountdown(hasStarted ? remainingSeconds : configuredDurationSeconds);

  function selectAnswer(questionId: string, optionId: string) {
    if (!hasStarted || isTimeUp) return;
    setAnswers((current) => ({ ...current, [questionId]: optionId }));
  }

  function scrollToQuestion(questionId: string) {
    if (!hasStarted) return;
    document.getElementById(`quiz-question-${questionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => {
    if (!shouldAutoSubmitTimedActivity({
      isTimeUp,
      hasStarted,
      completed: Boolean(submittedQuiz),
      submitting,
      canAttempt: !previousSubmissionsLoading && canAttemptSubmission,
    })) return;
    if (autoSubmitStartedRef.current) return;
    autoSubmitStartedRef.current = true;
    void submitQuiz({ autoSubmit: true });
  }, [canAttemptSubmission, hasStarted, isTimeUp, previousSubmissionsLoading, submittedQuiz, submitting]);

  async function handleStartQuiz() {
    if (!bundle) return;
    if (attemptsUsed >= maxAttempts) {
      setErrorMessage(`Bạn đã hết số lần làm bài (${maxAttempts}/${maxAttempts}).`);
      return;
    }
    if (!identity.respondentName.trim() || !identity.email.trim()) {
      setErrorMessage('Vui lòng kiểm tra họ tên và email trước khi bắt đầu làm bài.');
      return;
    }
    setErrorMessage('');
    if (isVTrainingClassQuiz) {
      try {
        const attempt = await startVTrainingQuizAttempt(bundle.form.id);
        setVtrainingAttempt(attempt);
        setBundle((current) => current ? { ...current, questions: attempt.questions } : current);
        setAnswers((current) => Object.fromEntries(
          attempt.questions
            .filter((question) => current[question.id])
            .map((question) => [question.id, current[question.id]]),
        ));
        setStartedAt(Date.parse(attempt.startedAt));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Không bắt đầu được bài kiểm tra VTraining.');
      }
      return;
    }
    if (isGenericPublicQuiz) {
      try {
        const attempt = await startPublicQuizAttempt({
          formId: bundle.form.id,
          respondentName: identity.respondentName.trim(),
          email: identity.email.trim(),
          className: identity.className.trim(),
          accessToken: session?.access_token || '',
          idempotencyKey: publicQuizAttempt?.startIdempotencyKey,
        });
        setPublicQuizAttempt(attempt);
        setBundle((current) => current ? { ...current, questions: attempt.questions } : current);
        setAnswers((current) => Object.fromEntries(
          attempt.questions
            .filter((question) => current[question.id])
            .map((question) => [question.id, current[question.id]]),
        ));
        setStartedAt(Date.parse(attempt.startedAt));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Không bắt đầu được public quiz.');
      }
      return;
    }
    setStartedAt(Date.now());
  }

  async function submitQuiz(options: { autoSubmit?: boolean } = {}) {
    if (!bundle) return;
    if (!hasStarted) {
      setErrorMessage('Vui lòng bấm BẮT ĐẦU LÀM BÀI trước khi trả lời.');
      return;
    }
    if (isTimeUp && !options.autoSubmit) {
      setErrorMessage('Đã hết thời gian làm bài.');
      return;
    }
    if (!options.autoSubmit && answeredCount < bundle.questions.length) {
      pushToast({ title: 'Vui lòng hoàn thành tất cả các câu hỏi', tone: 'warning' });
      const firstMissing = bundle.questions.find((question) => !answers[question.id]);
      if (firstMissing) scrollToQuestion(firstMissing.id);
      return;
    }
    await submitActionGuardRef.current.run(`quiz:${bundle.form.id}:${profile?.id || identity.email || 'anon'}`, async () => {
    setSubmitting(true);
    setErrorMessage('');
    try {
      if (attemptsUsed >= maxAttempts) {
        setErrorMessage(`Bạn đã hết số lần làm bài (${maxAttempts}/${maxAttempts}).`);
        return;
      }
      const submissionPayload = {
        formId: bundle.form.id,
        respondentName: identity.respondentName.trim(),
        email: identity.email.trim(),
        className: identity.className.trim(),
        answers,
        questionOrder: bundle.questions.map((question) => question.id),
        score: null,
        total: null,
        studentProfileId: profile?.id || null,
        attemptNo: attemptsUsed + 1,
        metadata: {
          classId: quizContext.classId || bundle.form.metadata?.classId || null,
          courseId: quizContext.courseId || bundle.form.metadata?.courseId || null,
          source: quizContext.source || bundle.form.metadata?.source || null,
          activityType: bundle.form.metadata?.activityType || 'quiz',
          ...(options.autoSubmit ? { autoSubmitted: true, autoSubmittedAt: new Date().toISOString(), reason: 'time_up' } : {}),
        },
      };
      const row = quizContext.isVLearning
        ? await saveElearningQuizSubmission({
            ...submissionPayload,
            courseId: quizContext.courseId,
            userId: session?.user?.id || null,
          })
        : isVTrainingClassQuiz
          ? await submitVTrainingQuizAttempt({
              sessionId: vtrainingAttempt?.sessionId || '',
              answers,
              metadata: options.autoSubmit
                ? { autoSubmitted: true, autoSubmittedAt: new Date().toISOString(), reason: 'time_up' }
                : {},
            })
          : isGenericPublicQuiz
            ? await submitPublicQuizAttempt({
                attempt: publicQuizAttempt as PublicQuizAttempt,
                answers,
                autoSubmitted: Boolean(options.autoSubmit),
              })
            : await saveQuizSubmission(submissionPayload);
      if (draftStorageKey) window.localStorage.removeItem(draftStorageKey);
      pushToast({ title: 'Bạn đã hoàn thành bài', tone: 'success' });
      setSubmitted(row);
      setPreviousSubmissions((current) => [row, ...current]);
      setRetakeRequested(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không gửi được bài kiểm tra.');
    } finally {
      setSubmitting(false);
    }
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitQuiz();
  }

  function handleRetakeQuiz() {
    if (attemptsUsed >= maxAttempts) return;
    setRetakeRequested(true);
    setSubmitted(null);
    setAnswers({});
    setStartedAt(null);
    setVtrainingAttempt(null);
    setPublicQuizAttempt(null);
    setRemainingSeconds(configuredDurationSeconds);
    setErrorMessage('');
    autoSubmitStartedRef.current = false;
    if (draftStorageKey) window.localStorage.removeItem(draftStorageKey);
  }

  if (loading) {
    return <div className="public-game-page"><SectionHeader eye="Quiz" title="Đang tải bài kiểm tra" /></div>;
  }

  if (!bundle) {
    return (
      <div className="public-game-page">
        <SectionHeader eye="Quiz" title="Không tìm thấy bài kiểm tra" />
        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      </div>
    );
  }

  if (submittedQuiz) {
    const resultTotal = submittedQuiz.total || 10;
    const resultScore = submittedQuiz.score !== null && submittedQuiz.total && submittedQuiz.total !== 10
      ? Math.round((submittedQuiz.score / submittedQuiz.total) * 100) / 10
      : submittedQuiz.score;
    const resultSub = resultScore !== null && resultTotal ? `Thang điểm ${resultTotal}` : 'Đã ghi nhận';
    return (
      <div className="quiz-public-page">
        <section className="quiz-submit-screen">
          <div className="quiz-submit-mark">✓</div>
          <div>
            <div className="quiz-public-eyebrow">Quiz</div>
            <h1>Đã nộp bài kiểm tra</h1>
            <p>Kết quả của bạn đã được ghi nhận trên hệ thống.</p>
          </div>
          <div className="quiz-public-metrics">
            <div className="kpi tone-neutral quiz-submit-identity">
              <div className="kpi-label">Họ tên</div>
              <div className="kpi-value">{submittedQuiz.respondentName || '-'}</div>
              <div className="kpi-sub">{submittedQuiz.email}</div>
            </div>
            <Kpi label="Kết quả" value={resultScore == null ? '-' : `${resultScore}/${resultTotal}`} sub={resultSub} tone="success" />
          </div>
          {canAttemptSubmission ? (
            <button className="btn btn-primary" type="button" onClick={handleRetakeQuiz}>
              Làm lại
            </button>
          ) : null}
          {bundle.form.metadata?.classId ? (
            <Link className="btn btn-primary" to={`/vtraining/classes/${bundle.form.metadata.classId}`}>
              Quay lại lớp học
            </Link>
          ) : null}
          {quizContext.isVLearning && quizContext.courseId ? (
            <Link className="btn btn-primary" to={`/vlearning/${quizContext.courseId}`}>
              Quay lại khóa học
            </Link>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="quiz-public-page">
      <section className="quiz-public-hero">
        <div>
          <div className="quiz-public-eyebrow">Bài kiểm tra trực tuyến</div>
          <h1>{bundle.form.title}</h1>
          <p>{bundle.form.intro || 'Hoàn thành đầy đủ các câu hỏi trước khi nộp bài.'}</p>
        </div>
        <div className="quiz-hero-panel">
          <span>Bộ câu hỏi</span>
          <strong>{bundle.questionSet.name}</strong>
          <em>{bundle.questionSet.id}</em>
        </div>
      </section>

      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      {submitting ? (
        <div className="notice warning quiz-submit-lock-notice">
          Đang ghi nhận bài nộp của bạn. Vui lòng giữ nguyên màn hình, hệ thống sẽ tự chuyển sang trạng thái hoàn thành khi lưu xong.
        </div>
      ) : null}
      {attemptsUsed >= maxAttempts ? <div className="notice warning">Bạn đã hết số lần làm bài kiểm tra này.</div> : null}
      {isTimeUp ? <div className="notice warning">Đã hết thời gian làm bài.</div> : null}

      {previousSubmissionsLoading ? (
        <section className="quiz-submit-screen" aria-busy="true">
          <div className="quiz-submit-mark">...</div>
          <div>
            <div className="quiz-public-eyebrow">Quiz</div>
            <h1>Đang kiểm tra trạng thái bài nộp</h1>
            <p>Hệ thống đang xác minh lần nộp bài gần nhất của bạn.</p>
          </div>
        </section>
      ) : (
      <form className="quiz-exam-layout" onSubmit={handleSubmit}>
        <main className="quiz-exam-main">
          <section className="quiz-student-card">
            <div>
              <div className="quiz-public-eyebrow">Học viên</div>
              <h2>{identity.respondentName || 'Thông tin học viên'}</h2>
            </div>
            <div className="quiz-student-grid">
              <label>
                <span>Họ và tên</span>
                <input required readOnly value={identity.respondentName} />
              </label>
              <label>
                <span>Email đăng nhập</span>
                <input required readOnly type="email" value={identity.email} />
              </label>
              <label>
                <span>Lớp / đơn vị</span>
                <input readOnly value={identity.className} />
              </label>
            </div>
          </section>

          {!hasStarted ? (
            <section className="quiz-start-panel">
              <button className="btn btn-primary quiz-start-button" type="button" onClick={() => void handleStartQuiz()} disabled={attemptsUsed >= maxAttempts}>
                BẮT ĐẦU LÀM BÀI
              </button>
            </section>
          ) : (
            <section className="quiz-question-list">
              {bundle.questions.map((question, index) => {
                const selectedOptionId = answers[question.id] || '';
                return (
                  <article className="quiz-question-card" id={`quiz-question-${question.id}`} key={question.id}>
                    <div className="quiz-question-topline">
                      <span>Câu {index + 1}</span>
                      <Badge tone={selectedOptionId ? 'success' : 'warning'}>{selectedOptionId ? 'Đã chọn' : 'Chưa chọn'}</Badge>
                    </div>
                    <h2>{question.prompt}</h2>
                    <div className="quiz-option-grid">
                      {question.options.map((option, optionIndex) => (
                        <label className={`quiz-choice-card${selectedOptionId === option.id ? ' selected' : ''}${isSubmitLocked || isTimeUp ? ' disabled' : ''}`} key={option.id}>
                          <input type="radio" name={question.id} value={option.id} checked={selectedOptionId === option.id} disabled={submitting || isTimeUp} onChange={() => selectAnswer(question.id, option.id)} />
                          <span className="quiz-choice-key">{String.fromCharCode(65 + optionIndex)}</span>
                          <span className="quiz-choice-text">{formatQuizOptionText(option.text, option.id)}</span>
                        </label>
                      ))}
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </main>

        <aside className="quiz-exam-side">
          <div className={`quiz-timer-card${hasStarted ? ' running' : ''}${isTimeUp ? ' expired' : ''}`}>
            <span>{hasStarted ? 'Thời gian còn lại' : 'Thời gian làm bài'}</span>
            <strong>{countdownLabel}</strong>
            <em>{hasStarted ? 'Đồng hồ đang chạy' : 'Bắt đầu để tính giờ'}</em>
          </div>
          <div className="quiz-progress-card">
            <div className="quiz-progress-ring" style={{ '--quiz-progress': `${completionPercent}%` } as CSSProperties}>
              <span>{completionPercent}%</span>
            </div>
            <div>
              <strong>{answeredCount}/{bundle.questions.length}</strong>
              <span>câu đã hoàn thành</span>
            </div>
          </div>
          <div className="quiz-question-nav">
            {bundle.questions.map((question, index) => (
              <button
                type="button"
                className={answers[question.id] ? 'answered' : ''}
                disabled={!hasStarted || isSubmitLocked}
                onClick={() => scrollToQuestion(question.id)}
                key={question.id}
              >
                {index + 1}
              </button>
            ))}
          </div>
          {hasStarted ? (
            <button className="btn btn-primary quiz-submit-button" type="submit" disabled={submitting || attemptsUsed >= maxAttempts || isTimeUp}>
              {submitting ? 'Đang ghi nhận bài nộp...' : 'Nộp bài kiểm tra'}
            </button>
          ) : null}
        </aside>
      </form>
      )}
    </div>
  );
}
