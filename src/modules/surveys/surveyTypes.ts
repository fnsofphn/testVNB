import { STUDENT_SURVEY_SCHEMA, type StudentSurveySchema, type SurveyJourney } from '@/lib/studentSurveySchema';
import type { StudentSurveyDisplaySettings, StudentSurveyQuestion } from '@/lib/studentSurvey';
import { VNPT_HEART_DT1_SURVEY, VNPT_HEART_DT2_SURVEY, VNPT_HEART_SURVEYS, VNPT_HEART_WS2_SURVEY } from '@/modules/surveys/vnptHeartSurveys';

export type SurveyTypeId =
  | 'evnspc-tnkh'
  | 'plx-tna'
  | 'vnpt-heart-ws2'
  | 'vnpt-heart-dt1'
  | 'vnpt-heart-dt2'
  | 'ql01a-prompt-practice'
  | 'ql01a-ai-dien-luc-4-ung-dung';

export type SurveySectionDefinition = Pick<SurveyJourney, 'id' | 'title' | 'description'>;

export type SurveyTypeDefinition = {
  id: SurveyTypeId;
  label: string;
  defaultFormCode: string;
  defaultFormTitle: string;
  defaultIntro: string;
  defaultSettings: Partial<StudentSurveyDisplaySettings>;
  sections: SurveySectionDefinition[];
  questions: StudentSurveyQuestion[];
  schema?: StudentSurveySchema;
};

function section(id: string, title: string, description = ''): SurveySectionDefinition {
  return { id, title, description };
}

function textQuestion(sectionId: string, sectionTitle: string, code: string, prompt: string, required = true): StudentSurveyQuestion {
  return {
    id: code.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
    code,
    prompt,
    type: 'text',
    required,
    sectionId,
    sectionTitle,
    placeholder: 'Nhập câu trả lời...',
  };
}

function withHint(question: StudentSurveyQuestion, hint: string): StudentSurveyQuestion {
  return { ...question, hint };
}

function choiceQuestion(
  sectionId: string,
  sectionTitle: string,
  code: string,
  prompt: string,
  options: string[],
  multiple = false,
  hint?: string,
  maxSelections?: number,
): StudentSurveyQuestion {
  return {
    id: code.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
    code,
    prompt,
    type: multiple ? 'multiple' : 'single',
    required: true,
    sectionId,
    sectionTitle,
    hint,
    maxSelections,
    options: options.map((label) => ({ value: label, label })),
  };
}

const PLX_SECTIONS = [
  section('profile', 'A - Thông tin học viên & hồ sơ cửa hàng', 'Bắt buộc trả lời 100%.'),
  section('awareness', 'B - Nhận thức đổi mới, thương hiệu & văn hóa', 'Nội dung gồm 8 câu hỏi.'),
  section('customer-experience', 'C - Hiện trạng trải nghiệm khách hàng', 'Nội dung gồm 5 câu hỏi.'),
  section(
    'leadership',
    'D - Lãnh đạo & quản lý đội ngũ đa nhiệm tuyến đầu',
    'Nội dung gồm 8 câu hỏi về phong cách "vừa quản lý vừa làm" + nhu cầu cải thiện năng suất, hiệu quả, chất lượng, năng lực, tác phong.',
  ),
  section('challenges', 'E - Khó khăn, thách thức thực tiễn', 'Nội dung gồm 4 câu hỏi.'),
  section('training-needs', 'F - Nhu cầu đào tạo & kỳ vọng sau khóa học', 'Nội dung gồm 5 câu hỏi.'),
];

