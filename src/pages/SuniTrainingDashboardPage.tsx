import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { suniTrainingApi, type SuniTrainingClass, type SuniTrainingCourse, type SuniTrainingResult } from '@/lib/suni';
import { queries } from '@/features/vtraining';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeAppRole } from '@/data/vcontent';
import { Badge, Card } from '@/components/ui/Primitives';

function normalizeCourseStatus(status: string | null | undefined) {
  const normalized = String(status || '').toLowerCase();
  if (['active', 'published'].includes(normalized)) return 'active';
  if (['locked'].includes(normalized)) return 'locked';
  return 'draft';
}

function normalizeClassStatus(status: string | null | undefined) {
  const normalized = String(status || '').toLowerCase();
  if (['active', 'open'].includes(normalized)) return 'active';
  if (['completed', 'closed'].includes(normalized)) return 'completed';
  return 'pending';
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Chưa xếp lịch';
  return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function downloadCustomerResultsWorkbook(rows: SuniTrainingResult[]) {
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(rows.map((result) => ({
    'Họ tên': result.studentName || result.studentProfileId,
    Email: result.studentEmail || '',
    'Mã học viên': result.studentCode || '',
    'Đơn vị': result.department || result.customerName || '',
    Khóa: result.courseTitle || result.courseId || '',
    Lớp: result.className || result.classId || '',
    'Chuyên cần': result.scores.attendance ?? '',
    'Kiểm tra': result.scores.quiz ?? '',
    'Thu hoạch': result.scores.reflection ?? '',
    'Thảo luận': result.scores.discussion ?? '',
    Game: result.scores.game ?? '',
    'Điểm cuối (/10)': result.finalScore ?? '',
    'Kết quả': result.passed == null ? 'Chưa chốt' : result.passed ? 'Đạt' : 'Chưa đạt',
  })));
  worksheet['!cols'] = [{ wch: 26 }, { wch: 30 }, { wch: 16 }, { wch: 24 }, { wch: 34 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'KetQuaHocTap');
  XLSX.writeFile(workbook, 'ket_qua_hoc_tap_vtraining.xlsx');
}

function courseProgress(course: SuniTrainingCourse, classes: SuniTrainingClass[]) {
  const linkedClasses = classes.filter((klass) => klass.courseId === course.id);
  if (!linkedClasses.length) return 0;
  const completed = linkedClasses.filter((klass) => normalizeClassStatus(klass.status) === 'completed').length;
  return Math.round((completed / linkedClasses.length) * 100);
}

function TrainingStatusPill({ status }: { status: string | null | undefined }) {
  const bucket = normalizeCourseStatus(status);
  const label = bucket === 'active' ? 'Đang mở' : bucket === 'locked' ? 'Đã khóa' : 'Nháp';
  return <span className={`vuni-pill ${bucket === 'active' ? 'is-blue' : bucket === 'locked' ? 'is-slate' : 'is-amber'}`}>{label}</span>;
}

function ClassStatusPill({ status }: { status: string | null | undefined }) {
  const bucket = normalizeClassStatus(status);
  const label = bucket === 'active' ? 'Đang triển khai' : bucket === 'completed' ? 'Hoàn thành' : 'Chuẩn bị';
  return <span className={`vuni-pill ${bucket === 'active' ? 'is-green' : bucket === 'completed' ? 'is-blue' : 'is-amber'}`}>{label}</span>;
}

function StudentTrainingLanding({ classes, loading }: { classes: SuniTrainingClass[]; loading: boolean }) {
  return (
    <div className="vdiscussion-page is-student">
      <div className="vdiscussion-student-hero">
        <div>
          <span>VTraining</span>
          <h1>Lớp học của tôi</h1>
          <p>Xem agenda, tài liệu, hoạt động được gán và kết quả học tập cá nhân.</p>
        </div>
      </div>
      {loading ? <div className="vdiscussion-empty">Đang tải lớp học của bạn...</div> : null}
      {!loading && !classes.length ? (
        <div className="vdiscussion-empty">
          <strong>Chưa có lớp được gán</strong>
          <span>Tài khoản của bạn chưa nằm trong danh sách học viên của lớp đào tạo nào.</span>
        </div>
      ) : null}
      {!loading && classes.length ? (
        <div className="vdiscussion-student-event-list">
          {classes.map((klass) => (
            <Link className="vdiscussion-student-event" to={`/vtraining/classes/${klass.id}`} target="_blank" rel="noopener noreferrer" key={klass.id}>
              <div className="vdiscussion-card-head">
                <ClassStatusPill status={klass.status} />
                <span>{formatDate(klass.startAt)}</span>
              </div>
              <h2>{klass.name || klass.code || 'Lớp đào tạo'}</h2>
              <p>{klass.course?.title || klass.description || 'Mở lớp để xem agenda, tài liệu và kết quả.'}</p>
              <div className="vdiscussion-student-session-grid">
                <span className="vdiscussion-student-session">
                  <strong>{klass.code || '-'}</strong>
                  <span>{klass.location || klass.deliveryMode || 'Chưa có địa điểm'}</span>
                  <em>Vào lớp học</em>
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CustomerTrainingLanding({ results, loading }: { results: SuniTrainingResult[]; loading: boolean }) {
  const passed = results.filter((result) => result.passed === true).length;
  const completed = results.filter((result) => result.finalScore != null).length;
  return (
    <div className="suni-native-page">
      <div className="vuni-dashboard-head">
        <div>
          <h1>Kết quả học tập đơn vị</h1>
          <p>Theo dõi kết quả học tập của các khóa đã được admin gán quyền xem.</p>
        </div>
      </div>
      <div className="vuni-stat-grid">
        <div className="vuni-stat is-blue"><small>Học viên</small><strong>{results.length}</strong></div>
        <div className="vuni-stat is-green"><small>Đã có điểm</small><strong>{completed}</strong></div>
        <div className="vuni-stat is-mint"><small>Đạt</small><strong>{passed}</strong></div>
      </div>
      <Card
        title="Toàn bộ kết quả học tập"
        action={(
          <div className="suni-native-row-actions">
            <Badge tone={loading ? 'warning' : results.length ? 'success' : 'neutral'}>{loading ? 'Đang tải' : `${results.length} dòng`}</Badge>
            <button type="button" className="btn btn-ghost btn-small" disabled={!results.length} onClick={() => void downloadCustomerResultsWorkbook(results)}>Excel</button>
          </div>
        )}
      >
        <div className="suni-native-table-wrap">
          <table className="data-table suni-native-table">
            <thead><tr><th>Học viên</th><th>Đơn vị</th><th>Khóa</th><th>Lớp</th><th>Điểm cuối (/10)</th><th>Kết quả</th></tr></thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.id}>
                  <td><strong>{result.studentName || result.studentProfileId}</strong><span>{result.studentEmail || result.studentCode || '-'}</span></td>
                  <td>{result.department || result.customerName || '-'}</td>
                  <td>{result.courseTitle || result.courseId || '-'}</td>
                  <td>{result.className || result.classId || '-'}</td>
                  <td>{result.finalScore ?? '-'}</td>
                  <td><span className={`vuni-pill ${result.passed ? 'is-green' : result.passed === false ? 'is-amber' : 'is-slate'}`}>{result.passed == null ? 'Chưa chốt' : result.passed ? 'Đạt' : 'Chưa đạt'}</span></td>
                </tr>
              ))}
              {!loading && !results.length ? <tr><td colSpan={6}>Chưa có kết quả học tập từ khóa được gán.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function SuniTrainingDashboardPage() {
  const { profile } = useAuth();
  const role = normalizeAppRole(profile?.role);
  const studentClassesQuery = useQuery({
    queryKey: queries.studentClasses(profile?.id || '', profile?.email || '', profile?.studentCode || ''),
    queryFn: () => suniTrainingApi.listStudentClasses({
      id: profile?.id,
      email: profile?.email,
      studentCode: profile?.studentCode,
      studentClass: profile?.studentClass,
      studentGroup: profile?.studentGroup,
    }),
    enabled: role === 'hoc_vien' && Boolean(profile?.id || profile?.email || profile?.studentCode),
  });
  const customerResultsQuery = useQuery({
    queryKey: queries.customerResults(profile?.id || ''),
    queryFn: () => suniTrainingApi.listCustomerTrainingResults({ profileId: profile?.id }),
    enabled: (role === 'client' || role === 'client_director') && Boolean(profile?.id),
  });
  const isManagementView = role !== 'hoc_vien' && role !== 'client' && role !== 'client_director';
  const programsQuery = useQuery({ queryKey: queries.programs(), queryFn: () => suniTrainingApi.listPrograms(), enabled: isManagementView });
  const coursesQuery = useQuery({ queryKey: queries.courses(), queryFn: () => suniTrainingApi.listCourses(), enabled: isManagementView });
  const classesQuery = useQuery({ queryKey: queries.classes(), queryFn: () => suniTrainingApi.listClasses(), enabled: isManagementView });

  const programs = programsQuery.data || [];
  const courses = coursesQuery.data || [];
  const classes = classesQuery.data || [];

  const stats = useMemo(() => {
    const activeCourses = courses.filter((course) => normalizeCourseStatus(course.status) === 'active').length;
    const activeClasses = classes.filter((klass) => normalizeClassStatus(klass.status) === 'active').length;
    return {
      programs: programs.length,
      courses: courses.length,
      activeCourses,
      activeClasses,
    };
  }, [classes, courses, programs]);

  const watchedCourses = useMemo(() => {
    return [...courses]
      .sort((a, b) => {
        const aStatus = normalizeCourseStatus(a.status) === 'active' ? 0 : 1;
        const bStatus = normalizeCourseStatus(b.status) === 'active' ? 0 : 1;
        return aStatus - bStatus || String(a.startAt || '').localeCompare(String(b.startAt || ''));
      })
      .slice(0, 4);
  }, [courses]);

  const upcomingClasses = useMemo(() => {
    return [...classes]
      .sort((a, b) => String(a.startAt || '9999').localeCompare(String(b.startAt || '9999')))
      .slice(0, 4);
  }, [classes]);

  const recentPrograms = useMemo(() => programs.slice(0, 4), [programs]);
  const loading = programsQuery.isLoading || coursesQuery.isLoading || classesQuery.isLoading;
  const hasError = Boolean(programsQuery.error || coursesQuery.error || classesQuery.error);

  if (role === 'hoc_vien') {
    return <StudentTrainingLanding classes={studentClassesQuery.data || []} loading={studentClassesQuery.isLoading} />;
  }
  if (role === 'client' || role === 'client_director') {
    return <CustomerTrainingLanding results={customerResultsQuery.data || []} loading={customerResultsQuery.isLoading} />;
  }

  return (
    <div className="vuni-dashboard">
      <div className="vuni-dashboard-head">
        <div>
          <h1>Tổng quan đào tạo</h1>
          <p>Bản production cấp độ để xem tình trạng hoạt động chương trình, khóa đào tạo, lớp học và tiến độ phối hợp vận hành.</p>
        </div>
        <div className="vuni-dashboard-actions">
          <Link className="vuni-btn is-secondary" to="/vtraining/programs">Chương trình đào tạo</Link>
          <Link className="vuni-btn is-primary" to="/vtraining/courses">Tạo khóa đào tạo</Link>
        </div>
      </div>

      {hasError ? <div className="vuni-notice is-danger">Không tải được dữ liệu VTraining. Kiểm tra migration Supabase và quyền truy cập.</div> : null}
      {loading ? <div className="vuni-notice">Đang tải dữ liệu đào tạo...</div> : null}

      <div className="vuni-stat-grid">
        <div className="vuni-stat is-blue"><small>Chương trình</small><strong>{stats.programs}</strong></div>
        <div className="vuni-stat is-violet"><small>Khóa đào tạo</small><strong>{stats.courses}</strong></div>
        <div className="vuni-stat is-green"><small>Lớp học</small><strong>{stats.activeClasses}</strong></div>
        <div className="vuni-stat is-mint"><small>Khóa đã mở</small><strong>{stats.activeCourses}</strong></div>
      </div>

      <div className="vuni-dashboard-grid">
        <section className="vuni-panel is-wide">
          <div className="vuni-panel-head">
            <h2>Khóa đào tạo đang theo dõi</h2>
          </div>
          <div className="vuni-course-list">
            {watchedCourses.length === 0 ? <div className="vuni-empty">Chưa có khóa đào tạo.</div> : null}
            {watchedCourses.map((course) => {
              const progress = courseProgress(course, classes);
              return (
                <Link className="vuni-course-row" to="/vtraining/courses" key={course.id}>
                  <div>
                    <strong>{course.title || course.code || 'Khóa đào tạo'}</strong>
                    <span>{course.courseProgram?.name || course.customerName || 'Khóa độc lập'} · {course.expectedDuration || course.format || 'Chưa cấu hình'}</span>
                  </div>
                  <div className="vuni-row-meta">
                    <TrainingStatusPill status={course.status} />
                    <span>{progress}%</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="vuni-panel">
          <div className="vuni-panel-head">
            <h2>Lớp học sắp mở</h2>
          </div>
          <div className="vuni-program-stack">
            {upcomingClasses.length === 0 ? <div className="vuni-empty">Chưa có lớp học.</div> : null}
            {upcomingClasses.map((klass) => (
              <Link className="vuni-program-card" to="/vtraining/classes" key={klass.id}>
                <div>
                  <strong>{klass.name || klass.code || 'Lớp đào tạo'}</strong>
                  <span>{formatDate(klass.startAt)} · {klass.location || klass.deliveryMode || 'Chưa có địa điểm'}</span>
                </div>
                <ClassStatusPill status={klass.status} />
              </Link>
            ))}
          </div>
        </section>

        <section className="vuni-panel is-wide">
          <div className="vuni-panel-head">
            <h2>Chương trình gần đây</h2>
          </div>
          <div className="vuni-program-stack">
            {recentPrograms.length === 0 ? <div className="vuni-empty">Chưa có chương trình đào tạo.</div> : null}
            {recentPrograms.map((program) => (
              <Link className="vuni-program-card" to="/vtraining/programs" key={program.id}>
                <div>
                  <strong>{program.name || program.code || 'Chương trình đào tạo'}</strong>
                  <span>{program.customerName || 'Chưa gắn khách hàng'} · {program.executionYear || 'Chưa có năm'}</span>
                </div>
                <span className="vuni-pill is-green">{program.status === 'completed' ? 'Hoàn thành' : 'Đang theo dõi'}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
