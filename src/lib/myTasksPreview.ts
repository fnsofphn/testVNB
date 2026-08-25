import type { AuthProfile } from '@/contexts/AuthContext';
import { normalizeAppRole } from '@/data/vcontent';
import type {
  ActivityLogRow,
  InputItemRow,
  OrderRow,
  ProductRow,
  ProfileRow,
  ScormPackageRow,
  ScormReviewRow,
  SlideDesignReviewRow,
  SlideDesignRow,
  StoryboardReviewRow,
  StoryboardRow,
  TaskRow,
  VideoEditRow,
  VideoReviewRow,
  VoiceOverRow,
  VoiceReviewRow,
} from '@/services/vcontent';

export type MyTaskPreviewWorkItem = {
  id: string;
  taskId: string | null;
  order_id: string;
  product_id: string;
  stage_index: number;
  status: string;
  progress: number;
  due_date: string | null;
  assignee: string | null;
  assignee_profile_id?: string | null;
  assignee_account_id?: string | null;
  assignee_email?: string | null;
  source: 'task' | 'tracking';
};

export type MyTasksPreviewPayload = {
  ok: boolean;
  viewerProfile: AuthProfile | null;
  profiles: ProfileRow[];
  orders: OrderRow[];
  products: ProductRow[];
  tasks: TaskRow[];
  inputItems: InputItemRow[];
  storyboards: StoryboardRow[];
  storyboardReviews: StoryboardReviewRow[];
  slideDesigns: SlideDesignRow[];
  slideDesignReviews: SlideDesignReviewRow[];
  voiceOvers: VoiceOverRow[];
  voiceReviews: VoiceReviewRow[];
  videoEdits: VideoEditRow[];
  videoReviews: VideoReviewRow[];
  scormPackages: ScormPackageRow[];
  scormReviews: ScormReviewRow[];
  workItems: MyTaskPreviewWorkItem[];
  activityLogs: ActivityLogRow[];
};

export const MY_TASKS_PREVIEW_ROLES = ['content_manager', 'specialist', 'designer', 'vc', 'qc', 'hoc_gia'];

export function shouldUseMyTasksPreview(role: string | null | undefined) {
  return MY_TASKS_PREVIEW_ROLES.includes(normalizeAppRole(role));
}

export type MyTasksPreviewOptions = {
  stageIndices?: number[];
  includeActivityLogs?: boolean;
};

function normalizeStageIndices(stageIndices?: number[]) {
  if (!Array.isArray(stageIndices) || !stageIndices.length) return [] as number[];
  return [...new Set(stageIndices.filter((value) => Number.isInteger(value) && value >= 0))].sort((a, b) => a - b);
}

export function getMyTasksPreviewQueryKey(role: string, email?: string | null, options?: MyTasksPreviewOptions) {
  const normalizedStages = normalizeStageIndices(options?.stageIndices);
  const includeActivityLogs = Boolean(options?.includeActivityLogs);
  const normalizedRole = normalizeAppRole(role);
  return [
    'my-tasks-preview',
    normalizedRole,
    String(email || '').trim().toLowerCase(),
    normalizedStages.join(','),
    includeActivityLogs ? 'logs:1' : 'logs:0',
  ] as const;
}

export async function fetchMyTasksPreview(role: string, email?: string | null, options?: MyTasksPreviewOptions) {
  const params = new URLSearchParams({ role: normalizeAppRole(role) });
  if (email) params.set('email', email);
  const normalizedStages = normalizeStageIndices(options?.stageIndices);
  if (normalizedStages.length) {
    params.set('stages', normalizedStages.join(','));
  }
  if (options?.includeActivityLogs) {
    params.set('includeActivityLogs', '1');
  }
  const response = await fetch(`/api/my-tasks-preview?${params.toString()}`);
  const data = (await response.json()) as MyTasksPreviewPayload & { error?: string };
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Khong tai duoc du lieu cong viec (${response.status}).`);
  }
  return data;
}
