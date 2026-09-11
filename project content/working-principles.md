# Working Principles — Test-Vinabrain

## 1. Danh tính và phạm vi project

- Project này là **Test-Vinabrain**, độc lập hoàn toàn với Vinabrain/VContent và mọi project khác trên máy.
- Canonical workspace hiện tại: `D:\02. Github\02. Test-Vinabrain\testVNB`.
- Git remote chuẩn: `https://github.com/fnsofphn/testVNB.git`.
- Vercel project: `test-vinabrian`; production domain: `https://test-vinabrain.vercel.app`.
- Supabase của Test-Vinabrain là project riêng. Chỉ dùng project được liên kết hoặc cấu hình trong chính repo/Vercel này.
- Tên package, module hoặc code kế thừa có thể chứa `VContent`; điều đó không cho phép dùng hạ tầng hay tài liệu của repo Vinabrain khác.
- Không truy cập, sửa, deploy hoặc chạy lệnh tại `D:\02. Github\01. Vinabrain\vcontent-3.0` trong khi thực hiện task của Test-Vinabrain.

## 2. Checklist bắt buộc đầu mỗi phiên

Trước khi sửa code hoặc thực hiện thao tác ghi:

1. Đọc `AGENTS.md`, file này và `README.md`.
2. Chạy `git rev-parse --show-toplevel`, `git status --short --branch`, `git worktree list` và `git remote -v`.
3. Xác nhận repo root và remote đúng danh tính ở mục 1.
4. Xác định nhánh đang làm việc, commit nguồn và phạm vi file được phép sửa.
5. Khi task liên quan deploy hoặc database, xác nhận lại Vercel project/production branch và Supabase project ref trước mọi thao tác ghi. Không suy đoán từ ảnh cũ hoặc cấu hình của project khác.

Nếu một trong các danh tính không khớp, chỉ được kiểm tra ở chế độ đọc; dừng commit, push, deploy, migration và production write cho tới khi xác minh đúng project.

## 3. Boundary khi sửa code

- Trace đúng luồng `route -> page/component -> lib/service -> API/RPC -> table/migration` trước khi sửa. Không sửa theo phỏng đoán.
- Chốt allowlist file cho từng task. Sau mỗi nhóm thay đổi, kiểm tra `git diff --name-status`; nếu xuất hiện file ngoài phạm vi thì dừng và xác minh nguồn thay đổi.
- Giữ nguyên thay đổi có sẵn của người dùng. Không tự hoàn tác, ghi đè hoặc dọn file không thuộc task.
- Không mang nguyên file, migration, env hoặc config từ Vinabrain/VContent sang repo này. Chỉ tham khảo logic sau khi đã đối chiếu contract và boundary của Test-Vinabrain.
- Không tự thay đổi nội dung nghiệp vụ khi task chỉ yêu cầu UI. Không tự tạo mock copy, badge, logo, dữ liệu hoặc trạng thái ngoài nguồn đã được duyệt.
- Artifact QA, ảnh chụp và file tạm mặc định để ngoài repo, trừ khi người dùng yêu cầu lưu hoặc repo đã có convention rõ ràng.

## 4. Git và nhánh

- Không dùng `git add .`. Chỉ stage đúng danh sách file thuộc scope.
- Trước commit, kiểm tra `git diff`, `git diff --cached --name-status` và `git diff --cached --check`.
- Không dùng `git reset --hard`, force checkout, force push hoặc xóa worktree khi chưa có yêu cầu rõ ràng và điểm khôi phục.
- `main` là nhánh hiện đang checkout tại thời điểm tạo tài liệu này. Nhánh Production của Vercel từng được cấu hình là `codex/vwork-isolated`; phải kiểm tra trạng thái Vercel hiện tại trước mỗi lần deploy vì cấu hình này có thể thay đổi.
- Push lên GitHub và deploy Vercel là hai kết quả khác nhau. Không kết luận production đã cập nhật chỉ vì push thành công.

## 5. Vercel và triển khai

- Chỉ thao tác với Vercel project `test-vinabrian` và domain `test-vinabrain.vercel.app`.
- Trước deploy, xác nhận Git branch mà Production đang theo dõi, commit sẽ deploy, build settings và environment của đúng project.
- Chạy tối thiểu `npm run typecheck`, `npm run build` và `git diff --check` cho thay đổi code. Chạy thêm test chuyên biệt của module bị ảnh hưởng.
- Sau deploy, kiểm tra deployment ở trạng thái Ready, production URL phản hồi đúng, log không có lỗi mới và flow chính liên quan vẫn hoạt động.
- HTTP 200 của SPA không đủ chứng minh ứng dụng hoạt động; nếu UI lỗi, kiểm tra browser console/runtime logs và flow sau đăng nhập.

## 6. Supabase và an toàn dữ liệu

- Không dùng URL, key, project ref, SQL editor hoặc dashboard Supabase của project Vinabrain khác.
- Không đưa secret hoặc service-role key vào source, log, tài liệu, ảnh chụp hay commit.
- Trước migration, script sync/import/normalize hoặc production write, xác nhận đúng Supabase project ref và dữ liệu đích; có dry-run, thống kê trước/sau và rollback/backup phù hợp.
- Không chạy migration hoặc SQL chỉ vì file tồn tại trong `supabase/`; phải trace schema hiện tại và xác nhận migration chưa được áp dụng.
- Không tạo hoặc chèn mock, sample, demo hay công việc giả vào trạng thái V-Work dùng chung.
- Trạng thái rỗng phải hiển thị dữ liệu thật với số lượng `0`; không tạo dữ liệu giả để lấp giao diện.
- Dữ liệu E2E phải được cô lập khỏi dữ liệu vận hành, có định danh rõ ràng và được dọn sạch sau kiểm thử.
- Mọi thao tác xóa hoặc cập nhật hàng loạt phải có target cụ thể, guard chống mất dữ liệu và phương án phục hồi.

## 7. Xác minh theo mức rủi ro

- UI: kiểm tra route thật, desktop/mobile liên quan và trạng thái loading/empty/error.
- Auth/role: kiểm tra đúng role, sai role và phiên đăng nhập sau refresh; bảo mật phải được chặn ở API/RLS/router guard, không chỉ bằng ẩn UI.
- Upload: kiểm tra giới hạn file, storage path/signed URL, policy, quyền đọc lại và lỗi hiển thị cho người dùng.
- Data/RLS: kiểm tra bằng đúng vai trò và tenant/scope; khi dữ liệu rỗng bất thường, kiểm tra query/filter/RLS trước khi sửa UI.
- Notification, assignment và retry: phải có guard chống gửi hoặc tạo trùng.
- Kết thúc task phải báo rõ phần đã kiểm tra, phần chưa thể kiểm tra và rủi ro còn lại; không tuyên bố hoàn tất khi bằng chứng chưa đủ.

## 8. Cập nhật tài liệu này

- Chỉ bổ sung nguyên tắc đã được xác nhận cho Test-Vinabrain.
- Không sao chép toàn bộ working principles từ project khác.
- Khi Git remote, Vercel project/domain, production branch hoặc Supabase project thay đổi, cập nhật tài liệu trong cùng task và ghi rõ lý do.
- `AGENTS.md` và file này phải được Git theo dõi để phiên làm việc mới tự nhận đúng không gian và phạm vi.
