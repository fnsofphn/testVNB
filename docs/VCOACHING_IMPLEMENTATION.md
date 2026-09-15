# V-Coaching — triển khai và kiểm chứng ngày 15/09/2026

## Chạy tại máy này

Từ `D:\02. Github\02. Test-Vinabrain\testVNB`:

```powershell
node scripts/vcoaching-dev.mjs
```

Mở `http://127.0.0.1:3000/vcoaching`. Lệnh chạy Vite và worker Python tại
`127.0.0.1:8766`; đóng trình duyệt không hủy hàng đợi. Khởi động lại worker sẽ
phục hồi các file đang đọc dở. Đây là bản chạy cục bộ; chưa triển khai website
Vercel. Tài khoản Auth dùng Supabase test đã được người dùng xác nhận.

Python cần các gói trong `vcoaching/requirements.txt`. Script tự dùng Python
bundled của Codex nếu có và thư viện tại `.cache/vcoaching-deps`. Có thể chọn
Python qua `VCOACHING_PYTHON`. Cấu hình backend trong `.env.local`:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; frontend chỉ dùng
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Mật khẩu 4 tài khoản mới: `.cache/vcoaching/login.txt` (chỉ nằm trên máy này).
Admin giữ mật khẩu cũ. Không commit các file này. Chi tiết: `VCOACHING_AUTH.md`.

## Luồng đã triển khai

- Auth thật, 5 role nghiệp vụ, Admin tổng, role switch thu hẹp scope phía server,
  nhật ký actor thật và scope hiệu lực. Đọc quyền mới từ Auth mỗi request.
- Quản trị Auth và profile: tạo/sửa/cấp mật khẩu/khóa/mở khóa/xóa, bảo vệ Admin
  cuối cùng, giữ quyền module khác, rollback khi đồng bộ profile thất bại.
- Danh mục chương trình/đơn vị/phiên/thư viện; phân công chuyên gia theo sáng kiến.
- Upload nhiều DOCX/PDF, hàng đợi và dữ liệu SQLite bền vững, SHA-256, người tải,
  thời gian, file gốc bất biến, phát hiện tải trùng trong cùng phạm vi.
- Parse cục bộ, không gửi tài liệu cho AI hoặc lưu nội dung lên Supabase. PDF
  không đọc đủ có trạng thái OCR; tài liệu phụ trợ có phân loại riêng.
- Tách nhiều biểu trong một file; Master/chi tiết chỉ ghép khi mã và tên khớp
  bằng quy tắc bảo thủ. Có xử lý alias đơn vị khai báo trong tài liệu. Mâu thuẫn
  mã/tên hoặc tên tệp được giữ chờ xác minh. Ghép thủ công cần lý do và giữ nguồn.
- 10 ô WS1b đúng thứ tự 1–6, 7A Hành vi, 7B Cơ chế, 7C Kết quả, 8. Các ô trỏ về
  đoạn nguyên văn có vị trí DOCX mục/bảng/hàng/cột/đoạn hoặc PDF trang/tọa độ.
  Nội dung chưa mapping vẫn được giữ, không cắt cho vừa ô mẫu.
- Quy tắc phát hiện thiếu mapping 3 tầng, Owner mâu thuẫn, baseline chưa rõ hoặc
  kế hoạch thiết lập baseline. Nhận xét cần người duyệt, không tự kết luận thành công.
- Tách nhận xét khỏi câu trả lời. Đơn vị chỉ thấy nhận xét đã duyệt để công bố,
  sau khi quản trị dự án mở góp ý. Notes/giả thuyết nội bộ không trả về cho đơn vị.
- Chuyên gia duyệt/bác và khóa; quản trị dự án mở góp ý; đơn vị tự soi 5 Quality
  Gate/10 tiêu chí, đồng ý/một phần/không đồng ý, hiệu chỉnh, lưu nháp/nộp, đính kèm
  bằng chứng. Mở lại bản nộp cần lý do. Kiểm tra lại và xác nhận cuối có trạng thái.
- Phiên bản và đối chiếu trước/sau; báo cáo JSON theo scope và nhật ký thao tác.
- Xuất một/nhiều DOCX hoặc ZIP từ chính template WS1b. Giữ 5 phần, câu hướng dẫn,
  các package part ngoài document.xml, thay tên đơn vị, điền đúng 10 ô, không tự
  chấm thay đơn vị, phụ lục chứa nguyên văn/vị trí nguồn và nhãn nháp/xác nhận.
