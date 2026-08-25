import { supabase } from '@/lib/supabaseClient';

export type PlxGameSession = {
  gameId: string;
  participantId: string;
  authoritySessionId?: string | null;
  authorityTicket?: string | null;
  authorityExpiresAt?: string | null;
  classId?: string | null;
  activityId?: string | null;
  profileId?: string | null;
  authUserId?: string | null;
  email: string;
  playerName: string;
  className: string;
  groupName: string;
  savedAt: string;
};

export type PlxGameRunRow = {
  id: string;
  game_id: string;
  player_name: string;
  group_name: string;
  team_name: string;
  screen: string;
  cx_score: number;
  brand_pts: number;
  max_streak: number;
  total_score: number;
  values_json: Record<string, unknown>;
  answers_json: unknown[];
  rank_label: string;
  embedded: boolean;
  class_id?: string | null;
  activity_id?: string | null;
  profile_id?: string | null;
  auth_user_id?: string | null;
  class_name?: string | null;
  created_at: string;
};

export type PlxGameParticipantRow = {
  id: string;
  game_id: string;
  class_id?: string | null;
  activity_id?: string | null;
  class_name: string;
  participant_key: string;
  player_name: string;
  group_name: string;
  email: string;
  profile_id?: string | null;
  auth_user_id?: string | null;
  live_total_score?: number | null;
  live_progress?: number | null;
  live_score_updated_at?: string | null;
  joined_at: string;
  last_seen_at: string;
};

export type PlxLeaderboardEntry = {
  groupName: string;
  memberCount: number;
  totalScore: number;
  bestScore: number;
  latestRunAt: string;
  latestPlayerName: string;
};

export type PlxPersonalLeaderboardEntry = {
  playerName: string;
  groupName: string;
  runCount: number;
  totalScore: number;
  bestScore: number;
  latestRunAt: string;
  latestRankLabel: string;
};

export type PlxTouchpointAverageEntry = {
  tpId: string;
  tpLabel: string;
  tpTitle: string;
  runCount: number;
  avgCx: number;
  avgBrand: number;
  avgTotal: number;
  goodRate: number;
};

export type PlxTouchpointMetaEntry = {
  id: string;
  label: string;
  shortLabel: string;
  title: string;
};

export type PlxClassOverview = {
  memberCount: number;
  groupCount: number;
  averageTotalScore: number;
  averageCxScore: number;
  averageBrandPts: number;
  averageHeritage: number;
  averageDevoted: number;
  averagePioneering: number;
  topPlayerName: string;
  topPlayerScore: number;
  topGroupName: string;
  topGroupScore: number;
};

export type PlxClassComment = {
  heading: string;
  body: string;
  strengths: string[];
  focus: string;
};

const SESSION_STORAGE_KEY = 'vcontent.plx-session.v1';
const PARTICIPANT_STORAGE_KEY = 'vcontent.plx-participant.v1';

export type PlxGameScope = {
  classId?: string | null;
  activityId?: string | null;
};

type PlxAnswerRow = {
  tpId?: string;
  tpLabel?: string;
  tpTitle?: string;
  choiceId?: string;
  choiceText?: string;
  quality?: string;
  cx?: number | string;
  brand?: number | string;
  feedback?: string;
  timedOut?: boolean;
};

type NormalizedPlxAnswerRow = {
  tpId: string;
  tpLabel: string;
  tpTitle: string;
  choiceId: string;
  choiceText: string;
  quality: string;
  cx: number;
  brand: number;
  feedback: string;
  timedOut: boolean;
};

function createLocalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function publicGameMutationKey(gameId: string, action: string) {
  return `public-game:${gameId}:${action}:${createLocalId()}`;
}

async function callPublicGameAuthority<T>(payload: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const { data: authData } = await supabase?.auth.getSession() || { data: { session: null } };
  if (authData.session?.access_token) {
    headers.Authorization = `Bearer ${authData.session.access_token}`;
  }
  const response = await fetch('/api/public-game', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    throw new Error(String(body?.error || `Public game authority failed (${response.status}).`));
  }
  return body as T;
}

