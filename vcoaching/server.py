"""Persistent local worker and API. Supabase is the sole authentication authority.

Local mode keeps documents on disk; cloud mode uses private Supabase storage.
No document content is sent to an AI service. Auth is checked on every request.
"""
import base64
import copy
import hashlib
import hmac
import tempfile
import io
import json
import os
import re
import sqlite3
import threading
import time
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from flask import Flask, request, jsonify, send_file, g
from cloud import CloudDB, CloudError
from documents import STEPS, parse, norm, business_code, rules, export_docx, assessment_schema, mapped_outputs

ROOT = Path(__file__).resolve().parents[1]
for line in (ROOT / '.env.local').read_text('utf-8-sig').splitlines() if (ROOT / '.env.local').exists() else []:
    if '=' in line and not line.startswith('#'):
        key, val = line.split('=', 1)
        os.environ.setdefault(key, val.strip().strip('"'))
CLOUD = os.environ.get('VERCEL') == '1' or os.environ.get('VCOACHING_CLOUD') == '1'
DATA = Path(os.environ.get('VCOACHING_DATA_DIR', Path(tempfile.gettempdir()) / 'vcoaching' if CLOUD else ROOT / '.cache/vcoaching/data'))
DATA.mkdir(parents=True, exist_ok=True)
(DATA / 'sources').mkdir(exist_ok=True)
(DATA / 'exports').mkdir(exist_ok=True)
TEMPLATE = Path(os.environ.get('VCOACHING_WS1B_TEMPLATE', str(ROOT / 'vcoaching/templates/WS1b.docx')))
URL = (os.environ.get('SUPABASE_URL') or os.environ.get('VITE_SUPABASE_URL', '')).rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
ROLES = {'expert': 'Giảng viên / chuyên gia', 'data': 'Chuyên viên dữ liệu',
         'project': 'Quản trị dự án', 'system': 'Quản trị hệ thống', 'unit': 'Đơn vị VNPT'}
LOCK = threading.RLock()
if CLOUD:
    DB = CloudDB(URL, KEY, os.environ.get('VCOACHING_NAMESPACE') or os.environ.get('VERCEL_ENV', 'cloud-development'))
else:
    DB = sqlite3.connect(DATA / 'vcoaching.sqlite3', check_same_thread=False, isolation_level=None)
    DB.execute('PRAGMA journal_mode=WAL')
    DB.execute('PRAGMA busy_timeout=10000')
    DB.execute('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL)')
    DB.execute('CREATE INDEX IF NOT EXISTS record_kind ON records(kind)')
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 80 * 1024 * 1024


def now(): return datetime.now(timezone.utc).isoformat()
def ident(): return str(uuid.uuid4())
UNIT_CATALOG = json.loads((ROOT / 'vcoaching/unit_catalog.json').read_text('utf-8'))

def rows(kind):
    with LOCK: records = [json.loads(r[0]) for r in DB.execute('SELECT data FROM records WHERE kind=?', (kind,))]
    if kind == 'unit':
        existing={r['id'] for r in records}
        records.extend(copy.deepcopy(r) for r in UNIT_CATALOG if r['id'] not in existing)
    return records
def get(key, kind=None):
    with LOCK: row = DB.execute('SELECT kind,data FROM records WHERE id=?', (key,)).fetchone()
    if row is None and kind in (None,'unit'):
        catalog=next((r for r in UNIT_CATALOG if r['id']==key),None)
        if catalog: return copy.deepcopy(catalog)
    if row is None or kind and row[0] != kind: raise Problem('Không tìm thấy dữ liệu', 404)
    return json.loads(row[1])
def put(kind, data):
    with LOCK: DB.execute('INSERT INTO records VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
                          (data['id'], kind, json.dumps(data, ensure_ascii=False)))
    return data


class Problem(Exception):
    def __init__(self, message, status=400): self.message, self.status = message, status


def sb(path, method='GET', data=None, token=None):
    headers = {'apikey': KEY, 'Authorization': 'Bearer ' + (token or KEY), 'Content-Type': 'application/json',
               'Prefer': 'return=representation'}
    req = Request(URL + path, headers=headers, method=method,
                  data=json.dumps(data).encode() if data is not None else None)
    try:
        with urlopen(req, timeout=25) as response:
            content = response.read()
            return json.loads(content) if content else None
    except HTTPError as e:
        # Never reflect upstream payloads or request headers containing credentials.
        raise Problem('Supabase từ chối thao tác (' + str(e.code) + ')', e.code if e.code in (401, 403) else 502)


def actor():
    token = request.headers.get('Authorization', '').removeprefix('Bearer ')
    if not token: raise Problem('Cần đăng nhập', 401)
    user = sb('/auth/v1/user', token=token)
    # Fetch the current server-owned grant on EVERY request. Do not authorize from JWT claims.
    fresh = sb('/auth/v1/admin/users/' + user['id'])
    fresh = fresh.get('user', fresh)
    grant = fresh.get('app_metadata', {}).get('vcoaching', {})
    if not grant.get('active') or fresh.get('deleted_at'):
        raise Problem('Quyền V-Coaching đã bị thu hồi', 403)
    if fresh.get('banned_until') and fresh['banned_until'] > now():
        raise Problem('Tài khoản đã bị khóa', 403)
    profile = sb('/rest/v1/vcontent_profiles?select=id,active&auth_user_id=eq.' + user['id'])
    if not profile or not profile[0]['active']: raise Problem('Hồ sơ bị khóa', 403)
    a = {'id': user['id'], 'email': fresh.get('email'), 'name': fresh.get('user_metadata', {}).get('full_name', fresh.get('email')),
         'grant': grant, 'role': grant.get('role'), 'super': bool(grant.get('super_admin')), 'switched': False,
         'projects': grant.get('projects', []), 'units': grant.get('units', []),
         'initiatives': grant.get('initiatives', []), 'assignment_actor': user['id']}
    requested = request.headers.get('X-VCoaching-Role', '')
    if requested:
        if not a['super'] or requested not in ROLES: raise Problem('Không được switch role', 403)
        project, unit = request.headers.get('X-VCoaching-Project', ''), request.headers.get('X-VCoaching-Unit', '')
        if not project or not unit or get(unit, 'unit')['project'] != project:
            raise Problem('Chọn dự án và đơn vị hợp lệ khi switch')
        a.update(role=requested, super=False, switched=True, projects=[project], units=[unit],
                 assignment_actor=request.headers.get('X-VCoaching-Assignee', a['id']), initiatives=[])
    if a['role'] not in ROLES: raise Problem('Chưa cấp vai trò V-Coaching', 403)
    return a


def can(a, r):
    if a['super']: return True
    if r.get('project', r.get('id') if r.get('type') == 'project' else None) not in a['projects']: return False
    if a['role'] in ('unit', 'data', 'system') and r.get('unit') and r['unit'] not in a['units']: return False
    if a['role'] == 'expert':
        iid = r.get('initiative', r['id'] if r.get('type') == 'initiative' else None)
        if iid:
            item = r if r.get('type') == 'initiative' else get(iid, 'initiative')
            return a['assignment_actor'] in item.get('experts', []) or iid in a['initiatives']
        # No batch/source access that could disclose unassigned initiatives.
        if r.get('type') in ('file', 'batch'): return False
    return True


def require(a, roles):
    if not a['super'] and a['role'] not in roles: raise Problem('Không có quyền thực hiện', 403)
def scoped(a, key, kind):
    r = get(key, kind)
    if not can(a, r): raise Problem('Ngoài phạm vi được cấp', 403)
    return r
