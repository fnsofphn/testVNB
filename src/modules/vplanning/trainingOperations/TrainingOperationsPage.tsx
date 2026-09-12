// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, CopyPlus, MoreVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import './TrainingOperationsPage.css';
import {
  TRAINING_DEFAULT_CLASSES,
  TRAINING_INPUT_DEFINITIONS,
  TRAINING_TASK_TEMPLATES,
  createInitialTrainingOperationsState,
} from './domain.js';
import {
  createTrainingOperationsAccount,
  executeTrainingOperationsCommand,
  fetchTrainingOperationsState,
  getTrainingOperationsFileUrl,
  restoreActiveTrainingOperationsLoginAccess,
  uploadTrainingOperationsFile,
} from './service';
import { TRAINING_ROLE_OPTIONS } from './roles.js';

const COURSE_SYSTEMS = [
  { id: 'VTraining', mature: true },
  { id: 'VLearning', mature: true },
  { id: 'VSurvey', mature: false },
  { id: 'VEvent', mature: false },
];

const INPUT_OWNER_LABEL = { intake: 'Đầu mối / Sale', content: 'Chuyên viên nội dung', vtraining: 'Chuyên viên vận hành VTraining' };
const INPUT_META = Object.fromEntries(Object.entries(TRAINING_INPUT_DEFINITIONS).map(([key, value]) => [key, [value.code, value.title, INPUT_OWNER_LABEL[value.ownerRole]]]));
function renderTrainingOverlay(content) {
  if (typeof document === 'undefined') return content;
  return createPortal(<div className="vwork-training-operations training-overlay-portal">{content}</div>, document.body);
}
const INPUT_FIELDS = {
  vlearning: [
    { key: 'content_name', label: 'Tên bộ nội dung', defaultValue: 'Trải nghiệm khách hàng', required: true },
    { key: 'eln_count', label: 'Số bài VLearning', defaultValue: '1', type: 'number', required: true },
    { key: 'eln_structure', label: 'Cấu trúc bài / phần', defaultValue: '01 phần · 01 bài', required: true },
    { key: 'vimeo_links', label: 'Link Vimeo', defaultValue: '', required: false },
    { key: 'quiz_source', label: 'Nguồn Quiz theo mã ELN', defaultValue: '', required: false },
    { key: 'final_test_source', label: 'Nguồn kiểm tra cuối khóa', defaultValue: '', required: false },
  ],
  game: [
    { key: 'game_count', label: 'Số game', defaultValue: '2', type: 'number', required: true },
    { key: 'game_content', label: 'Nội dung / link game', defaultValue: 'https://game.peopleone.vn/cx-2026', required: true },
    { key: 'play_limit', label: 'Số lượt chơi', defaultValue: '3', type: 'number', required: true },
    { key: 'schedule', label: 'Lịch áp dụng', defaultValue: 'Theo lịch lớp', required: true },
  ],
  discussion: [
    { key: 'discussion_count', label: 'Số chủ đề', defaultValue: '1', type: 'number', required: true },
    { key: 'topic_content', label: 'Chủ đề, hướng dẫn và đầu ra', defaultValue: 'Tình huống chăm sóc khách hàng', required: true },
    { key: 'mode', label: 'Chế độ', defaultValue: 'Cá nhân', required: true },
    { key: 'group_reference', label: 'Tham chiếu nhóm từ D03', defaultValue: '', required: false },
  ],
  assignment: [
    { key: 'assignment_count', label: 'Số bài thu hoạch', defaultValue: '1', type: 'number', required: true },
    { key: 'assignment_brief', label: 'Đề, hướng dẫn và tệp mẫu', defaultValue: 'Thu hoạch cuối khóa', required: true },
    { key: 'rubric_pass_score', label: 'Rubric / điểm đạt', defaultValue: '70', required: true },
    { key: 'submission_rule', label: 'Quy tắc nộp bài', defaultValue: 'PDF · tối đa 10 MB · 01 lần', required: true },
  ],
  test: [
    { key: 'test_count', label: 'Số bài kiểm tra', defaultValue: '1', type: 'number', required: true },
    { key: 'question_bank', label: 'Ngân hàng câu hỏi', defaultValue: 'Bộ đề kiểm tra cuối khóa', required: true },
    { key: 'test_structure', label: 'Cấu trúc bài kiểm tra', defaultValue: '20 câu · trộn câu và đáp án', required: true },
    { key: 'test_rule', label: 'Thời lượng, lượt và điểm đạt', defaultValue: '30 phút · 01 lượt · đạt 70%', required: true },
  ],
  material: [
    { key: 'material_link', label: 'Link thư viện / tài liệu', defaultValue: 'https://vtraining.vn/library/cx-2026', required: false },
    { key: 'material_name_type', label: 'Tên hiển thị và loại tài liệu', defaultValue: 'Tài liệu tham chiếu · PDF', required: true },
    { key: 'class_ids', label: 'Mã lớp áp dụng, cách nhau bằng dấu phẩy', defaultValue: '', required: true },
    { key: 'visible_from', label: 'Hiển thị từ ngày', defaultValue: '', type: 'date', required: true },
    { key: 'visible_to', label: 'Hiển thị đến ngày', defaultValue: '', type: 'date', required: true },
  ],
};
const INPUT_TOTAL = Object.keys(INPUT_META).length;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const GROUP_META = {
  prepare: ['G-01', 'Chuẩn bị thông tin'], setup: ['G-02', 'Khởi tạo dữ liệu & test nội bộ'], live: ['G-03', 'Vận hành tại lớp'], change: ['G-04', 'Xử lý yêu cầu thay đổi'],
};

const SCOPE_ACTIVITY_META = {
  game: ['Gamification', 2], discussion: ['Thảo luận', 2], material: ['Tài liệu', 4],
  assignment: ['Thu hoạch', 1], test: ['Kiểm tra', 1], exercise: ['Bài tập', 1],
};

const CHANGE_CONFIG = {
  discussion: { label: 'Thảo luận', code: 'D06', types: [['content', 'Thay đổi nội dung / phiên bản'], ['quantity', 'Tăng / giảm số lượng']] },
  game: { label: 'Gamification', code: 'D05', types: [['content', 'Thay link / nội dung game'], ['quantity', 'Tăng / giảm số lượng'], ['class', 'Thay lớp áp dụng'], ['limit', 'Thay số lượt chơi']] },
  test: { label: 'Kiểm tra', code: 'D08', types: [['bank', 'Thay bộ đề / bài kiểm tra'], ['quantity', 'Tăng / giảm số lượng'], ['time', 'Thay thời lượng'], ['attempt', 'Thay số lượt / cấu hình']] },
  learner: { label: 'Danh sách học viên', code: 'D03', types: [['file', 'Cập nhật bằng file'], ['add', 'Thêm học viên'], ['remove', 'Xóa học viên'], ['edit', 'Sửa thông tin học viên']] },
  assignment: { label: 'Thu hoạch', code: 'D07', types: [['content', 'Thay bài thu hoạch được gán'], ['quantity', 'Tăng / giảm số lượng']] },
  material: { label: 'Tài liệu', code: 'D09', types: [['content', 'Thay file / link tài liệu'], ['add', 'Thêm tài liệu'], ['remove', 'Xóa tài liệu'], ['class', 'Thay lớp được gán']] },
  exercise: { label: 'Bài tập VLearning', code: 'D04', types: [['content', 'Thay bài tập được gán'], ['quantity', 'Tăng / giảm số lượng']] },
};

const taskTemplates = TRAINING_TASK_TEMPLATES.map((item) => [item.group, item.code, item.title, item.inputKey, item.dueOffset, item.checklist]);

const CLASS_META = TRAINING_DEFAULT_CLASSES;
const INITIAL_WORKSPACE = createInitialTrainingOperationsState({ now: '2026-08-25T00:00:00.000Z' });
const initialTasks = INITIAL_WORKSPACE.tasks;

const STATUS_LABEL = { WAITING_INPUT: 'Chưa sẵn sàng', READY: 'Sẵn sàng', IN_PROGRESS: 'Đang thực hiện', IN_REVIEW: 'Chờ review', REWORK: 'Cần làm lại', NEEDS_REASSIGNMENT: 'Chờ phân công lại', UNASSIGNED: 'Chưa giao', DONE: 'Hoàn thành', CANCELLED: 'Đã hủy theo scope' };
const directoryHasRole = (item, expectedRole) => item?.role === expectedRole || item?.roles?.includes(expectedRole);
const directoryMatchesIdentity = (item, ...values) => {
  const identities = [item?.id, item?.email, item?.name].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  return values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean).some((value) => identities.includes(value));
};
const VIEW_TO_TAB = { work: 'tasks', config: 'tasks', workflow: 'tasks' };
const TAB_TO_VIEW = { tasks: 'work' };
const ACTIVE_ROLE_STORAGE_PREFIX = 'vwork-training-operations.active-role:';

function activeRoleStorageKey(actor) {
  const identity = String(actor?.id || actor?.email || '').trim().toLowerCase();
  return identity ? `${ACTIVE_ROLE_STORAGE_PREFIX}${identity}` : '';
}

function readStoredActiveRole(actor) {
  if (typeof window === 'undefined') return '';
  const key = activeRoleStorageKey(actor);
  if (!key) return '';
  try { return String(window.localStorage.getItem(key) || ''); } catch { return ''; }
}

function storeActiveRole(actor, role) {
  if (typeof window === 'undefined') return;
  const key = activeRoleStorageKey(actor);
  if (!key) return;
  try { window.localStorage.setItem(key, role); } catch { /* Storage may be unavailable in restricted browsers. */ }
}

function readTrainingRoute(search) {
  const params = new URLSearchParams(search);
  return {
    view: params.get('view') || '',
    projectId: params.get('projectId') || '',
    courseId: params.get('courseId') || '',
    classId: params.get('classId') || '',
    taskId: params.get('taskId') || '',
  };
}

