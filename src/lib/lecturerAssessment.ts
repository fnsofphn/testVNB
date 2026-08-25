import { supabase } from '@/lib/supabaseClient';
import { formatLecturerAssessmentAnswer, type LecturerAnswerValue } from '@/lib/lecturerAssessmentForm';

export type LecturerAssessmentSection = {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  maxScore: number;
  questionCount: number;
  tone: 'danger' | 'warning' | 'success' | 'violet';
};

export type LecturerAssessmentQuestion = {
  id: string;
  code: string;
  sectionId: string;
  title: string;
  maxScore: number;
  prompt: string;
  guidance: string;
  questionType?: 'long_text' | 'short_text' | 'single_choice' | 'multiple_choice';
  options?: { id: string; text: string }[];
  correctOptionId?: string | null;
  required?: boolean;
};

export type LecturerQuestionSet = {
  id: string;
  code: string;
  name: string;
  description: string;
  status: 'active' | 'draft';
  sectionCount: number;
  questionCount: number;
  createdAt: string;
};

export type LecturerQuestionSetBundle = {
  set: LecturerQuestionSet;
  sections: LecturerAssessmentSection[];
  questions: LecturerAssessmentQuestion[];
};

export type LecturerAssessmentForm = {
  id: string;
  title: string;
  intro: string;
  createdAt: string;
  status: 'active' | 'paused';
  questionSetId: string;
};

export type LecturerAssessmentSubmission = {
  id: string;
  formId: string;
  lecturerName: string;
  email: string;
  phone: string;
  yearsTeaching: string;
  notes: string;
  answers: Record<string, LecturerAnswerValue>;
  submittedAt: string;
};

export type LecturerAssessmentFormBundle = {
  form: LecturerAssessmentForm;
  questionSet: LecturerQuestionSet;
  sections: LecturerAssessmentSection[];
  questions: LecturerAssessmentQuestion[];
};

export type LecturerAssessmentFormInput = Partial<Pick<LecturerAssessmentForm, 'id' | 'title' | 'intro'>> & {
  questionSetId?: string;
};

const DEFAULT_SET_ID = 'lecturer-set-1';
const DEFAULT_SET_CODE = 'bo-1';

const DEFAULT_SECTIONS: LecturerAssessmentSection[] = [
  { id: 'attitude', code: 'Phần I', title: 'Thái độ và nhìn nhận', subtitle: '5 tình huống ranh giới mờ để nhìn ra chiều sâu tư duy hệ thống.', maxScore: 100, questionCount: 5, tone: 'danger' },
  { id: 'expertise', code: 'Phần II', title: 'Chuyên môn sâu', subtitle: '3 mảng lõi: điều hành tuyến đầu, CX và huấn luyện phát triển người.', maxScore: 150, questionCount: 6, tone: 'warning' },
  { id: 'delivery', code: 'Phần III', title: 'Khả năng truyền đạt', subtitle: 'Đo năng lực đơn giản hóa, dẫn dắt và xử lý trạng thái lớp học.', maxScore: 100, questionCount: 4, tone: 'violet' },
  { id: 'classroom', code: 'Phần IV', title: 'Xử lý trên lớp', subtitle: 'Tình huống thực tế đòi hỏi bản lĩnh, độ chín và sự linh hoạt của giảng viên.', maxScore: 100, questionCount: 4, tone: 'success' },
];