const PLX_TNA_QUESTIONS: StudentSurveyQuestion[] = [
  textQuestion('profile', PLX_SECTIONS[0].title, 'A-HOTEN', 'Họ tên', true),
  textQuestion('profile', PLX_SECTIONS[0].title, 'A-CONGTY', 'Đơn vị Công ty xăng dầu thành viên', true),
  textQuestion('profile', PLX_SECTIONS[0].title, 'A-CHXD', 'Tên CHXD đang quản lý', true),
  choiceQuestion('profile', PLX_SECTIONS[0].title, 'A-NAM-CUAHANGTRUONG', 'Số năm giữ vai trò Cửa hàng trưởng', [
    'Dưới 1 năm',
    'Từ 1 đến dưới 3 năm',
    'Từ 3 đến dưới 7 năm',
    'Từ 7 năm trở lên',
  ]),
  textQuestion('profile', PLX_SECTIONS[0].title, 'A-SO-NHANVIEN', 'Số nhân viên bán hàng trực tiếp'),
  textQuestion('profile', PLX_SECTIONS[0].title, 'A-SO-COTBOM', 'Số cột bơm'),
  textQuestion('profile', PLX_SECTIONS[0].title, 'A-SANLUONG', 'Sản lượng bình quân tháng (m3)'),
  choiceQuestion('profile', PLX_SECTIONS[0].title, 'A-LOAIHINH', 'Loại hình cửa hàng', ['CHXD do PLX trực tiếp quản lý', 'CHXD nhượng quyền / liên kết']),
  choiceQuestion('profile', PLX_SECTIONS[0].title, 'A-DIABAN', 'Địa bàn', ['Đô thị', 'Quốc lộ / cao tốc', 'KCN', 'Nông thôn', 'Biên giới']),

  choiceQuestion('awareness', PLX_SECTIONS[1].title, 'Q01', 'Anh/Chị tiếp xúc lần đầu với nhận diện thương hiệu mới và thông điệp "Cùng tiến xa hơn" qua hình thức nào?', [
    'Qua hội nghị / cuộc họp triển khai chính thức của Tập đoàn / Công ty',
    'Qua văn bản, công văn nội bộ',
    'Qua phương tiện truyền thông',
    'Qua đồng nghiệp, cấp trên truyền lại',
    'Qua khóa đào tạo / tập huấn trước đây',
    'Chưa tiếp xúc rõ ràng, nghe loáng thoáng',
    'Khác',
  ]),
  withHint(textQuestion('awareness', PLX_SECTIONS[1].title, 'Q02', 'Khi nghe thông điệp "Cùng tiến xa hơn" lần đầu tiên, cảm xúc / suy nghĩ thật của Anh/Chị là gì?'), 'Trả lời không quá 3 dòng'),
  choiceQuestion('awareness', PLX_SECTIONS[1].title, 'Q03', 'Khi khách hàng dừng ở CHXD Petrolimex thay vì cây xăng tư nhân bên cạnh, lý do chủ yếu là gì?', [
    'Tin vào chất lượng xăng dầu Petrolimex',
    'Tin cây bơm Petrolimex chính xác về số lít',
    'Thói quen / khách quen lâu năm',
    'Vị trí thuận tiện, tiện đường',
    'Cửa hàng sạch sẽ, sáng sủa, có cảm giác an tâm',
    'Nhân viên có thái độ tốt, đồng phục chỉnh tề',
    'Có hóa đơn điện tử, thanh toán không tiền mặt thuận tiện',
    'Vì Petrolimex là doanh nghiệp Nhà nước, có trách nhiệm xã hội',
    'Khác',
  ], true, 'Chọn tối đa 03', 3),
  withHint(textQuestion('awareness', PLX_SECTIONS[1].title, 'Q04', 'Kể về 01 lần gần đây Anh/Chị cảm thấy tự hào nhất về cửa hàng của mình.'), 'Đó là khoảnh khắc nào, vì điều gì? Trả lời không quá 3 dòng'),
  withHint(textQuestion('awareness', PLX_SECTIONS[1].title, 'Q05', 'Khi nhân viên mặc áo Petrolimex nhưng có hành vi không đúng chuẩn, điều gì khiến Anh/Chị khó chịu nhất?'), 'Ngoài các yếu tố như lo bị phạt, bị cấp trên nhắc nhở. Trả lời không quá 3 dòng'),
  choiceQuestion('awareness', PLX_SECTIONS[1].title, 'Q06', 'Khách hàng khó tính và khách hàng trung thành của Petrolimex thường khác nhau nhiều nhất ở điểm gì?', [
    'Khách khó tính chú ý số lít từng đợt, khách trung thành ít kiểm tra',
    'Khách khó tính hay nhìn nhân viên dò xét, khách trung thành thoải mái trò chuyện',
    'Khách khó tính phản ứng ngay tại chỗ, khách trung thành góp ý nhẹ nhàng',
    'Khách khó tính thường là khách lạ, khách trung thành thường là khách quen',
    'Khách khó tính chú ý chi tiết hóa đơn / thanh toán, khách trung thành luôn tin tưởng',
    'Khác',
  ]),
  withHint(textQuestion('awareness', PLX_SECTIONS[1].title, 'Q07', 'Nếu đào tạo một nhân viên mới hỏi vì sao phải làm theo chuẩn Petrolimex cao hơn cây xăng tư nhân, Anh/Chị sẽ trả lời thế nào?'), 'Trả lời không quá 3 dòng'),
  choiceQuestion('awareness', PLX_SECTIONS[1].title, 'Q08', 'Trong 03 giá trị cốt lõi mới, giá trị nào Anh/Chị thấy khó hiện thực hóa nhất tại cửa hàng?', ['Di sản', 'Tận tâm', 'Tiên phong']),
  textQuestion('awareness', PLX_SECTIONS[1].title, 'Q08-LYDO', 'Lý do chọn giá trị ở Câu 8'),

  choiceQuestion('customer-experience', PLX_SECTIONS[2].title, 'Q09', 'Trong 01 ca làm việc, công việc nào chiếm nhiều thời gian tương tác trực tiếp với khách hàng nhất?', [
    'Chào đón khách khi xe ra vào cửa hàng',
    'Tư vấn loại xăng, hỏi số lít',
    'Bơm xăng trực tiếp',
    'Thu tiền mặt',
    'Quẹt thẻ / hướng dẫn thanh toán không tiền mặt / App PLX',
    'In, xuất hóa đơn',
    'Trả lời thắc mắc, khiếu nại tại chỗ',
    'Hướng dẫn khách hàng tới khu tiện ích',
    'Đảm bảo an toàn PCCC khi khách hàng đang ở cửa hàng',
    'Khác',
  ], true, 'Chọn tối đa 03', 3),
  choiceQuestion('customer-experience', PLX_SECTIONS[2].title, 'Q10', 'Khoảnh khắc nào quyết định khách hàng có quay lại hay không?', [
    'Cái nhìn đầu tiên khi xe vào cửa hàng',
    'Cách nhân viên chào và xác nhận loại xăng, số lít',
    'Tốc độ và sự gọn gàng của thao tác bơm xăng',
    'Cách nhân viên thông báo và xác nhận số tiền trước khi thu',
    'Cách xử lý thanh toán',
    'Câu nói tạm biệt, ánh mắt khi tiễn khách hàng',
    'Khoảnh khắc khách phát hiện cửa hàng sạch, đẹp, có tiện ích',
    'Khách quay lại lần 2 thấy nhân viên vẫn vậy / vẫn nhớ mình',
    'Khác',
  ], true, 'Chọn tối đa 03', 3),
  withHint(textQuestion('customer-experience', PLX_SECTIONS[2].title, 'Q11', 'Điều gì ở cửa hàng giữ chân một khách hàng quen, ngoài lý do tiện đường và giá cả?'), 'Hãy nghĩ về 01 khách hàng quen luôn quay lại đều đặn. Trả lời không quá 3 dòng'),
  choiceQuestion('customer-experience', PLX_SECTIONS[2].title, 'Q12', 'Tình huống nào nhân viên cửa hàng xử lý chưa thực sự tốt dù chưa đến mức bị khiếu nại?', [
    'Khách nghi ngờ số lít / chất lượng',
    'Khách phải đợi lâu giờ cao điểm',
    'Khách hỏi sản phẩm/khuyến mãi mà nhân viên không biết rõ',
    'Khách bối rối với thanh toán không tiền mặt / App PLX-ID',
    'Khách cau có vì lý do cá nhân, nhân viên im lặng không giúp',
    'Khách yêu cầu hóa đơn làm chậm dây chuyền phía sau',
    'Khách lạ chưa từng đến CHXD PLX không được hướng dẫn',
    'Khách nữ / cao tuổi / khuyết tật cần hỗ trợ đặc biệt',
    'Khi khách hàng đi xe ô tô vào - đang lưỡng lự không biết có nên xuống xe hay không',
    'Khác',
  ], true, 'Chọn tối đa 03', 3),
  withHint(textQuestion('customer-experience', PLX_SECTIONS[2].title, 'Q13', 'Nếu đóng vai khách hàng lần đầu đến cửa hàng mình, Anh/Chị thấy điểm gì chưa tự nhiên / chưa đẹp mắt / chưa thuận tiện?'), 'Trả lời không quá 3 dòng'),

  choiceQuestion('leadership', PLX_SECTIONS[3].title, 'Q14', 'Trong 01 ca làm việc, Anh/Chị thường dành nhiều thời gian nhất ở vị trí nào?', [
    'Đứng/đi quanh khu vực bán hàng để quan sát và hỗ trợ tức thời',
    'Trong văn phòng cửa hàng làm báo cáo, sổ sách, nhập liệu',
    'Trực tiếp tham gia ca cùng nhân viên',
    'Đi giữa khu bán hàng và văn phòng',
    'Tiếp, làm việc với cấp trên / đối tác / khách hàng tổ chức / lực lượng chức năng',
    'Khác',
  ]),
  choiceQuestion('leadership', PLX_SECTIONS[3].title, 'Q15', 'Khi giao việc cho nhân viên, cách nào thường xảy ra nhất trong thực tế cửa hàng?', [
    'Tự làm luôn cho nhanh',
    'Nói nhanh trong ca, giao miệng theo tình huống',
    'Hướng dẫn cụ thể đầu ca, kiểm tra cuối ca, không giải thích vì sao',
    'Hướng dẫn + giải thích vì sao, sau đó kiểm tra',
    'Hướng dẫn + giải thích + để nhân viên đề xuất cải tiến',
  ]),
  withHint(textQuestion('leadership', PLX_SECTIONS[3].title, 'Q16', 'Khi nhân viên làm sai, Anh/Chị xử lý ngay tại chỗ hay để cuối ca/cuối ngày góp ý? Vì sao?'), 'Ví dụ: chào hỏi không đúng, chậm thao tác bơm, thu tiền/xuất hóa đơn nhầm, lơ là an toàn. Trả lời không quá 3 dòng'),
  choiceQuestion('leadership', PLX_SECTIONS[3].title, 'Q17', 'Khi đông khách giờ cao điểm, Anh/Chị thường làm gì để vừa đảm bảo tốc độ vừa giữ chuẩn phục vụ?', [
    'Trực tiếp nhảy vào hỗ trợ',
    'Phân lại ca tạm thời',
    'Đứng ngoài quan sát, nhắc nhân viên ngắn gọn',
    'Để mặc nhân viên xoay sở',
    'Chấp nhận chậm hơn để đúng chuẩn',
    'Gọi thêm nhân viên dự bị / ca trước về hỗ trợ',
    'Khác',
  ], true, 'Chọn tối đa 03', 3),
  choiceQuestion('leadership', PLX_SECTIONS[3].title, 'Q18', 'Lỗi vi phạm tác phong nào Anh/Chị phải nhắc nhân viên nhiều nhất trong 06 tháng qua?', [
    'Đồng phục không chỉnh tề',
    'Thái độ với khách hàng',
    'Vi phạm an toàn',
    'Đùa giỡn, nói chuyện riêng trong ca',
    'Thao tác chậm, không theo SOP',
    'Quên hỏi khách hàng có cần hóa đơn / quên xuất hóa đơn',
    'Nhầm loại xăng / số lít',
    'Vệ sinh khu vực không kịp thời',
    'Sai sót thu tiền / quẹt thẻ / giao dịch điện tử',
    'Khác',
  ], true, 'Chọn tối đa 03', 3),
  choiceQuestion('leadership', PLX_SECTIONS[3].title, 'Q19', 'Năng lực nào của nhân viên cửa hàng cần cải thiện mạnh nhất trong 6 tháng tới?', [
    'Kỹ năng chào đón và giao tiếp với khách hàng',
    'Xử lý tình huống khách hàng khó',
    'Thao tác bơm xăng đúng SOP, nhanh và an toàn',
    'Sử dụng công nghệ',
    'Hiểu biết sản phẩm và chương trình khuyến mãi',
    'Ý thức an toàn PCCC chủ động',
    'Tinh thần làm việc nhóm',
    'Tính chủ động',
    'Tự kiểm soát chất lượng công việc',
    'Khác',
  ], true, 'Chọn tối đa 03', 3),
  choiceQuestion('leadership', PLX_SECTIONS[3].title, 'Q20', 'Dạng nhân viên nào khó dẫn dắt nhất tại cửa hàng hiện nay?', [
    'Nhân viên lâu năm, làm theo thói quen, ngại thay đổi',
    'Nhân viên mới vào, chưa thấm chuẩn nghề',
    'Nhân viên trẻ Gen Z',
    'Nhân viên có quan hệ',
    'Nhân viên có năng lực nhưng thái độ chưa ổn',
    'Nhân viên thiếu năng lực nhưng cố gắng',
    'Nhân viên làm thêm ngoài giờ, mệt mỏi, thiếu tập trung',
    'Khác',
  ]),
  withHint(textQuestion('leadership', PLX_SECTIONS[3].title, 'Q21', 'Nếu chỉ cải thiện một điều về bản thân để dẫn dắt đội ngũ tốt hơn, đó là điều gì và vì sao đến giờ chưa cải thiện được?'), 'Trả lời không quá 3 dòng'),

  choiceQuestion('challenges', PLX_SECTIONS[4].title, 'Q22', 'Áp lực kép / mâu thuẫn nào khó xử lý nhất tại cửa hàng?', [
    'Kỷ luật an toàn PCCC và tốc độ phục vụ giờ cao điểm',
    'Chỉ tiêu sản lượng/doanh thu và chuẩn mực phục vụ, thương hiệu',
    'Tuân thủ quy định nghiêm và mong muốn giữ khách quen',
    'Kiểm soát nhân viên và giữ chân, động viên đội ngũ',
    'Quy trình chuẩn của Tập đoàn và linh hoạt theo đặc thù địa bàn',
    'Báo cáo nội bộ, nhập liệu hệ thống và thời gian quản lý hiện trường',
    'Trực tiếp tham gia ca đông khách và giữ vai trò chỉ huy bao quát',
    'Khác',
  ]),
  choiceQuestion('challenges', PLX_SECTIONS[4].title, 'Q23', 'Tình huống đặc thù nào khó nhất khi thực thi đúng quy định mà vẫn giữ được khách hàng?', [
    'Kiểm soát bán hàng vào can/phuy',
    'Cạnh tranh giá với CHXD tư nhân cùng địa bàn',
    'Xử lý khách nghi ngờ chất lượng/số lượng khi không có sai sót',
    'Khách quay clip, đăng mạng xã hội thiếu thiện chí',
    'Áp lực từ chính quyền địa phương, lực lượng chức năng',
    'Địa bàn biên giới, chênh lệch giá xuyên biên',
    'Khác',
  ]),
  choiceQuestion('challenges', PLX_SECTIONS[4].title, 'Q24', 'Thách thức lớn nhất đối với cá nhân Anh/Chị trong vai trò Cửa hàng trưởng hiện nay là gì?', [
    'Khối lượng công việc lớn, không đủ thời gian hiện trường',
    'Áp lực chỉ tiêu sản lượng/doanh thu',
    'Áp lực báo cáo, thủ tục hành chính, nhập liệu',
    'Trách nhiệm cá nhân khi xảy ra sự cố an toàn PCCC',
    'Năng lực bản thân chưa theo kịp yêu cầu mới',
    'Thiếu cơ chế hỗ trợ, kèm cặp từ cấp trên',
    'Khoảng cách thế hệ với nhân viên trẻ',
    'Áp lực gia đình, cá nhân',
    'Khác',
  ]),
  withHint(textQuestion('challenges', PLX_SECTIONS[4].title, 'Q25', 'Khi triển khai 3 chuyển đổi Xanh - Số - Tổ chức & Văn hóa tại cửa hàng, điều gì khiến Anh/Chị lo lắng nhất hoặc chưa yên tâm?'), 'Vì sao? Trả lời không quá 3 dòng'),

  choiceQuestion('training-needs', PLX_SECTIONS[5].title, 'Q26', 'Trong 04 trục nội dung khóa đào tạo, Anh/Chị mong muốn học sâu nhất nội dung nào?', [
    'Tư duy đổi mới, thương hiệu mới và 3 chuyển đổi của Petrolimex',
    'Quản trị trải nghiệm khách hàng và xử lý tình huống tại điểm bán',
    'Phong cách quản lý mới: 5 Rõ, kỷ luật thực thi, quản trị theo mục tiêu đầu ra',
    'Xây dựng đội ngũ gắn kết và kiến tạo văn hóa tại cửa hàng',
  ], false, 'Chọn 01 nội dung mong muốn học sâu nhất'),
  choiceQuestion('training-needs', PLX_SECTIONS[5].title, 'Q27', 'Hình thức học nào giúp Anh/Chị tiếp thu hiệu quả nhất?', [
    'Phân tích tình huống thực tế từ chính các CHXD',
    'Video tình huống + thảo luận nhóm',
    'Gamification / trắc nghiệm tương tác trên web',
    'Đóng vai xử lý tình huống khách hàng',
    'Giảng viên trình bày lý thuyết chuyên sâu',
    'Tham quan, học hỏi mô hình CHXD chuẩn',
  ], false),
  choiceQuestion('training-needs', PLX_SECTIONS[5].title, 'Q28', 'Sản phẩm hữu hình nào Anh/Chị muốn mang về cửa hàng sau khóa học để áp dụng ngay?', [
    'Bộ checklist chuẩn cho từng ca/ngày/tuần',
    'Sổ tay xử lý tình huống khách hàng',
    'Mẫu Kế hoạch hành động 90 ngày',
    'Biểu mẫu họp đầu ca/cuối ca và mẫu báo cáo nhanh',
    'Bộ chuẩn ngôn ngữ giao tiếp khách hàng',
    'Khung 5 Rõ ứng dụng trong giao việc',
    'Mẫu đánh giá đội ngũ theo giá trị Di sản - Tận tâm - Tiên phong',
    'Kịch bản xử lý tình huống nhạy cảm',
    'Khác',
  ], true, '(Chọn tối đa 03)', 3),
  withHint(textQuestion('training-needs', PLX_SECTIONS[5].title, 'Q29', 'Anh/Chị có 01 câu hỏi lớn nào về vai trò Cửa hàng trưởng trong giai đoạn mới muốn giảng viên / chuyên gia làm rõ?'), 'Viết thành 01 câu hỏi cụ thể'),
  withHint(textQuestion('training-needs', PLX_SECTIONS[5].title, 'Q30', 'Sau khóa học, Anh/Chị kỳ vọng có thể áp dụng ngay 01 việc cải tiến gì tại cửa hàng trong 30 ngày đầu?'), 'Trả lời không quá 3 dòng'),
];

