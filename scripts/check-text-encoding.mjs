import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = ['src', 'api', 'supabase'];
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.html',
  '.css',
  '.md',
  '.sql',
]);

const IGNORED_RELATIVE_PATHS = new Set(['src/assets/EVNSPC_KhaoSat_TNKH.template.html']);

const suspiciousPatterns = [
  { label: 'replacement-char', regex: /\uFFFD/ },
  { label: 'mojibake-a-grave', regex: /Ã|Ä|Æ/ },
  { label: 'mojibake-vietnamese', regex: /áº|á»|á¼|á¸|á»¥|Ä‘|Ä|Æ°|Æ¡|Æ»|Æ¯/ },
  { label: 'mojibake-symbols', regex: /â€”|â€“|â€œ|â€\x9d|â€˜|â€™|â€¢|â†|âœ|ðŸ/ },
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }
    if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function getLineNumber(content, index) {
  return content.slice(0, index).split('\n').length;
}

const violations = [];

for (const relativeDir of TARGET_DIRS) {
  const fullDir = path.join(ROOT, relativeDir);
  const files = await walk(fullDir).catch(() => []);

  for (const file of files) {
    const relativePath = path.relative(ROOT, file).replaceAll('\\', '/');
    if (IGNORED_RELATIVE_PATHS.has(relativePath)) continue;

    const buffer = await readFile(file);
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      violations.push(`${relativePath}:1 UTF-8 BOM detected`);
    }

    const content = buffer.toString('utf8');
    for (const pattern of suspiciousPatterns) {
      const match = pattern.regex.exec(content);
      if (!match) continue;
      violations.push(
        `${relativePath}:${getLineNumber(content, match.index)} Suspicious text encoding (${pattern.label})`,
      );
      break;
    }
  }
}

if (violations.length) {
  console.error('Text encoding check failed:\n');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Text encoding check passed.');
