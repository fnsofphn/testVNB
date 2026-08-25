import { enforceRateLimit } from './_rate-limit.js';

function getQueryParam(req, name) {
  const url = new URL(req.url || '', 'http://localhost');
  return url.searchParams.get(name) || '';
}

function cleanEntryPath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/');
}

function encodeStoragePath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function getDirectoryPath(filePath) {
  const cleanPath = cleanEntryPath(filePath);
  const parts = cleanPath.split('/');
  parts.pop();
  return parts.join('/');
}

function buildPublicStorageUrl(supabaseUrl, bucket, objectPath) {
  const baseUrl = String(supabaseUrl || '').replace(/\/$/, '');
  return `${baseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeStoragePath(objectPath)}`;
}

function buildApiContentBasePath(packageId, directoryPath) {
  const packageSegment = encodeURIComponent(String(packageId || ''));
  const directorySegments = cleanEntryPath(directoryPath)
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `/api/scorm-content-file/${packageSegment}/${directorySegments ? `${directorySegments}/` : ''}`;
}

function contentTypeForPath(filePath) {
  const normalized = String(filePath || '').toLowerCase();
  if (normalized.endsWith('.html') || normalized.endsWith('.htm')) return 'text/html; charset=utf-8';
  if (normalized.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (normalized.endsWith('.css')) return 'text/css; charset=utf-8';
  if (normalized.endsWith('.json')) return 'application/json; charset=utf-8';
  if (normalized.endsWith('.xml')) return 'application/xml; charset=utf-8';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.svg')) return 'image/svg+xml';
  if (normalized.endsWith('.mp4')) return 'video/mp4';
  if (normalized.endsWith('.woff')) return 'font/woff';
  if (normalized.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

function shouldInjectRuntimePatch(filePath) {
  const normalized = String(filePath || '').toLowerCase();
  return normalized.endsWith('.html') || normalized.endsWith('.htm');
}

function shouldProxyWithContentType(filePath) {
  const normalized = String(filePath || '').toLowerCase();
  return normalized.endsWith('.html')
    || normalized.endsWith('.htm')
    || normalized.endsWith('.js')
    || normalized.endsWith('.css')
    || normalized.endsWith('.json')
    || normalized.endsWith('.xml');
}

function buildScormSeekPatch() {
  return `
<script data-vcontent-scorm-seek-patch="true">
(function () {
  if (window.__vcontentScormSeekPatch) return;
  window.__vcontentScormSeekPatch = true;
  var unlockScheduled = false;
  var unlockRunning = false;

  function setAttributeIfChanged(element, name, value) {
    if (!element || !element.getAttribute || element.getAttribute(name) === value) return;
    element.setAttribute(name, value);
  }

  function removeAttributeIfPresent(element, name) {
    if (!element || !element.hasAttribute || !element.hasAttribute(name)) return;
    element.removeAttribute(name);
  }

  function setStyleIfChanged(element, name, value) {
    if (!element || !element.style || element.style[name] === value) return;
    element.style[name] = value;
  }

  function unlockElement(element) {
    if (!element || !element.setAttribute) return;
    removeAttributeIfPresent(element, 'disabled');
    removeAttributeIfPresent(element, 'data-disabled');
    removeAttributeIfPresent(element, 'readonly');
    setAttributeIfChanged(element, 'aria-disabled', 'false');
    setStyleIfChanged(element, 'pointerEvents', 'auto');
    setStyleIfChanged(element, 'touchAction', 'auto');
  }

  function unlockMedia(media) {
    if (!media) return;
    var hasCustomSeekControl = !!document.querySelector([
      'input[type="range"]',
      '[role="slider"]',
      '[aria-valuemin][aria-valuemax]',
      '[data-acc-text*="Seek"]',
      '[data-acc-text*="seek"]',
      '[aria-label*="Seek"]',
      '[aria-label*="seek"]',
      '.seekbar',
      '.seek-bar',
      '.progressbar',
      '.progress-bar',
      '.slide-progress',
      '.scrubber',
      '.cs-seekcontrol',
      '#seek',
      '#progress-bar'
    ].join(','));
    if (hasCustomSeekControl && media.controls) {
      media.controls = false;
      removeAttributeIfPresent(media, 'controls');
    } else if (!hasCustomSeekControl && !media.controls) {
      media.controls = true;
    }
    if (media.disablePictureInPicture) media.disablePictureInPicture = false;
    removeAttributeIfPresent(media, 'controlsList');
    setStyleIfChanged(media, 'pointerEvents', 'auto');
  }

  function unlockSeekControls() {
    if (unlockRunning) return;
    unlockRunning = true;
    var selectors = [
      'video',
      'audio',
      'input[type="range"]',
      '[role="slider"]',
      '[aria-valuemin][aria-valuemax]',
      '[data-acc-text*="Seek"]',
      '[data-acc-text*="seek"]',
      '[aria-label*="Seek"]',
      '[aria-label*="seek"]',
      '.seekbar',
      '.seek-bar',
      '.progressbar',
      '.progress-bar',
      '.slide-progress',
      '.scrubber',
      '.cs-seekcontrol',
      '#seek',
      '#progress-bar'
    ];

    selectors.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (element) {
        unlockElement(element);
        if (element.tagName === 'VIDEO' || element.tagName === 'AUDIO') unlockMedia(element);
        element.querySelectorAll && element.querySelectorAll('*').forEach(unlockElement);
      });
    });
    unlockRunning = false;
  }

  function scheduleUnlock(delay) {
    if (unlockScheduled) return;
    unlockScheduled = true;
    window.setTimeout(function () {
      unlockScheduled = false;
      unlockSeekControls();
    }, delay || 0);
  }

  scheduleUnlock(0);
  window.addEventListener('load', function () { scheduleUnlock(0); });
  window.addEventListener('hashchange', function () { scheduleUnlock(80); });
  document.addEventListener('click', function () { scheduleUnlock(120); }, true);
  document.addEventListener('transitionend', function () { scheduleUnlock(80); }, true);
  new MutationObserver(function () { scheduleUnlock(120); }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(function () { scheduleUnlock(0); }, 3000);
})();
</script>`;
}

function injectScormBaseHref(html, baseHref) {
  const value = String(html || '');
  if (!baseHref || /<base\s/i.test(value)) return value;
  const tag = `<base href="${String(baseHref).replace(/"/g, '&quot;')}">`;
  if (/<head[^>]*>/i.test(value)) return value.replace(/<head([^>]*)>/i, `<head$1>${tag}`);
  return `${tag}${value}`;
}

function injectScormSeekPatch(html, baseHref = '') {
  const patch = buildScormSeekPatch();
  const value = injectScormBaseHref(html, baseHref);
  if (value.includes('data-vcontent-scorm-seek-patch')) return value;
  if (/<\/body>/i.test(value)) return value.replace(/<\/body>/i, `${patch}</body>`);
  return `${value}${patch}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'scorm-content', windowMs: 60_000, max: 6000 })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ ok: false, error: 'Server SCORM content is not configured.' });
    return;
  }

  try {
    const packageId = String(getQueryParam(req, 'packageId')).trim();
    const filePath = cleanEntryPath(getQueryParam(req, 'path') || 'index_lms.html');
    if (!packageId || !filePath) {
      res.status(400).json({ ok: false, error: 'Missing SCORM content path.' });
      return;
    }

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const packageResult = await admin
      .from('vcontent_eln_scorm_packages')
      .select('storage_bucket,storage_prefix')
      .eq('id', packageId)
      .maybeSingle();
    if (packageResult.error) throw packageResult.error;
    if (!packageResult.data) {
      res.status(404).json({ ok: false, error: 'SCORM package not found.' });
      return;
    }

    const objectPath = `${packageResult.data.storage_prefix}/${filePath}`;

    res.setHeader('Content-Type', contentTypeForPath(filePath));
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    if (req.method === 'HEAD') {
      res.statusCode = 200;
      res.end();
      return;
    }

    if (!shouldProxyWithContentType(filePath)) {
      const publicUrl = buildPublicStorageUrl(supabaseUrl, packageResult.data.storage_bucket, objectPath);
      res.writeHead(302, {
        Location: publicUrl,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      res.end();
      return;
    }

    const downloadResult = await admin.storage.from(packageResult.data.storage_bucket).download(objectPath);
    if (downloadResult.error) throw downloadResult.error;
    let buffer = Buffer.from(await downloadResult.data.arrayBuffer());
    if (shouldInjectRuntimePatch(filePath)) {
      const directoryPath = getDirectoryPath(filePath);
      const apiBasePath = buildApiContentBasePath(packageId, directoryPath);
      buffer = Buffer.from(injectScormSeekPatch(buffer.toString('utf8'), apiBasePath), 'utf8');
    }
    res.statusCode = 200;
    res.end(buffer);
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || error) });
  }
}