export function getOrCreatePlxParticipantId(gameId: string) {
  if (typeof window === 'undefined') return createLocalId();
  const key = `${PARTICIPANT_STORAGE_KEY}.${gameId}`;
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = createLocalId();
  window.localStorage.setItem(key, next);
  return next;
}

function getPlxSessionStorageKey(gameId: string, scope?: PlxGameScope | string | null) {
  const scopeId = typeof scope === 'string' ? scope : String(scope?.activityId || '').trim();
  return `${SESSION_STORAGE_KEY}.${gameId}${scopeId ? `.${scopeId}` : ''}`;
}

export function loadPlxGameSession(gameId: string, scope?: PlxGameScope | string | null) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getPlxSessionStorageKey(gameId, scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlxGameSession>;
    if (!parsed.email || !parsed.className || !parsed.groupName) return null;
    const email = String(parsed.email).trim();
    const playerName = String(parsed.playerName || email).trim() || email;
    const participantId = String(parsed.participantId || getOrCreatePlxParticipantId(gameId)).trim();
    return {
      gameId,
      participantId,
      authoritySessionId: typeof parsed.authoritySessionId === 'string' ? parsed.authoritySessionId : null,
      authorityTicket: typeof parsed.authorityTicket === 'string' ? parsed.authorityTicket : null,
      authorityExpiresAt: typeof parsed.authorityExpiresAt === 'string' ? parsed.authorityExpiresAt : null,
      classId: typeof parsed.classId === 'string' ? parsed.classId : null,
      activityId: typeof parsed.activityId === 'string' ? parsed.activityId : null,
      profileId: typeof parsed.profileId === 'string' ? parsed.profileId : null,
      authUserId: typeof parsed.authUserId === 'string' ? parsed.authUserId : null,
      email,
      playerName,
      className: String(parsed.className).trim(),
      groupName: String(parsed.groupName).trim(),
      savedAt: String(parsed.savedAt || new Date().toISOString()),
    } as PlxGameSession;
  } catch {
    return null;
  }
}

export async function authorizePlxGameSession(session: PlxGameSession) {
  const response = await callPublicGameAuthority<{
    session: {
      sessionId: string;
      ticket: string;
      expiresAt: string;
      gameId: string;
      classId?: string | null;
      activityId?: string | null;
      email: string;
      playerName: string;
      className: string;
      groupName: string;
      participantKey: string;
    };
  }>({
    action: 'start',
    gameId: session.gameId,
    classId: session.classId || '',
    activityId: session.activityId || '',
    email: session.email,
    playerName: session.playerName,
    className: session.className,
    groupName: session.groupName,
    participantId: session.participantId,
    idempotencyKey: publicGameMutationKey(session.gameId, 'start'),
  });
  const authority = response.session;
  const authorized: PlxGameSession = {
    ...session,
    gameId: authority.gameId,
    authoritySessionId: authority.sessionId,
    authorityTicket: authority.ticket,
    authorityExpiresAt: authority.expiresAt,
    classId: authority.classId || null,
    activityId: authority.activityId || null,
    email: authority.email,
    playerName: authority.playerName,
    className: authority.className,
    groupName: authority.groupName,
    participantId: String(authority.participantKey || '').replace(/^client:/, '') || session.participantId,
    savedAt: new Date().toISOString(),
  };
  savePlxGameSession(authorized, authorized.activityId || null);
  return authorized;
}

export function savePlxGameSession(session: PlxGameSession, scope?: PlxGameScope | string | null) {
  if (typeof window === 'undefined') return;
  const normalizedSession = {
    ...session,
    participantId: session.participantId || getOrCreatePlxParticipantId(session.gameId),
  };
  window.localStorage.setItem(getPlxSessionStorageKey(session.gameId, scope || session), JSON.stringify(normalizedSession));
}

export function clearPlxGameSession(gameId: string, scope?: PlxGameScope | string | null) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(getPlxSessionStorageKey(gameId, scope));
}

