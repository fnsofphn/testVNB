// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  uploadTrainingOperationsFile,
  validateRosterWorkbook,
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

const STATUS_LABEL = { WAITING_INPUT: 'Chờ input', READY: 'Sẵn sàng', IN_PROGRESS: 'Đang thực hiện', IN_REVIEW: 'Chờ review', REWORK: 'Cần làm lại', DONE: 'Hoàn thành', CANCELLED: 'Đã hủy theo scope' };
const directoryHasRole = (item, expectedRole) => item?.role === expectedRole || item?.roles?.includes(expectedRole);
const VIEW_TO_TAB = { work: 'tasks', config: 'tasks', workflow: 'tasks' };
const TAB_TO_VIEW = { tasks: 'work' };

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
  const [syncState, setSyncState] = useState('loading');
  const [syncError, setSyncError] = useState('');
  const [inputs, setInputs] = useState({ roster: false, vlearning: false, game: false, discussion: false, assignment: false, test: false, material: false });
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedTaskId, setSelectedTaskId] = useState(routeContext.taskId || '');
  const [audit, setAudit] = useState([]);
  const [toast, setToast] = useState('');
  const [uploadStep, setUploadStep] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [changeOpen, setChangeOpen] = useState(false);
  const [scopeCounts, setScopeCounts] = useState({ game: 2, discussion: 2, material: 4, assignment: 1, test: 1, exercise: 1 });
  const [groupManagers, setGroupManagers] = useState(() => Object.fromEntries(CLASS_META.flatMap((classMeta) => ['prepare', 'setup', 'live'].map((group) => [`${classMeta.code}:${group}`, 'Chưa giao']))));
  const [workflowClass, setWorkflowClass] = useState('TNKH01');
  const [changeRequests, setChangeRequests] = useState([]);
  const [actor, setActor] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [accountDirectory, setAccountDirectory] = useState([]);
  const activeProject = workspaceState.projects?.find((item) => item.id === routeContext.projectId)
    || workspaceState.projects?.find((item) => item.id === workspaceState.activeProjectId)
    || workspaceState.projects?.[0]
    || INITIAL_WORKSPACE.projects[0];
  const activeCourse = workspaceState.courses?.find((item) => item.id === routeContext.courseId && item.projectId === activeProject?.id)
    || workspaceState.courses?.find((item) => item.projectId === activeProject?.id)
    || workspaceState.courses?.[0]
    || INITIAL_WORKSPACE.courses[0];
  const classes = workspaceState.classes?.filter((item) => item.projectId === activeProject?.id && (!activeCourse?.id || item.courseId === activeCourse.id)) || CLASS_META;
  const activeScope = [...(workspaceState.scopes || [])].filter((item) => item.projectId === activeProject?.id).sort((a, b) => b.version - a.version)[0] || INITIAL_WORKSPACE.scopes[0];
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;

  const readyCount = Object.values(inputs).filter(Boolean).length;
  const kpis = useMemo(() => ({ waiting: tasks.filter((task) => task.status === 'WAITING_INPUT').length, active: tasks.filter((task) => ['READY', 'IN_PROGRESS'].includes(task.status)).length, review: tasks.filter((task) => task.status === 'IN_REVIEW').length, done: tasks.filter((task) => task.status === 'DONE').length, rework: tasks.filter((task) => task.status === 'REWORK').length }), [tasks]);

  function notify(message) { setToast(message); window.setTimeout(() => setToast(''), 3200); }

  function writeRoute(nextTab, context = {}, { replace = false } = {}) {
    const params = new URLSearchParams();
    params.set('view', TAB_TO_VIEW[nextTab] || nextTab);
    if (nextTab === 'tasks') {
      for (const key of ['projectId', 'courseId', 'classId', 'taskId']) if (context[key]) params.set(key, context[key]);
    }
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
    setAudit([...(state.auditEvents || [])].reverse().map((event) => `${new Date(event.happenedAt).toLocaleString('vi-VN')} · ${event.summary}`));
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
      hydrate(response);
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
    const inputRecord = workspaceState.inputs?.find((item) => item.projectId === activeProject.id && item.key === key);
    let validation = draft.validation || { valid: true, errors: [], warnings: [] };
    let data = draft.data || {};
    let files = [];
    if (draft.file) {
      if (key === 'roster') {
        validation = await validateRosterWorkbook(draft.file, classes.map((item) => item.code));
        if (!validation.valid) {
          setSyncError(validation.errors.join(' '));
          return null;
        }
        data = validation.data;
      }
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
    return runCommand(type, { projectId: activeProject.id, inputKey: key, data, files, validation, reason: draft.reason || (type === 'SUBMIT_INPUT_VERSION' ? 'Cập nhật dữ liệu theo yêu cầu mới.' : 'Nộp input lần đầu'), sourceStepCode: type === 'SUBMIT_INPUT_VERSION' ? 'UC15-B03' : undefined }, `${INPUT_META[key][1]} đã được lưu và kiểm tra readiness trên server.`);
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
      const evidenceRecord = patch.evidenceRecord || { id: `${id}:EVIDENCE`, url: patch.evidence || task.evidence };
      const output = await runCommand('SUBMIT_OUTPUT', { taskId: id, actualOutput: patch.actualOutput || task.actualOutput || 'Đã hoàn thành theo checklist.', evidence: [evidenceRecord] });
      if (!output) return null;
      return runCommand('SUBMIT_REVIEW', { taskId: id }, message || `Đã gửi ${id} duyệt.`);
    }
    if (patch.status === 'DONE') return runCommand('REVIEW_TASK', { taskId: id, result: 'PASS', comment: patch.comment || 'Đạt yêu cầu.' }, message || `Đã duyệt ${id}.`);
    if (patch.status === 'REWORK') return runCommand('REVIEW_TASK', { taskId: id, result: 'REWORK', comment: patch.comment || 'Cần bổ sung theo tiêu chí review.' }, message || `Đã trả lại ${id}.`);
    if (patch.blocker !== undefined) return runCommand('UPDATE_TASK_PROGRESS', { taskId: id, checklist: task.checklist, blocker: patch.blocker }, message || `Đã cập nhật vướng mắc của ${id}.`);
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
    const reviewer = directory.find((item) => item.id === reviewerId) || (actor?.role === 'manager' ? actor : null);
    if (!assignee || !reviewer) {
      setSyncError('Chưa xác định được người nhận hoặc người xác nhận từ danh mục tài khoản VWork đang hoạt động.');
      return null;
    }
    return runCommand('ASSIGN_TASKS', { taskIds, assigneeId: assignee.id, assigneeName: assignee.name, reviewerId: reviewer.id, reviewerName: reviewer.name, priority: 'Normal', requireSeparation: true }, `Đã giao ${taskIds.length} công việc cho ${assignee.name}.`);
  }
  async function createClassTask(classId, draft) {
    return runCommand('CREATE_CLASS_TASK', { classId, ...draft }, `Đã thêm công việc vào lớp ${classId}.`);
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
    const requested = await runCommand('REQUEST_SCOPE_CHANGE', { projectId: activeProject.id, changeType: 'quantity', objectKey, proposed: { nextCount: safeNextCount }, reason: `${label} thay đổi từ ${currentCount} thành ${safeNextCount}.`, effectiveAt: new Date().toISOString() });
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
    const response = await runCommand('REQUEST_SCOPE_CHANGE', { projectId: activeProject.id, changeType: payload.changeType || payload.type || 'content', objectKey: payload.objectKey, proposed: payload.proposed || { classes: payload.classes, source: payload.source }, reason: payload.reason || `${payload.label} · ${payload.typeLabel}`, effectiveAt: payload.effectiveAt || new Date().toISOString() }, 'Yêu cầu đã gửi Quản lý vận hành phê duyệt. Chưa tạo hoặc hủy task.');
    if (response) setChangeOpen(false);
  }
  async function approveChange(request) {
    await runCommand('APPROVE_SCOPE_CHANGE', { changeRequestId: request.id }, 'Đã phê duyệt yêu cầu; scope và task được cập nhật có kiểm soát.');
  }
  const topbarPath = tab === 'change' && changeOpen
    ? 'VWORK / RISK & CHANGE / YÊU CẦU THAY ĐỔI'
    : tab === 'accounts' ? 'VWORK / EKIP & TÀI KHOẢN'
    : tab === 'tasks' ? ['VWORK', activeProject?.code, routeContext.courseId && activeCourse?.name, routeContext.classId && classes.find((item) => [item.id, item.code].includes(routeContext.classId))?.code, routeContext.classId && 'CÔNG VIỆC'].filter(Boolean).join(' / ')
    : tab === 'structure' ? 'VWORK / DANH SÁCH DỰ ÁN' : `VWORK / DỰ ÁN / ${activeProject?.code || ''}`;

  return <div className="vwork-training-operations app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">P1</span><div><strong>PeopleOne</strong><small>VWork Operations</small></div></div>
      <nav>
        {role === 'content' ? <><p>WORKSPACE</p><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Tổng quan dự án</button><button className={tab === 'structure' ? 'active' : ''} onClick={() => setTab('structure')}>Khóa học & lớp <b>{classes.length}</b></button><p>INPUT NỘI DUNG</p><button className={tab === 'inputs' ? 'active' : ''} onClick={() => setTab('inputs')}>Input cần cập nhật <b>{Object.entries(inputs).filter(([key, value]) => ['vlearning', 'game', 'discussion', 'assignment', 'test'].includes(key) && value).length}/5</b></button><p>CÔNG VIỆC</p><button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>Việc của tôi <b>{tasks.filter((task) => !task.archivedAt).length}</b></button></> : role === 'intake' ? <><p>ĐẦU MỐI</p><button className={tab === 'inputs' ? 'active' : ''} onClick={() => setTab('inputs')}>Danh sách lớp <b>{inputs.roster ? classes.length : 0}/{classes.length}</b></button><button className={tab === 'change' ? 'active' : ''} onClick={() => setTab('change')}>Yêu cầu thay đổi</button><p>CÔNG VIỆC</p><button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>Việc của tôi <b>{tasks.filter((task) => !task.archivedAt).length}</b></button></> : <>
          {!['manager', 'member'].includes(role) && <><p>WORKSPACE</p><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Tổng quan dự án</button><button className={tab === 'structure' ? 'active' : ''} onClick={() => setTab('structure')}>Khóa học & lớp <b>{classes.length}</b></button><button className={tab === 'inputs' ? 'active' : ''} onClick={() => setTab('inputs')}>Input readiness <b>{readyCount}/{INPUT_TOTAL}</b></button></>}
          <p>CÔNG VIỆC</p><button aria-label={role === 'member' ? 'Việc của tôi' : 'Công việc'} className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>{role === 'member' ? 'Việc của tôi' : 'Công việc'} <b>{tasks.filter((task) => !task.archivedAt).length}</b></button>{role === 'manager' && <><button className={tab === 'due' ? 'active' : ''} onClick={() => setTab('due')}>Việc sắp đến hạn <b>{tasks.filter((task) => task.status !== 'DONE' && task.status !== 'CANCELLED').slice(0, 7).length}</b></button><button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>Review Queue <b>{kpis.review}</b></button></>}
          {!['manager', 'member'].includes(role) && <><p>QUẢN LÝ</p>{role === 'operations' && <button className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}>Ekip & tài khoản <b>{accountDirectory.length}</b></button>}<button className={tab === 'change' ? 'active' : ''} onClick={() => setTab('change')}>Risk & Change</button><button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>Audit Log</button></>}
        </>}
      </nav>
      <div className="sidebar-note"><span>VẬN HÀNH ĐÀO TẠO</span><p>Store và API riêng; VTraining, VLearning chỉ được tham chiếu qua mã nguồn dữ liệu.</p><small className={`sync-indicator ${syncState}`}>{syncState === 'loading' ? 'Đang tải dữ liệu…' : syncState === 'saving' ? 'Đang lưu…' : syncState === 'synced' ? `Đã đồng bộ · v${stateVersion}` : syncState === 'seed' ? 'Chưa có dữ liệu DB · đang dùng seed' : 'Lỗi đồng bộ'}</small>{onSignOut && <button type="button" onClick={onSignOut}>Đăng xuất</button>}</div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div><small>{topbarPath}</small></div><div className="role-switch"><span>{availableRoles.length > 1 ? 'Đang làm việc với vai trò' : 'Vai trò hiện tại'}</span>{availableRoles.length > 1 ? <select aria-label="Chọn vai trò làm việc" value={role} onChange={(event) => void switchRole(event.target.value)}>{TRAINING_ROLE_OPTIONS.filter(([value]) => availableRoles.includes(value)).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select> : <strong>{TRAINING_ROLE_OPTIONS.find(([value]) => value === role)?.[1] || 'Thành viên ekip'}</strong>}<div className="avatar">NT</div></div></header>
      <main className={`workspace workspace-${tab}`}>
        {syncError && <div className="sync-error" role="alert"><span>{syncError}</span><button type="button" onClick={() => void loadWorkspace()}>Tải lại</button></div>}
        {role !== 'intake' && tab !== 'accounts' && !(role === 'content' && tab === 'inputs') && !(tab === 'change' && changeOpen) && <><section className="project-head"><div><div className="eyebrow"><span className="status-dot"></span>ĐANG CHUẨN BỊ · SCOPE V{activeScope?.version || 1}</div><h1>{activeProject?.name}</h1><p>{activeProject?.customerName} · 01 khóa học · {String(classes.length).padStart(2, '0')} lớp · {(activeCourse?.systems || []).join(' + ')} · {formatDate(activeProject?.startDate)} — {formatDate(activeProject?.deadline)}</p></div><div className="head-actions">{role === 'operations' && <button onClick={() => { setShowCreate(true); setCreateStep(1); }}>+ Tạo dự án</button>}{['operations', 'intake'].includes(role) && tab !== 'change' && <button className="primary" onClick={() => { setTab('change'); setChangeOpen(true); }}>+ Yêu cầu thay đổi</button>}</div></section>{!['manager', 'member'].includes(role) && <div className="journey structure-journey"><button className="done" onClick={() => setTab('structure')}><b>1</b><span>Dự án<small>{activeProject?.code}</small></span></button><i></i><button className="done" onClick={() => setTab('structure')}><b>2</b><span>Khóa học<small>{(activeCourse?.systems || []).join(' + ')}</small></span></button><i></i><button className="done" onClick={() => setTab('structure')}><b>3</b><span>{String(classes.length).padStart(2, '0')} lớp<small>Đã tạo & clone</small></span></button><i></i><button className={readyCount === INPUT_TOTAL ? 'done' : 'current'} onClick={() => setTab('inputs')}><b>4</b><span>Nhận input<small>{readyCount}/{INPUT_TOTAL} sẵn sàng</small></span></button><i></i><button onClick={() => setTab('tasks')}><b>5</b><span>Thực thi<small>{tasks.length} việc theo lớp</small></span></button></div>}</>}

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
        {tab === 'structure' && <StructureWorkspace role={role} tasks={tasks} classes={classes} project={activeProject} course={activeCourse} updateTask={updateTask} workflowClass={workflowClass} setWorkflowClass={setWorkflowClass}/>}
        {tab === 'inputs' && <Inputs role={role} inputs={inputs} inputRecords={workspaceState.inputs || []} classes={classes} uploadStep={uploadStep} setUploadStep={setUploadStep} submitInput={submitInput}/>}
        {tab === 'tasks' && <LayeredTasks role={role} tasks={tasks} classes={classes} directory={directory} directoryLoading={syncState === 'loading'} actor={actor} project={activeProject} course={activeCourse} routeContext={routeContext} onNavigate={navigateWork} selectedTask={selectedTask} setSelectedTaskId={setSelectedTaskId} updateTask={updateTask} createClassTask={createClassTask} archiveTask={archiveTask} assignTasks={assignTasks} toggleChecklist={toggleChecklist}/>}
        {tab === 'due' && <Tasks role={role} tasks={tasks} classes={classes} directory={directory} actor={actor} project={activeProject} course={activeCourse} selectedTask={selectedTask} setSelectedTaskId={setSelectedTaskId} updateTask={updateTask} assignTasks={assignTasks} toggleChecklist={toggleChecklist} view="due" onView={setTab}/>}
        {tab === 'review' && <ReviewQueue role={role} tasks={tasks} updateTask={updateTask}/>}
        {tab === 'accounts' && <AccountsPanel directory={accountDirectory} provisionAccount={provisionAccount}/>}
        {tab === 'change' && <ChangePanel role={role} open={changeOpen} setOpen={setChangeOpen} counts={scopeCounts} submit={submitScopeChange} requests={changeRequests} onRequest={requestChange} onApprove={approveChange} onInputUpdate={(label, type, objectKey, reason) => { const inputKey = objectKey === 'learner' ? 'roster' : objectKey === 'exercise' ? 'vlearning' : objectKey; void submitInput(inputKey, { data: { label, changeType: type, updatedAt: new Date().toISOString() }, reason: reason || `${label} · ${type}` }).then((response) => { if (response) setChangeOpen(false); }); }}/>} 
        {tab === 'audit' && <Audit entries={audit}/>} 
      </main>
    </div>
    {showCreate && <CreateWizard step={createStep} setStep={setCreateStep} close={() => setShowCreate(false)} directory={directory} confirm={async (payload) => { const response = await runCommand('CREATE_PROJECT', payload, 'Đã tạo dự án, khóa học, lớp và sinh công việc cấp lớp ở trạng thái Chờ input.'); if (response) setShowCreate(false); }}/>} 
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
    <div className="calendar-head">
      <div>
        <small>TỔNG QUAN THEO LỊCH · FEEDBACK 05</small>
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
            <span className={`badge ${task.status}`}>{STATUS_LABEL[task.status]}</span>
          </button>)}
        </div>
        <button onClick={onTasks}>Mở toàn bộ công việc của lớp</button>
      </aside>
    </div>
    {selectedEvent && <div className="calendar-dialog-backdrop" onClick={() => setSelectedEvent(null)}><div className="calendar-dialog" role="dialog" aria-modal="true" aria-label="Chi tiết lớp" onClick={(event) => event.stopPropagation()}><div className="calendar-dialog-head"><div><span>{selectedEvent.item.code}</span><h3>{selectedEvent.item.name}</h3><p>{formatDate(selectedEvent.item.startDate)} — {formatDate(selectedEvent.item.endDate)}</p></div><button aria-label="Đóng chi tiết lớp" onClick={() => setSelectedEvent(null)}>×</button></div><div className="calendar-dialog-grid"><div><small>Ngày đang chọn</small><b>{formatDate(selectedEvent.date)}</b></div><div><small>Khóa học</small><b>Trải nghiệm khách hàng</b></div><div><small>Hình thức</small><b>VTraining + VLearning</b></div><div><small>Công việc</small><b>{tasks.filter((task) => task.classCode === selectedEvent.item.code).length} việc</b></div></div><div className="calendar-dialog-actions"><button onClick={() => setSelectedEvent(null)}>Đóng</button><button className="primary" onClick={() => onTasks(selectedEvent.item)}>Mở công việc của lớp</button></div></div></div>}
    {selectedCalendarTask && <div className="calendar-dialog-backdrop" onClick={() => setSelectedCalendarTask(null)}><div className="calendar-dialog task-preview" role="dialog" aria-modal="true" aria-label="Chi tiết công việc" onClick={(event) => event.stopPropagation()}><div className="calendar-dialog-head"><div><span>{selectedCalendarTask.id} · {GROUP_META[selectedCalendarTask.group]?.[0]}</span><h3>{selectedCalendarTask.title}</h3><p>{activeClass.name}</p></div><button aria-label="Đóng chi tiết công việc" onClick={() => setSelectedCalendarTask(null)}>×</button></div><div className="calendar-dialog-grid"><div><small>Deadline</small><b>{dueLabel(selectedCalendarTask.startDate, selectedCalendarTask.dueOffset, selectedCalendarTask.dueDirection, selectedCalendarTask.anchorType)}</b></div><div><small>Trạng thái</small><b>{STATUS_LABEL[selectedCalendarTask.status]}</b></div><div><small>Quản lý ekip</small><b>{selectedCalendarTask.manager}</b></div><div><small>CTV thực hiện</small><b>{selectedCalendarTask.assignee}</b></div></div><section><h4>Checklist</h4>{selectedCalendarTask.checklistItems.map((item, index) => <label className="check-row" key={item}><input type="checkbox" checked={selectedCalendarTask.checklist[index]} readOnly/><span>{item}</span></label>)}</section><div className="calendar-dialog-actions"><button onClick={() => setSelectedCalendarTask(null)}>Đóng</button><button className="primary" onClick={onTasks}>Mở màn công việc</button></div></div></div>}
  </section>;
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

