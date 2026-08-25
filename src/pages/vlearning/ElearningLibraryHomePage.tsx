import { useEffect, useMemo, useRef, useState } from 'react';
import { Award, Bell, BookOpen, CheckCheck, ChevronRight, Clock3, GraduationCap, History, LogOut, TimerReset, UserRound } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Primitives';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeAppRole } from '@/data/vcontent';
import {
  listElearningLearnerDashboard,
  type ElearningEnrollment,
  type ElearningLearnerDashboardCourse,
} from '@/lib/elearning';
import { listNotifications, markNotificationRead, type NotificationRow } from '@/services/vcontent';

type LearnerDashboardView = 'available' | 'learning' | 'completed' | 'history' | 'results';

function formatDateOnly(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('vi-VN');
}

function getLearningStatusLabel(status: ElearningEnrollment['learningStatus']) {
  if (status === 'completed' || status === 'passed') return 'Hoàn thành';
  if (status === 'in_progress') return 'Đang học';
  if (status === 'failed') return 'Chưa đạt';
  if (status === 'expired') return 'Hết hạn';
  return 'Chưa học';
}

function getLearningStatusTone(status: ElearningEnrollment['learningStatus']): 'danger' | 'warning' | 'success' | 'neutral' {
  if (status === 'completed' || status === 'passed') return 'success';
  if (status === 'in_progress') return 'warning';
  if (status === 'failed' || status === 'expired') return 'danger';
  return 'neutral';
}

function getDashboardProgress(item: ElearningLearnerDashboardCourse) {
  if (item.result.lessonTotalCount > 0) {
    return Math.round((Math.min(item.result.lessonCompletedCount, item.result.lessonTotalCount) / item.result.lessonTotalCount) * 100);
  }
  if (item.result.progressPercent > 0) return item.result.progressPercent;
  if (item.enrollment.learningStatus === 'completed' || item.enrollment.learningStatus === 'passed') return 100;
  return 0;
}

function formatCourseAccessWindow(item: ElearningLearnerDashboardCourse) {
  const start = item.classSession?.startAt ? formatDateOnly(item.classSession.startAt) : '';
  const end = item.classSession?.endAt ? formatDateOnly(item.classSession.endAt) : '';
  if (start && end) return `Từ ngày ${start} · Đến ngày ${end}`;
  if (start) return `Từ ngày ${start}`;
  if (end) return `Đến ngày ${end}`;
  return `Giao ngày ${formatDateOnly(item.enrollment.assignedAt)}`;
}

function getLearnerDashboardView(rawView: string | null): LearnerDashboardView {
  if (rawView === 'learning' || rawView === 'completed' || rawView === 'history' || rawView === 'results') return rawView;
  return 'available';
}

function isCompletedCourse(item: ElearningLearnerDashboardCourse) {
  return item.enrollment.learningStatus === 'completed' || item.enrollment.learningStatus === 'passed';
}

