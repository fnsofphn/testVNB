"""Real-corpus regressions plus server workflow/permission tests in an isolated DB."""
import os, sys, tempfile, unittest, copy, json
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'vcoaching'))
TEMP = tempfile.TemporaryDirectory(prefix='vcoaching-test-')
os.environ['VCOACHING_DATA_DIR'] = TEMP.name
import server as s
from documents import parse, STEPS, norm, business_code, export_docx
CORPUS = Path(r'D:\03. Data\2026\V-Coaching\Tài liệu\2. WS1A_CHI TIẾT THEO PHIÊN')
MASTER = Path(r'D:\04. Code\Vcoaching\CLSP_Mau_01_Master_CTHD_VNPT_Rising_2026_2028.docx')

def who(role='data', super_admin=False, unit='vcoaching-test-unit'):
 return {'id':role,'email':role+'@test.invalid','role':role,'super':super_admin,'switched':False,'projects':['vcoaching-test'],'units':[unit],'initiatives':[],'assignment_actor':role}

class Workflow(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  s.ensure_seed(); cls.parsed=parse(MASTER); cls.client=s.app.test_client()
 def setUp(self):
  s.DB.execute("DELETE FROM records WHERE kind NOT IN ('project','unit')")
  f={'id':'source','type':'file','project':'vcoaching-test','unit':'vcoaching-test-unit','name':MASTER.name,'sha256':self.parsed['sha256'],'status':'parsed'}
  s.put('file',f); self.iid=s.add_candidate(copy.deepcopy(self.parsed['candidates'][0]),f)
 def request(self,op,role='data',status=200,**body):
  with patch.object(s,'actor',return_value=who(role)):
   r=self.client.post('/vc-api/'+op,json={'id':self.iid,**body})
  self.assertEqual(r.status_code,status,r.get_json()); return r.get_json()
 def test_workflow_and_private_review(self):
  self.request('edit',reason='Đã đối chiếu nguồn CLSP',resolve_issues=True)
  self.request('confirm',reason='Đã đối chiếu đủ')
  self.request('assign',role='unit',status=403,experts=['unit'])
  item=s.get(self.iid); item['experts']=['expert']; s.put('initiative',item)
  self.request('comment',role='expert',step='7A',problem='Cần xác nhận',why='Căn cứ nguồn chưa rõ',question='Ai làm khác?',notes='PRIVATE',internal=True)
  with patch.object(s,'actor',return_value=who('unit')):
   visible=self.client.get('/vc-api/detail?id='+self.iid).get_json()['initiative']
  self.assertEqual(visible['comments'],[])
  for c in s.get(self.iid)['comments']:
   if c.get('stale'):continue
   self.request('review',role='expert',comment_id=c['id'],state='approved',internal=False)
  self.request('lock',role='expert'); self.request('release',role='project')
  self.request('comment',role='expert',status=400,step='7A',problem='x',why='x',question='x')
  self.request('respond',role='unit',status=400,agreement='partial',reason='')
  self.request('respond',role='unit',agreement='agree',revisions={'7A':'Đơn vị tự hiệu chỉnh'},self_rating={'gate':{'1':'Đạt'}},submit=True)
  self.request('respond',role='unit',status=400,agreement='agree',submit=True)
  self.request('recheck',role='data')
  self.request('unlock',role='project',target='unit',reason='Cho đơn vị bổ sung nguồn')
  self.assertEqual(s.get(self.iid)['status'],'released')
 def test_scope_and_forged_mapping(self):
  item=s.get(self.iid)
  self.assertFalse(s.can(who('unit',unit='other'),item))
  self.assertFalse(s.can(who('expert'),item))
  self.assertTrue(s.can(who('project'),item))
  fields={k:[] for k in STEPS}; fields['1']=['foreign-block']
  self.request('edit',status=400,fields=fields,reason='bad')
  self.request('account',role='system',status=403)
 def test_fresh_grant_and_switch_rejects_forgery(self):
  user={'id':'admin','email':'admin@test.invalid','app_metadata':{'vcoaching':{'active':True,'role':'system','super_admin':True,'projects':[],'units':[]}}}
  def auth(path,**kwargs):
   return [{'id':'p','active':True}] if path.startswith('/rest/') else copy.deepcopy(user)
  with s.app.test_request_context(headers={'Authorization':'Bearer test','X-VCoaching-Role':'unit','X-VCoaching-Project':'vcoaching-test','X-VCoaching-Unit':'vcoaching-test-unit'}),patch.object(s,'sb',side_effect=auth):
   a=s.actor(); self.assertFalse(a['super']); self.assertTrue(a['switched']); self.assertEqual(a['units'],['vcoaching-test-unit'])
   user['app_metadata']['vcoaching']['super_admin']=False
   with self.assertRaises(s.Problem):s.actor()
   user['app_metadata']['vcoaching']['active']=False
   with self.assertRaises(s.Problem):s.actor()
 def test_export_preserves_package_and_source(self):
  r=s.get(self.iid); out=Path(TEMP.name)/'WS1b.docx'; export_docx(r,s.TEMPLATE,out)
  from docx import Document
  d=Document(out); self.assertEqual(len(d.tables),4); self.assertEqual(len(d.tables[1].rows),11)
  text='\n'.join(p.text for p in d.paragraphs)+'\n'+'\n'.join(c.text for t in d.tables for row in t.rows for c in row.cells)
  self.assertNotIn('TP.HCM',text); self.assertIn('PHIẾU NHÁP',text)
  self.assertIn('7A. HÀNH VI MỚI',text); self.assertIn('7B. CƠ CHẾ MỚI',text)
  self.assertNotIn('[x]', '\n'.join(c.text for t in d.tables[2:] for row in t.rows for c in row.cells))
  for block in r['versions'][-1]['blocks']:
   if block['text'].strip():self.assertIn(block['text'],text)
  with ZipFile(s.TEMPLATE) as a,ZipFile(out) as b:
   self.assertEqual(set(a.namelist()),set(b.namelist()))
   for name in a.namelist():
    if name!='word/document.xml':self.assertEqual(a.read(name),b.read(name),name)
 def test_last_admin_protected(self):
  admin={'id':'admin','email':'admin@test.invalid','app_metadata':{'vcoaching':{'role':'system','active':True,'super_admin':True,'projects':['vcoaching-test'],'units':['vcoaching-test-unit']}}}
  with s.app.test_request_context(),patch.object(s,'sb',return_value=admin),patch.object(s,'account_users',return_value=[admin]):
   with self.assertRaisesRegex(s.Problem,'Admin tổng cuối cùng'):
    s.accounts('account',who('system',True),{'user_id':'admin','action':'lock','confirmed':True,'reason':'test'})

class Corpus(unittest.TestCase):
 def setUp(self): s.ensure_seed()
 def test_real_forms(self):
  master=parse(MASTER); self.assertEqual([c['code'] for c in master['candidates']],['SK2.1','SK2.2','SK2.3'])
  cases=[('Mau_02_Sang_kien_PCTT_V2.pdf',3,3),('PL_Du thao CTHD 2026-2028 VNPT Rising_Ban PTTT.pdf',10,5)]
  for filename,forms,unique in cases:
   p=next(CORPUS.rglob(filename)); result=parse(p); self.assertEqual(len(result['candidates']),forms)
   s.DB.execute("DELETE FROM records WHERE kind='initiative'")
   f={'id':filename,'project':'vcoaching-test','unit':'vcoaching-test-unit','name':filename,'sha256':result['sha256']}
   for c in result['candidates']:s.add_candidate(c,f)
   self.assertEqual(len(s.rows('initiative')),unique,filename)
  for p in CORPUS.rglob('*.docx'):
   if 'SK05' in p.name:
    result=parse(p)
    if any(business_code(c['code'])=='SK01' for c in result['candidates']):
     self.assertTrue(any('filename_code_conflict' in c['issues'] for c in result['candidates']))
  scan=next(CORPUS.rglob('CNNV CL.PDF'),None)
  if scan:self.assertEqual(parse(scan)['status'],'needs_ocr')

if __name__=='__main__':
 try: unittest.main(verbosity=2)
 finally: s.DB.close()
