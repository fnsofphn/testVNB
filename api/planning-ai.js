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

function extractText(responseJson) {
  const candidates = responseJson?.candidates || [];
  const first = candidates[0];
  const parts = first?.content?.parts || [];
  return parts.map((part) => part?.text || '').join('\n').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'planning-ai', ...RATE_LIMITS.ai })) return;

  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    sendJson(res, 500, { ok: false, error: 'Gemini API key is not configured.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const planningContext = String(body.planningContext || '').trim();
    const orderId = String(body.orderId || '').trim();
    const bottlenecks = String(body.bottlenecks || '').trim();
    const teamCapacity = body.teamCapacity || {};

    if (!planningContext || !orderId) {
      sendJson(res, 400, { ok: false, error: 'Missing planning context.' });
      return;
    }

    const prompt = [
      'Ban la AI planner cho production workflow VContent.',
      'Muc tieu: de xuat ke hoach toi uu de max ping cho don hang nhung khong vuot deadline client.',
      'Tra ve JSON hop le, khong markdown, voi cau truc:',
      '{',
      '  "summary": string,',
      '  "risks": string[],',
      '  "suggestedAdjustments": [{"productId": string, "stageCode": string, "startDate": "YYYY-MM-DD", "dueDate": "YYYY-MM-DD", "owner": string, "reason": string}],',
      '  "capacityNotes": string[]',
      '}',
      '',
      `Order ID: ${orderId}`,
      `Team capacity: ${JSON.stringify(teamCapacity)}`,
      `Known bottlenecks: ${bottlenecks || 'none'}`,
      'Planning context JSON:',
      planningContext,
    ].join('\n');

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      sendJson(res, response.status, {
        ok: false,
        error: payload?.error?.message || `Gemini request failed with ${response.status}.`,
      });
      return;
    }

    const rawText = extractText(payload);
    let parsed = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = { summary: rawText || 'No AI output.', risks: [], suggestedAdjustments: [], capacityNotes: [] };
    }

    sendJson(res, 200, {
      ok: true,
      result: parsed,
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}
