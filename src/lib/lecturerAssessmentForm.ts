export type LecturerAnswerValue = string | string[] | null | undefined;

export type LecturerQuestionLike = {
  questionType?: string | null;
  prompt?: string | null;
  guidance?: string | null;
};

export function toggleMultipleChoiceAnswer(current: LecturerAnswerValue, optionId: string, checked: boolean) {
  const values = Array.isArray(current) ? current : [];
  if (checked) return values.includes(optionId) ? values : [...values, optionId];
  return values.filter((value) => value !== optionId);
}

export function formatLecturerAssessmentAnswer(value: LecturerAnswerValue) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join('; ');
  return String(value || '').trim();
}

export function hasStructuredLecturerQuestions(questions: LecturerQuestionLike[]) {
  return questions.some((question) => {
    const type = question.questionType || 'long_text';
    return type !== 'long_text';
  });
}

export function getLecturerQuestionSupplement(question: LecturerQuestionLike) {
  const prompt = String(question.prompt || '').trim();
  if (prompt) return { label: 'Tình huống', text: prompt };

  const guidance = String(question.guidance || '').trim();
  if (guidance) return { label: 'Ghi chú', text: guidance };

  return null;
}
