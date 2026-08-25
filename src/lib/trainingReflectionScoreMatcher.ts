export type ReflectionScoreStudent = {
  profileId?: string | null;
  email?: string | null;
  fullName?: string | null;
};

export type ReflectionScoreSubmission = {
  activityId?: string | null;
  studentProfileId?: string | null;
  email?: string | null;
  respondentName?: string | null;
  score?: number | string | null;
};

function scoreNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeName(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');
}

export function buildReflectionScoresByProfile(input: {
  activityIds: string[];
  students: ReflectionScoreStudent[];
  submissions: ReflectionScoreSubmission[];
}) {
  const activityIdSet = new Set(input.activityIds.map((id) => String(id || '').trim()).filter(Boolean));
  const profileIds = new Set(input.students.map((student) => String(student.profileId || '').trim()).filter(Boolean));
  const profileByEmail = new Map<string, string>();
  const profileByName = new Map<string, string>();

  for (const student of input.students) {
    const profileId = String(student.profileId || '').trim();
    if (!profileId) continue;
    const email = normalizeEmail(student.email);
    if (email && !profileByEmail.has(email)) profileByEmail.set(email, profileId);
    const name = normalizeName(student.fullName);
    if (name && !profileByName.has(name)) profileByName.set(name, profileId);
  }

  const bestByProfileActivity = new Map<string, number>();
  for (const submission of input.submissions) {
    const activityId = String(submission.activityId || '').trim();
    if (!activityId || (activityIdSet.size && !activityIdSet.has(activityId))) continue;
    const score = scoreNumber(submission.score);
    if (score == null) continue;

    const directProfileId = String(submission.studentProfileId || '').trim();
    const profileId = directProfileId && (!profileIds.size || profileIds.has(directProfileId))
      ? directProfileId
      : profileByEmail.get(normalizeEmail(submission.email)) || profileByName.get(normalizeName(submission.respondentName)) || '';
    if (!profileId) continue;

    const key = `${profileId}::${activityId}`;
    bestByProfileActivity.set(key, Math.max(score, bestByProfileActivity.get(key) ?? 0));
  }

  const scoresByProfile = new Map<string, number[]>();
  bestByProfileActivity.forEach((score, key) => {
    const profileId = key.split('::')[0];
    scoresByProfile.set(profileId, [...(scoresByProfile.get(profileId) || []), score]);
  });

  return new Map([...scoresByProfile.entries()].map(([profileId, scores]) => [
    profileId,
    Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100,
  ]));
}