def internal(a): return a['super'] or a['role'] in ('expert', 'project', 'system')
def step_set(r, key):
    if key in r: return set(r[key])
    if key == 'released_steps': return set(STEPS) if r.get('released') else set()
    return set(STEPS) if r.get('status') in ('locked', 'released', 'self_review', 'submitted', 'rechecked', 'complete') else set()

def visible_initiative(a, r, units=None):
    result = copy.deepcopy(r)
    # Reporting identity does not change the authorization scope on stored records.
    units=rows('unit') if units is None else units
    unit_key=lambda name: ' '.join(re.findall(r'[a-z0-9]+',re.sub(r'\([^)]*\)','',norm(name))))
    matches=[u for u in units if u['project']==r['project'] and unit_key(r['unit_name']) in [unit_key(n) for n in [u['name']]+u.get('aliases',[])]]
    unit=matches[0] if len(matches)==1 else next((u for u in units if u['id']==r['unit']),None)
    if unit:
        result['report_unit']=unit['id']
        result['unit_type']=result.get('unit_type') or unit.get('unit_type','')
    if not result.get('front'):
        for block in r['versions'][-1]['blocks']:
            if 'lien ket chinh' in norm(block['label']): result['front']=block['text'].strip(); break
            match=re.search(r'Liên kết chính:\s*([^\n]+)',block['text'],re.I)
            if match: result['front']=match[1].strip(); break
    result['locked_steps'] = sorted(step_set(r, 'locked_steps'))
    result['released_steps'] = sorted(step_set(r, 'released_steps'))
    if not internal(a):
        result['comments'] = [{k: v for k, v in c.items() if k not in ('notes', 'hypothesis')}
            for c in result['comments'] if a['role'] == 'unit' and r.get('released') and
            c['state'] == 'approved' and c['step'] in step_set(r, 'released_steps') and not c.get('internal') and (c.get('published_at') or not c.get('stale'))]
    return result
def audit(a, action, r=None, before=None, after=None, reason=''):
    put('audit', {'id': ident(), 'at': now(), 'actor': a['id'], 'email': a['email'], 'role': a['role'],
        'switched': a['switched'], 'project': (r or {}).get('project'), 'unit': (r or {}).get('unit'),
        'initiative': (r or {}).get('id') if (r or {}).get('type') == 'initiative' else None,
        'action': action, 'before': before, 'after': after, 'reason': reason,
        'scope': {'projects': a['projects'], 'units': a['units'], 'assignment_actor': a['assignment_actor']}})


def ensure_seed():
    for kind, r in [('project', {'id': 'vcoaching-test', 'type': 'project', 'name': 'VNPT Rising — kiểm thử',
                               'project': 'vcoaching-test', 'test_fixture': True}),
                    ('unit', {'id': 'vcoaching-test-unit', 'type': 'unit', 'project': 'vcoaching-test',
                              'unit': 'vcoaching-test-unit', 'name': 'Đơn vị kiểm thử — chọn đúng tên nguồn khi nhập', 'test_fixture': True})]:
        try: get(r['id'])
        except Problem: put(kind, r)


def new_version(blocks, fields, number=1):
    return {'number': number, 'at': now(), 'blocks': blocks, 'fields': fields, 'revisions': {},
            'confirmed': False, 'not_applicable': []}


def add_candidate(c, file):
    for b in c['blocks']: b.update(file_id=file['id'], file_name=file['name'], file_sha256=file['sha256'])
    scope = {'project': file['project'], 'unit': file['unit']}
    existing = [r for r in rows('initiative') if not r.get('merged_into') and r['project'] == file['project'] and r['unit'] == file['unit']
                and business_code(r['code']) == business_code(c['code']) and c['code']]
    issues = c['issues'] + (['code_conflict'] if existing else [])
    r = {'id': c['id'], 'type': 'initiative', **scope, 'name': c['name'], 'code': c['code'],
         'unit_name': c['unit_name'] or get(file['unit'])['name'], 'source_unit_name': c['unit_name'],
         'files': [file['id']], 'forms': [c['form']], 'issues': issues, 'experts': [],
         'status': 'pending', 'released': False, 'comments': [], 'responses': [],
         'versions': [new_version(c['blocks'], c['fields'])], 'test_fixture': False, 'conversion_pending': True}
    r['comments'].extend(rules(r))
    put('initiative', r)
    return r['id']


def reconcile_sources(project, unit, selected_ids=None):
    selected_ids = set(selected_ids) if selected_ids is not None else None
    if any((selected_ids is None or f['id'] in selected_ids) and f['project']==project and f['unit']==unit and f['status'] in ('queued','reading') for f in rows('file')):
        return False
    candidates = [r for r in rows('initiative') if r['project']==project and r['unit']==unit
                  and (selected_ids is None or set(r['files']) <= selected_ids)
                  and not r.get('merged_into') and not r.get('released') and r['status']=='pending'
                  and not r['versions'][-1].get('revisions')
                  and not any(c.get('rule')=='EXPERT' and not c.get('stale') for c in r['comments'])]
    for combined in mapped_outputs(candidates):
        members = combined.pop('contributing_ids')
        if len(members) < 2: continue
        original = get(combined['id'], 'initiative')
        version = combined['versions'][-1]
        version.update(number=original['versions'][-1]['number']+1, at=now())
        combined['versions'] = original['versions'] + [version]
        combined['forms'] = list(dict.fromkeys(form for rid in members for form in get(rid)['forms']))
        combined['issues'] = list(dict.fromkeys(combined['issues'] + ['sources_need_comparison']))
        combined['comments'] = [{**c, 'stale':True} for c in original['comments']]
        combined['comments'].extend(rules(combined))
        for rid in members:
            if rid == combined['id']: continue
            source = get(rid, 'initiative'); source['merged_into'] = combined['id']; put('initiative', source)
        put('initiative', combined)
    for f in rows('file'):
        if (selected_ids is None or f['id'] in selected_ids) and f['project']==project and f['unit']==unit and f.get('progress') and not f.get('attachment') and f['status'] not in ('uploading','queued','reading','error'):
            for phase in ('merge','check'): f['progress'][phase]={'status':'done','at':now()}
            f['progress']['result']={'status':'done' if f['status']=='parsed' else 'partial','at':now()}
            put('file',f)
    return True


