import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCopy, Download, ExternalLink, LifeBuoy, Mail, UserCheck } from 'lucide-react';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildHelpdeskPublicLink,
  exportHelpdeskTicketsToWorkbook,
  getHelpdeskAttachmentUrl,
  listHelpdeskProjects,
  listHelpdeskTickets,
  saveHelpdeskProject,
  sanitizeHelpdeskSlug,
  updateHelpdeskTickets,
  type HelpdeskProjectStatus,
  type HelpdeskStatus,
} from '@/lib/helpdesk';
import { suniTrainingApi } from '@/lib/suni';
import { queries as sharedQueries } from '@/features/shared';
import { queries as trainingQueries } from '@/features/vtraining';

const statusLabels: Record<HelpdeskStatus, string> = {
  received: 'Tiếp nhận',
  processing: 'Đang xử lý',
  completed: 'Hoàn thành',
};

const statusTone = {
  received: 'warning',
  processing: 'violet',
  completed: 'success',
} as const;

const projectStatusLabels: Record<HelpdeskProjectStatus, string> = {
  draft: 'Bản nháp',
  active: 'Đang hoạt động',
  paused: 'Tạm dừng',
  closed: 'Đã đóng',
};

function isCustomerRole(role?: string | null) {
  return role === 'client' || role === 'client_director';
}

