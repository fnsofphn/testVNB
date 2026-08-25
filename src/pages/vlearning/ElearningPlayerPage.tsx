import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileText, RefreshCcw, Search, StickyNote } from 'lucide-react';
import { useToast } from '@/components/system/ToastProvider';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { ActivityBars } from '@/components/vlearning/ActivityBars';
import { ProgressSaveIndicator } from '@/components/vlearning/ProgressSaveIndicator';
import { createScormRuntimeBridge, type ScormSyncStatus } from '@/components/vlearning/ScormRuntimeBridge';
import { VLearningLearnerShell } from '@/components/vlearning/VLearningLearnerShell';
import { useAuth } from '@/contexts/AuthContext';
import { getLearningRuntimeQueueDelayMs } from '@/lib/authLoginQueue';
import {
  buildScormLaunchUrl,
  buildVimeoEmbedUrl,
  flushBufferedVLearningProgressEvents,
  flushBufferedVLearningScormRuntime,
  gradeElearningNativeBlock,
  getElearningCourseBundle,
  requestVLearningAdmission,
  saveElearningBlockAttempt,
  saveElearningProgress,
  saveElearningScormRuntime,
  selectElearningResumeTarget,
  type ElearningCourseBundle,
  type ElearningBlockAttempt,
  type ElearningLesson,
  type ElearningLessonBlock,
  type ElearningLessonPart,
  type ElearningProgress,
  type ElearningScormAttempt,
} from '@/lib/elearning';

const SCORM_SAVE_DEBOUNCE_MS = 15000;
const VLEARNING_LEARNER_NOTE_STORAGE_PREFIX = 'vlearning.learner.notes';
const VLEARNING_NATIVE_VIDEO_POLL_MS = 1500;
const NATIVE_VIDEO_NEAR_END_SECONDS = 1;

type LearnerSavedEntry = {
  id: string;
  text: string;
  createdAt: string;
};

type NativeBlockStatus = 'idle' | 'ready' | 'saving' | 'saved' | 'incorrect' | 'error';
type NativeVideoPlaybackSnapshot = {
  blockId: string;
  seconds: number;
  duration: number;
  hasEnded: boolean;
};

function buildLearnerStorageKey(prefix: string, courseId: string, userId: string, profileId: string) {
  return `${prefix}.${courseId}.${profileId || userId || 'anonymous'}`;
}

function readLearnerSavedEntries(key: string): LearnerSavedEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = window.localStorage.getItem(key);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is LearnerSavedEntry => Boolean(item?.id && item?.text && item?.createdAt))
      : [];
  } catch {
    return [];
  }
}

function writeLearnerSavedEntries(key: string, entries: LearnerSavedEntry[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(entries.slice(0, 30)));
}

function createLearnerSavedEntry(text: string): LearnerSavedEntry {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `entry-${Date.now()}`;
  return { id, text, createdAt: new Date().toISOString() };
}

function formatSavedEntryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function waitWithRuntimeCountdown(delayMs: number, onTick: (seconds: number | null) => void) {
  if (delayMs <= 0) return Promise.resolve();
  const startedAt = Date.now();
  onTick(Math.max(1, Math.ceil(delayMs / 1000)));
  return new Promise<void>((resolve) => {
    const interval = window.setInterval(() => {
      const remainingMs = Math.max(0, delayMs - (Date.now() - startedAt));
      onTick(remainingMs > 0 ? Math.max(1, Math.ceil(remainingMs / 1000)) : null);
    }, 250);
    window.setTimeout(() => {
      window.clearInterval(interval);
      onTick(null);
      resolve();
    }, delayMs);
  });
}

declare global {
  interface Window {
    Vimeo?: {
      Player: new (element: HTMLIFrameElement) => {
        on: (eventName: string, callback: (payload?: any) => void) => void;
        off: (eventName: string) => void;
        play: () => Promise<void>;
        pause: () => Promise<void>;
        requestFullscreen?: () => Promise<void>;
        getDuration: () => Promise<number>;
        getCurrentTime: () => Promise<number>;
        getEnded?: () => Promise<boolean>;
        setCurrentTime: (seconds: number) => Promise<number>;
        destroy?: () => void;
      };
    };
    API_1484_11?: {
      Initialize: (value: string) => 'true' | 'false';
      Terminate: (value: string) => 'true' | 'false';
      GetValue: (key: string) => string;
      SetValue: (key: string, value: string) => 'true' | 'false';
      Commit: (value: string) => 'true' | 'false';
      GetLastError: () => string;
      GetErrorString: (code: string) => string;
      GetDiagnostic: (code: string) => string;
    };
    API?: {
      LMSInitialize: (value: string) => 'true' | 'false';
      LMSFinish: (value: string) => 'true' | 'false';
      LMSGetValue: (key: string) => string;
      LMSSetValue: (key: string, value: string) => 'true' | 'false';
      LMSCommit: (value: string) => 'true' | 'false';
      LMSGetLastError: () => string;
      LMSGetErrorString: (code: string) => string;
      LMSGetDiagnostic: (code: string) => string;
    };
  }
}

let vimeoSdkPromise: Promise<void> | null = null;

function loadVimeoSdk() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.Vimeo?.Player) return Promise.resolve();
  if (vimeoSdkPromise) return vimeoSdkPromise;
  vimeoSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-vimeo-player-sdk="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Không tải được trình phát video.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://player.vimeo.com/api/player.js';
    script.async = true;
    script.dataset.vimeoPlayerSdk = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Không tải được trình phát video.'));
    document.head.appendChild(script);
  });
  return vimeoSdkPromise;
}

function formatDuration(seconds: number) {
  if (!seconds) return '-';
  return Math.round(seconds / 60) + ' phút';
}

function getPartProgress(progress: ElearningProgress[], partId: string) {
  return progress.find((item) => item.partId === partId) || null;
}

function getLessonParts(parts: ElearningLessonPart[], lessonId: string) {
  return parts.filter((part) => part.lessonId === lessonId).sort((a, b) => a.sortOrder - b.sortOrder);
}

function isScormLessonComplete(lesson: ElearningLesson, attempt: ElearningScormAttempt | null) {
  if (!attempt) return false;
  if (lesson.completionRule === 'passed') return attempt.isPassed;
  if (lesson.completionRule === 'score') {
    const score = attempt.scoreScaled !== null ? attempt.scoreScaled * 100 : attempt.scoreRaw;
    return Number(score || 0) >= lesson.passingScore;
  }
  return attempt.isCompleted || attempt.isPassed;
}

function isNativeBlockComplete(block: ElearningLessonBlock, attempt: ElearningBlockAttempt | undefined) {
  if (!block.isRequired) return true;
  return attempt?.isCompleted === true;
}

function getCourseLearningUnitCounts(
  lessons: ElearningLesson[],
  parts: ElearningLessonPart[],
  blocks: ElearningLessonBlock[],
  progress: ElearningProgress[],
  scormAttempts: ElearningScormAttempt[] = [],
  blockAttempts: ElearningBlockAttempt[] = [],
  optimisticBlockStatus: Record<string, NativeBlockStatus> = {},
) {
  const publishedLessons = lessons.filter((lesson) => lesson.status === 'published');
  const lessonMap = new Map(publishedLessons.map((lesson) => [lesson.id, lesson]));
  const scormLessons = publishedLessons.filter((lesson) => lesson.lessonType === 'scorm');
  const requiredBlocks = blocks.filter((block) => {
    const lesson = lessonMap.get(block.lessonId);
    return lesson?.lessonType === 'native_sequence' && block.status === 'published' && block.isRequired;
  });
  const nativeLessonIdsWithBlocks = new Set(requiredBlocks.map((block) => block.lessonId));
  const requiredParts = parts.filter((part) => {
    if (!part.isRequired || part.status !== 'published') return false;
    const lesson = lessonMap.get(part.lessonId);
    if (!lesson || lesson.lessonType === 'scorm') return false;
    return lesson.lessonType !== 'native_sequence' || !nativeLessonIdsWithBlocks.has(lesson.id);
  });
  const total = requiredParts.length + requiredBlocks.length + scormLessons.length;
  const completedParts = requiredParts.filter((part) => getPartProgress(progress, part.id)?.isCompleted).length;
  const completedBlocks = requiredBlocks.filter((block) => {
    const attempt = blockAttempts.find((item) => item.blockId === block.id);
    return isNativeBlockComplete(block, attempt) || optimisticBlockStatus[block.id] === 'saved';
  }).length;
  const completedScorm = scormLessons.filter((lesson) => {
    const attempt = scormAttempts.find((item) => item.lessonId === lesson.id && item.scormPackageId === lesson.scormPackageId) || null;
    return isScormLessonComplete(lesson, attempt);
  }).length;
  return { completed: Math.min(completedParts + completedBlocks + completedScorm, total), total };
}

function getCourseCompletion(
  lessons: ElearningLesson[],
  parts: ElearningLessonPart[],
  blocks: ElearningLessonBlock[],
  progress: ElearningProgress[],
  scormAttempts: ElearningScormAttempt[] = [],
  blockAttempts: ElearningBlockAttempt[] = [],
  optimisticBlockStatus: Record<string, NativeBlockStatus> = {},
) {
  const counts = getCourseLearningUnitCounts(lessons, parts, blocks, progress, scormAttempts, blockAttempts, optimisticBlockStatus);
  if (!counts.total) return 0;
  return Math.round((counts.completed / counts.total) * 100);
}

function isNativeQuestionBlock(block: ElearningLessonBlock) {
  return block.blockType !== 'video';
}