export function getSurveyTypeDefinition(surveyType?: string): SurveyTypeDefinition {
  if (surveyType === 'ql01a-ai-dien-luc-4-ung-dung') return QL01A_AI_POWER_PRACTICE_SURVEY;
  if (surveyType === 'ql01a-prompt-practice') return QL01A_PROMPT_PRACTICE_SURVEY;
  if (surveyType === 'plx-tna') return PLX_TNA_SURVEY;
  if (surveyType === 'vnpt-heart-ws2') return VNPT_HEART_WS2_SURVEY;
  if (surveyType === 'vnpt-heart-dt1') return VNPT_HEART_DT1_SURVEY;
  if (surveyType === 'vnpt-heart-dt2') return VNPT_HEART_DT2_SURVEY;
  return EVNSPC_TNKH_SURVEY;
}

export const EVNSPC_TNKH_SURVEY: SurveyTypeDefinition = {
  id: 'evnspc-tnkh',
  label: 'EVNSPC - Khảo sát TNKH',
  defaultFormCode: 'evnspc',
  defaultFormTitle: 'EVNSPC - Phiếu khảo sát TNKH',
  defaultIntro:
    'Phiếu khảo sát được tổ chức theo 6 hành trình khách hàng trọng tâm, giữ nguyên giao diện HTML mẫu và lưu dữ liệu trên Supabase.',
  defaultSettings: {
    surveyType: 'evnspc-tnkh',
    browserTitle: 'EVNSPC - Khảo sát TNKH',
    bannerEyebrow: 'Tập đoàn Điện lực Việt Nam - Tổng Công ty Điện lực miền Nam',
    bannerTitle: 'Phiếu thu thập thông tin phục vụ xây dựng Bộ Chuẩn mực Hành vi TNKH',
    bannerSubtitle: 'Theo Chỉ thị 840/CT-EVN | Đơn vị tư vấn: PeopleOne',
    introTitle: 'Mục đích',
    introBody:
      'Phiếu khảo sát được tổ chức theo 6 hành trình khách hàng trọng tâm. Người điền lần lượt cung cấp thông tin theo từng nhóm khách hàng để nhận diện khác biệt về kỳ vọng và điểm đau.',
    introButtonLabel: 'Bắt đầu',
    submitButtonLabel: 'Gửi kết quả',
    thankYouMessage: 'Cảm ơn Anh/Chị đã dành thời gian cung cấp thông tin.',
    footerText: 'Tập đoàn Điện lực Việt Nam | Tổng Công ty Điện lực miền Nam | PeopleOne | ISO 10001:2018',
    primaryColor: '#003C8F',
    accentColor: '#F7941D',
  },
  sections: STUDENT_SURVEY_SCHEMA.journeys,
  questions: [],
  schema: STUDENT_SURVEY_SCHEMA,
};

