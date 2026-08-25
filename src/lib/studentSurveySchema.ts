export type SurveySegment = { id: string; label: string };

export type SurveyTouchpoint = {
  id: string;
  title: string;
  defaultImpact: number;
  issues: string[];
};

export type SurveyJourney = {
  id: string;
  title: string;
  description: string;
  segmentIds: string[];
  touchpoints: SurveyTouchpoint[];
};

export type SurveySupportGroup = {
  id: string;
  title: string;
  fields: string[];
};

export type SurveyExtraField = {
  key: string;
  label: string;
  rows: number;
};

export type StudentSurveySchema = {
  segments: {
    household: SurveySegment[];
    business: SurveySegment[];
  };
  journeys: SurveyJourney[];
  extras: {
    negativeBehaviors: string[];
    supportNeeds: SurveySupportGroup[];
    energyFields: SurveyExtraField[];
    measurementFields: SurveyExtraField[];
  };
};

const HOUSEHOLD_SEGMENTS: SurveySegment[] = [
  { id: 'sh1', label: 'Hộ cư dân thông thường' },
  { id: 'sh2', label: 'Chung cư, khu đô thị mới' },
  { id: 'sh3', label: 'Hộ nghèo, cận nghèo, gia đình chính sách' },
  { id: 'sh4', label: 'Người cao tuổi sống một mình, người khuyết tật' },
  { id: 'sh5', label: 'Hộ dân vùng sâu, vùng xa, hải đảo' },
  { id: 'sh6', label: 'Hộ dân có nhu cầu chuyển dịch năng lượng' },
];

const BUSINESS_SEGMENTS: SurveySegment[] = [
  { id: 'nsh1', label: 'Doanh nghiệp sản xuất vừa và nhỏ' },
  { id: 'nsh2', label: 'Doanh nghiệp, tập đoàn lớn trong nước' },
  { id: 'nsh3', label: 'Doanh nghiệp có vốn đầu tư nước ngoài (FDI)' },
  { id: 'nsh4', label: 'Hộ sản xuất kinh doanh cá thể, tiểu thương' },
  { id: 'nsh5', label: 'Cơ quan hành chính, trường học, bệnh viện' },
  { id: 'nsh6', label: 'Doanh nghiệp chuyển dịch năng lượng' },
];

const ALL_SEGMENT_IDS = [...HOUSEHOLD_SEGMENTS, ...BUSINESS_SEGMENTS].map((item) => item.id);

