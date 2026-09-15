# Rà soát logic V-Coaching — 15/09/2026

## Đã sửa trong đợt này

- Bỏ điều kiện cảnh báo cố định `step === 4`. Tab đang chọn và trạng thái cần
  kiểm chứng là hai thông tin khác nhau.
- Trang 00, trục 01–08 và bộ lọc dùng chung `stepAssessment`.
- Có nguồn nhưng chưa đánh giá: trung tính, ghi “Chưa đánh giá”. Chưa có ánh xạ:
  ghi “Chưa ánh xạ”, cần kiểm chứng; không kết luận nguồn không có thông tin.
- Nhận xét chuyên gia chỉ quyết định chất lượng sau duyệt; bản nháp không phải
  kết luận. Bỏ nhận xét đã bác, stale hoặc khác phiên bản hiện tại.
- Dấu hiệu từ quy tắc cần đối chiếu tạo cảnh báo; đánh giá chuyên gia đã duyệt
  được ưu tiên. Bước 07 xét cả 7A/7B/7C.
- Trước–sau: màu theo nhãn đánh giá hiện hành. Rõ hơn dùng màu tốt; không thay
  đổi trung tính; còn yếu/cần xác minh dùng cảnh báo.

Mockup HTML vẫn gắn lớp bottleneck cố định cho bước 04 ở hàm tabs. Bản trình diễn
không đủ làm nguồn cho logic vận hành. Quy tắc mới thực hiện yêu cầu trực tiếp
của người dùng: chỉ dùng màu cảnh báo khi có trạng thái cần kiểm chứng.

## Bổ sung kiểm tra vận hành ngày 15/09/2026

- Không công bố lại góp ý để mở bản đã nộp hoặc đặt lại tiến độ nộp từng bước.
- Nộp một bước giữ hiệu lực nhận xét chưa sửa ở các bước khác trên phiên bản mới.
- Kiểm tra lại mở quyền duyệt nhận xét mới; xác nhận dữ liệu giữ trạng thái kiểm tra
  lại; hoàn tất bị chặn nếu còn nhận xét chờ xử lý. Admin hệ thống mở lại bản nộp
  có lý do đúng quyền, chuyên gia không được tự mở bản đã nộp.
- Tải nguồn trùng không ghi đè hồ sơ đã xác nhận/nhận xét/hiệu chỉnh/nộp. Nguồn mới
  được giữ riêng để đối chiếu trong trường hợp này. Luồng tự ghép vẫn áp dụng với
  hồ sơ mới chưa được xử lý bởi con người.
- Chờ các tệp đã tiếp nhận đang xếp hàng/đọc trong cùng đơn vị trước khi tổng hợp.
  API không báo hoàn tất khi còn chờ. Tệp chưa tải xong không khóa cả đơn vị.
- Lưu công đoạn theo tệp ở máy chủ, có trạng thái/thời điểm và lỗi đọc. Giao diện
  dùng trạng thái đó; hồ sơ cũ không có nhật ký được ghi rõ. Các công đoạn sau đọc
  được lưu trong cùng giao dịch, không mô phỏng phần trăm hay thời lượng.
- Nếu tải một tệp lỗi, các tệp trước đã tiếp nhận vẫn được gửi xử lý. Lỗi xử lý
  một tệp không ngăn yêu cầu xử lý những tệp tiếp theo.
- So sánh chuỗi giá trị số ở các trường cùng nhãn, khác tệp; tạo dấu hiệu cần đối
  chiếu kèm cả hai nguồn. Không tự chọn số đúng hoặc kết luận có mâu thuẫn nghiệp vụ.
- Bảng ba tầng liên kết hiện trạng/KPI theo định danh tệp + bảng + hàng; không lấy
  baseline chung cho mọi hàng. Thiếu trường tương ứng thì ghi thiếu, không suy đoán.

### Bằng chứng kiểm tra

- 15 ca kiểm thử Python đạt: tài liệu thật, phân quyền, bảo mật nhận xét, nộp từng
  bước, kiểm tra lại/hoàn tất/mở lại, bảo vệ bản nộp khi tải thêm, công đoạn xử lý,
  khác biệt số liệu, giữ nguyên bản và xuất Word.
- Bộ Ban Nhân lực: ba sáng kiến chính kết hợp nguồn tổng hợp/chi tiết; đề xuất thứ
  tư riêng; gọi chuyển đổi lại không nhân phiên bản khi không có dữ liệu mới.
- 13 kiểm tra trạng thái/màu đạt. Kiểm tra render bảng với tệp cùng tên nhưng khác
  định danh/hàng đạt. TypeScript và build đạt.
