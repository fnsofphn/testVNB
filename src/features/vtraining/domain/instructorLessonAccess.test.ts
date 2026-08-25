import {
  VTRAINING_INSTRUCTOR_LESSON_PLANS,
  buildInstructorLessonPlanAccess,
} from './instructorLessonAccess';

function assertEqual(actual: unknown, expected: unknown, message: string) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`${message}: expected ${expectedText}, got ${actualText}`);
  }
}

const allPlanIds = VTRAINING_INSTRUCTOR_LESSON_PLANS.map((plan) => plan.id);

assertEqual(allPlanIds, ['01', '02a', '02b', '03a', '03b'], 'lesson plans stay visible in a stable order');

const haoAccess = buildInstructorLessonPlanAccess({
  email: 'lephunghao64@gmail.com',
  profileId: 'hao-profile',
  classLessonGrants: [],
});
assertEqual(haoAccess.map((item) => item.id), allPlanIds, 'Le Phung Hao still sees the full lesson list');
assertEqual(
  haoAccess.filter((item) => item.canView).map((item) => item.id),
  ['01', '02a', '03a'],
  'Le Phung Hao can open orientation, topic 1, and topic 3',
);

const haAccess = buildInstructorLessonPlanAccess({
  email: 'nguyenthuhaxinchao@gmail.com',
  profileId: 'ha-profile',
  classLessonGrants: [],
});
assertEqual(haAccess.map((item) => item.id), allPlanIds, 'Nguyen Thu Ha still sees the full lesson list');
assertEqual(
  haAccess.filter((item) => item.canView).map((item) => item.id),
  ['02b'],
  'Nguyen Thu Ha can open only topic 2 by default',
);

const classGrantAccess = buildInstructorLessonPlanAccess({
  email: 'other@example.com',
  profileId: 'other-profile',
  classLessonGrants: [{ instructorProfileId: 'other-profile', lessonPlanId: '03b' }],
});
assertEqual(
  classGrantAccess.filter((item) => item.canView).map((item) => item.id),
  ['03b'],
  'class-level grants can open an otherwise locked lesson plan',
);
