import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
assert.equal(process.env.SUPABASE_URL,'https://npazlysytrqhnwezugcs.supabase.co','Only the authorized test project is allowed');
const root='http://127.0.0.1:8766/vc-api/';
const clients={};
const tokens={};
const report=[];
async function call(role,op,body,expected=200,extra={}) {
 const res=await fetch(root+op,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+tokens[role], 'Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await res.text(); let data;try{data=JSON.parse(text)}catch{data={}};
 assert.equal(res.status,expected,op+': '+(data.error||''));return data;
}
try {
 for(const [role,email] of Object.entries({unit:'donvi@vinabrain.com',data:'chuyenvien@vinabrain.com',project:'quantriduan@vinabrain.com',expert:'giangvien@vinabrain.com'})) {
  const c=createClient(process.env.SUPABASE_URL,process.env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const result=await c.auth.signInWithPassword({email,password:process.env.VCOACHING_TEST_PASSWORD});assert(!result.error,'Real login failed for '+role);clients[role]=c;tokens[role]=result.data.session.access_token;
  const me=await call(role,'me');assert.equal(me.actor.role,role); report.push({check:'real_login',role,passed:true});
 }
 await call('unit','account',{confirmed:true,reason:'Scope regression'},403);
 await call('unit','me',undefined,403,{'X-VCoaching-Role':'project','X-VCoaching-Project':'vcoaching-test','X-VCoaching-Unit':'vcoaching-test-unit'});
 const path='D:/04. Code/Vcoaching/CLSP_Mau_01_Master_CTHD_VNPT_Rising_2026_2028.docx';
 const batch=await call('unit','upload',{unit:'vcoaching-test-unit',files:[{name:path.split('/').at(-1),base64:readFileSync(path).toString('base64')}]});
 let work;
 for(let i=0;i<60;i++) {work=await call('unit','workspace');if(work.files.some(f=>f.id===batch.batch.files[0].id&&f.status==='parsed'))break;await new Promise(r=>setTimeout(r,1000));}
 const firstCount=work.initiatives.length;
 const master=work.initiatives.filter(r=>r.files.includes(batch.batch.files[0].id)); assert.equal(master.length,3);
 const duplicated=await call('unit','upload',{unit:'vcoaching-test-unit',files:[{name:path.split('/').at(-1),base64:readFileSync(path).toString('base64')}]});assert.equal(duplicated.batch.files[0].duplicate,true);
 const chosen=master[0];
 await call('project','assign',{id:chosen.id,experts:[]});
 await call('expert','detail?id='+chosen.id,undefined,403);
 const experts=await call('project','accounts');const expert=experts.accounts.find(u=>u.email==='giangvien@vinabrain.com');assert(expert);
 await call('project','assign',{id:chosen.id,experts:[expert.id]});
 await call('expert','detail?id='+chosen.id);
 await call('expert','source?id='+batch.batch.files[0].id,undefined,403);
 const beforeCount=(await call('unit','workspace')).initiatives.length; assert.equal(beforeCount,firstCount);
 report.push({check:'real_file_import_and_duplicate',count:master.length,passed:true},{check:'live_scope_and_assignment',passed:true});
 writeFileSync('.cache/vcoaching/live-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {await Promise.all(Object.values(clients).map(c=>c.auth.signOut({scope:'local'})));}
