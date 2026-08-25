export type VEventQuestionType = 'single_choice';
export type VEventStatus = 'draft' | 'active' | 'completed' | 'archived';
export type VEventQuestionStatus = 'pending' | 'open' | 'closed';
export type VEventResultsVisibility = 'instant' | 'hidden_until_reveal' | 'private';
export type VEventPresentLayout = 'bars' | 'cards' | 'donut' | 'scale';

export type VEventOption = {
  id: string;
  label: string;
};

export type VEventQuestionDraft = {
  id: string;
  questionNumber: number;
  title: string;
  questionType: VEventQuestionType;
  options: VEventOption[];
};

export type VEvent = {
  id: string;
  code: string;
  title: string;
  description: string;
  status: VEventStatus;
  activeQuestionId: string | null;
  participationEnabled: boolean;
  resultsVisibility: VEventResultsVisibility;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type VEventQuestion = VEventQuestionDraft & {
  eventId: string;
  status: VEventQuestionStatus;
  settings: Record<string, unknown>;
  openedAt: string | null;
  closedAt: string | null;
};

export type VEventPublicBundle = {
  event: VEvent;
  activeQuestion: VEventQuestion | null;
  response: VEventResponse | null;
};

export type VEventPublicLoadOptions = {
  touchParticipant?: boolean;
};

export type VEventResponse = {
  id: string;
  eventId: string;
  questionId: string;
  participantKey: string;
  optionId: string;
  responseValue: string;
  submittedAt: string;
  updatedAt: string;
};

export type VEventQuestionStats = {
  questionId: string;
  optionId: string;
  label: string;
  count: number;
  percent: number;
};

export type CreateVEventInput = {
  title: string;
  description?: string;
  code?: string;
  questions: VEventQuestionDraft[];
  resultsVisibility?: VEventResultsVisibility;
};

export type VEventCopyDraft = {
  title: string;
  description: string;
  code: string;
  questions: VEventQuestionDraft[];
  sourceEventId: string;
  sourceEventTitle: string;
  resultsVisibility: VEventResultsVisibility;
};

type SupabaseLike = {
  auth: {
    getSession: () => Promise<{ data: { session: { user: { id: string } } | null }; error: Error | null }>;
  };
  from: (table: string) => any;
  rpc: (name: string, params?: Record<string, unknown>) => any;
};

const PARTICIPANT_STORAGE_PREFIX = 'vcontent.vEvents.participant';
const VITE_ENV = import.meta.env || {};
const SUPABASE_REST_URL = VITE_ENV.VITE_SUPABASE_URL ? `${VITE_ENV.VITE_SUPABASE_URL}/rest/v1` : '';
const SUPABASE_ANON_KEY = VITE_ENV.VITE_SUPABASE_ANON_KEY || '';

async function callPublicVEventRpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  if (!SUPABASE_REST_URL || !SUPABASE_ANON_KEY) {
    const client = await requireSupabase();
    const { data, error } = await client.rpc(name, params);
    if (error) throw error;
    return data as T;
  }

  const response = await fetch(`${SUPABASE_REST_URL}/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `V-event request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function compactLine(value: string) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeMarker(value: string) {
  return compactLine(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

function makeQuestionDraft(questionNumber: number, title: string, optionLabels: string[]): VEventQuestionDraft {
  const cleanTitle = compactLine(title).replace(/^[:：]\s*/, '');
  const options = optionLabels
    .map(compactLine)
    .filter(Boolean)
    .map((label, index) => ({
      id: `q${questionNumber}-o${index + 1}`,
      label,
    }));

  return {
    id: `q${questionNumber}`,
    questionNumber,
    title: cleanTitle,
    questionType: 'single_choice',
    options,
  };
}

function stripOptionMarker(value: string) {
  return compactLine(value)
    .replace(/^(?:[-*•·‣▪◦]\s+|\(?[A-Za-z0-9]{1,3}[\).:-]\s+)/, '')
    .trim();
}

function hasOptionMarker(value: string) {
  return /^\s*(?:[-*•·‣▪◦]\s+|\(?[A-Za-z0-9]{1,3}[\).:-]\s+)/.test(value || '');
}

function isIndentedLine(value: string) {
  return /^\s+/.test(value || '');
}

export function parseVEventQuestionsFromText(text: string): VEventQuestionDraft[] {
  const lines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((raw) => ({ raw, text: compactLine(raw) }))
    .filter((line) => line.text);

  const questions: VEventQuestionDraft[] = [];
  let currentNumber = 0;
  let currentTitle = '';
  let optionLabels: string[] = [];
  let readingOptions = false;

  const flush = () => {
    if (!currentTitle || !optionLabels.length) return;
    questions.push(makeQuestionDraft(currentNumber || questions.length + 1, currentTitle, optionLabels));
    currentTitle = '';
    optionLabels = [];
    readingOptions = false;
  };

  for (const lineItem of lines) {
    const line = lineItem.text;
    const marker = normalizeMarker(line);
    const mentimeterMatch = marker.match(/^mentimeter\s+(\d+)/);
    if (mentimeterMatch) {
      flush();
      currentNumber = Number(mentimeterMatch[1] || questions.length + 1);
      continue;
    }

    if (marker.startsWith('cau hoi:')) {
      const [, ...parts] = line.split(':');
      currentTitle = compactLine(parts.join(':'));
      readingOptions = false;
      continue;
    }

    if (marker === 'cau hoi') {
      readingOptions = false;
      continue;
    }

    if (marker.startsWith('cac dap an lua chon') || marker.startsWith('dap an lua chon')) {
      readingOptions = true;
      continue;
    }

    if (readingOptions) {
      const optionText = stripOptionMarker(line);
      if (isIndentedLine(lineItem.raw) && !hasOptionMarker(lineItem.raw) && optionLabels.length) {
        optionLabels[optionLabels.length - 1] = compactLine(`${optionLabels[optionLabels.length - 1]} ${optionText}`);
      } else {
        optionLabels.push(optionText);
      }
    }
  }

  flush();
  return questions;
}

export function buildVEventJoinLink(code: string) {
  const cleanCode = String(code || '').trim().toUpperCase();
  if (typeof window === 'undefined') return `/v-events/join/${encodeURIComponent(cleanCode)}`;
  return `${window.location.origin}/v-events/join/${encodeURIComponent(cleanCode)}`;
}

export function buildVEventPresentLink(eventId: string) {
  const cleanId = String(eventId || '').trim();
  if (typeof window === 'undefined') return `/v-events/present/${encodeURIComponent(cleanId)}`;
  return `${window.location.origin}/v-events/present/${encodeURIComponent(cleanId)}`;
}

export function buildVEventPresentInviteModel(event: Pick<VEvent, 'code'> | null | undefined) {
  const code = sanitizeVEventCode(event?.code || '');
  return {
    code: code || '-',
    qrValue: code ? buildVEventJoinLink(code) : '',
    shortUrlLabel: 'v-events/join',
  };
}

export function getVEventPresentLayout(questionNumber: number): VEventPresentLayout {
  const normalized = Math.max(1, Math.floor(Number(questionNumber) || 1));
  const slot = (normalized - 1) % 4;
  if (slot === 0) return 'bars';
  if (slot === 1) return 'cards';
  if (slot === 2) return 'donut';
  return 'scale';
}

export function sanitizeVEventCode(value: string) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[Đ]/g, 'D')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

export function makeVEventCode(title: string) {
  const base = sanitizeVEventCode(title).slice(0, 8);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base || 'VEVENT'}${suffix}`.slice(0, 12);
}

export function buildVEventCopyDraft(event: VEvent, questions: VEventQuestion[]): VEventCopyDraft {
  return {
    title: `${event.title} - bản copy`,
    description: event.description || '',
    code: makeVEventCode(event.title),
    sourceEventId: event.id,
    sourceEventTitle: event.title,
    resultsVisibility: event.resultsVisibility,
    questions: questions.map((question, index) => ({
      id: `q${index + 1}`,
      questionNumber: index + 1,
      title: question.title,
      questionType: question.questionType,
      options: question.options.map((option, optionIndex) => ({
        id: `q${index + 1}-o${optionIndex + 1}`,
        label: option.label,
      })),
    })),
  };
}

export function getOrCreateAnonymousVEventParticipantKey(eventId: string) {
  const storageKey = `${PARTICIPANT_STORAGE_PREFIX}.${eventId}`;
  if (typeof window === 'undefined' || !window.localStorage) {
    return `anon-${eventId}-${Math.random().toString(36).slice(2, 10)}`;
  }
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;
  const generated = `anon-${eventId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  window.localStorage.setItem(storageKey, generated);
  return generated;
}

export function buildVEventPublicLoadRpcArgs(code: string, participantKey = '', options: VEventPublicLoadOptions = {}) {
  return {
    p_code: sanitizeVEventCode(code),
    p_participant_key: participantKey,
    p_touch_participant: options.touchParticipant !== false,
  };
}

export function buildVEventTouchParticipantRpcArgs(code: string, participantKey = '') {
  return {
    p_code: sanitizeVEventCode(code),
    p_participant_key: participantKey.trim(),
  };
}

export function buildVEventSwitchQuestionRpcArgs(eventId: string, questionId: string) {
  return {
    p_event_id: eventId.trim(),
    p_question_id: questionId.trim(),
  };
}

async function requireSupabase(): Promise<SupabaseLike> {
  const mod = await import('@/lib/supabaseClient');
  if (!mod.supabase) throw new Error('Supabase chưa được cấu hình.');
  return mod.supabase as unknown as SupabaseLike;
}

function mapEventRow(row: any): VEvent {
  return {
    id: String(row.id || ''),
    code: String(row.code || ''),
    title: String(row.title || ''),
    description: String(row.description || ''),
    status: (row.status || 'draft') as VEventStatus,
    activeQuestionId: row.active_question_id ? String(row.active_question_id) : null,
    participationEnabled: row.participation_enabled !== false,
    resultsVisibility: (row.results_visibility || 'hidden_until_reveal') as VEventResultsVisibility,
    settings: row.settings && typeof row.settings === 'object' ? row.settings : {},
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || row.created_at || new Date().toISOString()),
  };
}

function mapQuestionRow(row: any): VEventQuestion {
  const questionNumber = Number(row.question_number || 0);
  return {
    id: String(row.id || ''),
    eventId: String(row.event_id || ''),
    questionNumber,
    title: String(row.title || ''),
    questionType: (row.question_type || 'single_choice') as VEventQuestionType,
    options: Array.isArray(row.options) ? row.options : [],
    status: (row.status || 'pending') as VEventQuestionStatus,
    settings: row.settings && typeof row.settings === 'object' ? row.settings : {},
    openedAt: row.opened_at ? String(row.opened_at) : null,
    closedAt: row.closed_at ? String(row.closed_at) : null,
  };
}

function mapResponseRow(row: any): VEventResponse {
  return {
    id: String(row.id || ''),
    eventId: String(row.event_id || ''),
    questionId: String(row.question_id || ''),
    participantKey: String(row.participant_key || ''),
    optionId: String(row.option_id || ''),
    responseValue: String(row.response_value || ''),
    submittedAt: String(row.submitted_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || row.submitted_at || new Date().toISOString()),
  };
}

export function canEditVEventQuestionStructure(question: Pick<VEventQuestion, 'id' | 'status'>, stats: VEventQuestionStats[]) {
  if (question.status === 'open') return false;
  const voteCount = stats
    .filter((item) => item.questionId === question.id)
    .reduce((sum, item) => sum + item.count, 0);
  return voteCount === 0;
}

export async function listVEvents(): Promise<VEvent[]> {
  const client = await requireSupabase();
  const { data, error } = await client
    .from('vcontent_live_events')
    .select('id,code,title,description,status,active_question_id,participation_enabled,results_visibility,settings,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapEventRow);
}

export async function createVEvent(input: CreateVEventInput): Promise<VEvent> {
  const client = await requireSupabase();
  const sessionResult = await client.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;

  const now = Date.now().toString(36);
  const eventId = `vevent-${now}-${Math.random().toString(36).slice(2, 7)}`;
  const code = sanitizeVEventCode(input.code || '') || makeVEventCode(input.title);
  const validQuestions = input.questions
    .map((question) => ({
      ...question,
      title: compactLine(question.title),
      options: question.options
        .map((option) => ({ ...option, label: compactLine(option.label) }))
        .filter((option) => option.label),
    }))
    .filter((question) => question.title && question.options.length);
  if (!validQuestions.length) throw new Error('Cần ít nhất một câu hỏi có đáp án trước khi tạo V-event.');

  const { data, error } = await client
    .from('vcontent_live_events')
    .insert({
      id: eventId,
      code,
      title: input.title.trim(),
      description: String(input.description || '').trim(),
      status: 'draft',
      results_visibility: input.resultsVisibility || 'hidden_until_reveal',
      settings: {},
      created_by_auth_user_id: sessionResult.data.session?.user?.id || null,
    })
    .select('id,code,title,description,status,active_question_id,participation_enabled,results_visibility,settings,created_at,updated_at')
    .single();
  if (error) throw error;

  const questionRows = validQuestions.map((question, index) => ({
    id: `${eventId}-q${index + 1}`,
    event_id: eventId,
    question_number: index + 1,
    title: question.title,
    question_type: question.questionType,
    options: question.options.map((option, optionIndex) => ({ id: `q${index + 1}-o${optionIndex + 1}`, label: option.label })),
    status: 'pending',
    settings: {},
  }));
  const { error: questionError } = await client.from('vcontent_live_event_questions').insert(questionRows);
  if (questionError) throw questionError;

  return mapEventRow(data);
}

export async function getVEvent(eventId: string): Promise<{ event: VEvent; questions: VEventQuestion[] } | null> {
  const client = await requireSupabase();
  const { data, error } = await client
    .from('vcontent_live_events')
    .select('id,code,title,description,status,active_question_id,participation_enabled,results_visibility,settings,created_at,updated_at')
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: questionRows, error: questionError } = await client
    .from('vcontent_live_event_questions')
    .select('id,event_id,question_number,title,question_type,options,status,settings,opened_at,closed_at')
    .eq('event_id', eventId)
    .order('question_number', { ascending: true });
  if (questionError) throw questionError;
  return { event: mapEventRow(data), questions: (questionRows || []).map(mapQuestionRow) };
}

export async function getPublicVEventByCode(code: string, participantKey = '', options: VEventPublicLoadOptions = {}): Promise<VEventPublicBundle | null> {
  const payload = await callPublicVEventRpc<any>('vcontent_get_live_event_public_by_code', buildVEventPublicLoadRpcArgs(code, participantKey, options));
  if (!payload?.event) return null;
  return {
    event: mapEventRow(payload.event),
    activeQuestion: payload.activeQuestion ? mapQuestionRow(payload.activeQuestion) : null,
    response: payload.response ? mapResponseRow(payload.response) : null,
  };
}

export async function touchPublicVEventParticipant(code: string, participantKey = '') {
  const data = await callPublicVEventRpc<boolean>('vcontent_touch_live_event_participant', buildVEventTouchParticipantRpcArgs(code, participantKey));
  return Boolean(data);
}

export async function updateVEventState(eventId: string, patch: Partial<Pick<VEvent, 'status' | 'activeQuestionId' | 'participationEnabled' | 'resultsVisibility'>>) {
  const client = await requireSupabase();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status) row.status = patch.status;
  if (patch.activeQuestionId !== undefined) row.active_question_id = patch.activeQuestionId;
  if (patch.participationEnabled !== undefined) row.participation_enabled = patch.participationEnabled;
  if (patch.resultsVisibility) row.results_visibility = patch.resultsVisibility;
  const { data, error } = await client
    .from('vcontent_live_events')
    .update(row)
    .eq('id', eventId)
    .select('id,code,title,description,status,active_question_id,participation_enabled,results_visibility,settings,created_at,updated_at')
    .single();
  if (error) throw error;
  return mapEventRow(data);
}

export async function updateVEventDetails(eventId: string, patch: Partial<Pick<VEvent, 'title' | 'description' | 'code'>>) {
  const client = await requireSupabase();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.description !== undefined) row.description = patch.description.trim();
  if (patch.code !== undefined) row.code = sanitizeVEventCode(patch.code);
  const { data, error } = await client
    .from('vcontent_live_events')
    .update(row)
    .eq('id', eventId)
    .select('id,code,title,description,status,active_question_id,participation_enabled,results_visibility,settings,created_at,updated_at')
    .single();
  if (error) throw error;
  return mapEventRow(data);
}

