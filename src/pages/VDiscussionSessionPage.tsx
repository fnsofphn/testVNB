import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Crown,
  MessageCircle,
  Send,
  Sparkles,
  Target,
  ThumbsUp,
  Users,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  VDiscussionApiError,
  vdiscussionApi,
  type PlxLeaderVoteState,
  type VDiscussionContribution,
  type VDiscussionParticipant,
  type VDiscussionStep,
  type VDiscussionTopic,
} from '@/lib/suniDiscussion';
import {
  VDISCUSSION_DISPLAY_STEPS,
  VDISCUSSION_STEP_META,
  getVDiscussionSessionStepReadiness,
  toVDiscussionDisplayStepNumber,
  parseVDiscussionContributionContent,
  queries,
} from '@/features/vdiscussion';
import { supabase } from '@/lib/supabaseClient';
import {
  buildRuntimeRefetchInterval,
  getRuntimePollMs,
  getRuntimeRealtimeMode,
  getScaleAwarePollMs,
  shouldUseFullDiscussionRealtime,
  shouldUseRuntimePolling,
  shouldUseRuntimeRealtime,
} from '@/lib/runtimeLoadMode';
import { createSubmitActionGuard } from '@/lib/submitActionGuard';

const LEADER_VOTE_DURATION_MS = 90 * 1000;
const LEADER_TIE_BREAK_DELAY_MS = 7000;
const PLX_LEADER_VOTE_MODE = 'plx-group-leader-election-v1';
const PLX_LEADER_VOTE_FINALIZE_STAGGER_MS = 250;

const RATING_FIELDS = [
  { key: 'strategicFit', label: 'Phù hợp chiến lược' },
  { key: 'resourceCost', label: 'Chi phí / nguồn lực' },
  { key: 'feasibility', label: 'Tính khả thi' },
] as const;

const PLAN_FIELDS = [
  { key: 'objectives', label: 'Mục tiêu', placeholder: 'Nhập mục tiêu chính...' },
  { key: 'tasks', label: 'Nội dung công việc', placeholder: 'Mô tả các hạng mục...' },
  { key: 'resources', label: 'Nhân lực / Nguồn lực', placeholder: 'Phụ trách, ngân sách...' },
  { key: 'timeline', label: 'Thời hạn hoàn thành', placeholder: 'Nhập thời hạn (vd: 30/...)' },
] as const;

const HCMC_PLAN_FIELDS = [
  { key: 'objectives', label: 'Mục tiêu cải thiện', placeholder: 'Nhập mục tiêu cải thiện...' },
  { key: 'tasks', label: 'Hành vi hiện tại', placeholder: 'Mô tả hành vi hiện tại...' },
  { key: 'timeline', label: 'Hành vi chuẩn cần cải thiện trong 30 ngày tới', placeholder: 'Nhập hành vi chuẩn cần cải thiện...' },
] as const;

const COACHING_3B_SOURCE = 'evnspc-coaching-3b';

const COACHING_3B_METHODS = [
  { key: 'ojt', label: 'Huấn luyện tại chỗ' },
  { key: 'challenge', label: 'Giao việc thử thách' },
  { key: 'bridge', label: 'Người giỏi kèm người yếu' },
  { key: 'sbi', label: 'Phản hồi SBI' },
] as const;

const COACHING_3B_RUNTIME_STEPS = [
  { routeStep: 1, code: 'MỞ', title: 'Khởi động nhóm', short: 'Khởi động nhóm', desc: 'Đặt vấn đề & thống nhất người nhập' },
  { routeStep: 2, code: 'B1', title: 'Chọn & chẩn đoán', short: 'Chọn & chẩn đoán', desc: '5 đặc điểm + 5 nội dung chẩn đoán' },
  { routeStep: 3, code: 'B2', title: 'Kế hoạch kèm cặp 4 tuần', short: 'Kế hoạch kèm cặp 4 tuần', desc: 'Điền đủ 5 thành tố' },
  { routeStep: 4, code: 'B3', title: 'Kế hoạch phát triển 6 tháng', short: 'Kế hoạch phát triển 6 tháng', desc: 'Điền khung 6 phần' },
  { routeStep: 5, code: 'B4', title: 'Hoàn thành & trình bày', short: 'Hoàn thành & trình bày', desc: 'Tự kiểm 5 tiêu chí + cử đại diện' },
] as const;

const COACHING_3B_REVIEW_FIELDS = [
  { key: 'objectives', label: 'Cụ thể', placeholder: 'Ai làm gì, khi nào...' },
  { key: 'tasks', label: 'Đo được', placeholder: 'Con số / dấu hiệu đo...' },
  { key: 'resources', label: 'Đúng gốc', placeholder: 'Phương án khớp chẩn đoán...' },
  { key: 'timeline', label: 'Nối tầng', placeholder: '4 tuần nối với 6 tháng...' },
] as const;

type VDiscussionStepCopy = {
  title?: string;
  short?: string;
  desc?: string;
  heroTitle?: string;
};

function normalizeStepCopy(value: unknown): VDiscussionStepCopy | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const copy = {
    title: typeof item.title === 'string' ? item.title.trim() : '',
    short: typeof item.short === 'string' ? item.short.trim() : '',
    desc: typeof item.desc === 'string' ? item.desc.trim() : typeof item.description === 'string' ? item.description.trim() : '',
    heroTitle: typeof item.heroTitle === 'string' ? item.heroTitle.trim() : '',
  };
  return copy.title || copy.short || copy.desc || copy.heroTitle ? copy : null;
}

function getTopicStepCopy(topic: VDiscussionTopic | null | undefined, displayStep: number): VDiscussionStepCopy {
  const fallback = VDISCUSSION_STEP_META[displayStep] || VDISCUSSION_STEP_META[1];
  const rawSteps = topic?.metadata?.discussionSteps;
  const rawStep = Array.isArray(rawSteps)
    ? rawSteps.find((item) => Number((item as Record<string, unknown>)?.step || (item as Record<string, unknown>)?.displayStep) === displayStep)
    : rawSteps && typeof rawSteps === 'object'
      ? (rawSteps as Record<string, unknown>)[String(displayStep)]
      : null;
  const override = normalizeStepCopy(rawStep);
  return {
    title: override?.title || fallback.title,
    short: override?.short || fallback.short,
    desc: override?.desc || fallback.desc,
    heroTitle: override?.heroTitle || override?.title || fallback.title,
  };
}

function getSelectedProblemDescription(
  topic: VDiscussionTopic | null | undefined,
  summaryData: Record<string, unknown> | null | undefined,
) {
  const savedDescription = String(summaryData?.selectedProblemDescription || '').trim();
  if (savedDescription) return savedDescription;

  const selectedKey = String(summaryData?.selectedProblemKey || '').trim();
  const selectedTitle = String(summaryData?.selectedProblemTitle || '').trim();
  const topicIndex = selectedKey.match(/^topic-(\d+)$/)?.[1];
  const selectedByKey = topicIndex === undefined ? null : topic?.subProblems?.[Number(topicIndex)];
  const selectedByTitle = topic?.subProblems?.find((item) => item.title.trim() === selectedTitle);
  return String(selectedByKey?.description || selectedByTitle?.description || '').trim();
}

