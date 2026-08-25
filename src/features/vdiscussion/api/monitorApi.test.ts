import { monitorApi } from './monitorApi';
import { resultApi } from './resultApi';

function assertFunction(value: unknown, message: string) {
  if (typeof value !== 'function') {
    throw new Error(message);
  }
}

assertFunction(monitorApi.getEventMonitoring, 'monitorApi must expose getEventMonitoring');
assertFunction(monitorApi.getEventMonitoringSummary, 'monitorApi must expose getEventMonitoringSummary');
assertFunction(resultApi.submitGroupResult, 'resultApi must expose submitGroupResult');
