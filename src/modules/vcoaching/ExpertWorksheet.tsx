import {useEffect, useRef, useState} from 'react';
import {Plus, Pencil, Trash2, Save} from 'lucide-react';
import schema from '../../../vcoaching/self_reflection_schema.json';

type Question = {id:string;question:string;answer:string;rating:string};
export type ExpertSheet = {revision:number;base_version:number;steps:Record<string,Question[]>};
type Props = {id:string;version:number;sheet?:ExpertSheet;busy:boolean;locked:boolean;command:(op:string,body:Record<string,unknown>)=>Promise<boolean>};
const initial = ():Record<string,Question[]> => Object.fromEntries(schema.map(s=>[s.id,s.checks.map((question,i)=>({id:`${s.id}:${i}`,question,answer:'',rating:''}))]));

export default function ExpertWorksheet({id,version,sheet,busy,locked,command}:Props){
 const [step,setStep]=useState('1');
 const [questions,setQuestions]=useState<Question[]>(()=> (sheet?.steps||initial())['1']);
 const [dirty,setDirty]=useState(false);
 const [editing,setEditing]=useState<Question|null>(null);
 const [revision,setRevision]=useState(sheet?.revision||0);
 const [baseVersion,setBaseVersion]=useState(version);
 const root=useRef<HTMLDivElement>(null);
 const dialog=useRef<HTMLDialogElement>(null);
 const sending=useRef(false);
 const disabled=busy||locked;
 useEffect(()=>{if(!dirty){setQuestions((sheet?.steps||initial())[step]);setRevision(sheet?.revision||0);setBaseVersion(version);}},[step,sheet,version,dirty]);
 useEffect(()=>{if(editing)dialog.current?.showModal();else dialog.current?.close();},[editing]);
 useEffect(()=>{
  const unload=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};
  const leave=(e:MouseEvent)=>{if(dirty&&!root.current?.contains(e.target as Node)&&(e.target as Element).closest('button,a,select')&&!window.confirm('Phiếu giảng viên chưa lưu. Rời màn hình và bỏ thay đổi?')){e.preventDefault();e.stopPropagation();}};
  window.addEventListener('beforeunload',unload);document.addEventListener('click',leave,true);
  return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',leave,true);};
 },[dirty]);
 const change=(list:Question[])=>{setQuestions(list);setDirty(true);};
 const save=async()=>{if(sending.current||disabled)return false;sending.current=true;try{const ok=await command('expert-worksheet',{id,step,questions,revision,base_version:baseVersion});if(ok)setDirty(false);return ok;}finally{sending.current=false;}};
 return <div ref={root} className="vc-expert-sheet">
  <nav className="vc-steps" aria-label="8 bước giảng viên">{schema.map(s=><button key={s.id} disabled={busy} aria-current={step===s.id?'step':undefined} className={step===s.id?'active':''} onClick={async()=>{if(!dirty||await save())setStep(s.id);}}><span>{s.id}</span><small>{s.name}</small></button>)}</nav>
  <section className="vc-card"><div className="vc-row spread"><h2>{step}. {schema.find(s=>s.id===step)?.name}</h2><button disabled={disabled||questions.length>=50} onClick={()=>setEditing({id:crypto.randomUUID(),question:'',answer:'',rating:''})}><Plus size={16}/> Thêm câu hỏi</button></div>
   {questions.map((q,i)=><div className="vc-question" key={q.id}><div className="vc-row spread"><h3>{i+1}. {q.question}</h3><div className="vc-row"><button disabled={disabled} aria-label={`Sửa câu hỏi ${i+1}`} onClick={()=>setEditing({...q})}><Pencil size={16}/></button><button disabled={disabled||questions.length<=1} aria-label={`Xóa câu hỏi ${i+1}`} onClick={()=>{if(window.confirm('Xóa câu hỏi và câu trả lời khỏi phiếu đang chỉnh? Bản đã lưu trước đó vẫn được giữ trong lịch sử.'))change(questions.filter(x=>x.id!==q.id));}}><Trash2 size={16}/></button></div></div>
    <label>Câu trả lời của giảng viên<textarea disabled={disabled} value={q.answer} onChange={e=>change(questions.map(x=>x.id===q.id?{...x,answer:e.target.value}:x))}/></label>
    <label>Đánh giá<select disabled={disabled} value={q.rating} onChange={e=>change(questions.map(x=>x.id===q.id?{...x,rating:e.target.value}:x))}><option value="">Chưa đánh giá</option><option value="clear">Đã rõ</option><option value="partial">Cần bổ sung</option><option value="missing">Chưa có căn cứ</option><option value="verify">Cần xác minh</option></select></label>
   </div>)}
   <div className="vc-row spread"><span role="status">{dirty?'Có thay đổi chưa lưu':sheet?'Đã lưu phiếu giảng viên':'Chưa lưu phiếu giảng viên'}</span><button className="primary" disabled={disabled||!dirty} onClick={()=>void save()}><Save size={16}/> Lưu phiếu giảng viên</button></div>
  </section>
  <dialog className="vc-account-dialog" ref={dialog} onCancel={()=>setEditing(null)} aria-labelledby="vc-question-heading"><form onSubmit={e=>{e.preventDefault();if(!editing?.question.trim())return;const existing=questions.some(q=>q.id===editing.id);change(existing?questions.map(q=>q.id===editing.id?{...editing,question:editing.question.trim(),rating:q.question===editing.question.trim()?q.rating:''}:q):[...questions,{...editing,question:editing.question.trim()}]);setEditing(null);}}><h2 id="vc-question-heading">Nội dung câu hỏi</h2><label>Câu hỏi<textarea required maxLength={4000} value={editing?.question||''} onChange={e=>setEditing(editing?{...editing,question:e.target.value}:null)}/></label><p>Sửa câu hỏi giữ câu trả lời để đối chiếu, nhưng cần đánh giá lại.</p><div className="vc-row"><button type="submit" className="primary" disabled={disabled||!editing?.question.trim()}>Áp dụng</button><button type="button" onClick={()=>setEditing(null)}>Hủy</button></div></form></dialog>
 </div>;
}
