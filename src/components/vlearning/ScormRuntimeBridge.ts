export type ScormSyncStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed';

export type ScormRuntimeSnapshot = {
  location: string;
  suspendData: string;
  completionStatus: string;
  successStatus: string;
  scoreRaw: number | null;
  scoreScaled: number | null;
  progressMeasure: number | null;
  sessionTime: string;
};

type ScormRuntimeBridgeInput = {
  initialRuntimeData: Record<string, string>;
  learnerId: string;
  learnerName: string;
  debounceMs: number;
  onStatusChange: (status: ScormSyncStatus) => void;
  onSave: (runtimeData: Record<string, string>, snapshot: ScormRuntimeSnapshot) => Promise<unknown>;
};

declare global {
  interface Window {
    API_1484_11?: {
      Initialize: (value: string) => 'true' | 'false';
      Terminate: (value: string) => 'true' | 'false';
      GetValue: (key: string) => string;
      SetValue: (key: string, value: string) => 'true' | 'false';
      Commit: (value: string) => 'true' | 'false';
      GetLastError: () => string;
      GetErrorString: (code: string) => string;
      GetDiagnostic: (code: string) => string;
    };
    API?: {
      LMSInitialize: (value: string) => 'true' | 'false';
      LMSFinish: (value: string) => 'true' | 'false';
      LMSGetValue: (key: string) => string;
      LMSSetValue: (key: string, value: string) => 'true' | 'false';
      LMSCommit: (value: string) => 'true' | 'false';
      LMSGetLastError: () => string;
      LMSGetErrorString: (code: string) => string;
      LMSGetDiagnostic: (code: string) => string;
    };
  }
}

