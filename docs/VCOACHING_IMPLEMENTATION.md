# V-Coaching — triển khai và kiểm chứng ngày 15/09/2026

## Triển khai Vercel production

Bản cloud dùng Vercel Python Function `api/vcoaching.py`, Supabase Postgres và
bucket riêng `vcoaching-private`. Không cần chạy worker trên máy cá nhân.
Migration `20260915050959_vcoaching_cloud_runtime.sql` đã áp dụng vào project
Test-Vinabrain `npazlysytrqhnwezugcs` ngày 15/09/2026. Production và Preview có
namespace riêng; không tự sao chép dữ liệu SQLite cục bộ lên cloud.

Vercel project: `test-vinabrian`; domain: `https://test-vinabrain.vercel.app`.
Đã kiểm tra trên dashboard: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` tồn tại cho Production và Preview.
Không cần đưa service-role key vào biến `VITE_*`.

**Production vẫn theo nhánh `codex/vwork-isolated`; push `main` chỉ tạo Preview.**
Người dùng triển khai commit mới vào môi trường **Production**, có build lại
bằng biến Production, rồi mở `/vcoaching`. Không redeploy commit lỗi `4d3f984`.
Chưa xác minh deployment cloud mới ở trạng thái Ready vì người dùng tự deploy.

- `vercel.json` giữ framework Vite, thêm rewrite `/vc-api/:op` tới Python Function.
  Runtime Python 3.12, dependency được khóa trong requirements, template WS1b kèm repo.
- Vercel Fluid Compute đã bật (đã xác minh trên dashboard) (Function tối đa 300 giây). Tải tệp đi trực tiếp
  vào Supabase qua URL ký, tối đa 30 MB/tệp; không đi qua giới hạn body của Function.
- Mỗi thao tác đọc/ghi kiểm tra Auth grant mới và scope. Client không có quyền
  trực tiếp vào bảng cloud; RLS bật, quyền anon/authenticated bị thu hồi.
- Kho nguồn là private, kiểm tra SHA-256 trước parse, không upsert tệp gốc.
  Tệp xuất cũng private, trả URL ký có hạn 60 giây sau kiểm tra quyền.
- Lease và RPC commit ghi nhiều record trong một transaction, chặn ghi đè từ
  instance khác. Job có claim riêng; khôi phục job gián đoạn, tối đa 3 lần thử.
- Supabase Cron `vcoaching-dispatch` kiểm tra mỗi phút, chỉ gọi Function nếu
  có job chờ/gián đoạn. Bearer riêng nằm trong Vault. Đã cấu hình target production;
  cron chỉ xử lý được sau khi commit cloud được deploy vào domain production.
- Preview xử lý ngay sau upload trong trình duyệt; cron nền chỉ gắn với production.
  Nếu đóng Preview sớm, job chờ được giữ lại nhưng chưa có lịch riêng cho Preview.
- Đổi service-role key phải chạy lại `python scripts/vcoaching-cloud-setup.py --apply`
  bằng cấu hình mới để cập nhật secret worker. Chạy không `--apply` để dry-run.

Kiểm chứng cloud bằng `scripts/test-vcoaching-cloud.py` (bật `VCOACHING_CLOUD_TEST=1`):
Auth thật; signed upload/download DOCX trên 5 MB; chống trùng, khôi phục job gián đoạn; đọc 3 sáng kiến CLSP; DOCX xuất đúng package;
lease loại trừ ghi đồng thời. Dữ liệu E2E tạo trong namespace UUID riêng và dọn
ở `finally`. Không chạy seed hoặc test Auth CRUD trên production.

Advisor chỉ báo INFO `RLS Enabled No Policy` cho bảng V-Coaching: đây là thiết kế
server-only có thu hồi quyền client; không thêm policy public để dập cảnh báo.
Tham khảo: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

Rollback ứng dụng: redeploy commit trước. Giữ nguyên bảng/bucket/Vault để bảo toàn
nguồn và phiên bản; nếu cần dừng worker, pause riêng cron `vcoaching-dispatch`.
Không drop bảng hoặc xóa bucket để rollback code.

## Chạy tại máy này

Từ `D:\02. Github\02. Test-Vinabrain\testVNB`:

```powershell
node scripts/vcoaching-dev.mjs
```

Mở `http://127.0.0.1:3000/vcoaching`. Lệnh chạy Vite và worker Python tại
`127.0.0.1:8766`; đóng trình duyệt không hủy hàng đợi. Khởi động lại worker sẽ
phục hồi các file đang đọc dở. Đây là chế độ phát triển cục bộ; chế độ Vercel dùng backend cloud bên trên. Tài khoản Auth dùng Supabase test đã được người dùng xác nhận.

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
- Upload nhiều DOCX/PDF, hàng đợi và dữ liệu bền vững (SQLite local / Supabase cloud), SHA-256, người tải,
  thời gian, file gốc bất biến, phát hiện tải trùng trong cùng phạm vi.
