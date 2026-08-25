import { buildInstructorClassLessonTopics, normalizeClassLessonPlanTopics } from './instructorClassLessonPortal';

function assertJsonEqual(actual: unknown, expected: unknown, message: string) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`${message}: expected ${expectedText}, got ${actualText}`);
  }
}

const lessonPlanTopics = normalizeClassLessonPlanTopics([
  { id: 'cd-dinh-huong', label: 'CĐ Định hướng', title: 'CHUYÊN ĐỀ ĐỊNH HƯỚNG', lessonUrl: '/vtraining/giaoan/dinh-huong', sortOrder: 1 },
  { id: 'cd-1', label: 'CĐ1', title: 'CHUYÊN ĐỀ 1', lessonUrl: '/vtraining/giaoan/cd-1', sortOrder: 2 },
  { id: 'cd-2a', label: 'CĐ2A', title: 'CHUYÊN ĐỀ 2A', lessonUrl: '', sortOrder: 3 },
]);

const topics = buildInstructorClassLessonTopics({
  classId: 'evnspc-ql01a',
  profileId: 'hao-profile',
  lessonPlanTopics,
  grants: [
    { classId: 'evnspc-ql01a', instructorProfileId: 'hao-profile', lessonPlanId: 'cd-dinh-huong' },
    { classId: 'evnspc-ql01a', instructorProfileId: 'hao-profile', lessonPlanId: 'cd-2a' },
    { classId: 'other-class', instructorProfileId: 'hao-profile', lessonPlanId: 'cd-1' },
  ],
});

assertJsonEqual(
  topics.map((topic) => topic.id),
  ['cd-dinh-huong', 'cd-1', 'cd-2a'],
  'class lesson portal uses class-specific lessonplan topics',
);

assertJsonEqual(
  topics.filter((topic) => topic.canView).map((topic) => topic.id),
  ['cd-dinh-huong', 'cd-2a'],
  'class lesson portal grants only topics assigned in the selected class',
);

assertJsonEqual(
  topics.map((topic) => topic.lessonUrl),
  ['/vtraining/giaoan/dinh-huong', '/vtraining/giaoan/cd-1', ''],
  'class lesson portal preserves pasted electronic lesson links',
);
