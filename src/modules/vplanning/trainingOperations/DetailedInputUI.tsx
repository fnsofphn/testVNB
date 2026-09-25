// @ts-nocheck
import React, { createContext, useContext, useId, useState } from 'react';
import { DETAIL_SCHEMAS, DETAIL_STATUS, canEditDetail, canReviewDetail, defaultDetailDataForTask, detailCourseManager, detailContext, detailOperations, safeDetailUrl } from './detailedInputs.js';
import { getTrainingOperationsFileUrl, uploadTrainingOperationsFile } from './service';
import './DetailedInputUI.css';

export const DetailedInputContext = createContext(null);
export const useDetailedInputs = () => useContext(DetailedInputContext);
function DetailValue({ value }) { return value && safeDetailUrl(value) ? <a href={value} target="_blank" rel="noopener noreferrer">{value}</a> : <>{value || 'Chưa khai báo'}</>; }
export function DetailFields({ inputKey, data = {}, onChange, disabled = false }) {
  const prefix = useId();
  return <div className="form-grid detail-fields">{DETAIL_SCHEMAS[inputKey]?.fields.map(field => <label key={field.key} htmlFor={prefix + field.key}>{field.label}{field.required && <small> · bắt buộc khi gửi kiểm tra</small>}
    {field.type === 'textarea' ? <textarea id={prefix + field.key} disabled={disabled} required={field.required} aria-required={field.required} value={data[field.key] || ''} onChange={e => onChange({ ...data, [field.key]: e.target.value })}/>
      : <input id={prefix + field.key} disabled={disabled} required={field.required} aria-required={field.required} type={field.type} min={field.type === 'number' ? 1 : undefined} step={field.type === 'number' ? 1 : undefined} value={data[field.key] || ''} onChange={e => onChange({ ...data, [field.key]: e.target.value })}/>}
  </label>)}</div>;
}
export function InputDraftFields({ inputKey = 'roster', value, onChange, directory, defaultOwner = '', defaultDue = '', title = '', lockInputKey = false, alwaysEnabled = false }) {
  return <section className="detail-draft-creation"><h4>Thông tin cần cung cấp</h4>
    {!alwaysEnabled && <label className="detail-enable"><input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked ? { key: DETAIL_SCHEMAS[inputKey] ? inputKey : 'roster', title: title || DETAIL_SCHEMAS[inputKey]?.label, ownerId: defaultOwner, reviewerId: defaultOwner, collaboratorIds: [], dueAt: defaultDue, data: {} } : null)}/>Bổ sung thông tin cho công việc</label>}
    {value && <><label>Tên nội dung<input value={value.title || ''} onChange={e => onChange({ ...value, title: e.target.value })}/></label>{lockInputKey ? <div className="detail-locked-type"><small>Loại thông tin</small><b>{DETAIL_SCHEMAS[inputKey]?.label}</b></div> : <label>Loại thông tin<select value={value.key} onChange={e => onChange({ ...value, key: e.target.value, data: {} })}>{Object.entries(DETAIL_SCHEMAS).map(([key, schema]) => <option key={key} value={key}>{schema.label}</option>)}</select></label>}
      <label>Hạn cung cấp<input type="date" value={value.dueAt || ''} onChange={e => onChange({ ...value, dueAt: e.target.value })}/></label>
      <DetailFields inputKey={value.key} data={value.data} onChange={data => onChange({ ...value, data })}/>
      <p className="field-hint">Lưu thành bản nháp. Có thể đính kèm file và gửi kiểm tra sau khi công việc được tạo.</p></>}
  </section>;
}
function ContextSummary({ value, title }) {
  return <details className="detail-inherited"><summary>{title}</summary><dl>{[
    ['Dự án / khách hàng', [value.projectName, value.customer].filter(Boolean).join(' · ')],
    ['Chương trình / đối tượng', [value.program, value.audience].filter(Boolean).join(' · ')],
    ['Khóa / lớp', [value.courseName, value.className].filter(Boolean).join(' / ')],
    ['Giảng viên', value.instructor], ['Thời gian', [value.startDate, value.endDate].filter(Boolean).join(' — ')],
    ['Hình thức / địa điểm', [value.deliveryMode, value.venue].filter(Boolean).join(' · ')],
  ].map(([label, content]) => <div key={label}><dt>{label}</dt><dd>{content || 'Chưa khai báo'}</dd></div>)}</dl>
    {value.thumbnail && safeDetailUrl(value.thumbnail) && <a href={value.thumbnail} target="_blank" rel="noopener noreferrer">Ảnh đại diện khóa học</a>}
  </details>;
}
function InputCard({ input, task, binding }) {
  const api = useDetailedInputs();
  const { actor, role, directory, state, command } = api;
  const context = { actor, role };
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false);
  const [data, setData] = useState({}), [files, setFiles] = useState([]), [reason, setReason] = useState('');
  const [baseRevision, setBaseRevision] = useState(input.revision);
  const [decision, setDecision] = useState('KEEP'), [comparing, setComparing] = useState(false), [error, setError] = useState('');
  const managing = detailCourseManager(state, input.courseId, context);
  const editAllowed = managing || canEditDetail(input, context), reviewAllowed = canReviewDetail(input, context);
  const pinned = input.versions.find(v => v.version === binding?.version);
  const latest = input.versions.find(v => v.version === input.latestVersion);
  const shown = binding ? pinned : latest;
  async function run(type, patch = {}, revision = input.revision) {
    if (busy) return false;
    setBusy(true); setError('');
    try {
      const response = await command(type, { inputId: input.id, expectedRevision: revision, ...patch }, 'Đã lưu thay đổi input.');
      if (!response) { setError('Chưa lưu được. Kiểm tra thông báo hệ thống; nếu dữ liệu đã đổi, đóng form và mở lại bản mới. Nội dung đang nhập vẫn được giữ.'); return false; }
      setEditing(false); setReason(''); setComparing(false);
      return true;
    } catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  }
  function beginEdit() {
    setBaseRevision(input.revision); setData({ ...(input.draft?.data || latest?.data || {}) }); setFiles([...(input.draft?.files || latest?.files || [])]); setReason(input.draft?.reason || ''); setEditing(true);
  }
  async function attach(fileList) {
    setBusy(true); setError('');
    try {
      const selected = Array.from(fileList || []);
      if (files.length + selected.length > 20 || selected.some(f => !f.size || f.size > 25 * 1024 * 1024)) throw new Error('Tối đa 20 file, mỗi file lớn hơn 0 và không quá 25 MB.');
      const uploaded = [];
      for (const file of selected) uploaded.push(await uploadTrainingOperationsFile(file, input.id, 'detail', role));
      setFiles(current => [...current, ...uploaded]);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function openFile(file) {
    // Reserve the window synchronously to work with mobile popup protection.
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    try {
      const url = await getTrainingOperationsFileUrl(file.path, file.name, role);
      if (popup) popup.location.replace(url); else setError('Trình duyệt chặn cửa sổ tải file. Cho phép mở cửa sổ rồi thử lại.');
    } catch (e) { popup?.close(); setError(e.message); }
  }
  const dirty = editing || Boolean(reason.trim());
  return <article className="detail-input-card" data-detail-dirty={dirty ? 'true' : undefined}>
    <header><div><small>{DETAIL_SCHEMAS[input.key]?.label}</small><h3>{input.title}</h3></div><span className={'detail-status ' + input.status}>{DETAIL_STATUS[input.status]}</span></header>
    <div className="detail-people"><span>Hạn cung cấp: <b>{input.dueAt}</b></span></div>
    <p className="detail-version">{binding?.version ? 'Công việc dùng v' + binding.version + ' đã chốt' : binding ? 'Chưa có bản chốt áp dụng cho công việc' : input.latestVersion ? 'Nguồn mới nhất: v' + input.latestVersion : 'Chưa có bản chốt'}{binding?.version && input.latestVersion !== binding.version ? ' · Nguồn mới nhất v' + input.latestVersion : ''}</p>
    {input.feedback && <p className="detail-feedback">{input.feedback}</p>}
    {binding?.pendingVersion > 0 && <div className="detail-version-new"><b>Có phiên bản mới v{binding.pendingVersion}</b><p>{latest?.reason}</p><button type="button" onClick={() => setComparing(!comparing)}>So sánh phiên bản</button></div>}
    {comparing && <div className="detail-comparison"><table><thead><tr><th>Trường</th><th>Bản đang dùng</th><th>Bản mới</th></tr></thead><tbody>{DETAIL_SCHEMAS[input.key]?.fields.filter(f => pinned?.data[f.key] !== latest?.data[f.key]).map(f => <tr key={f.key}><th>{f.label}</th><td>{pinned?.data[f.key] || '—'}</td><td>{latest?.data[f.key] || '—'}</td></tr>)}<tr><th>File</th><td>{pinned?.files?.map(f => f.name).join(', ') || '—'}</td><td>{latest?.files?.map(f => f.name).join(', ') || '—'}</td></tr></tbody></table><ContextSummary value={pinned?.context || {}} title="Thông tin kế thừa bản đang dùng"/><ContextSummary value={latest?.context || {}} title="Thông tin kế thừa bản mới"/>{managing && <><label>Quyết định phiên bản<select value={decision} onChange={e => setDecision(e.target.value)}><option value="KEEP">Giữ bản đang dùng</option><option value="APPLY">Áp dụng bản mới</option><option value="REWORK">Áp dụng và làm lại</option></select></label><label>Lý do quyết định<textarea value={reason} onChange={e => setReason(e.target.value)}/></label><button type="button" disabled={busy || !reason.trim()} onClick={() => run('APPLY_DETAIL_INPUT', { taskId: task.id, decision, reason })}>Xác nhận quyết định</button></>}</div>}
    {shown && <p className="field-hint">Cung cấp bởi {shown.submittedBy?.name || shown.submittedBy?.email || 'Chưa ghi nhận'} · Chốt bởi {shown.approvedBy?.name || shown.approvedBy?.email || 'Chưa ghi nhận'} · {shown.approvedAt ? new Date(shown.approvedAt).toLocaleString('vi-VN') : ''}</p>}
    {shown?.context && <ContextSummary value={shown.context} title={'Thông tin kế thừa lúc chốt v' + shown.version}/>}
    {editing ? <fieldset disabled={busy}><legend>Nhập input · chưa thay đổi bản công việc đang dùng</legend><DetailFields inputKey={input.key} data={data} onChange={setData}/>
      <label>Đính kèm file (tối đa 25 MB/file)<input type="file" multiple onChange={e => { void attach(e.target.files); e.target.value = ''; }}/></label>
      <ul>{files.map((file, index) => <li key={file.path}>{file.name}<button type="button" onClick={() => setFiles(current => current.filter((_, i) => i !== index))}>Bỏ file khỏi bản nháp</button></li>)}</ul>
      <label>Lý do cập nhật / ghi chú<textarea value={reason} onChange={e => setReason(e.target.value)}/></label>
      <div className="detail-actions"><button type="button" onClick={() => { if (window.confirm('Bỏ phần đang sửa chưa lưu?')) setEditing(false); }}>Hủy sửa</button><button type="button" onClick={() => run('SAVE_DETAIL_INPUT', { data, files, reason }, baseRevision)}>Lưu nháp input</button><button type="button" className="primary" onClick={() => run('SUBMIT_DETAIL_INPUT', { data, files, reason }, baseRevision)}>Gửi kiểm tra input</button></div>
    </fieldset> : <><dl className="detail-values">{DETAIL_SCHEMAS[input.key]?.fields.map(f => <div key={f.key}><dt>{f.label}</dt><dd><DetailValue value={(shown?.data || input.draft?.data || {})[f.key]}/></dd></div>)}</dl>
      <div className="detail-files">{(shown?.files || []).map(file => <button type="button" key={file.path} onClick={() => openFile(file)}>Mở tệp · {file.name}</button>)}</div>
      {input.draft && <details className="detail-review-draft" open={input.status === 'REVIEW'}><summary>Bản nháp {input.status === 'REVIEW' ? 'đang chờ kiểm tra' : 'đã lưu'}</summary><dl className="detail-values">{DETAIL_SCHEMAS[input.key]?.fields.map(f => <div key={f.key}><dt>{f.label}</dt><dd><DetailValue value={input.draft.data[f.key]}/></dd></div>)}</dl><p>Lý do: {input.draft.reason || 'Nộp lần đầu'}</p>{input.draft.files.map(file => <button type="button" key={file.path} onClick={() => openFile(file)}>Mở tệp nháp · {file.name}</button>)}</details>}
      <div className="detail-actions">{editAllowed && input.status !== 'REVIEW' && <button type="button" onClick={beginEdit}>Bổ sung input</button>}{reviewAllowed && input.status === 'REVIEW' && <button type="button" className="primary" disabled={busy} onClick={() => run('APPROVE_DETAIL_INPUT')}>Duyệt input</button>}</div>
      <label>Nội dung cần bổ sung<textarea value={reason} onChange={e => setReason(e.target.value)}/></label><button type="button" disabled={busy || !reason.trim()} onClick={() => run(reviewAllowed && input.status === 'REVIEW' ? 'RETURN_DETAIL_INPUT' : 'REQUEST_DETAIL_INPUT', { reason })}>{reviewAllowed && input.status === 'REVIEW' ? 'Trả lại để bổ sung' : 'Yêu cầu bổ sung'}</button></>}
    {error && <p className="detail-error" role="alert">{error}</p>}
    <details><summary>Lịch sử input · {input.history?.length || 0} hoạt động</summary>{[...(input.history || [])].reverse().map(item => <p key={item.id}><b>{item.actor.name || item.actor.email}</b> · {item.happenedAt} · {item.type}{item.details?.reason ? ' · ' + item.details.reason : ''}</p>)}</details>
  </article>;
}
function EmptyInputCard({ task, inputKey, data }) {
  const schema = DETAIL_SCHEMAS[inputKey];
  if (!schema) return null;
  return <article className="detail-input-card detail-input-placeholder">
    <header><div><small>{schema.label}</small><h3>{task.title}</h3></div><span className="detail-status DRAFT">Chưa khai báo</span></header>
    <dl className="detail-values">{schema.fields.map(field => <div key={field.key}><dt>{field.label}</dt><dd><DetailValue value={data?.[field.key]}/></dd></div>)}</dl>
  </article>;
}
export function TaskDetailedInputs({ task }) {
  const api = useDetailedInputs();
  const [draft, setDraft] = useState(() => task.defaultDetailInputKey && !task.inputBindings?.length ? {
    key: task.defaultDetailInputKey,
    title: task.title,
    ownerId: api?.actor?.id || api?.actor?.email || '',
    reviewerId: api?.actor?.id || api?.actor?.email || '',
    collaboratorIds: [],
    dueAt: task.plannedDeadline || task.startDate || '',
    data: api ? defaultDetailDataForTask(api.state, task) : {},
  } : null);
  const [draftTouched, setDraftTouched] = useState(false), [linkId, setLinkId] = useState(''), [backfillReason, setBackfillReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!api) return null;
  const { state, actor, role, directory, command } = api;
  const managing = detailCourseManager(state, task.courseId, { actor, role });
  const schemaKey = task.defaultDetailInputKey || task.input || 'roster';
  const bindings = task.inputBindings || [];
  const all = state.detailedInputs || [];
  const emptyData = defaultDetailDataForTask(state, { ...task, defaultDetailInputKey: schemaKey });
  const available = all.filter(i => i.courseId === task.courseId && i.classId === task.classId && (!task.defaultDetailInputKey || i.key === task.defaultDetailInputKey) && !bindings.some(b => b.inputId === i.id));
  async function create() {
    setBusy(true); setError('');
    try { const result = await command('CREATE_DETAIL_INPUT', { ...draft, taskId: task.id, id: crypto.randomUUID(), backfillReason: backfillReason.trim() }, 'Đã tạo bộ input chi tiết.'); if (result) { setDraft(null); setDraftTouched(false); setBackfillReason(''); } else setError('Chưa tạo được bộ input. Kiểm tra người phụ trách, người chốt và hạn cung cấp.'); } finally { setBusy(false); }
  }
  return <section className="task-detailed-inputs"><h3>Đầu vào công việc</h3>
    {bindings.map(binding => { const input = all.find(i => i.id === binding.inputId); return input ? <InputCard key={input.id} input={input} task={task} binding={binding}/> : <p key={binding.inputId}>Bộ input chưa tải được hoặc ngoài quyền xem. Vui lòng tải lại dữ liệu.</p>; })}
    {!bindings.length && (!managing || task.status === 'IN_REVIEW') && <EmptyInputCard task={task} inputKey={schemaKey} data={emptyData}/>}
    {managing && task.status !== 'IN_REVIEW' && <fieldset className="detail-create-input" disabled={busy} data-detail-dirty={draftTouched || Boolean(backfillReason.trim()) ? 'true' : undefined}><legend>{task.status === 'DONE' ? 'Bổ sung hồ sơ sau hoàn thành' : 'Khai báo đầu vào công việc'}</legend><InputDraftFields inputKey={schemaKey} lockInputKey={Boolean(task.defaultDetailInputKey)} value={draft} onChange={(value) => { setDraft(value); setDraftTouched(true); }} directory={directory} defaultOwner={actor?.id || actor?.email} defaultDue={task.plannedDeadline || task.startDate} title={task.title}/>
      {task.status === 'DONE' && draft && <label>Lý do bổ sung sau hoàn thành<textarea required value={backfillReason} onChange={e => setBackfillReason(e.target.value)} placeholder="Nêu lý do và phạm vi hồ sơ cần bổ sung"/></label>}
      {draft && <button type="button" className="primary" disabled={!draft.ownerId || !draft.reviewerId || !draft.dueAt || (task.status === 'DONE' && !backfillReason.trim())} onClick={create}>{task.status === 'DONE' ? 'Tạo hồ sơ bổ sung' : 'Tạo input'}</button>}
      {available.length > 0 && <><label>Dùng chung bộ input đã có trong lớp<select value={linkId} onChange={e => setLinkId(e.target.value)}><option value="">Chọn bộ input</option>{available.map(i => <option key={i.id} value={i.id}>{i.title} · {DETAIL_SCHEMAS[i.key]?.label}</option>)}</select></label><button type="button" disabled={!linkId} onClick={async () => { const input = available.find(i => i.id === linkId); setBusy(true); try { await command('LINK_DETAIL_INPUT', { inputId: input.id, taskId: task.id, expectedRevision: input.revision }, 'Đã gắn cùng nguồn input.'); setLinkId(''); } finally { setBusy(false); } }}>Gắn vào công việc</button></>}
    </fieldset>}{error && <p role="alert" className="detail-error">{error}</p>}</section>;
}
export function ContextFields({ level, value, onChange }) {
  const fields = level === 'project' ? [['program', 'Chương trình'], ['audience', 'Đối tượng đào tạo']] : level === 'course' ? [['program', 'Chương trình (để trống để kế thừa)'], ['audience', 'Đối tượng (để trống để kế thừa)'], ['deliveryMode', 'Hình thức đào tạo'], ['venue', 'Địa điểm đào tạo'], ['thumbnail', 'URL ảnh đại diện VLearning']] : [['instructor', 'Giảng viên'], ['deliveryMode', 'Hình thức (để trống để kế thừa)'], ['venue', 'Địa điểm (để trống để kế thừa)']];
  return <div className="form-grid">{fields.map(([key, label]) => <label key={key}>{label}<input type={key === 'thumbnail' ? 'url' : 'text'} value={value[key] || ''} onChange={e => onChange({ ...value, [key]: e.target.value })}/></label>)}</div>;
}
function ContextEditor({ courseId, level, target }) {
  const api = useDetailedInputs(), [open, setOpen] = useState(false), [value, setValue] = useState(target), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const allowed = level === 'project' ? detailOperations(api) : detailCourseManager(api.state, courseId, api);
  if (!allowed) return null;
  return <details className="detail-context-editor"><summary>{level === 'project' ? 'Dự án' : level === 'course' ? 'Khóa' : 'Lớp'} · {target.name}</summary><button type="button" onClick={() => { setValue(target); setOpen(!open); }}>Cập nhật thông tin kế thừa</button>{open && <fieldset disabled={busy} data-detail-dirty="true"><ContextFields level={level} value={value} onChange={setValue}/><label>Lý do thay đổi<textarea value={reason} onChange={e => setReason(e.target.value)}/></label><p>Bản input đã chốt giữ nguyên thông tin tại thời điểm chốt. Muốn dùng thông tin mới, gửi và chốt phiên bản input mới.</p><button type="button" disabled={!reason.trim()} onClick={async () => { setBusy(true); try { const response = await api.command('UPDATE_INPUT_CONTEXT', { courseId, classId: target.id, level, data: value, reason }, 'Đã cập nhật thông tin kế thừa.'); if (response) setOpen(false); else setError('Chưa lưu được thông tin.'); } finally { setBusy(false); } }}>Lưu thông tin</button><button type="button" onClick={() => setOpen(false)}>Hủy</button>{error && <p role="alert">{error}</p>}</fieldset>}</details>;
}
export function DetailedInputWorkspace({ courseId }) {
  const api = useDetailedInputs(), [taskId, setTaskId] = useState('');
  if (!api) return null;
  const course = api.state.courses.find(c => c.id === courseId);
  if (!course) return <div className="empty">Chọn khóa học để xem đầu vào.</div>;
  const tasks = api.state.tasks.filter(t => t.courseId === courseId && !t.archivedAt && t.status !== 'CANCELLED');
  const selected = tasks.find(t => t.id === taskId);
  const inputs = (api.state.detailedInputs || []).filter(i => i.courseId === courseId);
  const project = api.state.projects.find(p => p.id === course.projectId);
  return <section className="card detail-workspace"><h2>Đầu vào chi tiết · {course.name}</h2><p>{inputs.length} bộ input · {inputs.filter(i => i.latestVersion > 0).length} có bản chốt · {inputs.filter(i => i.status === 'REVIEW').length} chờ kiểm tra</p>
    {project && <ContextEditor key={project.id} courseId={courseId} level="project" target={project}/>}<ContextEditor key={course.id} courseId={courseId} level="course" target={course}/>{api.state.classes.filter(c => c.courseId === courseId).map(c => <ContextEditor key={c.id} courseId={courseId} level="class" target={c}/>)}
    <label>Chọn công việc sử dụng input<select value={selected?.id || ''} onChange={e => setTaskId(e.target.value)}><option value="">Chọn công việc / hoạt động</option>{tasks.map(t => <option key={t.id} value={t.id}>{t.className || t.classCode} · {t.title}</option>)}</select></label>
    {selected ? <TaskDetailedInputs key={selected.id} task={selected}/> : <p>Nhập ở đây hay trong chi tiết công việc đều cập nhật cùng một bộ input. Chọn đúng hoạt động để bổ sung.</p>}
  </section>;
}