function AccountsPanel({ directory = [], provisionAccount }) {
  const [draft, setDraft] = useState({ fullName: '', email: '', roles: ['member'], password: generateTemporaryPassword() });
  const [editingEmail, setEditingEmail] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [created, setCreated] = useState(null);
  const [submitError, setSubmitError] = useState('');
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
    const result = await provisionAccount({ ...draft, fullName: draft.fullName.trim(), email: draft.email.trim().toLowerCase(), replaceRoles: Boolean(editingEmail) });
    setBusy(false);
    if (!result?.user) {
      setSubmitError(result?.error || 'Không thể tạo tài khoản ekip. Vui lòng thử lại.');
      return;
    }
    setCreated({ ...result.user, temporaryPassword: draft.password });
    resetForm();
  }
  return <section className="accounts-workspace">
    <div className="page-title accounts-title"><div><small>VWORK IDENTITY · END-TO-END</small><h2>Ekip và tài khoản đăng nhập</h2><p>Tạo đồng thời tài khoản Supabase Auth, hồ sơ PeopleOne và thành viên trong danh mục VWork để có thể giao việc thật.</p></div><span className="account-total">{directory.length} tài khoản VWork</span></div>
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
        <div className="account-form-actions">{editingEmail ? <button type="button" onClick={resetForm}>Hủy chỉnh sửa</button> : <button type="button" onClick={() => setDraft((current) => ({ ...current, password: generateTemporaryPassword() }))}>Tạo mật khẩu khác</button>}<button className="primary" type="submit" disabled={!valid || busy}>{busy ? 'Đang lưu…' : editingEmail ? 'Cập nhật role' : 'Lưu tài khoản và role'}</button></div>
        {!valid && <p className="account-validation-note">Điền đủ họ tên, email hợp lệ và chọn ít nhất một vai trò.</p>}
        {submitError && <div className="account-submit-error" role="alert">{submitError}</div>}
        <p className="account-security-note">Khi chỉnh tài khoản hiện có, các role VWork được thay bằng lựa chọn mới; tài khoản đăng nhập và mật khẩu không thay đổi.</p>
        {created && <div className="account-created" role="status"><b>{created.authUserCreated ? 'Đã tạo' : 'Đã cập nhật'} {created.name}</b><span>{created.email} · {(created.roles || [created.role]).map((value) => roleLabels[value] || value).join(' · ')}</span>{created.authUserCreated && <label>Mật khẩu tạm<input readOnly value={created.temporaryPassword} onFocus={(event) => event.target.select()}/></label>}<small>{created.authUserCreated ? 'Gửi thông tin này cho đúng người dùng qua kênh nội bộ an toàn.' : 'Tài khoản đăng nhập và mật khẩu cũ được giữ nguyên; role VWork đã được cập nhật.'}</small></div>}
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