def process_file(file):
    try:
        with LOCK:
            DB.execute('BEGIN IMMEDIATE')
            try:
                current = get(file['id'], 'file')
                if CLOUD and current.get('claim') != file.get('claim'):
                    DB.execute('ROLLBACK'); return
                file['progress'] = {'receive':{'status':'done','at':file.get('at',now())},
                                    'extract':{'status':'running','at':now()}}
                put('file',file); DB.execute('COMMIT')
            except Exception:
                DB.execute('ROLLBACK'); raise
        if CLOUD:
            source = DB.download(file['stored'])
            if len(source)>30*1024*1024 or hashlib.sha256(source).hexdigest()!=file['sha256']: raise ValueError('Nội dung tệp không khớp SHA-256 hoặc vượt giới hạn')
            path = DATA / 'sources' / (file['id'] + '-' + file['claim'] + Path(file['name']).suffix.lower())
            path.write_bytes(source)
        else: path = DATA / 'sources' / file['stored']
        result = parse(path, file['name']) if not file.get('attachment') else None
        file['progress']['extract'] = {'status':'partial' if result and result['ocr_pages'] else 'done','at':now()}
        file['progress']['mapping'] = {'status':'partial' if result and (result['ocr_pages'] or not result['candidates']) else 'done','at':now()}
        file['progress']['merge'] = {'status':'running','at':now()}
        with LOCK:
            DB.execute('BEGIN IMMEDIATE')
            try:
                if CLOUD and get(file['id'], 'file').get('claim') != file.get('claim'):
                    DB.execute('ROLLBACK'); return
                file['verified'] = True
                if file.get('attachment'):
                    attachment = get(file['attachment'], 'initiative')
                    attachment['files'] = list(dict.fromkeys(attachment['files'] + [file['id']]))
                    attachment.setdefault('attachments', []).append({'file': file['id'], 'at': now(), 'uploader': file['uploader']})
                    put('initiative', attachment)
                    file.update(status='evidence', category='evidence', initiatives=[attachment['id']])
                    file['progress'] = {phase:{'status':'done','at':now()} for phase in ('receive','result')}
                    put('file', file); DB.execute('COMMIT'); return
                file.update(status=result['status'], category=result['category'], pages=result['pages'],
                            ocr_pages=result['ocr_pages'], unassigned=result['unassigned'], forms=len(result['candidates']))
                file['initiatives'] = [add_candidate(c, file) for c in result['candidates']]
                if result['ocr_pages']:
                    for iid in file['initiatives']:
                        r = get(iid); r['issues'] = list(set(r['issues'] + ['source_incomplete']))
                        r['comments'] = [c for c in r['comments'] if c['rule'] not in ('EMPTY_LAYER_V1', 'BASELINE_REVIEW_V1', 'OWNER_V1')]
                        put('initiative', r)
                put('file', file)
                # Extraction is ready; synthesis starts with the selected input set.
                for phase in ('merge','check','result'):
                    file['progress'][phase] = {'status':'awaiting_selection','at':now()}
                put('file',file)
                DB.execute('COMMIT')
            except Exception:
                DB.execute('ROLLBACK'); raise
    except CloudError:
        # A transient cloud failure leaves the claim recoverable by the scheduler.
        raise
    except Exception as e:
        with LOCK:
            DB.execute('BEGIN IMMEDIATE')
            try:
                current = get(file['id'], 'file')
                if not CLOUD or current.get('claim') == file.get('claim'):
                    current.update(status='error', error='Không đọc được tệp; kiểm tra định dạng và tải lại.' if CLOUD else str(e)[:300])
                    progress=current.setdefault('progress',{})
                    phase=next((key for key,value in progress.items() if value['status']=='running'),'extract')
                    progress[phase]={'status':'error','at':now()}
                    put('file', current)
                DB.execute('COMMIT')
            except Exception:
                DB.execute('ROLLBACK'); raise
    finally:
        if CLOUD and 'path' in locals(): path.unlink(missing_ok=True)


def cloud_upload(op, a, body):
    require(a, ('unit', 'data', 'project'))
    if op == 'upload-complete':
        f = scoped(a, body.get('id'), 'file')
        if f['uploader'] != a['id']: raise Problem('Chỉ người tải được hoàn tất tệp', 403)
        if f['status'] == 'uploading':
            f['status'] = 'queued'; put('file', f)
            audit(a, 'upload_complete', f)
        return jsonify(id=f['id'], status=f['status'])
    unit = scoped(a, body.get('unit'), 'unit')
    attachment = scoped(a, body['initiative'], 'initiative') if body.get('initiative') else None
    if attachment and attachment['unit'] != unit['id']: raise Problem('Bằng chứng phải cùng đơn vị')
    if attachment and not a['super'] and a['role'] == 'unit' and attachment['status'] not in ('released', 'self_review'):
        raise Problem('Chưa mở hiệu chỉnh để đính kèm bằng chứng')
    name = Path(str(body.get('name', '')).replace('\\', '/')).name
    suffix = Path(name).suffix.lower()
    size, digest = body.get('size'), body.get('sha256', '')
    if suffix not in ('.docx', '.pdf') or not isinstance(size, int) or not 0 < size <= 30*1024*1024:
        raise Problem('Chọn tệp DOCX hoặc PDF không quá 30 MB')
    if not re.fullmatch('[a-f0-9]{64}', str(digest)): raise Problem('Thiếu mã kiểm tra tệp')
    duplicate = next((f for f in rows('file') if f.get('sha256') == digest and f.get('verified') and
                      f['project'] == unit['project'] and f['unit'] == unit['id'] and f['status'] != 'error'), None)
    if duplicate:
        if attachment:
            attachment['files'] = list(dict.fromkeys(attachment['files']+[duplicate['id']]))
            duplicate['initiatives'] = list(dict.fromkeys(duplicate['initiatives']+[attachment['id']]))
            put('initiative', attachment); put('file', duplicate)
        return jsonify(id=duplicate['id'], duplicate=True)
    fid, bid = ident(), ident()
    f = {'id':fid, 'type':'file', 'project':unit['project'], 'unit':unit['id'], 'name':name,
         'sha256':digest, 'size':size, 'uploader':a['id'], 'at':now(), 'batch':bid,
         'status':'uploading', 'forms':0, 'initiatives':[], 'stored':DB.namespace+'/sources/'+fid+suffix,
         'attachment':attachment['id'] if attachment else None}
    url = DB.sign_upload(f['stored'])
    put('file', f)
    batch = {'id':bid,'type':'batch','project':f['project'],'unit':f['unit'],'at':now(),'uploader':a['id'],'files':[{'id':fid,'duplicate':False}]}
    put('batch', batch); audit(a, 'upload_init', batch)
    return jsonify(id=fid, url=url, duplicate=False)


def worker_secret(namespace):
    return hmac.new(KEY.encode(), ('vcoaching-worker-v1:'+namespace).encode(), hashlib.sha256).hexdigest()


def cloud_process(op):
    if request.method != 'POST': raise Problem('Chỉ chấp nhận POST', 405)
    body = request.get_json(silent=True) or {}
    a = None
    if op == 'tick':
        if not KEY or body.get('namespace') != DB.namespace or not hmac.compare_digest(
            request.headers.get('Authorization',''), 'Bearer '+worker_secret(DB.namespace)):
            raise Problem('Không được gọi worker', 403)
    else:
        a = actor(); require(a, ('unit','data','project'))
        scoped(a, body.get('id'), 'file')
    claimed = None
    with LOCK:
        DB.execute('BEGIN IMMEDIATE')
        try:
            candidates = [get(body['id'], 'file')] if a else rows('file')
            for f in candidates:
                if f['status'] != 'queued' and not (f['status']=='reading' and f.get('claim_until',0)<time.time()): continue
                if f.get('attempts',0)>=3:
                    f.update(status='error',error='Đọc tệp đã bị gián đoạn 3 lần; vui lòng tải lại.'); put('file',f); continue
                f.update(status='reading',claim=ident(),claim_until=time.time()+330,attempts=f.get('attempts',0)+1)
                put('file', f); claimed=f; break
            DB.execute('COMMIT')
        except Exception:
            DB.execute('ROLLBACK'); raise
    if claimed: process_file(claimed)
    return jsonify(ok=True, processed=claimed['id'] if claimed else None)


def cloud_export(content, filename, a):
    key = DB.namespace+'/exports/'+a['id']+'/'+ident()+'/'+filename
    DB.upload(key, content)
    return jsonify(url=DB.sign_download(key, filename), filename=filename)


def worker():
    for f in rows('file'):
        if f['status'] == 'reading': f['status'] = 'queued'; put('file', f)
    while True:
        for f in rows('file'):
            if f['status'] == 'queued':
                f['status'] = 'reading'; put('file', f); process_file(f)
        time.sleep(.5)


