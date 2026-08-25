import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, ChevronRight, FileQuestion, Lock } from 'lucide-react';
import { AppSplash } from '@/components/system/AppSplash';
import { useToast } from '@/components/system/ToastProvider';
import { Badge, SectionHeader } from '@/components/ui/Primitives';
import { ActivityBars } from '@/components/vlearning/ActivityBars';
import { VLearningLearnerShell } from '@/components/vlearning/VLearningLearnerShell';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeAppRole } from '@/data/vcontent';
import {
  getElearningCourseBundle,
  type ElearningBlockAttempt,
  type ElearningCourseBundle,
  type ElearningLesson,
} from '@/lib/elearning';
import { ElearningLibraryPage } from '@/pages/ElearningPages';
import { getRumDurationMs, getRumStartedAt, reportVLearningRum } from '@/lib/rum';

export function ElearningAdminConsolePage() {
  const { loading, profile } = useAuth();
  if (loading) return <AppSplash />;
  const role = normalizeAppRole(profile?.role);
  if (!['admin', 'content_manager', 'production_manager'].includes(role)) {
    return <Navigate to="/vlearning" replace />;
  }
  return <ElearningLibraryPage />;
}

export function ElearningCourseDetailPage() {
  return <ElearningLibraryPage />;
}

function isScormLessonComplete(lesson: ElearningLesson, bundle: ElearningCourseBundle) {
  const attempt = bundle.scormAttempts.find((item) => item.lessonId === lesson.id && item.scormPackageId === lesson.scormPackageId);
  if (!attempt) return false;
  if (lesson.completionRule === 'passed') return attempt.isPassed;
  if (lesson.completionRule === 'score') {
    const score = attempt.scoreScaled !== null ? attempt.scoreScaled * 100 : attempt.scoreRaw;
    return Number(score || 0) >= lesson.passingScore;
  }
  return attempt.isCompleted || attempt.isPassed;
}

function isNativeBlockComplete(attempt: ElearningBlockAttempt | undefined) {
  return attempt?.isCompleted === true;
}

function getLessonProgress(lesson: ElearningLesson, bundle: ElearningCourseBundle) {
  if (lesson.lessonType === 'scorm') {
    return { completed: isScormLessonComplete(lesson, bundle) ? 1 : 0, total: 1 };
  }

  if (lesson.lessonType === 'native_sequence') {
    const blocks = bundle.lessonBlocks.filter((block) => block.lessonId === lesson.id && block.status === 'published' && block.isRequired);
    const completed = blocks.filter((block) => isNativeBlockComplete(bundle.blockAttempts.find((attempt) => attempt.blockId === block.id))).length;
    return { completed, total: blocks.length };
  }

  const parts = bundle.parts.filter((part) => part.lessonId === lesson.id && part.status === 'published' && part.isRequired);
  const completed = parts.filter((part) => bundle.progress.find((item) => item.partId === part.id)?.isCompleted).length;
  return { completed, total: parts.length };
}

function getLessonTypeLabel(lesson: ElearningLesson) {
  if (lesson.lessonType === 'scorm') return 'SCORM';
  if (lesson.lessonType === 'native_sequence') return 'Video';
  return 'Video';
}

function getCourseProgress(bundle: ElearningCourseBundle) {
  const publishedLessons = bundle.lessons.filter((lesson) => lesson.status === 'published');
  return {
    completed: publishedLessons.filter((lesson, index) => isEffectiveLessonComplete(lesson, index, bundle)).length,
    total: publishedLessons.length,
  };
}

function isLessonComplete(lesson: ElearningLesson, bundle: ElearningCourseBundle) {
  const progress = getLessonProgress(lesson, bundle);
  return progress.total > 0 && progress.completed >= progress.total;
}

function getLearningResultCompletedCount(bundle: ElearningCourseBundle) {
  const publishedCount = bundle.lessons.filter((lesson) => lesson.status === 'published').length;
  return Math.max(0, Math.min(publishedCount, bundle.learningResult?.lessonCompletedCount || 0));
}

function getEffectiveLessonProgress(lesson: ElearningLesson, lessonIndex: number, bundle: ElearningCourseBundle) {
  const progress = getLessonProgress(lesson, bundle);
  if (lessonIndex < getLearningResultCompletedCount(bundle)) {
    const total = Math.max(progress.total, 1);
    return { completed: Math.max(progress.completed, total), total };
  }
  return progress;
}

function isEffectiveLessonComplete(lesson: ElearningLesson, lessonIndex: number, bundle: ElearningCourseBundle) {
  const progress = getEffectiveLessonProgress(lesson, lessonIndex, bundle);
  return progress.total > 0 && progress.completed >= progress.total;
}

