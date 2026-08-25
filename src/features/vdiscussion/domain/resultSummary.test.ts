import { buildVDiscussionMonitorResultContent } from './resultSummary';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const result = buildVDiscussionMonitorResultContent({
  topicTitle: 'Root topic',
  stepSummaries: {
    1: {},
    2: {},
    3: {},
    5: {},
  },
  contributions: [
    {
      id: 'problem-1',
      type: 'problem_option',
      content: JSON.stringify({ title: 'Main problem' }),
      parentId: null,
    },
    {
      id: 'analysis-1',
      type: 'hypothesis',
      content: JSON.stringify({ title: 'Main issue', rootCause: 'Main root cause' }),
      parentId: null,
    },
    {
      id: 'idea-1',
      type: 'idea',
      content: JSON.stringify({ title: 'Priority solution' }),
      parentId: null,
    },
    {
      id: 'plan-1',
      type: 'step5_plan_input',
      content: JSON.stringify({
        solutionId: 'idea-1',
        solutionTitle: 'Priority solution',
        objectives: 'Objective',
        tasks: 'Task',
      }),
      parentId: null,
    },
  ],
});

assertEqual(result.selectedProblem, 'Main problem', 'B1 falls back from problem contribution');
assertEqual(result.analyses.length, 1, 'B2 falls back from hypothesis contributions');
assertEqual(String(result.analyses[0]?.rootCause), 'Main root cause', 'B2 keeps root cause');
assertEqual(result.selectedSolutionId, 'idea-1', 'B3 selected solution id falls back from plan');
assertEqual(result.selectedSolution, 'Priority solution', 'B3 selected solution falls back from plan');
assertEqual(result.plans.length, 1, 'B4 falls back from plan input contributions');
assertEqual(String(result.plans[0]?.objectives), 'Objective', 'B4 preserves objectives from plan contribution');
assertEqual(String(result.plans[0]?.tasks), 'Task', 'B4 preserves tasks from plan contribution');

const contentlessSummaryPayload = buildVDiscussionMonitorResultContent({
  topicTitle: 'Root topic',
  stepSummaries: {
    1: {},
    2: {},
    3: {},
    5: {},
  },
  contributions: [
    {
      id: 'light-plan-1',
      type: 'step5_plan_input',
      content: '',
      parentId: null,
    },
  ],
});

assertEqual(contentlessSummaryPayload.plans.length, 0, 'B4 ignores contentless light monitor contributions');
