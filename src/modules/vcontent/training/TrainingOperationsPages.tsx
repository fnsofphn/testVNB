import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileQuestion,
  Gamepad2,
  Link as LinkIcon,
  LogIn,
  MessageSquareText,
  MonitorCheck,
  Presentation,
  QrCode,
  Sparkles,
  Trophy,
  UsersRound,
  Video,
  X,
} from 'lucide-react';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { suniTrainingApi } from '@/lib/suni';

type TrainingMode = 'offline' | 'online';
type Phase = 'PRE' | 'DURING' | 'POST';
type DisplayTask = {
  key: string;
  title: string;
  group: string;
  phase: Phase;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  relativeDay: number;
  ownerRole: string;
  requiresEvidence: boolean;
  evidenceType: string;
  note: string;
  modes?: TrainingMode[];
};
type DetailModalKey = 'presentation-rehearsal' | 'system-rehearsal';

const PHASE_LABELS: Record<Phase, { label: string; time: string; detail: string }> = {
  PRE: {
    label: 'Trước lớp',
    time: 'T-7 đến T-1',
    detail: 'Khóa lịch, danh sách, giảng viên, tài liệu và điều kiện kỹ thuật trước ngày học.',
  },
  DURING: {
    label: 'Trong lớp',
    time: 'Ngày học',
    detail: 'Điểm danh, hỗ trợ giảng viên, xử lý phát sinh, kích hoạt khảo sát và gom minh chứng.',
  },
  POST: {
    label: 'Sau lớp',
    time: 'T+1 đến T+2',
    detail: 'Chuẩn hóa dữ liệu tham gia, upload hồ sơ nghiệm thu và tổng hợp phản hồi.',
  },
};

const PLATFORM_GUIDES = [
  {
    product: 'VTraining',
    icon: MonitorCheck,
    purpose: 'Quản lý chương trình, khóa, lớp, học viên, giảng viên, checklist vận hành và minh chứng nghiệm thu.',
    flow: ['Tạo chương trình/khóa', 'Mở lớp đào tạo', 'Gán học viên và giảng viên', 'Insert checklist vận hành', 'Theo dõi minh chứng và kết quả'],
    operatorNotes: ['Luôn chọn đúng lớp trước khi nhập checklist.', 'Các minh chứng bắt buộc nên gắn vào đúng đầu việc để nghiệm thu dễ kiểm tra.', 'Kết quả điểm danh, khảo sát và phản hồi cần được đối chiếu trước khi đóng lớp.'],
  },
  {
    product: 'VDiscussion',
    icon: UsersRound,
    purpose: 'Tổ chức thảo luận nhóm, mở phiên tương tác, thu câu trả lời và xem kết quả trình bày theo nhóm.',
    flow: ['Tạo event/session', 'Cấu hình câu hỏi hoặc hoạt động', 'Mở phiên cho học viên', 'Theo dõi nhóm trả lời', 'Xuất kết quả thảo luận'],
    operatorNotes: ['Kiểm tra link public/training trước giờ học.', 'Chốt thời lượng từng vòng thảo luận để tránh trôi agenda.', 'Sau phiên, kiểm tra kết quả theo nhóm trước khi chia sẻ báo cáo.'],
  },
];

const TEST_BLUEPRINT = [
  {
    type: 'Trắc nghiệm',
    title: 'Nhận diện đúng việc theo timeline lớp',
    sample: 'Khi lớp bắt đầu trong 15 phút nữa, đầu việc nào cần ưu tiên kiểm tra trước?',
    status: 'Chờ nhập câu hỏi',
  },
  {
    type: 'Trắc nghiệm',
    title: 'Vận hành VTraining',
    sample: 'Minh chứng điểm danh nên được gắn vào đâu để hồ sơ nghiệm thu dễ rà soát?',
    status: 'Chờ nhập câu hỏi',
  },
  {
    type: 'Tự luận tình huống',
    title: 'Xử lý phát sinh trong lớp trực tiếp',
    sample: 'Giảng viên báo máy chiếu lỗi, học viên đã vào đủ lớp. Hãy mô tả thứ tự xử lý và cách ghi nhận minh chứng.',
    status: 'Chờ nhập tình huống',
  },
  {
    type: 'Tự luận tình huống',
    title: 'Điều phối VDiscussion trong phiên học',
    sample: 'Một nhóm không gửi được kết quả thảo luận. Bạn cần kiểm tra gì trên VDiscussion và báo lại lớp thế nào?',
    status: 'Chờ nhập tình huống',
  },
];