const JOURNEYS: SurveyJourney[] = [
  {
    id: 'j1',
    title: 'Cấp điện mới',
    description:
      'Toàn bộ quy trình từ khi khách hàng có nhu cầu sử dụng điện đến khi đóng điện thành công.',
    segmentIds: ALL_SEGMENT_IDS,
    touchpoints: [
      {
        id: 't1',
        title: 'Tìm kiếm thông tin về dịch vụ cấp điện',
        defaultImpact: 4,
        issues: [
          'Khách hàng không biết liên hệ ai, qua kênh nào',
          'Thông tin trên website, ứng dụng khó tìm, không rõ ràng',
          'Nhân viên trả lời không đầy đủ, phải gọi lại nhiều lần',
        ],
      },
      {
        id: 't2',
        title: 'Liên hệ tổng đài hoặc đến quầy giao dịch',
        defaultImpact: 4,
        issues: [
          'Tổng đài bận, chờ lâu mới được tiếp nhận (tiêu chuẩn: dưới 20 giây)',
          'Điện thoại viên không khai thác đủ thông tin để hướng dẫn đúng',
          'Không phân biệt được khách hàng cần cấp điện hạ áp hay trung áp',
          'Không hướng dẫn hồ sơ đầy đủ ngay lần liên hệ đầu',
        ],
      },
      {
        id: 't3',
        title: 'Nhân viên tư vấn quy trình và tiếp nhận hồ sơ',
        defaultImpact: 4,
        issues: [
          'Nhân viên tư vấn hời hợt, không giải thích rõ quy trình',
          'Yêu cầu hồ sơ phức tạp, bổ sung nhiều lần',
          'Thái độ thiếu kiên nhẫn, tỏ ra khó chịu',
        ],
      },
      {
        id: 't4',
        title: 'Nộp hồ sơ (trực tuyến hoặc trực tiếp)',
        defaultImpact: 3,
        issues: [
          'Khó khăn trong triển khai ký hợp đồng điện tử với khách hàng',
          'Yêu cầu bổ sung giấy tờ gây mất thời gian đi lại',
          'Hệ thống trực tuyến lỗi, không hoàn tất được',
        ],
      },
      {
        id: 't5',
        title: 'Nhân viên khảo sát hiện trường',
        defaultImpact: 3,
        issues: [
          'Trễ hẹn không báo trước',
          'Thái độ vội vã, không giải thích phương án kỹ thuật',
          'Không giới thiệu bản thân, không xuất trình thẻ nhân viên',
          'Giải thích bằng thuật ngữ chuyên ngành khách hàng không hiểu',
        ],
      },
      {
        id: 't6',
        title: 'Lập phương án và báo giá (trung áp)',
        defaultImpact: 3,
        issues: [
          'Chi phí không minh bạch, phát sinh ngoài dự kiến',
          'Thời gian ra báo giá chậm',
          'Nhân viên không giải thích rõ ranh giới phân định tài sản',
        ],
      },
      {
        id: 't7',
        title: 'Ký HĐMBĐ và thanh toán chi phí',
        defaultImpact: 3,
        issues: [
          'Nhân viên không giải thích rõ các khoản phí',
          'Khách hàng không hiểu các điều khoản pháp lý trong hợp đồng',
        ],
      },
      {
        id: 't8',
        title: 'Thi công lắp đặt',
        defaultImpact: 4,
        issues: [
          'Trễ tiến độ, không thông báo',
          'Gây ảnh hưởng sinh hoạt hoặc kinh doanh',
          'Không dọn dẹp sau thi công',
          'Không giữ gìn tài sản khách hàng trong quá trình thi công',
        ],
      },
      {
        id: 't9',
        title: 'Đóng điện, bàn giao và hướng dẫn',
        defaultImpact: 3,
        issues: [
          'Không hướng dẫn sử dụng, cài ứng dụng CSKH',
          'Không thông tin quyền lợi và kênh liên hệ',
          'Không liên hệ hỏi thăm sau đóng điện',
        ],
      },
    ],
  },
  {
    id: 'j2',
    title: 'Quản lý sử dụng điện và Thanh toán',
    description:
      'Ghi chỉ số, hóa đơn, thanh toán, kiểm tra công tơ, ngừng cấp điện do nợ.',
    segmentIds: ALL_SEGMENT_IDS,
    touchpoints: [
      {
        id: 't1',
        title: 'Nhân viên ghi chỉ số công tơ tại nhà khách hàng',
        defaultImpact: 3,
        issues: [
          'Sản lượng ghi nhận không khớp thực tế',
          'Khách hàng vắng nhà, nhân viên tạm tính mà không thông báo',
          'Không cho khách hàng biết kết quả ghi chỉ số',
        ],
      },
      {
        id: 't2',
        title: 'Kiểm tra hoặc kiểm định công tơ',
        defaultImpact: 3,
        issues: [
          'Khách hàng không hiểu tại sao phải thay công tơ định kỳ',
          'Nhân viên thay công tơ không hẹn trước, không giải thích',
          'Khách hàng nghi ngờ công tơ mới chạy nhanh hơn công tơ cũ',
          'Kết quả kiểm định không được giải thích rõ',
        ],
      },
      {
        id: 't3',
        title: 'Lập và phát hành hóa đơn tiền điện',
        defaultImpact: 5,
        issues: [
          'Hóa đơn tăng bất thường',
          'Khách hàng không hiểu cơ chế giá bậc thang',
          'Chuyển phiên ghi dẫn đến số ngày tính tăng',
          'Không nhận được hóa đơn đúng kỳ',
        ],
      },
      {
        id: 't4',
        title: 'Khách hàng nhận thông báo thanh toán',
        defaultImpact: 4,
        issues: [
          'App CSKH bị lỗi khi lượng truy cập cao',
          'Khách hàng không có điện thoại thông minh',
          'Thông báo qua SMS/Zalo đôi khi không nhận được',
          'Thông tin trên hóa đơn dùng thuật ngữ kỹ thuật',
        ],
      },
      {
        id: 't5',
        title: 'Khách hàng thanh toán tiền điện qua các kênh',
        defaultImpact: 4,
        issues: [
          'Ứng dụng thanh toán khó dùng, khó thao tác, không có thông báo rõ ràng',
          'Lỗi hệ thống, trừ tiền nhưng chưa ghi nhận',
          'Thanh toán rồi vẫn báo nợ',
          'Ít lựa chọn về phương thức và hình thức thanh toán',
        ],
      },
      {
        id: 't6',
        title: 'Ngừng cấp điện do nợ',
        defaultImpact: 5,
        issues: [
          'Cắt điện không thông báo đầy đủ theo trình tự',
          'Khách hàng đã thanh toán nhưng vẫn bị cắt do lỗi đồng bộ hệ thống',
          'Nhân viên thái độ lạnh lùng khi đến cắt điện',
          'Không cập nhật trạng thái trên hệ thống nên tổng đài không biết',
        ],
      },
      {
        id: 't7',
        title: 'Cấp điện trở lại sau thanh toán nợ',
        defaultImpact: 4,
        issues: [
          'Chậm cấp điện lại sau khi khách hàng đã thanh toán đầy đủ',
          'Nhân viên không liên hệ xin lỗi sau khi cắt nhầm',
          'Khách hàng phải gọi nhiều lần hỏi khi nào có điện lại',
        ],
      },
      {
        id: 't8',
        title: 'Khách hàng khiếu nại hóa đơn tiền điện',
        defaultImpact: 4,
        issues: [
          'Quy trình giải quyết chậm',
          'Kết quả không thỏa đáng, không giải thích cơ sở tính',
          'Nhân viên coi thường thắc mắc, dùng câu nói gây khó chịu',
        ],
      },
    ],
  },
  {
    id: 'j3',
    title: 'Xử lý sự cố mất điện',
    description:
      'Ngừng giảm kế hoạch và sự cố đột xuất. Từ phát hiện đến khôi phục và theo dõi sau sự cố.',
    segmentIds: ['sh1', 'sh2', 'sh3', 'sh4', 'sh5', 'nsh1', 'nsh2', 'nsh3', 'nsh5'],
    touchpoints: [
      {
        id: 't1',
        title: 'Thông báo ngừng giảm cung cấp điện kế hoạch',
        defaultImpact: 4,
        issues: [
          'Khách hàng không nhận được thông báo trước',
          'Thời gian mất điện thực tế dài hơn thông báo',
          'Không thông báo riêng cho khách hàng quan trọng',
          'Nhân viên thi công không rào chắn, biển báo đầy đủ',
        ],
      },
      {
        id: 't2',
        title: 'Khách hàng phát hiện mất điện đột ngột',
        defaultImpact: 5,
        issues: [
          'Không biết nguyên nhân và thời gian khôi phục dự kiến',
          'SMS hoặc ứng dụng thông báo bị chậm hoặc không gửi',
          'Khách hàng có trang thiết bị, dây chuyền sản xuất cần xử lý gấp',
        ],
      },
      {
        id: 't3',
        title: 'Khách hàng liên hệ tổng đài hoặc app báo sự cố',
        defaultImpact: 5,
        issues: [
          'Tổng đài bận, đặc biệt khi sự cố trên diện rộng',
          'Điện thoại viên tra OMS nhưng đơn vị chưa cập nhật nên không có thông tin',
          'Khách hàng không biết mã khách hàng, phải mô tả địa chỉ nên chậm tra cứu',
          'Kênh báo sự cố trên ứng dụng không hoạt động tốt',
        ],
      },
      {
        id: 't4',
        title: 'Đơn vị tiếp nhận phiếu CRM',
        defaultImpact: 4,
        issues: [
          'Đơn vị không tiếp nhận phiếu đúng thời gian',
          'Mất kết nối điện thoại IP nên trung tâm CSKH không liên lạc được',
          'Nhân viên không liên hệ khách hàng theo thời gian quy định',
        ],
      },
      {
        id: 't5',
        title: 'Nhân viên kiểm tra, sửa chữa tại hiện trường',
        defaultImpact: 5,
        issues: [
          'Không có thông tin về lịch trình, kế hoạch sửa chữa rõ ràng',
          'Thời gian chờ kéo dài, bức xúc cao',
          'Nhân viên không chủ động cập nhật tiến độ cho khách hàng',
          'Nhân viên giải thích bằng thuật ngữ kỹ thuật',
          'Sự cố trên tài sản khách hàng nhưng nhân viên bỏ đi không hỗ trợ',
        ],
      },
      {
        id: 't6',
        title: 'Hoàn tất hoặc đóng phiếu',
        defaultImpact: 4,
        issues: [
          'Nhân viên đóng phiếu khi chưa liên hệ khách hàng xin đồng ý',
          'Quá 2 giờ nhưng không liên hệ khách hàng thỏa thuận thời gian',
          'Sự cố diện rộng nhưng không lập OMS đúng thời gian',
          'Không ghi rõ lý do hoặc trở ngại vào phiếu',
        ],
      },
      {
        id: 't7',
        title: 'Theo dõi sau khôi phục điện',
        defaultImpact: 3,
        issues: [
          'Không liên hệ hỏi thăm khách hàng sau sự cố',
          'Không giải thích nguyên nhân chính thức',
          'Không hướng dẫn quyền lợi bồi thường nếu có thiệt hại',
        ],
      },
    ],
  },
  {
    id: 'j4',
    title: 'Thay đổi trong quá trình sử dụng điện',
    description:
      'Thay đổi công suất, di dời điện kế, thay đổi chủ thể hợp đồng, mục đích sử dụng điện, ngừng hoặc cấp lại.',
    segmentIds: ALL_SEGMENT_IDS,
    touchpoints: [
      {
        id: 't1',
        title: 'Khách hàng liên hệ yêu cầu thay đổi',
        defaultImpact: 3,
        issues: [
          'Khách hàng không biết gửi yêu cầu qua kênh nào',
          'Nhân viên không phân biệt được loại dịch vụ phù hợp cho nhu cầu khách hàng',
          'Không hướng dẫn đầy đủ hồ sơ cần thiết ngay lần liên hệ đầu',
          'Khách hàng không hiểu sự khác biệt giữa các loại thay đổi',
        ],
      },
      {
        id: 't2',
        title: 'Nhân viên tư vấn quy trình và hồ sơ từng loại thay đổi',
        defaultImpact: 4,
        issues: [
          'Nhân viên hướng dẫn sơ sài, khách hàng phải đi lại nhiều lần',
          'Thay đổi chủ thể HĐMBĐ – quy trình 15 ngày chờ, nhưng nhân viên không giải thích',
          'Khách hàng lắp thêm thiết bị sử dụng điện phải tăng công suất sử dụng điện – không hiểu tại sao phải như vậy',
          'Thay đổi mục đích sử dụng điện nhưng không biết ảnh hưởng giá điện',
        ],
      },
      {
        id: 't3',
        title: 'Nhân viên khảo sát hiện trường',
        defaultImpact: 3,
        issues: [
          'Trễ hẹn khiến khách hàng phiền phức và mất niềm tin',
          'Nhân viên không giải thích phương án kỹ thuật bằng ngôn ngữ dễ hiểu',
          'Không giới thiệu bản thân, không xuất trình thẻ',
          'Nhân viên vội vã, không lắng nghe yêu cầu cụ thể của khách hàng',
        ],
      },
      {
        id: 't4',
        title: 'Thực hiện thay đổi',
        defaultImpact: 4,
        issues: [
          'Chi phí phát sinh ngoài dự kiến, khách hàng không hiểu ai chịu phí gì',
          'Thay công tơ gây gián đoạn sinh hoạt hoặc kinh doanh',
          'Đơn vị tự ý thay đổi công suất mà không hỏi ý kiến khách hàng trước',
          'Không dọn dẹp sau thi công',
        ],
      },
      {
        id: 't5',
        title: 'Ký hợp đồng sửa đổi bổ sung hoặc chấm dứt hợp đồng',
        defaultImpact: 3,
        issues: [
          'Khách hàng không hiểu nội dung pháp lý trong hợp đồng sửa đổi',
          'Thay đổi chủ thể HĐMBĐ – giấy tờ phức tạp, nhân viên thiếu đồng cảm',
          'Khách hàng không biết quy định chấm dứt hợp đồng khi không sử dụng quá lâu',
        ],
      },
      {
        id: 't6',
        title: 'Hoàn tất, xác nhận với khách hàng',
        defaultImpact: 3,
        issues: [
          'Không xác nhận lại với khách hàng rằng thay đổi đã hoàn tất',
          'Không giải thích hóa đơn tháng sau sẽ thay đổi thế nào',
          'Không hướng dẫn cách theo dõi trên app sau thay đổi',
        ],
      },
    ],
  },
  {
    id: 'j5',
    title: 'Khiếu nại và Phản ánh',
    description:
      'Tiếp nhận, xử lý, thông báo kết quả và theo dõi sau khiếu nại.',
    segmentIds: ALL_SEGMENT_IDS,
    touchpoints: [
      {
        id: 't1',
        title: 'Tiếp nhận khiếu nại, phản ánh',
        defaultImpact: 5,
        issues: [
          'Nhân viên ngắt lời khách hàng khi đang trình bày',
          'Không ghi chép, không xác nhận lại vấn đề',
          'Không cam kết thời gian phản hồi cụ thể',
          'Thái độ phòng thủ, đổ lỗi',
          'Khách hàng bị chuyển tiếp nhiều người, phải kể lại từ đầu',
        ],
      },
      {
        id: 't2',
        title: 'Xác minh, phân loại khiếu nại',
        defaultImpact: 4,
        issues: [
          'Khách hàng bị chuyển qua chuyển lại giữa TTCSKH và Công ty Điện lực',
          'Phân loại sai dịch vụ dẫn đến xử lý chậm',
          'Khách hàng gọi hỏi thông tin xử lý nhiều lần nhưng ĐTV chỉ lặp lại một câu trả lời cũ',
          'Khách hàng đặc biệt không được cử nhân viên liên hệ trực tiếp',
        ],
      },
      {
        id: 't3',
        title: 'Tra soát, phân tích nội bộ',
        defaultImpact: 4,
        issues: [
          'Khách hàng không được cập nhật tiến độ trong suốt thời gian chờ',
          'Phải liên hệ nhiều lần, mỗi lần gặp nhân viên khác',
          'Thời gian xử lý kéo dài quá cam kết',
          'Đơn vị đóng phiếu nhưng chưa giải quyết hoàn tất',
        ],
      },
      {
        id: 't4',
        title: 'Trả lời khách hàng bằng văn bản',
        defaultImpact: 4,
        issues: [
          'Kết quả không thỏa đáng, không giải thích cơ sở',
          'Nhân viên không thể hiện đồng cảm',
          'Không đề xuất giải pháp bổ sung',
          'Khách hàng khiếu nại lần 2+ nhưng không được phản hồi và trả lời thỏa đáng',
        ],
      },
      {
        id: 't5',
        title: 'Tổng hợp, lưu trữ và giám sát nội bộ',
        defaultImpact: 3,
        issues: [
          'Không ghi nhận bài học cải tiến từ khiếu nại',
          'Không phân tích xu hướng khiếu nại lặp lại',
          'Dữ liệu CRM không đồng bộ với CMIS',
          'Chưa rà soát phản ánh nhũng nhiễu, thái độ không phù hợp',
        ],
      },
      {
        id: 't6',
        title: 'Theo dõi sau khiếu nại',
        defaultImpact: 3,
        issues: [
          'Không gọi hỏi thăm khách hàng sau xử lý',
          'Khách hàng đăng mạng xã hội nhưng thiếu quy trình xử lý truyền thông',
          'Vấn đề tái diễn, khách hàng phản ánh nhiều lần cùng nội dung',
        ],
      },
    ],
  },
  {
    id: 'j6',
    title: 'Chuyển dịch năng lượng',
    description:
      'ĐMTAM, trạm sạc xe điện, mua bán điện dư, tư vấn tiết kiệm năng lượng.',
    segmentIds: ['sh2', 'sh6', 'nsh1', 'nsh2', 'nsh3', 'nsh6'],
    touchpoints: [
      {
        id: 't1',
        title: 'Khách hàng tìm hiểu thông tin ĐMTAM hoặc trạm sạc xe điện',
        defaultImpact: 4,
        issues: [
          'Nhân viên thiếu kiến thức chuyên môn',
          'Chính sách giá mua điện dư thay đổi liên tục, nhân viên không cập nhật',
          'Thông tin phân tán giữa nhiều kênh',
          'Chưa có nhân viên được đào tạo tư vấn trạm sạc xe điện',
        ],
      },
      {
        id: 't2',
        title: 'Nhân viên tư vấn phương án kỹ thuật, chi phí',
        defaultImpact: 4,
        issues: [
          'Không tư vấn được phương án tối ưu',
          'Quy trình đấu nối phức tạp, thiếu tài liệu hướng dẫn dễ hiểu',
          'Doanh nghiệp FDI cần tư vấn bằng tiếng Anh nhưng nhân viên không đáp ứng',
          'Chi phí đấu nối không minh bạch',
        ],
      },
      {
        id: 't3',
        title: 'Nộp hồ sơ, thủ tục đấu nối',
        defaultImpact: 4,
        issues: [
          'Thời gian xử lý chậm so với kỳ vọng',
          'Yêu cầu kỹ thuật phức tạp, khách hàng không hiểu',
          'Phải ký nhiều cam kết nhưng không được giải thích rõ',
        ],
      },
      {
        id: 't4',
        title: 'Lắp đặt, kiểm tra, nghiệm thu',
        defaultImpact: 3,
        issues: [
          'Phối hợp giữa điện lực và đơn vị lắp đặt bên thứ ba chưa đồng bộ',
          'Thời gian nghiệm thu kéo dài',
          'Nhân viên kiểm tra thiếu chuyên nghiệp hoặc chưa quen dịch vụ mới',
        ],
      },
      {
        id: 't5',
        title: 'Vận hành, thanh quyết toán điện dư',
        defaultImpact: 4,
        issues: [
          'Cơ chế thanh toán tiền điện dư chậm',
          'Công tơ hai chiều ghi nhận sai do lỗi cài đặt ban đầu',
          'Không có kênh hỗ trợ riêng cho khách hàng ĐMTAM',
          'Thay đổi chính sách giá mua không thông báo kịp thời',
        ],
      },
      {
        id: 't6',
        title: 'Thay đổi chủ thể hoặc chấm dứt hợp đồng ĐMTMN',
        defaultImpact: 3,
        issues: [
          'Quy trình thay đổi chủ thể phức tạp',
          'Trường hợp thừa kế, giấy tờ pháp lý phức tạp, nhân viên thiếu kinh nghiệm',
          'Chuyển địa điểm lắp đặt không được duy trì hợp đồng cũ, khách hàng không hiểu lý do',
        ],
      },
    ],
  },
];