export async function savePlxGameRun(input: {
  gameId: string;
  classId?: string | null;
  activityId?: string | null;
  email?: string;
  profileId?: string | null;
  authUserId?: string | null;
  playerName: string;
  className?: string;
  groupName: string;
  cxScore: number;
  brandPts: number;
  maxStreak: number;
  rankLabel: string;
  values: Record<string, unknown>;
  answers: unknown[];
  embedded?: boolean;
  authoritySessionId?: string | null;
  authorityTicket?: string | null;
  idempotencyKey?: string;
}) {
  if (!input.authoritySessionId || !input.authorityTicket) {
    throw new Error('Public game session must be authorized before saving a result.');
  }
  const response = await callPublicGameAuthority<{ run: Record<string, unknown> }>({
    action: 'submit',
    sessionId: input.authoritySessionId,
    ticket: input.authorityTicket,
    gameId: input.gameId,
    cxScore: Math.max(0, Math.round(Number(input.cxScore) || 0)),
    brandPts: Math.max(0, Math.round(Number(input.brandPts) || 0)),
    maxStreak: Math.max(0, Math.round(Number(input.maxStreak) || 0)),
    rankLabel: String(input.rankLabel || ''),
    values: input.values || {},
    answers: input.answers || [],
    idempotencyKey: input.idempotencyKey || publicGameMutationKey(input.gameId, 'submit'),
  });
  const run = response.run || {};
  return {
    id: String(run.id || ''),
    game_id: String(run.gameId || input.gameId),
    player_name: String(run.playerName || input.playerName),
    group_name: String(run.groupName || input.groupName),
    team_name: '',
    screen: 'results',
    cx_score: Number(run.cxScore || 0),
    brand_pts: Number(run.brandPts || 0),
    max_streak: Math.max(0, Math.round(Number(input.maxStreak) || 0)),
    total_score: Number(run.totalScore || 0),
    values_json: input.values || {},
    answers_json: input.answers || [],
    rank_label: String(run.rankLabel || input.rankLabel || ''),
    embedded: true,
    class_id: run.classId ? String(run.classId) : null,
    activity_id: run.activityId ? String(run.activityId) : null,
    class_name: input.className || null,
    created_at: String(run.createdAt || new Date().toISOString()),
  } as PlxGameRunRow;
}

function getPlxParticipantKey(session: PlxGameSession) {
  const participantId = String(session.participantId || getOrCreatePlxParticipantId(session.gameId)).trim();
  return participantId ? `client:${participantId}` : '';
}

export async function upsertPlxGameParticipant(
  session: PlxGameSession,
  liveState?: { totalScore?: number | null; progress?: number | null },
) {
  if (!session.authoritySessionId || !session.authorityTicket) return null;
  const hasLiveScore = liveState && Number.isFinite(Number(liveState.totalScore));
  const hasLiveProgress = liveState && Number.isFinite(Number(liveState.progress));
  const response = await callPublicGameAuthority<{ participant: Record<string, unknown> }>({
    action: 'touch',
    sessionId: session.authoritySessionId,
    ticket: session.authorityTicket,
    gameId: session.gameId,
    liveTotalScore: hasLiveScore ? Math.max(0, Math.round(Number(liveState?.totalScore) || 0)) : null,
    liveProgress: hasLiveProgress ? Math.max(0, Math.round(Number(liveState?.progress) || 0)) : null,
  });
  const row = response.participant || {};
  return {
    id: String(row.id || ''),
    game_id: String(row.gameId || session.gameId),
    class_id: row.classId ? String(row.classId) : null,
    activity_id: row.activityId ? String(row.activityId) : null,
    class_name: session.className,
    participant_key: String(row.participantKey || getPlxParticipantKey(session)),
    player_name: String(row.playerName || session.playerName),
    group_name: String(row.groupName || session.groupName),
    email: '',
    live_total_score: row.liveTotalScore == null ? null : Number(row.liveTotalScore),
    live_progress: row.liveProgress == null ? null : Number(row.liveProgress),
    joined_at: String(row.lastSeenAt || new Date().toISOString()),
    last_seen_at: String(row.lastSeenAt || new Date().toISOString()),
  } as PlxGameParticipantRow;
}