function getUnlockedLessonIds(lessons: ElearningLesson[], bundle: ElearningCourseBundle) {
  return new Set(
    lessons
      .filter((lesson, index) => {
        const previousLessons = lessons.slice(0, index);
        return previousLessons.every((item, previousIndex) => isEffectiveLessonComplete(item, previousIndex, bundle));
      })
      .map((lesson) => lesson.id),
  );
}

export function ElearningLearnerCourseDetailPage() {
  const { courseId = '' } = useParams();
  const { profile, session } = useAuth();
  const { pushToast } = useToast();
  const profileId = profile?.id || '';
  const userId = session?.user?.id || profile?.authUserId || session?.user?.email || profileId || 'anonymous';
  const [bundle, setBundle] = useState<ElearningCourseBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const quizCheckpointRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const rumStartedAt = getRumStartedAt();
    setLoading(true);
    setErrorMessage('');
    getElearningCourseBundle(courseId, userId, profileId)
      .then((nextBundle) => {
        if (!cancelled) {
          setBundle(nextBundle);
          void reportVLearningRum('open_course', getRumDurationMs(rumStartedAt), {
            scopeType: 'course',
            scopeId: courseId,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Không tải được khóa học.');
          void reportVLearningRum('open_course', getRumDurationMs(rumStartedAt), {
            status: 'error',
            scopeType: 'course',
            scopeId: courseId,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, profileId, userId]);

  const publishedLessons = useMemo(
    () => (bundle?.lessons || []).filter((lesson) => lesson.status === 'published'),
    [bundle?.lessons],
  );
  const courseProgress = useMemo(() => (bundle ? getCourseProgress(bundle) : { completed: 0, total: 0 }), [bundle]);
  const detailCompletionPercent = courseProgress.total ? Math.round((courseProgress.completed / courseProgress.total) * 100) : 0;
  const completionPercent = Math.max(detailCompletionPercent, bundle?.learningResult?.progressPercent || 0);
  const canOpenQuiz = Boolean(bundle?.course.finalQuizFormId && courseProgress.total > 0 && (courseProgress.completed >= courseProgress.total || completionPercent >= 100));
  const quizLink = bundle?.course.finalQuizFormId
    ? `/quiz/${bundle.course.finalQuizFormId}?source=vlearning&courseId=${encodeURIComponent(bundle.course.id)}`
    : '#';
  const unlockedLessonIds = useMemo(() => (bundle ? getUnlockedLessonIds(publishedLessons, bundle) : new Set<string>()), [bundle, publishedLessons]);
  const nextLessonId = useMemo(() => {
    if (!bundle) return '';
    return publishedLessons.find((lesson) => {
      const lessonIndex = publishedLessons.findIndex((item) => item.id === lesson.id);
      const progress = getEffectiveLessonProgress(lesson, lessonIndex, bundle);
      return !progress.total || progress.completed < progress.total;
    })?.id || publishedLessons[0]?.id || '';
  }, [bundle, publishedLessons]);

  function handleBlockedQuizClick(event: MouseEvent<HTMLAnchorElement>) {
    if (canOpenQuiz) return;
    event.preventDefault();
    pushToast({
      title: 'Vui lòng hoàn thành tất cả bài giảng trước khi làm bài kiểm tra cuối khóa.',
      tone: 'warning',
      durationMs: 2800,
    });
  }

  useEffect(() => {
    if (!bundle || typeof window === 'undefined' || window.location.hash !== '#course-quiz') return;
    const timer = window.setTimeout(() => {
      quizCheckpointRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [bundle]);

  if (loading) {
    return (
      <VLearningLearnerShell title="VLearning">
        <div className="elearning-public-page">
          <div className="elearning-loading-status">
            <ActivityBars active tone="blue" label="Đang tải khóa học" />
            <strong>Đang tải khóa học</strong>
          </div>
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

  return (
    <VLearningLearnerShell
      title="VLearning"
      action={
        <div className="elearning-learner-account" title={profile?.fullName || session?.user?.email || userId}>
          <span>{(profile?.fullName || session?.user?.email || 'HV').slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{profile?.fullName || 'Học viên'}</strong>
            <small>{session?.user?.email || 'Đang học'}</small>
          </div>
        </div>
      }
      footer={
        <nav aria-label="Hỗ trợ VLearning">
          <a href="mailto:support@vinabrain.com.vn">Hỗ trợ</a>
          <a href="/vlearning">Khóa học của tôi</a>
          <span>{completionPercent}% hoàn thành</span>
        </nav>
      }
    >
      <div className="elearning-public-page elearning-learner-studio">
        <section className="elearning-learner-studio-head">
          <div>
            <div className="section-eye">Khóa học</div>
            <h1>{bundle.course.title}</h1>
            {bundle.course.description ? <p>{bundle.course.description}</p> : null}
          </div>
          <div className="elearning-progress-summary">
            <strong>{completionPercent}%</strong>
            <span>hoàn thành khóa học</span>
          </div>
        </section>

        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

        <div className="elearning-course-summary-strip" aria-label="Tóm tắt khóa học">
          <span>{publishedLessons.length} bài học</span>
          <span>{bundle.course.finalQuizFormId ? '1 bài kiểm tra' : 'Chưa gắn bài kiểm tra'}</span>
        </div>

        <section className="elearning-course-roadmap-grid" aria-label="Lộ trình khóa học">
          <div className="elearning-course-lessons-panel">
            <div className="elearning-course-panel-head">
              <div>
                <span className="section-eye">Lộ trình bài học</span>
                <h2>Danh sách bài giảng</h2>
              </div>
              <Badge tone="neutral">{publishedLessons.length} bài</Badge>
            </div>
            <div className="elearning-course-lesson-list">
            {publishedLessons.map((lesson, index) => {
              const progress = getEffectiveLessonProgress(lesson, index, bundle);
              const total = Math.max(progress.total, 1);
              const lessonPercent = Math.round((progress.completed / total) * 100);
              const isCompleted = isEffectiveLessonComplete(lesson, index, bundle);
              const isActive = lesson.id === nextLessonId && !isCompleted;
              const isLocked = !unlockedLessonIds.has(lesson.id);
              const rowClassName = `elearning-course-lesson-row${isCompleted ? ' is-completed' : ''}${isActive ? ' is-active' : ''}${isLocked ? ' is-locked' : ''}`;
              const rowContent = (
                <>
                  <span className="elearning-course-lesson-index">{isCompleted ? <CheckCircle2 size={16} aria-hidden="true" /> : isLocked ? <Lock size={15} aria-hidden="true" /> : String(index + 1).padStart(2, '0')}</span>
                  <span className="elearning-course-lesson-main">
                    <strong>{lesson.title}</strong>
                    <em>{isLocked ? 'Chưa mở' : `${getLessonTypeLabel(lesson)} · ${progress.completed}/${total} nội dung`}</em>
                  </span>
                  <span className="elearning-course-lesson-progress" aria-label={`Tiến độ bài ${lessonPercent}%`}>
                    <span style={{ width: `${lessonPercent}%` }} />
                  </span>
                  <ChevronRight size={15} aria-hidden="true" />
                </>
              );
              if (isLocked) {
                return (
                  <button className={rowClassName} disabled key={lesson.id} type="button">
                    {rowContent}
                  </button>
                );
              }
              return (
                <Link className={rowClassName} key={lesson.id} to={`/vlearning/${bundle.course.id}/lesson/${lesson.id}`}>
                  {rowContent}
                </Link>
              );
            })}
            {!publishedLessons.length ? <div className="muted-text">Khóa học chưa có bài giảng được publish.</div> : null}
            </div>
          </div>

          <aside id="course-quiz" ref={quizCheckpointRef} className={`elearning-course-quiz-checkpoint${canOpenQuiz ? ' is-ready' : ' is-locked'}`} aria-label="Bài kiểm tra cuối khóa">
            <div className="elearning-course-quiz-icon">
              {canOpenQuiz ? <FileQuestion size={18} aria-hidden="true" /> : <Lock size={18} aria-hidden="true" />}
            </div>
            <div>
              <h2>Bài kiểm tra cuối khóa</h2>
              <p>{canOpenQuiz ? 'Bạn đã hoàn thành lộ trình bài học. Bài kiểm tra đã sẵn sàng.' : 'Hoàn thành tất cả bài giảng trước khi làm bài kiểm tra.'}</p>
            </div>
            <Link
              className={`btn ${canOpenQuiz ? 'btn-primary' : 'btn-ghost'} btn-small`}
              to={canOpenQuiz ? quizLink : '#'}
              onClick={handleBlockedQuizClick}
              aria-disabled={!canOpenQuiz}
            >
              {canOpenQuiz ? 'Làm bài kiểm tra' : 'Chưa mở'}
            </Link>
          </aside>
        </section>

        <Link className="btn btn-ghost btn-small elearning-course-back-link" to="/vlearning">
          <BookOpen size={14} aria-hidden="true" /> Khóa học của tôi
        </Link>
      </div>
    </VLearningLearnerShell>
  );
}