function CourseCard({ item }: { item: ElearningLearnerDashboardCourse }) {
  const progress = getDashboardProgress(item);
  const courseDescription = item.course.description?.trim();

  return (
    <article className="elearning-learner-course-card">
      <div
        className={`elearning-learner-course-cover${item.course.thumbnailUrl ? ' has-image' : ''}`}
        style={item.course.thumbnailUrl ? { backgroundImage: `url("${item.course.thumbnailUrl}")` } : undefined}
      >
        <span>{progress}%</span>
      </div>
      <div className="elearning-learner-course-body">
        <div>
          <Badge tone={getLearningStatusTone(item.enrollment.learningStatus)}>{getLearningStatusLabel(item.enrollment.learningStatus)}</Badge>
          <h3>{item.course.title}</h3>
          {courseDescription ? <p>{courseDescription}</p> : null}
        </div>
        <div className="elearning-learner-course-meta">
          <span><BookOpen size={14} aria-hidden="true" /> {item.course.lessonCount} bài học</span>
          <span><Clock3 size={14} aria-hidden="true" /> {formatCourseAccessWindow(item)}</span>
        </div>
        <div className="elearning-learner-progress-track" aria-label={`Tiến độ ${progress}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <Link className="elearning-learner-course-action" to={`/vlearning/${item.course.id}`}>
          <span>Vào học</span>
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export function ElearningLibraryHomePage() {
  const { profile, session, signOut } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = getLearnerDashboardView(searchParams.get('view'));
  const role = normalizeAppRole(profile?.role);
  const canManage = ['admin', 'content_manager', 'production_manager', 'pm', 'qc'].includes(role);
  const profileId = profile?.id || '';
  const userId = session?.user?.id || profile?.authUserId || session?.user?.email || profileId || '';
  const learnerName = profile?.fullName || session?.user?.email || 'Học viên';
  const learnerEmail = session?.user?.email || profile?.email || '';
  const learnerProfileStatus = profile?.studentCode && !/^PROFILE[_-]/i.test(profile.studentCode)
    ? profile.studentCode
    : 'Đã liên kết';
  const [dashboardCourses, setDashboardCourses] = useState<ElearningLearnerDashboardCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const notificationLoadedForRef = useRef('');
  const notificationMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMessage('');
    listElearningLearnerDashboard(userId, profileId)
      .then((items) => {
        if (!cancelled) setDashboardCourses(items);
      })
      .catch((error) => {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : 'Không tải được khóa học của bạn.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, userId]);

  useEffect(() => {
    if (!notificationMenuOpen) return undefined;
    const learnerKey = `${userId}:${profileId}`;
    if (notificationLoadedForRef.current === learnerKey) return undefined;
    notificationLoadedForRef.current = learnerKey;
    let cancelled = false;
    let settled = false;
    setNotificationLoading(true);
    listNotifications()
      .then((items) => {
        if (cancelled) return;
        setNotifications(items.filter((item) => String(item.metadata?.module || item.metadata?.source || '').toLowerCase() === 'vlearning').slice(0, 8));
      })
      .catch(() => {
        if (!cancelled) setNotifications([]);
      })
      .finally(() => {
        settled = true;
        if (!cancelled) setNotificationLoading(false);
      });
    return () => {
      cancelled = true;
      if (!settled && notificationLoadedForRef.current === learnerKey) {
        notificationLoadedForRef.current = '';
      }
    };
  }, [notificationMenuOpen, profileId, userId]);

  useEffect(() => {
    if (!notificationMenuOpen && !profileMenuOpen) return undefined;
    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && notificationMenuRef.current?.contains(target)) return;
      if (target instanceof Node && profileMenuRef.current?.contains(target)) return;
      setNotificationMenuOpen(false);
      setProfileMenuOpen(false);
    }
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [notificationMenuOpen, profileMenuOpen]);

  useEffect(() => {
    if (!notificationMenuOpen) return;
    const unreadIds = notifications.filter((item) => !item.read_at).map((item) => item.id);
    if (!unreadIds.length) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => (unreadIds.includes(item.id) ? { ...item, read_at: readAt } : item)));
    void Promise.all(unreadIds.map((id) => markNotificationRead(id))).catch(() => undefined);
  }, [notificationMenuOpen, notifications]);

  const learningCourses = useMemo(
    () => dashboardCourses.filter((item) => !isCompletedCourse(item)),
    [dashboardCourses],
  );
  const completedCourses = useMemo(
    () => dashboardCourses.filter((item) => isCompletedCourse(item)),
    [dashboardCourses],
  );
  const recentHistory = useMemo(
    () => [...dashboardCourses]
      .sort((a, b) => new Date(b.result.lastAccessAt || b.enrollment.lastAccessAt || b.enrollment.assignedAt).getTime() - new Date(a.result.lastAccessAt || a.enrollment.lastAccessAt || a.enrollment.assignedAt).getTime())
      .slice(0, 12),
    [dashboardCourses],
  );

  const visibleCourses = activeView === 'completed'
    ? completedCourses
    : activeView === 'learning'
      ? learningCourses
      : dashboardCourses;
  const viewTitle = activeView === 'completed'
    ? 'Khóa học hoàn thành'
    : activeView === 'learning'
      ? 'Khóa đang học'
      : activeView === 'history'
        ? 'Log học tập'
        : activeView === 'results'
          ? 'Kết quả học tập'
          : 'Khóa khả dụng';

  const unreadNotifications = notifications.filter((item) => !item.read_at).length;

  if (canManage) {
    return <Navigate to="/vlearning/admin/library/lessons" replace />;
  }

  function setView(view: LearnerDashboardView) {
    setSearchParams(view === 'available' ? {} : { view });
  }

  function handleReadNotification(item: NotificationRow) {
    setNotificationMenuOpen(false);
    if (!item.read_at) {
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((row) => (row.id === item.id ? { ...row, read_at: readAt } : row)));
      markNotificationRead(item.id).catch(() => undefined);
    }
  }

  function handleReadAllNotifications() {
    const readAt = new Date().toISOString();
    const unreadIds = notifications.filter((item) => !item.read_at).map((item) => item.id);
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || readAt })));
    void Promise.all(unreadIds.map((id) => markNotificationRead(id))).catch(() => undefined);
  }

  function renderEmptyState() {
    if (loading) return <div className="muted-text">Đang tải khóa học...</div>;
    return (
      <div className="elearning-empty-state">
        <GraduationCap size={28} aria-hidden="true" />
        <strong>Chưa có dữ liệu phù hợp</strong>
      </div>
    );
  }

  return (
    <>
      <section className="elearning-learner-dashboard-hero" aria-label="Dashboard học viên VLearning">
        <div>
          <span className="section-eye">Cổng học viên · Learner Portal</span>
          <h1>Chào mừng trở lại, {learnerName}</h1>
          {canManage ? (
            <div className="action-row">
              <Link className="btn btn-ghost btn-small" to="/vlearning/admin/library/lessons">Mở quản trị</Link>
            </div>
          ) : null}
        </div>
        <div className="elearning-learner-hero-summary">
          <div className="elearning-learner-avatar-actions">
            <div className="elearning-learner-notification-menu" ref={notificationMenuRef}>
              <button
                className="elearning-learner-notification-button"
                type="button"
                aria-expanded={notificationMenuOpen}
                title="Thông báo hệ thống"
                onClick={() => {
                  setNotificationMenuOpen((open) => !open);
                  setProfileMenuOpen(false);
                }}
              >
                <Bell size={18} aria-hidden="true" />
                {unreadNotifications ? <span>{unreadNotifications}</span> : null}
              </button>
              {notificationMenuOpen ? (
                <div className="elearning-learner-notification-popover">
                  <div className="elearning-learner-notification-head">
                    <div>
                      <strong>Thông báo hệ thống</strong>
                      <span>{unreadNotifications ? `${unreadNotifications} thông báo chưa đọc` : 'Bạn đã đọc tất cả'}</span>
                    </div>
                    <button type="button" disabled={!notifications.length || !unreadNotifications} onClick={handleReadAllNotifications}>
                      <CheckCheck size={14} aria-hidden="true" />
                      <span>Đọc tất cả</span>
                    </button>
                  </div>
                  <div className="elearning-learner-notification-list">
                    {notifications.map((item) => (
                      <Link
                        className={`elearning-learner-notification-item${item.read_at ? '' : ' unread'}`}
                        key={item.id}
                        to={item.link_page?.startsWith('/') ? item.link_page : `/${item.link_page || 'vlearning'}`}
                        onClick={() => handleReadNotification(item)}
                      >
                        <span aria-hidden="true" />
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.body}</p>
                          <small>{item.created_at ? formatDateOnly(item.created_at) : ''}</small>
                        </div>
                      </Link>
                    ))}
                    {notificationLoading ? <div className="elearning-learner-notification-empty">Đang tải thông báo...</div> : null}
                    {!notificationLoading && !notifications.length ? <div className="elearning-learner-notification-empty">Chưa có thông báo VLearning.</div> : null}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="elearning-learner-avatar-menu" ref={profileMenuRef}>
              <button
                className="elearning-learner-avatar-button"
                type="button"
                aria-expanded={profileMenuOpen}
                onClick={() => {
                  setProfileMenuOpen((open) => !open);
                  setNotificationMenuOpen(false);
                }}
              >
                <span className="elearning-learner-avatar"><UserRound size={22} aria-hidden="true" /></span>
                <span>{learnerEmail || learnerName}</span>
              </button>
              {profileMenuOpen ? (
                <div className="elearning-learner-avatar-popover">
                  <section>
                    <h2>Tài khoản học viên</h2>
                    <div className="elearning-learner-profile-list">
                      <div><span>Họ tên</span><strong>{learnerName}</strong></div>
                      <div><span>Email</span><strong>{learnerEmail || '-'}</strong></div>
                      <div><span>Hồ sơ</span><strong>{learnerProfileStatus}</strong></div>
                    </div>
                  </section>
                  <section>
                    <h2>Lịch sử học gần đây</h2>
                    <div className="elearning-learner-history">
                      {recentHistory.slice(0, 4).map((item) => (
                        <Link className="elearning-learner-history-row" key={item.enrollment.id} to={`/vlearning/${item.course.id}`}>
                          <History size={15} aria-hidden="true" />
                          <div>
                            <strong>{item.course.title}</strong>
                            <span>{getLearningStatusLabel(item.enrollment.learningStatus)} · {getDashboardProgress(item)}% · {formatDateOnly(item.result.lastAccessAt || item.enrollment.lastAccessAt || item.enrollment.assignedAt)}</span>
                          </div>
                        </Link>
                      ))}
                      {!recentHistory.length && !loading ? <div className="muted-text">Chưa có lịch sử học.</div> : null}
                      <button className="elearning-learner-menu-link" type="button" onClick={() => { setView('history'); setProfileMenuOpen(false); }}>
                        Xem log học tập
                      </button>
                      <button className="elearning-learner-menu-link" type="button" onClick={() => { setView('results'); setProfileMenuOpen(false); }}>
                        Xem kết quả học tập
                      </button>
                      <button className="elearning-learner-menu-link" type="button" onClick={() => void signOut()}>
                        <LogOut size={15} aria-hidden="true" />
                        <span>Đăng xuất</span>
                      </button>
                    </div>
                  </section>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

      <section className="elearning-learner-kpis" aria-label="Tổng quan học tập">
        <button className={`elearning-learner-stat-card${activeView === 'available' ? ' is-active' : ''}`} type="button" onClick={() => setView('available')}>
          <div className="elearning-learner-stat-head">
            <span className="elearning-learner-stat-icon is-warm"><BookOpen size={18} aria-hidden="true" /></span>
            <Badge tone="success">Đang mở</Badge>
          </div>
          <h2>Khóa khả dụng</h2>
          <div className="elearning-learner-stat-value">{dashboardCourses.length}</div>
          <div className="elearning-learner-stat-footer">
            <span>Xem danh sách</span>
            <ChevronRight size={16} aria-hidden="true" />
          </div>
        </button>
        <button className={`elearning-learner-stat-card${activeView === 'learning' ? ' is-active' : ''}`} type="button" onClick={() => setView('learning')}>
          <div className="elearning-learner-stat-head">
            <span className="elearning-learner-stat-icon is-neutral"><Award size={18} aria-hidden="true" /></span>
            <span className="elearning-learner-stat-kicker">Tiến trình</span>
          </div>
          <h2>Đang học</h2>
          <div className="elearning-learner-stat-value">{learningCourses.length}</div>
          <div className="elearning-learner-stat-progress" aria-hidden="true">
            <span style={{ width: `${dashboardCourses.length ? Math.round((completedCourses.length / dashboardCourses.length) * 100) : 0}%` }} />
          </div>
          <div className="elearning-learner-stat-footer">
            <span>Xem danh sách</span>
            <ChevronRight size={16} aria-hidden="true" />
          </div>
        </button>
        <button className={`elearning-learner-stat-card${activeView === 'completed' ? ' is-active' : ''}`} type="button" onClick={() => setView('completed')}>
          <div className="elearning-learner-stat-head">
            <span className="elearning-learner-stat-icon is-green"><TimerReset size={18} aria-hidden="true" /></span>
            <span className="elearning-learner-stat-kicker">Hoàn thành</span>
          </div>
          <h2>Hoàn thành</h2>
          <div className="elearning-learner-stat-value">{completedCourses.length}</div>
          <div className="elearning-learner-stat-footer">
            <span>Xem danh sách</span>
            <ChevronRight size={16} aria-hidden="true" />
          </div>
        </button>
      </section>

      <section className="elearning-learner-dashboard-grid" aria-label={viewTitle}>
        <div className="elearning-learner-course-section">
          <div className="elearning-learner-course-section-head">
            <div>
              <h2>{viewTitle}</h2>
            </div>
            <Badge tone="neutral">{activeView === 'history' || activeView === 'results' ? recentHistory.length : visibleCourses.length} mục</Badge>
          </div>

          {activeView === 'history' ? (
            <div className="elearning-learner-log-list">
              {recentHistory.map((item) => (
                <Link className="elearning-learner-log-row" key={item.enrollment.id} to={`/vlearning/${item.course.id}`}>
                  <History size={18} aria-hidden="true" />
                  <div>
                    <strong>{item.course.title}</strong>
                    <span>{getLearningStatusLabel(item.enrollment.learningStatus)} · {getDashboardProgress(item)}% · {formatDateOnly(item.result.lastAccessAt || item.enrollment.lastAccessAt || item.enrollment.assignedAt)}</span>
                  </div>
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              ))}
              {!recentHistory.length ? renderEmptyState() : null}
            </div>
          ) : activeView === 'results' ? (
            <div className="elearning-learner-results-table">
              <table>
                <thead>
                  <tr>
                    <th>Khóa học</th>
                    <th>Tiến độ</th>
                    <th>Điểm</th>
                    <th>Tình trạng</th>
                    <th>Ngày cập nhật</th>
                  </tr>
                </thead>
                <tbody>
                  {recentHistory.map((item) => (
                    <tr key={item.enrollment.id}>
                      <td>{item.course.title}</td>
                      <td>{getDashboardProgress(item)}%</td>
                      <td>{item.result.quizScore ?? item.result.scormScore ?? '-'}</td>
                      <td><Badge tone={getLearningStatusTone(item.enrollment.learningStatus)}>{getLearningStatusLabel(item.enrollment.learningStatus)}</Badge></td>
                      <td>{formatDateOnly(item.result.lastAccessAt || item.enrollment.lastAccessAt || item.enrollment.assignedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!recentHistory.length ? renderEmptyState() : null}
            </div>
          ) : (
            <div className="elearning-learner-course-grid">
              {visibleCourses.map((item) => <CourseCard item={item} key={item.enrollment.id} />)}
              {!visibleCourses.length ? renderEmptyState() : null}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