function normalizeNativeAnswerValue(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
}

function getLessonLearningUnitCounts(
  lesson: ElearningLesson,
  bundle: ElearningCourseBundle,
  optimisticBlockStatus: Record<string, NativeBlockStatus> = {},
) {
  if (lesson.lessonType === 'scorm') {
    const attempt = bundle.scormAttempts.find((item) => item.lessonId === lesson.id && item.scormPackageId === lesson.scormPackageId) || null;
    return { completed: isScormLessonComplete(lesson, attempt) ? 1 : 0, total: 1 };
  }
  if (lesson.lessonType === 'native_sequence') {
    const requiredBlocks = bundle.lessonBlocks.filter((block) => block.lessonId === lesson.id && block.status === 'published' && block.isRequired);
    const completed = requiredBlocks.filter((block) => {
      const attempt = bundle.blockAttempts.find((item) => item.blockId === block.id);
      return isNativeBlockComplete(block, attempt) || optimisticBlockStatus[block.id] === 'saved';
    }).length;
    return { completed, total: requiredBlocks.length };
  }
  const requiredParts = bundle.parts.filter((part) => part.lessonId === lesson.id && part.status === 'published' && part.isRequired);
  const completed = requiredParts.filter((part) => getPartProgress(bundle.progress, part.id)?.isCompleted).length;
  return { completed, total: requiredParts.length };
}

function isLessonComplete(
  lesson: ElearningLesson,
  bundle: ElearningCourseBundle,
  optimisticBlockStatus: Record<string, NativeBlockStatus> = {},
) {
  const counts = getLessonLearningUnitCounts(lesson, bundle, optimisticBlockStatus);
  return counts.total > 0 && counts.completed >= counts.total;
}

function getLearningResultCompletedCount(bundle: ElearningCourseBundle) {
  const publishedCount = bundle.lessons.filter((lesson) => lesson.status === 'published').length;
  return Math.max(0, Math.min(publishedCount, bundle.learningResult?.lessonCompletedCount || 0));
}

function getEffectiveLessonLearningUnitCounts(
  lesson: ElearningLesson,
  lessonIndex: number,
  bundle: ElearningCourseBundle,
  optimisticBlockStatus: Record<string, NativeBlockStatus> = {},
) {
  const counts = getLessonLearningUnitCounts(lesson, bundle, optimisticBlockStatus);
  if (lessonIndex < getLearningResultCompletedCount(bundle)) {
    const total = Math.max(counts.total, 1);
    return { completed: Math.max(counts.completed, total), total };
  }
  return counts;
}

function isEffectiveLessonComplete(
  lesson: ElearningLesson,
  lessonIndex: number,
  bundle: ElearningCourseBundle,
  optimisticBlockStatus: Record<string, NativeBlockStatus> = {},
) {
  const counts = getEffectiveLessonLearningUnitCounts(lesson, lessonIndex, bundle, optimisticBlockStatus);
  return counts.total > 0 && counts.completed >= counts.total;
}

function getLessonCompletionPercent(
  lessons: ElearningLesson[],
  bundle: ElearningCourseBundle,
  optimisticBlockStatus: Record<string, NativeBlockStatus> = {},
) {
  const publishedLessons = lessons.filter((lesson) => lesson.status === 'published');
  if (!publishedLessons.length) return 0;
  const completedLessons = publishedLessons.filter((lesson, index) => isEffectiveLessonComplete(lesson, index, bundle, optimisticBlockStatus)).length;
  const lessonPercent = Math.round((completedLessons / publishedLessons.length) * 100);
  return Math.max(lessonPercent, bundle.learningResult?.progressPercent || 0);
}

function getUnlockedLessonIds(
  lessons: ElearningLesson[],
  bundle: ElearningCourseBundle,
  optimisticBlockStatus: Record<string, NativeBlockStatus> = {},
) {
  return new Set(
    lessons
      .filter((lesson, index) => {
        const previousLessons = lessons.slice(0, index);
        return previousLessons.every((item, previousIndex) => isEffectiveLessonComplete(item, previousIndex, bundle, optimisticBlockStatus));
      })
      .map((lesson) => lesson.id),
  );
}

function getFirstUnlockedLessonId(lessons: ElearningLesson[], unlockedLessonIds: Set<string>) {
  return lessons.find((lesson) => unlockedLessonIds.has(lesson.id))?.id || lessons[0]?.id || '';
}

function getNextSequentialLesson(
  lessons: ElearningLesson[],
  currentLessonId: string,
  bundle: ElearningCourseBundle,
  optimisticBlockStatus: Record<string, NativeBlockStatus> = {},
) {
  const currentIndex = lessons.findIndex((lesson) => lesson.id === currentLessonId);
  if (currentIndex < 0) return null;
  const unlockedLessonIds = getUnlockedLessonIds(lessons, bundle, optimisticBlockStatus);
  return lessons.slice(currentIndex + 1).find((lesson) => unlockedLessonIds.has(lesson.id)) || null;
}

function getReadableBlockTitle(title: string) {
  const parts = title.split(/\s+-\s+/).map((item) => item.trim()).filter(Boolean);
  if (parts.length === 2 && normalizeNativeAnswerValue(parts[0]) === normalizeNativeAnswerValue(parts[1])) return parts[0];
  return title;
}

function parseVimeoPlayerMessage(event: MessageEvent) {
  if (typeof event.origin === 'string' && event.origin && !event.origin.includes('vimeo.com')) return null;
  const payload = typeof event.data === 'string'
    ? (() => {
      try {
        return JSON.parse(event.data);
      } catch {
        return null;
      }
    })()
    : event.data;
  if (!payload || typeof payload !== 'object') return null;
  const eventName = typeof payload.event === 'string' ? payload.event : '';
  if (!eventName) return null;
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  return {
    eventName,
    seconds: Number(data.seconds || 0),
    duration: Number(data.duration || 0),
    percent: Number(data.percent || 0),
  };
}

function selectElearningLessonStartTarget(bundle: ElearningCourseBundle, lessonId: string) {
  const lesson = bundle.lessons.find((item) => item.id === lessonId && item.status === 'published');
  if (!lesson) return selectElearningResumeTarget(bundle);
  if (lesson.lessonType === 'scorm') return { type: 'scorm' as const, lessonId: lesson.id };
  if (lesson.lessonType === 'native_sequence') return { type: 'native' as const, lessonId: lesson.id };
  const part = bundle.parts.find((item) => item.lessonId === lesson.id && item.status === 'published') || bundle.parts.find((item) => item.lessonId === lesson.id);
  return part ? { type: 'part' as const, partId: part.id } : { type: 'empty' as const };
}