const NEGATIVE_BEHAVIORS = [
  'Lời nói thiếu tôn trọng, cộc lốc',
  'Thái độ thờ ơ, không quan tâm',
  'Không giữ cam kết, hẹn không đến hoặc hứa gọi lại nhưng không gọi',
  'Thiếu chuyên nghiệp, không đồng phục, không thẻ, làm việc riêng',
  'Đổ lỗi, từ chối trách nhiệm, đùn đẩy',
];

const SUPPORT_NEEDS: SurveySupportGroup[] = [
  {
    id: 'sn1',
    title: 'Người cao tuổi (trên 70) sống một mình',
    fields: ['Tỷ lệ ước tính (%)', 'Khó khăn chính khi tiếp cận dịch vụ điện', 'Giải pháp hỗ trợ hiện tại'],
  },
  {
    id: 'sn2',
    title: 'Người khuyết tật (vận động, thị giác, thính giác)',
    fields: ['Tỷ lệ (%)', 'Khó khăn chính', 'Giải pháp hiện tại'],
  },
  {
    id: 'sn3',
    title: '3. Khách hàng không sử dụng điện thoại thông minh hoặc không biết chữ',
    fields: ['Tỷ lệ (%)', 'Kênh liên lạc thay thế', 'Khó khăn thanh toán'],
  },
  {
    id: 'sn4',
    title: 'Hộ dân vùng đặc biệt khó khăn',
    fields: ['Số lượng hộ', 'Thời gian đến điểm giao dịch', 'Cách nhân viên tiếp cận'],
  },
  {
    id: 'sn5',
    title: 'Khách hàng quan trọng theo Thông tư 22/2020',
    fields: ['Số lượng khách hàng', 'Quy trình ưu tiên hiện tại', 'Cách thông báo ngừng cung cấp điện riêng'],
  },
];

