import { vdiscussionApi } from '@/lib/suniDiscussion';

export const monitorApi = {
  feature: 'vdiscussion.monitor',
  getEventMonitoring: (eventId: string) => vdiscussionApi.getEventMonitoring(eventId),
  getEventMonitoringSummary: (eventId: string) => vdiscussionApi.getEventMonitoringSummary(eventId),
} as const;
