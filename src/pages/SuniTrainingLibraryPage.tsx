import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, CheckCircle2, Clock3, FileText, Gamepad2, MessageCircle, Pencil, QrCode, Smartphone, Trash2, Users, Vote, X } from 'lucide-react';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { getQuizQuestionSetBundle, parseQuizWorkbookFile, type QuizQuestion } from '@/lib/quiz';
import { supabase } from '@/lib/supabaseClient';
import {
  extractTextFromDocxFile,
  parseReflectionText,
  trainingLibraryApi,
  type ReflectionVariant,
  type TrainingLibraryItem,
  type TrainingLibraryType,
} from '@/lib/trainingLibrary';

const VDiscussionEventsPage = lazy(() => import('@/pages/VDiscussionEventsPage').then((module) => ({ default: module.VDiscussionEventsPage })));
const GameCatalogPage = lazy(() => import('@/pages/GameCatalogPage').then((module) => ({ default: module.GameCatalogPage })));

type LibraryTab = 'quiz' | 'reflection' | 'guideHub' | 'surveyGuide' | 'classActivitiesGuide' | 'discussionGuide' | 'discussion' | 'game';

type DiscussionGuideStep = {
  label: string;
  title: string;
  summary: string;
  details: string[];
  images: { key: string; src: string; alt: string; kind?: 'phone' | 'qr' }[];
};

const DISCUSSION_GUIDE_BASE = '/suni/vtraining/discussion-guide';
const DEFAULT_DISCUSSION_GUIDE_URL = 'https://www.vinabrain.com.vn/login?next=%2Fvtraining';
const DEFAULT_SURVEY_GUIDE_URL = 'https://www.vinabrain.com.vn/apply/student/plxlop1';
const DISCUSSION_GUIDE_BUCKET = 'training-materials';
const DISCUSSION_GUIDE_STORAGE_FOLDER = 'discussion-guide';
const DISCUSSION_GUIDE_CONFIG_PATH = `${DISCUSSION_GUIDE_STORAGE_FOLDER}/guide-config.json`;
const DISCUSSION_EVN_GUIDE_STORAGE_FOLDER = 'discussion-guide-evn';
const DISCUSSION_EVN_GUIDE_CONFIG_PATH = `${DISCUSSION_EVN_GUIDE_STORAGE_FOLDER}/guide-config.json`;

const CLASS_ACTIVITIES_GUIDE_STORAGE_FOLDER = 'vtraining-activities-guide';
const CLASS_ACTIVITIES_GUIDE_CONFIG_PATH = `${CLASS_ACTIVITIES_GUIDE_STORAGE_FOLDER}/guide-config.json`;
const SURVEY_GUIDE_STORAGE_FOLDER = 'survey-guide';
const SURVEY_GUIDE_CONFIG_PATH = `${SURVEY_GUIDE_STORAGE_FOLDER}/guide-config.json`;
type GuideKind = 'discussion' | 'discussionEvn' | 'classActivities' | 'survey';
type GuidePublicKind = GuideKind | 'practiceAiPower';

const GUIDE_PUBLIC_LINKS: Array<{ kind: GuidePublicKind; title: string; description: string; path: string }> = [
  {
    kind: 'classActivities',
    title: 'Hướng dẫn truy cập các hoạt động lớp học V-training',
    description: 'Quét QR, đăng nhập lớp và mở các hoạt động học tập được giao.',
    path: '/guide/vtraining-activities',
  },
  {
    kind: 'discussion',
    title: 'Hướng dẫn thảo luận nhóm PLX',
    description: 'Vote trưởng nhóm, đóng góp ý kiến qua các bước và gửi bài cho BTC.',
    path: '/guide/discussion-plx',
  },
  {
    kind: 'discussionEvn',
    title: 'Hướng dẫn thảo luận nhóm EVN',
    description: 'Thảo luận theo cấu trúc HCMC: hiện trạng, nguyên nhân, hành vi chuẩn, câu then chốt và kế hoạch 30 ngày.',
    path: '/guide/discussion-evn',
  },
  {
    kind: 'survey',
    title: 'Hướng dẫn khảo sát',
    description: 'Mở khảo sát mẫu plxlop1, trả lời đầy đủ và gửi phản hồi.',
    path: '/guide/survey',
  },
  {
    kind: 'practiceAiPower',
    title: 'Thực hành AI Điện lực - 4 tình huống demo',
    description: 'File HTML thực hành AI cho quản lý Điện lực, mở trực tiếp bằng link public.',
    path: '/suni/vtraining/practice/ai-dien-luc-4-ung-dung.html',
  },
];

function isEditableGuideKind(kind: GuidePublicKind): kind is GuideKind {
  return kind === 'survey' || kind === 'discussion' || kind === 'discussionEvn' || kind === 'classActivities';
}

function guideBadgeLabel(kind: GuidePublicKind) {
  if (kind === 'survey') return 'Khảo sát';
  if (kind === 'discussion') return 'Thảo luận PLX';
  if (kind === 'discussionEvn') return 'Thảo luận EVN';
  if (kind === 'practiceAiPower') return 'Thực hành';
  return 'V-training';
}