const DEFAULT_QUESTIONS: LecturerAssessmentQuestion[] = [
  { id: 'bo-1-a1', code: 'A1', sectionId: 'attitude', title: 'Đào tạo hay cơ chế vận hành mới là điểm nghẽn?', maxScore: 20, prompt: 'Một Trưởng Điện lực phản ánh: "Tôi đã cho nhân viên đi học rất nhiều khóa, nhưng về họ vẫn làm theo cách cũ. Vấn đề là ở chất lượng đào tạo." Ứng viên nhận định thế nào về phát biểu này?', guidance: 'Điểm cao khi ứng viên nhìn được đào tạo chỉ là một phần, còn chuyển hóa phụ thuộc cơ chế áp dụng, vai trò quản lý trực tiếp và môi trường thực thi.' },
  { id: 'bo-1-a2', code: 'A2', sectionId: 'attitude', title: 'Đối thoại với tâm lý "bận nên không thể chuyên nghiệp"', maxScore: 20, prompt: 'Trong một khóa đào tạo về "Điều hành công việc chuyên nghiệp", có học viên nói: "Những thứ thầy/cô dạy nghe hay, nhưng thực tế ở Điện lực tôi, nhân viên thiếu, việc nhiều, làm gì có thời gian mà giữ nhịp giao ban hay chốt đầu mối như thầy/cô nói." Ứng viên sẽ phản hồi ra sao, và quan trọng hơn, ứng viên nhìn nhận bản chất phản ứng này là gì?', guidance: 'Cần nghe được sự đồng cảm nhưng không thỏa hiệp với tư duy phản ứng. Ứng viên tốt sẽ chỉ ra chính vì thiếu nhịp điều hành nên tổ chức càng bị cuốn vào bận rộn.' },
  { id: 'bo-1-a3', code: 'A3', sectionId: 'attitude', title: 'Chuẩn là nền, WOW là văn hóa', maxScore: 20, prompt: 'EVNSPC đang triển khai Bộ Chuẩn mực Hành vi Trải nghiệm Khách hàng ONE EVN CX với 3 tầng: Chuẩn, Tốt và WOW. Một số quản lý cấp 4 cho rằng chỉ cần nhân viên làm đúng Tầng Chuẩn là đủ, còn Tầng WOW là lý thuyết. Ứng viên đánh giá phát biểu này đúng hay sai? Vì sao?', guidance: 'Ứng viên mạnh sẽ phân biệt rõ Tầng Chuẩn là bắt buộc, nhưng quản lý không thể dừng ở đó nếu muốn tạo văn hóa dịch vụ. Cần thấy vai trò tạo môi trường để nhân viên dám làm tốt hơn.' },
  { id: 'bo-1-a4', code: 'A4', sectionId: 'attitude', title: 'Một bài tập có một đáp án đúng duy nhất có thật sự tốt?', maxScore: 20, prompt: 'Ứng viên được mời thiết kế một bài tập tình huống cho khóa đào tạo quản lý cấp 4. Ứng viên chọn một tình huống rất hay, rất sát thực tế Điện lực. Tuy nhiên, khi triển khai tại lớp, 70% học viên đưa ra đáp án giống nhau và đều đúng. Theo ứng viên, bài tập này thành công hay thất bại? Tại sao?', guidance: 'Bài tập quản trị tốt phải tạo phân hóa tư duy, buộc học viên đối diện trade-off và bộc lộ khác biệt trong cách ra quyết định.' },
  { id: 'bo-1-a5', code: 'A5', sectionId: 'attitude', title: 'Hài lòng chưa chắc là hiệu quả', maxScore: 20, prompt: 'Sau khóa đào tạo, đơn vị đào tạo gửi bảng khảo sát hài lòng. Kết quả: 95% học viên đánh giá "Hài lòng" và "Rất hài lòng". Một số giảng viên coi đây là minh chứng khóa học thành công. Ứng viên có đồng ý không? Ứng viên đề xuất cách đo lường hiệu quả đào tạo nào sâu hơn cho chương trình quản trị cấp 4 của EVNSPC?', guidance: 'Cần phân biệt giữa phản ứng hài lòng và thay đổi hành vi/tác động công việc. Quan trọng là đề xuất được cơ chế đo chuyển hóa sau đào tạo.' },
  { id: 'bo-1-b1', code: 'B1', sectionId: 'expertise', title: 'Thiết kế bài thực hành điều hành tuyến đầu trong 45 phút', maxScore: 25, prompt: 'Một Điện lực có 5 tổ, tỷ lệ việc tồn tăng 25%, nhiều việc rơi vào vùng xám giữa các tổ, Trưởng Điện lực phải nhắc việc liên tục. Nếu ứng viên phải thiết kế một bài thực hành cho học viên về chủ đề này trong 45 phút, ứng viên sẽ thiết kế như thế nào? Mô tả cụ thể mục tiêu, dữ liệu đầu vào, các bước triển khai và sản phẩm đầu ra.', guidance: 'Điểm mạnh nằm ở khả năng biến nội dung thành bài tập có dữ liệu cụ thể, có phân vai, có đầu ra rõ và chạm tới chốt đầu mối, nhịp giao ban và cơ chế trách nhiệm.' },
  { id: 'bo-1-b2', code: 'B2', sectionId: 'expertise', title: 'Từ quản lý sự vụ sang điều hành có nhịp', maxScore: 25, prompt: 'Ứng viên hãy phân tích sự khác biệt giữa "quản lý sự vụ" và "điều hành có nhịp" trong bối cảnh Điện lực; đưa ra ít nhất 3 dấu hiệu giúp học viên tự chẩn đoán mình đang ở mức nào; và đề xuất 1 công cụ đơn giản có thể áp dụng ngay trong tuần đầu sau khóa học.', guidance: 'Câu này đo độ chín của tư duy quản trị lẫn năng lực chuyển hóa thành công cụ thực tế.' },
  { id: 'bo-1-b3', code: 'B3', sectionId: 'expertise', title: 'Giải nghĩa CX bằng ngôn ngữ quản lý tuyến đầu', maxScore: 25, prompt: 'Bộ CMHV ONE EVN CX phân biệt rõ "dịch vụ khách hàng" và "quản trị trải nghiệm khách hàng". Ứng viên hãy giải thích sự khác biệt này bằng ngôn ngữ mà một Trưởng Điện lực có thể hiểu ngay trong 2 phút, cho 2 ví dụ cụ thể, và thiết kế 1 câu hỏi tình huống ngắn để kiểm tra học viên.', guidance: 'Ứng viên giỏi phải đơn giản hóa được khái niệm phức tạp mà không làm mất bản chất, đồng thời gắn vào ví dụ vận hành hằng ngày.' },
  { id: 'bo-1-b4', code: 'B4', sectionId: 'expertise', title: 'Biến Zero Repeat Rule thành trải nghiệm học tập', maxScore: 25, prompt: 'Theo ONE EVN CX, một trong 3 nguyên tắc vận hành là "Không để KH làm công việc của EVN" (Zero Repeat Rule). Ứng viên hãy thiết kế một hoạt động đào tạo kéo dài 30 phút để giúp học viên quản lý cấp 4 thực sự thấm nguyên tắc này và biết cách triển khai tại Điện lực.', guidance: 'Điểm cao khi hoạt động không chỉ dừng ở giảng giải mà thật sự làm học viên thấm nguyên tắc bằng va chạm trải nghiệm.' },
  { id: 'bo-1-b5', code: 'B5', sectionId: 'expertise', title: 'Nhắc việc, chỉ việc, huấn luyện, kèm cặp', maxScore: 25, prompt: 'Ứng viên hãy định nghĩa ngắn gọn từng khái niệm bằng ngôn ngữ thực tế của Điện lực; đưa ra 1 tình huống cụ thể cho thấy nhắc việc thất bại nhưng kèm cặp thành công; và giải thích vì sao nhiều quản lý tuyến đầu hay rơi vào nhắc việc thay vì huấn luyện.', guidance: 'Hội đồng cần đánh giá xem ứng viên có hiểu bản chất phát triển con người hay chỉ biết nhắc lại định nghĩa.' },
  { id: 'bo-1-b6', code: 'B6', sectionId: 'expertise', title: 'Kèm cặp một nhân sự giỏi nghề nhưng kháng phối hợp', maxScore: 25, prompt: 'Một Phó Điện lực quản lý 2 tổ, trong đó có 1 nhân viên kỹ thuật giỏi nghề nhưng hay phản ứng tiêu cực khi được giao thêm việc phối hợp với tổ khác, thường nói: "Đó không phải việc của tổ em." Ứng viên hãy phân tích nguyên nhân gốc rễ, đề xuất phương pháp kèm cặp cụ thể trong 30 ngày và cách đưa tình huống này vào lớp học để tạo tranh luận sâu.', guidance: 'Điểm mạnh nằm ở khả năng nhìn ra gốc rễ hành vi, thiết kế coaching/mentoring đủ cụ thể và tạo được tranh luận sâu.' },
  { id: 'bo-1-c1', code: 'C1', sectionId: 'delivery', title: 'Mở đầu một lớp AI cho học viên e ngại công nghệ', maxScore: 25, prompt: 'Ứng viên được giao dạy chuyên đề "Ứng dụng AI trong quản lý cấp 4" cho 40 Trưởng/Phó Điện lực. Đa số học viên trên 45 tuổi, chưa từng dùng ChatGPT, một số có tâm lý e ngại công nghệ. Ứng viên hãy mô tả 5 phút mở đầu, cách giải thích "GenAI là gì" trong 60 giây, và hoạt động thực hành đầu tiên.', guidance: 'Hội đồng nên nghe được cách phá băng tâm lý, đơn giản hóa khái niệm và thiết kế bước vào bài đủ an toàn để người học muốn thử.' },
  { id: 'bo-1-c2', code: 'C2', sectionId: 'delivery', title: 'Truyền đạt nguyên tắc mà không tạo cảm giác bị dạy đời', maxScore: 25, prompt: 'Với nguyên tắc "Chốt đầu mối, chốt thời hạn, chốt cơ chế báo lại", ứng viên hãy thiết kế cách trình bày để học viên không cảm thấy bị dạy đời mà tự nhận ra mình còn thiếu; đưa ra 1 câu chuyện/ví dụ/phép so sánh cụ thể; và giải thích vì sao cách đó hiệu quả hơn việc liệt kê nguyên tắc trên slide.', guidance: 'Điểm cao khi ứng viên thể hiện được ý thức về tâm lý người học, biết kể chuyện và biết tạo trải nghiệm nhận thức.' },
  { id: 'bo-1-c3', code: 'C3', sectionId: 'delivery', title: 'Xử lý 3 nhóm trạng thái lớp trong 3 phút', maxScore: 25, prompt: 'Ứng viên đang giảng về "Phân biệt dịch vụ KH và quản trị trải nghiệm KH". Sau 10 phút giảng, ứng viên nhìn xuống lớp thấy: 1/3 học viên gật gù đồng ý, 1/3 đang nhìn điện thoại, 1/3 có vẻ mặt hoài nghi. Ứng viên sẽ xử lý thế nào trong 3 phút tiếp theo? Mô tả chính xác lời nói và hành động.', guidance: 'Câu trả lời tốt thường chuyển sang tương tác nhanh, đặt câu hỏi, tạo break pattern hoặc mini-activity thay vì tiếp tục giảng đều đều.' },
  { id: 'bo-1-c4', code: 'C4', sectionId: 'delivery', title: 'Tạo khoảnh khắc "aha" về phản hồi phát triển', maxScore: 25, prompt: 'Ứng viên cần dạy kỹ năng "Phản hồi tại chỗ: ngắn, rõ, đúng việc, đúng thời điểm" cho nhóm quản lý vốn quen nhắc việc và la mắng. Hãy thiết kế một hoạt động 20 phút có demo và đóng vai để tạo ra khoảnh khắc thay đổi nhận thức.', guidance: 'Điểm cao khi hoạt động tạo được contrast trước và sau, để học viên cảm nhận rõ khác biệt giữa phản hồi phát triển và la mắng.' },
  { id: 'bo-1-d1', code: 'D1', sectionId: 'classroom', title: 'Đối diện phản kháng từ một Trưởng Điện lực lâu năm', maxScore: 25, prompt: 'Một học viên là Trưởng Điện lực lâu năm, có uy tín, đứng lên phát biểu rằng những gì giảng viên nói về nhịp điều hành và cơ chế phối hợp nghe hay nhưng không phải chỗ nào cũng áp dụng được. Nhiều học viên khác gật đầu đồng tình. Ứng viên sẽ xử lý tình huống này như thế nào? Mô tả cụ thể phản ứng, lời nói và chiến lược tiếp theo.', guidance: 'Ứng viên tốt sẽ không phản bác trực diện cũng không nhượng bộ hoàn toàn. Họ cần ghi nhận kinh nghiệm, đặt câu hỏi khai mở và dẫn dắt cả lớp tự phản biện.' },
  { id: 'bo-1-d2', code: 'D2', sectionId: 'classroom', title: 'Quản lý lớp học đa trình độ trong bài thực hành AI', maxScore: 25, prompt: 'Trong phần thực hành "Ứng dụng AI viết prompt", ứng viên phát hiện: 5 học viên rất hào hứng và làm nhanh, 15 học viên làm được nhưng chậm, 10 học viên loay hoay không biết bắt đầu từ đâu, và 5 học viên bỏ tay ra khỏi bàn phím. Ứng viên còn 20 phút. Hãy mô tả cách xử lý để không bỏ lại ai mà cũng không kéo chậm nhóm tiên tiến.', guidance: 'Cần nhìn ra chiến thuật điều phối lớp đa trình độ: phân tầng nhiệm vụ, ghép cặp hỗ trợ, checkpoint rõ và nhịp điều hành đủ chắc.' },
  { id: 'bo-1-d3', code: 'D3', sectionId: 'classroom', title: 'Phản hồi một nhóm đang thiên về kiểm soát thay vì phát triển', maxScore: 25, prompt: 'Một nhóm trình bày kế hoạch kèm cặp 30 ngày cho 1 nhân viên yếu. Nội dung đúng về mặt kỹ thuật, nhưng toàn bộ giải pháp đều mang tính kiểm soát, không tạo động lực hay phát triển. Ứng viên sẽ phản hồi nhóm này như thế nào trước cả lớp mà vừa ghi nhận nỗ lực, vừa giúp họ nhìn ra điểm cần thay đổi?', guidance: 'Hội đồng nên quan sát xem ứng viên có thật sự "walk the talk" trong phản hồi phát triển hay không.' },
  { id: 'bo-1-d4', code: 'D4', sectionId: 'classroom', title: 'Thiết kế 15 phút kết thúc khóa để học viên muốn hành động', maxScore: 25, prompt: '15 phút cuối khóa đào tạo 2 ngày. Ứng viên cần kết thúc sao cho học viên ra về với cảm giác có giá trị thực, có ít nhất 1 cam kết hành động cụ thể sẽ triển khai trong 30 ngày, và có năng lượng tích cực cùng đồng nghiệp. Hãy mô tả kịch bản 15 phút cuối này chi tiết.', guidance: 'Điểm cao khi ứng viên hiểu closing experience không phải tổng kết nội dung mà là tạo bước chuyển từ học sang làm.' },
];

