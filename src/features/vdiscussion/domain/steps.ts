export const VDISCUSSION_STEP_META: Record<number, { title: string; short: string; desc: string }> = {
  1: { title: 'Xác định vấn đề', short: 'Vấn đề', desc: 'Bổ sung vấn đề, bình chọn trọng tâm và bầu nhóm trưởng.' },
  2: { title: 'Phân tích hiện trạng', short: 'Hiện trạng', desc: 'Nêu tồn tại, nguyên nhân gốc và phản biện phân tích.' },
  3: { title: 'Ý tưởng, giải pháp & đánh giá', short: 'Ý tưởng', desc: 'Đề xuất giải pháp, đánh giá chéo và chốt phương án ưu tiên trong cùng một bước.' },
  4: { title: 'Kế hoạch hành động', short: 'Kế hoạch', desc: 'Đóng góp mục tiêu, việc làm, nguồn lực và thời hạn.' },
  5: { title: 'Tổng kết', short: 'Tổng kết', desc: 'Tổng hợp kết luận, cam kết cá nhân và nộp kết quả.' },
};

export const VDISCUSSION_DISPLAY_STEPS = [
  { displayStep: 1, routeStep: 1 },
  { displayStep: 2, routeStep: 2 },
  { displayStep: 3, routeStep: 3 },
  { displayStep: 4, routeStep: 5 },
  { displayStep: 5, routeStep: 6 },
] as const;

export type VDiscussionStepDefinition = {
  displayStep: number;
  routeStep: number;
  title: string;
  short: string;
  desc: string;
};

export const VDISCUSSION_CANONICAL_STEPS: VDiscussionStepDefinition[] = VDISCUSSION_DISPLAY_STEPS.map((step) => ({
  ...step,
  ...VDISCUSSION_STEP_META[step.displayStep],
}));

export function getVDiscussionStepDefinition(displayStepNumber: number | string | null | undefined) {
  const normalized = Number(displayStepNumber || 0);
  return VDISCUSSION_CANONICAL_STEPS.find((step) => step.displayStep === normalized) || null;
}

export function toVDiscussionDisplayStepNumber(stepNumber: number | string | null | undefined) {
  const normalized = Number(stepNumber || 0);
  if (!normalized || normalized < 1) return 0;
  if (normalized === 4) return 3;
  if (normalized > 4) return normalized - 1;
  return normalized;
}

export function toVDiscussionRouteStepNumber(displayStepNumber: number | string | null | undefined) {
  const normalized = Number(displayStepNumber || 0);
  return VDISCUSSION_DISPLAY_STEPS.find((step) => step.displayStep === normalized)?.routeStep || normalized;
}

export type VDiscussionSessionStepReadiness = 'loading' | 'missing-session' | 'missing-step' | 'ready';

export function getVDiscussionSessionStepReadiness(options: {
  hasSession: boolean;
  isSessionLoading: boolean;
  isStepsLoading: boolean;
  hasStepsError: boolean;
  steps: Array<{ stepNumber: number | string | null | undefined }>;
  activeStepNumber: number | string | null | undefined;
}): VDiscussionSessionStepReadiness {
  if (options.isSessionLoading || options.isStepsLoading || options.hasStepsError) return 'loading';
  if (!options.hasSession) return 'missing-session';
  if (!options.steps.length) return 'loading';
  const activeStepNumber = Number(options.activeStepNumber || 0);
  const hasActiveStep = options.steps.some((step) => Number(step.stepNumber || 0) === activeStepNumber);
  return hasActiveStep ? 'ready' : 'missing-step';
}

export const steps = {
  canonicalSteps: VDISCUSSION_CANONICAL_STEPS,
  displaySteps: VDISCUSSION_DISPLAY_STEPS,
  getSessionStepReadiness: getVDiscussionSessionStepReadiness,
  getStepDefinition: getVDiscussionStepDefinition,
  meta: VDISCUSSION_STEP_META,
  toDisplayStepNumber: toVDiscussionDisplayStepNumber,
  toRouteStepNumber: toVDiscussionRouteStepNumber,
} as const;