function normalizePlxDiscussionGuideText(value: string) {
  const text = String(value || '').trim();
  if (!text) return '';
  const topicIndex = text.search(/chủ\s*đề\s*:/iu);
  if (topicIndex >= 0 && /phiếu\s+thảo\s+luận[\s\S]{0,180}plx/iu.test(text.slice(0, topicIndex))) {
    return text.slice(topicIndex).replace(/\s{2,}/g, ' ').trim();
  }
  return text
    .replace(/^\s*Phiếu\s+thảo\s+luận[\s\S]{0,180}?PLX[^\n\r.。]*[.。]?\s*/iu, '')
    .replace(/Phiếu\s+thảo\s+luận[\s\S]{0,180}?PLX[^\n\r.。]*[.。]?/iu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const discussionGuideSteps: DiscussionGuideStep[] = [
  {
    label: 'Bắt đầu',
    title: 'Quét QR và đăng nhập lớp',
    summary: 'Anh/Chị quét mã QR để truy cập vào lớp V-training, sau đó đăng nhập bằng tài khoản BTC đã gửi.',
    details: [
      'Đường dẫn truy cập: https://www.vinabrain.com.vn/login?next=%2Fvtraining.',
      'Tên đăng nhập là email tham gia lớp BTC đã gửi cho Anh/Chị.',
      'Mật khẩu mặc định: 123456.',
      'Sau khi đăng nhập thành công, chọn Lớp đào tạo rồi chọn Thảo luận nhóm.',
    ],
    images: [
      { key: 'login', src: `${DISCUSSION_GUIDE_BASE}/login.jpg`, alt: 'Màn hình đăng nhập V-training trên điện thoại' },
    ],
  },
  {
    label: 'Vote',
    title: 'Vote trưởng nhóm trong 90 giây',
    summary: 'Các tài khoản đã được ghép nhóm ngẫu nhiên. Nhóm cần bầu trưởng nhóm để điều phối, chốt ý kiến và gửi bài cho BTC.',
    details: [
      'Theo dõi tình trạng tham gia của thành viên ngay tại phần vote nhóm trưởng.',
      'Chọn tên thành viên muốn bầu, sau đó chọn Chốt phiếu.',
      'Thời gian vote là 90 giây.',
      'Khi tất cả thành viên đã vote hoặc hết giờ, hệ thống chọn người có nhiều phiếu nhất làm trưởng nhóm; nếu hòa phiếu, hệ thống chọn ngẫu nhiên.',
    ],
    images: [
      { key: 'vote-start', src: `${DISCUSSION_GUIDE_BASE}/step-vote-start.jpg`, alt: 'Màn hình vote trưởng nhóm' },
    ],
  },
  {
    label: 'Bước 1',
    title: 'Chọn vấn đề trọng tâm',
    summary: 'Anh/Chị thảo luận và gửi ý kiến đóng góp. Trưởng nhóm chọn và chốt vấn đề trọng tâm của nhóm.',
    details: [
      'Mỗi thành viên nhập ý kiến rồi gửi lên hệ thống.',
      'Trưởng nhóm chọn ý kiến phù hợp, chốt đáp án và chuyển bước.',
      'Khi trưởng nhóm chuyển bước, các thành viên mới chuyển sang bước tiếp theo.',
    ],
    images: [
      { key: 'step-1-problem', src: `${DISCUSSION_GUIDE_BASE}/step-1-problem.jpg`, alt: 'Bước 1 gửi ý kiến chọn vấn đề trọng tâm' },
      { key: 'step-1-locked', src: `${DISCUSSION_GUIDE_BASE}/step-1-locked.jpg`, alt: 'Bước 1 vấn đề đã được chốt' },
    ],
  },
  {
    label: 'Bước 2',
    title: 'Phân tích hiện trạng',
    summary: 'Anh/Chị đóng góp phân tích về tồn tại, hạn chế và nguyên nhân gốc rễ của vấn đề đã chốt.',
    details: [
      'Nhập nội dung phân tích theo các trường gợi ý trên màn hình.',
      'Trưởng nhóm chọn các ý kiến đại diện và chuyển sang bước tiếp theo.',
    ],
    images: [
      { key: 'step-2-analysis', src: `${DISCUSSION_GUIDE_BASE}/step-2-analysis.jpg`, alt: 'Bước 2 nhập phân tích hiện trạng' },
      { key: 'step-2-selected', src: `${DISCUSSION_GUIDE_BASE}/step-2-selected.jpg`, alt: 'Bước 2 phân tích đã được chọn' },
    ],
  },
  {
    label: 'Bước 3',
    title: 'Đề xuất và đánh giá giải pháp',
    summary: 'Anh/Chị gửi ý tưởng giải pháp, phản hồi và đánh giá để nhóm chọn giải pháp ưu tiên.',
    details: [
      'Nhập tên giải pháp, lý do giải pháp này đáng thử và gửi ý tưởng.',
      'Các thành viên có thể đánh giá, phản hồi bổ sung cho giải pháp.',
      'Trưởng nhóm chọn giải pháp phù hợp để chuyển sang bước lập kế hoạch.',
    ],
    images: [
      { key: 'step-3-ideas', src: `${DISCUSSION_GUIDE_BASE}/step-3-ideas.jpg`, alt: 'Bước 3 gửi ý tưởng giải pháp' },
      { key: 'step-3-rated', src: `${DISCUSSION_GUIDE_BASE}/step-3-rated.jpg`, alt: 'Bước 3 đánh giá và phản hồi giải pháp' },
    ],
  },
  {
    label: 'Bước 4',
    title: 'Lập kế hoạch hành động',
    summary: 'Nhóm xây dựng kế hoạch thực hiện cho giải pháp đã chọn, gồm mục tiêu, nội dung công việc, nhân lực và thời hạn.',
    details: [
      'Anh/Chị góp ý để hoàn thiện kế hoạch hành động.',
      'Trưởng nhóm chọn/chốt kế hoạch và chuyển sang bước xem lại bài.',
    ],
    images: [
      { key: 'step-4-plan', src: `${DISCUSSION_GUIDE_BASE}/step-4-plan.jpg`, alt: 'Bước 4 lập kế hoạch hành động' },
      { key: 'step-4-ready', src: `${DISCUSSION_GUIDE_BASE}/step-4-ready.jpg`, alt: 'Bước 4 kế hoạch đã được chốt' },
    ],
  },
  {
    label: 'Bước 5',
    title: 'Xem lại và gửi bài cho BTC',
    summary: 'Anh/Chị xem lại toàn bộ nội dung bài của nhóm, thảo luận để thống nhất lần cuối trước khi gửi.',
    details: [
      'Trưởng nhóm nhấn Hoàn thành để gửi bài cho BTC.',
      'Sau khi hoàn thành, bài làm sẽ không thể chỉnh sửa.',
      'Giảng viên theo dõi bài tập trên hệ thống, đưa ra điểm đánh giá và điểm cộng cho thành viên tích cực.',
      'Chúc Anh/Chị tham gia thảo luận hiệu quả!',
    ],
    images: [
      { key: 'step-5-review', src: `${DISCUSSION_GUIDE_BASE}/step-5-review.jpg`, alt: 'Bước 5 xem lại toàn bộ bài thảo luận' },
      { key: 'step-5-done', src: `${DISCUSSION_GUIDE_BASE}/step-5-done.jpg`, alt: 'Bước 5 bài thảo luận đã hoàn thành' },
    ],
  },
];

const discussionEvnGuideSteps: DiscussionGuideStep[] = [
  {
    label: 'Bắt đầu',
    title: 'Quét QR và đăng nhập lớp',
    summary: 'Anh/Chị quét mã QR để truy cập lớp V-training, sau đó đăng nhập bằng tài khoản BTC đã gửi để vào hoạt động thảo luận nhóm EVN.',
    details: [
      'Đường dẫn truy cập: https://www.vinabrain.com.vn/login?next=%2Fvtraining.',
      'Tên đăng nhập là email tham gia lớp BTC đã gửi cho Anh/Chị.',
      'Mật khẩu mặc định: 123456.',
      'Sau khi đăng nhập thành công, chọn Lớp đào tạo rồi chọn hoạt động Thảo luận nhóm EVN/HCMC.',
    ],
    images: [
      { key: 'login', src: `${DISCUSSION_GUIDE_BASE}/login.jpg`, alt: 'Màn hình đăng nhập V-training trên điện thoại' },
    ],
  },
  {
    label: 'Vote',
    title: 'Vote trưởng nhóm trong 90 giây',
    summary: 'Các tài khoản đã được ghép nhóm. Nhóm vote trưởng nhóm để điều phối thảo luận, chốt ý kiến đại diện và gửi bài cho BTC.',
    details: [
      'Chọn tên thành viên muốn bầu làm trưởng nhóm, sau đó chọn Chốt phiếu.',
      'Thời gian vote là 90 giây.',
      'Khi tất cả thành viên đã vote hoặc hết giờ, hệ thống chọn người có nhiều phiếu nhất làm trưởng nhóm; nếu hòa phiếu, hệ thống chọn ngẫu nhiên.',
      'Sau khi có trưởng nhóm, cả nhóm bắt đầu thảo luận theo chủ đề điểm chạm được giao.',
    ],
    images: [
      { key: 'vote-start', src: `${DISCUSSION_GUIDE_BASE}/step-vote-start.jpg`, alt: 'Màn hình vote trưởng nhóm' },
    ],
  },
  {
    label: 'Bước 1',
    title: 'Hiện trạng: mô tả tình huống thuộc chủ đề được giao',
    summary: 'Mỗi nhóm khai thác một điểm chạm EVN/HCMC như cấp điện mới, mất điện/sự cố điện, thanh toán tiền điện/hóa đơn tăng cao hoặc kiểm tra công tơ.',
    details: [
      'Mỗi thành viên mô tả một tình huống có hành vi lệch chuẩn liên quan đến chủ đề được giao.',
      'Làm rõ hành vi đó ảnh hưởng thế nào đến khách hàng, đồng nghiệp, đơn vị hoặc hình ảnh EVNHCMC.',
      'Có thể like, bình luận và trao đổi để nhóm thống nhất tình huống trọng tâm.',
      'Trưởng nhóm chọn/chốt tình huống đại diện rồi chuyển sang bước tiếp theo.',
    ],
    images: [
      { key: 'step-1-problem', src: `${DISCUSSION_GUIDE_BASE}/step-1-problem.jpg`, alt: 'Bước 1 mô tả hiện trạng' },
      { key: 'step-1-locked', src: `${DISCUSSION_GUIDE_BASE}/step-1-locked.jpg`, alt: 'Bước 1 hiện trạng đã được chốt' },
    ],
  },
  {
    label: 'Bước 2',
    title: 'Phân tích nguyên nhân khiến khách hàng không hài lòng',
    summary: 'Anh/Chị tập trung nhập nguyên nhân chính khiến khách hàng không hài lòng trong tình huống đã chọn.',
    details: [
      'Nhập ngắn gọn nguyên nhân chính, không cần nhập lại phần tồn tại/hạn chế.',
      'Các thành viên có thể like và bình luận để làm rõ nguyên nhân.',
      'Trưởng nhóm chọn/chốt một hoặc nhiều nguyên nhân phù hợp trước khi chuyển Bước 3.',
    ],
    images: [
      { key: 'step-2-analysis', src: `${DISCUSSION_GUIDE_BASE}/step-2-analysis.jpg`, alt: 'Bước 2 nhập nguyên nhân' },
      { key: 'step-2-selected', src: `${DISCUSSION_GUIDE_BASE}/step-2-selected.jpg`, alt: 'Bước 2 nguyên nhân đã được chốt' },
    ],
  },
  {
    label: 'Bước 3',
    title: 'Xác định hành vi chuẩn và câu nói then chốt',
    summary: 'Anh/Chị đề xuất hành vi chuẩn cần đạt và một câu nói then chốt giúp khách hàng cảm thấy an tâm hơn.',
    details: [
      'Ô Hành vi chuẩn: nhập hành vi đúng cần đạt trong tình huống đã phân tích.',
      'Ô Câu nói then chốt: nhập một câu nói cụ thể giúp khách hàng an tâm, dễ hiểu và phù hợp văn hóa phục vụ.',
      'Các thành viên có thể đánh giá, bình luận, bổ sung để nhóm chọn phương án tốt nhất.',
      'Trưởng nhóm chốt ý kiến đại diện rồi chuyển sang Bước 4.',
    ],
    images: [
      { key: 'step-3-ideas', src: `${DISCUSSION_GUIDE_BASE}/step-3-ideas.jpg`, alt: 'Bước 3 nhập hành vi chuẩn và câu then chốt' },
      { key: 'step-3-rated', src: `${DISCUSSION_GUIDE_BASE}/step-3-rated.jpg`, alt: 'Bước 3 đánh giá và bình luận ý kiến' },
    ],
  },
  {
    label: 'Bước 4',
    title: 'Lập kế hoạch cải thiện phục vụ khách hàng trong 30 ngày tới',
    summary: 'Nhóm lập bảng kế hoạch theo 3 cột: mục tiêu cải thiện, hành vi hiện tại và hành vi chuẩn cần cải thiện trong 30 ngày tới.',
    details: [
      'Mỗi thành viên có thể đề xuất một dòng kế hoạch cải thiện.',
      'Cột Mục tiêu cải thiện: ghi rõ mục tiêu hành vi/dịch vụ cần cải thiện.',
      'Cột Hành vi hiện tại: mô tả hành vi đang diễn ra hoặc điểm cần thay đổi.',
      'Cột Hành vi chuẩn cần cải thiện trong 30 ngày tới: ghi hành vi cụ thể nhóm cam kết cải thiện.',
      'Trưởng nhóm chọn/chốt các dòng kế hoạch phù hợp rồi chuyển sang tổng kết.',
    ],
    images: [
      { key: 'step-4-plan', src: `${DISCUSSION_GUIDE_BASE}/step-4-plan.jpg`, alt: 'Bước 4 lập kế hoạch 30 ngày' },
      { key: 'step-4-ready', src: `${DISCUSSION_GUIDE_BASE}/step-4-ready.jpg`, alt: 'Bước 4 kế hoạch đã được chốt' },
    ],
  },
  {
    label: 'Bước 5',
    title: 'Tổng kết và gửi bài cho BTC',
    summary: 'Nhóm trưởng xem lại toàn bộ bài trình bày của nhóm, gồm hiện trạng, nguyên nhân, hành vi chuẩn, câu then chốt và kế hoạch 30 ngày.',
    details: [
      'Cả nhóm kiểm tra lại nội dung đã chốt ở các bước trước.',
      'Nếu cần, trưởng nhóm có thể xem lại các bước trước để đối chiếu nội dung.',
      'Khi nội dung đã thống nhất, trưởng nhóm nhấn Hoàn thành để gửi bài cho BTC.',
      'Sau khi hoàn thành, bài làm sẽ được khóa và không chỉnh sửa thêm.',
    ],
    images: [
      { key: 'step-5-review', src: `${DISCUSSION_GUIDE_BASE}/step-5-review.jpg`, alt: 'Bước 5 tổng kết bài thảo luận EVN' },
      { key: 'step-5-done', src: `${DISCUSSION_GUIDE_BASE}/step-5-done.jpg`, alt: 'Bước 5 bài thảo luận đã hoàn thành' },
    ],
  },
];

const classActivitiesGuideSteps: DiscussionGuideStep[] = [
  {
    label: 'Bắt đầu',
    title: 'Quét QR và đăng nhập lớp',
    summary: 'Anh/Chị quét mã QR để truy cập vào lớp V-training, sau đó đăng nhập bằng tài khoản BTC đã gửi.',
    details: [
      'Đường dẫn truy cập: https://www.vinabrain.com.vn/login?next=%2Fvtraining.',
      'Tên đăng nhập là email tham gia lớp BTC đã gửi cho Anh/Chị.',
      'Mật khẩu mặc định: 123456.',
      'Sau khi đăng nhập thành công, Anh/Chị chọn Lớp đào tạo để xem các hoạt động của lớp.',
    ],
    images: [
      { key: 'login', src: `${DISCUSSION_GUIDE_BASE}/login.jpg`, alt: 'Màn hình đăng nhập V-training trên điện thoại' },
    ],
  },
  {
    label: 'Bước 1',
    title: 'Mở lớp đào tạo',
    summary: 'Tại trang V-training, Anh/Chị chọn đúng lớp học đang tham gia để xem nội dung và hoạt động được giao.',
    details: [
      'Kiểm tra tên lớp, thời gian học và các thông tin lớp trước khi bắt đầu.',
      'Nếu không thấy lớp, Anh/Chị báo lại BTC để kiểm tra tài khoản hoặc phân quyền lớp.',
    ],
    images: [],
  },
  {
    label: 'Bước 2',
    title: 'Chọn hoạt động cần thực hiện',
    summary: 'Trong lớp học, Anh/Chị chọn hoạt động BTC hoặc giảng viên yêu cầu: kiểm tra, bài thu hoạch, thảo luận nhóm, game hoặc tài liệu học tập.',
    details: [
      'Đọc kỹ hướng dẫn và thời hạn của từng hoạt động.',
      'Hoàn thành từng hoạt động theo đúng yêu cầu hiển thị trên hệ thống.',
      'Với hoạt động thảo luận nhóm, Anh/Chị thực hiện theo hướng dẫn thảo luận riêng.',
    ],
    images: [],
  },
  {
    label: 'Bước 3',
    title: 'Hoàn thành và theo dõi kết quả',
    summary: 'Sau khi gửi bài hoặc hoàn thành hoạt động, Anh/Chị kiểm tra trạng thái hoàn thành và theo dõi kết quả/điểm đánh giá trên hệ thống.',
    details: [
      'Một số hoạt động sau khi gửi sẽ không thể chỉnh sửa, Anh/Chị cần kiểm tra kỹ trước khi hoàn thành.',
      'Giảng viên/BTC sẽ theo dõi kết quả và hỗ trợ khi cần.',
      'Chúc Anh/Chị hoàn thành các hoạt động lớp học hiệu quả!',
    ],
    images: [],
  },
];

const surveyGuideSteps: DiscussionGuideStep[] = [
  {
    label: 'Bắt đầu',
    title: 'Quét QR hoặc mở link khảo sát ẩn danh',
    summary: 'Anh/Chị quét mã QR để truy cập khảo sát sau khóa đào tạo. Khảo sát ẩn danh, không cần đăng nhập.',
    details: [
      'Đường dẫn mẫu: https://www.vinabrain.com.vn/apply/student/plxlop1.',
      'Nếu BTC gửi link khảo sát khác, Anh/Chị mở đúng link được cung cấp.',
      'Khảo sát là link public và ẩn danh, Anh/Chị có thể thực hiện trực tiếp trên điện thoại.',
    ],
    images: [],
  },
  {
    label: 'Bước 1',
    title: 'Đọc thông tin khảo sát',
    summary: 'Anh/Chị đọc phần giới thiệu và hướng dẫn hiển thị trên màn hình trước khi bắt đầu trả lời.',
    details: [
      'Kiểm tra đúng tên khảo sát sau khóa đào tạo.',
      'Chuẩn bị thông tin cá nhân/lớp học nếu biểu mẫu yêu cầu.',
    ],
    images: [],
  },
  {
    label: 'Bước 2',
    title: 'Trả lời các phần khảo sát',
    summary: 'Khảo sát mẫu gồm 6 phần và 33 câu. Anh/Chị trả lời đầy đủ, trung thực theo trải nghiệm học tập của mình.',
    details: [
      'Đọc kỹ từng câu hỏi trước khi chọn phương án hoặc nhập ý kiến.',
      'Với câu hỏi mở, Anh/Chị ghi rõ góp ý để BTC và giảng viên có cơ sở cải thiện chương trình.',
      'Có thể cuộn màn hình để kiểm tra các phần chưa trả lời.',
    ],
    images: [],
  },
  {
    label: 'Bước 3',
    title: 'Kiểm tra và gửi khảo sát',
    summary: 'Trước khi gửi, Anh/Chị kiểm tra lại các câu trả lời rồi nhấn nút gửi/hoàn thành theo hướng dẫn trên biểu mẫu.',
    details: [
      'Sau khi gửi thành công, hệ thống ghi nhận phản hồi của Anh/Chị.',
      'Phản hồi khảo sát giúp BTC cải thiện nội dung, giảng viên và trải nghiệm lớp học.',
      'Xin cảm ơn Anh/Chị đã hoàn thành khảo sát!',
    ],
    images: [],
  },
];

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [record.message, record.details, record.hint, record.code].filter(Boolean).map(String);
    if (parts.length) return parts.join(' · ');
  }
  return error instanceof Error ? error.message : 'Không thực hiện được thao tác.';
}