const QUESTION_SET_2_ID = 'lecturer-set-2';
const QUESTION_SET_2_CODE = 'bo-2';

const QUESTION_SET_2_SECTIONS: LecturerAssessmentSection[] = [
  {
    id: 'mcq',
    code: 'Phần A',
    title: 'Câu hỏi trắc nghiệm tình huống',
    subtitle: '14 câu sơ tuyển để đánh giá năng lực chẩn đoán, tư duy tư vấn và phản ứng lớp học.',
    maxScore: 0,
    questionCount: 14,
    tone: 'warning',
  },
  {
    id: 'short-answer',
    code: 'Phần B',
    title: 'Câu trả lời ngắn bắt buộc',
    subtitle: '6 câu tự luận ngắn để soi chiều sâu phản biện, thiết kế can thiệp và thái độ nghề.',
    maxScore: 0,
    questionCount: 6,
    tone: 'violet',
  },
];

const CASE_1_CONTEXT = `Case 1: "Thiếu chủ động" hay "thiếu điều kiện để chủ động"?\nMột tổ chức phản ánh: "Nhân sự thiếu chủ động, ngại phối hợp, việc gì cũng chờ cấp trên."\n\nDữ kiện 1: Kết quả khảo sát nội bộ 200 người\n- Tôi hiểu rõ quyền quyết định của mình: 61 -> 36\n- Tôi có thể nêu rủi ro mà không sợ bị đánh giá: 68 -> 41\n- Các phòng ban phối hợp hiệu quả: 79 -> 58\n- Tôi hiểu ưu tiên chiến lược của đơn vị: 73 -> 75\n- Tôi sẵn sàng nỗ lực thêm khi cần: 71 -> 74\n\nDữ kiện 2: Các chỉ số vận hành\n- Một sáng kiến liên phòng ban cần trung bình 5,2 lớp phê duyệt\n- Thời gian ra quyết định trung bình: 18 ngày\n- 62% đề xuất bị trả về vì "chưa đúng thẩm quyền"\n- Sau tái cơ cấu, nhiều đầu mối quản lý thay đổi nhưng chưa làm rõ chức năng, quyền hạn\n\nDữ kiện 3: Phỏng vấn sơ bộ\n- Quản lý A: "Mọi người không dám tự quyết."\n- Nhân viên B: "Tự quyết sai thì rất dễ bị hỏi trách nhiệm, còn xin ý kiến thì an toàn hơn."\n- Lãnh đạo C: "Chúng tôi cần văn hoá chủ động hơn."`;

const CASE_2_CONTEXT = `Case 2: Giá trị cốt lõi "sống" hay chỉ "được nhớ"?\nTổ chức công bố 3 giá trị cốt lõi: Khách hàng là trọng tâm - Tốc độ - Trách nhiệm.\n\nSau 18 tháng triển khai:\nDữ kiện 1\n- 86% nhân sự nhớ được ít nhất 2/3 giá trị\n- 78% quản lý đánh giá truyền thông nội bộ đã làm tốt\n\nDữ kiện 2\n- Tiêu chí khen thưởng chủ yếu là không để xảy ra sai sót, tuân thủ quy trình, tiết kiệm chi phí\n- 72% quản lý trung gian đồng ý: "Chủ động làm điều mới mà thất bại sẽ ảnh hưởng bất lợi đến đánh giá cuối năm"\n- 64% nhân sự nói: "Giải pháp nhanh cho khách hàng thường chậm lại vì phải xin đủ ý kiến"\n\nDữ kiện 3\n- Trong 20 hồ sơ khen thưởng quý gần nhất, chỉ 2 hồ sơ nêu rõ tác động tích cực đến khách hàng\n- Trong 12 quyết định nhân sự cấp quản lý gần nhất, yếu tố được nhắc nhiều nhất là an toàn, chắc chắn, ít rủi ro`;

