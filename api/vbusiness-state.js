import { enforceRateLimit, RATE_LIMITS } from './_rate-limit.js';

const STATE_ID = 'default';
const META_ENTITY = '__meta';
const RECORD_CHUNK_SIZE = 500;

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

function buildHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function recordIdFor(entityType, item, index) {
  const id = isPlainObject(item) ? item.id || item.code || item.key : '';
  return String(id || `${entityType}_${index + 1}`);
}

function decomposeState(payload) {
  const records = [];
  const meta = {};

  for (const [entityType, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        records.push({
          entity_type: entityType,
          record_id: recordIdFor(entityType, item, index),
          payload: item,
          sort_order: index,
        });
      });
    } else {
      meta[entityType] = value;
    }
  }

  records.push({
    entity_type: META_ENTITY,
    record_id: STATE_ID,
    payload: meta,
    sort_order: 0,
  });
  return records;
}

function assembleState(records) {
  const state = {};
  const grouped = new Map();

  for (const row of records) {
    if (row.entity_type === META_ENTITY) {
      Object.assign(state, row.payload || {});
      continue;
    }
    const list = grouped.get(row.entity_type) || [];
    list.push(row);
    grouped.set(row.entity_type, list);
  }

  for (const [entityType, rows] of grouped.entries()) {
    state[entityType] = rows
      .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
      .map((row) => row.payload);
  }

  return state;
}

function summarizeEntityCounts(payload) {
  const counts = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (Array.isArray(value)) counts[key] = value.length;
  }
  return counts;
}

function resolveActor(payload, body) {
  const actorId = String(body?.actorId || payload?.currentUserId || '').trim();
  const users = Array.isArray(payload?.users) ? payload.users : [];
  const currentRole = String(payload?.currentRole || '').trim();
  const actor = actorId
    ? users.find((user) => String(user.id) === actorId)
    : users.find((user) => String(user.role) === currentRole) || null;
  return {
    actor_id: actor?.id || actorId || currentRole || null,
    actor_name: actor?.full_name || actor?.name || currentRole || null,
  };
}

async function upsertRecordChunks(recordsBaseUrl, headers, records) {
  for (let index = 0; index < records.length; index += RECORD_CHUNK_SIZE) {
    const chunk = records.slice(index, index + RECORD_CHUNK_SIZE);
    await requestJson(`${recordsBaseUrl}?on_conflict=entity_type,record_id`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    });
  }
}

export default async function handler(req, res) {
  const limit = req.method === 'GET'
    ? { windowMs: 60_000, max: 120 }
    : RATE_LIMITS.mutation;
  if (!await enforceRateLimit(req, res, { ...limit, route: 'vbusiness-state' })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ ok: false, error: 'Supabase server config is missing.' });
    return;
  }

  const headers = buildHeaders(serviceRoleKey);
  const baseUrl = `${supabaseUrl}/rest/v1/vbusiness_state`;
  const recordsBaseUrl = `${supabaseUrl}/rest/v1/vbusiness_records`;

  try {
    if (req.method === 'GET') {
      const records = await requestJson(`${recordsBaseUrl}?select=entity_type,record_id,payload,sort_order&order=entity_type.asc,sort_order.asc`, { headers });
      const hasEntityRecords = Array.isArray(records) && records.some((row) => row.entity_type !== META_ENTITY);
      if (hasEntityRecords) {
        res.status(200).json({ ok: true, state: assembleState(records), storage: 'records' });
        return;
      }

      const rows = await requestJson(`${baseUrl}?id=eq.${encodeURIComponent(STATE_ID)}&select=payload,updated_at&limit=1`, { headers });
      const row = Array.isArray(rows) ? rows[0] : null;
      res.status(200).json({ ok: true, state: row?.payload || null, updatedAt: row?.updated_at || null, storage: 'state' });
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readJsonBody(req);
      const payload = body?.state;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        res.status(400).json({ ok: false, error: 'Invalid state payload.' });
        return;
      }

      const records = decomposeState(payload);
      await requestJson(`${recordsBaseUrl}?entity_type=neq.${encodeURIComponent('__never__')}`, {
        method: 'DELETE',
        headers,
      });
      await upsertRecordChunks(recordsBaseUrl, headers, records);

      const rows = await requestJson(`${baseUrl}?on_conflict=id&select=id,updated_at`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([{ id: STATE_ID, payload }]),
      });
      const actor = resolveActor(payload, body);
      try {
        await requestJson(`${supabaseUrl}/rest/v1/vbusiness_audit_events`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify([{
            ...actor,
            action: body?.action || 'save_state',
            entity_counts: summarizeEntityCounts(payload),
            summary: body?.summary || 'Saved VBusiness state from app',
          }]),
        });
      } catch (auditError) {
        console.warn('VBusiness audit insert failed:', auditError.message);
      }
      const row = Array.isArray(rows) ? rows[0] : null;
      res.status(200).json({ ok: true, updatedAt: row?.updated_at || null });
      return;
    }

    if (req.method === 'DELETE') {
      await requestJson(`${recordsBaseUrl}?entity_type=neq.${encodeURIComponent('__never__')}`, {
        method: 'DELETE',
        headers,
      });
      await requestJson(`${baseUrl}?id=eq.${encodeURIComponent(STATE_ID)}`, {
        method: 'DELETE',
        headers,
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('Allow', 'GET, PUT, POST, DELETE');
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'VBusiness state request failed.' });
  }
}