export async function deleteVEvent(eventId: string) {
  const client = await requireSupabase();
  const { error } = await client.from('vcontent_live_events').delete().eq('id', eventId);
  if (error) throw error;
  return { deleted: true };
}

export async function clearVEventResults(eventId: string) {
  const client = await requireSupabase();
  const now = new Date().toISOString();

  const { error: responsesError } = await client
    .from('vcontent_live_event_responses')
    .delete()
    .eq('event_id', eventId);
  if (responsesError) throw responsesError;

  const { error: participantsError } = await client
    .from('vcontent_live_event_participants')
    .delete()
    .eq('event_id', eventId);
  if (participantsError) throw participantsError;

  const { error: questionsError } = await client
    .from('vcontent_live_event_questions')
    .update({
      status: 'pending',
      opened_at: null,
      closed_at: null,
      updated_at: now,
    })
    .eq('event_id', eventId);
  if (questionsError) throw questionsError;

  const { error: eventError } = await client
    .from('vcontent_live_events')
    .update({
      status: 'draft',
      active_question_id: null,
      participation_enabled: true,
      updated_at: now,
    })
    .eq('id', eventId);
  if (eventError) throw eventError;

  return { cleared: true };
}

export async function updateVEventQuestionStatus(questionId: string, status: VEventQuestionStatus) {
  const client = await requireSupabase();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: now };
  if (status === 'open') patch.opened_at = now;
  if (status === 'closed') patch.closed_at = now;
  const { data, error } = await client
    .from('vcontent_live_event_questions')
    .update(patch)
    .eq('id', questionId)
    .select('id,event_id,question_number,title,question_type,options,status,settings,opened_at,closed_at')
    .single();
  if (error) throw error;
  return mapQuestionRow(data);
}