function StructureWorkspace({ role, tasks, classes = CLASS_META, project, course, updateTask, workflowClass, setWorkflowClass }) {
  const [layer, setLayer] = useState('projects');
  const selectedMeta = classes.find((item) => item.code === workflowClass) || classes[0] || CLASS_META[0];
  const selectedTasks = tasks.filter((task) => task.classCode === workflowClass && task.group !== 'change');

  function openClass(code) {
    setWorkflowClass(code);
    setLayer('detail');
  }
  function toggleTask(id) {
    const task = tasks.find((item) => item.id === id);
    void updateTask(id, { status: task?.status === 'CANCELLED' ? 'WAITING_INPUT' : 'CANCELLED' });
  }

  return <section className="card full layered-browser">
    <div className="page-title">
      <div>
        <small>KHÓA HỌC & LỚP · FEEDBACK 05</small>
        <h2>{layer === 'projects' ? 'Danh sách dự án' : layer === 'courses' ? 'Các khóa học thuộc dự án' : layer === 'classes' ? 'Các lớp thuộc khóa học' : 'Chi tiết lớp và công việc'}</h2>
        <p>Mỗi tầng là một màn riêng: dự án → khóa học → lớp → chi tiết lớp.</p>
      </div>
      <nav className="layer-breadcrumb" aria-label="Điều hướng phân tầng">
        <button className={layer === 'projects' ? 'active' : ''} onClick={() => setLayer('projects')}>Dự án</button>
        {layer !== 'projects' && <><span>/</span><button className={layer === 'courses' ? 'active' : ''} onClick={() => setLayer('courses')}>{project?.code}</button></>}
        {['classes', 'detail'].includes(layer) && <><span>/</span><button className={layer === 'classes' ? 'active' : ''} onClick={() => setLayer('classes')}>{course?.name}</button></>}
        {layer === 'detail' && <><span>/</span><b>{selectedMeta.code}</b></>}
      </nav>
    </div>

    {layer === 'projects' && <div className="layer-list">
      <div className="layer-table-head project-layer"><span>Dự án</span><span>Khách hàng</span><span>Khóa học</span><span>Trạng thái</span></div>
      <button className="layer-row project-layer" onClick={() => setLayer('courses')}>
        <div><b>{project?.name}</b><small>{project?.code} · {formatDate(project?.startDate)} — {formatDate(project?.deadline)}</small></div>
        <span>{project?.customerName}</span><span>01 khóa học</span><em>Đang chuẩn bị</em>
      </button>
    </div>}

    {layer === 'courses' && <div className="layer-list">
      <div className="layer-table-head"><span>Khóa học</span><span>Hệ thống</span><span>Lớp</span><span>Trạng thái</span></div>
      <button className="layer-row" onClick={() => setLayer('classes')}>
        <div><b>{course?.name}</b><small>{course?.code} · {course?.contentVersion}</small></div>
        <span>{(course?.systems || []).join(' · ')}</span><span>{String(classes.length).padStart(2, '0')} lớp</span><em>Đang chuẩn bị</em>
      </button>
    </div>}

    {layer === 'classes' && <div className="layer-list">
      <div className="layer-table-head class-layer"><span>Lớp</span><span>Thời gian</span><span>Công việc</span><span>Trạng thái</span></div>
      {classes.map((item) => {
        const classTasks = tasks.filter((task) => task.classCode === item.code && task.group !== 'change');
        const done = classTasks.filter((task) => task.status === 'DONE').length;
        return <button className="layer-row class-layer" onClick={() => openClass(item.code)} key={item.code}>
          <div><b>{item.name}</b><small>{item.code} · clone từ Lớp mẫu</small></div>
          <span>{formatDate(item.startDate)} — {formatDate(item.endDate)}</span>
          <span>{classTasks.length} công việc</span>
          <em>{done}/{classTasks.length} hoàn thành</em>
        </button>;
      })}
    </div>}

    {layer === 'detail' && <div className="class-detail-layer">
      <div className="class-detail-head">
        <div><span>{selectedMeta.code}</span><h3>{selectedMeta.name}</h3><p>{formatDate(selectedMeta.startDate)} — {formatDate(selectedMeta.endDate)} · cấu hình độc lập từ Lớp mẫu</p></div>
        <button onClick={() => setLayer('classes')}>Quay lại danh sách lớp</button>
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
    </div>}
  </section>;
}
function Inputs({ role, inputs, inputRecords = [], classes, uploadStep, setUploadStep, submitInput }) {
  const [editing, setEditing] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [drafts, setDrafts] = useState({});
  if (role === 'intake') return <SaleRosterInputs classes={classes} uploaded={inputs.roster} uploadStep={uploadStep} setUploadStep={setUploadStep} submit={(draft) => submitInput('roster', draft)}/>;

  const editableByRole = {
    content: ['vlearning', 'game', 'discussion', 'assignment', 'test'],
    vtraining: ['material'],
  };
  const canSubmit = editableByRole[role] || [];
  const visibleKeys = role === 'content' ? editableByRole.content : role === 'vtraining' ? editableByRole.vtraining : Object.keys(INPUT_META);
  const visibleInputs = Object.entries(INPUT_META).filter(([key]) => visibleKeys.includes(key));
  const completed = visibleKeys.filter((key) => inputs[key]).length;

  function patchDraft(key, patch) {
    setDrafts((current) => ({ ...current, [key]: { ...(current[key] || {}), ...patch } }));
  }
  function activeVersionData(key) {
    const input = inputRecords.find((item) => item.key === key);
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
    if (key === 'material' && field.key === 'class_ids') return classes.map((item) => item.id || item.code).join(', ');
    if (key === 'material' && field.key === 'visible_from') return [...classes].map((item) => item.startDate).sort()[0] || '';
    if (key === 'material' && field.key === 'visible_to') return [...classes].map((item) => item.endDate).sort().at(-1) || '';
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
    const response = await submitInput(key, { data: inputData(key), file: draft.file });
    if (response) {
      setEditing('');
      setPreviewing(false);
    }
  }

  return <section className="card full role-input-workspace">
    <div className="page-title">
      <div>
        <small>{role === 'content' ? 'INPUT NỘI DUNG · FEEDBACK 05' : role === 'vtraining' ? 'INPUT VTRAINING · FEEDBACK 05' : 'INPUT READINESS · FEEDBACK 05'}</small>
        <h2>{role === 'content' ? 'Input nội dung cần cập nhật' : role === 'vtraining' ? 'Input tài liệu cần cập nhật' : 'Trạng thái toàn bộ input'}</h2>
        <p>{role === 'content' ? 'Chỉ hiển thị những input thuộc trách nhiệm Chuyên viên nội dung.' : role === 'vtraining' ? 'Chỉ hiển thị input thuộc trách nhiệm Chuyên viên vận hành VTraining.' : 'Quản lý vận hành theo dõi trạng thái; người phụ trách cập nhật ở workspace riêng.'}</p>
      </div>
      <div className="input-progress-summary"><b>{completed}/{visibleKeys.length}</b><span>đã cập nhật</span></div>
    </div>
    {!canSubmit.length && <div className="input-role-note"><b>Vai trò hiện tại chỉ theo dõi</b><span>Đổi sang Đầu mối/Sale, Chuyên viên nội dung hoặc Chuyên viên VTraining để nhập đúng phạm vi.</span></div>}
    <div className={visibleInputs.length <= 2 ? 'input-grid compact' : 'input-grid'}>
      {visibleInputs.map(([key, [code, title, owner]]) => { const inputRecord = inputRecords.find((item) => item.key === key); return <article className={`${inputs[key] ? 'input-card valid' : 'input-card'} ${editing === key ? 'editing' : ''}`} key={key}>
        <div><span>{code}</span><b>{inputs[key] ? `Đã cập nhật · v${inputRecord?.activeVersion || 1}` : 'CHƯA CÓ'}</b></div>
        <h3>{title}</h3>
        <p>Người cập nhật: {owner}</p>
        <div className="input-source"><small>Nguồn dữ liệu</small><strong>{key === 'material' ? 'Thư viện VTraining + link / file bổ sung' : key === 'roster' ? 'Excel lớp / học viên / nhóm' : 'Form VWork + file đính kèm'}</strong></div>
        {canSubmit.includes(key) && editing !== key && <button className={inputs[key] ? '' : 'primary'} onClick={() => beginEdit(key)}>{inputs[key] ? 'Tải lại & chỉnh sửa' : `Cập nhật ${title}`}</button>}
        {inputs[key] && editing !== key && <div className="input-updated"><b>Input v{inputRecord?.activeVersion || 1} đã sẵn sàng</b><small>Dữ liệu hiện tại sẽ được tải vào form khi chỉnh sửa.</small></div>}
        {editing === key && <div className="input-editor">
          <div className="input-editor-fields">{(INPUT_FIELDS[key] || []).map((field) => key === 'game' && field.key === 'game_content'
            ? <GameContentFields key={field.key} count={Number(drafts[key]?.game_count ?? defaultFieldValue(key, INPUT_FIELDS.game[0]))} values={drafts[key]?.game_contents || []} onCount={(count) => patchDraft(key, { game_count: String(count) })} onChange={(values) => patchDraft(key, { game_contents: values })}/>
            : <label key={field.key}>{field.label}{!field.required && <small> · tùy chọn</small>}<input type={field.type || 'text'} min={field.type === 'number' ? '0' : undefined} step={field.type === 'number' ? '1' : undefined} value={drafts[key]?.[field.key] ?? defaultFieldValue(key, field)} onChange={(event) => patchDraft(key, { [field.key]: event.target.value })}/></label>)}</div>
          <label className="file-field">File đính kèm {key === 'material' ? 'hoặc dùng link ở trên' : 'tùy chọn'}<input type="file" onChange={(event) => { const file = event.target.files?.[0]; patchDraft(key, { file, fileName: file?.name || '' }); }}/></label>
          {drafts[key]?.fileName && <div className="file-summary"><div><b>{drafts[key].fileName}</b><small>Đã cập nhật vào bản nháp · chờ xác nhận</small></div><button onClick={() => patchDraft(key, { fileName: '', file: null })}>Xóa file</button></div>}
          {previewing && <div className="input-preview"><b>Xác nhận Input v{(inputRecord?.activeVersion || 0) + 1}</b><span>{key === 'game' ? `${inputData(key).game_count} game` : `${(INPUT_FIELDS[key] || []).length} trường thông tin`} · {drafts[key]?.fileName ? '01 file đính kèm' : 'không có file'}</span><small>Có thể quay lại chỉnh form hoặc thay file trước khi xác nhận.</small></div>}
          <div className="input-editor-actions"><button onClick={() => { setEditing(''); setPreviewing(false); }}>Hủy</button>{!previewing ? <button disabled={hasMissingRequired(key)} onClick={() => setPreviewing(true)}>Kiểm tra & xem trước</button> : <button className="primary" disabled={hasMissingRequired(key)} onClick={() => confirm(key)}>Xác nhận cập nhật</button>}</div>
        </div>}
      </article>; })}
    </div>
  </section>;
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
function SaleRosterInputs({ classes, uploaded, uploadStep, setUploadStep, submit }) {
  const [file, setFile] = useState(null);
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  async function readFile(nextFile) {
    if (!nextFile) return;
    setFile(nextFile);
    setValidation(null);
    setUploadStep(1);
    setValidating(true);
    try {
      const result = await validateRosterWorkbook(nextFile, classes.map((item) => item.code));
      setValidation(result);
      setUploadStep(result.valid ? 2 : 1);
    } finally { setValidating(false); }
  }
  function resetFile() { setFile(null); setValidation(null); setUploadStep(0); }
  async function confirmFile() {
    if (!file || !validation?.valid || confirming) return;
    setConfirming(true);
    const response = await submit({ file, validation, data: validation.data });
    setConfirming(false);
    if (response) setUploadStep(3);
  }
  return <section className="card full">
    <div className="page-title"><div><small>SALE INPUT WORKSPACE · FEEDBACK V4</small><h2>Danh sách học viên theo lớp</h2><p>Hệ thống đọc dữ liệu ngay sau khi chọn file; người dùng chỉ cần kiểm tra trạng thái và xác nhận.</p></div><span className="permission-note">PHẠM VI SALE</span></div>
    <div className="sale-roster-grid">{classes.map((classItem, index) => <article className={uploaded && index === 0 ? 'input-card valid' : 'input-card'} key={classItem.code}>
      <div><span>{classItem.code}</span><b>{uploaded && index === 0 ? 'Đã cập nhật · V1' : 'CHƯA CÓ'}</b></div><h3>{classItem.name}</h3><p>Khai giảng: {formatDate(classItem.startDate)}</p>
      <div className="input-source"><small>Dữ liệu được phép cập nhật</small><strong>Danh sách học viên · Excel/CSV</strong></div>
      {index === 0 && !uploaded ? <div className="upload-flow">
        <div className="mini-steps"><span className="active">Tải file</span><span className={uploadStep >= 1 ? 'active' : ''}>Đã cập nhật</span><span className={uploadStep >= 2 ? 'active' : ''}>Xác nhận</span></div>
        {!file ? <label className="file-field">Chọn file danh sách<input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => void readFile(event.target.files?.[0])}/></label> : <div className="file-summary"><div><b>{file.name}</b><small>{validating ? 'Đang đọc dữ liệu…' : validation?.valid ? `Đã cập nhật · ${validation.summary?.rowCount || 0} học viên` : validation ? 'Không đọc được dữ liệu nghiệp vụ' : 'Đang chuẩn bị'}</small></div><button onClick={resetFile}>Thay file</button></div>}
        {validation?.errors?.length > 0 && <ul className="validation-errors">{validation.errors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}</ul>}
        {file && validation?.valid && <><div className="roster-preview"><b>Sẵn sàng xác nhận</b><span>{validation.summary?.rowCount || 0} học viên · {validation.summary?.classCount || 0} lớp · 00 bản ghi lỗi</span><small>Có thể thay file trước khi xác nhận.</small></div><button className="primary" disabled={confirming} onClick={() => void confirmFile()}>{confirming ? 'Đang tải lên…' : 'Xác nhận danh sách lớp'}</button></>}
      </div> : <button disabled={uploaded && index === 0}>Tải danh sách lớp</button>}
    </article>)}</div>
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
  const members = directory.filter((item) => directoryHasRole(item, 'member'));
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

    {layer === 'detail' && <div className="task-layout layered-task-detail"><section className="card task-table"><div className="class-detail-head"><div><span>{activeClass.code}</span><h3>{activeClass.name}</h3><p>Dự án EVNSPC 2026 / Trải nghiệm khách hàng / {activeClass.code}</p></div><button onClick={() => setLayer('classes')}>← Danh sách lớp</button></div>{role === 'manager' && <div className="bulk-assign"><label><input type="checkbox" checked={selectedIds.length === classTasks.length && classTasks.length > 0} onChange={() => setSelectedIds(selectedIds.length === classTasks.length ? [] : classTasks.map((task) => task.id))}/> Chọn tất cả</label><span>{selectedIds.length} việc đã chọn</span><select value={bulkAssignee} onChange={(event) => setBulkAssignee(event.target.value)}><option value="">Chọn CTV</option>{members.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><button className="primary" disabled={!selectedIds.length || !bulkAssignee || !reviewerId} onClick={assignSelected}>Giao cho CTV</button></div>}<div className={role === 'manager' ? 'table-head with-select' : 'table-head'}>{role === 'manager' && <span>Chọn</span>}<span>Công việc</span><span>Input</span><span>Deadline</span><span>Trạng thái</span></div>{groups.map(([group, items]) => <div className="task-group" key={group}><div className="task-group-title"><b>{GROUP_META[group][0]} · {GROUP_META[group][1]}</b><span>{items.length} việc</span></div>{items.map((task) => <div className={`${selectedTask.id === task.id ? 'task-row selected' : 'task-row'} ${role === 'manager' ? 'with-select' : ''}`} key={task.id}>{role === 'manager' && <label className="row-check"><input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => toggleSelected(task.id)} aria-label={`Chọn ${task.title}`}/></label>}<button className="task-open" onClick={() => setSelectedTaskId(task.id)}><b>{task.title}</b><small>{GROUP_META[task.group][0]} · {task.id} · {task.assignee}</small></button><span>{task.status === 'WAITING_INPUT' ? 'Thiếu input' : 'Đủ input'}</span><span>{dueLabel(task.startDate, task.dueOffset, task.dueDirection, task.anchorType)}</span><span className={`badge ${task.status}`}>{STATUS_LABEL[task.status]}</span></div>)}</div>)}</section><TaskDrawer role={role} task={selectedTask} directory={directory} actor={actor} updateTask={updateTask} toggleChecklist={toggleChecklist}/></div>}
  </section>;
}

