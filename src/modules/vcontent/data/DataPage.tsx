import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, File, HardDrive, LayoutGrid, List, Pencil, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { MotionSurface } from '@/components/ui/MotionSurface';
import { supabase } from '@/lib/supabaseClient';
import {
  deleteIntakeAsset,
  deleteWorkflowAsset,
  listInputItems,
  listProfiles,
  listWorkflowRecords,
  updateInputItem,
  updateWorkflowRecord,
  type InputItemRow,
  type ProfileRow,
  type WorkflowRecordKind,
} from '@/services/vcontent';
import { useAuth } from '@/contexts/AuthContext';

type DataSourceKind = 'intake' | WorkflowRecordKind | 'video_subtitle';

type DataFileRow = {
  id: string;
  sourceKey: string;
  sourceKind: DataSourceKind;
  sourceLabel: string;
  sourceTable: string;
  recordId: string;
  field: 'file_name' | 'file_url' | 'subtitle_file' | 'package_file_name';
  fileName: string;
  fileUrl: string;
  orderId?: string | null;
  productId?: string | null;
  module?: string | null;
  status?: string | null;
  uploadedByProfileId?: string | null;
  uploadedAt?: string | null;
  size?: number | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  deletedAt?: string | null;
  deletedByProfileId?: string | null;
  originalValue?: string | null;
};

type DataTrashEntry = {
  sourceKey: string;
  sourceKind: DataSourceKind;
  sourceLabel: string;
  sourceTable: string;
  recordId: string;
  field: DataFileRow['field'];
  fileName: string;
  fileUrl: string;
  orderId?: string | null;
  productId?: string | null;
  module?: string | null;
  status?: string | null;
  uploadedByProfileId?: string | null;
  uploadedAt?: string | null;
  size?: number | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  originalValue: string;
  deletedAt: string;
  deletedByProfileId?: string | null;
};

const DATA_QUERY_KEY = ['vcontent', 'data-files'] as const;

function isMissingDataRegistry(error: any) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || /vcontent_data_file_registry/i.test(error?.message || '');
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

function parseStorageRef(url: string): { bucket: string; path: string } | null {
  const value = String(url || '').trim();
  if (!value) return null;
  const storageMatch = value.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?#]+)/);
  if (storageMatch) return { bucket: storageMatch[1], path: decodeURIComponent(storageMatch[2]) };
  const storageScheme = value.match(/^storage:\/\/([^/]+)\/(.+)$/);
  if (storageScheme) return { bucket: storageScheme[1], path: storageScheme[2] };
  return null;
}

async function loadStorageSize(row: DataFileRow): Promise<DataFileRow> {
  const ref = row.storageBucket && row.storagePath ? { bucket: row.storageBucket, path: row.storagePath } : parseStorageRef(row.fileUrl);
  if (!supabase || !ref) return row;
  const slash = ref.path.lastIndexOf('/');
  const folder = slash >= 0 ? ref.path.slice(0, slash) : '';
  const name = slash >= 0 ? ref.path.slice(slash + 1) : ref.path;
  const { data } = await supabase.storage.from(ref.bucket).list(folder, { search: name, limit: 20 });
  const object = (data || []).find((item) => item.name === name);
  const size = Number(object?.metadata?.size || object?.metadata?.contentLength || 0) || row.size || null;
  const uploadedAt = object?.created_at || object?.updated_at || row.uploadedAt || null;
  return { ...row, size, uploadedAt, storageBucket: ref.bucket, storagePath: ref.path };
}

function registryToTrash(row: any): DataTrashEntry {
  return {
    sourceKey: row.id,
    sourceKind: row.metadata?.sourceKind || 'intake',
    sourceLabel: row.source_label || row.file_name || 'File da xoa',
    sourceTable: row.source_table,
    recordId: row.source_id,
    field: row.source_field,
    fileName: row.file_name,
    fileUrl: row.file_url,
    orderId: row.metadata?.orderId || null,
    productId: row.metadata?.productId || null,
    module: row.metadata?.module || null,
    status: row.metadata?.status || null,
    uploadedByProfileId: row.uploaded_by_profile_id || null,
    uploadedAt: row.uploaded_at || null,
    size: row.file_size || null,
    storageBucket: row.storage_bucket || null,
    storagePath: row.storage_path || null,
    originalValue: row.metadata?.originalValue || row.file_url,
    deletedAt: row.deleted_at,
    deletedByProfileId: row.deleted_by_profile_id || null,
  };
}

async function loadTrashRegistry(): Promise<DataTrashEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('vcontent_data_file_registry' as any)
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) {
    if (isMissingDataRegistry(error)) return [];
    throw error;
  }
  return (data || []).map(registryToTrash);
}

