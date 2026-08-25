import { useEffect, useRef, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bell, Check, CheckCheck, Edit3, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { listNotifications, markAllNotificationsRead, markNotificationRead, type NotificationRow } from '@/services/vcontent';
import {
  VSUITE_ROLE_META,
  VSUITE_TABS,
  buildVsuiteClassCompletion,
  canEditVsuiteTab,
  isVsuiteRole,
  type VsuiteTabKey,
} from '../domain/contract';
import {
  advanceVsuiteOperationPlan,
  advanceVsuitePaymentRequest,
  createVsuiteOperationPlan,
  createVsuitePaymentDocument,
  createVsuitePaymentRequest,
  fetchVsuiteDashboard,
  uploadVsuitePaymentDocumentFile,
  updateVsuiteChecklistItem,
  updateVsuiteReminder,
  type VsuiteChecklistItem,
  type VsuiteClass,
  type VsuiteContract,
  type VsuiteExpense,
  type VsuiteOperationPlan,
  type VsuitePaymentDocument,
  type VsuitePaymentRequest,
  type VsuiteProgram,
  type VsuiteReminder,
} from '../services/api';
import {
  canCurrentProfileActOnPaymentRequest,
  canApproveVsuitePlan,
  getNextPaymentStatus,
  getPaymentActionLabel,
  isAccountingPaymentProfile,
  isDirectorPaymentProfile,
  type VsuitePaymentActorProfile,
  type VsuitePaymentAction,
  type VsuitePaymentStatus,
  type VsuitePlanAction,
} from '../domain/paymentWorkflow';

type PeopleOnePage = 'dashboard' | 'classes' | 'class' | 'contracts' | 'expenses' | 'payments' | 'plans' | 'audit';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  signed: 'Đã ký',
  running: 'Đang chạy',
  accepting: 'Đang nghiệm thu',
  completed: 'Hoàn tất',
  planning: 'Đang lập kế hoạch',
  paused: 'Tạm dừng',
  not_started: 'Chưa khởi động',
  preparing: 'Đang chuẩn bị',
  missing_conditions: 'Thiếu điều kiện',
  ready: 'Sẵn sàng',
  finalizing_docs: 'Hoàn tất hồ sơ',
  pending: 'Chưa xong',
  done: 'Đã xong',
  na: 'Không áp dụng',
  open: 'Đang mở',
  approved: 'Đã duyệt',
  submitted: 'Đã gửi',
  accountant_review: 'Kế toán đã kiểm tra',
  manager_approved: 'Kế toán đã duyệt · Chờ Giám đốc',
  director_approved: 'Giám đốc đã duyệt',
  paid: 'Đã thanh toán',
  returned: 'Trả lại bổ sung',
  rejected: 'Từ chối',
  red: 'Đỏ',
  amber: 'Vàng',
  none: 'OK',
};

const ALERT_CLASS: Record<string, string> = {
  red: 'b-red',
  amber: 'b-amber',
  none: 'b-green',
};

function getLabel(value: string | null | undefined) {
  const key = String(value || '').trim();
  return STATUS_LABELS[key] || key || '-';
}

function formatMoney(value: number | null | undefined) {
  return `${Number(value || 0).toLocaleString('vi-VN')} đ`;
}

function isOverdue(date: string | null | undefined) {
  if (!date) return false;
  return date < new Date().toISOString().slice(0, 10);
}

function Badge({ tone = 'gray', children }: { tone?: 'red' | 'amber' | 'green' | 'gray'; children: React.ReactNode }) {
  return <span className={`vsuite-po-badge b-${tone}`}>{children}</span>;
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <>
      <div className="vsuite-po-progress"><span style={{ width: `${pct}%` }} /></div>
      <span className="vsuite-po-muted">{done}/{total} ({pct}%)</span>
    </>
  );
}

function classCompletion(items: VsuiteChecklistItem[], classId: string) {
  return buildVsuiteClassCompletion(items.filter((item) => item.class_id === classId));
}

function tabCompletion(items: VsuiteChecklistItem[], tab: VsuiteTabKey) {
  return buildVsuiteClassCompletion(items.filter((item) => item.tab === tab));
}

function findProgram(programs: VsuiteProgram[], id: string | null) {
  return programs.find((program) => program.id === id) || null;
}

function findContract(contracts: VsuiteContract[], id: string | null) {
  return contracts.find((contract) => contract.id === id) || null;
}