function LayeredTasks({ role, tasks, classes = CLASS_META, directory = [], directoryLoading = false, actor, project, course, routeContext, onNavigate, selectedTask, setSelectedTaskId, updateTask, createClassTask, archiveTask, assignTasks, toggleChecklist }) {
  const layerFromRoute = () => routeContext.classId ? 'detail' : 'classes';
  const [layer, setLayer] = useState(layerFromRoute);
  const [classCode, setClassCode] = useState(routeContext.classId || classes[0]?.code || CLASS_META[0].code);
  const [selectedIds, setSelectedIds] = useState([]);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const baseTasks = tasks.filter((task) => !task.archivedAt);
  const canAssign = ['manager', 'operations'].includes(role);
  const canConfigure = ['operations', 'vtraining'].includes(role);
  const actorDirectory = directory.find((item) => [actor?.id, actor?.email].includes(item.id) || item.email === actor?.email);
  const reviewerId = actorDirectory?.roles?.some((item) => ['manager', 'operations'].includes(item))
    ? actorDirectory.id
    : directory.find((item) => item.roles?.some((value) => ['manager', 'operations'].includes(value)))?.id;
  const activeClass = classes.find((item) => [item.id, item.code].includes(classCode)) || classes[0] || CLASS_META[0];
  const classTasks = baseTasks.filter((task) => task.classId === activeClass.id || task.classCode === activeClass.code);
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
      <div className="class-detail-head"><div><span>{activeClass.code}</span><h3>{activeClass.name}</h3><p>{project?.name} / {course?.name} / {activeClass.code} / Công việc</p></div><div className="class-detail-actions"><button onClick={showClasses}>← Danh sách lớp</button>{canConfigure && <button className="primary" onClick={() => setShowAddTask((value) => !value)}>+ Thêm công việc</button>}</div></div>
      {showAddTask && <TaskCreateForm classItem={activeClass} onCancel={() => setShowAddTask(false)} onSubmit={async (draft) => { const response = await createClassTask(activeClass.id || activeClass.code, draft); if (response) setShowAddTask(false); }}/>}
      {canAssign && <div className="bulk-assign"><label><input type="checkbox" checked={selectedIds.length === classTasks.length && classTasks.length > 0} onChange={() => setSelectedIds(selectedIds.length === classTasks.length ? [] : classTasks.map((task) => task.id))}/> Chọn tất cả</label><span>{selectedIds.length} việc đã chọn</span><button className="primary" disabled={!selectedIds.length || !reviewerId} onClick={() => setAssignmentOpen(true)}>Giao việc</button></div>}
      <div className={canAssign ? 'table-head with-select' : 'table-head'}>{canAssign && <span>Chọn</span>}<span>Công việc</span><span>Input</span><span>Deadline</span><span>Trạng thái</span></div>
      {!classTasks.length && <div className="empty"><strong>Chưa có công việc</strong><p>{canConfigure ? 'Thêm công việc đầu tiên cho lớp này.' : 'Không có công việc trong phạm vi hiện tại.'}</p></div>}
      {groups.map(([group, items]) => <div className="task-group" key={group}><div className="task-group-title"><b>{GROUP_META[group][0]} · {GROUP_META[group][1]}</b><span>{items.length} việc</span></div>{items.map((task) => <div className={`${selectedTask?.id === task.id ? 'task-row selected' : 'task-row'} ${canAssign ? 'with-select' : ''}`} key={task.id}>{canAssign && <label className="row-check"><input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => toggleSelected(task.id)} aria-label={`Chọn ${task.title}`}/></label>}<button className="task-open" data-task-id={task.id} onClick={() => openTask(task)}><b>{task.title}</b><small>{GROUP_META[task.group][0]} · {task.id} · {task.assignee}</small></button><span>{task.status === 'WAITING_INPUT' ? 'Thiếu input' : 'Đủ input'}</span><span>{dueLabel(task.startDate, task.dueOffset, task.dueDirection, task.anchorType)}</span><span className={`badge ${task.status}`}>{STATUS_LABEL[task.status]}</span></div>)}</div>)}
    </section>{selectedTask && <TaskDrawer role={role} task={selectedTask} directory={directory} directoryLoading={directoryLoading} actor={actor} updateTask={updateTask} archiveTask={archiveTask} toggleChecklist={toggleChecklist} onClose={closeTask}/>}</div>}
    <AssigneePickerDialog open={assignmentOpen} directory={directory} loading={directoryLoading} taskCount={selectedIds.length} onClose={() => setAssignmentOpen(false)} onSelect={(person) => void assignSelected(person)}/>
  </section>;
}

