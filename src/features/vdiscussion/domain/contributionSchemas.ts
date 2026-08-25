import { toVDiscussionRouteStepNumber } from './steps';

export type VDiscussionContributionKind = 'content' | 'selection' | 'vote' | 'runtime' | 'final';

export type VDiscussionContributionSchema = {
  type: string;
  displayStep: number | null;
  routeStep: number | null;
  kind: VDiscussionContributionKind;
  titleKeys: readonly string[];
  descriptionKeys: readonly string[];
};

export type VDiscussionParsedContributionContent = {
  title: string;
  description: string;
  payload: Record<string, unknown>;
};

export const VDISCUSSION_CONTRIBUTION_SCHEMAS: VDiscussionContributionSchema[] = [
  schema('problem_option', 1, 'content', ['title', 'text', 'content'], ['description', 'detail']),
  schema('problem_vote', 1, 'vote', ['problemTitle', 'title', 'text'], ['comment', 'description']),
  schema('leader_vote', 1, 'vote', ['leaderName', 'title'], ['comment', 'reason']),
  schema('leader_vote_result', 1, 'selection', ['leaderName', 'title'], ['comment', 'reason']),
  schema('hypothesis', 2, 'content', ['title', 'text', 'content'], ['rootCause', 'why', 'description', 'detail']),
  schema('idea', 3, 'content', ['title', 'text', 'content'], ['why', 'description', 'detail']),
  schema('comment', 3, 'content', ['text', 'comment', 'title', 'content'], ['description', 'detail']),
  schema('step4_rating', 4, 'selection', ['solutionTitle', 'title', 'solutionId'], ['comment', 'description']),
  schema('step4_comment', 4, 'content', ['comment', 'text', 'title'], ['description', 'detail']),
  schema('step5_plan_input', 5, 'content', ['objectives', 'title', 'solutionTitle'], ['tasks', 'resources', 'timeline', 'description']),
  schema('step5_plan_select', 5, 'selection', ['planTitle', 'title', 'planId'], ['comment', 'description']),
  schema('discussion_personal_commitment', 5, 'content', ['commitment', 'text', 'title'], ['description', 'detail']),
  schema('final_report', 5, 'final', ['finalConclusion', 'summary', 'title'], ['journeySummary', 'nextAction', 'retrospectiveNote']),
  schema('session_join', null, 'runtime', ['participantName', 'title'], ['description']),
];

export const VDISCUSSION_CONTENT_CONTRIBUTION_TYPES = VDISCUSSION_CONTRIBUTION_SCHEMAS
  .filter((item) => item.kind === 'content' || item.kind === 'final')
  .map((item) => item.type);

export const contributionSchemas = {
  all: VDISCUSSION_CONTRIBUTION_SCHEMAS,
  contentTypes: VDISCUSSION_CONTENT_CONTRIBUTION_TYPES,
  getPayload: getVDiscussionContributionPayload,
  getSchema: getVDiscussionContributionSchema,
  isContentType: isVDiscussionContentContributionType,
  parseContent: parseVDiscussionContributionContent,
} as const;

export function getVDiscussionContributionSchema(type: string | null | undefined) {
  const normalized = String(type || '').trim();
  return VDISCUSSION_CONTRIBUTION_SCHEMAS.find((item) => item.type === normalized) || null;
}

export function isVDiscussionContentContributionType(type: string | null | undefined) {
  const schema = getVDiscussionContributionSchema(type);
  return Boolean(schema && (schema.kind === 'content' || schema.kind === 'final'));
}

export function parseVDiscussionContributionContent(
  type: string | null | undefined,
  content: unknown,
): VDiscussionParsedContributionContent {
  const payload = getVDiscussionContributionPayload(content);
  const schema = getVDiscussionContributionSchema(type);
  const title = firstString(payload, schema?.titleKeys || ['title', 'text', 'content', 'summary']) || stringifyPlainContent(content);
  const description = firstString(payload, schema?.descriptionKeys || ['description', 'detail', 'why', 'rootCause', 'comment']);

  return {
    title,
    description,
    payload,
  };
}

export function getVDiscussionContributionPayload(content: unknown): Record<string, unknown> {
  return parseJsonRecord(content);
}

function schema(
  type: string,
  displayStep: number | null,
  kind: VDiscussionContributionKind,
  titleKeys: readonly string[],
  descriptionKeys: readonly string[],
): VDiscussionContributionSchema {
  return {
    type,
    displayStep,
    routeStep: displayStep ? toVDiscussionRouteStepNumber(displayStep) : null,
    kind,
    titleKeys,
    descriptionKeys,
  };
}

function parseJsonRecord(content: unknown): Record<string, unknown> {
  if (!content) return {};
  if (typeof content === 'object' && !Array.isArray(content)) return content as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(content)) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function firstString(payload: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function stringifyPlainContent(content: unknown) {
  return typeof content === 'string' ? content.trim() : '';
}