export default function VSuitePage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['vsuite-dashboard'], queryFn: fetchVsuiteDashboard });
  const role = useRoleLabel();
  const [page, setPage] = useState<PeopleOnePage>('dashboard');
  const [classId, setClassId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<VsuiteTabKey>('course_info');
  const [queryText, setQueryText] = useState('');

  const classes = data?.classes || [];
  const contracts = data?.contracts || [];
  const programs = data?.programs || [];
  const checklistItems = data?.checklistItems || [];
  const reminders = data?.reminders || [];
  const expenses = data?.expenses || [];
  const paymentRequests = data?.paymentRequests || [];
  const paymentDocuments = data?.paymentDocuments || [];
  const approvalEvents = data?.approvalEvents || [];
  const operationPlans = data?.operationPlans || [];
  const selectedClass = classes.find((item) => item.id === classId) || classes[0] || null;

  useEffect(() => {
    if (!classId && classes[0]?.id) setClassId(classes[0].id);
  }, [classId, classes]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['vsuite-dashboard'] });
  };

  const checklistMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<VsuiteChecklistItem> }) => updateVsuiteChecklistItem(id, patch),
    onSuccess: invalidate,
  });
  const reminderMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateVsuiteReminder(id, status),
    onSuccess: invalidate,
  });
  const createPaymentMutation = useMutation({
    mutationFn: createVsuitePaymentRequest,
    onSuccess: invalidate,
  });
  const createDocumentMutation = useMutation({
    mutationFn: createVsuitePaymentDocument,
    onSuccess: invalidate,
  });
  const advancePaymentMutation = useMutation({
    mutationFn: advanceVsuitePaymentRequest,
    onSuccess: invalidate,
  });
  const createPlanMutation = useMutation({
    mutationFn: createVsuiteOperationPlan,
    onSuccess: invalidate,
  });
  const advancePlanMutation = useMutation({
    mutationFn: advanceVsuiteOperationPlan,
    onSuccess: invalidate,
  });

  const openClass = (id: string) => {
    setClassId(id);
    setPage('class');
  };

  const visibleMenu = [
    { key: 'dashboard' as const, label: 'Dashboard', show: true },
    { key: 'classes' as const, label: 'Khóa / Lớp', show: true },
    { key: 'contracts' as const, label: 'Hợp đồng', show: true },
    { key: 'expenses' as const, label: 'Chi phí / Hậu cần', show: canSeeFinance(role.key) },
    { key: 'payments' as const, label: 'Đề nghị thanh toán', show: canSeePayment(role.profile) },
    { key: 'plans' as const, label: 'Duyệt kế hoạch', show: canSeePlans(role.key) },
    { key: 'audit' as const, label: 'Nhật ký', show: canManage(role.key) },
  ].filter((item) => item.show);
  const currentMenu = visibleMenu.find((item) => item.key === page) || visibleMenu[0];

  let body: React.ReactNode;
  if (isLoading) body = <div className="vsuite-po-card">Đang tải V-Suite...</div>;
  else if (error) body = <div className="vsuite-po-card vsuite-po-error">{error instanceof Error ? error.message : String(error)}</div>;
  else if (page === 'dashboard') body = <Dashboard classes={classes} contracts={contracts} checklistItems={checklistItems} openClass={openClass} />;
  else if (page === 'classes') body = <ClassList classes={classes} programs={programs} contracts={contracts} checklistItems={checklistItems} queryText={queryText} setQueryText={setQueryText} openClass={openClass} />;
  else if (page === 'class' && selectedClass) {
    body = (
      <ClassDetail
        cls={selectedClass}
        role={role.key}
        contracts={contracts}
        programs={programs}
        checklistItems={checklistItems.filter((item) => item.class_id === selectedClass.id)}
        reminders={reminders.filter((item) => item.class_id === selectedClass.id)}
        expenses={expenses.filter((item) => item.class_id === selectedClass.id)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        back={() => setPage('classes')}
        toggleItem={(item) => checklistMutation.mutate({ id: item.id, patch: { state: item.state === 'done' ? 'pending' : 'done' } })}
        saveEvidence={(item, evidence) => checklistMutation.mutate({ id: item.id, patch: { evidence } })}
        completeReminder={(item) => reminderMutation.mutate({ id: item.id, status: 'done' })}
      />
    );
  } else if (page === 'contracts') body = <Contracts contracts={contracts} programs={programs} />;
  else if (page === 'expenses') body = <Expenses expenses={expenses} classes={classes} />;
  else if (page === 'payments') {
    body = (
      <PaymentRequests
        role={role.key}
        currentProfile={role.profile}
        classes={classes}
        requests={paymentRequests}
        documents={paymentDocuments}
        events={approvalEvents.filter((item) => item.entity_type === 'payment_request')}
        createRequest={(input) => createPaymentMutation.mutate(input)}
        createDocument={(input) => createDocumentMutation.mutateAsync(input).then(() => undefined)}
        advanceRequest={(request, action, note, transactionRef) => advancePaymentMutation.mutate({ request, action, note, transactionRef })}
      />
    );
  } else if (page === 'plans') {
    body = (
      <OperationPlans
        role={role.key}
        classes={classes}
        plans={operationPlans}
        events={approvalEvents.filter((item) => item.entity_type === 'operation_plan')}
        createPlan={(input) => createPlanMutation.mutate(input)}
        advancePlan={(plan, action, note) => advancePlanMutation.mutate({ plan, action, note })}
      />
    );
  }
  else if (page === 'audit') body = <Audit reminders={reminders} checklistItems={checklistItems} />;
  else body = <Dashboard classes={classes} contracts={contracts} checklistItems={checklistItems} openClass={openClass} />;

  return (
    <div className="vsuite-po-page">
      <div className="vsuite-po-shell">
        <aside className="vsuite-po-sidebar">
          <div className="vsuite-po-brand">
            <div className="vsuite-po-mark">P1</div>
            <div>
              <strong>PeopleOne</strong>
              <span>Vận hành Đào tạo</span>
            </div>
          </div>
          <nav>
            {visibleMenu.map((item) => (
              <button key={item.key} className={currentMenu.key === item.key ? 'active' : ''} onClick={() => setPage(item.key)}>
                {item.label}
              </button>
            ))}
          </nav>
        </aside>
        <div className="vsuite-po-main">
          <header className="vsuite-po-topbar">
            <div>
              <strong>{currentMenu.label}</strong>
              <span>V-Suite · clone giao diện PeopleOne mockup</span>
            </div>
            <div className="vsuite-po-row">
              <VsuiteNotificationBell openPage={setPage} />
              <button className="vsuite-po-btn" onClick={() => void invalidate()}><RefreshCw size={14} /> Tải lại</button>
              <div className="vsuite-po-current-role">
                <span>Vai trò hiện tại</span>
                <strong>{role.label}</strong>
              </div>
            </div>
          </header>
          <main className="vsuite-po-content">{body}</main>
        </div>
      </div>
    </div>
  );
}

