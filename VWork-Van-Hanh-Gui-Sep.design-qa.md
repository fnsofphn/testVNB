# Design QA — VWork vận hành gửi sếp

## Phạm vi

- Artifact: `VWork-Van-Hanh-Gui-Sep.html`
- Source of truth: `C:\Users\Nam\AppData\Local\Temp\codex-clipboard-40a94216-2e40-4989-b564-8c2057115a47.png`
- Trạng thái chuẩn hóa để so sánh: vai trò **Quản lý vận hành**, dự án `PPO_TEST`, khóa `Đào tạo Test`, lớp `PPO_TEST-TNKH201`, màn hình **Công việc**.
- Dữ liệu trong prototype được gắn nhãn rõ là dữ liệu review `PPO_TEST`; không đại diện dữ liệu production đang chạy.

## Bằng chứng hình ảnh

- Source crop: nửa phải ảnh gốc, vùng ứng dụng VWork, quy đổi về `1920 × 930`.
- Implementation: `C:\Users\Nam\AppData\Local\Temp\vwork-production-review-1920x930.png`.
- Full comparison: `C:\Users\Nam\AppData\Local\Temp\vwork-production-comparison.png`.
- Focused comparisons:
  - `C:\Users\Nam\AppData\Local\Temp\vwork-production-comparison-top.png`
  - `C:\Users\Nam\AppData\Local\Temp\vwork-production-comparison-tasks.png`
- Viewport kiểm thử chính: `1200 × 800`, DPR `1`.
- Viewport kiểm thử responsive: `390 × 844`.

## Lịch sử lặp

### Iteration 1 — Không đạt

- Bản đầu thiên về landing page/tường thuật, chưa phản ánh đúng giao diện vận hành thật.
- Thiếu mật độ dữ liệu và cấu trúc điều hướng theo role như màn hình VWork.
- Hành động: dựng lại toàn bộ theo application shell của ảnh nguồn và code hiện có.

### Iteration 2 — Đạt

- Bổ sung application shell PeopleOne/VWork, sidebar burgundy, topbar, bộ chọn ngữ cảnh, tiến trình vận hành và bảng công việc.
- Bổ sung đủ 6 role cùng điều hướng riêng theo nghiệp vụ.
- Bổ sung drawer chi tiết, modal thêm việc, chọn nhiều/giao việc, cập nhật trạng thái và responsive mobile.

## Rubric trực quan

| Bề mặt | Kết quả | Ghi chú |
|---|---|---|
| Typography | Pass | Cỡ chữ, độ đậm và phân cấp bám sát giao diện nguồn; ưu tiên khả năng đọc khi trình chiếu. |
| Spacing / layout | Pass | Cấu trúc sidebar–topbar–context–content và mật độ bảng tương đồng; không có page overflow ở mobile. |
| Colors | Pass | Đúng hướng màu burgundy/đỏ thương hiệu, canvas xám nhạt, status xanh–vàng–xám. |
| Image quality | Pass | Giao diện quản trị không phụ thuộc ảnh trang trí; logo P1 được dựng bằng UI element sắc nét. |
| Copy / content | Pass | Dùng đúng thuật ngữ, mã lớp, input và task từ repo/screenshot; có nhãn dữ liệu review. |

## Functional QA

- [x] Đủ 6 role: Quản lý vận hành; Đầu mối / Sale; Chuyên viên nội dung; Chuyên viên vận hành VTraining; Quản lý ekip; Thành viên ekip.
- [x] Mỗi role hiển thị đúng nhóm menu theo module hiện tại.
- [x] Bộ chọn dự án, khóa học và lớp hoạt động.
- [x] Chọn việc, giao việc, xem chi tiết và thêm công việc hoạt động ở chế độ demo trong bộ nhớ.
- [x] Mobile menu mở, điều hướng và tự đóng sau khi chọn trang.
- [x] Không có console warning/error ở trạng thái bàn giao.
- [x] HTTP preview trả `200`; HTML có doctype; không có ký tự lỗi mã hóa.
- [x] `pnpm run check:text-encoding` pass.

## Kết luận

Không còn finding mức P0, P1 hoặc P2 trong phạm vi prototype review. Khác biệt có chủ đích duy nhất là prototype hiển thị trạng thái role selector đóng ở ảnh QA; danh sách 6 lựa chọn đã được kiểm thử tương tác trực tiếp.
