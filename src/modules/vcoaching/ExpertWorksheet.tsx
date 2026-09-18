import {useEffect, useRef, useState} from 'react';
import {Plus, Pencil, Trash2, Save} from 'lucide-react';
import schema from '../../../vcoaching/self_reflection_schema.json';

type Question = {id:string;question:string;answer:string;rating:string};
export type ApprovedStep = {title:string;lead:string;note:string;questions:string[];cards:{title:string;source:string;fields:{label:string;text:string}[]}[]};
type Detail = {note:string;edit:string;master:string;owner:string;due:string};
const emptyDetail:Detail={note:'',edit:'',master:'',owner:'',due:''};
export type ExpertSheet = {revision:number;base_version:number;steps:Record<string,Question[]>;details?:Record<string,Detail>};
type Props = {id:string;version:number;sheet?:ExpertSheet;busy:boolean;locked:boolean;lane?:'expert'|'unit';sourceSteps?:ApprovedStep[];command:(op:string,body:Record<string,unknown>)=>Promise<boolean>};
const initial = (source?:ApprovedStep[]):Record<string,Question[]> => Object.fromEntries((source?source.map((s,i)=>({id:String(i+1),checks:s.questions})):schema).map(s=>[s.id,s.checks.map((question,i)=>({id:`${s.id}:${i}`,question,answer:'',rating:''}))]));