- Parse tại backend, không gửi tài liệu cho AI; cloud lưu nguồn riêng trên Supabase. PDF
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
- Cloud đã kiểm thử với Supabase thật từ backend local; còn cần người dùng deploy
  commit mới và kiểm tra đăng nhập/upload/export trên domain production thực tế.
- Chưa kiểm thử tự động hết các thao tác UI trên mọi kích thước màn hình. Báo cáo
  hiển thị dạng bảng, xem trước và tải xuống HTML. Phần chưa mapping cần chuyên viên xem và xác nhận, không tự kết luận thiếu.

Không gọi toàn bộ sản phẩm đã nghiệm thu khi các mục trên chưa xử lý.

## Giao diện theo mockup ngày 15/09/2026

Nguồn đối chiếu: `D:/04. Code/Vcoaching/V-Coaching-VNPT-Rising-Mockup (1).html`.
CSS gốc được áp dụng riêng cho V-Coaching: Arial 14 px, sidebar 185 px,
header, banner gradient, bảng, bộ lọc, thẻ số liệu, màu sáng/tối theo hệ thống.
Menu theo năm vai trò, Trang 00 và thanh 00–08 được nối với dữ liệu thật.
Bước 07 giữ đúng ba ô WS1b: 7A hành vi, 7B cơ chế, 7C kết quả.
Nhận xét có cột nguồn đối chiếu; quản lý tài khoản dùng bảng và hộp thoại;
báo cáo, nhật ký hiển thị bảng thay cho JSON thô.

Các khác biệt có chủ đích so với bản trình diễn: bỏ nhãn dữ liệu giả lập và
menu trải nghiệm demo, giữ đăng xuất và phạm vi Admin tổng, không tạo số liệu giả.
Bộ lọc loại đơn vị/mặt trận lấy từ dữ liệu nhận diện và danh mục đã nhập;
AI chưa cấu hình hiển thị trạng thái thực. Không dùng số liệu minh họa làm kết luận.

Đã kiểm tra trên Chrome: tổng quan so cạnh mockup, danh sách ba hồ sơ CLSP thật,
tìm kiếm không có kết quả, mở Trang 00 và trục bước 07. Console không có lỗi
ứng dụng; còn cảnh báo deprecation lock của Supabase Auth dùng chung.
TypeScript, kiểm tra encoding và build production đều đạt.
Chưa xác nhận pixel-perfect toàn bộ màn hình; viewport override của extension
không áp dụng kích thước điện thoại nên chưa ghi nhận kiểm thử mobile là pass.
Giao diện cần được người dùng push/deploy commit mới; quyền Admin tổng đã có hiệu lực.

## Luồng sau tải tài liệu — 15/09/2026

Màn Nhập & chuyển đổi dữ liệu có sáu bước theo mockup: Tiếp nhận, Ghép sáng kiến,
Trích xuất gốc, Đối chiếu & sửa, Ánh xạ 8 bước, Xác nhận. Mỗi lô có nút tiếp tục;
chọn từng hồ sơ trong lô để kiểm tra, kể cả một tệp tạo nhiều sáng kiến.
Bước 4 sửa thông tin nhận diện qua API edit có phiên bản/lý do; bước 5 lưu ánh xạ
vào 10 ô của trục 8 bước; bước 6 gọi confirm và hiển thị trạng thái Chờ chuyên gia.
Không tự xác nhận khi đọc file xong. API giữ nguyên kiểm tra quyền và ngoại lệ.
Khi sửa nhận diện hoặc ánh xạ chưa lưu, khóa chuyển bước/đổi hồ sơ; cho bỏ bản sửa.
Tệp nguồn có nút mở từng hồ sơ liên quan. Màn Chưa mapping hiển thị đoạn nguồn,
không còn dùng nhầm bảng nhật ký.