function renderDiscussionDescription(description: string | null | undefined): ReactNode {
  const text = String(description || '').replace(/\\n/g, '\n').trim();
  if (!text) return <p className="vdiscussion-overview-description">Chưa có mô tả cho chủ đề này.</p>;

  const normalized = text.replace(/\s+/g, ' ');
  const firstStepIndex = normalized.search(/Bước\s*\d+\s*[:.]/i);
  if (firstStepIndex < 0) return <p className="vdiscussion-overview-description">{text}</p>;

  const intro = normalized.slice(0, firstStepIndex).replace(/[-–—]\s*$/, '').trim();
  const parsedSteps = Array.from(
    normalized.slice(firstStepIndex).matchAll(/(Bước\s*\d+)\s*[:.]\s*([\s\S]*?)(?=\s+Bước\s*\d+\s*[:.]|$)/gi),
  ).map((match) => ({
    label: match[1],
    body: match[2].trim(),
  })).filter((step) => step.label && step.body);
  const fallbackSteps = parsedSteps.length ? [] : normalized
    .slice(firstStepIndex)
    .split(/\s[-–—]\s(?=Bước\s*\d+\s*[:.])/i)
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <div className="vdiscussion-overview-description vdiscussion-overview-description-steps">
      {intro ? <p>{intro}</p> : null}
      <ol>
        {(parsedSteps.length ? parsedSteps : fallbackSteps).map((step, index) => {
          if (typeof step !== 'string') {
            return (
              <li key={`${index}-${step.label}`}>
                <strong>{step.label}</strong>
                <span>{step.body}</span>
              </li>
            );
          }
          const match = step.match(/^(Bước\s*\d+)\s*[:.]\s*(.*)$/i);
          return (
            <li key={`${index}-${step}`}>
              {match ? (
                <>
                  <strong>{match[1]}</strong>
                  <span>{match[2] || step}</span>
                </>
              ) : (
                <span>{step}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type StepNumber = 1 | 2 | 3 | 4 | 5 | 6;
type DraftMap = Record<string, string>;

function getErrorMessage(error: unknown) {
  if (error instanceof VDiscussionApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Không thực hiện được thao tác với phiên thảo luận.';
}

function getInitials(name = 'TV') {
  return String(name || 'TV')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'TV';
}

function displayGroupName(name?: string | null) {
  return String(name || 'Nhóm thảo luận').replace(/^Nhom\b/i, 'Nhóm');
}

function parseJson<T = Record<string, unknown>>(raw: unknown, fallback: T): T {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function parseContributionContent(contribution: VDiscussionContribution) {
  return parseVDiscussionContributionContent(contribution.type, contribution.content);
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function newestFirst<T extends { id?: string; createdAt?: string | null; updatedAt?: string | null }>(items: T[]) {
  return [...items].sort((a, b) => {
    const aDate = String(a.updatedAt || a.createdAt || '');
    const bDate = String(b.updatedAt || b.createdAt || '');
    const diff = new Date(bDate || 0).getTime() - new Date(aDate || 0).getTime();
    if (diff) return diff;
    const dateDiff = bDate.localeCompare(aDate);
    if (dateDiff) return dateDiff;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

function actorKey(item: VDiscussionContribution) {
  return item.participantId || item.profileId || 'unknown';
}

function isOptimisticContribution(item: VDiscussionContribution) {
  return Boolean(item.id.startsWith('optimistic-') || item.metadata?.optimistic);
}

function isSamePendingContribution(a: VDiscussionContribution, b: VDiscussionContribution) {
  return (
    a.stepId === b.stepId
    && a.type === b.type
    && (a.parentId || null) === (b.parentId || null)
    && (a.participantId || a.profileId || '') === (b.participantId || b.profileId || '')
    && a.content === b.content
  );
}

function getProblemVotePayload(vote: VDiscussionContribution) {
  return {
    ...parseJson<Record<string, unknown>>(vote.content, {}),
    ...vote.metadata,
  };
}

function average(numbers: number[]) {
  if (!numbers.length) return 0;
  return Number((numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(1));
}

function formatRatingNumber(score: number) {
  return score ? String(score).replace('.', ',') : '0';
}

function formatScoreNumber(score: number) {
  return Number.isInteger(score) ? String(score) : String(score).replace('.', ',');
}

function compactLines(lines: Array<string | null | undefined>) {
  return lines.map((line) => String(line || '').trim()).filter(Boolean).join('\n');
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function stableTieBreakIndex(seed: string, size: number) {
  if (size <= 1) return 0;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % size;
}

function buildFinalReportPayload(form: DraftMap, memberName: string) {
  return {
    format: 'discussion-final-vcontent-v1',
    journeySummary: form.journeySummary || '',
    finalConclusion: form.finalConclusion || '',
    selectedSolution: form.selectedSolution || '',
    keyDecisions: String(form.keyDecisions || '').split('\n').map((item) => item.trim()).filter(Boolean),
    executionCommitments: String(form.executionCommitments || '').split('\n').map((item) => item.trim()).filter(Boolean),
    risksToMonitor: String(form.risksToMonitor || '').split('\n').map((item) => item.trim()).filter(Boolean),
    nextAction: form.nextAction || '',
    retrospectiveNote: form.retrospectiveNote || '',
    submittedByName: memberName,
    submittedAt: new Date().toISOString(),
  };
}

export function VDiscussionSessionPage() {
  const { sessionId, stepNumber = '1' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [lockToastVisible, setLockToastVisible] = useState(false);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [pendingSubmits, setPendingSubmits] = useState<Record<string, boolean>>({});
  const [activeCommentTarget, setActiveCommentTarget] = useState<string | null>(null);
  const [optimisticIdeaScores, setOptimisticIdeaScores] = useState<Record<string, number>>({});
  const [pendingSessionStep, setPendingSessionStep] = useState<{ step: number; requestedAt: number } | null>(null);
  const [likedContributionIds, setLikedContributionIds] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());
  const [plxServerClockOffsetMs, setPlxServerClockOffsetMs] = useState<number | null>(null);
  const [tieBreakState, setTieBreakState] = useState<{ active: boolean; candidateIds: string[] }>({ active: false, candidateIds: [] });
  const [hasAcknowledgedLeaderResult, setHasAcknowledgedLeaderResult] = useState(false);
  const [leaderVoteActionPending, setLeaderVoteActionPending] = useState<null | 'select' | 'confirm'>(null);
  const recordingJoinRef = useRef('');
  const leaderVoteFinalizeRequestRef = useRef('');
  const plxLeaderVoteSyncPromiseRef = useRef<Promise<PlxLeaderVoteState> | null>(null);
  const plxLeaderVoteLastSyncAtRef = useRef(0);
  const lockToastTimerRef = useRef<number | null>(null);
  const actionRateLimitRef = useRef(new Map<string, number>());
  const pendingVoteActionRef = useRef(new Set<string>());
  const pendingSubmitRef = useRef(new Set<string>());
  const submitActionGuardRef = useRef(createSubmitActionGuard());
  const desiredProblemVoteRef = useRef(new Map<string, boolean>());
  const highestSessionDisplayStepRef = useRef<{ sessionId: string; displayStep: number }>({ sessionId: '', displayStep: 1 });
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const invalidateTimerRef = useRef<number | null>(null);

  const activeStepNumber = Math.min(6, Math.max(1, Number(stepNumber || 1))) as StepNumber;
  const isOverviewMode = location.pathname.endsWith('/overview');
  const searchParams = new URLSearchParams(location.search);
  const hasLeaderStartParam = searchParams.get('started') === '1';
  const isReviewMode = searchParams.get('review') === '1';
  const realtimeMode = getRuntimeRealtimeMode('discussion');
  const sessionPollBaseMs = shouldUseRuntimePolling('discussion')
    ? getScaleAwarePollMs('discussion-session', getRuntimePollMs('discussion', realtimeMode === 'polling' ? 10000 : 15000, {
      envName: 'VITE_DISCUSSION_SESSION_POLL_MS',
    }))
    : false;
  const sessionPollInterval = sessionPollBaseMs
    ? buildRuntimeRefetchInterval(sessionPollBaseMs, `${sessionId || 'session'}:${profile?.id || profile?.email || 'anon'}`)
    : false;
  const stepsPollInterval = sessionPollBaseMs
    ? buildRuntimeRefetchInterval(getScaleAwarePollMs('discussion-steps', Math.max(sessionPollBaseMs, 30000)), `${sessionId || 'session'}:steps`)
    : false;
  const contributionsPollInterval = sessionPollBaseMs
    ? buildRuntimeRefetchInterval(getScaleAwarePollMs('discussion-contributions', sessionPollBaseMs), `${sessionId || 'session'}:contributions:${activeStepNumber}:${profile?.id || profile?.email || 'anon'}`)
    : false;

  const sessionQuery = useQuery({
    queryKey: queries.session(sessionId),
    queryFn: () => vdiscussionApi.getSession(sessionId || ''),
    enabled: Boolean(sessionId),
    refetchInterval: sessionPollInterval,
    refetchIntervalInBackground: false,
  });

  const stepsQuery = useQuery({
    queryKey: queries.sessionSteps(sessionId),
    queryFn: async () => {
      const steps = await vdiscussionApi.listSteps(sessionId || '');
      return steps.length ? steps : vdiscussionApi.ensureSteps(sessionId || '');
    },
    enabled: Boolean(sessionId),
    refetchInterval: stepsPollInterval,
    refetchIntervalInBackground: false,
  });

  const requiredContributionStepNumbers = useMemo(() => {
    const numbers = new Set<number>([1]);
    if (!isOverviewMode) numbers.add(activeStepNumber);
    if (activeStepNumber === 4) numbers.add(3);
    if (activeStepNumber === 5) numbers.add(3);
    if (activeStepNumber === 6) {
      numbers.add(3);
      numbers.add(5);
    }
    return [...numbers].sort((left, right) => left - right);
  }, [activeStepNumber, isOverviewMode]);
  const contributionStepIds = useMemo(() => {
    const stepIdByNumber = new Map((stepsQuery.data || []).map((step) => [step.stepNumber, step.id]));
    return requiredContributionStepNumbers
      .map((stepNumber) => stepIdByNumber.get(stepNumber))
      .filter((id): id is string => Boolean(id));
  }, [requiredContributionStepNumbers, stepsQuery.data]);
  const contributionStepIdsKey = useMemo(() => contributionStepIds.join('|'), [contributionStepIds]);

  const contributionsQuery = useQuery({
    queryKey: queries.sessionContributionsForSteps(sessionId, contributionStepIdsKey),
    queryFn: () => vdiscussionApi.listContributionsForSteps(contributionStepIds),
    enabled: Boolean(contributionStepIds.length),
    refetchInterval: contributionsPollInterval,
    refetchIntervalInBackground: false,
  });

  const session = sessionQuery.data;
  const steps = stepsQuery.data || [];
  const topicMetadata = session?.topic?.metadata || {};
  const isHcmcDiscussion = String(topicMetadata.sourceStructure || '') === 'hcmc-cmhv26-word';
  const isCoaching3bDiscussion = [
    topicMetadata.sourceStructure,
    topicMetadata.templateKey,
    topicMetadata.vdiscussionTemplate,
  ].some((value) => String(value || '') === COACHING_3B_SOURCE);
  const isPlxLeaderVoteDiscussion = String(topicMetadata.leaderVoteMode || '') === PLX_LEADER_VOTE_MODE;
  const pendingSessionStepNumber = pendingSessionStep && Date.now() - pendingSessionStep.requestedAt < 15000 ? pendingSessionStep.step : 0;
  const effectiveCurrentStep = Math.max(Number(session?.currentStep || 1), pendingSessionStepNumber || 0);
  const activeStep = steps.find((step) => step.stepNumber === activeStepNumber) || null;
  const stepReadiness = getVDiscussionSessionStepReadiness({
    hasSession: Boolean(session),
    isSessionLoading: sessionQuery.isLoading,
    isStepsLoading: stepsQuery.isLoading,
    hasStepsError: stepsQuery.isError,
    steps,
    activeStepNumber,
  });
  const activeDisplayStepNumber = toVDiscussionDisplayStepNumber(activeStepNumber);
  const getSessionStepCopy = useCallback((displayStep: number) => getTopicStepCopy(session?.topic, displayStep), [session?.topic]);
  const allContributions = contributionsQuery.data || [];
  const activeCoachingStep = isCoaching3bDiscussion
    ? COACHING_3B_RUNTIME_STEPS.find((step) => step.routeStep === activeStepNumber) || null
    : null;

  const stepByNumber = useMemo(() => {
    const map = new Map<number, VDiscussionStep>();
    steps.forEach((step) => map.set(step.stepNumber, step));
    return map;
  }, [steps]);

  const contributionsByStep = useMemo(() => {
    const map = new Map<number, VDiscussionContribution[]>();
    steps.forEach((step) => map.set(step.stepNumber, []));
    allContributions.forEach((item) => {
      const step = steps.find((candidate) => candidate.id === item.stepId);
      if (!step) return;
      map.set(step.stepNumber, [...(map.get(step.stepNumber) || []), item]);
    });
    return map;
  }, [allContributions, steps]);
  const joinedParticipantIds = useMemo(() => {
    const ids = new Set<string>();
    allContributions.forEach((item) => {
      if (item.type !== 'session_join') return;
      const participantId = String(item.participantId || item.metadata.participantId || parseJson<Record<string, unknown>>(item.content, {}).participantId || '');
      if (participantId) ids.add(participantId);
    });
    return ids;
  }, [allContributions]);

  const members = session?.group?.members || [];
  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((member) => {
      const name = member.fullName || member.studentCode || member.email || '';
      if (!name) return;
      map.set(member.id, name);
      if (member.profileId) map.set(member.profileId, name);
      if (member.email) map.set(member.email.toLowerCase(), name);
    });
    return map;
  }, [members]);
  const getContributionAuthorName = useCallback((item: Pick<VDiscussionContribution, 'authorName' | 'participantId' | 'profileId' | 'metadata'> | null | undefined, fallback = 'Thành viên') => {
    if (!item) return fallback;
    const metadataEmail = typeof item.metadata?.email === 'string' ? item.metadata.email.toLowerCase() : '';
    const metadataName = typeof item.metadata?.authorName === 'string' ? item.metadata.authorName : '';
    return item.authorName ||
      (item.participantId ? memberNameById.get(item.participantId) : '') ||
      (item.profileId ? memberNameById.get(item.profileId) : '') ||
      (metadataEmail ? memberNameById.get(metadataEmail) : '') ||
      metadataName ||
      fallback;
  }, [memberNameById]);
  const currentParticipant = useMemo(() => {
    if (!profile) return null;
    return members.find((participant) =>
      participant.profileId === profile.id ||
      participant.email?.toLowerCase() === profile.email?.toLowerCase() ||
      participant.studentCode === profile.studentCode,
    ) || null;
  }, [members, profile]);
  const groupScore = session?.group?.teacherScore ?? null;
  const groupResultMetadata = useMemo(
    () => parseJson<{ activeParticipantIds?: unknown[]; bonusPoints?: unknown }>(session?.group?.teacherComment, {}),
    [session?.group?.teacherComment],
  );
  const bonusParticipantIds = useMemo(
    () => asArray(groupResultMetadata.activeParticipantIds).map(String),
    [groupResultMetadata.activeParticipantIds],
  );
  const personalBonusPoints = Number(groupResultMetadata.bonusPoints || 0);
  const hasPersonalBonus = Boolean(
    currentParticipant?.id &&
    personalBonusPoints > 0 &&
    bonusParticipantIds.includes(currentParticipant.id),
  );

  const leaderParticipant = members.find((member) => member.id === session?.group?.leaderParticipantId) || null;
  const usesLeaderVote = !isCoaching3bDiscussion;
  const isGroupFormEditor = Boolean(currentParticipant?.id || profile?.role === 'admin' || profile?.role === 'manager');
  const canLead = isCoaching3bDiscussion
    ? isGroupFormEditor
    : Boolean(
      profile?.role === 'admin' ||
      profile?.role === 'manager' ||
      (currentParticipant?.id && currentParticipant.id === leaderParticipant?.id),
    );
  const step1 = stepByNumber.get(1);
  const step1Items = contributionsByStep.get(1) || [];
  const leaderVoteStartedAt = String(step1?.summaryData?.leaderVoteStartedAt || '');
  const persistedLeaderVoteStartedAtMs = leaderVoteStartedAt ? new Date(leaderVoteStartedAt).getTime() : 0;
  const firstSessionJoinAtMs = useMemo(() => {
    const timestamps = step1Items
      .filter((item) => item.type === 'session_join')
      .map((item) => new Date(item.createdAt || item.updatedAt || 0).getTime())
      .filter(Number.isFinite);
    return timestamps.length ? Math.min(...timestamps) : 0;
  }, [step1Items]);
  const leaderVoteStartedAtMs = Number.isFinite(persistedLeaderVoteStartedAtMs) && persistedLeaderVoteStartedAtMs > 0
    ? persistedLeaderVoteStartedAtMs
    : isPlxLeaderVoteDiscussion ? 0 : firstSessionJoinAtMs;
  const leaderVoteRoundId = String(step1?.summaryData?.leaderVoteRoundId || '');
  const getLeaderVotePayload = (vote: VDiscussionContribution) => ({
    ...parseJson<Record<string, unknown>>(vote.content, {}),
    ...vote.metadata,
  });
  const getLeaderVoteTargetId = (vote: VDiscussionContribution) => String(getLeaderVotePayload(vote).targetParticipantId || '');
  const isLeaderVoteConfirmed = (vote: VDiscussionContribution) => Boolean(getLeaderVotePayload(vote).confirmedAt);
  const activeLeaderVoteItems = useMemo(() => {
    return step1Items.filter((item) => {
      if (item.type !== 'leader_vote') return false;
      if (isPlxLeaderVoteDiscussion) {
        return Boolean(leaderVoteRoundId) && String(getLeaderVotePayload(item).leaderVoteRoundId || '') === leaderVoteRoundId;
      }
      if (!leaderVoteStartedAtMs || !Number.isFinite(leaderVoteStartedAtMs)) return true;
      const voteTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
      return voteTime >= leaderVoteStartedAtMs - 1000;
    });
  }, [isPlxLeaderVoteDiscussion, leaderVoteRoundId, step1Items, leaderVoteStartedAtMs]);
  const leaderVotes = useMemo(() => newestFirst(activeLeaderVoteItems).reduce((map, vote) => {
    if (!map.has(actorKey(vote))) map.set(actorKey(vote), vote);
    return map;
  }, new Map<string, VDiscussionContribution>()), [activeLeaderVoteItems]);
  const leaderVoteCounts = useMemo(() => {
    const counts = new Map<string, number>();
    leaderVotes.forEach((vote) => {
      const target = getLeaderVoteTargetId(vote);
      if (target) counts.set(target, (counts.get(target) || 0) + 1);
    });
    return counts;
  }, [leaderVotes]);
  const confirmedLeaderVotes = useMemo(
    () => [...leaderVotes.values()].filter((vote) => isLeaderVoteConfirmed(vote)),
    [leaderVotes],
  );
  const leaderVoteCoordinatorId = useMemo(
    () => [...members].map((member) => member.id).filter(Boolean).sort()[0] || '',
    [members],
  );
  const canCoordinateLeaderVote = Boolean(currentParticipant?.id) && currentParticipant?.id === leaderVoteCoordinatorId;
  const confirmedLeaderVoteCounts = useMemo(() => {
    const counts = new Map<string, number>();
    confirmedLeaderVotes.forEach((vote) => {
      const target = getLeaderVoteTargetId(vote);
      if (target) counts.set(target, (counts.get(target) || 0) + 1);
    });
    return counts;
  }, [confirmedLeaderVotes]);
  const latestLeaderVoteResult = useMemo(
    () => newestFirst(step1Items.filter((item) => {
      if (item.type !== 'leader_vote_result') return false;
      if (!isPlxLeaderVoteDiscussion) return true;
      return Boolean(leaderVoteRoundId) && String(getLeaderVotePayload(item).leaderVoteRoundId || '') === leaderVoteRoundId;
    }))[0] || null,
    [isPlxLeaderVoteDiscussion, leaderVoteRoundId, step1Items],
  );
  const leaderVoteDeadline = leaderVoteStartedAtMs ? leaderVoteStartedAtMs + LEADER_VOTE_DURATION_MS : 0;
  const isLeaderVoteClockReady = !isPlxLeaderVoteDiscussion || plxServerClockOffsetMs !== null;
  const leaderVoteClockNow = now + (isPlxLeaderVoteDiscussion ? plxServerClockOffsetMs || 0 : 0);
  const leaderVoteRemainingMs = leaderVoteDeadline && isLeaderVoteClockReady
    ? Math.max(0, leaderVoteDeadline - leaderVoteClockNow)
    : LEADER_VOTE_DURATION_MS;
  const hasLeaderVoteExpired = Boolean(leaderVoteDeadline && isLeaderVoteClockReady && leaderVoteRemainingMs <= 0);
  const hasEveryoneConfirmedLeaderVote = members.length > 0 && confirmedLeaderVotes.length >= members.length;
  const myLeaderVote = currentParticipant ? leaderVotes.get(currentParticipant.id) : null;
  const myLeaderVoteTargetId = myLeaderVote
    ? getLeaderVoteTargetId(myLeaderVote)
    : '';
  const myLeaderVoteConfirmed = Boolean(myLeaderVote && isLeaderVoteConfirmed(myLeaderVote));
  const currentMemberName = currentParticipant?.fullName || profile?.fullName || profile?.email || 'Thành viên';
  const hasRecordedSessionJoin = Boolean(currentParticipant?.id && joinedParticipantIds.has(currentParticipant.id));
  const finalStep = stepByNumber.get(6);
  const isFinalLocked = Boolean(finalStep?.summaryData?.finalLocked);
  const isSessionCompleted = session?.status === 'completed';
  const leaderAckKey = sessionId && leaderParticipant?.id && currentParticipant?.id
    ? `vdiscussion:${sessionId}:leader:${leaderParticipant.id}:ack:${currentParticipant.id}`
    : '';
  const hasAcknowledgedLeaderStart = hasAcknowledgedLeaderResult || hasLeaderStartParam;
  const canReviewAllSteps = isFinalLocked || isSessionCompleted;
  const canAccessDiscussionSteps = canReviewAllSteps || isGroupFormEditor || Boolean(effectiveCurrentStep > 1) || hasAcknowledgedLeaderStart;

  const invalidateSessionData = useCallback(async () => {
    if (!sessionId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queries.session(sessionId) }),
      queryClient.invalidateQueries({ queryKey: queries.sessionSteps(sessionId) }),
      queryClient.invalidateQueries({ queryKey: queries.sessionContributions(sessionId) }),
    ]);
  }, [queryClient, sessionId]);

  const applyPlxLeaderVoteState = useCallback((state: PlxLeaderVoteState) => {
    if (!sessionId) return;
    const receivedAt = Date.now();
    const serverNowMs = new Date(state.serverNow).getTime();
    if (Number.isFinite(serverNowMs)) setPlxServerClockOffsetMs(serverNowMs - receivedAt);
    setNow(receivedAt);
    queryClient.setQueryData<VDiscussionStep[]>(
      queries.sessionSteps(sessionId),
      (current = []) => current.map((step) => step.id === state.stepId ? {
        ...step,
        summaryData: {
          ...step.summaryData,
          leaderVoteRoundId: state.roundId,
          leaderVoteStartedAt: state.startedAt,
          leaderVoteDurationSeconds: state.durationSeconds,
          leaderVoteStatus: state.status,
          ...(state.leaderParticipantId ? { leaderVoteLeaderParticipantId: state.leaderParticipantId } : {}),
        },
      } : step),
    );
    if (state.leaderParticipantId) {
      queryClient.setQueryData<typeof session>(
        queries.session(sessionId),
        (current) => current?.group ? {
          ...current,
          group: { ...current.group, leaderParticipantId: state.leaderParticipantId },
        } : current,
      );
    }
  }, [queryClient, sessionId]);

  const syncPlxLeaderVoteState = useCallback(() => {
    if (!sessionId) return Promise.reject(new Error('Missing discussion session'));
    if (plxLeaderVoteSyncPromiseRef.current) return plxLeaderVoteSyncPromiseRef.current;
    let request: Promise<PlxLeaderVoteState>;
    request = vdiscussionApi.joinPlxLeaderVote(sessionId)
      .then((state) => {
        applyPlxLeaderVoteState(state);
        plxLeaderVoteLastSyncAtRef.current = Date.now();
        return state;
      })
      .finally(() => {
        if (plxLeaderVoteSyncPromiseRef.current === request) plxLeaderVoteSyncPromiseRef.current = null;
      });
    plxLeaderVoteSyncPromiseRef.current = request;
    return request;
  }, [applyPlxLeaderVoteState, sessionId]);

  const scheduleSessionInvalidate = useCallback(() => {
    if (!sessionId) return;
    if (invalidateTimerRef.current) window.clearTimeout(invalidateTimerRef.current);
    invalidateTimerRef.current = window.setTimeout(() => {
      invalidateTimerRef.current = null;
      void invalidateSessionData();
    }, 1200);
  }, [invalidateSessionData, sessionId]);

  const mergeContributionIntoCache = useCallback((contribution: VDiscussionContribution) => {
    if (!sessionId) return;
    if (contribution.type === 'problem_vote') {
      const payload = getProblemVotePayload(contribution);
      const key = String(payload.problemKey || '');
      const voteActorKey = `${actorKey(contribution)}:${key}`;
      const desired = desiredProblemVoteRef.current.get(voteActorKey);
      if (typeof desired === 'boolean' && Boolean(payload.selected) !== desired) return;
    }
    queryClient.setQueryData<VDiscussionContribution[]>(
      queries.sessionContributionsForSteps(sessionId, contributionStepIdsKey),
      (current = []) => {
        const existingIndex = current.findIndex((item) => item.id === contribution.id);
        const optimisticIndex = isOptimisticContribution(contribution)
          ? -1
          : current.findIndex((item) => isOptimisticContribution(item) && isSamePendingContribution(item, contribution));
        const targetIndex = existingIndex >= 0 ? existingIndex : optimisticIndex;
        if (targetIndex === -1) return [...current, contribution];
        return current
          .map((item, index) => (index === targetIndex ? { ...item, ...contribution } : item))
          .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);
      },
    );
    if (contribution.type === 'leader_vote_result') {
      const payload = parseContributionContent(contribution).payload;
      const targetParticipantId = String(payload.targetParticipantId || '');
      if (targetParticipantId) {
        queryClient.setQueryData<typeof session>(
          queries.session(sessionId),
          (current) => current?.group ? {
            ...current,
            group: {
              ...current.group,
              leaderParticipantId: targetParticipantId,
            },
          } : current,
        );
      }
    }
  }, [contributionStepIdsKey, queryClient, sessionId]);

  const removeContributionFromCache = useCallback((contributionId: string) => {
    if (!sessionId || !contributionId) return;
    queryClient.setQueryData<VDiscussionContribution[]>(
      queries.sessionContributionsForSteps(sessionId, contributionStepIdsKey),
      (current = []) => current.filter((item) => item.id !== contributionId && item.parentId !== contributionId),
    );
  }, [contributionStepIdsKey, queryClient, sessionId]);

  const mergeStepSummaryIntoCache = useCallback((stepId: string, summaryData: Record<string, unknown>, status?: string) => {
    if (!sessionId || !stepId) return;
    queryClient.setQueryData<VDiscussionStep[]>(
      queries.sessionSteps(sessionId),
      (current = []) => current.map((step) => (step.id === stepId ? {
        ...step,
        summaryData,
        status: status || step.status,
      } : step)),
    );
  }, [queryClient, sessionId]);

  const mergeSessionStepIntoCache = useCallback((step: number, status?: string) => {
    if (!sessionId) return;
    queryClient.setQueryData<typeof session>(
      queries.session(sessionId),
      (current) => current ? {
        ...current,
        currentStep: step,
        status: status || (step >= 6 ? 'completed' : 'active'),
      } : current,
    );
  }, [queryClient, sessionId]);

  const mapRealtimeContribution = useCallback((row: Record<string, unknown>): VDiscussionContribution => {
    const participantId = String(row.participant_id || '');
    const profileId = String(row.profile_id || '');
    const participant = members.find((member) => member.id === participantId || member.profileId === profileId);
    return {
      id: String(row.id || ''),
      stepId: String(row.step_id || ''),
      profileId: profileId || null,
      participantId: participantId || null,
      authorName: participant?.fullName || null,
      type: String(row.type || 'comment'),
      content: String(row.content || ''),
      metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
      parentId: row.parent_id ? String(row.parent_id) : null,
      upvotesCount: Number(row.upvotes_count || 0),
      downvotesCount: Number(row.downvotes_count || 0),
      createdAt: row.created_at ? String(row.created_at) : null,
      updatedAt: row.updated_at ? String(row.updated_at) : null,
    };
  }, [members]);

  const applyRealtimeSession = useCallback((row: Record<string, unknown>) => {
    if (!sessionId || String(row.id || '') !== sessionId) return;
    queryClient.setQueryData<typeof session>(
      queries.session(sessionId),
      (current) => current ? {
        ...current,
        currentStep: Number(row.current_step || current.currentStep || 1),
        status: String(row.status || current.status || 'active'),
      } : current,
    );
  }, [queryClient, sessionId]);

  const applyRealtimeStep = useCallback((row: Record<string, unknown>) => {
    if (!sessionId || String(row.session_id || '') !== sessionId) return;
    queryClient.setQueryData<VDiscussionStep[]>(
      queries.sessionSteps(sessionId),
      (current = []) => current.map((step) => step.id === String(row.id || '') ? {
        ...step,
        status: String(row.status || step.status),
        summaryData: parseJson<Record<string, unknown>>(row.summary_data, step.summaryData),
      } : step),
    );
  }, [queryClient, sessionId]);

  const saveContributionMutation = useMutation({
    mutationFn: (payload: { stepId: string; type: string; content: string; parentId?: string | null; metadata?: Record<string, unknown> }) =>
      vdiscussionApi.saveContribution(payload),
    onSuccess: (saved) => {
      mergeContributionIntoCache(saved);
      void queryClient.invalidateQueries({ queryKey: queries.sessionContributions(sessionId) });
    },
  });

  const recordJoinMutation = useMutation({
    mutationFn: (payload: { stepId: string; type: string; content: string; parentId?: string | null; metadata?: Record<string, unknown> }) =>
      vdiscussionApi.saveContribution(payload),
    onSuccess: (saved) => {
      mergeContributionIntoCache(saved);
      void queryClient.invalidateQueries({ queryKey: queries.sessionContributions(sessionId) });
    },
  });

  const updateContributionMutation = useMutation({
    mutationFn: (payload: { id: string; content: string; expectedUpdatedAt: string; metadata?: Record<string, unknown> }) => vdiscussionApi.updateContribution(payload),
    onSuccess: (updated) => {
      mergeContributionIntoCache(updated);
      publishSessionBroadcast('contribution', { contribution: updated });
      void queryClient.invalidateQueries({ queryKey: queries.sessionContributions(sessionId) });
    },
  });
  const isContributionSaving = saveContributionMutation.isPending || updateContributionMutation.isPending;

  const voteMutation = useMutation({
    mutationFn: ({ id, type, active }: { id: string; type: 'upvote' | 'downvote'; active?: boolean }) =>
      vdiscussionApi.voteContribution(id, type, { active }),
    onSuccess: (updated) => {
      mergeContributionIntoCache(updated);
      publishSessionBroadcast('contribution', { contribution: updated });
      void queryClient.invalidateQueries({ queryKey: queries.sessionContributions(sessionId) });
    },
  });

  const summaryMutation = useMutation({
    mutationFn: ({ stepId, summaryData, status }: { stepId: string; summaryData: Record<string, unknown>; status?: string }) =>
      vdiscussionApi.updateStepSummary(stepId, summaryData, status),
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    onSuccess: (updated) => {
      queryClient.setQueryData<VDiscussionStep[]>(
        queries.sessionSteps(sessionId),
        (current = []) => current.map((step) => (step.id === updated.id ? { ...step, ...updated } : step)),
      );
      publishSessionBroadcast('step-summary', { stepId: updated.id, summaryData: updated.summaryData, status: updated.status });
      void queryClient.invalidateQueries({ queryKey: queries.sessionSteps(sessionId) });
    },
  });

  const sessionStepMutation = useMutation({
    mutationFn: ({ step, status }: { step: number; status?: string }) => vdiscussionApi.updateSessionStep(sessionId || '', step, status),
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    onSuccess: (_result, variables) => {
      queryClient.setQueryData<typeof session>(
        queries.session(sessionId),
        (current) => current ? {
          ...current,
          currentStep: variables.step,
          status: variables.status || (variables.step >= 6 ? 'completed' : 'active'),
        } : current,
      );
      publishSessionBroadcast('session-step', { step: variables.step, status: variables.status || (variables.step >= 6 ? 'completed' : 'active') });
      void queryClient.invalidateQueries({ queryKey: queries.session(sessionId) });
    },
  });

  const leaderMutation = useMutation({
    mutationFn: (participantId: string) => vdiscussionApi.assignGroupLeader(session?.groupId || '', participantId),
    onSuccess: (_result, participantId) => {
      queryClient.setQueryData<typeof session>(
        queries.session(sessionId),
        (current) => current?.group ? {
          ...current,
          group: {
            ...current.group,
            leaderParticipantId: participantId,
          },
        } : current,
      );
      void invalidateSessionData();
    },
  });

  useEffect(() => {
    if (!usesLeaderVote || leaderParticipant) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [leaderParticipant, usesLeaderVote]);

  useEffect(() => {
    if (!isPlxLeaderVoteDiscussion || !sessionId || !currentParticipant?.id) return undefined;
    const syncOnResume = () => {
      const resumedAt = Date.now();
      setNow(resumedAt);
      if (document.visibilityState !== 'visible' || resumedAt - plxLeaderVoteLastSyncAtRef.current < 5000) return;
      plxLeaderVoteLastSyncAtRef.current = resumedAt;
      void syncPlxLeaderVoteState()
        .then((state) => {
          if (state.status === 'active' && state.confirmedCount !== confirmedLeaderVotes.length) {
            void queryClient.invalidateQueries({ queryKey: queries.sessionContributions(sessionId) });
          }
        })
        .catch((error) => setErrorMessage(getErrorMessage(error)));
    };
    document.addEventListener('visibilitychange', syncOnResume);
    window.addEventListener('focus', syncOnResume);
    window.addEventListener('pageshow', syncOnResume);
    return () => {
      document.removeEventListener('visibilitychange', syncOnResume);
      window.removeEventListener('focus', syncOnResume);
      window.removeEventListener('pageshow', syncOnResume);
    };
  }, [confirmedLeaderVotes.length, currentParticipant?.id, isPlxLeaderVoteDiscussion, queryClient, sessionId, syncPlxLeaderVoteState]);

  useEffect(() => () => {
    if (lockToastTimerRef.current) window.clearTimeout(lockToastTimerRef.current);
    if (invalidateTimerRef.current) window.clearTimeout(invalidateTimerRef.current);
  }, []);

  useEffect(() => {
    if (!usesLeaderVote || isOverviewMode || leaderParticipant || latestLeaderVoteResult || !members.length || tieBreakState.active || leaderMutation.isPending) return;
    if (isPlxLeaderVoteDiscussion) {
      if (!hasLeaderVoteExpired || !sessionId || !leaderVoteRoundId || !currentParticipant?.id) return;
      const finalizeKey = `${sessionId}:${leaderVoteRoundId}`;
      if (leaderVoteFinalizeRequestRef.current === finalizeKey) return;
      const finalizeRank = members
        .map((member) => member.id)
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))
        .indexOf(currentParticipant.id);
      if (finalizeRank < 0) return;

      leaderVoteFinalizeRequestRef.current = finalizeKey;
      let requestStarted = false;
      const timer = window.setTimeout(() => {
        requestStarted = true;
        void vdiscussionApi.finalizePlxLeaderVote(sessionId)
          .then((state) => {
            applyPlxLeaderVoteState(state);
            return invalidateSessionData();
          })
          .catch((error) => {
            leaderVoteFinalizeRequestRef.current = '';
            setErrorMessage(getErrorMessage(error));
          });
      }, finalizeRank * PLX_LEADER_VOTE_FINALIZE_STAGGER_MS);

      return () => {
        window.clearTimeout(timer);
        if (!requestStarted && leaderVoteFinalizeRequestRef.current === finalizeKey) {
          leaderVoteFinalizeRequestRef.current = '';
        }
      };
    }
    if (!canCoordinateLeaderVote) return;
    if (hasEveryoneConfirmedLeaderVote) {
      void finalizeLeaderVote('all-confirmed');
      return;
    }
    if (hasLeaderVoteExpired) void finalizeLeaderVote('timeout');
  }, [applyPlxLeaderVoteState, canCoordinateLeaderVote, confirmedLeaderVotes.length, currentParticipant?.id, hasEveryoneConfirmedLeaderVote, hasLeaderVoteExpired, invalidateSessionData, isOverviewMode, isPlxLeaderVoteDiscussion, leaderParticipant?.id, leaderVoteRoundId, latestLeaderVoteResult?.id, members, sessionId, tieBreakState.active, leaderMutation.isPending, usesLeaderVote]);

  useEffect(() => {
    if (!usesLeaderVote || !leaderParticipant || !leaderAckKey) {
      setHasAcknowledgedLeaderResult(false);
      return;
    }
    if (hasLeaderStartParam) {
      window.sessionStorage.setItem(leaderAckKey, 'true');
      setHasAcknowledgedLeaderResult(true);
      return;
    }
    setHasAcknowledgedLeaderResult(window.sessionStorage.getItem(leaderAckKey) === 'true');
  }, [leaderParticipant?.id, leaderAckKey, hasLeaderStartParam, usesLeaderVote]);

  useEffect(() => {
    if (!sessionId || !supabase || !shouldUseRuntimeRealtime('discussion')) return undefined;
    const client = supabase;
    const fullRealtime = shouldUseFullDiscussionRealtime();
    let channel = client
      .channel(`vdiscussion-session-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_discussion_sessions', filter: `id=eq.${sessionId}` }, (payload) => {
        if (payload.new) applyRealtimeSession(payload.new as Record<string, unknown>);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_discussion_steps', filter: `session_id=eq.${sessionId}` }, (payload) => {
        if (payload.new) applyRealtimeStep(payload.new as Record<string, unknown>);
      });
    contributionStepIds.forEach((stepId) => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_discussion_contributions', filter: `step_id=eq.${stepId}` }, (payload) => {
        const row = (payload.new || payload.old) as Record<string, unknown> | null;
        if (!row) return;
        if (payload.eventType === 'DELETE') {
          removeContributionFromCache(String(row.id || ''));
          return;
        }
        if (payload.new) mergeContributionIntoCache(mapRealtimeContribution(payload.new as Record<string, unknown>));
      });
    });
    if (fullRealtime) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_discussion_votes' }, (payload) => {
        const row = (payload.new || payload.old) as Record<string, unknown> | null;
        if (!row) return;
        scheduleSessionInvalidate();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_discussion_groups' }, (payload) => {
        const row = (payload.new || payload.old) as Record<string, unknown> | null;
        if (!row || String(row.id || '') !== session?.groupId) return;
        scheduleSessionInvalidate();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vcontent_discussion_group_members' }, (payload) => {
        const row = (payload.new || payload.old) as Record<string, unknown> | null;
        if (!row || String(row.group_id || '') !== session?.groupId) return;
        scheduleSessionInvalidate();
      });
    }
    channel = channel.on('broadcast', { event: 'step-summary' }, (message) => {
        const payload = message.payload as Record<string, unknown> | null;
        if (!payload || String(payload.sessionId || '') !== sessionId) return;
        const stepId = String(payload.stepId || '');
        const summaryData = parseJson<Record<string, unknown>>(payload.summaryData, {});
        mergeStepSummaryIntoCache(stepId, summaryData, payload.status ? String(payload.status) : undefined);
      })
      .on('broadcast', { event: 'session-step' }, (message) => {
        const payload = message.payload as Record<string, unknown> | null;
        if (!payload || String(payload.sessionId || '') !== sessionId) return;
        mergeSessionStepIntoCache(Number(payload.step || 1), payload.status ? String(payload.status) : undefined);
      })
      .on('broadcast', { event: 'contribution' }, (message) => {
        const payload = message.payload as { sessionId?: string; contribution?: VDiscussionContribution } | null;
        if (!payload || payload.sessionId !== sessionId || !payload.contribution) return;
        mergeContributionIntoCache(payload.contribution);
      });
    realtimeChannelRef.current = channel;
    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        void invalidateSessionData();
      }
    });

    return () => {
      if (realtimeChannelRef.current === channel) realtimeChannelRef.current = null;
      void client.removeChannel(channel);
    };
  }, [contributionStepIds, session?.groupId, sessionId, applyRealtimeSession, applyRealtimeStep, invalidateSessionData, mapRealtimeContribution, mergeContributionIntoCache, mergeStepSummaryIntoCache, removeContributionFromCache, scheduleSessionInvalidate]);

  useEffect(() => {
    if (!step1?.id || !currentParticipant?.id || (!isPlxLeaderVoteDiscussion && hasRecordedSessionJoin) || recordJoinMutation.isPending) return;
    const joinKey = `${sessionId || ''}:${currentParticipant.id}`;
    if (recordingJoinRef.current === joinKey) return;
    recordingJoinRef.current = joinKey;
    if (isPlxLeaderVoteDiscussion && sessionId) {
      void syncPlxLeaderVoteState()
        .then((state) => {
          if (state.status === 'active') {
            void queryClient.invalidateQueries({ queryKey: queries.sessionContributions(sessionId) });
          }
        })
        .catch((error) => {
          recordingJoinRef.current = '';
          setErrorMessage(getErrorMessage(error));
        });
      return;
    }
    void recordJoinMutation.mutateAsync({
      stepId: step1.id,
      type: 'session_join',
      content: JSON.stringify({
        participantId: currentParticipant.id,
        participantName: currentParticipant.fullName,
        joinedAt: new Date().toISOString(),
      }),
      metadata: {
        participantId: currentParticipant.id,
        participantName: currentParticipant.fullName,
      },
    }).catch((error) => {
      recordingJoinRef.current = '';
      setErrorMessage(getErrorMessage(error));
    });
  }, [step1?.id, currentParticipant?.id, hasRecordedSessionJoin, isPlxLeaderVoteDiscussion, queryClient, recordJoinMutation, sessionId, syncPlxLeaderVoteState]);

  useEffect(() => {
    if (!pendingSessionStep) return;
    if (Number(session?.currentStep || 0) >= pendingSessionStep.step) {
      setPendingSessionStep(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setPendingSessionStep((current) => (current === pendingSessionStep ? null : current));
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [pendingSessionStep, session?.currentStep]);

  useEffect(() => {
    if (!sessionId || !effectiveCurrentStep) return;
    if (sessionQuery.isLoading || stepsQuery.isLoading || !session) return;
    if (canReviewAllSteps) return;
    const currentSessionDisplayStep = toVDiscussionDisplayStepNumber(effectiveCurrentStep);
    if (highestSessionDisplayStepRef.current.sessionId !== sessionId) {
      highestSessionDisplayStepRef.current = { sessionId, displayStep: currentSessionDisplayStep || 1 };
    } else if (currentSessionDisplayStep > highestSessionDisplayStepRef.current.displayStep) {
      highestSessionDisplayStepRef.current.displayStep = currentSessionDisplayStep;
    }
    const monotonicSessionDisplayStep = Math.max(currentSessionDisplayStep, highestSessionDisplayStepRef.current.displayStep);
    const monotonicRouteStep = VDISCUSSION_DISPLAY_STEPS.find((step) => step.displayStep === monotonicSessionDisplayStep)?.routeStep;
    if (usesLeaderVote && !isOverviewMode && !isReviewMode && leaderParticipant && !canLead && activeDisplayStepNumber < monotonicSessionDisplayStep && monotonicRouteStep) {
      navigate(`/vdiscussion/session/${sessionId}/step/${monotonicRouteStep}`, { replace: true });
      return;
    }
    if (activeDisplayStepNumber <= monotonicSessionDisplayStep) return;
    if (currentSessionDisplayStep >= monotonicSessionDisplayStep) {
      const unlockedStep = VDISCUSSION_DISPLAY_STEPS.find((step) => step.displayStep === currentSessionDisplayStep);
      if (unlockedStep) navigate(`/vdiscussion/session/${sessionId}/step/${unlockedStep.routeStep}`, { replace: true });
    }
  }, [activeDisplayStepNumber, canLead, canReviewAllSteps, effectiveCurrentStep, isOverviewMode, isReviewMode, leaderParticipant, navigate, session, sessionId, sessionQuery.isLoading, stepsQuery.isLoading, usesLeaderVote]);

  if (!sessionId) return <Navigate to="/vdiscussion" replace />;

  async function runAction(action: () => Promise<unknown>) {
    setErrorMessage('');
    try {
      await action();
      return true;
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      return false;
    }
  }

  function showFinalLockedNotice() {
    setErrorMessage('');
    setLockToastVisible(true);
    if (lockToastTimerRef.current) window.clearTimeout(lockToastTimerRef.current);
    lockToastTimerRef.current = window.setTimeout(() => {
      setLockToastVisible(false);
      lockToastTimerRef.current = null;
    }, 3200);
  }

  function setDraft(key: string, value: string) {
    setDrafts((current) => ({ ...current, [key]: value }));
  }

  function acknowledgeLeaderResult() {
    if (leaderAckKey) window.sessionStorage.setItem(leaderAckKey, 'true');
    setHasAcknowledgedLeaderResult(true);
    navigate(`${location.pathname}?started=1`, { replace: true });
  }

  function showStudentNextStepLockedNotice() {
    setErrorMessage(isCoaching3bDiscussion
      ? 'Bạn có thể chuyển bước sau khi nhóm chốt và chuyển bước tiếp theo.'
      : 'Bạn có thể chuyển bước sau khi nhóm trưởng chốt và chuyển bước tiếp theo.');
  }

  function publishSessionBroadcast(event: 'step-summary' | 'session-step' | 'contribution', payload: Record<string, unknown>) {
    const channel = realtimeChannelRef.current;
    if (!channel || !sessionId) return;
    void channel.send({
      type: 'broadcast',
      event,
      payload: {
        sessionId,
        ...payload,
      },
    });
  }

  async function saveStepContribution(step: number, type: string, payload: Record<string, unknown>, parentId?: string | null) {
    if (isFinalLocked && type !== 'session_join') {
      showFinalLockedNotice();
      return null;
    }
    const actor = currentParticipant?.id || profile?.id || 'anon';
    const rateKey = `${actor}:${step}:${type}`;
    const submitKey = `contribution:${rateKey}:${parentId || 'root'}:${JSON.stringify(payload)}`;
    return submitActionGuardRef.current.run(submitKey, async () => {
      const nowMs = Date.now();
      const minDelayMs = type === 'problem_vote' ? 0 : type === 'comment' || type.includes('chat') ? 2500 : 1200;
      const lastSubmittedAt = actionRateLimitRef.current.get(rateKey) || 0;
      if (nowMs - lastSubmittedAt < minDelayMs) {
        if (!['problem_vote', 'leader_vote'].includes(type)) {
          setErrorMessage('Thao tác quá nhanh, vui lòng chờ một chút rồi gửi lại.');
        }
        return null;
      }
      actionRateLimitRef.current.set(rateKey, nowMs);
      const targetStep = stepByNumber.get(step);
      if (!targetStep?.id) return null;
      const saved = await saveContributionMutation.mutateAsync({
        stepId: targetStep.id,
        type,
        content: JSON.stringify(payload),
        parentId,
      });
      if (sessionId) {
        queryClient.setQueryData<VDiscussionContribution[]>(
          queries.sessionContributionsForSteps(sessionId, contributionStepIdsKey),
          (current = []) => current.some((item) => item.id === saved.id) ? current : [...current, saved],
        );
      }
      publishSessionBroadcast('contribution', { contribution: saved });
      return saved;
    });
  }

  async function saveContributionOptimistic(step: number, type: string, payload: Record<string, unknown>, parentId?: string | null, options?: { pendingKey?: string }) {
    const targetStep = stepByNumber.get(step);
    const pendingKey = options?.pendingKey || `${type}:${currentParticipant?.id || profile?.id || 'anon'}:${JSON.stringify(payload)}:${parentId || ''}`;
    if (pendingSubmitRef.current.has(pendingKey)) return null;
    pendingSubmitRef.current.add(pendingKey);
    const optimisticAt = new Date().toISOString();
    const optimisticContribution: VDiscussionContribution | null = targetStep?.id ? {
      id: `optimistic-${type}-${currentParticipant?.id || profile?.id || 'anon'}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      stepId: targetStep.id,
      profileId: profile?.id || null,
      participantId: currentParticipant?.id || null,
      authorName: currentParticipant?.fullName || profile?.fullName || profile?.email || null,
      type,
      content: JSON.stringify(payload),
      metadata: { optimistic: true },
      parentId: parentId || null,
      upvotesCount: 0,
      downvotesCount: 0,
      createdAt: optimisticAt,
      updatedAt: optimisticAt,
    } : null;
    if (optimisticContribution) {
      mergeContributionIntoCache(optimisticContribution);
    }
    try {
      const saved = await saveStepContribution(step, type, payload, parentId);
      if (optimisticContribution) removeContributionFromCache(optimisticContribution.id);
      return saved;
    } catch (error) {
      if (optimisticContribution) removeContributionFromCache(optimisticContribution.id);
      setErrorMessage(getErrorMessage(error));
      throw error;
    } finally {
      pendingSubmitRef.current.delete(pendingKey);
    }
  }

  async function likeContribution(id: string) {
    const pendingKey = `contribution:${id}`;
    if (pendingVoteActionRef.current.has(pendingKey)) return;
    pendingVoteActionRef.current.add(pendingKey);
    const isLiked = likedContributionIds.has(id);
    setLikedContributionIds((current) => {
      const next = new Set(current);
      if (isLiked) next.delete(id);
      else next.add(id);
      return next;
    });
    if (sessionId) {
      queryClient.setQueryData<VDiscussionContribution[]>(
        queries.sessionContributionsForSteps(sessionId, contributionStepIdsKey),
        (current = []) => current.map((item) => item.id === id
          ? { ...item, upvotesCount: Math.max(0, item.upvotesCount + (isLiked ? -1 : 1)) }
          : item),
      );
    }
    try {
      await voteMutation.mutateAsync({ id, type: 'upvote', active: !isLiked });
      setErrorMessage('');
    } catch (error) {
      setLikedContributionIds((current) => {
        const next = new Set(current);
        if (isLiked) next.add(id);
        else next.delete(id);
        return next;
      });
      setErrorMessage(getErrorMessage(error));
    } finally {
      pendingVoteActionRef.current.delete(pendingKey);
    }
  }

  async function saveLeaderVote(payload: Record<string, unknown>, action: 'select' | 'confirm') {
    if (leaderVoteActionPending) return;
    setLeaderVoteActionPending(action);
    try {
      if (isPlxLeaderVoteDiscussion && sessionId) {
        const targetParticipantId = String(payload.targetParticipantId || '');
        const state = await vdiscussionApi.castPlxLeaderVote(sessionId, targetParticipantId, action === 'confirm');
        applyPlxLeaderVoteState(state);
        await invalidateSessionData();
        return;
      }
      await saveStepContribution(1, 'leader_vote', payload);
    } finally {
      setLeaderVoteActionPending(null);
    }
  }

  async function voteProblemOption(option: { key: string; title: string }, currentLiked = false, existingVote?: VDiscussionContribution | null) {
    const localKey = `problem-${option.key}`;
    const isLiked = currentLiked || likedContributionIds.has(localKey);
    const nextSelected = !isLiked;
    const voteActorKey = `${currentParticipant?.id || profile?.id || 'unknown'}:${option.key}`;
    desiredProblemVoteRef.current.set(voteActorKey, nextSelected);
    setLikedContributionIds((current) => {
      const next = new Set(current);
      if (isLiked) next.delete(localKey);
      else next.add(localKey);
      return next;
    });
    try {
      const targetStep = stepByNumber.get(1);
      const optimisticAt = new Date().toISOString();
      const optimisticContribution: VDiscussionContribution | null = targetStep?.id ? {
        id: existingVote?.id || `optimistic-problem-vote-${currentParticipant?.id || profile?.id || 'anon'}-${option.key}`,
        stepId: targetStep.id,
        profileId: profile?.id || null,
        participantId: currentParticipant?.id || null,
        authorName: currentParticipant?.fullName || profile?.fullName || profile?.email || null,
        type: 'problem_vote',
        content: JSON.stringify({
          problemKey: option.key,
          selectedProblemTitle: option.title,
          selected: nextSelected,
          votedAt: new Date().toISOString(),
        }),
        metadata: {},
        parentId: null,
        upvotesCount: 0,
        downvotesCount: 0,
        createdAt: existingVote?.createdAt || optimisticAt,
        updatedAt: optimisticAt,
      } : null;
      if (optimisticContribution) {
        mergeContributionIntoCache(optimisticContribution);
        publishSessionBroadcast('contribution', { contribution: optimisticContribution });
      }
      const payload = {
        problemKey: option.key,
        selectedProblemTitle: option.title,
        selected: nextSelected,
        votedAt: new Date().toISOString(),
      };
      await saveStepContribution(1, 'problem_vote', payload);
      await queryClient.invalidateQueries({ queryKey: queries.sessionContributions(sessionId) });
      setErrorMessage('');
    } catch (error) {
      desiredProblemVoteRef.current.delete(voteActorKey);
      setLikedContributionIds((current) => {
        const next = new Set(current);
        if (isLiked) next.add(localKey);
        else next.delete(localKey);
        return next;
      });
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function saveSummaryAndGo(step: number, summaryData: Record<string, unknown>, nextStep: number) {
    if (isFinalLocked) {
      showFinalLockedNotice();
      return;
    }
    const targetStep = stepByNumber.get(step);
    if (!targetStep?.id) return;
    await submitActionGuardRef.current.run(`summary-go:${targetStep.id}:${nextStep}`, async () => {
      setPendingSessionStep({ step: nextStep, requestedAt: Date.now() });
      mergeStepSummaryIntoCache(targetStep.id, summaryData, 'completed');
      mergeSessionStepIntoCache(nextStep, 'active');
      publishSessionBroadcast('step-summary', { stepId: targetStep.id, summaryData, status: 'completed' });
      publishSessionBroadcast('session-step', { step: nextStep, status: 'active' });
      navigate(`/vdiscussion/session/${sessionId}/step/${nextStep}`);
      void Promise.all([
        summaryMutation.mutateAsync({ stepId: targetStep.id, summaryData, status: 'completed' }),
        sessionStepMutation.mutateAsync({ step: nextStep, status: 'active' }),
      ]).catch((error) => {
        setPendingSessionStep(null);
        setErrorMessage(getErrorMessage(error));
        void invalidateSessionData();
      });
    });
  }

  async function saveStepSummary(step: number, summaryData: Record<string, unknown>) {
    if (isFinalLocked) {
      showFinalLockedNotice();
      return;
    }
    const targetStep = stepByNumber.get(step);
    if (!targetStep?.id) return;
    await submitActionGuardRef.current.run(`summary:${targetStep.id}`, async () => {
      mergeStepSummaryIntoCache(targetStep.id, summaryData, targetStep.status);
      mergeSessionStepIntoCache(session?.currentStep || step, session?.status === 'not_started' ? 'active' : session?.status);
      publishSessionBroadcast('step-summary', { stepId: targetStep.id, summaryData, status: targetStep.status });
      await summaryMutation.mutateAsync({ stepId: targetStep.id, summaryData, status: targetStep.status });
    });
  }

  async function finalizeLeaderVote(reason: 'all-confirmed' | 'timeout' | 'manual') {
    if (leaderParticipant || latestLeaderVoteResult || !members.length || leaderMutation.isPending) return;
    const effectiveVoteCounts = reason === 'timeout' ? leaderVoteCounts : confirmedLeaderVoteCounts;
    const effectiveVoteTotal = reason === 'timeout' ? leaderVotes.size : confirmedLeaderVotes.length;

    const ranked = members
      .map((member, index) => ({
        member,
        index,
        votes: effectiveVoteCounts.get(member.id) || 0,
      }))
      .sort((a, b) => {
        if (b.votes !== a.votes) return b.votes - a.votes;
        return a.index - b.index;
      });

    const topVotes = ranked[0]?.votes || 0;
    const topCandidates = topVotes > 0
      ? ranked.filter((entry) => entry.votes === topVotes)
      : ranked;
    let winner = topCandidates[0]?.member || null;
    const didUseTieBreak = topCandidates.length > 1;

    if (didUseTieBreak) {
      setTieBreakState({ active: true, candidateIds: topCandidates.map((entry) => entry.member.id) });
      await new Promise((resolve) => window.setTimeout(resolve, LEADER_TIE_BREAK_DELAY_MS));
      const seed = `${sessionId || session?.id || ''}:${topCandidates.map((entry) => entry.member.id).sort().join('|')}:${topVotes}`;
      winner = topCandidates[stableTieBreakIndex(seed, topCandidates.length)]?.member || winner;
    }

    if (!winner) {
      setTieBreakState({ active: false, candidateIds: [] });
      return;
    }

    await runAction(async () => {
      const freshSession = sessionId ? await vdiscussionApi.getSession(sessionId) : null;
      if (freshSession?.group?.leaderParticipantId) return;
      await leaderMutation.mutateAsync(winner.id);
      mergeSessionStepIntoCache(1, 'active');
      await saveStepContribution(1, 'leader_vote_result', {
        targetParticipantId: winner.id,
        targetName: winner.fullName,
        voteCounts: Object.fromEntries(effectiveVoteCounts),
        totalVotes: effectiveVoteTotal,
        finalizedBy: reason,
        didUseTieBreak,
        tieBreakCandidateIds: didUseTieBreak ? topCandidates.map((entry) => entry.member.id) : [],
        finalizedAt: new Date().toISOString(),
      });
    });
    setTieBreakState({ active: false, candidateIds: [] });
  }

  function renderSessionOverview() {
    const currentSessionDisplayStep = toVDiscussionDisplayStepNumber(session?.currentStep || 1) || 1;
    const targetRouteStep = canReviewAllSteps || canAccessDiscussionSteps ? session?.currentStep || 1 : 1;
    const joinedParticipantSet = new Set(joinedParticipantIds);
    if (currentParticipant?.id && (hasRecordedSessionJoin || saveContributionMutation.isPending)) {
      joinedParticipantSet.add(currentParticipant.id);
    }
    const joinedCount = joinedParticipantSet.size;
    const subProblemCount = session?.topic?.subProblems?.length || 0;
    const continueLabel = canReviewAllSteps ? 'Xem bài' : canAccessDiscussionSteps ? `Tiếp tục B${currentSessionDisplayStep}` : 'Bắt đầu';

    return (
      <div className="vdiscussion-page vdiscussion-session-overview">
        <div className="vdiscussion-overview-head">
          <div>
            <span className="vdiscussion-status is-green">{session?.status === 'completed' ? 'Hoàn thành' : 'Đang mở'}</span>
            <h1><MessageCircle size={30} /> {session?.topic?.title || 'Chủ đề thảo luận'} - {displayGroupName(session?.group?.name)}</h1>
            <p>Xem nhanh chủ đề, lộ trình 5 bước và mức độ tham gia của từng thành viên trước khi vào thảo luận.</p>
          </div>
          <Link className="btn btn-primary vdiscussion-overview-continue" to={`/vdiscussion/session/${sessionId}/step/${targetRouteStep}`}>
            {continueLabel} <ArrowRight size={18} />
          </Link>
        </div>

        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

        {groupScore != null ? (
          <section className="vdiscussion-overview-score-strip" aria-label="Điểm sau khi chấm">
            <div>
              <span>Điểm nhóm</span>
              <strong>{formatScoreNumber(groupScore)}</strong>
              <em>/10</em>
            </div>
            {hasPersonalBonus ? (
              <div className="is-bonus">
                <span>Điểm thưởng cá nhân</span>
                <strong>+{formatScoreNumber(personalBonusPoints)}</strong>
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="vdiscussion-overview-layout">
          <main className="vdiscussion-overview-main">
            <section className="vdiscussion-overview-panel">
              <div className="vdiscussion-overview-panel-head">
                <h2>Lộ trình & các bước thảo luận</h2>
                <span>5 bước</span>
              </div>
              <div className="vdiscussion-overview-steps">
                {VDISCUSSION_DISPLAY_STEPS.map(({ displayStep }) => {
                  const meta = getSessionStepCopy(displayStep);
                  const isDone = isFinalLocked || displayStep < currentSessionDisplayStep;
                  const isCurrent = !isDone && displayStep === currentSessionDisplayStep;
                  return (
                    <div className={isDone ? 'vdiscussion-overview-step is-done' : isCurrent ? 'vdiscussion-overview-step is-current' : 'vdiscussion-overview-step'} key={displayStep}>
                      <strong>{isDone ? <Check size={18} /> : displayStep}</strong>
                      <h3>{meta.title}</h3>
                      <p>{isDone ? 'Đã hoàn thành' : isCurrent ? 'Đang thực hiện' : 'Chưa mở'}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="vdiscussion-overview-topic">
              <div className="vdiscussion-overview-panel-head">
                <h2><Target size={17} /> Chủ đề & mục tiêu phiên thảo luận</h2>
              </div>
              <article>
                <span><Target size={28} /></span>
                <div>
                  <h3>{session?.topic?.title || 'Chủ đề thảo luận'}</h3>
                  {renderDiscussionDescription(session?.topic?.description)}
                  <div className="vdiscussion-overview-chips">
                    <em>{displayGroupName(session?.group?.name)}</em>
                    {subProblemCount > 0 ? <em>{subProblemCount} vấn đề phụ</em> : null}
                    <em>{joinedCount}/{members.length} đã tham gia</em>
                  </div>
                </div>
              </article>
            </section>
          </main>

          <aside className="vdiscussion-overview-panel vdiscussion-overview-members">
            <div className="vdiscussion-overview-panel-head">
              <h2>Danh sách thành viên & tình trạng tham gia</h2>
              <span>{members.length}</span>
            </div>
            <div className="vdiscussion-overview-room-status">
              <span><Users size={18} /> Tình trạng vào phòng</span>
              <strong>{joinedCount}/{members.length}</strong>
            </div>
            <div className="vdiscussion-overview-member-list">
              {members.map((member) => {
                const hasJoined = joinedParticipantSet.has(member.id);
                const isMemberLeader = usesLeaderVote && member.id === session?.group?.leaderParticipantId;
                return (
                  <div className="vdiscussion-overview-member" key={member.id}>
                    <div>
                      <strong>{member.fullName}</strong>
                      <small>{isMemberLeader ? 'Nhóm trưởng' : member.studentCode || member.email || 'Thành viên'}</small>
                    </div>
                    {isMemberLeader ? <Crown size={16} /> : <span className="vdiscussion-member-leader-spacer" aria-hidden="true" />}
                    <em className={hasJoined ? 'is-joined' : ''}>{hasJoined ? 'Đã tham gia' : 'Chưa vào'}</em>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  function renderLeaderVoteGate() {
    if (leaderParticipant) {
      return (
        <div className="vdiscussion-page vdiscussion-leader-gate">
          <section className="vdiscussion-vote-result">
            <Crown size={46} />
            <span>Kết quả bình chọn nhóm trưởng</span>
            <h1>Chúc mừng thành viên {leaderParticipant.fullName} đã trở thành nhóm trưởng điều phối nhóm</h1>
            <p>Tất cả thành viên sẽ tiếp tục ở màn hình này cho đến khi bấm bắt đầu làm bài.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={acknowledgeLeaderResult}
            >
              Bắt đầu làm bài <ArrowRight size={17} />
            </button>
          </section>
        </div>
      );
    }

    const sortedMembers = [...members].sort((a, b) => {
      const diff = (leaderVoteCounts.get(b.id) || 0) - (leaderVoteCounts.get(a.id) || 0);
      return diff || a.fullName.localeCompare(b.fullName);
    });
    const voteProgress = members.length ? Math.min(100, Math.round((confirmedLeaderVotes.length / members.length) * 100)) : 0;
    const canSelectLeaderVote = Boolean(currentParticipant) && isLeaderVoteClockReady && !myLeaderVoteConfirmed && !leaderVoteActionPending && !hasLeaderVoteExpired && !tieBreakState.active;
    const canConfirmLeaderVote = Boolean(myLeaderVoteTargetId) && canSelectLeaderVote;
    const renderConfirmVoteButton = (className = '') => (
      <button
        type="button"
        className={`${canConfirmLeaderVote ? 'btn btn-primary' : 'btn btn-primary vdiscussion-vote-confirm-locked'}${className ? ` ${className}` : ''}`}
        disabled={!canConfirmLeaderVote}
        onClick={() => void runAction(() => saveLeaderVote({
          targetParticipantId: myLeaderVoteTargetId,
          targetName: members.find((member) => member.id === myLeaderVoteTargetId)?.fullName || '',
          votedAt: new Date().toISOString(),
          confirmedAt: new Date().toISOString(),
        }, 'confirm'))}
      >
        {myLeaderVoteConfirmed ? 'Đang chờ kết quả' : leaderVoteActionPending === 'confirm' ? 'Đang chốt...' : 'Chốt phiếu'}
      </button>
    );

    return (
      <div className="vdiscussion-page vdiscussion-leader-gate">
        <div className="vdiscussion-vote-hero">
          <div>
            <span>VDiscussion</span>
            <h1>Bầu nhóm trưởng trước khi thảo luận</h1>
            <p>{session?.topic?.title || 'Chủ đề thảo luận'} · {displayGroupName(session?.group?.name)}</p>
          </div>
          <div className="vdiscussion-vote-timer">
            <strong>{isLeaderVoteClockReady ? formatCountdown(leaderVoteRemainingMs) : '--:--'}</strong>
            <span>thời gian còn lại</span>
            <div className="vdiscussion-vote-mobile-action">
              {renderConfirmVoteButton('btn-small')}
            </div>
          </div>
        </div>

        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

        {tieBreakState.active ? (
          <section className="vdiscussion-vote-loading">
            <Sparkles size={34} />
            <h2>Đang xử lý hòa phiếu</h2>
            <p>Hệ thống đang lựa chọn ngẫu nhiên giữa các ứng viên bằng điểm.</p>
            <div>
              {tieBreakState.candidateIds.map((id) => {
                const member = members.find((item) => item.id === id);
                return member ? <span key={id}>{member.fullName}</span> : null;
              })}
            </div>
          </section>
        ) : (
          <div className="vdiscussion-vote-grid">
            <section className="vdiscussion-panel">
              <div className="vdiscussion-panel-head">
                <h2>Ứng viên nhóm trưởng</h2>
                <span>{confirmedLeaderVotes.length}/{members.length} đã chốt</span>
              </div>
              <div className="vdiscussion-vote-progress">
                <span style={{ width: `${voteProgress}%` }} />
              </div>
              <div className="vdiscussion-option-list">
                {sortedMembers.map((member) => {
                  const voteCount = leaderVoteCounts.get(member.id) || 0;
                  const selected = myLeaderVoteTargetId === member.id;
                  const ratio = leaderVotes.size ? Math.round((voteCount / leaderVotes.size) * 100) : 0;
                  return (
                    <button
                      type="button"
                      className={selected ? 'vdiscussion-leader-candidate is-selected' : 'vdiscussion-leader-candidate'}
                      key={member.id}
                      disabled={!canSelectLeaderVote}
                      onClick={() => void runAction(() => saveLeaderVote({
                        targetParticipantId: member.id,
                        targetName: member.fullName,
                        votedAt: new Date().toISOString(),
                        confirmedAt: null,
                      }, 'select'))}
                    >
                      <span className="vdiscussion-avatar">{member.fullName.slice(0, 1).toUpperCase()}</span>
                      <span>
                        <strong>{member.fullName}</strong>
                        <em>{member.studentCode || member.email || 'Thành viên nhóm'}</em>
                      </span>
                      {selected || voteCount > 0 ? <small>{voteCount} phiếu · {ratio}%</small> : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <aside className="vdiscussion-panel">
              <div className="vdiscussion-panel-head">
                <h2>Trạng thái vote</h2>
                <span>90 giây</span>
              </div>
              <div className="vdiscussion-vote-status">
                <Crown size={22} />
                {myLeaderVoteConfirmed ? (
                  <p>Bạn đã chốt phiếu cho <strong>{members.find((member) => member.id === myLeaderVoteTargetId)?.fullName || 'ứng viên đã chọn'}</strong>. Vui lòng chờ kết quả chung cuộc.</p>
                ) : myLeaderVoteTargetId ? (
                  <p>Bạn đang chọn <strong>{members.find((member) => member.id === myLeaderVoteTargetId)?.fullName || 'ứng viên đã chọn'}</strong>. Bạn có thể đổi lựa chọn nhiều lần trước khi nhấn chốt.</p>
                ) : (
                  <p>Chọn một ứng viên để ghi nhận phiếu. Phiên vote chỉ kết thúc khi tất cả thành viên đã chốt hoặc hết 90 giây.</p>
                )}
                {renderConfirmVoteButton('vdiscussion-vote-desktop-action')}
              </div>
            </aside>
          </div>
        )}
      </div>
    );
  }

  function renderShell(content: React.ReactNode) {
    const coachingStepIndex = activeCoachingStep
      ? Math.max(0, COACHING_3B_RUNTIME_STEPS.findIndex((step) => step.routeStep === activeCoachingStep.routeStep))
      : -1;
    const currentMeta = activeCoachingStep
      ? {
        title: activeCoachingStep.title,
        short: activeCoachingStep.short,
        desc: activeCoachingStep.desc,
        heroTitle: activeCoachingStep.title,
      }
      : isCoaching3bDiscussion && activeStepNumber > 5
        ? {
          title: 'Tổng hợp kết quả',
          short: 'Tổng hợp',
          desc: 'Nối vấn đề, chẩn đoán, kế hoạch 4 tuần và kế hoạch 6 tháng thành bài trình bày của nhóm.',
          heroTitle: 'Tổng hợp kết quả',
        }
      : getSessionStepCopy(activeDisplayStepNumber);
    const currentSessionDisplayStep = toVDiscussionDisplayStepNumber(session?.currentStep || 1);
    const currentSessionRouteStep = Number(session?.currentStep || 1);
    const isStepUnlocked = isCoaching3bDiscussion ? true : canReviewAllSteps || activeDisplayStepNumber <= currentSessionDisplayStep;
    const isBehindGroupStep = isCoaching3bDiscussion ? activeStepNumber < currentSessionRouteStep : activeDisplayStepNumber < currentSessionDisplayStep;
    const previousDisplayStep = isCoaching3bDiscussion
      ? COACHING_3B_RUNTIME_STEPS[coachingStepIndex - 1]
      : VDISCUSSION_DISPLAY_STEPS.find((step) => step.displayStep === activeDisplayStepNumber - 1);
    const nextDisplayStep = isCoaching3bDiscussion
      ? COACHING_3B_RUNTIME_STEPS[coachingStepIndex + 1]
      : VDISCUSSION_DISPLAY_STEPS.find((step) => step.displayStep === activeDisplayStepNumber + 1);
    let canStudentGoNext = Boolean(canReviewAllSteps);
    let nextSuffix = '';
    if (nextDisplayStep) {
      if (isCoaching3bDiscussion) {
        const nextCoachingStep = nextDisplayStep as (typeof COACHING_3B_RUNTIME_STEPS)[number];
        canStudentGoNext = Boolean(canReviewAllSteps || nextCoachingStep.routeStep <= currentSessionRouteStep);
        nextSuffix = canReviewAllSteps || nextCoachingStep.routeStep < currentSessionRouteStep ? '?review=1' : '';
      } else {
        const nextStandardStep = nextDisplayStep as (typeof VDISCUSSION_DISPLAY_STEPS)[number];
        canStudentGoNext = Boolean(canReviewAllSteps || nextStandardStep.displayStep <= currentSessionDisplayStep);
        nextSuffix = canReviewAllSteps || nextStandardStep.displayStep < currentSessionDisplayStep ? '?review=1' : '';
      }
    }
    const coachingProgress = activeCoachingStep ? Math.min(100, Math.max(4, Math.round((coachingStepIndex / COACHING_3B_RUNTIME_STEPS.length) * 100))) : isCoaching3bDiscussion ? 100 : 4;
    const coachingHeroEyebrow = activeCoachingStep
      ? activeCoachingStep.routeStep === 1 ? 'BƯỚC MỞ ĐẦU' : `BƯỚC ${Math.max(1, activeCoachingStep.routeStep - 1)}/4`
      : 'BÀI TRÌNH BÀY · TỔNG HỢP';
    return (
      <div className={[
        'vdiscussion-page vdiscussion-session-page',
        activeDisplayStepNumber === 4 ? 'is-plan-step' : '',
        isCoaching3bDiscussion ? 'is-coaching-3b' : '',
      ].filter(Boolean).join(' ')}>
        {lockToastVisible ? (
          <div className="vdiscussion-lock-toast" role="status">
            Bài đã Hoàn thành, không thể chỉnh sửa.
          </div>
        ) : null}
        {isCoaching3bDiscussion ? (
          <div className="vdiscussion-detail-head">
            <span className="vdiscussion-detail-spacer" aria-hidden="true" />
            <div className="vdiscussion-coaching-brand">
              <h1>V-DISCUSSION</h1>
              <p>THẢO LUẬN NHÓM · EVNSPC</p>
            </div>
            <div className="vdiscussion-coaching-head-actions">
              <div className="vdiscussion-coaching-group-pill">
                <span>Nhóm</span>
                <strong>{displayGroupName(session?.group?.name)}</strong>
              </div>
              <div className="vdiscussion-coaching-progress">
                <span>Hoàn thành</span>
                <strong>{coachingProgress}%</strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="vdiscussion-detail-head">
            <span className="vdiscussion-detail-spacer" aria-hidden="true" />
            <div>
              <h1>{session?.topic?.title || 'Phiên thảo luận'}</h1>
              <p>{displayGroupName(session?.group?.name)} · {currentMeta.title}</p>
            </div>
            <div className="vdiscussion-session-leader">
              <Users size={16} />
              <span>{displayGroupName(session?.group?.name)}</span>
            </div>
          </div>
        )}

        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
        {isFinalLocked ? <div className="notice warning">Bài đã Hoàn thành, không thể chỉnh sửa.</div> : null}

        {isCoaching3bDiscussion ? (
          <div className="vdiscussion-coaching-progressbar">
            <div className="vdiscussion-stepper" aria-label="Ti?n ?? th?o lu?n">
              {COACHING_3B_RUNTIME_STEPS.map((step) => {
                const isMarkerDone = isFinalLocked || session?.status === 'completed' || step.routeStep < activeStepNumber;
                const markerClassName = step.routeStep === activeStepNumber && !isMarkerDone ? 'vdiscussion-step-marker is-active' : isMarkerDone ? 'vdiscussion-step-marker is-done' : 'vdiscussion-step-marker';
                return (
                  <div
                    aria-current={step.routeStep === activeStepNumber ? 'step' : undefined}
                    className={markerClassName}
                    key={step.routeStep}
                    title={step.title}
                  >
                    <strong>{isMarkerDone ? <Check size={15} /> : step.routeStep === 1 ? '0' : step.routeStep - 1}</strong>
                    <span>{step.short}</span>
                    <small>{step.desc}</small>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="vdiscussion-stepper" aria-label="Tiến độ thảo luận">
            {VDISCUSSION_DISPLAY_STEPS.map(({ displayStep }) => {
              const meta = getSessionStepCopy(displayStep);
              const isMarkerDone = isFinalLocked || session?.status === 'completed' || displayStep < currentSessionDisplayStep;
              const markerClassName = displayStep === activeDisplayStepNumber && !isMarkerDone ? 'vdiscussion-step-marker is-active' : isMarkerDone ? 'vdiscussion-step-marker is-done' : 'vdiscussion-step-marker';
              return (
                <div
                  aria-current={displayStep === activeDisplayStepNumber ? 'step' : undefined}
                  className={markerClassName}
                  key={displayStep}
                  title={isMarkerDone || displayStep <= currentSessionDisplayStep ? `Đã mở khóa bước ${displayStep}` : `Nhóm trưởng chưa mở khóa bước ${displayStep}`}
                >
                  <strong>{displayStep}</strong>
                  <span>{meta.short}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="vdiscussion-session-grid is-full">
          <main className="vdiscussion-flow">
            <section className="vdiscussion-step-hero">
              <div>
                <span>{isCoaching3bDiscussion ? coachingHeroEyebrow : `Bước ${activeDisplayStepNumber}/5`}</span>
                <h2>{currentMeta.heroTitle || currentMeta.title}</h2>
                <p>{currentMeta.desc}</p>
              </div>
              <div className="vdiscussion-step-tools">
                {renderMembersBadge()}
              </div>
            </section>
            {content}
            {!canLead ? (
              <div className="vdiscussion-student-nav vdiscussion-student-nav-active">
                {isBehindGroupStep && !isReviewMode && !canReviewAllSteps ? (
                  <span>{`Nhóm đã chuyển sang bước ${currentSessionDisplayStep}.`}</span>
                ) : null}
                <div className="vdiscussion-step-actions">
                  {previousDisplayStep ? (
                    <Link className="btn btn-ghost" to={`/vdiscussion/session/${sessionId}/step/${previousDisplayStep.routeStep}?review=1`}>
                      <ArrowLeft size={15} /> Xem lại
                    </Link>
                  ) : null}
                  {nextDisplayStep ? (
                    canStudentGoNext ? (
                      <Link className="btn btn-primary" to={`/vdiscussion/session/${sessionId}/step/${nextDisplayStep.routeStep}${nextSuffix}`}>
                        Tiếp theo <ArrowRight size={15} />
                      </Link>
                    ) : (
                      <button type="button" className="btn btn-primary vdiscussion-vote-confirm-locked" onClick={showStudentNextStepLockedNotice}>
                        Tiếp theo <ArrowRight size={15} />
                      </button>
                    )
                  ) : null}
                </div>
              </div>
            ) : null}
            {!isStepUnlocked ? (
              <div className="vdiscussion-student-nav">
                <span>Buoc nay chua duoc nhom truong mo khoa.</span>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    );
  }

  function renderReviewPreviousButton() {
    if (isCoaching3bDiscussion) {
      const coachingStepIndex = COACHING_3B_RUNTIME_STEPS.findIndex((step) => step.routeStep === activeStepNumber);
      const lastRuntimeStep = COACHING_3B_RUNTIME_STEPS[COACHING_3B_RUNTIME_STEPS.length - 1];
      const previousStep = coachingStepIndex >= 0
        ? COACHING_3B_RUNTIME_STEPS[coachingStepIndex - 1]
        : activeStepNumber > lastRuntimeStep.routeStep
          ? lastRuntimeStep
          : null;
      if (!previousStep) return null;
      return (
        <Link className="btn btn-ghost" to={`/vdiscussion/session/${sessionId}/step/${previousStep.routeStep}?review=1`}>
          <ArrowLeft size={15} /> Xem lại
        </Link>
      );
    }

    const previousDisplayStep = VDISCUSSION_DISPLAY_STEPS.find((step) => step.displayStep === activeDisplayStepNumber - 1);
    if (activeDisplayStepNumber <= 1 || !previousDisplayStep) return null;
    return (
      <Link className="btn btn-ghost" to={`/vdiscussion/session/${sessionId}/step/${previousDisplayStep.routeStep}?review=1`}>
        <ArrowLeft size={15} /> Xem lại
      </Link>
    );
  }

  function renderReviewNextButton() {
    if (isCoaching3bDiscussion) {
      const coachingStepIndex = COACHING_3B_RUNTIME_STEPS.findIndex((step) => step.routeStep === activeStepNumber);
      const nextStep = COACHING_3B_RUNTIME_STEPS[coachingStepIndex + 1];
      const currentSessionRouteStep = Number(session?.currentStep || 1);
      if (!nextStep) return null;
      if (nextStep.routeStep > currentSessionRouteStep) return null;
      const suffix = nextStep.routeStep < currentSessionRouteStep ? '?review=1' : '';
      return (
        <Link className="btn btn-primary" to={`/vdiscussion/session/${sessionId}/step/${nextStep.routeStep}${suffix}`}>
          Tiếp theo
        </Link>
      );
    }

    const nextDisplayStep = VDISCUSSION_DISPLAY_STEPS.find((step) => step.displayStep === activeDisplayStepNumber + 1);
    const currentSessionDisplayStep = toVDiscussionDisplayStepNumber(session?.currentStep || 1);
    if (!nextDisplayStep) return null;
    if (nextDisplayStep.displayStep > currentSessionDisplayStep) return null;
    const suffix = nextDisplayStep.displayStep < currentSessionDisplayStep ? '?review=1' : '';
    return (
      <Link className="btn btn-primary" to={`/vdiscussion/session/${sessionId}/step/${nextDisplayStep.routeStep}${suffix}`}>
        Tiếp theo
      </Link>
    );
  }

  function renderStarRating(score: number, count: number) {
    const width = `${Math.max(0, Math.min(100, (score / 5) * 100))}%`;
    return (
      <span className="vdiscussion-star-rating">
        <strong>{formatRatingNumber(score)}</strong>
        <span className="vdiscussion-star-meter" aria-label={`${formatRatingNumber(score)} trên 5 sao`}>
          <span>★★★★★</span>
          <span style={{ width }}>★★★★★</span>
        </span>
        <em>{count} đánh giá</em>
      </span>
    );
  }

  function renderMembersBadge() {
    return (
      <div className="vdiscussion-member-badge" tabIndex={0} aria-label={`${members.length} thành viên tham gia`}>
        <Users size={16} />
        <strong>{members.length}</strong>
        <div className="vdiscussion-member-popover">
          <div className="vdiscussion-member-popover-head">
            <span>Thành viên tham gia</span>
            <strong>{members.length}</strong>
          </div>
          {members.map((member, index) => (
            <div className="vdiscussion-member-row" key={member.id}>
              <div className="vdiscussion-avatar">{member.fullName.slice(0, 1).toUpperCase() || index + 1}</div>
              <div>
                <strong>{member.fullName}</strong>
                <span>{usesLeaderVote && member.id === session?.group?.leaderParticipantId ? 'Nhóm trưởng' : member.studentCode || member.email || 'Thành viên'}</span>
              </div>
              {usesLeaderVote && member.id === session?.group?.leaderParticipantId ? <Crown size={15} /> : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  async function continueFromCoachingIntro() {
    await submitActionGuardRef.current.run(`coaching-intro:${sessionId}`, async () => {
      setPendingSessionStep({ step: 2, requestedAt: Date.now() });
      mergeSessionStepIntoCache(2, 'active');
      publishSessionBroadcast('session-step', { step: 2, status: 'active' });
      navigate(`/vdiscussion/session/${sessionId}/step/2`);
      void sessionStepMutation.mutateAsync({ step: 2, status: 'active' }).catch((error) => {
        setPendingSessionStep(null);
        setErrorMessage(getErrorMessage(error));
        void invalidateSessionData();
      });
    });
  }

  function renderCoachingIntro() {
    return renderShell(
      <section className="vdiscussion-panel vdiscussion-coaching-intro-panel">
        <p className="vdiscussion-coaching-intro-lead">
          <strong>{displayGroupName(session?.group?.name)}</strong> có một nhiệm vụ: chọn một chân dung nhân viên, rồi cùng xây <strong>hai tầng</strong> kế hoạch - kèm cặp 4 tuần và phát triển 6 tháng - <strong>dùng được thật</strong>, không viết cho có.
        </p>
        <div className="vdiscussion-coaching-intro-grid">
          <div>
            <h3>Nhóm nói với nhóm</h3>
            <ul>
              <li><strong>Đặt vấn đề:</strong> chọn 1 nhân viên, xây kế hoạch kèm cặp + phát triển dùng được ngay.</li>
              <li><strong>Kết quả trông ra sao:</strong> cuối buổi màn hình hiện đủ 2 tầng nối liền nhau.</li>
              <li><strong>Trình bày:</strong> cử 1 người trình bày 3 phút, chọn điểm tâm đắc nhất.</li>
              <li><strong>Cách làm việc:</strong> thống nhất nhanh nội dung trọng tâm, một người nhập lên VDiscussion và cả nhóm cùng rà lại trước khi chuyển bước.</li>
            </ul>
          </div>
          <div>
            <h3>Phân vai, chốt ngay</h3>
            <dl>
              <div><dt>Điều phối</dt><dd>giữ thời gian, đặt câu hỏi, chốt ý kiến, phân công</dd></div>
              <div><dt>Thư ký</dt><dd>nhập nội dung vào VDiscussion theo thống nhất nhóm</dd></div>
              <div><dt>Mỗi thành viên</dt><dd>đóng góp tối thiểu 1 đặc điểm, 1 chẩn đoán, 1 đề xuất mỗi bước</dd></div>
            </dl>
          </div>
        </div>
        <div className="vdiscussion-coaching-callout">
          Nguyên tắc xuyên suốt: <strong>một dòng thật sự làm được còn hơn cả trang viết chung chung.</strong> Nhấn "Bước tiếp theo" khi nhóm đã sẵn sàng.
        </div>
        <div className="vdiscussion-coaching-intro-actions">
          <button type="button" className="btn btn-primary" onClick={() => void runAction(continueFromCoachingIntro)}>
            Bước tiếp theo <ArrowRight size={17} />
          </button>
        </div>
      </section>,
    );
  }

  function renderStep1() {
    const problemStepNumber = isCoaching3bDiscussion ? 2 : 1;
    const problemStep = stepByNumber.get(problemStepNumber);
    const items = contributionsByStep.get(problemStepNumber) || [];
    const problemOptions = [
      ...(session?.topic?.subProblems || []).map((item, index) => ({
        key: `topic-${index}`,
        title: item.title,
        description: item.description || '',
        source: 'topic',
      })),
      ...items.filter((item) => item.type === 'problem_option' && !item.parentId).map((item) => {
        const parsed = parseContributionContent(item);
        return { key: item.id, title: parsed.title, description: parsed.description, source: getContributionAuthorName(item) };
      }),
    ];
    const problemOptionCreatedAt = new Map(
      items
        .filter((item) => item.type === 'problem_option' && !item.parentId)
        .map((item) => [item.id, new Date(item.updatedAt || item.createdAt || 0).getTime()]),
    );
    problemOptions.sort((a, b) => {
      const aTime = problemOptionCreatedAt.get(a.key) || 0;
      const bTime = problemOptionCreatedAt.get(b.key) || 0;
      if (aTime || bTime) return bTime - aTime;
      return 0;
    });
    const problemVotes = newestFirst(items.filter((item) => item.type === 'problem_vote')).reduce((map, vote) => {
      const key = String(vote.metadata.problemKey || parseJson<Record<string, unknown>>(vote.content, {}).problemKey || '');
      if (!key) return map;
      const voteKey = `${actorKey(vote)}:${key}`;
      if (!map.has(voteKey)) map.set(voteKey, vote);
      return map;
    }, new Map<string, VDiscussionContribution>());
    const voteCounts = new Map<string, number>();
    problemVotes.forEach((vote) => {
      const payload = parseJson<Record<string, unknown>>(vote.content, {});
      if (payload.selected === false || vote.metadata.selected === false) return;
      const key = String(vote.metadata.problemKey || payload.problemKey || '');
      if (key) voteCounts.set(key, (voteCounts.get(key) || 0) + 1);
    });
    const likedProblemOptionKeys = new Set<string>();
    const myProblemVoteByKey = new Map<string, VDiscussionContribution>();
    problemVotes.forEach((vote) => {
      if (actorKey(vote) !== (currentParticipant?.id || profile?.id || 'unknown')) return;
      const payload = parseJson<Record<string, unknown>>(vote.content, {});
      const key = String(vote.metadata.problemKey || payload.problemKey || '');
      if (key) myProblemVoteByKey.set(key, vote);
      if (payload.selected === false || vote.metadata.selected === false) return;
      if (key) likedProblemOptionKeys.add(key);
    });
    const selectedProblemKey = String(problemStep?.summaryData?.selectedProblemKey || '');
    const selectedProblemTitle = String(problemStep?.summaryData?.selectedProblemTitle || '');
    const selectedProblemDescription = getSelectedProblemDescription(session?.topic, problemStep?.summaryData);
    const draftProblemSelectionMode = String(problemStep?.summaryData?.draftProblemSelectionMode || '');
    const draftProblemKey = String(problemStep?.summaryData?.draftProblemKey || '');
    const draftProblemTitle = String(problemStep?.summaryData?.draftProblemTitle || '');
    const draftProblemDescription = String(problemStep?.summaryData?.draftProblemDescription || '');
    const hasProblemSelectionDraft = Boolean(draftProblemSelectionMode);
    const activeProblemKey = hasProblemSelectionDraft ? draftProblemKey : selectedProblemKey;
    const activeProblemTitle = hasProblemSelectionDraft ? draftProblemTitle : selectedProblemTitle;
    const activeProblemDescription = hasProblemSelectionDraft ? draftProblemDescription : selectedProblemDescription;
    const hasCommittedProblemSelection = Boolean(selectedProblemTitle) && !hasProblemSelectionDraft;
    const groupCommitRequiredMessage = isCoaching3bDiscussion
      ? 'Nhóm cần chốt đáp án để chuyển bước'
      : 'Nhóm trưởng cần chốt đáp án để chuyển bước';

    async function submitProblem(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      const title = drafts.problemTitle?.trim() || '';
      if (!title) return;
      setDraft('problemTitle', '');
      try {
        await saveContributionOptimistic(problemStepNumber, 'problem_option', {
          title,
          description: '',
        });
      } catch {
        setDraft('problemTitle', title);
      }
    }

    async function toggleProblemSelection(option: { key: string; title: string; description: string }) {
      const isSelected = activeProblemKey === option.key || activeProblemTitle === option.title;
      await saveStepSummary(problemStepNumber, {
        ...problemStep?.summaryData,
        draftProblemSelectionMode: isSelected ? 'none' : 'selected',
        draftProblemKey: isSelected ? '' : option.key,
        draftProblemTitle: isSelected ? '' : option.title,
        draftProblemDescription: isSelected ? '' : option.description,
        voteCounts: Object.fromEntries(voteCounts),
      });
    }

    async function commitProblemSelection() {
      if (!activeProblemTitle) {
        window.alert(groupCommitRequiredMessage);
        setErrorMessage(groupCommitRequiredMessage);
        return;
      }
      await saveStepSummary(problemStepNumber, {
        ...problemStep?.summaryData,
        selectedProblemKey: activeProblemKey,
        selectedProblemTitle: activeProblemTitle,
        selectedProblemDescription: activeProblemDescription,
        draftProblemSelectionMode: '',
        draftProblemKey: '',
        draftProblemTitle: '',
        draftProblemDescription: '',
        voteCounts: Object.fromEntries(voteCounts),
      });
      setErrorMessage('');
    }

    async function continueToStep2() {
      if (!selectedProblemTitle) {
        window.alert(groupCommitRequiredMessage);
        setErrorMessage(groupCommitRequiredMessage);
        return;
      }
      await saveSummaryAndGo(problemStepNumber, {
        ...problemStep?.summaryData,
        selectedProblemKey,
        selectedProblemTitle,
        selectedProblemDescription,
        draftProblemSelectionMode: '',
        draftProblemKey: '',
        draftProblemTitle: '',
        draftProblemDescription: '',
        voteCounts: Object.fromEntries(voteCounts),
      }, isCoaching3bDiscussion ? 3 : 2);
    }

    const showProblemFreeInput = !isCoaching3bDiscussion;

    return renderShell(
      <section className="vdiscussion-panel">
          <div className="vdiscussion-panel-head">
            <span>{problemOptions.length} {isCoaching3bDiscussion ? 'lựa chọn' : 'ý kiến'}</span>
          </div>
          {showProblemFreeInput ? (
            <form className="vdiscussion-step1-input" onSubmit={submitProblem}>
              <textarea
                value={drafts.problemTitle || ''}
                onChange={(event) => setDraft('problemTitle', event.target.value)}
                placeholder="Ví dụ: Thông tin phối hợp giữa các ca trực chưa liền mạch..."
              />
              <button className="btn btn-primary btn-small" type="submit" disabled={isContributionSaving || !drafts.problemTitle?.trim()}>
                <Send size={15} /> {isContributionSaving ? 'Đang gửi...' : 'Gửi ý kiến'}
              </button>
            </form>
          ) : null}

          <div className="vdiscussion-option-list">
            {problemOptions.map((option) => (
              <div className={activeProblemTitle === option.title ? 'vdiscussion-option is-selected' : 'vdiscussion-option'} key={option.key}>
                <div>
                  <strong>{option.title}</strong>
                  <span>{option.description || option.source}</span>
                </div>
                <div className="vdiscussion-option-actions">
                  <button
                    type="button"
                    className={likedContributionIds.has(`problem-${option.key}`) || likedProblemOptionKeys.has(option.key) ? 'btn btn-ghost btn-small vdiscussion-like-button is-liked' : 'btn btn-ghost btn-small vdiscussion-like-button'}
                    onClick={() => void runAction(() => voteProblemOption(option, likedContributionIds.has(`problem-${option.key}`) || likedProblemOptionKeys.has(option.key), myProblemVoteByKey.get(option.key)))}
                  >
                    <ThumbsUp size={14} /> {voteCounts.get(option.key) || 0}
                  </button>
                  {canLead ? (
                    <button type="button" className={activeProblemTitle === option.title ? 'btn btn-primary btn-small' : 'btn btn-ghost btn-small'} onClick={() => void runAction(() => toggleProblemSelection(option))}>
                      <Check size={14} /> {activeProblemTitle === option.title ? 'Bỏ chọn' : 'Chọn'}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {!canLead && hasProblemSelectionDraft && activeProblemTitle ? (
            <div className="notice">
              {isCoaching3bDiscussion ? 'Nhóm đang chọn' : 'Nhóm trưởng đang chọn'}: <strong>{activeProblemTitle}</strong>. Đáp án chỉ được chốt khi {isCoaching3bDiscussion ? 'nhóm' : 'nhóm trưởng'} chuyển bước.
            </div>
          ) : null}
          {canLead ? (
            <div className="vdiscussion-step-continue">
              <span>{hasCommittedProblemSelection ? `Đã chốt: ${selectedProblemTitle}` : activeProblemTitle ? `Đang chọn: ${activeProblemTitle}` : 'Hãy chọn một đáp án trước khi chuyển bước.'}</span>
              {!isFinalLocked ? (
                <>
                  {!hasCommittedProblemSelection ? (
                    <button type="button" className="btn btn-ghost" onClick={() => void runAction(commitProblemSelection)} disabled={!activeProblemTitle}>
                      Chốt
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-primary" onClick={() => void runAction(continueToStep2)}>
                    {isCoaching3bDiscussion ? 'Bước tiếp theo' : 'Chuyển B2'}
                  </button>
                </>
              ) : renderReviewNextButton()}
            </div>
          ) : null}
      </section>,
    );
  }

  function renderStep2() {
    const problemStepNumber = isCoaching3bDiscussion ? 2 : 1;
    const analysisStepNumber = isCoaching3bDiscussion ? 3 : 2;
    const problemStep = stepByNumber.get(problemStepNumber);
    const legacyProblemStep = isCoaching3bDiscussion ? stepByNumber.get(1) : null;
    const analysisStep = stepByNumber.get(analysisStepNumber);
    const analyses = newestFirst((contributionsByStep.get(analysisStepNumber) || []).filter((item) => item.type === 'hypothesis' && !item.parentId));
    const comments = newestFirst((contributionsByStep.get(analysisStepNumber) || []).filter((item) => item.parentId));
    const selectedIds = asArray<string | number>(analysisStep?.summaryData?.selectedAnalysisIds).map(String);
    const selectedAnalyses = analyses.filter((analysis) => selectedIds.includes(analysis.id));
    const selectedProblemTitle = String(problemStep?.summaryData?.selectedProblemTitle || legacyProblemStep?.summaryData?.selectedProblemTitle || session?.topic?.title || 'Chưa chốt vấn đề từ bước 1');
    const selectedProblemDescription = getSelectedProblemDescription(
      session?.topic,
      problemStep?.summaryData || legacyProblemStep?.summaryData,
    );

    async function submitAnalysis(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (isCoaching3bDiscussion) {
        const goal = drafts.coachGoal?.trim() || '';
        const reality = drafts.coachReality?.trim() || '';
        const methods = drafts.coachMethods?.trim() || '';
        const rhythm = drafts.coachRhythm?.trim() || '';
        const check = drafts.coachCheck?.trim() || '';
        if (!goal || !reality || !methods || !rhythm || !check) return;
        setDraft('coachGoal', '');
        setDraft('coachReality', '');
        setDraft('coachMethods', '');
        setDraft('coachRhythm', '');
        setDraft('coachCheck', '');
        try {
          await saveContributionOptimistic(analysisStepNumber, 'hypothesis', {
            text: goal,
            rootCause: reality,
            why: reality,
            methods,
            rhythm,
            check,
            template: COACHING_3B_SOURCE,
          });
        } catch {
          setDraft('coachGoal', goal);
          setDraft('coachReality', reality);
          setDraft('coachMethods', methods);
          setDraft('coachRhythm', rhythm);
          setDraft('coachCheck', check);
        }
        return;
      }
      const issue = isHcmcDiscussion ? (drafts.rootCause?.trim() || '') : (drafts.issue?.trim() || '');
      const rootCause = drafts.rootCause?.trim() || '';
      if (!issue || !rootCause) return;
      setDraft('issue', '');
      setDraft('rootCause', '');
      try {
        await saveContributionOptimistic(analysisStepNumber, 'hypothesis', {
          text: issue,
          rootCause,
          why: rootCause,
        });
      } catch {
        setDraft('issue', issue);
        setDraft('rootCause', rootCause);
      }
    }

    async function toggleStep2Selection(selected: VDiscussionContribution) {
      const nextIds = selectedIds.includes(selected.id)
        ? selectedIds.filter((id) => id !== selected.id)
        : [...selectedIds, selected.id];
      const selectedItems = analyses
        .filter((analysis) => nextIds.includes(analysis.id))
        .map((analysis) => parseContributionContent(analysis).payload);

      await saveStepSummary(analysisStepNumber, {
        ...analysisStep?.summaryData,
        selectedAnalysisIds: nextIds,
        selectedItems,
        selectedProblemTitle: problemStep?.summaryData?.selectedProblemTitle || '',
      });
    }

    async function continueToStep3() {
      if (!selectedAnalyses.length) {
        const message = isCoaching3bDiscussion ? 'Nhóm cần chốt đáp án để chuyển bước' : 'Nhóm trưởng cần chốt đáp án để chuyển bước';
        window.alert(message);
        setErrorMessage(message);
        return;
      }
      const validSelectedIds = selectedAnalyses.map((analysis) => analysis.id);
      const selectedItems = selectedAnalyses.map((analysis) => parseContributionContent(analysis).payload);

      await saveSummaryAndGo(analysisStepNumber, {
        ...analysisStep?.summaryData,
        selectedAnalysisIds: validSelectedIds,
        selectedItems,
        selectedProblemTitle: problemStep?.summaryData?.selectedProblemTitle || '',
      }, isCoaching3bDiscussion ? 4 : 3);
    }

    return renderShell(
      <section className="vdiscussion-panel">
        <div className="vdiscussion-context-box">
          <Target size={17} />
          <div>
            <strong>{isCoaching3bDiscussion ? 'Chân dung đã chốt' : 'Vấn đề đã chốt'}</strong>
            <span>{selectedProblemTitle}</span>
            {isCoaching3bDiscussion && selectedProblemDescription ? <p>{selectedProblemDescription}</p> : null}
          </div>
        </div>
        {isCoaching3bDiscussion ? (
          <form className="vdiscussion-form-card vdiscussion-analysis-form is-coaching-plan" onSubmit={submitAnalysis}>
            <label>
              <span>1. Đích (Đo được) – Xác định năng lực mong muốn đạt được sau 4 tuần + Con số/Cách đo</span>
              <textarea value={drafts.coachGoal || ''} onChange={(event) => setDraft('coachGoal', event.target.value)} placeholder="VD: Sau 4 tuần, NV tự khép 3 ca khiếu nại liên tiếp không cần hỏi lại." />
            </label>
            <label>
              <span>2. Thực trạng năng lực nhân viên (Nhận định đúng gốc) – Tham chiếu từ chẩn đoán Bước 1</span>
              <textarea value={drafts.coachReality || ''} onChange={(event) => setDraft('coachReality', event.target.value)} placeholder="Nêu gốc kỹ năng/động lực và biểu hiện quan sát được..." />
            </label>
            <label>
              <span>3. Phương án kèm cặp – Chọn 1-2 cách huấn luyện, kèm cặp cải thiện năng lực gốc</span>
              <textarea value={drafts.coachMethods || ''} onChange={(event) => setDraft('coachMethods', event.target.value)} placeholder={COACHING_3B_METHODS.map((method) => method.label).join(' / ')} />
            </label>
            <label>
              <span>4. Nhịp & Mốc – Lịch kèm cặp cố định và Điểm kiểm tra giữa chu kỳ</span>
              <textarea value={drafts.coachRhythm || ''} onChange={(event) => setDraft('coachRhythm', event.target.value)} placeholder="VD: mỗi tuần 1 buổi OJT + giữa tuần kiểm tra nhanh 2-3 việc + cuối tuần chốt tiến bộ." />
            </label>
            <label>
              <span>5. Đo & Chốt – Dấu hiệu huấn luyện, kèm cặp đạt và bước tiếp theo.</span>
              <textarea value={drafts.coachCheck || ''} onChange={(event) => setDraft('coachCheck', event.target.value)} placeholder="Dấu hiệu đạt, người kiểm, bước tiếp theo nếu đạt..." />
            </label>
            <button className="btn btn-primary btn-small vdiscussion-analysis-submit" type="submit" disabled={isContributionSaving || !drafts.coachGoal?.trim() || !drafts.coachReality?.trim() || !drafts.coachMethods?.trim() || !drafts.coachRhythm?.trim() || !drafts.coachCheck?.trim()}>
              <Send size={15} /> {isContributionSaving ? 'Đang gửi...' : 'Gửi kế hoạch kèm cặp'}
            </button>
          </form>
        ) : (
          <form className={isHcmcDiscussion ? 'vdiscussion-form-card vdiscussion-analysis-form is-hcmc-single' : 'vdiscussion-form-card is-two vdiscussion-analysis-form'} onSubmit={submitAnalysis}>
            {!isHcmcDiscussion ? (
              <label>
                <span>Tồn tại / hạn chế</span>
                <textarea value={drafts.issue || ''} onChange={(event) => setDraft('issue', event.target.value)} placeholder="Nhập vấn đề phát sinh..." />
              </label>
            ) : null}
            <label>
              <span>{isHcmcDiscussion ? 'Nguyên nhân khiến khách hàng không hài lòng' : 'Nguyên nhân gốc rễ'}</span>
              <textarea value={drafts.rootCause || ''} onChange={(event) => setDraft('rootCause', event.target.value)} placeholder={isHcmcDiscussion ? 'Nhập nguyên nhân...' : 'Phân tích nguyên nhân chính...'} />
            </label>
            <button className="btn btn-primary btn-small vdiscussion-analysis-submit" type="submit" disabled={isContributionSaving || (!isHcmcDiscussion && !drafts.issue?.trim()) || !drafts.rootCause?.trim()}>
              <Send size={15} /> {isContributionSaving ? 'Đang gửi...' : 'Gửi phân tích'}
            </button>
          </form>
        )}

        <div className="vdiscussion-card-list">
          {analyses.map((analysis) => {
            const parsed = parseContributionContent(analysis);
            const itemComments = comments.filter((comment) => comment.parentId === analysis.id);
            const isSelected = selectedIds.includes(analysis.id);
            return (
              <article className={isSelected ? 'vdiscussion-work-card vdiscussion-analysis-card is-selected' : 'vdiscussion-work-card vdiscussion-analysis-card'} key={analysis.id}>
                <div className="vdiscussion-analysis-author">
                  <span className="vdiscussion-card-kicker">{getContributionAuthorName(analysis)}</span>
                </div>
                <div className={isHcmcDiscussion ? 'vdiscussion-analysis-columns is-single' : 'vdiscussion-analysis-columns'}>
                  {isCoaching3bDiscussion ? (
                    <>
                      <div>
                        <span>ĐÍCH</span>
                        <p>{parsed.title}</p>
                      </div>
                      <div>
                        <span>THỰC TRẠNG</span>
                        <p>{parsed.description}</p>
                      </div>
                      <div>
                        <span>PHƯƠNG ÁN</span>
                        <p>{String(parsed.payload.methods || '')}</p>
                      </div>
                      <div>
                        <span>NHỊP & MỐC</span>
                        <p>{String(parsed.payload.rhythm || '')}</p>
                      </div>
                      <div>
                        <span>ĐO & CHỐT</span>
                        <p>{String(parsed.payload.check || '')}</p>
                      </div>
                    </>
                  ) : !isHcmcDiscussion ? (
                    <div>
                      <span>Tồn tại / hạn chế</span>
                      <p>{parsed.title}</p>
                    </div>
                  ) : null}
                  {!isCoaching3bDiscussion ? (
                    <div>
                      <span>{isHcmcDiscussion ? 'Nguyên nhân' : 'Nguyên nhân gốc rễ'}</span>
                      <p>{parsed.description}</p>
                    </div>
                  ) : null}
                </div>
                <div className="vdiscussion-card-actions">
                  <button
                    type="button"
                    className={likedContributionIds.has(analysis.id) ? 'btn btn-ghost btn-small vdiscussion-like-button is-liked' : 'btn btn-ghost btn-small vdiscussion-like-button'}
                    onClick={() => void runAction(() => likeContribution(analysis.id))}
                  >
                    <ThumbsUp size={14} /> {analysis.upvotesCount}
                  </button>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setActiveCommentTarget(activeCommentTarget === analysis.id ? null : analysis.id)}>
                    <MessageCircle size={14} /> {itemComments.length}
                  </button>
                  {canLead ? (
                    <button type="button" className={isSelected ? 'btn btn-primary btn-small' : 'btn btn-ghost btn-small'} onClick={() => void runAction(() => toggleStep2Selection(analysis))}>
                      <Check size={14} /> {isSelected ? 'Bỏ chốt' : 'Chốt đáp án này'}
                    </button>
                  ) : null}
                </div>
                {itemComments.length ? (
                  <div className="vdiscussion-comment-list">
                    {itemComments.map((comment) => <span key={comment.id}>{getContributionAuthorName(comment)}: {parseContributionContent(comment).title}</span>)}
                  </div>
                ) : null}
                {activeCommentTarget === analysis.id ? renderCommentForm(analysisStepNumber, analysis.id, 'Phản biện hoặc bổ sung phân tích...') : null}
              </article>
            );
          })}
        </div>
        {canLead ? (
          <div className="vdiscussion-step-continue">
            <span>{selectedAnalyses.length ? `${selectedAnalyses.length} phân tích đã được chốt.` : 'Có thể chốt nhiều phân tích trước khi chuyển B3.'}</span>
            <div className="vdiscussion-step-actions">
              {renderReviewPreviousButton()}
              {!isFinalLocked ? (
                <button type="button" className="btn btn-primary" onClick={() => void runAction(continueToStep3)}>
                  {isCoaching3bDiscussion ? 'Bước tiếp theo' : 'Chuyển B3'}
                </button>
              ) : renderReviewNextButton()}
            </div>
          </div>
        ) : null}
      </section>,
    );
  }

  function renderStep3() {
    const analysisStepNumber = isCoaching3bDiscussion ? 3 : 2;
    const ideaStepNumber = isCoaching3bDiscussion ? 4 : 3;
    const analysisStep = stepByNumber.get(analysisStepNumber);
    const ideaStep = stepByNumber.get(ideaStepNumber);
    const ideas = newestFirst((contributionsByStep.get(ideaStepNumber) || []).filter((item) => item.type === 'idea' && !item.parentId));
    const reviews = newestFirst((contributionsByStep.get(ideaStepNumber) || []).filter((item) => item.type === 'idea' && item.parentId));
    const selectedIdeaIds = asArray<string | number>(ideaStep?.summaryData?.selectedIdeaIds).map(String);
    const selectedAnalyses = asArray<Record<string, unknown>>(analysisStep?.summaryData?.selectedItems);

    async function submitIdea(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (isCoaching3bDiscussion) {
        const target = drafts.idpTarget?.trim() || '';
        const gaps = drafts.idpGaps?.trim() || '';
        if (!target || !gaps) return;
        const payload = {
          title: target,
          why: gaps,
          start: drafts.idpStart?.trim() || '',
          target,
          gaps,
          m12: drafts.idpM12?.trim() || '',
          m34: drafts.idpM34?.trim() || '',
          m56: drafts.idpM56?.trim() || '',
          support: drafts.idpSupport?.trim() || '',
          review: drafts.idpReview?.trim() || '',
          template: COACHING_3B_SOURCE,
        };
        ['idpStart', 'idpTarget', 'idpGaps', 'idpM12', 'idpM34', 'idpM56', 'idpSupport', 'idpReview'].forEach((key) => setDraft(key, ''));
        try {
          await saveContributionOptimistic(ideaStepNumber, 'idea', payload);
        } catch {
          setDraft('idpStart', payload.start);
          setDraft('idpTarget', payload.target);
          setDraft('idpGaps', payload.gaps);
          setDraft('idpM12', payload.m12);
          setDraft('idpM34', payload.m34);
          setDraft('idpM56', payload.m56);
          setDraft('idpSupport', payload.support);
          setDraft('idpReview', payload.review);
        }
        return;
      }
      const title = drafts.ideaTitle?.trim() || '';
      const why = drafts.ideaWhy?.trim() || '';
      if (!title || !why) return;
      const pendingKey = `idea:${currentParticipant?.id || profile?.id || 'anon'}:${title}:${why}`;
      if (pendingSubmitRef.current.has(pendingKey)) return;
      pendingSubmitRef.current.add(pendingKey);
      setPendingSubmits((current) => ({ ...current, idea: true }));
      setDraft('ideaTitle', '');
      setDraft('ideaWhy', '');
      let optimisticContributionId = '';
      try {
        const targetStep = stepByNumber.get(ideaStepNumber);
        const optimisticAt = new Date().toISOString();
        const optimisticContribution: VDiscussionContribution | null = targetStep?.id ? {
          id: `optimistic-idea-${currentParticipant?.id || profile?.id || 'anon'}-${Date.now()}`,
          stepId: targetStep.id,
          profileId: profile?.id || null,
          participantId: currentParticipant?.id || null,
          authorName: currentParticipant?.fullName || profile?.fullName || profile?.email || null,
          type: 'idea',
          content: JSON.stringify({ title, why }),
          metadata: { optimistic: true },
          parentId: null,
          upvotesCount: 0,
          downvotesCount: 0,
          createdAt: optimisticAt,
          updatedAt: optimisticAt,
        } : null;
        if (optimisticContribution) {
          optimisticContributionId = optimisticContribution.id;
          mergeContributionIntoCache(optimisticContribution);
        }
        await saveStepContribution(ideaStepNumber, 'idea', {
          title,
          why,
        });
        if (optimisticContribution) removeContributionFromCache(optimisticContribution.id);
        setErrorMessage('');
      } catch (error) {
        if (optimisticContributionId) removeContributionFromCache(optimisticContributionId);
        setDraft('ideaTitle', title);
        setDraft('ideaWhy', why);
        setErrorMessage(getErrorMessage(error));
      } finally {
        pendingSubmitRef.current.delete(pendingKey);
        setPendingSubmits((current) => ({ ...current, idea: false }));
      }
    }

    const currentActorKey = currentParticipant?.id || profile?.id || 'unknown';

    async function submitReview(idea: VDiscussionContribution, score: number) {
      const scoreKey = `${idea.id}:${currentActorKey}`;
      const previousScore = optimisticIdeaScores[scoreKey];
      setOptimisticIdeaScores((current) => ({ ...current, [scoreKey]: score }));
      const existingReview = reviews.find((review) => review.parentId === idea.id && actorKey(review) === currentActorKey);
      const payload = {
        kind: 'wireflow_review',
        agreeScore: score,
        pick: false,
      };
      if (!payload.agreeScore) return;
      const succeeded = await runAction(async () => {
        if (existingReview?.id) {
          await updateContributionMutation.mutateAsync({
            id: existingReview.id,
            content: JSON.stringify(payload),
            expectedUpdatedAt: existingReview.updatedAt || '',
          });
        } else {
          await saveStepContribution(ideaStepNumber, 'idea', payload, idea.id);
        }
      });
      if (!succeeded) {
        setOptimisticIdeaScores((current) => {
          if (current[scoreKey] !== score) return current;
          const next = { ...current };
          if (typeof previousScore === 'number') next[scoreKey] = previousScore;
          else delete next[scoreKey];
          return next;
        });
      }
    }

    async function toggleStep3IdeaSelection(idea: VDiscussionContribution) {
      const isSelected = selectedIdeaIds.includes(idea.id);
      const nextIds = isSelected
        ? selectedIdeaIds.filter((id) => id !== idea.id)
        : [...selectedIdeaIds, idea.id];
      const nextIdeas = ideas
        .filter((item) => nextIds.includes(item.id))
        .map((item) => ({ id: item.id, title: parseContributionContent(item).title, ...parseContributionContent(item).payload }));
      await saveStepSummary(ideaStepNumber, {
        ...ideaStep?.summaryData,
        selectedIdeaIds: nextIds,
        selectedIdeas: nextIdeas,
        selectedSolutionId: nextIds[0] || '',
        selectedSolutionTitle: nextIdeas.map((item) => String(item.title || '')).filter(Boolean).join(' · '),
      });
    }

    async function continueToStep4() {
      if (!selectedIdeaIds.length) return;
      const selectedIdeas = ideas
        .filter((idea) => selectedIdeaIds.includes(idea.id))
        .map((idea) => ({ id: idea.id, title: parseContributionContent(idea).title, ...parseContributionContent(idea).payload }));
      const selectedIdea = ideas.find((idea) => selectedIdeaIds.includes(idea.id)) || null;

      await saveSummaryAndGo(ideaStepNumber, {
        ...ideaStep?.summaryData,
        selectedIdeaIds,
        selectedIdeas,
        selectedSolutionId: selectedIdea?.id || selectedIdeaIds[0],
        selectedSolutionTitle: selectedIdeas.map((item) => String(item.title || '')).filter(Boolean).join(' · ') || (selectedIdea ? parseContributionContent(selectedIdea).title : String(ideaStep?.summaryData?.selectedSolutionTitle || '')),
      }, 5);
    }

    return renderShell(
      <section className="vdiscussion-panel">
        {!isCoaching3bDiscussion ? (
          <div className="vdiscussion-context-box">
            <Sparkles size={17} />
            <div>
              <strong>Phân tích được chọn</strong>
              <span>{selectedAnalyses.map((item) => String(item.text || item.title || '')).filter(Boolean).join(' · ') || 'Chưa có phân tích được chốt từ bước 2'}</span>
            </div>
          </div>
        ) : null}
        {isCoaching3bDiscussion ? (
          <form className="vdiscussion-form-card vdiscussion-idea-form is-coaching-idp" onSubmit={submitIdea}>
            <label>
              <span>Năng lực của nhân viên hiện tại</span>
              <textarea value={drafts.idpStart || ''} onChange={(event) => setDraft('idpStart', event.target.value)} placeholder="NV đang ở đâu, mạnh/yếu điểm gì..." />
            </label>
            <label>
              <span>Mục tiêu phát triển sau 6 tháng</span>
              <textarea value={drafts.idpTarget || ''} onChange={(event) => setDraft('idpTarget', event.target.value)} placeholder="Sau 6 tháng cần đạt năng lực/vai trò nào..." />
            </label>
            <label>
              <span>Khoảng cách năng lực</span>
              <textarea value={drafts.idpGaps || ''} onChange={(event) => setDraft('idpGaps', event.target.value)} placeholder="Các khoảng cách cần lấp..." />
            </label>
            <label>
              <span>Kế hoạch phát triển - Tháng thứ 1 và thứ 2</span>
              <textarea value={drafts.idpM12 || ''} onChange={(event) => setDraft('idpM12', event.target.value)} placeholder="Mốc học/việc cần làm trong 1-2 tháng đầu..." />
            </label>
            <label>
              <span>Kế hoạch phát triển - Tháng thứ 3 và thứ 4</span>
              <textarea value={drafts.idpM34 || ''} onChange={(event) => setDraft('idpM34', event.target.value)} placeholder="Mốc thực hành, giao việc, kiểm tra..." />
            </label>
            <label>
              <span>Kế hoạch phát triển - Tháng thứ 5 và thứ 6</span>
              <textarea value={drafts.idpM56 || ''} onChange={(event) => setDraft('idpM56', event.target.value)} placeholder="Mốc tự chủ/đánh giá cuối chu kỳ..." />
            </label>
            <label>
              <span>Hỗ trợ/Nguồn lực cần có</span>
              <textarea value={drafts.idpSupport || ''} onChange={(event) => setDraft('idpSupport', event.target.value)} placeholder="Người kèm, tài liệu, cơ hội giao việc..." />
            </label>
            <label>
              <span>Cách rà soát kế hoạch</span>
              <textarea value={drafts.idpReview || ''} onChange={(event) => setDraft('idpReview', event.target.value)} placeholder="Ai rà soát, chu kỳ nào, bằng chứng gì..." />
            </label>
            <button className="btn btn-primary btn-small" type="submit" disabled={Boolean(pendingSubmits.idea) || !drafts.idpTarget?.trim() || !drafts.idpGaps?.trim()}>
              <Send size={15} /> {pendingSubmits.idea ? 'Đang gửi...' : 'Gửi kế hoạch phát triển'}
            </button>
          </form>
        ) : (
          <form className="vdiscussion-form-card is-two vdiscussion-idea-form" onSubmit={submitIdea}>
            <label>
              <span>{isHcmcDiscussion ? 'Hành vi chuẩn cần đạt' : 'Tên giải pháp/ý tưởng'}</span>
              <input value={drafts.ideaTitle || ''} onChange={(event) => setDraft('ideaTitle', event.target.value)} placeholder={isHcmcDiscussion ? 'Nhập hành vi chuẩn cần đạt...' : 'Tên giải pháp / ý tưởng'} />
            </label>
            <label>
              <span>{isHcmcDiscussion ? 'Câu nói then chốt giúp khách hàng an tâm hơn' : 'Vì sao giải pháp này đáng thử'}</span>
              <textarea value={drafts.ideaWhy || ''} onChange={(event) => setDraft('ideaWhy', event.target.value)} placeholder={isHcmcDiscussion ? 'Nhập câu nói then chốt...' : 'Vì sao giải pháp này đáng thử?'} />
            </label>
            <button className="btn btn-primary btn-small" type="submit" disabled={Boolean(pendingSubmits.idea) || !drafts.ideaTitle?.trim() || !drafts.ideaWhy?.trim()}>
              <Send size={15} /> {pendingSubmits.idea ? 'Đang gửi...' : isHcmcDiscussion ? 'Gửi hành vi & câu nói' : 'Gửi ý tưởng'}
            </button>
          </form>
        )}

        <div className="vdiscussion-card-list">
          {ideas.map((idea) => {
            const parsed = parseContributionContent(idea);
            const ideaReviews = reviews.filter((review) => review.parentId === idea.id);
            const ideaComments = (contributionsByStep.get(ideaStepNumber) || []).filter((item) => item.type === 'comment' && item.parentId === idea.id);
            const scores = ideaReviews.map((review) => Number(parseContributionContent(review).payload.agreeScore || 0)).filter(Boolean);
            const existingReview = ideaReviews.find((review) => actorKey(review) === currentActorKey);
            const existingPayload = existingReview ? parseContributionContent(existingReview).payload : {};
            const scoreKey = `${idea.id}:${currentActorKey}`;
            const myScore = optimisticIdeaScores[scoreKey] ?? Number(existingPayload.agreeScore || 0);
            return (
              <article className={selectedIdeaIds.includes(idea.id) ? 'vdiscussion-work-card vdiscussion-idea-review-card is-selected' : 'vdiscussion-work-card vdiscussion-idea-review-card'} key={idea.id}>
                {selectedIdeaIds.includes(idea.id) ? <span className="vdiscussion-selected-answer-pill"><Check size={13} /> Đã chọn</span> : null}
                {canLead ? (
                  <button type="button" className={selectedIdeaIds.includes(idea.id) ? 'btn btn-primary btn-small vdiscussion-idea-pin-action' : 'btn btn-ghost btn-small vdiscussion-idea-pin-action'} onClick={() => void runAction(() => toggleStep3IdeaSelection(idea))}>
                    <Check size={14} /> {selectedIdeaIds.includes(idea.id) ? 'Bỏ chốt' : 'Chốt đáp án này'}
                  </button>
                ) : null}
                <div className="vdiscussion-idea-main">
                  <h3>{isCoaching3bDiscussion ? `Mục tiêu phát triển sau 6 tháng: ${parsed.title}` : isHcmcDiscussion ? `Hành vi chuẩn: ${parsed.title}` : parsed.title}</h3>
                  <p>{isCoaching3bDiscussion ? `Khoảng cách năng lực: ${parsed.description || String(parsed.payload.gaps || '')}` : isHcmcDiscussion ? `Câu nói then chốt: ${parsed.description || String(parsed.payload.why || '')}` : parsed.description || String(parsed.payload.why || parsed.payload.contextTag || '')}</p>
                  {isCoaching3bDiscussion ? (
                    <div className="vdiscussion-idea-detail-grid">
                      {([
                        ['Năng lực của nhân viên hiện tại', parsed.payload.start],
                        ['Kế hoạch phát triển - Tháng thứ 1 và thứ 2', parsed.payload.m12],
                        ['Kế hoạch phát triển - Tháng thứ 3 và thứ 4', parsed.payload.m34],
                        ['Kế hoạch phát triển - Tháng thứ 5 và thứ 6', parsed.payload.m56],
                        ['Hỗ trợ/Nguồn lực cần có', parsed.payload.support],
                        ['Cách rà soát kế hoạch', parsed.payload.review],
                      ] as Array<[string, unknown]>).map(([label, value]) => String(value || '').trim() ? <span key={label}><b>{label}:</b> {String(value)}</span> : null)}
                    </div>
                  ) : null}
                  <div className="vdiscussion-idea-author">
                    <strong>{getInitials(getContributionAuthorName(idea, 'TV'))}</strong>
                    <span>{getContributionAuthorName(idea)}</span>
                  </div>
                </div>
                <div className="vdiscussion-score-strip">
                  <div className="vdiscussion-star-rating vdiscussion-star-control" aria-label="Đánh giá ý tưởng">
                    <strong>{formatRatingNumber(average(scores))}</strong>
                    <div className="vdiscussion-star-buttons">
                      {[1, 2, 3, 4, 5].map((score) => (
                        <button
                          type="button"
                          key={score}
                          className={score <= myScore ? 'is-active' : ''}
                          onClick={() => void submitReview(idea, score)}
                          aria-label={`Đánh giá ${score} sao`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    <em>{scores.length} đánh giá</em>
                  </div>
                  <button type="button" className="vdiscussion-comment-count-button" onClick={() => setActiveCommentTarget(activeCommentTarget === idea.id ? null : idea.id)} aria-label="Nhập phản hồi">
                    <MessageCircle size={15} />
                    <span>{ideaComments.length}</span>
                  </button>
                </div>
                {ideaComments.length || activeCommentTarget === idea.id ? <div className="vdiscussion-idea-build-zone">
                  {ideaComments.map((comment) => {
                    const payload = parseContributionContent(comment).payload;
                    return (
                      <div className="vdiscussion-idea-comment" key={comment.id}>
                        <span>{getContributionAuthorName(comment)}</span>
                        {String(payload.text || payload.reason || parseContributionContent(comment).title || '')}
                      </div>
                    );
                  })}
                  {activeCommentTarget === idea.id ? renderCommentForm(3, idea.id, 'Nhập phản hồi cho ý tưởng...') : null}
                </div> : null}
              </article>
            );
          })}
        </div>
        {canLead ? (
          <div className="vdiscussion-step-continue">
            <span>{selectedIdeaIds.length ? `${selectedIdeaIds.length} giải pháp đã được chốt, có thể chuyển sang B4.` : 'Hãy chốt ít nhất một giải pháp trước khi chuyển B4.'}</span>
            <div className="vdiscussion-step-actions">
              {renderReviewPreviousButton()}
              {!isFinalLocked ? (
                <button type="button" className="btn btn-primary" onClick={() => void runAction(continueToStep4)} disabled={!selectedIdeaIds.length}>
                  {isCoaching3bDiscussion ? 'Bước tiếp theo' : 'Chuyển B4'}
                </button>
              ) : renderReviewNextButton()}
            </div>
          </div>
        ) : null}
      </section>,
    );
  }

  function renderStep4() {
    const step3 = stepByNumber.get(3);
    const step4 = stepByNumber.get(4);
    const allIdeas = newestFirst((contributionsByStep.get(3) || []).filter((item) => item.type === 'idea' && !item.parentId));
    const selectedIds = asArray<string | number>(step3?.summaryData?.selectedIdeaIds).map(String);
    const ideas = selectedIds.length ? allIdeas.filter((idea) => selectedIds.includes(idea.id)) : allIdeas;
    const entries = contributionsByStep.get(4) || [];
    const ratings = entries.filter((item) => item.type === 'step4_rating');
    const comments = newestFirst(entries.filter((item) => item.type === 'step4_comment'));
    const selectedSolutionId = String(step4?.summaryData?.selectedSolutionId || '');

    function ratingStats(ideaId: string) {
      const relevant = ratings.map((item) => parseContributionContent(item).payload).filter((payload) => String(payload.solutionId || '') === ideaId);
      const scoreFor = (key: string) => average(relevant.map((payload) => Number(payload[key] || 0)).filter(Boolean));
      return {
        strategicFit: scoreFor('strategicFit'),
        resourceCost: scoreFor('resourceCost'),
        feasibility: scoreFor('feasibility'),
        total: Number((scoreFor('strategicFit') + scoreFor('feasibility') + (5 - scoreFor('resourceCost'))).toFixed(1)),
        count: relevant.length,
      };
    }

    async function submitRating(idea: VDiscussionContribution) {
      await runAction(() => saveStepContribution(4, 'step4_rating', {
        solutionId: idea.id,
        strategicFit: Number(drafts[`strategicFit-${idea.id}`] || 4),
        resourceCost: Number(drafts[`resourceCost-${idea.id}`] || 3),
        feasibility: Number(drafts[`feasibility-${idea.id}`] || 4),
      }));
    }

    async function submitStep4Comment(idea: VDiscussionContribution) {
      const key = `comment4-${idea.id}`;
      const comment = drafts[key]?.trim() || '';
      if (!comment) return;
      setDraft(key, '');
      try {
        await saveContributionOptimistic(4, 'step4_comment', { solutionId: idea.id, comment });
      } catch {
        setDraft(key, comment);
      }
    }

    async function finalizeStep4(idea: VDiscussionContribution) {
      const evaluations = ideas.map((item) => ({ id: item.id, title: parseContributionContent(item).title, ...ratingStats(item.id), selected: item.id === idea.id }));
      await saveSummaryAndGo(4, {
        selectedSolutionId: idea.id,
        selectedSolutionTitle: parseContributionContent(idea).title,
        evaluations,
      }, 5);
    }

    return renderShell(
      <section className="vdiscussion-panel vdiscussion-step4-panel">
        <div className="vdiscussion-card-list">
          {ideas.map((idea) => {
            const parsed = parseContributionContent(idea);
            const stats = ratingStats(idea.id);
            const ideaComments = comments.filter((item) => String(parseContributionContent(item).payload.solutionId || '') === idea.id);
            return (
              <article className={selectedSolutionId === idea.id ? 'vdiscussion-work-card is-selected' : 'vdiscussion-work-card'} key={idea.id}>
                <div>
                  <span className="vdiscussion-card-kicker">{stats.count} lượt chấm · tổng {stats.total}</span>
                  <h3>{parsed.title}</h3>
                  <p>{parsed.description}</p>
                </div>
                <div className="vdiscussion-rating-grid">
                  {RATING_FIELDS.map((field) => (
                    <label key={field.key}>
                      <span>{field.label} · {stats[field.key]}/5</span>
                      <select value={drafts[`${field.key}-${idea.id}`] || '4'} onChange={(event) => setDraft(`${field.key}-${idea.id}`, event.target.value)}>
                        {[1, 2, 3, 4, 5].map((score) => <option value={score} key={score}>{score}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                {canLead ? <div className="vdiscussion-step4-finalize"><button type="button" className="btn btn-primary btn-small" onClick={() => void runAction(() => finalizeStep4(idea))}>Chọn</button></div> : null}
                <div className="vdiscussion-review-box vdiscussion-step4-actions">
                  <input value={drafts[`comment4-${idea.id}`] || ''} onChange={(event) => setDraft(`comment4-${idea.id}`, event.target.value)} placeholder="Nhận xét thêm..." />
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => void submitStep4Comment(idea)} disabled={isContributionSaving || !drafts[`comment4-${idea.id}`]?.trim()}>
                    {isContributionSaving ? 'Đang gửi...' : 'Gửi nhận xét'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => void submitRating(idea)} disabled={isContributionSaving}>
                    {isContributionSaving ? 'Đang lưu...' : 'Lưu điểm'}
                  </button>
                </div>
                {ideaComments.length ? <div className="vdiscussion-comment-list">{ideaComments.map((comment) => <span key={comment.id}>{getContributionAuthorName(comment)}: {String(parseContributionContent(comment).payload.comment || '')}</span>)}</div> : null}
              </article>
            );
          })}
        </div>
      </section>,
    );
  }

  function renderStep5() {
    if (isCoaching3bDiscussion) {
      const legacyProblemStep = stepByNumber.get(1);
      const problemStep = stepByNumber.get(2);
      const coachStep = stepByNumber.get(3);
      const idpStep = stepByNumber.get(4);
      const finishStep = stepByNumber.get(5);
      const personaTitle = String(problemStep?.summaryData?.selectedProblemTitle || legacyProblemStep?.summaryData?.selectedProblemTitle || session?.topic?.title || '').trim();
      const coachRows = newestFirst((contributionsByStep.get(3) || []).filter((item) => item.type === 'hypothesis' && !item.parentId));
      const idpRows = newestFirst((contributionsByStep.get(4) || []).filter((item) => item.type === 'idea' && !item.parentId));
      const selectedCoachItems = asArray<Record<string, unknown>>(coachStep?.summaryData?.selectedItems);
      const selectedCoachIds = asArray<string | number>(coachStep?.summaryData?.selectedAnalysisIds).map(String);
      const selectedCoachRows = selectedCoachIds.length ? coachRows.filter((item) => selectedCoachIds.includes(item.id)) : [];
      const coachItems: Record<string, unknown>[] = selectedCoachItems.length
        ? selectedCoachItems
        : (selectedCoachRows.length ? selectedCoachRows : coachRows).map((item) => ({ id: item.id, ...parseContributionContent(item).payload }));
      const selectedIdpItems = asArray<Record<string, unknown>>(idpStep?.summaryData?.selectedIdeas);
      const selectedIdpIds = asArray<string | number>(idpStep?.summaryData?.selectedIdeaIds).map(String);
      const selectedIdpRows = selectedIdpIds.length ? idpRows.filter((item) => selectedIdpIds.includes(item.id)) : [];
      const idpItems: Record<string, unknown>[] = selectedIdpItems.length
        ? selectedIdpItems
        : (selectedIdpRows.length ? selectedIdpRows : idpRows).map((item) => ({ id: item.id, ...parseContributionContent(item).payload }));
      const primaryCoach: Record<string, unknown> = coachItems[0] || {};
      const primaryIdp: Record<string, unknown> = idpItems[0] || {};
      const coachGoal = String(primaryCoach.text || primaryCoach.title || '').trim();
      const coachReality = String(primaryCoach.rootCause || primaryCoach.why || primaryCoach.description || '').trim();
      const coachMethods = String(primaryCoach.methods || '').trim();
      const coachCheck = String(primaryCoach.check || '').trim();
      const idpTarget = String(primaryIdp.target || primaryIdp.title || '').trim();
      const idpGaps = String(primaryIdp.gaps || primaryIdp.why || primaryIdp.description || '').trim();
      const idpM12 = String(primaryIdp.m12 || '').trim();
      const savedCriteria = parseJson<Record<string, boolean>>(finishStep?.summaryData?.criteria, {});
      const criteria = [
        { key: 'persona', label: 'Chân dung đã rõ', desc: personaTitle || 'Chọn đúng một chân dung/nhân viên trọng tâm.', auto: Boolean(personaTitle) },
        { key: 'diagnosis', label: 'Chẩn đoán đúng gốc', desc: coachReality || idpGaps || 'Nêu được thực trạng/khoảng cách năng lực.', auto: Boolean(coachReality || idpGaps) },
        { key: 'coachPlan', label: 'Kèm cặp 4 tuần đo được', desc: coachGoal || 'Có mục tiêu 4 tuần và dấu hiệu đo.', auto: Boolean(coachGoal && coachCheck) },
        { key: 'idpPlan', label: 'Phát triển 6 tháng có chặng', desc: idpTarget || 'Có mục tiêu 6 tháng và các chặng phát triển.', auto: Boolean(idpTarget && idpM12) },
        { key: 'bridge', label: 'Hai tầng nối với nhau', desc: idpM12 || coachGoal || '4 tuần đầu phải nằm trong lộ trình 6 tháng.', auto: Boolean(coachGoal && idpTarget && (idpM12 || coachMethods)) },
      ];
      const checked = criteria.reduce((map, item) => {
        map[item.key] = savedCriteria[item.key] ?? item.auto;
        return map;
      }, {} as Record<string, boolean>);
      const readyCount = criteria.filter((item) => checked[item.key]).length;
      const allChecked = readyCount === criteria.length;
      const presentationFocus = drafts.presentationFocus ?? String(finishStep?.summaryData?.presentationFocus || '');
      const presenterName = drafts.presenterName ?? String(finishStep?.summaryData?.presenterName || '');
      const lessonNote = drafts.lessonNote ?? String(finishStep?.summaryData?.lessonNote || '');
      const presentationCard = compactLines([
        personaTitle ? `Chân dung: ${personaTitle}` : '',
        coachReality ? `Gốc: ${coachReality}` : idpGaps ? `Gốc: ${idpGaps}` : '',
        coachGoal ? `Đích kèm cặp: ${coachGoal}` : '',
        idpTarget ? `Đích phát triển: ${idpTarget}` : '',
      ]).replace(/\n/g, ' · ');

      async function toggleFinishCriterion(key: string) {
        await saveStepSummary(5, {
          ...finishStep?.summaryData,
          criteria: {
            ...checked,
            [key]: !checked[key],
          },
          presentationFocus,
          presenterName,
          lessonNote,
        });
      }

      async function completeCoachingFinish() {
        if (!allChecked) {
          window.alert('Nhóm cần rà đủ 5 tiêu chí trước khi tổng hợp.');
          setErrorMessage('Nhóm cần rà đủ 5 tiêu chí trước khi tổng hợp.');
          return;
        }
        await saveSummaryAndGo(5, {
          ...finishStep?.summaryData,
          criteria: checked,
          readyToPresent: true,
          presentationFocus,
          presenterName,
          lessonNote,
          selectedSolutionTitle: idpTarget || coachGoal || personaTitle,
          selectedSolutionId: String(selectedIdpIds[0] || selectedCoachIds[0] || ''),
        }, 6);
      }

      return renderShell(
        <section className="vdiscussion-panel vdiscussion-coaching-finish">
          <div className="vdiscussion-coaching-finish-grid">
            <div>
              <div className="vdiscussion-plan-titlebar">
                <span>Tự kiểm 5 tiêu chí trước khi trình bày</span>
                <strong>{readyCount}/5</strong>
              </div>
              <div className="vdiscussion-coaching-finish-criteria">
                {criteria.map((item) => (
                  <button
                    className={checked[item.key] ? 'is-checked' : ''}
                    key={item.key}
                    onClick={() => void runAction(() => toggleFinishCriterion(item.key))}
                    type="button"
                  >
                    <span>{checked[item.key] ? <Check size={15} /> : null}</span>
                    <strong>{item.label}</strong>
                    <em>{item.desc}</em>
                  </button>
                ))}
              </div>
              <div className={allChecked ? 'notice success' : 'notice warning'}>
                {allChecked ? 'Đủ 5 tiêu chí, nhóm đã sẵn sàng trình bày.' : `Còn ${criteria.length - readyCount} tiêu chí cần rà lại.`}
              </div>
            </div>

            <div>
              <div className="vdiscussion-plan-titlebar">
                <span>Chuẩn bị trình bày 3 phút</span>
                <strong>3'</strong>
              </div>
              <div className="vdiscussion-coaching-talk-card">
                <span>Thẻ tóm tắt</span>
                <p>{presentationCard || 'Chưa đủ dữ liệu để tạo thẻ tóm tắt.'}</p>
              </div>
              <div className="vdiscussion-coaching-finish-fields">
                <label>
                  <span>Điểm tâm đắc nhất</span>
                  <textarea value={presentationFocus} onChange={(event) => setDraft('presentationFocus', event.target.value)} placeholder="1 chẩn đoán sắc + 1 giải pháp cụ thể nhóm muốn trình bày..." />
                </label>
                <label>
                  <span>Người trình bày</span>
                  <input value={presenterName} onChange={(event) => setDraft('presenterName', event.target.value)} placeholder="Tên đại diện trình bày 3 phút" />
                </label>
                <label>
                  <span>Bài học chung</span>
                  <textarea value={lessonNote} onChange={(event) => setDraft('lessonNote', event.target.value)} placeholder="Một bài học nhóm muốn chia sẻ với lớp..." />
                </label>
              </div>
            </div>
          </div>

          {canLead ? (
            <div className="vdiscussion-plan-finalize">
              {renderReviewPreviousButton()}
              {!isFinalLocked ? (
                <button type="button" className="btn btn-primary" onClick={() => void runAction(completeCoachingFinish)}>
                  <Check size={15} /> Sẵn sàng trình bày
                </button>
              ) : renderReviewNextButton()}
            </div>
          ) : null}
        </section>,
      );
    }

    const step3 = stepByNumber.get(3);
    const step4 = stepByNumber.get(4);
    const selectedSolutionId = String(step4?.summaryData?.selectedSolutionId || step3?.summaryData?.selectedSolutionId || '');
    const selectedSolutionTitle = String(step4?.summaryData?.selectedSolutionTitle || step3?.summaryData?.selectedSolutionTitle || 'Giải pháp đã chọn');
    const plans = newestFirst((contributionsByStep.get(5) || []).filter((item) => item.type === 'step5_plan_input'));
    const selections = (contributionsByStep.get(5) || []).filter((item) => item.type === 'step5_plan_select');
    const planFields = isCoaching3bDiscussion ? COACHING_3B_REVIEW_FIELDS : isHcmcDiscussion ? HCMC_PLAN_FIELDS : PLAN_FIELDS;
    const latestPlanSelections = newestFirst(selections).reduce((map, item) => {
      const payload = parseContributionContent(item).payload;
      const planId = String(payload.planId || '');
      if (planId && !map.has(planId)) map.set(planId, Boolean(payload.selected));
      return map;
    }, new Map<string, boolean>());
    const selectedPlanIds = new Set(plans.filter((plan) => latestPlanSelections.get(plan.id)).map((plan) => plan.id));
    const approvedPlans = plans.filter((plan) => selectedPlanIds.has(plan.id));
    const isPlanReady = planFields.every((field) => drafts[`plan-${field.key}`]?.trim());

    async function submitPlan(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (planFields.some((field) => !drafts[`plan-${field.key}`]?.trim())) return;
      const payload = {
        solutionId: selectedSolutionId,
        solutionTitle: selectedSolutionTitle,
        objectives: drafts['plan-objectives'],
        tasks: drafts['plan-tasks'],
        resources: drafts['plan-resources'],
        timeline: drafts['plan-timeline'],
      };
      planFields.forEach((field) => setDraft(`plan-${field.key}`, ''));
      try {
        await saveContributionOptimistic(5, 'step5_plan_input', payload);
      } catch {
        setDraft('plan-objectives', String(payload.objectives || ''));
        setDraft('plan-tasks', String(payload.tasks || ''));
        setDraft('plan-resources', String(payload.resources || ''));
        setDraft('plan-timeline', String(payload.timeline || ''));
      }
    }

    async function togglePlan(planId: string, selected: boolean) {
      await saveStepContribution(5, 'step5_plan_select', { planId, selected });
    }

    async function finalizeStep5() {
      const selectedPlans = plans.filter((plan) => selectedPlanIds.has(plan.id)).map((plan) => ({ id: plan.id, ...parseContributionContent(plan).payload }));
      await saveSummaryAndGo(5, { selectedSolutionId, selectedSolutionTitle, plans: selectedPlans.length ? selectedPlans : plans.map((plan) => ({ id: plan.id, ...parseContributionContent(plan).payload })) }, 6);
    }

    return renderShell(
      <section className="vdiscussion-panel vdiscussion-plan-workspace">
        <div className="vdiscussion-plan-titlebar">
          <span>{isCoaching3bDiscussion ? 'Tự kiểm 5 tiêu chí và chuẩn bị trình bày' : isHcmcDiscussion ? 'Kế hoạch cải thiện phục vụ khách hàng trong 30 ngày tới' : 'Kế hoạch công việc dựa trên ý tưởng, giải pháp đã chọn'}</span>
          <strong>{selectedSolutionId ? 1 : 0}</strong>
        </div>

        <div className="vdiscussion-plan-layout">
          <div className="vdiscussion-plan-main">
            <form className="vdiscussion-plan-matrix" onSubmit={submitPlan}>
              <div className="vdiscussion-plan-solution">
                <Target size={17} />
                <strong>{isCoaching3bDiscussion ? `Kế hoạch phát triển đã chọn: ${selectedSolutionTitle}` : isHcmcDiscussion ? `Hành vi/câu nói đã chọn: ${selectedSolutionTitle}` : `Giải pháp: ${selectedSolutionTitle}`}</strong>
              </div>

              <div className="vdiscussion-plan-table">
                <div className="vdiscussion-plan-table-head">
                  {planFields.map((field) => <span key={field.key}>{field.label}</span>)}
                </div>
                <div className="vdiscussion-plan-table-row">
                  {planFields.map((field) => (
                    <label className="vdiscussion-plan-field" key={field.key}>
                      <span className="vdiscussion-plan-field-label">{field.label}</span>
                      <input
                        value={drafts[`plan-${field.key}`] || ''}
                        onChange={(event) => setDraft(`plan-${field.key}`, event.target.value)}
                        placeholder={field.placeholder}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="vdiscussion-plan-submitbar">
                <span className={isPlanReady ? 'is-ready' : ''}>
                  {isPlanReady ? `Đã nhập đủ ${planFields.length} ô, có thể gửi ý kiến.` : `Cần nhập đủ ${planFields.length} ô để bật nút "Gửi ý kiến".`}
                </span>
                <button className="btn btn-primary" type="submit" disabled={!isPlanReady || saveContributionMutation.isPending}>
                  <Send size={15} /> Gửi ý kiến
                </button>
              </div>
            </form>

            {plans.length ? (
              <div className="vdiscussion-plan-output">
                <div className="vdiscussion-plan-output-head">
                  <h3>Kế hoạch đầu ra</h3>
                  <span>{plans.length} dòng kế hoạch</span>
                </div>
                <div className="vdiscussion-plan-output-table-wrap">
                  <table className="vdiscussion-plan-output-table">
                    <thead>
                      <tr>
                        {planFields.map((field) => <th key={field.key}>{field.label}</th>)}
                        <th>Người gửi / trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plans.map((plan) => {
                        const payload = parseContributionContent(plan).payload;
                        const selected = selectedPlanIds.has(plan.id);
                        return (
                          <tr className={selected ? 'is-approved' : ''} key={plan.id}>
                            {planFields.map((field) => (
                              <td key={`${plan.id}-${field.key}`}>{String(payload[field.key] || '') || '—'}</td>
                            ))}
                            <td>
                              <div className="vdiscussion-plan-output-status">
                                <div className="vdiscussion-plan-output-author">
                                  <strong>{getInitials(getContributionAuthorName(plan, 'TV'))}</strong>
                                  <span>{getContributionAuthorName(plan)}</span>
                                </div>
                                <em>{selected ? 'Đã chốt toàn bộ dòng kế hoạch' : 'Chưa chốt dòng kế hoạch này'}</em>
                                {canLead ? (
                                  <button type="button" className={selected ? 'is-approved' : ''} onClick={() => void runAction(() => togglePlan(plan.id, !selected))}>
                                    <Check size={13} /> {selected ? 'Bỏ chốt' : 'Chốt ý kiến'}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="vdiscussion-approved-plan">
            <h3>Kế hoạch đã duyệt</h3>
            {approvedPlans.length ? approvedPlans.flatMap((plan) => {
              const payload = parseContributionContent(plan).payload;
              return planFields.map((field) => {
                const text = String(payload[field.key] || '').trim();
                return text ? <div key={`${plan.id}-${field.key}`}>✓ {field.label}: {text}</div> : null;
              }).filter(Boolean);
            }) : (
              <p>Chưa có mục kế hoạch được duyệt.</p>
            )}
          </aside>
        </div>

        {canLead ? (
          <div className="vdiscussion-plan-finalize">
            {renderReviewPreviousButton()}
            {!isFinalLocked ? (
              <button type="button" className="btn btn-primary" onClick={() => void runAction(finalizeStep5)}>
                <Check size={15} /> Chuyển B5
              </button>
            ) : renderReviewNextButton()}
          </div>
        ) : null}
      </section>,
    );
  }

  function renderStep6() {
    if (isCoaching3bDiscussion) {
      const legacyProblemStep = stepByNumber.get(1);
      const problemStep = stepByNumber.get(2);
      const coachStep = stepByNumber.get(3);
      const idpStep = stepByNumber.get(4);
      const reviewStep = stepByNumber.get(5);
      const finalStep = stepByNumber.get(6);
      const existingFinalSummary = finalStep?.summaryData || {};
      const coachingFinalLocked = Boolean(existingFinalSummary.finalLocked || isFinalLocked);
      const personaTitle = String(problemStep?.summaryData?.selectedProblemTitle || legacyProblemStep?.summaryData?.selectedProblemTitle || session?.topic?.title || '').trim();
      const coachRows = newestFirst((contributionsByStep.get(3) || []).filter((item) => item.type === 'hypothesis' && !item.parentId));
      const idpRows = newestFirst((contributionsByStep.get(4) || []).filter((item) => item.type === 'idea' && !item.parentId));
      const selectedCoachItems = asArray<Record<string, unknown>>(coachStep?.summaryData?.selectedItems);
      const selectedCoachIds = asArray<string | number>(coachStep?.summaryData?.selectedAnalysisIds).map(String);
      const selectedCoachRows = selectedCoachIds.length ? coachRows.filter((item) => selectedCoachIds.includes(item.id)) : [];
      const coachItems: Record<string, unknown>[] = selectedCoachItems.length
        ? selectedCoachItems
        : (selectedCoachRows.length ? selectedCoachRows : coachRows).map((item) => ({ id: item.id, ...parseContributionContent(item).payload }));
      const selectedIdpItems = asArray<Record<string, unknown>>(idpStep?.summaryData?.selectedIdeas);
      const selectedIdpIds = asArray<string | number>(idpStep?.summaryData?.selectedIdeaIds).map(String);
      const selectedIdpRows = selectedIdpIds.length ? idpRows.filter((item) => selectedIdpIds.includes(item.id)) : [];
      const idpItems: Record<string, unknown>[] = selectedIdpItems.length
        ? selectedIdpItems
        : (selectedIdpRows.length ? selectedIdpRows : idpRows).map((item) => ({ id: item.id, ...parseContributionContent(item).payload }));
      const reviewRows = newestFirst((contributionsByStep.get(5) || []).filter((item) => item.type === 'step5_plan_input'));
      const reviewItems: Record<string, unknown>[] = asArray<Record<string, unknown>>(reviewStep?.summaryData?.plans).length
        ? asArray<Record<string, unknown>>(reviewStep?.summaryData?.plans)
        : reviewRows.map((item) => ({ id: item.id, ...parseContributionContent(item).payload }));
      const primaryCoach: Record<string, unknown> = coachItems[0] || {};
      const primaryIdp: Record<string, unknown> = idpItems[0] || {};
      const coachGoal = String(primaryCoach.text || primaryCoach.title || '').trim();
      const coachReality = String(primaryCoach.rootCause || primaryCoach.why || primaryCoach.description || '').trim();
      const coachMethods = String(primaryCoach.methods || '').trim();
      const coachRhythm = String(primaryCoach.rhythm || '').trim();
      const coachCheck = String(primaryCoach.check || '').trim();
      const idpStart = String(primaryIdp.start || '').trim();
      const idpTarget = String(primaryIdp.target || primaryIdp.title || '').trim();
      const idpGaps = String(primaryIdp.gaps || primaryIdp.why || primaryIdp.description || '').trim();
      const idpM12 = String(primaryIdp.m12 || '').trim();
      const idpM34 = String(primaryIdp.m34 || '').trim();
      const idpM56 = String(primaryIdp.m56 || '').trim();
      const idpSupport = String(primaryIdp.support || '').trim();
      const idpReview = String(primaryIdp.review || '').trim();
      const bridgeText = idpM12 || coachRhythm || coachGoal;
      const criteria = [
        { label: 'Chân dung rõ', ok: Boolean(personaTitle), desc: personaTitle || 'Chưa chọn chân dung nhân viên.' },
        { label: 'Chẩn đoán đúng gốc', ok: Boolean(coachReality || idpGaps), desc: coachReality || idpGaps || 'Chưa có thực trạng/khoảng cách năng lực.' },
        { label: 'Đích 4 tuần đo được', ok: Boolean(coachGoal && coachCheck), desc: coachGoal || 'Chưa có mục tiêu 4 tuần.' },
        { label: 'Lộ trình 6 tháng có chặng', ok: Boolean(idpTarget && (idpM12 || idpM34 || idpM56)), desc: idpTarget || 'Chưa có mục tiêu 6 tháng.' },
        { label: 'Hai tầng nối nhau', ok: Boolean(bridgeText && coachGoal && idpTarget), desc: bridgeText || 'Chưa chỉ ra 4 tuần nối vào 6 tháng thế nào.' },
      ];
      const readyCount = criteria.filter((item) => item.ok).length;
      const presentationPoint = compactLines([
        personaTitle ? `Chân dung: ${personaTitle}` : '',
        coachReality ? `Gốc cần xử lý: ${coachReality}` : idpGaps ? `Khoảng cách năng lực: ${idpGaps}` : '',
        coachGoal ? `Đích 4 tuần: ${coachGoal}` : '',
        idpTarget ? `Mục tiêu phát triển sau 6 tháng: ${idpTarget}` : '',
      ]).replace(/\n/g, ' · ');

      async function submitCoachingFinal() {
        if (!finalStep?.id || coachingFinalLocked) return;
        const payload = {
          ...existingFinalSummary,
          template: COACHING_3B_SOURCE,
          selectedProblemTitle: personaTitle,
          selectedCoachItems: coachItems,
          selectedIdpItems: idpItems,
          reviewItems,
          presentationPoint,
          resultSnapshot: {
            version: 1,
            selectedProblemTitle: personaTitle,
            coach: primaryCoach,
            idp: primaryIdp,
            criteria,
            readyCount,
            generatedAt: new Date().toISOString(),
          },
          submissionStatus: 'submitted',
          finalLocked: true,
          finalizedAt: new Date().toISOString(),
          finalizedByParticipantId: currentParticipant?.id || null,
          finalizedByName: currentMemberName,
        };
        await runAction(() => submitActionGuardRef.current.run(`coaching-final-submit:${finalStep.id}`, async () => {
          await summaryMutation.mutateAsync({ stepId: finalStep.id, summaryData: payload, status: 'completed' });
          await sessionStepMutation.mutateAsync({ step: 6, status: 'completed' });
          setSuccessMessage('Bài trình bày 3b đã được hoàn thành. Nhóm sẽ không chỉnh sửa được nữa.');
        }));
      }

      return renderShell(
        <section className="vdiscussion-presentation vdiscussion-coaching-summary">
          <header className="vdiscussion-presentation-head">
            <h2>BÀI TRÌNH BÀY CỦA NHÓM</h2>
            <span>3B · Kèm cặp & phát triển nhân viên</span>
          </header>
          {successMessage || coachingFinalLocked ? (
            <div className="notice success vdiscussion-final-submit-notice">
              {successMessage || 'Bài trình bày 3b đã được hoàn thành. Nhóm sẽ không chỉnh sửa được nữa.'}
            </div>
          ) : null}

          <div className="vdiscussion-presentation-layout">
            <div className="vdiscussion-presentation-main">
              <div className="vdiscussion-summary-topic-chip">
                <strong>Chân dung trọng tâm:</strong>
                <span>{personaTitle || 'Chưa chốt chân dung nhân viên'}</span>
              </div>

              <article className="vdiscussion-summary-card">
                <div className="vdiscussion-summary-title">
                  <span className="is-b1">B1</span>
                  <div>
                    <h3>Chẩn đoán vấn đề phát triển</h3>
                    <em>Từ chân dung được nhóm chọn</em>
                  </div>
                </div>
                <div className="vdiscussion-summary-table is-two vdiscussion-summary-field-table">
                  <strong>Nội dung</strong>
                  <strong>Kết quả nhóm</strong>
                  <b>Nhân viên/nhóm nhân viên</b>
                  <p>{personaTitle || 'Chưa chốt.'}</p>
                  <b>Thực trạng / gốc cần xử lý</b>
                  <p>{coachReality || idpGaps || 'Chưa có chẩn đoán.'}</p>
                </div>
              </article>

              <article className="vdiscussion-summary-card">
                <div className="vdiscussion-summary-title">
                  <span className="is-b2">B2</span>
                  <div>
                    <h3>Tầng 1 · Kế hoạch kèm cặp 4 tuần</h3>
                    <em>{coachItems.length} phương án được ghi nhận</em>
                  </div>
                </div>
                <div className="vdiscussion-summary-table is-two vdiscussion-summary-field-table">
                  <strong>Thành tố</strong>
                  <strong>Nội dung triển khai</strong>
                  <b>Đích (Đo được)</b>
                  <p>{coachGoal || 'Chưa có mục tiêu 4 tuần.'}</p>
                  <b>Thực trạng năng lực nhân viên (Nhận định đúng gốc)</b>
                  <p>{coachReality || 'Chưa có nhận định thực trạng năng lực.'}</p>
                  <b>Phương án kèm cặp</b>
                  <p>{coachMethods || 'Chưa có phương án.'}</p>
                  <b>Nhịp & Mốc</b>
                  <p>{coachRhythm || 'Chưa có nhịp/mốc.'}</p>
                  <b>Đo & Chốt</b>
                  <p>{coachCheck || 'Chưa có cách đo/chốt.'}</p>
                </div>
              </article>

              <article className="vdiscussion-summary-card">
                <div className="vdiscussion-summary-title">
                  <span className="is-b3">B3</span>
                  <div>
                    <h3>Tầng 2 · Kế hoạch phát triển 6 tháng</h3>
                    <em>{idpItems.length} lộ trình được ghi nhận</em>
                  </div>
                </div>
                <div className="vdiscussion-summary-table is-two vdiscussion-summary-field-table">
                  <strong>Chặng</strong>
                  <strong>Nội dung</strong>
                  <b>Năng lực của nhân viên hiện tại</b>
                  <p>{idpStart || 'Chưa mô tả hiện tại.'}</p>
                  <b>Mục tiêu phát triển sau 6 tháng</b>
                  <p>{idpTarget || 'Chưa có mục tiêu 6 tháng.'}</p>
                  <b>Kế hoạch phát triển - Tháng thứ 1 và thứ 2</b>
                  <p>{idpM12 || 'Chưa có chặng 1-2.'}</p>
                  <b>Kế hoạch phát triển - Tháng thứ 3 và thứ 4</b>
                  <p>{idpM34 || 'Chưa có chặng 3-4.'}</p>
                  <b>Kế hoạch phát triển - Tháng thứ 5 và thứ 6</b>
                  <p>{idpM56 || 'Chưa có chặng 5-6.'}</p>
                  <b>Hỗ trợ/Nguồn lực cần có</b>
                  <p>{idpSupport || 'Chưa có hỗ trợ/nguồn lực.'}</p>
                  <b>Cách rà soát kế hoạch</b>
                  <p>{idpReview || 'Chưa có cách rà soát kế hoạch.'}</p>
                </div>
              </article>

              <article className="vdiscussion-summary-card vdiscussion-coaching-bridge-card">
                <div className="vdiscussion-summary-title">
                  <span className="is-b4">B4</span>
                  <div>
                    <h3>Điểm nối tầng & kết quả thảo luận</h3>
                    <em>Không chỉ đủ ô, mà phải thành một phương án có thể trình bày</em>
                  </div>
                </div>
                <div className="vdiscussion-coaching-bridge">
                  <div>
                    <strong>4 tuần đầu</strong>
                    <p>{coachGoal || 'Chưa có đích 4 tuần.'}</p>
                  </div>
                  <ArrowRight size={22} />
                  <div>
                    <strong>Nối vào kế hoạch tháng thứ 1 và thứ 2</strong>
                    <p>{bridgeText || 'Chưa mô tả cách nối tầng.'}</p>
                  </div>
                  <ArrowRight size={22} />
                  <div>
                    <strong>Mục tiêu phát triển sau 6 tháng</strong>
                    <p>{idpTarget || 'Chưa có mục tiêu phát triển sau 6 tháng.'}</p>
                  </div>
                </div>
                {reviewItems.length ? (
                  <div className="vdiscussion-coaching-review-note">
                    {reviewItems.map((item, index) => (
                      <p key={String(item.id || index)}>
                        <strong>Rà soát {index + 1}:</strong> {[item.objectives, item.tasks, item.resources, item.timeline].map((value) => String(value || '').trim()).filter(Boolean).join(' · ')}
                      </p>
                    ))}
                  </div>
                ) : null}
              </article>
            </div>

            <aside className="vdiscussion-presentation-side">
              <section>
                <h3>Tự kiểm 5 tiêu chí</h3>
                <p>{readyCount}/5 tiêu chí đã có dữ liệu.</p>
                <div className="vdiscussion-coaching-criteria-list">
                  {criteria.map((item) => (
                    <div className={item.ok ? 'is-ok' : ''} key={item.label}>
                      <Check size={14} />
                      <span>
                        <strong>{item.label}</strong>
                        <em>{item.desc}</em>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h3>Chuẩn bị trình bày 3 phút</h3>
                <p>{presentationPoint || 'Chưa đủ dữ liệu để tạo thẻ tóm tắt.'}</p>
                <ol className="vdiscussion-coaching-talk-track">
                  <li>Nêu chân dung và gốc vấn đề.</li>
                  <li>Chỉ ra đích kèm cặp 4 tuần và cách đo.</li>
                  <li>Nối 4 tuần đầu vào lộ trình phát triển 6 tháng.</li>
                  <li>Chốt bài học nhóm muốn chia sẻ với lớp.</li>
                </ol>
              </section>
            </aside>
          </div>

          <div className="vdiscussion-presentation-finish">
            {coachingFinalLocked ? (
              <span className="vdiscussion-final-locked-text">Bài trình bày 3b đã hoàn thành.</span>
            ) : (
              <span>Hoàn thành để khóa kết quả nhóm và hiển thị trạng thái đã nộp cho giảng viên.</span>
            )}
            <div className="vdiscussion-step-actions">
              {renderReviewPreviousButton()}
              {canLead && !coachingFinalLocked ? (
                <button type="button" className="btn btn-success" onClick={() => void submitCoachingFinal()} disabled={summaryMutation.isPending || sessionStepMutation.isPending}>
                  <Check size={15} /> {summaryMutation.isPending || sessionStepMutation.isPending ? 'Đang nộp...' : 'Hoàn thành'}
                </button>
              ) : null}
            </div>
          </div>
        </section>,
      );
    }

    const step1 = stepByNumber.get(1);
    const step2 = stepByNumber.get(2);
    const step3 = stepByNumber.get(3);
    const step5 = stepByNumber.get(5);
    const step3Items = contributionsByStep.get(3) || [];
    const planInputs = (contributionsByStep.get(5) || []).filter((item) => item.type === 'step5_plan_input');
    const planSelections = newestFirst((contributionsByStep.get(5) || []).filter((item) => item.type === 'step5_plan_select'));
    const latestPlanSelection = planSelections.reduce((map, item) => {
      const payload = parseContributionContent(item).payload;
      const planId = String(payload.planId || '');
      if (planId && !map.has(planId)) map.set(planId, Boolean(payload.selected));
      return map;
    }, new Map<string, boolean>());
    const approvedPlanInputs = planInputs.filter((plan) => latestPlanSelection.get(plan.id));
    const plans = asArray<Record<string, unknown>>(step5?.summaryData?.plans);
    const autoPlans: Record<string, unknown>[] = plans.length ? plans : approvedPlanInputs.map((plan) => ({ id: plan.id, ...parseContributionContent(plan).payload }));
    const summaryPlanFields = isCoaching3bDiscussion ? COACHING_3B_REVIEW_FIELDS : isHcmcDiscussion ? HCMC_PLAN_FIELDS : PLAN_FIELDS;
    const finalContributions = (contributionsByStep.get(6) || []).filter((item) => item.type === 'discussion_personal_commitment' || item.type === 'final_report');
    const existingSummary = stepByNumber.get(6)?.summaryData || {};
    const joinedMembers = members.filter((member) => joinedParticipantIds.has(member.id));
    const notJoinedMembers = members.filter((member) => !joinedParticipantIds.has(member.id));
    const selectedProblemTitle = String(step1?.summaryData?.selectedProblemTitle || session?.topic?.title || '').trim();
    const selectedAnalyses = asArray<Record<string, unknown>>(step2?.summaryData?.selectedItems);
    const selectedIdeasFromSummary = asArray<Record<string, unknown>>(step3?.summaryData?.selectedIdeas);
    const selectedIdeaIdsFromSummary = asArray<string | number>(step3?.summaryData?.selectedIdeaIds).map(String);
    const selectedSolutionTitle = String(step5?.summaryData?.selectedSolutionTitle || step3?.summaryData?.selectedSolutionTitle || '').trim();
    const selectedSolutionId = String(step5?.summaryData?.selectedSolutionId || step3?.summaryData?.selectedSolutionId || '').trim();
    const selectedIdeaIds = selectedIdeaIdsFromSummary.length ? selectedIdeaIdsFromSummary : selectedSolutionId ? [selectedSolutionId] : [];
    const selectedIdeaSummaries = selectedIdeaIds.map((ideaId) => {
      const ideaRow = step3Items.find((item) => item.type === 'idea' && !item.parentId && item.id === ideaId);
      const fromSummary = selectedIdeasFromSummary.find((item) => String(item.id || '') === ideaId) || {};
      const parsed = ideaRow ? parseContributionContent(ideaRow) : { title: String(fromSummary.title || ''), description: String(fromSummary.why || fromSummary.description || ''), payload: fromSummary };
      const reviews = step3Items.filter((item) => item.type === 'idea' && item.parentId === ideaId);
      const comments = step3Items.filter((item) => item.type === 'comment' && item.parentId === ideaId);
      const score = average(reviews.map((item) => Number(parseContributionContent(item).payload.agreeScore || 0)).filter(Boolean));
      const feedback = comments
        .map((item) => String(parseContributionContent(item).payload.reason || parseContributionContent(item).payload.text || parseContributionContent(item).title || '').trim())
        .filter(Boolean);
      return {
        id: ideaId,
        title: parsed.title || String(fromSummary.title || ''),
        description: parsed.description || String(parsed.payload.why || fromSummary.why || ''),
        reviews,
        comments,
        score,
        feedback,
      };
    }).filter((item) => item.id || item.title);
    const analysisLines = selectedAnalyses.map((item) => {
      const issue = String(item.text || item.title || '').trim();
      const rootCause = String(item.rootCause || item.why || item.description || '').trim();
      if (isHcmcDiscussion) return rootCause || issue;
      return [issue, rootCause ? `nguyên nhân: ${rootCause}` : ''].filter(Boolean).join(' - ');
    });
    const planLines = autoPlans.map((plan) => {
      const objectives = String(plan.objectives || '').trim();
      const tasks = String(plan.tasks || '').trim();
      const resources = String(plan.resources || '').trim();
      const timeline = String(plan.timeline || '').trim();
      if (isHcmcDiscussion) {
        return compactLines([
          objectives ? `Mục tiêu cải thiện: ${objectives}` : '',
          tasks ? `Hành vi hiện tại: ${tasks}` : '',
          timeline ? `Hành vi chuẩn cần cải thiện trong 30 ngày tới: ${timeline}` : '',
        ]).replace(/\n/g, '; ');
      }
      return compactLines([
        objectives ? `Mục tiêu: ${objectives}` : '',
        tasks ? `Việc làm: ${tasks}` : '',
        resources ? `Nguồn lực: ${resources}` : '',
        timeline ? `Thời hạn: ${timeline}` : '',
      ]).replace(/\n/g, '; ');
    });
    const ideaLines = selectedIdeaSummaries.map((idea) => {
      if (isHcmcDiscussion) {
        return compactLines([
          idea.title ? `Hành vi chuẩn: ${idea.title}` : '',
          idea.description ? `Câu then chốt: ${idea.description}` : '',
        ]).replace(/\n/g, '; ');
      }
      return idea.title;
    }).filter(Boolean);
    const autoFinalDraft: DraftMap = {
      journeySummary: compactLines([
        selectedProblemTitle ? `B1 - Vấn đề đã chốt: ${selectedProblemTitle}` : '',
        analysisLines.length ? `B2 - ${isHcmcDiscussion ? 'Nguyên nhân đã chốt' : 'Phân tích đã chốt'}:\n${analysisLines.map((line) => `- ${line}`).join('\n')}` : '',
        ideaLines.length ? `B3 - ${isHcmcDiscussion ? 'Hành vi chuẩn và câu then chốt đã chốt' : 'Giải pháp đã chốt'}:\n${ideaLines.map((line) => `- ${line}`).join('\n')}` : selectedSolutionTitle ? `B3 - ${isHcmcDiscussion ? 'Hành vi chuẩn đã chốt' : 'Giải pháp đã chốt'}: ${selectedSolutionTitle}` : '',
        planLines.length ? `B4 - ${isHcmcDiscussion ? 'Kế hoạch 30 ngày đã chốt' : 'Kế hoạch đã chốt'}:\n${planLines.map((line) => `- ${line}`).join('\n')}` : '',
      ]),
      finalConclusion: compactLines([
        selectedProblemTitle ? `Nhóm thống nhất tập trung xử lý vấn đề: ${selectedProblemTitle}.` : '',
        selectedIdeaSummaries.length ? `${isHcmcDiscussion ? 'Các hành vi chuẩn đã thống nhất là' : 'Các giải pháp ưu tiên là'}: ${selectedIdeaSummaries.map((idea) => idea.title).join('; ')}.` : selectedSolutionTitle ? `${isHcmcDiscussion ? 'Hành vi chuẩn ưu tiên là' : 'Giải pháp ưu tiên là'}: ${selectedSolutionTitle}.` : '',
        planLines.length ? (isHcmcDiscussion ? 'Kế hoạch 30 ngày đã được chốt theo mục tiêu cải thiện, hành vi hiện tại và hành vi chuẩn cần cải thiện.' : 'Kế hoạch hành động đã được chốt để triển khai theo các mục tiêu, việc làm, nguồn lực và thời hạn đã thống nhất.') : '',
      ]),
      selectedSolution: selectedSolutionTitle,
      keyDecisions: compactLines([
        selectedProblemTitle ? `Chốt vấn đề trọng tâm: ${selectedProblemTitle}` : '',
        ...analysisLines.map((line) => `${isHcmcDiscussion ? 'Chốt nguyên nhân' : 'Chốt phân tích'}: ${line}`),
        ...(selectedIdeaSummaries.length ? selectedIdeaSummaries.map((idea) => `${isHcmcDiscussion ? 'Chọn hành vi chuẩn' : 'Chọn giải pháp'}: ${idea.title}`) : selectedSolutionTitle ? [`${isHcmcDiscussion ? 'Chọn hành vi chuẩn' : 'Chọn giải pháp'}: ${selectedSolutionTitle}`] : []),
        ...planLines.map((line) => `${isHcmcDiscussion ? 'Chốt kế hoạch 30 ngày' : 'Chốt kế hoạch'}: ${line}`),
      ]),
      executionCommitments: compactLines(planLines.length ? planLines : [selectedSolutionTitle ? `Triển khai giải pháp: ${selectedSolutionTitle}` : '']),
      risksToMonitor: compactLines([
        'Theo dõi mức độ phối hợp, nguồn lực thực tế và thời hạn thực hiện sau khi triển khai.',
      ]),
      nextAction: autoPlans[0]
        ? compactLines([
          autoPlans[0].tasks ? `Bắt đầu thực hiện: ${String(autoPlans[0].tasks)}` : '',
          autoPlans[0].timeline ? `Mốc theo dõi: ${String(autoPlans[0].timeline)}` : '',
        ])
        : selectedSolutionTitle ? `Phân công người phụ trách triển khai giải pháp: ${selectedSolutionTitle}` : '',
      retrospectiveNote: '',
    };
    const finalForm: DraftMap = {
      ...autoFinalDraft,
      ...Object.fromEntries(Object.entries(existingSummary).filter(([, value]) => String(value || '').trim()).map(([key, value]) => [key, String(value || '')])),
      ...drafts,
    };

    async function submitFinal() {
      const targetStep = stepByNumber.get(6);
      if (!targetStep?.id) return;
      if (isSessionCompleted) return;
      setSuccessMessage('');
      if (isFinalLocked) {
        await runAction(() => submitActionGuardRef.current.run(`final-session-recovery:${targetStep.id}`, async () => {
          await sessionStepMutation.mutateAsync({ step: 6, status: 'completed' });
          setSuccessMessage('Bài đã được gửi cho giảng viên. Nhóm sẽ không chỉnh sửa được nữa');
        }));
        return;
      }
      const payload = {
        ...buildFinalReportPayload(finalForm, currentMemberName),
        resultSnapshot: {
          version: 1,
          selectedProblemTitle,
          selectedAnalyses,
          selectedIdeas: selectedIdeaSummaries.map((idea) => ({
            id: idea.id,
            title: idea.title,
            description: idea.description,
            score: idea.score,
            feedbackCount: idea.feedback.length,
          })),
          selectedSolutionTitle,
          plans: autoPlans,
          memberCommitments: finalContributions.map((item) => parseContributionContent(item).payload),
          joinedParticipantIds: joinedMembers.map((member) => member.id),
          notJoinedParticipantIds: notJoinedMembers.map((member) => member.id),
          generatedAt: new Date().toISOString(),
        },
        memberCommitments: finalContributions.map((item) => parseContributionContent(item).payload),
        submissionStatus: 'submitted',
        finalLocked: true,
        finalizedAt: new Date().toISOString(),
        finalizedByParticipantId: currentParticipant?.id || null,
        finalizedByName: currentMemberName,
      };
      await runAction(() => submitActionGuardRef.current.run(`final-submit:${targetStep.id}`, async () => {
        await summaryMutation.mutateAsync({ stepId: targetStep.id, summaryData: payload, status: 'completed' });
        await sessionStepMutation.mutateAsync({ step: 6, status: 'completed' });
        setSuccessMessage('Bài đã được gửi cho giảng viên. Nhóm sẽ không chỉnh sửa được nữa');
      }));
    }

    return renderShell(
      <section className="vdiscussion-presentation">
        <header className="vdiscussion-presentation-head">
          <h2>BÀI TRÌNH BÀY CỦA NHÓM</h2>
          <span>B1 → B4</span>
        </header>
        {successMessage || isFinalLocked ? (
          <div className="notice success vdiscussion-final-submit-notice">
            {successMessage || 'Bài đã được gửi cho giảng viên. Nhóm sẽ không chỉnh sửa được nữa'}
          </div>
        ) : null}

        <div className="vdiscussion-presentation-layout">
          <div className="vdiscussion-presentation-main">
            {selectedProblemTitle ? (
              <div className="vdiscussion-summary-topic-chip">
                <strong>Chủ đề:</strong>
                <span>{selectedProblemTitle}</span>
              </div>
            ) : null}

            <article className="vdiscussion-summary-card">
              <div className="vdiscussion-summary-title">
                <span className="is-b1">B1</span>
                <div>
                  <h3>Vấn đề đã xác định</h3>
                  <em>{selectedProblemTitle ? '1 dòng dữ liệu' : 'Chưa có dữ liệu'}</em>
                </div>
              </div>
              <div className="vdiscussion-summary-table is-two vdiscussion-summary-field-table">
                <strong>Nội dung</strong>
                <strong>Chi tiết</strong>
                <b>Vấn đề trọng tâm</b>
                <p>{selectedProblemTitle || 'Chưa chốt vấn đề trọng tâm.'}</p>
              </div>
            </article>

            <article className="vdiscussion-summary-card">
              <div className="vdiscussion-summary-title">
                <span className="is-b2">B2</span>
                <div>
                  <h3>{isHcmcDiscussion ? 'Nguyên nhân khiến khách hàng không hài lòng' : 'Hiện trạng & nguyên nhân chính'}</h3>
                  <em>{selectedAnalyses.length} dòng đã chốt</em>
                </div>
              </div>
              <div className="vdiscussion-summary-stack">
                {selectedAnalyses.length ? selectedAnalyses.map((item, index) => (
                  <div className="vdiscussion-summary-table is-two vdiscussion-summary-field-table" key={`analysis-${index}`}>
                    <strong>Nội dung</strong>
                    <strong>Chi tiết</strong>
                    {!isHcmcDiscussion ? (
                      <>
                        <b>Tồn tại / Hạn chế</b>
                        <p>{String(item.text || item.title || '') || '—'}</p>
                      </>
                    ) : null}
                    <b>{isHcmcDiscussion ? 'Nguyên nhân' : 'Nguyên nhân gốc rễ'}</b>
                    <p>{String(item.rootCause || item.why || item.description || '') || '—'}</p>
                  </div>
                )) : (
                  <div className="vdiscussion-summary-table is-two vdiscussion-summary-field-table">
                    <strong>Nội dung</strong>
                    <strong>Chi tiết</strong>
                    <b>{isHcmcDiscussion ? 'Nguyên nhân' : 'Tồn tại / Hạn chế'}</b>
                    <p>{isHcmcDiscussion ? 'Chưa có nguyên nhân được chốt.' : 'Chưa có phân tích được chốt.'}</p>
                    {!isHcmcDiscussion ? (
                      <>
                        <b>Nguyên nhân gốc rễ</b>
                        <p>—</p>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </article>

            <article className="vdiscussion-summary-card">
              <div className="vdiscussion-summary-title">
                <span className="is-b3">B3</span>
                <div>
                  <h3>{isHcmcDiscussion ? 'Hành vi chuẩn & câu then chốt' : 'Giải pháp ưu tiên'}</h3>
                  <em>{selectedIdeaSummaries.length || (selectedSolutionTitle ? 1 : 0)} {isHcmcDiscussion ? 'hành vi' : 'giải pháp'}</em>
                </div>
              </div>
              {selectedIdeaSummaries.length ? (
                <div className="vdiscussion-summary-stack">
                  {selectedIdeaSummaries.map((idea, index) => (
                    <div className="vdiscussion-summary-table is-two vdiscussion-summary-field-table vdiscussion-summary-idea-table" key={idea.id || `${idea.title}-${index}`}>
                      <strong>Nội dung</strong>
                      <strong>Chi tiết</strong>
                      <b>{isHcmcDiscussion ? 'Hành vi chuẩn' : 'Giải pháp'}</b>
                      <p>{index + 1}. {idea.title || '—'}</p>
                      <b>{isHcmcDiscussion ? 'Câu nói then chốt' : 'Mô tả'}</b>
                      <p>{idea.description || '—'}</p>
                      <b>Điểm đánh giá</b>
                      <p>{idea.reviews.length ? renderStarRating(idea.score, idea.reviews.length) : 'Chưa có đánh giá'}</p>
                      <b>Phản hồi / Bổ sung</b>
                      <p>{idea.feedback.length ? idea.feedback.join('; ') : 'Chưa có phản hồi bổ sung.'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="vdiscussion-summary-table is-two vdiscussion-summary-field-table">
                  <strong>Nội dung</strong>
                  <strong>Chi tiết</strong>
                  <b>{isHcmcDiscussion ? 'Hành vi chuẩn được chọn' : 'Giải pháp được chọn'}</b>
                  <p>{selectedSolutionTitle || (isHcmcDiscussion ? 'Chưa chốt hành vi chuẩn.' : 'Chưa chốt giải pháp.')}</p>
                  <b>Điểm đánh giá</b>
                  <p>Chưa có đánh giá</p>
                  <b>Phản hồi / Bổ sung</b>
                  <p>Chưa có phản hồi bổ sung.</p>
                </div>
              )}
            </article>

            <article className="vdiscussion-summary-card">
              <div className="vdiscussion-summary-title">
                <span className="is-b4">B4</span>
                <div>
                  <h3>{isHcmcDiscussion ? 'Kế hoạch 30 ngày đã duyệt' : 'Kế hoạch hành động đã duyệt'}</h3>
                  <em>{autoPlans.length} dòng kế hoạch</em>
                </div>
              </div>
              <div className="vdiscussion-summary-plan-table-wrap">
                <table className="vdiscussion-summary-plan-table">
                  <thead>
                    <tr>{summaryPlanFields.map((field) => <th key={field.key}>{field.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {autoPlans.length ? autoPlans.map((plan, index) => (
                      <tr key={`plan-${index}`}>
                        {summaryPlanFields.map((field) => <td key={`${index}-${field.key}`}>{String(plan[field.key] || '') || '—'}</td>)}
                      </tr>
                    )) : (
                      <tr>{summaryPlanFields.map((field) => <td key={`empty-${field.key}`}>—</td>)}</tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="vdiscussion-presentation-finish">
                {isSessionCompleted ? (
                  <span className="vdiscussion-final-locked-text">Bài đã được gửi cho giảng viên. Nhóm sẽ không chỉnh sửa được nữa</span>
                ) : isFinalLocked ? (
                  <span className="vdiscussion-final-locked-text">Báo cáo đã lưu. Nhóm trưởng cần hoàn tất trạng thái gửi cho giảng viên.</span>
                ) : (
                  <span>Nút này sẽ lưu nội dung đã chốt vào hệ thống và hiển thị ở màn hình giảng viên.</span>
                )}
                <div className="vdiscussion-step-actions">
                  {renderReviewPreviousButton()}
                  {canLead && !isSessionCompleted ? (
                    <button type="button" className="btn btn-success" onClick={() => void submitFinal()} disabled={summaryMutation.isPending || sessionStepMutation.isPending}>
                      <Check size={15} /> {summaryMutation.isPending || sessionStepMutation.isPending ? 'Đang nộp...' : isFinalLocked ? 'Hoàn tất gửi' : 'Hoàn thành'}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          </div>

          <aside className="vdiscussion-presentation-side">
            <section>
              <h3>THAM GIA NHÓM</h3>
              {joinedMembers.length ? joinedMembers.map((member) => (
                <p key={member.id}>{member.fullName} √ Tham gia</p>
              )) : <p>Chưa có thành viên vào phiên.</p>}
              {notJoinedMembers.length ? (
                <div className="vdiscussion-not-joined-list">
                  {notJoinedMembers.map((member) => <span key={member.id}>{member.fullName} - Chưa tham gia</span>)}
                </div>
              ) : null}
            </section>
            <section>
              <h3>HOẠT ĐỘNG</h3>
              {[selectedProblemTitle, ...analysisLines, ...ideaLines, ...planLines].filter(Boolean).map((line, index) => (
                <p key={`${line}-${index}`}>{line}</p>
              ))}
            </section>
          </aside>
        </div>
      </section>,
    );
  }

  function renderCommentForm(step: number, parentId: string, placeholder: string) {
    const key = `comment-${parentId}`;
    return (
      <form className="vdiscussion-review-box" onSubmit={(event) => {
        event.preventDefault();
        const text = drafts[key]?.trim() || '';
        if (!text) return;
        setDraft(key, '');
        setActiveCommentTarget(null);
        void saveContributionOptimistic(step, 'comment', { text, responseType: 'support' }, parentId).catch(() => {
          setDraft(key, text);
          setActiveCommentTarget(null);
        });
      }}>
        <input value={drafts[key] || ''} onChange={(event) => setDraft(key, event.target.value)} placeholder={placeholder} />
        <button className="btn btn-ghost btn-small" type="submit" disabled={isContributionSaving || !drafts[key]?.trim()}>
          {isContributionSaving ? 'Đang gửi...' : 'Gửi'}
        </button>
      </form>
    );
  }

  if (stepReadiness === 'loading') {
    return (
      <div className="vdiscussion-page">
        <div className="vdiscussion-empty">Đang tải phiên thảo luận...</div>
      </div>
    );
  }

  if (stepReadiness === 'missing-session') {
    return (
      <div className="vdiscussion-page">
        <div className="vdiscussion-empty">Không tìm thấy phiên thảo luận.</div>
      </div>
    );
  }

  if (stepReadiness === 'missing-step' || !activeStep) {
    return (
      <div className="vdiscussion-page">
        <div className="vdiscussion-empty">Không tìm thấy bước thảo luận.</div>
      </div>
    );
  }

  if (isOverviewMode) return renderSessionOverview();

  if (usesLeaderVote && activeStepNumber === 1 && (!leaderParticipant || !hasAcknowledgedLeaderStart)) {
    return renderLeaderVoteGate();
  }

  if (isCoaching3bDiscussion) {
    if (activeStepNumber === 1) return renderCoachingIntro();
    if (activeStepNumber === 2) return renderStep1();
    if (activeStepNumber === 3) return renderStep2();
    if (activeStepNumber === 4) return renderStep3();
    if (activeStepNumber === 5) return renderStep5();
    return renderStep6();
  }

  if (activeStepNumber === 1) return renderStep1();
  if (activeStepNumber === 2) return renderStep2();
  if (activeStepNumber === 3) return renderStep3();
  if (activeStepNumber === 4) return renderStep3();
  if (activeStepNumber === 5) return renderStep5();
  return renderStep6();
}