const SUPPLEMENTAL_TIMELINE_TASKS: DisplayTask[] = [
  {
    key: 'supplement-system-student-login-rehearsal',
    title: 'Test kỹ hệ thống bằng tài khoản học viên',
    group: 'Kỹ thuật hệ thống',
    phase: 'PRE',
    priority: 'HIGH',
    relativeDay: -1,
    ownerRole: 'CTV kỹ thuật',
    requiresEvidence: true,
    evidenceType: 'Biên bản test / ảnh màn hình',
    note: 'Đăng nhập bằng tài khoản như học viên thật, đi qua các hoạt động chính, ghi nhớ đường dẫn, cách vào bài và các điểm dễ vướng để hỗ trợ nhanh trong ngày học.',
  },
  {
    key: 'supplement-lessonplan-presentation-rehearsal',
    title: 'Luyện tập trình chiếu và chuyển hoạt động theo lesson plan',
    group: 'Điều phối lớp',
    phase: 'PRE',
    priority: 'HIGH',
    relativeDay: -1,
    ownerRole: 'CTV điều phối',
    requiresEvidence: false,
    evidenceType: '',
    note: 'Chạy thử trình tự trình chiếu, mở link hoạt động, chuyển giữa VTraining/VDiscussion hoặc tài liệu liên quan theo lesson plan để tránh lúng túng khi lớp đang live.',
  },
  {
    key: 'supplement-present-activities-live',
    title: 'Trình chiếu các hoạt động như đã luyện tập',
    group: 'Trong lớp',
    phase: 'DURING',
    priority: 'HIGH',
    relativeDay: 0,
    ownerRole: 'CTV điều phối',
    requiresEvidence: false,
    evidenceType: '',
    note: 'Bám lesson plan, mở đúng hoạt động vào đúng thời điểm, chuyển màn hình gọn và thông báo rõ cho giảng viên/học viên trước mỗi phần.',
  },
  {
    key: 'supplement-support-learners-access-activities',
    title: 'Hỗ trợ học viên truy cập các hoạt động',
    group: 'Trong lớp',
    phase: 'DURING',
    priority: 'HIGH',
    relativeDay: 0,
    ownerRole: 'CTV lớp',
    requiresEvidence: false,
    evidenceType: '',
    note: 'Dựa trên phần đã trải nghiệm bằng tài khoản học viên để hướng dẫn đăng nhập, mở hoạt động, xử lý lỗi truy cập và nhắc học viên hoàn thành đúng bước.',
  },
];

const DETAIL_MODAL_TASK_MAP: Record<string, DetailModalKey> = {
  'supplement-lessonplan-presentation-rehearsal': 'presentation-rehearsal',
  'supplement-system-student-login-rehearsal': 'system-rehearsal',
};

