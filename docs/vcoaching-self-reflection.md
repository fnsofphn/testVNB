# V-Coaching: tự soi và hiệu chỉnh 8 bước

## Luồng sử dụng

### Phiếu giảng viên

Trong màn 8 bước, giảng viên/quản trị dự án chọn **Giảng viên nhận xét** để
nhập cả câu hỏi, câu trả lời và đánh giá của mình; không phải chờ đơn vị trả lời.
Mỗi người có phiếu riêng. **Đơn vị tự soi** vẫn giữ luồng và dữ liệu hiện có.
Thêm/sửa/xóa câu hỏi áp dụng cho phiếu giảng viên của hồ sơ đang mở, không sửa
bộ câu hỏi gốc hoặc bản tự soi đơn vị. Lưu phiếu/chuyển bước ghi qua API
`expert-worksheet`, kiểm tra phân quyền, phạm vi, revision và phiên bản nguồn.
Các câu hỏi đã xóa cùng câu trả lời được giữ trong lịch sử mỗi lần lưu.
Phiếu là bản làm việc riêng, chưa tự công bố cho đơn vị. Nhận xét công bố vẫn
đi qua luồng khóa/mở góp ý hiện có. Không cần migration hoặc đổi cấu hình cloud.

Trong hồ sơ sáng kiến, mở **Tự soi & hiệu chỉnh 8 bước**. Đơn vị đọc nguồn,
trả lời tiêu chí, chọn kết luận và nhập nội dung sửa nếu cần. Lưu nháp hoặc
chuyển bước trong form sẽ lưu bước đang sửa. Bước 7 giữ riêng 7A/7B/7C.

Màn **Kết quả** tổng hợp trước–sau và cam kết hành động. Hoàn thành cả 8 bước
và lưu cam kết mới được gửi. Hoàn thành tự soi không đồng nghĩa mọi nội dung
đã đủ căn cứ: kết luận cần kiểm chứng/hỗ trợ phải có việc làm, người phụ trách
và thời hạn. Chuyên gia/quản trị dự án duyệt hoặc trả lại kèm lý do.

## Contract và lưu trữ

- `self_reflection_schema.json` là nguồn câu hỏi chung cho React và Python,
  lấy từ form Kiểu 2; bước 4 dùng 5 tiêu chí đã được người dùng cung cấp.
- `SelfReflection.tsx` là màn con của hồ sơ hiện có, dùng chung API command,
  refresh và trạng thái lỗi/loading. Không tạo route, đăng nhập hay kho dữ liệu mới.
- `self_reflection.py` kiểm tra dữ liệu và chuyển trạng thái; `server.py` vẫn
  chịu trách nhiệm xác thực, phạm vi đơn vị/chuyên gia, transaction và nhật ký.
- Dữ liệu nằm trong JSON sáng kiến hiện có: `self_reflection` (bản đang làm),
  `self_submissions` (ảnh chụp mỗi lần gửi), `self_reviews` (quyết định),
  `self_archives` (bản cũ khi bắt đầu đợt mới). Không cần migration.
- API `reflection`: save, commitment, submit, restart. Mỗi lần ghi gửi kèm
  `base_version` và `revision`; xung đột trả 409, không tự ghi đè.
- API `reflection-review`: accept/return, bắt buộc đúng `submission_id` và lý do.
  Dùng lại quyền chuyên gia được phân công/quản trị dự án và quyền admin hiện có.

## Phiên bản và tính tương thích

Lưu nháp/gửi không thay đổi `versions`. Khi duyệt, tạo một phiên bản mới với
nội dung clarify/revise, giữ nguyên nguồn và phiên bản cũ. Lưu một response
tương thích để báo cáo/xuất hiện tại tiếp tục đọc được. Nhận xét cũ được đánh
dấu cần xem lại và chạy lại bộ quy tắc hiện có. Trạng thái hồ sơ là `rechecked`,
không tự đánh dấu hoàn tất hoặc tự xác nhận chất lượng.

Bản gửi khóa sửa cho đến khi duyệt/trả lại; gửi lặp cùng mã không tạo thêm
bản. Khi nguồn đổi trong lúc có nháp, đơn vị phải bắt đầu đợt mới để đối chiếu.
Không tự ghép nguồn vào hồ sơ đã có lịch sử tự soi. API phản hồi từng bước cũ
chỉ tiếp tục phục vụ hồ sơ chưa dùng form mới; lịch sử cũ được giữ nguyên.

Góp ý PeopleOne vẫn theo quyền công bố hiện có. Đơn vị có thể tự soi trước
khi công bố góp ý. Đính kèm tệp bằng chứng giữ điều kiện mở phản hồi hiện có;
các bước khác có trường ghi bằng chứng/nguồn dự kiến.

## Tổng hợp hiệu chỉnh theo biểu mẫu

Tab Tổng hợp hiệu chỉnh sử dụng cấu trúc hai DOCX gốc trong
`vcoaching/form_schema.json`: Biểu mẫu 01 ở cấp đơn vị (I–VI), Biểu mẫu 02
ở cấp sáng kiến (I–VII). Các mục, nhãn và cột theo mẫu; ô chưa có dữ liệu
để trống. Hàng hướng dẫn gộp ô được trình bày thành đoạn trước bảng.

Bản đang chỉnh hiển thị phần tự soi đã lưu; chế độ nguồn và hiệu chỉnh đã
duyệt chỉ áp dụng các hiệu chỉnh được duyệt. Dữ liệu nguồn không được tự
coi là đã duyệt. Khi phiên bản nguồn thay đổi, nháp cũ không tự ghép vào
bản tổng hợp. Các ô được ánh xạ từ tự soi chỉnh tại 8 bước; phần khác được
bổ sung trực tiếp tại biểu mẫu. Nội dung khác nhau giữa các nguồn có mục
đối chiếu riêng.

Phần bổ sung Biểu mẫu 02 lưu trong `self_reflection.form_cells`, đi cùng
snapshot khi gửi và chuyển vào phiên bản sáng kiến khi duyệt. Phần bổ sung
Biểu mẫu 01 lưu bằng loại bản ghi `master_form` trong kho hiện có, có luồng
lưu/gửi/duyệt/trả lại riêng. Danh mục sáng kiến trong Biểu mẫu 01 lấy từ các
hồ sơ cùng đơn vị, không nhập lại. API kiểm tra phạm vi đơn vị, vai trò và
revision để tránh ghi đè cập nhật đồng thời. Tài liệu gốc được giữ nguyên.

## Kiểm thử biểu mẫu

`scripts/test-vcoaching.py Workflow` dùng dữ liệu cục bộ cô lập, kiểm tra đủ
8 bước, lưu nháp không sửa nguồn, gửi lặp, trả lại/gửi lại/duyệt, snapshot cũ,
quyền sai vai trò/đơn vị và xung đột phiên bản. TypeScript, kiểm tra encoding
và Vite build là các kiểm tra frontend. Cần kiểm tra bổ sung luồng trình duyệt
sau đăng nhập trên deployment trước khi xác nhận sử dụng production.
