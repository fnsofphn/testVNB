import { supabase } from '@/lib/supabaseClient';
import { isVDiscussionContentContributionType } from '@/features/vdiscussion/domain/contributionSchemas';
import { assertDiscussionPayloadWithinLimit } from '@/features/vdiscussion/domain/payloadGuards';

export class VDiscussionApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VDiscussionApiError';
  }
}

export type VDiscussionStatus = 'draft' | 'active' | 'completed' | 'archived';

export type VDiscussionEvent = {
  id: string;
  title: string;
  description?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  createdByProfileId?: string | null;
  createdByName?: string | null;
  status: VDiscussionStatus;
  maxGroupSize: number;
  minGroupSize: number;
  autoCreateGroups: boolean;
  topicCount: number;
  participantCount: number;
  groupCount: number;
  metadata: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type VDiscussionTopic = {
  id: string;
  eventId: string;
  title: string;
  description?: string | null;
  topicNumber: number;
  isActive: boolean;
  durationMinutes: number;
  subProblems: Array<{ title: string; description?: string }>;
  metadata: Record<string, unknown>;
};

export type VDiscussionParticipant = {
  id: string;
  eventId: string;
  profileId?: string | null;
  email: string;
  fullName: string;
  studentCode?: string | null;
  status: string;
};

export type VDiscussionGroup = {
  id: string;
  eventId: string;
  name: string;
  maxMembers: number;
  leaderParticipantId?: string | null;
  interactionStatus?: string | null;
  teacherScore?: number | null;
  teacherComment?: string | null;
  members?: VDiscussionParticipant[];
};

export type VDiscussionSession = {
  id: string;
  eventId: string;
  groupId?: string | null;
  topicId?: string | null;
  status: string;
  currentStep: number;
  group?: VDiscussionGroup | null;
  topic?: VDiscussionTopic | null;
};

export type VDiscussionStudentAssignment = {
  participant: VDiscussionParticipant;
  group: VDiscussionGroup;
  session: VDiscussionSession;
  event: VDiscussionEvent | null;
  topic: VDiscussionTopic | null;
};

export type VDiscussionStep = {
  id: string;
  sessionId: string;
  stepNumber: number;
  status: string;
  summaryData: Record<string, unknown>;
};

export type VDiscussionContribution = {
  id: string;
  stepId: string;
  profileId?: string | null;
  participantId?: string | null;
  authorName?: string | null;
  type: string;
  content: string;
  metadata: Record<string, unknown>;
  parentId?: string | null;
  upvotesCount: number;
  downvotesCount: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type PlxLeaderVoteState = {
  stepId: string;
  roundId: string;
  startedAt: string;
  deadlineAt: string;
  durationSeconds: number;
  status: 'active' | 'completed';
  leaderParticipantId?: string | null;
  confirmedCount: number;
  memberCount: number;
  serverNow: string;
};

export type VDiscussionChatMessage = {
  id: string;
  sessionId: string;
  profileId?: string | null;
  participantId?: string | null;
  authorName?: string | null;
  message: string;
  metadata: Record<string, unknown>;
  parentId?: string | null;
  actions?: Record<string, number>;
  createdAt?: string | null;
};

export type VDiscussionEventDetail = VDiscussionEvent & {
  topics: VDiscussionTopic[];
  participants: VDiscussionParticipant[];
  groups: VDiscussionGroup[];
  sessions: VDiscussionSession[];
};

export type VDiscussionGroupMemberMonitor = {
  participant: VDiscussionParticipant;
  isLeader: boolean;
  hasJoined: boolean;
  isActive: boolean;
  contributionCount: number;
};

export type VDiscussionGroupResult = {
  score: number | null;
  activeParticipantIds: string[];
  bonusPoints: number;
  submittedAt?: string | null;
};

export type VDiscussionGroupMonitor = {
  group: VDiscussionGroup;
  session: VDiscussionSession | null;
  topic: VDiscussionTopic | null;
  steps: VDiscussionStep[];
  contributions: VDiscussionContribution[];
  members: VDiscussionGroupMemberMonitor[];
  joinedCount: number;
  contributedCount: number;
  totalMembers: number;
  completionPercent: number;
  currentStep: number;
  progressLabel: string;
  result: VDiscussionGroupResult;
};

export type VDiscussionGroupMonitorSummary = VDiscussionGroupMonitor & {
  finalLocked: boolean;
};

export type VDiscussionEventPayload = {
  id?: string;
  title: string;
  description?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  status?: VDiscussionStatus;
  maxGroupSize?: number;
  minGroupSize?: number;
  autoCreateGroups?: boolean;
  durationMinutes?: number;
  metadata?: Record<string, unknown>;
};

export type VDiscussionTopicPayload = {
  id?: string;
  eventId: string;
  title: string;
  description?: string | null;
  topicNumber?: number;
  isActive?: boolean;
  durationMinutes?: number;
  subProblems?: Array<{ title: string; description?: string | null }>;
  metadata?: Record<string, unknown>;
};

export type VDiscussionParticipantPayload = {
  id?: string;
  eventId: string;
  profileId?: string | null;
  email?: string | null;
  fullName: string;
  studentCode?: string | null;
  groupName?: string | null;
  status?: string;
};

export type VDiscussionGroupPayload = {
  id?: string;
  eventId: string;
  name: string;
  maxMembers?: number;
  leaderParticipantId?: string | null;
  interactionStatus?: string | null;
};

export type VDiscussionCompleteSetupPayload = {
  event: VDiscussionEventPayload;
  topics: Array<{
    title: string;
    description?: string | null;
    topicNumber?: number;
    durationMinutes?: number;
    subProblems?: Array<{ title: string; description?: string | null }>;
    metadata?: Record<string, unknown>;
  }>;
  participants: VDiscussionParticipantPayload[];
  numberOfGroups: number;
  topicGroupMode?: 'auto' | 'manual';
  topicGroupAssignments?: number[];
  publish?: boolean;
  metadata?: Record<string, unknown>;
};

export function getDiscussionKind(metadata?: Record<string, unknown> | null) {
  const value = String(metadata?.discussionKind || '').trim();
  if (value) return value;
  const setupSource = String(metadata?.setupSource || '').trim();
  if (metadata?.classId || metadata?.importedFromClassDetail || metadata?.sourceEventId || setupSource === 'class-discussion-import') return 'class-instance';
  if (setupSource === 'native-library') return 'library-template';
  return 'standalone-instance';
}

export function isDiscussionLibraryTemplate(event: { metadata?: Record<string, unknown> | null }) {
  return getDiscussionKind(event.metadata) === 'library-template';
}

export function isDiscussionClassInstance(event: { metadata?: Record<string, unknown> | null }) {
  return getDiscussionKind(event.metadata) === 'class-instance';
}

function requireSupabase() {
  if (!supabase) throw new VDiscussionApiError('Supabase VContent chua duoc cau hinh.');
  return supabase;
}

async function withDiscussionTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new VDiscussionApiError(`Qua thoi gian tai du lieu VDiscussion: ${label}.`)), 12000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeScore10(value: unknown) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(10, score));
}

