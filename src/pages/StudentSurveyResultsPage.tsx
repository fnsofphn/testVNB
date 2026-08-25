import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { Link } from "react-router-dom";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { BarChart3, Copy, CopyPlus, ExternalLink, Eye, Link2, PauseCircle, Pencil, PlayCircle, Trash2, Upload, Video } from "lucide-react";
import { Badge, Card, SectionHeader } from "@/components/ui/Primitives";
import { downloadTextFile } from "@/lib/lecturerAssessment";
import {
  buildStudentSurveyShareLink,
  countStudentSurveySubmissionsByFormIds,
  createStudentSurveyForm,
  deleteStudentSurveyForm,
  deleteStudentSurveySubmission,
  exportSingleStudentSurveySubmissionToWorkbook,
  exportStudentSurveyToCsv,
  exportStudentSurveyToWorkbook,
  getDefaultStudentSurveyDisplaySettings,
  getJourneyDefinitions,
  getStudentSurveyQuestions,
  listStudentSurveySubmissions,
  listAllStudentSurveySubmissions,
  listStudentSurveyForms,
  listStudentSurveySubmissionsPage,
  sanitizeStudentSurveyFormId,
  summarizeChoiceCounts,
  updateStudentSurveyFormDetails,
  updateStudentSurveyFormStatus,
  type StudentSurveyDisplaySettings,
  type StudentSurveyForm,
  type StudentSurveyQuestion,
  type SurveyQuestionType,
  type StudentSurveySubmission,
} from "@/lib/studentSurvey";
import { buildStudentSurveyDuplicateInput, suggestStudentSurveyDuplicateDefaults } from "@/lib/studentSurveyClone";
import { buildStudentSurveyReportWorkbook } from "@/lib/studentSurveyReport";
import {
  buildAiPowerPracticeLocalForm,
  buildAiPowerPracticeLocalSubmissions,
  isAiPowerPracticeLocalForm,
  saveAiPowerPracticeLocalForm,
} from "@/modules/surveys/aiPowerPracticeLocalDemo";
import { getSurveyTypeDefinition, type SurveyTypeId } from "@/modules/surveys/surveyTypes";
import { filterSurveyFormsForView } from "@/modules/surveys/surveyFormFilters";
import {
  buildRecipientTextFromSubmissions,
  dispatchSurveyEmails,
  listSurveyEmailHistory,
  parseSurveyEmailRecipients,
  saveSurveyEmailHistory,
  type SurveyEmailHistoryItem,
  type SurveyEmailSmtpConfig,
} from "@/lib/studentSurveyEmail";

type SurveyTemplateVariant = "default" | "v2" | "plx-tna" | "generic" | "prompt-practice" | "ai-power-practice";
type SurveyMainScreen = "create" | "list" | "edit" | "email" | "results";
type ResultsScreen = "menu" | "list" | "detail" | "analytics";
type JourneyExportFilter = string;
type SurveyFormStatusFilter = "all" | "active" | "paused";

const SURVEY_EMAIL_SMTP_STORAGE_KEY = "vcontent.studentSurvey.smtpConfig";
const SURVEY_SUBMISSION_PAGE_SIZE = 50;
const AI_POWER_TRACKING_ROUTE = "/v-survey/ql01a-ai-dien-luc-4-ung-dung/tracking";
const AI_POWER_APPLICATION_TITLES = [
  "Chuẩn bị giao ban đầu ngày",
  "Tổng hợp sự cố lưới điện tuần",
  "Chuẩn bị điểm nhấn giao ban",
  "Chuẩn hóa phản hồi khách hàng",
] as const;

type SubmissionDetailRow = {
  key: string;
  code: string;
  prompt: string;
  answer: string;
  sectionId: string;
};

export type StudentSurveyResultsPageProps = {
  surveyType?: SurveyTypeId;
  templateVariant?: SurveyTemplateVariant;
  includeAllSurveyTypes?: boolean;
  pageTitle?: string;
  pageSubtitle?: string;
  defaultFormTitle?: string;
  defaultFormCode?: string;
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("vi-VN");
}

function resolveStudentSurveyShareLink(form: StudentSurveyForm) {
  if (isAiPowerPracticeLocalForm(form)) {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const url = new URL(`${origin || "http://localhost"}/suni/vtraining/practice/ai-dien-luc-4-ung-dung.html`);
    (form.settings.practiceGuideVideoUrls || []).slice(0, 4).forEach((videoUrl, index) => {
      if (videoUrl.trim()) url.searchParams.set(`guideVideo${index + 1}`, videoUrl.trim());
    });
    return origin ? url.toString() : `${url.pathname}${url.search}`;
  }
  return buildStudentSurveyShareLink(form.id);
}

function formatDateOnly(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("vi-VN");
}

function getSurveyAccessLabel(settings: StudentSurveyDisplaySettings) {
  return settings.accessMode === "vtraining" ? "V-Training" : "Public";
}

function isSupportedPracticeVideoUrl(value: string) {
  const raw = value.trim();
  if (!raw) return true;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
      return url.pathname.split("/").some((part) => /^\d+$/.test(part));
    }
    return url.protocol === "https:" && /\.(mp4|webm)(?:$|\?)/i.test(url.href);
  } catch {
    return false;
  }
}

function hasMojibake(text: string) {
  const value = String(text || "");
  return /[\u00C2-\u00C6]|\u00E2\u20AC|\u00F0\u0178|\uFFFD/.test(value);
}

function normalizeUtf8Text(text: string) {
  const value = String(text || "");
  if (!hasMojibake(value)) return value;
  try {
    const bytes = Uint8Array.from([...value].map((char) => char.charCodeAt(0) & 0xff));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return value;
  }
}

function safeText(value: unknown, fallback: string) {
  const clean = normalizeUtf8Text(String(value || "")).replace(/\s+/g, " ").trim();
  return clean || fallback;
}

function previewAnswer(value: string) {
  const clean = safeText(value, "Chưa trả lời");
  return clean.length > 140 ? `${clean.slice(0, 140)}...` : clean;
}

function formatSurveyQuestionOptions(options?: Array<{ value: string; label: string }>) {
  return (options || []).map((option) => `${option.value}|${option.label}`).join("\n");
}

function parseSurveyQuestionOptions(value: string) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawValue, ...labelParts] = line.split("|");
      const optionValue = rawValue.trim();
      return {
        value: optionValue,
        label: (labelParts.join("|").trim() || optionValue).trim(),
      };
    })
    .filter((option) => option.value);
}

function slugifyFilenamePart(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function compactEmailMarkup(value: string) {
  const source = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/(^|\n)\s*[-•]\s*\n+/g, "$1- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const cleanInlineMarkup = (text: string) => {
    let next = String(text || "").replace(/\*{4,}/g, "");
    for (let index = 0; index < 4; index += 1) {
      next = next.replace(/([\p{L}\p{N}])\*\*([\p{L}\p{N}])/gu, "$1$2");
    }
    const markerCount = (next.match(/\*\*/g) || []).length;
    if (markerCount % 2 !== 0) next = next.replace(/\*\*/g, "");
    return next;
  };

  const normalizeBlock = (block: string) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return "";

    const output: string[] = [];
    let paragraph: string[] = [];
    let bullet = "";
    const flushParagraph = () => {
      if (!paragraph.length) return;
      output.push(cleanInlineMarkup(paragraph.join(" ").replace(/\s+/g, " ").trim()));
      paragraph = [];
    };
    const flushBullet = () => {
      if (!bullet) return;
      output.push(`- ${cleanInlineMarkup(bullet.replace(/\s+/g, " ").trim())}`);
      bullet = "";
    };

    for (const line of lines) {
      const bulletMatch = /^([-•*]|\d+[.)])\s*(.*)$/.exec(line);
      if (bulletMatch) {
        flushParagraph();
        flushBullet();
        bullet = bulletMatch[2] || "";
        continue;
      }
      if (bullet) {
        bullet = `${bullet} ${line}`;
      } else {
        paragraph.push(line);
      }
    }
    flushBullet();
    flushParagraph();
    return output.join("\n");
  };

  return source
    .split(/\n\s*\n/)
    .map(normalizeBlock)
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function escapeEmailAttribute(value: string) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function htmlToEmailMarkup(html: string) {
  if (typeof DOMParser === "undefined") return compactEmailMarkup(html);
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const blockTags = new Set(["P", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "TR", "TABLE"]);
  const headingTags = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

  const convertNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node as HTMLElement;
    const tagName = element.tagName;
    const children = Array.from(element.childNodes).map(convertNode).join("");
    const fontWeight = element.style?.fontWeight || "";
    const isBold =
      tagName === "B" ||
      tagName === "STRONG" ||
      Number(fontWeight) >= 600 ||
      /\bbold\b/i.test(fontWeight);

    if (tagName === "BR") return "\n";
    if (tagName === "A") {
      const href = element.getAttribute("href") || "";
      const label = compactEmailMarkup(children) || href;
      return href ? `<a href="${escapeEmailAttribute(href)}">${label}</a>` : label;
    }
    if (tagName === "LI") return `- ${compactEmailMarkup(children)}\n`;

    let value = children;
    if (isBold && compactEmailMarkup(value)) value = `**${compactEmailMarkup(value)}**`;
    if (blockTags.has(tagName) || headingTags.has(tagName)) value = `${compactEmailMarkup(value)}\n\n`;
    return value;
  };

  return compactEmailMarkup(Array.from(doc.body.childNodes).map(convertNode).join(""));
}

function readDocxHyperlinks(relsXml: string) {
  const links = new Map<string, string>();
  if (!relsXml || typeof DOMParser === "undefined") return links;
  const doc = new DOMParser().parseFromString(relsXml, "application/xml");
  Array.from(doc.getElementsByTagName("Relationship")).forEach((relationship) => {
    const id = relationship.getAttribute("Id") || "";
    const target = relationship.getAttribute("Target") || "";
    const type = relationship.getAttribute("Type") || "";
    if (id && target && /hyperlink/i.test(type)) links.set(id, target);
  });
  return links;
}

async function docxToEmailMarkup(file: File) {
  const zip = await JSZip.loadAsync(file);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml || typeof DOMParser === "undefined") return "";
  const relsXml = (await zip.file("word/_rels/document.xml.rels")?.async("string")) || "";
  const hyperlinks = readDocxHyperlinks(relsXml);
  const doc = new DOMParser().parseFromString(documentXml, "application/xml");
  const localName = (node: Node) => (node.nodeType === Node.ELEMENT_NODE ? (node as Element).localName : "") || node.nodeName.split(":").pop() || "";

  const convertNode = (node: Node, inheritedBold = false): string => {
    const name = localName(node);
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node as Element;
    if (name === "t") return element.textContent || "";
    if (name === "tab") return "\t";
    if (name === "br") return "\n";
    if (name === "hyperlink") {
      const relationshipId = element.getAttribute("r:id") || element.getAttribute("id") || "";
      const href = hyperlinks.get(relationshipId) || "";
      const label = compactEmailMarkup(Array.from(element.childNodes).map((child) => convertNode(child, inheritedBold)).join(""));
      return href ? `<a href="${escapeEmailAttribute(href)}">${label || href}</a>` : label;
    }
    if (name === "r") {
      const runIsBold = inheritedBold || !!Array.from(element.childNodes).find((child) => localName(child) === "rPr" && Array.from(child.childNodes).some((part) => localName(part) === "b"));
      const value = Array.from(element.childNodes)
        .filter((child) => localName(child) !== "rPr")
        .map((child) => convertNode(child, runIsBold))
        .join("");
      return runIsBold && compactEmailMarkup(value) ? `**${value}**` : value;
    }
    return Array.from(element.childNodes).map((child) => convertNode(child, inheritedBold)).join("");
  };

  const paragraphs = Array.from(doc.getElementsByTagNameNS("*", "p"))
    .map((paragraph) => {
      const paragraphText = compactEmailMarkup(Array.from(paragraph.childNodes).map((child) => convertNode(child)).join(""));
      if (!paragraphText) return "";
      const isListParagraph = Array.from(paragraph.childNodes).some((child) => {
        if (localName(child) !== "pPr") return false;
        return Array.from(child.childNodes).some((part) => localName(part) === "numPr");
      });
      return isListParagraph && !/^[-•*]\s+/.test(paragraphText) ? `- ${paragraphText}` : paragraphText;
    })
    .filter(Boolean);
  return compactEmailMarkup(paragraphs.join("\n\n"));
}

async function docxToPlainText(file: File) {
  return compactEmailMarkup(await docxToEmailMarkup(file)).replace(/<a\s+href="[^"]*">([^<]+)<\/a>/gi, "$1");
}

function stripFileExtension(value: string) {
  return String(value || "").replace(/\.[^.]+$/, "");
}

function toDatetimeLocalValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDatetimeLocalValue(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function applySurveyTemplateJson(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const sourceSettings = source.settings && typeof source.settings === "object" ? (source.settings as Partial<StudentSurveyDisplaySettings>) : {};
  return {
    id: typeof source.id === "string" ? source.id : "",
    title: typeof source.title === "string" ? source.title : "",
    intro: typeof source.intro === "string" ? source.intro : "",
    settings: sourceSettings,
  };
}

function buildSurveyTemplateDraft(text: string, fileName: string) {
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => compactEmailMarkup(line).replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
  const fileTitle = stripFileExtension(fileName);
  const title = lines[0] || fileTitle;
  const intro = lines.slice(1, 7).join("\n") || lines[0] || "";
  return {
    title,
    intro,
    id: sanitizeStudentSurveyFormId(fileTitle),
  };
}

type SurveyContractDraft = {
  id: string;
  title: string;
  intro: string;
  sections: Array<{ id: string; title: string; description?: string }>;
  questions: StudentSurveyQuestion[];
  settings: Partial<StudentSurveyDisplaySettings>;
};

const VNPT_RATING_OPTIONS = [
  { value: "1", label: "1 - Hầu như không tồn tại" },
  { value: "2", label: "2 - Có tồn tại nhưng rất ít" },
  { value: "3", label: "3 - Tồn tại ở mức trung bình" },
  { value: "4", label: "4 - Tồn tại khá rõ" },
  { value: "5", label: "5 - Tồn tại rất rõ" },
];

function isQuestionLine(line: string) {
  return /^Câu\s+\d+\./i.test(line);
}

function isPartLine(line: string) {
  return /^PHẦN\s+\d+\./i.test(line);
}

function isGroupLine(line: string) {
  return /^[A-ZĐ]\.\s+/.test(line) && !isQuestionLine(line);
}

function contractIdFromFileName(fileName: string) {
  const base = stripFileExtension(fileName).replace(/\s*\(final\)\s*/i, "");
  return sanitizeStudentSurveyFormId(base);
}

function questionId(code: string) {
  return String(code || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function sectionIdFromTitle(title: string, index: number) {
  const match = title.match(/^PHẦN\s+(\d+)/i);
  return match ? `part_${match[1]}` : `section_${index + 1}`;
}

function inferQuestionType(prompt: string, options: string[], hint: string): SurveyQuestionType {
  const combined = `${prompt} ${hint}`;
  if (/chọn\s+tối\s+đa|chon\s+toi\s+da/i.test(combined)) return "multiple";
  if (options.length >= 2) return "single";
  return "text";
}

function inferMaxSelections(prompt: string, hint: string) {
  const match = `${prompt} ${hint}`.match(/(?:chọn|chon)\s+tối\s+đa\s+0?(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function cleanOptionLine(line: string) {
  return line.replace(/^[\u2022\-–]\s*/, "").trim();
}

function splitQuestionBlock(block: string[]) {
  const [questionLine = "", ...rest] = block;
  const match = questionLine.match(/^Câu\s+(\d+)\.\s*(.*)$/i);
  const code = match ? `Q${String(Number(match[1])).padStart(2, "0")}` : `Q${Date.now()}`;
  const prompt = match ? match[2].trim() : questionLine.trim();
  const hintStart = rest.findIndex((line) => /^Gợi ý/i.test(line));
  const body = hintStart >= 0 ? rest.slice(0, hintStart) : rest;
  const hintLines = hintStart >= 0 ? rest.slice(hintStart).filter((line) => !/^Gợi ý/i.test(line)) : [];
  return { code, prompt, body, hint: hintLines.join("\n") };
}

function isMatrixQuestion(body: string[]) {
  return body.some((line) => /Mức độ đánh giá/i.test(line)) && body.some((line) => /^1$/.test(line)) && body.some((line) => /^5$/.test(line));
}

function matrixStatements(body: string[]) {
  const start = body.findIndex((line) => /^5$/.test(line));
  return body
    .slice(start + 1)
    .map(cleanOptionLine)
    .filter((line) => line && !/^(Nội dung|Mức độ đánh giá|Đánh giá theo thang|[1-5]|1\s*=|2\s*=|3\s*=|4\s*=|5\s*=)/i.test(line));
}

function parseSurveyContractFromText(text: string, fileName: string): SurveyContractDraft {
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => compactEmailMarkup(line).trim())
    .filter(Boolean);
  const titleLines = lines.slice(0, Math.max(1, lines.findIndex((line) => /^Đối tượng:/i.test(line)))).filter(Boolean);
  const title = titleLines.join("\n") || stripFileExtension(fileName);
  const firstPartIndex = lines.findIndex(isPartLine);
  const intro = lines.slice(titleLines.length, firstPartIndex >= 0 ? firstPartIndex : Math.min(lines.length, titleLines.length + 6)).join("\n");
  const sections: SurveyContractDraft["sections"] = [];
  const questions: StudentSurveyQuestion[] = [];
  let currentSection = { id: "intro", title: "Thông tin chung", description: "" };
  let currentGroup = "";
  let questionBlock: string[] = [];

  const flushQuestion = () => {
    if (!questionBlock.length) return;
    const { code, prompt, body, hint } = splitQuestionBlock(questionBlock);
    if (isMatrixQuestion(body)) {
      matrixStatements(body).forEach((statement, index) => {
        questions.push({
          id: questionId(`${code}-${index + 1}`),
          code: `${code}-${String(index + 1).padStart(2, "0")}`,
          prompt: statement,
          type: "rating",
          required: true,
          sectionId: currentSection.id,
          sectionTitle: currentSection.title,
          groupTitle: prompt,
          hint: index === 0 ? body.filter((line) => /^[1-5]\s*=/.test(line)).join("\n") || hint : undefined,
          options: VNPT_RATING_OPTIONS,
        });
      });
      questionBlock = [];
      return;
    }
    const options = body.map(cleanOptionLine).filter((line) => line && !/^Gợi ý/i.test(line));
    const type = inferQuestionType(prompt, options, hint);
    questions.push({
      id: questionId(code),
      code,
      prompt,
      type,
      required: true,
      sectionId: currentSection.id,
      sectionTitle: currentSection.title,
      groupTitle: currentGroup || undefined,
      hint: hint || undefined,
      maxSelections: type === "multiple" ? inferMaxSelections(prompt, hint) : undefined,
      options: type === "single" || type === "multiple" ? options.map((label) => ({ value: label, label })) : undefined,
      placeholder: type === "text" ? "Nhập câu trả lời..." : undefined,
    });
    questionBlock = [];
  };

  lines.forEach((line) => {
    if (isQuestionLine(line)) {
      flushQuestion();
      questionBlock = [line];
      return;
    }
    if (isPartLine(line)) {
      flushQuestion();
      currentSection = { id: sectionIdFromTitle(line, sections.length), title: line, description: "" };
      sections.push(currentSection);
      currentGroup = "";
      return;
    }
    if (sections.length && /^Mục (đích|tiêu):/i.test(line)) {
      flushQuestion();
      currentSection.description = line;
      sections[sections.length - 1] = currentSection;
      return;
    }
    if (isGroupLine(line)) {
      flushQuestion();
      currentGroup = line;
      return;
    }
    if (questionBlock.length) {
      questionBlock.push(line);
      return;
    }
  });
  flushQuestion();

  const fallbackSection = sections.length ? sections : [{ id: "survey", title: "Nội dung khảo sát", description: "" }];
  return {
    id: contractIdFromFileName(fileName),
    title,
    intro,
    sections: fallbackSection,
    questions,
    settings: {
      browserTitle: title,
      bannerTitle: title,
      bannerSubtitle: intro.split("\n").slice(0, 2).join("\n"),
      introTitle: "Giới thiệu",
      introBody: intro,
      submitButtonLabel: "Gửi khảo sát",
      thankYouMessage: "Cảm ơn Anh/Chị đã hoàn thành khảo sát.",
      customSections: fallbackSection,
      customQuestions: questions,
      contractVersion: "v1",
      contractSourceName: fileName,
    },
  };
}

function rowValue(row: Record<string, unknown>, key: string) {
  const entry = Object.entries(row).find(([name]) => name.trim().toLowerCase() === key.toLowerCase());
  return String(entry?.[1] || "").trim();
}

function parseSurveyContractWorkbook(fileName: string, buffer: ArrayBuffer): SurveyContractDraft {
  const workbook = XLSX.read(buffer, { type: "array" });
  const metaRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Metadata || workbook.Sheets.metadata || workbook.Sheets[workbook.SheetNames[0]] || {}, { defval: "" });
  const sectionRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Sections || workbook.Sheets.sections || {}, { defval: "" });
  const questionRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Questions || workbook.Sheets.questions || {}, { defval: "" });
  const metaEntries: Array<[string, string]> = metaRows
    .map((row): [string, string] => [rowValue(row, "key"), rowValue(row, "value")])
    .filter(([key]) => Boolean(key));
  const meta = new Map<string, string>(metaEntries);
  const sections = sectionRows.map((row, index) => ({
    id: rowValue(row, "sectionId") || `section_${index + 1}`,
    title: rowValue(row, "title") || `Phần ${index + 1}`,
    description: rowValue(row, "description"),
  }));
  const questions = questionRows.map((row, index) => {
    const type = (rowValue(row, "type") || "text") as SurveyQuestionType;
    const options = rowValue(row, "options")
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
    const sectionId = rowValue(row, "sectionId") || sections[0]?.id || "survey";
    const sectionTitle = rowValue(row, "sectionTitle") || sections.find((section) => section.id === sectionId)?.title || "Nội dung khảo sát";
    const code = rowValue(row, "code") || `Q${String(index + 1).padStart(2, "0")}`;
    return {
      id: rowValue(row, "id") || questionId(code),
      code,
      prompt: rowValue(row, "prompt"),
      type,
      required: rowValue(row, "required").toLowerCase() !== "false",
      sectionId,
      sectionTitle,
      groupTitle: rowValue(row, "groupTitle") || undefined,
      hint: rowValue(row, "hint") || undefined,
      maxSelections: rowValue(row, "maxSelections") ? Number(rowValue(row, "maxSelections")) : undefined,
      placeholder: rowValue(row, "placeholder") || undefined,
      options: type === "single" || type === "multiple" || type === "rating" ? options.map((label) => ({ value: label, label })) : undefined,
    } as StudentSurveyQuestion;
  });
  const title = meta.get("title") || stripFileExtension(fileName);
  const intro = meta.get("introBody") || meta.get("intro") || "";
  return {
    id: meta.get("id") || contractIdFromFileName(fileName),
    title,
    intro,
    sections,
    questions,
    settings: {
      browserTitle: meta.get("browserTitle") || title,
      bannerTitle: meta.get("bannerTitle") || title,
      bannerSubtitle: meta.get("bannerSubtitle") || "",
      introTitle: meta.get("introTitle") || "Giới thiệu",
      introBody: intro,
      submitButtonLabel: meta.get("submitButtonLabel") || "Gửi khảo sát",
      thankYouMessage: meta.get("thankYouMessage") || "Cảm ơn Anh/Chị đã hoàn thành khảo sát.",
      footerText: meta.get("footerText") || "",
      customSections: sections,
      customQuestions: questions,
      contractVersion: "v1",
      contractSourceName: fileName,
    },
  };
}

function buildSurveyContractWorkbook(draft: SurveyContractDraft) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      { key: "id", value: draft.id },
      { key: "title", value: draft.title },
      { key: "browserTitle", value: draft.settings.browserTitle || draft.title },
      { key: "bannerTitle", value: draft.settings.bannerTitle || draft.title },
      { key: "bannerSubtitle", value: draft.settings.bannerSubtitle || "" },
      { key: "introTitle", value: draft.settings.introTitle || "Giới thiệu" },
      { key: "introBody", value: draft.settings.introBody || draft.intro },
      { key: "submitButtonLabel", value: draft.settings.submitButtonLabel || "Gửi khảo sát" },
      { key: "thankYouMessage", value: draft.settings.thankYouMessage || "Cảm ơn Anh/Chị đã hoàn thành khảo sát." },
      { key: "footerText", value: draft.settings.footerText || "" },
    ]),
    "Metadata",
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(draft.sections.map((section, index) => ({ order: index + 1, sectionId: section.id, title: section.title, description: section.description || "" }))), "Sections");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      draft.questions.map((question, index) => ({
        order: index + 1,
        id: question.id,
        sectionId: question.sectionId,
        sectionTitle: question.sectionTitle,
        groupTitle: question.groupTitle || "",
        code: question.code,
        prompt: question.prompt,
        type: question.type,
        required: question.required,
        hint: question.hint || "",
        placeholder: question.placeholder || "",
        maxSelections: question.maxSelections || "",
        options: (question.options || []).map((option) => option.label).join("|"),
      })),
    ),
    "Questions",
  );
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" });
}

function normalizeExportValue(value: unknown): unknown {
  if (typeof value === "string") return normalizeUtf8Text(value);
  if (Array.isArray(value)) return value.map((item) => normalizeExportValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeExportValue(item)]));
  }
  return value;
}

function buildDefaultSurveyEmailBody(surveyType: SurveyTypeId) {
  if (surveyType === "plx-tna") {
    return [
      "Kính gửi các Anh Chị Cửa hàng trưởng,",
      "",
      'Trước thềm chương trình đào tạo **"Đổi mới phong cách quản lý, Văn hoá thương hiệu – Trải nghiệm khách hàng" của Petrolimex**, Tập đoàn và Ban tổ chức khoá học rất mong nhận được những chia sẻ THẬT từ các Anh Chị về thực tiễn quản lý CHXD hằng ngày.',
      "",
      "Ý kiến chia sẻ của các Anh Chị chính là dữ liệu đầu vào quan trọng và cần thiết để chúng tôi có căn cứ xây dựng và hoàn thiện nội dung chương trình đào tạo, đảm bảo trúng và đúng với thực tế, nhu cầu.",
      "",
      "Chúng tôi cam kết bảo mật thông tin và chỉ sử dụng dữ liệu này vào mục đích phục vụ chương trình đào tạo.",
      "",
      "Phiếu khảo sát lấy ý kiến của Anh Chị Cửa hàng trưởng gồm 6 phần:",
      "",
      "- Phần A: Thông tin chung",
      "- Phần B: Các câu hỏi về nhận thức Đổi mới – Thương hiệu – Giá trị (8 câu)",
      "- Phần C: Các câu hỏi về Trải nghiệm khách hàng (5 câu)",
      "- Phần D: Các câu hỏi về Lãnh đạo và quản lý đội ngũ (8 câu)",
      "- Phần E: Các câu hỏi về nhận diện khó khăn, thách thức thực tiễn (4 câu)",
      "- Phần F: Các câu hỏi về nhu cầu đào tạo và kỳ vọng học viên (5 câu)",
      "",
      "Anh/Chị vui lòng thực hiện khảo sát tại đường dẫn sau:",
      '<a href="{{link}}">Mở phiếu khảo sát PLX 2026</a>',
      "",
      "Trân trọng cảm ơn.",
      "PeopleOne",
    ].join("\n");
  }

  return [
    "Kính gửi Anh/Chị {{name}},",
    "",
    "Ban tổ chức trân trọng mời Anh/Chị tham gia khảo sát trực tuyến trước khóa học.",
    "",
    "Anh/Chị vui lòng thực hiện khảo sát tại đường dẫn sau:",
    '<a href="{{link}}">Mở phiếu khảo sát</a>',
    "",
    "Trân trọng,",
    "PeopleOne",
  ].join("\n");
}

function filterSubmissionAnswersByQuestions(submissions: StudentSurveySubmission[], questions: StudentSurveyQuestion[]) {
  const allowedQuestionIds = new Set(questions.map((question) => question.id));
  return submissions.map((submission) => ({
    ...submission,
    answers: Object.fromEntries(Object.entries(submission.answers).filter(([questionId]) => allowedQuestionIds.has(questionId))),
  }));
}