- Vite chặn HTTP truy cập `.cache`, `.env*` và mã backend. Dữ liệu tải về đi qua
  endpoint có kiểm tra quyền. SQLite POST dùng giao dịch và khóa đồng bộ worker.

## Kiểm chứng đã thực hiện

1. Seed unit tests: guard môi trường, dry-run, idempotency, không khôi phục quyền
   đã thu hồi, rollback provisioning — PASS.
2. `scripts/test-vcoaching.py`: corpus thực, workflow, dữ liệu nội bộ, forged
   mapping/scope, Auth grant mới và switch, last-admin, cấu trúc DOCX — 6 tests PASS.
3. `scripts/test-vcoaching-live.mjs`: login mật khẩu 4 tài khoản thật; import Master
   CLSP đúng SK2.1/2.2/2.3; upload lặp không nhân bản; scope và phân công — PASS.
4. `scripts/test-vcoaching-admin-live.mjs`: phiên Admin thật không đổi mật khẩu;
   5 role switch; Auth CRUD; phiên cũ chịu quyền mới/khóa; xuất 3 DOCX — PASS.
   Script tạo tài khoản tạm và xóa nó ở finally; không chạy trong production.
5. Quét 61 DOCX/PDF thực: không exception; 72 biểu ứng viên (KHÔNG phải 72 sáng kiến
   duy nhất). 2 file scan được đánh dấu OCR. Báo cáo `.cache/vcoaching/corpus-report.json`.
6. CLSP Master = 3 sáng kiến; PCTT detail 18 trang = 3; PTTT 28 trang = 10 biểu
   Master/detail ghép thành 5 hồ sơ. Mã SK05 tên file/nội dung SK01 được cảnh báo.
7. Kiểm tra trình duyệt thật: login đơn vị, hiển thị đúng role, 3 sáng kiến CLSP,
   màn hình nguồn/mapping và screenshot desktop. Login chuyên viên hiện đúng chức năng
   mapping; thứ tự 7A/7B/7C/8 đúng. Nút Xuất WS1b báo thành công, không có console
   error. Tải tài liệu qua API thật thành công.
8. TypeScript noEmit và Vite build đã chạy thành công. Không chỉnh V-Work.
9. HTTP yêu cầu trực tiếp password file, SQLite, .env.local và server.py đều 403.

Chạy lại test offline:

```powershell
$env:PYTHONPATH=(Resolve-Path .cache/vcoaching-deps).Path
$env:PYTHONIOENCODING='utf-8'
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scripts/test-vcoaching.py
node scripts/test-vcoaching-seed.mjs
```

Test live cần worker đang chạy, đọc `.env.local` và có thao tác thật trên test:

```powershell
node --env-file=.env.local scripts/test-vcoaching-live.mjs
node --env-file=.env.local scripts/test-vcoaching-admin-live.mjs
```

## Giới hạn nghiệm thu còn lại

- Chưa cấu hình OCR: hai PDF scan cần bản có text hoặc pipeline OCR cục bộ.
- Chưa cấu hình AI ngữ nghĩa; hệ thống chỉ chạy quy tắc và chuyên gia duyệt. Chưa
  thể coi các đánh giá nội dung sâu của chuyên gia là tự động hóa đầy đủ.
- Trình duyệt Chrome extension chặn upload tự động vì chưa bật Allow access to
  file URLs. Đã thử file chooser; không ghi nhận upload UI là pass. API thật pass.
- DOCX đã kiểm tra OOXML/nội dung/package preservation, nhưng renderer báo thiếu
  `soffice.exe`. Chưa có PDF/ảnh từng trang và chưa nghiệm thu bố cục bản in.
- Bản này cần worker và volume SQLite cục bộ. Không thể chỉ đẩy frontend lên Vercel
  rồi dùng đủ chức năng; triển khai máy chủ/volume và TLS cần công việc riêng.
- Chưa kiểm thử tự động hết các thao tác UI trên mọi kích thước màn hình. Báo cáo
  hiện là JSON. Phần chưa mapping cần chuyên viên xem và xác nhận, không tự kết luận thiếu.

Không gọi toàn bộ sản phẩm đã nghiệm thu khi các mục trên chưa xử lý.
