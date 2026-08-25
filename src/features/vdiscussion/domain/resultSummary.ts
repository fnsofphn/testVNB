import { getVDiscussionContributionPayload } from './contributionSchemas';

export type VDiscussionResultContributionLike = {
  id: string;
  type: string;
  content: unknown;
  parentId?: string | null;
};

export type VDiscussionMonitorResultContentInput = {
  topicTitle?: string | null;
  stepSummaries: Record<number, Record<string, unknown>>;
  contributions: VDiscussionResultContributionLike[];
};

export type VDiscussionMonitorResultContent = {
  selectedProblem: string;
  selectedSolution: string;
  selectedSolutionId: string;
  analyses: Array<Record<string, unknown>>;
  plans: Array<Record<string, unknown>>;
};

export function buildVDiscussionMonitorResultContent(
  input: VDiscussionMonitorResultContentInput,
): VDiscussionMonitorResultContent {
  const step1 = input.stepSummaries[1] || {};
  const step2 = input.stepSummaries[2] || {};
  const step3 = input.stepSummaries[3] || {};
  const step5 = input.stepSummaries[5] || {};

  const plans = getPlans(step5, input.contributions);
  const selectedSolutionId = getSelectedSolutionId(step3, step5, plans, input.contributions);

  return {
    selectedProblem: getSelectedProblem(step1, input.topicTitle, input.contributions),
    selectedSolution: getSelectedSolution(step3, step5, plans, input.contributions),
    selectedSolutionId,
    analyses: getAnalyses(step2, input.contributions),
    plans,
  };
}

function getPlans(step5: Record<string, unknown>, contributions: VDiscussionResultContributionLike[]) {
  const summaryPlans = asArray<Record<string, unknown>>(step5.plans);
  if (summaryPlans.length) return summaryPlans;
  return contributions
    .filter((contribution) => contribution.type === 'step5_plan_input')
    .map((contribution): Record<string, unknown> => ({
      id: contribution.id,
      ...getVDiscussionContributionPayload(contribution.content),
    }))
    .filter(hasPlanContent);
}

function hasPlanContent(plan: Record<string, unknown>) {
  return ['objectives', 'tasks', 'resources', 'timeline', 'title', 'planTitle', 'solutionTitle']
    .some((key) => String(plan[key] || '').trim());
}

function getSelectedProblem(
  step1: Record<string, unknown>,
  topicTitle: string | null | undefined,
  contributions: VDiscussionResultContributionLike[],
) {
  const summaryValue = String(step1.selectedProblemTitle || '').trim();
  if (summaryValue) return summaryValue;
  const problem = contributions.find((item) => item.type === 'problem_option');
  const problemPayload = problem ? getVDiscussionContributionPayload(problem.content) : {};
  return String(problemPayload.title || problemPayload.text || topicTitle || '').trim();
}

function getAnalyses(step2: Record<string, unknown>, contributions: VDiscussionResultContributionLike[]) {
  const summaryItems = asArray<Record<string, unknown>>(step2.selectedItems);
  if (summaryItems.length) return summaryItems;
  return contributions
    .filter((contribution) => contribution.type === 'hypothesis')
    .map((contribution): Record<string, unknown> => ({
      id: contribution.id,
      ...getVDiscussionContributionPayload(contribution.content),
    }));
}

function getSelectedSolution(
  step3: Record<string, unknown>,
  step5: Record<string, unknown>,
  plans: Array<Record<string, unknown>>,
  contributions: VDiscussionResultContributionLike[],
) {
  const summaryValue = String(step5.selectedSolutionTitle || step3.selectedSolutionTitle || '').trim();
  if (summaryValue) return summaryValue;
  const plan = plans[0] || {};
  const planTitle = String(plan.solutionTitle || plan.title || '').trim();
  if (planTitle) return planTitle;
  const idea = contributions.find((item) => item.type === 'idea' && !item.parentId);
  const ideaPayload = idea ? getVDiscussionContributionPayload(idea.content) : {};
  return String(ideaPayload.title || ideaPayload.text || '').trim();
}

function getSelectedSolutionId(
  step3: Record<string, unknown>,
  step5: Record<string, unknown>,
  plans: Array<Record<string, unknown>>,
  contributions: VDiscussionResultContributionLike[],
) {
  const summaryValue = String(step5.selectedSolutionId || step3.selectedSolutionId || '').trim();
  if (summaryValue) return summaryValue;
  const plan = plans[0] || {};
  const planSolutionId = String(plan.solutionId || '').trim();
  if (planSolutionId) return planSolutionId;
  const idea = contributions.find((item) => item.type === 'idea' && !item.parentId);
  return String(idea?.id || '').trim();
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}
