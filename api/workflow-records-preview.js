import { enforceRateLimit } from './_rate-limit.js';

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = typeof data === 'string' ? data : data?.msg || data?.message || JSON.stringify(data);
    const error = new Error(message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function buildHeaders(apiKey, authorization) {
  const headers = {
    apikey: apiKey,
    Authorization: authorization || `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  return headers;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function toAuthProfile(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    authUserId: profile.auth_user_id || null,
    email: profile.email || null,
    fullName: profile.full_name,
    role: profile.role,
    companyId: profile.company_id || null,
    organizationId: profile.organization_id || null,
    title: profile.title || null,
    accessScope: profile.access_scope || 'self',
    phone: null,
    avatarUrl: null,
  };
}

async function findActiveProfileForSession(supabaseUrl, headers, sessionUser) {
  const authUserId = String(sessionUser?.id || '').trim();
  if (authUserId) {
    const profiles = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,email,full_name,role,company_id,organization_id,title,active,access_scope,auth_user_id&auth_user_id=${encodeURIComponent(`eq.${authUserId}`)}&active=is.true&limit=1`,
      { headers },
    );
    if (Array.isArray(profiles) && profiles[0]) return profiles[0];
  }

  const email = normalizeEmail(sessionUser?.email);
  if (email) {
    const profiles = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,email,full_name,role,company_id,organization_id,title,active,access_scope,auth_user_id&email=${encodeURIComponent(`eq.${email}`)}&active=is.true&limit=1`,
      { headers },
    );
    if (Array.isArray(profiles) && profiles[0]) return profiles[0];
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'workflow-records-preview', windowMs: 60_000, max: 90 })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: 'Server preview is not configured.' });
    return;
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      sendJson(res, 401, { ok: false, error: 'Missing session token.' });
      return;
    }

    const sessionUser = await requestJson(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: buildHeaders(anonKey, `Bearer ${token}`),
    });

    const headers = buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`);
    const viewerProfileRow = await findActiveProfileForSession(supabaseUrl, headers, sessionUser);

    const viewerProfile = toAuthProfile(viewerProfileRow);
    if (!viewerProfile) {
      sendJson(res, 403, { ok: false, error: 'No active profile mapped to this session.' });
      return;
    }

    const [storyboards, slideDesigns, voiceOvers, videoEdits, scormPackages] = await Promise.all([
      requestJson(`${supabaseUrl}/rest/v1/vcontent_storyboards?select=*&order=updated_at.desc`, { headers }),
      requestJson(`${supabaseUrl}/rest/v1/vcontent_slide_designs?select=*&order=updated_at.desc`, { headers }),
      requestJson(`${supabaseUrl}/rest/v1/vcontent_voice_overs?select=*&order=updated_at.desc`, { headers }),
      requestJson(`${supabaseUrl}/rest/v1/vcontent_video_edits?select=*&order=updated_at.desc`, { headers }),
      requestJson(`${supabaseUrl}/rest/v1/vcontent_scorm_packages?select=*&order=updated_at.desc`, { headers }),
    ]);

    sendJson(res, 200, {
      ok: true,
      viewerProfile,
      storyboards: Array.isArray(storyboards) ? storyboards : [],
      slideDesigns: Array.isArray(slideDesigns) ? slideDesigns : [],
      voiceOvers: Array.isArray(voiceOvers) ? voiceOvers : [],
      videoEdits: Array.isArray(videoEdits) ? videoEdits : [],
      scormPackages: Array.isArray(scormPackages) ? scormPackages : [],
    });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}
