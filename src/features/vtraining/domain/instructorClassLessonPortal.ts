import {
  VTRAINING_INSTRUCTOR_LESSON_PLANS,
  normalizeInstructorLessonPlanId,
  type InstructorLessonPlan,
} from './instructorLessonAccess';

type LessonGrant = {
  classId?: string | null;
  instructorProfileId?: string | null;
  instructorEmail?: string | null;
  lessonPlanId: string;
};

export type ClassLessonPlanTopic = {
  id: string;
  label: string;
  title: string;
  lessonUrl?: string;
  sortOrder?: number;
};

export type InstructorClassLessonTopic = ClassLessonPlanTopic & {
  canView: boolean;
  route: string;
};

type BuildClassLessonTopicsInput = {
  classId: string;
  profileId?: string | null;
  email?: string | null;
  grants?: LessonGrant[];
  lessonPlanTopics?: ClassLessonPlanTopic[];
};

function toFallbackTopic(plan: InstructorLessonPlan, index: number): ClassLessonPlanTopic {
  return {
    id: plan.id,
    label: plan.label,
    title: plan.title,
    lessonUrl: plan.route,
    sortOrder: index + 1,
  };
}

export function normalizeClassLessonPlanTopics(value: unknown): ClassLessonPlanTopic[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const id = String(row.id || '').trim();
      const title = String(row.title || '').trim();
      if (!id || !title) return null;
      return {
        id,
        label: String(row.label || id).trim(),
        title,
        lessonUrl: String(row.lessonUrl || '').trim(),
        sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : index + 1,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(a!.sortOrder || 0) - Number(b!.sortOrder || 0)) as ClassLessonPlanTopic[];
}

export function buildInstructorClassLessonTopics(input: BuildClassLessonTopicsInput): InstructorClassLessonTopic[] {
  const classId = String(input.classId || '').trim();
  const profileId = String(input.profileId || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const baseTopics = normalizeClassLessonPlanTopics(input.lessonPlanTopics);
  const topics = baseTopics.length
    ? baseTopics
    : VTRAINING_INSTRUCTOR_LESSON_PLANS.map(toFallbackTopic);
  const topicIdSet = new Set(topics.map((topic) => topic.id));
  const grantedIds = new Set<string>();

  (input.grants || []).forEach((grant) => {
    const grantClassId = String(grant.classId || '').trim();
    const grantProfileId = String(grant.instructorProfileId || '').trim();
    const grantEmail = String(grant.instructorEmail || '').trim().toLowerCase();
    if (grantClassId && grantClassId !== classId) return;
    if (!((profileId && grantProfileId === profileId) || (email && grantEmail === email))) return;
    const rawId = String(grant.lessonPlanId || '').trim();
    const normalizedId = normalizeInstructorLessonPlanId(rawId);
    grantedIds.add(rawId);
    if (topicIdSet.has(normalizedId)) grantedIds.add(normalizedId);
  });

  return topics.map((topic) => ({
    ...topic,
    route: `/vtraining/classes/${classId}/giaoan/${encodeURIComponent(topic.id)}`,
    canView: grantedIds.has(topic.id),
  }));
}