function parseNullableNumber(value: string | undefined) {
  if (value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function buildSnapshot(runtimeData: Record<string, string>): ScormRuntimeSnapshot {
  return {
    location: runtimeData['cmi.location'] || runtimeData['cmi.core.lesson_location'] || '',
    suspendData: runtimeData['cmi.suspend_data'] || '',
    completionStatus: runtimeData['cmi.completion_status'] || runtimeData['cmi.core.lesson_status'] || 'unknown',
    successStatus: runtimeData['cmi.success_status'] || 'unknown',
    scoreRaw: parseNullableNumber(runtimeData['cmi.score.raw'] || runtimeData['cmi.core.score.raw']),
    scoreScaled: parseNullableNumber(runtimeData['cmi.score.scaled']),
    progressMeasure: parseNullableNumber(runtimeData['cmi.progress_measure']),
    sessionTime: runtimeData['cmi.session_time'] || runtimeData['cmi.core.session_time'] || '',
  };
}

export function createScormRuntimeBridge(input: ScormRuntimeBridgeInput) {
  const runtimeData = { ...input.initialRuntimeData };
  let lastError = '0';
  let initialized = false;
  let saveTimer: number | null = null;
  let saveInFlight = false;
  let runtimeRevision = 0;
  let inFlightRevision = -1;
  let flushQueued = false;
  let didTerminate = false;
  let destroyed = false;

  const emitStatus = (status: ScormSyncStatus) => {
    if (!destroyed) input.onStatusChange(status);
  };

  const setRuntimeValue = (key: string, value: string) => {
    const nextValue = String(value ?? '');
    runtimeData[key] = nextValue;
    if (key === 'cmi.core.lesson_status') runtimeData['cmi.completion_status'] = nextValue;
    if (key === 'cmi.completion_status') runtimeData['cmi.core.lesson_status'] = nextValue;
    if (key === 'cmi.core.lesson_location') runtimeData['cmi.location'] = nextValue;
    if (key === 'cmi.location') runtimeData['cmi.core.lesson_location'] = nextValue;
    if (key === 'cmi.core.score.raw') runtimeData['cmi.score.raw'] = nextValue;
    if (key === 'cmi.score.raw') runtimeData['cmi.core.score.raw'] = nextValue;
    if (key === 'cmi.core.total_time') runtimeData['cmi.total_time'] = nextValue;
    if (key === 'cmi.total_time') runtimeData['cmi.core.total_time'] = nextValue;
  };

  const getRuntimeValue = (key: string) => {
    if (key === 'cmi.learner_id' || key === 'cmi.core.student_id') return input.learnerId;
    if (key === 'cmi.learner_name' || key === 'cmi.core.student_name') return input.learnerName;
    if (key === 'cmi.mode' || key === 'cmi.core.lesson_mode') return 'normal';
    if (key === 'cmi.credit' || key === 'cmi.core.credit') return 'credit';
    if (key === 'cmi.entry') return runtimeData['cmi.suspend_data'] || runtimeData['cmi.location'] || runtimeData['cmi.core.lesson_location'] ? 'resume' : 'ab-initio';
    if (key === 'cmi.core.entry') return runtimeData['cmi.suspend_data'] || runtimeData['cmi.core.lesson_location'] ? 'resume' : '';
    if (key === 'cmi.core.lesson_status') return runtimeData['cmi.core.lesson_status'] || runtimeData['cmi.completion_status'] || 'incomplete';
    if (key === 'cmi.completion_status') return runtimeData['cmi.completion_status'] || runtimeData['cmi.core.lesson_status'] || 'incomplete';
    if (key === 'cmi.core.lesson_location') return runtimeData['cmi.core.lesson_location'] || runtimeData['cmi.location'] || '';
    if (key === 'cmi.location') return runtimeData['cmi.location'] || runtimeData['cmi.core.lesson_location'] || '';
    if (key === 'cmi.core.score.raw') return runtimeData['cmi.core.score.raw'] || runtimeData['cmi.score.raw'] || '';
    if (key === 'cmi.score.raw') return runtimeData['cmi.score.raw'] || runtimeData['cmi.core.score.raw'] || '';
    if (key === 'cmi.core.total_time') return runtimeData['cmi.core.total_time'] || runtimeData['cmi.total_time'] || '';
    if (key === 'cmi.total_time') return runtimeData['cmi.total_time'] || runtimeData['cmi.core.total_time'] || '';
    return runtimeData[key] || '';
  };

  const flushNow = () => {
    if (saveTimer) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (saveInFlight) {
      if (runtimeRevision > inFlightRevision) flushQueued = true;
      return;
    }
    const payload = { ...runtimeData };
    saveInFlight = true;
    inFlightRevision = runtimeRevision;
    emitStatus('saving');
    void input.onSave(payload, buildSnapshot(payload))
      .then(() => emitStatus('saved'))
      .catch((error) => {
        console.warn('Unable to save SCORM progress.', error);
        emitStatus('failed');
      })
      .finally(() => {
        saveInFlight = false;
        if (flushQueued) {
          flushQueued = false;
          flushNow();
        }
      });
  };

  const scheduleFlush = () => {
    if (saveTimer) window.clearTimeout(saveTimer);
    emitStatus('dirty');
    saveTimer = window.setTimeout(flushNow, input.debounceMs);
  };

  const setValue = (key: string, value: string) => {
    if (!initialized) {
      lastError = '132';
      return 'false';
    }
    setRuntimeValue(key, value);
    runtimeRevision += 1;
    lastError = '0';
    if (/completion_status|success_status|lesson_status|score|suspend_data|location|lesson_location|session_time|total_time|progress_measure/i.test(key)) scheduleFlush();
    return 'true';
  };

  const flushOnPageLeave = () => {
    if (saveTimer) flushNow();
  };

  const api2004 = {
    Initialize: () => {
      initialized = true;
      lastError = '0';
      return 'true' as const;
    },
    Terminate: () => {
      initialized = false;
      didTerminate = true;
      lastError = '0';
      flushNow();
      return 'true' as const;
    },
    GetValue: (key: string) => {
      lastError = '0';
      return getRuntimeValue(key);
    },
    SetValue: setValue,
    Commit: () => {
      lastError = '0';
      flushNow();
      return 'true' as const;
    },
    GetLastError: () => lastError,
    GetErrorString: (code: string) => (code === '0' ? 'No error' : 'SCORM runtime error'),
    GetDiagnostic: (code: string) => (code === '0' ? '' : `Diagnostic ${code}`),
  };

  const api12 = {
    LMSInitialize: api2004.Initialize,
    LMSFinish: api2004.Terminate,
    LMSGetValue: api2004.GetValue,
    LMSSetValue: api2004.SetValue,
    LMSCommit: api2004.Commit,
    LMSGetLastError: api2004.GetLastError,
    LMSGetErrorString: api2004.GetErrorString,
    LMSGetDiagnostic: api2004.GetDiagnostic,
  };

  window.API_1484_11 = api2004;
  window.API = api12;
  window.addEventListener('pagehide', flushOnPageLeave);
  window.addEventListener('beforeunload', flushOnPageLeave);
  document.addEventListener('visibilitychange', flushOnPageLeave);

  return {
    cleanup() {
      if (saveTimer) {
        window.clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (!didTerminate) flushNow();
      destroyed = true;
      window.removeEventListener('pagehide', flushOnPageLeave);
      window.removeEventListener('beforeunload', flushOnPageLeave);
      document.removeEventListener('visibilitychange', flushOnPageLeave);
      if (window.API_1484_11 === api2004) delete window.API_1484_11;
      if (window.API === api12) delete window.API;
    },
  };
}