export default function TrainingOperationsPage({ initialRole = 'operations', allowRolePreview = import.meta.env.DEV, onSignOut }) {
  const location = useLocation();
  const navigate = useNavigate();
  const routeContext = useMemo(() => readTrainingRoute(location.search), [location.search]);
  const [role, setRole] = useState(initialRole);
  const [availableRoles, setAvailableRoles] = useState(() => allowRolePreview ? TRAINING_ROLE_OPTIONS.map(([value]) => value) : [initialRole]);
  const [tab, setTabState] = useState(() => VIEW_TO_TAB[routeContext.view] || routeContext.view || 'overview');
  const [workspaceState, setWorkspaceState] = useState(INITIAL_WORKSPACE);
  const [stateVersion, setStateVersion] = useState(0);
  const versionRef = useRef(0);
  const savingRef = useRef(false);
  const roleRestoreAttemptedRef = useRef(false);
  const [syncState, setSyncState] = useState('loading');
  const [syncError, setSyncError] = useState('');
  const [, setInputs] = useState({ roster: false, vlearning: false, game: false, discussion: false, assignment: false, test: false, material: false });
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedTaskId, setSelectedTaskId] = useState(routeContext.taskId || '');
  const [audit, setAudit] = useState([]);
  const [toast, setToast] = useState('');
  const [uploadStep, setUploadStep] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [courseDialog, setCourseDialog] = useState({ open: false, mode: '', courseId: '' });
  const [changeOpen, setChangeOpen] = useState(false);
  const [scopeCounts, setScopeCounts] = useState({ game: 2, discussion: 2, material: 4, assignment: 1, test: 1, exercise: 1 });
  const [groupManagers, setGroupManagers] = useState(() => Object.fromEntries(CLASS_META.flatMap((classMeta) => ['prepare', 'setup', 'live'].map((group) => [`${classMeta.code}:${group}`, 'Chưa giao']))));
  const [workflowClass, setWorkflowClass] = useState('TNKH01');
  const [changeRequests, setChangeRequests] = useState([]);
  const [actor, setActor] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [accountDirectory, setAccountDirectory] = useState([]);
  const allowSeedFallback = ['loading', 'seed'].includes(syncState);
  const activeProject = workspaceState.projects?.find((item) => item.id === routeContext.projectId)
    || workspaceState.projects?.find((item) => item.id === workspaceState.activeProjectId)
    || workspaceState.projects?.[0]
    || (allowSeedFallback ? INITIAL_WORKSPACE.projects[0] : null);
  const activeCourse = workspaceState.courses?.find((item) => item.id === routeContext.courseId && item.projectId === activeProject?.id)
    || workspaceState.courses?.find((item) => item.projectId === activeProject?.id)
    || workspaceState.courses?.[0]
    || (allowSeedFallback ? INITIAL_WORKSPACE.courses[0] : null);
  const projectCourses = (workspaceState.courses || []).filter((item) => item.projectId === activeProject?.id && item.status !== 'ARCHIVED');
  const projectClasses = (workspaceState.classes || []).filter((item) => item.projectId === activeProject?.id);
  const projectInputs = (workspaceState.inputs || []).filter((item) => item.projectId === activeProject?.id);
  const classes = projectClasses.filter((item) => !activeCourse?.id || item.courseId === activeCourse.id);
  const activeScope = [...(workspaceState.scopes || [])].filter((item) => item.projectId === activeProject?.id && (!item.courseId || item.courseId === activeCourse?.id)).sort((a, b) => b.version - a.version)[0] || (allowSeedFallback ? INITIAL_WORKSPACE.scopes[0] : null);
  const scopedInputRecords = (workspaceState.inputs || []).filter((item) => item.projectId === activeProject?.id && (!activeCourse?.id || item.courseId === activeCourse.id));
  const inputs = useMemo(() => Object.fromEntries(Object.keys(INPUT_META).map((key) => {
    const records = scopedInputRecords.filter((item) => item.key === key && item.required !== false);
    return [key, records.length > 0 && records.every((item) => item.status === 'ACTIVE')];
  })), [workspaceState.inputs, activeProject?.id, activeCourse?.id]);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;
  const saleUploadTotal = projectClasses.length;
  const saleUploadDone = projectInputs.filter((item) => item.key === 'roster' && item.status === 'ACTIVE').length;
  const selectedCourseProgress = (workspaceState.courseInputProgress || []).find((item) => item.courseId === activeCourse?.id);
  const readyCount = selectedCourseProgress?.ready ?? Object.values(inputs).filter(Boolean).length;
  const readyTotal = selectedCourseProgress?.total ?? INPUT_TOTAL;
  const contentInputKeys = ['vlearning', 'game', 'discussion', 'assignment', 'test', 'material'].filter((key) => scopedInputRecords.some((item) => item.key === key && item.required !== false));
  const contentReadyCount = contentInputKeys.filter((key) => inputs[key]).length;
  const contextTasks = tasks.filter((task) => (!activeProject?.id || task.projectId === activeProject.id)
    && (!activeCourse?.id || task.courseId === activeCourse.id)
    && (!routeContext.classId || [task.classId, task.classCode].includes(routeContext.classId)));
  const contextSelectedTask = contextTasks.find((task) => task.id === selectedTaskId) || null;
  const kpis = useMemo(() => ({ waiting: tasks.filter((task) => task.status === 'WAITING_INPUT').length, active: tasks.filter((task) => ['READY', 'IN_PROGRESS'].includes(task.status)).length, review: tasks.filter((task) => task.status === 'IN_REVIEW').length, done: tasks.filter((task) => task.status === 'DONE').length, rework: tasks.filter((task) => task.status === 'REWORK').length }), [tasks]);

  function notify(message) { setToast(message); window.setTimeout(() => setToast(''), 3200); }

  function writeRoute(nextTab, context = {}, { replace = false } = {}) {
    const params = new URLSearchParams();
    params.set('view', TAB_TO_VIEW[nextTab] || nextTab);
    const merged = { ...routeContext, projectId: routeContext.projectId || activeProject?.id, courseId: routeContext.courseId || activeCourse?.id, ...context };
    for (const key of ['projectId', 'courseId', 'classId', 'taskId']) if (merged[key]) params.set(key, merged[key]);
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace });
  }

  function setTab(nextTab) {
    const normalized = VIEW_TO_TAB[nextTab] || nextTab;
    setTabState(normalized);
    writeRoute(normalized);
  }

  function navigateWork(context = {}, options = {}) {
    setTabState('tasks');
    writeRoute('tasks', context, options);
  }

  function hydrate(response) {
    const state = response?.state || INITIAL_WORKSPACE;
    setWorkspaceState(state);
    const nextVersion = Number(response?.version || 0);
    versionRef.current = nextVersion;
    setStateVersion(nextVersion);
    const grantedRoles = Array.isArray(response?.availableRoles) && response.availableRoles.length
      ? response.availableRoles
      : allowRolePreview ? TRAINING_ROLE_OPTIONS.map(([value]) => value) : [response?.role || initialRole];
    setAvailableRoles(grantedRoles);
    if (response?.role) setRole(response.role);
    if (response?.actor) setActor(response.actor);
    if (Array.isArray(response?.directory)) setDirectory(response.directory);
    if (Array.isArray(response?.accountDirectory)) setAccountDirectory(response.accountDirectory);
    const nextInputs = Object.fromEntries(Object.keys(INPUT_META).map((key) => [key, state.inputs?.some((item) => item.key === key && item.status === 'ACTIVE') || false]));
    setInputs(nextInputs);
    setTasks(Array.isArray(state.tasks) ? state.tasks : []);
    if (routeContext.taskId && state.tasks?.some((item) => item.id === routeContext.taskId)) setSelectedTaskId(routeContext.taskId);
    else if (selectedTaskId && !state.tasks?.some((item) => item.id === selectedTaskId)) setSelectedTaskId('');
    const latestScope = [...(state.scopes || [])].filter((item) => item.projectId === state.activeProjectId).sort((a, b) => b.version - a.version)[0];
    if (latestScope) setScopeCounts({
      game: Number(latestScope.instanceCount?.GAMIFICATION || 0),
      discussion: Number(latestScope.instanceCount?.DISCUSSION || 0),
      material: Number(latestScope.instanceCount?.MATERIAL || 0),
      assignment: Number(latestScope.instanceCount?.ASSIGNMENT || 0),
      test: Number(latestScope.instanceCount?.TEST || 0),
      exercise: Number(latestScope.instanceCount?.VLEARNING || 0),
    });
    setChangeRequests([...(state.changeRequests || [])].reverse());
    setAudit([...(state.auditEvents || [])].reverse());
    setGroupManagers(Object.fromEntries((state.classes || []).flatMap((classItem) => ['prepare', 'setup', 'live'].map((group) => {
      const task = state.tasks?.find((item) => item.classCode === classItem.code && item.group === group);
      return [`${classItem.code}:${group}`, task?.manager || 'Chưa giao'];
    }))));
  }

  async function loadWorkspace({ quiet = false, requestedRole = role } = {}) {
    if (!quiet) setSyncState('loading');
    setSyncError('');
    try {
      const response = await fetchTrainingOperationsState(requestedRole);
      const grantedRoles = Array.isArray(response?.availableRoles) && response.availableRoles.length
        ? response.availableRoles
        : allowRolePreview ? TRAINING_ROLE_OPTIONS.map(([value]) => value) : [response?.role || initialRole];
      if (!roleRestoreAttemptedRef.current) {
        roleRestoreAttemptedRef.current = true;
        const storedRole = readStoredActiveRole(response?.actor);
        if (storedRole && grantedRoles.includes(storedRole) && storedRole !== response?.role) {
          return loadWorkspace({ quiet: true, requestedRole: storedRole });
        }
      }
      hydrate(response);
      if (response?.role && grantedRoles.includes(response.role)) storeActiveRole(response.actor, response.role);
      setSyncState(response.storage === 'seed' ? 'seed' : 'synced');
      return response;
    } catch (error) {
      setSyncState('error');
      setSyncError(error.message || 'Không thể tải dữ liệu vận hành đào tạo.');
      return null;
    }
  }

  async function provisionAccount(draft) {
    setSyncState('saving');
    setSyncError('');
    try {
      const response = await createTrainingOperationsAccount(draft, role);
      await loadWorkspace({ quiet: true });
      setSyncState('synced');
      notify(`${response.user.authUserCreated ? 'Đã tạo tài khoản đăng nhập' : 'Đã cập nhật quyền VWork'} cho ${response.user.name}.`);
      return { user: response.user, error: '' };
    } catch (error) {
      const message = error.message || 'Không thể tạo tài khoản ekip.';
      setSyncState('error');
      setSyncError(message);
      return { user: null, error: message };
    }
  }
  async function restoreExistingLoginAccess() {
    setSyncState('saving');
    setSyncError('');
    try {
      const response = await restoreActiveTrainingOperationsLoginAccess(role);
      setSyncState('synced');
      const result = response.reconciliation;
      notify(`${result.loginAccessReady}/${result.candidates} tài khoản VWork đã sẵn sàng đăng nhập${result.failures.length ? `; còn ${result.failures.length} lỗi` : ''}.`);
      return { reconciliation: result, error: '' };
    } catch (error) {
      const message = error.message || 'Không thể đồng bộ quyền đăng nhập tài khoản cũ.';
      setSyncState('error');
      setSyncError(message);
      return { reconciliation: null, error: message };
    }
  }

  useEffect(() => { void loadWorkspace({ requestedRole: initialRole }); }, []);
  useEffect(() => {
    const nextTab = VIEW_TO_TAB[routeContext.view] || routeContext.view || 'overview';
    setTabState(nextTab);
    setSelectedTaskId(routeContext.taskId || '');
    if (['workflow', 'config'].includes(routeContext.view)) {
      navigateWork({
        projectId: routeContext.projectId,
        courseId: routeContext.courseId,
        classId: routeContext.classId,
        taskId: routeContext.taskId,
      }, { replace: true });
    }
  }, [location.search]);

  async function runCommand(type, payload, successMessage) {
    if (savingRef.current) return null;
    savingRef.current = true;
    setSyncState('saving');
    setSyncError('');
    try {
      const response = await executeTrainingOperationsCommand({ type, payload }, versionRef.current, role);
      hydrate(response);
      setSyncState('synced');
      if (successMessage) notify(successMessage);
      if (response.audit?.warning) setSyncError(response.audit.warning);
      return response;
    } catch (error) {
      if (error.code === 'TRAINING_OPERATIONS_VERSION_CONFLICT') {
        await loadWorkspace({ quiet: true });
        notify('Dữ liệu vừa được cập nhật ở phiên khác. Hệ thống đã tải bản mới; vui lòng thực hiện lại thao tác.');
      } else {
        setSyncState('error');
        setSyncError(error.message || 'Không thể lưu thay đổi.');
      }
      return null;
    } finally {
      savingRef.current = false;
    }
  }

  async function submitInput(key, draft = {}) {
    const inputRecord = workspaceState.inputs?.find((item) => item.projectId === activeProject.id && item.key === key
      && (!draft.inputId || item.id === draft.inputId)
      && (!draft.courseId || item.courseId === draft.courseId)
      && (!draft.classId || item.classId === draft.classId));
    let validation = draft.validation || { valid: true, errors: [], warnings: [] };
    let data = draft.data || {};
    let files = [];
    if (draft.file) {
      setSyncState('saving');
      try {
        files = [await uploadTrainingOperationsFile(draft.file, inputRecord?.id || `${activeProject.id}:${INPUT_META[key][0]}`, key, role)];
      } catch (error) {
        setSyncState('error');
        setSyncError(error.message || 'Không thể tải file.');
        return null;
      }
    }
    const type = inputRecord?.activeVersion > 0 ? 'SUBMIT_INPUT_VERSION' : 'SUBMIT_INPUT';
    return runCommand(type, { projectId: activeProject.id, courseId: inputRecord?.courseId || draft.courseId || activeCourse?.id, classId: inputRecord?.classId || draft.classId || null, inputId: inputRecord?.id, inputKey: key, data, files, validation, reason: draft.reason || (type === 'SUBMIT_INPUT_VERSION' ? 'Cập nhật dữ liệu theo yêu cầu mới.' : 'Nộp input lần đầu'), sourceStepCode: type === 'SUBMIT_INPUT_VERSION' ? 'UC15-B03' : undefined }, `${INPUT_META[key][1]} đã được lưu và kiểm tra readiness trên server.`);
  }
  async function switchRole(nextRole) {
    if (!availableRoles.includes(nextRole) || nextRole === role) return;
    setRole(nextRole);
    setTab(nextRole === 'member' || nextRole === 'manager' ? 'tasks' : nextRole === 'intake' || nextRole === 'content' ? 'inputs' : nextRole === 'vtraining' ? 'workflow' : nextRole === 'operations' ? 'structure' : 'overview');
    await loadWorkspace({ requestedRole: nextRole });
  }
  async function updateTask(id, patch, message) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    if (patch.status === 'IN_PROGRESS') return runCommand('START_TASK', { taskId: id }, message || `Đã bắt đầu ${id}.`);
    if (patch.status === 'IN_REVIEW') {
      const evidenceRecord = patch.evidenceRecord || (patch.evidence?.trim() ? { id: `${id}:EVIDENCE`, url: patch.evidence.trim() } : null);
      const payload = {
        taskId: id,
        checklist: task.checklist,
        checklistEvidence: patch.checklistEvidence || task.checklistEvidence,
        blocker: patch.blocker ?? task.blocker,
      };
      const output = String(patch.actualOutput || task.actualOutput || '').trim();
      if (output || evidenceRecord) {
        payload.actualOutput = output || 'Có minh chứng đính kèm.';
        payload.evidence = evidenceRecord ? [evidenceRecord] : [];
      }
      return runCommand('SUBMIT_REVIEW', payload, message || `Đã gửi ${id} duyệt.`);
    }
    if (patch.checklistEvidence !== undefined || patch.blocker !== undefined) {
      return runCommand('UPDATE_TASK_PROGRESS', {
        taskId: id,
        checklist: patch.checklist || task.checklist,
        checklistEvidence: patch.checklistEvidence || task.checklistEvidence,
        blocker: patch.blocker ?? task.blocker,
      }, message || `Đã lưu tiến độ ${id}.`);
    }
    if (patch.status === 'DONE') return runCommand('REVIEW_TASK', { taskId: id, result: 'PASS', comment: patch.comment || 'Đạt yêu cầu.' }, message || `Đã duyệt ${id}.`);
    if (patch.status === 'REWORK') return runCommand('REVIEW_TASK', { taskId: id, result: 'REWORK', comment: patch.comment || 'Cần bổ sung theo tiêu chí review.' }, message || `Đã trả lại ${id}.`);
    if (patch.blocker !== undefined || patch.checklistEvidence !== undefined) return runCommand('UPDATE_TASK_PROGRESS', { taskId: id, checklist: task.checklist, checklistEvidence: patch.checklistEvidence || task.checklistEvidence, blocker: patch.blocker ?? task.blocker }, message || `Đã cập nhật tiến độ của ${id}.`);
    if (patch.dueOffset !== undefined || patch.title !== undefined || patch.group !== undefined || patch.checklistItems !== undefined || ['CANCELLED', 'WAITING_INPUT'].includes(patch.status)) {
      return runCommand('UPDATE_TASK_CONFIG', {
        taskId: id,
        dueOffset: patch.dueOffset,
        title: patch.title,
        group: patch.group,
        checklistItems: patch.checklistItems,
        enabled: patch.status === undefined ? undefined : patch.status !== 'CANCELLED',
      }, message || `Đã cập nhật cấu hình ${id}.`);
    }
    setTasks((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    if (message && ['manager', 'operations'].includes(role)) {
      const next = { ...task, ...patch };
      return runCommand('ASSIGN_TASKS', { taskIds: [id], assigneeId: next.assigneeId || next.assignee, assigneeName: next.assignee, reviewerId: next.reviewerId || next.reviewer, reviewerName: next.reviewer, priority: next.priority || 'Normal', deadline: next.plannedDeadline || null, deadlineOverrideReason: next.deadlineOverrideReason || '', requireSeparation: true }, message);
    }
    return null;
  }
  async function toggleChecklist(index) {
    if (!selectedTask) return null;
    const checklist = selectedTask.checklist.map((value, itemIndex) => itemIndex === index ? !value : value);
    return runCommand('UPDATE_TASK_PROGRESS', { taskId: selectedTask.id, checklist, blocker: selectedTask.blocker || '' }, 'Đã lưu checklist và tiến độ.');
  }
  async function assignTasks(taskIds, assigneeId, reviewerId) {
    const assignee = directory.find((item) => item.id === assigneeId);
    const taskCourseId = tasks.find((item) => taskIds.includes(item.id))?.courseId;
    const reviewerAssignment = workspaceState.teamAssignments.find((item) => (
      item.courseId === taskCourseId
      && item.role === 'manager'
      && item.status !== 'ARCHIVED'
      && [item.accountId, item.accountEmail, item.accountName].includes(reviewerId)
    ));
    const reviewer = directory.find((item) => directoryMatchesIdentity(item, reviewerId))
      || (reviewerAssignment ? {
        id: reviewerAssignment.accountId || reviewerAssignment.accountEmail,
        name: reviewerAssignment.accountName || reviewerAssignment.accountEmail || reviewerAssignment.accountId,
      } : null);
    if (!assignee || !reviewer) {
      setSyncError('Chưa xác định được người nhận hoặc người xác nhận từ danh mục tài khoản VWork đang hoạt động.');
      return null;
    }
    return runCommand('ASSIGN_TASKS', { taskIds, assigneeId: assignee.id, assigneeName: assignee.name, reviewerId: reviewer.id, reviewerName: reviewer.name, priority: 'Normal', requireSeparation: true }, `Đã giao ${taskIds.length} công việc cho ${assignee.name}.`);
  }
  async function createClassTask(classId, draft) {
    return runCommand('CREATE_CLASS_TASK', { classId, ...draft }, `Đã thêm công việc vào lớp ${classId}.`);
  }
  async function moveClassTask(taskId, direction) {
    return runCommand('MOVE_CLASS_TASK', { taskId, direction }, 'Đã cập nhật thứ tự công việc.');
  }
  async function assignCourseRole(draft) {
    const { courseId = activeCourse?.id, ...assignment } = draft;
    return runCommand('ASSIGN_COURSE_ROLE', { courseId, ...assignment }, 'Đã cập nhật ekip theo đúng phạm vi khóa học.');
  }
  async function removeCourseRole(assignment) {
    if (!assignment?.courseId || !assignment?.accountId || !assignment?.role) return null;
    if (!window.confirm(`Gỡ ${assignment.accountName} khỏi vai trò ${TRAINING_ROLE_OPTIONS.find(([value]) => value === assignment.role)?.[1] || assignment.role} trong khóa này?`)) return null;
    return runCommand('REMOVE_COURSE_ROLE', { courseId: assignment.courseId, accountId: assignment.accountId, role: assignment.role }, 'Đã gỡ vai trò khỏi khóa học; tài khoản vẫn được giữ nguyên.');
  }
  async function updateCourseStatus(status, courseId = activeCourse?.id) {
    const targetCourse = (workspaceState.courses || []).find((item) => item.id === courseId) || activeCourse;
    if (status === 'ARCHIVED' && !window.confirm(`Lưu trữ khóa ${targetCourse?.code}? Khóa sẽ được ẩn khỏi bộ lọc đang hoạt động; lịch sử vẫn được giữ lại.`)) return null;
    return runCommand('UPDATE_COURSE_STATUS', { courseId, status, reason: status === 'ARCHIVED' ? 'Người dùng xác nhận lưu trữ khóa học.' : '' }, `Khóa học đã chuyển sang ${status}.`);
  }
  async function createCourse(draft) {
    const response = await runCommand('CREATE_COURSE', { projectId: activeProject?.id, ...draft }, draft.copyFromCourseId ? 'Đã nhân bản cấu hình sang khóa học mới.' : 'Đã tạo khóa học mới trong dự án hiện tại.');
    if (response) writeRoute('structure', { projectId: activeProject?.id, courseId: draft.course?.id, classId: '', taskId: '' });
    return response;
  }
  async function archiveTask(taskId) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || !window.confirm(`Xóa công việc “${task.title}”? Lịch sử và audit vẫn được giữ lại.`)) return null;
    const response = await runCommand('ARCHIVE_TASK', { taskId, reason: 'Xóa khỏi màn Công việc theo xác nhận của người có quyền.' }, `Đã lưu trữ ${taskId}; lịch sử không bị xóa.`);
    if (response) {
      setSelectedTaskId('');
      navigateWork({ projectId: task.projectId, courseId: task.courseId, classId: task.classId || task.classCode }, { replace: true });
    }
    return response;
  }
  async function submitScopeChange(activity, nextCount) {
    const [label] = SCOPE_ACTIVITY_META[activity];
    const currentCount = scopeCounts[activity];
    const safeNextCount = Math.max(0, Number(nextCount) || 0);
    const objectKey = activity === 'exercise' ? 'vlearning' : activity;
    const requested = await runCommand('REQUEST_SCOPE_CHANGE', { projectId: activeProject.id, courseId: activeCourse?.id, affectedCourseIds: [activeCourse?.id].filter(Boolean), changeType: 'quantity', objectKey, proposed: { nextCount: safeNextCount }, reason: `${label} thay đổi từ ${currentCount} thành ${safeNextCount}.`, effectiveAt: new Date().toISOString() });
    const request = requested?.state?.changeRequests?.at(-1);
    if (!request) return;
    const approved = await runCommand('APPROVE_SCOPE_CHANGE', { changeRequestId: request.id }, 'Scope mới đã được tạo; task cũ và audit được giữ nguyên.');
    if (approved) setChangeOpen(false);
  }
  function assignGroupManager(group, managerId, classCode = workflowClass) {
    const manager = directory.find((item) => item.id === managerId && directoryHasRole(item, 'manager'));
    if (!manager) return;
    setGroupManagers((current) => ({ ...current, [`${classCode}:${group}`]: manager.name }));
    void runCommand('ASSIGN_GROUP_MANAGER', { classCode, group, managerId: manager.id, managerName: manager.name }, 'Đã cập nhật Quản lý ekip cho nhóm việc của đúng lớp.');
  }
  async function requestChange(payload) {
    const response = await runCommand('REQUEST_SCOPE_CHANGE', { projectId: activeProject.id, courseId: activeCourse?.id, affectedCourseIds: payload.affectedCourseIds || [activeCourse?.id].filter(Boolean), governanceImpact: payload.governanceImpact || {}, changeType: payload.changeType || payload.type || 'content', objectKey: payload.objectKey, proposed: payload.proposed || { classes: payload.classes, source: payload.source }, reason: payload.reason || `${payload.label} · ${payload.typeLabel}`, effectiveAt: payload.effectiveAt || new Date().toISOString() }, 'Yêu cầu đã gửi đúng cấp phê duyệt. Chưa tạo hoặc hủy task.');
    if (response) setChangeOpen(false);
  }
  async function approveChange(request) {
    await runCommand('APPROVE_SCOPE_CHANGE', { changeRequestId: request.id }, 'Đã phê duyệt yêu cầu; scope và task được cập nhật có kiểm soát.');
  }
  const topbarPath = tab === 'change' && changeOpen
    ? 'VWORK / RISK & CHANGE / YÊU CẦU THAY ĐỔI'
    : tab === 'accounts' ? 'VWORK / EKIP & TÀI KHOẢN'
    : tab === 'team' ? ['VWORK', activeProject?.code, activeCourse?.name, 'GÁN VAI TRÒ'].filter(Boolean).join(' / ')
    : tab === 'inputs' ? ['VWORK', activeProject?.code, activeCourse?.name, 'INPUT'].filter(Boolean).join(' / ')
    : tab === 'tasks' ? ['VWORK', activeProject?.code, routeContext.courseId && activeCourse?.name, routeContext.classId && classes.find((item) => [item.id, item.code].includes(routeContext.classId))?.code, routeContext.classId && 'CÔNG VIỆC'].filter(Boolean).join(' / ')
    : tab === 'structure' ? 'VWORK / DANH SÁCH DỰ ÁN' : `VWORK / DỰ ÁN / ${activeProject?.code || ''}`;
  const managedCourse = (workspaceState.courses || []).find((item) => item.id === courseDialog.courseId) || activeCourse;
  const managedProject = courseDialog.mode === 'new' ? activeProject : (workspaceState.projects || []).find((item) => item.id === managedCourse?.projectId) || activeProject;

  return <div className="vwork-training-operations app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">P1</span><div><strong>PeopleOne</strong><small>VWork Operations</small></div></div>
      <nav>
        {role === 'content' ? <><p>WORKSPACE</p><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Tổng quan dự án</button><button className={tab === 'structure' ? 'active' : ''} onClick={() => setTab('structure')}>Khóa / lớp <b>{projectCourses.length}/{projectClasses.length}</b></button><p>INPUT</p><button className={tab === 'inputs' ? 'active' : ''} onClick={() => setTab('inputs')}>Input khóa học <b>{contentReadyCount}/{contentInputKeys.length}</b></button><p>CÔNG VIỆC</p><button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>Việc của tôi <b>{contextTasks.filter((task) => !task.archivedAt).length}</b></button></> : role === 'intake' ? <><p>ĐẦU MỐI / SALE</p><button className={tab === 'inputs' ? 'active' : ''} onClick={() => setTab('inputs')}>Input lớp học <b>{saleUploadDone}/{saleUploadTotal}</b></button><button className={tab === 'change' ? 'active' : ''} onClick={() => setTab('change')}>Yêu cầu thay đổi</button></> : role === 'vtraining' ? <><p>VẬN HÀNH VTRAINING</p><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Tổng quan dự án</button><button className={tab === 'structure' ? 'active' : ''} onClick={() => setTab('structure')}>Khóa / lớp <b>{projectCourses.length}/{projectClasses.length}</b></button><p>INPUT</p><button className={tab === 'inputs' ? 'active' : ''} onClick={() => setTab('inputs')}>Input khóa học <b>{readyCount}/{readyTotal}</b></button><p>CÔNG VIỆC</p><button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>Việc của tôi <b>{contextTasks.filter((task) => !task.archivedAt).length}</b></button></> : <>
          {!['manager', 'member'].includes(role) && <><p>WORKSPACE</p><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Tổng quan dự án</button><button className={tab === 'structure' ? 'active' : ''} onClick={() => setTab('structure')}>Khóa / lớp <b>{projectCourses.length}/{projectClasses.length}</b></button><button className={tab === 'inputs' ? 'active' : ''} onClick={() => setTab('inputs')}>Input readiness <b>{readyCount}/{readyTotal}</b></button></>}
          {['manager', 'member'].includes(role) && <><p>INPUT</p><button className={tab === 'inputs' ? 'active' : ''} onClick={() => setTab('inputs')}>Input công việc <b>{readyCount}/{readyTotal}</b></button></>}
          <p>CÔNG VIỆC</p><button aria-label={role === 'member' ? 'Việc của tôi' : 'Công việc'} className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>{role === 'member' ? 'Việc của tôi' : 'Công việc'} <b>{contextTasks.filter((task) => !task.archivedAt).length}</b></button>{role === 'manager' && <button className={['due', 'review'].includes(tab) ? 'active' : ''} onClick={() => setTab('due')}>Việc cần tôi xử lý <b>{contextTasks.filter((task) => task.status !== 'DONE' && task.status !== 'CANCELLED').length}</b></button>}
          {!['manager', 'member'].includes(role) && <><p>QUẢN LÝ</p>{role === 'operations' && <><button className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>Gán vai trò <b>{(workspaceState.teamAssignments || []).filter((item) => item.status !== 'ARCHIVED').length}</b></button><button className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}>Ekip & tài khoản <b>{accountDirectory.length}</b></button></>}<button className={tab === 'change' ? 'active' : ''} onClick={() => setTab('change')}>Risk & Change</button><button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>Audit Log</button></>}
        </>}
      </nav>
      <div className="sidebar-note"><span>VẬN HÀNH ĐÀO TẠO</span><p>Store và API riêng; VTraining, VLearning chỉ được tham chiếu qua mã nguồn dữ liệu.</p><small className={`sync-indicator ${syncState}`}>{syncState === 'loading' ? 'Đang tải dữ liệu…' : syncState === 'saving' ? 'Đang lưu…' : syncState === 'synced' ? `Đã đồng bộ · v${stateVersion}` : syncState === 'seed' ? 'Chưa có dữ liệu DB · đang dùng seed' : 'Lỗi đồng bộ'}</small>{onSignOut && <button type="button" onClick={onSignOut}>Đăng xuất</button>}</div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div><small>{topbarPath}</small></div><div className="role-switch"><div className="actor-identity"><b>{actor?.name || 'Đang xác định tài khoản'}</b><small>{actor?.email || ''}</small></div><span>{availableRoles.length > 1 ? 'Đang làm việc với vai trò' : 'Vai trò hiện tại'}</span>{availableRoles.length > 1 ? <select aria-label="Chọn vai trò làm việc" value={role} onChange={(event) => void switchRole(event.target.value)}>{TRAINING_ROLE_OPTIONS.filter(([value]) => availableRoles.includes(value)).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select> : <strong>{TRAINING_ROLE_OPTIONS.find(([value]) => value === role)?.[1] || 'Thành viên ekip'}</strong>}<div className="avatar" title={actor?.name || ''}>{initials(actor?.name || actor?.email)}</div></div></header>
      {tab !== 'structure' && <div className="training-context-bar" aria-label="Ngữ cảnh dự án khóa học lớp">
        <label>Dự án<select value={activeProject?.id || ''} onChange={(event) => { const projectId = event.target.value; const courseId = (workspaceState.courses || []).find((item) => item.projectId === projectId && item.status !== 'ARCHIVED')?.id || ''; writeRoute(tab, { projectId, courseId, classId: '', taskId: '' }); }}>
          {(workspaceState.projects || []).map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}
        </select></label><span>›</span>
        <label>Khóa học<select value={activeCourse?.id || ''} onChange={(event) => writeRoute(tab, { projectId: activeProject?.id, courseId: event.target.value, classId: '', taskId: '' })}>
          {(workspaceState.courses || []).filter((item) => item.projectId === activeProject?.id && item.status !== 'ARCHIVED').map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}
        </select></label><span>›</span>
        <label>Lớp<select value={routeContext.classId || ''} onChange={(event) => writeRoute(tab, { projectId: activeProject?.id, courseId: activeCourse?.id, classId: event.target.value, taskId: '' })}>
          <option value="">Tất cả lớp</option>{classes.map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}
        </select></label>
      </div>}
      <main className={`workspace workspace-${tab}`}>
        {syncError && <div className="sync-error" role="alert"><span>{syncError}</span><button type="button" onClick={() => void loadWorkspace()}>Tải lại</button></div>}
        {syncState === 'synced' && !activeProject && <div className="sync-error scope-empty" role="status"><span>Bạn chưa được phân công vào khóa học nào trong dự án này. Quản lý ekip cần gán vai trò theo khóa trước khi bạn có thể xem input hoặc công việc.</span></div>}
        {role !== 'intake' && tab !== 'accounts' && !(role === 'content' && tab === 'inputs') && !(tab === 'change' && changeOpen) && <><section className="project-head"><div><div className="eyebrow"><span className="status-dot"></span>{activeCourse?.status || 'DECLARED'} · SCOPE V{activeScope?.version || 1}</div><h1>{activeProject?.name}</h1><p>{activeProject?.customerName} · {(workspaceState.courses || []).filter((item) => item.projectId === activeProject?.id).length} khóa học · {String((workspaceState.classes || []).filter((item) => item.projectId === activeProject?.id).length).padStart(2, '0')} lớp · {formatDate(activeProject?.startDate)} — {formatDate(activeProject?.deadline)}</p></div><div className="head-actions">{role === 'operations' && <button onClick={() => { setShowCreate(true); setCreateStep(1); }}>+ Tạo dự án</button>}{['operations', 'intake'].includes(role) && tab !== 'change' && <button className="primary" onClick={() => { setTab('change'); setChangeOpen(true); }}>+ Yêu cầu thay đổi</button>}</div></section></>}

        {toast && <div className="toast" role="status">{toast}</div>}
        {tab === 'overview' && (
          <Overview
            tasks={tasks}
            classes={classes}
            project={activeProject}
            course={activeCourse}
            projects={workspaceState.projects || []}
            courses={workspaceState.courses || []}
            allClasses={workspaceState.classes || classes}
            onTasks={(classItem) => classItem
              ? navigateWork({ projectId: activeProject?.id, courseId: activeCourse?.id, classId: classItem.id || classItem.code })
              : setTab('tasks')}
            onOpenClass={(classItem) => {
              const classCourse = (workspaceState.courses || []).find((item) => item.id === classItem.courseId) || activeCourse;
              const classProject = (workspaceState.projects || []).find((item) => item.id === classItem.projectId) || activeProject;
              navigateWork({ projectId: classProject?.id, courseId: classCourse?.id, classId: classItem.id || classItem.code });
            }}
          />
        )}
        {tab === 'structure' && <StructureWorkspace
          role={role}
          tasks={tasks}
          projects={workspaceState.projects || []}
          classes={workspaceState.classes || []}
          courses={(workspaceState.courses || []).filter((item) => item.status !== 'ARCHIVED')}
          project={activeProject}
          course={activeCourse}
          updateTask={updateTask}
          workflowClass={workflowClass}
          setWorkflowClass={setWorkflowClass}
          onSelectProject={(projectId, courseId) => writeRoute('structure', { projectId, courseId, classId: '', taskId: '' })}
          onSelectCourse={(courseId) => writeRoute('structure', { projectId: activeProject?.id, courseId, classId: '', taskId: '' })}
          onOpenCourseDialog={(courseId, mode = '') => {
            if (courseId) writeRoute('structure', { projectId: activeProject?.id, courseId, classId: '', taskId: '' });
            setCourseDialog({ open: true, mode, courseId: courseId || (mode === 'new' ? '' : activeCourse?.id || '') });
          }}
        />}
        {tab === 'team' && role === 'operations' && <CourseTeamWorkspace
          course={activeCourse}
          directory={accountDirectory.length ? accountDirectory : directory}
          assignments={workspaceState.teamAssignments || []}
          assignCourseRole={assignCourseRole}
          removeCourseRole={removeCourseRole}
        />}
        {tab === 'inputs' && <Inputs role={role} activeCourse={activeCourse} courses={projectCourses} inputs={inputs} inputRecords={projectInputs} courseInputProgress={workspaceState.courseInputProgress || []} tasks={tasks} classes={projectClasses} uploadStep={uploadStep} setUploadStep={setUploadStep} submitInput={submitInput} onSelectCourse={(courseId) => writeRoute('inputs', { projectId: activeProject?.id, courseId, classId: '', taskId: '' })}/>}
        {tab === 'tasks' && <LayeredTasks role={role} tasks={contextTasks} classes={classes} directory={directory} teamAssignments={workspaceState.teamAssignments || []} directoryLoading={syncState === 'loading'} actor={actor} project={activeProject} course={activeCourse} routeContext={routeContext} onNavigate={navigateWork} selectedTask={contextSelectedTask} setSelectedTaskId={setSelectedTaskId} updateTask={updateTask} createClassTask={createClassTask} moveClassTask={moveClassTask} archiveTask={archiveTask} assignTasks={assignTasks} toggleChecklist={toggleChecklist}/>}
        {['due', 'review'].includes(tab) && <WorkActionInbox role={role} tasks={contextTasks} classes={classes} directory={directory} actor={actor} project={activeProject} course={activeCourse} selectedTask={contextSelectedTask} setSelectedTaskId={setSelectedTaskId} updateTask={updateTask} assignTasks={assignTasks} toggleChecklist={toggleChecklist} initialTab={tab === 'review' ? 'acceptance' : 'tracking'}/>}
        {tab === 'accounts' && <AccountsPanel directory={accountDirectory} provisionAccount={provisionAccount} restoreExistingLoginAccess={restoreExistingLoginAccess}/>}
        {tab === 'change' && <ChangePanel role={role} open={changeOpen} setOpen={setChangeOpen} counts={scopeCounts} submit={submitScopeChange} requests={changeRequests} onRequest={requestChange} onApprove={approveChange} onInputUpdate={(label, type, objectKey, reason) => { if (objectKey === 'learner') { setChangeOpen(false); setTab('inputs'); return; } const inputKey = objectKey === 'exercise' ? 'vlearning' : objectKey; void submitInput(inputKey, { data: { label, changeType: type, updatedAt: new Date().toISOString() }, reason: reason || `${label} · ${type}` }).then((response) => { if (response) setChangeOpen(false); }); }}/>} {tab === 'audit' && <Audit entries={audit}/>}</main>
    </div>
    {showCreate && <CreateWizard
      step={createStep}
      setStep={setCreateStep}
      close={() => setShowCreate(false)}
      directory={directory}
      confirm={async (payload) => {
        const response = await runCommand('CREATE_PROJECT_BUNDLE', payload, `Đã tạo dự án với ${payload.additionalCourses.length + 1} khóa học trong một giao dịch.`);
        if (response) {
          setShowCreate(false);
        }
      }}
    />}
    {courseDialog.open && <CourseControlPanel
      role={role}
      project={managedProject}
      course={managedCourse}
      initialMode={courseDialog.mode}
      onClose={() => setCourseDialog({ open: false, mode: '', courseId: '' })}
      updateCourseStatus={updateCourseStatus}
      createCourse={createCourse}
    />}
  </div>;
}

function buildMiniMonth(year, monthIndex) {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, monthIndex, index - mondayOffset + 1));
    return { iso: date.toISOString().slice(0, 10), day: date.getUTCDate(), currentMonth: date.getUTCMonth() === monthIndex };
  });
}

function buildCalendarWeeks(classes) {
  const dates = classes.flatMap((item) => [item.startDate, item.endDate]).filter(Boolean).sort();
  const anchor = new Date(`${dates[0] || '2026-09-01'}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7));
  const end = new Date(`${dates.at(-1) || dates[0] || '2026-09-30'}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + ((7 - end.getUTCDay()) % 7));
  const weeks = [];
  for (let cursor = new Date(anchor); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => {
      const date = new Date(cursor); date.setUTCDate(date.getUTCDate() + index);
      return [date.toISOString().slice(0, 10), ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][date.getUTCDay()], String(date.getUTCDate()).padStart(2, '0')];
    }));
  }
  return weeks.length ? weeks : [[['2026-09-01', 'T3', '01']]];
}

