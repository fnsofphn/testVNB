import type { StudentSurveyDisplaySettings, StudentSurveyQuestion } from '@/lib/studentSurvey';
import type { SurveySectionDefinition, SurveyTypeDefinition } from '@/modules/surveys/surveyTypes';

type ChoiceInput = {
  sectionId: string;
  sectionTitle: string;
  code: string;
  prompt: string;
  options: string[];
  multiple?: boolean;
  required?: boolean;
  hint?: string;
  maxSelections?: number;
  groupTitle?: string;
};

type TextInput = {
  sectionId: string;
  sectionTitle: string;
  code: string;
  prompt: string;
  required?: boolean;
  hint?: string;
  groupTitle?: string;
  placeholder?: string;
};

type ProgramDefinition = {
  id: 'vnpt-heart-ws2' | 'vnpt-heart-dt1' | 'vnpt-heart-dt2';
  label: string;
  defaultFormCode: string;
  defaultFormTitle: string;
  bannerTitle: string;
  bannerSubtitle: string;
  greeting: string;
  programName: string;
  respondentLine: string;
  part2Count: number;
  totalCount: number;
  duration: string;
  deadline: string;
  part2Questions: StudentSurveyQuestion[];
};

const HEART_PRIMARY = '#123a8f';
const HEART_ACCENT = '#f97316';
const SCALE_5 = ['1', '2', '3', '4', '5'];