@app.errorhandler(CloudError)
@app.errorhandler(Problem)
def problem(e): return jsonify(error=e.message), e.status
@app.before_request
def serialize_mutations():
    # Serialize read-modify-write operations with the background importer.
    op = (request.view_args or {}).get('op') or request.args.get('op', 'me')
    if request.method == 'POST' and op not in ('tick','process'):
        if CLOUD: g.vc_actor = actor()
        LOCK.acquire(); g.mutation_lock = True
        DB.execute('BEGIN IMMEDIATE')
@app.teardown_request
def release_mutation_lock(error):
    if getattr(g, 'mutation_lock', False):
        if DB.in_transaction: DB.execute('ROLLBACK')
        LOCK.release()
@app.errorhandler(413)
def too_large(e): return jsonify(error='Lô vượt giới hạn 80 MB'), 413
@app.errorhandler(Exception)
def unexpected(e):
    app.logger.error('V-Coaching request failed: %s', type(e).__name__)
    return jsonify(error='Thao tác chưa hoàn tất; dữ liệu đã lưu vẫn được giữ. Kiểm tra máy chủ.'), 500
@app.after_request
def response_headers(response):
    if getattr(g, 'mutation_lock', False) and DB.in_transaction:
        DB.execute('COMMIT' if response.status_code < 400 else 'ROLLBACK')
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