export async function loadPlxGameLeaderboard(session: PlxGameSession) {
  if (!session.authoritySessionId || !session.authorityTicket) {
    return { runs: [] as PlxGameRunRow[], participants: [] as PlxGameParticipantRow[] };
  }
  const response = await callPublicGameAuthority<{
    runs: Array<Record<string, unknown>>;
    participants: Array<Record<string, unknown>>;
  }>({
    action: 'leaderboard',
    sessionId: session.authoritySessionId,
    ticket: session.authorityTicket,
    gameId: session.gameId,
  });
  const runs = (response.runs || []).map((row) => ({
    id: String(row.id || ''),
    game_id: String(row.gameId || session.gameId),
    player_name: String(row.playerName || ''),
    group_name: String(row.groupName || ''),
    team_name: '',
    screen: 'results',
    cx_score: Number(row.cxScore || 0),
    brand_pts: Number(row.brandPts || 0),
    max_streak: Number(row.maxStreak || 0),
    total_score: Number(row.totalScore || 0),
    values_json: {},
    answers_json: [],
    rank_label: String(row.rankLabel || ''),
    embedded: true,
    created_at: String(row.createdAt || ''),
  })) as PlxGameRunRow[];
  const participants = (response.participants || []).map((row) => ({
    id: String(row.id || ''),
    game_id: String(row.gameId || session.gameId),
    class_name: session.className,
    participant_key: String(row.participantKey || ''),
    player_name: String(row.playerName || ''),
    group_name: String(row.groupName || ''),
    email: '',
    live_total_score: row.liveTotalScore == null ? null : Number(row.liveTotalScore),
    live_progress: row.liveProgress == null ? null : Number(row.liveProgress),
    live_score_updated_at: row.liveScoreUpdatedAt ? String(row.liveScoreUpdatedAt) : null,
    joined_at: String(row.joinedAt || ''),
    last_seen_at: String(row.lastSeenAt || ''),
  })) as PlxGameParticipantRow[];
  return { runs, participants };
}

function mapAuthorityRuns(rows: Array<Record<string, unknown>>, gameId: string) {
  return (rows || []).map((row) => ({
    id: String(row.id || ''),
    game_id: String(row.gameId || gameId),
    player_name: String(row.playerName || ''),
    group_name: String(row.groupName || ''),
    team_name: '',
    screen: 'results',
    cx_score: Number(row.cxScore || 0),
    brand_pts: Number(row.brandPts || 0),
    max_streak: Number(row.maxStreak || 0),
    total_score: Number(row.totalScore || 0),
    values_json: {},
    answers_json: [],
    rank_label: String(row.rankLabel || ''),
    embedded: true,
    created_at: String(row.createdAt || ''),
  })) as PlxGameRunRow[];
}

function mapAuthorityParticipants(rows: Array<Record<string, unknown>>, gameId: string) {
  return (rows || []).map((row) => ({
    id: String(row.id || ''),
    game_id: String(row.gameId || gameId),
    class_name: '',
    participant_key: String(row.participantKey || ''),
    player_name: String(row.playerName || ''),
    group_name: String(row.groupName || ''),
    email: '',
    live_total_score: row.liveTotalScore == null ? null : Number(row.liveTotalScore),
    live_progress: row.liveProgress == null ? null : Number(row.liveProgress),
    live_score_updated_at: row.liveScoreUpdatedAt ? String(row.liveScoreUpdatedAt) : null,
    joined_at: String(row.joinedAt || ''),
    last_seen_at: String(row.lastSeenAt || ''),
  })) as PlxGameParticipantRow[];
}

export async function loadPlxGameAdminLeaderboard(gameId: string, scope?: PlxGameScope | null) {
  const response = await callPublicGameAuthority<{
    runs: Array<Record<string, unknown>>;
    participants: Array<Record<string, unknown>>;
  }>({
    action: 'adminLeaderboard',
    gameId,
    classId: scope?.classId || '',
    activityId: scope?.activityId || '',
  });
  return {
    runs: mapAuthorityRuns(response.runs, gameId),
    participants: mapAuthorityParticipants(response.participants, gameId),
  };
}

export async function listPlxGameRuns(gameId: string, scope?: PlxGameScope | null) {
  const snapshot = await loadPlxGameAdminLeaderboard(gameId, scope);
  return snapshot.runs;
}

export async function deletePlxGameRuns(gameId: string, scope?: PlxGameScope | null) {
  await callPublicGameAuthority({
    action: 'adminReset',
    target: 'runs',
    gameId,
    classId: scope?.classId || '',
    activityId: scope?.activityId || '',
  });
}