export const PLX_TNA_SURVEY: SurveyTypeDefinition = {
  id: 'plx-tna',
  label: 'PLX - Khảo sát nhu cầu đào tạo CHT 2026',
  defaultFormCode: 'plx-tna-2026',
  defaultFormTitle: 'Bộ câu hỏi khảo sát nhu cầu đào tạo',
  defaultIntro:
    'Trước thềm khoá đào tạo "Chuyển đổi tư duy quản lý, văn hóa kinh doanh, thương hiệu và trải nghiệm khách hàng trong giai đoạn mới", Tập đoàn và Ban tổ chức khoá học rất mong nhận được những chia sẻ THẬT từ các Anh/Chị về thực tiễn quản lý CHXD hằng ngày.',
  defaultSettings: {
    surveyType: 'plx-tna',
    templateVariant: 'plx-tna',
    browserTitle: 'Bộ câu hỏi khảo sát nhu cầu đào tạo',
    bannerEyebrow: 'BỘ CÂU HỎI KHẢO SÁT NHU CẦU ĐÀO TẠO',
    bannerTitle: 'Chương trình đào tạo chuyển đổi tư duy quản lý, văn\u00a0hoá\u00a0kinh\u00a0doanh,\nthương hiệu và trải nghiệm khách hàng trong giai đoạn mới',
    bannerSubtitle:
      'Đối tượng: Cửa hàng trưởng CHXD Petrolimex\nQuy mô: 30 câu nội dung (chia 05 nhóm)\nHình thức: Khảo sát trực tuyến\nThời lượng dự kiến: 15-18 phút\nThời hạn hoàn thành: 18 - 21/05/2026 (04 ngày)',
    introTitle: 'LỜI DẪN CHO HỌC VIÊN',
    introBody:
      'Kính gửi các Anh/Chị Cửa hàng trưởng,\n\nTrước thềm khoá đào tạo "Chuyển đổi tư duy quản lý, văn hóa kinh doanh, thương hiệu và trải nghiệm khách hàng trong giai đoạn mới", Tập đoàn và Ban tổ chức khoá học rất mong nhận được những chia sẻ THẬT từ các Anh/Chị về thực tiễn quản lý CHXD hằng ngày. Đây không phải bài kiểm tra - không có đáp án đúng/sai. Mỗi câu trả lời của các Anh/Chị sẽ là dữ liệu đầu vào trực tiếp để giảng viên thiết kế bài giảng sát thực tế. Càng cụ thể, càng thẳng thắn, khoá học càng có giá trị.\n\nKhảo sát lấy ý kiến của Anh/Chị Cửa hàng trưởng gồm 6 phần:\n- Phần A: Thông tin chung\n- Phần B: Các câu hỏi về nhận thức Đổi mới - Thương hiệu - Giá trị (8 câu)\n- Phần C: Các câu hỏi về Trải nghiệm khách hàng (5 câu)\n- Phần D: Các câu hỏi về Lãnh đạo và quản lý đội ngũ (8 câu)\n- Phần E: Các câu hỏi về nhận diện khó khăn, thách thức thực tiễn (4 câu)\n- Phần F: Các câu hỏi về nhu cầu đào tạo và kỳ vọng học viên (5 câu)\n\nTrân trọng cảm ơn.',
    introButtonLabel: 'Bắt đầu khảo sát',
    submitButtonLabel: 'Gửi khảo sát',
    thankYouMessage: 'Trân trọng cảm ơn Anh/Chị đã chia sẻ thông tin.',
    footerText: 'Petrolimex',
    primaryColor: '#005BAC',
    accentColor: '#F58220',
  },
  sections: PLX_SECTIONS,
  questions: PLX_TNA_QUESTIONS,
};

