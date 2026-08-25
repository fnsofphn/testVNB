import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, FileSpreadsheet, Save } from 'lucide-react';

import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { queries } from '@/features/vtraining';
import { queries as sharedQueries } from '@/features/shared';
import {
  normalizeClassLessonPlanTopics,
  type ClassLessonPlanTopic,
} from '@/features/vtraining/domain/instructorClassLessonPortal';
import { useAuth } from '@/contexts/AuthContext';
import { isTrainingAdminRole } from '@/data/vcontent';
import {
  SuniApiError,
  suniTrainingApi,
  type SuniInstructorLessonGrant,
  type SuniTrainingClass,
  type SuniUser,
} from '@/lib/suni';

type LessonGrantByInstructor = Record<string, string[]>;

function getErrorMessage(error: unknown) {
  if (error instanceof SuniApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Không thực hiện được thao tác với lessonplan.';
}

function getUserName(user: SuniUser | null | undefined) {
  return user?.fullName || user?.name || user?.email || '';
}

function getClassInstructorIds(klass: SuniTrainingClass | null | undefined) {
  if (!klass) return [];
  return [...new Set([...(klass.instructorIds || []), klass.instructorId].filter(Boolean))] as string[];
}

function getClassLessonTopics(klass: SuniTrainingClass | null | undefined) {
  return normalizeClassLessonPlanTopics(klass?.metadata?.lessonPlanTopics);
}

function grantsToState(grants: SuniInstructorLessonGrant[]) {
  const next: LessonGrantByInstructor = {};
  grants.forEach((grant) => {
    if (!grant.instructorProfileId) return;
    next[grant.instructorProfileId] = [...(next[grant.instructorProfileId] || []), grant.lessonPlanId];
  });
  return next;
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function inferElectronicLessonPlanId(topic: ClassLessonPlanTopic) {
  const text = normalizeText(`${topic.label || ''} ${topic.title || ''} ${topic.id || ''}`);
  if (/(cd|chuyen-de)?0?2a/.test(text) || text.includes('du-lieu') || text.includes('quan-tri-cong-viec')) return '02a';
  if (/(cd|chuyen-de)?0?2b/.test(text) || text.includes('tnkh') || text.includes('trai-nghiem-khach-hang')) return '02b';
  if (/(cd|chuyen-de)?0?3a/.test(text) || text.includes('huan-luyen-nhan-vien')) return '03a';
  if (/(cd|chuyen-de)?0?3b/.test(text) || text.includes('idp') || text.includes('kem-cap')) return '03b';
  if (text.includes('dinh-huong') || /(cd|chuyen-de)?0?1/.test(text) || text.includes('ung-dung-ai')) return '01';
  return '';
}

function buildClassScopedLessonUrl(classId: string, topic: ClassLessonPlanTopic) {
  if (!classId || !inferElectronicLessonPlanId(topic)) return '';
  return `/vtraining/classes/${encodeURIComponent(classId)}/giaoan/${encodeURIComponent(topic.id)}`;
}

function withClassScopedLessonUrls(classId: string, topics: ClassLessonPlanTopic[]) {
  return topics.map((topic) => {
    const scopedUrl = buildClassScopedLessonUrl(classId, topic);
    if (!scopedUrl) return topic;
    const currentUrl = String(topic.lessonUrl || '').trim();
    if (currentUrl && !currentUrl.startsWith('/vtraining/giaoan/')) return topic;
    return { ...topic, lessonUrl: scopedUrl };
  });
}

function topicLabelFromTitle(title: string, index: number) {
  const match = title.match(/CHUYÊN\s*ĐỀ\s*([^:：]+)/i);
  if (!match) return `CĐ${String(index + 1).padStart(2, '0')}`;
  return `CĐ${match[1].trim().replace(/\s+/g, '')}`;
}

function topicIdFromTitle(title: string, index: number) {
  const label = topicLabelFromTitle(title, index);
  return normalizeText(label || title) || `lesson-${index + 1}`;
}

async function parseLessonPlanWorkbook(file: File): Promise<ClassLessonPlanTopic[]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const topics: ClassLessonPlanTopic[] = [];
  const seen = new Set<string>();

  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as unknown[][];
    rows.forEach((row) => {
      const title = String(row[2] || row[1] || '').trim();
      if (!/^CHUYÊN\s*ĐỀ/i.test(title)) return;
      if (/\(\s*TIẾP\s*\)/i.test(title)) return;
      const key = normalizeText(title.replace(/\(\s*TIẾP\s*\)/i, ''));
      if (!key || seen.has(key)) return;
      seen.add(key);
      const index = topics.length;
      topics.push({
        id: topicIdFromTitle(title, index),
        label: topicLabelFromTitle(title, index),
        title,
        lessonUrl: '',
        sortOrder: index + 1,
      });
    });
  });

  return topics;
}

export function SuniTrainingLessonPlansPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const canManage = isTrainingAdminRole(profile?.role);
  const [activeClassId, setActiveClassId] = useState('');
  const [topicDrafts, setTopicDrafts] = useState<ClassLessonPlanTopic[]>([]);
  const [lessonGrantByInstructor, setLessonGrantByInstructor] = useState<LessonGrantByInstructor>({});
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const classesQuery = useQuery({
    queryKey: queries.classes(),
    queryFn: () => suniTrainingApi.listClasses(),
    enabled: canManage,
    staleTime: 60 * 1000,
  });
  const usersQuery = useQuery({
    queryKey: sharedQueries.users(),
    queryFn: () => suniTrainingApi.listUsers(),
    enabled: canManage,
    staleTime: 60 * 1000,
  });

  const classes = classesQuery.data || [];
  const activeClass = useMemo(
    () => classes.find((klass) => klass.id === activeClassId) || null,
    [activeClassId, classes],
  );
  const classInstructorIds = useMemo(() => getClassInstructorIds(activeClass), [activeClass]);
  const classInstructorAssignmentsQuery = useQuery({
    queryKey: queries.classInstructorAssignments(activeClassId),
    queryFn: () => suniTrainingApi.listClassInstructorAssignments([activeClassId]),
    enabled: Boolean(canManage && activeClassId),
    staleTime: 0,
  });
  const classInstructorAssignments = classInstructorAssignmentsQuery.data || [];
  const effectiveClassInstructorIds = useMemo(() => {
    const assignmentIds = classInstructorAssignments
      .map((assignment) => assignment.instructorProfileId)
      .filter(Boolean);
    return assignmentIds.length ? [...new Set(assignmentIds)] : classInstructorIds;
  }, [classInstructorAssignments, classInstructorIds]);
  const classInstructors = useMemo(
    () => effectiveClassInstructorIds
      .map((id) => (
        classInstructorAssignments.find((assignment) => assignment.instructorProfileId === id)?.instructor
        || (usersQuery.data || []).find((user) => user.id === id)
      ))
      .filter(Boolean) as SuniUser[],
    [classInstructorAssignments, effectiveClassInstructorIds, usersQuery.data],
  );

  const grantsQuery = useQuery({
    queryKey: queries.instructorLessonGrants(activeClassId),
    queryFn: () => suniTrainingApi.listInstructorLessonGrants({ classId: activeClassId }),
    enabled: Boolean(canManage && activeClassId),
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    setTopicDrafts(withClassScopedLessonUrls(activeClass?.id || '', getClassLessonTopics(activeClass)));
  }, [activeClass?.id, activeClass?.metadata]);

  useEffect(() => {
    setLessonGrantByInstructor(grantsToState(grantsQuery.data || []));
  }, [grantsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeClass) throw new SuniApiError('Chọn lớp trước khi lưu lessonplan.');
      const topicsToSave = withClassScopedLessonUrls(activeClass.id, topicDrafts);
      await suniTrainingApi.updateClassLessonPlanTopics(activeClass.id, topicsToSave);
      return suniTrainingApi.replaceClassInstructorLessonGrants({
        classId: activeClass.id,
        courseId: activeClass.courseId || null,
        grants: effectiveClassInstructorIds.map((instructorId) => ({
          instructorProfileId: instructorId,
          lessonPlanIds: lessonGrantByInstructor[instructorId] || [],
        })),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queries.classes() }),
        queryClient.invalidateQueries({ queryKey: queries.classInstructorAssignments(activeClassId) }),
        queryClient.invalidateQueries({ queryKey: queries.instructorLessonGrants(activeClassId) }),
      ]);
      setActionMessage('Đã lưu lessonplan và quyền xem giáo án.');
    },
  });

  function toggleLessonGrant(instructorId: string, lessonPlanId: string) {
    setLessonGrantByInstructor((current) => {
      const currentIds = current[instructorId] || [];
      const exists = currentIds.includes(lessonPlanId);
      return {
        ...current,
        [instructorId]: exists
          ? currentIds.filter((id) => id !== lessonPlanId)
          : [...currentIds, lessonPlanId],
      };
    });
  }

  function updateTopic(index: number, patch: Partial<ClassLessonPlanTopic>) {
    setTopicDrafts((current) => current.map((topic, topicIndex) => (
      topicIndex === index ? { ...topic, ...patch } : topic
    )));
  }

  async function importLessonPlan(event: ChangeEvent<HTMLInputElement>) {
    setActionError('');
    setActionMessage('');
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsedTopics = await parseLessonPlanWorkbook(file);
      if (!parsedTopics.length) {
        setActionError('Không tìm thấy dòng CHUYÊN ĐỀ trong file lessonplan.');
        return;
      }
      const existingById = new Map(topicDrafts.map((topic) => [topic.id, topic]));
      setTopicDrafts(withClassScopedLessonUrls(activeClass?.id || '', parsedTopics.map((topic) => ({
        ...topic,
        lessonUrl: existingById.get(topic.id)?.lessonUrl || '',
      }))));
      setActionMessage(`Đã khởi tạo ${parsedTopics.length} chuyên đề từ file ${file.name}.`);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  async function saveAll() {
    setActionError('');
    setActionMessage('');
    try {
      await saveMutation.mutateAsync();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  if (!canManage) {
    return <div className="vdiscussion-empty">Bạn không có quyền quản lý nội dung đào tạo.</div>;
  }

  if (!activeClass) {
    return (
      <div className="suni-native-page vtraining-lesson-admin-page">
        <SectionHeader eye="VTraining" title="Nội dung đào tạo" />
        {classesQuery.error ? <div className="notice danger">Không tải được danh sách lớp.</div> : null}
        <div className="vtraining-lesson-class-grid">
          {classes.map((klass) => {
            const topics = getClassLessonTopics(klass);
            return (
              <button className="vtraining-lesson-class-card" key={klass.id} type="button" onClick={() => setActiveClassId(klass.id)}>
                <strong>{klass.name || klass.code || 'Lớp đào tạo'}</strong>
                <span>{klass.code || '-'}</span>
                <Badge tone={topics.length ? 'success' : 'neutral'}>{topics.length} chuyên đề</Badge>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="suni-native-page vtraining-lesson-admin-page">
      <SectionHeader
        eye="VTraining"
        title={activeClass.name || activeClass.code || 'Lessonplan lớp'}
        actions={<button className="btn btn-ghost btn-small" type="button" onClick={() => setActiveClassId('')}><ArrowLeft size={15} /> Danh sách lớp</button>}
      />

      {actionError ? <div className="notice danger">{actionError}</div> : null}
      {actionMessage ? <div className="notice success">{actionMessage}</div> : null}

      <Card
        title="Khởi tạo lessonplan"
        action={<label className="btn btn-ghost btn-small vtraining-lesson-import"><FileSpreadsheet size={15} /> Import lessonplan<input type="file" accept=".xlsx,.xls" onChange={(event) => void importLessonPlan(event)} /></label>}
      >
        <div className="vtraining-lesson-class-summary">
          <div><span>Mã lớp</span><strong>{activeClass.code || '-'}</strong></div>
          <div><span>Giảng viên</span><strong>{classInstructors.length ? classInstructors.map((user) => getUserName(user)).join(', ') : 'Chưa gán giảng viên'}</strong></div>
        </div>
      </Card>

      <Card
        title="Chuyên đề, link giáo án và quyền xem"
        action={<button className="btn btn-primary btn-small" type="button" onClick={() => void saveAll()} disabled={saveMutation.isPending}><Save size={15} /> Lưu</button>}
      >
        <div className="vtraining-lesson-admin-list">
          {topicDrafts.length ? topicDrafts.map((topic, index) => (
            <article className="vtraining-lesson-admin-row" key={topic.id}>
              <div className="vtraining-lesson-admin-topic">
                <span>{topic.label}</span>
                <div>
                  <strong>{topic.title}</strong>
                  {topic.lessonUrl ? (
                    <a href={topic.lessonUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Mở giáo án đã gắn</a>
                  ) : <em>Chưa dán link giáo án điện tử</em>}
                </div>
              </div>

              <div className="vtraining-lesson-admin-attach">
                <label>
                  <span>Link giáo án</span>
                  <input
                    value={topic.lessonUrl || ''}
                    onChange={(event) => updateTopic(index, { lessonUrl: event.target.value })}
                    placeholder="Dán link giáo án điện tử..."
                  />
                </label>
              </div>

              <div className="vtraining-lesson-admin-grants">
                {classInstructors.length ? classInstructors.map((user) => (
                  <label key={user.id}>
                    <input
                      type="checkbox"
                      checked={(lessonGrantByInstructor[user.id] || []).includes(topic.id)}
                      onChange={() => toggleLessonGrant(user.id, topic.id)}
                    />
                    <span>{getUserName(user) || user.email || user.id}</span>
                  </label>
                )) : (
                  <div className="muted-text">Gán giảng viên cho lớp trước khi phân quyền chuyên đề.</div>
                )}
              </div>
            </article>
          )) : (
            <div className="vdiscussion-empty">Chưa khởi tạo lessonplan cho lớp này.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
