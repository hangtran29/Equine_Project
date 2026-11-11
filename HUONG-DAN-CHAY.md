# Chạy EquiTrack trong VS Code

Mở thư mục `C:\Equine_Project`, bấm **Ctrl+Shift+P → Tasks: Run Task → EquiTrack: Start app**.
Hai terminal sẽ chạy backend và frontend. Truy cập **http://127.0.0.1:5173**; Swagger ở **http://127.0.0.1:8000/api/docs**.

Sau lần tích hợp 10/11/2026, ứng dụng đã được khởi động nền tại các địa chỉ trên. Khi đang truy cập được, dùng ngay bản đang chạy; tác vụ VS Code dành cho lần khởi động tiếp theo.

Tác vụ **EquiTrack: Operations worker** chạy riêng bộ sinh việc/nhắc lịch. Để debug Django, dừng backend đang chiếm cổng 8000 rồi chọn **EquiTrack: Debug Django** trong Run and Debug.

## Chạy bằng PowerShell

Terminal backend:

```powershell
Set-Location C:\Equine_Project\backend
.\.venv\Scripts\python.exe -X utf8 manage.py runserver 127.0.0.1:8000
```

Terminal frontend:

```powershell
Set-Location C:\Equine_Project\frontend
npm.cmd run dev -- --host 127.0.0.1
```

Worker riêng:

```powershell
Set-Location C:\Equine_Project\backend
.\.venv\Scripts\python.exe -X utf8 manage.py run_operations --interval 60
```

## Cấu hình

Máy hiện tại đã có Python 3.13, Node.js 24 và dependencies hoạt động. Máy mới cần Python 3.12/3.13 và Node.js 20.19+ hoặc 22.12+ theo Vite hiện tại; tạo virtualenv rồi cài `backend/requirements.txt`, chạy `npm.cmd ci` trong `frontend`.

- Backend đọc `backend/.env`; giữ thông tin SQL Server riêng của máy. Mẫu: `backend/.env.example`.
- Frontend dùng `/api`, proxy về `127.0.0.1:8000`. Mẫu: `frontend/.env.example`.
- Vite cố định cổng 5173, báo lỗi nếu cổng bận; đọc root/env theo vị trí tệp config.
- Cấu hình VS Code chọn interpreter `backend/.venv/Scripts/python.exe`, đúng cwd và UTF-8.

Kiểm tra ngày 10/11/2026: database SQL Server hiện tại có đủ bảng/cột cho 53 model nghiệp vụ. Không cần nhập lại schema/seed cho bản gộp này.
Database đang có dữ liệu sử dụng migration nâng cấp phù hợp và script chỉ đọc `sql/migrations/20261108_equitrack_preflight.sql`.
`sql/horse_v2.sql` dành cho khởi tạo database mới.

`sql/seed/equi_real_data.sql` và `tools/real_data/` được giữ riêng, chưa nạp vào SQL Server. Xem [công cụ dữ liệu](tools/real_data/README.md).
Bản sao trước gộp: `.integration-backups/20261110-g1/before/`. Chi tiết: [báo cáo tích hợp](docs/INTEGRATION_EQUITRACK_G1_20261110.md).