export default function ExpertWorksheet({id,version,sheet,busy,locked,command,lane='expert',sourceSteps}:Props){
 const label=lane==='expert'?'giảng viên':'đơn vị';
 const activeSchema=sourceSteps?sourceSteps.map((s,i)=>({id:String(i+1),name:s.title})):schema;
 const [step,setStep]=useState('1');
 const [questions,setQuestions]=useState<Question[]>(()=> (sheet?.steps||initial(sourceSteps))['1']);
 const [dirty,setDirty]=useState(false);
 const [detail,setDetail]=useState<Detail>(sheet?.details?.['1']||emptyDetail);
 const [editing,setEditing]=useState<Question|null>(null);
 const [revision,setRevision]=useState(sheet?.revision||0);
 const [baseVersion,setBaseVersion]=useState(version);
 const root=useRef<HTMLDivElement>(null);
 const dialog=useRef<HTMLDialogElement>(null);
 const sending=useRef(false);
 const disabled=busy||locked;
 useEffect(()=>{if(!dirty){setQuestions((sheet?.steps||initial(sourceSteps))[step]);setRevision(sheet?.revision||0);setBaseVersion(version);}},[step,sheet,version,dirty,sourceSteps]);
 useEffect(()=>{if(!dirty)setDetail(sheet?.details?.[step]||emptyDetail);},[step,sheet,dirty]);
 useEffect(()=>{if(editing)dialog.current?.showModal();else dialog.current?.close();},[editing]);
 useEffect(()=>{
  const unload=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};
  const leave=(e:MouseEvent)=>{if(dirty&&!root.current?.contains(e.target as Node)&&(e.target as Element).closest('button,a,select')&&!window.confirm(`Phiếu ${label} chưa lưu. Rời màn hình và bỏ thay đổi?`)){e.preventDefault();e.stopPropagation();}};
  window.addEventListener('beforeunload',unload);document.addEventListener('click',leave,true);
  return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',leave,true);};
 },[dirty,label]);
 const change=(list:Question[])=>{setQuestions(list);setDirty(true);};
 const save=async()=>{if(sending.current||disabled)return false;sending.current=true;try{const ok=await command(lane+'-worksheet',{id,step,questions,detail,revision,base_version:baseVersion});if(ok)setDirty(false);return ok;}finally{sending.current=false;}};
 return <div ref={root} className="vc-expert-sheet">
  <nav className="vc-steps" aria-label={'8 bước '+label}>{activeSchema.map(s=><button key={s.id} disabled={busy} aria-current={step===s.id?'step':undefined} className={step===s.id?'active':''} onClick={async()=>{if(!dirty||await save())setStep(s.id);}}><span>{s.id}</span><small>{s.name}</small></button>)}</nav>
  {sourceSteps&&<section className="vc-card"><h2>{sourceSteps[Number(step)-1].lead}</h2><div className="vc-columns">{sourceSteps[Number(step)-1].cards.map((c,i)=><details key={i}><summary>{c.title}</summary><small>{c.source}</small>{c.fields.map((f,j)=><div key={j}>{f.label&&<h3>{f.label}</h3>}<p className="vc-answer">{f.text}</p></div>)}</details>)}</div><p>{sourceSteps[Number(step)-1].note}</p></section>}
  <section className="vc-card"><div className="vc-row spread"><h2>{step}. {activeSchema.find(s=>s.id===step)?.name}</h2><button disabled={disabled||questions.length>=50} onClick={()=>setEditing({id:crypto.randomUUID(),question:'',answer:'',rating:''})}><Plus size={16}/> Thêm câu hỏi</button></div>
   {questions.map((q,i)=><div className="vc-question" key={q.id}><div className="vc-row spread"><h3>{i+1}. {q.question}</h3><div className="vc-row"><button disabled={disabled} aria-label={`Sửa câu hỏi ${i+1}`} onClick={()=>setEditing({...q})}><Pencil size={16}/></button><button disabled={disabled||questions.length<=1} aria-label={`Xóa câu hỏi ${i+1}`} onClick={()=>{if(window.confirm('Xóa câu hỏi và câu trả lời khỏi phiếu đang chỉnh? Bản đã lưu trước đó vẫn được giữ trong lịch sử.'))change(questions.filter(x=>x.id!==q.id));}}><Trash2 size={16}/></button></div></div>
    <label>Câu trả lời của {label}<textarea disabled={disabled} value={q.answer} onChange={e=>change(questions.map(x=>x.id===q.id?{...x,answer:e.target.value}:x))}/></label>
    <label>Đánh giá<select disabled={disabled} value={q.rating} onChange={e=>change(questions.map(x=>x.id===q.id?{...x,rating:e.target.value}:x))}><option value="">Chưa đánh giá</option><option value="clear">Đã rõ</option><option value="partial">Cần bổ sung</option><option value="missing">Chưa có căn cứ</option><option value="verify">Cần xác minh</option></select></label>
   </div>)}
   <div className="vc-formgrid">{([['note','Căn cứ, nhận xét và câu hỏi cần làm rõ'],['edit','Nội dung cần sửa trong Biểu 02'],['master','Nội dung cần đồng bộ trong Biểu 01'],['owner','Người thực hiện / phối hợp'],['due','Hạn hoàn thiện']] as const).map(([key,title])=><label key={key}>{title}{key==='owner'||key==='due'?<input disabled={disabled} type={key==='due'?'date':'text'} value={detail[key]} onChange={e=>{setDetail({...detail,[key]:e.target.value});setDirty(true);}}/>:<textarea disabled={disabled} value={detail[key]} onChange={e=>{setDetail({...detail,[key]:e.target.value});setDirty(true);}}/>}</label>)}</div>
   <div className="vc-row spread"><span role="status">{dirty?'Có thay đổi chưa lưu':sheet?'Đã lưu':'Chưa lưu'}</span><button className="primary" disabled={disabled||!dirty} onClick={()=>void save()}><Save size={16}/> Lưu phiếu {label}</button></div>
  </section>
  <dialog className="vc-account-dialog" ref={dialog} onCancel={()=>setEditing(null)} aria-labelledby="vc-question-heading"><form onSubmit={e=>{e.preventDefault();if(!editing?.question.trim())return;const existing=questions.some(q=>q.id===editing.id);change(existing?questions.map(q=>q.id===editing.id?{...editing,question:editing.question.trim(),rating:q.question===editing.question.trim()?q.rating:''}:q):[...questions,{...editing,question:editing.question.trim()}]);setEditing(null);}}><h2 id="vc-question-heading">Nội dung câu hỏi</h2><label>Câu hỏi<textarea required maxLength={4000} value={editing?.question||''} onChange={e=>setEditing(editing?{...editing,question:e.target.value}:null)}/></label><p>Sửa câu hỏi giữ câu trả lời để đối chiếu, nhưng cần đánh giá lại.</p><div className="vc-row"><button type="submit" className="primary" disabled={disabled||!editing?.question.trim()}>Áp dụng</button><button type="button" onClick={()=>setEditing(null)}>Hủy</button></div></form></dialog>
 </div>;
}
