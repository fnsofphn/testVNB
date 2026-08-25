import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Badge, Card, Kpi, SectionHeader } from '@/components/ui/Primitives';
import {
  getAssessmentFormBundle,
  getSectionQuestions,
  saveAssessmentSubmission,
  type LecturerAssessmentFormBundle,
} from '@/lib/lecturerAssessment';
import {
  formatLecturerAssessmentAnswer,
  getLecturerQuestionSupplement,
  hasStructuredLecturerQuestions,
  toggleMultipleChoiceAnswer,
  type LecturerAnswerValue,
} from '@/lib/lecturerAssessmentForm';

type PublicFormState = {
  lecturerName: string;
  email: string;
  phone: string;
  yearsTeaching: string;
  notes: string;
  answers: Record<string, LecturerAnswerValue>;
};

export function PublicLecturerAssessmentPage() {
  const params = useParams();
  const formId = params.formId || '';
  const [bundle, setBundle] = useState<LecturerAssessmentFormBundle | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [state, setState] = useState<PublicFormState>({
    lecturerName: '',
    email: '',
    phone: '',
    yearsTeaching: '',
    notes: '',
    answers: {},
  });

  const totalScore = useMemo(
    () => (bundle?.questions || []).reduce((sum, item) => sum + item.maxScore, 0),
    [bundle],
  );
  const hasScoring = totalScore > 0;
  const hasStructuredQuestions = useMemo(
    () => hasStructuredLecturerQuestions(bundle?.questions || []),
    [bundle],
  );

  useEffect(() => {
    void loadForm();
  }, [formId]);

  async function loadForm() {
    setLoading(true);
    setErrorMessage('');
    try {
      const nextBundle = formId ? await getAssessmentFormBundle(formId) : null;
      setBundle(nextBundle);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được form giảng viên.');
    } finally {
      setLoading(false);
    }
  }

  function updateAnswer(code: string, value: LecturerAnswerValue) {
    setState((current) => ({
      ...current,
      answers: {
        ...current.answers,
        [code]: value,
      },
    }));
  }

  function renderQuestionInput(question: LecturerAssessmentFormBundle['questions'][number]) {
    const required = question.required !== false;
    const value = state.answers[question.code];
    const questionType = question.questionType || 'long_text';

    if (questionType === 'single_choice') {
      return (
        <fieldset className="lecturer-choice-group">
          <legend>Câu trả lời của giảng viên</legend>
          {(question.options || []).map((option) => (
            <label className="lecturer-choice-row" key={option.id}>
              <input
                required={required}
                type="radio"
                name={`question-${question.code}`}
                value={option.id}
                checked={value === option.id}
                onChange={(event) => updateAnswer(question.code, event.target.value)}
              />
              <span>
                <strong>{option.id}</strong>
                {option.text}
              </span>
            </label>
          ))}
        </fieldset>
      );
    }

    if (questionType === 'multiple_choice') {
      const selectedValues = Array.isArray(value) ? value : [];
      return (
        <fieldset className="lecturer-choice-group">
          <legend>Câu trả lời của giảng viên</legend>
          {(question.options || []).map((option) => (
            <label className="lecturer-choice-row" key={option.id}>
              <input
                type="checkbox"
                value={option.id}
                checked={selectedValues.includes(option.id)}
                onChange={(event) => updateAnswer(question.code, toggleMultipleChoiceAnswer(value, option.id, event.target.checked))}
              />
              <span>
                <strong>{option.id}</strong>
                {option.text}
              </span>
            </label>
          ))}
          {required ? <input className="lecturer-choice-required-proxy" required value={selectedValues.length ? 'ok' : ''} onChange={() => {}} /> : null}
        </fieldset>
      );
    }

    if (questionType === 'short_text') {
      return (
        <label className="lecturer-bank-inline-field">
          <span>Câu trả lời của giảng viên</span>
          <input
            required={required}
            value={formatLecturerAssessmentAnswer(value)}
            onChange={(event) => updateAnswer(question.code, event.target.value)}
            placeholder="Nhập câu trả lời..."
          />
        </label>
      );
    }

    return (
      <label className="lecturer-bank-inline-field">
        <span>Câu trả lời của giảng viên</span>
        <textarea
          required={required}
          rows={6}
          value={formatLecturerAssessmentAnswer(value)}
          onChange={(event) => updateAnswer(question.code, event.target.value)}
          placeholder="Nhập câu trả lời..."
        />
      </label>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bundle) return;

    setSubmitting(true);
    setErrorMessage('');
    try {
      await saveAssessmentSubmission({
        formId: bundle.form.id,
        lecturerName: state.lecturerName.trim(),
        email: state.email.trim(),
        phone: state.phone.trim(),
        yearsTeaching: state.yearsTeaching.trim(),
        notes: state.notes.trim(),
        answers: state.answers,
      });
      setSubmitted(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không gửi được bài trả lời.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="public-game-page">
        <SectionHeader eye="Public Lecturer Form" title="Đang tải form" subtitle="Vui lòng chờ trong giây lát." />
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="public-game-page">
        <SectionHeader eye="Public Lecturer Form" title="Không tìm thấy form" subtitle="Link này không tồn tại hoặc đang tắt." />
        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="public-game-page">
        <SectionHeader eye="Public Lecturer Form" title="Gửi câu trả lời thành công!" subtitle="Xin cảm ơn anh/chị!" />
      </div>
    );
  }

  return (
    <div className="public-lecturer-page">
      <SectionHeader eye="Public Lecturer Form" title={bundle.form.title} subtitle={bundle.form.intro} />

      <div className="kpi-row small">
        <Kpi label="Bộ câu hỏi" value={bundle.questionSet.name} sub={bundle.questionSet.code} tone="warning" />
        <Kpi label="Tổng câu hỏi" value={String(bundle.questions.length)} sub="Điền đầy đủ trước khi gửi" tone="danger" />
        <Kpi label="Tổng phần" value={String(bundle.sections.length)} sub="Nhóm đánh giá" tone="violet" />
        <Kpi
          label={hasScoring ? 'Khung điểm' : 'Hình thức'}
          value={hasScoring ? String(totalScore) : 'Tự luận'}
          sub={hasScoring ? 'Dành cho hội đồng' : 'Trả lời theo nội dung bộ câu hỏi'}
          tone="success"
        />
      </div>

      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

      <form className="lecturer-public-form" onSubmit={handleSubmit}>
        <Card title="Thông tin giảng viên">
          <div className="form-grid">
            <label>
              <span>Họ và tên</span>
              <input required value={state.lecturerName} onChange={(event) => setState((current) => ({ ...current, lecturerName: event.target.value }))} />
            </label>
            <label>
              <span>Email</span>
              <input required type="email" value={state.email} onChange={(event) => setState((current) => ({ ...current, email: event.target.value }))} />
            </label>
            {!hasStructuredQuestions ? (
              <>
                <label>
                  <span>Điện thoại</span>
                  <input value={state.phone} onChange={(event) => setState((current) => ({ ...current, phone: event.target.value }))} />
                </label>
                <label>
                  <span>Số năm kinh nghiệm giảng dạy</span>
                  <input value={state.yearsTeaching} onChange={(event) => setState((current) => ({ ...current, yearsTeaching: event.target.value }))} />
                </label>
                <label className="full">
                  <span>Ghi chú bổ sung</span>
                  <textarea rows={4} value={state.notes} onChange={(event) => setState((current) => ({ ...current, notes: event.target.value }))} />
                </label>
              </>
            ) : null}
          </div>
        </Card>

        {bundle.sections.map((section) => (
          <Card
            key={section.id}
            title={`${section.code} - ${section.title}`}
            action={section.maxScore > 0 ? <Badge tone={section.tone}>{section.maxScore} điểm</Badge> : undefined}
          >
            <div className="lecturer-bank-question-stack">
              {getSectionQuestions(section.id, bundle.questions).map((question) => (
                <article className="lecturer-bank-question" key={question.id}>
                  <div className="lecturer-bank-question-head">
                    <div>
                      <div className="lecturer-bank-question-code">Câu {question.code}</div>
                      <h4>{question.title}</h4>
                    </div>
                    {question.maxScore > 0 ? <div className="lecturer-bank-question-score">/{question.maxScore}</div> : null}
                  </div>

                  <div className="lecturer-bank-question-body">
                    {(() => {
                      const supplement = getLecturerQuestionSupplement(question);
                      if (!supplement) return null;
                      return (
                        <div className={supplement.label === 'Ghi chú' ? 'lecturer-bank-guidance-block' : 'lecturer-bank-prompt-block'}>
                          <span className="lecturer-bank-label">{supplement.label}</span>
                          <p>{supplement.text}</p>
                        </div>
                      );
                    })()}

                    {renderQuestionInput(question)}
                  </div>
                </article>
              ))}
            </div>
          </Card>
        ))}

        <div className="action-row">
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Đang gửi...' : 'Gửi bài trả lời'}
          </button>
        </div>
      </form>
    </div>
  );
}
