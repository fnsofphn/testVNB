import {useState} from 'react';
import type {ApprovedStep} from './ExpertWorksheet';
type Source = {names:string[];steps:ApprovedStep[][];docs:Record<string,{paragraphs:string[];tables:string[][][]}>};
type RecordItem = {id:string;name:string;unit_name:string;versions:{number:number}[]};
type Props = {items:RecordItem[];api:(op:string)=>Promise<{source:Source}>;command:(op:string,body:Record<string,unknown>)=>Promise<boolean>};
const names:Record<string,string>={master:'Biểu 01',sk01:'Biểu 02 · SK01',sk02:'Biểu 02 · SK02',sk03:'Biểu 02 · SK03',training:'Tài liệu đào tạo',quiz:'Câu hỏi và bài tập',direction:'Tài liệu định hướng'};
export default function ApprovedContent({items,api,command}:Props){
 const [source,setSource]=useState<Source>();const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const [selected,setSelected]=useState<Record<number,string>>({});const [status,setStatus]=useState('');
 const load=async()=>{setBusy(true);setError('');try{setSource((await api('approved-source')).source);}catch(e){setError(String(e));}finally{setBusy(false);}};
 return <section className="vc-card"><h2>Nội dung sáng kiến & tài liệu nguồn</h2>{!source&&<button disabled={busy} onClick={()=>void load()}>Mở nội dung đã duyệt</button>}{error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}
 {source&&<>{source.names.map((name,index)=><details key={name}><summary>{name}</summary><label>Hồ sơ cập nhật<select value={selected[index]||''} onChange={e=>setSelected({...selected,[index]:e.target.value})}><option value="">Chọn hồ sơ tương ứng</option>{items.map(r=><option key={r.id} value={r.id}>{r.unit_name} · {r.name}</option>)}</select></label><button disabled={busy||!selected[index]} onClick={async()=>{const record=items.find(r=>r.id===selected[index]);if(!record||!window.confirm(`Ghi đè nội dung của “${record.name}” bằng “${name}”? Bản hiện tại được sao lưu trước khi thay.`))return;setBusy(true);try{if(await command('approved-source-replace',{id:record.id,index,base_version:record.versions.at(-1)!.number}))setStatus('Đã cập nhật và sao lưu hồ sơ.');}finally{setBusy(false);}}}>Sao lưu & cập nhật hồ sơ</button>
 {source.steps[index].map((s,i)=><details key={i}><summary>{i+1}. {s.title} · {s.questions.length} câu hỏi</summary><p>{s.lead}</p>{s.cards.map((c,j)=><article key={j}><h3>{c.title}</h3><small>{c.source}</small>{c.fields.map((f,k)=><div key={k}><b>{f.label}</b><p className="vc-answer">{f.text}</p></div>)}</article>)}<p>{s.note}</p><ol>{s.questions.map(q=><li key={q}>{q}</li>)}</ol></details>)}</details>)}
 {Object.entries(source.docs).map(([key,doc])=><details key={key}><summary>{names[key]||key} · {doc.tables.length} bảng</summary>{doc.paragraphs.map((p,i)=><p key={i}>{p}</p>)}{doc.tables.map((table,i)=><details key={i}><summary>Bảng {i+1} · {table.length} dòng</summary><div className="vc-table"><table><tbody>{table.map((row,j)=><tr key={j}>{row.map((cell,k)=><td className="vc-form-value" key={k}>{cell}</td>)}</tr>)}</tbody></table></div></details>)}</details>)}</>}
 </section>;
}
