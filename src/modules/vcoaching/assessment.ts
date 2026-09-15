type Review = {step:string;state:string;stale:boolean;quality?:string;rule:string;version?:number;problem?:string};
type RecordState = {comments:Review[];versions:{number:number;fields:Record<string,string[]>;revisions:Record<string,string>}[]};
const concerns = new Set(['Cần làm rõ','Chưa có thông tin','Chưa đủ bằng chứng','Cần kiểm chứng','Có mâu thuẫn logic']);
export function stepAssessment(record:RecordState, step:string):{label:string;attention:boolean;reason:string} {
  const version=record.versions.at(-1)!;
  const keys=step==='7'?['7A','7B','7C']:[step];
  const states=keys.map(key=>{
    const active=record.comments.filter(c=>c.step===key&&!c.stale&&c.state!=='rejected'&&(c.version===undefined||c.version===version.number));
    const reviewed=active.filter(c=>c.rule==='EXPERT'&&c.state==='approved'&&c.quality);
    const concern=reviewed.find(c=>concerns.has(c.quality!));
    if(concern)return {label:concern.quality!,attention:true,reason:concern.problem||'Đánh giá chuyên gia trên phiên bản hiện tại.'};
    if(reviewed.length)return {label:reviewed.at(-1)!.quality!,attention:false,reason:'Đã có đánh giá chuyên gia trên phiên bản hiện tại.'};
    const rule=active.find(c=>c.rule!=='EXPERT');
    if(rule)return {label:'Cần kiểm chứng',attention:true,reason:rule.problem||'Có dấu hiệu cần đối chiếu nguồn.'};
    const hasContent=version.revisions[key]!==undefined?!!version.revisions[key].trim():!!version.fields[key]?.length;
    return hasContent?{label:'Chưa đánh giá',attention:false,reason:'Có nội dung nguồn; chưa có kết luận về chất lượng.'}:{label:'Chưa ánh xạ',attention:true,reason:'Chưa xác định đoạn nguồn cho mục này; chưa kết luận tài liệu thiếu nội dung.'};
  });
  return states.find(s=>s.attention)||states.find(s=>s.label==='Chưa đánh giá')||states[0];
}
export function comparisonTone(label:string){return label==='Cần xác minh'||label==='Còn yếu'?'warn':label==='Rõ hơn'?'good':'';}