const CASE_3_CONTEXT = `Case 3: Yêu cầu đào tạo mơ hồ từ khách hàng\nBrief ngắn: "Chúng tôi muốn triển khai chương trình VHDN để cải thiện phối hợp sau tái cơ cấu. Các đơn vị đang khá cục bộ. Mong PeopleOne đề xuất chương trình phù hợp."\n\nThông tin bổ sung\n- Chưa có dữ liệu khảo sát chính thức\n- Lãnh đạo cấp cao cho rằng "vấn đề là tư duy silo"\n- Một quản lý trung gian nói: "Vai trò mới sau tái cơ cấu còn chồng lấn"\n- Trong 3 tháng gần đây có 4 dự án chậm tiến độ do "chờ đầu mối thống nhất"`;

const CASE_4_CONTEXT = `Case 4: Thiết kế lớp học cho môi trường nhiều cấp bậc, nhạy cảm\nBối cảnh lớp học\n- 60 học viên\n- Có cả lãnh đạo, quản lý trung gian, chuyên viên\n- Chủ đề: "Vai trò lãnh đạo và quản lý trong nuôi dưỡng văn hoá thực thi"\n- Các buổi trước học viên rất ít phát biểu khi có mặt cấp trên\n- Đơn vị tổ chức muốn lớp học "thực chất, không hình thức"`;