const QL01A_PROMPT_SECTIONS = [
  section('situation-1', 'Tình huống 1 - Nhắc việc đầu tuần', 'Viết prompt theo 3 lớp: Mục tiêu, Bối cảnh, Đầu ra.'),
  section('situation-2', 'Tình huống 2 - Xử lý phản ánh khách hàng', 'Bổ sung bối cảnh vận hành và ràng buộc an toàn thông tin.'),
  section('situation-3', 'Tình huống 3 - Giao việc cho đội nhóm', 'Yêu cầu đầu ra rõ định dạng để có thể dùng ngay.'),
  section('score', 'Kết quả chấm tự động', 'Các cột điểm được hệ thống tự lưu để xuất Excel.'),
];

function promptPracticeTextQuestion(sectionIndex: number, layer: 'GOAL' | 'CONTEXT' | 'OUTPUT', prompt: string, hint: string): StudentSurveyQuestion {
  const situation = QL01A_PROMPT_SECTIONS[sectionIndex - 1];
  const layerId = layer.toLowerCase();
  return {
    id: `p${sectionIndex}_${layerId}`,
    code: `P${sectionIndex}-${layer}`,
    prompt,
    type: 'text',
    required: true,
    sectionId: situation.id,
    sectionTitle: situation.title,
    hint,
    placeholder: layer === 'GOAL' ? 'Muốn AI làm gì, số lượng/kết quả cần có...' : layer === 'CONTEXT' ? 'Ai dùng, tình huống, dữ liệu, ràng buộc...' : 'Định dạng, độ dài, tiêu chí trình bày...',
  };
}