function Overview({ tasks, classes = CLASS_META, project, course, projects = [], courses = [], allClasses = [], onTasks, onOpenClass }) {
  const weeks = useMemo(() => buildCalendarWeeks(classes), [classes]);
  const firstClassDate = classes[0]?.startDate || weeks[0][0][0];
  const firstDate = new Date(`${firstClassDate}T00:00:00Z`);
  const [weekIndex, setWeekIndex] = useState(0);
  const [selectedClass, setSelectedClass] = useState(classes[0]?.code || 'TNKH01');
  const [viewMode, setViewMode] = useState('week');
  const [classFilter, setClassFilter] = useState('all');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedCalendarTask, setSelectedCalendarTask] = useState(null);
  const [miniMonth, setMiniMonth] = useState(firstDate.getUTCMonth());
  const [miniYear, setMiniYear] = useState(firstDate.getUTCFullYear());
  const [selectedDate, setSelectedDate] = useState(firstClassDate);
  const activeClass = classes.find((item) => item.code === selectedClass) || classes[0] || CLASS_META[0];
  const classTasks = tasks
    .filter((task) => task.classCode === selectedClass && task.group !== 'change')
    .sort((a, b) => {
      const aComplete = ['DONE', 'CANCELLED'].includes(a.status) ? 1 : 0;
      const bComplete = ['DONE', 'CANCELLED'].includes(b.status) ? 1 : 0;
      return aComplete - bComplete || dueDate(a) - dueDate(b);
    });
  const currentWeek = weeks[Math.min(weekIndex, weeks.length - 1)];
  const visibleDays = viewMode === 'month' ? weeks.flat() : currentWeek;
  const miniDays = buildMiniMonth(miniYear, miniMonth);
  const currentWeekDates = new Set(currentWeek.map(([date]) => date));
  const visibleClasses = (date) => classes.filter((item) => (classFilter === 'all' || item.code === classFilter) && date >= item.startDate && date <= item.endDate);
  function openClassEvent(item, date) { setSelectedClass(item.code); setSelectedEvent({ item, date }); }
  function moveMiniMonth(delta) {
    const date = new Date(Date.UTC(miniYear, miniMonth + delta, 1));
    setMiniYear(date.getUTCFullYear());
    setMiniMonth(date.getUTCMonth());
  }
  function chooseMiniDate(iso) {
    setSelectedDate(iso);
    const date = new Date(`${iso}T00:00:00Z`);
    setMiniMonth(date.getUTCMonth());
    setMiniYear(date.getUTCFullYear());
    const matchedWeek = weeks.findIndex((week) => week.some(([dayIso]) => dayIso === iso));
    if (matchedWeek >= 0) setWeekIndex(matchedWeek);
    const matchingClass = classes.find((item) => iso >= item.startDate && iso <= item.endDate);
    if (matchingClass) setSelectedClass(matchingClass.code);
  }

  return <section className="calendar-overview">
    <OverviewHierarchy projects={projects.length ? projects : [project].filter(Boolean)} courses={courses.length ? courses : [course].filter(Boolean)} classes={allClasses.length ? allClasses : classes} tasks={tasks} onOpenClass={onOpenClass}/>
    <ProjectTimeline project={project} courses={courses} classes={allClasses.length ? allClasses : classes}/>
    <div className="calendar-head">
      <div>
        <small>TỔNG QUAN THEO LỊCH</small>
        <h2>Lịch lớp và công việc cần hoàn thành</h2>
        <p>Chọn một lớp trên lịch để xem công việc; việc đã hoàn thành tự động chuyển xuống cuối.</p>
      </div>
      <div className="calendar-nav">
        <button onClick={() => { setWeekIndex(0); setMiniMonth(firstDate.getUTCMonth()); setMiniYear(firstDate.getUTCFullYear()); setSelectedDate(firstClassDate); }}>Đầu lịch</button>
        <button aria-label="Tuần trước" disabled={weekIndex === 0} onClick={() => setWeekIndex((value) => value - 1)}>‹</button>
        <strong>{formatDate(currentWeek[0][0])} — {formatDate(currentWeek[6][0])}</strong>
        <button aria-label="Tuần sau" disabled={weekIndex === weeks.length - 1} onClick={() => setWeekIndex((value) => value + 1)}>›</button>
        <select aria-label="Chọn tuần" value={Math.min(weekIndex, weeks.length - 1)} onChange={(event) => setWeekIndex(Number(event.target.value))}>{weeks.map((week, index) => <option value={index} key={week[0][0]}>{formatDate(week[0][0])} — {formatDate(week[6][0])}</option>)}</select>
        <select aria-label="Lọc theo lớp" value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="all">Tất cả lớp</option>{classes.map((item) => <option value={item.code} key={item.code}>{item.code}</option>)}</select>
        <div className="calendar-view-switch" role="group" aria-label="Chế độ xem lịch">{[['week', 'Tuần'], ['month', 'Tháng'], ['schedule', 'Lịch biểu']].map(([value, label]) => <button className={viewMode === value ? 'active' : ''} key={value} onClick={() => setViewMode(value)}>{label}</button>)}</div>
      </div>
    </div>
    <div className="calendar-layout">
      <aside className="mini-calendar-panel" aria-label="Lịch tháng thu nhỏ">
        <div className="mini-calendar-head"><b>Tháng {miniMonth + 1} {miniYear}</b><div><button aria-label="Tháng trước" onClick={() => moveMiniMonth(-1)}>‹</button><button aria-label="Tháng sau" onClick={() => moveMiniMonth(1)}>›</button></div></div>
        <div className="mini-weekdays">{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="mini-month-grid">{miniDays.map((item) => <button className={`${item.currentMonth ? '' : 'outside'} ${currentWeekDates.has(item.iso) ? 'in-week' : ''} ${selectedDate === item.iso ? 'selected' : ''}`} aria-label={`Chọn ngày ${item.iso}`} onClick={() => chooseMiniDate(item.iso)} key={item.iso}><span>{item.day}</span>{classes.some((classItem) => item.iso >= classItem.startDate && item.iso <= classItem.endDate) && <i></i>}</button>)}</div>
        <div className="mini-calendar-legend"><span><i></i>Có lớp</span><button onClick={() => { setMiniMonth(firstDate.getUTCMonth()); setMiniYear(firstDate.getUTCFullYear()); setWeekIndex(0); setSelectedDate(firstClassDate); }}>Về tháng đầu dự án</button></div>
      </aside>
      {viewMode !== 'schedule' ? <div className={`week-calendar ${viewMode === 'month' ? 'month-view' : ''}`} aria-label={viewMode === 'month' ? 'Lịch lớp theo tháng' : 'Lịch lớp theo tuần'}>
        {visibleDays.map(([date, weekday, day]) => {
          const classes = visibleClasses(date);
          return <article className="calendar-day" key={date}>
            <header><span>{weekday}</span><b>{day}</b></header>
            <div className="calendar-day-body">
              {classes.map((item) => <button className={selectedClass === item.code ? 'calendar-event selected' : 'calendar-event'} onClick={() => openClassEvent(item, date)} key={item.code}>
                <span>{item.code}</span>
                <b>{item.name}</b>
                <small>{date === item.startDate ? 'Khai giảng' : date === item.endDate ? 'Kết thúc lớp' : 'Đang diễn ra'}</small>
              </button>)}
              {!classes.length && <span className="calendar-empty">Không có lớp</span>}
            </div>
          </article>;
        })}
      </div> : <div className="calendar-schedule">{classes.filter((item) => classFilter === 'all' || item.code === classFilter).map((item) => <button onClick={() => openClassEvent(item, item.startDate)} key={item.code}><time>{formatDate(item.startDate)} — {formatDate(item.endDate)}</time><div><span>{item.code}</span><b>{item.name}</b><small>{tasks.filter((task) => task.classCode === item.code).length} công việc · VTraining + VLearning</small></div><em>Mở chi tiết ›</em></button>)}</div>}
      <aside className="calendar-agenda">
        <div className="agenda-head">
          <span>{activeClass.code}</span>
          <h3>{activeClass.name}</h3>
          <p>{formatDate(activeClass.startDate)} — {formatDate(activeClass.endDate)}</p>
        </div>
        <div className="agenda-list">
          {classTasks.map((task) => <button className={['DONE', 'CANCELLED'].includes(task.status) ? 'agenda-task complete' : 'agenda-task'} onClick={() => setSelectedCalendarTask(task)} key={task.id}>
            <div><b>{task.title}</b><small>{task.id} · {dueLabel(task.startDate, task.dueOffset, task.dueDirection, task.anchorType)}</small></div>
            <span className={`badge ${taskStatusClass(task)}`}>{taskStatusLabel(task)}</span>
          </button>)}
        </div>
        <button onClick={onTasks}>Mở toàn bộ công việc của lớp</button>
      </aside>
    </div>
    {selectedEvent && <div className="calendar-dialog-backdrop" onClick={() => setSelectedEvent(null)}><div className="calendar-dialog" role="dialog" aria-modal="true" aria-label="Chi tiết lớp" onClick={(event) => event.stopPropagation()}><div className="calendar-dialog-head"><div><span>{selectedEvent.item.code}</span><h3>{selectedEvent.item.name}</h3><p>{formatDate(selectedEvent.item.startDate)} — {formatDate(selectedEvent.item.endDate)}</p></div><button aria-label="Đóng chi tiết lớp" onClick={() => setSelectedEvent(null)}>×</button></div><div className="calendar-dialog-grid"><div><small>Ngày đang chọn</small><b>{formatDate(selectedEvent.date)}</b></div><div><small>Khóa học</small><b>Trải nghiệm khách hàng</b></div><div><small>Hình thức</small><b>VTraining + VLearning</b></div><div><small>Công việc</small><b>{tasks.filter((task) => task.classCode === selectedEvent.item.code).length} việc</b></div></div><div className="calendar-dialog-actions"><button onClick={() => setSelectedEvent(null)}>Đóng</button><button className="primary" onClick={() => onTasks(selectedEvent.item)}>Mở công việc của lớp</button></div></div></div>}
    {selectedCalendarTask && <div className="calendar-dialog-backdrop" onClick={() => setSelectedCalendarTask(null)}><div className="calendar-dialog task-preview" role="dialog" aria-modal="true" aria-label="Chi tiết công việc" onClick={(event) => event.stopPropagation()}><div className="calendar-dialog-head"><div><span>{selectedCalendarTask.id} · {GROUP_META[selectedCalendarTask.group]?.[0]}</span><h3>{selectedCalendarTask.title}</h3><p>{activeClass.name}</p></div><button aria-label="Đóng chi tiết công việc" onClick={() => setSelectedCalendarTask(null)}>×</button></div><div className="calendar-dialog-grid"><div><small>Deadline</small><b>{dueLabel(selectedCalendarTask.startDate, selectedCalendarTask.dueOffset, selectedCalendarTask.dueDirection, selectedCalendarTask.anchorType)}</b></div><div><small>Trạng thái</small><b>{STATUS_LABEL[selectedCalendarTask.status]}</b></div><div><small>Quản lý ekip</small><b>{selectedCalendarTask.manager}</b></div><div><small>CTV thực hiện</small><b>{selectedCalendarTask.assignee}</b></div></div><section><h4>Checklist</h4>{selectedCalendarTask.checklistItems.map((item, index) => <label className="check-row" key={item}><input type="checkbox" checked={selectedCalendarTask.checklist[index]} readOnly/><span>{item}</span></label>)}</section><div className="calendar-dialog-actions"><button onClick={() => setSelectedCalendarTask(null)}>Đóng</button><button className="primary" onClick={onTasks}>Mở màn công việc</button></div></div></div>}
  </section>;
}

function ProjectTimeline({ project, courses = [], classes = [] }) {
  return <section className="card project-multilane-timeline" aria-label="Timeline nhiều lane theo khóa và lớp"><div className="page-title"><div><small>TIMELINE DỰ ÁN · NHIỀU LANE</small><h2>Khóa học và lớp trong cùng dự án</h2><p>{formatDate(project?.startDate)} — {formatDate(project?.deadline)} · không dùng “đợt” làm tầng dữ liệu.</p></div></div><div className="timeline-lanes">{courses.filter((item) => item.projectId === project?.id).map((courseItem) => <article key={courseItem.id}><header><b>{courseItem.code} · {courseItem.name}</b><span>{courseItem.status || 'DECLARED'}</span></header><div>{classes.filter((item) => item.courseId === courseItem.id).map((classItem) => <span key={classItem.id}><b>{classItem.code}</b><small>{formatDate(classItem.startDate)} — {formatDate(classItem.endDate)}</small></span>)}</div></article>)}</div></section>;
}

