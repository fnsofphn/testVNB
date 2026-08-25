import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Kpi, SectionHeader } from '@/components/ui/Primitives';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildElearningClassExportCsv,
  createElearningClass,
  createElearningClient,
  createElearningProject,
  getElearningClassReport,
  importElearningStudentsToClass,
  listElearningCourses,
  listElearningDeploymentBundle,
  parseElearningStudentImport,
  type ElearningClassReportRow,
  type ElearningCourse,
  type ElearningDeploymentBundle,
  type ElearningImportPreviewRow,
} from '@/lib/elearning';

export function VTrainingPage() {
  const { profile, session } = useAuth();
  const [courses, setCourses] = useState<ElearningCourse[]>([]);
  const [deployment, setDeployment] = useState<ElearningDeploymentBundle>({ clients: [], projects: [], classes: [], students: [], classStudents: [], enrollments: [], learnerGroups: [], runTargets: [] });
  const [activeClientId, setActiveClientId] = useState('');
  const [activeProjectId, setActiveProjectId] = useState('');
  const [activeClassId, setActiveClassId] = useState('');
  const [activeCourseId, setActiveCourseId] = useState('');
  const [clientName, setClientName] = useState('Khách hàng mới');
  const [clientCode, setClientCode] = useState('');
  const [projectName, setProjectName] = useState('Dự án đào tạo mới');
  const [projectCode, setProjectCode] = useState('');
  const [className, setClassName] = useState('Lớp triển khai mới');
  const [classCode, setClassCode] = useState('');
  const [classStartAt, setClassStartAt] = useState('');
  const [classEndAt, setClassEndAt] = useState('');
  const [importRows, setImportRows] = useState<ElearningImportPreviewRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [classReportRows, setClassReportRows] = useState<ElearningClassReportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const activeClient = deployment.clients.find((client) => client.id === activeClientId) || deployment.clients[0] || null;
  const activeProject = deployment.projects.find((project) => project.id === activeProjectId) || deployment.projects.find((project) => project.clientId === activeClient?.id) || null;
  const activeClass = deployment.classes.find((item) => item.id === activeClassId) || deployment.classes.find((item) => item.projectId === activeProject?.id) || null;
  const activeCourse = courses.find((course) => course.id === activeCourseId) || courses[0] || null;
  const activeClassEnrollments = activeClass ? deployment.enrollments.filter((item) => item.classId === activeClass.id) : [];

  const filteredProjects = useMemo(
    () => deployment.projects.filter((project) => !activeClientId || project.clientId === activeClientId),
    [activeClientId, deployment.projects],
  );
  const filteredClasses = useMemo(
    () => deployment.classes.filter((item) => !activeProjectId || item.projectId === activeProjectId),
    [activeProjectId, deployment.classes],
  );

  async function loadData(preferredClassId?: string) {
    setBusy(true);
    setErrorMessage('');
    try {
      const [nextCourses, nextDeployment] = await Promise.all([listElearningCourses(), listElearningDeploymentBundle()]);
      const nextClientId = activeClientId || nextDeployment.clients[0]?.id || '';
      const nextProjectId = activeProjectId || nextDeployment.projects.find((project) => project.clientId === nextClientId)?.id || nextDeployment.projects[0]?.id || '';
      const nextClassId = preferredClassId || activeClassId || nextDeployment.classes.find((item) => item.projectId === nextProjectId)?.id || nextDeployment.classes[0]?.id || '';
      const nextCourseId = activeCourseId || nextCourses[0]?.id || '';
      setCourses(nextCourses);
      setDeployment(nextDeployment);
      setActiveClientId(nextClientId);
      setActiveProjectId(nextProjectId);
      setActiveClassId(nextClassId);
      setActiveCourseId(nextCourseId);
      setClassReportRows(nextClassId ? await getElearningClassReport(nextClassId) : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tải được dữ liệu vtraining.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!activeClassId) {
      setClassReportRows([]);
      return;
    }
    getElearningClassReport(activeClassId).then(setClassReportRows).catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Không tải được báo cáo lớp.'));
  }, [activeClassId]);

  async function handleCreateClient() {
    if (!clientName.trim()) {
      setErrorMessage('Cần nhập tên khách hàng.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const client = await createElearningClient({ name: clientName, code: clientCode });
      setClientName('Khách hàng mới');
      setClientCode('');
      setActiveClientId(client.id);
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được khách hàng.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateProject() {
    const clientId = activeClient?.id || activeClientId;
    if (!clientId || !projectName.trim()) {
      setErrorMessage('Cần chọn khách hàng và nhập tên dự án.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const project = await createElearningProject({ clientId, name: projectName, code: projectCode });
      setProjectName('Dự án đào tạo mới');
      setProjectCode('');
      setActiveProjectId(project.id);
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được dự án đào tạo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateClass() {
    const projectId = activeProject?.id || activeProjectId;
    const courseId = activeCourse?.id || activeCourseId;
    if (!projectId || !courseId || !className.trim()) {
      setErrorMessage('Cần chọn dự án, khóa học và nhập tên lớp.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const nextClass = await createElearningClass({
        projectId,
        courseId,
        name: className,
        code: classCode,
        startAt: classStartAt,
        endAt: classEndAt,
        completionThreshold: activeCourse?.completionThreshold || 90,
        finalQuizFormId: activeCourse?.finalQuizFormId || '',
      });
      setClassName('Lớp triển khai mới');
      setClassCode('');
      setClassStartAt('');
      setClassEndAt('');
      setActiveClassId(nextClass.id);
      await loadData(nextClass.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không tạo được lớp triển khai.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePreviewStudentImport(file: File | null) {
    if (!file) return;
    setImportFileName(file.name);
    const text = await file.text();
    setImportRows(parseElearningStudentImport(text, deployment.students.filter((student) => student.clientId === activeClient?.id)));
  }

  async function handleImportStudents() {
    if (!activeClient || !activeClass) {
      setErrorMessage('Cần chọn khách hàng và lớp trước khi import học viên.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      await importElearningStudentsToClass({
        clientId: activeClient.id,
        classId: activeClass.id,
        courseId: activeClass.courseId,
        fileName: importFileName,
        importedBy: profile?.id || session?.user?.id || null,
        rows: importRows,
      });
      setImportRows([]);
      setImportFileName('');
      await loadData(activeClass.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không import được học viên.');
    } finally {
      setBusy(false);
    }
  }

  function handleExportClassReport() {
    const csv = `\uFEFF${buildElearningClassExportCsv(classReportRows)}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeClass?.code || 'bao-cao-lop'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <SectionHeader
        eye="VTraining"
        title="Quản lý triển khai đào tạo"
        subtitle="Tách riêng khách hàng, dự án, lớp học và học viên khỏi thư viện VLearning."
        actions={<Link className="btn btn-ghost" to="/vlearning">Mở VLearning</Link>}
      />

      <section className="elearning-shell">
        <div className="kpi-row">
          <Kpi label="Khách hàng" value={String(deployment.clients.length)} sub="Đơn vị triển khai" tone="neutral" />
          <Kpi label="Dự án" value={String(deployment.projects.length)} sub="Chương trình đào tạo" tone="violet" />
          <Kpi label="Lớp học" value={String(deployment.classes.length)} sub="Đợt triển khai" tone="warning" />
          <Kpi label="Học viên" value={String(deployment.students.length)} sub="Hồ sơ đã import" tone="success" />
        </div>

        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

        <div className="elearning-layout">
          <aside className="elearning-side">
            <Card title="Khách hàng">
              <div className="form-grid single">
                <label>
                  <span>Khách hàng</span>
                  <select value={activeClientId} onChange={(event) => setActiveClientId(event.target.value)}>
                    <option value="">Chọn khách hàng</option>
                    {deployment.clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}
                  </select>
                </label>
                <label><span>Tên khách hàng</span><input value={clientName} onChange={(event) => setClientName(event.target.value)} /></label>
                <label><span>Mã khách hàng</span><input value={clientCode} onChange={(event) => setClientCode(event.target.value)} placeholder="VD: PO" /></label>
                <button className="btn btn-primary" disabled={busy} onClick={() => void handleCreateClient()}>Tạo khách hàng</button>
              </div>
            </Card>

            <Card title="Dự án đào tạo">
              <div className="form-grid single">
                <label>
                  <span>Dự án</span>
                  <select value={activeProjectId} onChange={(event) => setActiveProjectId(event.target.value)}>
                    <option value="">Chọn dự án</option>
                    {filteredProjects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
                  </select>
                </label>
                <label><span>Tên dự án</span><input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label>
                <label><span>Mã dự án</span><input value={projectCode} onChange={(event) => setProjectCode(event.target.value)} placeholder="VD: ONB-2026" /></label>
                <button className="btn btn-primary" disabled={busy || !activeClient} onClick={() => void handleCreateProject()}>Tạo dự án</button>
              </div>
            </Card>
          </aside>

          <main className="elearning-main">
            <Card title="Lớp học và học viên" action={<button className="btn btn-ghost btn-small" disabled={!classReportRows.length} onClick={handleExportClassReport}>Xuất báo cáo lớp</button>}>
              <div className="form-grid">
                <label>
                  <span>Lớp triển khai</span>
                  <select value={activeClassId} onChange={(event) => setActiveClassId(event.target.value)}>
                    <option value="">Chọn lớp</option>
                    {filteredClasses.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label><span>Tên lớp</span><input value={className} onChange={(event) => setClassName(event.target.value)} /></label>
                <label><span>Mã lớp</span><input value={classCode} onChange={(event) => setClassCode(event.target.value)} placeholder="VD: PO-ONB-2026-05" /></label>
                <label>
                  <span>Khóa học áp dụng</span>
                  <select value={activeCourseId} onChange={(event) => setActiveCourseId(event.target.value)}>
                    {courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}
                  </select>
                </label>
                <label><span>Thời gian mở lớp</span><input type="datetime-local" value={classStartAt} onChange={(event) => setClassStartAt(event.target.value)} /></label>
                <label><span>Thời gian đóng lớp</span><input type="datetime-local" value={classEndAt} onChange={(event) => setClassEndAt(event.target.value)} /></label>
                <label><span>File học viên CSV</span><input type="file" accept=".csv,text/csv" onChange={(event) => void handlePreviewStudentImport(event.target.files?.[0] || null)} /></label>
              </div>

              <div className="action-row">
                <button className="btn btn-primary" disabled={busy || !activeProject || !activeCourse} onClick={() => void handleCreateClass()}>Tạo lớp triển khai</button>
                <button className="btn btn-ghost" disabled={busy || !activeClass || !importRows.length || importRows.every((row) => row.action === 'error')} onClick={() => void handleImportStudents()}>
                  Import học viên hợp lệ
                </button>
              </div>

              <div className="elearning-course-head">
                <div>
                  <strong>{activeClass?.name || 'Chưa chọn lớp triển khai'}</strong>
                  <p>{activeClient?.name || 'Chưa có khách hàng'} · {activeProject?.name || 'Chưa có dự án'} · {activeClassEnrollments.length} học viên</p>
                </div>
                <Badge tone={activeClass?.status === 'open' ? 'success' : activeClass?.status === 'closed' ? 'neutral' : 'warning'}>{activeClass?.status || 'draft'}</Badge>
              </div>

              {importRows.length ? (
                <div className="elearning-lesson-table">
                  {importRows.slice(0, 8).map((row) => (
                    <div className="elearning-lesson-row" key={row.rowNumber}>
                      <div>
                        <strong>Dòng {row.rowNumber}: {row.fullName || 'Chưa có họ tên'}</strong>
                        <span>{row.email || 'Thiếu email'} · {row.department || 'Chưa có phòng ban'} · {row.errors.join(', ') || (row.action === 'update' ? 'Cập nhật hồ sơ đã có' : 'Tạo học viên mới')}</span>
                      </div>
                      <Badge tone={row.action === 'error' ? 'danger' : row.action === 'update' ? 'warning' : 'success'}>{row.action === 'error' ? 'Lỗi' : row.action === 'update' ? 'Cập nhật' : 'Tạo mới'}</Badge>
                    </div>
                  ))}
                  {importRows.length > 8 ? <div className="muted-text">Còn {importRows.length - 8} dòng khác trong file import.</div> : null}
                </div>
              ) : (
                <div className="muted-text">Mẫu CSV: employee_code, full_name, email, password, phone, department, position, unit.</div>
              )}

              <div className="elearning-lesson-table">
                {classReportRows.slice(0, 10).map((row) => (
                  <div className="elearning-lesson-row" key={row.enrollment.id}>
                    <div>
                      <strong>{row.student.fullName}</strong>
                      <span>{row.student.email} · {row.student.department || 'Chưa có phòng ban'} · tiến độ {row.result.progressPercent}%</span>
                    </div>
                    <Badge tone={row.result.finalStatus === 'passed' || row.result.finalStatus === 'completed' ? 'success' : row.result.finalStatus === 'failed' ? 'danger' : 'warning'}>{row.result.finalStatus}</Badge>
                  </div>
                ))}
                {!classReportRows.length ? <div className="muted-text">Chưa có học viên trong lớp đang chọn.</div> : null}
              </div>
            </Card>
          </main>
        </div>
      </section>
    </>
  );
}
