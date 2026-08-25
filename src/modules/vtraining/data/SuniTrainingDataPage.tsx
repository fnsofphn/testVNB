import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, File, LayoutGrid, List, Pencil, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { MotionSurface } from '@/components/ui/MotionSurface';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

type TrainingDataFileRow = {
  id: string;
  sourceKey: string;
  materialId: string;
  courseId?: string | null;
  classId?: string | null;
  sourceLabel: string;
  fileName: string;
  fileUrl: string;
  fileType?: string | null;
  fileSize?: number | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  visibleToStudents?: boolean;
  uploadedByAuthId?: string | null;
  uploadedByProfileId?: string | null;
  uploadedAt?: string | null;
  courseTitle?: string | null;
  className?: string | null;
  deletedAt?: string | null;
  deletedByProfileId?: string | null;
  originalValue?: string | null;
};

const TRAINING_DATA_QUERY_KEY = ['suni', 'training', 'data-files'] as const;
const TRAINING_SOURCE_TABLE = 'vcontent_training_materials';

function isMissingDataRegistry(error: any) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

function formatBytes(value?: number | null) {
  if (!value) return '-';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fileLabel(value: string) {
  const clean = String(value || '').split('?')[0];
  const last = clean.split('/').filter(Boolean).pop() || clean;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function sourceKey(materialId: string) {
  return `vtraining:${materialId}:public_url`;
}

function profileName(profileById: Map<string, any>, authToProfileId: Map<string, string>, row: TrainingDataFileRow) {
  const profileId = row.uploadedByProfileId || (row.uploadedByAuthId ? authToProfileId.get(row.uploadedByAuthId) : '');
  if (!profileId) return '-';
  const profile = profileById.get(profileId);
  return profile?.full_name || profile?.email || profileId;
}

function registryToTrash(row: any): TrainingDataFileRow {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: `trash:${row.id}`,
    sourceKey: row.id,
    materialId: row.source_id,
    courseId: metadata.courseId || null,
    classId: metadata.classId || null,
    sourceLabel: row.source_label || row.file_name || 'Training material',
    fileName: row.file_name,
    fileUrl: row.file_url,
    fileType: metadata.fileType || null,
    fileSize: row.file_size == null ? null : Number(row.file_size),
    storageBucket: row.storage_bucket || 'training-materials',
    storagePath: row.storage_path || null,
    visibleToStudents: metadata.visibleToStudents !== false,
    uploadedByAuthId: metadata.uploadedByAuthId || null,
    uploadedByProfileId: row.uploaded_by_profile_id || null,
    uploadedAt: row.uploaded_at || null,
    courseTitle: metadata.courseTitle || null,
    className: metadata.className || null,
    deletedAt: row.deleted_at,
    deletedByProfileId: row.deleted_by_profile_id || null,
    originalValue: metadata.originalValue || row.file_url,
  };
}

async function loadTrainingDataFiles(): Promise<{ active: TrainingDataFileRow[]; trash: TrainingDataFileRow[]; profiles: any[] }> {
  if (!supabase) return { active: [], trash: [], profiles: [] };
  const [materialsResult, coursesResult, classesResult, profilesResult, trashResult] = await Promise.all([
    supabase.from(TRAINING_SOURCE_TABLE).select('*').order('created_at', { ascending: false }),
    supabase.from('vcontent_training_courses').select('id,title,code'),
    supabase.from('vcontent_training_classes').select('id,name,code'),
    supabase.from('vcontent_profiles').select('id,email,full_name,auth_user_id'),
    supabase
      .from('vcontent_data_file_registry' as any)
      .select('*')
      .eq('source_table', TRAINING_SOURCE_TABLE)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
  ]);
  if (materialsResult.error) throw materialsResult.error;
  if (trashResult.error && !isMissingDataRegistry(trashResult.error)) throw trashResult.error;

  const courseById = new Map((coursesResult.error ? [] : coursesResult.data || []).map((course: any) => [String(course.id), course]));
  const classById = new Map((classesResult.error ? [] : classesResult.data || []).map((klass: any) => [String(klass.id), klass]));
  const trash = trashResult.error ? [] : (trashResult.data || []).map(registryToTrash);
  const trashKeys = new Set(trash.map((row) => row.sourceKey));
  const active = (materialsResult.data || [])
    .map((row: any): TrainingDataFileRow | null => {
      const url = String(row.public_url || row.storage_path || '').trim();
      if (!url) return null;
      const course = row.course_id ? courseById.get(String(row.course_id)) : null;
      const klass = row.class_id ? classById.get(String(row.class_id)) : null;
      const key = sourceKey(String(row.id));
      return {
        id: key,
        sourceKey: key,
        materialId: String(row.id),
        courseId: row.course_id || null,
        classId: row.class_id || null,
        sourceLabel: row.title || row.file_name || 'Training material',
        fileName: row.file_name || fileLabel(url),
        fileUrl: row.public_url || `storage://${row.storage_bucket || 'training-materials'}/${row.storage_path}`,
        fileType: row.file_type || null,
        fileSize: row.file_size == null ? null : Number(row.file_size),
        storageBucket: row.storage_bucket || 'training-materials',
        storagePath: row.storage_path || null,
        visibleToStudents: row.visible_to_students !== false,
        uploadedByAuthId: row.created_by || null,
        uploadedAt: row.created_at || null,
        courseTitle: course?.title || course?.code || null,
        className: klass?.name || klass?.code || null,
      };
    })
    .filter(Boolean)
    .filter((row: any) => !trashKeys.has(row.sourceKey)) as TrainingDataFileRow[];
  return { active, trash, profiles: profilesResult.error ? [] : profilesResult.data || [] };
}

async function updateMaterialFile(row: TrainingDataFileRow, value: string | null) {
  if (!supabase) throw new Error('Chua cau hinh Supabase.');
  const patch = value
    ? { public_url: value, file_name: row.fileName || fileLabel(value), updated_at: new Date().toISOString() }
    : { public_url: null, storage_path: null, file_size: null, updated_at: new Date().toISOString() };
  const { error } = await supabase.from(TRAINING_SOURCE_TABLE).update(patch).eq('id', row.materialId);
  if (error) throw error;
}

async function saveTrashRegistry(row: TrainingDataFileRow, deletedByProfileId?: string | null) {
  if (!supabase) throw new Error('Chua cau hinh Supabase.');
  const { error } = await supabase.from('vcontent_data_file_registry' as any).upsert({
    id: row.sourceKey,
    source_table: TRAINING_SOURCE_TABLE,
    source_id: row.materialId,
    source_field: 'public_url',
    source_label: row.sourceLabel,
    file_name: row.fileName,
    file_url: row.fileUrl,
    storage_bucket: row.storageBucket || 'training-materials',
    storage_path: row.storagePath || null,
    file_size: row.fileSize || null,
    uploaded_by_profile_id: row.uploadedByProfileId || null,
    uploaded_at: row.uploadedAt || new Date().toISOString(),
    deleted_at: new Date().toISOString(),
    deleted_by_profile_id: deletedByProfileId || null,
    delete_mode: 'soft',
    metadata: {
      app: 'vtraining',
      courseId: row.courseId,
      classId: row.classId,
      courseTitle: row.courseTitle,
      className: row.className,
      fileType: row.fileType,
      visibleToStudents: row.visibleToStudents,
      uploadedByAuthId: row.uploadedByAuthId,
      originalValue: row.fileUrl,
    },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function clearTrashRegistry(key: string) {
  if (!supabase) return;
  const { error } = await supabase.from('vcontent_data_file_registry' as any).delete().eq('id', key);
  if (error && !isMissingDataRegistry(error)) throw error;
}

async function deleteStoredObject(row: TrainingDataFileRow) {
  if (!supabase || !row.storagePath) return;
  const { error } = await supabase.storage.from(row.storageBucket || 'training-materials').remove([row.storagePath]);
  if (error) throw error;
}

export function SuniTrainingDataPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'active' | 'trash'>('active');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<TrainingDataFileRow | null>(null);
  const [editValue, setEditValue] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const dataQuery = useQuery({ queryKey: TRAINING_DATA_QUERY_KEY, queryFn: loadTrainingDataFiles });
  const profileById = useMemo(() => new Map((dataQuery.data?.profiles || []).map((item: any) => [item.id, item])), [dataQuery.data?.profiles]);
  const authToProfileId = useMemo(() => {
    const entries = (dataQuery.data?.profiles || [])
      .map((item: any) => [String(item.auth_user_id || ''), String(item.id || '')] as const)
      .filter(([id]) => Boolean(id));
    return new Map<string, string>(entries);
  }, [dataQuery.data?.profiles]);
  const rows = tab === 'active' ? dataQuery.data?.active || [] : dataQuery.data?.trash || [];
  const filteredRows = rows.filter((row) => {
    const haystack = [row.fileName, row.fileUrl, row.sourceLabel, row.courseTitle, row.className, row.fileType, profileName(profileById, authToProfileId, row)].join(' ').toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  });
  const totalSize = rows.reduce((sum, row) => sum + Number(row.fileSize || 0), 0);

  const actionMutation = useMutation({
    mutationFn: async (input: { action: 'soft-delete' | 'restore' | 'permanent-delete' | 'save'; row: TrainingDataFileRow; value?: string }) => {
      setErrorMessage('');
      if (input.action === 'save') {
        const value = String(input.value || '').trim();
        if (!value) throw new Error('Cần nhập URL file.');
        await updateMaterialFile(input.row, value);
        return;
      }
      if (input.action === 'soft-delete') {
        await saveTrashRegistry(input.row, profile?.id || null);
        await updateMaterialFile(input.row, null);
        return;
      }
      if (input.action === 'restore') {
        await updateMaterialFile(input.row, input.row.originalValue || input.row.fileUrl);
        await clearTrashRegistry(input.row.sourceKey);
        return;
      }
      if (input.action === 'permanent-delete') {
        await deleteStoredObject(input.row);
        if (!input.row.deletedAt) await updateMaterialFile(input.row, null);
        await clearTrashRegistry(input.row.sourceKey);
      }
    },
    onSuccess: async () => {
      setEditing(null);
      setEditValue('');
      await queryClient.invalidateQueries({ queryKey: TRAINING_DATA_QUERY_KEY });
    },
    onError: (error) => setErrorMessage(error instanceof Error ? error.message : 'Không thực hiện được thao tác file.'),
  });

  function startEdit(row: TrainingDataFileRow) {
    setEditing(row);
    setEditValue(row.fileUrl);
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    actionMutation.mutate({ action: 'save', row: editing, value: editValue });
  }

  return (
    <div className="data-page">
      <SectionHeader eye="VTraining" title="Data" subtitle="Quản lý file đào tạo đã tải lên trong VTraining." />
      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      {dataQuery.error ? <div className="notice danger">{dataQuery.error instanceof Error ? dataQuery.error.message : 'Không tải được danh sách file VTraining.'}</div> : null}

      <div className="data-summary-grid">
        <Card title="File VTraining dang dung"><strong>{dataQuery.data?.active.length || 0}</strong><span>Tai lieu khoa/lop dang lien ket file</span></Card>
        <Card title="Thung rac VTraining"><strong>{dataQuery.data?.trash.length || 0}</strong><span>Co the khoi phuc hoac xoa vinh vien</span></Card>
        <Card title="Dung luong hien thi"><strong>{formatBytes(totalSize)}</strong><span>Lay tu bang training materials</span></Card>
      </div>

      <Card title="Danh sach file VTraining" action={<Badge tone={tab === 'trash' ? 'warning' : 'success'}>{filteredRows.length} file</Badge>}>
        <div className="data-toolbar">
          <div className="data-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tim ten file, nguoi tai, khoa, lop..." /></div>
          <div className="data-tabs">
            <button className={tab === 'active' ? 'is-active' : ''} type="button" onClick={() => setTab('active')}>Dang dung</button>
            <button className={tab === 'trash' ? 'is-active' : ''} type="button" onClick={() => setTab('trash')}>Da xoa tam</button>
          </div>
          <div className="data-tabs data-view-toggle" aria-label="Doi dang xem">
            <button className={viewMode === 'grid' ? 'is-active' : ''} type="button" title="Dang the" onClick={() => setViewMode('grid')}><LayoutGrid size={16} /> The</button>
            <button className={viewMode === 'list' ? 'is-active' : ''} type="button" title="Dang list" onClick={() => setViewMode('list')}><List size={16} /> List</button>
          </div>
        </div>

        <div className={viewMode === 'list' ? 'data-file-grid is-list' : 'data-file-grid'}>
          {dataQuery.isLoading ? <div className="data-empty data-processing" aria-label="Đang tải danh sách file VTraining"><span className="fine-spinner" aria-hidden="true" /></div> : null}
          {!dataQuery.isLoading && !filteredRows.length ? <div className="data-empty">Chưa có file phù hợp.</div> : null}
          {filteredRows.map((row, index) => (
            <MotionSurface as="article" className={row.deletedAt ? 'data-file-card is-deleted' : 'data-file-card'} delay={Math.min(index, 12) * 45} key={row.id}>
              <div className="data-file-head">
                <span className="data-file-icon"><File size={18} /></span>
                <div>
                  <h3>{row.fileName}</h3>
                  <p>{row.sourceLabel}</p>
                </div>
                <Badge tone={row.visibleToStudents ? 'success' : 'neutral'}>{row.visibleToStudents ? 'public' : 'Ẩn'}</Badge>
              </div>
              <dl className="data-file-detail">
                <div><dt>Nguoi tai</dt><dd>{profileName(profileById, authToProfileId, row)}</dd></div>
                <div><dt>Thoi gian</dt><dd>{formatDateTime(row.uploadedAt)}</dd></div>
                <div><dt>Dung luong</dt><dd>{formatBytes(row.fileSize)}</dd></div>
                <div><dt>Khoa / Lop</dt><dd>{row.courseTitle || '-'} {row.className ? `- ${row.className}` : ''}</dd></div>
                <div><dt>Bang nguon</dt><dd>{TRAINING_SOURCE_TABLE}</dd></div>
                <div><dt>Trạng thái</dt><dd>{row.deletedAt ? `Xóa tạm ${formatDateTime(row.deletedAt)}` : row.fileType || 'active'}</dd></div>
              </dl>
              <div className="data-file-url">{row.fileUrl}</div>
              <div className="data-file-actions">
                {row.fileUrl ? <a className="btn btn-ghost btn-small" href={row.fileUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Mo</a> : null}
                {row.fileUrl ? <a className="btn btn-ghost btn-small" href={row.fileUrl} download><Download size={14} /> Tai</a> : null}
                {!row.deletedAt ? <button className="btn btn-ghost btn-small" type="button" onClick={() => startEdit(row)}><Pencil size={14} /> Sua</button> : null}
                {!row.deletedAt ? <button className="btn btn-ghost btn-small" type="button" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ action: 'soft-delete', row })}><Trash2 size={14} /> Xoa tam</button> : null}
                {row.deletedAt ? <button className="btn btn-ghost btn-small" type="button" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ action: 'restore', row })}><RotateCcw size={14} /> Khoi phuc</button> : null}
                <button className="btn btn-danger btn-small" type="button" disabled={actionMutation.isPending} onClick={() => {
                  if (window.confirm('Xoa vinh vien file VTraining nay? File trong Storage se bi xoa neu he thong truy cap duoc object.')) {
                    actionMutation.mutate({ action: 'permanent-delete', row });
                  }
                }}><Trash2 size={14} /> Xoa vinh vien</button>
              </div>
            </MotionSurface>
          ))}
        </div>
      </Card>

      {editing ? (
        <div className="data-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setEditing(null);
        }}>
          <form className="data-modal" onSubmit={submitEdit}>
            <div className="data-modal-head">
              <div><span>VTraining Data</span><h3>Sua file</h3></div>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(null)}><X size={14} /> Dong</button>
            </div>
            <label>
              <span>URL file</span>
              <textarea value={editValue} onChange={(event) => setEditValue(event.target.value)} />
            </label>
            <div className="action-row">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Huy</button>
              <button type="submit" className="btn btn-primary" disabled={actionMutation.isPending}>{actionMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
