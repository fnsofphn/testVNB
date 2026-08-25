import {
  VDISCUSSION_CANONICAL_STEPS,
  getVDiscussionStepDefinition,
  getVDiscussionSessionStepReadiness,
  toVDiscussionDisplayStepNumber,
  toVDiscussionRouteStepNumber,
} from './steps';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEqual(VDISCUSSION_CANONICAL_STEPS.length, 5, 'VDiscussion must expose B1-B5');
assertEqual(VDISCUSSION_CANONICAL_STEPS[3]?.displayStep, 4, 'B4 display step');
assertEqual(VDISCUSSION_CANONICAL_STEPS[3]?.routeStep, 5, 'B4 route step');
assertEqual(VDISCUSSION_CANONICAL_STEPS[4]?.displayStep, 5, 'B5 display step');
assertEqual(VDISCUSSION_CANONICAL_STEPS[4]?.routeStep, 6, 'B5 route step');

assertEqual(toVDiscussionDisplayStepNumber(4), 3, 'Legacy route step 4 displays as B3');
assertEqual(toVDiscussionDisplayStepNumber(5), 4, 'Route step 5 displays as B4');
assertEqual(toVDiscussionDisplayStepNumber(6), 5, 'Route step 6 displays as B5');
assertEqual(toVDiscussionRouteStepNumber(4), 5, 'Display B4 routes to step 5');
assertEqual(toVDiscussionRouteStepNumber(5), 6, 'Display B5 routes to step 6');

assertEqual(getVDiscussionStepDefinition(5)?.routeStep, 6, 'B5 definition uses route step 6');

assertEqual(
  getVDiscussionSessionStepReadiness({
    hasSession: true,
    isSessionLoading: false,
    isStepsLoading: false,
    hasStepsError: true,
    steps: [],
    activeStepNumber: 1,
  }),
  'loading',
  'transient step query errors must not render missing-step',
);

assertEqual(
  getVDiscussionSessionStepReadiness({
    hasSession: true,
    isSessionLoading: false,
    isStepsLoading: false,
    hasStepsError: false,
    steps: [],
    activeStepNumber: 1,
  }),
  'loading',
  'empty step query during setup must not render missing-step',
);

assertEqual(
  getVDiscussionSessionStepReadiness({
    hasSession: true,
    isSessionLoading: false,
    isStepsLoading: false,
    hasStepsError: false,
    steps: [{ stepNumber: 2 }],
    activeStepNumber: 1,
  }),
  'missing-step',
  'loaded steps without active route step should render missing-step',
);