function slug(code: string) {
  return code.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function section(id: string, title: string, description = ''): SurveySectionDefinition {
  return { id, title, description };
}

function textQuestion(input: TextInput): StudentSurveyQuestion {
  return {
    id: slug(input.code),
    code: input.code,
    prompt: input.prompt,
    type: 'text',
    required: input.required ?? true,
    sectionId: input.sectionId,
    sectionTitle: input.sectionTitle,
    groupTitle: input.groupTitle,
    hint: input.hint,
    placeholder: input.placeholder || 'Nhập câu trả lời...',
  };
}

function choiceQuestion(input: ChoiceInput): StudentSurveyQuestion {
  return {
    id: slug(input.code),
    code: input.code,
    prompt: input.prompt,
    type: input.multiple ? 'multiple' : 'single',
    required: input.required ?? true,
    sectionId: input.sectionId,
    sectionTitle: input.sectionTitle,
    groupTitle: input.groupTitle,
    hint: input.hint,
    maxSelections: input.maxSelections,
    options: input.options.map((label) => ({ value: label, label })),
  };
}

function matrixQuestion(code: string, prompt: string): StudentSurveyQuestion {
  return {
    id: slug(code),
    code,
    prompt,
    type: 'rating',
    required: true,
    sectionId: 'role',
    sectionTitle: ROLE_SECTION.title,
    groupTitle: 'Câu 8 - Mức độ tồn tại hạn chế về văn hóa làm việc',
    hint:
      '1 = Hầu như không tồn tại\n2 = Có tồn tại nhưng rất ít, chưa ảnh hưởng rõ\n3 = Tồn tại ở mức trung bình, có ảnh hưởng trong một số tình huống\n4 = Tồn tại khá rõ, ảnh hưởng thường xuyên đến công việc\n5 = Tồn tại rất rõ, cần ưu tiên cải thiện ngay',
    options: SCALE_5.map((label) => ({ value: label, label })),
  };
}

const COMMON_SECTION = section(
  'common',
  'Phần 1 - Câu hỏi chung',
  'Khảo sát thông tin nền và mức độ tiếp cận văn hóa VNPT của mọi học viên trước khi vào nội dung riêng của từng khóa.',
);

const ROLE_SECTION = section(
  'role',
  'Phần 2 - Nhu cầu, hiện trạng và thu thập tình huống',
  'Khảo sát nhu cầu, hiện trạng và thực tế công việc gắn với bộ tài liệu văn hóa cần phổ biến.',
);

const COMMON_GROUP_A = 'A. Thông tin học viên';
const COMMON_GROUP_B = 'B. Mức độ tiếp cận và nhận thức về Văn hóa VNPT';

const COMMON_QUESTIONS: StudentSurveyQuestion[] = [
  choiceQuestion({
    sectionId: COMMON_SECTION.id,
    sectionTitle: COMMON_SECTION.title,
    groupTitle: COMMON_GROUP_A,
    code: 'Q01',
    prompt: 'Đơn vị công tác của Anh/Chị?',
    options: [
      'Các Ban/Phòng chức năng/Trung tâm trực thuộc Tập đoàn',
      'Tổng công ty Dịch vụ viễn thông (VNPT-Vinaphone)',
      'Tổng công ty Truyền thông (VNPT-Media)',
      'Tổng công ty Hạ tầng mạng (VNPT-Net)',
      'Công ty Công nghệ thông tin VNPT (VNPT-IT)',
      'Công ty Viễn thông Quốc tế (VNPT-I)',
      'Công ty VNPT AI',
      'VNPT Tỉnh/Thành phố (34 đơn vị)',
      'Đơn vị khác (ghi rõ)',
    ],
  }),
  choiceQuestion({
    sectionId: COMMON_SECTION.id,
    sectionTitle: COMMON_SECTION.title,
    groupTitle: COMMON_GROUP_A,
    code: 'Q02',
    prompt: 'Khối/lĩnh vực công việc chính của Anh/Chị?',
    options: [
      'Kinh doanh/Dịch vụ khách hàng/Chăm sóc khách hàng',
      'Kỹ thuật trực tiếp xử lý dịch vụ khách hàng',
      'Vận hành kỹ thuật hạ tầng (mạng lưới, hệ thống)',
      'Công nghệ thông tin/phát triển sản phẩm số',
      'Chuyên môn nghiệp vụ (hành chính, tài chính, kế toán, nhân sự, pháp chế, hỗ trợ nội bộ)',
    ],
  }),
  choiceQuestion({
    sectionId: COMMON_SECTION.id,
    sectionTitle: COMMON_SECTION.title,
    groupTitle: COMMON_GROUP_B,
    code: 'Q03',
    prompt:
      'Anh/Chị đã từng tiếp cận Bộ tài liệu Văn hóa VNPT (Triết lý - Sứ mệnh - Tầm nhìn 2035, 5 giá trị HEART, 12 Nguyên tắc hành động, Bộ Chuẩn mực hành vi & Quy tắc ứng xử) ở mức độ nào?',
    options: [
      'Chưa từng nghe/đọc qua',
      'Đã nghe nhưng chưa đọc tài liệu',
      'Đã đọc lướt qua',
      'Đã đọc kỹ và hiểu nhưng không nhớ rõ',
      'Đã đọc kỹ, hiểu và nhớ một số nội dung tâm đắc',
      'Đã đọc kỹ, hiểu và nhớ đầy đủ nội dung',
    ],
  }),
  choiceQuestion({
    sectionId: COMMON_SECTION.id,
    sectionTitle: COMMON_SECTION.title,
    groupTitle: COMMON_GROUP_B,
    code: 'Q04',
    prompt:
      'Anh/Chị tự đánh giá mức độ HIỂU nội hàm 5 giá trị cốt lõi HEART (Hợp tác cùng vươn cao - Thấu hiểu & Chia sẻ - Sáng tạo không giới hạn - Phụng sự để kiến tạo - Khách hàng là trái tim)?',
    options: ['Chưa hiểu', 'Hiểu mơ hồ', 'Hiểu cơ bản', 'Hiểu khá rõ', 'Hiểu sâu và liên hệ được vào công việc'],
  }),
  choiceQuestion({
    sectionId: COMMON_SECTION.id,
    sectionTitle: COMMON_SECTION.title,
    groupTitle: COMMON_GROUP_B,
    code: 'Q05',
    prompt: 'Theo Anh/Chị, khó khăn LỚN NHẤT khi đưa văn hóa VNPT vào công việc hằng ngày là gì?',
    options: [
      'Hiểu để áp dụng đúng các nội dung văn hóa',
      'Thiếu sự quan tâm của Quản lý cấp trên',
      'Chưa thấy lợi ích thiết thực với công việc của mình',
      'Đồng nghiệp/đơn vị xung quanh chưa cùng thực hiện',
      'Thiếu ví dụ, tình huống mẫu sát thực tế',
      'Lý do khác (ghi rõ)',
    ],
    multiple: true,
    maxSelections: 3,
    hint: 'Chọn tối đa 03',
  }),
  textQuestion({
    sectionId: COMMON_SECTION.id,
    sectionTitle: COMMON_SECTION.title,
    groupTitle: COMMON_GROUP_B,
    code: 'Q06',
    prompt: 'Anh/Chị mong muốn khóa học giúp giải quyết được vấn đề/tình huống công việc cụ thể nào nhất?',
    hint:
      'Tối đa 100 từ\nGợi ý:\nTình huống thường gặp khiến Anh/Chị lúng túng hoặc mất nhiều thời gian xử lý\nLoại quan hệ công việc mong muốn cải thiện (với khách hàng/đồng nghiệp/cấp trên/cấp dưới)\nKỹ năng hoặc chuẩn mực hành vi cụ thể muốn được hướng dẫn',
  }),
];

const ws2RoleQuestions: StudentSurveyQuestion[] = [
  choiceQuestion({
    sectionId: ROLE_SECTION.id,
    sectionTitle: ROLE_SECTION.title,
    groupTitle: 'A. Nhu cầu quan tâm và hiện trạng theo nội dung bộ tài liệu văn hóa',
    code: 'Q07',
    prompt: 'Trong các nội dung sau, nội dung nào Anh/Chị mong muốn được hiểu sâu nhất về các nội dung văn hóa VNPT trong vai trò NSQL cấp 3?',
    options: [
      'Triết lý “Kết nối và Cộng hưởng”, Sứ mệnh, Tầm nhìn 2035',
      '5 giá trị cốt lõi HEART và cách áp dụng vào quyết định quản trị',
      '5 Tư duy kiến tạo và 12 Nguyên tắc hành động',
      'Bộ Chuẩn mực hành vi & Quy tắc ứng xử của NSQL cấp 3',
      '4 định hướng tăng cường năng lực lãnh đạo, quản trị tại đơn vị',
      '8 khâu quản trị có ảnh hưởng trực tiếp đến văn hóa',
      'Vai trò của NSQL cấp 3 và các công cụ (nêu gương, đối thoại, ghi nhận, phản hồi)',
    ],
    multiple: true,
    maxSelections: 3,
    hint: 'Chọn tối đa 03',
  }),
  ...[
    'Tâm lý ngại thay đổi, còn quen với cách làm cũ, chưa chủ động thích ứng với yêu cầu mới',
    'Phối hợp giữa các phòng ban, đơn vị chưa thực sự nhịp nhàng, còn tình trạng "việc ai người đó làm"',
    'Chưa mạnh dạn góp ý, phản biện hoặc nêu ý kiến khác biệt trong công việc',
    'Tinh thần chủ động nhận việc, nhận trách nhiệm và theo đuổi công việc đến cùng chưa cao',
    'Chia sẻ thông tin, kinh nghiệm và bài học giữa các cá nhân, bộ phận còn hạn chế',
    'Một số công việc còn xử lý theo thói quen hoặc kinh nghiệm cá nhân, chưa dựa nhiều vào dữ liệu và quy trình thống nhất',
    'Việc lấy khách hàng làm trung tâm chưa thực sự rõ nét trong mọi hoạt động',
    'Hoạt động ghi nhận, động viên và lan tỏa các hành vi tích cực chưa được thực hiện thường xuyên và kịp thời',
  ].map((prompt, index) => matrixQuestion(`Q08-${index + 1}`, prompt)),
  choiceQuestion({
    sectionId: ROLE_SECTION.id,
    sectionTitle: ROLE_SECTION.title,
    groupTitle: 'A. Nhu cầu quan tâm và hiện trạng theo nội dung bộ tài liệu văn hóa',
    code: 'Q09',
    prompt: 'Trong 8 khâu quản trị, khâu nào Anh/Chị thấy KHÓ vận dụng văn hóa nhất?',
    options: [
      'Giao mục tiêu',
      'Đánh giá kết quả',
      'Phối hợp liên đơn vị',
      'Ra quyết định',
      'Quản trị tiêu chuẩn chất lượng đầu ra',
      'Quản lý và chăm sóc khách hàng',
      'Công tác quản lý nhân sự',
      'Khen thưởng/ghi nhận',
    ],
    multiple: true,
    maxSelections: 3,
    hint: 'Chọn tối đa 03',
  }),
  textQuestion({
    sectionId: ROLE_SECTION.id,
    sectionTitle: ROLE_SECTION.title,
    groupTitle: 'B. Câu hỏi thu thập tình huống thực tế sâu (NSQL cấp 3)',
    code: 'Q10',
    prompt:
      'GIẢI QUYẾT CÔNG VIỆC: Hãy kể một tình huống quản trị gần đây mà Anh/Chị thấy khó khi muốn vừa đảm bảo tiến độ/kết quả, vừa giữ 5 giá trị văn hóa cốt lõi của VNPT',
    hint:
      'Tối đa 200 từ\nGợi ý:\nBối cảnh tình huống: việc gì, áp lực nào (thời gian, chất lượng, nguồn lực)?\nAnh/Chị hoặc đơn vị Anh/Chị đã quyết định và xử lý ra sao?\nKết quả thế nào?\nĐiều gì đã khiến Anh/Chị băn khoăn nhất?\nNếu được hướng dẫn theo 5 giá trị cốt lõi HEART của VNPT thì Anh/Chị mong muốn xử lý khác đi ở điểm nào?',
  }),
  textQuestion({
    sectionId: ROLE_SECTION.id,
    sectionTitle: ROLE_SECTION.title,
    groupTitle: 'B. Câu hỏi thu thập tình huống thực tế sâu (NSQL cấp 3)',
    code: 'Q11',
    prompt:
      'QUAN HỆ VỚI KHÁCH HÀNG: Mô tả một tình huống phản hồi/khiếu nại của khách hàng có liên quan đến nhiều bộ phận mà đơn vị Anh/Chị phải xử lý. Lưu ý, bao gồm cả khách hàng là khách hàng nội bộ.',
    hint:
      'Tối đa 200 từ\nGợi ý:\nBối cảnh tình huống: việc gì, áp lực nào (thời gian, yêu cầu khách hàng)?\nKhách hàng phản ánh điều gì, liên quan đến những bộ phận/đơn vị nào?\nViệc phối hợp liên đơn vị đã diễn ra thuận lợi hay vướng ở đâu?\nCó xảy ra tình trạng đùn đẩy không?\nKết quả thế nào?\nBài học rút ra về phối hợp để thực sự sống và làm việc với giá trị “khách hàng là trái tim” của VNPT?',
  }),
  textQuestion({
    sectionId: ROLE_SECTION.id,
    sectionTitle: ROLE_SECTION.title,
    groupTitle: 'B. Câu hỏi thu thập tình huống thực tế sâu (NSQL cấp 3)',
    code: 'Q12',
    prompt:
      'QUAN HỆ VỚI ĐỒNG NGHIỆP/ĐƠN VỊ NGANG CẤP: Kể một lần phối hợp liên phòng/liên đơn vị gặp trục trặc (thông tin không thống nhất, bàn giao thiếu, tư duy “việc của tôi - việc của họ”)',
    hint:
      'Tối đa 200 từ\nGợi ý:\nBối cảnh tình huống\nTrục trặc cụ thể là gì và xuất phát từ đâu?\nCó dấu hiệu “cát cứ”, thiếu hợp tác - phối hợp, hay không thống nhất quy trình không?\nAnh/Chị đã làm gì để tháo gỡ?\nKết quả thế nào?\nCần cơ chế hay nguyên tắc ứng xử nào để tránh lặp lại?',
  }),
  textQuestion({
    sectionId: ROLE_SECTION.id,
    sectionTitle: ROLE_SECTION.title,
    groupTitle: 'B. Câu hỏi thu thập tình huống thực tế sâu (NSQL cấp 3)',
    code: 'Q13',
    prompt: 'QUAN HỆ VỚI CẤP TRÊN: Mô tả một tình huống Anh/Chị có quan điểm khác với chỉ đạo của cấp trên về một vấn đề liên quan đến văn hóa hoặc cách làm',
    hint:
      'Tối đa 200 từ\nGợi ý:\nBối cảnh tình huống: vấn đề là gì, quan điểm của Anh/Chị khác ở chỗ nào?\nAnh/Chị đã trình bày/phản biện ra sao và kết quả thế nào?\nĐiều gì khiến việc trao đổi với cấp trên trở nên khó hoặc dễ?\nAnh/Chị mong được hướng dẫn thêm như thế nào?',
  }),
  textQuestion({
    sectionId: ROLE_SECTION.id,
    sectionTitle: ROLE_SECTION.title,
    groupTitle: 'B. Câu hỏi thu thập tình huống thực tế sâu (NSQL cấp 3)',
    code: 'Q14',
    prompt: 'QUAN HỆ VỚI CẤP DƯỚI: Kể một tình huống Anh/Chị phải uốn nắn/điều chỉnh hành vi chưa đúng chuẩn mực của một CBNV trong đơn vị',
    hint:
      'Tối đa 200 từ\nGợi ý:\nBối cảnh tình huống\nHành vi chưa đúng chuẩn mực là gì, ảnh hưởng ra sao?\nAnh/Chị đã phản hồi/uốn nắn bằng cách nào (đối thoại, làm gương, công nhận...)?\nPhản ứng của nhân viên và kết quả thay đổi?\nAnh/Chị thấy hoặc mong muốn mình cần làm tốt điều gì hơn khi xử lý các tình huống tương tự?',
  }),
];

const dt1RoleQuestions: StudentSurveyQuestion[] = [
  choiceQuestion({
    sectionId: ROLE_SECTION.id,
    sectionTitle: ROLE_SECTION.title,
    groupTitle: 'A. Nhu cầu quan tâm và hiện trạng theo nội dung bộ tài liệu văn hóa',
    code: 'Q07',
    prompt: 'Trong các nội dung sau, nội dung nào Anh/Chị thấy cần được hướng dẫn cụ thể nhất cho công việc tại tổ/đội?',
    options: [
      '5 giá trị cốt lõi HEART gắn với việc tại tổ/đội',
      '12 Nguyên tắc hành động',
      'Bộ Chuẩn mực hành vi & Quy tắc ứng xử của Tổ trưởng',
      'Cách lồng văn hóa vào 5 thời điểm trọng yếu trong ngày (đầu ca, giao việc, xử lý tình huống, kết ca, ghi nhận)',
      'Quy tắc phối hợp liên tổ/đội/khối theo OneVNPT',
      'Kỷ luật - An toàn - Trách nhiệm và giữ gìn hình ảnh VNPT',
    ],
    multiple: true,
    maxSelections: 3,
    hint: 'Chọn tối đa 03',
  }),
  choiceQuestion({
    sectionId: ROLE_SECTION.id,
    sectionTitle: ROLE_SECTION.title,
    groupTitle: 'A. Nhu cầu quan tâm và hiện trạng theo nội dung bộ tài liệu văn hóa',
    code: 'Q08',
    prompt: 'Trong 5 thời điểm văn hóa trọng yếu trong ngày, thời điểm nào Anh/Chị thấy khó duy trì đúng chuẩn mực nhất?',
    options: ['Đầu ca làm việc', 'Giao việc cho đội ngũ cấp dưới', 'Xử lý tình huống/sự cố', 'Kết thúc ca làm việc', 'Ghi nhận kết quả và các vấn đề để rút kinh nghiệm cho ca làm việc tiếp theo'],
  }),
  choiceQuestion({
    sectionId: ROLE_SECTION.id,
    sectionTitle: ROLE_SECTION.title,
    groupTitle: 'A. Nhu cầu quan tâm và hiện trạng theo nội dung bộ tài liệu văn hóa',
    code: 'Q09',
    prompt: 'Hiện nay Anh/Chị có dành thời gian để chấn chỉnh hoặc ghi nhận, khen thưởng đội ngũ liên quan đến các nội dung văn hóa làm việc, chuẩn mực hành vi, quy tắc ứng xử không?',
    options: ['Chưa bao giờ', 'Thỉnh thoảng khi có việc', 'Hằng tuần nhưng chưa đều', 'Đều đặn hằng tuần'],
  }),
  choiceQuestion({
    sectionId: ROLE_SECTION.id,
    sectionTitle: ROLE_SECTION.title,
    groupTitle: 'A. Nhu cầu quan tâm và hiện trạng theo nội dung bộ tài liệu văn hóa',
    code: 'Q10',
    prompt: 'Khi phát hiện thành viên trong tổ có hành vi chưa đúng chuẩn mực, Anh/Chị thường làm gì?',
    options: ['Bỏ qua vì ngại va chạm', 'Nhắc nhẹ chung chung', 'Góp ý riêng trực tiếp', 'Góp ý và theo dõi điều chỉnh đến cùng', 'Nhắc trước toàn thể mọi người để cùng rút kinh nghiệm'],
  }),
  ...[
    ['Q11', 'GIẢI QUYẾT CÔNG VIỆC: Kể một tình huống tại tổ/đội mà Anh/Chị phải xử lý nhanh một sự cố hoặc việc phát sinh ngoài kế hoạch trong ca làm việc', 'Sự cố/việc phát sinh là gì, xảy ra trong hoàn cảnh nào?\nAnh/Chị xử lý theo các bước nào, có theo quy trình thống nhất không?\nKhó khăn lớn nhất khi vừa xử lý nhanh vừa làm đúng chuẩn?\nHành vi/kỹ năng cụ thể nào Anh/Chị muốn được hướng dẫn để làm tốt hơn?'],
    ['Q12', 'QUAN HỆ VỚI KHÁCH HÀNG: Mô tả một tình huống thành viên trong tổ tiếp xúc/phục vụ khách hàng tại hiện trường (hoặc tại quầy) mà cách ứng xử ảnh hưởng đến hình ảnh VNPT', 'Tình huống diễn ra ở đâu (tại nhà khách hàng, cửa hàng, qua điện thoại...)?\nHành vi/tác phong nào của nhân viên là điểm tốt hoặc chưa đạt?\nKhách hàng phản ứng ra sao, Anh/Chị đã can thiệp/uốn nắn thế nào?\nChuẩn mực hành vi cụ thể nào cần nhấn mạnh để “đại sứ VNPT” làm đúng?'],
    ['Q13', 'QUAN HỆ VỚI ĐỒNG NGHIỆP/LIÊN TỔ: Kể một lần tổ/đội của Anh/Chị phải phối hợp với tổ/đội/khối khác và xảy ra trục trặc trong bàn giao hoặc phối hợp', 'Việc cần phối hợp là gì, bàn giao/phối hợp vướng ở đâu?\nCó biểu hiện “việc của tôi - việc của họ” không?\nẢnh hưởng đến khách hàng hoặc kết quả chung như thế nào?\nCần quy tắc phối hợp OneVNPT nào để tránh tái diễn?'],
    ['Q14', 'QUAN HỆ VỚI CẤP TRÊN: Mô tả một tình huống Anh/Chị nhận chỉ đạo/giao việc từ cấp trên nhưng gặp khó khi triển khai xuống tổ/đội', 'Chỉ đạo/việc được giao là gì, khó ở khâu nào khi triển khai?\nAnh/Chị đã báo cáo, đề xuất hay phản hồi lại cấp trên thế nào?\nThông tin từ trên xuống có rõ ràng, kịp thời không?\nAnh/Chị mong được hỗ trợ gì để “chuyển” chỉ đạo thành hành động tại tổ?'],
    ['Q15', 'QUAN HỆ VỚI CẤP DƯỚI: Kể một tình huống Anh/Chị giao việc, phản hồi hoặc ghi nhận một thành viên trong tổ mà kết quả chưa như mong muốn', 'Anh/Chị giao việc/phản hồi/ghi nhận trong bối cảnh nào?\nThông tin giao việc có đủ (mục tiêu, thời hạn, tiêu chí) không?\nPhản ứng và động lực của thành viên thay đổi ra sao?\nAnh/Chị thấy cần cải thiện hành vi cụ thể nào khi dẫn dắt tổ/đội?'],
  ].map(([code, prompt, hint]) =>
    textQuestion({
      sectionId: ROLE_SECTION.id,
      sectionTitle: ROLE_SECTION.title,
      groupTitle: 'B. Năm câu hỏi thu thập tình huống thực tế sâu (Tổ trưởng/Đội trưởng/Cán bộ quản lý trực tiếp)',
      code,
      prompt,
      hint: `Tối đa 200 từ\nGợi ý:\n${hint}`,
    }),
  ),
];

const dt2RoleQuestions: StudentSurveyQuestion[] = [
  choiceQuestion({
    sectionId: ROLE_SECTION.id,
    sectionTitle: ROLE_SECTION.title,
    groupTitle: 'A. Nhu cầu quan tâm và hiện trạng theo nội dung bộ tài liệu văn hóa',
    code: 'Q07',
    prompt: 'Trong các nội dung sau, nội dung nào Anh/Chị thấy cần ưu tiên để áp dụng vào công việc hằng ngày của mình?',
    options: [
      'Triết lý - Sứ mệnh - Tầm nhìn 2035',
      '5 giá trị cốt lõi HEART',
      'Các chuẩn mực hành vi & quy tắc ứng xử gắn với vị trí công việc của tôi',
      'Cách ứng xử tại điểm chạm với khách hàng',
      'Quy tắc phối hợp nội bộ theo OneVNPT',
      '12 Nguyên tắc hành động',
      'Lời hứa và cam kết của Người VNPT',
    ],
    multiple: true,
    maxSelections: 3,
    hint: 'Chọn tối đa 03',
  }),
  choiceQuestion({
    sectionId: ROLE_SECTION.id,
    sectionTitle: ROLE_SECTION.title,
    groupTitle: 'A. Nhu cầu quan tâm và hiện trạng theo nội dung bộ tài liệu văn hóa',
    code: 'Q08',
    prompt: 'Công việc của Anh/Chị có thường xuyên tiếp xúc trực tiếp với khách hàng không?',
    options: ['Tiếp xúc khách hàng hằng ngày (giao dịch viên, kỹ thuật viên tại nhà khách hàng...)', 'Thỉnh thoảng tiếp xúc khách hàng', 'Hầu như không tiếp xúc khách hàng (vận hành nội bộ, chuyên môn nghiệp vụ...)'],
  }),
  choiceQuestion({
    sectionId: ROLE_SECTION.id,
    sectionTitle: ROLE_SECTION.title,
    groupTitle: 'A. Nhu cầu quan tâm và hiện trạng theo nội dung bộ tài liệu văn hóa',
    code: 'Q09',
    prompt: 'Anh/Chị tự đánh giá mức độ rõ ràng về “những hành vi cụ thể cần làm/không nên làm” tại vị trí công việc của mình theo chuẩn mực VNPT?',
    options: ['Chưa rõ ràng', 'Mơ hồ', 'Tương đối rõ ràng', 'Khá rõ ràng', 'Rất rõ ràng'],
  }),
  choiceQuestion({
    sectionId: ROLE_SECTION.id,
    sectionTitle: ROLE_SECTION.title,
    groupTitle: 'A. Nhu cầu quan tâm và hiện trạng theo nội dung bộ tài liệu văn hóa',
    code: 'Q10',
    prompt: 'Điều gì khiến Anh/Chị thấy khó áp dụng văn hóa/chuẩn mực vào công việc hằng ngày nhất?',
    options: ['Áp lực công việc, khối lượng nhiều', 'Chưa có ví dụ/tình huống sát vị trí của tôi', 'Quy trình, công cụ chưa thuận tiện', 'Đồng nghiệp/môi trường xung quanh chưa cùng làm', 'Chưa được hướng dẫn cụ thể'],
    multiple: true,
    maxSelections: 3,
    hint: 'Chọn tối đa 03',
  }),
  ...[
    ['Q11', 'GIẢI QUYẾT CÔNG VIỆC: Kể một tình huống công việc hằng ngày mà Anh/Chị thấy lúng túng không biết cách xử lý nào là “đúng chuẩn” theo văn hóa VNPT', 'Việc cụ thể là gì, thuộc khối/lĩnh vực nào của Anh/Chị?\nAnh/Chị đã xử lý ra sao và vì sao thấy lúng túng?\nKết quả thế nào?\nAnh/Chị mong khóa học chỉ rõ hành vi cụ thể nào nên làm trong tình huống này?'],
    ['Q12', 'QUAN HỆ VỚI KHÁCH HÀNG: Mô tả một tình huống Anh/Chị phục vụ/tương tác với khách hàng (trực tiếp, qua tổng đài, kênh số) khiến Anh/Chị nhớ nhất', 'Tình huống diễn ra ở đâu, khách hàng cần gì?\nAnh/Chị đã ứng xử, lắng nghe, cam kết và thực hiện ra sao?\nKhách hàng hài lòng hay chưa, vì sao?\nBài học về “khách hàng là trái tim” rút ra là gì?\nNếu công việc không tiếp xúc khách hàng, hãy nêu tình huống phục vụ “khách hàng nội bộ” - đồng nghiệp/đơn vị khác.'],
    ['Q13', 'QUAN HỆ VỚI ĐỒNG NGHIỆP: Kể một tình huống Anh/Chị phối hợp với đồng nghiệp/bộ phận khác mà gặp khó khăn hoặc ngược lại rất suôn sẻ', 'Việc cần phối hợp là gì?\nThông tin, bàn giao, hỗ trợ giữa hai bên diễn ra thế nào?\nĐiều gì làm nên trục trặc hoặc sự suôn sẻ?\nTheo Anh/Chị, hành vi nào giúp phối hợp tốt hơn theo tinh thần “Cùng làm - Cùng học - Cùng tiến”?'],
    ['Q14', 'QUAN HỆ VỚI CẤP TRÊN: Mô tả một tình huống Anh/Chị nhận việc từ cấp trên/tổ trưởng/đội trưởng nhưng chưa rõ yêu cầu hoặc gặp vướng khi thực hiện', 'Việc được giao là gì, chỗ chưa rõ/vướng nằm ở đâu?\nAnh/Chị đã hỏi lại, báo cáo hay tự xoay sở?\nViệc trao đổi với cấp trên thuận lợi hay e ngại, vì sao?\nAnh/Chị mong cách giao việc - phản hồi giữa hai bên được cải thiện ra sao?'],
    ['Q15', 'MÔI TRƯỜNG & HÌNH ẢNH VNPT: Kể một tình huống mà cách ứng xử của bản thân hoặc đồng nghiệp đã hoặc sắp có nguy cơ ảnh hưởng đến hình ảnh, uy tín của VNPT', 'Tình huống là gì, diễn ra trước khách hàng/đối tác hay nội bộ?\nHành vi nào là tích cực, hành vi nào chưa phù hợp?\nHệ quả thực tế hoặc nguy cơ là gì?\nTheo Anh/Chị, cần nhắc nhở/đào tạo điều gì để mỗi người “đại diện cho hình ảnh VNPT” đúng cách?'],
  ].map(([code, prompt, hint]) =>
    textQuestion({
      sectionId: ROLE_SECTION.id,
      sectionTitle: ROLE_SECTION.title,
      groupTitle: 'B. Năm câu hỏi thu thập tình huống thực tế sâu',
      code,
      prompt,
      hint: `Tối đa 200 từ\nGợi ý:\n${hint}`,
    }),
  ),
];

function makeIntro(definition: ProgramDefinition) {
  return `${definition.greeting}

Để chuẩn bị cho chương trình đào tạo về "${definition.programName}", Tập đoàn và Ban tổ chức khoá học rất mong nhận được những ý kiến chia sẻ từ các Anh Chị về thực tiễn xoay quanh các nội dung văn hóa tại đơn vị.

Ý kiến chia sẻ của các Anh Chị chính là dữ liệu đầu vào quan trọng và cần thiết để chúng tôi có căn cứ xây dựng và hoàn thiện nội dung chương trình đào tạo trúng và đúng với thực tế, nhu cầu.

Chúng tôi cam kết bảo mật thông tin và chỉ sử dụng dữ liệu này vào mục đích phục vụ chương trình đào tạo.

Phiếu khảo sát lấy ý kiến của ${definition.respondentLine} gồm 2 phần:
- Phần 1: Nhóm câu hỏi chung (6 câu)
- Phần 2: Nhóm câu hỏi về nhu cầu, hiện trạng và thu thập tình huống (${definition.part2Count} câu)

Trân trọng cảm ơn!`;
}

function makeSettings(definition: ProgramDefinition): Partial<StudentSurveyDisplaySettings> {
  return {
    surveyType: definition.id,
    templateVariant: 'generic',
    browserTitle: definition.defaultFormTitle,
    bannerEyebrow: 'Phiếu khảo sát nhu cầu đào tạo',
    bannerTitle: definition.bannerTitle,
    bannerSubtitle: definition.bannerSubtitle,
    introTitle: 'Thông tin chung',
    introBody: makeIntro(definition),
    introButtonLabel: 'Bắt đầu khảo sát',
    submitButtonLabel: 'Gửi khảo sát',
    thankYouMessage: 'Trân trọng cảm ơn Anh/Chị đã chia sẻ thông tin.',
    footerText: 'VNPT HEART | VNPT Rising',
    primaryColor: HEART_PRIMARY,
    accentColor: HEART_ACCENT,
  };
}

function makeDefinition(input: ProgramDefinition): SurveyTypeDefinition {
  return {
    id: input.id,
    label: input.label,
    defaultFormCode: input.defaultFormCode,
    defaultFormTitle: input.defaultFormTitle,
    defaultIntro: makeIntro(input),
    defaultSettings: makeSettings(input),
    sections: [COMMON_SECTION, ROLE_SECTION],
    questions: [...COMMON_QUESTIONS, ...input.part2Questions],
  };
}

export const VNPT_HEART_WS2_SURVEY = makeDefinition({
  id: 'vnpt-heart-ws2',
  label: 'VNPT HEART - WS2 NSQL cấp 3',
  defaultFormCode: 'vnpt-heart-ws2',
  defaultFormTitle: 'VNPT HEART - Khảo sát NSQL cấp 3 (WS2)',
  bannerTitle: 'Chương trình đào tạo về VNPT HEART, gắn kết đội ngũ NSQL với hành trình chuyển đổi văn hóa VNPT Rising cho NSQL cấp 3 (WS2)',
  bannerSubtitle: 'Quy mô: Tổng số 14 câu nội dung\nHình thức: Khảo sát trực tuyến\nThời lượng dự kiến hoàn thành phiếu: 10-15 phút\nThời hạn hoàn thành khảo sát: 05 - 09/06/2026 (05 ngày)',
  greeting: 'Kính gửi các Anh/Chị đang giữ vai trò Lãnh đạo Ban/Phòng chức năng/Trung tâm của đơn vị trực thuộc VNPT,',
  programName: 'VNPT HEART, gắn kết đội ngũ NSQL với hành trình chuyển đổi văn hóa VNPT Rising cho NSQL cấp 3',
  respondentLine: 'Anh/Chị Lãnh đạo Ban/Phòng chức năng/Trung tâm của đơn vị trực thuộc VNPT',
  part2Count: 8,
  totalCount: 14,
  duration: '10-15 phút',
  deadline: '05 - 09/06/2026',
  part2Questions: ws2RoleQuestions,
});

export const VNPT_HEART_DT1_SURVEY = makeDefinition({
  id: 'vnpt-heart-dt1',
  label: 'VNPT HEART - ĐT1 NSQL cấp 4 & Tổ trưởng',
  defaultFormCode: 'vnpt-heart-dt1',
  defaultFormTitle: 'VNPT HEART - Khảo sát NSQL cấp 4 & Tổ trưởng (ĐT1)',
  bannerTitle: 'Chương trình đào tạo về VNPT HEART, liên hệ vào công tác quản lý công việc và đội/nhóm cho NSQL cấp 4 & Tổ trưởng (ĐT1)',
  bannerSubtitle: 'Quy mô: Tổng số 15 câu nội dung\nHình thức: Khảo sát trực tuyến\nThời lượng dự kiến hoàn thành phiếu: 25 phút\nThời hạn hoàn thành khảo sát: dd - dd/06/2026 (05 ngày)',
  greeting: 'Kính gửi các Anh/Chị đang giữ vai trò Tổ trưởng, Đội trưởng và cán bộ quản lý trực tiếp thuộc VNPT,',
  programName: 'VNPT HEART, liên hệ vào công tác quản lý công việc và đội/nhóm cho NSQL cấp 4 & Tổ trưởng',
  respondentLine: 'Anh/Chị Tổ trưởng, Đội trưởng và cán bộ quản lý trực tiếp thuộc VNPT',
  part2Count: 9,
  totalCount: 15,
  duration: '25 phút',
  deadline: 'dd - dd/06/2026',
  part2Questions: dt1RoleQuestions,
});

export const VNPT_HEART_DT2_SURVEY = makeDefinition({
  id: 'vnpt-heart-dt2',
  label: 'VNPT HEART - ĐT2 Người lao động',
  defaultFormCode: 'vnpt-heart-dt2',
  defaultFormTitle: 'VNPT HEART - Khảo sát Người lao động toàn Tập đoàn (ĐT2)',
  bannerTitle: 'Chương trình đào tạo về VNPT HEART, liên hệ vào công tác quản lý công việc cho Người lao động toàn Tập đoàn (ĐT2)',
  bannerSubtitle: 'Quy mô: Tổng số 15 câu nội dung\nHình thức: Khảo sát trực tuyến\nThời lượng dự kiến hoàn thành phiếu: 25 phút\nThời hạn hoàn thành khảo sát: dd - dd/06/2026 (05 ngày)',
  greeting: 'Kính gửi toàn thể CBCNV, NLĐ VNPT,',
  programName: 'VNPT HEART, liên hệ vào công tác quản lý công việc cho Người lao động toàn Tập đoàn',
  respondentLine: 'toàn thể CBCNV, NLĐ VNPT',
  part2Count: 9,
  totalCount: 15,
  duration: '25 phút',
  deadline: 'dd - dd/06/2026',
  part2Questions: dt2RoleQuestions,
});

export const VNPT_HEART_SURVEYS = [VNPT_HEART_WS2_SURVEY, VNPT_HEART_DT1_SURVEY, VNPT_HEART_DT2_SURVEY] as const;
