const eventRoot = ['suni', 'discussion', 'event'] as const;
const eventsRoot = ['suni', 'discussion', 'events'] as const;
const studentAssignmentsRoot = ['suni', 'discussion', 'student-assignments'] as const;
const sessionRoot = ['suni', 'discussion', 'session'] as const;
const trainingResults = ['suni', 'training', 'results'] as const;

export const queries = {
  feature: 'vdiscussion.queries',
  eventRoot: () => eventRoot,
  events: () => eventsRoot,
  eventsByStatus: (status: string | null | undefined) => [...eventsRoot, status] as const,
  classEvents: (classId: string | null | undefined, linkedDiscussionIdsKey: string | null | undefined) =>
    [...eventsRoot, 'class', classId, linkedDiscussionIdsKey] as const,
  libraryTemplates: () => [...eventsRoot, 'library-templates'] as const,
  event: (eventId: string | null | undefined) => [...eventRoot, eventId] as const,
  classMonitorSummary: (eventId: string | null | undefined) => [...eventsRoot, eventId, 'class-monitor-summary'] as const,
  monitoring: (eventId: string | null | undefined) => [...eventRoot, eventId, 'monitoring'] as const,
  monitoringSummary: (eventId: string | null | undefined) => [...eventRoot, eventId, 'monitoring-summary'] as const,
  studentAssignments: (
    profileId: string | null | undefined,
    email: string | null | undefined,
    studentCode: string | null | undefined,
  ) => [...studentAssignmentsRoot, profileId, email, studentCode] as const,
  studentAssignmentsRoot: () => studentAssignmentsRoot,
  sessionRoot: () => sessionRoot,
  session: (sessionId: string | null | undefined) => [...sessionRoot, sessionId] as const,
  sessionSteps: (sessionId: string | null | undefined) => [...sessionRoot, sessionId, 'steps'] as const,
  sessionContributions: (sessionId: string | null | undefined) => [...sessionRoot, sessionId, 'contributions'] as const,
  sessionContributionsForSteps: (
    sessionId: string | null | undefined,
    stepIdsKey: string | null | undefined,
  ) => [...sessionRoot, sessionId, 'contributions', stepIdsKey] as const,
  trainingResults: () => trainingResults,
} as const;
