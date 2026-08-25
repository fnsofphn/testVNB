import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Card, SectionHeader } from '@/components/ui/Primitives';
import { useAuth } from '@/contexts/AuthContext';
import { EvnSpcGameEmbed } from '@/components/game/EvnSpcGameEmbed';
import { getGameCatalogEntry, loadGameCatalog } from '@/lib/gameCatalog';
import { suniTrainingApi, type SuniTrainingClassActivity } from '@/lib/suni';
import {
  buildPlxClassComment,
  buildPlxClassOverview,
  buildPlxLeaderboard,
  buildPlxPersonalLeaderboard,
  buildPlxTouchpointAverages,
  authorizePlxGameSession,
  getOrCreatePlxParticipantId,
  type PlxTouchpointMetaEntry,
  loadPlxGameAdminLeaderboard,
  loadPlxGameLeaderboard,
  loadPlxGameSession,
  savePlxGameRun,
  savePlxGameSession,
  upsertPlxGameParticipant,
  type PlxGameSession,
  type PlxGameParticipantRow,
  type PlxGameRunRow,
} from '@/lib/plxGame';
import { supabase } from '@/lib/supabaseClient';
import { buildEvnspcTnkhLeaderboard } from '@/features/games/evnspcTnkhLeaderboard';
import './PublicGamePage.css';

const PLX_DEFAULT_GAME_ID = 'plx-01';
const GAME_RANK_OPERATOR_ROLES = new Set(['admin', 'content_manager', 'production_manager', 'training_ops_admin']);
const PLX_PUBLIC_HTML_BY_ID: Record<string, string> = {
  'plx-01': '/games/plx-01/index.html?ui=20260514-active-rank&cup=20260515-top1',
  'plx-01-ca-nhan': '/games/plx-01-ca-nhan/index.html?ui=20260514-active-rank&cup=20260515-top1&fb=20260610-mobile',
  'plx-02': '/games/plx-02/index.html?ui=20260514-rank-card&fb=20260610-mobile',
  'plx-03': '/games/plx-03/index.html?ui=20260514-active-rank&fb=20260610-mobile-logo',
};

type PlxResultAnswer = {
  tpId?: string;
  tpLabel?: string;
  tpTitle?: string;
  choiceId?: string;
  choiceText?: string;
  quality?: string;
  cx?: number;
  brand?: number;
  feedback?: string;
  timedOut?: boolean;
  responseSeconds?: number;
};

type GenericGameResultPayload = {
  playerName?: string;
  groupName?: string;
  score?: number;
  maxScore?: number;
  rankLabel?: string;
  maxStreak?: number;
  values?: Record<string, unknown>;
  answers?: unknown[];
  meta?: Record<string, unknown>;
};

type GenericGameLeaderboardRow = {
  playerName: string;
  groupName: string;
  runCount: number;
  totalScore: number;
  bestScore: number;
  latestRankLabel: string;
  values?: Record<string, unknown>;
};

type LiveLeaderboardRow = {
  playerName: string;
  groupName: string;
  runCount: number;
  totalScore: number;
  bestScore: number;
  latestRankLabel: string;
  progress: number | null;
  isLive: boolean;
  recordedAt: string;
  attemptStartedAt: string | null;
  attemptFinishedAt: string | null;
  attemptDurationMs: number | null;
};

type PlxGameWindow = Window &
  Partial<{
    showRanking: () => void;
    render_game_to_text: () => string;
    VContentGameLeaderboard: GenericGameLeaderboardRow[];
    VContentGame: {
      setLeaderboard?: (rows: GenericGameLeaderboardRow[]) => void;
    };
    PLXPlayerChoiceStats: Record<string, PlxChoiceStat>;
    PLXPlayerRank: PlxPlayerRank;
    PLXLeaderboardScores: number[];
    PLXGame: {
      getTouchpointsMeta?: () => PlxTouchpointMetaEntry[];
      showRanking?: () => void;
      setPlayerRank?: (rank: PlxPlayerRank) => void;
      getLiveScoreData?: () => {
        totalScore?: number;
        progress?: number;
      };
      getResultData?: () => {
        cxScore?: number;
        brandPts?: number;
        maxStreak?: number;
        rankLabel?: string;
        values?: { heritage?: number; devoted?: number; pioneering?: number };
        answers?: PlxResultAnswer[];
      };
    };
  }>;

type PlxChoiceStat = {
  total: number;
  counts: Record<string, number>;
};

type PlxPlayerRank = {
  rank: number | null;
  total: number;
  scores?: number[];
};

type PlxStudentProfile = {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  full_name: string;
  role: string;
  active: boolean;
  student_class: string | null;
  student_group: string | null;
  student_code: string | null;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('vi-VN').format(value);
}

function parseNumber(text: string | null | undefined) {
  const value = Number(String(text || '0').replace(/[^\d-]/g, ''));
  return Number.isFinite(value) ? value : 0;
}

function getPlxSessionParticipantKey(session: PlxGameSession | null) {
  const participantId = String(session?.participantId || '').trim();
  return participantId ? `client:${participantId}` : '';
}

function getPlxLeaderboardPlayerKey(playerName: string, groupName: string) {
  return `${String(playerName || '').trim()}::${String(groupName || '').trim()}`;
}

function getRecentParticipantLiveScore(participant: PlxGameParticipantRow) {
  const updatedAt = participant.live_score_updated_at ? Date.parse(participant.live_score_updated_at) : 0;
  if (!updatedAt || Date.now() - updatedAt > 45000) return null;
  const score = Number(participant.live_total_score);
  return Number.isFinite(score) ? Math.max(0, Math.round(score)) : null;
}

function isRecentPlxParticipant(participant: PlxGameParticipantRow) {
  const lastSeenAt = participant.last_seen_at ? Date.parse(participant.last_seen_at) : 0;
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt <= 45000;
}

function getTimestampValue(value?: string | null) {
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Number.MAX_SAFE_INTEGER;
}

