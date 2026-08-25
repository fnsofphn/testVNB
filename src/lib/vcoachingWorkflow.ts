import * as XLSX from 'xlsx';

export type VcoachingAssignmentStatus = 'active' | 'paused' | 'completed';
export type VcoachingPreworkStatus = 'draft' | 'submitted';
export type VcoachingReviewStatus = 'pending' | 'needs_more' | 'approved';
export type VcoachingActionPlanStatus = 'draft' | 'submitted' | 'coach_feedback' | 'approved';

export type VcoachingAssignment = {
  id: string;
  coacheeProfileId: string;
  coacheeName: string;
  coacheeEmail: string;
  coachProfileId: string;
  coachName: string;
  sessionLabel: string;
  groupName: string;
  status: VcoachingAssignmentStatus;
};

export type VcoachingMaterialRead = {
  assignmentId: string;
  materialId: string;
  readAt: string;
};

export type VcoachingPrework = {
  id: string;
  assignmentId: string;
  status: VcoachingPreworkStatus;
  situation: string;
  expectation: string;
  blockers: string;
  submittedAt?: string | null;
};

export type VcoachingReview = {
  id: string;
  assignmentId: string;
  status: VcoachingReviewStatus;
  coachComment: string;
  reviewedAt?: string | null;
};

export type VcoachingActionPlan = {
  id: string;
  assignmentId: string;
  status: VcoachingActionPlanStatus;
  objective: string;
  actions: string;
  dueDate: string;
  submittedAt?: string | null;
};

export type VcoachingWorkflowState = {
  assignments: VcoachingAssignment[];
  materialReads: VcoachingMaterialRead[];
  preworks: VcoachingPrework[];
  reviews: VcoachingReview[];
  actionPlans: VcoachingActionPlan[];
};

export type VcoachingExportRow = {
  coacheeName: string;
  coacheeEmail: string;
  coachName: string;
  sessionLabel: string;
  groupName: string;
  materialReadStatus: string;
  preworkStatus: string;
  coachReviewStatus: string;
  actionPlanStatus: string;
  situation: string;
  expectation: string;
  blockers: string;
  coachComment: string;
  actionObjective: string;
  actionItems: string;
  actionDueDate: string;
};

function byAssignmentId<T extends { assignmentId: string }>(items: T[]) {
  return new Map(items.map((item) => [item.assignmentId, item]));
}

function materialReadAssignments(reads: VcoachingMaterialRead[]) {
  return new Set(reads.map((read) => read.assignmentId));
}

export function getPreworkLabel(prework?: VcoachingPrework) {
  if (!prework) return 'Chưa nộp';
  return prework.status === 'submitted' ? 'Đã nộp' : 'Đang nháp';
}

export function getReviewLabel(review?: VcoachingReview) {
  if (!review) return 'Chưa review';
  if (review.status === 'approved') return 'Đã duyệt';
  if (review.status === 'needs_more') return 'Cần bổ sung';
  return 'Chờ review';
}

export function getActionPlanLabel(actionPlan?: VcoachingActionPlan) {
  if (!actionPlan) return 'Chưa nộp';
  if (actionPlan.status === 'approved') return 'Đã chốt';
  if (actionPlan.status === 'coach_feedback') return 'Coach góp ý';
  if (actionPlan.status === 'submitted') return 'Đã gửi';
  return 'Đang nháp';
}

export function buildVcoachingExportRows(state: VcoachingWorkflowState): VcoachingExportRow[] {
  const readSet = materialReadAssignments(state.materialReads);
  const preworkMap = byAssignmentId(state.preworks);
  const reviewMap = byAssignmentId(state.reviews);
  const actionPlanMap = byAssignmentId(state.actionPlans);

  return state.assignments.map((assignment) => {
    const prework = preworkMap.get(assignment.id);
    const review = reviewMap.get(assignment.id);
    const actionPlan = actionPlanMap.get(assignment.id);
    return {
      coacheeName: assignment.coacheeName,
      coacheeEmail: assignment.coacheeEmail,
      coachName: assignment.coachName,
      sessionLabel: assignment.sessionLabel,
      groupName: assignment.groupName,
      materialReadStatus: readSet.has(assignment.id) ? 'Đã đọc' : 'Chưa đọc',
      preworkStatus: getPreworkLabel(prework),
      coachReviewStatus: getReviewLabel(review),
      actionPlanStatus: getActionPlanLabel(actionPlan),
      situation: prework?.situation || '',
      expectation: prework?.expectation || '',
      blockers: prework?.blockers || '',
      coachComment: review?.coachComment || '',
      actionObjective: actionPlan?.objective || '',
      actionItems: actionPlan?.actions || '',
      actionDueDate: actionPlan?.dueDate || '',
    };
  });
}

export function summarizeVcoachingState(state: VcoachingWorkflowState) {
  const rows = buildVcoachingExportRows(state);
  const totalCoachees = rows.length;
  const materialDone = rows.filter((row) => row.materialReadStatus === 'Đã đọc');
  const preworkDone = rows.filter((row) => row.preworkStatus === 'Đã nộp');
  const reviewDone = rows.filter((row) => row.coachReviewStatus !== 'Chưa review');
  const actionPlanDone = rows.filter((row) => row.actionPlanStatus !== 'Chưa nộp');

  return {
    totalCoachees,
    materialRead: { done: materialDone.length, missing: totalCoachees - materialDone.length },
    prework: { done: preworkDone.length, missing: totalCoachees - preworkDone.length },
    review: { done: reviewDone.length, missing: totalCoachees - reviewDone.length },
    actionPlan: { done: actionPlanDone.length, missing: totalCoachees - actionPlanDone.length },
    missing: {
      materials: rows.filter((row) => row.materialReadStatus !== 'Đã đọc'),
      prework: rows.filter((row) => row.preworkStatus !== 'Đã nộp'),
      actionPlan: rows.filter((row) => row.actionPlanStatus === 'Chưa nộp'),
    },
    pending: {
      review: rows.filter((row) => row.coachReviewStatus === 'Chưa review'),
      actionPlanApproval: rows.filter((row) => !['Đã chốt', 'Chưa nộp'].includes(row.actionPlanStatus)),
    },
  };
}

export function exportVcoachingWorkflowWorkbook(state: VcoachingWorkflowState) {
  const rows = buildVcoachingExportRows(state);
  const workbook = XLSX.utils.book_new();
  const allSheet = XLSX.utils.json_to_sheet(rows.map((row) => ({
    'Coachee': row.coacheeName,
    'Email': row.coacheeEmail,
    'Coach': row.coachName,
    'Phiên': row.sessionLabel,
    'Nhóm': row.groupName,
    'Đọc tài liệu': row.materialReadStatus,
    'Pre-work': row.preworkStatus,
    'Coach review': row.coachReviewStatus,
    'CTHĐ': row.actionPlanStatus,
    'Tình huống': row.situation,
    'Kỳ vọng': row.expectation,
    'Rào cản': row.blockers,
    'Nhận xét coach': row.coachComment,
    'Mục tiêu CTHĐ': row.actionObjective,
    'Hành động': row.actionItems,
    'Hạn': row.actionDueDate,
  })));
  XLSX.utils.book_append_sheet(workbook, allSheet, 'Tong hop');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.filter((row) => row.materialReadStatus !== 'Đã đọc')), 'Chua doc TL');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.filter((row) => row.preworkStatus !== 'Đã nộp')), 'Chua nop prework');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.filter((row) => row.coachReviewStatus === 'Chưa review')), 'Chua review');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.filter((row) => row.actionPlanStatus === 'Chưa nộp')), 'Chua nop CTHD');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}
