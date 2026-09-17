import {useEffect, useRef, useState} from 'react';
import schema from '../../../vcoaching/self_reflection_schema.json';

type Step = {answers:Record<string,string>; decision:string; revisions:Record<string,string>; note:string; owner:string; due:string; evidence:string; feedback:string; feedback_reason:string; complete:boolean};
type Commitment = {action:string;owner:string;due:string};
export type Reflection = {base_version:number;revision:number;status:string;steps:Record<string,Step>;commitment:Commitment;updated_at?:string;review_reason?:string;submission_id?:string;schema?:typeof schema};
type Version = {number:number;revisions:Record<string,string>;fields:Record<string,string[]>;blocks:{id:string;text:string;file_name?:string}[]};
type RecordData = {id:string;name:string;tracking_code?:string;unit_name:string;status:string;versions:Version[];self_reflection?:Reflection;self_submissions?:Reflection[];self_reviews?:{submission_id:string;decision:string;reason:string;at:string}[];comments:{id:string;step:string;internal:boolean;published_at?:string;question:string;problem:string}[]};
type Props = {record:RecordData;canEdit:boolean;canReview:boolean;busy:boolean;command:(op:string,body:Record<string,unknown>)=>Promise<boolean>;back:()=>void;attach:(files:File[])=>Promise<void>};
const decisions:Record<string,string>={keep:'Giữ nguyên nội dung hiện tại',clarify:'Cơ bản đúng, cần làm rõ thêm',revise:'Cần điều chỉnh nội dung',verify:'Chưa đủ căn cứ để kết luận',support:'Cần hỗ trợ hoặc quyết định vượt thẩm quyền'};
const fields=(step:string)=>step==='7'?['7A','7B','7C']:[step];
const fieldNames:Record<string,string>={'7A':'Hành vi mới','7B':'Cơ chế mới','7C':'Kết quả mới'};
const content=(v:Version,id:string)=>v.revisions[id]??(v.fields[id]||[]).map(k=>v.blocks.find(b=>b.id===k)?.text||'').join('\n\n');
const needs=(s?:Step)=>!!s?.complete&&(s.decision!=='keep'||Object.values(s.answers).some(a=>a!=='clear'));
const emptyStep=(v:Version,id:string):Step=>({answers:{},decision:'',revisions:Object.fromEntries(fields(id).map(k=>[k,content(v,k)])),note:'',owner:'',due:'',evidence:'',feedback:'',feedback_reason:'',complete:false});