export async function deletePlxGameParticipants(gameId: string, scope?: PlxGameScope | null) {
  await callPublicGameAuthority({
    action: 'adminReset',
    target: 'participants',
    gameId,
    classId: scope?.classId || '',
    activityId: scope?.activityId || '',
  });
}

export function buildPlxLeaderboard(runs: PlxGameRunRow[]) {
  const latestRunByGroupPlayer = getLatestRunByGroupPlayer(runs);
  const byGroup = new Map<string, PlxLeaderboardEntry>();

  for (const run of latestRunByGroupPlayer.values()) {
    const groupName = run.group_name || 'Nhóm chưa đặt tên';
    const current = byGroup.get(groupName);
    const latestRunAt = run.created_at;
    const runScore = Number(run.total_score) || 0;
    const next: PlxLeaderboardEntry = current
      ? {
          groupName,
          memberCount: current.memberCount + 1,
          totalScore: current.totalScore + runScore,
          bestScore: Math.max(current.bestScore, runScore),
          latestRunAt: current.latestRunAt > latestRunAt ? current.latestRunAt : latestRunAt,
          latestPlayerName: current.latestRunAt > latestRunAt ? current.latestPlayerName : run.player_name || current.latestPlayerName,
        }
      : {
          groupName,
          memberCount: 1,
          totalScore: runScore,
          bestScore: runScore,
          latestRunAt,
          latestPlayerName: run.player_name || '-',
        };
    byGroup.set(groupName, next);
  }

  return Array.from(byGroup.values()).sort((a, b) => b.totalScore - a.totalScore || b.bestScore - a.bestScore || a.groupName.localeCompare(b.groupName, 'vi'));
}

export function buildPlxPersonalLeaderboard(runs: PlxGameRunRow[]) {
  const latestRunByPlayer = getLatestRunByPlayer(runs);
  const attemptsByPlayer = new Map<string, number>();
  const bestScoreByPlayer = new Map<string, number>();

  for (const run of runs) {
    const playerName = run.player_name || 'Người chơi chưa đặt tên';
    attemptsByPlayer.set(playerName, (attemptsByPlayer.get(playerName) || 0) + 1);
    const runScore = Number(run.total_score) || 0;
    bestScoreByPlayer.set(playerName, Math.max(bestScoreByPlayer.get(playerName) || 0, runScore));
  }

  const byPlayer = new Map<string, PlxPersonalLeaderboardEntry>();

  for (const [playerName, run] of latestRunByPlayer.entries()) {
    const groupName = run.group_name || 'Nhóm chưa đặt tên';
    const latestRunAt = run.created_at;
    const latestScore = Number(run.total_score) || 0;
    byPlayer.set(playerName, {
      playerName,
      groupName,
      runCount: attemptsByPlayer.get(playerName) || 1,
      totalScore: latestScore,
      bestScore: bestScoreByPlayer.get(playerName) || latestScore,
      latestRunAt,
      latestRankLabel: run.rank_label || '-',
    });
  }

  return Array.from(byPlayer.values()).sort(
    (a, b) =>
      b.totalScore - a.totalScore ||
      b.bestScore - a.bestScore ||
      b.runCount - a.runCount ||
      a.playerName.localeCompare(b.playerName, 'vi'),
  );
}

function getLatestRunByPlayer(runs: PlxGameRunRow[]) {
  const latestRunByPlayer = new Map<string, PlxGameRunRow>();
  for (const run of runs) {
    const playerName = run.player_name || 'Người chơi chưa đặt tên';
    const current = latestRunByPlayer.get(playerName);
    if (!current || String(current.created_at) <= String(run.created_at)) {
      latestRunByPlayer.set(playerName, run);
    }
  }
  return latestRunByPlayer;
}

function getLatestRunByGroupPlayer(runs: PlxGameRunRow[]) {
  const latestRunByGroupPlayer = new Map<string, PlxGameRunRow>();
  for (const run of runs) {
    const groupName = run.group_name || 'Nhóm chưa đặt tên';
    const playerName = run.player_name || 'Người chơi chưa đặt tên';
    const key = `${groupName}::${playerName}`;
    const current = latestRunByGroupPlayer.get(key);
    if (!current || String(current.created_at) <= String(run.created_at)) {
      latestRunByGroupPlayer.set(key, run);
    }
  }
  return latestRunByGroupPlayer;
}