async function getCurrentVContentProfileId() {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw new VDiscussionApiError(userError.message);
  const user = userData.user;
  if (!user) return null;

  const { data, error } = await client
    .from('vcontent_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .maybeSingle();
  if (error) throw new VDiscussionApiError(error.message);
  if (data?.id) return data.id;

  if (!user.email) return null;
  const { data: emailData, error: emailError } = await client
    .from('vcontent_profiles')
    .select('id')
    .eq('email', user.email)
    .eq('active', true)
    .maybeSingle();
  if (emailError) throw new VDiscussionApiError(emailError.message);
  return emailData?.id || null;
}

async function resolveVContentProfileId(explicitProfileId?: string | null) {
  if (explicitProfileId) return explicitProfileId;
  return getCurrentVContentProfileId();
}

function sanitizeId(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function fallbackId(seed: string, prefix: string) {
  const rawSeed = String(seed || '').trim();
  const base = sanitizeId(rawSeed);
  if (base) return `${prefix}-${base.slice(0, 72)}-${stableHash(rawSeed)}`;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function runtimeId(seed: string, prefix: string) {
  const base = sanitizeId(seed).slice(0, 64) || 'item';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${base}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${base}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function discussionMutationKey(stepId: string, type: string) {
  const prefix = `vdiscussion:${sanitizeId(stepId)}:${sanitizeId(type)}`;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2, 14)}`;
}

function normalizeDate(value?: string | null) {
  return value ? value : null;
}

function metadataOf(row: any) {
  return row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
}

function parseArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function averageScoreMap(values: Record<string, unknown>) {
  const scores = Object.values(values)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!scores.length) return null;
  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return Math.round(average * 100) / 100;
}

function sumScoreMap(values: Record<string, unknown>) {
  const scores = Object.values(values)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!scores.length) return null;
  return Math.round(scores.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

function scoreNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.min(10, numberValue)) : null;
}

function nonNegativeScoreNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, numberValue) : null;
}

function calculateFinalScoreFromRule(scores: Record<string, unknown>, rule: Record<string, any> | null) {
  const components = Array.isArray(rule?.components)
    ? rule.components.filter((component: any) => ['attendance', 'quiz', 'reflection', 'discussion', 'game'].includes(component.key) && Math.max(0, Number(component.weight || 0)) > 0)
    : [];
  if (!components.length) return null;
  const totalWeight = components.reduce((sum: number, component: any) => sum + Math.max(0, Number(component.weight || 0)), 0);
  if (totalWeight <= 0) return null;
  const hasAllScores = components.every((component: any) => scoreNumber(scores[component.key]) != null);
  if (!hasAllScores) return null;
  const weighted = components.reduce((sum: number, component: any) => sum + (scoreNumber(scores[component.key]) ?? 0) * Math.max(0, Number(component.weight || 0)), 0);
  const discussionBonus = nonNegativeScoreNumber(scores.discussionBonus) ?? 0;
  return Math.round(Math.max(0, Math.min(10, (weighted / totalWeight) + discussionBonus)) * 100) / 100;
}

function mapEventRow(row: any): VDiscussionEvent {
  const metadata = metadataOf(row);
  const createdBy = row.created_by_profile && typeof row.created_by_profile === 'object' ? row.created_by_profile : null;
  return {
    id: String(row.id || ''),
    title: row.title || '',
    description: row.description || '',
    startAt: row.start_at || null,
    endAt: row.end_at || null,
    createdByProfileId: row.created_by_profile_id || null,
    createdByName: createdBy?.full_name || createdBy?.email || '',
    status: row.status || 'draft',
    maxGroupSize: Number(metadata.maxGroupSize || 8),
    minGroupSize: Number(metadata.minGroupSize || 4),
    autoCreateGroups: metadata.autoCreateGroups !== false,
    topicCount: Array.isArray(row.topics) ? row.topics.length : Number(row.topic_count || 0),
    participantCount: Array.isArray(row.participants) ? row.participants.length : Number(row.participant_count || 0),
    groupCount: Array.isArray(row.groups) ? row.groups.length : Number(row.group_count || 0),
    metadata,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapTopicRow(row: any): VDiscussionTopic {
  const subProblems = parseArray(row.sub_problems).map((item: any) => ({
    title: typeof item === 'string' ? item : String(item?.title || item?.label || ''),
    description: typeof item === 'object' ? String(item?.description || item?.detail || '') : '',
  })).filter((item) => item.title);
  return {
    id: String(row.id || ''),
    eventId: String(row.event_id || ''),
    title: row.title || '',
    description: row.description || '',
    topicNumber: Number(row.topic_number || 1),
    isActive: row.is_active !== false,
    durationMinutes: Number(row.duration_minutes || 60),
    subProblems,
    metadata: metadataOf(row),
  };
}

function mapParticipantRow(row: any): VDiscussionParticipant {
  return {
    id: String(row.id || ''),
    eventId: String(row.event_id || ''),
    profileId: row.profile_id || null,
    email: row.email || '',
    fullName: row.full_name || '',
    studentCode: row.student_code || '',
    status: row.status || 'active',
  };
}

function mapGroupRow(row: any, participantsById?: Map<string, VDiscussionParticipant>): VDiscussionGroup {
  const memberRows = Array.isArray(row.members) ? row.members : [];
  return {
    id: String(row.id || ''),
    eventId: String(row.event_id || ''),
    name: row.name || '',
    maxMembers: Number(row.max_members || 8),
    leaderParticipantId: row.leader_participant_id || null,
    interactionStatus: row.interaction_status || 'not_started',
    teacherScore: row.teacher_score == null ? null : Number(row.teacher_score),
    teacherComment: row.teacher_comment || '',
    members: memberRows
      .map((member: any) => {
        const participantId = String(member.participant_id || '');
        return participantsById?.get(participantId) || (member.participant ? mapParticipantRow(member.participant) : null);
      })
      .filter(Boolean),
  };
}

function mapSessionRow(row: any): VDiscussionSession {
  return {
    id: String(row.id || ''),
    eventId: String(row.event_id || ''),
    groupId: row.group_id || null,
    topicId: row.topic_id || null,
    status: row.status || 'not_started',
    currentStep: Number(row.current_step || 1),
    group: row.group ? mapGroupRow(row.group) : null,
    topic: row.topic ? mapTopicRow(row.topic) : null,
  };
}

function mapStepRow(row: any): VDiscussionStep {
  return {
    id: String(row.id || ''),
    sessionId: String(row.session_id || ''),
    stepNumber: Number(row.step_number || 1),
    status: row.status || 'pending',
    summaryData: metadataOf({ metadata: row.summary_data }),
  };
}

function mapContributionRow(row: any): VDiscussionContribution {
  const profile = row.profile && typeof row.profile === 'object' ? row.profile : null;
  const participant = row.participant && typeof row.participant === 'object' ? row.participant : null;
  return {
    id: String(row.id || ''),
    stepId: String(row.step_id || ''),
    profileId: row.profile_id || null,
    participantId: row.participant_id || null,
    authorName: participant?.full_name || profile?.full_name || profile?.email || null,
    type: row.type || 'comment',
    content: row.content || '',
    metadata: metadataOf(row),
    parentId: row.parent_id || null,
    upvotesCount: Number(row.upvotes_count || 0),
    downvotesCount: Number(row.downvotes_count || 0),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapPlxLeaderVoteState(value: unknown): PlxLeaderVoteState {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const status = String(row.status || 'active');
  return {
    stepId: String(row.stepId || ''),
    roundId: String(row.roundId || ''),
    startedAt: String(row.startedAt || ''),
    deadlineAt: String(row.deadlineAt || ''),
    durationSeconds: Number(row.durationSeconds || 90),
    status: status === 'completed' ? 'completed' : 'active',
    leaderParticipantId: row.leaderParticipantId ? String(row.leaderParticipantId) : null,
    confirmedCount: Number(row.confirmedCount || 0),
    memberCount: Number(row.memberCount || 0),
    serverNow: String(row.serverNow || ''),
  };
}

function mapChatRow(row: any): VDiscussionChatMessage {
  const profile = row.profile && typeof row.profile === 'object' ? row.profile : null;
  const participant = row.participant && typeof row.participant === 'object' ? row.participant : null;
  const actions = Array.isArray(row.actions)
    ? row.actions.reduce((acc: Record<string, number>, action: any) => {
      const type = String(action.action_type || '');
      if (type) acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {})
    : {};
  return {
    id: String(row.id || ''),
    sessionId: String(row.session_id || ''),
    profileId: row.profile_id || null,
    participantId: row.participant_id || null,
    authorName: participant?.full_name || profile?.full_name || profile?.email || null,
    message: row.message || '',
    metadata: metadataOf(row),
    parentId: row.parent_id || null,
    actions,
    createdAt: row.created_at || null,
  };
}

function parseJsonRecord(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function parseGroupResult(group: VDiscussionGroup): VDiscussionGroupResult {
  const parsed = parseJsonRecord(group.teacherComment);
  return {
    score: group.teacherScore ?? null,
    activeParticipantIds: Array.isArray(parsed.activeParticipantIds) ? parsed.activeParticipantIds.map(String) : [],
    bonusPoints: Number(parsed.bonusPoints || 0),
    submittedAt: parsed.submittedAt || null,
  };
}

function isContentContribution(contribution: VDiscussionContribution) {
  return isVDiscussionContentContributionType(contribution.type);
}

function calculateGroupCompletion(session: VDiscussionSession | null, steps: VDiscussionStep[], contributions: VDiscussionContribution[]) {
  if (!session) return { currentStep: 1, completionPercent: 0, progressLabel: 'Chua trien khai' };
  const currentStep = Math.min(6, Math.max(1, Number(session.currentStep || 1)));
  const hasRuntimeActivity = contributions.some((contribution) => contribution.type !== 'session_join');
  const hasJoinActivity = contributions.some((contribution) => contribution.type === 'session_join');
  if (session.status === 'not_started' && !hasRuntimeActivity && !hasJoinActivity) {
    return { currentStep, completionPercent: 0, progressLabel: 'Chua trien khai' };
  }

  const completedByStepState = steps
    .filter((step) => step.stepNumber >= 1 && step.stepNumber <= 5 && step.status === 'completed')
    .length;
  const completedByCurrentStep = session.status === 'completed'
    ? 5
    : Math.max(0, Math.min(5, currentStep - 1));
  const completedSteps = Math.max(completedByStepState, completedByCurrentStep);
  return {
    currentStep,
    completionPercent: Math.min(100, Math.round((completedSteps / 5) * 100)),
    progressLabel: session.status === 'completed' || currentStep >= 6 ? 'Da hoan thanh' : `Dang o buoc ${Math.min(currentStep, 5)}`,
  };
}

function eventRow(payload: VDiscussionEventPayload, profileId?: string | null) {
  const id = payload.id || fallbackId(payload.title, 'discussion-event');
  return {
    id,
    title: payload.title.trim(),
    description: payload.description || '',
    start_at: normalizeDate(payload.startAt),
    end_at: normalizeDate(payload.endAt),
    created_by_profile_id: profileId || null,
    status: payload.status || 'draft',
    metadata: {
      ...(payload.metadata || {}),
      maxGroupSize: payload.maxGroupSize || 8,
      minGroupSize: payload.minGroupSize || 4,
      autoCreateGroups: payload.autoCreateGroups !== false,
    },
    updated_at: new Date().toISOString(),
  };
}

async function syncDiscussionScoreToTrainingResults(
  client: ReturnType<typeof requireSupabase>,
  input: { eventId: string; participantIds: string[]; bonusParticipantIds?: string[]; score: number; bonusPoints: number },
) {
  try {
    if (!input.eventId || !input.participantIds.length) return;
    const links = await client
      .from('vcontent_training_class_discussions')
      .select('class_id')
      .eq('discussion_event_id', input.eventId)
      .limit(1);
    if (links.error || !links.data?.[0]?.class_id) return;
    const classId = String(links.data[0].class_id);
    const klass = await client.from('vcontent_training_classes').select('id,course_id').eq('id', classId).maybeSingle();
    if (klass.error || !klass.data) return;
    const participantIds = [...new Set(input.participantIds)];
    const bonusParticipantIds = [...new Set(input.bonusParticipantIds || [])];
    const participants = await client
      .from('vcontent_discussion_participants')
      .select('id,profile_id')
      .in('id', participantIds)
      .not('profile_id', 'is', null);
    if (participants.error || !participants.data?.length) return;
    const profileIds = [...new Set(participants.data.map((row: any) => String(row.profile_id || '')).filter(Boolean))];
    if (!profileIds.length) return;
    const bonusProfileIds = new Set(
      (participants.data || [])
        .filter((row: any) => bonusParticipantIds.includes(String(row.id || '')))
        .map((row: any) => String(row.profile_id || ''))
        .filter(Boolean),
    );
    const existingResults = await client
      .from('vcontent_training_results')
      .select('id,student_profile_id,scores')
      .eq('class_id', classId)
      .in('student_profile_id', profileIds);
    if (existingResults.error) return;
    const existingByProfile = new Map((existingResults.data || []).map((row: any) => [String(row.student_profile_id), row]));
    const now = new Date().toISOString();
    for (const profileId of profileIds) {
      const existing = existingByProfile.get(profileId);
      const existingScores = (existing?.scores && typeof existing.scores === 'object') ? existing.scores : {};
      const discussionEvents = {
        ...((existingScores.discussionEvents && typeof existingScores.discussionEvents === 'object') ? existingScores.discussionEvents : {}),
        [input.eventId]: input.score,
      };
      const discussionBonusEvents = {
        ...((existingScores.discussionBonusEvents && typeof existingScores.discussionBonusEvents === 'object') ? existingScores.discussionBonusEvents : {}),
      };
      if (bonusProfileIds.has(profileId) && input.bonusPoints > 0) {
        discussionBonusEvents[input.eventId] = input.bonusPoints;
      } else {
        delete discussionBonusEvents[input.eventId];
      }
      const scores = {
        ...existingScores,
        discussionEvents,
        discussionBonusEvents,
        discussion: averageScoreMap(discussionEvents),
        discussionBonus: existingScores.discussionBonusManual === true ? existingScores.discussionBonus : sumScoreMap(discussionBonusEvents),
      };
      const ruleResult = klass.data.course_id
        ? await client.from('vcontent_training_score_rules').select('*').eq('course_id', klass.data.course_id).maybeSingle()
        : null;
      const finalScore = calculateFinalScoreFromRule(scores, ruleResult?.data || null);
      if (existing?.id) {
        await client.from('vcontent_training_results').update({
          scores,
          final_score: finalScore,
          passed: finalScore == null || ruleResult?.data?.passing_score == null ? null : finalScore >= Number(ruleResult.data.passing_score),
          updated_at: now,
        }).eq('id', existing.id);
      } else {
        await client.from('vcontent_training_results').insert({
          class_id: classId,
          course_id: klass.data.course_id || null,
          student_profile_id: profileId,
          scores,
          final_score: finalScore,
          passed: finalScore == null || ruleResult?.data?.passing_score == null ? null : finalScore >= Number(ruleResult.data.passing_score),
          updated_at: now,
        });
      }
    }
  } catch {
    // Discussion scoring should remain successful even if the training-result mirror is not available.
  }
}

async function removeDiscussionScoresFromTrainingResults(
  client: ReturnType<typeof requireSupabase>,
  eventIds: string[],
) {
  try {
    const ids = Array.from(new Set(eventIds.map((id) => String(id || '').trim()).filter(Boolean)));
    if (!ids.length) return;
    const links = await client
      .from('vcontent_training_class_discussions')
      .select('class_id,discussion_event_id')
      .in('discussion_event_id', ids);
    if (links.error || !links.data?.length) return;
    const classIds = [...new Set(links.data.map((row: any) => String(row.class_id || '')).filter(Boolean))];
    if (!classIds.length) return;
    const classes = await client
      .from('vcontent_training_classes')
      .select('id,course_id')
      .in('id', classIds);
    const courseIds = [...new Set((classes.data || []).map((row: any) => String(row.course_id || '')).filter(Boolean))];
    const rules = courseIds.length
      ? await client.from('vcontent_training_score_rules').select('*').in('course_id', courseIds)
      : null;
    const classCourseById = new Map((classes.data || []).map((row: any) => [String(row.id || ''), String(row.course_id || '')]));
    const ruleByCourseId = new Map((rules?.data || []).map((row: any) => [String(row.course_id || ''), row]));
    const results = await client
      .from('vcontent_training_results')
      .select('id,class_id,scores')
      .in('class_id', classIds);
    if (results.error || !results.data?.length) return;
    const now = new Date().toISOString();
    const updates = await Promise.all(results.data.map((row: any) => {
      const scores = row?.scores && typeof row.scores === 'object' ? { ...row.scores } : {};
      const discussionEvents = scores.discussionEvents && typeof scores.discussionEvents === 'object'
        ? { ...(scores.discussionEvents as Record<string, unknown>) }
        : {};
      const discussionBonusEvents = scores.discussionBonusEvents && typeof scores.discussionBonusEvents === 'object'
        ? { ...(scores.discussionBonusEvents as Record<string, unknown>) }
        : {};
      ids.forEach((id) => {
        delete discussionEvents[id];
        delete discussionBonusEvents[id];
      });
      const nextScores = {
        ...scores,
        discussionEvents,
        discussionBonusEvents,
        discussion: averageScoreMap(discussionEvents),
        discussionBonus: scores.discussionBonusManual === true ? scores.discussionBonus : sumScoreMap(discussionBonusEvents),
      };
      const rule = ruleByCourseId.get(classCourseById.get(String(row.class_id || '')) || '') || null;
      const finalScore = calculateFinalScoreFromRule(nextScores, rule);
      return client
        .from('vcontent_training_results')
        .update({
          scores: nextScores,
          final_score: finalScore,
          passed: finalScore == null || rule?.passing_score == null ? null : finalScore >= Number(rule.passing_score),
          updated_at: now,
        })
        .eq('id', row.id);
    }));
    const updateError = updates.find((result: any) => result?.error)?.error;
    if (updateError) throw updateError;
  } catch {
    // Removing an event should still succeed if historical training-result cleanup is unavailable.
  }
}

export const vdiscussionApi = {
  async listEvents(status?: string) {
    const client = requireSupabase();
    let query = client
      .from('vcontent_discussion_events')
      .select('*,created_by_profile:vcontent_profiles!vcontent_discussion_events_created_by_profile_id_fkey(id,email,full_name),topics:vcontent_discussion_topics(id),participants:vcontent_discussion_participants(id),groups:vcontent_discussion_groups(id)')
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw new VDiscussionApiError(error.message);
    return (data || []).map(mapEventRow);
  },

  async listLibraryTemplates(status?: string) {
    const client = requireSupabase();
    let query = client
      .from('vcontent_discussion_events')
      .select('id,title,description,start_at,end_at,created_by_profile_id,status,metadata,created_at,updated_at')
      .or('metadata->>discussionKind.eq.library-template,metadata->>setupSource.eq.native-library')
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw new VDiscussionApiError(error.message);
    return (data || []).map(mapEventRow).filter(isDiscussionLibraryTemplate);
  },

  async listClassInstances(status?: string) {
    const events = await this.listEvents(status);
    return events.filter(isDiscussionClassInstance);
  },

  async listEventsByIds(ids: string[]) {
    const eventIds = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
    if (!eventIds.length) return [] as VDiscussionEvent[];
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_discussion_events')
      .select('*,created_by_profile:vcontent_profiles!vcontent_discussion_events_created_by_profile_id_fkey(id,email,full_name),topics:vcontent_discussion_topics(id),participants:vcontent_discussion_participants(id),groups:vcontent_discussion_groups(id)')
      .in('id', eventIds)
      .order('created_at', { ascending: false });
    if (error) throw new VDiscussionApiError(error.message);
    return (data || []).map(mapEventRow);
  },

  async listClassEvents(classId: string) {
    const id = String(classId || '').trim();
    if (!id) return [] as VDiscussionEvent[];
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_training_class_discussions')
      .select('discussion_event:vcontent_discussion_events!vcontent_training_class_discussions_discussion_event_id_fkey(*,created_by_profile:vcontent_profiles!vcontent_discussion_events_created_by_profile_id_fkey(id,email,full_name),topics:vcontent_discussion_topics(id),participants:vcontent_discussion_participants(id),groups:vcontent_discussion_groups(id))')
      .eq('class_id', id)
      .order('imported_at', { ascending: false });
    if (error) throw new VDiscussionApiError(error.message);
    return (data || [])
      .map((row: any) => row.discussion_event)
      .filter((row: any) => Boolean(row?.id))
      .map(mapEventRow);
  },

  async listStudentAssignments(profile: { id?: string | null; email?: string | null; studentCode?: string | null }) {
    const client = requireSupabase();
    const filters = [];
    if (profile.id) filters.push(`profile_id.eq.${profile.id}`);
    if (profile.email) filters.push(`email.eq.${profile.email.toLowerCase()}`);
    if (profile.studentCode) filters.push(`student_code.eq.${profile.studentCode}`);
    if (!filters.length) return [];

    const { data: participants, error: participantError } = await client
      .from('vcontent_discussion_participants')
      .select('*')
      .or(filters.join(','))
      .eq('status', 'active');
    if (participantError) throw new VDiscussionApiError(participantError.message);

    const mappedParticipants = ((participants || []) as any[]).map(mapParticipantRow);
    const participantById = new Map(mappedParticipants.map((participant) => [participant.id, participant]));
    const participantIds = mappedParticipants.map((participant) => participant.id);
    if (!participantIds.length) return [];

    const { data: memberships, error: membershipError } = await client
      .from('vcontent_discussion_group_members')
      .select('participant_id,group:vcontent_discussion_groups(*)')
      .in('participant_id', participantIds);
    if (membershipError) throw new VDiscussionApiError(membershipError.message);

    const groups = ((memberships || []) as any[])
      .map((membership) => ({
        participantId: String(membership.participant_id || ''),
        group: membership.group ? mapGroupRow(membership.group) : null,
      }))
      .filter((item): item is { participantId: string; group: VDiscussionGroup } => Boolean(item.group?.id));
    const groupIds = [...new Set(groups.map((item) => item.group.id))];
    if (!groupIds.length) return [];

    const { data: sessions, error: sessionError } = await client
      .from('vcontent_discussion_sessions')
      .select('*,event:vcontent_discussion_events(*),topic:vcontent_discussion_topics(*)')
      .in('group_id', groupIds)
      .order('created_at', { ascending: true });
    if (sessionError) throw new VDiscussionApiError(sessionError.message);

    const groupsById = new Map(groups.map((item) => [item.group.id, item]));
    return ((sessions || []) as any[])
      .map((row) => {
        const session = mapSessionRow(row);
        const groupItem = session.groupId ? groupsById.get(session.groupId) : null;
        const participant = groupItem ? participantById.get(groupItem.participantId) : null;
        if (!session.id || !groupItem?.group?.id || !participant?.id || !row.event?.id) return null;
        return {
          participant,
          group: groupItem.group,
          session,
          event: row.event ? mapEventRow(row.event) : null,
          topic: row.topic ? mapTopicRow(row.topic) : null,
        };
      })
      .filter((assignment): assignment is VDiscussionStudentAssignment => Boolean(assignment && assignment.event?.status === 'active'));
  },

  async getEvent(id: string): Promise<VDiscussionEventDetail> {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_discussion_events')
      .select('*,created_by_profile:vcontent_profiles!vcontent_discussion_events_created_by_profile_id_fkey(id,email,full_name),topics:vcontent_discussion_topics(*),participants:vcontent_discussion_participants(*),groups:vcontent_discussion_groups(*,members:vcontent_discussion_group_members(participant_id,participant:vcontent_discussion_participants(*))),sessions:vcontent_discussion_sessions(*)')
      .eq('id', id)
      .single();
    if (error) throw new VDiscussionApiError(error.message);
    const event = mapEventRow(data);
    const participants: VDiscussionParticipant[] = ((data.participants || []) as any[]).map(mapParticipantRow);
    const participantsById = new Map(participants.map((participant) => [participant.id, participant]));
    return {
      ...event,
      topics: ((data.topics || []) as any[]).map(mapTopicRow).sort((a: VDiscussionTopic, b: VDiscussionTopic) => a.topicNumber - b.topicNumber),
      participants,
      groups: ((data.groups || []) as any[]).map((group: any) => mapGroupRow(group, participantsById)),
      sessions: ((data.sessions || []) as any[]).map(mapSessionRow),
    };
  },

  async getEventMonitoring(eventId: string): Promise<VDiscussionGroupMonitor[]> {
    const client = requireSupabase();
    const detail = await this.getEvent(eventId);
    const sessionByGroupId = new Map<string, VDiscussionSession>();
    detail.sessions.forEach((session) => {
      const groupId = String(session.groupId || '');
      if (!groupId) return;
      const current = sessionByGroupId.get(groupId);
      if (!current || session.currentStep > current.currentStep) sessionByGroupId.set(groupId, session);
    });

    const sessions = [...sessionByGroupId.values()];
    const stepsBySessionId = new Map<string, VDiscussionStep[]>();
    const sessionIds = sessions.map((session) => session.id).filter(Boolean);
    const { data: stepRows, error: stepError } = sessionIds.length
      ? await client
        .from('vcontent_discussion_steps')
        .select('*')
        .in('session_id', sessionIds)
        .order('step_number', { ascending: true })
      : { data: [], error: null } as any;
    if (stepError) throw new VDiscussionApiError(stepError.message);
    const allSteps = ((stepRows || []) as any[]).map(mapStepRow);
    allSteps.forEach((step) => {
      const current = stepsBySessionId.get(step.sessionId) || [];
      current.push(step);
      stepsBySessionId.set(step.sessionId, current);
    });
    const stepIds = allSteps.map((step) => step.id).filter(Boolean);
    const { data: contributionRows, error: contributionError } = stepIds.length
      ? await client
        .from('vcontent_discussion_contributions')
        .select('*,profile:vcontent_profiles(id,email,full_name),participant:vcontent_discussion_participants(*)')
        .in('step_id', stepIds)
        .order('created_at', { ascending: true })
      : { data: [], error: null } as any;
    if (contributionError) throw new VDiscussionApiError(contributionError.message);
    const contributions = ((contributionRows || []) as any[]).map(mapContributionRow);
    const contributionsByStepId = new Map<string, VDiscussionContribution[]>();
    contributions.forEach((contribution) => {
      const current = contributionsByStepId.get(contribution.stepId) || [];
      current.push(contribution);
      contributionsByStepId.set(contribution.stepId, current);
    });

    const topicById = new Map(detail.topics.map((topic) => [topic.id, topic]));
    return detail.groups.map((group) => {
      const session = sessionByGroupId.get(group.id) || null;
      const steps = session ? (stepsBySessionId.get(session.id) || []).sort((a, b) => a.stepNumber - b.stepNumber) : [];
      const groupContributions = steps.flatMap((step) => contributionsByStepId.get(step.id) || []);
      const joinedIds = new Set(groupContributions
        .filter((contribution) => contribution.type === 'session_join')
        .map((contribution) => String(contribution.participantId || contribution.metadata.participantId || ''))
        .filter(Boolean));
      const contributionCountByParticipant = groupContributions.reduce((map, contribution) => {
        if (!isContentContribution(contribution)) return map;
        const participantId = String(contribution.participantId || '');
        if (participantId) map.set(participantId, (map.get(participantId) || 0) + 1);
        return map;
      }, new Map<string, number>());
      const result = parseGroupResult(group);
      const activeIds = new Set(result.activeParticipantIds);
      const members = (group.members || []).map((participant) => {
        const contributionCount = contributionCountByParticipant.get(participant.id) || 0;
        return {
          participant,
          isLeader: group.leaderParticipantId === participant.id,
          hasJoined: joinedIds.has(participant.id),
          isActive: activeIds.has(participant.id) || contributionCount >= 2,
          contributionCount,
        };
      });
      const joinedCount = members.filter((member) => member.hasJoined).length;
      const contributedCount = members.filter((member) => member.contributionCount > 0).length;
      const progress = calculateGroupCompletion(session, steps, groupContributions);
      return {
        group,
        session,
        topic: session?.topicId ? topicById.get(session.topicId) || null : null,
        steps,
        contributions: groupContributions,
        members,
        joinedCount,
        contributedCount,
        totalMembers: members.length,
        completionPercent: progress.completionPercent,
        currentStep: progress.currentStep,
        progressLabel: progress.progressLabel,
        result,
      };
    }).sort((a, b) => Number(a.group.name.match(/\d+/)?.[0] || 9999) - Number(b.group.name.match(/\d+/)?.[0] || 9999) || a.group.name.localeCompare(b.group.name, 'vi', { numeric: true }));
  },

  async getEventMonitoringSummary(eventId: string): Promise<VDiscussionGroupMonitorSummary[]> {
    const client = requireSupabase();
    const { data: payload, error: payloadError } = await withDiscussionTimeout(
      client.rpc('vcontent_get_discussion_monitor_payload', { input_event_id: eventId }),
      'discussion monitor payload',
    );
    if (payloadError) throw new VDiscussionApiError(payloadError.message);
    const payloadData = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const groupRows = parseArray(payloadData.groups);
    const membershipRows = parseArray(payloadData.memberships);
    const sessionRows = parseArray(payloadData.sessions);
    const topicRows = parseArray(payloadData.topics);
    const stepRows = parseArray(payloadData.steps);
    const contributionRows = parseArray(payloadData.contributions);

    const membersByGroupId = new Map<string, VDiscussionParticipant[]>();
    ((membershipRows || []) as any[]).forEach((membership) => {
      if (!membership.participant?.id) return;
      const groupId = String(membership.group_id || '');
      if (!groupId) return;
      const current = membersByGroupId.get(groupId) || [];
      current.push(mapParticipantRow(membership.participant));
      membersByGroupId.set(groupId, current);
    });

    const groups = ((groupRows || []) as any[]).map((group) => mapGroupRow({
      ...group,
      members: (membersByGroupId.get(String(group.id || '')) || []).map((participant) => ({
        participant_id: participant.id,
        participant,
      })),
    }));
    const topics = ((topicRows || []) as any[]).map(mapTopicRow);
    const sessionsMapped = ((sessionRows || []) as any[]).map(mapSessionRow);
    const sessionByGroupId = new Map<string, VDiscussionSession>();
    sessionsMapped.forEach((session) => {
      const groupId = String(session.groupId || '');
      if (!groupId) return;
      const current = sessionByGroupId.get(groupId);
      if (!current || session.currentStep > current.currentStep) sessionByGroupId.set(groupId, session);
    });

    const stepsBySessionId = new Map<string, VDiscussionStep[]>();
    const allSteps = ((stepRows || []) as any[]).map(mapStepRow);
    allSteps.forEach((step) => {
      const current = stepsBySessionId.get(step.sessionId) || [];
      current.push(step);
      stepsBySessionId.set(step.sessionId, current);
    });

    const lightContributionsByStepId = new Map<string, VDiscussionContribution[]>();
    ((contributionRows || []) as any[]).forEach((row, index) => {
      const stepId = String(row.step_id || '');
      if (!stepId) return;
      const contribution = {
        id: `${stepId}:${index}`,
        stepId,
        participantId: row.participant_id || null,
        type: String(row.type || ''),
        content: '',
        metadata: metadataOf({ metadata: row.metadata }),
        createdAt: '',
      } as VDiscussionContribution;
      const current = lightContributionsByStepId.get(stepId) || [];
      current.push(contribution);
      lightContributionsByStepId.set(stepId, current);
    });

    const topicById = new Map(topics.map((topic) => [topic.id, topic]));
    return groups.map((group) => {
      const session = sessionByGroupId.get(group.id) || null;
      const steps = session ? (stepsBySessionId.get(session.id) || []).sort((a, b) => a.stepNumber - b.stepNumber) : [];
      const groupContributions = steps.flatMap((step) => lightContributionsByStepId.get(step.id) || []);
      const joinedIds = new Set(groupContributions
        .filter((contribution) => contribution.type === 'session_join')
        .map((contribution) => String(contribution.participantId || contribution.metadata.participantId || ''))
        .filter(Boolean));
      const contributedIds = new Set(groupContributions
        .filter(isContentContribution)
        .map((contribution) => String(contribution.participantId || ''))
        .filter(Boolean));
      const contributionCountByParticipant = groupContributions.reduce((map, contribution) => {
        if (!isContentContribution(contribution)) return map;
        const participantId = String(contribution.participantId || '');
        if (participantId) map.set(participantId, (map.get(participantId) || 0) + 1);
        return map;
      }, new Map<string, number>());
      const progress = calculateGroupCompletion(session, steps, groupContributions);
      const step6 = steps.find((step) => step.stepNumber === 6);
      const result = parseGroupResult(group);
      const activeIds = new Set(result.activeParticipantIds);
      const members = (group.members || []).map((participant) => {
        const contributionCount = contributionCountByParticipant.get(participant.id) || 0;
        return {
          participant,
          isLeader: group.leaderParticipantId === participant.id,
          hasJoined: joinedIds.has(participant.id),
          isActive: activeIds.has(participant.id) || contributionCount >= 2,
          contributionCount,
        };
      });
      return {
        group,
        session,
        topic: session?.topicId ? topicById.get(session.topicId) || null : null,
        steps,
        contributions: groupContributions,
        members,
        joinedCount: members.filter((member) => member.hasJoined).length,
        contributedCount: members.filter((member) => contributedIds.has(member.participant.id)).length,
        totalMembers: members.length,
        completionPercent: progress.completionPercent,
        currentStep: progress.currentStep,
        progressLabel: progress.progressLabel,
        result,
        finalLocked: Boolean(step6?.summaryData?.finalLocked),
      };
    }).sort((a, b) => Number(a.group.name.match(/\d+/)?.[0] || 9999) - Number(b.group.name.match(/\d+/)?.[0] || 9999) || a.group.name.localeCompare(b.group.name, 'vi', { numeric: true }));
  },

  async saveEvent(payload: VDiscussionEventPayload) {
    const client = requireSupabase();
    const profileId = await getCurrentVContentProfileId();
    const row = eventRow(payload, profileId);
    const { data, error } = await client
      .from('vcontent_discussion_events')
      .upsert(row)
      .select('*,created_by_profile:vcontent_profiles!vcontent_discussion_events_created_by_profile_id_fkey(id,email,full_name)')
      .single();
    if (error) throw new VDiscussionApiError(error.message);
    return mapEventRow(data);
  },

  async createCompleteEventSetup(payload: VDiscussionCompleteSetupPayload) {
    const topics = payload.topics
      .map((topic, index) => ({
        ...topic,
        title: topic.title.trim(),
        topicNumber: topic.topicNumber || index + 1,
      }))
      .filter((topic) => topic.title);
    if (!topics.length) throw new VDiscussionApiError('Can co it nhat 1 chu de thao luan.');

    const participantsByKey = new Map<string, VDiscussionParticipantPayload>();
    payload.participants.forEach((participant) => {
      const email = String(participant.email || '').trim().toLowerCase();
      const studentCode = String(participant.studentCode || '').trim();
      const fullName = participant.fullName.trim();
      const key = email || studentCode || fullName.toLowerCase();
      if (!key || !fullName) return;
      if (!participantsByKey.has(key)) {
        participantsByKey.set(key, {
          ...participant,
          email,
          studentCode,
          fullName,
          groupName: participant.groupName ? String(participant.groupName).trim() : null,
          status: participant.status || 'active',
        });
      }
    });
    const participants = [...participantsByKey.values()];
    if (!participants.length) throw new VDiscussionApiError('Can co danh sach hoc vien truoc khi tao thao luan.');

    const event = await this.saveEvent({
      ...payload.event,
      status: 'draft',
      autoCreateGroups: true,
      metadata: {
        ...(payload.event.metadata || {}),
        ...(payload.metadata || {}),
        setupSource: String(payload.event.metadata?.setupSource || payload.metadata?.setupSource || 'native-wizard'),
        discussionKind: String(payload.event.metadata?.discussionKind || payload.metadata?.discussionKind || 'standalone-instance'),
      },
    });

    const savedTopics = await Promise.all(topics.map((topic) => this.saveTopic({
      eventId: event.id,
      title: topic.title,
      description: topic.description || '',
      topicNumber: topic.topicNumber,
      durationMinutes: topic.durationMinutes || payload.event.durationMinutes || 60,
      isActive: true,
      subProblems: topic.subProblems,
      metadata: topic.metadata,
    })));

    const savedParticipants = await Promise.all(participants.map((participant) => this.saveParticipant({
      ...participant,
      eventId: event.id,
    })));

    const participantGroupById = new Map(savedParticipants.map((participant, index) => [
      participant.id,
      String(participants[index]?.groupName || '').trim(),
    ]));
    const importedGroupNames = [...new Set([...participantGroupById.values()].filter(Boolean))]
      .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
    const groupCount = importedGroupNames.length || Math.max(1, Math.min(savedParticipants.length, Math.floor(payload.numberOfGroups || 1)));
    const maxMembers = Math.max(1, Math.ceil(savedParticipants.length / groupCount), payload.event.maxGroupSize || 1);
    const groupDefinitions = importedGroupNames.length
      ? importedGroupNames
      : Array.from({ length: groupCount }, (_, index) => String(index + 1));
    const groups = await Promise.all(groupDefinitions.map((groupName) => this.saveGroup({
      eventId: event.id,
          name: `Nhóm ${groupName}`,
      maxMembers,
      interactionStatus: 'not_started',
    })));
    const groupByImportedName = new Map(groups.map((group, index) => [groupDefinitions[index], group]));

    await Promise.all(savedParticipants.map((participant, index) => {
      const importedGroupName = participantGroupById.get(participant.id) || '';
      const targetGroup = importedGroupName ? groupByImportedName.get(importedGroupName) : groups[index % groups.length];
      return this.assignParticipantToGroup((targetGroup || groups[0]).id, participant.id);
    }));
    const client = requireSupabase();
    const sessionRows = groups.map((group, index) => {
      const assignedTopicIndex = payload.topicGroupMode === 'manual'
        ? Number(payload.topicGroupAssignments?.[index] ?? index)
        : index;
      const topic = savedTopics[((assignedTopicIndex % savedTopics.length) + savedTopics.length) % savedTopics.length];
      return {
        id: `${group.id}-${topic.id}`,
        event_id: event.id,
        group_id: group.id,
        topic_id: topic.id,
        status: 'not_started',
        current_step: 1,
        metadata: {
          source: 'native-wizard',
          topicGroupMode: payload.topicGroupMode || 'auto',
        },
        updated_at: new Date().toISOString(),
      };
    });
    const { error: sessionError } = await client.from('vcontent_discussion_sessions').upsert(sessionRows);
    if (sessionError) throw new VDiscussionApiError(sessionError.message);
    if (payload.publish) await this.updateEventStatus(event.id, 'active');
    return this.getEvent(event.id);
  },

  async updateEventStatus(id: string, status: VDiscussionStatus) {
    const client = requireSupabase();
    if (status === 'active') {
      let detail = await this.getEvent(id);
      if (!detail.topics.length) {
        throw new VDiscussionApiError('Can co it nhat 1 chu de truoc khi phat hanh thao luan.');
      }
      if (!detail.participants.length) {
        throw new VDiscussionApiError('Can co danh sach hoc vien truoc khi phat hanh thao luan.');
      }
      if (detail.autoCreateGroups && detail.groups.length === 0) {
        await this.autoGenerateGroups(id);
        detail = await this.getEvent(id);
      }
      if (!detail.groups.length) {
        throw new VDiscussionApiError('Can tao nhom thao luan truoc khi phat hanh.');
      }
      const assignedParticipantIds = new Set(detail.groups.flatMap((group) => group.members || []).map((member) => member.id));
      const unassignedCount = detail.participants.filter((participant) => !assignedParticipantIds.has(participant.id)).length;
      if (unassignedCount > 0) {
        throw new VDiscussionApiError(`Con ${unassignedCount} hoc vien chua duoc gan nhom.`);
      }
      detail = await this.getEvent(id);
      if (!detail.sessions.length) {
        await this.syncSessions(id);
        detail = await this.getEvent(id);
      }
      if (!detail.sessions.length) {
        throw new VDiscussionApiError('Can tao phien thao luan truoc khi phat hanh.');
      }
    }
    const { error } = await client
      .from('vcontent_discussion_events')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new VDiscussionApiError(error.message);
    return { success: true };
  },

  async deleteEvent(id: string) {
    return this.deleteEvents([id]);
  },

  async deleteEvents(ids: string[]) {
    const client = requireSupabase();
    const eventIds = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
    if (!eventIds.length) return { success: true, deletedCount: 0 };

    await removeDiscussionScoresFromTrainingResults(client, eventIds);

    const { error } = await client.from('vcontent_discussion_events').delete().in('id', eventIds);
    if (error) throw new VDiscussionApiError(error.message);
    return { success: true, deletedCount: eventIds.length };
  },

  async cloneEvent(id: string) {
    const source = await this.getEvent(id);
    const sourceKind = getDiscussionKind(source.metadata);
    const cloneMetadata = { ...(source.metadata || {}) };
    if (sourceKind === 'class-instance') {
      delete cloneMetadata.classId;
      delete cloneMetadata.classCode;
      delete cloneMetadata.className;
      delete cloneMetadata.courseId;
      delete cloneMetadata.courseTitle;
      delete cloneMetadata.sourceEventId;
      delete cloneMetadata.importedFromClassDetail;
    }
    const event = await this.saveEvent({
      title: `${source.title} - Copy`,
      description: source.description,
      startAt: source.startAt,
      endAt: source.endAt,
      status: 'draft',
      maxGroupSize: source.maxGroupSize,
      minGroupSize: source.minGroupSize,
      autoCreateGroups: source.autoCreateGroups,
      metadata: {
        ...cloneMetadata,
        discussionKind: sourceKind === 'class-instance' ? 'standalone-instance' : sourceKind,
        setupSource: sourceKind === 'library-template' ? 'native-library' : String(cloneMetadata.setupSource || 'native-wizard'),
      },
    });
    await Promise.all(source.topics.map((topic, index) => this.saveTopic({
      eventId: event.id,
      title: topic.title,
      description: topic.description,
      topicNumber: index + 1,
      isActive: topic.isActive,
      durationMinutes: topic.durationMinutes,
      subProblems: topic.subProblems,
      metadata: topic.metadata,
    })));
    return event;
  },

  async saveTopic(payload: VDiscussionTopicPayload) {
    const client = requireSupabase();
    const id = payload.id || fallbackId(`${payload.eventId}-${payload.title}-${payload.topicNumber || 1}`, 'topic');
    const { data, error } = await client
      .from('vcontent_discussion_topics')
      .upsert({
        id,
        event_id: payload.eventId,
        title: payload.title.trim(),
        description: payload.description || '',
        topic_number: payload.topicNumber || 1,
        is_active: payload.isActive !== false,
        duration_minutes: payload.durationMinutes || 60,
        sub_problems: Array.isArray(payload.subProblems)
          ? payload.subProblems
            .map((item) => ({
              title: String(item?.title || '').trim(),
              description: String(item?.description || '').trim(),
            }))
            .filter((item) => item.title)
          : undefined,
        metadata: payload.metadata,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) throw new VDiscussionApiError(error.message);
    return mapTopicRow(data);
  },

  async deleteTopic(id: string) {
    const client = requireSupabase();
    const { error } = await client.from('vcontent_discussion_topics').delete().eq('id', id);
    if (error) throw new VDiscussionApiError(error.message);
    return { success: true };
  },

  async saveParticipant(payload: VDiscussionParticipantPayload) {
    const client = requireSupabase();
    const id = payload.id || fallbackId(`${payload.eventId}-${payload.email || payload.fullName}`, 'participant');
    const { data, error } = await client
      .from('vcontent_discussion_participants')
      .upsert({
        id,
        event_id: payload.eventId,
        profile_id: payload.profileId || null,
        email: payload.email || '',
        full_name: payload.fullName.trim(),
        student_code: payload.studentCode || '',
        status: payload.status || 'active',
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) throw new VDiscussionApiError(error.message);
    return mapParticipantRow(data);
  },

  async deleteParticipant(id: string) {
    const client = requireSupabase();
    const { error } = await client.from('vcontent_discussion_participants').delete().eq('id', id);
    if (error) throw new VDiscussionApiError(error.message);
    return { success: true };
  },

  async saveGroup(payload: VDiscussionGroupPayload) {
    const client = requireSupabase();
    const id = payload.id || fallbackId(`${payload.eventId}-${payload.name}`, 'group');
    const { data, error } = await client
      .from('vcontent_discussion_groups')
      .upsert({
        id,
        event_id: payload.eventId,
        name: payload.name.trim(),
        max_members: payload.maxMembers || 8,
        leader_participant_id: payload.leaderParticipantId || null,
        interaction_status: payload.interactionStatus || 'not_started',
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) throw new VDiscussionApiError(error.message);
    return mapGroupRow(data);
  },

  async autoGenerateGroups(eventId: string) {
    const detail = await this.getEvent(eventId);
    if (!detail.participants.length) return { success: true, groupCount: detail.groups.length };
    if (detail.groups.length > 0) return { success: true, groupCount: detail.groups.length };

    const maxMembers = Math.max(1, detail.maxGroupSize || 8);
    const groupCount = Math.max(1, Math.ceil(detail.participants.length / maxMembers));
    const groups = await Promise.all(
      Array.from({ length: groupCount }, (_, index) =>
        this.saveGroup({
          eventId,
          name: `Nhóm ${index + 1}`,
          maxMembers,
          interactionStatus: 'not_started',
        }),
      ),
    );

    await Promise.all(detail.participants.map((participant, index) =>
      this.assignParticipantToGroup(groups[index % groupCount].id, participant.id),
    ));
    return { success: true, groupCount };
  },

  async syncSessions(eventId: string) {
    const client = requireSupabase();
    const detail = await this.getEvent(eventId);
    const rows = detail.groups.flatMap((group) =>
      detail.topics.map((topic) => ({
        id: `${group.id}-${topic.id}`,
        event_id: eventId,
        group_id: group.id,
        topic_id: topic.id,
        status: 'not_started',
        current_step: 1,
        metadata: { source: 'vcontent-native' },
        updated_at: new Date().toISOString(),
      })),
    );
    if (!rows.length) return { success: true, sessionCount: 0 };
    const { error } = await client.from('vcontent_discussion_sessions').upsert(rows);
    if (error) throw new VDiscussionApiError(error.message);
    return { success: true, sessionCount: rows.length };
  },

  async assignParticipantToGroup(groupId: string, participantId: string, role = 'member') {
    const client = requireSupabase();
    const { error } = await client.from('vcontent_discussion_group_members').upsert({
      id: `${groupId}-${participantId}`,
      group_id: groupId,
      participant_id: participantId,
      role,
    }, { onConflict: 'id' });
    if (error) throw new VDiscussionApiError(error.message);
    return { success: true };
  },

  async moveParticipantToGroup(eventId: string, targetGroupId: string, participantId: string, role = 'member') {
    const client = requireSupabase();
    const { data: groups, error: groupError } = await client
      .from('vcontent_discussion_groups')
      .select('id,leader_participant_id')
      .eq('event_id', eventId);
    if (groupError) throw new VDiscussionApiError(groupError.message);

    const groupIds = ((groups || []) as Array<{ id: string; leader_participant_id?: string | null }>).map((group) => String(group.id || '')).filter(Boolean);
    if (!groupIds.includes(targetGroupId)) {
      throw new VDiscussionApiError('Nhom dich khong thuoc thao luan nay.');
    }

    const { error: clearLeaderError } = await client
      .from('vcontent_discussion_groups')
      .update({ leader_participant_id: null, updated_at: new Date().toISOString() })
      .in('id', groupIds)
      .eq('leader_participant_id', participantId);
    if (clearLeaderError) throw new VDiscussionApiError(clearLeaderError.message);

    const { error: deleteError } = await client
      .from('vcontent_discussion_group_members')
      .delete()
      .eq('participant_id', participantId)
      .in('group_id', groupIds);
    if (deleteError) throw new VDiscussionApiError(deleteError.message);

    return this.assignParticipantToGroup(targetGroupId, participantId, role);
  },

  async deleteGroup(id: string) {
    const client = requireSupabase();
    const { error } = await client.from('vcontent_discussion_groups').delete().eq('id', id);
    if (error) throw new VDiscussionApiError(error.message);
    return { success: true };
  },

  async submitGroupResult(payload: { groupId: string; score: number; activeParticipantIds: string[]; bonusPoints: number }) {
    const client = requireSupabase();
    const normalizedScore = normalizeScore10(payload.score);
    const normalizedBonus = normalizeScore10(payload.bonusPoints);
    const comment = JSON.stringify({
      activeParticipantIds: [...new Set(payload.activeParticipantIds)],
      bonusPoints: normalizedBonus,
      submittedAt: new Date().toISOString(),
    });
    const { data, error } = await client
      .from('vcontent_discussion_groups')
      .update({
        teacher_score: normalizedScore,
        teacher_comment: comment,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payload.groupId)
      .select('*')
      .single();
    if (error) throw new VDiscussionApiError(error.message);
    const { data: memberRows } = await client
      .from('vcontent_discussion_group_members')
      .select('participant_id')
      .eq('group_id', payload.groupId);
    const groupParticipantIds = [
      ...new Set([
        ...(memberRows || []).map((row: any) => String(row.participant_id || '')).filter(Boolean),
        ...payload.activeParticipantIds,
      ]),
    ];
    await syncDiscussionScoreToTrainingResults(client, {
      eventId: String(data.event_id || ''),
      participantIds: groupParticipantIds,
      bonusParticipantIds: payload.activeParticipantIds,
      score: normalizedScore,
      bonusPoints: normalizedBonus,
    });
    return mapGroupRow(data);
  },

  async getSession(sessionId: string) {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_discussion_sessions')
      .select('*,group:vcontent_discussion_groups(*,members:vcontent_discussion_group_members(participant_id,participant:vcontent_discussion_participants(*))),topic:vcontent_discussion_topics(*)')
      .eq('id', sessionId)
      .single();
    if (error) throw new VDiscussionApiError(error.message);
    return mapSessionRow(data);
  },

  async listSteps(sessionId: string) {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_discussion_steps')
      .select('*')
      .eq('session_id', sessionId)
      .order('step_number', { ascending: true });
    if (error) throw new VDiscussionApiError(error.message);
    return (data || []).map(mapStepRow);
  },

  async ensureSteps(sessionId: string) {
    const client = requireSupabase();
    const now = new Date().toISOString();
    const rows = Array.from({ length: 6 }, (_, index) => ({
      id: `${sessionId}-step-${index + 1}`,
      session_id: sessionId,
      step_number: index + 1,
      status: index === 0 ? 'active' : 'pending',
      summary_data: {},
      updated_at: now,
    }));
    const { error } = await client
      .from('vcontent_discussion_steps')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw new VDiscussionApiError(error.message);
    return this.listSteps(sessionId);
  },

  async listContributions(stepId: string) {
    return this.listContributionsForSteps([stepId]);
  },

  async listContributionsForSteps(stepIds: string[]) {
    const client = requireSupabase();
    if (!stepIds.length) return [];
    const uniqueStepIds = [...new Set(stepIds.filter(Boolean))];
    const { data: rpcData, error: rpcError } = await client.rpc('vcontent_get_discussion_contributions_for_steps', {
      input_step_ids: uniqueStepIds,
    });
    if (!rpcError) {
      const rows = Array.isArray(rpcData) ? rpcData : [];
      return rows.map(mapContributionRow);
    }
    const results = await Promise.all(uniqueStepIds.map(async (stepId) => {
      const { data, error } = await client
        .from('vcontent_discussion_contributions')
        .select('id,step_id,profile_id,participant_id,type,content,metadata,parent_id,upvotes_count,downvotes_count,created_at,updated_at')
        .eq('step_id', stepId)
        .order('created_at', { ascending: true });
      if (error) throw new VDiscussionApiError(error.message);
      return data || [];
    }));
    return results.flat().map(mapContributionRow);
  },

  async saveContribution(payload: { stepId: string; type: string; content: string; parentId?: string | null; metadata?: Record<string, unknown>; idempotencyKey?: string }) {
    const client = requireSupabase();
    const trimmedContent = payload.content.trim();
    assertDiscussionPayloadWithinLimit(trimmedContent);
    const { data, error } = await client.rpc('vcontent_save_discussion_contribution', {
      p_step_id: payload.stepId,
      p_type: payload.type,
      p_content: trimmedContent,
      p_parent_id: payload.parentId || null,
      p_metadata: payload.metadata || {},
      p_idempotency_key: payload.idempotencyKey || discussionMutationKey(payload.stepId, payload.type),
    });
    if (error) throw new VDiscussionApiError(error.message);
    if (!data || typeof data !== 'object') {
      throw new VDiscussionApiError('May chu khong tra ve contribution vua luu.');
    }
    return mapContributionRow(data);
  },

  async joinPlxLeaderVote(sessionId: string): Promise<PlxLeaderVoteState> {
    const client = requireSupabase();
    const { data, error } = await client.rpc('vcontent_join_plx_leader_vote', {
      input_session_id: sessionId,
    });
    if (error) throw new VDiscussionApiError(error.message);
    return mapPlxLeaderVoteState(data);
  },

  async castPlxLeaderVote(sessionId: string, targetParticipantId: string, confirm = false): Promise<PlxLeaderVoteState> {
    const client = requireSupabase();
    const { data, error } = await client.rpc('vcontent_cast_plx_leader_vote', {
      input_session_id: sessionId,
      input_target_participant_id: targetParticipantId,
      input_confirm: confirm,
    });
    if (error) throw new VDiscussionApiError(error.message);
    return mapPlxLeaderVoteState(data);
  },

  async finalizePlxLeaderVote(sessionId: string): Promise<PlxLeaderVoteState> {
    const client = requireSupabase();
    const { data, error } = await client.rpc('vcontent_finalize_plx_leader_vote', {
      input_session_id: sessionId,
    });
    if (error) throw new VDiscussionApiError(error.message);
    return mapPlxLeaderVoteState(data);
  },

  async updateContribution(payload: { id: string; content: string; expectedUpdatedAt: string; metadata?: Record<string, unknown>; idempotencyKey?: string }) {
    const client = requireSupabase();
    const trimmedContent = payload.content.trim();
    assertDiscussionPayloadWithinLimit(trimmedContent);
    if (!payload.expectedUpdatedAt) {
      throw new VDiscussionApiError('Can tai lai y kien truoc khi cap nhat.');
    }
    const { data, error } = await client.rpc('vcontent_edit_discussion_contribution', {
      p_contribution_id: payload.id,
      p_content: trimmedContent,
      p_metadata: payload.metadata || {},
      p_expected_updated_at: payload.expectedUpdatedAt,
      p_idempotency_key: payload.idempotencyKey || discussionMutationKey(payload.id, 'edit'),
    });
    if (error) throw new VDiscussionApiError(error.message);
    if (!data || typeof data !== 'object') {
      throw new VDiscussionApiError('May chu khong tra ve contribution vua cap nhat.');
    }
    return mapContributionRow(data);
  },

  async updateStepSummary(stepId: string, summaryData: Record<string, unknown>, status = 'completed') {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_discussion_steps')
      .update({ summary_data: summaryData, status, updated_at: new Date().toISOString() })
      .eq('id', stepId)
      .select('*')
      .single();
    if (error) throw new VDiscussionApiError(error.message);
    if (!data) throw new VDiscussionApiError('Khong cap nhat duoc buoc thao luan. Vui long kiem tra quyen thao tac.');
    return mapStepRow(data);
  },

  async updateSessionStep(sessionId: string, currentStep: number, status?: string) {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_discussion_sessions')
      .update({
        current_step: currentStep,
        status: status || (currentStep >= 6 ? 'completed' : 'active'),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select('id')
      .maybeSingle();
    if (error) throw new VDiscussionApiError(error.message);
    if (!data) throw new VDiscussionApiError('Khong chuyen duoc buoc thao luan. Vui long kiem tra quyen thao tac.');
    return { success: true };
  },

  async assignGroupLeader(groupId: string, participantId: string) {
    const client = requireSupabase();
    const now = new Date().toISOString();
    const { data: groupData, error: groupError } = await client
      .from('vcontent_discussion_groups')
      .update({ leader_participant_id: participantId, updated_at: now })
      .eq('id', groupId)
      .select('id')
      .maybeSingle();
    if (groupError) throw new VDiscussionApiError(groupError.message);
    if (!groupData) throw new VDiscussionApiError('Khong chot duoc nhom truong. Vui long kiem tra quyen thao tac.');
    return { success: true };
  },

  async voteContribution(contributionId: string, type: 'upvote' | 'downvote', options?: { active?: boolean; idempotencyKey?: string }) {
    const client = requireSupabase();
    const active = options?.active !== false;
    const { data, error } = await client.rpc('vcontent_vote_discussion_contribution', {
      p_contribution_id: contributionId,
      p_type: type,
      p_active: active,
      p_idempotency_key: options?.idempotencyKey || discussionMutationKey(contributionId, `${type}-${active ? 'on' : 'off'}`),
    });
    if (error) throw new VDiscussionApiError(error.message);
    if (!data || typeof data !== 'object') {
      throw new VDiscussionApiError('May chu khong tra ve trang thai binh chon.');
    }
    return mapContributionRow(data);
  },

  async listChatMessages(sessionId: string) {
    const client = requireSupabase();
    const { data, error } = await client
      .from('vcontent_discussion_chat_messages')
      .select('*,profile:vcontent_profiles(id,email,full_name),participant:vcontent_discussion_participants(*),actions:vcontent_discussion_chat_message_actions(action_type)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (error) throw new VDiscussionApiError(error.message);
    return (data || []).map(mapChatRow);
  },

  async sendChatMessage(payload: { sessionId: string; message: string; parentId?: string | null; metadata?: Record<string, unknown>; profileId?: string | null; participantId?: string | null }) {
    const client = requireSupabase();
    const profileId = await resolveVContentProfileId(payload.profileId);
    const id = runtimeId(payload.sessionId, 'chat');
    const { data, error } = await client
      .from('vcontent_discussion_chat_messages')
      .insert({
        id,
        session_id: payload.sessionId,
        profile_id: profileId || null,
        participant_id: payload.participantId || null,
        message: payload.message.trim(),
        parent_id: payload.parentId || null,
        metadata: payload.metadata || {},
      })
      .select('*,profile:vcontent_profiles(id,email,full_name),participant:vcontent_discussion_participants(*),actions:vcontent_discussion_chat_message_actions(action_type)')
      .single();
    if (error) throw new VDiscussionApiError(error.message);
    return mapChatRow(data);
  },

  async setChatMessageAction(payload: { sessionId: string; messageId: string; actionType: string; active: boolean; profileId?: string | null; participantId?: string | null }) {
    const client = requireSupabase();
    const profileId = await resolveVContentProfileId(payload.profileId);
    const actorId = profileId || payload.participantId || 'anonymous';
    const id = `${payload.messageId}-${actorId}-${payload.actionType}`;
    if (!payload.active) {
      const { error } = await client.from('vcontent_discussion_chat_message_actions').delete().eq('id', id);
      if (error) throw new VDiscussionApiError(error.message);
      return { success: true };
    }
    const { error } = await client.from('vcontent_discussion_chat_message_actions').upsert({
      id,
      message_id: payload.messageId,
      session_id: payload.sessionId,
      profile_id: profileId,
      participant_id: payload.participantId || null,
      action_type: payload.actionType,
    });
    if (error) throw new VDiscussionApiError(error.message);
    return { success: true };
  },
};
