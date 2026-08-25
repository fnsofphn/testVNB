export type TrainingCompletionStudent = {
  id: string;
  profileId?: string | null;
  fullName: string;
  email?: string | null;
  studentCode?: string | null;
  groupName?: string | null;
  department?: string | null;
  position?: string | null;
  status?: string | null;
};

export type TrainingCompletionSubmission = {
  id: string;
  studentProfileId?: string | null;
  respondentName?: string | null;
  email?: string | null;
  attemptNo?: number | null;
  score?: number | null;
  status?: string | null;
  submittedAt?: string | null;
};

export type TrainingCompletionRow = {
  completionStatus: 'Đã làm' | 'Chưa làm';
  fullName: string;
  email: string;
  groupName: string;
  studentCode: string;
  department: string;
  position: string;
  studentStatus: string;
  attemptCount: number;
  latestAttemptNo: number | '';
  score: number | '';
  submissionStatus: string;
  submittedAt: string;
};

function normalizeEmail(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function toTime(value?: string | null) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function getStudentSubmissions(
  student: TrainingCompletionStudent,
  submissionsByProfileId: Map<string, TrainingCompletionSubmission[]>,
  submissionsByEmail: Map<string, TrainingCompletionSubmission[]>,
) {
  const profileRows = student.profileId ? submissionsByProfileId.get(student.profileId) || [] : [];
  const emailRows = normalizeEmail(student.email) ? submissionsByEmail.get(normalizeEmail(student.email)) || [] : [];
  const byId = new Map<string, TrainingCompletionSubmission>();
  [...profileRows, ...emailRows].forEach((submission) => byId.set(submission.id, submission));
  return [...byId.values()].sort((left, right) =>
    toTime(right.submittedAt) - toTime(left.submittedAt) ||
    Number(right.attemptNo || 0) - Number(left.attemptNo || 0)
  );
}

function toBaseRow(student: TrainingCompletionStudent): Omit<TrainingCompletionRow, 'completionStatus' | 'attemptCount' | 'latestAttemptNo' | 'score' | 'submissionStatus' | 'submittedAt'> {
  return {
    fullName: student.fullName || '',
    email: student.email || '',
    groupName: student.groupName || '',
    studentCode: student.studentCode || '',
    department: student.department || '',
    position: student.position || '',
    studentStatus: student.status || 'active',
  };
}

export function buildTrainingCompletionRows(
  students: TrainingCompletionStudent[],
  submissions: TrainingCompletionSubmission[],
) {
  const submissionsByProfileId = new Map<string, TrainingCompletionSubmission[]>();
  const submissionsByEmail = new Map<string, TrainingCompletionSubmission[]>();
  submissions.forEach((submission) => {
    if (submission.studentProfileId) {
      const rows = submissionsByProfileId.get(submission.studentProfileId) || [];
      rows.push(submission);
      submissionsByProfileId.set(submission.studentProfileId, rows);
    }
    const email = normalizeEmail(submission.email);
    if (email) {
      const rows = submissionsByEmail.get(email) || [];
      rows.push(submission);
      submissionsByEmail.set(email, rows);
    }
  });

  const done: TrainingCompletionRow[] = [];
  const missing: TrainingCompletionRow[] = [];

  students.forEach((student) => {
    const rows = getStudentSubmissions(student, submissionsByProfileId, submissionsByEmail);
    const latest = rows[0];
    if (latest) {
      done.push({
        completionStatus: 'Đã làm',
        ...toBaseRow(student),
        attemptCount: rows.length,
        latestAttemptNo: Number(latest.attemptNo || rows.length || 1),
        score: latest.score == null ? '' : Number(latest.score),
        submissionStatus: latest.status || '',
        submittedAt: latest.submittedAt || '',
      });
      return;
    }
    missing.push({
      completionStatus: 'Chưa làm',
      ...toBaseRow(student),
      attemptCount: 0,
      latestAttemptNo: '',
      score: '',
      submissionStatus: '',
      submittedAt: '',
    });
  });

  return { done, missing };
}

export function summarizeTrainingCompletion(rows: { done: TrainingCompletionRow[]; missing: TrainingCompletionRow[] }) {
  return {
    total: rows.done.length + rows.missing.length,
    done: rows.done.length,
    missing: rows.missing.length,
  };
}
