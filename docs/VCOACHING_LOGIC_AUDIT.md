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

## Chưa thể coi là hoàn thiện toàn bộ logic

1. Tiến trình chuyển đổi: máy chủ có trạng thái theo tệp, chưa lưu thời điểm và
   lỗi riêng cho từng công đoạn. Thanh sáu bước hiện chưa phải nhật ký từng bước.
2. Tổng hợp nguồn: nhận diện theo cấu trúc/mã/tên và tên chủ đề duy nhất, chưa có
   đối chiếu ngữ nghĩa đầy đủ hoặc phát hiện mọi mâu thuẫn số liệu giữa nhiều tệp.
3. Bảng ba tầng: còn trình bày nguồn tổng hợp; chưa chuẩn hóa đầy đủ mọi hàng cơ
   chế/hành vi/kết quả và quan hệ giữa các hàng của từng loại biểu.
4. Cấu hình AI: lưu được chỉ dẫn nhưng chưa nối mô hình xử lý; không gọi việc
   lưu cấu hình là đã phân tích nội dung bằng AI.
5. Báo cáo cấp hệ thống: có thống kê thật, chưa tự kết luận điểm nghẽn lặp lại
   hoặc mức độ cải thiện chất lượng khi chưa có đánh giá có căn cứ.

Kiểm tra đợt này: 13 kiểm tra logic màu/trạng thái, TypeScript và build.
Không thay đổi dữ liệu production. Không khẳng định sản phẩm đã khớp toàn bộ
logic mockup chỉ vì nhóm kiểm tra này đạt.