@app.route('/api/vcoaching', methods=['GET', 'POST'])
@app.route('/vc-api/<op>', methods=['GET', 'POST'])
def api(op=None):
    op = op or request.args.get('op', 'me')
    if op in ('tick','process') and CLOUD: return cloud_process(op)
    a = getattr(g, 'vc_actor', None) or actor()
    body = request.get_json(silent=True) or {}
    write_ops = {'catalog', 'upload', 'edit', 'merge', 'confirm', 'assign', 'comment', 'review',
                 'lock', 'unlock', 'release', 'respond', 'finalize', 'account', 'switch-audit', 'recheck', 'classify', 'config', 'compare-review', 'convert', 'upload-init', 'upload-complete'}
    if op in write_ops and request.method != 'POST': raise Problem('Chỉ chấp nhận POST', 405)
    if op == 'me':
        return jsonify(actor=a, roles=ROLES, steps=STEPS, storage='supabase' if CLOUD else 'local',
                       ai={'enabled': False, 'message': 'Chưa cấu hình đánh giá ngữ nghĩa. Chỉ kiểm tra quy tắc; chuyên gia đánh giá nội dung.'})
    if op == 'switch-audit':
        audit(a, 'switch_role', after={'role': a['role'], 'projects': a['projects'], 'units': a['units']})
        return jsonify(ok=True)
    if op == 'config':
        require(a, ('system',))
        project = body.get('project')
        if project not in a['projects'] and not a['super']: raise Problem('Ngoài dự án', 403)
        get(project, 'project')
        stages = ('Trích xuất','Chuẩn hóa 8 bước','Tạo Trang 00','Kiểm tra logic','Kiểm tra sau hiệu chỉnh','Phân tích trước – sau')
        if body.get('stage') not in stages or not body.get('text', '').strip(): raise Problem('Chọn công đoạn và nhập chỉ dẫn')
        key = project + ':ai:' + str(stages.index(body['stage']))
        previous = next((x for x in rows('config') if x['id'] == key), None)
        item = {'id': key, 'type': 'config', 'project': project, 'stage': body['stage'], 'text': body['text'].strip(), 'at': now(), 'by': a['id']}
        put('config', item); audit(a, 'config', item, before=previous, after=item)
        return jsonify(ok=True)
    if op == 'workspace':
        catalog_units=rows('unit')
        initiatives = [visible_initiative(a, r, catalog_units) for r in rows('initiative') if not r.get('merged_into') and not r.get('conversion_pending') and can(a, r)]
        search = norm(request.args.get('q', ''))
        if search: initiatives = [r for r in initiatives if search in norm(r['name'] + ' ' + r['code'])]
        files = [f for f in rows('file') if can(a, f)]
        safe_files = [{k: v for k, v in f.items() if k not in ('stored', 'unassigned')} for f in files]
        return jsonify(configs=[r for r in rows('config') if can(a, r)] if a['super'] or a['role']=='system' else [], schema=assessment_schema(str(TEMPLATE)), projects=[r for r in rows('project') if can(a, r)],
                       units=[r for r in catalog_units if can(a, r)],
                       sessions=[r for r in rows('session') if can(a, r)],
                       library=[r for r in rows('library') if can(a, r)] if internal(a) else [],
                       initiatives=initiatives, files=safe_files,
                       batches=[r for r in rows('batch') if can(a, r)])
    if op == 'catalog':
        require(a, ('project', 'system', 'data'))
        kind = body.get('kind')
        if kind not in ('project', 'unit', 'session', 'library'): raise Problem('Danh mục không hợp lệ')
        if kind in ('project', 'library'): require(a, ('system', 'project'))
        project = body.get('project')
        if not a['super'] and project not in a['projects']: raise Problem('Ngoài dự án', 403)
        if kind != 'project': get(project, 'project')
        if not body.get('name', '').strip(): raise Problem('Cần nhập tên')
        if body.get('id'): scoped(a, body['id'], kind)
        rid = body.get('id') or ident()
        r = {'id': rid, 'type': kind, 'name': body['name'].strip(), 'project': project if kind != 'project' else rid,
             'unit': rid if kind == 'unit' else body.get('unit'), 'time': body.get('time'), 'details': body.get('details', '')}
        for key in ('step','category','priority','active','question','why','unit_type','front'):
            if key in body: r[key] = body[key]
        if r.get('unit') and kind != 'unit': scoped(a, r['unit'], 'unit')
        put(kind, r); audit(a, 'catalog_' + kind, r, after=r)
        return jsonify(item=r)
    if op in ('upload-init', 'upload-complete') and CLOUD: return cloud_upload(op, a, body)
    if op == 'upload' and CLOUD: raise Problem('Sử dụng upload trực tiếp lên kho riêng', 400)
    if op == 'upload':
        require(a, ('unit', 'data', 'project'))
        unit = scoped(a, body.get('unit'), 'unit')
        attachment = scoped(a, body['initiative'], 'initiative') if body.get('initiative') else None
        if attachment and attachment['unit'] != unit['id']: raise Problem('Bằng chứng phải cùng đơn vị')
        if attachment and not a['super'] and a['role'] == 'unit' and attachment['status'] not in ('released', 'self_review'):
            raise Problem('Chưa mở hiệu chỉnh để đính kèm bằng chứng')
        project = unit['project']
        batch = {'id': ident(), 'type': 'batch', 'project': project, 'unit': unit['id'], 'at': now(), 'uploader': a['id'], 'files': []}
        files = body.get('files', [])
        if not files or len(files) > 100: raise Problem('Chọn từ 1 đến 100 tệp trong một lô')
        for item in files:
            name = Path(item.get('name', '').replace('\\', '/')).name
            suffix = Path(name).suffix.lower()
            f = {'id': ident(), 'type': 'file', 'project': project, 'unit': unit['id'], 'name': name,
                 'uploader': a['id'], 'at': now(), 'batch': batch['id'], 'status': 'queued', 'forms': 0, 'initiatives': []}
            try:
                if suffix not in ('.docx', '.pdf'): raise ValueError('Chỉ hỗ trợ DOCX và PDF')
                data = base64.b64decode(item.get('base64', ''), validate=True)
                if not data or len(data) > 30 * 1024 * 1024: raise ValueError('Tệp rỗng hoặc vượt 30 MB')
                f['sha256'] = hashlib.sha256(data).hexdigest()
                duplicate = next((x for x in rows('file') if x.get('sha256') == f['sha256'] and
                                  x['project'] == project and x['unit'] == unit['id'] and x['status'] != 'error'), None)
                if duplicate:
                    if attachment:
                        attachment['files'] = list(dict.fromkeys(attachment['files'] + [duplicate['id']]))
                        duplicate['initiatives'] = list(dict.fromkeys(duplicate['initiatives'] + [attachment['id']]))
                        put('file', duplicate)
                    batch['files'].append({'id': duplicate['id'], 'duplicate': True}); continue
                f['stored'] = f['id'] + suffix
                (DATA / 'sources' / f['stored']).write_bytes(data)
                if attachment:
                    f.update(status='evidence', category='evidence', initiatives=[attachment['id']])
                    attachment['files'].append(f['id'])
                    attachment.setdefault('attachments', []).append({'file': f['id'], 'at': now(), 'uploader': a['id']})
            except Exception as e: f.update(status='error', error=str(e)[:200])
            put('file', f); batch['files'].append({'id': f['id'], 'duplicate': False})
        if attachment: put('initiative', attachment)
        put('batch', batch); audit(a, 'upload', batch, after={'files': batch['files']})
        return jsonify(batch=batch)
    if op in ('source', 'unassigned'):
        f = get(request.args.get('id'), 'file')
        if a['role'] == 'expert' and not a['super']:
            # A combined file is readable only when every contained initiative is assigned.
            if not f['initiatives'] or not all(can(a, get(i, 'initiative')) for i in f['initiatives']):
                raise Problem('Tệp chứa hồ sơ ngoài phân công', 403)
        elif not can(a, f): raise Problem('Ngoài phạm vi tệp', 403)
        if op == 'unassigned': return jsonify(blocks=f.get('unassigned', []))
        if not f.get('stored'): raise Problem('Tệp không đọc được', 404)
        audit(a, 'download_source', f, after={'file': f['id']})
        if CLOUD: return jsonify(url=DB.sign_download(f['stored'], f['name']), filename=f['name'])
        return send_file(DATA / 'sources' / f['stored'], as_attachment=True, download_name=f['name'])
    if op == 'classify':
        require(a, ('data', 'project'))
        f = scoped(a, body.get('id'), 'file')
        category = body.get('category')
        if category not in ('forms', 'guidance', 'functions', 'correspondence', 'evidence'): raise Problem('Phân loại không hợp lệ')
        if not body.get('reason', '').strip(): raise Problem('Cần căn cứ phân loại')
        before = f.get('category'); f['category'] = category
        f['classified_by'], f['classified_at'] = a['id'], now()
        if f['status'] == 'needs_classification': f['status'] = 'classified'
        put('file', f); audit(a, 'classify_file', f, before=before, after=category, reason=body['reason'])
        return jsonify(ok=True)
    if op == 'report':
        require(a, ('project','system'))
        records = [r for r in rows('initiative') if not r.get('merged_into') and not r.get('conversion_pending') and can(a, r)]
        report = {'at': now(), 'scope': a['projects'], 'total': len(records),
                  'items': [{'code': r['code'], 'name': r['name'], 'unit': r['unit_name'], 'status': r['status'],
                             'versions': len(r['versions']), 'confirmed': r['versions'][-1]['confirmed'],
                             'needs_review': len([c for c in r['comments'] if c['state'] == 'pending'])} for r in records],
                  'note': 'Thay đổi nội dung không tự chứng minh cải thiện chất lượng hoặc thành công.'}
        audit(a, 'export_report', after={'count': len(records)})
        return jsonify(report)
    if op == 'audit':
        require(a, ('project', 'system', 'data', 'expert'))
        return jsonify(items=[r for r in rows('audit') if (a['super'] or r.get('project') in a['projects'] and (not r.get('unit') or r['unit'] in a['units'])) and (a['role'] not in ('data','expert') or (r['action'] in ('edit','merge','confirm','finalize','upload','classify_file') if a['role']=='data' else r['actor']==a['id'] and r['action'] in ('comment','review','lock','unlock'))) ][-500:])
    if op in ('accounts', 'account'): return accounts(op, a, body)
    if op == 'convert':
        require(a, ('data','project','unit','system'))
        ids = body.get('files', [])
        if not isinstance(ids,list) or not 1 <= len(ids) <= 100: raise Problem('Chọn từ 1 đến 100 tệp')
        files = [scoped(a, fid, 'file') for fid in ids]
        if any(f['status'] in ('uploading','queued','reading') for f in files): raise Problem('Tài liệu đang được xử lý',409)
        for project, unit in {(f['project'],f['unit']) for f in files}:
            if not reconcile_sources(project,unit,ids): raise Problem('Đang chờ các tệp còn lại của đơn vị được xử lý',409)
        all_records=rows('initiative')
        detail_ids={fid for r in all_records if r['forms']==['detail'] for fid in r['files'] if fid in ids}
        records = [r for r in all_records if not r.get('merged_into') and can(a,r)
                   and set(r['files']) & (detail_ids or set(ids))]
        for record in records:
            # Existing source history is retained; unrelated initiatives in the
            # same master no longer block a selected detail's analysis.
            record['conversion_pending']=False; put('initiative',record)
        # The enclosing write transaction serializes number allocation, including
        # concurrent cloud invocations. Source codes remain unchanged.
        try: sequence=get('initiative-number-sequence','sequence')
        except Problem: sequence={'id':'initiative-number-sequence','value':0}
        all_records=rows('initiative')
        sequence['value']=max([sequence['value']]+[int(r['tracking_code'][3:]) for r in all_records if re.fullmatch(r'SK-\d+',r.get('tracking_code',''))])
        for record in sorted(all_records,key=lambda r:r['id']):
            if record.get('merged_into') or record.get('conversion_pending') or not can(a,record): continue
            if not record.get('tracking_code'):
                sequence['value']+=1;record['tracking_code']=f"SK-{sequence['value']:06d}"
            peers=[other for other in all_records if other['id']!=record['id'] and not other.get('merged_into')
                   and not other.get('conversion_pending') and other['project']==record['project']
                   and norm(other['unit_name'])==norm(record['unit_name'])
                   and business_code(other['code'])==business_code(record['code']) and record['code']]
            if not peers: record['issues']=[issue for issue in record['issues'] if issue!='code_conflict']
            put('initiative',record)
        put('sequence',sequence)
        audit(a, 'convert_sources', after={'files':ids,'initiatives':[r['id'] for r in records]})
        return jsonify(initiatives=[r['id'] for r in records])
    if op == 'mapped-export':
        ids = list(dict.fromkeys(request.args.get('files', '').split(',')))
        if not ids or not all(ids) or len(ids) > 100: raise Problem('Chọn từ 1 đến 100 tệp')
        files = [scoped(a, fid, 'file') for fid in ids]
        if any(f['status'] in ('uploading','queued','reading') for f in files): raise Problem('Tài liệu đang được xử lý', 409)
        scopes = {(f['project'], f['unit']) for f in files}
        records = [r for r in rows('initiative') if not r.get('merged_into') and can(a, r) and (r['project'],r['unit']) in scopes]
        outputs = [r for r in mapped_outputs(records) if set(r['files']) & set(ids)]
        memory = io.BytesIO()
        with tempfile.TemporaryDirectory(dir=DATA / 'exports') as directory, zipfile.ZipFile(memory, 'w', zipfile.ZIP_DEFLATED) as archive:
            summary = ['KẾT QUẢ TỰ ÁNH XẠ V-COACHING', f'{len(files)} tệp đầu vào; {len(outputs)} phiếu WS1b.', '']
            for index, r in enumerate(outputs, 1):
                code = re.sub(r'[^A-Za-z0-9._-]', '_', r['code'])[:60] or 'Chua-co-ma'
                path = Path(directory) / f'{index:02d}-{code}-WS1b.docx'
                export_docx(r, TEMPLATE, path); archive.write(path, path.name)
                summary.extend([f"{index}. {r['code']} — {r['name']}", *r['mapping_notes'], ''])
            for f in files:
                summary.append(f"Tệp: {f['name']} — {f['status']}")
                if f.get('error'): summary.append(f['error'])
                if f.get('ocr_pages'): summary.append('Trang cần OCR: ' + ', '.join(map(str,f['ocr_pages'])))
                if not f.get('initiatives'): summary.append('Chưa xác định được sáng kiến từ tệp này; không coi là đã ánh xạ đầy đủ.')
                for b in f.get('unassigned', []):
                    if b.get('text', '').strip(): summary.append(str(b.get('locator', {})) + ': ' + b['text'])
            archive.writestr('Tong-hop-ket-qua.txt', '\n'.join(summary))
        audit(a, 'export_mapping', after={'files':ids,'outputs':len(outputs)})
        if CLOUD: return cloud_export(memory.getvalue(), 'VCoaching-ket-qua.zip', a)
        memory.seek(0)
        return send_file(memory, as_attachment=True, download_name='VCoaching-ket-qua.zip', mimetype='application/zip')
    if op == 'export':
        ids = request.args.get('ids', '').split(',')
        if not ids or len(ids) > 100: raise Problem('Chọn tối đa 100 sáng kiến')
        selected = [scoped(a, i, 'initiative') for i in ids]
        output = []
        for r in selected:
            if not r['unit_name'] or r['unit_name'].startswith('Đơn vị kiểm thử'):
                raise Problem('Cần xác nhận tên đơn vị trước khi xuất')
            code = re.sub(r'[^A-Za-z0-9._-]', '_', r['code'])[:80] or 'WS1b'
            dest = DATA / 'exports' / (code + '-' + r['id'] + '-v' + str(r['versions'][-1]['number']) + '-' + ident() + '.docx')
            export_docx(r, TEMPLATE, dest); output.append(dest)
            audit(a, 'export_ws1b', r, after={'version': r['versions'][-1]['number']})
        if len(output) == 1:
            if CLOUD:
                content = output[0].read_bytes(); output[0].unlink(missing_ok=True)
                return cloud_export(content, output[0].name, a)
            return send_file(output[0], as_attachment=True)
        memory = io.BytesIO()
        with zipfile.ZipFile(memory, 'w', zipfile.ZIP_DEFLATED) as z:
            for f in output: z.write(f, f.name)
        memory.seek(0)
        if CLOUD:
            for f in output: f.unlink(missing_ok=True)
            return cloud_export(memory.getvalue(), 'WS1b.zip', a)
        return send_file(memory, as_attachment=True, download_name='WS1b.zip', mimetype='application/zip')
    r = scoped(a, body.get('id') or request.args.get('id'), 'initiative')
    if op == 'detail': return jsonify(initiative=visible_initiative(a, r))
    if op == 'assessment': return jsonify(schema=assessment_schema(str(TEMPLATE)))
    old = copy.deepcopy(r)
    version = r['versions'][-1]
    reason = body.get('reason', '').strip()
    if op == 'merge':
        require(a, ('data', 'project'))
        other = scoped(a, body.get('other'), 'initiative')
        if other['id'] == r['id'] or other.get('merged_into') or r.get('merged_into'): raise Problem('Hồ sơ ghép không hợp lệ')
        if (other['project'], other['unit']) != (r['project'], r['unit']) or not reason: raise Problem('Chỉ ghép cùng đơn vị/dự án, cần lý do')
        ov = other['versions'][-1]
        v = new_version(version['blocks'] + ov['blocks'], {s: version['fields'][s] + ov['fields'][s] for s in STEPS}, version['number'] + 1)
        r['versions'].append(v); r['files'] = list(set(r['files'] + other['files'])); r['forms'] = list(set(r['forms'] + other['forms']))
        r.setdefault('merge_origins', []).append({'id': other['id'], 'code': other['code'], 'name': other['name'], 'files': other['files'], 'at': now(), 'by': a['id'], 'reason': reason})
        r['issues'] = ['sources_need_comparison']; other['merged_into'] = r['id']; put('initiative', other)
        r['released'], r['status'] = False, 'pending'
        r['locked_steps'], r['released_steps'], r['submitted_steps'] = [], [], []
        for c in r['comments']: c['stale'] = True
        r['comments'].extend(rules(r))
    elif op == 'edit':
        require(a, ('data',))
        if not reason: raise Problem('Cần lý do và căn cứ sửa mapping')
        fields = body.get('fields', version['fields'])
        allowed = {b['id'] for b in version['blocks']}
        if set(fields) != set(STEPS) or any(not isinstance(v, list) or not set(v) <= allowed for v in fields.values()):
            raise Problem('Mapping phải tham chiếu đoạn nguồn thuộc hồ sơ')
        v = copy.deepcopy(version); v.update(number=version['number'] + 1, fields=fields, at=now(), confirmed=False)
        corrections = body.get('corrections', {})
        if not isinstance(corrections, dict) or not set(corrections) <= allowed or any(not isinstance(t,str) for t in corrections.values()): raise Problem('Hiệu chỉnh phải gắn đoạn nguồn của hồ sơ')
        for block in v['blocks']:
            if block['id'] in corrections:
                block.setdefault('original_text', block['text']); block['text'] = corrections[block['id']]
        r['versions'].append(v)
        for key in ('name', 'code', 'unit_name', 'unit_type', 'front'):
            if key in body: r[key] = str(body[key]).strip()
        r['issues'] = [] if body.get('resolve_issues') else r['issues']
        r['status'], r['released'] = 'pending', False
        r['locked_steps'], r['released_steps'], r['submitted_steps'] = [], [], []
        for c in r['comments']: c['stale'] = True
        r['comments'].extend(rules(r))
    elif op in ('confirm', 'finalize'):
        require(a, ('data',))
        if not reason or r['issues'] or not r['code'] or not r['unit_name']: raise Problem('Cần xử lý ngoại lệ, mã, tên đơn vị và ghi căn cứ xác nhận')
        if any(get(fid, 'file')['status'] in ('needs_ocr', 'error', 'reading', 'queued') for fid in r['files']): raise Problem('Nguồn chưa đọc đủ; chưa thể xác nhận')
        if op == 'finalize' and r['status'] != 'rechecked': raise Problem('Cần kiểm tra lại sau hiệu chỉnh')
        if op == 'finalize' and any(c['state']=='pending' and not c.get('stale') for c in r['comments']): raise Problem('Cần xử lý các nhận xét kiểm tra lại trước khi hoàn tất')
        if op == 'confirm' and r['status'] in ('released','self_review','submitted','complete'): raise Problem('Không xác nhận lại trong khi đơn vị đang phản hồi hoặc hồ sơ đã hoàn tất')
        version['confirmed'] = True; version['confirmed_by'] = a['id']; version['confirmed_at'] = now()
        r['status'] = 'complete' if op == 'finalize' else ('rechecked' if r['status']=='rechecked' else 'review')
    elif op == 'assign':
        require(a, ('project',))
        ids = body.get('experts', [])
        for uid in ids:
            expert = sb('/auth/v1/admin/users/' + uid); expert = expert.get('user', expert)
            expert_grant = expert.get('app_metadata', {}).get('vcoaching', {})
            if not expert_grant.get('active') or expert_grant.get('role') != 'expert' or r['project'] not in expert_grant.get('projects', []): raise Problem('Chuyên gia chưa có quyền dự án')
        r['experts'] = ids
    elif op == 'comment':
        require(a, ('expert',))
        if body.get('step') in step_set(r, 'locked_steps') or r['status'] in ('submitted','complete'): raise Problem('Nhận xét đã khóa; cần mở khóa có lý do')
        if body.get('step') not in STEPS or not all(body.get(k, '').strip() for k in ('problem', 'why', 'question')): raise Problem('Nhập bước, nhận định, lý do và câu hỏi')
        c = {k: body.get(k, '') for k in ('step', 'problem', 'why', 'question', 'notes', 'hypothesis', 'quality', 'category', 'extra')}
        c.update(id=ident(), version=version['number'], rule='EXPERT', author=a['id'], state='pending',
                 priority=body.get('priority', 'medium'), internal=bool(body.get('internal', True)),
                 stale=False, evidence=[b for b in version['blocks'] if b['id'] in version['fields'][c['step']]])
        if body.get('comment_id'):
            prior = next((x for x in r['comments'] if x['id']==body['comment_id'] and x.get('author')==a['id'] and not x.get('stale') and x.get('rule')=='EXPERT' and x['step']==body['step']), None)
            if not prior: raise Problem('Không tìm thấy bản nháp của bạn', 403)
            prior.update(c, id=prior['id'])
        else: r['comments'].append(c)
    elif op == 'review':
        require(a, ('expert', 'project'))
        c = next((c for c in r['comments'] if c['id'] == body.get('comment_id')), None)
        if not c or c.get('stale'): raise Problem('Nhận xét không còn hiệu lực trên phiên bản hiện tại')
        if c['step'] in step_set(r,'locked_steps'): raise Problem('Nhận xét đang khóa')
        if body.get('state') not in ('approved', 'rejected'): raise Problem('Trạng thái duyệt không hợp lệ')
        c.update(state=body['state'], reviewer=a['id'], reviewed_at=now(), internal=bool(body.get('internal', True)))
    elif op == 'lock':
        require(a, ('expert', 'project'))
        targets = {body['step']} if body.get('step') else set(STEPS)
        if not targets <= set(STEPS) or not version['confirmed']: raise Problem('Cần xác nhận dữ liệu và chọn bước hợp lệ')
        comments = [c for c in r['comments'] if c['step'] in targets and not c.get('stale')]
        if not comments or any(c['state']=='pending' for c in comments): raise Problem('Cần duyệt hoặc bác nhận xét của bước trước khi khóa')
        r['locked_steps'] = sorted(step_set(r,'locked_steps') | targets)
        if not r.get('released'): r['status'] = 'locked'
        r['locked_by'] = a['id']
    elif op == 'unlock':
        require(a, ('expert', 'project', 'system') if body.get('target')=='unit' else ('expert','project'))
        if not reason: raise Problem('Bắt buộc nhập lý do mở khóa')
        if body.get('target') == 'unit':
            require(a, ('project', 'system'))
            if r['status'] not in ('submitted', 'rechecked', 'complete'): raise Problem('Chưa có bản nộp để mở lại')
            r['status'], r['released'] = 'released', True
            r['submitted_steps'] = []
        else:
            if r['status'] in ('submitted','complete'): raise Problem('Cần quản trị mở lại bản nộp trước khi sửa nhận xét')
            targets = {body['step']} if body.get('step') else set(STEPS)
            if not targets <= set(STEPS): raise Problem('Bước không hợp lệ')
            r['locked_steps'] = sorted(step_set(r,'locked_steps') - targets)
            r['released_steps'] = sorted(step_set(r,'released_steps') - targets)
            r['released'] = bool(r['released_steps'])
            r['status'] = 'released' if r['released'] else 'review'
    elif op == 'release':
        require(a, ('project', 'system'))
        targets = {body['step']} if body.get('step') else step_set(r,'locked_steps')
        if not targets or not targets <= step_set(r,'locked_steps'): raise Problem('Chỉ mở các bước đã khóa nhận xét')
        if r['status'] in ('submitted','rechecked','complete'): raise Problem('Bản nộp đang khóa; dùng chức năng mở lại có lý do')
        if targets & set(r.get('submitted_steps',[])): raise Problem('Không mở lại bước đã nộp bằng thao tác công bố góp ý')
        r['released_steps'] = sorted(step_set(r,'released_steps') | targets)
        for c in r['comments']:
            if c['step'] in targets and c['state']=='approved' and not c.get('internal') and not c.get('stale'): c['published_at'] = now()
        r['released'], r['status'] = True, 'self_review' if r.get('submitted_steps') else 'released'
    elif op == 'compare-review':
        require(a, ('expert', 'project'))
        if body.get('step') not in STEPS or body.get('label') not in ('Rõ hơn','Không thay đổi','Còn yếu','Cần xác minh') or not reason: raise Problem('Chọn bước, kết quả và căn cứ đánh giá')
        r.setdefault('comparison', {})[body['step']] = {'label': body['label'], 'reason': reason, 'by': a['id'], 'at': now(), 'version': version['number']}
    elif op == 'respond':
        require(a, ('unit',))
        if not r['released'] or r['status'] not in ('released', 'self_review'): raise Problem('Chưa mở góp ý hoặc đã nộp và khóa')
        if body.get('agreement') not in ('agree', 'partial', 'disagree'): raise Problem('Chọn mức đồng ý')
        if body['agreement'] != 'agree' and not reason: raise Problem('Cần giải thích khi không hoàn toàn đồng ý')
        revisions = body.get('revisions', {})
        if not isinstance(revisions, dict) or not set(revisions) <= set(STEPS) or any(not isinstance(v, str) for v in revisions.values()): raise Problem('Nội dung hiệu chỉnh không hợp lệ')
        if not set(revisions) <= step_set(r,'released_steps'): raise Problem('Chỉ hiệu chỉnh các bước đã mở góp ý', 403)
        if set(revisions) & set(r.get('submitted_steps', [])): raise Problem('Bước đã nộp và khóa', 403)
        response_step = body.get('step')
        if response_step and (response_step not in step_set(r,'released_steps') or response_step in r.get('submitted_steps', [])): raise Problem('Bước chưa mở hoặc đã nộp và khóa', 403)
        if response_step and set(revisions) != {response_step}: raise Problem('Chỉ nộp nội dung của bước đang chọn')
        ratings = body.get('self_rating', {})
        if not isinstance(ratings, dict) or not set(ratings) <= {'gate', 'criteria'}: raise Problem('Bộ tự đánh giá không hợp lệ')
        for group, values in ratings.items():
            if not isinstance(values, dict) or not set(values) <= {str(i) for i in range(1, 6 if group == 'gate' else 11)} or any(v not in ('Đạt', 'Chưa đạt', 'Chưa rõ', '') for v in values.values()): raise Problem('Giá trị tự đánh giá không hợp lệ')
        response = {'id': ident(), 'at': now(), 'by': a['id'], 'agreement': body['agreement'], 'reason': reason,
                    'step': response_step, 'revisions': revisions, 'evidence': body.get('evidence', ''), 'support': body.get('support', ''), 'unclear': body.get('unclear', ''),
                    'self_rating': ratings, 'submitted': bool(body.get('submit'))}
        r['responses'].append(response)
        r['status'] = 'self_review'
        if body.get('submit'):
            v = copy.deepcopy(version); v.update(number=version['number'] + 1, at=now(), confirmed=False)
            v['revisions'].update(revisions); v['self_rating'] = ratings; r['versions'].append(v); r['status'] = 'submitted'
            if response_step:
                r['submitted_steps'] = sorted(set(r.get('submitted_steps', [])) | {response_step})
                r['status'] = 'submitted' if step_set(r,'released_steps') <= set(r['submitted_steps']) else 'self_review'
            for c in r['comments']:
                if not response_step or c['step'] == response_step: c['stale'] = True
                elif not c.get('stale'): c['version'] = v['number']
    elif op == 'recheck':
        require(a, ('expert', 'data', 'project'))
        if r['status'] != 'submitted': raise Problem('Chỉ kiểm tra lại bản đã nộp')
        r['comments'].extend(rules(r)); r['status'] = 'rechecked'
        r['locked_steps'] = []
    else: raise Problem('Chức năng không tồn tại', 404)
    put('initiative', r)
    # Audit tracks IDs/states, not private comments in broadly readable logs.
    audit(a, op, r, before={'version': old['versions'][-1]['number'], 'status': old['status']},
          after={'version': r['versions'][-1]['number'], 'status': r['status']}, reason=reason)
    return jsonify(initiative=visible_initiative(a, r))


