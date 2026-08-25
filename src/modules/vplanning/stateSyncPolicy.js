export const VWORK_TASK_LOSS_THRESHOLD = 0.1;

function taskId(task) {
  return String(task?.id ?? task?.taskId ?? task?.task_id ?? '').trim();
}

function normalizedTaskIdentity(task) {
  const source = [task?.sourceModule, task?.sourceId].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean).join(':');
  if (source && String(task?.sourceId || '').trim()) return `source:${source}`;
  const workCode = String(task?.workCode || task?.work_code || '').trim().toLowerCase();
  if (workCode) return `work:${workCode}`;
  return [task?.title, task?.ownerName, task?.deadline, task?.projectCode]
    .map((value) => String(value || '').trim().toLowerCase())
    .join('|');
}

function recoveryId(originalId, task, occupiedIds) {
  const input = normalizedTaskIdentity(task) || JSON.stringify(task || {});
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const base = `recovered-${originalId}-${(hash >>> 0).toString(36)}`;
  let candidate = base;
  let suffix = 2;
  while (occupiedIds.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

export function normalizeDeletedTaskIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((id) => String(id || '').trim()).filter(Boolean))];
}

export function unexpectedMissingTaskIds(currentTasks, incomingTasks, deletedTaskIds = []) {
  const incomingIds = new Set((Array.isArray(incomingTasks) ? incomingTasks : []).map(taskId).filter(Boolean));
  const allowedDeletedIds = new Set(normalizeDeletedTaskIds(deletedTaskIds));
  return (Array.isArray(currentTasks) ? currentTasks : [])
    .map(taskId)
    .filter((id) => id && !incomingIds.has(id) && !allowedDeletedIds.has(id));
}

export function isSuspiciousTaskReduction(currentTasks, incomingTasks, deletedTaskIds = []) {
  const current = Array.isArray(currentTasks) ? currentTasks : [];
  const incoming = Array.isArray(incomingTasks) ? incomingTasks : [];
  const unexpectedMissing = unexpectedMissingTaskIds(current, incoming, deletedTaskIds);
  if (!unexpectedMissing.length) return false;
  if (!incoming.length) return true;
  return unexpectedMissing.length / Math.max(current.length, 1) > VWORK_TASK_LOSS_THRESHOLD;
}

export function reconcileRemoteTasks(currentTasks, incomingTasks, deletedTaskIds = []) {
  const current = Array.isArray(currentTasks) ? currentTasks : [];
  const incoming = Array.isArray(incomingTasks) ? incomingTasks : [];
  const deletedIds = new Set(normalizeDeletedTaskIds(deletedTaskIds));
  const incomingById = new Map(incoming.map((task) => [taskId(task), task]).filter(([id]) => id));
  const reconciled = [];
  const seen = new Set();

  current.forEach((task) => {
    const id = taskId(task);
    if (!id || deletedIds.has(id)) return;
    reconciled.push(incomingById.get(id) || task);
    seen.add(id);
  });

  incoming.forEach((task) => {
    const id = taskId(task);
    if (!id || deletedIds.has(id) || seen.has(id)) return;
    reconciled.push(task);
    seen.add(id);
  });

  return reconciled;
}

export function recoverCachedTasks(cachedTasks, liveTasks, deletedTaskIds = []) {
  const cached = Array.isArray(cachedTasks) ? cachedTasks : [];
  const live = Array.isArray(liveTasks) ? liveTasks : [];
  const deletedIds = new Set(normalizeDeletedTaskIds(deletedTaskIds));
  const liveById = new Map(live.map((task) => [taskId(task), task]).filter(([id]) => id));
  const occupiedIds = new Set(liveById.keys());
  const recovered = live.filter((task) => !deletedIds.has(taskId(task)));

  cached.forEach((task) => {
    const id = taskId(task);
    if (!id || deletedIds.has(id)) return;
    const liveTask = liveById.get(id);
    if (!liveTask) {
      recovered.push(task);
      occupiedIds.add(id);
      return;
    }
    if (normalizedTaskIdentity(liveTask) === normalizedTaskIdentity(task)) return;
    const nextId = recoveryId(id, task, occupiedIds);
    occupiedIds.add(nextId);
    recovered.push({
      ...task,
      id:nextId,
      recovery:{
        ...(task?.recovery || {}),
        originalId:id,
        reason:'id_reused_after_snapshot_loss',
      },
    });
  });

  return recovered;
}