function TaskCreateForm({ classItem, onCancel, onSubmit }) {
  const [draft, setDraft] = useState({ title: '', group: 'setup', inputKey: 'roster', dueOffset: 2, checklistText: '' });
  const checklistItems = draft.checklistText.split('\n').map((item) => item.trim()).filter(Boolean);
  const valid = draft.title.trim() && checklistItems.length;
  return <form className="task-create-form" onSubmit={(event) => { event.preventDefault(); if (valid) void onSubmit({ ...draft, title: draft.title.trim(), checklistItems }); }}>
    <div><b>Thêm công việc cho {classItem.code}</b><button type="button" onClick={onCancel}>Đóng</button></div>
    <div className="form-grid"><label>Tên công việc<input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}/></label><label>Nhóm<select value={draft.group} onChange={(event) => setDraft((current) => ({ ...current, group: event.target.value }))}>{Object.entries(GROUP_META).map(([value, [, label]]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Input cần có<select value={draft.inputKey} onChange={(event) => setDraft((current) => ({ ...current, inputKey: event.target.value }))}>{Object.entries(INPUT_META).map(([value, [code, label]]) => <option value={value} key={value}>{code} · {label}</option>)}</select></label><label>Deadline trước lớp (ngày)<input type="number" min="0" step="1" value={draft.dueOffset} onChange={(event) => setDraft((current) => ({ ...current, dueOffset: Number(event.target.value) }))}/></label><label className="wide">Checklist, mỗi dòng một tiêu chí<textarea rows="4" value={draft.checklistText} onChange={(event) => setDraft((current) => ({ ...current, checklistText: event.target.value }))}/></label></div>
    <div className="task-create-actions"><button type="button" onClick={onCancel}>Hủy</button><button className="primary" disabled={!valid}>Lưu công việc</button></div>
  </form>;
}

function AssigneePickerDialog({ open, directory, loading, taskCount, selectedId = '', onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const [chosenId, setChosenId] = useState(selectedId);
  const inputRef = useRef(null);
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
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus.current?.focus?.(); };
  }, [open, selectedId]);
  if (!open) return null;
  const token = query.trim().toLowerCase();
  const filtered = directory.filter((item) => !token || `${item.name} ${item.email || item.id}`.toLowerCase().includes(token));
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
  return <div className="assignment-dialog-backdrop" onMouseDown={onClose}><section className="assignment-dialog" role="dialog" aria-modal="true" aria-labelledby="assignment-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-head"><div><small>PHÂN CÔNG THEO DIRECTORY</small><h2 id="assignment-dialog-title">Bạn muốn giao việc cho ai?</h2></div><button type="button" aria-label="Đóng popup giao việc" onClick={onClose}>×</button></div>
    <div className="assignment-dialog-body"><label className="assignee-search">Tìm theo tên hoặc email<input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập tên hoặc email…"/></label><p>Mỗi công việc hiện hỗ trợ một người thực hiện; lựa chọn này áp dụng cho {taskCount || 1} công việc đã chọn.</p>
      {!query && recent.length > 0 && <div className="assignee-section"><b>Đã chọn gần đây</b>{recent.map((person) => <PersonRow person={person} key={`recent-${person.id}`}/>)}</div>}
      <div className="assignee-section"><b>Tài khoản có thể nhận việc</b>{loading ? <div className="assignee-state">Đang tải danh mục tài khoản…</div> : !filtered.length ? <div className="assignee-state">{directory.length ? 'Không tìm thấy tài khoản phù hợp.' : 'Chưa có tài khoản Quản lý ekip hoặc Thành viên ekip.'}</div> : filtered.map((person) => <PersonRow person={person} key={person.id}/>)}</div>
    </div>
    <div className="modal-actions"><button type="button" onClick={onClose}>Hủy</button><button type="button" className="primary" disabled={!chosenPerson} onClick={selectPerson}>Giao việc</button></div>
  </section></div>;
}

