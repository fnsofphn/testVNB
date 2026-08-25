const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

function sanitizeCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function getOptions(question) {
  return Array.isArray(question?.options) ? question.options : [];
}

async function callRpc(name, params) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase is not configured.');
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const error = new Error(text || `RPC failed: ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    } catch (error) {
      lastError = error;
      const status = Number(error && error.status ? error.status : 0);
      const message = String(error && error.message ? error.message : error || '');
      const retryable = status === 0 || status === 408 || status === 425 || status === 429 || status >= 500 || /timeout|network|connection|closed|temporarily|rate limit/i.test(message);
      if (!retryable || attempt >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 160 + attempt * 260 + Math.floor(Math.random() * 160)));
    }
  }
  throw lastError || new Error('RPC failed.');
}

function renderJoinForm(code) {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>V-events</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100dvh; background: #eef6ff; color: #172033; }
    main { display: grid; gap: 22px; padding: max(36px, env(safe-area-inset-top)) 22px 36px; }
    .brand { display: flex; align-items: center; gap: 12px; font-size: 28px; font-weight: 900; }
    .mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 10px; background: #4f46e5; color: #fff; }
    h1 { margin: 48px 0 0; font-size: clamp(38px, 10vw, 62px); line-height: 1.08; letter-spacing: 0; }
    p { margin: 0; color: #506078; font-size: 18px; line-height: 1.45; }
    form { display: grid; gap: 12px; margin-top: 20px; }
    input, button { min-height: 56px; border-radius: 999px; border: 1px solid #404040; font: inherit; font-size: 20px; }
    input { background: #fff; color: #172033; padding: 0 20px; text-transform: uppercase; }
    button { background: #2563eb; color: #fff; font-weight: 900; }
  </style>
</head>
<body>
  <main>
    <div class="brand"><span class="mark">VE</span><span>V-events</span></div>
    <h1>Nhập mã tham gia</h1>
    <p>Quét QR từ màn hình presenter hoặc nhập mã để vào câu hỏi đang mở.</p>
    <form action="/v-events/join/${escapeHtml(code)}" method="get" onsubmit="event.preventDefault(); var c=document.getElementById('code').value.replace(/[^a-zA-Z0-9]/g,'').toUpperCase(); if(c) location.href='/v-events/join/'+encodeURIComponent(c);">
      <input id="code" value="${escapeHtml(code)}" placeholder="Ví dụ: HCMC001" autocomplete="off" />
      <button type="submit">Tham gia</button>
    </form>
  </main>
</body>
</html>`;
}

