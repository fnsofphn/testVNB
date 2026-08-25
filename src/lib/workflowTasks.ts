import type { PageKey } from '@/data/vcontent';

const ELN_STAGE_PAGES: PageKey[] = ['smf01', 'smf02', 'smf03', 'smf04', 'smf05', 'smf06', 'smf07', 'smf08', 'smf09'];
const VIDEO_STAGE_PAGES: PageKey[] = ['vsmf01', 'vsmf02', 'vsmf03', 'vsmf04', 'vsmf05', 'vsmf06', 'vsmf07', 'vsmf08'];
const GAME_STAGE_PAGES: PageKey[] = ['gsmf01', 'gsmf02', 'gsmf03', 'gsmf04'];

export function getStagePageKey(module: string, stageIndex: number): PageKey | null {
  const pages = module === 'VIDEO' ? VIDEO_STAGE_PAGES : module === 'GAME' ? GAME_STAGE_PAGES : ELN_STAGE_PAGES;
  return pages[stageIndex] || null;
}

export function getStageCode(module: string, stageIndex: number) {
  const pageKey = getStagePageKey(module, stageIndex);
  return pageKey ? String(pageKey).toUpperCase() : null;
}

export function getTaskStartActionType(module: string, stageIndex: number) {
  if ((module === 'ELN' || module === 'VIDEO') && (stageIndex === 3 || stageIndex === 6)) {
    return 'workflow_review_claimed';
  }
  if ((module === 'ELN' || module === 'VIDEO') && stageIndex >= 1 && stageIndex <= 6) {
    return 'workflow_step_started';
  }
  return 'task_started';
}