function scoreColumn(code: string, prompt: string): StudentSurveyQuestion {
  return {
    id: code.toLowerCase(),
    code,
    prompt,
    type: 'text',
    required: false,
    sectionId: 'score',
    sectionTitle: 'Kết quả chấm tự động',
  };
}

const QL01A_PROMPT_PRACTICE_QUESTIONS: StudentSurveyQuestion[] = [
  promptPracticeTextQuestion(1, 'GOAL', 'Mục tiêu', 'Nêu rõ AI cần tạo nội dung gì, bao nhiêu ý, tiêu chí nào là quan trọng.'),
  promptPracticeTextQuestion(1, 'CONTEXT', 'Bối cảnh', 'Nêu vai trò người quản lý, tình huống họp/nhắc việc và đối tượng nhận thông tin.'),
  promptPracticeTextQuestion(1, 'OUTPUT', 'Đầu ra', 'Yêu cầu định dạng dễ dùng ngay: checklist, bảng, email ngắn hoặc kế hoạch hành động.'),
  promptPracticeTextQuestion(2, 'GOAL', 'Mục tiêu', 'Nêu rõ cần AI hỗ trợ phân tích, soạn phản hồi hay đề xuất phương án xử lý.'),
  promptPracticeTextQuestion(2, 'CONTEXT', 'Bối cảnh', 'Bổ sung loại phản ánh, kênh tiếp nhận, thẩm quyền xử lý và ràng buộc bảo mật.'),
  promptPracticeTextQuestion(2, 'OUTPUT', 'Đầu ra', 'Yêu cầu cấu trúc phản hồi rõ ràng, có bước xác minh và cách giao tiếp với khách hàng.'),
  promptPracticeTextQuestion(3, 'GOAL', 'Mục tiêu', 'Nêu rõ muốn AI giúp giao việc, theo dõi tiến độ hay huấn luyện đội nhóm.'),
  promptPracticeTextQuestion(3, 'CONTEXT', 'Bối cảnh', 'Nêu đặc điểm đội nhóm, khó khăn hiện tại, thời hạn và nguồn lực.'),
  promptPracticeTextQuestion(3, 'OUTPUT', 'Đầu ra', 'Yêu cầu bảng phân công, tiêu chí hoàn thành, lịch kiểm tra hoặc mẫu phản hồi.'),
  scoreColumn('PROMPT-SCORE-TOTAL', 'Tổng điểm prompt practice'),
  scoreColumn('PROMPT-SCORE-P1', 'Điểm tình huống 1'),
  scoreColumn('PROMPT-SCORE-P2', 'Điểm tình huống 2'),
  scoreColumn('PROMPT-SCORE-P3', 'Điểm tình huống 3'),
  scoreColumn('PROMPT-LEVEL', 'Xếp loại tổng hợp'),
];