function averageForQuestion(question: StudentSurveyQuestion, submissions: StudentSurveySubmission[]) {
  if (question.type !== "rating") return null;
  const scores = submissions.map((submission) => Number(submission.answers[question.id] || 0)).filter((score) => score >= 1 && score <= 5);
  if (!scores.length) return null;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function buildSubmissionDetailRows(questions: StudentSurveyQuestion[], submission: StudentSurveySubmission): SubmissionDetailRow[] {
  return questions
    .map((question) => ({
      key: question.id,
      code: question.code,
      prompt: question.prompt,
      answer: String(submission.answers[question.id] || ""),
      sectionId: question.sectionId,
    }))
    .filter((row) => row.answer);
}

function downloadArrayBuffer(filename: string, buffer: ArrayBuffer, mime: string) {
  if (typeof document === "undefined") return;
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function StudentSurveyResultsPage({
  surveyType = "evnspc-tnkh",
  templateVariant = "default",
  includeAllSurveyTypes = false,
  pageTitle = "Khảo sát học viên",
  pageSubtitle = "Giữ form public theo HTML, lưu Supabase, xem kết quả từng người, tải Excel tổng hợp và chỉnh nội dung hiển thị cơ bản.",
  defaultFormTitle = "EVNSPC - Phiếu khảo sát TNKH",
  defaultFormCode = "evnspc",
}: StudentSurveyResultsPageProps) {
  const surveyDefinition = getSurveyTypeDefinition(surveyType);
  const localAiPowerPracticeDemoEnabled = import.meta.env.DEV
    && surveyType === "ql01a-ai-dien-luc-4-ung-dung"
    && templateVariant === "ai-power-practice";
  const forceLocalAiPowerPracticeDemo = localAiPowerPracticeDemoEnabled
    && typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("localDemo") === "1";
  const [forms, setForms] = useState<StudentSurveyForm[]>([]);
  const [formSubmissionCounts, setFormSubmissionCounts] = useState<Record<string, number>>({});
  const [activeFormId, setActiveFormId] = useState("");
  const [submissions, setSubmissions] = useState<StudentSurveySubmission[]>([]);
  const [analyticsSubmissions, setAnalyticsSubmissions] = useState<StudentSurveySubmission[]>([]);
  const [analyticsFormId, setAnalyticsFormId] = useState("");
  const [submissionTotal, setSubmissionTotal] = useState(0);
  const [submissionPage, setSubmissionPage] = useState(1);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>([]);
  const [formTitle, setFormTitle] = useState(defaultFormTitle);
  const [formCode, setFormCode] = useState(defaultFormCode);
  const [intro, setIntro] = useState("");
  const [settings, setSettings] = useState<StudentSurveyDisplaySettings>({
    ...getDefaultStudentSurveyDisplaySettings(),
    templateVariant,
  });
  const [copyState, setCopyState] = useState("");
  const [mainScreen, setMainScreen] = useState<SurveyMainScreen>("create");
  const [formStatusFilter, setFormStatusFilter] = useState<SurveyFormStatusFilter>("all");
  const [formKeyword, setFormKeyword] = useState("");
  const [resultsScreen, setResultsScreen] = useState<ResultsScreen>("menu");
  const [journeyExportFilter, setJourneyExportFilter] = useState<JourneyExportFilter>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [templateImportBusy, setTemplateImportBusy] = useState(false);
  const [templateImportNotice, setTemplateImportNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailNotice, setEmailNotice] = useState("");
  const [emailHistory, setEmailHistory] = useState<SurveyEmailHistoryItem[]>([]);
  const [emailHistoryBusy, setEmailHistoryBusy] = useState(false);
  const [emailImportBusy, setEmailImportBusy] = useState(false);
  const [emailBatchStart, setEmailBatchStart] = useState(0);
  const [emailBodyMenu, setEmailBodyMenu] = useState<{ x: number; y: number } | null>(null);
  const emailBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [recipientText, setRecipientText] = useState("");
  const [emailLink, setEmailLink] = useState("");
  const [emailSubject, setEmailSubject] = useState("Khao sat nhu cau dao tao Cua hang truong CHXD Petrolimex 2026");
  const [emailBody, setEmailBody] = useState(() => buildDefaultSurveyEmailBody(surveyType));
  const practiceVideoSettingsRef = useRef<HTMLDivElement | null>(null);
  const [smtpConfig, setSmtpConfig] = useState<SurveyEmailSmtpConfig>({
    fromName: "PeopleOne",
    fromEmail: "info@peopleone.com.vn",
    host: "smtp.office365.com",
    port: "587",
    user: "info@peopleone.com.vn",
    pass: "",
    secure: false,
    requireTLS: true,
  });

  const activeForm = forms.find((item) => item.id === activeFormId) || forms[0] || null;
  const activeFormIsLocalDemo = isAiPowerPracticeLocalForm(activeForm);
  const activeSurveyType = activeForm?.settings.surveyType || settings.surveyType || surveyType;
  const baseQuestions = useMemo(() => getStudentSurveyQuestions(activeSurveyType), [activeSurveyType]);
  const baseJourneys = useMemo(() => getJourneyDefinitions(activeSurveyType), [activeSurveyType]);
  const filteredForms = useMemo(() => {
    const keyword = formKeyword.trim().toLowerCase();
    return forms.filter((form) => {
      if (formStatusFilter !== "all" && form.status !== formStatusFilter) return false;
      if (!keyword) return true;
      return [form.id, form.title, form.intro, form.settings.contractSourceName || ""].some((value) => String(value || "").toLowerCase().includes(keyword));
    });
  }, [formKeyword, formStatusFilter, forms]);
  const questions = activeForm?.settings.customQuestions?.length ? activeForm.settings.customQuestions : settings.customQuestions?.length ? settings.customQuestions : baseQuestions;
  const JOURNEYS = activeForm?.settings.customSections?.length ? activeForm.settings.customSections : settings.customSections?.length ? settings.customSections : baseJourneys;
  const editableQuestions = settings.customQuestions?.length ? settings.customQuestions : questions;
  const editableSections = settings.customSections?.length ? settings.customSections : JOURNEYS;
  const selectedSubmission = submissions.find((item) => item.id === selectedSubmissionId) || submissions[0] || null;
  const ratingQuestions = questions.filter((question) => question.type === "rating");
  const shareLink = activeForm ? resolveStudentSurveyShareLink(activeForm) : "";
  const activeFormIsActive = activeForm?.status === "active";
  const detailRows = selectedSubmission ? buildSubmissionDetailRows(questions, selectedSubmission) : [];
  const exportJourney = JOURNEYS.find((journey) => journey.id === journeyExportFilter) || null;
  const exportQuestions =
    journeyExportFilter === "all" ? questions : questions.filter((question) => question.sectionId === journeyExportFilter);
  const exportSubmissions =
    journeyExportFilter === "all" ? submissions : filterSubmissionAnswersByQuestions(submissions, exportQuestions);
  const extraQuestions = questions.filter((question) => question.sectionId === "extra");
  const extraSubmissions = filterSubmissionAnswersByQuestions(submissions, extraQuestions);
  const analyticsRows = analyticsFormId === activeForm?.id && analyticsSubmissions.length ? analyticsSubmissions : submissions;
  const analyticsRowsAreComplete = Boolean(activeForm?.id && analyticsFormId === activeForm.id && analyticsSubmissions.length >= submissionTotal);
  const exportFileBase = activeForm
    ? [activeForm.id, exportJourney ? `${exportJourney.id}-${slugifyFilenamePart(exportJourney.title)}` : null, "survey"]
        .filter(Boolean)
        .join("-")
    : "student-survey";
  const extraExportFileBase = activeForm ? `${activeForm.id}-extra-survey` : "student-survey-extra";
  const emailRecipients = useMemo(() => parseSurveyEmailRecipients(recipientText), [recipientText]);
  const nextEmailBatch = emailRecipients.slice(emailBatchStart, emailBatchStart + 100);
  const submissionPageCount = Math.max(1, Math.ceil(submissionTotal / SURVEY_SUBMISSION_PAGE_SIZE));

  const analyticsByJourney = useMemo(
    () =>
      JOURNEYS.map((journey) => ({
        journey,
        ratingQuestions: ratingQuestions.filter((question) => question.sectionId === journey.id).slice(0, 10),
      })).filter((item) => item.ratingQuestions.length),
    [JOURNEYS, ratingQuestions],
  );

  const detailByJourney = useMemo(
    () =>
      JOURNEYS.map((journey) => ({
        journey,
        rows: detailRows.filter((row) => row.sectionId === journey.id),
      })).filter((item) => item.rows.length),
    [JOURNEYS, detailRows],
  );

  useEffect(() => {
    void loadForms();
  }, []);

  useEffect(() => {
    if (mainScreen !== "email") return;
    void loadEmailHistory();
  }, [mainScreen, activeFormId, surveyType]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SURVEY_EMAIL_SMTP_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<SurveyEmailSmtpConfig>;
      setSmtpConfig((current) => ({
        ...current,
        ...parsed,
        secure: Boolean(parsed.secure),
        requireTLS: parsed.requireTLS !== false,
      }));
    } catch {
      // Ignore local config parse errors; user can save a fresh config.
    }
  }, []);

  useEffect(() => {
    if (!activeForm) return;
    setFormTitle(activeForm.title);
    setFormCode(activeForm.id);
    setIntro(activeForm.intro);
    setSettings({
      ...activeForm.settings,
      surveyType: activeForm.settings.surveyType || surveyType,
      templateVariant: activeForm.settings.templateVariant || templateVariant,
    });
    setSubmissionPage(1);
    setAnalyticsSubmissions([]);
    setAnalyticsFormId("");
    void loadSubmissions(activeForm.id, 1);
  }, [activeFormId, forms]);

  useEffect(() => {
    if (resultsScreen !== "analytics" || !activeForm || !submissionTotal) return;
    if (analyticsFormId === activeForm.id && analyticsSubmissions.length >= submissionTotal) return;
    void loadAnalyticsSubmissions(activeForm.id);
  }, [resultsScreen, activeForm?.id, submissionTotal, analyticsFormId, analyticsSubmissions.length]);

  async function loadForms(preferredFormId?: string) {
    setLoading(true);
    setErrorMessage("");
    try {
      const allForms = await listStudentSurveyForms();
      let nextForms = filterSurveyFormsForView(allForms, { includeAllSurveyTypes, surveyType, templateVariant });
      if (forceLocalAiPowerPracticeDemo) {
        nextForms = [buildAiPowerPracticeLocalForm(getDefaultStudentSurveyDisplaySettings(surveyType))];
      }
      setForms(nextForms);
      if (nextForms.length) {
        const persistedFormIds = nextForms.filter((form) => !isAiPowerPracticeLocalForm(form)).map((form) => form.id);
        const nextCounts: Record<string, number> = persistedFormIds.length ? await countStudentSurveySubmissionsByFormIds(persistedFormIds) : {};
        const localForm = nextForms.find((form) => isAiPowerPracticeLocalForm(form));
        if (localForm) nextCounts[localForm.id] = buildAiPowerPracticeLocalSubmissions().length;
        setFormSubmissionCounts(nextCounts);
      } else {
        setFormSubmissionCounts({});
      }
      setActiveFormId(preferredFormId || nextForms[0]?.id || "");
      if (!nextForms.length) {
        setFormTitle(defaultFormTitle || surveyDefinition.defaultFormTitle);
        setFormCode(defaultFormCode || surveyDefinition.defaultFormCode);
        setIntro(surveyDefinition.defaultIntro);
        setSettings({ ...getDefaultStudentSurveyDisplaySettings(surveyType), surveyType, templateVariant });
        setSubmissions([]);
        setSubmissionTotal(0);
        setSubmissionPage(1);
        setSelectedSubmissionId("");
        setResultsScreen("menu");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không tải được danh sách form khảo sát.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSubmissions(formId: string, page = submissionPage) {
    setBusy(true);
    setErrorMessage("");
    try {
      const localForm = forms.find((form) => form.id === formId && isAiPowerPracticeLocalForm(form));
      if (localForm) {
        const allRows = buildAiPowerPracticeLocalSubmissions();
        const offset = Math.max(0, page - 1) * SURVEY_SUBMISSION_PAGE_SIZE;
        const rows = allRows.slice(offset, offset + SURVEY_SUBMISSION_PAGE_SIZE);
        setSubmissions(rows);
        setAnalyticsSubmissions(allRows);
        setAnalyticsFormId(formId);
        setSubmissionTotal(allRows.length);
        setSubmissionPage(page);
        setSelectedSubmissionId(rows[0]?.id || "");
        setSelectedSubmissionIds([]);
        setResultsScreen("menu");
        return;
      }
      const nextSubmissions = await listStudentSurveySubmissionsPage({ formId, page, pageSize: SURVEY_SUBMISSION_PAGE_SIZE });
      setSubmissions(nextSubmissions.rows);
      setSubmissionTotal(nextSubmissions.total);
      setSubmissionPage(nextSubmissions.page);
      setSelectedSubmissionId(nextSubmissions.rows[0]?.id || "");
      setSelectedSubmissionIds([]);
      setResultsScreen("menu");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không tải được kết quả khảo sát.");
      setSubmissions([]);
      setSubmissionTotal(0);
      setSubmissionPage(1);
      setSelectedSubmissionId("");
      setSelectedSubmissionIds([]);
      setResultsScreen("menu");
    } finally {
      setBusy(false);
    }
  }

  async function loadAnalyticsSubmissions(formId: string) {
    setAnalyticsBusy(true);
    setErrorMessage("");
    try {
      const localForm = forms.find((form) => form.id === formId && isAiPowerPracticeLocalForm(form));
      if (localForm) {
        const rows = buildAiPowerPracticeLocalSubmissions();
        setAnalyticsSubmissions(rows);
        setAnalyticsFormId(formId);
        return;
      }
      const rows = await listStudentSurveySubmissions(formId);
      setAnalyticsSubmissions(rows);
      setAnalyticsFormId(formId);
    } catch (error) {
      setAnalyticsSubmissions([]);
      setAnalyticsFormId("");
      setErrorMessage(error instanceof Error ? error.message : "Khong tai duoc du lieu thong ke tong hop.");
    } finally {
      setAnalyticsBusy(false);
    }
  }

  async function handleCreateForm() {
    setBusy(true);
    setErrorMessage("");
    try {
      const displayIntroBody = settings.introBody.trim() || intro.trim();
      const nextForm = await createStudentSurveyForm({
        id: formCode,
        title: formTitle,
        intro: displayIntroBody,
        settings: { ...settings, introBody: displayIntroBody, surveyType: settings.surveyType || surveyType, templateVariant: settings.templateVariant || templateVariant },
      });
      await loadForms(nextForm.id);
      setCopyState("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không tạo được link khảo sát.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveActiveForm() {
    if (!activeForm) return;
    setBusy(true);
    setErrorMessage("");
    try {
      if (settings.templateVariant === "ai-power-practice") {
        const invalidVideoIndex = (settings.practiceGuideVideoUrls || []).findIndex((videoUrl) => !isSupportedPracticeVideoUrl(videoUrl));
        if (invalidVideoIndex >= 0) {
          throw new Error(`Link video tình huống ${invalidVideoIndex + 1} chưa hợp lệ. Hãy dùng link Vimeo hoặc file MP4/WebM qua HTTPS.`);
        }
      }
      const currentIntro = activeForm.intro || "";
      const currentIntroBody = activeForm.settings?.introBody || "";
      const introChanged = intro !== currentIntro;
      const introBodyChanged = settings.introBody !== currentIntroBody;
      const displayIntroBody = (introBodyChanged ? settings.introBody : introChanged ? intro : settings.introBody || intro).trim();
      if (activeFormIsLocalDemo) {
        const nextForm: StudentSurveyForm = {
          ...activeForm,
          title: formTitle,
          intro: displayIntroBody,
          settings: {
            ...settings,
            introBody: displayIntroBody,
            surveyType: "ql01a-ai-dien-luc-4-ung-dung",
            templateVariant: "ai-power-practice",
            contractSourceName: activeForm.settings.contractSourceName,
          },
        };
        saveAiPowerPracticeLocalForm(nextForm);
        setForms((current) => current.map((form) => (form.id === nextForm.id ? nextForm : form)));
        setCopyState("Đã lưu bản chỉnh sửa cục bộ trên trình duyệt này");
        window.setTimeout(() => setCopyState(""), 2200);
        return;
      }
      await updateStudentSurveyFormDetails(activeForm.id, {
        title: formTitle,
        intro: displayIntroBody,
        settings: { ...settings, introBody: displayIntroBody, surveyType: settings.surveyType || surveyType, templateVariant: settings.templateVariant || templateVariant },
      });
      await loadForms(activeForm.id);
      setCopyState("Đã lưu nội dung hiển thị");
      window.setTimeout(() => setCopyState(""), 1800);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không lưu được cấu hình hiển thị.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImportSurveyTemplateFile(file: File | null) {
    if (!file) return;
    setTemplateImportBusy(true);
    setTemplateImportNotice("");
    setErrorMessage("");
    try {
      const lowerName = file.name.toLowerCase();
      let contractDraft: SurveyContractDraft | null = null;
      if (lowerName.endsWith(".json")) {
        const parsed = applySurveyTemplateJson(JSON.parse(await file.text()));
        if (!parsed) throw new Error("File JSON không đúng cấu trúc mẫu khảo sát.");
        contractDraft =
          parsed.settings.customQuestions?.length && parsed.settings.customSections?.length
            ? {
                id: parsed.id || contractIdFromFileName(file.name),
                title: parsed.title || String(parsed.settings.bannerTitle || parsed.settings.browserTitle || stripFileExtension(file.name)),
                intro: parsed.intro || parsed.settings.introBody || "",
                sections: parsed.settings.customSections,
                questions: parsed.settings.customQuestions,
                settings: parsed.settings,
              }
            : null;
        if (!contractDraft) {
          const nextIntro = parsed.intro || parsed.settings.introBody || "";
          setFormTitle(parsed.title || formTitle);
          if (parsed.id) setFormCode(sanitizeStudentSurveyFormId(parsed.id));
          setIntro(nextIntro);
          setSettings({
            ...settings,
            ...parsed.settings,
            introBody: nextIntro || parsed.settings.introBody || settings.introBody,
            surveyType: parsed.settings.surveyType || settings.surveyType || surveyType,
            templateVariant: parsed.settings.templateVariant || settings.templateVariant || templateVariant,
          });
          setTemplateImportNotice("Đã nạp metadata JSON. File chưa có contract câu hỏi.");
          return;
        }
      } else if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
        contractDraft = parseSurveyContractWorkbook(file.name, await file.arrayBuffer());
      } else {
        const text = lowerName.endsWith(".docx") ? await docxToPlainText(file) : await file.text();
        contractDraft = parseSurveyContractFromText(text, file.name);
      }
      if (!contractDraft.questions.length) {
        const draft = buildSurveyTemplateDraft("", file.name);
        throw new Error(`Không nhận diện được câu hỏi trong file ${draft.id || file.name}.`);
      }
      setFormTitle(contractDraft.title || formTitle);
      if (contractDraft.id) setFormCode(contractDraft.id);
      setIntro(contractDraft.intro);
      setSettings({
        ...settings,
        ...contractDraft.settings,
        introBody: contractDraft.settings.introBody || contractDraft.intro || settings.introBody,
        customSections: contractDraft.sections,
        customQuestions: contractDraft.questions,
        contractVersion: "v1",
        contractSourceName: file.name,
        surveyType: contractDraft.settings.surveyType || settings.surveyType || surveyType,
        templateVariant: contractDraft.settings.templateVariant || settings.templateVariant || templateVariant,
      });
      setTemplateImportNotice(`Đã nạp contract: ${contractDraft.sections.length} phần, ${contractDraft.questions.length} câu hỏi. Rà lại trước khi tạo link.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không import được mẫu khảo sát.");
    } finally {
      setTemplateImportBusy(false);
    }
  }

  function handleEditForm(form: StudentSurveyForm) {
    setActiveFormId(form.id);
    setMainScreen("edit");
    setCopyState(`Đang chỉnh ${form.id}`);
    window.setTimeout(() => setCopyState(""), 1800);
  }

  function handleEditPracticeVideoSettings(form: StudentSurveyForm) {
    setActiveFormId(form.id);
    setMainScreen("edit");
    setCopyState("Đang mở phần Video Vimeo");
    window.setTimeout(() => {
      practiceVideoSettingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    window.setTimeout(() => setCopyState(""), 1800);
  }

  function updateSurveySection(sectionId: string, patch: Partial<{ title: string; description: string }>) {
    const currentSections = settings.customSections?.length ? settings.customSections : editableSections;
    setSettings({
      ...settings,
      customSections: currentSections.map((section) => (section.id === sectionId ? { ...section, ...patch } : section)),
    });
  }

  function updatePracticeGuideVideoUrl(applicationIndex: number, value: string) {
    const nextUrls = Array.from({ length: 4 }, (_, index) => settings.practiceGuideVideoUrls?.[index] || "");
    nextUrls[applicationIndex - 1] = value;
    setSettings({ ...settings, practiceGuideVideoUrls: nextUrls });
  }

  function updateSurveyQuestion(questionId: string, patch: Partial<StudentSurveyQuestion>) {
    const currentQuestions = settings.customQuestions?.length ? settings.customQuestions : editableQuestions;
    setSettings({
      ...settings,
      customQuestions: currentQuestions.map((question) => (question.id === questionId ? { ...question, ...patch } : question)),
    });
  }

  function handleOpenFormResults(form: StudentSurveyForm) {
    setActiveFormId(form.id);
    setMainScreen("results");
    setResultsScreen("menu");
    void loadSubmissions(form.id, 1);
  }

  async function handleDuplicateForm(form: StudentSurveyForm) {
    const defaults = suggestStudentSurveyDuplicateDefaults(form, forms);
    const requestedId = window.prompt("Mã khảo sát mới", defaults.id);
    if (requestedId == null) return;
    const nextId = sanitizeStudentSurveyFormId(requestedId);
    if (!nextId) {
      setErrorMessage("Mã khảo sát mới không hợp lệ.");
      return;
    }
    if (forms.some((item) => item.id === nextId)) {
      setErrorMessage(`Mã khảo sát ${nextId} đã tồn tại.`);
      return;
    }

    const requestedTitle = window.prompt("Tên khảo sát mới", defaults.title);
    if (requestedTitle == null) return;
    const nextTitle = requestedTitle.trim();
    if (!nextTitle) {
      setErrorMessage("Tên khảo sát mới không được để trống.");
      return;
    }

    const requestedSubtitle = window.prompt("Dòng phụ banner", defaults.bannerSubtitle);
    if (requestedSubtitle == null) return;
    const nextSubtitle = requestedSubtitle.trim() || defaults.bannerSubtitle;

    setBusy(true);
    setErrorMessage("");
    try {
      const nextForm = await createStudentSurveyForm(buildStudentSurveyDuplicateInput(form, {
        id: nextId,
        title: nextTitle,
        bannerSubtitle: nextSubtitle,
      }));
      await loadForms(nextForm.id);
      setMainScreen("edit");
      setCopyState(`Đã nhân bản ${form.id} thành ${nextForm.id}`);
      window.setTimeout(() => setCopyState(""), 2200);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không nhân bản được khảo sát.");
    } finally {
      setBusy(false);
    }
  }

  function handleDownloadCurrentContract() {
    const draft: SurveyContractDraft = {
      id: sanitizeStudentSurveyFormId(formCode || activeForm?.id || "v-survey-contract"),
      title: formTitle || activeForm?.title || "V-survey contract",
      intro: settings.introBody || intro || "",
      sections: settings.customSections?.length ? settings.customSections : JOURNEYS,
      questions: settings.customQuestions?.length ? settings.customQuestions : questions,
      settings: {
        ...settings,
        customSections: settings.customSections?.length ? settings.customSections : JOURNEYS,
        customQuestions: settings.customQuestions?.length ? settings.customQuestions : questions,
      },
    };
    downloadArrayBuffer(`${draft.id || "v-survey-contract"}.contract.xlsx`, buildSurveyContractWorkbook(draft), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  async function handleDeleteForm(form: StudentSurveyForm) {
    const confirmMessage = `Xóa khảo sát ${form.id}? Tất cả phản hồi của form này cũng sẽ bị xóa theo.`;
    if (!window.confirm(confirmMessage)) return;
    setBusy(true);
    setErrorMessage("");
    try {
      await deleteStudentSurveyForm(form.id);
      await loadForms(activeFormId === form.id ? undefined : activeFormId);
      setCopyState("Đã xóa khảo sát");
      window.setTimeout(() => setCopyState(""), 1800);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không xóa được khảo sát.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteFormSubmissions(form: StudentSurveyForm) {
    if (isAiPowerPracticeLocalForm(form)) {
      setErrorMessage("Bản demo cục bộ không xóa dữ liệu mẫu từ màn quản trị.");
      return;
    }
    const knownCount = formSubmissionCounts[form.id] || 0;
    const confirmMessage = knownCount
      ? `Xóa toàn bộ ${knownCount} phản hồi/checkpoint của phiếu ${form.id}? Cấu hình phiếu và link public vẫn được giữ nguyên.`
      : `Xóa toàn bộ phản hồi/checkpoint của phiếu ${form.id}? Cấu hình phiếu và link public vẫn được giữ nguyên.`;
    if (!window.confirm(confirmMessage)) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const rows = await listAllStudentSurveySubmissions(form.id);
      for (const row of rows) {
        await deleteStudentSurveySubmission(row.id);
      }
      setFormSubmissionCounts((current) => ({ ...current, [form.id]: 0 }));
      if (activeFormId === form.id) {
        setSubmissions([]);
        setAnalyticsSubmissions([]);
        setAnalyticsFormId("");
        setSubmissionTotal(0);
        setSubmissionPage(1);
        setSelectedSubmissionId("");
        setSelectedSubmissionIds([]);
      }
      setCopyState(`Đã xóa ${rows.length} phản hồi/checkpoint`);
      window.setTimeout(() => setCopyState(""), 1800);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không xóa được phản hồi của phiếu.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleFormStatus(form: StudentSurveyForm) {
    setBusy(true);
    setErrorMessage("");
    try {
      await updateStudentSurveyFormStatus(form.id, form.status === "active" ? "paused" : "active");
      await loadForms(form.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không cập nhật được trạng thái link.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyLink() {
    if (!shareLink || !activeFormIsActive) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopyState("Đã copy link public");
      window.setTimeout(() => setCopyState(""), 1800);
    } catch {
      setCopyState("Không copy được, hãy copy thủ công");
    }
  }

  async function handleCopyFormLink(form: StudentSurveyForm) {
    if (form.status !== "active") return;
    try {
      await navigator.clipboard.writeText(resolveStudentSurveyShareLink(form));
      setCopyState(`Đã copy link ${form.id}`);
      window.setTimeout(() => setCopyState(""), 1800);
    } catch {
      setCopyState("Không copy được, hãy mở form để copy thủ công");
    }
  }

  async function handleDeleteSelectedSubmission() {
    if (!activeForm || !selectedSubmission) return;
    if (!window.confirm("Xóa phản hồi đang chọn? Hành động này không thể hoàn tác.")) return;
    setBusy(true);
    setErrorMessage("");
    try {
      await deleteStudentSurveySubmission(selectedSubmission.id);
      await loadSubmissions(activeForm.id, submissionPage);
      setCopyState("Đã xóa phản hồi");
      window.setTimeout(() => setCopyState(""), 1800);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không xóa được phản hồi.");
    } finally {
      setBusy(false);
    }
  }

  function toggleSubmissionSelection(submissionId: string) {
    setSelectedSubmissionIds((current) => (current.includes(submissionId) ? current.filter((id) => id !== submissionId) : [...current, submissionId]));
  }

  function selectCurrentSubmissionPage() {
    setSelectedSubmissionIds(submissions.map((item) => item.id));
  }

  async function handleDeleteSelectedSubmissions() {
    if (!activeForm || !selectedSubmissionIds.length) return;
    if (!window.confirm(`Xóa ${selectedSubmissionIds.length} kết quả khảo sát đã chọn? Hành động này không thể hoàn tác.`)) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const deletedCount = selectedSubmissionIds.length;
      await Promise.all(selectedSubmissionIds.map((submissionId) => deleteStudentSurveySubmission(submissionId)));
      await loadSubmissions(activeForm.id, submissionPage);
      setCopyState(`Đã xóa ${deletedCount} kết quả khảo sát`);
      window.setTimeout(() => setCopyState(""), 1800);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không xóa được các kết quả đã chọn.");
    } finally {
      setBusy(false);
    }
  }

  function openSubmissionDetail(submissionId: string) {
    setSelectedSubmissionId(submissionId);
    setResultsScreen("detail");
  }

  function getSubmissionExportBaseName(submission: StudentSurveySubmission) {
    const unitName = safeText(submission.respondent.unitName, "");
    return slugifyFilenamePart(unitName) || submission.id;
  }

  function downloadSingleSubmissionWorkbook(submission: StudentSurveySubmission) {
    downloadArrayBuffer(
      `${getSubmissionExportBaseName(submission)}.xlsx`,
      exportSingleStudentSurveySubmissionToWorkbook(submission, questions),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  }

  async function getExportRows() {
    if (!activeForm) return [];
    if (submissionTotal <= submissions.length) return submissions;
    setBusy(true);
    try {
      return await listStudentSurveySubmissions(activeForm.id);
    } finally {
      setBusy(false);
    }
  }

  async function downloadSurveyCsv(filename: string, rows: StudentSurveySubmission[], rowQuestions: StudentSurveyQuestion[]) {
    downloadTextFile(filename, exportStudentSurveyToCsv(rows, rowQuestions), "text/csv;charset=utf-8");
  }

  async function downloadSurveyWorkbook(filename: string, rows: StudentSurveySubmission[], rowQuestions: StudentSurveyQuestion[]) {
    downloadArrayBuffer(filename, exportStudentSurveyToWorkbook(rows, rowQuestions), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  async function downloadSurveyReportWorkbook(filename: string, rows: StudentSurveySubmission[], rowQuestions: StudentSurveyQuestion[]) {
    if (!activeForm) return;
    downloadArrayBuffer(
      filename,
      buildStudentSurveyReportWorkbook({ form: activeForm, questions: rowQuestions, submissions: rows }),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  }

  async function downloadSurveyJson(filename: string, rows: StudentSurveySubmission[]) {
    downloadTextFile(filename, JSON.stringify(normalizeExportValue(rows), null, 2), "application/json;charset=utf-8");
  }

  function updateSmtpConfig(patch: Partial<SurveyEmailSmtpConfig>) {
    setSmtpConfig((current) => ({ ...current, ...patch }));
  }

  function handleSaveSmtpConfig() {
    try {
      localStorage.setItem(SURVEY_EMAIL_SMTP_STORAGE_KEY, JSON.stringify(smtpConfig));
      setEmailNotice("Da luu cau hinh SMTP tren trinh duyet nay.");
    } catch {
      setEmailNotice("Không lưu được cấu hình SMTP trên trình duyệt.");
    }
  }

  function handleClearSmtpConfig() {
    localStorage.removeItem(SURVEY_EMAIL_SMTP_STORAGE_KEY);
    setSmtpConfig((current) => ({ ...current, pass: "" }));
    setEmailNotice("Da xoa password/cau hinh SMTP da luu tren trinh duyet.");
  }

  async function handleUseSubmissionEmails() {
    const rows = activeForm ? await getExportRows() : submissions;
    const nextText = buildRecipientTextFromSubmissions(rows);
    setRecipientText(nextText);
    setEmailBatchStart(0);
    setEmailNotice(nextText ? "Đã lấy email từ danh sách phản hồi hiện tại." : "Chưa có email trong danh sách phản hồi.");
  }

  async function loadEmailHistory() {
    setEmailHistoryBusy(true);
    try {
      const history = await listSurveyEmailHistory({
        surveyType,
        formId: activeForm?.id,
        limit: 20,
      });
      setEmailHistory(history);
    } catch (error) {
      setEmailNotice(error instanceof Error ? error.message : "Không tải được lịch sử gửi email.");
    } finally {
      setEmailHistoryBusy(false);
    }
  }

  async function saveCurrentEmailHistory(result: Awaited<ReturnType<typeof dispatchSurveyEmails>>, recipients: ReturnType<typeof parseSurveyEmailRecipients>, usedRecipientText: string) {
    try {
      const saved = await saveSurveyEmailHistory({
        formId: activeForm?.id || null,
        surveyType,
        subject: emailSubject,
        body: emailBody,
        shareLink: emailLink.trim() || shareLink,
        recipientText: usedRecipientText,
        recipients,
        result,
        smtp: smtpConfig,
      });
      setEmailHistory((current) => [saved, ...current.filter((item) => item.id !== saved.id)].slice(0, 20));
      return true;
    } catch (error) {
      setEmailNotice((current) => `${current} Không lưu được lịch sử: ${error instanceof Error ? error.message : "lỗi không rõ"}`);
      return false;
    }
  }

  function applyEmailHistory(item: SurveyEmailHistoryItem) {
    setEmailSubject(item.subject);
    setEmailBody(item.body);
    setEmailLink(item.shareLink);
    setRecipientText(item.recipientText);
    setEmailBatchStart(0);
    setEmailNotice(`Da nap lai noi dung va ${item.recipients.length || parseSurveyEmailRecipients(item.recipientText).length} nguoi nhan tu lich su ${formatTimestamp(item.createdAt)}.`);
  }

  async function handleSendSurveyEmailTest() {
    if (!testEmail.trim()) {
      setEmailNotice("Nhap email test truoc khi gui.");
      return;
    }
    setEmailBusy(true);
    setEmailNotice("");
    try {
      const result = await dispatchSurveyEmails({
        smtp: smtpConfig,
        recipients: [{ email: testEmail.trim(), name: "Test", unit: "PeopleOne" }],
        subject: emailSubject,
        body: emailBody,
        shareLink: emailLink.trim() || shareLink,
      });
      const firstResult = result.results[0];
      setEmailNotice(
        result.failed
          ? `Gửi test lỗi: ${firstResult?.error || "Không rõ lỗi"}`
          : `Da gui email test. MessageId: ${firstResult?.messageId || "khong co"}. SMTP: ${firstResult?.response || "accepted"}`,
      );
    } catch (error) {
      setEmailNotice(error instanceof Error ? error.message : "Không gửi được email test.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleSendSurveyEmailBatch() {
    if (!nextEmailBatch.length) {
      setEmailNotice("Không có người nhận hợp lệ trong lô tiếp theo.");
      return;
    }
    if (!window.confirm(`Gửi ${nextEmailBatch.length} email trong lô này?`)) return;
    setEmailBusy(true);
    setEmailNotice("");
    try {
      const usedBatch = nextEmailBatch;
      const usedRecipientText = usedBatch.map((item) => [item.email, item.name || "", item.unit || ""].join(", ")).join("\n");
      const result = await dispatchSurveyEmails({
        smtp: smtpConfig,
        recipients: usedBatch,
        subject: emailSubject,
        body: emailBody,
        shareLink: emailLink.trim() || shareLink,
        delayMs: 250,
      });
      setEmailBatchStart((current) => Math.min(current + nextEmailBatch.length, emailRecipients.length));
      const firstSent = result.results.find((item) => item.status === "sent");
      const firstFailed = result.results.find((item) => item.status === "failed");
      setEmailNotice(
        `Đã gửi xong lô: ${result.sent} thành công, ${result.failed} lỗi.` +
          (firstSent ? ` MessageId dau tien: ${firstSent.messageId || "khong co"}. SMTP: ${firstSent.response || "accepted"}.` : "") +
          (firstFailed ? ` Lỗi đầu tiên: ${firstFailed.email} - ${firstFailed.error || "không rõ lỗi"}.` : ""),
      );
      await saveCurrentEmailHistory(result, usedBatch, usedRecipientText);
    } catch (error) {
      setEmailNotice(error instanceof Error ? error.message : "Không gửi được lô email.");
    } finally {
      setEmailBusy(false);
    }
  }

  function insertEmailBodyLink() {
    const textarea = emailBodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? emailBody.length;
    const end = textarea.selectionEnd ?? start;
    const selectedText = emailBody.slice(start, end);
    const url = window.prompt("Nhap URL link", "{{link}}");
    if (!url) {
      setEmailBodyMenu(null);
      return;
    }
    const label = selectedText || window.prompt("Nhap chu hien thi", "Mo phieu khao sat PLX 2026") || url;
    const linkHtml = `<a href="${url.replace(/"/g, "&quot;")}">${label.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</a>`;
    setEmailBody(`${emailBody.slice(0, start)}${linkHtml}${emailBody.slice(end)}`);
    setEmailBodyMenu(null);
    window.setTimeout(() => textarea.focus(), 0);
  }

  function wrapEmailBodySelection(prefix: string, suffix = prefix) {
    const textarea = emailBodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? emailBody.length;
    const end = textarea.selectionEnd ?? start;
    const selectedText = emailBody.slice(start, end);
    const fallbackText = selectedText || "chu in dam";
    const nextValue = `${emailBody.slice(0, start)}${prefix}${fallbackText}${suffix}${emailBody.slice(end)}`;
    setEmailBody(nextValue);
    setEmailBodyMenu(null);
    window.setTimeout(() => {
      textarea.focus();
      if (selectedText) {
        textarea.setSelectionRange(start, start + prefix.length + selectedText.length + suffix.length);
      } else {
        textarea.setSelectionRange(start + prefix.length, start + prefix.length + fallbackText.length);
      }
    }, 0);
  }

  function replaceEmailBodySelection(value: string) {
    const textarea = emailBodyRef.current;
    const insertText = compactEmailMarkup(value);
    if (!textarea || !insertText) return;
    const start = textarea.selectionStart ?? emailBody.length;
    const end = textarea.selectionEnd ?? start;
    setEmailBody(`${emailBody.slice(0, start)}${insertText}${emailBody.slice(end)}`);
    window.setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertText.length, start + insertText.length);
    }, 0);
  }

  function handleEmailBodyPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    const converted = html ? htmlToEmailMarkup(html) : compactEmailMarkup(text);
    if (!converted) return;
    event.preventDefault();
    replaceEmailBodySelection(converted);
    setEmailNotice("Da tu chuyen dinh dang paste: chu dam, link va xuong dong.");
  }

  async function handleImportEmailBodyFile(file: File | null) {
    if (!file) return;
    setEmailImportBusy(true);
    setEmailNotice("");
    try {
      const lowerName = file.name.toLowerCase();
      let nextBody = "";
      if (lowerName.endsWith(".docx")) {
        nextBody = await docxToEmailMarkup(file);
      } else if (lowerName.endsWith(".html") || lowerName.endsWith(".htm")) {
        nextBody = htmlToEmailMarkup(await file.text());
      } else {
        nextBody = await file.text();
      }
      const cleanBody = compactEmailMarkup(nextBody);
      if (!cleanBody) throw new Error("File khong co noi dung hop le.");
      setEmailBody(cleanBody);
      setEmailNotice("Da import noi dung email va tu chuyen dinh dang in dam/link neu co.");
    } catch (error) {
      setEmailNotice(error instanceof Error ? error.message : "Không import được nội dung email.");
    } finally {
      setEmailImportBusy(false);
    }
  }

  return (
    <>
      <SectionHeader eye="Hệ thống" title={pageTitle} subtitle={pageSubtitle} />

      <section className="vsurvey-brand-panel" aria-label="V-survey">
        <div className="vsurvey-brand-lockup">
          <span className="vsurvey-brand-logo" aria-hidden="true">
            <img src="/vinabrain-logo-transparent.png" alt="" />
          </span>
          <div>
            <strong>V-survey</strong>
            <span>Quản lý khảo sát, phát hành link và tổng hợp kết quả trong hệ sinh thái Vinabrain.</span>
          </div>
        </div>
      </section>

      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

      <section className="lecturer-bank-shell student-survey-results-shell">
        <div className="vsurvey-module-layout">
          <aside className="vsurvey-sidebar" aria-label="Điều hướng V-survey">
            <button className={mainScreen === "create" ? "is-active" : ""} type="button" onClick={() => setMainScreen("create")}>
              Khởi tạo khảo sát
            </button>
            <button className={mainScreen === "list" ? "is-active" : ""} type="button" onClick={() => setMainScreen("list")}>
              Danh sách khảo sát
            </button>
            <button className={mainScreen === "email" ? "is-active" : ""} type="button" onClick={() => setMainScreen("email")}>
              Gửi email khảo sát
            </button>
            {mainScreen === "results" ? (
              <button className="is-active is-subscreen" type="button" onClick={() => setMainScreen("results")}>
                Kết quả khảo sát
              </button>
            ) : null}
            {mainScreen === "edit" ? (
              <button className="is-active is-subscreen" type="button" onClick={() => setMainScreen("edit")}>
                Chỉnh sửa khảo sát
              </button>
            ) : null}
          </aside>
          <div className="vsurvey-module-main">

        {mainScreen === "create" ? (
        <>
        <div className="lecturer-bank-management-grid">
          <Card title="Tạo link khảo sát mới">
            <div className="stack compact">
              <div className="muted-text">Dùng khối này chỉ khi cần tạo thêm phiếu mới. Muốn sửa phiếu hiện có, chọn phiếu trong danh sách rồi dùng khối chỉnh bên phải.</div>
              <div className="vsurvey-import-strip">
                <label className="btn btn-ghost btn-small" title="Import file mẫu khảo sát">
                  <Upload size={16} aria-hidden="true" />
                  {templateImportBusy ? "Đang import..." : "Import mẫu"}
                  <input
                    type="file"
                    accept=".docx,.xlsx,.xls,.txt,.md,.json,.html,.htm,text/plain,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    style={{ display: "none" }}
                    disabled={templateImportBusy}
                    onChange={(event) => {
                      void handleImportSurveyTemplateFile(event.target.files?.[0] || null);
                      event.target.value = "";
                    }}
                  />
                </label>
                <button className="btn btn-ghost btn-small" type="button" onClick={handleDownloadCurrentContract}>
                  Tải contract XLSX
                </button>
                {templateImportNotice ? <span className="muted-text">{templateImportNotice}</span> : null}
              </div>
              <label className="lecturer-bank-inline-field">
                <span>Tiêu đề quản trị</span>
                <input value={formTitle} onChange={(event) => setFormTitle(event.target.value)} />
              </label>
              <label className="lecturer-bank-inline-field">
                <span>Mã link</span>
                <input value={formCode} onChange={(event) => setFormCode(sanitizeStudentSurveyFormId(event.target.value))} placeholder="Ví dụ: evnspc-dot-1" />
              </label>
              <label className="lecturer-bank-inline-field">
                <span>Mô tả</span>
                <textarea rows={3} value={intro} onChange={(event) => setIntro(event.target.value)} />
              </label>
              <div className="form-grid storyboard-form-grid">
                <label>
                  <span>Bắt buộc họ tên</span>
                  <select value={settings.requireRespondentName ? "yes" : "no"} onChange={(event) => setSettings({ ...settings, requireRespondentName: event.target.value === "yes" })}>
                    <option value="no">Không bắt buộc</option>
                    <option value="yes">Bắt buộc nhập</option>
                  </select>
                </label>
                <label>
                  <span>Bắt buộc email</span>
                  <select value={settings.requireRespondentEmail ? "yes" : "no"} onChange={(event) => setSettings({ ...settings, requireRespondentEmail: event.target.value === "yes" })}>
                    <option value="no">Không bắt buộc</option>
                    <option value="yes">Bắt buộc nhập</option>
                  </select>
                </label>
              </div>
              <div className="action-row">
                <button className="btn btn-primary" onClick={() => void handleCreateForm()} disabled={busy}>
                  {busy ? "Đang xử lý..." : "Tạo link"}
                </button>
              </div>
            </div>
          </Card>

          <Card title="Link public đang chọn">
            <div className="lecturer-bank-share-box">
              <div className="lecturer-bank-share-url">
                {activeFormIsActive ? shareLink || "Ch\u01b0a c\u00f3 link" : "Form \u0111ang t\u1eaft. B\u1eadt form ho\u1eb7c ch\u1ecdn form \u0111ang b\u1eadt \u0111\u1ec3 l\u1ea5y link public."}
              </div>
              <div className="action-row">
                <button className="btn btn-primary" onClick={() => void handleCopyLink()} disabled={!shareLink || !activeFormIsActive}>
                  <Copy size={16} aria-hidden="true" />
                  Copy link
                </button>
                <a className="btn btn-ghost" href={activeFormIsActive ? shareLink || "#" : "#"} target="_blank" rel="noreferrer" aria-disabled={!activeFormIsActive}>Mở form public</a>
                <button className="btn btn-ghost" onClick={() => activeForm && void loadSubmissions(activeForm.id)} disabled={!activeForm || busy}>
                  <Link2 size={16} aria-hidden="true" />
                  Làm mới kết quả
                </button>
              </div>
              {activeForm ? <div className="muted-text">{activeForm.id} · {activeForm.status === "active" ? "Đang bật" : "Đang tắt"}</div> : null}
              {copyState ? <div className="muted-text">{copyState}</div> : null}
            </div>
          </Card>
        </div>
        </>
        ) : null}

        {mainScreen === "list" ? (
        <>
        <div className="lecturer-bank-content-grid">
          <div className="lecturer-bank-main">
            <Card title="Danh sách form khảo sát">
              {loading ? (
                <div className="muted-text">Đang tải...</div>
              ) : forms.length ? (
                <div className="stack compact">
                  <div className="production-plan-filter-grid vsurvey-table-filters">
                    <label>
                      <span>Trạng thái</span>
                      <select value={formStatusFilter} onChange={(event) => setFormStatusFilter(event.target.value as SurveyFormStatusFilter)}>
                        <option value="all">Tất cả</option>
                        <option value="active">Đang bật</option>
                        <option value="paused">Đang tắt</option>
                      </select>
                    </label>
                    <label>
                      <span>Tìm khảo sát</span>
                      <input value={formKeyword} onChange={(event) => setFormKeyword(event.target.value)} placeholder="Mã, tiêu đề, nguồn contract" />
                    </label>
                    <div className="vsurvey-table-meta">
                      Hiển thị {filteredForms.length} khảo sát
                    </div>
                  </div>
                  <div className="production-plan-table-wrap production-plan-glass-panel">
                    <table className="data-table production-plan-table production-plan-table-compact production-plan-table-corporate vsurvey-forms-table">
                      <thead>
                        <tr>
                          <th>Mã khảo sát</th>
                          <th>Tên khảo sát</th>
                          <th>Nguồn contract</th>
                          <th>Cấu trúc</th>
                          <th>Phản hồi</th>
                          <th>Hiệu lực</th>
                          <th>Trạng thái</th>
                          <th>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredForms.map((form) => {
                          const questionCount = form.settings.customQuestions?.length || getStudentSurveyQuestions(form.settings.surveyType).length;
                          const sectionCount = form.settings.customSections?.length || getJourneyDefinitions(form.settings.surveyType).length;
                          const sourceName = form.settings.contractSourceName || form.settings.templateVariant || form.settings.surveyType || "-";
                          const surveyLabel = getSurveyTypeDefinition(form.settings.surveyType).label;
                          const isAiPowerPracticeForm = form.settings.templateVariant === "ai-power-practice";
                          return (
                            <tr className={activeForm?.id === form.id ? "is-active" : ""} key={form.id} onClick={() => handleOpenFormResults(form)}>
                              <td>
                                <div className="fw6 text-ellipsis">{form.id}</div>
                                <div className="muted-text">{getSurveyAccessLabel(form.settings)}</div>
                              </td>
                              <td className="production-plan-col-product-name">{safeText(form.title, "Chưa có tiêu đề")}</td>
                              <td>
                                <div className="text-ellipsis" title={sourceName}>{sourceName}</div>
                                {includeAllSurveyTypes ? <div className="muted-text">{safeText(surveyLabel, form.settings.surveyType || "-")}</div> : null}
                                {form.settings.contractVersion ? <div className="muted-text">{form.settings.contractVersion}</div> : null}
                              </td>
                              <td>{sectionCount} phần · {questionCount} câu</td>
                              <td>{formSubmissionCounts[form.id] || 0}</td>
                              <td>
                                <div>{formatDateOnly(form.settings.validFrom)}</div>
                                <div className="muted-text">{formatDateOnly(form.settings.validTo)}</div>
                              </td>
                              <td>
                                <Badge tone={form.status === "active" ? "success" : "warning"}>{form.status === "active" ? "Đang bật" : "Đang tắt"}</Badge>
                              </td>
                              <td>
                                <div className="production-plan-row-actions production-plan-row-actions-icons">
                                  {isAiPowerPracticeForm ? (
                                    <>
                                      <Link className="production-plan-icon-btn" title="Xem kết quả admin" aria-label={`Xem kết quả admin ${form.id}`} to={AI_POWER_TRACKING_ROUTE} onClick={(event) => event.stopPropagation()}>
                                        <BarChart3 size={16} strokeWidth={1.9} />
                                      </Link>
                                      <button className="production-plan-icon-btn" title="Lấy link public cho học viên" aria-label={`Lấy link public cho học viên ${form.id}`} onClick={(event) => { event.stopPropagation(); void handleCopyFormLink(form); }} disabled={form.status !== "active"}>
                                        <Link2 size={16} strokeWidth={1.9} />
                                      </button>
                                      <button className="production-plan-icon-btn" title="Set video Vimeo" aria-label={`Set video Vimeo ${form.id}`} onClick={(event) => { event.stopPropagation(); handleEditPracticeVideoSettings(form); }}>
                                        <Video size={16} strokeWidth={1.9} />
                                      </button>
                                      <button className="production-plan-icon-btn tone-danger" title="Xóa toàn bộ phản hồi/checkpoint" aria-label={`Xóa toàn bộ phản hồi ${form.id}`} onClick={(event) => { event.stopPropagation(); void handleDeleteFormSubmissions(form); }} disabled={busy || isAiPowerPracticeLocalForm(form)}>
                                        <Trash2 size={16} strokeWidth={1.9} />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button className="production-plan-icon-btn" title="Xem kết quả" aria-label={`Xem kết quả ${form.id}`} onClick={(event) => { event.stopPropagation(); handleOpenFormResults(form); }}>
                                        <Eye size={16} strokeWidth={1.9} />
                                      </button>
                                      <button className="production-plan-icon-btn" title="Chỉnh khảo sát" aria-label={`Chỉnh khảo sát ${form.id}`} onClick={(event) => { event.stopPropagation(); handleEditForm(form); }}>
                                        <Pencil size={16} strokeWidth={1.9} />
                                      </button>
                                      <button className="production-plan-icon-btn" title="Nhân bản khảo sát" aria-label={`Nhân bản khảo sát ${form.id}`} onClick={(event) => { event.stopPropagation(); void handleDuplicateForm(form); }} disabled={busy || isAiPowerPracticeLocalForm(form)}>
                                        <CopyPlus size={16} strokeWidth={1.9} />
                                      </button>
                                      <button className="production-plan-icon-btn" title="Copy link" aria-label={`Copy link ${form.id}`} onClick={(event) => { event.stopPropagation(); void handleCopyFormLink(form); }} disabled={form.status !== "active"}>
                                        <Copy size={16} strokeWidth={1.9} />
                                      </button>
                                      <a className="production-plan-icon-btn" title="Mở form public" aria-label={`Mở form public ${form.id}`} href={form.status === "active" ? resolveStudentSurveyShareLink(form) : "#"} target="_blank" rel="noreferrer" aria-disabled={form.status !== "active"} onClick={(event) => event.stopPropagation()}>
                                        <ExternalLink size={16} strokeWidth={1.9} />
                                      </a>
                                      <button className="production-plan-icon-btn" title={form.status === "active" ? "Tạm dừng khảo sát" : "Bật lại khảo sát"} aria-label={form.status === "active" ? `Tạm dừng ${form.id}` : `Bật lại ${form.id}`} onClick={(event) => { event.stopPropagation(); void handleToggleFormStatus(form); }} disabled={busy || isAiPowerPracticeLocalForm(form)}>
                                        {form.status === "active" ? <PauseCircle size={16} strokeWidth={1.9} /> : <PlayCircle size={16} strokeWidth={1.9} />}
                                      </button>
                                      <button className="production-plan-icon-btn tone-danger" title="Xóa khảo sát" aria-label={`Xóa khảo sát ${form.id}`} onClick={(event) => { event.stopPropagation(); void handleDeleteForm(form); }} disabled={busy || isAiPowerPracticeLocalForm(form)}>
                                        <Trash2 size={16} strokeWidth={1.9} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {!filteredForms.length ? (
                          <tr>
                            <td colSpan={8}>
                              <div className="muted-text">Không có khảo sát khớp bộ lọc.</div>
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="muted-text">Chưa có form nào.</div>
              )}
            </Card>
          </div>

          <aside className="lecturer-bank-side">
            <Card title="Chỉnh phiếu đang chọn">
              <div className="stack compact">
                <div className="muted-text">
                  {activeForm ? `Đang chỉnh phiếu: ${activeForm.id}. Lưu ở đây để cập nhật phiếu hiện có, không tạo link mới.` : "Chọn một phiếu trong danh sách để chỉnh."}
                </div>
                <label className="lecturer-bank-inline-field">
                  <span>Tiêu đề quản trị</span>
                  <input value={formTitle} onChange={(event) => setFormTitle(event.target.value)} disabled={!activeForm} />
                </label>
                <label className="lecturer-bank-inline-field">
                  <span>Tiêu đề banner</span>
                  <input value={settings.bannerTitle} onChange={(event) => setSettings({ ...settings, bannerTitle: event.target.value })} disabled={!activeForm} />
                </label>
                <label className="lecturer-bank-inline-field">
                  <span>Dòng phụ banner</span>
                  <input value={settings.bannerSubtitle} onChange={(event) => setSettings({ ...settings, bannerSubtitle: event.target.value })} disabled={!activeForm} />
                </label>
                <label className="lecturer-bank-inline-field">
                  <span>Nội dung giới thiệu</span>
                  <textarea rows={4} value={settings.introBody} onChange={(event) => setSettings({ ...settings, introBody: event.target.value })} disabled={!activeForm} />
                </label>
                <label className="lecturer-bank-inline-field">
                  <span>Nút gửi</span>
                  <input value={settings.submitButtonLabel} onChange={(event) => setSettings({ ...settings, submitButtonLabel: event.target.value })} disabled={!activeForm} />
                </label>
                <label className="lecturer-bank-inline-field">
                  <span>Kiểu truy cập</span>
                  <select value={settings.accessMode || "public"} onChange={(event) => setSettings({ ...settings, accessMode: event.target.value === "vtraining" ? "vtraining" : "public" })} disabled={!activeForm}>
                    <option value="public">Public link</option>
                    <option value="vtraining">Đăng nhập V-Training</option>
                  </select>
                </label>
                <label className="lecturer-bank-inline-field">
                  <span>Bắt buộc họ tên</span>
                  <select value={settings.requireRespondentName ? "yes" : "no"} onChange={(event) => setSettings({ ...settings, requireRespondentName: event.target.value === "yes" })} disabled={!activeForm}>
                    <option value="no">Không bắt buộc</option>
                    <option value="yes">Bắt buộc nhập</option>
                  </select>
                </label>
                <label className="lecturer-bank-inline-field">
                  <span>Bắt buộc email</span>
                  <select value={settings.requireRespondentEmail ? "yes" : "no"} onChange={(event) => setSettings({ ...settings, requireRespondentEmail: event.target.value === "yes" })} disabled={!activeForm}>
                    <option value="no">Không bắt buộc</option>
                    <option value="yes">Bắt buộc nhập</option>
                  </select>
                </label>
                {settings.accessMode === "vtraining" ? (
                  <label className="lecturer-bank-inline-field">
                    <span>Link đăng nhập</span>
                    <input value={settings.loginUrl || ""} onChange={(event) => setSettings({ ...settings, loginUrl: event.target.value })} disabled={!activeForm} placeholder="/login hoặc link tài khoản V-Training" />
                  </label>
                ) : null}
                <div className="form-grid storyboard-form-grid">
                  <label>
                    <span>Bắt đầu hiệu lực</span>
                    <input type="datetime-local" value={toDatetimeLocalValue(settings.validFrom)} onChange={(event) => setSettings({ ...settings, validFrom: fromDatetimeLocalValue(event.target.value) })} disabled={!activeForm} />
                  </label>
                  <label>
                    <span>Kết thúc hiệu lực</span>
                    <input type="datetime-local" value={toDatetimeLocalValue(settings.validTo)} onChange={(event) => setSettings({ ...settings, validTo: fromDatetimeLocalValue(event.target.value) })} disabled={!activeForm} />
                  </label>
                </div>
                <label className="lecturer-bank-inline-field">
                  <span>Màu chính</span>
                  <input value={settings.primaryColor} onChange={(event) => setSettings({ ...settings, primaryColor: event.target.value })} disabled={!activeForm} />
                </label>
                <label className="lecturer-bank-inline-field">
                  <span>Màu nhấn</span>
                  <input value={settings.accentColor} onChange={(event) => setSettings({ ...settings, accentColor: event.target.value })} disabled={!activeForm} />
                </label>
                <div className="action-row">
                  <button className="btn btn-primary" onClick={() => void handleSaveActiveForm()} disabled={!activeForm || busy}>
                    {busy ? "Đang lưu..." : "Lưu phiếu đang chọn"}
                  </button>
                  <a className="btn btn-ghost" href={activeFormIsActive ? shareLink || "#" : "#"} target="_blank" rel="noreferrer" aria-disabled={!activeFormIsActive}>
                    Xem phiếu
                  </a>
                </div>
                {copyState ? <div className="muted-text">{copyState}</div> : null}
              </div>
            </Card>
          </aside>
        </div>
        </>
        ) : null}

        {mainScreen === "edit" ? (
          <div className="vsurvey-edit-screen">
            <Card title="Chỉnh sửa khảo sát">
              <div className="vsurvey-results-titlebar">
                <button className="btn btn-ghost btn-small" type="button" onClick={() => setMainScreen("list")}>← Danh sách khảo sát</button>
                <div>
                  <strong>{safeText(activeForm?.title, "Chưa chọn khảo sát")}</strong>
                  <span>{activeForm?.id || ""}</span>
                </div>
              </div>
              <div className="stack compact">
                <div className="form-grid storyboard-form-grid">
                  <label>
                    <span>Tiêu đề quản trị</span>
                    <input value={formTitle} onChange={(event) => setFormTitle(event.target.value)} disabled={!activeForm} />
                  </label>
                  <label>
                    <span>Mã khảo sát</span>
                    <input value={formCode} disabled />
                  </label>
                  <label>
                    <span>Tiêu đề banner</span>
                    <input value={settings.bannerTitle} onChange={(event) => setSettings({ ...settings, bannerTitle: event.target.value })} disabled={!activeForm} />
                  </label>
                  <label>
                    <span>Dòng phụ banner</span>
                    <input value={settings.bannerSubtitle} onChange={(event) => setSettings({ ...settings, bannerSubtitle: event.target.value })} disabled={!activeForm} />
                  </label>
                  <label>
                    <span>Nút gửi</span>
                    <input value={settings.submitButtonLabel} onChange={(event) => setSettings({ ...settings, submitButtonLabel: event.target.value })} disabled={!activeForm} />
                  </label>
                  <label>
                    <span>Kiểu truy cập</span>
                    <select value={settings.accessMode || "public"} onChange={(event) => setSettings({ ...settings, accessMode: event.target.value === "vtraining" ? "vtraining" : "public" })} disabled={!activeForm}>
                      <option value="public">Public link</option>
                      <option value="vtraining">Đăng nhập V-Training</option>
                    </select>
                  </label>
                  <label>
                    <span>Bắt buộc họ tên</span>
                    <select value={settings.requireRespondentName ? "yes" : "no"} onChange={(event) => setSettings({ ...settings, requireRespondentName: event.target.value === "yes" })} disabled={!activeForm}>
                      <option value="no">Không bắt buộc</option>
                      <option value="yes">Bắt buộc nhập</option>
                    </select>
                  </label>
                  <label>
                    <span>Bắt buộc email</span>
                    <select value={settings.requireRespondentEmail ? "yes" : "no"} onChange={(event) => setSettings({ ...settings, requireRespondentEmail: event.target.value === "yes" })} disabled={!activeForm}>
                      <option value="no">Không bắt buộc</option>
                      <option value="yes">Bắt buộc nhập</option>
                    </select>
                  </label>
                </div>
                <label className="lecturer-bank-inline-field">
                  <span>Nội dung giới thiệu</span>
                  <textarea rows={4} value={settings.introBody} onChange={(event) => setSettings({ ...settings, introBody: event.target.value })} disabled={!activeForm} />
                </label>
                <div className="action-row">
                  <button className="btn btn-primary" onClick={() => void handleSaveActiveForm()} disabled={!activeForm || busy}>
                    {busy ? "Đang lưu..." : "Lưu thay đổi khảo sát"}
                  </button>
                  <a className="btn btn-ghost" href={activeFormIsActive ? shareLink || "#" : "#"} target="_blank" rel="noreferrer" aria-disabled={!activeFormIsActive}>
                    Xem phiếu public
                  </a>
                  {copyState ? <span className="muted-text">{copyState}</span> : null}
                </div>
              </div>
            </Card>

            {settings.templateVariant === "ai-power-practice" ? (
              <div ref={practiceVideoSettingsRef}>
                <Card title="Set video Vimeo cho form học viên">
                  <div className="stack compact">
                    <div className="notice info">
                      Mỗi tình huống dùng 1 link video hướng dẫn. Ưu tiên Vimeo để ổn định khi nhiều học viên mở cùng lúc; hệ thống cũng nhận MP4/WebM qua HTTPS.
                    </div>
                    <div className="form-grid storyboard-form-grid">
                      {AI_POWER_APPLICATION_TITLES.map((applicationTitle, index) => (
                        <label key={applicationTitle}>
                          <span>Ứng dụng {index + 1} · {applicationTitle}</span>
                          <input
                            type="url"
                            value={settings.practiceGuideVideoUrls?.[index] || ""}
                            onChange={(event) => updatePracticeGuideVideoUrl(index + 1, event.target.value)}
                            disabled={!activeForm}
                            placeholder="https://vimeo.com/123456789/ma-rieng"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="action-row">
                      <button className="btn btn-primary" onClick={() => void handleSaveActiveForm()} disabled={!activeForm || busy}>
                        {busy ? "Đang lưu..." : "Lưu video Vimeo"}
                      </button>
                      {activeFormIsActive ? <a className="btn btn-ghost" href={shareLink} target="_blank" rel="noreferrer">Mở form học viên để kiểm tra video</a> : null}
                    </div>
                    <div className="muted-text">Sau khi lưu, video xuất hiện ngay dưới thanh chọn 4 tình huống trong form học viên.</div>
                  </div>
                </Card>
              </div>
            ) : null}

            <Card title="Phần khảo sát">
              <div className="vsurvey-section-editor">
                {editableSections.map((section) => (
                  <div className="vsurvey-section-row" key={section.id}>
                    <div className="muted-text">{section.id}</div>
                    <input value={section.title} onChange={(event) => updateSurveySection(section.id, { title: event.target.value })} disabled={!activeForm} />
                    <input value={section.description || ""} onChange={(event) => updateSurveySection(section.id, { description: event.target.value })} disabled={!activeForm} placeholder="Mô tả phần" />
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Câu hỏi khảo sát">
              <div className="vsurvey-question-editor-list">
                {editableQuestions.map((question, index) => (
                  <div className="vsurvey-question-editor" key={question.id}>
                    <div className="vsurvey-question-editor-head">
                      <strong>{index + 1}. {question.code || question.id}</strong>
                      <Badge tone={question.required ? "danger" : "neutral"}>{question.required ? "Bắt buộc" : "Không bắt buộc"}</Badge>
                    </div>
                    <div className="form-grid storyboard-form-grid">
                      <label>
                        <span>Mã câu</span>
                        <input value={question.code} onChange={(event) => updateSurveyQuestion(question.id, { code: event.target.value })} disabled={!activeForm} />
                      </label>
                      <label>
                        <span>Phần</span>
                        <select value={question.sectionId} onChange={(event) => updateSurveyQuestion(question.id, { sectionId: event.target.value, sectionTitle: editableSections.find((section) => section.id === event.target.value)?.title || question.sectionTitle })} disabled={!activeForm}>
                          {editableSections.map((section) => (
                            <option key={section.id} value={section.id}>{section.title}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Loại câu</span>
                        <select value={question.type} onChange={(event) => updateSurveyQuestion(question.id, { type: event.target.value as SurveyQuestionType })} disabled={!activeForm}>
                          <option value="single">Một lựa chọn</option>
                          <option value="multiple">Nhiều lựa chọn</option>
                          <option value="text">Tự luận</option>
                          <option value="rating">Đánh giá</option>
                        </select>
                      </label>
                      <label>
                        <span>Bắt buộc</span>
                        <select value={question.required ? "yes" : "no"} onChange={(event) => updateSurveyQuestion(question.id, { required: event.target.value === "yes" })} disabled={!activeForm}>
                          <option value="yes">Có</option>
                          <option value="no">Không</option>
                        </select>
                      </label>
                    </div>
                    <label className="lecturer-bank-inline-field">
                      <span>Nội dung câu hỏi</span>
                      <textarea rows={3} value={question.prompt} onChange={(event) => updateSurveyQuestion(question.id, { prompt: event.target.value })} disabled={!activeForm} />
                    </label>
                    <label className="lecturer-bank-inline-field">
                      <span>Gợi ý / mô tả</span>
                      <input value={question.hint || ""} onChange={(event) => updateSurveyQuestion(question.id, { hint: event.target.value })} disabled={!activeForm} />
                    </label>
                    {question.type === "single" || question.type === "multiple" || question.type === "rating" ? (
                      <label className="lecturer-bank-inline-field">
                        <span>Phương án trả lời, mỗi dòng dạng value|label</span>
                        <textarea rows={4} value={formatSurveyQuestionOptions(question.options)} onChange={(event) => updateSurveyQuestion(question.id, { options: parseSurveyQuestionOptions(event.target.value) })} disabled={!activeForm} />
                      </label>
                    ) : (
                      <label className="lecturer-bank-inline-field">
                        <span>Placeholder</span>
                        <input value={question.placeholder || ""} onChange={(event) => updateSurveyQuestion(question.id, { placeholder: event.target.value })} disabled={!activeForm} />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ) : null}

        {mainScreen === "email" ? (
          <Card title="Gửi email khảo sát">
            <div className="stack compact">
              <div className="muted-text">Gửi qua SMTP Outlook. Mỗi lần gửi tối đa 100 người; hãy gửi test trước khi gửi lô thật.</div>
              <div className="form-grid storyboard-form-grid">
                <label>
                  <span>Ten hien thi</span>
                  <input value={smtpConfig.fromName} onChange={(event) => updateSmtpConfig({ fromName: event.target.value })} />
                </label>
                <label>
                  <span>Email gui</span>
                  <input value={smtpConfig.fromEmail} onChange={(event) => updateSmtpConfig({ fromEmail: event.target.value })} />
                </label>
                <label>
                  <span>Host</span>
                  <input value={smtpConfig.host} onChange={(event) => updateSmtpConfig({ host: event.target.value })} />
                </label>
                <label>
                  <span>Port</span>
                  <input value={smtpConfig.port} onChange={(event) => updateSmtpConfig({ port: event.target.value })} />
                </label>
                <label>
                  <span>User</span>
                  <input value={smtpConfig.user} onChange={(event) => updateSmtpConfig({ user: event.target.value })} />
                </label>
                <label>
                  <span>Password / app password</span>
                  <input type="password" value={smtpConfig.pass} onChange={(event) => updateSmtpConfig({ pass: event.target.value })} />
                </label>
                <label>
                  <span>SSL</span>
                  <select value={smtpConfig.secure ? "yes" : "no"} onChange={(event) => updateSmtpConfig({ secure: event.target.value === "yes" })}>
                    <option value="no">No - STARTTLS 587</option>
                    <option value="yes">Yes - SSL 465</option>
                  </select>
                </label>
                <label>
                  <span>STARTTLS</span>
                  <select value={smtpConfig.requireTLS ? "yes" : "no"} onChange={(event) => updateSmtpConfig({ requireTLS: event.target.value === "yes" })}>
                    <option value="yes">Bat</option>
                    <option value="no">Tat</option>
                  </select>
                </label>
              </div>
              <div className="action-row">
                <button className="btn btn-primary btn-small" type="button" onClick={handleSaveSmtpConfig}>
                  Lưu cấu hình SMTP
                </button>
                <button className="btn btn-ghost btn-small" type="button" onClick={handleClearSmtpConfig}>
                  Xoa cau hinh da luu
                </button>
              </div>
              <div className="muted-text">Password chi duoc luu tren trinh duyet hien tai, khong luu vao database VContent.</div>
              <label className="lecturer-bank-inline-field">
                <span>Tieu de email</span>
                <input value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} />
              </label>
              <label className="lecturer-bank-inline-field">
                <span>Link dung cho email</span>
                <input value={emailLink} onChange={(event) => setEmailLink(event.target.value)} placeholder="Dan link khao sat hoac de trong de dung link public dang chon" />
              </label>
              <div className="action-row">
                <button className="btn btn-ghost btn-small" type="button" onClick={() => setEmailLink(shareLink)} disabled={!shareLink}>
                  Lay link public dang chon
                </button>
              </div>
              <label className="lecturer-bank-inline-field">
                <span>Nội dung email</span>
                <textarea
                  ref={emailBodyRef}
                  rows={7}
                  value={emailBody}
                  onChange={(event) => setEmailBody(event.target.value)}
                  onPaste={handleEmailBodyPaste}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setEmailBodyMenu({ x: event.clientX, y: event.clientY });
                  }}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
                      event.preventDefault();
                      wrapEmailBodySelection("**");
                    }
                  }}
                  onBlur={() => window.setTimeout(() => setEmailBodyMenu(null), 180)}
                />
              </label>
              {emailBodyMenu ? (
                <div
                  style={{
                    position: "fixed",
                    left: emailBodyMenu.x,
                    top: emailBodyMenu.y,
                    zIndex: 1000,
                    background: "#fff",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.18)",
                    padding: 6,
                  }}
                >
                  <button className="btn btn-ghost btn-small" type="button" onMouseDown={(event) => event.preventDefault()} onClick={insertEmailBodyLink}>
                    Chen link
                  </button>
                  <button className="btn btn-ghost btn-small" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => wrapEmailBodySelection("**")}>
                    In dam
                  </button>
                </div>
              ) : null}
              <div className="action-row">
                <button className="btn btn-ghost btn-small" type="button" onClick={() => wrapEmailBodySelection("**")}>
                  In dam chu dang chon
                </button>
                <button className="btn btn-ghost btn-small" type="button" onClick={insertEmailBodyLink}>
                  Chen link vao chu dang chon
                </button>
                <label className="btn btn-ghost btn-small">
                  {emailImportBusy ? "Dang import..." : "Import noi dung email"}
                  <input
                    type="file"
                    accept=".txt,.html,.htm,.docx,text/plain,text/html,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    style={{ display: "none" }}
                    disabled={emailImportBusy}
                    onChange={(event) => {
                      void handleImportEmailBodyFile(event.target.files?.[0] || null);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              <div className="muted-text">Bien co the dung: {"{{name}}"}, {"{{email}}"}, {"{{unit}}"}, {"{{link}}"}. Paste/import tu Word hoac HTML se tu chuyen chu dam va link.</div>
              <label className="lecturer-bank-inline-field">
                <span>Danh sach nguoi nhan</span>
                <textarea
                  rows={6}
                  value={recipientText}
                  onChange={(event) => {
                    setRecipientText(event.target.value);
                    setEmailBatchStart(0);
                  }}
                  placeholder="email, ho ten, don vi"
                />
              </label>
              <div className="action-row">
                <button className="btn btn-ghost" onClick={() => void handleUseSubmissionEmails()} disabled={!submissionTotal || emailBusy || busy}>
                  Lay email tu phan hoi
                </button>
                <button className="btn btn-ghost" onClick={() => setEmailBatchStart(0)} disabled={emailBusy}>
                  Dat lai lo gui
                </button>
              </div>
              <div className="muted-text">
                Hop le: {emailRecipients.length} email.{" "}
                {nextEmailBatch.length
                  ? `Lo tiep theo: ${emailBatchStart + 1}-${Math.min(emailBatchStart + nextEmailBatch.length, emailRecipients.length)}.`
                  : "Da gui het danh sach hoac chua co lo hop le."}
              </div>
              <div className="form-grid storyboard-form-grid">
                <label>
                  <span>Email test</span>
                  <input value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="you@company.com" />
                </label>
              </div>
              <div className="action-row">
                <button className="btn btn-ghost" onClick={() => void handleSendSurveyEmailTest()} disabled={emailBusy}>
                  Gửi test
                </button>
                <button className="btn btn-danger" onClick={() => void handleSendSurveyEmailBatch()} disabled={emailBusy || !nextEmailBatch.length}>
                  Gửi lô tiếp theo
                </button>
              </div>
              {emailNotice ? <div className="muted-text">{emailNotice}</div> : null}
              <div className="action-row">
                <button className="btn btn-ghost btn-small" type="button" onClick={() => void loadEmailHistory()} disabled={emailHistoryBusy}>
                  Tai lai lich su gui
                </button>
              </div>
              <div className="lecturer-bank-submission-list">
                {emailHistoryBusy ? (
                  <div className="muted-text">Đang tải lịch sử gửi email...</div>
                ) : emailHistory.length ? (
                  emailHistory.map((item) => (
                    <div className="lecturer-bank-submission-item" key={item.id}>
                      <button type="button" onClick={() => applyEmailHistory(item)}>
                        <div className="list-title">{safeText(item.subject, "Email khong co tieu de")}</div>
                        <div className="muted-text">
                          {formatTimestamp(item.createdAt)} · {item.sentCount} thành công, {item.failedCount} lỗi · {item.recipients.length || parseSurveyEmailRecipients(item.recipientText).length} người nhận
                        </div>
                        <div className="muted-text">{safeText(item.fromEmail, "Không có email gửi")}</div>
                      </button>
                      <div className="stack compact right">
                        <button className="btn btn-primary btn-small" type="button" onClick={() => applyEmailHistory(item)}>
                          Dung lai
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="muted-text">Chưa có lịch sử gửi email cho link đang chọn.</div>
                )}
              </div>
            </div>
          </Card>
        ) : null}

        {mainScreen === "results" ? (
        <div className="lecturer-bank-content-grid vsurvey-results-layout">
          <div className="lecturer-bank-main vsurvey-results-context">
            <Card title="Danh sách form khảo sát">
              {loading ? (
                <div className="muted-text">Đang tải...</div>
              ) : forms.length ? (
                <div className="lecturer-bank-submission-list">
                  {forms.map((form) => (
                    <div className={`lecturer-bank-submission-item${activeForm?.id === form.id ? " active" : ""}`} key={form.id}>
                      <button onClick={() => setActiveFormId(form.id)}>
                        <div className="list-title">{safeText(form.title, "Chưa có tiêu đề")}</div>
                        <div className="muted-text">{form.id}</div>
                      </button>
                      <div className="stack compact right">
                        <Badge tone={form.status === "active" ? "success" : "warning"}>{form.status === "active" ? "Đang bật" : "Đang tắt"}</Badge>
                        <button className="btn btn-primary btn-small" onClick={() => void handleCopyFormLink(form)} disabled={form.status !== "active"}>
                          Copy link
                        </button>
                        <a className="btn btn-ghost btn-small" href={form.status === "active" ? buildStudentSurveyShareLink(form.id) : "#"} target="_blank" rel="noreferrer" aria-disabled={form.status !== "active"}>
                          Mở
                        </a>
                        <button className="btn btn-ghost btn-small" onClick={() => void handleToggleFormStatus(form)} disabled={busy}>
                          {form.status === "active" ? "Tắt" : "Bật"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted-text">Chưa có form nào.</div>
              )}
            </Card>

            <Card title="Tùy chỉnh hiển thị cơ bản">
              <div className="stack compact">
                <label className="lecturer-bank-inline-field">
                  <span>Tiêu đề banner</span>
                  <input value={settings.bannerTitle} onChange={(event) => setSettings({ ...settings, bannerTitle: event.target.value })} />
                </label>
                <label className="lecturer-bank-inline-field">
                  <span>Dòng phụ banner</span>
                  <input value={settings.bannerSubtitle} onChange={(event) => setSettings({ ...settings, bannerSubtitle: event.target.value })} />
                </label>
                <label className="lecturer-bank-inline-field">
                  <span>Nội dung giới thiệu</span>
                  <textarea rows={4} value={settings.introBody} onChange={(event) => setSettings({ ...settings, introBody: event.target.value })} />
                </label>
                <label className="lecturer-bank-inline-field">
                  <span>Nút gửi</span>
                  <input value={settings.submitButtonLabel} onChange={(event) => setSettings({ ...settings, submitButtonLabel: event.target.value })} />
                </label>
                <label className="lecturer-bank-inline-field">
                  <span>Màu chính</span>
                  <input value={settings.primaryColor} onChange={(event) => setSettings({ ...settings, primaryColor: event.target.value })} />
                </label>
                <label className="lecturer-bank-inline-field">
                  <span>Màu nhấn</span>
                  <input value={settings.accentColor} onChange={(event) => setSettings({ ...settings, accentColor: event.target.value })} />
                </label>
              </div>
            </Card>

            <Card title="Danh sách phản hồi nhanh">
              <div className="action-row">
                <span className="muted-text">
                  Trang {submissionPage}/{submissionPageCount} · {submissionTotal} phản hồi
                </span>
                <div className="action-row compact">
                  <button className="btn btn-ghost btn-small" onClick={() => activeForm && void loadSubmissions(activeForm.id, submissionPage - 1)} disabled={busy || submissionPage <= 1}>Trước</button>
                  <button className="btn btn-ghost btn-small" onClick={() => activeForm && void loadSubmissions(activeForm.id, submissionPage + 1)} disabled={busy || submissionPage >= submissionPageCount}>Sau</button>
                </div>
              </div>
              {submissions.length ? (
                <div className="lecturer-bank-submission-list">
                  {submissions.map((item) => (
                    <button key={item.id} className={`lecturer-bank-submission-item${selectedSubmission?.id === item.id ? " active" : ""}`} onClick={() => openSubmissionDetail(item.id)}>
                      <div>
                        <div className="list-title">{safeText(item.respondent.unitName, "Chưa có tên đơn vị")}</div>
                        <div className="muted-text">{safeText(item.respondent.contactName, "Chưa có người phụ trách")}</div>
                      </div>
                      <div className="stack compact right">
                        <Badge tone="success">Đã nộp</Badge>
                        <span className="muted-text">{formatTimestamp(item.submittedAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="muted-text">Chưa có phản hồi nào cho form này.</div>
              )}
            </Card>
          </div>

          <aside className="lecturer-bank-side vsurvey-results-main">
            <Card title="Kết quả khảo sát">
              {activeFormIsLocalDemo ? (
                <div className="notice warning ai-practice-local-demo-notice">
                  <strong>Bản demo cục bộ trên LAN</strong>
                  <span>Dữ liệu nhóm bên dưới là dữ liệu mẫu. Nội dung chỉnh sửa chỉ lưu trên trình duyệt này và không ghi Supabase.</span>
                </div>
              ) : null}
              <div className="vsurvey-results-titlebar">
                <button className="btn btn-ghost btn-small" type="button" onClick={() => setMainScreen("list")}>← Danh sách khảo sát</button>
                <div>
                  <strong>{safeText(activeForm?.title, "Chưa chọn khảo sát")}</strong>
                  <span>{activeForm?.id || ""}</span>
                </div>
                <div className="action-row compact">
                  {activeForm ? <button className="btn btn-ghost btn-small" type="button" onClick={() => handleEditForm(activeForm)}>Chỉnh sửa phiếu</button> : null}
                  {activeFormIsActive ? <a className="btn btn-ghost btn-small" href={shareLink} target="_blank" rel="noreferrer">Xem form học viên</a> : null}
                </div>
              </div>
              <div className="student-results-screen-toggle">
                {resultsScreen !== "menu" ? (
                  <button className="btn btn-ghost btn-small" onClick={() => setResultsScreen("menu")}>← Về chọn loại kết quả</button>
                ) : null}
              </div>

              <div className="student-results-screen-body">
                {resultsScreen === "menu" ? (
                  <div className="student-results-menu">
                    {activeForm?.settings.templateVariant === "ai-power-practice" ? (
                      <Link className="student-results-menu-item" to={AI_POWER_TRACKING_ROUTE}>
                        <strong>Mở dashboard theo dõi tiến độ nhóm</strong>
                        <span>Route quản trị riêng để quét nhanh toàn lớp và mở Prompt/phản ánh chi tiết.</span>
                      </Link>
                    ) : null}
                    <button className="student-results-menu-item" onClick={() => setResultsScreen("list")}>
                      <strong>{activeForm?.settings.templateVariant === "ai-power-practice" ? "Nhật ký checkpoint" : "Danh sách kết quả cá nhân"}</strong>
                      <span>{activeForm?.settings.templateVariant === "ai-power-practice" ? "Xem từng lần hệ thống ghi nhận tiến độ để phục vụ kiểm tra/audit." : "Xem từng phản hồi và chuyển vào nội dung chi tiết."}</span>
                    </button>
                    <button className="student-results-menu-item" onClick={() => setResultsScreen("analytics")}>
                      <strong>Thống kê</strong>
                      <span>Xem số liệu tổng hợp và tải file kết quả.</span>
                    </button>
                  </div>
                ) : null}

                {resultsScreen === "list" ? (
                  submissions.length ? (
                    <div className="student-results-list">
                      <div className="action-row">
                        <span className="muted-text">
                          Trang {submissionPage}/{submissionPageCount} · {submissionTotal} phản hồi
                        </span>
                        <div className="action-row compact">
                          <button className="btn btn-ghost btn-small" onClick={selectCurrentSubmissionPage} disabled={busy || !submissions.length}>Chọn trang này</button>
                          <button className="btn btn-ghost btn-small" onClick={() => setSelectedSubmissionIds([])} disabled={busy || !selectedSubmissionIds.length}>Bỏ chọn</button>
                          <button className="btn btn-danger btn-small" onClick={() => void handleDeleteSelectedSubmissions()} disabled={busy || !selectedSubmissionIds.length}>Xóa đã chọn</button>
                          <button className="btn btn-ghost btn-small" onClick={() => activeForm && void loadSubmissions(activeForm.id, submissionPage - 1)} disabled={busy || submissionPage <= 1}>Trước</button>
                          <button className="btn btn-ghost btn-small" onClick={() => activeForm && void loadSubmissions(activeForm.id, submissionPage + 1)} disabled={busy || submissionPage >= submissionPageCount}>Sau</button>
                        </div>
                      </div>
                      {selectedSubmissionIds.length ? <div className="muted-text">Đã chọn {selectedSubmissionIds.length} kết quả khảo sát.</div> : null}
                      <div className="student-results-list-header">
                        <span>Chọn</span>
                        <span>Đơn vị</span>
                        <span>Người phụ trách</span>
                        <span>Nộp lúc</span>
                        <span>Xem/Tải</span>
                      </div>
                      {submissions.map((item) => (
                        <div className="student-results-list-row" key={item.id}>
                          <label className="vsurvey-result-select" aria-label={`Chọn kết quả ${item.id}`}>
                            <input type="checkbox" checked={selectedSubmissionIds.includes(item.id)} onChange={() => toggleSubmissionSelection(item.id)} />
                          </label>
                          <span>{safeText(item.respondent.unitName, "Chưa có tên đơn vị")}</span>
                          <span>{safeText(item.respondent.contactName, "Chưa có người phụ trách")}</span>
                          <span>{formatTimestamp(item.submittedAt)}</span>
                          <div className="student-results-list-row-actions">
                            <button className="btn btn-ghost btn-small" onClick={() => openSubmissionDetail(item.id)}>Chi tiết</button>
                            <button className="btn btn-primary btn-small" onClick={() => downloadSingleSubmissionWorkbook(item)}>Tải kết quả</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="muted-text">Chưa có phản hồi nào để hiển thị.</div>
                  )
                ) : null}

                {resultsScreen === "analytics" ? (
                  <div className="stack compact">
                    <Card title="Tải kết quả">
                      <div className="stack compact">
                        <label className="lecturer-bank-inline-field">
                          <span>{"L\u1ecdc theo H\u00e0nh tr\u00ecnh"}</span>
                          <select value={journeyExportFilter} onChange={(event) => setJourneyExportFilter(event.target.value as JourneyExportFilter)}>
                            <option value="all">{"T\u1ea5t c\u1ea3 6 H\u00e0nh tr\u00ecnh"}</option>
                            {JOURNEYS.map((journey) => (
                              <option key={journey.id} value={journey.id}>
                                {safeText(journey.title, journey.id.toUpperCase())}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="muted-text">
                          {exportJourney
                            ? `${"\u0110ang xu\u1ea5t ri\u00eang"}: ${safeText(exportJourney.title, exportJourney.id.toUpperCase())}`
                            : "\u0110ang xu\u1ea5t to\u00e0n b\u1ed9 6 H\u00e0nh tr\u00ecnh v\u00e0 ph\u1ea7n b\u1ed5 sung."}
                        </div>
                      </div>
                      <div className="action-row">
                        <button className="btn btn-primary" onClick={() => void getExportRows().then((rows) => downloadSurveyCsv(`${exportFileBase}.csv`, journeyExportFilter === "all" ? rows : filterSubmissionAnswersByQuestions(rows, exportQuestions), exportQuestions))} disabled={!submissionTotal || !activeForm || !exportQuestions.length || busy}>{"CSV theo l\u1ecdc"}</button>
                        <button className="btn btn-ghost" onClick={() => void getExportRows().then((rows) => downloadSurveyWorkbook(`${exportFileBase}.xlsx`, journeyExportFilter === "all" ? rows : filterSubmissionAnswersByQuestions(rows, exportQuestions), exportQuestions))} disabled={!submissionTotal || !activeForm || !exportQuestions.length || busy}>{"Excel theo l\u1ecdc"}</button>
                        <button className="btn btn-ghost" onClick={() => void getExportRows().then((rows) => downloadSurveyJson(`${exportFileBase}.json`, journeyExportFilter === "all" ? rows : filterSubmissionAnswersByQuestions(rows, exportQuestions)))} disabled={!submissionTotal || !activeForm || !exportQuestions.length || busy}>{"JSON theo l\u1ecdc"}</button>
                      </div>
                      <div className="action-row">
                        <button className="btn btn-primary" onClick={() => activeForm && void getExportRows().then((rows) => downloadSurveyCsv(`${activeForm.id}-survey.csv`, rows, questions))} disabled={!submissionTotal || !activeForm || busy}>Tải CSV</button>
                        <button className="btn btn-ghost" onClick={() => activeForm && void getExportRows().then((rows) => downloadSurveyWorkbook(`${activeForm.id}-survey.xlsx`, rows, questions))} disabled={!submissionTotal || !activeForm || busy}>Tải Excel</button>
                        <button className="btn btn-primary" onClick={() => activeForm && void getExportRows().then((rows) => downloadSurveyReportWorkbook(`${activeForm.id}-bao-cao.xlsx`, rows, questions))} disabled={!submissionTotal || !activeForm || busy}>Tải báo cáo Excel</button>
                        <button className="btn btn-ghost" onClick={() => activeForm && void getExportRows().then((rows) => downloadSurveyJson(`${activeForm.id}-survey.json`, rows))} disabled={!submissionTotal || !activeForm || busy}>Tải JSON</button>
                      </div>
                    </Card>

                    <Card title="Thống kê theo phương án">
                      <div className="action-row">
                        <span className="muted-text">
                          {analyticsBusy
                            ? "\u0110ang t\u1ea3i d\u1eef li\u1ec7u th\u1ed1ng k\u00ea to\u00e0n b\u1ed9..."
                            : analyticsRowsAreComplete
                              ? `Th\u1ed1ng k\u00ea tr\u00ean ${analyticsRows.length}/${submissionTotal} ph\u1ea3n h\u1ed3i.`
                              : `\u0110ang hi\u1ec3n th\u1ecb t\u1ea1m tr\u00ean trang hi\u1ec7n t\u1ea1i (${submissions.length}/${submissionTotal} ph\u1ea3n h\u1ed3i).`}
                        </span>
                        <button className="btn btn-ghost btn-small" type="button" onClick={() => activeForm && void loadAnalyticsSubmissions(activeForm.id)} disabled={!activeForm || analyticsBusy || !submissionTotal}>
                          {analyticsBusy ? "\u0110ang t\u1ea3i..." : "T\u1ea3i l\u1ea1i th\u1ed1ng k\u00ea"}
                        </button>
                      </div>
                      <div className="student-results-grid">
                        {analyticsByJourney.flatMap(({ journey, ratingQuestions: journeyQuestions }) =>
                          journeyQuestions.map((question) => {
                            const average = averageForQuestion(question, analyticsRows);
                            const counts = summarizeChoiceCounts(question, analyticsRows);
                            return (
                              <div className="student-result-card" key={question.id}>
                                <strong>{safeText(journey.title, "Hành trình")}</strong>
                                <span>{safeText(question.prompt, "")}</span>
                                <div className="student-result-score">{average ? average.toFixed(1) : "-"}/5</div>
                                <div className="student-choice-summary">
                                  {counts.map((item) => (
                                    <div key={`${question.id}-${item.value}`}>{`${item.label}: ${item.count} người`}</div>
                                  ))}
                                </div>
                              </div>
                            );
                          }),
                        )}
                      </div>
                    </Card>

                    <Card title={"N\u1ed9i dung b\u1ed5 sung"}>
                      <div className="muted-text">
                        {"T\u1ea3i ri\u00eang k\u1ebft qu\u1ea3 cho m\u00e0n N\u1ed9i dung b\u1ed5 sung. D\u1eef li\u1ec7u xu\u1ea5t ra \u0111\u01b0\u1ee3c chu\u1ea9n h\u00f3a UTF-8."}
                      </div>
                      <div className="action-row">
                        <button className="btn btn-primary" onClick={() => void getExportRows().then((rows) => downloadSurveyCsv(`${extraExportFileBase}.csv`, filterSubmissionAnswersByQuestions(rows, extraQuestions), extraQuestions))} disabled={!submissionTotal || !activeForm || !extraQuestions.length || busy}>{"CSV N\u1ed9i dung b\u1ed5 sung"}</button>
                        <button className="btn btn-ghost" onClick={() => void getExportRows().then((rows) => downloadSurveyWorkbook(`${extraExportFileBase}.xlsx`, filterSubmissionAnswersByQuestions(rows, extraQuestions), extraQuestions))} disabled={!submissionTotal || !activeForm || !extraQuestions.length || busy}>{"Excel N\u1ed9i dung b\u1ed5 sung"}</button>
                        <button className="btn btn-ghost" onClick={() => void getExportRows().then((rows) => downloadSurveyJson(`${extraExportFileBase}.json`, filterSubmissionAnswersByQuestions(rows, extraQuestions)))} disabled={!submissionTotal || !activeForm || !extraQuestions.length || busy}>{"JSON N\u1ed9i dung b\u1ed5 sung"}</button>
                      </div>
                    </Card>
                  </div>
                ) : null}

                {resultsScreen === "detail" ? (
                  selectedSubmission ? (
                    <div className="student-results-detail-shell">
                      <div className="student-results-detail-head">
                        <button className="btn btn-ghost btn-small" onClick={() => setResultsScreen("list")}>← Quay lại danh sách kết quả cá nhân</button>
                        <div className="muted-text">Mã phản hồi: {selectedSubmission.id}</div>
                      </div>

                      <div className="student-results-detail-meta">
                        <strong>{safeText(selectedSubmission.respondent.unitName, "Chưa có tên đơn vị")}</strong>
                        <span>{safeText(selectedSubmission.respondent.contactName, "Chưa có người phụ trách")}</span>
                        <span>{safeText(selectedSubmission.respondent.positionName, "Chưa có chức vụ")}</span>
                        <span>{safeText(selectedSubmission.respondent.phone, "Chưa có điện thoại")}</span>
                        <span>{safeText(selectedSubmission.respondent.email, "Chưa có email")}</span>
                        <span>{safeText(selectedSubmission.respondent.completedOn, "Chưa có ngày hoàn thành")}</span>
                        <span>Nộp lúc {formatTimestamp(selectedSubmission.submittedAt)}</span>
                      </div>

                      <div className="action-row">
                        <button className="btn btn-primary btn-small" onClick={() => downloadSingleSubmissionWorkbook(selectedSubmission)}>Excel cá nhân</button>
                        <button className="btn btn-ghost btn-small" onClick={() => downloadTextFile(`${selectedSubmission.respondent.unitName || selectedSubmission.id}.json`, JSON.stringify(selectedSubmission, null, 2), "application/json;charset=utf-8")}>JSON cá nhân</button>
                        <button className="btn btn-danger btn-small" onClick={() => void handleDeleteSelectedSubmission()} disabled={busy}>Xóa phản hồi này</button>
                      </div>

                      <div className="student-survey-question-list">
                        {detailByJourney.map(({ journey, rows }) => (
                          <div className="student-results-journey-block" key={journey.id}>
                            <div className="student-survey-group">{safeText(journey.title, "Nhóm câu hỏi")}</div>
                            {rows.map((row) => (
                              <div className="student-result-card" key={row.key}>
                                <strong>{safeText(row.prompt, "")}</strong>
                                <span>{safeText(row.code, "")}</span>
                                <div className="student-results-answer">{previewAnswer(row.answer)}</div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="muted-text">Chưa có phản hồi để xem chi tiết.</div>
                  )
                ) : null}
              </div>
            </Card>
          </aside>
        </div>
        ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
