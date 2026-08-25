import type { StudentSurveyForm, StudentSurveyFormInput } from '@/lib/studentSurvey';

type SurveyCloneSource = {
  id: string;
  title: string;
  intro: string;
  settings: Record<string, unknown>;
};

type SurveyCloneDefaults = {
  id: string;
  title: string;
  bannerSubtitle: string;
};

function sanitizeCloneId(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function cloneJsonObject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value || {}));
}

function nextUniqueId(sourceId: string, existingIds: Set<string>) {
  const sanitizedSource = sanitizeCloneId(sourceId);
  const match = sanitizedSource.match(/^(.*?)(\d+)$/);
  const prefix = match?.[1] || `${sanitizedSource || 'survey'}-copy-`;
  const start = match ? Number(match[2]) + 1 : 1;

  for (let index = start; index < start + 1000; index += 1) {
    const candidate = `${prefix}${index}`;
    if (!existingIds.has(candidate)) return candidate;
  }

  return `${prefix}${Date.now()}`;
}

function replaceClassNumber(value: string, nextNumber: number | null, fallbackSuffix: string) {
  const text = String(value || '').trim();
  if (!text) return fallbackSuffix;
  if (nextNumber != null && /lớp\s*\d+/i.test(text)) {
    return text.replace(/(lớp\s*)\d+/i, `$1${nextNumber}`);
  }
  if (nextNumber != null && /lop\s*\d+/i.test(text)) {
    return text.replace(/(lop\s*)\d+/i, `$1${nextNumber}`);
  }
  return `${text} (bản sao)`;
}

function inferTrailingNumber(value: string) {
  const match = String(value || '').match(/(\d+)$/);
  return match ? Number(match[1]) : null;
}

export function suggestStudentSurveyDuplicateDefaults(
  source: SurveyCloneSource,
  existingForms: Array<Pick<StudentSurveyForm, 'id' | 'title'>>,
): SurveyCloneDefaults {
  const existingIds = new Set(existingForms.map((form) => sanitizeCloneId(form.id)).filter(Boolean));
  const id = nextUniqueId(source.id, existingIds);
  const nextNumber = inferTrailingNumber(id);
  const title = replaceClassNumber(source.title, nextNumber, `${source.title || source.id} (bản sao)`);
  const bannerSubtitle = nextNumber != null ? `LỚP ${nextNumber}` : String(source.settings?.bannerSubtitle || 'Bản sao');
  return { id, title, bannerSubtitle };
}

export function buildStudentSurveyDuplicateInput(
  source: SurveyCloneSource,
  input: Partial<SurveyCloneDefaults>,
): StudentSurveyFormInput {
  const id = sanitizeCloneId(input.id || '');
  const title = String(input.title || '').trim();
  const bannerSubtitle = String(input.bannerSubtitle || '').trim();
  const settings = cloneJsonObject(source.settings || {});

  return {
    id,
    title,
    intro: source.intro,
    settings: {
      ...settings,
      browserTitle: title,
      bannerSubtitle,
    },
  };
}
