import { createHash, randomUUID } from 'node:crypto';
import { enforceRateLimit } from './_rate-limit.js';
import {
  PublicGameTicketError,
  createPublicGameTicket,
  verifyPublicGameTicket,
} from './_public-game-ticket.js';

const MAX_BODY_BYTES = 160 * 1024;
const PUBLIC_GAME_IDS = new Set([
  'plx-01',
  'plx-01-ca-nhan',
  'plx-02',
  'plx-03',
  'vnpt-heart-01',
  'vnpt-heart-02',
  'vnpt-heart-03',
  'evnspc',
  'evnspc-tnkh-01',
]);
const GAME_ADMIN_ROLES = new Set([
  'admin',
  'content_manager',
  'production_manager',
  'training_ops_admin',
]);

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function cleanUuid(value) {
  const text = cleanText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : '';
}

function getBearerToken(req) {
  const authorization = String(req.headers.authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

function getProjectRef(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith('.supabase.co') ? hostname.split('.')[0] : '';
  } catch {
    return '';
  }
}

function hash(value, length = 20) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(payload);
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error('Payload too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Invalid JSON body.');
    error.statusCode = 400;
    throw error;
  }
}

async function createAdmin() {
  const supabaseUrl = cleanText(
    process.env.PUBLIC_GAME_SUPABASE_URL || process.env.SUPABASE_URL,
    500,
  );
  const secretKey = cleanText(
    process.env.PUBLIC_GAME_SUPABASE_SECRET_KEY
      || process.env.PUBLIC_GAME_SUPABASE_SERVICE_ROLE_KEY
      || process.env.SUPABASE_SECRET_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY,
    4096,
  );
  const expectedRef = cleanText(process.env.PUBLIC_GAME_EXPECTED_PROJECT_REF, 80);
  const actualRef = getProjectRef(supabaseUrl);
  if (!supabaseUrl || !secretKey || !expectedRef || actualRef !== expectedRef) {
    const error = new Error('Public game database authority is not configured safely.');
    error.statusCode = 503;
    throw error;
  }
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getVerifiedActor(admin, req, requestedEmail) {
  const token = getBearerToken(req);
  if (!token) return null;
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user?.id) {
    const error = new Error('Invalid bearer token.');
    error.statusCode = 401;
    throw error;
  }
  const { data: profile, error: profileError } = await admin
    .from('vcontent_profiles')
    .select('id,auth_user_id,email,full_name,role,active,student_class,student_group')
    .eq('auth_user_id', authData.user.id)
    .eq('active', true)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.id) {
    const error = new Error('Authenticated profile is unavailable.');
    error.statusCode = 403;
    throw error;
  }
  const email = cleanText(profile.email, 254).toLowerCase();
  if (requestedEmail && email !== requestedEmail) {
    const error = new Error('Authenticated profile does not match game identity.');
    error.statusCode = 403;
    throw error;
  }
  return {
    profileId: String(profile.id),
    authUserId: String(authData.user.id),
    email,
    playerName: cleanText(profile.full_name || profile.email, 160),
    className: cleanText(profile.student_class, 160),
    groupName: cleanText(profile.student_group, 160),
    role: cleanText(profile.role, 80),
  };
}

function mapRun(row) {
  return {
    id: String(row?.id || ''),
    gameId: String(row?.game_id || ''),
    playerName: String(row?.player_name || ''),
    groupName: String(row?.group_name || ''),
    cxScore: Number(row?.cx_score || 0),
    brandPts: Number(row?.brand_pts || 0),
    totalScore: Number(row?.total_score || 0),
    maxStreak: Number(row?.max_streak || 0),
    rankLabel: String(row?.rank_label || ''),
    authorityLevel: String(row?.authority_level || 'legacy_client'),
    createdAt: String(row?.created_at || ''),
  };
}

