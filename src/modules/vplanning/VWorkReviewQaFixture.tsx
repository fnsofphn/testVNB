import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Review } from './VPlanningNativePage';
import './VPlanningNativePage.css';

const now = new Date().toISOString();
const director = {
  id:'qa-director',
  name:'Hải Lê',
  email:'hai.le@peopleone.vn',
  title:'Giám đốc',
  roles:['vplanning_director'],
  ownerIds:['qa-director'],
};

const fixtureTasks = [
  {
    id:'qa-work-1',
    title:'Test lại thảo luận nhóm với số lượng 150 học viên',
    projectCode:'PLX-CHT-L2',
    customer:'Petrolimex',
    group:'VLearning',
    ownerName:'Nam Phạm',
    ownerId:'qa-nam',
    stage:'reported',
    status:'assigned',
    deadline:'2026-07-13',
    complete:100,
    evidenceLink:'https://example.com/minh-chung',
    checklist:[
      { label:'Xác nhận phạm vi và đầu ra', done:true },
      { label:'Test lại thảo luận nhóm', done:true },
      { label:'Cập nhật minh chứng', done:true },
    ],
    reports:[{ by:'Nam Phạm', note:'Đã hoàn thành và gửi minh chứng.', date:'20/07/2026', at:now }],
    activity:[{ by:'Nam Phạm', action:'Gửi báo cáo', note:'Đã gửi duyệt.', at:now }],
  },
  {
    id:'qa-request-1',
    title:'Đề nghị thanh toán chi phí triển khai lớp học',
    sourceModule:'vwork_admin_request',
    requestKind:'admin_request',
    sourceId:'HC-QA-001',
    ownerName:'Nam Phạm',
    stage:'reported',
    status:'assigned',
    deadline:'2026-07-22',
    checklist:[],
    activity:[{ by:'Nam Phạm', action:'Gửi yêu cầu', note:'Chờ Giám đốc duyệt.', at:now }],
    adminRequest:{
      requestCode:'HC-QA-001',
      requestType:'payment',
      paymentStatus:'manager_approved',
      requesterName:'Nam Phạm',
      requesterEmail:'nam.pham@peopleone.vn',
      vendor:'Đối tác đào tạo',
      amount:12500000,
      currency:'VND',
      purpose:'Thanh toán chi phí triển khai lớp học.',
    },
  },
  {
    id:'qa-proposal-1',
    title:'Đề xuất tối ưu giao diện V-Work mobile',
    sourceModule:'vwork_proposal_request',
    requestKind:'work_proposal',
    sourceId:'RQ-QA-001',
    ownerName:'Nam Phạm',
    stage:'reported',
    status:'assigned',
    deadline:'2026-07-23',
    checklist:[],
    activity:[{ by:'Nam Phạm', action:'Gửi đề xuất', note:'Chờ Giám đốc duyệt.', at:now }],
    workProposal:{
      id:'RQ-QA-001',
      type:'task_idea',
      status:'pending',
      title:'Đề xuất tối ưu giao diện V-Work mobile',
      detail:'Tối ưu trải nghiệm sử dụng V-Work trên màn hình nhỏ.',
      ownerName:'Nam Phạm',
      requestedBy:'Nam Phạm',
      urgency:'Bình thường',
      recipientName:'Hải Lê',
    },
  },
];

function ReviewFixture() {
  const [tasks, setTasks] = useState(fixtureTasks);
  return <div className="vplanning-native page-review">
    <header className="topbar"><div><strong>Cần duyệt</strong></div><div className="topbar-spacer" /><label className="vwork-search"><span>⌕</span><input readOnly placeholder="Tìm việc, đề xuất, đề nghị..." /></label></header>
    <main className="content">
      <Review tasks={tasks} setTasks={setTasks} role="vplanning_director" me="Hải Lê" currentUser={director} setPage={()=>{}} />
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<ReviewFixture />);