function Tasks({ role, tasks, classes = CLASS_META, directory = [], actor, project, course, selectedTask, setSelectedTaskId, updateTask, assignTasks, toggleChecklist, view = 'hierarchy', onView }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [activeClassCode, setActiveClassCode] = useState(selectedTask?.classCode || classes[0]?.code || CLASS_META[0].code);
  const baseVisible = tasks;
  const members = directory.filter((item) => directoryHasRole(item, 'member'));
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
  return <div className="task-layout"><section className="card task-table"><div className="page-title"><div><small>{role === 'member' ? 'MY WORK' : 'TASK MANAGEMENT · THEO CẤU TRÚC VTRAINING'}</small><h2>{role === 'member' ? 'Việc của tôi' : view === 'due' ? 'Việc sắp đến hạn' : 'Công việc theo lớp'}</h2><p>{view === 'due' ? 'Ưu tiên deadline của các công việc thuộc từng lớp.' : 'Chọn lớp, sau đó quản lý và phân công theo từng nhóm việc trong lớp.'}</p></div>{role === 'manager' && <div className="task-view-tabs"><button className={view === 'hierarchy' ? 'active' : ''} onClick={() => onView('tasks')}>Công việc</button><button className={view === 'due' ? 'active' : ''} onClick={() => onView('due')}>Sắp đến hạn</button></div>}</div>{view === 'hierarchy' && <div className="task-scope-tree"><article><span>DỰ ÁN</span><b>EVNSPC 2026</b><small>01 khóa học</small></article><i></i><article><span>KHÓA HỌC</span><b>Trải nghiệm khách hàng</b><small>03 lớp</small></article><i></i><div className="task-class-tabs">{CLASS_META.map((classMeta) => <button className={activeClassCode === classMeta.code ? 'active' : ''} key={classMeta.code} onClick={() => chooseClass(classMeta.code)}><span>{classMeta.code}</span><b>{classMeta.name}</b><small>{baseVisible.filter((task) => task.classCode === classMeta.code).length} công việc</small></button>)}</div></div>}{role === 'manager' && <div className="bulk-assign"><label><input type="checkbox" checked={selectedIds.length === visible.length && visible.length > 0} onChange={() => setSelectedIds(selectedIds.length === visible.length ? [] : visible.map((task) => task.id))}/> Chọn tất cả</label><span>{selectedIds.length} việc đã chọn</span><select value={bulkAssignee} onChange={(event) => setBulkAssignee(event.target.value)}><option value="">Chọn CTV</option>{members.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><button className="primary" disabled={!selectedIds.length || !bulkAssignee || !reviewerId} onClick={assignSelected}>Giao cho CTV</button></div>}<div className={role === 'manager' ? 'table-head with-select' : 'table-head'}>{role === 'manager' && <span>Chọn</span>}<span>Công việc</span><span>Input</span><span>Deadline</span><span>Trạng thái</span></div>{grouped.map(([label, items]) => <div className="task-group" key={label}><div className="task-group-title"><b>{view === 'hierarchy' ? `${GROUP_META[items[0]?.group]?.[0]} · ${label}` : label}</b><span>{items.length} việc</span></div>{items.map((task) => <div className={`${selectedTask?.id === task.id ? 'task-row selected' : 'task-row'} ${role === 'manager' ? 'with-select' : ''}`} key={task.id}>{role === 'manager' && <label className="row-check"><input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => toggleSelected(task.id)} aria-label={`Chọn ${task.title} · ${task.classCode}`}/></label>}<button className="task-open" onClick={() => setSelectedTaskId(task.id)}><b>{task.title}</b><small>Dự án EVNSPC 2026 / Trải nghiệm khách hàng / {task.classCode} / {GROUP_META[task.group]?.[0]} · {task.id} · {task.assignee}</small></button><span>{task.status === 'WAITING_INPUT' ? 'Thiếu input' : 'Đủ input'}</span><span>{dueLabel(task.startDate, task.dueOffset, task.dueDirection, task.anchorType)}</span><span className={`badge ${task.status}`}>{STATUS_LABEL[task.status]}</span></div>)}</div>)}</section><TaskDrawer role={role} task={selectedTask} directory={directory} actor={actor} updateTask={updateTask} toggleChecklist={toggleChecklist}/></div>;
}
function TaskDrawer({ role, task, directory = [], directoryLoading = false, actor, updateTask, archiveTask, toggleChecklist, onClose }) {
  const drawerRef = useRef(null);
  const [actualOutput, setActualOutput] = useState(task?.actualOutput || '');
  const [evidence, setEvidence] = useState(task?.evidence || '');
  const [evidenceRecord, setEvidenceRecord] = useState(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId || '');
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [priority, setPriority] = useState(task?.priority || 'Normal');
  const [plannedDeadline, setPlannedDeadline] = useState(task?.plannedDeadline || '');
  const [deadlineOverrideReason, setDeadlineOverrideReason] = useState('');
  const [blocker, setBlocker] = useState(task?.blocker || '');
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
    setConfigDraft({ title: task?.title || '', group: task?.group || 'setup', dueOffset: task?.dueOffset || 0, checklistText: (task?.checklistItems || []).join('\n') });
    window.setTimeout(() => drawerRef.current?.focus(), 0);
  }, [task?.id, task?.actualOutput, task?.evidence, task?.assigneeId, task?.priority, task?.plannedDeadline, task?.blocker]);
  if (!task?.id) return <aside className="card task-drawer"><div className="empty">Chưa có công việc trong phạm vi này.</div></aside>;
  const allDone = task.checklist.every(Boolean);
  const needsDeadlineReason = Boolean(plannedDeadline && plannedDeadline > task.startDate);
  const actorTokens = new Set([actor?.id, actor?.email, actor?.name].map((item) => String(item || '').toLowerCase()).filter(Boolean));
  const canExecute = [task.assigneeId, task.assignee].some((item) => actorTokens.has(String(item || '').toLowerCase()));
  const canAssign = ['manager', 'operations'].includes(role);
  const canConfigure = ['operations', 'vtraining'].includes(role);
  const reviewer = directory.find((item) => [task.reviewerId, actor?.id, actor?.email].includes(item.id) || item.email === actor?.email);
  const configChecklist = configDraft.checklistText.split('\n').map((item) => item.trim()).filter(Boolean);
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
    <div className="drawer-head"><div><span>{task.classCode} · {GROUP_META[task.group]?.[0]} · {task.id}</span><h2>{task.title}</h2><small>{task.className} · Cấp lớp · {GROUP_META[task.group]?.[1]}</small></div><div className="drawer-head-actions"><span className={`badge ${task.status}`}>{STATUS_LABEL[task.status]}</span>{onClose && <button type="button" aria-label="Đóng chi tiết công việc" onClick={onClose}>×</button>}</div></div>
    <div className="meta-grid"><div><small>Quản lý ekip</small><b>{task.manager}</b></div><div><small>Người thực hiện</small><b>{task.assignee}</b></div><div><small>Deadline</small><b>{dueLabel(task.startDate, task.dueOffset, task.dueDirection, task.anchorType)}</b></div><div><small>Progress tự động</small><b>{task.progress}%</b></div></div>
    <section><h3>Required / Actual Input</h3>{task.requiredInputCodes?.map((code) => { const input = Object.values(INPUT_META).find(([itemCode]) => itemCode === code); return <div className="input-line" key={code}><span>{code} · {input?.[1] || 'Input bắt buộc'}</span><b>{task.requiredInputVersions?.[code] ? `Đã khóa v${task.requiredInputVersions[code]}` : 'Còn thiếu'}</b></div>; })}</section>
    {canAssign && <section><h3>Phân công người thực hiện</h3><div className="form-grid"><label>Người thực hiện<button type="button" className="assignee-trigger" onClick={() => setAssignmentOpen(true)}>{directory.find((item) => item.id === assigneeId)?.name || task.assignee || 'Bạn muốn giao việc cho ai?'}</button></label><label>Người xác nhận<input value={task.reviewer || reviewer?.name || actor?.name || task.manager} readOnly/></label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option>Low</option><option>Normal</option><option>High</option><option>Critical</option></select></label><label>Deadline<input type="date" value={plannedDeadline} onChange={(event) => setPlannedDeadline(event.target.value)}/></label>{needsDeadlineReason && <label className="wide">Lý do deadline sau khai giảng<textarea value={deadlineOverrideReason} onChange={(event) => setDeadlineOverrideReason(event.target.value)} placeholder="Nêu rõ ngoại lệ vận hành..."/></label>}</div><button disabled={!assigneeId || !reviewer || (needsDeadlineReason && !deadlineOverrideReason.trim())} onClick={() => { const assignee = directory.find((item) => item.id === assigneeId); if (assignee && reviewer) void updateTask(task.id, { assigneeId: assignee.id, assignee: assignee.name, priority, reviewerId: reviewer.id, reviewer: reviewer.name, plannedDeadline, deadlineOverrideReason: deadlineOverrideReason.trim() }, `Đã giao ${task.id} cho ${assignee.name}.`); }}>Lưu phân công</button></section>}
    {canConfigure && <section className="task-config-section"><h3>Cấu hình công việc trong lớp</h3><div className="form-grid"><label>Tên công việc<input value={configDraft.title} onChange={(event) => setConfigDraft((current) => ({ ...current, title: event.target.value }))}/></label><label>Nhóm<select value={configDraft.group} onChange={(event) => setConfigDraft((current) => ({ ...current, group: event.target.value }))}>{Object.entries(GROUP_META).map(([value, [, label]]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Deadline trước lớp (ngày)<input type="number" min="0" step="1" value={configDraft.dueOffset} onChange={(event) => setConfigDraft((current) => ({ ...current, dueOffset: Number(event.target.value) }))}/></label><label className="wide">Checklist<textarea rows="5" value={configDraft.checklistText} onChange={(event) => setConfigDraft((current) => ({ ...current, checklistText: event.target.value }))}/></label></div><button disabled={!configDraft.title.trim() || !configChecklist.length} onClick={() => updateTask(task.id, { title: configDraft.title.trim(), group: configDraft.group, dueOffset: configDraft.dueOffset, checklistItems: configChecklist }, `Đã cập nhật cấu hình ${task.id}.`)}>Lưu cấu hình</button><button className="danger-action" disabled={['IN_PROGRESS', 'IN_REVIEW'].includes(task.status)} onClick={() => void archiveTask(task.id)}>Xóa công việc</button></section>}
    {canExecute && <section><h3>Checklist hoàn thành</h3>{task.checklist.map((checked, index) => <label className="check-row" key={task.checklistItems[index]}><input type="checkbox" checked={checked} disabled={!['IN_PROGRESS', 'REWORK'].includes(task.status)} onChange={() => toggleChecklist(index)}/><span>{task.checklistItems[index]}</span></label>)}{task.status === 'READY' && <button className="primary" onClick={() => updateTask(task.id, { status: 'IN_PROGRESS' }, `Bắt đầu ${task.id}.`)}>Bắt đầu công việc</button>}{['IN_PROGRESS', 'REWORK'].includes(task.status) && <><label className="field">Vướng mắc / blocker<textarea value={blocker} onChange={(event) => setBlocker(event.target.value)} placeholder="Để trống nếu không có vướng mắc..."/></label><button type="button" onClick={() => updateTask(task.id, { blocker }, `Đã lưu vướng mắc của ${task.id}.`)}>Lưu tiến độ</button><label className="field">Kết quả thực tế<textarea value={actualOutput} onChange={(event) => setActualOutput(event.target.value)} placeholder="Mô tả kết quả thực tế..."/></label><label className="field">Evidence URL / ID<input value={evidenceRecord ? '' : evidence} disabled={Boolean(evidenceRecord)} onChange={(event) => setEvidence(event.target.value)} placeholder="https://... hoặc ID VTraining"/></label><label className="field">Hoặc tải file minh chứng<input type="file" disabled={uploadingEvidence} onChange={(event) => void selectEvidenceFile(event.target.files?.[0])}/></label>{evidenceRecord && <small className="hint">Đã tải riêng tư: {evidenceRecord.name}</small>}{evidenceError && <small className="hint error">{evidenceError}</small>}<button className="primary" disabled={uploadingEvidence || !allDone || !actualOutput.trim() || (!evidence.trim() && !evidenceRecord)} onClick={() => updateTask(task.id, { status: 'IN_REVIEW', actualOutput: actualOutput.trim(), evidence: evidence.trim(), evidenceRecord }, `Đã gửi ${task.id} yêu cầu xác nhận hoàn thành.`)}>Gửi yêu cầu xác nhận</button>{(!allDone || !actualOutput.trim() || (!evidence.trim() && !evidenceRecord)) && <small className="hint">Hoàn tất checklist, mô tả kết quả và thêm URL/ID hoặc file minh chứng để gửi xác nhận.</small>}</>}</section>}
    {!canExecute && !canAssign && !canConfigure && <div className="read-only">Vai trò hiện tại chỉ được xem trạng thái công việc.</div>}
    <AssigneePickerDialog open={assignmentOpen} directory={directory} loading={directoryLoading} taskCount={1} selectedId={assigneeId} onClose={() => setAssignmentOpen(false)} onSelect={(person) => { setAssigneeId(person.id); setAssignmentOpen(false); }}/>
  </aside>;
}

function ReviewQueue({ role, tasks, updateTask }) {
  const [evidenceError, setEvidenceError] = useState('');
  const queue = tasks.filter((task) => task.status === 'IN_REVIEW');
  async function openEvidence(task) {
    const record = task.outputs?.at(-1)?.evidence?.[0];
    setEvidenceError('');
    try {
      const url = record?.path ? await getTrainingOperationsFileUrl(record.path, record.name, role) : record?.url || task.evidence;
      if (!url) throw new Error('Công việc chưa có minh chứng hợp lệ.');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setEvidenceError(error.message || 'Không thể mở minh chứng.');
    }
  }
  return <section className="card full"><div className="page-title"><div><small>REVIEW QUEUE</small><h2>Chờ Quản lý ekip xác nhận</h2><p>Task chỉ hoàn thành sau khi Quản lý ekip chọn Đạt.</p></div><span className="queue-count">{queue.length}</span></div>{evidenceError && <div className="read-only">{evidenceError}</div>}{!queue.length ? <div className="empty"><strong>Chưa có yêu cầu xác nhận</strong><p>CTV cần hoàn tất checklist, thêm evidence và gửi yêu cầu xác nhận.</p></div> : queue.map((task) => <article className="review-card" key={task.id}><div><span>{task.id}</span><h3>{task.title}</h3><p>Kết quả: {task.actualOutput || 'Đã hoàn thành theo checklist chi tiết.'}</p><button type="button" onClick={() => void openEvidence(task)}>Mở evidence: {task.outputs?.at(-1)?.evidence?.[0]?.name || task.evidence}</button><div className="review-meta"><span>Checklist {task.checklist.filter(Boolean).length}/{task.checklist.length}</span><span>Input đã khóa</span><span>Rework {task.rework}</span><span>Progress {task.progress}%</span></div></div><div><button className="pass" onClick={() => updateTask(task.id, { status: 'DONE', comment: 'Đạt yêu cầu.' }, `Đã xác nhận PASS ${task.id}.`)}>Đạt</button><button className="rework" onClick={() => updateTask(task.id, { status: 'REWORK', comment: 'Cần bổ sung cấu hình hoặc evidence theo tiêu chí review.' }, `Đã trả REWORK ${task.id}.`)}>Yêu cầu làm lại</button></div></article>)}</section>;
}
function formatDate(isoDate) { const [year, month, day] = isoDate.split('-'); return `${day}/${month}/${year}`; }
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
  if (objectKey === 'learner') fields = changeType === 'file' ? <><label>Lớp cần cập nhật<select><option>TNKH01</option><option>TNKH02</option><option>TNKH03</option></select></label><label>File cập nhật<input type="file" accept=".xlsx,.xls,.csv"/></label><div className="delta-preview"><span><b>+12</b>Học viên mới</span><span><b>-3</b>Bị xóa</span><span><b>5</b>Sửa thông tin</span><span><b>2</b>Bản ghi lỗi</span></div></> : <><label>Lớp<select><option>TNKH01</option><option>TNKH02</option><option>TNKH03</option></select></label><label>Phương thức<select><option>Nhập / chọn trực tiếp</option><option>Tải file delta</option></select></label><label>Thông tin thay đổi<input defaultValue={changeType === 'add' ? 'Thêm 01 học viên' : changeType === 'remove' ? 'Xóa 01 học viên' : 'Sửa email / đơn vị'}/></label></>;
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
function Audit({ entries }) { return <section className="card full"><div className="page-title"><div><small>AUDIT LOG</small><h2>Lịch sử không thể chỉnh sửa</h2><p>Ai làm gì, lúc nào, trên phiên bản nào.</p></div></div><div className="audit-list">{entries.map((entry, index) => <div key={`${entry}-${index}`}><span></span><div><b>{entry}</b><small>VWork Operations · Phiên làm việc hiện tại</small></div></div>)}</div></section>; }

function CreateWizard({ step, setStep, close, confirm, directory = [] }) {
  const stages = ['Dự án', 'Khóa học', 'Lớp', 'Nhóm việc', 'Xác nhận'];
  const managers = directory.filter((item) => directoryHasRole(item, 'manager'));
  const [systems, setSystems] = useState(['VTraining', 'VLearning']);
  const [projectDraft, setProjectDraft] = useState({ id: 'EVNSPC-2026-02', name: 'Đào tạo Trải nghiệm khách hàng EVNSPC 2026 · Đợt 2', customerName: 'EVNSPC', startDate: '2026-10-01', deadline: '2026-10-31', teamId: managers[0]?.id || '' });
  const [courseDraft, setCourseDraft] = useState({ id: 'CX-FOUNDATION-02', name: 'Trải nghiệm khách hàng · Đợt 2', contentVersion: '2026-v1' });
  const [editingChecklist, setEditingChecklist] = useState('');
  const [checklistDrafts, setChecklistDrafts] = useState(() => Object.fromEntries(taskTemplates.map(([, id, , , , items]) => [id, items.join('\n')])));
  const [draftClasses, setDraftClasses] = useState(() => CLASS_META.map((item, index) => ({ ...item, id: `TNKH2${String(index + 1).padStart(2, '0')}`, code: `TNKH2${String(index + 1).padStart(2, '0')}`, courseId: 'CX-FOUNDATION-02', name: `Lớp ${String(index + 1).padStart(2, '0')} · CSKH EVNSPC · Đợt 2`, startDate: `2026-10-${String(1 + index * 7).padStart(2, '0')}`, endDate: `2026-10-${String(5 + index * 7).padStart(2, '0')}` })));
  const [addingClass, setAddingClass] = useState(false);
  const [classDraft, setClassDraft] = useState({ code: 'TNKH204', name: 'Lớp 04 · CSKH EVNSPC · Đợt 2', startDate: '2026-10-22', endDate: '2026-10-26', cloneFrom: 'LỚP MẪU' });
  function toggleSystem(system) { setSystems((current) => current.includes(system) ? current.filter((item) => item !== system) : [...current, system]); }
  function addDraftClass() {
    if (!classDraft.code.trim() || !classDraft.name.trim() || !classDraft.startDate || !classDraft.endDate || classDraft.endDate < classDraft.startDate) return;
    setDraftClasses((current) => [...current, { ...classDraft }]);
    setAddingClass(false);
    const nextNumber = draftClasses.length + 2;
    setClassDraft({ code: `TNKH2${String(nextNumber).padStart(2, '0')}`, name: `Lớp ${String(nextNumber).padStart(2, '0')} · CSKH EVNSPC · Đợt 2`, startDate: '2026-10-29', endDate: '2026-11-02', cloneFrom: 'LỚP MẪU' });
  }
  function removeDraftClass(code) {
    setDraftClasses((current) => current.length > 1 ? current.filter((item) => item.code !== code) : current);
  }
  function createPayload() {
    return {
      project: { ...projectDraft, customerId: projectDraft.customerName, classCount: draftClasses.length },
      course: { ...courseDraft, systems },
      classes: draftClasses.map((item) => ({ ...item, cloneFrom: item.cloneFrom === 'LỚP MẪU' ? 'CLASS_TEMPLATE' : item.cloneFrom })),
      scope: {
        selectedContents: systems.map((item) => item.toUpperCase()),
        instanceCount: { VLEARNING: 1, GAMIFICATION: 2, DISCUSSION: 2, ASSIGNMENT: 1, TEST: 1, MATERIAL: 4 },
      },
    };
  }
  return <div className="modal-backdrop"><div className="modal modal-wide">
    <div className="modal-head"><div><small>KHỞI TẠO TRIỂN KHAI ĐÀO TẠO</small><h2>Dự án → khóa học → lớp → nhóm việc → công việc</h2></div><button onClick={close} aria-label="Đóng">×</button></div>
    <div className="wizard-steps">{stages.map((label, index) => <div className={step >= index + 1 ? 'active' : ''} key={label}><b>{index + 1}</b><span>{label}</span></div>)}</div>
    {step === 1 && <div className="wizard-body"><div className="step-intro"><span>BƯỚC 1</span><h3>Thông tin dự án</h3><p>Dự án là cấp quản lý tổng, chứa các khóa học; chưa sinh công việc tại cấp này.</p></div><div className="form-grid"><label>Tên dự án<input value={projectDraft.name} onChange={(event) => setProjectDraft((current) => ({ ...current, name: event.target.value }))}/></label><label>Khách hàng<input value={projectDraft.customerName} onChange={(event) => setProjectDraft((current) => ({ ...current, customerName: event.target.value }))}/></label><label>Ngày bắt đầu<input type="date" value={projectDraft.startDate} onChange={(event) => setProjectDraft((current) => ({ ...current, startDate: event.target.value }))}/></label><label>Deadline tổng<input type="date" value={projectDraft.deadline} onChange={(event) => setProjectDraft((current) => ({ ...current, deadline: event.target.value }))}/></label><label>Ekip phụ trách<select value={projectDraft.teamId} onChange={(event) => setProjectDraft((current) => ({ ...current, teamId: event.target.value }))}><option value="">{managers.length ? 'Chọn Quản lý ekip' : 'Chưa có tài khoản Quản lý ekip'}</option>{managers.map((manager) => <option value={manager.id} key={manager.id}>{manager.name} · {manager.id}</option>)}</select>{!managers.length && <small className="field-hint error">Đóng cửa sổ và tạo tài khoản Quản lý ekip trước.</small>}</label><label>Mã dự án<input value={projectDraft.id} onChange={(event) => setProjectDraft((current) => ({ ...current, id: event.target.value }))}/></label></div></div>}
    {step === 2 && <div className="wizard-body"><div className="step-intro"><span>BƯỚC 2</span><h3>Khởi tạo khóa học trong dự án</h3><p>Khóa học là cấu trúc chung, chứa nhiều lớp triển khai.</p></div><div className="form-grid"><label>Tên khóa học<input value={courseDraft.name} onChange={(event) => setCourseDraft((current) => ({ ...current, name: event.target.value }))}/></label><fieldset className="system-multiselect"><legend>Hệ thống áp dụng</legend><div className="system-options">{COURSE_SYSTEMS.map((system) => <label key={system.id}><input type="checkbox" checked={systems.includes(system.id)} onChange={() => toggleSystem(system.id)}/><span>{system.id}</span>{!system.mature && <em>Mở rộng sau</em>}</label>)}</div><small>VSurvey và VEvent mới ghi nhận phạm vi; cấu hình chuyên sâu thực hiện ở đợt sau.</small></fieldset><label>Mã khóa học<input value={courseDraft.id} onChange={(event) => setCourseDraft((current) => ({ ...current, id: event.target.value }))}/></label><label>Phiên bản nội dung<input value={courseDraft.contentVersion} onChange={(event) => setCourseDraft((current) => ({ ...current, contentVersion: event.target.value }))}/></label></div></div>}
    {step === 3 && <div className="wizard-body"><div className="step-intro"><span>BƯỚC 3</span><h3>Tạo các lớp trong khóa học</h3><p>Mỗi lớp clone từ Lớp mẫu và giữ lịch, input, nhóm việc riêng.</p></div><div className="class-list">{draftClasses.map((item) => <article key={item.code}><b>{item.name}</b><span>{formatDate(item.startDate)} — {formatDate(item.endDate)}</span><em>Clone từ Lớp mẫu</em><button type="button" className="remove-class" disabled={draftClasses.length === 1} onClick={() => removeDraftClass(item.code)}>Xóa lớp</button></article>)}</div>{addingClass ? <div className="add-class-form"><div className="form-grid"><label>Mã lớp<input value={classDraft.code} onChange={(event) => setClassDraft((current) => ({ ...current, code: event.target.value }))}/></label><label>Tên lớp<input value={classDraft.name} onChange={(event) => setClassDraft((current) => ({ ...current, name: event.target.value }))}/></label><label>Ngày bắt đầu<input type="date" value={classDraft.startDate} onChange={(event) => setClassDraft((current) => ({ ...current, startDate: event.target.value }))}/></label><label>Ngày kết thúc<input type="date" value={classDraft.endDate} onChange={(event) => setClassDraft((current) => ({ ...current, endDate: event.target.value }))}/></label><label>Clone cấu hình từ<select value={classDraft.cloneFrom} onChange={(event) => setClassDraft((current) => ({ ...current, cloneFrom: event.target.value }))}><option>LỚP MẪU</option>{draftClasses.map((item) => <option key={item.code}>{item.code}</option>)}</select></label></div><div className="add-class-actions"><button onClick={() => setAddingClass(false)}>Hủy</button><button className="primary" disabled={!classDraft.code.trim() || !classDraft.name.trim() || !classDraft.startDate || !classDraft.endDate || classDraft.endDate < classDraft.startDate} onClick={addDraftClass}>Lưu lớp</button></div></div> : <button onClick={() => setAddingClass(true)}>+ Thêm lớp</button>}</div>}
    {step === 4 && <div className="wizard-body"><div className="step-intro"><span>BƯỚC 4</span><h3>Nhóm việc và công việc của lớp</h3><p>Nhóm việc chỉ được sinh bên trong từng lớp. Deadline neo theo ngày khai giảng của lớp.</p></div><div className="clone-toolbar"><label>Lớp đang cấu hình<select><option>Lớp 02 · CSKH EVNSPC</option></select></label><label>Nguồn cấu hình<select value="TEMPLATE" disabled><option value="TEMPLATE">Lớp mẫu · Bộ cấu hình chuẩn</option></select></label></div><div className="deadline-rule-table"><div className="deadline-rule-head"><span>Phạm vi</span><span>Mốc neo</span><span>Hướng tính</span><span>Số ngày</span></div><div><b>Lớp đang cấu hình</b><span>Ngày khai giảng của lớp</span><span>Tính ngược</span><input type="number" defaultValue="2"/></div></div><div className="task-template-list v4">{Object.keys(GROUP_META).map((group) => { const templates = taskTemplates.filter(([taskGroup]) => taskGroup === group); return templates.length ? <section className="wizard-task-group" key={group}><h3>{GROUP_META[group][0]} · {GROUP_META[group][1]}</h3>{templates.map(([, id, title, , , checklistItems]) => <article key={id}><label><input type="checkbox" defaultChecked/><span><b>{title}</b><small>{checklistItems.length} checklist · chưa phân công</small></span><button type="button" onClick={() => setEditingChecklist(editingChecklist === id ? '' : id)}>Chỉnh checklist</button></label>{editingChecklist === id && <div className="checklist-editor"><label>Checklist, mỗi dòng là một tiêu chí<textarea value={checklistDrafts[id]} onChange={(event) => setChecklistDrafts((current) => ({ ...current, [id]: event.target.value }))}/></label><small>{checklistDrafts[id].split('\n').filter(Boolean).length} tiêu chí</small><button type="button" onClick={() => setEditingChecklist('')}>Lưu checklist</button></div>}</article>)}</section> : null; })}</div></div>}
    {step === 5 && <div className="wizard-body"><div className="summary"><span>CẤU TRÚC SẼ KHỞI TẠO</span><h3>01 dự án · 01 khóa học · {String(draftClasses.length).padStart(2, '0')} lớp</h3><p>{draftClasses.length * taskTemplates.length} công việc cấp lớp ({taskTemplates.length} việc × {draftClasses.length} lớp), được tổ chức trong các nhóm việc của từng lớp; không sinh công việc ngang hàng ở cấp dự án hoặc khóa học.</p></div><div className="creation-flow"><div><b>1</b><span>Dự án<small>EVNSPC 2026</small></span></div><i></i><div><b>2</b><span>Khóa học<small>Trải nghiệm khách hàng</small></span></div><i></i><div><b>3</b><span>{String(draftClasses.length).padStart(2, '0')} lớp<small>Lịch riêng</small></span></div><i></i><div><b>4</b><span>{draftClasses.length * taskTemplates.length} công việc<small>Theo nhóm việc của lớp</small></span></div></div><div className="warning">Mỗi lớp có nhóm việc, công việc, checklist và deadline độc lập. CTV được Quản lý ekip phân công sau.</div></div>}
    <div className="modal-actions"><button disabled={step === 1} onClick={() => setStep((value) => value - 1)}>Quay lại</button>{step < stages.length ? <button className="primary" disabled={step === 1 && !projectDraft.teamId} onClick={() => setStep((value) => value + 1)}>Tiếp tục</button> : <button className="primary" onClick={() => confirm(createPayload())}>Xác nhận & sinh việc theo lớp</button>}</div>
  </div></div>;
}
