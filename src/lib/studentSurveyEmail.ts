import { supabase } from "@/lib/supabaseClient";

export type SurveyEmailSmtpConfig = {
  fromName: string;
  fromEmail: string;
  host: string;
  port: string;
  user: string;
  pass: string;
  secure: boolean;
  requireTLS: boolean;
};

export type SurveyEmailRecipient = {
  email: string;
  name?: string;
  unit?: string;
};

export type SurveyEmailDispatchInput = {
  smtp: SurveyEmailSmtpConfig;
  recipients: SurveyEmailRecipient[];
  subject: string;
  body: string;
  shareLink: string;
  delayMs?: number;
};

export type SurveyEmailDispatchResult = {
  ok: boolean;
  sent: number;
  failed: number;
  results: Array<{
    email: string;
    status: "sent" | "failed";
    error?: string;
    messageId?: string | null;
    accepted?: string[];
    rejected?: string[];
    response?: string;
  }>;
  error?: string;
};

export type SurveyEmailHistoryItem = {
  id: string;
  formId: string | null;
  surveyType: string;
  subject: string;
  body: string;
  shareLink: string;
  recipientText: string;
  recipients: SurveyEmailRecipient[];
  results: SurveyEmailDispatchResult["results"];
  sentCount: number;
  failedCount: number;
  fromName: string;
  fromEmail: string;
  createdAt: string;
};

function makeHistoryId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `survey-email-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mapHistoryRow(row: Record<string, unknown>): SurveyEmailHistoryItem {
  return {
    id: String(row.id || ""),
    formId: row.form_id ? String(row.form_id) : null,
    surveyType: String(row.survey_type || ""),
    subject: String(row.subject || ""),
    body: String(row.body || ""),
    shareLink: String(row.share_link || ""),
    recipientText: String(row.recipient_text || ""),
    recipients: Array.isArray(row.recipients) ? (row.recipients as SurveyEmailRecipient[]) : [],
    results: Array.isArray(row.results) ? (row.results as SurveyEmailDispatchResult["results"]) : [],
    sentCount: Number(row.sent_count || 0),
    failedCount: Number(row.failed_count || 0),
    fromName: String(row.from_name || ""),
    fromEmail: String(row.from_email || ""),
    createdAt: String(row.created_at || ""),
  };
}

export function parseSurveyEmailRecipients(raw: string): SurveyEmailRecipient[] {
  const seen = new Set<string>();
  const recipients: SurveyEmailRecipient[] = [];
  for (const line of String(raw || "").split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean) continue;
    const parts = clean.split(/[,;\t]/).map((part) => part.trim());
    const emailPart = parts.find((part) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part));
    if (!emailPart) continue;
    const email = emailPart.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    const rest = parts.filter((part) => part && part !== emailPart);
    recipients.push({
      email,
      name: rest[0] || "",
      unit: rest[1] || "",
    });
  }
  return recipients;
}

export function buildRecipientTextFromSubmissions(submissions: Array<{ respondent: { email: string; contactName: string; unitName: string } }>) {
  return submissions
    .map((submission) =>
      [submission.respondent.email, submission.respondent.contactName, submission.respondent.unitName]
        .map((value) => String(value || "").trim())
        .join(", "),
    )
    .filter((line) => /^[^\s@]+@[^\s@]+\.[^\s@]+/.test(line))
    .join("\n");
}

export async function dispatchSurveyEmails(input: SurveyEmailDispatchInput): Promise<SurveyEmailDispatchResult> {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const sessionResult = await supabase.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  const token = sessionResult.data.session?.access_token || "";
  if (!token) throw new Error("Bạn cần đăng nhập trước khi gửi email.");

  const response = await fetch("/api/student-survey-email-dispatch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return payload as SurveyEmailDispatchResult;
}

export async function listSurveyEmailHistory(input: { surveyType?: string; formId?: string; limit?: number } = {}): Promise<SurveyEmailHistoryItem[]> {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  let query = supabase
    .from("vcontent_student_survey_email_history")
    .select("id,form_id,survey_type,subject,body,share_link,recipient_text,recipients,results,sent_count,failed_count,from_name,from_email,created_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(Number(input.limit || 20), 100)));
  if (input.surveyType) query = query.eq("survey_type", input.surveyType);
  if (input.formId) query = query.eq("form_id", input.formId);
  const { data, error } = await query;
  if (error) {
    if (/vcontent_student_survey_email_history|relation .* does not exist/i.test(error.message || "")) return [];
    throw error;
  }
  return (data || []).map((row) => mapHistoryRow(row as Record<string, unknown>));
}

export async function saveSurveyEmailHistory(input: {
  formId?: string | null;
  surveyType?: string;
  subject: string;
  body: string;
  shareLink: string;
  recipientText: string;
  recipients: SurveyEmailRecipient[];
  result: SurveyEmailDispatchResult;
  smtp: Pick<SurveyEmailSmtpConfig, "fromName" | "fromEmail">;
}): Promise<SurveyEmailHistoryItem> {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const sessionResult = await supabase.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  const authUserId = sessionResult.data.session?.user?.id || null;
  const row = {
    id: makeHistoryId(),
    form_id: input.formId || null,
    survey_type: input.surveyType || "",
    subject: input.subject,
    body: input.body,
    share_link: input.shareLink,
    recipient_text: input.recipientText,
    recipients: input.recipients,
    results: input.result.results,
    sent_count: input.result.sent,
    failed_count: input.result.failed,
    from_name: input.smtp.fromName,
    from_email: input.smtp.fromEmail,
    created_by_auth_user_id: authUserId,
  };
  const { data, error } = await supabase
    .from("vcontent_student_survey_email_history")
    .insert(row)
    .select("id,form_id,survey_type,subject,body,share_link,recipient_text,recipients,results,sent_count,failed_count,from_name,from_email,created_at")
    .single();
  if (error) throw error;
  return mapHistoryRow(data as Record<string, unknown>);
}