function mapParticipant(row) {
  return {
    id: String(row?.id || ''),
    gameId: String(row?.game_id || ''),
    participantKey: String(row?.participant_key || ''),
    playerName: String(row?.player_name || ''),
    groupName: String(row?.group_name || ''),
    liveTotalScore: row?.live_total_score == null ? null : Number(row.live_total_score),
    liveProgress: row?.live_progress == null ? null : Number(row.live_progress),
    liveScoreUpdatedAt: row?.live_score_updated_at || null,
    joinedAt: String(row?.joined_at || ''),
    lastSeenAt: String(row?.last_seen_at || ''),
  };
}

function log(level, fields) {
  const line = JSON.stringify({ level, route: 'public-game', module: 'vgamification', ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warning') console.warn(line);
  else console.log(line);
}

function rateLimitForAction(action) {
  return {
    route: `public-game:${action}`,
    windowMs: 60_000,
    max: action === 'touch' ? 12 : action === 'leaderboard' ? 20 : action === 'start' ? 10 : 30,
    mode: process.env.VCONTENT_PUBLIC_AUTHORITY_RATE_LIMIT_MODE,
    failureMode: 'closed',
  };
}

function databaseErrorStatus(error) {
  const code = cleanText(error?.code, 80);
  if (code === '28000') return 401;
  if (code === '42501') return 403;
  if (code === '23505') return 409;
  if (code === '22023' || code === 'P0001') return 400;
  return 0;
}

export default async function handler(req, res) {
  const startedAt = Date.now();
  const requestId = String(req.headers['x-vercel-id'] || req.headers['x-request-id'] || randomUUID());
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const action = cleanText(body.action, 20);
    if (!['start', 'touch', 'submit', 'leaderboard', 'adminLeaderboard', 'adminReset'].includes(action)) {
      sendJson(res, 400, { ok: false, error: 'Invalid public game action.' });
      return;
    }
    const admin = await createAdmin();
    if (action === 'adminLeaderboard' || action === 'adminReset') {
      const actor = await getVerifiedActor(admin, req, '');
      if (!actor || !GAME_ADMIN_ROLES.has(actor.role)) {
        sendJson(res, 403, { ok: false, error: 'Game administration access denied.' });
        return;
      }
      const allowed = await enforceRateLimit(req, res, {
        ...rateLimitForAction(action),
        verifiedIdentity: `public-game-admin:${actor.profileId}`,
      });
      if (!allowed) return;
      const gameId = cleanText(body.gameId, 160);
      const classId = cleanText(body.classId, 240);
      const activityId = cleanText(body.activityId, 80);
      if (!gameId) {
        sendJson(res, 400, { ok: false, error: 'Game ID is required.' });
        return;
      }
      if (action === 'adminReset') {
        const target = cleanText(body.target, 20);
        if (actor.role === 'training_ops_admin' && !activityId && !classId) {
          sendJson(res, 403, {
            ok: false,
            error: 'Training operations reset requires class or activity scope.',
          });
          return;
        }
        let runsDelete = admin.from('plx_game_runs').delete().eq('game_id', gameId);
        let participantsDelete = admin.from('plx_game_participants').delete().eq('game_id', gameId);
        if (activityId) {
          runsDelete = runsDelete.eq('activity_id', activityId);
          participantsDelete = participantsDelete.eq('activity_id', activityId);
        } else if (classId) {
          runsDelete = runsDelete.eq('class_id', classId);
          participantsDelete = participantsDelete.eq('class_id', classId);
        }
        if (!target || target === 'runs') {
          const runsDeleteResult = await runsDelete;
          if (runsDeleteResult.error) throw runsDeleteResult.error;
        }
        if (!target || target === 'participants') {
          const participantsDeleteResult = await participantsDelete;
          if (participantsDeleteResult.error) throw participantsDeleteResult.error;
        }
        log('warning', {
          event: 'public_game_admin_reset',
          requestId,
          actorHash: hash(actor.profileId),
          gameHash: hash(gameId),
          scoped: Boolean(activityId || classId),
          totalMs: Date.now() - startedAt,
        });
        sendJson(res, 200, { ok: true });
        return;
      }
      let query = admin
        .from('plx_game_runs')
        .select('id,game_id,player_name,group_name,cx_score,brand_pts,total_score,max_streak,rank_label,authority_level,created_at')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (activityId) query = query.eq('activity_id', activityId);
      else if (classId) query = query.eq('class_id', classId);
      let participantsQuery = admin
        .from('plx_game_participants')
        .select('id,game_id,participant_key,player_name,group_name,live_total_score,live_progress,live_score_updated_at,joined_at,last_seen_at')
        .eq('game_id', gameId)
        .order('last_seen_at', { ascending: false })
        .limit(1000);
      if (activityId) participantsQuery = participantsQuery.eq('activity_id', activityId);
      else if (classId) participantsQuery = participantsQuery.eq('class_id', classId);
      const [runsResult, participantsResult] = await Promise.all([query, participantsQuery]);
      if (runsResult.error) throw runsResult.error;
      if (participantsResult.error) throw participantsResult.error;
      sendJson(res, 200, {
        ok: true,
        runs: (runsResult.data || []).map(mapRun),
        participants: (participantsResult.data || []).map(mapParticipant),
        generatedAt: new Date().toISOString(),
      });
      return;
    }

    if (action === 'start') {
      const gameId = cleanText(body.gameId, 160);
      const classId = cleanText(body.classId, 240);
      const activityId = cleanText(body.activityId, 80);
      const email = cleanText(body.email, 254).toLowerCase();
      const playerName = cleanText(body.playerName, 160);
      const className = cleanText(body.className, 160);
      const groupName = cleanText(body.groupName, 160);
      const participantId = cleanText(body.participantId, 160);
      const idempotencyKey = cleanText(body.idempotencyKey, 200);
      if (
        !gameId || (!activityId && !PUBLIC_GAME_IDS.has(gameId))
        || !email.includes('@') || playerName.length < 2
        || participantId.length < 8 || idempotencyKey.length < 16
      ) {
        sendJson(res, 400, { ok: false, error: 'Invalid public game start payload.' });
        return;
      }
      const actor = await getVerifiedActor(admin, req, email);
      if (activityId && !actor) {
        sendJson(res, 401, { ok: false, error: 'Class game requires authentication.' });
        return;
      }
      const allowed = await enforceRateLimit(req, res, {
        ...rateLimitForAction(action),
        ...(actor ? { verifiedIdentity: `public-game-start:${actor.profileId}` } : {}),
      });
      if (!allowed) return;
      const { data, error } = await admin.rpc('vcontent_start_public_game_session', {
        p_game_id: gameId,
        p_class_id: classId,
        p_activity_id: activityId,
        p_verified_profile_id: actor?.profileId || null,
        p_auth_user_id: actor?.authUserId || null,
        p_email: actor?.email || email,
        p_player_name: actor?.playerName || playerName,
        p_class_name: actor?.className || className,
        p_group_name: actor?.groupName || groupName,
        p_participant_key: `client:${participantId}`,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      const ticket = createPublicGameTicket(data);
      log('info', {
        event: 'public_game_started',
        requestId,
        gameHash: hash(gameId),
        sessionHash: hash(data?.sessionId),
        scoped: Boolean(activityId),
        verifiedProfile: Boolean(actor),
        resumed: Boolean(data?.resumed),
        totalMs: Date.now() - startedAt,
      });
      sendJson(res, 200, { ok: true, session: { ...data, ticket } });
      return;
    }

    const sessionId = cleanUuid(body.sessionId);
    const gameId = cleanText(body.gameId, 160);
    if (!sessionId || !gameId) {
      sendJson(res, 400, { ok: false, error: 'Invalid public game session.' });
      return;
    }
    const ticket = verifyPublicGameTicket(body.ticket, { sessionId, gameId });
    const allowed = await enforceRateLimit(req, res, {
      ...rateLimitForAction(action),
      verifiedIdentity: `public-game-session:${ticket.sessionId}`,
    });
    if (!allowed) return;

    if (action === 'touch') {
      const liveTotalScore = body.liveTotalScore == null ? null : Math.round(Number(body.liveTotalScore));
      const liveProgress = body.liveProgress == null ? null : Math.round(Number(body.liveProgress));
      const { data, error } = await admin.rpc('vcontent_touch_public_game_session', {
        p_session_id: sessionId,
        p_live_total_score: Number.isFinite(liveTotalScore) ? liveTotalScore : null,
        p_live_progress: Number.isFinite(liveProgress) ? liveProgress : null,
      });
      if (error) throw error;
      sendJson(res, 200, { ok: true, participant: data });
      return;
    }

    if (action === 'submit') {
      const idempotencyKey = cleanText(body.idempotencyKey, 200);
      const cxScore = Math.round(Number(body.cxScore) || 0);
      const brandPts = Math.round(Number(body.brandPts) || 0);
      const maxStreak = Math.round(Number(body.maxStreak) || 0);
      const values = body.values && typeof body.values === 'object' && !Array.isArray(body.values)
        ? body.values
        : {};
      const answers = Array.isArray(body.answers) ? body.answers : [];
      if (idempotencyKey.length < 16) {
        sendJson(res, 400, { ok: false, error: 'Invalid public game submit payload.' });
        return;
      }
      const { data, error } = await admin.rpc('vcontent_submit_public_game_run', {
        p_session_id: sessionId,
        p_cx_score: cxScore,
        p_brand_pts: brandPts,
        p_max_streak: maxStreak,
        p_rank_label: cleanText(body.rankLabel, 160),
        p_values: values,
        p_answers: answers,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      log('info', {
        event: 'public_game_submitted',
        requestId,
        gameHash: hash(gameId),
        sessionHash: hash(sessionId),
        runHash: hash(data?.run?.id),
        duplicate: Boolean(data?.duplicate),
        authorityLevel: data?.run?.authorityLevel,
        totalMs: Date.now() - startedAt,
      });
      sendJson(res, 200, { ok: true, ...data });
      return;
    }

    let runsQuery = admin
      .from('plx_game_runs')
      .select('id,game_id,player_name,group_name,cx_score,brand_pts,total_score,max_streak,rank_label,authority_level,created_at')
      .eq('game_id', gameId)
      .order('created_at', { ascending: false })
      .limit(500);
    let participantsQuery = admin
      .from('plx_game_participants')
      .select('id,game_id,participant_key,player_name,group_name,live_total_score,live_progress,live_score_updated_at,joined_at,last_seen_at')
      .eq('game_id', gameId)
      .order('last_seen_at', { ascending: false })
      .limit(1000);
    if (ticket.activityId) {
      runsQuery = runsQuery.eq('activity_id', ticket.activityId);
      participantsQuery = participantsQuery.eq('activity_id', ticket.activityId);
    } else if (ticket.classId) {
      runsQuery = runsQuery.eq('class_id', ticket.classId);
      participantsQuery = participantsQuery.eq('class_id', ticket.classId);
    }
    const [runsResult, participantsResult] = await Promise.all([runsQuery, participantsQuery]);
    if (runsResult.error) throw runsResult.error;
    if (participantsResult.error) throw participantsResult.error;
    sendJson(res, 200, {
      ok: true,
      runs: (runsResult.data || []).map(mapRun),
      participants: (participantsResult.data || []).map(mapParticipant),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const status = Number(error?.statusCode)
      || (error instanceof PublicGameTicketError ? 401 : databaseErrorStatus(error) || 500);
    log(status >= 500 ? 'error' : 'warning', {
      event: 'public_game_failed',
      requestId,
      status,
      code: cleanText(error?.code, 80) || 'PUBLIC_GAME_ERROR',
      error: cleanText(error?.message, 220),
      totalMs: Date.now() - startedAt,
    });
    sendJson(res, status, {
      ok: false,
      error: status >= 500
        ? 'Public game authority is temporarily unavailable.'
        : cleanText(error?.message, 220),
    });
  }
}
