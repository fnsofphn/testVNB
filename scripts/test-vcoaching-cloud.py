"""Cloud smoke test: uses only a unique disposable namespace; never logs credentials."""
import os,sys,json,hashlib,uuid,io
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
if os.environ.get('VCOACHING_CLOUD_TEST') != '1': raise SystemExit('Set VCOACHING_CLOUD_TEST=1 to run the isolated live cloud test')
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'vcoaching'))
os.environ['VCOACHING_CLOUD']='1'
os.environ['VCOACHING_NAMESPACE']='e2e-'+str(uuid.uuid4())
import server as s
from cloud import CloudDB
assert 'npazlysytrqhnwezugcs.supabase.co' in s.URL
client=s.app.test_client()
objects=[]
def call(op,body=None,token=None,status=200):
 h={'Authorization':'Bearer '+token} if token else {}
 r=client.get('/api/vcoaching?op='+op,headers=h) if body is None else client.post('/api/vcoaching?op='+op,json=body,headers=h)
 assert r.status_code==status,(op,r.status_code,r.get_json())
 return r.get_json()
try:
 s.ensure_seed()
 password=os.environ['VCOACHING_TEST_PASSWORD']
 auth=s.sb('/auth/v1/token?grant_type=password','POST',{'email':'chuyenvien@vinabrain.com','password':password})
 token=auth['access_token']
 assert call('me',token=token)['storage']=='supabase'
 call('workspace',status=401)
 call('tick',{'namespace':s.DB.namespace},status=403)
 source=Path(r'D:\04. Code\Vcoaching\CLSP_Mau_01_Master_CTHD_VNPT_Rising_2026_2028.docx').read_bytes()
 # A valid DOCX larger than Vercel's request-body limit exercises direct Storage upload.
 from zipfile import ZipFile,ZIP_STORED
 large=io.BytesIO(source)
 with ZipFile(large,'a') as z:z.writestr('vcoaching-e2e-padding.bin',os.urandom(5*1024*1024),compress_type=ZIP_STORED)
 source=large.getvalue()
 ticket=call('upload-init',{'unit':'vcoaching-test-unit','name':'CLSP.docx','size':len(source),'sha256':hashlib.sha256(source).hexdigest()},token)
 key=s.get(ticket['id'])['stored']; objects.append(key)
 with urlopen(Request(ticket['url'],data=source,method='PUT',headers={'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),timeout=50) as r: assert r.status==200
 call('upload-complete',{'id':ticket['id']},token)
 # Recover a job whose previous server invocation was interrupted.
 f=s.get(ticket['id']); f.update(status='reading',claim='expired-test-claim',claim_until=0); s.put('file',f)
 call('tick',{'namespace':s.DB.namespace},s.worker_secret(s.DB.namespace))
 assert s.get(ticket['id'])['status']=='parsed',s.get(ticket['id']).get('error')
 ws=call('workspace',token=token); assert len(ws['initiatives'])==3
 duplicate=call('upload-init',{'unit':'vcoaching-test-unit','name':'CLSP.docx','size':len(source),'sha256':hashlib.sha256(source).hexdigest()},token)
 assert duplicate['duplicate'] and duplicate['id']==ticket['id']
 call('tick',{'namespace':s.DB.namespace},s.worker_secret(s.DB.namespace))
 assert len(call('workspace',token=token)['initiatives'])==3
 signed=call('source&id='+ticket['id'],token=token)
 assert urlopen(signed['url']).read()==source
 export=call('export&ids='+ws['initiatives'][0]['id'],token=token)
 from zipfile import ZipFile
 blob=urlopen(export['url']).read(); assert 'word/document.xml' in ZipFile(io.BytesIO(blob)).namelist()
 # Cross-instance lease excludes conflicting writers; rollback discards mutations.
 other=CloudDB(s.URL,s.KEY,s.DB.namespace)
 s.DB.execute('BEGIN IMMEDIATE')
 try:
  try: other.execute('BEGIN IMMEDIATE'); raise AssertionError('lease allowed conflicting writer')
  except s.CloudError as e: assert e.status==409
 finally:s.DB.execute('ROLLBACK')
 assert len(call('workspace',token=token)['initiatives'])==3
 print('PASS cloud Auth, unsigned denial, 5 MB signed upload/download, duplicate guard, stale-job recovery, cron tick, 3 real initiatives, DOCX export, distributed lease')
finally:
 if s.DB.in_transaction:s.DB.execute('ROLLBACK')
 # Delete only objects and records under this run UUID, never shared namespaces.
 assert s.DB.namespace.startswith('e2e-') and len(s.DB.namespace)==40
 for prefix in [s.DB.namespace+'/sources',s.DB.namespace+'/exports']:
  def listing(folder):
   for item in s.DB.request('/storage/v1/object/list/'+s.DB.bucket,'POST',{'prefix':folder,'limit':1000}):
    key=folder+'/'+item['name']
    if item.get('id'):objects.append(key)
    else:listing(key)
  listing(prefix)
 if objects:s.DB.request('/storage/v1/object/'+s.DB.bucket,'DELETE',{'prefixes':list(set(objects))})
 s.DB.request('/rest/v1/vcoaching_records?namespace=eq.'+s.DB.namespace,'DELETE')
 s.DB.request('/rest/v1/vcoaching_leases?namespace=eq.'+s.DB.namespace,'DELETE')
 print('Cleaned isolated cloud test namespace')