async function saveTrashRegistry(row: DataFileRow, deletedByProfileId?: string | null) {
  if (!supabase) throw new Error('Chua cau hinh Supabase.');
  const { error } = await supabase.from('vcontent_data_file_registry' as any).upsert({
    id: row.sourceKey,
    source_table: row.sourceTable,
    source_id: row.recordId,
    source_field: row.field,
    source_label: row.sourceLabel,
    file_name: row.fileName,
    file_url: row.fileUrl,
    storage_bucket: row.storageBucket,
    storage_path: row.storagePath,
    file_size: row.size,
    uploaded_by_profile_id: row.uploadedByProfileId,
    uploaded_at: row.uploadedAt || new Date().toISOString(),
    deleted_at: new Date().toISOString(),
    deleted_by_profile_id: deletedByProfileId || null,
    delete_mode: 'soft',
    metadata: {
      sourceKind: row.sourceKind,
      orderId: row.orderId,
      productId: row.productId,
      module: row.module,
      status: row.status,
      originalValue: row.fileUrl,
    },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function clearTrashRegistry(sourceKey: string) {
  if (!supabase) return;
  const { error } = await supabase.from('vcontent_data_file_registry' as any).delete().eq('id', sourceKey);
  if (error && !isMissingDataRegistry(error)) throw error;
}

function profileName(profileById: Map<string, ProfileRow>, id?: string | null) {
  if (!id) return '-';
  const profile = profileById.get(id);
  return profile?.full_name || profile?.email || id;
}

function buildSourceKey(kind: DataSourceKind, recordId: string, field: string) {
  return `${kind}:${recordId}:${field}`;
}

function intakeRows(items: InputItemRow[]): DataFileRow[] {
  return items.flatMap((item) => {
    const value = item.file_url || item.file_name || '';
    if (!value) return [];
    const field = item.file_url ? 'file_url' : 'file_name';
    const storage = parseStorageRef(value);
    return [{
      id: buildSourceKey('intake', item.id, field),
      sourceKey: buildSourceKey('intake', item.id, field),
      sourceKind: 'intake',
      sourceLabel: item.label || item.item_code || 'Input file',
      sourceTable: 'vcontent_input_items',
      recordId: item.id,
      field,
      fileName: item.file_name || fileLabel(value),
      fileUrl: value,
      orderId: item.order_id,
      productId: item.product_id,
      module: item.module,
      status: item.status,
      uploadedByProfileId: item.owner_profile_id,
      uploadedAt: item.updated_at,
      storageBucket: storage?.bucket || null,
      storagePath: storage?.path || null,
    }];
  });
}

function workflowRow(
  kind: DataSourceKind,
  table: string,
  record: any,
  field: DataFileRow['field'],
  label: string,
  uploaderField: string,
): DataFileRow[] {
  const value = String(record[field] || '').trim();
  if (!value) return [];
  const storage = parseStorageRef(value);
  const key = buildSourceKey(kind, String(record.id), field);
  return [{
    id: key,
    sourceKey: key,
    sourceKind: kind,
    sourceLabel: label,
    sourceTable: table,
    recordId: String(record.id),
    field,
    fileName: fileLabel(value),
    fileUrl: value,
    orderId: record.order_id,
    productId: record.product_id,
    module: null,
    status: record.status,
    uploadedByProfileId: record[uploaderField] || null,
    uploadedAt: record.submitted_at || record.completed_at || record.approved_at || record.updated_at || null,
    storageBucket: storage?.bucket || null,
    storagePath: storage?.path || null,
  }];
}

async function loadDataFiles(): Promise<{ active: DataFileRow[]; trash: DataFileRow[]; profiles: ProfileRow[] }> {
  const [items, records, profiles] = await Promise.all([
    listInputItems(),
    listWorkflowRecords({ includeReviews: false, includeQuestionLibrary: false }),
    listProfiles(),
  ]);
  const active = [
    ...intakeRows(items),
    ...records.storyboards.flatMap((row) => workflowRow('storyboard', 'vcontent_storyboards', row, 'file_name', row.title || 'Storyboard', 'assignee_profile_id')),
    ...records.slideDesigns.flatMap((row) => workflowRow('slide_design', 'vcontent_slide_designs', row, 'file_name', row.title || 'Slide design', 'designer_profile_id')),
    ...records.voiceOvers.flatMap((row) => workflowRow('voice_over', 'vcontent_voice_overs', row, 'file_name', row.title || 'Voice over', 'talent_profile_id')),
    ...records.videoEdits.flatMap((row) => workflowRow('video_edit', 'vcontent_video_edits', row, 'file_name', row.title || 'Video edit', 'editor_profile_id')),
    ...records.videoEdits.flatMap((row) => workflowRow('video_subtitle', 'vcontent_video_edits', row, 'subtitle_file', `${row.title || 'Video'} - subtitle`, 'editor_profile_id')),
    ...records.scormPackages.flatMap((row) => workflowRow('scorm_package', 'vcontent_scorm_packages', row, 'package_file_name', row.title || 'SCORM package', 'owner_profile_id')),
  ];
  const trashEntries = await loadTrashRegistry();
  const trashKeys = new Set(trashEntries.map((item) => item.sourceKey));
  const visibleActive = active.filter((row) => !trashKeys.has(row.sourceKey));
  const trash = trashEntries.map((entry) => ({ ...entry, id: `trash:${entry.sourceKey}`, deletedAt: entry.deletedAt, originalValue: entry.originalValue }));
  const enriched = await Promise.all([...visibleActive, ...trash].map(loadStorageSize));
  return { active: enriched.slice(0, visibleActive.length), trash: enriched.slice(visibleActive.length), profiles };
}

async function updateSource(row: Pick<DataFileRow, 'sourceKind' | 'recordId' | 'field'>, value: string | null) {
  if (row.sourceKind === 'intake') {
    await updateInputItem(row.recordId, {
      [row.field]: value,
      ...(value ? { status: 'submitted' } : { status: 'missing' }),
    } as Partial<InputItemRow>);
    return;
  }
  const kind = row.sourceKind === 'video_subtitle' ? 'video_edit' : row.sourceKind;
  await updateWorkflowRecord(kind as WorkflowRecordKind, row.recordId, { [row.field]: value });
}

async function deleteStoredObject(row: DataFileRow) {
  if (!/^https?:\/\//i.test(row.fileUrl) && !/^storage:\/\//i.test(row.fileUrl)) return;
  if (row.sourceKind === 'intake') await deleteIntakeAsset({ fileUrl: row.fileUrl });
  else await deleteWorkflowAsset({ fileUrl: row.fileUrl });
}

export function DataPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'active' | 'trash'>('active');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [editing, setEditing] = useState<DataFileRow | null>(null);
  const [editValue, setEditValue] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const dataQuery = useQuery({ queryKey: DATA_QUERY_KEY, queryFn: loadDataFiles });
  const profileById = useMemo(() => new Map((dataQuery.data?.profiles || []).map((item) => [item.id, item])), [dataQuery.data?.profiles]);
  const rows = tab === 'active' ? dataQuery.data?.active || [] : dataQuery.data?.trash || [];
  const filteredRows = rows.filter((row) => {
    const haystack = [row.fileName, row.fileUrl, row.sourceLabel, row.sourceKind, row.sourceTable, row.orderId, row.productId, row.status, profileName(profileById, row.uploadedByProfileId)].join(' ').toLowerCase();
    if (kind && row.sourceKind !== kind) return false;
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  });
  const totalSize = rows.reduce((sum, row) => sum + Number(row.size || 0), 0);
  const kinds = [...new Set([...(dataQuery.data?.active || []), ...(dataQuery.data?.trash || [])].map((row) => row.sourceKind))].sort();

  const actionMutation = useMutation({
    mutationFn: async (input: { action: 'soft-delete' | 'restore' | 'permanent-delete' | 'save'; row: DataFileRow; value?: string }) => {
      setErrorMessage('');
      if (input.action === 'save') {
        const value = String(input.value || '').trim();
        if (!value) throw new Error('Cần nhập URL hoặc tên file.');
        await updateSource(input.row, value);
        return;
      }
      if (input.action === 'soft-delete') {
        await saveTrashRegistry(input.row, profile?.id || null);
        await updateSource(input.row, null);
        return;
      }
      if (input.action === 'restore') {
        const original = input.row.originalValue || input.row.fileUrl;
        await updateSource(input.row, original);
        await clearTrashRegistry(input.row.sourceKey);
        return;
      }
      if (input.action === 'permanent-delete') {
        await deleteStoredObject(input.row);
        if (!input.row.deletedAt) await updateSource(input.row, null);
        await clearTrashRegistry(input.row.sourceKey);
      }
    },
    onSuccess: async () => {
      setEditing(null);
      setEditValue('');
      await queryClient.invalidateQueries({ queryKey: DATA_QUERY_KEY });
    },
    onError: (error) => setErrorMessage(error instanceof Error ? error.message : 'Không thực hiện được thao tác file.'),
  });

  function startEdit(row: DataFileRow) {
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
      <SectionHeader eye="Hệ thống" title="Data" subtitle="Quản lý file đã tải lên, theo dõi nguồn, người tải, dung lượng và trạng thái xóa." />
      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      {dataQuery.error ? <div className="notice danger">{dataQuery.error instanceof Error ? dataQuery.error.message : 'Không tải được danh sách file.'}</div> : null}

      <div className="data-summary-grid">
        <Card title="File dang dung"><strong>{dataQuery.data?.active.length || 0}</strong><span>Ban ghi nguon con lien ket file</span></Card>
        <Card title="Thung rac"><strong>{dataQuery.data?.trash.length || 0}</strong><span>Co the khoi phuc hoac xoa vinh vien</span></Card>
        <Card title="Dung luong hien thi"><strong>{formatBytes(totalSize)}</strong><span>Lay tu Supabase Storage neu co</span></Card>
      </div>

      <Card
        title="Danh sach file"
        action={<Badge tone={tab === 'trash' ? 'warning' : 'success'}>{filteredRows.length} file</Badge>}
      >
        <div className="data-toolbar">
          <div className="data-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tim ten file, nguoi tai, object, order..." /></div>
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="">Tat ca nguon</option>
            {kinds.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <div className="data-tabs">
            <button className={tab === 'active' ? 'is-active' : ''} type="button" onClick={() => setTab('active')}>Dang dung</button>
            <button className={tab === 'trash' ? 'is-active' : ''} type="button" onClick={() => setTab('trash')}>Da xoa tam</button>
          </div>
          <div className="data-tabs data-view-toggle" aria-label="Doi dang xem">
            <button className={viewMode === 'grid' ? 'is-active' : ''} type="button" aria-label="Dang the" title="Dang the" onClick={() => setViewMode('grid')}><LayoutGrid size={16} /></button>
            <button className={viewMode === 'list' ? 'is-active' : ''} type="button" aria-label="Dang list" title="Dang list" onClick={() => setViewMode('list')}><List size={16} /></button>
          </div>
        </div>

        <div className={viewMode === 'list' ? 'data-file-grid is-list' : 'data-file-grid'}>
          {dataQuery.isLoading ? <div className="data-empty data-processing" aria-label="Đang tải danh sách file"><span className="fine-spinner" aria-hidden="true" /></div> : null}
          {!dataQuery.isLoading && !filteredRows.length ? <div className="data-empty">Chưa có file phù hợp.</div> : null}
          {filteredRows.map((row, index) => (
            <MotionSurface as="article" className={row.deletedAt ? 'data-file-card is-deleted' : 'data-file-card'} delay={Math.min(index, 12) * 45} key={row.id}>
              <div className="data-file-head">
                <span className="data-file-icon"><File size={18} /></span>
                <div>
                  <h3>{row.fileName}</h3>
                  <p>{row.sourceLabel}</p>
                </div>
                <Badge tone={row.deletedAt ? 'warning' : 'violet'}>{row.sourceKind}</Badge>
              </div>
              <dl className="data-file-detail">
                <div><dt>Nguoi tai</dt><dd>{profileName(profileById, row.uploadedByProfileId)}</dd></div>
                <div><dt>Thoi gian</dt><dd>{formatDateTime(row.uploadedAt)}</dd></div>
                <div className="data-file-size"><dt><HardDrive size={12} /> Dung luong</dt><dd>{formatBytes(row.size)}</dd></div>
                <div><dt>Order / Product</dt><dd>{row.orderId || '-'} {row.productId ? `- ${row.productId}` : ''}</dd></div>
              </dl>
              <div className="data-file-url">{row.fileUrl}</div>
              <div className="data-file-actions">
                {row.fileUrl ? <a className="data-action-icon" href={row.fileUrl} target="_blank" rel="noreferrer" aria-label="Mo file" title="Mo file"><ExternalLink size={15} /></a> : null}
                {row.fileUrl ? <a className="data-action-icon" href={row.fileUrl} download aria-label="Tai file" title="Tai file"><Download size={15} /></a> : null}
                {!row.deletedAt ? <button className="data-action-icon" type="button" aria-label="Sua file" title="Sua file" onClick={() => startEdit(row)}><Pencil size={15} /></button> : null}
                {!row.deletedAt ? <button className="data-action-icon" type="button" aria-label="Xoa tam" title="Xoa tam" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ action: 'soft-delete', row })}><Trash2 size={15} /></button> : null}
                {row.deletedAt ? <button className="data-action-icon" type="button" aria-label="Khoi phuc" title="Khoi phuc" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ action: 'restore', row })}><RotateCcw size={15} /></button> : null}
                <button className="data-action-icon is-danger" type="button" aria-label="Xoa vinh vien" title="Xoa vinh vien" disabled={actionMutation.isPending} onClick={() => {
                  if (window.confirm('Xoa vinh vien file nay? File trong Storage se bi xoa neu he thong truy cap duoc object.')) {
                    actionMutation.mutate({ action: 'permanent-delete', row });
                  }
                }}><Trash2 size={15} /></button>
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
              <div><span>Data</span><h3>Sua file</h3></div>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(null)}><X size={14} /> Dong</button>
            </div>
            <label>
              <span>URL hoac gia tri file</span>
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
