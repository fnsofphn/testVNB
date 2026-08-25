import { enforceRateLimit, RATE_LIMITS } from './_rate-limit.js';

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

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
  return {
    apikey: apiKey,
    Authorization: authorization || `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

function buildPayload(kind, input, profileId) {
  const common = {
    id: `${input.orderId}::${input.productId}`,
    order_id: input.orderId,
    product_id: input.productId,
    title: input.title,
  };

  if (kind === 'slide_design') {
    return {
      ...common,
      current_version: 1,
      target_slides: 24,
      completed_slides: 0,
      status: 'todo',
      designer_profile_id: profileId,
      qc_reviewer_profile_id: null,
      due_date: null,
      submitted_at: null,
      approved_at: null,
      returned_at: null,
      file_name: null,
      brand_spec: '',
      notes: '',
      checklist: {},
    };
  }

  if (kind === 'voice_over') {
    return {
      ...common,
      current_version: 1,
      estimated_minutes: 18,
      recorded_minutes: 0,
      status: 'todo',
      talent_profile_id: profileId,
      handoff_profile_id: null,
      due_date: null,
      submitted_at: null,
      completed_at: null,
      returned_at: null,
      file_name: null,
      voice_style: '',
      notes: '',
      checklist: {},
    };
  }

  if (kind === 'video_edit') {
    return {
      ...common,
      current_version: 1,
      target_minutes: 18,
      render_progress: 0,
      status: 'todo',
      editor_profile_id: profileId,
      qc_reviewer_profile_id: null,
      due_date: null,
      submitted_at: null,
      approved_at: null,
      returned_at: null,
      file_name: null,
      subtitle_file: null,
      render_preset: '1080p',
      notes: '',
      checklist: {},
    };
  }

  if (kind === 'storyboard') {
    return {
      ...common,
      current_version: 1,
      total_scenes: 12,
      estimated_minutes: 24,
      status: 'todo',
      assignee_profile_id: profileId,
      reviewer_profile_id: null,
      due_date: null,
      submitted_at: null,
      approved_at: null,
      returned_at: null,
      file_name: null,
      notes: '',
    };
  }

  if (kind === 'scorm_package') {
    return {
      ...common,
      current_version: 1,
      status: 'building_quiz',
      owner_profile_id: profileId,
      due_date: null,
      selected_question_ids: [],
      pass_score: 80,
      randomize_questions: true,
      completion_rule: 'watch_video_and_pass_quiz',
      manifest_status: 'draft',
      package_file_name: null,
      notes: '',
    };
  }

  throw new Error('Unsupported workflow kind.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'workflow-record-ensure', ...RATE_LIMITS.mutation })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: 'Workflow record API is not configured.' });
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
    const encodedRequesterId = encodeURIComponent(`eq.${sessionUser.id}`);
    const requesterProfiles = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,role,active,auth_user_id&auth_user_id=${encodedRequesterId}&active=is.true`,
      { headers },
    );
    const requesterProfile = Array.isArray(requesterProfiles) ? requesterProfiles[0] : null;
    if (!requesterProfile) {
      sendJson(res, 403, { ok: false, error: 'No active profile mapped to this session.' });
      return;
    }

    const body = await readJsonBody(req);
    const kind = String(body.kind || '').trim();
    const orderId = String(body.orderId || '').trim();
    const productId = String(body.productId || '').trim();
    const title = String(body.title || productId).trim();
    if (!kind || !orderId || !productId) {
      sendJson(res, 400, { ok: false, error: 'Missing workflow record payload.' });
      return;
    }

    const tableByKind = {
      storyboard: 'vcontent_storyboards',
      slide_design: 'vcontent_slide_designs',
      voice_over: 'vcontent_voice_overs',
      video_edit: 'vcontent_video_edits',
      scorm_package: 'vcontent_scorm_packages',
    };
    const table = tableByKind[kind];
    if (!table) {
      sendJson(res, 400, { ok: false, error: 'Unsupported workflow kind.' });
      return;
    }

    const encodedOrderId = encodeURIComponent(`eq.${orderId}`);
    const encodedProductId = encodeURIComponent(`eq.${productId}`);
    const existing = await requestJson(
      `${supabaseUrl}/rest/v1/${table}?select=*&order_id=${encodedOrderId}&product_id=${encodedProductId}&limit=1`,
      { headers },
    );
    if (Array.isArray(existing) && existing[0]) {
      sendJson(res, 200, { ok: true, record: existing[0] });
      return;
    }

    const payload = buildPayload(kind, { orderId, productId, title }, requesterProfile.id);
    const created = await requestJson(`${supabaseUrl}/rest/v1/${table}?select=*`, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    sendJson(res, 200, { ok: true, record: Array.isArray(created) ? created[0] : created });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}