function OverviewHierarchy({ projects = [], courses = [], classes = [], tasks = [], onOpenClass }) {
  return <section className="card overview-hierarchy" aria-label="Cấu trúc dự án, khóa học và lớp">
    <div className="overview-hierarchy-head"><div><small>CẤU TRÚC VWORK</small><h2>Dự án, khóa học và lớp</h2><p>Chọn lớp để mở thẳng danh sách công việc của lớp đó.</p></div><b>{projects.length} dự án · {courses.length} khóa học · {classes.length} lớp</b></div>
    <div className="overview-project-list">{projects.map((projectItem) => {
      const projectCourses = courses.filter((courseItem) => !courseItem.projectId || courseItem.projectId === projectItem.id);
      return <article className="overview-project" key={projectItem.id || projectItem.code}><header><div><span>DỰ ÁN</span><b>{projectItem.name}</b><small>{projectItem.code} · {projectItem.customerName}</small></div><em>{projectCourses.length} khóa học</em></header>{projectCourses.map((courseItem) => {
        const courseClasses = classes.filter((classItem) => (!classItem.courseId || classItem.courseId === courseItem.id) && (!classItem.projectId || classItem.projectId === projectItem.id));
        return <section className="overview-course" key={courseItem.id || courseItem.code}><div><span>KHÓA HỌC</span><b>{courseItem.name}</b><small>{courseItem.code} · {(courseItem.systems || []).join(' + ')}</small></div><div className="overview-class-list">{courseClasses.map((classItem) => { const classTasks = tasks.filter((task) => task.classId === classItem.id || task.classCode === classItem.code); return <button type="button" onClick={() => onOpenClass?.(classItem)} key={classItem.id || classItem.code}><span>{classItem.code}</span><b>{classItem.name}</b><small>{formatDate(classItem.startDate)} — {formatDate(classItem.endDate)} · {classTasks.length} việc</small></button>; })}</div></section>;
      })}</article>;
    })}</div>
  </section>;
}
function Kpi({ label, value, tone = '' }) { return <article className={`kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>Trong dự án hiện tại</small></article>; }
function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return `Vw!${Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('')}`;
}

function AccountsPanel({ directory = [], provisionAccount, restoreExistingLoginAccess }) {
  const [draft, setDraft] = useState({ fullName: '', email: '', roles: ['member'], password: generateTemporaryPassword() });
  const [editingEmail, setEditingEmail] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [created, setCreated] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [reconciling, setReconciling] = useState(false);
  const [reconciliation, setReconciliation] = useState(null);
  const nameValid = draft.fullName.trim().length >= 2;
  const emailValid = /^\S+@\S+\.\S+$/.test(draft.email.trim());
  const existingDirectoryAccount = directory.some((person) => String(person.email || person.id || '').trim().toLowerCase() === draft.email.trim().toLowerCase());
  const rolesValid = draft.roles.length > 0;
  const valid = nameValid && emailValid && rolesValid;
  const roleLabels = Object.fromEntries(TRAINING_ROLE_OPTIONS);
  const searchToken = normalizeSearchText(searchQuery);
  const filteredDirectory = directory.filter((person) => {
    if (!searchToken) return true;
    const roleText = (person.roles || [person.role]).filter(Boolean).map((value) => roleLabels[value] || value).join(' ');
    return normalizeSearchText(`${person.name} ${person.email || person.id} ${roleText}`).includes(searchToken);
  });
  function resetForm() {
    setEditingEmail('');
    setShowPassword(false);
    setSubmitError('');
    setDraft({ fullName: '', email: '', roles: ['member'], password: generateTemporaryPassword() });
  }
  function editAccount(person) {
    const email = String(person.email || person.id || '').trim().toLowerCase();
    setEditingEmail(email);
    setCreated(null);
    setSubmitError('');
    setShowPassword(false);
    setDraft({
      fullName: String(person.name || '').trim(),
      email,
      roles: person.roles?.length ? [...person.roles] : [person.role].filter(Boolean),
      password: '',
    });
  }
  function toggleRole(roleValue) {
    setDraft((current) => ({
      ...current,
      roles: current.roles.includes(roleValue)
        ? current.roles.filter((value) => value !== roleValue)
        : [...current.roles, roleValue],
    }));
  }
  async function submit(event) {
    event.preventDefault();
    if (!valid || busy) return;
    setSubmitError('');
    setBusy(true);
    const result = await provisionAccount({ ...draft, fullName: draft.fullName.trim(), email: draft.email.trim().toLowerCase(), replaceRoles: Boolean(editingEmail), restoreLoginAccess: true });
    setBusy(false);
    if (!result?.user) {
      setSubmitError(result?.error || 'Không thể tạo tài khoản ekip. Vui lòng thử lại.');
      return;
    }
    setCreated({ ...result.user, temporaryPassword: draft.password });
    resetForm();
  }
  async function reconcileExistingAccounts() {
    if (reconciling || !window.confirm('Kiểm tra và mở lại đăng nhập cho toàn bộ tài khoản VWork cũ đang hoạt động? Tài khoản đã khóa ở hồ sơ PeopleOne sẽ không bị mở.')) return;
    setReconciling(true);
    setSubmitError('');
    const result = await restoreExistingLoginAccess();
    setReconciling(false);
    if (!result?.reconciliation) {
      setSubmitError(result?.error || 'Không thể đồng bộ tài khoản cũ.');
      return;
    }
    setReconciliation(result.reconciliation);
  }
  return <section className="accounts-workspace">
    <div className="page-title accounts-title"><div><small>VWORK IDENTITY · END-TO-END</small><h2>Ekip và tài khoản đăng nhập</h2><p>Tạo đồng thời tài khoản Supabase Auth, hồ sơ PeopleOne và thành viên trong danh mục VWork để có thể giao việc thật.</p></div><div className="account-title-actions"><span className="account-total">{directory.length} tài khoản VWork</span><button type="button" disabled={reconciling} onClick={() => void reconcileExistingAccounts()}>{reconciling ? 'Đang đồng bộ…' : 'Đồng bộ đăng nhập tài khoản cũ'}</button></div></div>
    {reconciliation && <div className={`account-reconciliation-result${reconciliation.failures.length ? ' has-errors' : ''}`} role="status"><b>{reconciliation.loginAccessReady}/{reconciliation.candidates} tài khoản đã sẵn sàng đăng nhập</b><span>Mở khóa: {reconciliation.restored} · Tạo/liên kết hồ sơ: {reconciliation.profilesCreated + reconciliation.linked} · Bổ sung quyền nhận việc: {reconciliation.taskAccessGranted} · Không tìm thấy Auth: {reconciliation.missingAuth}</span>{reconciliation.failures.length > 0 && <small>Chưa xử lý được: {reconciliation.failures.map((item) => `${item.email} — ${item.error}`).join('; ')}</small>}</div>}
    <div className="accounts-grid">
      <form className="card account-create-card" onSubmit={submit}>
        <div className="account-card-head"><div><span>{editingEmail ? 'CHỈNH TÀI KHOẢN HIỆN CÓ' : 'TẠO / CẬP NHẬT TÀI KHOẢN'}</span><h3>{editingEmail ? 'Chỉnh vai trò tài khoản' : 'Thành viên và vai trò'}</h3></div><b>{editingEmail ? 'VWORK ROLE' : 'AUTH + VWORK'}</b></div>
        <div className="form-grid">
          <label>Họ và tên<input autoComplete="name" value={draft.fullName} aria-invalid={draft.fullName.length > 0 && !nameValid} aria-describedby="account-name-help" onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))} placeholder="Nguyễn Văn A"/>{draft.fullName.length > 0 && !nameValid && <small className="account-field-error" id="account-name-help">Nhập ít nhất 2 ký tự.</small>}</label>
          <label>Email đăng nhập<input type="email" autoComplete="email" value={draft.email} disabled={Boolean(editingEmail)} aria-invalid={draft.email.length > 0 && !emailValid} aria-describedby="account-email-help" onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="ten@peopleone.com.vn"/>{draft.email.length > 0 && !emailValid && <small className="account-field-error" id="account-email-help">Email chưa đúng định dạng.</small>}</label>
          <label>Mật khẩu tạm <small>(chỉ tài khoản mới)</small><div className="temporary-password"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={draft.password} disabled={Boolean(editingEmail)} placeholder={editingEmail ? 'Giữ nguyên mật khẩu hiện tại' : ''} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))}/><button type="button" disabled={Boolean(editingEmail)} onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Ẩn' : 'Hiện'}</button></div>{existingDirectoryAccount && <small className="account-field-help">Email đã có tài khoản; mật khẩu hiện tại sẽ được giữ nguyên.</small>}</label>
        </div>
        <fieldset className="account-role-matrix" aria-describedby="account-role-help">
          <legend>Ma trận vai trò <span>Chọn một hoặc nhiều</span></legend>
          <div>{TRAINING_ROLE_OPTIONS.map(([roleValue, label]) => <label className={draft.roles.includes(roleValue) ? 'selected' : ''} key={roleValue}><input type="checkbox" checked={draft.roles.includes(roleValue)} onChange={() => toggleRole(roleValue)}/><span><b>{label}</b><small>{RoleSummaryText[roleValue]}</small></span></label>)}</div>
          <small className={rolesValid ? 'account-field-help' : 'account-field-error'} id="account-role-help">{rolesValid ? `Đã chọn ${draft.roles.length} vai trò.` : 'Phải chọn ít nhất một vai trò.'}</small>
        </fieldset>
        <div className="account-form-actions">{editingEmail ? <button type="button" onClick={resetForm}>Hủy chỉnh sửa</button> : <button type="button" onClick={() => setDraft((current) => ({ ...current, password: generateTemporaryPassword() }))}>Tạo mật khẩu khác</button>}<button className="primary" type="submit" disabled={!valid || busy}>{busy ? 'Đang lưu…' : editingEmail ? 'Cập nhật quyền & mở đăng nhập' : 'Lưu tài khoản và quyền đăng nhập'}</button></div>
        {!valid && <p className="account-validation-note">Điền đủ họ tên, email hợp lệ và chọn ít nhất một vai trò.</p>}
        {submitError && <div className="account-submit-error" role="alert">{submitError}</div>}
        <p className="account-security-note">Khi lưu, hệ thống đồng bộ hồ sơ PeopleOne, role VWork và mở lại đăng nhập nếu tài khoản Auth đang bị khóa; mật khẩu hiện tại không thay đổi.</p>
        {created && <div className="account-created" role="status"><b>{created.authUserCreated ? 'Đã tạo' : 'Đã cập nhật'} {created.name}</b><span>{created.email} · {(created.roles || [created.role]).map((value) => roleLabels[value] || value).join(' · ')}</span>{created.authUserCreated && <label>Mật khẩu tạm<input readOnly value={created.temporaryPassword} onFocus={(event) => event.target.select()}/></label>}<small>{created.authUserCreated ? 'Gửi thông tin này cho đúng người dùng qua kênh nội bộ an toàn.' : created.loginAccessReconciled ? 'Đã đồng bộ lại quyền đăng nhập Auth và role VWork; mật khẩu cũ được giữ nguyên.' : 'Tài khoản đăng nhập đang hoạt động; role VWork đã được cập nhật và mật khẩu cũ được giữ nguyên.'}</small></div>}
      </form>
      <section className="card account-directory-card">
        <div className="account-card-head"><div><span>DANH MỤC VWORK</span><h3>Toàn bộ tài khoản VWork</h3></div><b>{filteredDirectory.length}/{directory.length}</b></div>
        <label className="account-directory-search"><span>Tìm tài khoản</span><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Tìm theo tên, email hoặc vai trò…"/></label>
        <div className="account-directory-list">{filteredDirectory.length ? filteredDirectory.map((person) => {
          const personRoles = (person.roles?.length ? person.roles : [person.role]).filter(Boolean);
          return <article className={editingEmail === String(person.email || person.id || '').trim().toLowerCase() ? 'is-editing' : ''} key={person.id}><span>{person.name.split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase()}</span><div><b>{person.name}</b><small>{person.id}</small></div><div className="account-role-badges">{personRoles.length ? personRoles.map((roleValue) => <em key={roleValue}>{roleLabels[roleValue] || roleValue}</em>) : <em>Chưa gán role</em>}{!person.profileLinked && <em className="warning">Chưa liên kết hồ sơ</em>}{person.profileLinked && person.active === false && <em className="warning">Đã khóa</em>}</div><button className="account-edit-role" type="button" onClick={() => editAccount(person)} aria-label={`Chỉnh vai trò của ${person.name}`}>Chỉnh role</button></article>;
        }) : <div className="account-empty"><b>{directory.length ? 'Không tìm thấy tài khoản' : 'Chưa có tài khoản VWork'}</b><span>{directory.length ? 'Thử tên, email hoặc vai trò khác.' : 'Tạo tài khoản đầu tiên để quản lý và giao việc.'}</span></div>}</div>
      </section>
    </div>
    <div className="account-flow"><span>1. Tạo tài khoản</span><i>→</i><span>2. Giao nhóm cho quản lý</span><i>→</i><span>3. Quản lý giao task cho CTV</span><i>→</i><span>4. CTV đăng nhập và thực hiện</span></div>
  </section>;
}

const RoleSummaryText = {
  operations: 'Quản trị vận hành và phân công', intake: 'Đầu mối thông tin / Sale', content: 'Chuẩn bị input nội dung',
  vtraining: 'Vận hành lớp trên VTraining', manager: 'Nhận nhóm và giao việc', member: 'Thực hiện task được giao',
};

function normalizeSearchText(value) {
  return String(value || '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function RoleSummary({ role }) { const copy = { operations: ['Giao nhóm việc cho Quản lý ekip', 'Duyệt yêu cầu trước khi tạo task'], intake: ['Chỉ nộp danh sách theo từng lớp', 'Tạo yêu cầu thay đổi, không tự tạo task'], content: ['Nộp 5 nhóm input nội dung', 'Theo dõi phiên bản độc lập'], vtraining: ['Theo dõi 03 nhóm VTraining', 'Tùy chỉnh checklist và deadline'], manager: ['Nhận nhóm việc và giao CTV', 'Xác nhận PASS / REWORK'], member: ['Thực hiện checklist chi tiết', 'Gửi yêu cầu xác nhận hoàn thành'] }[role]; return <ul className="role-summary">{copy.map((item) => <li key={item}>{item}</li>)}</ul>; }

function CourseTeamWorkspace({ course, directory, assignments, assignCourseRole, removeCourseRole }) {
  const [accountId, setAccountId] = useState('');
  const [courseRole, setCourseRole] = useState('member');
  const courseAssignments = assignments
    .filter((item) => item.courseId === course?.id && item.status !== 'ARCHIVED')
    .sort((a, b) => Number(a.role !== 'manager') - Number(b.role !== 'manager') || String(a.accountName).localeCompare(String(b.accountName), 'vi'));

  useEffect(() => { setAccountId(''); }, [course?.id]);

  async function submitAssignment() {
    const person = directory.find((item) => item.id === accountId);
    if (!person || !course?.id) return;
    const response = await assignCourseRole({ courseId: course.id, accountId: person.id, accountName: person.name, accountEmail: person.email, role: courseRole });
    if (response) setAccountId('');
  }

  if (!course) return <section className="card full"><div className="empty"><strong>Chưa có khóa học</strong><p>Chọn dự án và khóa học trước khi gán vai trò.</p></div></section>;
  return <section className="card full course-team-workspace">
    <div className="page-title"><div><small>QUẢN LÝ · VAI TRÒ THEO KHÓA</small><h2>Gán vai trò theo khóa học</h2><p>Gán hoặc gỡ vai trò trong phạm vi {course.code} · {course.name}. Tài khoản gốc không bị xóa khi gỡ khỏi khóa.</p></div><span className="queue-count">{courseAssignments.length}</span></div>
    <div className="course-role-assignment course-role-assignment-page"><div><strong>Gán vai trò cho thành viên</strong><small>Mỗi khóa có một Quản lý ekip đang chịu trách nhiệm xác nhận công việc.</small></div><label><span>Tài khoản</span><select aria-label="Tài khoản nhận vai trò trong khóa" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Chọn tài khoản</option>{directory.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>Vai trò</span><select aria-label="Vai trò trong khóa" value={courseRole} onChange={(event) => setCourseRole(event.target.value)}>{TRAINING_ROLE_OPTIONS.filter(([value]) => value !== 'operations').map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button type="button" className="primary" disabled={!accountId} onClick={() => void submitAssignment()}>Gán vai trò</button></div>
    <div className="course-team-heading"><div><h3>Thành viên đang hoạt động</h3><p>Quản lý ekip được đồng bộ làm Người xác nhận cho các công việc của khóa.</p></div><span>{courseAssignments.length} vai trò</span></div>
    {courseAssignments.length ? <div className="course-team-list course-team-list-page">{courseAssignments.map((item) => <div className="course-team-row" key={item.id}><div><b>{item.accountName}</b><small>{item.accountEmail || item.accountId}</small></div><span>{TRAINING_ROLE_OPTIONS.find(([value]) => value === item.role)?.[1] || item.role}</span><button type="button" className="danger-action" aria-label={`Gỡ ${item.accountName} khỏi khóa`} onClick={() => void removeCourseRole(item)}><Trash2 size={14}/>Gỡ khỏi khóa</button></div>)}</div> : <p className="course-team-empty">Khóa học chưa có thành viên được gán vai trò.</p>}
  </section>;
}

function CourseControlPanel({ role, project, course, initialMode = '', onClose, updateCourseStatus, createCourse }) {
  const emptyCourseDraft = { code: '', name: '', classCode: 'L01', className: 'Lớp 01', startDate: '', endDate: '' };
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [createMode, setCreateMode] = useState('');
  const [newCourse, setNewCourse] = useState(emptyCourseDraft);
  const canOperate = ['operations', 'admin'].includes(role);
  const canManage = canOperate || role === 'manager';

  useEffect(() => {
    setShowAdminMenu(false);
    if (initialMode) openCreateCourse(initialMode);
    else setCreateMode('');
  }, [initialMode, course?.id]);

  function openCreateCourse(mode) {
    setCreateMode(mode);
    setNewCourse(mode === 'duplicate' ? {
      code: `${course?.code || 'KHOA'}-COPY`,
      name: `${course?.name || 'Khóa học'} · Bản sao`,
      classCode: 'L01',
      className: `Lớp 01 · ${course?.name || 'Khóa học mới'}`,
      startDate: course?.startDate || '',
      endDate: course?.endDate || '',
    } : emptyCourseDraft);
  }

  async function addCourse() {
    const duplicate = createMode === 'duplicate';
    const selectedContents = duplicate ? [...(course?.activities || [])] : ['VTRAINING', 'VLEARNING'];
    const systems = duplicate ? [...(course?.systems || [])] : ['VTraining', 'VLearning'];
    const response = await createCourse({
      copyFromCourseId: duplicate ? course?.id : undefined,
      course: { id: newCourse.code, code: newCourse.code, name: newCourse.name, systems, activities: selectedContents, contentVersion: duplicate ? course?.contentVersion : undefined },
      classes: [{ id: newCourse.classCode, name: newCourse.className, startDate: newCourse.startDate, endDate: newCourse.endDate }],
      scope: { selectedContents, instanceCount: duplicate ? undefined : { VLEARNING: 1, MATERIAL: 1 } },
    });
    if (response) onClose();
  }

  async function changeCourseStatus(status) {
    setShowAdminMenu(false);
    await updateCourseStatus(status, course?.id);
  }

  return renderTrainingOverlay(<div className="modal-backdrop course-management-backdrop" onMouseDown={onClose}><section className="modal course-management-modal" role="dialog" aria-modal="true" aria-label={createMode === 'duplicate' ? `Nhân bản khóa ${course?.code}` : createMode === 'new' ? `Thêm khóa học vào ${project?.code}` : `Quản lý khóa ${course?.code}`} onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-head"><div><small>{createMode ? 'DỰ ÁN · KHÓA HỌC MỚI' : 'CHI TIẾT KHÓA HỌC'}</small><h2>{createMode === 'duplicate' ? `Nhân bản khóa ${course?.code}` : createMode === 'new' ? `Thêm khóa học vào ${project?.code}` : `${course?.code} · ${course?.name}`}</h2></div><button type="button" aria-label="Đóng popup" onClick={onClose}><X size={20}/></button></div>
    <div className="course-management-body"><section className={`course-control-panel${createMode ? ' creating' : ''}`}>
    <div className="page-title course-control-head">
      <div><small>{createMode ? `THUỘC DỰ ÁN ${project?.code}` : 'ĐƠN VỊ VẬN HÀNH · KHÓA HỌC'}</small><h2>{createMode ? (createMode === 'duplicate' ? 'Thông tin khóa học bản sao' : 'Thông tin khóa học mới') : `${course?.code} · ${course?.name}`}</h2><p>{createMode ? `Khóa học sẽ được tạo trong dự án ${project?.name}.` : 'Quản lý vòng đời và cấu trúc của khóa học đang chọn.'}</p></div>
      <div className="course-head-actions"><span className={`badge ${course?.status}`}>{course?.status || 'DECLARED'}</span>{canManage && <div className="course-admin"><button type="button" className="course-icon-action" title="Quản trị khóa" aria-label="Mở menu quản trị khóa" aria-haspopup="menu" aria-expanded={showAdminMenu} onClick={() => setShowAdminMenu((value) => !value)}><MoreVertical size={18} strokeWidth={1.9}/></button>{showAdminMenu && <div className="course-admin-menu" role="menu" aria-label="Quản trị vòng đời khóa">{['DECLARED', 'PREPARING'].includes(course?.status) && <button type="button" role="menuitem" onClick={() => void changeCourseStatus('ACTIVE')}>Kích hoạt khóa</button>}{course?.status === 'ACTIVE' && <button type="button" role="menuitem" onClick={() => void changeCourseStatus('ENDED')}>Kết thúc khóa</button>}{['DECLARED', 'PREPARING', 'ENDED'].includes(course?.status) && <button type="button" className="danger" role="menuitem" onClick={() => void changeCourseStatus('ARCHIVED')}>Lưu trữ khóa</button>}</div>}</div>}</div>
    </div>
    {canOperate && <div className="course-create"><div className="course-create-actions">{!createMode && <button type="button" onClick={() => openCreateCourse('new')}><Plus size={16} strokeWidth={1.9}/>Thêm khóa học vào {project?.code}</button>}{!createMode && <button type="button" className="course-icon-action" title={`Nhân bản khóa ${course?.code}`} aria-label={`Nhân bản khóa ${course?.code || ''}`} onClick={() => openCreateCourse('duplicate')}><CopyPlus size={16} strokeWidth={1.9}/></button>}</div>{createMode && <div className="course-create-form"><div className="course-create-form-head"><div><b>{createMode === 'duplicate' ? `Nhân bản khóa ${course?.code}` : `Thêm khóa học vào ${project?.code}`}</b>{createMode === 'duplicate' && <small>Sao chép cấu hình từ {course?.code}; dữ liệu vận hành và lịch sử không được sao chép.</small>}</div></div><label>Mã khóa<input placeholder="Ví dụ QL01B" value={newCourse.code} onChange={(event) => setNewCourse((current) => ({ ...current, code: event.target.value }))}/></label><label>Tên khóa<input placeholder="Tên khóa học" value={newCourse.name} onChange={(event) => setNewCourse((current) => ({ ...current, name: event.target.value }))}/></label><label>Mã lớp đầu tiên<input placeholder="L01" value={newCourse.classCode} onChange={(event) => setNewCourse((current) => ({ ...current, classCode: event.target.value }))}/></label><label>Tên lớp đầu tiên<input placeholder="Lớp 01" value={newCourse.className} onChange={(event) => setNewCourse((current) => ({ ...current, className: event.target.value }))}/></label><label>Ngày bắt đầu<input type="date" value={newCourse.startDate} onChange={(event) => setNewCourse((current) => ({ ...current, startDate: event.target.value }))}/></label><label>Ngày kết thúc<input type="date" value={newCourse.endDate} onChange={(event) => setNewCourse((current) => ({ ...current, endDate: event.target.value }))}/></label><div className="course-create-submit"><button type="button" onClick={onClose}>Hủy</button><button type="button" className="primary" disabled={!newCourse.code.trim() || !newCourse.name.trim() || !newCourse.classCode.trim() || !newCourse.className.trim() || !newCourse.startDate || !newCourse.endDate || newCourse.endDate < newCourse.startDate} onClick={() => void addCourse()}>{createMode === 'duplicate' ? `Nhân bản khóa ${course?.code}` : `Tạo khóa trong ${project?.code}`}</button></div></div>}</div>}
  </section></div></section></div>);
}

function StructureWorkspace({ role, tasks, projects = [], classes = CLASS_META, courses = [], project, course, updateTask, workflowClass, setWorkflowClass, onSelectProject, onSelectCourse, onOpenCourseDialog }) {
  const [layer, setLayer] = useState('projects');
  const [selectedProjectId, setSelectedProjectId] = useState(project?.id || '');
  const [selectedCourseId, setSelectedCourseId] = useState(course?.id || '');
  const [selectedClass, setSelectedClass] = useState(null);
  const selectedProject = projects.find((item) => item.id === selectedProjectId) || project || projects[0];
  const selectedProjectCourses = courses.filter((item) => item.projectId === selectedProject?.id);
  const selectedCourse = selectedProjectCourses.find((item) => item.id === selectedCourseId) || (course?.projectId === selectedProject?.id ? course : null) || selectedProjectCourses[0];
  const selectedClasses = classes.filter((item) => !selectedCourse?.id || item.courseId === selectedCourse.id);
  const selectedMeta = selectedClass || selectedClasses.find((item) => item.code === workflowClass) || selectedClasses[0] || CLASS_META[0];
  const selectedTasks = tasks.filter((task) => (task.classId === selectedMeta?.id || task.classCode === selectedMeta?.code) && task.group !== 'change');

  useEffect(() => {
    if (project?.id) setSelectedProjectId(project.id);
    if (course?.id) setSelectedCourseId(course.id);
  }, [project?.id, course?.id]);

  function openProject(item) {
    const firstCourse = courses.find((courseItem) => courseItem.projectId === item.id);
    setSelectedProjectId(item.id);
    setSelectedCourseId(firstCourse?.id || '');
    onSelectProject(item.id, firstCourse?.id || '');
    setLayer('courses');
  }

  function openCourse(item) {
    setSelectedCourseId(item.id);
    onSelectCourse(item.id);
    setLayer('classes');
  }
  function openClass(item) {
    setWorkflowClass(item.code);
    setSelectedClass(item);
  }
  function toggleTask(id) {
    const task = tasks.find((item) => item.id === id);
    void updateTask(id, { status: task?.status === 'CANCELLED' ? 'WAITING_INPUT' : 'CANCELLED' });
  }

  return <section className="card full layered-browser">
    <div className="page-title layer-page-title">
      <div>
        <small>CẤU TRÚC TRIỂN KHAI</small>
        <h2>{layer === 'projects' ? 'Danh sách dự án' : layer === 'courses' ? `Khóa học thuộc ${selectedProject?.code}` : `Lớp thuộc ${selectedCourse?.code}`}</h2>
        <p>Chọn một dòng để mở tầng bên trong; chi tiết lớp được hiển thị trong popup riêng.</p>
      </div>
      <div className="layer-head-actions">
        {layer === 'courses' && ['operations', 'admin'].includes(role) && <button className="primary layer-add-button" type="button" onClick={() => onOpenCourseDialog(selectedCourse?.id, 'new')}><Plus size={16}/>Thêm khóa học vào {selectedProject?.code}</button>}
        <nav className="layer-breadcrumb" aria-label="Điều hướng phân tầng">
          <button className={layer === 'projects' ? 'active' : ''} onClick={() => setLayer('projects')}>Dự án</button>
          {layer !== 'projects' && <><span>/</span><button className={layer === 'courses' ? 'active' : ''} onClick={() => setLayer('courses')}>{selectedProject?.code}</button></>}
          {layer === 'classes' && <><span>/</span><b>{selectedCourse?.code}</b></>}
        </nav>
      </div>
    </div>

    {layer === 'projects' && <div className="layer-list">
      <div className="layer-table-head project-layer"><span>Dự án</span><span>Khách hàng</span><span>Khóa học</span><span>Trạng thái</span></div>
      {projects.map((item) => { const count = courses.filter((courseItem) => courseItem.projectId === item.id).length; return <button className="layer-row project-layer" onClick={() => openProject(item)} key={item.id}>
        <div><b>{item.name}</b><small>{item.code} · {formatDate(item.startDate)} — {formatDate(item.deadline)}</small></div>
        <span>{item.customerName}</span><span>{count} khóa học</span><em>{item.status || 'Đang chuẩn bị'}</em>
      </button>; })}
    </div>}

    {layer === 'courses' && <div className="layer-list">
      <div className="layer-table-head course-layer"><span>Khóa học</span><span>Hệ thống</span><span>Lớp</span><span>Trạng thái</span><span>Thao tác</span></div>
      {selectedProjectCourses.map((item) => {
        const courseClasses = classes.filter((classItem) => classItem.courseId === item.id);
        return <div className="layer-course-entry" key={item.id}>
          <button className="layer-course-open" type="button" onClick={() => openCourse(item)}>
            <div><b>{item.name}</b><small>{item.code} · {item.contentVersion}</small></div>
            <span>{(item.systems || []).join(' · ') || 'Chưa cấu hình'}</span><span>{String(courseClasses.length).padStart(2, '0')} lớp</span><em>{item.status || 'DECLARED'}</em>
          </button>
          <div className="layer-row-actions"><button type="button" title={`Nhân bản khóa ${item.code}`} aria-label={`Nhân bản khóa ${item.code}`} onClick={() => onOpenCourseDialog(item.id, 'duplicate')}><CopyPlus size={16}/></button><button type="button" title={`Quản lý khóa ${item.code}`} aria-label={`Quản lý khóa ${item.code}`} onClick={() => onOpenCourseDialog(item.id)}><MoreVertical size={17}/></button></div>
        </div>;
      })}
    </div>}

    {layer === 'classes' && <div className="layer-list">
      <div className="layer-table-head class-layer"><span>Lớp</span><span>Thời gian</span><span>Công việc</span><span>Trạng thái</span></div>
      {selectedClasses.map((item) => {
        const classTasks = tasks.filter((task) => (task.classId === item.id || task.classCode === item.code) && task.group !== 'change');
        const done = classTasks.filter((task) => task.status === 'DONE').length;
        return <button className="layer-row class-layer" onClick={() => openClass(item)} key={item.id || item.code}>
          <div><b>{item.name}</b><small>{item.code} · {selectedCourse?.code}</small></div>
          <span>{formatDate(item.startDate)} — {formatDate(item.endDate)}</span>
          <span>{classTasks.length} công việc</span>
          <em>{done}/{classTasks.length} hoàn thành</em>
        </button>;
      })}
    </div>}

    {selectedClass && renderTrainingOverlay(<div className="modal-backdrop class-detail-backdrop" onMouseDown={() => setSelectedClass(null)}><section className="modal class-detail-modal" role="dialog" aria-modal="true" aria-labelledby="class-detail-title" onMouseDown={(event) => event.stopPropagation()}><div className="class-detail-layer">
      <div className="class-detail-head">
        <div><span>CHI TIẾT LỚP · {selectedCourse?.code}</span><h3 id="class-detail-title">{selectedMeta.name}</h3><p>{selectedMeta.code} · {formatDate(selectedMeta.startDate)} — {formatDate(selectedMeta.endDate)}</p></div>
        <button type="button" aria-label="Đóng chi tiết lớp" onClick={() => setSelectedClass(null)}><X size={18}/></button>
      </div>
      <div className="class-task-customize">
        <div className="class-task-head v4"><span>Bật</span><span>Công việc theo lớp</span><span>Nhóm</span><span>Deadline</span></div>
        {selectedTasks.map((task) => <div className={task.status === 'CANCELLED' ? 'class-task-row v4 disabled' : 'class-task-row v4'} key={task.id}>
          <label><input type="checkbox" checked={task.status !== 'CANCELLED'} disabled={role !== 'operations'} onChange={() => toggleTask(task.id)}/></label>
          <div><b>{task.title}</b><small>{task.id} · {task.checklistItems.length} checklist</small></div>
          <span>{GROUP_META[task.group][1]}</span>
          <span>{dueLabel(task.startDate, task.dueOffset, task.dueDirection, task.anchorType)}</span>
        </div>)}
      </div>
    </div></section></div>)}
  </section>;
}
function getCourseInputProgress(courseId, classes = [], inputRecords = [], aggregates = []) {
  const aggregate = aggregates.find((item) => item.courseId === courseId);
  if (aggregate) return aggregate;
  const courseClasses = classes.filter((item) => item.courseId === courseId);
  const courseRecords = inputRecords.filter((item) => item.courseId === courseId);
  const rosterReady = courseClasses.length > 0 && courseClasses.every((classItem) => courseRecords.some((record) => record.key === 'roster' && record.classId === classItem.id && record.status === 'ACTIVE'));
  const readyKeys = Object.keys(INPUT_META).filter((key) => key === 'roster' ? rosterReady : courseRecords.some((record) => record.key === key && record.status === 'ACTIVE'));
  return { ready: readyKeys.length, total: Object.keys(INPUT_META).length, classCount: courseClasses.length };
}

function getRosterClassProgress(courseId, classes = [], inputRecords = []) {
  const courseClasses = classes.filter((item) => item.courseId === courseId);
  const rows = courseClasses.map((classItem) => {
    const input = inputRecords.find((record) => record.courseId === courseId && record.key === 'roster' && record.classId === classItem.id);
    return { classItem, input, ready: input?.status === 'ACTIVE' };
  });
  return { rows, ready: rows.filter((item) => item.ready).length, total: rows.length };
}

function Inputs({ role, activeCourse, courses = [], inputRecords = [], courseInputProgress = [], tasks = [], classes = [], uploadStep, setUploadStep, submitInput, onSelectCourse }) {
  const [editing, setEditing] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [drafts, setDrafts] = useState({});
  const selectedCourse = courses.find((item) => item.id === activeCourse?.id) || courses[0];
  const scopedClasses = classes.filter((item) => item.courseId === selectedCourse?.id);
  const scopedInputRecords = inputRecords.filter((item) => item.courseId === selectedCourse?.id);
  const scopedInputs = Object.fromEntries(Object.keys(INPUT_META).map((key) => [key, key === 'roster'
    ? scopedClasses.length > 0 && scopedClasses.every((classItem) => scopedInputRecords.some((record) => record.key === key && record.classId === classItem.id && record.status === 'ACTIVE'))
    : scopedInputRecords.some((record) => record.key === key && record.status === 'ACTIVE')]));
  useEffect(() => { setEditing(''); setPreviewing(false); }, [selectedCourse?.id]);
  const editableByRole = {
    content: ['vlearning', 'game', 'discussion', 'assignment', 'test', 'material'],
    vtraining: [],
    operations: Object.keys(INPUT_META),
  };
  const canSubmit = editableByRole[role] || [];
  const visibleKeys = Object.keys(INPUT_META);
  const relevantKeys = visibleKeys.filter((key) => scopedInputRecords.some((item) => item.key === key && item.required !== false));
  const visibleInputs = Object.entries(INPUT_META).filter(([key]) => relevantKeys.includes(key));
  const completed = relevantKeys.filter((key) => scopedInputs[key]).length;

  function patchDraft(key, patch) {
    setDrafts((current) => ({ ...current, [key]: { ...(current[key] || {}), ...patch } }));
  }
  function activeVersionData(key) {
    const input = scopedInputRecords.find((item) => item.key === key);
    return input?.versions?.find((item) => item.version === input.activeVersion)?.data || {};
  }
  function beginEdit(key) {
    const existing = activeVersionData(key);
    const gameContents = Array.isArray(existing.game_contents)
      ? existing.game_contents
      : existing.game_content ? [existing.game_content] : [];
    setDrafts((current) => ({ ...current, [key]: { ...existing, ...(key === 'game' ? { game_contents: gameContents } : {}) } }));
    setEditing(key);
    setPreviewing(false);
  }
  function defaultFieldValue(key, field) {
    if (key === 'material' && field.key === 'class_ids') return scopedClasses.map((item) => item.id || item.code).join(', ');
    if (key === 'material' && field.key === 'visible_from') return [...scopedClasses].map((item) => item.startDate).sort()[0] || '';
    if (key === 'material' && field.key === 'visible_to') return [...scopedClasses].map((item) => item.endDate).sort().at(-1) || '';
    return field.defaultValue;
  }
  function inputData(key) {
    const draft = drafts[key] || {};
    const data = Object.fromEntries((INPUT_FIELDS[key] || []).map((field) => {
      const raw = draft[field.key] ?? defaultFieldValue(key, field);
      if (field.key === 'class_ids') return [field.key, String(raw).split(',').map((item) => item.trim()).filter(Boolean)];
      if (key === 'game' && field.key === 'game_content') return [field.key, String((draft.game_contents || [raw])[0] || '').trim()];
      return [field.key, field.type === 'number' ? Number(raw) : raw];
    }));
    if (key === 'game') data.game_contents = Array.isArray(draft.game_contents) ? draft.game_contents.map((item) => String(item || '').trim()) : [data.game_content].filter(Boolean);
    return data;
  }
  function hasMissingRequired(key) {
    const data = inputData(key);
    if (key === 'game') {
      const count = Number(data.game_count);
      return !Number.isInteger(count) || count < 0 || data.game_contents.length < count || data.game_contents.slice(0, count).some((item) => !item)
        || (count > 0 && (!String(data.play_limit || '').trim() || !String(data.schedule || '').trim()));
    }
    return (INPUT_FIELDS[key] || []).some((field) => field.required && (Array.isArray(data[field.key]) ? !data[field.key].length : !String(data[field.key] ?? '').trim()));
  }
  async function confirm(key) {
    const draft = drafts[key] || {};
    const response = await submitInput(key, { courseId: selectedCourse?.id, data: inputData(key), file: draft.file });
    if (response) {
      setEditing('');
      setPreviewing(false);
    }
  }

  return <div className="input-workspace-stack">
    {role === 'intake' && <SaleRosterInputs courses={courses} classes={classes} inputRecords={inputRecords} uploadStep={uploadStep} setUploadStep={setUploadStep} submit={(draft) => submitInput('roster', draft)}/>}
    <section className="card full role-input-workspace">
    <div className="page-title">
      <div>
        <small>INPUT VẬN HÀNH · THEO KHÓA HỌC</small>
        <h2>{canSubmit.length ? 'Input cần cập nhật và sử dụng' : 'Input dùng để thực hiện công việc'}</h2>
        <p>Mọi vai trò trong khóa được đọc phiên bản đang hiệu lực. Chỉ người sở hữu input hoặc Quản lý vận hành được cập nhật.</p>
      </div>
      <div className="input-progress-summary"><b>{completed}/{relevantKeys.length}</b><span>đầu vào sẵn sàng</span></div>
    </div>
    <div className="course-input-overview">
      <div className="course-input-overview-head"><div><small>DANH SÁCH KHÓA HỌC</small><h3>Input readiness theo từng khóa</h3></div><span>{courses.length} khóa học</span></div>
      <div className="course-input-list">{courses.map((courseItem) => { const progress = getCourseInputProgress(courseItem.id, classes, inputRecords, courseInputProgress); const isSelected = courseItem.id === selectedCourse?.id; return <button type="button" className={isSelected ? 'course-input-card selected' : 'course-input-card'} key={courseItem.id} onClick={() => onSelectCourse?.(courseItem.id)}>
        <div><span>{courseItem.id}</span><b>{courseItem.name}</b><small>{progress.classCount} lớp · phiên bản {courseItem.contentVersion || '—'}</small></div>
        <strong>{progress.ready}/{progress.total}<small> đầu vào sẵn sàng</small></strong>
      </button>; })}</div>
    </div>
    {selectedCourse && <div className="selected-course-input"><span>ĐANG XEM INPUT CỦA KHÓA</span><b>{selectedCourse.id} · {selectedCourse.name}</b></div>}
    {!canSubmit.length && <div className="input-role-note"><b>Quyền đọc input</b><span>Bạn có thể xem dữ liệu và tải file của input thuộc khóa được phân công, nhưng không thể thay đổi phiên bản nguồn.</span></div>}
    <div className={visibleInputs.length <= 2 ? 'input-grid compact' : 'input-grid'}>
      {visibleInputs.map(([key, [code, title, owner]]) => { const inputRecord = scopedInputRecords.find((item) => item.key === key); const activeVersion = inputRecord?.versions?.find((item) => item.version === inputRecord.activeVersion); const impactedTasks = tasks.filter((task) => task.courseId === selectedCourse?.id && task.requiredInputCodes?.includes(code)); const blockedClasses = new Set(impactedTasks.filter((task) => task.status === 'WAITING_INPUT').map((task) => task.classId)).size; const rosterProgress = key === 'roster' ? getRosterClassProgress(selectedCourse?.id, scopedClasses, scopedInputRecords) : null; const partiallyReady = Boolean(rosterProgress?.ready && rosterProgress.ready < rosterProgress.total); const statusLabel = rosterProgress ? (rosterProgress.ready === rosterProgress.total && rosterProgress.total > 0 ? `Đã cập nhật đủ · ${rosterProgress.ready}/${rosterProgress.total} lớp` : rosterProgress.ready > 0 ? `Đã cập nhật ${rosterProgress.ready}/${rosterProgress.total} lớp` : `CHƯA CÓ · 0/${rosterProgress.total} lớp`) : scopedInputs[key] ? `Đã cập nhật · v${inputRecord?.activeVersion || 1}` : 'CHƯA CÓ'; return <article className={`${scopedInputs[key] ? 'input-card valid' : partiallyReady ? 'input-card partial' : 'input-card'} ${editing === key ? 'editing' : ''}`} key={key}>
        <div><span>{code}</span><b>{statusLabel}</b></div>
        <h3>{title}</h3>
        <p>Người cập nhật: {owner}</p>
        <div className="input-source"><small>Nguồn dữ liệu</small><strong>{key === 'material' ? 'Thư viện VTraining + link / file bổ sung' : key === 'roster' ? 'Excel lớp / học viên / nhóm' : 'Form VWork + file đính kèm'}</strong></div>
        <div className="input-impact"><b>{impactedTasks.filter((task) => task.status === 'WAITING_INPUT').length} việc bị chặn</b><span>{blockedClasses} lớp liên quan</span></div>
        {rosterProgress && <div className="roster-class-progress"><div><b>Danh sách học viên theo lớp</b><span>{rosterProgress.ready}/{rosterProgress.total} đã cập nhật</span></div>{rosterProgress.rows.map(({ classItem, input, ready }) => <div className={ready ? 'ready' : ''} key={classItem.id}><span>{ready ? '✓' : '○'}</span><b>{classItem.code}</b><small>{ready ? `Đã cập nhật · v${input.activeVersion}` : 'Chưa tải danh sách'}</small></div>)}</div>}
        {key === 'roster'
          ? scopedInputRecords.filter((item) => item.key === key && item.status === 'ACTIVE').map((record) => <InputVersionSnapshot key={record.id} inputRecord={record} role={role} label={scopedClasses.find((item) => item.id === record.classId)?.code || record.classId}/>)
          : activeVersion && <InputVersionSnapshot inputRecord={inputRecord} role={role}/>}
        {canSubmit.includes(key) && editing !== key && <button className={scopedInputs[key] ? '' : 'primary'} onClick={() => beginEdit(key)}>{scopedInputs[key] ? 'Tải lại & chỉnh sửa' : `Cập nhật ${title}`}</button>}
        {scopedInputs[key] && editing !== key && <div className="input-updated"><b>{rosterProgress ? `Đủ danh sách ${rosterProgress.ready}/${rosterProgress.total} lớp` : `Input v${inputRecord?.activeVersion || 1} đã sẵn sàng`}</b><small>{rosterProgress ? 'Khóa chỉ được tính đã cập nhật khi tất cả lớp đều có danh sách.' : 'Dữ liệu hiện tại sẽ được tải vào form khi chỉnh sửa.'}</small></div>}
        {editing === key && <div className="input-editor">
          <div className="input-editor-fields">{(INPUT_FIELDS[key] || []).map((field) => key === 'game' && field.key === 'game_content'
            ? <GameContentFields key={field.key} count={Number(drafts[key]?.game_count ?? defaultFieldValue(key, INPUT_FIELDS.game[0]))} values={drafts[key]?.game_contents || []} onCount={(count) => patchDraft(key, { game_count: String(count) })} onChange={(values) => patchDraft(key, { game_contents: values })}/>
            : <label key={field.key}>{field.label}{!field.required && <small> · tùy chọn</small>}<input type={field.type || 'text'} min={field.type === 'number' ? '0' : undefined} step={field.type === 'number' ? '1' : undefined} value={drafts[key]?.[field.key] ?? defaultFieldValue(key, field)} onChange={(event) => patchDraft(key, { [field.key]: event.target.value })}/></label>)}</div>
          <label className="file-field">File đính kèm {key === 'material' ? 'hoặc dùng link ở trên' : 'tùy chọn'} · mọi định dạng, tối đa 25 MB<input type="file" onChange={(event) => { const file = event.target.files?.[0]; patchDraft(key, file && file.size <= MAX_UPLOAD_BYTES ? { file, fileName: file.name, fileError: '' } : { file: null, fileName: '', fileError: 'File vượt quá giới hạn 25 MB.' }); }}/></label>
          {drafts[key]?.fileError && <small className="field-hint error">{drafts[key].fileError}</small>}
          {drafts[key]?.fileName && <div className="file-summary"><div><b>{drafts[key].fileName}</b><small>Đã cập nhật vào bản nháp · chờ xác nhận</small></div><button onClick={() => patchDraft(key, { fileName: '', file: null })}>Xóa file</button></div>}
          {previewing && <div className="input-preview"><b>Xác nhận Input v{(inputRecord?.activeVersion || 0) + 1}</b><span>{key === 'game' ? `${inputData(key).game_count} game` : `${(INPUT_FIELDS[key] || []).length} trường thông tin`} · {drafts[key]?.fileName ? '01 file đính kèm' : 'không có file'}</span><small>Có thể quay lại chỉnh form hoặc thay file trước khi xác nhận.</small></div>}
          <div className="input-editor-actions"><button onClick={() => { setEditing(''); setPreviewing(false); }}>Hủy</button>{!previewing ? <button disabled={hasMissingRequired(key)} onClick={() => setPreviewing(true)}>Kiểm tra & xem trước</button> : <button className="primary" disabled={hasMissingRequired(key)} onClick={() => confirm(key)}>Xác nhận cập nhật</button>}</div>
        </div>}
      </article>; })}
    </div>
    </section>
  </div>;
}

function inputFieldLabel(inputKey, fieldKey) {
  const common = { importMode: 'Cách nhập', fileName: 'Tên file', fileSize: 'Dung lượng', contentType: 'Định dạng' };
  return (INPUT_FIELDS[inputKey] || []).find((item) => item.key === fieldKey)?.label || common[fieldKey] || fieldKey.replaceAll('_', ' ');
}

function inputFieldValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '—');
}

function InputVersionSnapshot({ inputRecord, role, label = '' }) {
  const [opening, setOpening] = useState('');
  const [openError, setOpenError] = useState('');
  const version = inputRecord?.versions?.find((item) => item.version === inputRecord.activeVersion);
  if (!version) return null;
  const fields = Object.entries(version.data || {}).filter(([, value]) => value !== '' && value !== null && value !== undefined);
  async function openFile(file) {
    if (!file?.path || opening) return;
    setOpening(file.path);
    setOpenError('');
    try {
      const url = await getTrainingOperationsFileUrl(file.path, file.name, role);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setOpenError(error.message || 'Không thể mở file input.');
    } finally {
      setOpening('');
    }
  }
  return <div className="input-current-version">
    <div className="input-current-version-head"><b>{label ? `${label} · ` : ''}Phiên bản {version.version}</b><span>{formatDate(version.effectiveAt || version.submittedAt)}</span></div>
    {fields.length > 0 && <dl>{fields.map(([key, value]) => <div key={key}><dt>{inputFieldLabel(inputRecord.key, key)}</dt><dd>{/^https?:\/\//i.test(String(value)) ? <a href={String(value)} target="_blank" rel="noreferrer">{String(value)}</a> : inputFieldValue(value)}</dd></div>)}</dl>}
    {(version.files || []).length > 0 && <div className="input-version-files">{version.files.map((file) => <button type="button" key={file.path || file.id || file.name} disabled={opening === file.path} onClick={() => void openFile(file)}>{opening === file.path ? 'Đang mở…' : `Mở file · ${file.name || 'Tệp đính kèm'}`}</button>)}</div>}
    {!fields.length && !(version.files || []).length && <small className="input-empty-version">Phiên bản này không có dữ liệu chi tiết hoặc file đính kèm.</small>}
    {openError && <small className="field-hint error">{openError}</small>}
  </div>;
}

function GameContentFields({ count, values, onCount, onChange }) {
  const safeCount = Number.isInteger(count) && count >= 0 ? count : 0;
  const patchValue = (index, value) => {
    const next = [...values];
    while (next.length <= index) next.push('');
    next[index] = value;
    onChange(next);
  };
  return <fieldset className="game-content-fields">
    <legend>Nội dung / link từng game</legend>
    <div className="game-count-controls"><button type="button" aria-label="Bớt một game" disabled={safeCount === 0} onClick={() => onCount(Math.max(0, safeCount - 1))}>−</button><span>{safeCount} game</span><button type="button" aria-label="Thêm một game" onClick={() => onCount(safeCount + 1)}>+</button></div>
    {safeCount === 0 ? <p>Không có game trong phiên bản này. Nội dung đã nhập trước đó vẫn được giữ trong bản nháp nếu tăng lại số lượng.</p> : Array.from({ length: safeCount }, (_, index) => <label key={index}>Game {index + 1}<input value={values[index] || ''} onChange={(event) => patchValue(index, event.target.value)} placeholder={`Nội dung hoặc link game ${index + 1}`}/></label>)}
  </fieldset>;
}
function SaleRosterInputs({ courses = [], classes = [], inputRecords = [], setUploadStep, submit }) {
  const [drafts, setDrafts] = useState({});
  const [confirmingClassId, setConfirmingClassId] = useState('');
  function readFile(classId, nextFile) {
    if (!nextFile) return;
    if (nextFile.size > MAX_UPLOAD_BYTES) {
      setDrafts((current) => ({ ...current, [classId]: { file: null, error: 'File vượt quá giới hạn 25 MB.' } }));
      return;
    }
    setDrafts((current) => ({ ...current, [classId]: { file: nextFile, validation: { valid: true, errors: [], warnings: [] }, data: { importMode: 'unvalidated_file', fileName: nextFile.name, fileSize: nextFile.size, contentType: nextFile.type || 'application/octet-stream' } } }));
    setUploadStep(2);
  }
  function resetFile(classId) { setDrafts((current) => ({ ...current, [classId]: null })); setUploadStep(0); }
  async function confirmFile(classItem, inputRecord) {
    const draft = drafts[classItem.id];
    if (!draft?.file || confirmingClassId) return;
    setConfirmingClassId(classItem.id);
    const response = await submit({ ...draft, inputId: inputRecord?.id, courseId: classItem.courseId, classId: classItem.id });
    setConfirmingClassId('');
    if (response) { setDrafts((current) => ({ ...current, [classItem.id]: null })); setUploadStep(3); }
  }
  return <section className="card full">
    <div className="page-title"><div><small>SALE INPUT WORKSPACE · THEO KHÓA HỌC</small><h2>Việc của tôi · cập nhật danh sách lớp</h2><p>Mỗi khóa có lịch lớp và hàng đợi tải danh sách riêng. Chấp nhận mọi định dạng file, lưu nguyên trạng, tối đa 25 MB.</p></div><span className="permission-note">PHẠM VI SALE</span></div>
    <div className="sale-course-list">{courses.map((courseItem) => { const courseClasses = classes.filter((item) => item.courseId === courseItem.id).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate))); const uploadedCount = courseClasses.filter((classItem) => inputRecords.some((record) => record.classId === classItem.id && record.key === 'roster' && record.status === 'ACTIVE')).length; return <section className="sale-course-section" key={courseItem.id}>
      <div className="sale-course-head"><div><small>{courseItem.id}</small><h3>{courseItem.name}</h3><p>{courseClasses.length} lớp trong khóa</p></div><strong>{uploadedCount}/{courseClasses.length}<small> danh sách đã có</small></strong></div>
      {courseClasses.length ? <><div className="sale-class-schedule"><b>Lịch lớp</b>{courseClasses.map((classItem) => <span key={classItem.id}><strong>{classItem.code}</strong>{formatDate(classItem.startDate)} — {formatDate(classItem.endDate)}</span>)}</div>
      <div className="sale-roster-grid">{courseClasses.map((classItem) => { const inputRecord = inputRecords.find((item) => item.classId === classItem.id && item.key === 'roster'); const uploaded = inputRecord?.status === 'ACTIVE'; const draft = drafts[classItem.id]; return <article className={uploaded ? 'input-card valid' : 'input-card'} key={classItem.id}>
        <div><span>{classItem.code}</span><b>{uploaded ? `Đã cập nhật · V${inputRecord.activeVersion}` : 'CHƯA CÓ'}</b></div><h3>{classItem.name}</h3><p>Khai giảng: {formatDate(classItem.startDate)}</p>
        <div className="input-source"><small>Dữ liệu được phép cập nhật</small><strong>File danh sách học viên · không yêu cầu mẫu cố định</strong></div>
        <div className="upload-flow">
          {!draft?.file ? <label className="file-field">{uploaded ? 'Thay file danh sách' : 'Chọn file danh sách'}<input type="file" onChange={(event) => readFile(classItem.id, event.target.files?.[0])}/></label> : <div className="file-summary"><div><b>{draft.file.name}</b><small>Đã chọn · không kiểm duyệt format</small></div><button onClick={() => resetFile(classItem.id)}>Thay file</button></div>}
          {draft?.error && <small className="field-hint error">{draft.error}</small>}
          {draft?.file && <><div className="roster-preview"><b>Sẵn sàng xác nhận cho đúng lớp</b><span>Hệ thống lưu nguyên file; không đọc cấu trúc để suy đoán lớp.</span></div><button className="primary" disabled={Boolean(confirmingClassId)} onClick={() => void confirmFile(classItem, inputRecord)}>{confirmingClassId === classItem.id ? 'Đang tải lên…' : uploaded ? 'Xác nhận phiên bản mới' : 'Xác nhận danh sách lớp'}</button></>}
        </div>
      </article>; })}</div></> : <div className="empty course-empty"><strong>Khóa học chưa có lớp</strong><p>Quản lý vận hành cần tạo lớp trước khi Sale tải danh sách.</p></div>}
    </section>; })}</div>
  </section>;
}

function WorkflowGroups({ role, tasks, classes = CLASS_META, directory = [], updateTask, groupManagers, assignGroupManager, classCode, setClassCode }) {
  const groups = ['prepare', 'setup', 'live'];
  const activeClass = classes.find((item) => item.code === classCode) || classes[0] || CLASS_META[0];
  function updateDue(id, dueOffset) { void updateTask(id, { dueOffset }); }
  function toggleEnabled(id) { const task = tasks.find((item) => item.id === id); void updateTask(id, { status: task?.status === 'CANCELLED' ? 'WAITING_INPUT' : 'CANCELLED' }); }
  return <section className="card full"><div className="page-title"><div><small>VTRAINING WORKFLOW · CÔNG VIỆC THEO LỚP</small><h2>Nhóm công việc → task → checklist</h2><p>Chọn đúng lớp trước khi giao nhóm, đổi deadline hoặc tùy chỉnh task.</p></div><label className="workflow-class-picker">Lớp đang cấu hình<select value={classCode} onChange={(event) => setClassCode(event.target.value)}>{classes.map((item) => <option value={item.code} key={item.code}>{item.code} · {item.name}</option>)}</select></label></div><div className="deadline-anchor"><div><small>MỐC LỊCH LỚP</small><b>Khai giảng {activeClass.name} · {formatDate(activeClass.startDate)}</b></div><span>Khởi tạo: trước lớp 2 ngày</span><span>Học viên: trước lớp 1 ngày</span></div><div className="workflow-groups">{groups.map((group) => { const groupTasks = tasks.filter((task) => task.group === group && task.classCode === classCode); const currentManagerId = directory.find((item) => directoryHasRole(item, 'manager') && item.name === groupManagers[`${classCode}:${group}`])?.id || ''; return <article className="workflow-group" key={group}><div className="workflow-group-head"><div><span>{GROUP_META[group][0]} · {classCode}</span><h3>{GROUP_META[group][1]}</h3><p>{groupTasks.length} công việc · {groupTasks.reduce((sum, task) => sum + task.checklistItems.length, 0)} checklist</p></div><label>Quản lý ekip<select value={currentManagerId} disabled={role !== 'operations'} onChange={(event) => assignGroupManager(group, event.target.value, classCode)}><option value="">Chưa giao</option>{directory.filter((item) => directoryHasRole(item, 'manager')).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div><div className="workflow-task-list">{groupTasks.map((task) => <div className={task.status === 'CANCELLED' ? 'workflow-task disabled' : 'workflow-task'} key={task.id}><label className="task-enable"><input type="checkbox" checked={task.status !== 'CANCELLED'} disabled={!['operations', 'vtraining'].includes(role)} onChange={() => toggleEnabled(task.id)}/></label><div><b>{task.title}</b><small>{task.id} · {task.checklistItems.length} tiêu chí bắt buộc</small></div><label>Deadline<select value={task.dueOffset} disabled={!['operations', 'vtraining'].includes(role)} onChange={(event) => updateDue(task.id, Number(event.target.value))}><option value="3">Trước lớp 3 ngày</option><option value="2">Trước lớp 2 ngày</option><option value="1">Trước lớp 1 ngày</option><option value="0">Ngày chạy lớp</option></select></label></div>)}</div></article>; })}</div><div className="deferred-note"><b>VLearning</b><span>Bài tập VLearning đã được quản lý bằng input D04 và task T-108; cấu hình chuyên sâu tiếp tục thực hiện tại VLearning theo mã nguồn tham chiếu.</span></div></section>;
}

function LegacyLayeredTasks({ role, tasks, classes = CLASS_META, directory = [], actor, project, course, selectedTask, setSelectedTaskId, updateTask, assignTasks, toggleChecklist }) {
  const [layer, setLayer] = useState('projects');
  const [classCode, setClassCode] = useState(classes[0]?.code || CLASS_META[0].code);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAssignee, setBulkAssignee] = useState('');
  const baseTasks = tasks;
  const members = directory.filter((item) => item.active !== false);
  const reviewerId = actor?.role === 'manager' ? actor.id : directory.find((item) => directoryHasRole(item, 'manager'))?.id;
  const activeClass = classes.find((item) => item.code === classCode) || classes[0] || CLASS_META[0];
  const classTasks = baseTasks.filter((task) => task.classCode === classCode);
  const activeTask = classTasks.find((task) => task.id === selectedTask?.id) || classTasks[0];
  const groups = Object.keys(GROUP_META).map((group) => [group, classTasks.filter((task) => task.group === group)]).filter(([, items]) => items.length);

  function openClass(code) {
    setClassCode(code);
    setLayer('detail');
    setSelectedIds([]);
    const firstTask = baseTasks.find((task) => task.classCode === code);
    if (firstTask) setSelectedTaskId(firstTask.id);
  }
  function toggleSelected(id) { setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function assignSelected() {
    void assignTasks(selectedIds, bulkAssignee, reviewerId);
    setSelectedIds([]);
  }

  return <section className="layered-task-browser">
    <div className="card full layered-browser">
      <div className="page-title">
        <div><small>CÔNG VIỆC · ĐIỀU HƯỚNG NHIỀU TẦNG</small><h2>{layer === 'projects' ? 'Danh sách dự án' : layer === 'courses' ? 'Các khóa học thuộc dự án' : layer === 'classes' ? 'Các lớp thuộc khóa học' : `Công việc · ${activeClass.name}`}</h2><p>Mở từng tầng để đi đến đúng lớp; nội dung tầng trước không hiển thị chung với tầng sau.</p></div>
        <nav className="layer-breadcrumb" aria-label="Điều hướng công việc phân tầng">
          <button className={layer === 'projects' ? 'active' : ''} onClick={() => setLayer('projects')}>Dự án</button>
          {layer !== 'projects' && <><span>/</span><button className={layer === 'courses' ? 'active' : ''} onClick={() => setLayer('courses')}>{project?.code}</button></>}
          {['classes', 'detail'].includes(layer) && <><span>/</span><button className={layer === 'classes' ? 'active' : ''} onClick={() => setLayer('classes')}>{course?.name}</button></>}
          {layer === 'detail' && <><span>/</span><b>{activeClass.code}</b></>}
        </nav>
      </div>

      {layer === 'projects' && <div className="layer-list"><div className="layer-table-head project-layer"><span>Dự án</span><span>Khách hàng</span><span>Khóa học</span><span>Trạng thái</span></div><button className="layer-row project-layer" onClick={() => setLayer('courses')}><div><b>{project?.name}</b><small>{project?.code} · {formatDate(project?.startDate)} — {formatDate(project?.deadline)}</small></div><span>{project?.customerName}</span><span>01 khóa học</span><em>Đang chuẩn bị</em></button></div>}

      {layer === 'courses' && <div className="layer-list"><div className="layer-table-head"><span>Khóa học</span><span>Hệ thống</span><span>Lớp</span><span>Trạng thái</span></div><button className="layer-row" onClick={() => setLayer('classes')}><div><b>{course?.name}</b><small>{course?.code} · {course?.contentVersion}</small></div><span>{(course?.systems || []).join(' · ')}</span><span>{String(classes.length).padStart(2, '0')} lớp</span><em>Đang chuẩn bị</em></button></div>}

      {layer === 'classes' && <div className="layer-list"><div className="layer-table-head class-layer"><span>Lớp</span><span>Thời gian</span><span>Công việc</span><span>Trạng thái</span></div>{classes.map((item) => { const items = baseTasks.filter((task) => task.classCode === item.code); const done = items.filter((task) => task.status === 'DONE').length; return <button className="layer-row class-layer" onClick={() => openClass(item.code)} key={item.code}><div><b>{item.name}</b><small>{item.code} · clone từ Lớp mẫu</small></div><span>{formatDate(item.startDate)} — {formatDate(item.endDate)}</span><span>{items.length} công việc</span><em>{done}/{items.length} hoàn thành</em></button>; })}</div>}
    </div>

    {layer === 'detail' && <div className="task-layout layered-task-detail"><section className="card task-table"><div className="class-detail-head"><div><span>{activeClass.code}</span><h3>{activeClass.name}</h3><p>Dự án EVNSPC 2026 / Trải nghiệm khách hàng / {activeClass.code}</p></div><button onClick={() => setLayer('classes')}>← Danh sách lớp</button></div>{role === 'manager' && <div className="bulk-assign"><label><input type="checkbox" checked={selectedIds.length === classTasks.length && classTasks.length > 0} onChange={() => setSelectedIds(selectedIds.length === classTasks.length ? [] : classTasks.map((task) => task.id))}/> Chọn tất cả</label><span>{selectedIds.length} việc đã chọn</span><select value={bulkAssignee} onChange={(event) => setBulkAssignee(event.target.value)}><option value="">Chọn CTV</option>{members.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><button className="primary" disabled={!selectedIds.length || !bulkAssignee || !reviewerId} onClick={assignSelected}>Giao cho CTV</button></div>}<div className={role === 'manager' ? 'table-head with-select' : 'table-head'}>{role === 'manager' && <span>Chọn</span>}<span>Công việc</span><span>Input</span><span>Deadline</span><span>Trạng thái</span></div>{groups.map(([group, items]) => <div className="task-group" key={group}><div className="task-group-title"><b>{GROUP_META[group][0]} · {GROUP_META[group][1]}</b><span>{items.length} việc</span></div>{items.map((task) => <div className={`${selectedTask.id === task.id ? 'task-row selected' : 'task-row'} ${role === 'manager' ? 'with-select' : ''}`} key={task.id}>{role === 'manager' && <label className="row-check"><input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => toggleSelected(task.id)} aria-label={`Chọn ${task.title}`}/></label>}<button className="task-open" onClick={() => setSelectedTaskId(task.id)}><b>{task.title}</b><small>{GROUP_META[task.group][0]} · {task.id} · {task.assignee}</small></button><span>{taskReadinessLabel(task)}</span><span>{dueLabel(task.startDate, task.dueOffset, task.dueDirection, task.anchorType)}</span><span className={`badge ${task.status}`}>{STATUS_LABEL[task.status]}</span></div>)}</div>)}</section><TaskDrawer role={role} task={selectedTask} directory={directory} actor={actor} updateTask={updateTask} toggleChecklist={toggleChecklist}/></div>}
  </section>;
}

function LayeredTasks({ role, tasks, classes = CLASS_META, directory = [], teamAssignments = [], directoryLoading = false, actor, project, course, routeContext, onNavigate, selectedTask, setSelectedTaskId, updateTask, createClassTask, moveClassTask, archiveTask, assignTasks, toggleChecklist }) {
  const layerFromRoute = () => routeContext.classId ? 'detail' : 'classes';
  const [layer, setLayer] = useState(layerFromRoute);
  const [classCode, setClassCode] = useState(routeContext.classId || classes[0]?.code || CLASS_META[0].code);
  const [selectedIds, setSelectedIds] = useState([]);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const baseTasks = tasks.filter((task) => !task.archivedAt);
  const canAssign = ['manager', 'operations'].includes(role);
  const canConfigure = ['operations', 'vtraining', 'manager'].includes(role);
  const courseManagerAssignment = teamAssignments.find((item) => item.courseId === course?.id && item.role === 'manager' && item.status !== 'ARCHIVED');
  const courseManager = directory.find((item) => directoryMatchesIdentity(item, courseManagerAssignment?.accountId, courseManagerAssignment?.accountEmail, courseManagerAssignment?.accountName))
    || (courseManagerAssignment ? {
      id: courseManagerAssignment.accountId || courseManagerAssignment.accountEmail,
      name: courseManagerAssignment.accountName || courseManagerAssignment.accountEmail || courseManagerAssignment.accountId,
      email: courseManagerAssignment.accountEmail || '',
      roles: ['manager'],
    } : null);
  const reviewerId = courseManager?.id;
  const activeClass = classes.find((item) => [item.id, item.code].includes(classCode)) || classes[0] || CLASS_META[0];
  const classTasks = baseTasks.filter((task) => task.classId === activeClass.id || task.classCode === activeClass.code).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.id).localeCompare(String(b.id)));
  const groups = Object.keys(GROUP_META).map((group) => [group, classTasks.filter((task) => task.group === group)]).filter(([, items]) => items.length);

  useEffect(() => {
    setLayer(layerFromRoute());
    if (routeContext.classId) setClassCode(routeContext.classId);
    if (routeContext.taskId && baseTasks.some((task) => task.id === routeContext.taskId)) setSelectedTaskId(routeContext.taskId);
  }, [routeContext.projectId, routeContext.courseId, routeContext.classId, routeContext.taskId]);

  function showClasses() { setLayer('classes'); setSelectedTaskId(''); onNavigate({ projectId: project?.id, courseId: course?.id }); }
  function openClass(item) {
    setClassCode(item.id || item.code);
    setLayer('detail');
    setSelectedIds([]);
    setSelectedTaskId('');
    onNavigate({ projectId: project?.id, courseId: course?.id, classId: item.id || item.code });
  }
  function openTask(task) {
    setSelectedTaskId(task.id);
    onNavigate({ projectId: task.projectId, courseId: task.courseId, classId: task.classId || task.classCode, taskId: task.id });
  }
  function closeTask() {
    const closingId = selectedTask?.id;
    setSelectedTaskId('');
    onNavigate({ projectId: project?.id, courseId: course?.id, classId: activeClass.id || activeClass.code }, { replace: true });
    window.setTimeout(() => document.querySelector(`[data-task-id="${closingId}"]`)?.focus(), 0);
  }
  function toggleSelected(id) { setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  async function assignSelected(person) {
    if (!reviewerId) return;
    const response = await assignTasks(selectedIds, person.id, reviewerId);
    if (response) {
      setSelectedIds([]);
      setAssignmentOpen(false);
    }
  }
  function moveTask(task, direction) {
    void moveClassTask(task.id, direction);
  }

  return <section className="layered-task-browser">
    <div className="card full layered-browser">
      <div className="page-title">
        <div><small>CÔNG VIỆC · THEO LỚP</small><h2>{layer === 'classes' ? 'Chọn lớp để xem công việc' : `Công việc · ${activeClass.name}`}</h2><p>Vào thẳng danh sách lớp; cấu trúc dự án và khóa học được quản lý tại Tổng quan dự án.</p></div>
        <nav className="layer-breadcrumb" aria-label="Khóa học, Lớp, Công việc">
          <button className={layer === 'classes' ? 'active' : ''} onClick={showClasses}>{course?.name}</button>
          {layer === 'detail' && <><span>/</span><button onClick={showClasses}>{activeClass.code}</button><span>/</span><b>Công việc</b></>}
        </nav>
      </div>
      {layer === 'classes' && <div className="layer-list"><div className="layer-table-head class-layer"><span>Lớp</span><span>Thời gian</span><span>Công việc</span><span>Trạng thái</span></div>{classes.map((item) => { const items = baseTasks.filter((task) => task.classId === item.id || task.classCode === item.code); const done = items.filter((task) => task.status === 'DONE').length; return <button className="layer-row class-layer" onClick={() => openClass(item)} key={item.id || item.code}><div><b>{item.name}</b><small>{item.code} · clone từ Lớp mẫu</small></div><span>{formatDate(item.startDate)} — {formatDate(item.endDate)}</span><span>{items.length} công việc</span><em>{done}/{items.length} hoàn thành</em></button>; })}</div>}
    </div>

    {layer === 'detail' && <div className="task-layout layered-task-detail"><section className="card task-table">
      <div className="class-detail-head"><div><span>{activeClass.code}</span><h3>{activeClass.name}</h3><p>{project?.name} / {course?.name} / {activeClass.code} / Công việc</p></div><div className="class-detail-actions"><button onClick={showClasses}>← Danh sách lớp</button>{canConfigure && <button className="primary icon-button-label" onClick={() => setShowAddTask((value) => !value)}><Plus size={15}/>Thêm công việc</button>}</div></div>
      {showAddTask && (
        <TaskCreateForm
          classItem={activeClass}
          managerName={courseManager?.name || courseManagerAssignment?.accountName}
          onCancel={() => setShowAddTask(false)}
          onSubmit={async (draft) => {
            const response = await createClassTask(activeClass.id || activeClass.code, draft);
            if (response) setShowAddTask(false);
          }}
        />
      )}
      {canAssign && <div className="bulk-assign"><label><input type="checkbox" checked={selectedIds.length === classTasks.length && classTasks.length > 0} onChange={() => setSelectedIds(selectedIds.length === classTasks.length ? [] : classTasks.map((task) => task.id))}/> Chọn tất cả</label><span>{selectedIds.length} việc đã chọn</span><button className="primary" disabled={!selectedIds.length || !reviewerId} onClick={() => setAssignmentOpen(true)}>Giao việc</button></div>}
      <div className={`${canAssign ? 'table-head with-select' : 'table-head'}${canConfigure ? ' with-actions' : ''}`}>{canAssign && <span>Chọn</span>}<span>Công việc</span><span>Input</span><span>Deadline</span><span>Trạng thái</span>{canConfigure && <span>Thao tác</span>}</div>
      {!classTasks.length && <div className="empty"><strong>Chưa có công việc</strong><p>{canConfigure ? 'Thêm công việc đầu tiên cho lớp này.' : 'Không có công việc trong phạm vi hiện tại.'}</p></div>}
      {groups.map(([group, items]) => <div className="task-group" key={group}><div className="task-group-title"><b>{GROUP_META[group][0]} · {GROUP_META[group][1]}</b><span>{items.length} việc</span></div>{items.map((task, taskIndex) => <div className={`${selectedTask?.id === task.id ? 'task-row selected' : 'task-row'} ${canAssign ? 'with-select' : ''}${canConfigure ? ' with-actions' : ''}`} key={task.id}>{canAssign && <label className="row-check"><input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => toggleSelected(task.id)} aria-label={`Chọn ${task.title}`}/></label>}<button className="task-open" data-task-id={task.id} onClick={() => openTask(task)}><b>{task.title}</b><small>{GROUP_META[task.group][0]} · {task.id} · {task.assignee}</small></button><span>{taskReadinessLabel(task)}</span><span>{dueLabel(task.startDate, task.dueOffset, task.dueDirection, task.anchorType)}</span><span className={`badge ${task.status}`}>{STATUS_LABEL[task.status]}</span>{canConfigure && <div className="task-row-actions"><button type="button" title="Sửa công việc" aria-label={`Sửa ${task.title}`} onClick={() => openTask(task)}><Pencil size={14}/></button><button type="button" title="Di chuyển lên" aria-label={`Di chuyển ${task.title} lên`} disabled={taskIndex === 0} onClick={() => moveTask(task, 'UP')}><ArrowUp size={14}/></button><button type="button" title="Di chuyển xuống" aria-label={`Di chuyển ${task.title} xuống`} disabled={taskIndex === items.length - 1} onClick={() => moveTask(task, 'DOWN')}><ArrowDown size={14}/></button></div>}</div>)}</div>)}
    </section>{selectedTask && <TaskDrawer role={role} task={selectedTask} directory={directory} directoryLoading={directoryLoading} courseManager={courseManager} actor={actor} updateTask={updateTask} archiveTask={archiveTask} toggleChecklist={toggleChecklist} onClose={closeTask}/>}</div>}
    <AssigneePickerDialog open={assignmentOpen} directory={directory} loading={directoryLoading} taskCount={selectedIds.length} onClose={() => setAssignmentOpen(false)} onSelect={(person) => void assignSelected(person)}/>
  </section>;
}

function TaskCreateForm({ classItem, managerName, onCancel, onSubmit }) {
  const [draft, setDraft] = useState({ title: '', group: 'setup', inputKey: 'roster', dueOffset: 2, checklistText: '' });
  const checklistItems = draft.checklistText.split('\n').map((item) => item.trim()).filter(Boolean);
  const valid = Boolean(draft.title.trim() && checklistItems.length && managerName);
  return <form className="task-create-form" onSubmit={(event) => { event.preventDefault(); if (valid) void onSubmit({ ...draft, title: draft.title.trim(), checklistItems }); }}>
    <div><span><b>Thêm công việc cho {classItem.code}</b><small>Người xác nhận: {managerName || 'Chưa gán Quản lý ekip'}</small></span><button type="button" onClick={onCancel}>Đóng</button></div>
    <div className="form-grid"><label>Tên công việc<input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}/></label><label>Nhóm<select value={draft.group} onChange={(event) => setDraft((current) => ({ ...current, group: event.target.value }))}>{Object.entries(GROUP_META).map(([value, [, label]]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Input cần có<select value={draft.inputKey} onChange={(event) => setDraft((current) => ({ ...current, inputKey: event.target.value }))}>{Object.entries(INPUT_META).map(([value, [code, label]]) => <option value={value} key={value}>{code} · {label}</option>)}</select></label><label>Deadline trước lớp (ngày)<input type="number" min="0" step="1" value={draft.dueOffset} onChange={(event) => setDraft((current) => ({ ...current, dueOffset: Number(event.target.value) }))}/></label><label className="wide">Người xác nhận<input value={managerName || 'Chưa gán Quản lý ekip'} readOnly aria-invalid={!managerName}/>{!managerName && <small className="hint error">Hãy vào Gán vai trò và chọn Quản lý ekip cho khóa học trước khi tạo công việc.</small>}</label><label className="wide">Checklist, mỗi dòng một tiêu chí<textarea rows="4" value={draft.checklistText} onChange={(event) => setDraft((current) => ({ ...current, checklistText: event.target.value }))}/></label></div>
    <div className="task-create-actions"><button type="button" onClick={onCancel}>Hủy</button><button className="primary" disabled={!valid}>Lưu công việc</button></div>
  </form>;
}

function AssigneePickerDialog({ open, directory, loading, taskCount, selectedId = '', onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const [chosenId, setChosenId] = useState(selectedId);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const previousFocus = useRef(null);
  const recentIds = useMemo(() => {
    try { return JSON.parse(window.localStorage.getItem('vwork-recent-assignees') || '[]'); } catch { return []; }
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement;
    setChosenId(selectedId);
    setQuery('');
    window.setTimeout(() => inputRef.current?.focus(), 0);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus.current?.focus?.(); };
  }, [open, selectedId]);
  if (!open) return null;
  const token = normalizeSearchText(query);
  const filtered = directory.filter((item) => !token || normalizeSearchText(`${item.name} ${item.email || item.id}`).includes(token));
  const recent = recentIds.map((id) => directory.find((item) => item.id === id)).filter(Boolean);
  const chosenPerson = directory.find((item) => item.id === chosenId);
  const selectPerson = () => {
    const person = chosenPerson;
    if (!person) return;
    const nextRecent = [person.id, ...recentIds.filter((id) => id !== person.id)].slice(0, 5);
    window.localStorage.setItem('vwork-recent-assignees', JSON.stringify(nextRecent));
    onSelect(person);
  };
  const PersonRow = ({ person }) => <label className="assignee-person"><input type="radio" name="assignee" checked={chosenId === person.id} onChange={() => setChosenId(person.id)} aria-label={`${person.name} · ${person.email || person.id}`}/><span><b>{person.name}</b><small>{person.email || person.id}</small></span></label>;
  return renderTrainingOverlay(<div className="assignment-dialog-backdrop" onMouseDown={onClose}><section ref={dialogRef} className="assignment-dialog" role="dialog" aria-modal="true" aria-labelledby="assignment-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-head"><div><small>PHÂN CÔNG THEO DIRECTORY</small><h2 id="assignment-dialog-title">Bạn muốn giao việc cho ai?</h2></div><button type="button" aria-label="Đóng popup giao việc" onClick={onClose}>×</button></div>
    <div className="assignment-dialog-body"><label className="assignee-search">Tìm theo tên hoặc email<input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập tên hoặc email…"/></label><p>Mỗi công việc hiện hỗ trợ một người thực hiện; lựa chọn này áp dụng cho {taskCount || 1} công việc đã chọn.</p>
      {!query && recent.length > 0 && <div className="assignee-section"><b>Đã chọn gần đây</b>{recent.map((person) => <PersonRow person={person} key={`recent-${person.id}`}/>)}</div>}
      <div className="assignee-section"><b>Tài khoản có thể nhận việc</b>{loading ? <div className="assignee-state">Đang tải danh mục tài khoản…</div> : !filtered.length ? <div className="assignee-state">{directory.length ? 'Không tìm thấy tài khoản phù hợp.' : 'Chưa có tài khoản VWork.'}</div> : filtered.map((person) => <PersonRow person={person} key={person.id}/>)}</div>
    </div>
    <div className="modal-actions"><button type="button" onClick={onClose}>Hủy</button><button type="button" className="primary" disabled={!chosenPerson} onClick={selectPerson}>Giao việc</button></div>
  </section></div>);
}

function Tasks({ role, tasks, directory = [], actor, project, course, selectedTask, setSelectedTaskId, updateTask, assignTasks, toggleChecklist, view = 'due' }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAssignee, setBulkAssignee] = useState('');
  const baseVisible = tasks.filter((task) => !task.archivedAt);
  const reviewerId = actor?.role === 'manager' ? actor.id : directory.find((item) => directoryHasRole(item, 'manager'))?.id;
  const visible = view === 'due'
    ? [...baseVisible].filter((task) => !['DONE', 'CANCELLED'].includes(task.status)).sort((a, b) => dueDate(a) - dueDate(b)).slice(0, 7)
    : baseVisible;
  function toggleSelected(id) { setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function assignSelected() {
    void assignTasks(selectedIds, bulkAssignee, reviewerId);
    setSelectedIds([]);
  }
  return <div className="task-layout"><section className="card task-table">
    <div className="page-title"><div><small>TASK MANAGEMENT · {project?.code || project?.id || 'DỰ ÁN'} · {course?.code || course?.id || 'KHÓA HỌC'}</small><h2>{view === 'due' ? 'Việc sắp đến hạn' : 'Công việc'}</h2><p>Công việc trong đúng dự án, khóa học và lớp đang chọn.</p></div></div>
    {role === 'manager' && <div className="bulk-assign"><label><input type="checkbox" checked={selectedIds.length === visible.length && visible.length > 0} onChange={() => setSelectedIds(selectedIds.length === visible.length ? [] : visible.map((task) => task.id))}/> Chọn tất cả</label><span>{selectedIds.length} việc đã chọn</span><select value={bulkAssignee} onChange={(event) => setBulkAssignee(event.target.value)}><option value="">Chọn CTV</option>{directory.filter((item) => item.active !== false).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><button className="primary" disabled={!selectedIds.length || !bulkAssignee || !reviewerId} onClick={assignSelected}>Giao cho CTV</button></div>}
    <div className={role === 'manager' ? 'table-head with-select' : 'table-head'}>{role === 'manager' && <span>Chọn</span>}<span>Công việc</span><span>Input</span><span>Deadline</span><span>Trạng thái</span></div>
    {!visible.length && <div className="empty"><strong>Không có công việc trong phạm vi này</strong><p>Hãy kiểm tra lại dự án, khóa học hoặc lớp đang chọn.</p></div>}
    {!!visible.length && <div className="task-group"><div className="task-group-title"><b>{view === 'due' ? 'SẮP ĐẾN HẠN' : 'CÔNG VIỆC'}</b><span>{visible.length} việc</span></div>{visible.map((task) => <div className={`${selectedTask?.id === task.id ? 'task-row selected' : 'task-row'} ${role === 'manager' ? 'with-select' : ''}`} key={task.id}>{role === 'manager' && <label className="row-check"><input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => toggleSelected(task.id)} aria-label={`Chọn ${task.title} · ${task.classCode}`}/></label>}<button className="task-open" onClick={() => setSelectedTaskId(task.id)}><b>{task.title}</b><small>{project?.name || task.projectId} / {course?.name || task.courseId} / {task.classCode} / {GROUP_META[task.group]?.[0]} · {task.id} · {task.assignee}</small></button><span>{taskReadinessLabel(task)}</span><span>{dueLabel(task.startDate, task.dueOffset, task.dueDirection, task.anchorType)}</span><span className={`badge ${taskStatusClass(task)}`}>{taskStatusLabel(task)}</span></div>)}</div>}
  </section><TaskDrawer role={role} task={selectedTask} directory={directory} actor={actor} updateTask={updateTask} toggleChecklist={toggleChecklist}/></div>;
}

function LegacyTasks({ role, tasks, classes = CLASS_META, directory = [], actor, project, course, selectedTask, setSelectedTaskId, updateTask, assignTasks, toggleChecklist, view = 'hierarchy', onView }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [activeClassCode, setActiveClassCode] = useState(selectedTask?.classCode || classes[0]?.code || CLASS_META[0].code);
  const baseVisible = tasks;
  const members = directory.filter((item) => item.active !== false);
  const reviewerId = actor?.role === 'manager' ? actor.id : directory.find((item) => directoryHasRole(item, 'manager'))?.id;
  const classVisible = baseVisible.filter((task) => task.classCode === activeClassCode);
  const visible = view === 'due' ? [...baseVisible].filter((task) => !['DONE', 'CANCELLED'].includes(task.status)).sort((a, b) => dueDate(a) - dueDate(b)).slice(0, 7) : classVisible;
  const grouped = view === 'hierarchy'
    ? Object.keys(GROUP_META).map((group) => [GROUP_META[group][1], visible.filter((task) => task.group === group)]).filter(([, items]) => items.length)
    : [['Sắp đến hạn', visible]];
  function toggleSelected(id) { setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function chooseClass(classCode) {
    setActiveClassCode(classCode);
    setSelectedIds([]);
    const firstTask = baseVisible.find((task) => task.classCode === classCode);
    if (firstTask) setSelectedTaskId(firstTask.id);
  }
  function assignSelected() {
    void assignTasks(selectedIds, bulkAssignee, reviewerId);
    setSelectedIds([]);
  }
  return <div className="task-layout"><section className="card task-table"><div className="page-title"><div><small>{role === 'member' ? 'MY WORK' : 'TASK MANAGEMENT · THEO CẤU TRÚC VTRAINING'}</small><h2>{role === 'member' ? 'Việc của tôi' : view === 'due' ? 'Việc sắp đến hạn' : 'Công việc theo lớp'}</h2><p>{view === 'due' ? 'Ưu tiên deadline của các công việc thuộc từng lớp.' : 'Chọn lớp, sau đó quản lý và phân công theo từng nhóm việc trong lớp.'}</p></div>{role === 'manager' && <div className="task-view-tabs"><button className={view === 'hierarchy' ? 'active' : ''} onClick={() => onView('tasks')}>Công việc</button><button className={view === 'due' ? 'active' : ''} onClick={() => onView('due')}>Sắp đến hạn</button></div>}</div>{view === 'hierarchy' && <div className="task-scope-tree"><article><span>DỰ ÁN</span><b>EVNSPC 2026</b><small>01 khóa học</small></article><i></i><article><span>KHÓA HỌC</span><b>Trải nghiệm khách hàng</b><small>03 lớp</small></article><i></i><div className="task-class-tabs">{CLASS_META.map((classMeta) => <button className={activeClassCode === classMeta.code ? 'active' : ''} key={classMeta.code} onClick={() => chooseClass(classMeta.code)}><span>{classMeta.code}</span><b>{classMeta.name}</b><small>{baseVisible.filter((task) => task.classCode === classMeta.code).length} công việc</small></button>)}</div></div>}{role === 'manager' && <div className="bulk-assign"><label><input type="checkbox" checked={selectedIds.length === visible.length && visible.length > 0} onChange={() => setSelectedIds(selectedIds.length === visible.length ? [] : visible.map((task) => task.id))}/> Chọn tất cả</label><span>{selectedIds.length} việc đã chọn</span><select value={bulkAssignee} onChange={(event) => setBulkAssignee(event.target.value)}><option value="">Chọn CTV</option>{members.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><button className="primary" disabled={!selectedIds.length || !bulkAssignee || !reviewerId} onClick={assignSelected}>Giao cho CTV</button></div>}<div className={role === 'manager' ? 'table-head with-select' : 'table-head'}>{role === 'manager' && <span>Chọn</span>}<span>Công việc</span><span>Input</span><span>Deadline</span><span>Trạng thái</span></div>{grouped.map(([label, items]) => <div className="task-group" key={label}><div className="task-group-title"><b>{view === 'hierarchy' ? `${GROUP_META[items[0]?.group]?.[0]} · ${label}` : label}</b><span>{items.length} việc</span></div>{items.map((task) => <div className={`${selectedTask?.id === task.id ? 'task-row selected' : 'task-row'} ${role === 'manager' ? 'with-select' : ''}`} key={task.id}>{role === 'manager' && <label className="row-check"><input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => toggleSelected(task.id)} aria-label={`Chọn ${task.title} · ${task.classCode}`}/></label>}<button className="task-open" onClick={() => setSelectedTaskId(task.id)}><b>{task.title}</b><small>Dự án EVNSPC 2026 / Trải nghiệm khách hàng / {task.classCode} / {GROUP_META[task.group]?.[0]} · {task.id} · {task.assignee}</small></button><span>{taskReadinessLabel(task)}</span><span>{dueLabel(task.startDate, task.dueOffset, task.dueDirection, task.anchorType)}</span><span className={`badge ${task.status}`}>{STATUS_LABEL[task.status]}</span></div>)}</div>)}</section><TaskDrawer role={role} task={selectedTask} directory={directory} actor={actor} updateTask={updateTask} toggleChecklist={toggleChecklist}/></div>;
}
function TaskDrawer({ role, task, directory = [], directoryLoading = false, courseManager = null, actor, updateTask, archiveTask, toggleChecklist, onClose }) {
  const drawerRef = useRef(null);
  const [actualOutput, setActualOutput] = useState(task?.actualOutput || '');
  const [evidence, setEvidence] = useState(task?.evidence || '');
  const [evidenceRecord, setEvidenceRecord] = useState(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [uploadingChecklistIndex, setUploadingChecklistIndex] = useState(-1);
  const [evidenceError, setEvidenceError] = useState('');
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId || '');
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [priority, setPriority] = useState(task?.priority || 'Normal');
  const [plannedDeadline, setPlannedDeadline] = useState(task?.plannedDeadline || '');
  const [deadlineOverrideReason, setDeadlineOverrideReason] = useState('');
  const [blocker, setBlocker] = useState(task?.blocker || '');
  const [checklistEvidenceDraft, setChecklistEvidenceDraft] = useState(() => (task?.checklistEvidence || []).map((items) => items?.[0]?.url || items?.[0]?.fileUrl || items?.[0]?.path || items?.[0]?.id || ''));
  const [checklistEvidenceRecords, setChecklistEvidenceRecords] = useState(() => (task?.checklistEvidence || []).map((items) => items || []));
  const [configDraft, setConfigDraft] = useState({ title: task?.title || '', group: task?.group || 'setup', dueOffset: task?.dueOffset || 0, checklistText: (task?.checklistItems || []).join('\n') });
  useEffect(() => {
    setActualOutput(task?.actualOutput || '');
    setEvidence(task?.evidence || '');
    setEvidenceRecord(null);
    setEvidenceError('');
    setAssigneeId(task?.assigneeId || '');
    setPriority(task?.priority || 'Normal');
    setPlannedDeadline(task?.plannedDeadline || '');
    setDeadlineOverrideReason('');
    setBlocker(task?.blocker || '');
    setChecklistEvidenceDraft((task?.checklistEvidence || []).map((items) => items?.[0]?.url || items?.[0]?.fileUrl || items?.[0]?.path || items?.[0]?.id || ''));
    setChecklistEvidenceRecords((task?.checklistEvidence || []).map((items) => items || []));
    setUploadingChecklistIndex(-1);
    setConfigDraft({ title: task?.title || '', group: task?.group || 'setup', dueOffset: task?.dueOffset || 0, checklistText: (task?.checklistItems || []).join('\n') });
    window.setTimeout(() => drawerRef.current?.focus(), 0);
  }, [task?.id, task?.actualOutput, task?.evidence, task?.assigneeId, task?.priority, task?.plannedDeadline, task?.blocker]);
  if (!task?.id) return <aside className="card task-drawer"><div className="empty">Chưa có công việc trong phạm vi này.</div></aside>;
  const canSubmitReview = !uploadingEvidence && uploadingChecklistIndex < 0;
  const needsDeadlineReason = Boolean(plannedDeadline && plannedDeadline > task.startDate);
  const actorTokens = new Set([actor?.id, actor?.email, actor?.name].map((item) => String(item || '').toLowerCase()).filter(Boolean));
  const canExecute = [task.assigneeId, task.assignee].some((item) => actorTokens.has(String(item || '').toLowerCase()));
  const canAssign = ['manager', 'operations'].includes(role);
  const canConfigure = ['operations', 'vtraining', 'manager'].includes(role);
  const reviewer = courseManager
    || directory.find((item) => directoryMatchesIdentity(item, task.reviewerId, task.reviewer))
    || (actor?.role === 'manager' ? directory.find((item) => directoryMatchesIdentity(item, actor?.id, actor?.email, actor?.name)) : null);
  const reviewerName = reviewer?.name || task.reviewer || task.manager || 'Chưa gán Quản lý ekip';
  const configChecklist = configDraft.checklistText.split('\n').map((item) => item.trim()).filter(Boolean);
  const latestRework = [...(task.reviews || [])].reverse().find((item) => item.result === 'REWORK');
  function buildChecklistEvidence(draft = checklistEvidenceDraft, records = checklistEvidenceRecords) {
    return task.checklist.map((_, index) => {
      if (records[index]?.length) return records[index];
      const value = String(draft[index] || '').trim();
      return value ? [{ id: value, url: value }] : [];
    });
  }
  function saveProgress(nextDraft = checklistEvidenceDraft, nextRecords = checklistEvidenceRecords, nextBlocker = blocker, message = `Đã tự động lưu tiến độ ${task.id}.`) {
    return updateTask(task.id, { checklist: task.checklist, checklistEvidence: buildChecklistEvidence(nextDraft, nextRecords), blocker: nextBlocker }, message);
  }
  async function selectChecklistEvidenceFile(index, file) {
    if (!file) return;
    setUploadingChecklistIndex(index);
    setEvidenceError('');
    try {
      const uploaded = await uploadTrainingOperationsFile(file, task.id, 'evidence', role);
      const nextRecords = checklistEvidenceRecords.map((items, itemIndex) => itemIndex === index ? [uploaded] : items);
      const nextDraft = checklistEvidenceDraft.map((value, itemIndex) => itemIndex === index ? (uploaded.name || uploaded.id || '') : value);
      setChecklistEvidenceRecords(nextRecords);
      setChecklistEvidenceDraft(nextDraft);
      await saveProgress(nextDraft, nextRecords, blocker, `Đã lưu minh chứng tiêu chí ${index + 1} của ${task.id}.`);
    } catch (error) {
      setEvidenceError(error.message || 'Không thể tải minh chứng tiêu chí.');
    } finally {
      setUploadingChecklistIndex(-1);
    }
  }
  async function openTaskEvidenceRecord(record) {
    setEvidenceError('');
    try {
      const url = record?.path ? await getTrainingOperationsFileUrl(record.path, record.name, role) : record?.url || record?.fileUrl;
      if (!url) throw new Error('Minh chứng chưa có đường dẫn hợp lệ.');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setEvidenceError(error.message || 'Không thể mở minh chứng.');
    }
  }
  async function clearChecklistEvidence(index) {
    const nextRecords = checklistEvidenceRecords.map((items, itemIndex) => itemIndex === index ? [] : items);
    const nextDraft = checklistEvidenceDraft.map((value, itemIndex) => itemIndex === index ? '' : value);
    setChecklistEvidenceRecords(nextRecords);
    setChecklistEvidenceDraft(nextDraft);
    await saveProgress(nextDraft, nextRecords, blocker, `Đã xóa minh chứng tiêu chí ${index + 1} của ${task.id}.`);
  }
  async function selectEvidenceFile(file) {
    if (!file) return;
    setUploadingEvidence(true);
    setEvidenceError('');
    try {
      const uploaded = await uploadTrainingOperationsFile(file, task.id, 'evidence', role);
      setEvidenceRecord(uploaded);
      setEvidence(uploaded.name);
    } catch (error) {
      setEvidenceRecord(null);
      setEvidenceError(error.message || 'Không thể tải minh chứng.');
    } finally {
      setUploadingEvidence(false);
    }
  }
  return <aside className="card task-drawer" ref={drawerRef} tabIndex={-1} aria-label={`Chi tiết công việc ${task.title}`}>
    <div className="drawer-head"><div><span>{task.classCode} · {GROUP_META[task.group]?.[0]} · {task.id}</span><h2>{task.title}</h2><small>{task.className} · Cấp lớp · {GROUP_META[task.group]?.[1]}</small></div><div className="drawer-head-actions"><span className={`badge ${taskStatusClass(task)}`}>{taskStatusLabel(task)}</span>{onClose && <button type="button" aria-label="Đóng chi tiết công việc" onClick={onClose}>×</button>}</div></div>
    {task.assignmentStatus === 'NEEDS_REASSIGNMENT' && <div className="reassignment-warning" role="alert"><b>Công việc đang tạm dừng</b><span>Thành viên phụ trách đã được gỡ khỏi khóa học. Hãy phân công người mới để tiếp tục từ trạng thái trước đó.</span></div>}
    <div className="meta-grid"><div><small>Quản lý ekip</small><b>{task.manager}</b></div><div><small>Người thực hiện</small><b>{task.assignee}</b></div><div><small>Deadline</small><b>{dueLabel(task.startDate, task.dueOffset, task.dueDirection, task.anchorType)}</b></div><div><small>Progress tự động</small><b>{task.progress}%</b></div></div>
    <section><h3>Required / Actual Input</h3>{task.requiredInputCodes?.map((code) => { const input = Object.values(INPUT_META).find(([itemCode]) => itemCode === code); return <div className="input-line" key={code}><span>{code} · {input?.[1] || 'Input bắt buộc'}</span><b>{task.requiredInputVersions?.[code] ? `Đã khóa v${task.requiredInputVersions[code]}` : 'Còn thiếu'}</b></div>; })}</section>
    {canAssign && <section><h3>Phân công người thực hiện</h3><div className="form-grid"><label>Người thực hiện<button type="button" className="assignee-trigger" onClick={() => setAssignmentOpen(true)}>{directory.find((item) => item.id === assigneeId)?.name || task.assignee || 'Bạn muốn giao việc cho ai?'}</button></label><label>Người xác nhận<input value={reviewerName} readOnly aria-invalid={!reviewer}/>{!reviewer && <small className="hint error">Chưa có Quản lý ekip của khóa học.</small>}</label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option>Low</option><option>Normal</option><option>High</option><option>Critical</option></select></label><label>Deadline<input type="date" value={plannedDeadline} onChange={(event) => setPlannedDeadline(event.target.value)}/></label>{needsDeadlineReason && <label className="wide">Lý do deadline sau khai giảng<textarea value={deadlineOverrideReason} onChange={(event) => setDeadlineOverrideReason(event.target.value)} placeholder="Nêu rõ ngoại lệ vận hành..."/></label>}</div><button disabled={!assigneeId || !reviewer || (needsDeadlineReason && !deadlineOverrideReason.trim())} onClick={() => { const assignee = directory.find((item) => item.id === assigneeId); if (assignee && reviewer) void updateTask(task.id, { assigneeId: assignee.id, assignee: assignee.name, priority, reviewerId: reviewer.id, reviewer: reviewer.name, plannedDeadline, deadlineOverrideReason: deadlineOverrideReason.trim() }, `Đã giao ${task.id} cho ${assignee.name}.`); }}>Lưu phân công</button></section>}
    {canConfigure && <section className="task-config-section"><h3><Pencil size={14}/> Sửa công việc trong lớp</h3><div className="form-grid"><label>Tên công việc<input value={configDraft.title} onChange={(event) => setConfigDraft((current) => ({ ...current, title: event.target.value }))}/></label><label>Nhóm<select value={configDraft.group} onChange={(event) => setConfigDraft((current) => ({ ...current, group: event.target.value }))}>{Object.entries(GROUP_META).map(([value, [, label]]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Deadline trước lớp (ngày)<input type="number" min="0" step="1" value={configDraft.dueOffset} onChange={(event) => setConfigDraft((current) => ({ ...current, dueOffset: Number(event.target.value) }))}/></label><label className="wide">Checklist<textarea rows="5" value={configDraft.checklistText} onChange={(event) => setConfigDraft((current) => ({ ...current, checklistText: event.target.value }))}/></label></div><div className="task-config-actions"><button disabled={!configDraft.title.trim() || !configChecklist.length} onClick={() => updateTask(task.id, { title: configDraft.title.trim(), group: configDraft.group, dueOffset: configDraft.dueOffset, checklistItems: configChecklist }, `Đã cập nhật cấu hình ${task.id}.`)}>Lưu thay đổi</button><button className="danger-action" disabled={['IN_PROGRESS', 'IN_REVIEW'].includes(task.status)} onClick={() => void archiveTask(task.id)}><Trash2 size={14}/>Xóa công việc</button></div></section>}
    {canExecute && <section className="task-checklist-section"><div className="task-section-heading"><div><h3>Checklist hoàn thành</h3><p>Đánh dấu và thêm minh chứng theo từng tiêu chí. Mọi thay đổi được lưu ngay.</p></div><strong>{task.checklist.filter(Boolean).length}/{task.checklist.length}</strong></div>{latestRework && task.status === 'REWORK' && <div className="rework-feedback"><b>Yêu cầu bổ sung từ người duyệt</b><p>{latestRework.comment}</p></div>}<div className="checklist-grid">{task.checklist.map((checked, index) => { const record = checklistEvidenceRecords[index]?.[0]; const editable = ['IN_PROGRESS', 'REWORK'].includes(task.status); return <article className={`check-evidence-row${checked ? ' completed' : ''}`} key={task.checklistItems[index]}><label className="check-row"><input type="checkbox" checked={checked} disabled={!editable} onChange={() => toggleChecklist(index)}/><span><b>Tiêu chí {index + 1}</b>{task.checklistItems[index]}</span></label><div className="criterion-evidence"><span>Minh chứng (không bắt buộc)</span>{record?.path ? <div className="criterion-file"><small title={record.name || record.id}>Đã tải: {record.name || record.id}</small><button type="button" onClick={() => void openTaskEvidenceRecord(record)}>Mở</button>{editable && <button type="button" onClick={() => void clearChecklistEvidence(index)}>Xóa</button>}</div> : <input value={checklistEvidenceDraft[index] || ''} disabled={!editable || uploadingChecklistIndex === index} onChange={(event) => { const value = event.target.value; setChecklistEvidenceDraft((current) => current.map((item, itemIndex) => itemIndex === index ? value : item)); setChecklistEvidenceRecords((current) => current.map((items, itemIndex) => itemIndex === index ? [] : items)); }} onBlur={() => void saveProgress()} placeholder="Dán URL hoặc ID"/>}<label className="criterion-upload"><input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" disabled={!editable || uploadingChecklistIndex >= 0} onChange={(event) => void selectChecklistEvidenceFile(index, event.target.files?.[0])}/>{uploadingChecklistIndex === index ? 'Đang tải…' : record?.path ? 'Thay file' : 'Tải file'}</label></div></article>; })}</div>{task.status === 'READY' && <button className="primary" onClick={() => updateTask(task.id, { status: 'IN_PROGRESS' }, `Bắt đầu ${task.id}.`)}>Bắt đầu công việc</button>}{['IN_PROGRESS', 'REWORK'].includes(task.status) && <><label className="field">Vướng mắc<textarea value={blocker} onChange={(event) => setBlocker(event.target.value)} onBlur={() => void saveProgress(checklistEvidenceDraft, checklistEvidenceRecords, blocker)} placeholder="Để trống nếu không có vướng mắc..."/></label><label className="field">Kết quả thực tế (không bắt buộc)<textarea value={actualOutput} onChange={(event) => setActualOutput(event.target.value)} placeholder="Mô tả kết quả thực tế nếu cần..."/></label><label className="field">Minh chứng tổng hợp (không bắt buộc)<input value={evidenceRecord ? '' : evidence} disabled={Boolean(evidenceRecord)} onChange={(event) => setEvidence(event.target.value)} placeholder="https://... hoặc ID VTraining"/></label><label className="field">Hoặc tải file minh chứng<input type="file" disabled={uploadingEvidence} onChange={(event) => void selectEvidenceFile(event.target.files?.[0])}/></label>{evidenceRecord && <small className="hint ready">Đã tải riêng tư: {evidenceRecord.name}</small>}{evidenceError && <small className="hint error">{evidenceError}</small>}<button className="primary" disabled={!canSubmitReview} onClick={() => updateTask(task.id, { status: 'IN_REVIEW', checklistEvidence: buildChecklistEvidence(), blocker, actualOutput: actualOutput.trim(), evidence: evidence.trim(), evidenceRecord }, `Đã gửi ${task.id} yêu cầu xác nhận hoàn thành.`)}>Gửi yêu cầu xác nhận</button><small className="hint ready">Có thể gửi ở mọi mức tiến độ, kể cả 0% và chưa có minh chứng. Người duyệt sẽ quyết định Đạt hoặc yêu cầu bổ sung.</small></>}</section>}
    {!canExecute && !canAssign && !canConfigure && <div className="read-only">Vai trò hiện tại chỉ được xem trạng thái công việc.</div>}
    <AssigneePickerDialog open={assignmentOpen} directory={directory} loading={directoryLoading} taskCount={1} selectedId={assigneeId} onClose={() => setAssignmentOpen(false)} onSelect={(person) => { setAssigneeId(person.id); setAssignmentOpen(false); }}/>
  </aside>;
}

function WorkActionInbox({ initialTab = 'tracking', ...props }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  useEffect(() => setActiveTab(initialTab), [initialTab]);
  return <section className="work-action-inbox">
    <div className="work-action-tabs" role="tablist" aria-label="Việc cần tôi xử lý">
      <button role="tab" aria-selected={activeTab === 'tracking'} className={activeTab === 'tracking' ? 'active' : ''} onClick={() => setActiveTab('tracking')}>Theo dõi</button>
      <button role="tab" aria-selected={activeTab === 'acceptance'} className={activeTab === 'acceptance' ? 'active' : ''} onClick={() => setActiveTab('acceptance')}>Nghiệm thu <b>{props.tasks.filter((item) => item.status === 'IN_REVIEW').length}</b></button>
    </div>
    {activeTab === 'tracking'
      ? <Tasks {...props} view="due" onView={() => setActiveTab('acceptance')}/>
      : <ReviewQueue role={props.role} tasks={props.tasks} updateTask={props.updateTask}/>}
  </section>;
}

function ReviewQueue({ role, tasks, updateTask }) {
  const [evidenceError, setEvidenceError] = useState('');
  const [expandedTaskId, setExpandedTaskId] = useState('');
  const [reworkTaskId, setReworkTaskId] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const queue = tasks.filter((task) => task.status === 'IN_REVIEW');
  async function openEvidenceRecord(record, task) {
    setEvidenceError('');
    try {
      const url = record?.path ? await getTrainingOperationsFileUrl(record.path, record.name, role) : record?.url || record?.fileUrl || task.evidence;
      if (!url) throw new Error('Công việc chưa có minh chứng hợp lệ.');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setEvidenceError(error.message || 'Không thể mở minh chứng.');
    }
  }
  return <section className="card full">
    <div className="page-title"><div><small>HÀNG ĐỢI XÁC NHẬN</small><h2>Chờ Quản lý ekip xác nhận</h2><p>Mở chi tiết để đối chiếu checklist và minh chứng trước khi quyết định.</p></div><span className="queue-count">{queue.length}</span></div>
    {evidenceError && <div className="read-only">{evidenceError}</div>}
    {!queue.length ? <div className="empty"><strong>Chưa có yêu cầu xác nhận</strong><p>Chưa có thành viên gửi yêu cầu trong phạm vi hiện tại.</p></div> : queue.map((task) => {
      const submission = task.submissions?.at(-1);
      const snapshot = submission?.taskSnapshot || task;
      const output = snapshot.output || task.outputs?.at(-1);
      const outputEvidence = output?.evidence || [];
      const expanded = expandedTaskId === task.id;
      const reworking = reworkTaskId === task.id;
      return <article className={`review-card${expanded ? ' expanded' : ''}`} key={task.id}>
        <div className="review-card-top">
          <div className="review-summary">
            <div>
              <span>{task.id}</span><h3>{task.title}</h3>
              <p>Kết quả: {output?.actualOutput || 'Chưa có mô tả kết quả.'}</p>
              {outputEvidence.length ? <div className="review-output-evidence review-output-evidence-summary"><b>Minh chứng tổng hợp</b>{outputEvidence.map((record, index) => <button type="button" key={record.id || record.url || index} title={record.name || record.url || record.id} onClick={() => void openEvidenceRecord(record, task)}>Mở {record.name || record.url || record.id}</button>)}</div> : <p className="review-no-evidence">Không có minh chứng tổng hợp.</p>}
              <div className="review-meta"><span>Checklist {(snapshot.checklist || []).filter(Boolean).length}/{(snapshot.checklist || []).length}</span><span>Làm lại {task.rework}</span><span>Tiến độ {task.progress}%</span></div>
            </div>
            <button type="button" className="review-detail-toggle" aria-expanded={expanded} onClick={() => setExpandedTaskId(expanded ? '' : task.id)}>{expanded ? 'Thu gọn' : 'Xem chi tiết'}</button>
          </div>
          <div className="review-actions"><button className="pass" onClick={() => updateTask(task.id, { status: 'DONE', comment: 'Đạt yêu cầu.' }, `Đã xác nhận đạt ${task.id}.`)}>Đạt</button><button className="rework" onClick={() => { setReworkTaskId(reworking ? '' : task.id); setReviewComment(''); }}>Yêu cầu làm lại</button></div>
        </div>
        {expanded && <div className="review-detail"><h4>Checklist tại thời điểm gửi duyệt</h4><div className="review-checklist">{(snapshot.checklistItems || []).map((label, index) => { const records = snapshot.checklistEvidence?.[index] || []; return <div key={`${task.id}:${index}`}><span className={snapshot.checklist?.[index] ? 'is-done' : ''}>{snapshot.checklist?.[index] ? 'Đã hoàn thành' : 'Chưa hoàn thành'}</span><b>{label}</b>{records.length ? <div className="review-evidence-list">{records.map((record, recordIndex) => <button type="button" key={record.id || record.url || recordIndex} onClick={() => void openEvidenceRecord(record, task)}>Mở minh chứng {recordIndex + 1}: {record.name || record.url || record.id}</button>)}</div> : <small>Không có minh chứng cho tiêu chí này.</small>}</div>; })}</div></div>}
        {reworking && <div className="review-comment"><label>Lý do yêu cầu làm lại<textarea autoFocus value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="Nêu rõ tiêu chí hoặc nội dung cần bổ sung…"/></label><div><button type="button" onClick={() => { setReworkTaskId(''); setReviewComment(''); }}>Hủy</button><button type="button" className="rework" disabled={!reviewComment.trim()} onClick={async () => { const response = await updateTask(task.id, { status: 'REWORK', comment: reviewComment.trim() }, `Đã trả lại ${task.id}.`); if (response) { setReworkTaskId(''); setReviewComment(''); } }}>Xác nhận trả lại</button></div></div>}
      </article>;
    })}
  </section>;
}
function initials(value) { const parts = String(value || '').trim().split(/\s+/).filter(Boolean); return (parts.length ? parts.slice(-2).map((part) => part[0]).join('') : '—').toUpperCase(); }
function taskReadinessLabel(task) {
  if (task.assignmentStatus === 'NEEDS_REASSIGNMENT') return 'Chờ phân công lại';
  if (task.assignmentStatus === 'UNASSIGNED') return 'Chưa giao';
  if (task.status !== 'WAITING_INPUT') return 'Đủ điều kiện';
  if (task.blockingInputCodes?.length) return `Thiếu ${task.blockingInputCodes.join(', ')}`;
  if (task.waitingReason === 'ASSIGNMENT' || !task.assigneeId || !task.reviewerId) return 'Chưa phân công đủ';
  if (task.blockingTaskIds?.length) return `Chờ ${task.blockingTaskIds.length} việc trước`;
  return 'Chưa sẵn sàng';
}
function taskStatusLabel(task) { return task.assignmentStatus ? STATUS_LABEL[task.assignmentStatus] || STATUS_LABEL[task.status] : STATUS_LABEL[task.status]; }
function taskStatusClass(task) { return task.assignmentStatus || task.status; }
function formatDate(isoDate) { if (!isoDate) return '—'; const [year, month, day] = String(isoDate).split('-'); return day && month && year ? `${day}/${month}/${year}` : String(isoDate); }
function dueDate(task) { const date = new Date(`${task.startDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + (task.dueDirection === 'AFTER' ? task.dueOffset : -task.dueOffset)); return date; }
function dueLabel(startDate, offset, direction = 'BEFORE', anchorType = 'CLASS_START') { const date = new Date(`${startDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + (direction === 'AFTER' ? offset : -offset)); const label = `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`; if (anchorType === 'PROJECT_START') return `${label} · sau bắt đầu dự án ${offset} ngày`; return offset === 0 ? `${label} · ngày chạy lớp` : `${label} · trước lớp ${offset} ngày`; }
function ChangePanel({ role, open, setOpen, counts, submit, onInputUpdate, requests, onRequest, onApprove }) {
  const [objectKey, setObjectKey] = useState('discussion');
  const [changeType, setChangeType] = useState('content');
  const [nextQuantity, setNextQuantity] = useState(3);
  const [source, setSource] = useState('system');
  const [classes, setClasses] = useState(['TNKH01', 'TNKH02', 'TNKH03']);
  const [reason, setReason] = useState('Khách hàng bổ sung yêu cầu và cập nhật nội dung theo phiên bản mới.');
  const config = CHANGE_CONFIG[objectKey];
  const typeLabel = config.types.find(([value]) => value === changeType)?.[1];
  const isScope = changeType === 'quantity' || (objectKey === 'material' && ['add', 'remove'].includes(changeType));
  const summary = getChangeSummary(objectKey, changeType, counts, nextQuantity);

  function chooseObject(value) {
    const firstType = CHANGE_CONFIG[value].types[0][0];
    setObjectKey(value); setChangeType(firstType); setNextQuantity((counts[value] ?? 1) + 1);
  }
  function chooseType(value) { setChangeType(value); setNextQuantity((counts[objectKey] ?? 1) + 1); }
  function toggleClass(classId) { setClasses((current) => current.includes(classId) ? current.filter((item) => item !== classId) : [...current, classId]); }
  function confirm() {
    if (role === 'intake') {
      onRequest({ objectKey: objectKey === 'exercise' ? 'vlearning' : objectKey, label: config.label, typeLabel, changeType, isScope, classes, source, reason, proposed: { nextCount: nextQuantity, classes, source } });
      return;
    }
    if (isScope) {
      const next = changeType === 'quantity' ? nextQuantity : counts.material + (changeType === 'add' ? 1 : -1);
      submit(objectKey === 'material' ? 'material' : objectKey, next);
    } else onInputUpdate(config.label, typeLabel, objectKey, reason);
  }

  if (!open) return <section className="card full"><div className="page-title"><div><small>RISK & CHANGE</small><h2>Yêu cầu thay đổi có phê duyệt</h2><p>Sale tạo yêu cầu; Quản lý vận hành phê duyệt; hệ thống chỉ tạo task sau khi được duyệt.</p></div>{['operations', 'intake'].includes(role) && <button className="primary" onClick={() => setOpen(true)}>+ Yêu cầu thay đổi</button>}</div><div className="scope-snapshot">{Object.entries(SCOPE_ACTIVITY_META).map(([key, [name]]) => <div key={key}><span>{name}</span><b>{counts[key]}</b><small>hoạt động</small></div>)}</div>{requests.length ? <div className="request-list">{requests.map((request) => <article className="change-row" key={request.id}><div><span>{request.id} · {request.requester}</span><h3>{request.label} · {request.typeLabel}</h3><p>{request.status === 'PENDING' ? 'Chưa tạo task · chờ Quản lý vận hành phê duyệt' : 'Đã duyệt · task xử lý thay đổi đã được tạo'}</p></div><div>{request.status === 'PENDING' && role === 'operations' ? <button className="primary" onClick={() => onApprove(request)}>Phê duyệt & tạo task</button> : <span className={request.status === 'APPROVED' ? 'approved' : 'draft'}>{request.status === 'APPROVED' ? 'Đã duyệt' : 'CHỜ DUYỆT'}</span>}</div></article>)}</div> : <article className="change-row"><div><span>CHƯA CÓ YÊU CẦU</span><h3>Luồng phê duyệt sẵn sàng</h3><p>Tạo yêu cầu thay đổi danh sách, bài tập hoặc hoạt động VTraining.</p></div><span className="draft">TRỐNG</span></article>}</section>;

  return <section className="card full change-request"><div className="change-request-head"><div><small>RISK & CHANGE / YÊU CẦU THAY ĐỔI</small><h2>Yêu cầu thay đổi</h2><p>{role === 'intake' ? 'Yêu cầu sẽ chuyển Quản lý vận hành duyệt; chưa tạo task ở bước này.' : 'Chọn đối tượng trước. Form và impact được điều chỉnh tự động theo loại thay đổi.'}</p></div><div className="request-stepper"><span className="active">1. Đối tượng</span><span className="active">2. Nội dung</span><span>3. Phê duyệt</span></div></div><div className="request-section"><h3>Thông tin yêu cầu</h3><div className="form-grid"><label>Đối tượng thay đổi<select value={objectKey} onChange={(event) => chooseObject(event.target.value)}>{Object.entries(CHANGE_CONFIG).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select></label><label>Loại thay đổi<select value={changeType} onChange={(event) => chooseType(event.target.value)}>{config.types.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div></div><div className="request-section"><h3>Nội dung thay đổi</h3><ChangeFields objectKey={objectKey} changeType={changeType} counts={counts} nextQuantity={nextQuantity} setNextQuantity={setNextQuantity} source={source} setSource={setSource} classes={classes} toggleClass={toggleClass}/><label className="field request-reason">Lý do thay đổi<textarea defaultValue="Khách hàng bổ sung yêu cầu và cập nhật nội dung theo phiên bản mới."/></label></div><div className="request-section"><h3>So sánh trước / sau</h3><div className="before-after"><article><span>HIỆN TẠI</span><ul>{summary.before.map((item) => <li key={item}>{item}</li>)}</ul></article><article className="after"><span>SAU THAY ĐỔI</span><ul>{summary.after.map((item) => <li key={item}>{item}</li>)}</ul></article></div></div><div className="request-section"><h3>Impact dự kiến</h3><div className="impact-chips">{summary.chips.map((item) => <span key={item}>{item}</span>)}</div><div className="impact-info"><b>{isScope ? 'Thay đổi Scope' : 'Cập nhật Input'}</b><p>{role === 'intake' ? 'Sau khi Quản lý vận hành duyệt, hệ thống mới tạo task cho Quản lý ekip phân công CTV.' : summary.info}</p></div></div><div className="request-actions"><button onClick={() => setOpen(false)}>Hủy</button><button className="primary" onClick={confirm}>{role === 'intake' ? 'Gửi yêu cầu phê duyệt' : isScope ? 'Phê duyệt thay đổi & tạo Scope v2' : objectKey === 'learner' ? 'Xác nhận cập nhật danh sách' : 'Xác nhận cập nhật Input v2'}</button></div></section>;
}

function ClassPicker({ classes, toggleClass }) { return <div className="class-picker" role="group" aria-label="Các lớp áp dụng">{['TNKH01', 'TNKH02', 'TNKH03'].map((item) => <button type="button" aria-label={`${classes.includes(item) ? 'Bỏ áp dụng' : 'Áp dụng'} lớp ${item}`} className={classes.includes(item) ? 'selected' : ''} onClick={() => toggleClass(item)} key={item}>{item}</button>)}</div>; }
function SourcePicker({ source, setSource }) { return <div className="source-picker" role="group" aria-label="Nguồn cập nhật"><button type="button" aria-label="Chọn từ hệ thống" className={source === 'system' ? 'selected' : ''} onClick={() => setSource('system')}>Chọn từ hệ thống</button><button type="button" aria-label="Tải file mô tả" className={source === 'upload' ? 'selected' : ''} onClick={() => setSource('upload')}>Tải file mô tả</button></div>; }
function ChangeFields({ objectKey, changeType, counts, nextQuantity, setNextQuantity, source, setSource, classes, toggleClass }) {
  const quantityFields = (label = 'Số lượng') => <><label>{label} hiện tại<input type="number" value={counts[objectKey] ?? 1} readOnly/></label><label>{label} mới<input type="number" min="0" value={nextQuantity} onChange={(event) => setNextQuantity(Number(event.target.value))}/></label></>;
  let fields;
  if (objectKey === 'discussion') fields = changeType === 'quantity' ? <>{quantityFields()}<label>Yêu cầu Input mới<select><option>Tạo thêm Input Thảo luận mới</option><option>Tái sử dụng thảo luận đã có</option></select></label><label>Áp dụng cho lớp<ClassPicker classes={classes} toggleClass={toggleClass}/></label></> : <><label>Thảo luận hiện tại<select><option>Thảo luận 01 – Dịch vụ khách hàng</option><option>Thảo luận 02 – Tình huống chăm sóc khách hàng</option></select></label><label>Phiên bản mới<select><option>Thảo luận phiên bản 2</option><option>Chọn thảo luận khác đã có trên hệ thống</option></select></label><label>Nguồn cập nhật<SourcePicker source={source} setSource={setSource}/></label><label>Áp dụng cho lớp<ClassPicker classes={classes} toggleClass={toggleClass}/></label></>;
  if (objectKey === 'game') fields = changeType === 'quantity' ? <>{quantityFields('Số game')}<label>Nguồn game mới<SourcePicker source={source} setSource={setSource}/></label><label>Áp dụng cho lớp<ClassPicker classes={classes} toggleClass={toggleClass}/></label></> : changeType === 'class' ? <><label>Game cần thay đổi<select><option>Game 01 – Tình huống khách hàng</option><option>Game 02 – Trải nghiệm dịch vụ</option></select></label><label>Lớp áp dụng mới<ClassPicker classes={classes} toggleClass={toggleClass}/></label></> : changeType === 'limit' ? <><label>Game cần thay đổi<select><option>Game 01 – Tình huống khách hàng</option></select></label><label>Số lượt hiện tại<input value="2" readOnly/></label><label>Số lượt mới<input type="number" defaultValue="3"/></label></> : <><label>Game hiện tại<select><option>Game 01 – Tình huống khách hàng</option></select></label><label>Link game mới<input defaultValue="https://game.example.vn/tinh-huong-v2"/></label><label>Số lượt chơi<input type="number" defaultValue="3"/></label><label>Áp dụng cho lớp<ClassPicker classes={classes} toggleClass={toggleClass}/></label></>;
  if (objectKey === 'test') fields = changeType === 'quantity' ? quantityFields('Số bài kiểm tra') : changeType === 'time' ? <><label>Thời lượng hiện tại (phút)<input value="30" readOnly/></label><label>Thời lượng mới (phút)<input type="number" defaultValue="45"/></label></> : changeType === 'attempt' ? <><label>Số lượt hiện tại<input value="1" readOnly/></label><label>Số lượt mới<input type="number" defaultValue="2"/></label><label>Cách lấy điểm<select><option>Lấy điểm cao nhất</option><option>Lấy lần cuối</option><option>Lấy lần đầu</option></select></label></> : <><label>Bài kiểm tra hiện tại<select><option>Kiểm tra cuối khóa – Bộ đề A</option></select></label><label>Nguồn cập nhật<SourcePicker source={source} setSource={setSource}/></label><label>Bài kiểm tra / bộ đề mới<select><option>Kiểm tra cuối khóa – Bộ đề B</option><option>Nhập từ file mới</option></select></label><label>Áp dụng cho lớp<ClassPicker classes={classes} toggleClass={toggleClass}/></label></>;
  if (objectKey === 'learner') fields = changeType === 'file' ? <><label>Lớp cần cập nhật<select><option>TNKH01</option><option>TNKH02</option><option>TNKH03</option></select></label><label>File cập nhật<input type="file"/></label><div className="delta-preview"><span><b>Lưu nguyên file</b>Không kiểm duyệt format hoặc tự suy đoán dữ liệu học viên</span></div></> : <><label>Lớp<select><option>TNKH01</option><option>TNKH02</option><option>TNKH03</option></select></label><label>Phương thức<select><option>Nhập / chọn trực tiếp</option><option>Tải file bất kỳ</option></select></label><label>Thông tin thay đổi<input defaultValue={changeType === 'add' ? 'Thêm 01 học viên' : changeType === 'remove' ? 'Xóa 01 học viên' : 'Sửa email / đơn vị'}/></label></>;
  if (objectKey === 'assignment') fields = changeType === 'quantity' ? quantityFields('Số bài thu hoạch') : <><label>Bài thu hoạch hiện tại<select><option>Thu hoạch cuối khóa – phiên bản 1</option></select></label><label>Bài thu hoạch mới<select><option>Thu hoạch cuối khóa – phiên bản 2</option><option>Chọn bài đã có trên hệ thống</option></select></label><label>Áp dụng cho lớp<ClassPicker classes={classes} toggleClass={toggleClass}/></label></>;
  if (objectKey === 'material') fields = changeType === 'add' ? <><label>Tên tài liệu<input defaultValue="Tài liệu bổ sung"/></label><label>File / link<input defaultValue="https://storage.example.vn/tai-lieu-moi.pdf"/></label><label>Áp dụng cho lớp<ClassPicker classes={classes} toggleClass={toggleClass}/></label></> : changeType === 'remove' ? <label>Tài liệu cần xóa<select><option>Tài liệu hướng dẫn học viên.pdf</option><option>Slide chương trình.pptx</option></select></label> : changeType === 'class' ? <><label>Tài liệu cần đổi phạm vi<select><option>Tài liệu hướng dẫn học viên.pdf</option><option>Slide chương trình.pptx</option></select></label><label>Lớp áp dụng mới<ClassPicker classes={classes} toggleClass={toggleClass}/></label></> : <><label>Tài liệu hiện tại<select><option>Tài liệu hướng dẫn học viên.pdf</option><option>Slide chương trình.pptx</option></select></label><label>File / link mới<input defaultValue="https://storage.example.vn/tai-lieu-v2.pdf"/></label><label>Áp dụng cho lớp<ClassPicker classes={classes} toggleClass={toggleClass}/></label></>;
  if (objectKey === 'exercise') fields = changeType === 'quantity' ? quantityFields('Số bài tập') : <><label>Bài tập hiện tại<select><option>Bài tập tình huống – phiên bản 1</option></select></label><label>Bài tập mới<select><option>Bài tập tình huống – phiên bản 2</option><option>Chọn bài đã có trên hệ thống</option></select></label><label>Áp dụng cho lớp<ClassPicker classes={classes} toggleClass={toggleClass}/></label></>;
  return <div className="change-field-grid">{fields}</div>;
}

function getChangeSummary(objectKey, changeType, counts, nextQuantity) {
  const config = CHANGE_CONFIG[objectKey];
  const scope = changeType === 'quantity' || (objectKey === 'material' && ['add', 'remove'].includes(changeType));
  let before = [`${config.label}: phiên bản 1`, 'Áp dụng cho 03 lớp', 'Giữ lịch sử hiện tại'];
  let after = [`${config.label}: phiên bản 2`, 'Giữ phạm vi 03 lớp', 'Các task liên quan được đánh dấu'];
  if (changeType === 'quantity') { before = [`Số lượng ${config.label.toLowerCase()}: ${counts[objectKey]}`, 'Scope version: 1', `${config.code} version: 1`]; after = [`Số lượng ${config.label.toLowerCase()}: ${nextQuantity}`, 'Scope version: 2', 'Sinh / hủy task theo chênh lệch']; }
  if (objectKey === 'learner') { before = ['Danh sách học viên D03 v1', 'TNKH01: 150 học viên', 'Giữ lịch sử nhập trước']; after = ['Danh sách học viên D03 v2', '+12 / -3 / sửa 5', 'Preview delta trước khi xác nhận']; }
  if (objectKey === 'material' && ['add', 'remove'].includes(changeType)) { before = ['Danh mục tài liệu hiện tại', `Số tài liệu: ${counts.material}`, 'Scope version: 1']; after = [changeType === 'add' ? 'Bổ sung 01 tài liệu' : 'Giảm 01 tài liệu', `Số tài liệu: ${counts.material + (changeType === 'add' ? 1 : -1)}`, 'Scope version: 2']; }
  return { before, after, chips: scope ? [`${config.code}: cập nhật dữ liệu`, 'Scope version 1 → 2', 'Sinh / hủy task theo impact', 'Giữ toàn bộ lịch sử'] : [`${config.code}: version 1 → version 2`, objectKey === 'learner' ? '03 lớp / task bị ảnh hưởng' : '03 task bị ảnh hưởng', 'Không thay đổi Scope', 'Giữ toàn bộ lịch sử'], info: scope ? 'Hệ thống xác định thay đổi này làm thay đổi phạm vi triển khai. Sau phê duyệt, hệ thống tạo Scope v2 và xử lý Flow theo impact.' : 'Đây là cập nhật Input, không tạo Scope v2. Các task liên quan được đánh dấu để Quản lý ekip quyết định tiếp tục hay mở lại.' };
}
function Audit({ entries }) { return <section className="card full"><div className="page-title"><div><small>AUDIT LOG</small><h2>Lịch sử không thể chỉnh sửa</h2><p>Ai làm gì, lúc nào và trên đối tượng nào.</p></div></div><div className="audit-list">{entries.map((entry, index) => { const legacy = typeof entry === 'string'; const actorLabel = legacy ? 'Không có dữ liệu người thực hiện' : `${entry.actor?.name || entry.actor?.email || 'Hệ thống'} · ${TRAINING_ROLE_OPTIONS.find(([value]) => value === entry.actor?.role)?.[1] || entry.actor?.role || 'system'}`; return <div key={legacy ? `${entry}-${index}` : entry.id || index}><span></span><div><b>{legacy ? entry : `${new Date(entry.happenedAt).toLocaleString('vi-VN')} · ${entry.summary}`}</b><small>{actorLabel}{legacy ? '' : ` · ${entry.entityType || 'workspace'}: ${entry.entityId || 'default'} · ${entry.type}`}</small></div></div>; })}</div></section>; }

function CreateWizard({ step, setStep, close, confirm, directory = [] }) {
  const stages = ['Dự án', 'Khóa học', 'Lớp', 'Nhóm việc', 'Xác nhận'];
  const managers = directory.filter((item) => directoryHasRole(item, 'manager'));
  const [systems, setSystems] = useState(['VTraining', 'VLearning']);
  const [projectDraft, setProjectDraft] = useState({ id: 'EVNSPC-2026-02', name: 'Đào tạo Trải nghiệm khách hàng EVNSPC 2026 · Đợt 2', customerName: 'EVNSPC', startDate: '2026-10-01', deadline: '2026-10-31', teamId: managers[0]?.id || '' });
  const [courseDrafts, setCourseDrafts] = useState([{ id: 'CX-FOUNDATION-02', name: 'Trải nghiệm khách hàng · Đợt 2', contentVersion: '2026-v1' }]);
  const [activeCourseIndex, setActiveCourseIndex] = useState(0);
  const courseDraft = courseDrafts[activeCourseIndex] || courseDrafts[0];
  const [editingChecklist, setEditingChecklist] = useState('');
  const [checklistDrafts, setChecklistDrafts] = useState(() => Object.fromEntries(taskTemplates.map(([, id, , , , items]) => [id, items.join('\n')])));
  const [enabledTaskIds, setEnabledTaskIds] = useState(() => taskTemplates.map(([, id]) => id));
  const [taskDueOffsets, setTaskDueOffsets] = useState(() => Object.fromEntries(taskTemplates.map(([, id, , , dueOffset]) => [id, dueOffset])));
  const [draftClasses, setDraftClasses] = useState(() => CLASS_META.map((item, index) => ({ ...item, id: `TNKH2${String(index + 1).padStart(2, '0')}`, code: `TNKH2${String(index + 1).padStart(2, '0')}`, courseId: 'CX-FOUNDATION-02', name: `Lớp ${String(index + 1).padStart(2, '0')} · CSKH EVNSPC · Đợt 2`, startDate: `2026-10-${String(1 + index * 7).padStart(2, '0')}`, endDate: `2026-10-${String(5 + index * 7).padStart(2, '0')}` })));
  const [addingClass, setAddingClass] = useState(false);
  const [classDraft, setClassDraft] = useState({ code: 'TNKH204', name: 'Lớp 04 · CSKH EVNSPC · Đợt 2', courseId: 'CX-FOUNDATION-02', startDate: '2026-10-22', endDate: '2026-10-26', cloneFrom: 'LỚP MẪU' });
  function toggleSystem(system) { setSystems((current) => current.includes(system) ? current.filter((item) => item !== system) : [...current, system]); }
  function patchCourseDraft(patch) {
    const previousId = courseDraft.id;
    setCourseDrafts((current) => current.map((item, index) => index === activeCourseIndex ? { ...item, ...patch } : item));
    if (patch.id && patch.id !== previousId) {
      setDraftClasses((current) => current.map((item) => item.courseId === previousId ? { ...item, courseId: patch.id } : item));
      setClassDraft((current) => current.courseId === previousId ? { ...current, courseId: patch.id } : current);
    }
  }
  function addCourseDraft() {
    const sequence = courseDrafts.length + 1;
    const id = `KHOA-${String(sequence).padStart(2, '0')}`;
    setCourseDrafts((current) => [...current, { id, name: `Khóa học ${String(sequence).padStart(2, '0')}`, contentVersion: '2026-v1' }]);
    setActiveCourseIndex(courseDrafts.length);
    setClassDraft((current) => ({ ...current, courseId: id }));
  }
  function removeCourseDraft(index) {
    if (courseDrafts.length === 1) return;
    const removedId = courseDrafts[index].id;
    const relatedClassCount = draftClasses.filter((item) => item.courseId === removedId).length;
    if (!window.confirm(`Xóa khóa ${removedId} và ${relatedClassCount} lớp nháp thuộc khóa này?`)) return;
    setCourseDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setDraftClasses((current) => current.filter((item) => item.courseId !== removedId));
    setClassDraft((current) => current.courseId === removedId ? { ...current, courseId: courseDrafts.find((_, itemIndex) => itemIndex !== index)?.id || '' } : current);
    setActiveCourseIndex(0);
  }
  function addDraftClass() {
    if (!classDraft.code.trim() || !classDraft.name.trim() || !classDraft.startDate || !classDraft.endDate || classDraft.endDate < classDraft.startDate) return;
    if (draftClasses.some((item) => item.code.trim().toUpperCase() === classDraft.code.trim().toUpperCase())) return;
    setDraftClasses((current) => [...current, { ...classDraft, id: classDraft.code }]);
    setAddingClass(false);
    const nextNumber = draftClasses.length + 2;
    setClassDraft({ code: `TNKH2${String(nextNumber).padStart(2, '0')}`, name: `Lớp ${String(nextNumber).padStart(2, '0')} · CSKH EVNSPC · Đợt 2`, courseId: courseDrafts[0]?.id || '', startDate: '2026-10-29', endDate: '2026-11-02', cloneFrom: 'LỚP MẪU' });
  }
  function removeDraftClass(code) {
    setDraftClasses((current) => current.filter((item) => item.code !== code));
  }
  function createPayload() {
    const buildCoursePayload = (courseItem) => ({
      course: { ...courseItem, systems },
      classes: draftClasses.filter((item) => item.courseId === courseItem.id).map((item) => ({ ...item, cloneFrom: item.cloneFrom === 'LỚP MẪU' ? 'CLASS_TEMPLATE' : item.cloneFrom })),
      scope: {
        selectedContents: systems.map((item) => item.toUpperCase()),
        instanceCount: { VLEARNING: 1, GAMIFICATION: 2, DISCUSSION: 2, ASSIGNMENT: 1, TEST: 1, MATERIAL: 4 },
      },
      taskTemplates: taskTemplates.map(([, code, title]) => ({ code, title, dueOffset: Number(taskDueOffsets[code] ?? 0), enabled: enabledTaskIds.includes(code), checklist: checklistDrafts[code].split('\n').map((item) => item.trim()).filter(Boolean) })),
    });
    const [firstCourse, ...additionalCourses] = courseDrafts;
    const firstPayload = buildCoursePayload(firstCourse);
    return {
      project: { ...projectDraft, customerId: projectDraft.customerName, classCount: firstPayload.classes.length },
      ...firstPayload,
      additionalCourses: additionalCourses.map(buildCoursePayload),
    };
  }
  return <div className="modal-backdrop"><div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
    <div className="modal-head"><div><small>KHỞI TẠO TRIỂN KHAI ĐÀO TẠO</small><h2 id="create-project-title">Dự án → khóa học → lớp → nhóm việc → công việc</h2></div><button onClick={close} aria-label="Đóng">×</button></div>
    <div className="wizard-steps">{stages.map((label, index) => <div className={step >= index + 1 ? 'active' : ''} key={label}><b>{index + 1}</b><span>{label}</span></div>)}</div>
    {step === 1 && <div className="wizard-body"><div className="step-intro"><span>BƯỚC 1</span><h3>Thông tin dự án</h3><p>Dự án là cấp quản lý tổng, chứa các khóa học; chưa sinh công việc tại cấp này.</p></div><div className="form-grid"><label>Tên dự án<input value={projectDraft.name} onChange={(event) => setProjectDraft((current) => ({ ...current, name: event.target.value }))}/></label><label>Khách hàng<input value={projectDraft.customerName} onChange={(event) => setProjectDraft((current) => ({ ...current, customerName: event.target.value }))}/></label><label>Ngày bắt đầu<input type="date" value={projectDraft.startDate} onChange={(event) => setProjectDraft((current) => ({ ...current, startDate: event.target.value }))}/></label><label>Deadline tổng<input type="date" value={projectDraft.deadline} onChange={(event) => setProjectDraft((current) => ({ ...current, deadline: event.target.value }))}/></label><label>Ekip phụ trách<select value={projectDraft.teamId} onChange={(event) => setProjectDraft((current) => ({ ...current, teamId: event.target.value }))}><option value="">{managers.length ? 'Chọn Quản lý ekip' : 'Chưa có tài khoản Quản lý ekip'}</option>{managers.map((manager) => <option value={manager.id} key={manager.id}>{manager.name} · {manager.id}</option>)}</select>{!managers.length && <small className="field-hint error">Đóng cửa sổ và tạo tài khoản Quản lý ekip trước.</small>}</label><label>Mã dự án<input value={projectDraft.id} onChange={(event) => setProjectDraft((current) => ({ ...current, id: event.target.value }))}/></label></div></div>}
    {step === 2 && <div className="wizard-body"><div className="step-intro"><span>BƯỚC 2</span><h3>Khởi tạo các khóa học trong dự án</h3><p>Một dự án có thể chứa nhiều khóa như QL01A, QL01B, QL02; mỗi khóa quản lý lớp và input độc lập.</p></div><div className="wizard-course-tabs">{courseDrafts.map((item, index) => <button type="button" className={index === activeCourseIndex ? 'active' : ''} key={`${item.id}-${index}`} onClick={() => { setActiveCourseIndex(index); setClassDraft((current) => ({ ...current, courseId: item.id })); }}><span>KHÓA {index + 1}</span><b>{item.id || 'Chưa có mã'}</b><small>{item.name || 'Chưa có tên'}</small></button>)}<button type="button" className="add-course" onClick={addCourseDraft}>+ Thêm khóa</button></div><div className="wizard-course-editor"><div className="form-grid"><label>Tên khóa học<input value={courseDraft.name} onChange={(event) => patchCourseDraft({ name: event.target.value })}/></label><fieldset className="system-multiselect"><legend>Hệ thống áp dụng chung</legend><div className="system-options">{COURSE_SYSTEMS.map((system) => <label key={system.id}><input type="checkbox" checked={systems.includes(system.id)} onChange={() => toggleSystem(system.id)}/><span>{system.id}</span>{!system.mature && <em>Mở rộng sau</em>}</label>)}</div><small>VSurvey và VEvent mới ghi nhận phạm vi; cấu hình chuyên sâu thực hiện ở đợt sau.</small></fieldset><label>Mã khóa học<input value={courseDraft.id} onChange={(event) => patchCourseDraft({ id: event.target.value })}/></label><label>Phiên bản nội dung<input value={courseDraft.contentVersion} onChange={(event) => patchCourseDraft({ contentVersion: event.target.value })}/></label></div>{courseDrafts.length > 1 && <button type="button" className="remove-course" onClick={() => removeCourseDraft(activeCourseIndex)}>Xóa khóa đang chọn</button>}</div></div>}
    {step === 3 && <div className="wizard-body"><div className="step-intro"><span>BƯỚC 3</span><h3>Tạo lớp và gắn đúng khóa học</h3><p>Mỗi lớp thuộc đúng một khóa, có lịch, input và nhóm việc độc lập.</p></div><div className="class-list">{draftClasses.map((item) => <article key={item.code}><div><small>{item.courseId}</small><b>{item.name}</b></div><span>{formatDate(item.startDate)} — {formatDate(item.endDate)}</span><em>Clone từ Lớp mẫu</em><button type="button" className="remove-class" onClick={() => removeDraftClass(item.code)}>Xóa lớp</button></article>)}</div>{addingClass ? <div className="add-class-form"><div className="form-grid"><label>Thuộc khóa học<select value={classDraft.courseId} onChange={(event) => setClassDraft((current) => ({ ...current, courseId: event.target.value }))}>{courseDrafts.map((item) => <option value={item.id} key={item.id}>{item.id} · {item.name}</option>)}</select></label><label>Mã lớp<input value={classDraft.code} onChange={(event) => setClassDraft((current) => ({ ...current, code: event.target.value }))}/></label><label>Tên lớp<input value={classDraft.name} onChange={(event) => setClassDraft((current) => ({ ...current, name: event.target.value }))}/></label><label>Ngày bắt đầu<input type="date" value={classDraft.startDate} onChange={(event) => setClassDraft((current) => ({ ...current, startDate: event.target.value }))}/></label><label>Ngày kết thúc<input type="date" value={classDraft.endDate} onChange={(event) => setClassDraft((current) => ({ ...current, endDate: event.target.value }))}/></label><label>Clone cấu hình từ<select value={classDraft.cloneFrom} onChange={(event) => setClassDraft((current) => ({ ...current, cloneFrom: event.target.value }))}><option>LỚP MẪU</option>{draftClasses.map((item) => <option key={item.code}>{item.code}</option>)}</select></label></div><div className="add-class-actions"><button onClick={() => setAddingClass(false)}>Hủy</button><button className="primary" disabled={!classDraft.courseId || !classDraft.code.trim() || !classDraft.name.trim() || !classDraft.startDate || !classDraft.endDate || classDraft.endDate < classDraft.startDate} onClick={addDraftClass}>Lưu lớp</button></div></div> : <button onClick={() => { setClassDraft((current) => ({ ...current, courseId: courseDrafts[0]?.id || '' })); setAddingClass(true); }}>+ Thêm lớp vào khóa học</button>}<div className="course-class-summary">{courseDrafts.map((item) => { const count = draftClasses.filter((classItem) => classItem.courseId === item.id).length; return <span className={count ? '' : 'missing'} key={item.id}><b>{item.id}</b>{count} lớp</span>; })}</div></div>}
    {step === 4 && <div className="wizard-body"><div className="step-intro"><span>BƯỚC 4</span><h3>Cấu hình công việc cho các lớp</h3><p>Mẫu dưới đây áp dụng cho tất cả lớp. Mỗi deadline được tính theo số ngày trước ngày khai giảng của từng lớp.</p></div><div className="task-template-list v4">{Object.keys(GROUP_META).map((group) => { const templates = taskTemplates.filter(([taskGroup]) => taskGroup === group); return templates.length ? <section className="wizard-task-group" key={group}><h3>{GROUP_META[group][0]} · {GROUP_META[group][1]}</h3>{templates.map(([, id, title, , , checklistItems]) => { const enabled = enabledTaskIds.includes(id); return <article key={id}><label><input type="checkbox" checked={enabled} onChange={() => setEnabledTaskIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}/><span><b>{title}</b><small>{checklistDrafts[id].split('\n').filter(Boolean).length} checklist · chưa phân công</small></span><span className="task-deadline-offset">Trước khai giảng <input type="number" min="0" value={taskDueOffsets[id]} disabled={!enabled} aria-label={`Số ngày trước khai giảng cho ${title}`} onChange={(event) => setTaskDueOffsets((current) => ({ ...current, [id]: Math.max(0, Number(event.target.value || 0)) }))}/> ngày</span><button type="button" disabled={!enabled} onClick={() => setEditingChecklist(editingChecklist === id ? '' : id)}>Chỉnh checklist</button></label>{editingChecklist === id && enabled && <div className="checklist-editor"><label>Checklist, mỗi dòng là một tiêu chí<textarea value={checklistDrafts[id]} onChange={(event) => setChecklistDrafts((current) => ({ ...current, [id]: event.target.value }))}/></label><small>{checklistDrafts[id].split('\n').filter(Boolean).length} tiêu chí</small><button type="button" onClick={() => setEditingChecklist('')}>Lưu checklist</button></div>}</article>; })}</section> : null; })}</div></div>}
    {step === 5 && <div className="wizard-body"><div className="summary"><span>CẤU TRÚC SẼ KHỞI TẠO</span><h3>01 dự án · {String(courseDrafts.length).padStart(2, '0')} khóa học · {String(draftClasses.length).padStart(2, '0')} lớp</h3><p>{draftClasses.length * enabledTaskIds.length} công việc cấp lớp ({enabledTaskIds.length} việc × {draftClasses.length} lớp), được tách theo từng khóa học và từng lớp; không sinh công việc ngang hàng ở cấp dự án hoặc khóa học.</p></div><div className="creation-flow"><div><b>1</b><span>Dự án<small>{projectDraft.id}</small></span></div><i></i><div><b>2</b><span>{String(courseDrafts.length).padStart(2, '0')} khóa học<small>{courseDrafts.map((item) => item.id).join(', ')}</small></span></div><i></i><div><b>3</b><span>{String(draftClasses.length).padStart(2, '0')} lớp<small>Lịch riêng</small></span></div><i></i><div><b>4</b><span>{draftClasses.length * enabledTaskIds.length} công việc<small>Theo lớp</small></span></div></div><div className="warning">Mỗi khóa phải có ít nhất một lớp. Input readiness và hàng đợi upload của Sale sẽ được theo dõi riêng theo khóa.</div></div>}
    <div className="modal-actions"><button disabled={step === 1} onClick={() => setStep((value) => value - 1)}>Quay lại</button>{step < stages.length ? <button className="primary" disabled={(step === 1 && !projectDraft.teamId) || (step === 2 && courseDrafts.some((item) => !item.id.trim() || !item.name.trim())) || (step === 3 && courseDrafts.some((item) => !draftClasses.some((classItem) => classItem.courseId === item.id)))} onClick={() => setStep((value) => value + 1)}>Tiếp tục</button> : <button className="primary" onClick={() => confirm(createPayload())}>Xác nhận & sinh việc theo lớp</button>}</div>
  </div></div>;
}
