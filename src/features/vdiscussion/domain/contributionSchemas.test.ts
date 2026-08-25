import {
  VDISCUSSION_CONTENT_CONTRIBUTION_TYPES,
  VDISCUSSION_CONTRIBUTION_SCHEMAS,
  getVDiscussionContributionPayload,
  getVDiscussionContributionSchema,
  isVDiscussionContentContributionType,
  parseVDiscussionContributionContent,
} from './contributionSchemas';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEqual(VDISCUSSION_CONTENT_CONTRIBUTION_TYPES.includes('problem_option'), true, 'B1 problem option is content');
assertEqual(VDISCUSSION_CONTENT_CONTRIBUTION_TYPES.includes('hypothesis'), true, 'B2 hypothesis is content');
assertEqual(VDISCUSSION_CONTENT_CONTRIBUTION_TYPES.includes('idea'), true, 'B3 idea is content');
assertEqual(VDISCUSSION_CONTENT_CONTRIBUTION_TYPES.includes('step4_comment'), true, 'B4 comment is content');
assertEqual(VDISCUSSION_CONTENT_CONTRIBUTION_TYPES.includes('step5_plan_input'), true, 'B5 plan input is content');
assertEqual(VDISCUSSION_CONTENT_CONTRIBUTION_TYPES.includes('session_join'), false, 'Session join is runtime activity');

assertEqual(getVDiscussionContributionSchema('problem_option')?.displayStep, 1, 'problem_option belongs to B1');
assertEqual(getVDiscussionContributionSchema('hypothesis')?.displayStep, 2, 'hypothesis belongs to B2');
assertEqual(getVDiscussionContributionSchema('idea')?.displayStep, 3, 'idea belongs to B3');
assertEqual(getVDiscussionContributionSchema('step4_rating')?.displayStep, 4, 'step4_rating belongs to B4');
assertEqual(getVDiscussionContributionSchema('step5_plan_select')?.displayStep, 5, 'step5_plan_select belongs to B5');
assertEqual(isVDiscussionContentContributionType('leader_vote'), false, 'leader_vote is not content');

const analysis = parseVDiscussionContributionContent(
  'hypothesis',
  JSON.stringify({ title: 'Nguyên nhân chính', rootCause: 'Thiếu dữ liệu tức thời', why: 'Dashboard cập nhật chậm' }),
);
assertEqual(analysis.title, 'Nguyên nhân chính', 'parser reads title');
assertEqual(analysis.description, 'Thiếu dữ liệu tức thời', 'parser prefers rootCause as description');

const finalReport = parseVDiscussionContributionContent(
  'final_report',
  JSON.stringify({ finalConclusion: 'Chốt phương án A', journeySummary: 'Nhóm hoàn thành B1-B5' }),
);
assertEqual(finalReport.title, 'Chốt phương án A', 'final report uses finalConclusion as title');
assertEqual(finalReport.description, 'Nhóm hoàn thành B1-B5', 'final report uses journeySummary as description');

const reviewPayload = getVDiscussionContributionPayload(
  JSON.stringify({ agreeScore: 5, reason: 'Rõ tác động', pick: true }),
);
assertEqual(Number(reviewPayload.agreeScore), 5, 'payload helper preserves numeric review score');
assertEqual(String(reviewPayload.reason), 'Rõ tác động', 'payload helper preserves review reason');

assertEqual(VDISCUSSION_CONTRIBUTION_SCHEMAS.length >= 12, true, 'schema registry covers content and runtime types');
