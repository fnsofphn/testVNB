import * as XLSX from "xlsx";
import { buildStudentSurveyReportWorkbook } from "@/lib/studentSurveyReport";
import type { StudentSurveyForm, StudentSurveyQuestion, StudentSurveySubmission } from "@/lib/studentSurvey";

const form: StudentSurveyForm = {
  id: "plx1",
  title: "Khao sat sau khoa dao tao lop 1",
  intro: "",
  status: "active",
  createdAt: "2026-06-15T00:00:00.000Z",
  settings: {
    browserTitle: "",
    bannerEyebrow: "",
    bannerTitle: "",
    bannerSubtitle: "",
    introTitle: "",
    introBody: "",
    introButtonLabel: "",
    submitButtonLabel: "",
    thankYouMessage: "",
    footerText: "",
    primaryColor: "#005BAC",
    accentColor: "#F58220",
  },
};

const questions: StudentSurveyQuestion[] = [
  {
    id: "q1",
    code: "M23_Q01",
    prompt: "Giang vien truyen dat de hieu",
    type: "single",
    required: true,
    sectionId: "lecturer",
    sectionTitle: "Giang vien",
    options: [
      { value: "1", label: "Kem" },
      { value: "2", label: "Tot" },
    ],
  },
  {
    id: "q2",
    code: "M23_Q02",
    prompt: "Giang vien tuong tac tot",
    type: "single",
    required: true,
    sectionId: "lecturer",
    sectionTitle: "Giang vien",
    options: [
      { value: "1", label: "Kem" },
      { value: "2", label: "Tot" },
    ],
  },
  {
    id: "q3",
    code: "M23_Q04",
    prompt: "Y kien hoc vien",
    type: "text",
    required: false,
    sectionId: "lecturer",
    sectionTitle: "Giang vien",
  },
];

const submissions = [
  {
    id: "s1",
    formId: "plx1",
    respondent: { unitName: "Don vi 1", contactName: "A", positionName: "", phone: "", email: "", completedOn: "" },
    answers: { q1: "2", q2: "2", q3: "Can them vi du thuc te" },
    submittedAt: "2026-06-15T01:00:00.000Z",
  },
  {
    id: "s2",
    formId: "plx1",
    respondent: { unitName: "Don vi 2", contactName: "B", positionName: "", phone: "", email: "", completedOn: "" },
    answers: { q1: "1", q2: "2", q3: "Can them vi du thuc te" },
    submittedAt: "2026-06-15T02:00:00.000Z",
  },
] as unknown as StudentSurveySubmission[];

const workbookBuffer = buildStudentSurveyReportWorkbook({ form, questions, submissions });
const workbook = XLSX.read(workbookBuffer, { type: "array", cellNF: true });

if (!workbook.SheetNames.includes("Thong tin")) {
  throw new Error("Report workbook must include Thong tin sheet.");
}

if (!workbook.SheetNames.includes("Bao cao tong hop")) {
  throw new Error("Report workbook must include Bao cao tong hop sheet.");
}

if (!workbook.SheetNames.includes("Responses")) {
  throw new Error("Report workbook must include Responses sheet.");
}

const reportRows = XLSX.utils.sheet_to_json(workbook.Sheets["Bao cao tong hop"], { header: 1 }) as unknown[][];
const sectionRowIndex = reportRows.findIndex((row) => row[0] === "Giang vien");
if (sectionRowIndex < 0) {
  throw new Error("Report workbook must group questions under the section title.");
}

const choiceHeader = reportRows.find((row) => row[0] === "NOI DUNG" && row.includes("Kem") && row.includes("Tot") && row.includes("Tong"));
if (!choiceHeader) {
  throw new Error("Report workbook must render section choice questions as one count table.");
}

const reportText = JSON.stringify(reportRows);
if (reportText.includes("M23_")) {
  throw new Error("Report workbook must not display internal M23 question codes.");
}

const q1Row = reportRows.find((row) => row[0] === "Giang vien truyen dat de hieu");
if (!q1Row || q1Row[1] !== 1 || q1Row[2] !== 1 || q1Row[3] !== 2) {
  throw new Error(`Expected Q01 row counts [1, 1, 2], got ${JSON.stringify(q1Row)}`);
}

const textAnswerRowIndex = reportRows.findIndex((row) => row[0] === "Can them vi du thuc te");
if (textAnswerRowIndex < 0) {
  throw new Error("Report workbook must group duplicate text answers.");
}

const textAnswerCountCell = workbook.Sheets["Bao cao tong hop"][XLSX.utils.encode_cell({ r: textAnswerRowIndex, c: 1 })];
if (textAnswerCountCell?.v !== 2) {
  throw new Error(`Expected grouped text answer count 2, got ${textAnswerCountCell?.v}`);
}

if (textAnswerCountCell?.z && String(textAnswerCountCell.z).includes("%")) {
  throw new Error(`Text answer count must not use percentage format, got ${textAnswerCountCell.z}`);
}
