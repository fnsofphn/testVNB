# Tài khoản Auth V-Coaching kiểm thử

## Môi trường đã xác nhận

Ngày 15/09/2026, người dùng xác nhận project Supabase `npazlysytrqhnwezugcs`
(`vcontent-p0-cleanroom-20260725`) là đích kiểm thử được phép tạo tài khoản.
Ứng dụng `https://test-vinabrain.vercel.app` hiện sử dụng project này.
Không áp dụng seed cho project khác hoặc môi trường production.

## Tài khoản

| Email | Vai trò V-Coaching | Kết quả khởi tạo |
| --- | --- | --- |
| giangvien@vinabrain.com | Giảng viên/chuyên gia | Tạo Auth, liên kết hồ sơ, đăng nhập API thành công |
| chuyenvien@vinabrain.com | Quản lý dữ liệu | Tạo Auth, liên kết hồ sơ, đăng nhập API thành công |
| quantriduan@vinabrain.com | Quản trị dự án | Tạo Auth, liên kết hồ sơ, đăng nhập API thành công |
| admin@vinabrain.com | Quản trị hệ thống và Admin tổng V-Coaching | Auth/hồ sơ đã tồn tại; giữ mật khẩu và quyền các module khác |
| donvi@vinabrain.com | Đơn vị VNPT | Tạo Auth, liên kết hồ sơ, đăng nhập API thành công |

Mật khẩu bốn tài khoản mới được sinh ngẫu nhiên và lưu tại
`.cache/vcoaching/login.txt`. Mật khẩu cũng được cấu hình qua
`VCOACHING_TEST_PASSWORD` trong `.env.local`; cả hai vị trí bị Git bỏ qua.
Không gửi email mời hay đặt lại mật khẩu. Admin dùng mật khẩu hiện có;
chưa kiểm chứng đăng nhập Admin bằng mật khẩu vì không đổi hoặc biết mật khẩu đó.

## Seed

Chạy từ thư mục `testVNB`, với Node và các dependencies đã cài:

```powershell
node --env-file=.env.local scripts/vcoaching-seed.mjs
node --env-file=.env.local scripts/vcoaching-seed.mjs --apply
node scripts/test-vcoaching-seed.mjs
```

Lệnh mặc định chỉ đọc, trả về kế hoạch. `--apply` mới ghi.
Các biến bắt buộc: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ANON_KEY` (hoặc `VITE_SUPABASE_ANON_KEY`),
`VCOACHING_ENVIRONMENT=test`, `VCOACHING_TEST_PROJECT_REF`,
`VCOACHING_TEST_PASSWORD` (ít nhất 14 ký tự khi cần tạo mới).
Không đưa service role vào biến có tiền tố `VITE_`.

Seed giữ nguyên mọi tài khoản đã tồn tại, kể cả tài khoản bị khóa hoặc bị thu hồi
quyền. Nếu một email có hồ sơ nhưng chưa xác minh Auth, seed dừng trước khi ghi.
Tài khoản mới chỉ được bật quyền V-Coaching sau khi hồ sơ đã được đọc lại thành công.
Nếu liên kết hồ sơ thất bại, seed thu hồi tài khoản vừa tạo; lỗi phục hồi được báo rõ.

`--initialize-existing-admin` chỉ dùng cho lần khởi tạo quyền V-Coaching ban đầu
trên Admin được chỉ định. Chỉ thêm `app_metadata.vcoaching` khi khóa này chưa từng
tồn tại, hồ sơ hoạt động và khớp Auth. Không thay quyền đã chỉnh sửa/thu hồi,
không sửa mật khẩu hoặc quyền module khác. Cờ này đã được chạy trong lần khởi tạo.

## Ứng dụng đã nối với Auth

Route `/vcoaching` sử dụng các tài khoản trên. API xác thực session và đọc lại
`app_metadata.vcoaching` từ Auth Admin trên từng yêu cầu; không cấp quyền dựa vào
metadata người dùng tự sửa hoặc role lưu trong trình duyệt. Profile mới vẫn là
`client/self`, không nâng quyền nền của V-Work.

Admin đã kiểm thử bằng một phiên Auth magic link sinh phía server rồi xác minh
ngay, không gửi email và không đổi mật khẩu. Đã kiểm thử 5 role switch có scope,
tạo/sửa/khóa/mở khóa/xóa tài khoản tạm, thu hồi quyền với phiên cũ. Tài khoản tạm
được xóa sau kiểm thử; năm tài khoản chính được giữ.

Xem `docs/VCOACHING_IMPLEMENTATION.md` để chạy ứng dụng và đọc giới hạn nghiệm thu.