const QUESTION_SET_2_QUESTIONS: LecturerAssessmentQuestion[] = [
  { id: 'bo-2-1', code: '1', sectionId: 'mcq', title: 'Nhận định nào được dữ kiện hỗ trợ mạnh nhất?', maxScore: 0, prompt: `${CASE_1_CONTEXT}\n\nCâu 1: Nhận định nào được dữ kiện hỗ trợ mạnh nhất?\nA. Vấn đề chính là động lực làm việc thấp\nB. Vấn đề chính là nhân sự thiếu hiểu chiến lược\nC. Vấn đề có khả năng cao nằm ở thiết kế quyền hạn, an toàn tâm lý và cơ chế ra quyết định hơn là chỉ ở thái độ cá nhân\nD. Cần tổ chức ngay khóa đào tạo truyền cảm hứng về tinh thần làm chủ`, guidance: '' },
  { id: 'bo-2-2', code: '2', sectionId: 'mcq', title: 'Nếu chỉ được chọn 1 dữ kiện bổ sung để kiểm tra giả thuyết?', maxScore: 0, prompt: `${CASE_1_CONTEXT}\n\nCâu 2: Nếu chỉ được chọn 1 dữ kiện bổ sung để kiểm tra giả thuyết "đây không chủ yếu là vấn đề mindset", nên chọn dữ kiện nào?\nA. Tỷ lệ tham gia hoạt động nội bộ 6 tháng gần nhất\nB. So sánh các nhóm có trưởng bộ phận khác nhau nhưng cùng quy trình phê duyệt\nC. Tỷ lệ nhân sự thuộc giá trị cốt lõi\nD. Mức độ hài lòng với phúc lợi`, guidance: '' },
  { id: 'bo-2-3', code: '3', sectionId: 'mcq', title: 'Đâu là 2 câu hỏi phỏng vấn khai thác thêm tốt nhất?', maxScore: 0, prompt: `${CASE_1_CONTEXT}\n\nCâu 3: Nếu phải phỏng vấn khai thác thêm, đâu là 2 câu hỏi tốt nhất?\nA. "Anh/chị có hài lòng với chính sách đãi ngộ không?"\nB. "Những quyết định nào cấp dưới đáng ra có thể tự quyết nhưng hiện phải xin nhiều cấp?"\nC. "Khi một người chủ động nhưng kết quả chưa tốt, tổ chức phản ứng như thế nào?"\nD. "Anh/chị thấy giá trị cốt lõi hiện nay có hay không?"\nE. "Theo anh/chị, nhân viên trẻ hiện nay có thiếu nhiệt huyết không?"`, guidance: '' },
  { id: 'bo-2-4', code: '4', sectionId: 'mcq', title: 'Giải pháp nào phù hợp nhất ở bước đầu?', maxScore: 0, prompt: `${CASE_1_CONTEXT}\n\nCâu 4: Giải pháp nào phù hợp nhất ở bước đầu?\nA. Làm workshop truyền động lực cho toàn bộ nhân viên\nB. Rà lại quyền hạn, tình huống ra quyết định, phản ứng của quản lý với sai số và thiết kế lại các điểm nghẽn phê duyệt\nC. Truyền thông lại giá trị "chủ động" trên toàn hệ thống\nD. Tổ chức cuộc thi kể chuyện gương điển hình`, guidance: '' },
  { id: 'bo-2-5', code: '5', sectionId: 'mcq', title: 'Kết luận nào chính xác nhất?', maxScore: 0, prompt: `${CASE_2_CONTEXT}\n\nCâu 5: Kết luận nào chính xác nhất?\nA. Văn hoá đã chuyển biến tốt vì đa số nhân sự nhớ được giá trị\nB. Vấn đề chính nằm ở truyền thông chưa đủ hấp dẫn\nC. Hệ thống củng cố hành vi đang kéo tổ chức đi ngược với giá trị được công bố\nD. Chỉ cần thay lại câu chữ của bộ giá trị`, guidance: '' },
  { id: 'bo-2-6', code: '6', sectionId: 'mcq', title: 'Leading indicator nào tốt nhất cho thấy giá trị đang bắt đầu sống?', maxScore: 0, prompt: `${CASE_2_CONTEXT}\n\nCâu 6: Dấu hiệu nào dưới đây là leading indicator tốt nhất cho thấy giá trị đang bắt đầu "sống"?\nA. Tỷ lệ nhân viên thuộc lòng giá trị tăng lên\nB. Số poster/truyền thông về giá trị tăng lên\nC. Tỷ lệ quyết định được xử lý ở cấp phù hợp tăng lên, và hồ sơ ghi nhận hành vi bám khách hàng/thử nghiệm có trách nhiệm tăng lên\nD. Số sự kiện văn hoá tăng lên`, guidance: '' },
  { id: 'bo-2-7', code: '7', sectionId: 'mcq', title: 'Điểm yếu lớn nhất của giải pháp truyền thông giá trị là gì?', maxScore: 0, prompt: `${CASE_2_CONTEXT}\n\nCâu 7: Nếu một ứng viên tư vấn đề xuất giải pháp sau: "Làm lại bộ nhận diện giá trị, sản xuất video cảm hứng, tổ chức lễ cam kết, yêu cầu toàn thể nhân sự học thuộc chuẩn hành vi". Điểm yếu lớn nhất của giải pháp là gì?\nA. Thiếu sáng tạo truyền thông\nB. Chưa xử lý tầng cơ chế, quản lý và tiêu chí đánh giá hành vi\nC. Quá tốn chi phí\nD. Không phù hợp với nhân sự trẻ`, guidance: '' },
  { id: 'bo-2-8', code: '8', sectionId: 'mcq', title: 'Nếu chỉ được chọn 1 nhóm đối tượng để can thiệp trước?', maxScore: 0, prompt: `${CASE_2_CONTEXT}\n\nCâu 8: Nếu chỉ được chọn 1 nhóm đối tượng để can thiệp trước, nhóm nào nên ưu tiên nhất?\nA. Toàn bộ nhân viên tuyến đầu\nB. Bộ phận truyền thông nội bộ\nC. Quản lý trung gian và người ra quyết định nhân sự/khen thưởng\nD. Nhân sự mới gia nhập`, guidance: '' },
  { id: 'bo-2-9', code: '9', sectionId: 'mcq', title: 'Giả thuyết nào nên được giữ đồng thời, chưa vội loại bỏ?', maxScore: 0, prompt: `${CASE_3_CONTEXT}\n\nCâu 9: Trong giai đoạn đầu, giả thuyết nào nên được giữ đồng thời, chưa vội loại bỏ?\nA. Chỉ là vấn đề thái độ phối hợp\nB. Chỉ là vấn đề cơ cấu chức năng\nC. Có thể vừa là lệch vai trò/quyền hạn sau tái cơ cấu, vừa là thói quen silo được cơ chế cũ nuôi dưỡng\nD. Chắc chắn là do nhân sự chưa hiểu văn hoá mới`, guidance: '' },
  { id: 'bo-2-10', code: '10', sectionId: 'mcq', title: 'Bộ 3 câu hỏi nào sắc nhất để khám phá vấn đề ban đầu?', maxScore: 0, prompt: `${CASE_3_CONTEXT}\n\nCâu 10: Bộ 3 câu hỏi nào dưới đây sắc nhất để khám phá vấn đề ban đầu?\nA. "Ngân sách dự kiến là bao nhiêu?" - "Dự kiến tổ chức offline hay online?" - "Số lượng học viên bao nhiêu?"\nB. "Những tình huống phối hợp nào đang gây thiệt hại rõ nhất?" - "Sau tái cơ cấu, quyền quyết định nào đang chồng lấn?" - "Trong các ca phối hợp thất bại, đâu là bước hệ thống khiến mọi người quay lại hành vi cục bộ?"\nC. "Giá trị cốt lõi hiện nay gồm những gì?" - "Nhân viên có nhớ không?" - "Đã truyền thông bao nhiêu lần?"\nD. "Ai là người duyệt cuối?" - "Bao giờ cần triển khai?" - "Có cần làm video mở đầu không?"`, guidance: '' },
  { id: 'bo-2-11', code: '11', sectionId: 'mcq', title: 'Dấu hiệu nào cho thấy ứng viên đang có tư duy tư vấn yếu?', maxScore: 0, prompt: `${CASE_3_CONTEXT}\n\nCâu 11: Dấu hiệu nào cho thấy ứng viên đang có tư duy tư vấn yếu?\nA. Chưa vội chốt giải pháp, muốn làm rõ hành vi cần thay đổi\nB. Đặt giả thuyết song song về cơ cấu, cơ chế và hành vi\nC. Đề xuất ngay chương trình đào tạo 2 ngày khi chưa xác định rõ biểu hiện, nguyên nhân và đối tượng\nD. Muốn phân nhóm đối tượng trước khi thiết kế nội dung`, guidance: '' },
  { id: 'bo-2-12', code: '12', sectionId: 'mcq', title: 'Thiết kế mở đầu nào phù hợp nhất?', maxScore: 0, prompt: `${CASE_4_CONTEXT}\n\nCâu 12: Thiết kế mở đầu nào phù hợp nhất?\nA. Mời lãnh đạo cao nhất phát biểu 20 phút trước để định hướng tinh thần\nB. Giảng viên trình bày 30 phút lý thuyết nền trước, sau đó hỏi ai có ý kiến\nC. Dùng tình huống ngắn trung tính, cho học viên thảo luận nhóm đồng cấp hoặc nhóm nhỏ ẩn danh trước, rồi mới kéo ra đối thoại chung theo lớp\nD. Gọi ngẫu nhiên từng học viên phát biểu ngay từ đầu`, guidance: '' },
  { id: 'bo-2-13', code: '13', sectionId: 'mcq', title: 'Phản ứng nào của giảng viên chất lượng nhất?', maxScore: 0, prompt: `${CASE_4_CONTEXT}\n\nGiữa lớp, một quản lý cấp trung nói: "Thực ra nói văn hoá thì hay, nhưng ở đây ai cũng biết cuối cùng vẫn phải chờ ý sếp."\n\nCâu 13: Phản ứng nào của giảng viên chất lượng nhất?\nA. "Anh nói vậy là tiêu cực quá."\nB. "Không đúng, văn hoá là do mỗi người tự thay đổi."\nC. "Ý anh đang gợi ra một điểm rất quan trọng: khi hệ thống ra quyết định và văn hoá va nhau, hành vi nào sẽ thắng? Ta thử bóc tách bằng một tình huống cụ thể."\nD. "Ý kiến này nhạy cảm, ta chuyển sang phần sau."`, guidance: '' },
  { id: 'bo-2-14', code: '14', sectionId: 'mcq', title: 'Phương án nào tốt nhất để đánh giá hiệu quả sau lớp?', maxScore: 0, prompt: `${CASE_4_CONTEXT}\n\nCâu 14: Nếu mục tiêu là đánh giá hiệu quả sau lớp học này, phương án nào tốt nhất?\nA. Chỉ đo mức độ hài lòng cuối buổi\nB. Đo số lượt phát biểu trong lớp\nC. Kết hợp: cam kết hành vi cụ thể theo từng cấp, phản hồi sau 4–6 tuần từ quản lý/đồng cấp, và bằng chứng thay đổi ở các tình huống phối hợp/ra quyết định\nD. Chỉ yêu cầu viết cảm nhận sau lớp`, guidance: '' },
  { id: 'bo-2-15', code: '15', sectionId: 'short-answer', title: 'Phản biện khách hàng ở Case 1 mà vẫn giữ quan hệ', maxScore: 0, prompt: `Câu 15 - Dựa trên Case 1, hãy cho biết:\nNếu khách hàng vẫn khăng khăng rằng "đây chủ yếu là vấn đề thiếu chủ động", anh/chị sẽ phản biện như thế nào để vừa giữ quan hệ, vừa không chẩn đoán sai bài toán?\n\nYêu cầu: Trả lời ngắn gọn, súc tích trong vòng 200 từ.`, guidance: '' },
  { id: 'bo-2-16', code: '16', sectionId: 'short-answer', title: '3 câu hỏi cho lãnh đạo cấp cao và 3 câu hỏi cho quản lý trung gian', maxScore: 0, prompt: `Câu 16 - Dựa trên Case 3, hãy viết:\n- 3 câu hỏi đầu tiên anh/chị sẽ hỏi lãnh đạo cấp cao\n- 3 câu hỏi đầu tiên anh/chị sẽ hỏi quản lý trung gian\n\nYêu cầu:\n- Câu hỏi phải khác nhau về mục đích\n- Không hỏi lan man\n- Phải giúp bóc được bản chất vấn đề`, guidance: '' },
  { id: 'bo-2-17', code: '17', sectionId: 'short-answer', title: 'Thiết kế phiên 90 phút cho nhóm nhiều cấp bậc', maxScore: 0, prompt: `Câu 17 - Dựa trên Case 2 và Case 4, hãy cho biết:\nNếu được giao thiết kế một phiên 90 phút cho nhóm có nhiều cấp bậc, với mục tiêu không chỉ "nói về giá trị" mà buộc người học nhận ra điểm lệch giữa giá trị công bố và cơ chế thực thi, anh/chị sẽ thiết kế 3 phần chính của phiên đó như thế nào?\n\nYêu cầu: Trả lời ngắn gọn, súc tích trong vòng 200 từ.`, guidance: '' },
  { id: 'bo-2-18', code: '18', sectionId: 'short-answer', title: 'Vì sao khóa học rất sôi động nhưng hành vi không đổi?', maxScore: 0, prompt: `Câu 18:\nMột doanh nghiệp nhà nước mời đơn vị đào tạo bên ngoài về giảng "Văn hóa doanh nghiệp" cho 200 nhân viên. Khóa học 1 ngày diễn ra rất sôi động: có video, có trò chơi, có cam kết cuối khóa. Khảo sát hài lòng: 92% hài lòng. Sau 3 tháng, quan sát cho thấy hành vi nhân viên hầu như không thay đổi.\n\nTheo Anh/Chị, nguyên nhân chính có thể là gì?`, guidance: '' },
  { id: 'bo-2-19', code: '19', sectionId: 'short-answer', title: 'Xử lý khi gặp câu hỏi thực tiễn mình không biết câu trả lời', maxScore: 0, prompt: `Câu 19:\nAnh/Chị đang giảng một nội dung mà Anh/Chị rất tự tin. Giữa buổi, một học viên đặt câu hỏi mà Anh/Chị nhận ra mình KHÔNG biết câu trả lời. Đó là câu hỏi liên quan trực tiếp đến thực tiễn Điện lực — một lĩnh vực học viên hiểu rõ hơn Anh/Chị.\n\nAnh/Chị sẽ phản ứng như thế nào trong tình huống này?`, guidance: '' },
  { id: 'bo-2-20', code: '20', sectionId: 'short-answer', title: 'Phản ứng đầu tiên khi nhận một yêu cầu đào tạo mới rất nặng nghiên cứu', maxScore: 0, prompt: `Câu 20:\nPeopleOne chuẩn bị triển khai chương trình đào tạo cho Khách hàng X với nội dung rất mới — kết hợp VHDN và trải nghiệm khách hàng. Để giảng dạy, giảng viên cần nghiên cứu sâu Bộ tài liệu văn hóa mới của khách hàng (khoảng 40 trang), đề cương 3 chuyên đề (khoảng 50 trang), và tìm hiểu thực tiễn đặc thù khách hàng.\n\nKhi nhận được yêu cầu này, phản ứng đầu tiên gần nhất với Anh/Chị là gì? Anh/Chị có suy nghĩ gì?`, guidance: '' },
];