function normalizeAnswers(answers: unknown): NormalizedPlxAnswerRow[] {
  if (!Array.isArray(answers)) return [];
  const rows: NormalizedPlxAnswerRow[] = [];
  for (const entry of answers) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as PlxAnswerRow;
    const tpId = row.tpId ? String(row.tpId) : '';
    if (!tpId) continue;
    rows.push({
      tpId,
      tpLabel: row.tpLabel ? String(row.tpLabel) : '',
      tpTitle: row.tpTitle ? String(row.tpTitle) : '',
      choiceId: row.choiceId ? String(row.choiceId) : '',
      choiceText: row.choiceText ? String(row.choiceText) : '',
      quality: row.quality ? String(row.quality) : '',
      cx: Number(row.cx || 0),
      brand: Number(row.brand || 0),
      feedback: row.feedback ? String(row.feedback) : '',
      timedOut: Boolean(row.timedOut),
    });
  }
  return rows;
}

export function buildPlxClassOverview(runs: PlxGameRunRow[]): PlxClassOverview {
  const latestRuns = Array.from(getLatestRunByPlayer(runs).values());
  const latestGroupRuns = Array.from(getLatestRunByGroupPlayer(runs).values());
  const memberCount = latestRuns.length;
  const groupCount = new Set(latestRuns.map((run) => run.group_name || 'Nhóm chưa đặt tên')).size;

  const sums = latestRuns.reduce(
    (acc, run) => {
      acc.total += Number(run.total_score) || 0;
      acc.cx += Number(run.cx_score) || 0;
      acc.brand += Number(run.brand_pts) || 0;
      const values = (run.values_json || {}) as Record<string, unknown>;
      acc.heritage += Number(values.heritage || 0);
      acc.devoted += Number(values.devoted || 0);
      acc.pioneering += Number(values.pioneering || 0);
      return acc;
    },
    { total: 0, cx: 0, brand: 0, heritage: 0, devoted: 0, pioneering: 0 },
  );

  const topPlayer = latestRuns
    .slice()
    .sort((a, b) => (Number(b.total_score) || 0) - (Number(a.total_score) || 0) || String(b.created_at).localeCompare(String(a.created_at)))[0];
  const topGroup = latestGroupRuns
    .slice()
    .sort((a, b) => (Number(b.total_score) || 0) - (Number(a.total_score) || 0) || String(b.created_at).localeCompare(String(a.created_at)))[0];

  const safeDivide = (value: number) => (memberCount > 0 ? value / memberCount : 0);

  return {
    memberCount,
    groupCount,
    averageTotalScore: safeDivide(sums.total),
    averageCxScore: safeDivide(sums.cx),
    averageBrandPts: safeDivide(sums.brand),
    averageHeritage: safeDivide(sums.heritage),
    averageDevoted: safeDivide(sums.devoted),
    averagePioneering: safeDivide(sums.pioneering),
    topPlayerName: topPlayer?.player_name || '-',
    topPlayerScore: Number(topPlayer?.total_score) || 0,
    topGroupName: topGroup?.group_name || '-',
    topGroupScore: Number(topGroup?.total_score) || 0,
  };
}