export default function SelfReflection({record:r,canEdit,canReview,busy,command,back,attach}:Props){
 const [page,setPage]=useState('0');
 const [draft,setDraft]=useState<Step|null>(null);
 const [dirty,setDirty]=useState(false);
 const [commitment,setCommitment]=useState<Commitment>({action:'',owner:'',due:'',...r.self_reflection?.commitment});
 const [commitDirty,setCommitDirty]=useState(false);
 const [reviewReason,setReviewReason]=useState('');
 const [history,setHistory]=useState('');
 const sending=useRef(false);
 const root=useRef<HTMLDivElement>(null);
 const editContext=useRef<{id:string;base_version:number;revision:number}|null>(null);
 const commitmentContext=useRef<{id:string;base_version:number;revision:number}|null>(null);
 const current=r.self_reflection;
 const selected=history?r.self_submissions?.find(s=>s.submission_id===history):current;
 const v=r.versions.find(x=>x.number===selected?.base_version)||r.versions.at(-1)!;
 const stale=!!current&&current.base_version!==r.versions.at(-1)!.number;
 const editable=canEdit&&!history&&!stale&&!['submitted','complete'].includes(r.status)&&(!current||['draft','returned'].includes(current.status));
 const activeSchema=selected?.schema||schema;
 const data=activeSchema.find(s=>s.id===page);
 const saved=selected?.steps[page];
 const value=draft||saved||(data?emptyStep(v,page):null);
 const completed=Object.values(selected?.steps||{}).filter(s=>s.complete).length;
 const context={id:r.id,base_version:r.versions.at(-1)!.number,revision:current?.revision||0};
 useEffect(()=>{setDraft(null);setDirty(false);},[page,history]);
 useEffect(()=>{if(!commitDirty)setCommitment({action:'',owner:'',due:'',...current?.commitment});},[current?.revision,commitDirty]);
 useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(dirty||commitDirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty,commitDirty]);
 useEffect(()=>{const guard=(e:MouseEvent)=>{const target=e.target as Element;if((dirty||commitDirty)&&!root.current?.contains(target)&&target.closest('button,a,select')&&!window.confirm('Có nội dung chưa lưu. Rời form và bỏ thay đổi này?')){e.preventDefault();e.stopPropagation();}};document.addEventListener('click',guard,true);return()=>document.removeEventListener('click',guard,true);},[dirty,commitDirty]);
 const update=(change:Partial<Step>)=>{if(!dirty)editContext.current=context;setDraft({...value!,...change,complete:false});setDirty(true);};
 const save=async(complete=false)=>{if(!value||!editable||sending.current)return false;sending.current=true;try{const ok=await command('reflection',{...(dirty?editContext.current:context),action:'save',step:page,data:value,complete});if(ok){setDirty(false);setDraft(null);}return ok;}finally{sending.current=false;}};
 const navigate=async(next:string)=>{if(dirty&&!await save())return;if(commitDirty){if(!await command('reflection',{...(commitmentContext.current||context),action:'commitment',data:commitment}))return;setCommitDirty(false);}setPage(next);};
 const leave=async()=>{if(dirty&&!await save())return;if(commitDirty){if(!await command('reflection',{...(commitmentContext.current||context),action:'commitment',data:commitment}))return;setCommitDirty(false);}back();};
 const totalAttention=Object.values(selected?.steps||{}).filter(needs).length;
 return <div className="vc-reflection" ref={root}>
  <div className="vc-row spread"><h2>Tự soi & hiệu chỉnh 8 bước</h2><button disabled={busy} onClick={()=>void leave()}>Về hồ sơ sáng kiến</button></div>
  <p><strong>{r.tracking_code} · {r.name}</strong><br/>{r.unit_name}</p>
  <p>{completed}/8 bước đã tự soi · {totalAttention} bước cần làm rõ hoặc kiểm chứng</p>
  <p className="vc-sub">Đọc nội dung đã có → tự kiểm tra → chọn kết luận → hiệu chỉnh khi cần. Hoàn thành tự soi vẫn có thể còn việc cần kiểm chứng.</p>
  {current?.status==='submitted'&&<div className="vc-info">Đã gửi toàn bộ bản tự soi, đang chờ chuyên gia duyệt.</div>}
  {current?.review_reason&&<div className="vc-info">{current.status==='returned'?'Được trả lại':'Đã duyệt'}: {current.review_reason}</div>}
  {canEdit&&current?.status!=='submitted'&&(stale||current?.status==='accepted')&&<div className="vc-info">{stale?'Hồ sơ đã có phiên bản mới.':'Đợt tự soi đã kết thúc.'} <button disabled={busy||r.status==='complete'} onClick={()=>{if(window.confirm('Bắt đầu đợt tự soi mới? Bản cũ được giữ trong lịch sử.'))void command('reflection',{...context,action:'restart'});}}>Bắt đầu đợt tự soi mới</button></div>}
  {!!r.self_submissions?.length&&<label>Bản tự soi<select value={history} disabled={busy||dirty||commitDirty} onChange={e=>setHistory(e.target.value)}><option value="">Đợt hiện tại</option>{r.self_submissions.map((s,i)=><option key={s.submission_id} value={s.submission_id}>Bản gửi {i+1} · từ phiên bản {s.base_version}</option>)}</select></label>}
  <nav className="vc-steps" aria-label="Tự soi 8 bước"><button disabled={busy} className={page==='0'?'active':''} onClick={()=>void navigate('0')}>00<small>Tổng quan</small></button>{activeSchema.map(s=><button key={s.id} disabled={busy} aria-current={page===s.id?'step':undefined} className={(page===s.id?'active ':'')+(needs(selected?.steps[s.id])?'needs-review':'')} onClick={()=>void navigate(s.id)}>{s.id.padStart(2,'0')}<small>{s.name}</small></button>)}<button disabled={busy} className={page==='result'?'active':''} onClick={()=>void navigate('result')}>Kết quả<small>Xem & gửi bản tự soi</small></button></nav>
  {page==='0'&&<section className="vc-card"><h2>Hoàn thiện sáng kiến từ nội dung đã tổng hợp</h2><p>Mỗi bước có câu hỏi tự kiểm tra và kết luận của đơn vị. Bản nháp được lưu khi bạn bấm Lưu nháp hoặc chuyển bước trong form.</p><p>Chọn Giữ nguyên nếu nội dung phù hợp. Khi cần sửa, nhập nội dung hoàn chỉnh sau hiệu chỉnh. Khi cần kiểm chứng/hỗ trợ, ghi việc cần làm, người phụ trách và thời hạn.</p><p>Bản gửi được lưu để so sánh trước–sau. Nội dung hiện tại chỉ cập nhật khi chuyên gia duyệt.</p><button className="primary" onClick={()=>void navigate('1')}>Bắt đầu / tiếp tục bước 01</button></section>}
  {data&&value&&<>
   <h2>{data.id}. {data.name}</h2><div className="vc-info">{data.question}</div>
   <div className="vc-columns"><section className="vc-card"><h3>Nội dung hiện tại · phiên bản {v.number}</h3>{fields(page).map(id=><div key={id}>{page==='7'&&<h3>{fieldNames[id]}</h3>}<p className="vc-answer">{content(v,id)||'Chưa có thông tin từ nguồn.'}</p></div>)}<details><summary>Xem nguồn</summary>{v.blocks.filter(b=>fields(page).some(id=>v.fields[id]?.includes(b.id))).map(b=><div className="vc-source" key={b.id}><strong>{b.file_name}</strong><p>{b.text}</p></div>)}</details></section><section className="vc-card"><h3>Góp ý PeopleOne đã công bố</h3>{r.comments.filter(c=>fields(page).includes(c.step)&&!c.internal&&c.published_at).map(c=><div key={c.id}><b>{c.problem}</b><p>{c.question}</p></div>)}{!r.comments.some(c=>fields(page).includes(c.step)&&!c.internal&&c.published_at)&&<p>Chưa có góp ý được công bố cho bước này. Đơn vị có thể tự soi theo các câu hỏi bên dưới.</p>}</section></div>
   <fieldset disabled={!editable||busy}><section className="vc-card"><h3>Đơn vị tự kiểm tra</h3><p>{Object.keys(value.answers).length}/{data.checks.length} tiêu chí đã trả lời</p>{data.checks.map((question,i)=><label className="vc-reflection-criterion" key={i}><span>{i+1}. {question}</span><select value={value.answers[i]||''} onChange={e=>{const answers={...value.answers};if(e.target.value)answers[i]=e.target.value;else delete answers[i];update({answers});}}><option value="">Chưa trả lời</option><option value="clear">Đã rõ</option><option value="partial">Cần rõ hơn</option><option value="missing">Chưa có căn cứ</option></select></label>)}</section>
   <section className="vc-card"><h3>Kết luận của đơn vị</h3><label>Chọn kết luận<select value={value.decision} onChange={e=>update({decision:e.target.value})}><option value="">Chưa kết luận</option>{Object.entries(decisions).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label>
    {value.decision&&value.decision!=='keep'&&<><label>{['verify','support'].includes(value.decision)?'Việc cần xác minh hoặc hỗ trợ':'Lý do và nội dung cần thay đổi'}<textarea value={value.note} onChange={e=>update({note:e.target.value})}/></label>{['clarify','revise'].includes(value.decision)&&fields(page).map(id=><label key={id}>Nội dung sau hiệu chỉnh {fieldNames[id]||''}<textarea value={value.revisions[id]||''} onChange={e=>update({revisions:{...value.revisions,[id]:e.target.value}})}/></label>)}<div className="vc-columns"><label>Người phụ trách<input value={value.owner} onChange={e=>update({owner:e.target.value})}/></label><label>Thời hạn<input type="date" value={value.due} onChange={e=>update({due:e.target.value})}/></label></div><label>Bằng chứng / nguồn dự kiến<textarea value={value.evidence} onChange={e=>update({evidence:e.target.value})}/></label></>}
    <details><summary>Phản hồi góp ý PeopleOne</summary><label>Mức đồng ý<select value={value.feedback} onChange={e=>update({feedback:e.target.value})}><option value="">Chưa phản hồi</option><option value="agree">Đồng ý</option><option value="partial">Đồng ý một phần</option><option value="disagree">Không đồng ý</option><option value="discuss">Cần trao đổi thêm</option></select></label>{value.feedback&&value.feedback!=='agree'&&<label>Lý do phản hồi<textarea value={value.feedback_reason} onChange={e=>update({feedback_reason:e.target.value})}/></label>}</details>
    {['released','self_review'].includes(r.status)&&<label>Đính kèm bằng chứng<input type="file" multiple accept=".pdf,.docx" onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';if(files.length)void attach(files);}}/></label>}
   </section></fieldset>
   <div className="vc-row spread"><span>{dirty?'Có thay đổi chưa lưu':saved?.complete?'Đã hoàn thành bước này':current?.updated_at?'Đã lưu: '+new Date(current.updated_at).toLocaleString('vi-VN'):'Chưa lưu bản tự soi'}</span><div className="vc-row"><button disabled={!editable||busy} onClick={()=>void save()}>Lưu nháp</button><button disabled={!editable||busy} className="primary" onClick={async()=>{if(await save(true))setPage(page==='8'?'result':String(Number(page)+1));}}>Hoàn thành & tiếp tục</button></div></div>
  </>}
  {page==='result'&&<>
   <section className="vc-card"><h2>Kết quả tự soi · {completed}/8 bước</h2>{activeSchema.map(s=>{const d=selected?.steps[s.id];return <details key={s.id}><summary>{s.id}. {s.name} · {d?.complete?decisions[d.decision]:'Chưa hoàn thành'}</summary><p>{d?.note}</p><p>{d?.owner} {d?.due} {d?.evidence}</p>{fields(s.id).map(id=><div className="vc-columns" key={id}><div><b>Hiện tại {fieldNames[id]||''}</b><p className="vc-answer">{content(v,id)||'Chưa có thông tin'}</p></div><div><b>Sau hiệu chỉnh đề nghị</b><p className="vc-answer">{d&&['clarify','revise'].includes(d.decision)?d.revisions[id]:content(v,id)||'Chưa có thông tin'}</p></div></div>)}</details>})}</section>
   <section className="vc-card"><h3>Cam kết hành động sau tự soi</h3><fieldset disabled={!editable||busy}>{(['action','owner','due'] as const).map((key,i)=><label key={key}>{['Việc quan trọng nhất','Người chịu trách nhiệm','Thời hạn / mốc kiểm chứng'][i]}<input type={key==='due'?'date':'text'} value={history?(selected?.commitment?.[key]||''):commitment[key]} onChange={e=>{if(!commitDirty)commitmentContext.current=context;setCommitment({...commitment,[key]:e.target.value});setCommitDirty(true);}}/></label>)}<button disabled={!commitDirty} onClick={async()=>{if(await command('reflection',{...(commitmentContext.current||context),action:'commitment',data:commitment}))setCommitDirty(false);}}>Lưu cam kết</button></fieldset></section>
   {editable&&<button className="primary" disabled={busy||completed!==8||commitDirty||!Object.values(commitment).every(Boolean)} onClick={async()=>{if(window.confirm('Gửi toàn bộ 8 bước và khóa bản tự soi để chuyên gia xem xét?'))await command('reflection',{...context,action:'submit',request_id:r.id+':'+current?.revision});}}>Gửi bản tự soi</button>}
   {canReview&&current?.status==='submitted'&&!history&&<section className="vc-card"><h3>Duyệt bản tự soi</h3><label>Căn cứ quyết định<textarea value={reviewReason} onChange={e=>setReviewReason(e.target.value)}/></label><button disabled={busy||!reviewReason.trim()} onClick={()=>void command('reflection-review',{id:r.id,submission_id:current.submission_id,decision:'return',reason:reviewReason})}>Trả lại để hiệu chỉnh</button> <button className="primary" disabled={busy||!reviewReason.trim()} onClick={()=>{if(window.confirm('Duyệt và cập nhật nội dung hiệu chỉnh thành phiên bản mới?'))void command('reflection-review',{id:r.id,submission_id:current.submission_id,decision:'accept',reason:reviewReason});}}>Duyệt bản hiệu chỉnh</button></section>}
   {r.self_reviews?.filter(x=>!history||x.submission_id===history).map((x,i)=><p className="vc-info" key={i}>{x.decision==='accept'?'Đã duyệt':'Đã trả lại'} · {new Date(x.at).toLocaleString('vi-VN')}: {x.reason}</p>)}
  </>}
 </div>;
}