const PRESENTATION_ACTIVITY_CARDS = [
  {
    title: 'Background chung',
    detail: 'Màn nền nhận diện lớp, tên chương trình, agenda và trạng thái chuyển phần.',
    icon: Presentation,
    tone: 'blue',
  },
  {
    title: 'Slides giảng dạy',
    detail: 'Mở đúng deck, đúng slide, đúng nhịp theo lesson plan và tín hiệu của giảng viên.',
    icon: ClipboardCheck,
    tone: 'violet',
  },
  {
    title: 'Video',
    detail: 'Test âm lượng, chế độ full screen, điểm bắt đầu/kết thúc và phương án phát lại.',
    icon: Video,
    tone: 'cyan',
  },
  {
    title: 'QR/link tham gia game',
    detail: 'Chuẩn bị mã QR, link dự phòng và hướng dẫn học viên vào game nhanh.',
    icon: QrCode,
    tone: 'green',
  },
  {
    title: 'Kết quả game',
    detail: 'Chuyển sang bảng kết quả, leaderboard hoặc phần tổng kết để giảng viên debrief.',
    icon: Trophy,
    tone: 'amber',
  },
  {
    title: 'QR/link kiểm tra',
    detail: 'Mở đúng bài kiểm tra, kiểm tra quyền truy cập và cách học viên nộp bài.',
    icon: FileQuestion,
    tone: 'pink',
  },
  {
    title: 'Thu hoạch',
    detail: 'Hướng dẫn nơi nhập/nộp bài thu hoạch, deadline và tiêu chí hoàn thành.',
    icon: BookOpenCheck,
    tone: 'indigo',
  },
  {
    title: 'Khảo sát',
    detail: 'Kích hoạt khảo sát cuối phần/cuối lớp và theo dõi tỷ lệ phản hồi trước khi kết thúc.',
    icon: MessageSquareText,
    tone: 'teal',
  },
];

const SYSTEM_REHEARSAL_GUIDES = [
  {
    product: 'VTraining',
    icon: MonitorCheck,
    goal: 'Đảm bảo người vận hành nhìn hệ thống giống học viên và biết cách hỗ trợ khi học viên bị kẹt.',
    steps: [
      'Đăng nhập bằng tài khoản học viên thật hoặc tài khoản mô phỏng cùng quyền.',
      'Vào đúng chương trình, khóa và lớp đang học.',
      'Mở từng hoạt động trong lesson plan: tài liệu, bài kiểm tra, thu hoạch, khảo sát, link học.',
      'Kiểm tra trạng thái hoàn thành, quyền nộp bài và thông báo lỗi nếu thiếu quyền.',
      'Ghi nhớ đường dẫn, nút bấm, tên tab và ảnh màn hình các điểm học viên dễ hỏi.',
    ],
    notes: [
      'Không chỉ test bằng tài khoản admin vì admin thường thấy nhiều hơn học viên.',
      'Nếu học viên không thấy lớp, ưu tiên kiểm tra gán lớp, trạng thái lớp, thời gian mở và quyền truy cập.',
      'Nếu không nộp được bài, kiểm tra trạng thái hoạt động, deadline, bắt buộc đăng nhập và định dạng dữ liệu.',
    ],
  },
  {
    product: 'VDiscussion',
    icon: UsersRound,
    goal: 'Đảm bảo phiên thảo luận mở đúng, học viên vào đúng hoạt động và kết quả nhóm hiển thị được khi cần debrief.',
    steps: [
      'Mở event/session tương ứng với lớp hoặc hoạt động trong lesson plan.',
      'Kiểm tra link tham gia, QR, thời gian mở/đóng và quyền truy cập của học viên.',
      'Thử gửi câu trả lời dưới vai học viên/nhóm để biết luồng submit.',
      'Kiểm tra màn theo dõi: nhóm nào đã gửi, nội dung trả lời và kết quả trình bày.',
      'Chuẩn bị câu nói hướng dẫn ngắn cho học viên: vào link nào, chọn nhóm nào, bấm nộp ở đâu.',
    ],
    notes: [
      'Nếu học viên không vào được, kiểm tra đúng session, đúng link và trạng thái mở phiên.',
      'Nếu nhóm gửi không lên kết quả, kiểm tra bước submit, nhóm được gán và màn kết quả đang xem đúng event.',
      'Nếu lớp cần trình chiếu kết quả, mở sẵn tab kết quả trước để tránh tìm kiếm trong lúc live.',
    ],
  },
];

