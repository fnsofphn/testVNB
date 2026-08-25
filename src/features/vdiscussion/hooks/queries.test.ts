import { queries } from './queries';

function assertJsonEqual(actual: unknown, expected: unknown, message: string) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`${message}: expected ${expectedText}, got ${actualText}`);
  }
}

assertJsonEqual(queries.events(), ['suni', 'discussion', 'events'], 'events query key');
assertJsonEqual(queries.eventsByStatus('active'), ['suni', 'discussion', 'events', 'active'], 'events by status query key');
assertJsonEqual(queries.classEvents('class-1', 'event-a|event-b'), ['suni', 'discussion', 'events', 'class', 'class-1', 'event-a|event-b'], 'class discussion events query key');
assertJsonEqual(queries.libraryTemplates(), ['suni', 'discussion', 'events', 'library-templates'], 'library templates query key');
assertJsonEqual(queries.event('event-1'), ['suni', 'discussion', 'event', 'event-1'], 'event detail query key');
assertJsonEqual(queries.classMonitorSummary('event-1'), ['suni', 'discussion', 'events', 'event-1', 'class-monitor-summary'], 'class monitor summary query key');
assertJsonEqual(queries.monitoring('event-1'), ['suni', 'discussion', 'event', 'event-1', 'monitoring'], 'monitoring query key');
assertJsonEqual(queries.monitoringSummary('event-1'), ['suni', 'discussion', 'event', 'event-1', 'monitoring-summary'], 'monitoring summary query key');
assertJsonEqual(queries.studentAssignments('profile-1', 'a@example.com', 'HV001'), ['suni', 'discussion', 'student-assignments', 'profile-1', 'a@example.com', 'HV001'], 'student assignments query key');
assertJsonEqual(queries.studentAssignmentsRoot(), ['suni', 'discussion', 'student-assignments'], 'student assignments root query key');
assertJsonEqual(queries.sessionRoot(), ['suni', 'discussion', 'session'], 'session root query key');
assertJsonEqual(queries.session('session-1'), ['suni', 'discussion', 'session', 'session-1'], 'session detail query key');
assertJsonEqual(queries.sessionSteps('session-1'), ['suni', 'discussion', 'session', 'session-1', 'steps'], 'session steps query key');
assertJsonEqual(queries.sessionContributions('session-1'), ['suni', 'discussion', 'session', 'session-1', 'contributions'], 'session contributions query key');
assertJsonEqual(queries.sessionContributionsForSteps('session-1', '1,2,3'), ['suni', 'discussion', 'session', 'session-1', 'contributions', '1,2,3'], 'session contributions by steps query key');
assertJsonEqual(queries.trainingResults(), ['suni', 'training', 'results'], 'training results compatibility query key');