- Kiểm thử chạy trên cơ sở dữ liệu tạm. Không cập nhật production, chưa xác minh
  vòng upload thật qua trình duyệt trên Vercel ở đợt này.

## Phạm vi còn chưa được bảo đảm

1. Nhận diện theo cấu trúc/mã/tên/chủ đề duy nhất; chưa nhận diện ngữ nghĩa mọi
   biến thể tên hoặc mọi mâu thuẫn. Nguồn không xác định chắc vẫn được giữ riêng.
2. PDF scan cần OCR; chưa có dịch vụ OCR hoạt động để bảo đảm đọc mọi tệp scan.
3. Cấu hình AI mới lưu chỉ dẫn, chưa nối mô hình. Không coi lưu cấu hình là đã
   phân tích hoặc kiểm chứng nội dung bằng AI.
4. Mốc công đoạn không phải hàng đợi độc lập cho cả sáu bước. Chọn tệp đang xem
   lưu theo trình duyệt; chưa có lô đa tệp dùng chung qua các thiết bị.
5. Báo cáo có thống kê dữ liệu thật, chưa tự suy ra điểm nghẽn lặp lại hay mức độ
   cải thiện khi chưa có đánh giá có căn cứ.
6. Cần kiểm thử tích hợp upload/storage/worker/quyền thực tế trên bản triển khai
   của commit mới; build đạt không chứng minh production hoạt động đầy đủ.

Không khẳng định hoàn thiện 100% logic mockup hoặc mọi loại tài liệu.

## Điều chỉnh bộ tài liệu đầu vào và tên sáng kiến

- Tải lên chỉ đọc/trích xuất; người dùng chọn tệp đã tải trong cùng đơn vị rồi
  bấm **Phân tích & tổng hợp**. Bản trích xuất mới chưa hiện trong Sáng kiến.
- Tổng hợp chỉ xét các tệp được chọn, không lấy tệp khác của đơn vị. Hồ sơ đã
  tổng hợp trước đó chứa thêm tệp thì yêu cầu chọn đủ nguồn, không lặng lẽ dùng
  tệp ngoài lựa chọn. Không sửa bản đã được nhận xét/nộp.
- Ghép được cả nhiều bản tổng hợp hoặc nhiều bản chi tiết không có Mẫu 01.
  Chuẩn hóa dấu/ký tự, các viết tắt CSKH/CNTT/KH/DN/NL/CBNV; hỗ trợ chữ cái đầu
  của toàn tên. Tên gần giống phải có nội dung tương đồng; tên số khác, khác
  đơn vị hoặc nhiều nhóm phù hợp không tự ghép theo chuỗi nối tiếp.
- Không phải mô hình hiểu mọi cách diễn đạt: viết tắt lạ hoặc tên đổi hoàn toàn
  vẫn có thể chưa ghép được. Nguồn gốc/khác biệt được giữ, không bịa nội dung.
- 17 kiểm thử nghiệp vụ đạt, gồm phạm vi tệp chọn, chạy lại không nhân phiên bản,
  tên viết tắt/sai dấu, chi tiết không có master và bộ tài liệu thật.

## Tên rút gọn SK02 Fanpage — kiểm thử theo tài liệu Ban Truyền thông

Bổ sung ghép tên ngắn là phần đầu của tên đầy đủ khi cùng mã, cùng phạm vi đơn
vị và có đoạn vấn đề/hiện trạng/mục tiêu/kết quả đủ dài, tương đồng cao. Không
chỉ dùng độ giống tên hoặc mã SK02. Nếu nguồn ghi hai đơn vị khác nhau, nhánh
nhận diện này không tự ghép. Giữ nguyên quy tắc không chọn tùy ý giữa nhiều nhóm.

Kiểm thử đúng Mẫu 01 và SK02 Mẫu 02 của Ban Truyền thông: một hồ sơ với tên đầy
đủ từ Mẫu 01, hai nguồn và toàn bộ các đoạn được giữ nguyên. Kiểm tra âm tính
khác mã/đơn vị/thiếu bằng chứng đạt; 18 ca kiểm thử nghiệp vụ đạt.

Để áp dụng cho dữ liệu đã tải, triển khai commit mới rồi chọn lại bộ tệp nguồn
và bấm Phân tích & tổng hợp. Không cần xóa/tải lại. Hồ sơ đã được người dùng
nhận xét hoặc nộp vẫn được bảo vệ; không tự sửa dữ liệu production trong đợt này.
