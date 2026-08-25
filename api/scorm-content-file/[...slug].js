import scormContentHandler from '../scorm-content.js';

export default async function handler(req, res) {
  const rawSlug = req.query?.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug : String(rawSlug || '').split('/').filter(Boolean);
  const [packageId = '', ...pathParts] = slug;
  const filePath = pathParts.join('/') || 'index_lms.html';
  req.url = `/api/scorm-content?packageId=${encodeURIComponent(packageId)}&path=${encodeURIComponent(filePath)}`;
  return scormContentHandler(req, res);
}
