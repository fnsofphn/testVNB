import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
assert.equal(process.env.SUPABASE_URL,'https://npazlysytrqhnwezugcs.supabase.co');
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const login=createClient(process.env.SUPABASE_URL,process.env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const temp=createClient(process.env.SUPABASE_URL,process.env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let adminToken, tempToken, uid;
const report=[];
const grant={role:'unit',active:true,super_admin:false,projects:['vcoaching-test'],units:['vcoaching-test-unit'],initiatives:[],test_fixture:true};
async function api(op,body,expected=200,token=adminToken,extra={}) {
 const r=await fetch('http://127.0.0.1:8766/vc-api/'+op,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();assert.equal(r.status,expected,op+': '+(data.error||''));return data;
}
try {
 const link=await admin.auth.admin.generateLink({type:'magiclink',email:'admin@vinabrain.com'});assert(!link.error,'Cannot obtain admin test session');
 assert.equal(link.data.user.id,'8a9c726a-31f6-4806-bed4-4cfb09dec99e');
 const auth=await login.auth.verifyOtp({type:'email',token_hash:link.data.properties.hashed_token});assert(!auth.error,'Admin test session failed');adminToken=auth.data.session.access_token;
 const me=await api('me');assert(me.actor.super);
 for(const role of ['unit','data','expert','project','system']) {
  const headers={'X-VCoaching-Role':role,'X-VCoaching-Project':'vcoaching-test','X-VCoaching-Unit':'vcoaching-test-unit','X-VCoaching-Assignee':'2699b7b7-5fba-4555-891b-05fc6d475e7c'};
  const switched=await api('me',undefined,200,adminToken,headers);assert(!switched.actor.super);assert.equal(switched.actor.role,role);
  await api('account',{confirmed:true,reason:'switch scope regression'},403,adminToken,headers);
  await api('switch-audit',{},200,adminToken,headers);
 }
 const email='vcoaching.e2e.'+Date.now()+'@vinabrain.com'; const password=randomBytes(24).toString('base64url');
 const created=await api('account',{action:'create',email,name:'Tài khoản kiểm thử vòng đời — tạm thời',password,grant,confirmed:true,reason:'Kiểm thử vòng đời Auth, xóa sau kiểm tra'});uid=created.id;
 const session=await temp.auth.signInWithPassword({email,password});assert(!session.error,'Temporary real login failed');tempToken=session.data.session.access_token;
 await api('me',undefined,200,tempToken);
 await api('account',{action:'save',user_id:uid,email,name:'Tài khoản E2E đã cập nhật',grant:{...grant,role:'system'},confirmed:true,reason:'Kiểm tra quyền mới với JWT cũ'});
 assert.equal((await api('me',undefined,200,tempToken)).actor.role,'system');
 await api('account',{action:'lock',user_id:uid,confirmed:true,reason:'Kiểm tra thu hồi phiên'});
 await api('me',undefined,403,tempToken);
 await api('account',{action:'unlock',user_id:uid,confirmed:true,reason:'Kiểm tra mở khóa'});
 const renewed=await temp.auth.signInWithPassword({email,password});assert(!renewed.error,'Unlock did not allow login');tempToken=renewed.data.session.access_token;
 await api('me',undefined,200,tempToken);
 const ws=await api('workspace');mkdirSync('.cache/vcoaching/exports',{recursive:true});
 for(const r of ws.initiatives.filter(r=>['SK2.1','SK2.2','SK2.3'].includes(r.code))) {
  const response=await fetch('http://127.0.0.1:8766/vc-api/export?ids='+r.id,{headers:{Authorization:'Bearer '+adminToken}});assert.equal(response.status,200);
  writeFileSync('.cache/vcoaching/exports/'+r.code+'-WS1b.docx',Buffer.from(await response.arrayBuffer()));
 }
 report.push({check:'admin_auth_session_without_password_reset',passed:true},{check:'five_scoped_role_switches',passed:true},{check:'real_account_create_update_lock_unlock_and_stale_session',passed:true},{check:'real_export_three_ws1b',passed:true});
} finally {
 if(uid) {await api('account',{action:'delete',user_id:uid,confirmed:true,reason:'Kết thúc E2E: xóa tài khoản tạm đã tạo trong phép thử'}); report.push({check:'temporary_account_deleted',passed:true});}
 await Promise.all([login.auth.signOut({scope:'local'}),temp.auth.signOut({scope:'local'})]);
 writeFileSync('.cache/vcoaching/admin-live-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