function VsuiteNotificationBell({ openPage }: { openPage: (page: PeopleOnePage) => void }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'vsuite', profile?.id || profile?.authUserId || 'anonymous'],
    queryFn: listNotifications,
    enabled: Boolean(profile?.id || profile?.authUserId),
    staleTime: 1000 * 30,
  });
  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const allNotifications = ((notificationsQuery.data as NotificationRow[] | undefined) || []).filter((item) => item.metadata?.module === 'vsuite');
  const notifications = allNotifications.slice(0, 8);
  const unreadCount = allNotifications.filter((item) => !item.read_at).length;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const toggle = () => {
    setOpen((current) => {
      const next = !current;
      if (next && unreadCount && !markAllReadMutation.isPending) markAllReadMutation.mutate();
      return next;
    });
  };

  const openNotification = (item: NotificationRow) => {
    if (!item.read_at) markReadMutation.mutate(item.id);
    const workflow = String(item.metadata?.workflow || '');
    if (workflow === 'operation_plan') openPage('plans');
    else openPage('payments');
    setOpen(false);
  };

  return (
    <div className="vsuite-po-notice-wrap" ref={ref}>
      <button className="vsuite-po-notice-btn" type="button" aria-label="Thông báo V-Suite" aria-expanded={open} onClick={toggle}>
        <Bell size={16} />
        {unreadCount ? <span>{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </button>
      {open ? (
        <div className="vsuite-po-notice-popover" role="dialog" aria-label="Thông báo V-Suite">
          <div className="vsuite-po-notice-head">
            <div>
              <span>Thông báo</span>
              <strong>Yêu cầu V-Suite cần xử lý</strong>
            </div>
            <button
              type="button"
              onClick={() => markAllReadMutation.mutate()}
              disabled={!unreadCount || markAllReadMutation.isPending}
              title="Đánh dấu tất cả đã đọc"
              aria-label="Đánh dấu tất cả đã đọc"
            >
              <CheckCheck size={16} />
            </button>
          </div>
          <div className="vsuite-po-notice-list">
            {notificationsQuery.isLoading ? (
              <div className="vsuite-po-notice-empty">Đang tải thông báo...</div>
            ) : notifications.length ? notifications.map((item) => (
              <div className={`vsuite-po-notice-item${item.read_at ? '' : ' unread'}`} key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                  <span>{item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : '-'}</span>
                </div>
                <button type="button" onClick={() => openNotification(item)}>Mở</button>
              </div>
            )) : (
              <div className="vsuite-po-notice-empty">Chưa có thông báo V-Suite mới.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function useRoleLabel() {
  const { profile } = useAuth();
  if (profile?.role === 'admin') return { key: 'admin', label: 'Admin hệ thống', profile };
  if (isVsuiteRole(profile?.role)) return { key: profile.role, label: VSUITE_ROLE_META[profile.role].title, profile };
  return { key: profile?.role || '', label: profile?.role || 'Chưa có vai trò V-Suite', profile };
}

function canManage(role: string) {
  return role === 'admin' || role === 'vsuite_admin' || role === 'vsuite_ops';
}

function canSeeFinance(role: string) {
  return canManage(role) || role === 'vsuite_accountant';
}

function canSeePayment(profile: VsuitePaymentActorProfile | null) {
  const role = String(profile?.role || '');
  return canManage(role)
    || ['vsuite_requester', 'vsuite_accountant', 'vsuite_manager', 'vsuite_director', 'vsuite_treasurer'].includes(role)
    || isAccountingPaymentProfile(profile)
    || isDirectorPaymentProfile(profile);
}

function canSeePlans(role: string) {
  return canManage(role) || ['vsuite_teamlead', 'vsuite_manager', 'vsuite_director'].includes(role);
}

function Dashboard({
  classes,
  contracts,
  checklistItems,
  openClass,
}: {
  classes: VsuiteClass[];
  contracts: VsuiteContract[];
  checklistItems: VsuiteChecklistItem[];
  openClass: (id: string) => void;
}) {
  const red = classes.filter((item) => item.alert_level === 'red');
  const amber = classes.filter((item) => item.alert_level === 'amber');

  return (
    <div>
      <div className="vsuite-po-grid vsuite-po-grid-4">
        <div className="vsuite-po-kpi"><div>{contracts.length}</div><span>Hợp đồng đang vận hành</span></div>
        <div className="vsuite-po-kpi"><div>{classes.length}</div><span>Tổng số lớp / phiên</span></div>
        <div className="vsuite-po-kpi"><div className="danger">{red.length}</div><span>Cảnh báo đỏ</span></div>
        <div className="vsuite-po-kpi"><div className="warning">{amber.length}</div><span>Cảnh báo vàng</span></div>
      </div>

      {red.length ? (
        <div className="vsuite-po-card is-danger">
          <h3>Rủi ro cần xử lý ngay</h3>
          {red.map((item) => (
            <button key={item.id} className="vsuite-po-risk-row" onClick={() => openClass(item.id)}>
              <span><strong>{item.code}</strong> - {item.name}</span>
              <span>{item.start_date || '-'}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="vsuite-po-card">
        <h3>Danh sách lớp / phiên</h3>
        <ClassTable classes={classes} checklistItems={checklistItems} openClass={openClass} />
      </div>
    </div>
  );
}

function ClassList({
  classes,
  programs,
  contracts,
  checklistItems,
  queryText,
  setQueryText,
  openClass,
}: {
  classes: VsuiteClass[];
  programs: VsuiteProgram[];
  contracts: VsuiteContract[];
  checklistItems: VsuiteChecklistItem[];
  queryText: string;
  setQueryText: (value: string) => void;
  openClass: (id: string) => void;
}) {
  const rows = classes.filter((item) => {
    const program = findProgram(programs, item.program_id);
    const contract = findContract(contracts, program?.contract_id || null);
    return `${item.code} ${item.name} ${program?.code || ''} ${contract?.code || ''}`.toLowerCase().includes(queryText.toLowerCase());
  });

  return (
    <div className="vsuite-po-card">
      <div className="vsuite-po-card-head">
        <h3>Tất cả khóa / lớp</h3>
        <input placeholder="Tìm theo mã, tên, hợp đồng..." value={queryText} onChange={(event) => setQueryText(event.target.value)} />
      </div>
      <ClassTable classes={rows} checklistItems={checklistItems} openClass={openClass} />
    </div>
  );
}

function ClassTable({
  classes,
  checklistItems,
  openClass,
}: {
  classes: VsuiteClass[];
  checklistItems: VsuiteChecklistItem[];
  openClass: (id: string) => void;
}) {
  return (
    <div className="vsuite-po-table-wrap">
      <table className="vsuite-po-table">
        <thead><tr><th>Mã</th><th>Tên lớp</th><th>Hình thức</th><th>Địa điểm</th><th>Ngày</th><th>Tiến độ</th><th>Trạng thái</th><th>Cảnh báo</th></tr></thead>
        <tbody>
          {classes.map((item) => {
            const progress = classCompletion(checklistItems, item.id);
            return (
              <tr key={item.id}>
                <td><button className="vsuite-po-link" onClick={() => openClass(item.id)}>{item.code}</button></td>
                <td>{item.name}</td>
                <td>{item.format}</td>
                <td>{item.location || '-'}</td>
                <td>{item.start_date || '-'}</td>
                <td><Progress done={progress.done} total={progress.total} /></td>
                <td><Badge>{getLabel(item.status)}</Badge></td>
                <td><span className={`vsuite-po-badge ${ALERT_CLASS[item.alert_level] || 'b-green'}`}>{getLabel(item.alert_level)}</span></td>
              </tr>
            );
          })}
          {!classes.length ? <tr><td colSpan={8}>Chưa có lớp phù hợp.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function ClassDetail({
  cls,
  role,
  contracts,
  programs,
  checklistItems,
  reminders,
  expenses,
  activeTab,
  setActiveTab,
  back,
  toggleItem,
  saveEvidence,
  completeReminder,
}: {
  cls: VsuiteClass;
  role: string;
  contracts: VsuiteContract[];
  programs: VsuiteProgram[];
  checklistItems: VsuiteChecklistItem[];
  reminders: VsuiteReminder[];
  expenses: VsuiteExpense[];
  activeTab: VsuiteTabKey;
  setActiveTab: (tab: VsuiteTabKey) => void;
  back: () => void;
  toggleItem: (item: VsuiteChecklistItem) => void;
  saveEvidence: (item: VsuiteChecklistItem, evidence: string) => void;
  completeReminder: (item: VsuiteReminder) => void;
}) {
  const program = findProgram(programs, cls.program_id);
  const contract = findContract(contracts, program?.contract_id || null);
  const completion = buildVsuiteClassCompletion(checklistItems);
  const visible = checklistItems.filter((item) => item.tab === activeTab);
  const activeMeta = VSUITE_TABS.find((item) => item.key === activeTab) || VSUITE_TABS[0];
  const editable = canManage(role) || canEditVsuiteTab(activeTab, role);
  const openReminders = reminders.filter((item) => item.status === 'open');
  const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return (
    <div>
      <button className="vsuite-po-back" onClick={back}><ArrowLeft size={14} /> Quay lại</button>
      <div className="vsuite-po-card">
        <div className="vsuite-po-class-title">
          <div>
            <h2>{cls.code}</h2>
            <p>{cls.name}</p>
            <div>
              <Badge>{contract?.code || 'Chưa gắn HĐ'}</Badge> <Badge>{program?.code || 'Chưa gắn CT'}</Badge> <Badge>{cls.format}</Badge> <Badge>{getLabel(cls.status)}</Badge>
            </div>
          </div>
          <span className={`vsuite-po-badge ${ALERT_CLASS[cls.alert_level] || 'b-green'}`}>{getLabel(cls.alert_level)}</span>
        </div>
        <div className="vsuite-po-grid vsuite-po-grid-4">
          <Info label="Địa điểm" value={cls.location || '-'} />
          <Info label="Ngày" value={`${cls.start_date || '-'} -> ${cls.end_date || '-'}`} />
          <Info label="Học viên" value={String(cls.student_count || 0)} />
          <Info label="Tiến độ" value={`${completion.done}/${completion.total}`} />
        </div>
      </div>

      <div className="vsuite-po-card">
        <h3>Theo dõi tình trạng theo mảng</h3>
        <div className="vsuite-po-grid vsuite-po-grid-4">
          {VSUITE_TABS.map((tab) => {
            const progress = tabCompletion(checklistItems, tab.key);
            const overdue = checklistItems.filter((item) => item.tab === tab.key && item.state !== 'done' && isOverdue(item.due_date)).length;
            return (
              <button key={tab.key} className={`vsuite-po-track ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>
                <div><strong>{tab.label}</strong>{overdue ? <Badge tone="red">{overdue} trễ</Badge> : null}</div>
                <Progress done={progress.done} total={progress.total} />
              </button>
            );
          })}
        </div>
      </div>

      {openReminders.length ? (
        <div className="vsuite-po-card is-warning">
          <h3>Việc đang được nhắc ({openReminders.length})</h3>
          {openReminders.map((item) => (
            <div key={item.id} className="vsuite-po-reminder">
              <span>{item.message}{item.due_date ? ` · hạn ${item.due_date}` : ''}</span>
              <button className="vsuite-po-btn" onClick={() => completeReminder(item)}><Check size={14} /> Hoàn tất</button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="vsuite-po-card">
        <div className="vsuite-po-tabs">
          {VSUITE_TABS.map((tab) => {
            const progress = tabCompletion(checklistItems, tab.key);
            return <button key={tab.key} className={activeTab === tab.key ? 'active' : ''} onClick={() => setActiveTab(tab.key)}>{tab.label} <span>({progress.done}/{progress.total})</span></button>;
          })}
        </div>
        <div className="vsuite-po-card-head">
          {editable ? <span className="vsuite-po-muted">Tick để đổi trạng thái · nhập minh chứng trực tiếp</span> : <Badge>Chỉ xem với vai trò hiện tại</Badge>}
          <strong>{activeMeta.description}</strong>
        </div>
        <div className="vsuite-po-table-wrap">
          <table className="vsuite-po-table">
            <thead><tr><th>Xong</th><th>Hạng mục</th><th>Phụ trách</th><th>Hạn</th><th>Minh chứng</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {visible.map((item) => {
                const overdue = item.state !== 'done' && isOverdue(item.due_date);
                const itemReminders = reminders.filter((entry) => entry.checklist_item_id === item.id && entry.status === 'open');
                return (
                  <tr key={item.id}>
                    <td><input type="checkbox" checked={item.state === 'done'} disabled={!editable} onChange={() => toggleItem(item)} /></td>
                    <td>{item.label}{itemReminders.length ? <Badge tone="amber">{itemReminders.length} nhắc</Badge> : null}</td>
                    <td>{item.owner_role || '-'}</td>
                    <td>{item.due_date ? <Badge tone={overdue ? 'red' : 'gray'}>{item.due_date}</Badge> : <span className="vsuite-po-muted">-</span>}</td>
                    <td>
                      {editable ? (
                        <input defaultValue={item.evidence || ''} placeholder="Dán link / ghi chú..." onBlur={(event) => saveEvidence(item, event.currentTarget.value)} />
                      ) : item.evidence || <span className="vsuite-po-muted">-</span>}
                    </td>
                    <td><Badge tone={item.state === 'done' ? 'green' : item.state === 'na' ? 'gray' : 'amber'}>{getLabel(item.state)}</Badge></td>
                    <td><button className="vsuite-po-icon-btn" title="Sửa"><Edit3 size={14} /></button></td>
                  </tr>
                );
              })}
              {!visible.length ? <tr><td colSpan={7}>Chưa có mục nào trong mảng này.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="vsuite-po-card">
        <h3>Chi phí / Hậu cần của lớp</h3>
        <strong>Tổng: {formatMoney(expenseTotal)}</strong>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="vsuite-po-info"><span>{label}</span><strong>{value}</strong></div>;
}

function Contracts({ contracts, programs }: { contracts: VsuiteContract[]; programs: VsuiteProgram[] }) {
  return (
    <div className="vsuite-po-grid vsuite-po-grid-3">
      {contracts.map((item) => (
        <div key={item.id} className="vsuite-po-card">
          <div className="vsuite-po-card-head">
            <h3>{item.code}</h3>
            <Badge>{getLabel(item.status)}</Badge>
          </div>
          <p>{item.name}</p>
          <p className="vsuite-po-muted">Khách hàng: {item.customer_name || '-'}</p>
          <p className="vsuite-po-muted">Giá trị: {formatMoney(item.value_amount)}</p>
          <div>{programs.filter((program) => program.contract_id === item.id).map((program) => <Badge key={program.id}>{program.code}</Badge>)}</div>
        </div>
      ))}
      {!contracts.length ? <div className="vsuite-po-card">Chưa có hợp đồng.</div> : null}
    </div>
  );
}

function Expenses({ expenses, classes }: { expenses: VsuiteExpense[]; classes: VsuiteClass[] }) {
  const total = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return (
    <div className="vsuite-po-card">
      <div className="vsuite-po-card-head"><h3>Chi phí / Hậu cần</h3><strong>Tổng: {formatMoney(total)}</strong></div>
      <div className="vsuite-po-table-wrap">
        <table className="vsuite-po-table">
          <thead><tr><th>Lớp</th><th>Loại</th><th>Số tiền</th><th>Chứng từ</th><th>Trạng thái</th><th>Ghi chú</th></tr></thead>
          <tbody>
            {expenses.map((item) => (
              <tr key={item.id}>
                <td>{classes.find((cls) => cls.id === item.class_id)?.code || '-'}</td>
                <td>{item.category}</td>
                <td>{formatMoney(item.amount)}</td>
                <td><Badge tone={item.has_receipt ? 'green' : 'amber'}>{item.has_receipt ? 'Đã có' : 'Thiếu'}</Badge></td>
                <td><Badge>{getLabel(item.status)}</Badge></td>
                <td>{item.note || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentRequests({
  role,
  currentProfile,
  classes,
  requests,
  documents,
  events,
  createRequest,
  createDocument,
  advanceRequest,
}: {
  role: string;
  currentProfile: VsuitePaymentActorProfile | null;
  classes: VsuiteClass[];
  requests: VsuitePaymentRequest[];
  documents: VsuitePaymentDocument[];
  events: Array<{ entity_type: string; entity_id: string; action: string; from_status: string; to_status: string; note: string; created_at: string }>;
  createRequest: (input: Parameters<typeof createVsuitePaymentRequest>[0]) => void;
  createDocument: (input: Parameters<typeof createVsuitePaymentDocument>[0]) => Promise<void>;
  advanceRequest: (request: VsuitePaymentRequest, action: VsuitePaymentAction, note?: string, transactionRef?: string) => void;
}) {
  const [form, setForm] = useState({
    class_id: classes[0]?.id || '',
    title: '',
    vendor_name: '',
    payee_name: '',
    payee_bank: '',
    payee_account: '',
    amount: '',
    purpose: '',
    due_date: '',
  });
  const [docForm, setDocForm] = useState({ payment_request_id: '', title: '', url: '', document_type: 'invoice', note: '' });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docUploadError, setDocUploadError] = useState('');
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});

  const setField = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const setDocField = (key: keyof typeof docForm, value: string) => setDocForm((current) => ({ ...current, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !Number(form.amount)) return;
    createRequest({
      class_id: form.class_id || null,
      title: form.title.trim(),
      vendor_name: form.vendor_name.trim(),
      payee_name: form.payee_name.trim(),
      payee_bank: form.payee_bank.trim(),
      payee_account: form.payee_account.trim(),
      amount: Number(form.amount || 0),
      purpose: form.purpose.trim(),
      due_date: form.due_date || null,
    });
    setForm((current) => ({ ...current, title: '', vendor_name: '', payee_name: '', payee_bank: '', payee_account: '', amount: '', purpose: '', due_date: '' }));
  };

  const submitDocument = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const manualUrl = docForm.url.trim();
    if (!docForm.payment_request_id || (!docFile && !manualUrl)) return;
    const formElement = event.currentTarget;
    setDocUploadError('');
    setIsUploadingDocument(true);
    try {
      const uploaded = docFile
        ? await uploadVsuitePaymentDocumentFile({
            file: docFile,
            paymentRequestId: docForm.payment_request_id,
            documentType: docForm.document_type,
          })
        : null;
      const note = [docForm.note.trim(), uploaded && manualUrl ? `Link tham khảo: ${manualUrl}` : ''].filter(Boolean).join('\n');
      await createDocument({
        ...docForm,
        title: docForm.title.trim() || uploaded?.fileName || 'Link chứng từ',
        url: uploaded?.fileUrl || manualUrl,
        note,
      });
      setDocForm((current) => ({ ...current, title: '', url: '', note: '' }));
      setDocFile(null);
      formElement.reset();
    } catch (error) {
      setDocUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const actionForStatus = (status: VsuitePaymentStatus): VsuitePaymentAction | null => {
    if (status === 'draft') return 'submit';
    if (status === 'returned') return isAccountingPaymentProfile(currentProfile) ? 'accountant_review' : 'submit';
    if (status === 'submitted') return 'accountant_review';
    if (status === 'accountant_review') return 'director_approve';
    if (status === 'manager_approved') return 'director_approve';
    if (status === 'director_approved') return 'mark_paid';
    return null;
  };

  return (
    <div>
      <div className="vsuite-po-card">
        <div className="vsuite-po-card-head">
          <h3>Tạo đề nghị thanh toán</h3>
          <Badge>{role}</Badge>
        </div>
        <form className="vsuite-po-form-grid" onSubmit={submit}>
          <select value={form.class_id} onChange={(event) => setField('class_id', event.target.value)}>
            <option value="">Không gắn lớp</option>
            {classes.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
          </select>
          <input placeholder="Tên đề nghị" value={form.title} onChange={(event) => setField('title', event.target.value)} />
          <input placeholder="Nhà cung cấp" value={form.vendor_name} onChange={(event) => setField('vendor_name', event.target.value)} />
          <input placeholder="Người nhận tiền" value={form.payee_name} onChange={(event) => setField('payee_name', event.target.value)} />
          <input placeholder="Ngân hàng" value={form.payee_bank} onChange={(event) => setField('payee_bank', event.target.value)} />
          <input placeholder="Số tài khoản" value={form.payee_account} onChange={(event) => setField('payee_account', event.target.value)} />
          <input placeholder="Số tiền" type="number" min="0" value={form.amount} onChange={(event) => setField('amount', event.target.value)} />
          <input type="date" value={form.due_date} onChange={(event) => setField('due_date', event.target.value)} />
          <textarea placeholder="Nội dung chi / lý do thanh toán" value={form.purpose} onChange={(event) => setField('purpose', event.target.value)} />
          <button className="vsuite-po-btn" type="submit">Tạo phiếu nháp</button>
        </form>
      </div>

      <div className="vsuite-po-card">
        <div className="vsuite-po-card-head"><h3>Đính kèm chứng từ</h3><span className="vsuite-po-muted">Upload file hoặc dán link Drive cho hóa đơn, báo giá, nghiệm thu, điểm danh, ảnh lớp.</span></div>
        <form className="vsuite-po-form-grid" onSubmit={submitDocument}>
          <select value={docForm.payment_request_id} onChange={(event) => setDocField('payment_request_id', event.target.value)}>
            <option value="">Chọn đề nghị</option>
            {requests.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.title}</option>)}
          </select>
          <select value={docForm.document_type} onChange={(event) => setDocField('document_type', event.target.value)}>
            <option value="invoice">Hóa đơn</option>
            <option value="quotation">Báo giá</option>
            <option value="acceptance">Biên bản nghiệm thu</option>
            <option value="attendance">Bảng điểm danh</option>
            <option value="photo">Ảnh lớp</option>
            <option value="other">Khác</option>
          </select>
          <input placeholder="Tên chứng từ" value={docForm.title} onChange={(event) => setDocField('title', event.target.value)} />
          <label className="vsuite-po-file-field">
            <span>{docFile ? docFile.name : 'Chọn file chứng từ'}</span>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp"
              onChange={(event) => setDocFile(event.target.files?.[0] || null)}
            />
          </label>
          <input placeholder="Link Drive / link chứng từ" value={docForm.url} onChange={(event) => setDocField('url', event.target.value)} />
          <input placeholder="Ghi chú chứng từ" value={docForm.note} onChange={(event) => setDocField('note', event.target.value)} />
          <button className="vsuite-po-btn" type="submit" disabled={isUploadingDocument}>
            {isUploadingDocument ? 'Đang upload...' : 'Thêm chứng từ'}
          </button>
        </form>
        {docUploadError ? <p className="vsuite-po-error-text">{docUploadError}</p> : null}
      </div>

      <div className="vsuite-po-card">
        <h3>Luồng đề nghị thanh toán</h3>
        <div className="vsuite-po-table-wrap">
          <table className="vsuite-po-table">
            <thead><tr><th>Mã</th><th>Nội dung</th><th>Người nhận</th><th>Số tiền</th><th>Chứng từ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>
              {requests.map((item) => {
                const docs = documents.filter((doc) => doc.payment_request_id === item.id);
                const itemEvents = events.filter((entry) => entry.entity_type === 'payment_request' && entry.entity_id === item.id);
                const action = actionForStatus(item.status);
                const note = actionNotes[item.id] || '';
                return (
                  <tr key={item.id}>
                    <td>{item.code}</td>
                    <td>
                      <strong>{item.title}</strong>
                      <p className="vsuite-po-muted">{item.purpose || '-'}</p>
                      {itemEvents.length ? <p className="vsuite-po-muted">Lịch sử: {itemEvents.map((entry) => `${getLabel(entry.from_status)} -> ${getLabel(entry.to_status)}`).join('; ')}</p> : null}
                    </td>
                    <td>{item.payee_name || '-'}<p className="vsuite-po-muted">{[item.payee_bank, item.payee_account].filter(Boolean).join(' · ') || '-'}</p></td>
                    <td>{formatMoney(item.amount)}</td>
                    <td>{docs.length ? docs.map((doc) => <div key={doc.id}><Badge tone={doc.verified ? 'green' : 'amber'}>{doc.document_type}</Badge> {doc.url ? <a href={doc.url} target="_blank" rel="noreferrer">{doc.title}</a> : doc.title}</div>) : <Badge tone="amber">Thiếu chứng từ</Badge>}</td>
                    <td><Badge>{getLabel(item.status)}</Badge></td>
                    <td>
                      <input placeholder="Ghi chú xử lý / mã giao dịch" value={note} onChange={(event) => setActionNotes((current) => ({ ...current, [item.id]: event.target.value }))} />
                      {action && canCurrentProfileActOnPaymentRequest(currentProfile, item, action) ? (
                        <button className="vsuite-po-btn" onClick={() => advanceRequest(item, action, note, action === 'mark_paid' ? note : undefined)}>
                          {getPaymentActionLabel(action)}
                        </button>
                      ) : null}
                      {['submitted', 'accountant_review', 'manager_approved'].includes(item.status) && canCurrentProfileActOnPaymentRequest(currentProfile, item, 'return') ? (
                        <button className="vsuite-po-btn" onClick={() => advanceRequest(item, 'return', note)}>Trả lại</button>
                      ) : null}
                      {getNextPaymentStatus(item.status, 'reject') !== item.status && canCurrentProfileActOnPaymentRequest(currentProfile, item, 'reject') ? (
                        <button className="vsuite-po-btn" onClick={() => advanceRequest(item, 'reject', note)}>Từ chối</button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!requests.length ? <tr><td colSpan={7}>Chưa có đề nghị thanh toán.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OperationPlans({
  role,
  classes,
  plans,
  events,
  createPlan,
  advancePlan,
}: {
  role: string;
  classes: VsuiteClass[];
  plans: VsuiteOperationPlan[];
  events: Array<{ entity_id: string; from_status: string; to_status: string; note: string }>;
  createPlan: (input: Parameters<typeof createVsuiteOperationPlan>[0]) => void;
  advancePlan: (plan: VsuiteOperationPlan, action: VsuitePlanAction, note?: string) => void;
}) {
  const [form, setForm] = useState({ class_id: classes[0]?.id || '', title: '', objective: '', scope: '', budget_amount: '', timeline: '' });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const setField = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    createPlan({
      class_id: form.class_id || null,
      title: form.title.trim(),
      objective: form.objective.trim(),
      scope: form.scope.trim(),
      budget_amount: Number(form.budget_amount || 0),
      timeline: form.timeline.trim(),
    });
    setForm((current) => ({ ...current, title: '', objective: '', scope: '', budget_amount: '', timeline: '' }));
  };

  return (
    <div>
      <div className="vsuite-po-card">
        <div className="vsuite-po-card-head"><h3>Tạo kế hoạch vận hành</h3><Badge>{role}</Badge></div>
        <form className="vsuite-po-form-grid" onSubmit={submit}>
          <select value={form.class_id} onChange={(event) => setField('class_id', event.target.value)}>
            <option value="">Không gắn lớp</option>
            {classes.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}
          </select>
          <input placeholder="Tên kế hoạch" value={form.title} onChange={(event) => setField('title', event.target.value)} />
          <input placeholder="Ngân sách dự kiến" type="number" min="0" value={form.budget_amount} onChange={(event) => setField('budget_amount', event.target.value)} />
          <input placeholder="Timeline" value={form.timeline} onChange={(event) => setField('timeline', event.target.value)} />
          <textarea placeholder="Mục tiêu" value={form.objective} onChange={(event) => setField('objective', event.target.value)} />
          <textarea placeholder="Phạm vi triển khai" value={form.scope} onChange={(event) => setField('scope', event.target.value)} />
          <button className="vsuite-po-btn" type="submit">Tạo kế hoạch nháp</button>
        </form>
      </div>
      <div className="vsuite-po-card">
        <h3>Duyệt kế hoạch</h3>
        <div className="vsuite-po-table-wrap">
          <table className="vsuite-po-table">
            <thead><tr><th>Kế hoạch</th><th>Lớp</th><th>Ngân sách</th><th>Nội dung</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>
              {plans.map((plan) => {
                const note = notes[plan.id] || '';
                const planEvents = events.filter((entry) => entry.entity_id === plan.id);
                return (
                  <tr key={plan.id}>
                    <td><strong>{plan.title}</strong><p className="vsuite-po-muted">{plan.timeline || '-'}</p></td>
                    <td>{classes.find((item) => item.id === plan.class_id)?.code || '-'}</td>
                    <td>{formatMoney(plan.budget_amount)}</td>
                    <td>{plan.objective || '-'}<p className="vsuite-po-muted">{plan.scope || '-'}</p>{planEvents.length ? <p className="vsuite-po-muted">Lịch sử: {planEvents.map((entry) => `${getLabel(entry.from_status)} -> ${getLabel(entry.to_status)}`).join('; ')}</p> : null}</td>
                    <td><Badge>{getLabel(plan.status)}</Badge></td>
                    <td>
                      <input placeholder="Ghi chú duyệt" value={note} onChange={(event) => setNotes((current) => ({ ...current, [plan.id]: event.target.value }))} />
                      {(plan.status === 'draft' || plan.status === 'rejected') ? <button className="vsuite-po-btn" onClick={() => advancePlan(plan, 'submit', note)}>Gửi duyệt</button> : null}
                      {plan.status === 'submitted' && canApproveVsuitePlan(role) ? (
                        <>
                          <button className="vsuite-po-btn" onClick={() => advancePlan(plan, 'approve', note)}>Duyệt</button>
                          <button className="vsuite-po-btn" onClick={() => advancePlan(plan, 'reject', note)}>Từ chối</button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!plans.length ? <tr><td colSpan={6}>Chưa có kế hoạch vận hành.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Audit({ reminders, checklistItems }: { reminders: VsuiteReminder[]; checklistItems: VsuiteChecklistItem[] }) {
  const rows = [
    ...checklistItems.slice(0, 8).map((item) => ({ entity: 'checklist_items', action: `checklist.${item.state}`, text: item.label })),
    ...reminders.slice(0, 8).map((item) => ({ entity: 'vsuite_reminders', action: `reminder.${item.status}`, text: item.message })),
  ].slice(0, 12);

  return (
    <div className="vsuite-po-card">
      <h3>Nhật ký hoạt động</h3>
      <div className="vsuite-po-table-wrap">
        <table className="vsuite-po-table">
          <thead><tr><th>Người dùng</th><th>Hành động</th><th>Đối tượng</th><th>Nội dung</th></tr></thead>
          <tbody>
            {rows.map((item, index) => (
              <tr key={`${item.entity}-${index}`}><td>V-Suite</td><td>{item.action}</td><td>{item.entity}</td><td>{item.text}</td></tr>
            ))}
            {!rows.length ? <tr><td colSpan={4}>Chưa có nhật ký hoạt động.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
