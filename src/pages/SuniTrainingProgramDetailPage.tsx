import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { suniTrainingApi } from '@/lib/suni';
import { queries } from '@/features/vtraining';

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function statusTone(status?: string | null): 'danger' | 'warning' | 'success' | 'violet' | 'neutral' {
  const normalized = String(status || '').toLowerCase();
  if (['active', 'published', 'open', 'in_progress', 'ongoing', 'running'].includes(normalized)) return 'success';
  if (['completed', 'closed'].includes(normalized)) return 'violet';
  if (['archived'].includes(normalized)) return 'neutral';
  return 'warning';
}

function statusLabel(status?: string | null) {
  const normalized = String(status || '').toLowerCase();
  if (['active', 'published', 'open', 'in_progress', 'ongoing', 'running'].includes(normalized)) return 'Đang triển khai';
  if (['completed', 'closed'].includes(normalized)) return 'Hoàn thành';
  if (normalized === 'archived') return 'Lưu trữ';
  return 'Chưa bắt đầu';
}

export function SuniTrainingProgramDetailPage() {
  const { programId } = useParams();
  const navigate = useNavigate();
  if (!programId) return <Navigate to="/vtraining/programs" replace />;

  const programQuery = useQuery({ queryKey: queries.program(programId), queryFn: () => suniTrainingApi.getProgram(programId) });
  const coursesQuery = useQuery({ queryKey: queries.programCourses(programId), queryFn: () => suniTrainingApi.listProgramCourses(programId) });

  const program = programQuery.data || null;
  const courses = coursesQuery.data || [];
  const loading = programQuery.isLoading || coursesQuery.isLoading;
  const error = programQuery.error || coursesQuery.error;

  if (loading) return <div className="vdiscussion-empty">Đang tải chương trình đào tạo...</div>;
  if (!program) return <div className="vdiscussion-empty">Không tìm thấy chương trình đào tạo.</div>;

  return (
    <div className="suni-native-page">
      <SectionHeader
        eye="VTraining"
        title={program.name || program.code || 'Chương trình đào tạo'}
        actions={<Link className="btn btn-ghost" to="/vtraining/programs"><ArrowLeft size={15} /> Quay lại danh sách chương trình</Link>}
      />

      {error ? <div className="notice danger">{error instanceof Error ? error.message : 'Không tải được dữ liệu chương trình.'}</div> : null}

      <Card title="Tổng quan chương trình">
        <div className="vtraining-detail-grid">
          <div><span>Mã chương trình</span><strong>{program.code || '-'}</strong></div>
          <div><span>Tên chương trình</span><strong>{program.name || '-'}</strong></div>
          <div><span>Khách hàng / đơn vị</span><strong>{program.customerName || '-'}</strong></div>
          <div><span>Năm</span><strong>{program.executionYear || '-'}</strong></div>
          <div><span>Đối tượng</span><strong>{program.learnerGroup || '-'}</strong></div>
          <div><span>Trạng thái</span><strong><Badge tone={statusTone(program.status)}>{statusLabel(program.status)}</Badge></strong></div>
          <div className="full"><span>Mô tả</span><strong>{program.description || 'Chưa có mô tả.'}</strong></div>
        </div>
      </Card>

      <Card title="Khóa trong chương trình" action={<Badge tone={courses.length ? 'success' : 'warning'}>{courses.length} khóa</Badge>}>
        <div className="suni-native-table-wrap">
          <table className="data-table suni-native-table">
            <thead><tr><th>Mã</th><th>Khóa</th><th>Lịch</th><th>Hình thức</th><th>Lớp KH/TT</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {courses.map((course) => (
                <tr
                  key={course.id}
                  className="suni-native-click-row"
                  tabIndex={0}
                  onClick={() => navigate(`/vtraining/courses/${course.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/vtraining/courses/${course.id}`);
                    }
                  }}
                >
                  <td><code>{course.code || '-'}</code></td>
                  <td><strong>{course.title || course.name || '-'}</strong><span>{course.description || course.objective || '-'}</span></td>
                  <td>{formatDate(course.startAt)} - {formatDate(course.endAt)}</td>
                  <td>{course.format || '-'}</td>
                  <td>{course.plannedClassCount || 0} / {Array.isArray(course.klasses) ? course.klasses.length : 0}</td>
                  <td><Badge tone={statusTone(course.status)}>{statusLabel(course.status)}</Badge></td>
                </tr>
              ))}
              {!courses.length ? <tr><td colSpan={6}>Chưa có khóa nào trong chương trình này.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