def account_users():
    users, page = [], 1
    while True:
        batch = sb(f'/auth/v1/admin/users?page={page}&per_page=1000').get('users', [])
        users.extend(u for u in batch if 'vcoaching' in u.get('app_metadata', {}))
        if len(batch) < 1000: return users
        page += 1


def public_account(u):
    return {'id': u['id'], 'email': u.get('email'), 'name': u.get('user_metadata', {}).get('full_name', ''),
            'grant': u.get('app_metadata', {}).get('vcoaching', {}), 'banned_until': u.get('banned_until'),
            'deleted_at': u.get('deleted_at')}


def accounts(op, a, body):
    if op == 'accounts' and not a['super']:
        require(a, ('project',))
        return jsonify(accounts=[{'id': u['id'], 'email': u['email'], 'name': u.get('user_metadata', {}).get('full_name', '')}
            for u in account_users() if u['app_metadata']['vcoaching'].get('role') == 'expert' and
            set(u['app_metadata']['vcoaching'].get('projects', [])) & set(a['projects'])])
    if not a['super']: raise Problem('Chỉ Admin tổng được quản trị tài khoản', 403)
    if op == 'accounts': return jsonify(accounts=[public_account(u) for u in account_users()])
    if not body.get('confirmed') or not body.get('reason', '').strip(): raise Problem('Cần xác nhận thao tác và lý do')
    with LOCK:
        uid = body.get('user_id')
        user = sb('/auth/v1/admin/users/' + uid) if uid else None
        if user: user = user.get('user', user)
        before = public_account(user) if user else None
        old_grant = user.get('app_metadata', {}).get('vcoaching', {}) if user else {}
        action = body.get('action', 'save')
        grant = body.get('grant', old_grant)
        if action not in ('save', 'create', 'password', 'lock', 'unlock', 'delete'): raise Problem('Thao tác tài khoản không hợp lệ')
        if grant.get('role') not in ROLES: raise Problem('Vai trò không hợp lệ')
        for p in grant.get('projects', []): get(p, 'project')
        for unit in grant.get('units', []):
            if get(unit, 'unit')['project'] not in grant.get('projects', []): raise Problem('Đơn vị phải thuộc dự án đã cấp')
        if user and old_grant.get('super_admin'):
            removing = action in ('lock', 'delete') or not grant.get('super_admin') or not grant.get('active')
            others = [u for u in account_users() if u['id'] != uid and u['app_metadata']['vcoaching'].get('super_admin')
                      and u['app_metadata']['vcoaching'].get('active') and not u.get('deleted_at') and
                      (not u.get('banned_until') or u['banned_until'] < now())]
            if removing and not others: raise Problem('Không thể xóa, khóa hoặc hạ quyền Admin tổng cuối cùng')
        if action in ('create', 'password') and len(body.get('password', '')) < 14: raise Problem('Mật khẩu cần tối thiểu 14 ký tự')
        if action == 'create':
            created = sb('/auth/v1/admin/users', 'POST', {'email': body['email'], 'password': body['password'],
                'email_confirm': True, 'user_metadata': {'full_name': body['name']},
                'app_metadata': {'vcoaching': {**grant, 'active': False}}})
            uid = created.get('user', created)['id']
            try:
                sb('/rest/v1/vcontent_profiles', 'POST', {'id': 'VCOACH_' + uid, 'auth_user_id': uid,
                    'email': body['email'], 'full_name': body['name'], 'role': 'client', 'access_scope': 'self', 'active': True})
                sb('/auth/v1/admin/users/' + uid, 'PUT', {'app_metadata': {'vcoaching': grant}})
            except Exception:
                sb('/auth/v1/admin/users/' + uid, 'DELETE')
                sb('/rest/v1/vcontent_profiles?id=eq.VCOACH_' + uid, 'DELETE')
                raise
        elif action == 'password':
            sb('/auth/v1/admin/users/' + uid, 'PUT', {'password': body['password']})
        elif action in ('lock', 'unlock'):
            updated = {**old_grant, 'active': action == 'unlock'}
            sb('/auth/v1/admin/users/' + uid, 'PUT', {'ban_duration': 'none' if action == 'unlock' else '876000h',
                'app_metadata': {**user.get('app_metadata', {}), 'vcoaching': updated}})
        elif action == 'delete':
            sb('/auth/v1/admin/users/' + uid, 'PUT', {'app_metadata': {**user.get('app_metadata', {}),
                'vcoaching': {**old_grant, 'active': False}}})
            sb('/auth/v1/admin/users/' + uid, 'DELETE', {'should_soft_delete': True})
            sb('/rest/v1/vcontent_profiles?auth_user_id=eq.' + uid, 'PATCH', {'active': False})
        else:
            profiles_before = sb('/rest/v1/vcontent_profiles?select=id,email,full_name&auth_user_id=eq.' + uid)
            if not profiles_before: raise Problem('Tài khoản chưa có hồ sơ liên kết')
            patch = {'email': body.get('email', user['email']),
                     'user_metadata': {**user.get('user_metadata', {}), 'full_name': body.get('name', before['name'])},
                     'app_metadata': {**user.get('app_metadata', {}), 'vcoaching': grant}}
            # Disable grant during profile synchronization. Restore original Auth if profile update fails.
            sb('/auth/v1/admin/users/' + uid, 'PUT', {**patch, 'app_metadata': {**patch['app_metadata'], 'vcoaching': {**grant, 'active': False}}})
            try:
                sb('/rest/v1/vcontent_profiles?auth_user_id=eq.' + uid, 'PATCH', {'email': patch['email'], 'full_name': patch['user_metadata']['full_name']})
                sb('/auth/v1/admin/users/' + uid, 'PUT', {'app_metadata': patch['app_metadata']})
            except Exception:
                # Restore profile first; leave Auth access disabled if rollback fails.
                for profile in profiles_before:
                    sb('/rest/v1/vcontent_profiles?id=eq.' + profile['id'], 'PATCH',
                       {'email': profile['email'], 'full_name': profile['full_name']})
                sb('/auth/v1/admin/users/' + uid, 'PUT', {'email': user['email'], 'user_metadata': user.get('user_metadata', {}), 'app_metadata': user.get('app_metadata', {})})
                raise
        audit(a, 'account_' + action, before=before, after={'id': uid, 'grant': grant} if action != 'password' else {'id': uid}, reason=body['reason'])
        return jsonify(ok=True, id=uid)


if __name__ == '__main__':
    if not URL or not KEY: raise SystemExit('Thiếu cấu hình Supabase phía máy chủ')
    ensure_seed()
    if not CLOUD: threading.Thread(target=worker, daemon=True).start()
    app.run(host='127.0.0.1', port=int(os.environ.get('VCOACHING_PORT', '8766')), threaded=True, debug=False)