export function ElearningPlayerPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { profile, session } = useAuth();
  const courseId = params.courseId || '';
  const routeLessonId = params.lessonId || '';
  const profileId = profile?.id || '';
  const userId = session?.user?.id || profile?.authUserId || session?.user?.email || profileId || 'anonymous';
  const [bundle, setBundle] = useState<Awaited<ReturnType<typeof getElearningCourseBundle>>>(null);
  const [activePartId, setActivePartId] = useState('');
  const [activeScormLessonId, setActiveScormLessonId] = useState('');
  const [activeNativeLessonId, setActiveNativeLessonId] = useState('');
  const [activeNativeBlockId, setActiveNativeBlockId] = useState('');
  const [loading, setLoading] = useState(true);
  const [runtimeQueueSeconds, setRuntimeQueueSeconds] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const nativeVideoIframeRef = useRef<HTMLIFrameElement | null>(null);
  const nativeVideoPlayerRef = useRef<InstanceType<NonNullable<typeof window.Vimeo>['Player']> | null>(null);
  const nativeVideoPlaybackRef = useRef<NativeVideoPlaybackSnapshot | null>(null);
  const nativeVideoFrameRef = useRef<HTMLDivElement | null>(null);
  const learnerStageRef = useRef<HTMLElement | null>(null);
  const activeNativeRowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const saveRef = useRef({ lastSavedAt: 0, duration: 0, nextDelayMs: 12000 });
  const resumeAtRef = useRef(0);
  const [scormSyncStatus, setScormSyncStatus] = useState<ScormSyncStatus>('idle');
  const [progressSyncStatus, setProgressSyncStatus] = useState<ScormSyncStatus>('idle');
  const [nativeAnswers, setNativeAnswers] = useState<Record<string, string | string[]>>({});
  const [nativeAnswerStatus, setNativeAnswerStatus] = useState<Record<string, NativeBlockStatus>>({});
  const [learnerPanelTab, setLearnerPanelTab] = useState<'resources' | 'notes'>('resources');
  const [learnerNoteText, setLearnerNoteText] = useState('');
  const [learnerNotes, setLearnerNotes] = useState<LearnerSavedEntry[]>([]);
  const [lessonSearchQuery, setLessonSearchQuery] = useState('');
  const [nativeVideoStatus, setNativeVideoStatus] = useState<'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error'>('idle');
  const [nativeVideoReloadKey, setNativeVideoReloadKey] = useState(0);
  const publishedLessons = useMemo(() => (
    (bundle?.lessons || []).filter((lesson) => lesson.status === 'published')
  ), [bundle?.lessons]);
  const unlockedLessonIds = useMemo(() => (
    bundle ? getUnlockedLessonIds(publishedLessons, bundle, nativeAnswerStatus) : new Set<string>()
  ), [bundle, nativeAnswerStatus, publishedLessons]);
  const safeRouteLessonId = routeLessonId && unlockedLessonIds.has(routeLessonId)
    ? routeLessonId
    : getFirstUnlockedLessonId(publishedLessons, unlockedLessonIds);

  const activePart = useMemo(() => {
    if (!bundle) return null;
    if (activeScormLessonId || activeNativeLessonId) return null;
    const fromQuery = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('part') || '' : '';
    const availableParts = safeRouteLessonId ? bundle.parts.filter((part) => part.lessonId === safeRouteLessonId) : bundle.parts;
    return availableParts.find((part) => part.id === activePartId) || availableParts.find((part) => part.id === fromQuery) || availableParts[0] || null;
  }, [activePartId, activeScormLessonId, activeNativeLessonId, bundle, safeRouteLessonId]);
  const activeScormLesson = bundle?.lessons.find((lesson) => lesson.id === activeScormLessonId && lesson.lessonType === 'scorm') || null;
  const activeNativeLesson = bundle?.lessons.find((lesson) => lesson.id === activeNativeLessonId && lesson.lessonType === 'native_sequence') || null;
  const activeNativeBlocks = useMemo(() => {
    if (!activeNativeLesson || !bundle) return [];
    return bundle.lessonBlocks
      .filter((block) => block.lessonId === activeNativeLesson.id && block.status === 'published')
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [activeNativeLesson?.id, bundle?.lessonBlocks]);
  const nativeAttemptMap = useMemo(() => {
    const map = new Map<string, ElearningBlockAttempt>();
    for (const attempt of bundle?.blockAttempts || []) {
      map.set(attempt.blockId, attempt);
    }
    return map;
  }, [bundle?.blockAttempts]);
  const activeScormPackage = activeScormLesson ? bundle?.scormPackages.find((item) => item.id === activeScormLesson.scormPackageId) || null : null;
  const activeScormAttempt = activeScormLesson ? bundle?.scormAttempts.find((item) => item.lessonId === activeScormLesson.id && item.scormPackageId === activeScormLesson.scormPackageId) || null : null;
  const activeEnrollment = bundle?.enrollment || null;
  const activeLesson = activePart && bundle ? bundle.lessons.find((lesson) => lesson.id === activePart.lessonId) || null : null;
  const activeProgress = activePart && bundle ? getPartProgress(bundle.progress, activePart.id) : null;
  const firstAvailableNativeBlock = useMemo(() => {
    if (!activeNativeBlocks.length) return null;
    const isBlockDone = (block: ElearningLessonBlock) => (
      isNativeBlockComplete(block, nativeAttemptMap.get(block.id)) || nativeAnswerStatus[block.id] === 'saved'
    );
    const firstIncomplete = activeNativeBlocks.find((block, index) => {
      const previousBlocks = activeNativeBlocks.slice(0, index);
      const isUnlocked = previousBlocks.every(isBlockDone);
      return isUnlocked && !isBlockDone(block);
    });
    return firstIncomplete || activeNativeBlocks[0];
  }, [activeNativeBlocks, nativeAnswerStatus, nativeAttemptMap]);
  const activeNativeBlock = activeNativeBlocks.find((block) => block.id === activeNativeBlockId) || firstAvailableNativeBlock;
  const activeNativeVideoSource = activeNativeBlock?.videoUrl || activeNativeBlock?.videoId || '';
  const activeNativeBlockIndex = activeNativeBlock ? activeNativeBlocks.findIndex((block) => block.id === activeNativeBlock.id) : -1;
  const activeNativeBlockCompleted = activeNativeBlock
    ? nativeAttemptMap.get(activeNativeBlock.id)?.isCompleted === true || nativeAnswerStatus[activeNativeBlock.id] === 'saved'
    : false;
  const learningUnitCounts = useMemo(() => (
    bundle
      ? getCourseLearningUnitCounts(bundle.lessons, bundle.parts, bundle.lessonBlocks, bundle.progress, bundle.scormAttempts, bundle.blockAttempts, nativeAnswerStatus)
      : { completed: 0, total: 0 }
  ), [bundle, nativeAnswerStatus]);
  const completionPercent = bundle ? getLessonCompletionPercent(bundle.lessons, bundle, nativeAnswerStatus) : 0;
  const activeContentTitle = activeNativeBlock ? getReadableBlockTitle(activeNativeBlock.title) : activeScormLesson?.title || activeNativeLesson?.title || activePart?.title || bundle?.course.title || 'VLearning';
  const learningActivityLabel = runtimeQueueSeconds ? 'Đang xếp lượt vào lớp' : 'Đang nạp hồ sơ và ghi danh';
  const learnerNoteStorageKey = buildLearnerStorageKey(VLEARNING_LEARNER_NOTE_STORAGE_PREFIX, courseId, userId, profileId);
  const activeCourseLesson = activeNativeLesson || activeScormLesson || activeLesson || null;
  const activeCourseLessonIndex = activeCourseLesson
    ? publishedLessons.findIndex((lesson) => lesson.id === activeCourseLesson.id)
    : -1;
  const lessonPositionLabel = activeCourseLessonIndex >= 0 && publishedLessons.length
    ? `${activeCourseLessonIndex + 1}/${publishedLessons.length} bài`
    : `${Math.max(publishedLessons.length, 1)} bài`;
  const courseDetailLink = `/vlearning/${courseId}`;
  const courseQuizLink = bundle?.course.finalQuizFormId
    ? `/quiz/${bundle.course.finalQuizFormId}?source=vlearning&courseId=${encodeURIComponent(bundle.course.id)}`
    : `${courseDetailLink}#course-quiz`;
  const currentLessonComplete = Boolean(
    bundle && activeCourseLesson && activeCourseLessonIndex >= 0 && isEffectiveLessonComplete(activeCourseLesson, activeCourseLessonIndex, bundle, nativeAnswerStatus),
  );
  const nextUnlockedLesson = useMemo(() => {
    if (!bundle || !activeCourseLesson || !currentLessonComplete) return null;
    return getNextSequentialLesson(publishedLessons, activeCourseLesson.id, bundle, nativeAnswerStatus);
  }, [activeCourseLesson, bundle, currentLessonComplete, nativeAnswerStatus, publishedLessons]);
  const filteredLessons = useMemo(() => {
    const needle = lessonSearchQuery.trim().toLowerCase();
    if (!bundle) return [];
    const visibleLessons = safeRouteLessonId ? bundle.lessons.filter((lesson) => lesson.id === safeRouteLessonId) : bundle.lessons;
    if (!needle) return visibleLessons;
    return visibleLessons.filter((lesson) => {
      const lessonParts = getLessonParts(bundle.parts, lesson.id);
      return lesson.title.toLowerCase().includes(needle) || lessonParts.some((part) => part.title.toLowerCase().includes(needle));
    });
  }, [bundle, lessonSearchQuery, safeRouteLessonId]);

  function notifyCompleteEachPart() {
    pushToast({
      title: 'Vui lòng hoàn thành từng phần bài học',
      tone: 'warning',
      durationMs: 2800,
    });
  }

  function scrollPlayerIntoView() {
    window.setTimeout(() => {
      learnerStageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  }

  function applyLessonTarget(target: ReturnType<typeof selectElearningLessonStartTarget>) {
    if (target.type === 'scorm') {
      setActiveScormLessonId(target.lessonId);
      setActiveNativeLessonId('');
      setActiveNativeBlockId('');
      setActivePartId('');
    } else if (target.type === 'native') {
      setActiveScormLessonId('');
      setActiveNativeLessonId(target.lessonId);
      setActivePartId('');
    } else if (target.type === 'part') {
      setActiveScormLessonId('');
      setActiveNativeLessonId('');
      setActiveNativeBlockId('');
      setActivePartId(target.partId);
    }
  }

  function handleGoToNextLesson() {
    if (!bundle || !nextUnlockedLesson) return;
    const target = selectElearningLessonStartTarget(bundle, nextUnlockedLesson.id);
    applyLessonTarget(target);
    navigate(`/vlearning/${courseId}/lesson/${nextUnlockedLesson.id}`);
    scrollPlayerIntoView();
  }

  function mergeSavedNativeAttempt(attempt: ElearningBlockAttempt) {
    setBundle((current) => current
      ? {
        ...current,
        blockAttempts: [
          attempt,
          ...current.blockAttempts.filter((item) => item.blockId !== attempt.blockId),
        ],
      }
      : current);
  }

  function mergeSavedProgress(progress: ElearningProgress) {
    setBundle((current) => {
      if (!current) return current;
      const existing = current.progress.find((item) => item.partId === progress.partId);
      const existingUpdatedAt = Date.parse(existing?.updatedAt || '');
      const nextUpdatedAt = Date.parse(progress.updatedAt || '');
      const authoritative = existing && Number.isFinite(existingUpdatedAt) && Number.isFinite(nextUpdatedAt) && existingUpdatedAt > nextUpdatedAt
        ? existing
        : progress;
      return {
        ...current,
        progress: [
          authoritative,
          ...current.progress.filter((item) => item.partId !== progress.partId),
        ],
      };
    });
  }

  async function refreshNativeCompletionFromServer(lessonId: string, blockId: string) {
    const nextBundle = await getElearningCourseBundle(courseId, userId, profileId);
    setBundle(nextBundle);
    const savedAttempt = nextBundle?.blockAttempts.find((attempt) => attempt.blockId === blockId && attempt.isCompleted);
    if (!savedAttempt) return null;
    const nextBlocks = (nextBundle?.lessonBlocks || [])
      .filter((item) => item.lessonId === lessonId && item.status === 'published')
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const currentIndex = nextBlocks.findIndex((item) => item.id === blockId);
    return {
      bundle: nextBundle,
      nextBlock: currentIndex >= 0 ? nextBlocks[currentIndex + 1] || null : null,
    };
  }

  async function reloadBundle(preferredPartId?: string, preferredScormLessonId?: string) {
    const currentInSessionLessonId = activeNativeLessonId || activeScormLessonId || activeLesson?.id || '';
    const nextBundle = await getElearningCourseBundle(courseId, userId, profileId);
    setBundle(nextBundle);
    if (preferredScormLessonId) {
      setActiveScormLessonId(preferredScormLessonId);
      setActiveNativeLessonId('');
      setActiveNativeBlockId('');
      setActivePartId('');
    } else if (preferredPartId) {
      setActiveScormLessonId('');
      setActiveNativeLessonId('');
      setActiveNativeBlockId('');
      setActivePartId(preferredPartId);
    } else if (nextBundle && routeLessonId) {
      const nextPublishedLessons = nextBundle.lessons.filter((lesson) => lesson.status === 'published');
      const nextUnlockedLessonIds = getUnlockedLessonIds(nextPublishedLessons, nextBundle, nativeAnswerStatus);
      const routeLessonStillPublished = nextPublishedLessons.some((lesson) => lesson.id === routeLessonId);
      const keepCurrentRouteLesson = routeLessonStillPublished && currentInSessionLessonId === routeLessonId;
      const nextSafeRouteLessonId = nextUnlockedLessonIds.has(routeLessonId) || keepCurrentRouteLesson
        ? routeLessonId
        : getFirstUnlockedLessonId(nextPublishedLessons, nextUnlockedLessonIds);
      if (nextSafeRouteLessonId && nextSafeRouteLessonId !== routeLessonId) {
        navigate(`/vlearning/${courseId}/lesson/${nextSafeRouteLessonId}`, { replace: true });
        pushToast({ title: 'Vui lòng học theo đúng lộ trình tuần tự.', tone: 'warning', durationMs: 2200 });
      }
      applyLessonTarget(selectElearningLessonStartTarget(nextBundle, nextSafeRouteLessonId || routeLessonId));
    } else if (!activePartId && !activeScormLessonId && !activeNativeLessonId) {
      const resumeTarget = selectElearningResumeTarget(nextBundle);
      if (resumeTarget.type === 'scorm') setActiveScormLessonId(resumeTarget.lessonId);
      else if (resumeTarget.type === 'native') setActiveNativeLessonId(resumeTarget.lessonId);
      else if (resumeTarget.type === 'part') setActivePartId(resumeTarget.partId);
    }
  }

  useEffect(() => {
    resumeAtRef.current = activeProgress?.lastPositionSeconds || 0;
  }, [activePart?.id]);

  useEffect(() => {
    if (!activeNativeBlocks.length) return;
    setNativeAnswers((current) => {
      const next = { ...current };
      for (const block of activeNativeBlocks) {
        const attempt = nativeAttemptMap.get(block.id);
        if (attempt && next[block.id] === undefined) {
          next[block.id] = Array.isArray(attempt.answer)
            ? attempt.answer.filter((item): item is string => typeof item === 'string')
            : String(attempt.answer ?? '');
        }
      }
      return next;
    });
    setNativeAnswerStatus((current) => {
      const next = { ...current };
      for (const block of activeNativeBlocks) {
        if (nativeAttemptMap.get(block.id)?.isCompleted && next[block.id] !== 'saved') {
          next[block.id] = 'saved';
        }
      }
      return next;
    });
  }, [activeNativeBlocks, nativeAttemptMap]);

  useEffect(() => {
    if (!activeNativeLesson || !firstAvailableNativeBlock) return;
    const stillValid = activeNativeBlocks.some((block) => block.id === activeNativeBlockId);
    if (!stillValid) setActiveNativeBlockId(firstAvailableNativeBlock.id);
  }, [activeNativeBlockId, activeNativeBlocks, activeNativeLesson, firstAvailableNativeBlock]);

  useEffect(() => {
    setLearnerNotes(readLearnerSavedEntries(learnerNoteStorageKey));
  }, [learnerNoteStorageKey]);

  useEffect(() => {
    if (!activeNativeBlock?.id) return;
    activeNativeRowRefs.current[activeNativeBlock.id]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeNativeBlock?.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMessage('');
    const identity = profileId || userId || session?.user?.email || courseId;
    const queueDelayMs = getLearningRuntimeQueueDelayMs(identity, `/vlearning/${courseId}/lesson/${routeLessonId || 'auto'}`);
    const waitForAdmission = async () => {
      await waitWithRuntimeCountdown(queueDelayMs, (seconds) => {
        if (!cancelled) setRuntimeQueueSeconds(seconds);
      });
      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (cancelled) return;
        const admission = await requestVLearningAdmission({
          courseId,
          lessonId: routeLessonId || 'auto',
        });
        if (admission.status === 'ready') {
          setRuntimeQueueSeconds(null);
          return;
        }
        if (admission.status === 'denied') {
          setRuntimeQueueSeconds(null);
          throw new Error(admission.message || 'Bạn không có quyền truy cập khóa học này.');
        }
        const retryAfterMs = Math.max(1000, Math.min(5000, admission.retryAfterMs || 1500));
        await waitWithRuntimeCountdown(retryAfterMs, (seconds) => {
          if (!cancelled) setRuntimeQueueSeconds(seconds);
        });
      }
      setRuntimeQueueSeconds(null);
      throw new Error('Hệ thống chưa thể tiếp nhận thêm lượt vào lớp. Vui lòng thử lại sau ít phút.');
    };
    waitForAdmission()
      .then(async () => {
        if (cancelled) return null;
        await Promise.all([
          flushBufferedVLearningProgressEvents().catch(() => []),
          flushBufferedVLearningScormRuntime().catch(() => []),
        ]);
        if (cancelled) return null;
        return reloadBundle();
      })
      .catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Không tải được khóa học.'))
      .finally(() => {
        if (!cancelled) {
          setRuntimeQueueSeconds(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      setRuntimeQueueSeconds(null);
    };
  }, [courseId, profileId, routeLessonId, session?.user?.email, userId]);

  async function markActivePartCompleted() {
    if (!activePart) return;
    try {
      setProgressSyncStatus('saving');
      const progress = await saveElearningProgress({
        userId,
        profileId,
        enrollmentId: activeEnrollment?.id || '',
        courseId,
        lessonId: activePart.lessonId,
        partId: activePart.id,
        progressPercent: 100,
        lastPositionSeconds: activePart.durationSeconds,
        isCompleted: true,
      });
      mergeSavedProgress(progress);
      setProgressSyncStatus('saved');
      setErrorMessage('');
    } catch (error) {
      setProgressSyncStatus('failed');
      console.warn('Unable to save e-learning progress.', error);
    }
  }

  function handleSaveLearnerNote() {
    const text = learnerNoteText.trim();
    if (!text) return;
    const next = [createLearnerSavedEntry(text), ...learnerNotes].slice(0, 30);
    setLearnerNotes(next);
    writeLearnerSavedEntries(learnerNoteStorageKey, next);
    setLearnerNoteText('');
    pushToast({ title: 'Đã lưu ghi chú', tone: 'success', durationMs: 1800 });
  }

  async function persistNativeBlockAttemptInBackground(block: ElearningLessonBlock, lessonId: string, answer: string | string[], score: number, syncLearningResult = false) {
    try {
      const attempt = await saveElearningBlockAttempt({
        userId,
        profileId,
        enrollmentId: activeEnrollment?.id || '',
        courseId,
        lessonId,
        blockId: block.id,
        answer,
        score,
        isCompleted: !isNativeQuestionBlock(block),
        syncLearningResult,
      });
      mergeSavedNativeAttempt(attempt);
      return attempt;
    } catch (error) {
      setNativeAnswerStatus((current) => ({ ...current, [block.id]: 'error' }));
      setErrorMessage(error instanceof Error ? error.message : 'Không lưu được câu trả lời.');
      return null;
    }
  }

  async function handleSaveNativeBlockAnswer(block: ElearningLessonBlock) {
    if (!activeNativeLesson) return;
    const answer = nativeAnswers[block.id] ?? '';
    const nextBlock = activeNativeBlocks[activeNativeBlocks.findIndex((item) => item.id === block.id) + 1] || null;
    setNativeAnswerStatus((current) => ({ ...current, [block.id]: 'saving' }));
    if (isNativeQuestionBlock(block)) {
      try {
        const result = await gradeElearningNativeBlock({
          courseId,
          blockId: block.id,
          answer,
        });
        mergeSavedNativeAttempt(result.attempt);
        if (!result.correct) {
          setNativeAnswerStatus((current) => ({ ...current, [block.id]: 'incorrect' }));
          pushToast({ title: 'Câu trả lời chưa đúng', message: 'Vui lòng thử lại để mở phần tiếp theo.', tone: 'warning', durationMs: 1800 });
          return;
        }
        setNativeAnswerStatus((current) => ({ ...current, [block.id]: 'saved' }));
        setActiveNativeLessonId(activeNativeLesson.id);
        setActiveNativeBlockId(block.id);
        return;
      } catch (error) {
        setNativeAnswerStatus((current) => ({ ...current, [block.id]: 'error' }));
        setErrorMessage(error instanceof Error ? error.message : 'Không chấm được câu trả lời.');
        return;
      }
    }
    const attempt = await persistNativeBlockAttemptInBackground(block, activeNativeLesson.id, answer, 0, !nextBlock);
    if (!attempt) return;
    setNativeAnswerStatus((current) => ({ ...current, [block.id]: 'saved' }));
    setActiveNativeLessonId(activeNativeLesson.id);
    setActiveNativeBlockId(block.id);
  }

  function rememberNativeVideoPlayback(blockId: string, snapshot: Partial<Omit<NativeVideoPlaybackSnapshot, 'blockId'>>) {
    const current = nativeVideoPlaybackRef.current?.blockId === blockId
      ? nativeVideoPlaybackRef.current
      : { blockId, seconds: 0, duration: 0, hasEnded: false };
    nativeVideoPlaybackRef.current = {
      blockId,
      seconds: snapshot.seconds ?? current.seconds,
      duration: snapshot.duration ?? current.duration,
      hasEnded: snapshot.hasEnded ?? current.hasEnded,
    };
  }

  function isNativeVideoPlaybackComplete(snapshot: NativeVideoPlaybackSnapshot | null, fallbackDuration = 0) {
    if (!snapshot) return false;
    const durationSeconds = Number(snapshot.duration || fallbackDuration || 0);
    return snapshot.hasEnded || (durationSeconds > 0 && Number(snapshot.seconds || 0) >= Math.max(1, durationSeconds - NATIVE_VIDEO_NEAR_END_SECONDS));
  }

  async function readNativeVideoPlayback(block: ElearningLessonBlock) {
    const storedSnapshot = nativeVideoPlaybackRef.current?.blockId === block.id ? nativeVideoPlaybackRef.current : null;
    if (isNativeVideoPlaybackComplete(storedSnapshot, block.durationSeconds)) return storedSnapshot;
    let player = nativeVideoPlayerRef.current;
    const iframe = nativeVideoIframeRef.current;
    if (!player && iframe) {
      await loadVimeoSdk().catch(() => undefined);
      if (window.Vimeo?.Player && nativeVideoIframeRef.current) {
        player = new window.Vimeo.Player(nativeVideoIframeRef.current);
        nativeVideoPlayerRef.current = player;
      }
    }
    if (!player) return storedSnapshot || { blockId: block.id, seconds: 0, duration: block.durationSeconds || 0, hasEnded: false };
    const [hasEnded, seconds, duration] = await Promise.all([
      player.getEnded ? player.getEnded().catch(() => false) : Promise.resolve(false),
      player.getCurrentTime().catch(() => storedSnapshot?.seconds || 0),
      player.getDuration().catch(() => storedSnapshot?.duration || block.durationSeconds || 0),
    ]);
    const snapshot = {
      blockId: block.id,
      seconds: Number(seconds || 0),
      duration: Number(duration || block.durationSeconds || 0),
      hasEnded: Boolean(hasEnded),
    };
    nativeVideoPlaybackRef.current = snapshot;
    return snapshot;
  }

  async function handleContinueNativeBlock(block: ElearningLessonBlock) {
    if (!activeNativeLesson) return;
    const currentStatus = nativeAnswerStatus[block.id];
    const isSaved = currentStatus === 'saved' || nativeAttemptMap.get(block.id)?.isCompleted === true;
    let isVideoReadyToContinue = block.blockType === 'video' && currentStatus === 'ready';
    if (!isSaved && block.blockType === 'video') {
      const refreshedCompletion = await refreshNativeCompletionFromServer(activeNativeLesson.id, block.id).catch(() => null);
      if (refreshedCompletion) {
        setNativeAnswerStatus((current) => ({ ...current, [block.id]: 'saved' }));
        setActiveNativeLessonId(activeNativeLesson.id);
        setActiveScormLessonId('');
        setActivePartId('');
        if (refreshedCompletion.nextBlock) {
          setActiveNativeBlockId(refreshedCompletion.nextBlock.id);
          scrollPlayerIntoView();
          return;
        }
        setActiveNativeBlockId(block.id);
        const projectedNativeStatus = { ...nativeAnswerStatus, [block.id]: 'saved' as const };
        const projectedNextLesson = refreshedCompletion.bundle
          ? getNextSequentialLesson(publishedLessons, activeNativeLesson.id, refreshedCompletion.bundle, projectedNativeStatus)
          : null;
        if (projectedNextLesson && refreshedCompletion.bundle) {
          const target = selectElearningLessonStartTarget(refreshedCompletion.bundle, projectedNextLesson.id);
          applyLessonTarget(target);
          navigate(`/vlearning/${courseId}/lesson/${projectedNextLesson.id}`);
          scrollPlayerIntoView();
          return;
        }
        if (refreshedCompletion.bundle?.course.finalQuizFormId) navigate(courseQuizLink);
        return;
      }
    }
    if (!isSaved && block.blockType === 'video') {
      isVideoReadyToContinue = true;
      setNativeVideoStatus('ended');
      setNativeAnswerStatus((current) => ({ ...current, [block.id]: 'ready' }));
    }
    if (!isSaved && !isVideoReadyToContinue) return;
    const nextBlock = activeNativeBlocks[activeNativeBlocks.findIndex((item) => item.id === block.id) + 1] || null;
    if (!isSaved && isVideoReadyToContinue) {
      setNativeAnswerStatus((current) => ({ ...current, [block.id]: 'saving' }));
      const attempt = await persistNativeBlockAttemptInBackground(block, activeNativeLesson.id, 'video-complete-confirmed', 0, !nextBlock);
      if (!attempt) return;
      setNativeAnswerStatus((current) => ({ ...current, [block.id]: 'saved' }));
      if (nextBlock) {
        setActiveScormLessonId('');
        setActiveNativeLessonId(activeNativeLesson.id);
        setActivePartId('');
        setActiveNativeBlockId(nextBlock.id);
        scrollPlayerIntoView();
        return;
      }
    }
    setActiveNativeLessonId(activeNativeLesson.id);
    if (nextBlock) {
      setActiveNativeBlockId(nextBlock.id);
      scrollPlayerIntoView();
      return;
    }
    setActiveNativeBlockId(block.id);
    const projectedNativeStatus = { ...nativeAnswerStatus, [block.id]: 'saved' as const };
    const projectedNextLesson = bundle
      ? getNextSequentialLesson(publishedLessons, activeNativeLesson.id, bundle, projectedNativeStatus)
      : null;
    if (projectedNextLesson && bundle) {
      const target = selectElearningLessonStartTarget(bundle, projectedNextLesson.id);
      applyLessonTarget(target);
      navigate(`/vlearning/${courseId}/lesson/${projectedNextLesson.id}`);
      scrollPlayerIntoView();
      return;
    }
    const projectedCompletionPercent = bundle
      ? getLessonCompletionPercent(publishedLessons, bundle, projectedNativeStatus)
      : completionPercent;
    if (bundle?.course.finalQuizFormId && projectedCompletionPercent >= 100) {
      navigate(courseQuizLink);
    }
  }

  useEffect(() => {
    const part = activePart;
    const iframe = iframeRef.current;
    if (!part || !part.videoId || !iframe) return undefined;

    let cancelled = false;
    let player: InstanceType<NonNullable<typeof window.Vimeo>['Player']> | null = null;

    loadVimeoSdk()
      .then(async () => {
        if (cancelled || !window.Vimeo?.Player || !iframeRef.current) return;
        player = new window.Vimeo.Player(iframeRef.current);
        const duration = part.durationSeconds || (await player.getDuration().catch(() => 0));
        saveRef.current.duration = duration || part.durationSeconds || 0;
        saveRef.current.nextDelayMs = 10000 + Math.round(Math.random() * 10000);
        const resumeAt = Math.max(0, resumeAtRef.current || 0);
        if (resumeAt > 2) await player.setCurrentTime(resumeAt).catch(() => 0);

        player.on('timeupdate', (payload?: { seconds?: number; percent?: number }) => {
          const now = Date.now();
          if (now - saveRef.current.lastSavedAt < saveRef.current.nextDelayMs) return;
          saveRef.current.lastSavedAt = now;
          saveRef.current.nextDelayMs = 10000 + Math.round(Math.random() * 10000);
          const seconds = Number(payload?.seconds || 0);
          const percent = payload?.percent !== undefined
            ? Math.round(Number(payload.percent) * 100)
            : saveRef.current.duration
              ? Math.round((seconds / saveRef.current.duration) * 100)
              : 0;
          const threshold = bundle?.course.completionThreshold || 90;
          setProgressSyncStatus('saving');
          void saveElearningProgress({
            userId,
            profileId,
            courseId,
            lessonId: part.lessonId,
            partId: part.id,
            progressPercent: percent,
            lastPositionSeconds: seconds,
            isCompleted: percent >= threshold,
          })
            .then((progress) => {
              mergeSavedProgress(progress);
              setProgressSyncStatus('saved');
            })
            .catch((error) => {
              setProgressSyncStatus('failed');
              console.warn('Unable to save e-learning progress.', error);
            });
        });

        player.on('ended', () => {
          setProgressSyncStatus('saving');
          void saveElearningProgress({
            userId,
            profileId,
            courseId,
            lessonId: part.lessonId,
            partId: part.id,
            progressPercent: 100,
            lastPositionSeconds: saveRef.current.duration || part.durationSeconds,
            isCompleted: true,
          })
            .then((progress) => {
              mergeSavedProgress(progress);
              setProgressSyncStatus('saved');
            })
            .catch((error) => {
              setProgressSyncStatus('failed');
              console.warn('Unable to save e-learning progress.', error);
            });
        });
      })
      .catch(() => {
        // The iframe can still play without the SDK; progress tracking falls back to the manual completion button.
      });

    return () => {
      cancelled = true;
      if (player) {
        player.off('timeupdate');
        player.off('ended');
        void player.destroy?.();
      }
    };
  }, [activePart?.id, activePart?.videoId, bundle?.course.completionThreshold, courseId, profileId, userId]);

  useEffect(() => {
    const block = activeNativeBlock;
    const lesson = activeNativeLesson;
    const iframe = nativeVideoIframeRef.current;
    const videoSource = block?.videoUrl || block?.videoId || '';
    if (!block || !lesson || block.blockType !== 'video' || !videoSource) {
      setNativeVideoStatus('idle');
      return undefined;
    }
    nativeVideoPlaybackRef.current = { blockId: block.id, seconds: 0, duration: block.durationSeconds || 0, hasEnded: false };
    if (activeNativeBlockCompleted) {
      setNativeVideoStatus('ended');
      return undefined;
    }
    if (!iframe) {
      setNativeVideoStatus('loading');
      return undefined;
    }

    let cancelled = false;
    let completed = false;
    let player: InstanceType<NonNullable<typeof window.Vimeo>['Player']> | null = null;
    let pollTimer: number | null = null;
    const setVideoStatus = (status: typeof nativeVideoStatus | ((current: typeof nativeVideoStatus) => typeof nativeVideoStatus)) => {
      if (!cancelled) setNativeVideoStatus(status);
    };
    setNativeVideoStatus('loading');
    const completeOnce = () => {
      if (cancelled || completed) return;
      completed = true;
      setVideoStatus('ended');
      setNativeAnswerStatus((current) => {
        const currentStatus = current[block.id];
        if (currentStatus === 'saved' || currentStatus === 'saving') return current;
        return { ...current, [block.id]: 'ready' };
      });
    };
    const handleVimeoMessage = (event: MessageEvent) => {
      if (event.source !== nativeVideoIframeRef.current?.contentWindow) return;
      const message = parseVimeoPlayerMessage(event);
      if (!message) return;
      if (message.duration > 0) {
        rememberNativeVideoPlayback(block.id, {
          seconds: message.seconds,
          duration: message.duration,
          hasEnded: message.eventName === 'ended',
        });
        const isNearEnd = message.seconds >= Math.max(1, message.duration - NATIVE_VIDEO_NEAR_END_SECONDS);
        if (isNearEnd) completeOnce();
      }
      if (message.eventName === 'ended') {
        rememberNativeVideoPlayback(block.id, { hasEnded: true });
        completeOnce();
      }
      if (message.eventName === 'play' || message.eventName === 'playing' || message.eventName === 'timeupdate') {
        setVideoStatus((current) => current === 'loading' || current === 'ready' ? 'playing' : current);
      } else if (message.eventName === 'loaded') {
        setVideoStatus('ready');
      } else if (message.eventName === 'pause') {
        setVideoStatus((current) => current === 'ended' ? current : 'paused');
      }
    };
    window.addEventListener('message', handleVimeoMessage);

    loadVimeoSdk()
      .then(async () => {
        if (cancelled || !window.Vimeo?.Player || !nativeVideoIframeRef.current) return;
        player = new window.Vimeo.Player(nativeVideoIframeRef.current);
        nativeVideoPlayerRef.current = player;
        const initialDuration = await player.getDuration().catch(() => 0);
        let duration = initialDuration || block.durationSeconds || 0;
        player.on('loaded', () => setVideoStatus('ready'));
        player.on('play', () => setVideoStatus('playing'));
        player.on('playing', () => setVideoStatus('playing'));
        player.on('pause', () => setVideoStatus((current) => current === 'ended' ? current : 'paused'));
        player.on('seeked', (payload?: { seconds?: number; duration?: number; percent?: number }) => {
          const seconds = Number(payload?.seconds || 0);
          const payloadDuration = Number(payload?.duration || duration || block.durationSeconds || 0);
          if (payloadDuration > 0) duration = payloadDuration;
          rememberNativeVideoPlayback(block.id, { seconds, duration: payloadDuration || duration });
          if (payloadDuration > 0 && seconds >= Math.max(1, payloadDuration - NATIVE_VIDEO_NEAR_END_SECONDS)) completeOnce();
        });
        player.on('timeupdate', (payload?: { seconds?: number; duration?: number; percent?: number }) => {
          const seconds = Number(payload?.seconds || 0);
          const payloadDuration = Number(payload?.duration || duration || 0);
          if (payloadDuration > 0) duration = payloadDuration;
          rememberNativeVideoPlayback(block.id, { seconds, duration: payloadDuration || duration });
          setVideoStatus((current) => current === 'loading' || current === 'ready' ? 'playing' : current);
          if (payloadDuration > 0 && seconds >= Math.max(1, payloadDuration - NATIVE_VIDEO_NEAR_END_SECONDS)) completeOnce();
        });
        player.on('ended', () => {
          rememberNativeVideoPlayback(block.id, { hasEnded: true, duration });
          completeOnce();
        });
        player.on('error', () => setVideoStatus('error'));
        pollTimer = window.setInterval(() => {
          if (cancelled || completed || !player) return;
          void Promise.all([
            player.getCurrentTime().catch(() => 0),
            duration > 0 ? Promise.resolve(duration) : player.getDuration().catch(() => 0),
            player.getEnded ? player.getEnded().catch(() => false) : Promise.resolve(false),
          ]).then(([seconds, nextDuration, hasEnded]) => {
            if (cancelled || completed) return;
            duration = Number(nextDuration || duration || block.durationSeconds || 0);
            const currentSeconds = Number(seconds || 0);
            rememberNativeVideoPlayback(block.id, { seconds: currentSeconds, duration, hasEnded: Boolean(hasEnded) });
            if (hasEnded || (duration > 0 && currentSeconds >= Math.max(1, duration - NATIVE_VIDEO_NEAR_END_SECONDS))) completeOnce();
          });
        }, VLEARNING_NATIVE_VIDEO_POLL_MS);
      })
      .catch(() => {
        setVideoStatus('error');
        // The iframe can still play without the SDK; the learner can reload once the SDK is available.
      });

    return () => {
      cancelled = true;
      window.removeEventListener('message', handleVimeoMessage);
      if (pollTimer) window.clearInterval(pollTimer);
      if (player) {
        player.off('loaded');
        player.off('play');
        player.off('playing');
        player.off('pause');
        player.off('seeked');
        player.off('timeupdate');
        player.off('ended');
        player.off('error');
      }
      if (nativeVideoPlayerRef.current === player) nativeVideoPlayerRef.current = null;
    };
  }, [activeNativeBlock?.id, activeNativeBlockCompleted, activeNativeLesson?.id, activeNativeVideoSource, nativeVideoReloadKey]);

  useEffect(() => {
    const lesson = activeScormLesson;
    const scormPackage = activeScormPackage;
    if (!lesson || !scormPackage) return undefined;
    const initialCompletionStatus = activeScormAttempt?.completionStatus && activeScormAttempt.completionStatus !== 'unknown'
      ? activeScormAttempt.completionStatus
      : 'incomplete';

    setScormSyncStatus('idle');
    const initialRuntimeData = {
      'cmi.core.lesson_status': initialCompletionStatus,
      'cmi.core.lesson_location': activeScormAttempt?.location || '',
      'cmi.core.score.raw': activeScormAttempt?.scoreRaw === null || activeScormAttempt?.scoreRaw === undefined ? '' : String(activeScormAttempt.scoreRaw),
      'cmi.core.total_time': activeScormAttempt?.totalTime || '',
      'cmi.completion_status': initialCompletionStatus,
      'cmi.success_status': activeScormAttempt?.successStatus || 'unknown',
      'cmi.score.raw': activeScormAttempt?.scoreRaw === null || activeScormAttempt?.scoreRaw === undefined ? '' : String(activeScormAttempt.scoreRaw),
      'cmi.score.scaled': activeScormAttempt?.scoreScaled === null || activeScormAttempt?.scoreScaled === undefined ? '' : String(activeScormAttempt.scoreScaled),
      'cmi.location': activeScormAttempt?.location || '',
      'cmi.suspend_data': activeScormAttempt?.suspendData || '',
      'cmi.total_time': activeScormAttempt?.totalTime || '',
      ...(activeScormAttempt?.runtimeData || {}),
    };

    const bridge = createScormRuntimeBridge({
      initialRuntimeData,
      learnerId: profileId || userId,
      learnerName: profile?.fullName || session?.user?.email || userId,
      debounceMs: SCORM_SAVE_DEBOUNCE_MS,
      onStatusChange: setScormSyncStatus,
      onSave: (runtimeData) => saveElearningScormRuntime({
        userId,
        profileId,
        enrollmentId: activeEnrollment?.id || '',
        courseId,
        lessonId: lesson.id,
        scormPackageId: scormPackage.id,
        runtimeData,
      }),
    });

    return () => bridge.cleanup();
  }, [activeEnrollment?.id, activeScormLesson?.id, activeScormPackage?.id, activeScormAttempt?.id, courseId, profile?.fullName, profileId, session?.user?.email, userId]);

  if (loading) {
    return (
      <VLearningLearnerShell title="VLearning">
        <div className="elearning-public-page">
          <div className="elearning-loading-status">
            <ActivityBars active={loading} tone={runtimeQueueSeconds ? 'amber' : 'blue'} label={learningActivityLabel} />
            <strong>{learningActivityLabel}</strong>
          </div>
          <SectionHeader eye="E-learning" title={runtimeQueueSeconds ? 'Đang chuẩn bị dữ liệu học' : 'Đang tải khóa học'} />
          {runtimeQueueSeconds ? <div className="notice">Hệ thống đang xếp lượt tải dữ liệu học, tự tiếp tục sau khoảng {runtimeQueueSeconds} giây.</div> : null}
        </div>
      </VLearningLearnerShell>
    );
  }

  if (!bundle) {
    return (
      <VLearningLearnerShell title="VLearning">
        <div className="elearning-public-page">
          <SectionHeader eye="E-learning" title="Không tìm thấy khóa học" />
          {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
        </div>
      </VLearningLearnerShell>
    );
  }

  const activeNativeNextBlock = activeNativeBlock
    ? activeNativeBlocks[activeNativeBlocks.findIndex((item) => item.id === activeNativeBlock.id) + 1] || null
    : null;
  const activeNativeCompletionMessage = activeNativeNextBlock
    ? 'Phần này đã hoàn thành. Bấm tiếp tục để sang phần kế tiếp.'
    : nextUnlockedLesson
      ? 'Bài này đã hoàn thành. Bấm tiếp tục để sang bài kế tiếp.'
      : bundle.course.finalQuizFormId && completionPercent >= 100
        ? 'Khóa học đã hoàn thành. Bấm tiếp tục để sang bài kiểm tra.'
        : 'Bài này đã hoàn thành.';
  const activeNativeContinueLabel = activeNativeNextBlock
    ? 'Tiếp tục phần kế tiếp'
    : nextUnlockedLesson
      ? 'Tiếp tục bài kế tiếp'
      : bundle.course.finalQuizFormId && completionPercent >= 100
        ? 'Tới bài kiểm tra'
        : 'Tiếp tục';

  return (
    <VLearningLearnerShell
      title="VLearning"
      action={
        <>
        <nav className="elearning-learner-navlinks" aria-label="Điều hướng học viên">
          <a href="#course-content">Nội dung</a>
          <a href="#course-progress">Tiến độ</a>
        </nav>
        <div className="elearning-learner-account" title={profile?.fullName || session?.user?.email || userId}>
          <span>{(profile?.fullName || session?.user?.email || 'HV').slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{profile?.fullName || 'Học viên'}</strong>
            <small>{session?.user?.email || 'Đang học'}</small>
          </div>
        </div>
        </>
      }
      footer={
        <>
          <div>
            <strong>Vinabrain Learning Space</strong>
          </div>
          <nav aria-label="Hỗ trợ VLearning">
            <a href="mailto:support@vinabrain.com.vn">Hỗ trợ</a>
            <a href="/vlearning">Khóa học của tôi</a>
            <span>{completionPercent}% hoàn thành · {lessonPositionLabel}</span>
          </nav>
        </>
      }
    >
        <div className="elearning-public-page elearning-learner-studio">
          <section className="elearning-learner-studio-head" id="course-progress">
            <div>
              <div className="section-eye">E-learning</div>
              <h1>{bundle.course.title}</h1>
              {bundle.course.description ? <p>{bundle.course.description}</p> : null}
            </div>
            <div className="elearning-progress-summary">
              <strong>{completionPercent}%</strong>
              <span>hoàn thành khóa học</span>
              <div className="elearning-progress-summary-actions">
                <em>{lessonPositionLabel}</em>
                <Link to={courseDetailLink}>Về khóa học</Link>
                {bundle.course.finalQuizFormId ? <Link to={courseQuizLink}>Bài kiểm tra</Link> : null}
              </div>
            </div>
          </section>

          {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

          <div className="elearning-learner-studio-grid" id="course-content">
            <aside className="elearning-learner-syllabus-panel">
              <div className="elearning-learner-panel-head">
                <div>
                  <span className="section-eye">Bài học</span>
                  <strong>Danh sách nội dung</strong>
                </div>
                <Badge tone="success">{completionPercent}%</Badge>
              </div>
              <label className="elearning-learner-search">
                <Search size={14} aria-hidden="true" />
                <input value={lessonSearchQuery} onChange={(event) => setLessonSearchQuery(event.target.value)} placeholder="Tìm bài học" />
              </label>
              <div className="elearning-learner-syllabus-list">
                {filteredLessons.map((lesson) => (
                  <div className="elearning-player-nav-group" key={lesson.id}>
                    <div className="elearning-player-nav-title">{lesson.title}</div>
                    {lesson.lessonType === 'scorm' ? (
                      <button
                        className={`elearning-player-nav-row${activeScormLesson?.id === lesson.id ? ' active' : ''}`}
                        onClick={() => {
                          setActiveScormLessonId(lesson.id);
                          setActiveNativeLessonId('');
                          setActivePartId('');
                        }}
                      >
                        <span>S</span>
                        <strong>SCORM package</strong>
                        <em>{isScormLessonComplete(lesson, bundle.scormAttempts.find((item) => item.lessonId === lesson.id) || null) ? 'Hoàn thành' : 'Đang học'}</em>
                      </button>
                    ) : null}
                    {lesson.lessonType === 'native_sequence' ? (
                      bundle.lessonBlocks
                        .filter((block) => block.lessonId === lesson.id && block.status === 'published')
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((block, blockIndex, lessonBlocks) => {
                          const previousBlocks = lessonBlocks.slice(0, blockIndex);
                          const isBlockDone = (item: ElearningLessonBlock) => (
                            isNativeBlockComplete(item, nativeAttemptMap.get(item.id)) || nativeAnswerStatus[item.id] === 'saved'
                          );
                          const isLocked = previousBlocks.some((item) => !isBlockDone(item));
                          const isCompleted = isBlockDone(block);
                          const isActive = activeNativeBlock?.id === block.id;
                          return (
                            <button
                              ref={(node) => {
                                activeNativeRowRefs.current[block.id] = node;
                              }}
                              className={`elearning-player-nav-row${isActive ? ' active' : ''}${isLocked ? ' locked' : ''}`}
                              disabled={isLocked}
                              key={block.id}
                              onClick={() => {
                                if (isLocked) {
                                  notifyCompleteEachPart();
                                  return;
                                }
                                setActiveNativeLessonId(lesson.id);
                                setActiveNativeBlockId(block.id);
                                setActiveScormLessonId('');
                                setActivePartId('');
                                scrollPlayerIntoView();
                              }}
                              type="button"
                            >
                              <span>{block.blockType === 'video' ? 'V' : 'Q'}</span>
                              <strong>{getReadableBlockTitle(block.title)}</strong>
                              <em>{isLocked ? 'Khóa' : isCompleted ? 'Hoàn thành' : block.blockType === 'video' ? 'Video' : 'Câu hỏi'}</em>
                            </button>
                          );
                        })
                    ) : null}
                    {getLessonParts(bundle.parts, lesson.id).map((part, partIndex) => {
                      const progress = getPartProgress(bundle.progress, part.id);
                      return (
                        <button className={`elearning-player-nav-row${activePart?.id === part.id ? ' active' : ''}`} key={part.id} onClick={() => { setActiveScormLessonId(''); setActiveNativeLessonId(''); setActivePartId(part.id); }}>
                          <span>{partIndex + 1}</span>
                          <strong>{part.title}</strong>
                          <em>{progress?.isCompleted ? 'Hoàn thành' : `${progress?.progressPercent || 0}%`} · {formatDuration(part.durationSeconds)}</em>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </aside>

            <main className="elearning-learner-stage" ref={learnerStageRef}>
              <div className="elearning-learner-video-shell">
          {activeScormLesson && activeScormPackage ? (
            <>
              <div className="elearning-video-frame">
                <iframe
                  key={`${activeScormPackage.id}-${activeScormPackage.launchPath}`}
                  ref={iframeRef}
                  src={buildScormLaunchUrl(activeScormPackage.id, activeScormPackage.launchPath)}
                  title={activeScormLesson.title}
                  allow="autoplay; fullscreen"
                  allowFullScreen
                />
              </div>
              <ProgressSaveIndicator status={scormSyncStatus} />
            </>
          ) : activeNativeLesson ? (
            <section className="card elearning-native-player-card">
              <div className="card-body">
                <div className="card-scroll">
                  <div className="elearning-lesson-detail">
                    {activeNativeLesson.description ? <p>{activeNativeLesson.description}</p> : null}
                    <div className="elearning-native-sequence">
                  {activeNativeBlock ? (
                    <section className="elearning-native-block" key={activeNativeBlock.id}>
                      {activeNativeBlock.content && activeNativeBlock.blockType === 'video' ? <p>{activeNativeBlock.content}</p> : null}
                      {activeNativeBlock.blockType === 'video' && activeNativeVideoSource ? (
                        <>
                          <div className="elearning-video-frame elearning-native-video-frame" ref={nativeVideoFrameRef}>
                            <iframe
                              key={`${activeNativeBlock.id}-${activeNativeVideoSource}-${nativeVideoReloadKey}`}
                              ref={nativeVideoIframeRef}
                              src={buildVimeoEmbedUrl(activeNativeVideoSource)}
                              title={activeNativeBlock.title}
                              lang="vi"
                              allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
                              referrerPolicy="strict-origin-when-cross-origin"
                              allowFullScreen
                            />
                            <div className="elearning-native-video-tools" aria-label="Công cụ video">
                              <button type="button" onClick={() => setNativeVideoReloadKey((current) => current + 1)} title="Tải lại video">
                                <RefreshCcw size={16} aria-hidden="true" />
                              </button>
                            </div>
                            {(nativeVideoStatus === 'error') && nativeAnswerStatus[activeNativeBlock.id] !== 'saved' && !nativeAttemptMap.get(activeNativeBlock.id)?.isCompleted ? (
                              <div className={`elearning-native-video-status is-${nativeVideoStatus}`}>
                                Video chưa tải được. Thử tải lại hoặc kiểm tra kết nối mạng.
                              </div>
                            ) : null}
                          </div>
                          {activeNativeBlock.blockType === 'video' ? (
                            <div className={`notice elearning-native-answer-feedback${['ready', 'saving', 'saved'].includes(nativeAnswerStatus[activeNativeBlock.id]) || nativeAttemptMap.get(activeNativeBlock.id)?.isCompleted ? ' success' : ''}`}>
                              <span>{['ready', 'saving', 'saved'].includes(nativeAnswerStatus[activeNativeBlock.id]) || nativeAttemptMap.get(activeNativeBlock.id)?.isCompleted ? activeNativeCompletionMessage : 'Bấm Tiếp tục để sang phần kế tiếp'}</span>
                              <button className="btn btn-primary btn-small" type="button" onClick={() => void handleContinueNativeBlock(activeNativeBlock)} disabled={nativeAnswerStatus[activeNativeBlock.id] === 'saving'}>
                                {nativeAnswerStatus[activeNativeBlock.id] === 'saving' ? 'Đang lưu...' : activeNativeContinueLabel}
                              </button>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="elearning-native-question">
                          <div className="elearning-native-question-prompt">
                            <strong>{activeNativeBlock.content || getReadableBlockTitle(activeNativeBlock.title)}</strong>
                          </div>
                          {activeNativeBlock.options.map((option, optionIndex) => {
                            const isAnswerLocked = nativeAnswerStatus[activeNativeBlock.id] === 'saved';
                            const isSelected = Array.isArray(nativeAnswers[activeNativeBlock.id])
                              ? (nativeAnswers[activeNativeBlock.id] as string[]).includes(option)
                              : nativeAnswers[activeNativeBlock.id] === option;
                            const isIncorrectSelection = nativeAnswerStatus[activeNativeBlock.id] === 'incorrect' && isSelected;
                            const isCorrectSelection = isAnswerLocked && isSelected;
                            return (
                              <label className={`elearning-native-answer-option${isIncorrectSelection ? ' is-incorrect' : ''}${isCorrectSelection ? ' is-correct' : ''}`} key={option}>
                                <input
                                  type={activeNativeBlock.blockType === 'multiple_choice' ? 'checkbox' : 'radio'}
                                  name={activeNativeBlock.id}
                                  checked={isSelected}
                                  disabled={isAnswerLocked}
                                  onChange={(event) => {
                                    if (isAnswerLocked) return;
                                    setNativeAnswerStatus({ ...nativeAnswerStatus, [activeNativeBlock.id]: 'idle' });
                                    if (activeNativeBlock.blockType === 'multiple_choice') {
                                      const current = Array.isArray(nativeAnswers[activeNativeBlock.id]) ? nativeAnswers[activeNativeBlock.id] as string[] : [];
                                      setNativeAnswers({
                                        ...nativeAnswers,
                                        [activeNativeBlock.id]: event.target.checked ? [...current, option] : current.filter((item) => item !== option),
                                      });
                                    } else {
                                      setNativeAnswers({ ...nativeAnswers, [activeNativeBlock.id]: option });
                                    }
                                  }}
                                />
                                <span className="elearning-native-answer-key">{String.fromCharCode(65 + optionIndex)}</span>
                                <span>{option}</span>
                              </label>
                            );
                          })}
                          {!activeNativeBlock.options.length ? (
                            <textarea
                              rows={3}
                              value={String(nativeAnswers[activeNativeBlock.id] || '')}
                              onChange={(event) => {
                                if (nativeAnswerStatus[activeNativeBlock.id] === 'saved') return;
                                setNativeAnswerStatus({ ...nativeAnswerStatus, [activeNativeBlock.id]: 'idle' });
                                setNativeAnswers({ ...nativeAnswers, [activeNativeBlock.id]: event.target.value });
                              }}
                              disabled={nativeAnswerStatus[activeNativeBlock.id] === 'saved'}
                              placeholder="Nhập câu trả lời"
                            />
                          ) : null}
                          <button className="btn btn-primary btn-small elearning-native-check-answer" type="button" onClick={() => void handleSaveNativeBlockAnswer(activeNativeBlock)} disabled={nativeAnswerStatus[activeNativeBlock.id] === 'saving' || nativeAnswerStatus[activeNativeBlock.id] === 'saved'}>
                            {nativeAnswerStatus[activeNativeBlock.id] === 'saving' ? 'Đang kiểm tra...' : 'Kiểm tra câu trả lời'}
                          </button>
                          {nativeAnswerStatus[activeNativeBlock.id] === 'saved' ? (
                            <div className="notice success elearning-native-answer-feedback">
                              <span>{activeNativeCompletionMessage}</span>
                              <button className="btn btn-primary btn-small" type="button" onClick={() => void handleContinueNativeBlock(activeNativeBlock)}>
                                {activeNativeContinueLabel}
                              </button>
                            </div>
                          ) : null}
                          {nativeAnswerStatus[activeNativeBlock.id] === 'incorrect' ? <div className="notice danger">Câu trả lời chưa đúng. Vui lòng thử lại để mở phần tiếp theo.</div> : null}
                          {nativeAnswerStatus[activeNativeBlock.id] === 'error' ? <div className="notice danger">Lỗi tạm thời, vui lòng lưu lại.</div> : null}
                        </div>
                      )}
                    </section>
                  ) : null}
                      {!activeNativeBlocks.length ? <div className="muted-text">Bài native này chưa có block được publish.</div> : null}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : activePart ? (
            <>
              <div className="elearning-video-frame">
                <iframe
                  key={activePart.id}
                  ref={iframeRef}
                  src={buildVimeoEmbedUrl(activePart.videoUrl || activePart.videoId)}
                  title={activePart.title}
                  lang="vi"
                  allow="autoplay; fullscreen; picture-in-picture"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>

              <Card
                title={activePart.title}
                action={<Badge tone={activeProgress?.isCompleted ? 'success' : 'warning'}>{activeProgress?.isCompleted ? 'Hoan thanh' : `${activeProgress?.progressPercent || 0}%`}</Badge>}
              >
                <div className="elearning-lesson-detail">
                  <p>{activePart.content || 'Xem hết video để hệ thống ghi nhận tiến độ phần học.'}</p>
                  <div className="muted-text">
                    {activeLesson?.title || 'Bài học'} · {formatDuration(activePart.durationSeconds)} · ngưỡng hoàn thành {bundle.course.completionThreshold}%
                  </div>
                  <ProgressSaveIndicator status={progressSyncStatus} />
                  <div className="action-row">
                    <button className="btn btn-primary" onClick={() => void markActivePartCompleted()}>
                      Đánh dấu đã học phần này
                    </button>
                  </div>
                </div>
              </Card>
            </>
          ) : (
            <Card title="Chưa có phần học">
              <div className="muted-text">Khóa học này chưa có phần video được publish.</div>
            </Card>
          )}
              </div>

              {nextUnlockedLesson ? (
                <button className="btn btn-primary elearning-learner-next-lesson" type="button" onClick={handleGoToNextLesson}>
                  Tiếp tục bài kế tiếp
                </button>
              ) : null}
              {!nextUnlockedLesson && bundle.course.finalQuizFormId && completionPercent >= 100 ? (
                <Link className="btn btn-primary elearning-learner-course-quiz-link" to={courseQuizLink}>
                  Tới bài kiểm tra
                </Link>
              ) : null}

              <section className="elearning-learner-material-panel">
                <div className="elearning-learner-tabs" role="tablist" aria-label="Tài liệu và ghi chú">
                  <button className={learnerPanelTab === 'resources' ? 'is-active' : ''} type="button" onClick={() => setLearnerPanelTab('resources')}>
                    <FileText size={14} aria-hidden="true" /> Tài liệu
                  </button>
                  <button className={learnerPanelTab === 'notes' ? 'is-active' : ''} type="button" onClick={() => setLearnerPanelTab('notes')}>
                    <StickyNote size={14} aria-hidden="true" /> Ghi chú
                  </button>
                </div>
                {learnerPanelTab === 'resources' ? (
                  <div className="elearning-learner-resource-list">
                    {bundle.scormPackages.map((item) => (
                      <div className="elearning-learner-resource-row" key={item.id}>
                        <FileText size={16} aria-hidden="true" />
                        <div>
                          <strong>{item.title || item.originalFileName}</strong>
                          <span>{item.scormVersion} · {item.slideCount || 0} slide · {Math.round(item.totalSizeBytes / 1024 / 1024)} MB</span>
                        </div>
                      </div>
                    ))}
                    {!bundle.scormPackages.length ? <div className="muted-text">Khóa học chưa có tài liệu đính kèm riêng.</div> : null}
                  </div>
                ) : (
                  <div className="elearning-learner-note-box">
                    <textarea rows={4} value={learnerNoteText} onChange={(event) => setLearnerNoteText(event.target.value)} placeholder="Ghi chú nhanh trong phiên học này" />
                    <button className="btn btn-ghost btn-small" type="button" onClick={handleSaveLearnerNote}>Lưu ghi chú</button>
                    <div className="elearning-learner-saved-list">
                      {learnerNotes.map((item) => (
                        <article key={item.id}>
                          <strong>{formatSavedEntryTime(item.createdAt)}</strong>
                          <p>{item.text}</p>
                        </article>
                      ))}
                      {!learnerNotes.length ? <div className="muted-text">Chưa có ghi chú nào trong khóa học này.</div> : null}
                    </div>
                  </div>
                )}
              </section>

            </main>
          </div>
        </div>
    </VLearningLearnerShell>
  );
}
