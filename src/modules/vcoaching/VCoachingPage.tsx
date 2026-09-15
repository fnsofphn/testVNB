import { useCallback, useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import { UploadCloud, LayoutDashboard, Files, Lightbulb, Users, Settings, FileBarChart, History, LogOut, Check, ChevronRight } from 'lucide-react';
import './vcoaching.css';

type Block = { id: string; text: string; label: string; file_name?: string; locator: Record<string, unknown> };
type Version = { number: number; at: string; blocks: Block[]; fields: Record<string, string[]>; revisions: Record<string, string>; confirmed: boolean };
type Comment = { id: string; step: string; problem: string; why: string; question: string; state: string; internal: boolean; stale: boolean; rule: string; evidence: Block[]; priority: string };
type SelfResponse = { agreement: string; reason: string; revisions: Record<string, string>; evidence: string; support: string; self_rating: Record<string, Record<string,string>>; submitted: boolean };
type Initiative = { id: string; name: string; code: string; unit_name: string; project: string; unit: string; status: string; forms: string[]; files: string[]; issues: string[]; versions: Version[]; comments: Comment[]; experts: string[]; released: boolean; responses: SelfResponse[] };
type Catalog = { type: string; id: string; name: string; project: string; unit?: string; time?: string; details?: string };
type Source = { category?: string; id: string; name: string; status: string; sha256?: string; forms: number; initiatives: string[]; ocr_pages?: number[]; error?: string; at: string };
type Account = { id: string; name: string; email: string; grant?: Grant; banned_until?: string };
type Grant = { role: string; active: boolean; super_admin: boolean; projects: string[]; units: string[]; initiatives: string[] };
type Actor = { id: string; email: string; name: string; role: string; super: boolean; switched: boolean; grant: Grant };
type Switch = { role: string; project: string; unit: string; assignee: string };
type Workspace = { schema: Record<string, {id:string;question:string}[]>; projects: Catalog[]; units: Catalog[]; sessions: Catalog[]; library: Catalog[]; initiatives: Initiative[]; files: Source[]; batches: { id: string; at: string; files: { id: string; duplicate: boolean }[] }[] };
const EMPTY: Workspace = { schema: {}, projects: [], units: [], sessions: [], library: [], initiatives: [], files: [], batches: [] };
const STEPS: Record<string, string> = { '1': 'Mục tiêu Rising và vai trò', '2': 'Trạng thái đích', '3': 'Hiện trạng và bằng chứng', '4': 'Điểm nghẽn thật', '5': 'Đối tượng bị ảnh hưởng', '6': 'Sáng kiến can thiệp', '7A': 'Hành vi mới', '7B': 'Cơ chế mới', '7C': 'Kết quả mới', '8': 'Thực thi và bằng chứng' };
const ROLES: Record<string, string> = { expert: 'Giảng viên / chuyên gia', data: 'Chuyên viên dữ liệu', project: 'Quản trị dự án', system: 'Quản trị hệ thống', unit: 'Đơn vị VNPT' };
const STATUS: Record<string, string> = { pending: 'Chờ xác nhận dữ liệu', review: 'Chờ chuyên gia', locked: 'Đã khóa nhận xét', released: 'Đã mở góp ý', self_review: 'Đang tự soi', submitted: 'Đã nộp hiệu chỉnh', rechecked: 'Đã kiểm tra lại', complete: 'Đã xác nhận', uploading: 'Chưa tải xong', queued: 'Chờ đọc', reading: 'Đang đọc', parsed: 'Đã đọc', needs_ocr: 'Cần OCR', needs_classification: 'Cần phân loại', error: 'Lỗi đọc', evidence: 'Bằng chứng đính kèm', classified: 'Đã phân loại', approved: 'Đã duyệt', rejected: 'Đã bác' };
const ISSUES: Record<string, string> = { missing_code: 'Chưa có mã trong nguồn', filename_code_conflict: 'Mã trong tên tệp khác nội dung', code_conflict: 'Trùng mã, tên sáng kiến khác nhau', sources_need_comparison: 'Cần đối chiếu các nguồn', source_incomplete: 'Có nguồn chưa đọc đủ' };
const date = (s: string) => new Date(s).toLocaleString('vi-VN');

export default function VCoachingPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [cloud, setCloud] = useState(false);
  const [actor, setActor] = useState<Actor | null>(null);
  const [work, setWork] = useState<Workspace>(EMPTY);
  const [scope, setScope] = useState<Switch>(() => { try { return JSON.parse(sessionStorage.getItem('vcoaching-scope') || 'null') || { role: '', project: 'vcoaching-test', unit: 'vcoaching-test-unit', assignee: '' }; } catch { return { role: '', project: 'vcoaching-test', unit: 'vcoaching-test-unit', assignee: '' }; } });
  const auditedScope = useRef('');
  const [page, setPage] = useState('overview');
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [exportIds, setExportIds] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [logs, setLogs] = useState<unknown[]>([]);
  const [report, setReport] = useState<unknown>(null);
  const [uploadUnit, setUploadUnit] = useState('vcoaching-test-unit');
  useEffect(() => {
    if (!supabase) { setError('Chưa cấu hình Supabase trong .env.local'); setReady(true); return; }
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((event, value) => { if(event === 'SIGNED_OUT') { setActor(null); setWork(EMPTY); setSelected(''); setScope({role:'',project:'vcoaching-test',unit:'vcoaching-test-unit',assignee:''}); sessionStorage.removeItem('vcoaching-scope'); } setSession(value); });
    return () => data.subscription.unsubscribe();
  }, []);
  const headers = useCallback(() => ({ Authorization: `Bearer ${session?.access_token || ''}`,
    ...(scope.role ? { 'X-VCoaching-Role': scope.role, 'X-VCoaching-Project': scope.project,
      'X-VCoaching-Unit': scope.unit, 'X-VCoaching-Assignee': scope.assignee } : {}) }), [session, scope]);
  const api = useCallback(async (op: string, data?: unknown) => {
    const response = await fetch(`/vc-api/${op}`, { method: data === undefined ? 'GET' : 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch { throw new Error('Máy chủ V-Coaching chưa sẵn sàng. Vui lòng kiểm tra cấu hình triển khai.'); }
    if (!response.ok) throw new Error(result.error || 'Thao tác chưa hoàn tất');
    return result;
  }, [headers]);
  const refresh = useCallback(async () => {
    if (!session) return;
    const [me, ws] = await Promise.all([api('me'), api('workspace')]);
    setActor(me.actor); setCloud(me.storage === 'supabase'); setWork(ws);
    const key = JSON.stringify([session.user.id, scope]);
    if (me.actor.grant.super_admin && auditedScope.current !== key) { auditedScope.current = key; await api('switch-audit', {}); }
    sessionStorage.setItem('vcoaching-scope', JSON.stringify(scope));
  }, [session, api, scope]);
  useEffect(() => {
    void refresh().catch(e => { setActor(null); setWork(EMPTY); setError(e.message); });
    const timer = setInterval(() => void refresh().catch(e => { setActor(null); setWork(EMPTY); setError(e.message); }), 6000);
    return () => clearInterval(timer);
  }, [refresh]);
  const run = async (fn: () => Promise<unknown>, message = 'Đã lưu') => {
    setError(''); setNotice(''); setBusy(true);
    try { await fn(); await refresh(); setNotice(message); } catch (e) { setError(e instanceof Error ? e.message : 'Có lỗi'); }
    finally { setBusy(false); }
  };
  const command = (op: string, data: Record<string, unknown>) => run(() => api(op, data));
  const download = async (op: string, filename: string) => {
    const r = await fetch('/vc-api/' + op, { headers: headers() });
    if (!r.ok) { const data = await r.json(); throw new Error(data.error); }
    if (r.headers.get('Content-Type')?.includes('application/json')) { const data = await r.json(); const link = document.createElement('a'); link.href = data.url; link.download = data.filename || filename; link.rel = 'noreferrer'; link.click(); return; }
    const url = URL.createObjectURL(await r.blob()); const link = document.createElement('a'); link.href = url; link.download = r.headers.get('Content-Type')?.includes('wordprocessingml') && filename.endsWith('.zip') ? filename.replace(/\.zip$/, '.docx') : filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const upload = async (files: File[], unit: string, initiative?: string) => {
    if (!files.length || files.length > 100) throw new Error('Chọn từ 1 đến 100 tệp');
    if (!cloud) {
      const data = await Promise.all(files.map(file => new Promise<{name:string;base64:string}>((resolve,reject) => {
        const reader = new FileReader(); reader.onload=()=>resolve({name:file.name,base64:String(reader.result).split(',')[1]}); reader.onerror=reject; reader.readAsDataURL(file);
      })));
      await api('upload', {unit, initiative, files:data}); return;
    }
    const queued: string[] = [];
    for (const file of files) {
      if (!file.size || file.size > 30*1024*1024) throw new Error(`${file.name}: giới hạn 30 MB`);
      const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(hash), b=>b.toString(16).padStart(2,'0')).join('');
      const ticket = await api('upload-init', {unit, initiative, name:file.name, size:file.size, sha256});
      if (ticket.duplicate) continue;
      const sent = await fetch(ticket.url, {method:'PUT', headers:{'Content-Type':file.type || 'application/octet-stream'}, body:file});
      if (!sent.ok) throw new Error(`Chưa tải được ${file.name}; vui lòng thử lại`);
      await api('upload-complete', {id:ticket.id});
      queued.push(ticket.id);
    }
    // Start only after uploads commit, so job claims do not compete with batch writes.
    void (async () => { for (const id of queued) { await api('process', {id}); await refresh(); } })().catch(()=>undefined);
  };
  const has = (...roles: string[]) => !!actor && (actor.super || roles.includes(actor.role));
  const selectPage = (next: string) => {
    setPage(next); setSelected('');
    if (next === 'accounts' || next === 'assign') void run(async () => setAccounts((await api('accounts')).accounts), '');
    if (next === 'audit') void run(async () => setLogs((await api('audit')).items), '');
    if (next === 'report') void run(async () => setReport(await api('report')), '');
  };
  const initiative = work.initiatives.find(r => r.id === selected);
  if (!ready) return <div className="vc-login">Đang kiểm tra phiên đăng nhập…</div>;
  if (!session) return <div className="vc-root vc-login"><section><span className="vc-logo">V</span><p className="vc-kicker">PEOPLEONE · VNPT RISING</p><h1>V-Coaching</h1><p>Không gian tự soi và hiệu chỉnh sáng kiến</p><form onSubmit={e => {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setError('');
    void supabase?.auth.signInWithPassword({ email: String(f.get('email')).trim(), password: String(f.get('password')) }).then(({ error }) => { if (error) setError(error.message); setBusy(false); });
  }}><label>Email<input name="email" type="email" autoComplete="username" required /></label><label>Mật khẩu<input name="password" type="password" autoComplete="current-password" required /></label><button className="primary" disabled={busy}>Đăng nhập</button></form>{error && <p role="alert" className="vc-error">{error}</p>}<small>Sử dụng tài khoản Auth Test-Vinabrain đã được cấp quyền V-Coaching.</small></section></div>;
  return <div className="vc-root"><header className="vc-header"><div className="vc-brand"><span className="vc-logo">V</span><div><b>V-Coaching</b><small>PEOPLEONE · VNPT RISING</small></div></div><div className="vc-identity"><span>{actor?.name || session.user.email}<small>{actor?.super ? 'Admin tổng' : ROLES[actor?.role || '']}</small></span><button title="Đăng xuất" onClick={() => void supabase?.auth.signOut({scope:'local'})}><LogOut size={17} /></button></div></header>
    <div className="vc-layout"><aside className="vc-sidebar"><p>KHÔNG GIAN LÀM VIỆC</p>{[
      ['overview', 'Tổng quan', LayoutDashboard, true], ['initiatives', 'Sáng kiến', Lightbulb, true],
      ['upload', 'Tiếp nhận tài liệu', UploadCloud, has('unit', 'data', 'project')], ['sources', 'Tệp nguồn', Files, has('unit', 'data', 'project', 'system')],
      ['catalog', 'Chương trình & phiên', Settings, has('data', 'project', 'system')], ['assign', 'Phân công chuyên gia', Users, has('project')],
      ['accounts', 'Tài khoản & quyền', Users, !!actor?.super], ['report', 'Báo cáo', FileBarChart, has('project')], ['audit', 'Nhật ký', History, has('project', 'system')],
    ].filter(x => x[3]).map(([id, name, Icon]) => { const I = Icon as typeof Files; return <button key={String(id)} className={page === id ? 'active' : ''} onClick={() => selectPage(String(id))}><I size={18} />{String(name)}</button>; })}<div className="vc-sidebar-foot">Tự soi → Tự nhận ra<br />Tự đánh giá → Tự hiệu chỉnh<br /><br />2026–2028</div></aside>
    <main className="vc-main">{(actor?.grant.super_admin || scope.role) && <section className="vc-switch"><b>Kiểm thử vai trò</b><select aria-label="Vai trò kiểm thử" value={scope.role} onChange={e => { setScope({ ...scope, role: e.target.value }); setSelected(''); setPage('overview'); }}><option value="">Admin tổng</option>{Object.entries(ROLES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select><select aria-label="Dự án kiểm thử" value={scope.project} onChange={e => setScope({ ...scope, project: e.target.value })}>{work.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select aria-label="Đơn vị kiểm thử" value={scope.unit} onChange={e => setScope({ ...scope, unit: e.target.value })}>{work.units.filter(u => u.project === scope.project).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>{scope.role === 'expert' && <input aria-label="Auth ID chuyên gia được phân công" placeholder="Auth ID chuyên gia được phân công" value={scope.assignee} onChange={e => setScope({ ...scope, assignee: e.target.value })} />}<button onClick={() => { setScope({ ...scope, role: '' }); setPage('overview'); }}>Về Admin tổng</button><small>{scope.role ? `Đang giới hạn theo ${ROLES[scope.role]} · ${scope.project} / ${scope.unit}` : 'Toàn bộ phạm vi'}</small></section>}
    {error && <div className="vc-error" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}{notice && <div className="vc-notice" role="status"><Check size={16} />{notice}</div>}
    <div className="vc-pagehead"><div><p className="vc-kicker">VNPT RISING / {ROLES[actor?.role || ''] || 'ĐANG KẾT NỐI'}</p><h1>{initiative ? initiative.name : ({ overview: 'Từ sáng kiến đến thay đổi', initiatives: 'Hồ sơ sáng kiến', upload: 'Tiếp nhận & chuyển đổi', sources: 'Kho tệp nguồn', catalog: 'Chương trình, đơn vị & phiên khai vấn', accounts: 'Tài khoản & phân quyền', assign: 'Phân công chuyên gia', audit: 'Nhật ký thao tác', report: 'Báo cáo chương trình' } as Record<string, string>)[page]}</h1><p>{initiative ? `${initiative.unit_name} · ${initiative.code || 'Chưa xác nhận mã'}` : 'Dữ liệu có nguồn. Nhận xét có căn cứ. Hiệu chỉnh do đơn vị thực hiện.'}</p></div>{initiative && <button onClick={() => setSelected('')}>← Danh sách</button>}</div>
    {initiative ? <Detail key={initiative.id} record={initiative} work={work} actor={actor!} has={has} command={command} busy={busy} download={() => run(() => download('export?ids=' + initiative.id, initiative.code + '-WS1b.docx'), 'Đã xuất phiếu')} attach={(files) => run(() => upload(files, initiative.unit, initiative.id), 'Đã gắn bằng chứng vào sáng kiến')} source={id => run(() => download('source?id='+id, work.files.find(f=>f.id===id)?.name || 'tai-lieu'))} /> : <>
    {page === 'overview' && <><div className="vc-metrics">{[[work.initiatives.length, 'Sáng kiến'], [work.initiatives.filter(r => r.versions.at(-1)?.confirmed).length, 'Đã xác nhận dữ liệu'], [work.initiatives.filter(r => r.issues.length).length, 'Chờ đối chiếu'], [work.files.filter(f => ['needs_ocr', 'error'].includes(f.status)).length, 'Tệp cần xử lý']].map(([v, label]) => <section key={label}><strong>{v}</strong><span>{label}</span></section>)}</div><section className="vc-hero"><div><p className="vc-kicker">HÀNH TRÌNH KHAI VẤN</p><h2>Nhìn rõ hiện trạng.<br />Làm rõ thay đổi cần tạo ra.</h2><p>Đối chiếu nguồn trước khi xác nhận. Duyệt nhận xét trước khi mở góp ý.</p><button className="primary" onClick={() => selectPage(has('unit', 'data', 'project') ? 'upload' : 'initiatives')}>Bắt đầu làm việc <ChevronRight size={16} /></button></div><ol>{['Tiếp nhận & xác nhận', 'Nhận xét & khóa', 'Mở góp ý & tự soi', 'Kiểm tra lại & báo cáo'].map((s, i) => <li key={s}><span>{i + 1}</span>{s}</li>)}</ol></section><div className="vc-info">Đánh giá ngữ nghĩa AI chưa được cấu hình. Các nhận xét tự động hiện là kiểm tra quy tắc và cần chuyên gia duyệt.</div></>}
    {page === 'upload' && <><section className="vc-card"><h2>Tải hồ sơ từ đơn vị</h2><label>Đơn vị tiếp nhận<select value={uploadUnit} onChange={e => setUploadUnit(e.target.value)}>{work.units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label className="vc-drop"><UploadCloud size={34} /><b>Chọn nhiều tài liệu DOCX hoặc PDF</b><span>Mỗi tệp tối đa 30 MB · Giữ nguyên file và lịch sử</span><input aria-label="Chọn tài liệu" type="file" multiple accept=".docx,.pdf" disabled={busy} onChange={e => {
      const files = [...(e.target.files || [])]; if (!files.length) return;
      void run(() => upload(files, uploadUnit), 'Đã tiếp nhận. Máy chủ tiếp tục xử lý tệp.'); e.target.value = '';
    }} /></label><p>Tên file chỉ là gợi ý. Các mã thiếu, trùng và nguồn khác nhau cần được xác nhận.</p></section><section className="vc-card"><h2>Lô tiếp nhận</h2>{!work.batches.length && <Empty text="Chưa có lô tài liệu. Kết quả sẽ xuất hiện sau khi bạn tải lên." />}{[...work.batches].reverse().map(b => { const fs = b.files.map(x => work.files.find(f => f.id === x.id)).filter(Boolean) as Source[]; return <div className="vc-batch" key={b.id}><b>{date(b.at)}</b><p>{b.files.length} tệp · {fs.reduce((n, f) => n + f.forms, 0)} biểu · {new Set(fs.flatMap(f => f.initiatives)).size} hồ sơ · {b.files.filter(f => f.duplicate).length} tệp nhập lại</p><p>{fs.filter(f => f.status === 'reading' || f.status === 'queued').length} đang chờ/đọc · {fs.filter(f => f.status === 'needs_ocr').length} cần OCR · {fs.filter(f => f.status === 'error').length} lỗi</p></div>; })}</section></>}
    {(page === 'sources' || page === 'upload') && <section className="vc-card"><h2>Trạng thái từng tệp</h2><div className="vc-table"><table><thead><tr><th>Tệp nguồn</th><th>Trạng thái</th><th>Biểu</th><th>Đối chiếu</th></tr></thead><tbody>{work.files.map(f => <tr key={f.id}><td><b>{f.name}</b><small>{f.sha256?.slice(0, 16)}… · {date(f.at)}</small></td><td><Badge value={f.status} />{has('data','project') && <select aria-label={'Phân loại '+f.name} value={f.category || ''} onChange={e => { const category=e.target.value; const reason=window.prompt('Căn cứ phân loại tệp:'); if(reason) void command('classify',{id:f.id,category,reason}); }}><option value=''>Chưa phân loại</option>{Object.entries({forms:'Biểu sáng kiến',guidance:'Hướng dẫn',functions:'Chức năng nhiệm vụ',correspondence:'Công văn',evidence:'Bằng chứng'}).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>}{f.ocr_pages?.length ? <small>Trang cần OCR: {f.ocr_pages.join(', ')}</small> : null}{f.error && <small>{f.error}</small>}</td><td>{f.forms}</td><td><button onClick={() => void run(() => download('source?id=' + f.id, f.name), 'Đã tải nguồn')}>Tải nguồn</button><button onClick={() => void run(async () => { const data = await api('unassigned?id=' + f.id); setLogs(data.blocks); setPage('unassigned'); }, '')}>Chưa mapping</button></td></tr>)}</tbody></table></div></section>}
    {(page === 'initiatives' || page === 'overview' || page === 'assign') && <section className="vc-card"><div className="vc-row"><h2>Danh sách sáng kiến</h2><input aria-label="Tìm sáng kiến" placeholder="Tìm mã hoặc tên sáng kiến…" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="vc-table"><table><thead><tr><th>Mã / Sáng kiến</th><th>Đơn vị</th><th>Nguồn</th><th>Trạng thái</th><th /></tr></thead><tbody>{work.initiatives.filter(r => (r.name + r.code).toLowerCase().includes(search.toLowerCase())).map(r => <tr key={r.id}><td><label className='vc-checkbox'><input type='checkbox' aria-label={'Chọn xuất '+r.code} checked={exportIds.includes(r.id)} onChange={e=>setExportIds(e.target.checked?[...exportIds,r.id]:exportIds.filter(id=>id!==r.id))}/><small>{r.code || 'Chưa có mã'}</small></label><button className="vc-link" onClick={() => setSelected(r.id)}>{r.name}</button></td><td>{r.unit_name}</td><td>{r.forms.includes('master') ? 'Master' : 'Thiếu Master'}<br />{r.forms.includes('detail') ? 'Chi tiết' : 'Thiếu biểu chi tiết'}</td><td><Badge value={r.status} />{r.issues.map(i => <small key={i} className="vc-warning">{ISSUES[i] || i}</small>)}</td><td>{page === 'assign' ? <select aria-label={'Phân công ' + r.code} value={r.experts[0] || ''} onChange={e => void command('assign', { id: r.id, experts: e.target.value ? [e.target.value] : [] })}><option value="">Chưa phân công</option>{accounts.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}</select> : <button onClick={() => setSelected(r.id)}>Mở →</button>}</td></tr>)}</tbody></table></div>{!work.initiatives.length && <Empty text="Chưa có sáng kiến trong phạm vi của bạn. Tải hồ sơ hoặc chờ được phân công." />}{exportIds.some(id=>work.initiatives.some(r=>r.id===id)) && <button onClick={()=>void run(()=>download('export?ids='+exportIds.filter(id=>work.initiatives.some(r=>r.id===id)).join(','),'WS1b-da-chon.zip'),'Đã xuất các phiếu đã chọn')}>Xuất các phiếu đã chọn</button>}{work.initiatives.length > 0 && <button onClick={() => void run(() => download('export?ids=' + work.initiatives.map(r => r.id).join(','), 'WS1b.zip'), 'Đã xuất các phiếu trong phạm vi')}>Xuất tất cả phiếu WS1b</button>}</section>}
    {page === 'catalog' && <CatalogPanel work={work} command={command} />}
    {page === 'accounts' && actor?.super && <AccountsPanel accounts={accounts} work={work} onSave={async data => { await api('account', data); setAccounts((await api('accounts')).accounts); }} run={run} />}
    {(page === 'audit' || page === 'unassigned') && <section className="vc-card"><h2>{page === 'audit' ? 'Nhật ký trong phạm vi' : 'Phần nguồn chưa mapping'}</h2>{logs.length ? <pre className="vc-json">{JSON.stringify(logs, null, 2)}</pre> : <Empty text="Chưa có dữ liệu." />}</section>}
    {page === 'report' && <section className="vc-card"><h2>Tổng hợp theo dữ liệu thực tế</h2><p>Thay đổi câu chữ không được tự tính là cải thiện chất lượng.</p><pre className="vc-json">{JSON.stringify(report, null, 2)}</pre><button onClick={() => void run(() => download('report', 'bao-cao-vcoaching.json'), 'Đã xuất báo cáo')}>Tải báo cáo JSON</button></section>}
    </>}</main></div></div>;
}

function Badge({ value }: { value: string }) { return <span className={'vc-badge ' + value}>{STATUS[value] || value}</span>; }
function Empty({ text }: { text: string }) { return <div className="vc-empty"><Files size={28} /><p>{text}</p></div>; }
function SourceBlock({ block }: { block: Block }) { return <article className="vc-source"><strong>{block.label}</strong><p>{block.text || '(Ô nguồn trống)'}</p><details><summary>{block.file_name || 'Vị trí nguồn'}</summary><small>{JSON.stringify(block.locator)}</small></details></article>; }
type Cmd = (op: string, data: Record<string, unknown>) => Promise<void>;
function Detail({ record: r, work, has, command, busy, download, attach, source }: { attach: (files:File[])=>Promise<void>; source:(id:string)=>Promise<void>; record: Initiative; work: Workspace; actor: Actor; has: (...roles: string[]) => boolean; command: Cmd; busy: boolean; download: () => Promise<void> }) {
  const [step, setStep] = useState('1');
  const [tab, setTab] = useState('mapping');
  const [fields, setFields] = useState(r.versions.at(-1)!.fields);
  const [reason, setReason] = useState('');
  const [code, setCode] = useState(r.code);
  const [name, setName] = useState(r.name);
  const [unitName, setUnitName] = useState(r.unit_name);
  const [resolve, setResolve] = useState(false);
  const [mergeId, setMergeId] = useState('');
  const draft = r.responses?.at(-1);
  const [revisions, setRevisions] = useState<Record<string, string>>(draft?.revisions || {});
  const [ratings, setRatings] = useState<Record<string, Record<string,string>>>(draft?.self_rating || {});
  const [agreement, setAgreement] = useState(draft?.agreement || 'agree');
  const [evidence, setEvidence] = useState(draft?.evidence || '');
  const [support, setSupport] = useState(draft?.support || '');
  useEffect(() => { if(draft) setReason(draft.reason); }, [r.id]);
  const [compare, setCompare] = useState(0);
  const v = r.versions.at(-1)!;
  useEffect(() => setFields(v.fields), [v.number]);
  const fieldText = (version: Version, s: string) => version.revisions[s] ?? version.fields[s].map(id => version.blocks.find(b => b.id === id)?.text || '').join('\n\n');
  return <><section className="vc-toolbar"><Badge value={r.status} /><span>Phiên bản {v.number} · {v.confirmed ? 'Đã xác nhận' : 'Bản nháp'}</span><button onClick={() => void download()}>Xuất WS1b</button><button onClick={() => setTab('mapping')}>Đối chiếu & mapping</button><button onClick={() => setTab('comments')}>Nhận xét ({r.comments.filter(c => !c.stale).length})</button><button onClick={() => setTab('history')}>So sánh phiên bản</button>{has('unit') && r.released && <button onClick={() => setTab('self')}>Tự soi & hiệu chỉnh</button>}</section>
    {r.issues.length > 0 && <div className="vc-info">Cần xác nhận: {r.issues.map(i => ISSUES[i] || i).join(' · ')}</div>}
    <nav className="vc-steps">{['1','2','3','4','5','6','7A','7B','7C','8'].map(id => [id, STEPS[id]]).map(([id, label]) => <button key={id} className={step === id ? 'active' : ''} onClick={() => setStep(id)}><b>{id}</b><span>{label}</span></button>)}</nav>
    {tab === 'mapping' && <><div className="vc-columns"><section className="vc-card"><h2>Nội dung nguồn</h2><p>Chọn đoạn nguồn để mapping vào ô {step}. Mọi phần chưa chọn vẫn được giữ trong hồ sơ.</p><div className="vc-scroll">{v.blocks.map(b => <div key={b.id}>{has('data') && <label className="vc-checkbox"><input type="checkbox" checked={fields[step].includes(b.id)} onChange={e => setFields({ ...fields, [step]: e.target.checked ? [...fields[step], b.id] : fields[step].filter(id => id !== b.id) })} />Đưa vào {step}</label>}<SourceBlock block={b} /></div>)}</div></section><section className="vc-card"><p className="vc-kicker">PHIẾU WS1b · Ô {step}</p><h2>{STEPS[step]}</h2>{v.revisions[step] !== undefined && <><h3>Nội dung đơn vị hiệu chỉnh</h3><pre className='vc-answer'>{v.revisions[step]}</pre><h3>Nguồn đối chiếu</h3></>}{fields[step].length ? fields[step].map(id => { const b = v.blocks.find(b => b.id === id); return b ? <SourceBlock key={id} block={b} /> : null; }) : <Empty text="Chưa có nội dung được mapping. Không tự tạo câu trả lời." />}<p className="vc-warning">Nguồn khác nhau được giữ song song để đối chiếu. Chuyên viên xác nhận lựa chọn và ghi lý do.</p><p>{v.blocks.filter(b => !Object.values(fields).flat().includes(b.id)).length} đoạn chưa mapping, giữ trong hồ sơ và phụ lục xuất.</p></section></div>
      {has('data') && <section className="vc-card"><h2>Xác minh dữ liệu</h2><div className="vc-formgrid"><label>Mã sáng kiến<input value={code} onChange={e => setCode(e.target.value)} /></label><label>Tên đơn vị đúng theo nguồn<input value={unitName} onChange={e => setUnitName(e.target.value)} /></label><label className="wide">Tên sáng kiến<input value={name} onChange={e => setName(e.target.value)} /></label></div><label>Lý do và căn cứ xác minh<textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Nêu tệp, mục/bảng/trang và lý do lựa chọn…" /></label><label className="vc-checkbox"><input type="checkbox" checked={resolve} onChange={e => setResolve(e.target.checked)} />Đã đối chiếu và xử lý các ngoại lệ của hồ sơ</label><div className="vc-row"><button disabled={busy} onClick={() => void command('edit', { id: r.id, fields, code, name, unit_name: unitName, reason, resolve_issues: resolve })}>Lưu phiên bản mapping</button><button className="primary" disabled={busy} onClick={() => void command('confirm', { id: r.id, reason })}>Xác nhận dữ liệu đã lưu</button><button onClick={() => void command('finalize', { id: r.id, reason })}>Xác nhận cuối sau kiểm tra lại</button></div><hr /><label>Ghép với hồ sơ cùng đơn vị<select value={mergeId} onChange={e => setMergeId(e.target.value)}><option value="">Chọn hồ sơ cần ghép…</option>{work.initiatives.filter(x => x.id !== r.id && x.unit === r.unit).map(x => <option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}</select></label><button disabled={!mergeId || !reason || busy} onClick={() => { if (window.confirm('Ghép hai hồ sơ và giữ toàn bộ nguồn, phiên bản?')) void command('merge', { id: r.id, other: mergeId, reason }); }}>Xác nhận ghép nguồn</button></section>}</>}
    {tab === 'comments' && <section className="vc-card"><h2>Nhận xét ô {step}</h2>{r.comments.filter(c => c.step === step).map(c => <article className={'vc-comment ' + (c.stale ? 'stale' : '')} key={c.id}><div className="vc-row"><Badge value={c.state} /><small>{c.rule} · {c.internal ? 'Nội bộ' : 'Có thể công bố sau mở góp ý'}{c.stale && ' · Cần kiểm tra lại'}</small></div><h3>{c.problem}</h3><p>{c.why}</p><blockquote>{c.question}</blockquote><details><summary>Căn cứ nguồn ({c.evidence.length})</summary>{c.evidence.map(b => <SourceBlock key={b.id} block={b} />)}</details>{has('expert', 'project') && !c.stale && <div className="vc-row"><button onClick={() => void command('review', { id: r.id, comment_id: c.id, state: 'approved', internal: true })}>Duyệt nội bộ</button><button onClick={() => void command('review', { id: r.id, comment_id: c.id, state: 'approved', internal: false })}>Duyệt để mở góp ý</button><button onClick={() => void command('review', { id: r.id, comment_id: c.id, state: 'rejected', internal: true })}>Bác</button></div>}</article>)}
      {has('expert') && <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void command('comment', { id: r.id, step, problem: f.get('problem'), why: f.get('why'), question: f.get('question'), notes: f.get('notes'), internal: f.get('internal') === 'on' }); }}><h3>Nhận xét chuyên gia</h3><label>Nhận định<textarea name="problem" required /></label><label>Vì sao cần làm rõ<textarea name="why" required /></label><label>Câu hỏi khai vấn<textarea name="question" required /></label><label>Giả thuyết / ghi chú nội bộ<textarea name="notes" /></label><label className="vc-checkbox"><input name="internal" type="checkbox" defaultChecked />Giữ nhận xét nội bộ</label><button className="primary" disabled={busy}>Lưu nháp nhận xét</button></form>}
      {has('expert', 'project') && <div className="vc-actions"><label>Lý do mở khóa<input value={reason} onChange={e => setReason(e.target.value)} /></label><button onClick={() => void command('lock', { id: r.id })}>Khóa nhận xét</button><button onClick={() => void command('unlock', { id: r.id, reason })}>Mở khóa có lý do</button>{has('project') && <><button className="primary" onClick={() => void command('release', { id: r.id })}>Mở góp ý cho đơn vị</button><button onClick={() => void command('unlock', { id: r.id, reason, target: 'unit' })}>Mở lại bản nộp cho đơn vị</button></>}</div>}
      {has('expert', 'data', 'project') && <button onClick={() => void command('recheck', { id: r.id })}>Kiểm tra lại bản đơn vị đã nộp</button>}</section>}
    {tab === 'history' && <section className="vc-card"><h2>Đối chiếu trước – sau</h2><select aria-label="Phiên bản so sánh" value={compare} onChange={e => setCompare(Number(e.target.value))}>{r.versions.map((x, i) => <option key={x.number} value={i}>Phiên bản {x.number} · {date(x.at)}</option>)}</select><div className="vc-columns"><div><h3>Phiên bản {r.versions[compare]?.number}</h3><pre className="vc-answer">{fieldText(r.versions[compare] || v, step)}</pre></div><div><h3>Hiện tại · Phiên bản {v.number}</h3><pre className="vc-answer">{fieldText(v, step)}</pre></div></div><p>Khác biệt văn bản không tự chứng minh cải thiện chất lượng.</p></section>}
    {tab === 'self' && <section className="vc-card"><h2>Tự soi và hiệu chỉnh</h2><label>Đính kèm bằng chứng DOCX/PDF<input type='file' multiple accept='.docx,.pdf' onChange={e => { const files=[...(e.target.files||[])]; if(files.length) void attach(files); e.target.value=''; }} /></label><div className='vc-row'>{r.files.map(id => <button key={id} onClick={()=>void source(id)}>{work.files.find(f=>f.id===id)?.name || 'Tải nguồn'}</button>)}</div>{Object.entries(work.schema).map(([group, questions]) => <fieldset key={group}><legend>{group === 'gate' ? '5 câu Quality Gate' : '10 tiêu chí tự chấm'}</legend>{questions.map(q => <label key={q.id}>{q.id}. {q.question.replaceAll('VNPT TP.HCM', r.unit_name)}<select value={ratings[group]?.[q.id] || ''} onChange={e => setRatings({...ratings, [group]: {...ratings[group], [q.id]: e.target.value}})}><option value=''>Chưa chọn</option>{['Đạt','Chưa đạt','Chưa rõ'].map(value=><option key={value}>{value}</option>)}</select></label>)}<p>Đơn vị tự chọn: {Object.values(ratings[group] || {}).filter(x=>x==='Đạt').length}/{questions.length} tiêu chí Đạt.</p></fieldset>)}<label>Mức đồng ý<select value={agreement} onChange={e => setAgreement(e.target.value)}><option value="agree">Đồng ý</option><option value="partial">Đồng ý một phần</option><option value="disagree">Không đồng ý</option></select></label><label>Giải thích<textarea value={reason} onChange={e => setReason(e.target.value)} /></label><label>Nội dung đơn vị hiệu chỉnh · {step} {STEPS[step]}<textarea rows={10} value={revisions[step] ?? fieldText(v, step)} onChange={e => setRevisions({ ...revisions, [step]: e.target.value })} /></label><label>Bằng chứng hoặc kế hoạch thiết lập<textarea value={evidence} onChange={e => setEvidence(e.target.value)} /></label><label>Đề nghị hỗ trợ<textarea value={support} onChange={e => setSupport(e.target.value)} /></label><p>Các ô khác giữ nguyên cho đến khi đơn vị chủ động hiệu chỉnh. Tệp đính kèm giữ nguyên nội dung và mã kiểm tra SHA-256.</p><button onClick={() => void command('respond', { id: r.id, agreement, reason, revisions, evidence, support, self_rating: ratings, submit: false })}>Lưu nháp</button><button className="primary" onClick={() => { if (window.confirm('Nộp phiên bản và khóa nội dung hiệu chỉnh?')) void command('respond', { id: r.id, agreement, reason, revisions, evidence, support, self_rating: ratings, submit: true }); }}>Nộp hiệu chỉnh</button></section>}
  </>;
}

function CatalogPanel({ work, command }: { work: Workspace; command: Cmd }) {
  const [kind, setKind] = useState('unit');
  const [editing, setEditing] = useState<Catalog|null>(null);
  return <><section className="vc-card"><h2>{editing ? 'Sửa danh mục' : 'Thêm danh mục'}</h2><form key={editing?.id || kind} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void command('catalog', {...Object.fromEntries(f), ...(editing ? {id:editing.id} : {})}); }}><div className="vc-formgrid"><label>Loại<select name="kind" value={kind} onChange={e => setKind(e.target.value)}><option value="unit">Đơn vị</option><option value="project">Chương trình</option><option value="session">Phiên khai vấn</option><option value="library">Thư viện nhận xét</option></select></label><label>Tên<input name="name" defaultValue={editing?.name || ''} required /></label><label>Dự án<select name="project" defaultValue={editing?.project}>{work.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Đơn vị<select name="unit" defaultValue={editing?.unit || ''}><option value="">Toàn dự án</option>{work.units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>{kind === 'session' && <label>Thời gian<input name="time" type="datetime-local" defaultValue={editing?.time || ''} /></label>}<label>Thông tin / nội dung<textarea name="details" defaultValue={editing?.details || ''} /></label></div><button className="primary">Lưu danh mục</button></form></section><section className="vc-card"><h2>Danh mục hiện có</h2>{[...work.projects, ...work.units, ...work.sessions, ...work.library].map(r => <div key={r.id} className="vc-batch"><b>{r.name}</b><small>{r.time ? date(r.time) : r.id}</small><p>{r.details}</p><button onClick={()=>{setKind(r.type);setEditing(r);}}>Sửa</button></div>)}</section><button onClick={()=>setEditing(null)}>+ Thêm danh mục</button></>;
}

function AccountsPanel({ accounts, work, onSave, run }: { accounts: Account[]; work: Workspace; onSave: (data: unknown) => Promise<void>; run: (fn: () => Promise<unknown>, message?: string) => Promise<void> }) {
  const empty = { role: 'unit', active: true, super_admin: false, projects: ['vcoaching-test'], units: ['vcoaching-test-unit'], initiatives: [] };
  const [selected, setSelected] = useState<Account | null>(null);
  const [grant, setGrant] = useState<Grant>(empty);
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [password, setPassword] = useState(''); const [reason, setReason] = useState('');
  const save = (action: string) => {
    if (!window.confirm(`Xác nhận ${action} tài khoản ${email}?`)) return;
    void run(async () => { await onSave({ action, user_id: selected?.id, email, name, password, grant, reason, confirmed: true }); setPassword(''); }, 'Đã cập nhật tài khoản Auth');
  };
  return <div className="vc-columns"><section className="vc-card"><h2>Tài khoản đăng nhập thật</h2>{accounts.map(u => <button className="vc-account" key={u.id} onClick={() => { setSelected(u); setGrant(u.grant || empty); setEmail(u.email); setName(u.name); setPassword(''); }}><b>{u.name || u.email}</b><span>{u.email}</span><small>{u.grant?.super_admin ? 'Admin tổng' : ROLES[u.grant?.role || '']} · {u.grant?.active ? 'Hoạt động' : 'Đã khóa/thu hồi'}</small></button>)}<button onClick={() => { setSelected(null); setGrant(empty); setEmail(''); setName(''); }}>+ Tạo tài khoản</button></section><section className="vc-card"><h2>{selected ? 'Thông tin & phạm vi' : 'Tạo Auth và hồ sơ'}</h2><label>Họ tên<input value={name} onChange={e => setName(e.target.value)} /></label><label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label><label>Vai trò<select value={grant.role} onChange={e => setGrant({ ...grant, role: e.target.value })}>{Object.entries(ROLES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label><label className="vc-checkbox"><input type="checkbox" checked={grant.active} onChange={e => setGrant({ ...grant, active: e.target.checked })} />Quyền V-Coaching hoạt động</label><label className="vc-checkbox"><input type="checkbox" checked={grant.super_admin} onChange={e => setGrant({ ...grant, super_admin: e.target.checked })} />Admin tổng</label><h3>Dự án được cấp</h3>{work.projects.map(p => <label className="vc-checkbox" key={p.id}><input type="checkbox" checked={grant.projects.includes(p.id)} onChange={e => setGrant({ ...grant, projects: e.target.checked ? [...grant.projects, p.id] : grant.projects.filter(id => id !== p.id) })} />{p.name}</label>)}<h3>Đơn vị được cấp</h3>{work.units.filter(u => grant.projects.includes(u.project)).map(u => <label className="vc-checkbox" key={u.id}><input type="checkbox" checked={grant.units.includes(u.id)} onChange={e => setGrant({ ...grant, units: e.target.checked ? [...grant.units, u.id] : grant.units.filter(id => id !== u.id) })} />{u.name}</label>)}<label>Mật khẩu mới (tối thiểu 14 ký tự)<input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label><label>Lý do<textarea value={reason} onChange={e => setReason(e.target.value)} /></label><div className="vc-row"><button className="primary" onClick={() => save(selected ? 'save' : 'create')}>Lưu tài khoản</button>{selected && <><button onClick={() => save('password')}>Cấp lại mật khẩu</button><button onClick={() => save(grant.active ? 'lock' : 'unlock')}>{grant.active ? 'Khóa' : 'Mở khóa'}</button><button className="danger" onClick={() => save('delete')}>Xóa tài khoản Auth</button></>}</div><p>Không gửi email mời hoặc đặt lại mật khẩu. Quyền mới được kiểm tra ở máy chủ trên từng yêu cầu.</p></section></div>;
}
