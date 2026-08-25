import * as XLSX from "xlsx";
import type { StudentSurveyForm, StudentSurveyQuestion, StudentSurveySubmission } from "@/lib/studentSurvey";

type ReportWorkbookInput = {
  form: StudentSurveyForm;
  questions: StudentSurveyQuestion[];
  submissions: StudentSurveySubmission[];
  exportedAt?: Date;
};

type ReportTableRow = {
  label: string;
  count: number;
};

type ChoiceSummary = {
  countsByLabel: Map<string, number>;
  total: number;
};

function normalizeCellText(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function answerForQuestion(submission: StudentSurveySubmission, questionId: string) {
  return (submission.answers as Record<string, unknown>)[questionId];
}

function answerToDisplayText(value: unknown) {
  if (Array.isArray(value)) return value.map(normalizeCellText).filter(Boolean).join("; ");
  return normalizeCellText(value);
}

function valuesForMultipleAnswer(value: unknown, question: StudentSurveyQuestion) {
  if (Array.isArray(value)) return value.map(normalizeCellText).filter(Boolean);
  const text = normalizeCellText(value);
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed.map(normalizeCellText).filter(Boolean);
  } catch {
    // Legacy values are often stored as plain text; handle them below.
  }

  const optionValues = new Set((question.options || []).map((option) => option.value));
  if (optionValues.has(text)) return [text];
  return text
    .split(/\s*(?:;|\||\n)\s*/)
    .map(normalizeCellText)
    .filter(Boolean);
}

function summarizeChoiceQuestion(question: StudentSurveyQuestion, submissions: StudentSurveySubmission[]): ReportTableRow[] {
  const counts = new Map<string, number>();
  for (const option of question.options || []) counts.set(option.value, 0);

  for (const submission of submissions) {
    const rawValue = answerForQuestion(submission, question.id);
    const values = question.type === "multiple" ? valuesForMultipleAnswer(rawValue, question) : [normalizeCellText(rawValue)].filter(Boolean);
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  }

  const optionRows = (question.options || []).map((option) => ({
    label: option.label,
    count: counts.get(option.value) || 0,
  }));

  const knownValues = new Set((question.options || []).map((option) => option.value));
  const extraRows = [...counts.entries()]
    .filter(([value]) => value && !knownValues.has(value))
    .map(([label, count]) => ({ label, count }));

  return [...optionRows, ...extraRows];
}

function summarizeChoiceQuestionForTable(question: StudentSurveyQuestion, submissions: StudentSurveySubmission[]): ChoiceSummary {
  const rows = summarizeChoiceQuestion(question, submissions);
  return {
    countsByLabel: new Map(rows.map((row) => [row.label, row.count])),
    total: rows.reduce((sum, row) => sum + row.count, 0),
  };
}

