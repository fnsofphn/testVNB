import { Link } from 'react-router-dom';
import { Badge, Card, Kpi, SectionHeader } from '@/components/ui/Primitives';

const KPIS = [
  {
    label: 'Tầm nhìn chung',
    value: '01',
    sub: 'Một nguồn sự thật cho toàn bộ workflow',
    tone: 'violet' as const,
  },
  {
    label: 'Nhóm người dùng',
    value: '03',
    sub: 'Admin, PM và team sản xuất cùng cộng tác',
    tone: 'success' as const,
  },
  {
    label: 'Mục tiêu vận hành',
    value: '05',
    sub: 'Rõ việc, rõ trạng thái, rõ bàn giao, rõ trách nhiệm, rõ deadline',
    tone: 'warning' as const,
  },
];

const OPERATING_PRINCIPLES = [
  'Mọi thông tin quan trọng phải được cập nhật trên hệ thống, không dựa vào chat rời rạc.',
  'Không chuyển bước nếu chưa đủ điều kiện đầu vào và đầu ra.',
  'Mỗi trạng thái cần có ý nghĩa vận hành thực tế: đang làm, chờ duyệt, cần bổ sung, đã xác nhận.',
  'Mỗi lần bàn giao cần có file, ghi chú và dấu vết rõ ràng.',
  'Phân quyền đúng giúp quy trình sạch, tránh thao tác nhầm và giữ chuẩn làm việc.',
];

const ROLE_GUIDE = [
  {
    title: 'Admin',
    tone: 'violet' as const,
    points: [
      'Quản lý người dùng, role, access scope.',
      'Theo dõi sức khỏe quy trình và điểm nghẽn.',
      'Chuẩn hóa cách dùng trạng thái và quy ước thao tác.',
      'Hỗ trợ PM khi cần điều phối nhân lực hoặc xử lý tắc nghẽn.',
    ],
  },
  {
    title: 'PM / Điều phối',
    tone: 'warning' as const,
    points: [
      'Tiếp nhận đơn hàng, kiểm tra intake và xác nhận điều kiện launch.',
      'Theo dõi product theo từng bước thay vì theo cảm tính.',
      'Yêu cầu bổ sung đúng chỗ, đúng nội dung, đúng trách nhiệm.',
      'Kết nối đội sản xuất, QC, bàn giao và thanh toán trên cùng một luồng.',
    ],
  },
  {
    title: 'Team sản xuất',
    tone: 'success' as const,
    points: [
      'Chỉ bắt đầu khi đầu vào đã rõ và đủ.',
      'Mỗi lần submit phải kèm ghi chú ngắn gọn, đúng trọng tâm.',
      'Cập nhật trạng thái ngay khi công việc thay đổi.',
      'Nếu bị chặn, cần ghi rõ lý do chặn để PM và Admin xử lý nhanh.',
    ],
  },
];

const FLOW_STEPS = [
  {
    code: '01',
    title: 'Tiếp nhận và chuẩn hóa input',
    detail: 'PM kiểm tra đầu vào, mục bắt buộc, file, ghi chú và điều kiện launch.',
  },
  {
    code: '02',
    title: 'Chuyển vào sản xuất',
    detail: 'Khi đủ điều kiện, PM xác nhận đi tiếp và team nhận đúng bước.',
  },
  {
    code: '03',
    title: 'Xử lý chuyên môn theo workflow',
    detail: 'Mỗi nhóm cập nhật tiến độ, nộp file, ghi chú và bàn giao đúng trạng thái.',
  },
  {
    code: '04',
    title: 'QC và phản hồi',
    detail: 'QC lưu rõ pass, fail hoặc changes requested để đội ngũ cùng nói chung một ngôn ngữ.',
  },
  {
    code: '05',
    title: 'Bàn giao, nghiệm thu, thanh toán',
    detail: 'PM theo dõi package bàn giao, payment request và xác nhận đối soát trên cùng hệ thống.',
  },
];

const DISCIPLINE_ITEMS = [
  'Không làm việc ngoài luồng khi hệ thống đã có màn xử lý phù hợp.',
  'Mỗi task hoặc product đều phải có người chịu trách nhiệm rõ.',
  'Khi cần bổ sung, phải nói rõ bổ sung cái gì, ai bổ sung, trước khi nào.',
  'Mọi file quan trọng đều nên gắn với product và bước đúng trên phần mềm.',
  'Admin, PM và team sản xuất cùng theo một chuẩn trạng thái để dashboard có giá trị thật.',
];

export function GuidePage() {
  return (
    <>
      <SectionHeader
        eye="Hệ thống nội bộ"
        title="Cẩm nang HDSD phần mềm"
        subtitle="Tài liệu dành cho Admin, PM và team sản xuất để cộng tác hiệu quả, giữ workflow sạch, giảm thất lạc thông tin và tăng tốc độ bàn giao."
        actions={
          <>
            <Link className="btn btn-ghost" to="/production-workflow">
              Xem workflow
            </Link>
            <Link className="btn btn-danger" to="/dashboard">
              Về tổng quan
            </Link>
          </>
        }
      />

      <div className="kpi-row small">
        {KPIS.map((item) => (
          <Kpi key={item.label} {...item} />
        ))}
      </div>

      <div className="content-grid guide-grid">
        <Card title="Mục tiêu của phần mềm" action={<Badge tone="violet">Nội bộ</Badge>}>
          <div className="stack compact">
            <div className="bullet-item">
              VContent 3.0 là trung tâm cộng tác chung cho intake, sản xuất, QC, bàn giao và thanh toán.
            </div>
            <div className="bullet-item">
              Hệ thống giúp mỗi vai trò biết rõ mình đang ở bước nào, cần làm gì và cần bàn giao cho ai.
            </div>
            <div className="bullet-item">
              Giá trị lớn nhất không nằm ở số lượng màn hình, mà nằm ở việc chuẩn hóa cách phối hợp giữa Admin, PM và team sản xuất.
            </div>
          </div>
        </Card>

        <Card title="Nguyên tắc vận hành">
          <div className="stack compact">
            {OPERATING_PRINCIPLES.map((item) => (
              <div key={item} className="bullet-item">
                {item}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="content-grid guide-grid">
        <Card title="Cách các vai trò cộng tác với nhau">
          <div className="guide-role-grid">
            {ROLE_GUIDE.map((role) => (
              <div key={role.title} className="guide-role-card">
                <div className="guide-role-head">
                  <h4>{role.title}</h4>
                  <Badge tone={role.tone}>{role.title}</Badge>
                </div>
                <div className="stack compact">
                  {role.points.map((point) => (
                    <div key={point} className="bullet-item">
                      {point}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="content-grid guide-grid">
        <Card title="Luồng cộng tác chuẩn">
          <div className="guide-flow-grid">
            {FLOW_STEPS.map((step) => (
              <div key={step.code} className="guide-flow-step">
                <div className="guide-flow-code">{step.code}</div>
                <div className="guide-flow-content">
                  <h4>{step.title}</h4>
                  <p>{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Kỷ luật sử dụng để vận hành hiệu quả" action={<Badge tone="success">Best practice</Badge>}>
          <div className="stack compact">
            {DISCIPLINE_ITEMS.map((item) => (
              <div key={item} className="bullet-item">
                {item}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