export const QL01A_PROMPT_PRACTICE_SURVEY: SurveyTypeDefinition = {
  id: 'ql01a-prompt-practice',
  label: 'QL01A - Luyện viết Prompt 3 lớp',
  defaultFormCode: 'ql01a-prompt-practice',
  defaultFormTitle: 'QL01A - Luyện viết Prompt 3 lớp',
  defaultIntro: 'Bài tập cá nhân giúp học viên luyện cách viết prompt theo ba lớp Mục tiêu - Bối cảnh - Đầu ra.',
  defaultSettings: {
    surveyType: 'ql01a-prompt-practice',
    templateVariant: 'prompt-practice',
    accessMode: 'public',
    requireRespondentName: true,
    requireRespondentEmail: true,
    browserTitle: 'QL01A - Luyện viết Prompt 3 lớp',
    bannerEyebrow: 'BÀI TẬP CÁ NHÂN',
    bannerTitle: 'Luyện viết Prompt 3 lớp',
    bannerSubtitle: 'Chương trình QL01A - Ứng dụng AI trong quản lý',
    introTitle: 'Hướng dẫn',
    introBody: 'Anh/Chị nhập họ tên, email rồi hoàn thành 3 tình huống. Mỗi tình huống gồm 3 lớp: Mục tiêu, Bối cảnh và Đầu ra. Hệ thống chấm tự động theo rubric đơn giản và lưu kết quả để Ban tổ chức xuất Excel.',
    introButtonLabel: 'Bắt đầu',
    submitButtonLabel: 'Nộp bài',
    thankYouMessage: 'Cảm ơn Anh/Chị đã hoàn thành bài luyện viết prompt.',
    footerText: 'QL01A | PeopleOne | Vinabrain VSurvey',
    primaryColor: '#C00000',
    accentColor: '#F58220',
  },
  sections: QL01A_PROMPT_SECTIONS,
  questions: QL01A_PROMPT_PRACTICE_QUESTIONS,
};