function phaseTone(phase: Phase): 'violet' | 'purple' | 'success' {
  if (phase === 'PRE') return 'violet';
  if (phase === 'DURING') return 'purple';
  return 'success';
}

function relativeDayLabel(value: number) {
  if (value < 0) return `T${value}`;
  if (value > 0) return `T+${value}`;
  return 'T';
}

function TrainingTabs({ active }: { active: 'knowledge' | 'test' }) {
  return (
    <div className="training-operations-tabs">
      <Link className={active === 'knowledge' ? 'is-active' : ''} to="/training-knowledge">Kiến thức training</Link>
      <Link className={active === 'test' ? 'is-active' : ''} to="/training-test">Test kiến thức</Link>
    </div>
  );
}

function TrainingTaskDetailModal({ modalKey, onClose }: { modalKey: DetailModalKey; onClose: () => void }) {
  const isPresentation = modalKey === 'presentation-rehearsal';

  return (
    <div className="training-operations-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="training-operations-modal" role="dialog" aria-modal="true" aria-label={isPresentation ? 'Chi tiết luyện tập trình chiếu' : 'Chi tiết test hệ thống'} onMouseDown={(event) => event.stopPropagation()}>
        <div className="training-operations-modal-head">
          <div>
            <Badge tone={isPresentation ? 'purple' : 'violet'}>{isPresentation ? 'Infographic trình chiếu' : 'Luồng test hệ thống'}</Badge>
            <h3>{isPresentation ? 'Luyện tập thao tác trình chiếu theo lesson plan' : 'Test hệ thống bằng tài khoản học viên'}</h3>
            <p>
              {isPresentation
                ? 'Mục tiêu là chuyển hoạt động mượt, đúng nhịp lớp và không mất thời gian tìm link trong lúc giảng viên đang dẫn.'
                : 'Mục tiêu là trải nghiệm như học viên thật, ghi nhớ các bước dễ vướng và chuẩn bị câu trả lời ngắn để hỗ trợ tại lớp.'}
            </p>
          </div>
          <button type="button" className="training-operations-modal-close" onClick={onClose} aria-label="Đóng chi tiết"><X size={18} /></button>
        </div>

        {isPresentation ? (
          <>
            <div className="training-operations-infographic-grid">
              {PRESENTATION_ACTIVITY_CARDS.map((item, index) => {
                const Icon = item.icon;
                return (
                  <article className={`training-operations-infographic-card tone-${item.tone}`} key={item.title}>
                    <div className="training-operations-infographic-index">{String(index + 1).padStart(2, '0')}</div>
                    <div className="training-operations-infographic-icon"><Icon size={21} /></div>
                    <h4>{item.title}</h4>
                    <p>{item.detail}</p>
                  </article>
                );
              })}
            </div>
            <div className="training-operations-modal-checkline">
              {['Mở sẵn tab', 'Test âm thanh', 'Chuẩn bị QR/link dự phòng', 'Chốt tín hiệu chuyển phần', 'Ghi chú lỗi phát sinh'].map((item) => (
                <span key={item}><CheckCircle2 size={15} /> {item}</span>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="training-operations-system-flow">
              {SYSTEM_REHEARSAL_GUIDES.map((guide) => {
                const Icon = guide.icon;
                return (
                  <article className="training-operations-system-panel" key={guide.product}>
                    <div className="training-operations-system-head">
                      <div className="training-operations-system-icon"><Icon size={22} /></div>
                      <div>
                        <h4>{guide.product}</h4>
                        <p>{guide.goal}</p>
                      </div>
                    </div>
                    <ol>
                      {guide.steps.map((step) => <li key={step}>{step}</li>)}
                    </ol>
                    <div className="training-operations-system-notes">
                      {guide.notes.map((note) => <p key={note}>{note}</p>)}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="training-operations-modal-checkline">
              <span><LogIn size={15} /> Test bằng quyền học viên</span>
              <span><LinkIcon size={15} /> Lưu link quan trọng</span>
              <span><Gamepad2 size={15} /> Thử hoạt động tương tác</span>
              <span><QrCode size={15} /> Chuẩn bị QR dự phòng</span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export function TrainingKnowledgePage() {
  const templates = useMemo(() => suniTrainingApi.listOperationTemplates(), []);
  const [mode, setMode] = useState<TrainingMode>('offline');
  const [selectedKey, setSelectedKey] = useState('');
  const [detailModalKey, setDetailModalKey] = useState<DetailModalKey | null>(null);
  const template = templates.find((item) => item.key === mode) || templates[0];
  const tasks = useMemo<DisplayTask[]>(() => {
    const baseTasks = (template?.tasks || []).map((item) => ({
      key: item.key,
      title: item.title,
      group: item.group,
      phase: item.phase as Phase,
      priority: item.priority,
      relativeDay: item.relativeDay,
      ownerRole: item.ownerRole || 'CTV vận hành',
      requiresEvidence: item.requiresEvidence,
      evidenceType: item.evidenceType || '',
      note: item.note || '',
    }));
    return [
      ...baseTasks,
      ...SUPPLEMENTAL_TIMELINE_TASKS.filter((item) => !item.modes || item.modes.includes(mode)),
    ].sort((left, right) => {
      const phaseOrder = { PRE: 0, DURING: 1, POST: 2 };
      if (phaseOrder[left.phase] !== phaseOrder[right.phase]) return phaseOrder[left.phase] - phaseOrder[right.phase];
      if (left.relativeDay !== right.relativeDay) return left.relativeDay - right.relativeDay;
      return left.key.localeCompare(right.key);
    });
  }, [mode, template]);
  const selectedTask = tasks.find((item) => item.key === selectedKey) || tasks[0] || null;
  const phaseCounts = tasks.reduce<Record<Phase, number>>((acc, item) => {
    const phase = item.phase as Phase;
    acc[phase] += 1;
    return acc;
  }, { PRE: 0, DURING: 0, POST: 0 });

  return (
    <div className="training-operations-page">
      <SectionHeader
        eye="Training vận hành đào tạo"
        title="Kiến thức training"
        subtitle="Bản trình bày flow vận hành lớp trực tiếp và hướng dẫn thao tác tổng thể trên VTraining, VDiscussion."
        actions={<TrainingTabs active="knowledge" />}
      />

      <section className="training-operations-video-section" aria-label="Video highlight khóa học">
        <div className="training-operations-video-copy">
          <Badge tone="violet">Xem trước</Badge>
          <h3>Highlight khóa học PCS</h3>
          <p>Xem nhanh bối cảnh lớp học trước khi đi vào checklist vận hành, minh chứng và thao tác hệ thống.</p>
        </div>
        <div className="training-operations-video-frame">
          <video
            controls
            playsInline
            preload="metadata"
            poster="/assets/training/pcs-highlight-training-poster.jpg"
            src="/assets/training/pcs-highlight-training.mp4"
          >
            Trình duyệt của bạn không hỗ trợ phát video.
          </video>
        </div>
      </section>

      <div className="training-operations-hero">
        <div className="training-operations-hero-copy">
          <Badge tone="violet">Vinabrain operations</Badge>
          <h3>Chuẩn hóa cách người mới nhìn một lớp đào tạo từ lúc chuẩn bị đến lúc đóng hồ sơ.</h3>
          <p>Trọng tâm là biết việc nào làm trước, việc nào cần minh chứng, thao tác ở đâu trên hệ thống và khi có phát sinh thì ghi nhận thế nào.</p>
        </div>
        <div className="training-operations-illustration" aria-label="Minh họa lớp đào tạo Vinabrain">
          <div className="training-operations-board">
            <div />
            <span>Timeline lớp</span>
            <strong>PRE · DURING · POST</strong>
          </div>
          <div className="training-operations-people">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>

      <div className="kpi-row production-insight-kpis">
        <div className="kpi tone-violet"><div className="kpi-label">Trước lớp</div><div className="kpi-value">{phaseCounts.PRE}</div><div className="kpi-sub">đầu việc chuẩn bị</div></div>
        <div className="kpi tone-purple"><div className="kpi-label">Trong lớp</div><div className="kpi-value">{phaseCounts.DURING}</div><div className="kpi-sub">đầu việc vận hành live</div></div>
        <div className="kpi tone-success"><div className="kpi-label">Sau lớp</div><div className="kpi-value">{phaseCounts.POST}</div><div className="kpi-sub">đầu việc đóng hồ sơ</div></div>
        <div className="kpi tone-warning"><div className="kpi-label">Minh chứng</div><div className="kpi-value">{tasks.filter((item) => item.requiresEvidence).length}</div><div className="kpi-sub">hạng mục cần lưu vết</div></div>
      </div>

      <Card
        title="Flow vận hành lớp theo timeline"
        action={(
          <div className="training-operations-mode">
            <button className={mode === 'offline' ? 'is-active' : ''} type="button" onClick={() => { setMode('offline'); setSelectedKey(''); }}>Lớp trực tiếp</button>
            <button className={mode === 'online' ? 'is-active' : ''} type="button" onClick={() => { setMode('online'); setSelectedKey(''); }}>Lớp trực tuyến</button>
          </div>
        )}
      >
        <div className="training-operations-flow">
          <div className="training-operations-timeline">
            {(Object.keys(PHASE_LABELS) as Phase[]).map((phase) => (
              <section className="training-operations-phase" key={phase}>
                <div className="training-operations-phase-head">
                  <Badge tone={phaseTone(phase)}>{PHASE_LABELS[phase].label}</Badge>
                  <strong>{PHASE_LABELS[phase].time}</strong>
                  <span>{PHASE_LABELS[phase].detail}</span>
                </div>
                <div className="training-operations-task-list">
                  {tasks.filter((item) => item.phase === phase).map((item) => (
                    <button
                      className={selectedTask?.key === item.key ? 'is-active' : ''}
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setSelectedKey(item.key);
                        const modalKey = DETAIL_MODAL_TASK_MAP[item.key];
                        if (modalKey) setDetailModalKey(modalKey);
                      }}
                    >
                      <span>{relativeDayLabel(item.relativeDay)}</span>
                      <strong>{item.title}</strong>
                      <small>{item.group} · {item.ownerRole}</small>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside className="training-operations-detail">
            <div className="training-operations-detail-icon"><Presentation size={22} /></div>
            <Badge tone={selectedTask?.requiresEvidence ? 'warning' : 'neutral'}>{selectedTask?.requiresEvidence ? 'Cần minh chứng' : 'Không bắt buộc minh chứng'}</Badge>
            <h4>{selectedTask?.title}</h4>
            <dl>
              <div><dt>Thời điểm</dt><dd>{selectedTask ? relativeDayLabel(selectedTask.relativeDay) : '-'}</dd></div>
              <div><dt>Nhóm việc</dt><dd>{selectedTask?.group || '-'}</dd></div>
              <div><dt>Phụ trách</dt><dd>{selectedTask?.ownerRole || '-'}</dd></div>
              <div><dt>Ưu tiên</dt><dd>{selectedTask?.priority || '-'}</dd></div>
              <div><dt>Minh chứng</dt><dd>{selectedTask?.evidenceType || 'Không bắt buộc'}</dd></div>
            </dl>
            <p>{selectedTask?.note || 'Chọn một đầu việc trong timeline để xem chi tiết.'}</p>
          </aside>
        </div>
      </Card>

      <div className="production-insight-grid is-wide">
        <Card title="Hướng dẫn vận hành hệ thống">
          <div className="training-operations-platforms">
            {PLATFORM_GUIDES.map((guide) => {
              const Icon = guide.icon;
              return (
                <article className="training-operations-platform" key={guide.product}>
                  <div className="training-operations-platform-head">
                    <Icon size={20} />
                    <div>
                      <strong>{guide.product}</strong>
                      <span>{guide.purpose}</span>
                    </div>
                  </div>
                  <ol>
                    {guide.flow.map((item) => <li key={item}>{item}</li>)}
                  </ol>
                  <div className="training-operations-note-list">
                    {guide.operatorNotes.map((item) => <p key={item}>{item}</p>)}
                  </div>
                </article>
              );
            })}
          </div>
        </Card>

        <Card title="Đề xuất thêm để đạt mục tiêu">
          <div className="training-operations-recommendations">
            <div><Sparkles size={18} /><span>Thêm ảnh chụp thật từng màn VTraining/VDiscussion theo vai trò CTV, manager và giảng viên.</span></div>
            <div><ClipboardList size={18} /><span>Chuẩn hóa checklist cuối mỗi buổi: điểm danh, ảnh lớp, khảo sát, issue log, link recording nếu có.</span></div>
            <div><BookOpenCheck size={18} /><span>Gắn mỗi bài test với rubric chấm tự luận để người mới biết thế nào là xử lý đạt chuẩn.</span></div>
            <div><CheckCircle2 size={18} /><span>Bổ sung mini-scenario theo 3 nhóm lỗi hay gặp: kỹ thuật, học viên, minh chứng nghiệm thu.</span></div>
          </div>
        </Card>
      </div>
      {detailModalKey ? <TrainingTaskDetailModal modalKey={detailModalKey} onClose={() => setDetailModalKey(null)} /> : null}
    </div>
  );
}

export function TrainingTestPage() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <div className="training-operations-page">
      <SectionHeader
        eye="Training vận hành đào tạo"
        title="Test kiến thức"
        subtitle="Khung bài kiểm tra trắc nghiệm kết hợp tự luận tình huống. Nội dung câu hỏi có thể nhập thêm sau."
        actions={<TrainingTabs active="test" />}
      />

      <form className="training-operations-test" onSubmit={handleSubmit}>
        <Card title="Cấu trúc bài test" action={<Badge tone="violet">Sẵn sàng nhập đề</Badge>}>
          <div className="training-operations-test-grid">
            {TEST_BLUEPRINT.map((item, index) => (
              <article className="training-operations-test-card" key={item.title}>
                <div className="training-operations-test-number">{String(index + 1).padStart(2, '0')}</div>
                <Badge tone={item.type === 'Trắc nghiệm' ? 'purple' : 'warning'}>{item.type}</Badge>
                <h4>{item.title}</h4>
                <p>{item.sample}</p>
                <span>{item.status}</span>
              </article>
            ))}
          </div>
        </Card>

        <Card title="Bài làm thử">
          <div className="training-operations-question">
            <label>
              <span>Câu trắc nghiệm mẫu</span>
              <select defaultValue="">
                <option value="" disabled>Chọn đáp án</option>
                <option>Kiểm tra checklist và minh chứng theo lớp</option>
                <option>Chỉ xem dashboard tổng quan</option>
                <option>Tạo lại toàn bộ chương trình</option>
              </select>
            </label>
            <label>
              <span>Tự luận tình huống mẫu</span>
              <textarea placeholder="Nhập cách xử lý tình huống vận hành lớp..." rows={6} />
            </label>
            <button className="btn btn-primary" type="submit"><FileQuestion size={16} /> Lưu bài làm nháp</button>
            {submitted ? <div className="notice success">Đã lưu nháp bài làm mẫu. Khi có bộ câu hỏi thật, phần này có thể nối thêm chấm điểm và rubric.</div> : null}
          </div>
        </Card>
      </form>
    </div>
  );
}
