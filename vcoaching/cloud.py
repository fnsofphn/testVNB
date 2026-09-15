"""Supabase persistence for stateless Vercel instances.

Writes use a database lease and a single atomic commit RPC. A stale holder can
never commit after another invocation acquires the lease. No client gets table
access: the API checks the fresh Auth grant before reading or mutating records.
"""
import json
import threading
import uuid
from urllib.request import Request, urlopen
from urllib.parse import urlencode, quote
from urllib.error import HTTPError, URLError


class CloudError(Exception):
    def __init__(self, message, status=503): self.message, self.status = message, status


class Result(list):
    def fetchone(self): return self[0] if self else None


class CloudDB:
    def __init__(self, url, key, namespace):
        self.url, self.key, self.namespace = url.rstrip('/'), key, namespace
        self.local = threading.local()
    @property
    def in_transaction(self): return bool(getattr(self.local, 'holder', None))
    def request(self, path, method='GET', data=None, raw=False, headers=None):
        h = {'apikey': self.key, 'Authorization': 'Bearer ' + self.key, 'Content-Type': 'application/json'}
        h.update(headers or {})
        payload = data if isinstance(data, bytes) else json.dumps(data).encode() if data is not None else None
        try:
            with urlopen(Request(self.url + path, data=payload, method=method, headers=h), timeout=55) as response:
                content = response.read(65 * 1024 * 1024 + 1)
                if len(content) > 65 * 1024 * 1024: raise CloudError('Tệp vượt giới hạn lưu trữ', 413)
                return content if raw else json.loads(content) if content else None
        except HTTPError as error:
            raise CloudError('Supabase cloud: yêu cầu chưa thành công (' + str(error.code) + ')', 409 if error.code == 409 else 503) from None
        except (URLError, TimeoutError):
            raise CloudError('Không kết nối được kho dữ liệu; vui lòng thử lại') from None
    def rpc(self, name, data): return self.request('/rest/v1/rpc/' + name, 'POST', data)
    def execute(self, sql, params=()):
        if sql == 'BEGIN IMMEDIATE':
            if self.in_transaction: raise CloudError('Giao dịch đang hoạt động', 409)
            holder = str(uuid.uuid4())
            if not self.rpc('vcoaching_acquire', {'p_namespace': self.namespace, 'p_holder': holder}):
                raise CloudError('Có thao tác đang lưu; vui lòng thử lại sau vài giây', 409)
            self.local.holder, self.local.changes = holder, {}
            return Result()
        if sql in ('COMMIT', 'ROLLBACK'):
            if not self.in_transaction: return Result()
            holder = self.local.holder
            try:
                payload = {'p_namespace': self.namespace, 'p_holder': holder}
                if sql == 'COMMIT':
                    payload['p_changes'] = list(self.local.changes.values())
                    self.rpc('vcoaching_commit', payload)
                else: self.rpc('vcoaching_release', payload)
            finally:
                self.local.holder, self.local.changes = None, {}
            return Result()
        if sql.startswith('SELECT'):
            query = {'namespace': 'eq.' + self.namespace, 'select': 'id,kind,data', 'order': 'id.asc'}
            if 'WHERE kind=' in sql: query['kind'] = 'eq.' + str(params[0])
            else: query['id'] = 'eq.' + str(params[0])
            records, offset = {}, 0
            while True:
                batch = self.request('/rest/v1/vcoaching_records?' + urlencode({**query,'limit':1000,'offset':offset}))
                records.update({r['id']:r for r in batch})
                if len(batch)<1000:break
                offset += 1000
            if self.in_transaction:
                records.update({k:v for k,v in self.local.changes.items() if ('kind' in query and v['kind']==params[0]) or ('id' in query and k==params[0])})
            if sql.startswith('SELECT kind,'):
                return Result([(r['kind'],json.dumps(r['data'],ensure_ascii=False)) for r in records.values()])
            return Result([(json.dumps(r['data'],ensure_ascii=False),) for r in records.values()])
        if sql.startswith('INSERT INTO records'):
            auto = not self.in_transaction
            if auto:self.execute('BEGIN IMMEDIATE')
            rid,kind,raw = params
            self.local.changes[rid] = {'id':rid,'kind':kind,'data':json.loads(raw)}
            if auto:self.execute('COMMIT')
            return Result()
        raise CloudError('Unsupported persistence operation')
    def close(self):
        if self.in_transaction:self.execute('ROLLBACK')
    @property
    def bucket(self):return 'vcoaching-private'
    def object_path(self, key):return '/storage/v1/object/' + self.bucket + '/' + quote(key,safe='/')
    def upload(self, key, content, content_type='application/octet-stream'):
        return self.request(self.object_path(key),'POST',content,headers={'Content-Type':content_type,'x-upsert':'false'})
    def download(self,key):return self.request(self.object_path(key),raw=True)
    def sign_upload(self,key):
        response=self.request('/storage/v1/object/upload/sign/'+self.bucket+'/'+quote(key,safe='/'),'POST',{})
        return self.url+'/storage/v1'+response['url']
    def sign_download(self,key,filename=None):
        response=self.request('/storage/v1/object/sign/'+self.bucket+'/'+quote(key,safe='/'),'POST',{'expiresIn':60})
        return self.url+'/storage/v1'+response['signedURL']+('&download='+quote(filename,safe='') if filename else '')