export const LECTURER_ASSESSMENT_RANKINGS = [
  { label: 'Xuất sắc', rule: '>= 360 điểm / 80%', tone: 'success' as const },
  { label: 'Khá', rule: '>= 270 điểm / 60%', tone: 'violet' as const },
  { label: 'Trung bình', rule: '>= 180 điểm / 40%', tone: 'warning' as const },
  { label: 'Chưa đạt', rule: '< 180 điểm', tone: 'danger' as const },
];

function requireSupabase() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.');
  return supabase;
}

function isMissingSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /question_set|question_sets|question_id|question_set_id|relation .* does not exist|column .* does not exist/i.test(message);
}

function buildBuiltinQuestionSets(): LecturerQuestionSetBundle[] {
  return [
    {
      set: {
        id: DEFAULT_SET_ID,
        code: DEFAULT_SET_CODE,
        name: 'Bộ 1',
        description: 'Bộ câu hỏi mặc định hiện tại.',
        status: 'active',
        sectionCount: DEFAULT_SECTIONS.length,
        questionCount: DEFAULT_QUESTIONS.length,
        createdAt: new Date(2026, 3, 9).toISOString(),
      },
      sections: DEFAULT_SECTIONS,
      questions: DEFAULT_QUESTIONS,
    },
    {
      set: {
        id: QUESTION_SET_2_ID,
        code: QUESTION_SET_2_CODE,
        name: 'Bộ 2',
        description: 'Bộ sơ tuyển giảng viên về văn hóa doanh nghiệp theo file Bộ câu hỏi giảng viên 2.',
        status: 'active',
        sectionCount: QUESTION_SET_2_SECTIONS.length,
        questionCount: QUESTION_SET_2_QUESTIONS.length,
        createdAt: new Date(2026, 3, 9).toISOString(),
      },
      sections: QUESTION_SET_2_SECTIONS,
      questions: QUESTION_SET_2_QUESTIONS,
    },
  ];
}

function buildDefaultSet(): LecturerQuestionSet {
  return {
    id: DEFAULT_SET_ID,
    code: DEFAULT_SET_CODE,
    name: 'Bộ 1',
    description: 'Bộ câu hỏi mặc định hiện tại.',
    status: 'active',
    sectionCount: DEFAULT_SECTIONS.length,
    questionCount: DEFAULT_QUESTIONS.length,
    createdAt: new Date(2026, 3, 9).toISOString(),
  };
}

function buildDefaultBundle(): LecturerQuestionSetBundle {
  return {
    set: buildDefaultSet(),
    sections: DEFAULT_SECTIONS,
    questions: DEFAULT_QUESTIONS,
  };
}

function getBuiltinBundle(questionSetId?: string) {
  return buildBuiltinQuestionSets().find((item) => item.set.id === questionSetId) || buildDefaultBundle();
}

function listBuiltinSets() {
  return buildBuiltinQuestionSets().map((item) => item.set);
}

function mapFormRow(row: any): LecturerAssessmentForm {
  return {
    id: String(row.id),
    title: String(row.title || ''),
    intro: String(row.intro || ''),
    createdAt: String(row.created_at || new Date().toISOString()),
    status: row.status === 'paused' ? 'paused' : 'active',
    questionSetId: String(row.question_set_id || DEFAULT_SET_ID),
  };
}

function mapSubmissionRow(row: any): LecturerAssessmentSubmission {
  return {
    id: String(row.id),
    formId: String(row.form_id),
    lecturerName: String(row.lecturer_name || ''),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    yearsTeaching: String(row.years_teaching || ''),
    notes: String(row.notes || ''),
    answers: row.answers && typeof row.answers === 'object' ? row.answers : {},
    submittedAt: String(row.submitted_at || new Date().toISOString()),
  };
}

function mapQuestionSetRow(row: any, sectionCount = 0, questionCount = 0): LecturerQuestionSet {
  return {
    id: String(row.id),
    code: String(row.code || ''),
    name: String(row.name || ''),
    description: String(row.description || ''),
    status: row.status === 'draft' ? 'draft' : 'active',
    sectionCount,
    questionCount,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function normalizeQuestionOptions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => ({
      id: String(item?.id || '').trim(),
      text: String(item?.text || '').trim(),
    }))
    .filter((item) => item.id && item.text);
}

function normalizeQuestionType(value: unknown): LecturerAssessmentQuestion['questionType'] {
  if (value === 'short_text' || value === 'single_choice' || value === 'multiple_choice') return value;
  return 'long_text';
}

