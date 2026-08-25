export type WorkflowStatus = 'not_started' | 'in_progress' | 'overdue' | 'pending' | 'completed';

type WorkflowTaskLike = {
  status?: string | null;
  due_date?: string | null;
  stage_index?: number | null;
};

function parseStatusDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPastDue(value: string | null | undefined) {
  const due = parseStatusDate(value);
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

export function resolveSummaryWorkflowStatus(
  status: WorkflowStatus,
  summaryDeadline?: string | null,
): WorkflowStatus {
  if (status !== 'overdue') return status;
  return isPastDue(summaryDeadline) ? 'overdue' : 'in_progress';
}

export function getTaskWorkflowStatus(
  taskLike: WorkflowTaskLike | null | undefined,
  fallbackDeadline?: string | null,
): WorkflowStatus {
  const raw = String(taskLike?.status || '').toLowerCase();
  const dueDate = taskLike?.due_date || fallbackDeadline || null;

  if (['done', 'approved', 'success', 'accepted', 'paid', 'completed', 'qc_passed'].includes(raw)) {
    return 'completed';
  }

  if (['fail', 'qc_fail', 'rejected', 'critical'].includes(raw)) {
    return 'overdue';
  }

  if (['pending', 'review', 'in_review', 'submitted', 'changes_requested', 'waiting', 'submitted_qc', 'submitted_video'].includes(raw)) {
    return isPastDue(dueDate) ? 'overdue' : 'pending';
  }

  if (raw === 'todo') {
    return isPastDue(dueDate) ? 'overdue' : 'not_started';
  }

  if (['overdue', 'in_progress', 'recording', 'editing', 'claimed', 'started', 'draft', 'building_quiz', 'packaging'].includes(raw)) {
    return isPastDue(dueDate) ? 'overdue' : 'in_progress';
  }

  return isPastDue(dueDate) ? 'overdue' : 'not_started';
}

export function getProductWorkflowStatus(input: {
  finished?: boolean;
  readyForDelivery?: boolean;
  progress?: number | null;
  currentStageIndex?: number | null;
  intakeReady?: boolean | null;
  tasks: WorkflowTaskLike[];
  fallbackDeadline?: string | null;
}): WorkflowStatus {
  const { finished, readyForDelivery, progress, currentStageIndex, intakeReady, tasks, fallbackDeadline } = input;
  if (finished || readyForDelivery) return 'completed';
  if (intakeReady === false) return isPastDue(fallbackDeadline) ? 'overdue' : 'not_started';
  if (!tasks.length) {
    if (isPastDue(fallbackDeadline)) return 'overdue';
    return Number(progress || 0) > 0 ? 'in_progress' : 'not_started';
  }

  const normalizedCurrentStageIndex = Number(currentStageIndex ?? 0);
  const statuses = tasks.map((task) => {
    const taskStageIndex = Number(task.stage_index ?? -1);
    if (taskStageIndex >= 0 && taskStageIndex < normalizedCurrentStageIndex) {
      return 'completed' as WorkflowStatus;
    }
    return getTaskWorkflowStatus(task, fallbackDeadline);
  });
  if (statuses.some((status) => status === 'overdue')) return 'overdue';
  if (statuses.some((status) => status === 'in_progress')) return 'in_progress';
  if (statuses.some((status) => status === 'pending')) return 'pending';
  if (statuses.every((status) => status === 'completed')) return 'completed';
  if (statuses.every((status) => status === 'not_started')) return 'not_started';
  return 'in_progress';
}

export function getOrderWorkflowStatus(statuses: WorkflowStatus[]): WorkflowStatus {
  if (!statuses.length) return 'not_started';
  if (statuses.every((status) => status === 'completed')) return 'completed';
  if (statuses.some((status) => status === 'overdue')) return 'overdue';
  if (statuses.some((status) => status === 'in_progress')) return 'in_progress';
  if (statuses.some((status) => status === 'pending')) return 'pending';
  if (statuses.every((status) => status === 'not_started')) return 'not_started';
  return 'in_progress';
}

export function resolveWorkflowOverrideStatus(
  overrideStatus: WorkflowStatus | undefined,
  computedStatus: WorkflowStatus,
): WorkflowStatus {
  if (!overrideStatus) return computedStatus;
  if (overrideStatus === 'pending') {
    return computedStatus === 'pending' ? 'pending' : computedStatus;
  }
  if (overrideStatus === 'not_started' && computedStatus !== 'not_started') return computedStatus;
  if (overrideStatus === 'completed' && computedStatus !== 'completed') return computedStatus;
  if (overrideStatus === 'overdue' && computedStatus !== 'overdue') return computedStatus;
  return overrideStatus;
}