function formatEvnspcAttemptRange(startedAt?: string | null, finishedAt?: string | null) {
  if (!startedAt || !finishedAt) return 'Khoảng làm: Chưa ghi nhận';
  const start = new Date(startedAt);
  const finish = new Date(finishedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime())) return 'Khoảng làm: Chưa ghi nhận';
  const sameDate = start.toLocaleDateString('vi-VN') === finish.toLocaleDateString('vi-VN');
  const timeFormatter = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (sameDate) return `Khoảng làm: ${timeFormatter.format(start)} – ${timeFormatter.format(finish)}`;
  const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Khoảng làm: ${dateTimeFormatter.format(start)} – ${dateTimeFormatter.format(finish)}`;
}

function formatEvnspcAttemptDuration(durationMs?: number | null) {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) return 'Thời lượng: Chưa ghi nhận';
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    hours ? `${hours} giờ` : '',
    minutes ? `${minutes} phút` : '',
    `${seconds} giây`,
  ].filter(Boolean);
  return `Thời lượng: ${parts.join(' ')}`;
}

function buildPlxChoiceStats(runs: PlxGameRunRow[]) {
  const latestRunByPlayer = new Map<string, PlxGameRunRow>();

  for (const run of runs) {
    const playerKey = String(run.player_name || run.team_name || run.id || 'unknown').trim() || 'unknown';
    const current = latestRunByPlayer.get(playerKey);
    if (!current || String(current.created_at) <= String(run.created_at)) {
      latestRunByPlayer.set(playerKey, run);
    }
  }

  const stats: Record<string, PlxChoiceStat> = {};
  for (const run of latestRunByPlayer.values()) {
    if (!Array.isArray(run.answers_json)) continue;

    for (const entry of run.answers_json) {
      if (!entry || typeof entry !== 'object') continue;
      const answer = entry as PlxResultAnswer;
      if (answer.timedOut) continue;

      const tpId = String(answer.tpId || '').trim();
      const choiceId = String(answer.choiceId || '').trim().toUpperCase();
      if (!tpId || !choiceId) continue;

      const current = stats[tpId] || { total: 0, counts: {} };
      current.total += 1;
      current.counts[choiceId] = (current.counts[choiceId] || 0) + 1;
      stats[tpId] = current;
    }
  }

  return stats;
}

async function loadPlxStudentProfile(authUserId: string) {
  if (!supabase) throw new Error('Supabase client is not configured.');
  const { data, error } = await supabase
    .from('vcontent_profiles')
    .select('id,auth_user_id,email,full_name,role,active,student_class,student_group,student_code')
    .eq('auth_user_id', authUserId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return data as PlxStudentProfile | null;
}

function buildPlxSessionFromStudent(gameId: string, student: PlxStudentProfile, authUserId?: string | null): PlxGameSession {
  const email = String(student.email || '').trim();
  const playerName = String(student.full_name || email).trim() || email;
  return {
    gameId,
    participantId: getOrCreatePlxParticipantId(gameId),
    profileId: student.id,
    authUserId: authUserId || student.auth_user_id || null,
    email,
    playerName,
    className: String(student.student_class || '').trim(),
    groupName: String(student.student_group || '').trim(),
    savedAt: new Date().toISOString(),
  };
}

function loadAuthenticatedPlxGameSession(gameId: string, activityId?: string | null) {
  const stored = loadPlxGameSession(gameId, activityId || null);
  const expiresAt = Date.parse(String(stored?.authorityExpiresAt || ''));
  return stored?.authUserId
    && stored.authoritySessionId
    && stored.authorityTicket
    && Number.isFinite(expiresAt)
    && expiresAt > Date.now()
    ? stored
    : null;
}

function readGameResult(doc: Document, allowRankScreen = false) {
  const replayButton = doc.getElementById('btn-replay');
  const resultScreen = (doc.getElementById('screen-results') || replayButton?.closest('.screen')) as HTMLElement | null;
  const isActive = Boolean(resultScreen?.classList.contains('active'));
  const viewWindow = doc.defaultView as PlxGameWindow | null;
  const structuredResult = viewWindow?.PLXGame?.getResultData?.();

  if (!isActive && !allowRankScreen) return null;
  if (!isActive && allowRankScreen) {
    const hasStructuredResult =
      Boolean(structuredResult?.rankLabel) || Boolean(structuredResult?.answers?.length) || Boolean(structuredResult?.cxScore) || Boolean(structuredResult?.brandPts);
    if (!hasStructuredResult) return null;
  }

  const cxScore = parseNumber(String(structuredResult?.cxScore ?? doc.getElementById('r-cx')?.textContent));
  const brandPts = parseNumber(String(structuredResult?.brandPts ?? doc.getElementById('r-brand')?.textContent));
  const maxStreak = parseNumber(String(structuredResult?.maxStreak ?? doc.getElementById('r-streak')?.textContent));
  const rankLabel =
    String(structuredResult?.rankLabel || doc.getElementById('r-rank')?.textContent || '').trim() || 'Cần cải thiện';
  const values = {
    heritage: parseNumber(String(structuredResult?.values?.heritage ?? doc.getElementById('is-heritage')?.textContent)),
    devoted: parseNumber(String(structuredResult?.values?.devoted ?? doc.getElementById('is-devoted')?.textContent)),
    pioneering: parseNumber(
      String(structuredResult?.values?.pioneering ?? doc.getElementById('is-pioneering')?.textContent),
    ),
  };

  const reviewRows = structuredResult?.answers?.length
    ? structuredResult.answers.map((answer) => ({
        tpId: String(answer.tpId || ''),
        tpLabel: String(answer.tpLabel || ''),
        tpTitle: String(answer.tpTitle || ''),
        choiceId: String(answer.choiceId || ''),
        choiceText: String(answer.choiceText || ''),
        quality: String(answer.quality || ''),
        cx: Number(answer.cx || 0),
        brand: Number(answer.brand || 0),
        feedback: String(answer.feedback || ''),
        timedOut: Boolean(answer.timedOut),
        responseSeconds: Number(answer.responseSeconds || 0),
      }))
    : Array.from(doc.querySelectorAll('#tp-review .tpr')).map((node) => ({
        quality: node.classList.contains('good') ? 'good' : node.classList.contains('bad') ? 'bad' : 'mid',
        feedback: node.textContent?.trim() || '',
      }));

  return {
    cxScore,
    brandPts,
    maxStreak,
    rankLabel,
    values,
    answers: reviewRows,
  };
}

function LoginCard({
  gameId,
  individualMode = false,
  onLogin,
}: {
  gameId: string;
  individualMode?: boolean;
  onLogin: (session: PlxGameSession) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [className, setClassName] = useState('');
  const [groupName, setGroupName] = useState('Nhóm 1');
  const [loginError, setLoginError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const normalizedEmail = email.trim();
  const normalizedClassName = className.trim();

  return (
    <div className="plx-login-panel">
      <Card title="Đăng nhập học viên">
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!normalizedEmail || !normalizedClassName) return;
            const nextSession: PlxGameSession = {
              gameId,
              participantId: getOrCreatePlxParticipantId(gameId),
              email: normalizedEmail,
              playerName: playerName.trim() || normalizedEmail,
              className: normalizedClassName,
              groupName: individualMode ? 'Cá nhân' : groupName,
              savedAt: new Date().toISOString(),
            };
            setSubmitting(true);
            setLoginError('');
            try {
              await onLogin(nextSession);
            } catch (error) {
              setLoginError(error instanceof Error ? error.message : String(error));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div className="form-grid">
            <label className="full">
              <span>Email học viên *</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email đăng ký học tập"
              />
            </label>
            <label className="full">
              <span>Tên học viên</span>
              <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="Không nhập sẽ hiển thị email" />
            </label>
            <label className="full">
              <span>Lớp *</span>
              <input required value={className} onChange={(event) => setClassName(event.target.value)} placeholder="Nhập lớp" />
            </label>
            {!individualMode ? (
              <label className="full">
                <span>Nhóm</span>
                <select value={groupName} onChange={(event) => setGroupName(event.target.value)}>
                  <option>Nhóm 1</option>
                  <option>Nhóm 2</option>
                  <option>Nhóm 3</option>
                  <option>Nhóm 4</option>
                </select>
              </label>
            ) : null}
          </div>
          <div className="action-row">
            <button type="submit" className="btn btn-danger" disabled={!normalizedEmail || !normalizedClassName || submitting}>
              Vào game
            </button>
          </div>
          {loginError ? <div className="notice danger">{loginError}</div> : null}
        </form>
      </Card>
    </div>
  );
}

function StudentLoginCard({
  onLogin,
  onSignOut,
  currentAccountLabel,
}: {
  gameId: string;
  onLogin: (email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  currentAccountLabel?: string | null;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const normalizedEmail = email.trim();

  return (
    <div className="plx-login-panel">
      <Card title="Đăng nhập học viên">
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (!normalizedEmail || !password || submitting) return;
            setSubmitting(true);
            setFeedback('');
            onLogin(normalizedEmail, password)
              .catch((error) => setFeedback(error instanceof Error ? error.message : String(error)))
              .finally(() => setSubmitting(false));
          }}
        >
          <div className="form-grid">
            <label className="full">
              <span>Email *</span>
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email học viên" />
            </label>
            <label className="full">
              <span>Mật khẩu *</span>
              <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="mat khau" />
            </label>
          </div>
          {currentAccountLabel ? (
            <div className="muted-text">Trình duyệt đang có session: {currentAccountLabel}. Nếu không phải học viên, hãy đăng xuất rồi đăng nhập học viên.</div>
          ) : null}
          {feedback ? <div className="bullet-item tone-danger">{feedback}</div> : null}
          <div className="action-row">
            <button type="submit" className="btn btn-danger" disabled={!normalizedEmail || !password || submitting}>
              {submitting ? 'Đang đăng nhập...' : 'Đăng nhập và vào game'}
            </button>
            {currentAccountLabel ? (
              <button type="button" className="btn btn-ghost" onClick={() => void onSignOut()}>
                Dang xuat
              </button>
            ) : null}
          </div>
        </form>
      </Card>
    </div>
  );
}

function PlxLoginBanner() {
  return (
    <div className="plx-login-banner">
      <div className="plx-login-mark" aria-hidden="true">
        <span className="plx-login-mark-square" />
      </div>
      <div className="plx-login-copy">
        <div className="plx-login-kicker">PETROLIMEX · GAMIFICATION</div>
        <div className="plx-login-title">Khám phá Điểm chạm trong Hành trình khách hàng Petrolimex</div>
      </div>
    </div>
  );
}

export function PublicGamePage() {
  const params = useParams();
  const location = useLocation();
  const auth = useAuth();
  const gameId = params.gameId || 'evnspc';
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const rankView = searchParams.get('view') === 'rank';
  const classScopeId = String(searchParams.get('classId') || '').trim();
  const activityScopeId = String(searchParams.get('activityId') || '').trim();
  const catalog = useMemo(() => loadGameCatalog(), []);
  const game = useMemo(() => {
    if (PLX_PUBLIC_HTML_BY_ID[gameId]) {
      return getGameCatalogEntry(gameId, catalog) || catalog.find((entry) => entry.id === gameId) || null;
    }

    if (gameId === 'evnspc') {
      return {
        id: 'evnspc',
        title: 'EVNSPC Gamification',
        projectName: 'EVNSPC',
        description: 'Ban public cu cho luong gamification EVNSPC.',
        owner: 'VContent',
        status: 'published' as const,
        version: 'v1.0.0',
        publicSlug: 'evnspc',
        publicEmbedMode: 'vendor' as const,
        publicEmbedUrl: '',
        resultMode: 'realtime' as const,
        notes: 'Ban public legacy.',
        summary: {
          plays: 0,
          passRate: 0,
          averageScore: 0,
          lastRunAt: '-',
        },
      };
    }

    return getGameCatalogEntry(gameId, catalog) || catalog[0] || null;
  }, [catalog, gameId]);
  const activePlxGameId = game?.id && PLX_PUBLIC_HTML_BY_ID[game.id] ? game.id : gameId;
  const isPlxGame = Boolean(PLX_PUBLIC_HTML_BY_ID[activePlxGameId]);
  const isPlxRankView = isPlxGame && rankView;
  const isPlxIndividualGame = activePlxGameId === 'plx-01-ca-nhan';
  const usesRealtimeResults = isPlxGame || game?.resultMode !== 'session';
  const canOperateRankView = Boolean(auth.profile?.role && GAME_RANK_OPERATOR_ROLES.has(auth.profile.role));
  const gameScope = useMemo(
    () => ({
      classId: classScopeId || null,
      activityId: activityScopeId || null,
    }),
    [activityScopeId, classScopeId],
  );

  const [session, setSession] = useState<PlxGameSession | null>(() =>
    loadAuthenticatedPlxGameSession(activePlxGameId, activityScopeId),
  );
  const [classGameActivity, setClassGameActivity] = useState<SuniTrainingClassActivity | null>(null);
  const [classGameActivityState, setClassGameActivityState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [classGameActivityError, setClassGameActivityError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const lastSavedSignatureRef = useRef('');
  const lastLiveScoreSignatureRef = useRef('');
  const resultActiveRef = useRef(false);
  const rankOpenedRef = useRef(false);
  const plxTouchpointMetaSignatureRef = useRef('');
  const plxBroadcastRef = useRef<BroadcastChannel | null>(null);
  const [plxRuns, setPlxRuns] = useState<PlxGameRunRow[]>([]);
  const [plxParticipants, setPlxParticipants] = useState<PlxGameParticipantRow[]>([]);
  const [plxTouchpointMeta, setPlxTouchpointMeta] = useState<PlxTouchpointMetaEntry[]>([]);
  const [plxLiveState, setPlxLiveState] = useState<'idle' | 'loading' | 'live' | 'offline' | 'error'>('idle');
  const [currentRun, setCurrentRun] = useState<{
    playerName: string;
    groupName: string;
    totalScore: number;
    cxScore: number;
    brandPts: number;
    rankLabel: string;
  } | null>(null);
  const [genericResultState, setGenericResultState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    const scopedGameId = String(game?.id || '').trim();
    if (!activityScopeId || !scopedGameId) {
      setClassGameActivity(null);
      setClassGameActivityState('idle');
      setClassGameActivityError('');
      return;
    }
    if (!classScopeId) {
      setClassGameActivity(null);
      setClassGameActivityState('error');
      setClassGameActivityError('Liên kết game của lớp thiếu mã lớp. Vui lòng mở lại game từ VTraining.');
      return;
    }

    let cancelled = false;
    setClassGameActivityState('loading');
    setClassGameActivityError('');
    suniTrainingApi
      .getClassActivity(activityScopeId)
      .then((activity) => {
        if (cancelled) return;
        const activityGameId = String(activity?.sourceId || activity?.metadata?.gameId || '').trim();
        const validStatus = ['active', 'published', 'open'].includes(String(activity?.status || ''));
        if (!activity || activity.type !== 'game' || activityGameId !== scopedGameId || (classScopeId && activity.classId !== classScopeId) || !validStatus) {
          setClassGameActivity(null);
          setClassGameActivityState('error');
          setClassGameActivityError('Game này chưa được phát hành cho lớp hoặc liên kết không hợp lệ.');
          return;
        }
        setClassGameActivity(activity);
        setClassGameActivityState('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        setClassGameActivity(null);
        setClassGameActivityState('error');
        setClassGameActivityError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [activityScopeId, classScopeId, game?.id]);

  const activateStudentSession = async (student: PlxStudentProfile, authUserId?: string | null) => {
    if (student.role !== 'hoc_vien') {
      throw new Error('Tài khoản này không phải học viên.');
    }
    if (activityScopeId && classGameActivityState !== 'ready') {
      throw new Error(classGameActivityError || 'Game cua lop chua san sang.');
    }
    const nextSession = {
      ...buildPlxSessionFromStudent(activePlxGameId, student, authUserId),
      classId: classGameActivity?.classId || classScopeId || null,
      activityId: classGameActivity?.id || activityScopeId || null,
    };
    if (!nextSession.email || !nextSession.className || !nextSession.groupName) {
      throw new Error('Hồ sơ học viên thiếu email, lớp hoặc nhóm. Vui lòng cập nhật trong màn quản trị người dùng.');
    }
    const authorized = await authorizePlxGameSession(nextSession);
    setSession(authorized);
  };

  const handleStudentLogin = async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase client is not configured.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const authUserId = data.session?.user?.id;
    if (!authUserId) throw new Error('Không lấy được phiên đăng nhập.');
    const student = await loadPlxStudentProfile(authUserId);
    if (!student) throw new Error('Không tìm thấy hồ sơ học viên đang hoạt động cho email này.');
    await activateStudentSession(student, authUserId);
  };

  const handlePublicLogin = async (nextSession: PlxGameSession) => {
    const authorized = await authorizePlxGameSession(nextSession);
    setSession(authorized);
  };

  const persistPlxResult = async (
    result: {
      cxScore?: number;
      brandPts?: number;
      maxStreak?: number;
      rankLabel?: string;
      values?: { heritage?: number; devoted?: number; pioneering?: number };
      answers?: PlxResultAnswer[];
    } | null,
  ) => {
    if (!session || !result) return;

    const signature = [
      session.playerName,
      session.email,
      session.className,
      session.groupName,
      session.classId || '',
      session.activityId || '',
      result.cxScore || 0,
      result.brandPts || 0,
      result.maxStreak || 0,
      result.rankLabel || '',
      result.answers?.length || 0,
    ].join('|');

    if (signature === lastSavedSignatureRef.current) return;
    lastSavedSignatureRef.current = signature;

    setCurrentRun({
      playerName: session.playerName,
      groupName: session.groupName,
      totalScore: Math.max(0, Math.round(Number(result.cxScore) || 0) + Math.round(Number(result.brandPts) || 0)),
      cxScore: Math.max(0, Math.round(Number(result.cxScore) || 0)),
      brandPts: Math.max(0, Math.round(Number(result.brandPts) || 0)),
      rankLabel: String(result.rankLabel || 'Cần cải thiện'),
    });

    try {
      await savePlxGameRun({
        gameId: activePlxGameId,
        classId: session.classId || classGameActivity?.classId || classScopeId || null,
        activityId: session.activityId || classGameActivity?.id || activityScopeId || null,
        email: session.email,
        profileId: session.profileId || null,
        authUserId: session.authUserId || null,
        playerName: session.playerName,
        className: session.className,
        groupName: session.groupName,
        cxScore: Number(result.cxScore) || 0,
        brandPts: Number(result.brandPts) || 0,
        maxStreak: Number(result.maxStreak) || 0,
        rankLabel: String(result.rankLabel || ''),
        values: result.values || {},
        answers: result.answers || [],
        embedded: true,
        authoritySessionId: session.authoritySessionId,
        authorityTicket: session.authorityTicket,
      });
    } catch (error) {
      console.error('Failed to save PLX game run', error);
    }
  };

  const persistGenericGameResult = async (payload: GenericGameResultPayload | null) => {
    if (isPlxGame || !game?.id || !usesRealtimeResults || !payload) return;

    const totalScore = Math.max(0, Math.round(Number(payload.score) || 0));
    const evnspcTimingMetadata = game.id === 'evnspc-tnkh-01'
      && payload.meta?.evnspcTnkhTiming
      && typeof payload.meta.evnspcTnkhTiming === 'object'
      && !Array.isArray(payload.meta.evnspcTnkhTiming)
        ? payload.meta.evnspcTnkhTiming as Record<string, unknown>
        : null;
    const isolatedAttemptKey = String(evnspcTimingMetadata?.startedAt || '').trim();
    const playerName =
      String(payload.playerName || session?.playerName || auth.profile?.fullName || auth.profile?.email || '').trim() || 'Hoc vien an danh';
    const groupName = String(payload.groupName || session?.groupName || auth.profile?.studentGroup || game.projectName || 'Public').trim() || 'Public';
    const className = String(session?.className || auth.profile?.studentClass || '').trim();
    const rankLabel = String(payload.rankLabel || '').trim() || 'Da hoan thanh';
    const signature = [
      game.id,
      playerName,
      groupName,
      className,
      totalScore,
      payload.maxScore || '',
      rankLabel,
      Array.isArray(payload.answers) ? payload.answers.length : 0,
      isolatedAttemptKey,
    ].join('|');

    if (signature === lastSavedSignatureRef.current) return;
    lastSavedSignatureRef.current = signature;
    setGenericResultState('saving');
    setCurrentRun({
      playerName,
      groupName,
      totalScore,
      cxScore: totalScore,
      brandPts: 0,
      rankLabel,
    });

    try {
      await savePlxGameRun({
        gameId: game.id,
        classId: session?.classId || classScopeId || null,
        activityId: session?.activityId || activityScopeId || null,
        email: String(session?.email || auth.profile?.email || auth.session?.user?.email || '').trim(),
        profileId: session?.profileId || auth.profile?.id || null,
        authUserId: session?.authUserId || auth.session?.user?.id || auth.profile?.authUserId || null,
        playerName,
        className,
        groupName,
        cxScore: totalScore,
        brandPts: 0,
        maxStreak: Math.max(0, Math.round(Number(payload.maxStreak) || 0)),
        rankLabel,
        values: {
          ...(payload.values || {}),
          ...(payload.meta || {}),
          source: 'generic-game-result',
          maxScore: Number(payload.maxScore) || null,
          scorePercent: payload.maxScore ? Math.round((totalScore / Math.max(1, Number(payload.maxScore))) * 100) : null,
          publicSlug: game.publicSlug || game.id,
        },
        answers: payload.answers || [],
        embedded: true,
        authoritySessionId: session?.authoritySessionId,
        authorityTicket: session?.authorityTicket,
      });

      setGenericResultState('saved');
      window.parent?.postMessage({ type: 'game-result-ready', gameId: game.id, payload }, window.location.origin);
      if (typeof BroadcastChannel !== 'undefined') {
        const broadcast = new BroadcastChannel(`${game.id}-results`);
        broadcast.postMessage({ type: 'game-result-ready', gameId: game.id, payload });
        broadcast.close();
      }
    } catch (error) {
      console.error('Failed to save generic game result', error);
      setGenericResultState('error');
    }
  };

  useEffect(() => {
    setSession(loadAuthenticatedPlxGameSession(activePlxGameId, activityScopeId));
    lastSavedSignatureRef.current = '';
    lastLiveScoreSignatureRef.current = '';
    resultActiveRef.current = false;
    rankOpenedRef.current = false;
    setPlxRuns([]);
    setPlxParticipants([]);
    setPlxTouchpointMeta([]);
    setPlxLiveState('idle');
    setCurrentRun(null);
    setGenericResultState('idle');
  }, [activePlxGameId, activityScopeId, isPlxGame, rankView]);

  useEffect(() => {
    if (!isPlxGame || isPlxRankView || session || auth.loading || !auth.profile) return;
    if (activityScopeId && classGameActivityState !== 'ready') return;
    if (auth.profile.role !== 'hoc_vien') return;
    const student: PlxStudentProfile = {
      id: auth.profile.id,
      auth_user_id: auth.profile.authUserId,
      email: auth.profile.email,
      full_name: auth.profile.fullName,
      role: auth.profile.role,
      active: true,
      student_class: auth.profile.studentClass,
      student_group: auth.profile.studentGroup,
      student_code: auth.profile.studentCode,
    };
    try {
      void activateStudentSession(student, auth.session?.user?.id || auth.profile.authUserId).catch((error) => {
        console.warn('Failed to authorize stored PLX student session', error);
      });
    } catch (error) {
      console.warn('Stored PLX student session is incomplete', error);
    }
  }, [activePlxGameId, activityScopeId, auth.loading, auth.profile, auth.session?.user?.id, classGameActivityState, isPlxGame, isPlxRankView, session]);

  const publicMode = game?.publicEmbedMode || 'vendor';
  const publicUrl = game?.publicEmbedUrl?.trim() || '';
  const plxPublicHtml = PLX_PUBLIC_HTML_BY_ID[activePlxGameId] || PLX_PUBLIC_HTML_BY_ID[PLX_DEFAULT_GAME_ID];
  const frameUrlBase = publicUrl || plxPublicHtml;
  const frameIdentityParams = new URLSearchParams();
  if (session && !rankView) {
    frameIdentityParams.set('playerName', session.playerName);
    frameIdentityParams.set('groupName', session.groupName);
    frameIdentityParams.set('className', session.className);
    frameIdentityParams.set('participantId', session.participantId);
    if (session.classId) frameIdentityParams.set('classId', session.classId);
    if (session.activityId) frameIdentityParams.set('activityId', session.activityId);
    if (session.profileId) frameIdentityParams.set('profileId', session.profileId);
    if (session.email) frameIdentityParams.set('email', session.email);
  }
  const frameQueryParams = [
    isPlxGame && !frameUrlBase.includes('audio=20260514-ios-strong') ? 'audio=20260514-ios-strong' : '',
    isPlxGame && !frameUrlBase.includes('cup=20260515-top1') ? 'cup=20260515-top1' : '',
    rankView ? 'view=rank' : '',
    frameIdentityParams.toString(),
  ].filter(Boolean);
  const frameUrl = `${frameUrlBase}${frameQueryParams.length ? `${frameUrlBase.includes('?') ? '&' : '?'}${frameQueryParams.join('&')}` : ''}`;
  const scopedPlxRuns = useMemo(() => {
    if (activityScopeId && !isPlxRankView) {
      return plxRuns.filter((run) => String(run.activity_id || run.values_json?.activityId || '').trim() === activityScopeId);
    }
    if (classScopeId && !isPlxRankView) {
      return plxRuns.filter((run) => String(run.class_id || run.values_json?.classId || '').trim() === classScopeId);
    }
    const className = String(session?.className || '').trim();
    if (!className || isPlxRankView) return plxRuns;
    return plxRuns.filter((run) => {
      const runClassName = String(run.class_name || run.values_json?.className || '').trim();
      return runClassName === className;
    });
  }, [activityScopeId, classScopeId, isPlxRankView, plxRuns, session?.className]);
  const scopedPlxParticipants = useMemo(() => {
    const clientParticipants = plxParticipants.filter((participant) =>
      String(participant.participant_key || '').startsWith('client:'),
    );
    if (activityScopeId && !isPlxRankView) {
      return clientParticipants.filter((participant) => String(participant.activity_id || '').trim() === activityScopeId);
    }
    if (classScopeId && !isPlxRankView) {
      return clientParticipants.filter((participant) => String(participant.class_id || '').trim() === classScopeId);
    }
    const className = String(session?.className || '').trim();
    if (!className || isPlxRankView) return clientParticipants;
    return clientParticipants.filter((participant) => String(participant.class_name || '').trim() === className);
  }, [activityScopeId, classScopeId, isPlxRankView, plxParticipants, session?.className]);
  const activePlxParticipants = useMemo(
    () => scopedPlxParticipants.filter((participant) => isRecentPlxParticipant(participant)),
    [scopedPlxParticipants],
  );
  const plxChoiceStats = useMemo(() => buildPlxChoiceStats(scopedPlxRuns), [scopedPlxRuns]);
  const plxPersonalLeaderboard = useMemo(() => buildPlxPersonalLeaderboard(scopedPlxRuns), [scopedPlxRuns]);
  const evnspcTnkhLeaderboard = useMemo(() => buildEvnspcTnkhLeaderboard(scopedPlxRuns), [scopedPlxRuns]);
  const livePersonalLeaderboard = useMemo<LiveLeaderboardRow[]>(() => {
    const rowsByPlayer = new Map<string, LiveLeaderboardRow>();

    const completedLeaderboard = game?.id === 'evnspc-tnkh-01'
      ? evnspcTnkhLeaderboard
      : plxPersonalLeaderboard.map((item) => ({
          ...item,
          attemptStartedAt: null,
          attemptFinishedAt: null,
          attemptDurationMs: null,
        }));
    for (const item of completedLeaderboard) {
      rowsByPlayer.set(getPlxLeaderboardPlayerKey(item.playerName, item.groupName), {
        playerName: item.playerName,
        groupName: item.groupName,
        runCount: item.runCount,
        totalScore: item.totalScore,
        bestScore: item.bestScore,
        latestRankLabel: item.latestRankLabel,
        progress: null,
        isLive: false,
        recordedAt: item.latestRunAt,
        attemptStartedAt: item.attemptStartedAt,
        attemptFinishedAt: item.attemptFinishedAt,
        attemptDurationMs: item.attemptDurationMs,
      });
    }

    for (const participant of scopedPlxParticipants) {
      const playerName = String(participant.player_name || participant.email || 'Người chơi chưa đặt tên').trim() || 'Người chơi chưa đặt tên';
      const groupName = String(participant.group_name || 'Chưa có nhóm').trim() || 'Chưa có nhóm';
      const key = getPlxLeaderboardPlayerKey(playerName, groupName);
      const existing = rowsByPlayer.get(key);
      const liveScore = getRecentParticipantLiveScore(participant);
      const hasLiveScore = liveScore != null;
      const progress = Number(participant.live_progress);
      const nextScore = hasLiveScore
        ? game?.id === 'evnspc-tnkh-01' ? Math.max(liveScore, existing?.totalScore || 0) : liveScore
        : existing?.totalScore ?? 0;
      const liveScoreBeatsCompletedAttempt = hasLiveScore && liveScore > (existing?.bestScore || 0);
      const recordedAt = hasLiveScore
        ? String(participant.live_score_updated_at || participant.last_seen_at || existing?.recordedAt || '')
        : existing?.recordedAt || String(participant.last_seen_at || '');
      rowsByPlayer.set(key, {
        playerName,
        groupName,
        runCount: Math.max(existing?.runCount || 0, hasLiveScore ? 1 : 0),
        totalScore: nextScore,
        bestScore: Math.max(nextScore, existing?.bestScore || 0),
        latestRankLabel: existing?.latestRankLabel || (hasLiveScore ? 'Đang chơi' : 'Đã tham gia'),
        progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : existing?.progress ?? null,
        isLive: hasLiveScore || isRecentPlxParticipant(participant),
        recordedAt,
        attemptStartedAt: liveScoreBeatsCompletedAttempt ? null : existing?.attemptStartedAt ?? null,
        attemptFinishedAt: liveScoreBeatsCompletedAttempt ? null : existing?.attemptFinishedAt ?? null,
        attemptDurationMs: liveScoreBeatsCompletedAttempt ? null : existing?.attemptDurationMs ?? null,
      });
    }

    return Array.from(rowsByPlayer.values()).sort(
      game?.id === 'evnspc-tnkh-01'
        ? (a, b) =>
            b.totalScore - a.totalScore
            || (a.attemptDurationMs == null && b.attemptDurationMs == null
              ? 0
              : a.attemptDurationMs == null
                ? 1
                : b.attemptDurationMs == null
                  ? -1
                  : a.attemptDurationMs - b.attemptDurationMs)
            || a.runCount - b.runCount
            || getTimestampValue(a.recordedAt) - getTimestampValue(b.recordedAt)
            || a.playerName.localeCompare(b.playerName, 'vi')
        : (a, b) =>
            b.totalScore - a.totalScore
            || getTimestampValue(a.recordedAt) - getTimestampValue(b.recordedAt)
            || b.bestScore - a.bestScore
            || a.playerName.localeCompare(b.playerName, 'vi'),
    );
  }, [evnspcTnkhLeaderboard, game?.id, plxPersonalLeaderboard, scopedPlxParticipants]);
  const liveGroupLeaderboard = useMemo(() => {
    const groups = new Map<string, { groupName: string; memberCount: number; totalScore: number; bestScore: number; liveCount: number }>();
    for (const row of livePersonalLeaderboard) {
      const current = groups.get(row.groupName) || { groupName: row.groupName, memberCount: 0, totalScore: 0, bestScore: 0, liveCount: 0 };
      current.memberCount += 1;
      current.totalScore += row.totalScore;
      current.bestScore = Math.max(current.bestScore, row.bestScore);
      if (row.isLive) current.liveCount += 1;
      groups.set(row.groupName, current);
    }
    return Array.from(groups.values()).sort(
      (a, b) =>
        b.totalScore - a.totalScore ||
        b.bestScore - a.bestScore ||
        b.liveCount - a.liveCount ||
        a.groupName.localeCompare(b.groupName, 'vi'),
    );
  }, [livePersonalLeaderboard]);
  const genericGameLeaderboard = useMemo<GenericGameLeaderboardRow[]>(() => {
    const latestRunByPlayer = new Map<string, PlxGameRunRow>();
    for (const run of scopedPlxRuns) {
      const playerName = String(run.player_name || 'Người chơi chưa đặt tên').trim() || 'Người chơi chưa đặt tên';
      const current = latestRunByPlayer.get(playerName);
      if (!current || String(current.created_at) <= String(run.created_at)) {
        latestRunByPlayer.set(playerName, run);
      }
    }

    const rows = plxPersonalLeaderboard.map((item) => {
      const latestRun = latestRunByPlayer.get(item.playerName);
      return {
        playerName: item.playerName,
        groupName: item.groupName,
        runCount: item.runCount,
        totalScore: item.totalScore,
        bestScore: item.bestScore,
        latestRankLabel: item.latestRankLabel,
        values: latestRun?.values_json || {},
      };
    });

    if (!isPlxGame && currentRun) {
      const currentKey = `${currentRun.playerName}::${currentRun.groupName}`;
      const currentIndex = rows.findIndex((item) => `${item.playerName}::${item.groupName}` === currentKey);
      const currentRow = {
        playerName: currentRun.playerName,
        groupName: currentRun.groupName,
        runCount: Math.max(1, rows[currentIndex]?.runCount || 1),
        totalScore: currentRun.totalScore,
        bestScore: Math.max(currentRun.totalScore, rows[currentIndex]?.bestScore || 0),
        latestRankLabel: currentRun.rankLabel,
        values: rows[currentIndex]?.values || {},
      };
      if (currentIndex >= 0) rows[currentIndex] = currentRow;
      else rows.push(currentRow);
    }

    return rows.sort(
      (a, b) =>
        b.totalScore - a.totalScore ||
        b.bestScore - a.bestScore ||
        b.runCount - a.runCount ||
        a.playerName.localeCompare(b.playerName, 'vi'),
    );
  }, [currentRun, isPlxGame, plxPersonalLeaderboard, scopedPlxRuns]);
  const plxLeaderboardScores = useMemo(
    () => plxPersonalLeaderboard.map((item) => Number(item.totalScore) || 0),
    [plxPersonalLeaderboard],
  );
  const plxPlayerRank = useMemo<PlxPlayerRank>(() => {
    const participantTotal = activePlxParticipants.length;
    const total = Math.max(participantTotal, session ? 1 : 0);
    if (!session) return { rank: null, total, scores: [] };

    const currentParticipantKey = getPlxSessionParticipantKey(session);
    const liveCompetitorScores: number[] = [];

    for (const participant of activePlxParticipants) {
      if (participant.participant_key === currentParticipantKey) continue;
      const liveScore = getRecentParticipantLiveScore(participant);
      liveCompetitorScores.push(liveScore ?? 0);
    }

    const allCompetitorScores = liveCompetitorScores.slice(0, Math.max(0, total - 1));
    const missingCompetitorCount = Math.max(0, total - 1 - allCompetitorScores.length);
    return {
      rank: allCompetitorScores.length === 0 ? 1 : null,
      total: Math.max(total, allCompetitorScores.length + 1),
      scores: allCompetitorScores.concat(Array(missingCompetitorCount).fill(0)),
    };
  }, [activePlxParticipants, session]);

  useEffect(() => {
    if (!isPlxGame || (!session && !isPlxRankView)) return undefined;

    const syncFromFrame = async () => {
      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!doc) return;

      const gameWindow = iframe?.contentWindow as PlxGameWindow | null | undefined;
      if (gameWindow) {
        gameWindow.PLXPlayerChoiceStats = plxChoiceStats;
        gameWindow.PLXPlayerRank = plxPlayerRank;
        gameWindow.PLXLeaderboardScores = plxLeaderboardScores;
        gameWindow.PLXGame?.setPlayerRank?.(plxPlayerRank);
      }

      const touchpointMeta = gameWindow?.PLXGame?.getTouchpointsMeta?.();
      if (Array.isArray(touchpointMeta) && touchpointMeta.length) {
        const normalizedMeta = touchpointMeta.map((item: PlxTouchpointMetaEntry) => ({
          id: String(item.id),
          label: String(item.label || ''),
          shortLabel: String(item.shortLabel || ''),
          title: String(item.title || ''),
        }));
        const nextMetaSignature = JSON.stringify(normalizedMeta);
        if (plxTouchpointMetaSignatureRef.current !== nextMetaSignature) {
          plxTouchpointMetaSignatureRef.current = nextMetaSignature;
          setPlxTouchpointMeta(normalizedMeta);
        }
      }

      if (isPlxRankView && !rankOpenedRef.current) {
        try {
          gameWindow?.showRanking?.();
          gameWindow?.PLXGame?.showRanking?.();
          rankOpenedRef.current = true;
        } catch (error) {
          console.error('Failed to open PLX ranking view', error);
        }
      }

      if (!session) {
        return;
      }

      const teamNameInput = doc.getElementById('team-name') as HTMLInputElement | null;
      if (teamNameInput && teamNameInput.value !== session.playerName) {
        teamNameInput.value = session.playerName;
        teamNameInput.dispatchEvent(new Event('input', { bubbles: true }));
        teamNameInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const teamChip = doc.getElementById('team-chip-name');
      if (teamChip) {
        teamChip.textContent = isPlxIndividualGame
          ? `${session.playerName} · ${session.className}`
          : `${session.playerName} · ${session.className} · ${session.groupName}`;
      }

      const liveScore = gameWindow?.PLXGame?.getLiveScoreData?.();
      if (liveScore && Number.isFinite(Number(liveScore.totalScore))) {
        const liveSignature = [
          activePlxGameId,
          session.participantId,
          Math.max(0, Math.round(Number(liveScore.totalScore) || 0)),
          Math.max(0, Math.round(Number(liveScore.progress) || 0)),
        ].join('|');
        if (liveSignature !== lastLiveScoreSignatureRef.current) {
          lastLiveScoreSignatureRef.current = liveSignature;
          upsertPlxGameParticipant(session, {
            totalScore: Number(liveScore.totalScore) || 0,
            progress: Number(liveScore.progress) || 0,
          }).catch((error) => {
            console.warn('Failed to update PLX live score', error);
          });
        }
      }

      const result = readGameResult(doc, isPlxRankView);
      if (!result) {
        resultActiveRef.current = false;
        lastSavedSignatureRef.current = '';
        return;
      }

      resultActiveRef.current = true;
      await persistPlxResult({
        cxScore: result.cxScore,
        brandPts: result.brandPts,
        maxStreak: result.maxStreak,
        rankLabel: result.rankLabel,
        values: result.values,
        answers: result.answers,
      });
    };

    const timer = window.setInterval(() => {
      void syncFromFrame();
    }, 1200);

    return () => {
      window.clearInterval(timer);
    };
  }, [activePlxGameId, gameId, isPlxGame, isPlxRankView, plxChoiceStats, plxPlayerRank, session]);

  useEffect(() => {
    if (!isPlxGame || (!session && !(isPlxRankView && canOperateRankView))) return undefined;

    let cancelled = false;

    const refreshLeaderboard = async () => {
      try {
        if (!cancelled) setPlxLiveState('loading');
        const snapshot = session
          ? await loadPlxGameLeaderboard(session)
          : await loadPlxGameAdminLeaderboard(activePlxGameId, gameScope);
        if (cancelled) return;
        setPlxRuns(snapshot.runs);
        setPlxParticipants(snapshot.participants);
        setPlxLiveState('live');
      } catch (error) {
        console.error('Failed to load PLX leaderboard', error);
        if (!cancelled) {
          setPlxLiveState('error');
        }
      }
    };

    void refreshLeaderboard();

    const polling = window.setInterval(() => {
      void refreshLeaderboard();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(polling);
    };
  }, [activePlxGameId, canOperateRankView, gameScope, isPlxGame, isPlxRankView, session]);

  useEffect(() => {
    if (!isPlxGame || !session || isPlxRankView) return undefined;

    const touchParticipant = () => {
      upsertPlxGameParticipant(session).catch((error) => {
        console.warn('Failed to update PLX game participant', error);
      });
    };

    touchParticipant();
    const timer = window.setInterval(touchParticipant, 15000);
    return () => {
      window.clearInterval(timer);
    };
  }, [isPlxGame, isPlxRankView, session]);

  useEffect(() => {
    if (!isPlxGame || !session) return undefined;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; gameId?: string; payload?: any } | null;
      if (!data || data.type !== 'plx-result-ready' || data.gameId !== activePlxGameId) return;
      void persistPlxResult(data.payload || null);
    };

    const broadcast = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`${activePlxGameId}-results`) : null;
    plxBroadcastRef.current = broadcast;
    const onBroadcast = (event: MessageEvent) => {
      const data = event.data as { type?: string; gameId?: string; payload?: any } | null;
      if (!data || data.type !== 'plx-result-ready' || data.gameId !== activePlxGameId) return;
      void persistPlxResult(data.payload || null);
    };

    broadcast?.addEventListener('message', onBroadcast);

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      broadcast?.removeEventListener('message', onBroadcast);
      broadcast?.close();
      if (plxBroadcastRef.current === broadcast) {
        plxBroadcastRef.current = null;
      }
    };
  }, [activePlxGameId, isPlxGame, session]);

  useEffect(() => {
    if (isPlxGame || !game?.id || !usesRealtimeResults) return undefined;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; gameId?: string; payload?: GenericGameResultPayload } | null;
      if (!data || data.type !== 'game-result-ready' || data.gameId !== game.id) return;
      void persistGenericGameResult(data.payload || null);
    };

    const broadcast = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`${game.id}-results`) : null;
    const onBroadcast = (event: MessageEvent) => {
      const data = event.data as { type?: string; gameId?: string; payload?: GenericGameResultPayload } | null;
      if (!data || data.type !== 'game-result-ready' || data.gameId !== game.id) return;
      void persistGenericGameResult(data.payload || null);
    };

    window.addEventListener('message', onMessage);
    broadcast?.addEventListener('message', onBroadcast);

    return () => {
      window.removeEventListener('message', onMessage);
      broadcast?.removeEventListener('message', onBroadcast);
      broadcast?.close();
    };
  }, [game?.id, isPlxGame, persistGenericGameResult, usesRealtimeResults]);

  useEffect(() => {
    if (isPlxGame || !game?.id || !usesRealtimeResults || rankView || !session) return undefined;

    const syncGenericLiveState = () => {
      const gameWindow = iframeRef.current?.contentWindow as PlxGameWindow | null | undefined;
      if (!gameWindow?.render_game_to_text) return;

      try {
        const snapshot = JSON.parse(gameWindow.render_game_to_text()) as {
          progress?: { current?: number; total?: number } | null;
          stats?: { tnkh?: number } | null;
          result?: number | null;
        };
        const totalScore = Number.isFinite(Number(snapshot.result))
          ? Number(snapshot.result)
          : Number(snapshot.stats?.tnkh);
        if (!Number.isFinite(totalScore)) return;

        const current = Math.max(0, Number(snapshot.progress?.current) || 0);
        const total = Math.max(1, Number(snapshot.progress?.total) || 8);
        const progress = snapshot.progress ? Math.min(100, Math.round((current / total) * 100)) : 100;
        const liveSignature = [
          game.id,
          session.participantId,
          Math.max(0, Math.round(totalScore)),
          progress,
        ].join('|');
        if (liveSignature === lastLiveScoreSignatureRef.current) return;
        lastLiveScoreSignatureRef.current = liveSignature;
        upsertPlxGameParticipant(session, { totalScore, progress }).catch((error) => {
          console.warn('Failed to update generic game live score', error);
        });
      } catch (error) {
        console.warn('Failed to read generic game live state', error);
      }
    };

    syncGenericLiveState();
    const timer = window.setInterval(syncGenericLiveState, 1200);
    return () => {
      window.clearInterval(timer);
    };
  }, [game?.id, isPlxGame, rankView, session, usesRealtimeResults]);

  useEffect(() => {
    if (
      isPlxGame || !game?.id || !usesRealtimeResults
      || (!session && !(rankView && canOperateRankView))
    ) {
      setPlxRuns([]);
      setPlxParticipants([]);
      setPlxLiveState('idle');
      return undefined;
    }

    let cancelled = false;

    const refreshLeaderboard = async () => {
      try {
        if (!cancelled) setPlxLiveState('loading');
        const snapshot = session
          ? await loadPlxGameLeaderboard(session)
          : await loadPlxGameAdminLeaderboard(game.id, gameScope);
        if (cancelled) return;
        setPlxRuns(snapshot.runs);
        setPlxParticipants(snapshot.participants);
        setPlxLiveState('live');
      } catch (error) {
        console.error('Failed to load generic game leaderboard', error);
        if (!cancelled) setPlxLiveState('error');
      }
    };

    void refreshLeaderboard();

    const polling = window.setInterval(() => {
      void refreshLeaderboard();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(polling);
    };
  }, [canOperateRankView, game?.id, gameScope, isPlxGame, rankView, session, usesRealtimeResults]);

  const plxGroupLeaderboard = useMemo(() => buildPlxLeaderboard(scopedPlxRuns), [scopedPlxRuns]);
  const plxClassOverview = useMemo(() => buildPlxClassOverview(scopedPlxRuns), [scopedPlxRuns]);
  const plxTouchpointAverages = useMemo(() => buildPlxTouchpointAverages(scopedPlxRuns, plxTouchpointMeta), [scopedPlxRuns, plxTouchpointMeta]);
  const plxClassComment = useMemo(
    () => buildPlxClassComment(plxClassOverview, plxTouchpointAverages),
    [plxClassOverview, plxTouchpointAverages],
  );

  useEffect(() => {
    if (!isPlxGame || (!session && !isPlxRankView)) return;
    const gameWindow = iframeRef.current?.contentWindow as PlxGameWindow | null | undefined;
    if (gameWindow) {
      gameWindow.PLXPlayerChoiceStats = plxChoiceStats;
      gameWindow.PLXPlayerRank = plxPlayerRank;
      gameWindow.PLXLeaderboardScores = plxLeaderboardScores;
      gameWindow.PLXGame?.setPlayerRank?.(plxPlayerRank);
    }
  }, [isPlxGame, isPlxRankView, plxChoiceStats, plxLeaderboardScores, plxPlayerRank, session]);

  useEffect(() => {
    if (isPlxGame || !game?.id || !usesRealtimeResults) return undefined;

    const syncLeaderboard = () => {
      const gameWindow = iframeRef.current?.contentWindow as PlxGameWindow | null | undefined;
      if (!gameWindow) return;
      try {
        gameWindow.VContentGameLeaderboard = genericGameLeaderboard;
        gameWindow.VContentGame?.setLeaderboard?.(genericGameLeaderboard);
        gameWindow.postMessage(
          {
            type: 'vcontent-leaderboard',
            gameId: game.id,
            rows: genericGameLeaderboard,
          },
          window.location.origin,
        );
      } catch (error) {
        console.warn('Failed to sync generic game leaderboard', error);
      }
    };

    syncLeaderboard();
    const timer = window.setInterval(syncLeaderboard, 1500);
    return () => {
      window.clearInterval(timer);
    };
  }, [game?.id, genericGameLeaderboard, isPlxGame, usesRealtimeResults]);

  useEffect(() => {
    if (!isPlxGame || (!session && !isPlxRankView)) return undefined;

    const syncRanking = () => {
      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!doc) return;

      const rankingRoot = doc.getElementById('screen-ranking');
      if (!rankingRoot) return;

      const renderRows = (items: Array<{ rank: number; title: string; sub: string; score: number; best: number; active?: boolean }>) =>
        items
          .map(
            (item) => `
              <div class="tpr${item.active ? ' active' : ''}">
                <div class="tpr-num">${item.rank}</div>
                <div class="tpr-text">
                  <strong>${item.title}</strong>
                  <span>${item.sub}</span>
                </div>
                <div class="tpr-score">${formatNumber(item.score)}<div class="ll-time">best ${formatNumber(item.best)}</div></div>
              </div>
            `,
          )
          .join('');

      const personalNode = doc.getElementById('rank-personal-list');
      const groupNodeList = doc.getElementById('rank-group-list');
      const overviewNode = doc.getElementById('rank-class-overview');
      const touchpointNode = doc.getElementById('rank-touchpoint-averages');
      const commentNode = doc.getElementById('rank-auto-comment');

      if (personalNode) {
        const activePlayerName = session?.playerName || null;
        const activeGroupName = session?.groupName || null;
        const rows = plxPersonalLeaderboard.slice(0, 10).map((item, index) => ({
          rank: index + 1,
          title: item.playerName,
          sub: `${item.groupName} · ${item.runCount} lượt · Rank ${item.latestRankLabel}`,
          score: item.totalScore,
          best: item.bestScore,
          active: Boolean(activePlayerName && activeGroupName && item.playerName === activePlayerName && item.groupName === activeGroupName),
        }));
        personalNode.innerHTML = renderRows(rows);
      }

      if (groupNodeList) {
        const activeGroupName = session?.groupName || null;
        const rows = plxGroupLeaderboard.slice(0, 10).map((item, index) => ({
          rank: index + 1,
          title: item.groupName,
          sub: `${item.memberCount} lượt · lần cuối ${item.latestPlayerName}`,
          score: item.totalScore,
          best: item.bestScore,
          active: Boolean(activeGroupName && item.groupName === activeGroupName),
        }));
        groupNodeList.innerHTML = renderRows(rows);
      }

      if (overviewNode) {
        overviewNode.innerHTML = `
          <h3>Tổng quan lớp</h3>
          <div class="sub">Tính trên lượt gần nhất của từng học viên.</div>
          <div class="overview-grid">
            <div class="mini-stat">
              <div class="ms-label">Học viên</div>
              <div class="ms-value">${formatNumber(plxClassOverview.memberCount)}</div>
              <div class="ms-sub">${formatNumber(plxClassOverview.groupCount)} nhóm đang tham gia</div>
            </div>
            <div class="mini-stat">
              <div class="ms-label">Điểm TB lớp</div>
              <div class="ms-value">${formatNumber(Math.round(plxClassOverview.averageTotalScore))}</div>
              <div class="ms-sub">${formatNumber(Math.round(plxClassOverview.averageCxScore))} CX · ${formatNumber(Math.round(plxClassOverview.averageBrandPts))} TH</div>
            </div>
            <div class="mini-stat">
              <div class="ms-label">Di sản</div>
              <div class="ms-value">${formatNumber(Math.round(plxClassOverview.averageHeritage))}</div>
              <div class="ms-sub">Trụ cột mạnh nhất/giữ nền</div>
            </div>
            <div class="mini-stat">
              <div class="ms-label">Tiên phong</div>
              <div class="ms-value">${formatNumber(Math.round(plxClassOverview.averagePioneering))}</div>
              <div class="ms-sub">Năng lực cần đẩy thêm</div>
            </div>
          </div>
        `;
      }

      if (touchpointNode) {
        const touchpointRows = plxTouchpointAverages
          .slice(0, 7)
          .map(
            (item, index) => `
              <div class="touch-avg-item">
                <div class="ta-num">${index + 1}</div>
                <div class="ta-text">
                  <strong>${item.tpTitle}</strong>
                  <span>${item.runCount} lượt · ${item.tpLabel || item.tpId}</span>
                </div>
                <div class="ta-score">
                  ${formatNumber(Math.round(item.avgTotal))} điểm
                  <span class="ta-sub">TB ${formatNumber(Math.round(item.avgCx))} CX · ${formatNumber(Math.round(item.avgBrand))} TH</span>
                </div>
              </div>
            `,
          )
          .join('');
        touchpointNode.innerHTML = `
          <h3>Điểm trung bình theo điểm chạm</h3>
          <div class="sub">Mỗi điểm chạm lấy theo lượt gần nhất của từng học viên.</div>
          <div class="touch-avg-list">${touchpointRows || '<div class="ll-empty">Chưa đủ lượt để thống kê.</div>'}</div>
        `;
      }

      if (commentNode) {
        commentNode.innerHTML = `
          <h3>Nhận xét tự động</h3>
          <div class="sub">Sinh từ ranking và mức điểm trung bình của lớp.</div>
          <div class="auto-comment">
            <div class="ac-title">${plxClassComment.heading}</div>
            <div class="ac-head">${plxClassComment.body}</div>
            <div class="ac-body">${plxClassComment.focus}</div>
            <div class="ac-points">
              ${plxClassComment.strengths.map((item) => `<div class="ac-point">${item}</div>`).join('')}
            </div>
          </div>
        `;
      }
    };

    syncRanking();
    const timer = window.setInterval(syncRanking, 1200);
    return () => window.clearInterval(timer);
  }, [isPlxGame, plxGroupLeaderboard, plxPersonalLeaderboard, plxClassComment, plxClassOverview, plxTouchpointAverages, session]);

  if (activityScopeId && (classGameActivityState === 'idle' || classGameActivityState === 'loading')) {
    return (
      <div className="public-game-page public-game-page--plx-login">
        {isPlxGame ? <PlxLoginBanner /> : null}
        <div className="public-game-login-wrap">
          <Card title="Đang kiểm tra game của lớp">
            <div className="muted-text">Hệ thống đang xác minh game đã được phát hành cho lớp.</div>
          </Card>
        </div>
      </div>
    );
  }

  if (activityScopeId && classGameActivityState === 'error') {
    return (
      <div className="public-game-page public-game-page--plx-login">
        {isPlxGame ? <PlxLoginBanner /> : null}
        <div className="public-game-login-wrap">
          <Card title="Không mở được game">
            <div className="notice danger">{classGameActivityError || 'Link game của lớp không hợp lệ.'}</div>
          </Card>
        </div>
      </div>
    );
  }

  if (rankView && !session && !canOperateRankView) {
    return (
      <div className="public-game-page public-game-page--plx-login">
        {isPlxGame ? <PlxLoginBanner /> : null}
        <div className="public-game-login-wrap">
          <Card title={auth.loading ? 'Đang kiểm tra quyền vận hành' : 'Bảng xếp hạng cần xác thực'}>
            <div className="stack">
              <div className="muted-text">
                {auth.loading
                  ? 'Hệ thống đang kiểm tra phiên đăng nhập.'
                  : 'Hãy đăng nhập bằng tài khoản quản trị đào tạo/nội dung, hoặc mở bảng xếp hạng từ phiên chơi còn hiệu lực.'}
              </div>
              {!auth.loading ? <Link className="button primary" to="/login">Đăng nhập</Link> : null}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (isPlxGame && !session && !isPlxRankView) {
    return (
      <div className="public-game-page public-game-page--plx-login">
        <PlxLoginBanner />
        <div className="public-game-login-wrap">
          <StudentLoginCard
            gameId={activePlxGameId}
            onLogin={handleStudentLogin}
            onSignOut={auth.signOut}
            currentAccountLabel={auth.profile?.email || auth.session?.user?.email || null}
          />
        </div>
      </div>
    );
  }

  if (!isPlxGame && !session && !rankView) {
    return (
      <div className="public-game-page public-game-page--plx-login">
        <div className="public-game-login-wrap">
          <LoginCard
            gameId={game?.id || gameId}
            individualMode
            onLogin={handlePublicLogin}
          />
        </div>
      </div>
    );
  }

  if (!isPlxGame && rankView && game?.id === 'evnspc-tnkh-01') {
    const rankTitle = classGameActivity?.title || game.projectName || game.title || 'Bảng xếp hạng realtime';
    const leadingScore = livePersonalLeaderboard[0]?.totalScore || 0;
    return (
      <div className="public-game-page public-game-page--spc-rank">
        <div className="spc-rank-hero">
          <div>
            <h1>{rankTitle}</h1>
          </div>
          <div className="spc-rank-live-pill">
            <span className={`spc-rank-live-dot ${plxLiveState === 'live' ? 'is-live' : ''}`} />
            {plxLiveState === 'live' ? 'Đang realtime' : plxLiveState === 'loading' ? 'Đang tải' : 'Theo dõi rank'}
          </div>
        </div>

        <div className="spc-rank-stat-grid">
          <div className="spc-rank-stat">
            <span>Đang tham gia</span>
            <strong>{formatNumber(activePlxParticipants.length)}</strong>
            <em>{formatNumber(scopedPlxParticipants.length)} đã vào game</em>
          </div>
          <div className="spc-rank-stat">
            <span>Điểm dẫn đầu</span>
            <strong>{formatNumber(leadingScore)}</strong>
            <em>Ưu tiên: điểm cao → thời lượng ngắn → ít lượt hơn</em>
          </div>
        </div>

        <div className="spc-rank-board-grid spc-rank-board-grid-single">
          <section className="spc-rank-board spc-rank-board-primary">
            <div className="spc-rank-board-head">
              <div>
                <span>Bảng xếp hạng cá nhân</span>
              </div>
              <strong>{formatNumber(livePersonalLeaderboard.length)}</strong>
            </div>
            <div className="spc-rank-list">
              {livePersonalLeaderboard.slice(0, 20).map((item, index) => (
                <div className={`spc-rank-row ${index < 3 ? 'is-podium' : ''} ${item.isLive ? 'is-live' : ''}`} key={`${item.playerName}-${item.groupName}`}>
                  <div className="spc-rank-pos">{index + 1}</div>
                  <div className="spc-rank-player">
                    <strong>{item.playerName}</strong>
                    <span>{item.groupName} · {item.runCount} lần làm{item.isLive ? ' · đang chơi' : ''}</span>
                    <span>{formatEvnspcAttemptRange(item.attemptStartedAt, item.attemptFinishedAt)}</span>
                    <span className="spc-rank-duration">{formatEvnspcAttemptDuration(item.attemptDurationMs)}</span>
                    {item.progress != null ? (
                      <div className="spc-rank-progress" aria-label={`Tiến độ ${item.progress}%`}>
                        <span style={{ width: `${item.progress}%` }} />
                      </div>
                    ) : null}
                  </div>
                  <div className="spc-rank-score">
                    <strong>{formatNumber(item.totalScore)}</strong>
                    <span>{item.isLive ? 'live' : `cao nhất ${formatNumber(item.bestScore)}`}</span>
                  </div>
                </div>
              ))}
              {!livePersonalLeaderboard.length ? <div className="spc-rank-empty">Chưa có học viên/nhóm tham gia game.</div> : null}
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (isPlxGame) {
    return (
      <div className="public-game-page public-game-page--plx-play">
        <div className="public-game-stage">
          {game ? (
            <div className="public-game-shell public-game-shell--full">
              <iframe
                ref={iframeRef}
                className="public-game-iframe public-game-iframe--full"
                title={game.title}
                src={frameUrl}
                allow="autoplay; fullscreen"
              />
            </div>
          ) : (
            <div className="muted-text">Không tìm thấy game để nhúng.</div>
          )}
        </div>
      </div>
    );
  }

  if (publicMode === 'iframe' && publicUrl) {
    return (
      <div className="public-game-page public-game-page--iframe-play">
        <div className="public-game-stage">
          <div className="public-game-shell public-game-shell--full">
            <iframe
              ref={iframeRef}
              className="public-game-iframe public-game-iframe--full"
              title={game?.title || 'Public game'}
              src={frameUrl}
              allow="autoplay; fullscreen"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="public-game-page">
      <SectionHeader
        eye="Public Game"
        title={game ? `${game.title} · Public host` : 'Public game host'}
        subtitle={game ? game.description : 'Trang public cho người dùng truy cập mà không cần đăng nhập.'}
      />

      <div className="public-game-layout">
        <Card title="Màn chơi public">
          {game ? (
            <div className="public-game-shell">
              {isPlxGame ? (
                <iframe
                  ref={iframeRef}
                  className="public-game-iframe"
                  title={game.title}
                  src={frameUrl}
                  allow="autoplay; fullscreen"
                />
              ) : publicMode === 'iframe' && publicUrl ? (
                <iframe
                  ref={iframeRef}
                  className="public-game-iframe"
                  title={game.title}
                  src={frameUrl}
                  allow="autoplay; fullscreen"
                />
              ) : (
                <EvnSpcGameEmbed className="public-game-embed" />
              )}
            </div>
          ) : (
            <div className="muted-text">Chưa có game để nhúng.</div>
          )}
        </Card>
        {!isPlxGame ? (
          <Card title="Gợi ý host">
            <div className="stack compact">
              <div className="bullet-item">Với game khác, host có thể dùng iframe hoặc embed hiện tại.</div>
              <Link className="btn btn-ghost btn-small" to={`/play/${game?.publicSlug || 'plx-01'}`}>
                Mở link public
              </Link>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