const QL01A_AI_POWER_PRACTICE_SECTIONS = [
  section('progress', 'Tiến độ phiếu thực hành', 'Nhật ký nhóm vào bài và hoàn thành từng checkpoint.'),
  section('application-1', 'Ứng dụng 1 - Chuẩn bị giao ban đầu ngày', 'Prompt và phản ánh cuối bài do nhóm thực hành.'),
  section('application-2', 'Ứng dụng 2 - Tổng hợp sự cố lưới điện tuần', 'Prompt và phản ánh cuối bài do nhóm thực hành.'),
  section('application-3', 'Ứng dụng 3 - Chuẩn bị điểm nhấn giao ban', 'Prompt và phản ánh cuối bài do nhóm thực hành.'),
  section('application-4', 'Ứng dụng 4 - Chuẩn hóa phản hồi khách hàng', 'Prompt và phản ánh cuối bài do nhóm thực hành.'),
];

function aiPowerPracticeQuestions(applicationIndex: number): StudentSurveyQuestion[] {
  const currentSection = QL01A_AI_POWER_PRACTICE_SECTIONS[applicationIndex];
  const prefix = `ai_power_${applicationIndex}`;
  return [
    textQuestion(currentSection.id, currentSection.title, `${prefix}-situation`, 'Tình huống đã thực hành', false),
    textQuestion(currentSection.id, currentSection.title, `${prefix}-prompt`, 'Prompt nhóm đã thực hành viết', true),
    textQuestion(currentSection.id, currentSection.title, `${prefix}-final`, 'Nội dung phản ánh cuối bài', false),
  ];
}

const QL01A_AI_POWER_PROGRESS_QUESTIONS = [
  textQuestion('progress', QL01A_AI_POWER_PRACTICE_SECTIONS[0].title, 'practice_session_id', 'Mã phiếu nhóm', false),
  textQuestion('progress', QL01A_AI_POWER_PRACTICE_SECTIONS[0].title, 'practice_status', 'Tiến độ mới nhất', false),
  textQuestion('progress', QL01A_AI_POWER_PRACTICE_SECTIONS[0].title, 'practice_application_title', 'Tình huống hiện tại', false),
  textQuestion('progress', QL01A_AI_POWER_PRACTICE_SECTIONS[0].title, 'practice_step_label', 'Bước vừa hoàn thành', false),
  textQuestion('progress', QL01A_AI_POWER_PRACTICE_SECTIONS[0].title, 'practice_prompt', 'Prompt tại checkpoint', false),
  textQuestion('progress', QL01A_AI_POWER_PRACTICE_SECTIONS[0].title, 'practice_final_note', 'Phản ánh cuối bài tại checkpoint', false),
];

const QL01A_AI_POWER_PRACTICE_QUESTIONS = [...QL01A_AI_POWER_PROGRESS_QUESTIONS, ...[1, 2, 3, 4].flatMap(aiPowerPracticeQuestions)];

export const QL01A_AI_POWER_PRACTICE_SURVEY: SurveyTypeDefinition = {
  id: 'ql01a-ai-dien-luc-4-ung-dung',
  label: 'QL01A - Thực hành AI Điện lực 4 ứng dụng',
  defaultFormCode: 'ql01a-ai-dien-luc-4-ung-dung',
  defaultFormTitle: 'QL01A - Thực hành AI trong quản lý Điện lực',
  defaultIntro: 'Bài thực hành nhóm gồm 4 ứng dụng AI trong quản lý Điện lực. Nhóm được ghi nhận khi vào bài và sau mỗi checkpoint.',
  defaultSettings: {
    surveyType: 'ql01a-ai-dien-luc-4-ung-dung',
    templateVariant: 'ai-power-practice',
    accessMode: 'public',
    requireRespondentName: true,
    requireRespondentEmail: false,
    practiceGuideVideoUrls: [
      'https://vimeo.com/1146531580?share=copy&fl=cl&fe=ci',
      'https://vimeo.com/1146531580?share=copy&fl=cl&fe=ci',
      'https://vimeo.com/1146531580?share=copy&fl=cl&fe=ci',
      'https://vimeo.com/1146531580?share=copy&fl=cl&fe=ci',
    ],
    browserTitle: 'QL01A - Thực hành AI trong quản lý Điện lực',
    bannerEyebrow: 'SPC · QL01A · BÀI THỰC HÀNH NHÓM',
    bannerTitle: 'Thực hành AI trong quản lý Điện lực',
    bannerSubtitle: '4 tình huống demo và thực hành',
    introTitle: 'Thông tin nhóm thực hành',
    introBody: 'Nhập tên Lớp và tên Nhóm tại trang bắt đầu. Tiến độ được lưu khi nhóm xác nhận hoàn thành từng bước.',
    introButtonLabel: 'Bắt đầu thực hành',
    submitButtonLabel: 'Lưu tiến độ',
    thankYouMessage: 'Đã lưu tiến độ thực hành của nhóm.',
    footerText: 'SPC · QL01A · Vinabrain VSurvey',
    primaryColor: '#9C2A20',
    accentColor: '#C95946',
  },
  sections: QL01A_AI_POWER_PRACTICE_SECTIONS,
  questions: QL01A_AI_POWER_PRACTICE_QUESTIONS,
};

export const SURVEY_TYPE_DEFINITIONS = [
  EVNSPC_TNKH_SURVEY,
  PLX_TNA_SURVEY,
  QL01A_PROMPT_PRACTICE_SURVEY,
  QL01A_AI_POWER_PRACTICE_SURVEY,
  ...VNPT_HEART_SURVEYS,
] as const;