Kiểm tra Chrome local với lô CLSP ba hồ sơ: sáu bước, chọn hồ sơ, trích xuất gốc,
đối chiếu, ánh xạ, chặn chuyển bước với bản chưa lưu, bỏ bản sửa, điều kiện xác nhận.
Không có console error. Không chỉnh hoặc xác nhận dữ liệu production trong lần QA này.


## Bổ sung theo đợt rà soát toàn bộ mockup — 15/09/2026

- Trang 00: thông tin nhận diện, owner, phối hợp, liên kết Rising/HEART, thời gian,
  nội dung thay đổi, ba tầng cơ chế–hành vi–kết quả và chất lượng từng bước.
- Trục 01–08: câu hỏi phương pháp, ba bảng bước 07, điều kiện thực thi bước 08,
  đánh dấu nội dung đã sửa, mở nguồn đối chiếu.
- Chuyên gia: phân loại, trạng thái chất lượng, thư viện nhận định, giả thuyết nội bộ,
  sửa bản nháp, lưu và chuyển sáng kiến tiếp theo tại cùng bước.
- Công bố và khóa theo từng ô WS1b; đơn vị chỉ thấy góp ý đã duyệt và đã mở.
  Đơn vị phản hồi theo từng bước, nộp một bước không khóa bước khác còn mở.
  Góp ý đã công bố được giữ để đối chiếu sau hiệu chỉnh; giả thuyết nội bộ vẫn ẩn.
- So sánh: ma trận 8 bước, kết quả đánh giá kèm lý do và phiên bản; sửa văn bản
  không tự được coi là cải thiện chất lượng.
- Quản lý: thư viện có lọc/sửa/ưu tiên/ngừng dùng; cấu hình 6 công đoạn; danh mục,
  lịch phiên, báo cáo có bộ lọc, xem trước và xuất HTML; nhật ký theo quyền.
- Nhập liệu: sửa từng đoạn trích xuất có lý do và giữ nguyên bản, bảng tổng hợp
  mapping, loại đơn vị và mặt trận. Word xuất kèm nguyên văn trước hiệu chỉnh.

Kiểm tra: TypeScript, encoding và build production; 11 kiểm thử Python với cơ sở
dữ liệu tạm và tài liệu thật; kiểm tra render 10 màn hình với dữ liệu cô lập và
escaping HTML nguồn. Chrome local đã kiểm tra Trang 00/bước 07 với hồ sơ CLSP thật.
Không sửa dữ liệu production trong đợt kiểm tra này. Người dùng tự push/deploy.

Phạm vi chưa nghiệm thu: chưa so ảnh từng pixel ở mọi vai trò/kích thước; các bảng
ba tầng hiển thị nội dung nguồn tổng hợp, chưa tự suy diễn nguồn thành các hàng
chuẩn hóa chi tiết. AI ngữ nghĩa/OCR và bố cục in Word vẫn có giới hạn nêu trên.
Không gọi đây là chứng nhận khớp 100% toàn bộ mockup trên production.


### Nhận nhiều tệp cho cùng ban

Kiểm thử bằng 5 DOCX trong thư mục Ban Nhân lực: chương trình tổng hợp có 3 sáng
kiến, 3 biểu chi tiết tương ứng và AI-Ready Workforce đề xuất thêm. Mã trong nguồn
chưa nhất quán, nên UI gợi ý theo tên chủ đề và yêu cầu đối chiếu trước khi ghép.
Không tự lấy mã tên file thay cho mã nội dung. Khi ghép một Mẫu 01 với một bản chi
tiết, UI chọn hồ sơ Mẫu 01 làm hồ sơ đích và hiển thị mã/tên sẽ giữ trước xác nhận.
Người dùng có thể sửa mã/tên ở bước Đối chiếu sau đó.

Kiểm thử cô lập xác nhận kết quả sau ba lần ghép: 3 hồ sơ chính, mỗi hồ sơ có đủ
2 nguồn và không mất đoạn nguồn; 1 đề xuất thêm giữ riêng. 9/10 ô có nội dung nguồn
sau ghép; ô còn lại cần chuyên viên đối chiếu, không tự sinh dữ kiện để điền đủ.
Ghép giữ lịch sử nhận diện nguồn; hồ sơ đã ghép không bị chọn lại khi nhập bổ sung.
Các tệp có thể thuộc nhiều lô, nhưng phải chọn cùng ban/dự án khi nhập.