const ENERGY_FIELDS: SurveyExtraField[] = [
  { key: 'pv1', label: 'Số khách hàng đã lắp ĐMTAM', rows: 1 },
  { key: 'pv2', label: 'Số khách hàng đang tìm hiểu hoặc trong quy trình', rows: 1 },
  { key: 'pv3', label: 'Khó khăn chính khách hàng gặp khi lắp ĐMTAM', rows: 3 },
  { key: 'pv4', label: 'Năng lực tư vấn nhân viên (Tốt/Trung bình/Yếu)', rows: 2 },
  { key: 'pv5', label: 'Vướng mắc cơ chế mua bán điện dư', rows: 3 },
  { key: 'pv6', label: 'Nhu cầu trạm sạc xe điện', rows: 2 },
  { key: 'pv7', label: 'Đề xuất cải thiện dịch vụ chuyển dịch năng lượng', rows: 3 },
];

const MEASUREMENT_FIELDS: SurveyExtraField[] = [
  { key: 'm1', label: 'Đơn vị có thực hiện đo Chỉ số đo mức độ hài lòng khách hàng (CSAT)? Kết quả gần nhất', rows: 2 },
  { key: 'm2', label: 'Đơn vị có đo Chỉ số đo mức độ sẵn sàng giới thiệu (NPS)? Kết quả gần nhất?', rows: 2 },
  { key: 'm3', label: 'Đơn vị có đo Chỉ số đo mức độ “dễ hay khó” khi khách hàng sử dụng dịch vụ (CES)? Kết quả gần nhất', rows: 2 },
  { key: 'm4', label: 'Thời gian trung bình Công ty Điện lực tiếp nhận phiếu CRM (chuẩn: 10 phút)', rows: 1 },
  { key: 'm5', label: 'Tỷ lệ liên hệ khách hàng trong 30 phút sau tiếp nhận', rows: 1 },
  { key: 'm6', label: 'Tỷ lệ đóng phiếu đúng quy trình', rows: 1 },
  { key: 'm7', label: 'Số trường hợp đóng phiếu khi chưa hoàn tất dịch vụ trong 6 tháng', rows: 1 },
];

export const STUDENT_SURVEY_SCHEMA: StudentSurveySchema = {
  segments: {
    household: HOUSEHOLD_SEGMENTS,
    business: BUSINESS_SEGMENTS,
  },
  journeys: JOURNEYS,
  extras: {
    negativeBehaviors: NEGATIVE_BEHAVIORS,
    supportNeeds: SUPPORT_NEEDS,
    energyFields: ENERGY_FIELDS,
    measurementFields: MEASUREMENT_FIELDS,
  },
};