export default function VHelpdeskPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<HelpdeskStatus>('processing');
  const [bulkAssigneeId, setBulkAssigneeId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectProgramId, setProjectProgramId] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [projectViewers, setProjectViewers] = useState<string[]>([]);
  const customerView = isCustomerRole(profile?.role);

  const projectsQuery = useQuery({ queryKey: ['vhelpdesk', 'projects'], queryFn: listHelpdeskProjects });
  const ticketsQuery = useQuery({
    queryKey: ['vhelpdesk', 'tickets', selectedProjectId, statusFilter, assigneeFilter],
    queryFn: () => listHelpdeskTickets({ projectId: selectedProjectId, status: statusFilter, assigneeProfileId: assigneeFilter }),
  });
  const programsQuery = useQuery({ queryKey: trainingQueries.programsForHelpdesk(), queryFn: () => suniTrainingApi.listPrograms(), enabled: !customerView });
  const usersQuery = useQuery({ queryKey: sharedQueries.usersForHelpdesk(), queryFn: () => suniTrainingApi.listUsers(), enabled: !customerView });

  const projects = projectsQuery.data || [];
  const tickets = ticketsQuery.data || [];
  const programs = programsQuery.data || [];
  const users = usersQuery.data || [];
  const assignees = users.filter((user) => user.email);
  const customerUsers = users.filter((user) => user.role === 'client' || user.role === 'client_director');
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || null;

  const visibleTickets = useMemo(() => tickets, [tickets]);
  const receivedCount = visibleTickets.filter((ticket) => ticket.status === 'received').length;
  const processingCount = visibleTickets.filter((ticket) => ticket.status === 'processing').length;
  const completedCount = visibleTickets.filter((ticket) => ticket.status === 'completed').length;

  const saveProjectMutation = useMutation({
    mutationFn: () => saveHelpdeskProject({
      name: projectName,
      slug: projectSlug || projectName,
      vtrainingProgramId: projectProgramId || null,
      status: 'active',
      customerViewerProfileIds: projectViewers,
      createdByProfileId: profile?.id || null,
    }),
    onSuccess: (project) => {
      setSelectedProjectId(project.id);
      setProjectName('');
      setProjectProgramId('');
      setProjectSlug('');
      setProjectViewers([]);
      void queryClient.invalidateQueries({ queryKey: ['vhelpdesk'] });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: () => updateHelpdeskTickets(selectedIds, { status: bulkStatus, assigneeProfileId: bulkAssigneeId || undefined }),
    onSuccess: () => {
      setSelectedIds([]);
      void queryClient.invalidateQueries({ queryKey: ['vhelpdesk', 'tickets'] });
    },
  });

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const copyPublicLink = async (slug: string) => {
    await navigator.clipboard?.writeText(buildHelpdeskPublicLink(slug));
  };

  const openAttachment = async (ticketId: string, attachmentIndex: number) => {
    const ticket = tickets.find((item) => item.id === ticketId);
    const attachment = ticket?.attachments[attachmentIndex];
    if (!attachment) return;
    const url = await getHelpdeskAttachmentUrl(attachment);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <SectionHeader
        eye="Vinabrain"
        title="V-helpdesk"
        subtitle="Kênh hỗ trợ học viên trong hệ sinh thái Vinabrain: khảo sát, e-learning và học trực tiếp."
      />

      <div className="vhelpdesk-layout">
        <aside className="vhelpdesk-sidebar" aria-label="Điều hướng V-helpdesk">
          <button className="is-active" type="button"><LifeBuoy size={18} /> Tổng quan hỗ trợ</button>
          <button type="button"><UserCheck size={18} /> Project theo chương trình</button>
          <button type="button"><Mail size={18} /> Link public học viên</button>
          <button type="button"><CheckCircle2 size={18} /> Kết quả xử lý</button>
        </aside>

        <main className="vhelpdesk-main">
          <div className="kpi-row">
            <div className="kpi tone-violet"><div className="kpi-label">Project hỗ trợ</div><div className="kpi-value">{projects.length}</div><div className="kpi-sub">Liên kết V-training</div></div>
            <div className="kpi tone-warning"><div className="kpi-label">Tiếp nhận</div><div className="kpi-value">{receivedCount}</div><div className="kpi-sub">Cần phân công</div></div>
            <div className="kpi tone-violet"><div className="kpi-label">Đang xử lý</div><div className="kpi-value">{processingCount}</div><div className="kpi-sub">Đang phụ trách</div></div>
            <div className="kpi tone-success"><div className="kpi-label">Hoàn thành</div><div className="kpi-value">{completedCount}</div><div className="kpi-sub">Đã đóng</div></div>
          </div>

          {!customerView ? (
            <Card
              title="Tạo project hỗ trợ"
              action={<Link className="btn btn-ghost btn-small" to="/vtraining/programs"><ExternalLink size={16} /> V-training</Link>}
            >
              <div className="vhelpdesk-create-grid">
                <label><span>Chương trình</span><select value={projectProgramId} onChange={(event) => {
                  const programId = event.target.value;
                  const program = programs.find((item) => item.id === programId);
                  setProjectProgramId(programId);
                  if (program && !projectName) {
                    setProjectName(`Hỗ trợ - ${program.name || program.code || ''}`.trim());
                    setProjectSlug(sanitizeHelpdeskSlug(program.code || program.name || ''));
                  }
                }}><option value="">Không gán chương trình</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.name || program.code}</option>)}</select></label>
                <label><span>Tên project</span><input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Hỗ trợ chương trình..." /></label>
                <label><span>Slug public</span><input value={projectSlug} onChange={(event) => setProjectSlug(sanitizeHelpdeskSlug(event.target.value))} placeholder="vnpt-heart-support" /></label>
                <label><span>Khách hàng theo dõi</span><select multiple value={projectViewers} onChange={(event) => setProjectViewers(Array.from(event.target.selectedOptions).map((option) => option.value))}>{customerUsers.map((user) => <option key={user.id} value={user.id}>{user.fullName || user.email}</option>)}</select></label>
                <button className="btn btn-primary" type="button" disabled={!projectName.trim() || saveProjectMutation.isPending} onClick={() => saveProjectMutation.mutate()}>Tạo project</button>
              </div>
            </Card>
          ) : null}

          <Card title={customerView ? 'Theo dõi hỗ trợ' : 'Project hỗ trợ'}>
            <div className="vhelpdesk-project-list">
              {projects.map((project) => (
                <article className={project.id === selectedProjectId ? 'is-active' : ''} key={project.id} role="button" tabIndex={0} onClick={() => setSelectedProjectId(project.id)} onKeyDown={(event) => { if (event.key === 'Enter') setSelectedProjectId(project.id); }}>
                  <strong>{project.name}</strong>
                  <span>{project.programName || 'Không gán chương trình'} · {projectStatusLabels[project.status] || project.status}</span>
                  <small>{buildHelpdeskPublicLink(project.slug)}</small>
                  {!customerView ? <span className="vhelpdesk-card-actions" onClick={(event) => event.stopPropagation()}><button className="btn btn-ghost btn-small" type="button" onClick={() => void copyPublicLink(project.slug)}><ClipboardCopy size={15} /> Sao chép link</button></span> : null}
                </article>
              ))}
              {!projects.length ? <div className="muted-text">Chưa có project hỗ trợ.</div> : null}
            </div>
          </Card>

          <Card
            title="Danh sách yêu cầu hỗ trợ"
            action={<button className="btn btn-ghost btn-small" type="button" onClick={() => exportHelpdeskTicketsToWorkbook(visibleTickets, projects)}><Download size={16} /> Xuất Excel</button>}
          >
            <div className="vhelpdesk-filters">
              <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}><option value="">Tất cả project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              {!customerView ? <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="">Tất cả phụ trách</option>{assignees.map((user) => <option key={user.id} value={user.id}>{user.fullName || user.email}</option>)}</select> : null}
            </div>

            {!customerView ? (
              <div className="vhelpdesk-bulkbar">
                <span>{selectedIds.length} đã chọn</span>
                <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as HelpdeskStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <select value={bulkAssigneeId} onChange={(event) => setBulkAssigneeId(event.target.value)}><option value="">Giữ/chưa gán phụ trách</option>{assignees.map((user) => <option key={user.id} value={user.id}>{user.fullName || user.email}</option>)}</select>
                <button className="btn btn-primary btn-small" type="button" disabled={!selectedIds.length || bulkMutation.isPending} onClick={() => bulkMutation.mutate()}>Cập nhật</button>
              </div>
            ) : null}

            <div className="table-wrap">
              <table className="data-table vhelpdesk-table">
                <thead>
                  <tr>
                    {!customerView ? <th>Chọn</th> : null}
                    <th>Mã yêu cầu</th>
                    <th>Học viên</th>
                    <th>Email</th>
                    <th>Điện thoại</th>
                    <th>Vấn đề gặp phải</th>
                    <th>Ảnh</th>
                    <th>Tình trạng</th>
                    <th>Người phụ trách</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTickets.map((ticket) => (
                    <tr key={ticket.id}>
                      {!customerView ? <td><input checked={selectedIds.includes(ticket.id)} type="checkbox" onChange={() => toggleSelected(ticket.id)} /></td> : null}
                      <td>{ticket.ticketCode}</td>
                      <td>{ticket.learnerName}</td>
                      <td>{ticket.learnerEmail}</td>
                      <td>{ticket.learnerPhone || '-'}</td>
                      <td>{ticket.issueText}</td>
                      <td>{ticket.attachments.length ? ticket.attachments.map((attachment, index) => <button className="btn btn-ghost btn-small" key={attachment.id} type="button" onClick={() => void openAttachment(ticket.id, index)}>Ảnh {index + 1}</button>) : '-'}</td>
                      <td><Badge tone={statusTone[ticket.status]}>{statusLabels[ticket.status]}</Badge></td>
                      <td>{ticket.assigneeName || ticket.assigneeEmail || 'Chưa gán'}</td>
                    </tr>
                  ))}
                  {!visibleTickets.length ? <tr><td colSpan={customerView ? 8 : 9}>Chưa có yêu cầu hỗ trợ.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </Card>

          {selectedProject ? (
            <Card title="Link public đang chọn">
              <div className="vhelpdesk-public-link">
                <code>{buildHelpdeskPublicLink(selectedProject.slug)}</code>
                <button className="btn btn-primary btn-small" type="button" onClick={() => void copyPublicLink(selectedProject.slug)}><ClipboardCopy size={15} /> Sao chép</button>
              </div>
            </Card>
          ) : null}
        </main>
      </div>
    </>
  );
}
