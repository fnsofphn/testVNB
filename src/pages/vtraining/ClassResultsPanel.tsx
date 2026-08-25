import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Badge, Card } from '@/components/ui/Primitives';
import { queries as trainingQueries } from '@/features/vtraining';
import { SuniApiError, suniTrainingApi, type SuniTrainingResult } from '@/lib/suni';

function getErrorMessage(error: unknown) {
  if (error instanceof SuniApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Không thực hiện được thao tác.';
}

async function downloadTrainingResultsWorkbook(rows: SuniTrainingResult[], filename: string) {
  const XLSX = await import('xlsx');
  const worksheetRows = rows.map((result) => ({
    'Họ tên': result.studentName || result.studentProfileId,
    Email: result.studentEmail || '',
    'Mã học viên': result.studentCode || '',
    'Đơn vị': result.department || '',
    Khóa: result.courseTitle || result.courseId || '',
    Lớp: result.className || result.classId || '',
    'Chuyên cần': result.scores.attendance ?? '',
    'Bài kiểm tra': result.scores.quiz ?? '',
    'Thu hoạch': result.scores.reflection ?? '',
    'Thảo luận': result.scores.discussion ?? '',
    'Điểm cộng': result.scores.discussionBonus ?? '',
    'Điểm cuối (/10)': result.finalScore ?? '',
    'Kết quả': result.passed == null ? 'Chưa chốt' : result.passed ? 'Đạt' : 'Chưa đạt',
  }));
  const worksheet = XLSX.utils.json_to_sheet(worksheetRows);
  worksheet['!cols'] = [
    { wch: 26 },
    { wch: 30 },
    { wch: 16 },
    { wch: 24 },
    { wch: 34 },
    { wch: 24 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'KetQuaLop');
  XLSX.writeFile(workbook, filename);
}

export function ClassResultsPanel({
  classId,
  results,
  canManage,
  isStudent,
  isLoading,
}: {
  classId: string;
  results: SuniTrainingResult[];
  canManage: boolean;
  isStudent: boolean;
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState('');
  const scoreColumns = [
    { key: 'attendance', label: 'Chuyên cần' },
    { key: 'quiz', label: 'Bài kiểm tra' },
    { key: 'reflection', label: 'Thu hoạch' },
    { key: 'discussion', label: 'Thảo luận' },
    { key: 'discussionBonus', label: 'Điểm cộng' },
  ] as const;
  const ensureMutation = useMutation({
    mutationFn: () => suniTrainingApi.recalculateClassResults(classId),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: trainingQueries.classResults(classId) }),
  });
  const manualScoreMutation = useMutation({
    mutationFn: (input: { result: SuniTrainingResult; key: 'attendance' | 'discussionBonus'; value: number }) => suniTrainingApi.saveTrainingResult({
      id: input.result.id,
      classId: input.result.classId,
      courseId: input.result.courseId,
      studentProfileId: input.result.studentProfileId,
      scores: {
        ...(input.result.scores || {}),
        [input.key]: input.value,
        ...(input.key === 'discussionBonus' ? { discussionBonusManual: true } : {}),
      },
    }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: trainingQueries.classResults(classId) }),
  });

  function scoreValue(result: SuniTrainingResult, key: keyof SuniTrainingResult['scores']) {
    const value = result.scores[key];
    return value === null || value === undefined || value === '' ? '-' : String(value);
  }

  function scoreNumberValue(result: SuniTrainingResult, key: keyof SuniTrainingResult['scores']) {
    const value = Number(result.scores[key]);
    return Number.isFinite(value) ? value : 0;
  }

  function saveManualScore(result: SuniTrainingResult, key: 'attendance' | 'discussionBonus', rawValue: string) {
    const value = Math.max(0, Number(rawValue) || 0);
    if (value === scoreNumberValue(result, key)) return;
    void run(() => manualScoreMutation.mutateAsync({ result, key, value }));
  }

  async function run(action: () => Promise<unknown>) {
    setErrorMessage('');
    try {
      await action();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function exportLatestResults() {
    await run(async () => {
      const latestResults = canManage ? await ensureMutation.mutateAsync() : results;
      await downloadTrainingResultsWorkbook(latestResults, `ket_qua_lop_${classId}.xlsx`);
    });
  }

  return (
    <Card
      title={isStudent ? 'Kết quả học tập cá nhân' : 'Kết quả'}
      action={(
        <div className="suni-native-row-actions">
          <Badge tone={results.length ? 'success' : 'neutral'}>{results.length} dòng</Badge>
          {!isStudent ? (
            <button type="button" className="btn btn-ghost btn-small" disabled={!results.length || ensureMutation.isPending} onClick={() => void exportLatestResults()}>
              <Download size={14} /> Excel
            </button>
          ) : null}
        </div>
      )}
    >
      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      {canManage ? (
        <div className="suni-native-toolbar suni-native-toolbar-compact">
          <button className="btn btn-ghost" onClick={() => void run(() => ensureMutation.mutateAsync())}>Đồng bộ điểm</button>
        </div>
      ) : null}
      <div className="suni-native-table-wrap">
        <table className="data-table suni-native-table">
          <thead>
            <tr>
              <th>Học viên</th>
              {scoreColumns.map((column) => <th key={column.key}>{column.label}</th>)}
              <th>Điểm cuối (/10)</th>
              <th>Kết quả</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={9}>Đang tải kết quả...</td></tr> : null}
            {results.map((result) => (
              <tr key={result.id}>
                <td><strong>{result.studentName || result.studentProfileId}</strong><span>{result.studentEmail || result.department || '-'}</span></td>
                {scoreColumns.map((column) => (
                  <td key={column.key}>
                    {canManage && (column.key === 'attendance' || column.key === 'discussionBonus') ? (
                      <input
                        className="suni-native-score-input"
                        type="number"
                        min="0"
                        max="10"
                        step="0.1"
                        defaultValue={scoreNumberValue(result, column.key)}
                        onBlur={(event) => saveManualScore(result, column.key, event.target.value)}
                        disabled={manualScoreMutation.isPending}
                      />
                    ) : scoreValue(result, column.key)}
                  </td>
                ))}
                <td>{result.finalScore ?? '-'}</td>
                <td><Badge tone={result.passed ? 'success' : result.passed === false ? 'danger' : 'neutral'}>{result.passed == null ? 'Chưa chốt' : result.passed ? 'Đạt' : 'Chưa đạt'}</Badge></td>
              </tr>
            ))}
            {!isLoading && !results.length ? <tr><td colSpan={9}>Chưa có dữ liệu kết quả từ các hoạt động của lớp.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
