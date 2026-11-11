# Công cụ dữ liệu EquiTrack từ bản G1

`sql/seed/equi_real_data.sql` là bộ dữ liệu đi kèm ZIP, dành cho database mới chưa có câu lạc bộ.
Lần tích hợp này không chạy seed hoặc công cụ sinh dữ liệu trên SQL Server đang dùng.

Các công cụ Python dùng `config.settings_demo_local`: SQLite và media riêng, email trong bộ nhớ, không gọi dịch nội dung.
Bắt buộc đặt `EQUI_DEMO_DB` và `EQUI_DEMO_MEDIA`; thiếu biến sẽ dừng thay vì dùng database mặc định.
Bootstrap từ chối file database đã tồn tại; cấu hình từ chối media trong `backend/media`.

Tạo database thử từ PowerShell ở thư mục gốc dự án:

```powershell
$env:EQUI_DEMO_DB = "$PWD\.integration-backups\real-data\source.sqlite3"
$env:EQUI_DEMO_MEDIA = "$PWD\.integration-backups\real-data\media"
.\backend\.venv\Scripts\python.exe tools/real_data/bootstrap.py
```

`build.py` cần thêm dependency tùy chọn `freezegun` trong `tools/real_data/requirements.txt`.
Công cụ giữ kịch bản lịch sử của ZIP; các lệnh chốt khẩu phần, kết quả ăn và tái khám đã được chỉnh theo API hiện tại.

- `build.py <backend>`: sinh kịch bản trên SQLite đã khởi tạo; mật khẩu dùng `EQUI_REAL_PASSWORD`.
- `export.py <backend> <schema.sql> <output.sql>`: xuất dữ liệu sang T-SQL; chọn output riêng để giữ seed gốc.
- `verify.py <backend> <seed.sql>`: thử nạp và kiểm tra API; dùng SQLite trống khác với database tạo dữ liệu.

Đã kiểm tra bootstrap tạo schema riêng, từ chối file có sẵn và thiếu cấu hình.
Chưa kiểm chứng toàn bộ kịch bản lịch sử, xuất SQL hoặc đăng nhập từ seed trong lần gộp này.
Các công cụ này không nằm trong luồng khởi động ứng dụng.
