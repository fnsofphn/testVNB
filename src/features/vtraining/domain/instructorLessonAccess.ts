export type InstructorLessonPlanId = '01' | '02a' | '02b' | '03a' | '03b';

export type InstructorLessonPlan = {
  id: InstructorLessonPlanId;
  route: string;
  label: string;
  title: string;
  shortTitle: string;
};

export type InstructorLessonPlanGrant = {
  instructorProfileId?: string | null;
  instructorEmail?: string | null;
  lessonPlanId: string;
};

export type InstructorLessonAccessInput = {
  profileId?: string | null;
  email?: string | null;
  classLessonGrants?: InstructorLessonPlanGrant[];
};

export type InstructorLessonPlanAccess = InstructorLessonPlan & {
  canView: boolean;
};

export const VTRAINING_INSTRUCTOR_LESSON_PLANS: InstructorLessonPlan[] = [
  { id: '01', route: '/vtraining/giaoan/01', label: 'CĐ01', title: 'Chuyên đề định hướng', shortTitle: 'Định hướng' },
  { id: '02a', route: '/vtraining/giaoan/02a', label: 'CĐ02a', title: 'Chuyên đề 1', shortTitle: 'Chuyên đề 1' },
  { id: '02b', route: '/vtraining/giaoan/02b', label: 'CĐ02b', title: 'Chuyên đề 2', shortTitle: 'Chuyên đề 2' },
  { id: '03a', route: '/vtraining/giaoan/03a', label: 'CĐ03a', title: 'Chuyên đề 3', shortTitle: 'Chuyên đề 3' },
  { id: '03b', route: '/vtraining/giaoan/03b', label: 'CĐ03b', title: 'Chuyên đề bổ trợ', shortTitle: 'Bổ trợ' },
];

const DEFAULT_EMAIL_GRANTS: Record<string, InstructorLessonPlanId[]> = {
  'lephunghao64@gmail.com': ['01', '02a', '03a'],
  'nguyenthuhaxinchao@gmail.com': ['02b'],
};

function normalizeEmail(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function normalizeProfileId(value?: string | null) {
  return String(value || '').trim();
}

export function normalizeInstructorLessonPlanId(value?: string | null): InstructorLessonPlanId {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === '02') return '02a';
  if (normalized === '03') return '03a';
  if (normalized === '04') return '03b';
  if (['01', '02a', '02b', '03a', '03b'].includes(normalized)) return normalized as InstructorLessonPlanId;
  return '01';
}

export function buildInstructorLessonPlanAccess(input: InstructorLessonAccessInput): InstructorLessonPlanAccess[] {
  const profileId = normalizeProfileId(input.profileId);
  const email = normalizeEmail(input.email);
  const grantedIds = new Set<InstructorLessonPlanId>(DEFAULT_EMAIL_GRANTS[email] || []);

  (input.classLessonGrants || []).forEach((grant) => {
    const grantProfileId = normalizeProfileId(grant.instructorProfileId);
    const grantEmail = normalizeEmail(grant.instructorEmail);
    if ((profileId && grantProfileId === profileId) || (email && grantEmail === email)) {
      grantedIds.add(normalizeInstructorLessonPlanId(grant.lessonPlanId));
    }
  });

  return VTRAINING_INSTRUCTOR_LESSON_PLANS.map((plan) => ({
    ...plan,
    canView: grantedIds.has(plan.id),
  }));
}
