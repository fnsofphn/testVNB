import { vdiscussionApi } from '@/lib/suniDiscussion';

export const resultApi = {
  feature: 'vdiscussion.result',
  submitGroupResult: (payload: { groupId: string; score: number; activeParticipantIds: string[]; bonusPoints: number }) =>
    vdiscussionApi.submitGroupResult(payload),
} as const;
