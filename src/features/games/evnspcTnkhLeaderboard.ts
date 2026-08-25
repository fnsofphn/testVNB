import type { PlxGameRunRow } from '@/lib/plxGame';

const EVNSPC_TNKH_TIMING_KEY = 'evnspcTnkhTiming';

export type EvnspcTnkhLeaderboardEntry = {
  playerName: string;
  groupName: string;
  runCount: number;
  totalScore: number;
  bestScore: number;
  latestRankLabel: string;
  latestRunAt: string;
  attemptStartedAt: string | null;
  attemptFinishedAt: string | null;
  attemptDurationMs: number | null;
};

type AttemptTiming = {
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
};

function parseIsoTimestamp(value: unknown) {
  const text = String(value || '').trim();
  const timestamp = text ? Date.parse(text) : Number.NaN;
  return Number.isFinite(timestamp) ? { text, timestamp } : null;
}

function readAttemptTiming(run: PlxGameRunRow): AttemptTiming {
  const raw = run.values_json?.[EVNSPC_TNKH_TIMING_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { startedAt: null, finishedAt: null, durationMs: null };
  }

  const metadata = raw as Record<string, unknown>;
  const startedAt = parseIsoTimestamp(metadata.startedAt);
  const finishedAt = parseIsoTimestamp(metadata.finishedAt);
  const explicitSeconds = Number(metadata.durationSeconds);
  const explicitDuration = Number(metadata.durationMs);
  const calculatedDuration = startedAt && finishedAt ? finishedAt.timestamp - startedAt.timestamp : Number.NaN;
  const durationMs = Number.isFinite(explicitSeconds) && explicitSeconds >= 0
    ? Math.round(explicitSeconds) * 1000
    : Number.isFinite(explicitDuration) && explicitDuration >= 0
      ? Math.round(explicitDuration)
    : Number.isFinite(calculatedDuration) && calculatedDuration >= 0
      ? Math.round(calculatedDuration)
      : null;

  if (!startedAt || !finishedAt || durationMs == null) {
    return { startedAt: null, finishedAt: null, durationMs: null };
  }

  return {
    startedAt: startedAt.text,
    finishedAt: finishedAt.text,
    durationMs,
  };
}

function getRunPlayerKey(run: PlxGameRunRow) {
  const email = String(run.values_json?.email || '').trim().toLocaleLowerCase('vi');
  return String(run.auth_user_id || '').trim()
    || String(run.profile_id || '').trim()
    || email
    || `${String(run.player_name || '').trim()}::${String(run.group_name || '').trim()}`;
}

function compareKnownDuration(left: number | null, right: number | null) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left - right;
}

function compareRunsForRanking(left: PlxGameRunRow, right: PlxGameRunRow) {
  const scoreDifference = (Number(right.total_score) || 0) - (Number(left.total_score) || 0);
  if (scoreDifference) return scoreDifference;
  const durationDifference = compareKnownDuration(readAttemptTiming(left).durationMs, readAttemptTiming(right).durationMs);
  if (durationDifference) return durationDifference;
  return String(left.created_at || '').localeCompare(String(right.created_at || ''));
}

export function buildEvnspcTnkhLeaderboard(runs: PlxGameRunRow[]): EvnspcTnkhLeaderboardEntry[] {
  const runsByPlayer = new Map<string, PlxGameRunRow[]>();

  for (const run of runs) {
    if (run.game_id !== 'evnspc-tnkh-01') continue;
    const key = getRunPlayerKey(run);
    const playerRuns = runsByPlayer.get(key) || [];
    playerRuns.push(run);
    runsByPlayer.set(key, playerRuns);
  }

  const rows = Array.from(runsByPlayer.values()).map((playerRuns) => {
    const rankingRun = playerRuns.slice().sort(compareRunsForRanking)[0];
    const firstCompletedRun = playerRuns.slice().sort((left, right) =>
      String(left.created_at || '').localeCompare(String(right.created_at || '')),
    )[0];
    const timing = readAttemptTiming(firstCompletedRun);
    const latestRunAt = playerRuns.reduce(
      (latest, run) => String(run.created_at || '') > latest ? String(run.created_at || '') : latest,
      '',
    );
    const bestScore = Number(rankingRun.total_score) || 0;

    return {
      playerName: String(rankingRun.player_name || 'Người chơi chưa đặt tên').trim() || 'Người chơi chưa đặt tên',
      groupName: String(rankingRun.group_name || 'Chưa có nhóm').trim() || 'Chưa có nhóm',
      runCount: playerRuns.length,
      totalScore: bestScore,
      bestScore,
      latestRankLabel: String(rankingRun.rank_label || '-'),
      latestRunAt,
      attemptStartedAt: timing.startedAt,
      attemptFinishedAt: timing.finishedAt,
      attemptDurationMs: timing.durationMs,
    };
  });

  return rows.sort((left, right) =>
    right.bestScore - left.bestScore
    || compareKnownDuration(left.attemptDurationMs, right.attemptDurationMs)
    || left.runCount - right.runCount
    || String(left.attemptFinishedAt || left.latestRunAt).localeCompare(String(right.attemptFinishedAt || right.latestRunAt))
    || left.playerName.localeCompare(right.playerName, 'vi'),
  );
}