function itemTypeLabel(type: TrainingLibraryType) {
  if (type === 'quiz') return 'Bài kiểm tra';
  if (type === 'reflection') return 'Bài thu hoạch';
  if (type === 'discussion') return 'Thảo luận';
  return 'Game';
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function DiscussionGuidePanel({ canEdit = true, publicMode = false, guideKind = 'discussion' }: { canEdit?: boolean; publicMode?: boolean; guideKind?: GuideKind }) {
  const isClassActivitiesGuide = guideKind === 'classActivities';
  const isSurveyGuide = guideKind === 'survey';
  const isDiscussionEvnGuide = guideKind === 'discussionEvn';
  const activeGuideSteps = isSurveyGuide ? surveyGuideSteps : isClassActivitiesGuide ? classActivitiesGuideSteps : isDiscussionEvnGuide ? discussionEvnGuideSteps : discussionGuideSteps;
  const guideStorageFolder = isSurveyGuide ? SURVEY_GUIDE_STORAGE_FOLDER : isClassActivitiesGuide ? CLASS_ACTIVITIES_GUIDE_STORAGE_FOLDER : isDiscussionEvnGuide ? DISCUSSION_EVN_GUIDE_STORAGE_FOLDER : DISCUSSION_GUIDE_STORAGE_FOLDER;
  const guideConfigPath = isSurveyGuide ? SURVEY_GUIDE_CONFIG_PATH : isClassActivitiesGuide ? CLASS_ACTIVITIES_GUIDE_CONFIG_PATH : isDiscussionEvnGuide ? DISCUSSION_EVN_GUIDE_CONFIG_PATH : DISCUSSION_GUIDE_CONFIG_PATH;
  const guidePublicPath = isSurveyGuide ? '/guide/survey' : isClassActivitiesGuide ? '/guide/vtraining-activities' : isDiscussionEvnGuide ? '/guide/discussion-evn' : '/guide/discussion-plx';
  const defaultGuideUrl = isSurveyGuide ? DEFAULT_SURVEY_GUIDE_URL : DEFAULT_DISCUSSION_GUIDE_URL;
  const guideEyebrow = isSurveyGuide ? 'Hướng dẫn khảo sát' : isClassActivitiesGuide ? 'Hướng dẫn V-training' : isDiscussionEvnGuide ? 'Hướng dẫn EVN/HCMC' : 'Hướng dẫn PLX';
  const guideTitle = isSurveyGuide ? 'Hướng dẫn thực hiện khảo sát sau khóa đào tạo' : isClassActivitiesGuide ? 'Hướng dẫn truy cập các hoạt động lớp học V-training' : isDiscussionEvnGuide ? 'Hướng dẫn thảo luận nhóm EVN trên điện thoại' : 'Hướng dẫn thảo luận nhóm PLX trên điện thoại';
  const guideSummary = isSurveyGuide
    ? 'Quy trình thao tác dành cho Anh/Chị học viên: quét QR, mở khảo sát mẫu plxlop1, trả lời đầy đủ và gửi phản hồi cho BTC.'
    : isClassActivitiesGuide
    ? 'Quy trình thao tác dành cho Anh/Chị học viên: quét QR, đăng nhập lớp và truy cập các hoạt động học tập trên V-training.'
    : isDiscussionEvnGuide
    ? 'Quy trình thao tác dành cho Anh/Chị học viên: truy cập lớp, vote trưởng nhóm trong 90 giây, thảo luận theo cấu trúc HCMC và gửi bài cho BTC.'
    : 'Quy trình thao tác dành cho Anh/Chị học viên: truy cập lớp, vote trưởng nhóm, đóng góp ý kiến qua 5 bước và gửi bài cho BTC.';
  const guideFacts = isSurveyGuide
    ? []
    : isClassActivitiesGuide
    ? [
        { icon: QrCode, label: 'QR truy cập lớp' },
        { icon: Users, label: 'Lớp đào tạo' },
        { icon: FileText, label: 'Hoạt động học tập' },
        { icon: CheckCircle2, label: 'Theo dõi kết quả' },
      ]
    : isDiscussionEvnGuide
    ? [
        { icon: QrCode, label: 'QR truy cập lớp' },
        { icon: Users, label: 'Ghép nhóm thảo luận' },
        { icon: Vote, label: 'Vote trưởng nhóm 90 giây' },
        { icon: CheckCircle2, label: 'HCMC 5 bước' },
      ]
    : [
        { icon: QrCode, label: 'QR truy cập lớp' },
        { icon: Users, label: 'Ghép nhóm ngẫu nhiên' },
        { icon: Vote, label: 'Vote trưởng nhóm' },
        { icon: CheckCircle2, label: 'Hoàn thành để gửi BTC' },
      ];
  const [qrInput, setQrInput] = useState(defaultGuideUrl);
  const [isPresentation, setIsPresentation] = useState(publicMode);
  const [guideImageUrls, setGuideImageUrls] = useState<Record<string, string>>({});
  const [guideUploadStatus, setGuideUploadStatus] = useState<Record<string, string>>({});
  const [guideTextOverrides, setGuideTextOverrides] = useState<Record<string, string>>({});
  const [editingTextKey, setEditingTextKey] = useState('');
  const [editingTextValue, setEditingTextValue] = useState('');
  const [guideTextStatus, setGuideTextStatus] = useState('');
  const qrValue = qrInput.trim() || defaultGuideUrl;

  const guideText = (key: string, fallback: string) => {
    const value = guideTextOverrides[key] || fallback;
    return guideKind === 'discussion' ? normalizePlxDiscussionGuideText(value) : value;
  };

  useEffect(() => {
    document.body.classList.toggle('discussion-guide-presentation', isPresentation);
    document.body.classList.toggle('discussion-guide-public-body', publicMode);
    return () => {
      document.body.classList.remove('discussion-guide-presentation');
      document.body.classList.remove('discussion-guide-public-body');
    };
  }, [isPresentation, publicMode]);

  useEffect(() => {
    async function loadGuideImages() {
      const client = supabase;
      if (!client) return;
      const { data, error } = await client.storage.from(DISCUSSION_GUIDE_BUCKET).list(guideStorageFolder, { limit: 100 });
      if (error || !data?.length) return;
      const nextUrls: Record<string, string> = {};
      data.forEach((item) => {
        const slot = item.name.replace(/\.[^.]+$/, '');
        if (!slot) return;
        const path = `${guideStorageFolder}/${item.name}`;
        const publicUrl = client.storage.from(DISCUSSION_GUIDE_BUCKET).getPublicUrl(path).data.publicUrl;
        if (publicUrl) nextUrls[slot] = `${publicUrl}?v=${item.updated_at || item.created_at || item.name}`;
      });
      setGuideImageUrls(nextUrls);
    }
    void loadGuideImages();
  }, [guideStorageFolder]);

  useEffect(() => {
    async function loadGuideConfig() {
      const client = supabase;
      if (!client) return;
      const { data, error } = await client.storage.from(DISCUSSION_GUIDE_BUCKET).download(guideConfigPath);
      if (error || !data) return;
      try {
        const parsed = JSON.parse(await data.text()) as { texts?: Record<string, string>; qrUrl?: string; images?: Record<string, string> };
        if (parsed.texts && typeof parsed.texts === 'object') setGuideTextOverrides(parsed.texts);
        if (parsed.images && typeof parsed.images === 'object') setGuideImageUrls((current) => ({ ...current, ...parsed.images }));
        if (typeof parsed.qrUrl === 'string' && parsed.qrUrl.trim()) setQrInput(parsed.qrUrl);
      } catch {
        setGuideTextStatus('Không đọc được cấu hình hướng dẫn.');
      }
    }
    void loadGuideConfig();
  }, [guideConfigPath]);

  async function saveGuideConfig(nextTexts: Record<string, string>, nextQrUrl = qrInput, nextImages = guideImageUrls) {
    const client = supabase;
    if (!client) {
      setGuideTextStatus('Chưa cấu hình Supabase.');
      return false;
    }
    setGuideTextStatus('Đang lưu nội dung...');
    const payload = {
      qrUrl: nextQrUrl.trim() || defaultGuideUrl,
      texts: nextTexts,
      images: nextImages,
      updatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const { error } = await client.storage.from(DISCUSSION_GUIDE_BUCKET).upload(guideConfigPath, blob, {
      cacheControl: '30',
      contentType: 'application/json',
      upsert: true,
    });
    if (error) {
      setGuideTextStatus(error.message);
      return false;
    }
    setGuideTextStatus('Đã lưu nội dung lên Supabase.');
    return true;
  }

  function startTextEdit(key: string, value: string) {
    setEditingTextKey(key);
    setEditingTextValue(value);
    setGuideTextStatus('');
  }

  async function saveTextEdit() {
    if (!editingTextKey) return;
    const nextTexts = { ...guideTextOverrides, [editingTextKey]: editingTextValue.trim() };
    setGuideTextOverrides(nextTexts);
    const saved = await saveGuideConfig(nextTexts);
    if (saved) {
      setEditingTextKey('');
      setEditingTextValue('');
    }
  }

  async function saveQrUrl() {
    const nextQrUrl = qrInput.trim() || defaultGuideUrl;
    setQrInput(nextQrUrl);
    await saveGuideConfig(guideTextOverrides, nextQrUrl);
  }

  function EditableText({ textKey, fallback, as = 'span', multiline = false }: { textKey: string; fallback: string; as?: 'h2' | 'h3' | 'p' | 'strong' | 'span' | 'li'; multiline?: boolean }) {
    const value = guideText(textKey, fallback);
    const Tag = as;
    const isEditing = editingTextKey === textKey;
    if (!canEdit) {
      return <Tag className="discussion-guide-editable-text"><span>{value}</span></Tag>;
    }
    if (isEditing) {
      return (
        <div className="discussion-guide-text-editor">
          {multiline ? (
            <textarea value={editingTextValue} onChange={(event) => setEditingTextValue(event.target.value)} rows={3} autoFocus />
          ) : (
            <input value={editingTextValue} onChange={(event) => setEditingTextValue(event.target.value)} autoFocus />
          )}
          <div>
            <button type="button" className="btn btn-primary btn-small" onClick={() => void saveTextEdit()}><Check size={14} /> Lưu</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditingTextKey('')}><X size={14} /> Hủy</button>
          </div>
        </div>
      );
    }
    return (
      <Tag className="discussion-guide-editable-text">
        <span>{value}</span>
        <button type="button" className="discussion-guide-edit-button" onClick={() => startTextEdit(textKey, value)} aria-label="Sửa nội dung">
          <Pencil size={14} />
        </button>
      </Tag>
    );
  }

  async function uploadGuideImage(slot: string, file: File | null) {
    if (!file) return;
    const client = supabase;
    if (!client) {
      setGuideUploadStatus((current) => ({ ...current, [slot]: 'Chưa cấu hình Supabase.' }));
      return;
    }
    if (!file.type.startsWith('image/')) {
      setGuideUploadStatus((current) => ({ ...current, [slot]: 'Vui lòng chọn file ảnh.' }));
      return;
    }
    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const objectPath = `${guideStorageFolder}/${slot}.${extension}`;
    setGuideUploadStatus((current) => ({ ...current, [slot]: 'Đang lưu ảnh...' }));
    const existing = await client.storage.from(DISCUSSION_GUIDE_BUCKET).list(guideStorageFolder, { search: `${slot}.`, limit: 20 });
    const oldPaths = (existing.data || [])
      .filter((item) => item.name.replace(/\.[^.]+$/, '') === slot && `${guideStorageFolder}/${item.name}` !== objectPath)
      .map((item) => `${guideStorageFolder}/${item.name}`);
    if (oldPaths.length) await client.storage.from(DISCUSSION_GUIDE_BUCKET).remove(oldPaths);
    const { error } = await client.storage.from(DISCUSSION_GUIDE_BUCKET).upload(objectPath, file, {
      cacheControl: '60',
      contentType: file.type,
      upsert: true,
    });
    if (error) {
      setGuideUploadStatus((current) => ({ ...current, [slot]: error.message }));
      return;
    }
    const publicUrl = client.storage.from(DISCUSSION_GUIDE_BUCKET).getPublicUrl(objectPath).data.publicUrl;
    const nextImageUrls = { ...guideImageUrls, [slot]: `${publicUrl}?v=${Date.now()}` };
    setGuideImageUrls(nextImageUrls);
    await saveGuideConfig(guideTextOverrides, qrInput, nextImageUrls);
    setGuideUploadStatus((current) => ({ ...current, [slot]: 'Đã lưu Supabase.' }));
  }

  return (
    <section className={`${isPresentation ? 'discussion-guide-panel is-presentation' : 'discussion-guide-panel'} ${publicMode ? 'is-public' : ''}`} aria-label="Hướng dẫn thảo luận nhóm">
      <div className="discussion-guide-hero">
        <div className="discussion-guide-hero-copy">
          <span className="discussion-guide-eyebrow"><Smartphone size={15} /> {guideEyebrow}</span>
          <EditableText textKey="hero.title" fallback={guideTitle} as="h2" />
          <EditableText textKey="hero.summary" fallback={guideSummary} as="p" multiline />
          <div className="discussion-guide-facts" aria-label="Thông tin đăng nhập nhanh">
            {guideFacts.map(({ icon: Icon, label }) => <span key={label}><Icon size={15} /> {label}</span>)}
          </div>
          {canEdit ? <div className="discussion-guide-public-link">
            <span>Link public:</span>
            <a href={guidePublicPath} target="_blank" rel="noreferrer">{guidePublicPath}</a>
          </div> : null}
          {canEdit ? <div className="discussion-guide-actions">
            <button type="button" className="btn btn-primary" onClick={() => setIsPresentation((value) => !value)}>
              {isPresentation ? 'Thoát trình chiếu' : 'Trình chiếu'}
            </button>
          </div> : null}
        </div>
        <div className="discussion-guide-qr-card">
          {canEdit ? <label>
            <span>Link tạo mã QR</span>
            <input value={qrInput} onChange={(event) => setQrInput(event.target.value)} onBlur={() => void saveQrUrl()} placeholder={defaultGuideUrl} />
          </label> : null}
          <figure className="discussion-guide-qr">
            <QRCodeSVG value={qrValue} size={232} level="M" marginSize={3} />
            <figcaption>Quét QR để vào lớp V-training</figcaption>
          </figure>
        </div>
      </div>

      {!isSurveyGuide ? (
        <div className="discussion-guide-login-note">
          <Clock3 size={18} />
          <div>
            <EditableText textKey="login.title" fallback="Thông tin đăng nhập" as="strong" />
            <EditableText textKey="login.body" fallback="Tên đăng nhập là email tham gia lớp BTC đã gửi cho Anh/Chị. Mật khẩu mặc định: 123456." as="p" multiline />
          </div>
        </div>
      ) : null}
      {canEdit && guideTextStatus ? <div className="discussion-guide-save-status">{guideTextStatus}</div> : null}

      <div className="discussion-guide-steps">
        {activeGuideSteps.map((step) => (
          <article className="discussion-guide-step" key={step.label}>
            <div className="discussion-guide-step-copy">
              <span>{step.label}</span>
              <EditableText textKey={`step.${step.label}.title`} fallback={step.title} as="h3" />
              <EditableText textKey={`step.${step.label}.summary`} fallback={step.summary} as="p" multiline />
              <ul>
                {step.details.map((detail, index) => (
                  <EditableText textKey={`step.${step.label}.detail.${index}`} fallback={detail} as="li" multiline key={`${step.label}-${index}`} />
                ))}
              </ul>
            </div>
            <div className="discussion-guide-phone-strip">
              {step.images.map((image) => (
                <figure className={image.kind === 'qr' ? 'is-qr' : undefined} key={image.key}>
                  <img src={guideImageUrls[image.key] || image.src} alt={image.alt} loading="lazy" />
                  {canEdit ? <label className="discussion-guide-upload">
                    <span>Đổi ảnh</span>
                    <input type="file" accept="image/*" onChange={(event) => void uploadGuideImage(image.key, event.target.files?.[0] || null)} />
                  </label> : null}
                  {canEdit && guideUploadStatus[image.key] ? <figcaption>{guideUploadStatus[image.key]}</figcaption> : null}
                </figure>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PublicDiscussionGuidePage() {
  return <PublicDiscussionPlxGuidePage />;
}

export function PublicDiscussionPlxGuidePage() {
  return (
    <main className="discussion-guide-public-page">
      <DiscussionGuidePanel canEdit={false} publicMode />
    </main>
  );
}

export function PublicDiscussionEvnGuidePage() {
  return (
    <main className="discussion-guide-public-page">
      <DiscussionGuidePanel canEdit={false} publicMode guideKind="discussionEvn" />
    </main>
  );
}

export function PublicClassActivitiesGuidePage() {
  return (
    <main className="discussion-guide-public-page">
      <DiscussionGuidePanel canEdit={false} publicMode guideKind="classActivities" />
    </main>
  );
}

export function PublicSurveyGuidePage() {
  return (
    <main className="discussion-guide-public-page">
      <DiscussionGuidePanel canEdit={false} publicMode guideKind="survey" />
    </main>
  );
}

function GuideHubPanel({ publicMode = false, onEditGuide }: { publicMode?: boolean; onEditGuide?: (kind: GuideKind) => void }) {
  const hubPath = '/guide/class-activities';
  const publicOrigin = typeof window === 'undefined' ? '' : window.location.origin;
  const toFullUrl = (path: string) => `${publicOrigin}${path}`;

  return (
    <section className={`guide-hub-panel ${publicMode ? 'is-public' : ''}`} aria-label="Tổng hợp hướng dẫn hoạt động lớp học">
      <div className="guide-hub-head">
        <span className="discussion-guide-eyebrow"><QrCode size={15} /> Tổng hợp hướng dẫn</span>
        <h2>Tổng hợp hướng dẫn hoạt động lớp học</h2>
        <p>Danh sách các màn hướng dẫn public dùng để hỗ trợ học viên truy cập và hoàn thành hoạt động trên lớp.</p>
        {!publicMode ? (
          <div className="discussion-guide-public-link">
            <span>Link public tổng hợp:</span>
            <a href={hubPath} target="_blank" rel="noreferrer">{hubPath}</a>
          </div>
        ) : null}
      </div>

      <div className="guide-hub-grid">
        {GUIDE_PUBLIC_LINKS.map((guide) => {
          const editableGuideKind = isEditableGuideKind(guide.kind) ? guide.kind : null;
          return (
            <article className="guide-hub-card" key={guide.kind}>
              <div>
                <span>{guideBadgeLabel(guide.kind)}</span>
                <h3>{guide.title}</h3>
                <p>{guide.description}</p>
              </div>
              <div className="guide-hub-card-actions">
                <code>{toFullUrl(guide.path)}</code>
                {!publicMode && onEditGuide && editableGuideKind ? (
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => onEditGuide(editableGuideKind)}>Sửa / thay ảnh</button>
                ) : null}
                <a className="btn btn-primary btn-small" href={guide.path} target="_blank" rel="noreferrer">Mở link</a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function PublicGuideHubPage() {
  return (
    <main className="discussion-guide-public-page">
      <GuideHubPanel publicMode />
    </main>
  );
}

async function downloadQuizTemplate() {
  const XLSX = await import('xlsx');
  const rows = [
    ['Tên bài kiểm tra', 'Bài kiểm tra mẫu', 'Bộ đề: 40 câu', '', '', '', '', '', '', '', ''],
    ['Mã câu hỏi', 'Loại', 'Nội dung câu hỏi', 'Câu trả lời 1', 'Câu trả lời 2', 'Câu trả lời 3', 'Câu trả lời 4', 'Câu trả lời 5', 'KQ Câu TL 1', 'KQ Câu TL 2', 'KQ Câu TL 3', 'KQ Câu TL 4', 'KQ Câu TL 5'],
    [1, 'Singlechoice', 'Câu hỏi mẫu số 1?', 'Phương án A', 'Phương án B', 'Phương án C', 'Phương án D', '', false, true, false, false, ''],
    [2, 'Singlechoice', 'Câu hỏi mẫu số 2?', 'Phương án A', 'Phương án B', 'Phương án C', 'Phương án D', '', false, false, true, false, ''],
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 48 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Quiz');
  XLSX.writeFile(workbook, 'mau_bai_kiem_tra_vtraining.xlsx');
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function downloadReflectionTemplate() {
  const { default: JSZip } = await import('jszip');
  const lines = [
    'Câu hỏi 1: Anh/Chị hãy trình bày nội dung quan trọng nhất rút ra từ khóa học.',
    '(Gợi ý: Nêu lý do lựa chọn, bối cảnh áp dụng và hành động cụ thể trong 1-3 tháng tới.)',
    'Câu trả lời:',
    '',
    'Câu hỏi 2: Anh/Chị hãy mô tả một tình huống thực tế và đề xuất giải pháp áp dụng kiến thức đã học.',
    '(Gợi ý: Mô tả vấn đề, nguyên nhân, giải pháp và bài học rút ra.)',
    'Câu trả lời:',
    '',
    'Câu hỏi 3: Anh/Chị hãy lập kế hoạch hành động sau khóa học.',
    '(Gợi ý: Liệt kê ít nhất 03 việc cụ thể, có thời hạn và cách đo lường.)',
    'Câu trả lời:',
  ];
  const body = lines.map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.folder('_rels')?.file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.folder('word')?.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`);
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  downloadBlob('mau_bai_thu_hoach_vtraining.docx', blob);
}

export default function SuniTrainingLibraryPage() {
  const [activeTab, setActiveTab] = useState<LibraryTab>('quiz');
  const [activeDiscussionGuideKind, setActiveDiscussionGuideKind] = useState<Extract<GuideKind, 'discussion' | 'discussionEvn'>>('discussion');
  const [items, setItems] = useState<TrainingLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDescription, setQuizDescription] = useState('');
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizErrors, setQuizErrors] = useState<string[]>([]);
  const [quizFileName, setQuizFileName] = useState('');
  const [reflectionTitle, setReflectionTitle] = useState('');
  const [reflectionDescription, setReflectionDescription] = useState('');
  const [reflectionVariants, setReflectionVariants] = useState<ReflectionVariant[]>([]);
  const [reflectionFileName, setReflectionFileName] = useState('');
  const [editingItem, setEditingItem] = useState<TrainingLibraryItem | null>(null);

  const filteredItems = useMemo(() => items.filter((item) => item.type === activeTab), [items, activeTab]);

  async function loadItems() {
    setLoading(true);
    setErrorMessage('');
    try {
      setItems(await trainingLibraryApi.listItems());
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  async function handleQuizFile(file: File | null) {
    if (!file) return;
    setErrorMessage('');
    setQuizFileName(file.name);
    try {
      const parsed = await parseQuizWorkbookFile(file);
      setQuizTitle(parsed.title || file.name.replace(/\.[^.]+$/, ''));
      setQuizQuestions(parsed.questions);
      setQuizErrors(parsed.errors);
    } catch (error) {
      setQuizQuestions([]);
      setQuizErrors([getErrorMessage(error)]);
    }
  }

  async function saveQuizLibrary() {
    if (!quizQuestions.length || quizErrors.length) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await trainingLibraryApi.createQuizLibraryItem({
        id: editingItem?.type === 'quiz' ? editingItem.id : undefined,
        questionSetId: editingItem?.type === 'quiz' ? String(editingItem.metadata.questionSetId || editingItem.sourceId || '') : undefined,
        title: quizTitle || quizFileName.replace(/\.[^.]+$/, '') || 'Bài kiểm tra',
        description: quizDescription,
        questions: quizQuestions,
        sourceFileName: quizFileName,
      });
      setQuizQuestions([]);
      setQuizFileName('');
      setQuizErrors([]);
      setEditingItem(null);
      await loadItems();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleReflectionFile(file: File | null) {
    if (!file) return;
    setErrorMessage('');
    setReflectionFileName(file.name);
    try {
      const text = await extractTextFromDocxFile(file);
      const parsed = parseReflectionText(text);
      setReflectionTitle(parsed.title || file.name.replace(/\.[^.]+$/, ''));
      setReflectionVariants(parsed.variants);
    } catch (error) {
      setReflectionVariants([]);
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function saveReflectionLibrary() {
    if (!reflectionVariants.length) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await trainingLibraryApi.createReflectionLibraryItem({
        id: editingItem?.type === 'reflection' ? editingItem.id : undefined,
        title: reflectionTitle || reflectionFileName.replace(/\.[^.]+$/, '') || 'Bài thu hoạch',
        description: reflectionDescription,
        variants: reflectionVariants,
        sourceFileName: reflectionFileName,
      });
      setReflectionVariants([]);
      setReflectionFileName('');
      setEditingItem(null);
      await loadItems();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function clearEditing() {
    setEditingItem(null);
    setQuizTitle('');
    setQuizDescription('');
    setQuizQuestions([]);
    setQuizErrors([]);
    setQuizFileName('');
    setReflectionTitle('');
    setReflectionDescription('');
    setReflectionVariants([]);
    setReflectionFileName('');
  }

  async function editItem(item: TrainingLibraryItem) {
    setBusy(true);
    setErrorMessage('');
    setEditingItem(item);
    setActiveTab(item.type === 'quiz' ? 'quiz' : 'reflection');
    try {
      if (item.type === 'quiz') {
        const questionSetId = String(item.metadata.questionSetId || item.sourceId || '');
        const bundle = questionSetId ? await getQuizQuestionSetBundle(questionSetId) : null;
        setQuizTitle(item.title);
        setQuizDescription(item.description);
        setQuizQuestions(bundle?.questions || []);
        setQuizErrors([]);
        setQuizFileName(String(item.metadata.sourceFileName || ''));
      } else if (item.type === 'reflection') {
        const variants = Array.isArray(item.metadata.variants) ? item.metadata.variants as ReflectionVariant[] : [];
        setReflectionTitle(item.title);
        setReflectionDescription(item.description);
        setReflectionVariants(variants);
        setReflectionFileName(String(item.metadata.sourceFileName || ''));
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(item: TrainingLibraryItem) {
    const confirmed = window.confirm(`Xóa "${item.title}" khỏi thư viện VTraining? Các hoạt động đã gán vào lớp không bị xóa.`);
    if (!confirmed) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await trainingLibraryApi.deleteItem(item.id);
      if (editingItem?.id === item.id) clearEditing();
      await loadItems();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="suni-native-page">
      <SectionHeader eye="VTraining" title="Thư viện đào tạo" subtitle="Khởi tạo và lưu trữ bài kiểm tra, bài thu hoạch, thảo luận và game." />

      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

      <div className="vdiscussion-tabs">
        <button type="button" className={activeTab === 'quiz' ? 'is-active' : ''} onClick={() => setActiveTab('quiz')}><FileText size={16} /> Bài kiểm tra</button>
        <button type="button" className={activeTab === 'reflection' ? 'is-active' : ''} onClick={() => setActiveTab('reflection')}><FileText size={16} /> Bài thu hoạch</button>
        <button type="button" className={activeTab === 'guideHub' ? 'is-active' : ''} onClick={() => setActiveTab('guideHub')}><QrCode size={16} /> Tổng hợp hướng dẫn</button>
        <button type="button" className={activeTab === 'surveyGuide' ? 'is-active' : ''} onClick={() => setActiveTab('surveyGuide')}><QrCode size={16} /> Hướng dẫn khảo sát</button>
        <button type="button" className={activeTab === 'classActivitiesGuide' ? 'is-active' : ''} onClick={() => setActiveTab('classActivitiesGuide')}><QrCode size={16} /> Hướng dẫn hoạt động lớp</button>
        <button type="button" className={activeTab === 'discussionGuide' ? 'is-active' : ''} onClick={() => setActiveTab('discussionGuide')}><QrCode size={16} /> Hướng dẫn thảo luận</button>
        <button type="button" className={activeTab === 'discussion' ? 'is-active' : ''} onClick={() => setActiveTab('discussion')}><MessageCircle size={16} /> Sự kiện thảo luận</button>
        <button type="button" className={activeTab === 'game' ? 'is-active' : ''} onClick={() => setActiveTab('game')}><Gamepad2 size={16} /> Game</button>
      </div>

      {activeTab === 'guideHub' ? (
        <div className="vtraining-detail-stack">
          <GuideHubPanel
            onEditGuide={(kind) => {
              if (kind === 'survey') {
                setActiveTab('surveyGuide');
                return;
              }
              if (kind === 'classActivities') {
                setActiveTab('classActivitiesGuide');
                return;
              }
              setActiveDiscussionGuideKind(kind === 'discussionEvn' ? 'discussionEvn' : 'discussion');
              setActiveTab('discussionGuide');
            }}
          />
        </div>
      ) : null}
      {activeTab === 'surveyGuide' ? (
        <div className="vtraining-detail-stack">
          <DiscussionGuidePanel guideKind="survey" />
        </div>
      ) : null}
      {activeTab === 'classActivitiesGuide' ? (
        <div className="vtraining-detail-stack">
          <DiscussionGuidePanel guideKind="classActivities" />
        </div>
      ) : null}
      {activeTab === 'discussionGuide' ? (
        <div className="vtraining-detail-stack">
          <div className="vdiscussion-tabs">
            <button
              type="button"
              className={activeDiscussionGuideKind === 'discussion' ? 'is-active' : ''}
              onClick={() => setActiveDiscussionGuideKind('discussion')}
            >
              <QrCode size={16} /> Phiếu PLX
            </button>
            <button
              type="button"
              className={activeDiscussionGuideKind === 'discussionEvn' ? 'is-active' : ''}
              onClick={() => setActiveDiscussionGuideKind('discussionEvn')}
            >
              <QrCode size={16} /> Phiếu EVN
            </button>
          </div>
          <DiscussionGuidePanel guideKind={activeDiscussionGuideKind} />
        </div>
      ) : null}
      {activeTab === 'discussion' ? (
        <Suspense fallback={<div className="vdiscussion-empty">Dang tai thu vien thao luan...</div>}>
          <VDiscussionEventsPage />
        </Suspense>
      ) : null}
      {activeTab === 'game' ? (
        <Suspense fallback={<div className="vdiscussion-empty">Dang tai danh muc game...</div>}>
          <GameCatalogPage gameId={null} />
        </Suspense>
      ) : null}

      {activeTab === 'quiz' ? (
        <div className="vtraining-detail-stack">
          <Card
            title={editingItem?.type === 'quiz' ? 'Sửa bài kiểm tra' : 'Upload bài kiểm tra từ Excel'}
            action={<div className="suni-native-row-actions">{editingItem?.type === 'quiz' ? <button type="button" className="btn btn-ghost btn-small" onClick={clearEditing}>Hủy sửa</button> : null}<button type="button" className="btn btn-ghost btn-small" onClick={() => void downloadQuizTemplate()}>Tải file mẫu</button></div>}
          >
            <div className="form-grid">
              <label>
                <span>File Excel</span>
                <input type="file" accept=".xlsx,.xls" onChange={(event) => void handleQuizFile(event.target.files?.[0] || null)} />
              </label>
              <label>
                <span>Tiêu đề</span>
                <input value={quizTitle} onChange={(event) => setQuizTitle(event.target.value)} />
              </label>
              <label className="full">
                <span>Mô tả</span>
                <input value={quizDescription} onChange={(event) => setQuizDescription(event.target.value)} />
              </label>
            </div>
            {quizErrors.length ? <div className="notice danger">{quizErrors.slice(0, 8).join(' | ')}</div> : null}
            <div className="action-row">
              <button className="btn btn-primary" disabled={!quizQuestions.length || Boolean(quizErrors.length) || busy} onClick={() => void saveQuizLibrary()}>
                {busy ? 'Đang lưu...' : editingItem?.type === 'quiz' ? 'Lưu cập nhật' : 'Lưu vào thư viện'}
              </button>
            </div>
          </Card>
          <Card title={`Preview câu hỏi${quizQuestions.length ? ` (${quizQuestions.length} câu)` : ''}`}>
            <div className="suni-native-table-wrap">
              <table className="data-table suni-native-table">
                <thead><tr><th>Mã</th><th>Câu hỏi</th><th>Đáp án</th><th>Số lựa chọn</th></tr></thead>
                <tbody>
                  {quizQuestions.map((question) => (
                    <tr key={question.id}><td>{question.code}</td><td><strong>{question.prompt}</strong></td><td>{question.correctOptionId || '-'}</td><td>{question.options.length}</td></tr>
                  ))}
                  {!quizQuestions.length ? <tr><td colSpan={4}>Chưa chọn file hoặc chưa nhận diện được câu hỏi.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === 'reflection' ? (
        <div className="vtraining-detail-stack">
          <Card
            title={editingItem?.type === 'reflection' ? 'Sửa bài thu hoạch' : 'Upload bài thu hoạch từ Word'}
            action={<div className="suni-native-row-actions">{editingItem?.type === 'reflection' ? <button type="button" className="btn btn-ghost btn-small" onClick={clearEditing}>Hủy sửa</button> : null}<button type="button" className="btn btn-ghost btn-small" onClick={() => void downloadReflectionTemplate()}>Tải file mẫu</button></div>}
          >
            <div className="form-grid">
              <label>
                <span>File DOCX</span>
                <input type="file" accept=".docx" onChange={(event) => void handleReflectionFile(event.target.files?.[0] || null)} />
              </label>
              <label>
                <span>Tiêu đề</span>
                <input value={reflectionTitle} onChange={(event) => setReflectionTitle(event.target.value)} />
              </label>
              <label className="full">
                <span>Mô tả</span>
                <input value={reflectionDescription} onChange={(event) => setReflectionDescription(event.target.value)} />
              </label>
            </div>
            <div className="action-row">
              <button className="btn btn-primary" disabled={!reflectionVariants.length || busy} onClick={() => void saveReflectionLibrary()}>
                {busy ? 'Đang lưu...' : editingItem?.type === 'reflection' ? 'Lưu cập nhật' : 'Lưu vào thư viện'}
              </button>
            </div>
          </Card>
          <Card title="Preview đề thu hoạch">
            <div className="lecturer-bank-question-stack">
              {reflectionVariants.map((variant) => (
                <article className="lecturer-bank-question" key={variant.id}>
                  <div className="lecturer-bank-question-head">
                    <div>
                      <div className="lecturer-bank-question-code">{variant.title}</div>
                      <h4>{variant.courseTitle || reflectionTitle}</h4>
                    </div>
                    <Badge tone="success">{variant.questions.length} câu</Badge>
                  </div>
                  {variant.questions.slice(0, 5).map((question) => <div className="bullet-item" key={question.id}><strong>Câu {question.code}.</strong> {question.prompt}</div>)}
                </article>
              ))}
              {!reflectionVariants.length ? <div className="muted-text">Chưa chọn file hoặc chưa nhận diện được đề thu hoạch.</div> : null}
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === 'quiz' || activeTab === 'reflection' ? <Card title="Nội dung đã lưu" action={<Badge tone={loading ? 'warning' : filteredItems.length ? 'success' : 'neutral'}>{filteredItems.length} mục</Badge>}>
        <div className="suni-native-table-wrap">
          <table className="data-table suni-native-table">
            <thead><tr><th>Loại</th><th>Tiêu đề</th><th>Nguồn</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>{itemTypeLabel(item.type)}</td>
                  <td><strong>{item.title}</strong><span>{item.type === 'discussion' ? normalizePlxDiscussionGuideText(item.description || item.id) : item.description || item.id}</span></td>
                  <td>{item.sourceType || '-'}</td>
                  <td><Badge tone={item.status === 'active' ? 'success' : 'warning'}>{item.status}</Badge></td>
                  <td>
                    <div className="suni-native-row-actions">
                      <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={() => void editItem(item)}><Pencil size={14} /> Sửa</button>
                      <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={() => void deleteItem(item)}><Trash2 size={14} /> Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredItems.length ? <tr><td colSpan={5}>Chưa có nội dung trong nhóm này.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card> : null}
    </div>
  );
}