function makeFormId() {
  return `LAF-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeSubmissionId() {
  return `LAS-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function sanitizeAssessmentFormId(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getSectionQuestions(sectionId: string, questions = DEFAULT_QUESTIONS) {
  return questions.filter((question) => question.sectionId === sectionId);
}

export async function ensureDefaultQuestionSet() {
  const client = requireSupabase();
  try {
    const { data: found, error: findError } = await client
      .from('vcontent_lecturer_question_sets')
      .select('id')
      .eq('id', DEFAULT_SET_ID)
      .maybeSingle();
    if (findError) throw findError;
    if (found) return buildDefaultSet();

    const now = new Date().toISOString();
    const { error: setError } = await client.from('vcontent_lecturer_question_sets').insert({
      id: DEFAULT_SET_ID,
      code: DEFAULT_SET_CODE,
      name: 'Bộ 1',
      description: 'Bộ câu hỏi mặc định hiện tại.',
      status: 'active',
    });
    if (setError) throw setError;

    const { error: sectionError } = await client.from('vcontent_lecturer_question_set_sections').insert(
      DEFAULT_SECTIONS.map((section, index) => ({
        id: `${DEFAULT_SET_ID}-${section.id}`,
        question_set_id: DEFAULT_SET_ID,
        code: section.code,
        title: section.title,
        subtitle: section.subtitle,
        max_score: section.maxScore,
        question_count: section.questionCount,
        tone: section.tone,
        sort_order: index,
        created_at: now,
      })),
    );
    if (sectionError) throw sectionError;

    const sectionIndexById = new Map(DEFAULT_SECTIONS.map((section) => [section.id, section]));
    const { error: questionError } = await client.from('vcontent_lecturer_question_set_questions').insert(
      DEFAULT_QUESTIONS.map((question, index) => ({
        id: question.id,
        question_set_id: DEFAULT_SET_ID,
        section_id: `${DEFAULT_SET_ID}-${question.sectionId}`,
        code: question.code,
        title: question.title,
        prompt: question.prompt,
        guidance: question.guidance,
        max_score: question.maxScore,
        sort_order: index,
        created_at: now,
      })),
    );
    if (questionError) throw questionError;

    const { error: backfillError } = await client
      .from('vcontent_lecturer_assessment_forms')
      .update({ question_set_id: DEFAULT_SET_ID })
      .is('question_set_id', null);
    if (backfillError && !isMissingSchemaError(backfillError)) throw backfillError;

    return buildDefaultSet();
  } catch (error) {
    if (isMissingSchemaError(error)) return buildDefaultSet();
    throw error;
  }
}

async function ensureBuiltinQuestionSetLibrary() {
  const client = requireSupabase();
  try {
    await ensureDefaultQuestionSet();
    const secondBundle = getBuiltinBundle(QUESTION_SET_2_ID);
    const { data: found, error: findError } = await client
      .from('vcontent_lecturer_question_sets')
      .select('id')
      .eq('id', secondBundle.set.id)
      .maybeSingle();
    if (findError) throw findError;
    if (found) return secondBundle.set;

    const now = new Date().toISOString();
    const { error: setError } = await client.from('vcontent_lecturer_question_sets').insert({
      id: secondBundle.set.id,
      code: secondBundle.set.code,
      name: secondBundle.set.name,
      description: secondBundle.set.description,
      status: secondBundle.set.status,
    });
    if (setError) throw setError;

    const { error: sectionError } = await client.from('vcontent_lecturer_question_set_sections').insert(
      secondBundle.sections.map((section, index) => ({
        id: `${secondBundle.set.id}-${section.id}`,
        question_set_id: secondBundle.set.id,
        code: section.code,
        title: section.title,
        subtitle: section.subtitle,
        max_score: section.maxScore,
        question_count: section.questionCount,
        tone: section.tone,
        sort_order: index,
        created_at: now,
      })),
    );
    if (sectionError) throw sectionError;

    const { error: questionError } = await client.from('vcontent_lecturer_question_set_questions').insert(
      secondBundle.questions.map((question, index) => ({
        id: question.id,
        question_set_id: secondBundle.set.id,
        section_id: `${secondBundle.set.id}-${question.sectionId}`,
        code: question.code,
        title: question.title,
        prompt: question.prompt,
        guidance: question.guidance,
        max_score: question.maxScore,
        sort_order: index,
        created_at: now,
      })),
    );
    if (questionError) throw questionError;

    return secondBundle.set;
  } catch (error) {
    if (isMissingSchemaError(error)) return buildDefaultSet();
    throw error;
  }
}

export async function listQuestionSets() {
  const client = requireSupabase();
  try {
    await ensureBuiltinQuestionSetLibrary();
    const [{ data: sets, error: setsError }, { data: sections, error: sectionsError }, { data: questions, error: questionsError }] = await Promise.all([
      client.from('vcontent_lecturer_question_sets').select('id,code,name,description,status,created_at').order('created_at', { ascending: false }),
      client.from('vcontent_lecturer_question_set_sections').select('question_set_id'),
      client.from('vcontent_lecturer_question_set_questions').select('question_set_id'),
    ]);
    if (setsError) throw setsError;
    if (sectionsError) throw sectionsError;
    if (questionsError) throw questionsError;

    const sectionCounts = (sections || []).reduce<Record<string, number>>((acc, row: any) => {
      acc[String(row.question_set_id)] = (acc[String(row.question_set_id)] || 0) + 1;
      return acc;
    }, {});
    const questionCounts = (questions || []).reduce<Record<string, number>>((acc, row: any) => {
      acc[String(row.question_set_id)] = (acc[String(row.question_set_id)] || 0) + 1;
      return acc;
    }, {});

    return (sets || []).map((row: any) =>
      mapQuestionSetRow(row, sectionCounts[String(row.id)] || 0, questionCounts[String(row.id)] || 0),
    );
  } catch (error) {
    if (isMissingSchemaError(error)) return listBuiltinSets();
    throw error;
  }
}

export async function getQuestionSetBundle(questionSetId: string) {
  const client = requireSupabase();
  try {
    await ensureBuiltinQuestionSetLibrary();
    const [{ data: setRow, error: setError }, { data: sections, error: sectionsError }, { data: questions, error: questionsError }] = await Promise.all([
      client.from('vcontent_lecturer_question_sets').select('id,code,name,description,status,created_at').eq('id', questionSetId).maybeSingle(),
      client
        .from('vcontent_lecturer_question_set_sections')
        .select('id,code,title,subtitle,max_score,question_count,tone,sort_order')
        .eq('question_set_id', questionSetId)
        .order('sort_order', { ascending: true }),
      client
        .from('vcontent_lecturer_question_set_questions')
        .select('id,code,section_id,title,prompt,guidance,max_score,sort_order,question_type,options,correct_option_id,is_required')
        .eq('question_set_id', questionSetId)
        .order('sort_order', { ascending: true }),
    ]);
    if (setError) throw setError;
    if (sectionsError) throw sectionsError;
    if (questionsError) throw questionsError;
    if (!setRow) return getBuiltinBundle(questionSetId);

    const mappedSections = (sections || []).map((row: any) => ({
      id: String(row.id),
      code: String(row.code || ''),
      title: String(row.title || ''),
      subtitle: String(row.subtitle || ''),
      maxScore: Number(row.max_score || 0),
      questionCount: Number(row.question_count || 0),
      tone: row.tone === 'danger' || row.tone === 'warning' || row.tone === 'success' || row.tone === 'violet' ? row.tone : 'warning',
    })) as LecturerAssessmentSection[];
    const sectionIdToShortId = new Map(mappedSections.map((section) => [section.id, section.id.replace(`${questionSetId}-`, '')]));
    const mappedQuestions = (questions || []).map((row: any) => ({
      id: String(row.id),
      code: String(row.code || ''),
      sectionId: sectionIdToShortId.get(String(row.section_id)) || String(row.section_id),
      title: String(row.title || ''),
      prompt: String(row.prompt || ''),
      guidance: String(row.guidance || ''),
      maxScore: Number(row.max_score || 0),
      questionType: normalizeQuestionType(row.question_type),
      options: normalizeQuestionOptions(row.options),
      correctOptionId: row.correct_option_id ? String(row.correct_option_id) : null,
      required: row.is_required !== false,
    })) as LecturerAssessmentQuestion[];

    return {
      set: mapQuestionSetRow(setRow, mappedSections.length, mappedQuestions.length),
      sections: mappedSections.map((section) => ({ ...section, id: section.id.replace(`${questionSetId}-`, '') })),
      questions: mappedQuestions,
    };
  } catch (error) {
    if (isMissingSchemaError(error)) return getBuiltinBundle(questionSetId);
    throw error;
  }
}

async function listAssessmentFormsInternal() {
  const client = requireSupabase();
  const primary = await client
    .from('vcontent_lecturer_assessment_forms')
    .select('id,title,intro,status,created_at,question_set_id')
    .order('created_at', { ascending: false });
  if (!primary.error) {
    return (primary.data || []).map(mapFormRow);
  }
  if (!isMissingSchemaError(primary.error)) throw primary.error;

  const legacy = await client
    .from('vcontent_lecturer_assessment_forms')
    .select('id,title,intro,status,created_at')
    .order('created_at', { ascending: false });
  if (legacy.error) throw legacy.error;
  return (legacy.data || []).map(mapFormRow);
}

export async function listAssessmentForms() {
  await ensureDefaultQuestionSet();
  return listAssessmentFormsInternal();
}

export async function createAssessmentForm(input?: LecturerAssessmentFormInput) {
  const client = requireSupabase();
  const sessionResult = await client.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  const defaultSet = await ensureBuiltinQuestionSetLibrary();

  const requestedId = sanitizeAssessmentFormId(String(input?.id || ''));
  const formId = requestedId || makeFormId();
  const questionSetId = input?.questionSetId || defaultSet.id;

  if (requestedId) {
    const existing = await getAssessmentForm(formId);
    if (existing) throw new Error('Mã link này đã tồn tại. Hãy chọn mã khác.');
  }

  const payload = {
    id: formId,
    title: input?.title?.trim() || 'Đánh giá giảng viên EVNSPC',
    intro: input?.intro?.trim() || 'Vui lòng trả lời đầy đủ bộ câu hỏi được chọn.',
    status: 'active',
    created_by_auth_user_id: sessionResult.data.session?.user?.id || null,
    question_set_id: questionSetId,
  };

  const primary = await client
    .from('vcontent_lecturer_assessment_forms')
    .insert(payload)
    .select('id,title,intro,status,created_at,question_set_id')
    .single();
  if (!primary.error) return mapFormRow(primary.data);
  if (!isMissingSchemaError(primary.error)) throw primary.error;

  const legacy = await client
    .from('vcontent_lecturer_assessment_forms')
    .insert({
      id: payload.id,
      title: payload.title,
      intro: payload.intro,
      status: payload.status,
      created_by_auth_user_id: payload.created_by_auth_user_id,
    })
    .select('id,title,intro,status,created_at')
    .single();
  if (legacy.error) throw legacy.error;
  return mapFormRow({ ...legacy.data, question_set_id: questionSetId });
}

export async function getAssessmentForm(formId: string) {
  const forms = await listAssessmentFormsInternal();
  return forms.find((form) => form.id === formId) || null;
}

export async function getAssessmentFormBundle(formId: string): Promise<LecturerAssessmentFormBundle | null> {
  const form = await getAssessmentForm(formId);
  if (!form || form.status !== 'active') return null;
  const bundle = await getQuestionSetBundle(form.questionSetId || DEFAULT_SET_ID);
  return { form, questionSet: bundle.set, sections: bundle.sections, questions: bundle.questions };
}

export async function updateAssessmentFormStatus(formId: string, status: LecturerAssessmentForm['status']) {
  const client = requireSupabase();
  const primary = await client
    .from('vcontent_lecturer_assessment_forms')
    .update({ status })
    .eq('id', formId)
    .select('id,title,intro,status,created_at,question_set_id')
    .single();
  if (!primary.error) return mapFormRow(primary.data);
  if (!isMissingSchemaError(primary.error)) throw primary.error;

  const legacy = await client
    .from('vcontent_lecturer_assessment_forms')
    .update({ status })
    .eq('id', formId)
    .select('id,title,intro,status,created_at')
    .single();
  if (legacy.error) throw legacy.error;
  return mapFormRow(legacy.data);
}

export async function listAssessmentSubmissions(formId?: string) {
  const client = requireSupabase();
  let query = client
    .from('vcontent_lecturer_assessment_submissions')
    .select('id,form_id,lecturer_name,email,phone,years_teaching,notes,answers,submitted_at')
    .order('submitted_at', { ascending: false });
  if (formId) query = query.eq('form_id', formId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapSubmissionRow);
}

export async function saveAssessmentSubmission(payload: Omit<LecturerAssessmentSubmission, 'id' | 'submittedAt'>) {
  const client = requireSupabase();
  const submissionId = makeSubmissionId();
  const submittedAt = new Date().toISOString();
  const { error } = await client
    .from('vcontent_lecturer_assessment_submissions')
    .insert({
      id: submissionId,
      form_id: payload.formId,
      lecturer_name: payload.lecturerName.trim(),
      email: payload.email.trim(),
      phone: payload.phone.trim() || null,
      years_teaching: payload.yearsTeaching.trim() || null,
      notes: payload.notes.trim() || null,
      answers: payload.answers || {},
    });
  if (error) throw error;
  return {
    id: submissionId,
    formId: payload.formId,
    lecturerName: payload.lecturerName.trim(),
    email: payload.email.trim(),
    phone: payload.phone.trim(),
    yearsTeaching: payload.yearsTeaching.trim(),
    notes: payload.notes.trim(),
    answers: payload.answers || {},
    submittedAt,
  };
}

export function buildAssessmentShareLink(formId: string) {
  if (typeof window === 'undefined') return `/apply/lecturer/${formId}`;
  return `${window.location.origin}/apply/lecturer/${formId}`;
}

export function downloadTextFile(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportSubmissionsToCsv(rows: LecturerAssessmentSubmission[], questions = DEFAULT_QUESTIONS) {
  const header = ['submitted_at', 'lecturer_name', 'email', 'phone', 'years_teaching', 'notes', ...questions.map((q) => q.code)];
  const escapeCell = (value: string) => `"${String(value || '').replace(/"/g, '""')}"`;
  return [
    header.join(','),
    ...rows.map((row) =>
      [
        row.submittedAt,
        row.lecturerName,
        row.email,
        row.phone,
        row.yearsTeaching,
        row.notes,
        ...questions.map((question) => formatLecturerAssessmentAnswer(row.answers[question.code])),
      ]
        .map(escapeCell)
        .join(','),
    ),
  ].join('\n');
}