function summarizeTextQuestion(question: StudentSurveyQuestion, submissions: StudentSurveySubmission[]): ReportTableRow[] {
  const counts = new Map<string, number>();
  for (const submission of submissions) {
    const answer = normalizeCellText(answerForQuestion(submission, question.id));
    if (!answer) continue;
    counts.set(answer, (counts.get(answer) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function optionSignature(question: StudentSurveyQuestion) {
  return (question.options || []).map((option) => option.label).join("\u001f");
}

function sectionKey(question: StudentSurveyQuestion) {
  return question.sectionId || question.sectionTitle || "survey";
}

function sectionTitle(question: StudentSurveyQuestion) {
  return question.sectionTitle || question.sectionId || "Noi dung khao sat";
}

function reportQuestionLabel(question: StudentSurveyQuestion) {
  return normalizeCellText(question.prompt) || normalizeCellText(question.code) || question.id;
}

function appendChoiceTable(rows: unknown[][], questions: StudentSurveyQuestion[], submissions: StudentSurveySubmission[]) {
  if (!questions.length) return;
  const optionLabels = questions[0].options?.map((option) => option.label) || [];
  rows.push(["NOI DUNG", ...optionLabels, "Tong"]);
  for (const question of questions) {
    const summary = summarizeChoiceQuestionForTable(question, submissions);
    rows.push([reportQuestionLabel(question), ...optionLabels.map((label) => summary.countsByLabel.get(label) || 0), summary.total]);
  }
  rows.push([]);
}

function appendTextQuestionTable(rows: unknown[][], question: StudentSurveyQuestion, submissions: StudentSurveySubmission[]) {
  rows.push([reportQuestionLabel(question)]);
  rows.push(["Y kien", "So luong"]);
  const summaryRows = summarizeTextQuestion(question, submissions);
  if (!summaryRows.length) {
    rows.push(["Chua co phan hoi", 0]);
  } else {
    for (const item of summaryRows) rows.push([item.label, item.count]);
  }
  rows.push(["Tong phan hoi co noi dung", summaryRows.reduce((sum, item) => sum + item.count, 0)]);
  rows.push([]);
}

function buildSummaryRows(input: ReportWorkbookInput) {
  const rows: unknown[][] = [["BAO CAO KET QUA KHAO SAT"], [input.form.title], [`Ma khao sat: ${input.form.id}`], []];
  const sectionMap = new Map<string, { title: string; questions: StudentSurveyQuestion[] }>();

  for (const question of input.questions) {
    const key = sectionKey(question);
    const current = sectionMap.get(key) || { title: sectionTitle(question), questions: [] };
    current.questions.push(question);
    sectionMap.set(key, current);
  }

  for (const section of sectionMap.values()) {
    rows.push([section.title]);

    const choiceGroups = new Map<string, StudentSurveyQuestion[]>();
    for (const question of section.questions.filter((item) => item.type !== "text")) {
      const key = optionSignature(question);
      const current = choiceGroups.get(key) || [];
      current.push(question);
      choiceGroups.set(key, current);
    }

    for (const groupQuestions of choiceGroups.values()) appendChoiceTable(rows, groupQuestions, input.submissions);
    for (const question of section.questions.filter((item) => item.type === "text")) appendTextQuestionTable(rows, question, input.submissions);
  }

  return rows;
}

function buildInfoRows(input: ReportWorkbookInput) {
  const exportedAt = input.exportedAt || new Date();
  return [
    ["Ten khao sat", input.form.title],
    ["Ma khao sat", input.form.id],
    ["Trang thai", input.form.status],
    ["So phan hoi", input.submissions.length],
    ["Ngay xuat", exportedAt.toLocaleString("vi-VN")],
  ];
}

function buildResponseRows(input: ReportWorkbookInput) {
  const header = [
    "submitted_at",
    "unit_name",
    "contact_name",
    "position_name",
    "phone",
    "email",
    "completed_on",
    ...input.questions.map((question) => question.prompt || question.code || question.id),
  ];
  return [
    header,
    ...input.submissions.map((submission) => [
      submission.submittedAt,
      submission.respondent.unitName,
      submission.respondent.contactName,
      submission.respondent.positionName,
      submission.respondent.phone,
      submission.respondent.email,
      submission.respondent.completedOn,
      ...input.questions.map((question) => answerToDisplayText(answerForQuestion(submission, question.id))),
    ]),
  ];
}

function applyReportSheetLayout(sheet: XLSX.WorkSheet) {
  sheet["!cols"] = [{ wch: 76 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
}

export function buildStudentSurveyReportWorkbook(input: ReportWorkbookInput) {
  const workbook = XLSX.utils.book_new();

  const infoSheet = XLSX.utils.aoa_to_sheet(buildInfoRows(input));
  infoSheet["!cols"] = [{ wch: 20 }, { wch: 64 }];
  XLSX.utils.book_append_sheet(workbook, infoSheet, "Thong tin");

  const reportSheet = XLSX.utils.aoa_to_sheet(buildSummaryRows(input));
  applyReportSheetLayout(reportSheet);
  XLSX.utils.book_append_sheet(workbook, reportSheet, "Bao cao tong hop");

  const responsesSheet = XLSX.utils.aoa_to_sheet(buildResponseRows(input));
  responsesSheet["!cols"] = [{ wch: 24 }, { wch: 28 }, { wch: 24 }, { wch: 24 }, { wch: 16 }, { wch: 28 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, responsesSheet, "Responses");

  return XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}