export async function updateVEventQuestionDetails(questionId: string, patch: Partial<Pick<VEventQuestion, 'title' | 'options'>>) {
  const client = await requireSupabase();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const title = compactLine(patch.title);
    if (!title) throw new Error('Cau hoi khong duoc de trong.');
    row.title = title;
  }
  if (patch.options !== undefined) {
    const options = patch.options
      .map((option) => ({
        id: compactLine(option.id),
        label: compactLine(option.label),
      }))
      .filter((option) => option.id && option.label);
    if (!options.length) throw new Error('Can it nhat mot dap an hop le.');
    row.options = options;
  }
  const { data, error } = await client
    .from('vcontent_live_event_questions')
    .update(row)
    .eq('id', questionId)
    .select('id,event_id,question_number,title,question_type,options,status,settings,opened_at,closed_at')
    .single();
  if (error) throw error;
  return mapQuestionRow(data);
}

export async function switchVEventQuestion(eventId: string, questionId: string): Promise<{ event: VEvent; questions: VEventQuestion[] }> {
  const client = await requireSupabase();
  const { data, error } = await client.rpc('vcontent_switch_live_event_question', buildVEventSwitchQuestionRpcArgs(eventId, questionId));
  if (error) throw error;
  const payload = data as any;
  return {
    event: mapEventRow(payload.event),
    questions: Array.isArray(payload.questions) ? payload.questions.map(mapQuestionRow) : [],
  };
}

export async function submitVEventResponse(input: { code: string; questionId: string; participantKey: string; optionId: string; responseValue?: string }) {
  const data = await callPublicVEventRpc<any>('vcontent_submit_live_event_response', {
    p_code: sanitizeVEventCode(input.code),
    p_question_id: input.questionId,
    p_participant_key: input.participantKey,
    p_option_id: input.optionId,
    p_response_value: input.responseValue || '',
  });
  return mapResponseRow(data);
}

export async function listVEventStats(eventId: string): Promise<VEventQuestionStats[]> {
  const client = await requireSupabase();
  const { data, error } = await client.rpc('vcontent_get_live_event_question_stats', { p_event_id: eventId });
  if (error) throw error;
  return ((data || []) as any[]).map((row) => ({
    questionId: String(row.question_id || ''),
    optionId: String(row.option_id || ''),
    label: String(row.label || ''),
    count: Number(row.count || 0),
    percent: Number(row.percent || 0),
  }));
}
