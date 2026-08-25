import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRightLeft, Award, Check, CheckCircle2, Eye, FileText, LayoutGrid, MessageCircle, Pencil, Plus, Send, Star, Trash2, UserPlus, Users, X } from 'lucide-react';
import {
  VDiscussionApiError,
  vdiscussionApi,
  type VDiscussionEventDetail,
  type VDiscussionGroupMonitor,
  type VDiscussionGroupMonitorSummary,
  type VDiscussionParticipant,
  type VDiscussionParticipantPayload,
  type VDiscussionTopicPayload,
} from '@/lib/suniDiscussion';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeAppRole } from '@/data/vcontent';
import { buildRuntimeRefetchInterval, getRuntimePollMs, getScaleAwarePollMs } from '@/lib/runtimeLoadMode';
import { buildVDiscussionMonitorResultContent, getVDiscussionContributionPayload, monitorApi, queries, resultApi } from '@/features/vdiscussion';

function getErrorMessage(error: unknown) {
  if (error instanceof VDiscussionApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Không thực hiện được thao tác với VDiscussion.';
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function getGroupSortNumber(name: string) {
  const match = String(name || '').match(/\d+/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
}

function compareGroupsByName(a: { name: string }, b: { name: string }) {
  const numberDiff = getGroupSortNumber(a.name) - getGroupSortNumber(b.name);
  if (numberDiff) return numberDiff;
  return String(a.name || '').localeCompare(String(b.name || ''), 'vi', { numeric: true });
}

function displayGroupName(name: string | null | undefined) {
  return String(name || '').replace(/^Nhom\b/i, 'Nhóm');
}

function displayParticipantName(participant: Pick<VDiscussionParticipant, 'fullName' | 'email' | 'studentCode' | 'id'>) {
  const fullName = String(participant.fullName || '').trim();
  const email = String(participant.email || '').trim();
  const studentCode = String(participant.studentCode || '').trim();
  return fullName || email || (studentCode ? `HV ${studentCode}` : '') || `Hoc vien ${String(participant.id || '').slice(-6)}`;
}

function displayParticipantMeta(participant: Pick<VDiscussionParticipant, 'fullName' | 'email' | 'studentCode'>) {
  const fullName = String(participant.fullName || '').trim();
  const email = String(participant.email || '').trim();
  const studentCode = String(participant.studentCode || '').trim();
  return [
    email && email !== fullName ? email : '',
    studentCode,
  ].filter(Boolean).join(' - ');
}

function displayProgressLabel(label: string | null | undefined) {
  return String(label || '')
    .replace(/^Chua trien khai$/i, 'Chưa triển khai')
    .replace(/^Da hoan thanh$/i, 'Đã hoàn thành')
    .replace(/^Dang o buoc (\d+)$/i, 'Đang ở bước $1');
}

function splitTopicDescription(description: string | null | undefined) {
  const text = String(description || '').trim();
  if (!text) return [];
  return text
    .replace(/\s[-–—]\s(?=Bước\s*\d+)/gi, '\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function TopicDescriptionLines({ description, durationMinutes }: { description?: string | null; durationMinutes?: number }) {
  const lines = splitTopicDescription(description);
  if (!lines.length) return <span>Chưa có mô tả{durationMinutes ? ` - ${durationMinutes} phút` : ''}</span>;
  return (
    <div className="vdiscussion-topic-lines">
      {lines.map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}
      {durationMinutes ? <em>{durationMinutes} phút</em> : null}
    </div>
  );
}

const MONITOR_PLAN_FIELDS = [
  { key: 'objectives', label: 'Mục tiêu' },
  { key: 'tasks', label: 'Nội dung công việc' },
  { key: 'resources', label: 'Nguồn lực' },
  { key: 'timeline', label: 'Thời hạn' },
] as const;

const HCMC_MONITOR_PLAN_FIELDS = [
  { key: 'objectives', label: 'Mục tiêu cải thiện' },
  { key: 'tasks', label: 'Hành vi hiện tại' },
  { key: 'timeline', label: 'Hành vi chuẩn cần cải thiện trong 30 ngày tới' },
] as const;

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function compactLines(lines: Array<string | null | undefined>) {
  return lines.map((line) => String(line || '').trim()).filter(Boolean).join(' · ');
}

function isHcmcMonitor(monitor: VDiscussionGroupMonitor) {
  return String(monitor.topic?.metadata?.sourceStructure || '') === 'hcmc-cmhv26-word';
}

function isCoaching3bMonitor(monitor: VDiscussionGroupMonitor) {
  const finalSummary = getStepSummary(monitor, 6);
  const haystack = [
    monitor.group.eventId,
    monitor.topic?.eventId,
    monitor.topic?.id,
    monitor.topic?.title,
    monitor.topic?.metadata?.source,
    monitor.topic?.metadata?.sourceEventId,
    monitor.topic?.metadata?.sourceStructure,
    finalSummary.template,
  ].join(' ');
  return /evnspc-3b-coaching-discussion-template|evnspc-coaching-3b|coaching-3b/i.test(haystack);
}

function getMonitorPlanFields(monitor: VDiscussionGroupMonitor) {
  return isHcmcMonitor(monitor) ? HCMC_MONITOR_PLAN_FIELDS : MONITOR_PLAN_FIELDS;
}

function getStepSummary(monitor: VDiscussionGroupMonitor, stepNumber: number) {
  return monitor.steps.find((step) => step.stepNumber === stepNumber)?.summaryData || {};
}

function getMonitorStep(monitor: VDiscussionGroupMonitor, stepNumber: number) {
  return monitor.steps.find((step) => step.stepNumber === stepNumber) || null;
}

function isMonitorFinalLocked(monitor: VDiscussionGroupMonitor) {
  return Boolean(getStepSummary(monitor, 6).finalLocked);
}

function getMonitorPlans(monitor: VDiscussionGroupMonitor): Array<Record<string, unknown>> {
  return getMonitorResultContent(monitor).plans;
}

function getMonitorSelectedSolution(monitor: VDiscussionGroupMonitor) {
  return getMonitorResultContent(monitor).selectedSolution;
}

function getMonitorSelectedProblem(monitor: VDiscussionGroupMonitor) {
  return getMonitorResultContent(monitor).selectedProblem;
}

function getMonitorSelectedAnalyses(monitor: VDiscussionGroupMonitor): Array<Record<string, unknown>> {
  return getMonitorResultContent(monitor).analyses;
}

function getMonitorSelectedSolutionId(monitor: VDiscussionGroupMonitor) {
  return getMonitorResultContent(monitor).selectedSolutionId;
}

function getMonitorResultContent(monitor: VDiscussionGroupMonitor) {
  return buildVDiscussionMonitorResultContent({
    topicTitle: monitor.topic?.title,
    stepSummaries: {
      1: getStepSummary(monitor, 1),
      2: getStepSummary(monitor, 2),
      3: getStepSummary(monitor, 3),
      5: getStepSummary(monitor, 5),
    },
    contributions: monitor.contributions,
  });
}

function getMonitorIdeaMetrics(monitor: VDiscussionGroupMonitor) {
  const selectedSolutionId = getMonitorSelectedSolutionId(monitor);
  if (!selectedSolutionId) return { averageScore: 0, reviewCount: 0, feedback: '' };
  const reviews = monitor.contributions.filter((item) => item.type === 'idea' && item.parentId === selectedSolutionId);
  const comments = monitor.contributions.filter((item) => item.type === 'comment' && item.parentId === selectedSolutionId);
  const scores = reviews.map((item) => Number(getVDiscussionContributionPayload(item.content).agreeScore || 0)).filter(Boolean);
  const averageScore = scores.length ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)) : 0;
  const feedback = comments
    .map((item) => {
      const payload = getVDiscussionContributionPayload(item.content);
      return String(payload.reason || payload.text || '').trim();
    })
    .filter(Boolean)
    .join('\n');
  return { averageScore, reviewCount: scores.length, feedback };
}

function getMonitorIdeaReviewRows(monitor: VDiscussionGroupMonitor) {
  const selectedSolutionId = getMonitorSelectedSolutionId(monitor);
  if (!selectedSolutionId) return [];
  return monitor.contributions
    .filter((item) => item.type === 'idea' && item.parentId === selectedSolutionId)
    .map((item) => {
      const payload = getVDiscussionContributionPayload(item.content);
      return {
        id: item.id,
        authorName: item.authorName || 'Thanh vien',
        score: Number(payload.agreeScore || 0),
        picked: Boolean(payload.pick),
      };
    })
    .filter((item) => item.score > 0);
}

function getCoaching3bResult(monitor: VDiscussionGroupMonitor) {
  const step2 = getStepSummary(monitor, 2);
  const step3 = getStepSummary(monitor, 3);
  const step4 = getStepSummary(monitor, 4);
  const step5 = getStepSummary(monitor, 5);
  const finalSummary = getStepSummary(monitor, 6);
  const snapshot = finalSummary.resultSnapshot && typeof finalSummary.resultSnapshot === 'object'
    ? finalSummary.resultSnapshot as Record<string, unknown>
    : {};
  const coachItems = asArray<Record<string, unknown>>(finalSummary.selectedCoachItems).length
    ? asArray<Record<string, unknown>>(finalSummary.selectedCoachItems)
    : asArray<Record<string, unknown>>(step3.selectedItems);
  const idpItems = asArray<Record<string, unknown>>(finalSummary.selectedIdpItems).length
    ? asArray<Record<string, unknown>>(finalSummary.selectedIdpItems)
    : asArray<Record<string, unknown>>(step4.selectedIdeas);
  const criteria = asArray<Record<string, unknown>>(snapshot.criteria).length
    ? asArray<Record<string, unknown>>(snapshot.criteria)
    : [
      { label: 'Chân dung rõ', ok: Boolean(step2.selectedProblemTitle), desc: String(step2.selectedProblemTitle || '') },
      { label: 'Chẩn đoán đúng gốc', ok: Boolean(coachItems[0]?.rootCause || coachItems[0]?.why), desc: String(coachItems[0]?.rootCause || coachItems[0]?.why || '') },
      { label: 'Đích 4 tuần đo được', ok: Boolean(coachItems[0]?.text && coachItems[0]?.check), desc: String(coachItems[0]?.text || '') },
      { label: 'Lộ trình 6 tháng có chặng', ok: Boolean(idpItems[0]?.target || idpItems[0]?.title), desc: String(idpItems[0]?.target || idpItems[0]?.title || '') },
      { label: 'Hai tầng nối nhau', ok: Boolean(idpItems[0]?.m12 || coachItems[0]?.rhythm), desc: String(idpItems[0]?.m12 || coachItems[0]?.rhythm || '') },
    ];
  const primaryCoach = (snapshot.coach && typeof snapshot.coach === 'object' ? snapshot.coach as Record<string, unknown> : coachItems[0]) || {};
  const primaryIdp = (snapshot.idp && typeof snapshot.idp === 'object' ? snapshot.idp as Record<string, unknown> : idpItems[0]) || {};
  const selectedProblemTitle = String(finalSummary.selectedProblemTitle || snapshot.selectedProblemTitle || step2.selectedProblemTitle || monitor.topic?.title || '').trim();
  const presentationPoint = String(finalSummary.presentationPoint || compactLines([
    selectedProblemTitle ? `Chân dung: ${selectedProblemTitle}` : '',
    primaryCoach.rootCause || primaryCoach.why ? `Gốc cần xử lý: ${String(primaryCoach.rootCause || primaryCoach.why)}` : '',
    primaryCoach.text ? `Đích 4 tuần: ${String(primaryCoach.text)}` : '',
    primaryIdp.target || primaryIdp.title ? `Mục tiêu phát triển sau 6 tháng: ${String(primaryIdp.target || primaryIdp.title)}` : '',
  ])).trim();
  return {
    selectedProblemTitle,
    coachItems,
    idpItems,
    primaryCoach,
    primaryIdp,
    criteria,
    readyCount: criteria.filter((item) => Boolean(item.ok)).length,
    presentationFocus: String(step5.presentationFocus || '').trim(),
    presenterName: String(step5.presenterName || '').trim(),
    lessonNote: String(step5.lessonNote || '').trim(),
    presentationPoint,
    finalSummary,
  };
}

type VDiscussionPrintMode = 'group' | 'class';

function VDiscussionPrintableReport({
  mode,
  currentMonitor,
  monitors,
}: {
  mode: VDiscussionPrintMode;
  currentMonitor: VDiscussionGroupMonitor;
  monitors: VDiscussionGroupMonitor[];
}) {
  const reportMonitors = mode === 'group' ? [currentMonitor] : monitors;
  const reportTitle = mode === 'group'
    ? `Kết quả thảo luận - ${displayGroupName(currentMonitor.group.name)}`
    : 'Kết quả thảo luận toàn lớp';
  const generatedAt = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());

  return (
    <div className="vdiscussion-print-report" aria-hidden={mode ? undefined : true}>
      <header className="vdiscussion-print-cover">
        <span>VDiscussion</span>
        <h1>{reportTitle}</h1>
        <p>Xuất lúc {generatedAt}</p>
      </header>
      {reportMonitors.map((monitor, monitorIndex) => {
        const analyses = getMonitorSelectedAnalyses(monitor);
        const plans = getMonitorPlans(monitor);
        const planFields = getMonitorPlanFields(monitor);
        const ideaMetrics = getMonitorIdeaMetrics(monitor);
        const finalSummary = getStepSummary(monitor, 6);
        const isHcmcDiscussion = isHcmcMonitor(monitor);
        return (
          <section className="vdiscussion-print-group" key={monitor.group.id}>
            <div className="vdiscussion-print-group-head">
              <div>
                <span>Nhóm {monitorIndex + 1}</span>
                <h2>{displayGroupName(monitor.group.name)}</h2>
              </div>
              <div>
                <strong>{monitor.result.score != null ? `${monitor.result.score}/10` : 'Chưa chấm'}</strong>
                <em>{displayProgressLabel(monitor.progressLabel)} - {monitor.completionPercent}%</em>
              </div>
            </div>

            <div className="vdiscussion-print-topic">
              <strong>{monitor.topic?.title || getMonitorSelectedProblem(monitor) || 'Chưa có chủ đề.'}</strong>
              <TopicDescriptionLines description={monitor.topic?.description} />
            </div>

            <div className="vdiscussion-print-meta-grid">
              <div><span>Thành viên tham gia</span><strong>{monitor.joinedCount}/{monitor.totalMembers}</strong></div>
              <div><span>Thành viên có đóng góp</span><strong>{monitor.contributedCount}/{monitor.totalMembers}</strong></div>
              <div><span>Điểm thưởng</span><strong>{monitor.result.bonusPoints || 0}</strong></div>
            </div>

            <section className="vdiscussion-print-block">
              <h3>B1. Vấn đề đã xác định</h3>
              <p>{getMonitorSelectedProblem(monitor) || 'Chưa chốt vấn đề trọng tâm.'}</p>
            </section>

            <section className="vdiscussion-print-block">
              <h3>B2. Hiện trạng & nguyên nhân chính</h3>
              <table>
                <thead><tr><th>Tồn tại / Hạn chế</th><th>Nguyên nhân gốc rễ</th></tr></thead>
                <tbody>
                  {analyses.length ? analyses.map((item, index) => (
                    <tr key={index}>
                      <td>{String(item.text || item.title || '') || '-'}</td>
                      <td>{String(item.rootCause || item.why || item.description || '') || '-'}</td>
                    </tr>
                  )) : <tr><td>Chưa có phân tích được chốt.</td><td>-</td></tr>}
                </tbody>
              </table>
            </section>

            <section className="vdiscussion-print-block">
              <h3>B3. Giải pháp ưu tiên</h3>
              <p><strong>Giải pháp được chọn:</strong> {getMonitorSelectedSolution(monitor) || 'Chưa chốt giải pháp.'}</p>
              <p><strong>Điểm đánh giá trung bình:</strong> {ideaMetrics.reviewCount ? `${ideaMetrics.averageScore}/5 (${ideaMetrics.reviewCount} đánh giá)` : 'Chưa có đánh giá'}</p>
              <p><strong>Phản hồi / Bổ sung:</strong> {ideaMetrics.feedback || 'Chưa có phản hồi bổ sung.'}</p>
            </section>

            <section className="vdiscussion-print-block">
              <h3>{isHcmcDiscussion ? 'B4. Kế hoạch 30 ngày đã duyệt' : 'B4. Kế hoạch hành động đã duyệt'}</h3>
              <table>
                <thead><tr>{planFields.map((field) => <th key={field.key}>{field.label}</th>)}</tr></thead>
                <tbody>
                  {plans.length ? plans.map((plan, index) => (
                    <tr key={String(plan.id || index)}>
                      {planFields.map((field) => <td key={`${index}-${field.key}`}>{String(plan[field.key] || '') || '-'}</td>)}
                    </tr>
                  )) : (
                    <tr>{planFields.map((field) => <td key={field.key}>Chưa có nội dung kế hoạch.</td>)}</tr>
                  )}
                </tbody>
              </table>
            </section>

            <section className="vdiscussion-print-block">
              <h3>B5. Kết luận cuối cùng</h3>
              <p>{String(finalSummary.finalConclusion || '').trim() || 'Chưa có kết luận cuối cùng.'}</p>
              {String(finalSummary.nextAction || '').trim() ? <p><strong>Hành động tiếp theo:</strong> {String(finalSummary.nextAction || '')}</p> : null}
            </section>

            <section className="vdiscussion-print-block">
              <h3>Thành viên</h3>
              <ul>
                {monitor.members.map((member) => (
                  <li key={member.participant.id}>
                    {member.participant.fullName} - {member.participant.email || 'Chưa có email'} - {member.hasJoined ? 'Đã tham gia' : 'Chưa tham gia'}{member.isLeader ? ' - Nhóm trưởng' : ''}
                  </li>
                ))}
              </ul>
            </section>
          </section>
        );
      })}
    </div>
  );
}

function ProgressMeter({ value, tone = 'blue' }: { value: number; tone?: 'blue' | 'green' | 'amber' }) {
  return (
    <div className={`vdiscussion-monitor-meter is-${tone}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function VDiscussionMonitorResultView({
  eventId,
  monitor,
  monitors,
}: {
  eventId: string;
  monitor: VDiscussionGroupMonitor;
  monitors: VDiscussionGroupMonitor[];
}) {
  const analyses = getMonitorSelectedAnalyses(monitor);
  const plans = getMonitorPlans(monitor);
  const planFields = getMonitorPlanFields(monitor);
  const isHcmcDiscussion = isHcmcMonitor(monitor);
  const isCoaching3bDiscussion = isCoaching3bMonitor(monitor);
  const coachingResult = isCoaching3bDiscussion ? getCoaching3bResult(monitor) : null;
  const ideaMetrics = getMonitorIdeaMetrics(monitor);
  const ideaReviews = getMonitorIdeaReviewRows(monitor);
  const finalSummary = getStepSummary(monitor, 6);
  const monitorTopicTitle = coachingResult?.selectedProblemTitle || monitor.topic?.title || getMonitorSelectedProblem(monitor) || '';

  return (
    <div className="vdiscussion-monitor-presentation">
      <header className="vdiscussion-monitor-modal-head">
        <div>
          <span>Trình chiếu trực tiếp</span>
          <h2>{displayGroupName(monitor.group.name)}</h2>
        </div>
        <Link className="btn btn-ghost vdiscussion-monitor-close-btn" to={`/vdiscussion/${eventId}`}>
          <X size={16} /> Đóng
        </Link>
      </header>
      <div className="vdiscussion-monitor-presentation-layout">
        <main className="vdiscussion-monitor-presentation-main">
          <section className="vdiscussion-monitor-topic-card">
            <div className="vdiscussion-monitor-title-row">
              <div>
                <span>Nhóm được chọn trình bày</span>
                <h3>{displayGroupName(monitor.group.name)}</h3>
              </div>
              <div className="vdiscussion-monitor-chip-row">
                <span>{displayProgressLabel(monitor.progressLabel)}</span>
                <span>{monitor.joinedCount}/{monitor.totalMembers} thành viên thảo luận</span>
                {monitor.result.score != null ? <span>Đã chấm: {monitor.result.score}/10</span> : null}
              </div>
            </div>
            <div className="vdiscussion-monitor-topic-box">
              <span>Chủ đề của nhóm</span>
              <strong>{monitorTopicTitle || 'Chưa có chủ đề.'}</strong>
              <TopicDescriptionLines description={monitor.topic?.description} />
            </div>
          </section>

          <section className="vdiscussion-monitor-summary-card">
            <div className="vdiscussion-monitor-section-head">
              <h3>Bài trình bày của nhóm</h3>
              <span>{isMonitorFinalLocked(monitor) ? 'Đã khóa' : 'Đang mở'}</span>
            </div>
            {coachingResult ? (
            <div className="vdiscussion-monitor-final-stack">
              {coachingResult.finalSummary.finalLocked ? (
                <div className="notice success">Bài trình bày 3b đã hoàn thành. Nhóm sẽ không chỉnh sửa được nữa.</div>
              ) : null}
              <div className="vdiscussion-monitor-summary-line">
                <strong>Chân dung trọng tâm</strong>
                <p>{coachingResult.selectedProblemTitle || 'Chưa chốt chân dung nhân viên.'}</p>
              </div>

              <article className="vdiscussion-monitor-final-card">
                <div className="vdiscussion-monitor-final-title">
                  <span className="is-b1">B1</span>
                  <div>
                    <h4>Chẩn đoán vấn đề phát triển</h4>
                    <em>Từ chân dung được nhóm chọn</em>
                  </div>
                </div>
                <div className="vdiscussion-monitor-plan-table is-two">
                  <div className="vdiscussion-monitor-plan-head">
                    <span>Nội dung</span>
                    <span>Kết quả nhóm</span>
                  </div>
                  <div className="vdiscussion-monitor-plan-row">
                    <p>Nhân viên/nhóm nhân viên</p>
                    <p>{coachingResult.selectedProblemTitle || '-'}</p>
                  </div>
                  <div className="vdiscussion-monitor-plan-row">
                    <p>Thực trạng / gốc cần xử lý</p>
                    <p>{String(coachingResult.primaryCoach.rootCause || coachingResult.primaryCoach.why || coachingResult.primaryIdp.gaps || '') || '-'}</p>
                  </div>
                </div>
              </article>

              <article className="vdiscussion-monitor-final-card">
                <div className="vdiscussion-monitor-final-title">
                  <span className="is-b2">B2</span>
                  <div>
                    <h4>Tầng 1 · Kế hoạch kèm cặp 4 tuần</h4>
                    <em>{coachingResult.coachItems.length} phương án được ghi nhận</em>
                  </div>
                </div>
                <div className="vdiscussion-monitor-plan-table is-two">
                  <div className="vdiscussion-monitor-plan-head">
                    <span>Thành tố</span>
                    <span>Nội dung triển khai</span>
                  </div>
                  {[
                    ['Đích (Đo được)', coachingResult.primaryCoach.text || coachingResult.primaryCoach.title],
                    ['Thực trạng năng lực nhân viên (Nhận định đúng gốc)', coachingResult.primaryCoach.rootCause || coachingResult.primaryCoach.why],
                    ['Phương án kèm cặp', coachingResult.primaryCoach.methods],
                    ['Nhịp & Mốc', coachingResult.primaryCoach.rhythm],
                    ['Đo & Chốt', coachingResult.primaryCoach.check],
                  ].map(([label, value]) => (
                    <div className="vdiscussion-monitor-plan-row" key={String(label)}>
                      <p>{String(label)}</p>
                      <p>{String(value || '') || '-'}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="vdiscussion-monitor-final-card">
                <div className="vdiscussion-monitor-final-title">
                  <span className="is-b3">B3</span>
                  <div>
                    <h4>Tầng 2 · Kế hoạch phát triển 6 tháng</h4>
                    <em>{coachingResult.idpItems.length} lộ trình được ghi nhận</em>
                  </div>
                </div>
                <div className="vdiscussion-monitor-plan-table is-two">
                  <div className="vdiscussion-monitor-plan-head">
                    <span>Chặng</span>
                    <span>Nội dung</span>
                  </div>
                  {[
                    ['Năng lực của nhân viên hiện tại', coachingResult.primaryIdp.start],
                    ['Mục tiêu phát triển sau 6 tháng', coachingResult.primaryIdp.target || coachingResult.primaryIdp.title],
                    ['Khoảng cách năng lực', coachingResult.primaryIdp.gaps || coachingResult.primaryIdp.why],
                    ['Kế hoạch phát triển - Tháng thứ 1 và thứ 2', coachingResult.primaryIdp.m12],
                    ['Kế hoạch phát triển - Tháng thứ 3 và thứ 4', coachingResult.primaryIdp.m34],
                    ['Kế hoạch phát triển - Tháng thứ 5 và thứ 6', coachingResult.primaryIdp.m56],
                    ['Hỗ trợ/Nguồn lực cần có', coachingResult.primaryIdp.support],
                    ['Cách rà soát kế hoạch', coachingResult.primaryIdp.review],
                  ].map(([label, value]) => (
                    <div className="vdiscussion-monitor-plan-row" key={String(label)}>
                      <p>{String(label)}</p>
                      <p>{String(value || '') || '-'}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="vdiscussion-monitor-final-card">
                <div className="vdiscussion-monitor-final-title">
                  <span className="is-b4">B4</span>
                  <div>
                    <h4>Điểm nối tầng & kết quả trình bày</h4>
                    <em>{coachingResult.readyCount}/5 tiêu chí đã có dữ liệu</em>
                  </div>
                </div>
                <div className="vdiscussion-monitor-summary-line">
                  <strong>Thẻ tóm tắt</strong>
                  <p>{coachingResult.presentationPoint || 'Chưa đủ dữ liệu để tạo thẻ tóm tắt.'}</p>
                </div>
                <div className="vdiscussion-monitor-plan-table is-two">
                  <div className="vdiscussion-monitor-plan-head">
                    <span>Tự kiểm</span>
                    <span>Minh chứng</span>
                  </div>
                  {coachingResult.criteria.map((item, index) => (
                    <div className="vdiscussion-monitor-plan-row" key={`${String(item.label || index)}-${index}`}>
                      <p>{Boolean(item.ok) ? 'Đạt' : 'Chưa đạt'} · {String(item.label || `Tiêu chí ${index + 1}`)}</p>
                      <p>{String(item.desc || '') || '-'}</p>
                    </div>
                  ))}
                </div>
                <div className="vdiscussion-monitor-summary-line">
                  <strong>Điểm tâm đắc / đại diện / bài học</strong>
                  <p>{compactLines([coachingResult.presentationFocus, coachingResult.presenterName ? `Người trình bày: ${coachingResult.presenterName}` : '', coachingResult.lessonNote]) || 'Chưa có ghi chú trình bày.'}</p>
                </div>
              </article>
            </div>
            ) : (
            <div className="vdiscussion-monitor-final-stack">
              <article className="vdiscussion-monitor-final-card">
                <div className="vdiscussion-monitor-final-title">
                  <span className="is-b1">B1</span>
                  <div>
                    <h4>Vấn đề đã xác định</h4>
                    <em>{getMonitorSelectedProblem(monitor) ? '1 dòng dữ liệu' : 'Chưa có dữ liệu'}</em>
                  </div>
                </div>
                <div className="vdiscussion-monitor-summary-line">
                  <strong>Vấn đề trọng tâm</strong>
                  <p>{getMonitorSelectedProblem(monitor) || 'Chưa chốt vấn đề trọng tâm.'}</p>
                </div>
              </article>

              <article className="vdiscussion-monitor-final-card">
                <div className="vdiscussion-monitor-final-title">
                  <span className="is-b2">B2</span>
                  <div>
                    <h4>Hiện trạng & nguyên nhân chính</h4>
                    <em>{analyses.length} dòng đã chốt</em>
                  </div>
                </div>
                <div className="vdiscussion-monitor-plan-table is-two">
                  <div className="vdiscussion-monitor-plan-head">
                    <span>Tồn tại / Hạn chế</span>
                    <span>Nguyên nhân gốc rễ</span>
                  </div>
                  {analyses.length ? analyses.map((item, index) => (
                    <div className="vdiscussion-monitor-plan-row" key={index}>
                      <p>{String(item.text || item.title || '') || '-'}</p>
                      <p>{String(item.rootCause || item.why || item.description || '') || '-'}</p>
                    </div>
                  )) : (
                    <div className="vdiscussion-monitor-plan-row">
                      <p>Chưa có phân tích được chốt.</p>
                      <p>-</p>
                    </div>
                  )}
                </div>
              </article>

              <article className="vdiscussion-monitor-final-card">
                <div className="vdiscussion-monitor-final-title">
                  <span className="is-b3">B3</span>
                  <div>
                    <h4>Giải pháp ưu tiên</h4>
                    <em>{getMonitorSelectedSolution(monitor) ? 'Đã chốt giải pháp' : 'Chưa có dữ liệu'}</em>
                  </div>
                </div>
                <div className="vdiscussion-monitor-summary-line">
                  <strong>Giải pháp được chọn</strong>
                  <p>{getMonitorSelectedSolution(monitor) || 'Chưa chốt giải pháp.'}</p>
                </div>
                <div className="vdiscussion-monitor-summary-line">
                  <strong>Điểm đánh giá trung bình</strong>
                  <p>{ideaMetrics.reviewCount ? `${ideaMetrics.averageScore}/5 (${ideaMetrics.reviewCount} đánh giá)` : 'Chưa có đánh giá'}</p>
                </div>
                <div className="vdiscussion-monitor-summary-line">
                  <strong>Phản hồi / Bổ sung</strong>
                  <p>{ideaMetrics.feedback || 'Chưa có phản hồi bổ sung.'}</p>
                </div>
              </article>

              <article className="vdiscussion-monitor-final-card">
                <div className="vdiscussion-monitor-final-title">
                  <span className="is-b4">B4</span>
                  <div>
                    <h4>{isHcmcDiscussion ? 'Kế hoạch 30 ngày đã duyệt' : 'Kế hoạch hành động đã duyệt'}</h4>
                    <em>{plans.length} dòng kế hoạch</em>
                  </div>
                </div>
                <div className={`vdiscussion-monitor-plan-table ${isHcmcDiscussion ? 'is-three' : ''}`}>
                  <div className="vdiscussion-monitor-plan-head">
                    {planFields.map((field) => <span key={field.key}>{field.label}</span>)}
                  </div>
                  {plans.length ? plans.map((plan, index) => (
                    <div className="vdiscussion-monitor-plan-row" key={String(plan.id || index)}>
                      {planFields.map((field) => <p key={`${index}-${field.key}`}>{String(plan[field.key] || '') || '-'}</p>)}
                    </div>
                  )) : (
                    <div className="vdiscussion-monitor-plan-row">
                      {planFields.map((field) => <p key={field.key}>Chưa có nội dung kế hoạch.</p>)}
                    </div>
                  )}
                </div>
              </article>

              {String(finalSummary.finalConclusion || '').trim() ? (
                <article className="vdiscussion-monitor-final-card">
                  <div className="vdiscussion-monitor-final-title">
                    <span className="is-b5">B5</span>
                    <div>
                      <h4>Kết luận cuối cùng</h4>
                      <em>Đã nộp tổng kết</em>
                    </div>
                  </div>
                  <div className="vdiscussion-monitor-summary-line">
                    <strong>Kết luận</strong>
                    <p>{String(finalSummary.finalConclusion || '')}</p>
                  </div>
                  {String(finalSummary.nextAction || '').trim() ? (
                    <div className="vdiscussion-monitor-summary-line">
                      <strong>Hành động tiếp theo</strong>
                      <p>{String(finalSummary.nextAction || '')}</p>
                    </div>
                  ) : null}
                </article>
              ) : null}
            </div>
            )}
          </section>
        </main>
        <aside className="vdiscussion-monitor-side">
          <section>
            <h3>Thành viên</h3>
            {monitor.members.map((member) => (
              <div className="vdiscussion-monitor-member" key={member.participant.id}>
                <strong>{member.participant.fullName}</strong>
                <span>{member.participant.email || 'Chưa có email'}</span>
                <div>
                  {member.isLeader ? <em>Nhóm trưởng</em> : null}
                  {member.isActive ? <em>Thành viên tích cực</em> : null}
                  <em>{member.hasJoined ? 'Đã tham gia' : 'Chưa tham gia'}</em>
                </div>
              </div>
            ))}
            <div className="vdiscussion-monitor-review-list">
              {ideaReviews.length ? ideaReviews.map((review) => (
                <span key={review.id}>{review.authorName}: {review.score}/5{review.picked ? ' - đã chọn' : ''}</span>
              )) : <p>Chưa có đánh giá thành viên.</p>}
            </div>
          </section>
          <section>
            <h3>Các nhóm còn lại</h3>
            {monitors.filter((item) => item.group.id !== monitor.group.id).map((item) => (
              <Link key={item.group.id} to={`/vdiscussion/${eventId}/results/${item.group.id}`}>
                <span><strong>{displayGroupName(item.group.name)}</strong>{displayProgressLabel(item.progressLabel)} - {item.completionPercent}%</span>
                <em>Chuyển</em>
              </Link>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}

function DetailStats({ event }: { event: VDiscussionEventDetail }) {
  return (
    <div className="vdiscussion-stats">
      <div className="vdiscussion-stat is-blue"><span>Chủ đề</span><strong>{event.topics.length}</strong></div>
      <div className="vdiscussion-stat is-green"><span>Học viên</span><strong>{event.participants.length}</strong></div>
      <div className="vdiscussion-stat is-amber"><span>Nhóm</span><strong>{event.groups.length}</strong></div>
      <div className="vdiscussion-stat is-plain"><span>Phiên thảo luận</span><strong>{event.sessions.length}</strong></div>
    </div>
  );
}

function TopicForm({ eventId, nextNumber }: { eventId: string; nextNumber: number }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: '', description: '', durationMinutes: '60' });
  const [errorMessage, setErrorMessage] = useState('');
  const mutation = useMutation({
    mutationFn: (payload: VDiscussionTopicPayload) => vdiscussionApi.saveTopic(payload),
    onSuccess: async () => {
      setForm({ title: '', description: '', durationMinutes: '60' });
      await queryClient.invalidateQueries({ queryKey: queries.eventRoot() });
      await queryClient.invalidateQueries({ queryKey: queries.events() });
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    if (!form.title.trim()) {
      setErrorMessage('Cần nhập tên chủ đề.');
      return;
    }
    try {
      await mutation.mutateAsync({
        eventId,
        title: form.title,
        description: form.description,
        topicNumber: nextNumber,
        durationMinutes: Number(form.durationMinutes || 60),
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <form className="vdiscussion-inline-form" onSubmit={(event) => void handleSubmit(event)}>
      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Tên chủ đề thảo luận" />
      <input value={form.durationMinutes} type="number" min="5" onChange={(event) => setForm((current) => ({ ...current, durationMinutes: event.target.value }))} placeholder="Phút" />
      <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Mô tả / yêu cầu thảo luận" />
      <button className="btn btn-primary btn-small" type="submit" disabled={mutation.isPending}><Plus size={15} /> Thêm chủ đề</button>
    </form>
  );
}

function ParticipantForm({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ fullName: '', email: '', studentCode: '' });
  const [errorMessage, setErrorMessage] = useState('');
  const mutation = useMutation({
    mutationFn: (payload: VDiscussionParticipantPayload) => vdiscussionApi.saveParticipant(payload),
    onSuccess: async () => {
      setForm({ fullName: '', email: '', studentCode: '' });
      await queryClient.invalidateQueries({ queryKey: queries.eventRoot() });
      await queryClient.invalidateQueries({ queryKey: queries.events() });
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    if (!form.fullName.trim()) {
      setErrorMessage('Cần nhập tên học viên.');
      return;
    }
    try {
      await mutation.mutateAsync({ eventId, ...form });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <form className="vdiscussion-inline-form is-compact" onSubmit={(event) => void handleSubmit(event)}>
      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      <input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Họ tên học viên" />
      <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
      <input value={form.studentCode} onChange={(event) => setForm((current) => ({ ...current, studentCode: event.target.value }))} placeholder="Ma HV" />
      <button className="btn btn-primary btn-small" type="submit" disabled={mutation.isPending}><UserPlus size={15} /> Thêm học viên</button>
    </form>
  );
}

export function VDiscussionGroupResultPage() {
  const { eventId, groupId } = useParams();
  const { loading: authLoading, profile, session } = useAuth();
  const isStudent = normalizeAppRole(profile?.role) === 'hoc_vien';
  const [printMode, setPrintMode] = useState<VDiscussionPrintMode | null>(null);

  const monitoringQuery = useQuery({
    queryKey: queries.monitoringSummary(eventId),
    queryFn: () => monitorApi.getEventMonitoringSummary(eventId || ''),
    enabled: Boolean(eventId) && Boolean(session?.user?.id) && Boolean(profile?.id) && !authLoading && !isStudent,
    refetchInterval: buildRuntimeRefetchInterval(getScaleAwarePollMs('discussion-monitor', getRuntimePollMs('discussion', 15000, {
      envName: 'VITE_DISCUSSION_MONITOR_POLL_MS',
      useScopeDefault: false,
    })), `monitor-result:${eventId || ''}:${profile?.id || ''}`),
    refetchIntervalInBackground: false,
    retry: false,
  });

  const monitors = monitoringQuery.data || [];
  const monitor = groupId ? monitors.find((item) => item.group.id === groupId) || null : null;

  useEffect(() => {
    if (!printMode || !monitor) return undefined;
    const previousTitle = document.title;
    const title = printMode === 'group'
      ? `PDF ${displayGroupName(monitor.group.name)}`
      : 'PDF ket qua thao luan toan lop';
    document.title = title;
    const clearPrintMode = () => {
      document.title = previousTitle;
      setPrintMode(null);
    };
    window.addEventListener('afterprint', clearPrintMode, { once: true });
    window.setTimeout(() => window.print(), 80);
    return () => {
      window.removeEventListener('afterprint', clearPrintMode);
      document.title = previousTitle;
    };
  }, [printMode, monitor]);

  if (!eventId || !groupId) return <Navigate to="/vdiscussion" replace />;
  if (isStudent) return <Navigate to="/vdiscussion" replace />;
  if (authLoading || (session && !profile) || monitoringQuery.isLoading) return <div className="vdiscussion-empty">Đang tải kết quả thảo luận...</div>;
  if (monitoringQuery.error) return <div className="notice danger">{getErrorMessage(monitoringQuery.error)}</div>;

  if (!monitor) {
    return (
      <div className="vdiscussion-page vdiscussion-result-page">
        <div className="vdiscussion-result-nav">
          <Link className="btn btn-ghost btn-small" to={`/vdiscussion/${eventId}`}><ArrowLeft size={15} /> Quay lại</Link>
        </div>
        <div className="vdiscussion-empty">Không tìm thấy kết quả của nhóm.</div>
      </div>
    );
  }

  return (
    <div className="vdiscussion-page vdiscussion-result-page">
      <div className="vdiscussion-result-nav">
        <Link className="btn btn-ghost btn-small" to={`/vdiscussion/${eventId}`}><ArrowLeft size={15} /> Quay lại</Link>
        <div className="vdiscussion-result-export-actions">
          <button className="btn btn-ghost btn-small" type="button" onClick={() => setPrintMode('group')}>
            <FileText size={15} /> PDF nhóm hiện tại
          </button>
          <button className="btn btn-primary btn-small" type="button" onClick={() => setPrintMode('class')}>
            <FileText size={15} /> PDF cả lớp
          </button>
        </div>
      </div>
      <VDiscussionMonitorResultView eventId={eventId} monitor={monitor} monitors={monitors} />
      {printMode ? <VDiscussionPrintableReport mode={printMode} currentMonitor={monitor} monitors={monitors} /> : null}
    </div>
  );
}

export function VDiscussionEventMonitorPage() {
  const { eventId } = useParams();
  const queryClient = useQueryClient();
  const { loading: authLoading, profile, session } = useAuth();
  const isStudent = normalizeAppRole(profile?.role) === 'hoc_vien';
  const [actionError, setActionError] = useState('');
  const [scoringGroupId, setScoringGroupId] = useState('');
  const [scoreForm, setScoreForm] = useState({ score: '', bonusPoints: '0', activeParticipantIds: [] as string[] });

  const monitoringQuery = useQuery({
    queryKey: queries.monitoringSummary(eventId),
    queryFn: () => monitorApi.getEventMonitoringSummary(eventId || ''),
    enabled: Boolean(eventId) && Boolean(session?.user?.id) && Boolean(profile?.id) && !authLoading && !isStudent,
    refetchInterval: buildRuntimeRefetchInterval(getScaleAwarePollMs('discussion-monitor', getRuntimePollMs('discussion', 15000, {
      envName: 'VITE_DISCUSSION_MONITOR_POLL_MS',
      useScopeDefault: false,
    })), `monitor-page:${eventId || ''}:${profile?.id || ''}`),
    refetchIntervalInBackground: false,
    retry: false,
  });

  const monitors = monitoringQuery.data || [];
  const scoringMonitor = monitors.find((monitor) => monitor.group.id === scoringGroupId) || null;
  const totals = useMemo(() => monitors.reduce(
    (acc, monitor) => ({
      groups: acc.groups + 1,
      members: acc.members + monitor.totalMembers,
      joined: acc.joined + monitor.joinedCount,
      contributed: acc.contributed + monitor.contributedCount,
      completed: acc.completed + (monitor.completionPercent >= 100 ? 1 : 0),
    }),
    { groups: 0, members: 0, joined: 0, contributed: 0, completed: 0 },
  ), [monitors]);

  const submitGroupResultMutation = useMutation({
    mutationFn: () => resultApi.submitGroupResult({
      groupId: scoringGroupId,
      score: Number(scoreForm.score || 0),
      bonusPoints: Number(scoreForm.bonusPoints || 0),
      activeParticipantIds: scoreForm.activeParticipantIds,
    }),
    onSuccess: async () => {
      setScoringGroupId('');
      setScoreForm({ score: '', bonusPoints: '0', activeParticipantIds: [] });
      await queryClient.invalidateQueries({ queryKey: queries.monitoringSummary(eventId) });
      await queryClient.invalidateQueries({ queryKey: queries.monitoring(eventId) });
      await queryClient.invalidateQueries({ queryKey: queries.trainingResults() });
    },
  });

  useEffect(() => {
    if (!scoringGroupId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setScoringGroupId('');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scoringGroupId]);

  async function runAction(action: () => Promise<unknown>) {
    setActionError('');
    try {
      await action();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  function openScoring(monitor: VDiscussionGroupMonitorSummary) {
    setScoringGroupId(monitor.group.id);
    setScoreForm({
      score: monitor.result.score == null ? '' : String(monitor.result.score),
      bonusPoints: String(monitor.result.bonusPoints || 0),
      activeParticipantIds: monitor.result.activeParticipantIds,
    });
  }

  function toggleActiveParticipant(participantId: string, checked: boolean) {
    setScoreForm((current) => ({
      ...current,
      activeParticipantIds: checked
        ? [...new Set([...current.activeParticipantIds, participantId])]
        : current.activeParticipantIds.filter((id) => id !== participantId),
    }));
  }

  if (!eventId) return <Navigate to="/vdiscussion" replace />;
  if (isStudent) return <Navigate to="/vdiscussion" replace />;

  return (
    <div className="vdiscussion-page">
      <div className="vdiscussion-detail-head">
        <Link className="btn btn-ghost btn-small" to={`/vdiscussion/${eventId}`}><ArrowLeft size={15} /> Quay lại</Link>
        <div>
          <h1>Theo dõi tiến trình thảo luận</h1>
          <p>Quét nhanh toàn bộ nhóm bằng dữ liệu summary nhẹ.</p>
          <span>{monitoringQuery.isFetching ? 'Đang cập nhật' : `${totals.groups} nhóm đang theo dõi`}</span>
        </div>
      </div>

      {actionError ? <div className="notice danger">{actionError}</div> : null}
      {monitoringQuery.error ? <div className="notice danger">{getErrorMessage(monitoringQuery.error)}</div> : null}

      <section className="vdiscussion-panel">
        <div className="vdiscussion-panel-head">
          <div>
            <h2>Tổng quan lớp</h2>
            <span>Poll {Math.round(getScaleAwarePollMs('discussion-monitor', getRuntimePollMs('discussion', 15000, { envName: 'VITE_DISCUSSION_MONITOR_POLL_MS', useScopeDefault: false })) / 1000)}s</span>
          </div>
          <span>{monitoringQuery.isFetching ? 'Đang cập nhật' : 'Ổn định'}</span>
        </div>
        <div className="vtraining-detail-grid">
          <div><span>Nhóm</span><strong>{totals.groups}</strong></div>
          <div><span>Đã vào phiên</span><strong>{totals.joined}/{totals.members}</strong></div>
          <div><span>Có đóng góp</span><strong>{totals.contributed}/{totals.members}</strong></div>
          <div><span>Hoàn thành</span><strong>{totals.completed}/{totals.groups}</strong></div>
        </div>
      </section>

      <section className="vdiscussion-panel vdiscussion-monitor-panel">
        <div className="vdiscussion-panel-head">
          <div>
            <h2>Toàn cảnh tiến độ các nhóm</h2>
            <span>Danh sách này dùng summary API, không tải nội dung đóng góp chi tiết.</span>
          </div>
          <span>{monitors.length} nhóm</span>
        </div>
        {authLoading || (session && !profile) || monitoringQuery.isLoading ? <div className="vdiscussion-empty">Đang tải tiến độ nhóm...</div> : null}
        {!authLoading && !monitoringQuery.isLoading && !monitoringQuery.error && !monitors.length ? <div className="vdiscussion-empty">Chưa có nhóm nào để theo dõi.</div> : null}
        <div className="vdiscussion-monitor-list">
          {monitors.map((monitor) => (
            <article className="vdiscussion-monitor-row" key={monitor.group.id}>
              <div className="vdiscussion-monitor-group">
                <strong>{displayGroupName(monitor.group.name)}</strong>
                <span>{displayProgressLabel(monitor.progressLabel)}</span>
              </div>
              <div className="vdiscussion-monitor-progress">
                <div>
                  <span>Vào phòng</span>
                  <strong>{monitor.joinedCount}/{monitor.totalMembers}</strong>
                  <ProgressMeter value={monitor.totalMembers ? (monitor.joinedCount / monitor.totalMembers) * 100 : 0} tone="green" />
                </div>
                <div>
                  <span>Đóng góp</span>
                  <strong>{monitor.contributedCount}/{monitor.totalMembers}</strong>
                  <ProgressMeter value={monitor.totalMembers ? (monitor.contributedCount / monitor.totalMembers) * 100 : 0} />
                </div>
                <div>
                  <span>Hoàn thành</span>
                  <strong>{monitor.completionPercent}%</strong>
                  <ProgressMeter value={monitor.completionPercent} tone="amber" />
                </div>
              </div>
              <div className="vdiscussion-monitor-actions">
                {monitor.session?.id ? (
                  <Link className="btn btn-ghost vdiscussion-monitor-action-view" to={`/vdiscussion/session/${monitor.session.id}/overview`}>
                    <Eye size={15} /> Phiên
                  </Link>
                ) : null}
                <Link className="btn btn-ghost vdiscussion-monitor-action-view" to={`/vdiscussion/${eventId}/results/${monitor.group.id}`}>
                  <FileText size={15} /> Kết quả
                </Link>
                <button type="button" className="btn btn-primary vdiscussion-monitor-action-score" onClick={() => openScoring(monitor)}>
                  <Award size={15} /> Chấm điểm
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {scoringMonitor ? (
        <div
          className="vdiscussion-monitor-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setScoringGroupId('');
          }}
        >
          <form
            className="vdiscussion-score-modal"
            onSubmit={(submitEvent) => {
              submitEvent.preventDefault();
              if (!scoreForm.score) return;
              void runAction(() => submitGroupResultMutation.mutateAsync());
            }}
          >
            <div className="vdiscussion-score-head">
              <div>
                <span>Chấm điểm nhóm</span>
                <h3>{displayGroupName(scoringMonitor.group.name)}</h3>
              </div>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setScoringGroupId('')}><X size={15} /> Đóng</button>
            </div>
            <label>
              <span>Điểm nhóm</span>
              <input type="number" min="0" max="10" step="0.1" value={scoreForm.score} onChange={(event) => setScoreForm((current) => ({ ...current, score: event.target.value }))} />
            </label>
            <label>
              <span>Điểm thưởng</span>
              <input type="number" min="0" max="10" step="0.1" value={scoreForm.bonusPoints} onChange={(event) => setScoreForm((current) => ({ ...current, bonusPoints: event.target.value }))} />
            </label>
            <div className="vdiscussion-score-members">
              <strong>Thành viên tích cực</strong>
              {(scoringMonitor.group.members || []).map((member) => (
                <label key={member.id}>
                  <input
                    type="checkbox"
                    checked={scoreForm.activeParticipantIds.includes(member.id)}
                    onChange={(event) => toggleActiveParticipant(member.id, event.target.checked)}
                  />
                  <span>
                    <strong>{displayParticipantName(member)}</strong>
                    {displayParticipantMeta(member) ? <em>{displayParticipantMeta(member)}</em> : null}
                  </span>
                </label>
              ))}
            </div>
            <div className="action-row">
              <button type="button" className="btn btn-ghost" onClick={() => setScoringGroupId('')}>Hủy</button>
              <button type="submit" className="btn btn-primary" disabled={!scoreForm.score || submitGroupResultMutation.isPending}>
                <Star size={15} /> Lưu điểm
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function VDiscussionEventDetailPage() {
  const { eventId } = useParams();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const isStudent = normalizeAppRole(profile?.role) === 'hoc_vien';
  const [activeTab, setActiveTab] = useState<'topics' | 'participants' | 'groups' | 'monitoring'>('topics');
  const [actionError, setActionError] = useState('');
  const [scoringGroupId, setScoringGroupId] = useState('');
  const [scoreForm, setScoreForm] = useState({ score: '', bonusPoints: '0', activeParticipantIds: [] as string[] });
  const [editingTopicId, setEditingTopicId] = useState('');
  const [topicEditForm, setTopicEditForm] = useState({ title: '', description: '', durationMinutes: '60', topicNumber: 1 });
  const [leaderDraftByGroupId, setLeaderDraftByGroupId] = useState<Record<string, string>>({});

  if (!eventId) return <Navigate to="/vdiscussion" replace />;

  const eventQuery = useQuery({
    queryKey: queries.event(eventId),
    queryFn: () => vdiscussionApi.getEvent(eventId),
  });

  const studentAssignmentsQuery = useQuery({
    queryKey: queries.studentAssignments(profile?.id, profile?.email, profile?.studentCode),
    queryFn: () => vdiscussionApi.listStudentAssignments({
      id: profile?.id,
      email: profile?.email,
      studentCode: profile?.studentCode,
    }),
    enabled: isStudent && Boolean(profile?.id || profile?.email || profile?.studentCode),
  });

  const monitoringQuery = useQuery({
    queryKey: queries.monitoring(eventId),
    queryFn: () => monitorApi.getEventMonitoring(eventId),
    enabled: !isStudent && activeTab === 'monitoring',
    refetchInterval: activeTab === 'monitoring'
      ? buildRuntimeRefetchInterval(getScaleAwarePollMs('discussion-monitor', getRuntimePollMs('discussion', 15000, {
        envName: 'VITE_DISCUSSION_MONITOR_POLL_MS',
        useScopeDefault: false,
      })), `monitor-tab:${eventId || ''}:${profile?.id || ''}`)
      : false,
    refetchIntervalInBackground: false,
  });

  const deleteTopicMutation = useMutation({
    mutationFn: (id: string) => vdiscussionApi.deleteTopic(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queries.eventRoot() });
      await queryClient.invalidateQueries({ queryKey: queries.events() });
    },
  });

  const updateTopicMutation = useMutation({
    mutationFn: (payload: VDiscussionTopicPayload) => vdiscussionApi.saveTopic(payload),
    onSuccess: async () => {
      setEditingTopicId('');
      await queryClient.invalidateQueries({ queryKey: queries.eventRoot() });
      await queryClient.invalidateQueries({ queryKey: queries.events() });
    },
  });

  const deleteParticipantMutation = useMutation({
    mutationFn: (id: string) => vdiscussionApi.deleteParticipant(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queries.eventRoot() });
      await queryClient.invalidateQueries({ queryKey: queries.events() });
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ groupId, participantId }: { groupId: string; participantId: string }) =>
      vdiscussionApi.assignParticipantToGroup(groupId, participantId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queries.eventRoot() });
    },
  });

  const moveParticipantMutation = useMutation({
    mutationFn: ({ targetGroupId, participantId }: { targetGroupId: string; participantId: string }) =>
      vdiscussionApi.moveParticipantToGroup(eventId, targetGroupId, participantId),
    onSuccess: async () => {
      setLeaderDraftByGroupId({});
      await queryClient.invalidateQueries({ queryKey: queries.eventRoot() });
      await queryClient.invalidateQueries({ queryKey: queries.studentAssignmentsRoot() });
    },
  });

  const assignLeaderMutation = useMutation({
    mutationFn: ({ groupId, participantId }: { groupId: string; participantId: string }) =>
      vdiscussionApi.assignGroupLeader(groupId, participantId),
    onSuccess: async () => {
      setLeaderDraftByGroupId({});
      await queryClient.invalidateQueries({ queryKey: queries.eventRoot() });
      await queryClient.invalidateQueries({ queryKey: queries.studentAssignmentsRoot() });
      await queryClient.invalidateQueries({ queryKey: queries.sessionRoot() });
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => vdiscussionApi.updateEventStatus(eventId, 'active'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queries.eventRoot() });
      await queryClient.invalidateQueries({ queryKey: queries.events() });
      await queryClient.invalidateQueries({ queryKey: queries.studentAssignmentsRoot() });
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => vdiscussionApi.updateEventStatus(eventId, 'completed'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queries.eventRoot() });
      await queryClient.invalidateQueries({ queryKey: queries.events() });
      await queryClient.invalidateQueries({ queryKey: queries.studentAssignmentsRoot() });
    },
  });

  const unlockFinalMutation = useMutation({
    mutationFn: async (monitor: VDiscussionGroupMonitor) => {
      const step6 = getMonitorStep(monitor, 6);
      if (!step6?.id || !monitor.session?.id) throw new VDiscussionApiError('Chưa có kết quả thảo luận để mở chỉnh sửa.');
      await vdiscussionApi.updateStepSummary(step6.id, {
        ...step6.summaryData,
        finalLocked: false,
        submissionStatus: 'editing',
        reopenedAt: new Date().toISOString(),
      }, 'active');
      await vdiscussionApi.updateSessionStep(monitor.session.id, 6, 'active');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queries.monitoring(eventId) });
      await queryClient.invalidateQueries({ queryKey: queries.event(eventId) });
      await queryClient.invalidateQueries({ queryKey: queries.sessionRoot() });
    },
  });

  const submitGroupResultMutation = useMutation({
    mutationFn: () => resultApi.submitGroupResult({
      groupId: scoringGroupId,
      score: Number(scoreForm.score || 0),
      bonusPoints: Number(scoreForm.bonusPoints || 0),
      activeParticipantIds: scoreForm.activeParticipantIds,
    }),
    onSuccess: async () => {
      setScoringGroupId('');
      setScoreForm({ score: '', bonusPoints: '0', activeParticipantIds: [] });
      await queryClient.invalidateQueries({ queryKey: queries.monitoring(eventId) });
      await queryClient.invalidateQueries({ queryKey: queries.event(eventId) });
      await queryClient.invalidateQueries({ queryKey: queries.trainingResults() });
    },
  });

  async function runAction(action: () => Promise<unknown>) {
    setActionError('');
    try {
      await action();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  function startEditTopic(topic: VDiscussionEventDetail['topics'][number]) {
    setEditingTopicId(topic.id);
    setTopicEditForm({
      title: topic.title,
      description: topic.description || '',
      durationMinutes: String(topic.durationMinutes || 60),
      topicNumber: topic.topicNumber,
    });
  }

  async function saveEditedTopic(topicId: string) {
    if (!topicEditForm.title.trim()) {
      setActionError('Cần nhập tên chủ đề.');
      return;
    }
    await runAction(() => updateTopicMutation.mutateAsync({
      id: topicId,
      eventId: eventId || '',
      title: topicEditForm.title.trim(),
      description: topicEditForm.description,
      topicNumber: topicEditForm.topicNumber,
      durationMinutes: Number(topicEditForm.durationMinutes || 60),
    }));
  }

  const event = eventQuery.data;
  const ungroupedParticipants = useMemo(() => {
    if (!event) return [];
    const assigned = new Set(event.groups.flatMap((group) => group.members || []).map((participant) => participant.id));
    return event.participants.filter((participant) => !assigned.has(participant.id));
  }, [event]);
  const sortedGroups = useMemo(() => event ? [...event.groups].sort(compareGroupsByName) : [], [event]);
  const topicByGroupId = useMemo(() => {
    const map = new Map<string, string>();
    if (!event) return map;
    const topicsById = new Map(event.topics.map((topic) => [topic.id, topic.title || `Chủ đề ${topic.topicNumber}`]));
    event.sessions.forEach((session) => {
      if (!session.groupId) return;
      map.set(session.groupId, session.topicId ? topicsById.get(session.topicId) || 'Chưa gắn chủ đề' : 'Chưa gắn chủ đề');
    });
    return map;
  }, [event]);
  const monitors = monitoringQuery.data || [];
  const scoringMonitor = monitors.find((monitor) => monitor.group.id === scoringGroupId) || null;

  useEffect(() => {
    if (!scoringGroupId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setScoringGroupId('');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scoringGroupId]);

  if (eventQuery.isLoading) return <div className="vdiscussion-empty">Đang tải chi tiết thảo luận...</div>;
  if (!event) return <div className="vdiscussion-empty">Không tìm thấy sự kiện thảo luận.</div>;
  if (isStudent) {
    if (studentAssignmentsQuery.isLoading) return <div className="vdiscussion-empty">Đang tải phiên thảo luận của bạn...</div>;
    const assignedSession = (studentAssignmentsQuery.data || []).find((assignment) => assignment.event?.id === event.id);
    if (assignedSession && event.status === 'active') {
      return <Navigate to={`/vdiscussion/session/${assignedSession.session.id}/overview`} replace />;
    }
    return <Navigate to="/vdiscussion" replace />;
  }

  const canPublish = event.topics.length > 0
    && event.participants.length > 0
    && ((event.autoCreateGroups && event.groups.length === 0) || (event.groups.length > 0 && ungroupedParticipants.length === 0));
  const setupSteps = [
    { label: 'Bước 1: tạo chủ đề', done: event.topics.length > 0, detail: `${event.topics.length} chủ đề` },
    { label: 'Bước 2: thêm học viên', done: event.participants.length > 0, detail: `${event.participants.length} học viên` },
    { label: 'Bước 3: chia nhóm', done: event.groups.length > 0 && ungroupedParticipants.length === 0, detail: ungroupedParticipants.length ? `${ungroupedParticipants.length} học viên chưa có nhóm` : `${event.groups.length} nhóm` },
    { label: 'Bước 4: tạo phiên', done: event.sessions.length > 0, detail: `${event.sessions.length} phiên` },
  ];

  function openScoring(monitor: VDiscussionGroupMonitor) {
    setScoringGroupId(monitor.group.id);
    setScoreForm({
      score: monitor.result.score == null ? '' : String(monitor.result.score),
      bonusPoints: String(monitor.result.bonusPoints || 0),
      activeParticipantIds: monitor.result.activeParticipantIds.length
        ? monitor.result.activeParticipantIds
        : monitor.members.filter((member) => member.isActive).map((member) => member.participant.id),
    });
  }

  function toggleActiveParticipant(participantId: string, checked: boolean) {
    setScoreForm((current) => ({
      ...current,
      activeParticipantIds: checked
        ? [...new Set([...current.activeParticipantIds, participantId])]
        : current.activeParticipantIds.filter((id) => id !== participantId),
    }));
  }

  return (
    <div className="vdiscussion-page">
      <div className="vdiscussion-detail-head">
        <Link className="btn btn-ghost btn-small" to="/vdiscussion"><ArrowLeft size={15} /> Quay lại</Link>
        <div>
          <h1>{event.title}</h1>
          <p>{event.description || 'Chưa có mô tả.'}</p>
          <span>Thời gian: {formatDate(event.startAt)} - {formatDate(event.endAt)}</span>
        </div>
      </div>

      {actionError ? <div className="notice danger">{actionError}</div> : null}
      <DetailStats event={event} />

      <section className="vdiscussion-panel">
        <div className="vdiscussion-panel-head">
          <h2>Quy trình tạo thảo luận</h2>
          <span>{setupSteps.filter((step) => step.done).length}/{setupSteps.length} hoàn tất</span>
        </div>
        <div className="vdiscussion-setup-steps">
          {setupSteps.map((step) => (
            <div className={step.done ? 'vdiscussion-setup-step is-done' : 'vdiscussion-setup-step'} key={step.label}>
              <CheckCircle2 size={16} />
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="vdiscussion-tabs">
        <button type="button" className={activeTab === 'topics' ? 'is-active' : ''} onClick={() => setActiveTab('topics')}><MessageCircle size={16} /> Chủ đề</button>
        <button type="button" className={activeTab === 'participants' ? 'is-active' : ''} onClick={() => setActiveTab('participants')}><Users size={16} /> Học viên</button>
        <button type="button" className={activeTab === 'groups' ? 'is-active' : ''} onClick={() => setActiveTab('groups')}><LayoutGrid size={16} /> Nhóm</button>
        <Link to={`/vdiscussion/${eventId}/monitor`}><Eye size={16} /> Theo dõi</Link>
      </div>

      <div className="action-row">
        {event.status === 'draft' ? (
          <button type="button" className="btn btn-primary" disabled={!canPublish || publishMutation.isPending} onClick={() => void runAction(() => publishMutation.mutateAsync())}>
            <Send size={15} /> Phát hành
          </button>
        ) : null}
        {event.status === 'active' ? (
          <button type="button" className="btn btn-ghost" disabled={closeMutation.isPending} onClick={() => void runAction(() => closeMutation.mutateAsync())}>
            <Check size={15} /> Đóng thảo luận
          </button>
        ) : null}
      </div>

      {activeTab === 'topics' ? (
        <section className="vdiscussion-panel">
          <div className="vdiscussion-panel-head">
            <h2>Chủ đề thảo luận</h2>
            <span>{event.topics.length} chủ đề</span>
          </div>
          <TopicForm eventId={event.id} nextNumber={event.topics.length + 1} />
          <div className="vdiscussion-list">
            {event.topics.map((topic) => (
              <div className="vdiscussion-list-row" key={topic.id}>
                <div className="vdiscussion-row-number">{topic.topicNumber}</div>
                {editingTopicId === topic.id ? (
                  <div className="vdiscussion-topic-edit">
                    <input value={topicEditForm.title} onChange={(event) => setTopicEditForm((current) => ({ ...current, title: event.target.value }))} />
                    <input value={topicEditForm.durationMinutes} type="number" min="5" onChange={(event) => setTopicEditForm((current) => ({ ...current, durationMinutes: event.target.value }))} />
                    <textarea value={topicEditForm.description} onChange={(event) => setTopicEditForm((current) => ({ ...current, description: event.target.value }))} />
                    <div className="action-row">
                      <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditingTopicId('')}>Hủy</button>
                      <button type="button" className="btn btn-primary btn-small" disabled={updateTopicMutation.isPending} onClick={() => void saveEditedTopic(topic.id)}><Check size={15} /> Lưu</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <strong>{topic.title}</strong>
                    <TopicDescriptionLines description={topic.description} durationMinutes={topic.durationMinutes} />
                  </div>
                )}
                <div className="vdiscussion-row-actions">
                  <button type="button" className="btn btn-ghost btn-small vdiscussion-topic-edit-button" title="Sửa chủ đề" aria-label="Sửa chủ đề" onClick={() => startEditTopic(topic)}><Pencil size={15} /></button>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => void runAction(() => deleteTopicMutation.mutateAsync(topic.id))}><Trash2 size={15} /> Xóa</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === 'participants' ? (
        <section className="vdiscussion-panel">
          <div className="vdiscussion-panel-head">
            <h2>Danh sách học viên</h2>
            <span>{event.participants.length} học viên</span>
          </div>
          <ParticipantForm eventId={event.id} />
          <div className="vdiscussion-list">
            {event.participants.map((participant) => (
              <div className="vdiscussion-list-row" key={participant.id}>
                <div className="vdiscussion-row-number"><Users size={16} /></div>
                <div>
                  <strong>{participant.fullName}</strong>
                  <span>{participant.email || 'Chưa có email'} {participant.studentCode ? `- ${participant.studentCode}` : ''}</span>
                </div>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => void runAction(() => deleteParticipantMutation.mutateAsync(participant.id))}><Trash2 size={15} /> Xóa</button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === 'groups' ? (
        <section className="vdiscussion-panel">
          <div className="vdiscussion-panel-head">
            <h2>Nhóm thảo luận</h2>
            <span>{event.groups.length} nhóm</span>
          </div>
          <div className="vdiscussion-group-list-wide">
            {sortedGroups.map((group) => {
              const selectedLeaderId = leaderDraftByGroupId[group.id] || group.leaderParticipantId || '';
              const selectedLeader = (group.members || []).find((member) => member.id === selectedLeaderId);
              const hasLeaderDraft = Boolean(selectedLeaderId && selectedLeaderId !== (group.leaderParticipantId || ''));
              return (
              <article className="vdiscussion-group-card vdiscussion-group-card-wide" key={group.id}>
                <div className="vdiscussion-card-head vdiscussion-group-wide-head">
                  <div>
                    <strong>{displayGroupName(group.name)}</strong>
                    <span className="vdiscussion-group-topic">Chủ đề: {topicByGroupId.get(group.id) || 'Chưa gắn chủ đề'}</span>
                    <span className="vdiscussion-group-leader"><Star size={14} /> Nhóm trưởng: {selectedLeader?.fullName || 'Chưa chọn'}</span>
                  </div>
                  <div className="vdiscussion-group-head-actions">
                    <span>{group.members?.length || 0}/{group.maxMembers}</span>
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      disabled={!hasLeaderDraft || assignLeaderMutation.isPending}
                      onClick={() => void runAction(() => assignLeaderMutation.mutateAsync({ groupId: group.id, participantId: selectedLeaderId }))}
                    >
                      <Check size={14} /> Lưu nhóm trưởng
                    </button>
                  </div>
                </div>
                <div className="vdiscussion-mini-list vdiscussion-group-members-wide">
                  {[...(group.members || [])].sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi')).map((member) => (
                    <div className="vdiscussion-group-member-row" key={member.id}>
                      <span className="vdiscussion-group-member-info">
                        <Check size={13} />
                        <span>
                          <strong>{member.fullName}</strong>
                          <em>{member.email || 'Chưa có email'}</em>
                          {member.id === group.leaderParticipantId ? <em className="vdiscussion-group-leader-note">Nhóm trưởng hiện tại</em> : null}
                        </span>
                      </span>
                      <div className="vdiscussion-member-actions">
                        <button
                          type="button"
                          className={selectedLeaderId === member.id ? 'btn btn-primary btn-small' : 'btn btn-ghost btn-small'}
                          disabled={assignLeaderMutation.isPending}
                          onClick={() => setLeaderDraftByGroupId((current) => ({ ...current, [group.id]: member.id }))}
                        >
                          {selectedLeaderId === member.id ? 'Đã chọn' : 'Chọn'}
                        </button>
                        <label className="vdiscussion-member-move" title="Chuyển học viên sang nhóm khác">
                          <ArrowRightLeft size={14} />
                          <select
                            defaultValue=""
                            disabled={moveParticipantMutation.isPending}
                            onChange={(changeEvent) => {
                              const targetGroupId = changeEvent.target.value;
                              changeEvent.target.value = '';
                              if (targetGroupId) void runAction(() => moveParticipantMutation.mutateAsync({ targetGroupId, participantId: member.id }));
                            }}
                          >
                            <option value="">Chuyển nhóm</option>
                            {sortedGroups.filter((targetGroup) => targetGroup.id !== group.id).map((targetGroup) => (
                              <option value={targetGroup.id} key={targetGroup.id}>{displayGroupName(targetGroup.name)}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  ))}
                  {(group.members || []).length === 0 ? <em>Chưa có thành viên</em> : null}
                </div>
                {ungroupedParticipants.length ? (
                  <select
                    defaultValue=""
                    onChange={(changeEvent) => {
                      const participantId = changeEvent.target.value;
                      changeEvent.target.value = '';
                      if (participantId) void runAction(() => assignMutation.mutateAsync({ groupId: group.id, participantId }));
                    }}
                  >
                    <option value="">Thêm học viên vào nhóm</option>
                    {ungroupedParticipants.map((participant) => (
                      <option value={participant.id} key={participant.id}>{participant.fullName}{participant.email ? ` - ${participant.email}` : ''}</option>
                    ))}
                  </select>
                ) : null}
              </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {activeTab === 'monitoring' ? (
        <section className="vdiscussion-panel vdiscussion-monitor-panel">
          <div className="vdiscussion-panel-head">
            <div>
              <h2>Toàn cảnh tiến độ các nhóm</h2>
              <span>Giảng viên có thể quét nhanh toàn bộ nhóm trên một màn hình</span>
            </div>
            <span>{monitors.length} nhóm đang theo dõi</span>
          </div>
          {monitoringQuery.isLoading ? <div className="vdiscussion-empty">Đang tải tiến độ nhóm...</div> : null}
          {!monitoringQuery.isLoading && !monitors.length ? <div className="vdiscussion-empty">Chưa có nhóm nào để theo dõi.</div> : null}
          <div className="vdiscussion-monitor-list">
            {monitors.map((monitor) => {
              const finalLocked = isMonitorFinalLocked(monitor);
              return (
              <article className="vdiscussion-monitor-row" key={monitor.group.id}>
                <div className="vdiscussion-monitor-group">
                  <strong>{displayGroupName(monitor.group.name)}</strong>
                  <span>{displayProgressLabel(monitor.progressLabel)}</span>
                </div>
                <div className="vdiscussion-monitor-progress">
                  <div>
                    <span>Vào phòng</span>
                    <strong>{monitor.joinedCount}/{monitor.totalMembers}</strong>
                    <ProgressMeter value={monitor.totalMembers ? (monitor.joinedCount / monitor.totalMembers) * 100 : 0} tone="green" />
                  </div>
                  <div>
                    <span>Đóng góp</span>
                    <strong>{monitor.contributedCount}/{monitor.totalMembers}</strong>
                    <ProgressMeter value={monitor.totalMembers ? (monitor.contributedCount / monitor.totalMembers) * 100 : 0} />
                  </div>
                  <div>
                    <span>Hoàn thành</span>
                    <strong>{monitor.completionPercent}%</strong>
                    <ProgressMeter value={monitor.completionPercent} tone="amber" />
                  </div>
                </div>
                <div className="vdiscussion-monitor-actions">
                  <Link className="btn btn-ghost vdiscussion-monitor-action-view" to={`/vdiscussion/${eventId}/results/${monitor.group.id}`}>
                    <Eye size={15} /> Xem bài
                  </Link>
                  {finalLocked ? (
                    <button
                      type="button"
                      className="btn btn-ghost vdiscussion-monitor-action-edit"
                      disabled={unlockFinalMutation.isPending}
                      onClick={() => void runAction(() => unlockFinalMutation.mutateAsync(monitor))}
                    >
                      Mở chỉnh sửa
                    </button>
                  ) : <button type="button" className="btn btn-ghost vdiscussion-monitor-action-edit" disabled>Chưa hoàn thành</button>}
                  <button type="button" className="btn btn-primary vdiscussion-monitor-action-score" onClick={() => openScoring(monitor)}>
                    <Award size={15} /> Chấm điểm
                  </button>
                </div>
              </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {scoringMonitor ? (
        <div
          className="vdiscussion-monitor-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setScoringGroupId('');
          }}
        >
          <form
            className="vdiscussion-score-modal"
            onSubmit={(submitEvent) => {
              submitEvent.preventDefault();
              if (!scoreForm.score) return;
              void runAction(() => submitGroupResultMutation.mutateAsync());
            }}
          >
            <div className="suni-native-modal-head">
              <div>
                <span>Chấm điểm nhóm</span>
                <h3>{displayGroupName(scoringMonitor.group.name)}</h3>
              </div>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setScoringGroupId('')}>Đóng</button>
            </div>
            <div className="form-grid">
              <label>
                <span>Điểm của nhóm (/10)</span>
                <input type="number" min="0" max="10" step="0.1" value={scoreForm.score} onChange={(event) => setScoreForm((current) => ({ ...current, score: event.target.value }))} />
              </label>
              <label>
                <span>Điểm cộng thành viên tích cực (/10)</span>
                <input type="number" min="0" max="10" step="0.1" value={scoreForm.bonusPoints} onChange={(event) => setScoreForm((current) => ({ ...current, bonusPoints: event.target.value }))} />
              </label>
            </div>
            <div className="vdiscussion-score-member-list">
              <span>Chọn thành viên tích cực</span>
              {scoringMonitor.members.map((member) => (
                <label key={member.participant.id}>
                  <input
                    type="checkbox"
                    checked={scoreForm.activeParticipantIds.includes(member.participant.id)}
                    onChange={(event) => toggleActiveParticipant(member.participant.id, event.target.checked)}
                  />
                  <strong>{displayParticipantName(member.participant)}</strong>
                  <em>{member.contributionCount} đóng góp</em>
                  {member.isLeader ? <small>Nhóm trưởng</small> : null}
                </label>
              ))}
            </div>
            <div className="action-row">
              <button type="button" className="btn btn-ghost" onClick={() => setScoringGroupId('')}>Hủy</button>
              <button type="submit" className="btn btn-primary" disabled={!scoreForm.score || submitGroupResultMutation.isPending}>
                <Star size={15} /> Gửi kết quả
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