export function buildPlxTouchpointAverages(runs: PlxGameRunRow[], touchpoints: PlxTouchpointMetaEntry[] = []) {
  const latestRuns = Array.from(getLatestRunByPlayer(runs).values());
  const byTouchpoint = new Map<
    string,
    {
      tpId: string;
      tpLabel: string;
      tpTitle: string;
      runCount: number;
      cxSum: number;
      brandSum: number;
      goodCount: number;
    }
  >();

  for (const run of latestRuns) {
    for (const answer of normalizeAnswers(run.answers_json)) {
      const key = answer.tpId;
      const current = byTouchpoint.get(key) || {
        tpId: key,
        tpLabel: answer.tpLabel || key,
        tpTitle: answer.tpTitle || answer.tpLabel || key,
        runCount: 0,
        cxSum: 0,
        brandSum: 0,
        goodCount: 0,
      };

      current.runCount += 1;
      current.cxSum += Number(answer.cx) || 0;
      current.brandSum += Number(answer.brand) || 0;
      if (String(answer.quality || '') === 'good') current.goodCount += 1;
      byTouchpoint.set(key, current);
    }
  }

  const sourceItems = touchpoints.length
    ? touchpoints.map((tp) => {
        const current = byTouchpoint.get(String(tp.id));
        return {
          tpId: String(tp.id),
          tpLabel: tp.label || tp.shortLabel || String(tp.id),
          tpTitle: tp.title || tp.label || tp.shortLabel || String(tp.id),
          runCount: current?.runCount || 0,
          avgCx: current && current.runCount > 0 ? current.cxSum / current.runCount : 0,
          avgBrand: current && current.runCount > 0 ? current.brandSum / current.runCount : 0,
          avgTotal: current && current.runCount > 0 ? (current.cxSum + current.brandSum) / current.runCount : 0,
          goodRate: current && current.runCount > 0 ? current.goodCount / current.runCount : 0,
        };
      })
    : Array.from(byTouchpoint.values()).map((item) => ({
        tpId: item.tpId,
        tpLabel: item.tpLabel,
        tpTitle: item.tpTitle,
        runCount: item.runCount,
        avgCx: item.runCount > 0 ? item.cxSum / item.runCount : 0,
        avgBrand: item.runCount > 0 ? item.brandSum / item.runCount : 0,
        avgTotal: item.runCount > 0 ? (item.cxSum + item.brandSum) / item.runCount : 0,
        goodRate: item.runCount > 0 ? item.goodCount / item.runCount : 0,
      }));

  return sourceItems
    .sort((a, b) => {
      const aNum = Number(String(a.tpId).replace(/[^\d.]/g, ''));
      const bNum = Number(String(b.tpId).replace(/[^\d.]/g, ''));
      if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum - bNum;
      return String(a.tpId).localeCompare(String(b.tpId), 'vi');
    });
}

export function buildPlxClassComment(summary: PlxClassOverview, touchpoints: PlxTouchpointAverageEntry[]): PlxClassComment {
  const valueEntries = [
    { key: 'Di sản', value: summary.averageHeritage },
    { key: 'Tận tâm', value: summary.averageDevoted },
    { key: 'Tiên phong', value: summary.averagePioneering },
  ].sort((a, b) => b.value - a.value);
  const strongest = valueEntries[0];
  const weakest = valueEntries[valueEntries.length - 1];
  const meaningfulTouchpoints = touchpoints.filter((item) => item.runCount > 0);
  const weakestTouchpoint = meaningfulTouchpoints.slice().sort((a, b) => a.avgTotal - b.avgTotal)[0];
  const scoreBand =
    summary.averageTotalScore >= 500 ? 'rất tốt' : summary.averageTotalScore >= 380 ? 'khá ổn' : summary.averageTotalScore >= 260 ? 'còn dư địa' : 'cần củng cố';

  const body =
    `Mặt bằng lớp đang ở mức ${scoreBand} với điểm trung bình ${Math.round(summary.averageTotalScore)} điểm. ` +
    `Nổi bật nhất là ${strongest.key.toLowerCase()} (${strongest.value.toFixed(1)}), trong khi ${weakest.key.toLowerCase()} (${weakest.value.toFixed(1)}) ` +
    `là vùng cần kéo lên để cân bằng hành vi.`;

  const focus = weakestTouchpoint
    ? `Điểm chạm cần ưu tiên: ${weakestTouchpoint.tpTitle} với mức trung bình ${Math.round(weakestTouchpoint.avgTotal)} điểm.`
    : 'Chưa đủ dữ liệu để xác định điểm chạm cần ưu tiên.';

  const strengths = [
    `Lớp hiện có ${summary.memberCount} học viên thuộc ${summary.groupCount} nhóm.`,
    `Top cá nhân đang đạt ${Math.round(summary.topPlayerScore)} điểm (${summary.topPlayerName}).`,
    `Top nhóm đang đạt ${Math.round(summary.topGroupScore)} điểm (${summary.topGroupName}).`,
  ];

  return {
    heading: `${scoreBand.charAt(0).toUpperCase()}${scoreBand.slice(1)} về mặt bằng lớp`,
    body,
    strengths,
    focus,
  };
}
