# Tích hợp EquiTrack_G1 (4) — 10/11/2026

Nguồn: `C:\Users\R9000P 2022\Downloads\EquiTrack_G1 (4).zip`.
SHA-256: `937fa063b8dbb43351c0bc28615ef57a2bee81b45c61f651542c730d5a0f7649`.
Đích: `C:\Equine_Project`. Tài liệu trong ZIP được xem là tham khảo; không thực thi các lệnh tạo lại database/seed trên dữ liệu đang dùng.

## Đã gộp

- Nhật ký `/audit-logs`: lọc người thực hiện/nhóm thao tác/thời gian, phân trang và VI/EN. API nhận UserName và nhiều ActionType; giữ quyền AUDIT_VIEW và phạm vi CLB.
- Danh sách `/training/trainers`, lọc chuyên môn/cấp độ; hồ sơ chuyên môn xuất hiện trong chi tiết tài khoản của Manager.
- Hồ sơ ngựa riêng `/manager/horses/:id/profile`, gồm giấy tờ, thông tin lưu trữ và tiến trình tiếp nhận.
- Lỗi theo từng ô ở biểu mẫu đăng nhập/đăng ký/đổi mật khẩu; form ngựa dựng lại khi đổi hồ sơ, giữ upload retry và chọn CLB.
- Bản đồ có nút đóng thẻ/Escape, bấm ghim để đóng/mở và hiển thị khoảng giờ tập; giữ trạng thái kéo/xoay và phạm vi Groom.
- Chuông xếp mới nhất trước, cùng thời điểm ưu tiên khẩn; bổ sung tên ngựa, số lượng vật tư/lý do từ chối. Giữ thông báo workflow và chống trùng.
- Tên miền đã cấu hình NO_MAILBOX_DOMAINS: tạo một yêu cầu hỗ trợ quên mật khẩu cho Manager; phản hồi đồng nhất với tài khoản không tồn tại.
- Seed và công cụ dữ liệu đi kèm ZIP; bổ sung cấu hình SQLite riêng và bootstrap còn thiếu. Seed chưa được nạp vào SQL Server.

## Xử lý xung đột

Giữ API JWT/refresh/phân trang/upload, các trang Vet/Owner, marker và đính kèm, chỉ định chăm sóc, hạn chế dinh dưỡng, worker, kết quả bữa ăn, transaction/khóa dòng và các test TARGET mà ZIP lược bỏ.
Giữ quyền sửa hồ sơ trainer của Head Trainer/Manager, gồm điểm xếp hạng; giữ ràng buộc y tế/Owner hiện tại.
Không nhận luồng trả token đặt lại mật khẩu chỉ bằng email và số điện thoại từ ZIP; tiếp tục qua email hoặc Manager.
Khóa tập Active có hiệu lực cho tới khi được mở bằng tái khám đúng đợt.
Không thay nguyên App.jsx/CSS/schema/test bằng bản rút gọn của ZIP; không copy .env, virtualenv, node_modules, media, build hoặc Git metadata.

## Cấu hình

- `.vscode/`: tác vụ chạy cả ứng dụng, worker riêng, debug Django, interpreter và cwd phù hợp, UTF-8.
- `frontend/vite.config.js`: root/env theo vị trí config, port 5173 và strictPort để khớp URL/CORS.
- `.gitignore`: bỏ qua backup tích hợp, lưu cấu hình VS Code chung.
- `config.settings_demo_local`: SQLite/media riêng, bắt buộc khai báo đường dẫn; công cụ dữ liệu không dùng SQL Server mặc định.

Giữ nguyên .env và dependency/lockfile hiện tại. SQL Server `localhost\SQLEXPRESS`, database `RacehorseTrainingManagement` kết nối được; đối chiếu chỉ đọc đủ 53 bảng model, không thiếu cột. Lỗi ODBC khi thử trong sandbox đến từ giới hạn môi trường kiểm tra; không cần đổi driver/thông tin đăng nhập.

## Kiểm tra thực tế

| Kiểm tra | Kết quả |
|---|---|
| Backend | Trước gộp 245; sau gộp 249 test đạt, không skip |
| Frontend | typecheck/build đạt; API 34, training status 12, injury 19 test đạt |
| Lint | 0 lỗi, 122 cảnh báo mã nguồn |
| SQL Server | 53 bảng model đủ cột, chỉ đọc metadata |
| SQLite bootstrap | Tạo schema riêng thành công |
| Chromium | Toàn luồng nghiệp vụ đạt trên API/SQLite tạm |
| Chromium phần mới | Nhật ký/lọc tên, trainer, hồ sơ ngựa, đóng thẻ/Escape và validation đều đạt |
| Ứng dụng thực tế | Backend 8000 và frontend 5173 đã chạy; `/api/health` gọi trực tiếp và qua Vite đều trả 200, backend/database UP |

Ảnh: `frontend/artifacts/workflows-1794291750959/`, `frontend/artifacts/g1-update-1794291908970/` (gitignored).
Build còn cảnh báo kích thước bundle/import động đã có của dự án. Chưa kiểm chứng toàn bộ kịch bản sinh dữ liệu lịch sử, SMTP thật hoặc tranh chấp ghi đồng thời trên SQL Server.

Backup: `.integration-backups/20261110-g1/before/`; nguồn đã lọc ở `incoming/`; đối chiếu ở `comparison.json`, `status-before.txt`.
Giữ các chỉnh sửa chưa commit trước đó. Không reset/stash/commit/push. Xem [hướng dẫn chạy](../HUONG-DAN-CHAY.md).