function renderPage(code, payload, errorMessage = '') {
  const event = payload?.event || null;
  const question = payload?.activeQuestion || null;
  const response = payload?.response || null;
  const options = getOptions(question);
  const canAnswer = event?.status === 'active' && event?.participation_enabled !== false && question?.status === 'open';
  const optionButtons = options.map((option) => {
    const selected = response?.option_id === option.id;
    return `<button class="option${selected ? ' is-selected' : ''}" type="button" data-option-id="${escapeHtml(option.id)}">${escapeHtml(option.label)}</button>`;
  }).join('');

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${escapeHtml(question?.title || event?.title || 'V-events')}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100dvh; background: linear-gradient(180deg, #eef6ff 0%, #f8fbff 58%, #ffffff 100%); color: #172033; }
    main { min-height: 100dvh; padding: max(26px, env(safe-area-inset-top)) 22px max(34px, env(safe-area-inset-bottom)); }
    .progress { position: fixed; inset: 0 0 auto; height: 8px; background: linear-gradient(90deg, #2563eb 0 52%, #cfe0ff 52%); }
    .brand { display: flex; align-items: center; gap: 12px; margin-top: 54px; font-size: 28px; font-weight: 950; }
    .mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 10px; background: #4f46e5; color: #fff; }
    .meta { margin: 26px 0 0; color: #4770b8; font-size: 15px; font-weight: 850; letter-spacing: 0.08em; text-transform: uppercase; }
    h1 { margin: 18px 0 42px; max-width: 900px; font-size: clamp(36px, 9vw, 60px); line-height: 1.08; letter-spacing: 0; }
    .empty { margin-top: 52px; color: #506078; font-size: 22px; line-height: 1.45; }
    .notice { margin: 20px 0; border: 1px solid #bbf7d0; border-radius: 18px; background: #f0fdf4; color: #166534; padding: 14px 16px; font-size: 16px; }
    .notice.error { border-color: #fecaca; background: #fff1f2; color: #b91c1c; }
    .section-label { margin: 0 0 16px; color: #172033; font-size: 22px; }
    .options { display: grid; gap: 18px; }
    .option { width: 100%; min-height: 76px; border: 2px solid #c9d8ef; border-radius: 24px; background: #fff; color: #172033; cursor: pointer; padding: 18px 26px; text-align: left; font: inherit; font-size: 25px; line-height: 1.25; box-shadow: 0 10px 26px rgba(37, 99, 235, 0.08); }
    .option.is-selected { border-color: #2563eb; background: #dbeafe; color: #10244a; }
    .actions { margin-top: 26px; }
    .submit { width: 100%; min-height: 60px; border: 0; border-radius: 999px; background: #2563eb; color: #fff; font: inherit; font-size: 20px; font-weight: 950; box-shadow: 0 12px 28px rgba(37, 99, 235, 0.24); }
    .submit:disabled { opacity: 0.5; }
  </style>
</head>
<body>
  <div class="progress" aria-hidden="true"></div>
  <main>
    <div class="brand"><span class="mark">VE</span><span>V-events</span></div>
    <div class="meta">${escapeHtml(code)}${question ? ` - Câu ${escapeHtml(question.question_number || '')}` : ''}</div>
    ${question ? `<h1 id="question-title">${escapeHtml(question.title)}</h1>` : `<h1>Chờ câu hỏi</h1>`}
    ${errorMessage ? `<div class="notice error">${escapeHtml(errorMessage)}</div>` : ''}
    ${!question ? `<div class="empty">Presenter chưa mở câu hỏi cho mã này. Màn hình sẽ tự cập nhật.</div>` : ''}
    ${question ? `<h2 class="section-label">${canAnswer ? 'Bình chọn ý kiến' : 'Câu hỏi đang đóng'}</h2><div class="options" id="options">${optionButtons}</div><div class="actions"><button class="submit" id="submit" disabled>Gửi ý kiến</button></div>` : ''}
    <div id="notice"></div>
  </main>
  <script>
    window.__VEVENT__ = ${jsonScript({ code, payload, supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY })};
  </script>
  <script>
    (function () {
      var state = window.__VEVENT__ || {};
      var code = state.code;
      var selected = state.payload && state.payload.response ? state.payload.response.option_id : '';
      var participantKey = localStorage.getItem('vcontent.vEvents.participant.' + code);
      if (!participantKey) {
        participantKey = 'anon-' + code + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        localStorage.setItem('vcontent.vEvents.participant.' + code, participantKey);
      }
      function rpc(name, body) {
        var lastError = null;
        function once(attempt) {
          return fetch(state.supabaseUrl + '/rest/v1/rpc/' + name, {
            method: 'POST',
            headers: { apikey: state.anonKey, authorization: 'Bearer ' + state.anonKey, 'content-type': 'application/json' },
            body: JSON.stringify(body)
          }).then(function (res) {
            if (!res.ok) return res.text().then(function (text) {
              var error = new Error(text || ('HTTP ' + res.status));
              error.status = res.status;
              throw error;
            });
            return res.json();
          }).catch(function (error) {
            lastError = error;
            var status = Number(error && error.status ? error.status : 0);
            var message = String(error && error.message ? error.message : error || '');
            var retryable = status === 0 || status === 408 || status === 425 || status === 429 || status >= 500 || /timeout|network|connection|closed|temporarily|rate limit/i.test(message);
            if (!retryable || attempt >= 2) throw lastError;
            var delay = 180 + attempt * 280 + Math.floor(Math.random() * 180);
            return new Promise(function (resolve) { setTimeout(resolve, delay); }).then(function () { return once(attempt + 1); });
          });
        }
        return once(0);
      }
      function showNotice(text, error) {
        var node = document.getElementById('notice');
        if (!node) return;
        node.innerHTML = '<div class="notice' + (error ? ' error' : '') + '">' + String(text).replace(/[&<>]/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]; }) + '</div>';
      }
      function questionSignature(payload) {
        var question = payload && payload.activeQuestion;
        if (!question) return 'none';
        var options = Array.isArray(question.options) ? question.options : [];
        return [
          question.id || '',
          question.status || '',
          question.question_number || '',
          options.map(function (option) { return [option.id, option.label].join(':'); }).join('|')
        ].join('::');
      }
      function updateSelected(next) {
        selected = next;
        document.querySelectorAll('.option').forEach(function (button) {
          button.classList.toggle('is-selected', button.getAttribute('data-option-id') === selected);
        });
        var submit = document.getElementById('submit');
        if (submit) submit.disabled = !selected;
      }
      document.querySelectorAll('.option').forEach(function (button) {
        button.addEventListener('click', function () { updateSelected(button.getAttribute('data-option-id') || ''); });
      });
      updateSelected(selected);
      var submit = document.getElementById('submit');
      if (submit) {
        submit.addEventListener('click', function () {
          var question = state.payload && state.payload.activeQuestion;
          if (!question || !selected) return;
          submit.disabled = true;
          submit.textContent = 'Đang gửi...';
          rpc('vcontent_submit_live_event_response', {
            p_code: code,
            p_question_id: question.id,
            p_participant_key: participantKey,
            p_option_id: selected,
            p_response_value: ''
          }).then(function () {
            submit.textContent = 'Đã ghi nhận';
            showNotice('Đã ghi nhận ý kiến.');
          }).catch(function (error) {
            submit.textContent = 'Gửi ý kiến';
            submit.disabled = false;
            showNotice(error.message || 'Không gửi được ý kiến.', true);
          });
        });
      }
      function touch() {
        rpc('vcontent_touch_live_event_participant', { p_code: code, p_participant_key: participantKey }).catch(function () {});
      }
      setTimeout(touch, 0);
      setInterval(touch, 25000);
      var currentSignature = questionSignature(state.payload);
      var pollDelay = 2200 + Math.floor(Math.random() * 800);
      setInterval(function () {
        rpc('vcontent_get_live_event_public_by_code', {
          p_code: code,
          p_participant_key: participantKey,
          p_touch_participant: false
        }).then(function (payload) {
          var nextSignature = questionSignature(payload);
          if (nextSignature !== currentSignature) {
            location.reload();
          }
        }).catch(function () {});
      }, pollDelay);
    })();
  </script>
</body>
</html>`;
}

export default async function handler(req, res) {
  const code = sanitizeCode(firstQueryValue(req.query.code));
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!code) {
    res.status(200).send(renderJoinForm(''));
    return;
  }

  try {
    const participantKey = `server-preview-${Date.now().toString(36)}`;
    const payload = await callRpc('vcontent_get_live_event_public_by_code', {
      p_code: code,
      p_participant_key: participantKey,
      p_touch_participant: false,
    });
    res.status(200).send(renderPage(code, payload, payload ? '' : 'Mã V-event không tồn tại hoặc chưa được mở.'));
  } catch (error) {
    res.status(200).send(renderPage(code, null, error instanceof Error ? error.message : 'Không tải được V-event.'));
  }
}
