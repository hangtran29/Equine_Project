# Tích hợp EquiTrack_G1 vào Equine_Project — 08/11/2026

## Phạm vi và hiện trạng

- SOURCE chỉ đọc: `C:\Users\R9000P 2022\Downloads\EquiTrack_G1.zip`, project nằm trong `EquiTrack_G1/EquiTrack/`.
- SHA-256 archive: `8021e65a9cfc9a39d88b962da44e599aaea6502c58c15f4cbcf9c717848f1888`.
- TARGET: `C:\Equine_Project`, giữ nhánh đã tồn tại `integration/equitrack-into-equine-project`.
- TARGET đã có lượt tích hợp archive EquiTrack trước đó và nhiều thay đổi chưa commit. Đã chụp bản đối chiếu trước khi sửa và gộp phần G1 còn thiếu theo từng chức năng. Không reset, clean, stash, commit, push hoặc triển khai.
- Không tìm thấy `AGENTS.md` trong workspace. Đã đọc lại `backend/docs/FLOW34_IMPLEMENTATION_20261102.md` và đối chiếu code/test; kết quả dưới đây là các lệnh vừa chạy.
- Giữ nguyên báo cáo `docs/INTEGRATION_EQUITRACK.md`. Vì tên đó đã tồn tại, báo cáo G1 được tạo ở tệp mới này để đáp ứng yêu cầu không ghi đè báo cáo trước.
- Không copy `.env`, dependencies, output build, media hoặc dữ liệu mẫu của SOURCE. `.env` thực tế và database nghiệp vụ không được sửa trong lượt G1 này.

## Đối chiếu chức năng

Sau khi loại dependencies, bí mật và output môi trường: archive EquiTrack trước có 335 tệp, G1 có 260 tệp. G1 thay đổi 47 tệp, thêm `mobile.css`, bỏ 76 tệp. Đã kiểm tra cả danh sách khác biệt; nhiều phần bị bỏ vẫn cần cho TARGET, nên không đồng bộ các thao tác xóa đó.

| Nhóm | G1 bổ sung hoặc thay đổi | TARGET giữ lại | Kết quả cuối |
|---|---|---|---|
| Manager/Owner, tài khoản | Giao diện tiếp nhận, nhân sự, phân quyền, hỗ trợ và VI/EN đã có từ lượt trước | Đề xuất sửa hồ sơ có chứng cứ, upload JWT, quyền route | Dùng giao diện tích hợp hiện tại và một cơ chế token/refresh. Giữ API helper TARGET vẫn dùng. |
| Chuồng trại | Kéo, zoom, la bàn xoay; chế độ Groom chỉ xem; thẻ thông tin thích ứng điện thoại | Chuyển chuồng, bảo trì, phạm vi CLB/ngựa | Manager quản lý tại `/manager/stalls`; Groom xem tại `/groom/stalls`, BE giới hạn ngựa được giao. |
| Huấn luyện | Thẻ ngựa có cảnh báo Full/Restricted; dialog khóa toàn phần; kiểm tra tải tối đa ngay trên form | Chặn ở BE khi xếp/sửa/bắt đầu, transaction và báo khẩn, EarlyEndReason/EarlyEndNote | Nhận UI G1, sửa cách xác định khóa để không tự hết hiệu lực theo ngày dự kiến. |
| Owner theo dõi tập | G1 bỏ component tổng hợp hoạt động | Kế hoạch, giai đoạn, buổi tập, hoạt động tổng hợp | Giữ các trang và menu Owner đang dùng của TARGET. |
| Vet | G1 thêm RestrictionNote và validation vào form; hiển thị lỗi ngoài form khi cần | Khám/ký/đính chính, sinh hiệu, marker BE, ảnh JWT, theo dõi phục hồi, mở khóa đúng đợt | Giữ trang khám canonical TARGET; gộp phần bổ sung vào module G1 còn được lưu. |
| Groom/chăm sóc | Giao diện bảng chăm sóc/kho đã có từ lượt trước; bố cục điện thoại mới | FeedingOutcome, lý do bỏ qua, đổi Groom/Pending, chỉ định, dinh dưỡng, worker, chống lặp | Các luồng TARGET và test giữ nguyên; thêm map chỉ xem có kiểm tra phạm vi. |
| CSS/API dùng chung | G1 xóa nhiều CSS và helper mà bản G1 không dùng | TARGET vẫn dùng những CSS/helper đó cho Vet/Groom, HorseProfile và các trang dinh dưỡng | Giữ CSS/API hiện hành; bổ sung `mobile.css` và sửa popup khẩn có phạm vi rõ. |
| Schema | Không khác archive SOURCE trước | Các bổ sung TARGET Flow 3/4 | Giữ migration tích hợp và schema mới đã hợp nhất; kiểm thử áp dụng/rerun trên SQL Server riêng. |

## Thay đổi và quyết định chính

### Giao diện

- `frontend/src/flow1/StallPage.jsx`: nhận phần bản đồ tương tác và `readOnly` của G1, giữ ghi chú bản đồ minh họa của TARGET. Hỗ trợ kéo bằng pointer, zoom bằng nút/bàn phím, la bàn, tự canh khi đổi kích thước và thẻ nằm dưới bản đồ trên điện thoại. State dùng để render trạng thái kéo; refs chỉ dùng cho thao tác/observer.
- `frontend/src/mobile.css`, `main.jsx`: nhận bộ điều chỉnh điện thoại của G1, nạp sau CSS hiện hành. Giữ App.css và CSS chuyên dụng của sơ đồ 2D, Vet/Groom, dinh dưỡng, modal và bảng.
- `frontend/src/flow1/f1.css`: popup khẩn có giới hạn chiều cao/rộng, cuộn khi dài; wrapper không chiếm thêm cột trong app shell.
- `frontend/src/flow1/datePicker.js`: nhận kiểm tra min/max luôn trả boolean; giữ export phục vụ TARGET. Date picker đã được kiểm tra cùng React bằng chuỗi đăng ký ngựa.
- `frontend/src/flow2/TrainerPages.jsx`, `SessionPages.jsx`, `trainingLocks.js`: nhận UI khóa tập G1. Đọc khóa qua client dùng chung và bộ xử lý phân trang. Lỗi tải khóa được hiển thị, không biến thành “không có khóa”. `LockEndDate` chỉ là ngày tái đánh giá dự kiến; chỉ trạng thái Released kết thúc khóa. Xác định giới hạn theo đúng ngựa và ngày bắt đầu; ưu tiên Full hoặc tải tối đa thấp nhất. Thẻ không đổi mức tải thành phần trăm.
- `frontend/src/flow3/VetPages.jsx`: nhận RestrictionNote, kiểm tra tải tối đa và giữ lỗi server không thuộc ô đang có trên form.
- `frontend/src/App.jsx`, `routing/access.js`: chỉ thêm menu/route Groom cho bản đồ; không thay App.jsx nguyên file. Route cần đúng role Groom và `HORSE_VIEW`.
- `frontend/src/i18n/en.json`, `runtime.js`: thêm nhãn điều khiển bản đồ, thông báo khóa và các mẫu có tải/ngày động. Dịch nhãn hoạt động bằng từ điển; không cần bật dịch vụ dịch nội dung tự do.

### Backend và phạm vi dữ liệu

- `backend/apps/horses/views.py`: danh sách chuồng cho Groom/Trainer/Work Rider dùng `operational_horses` và phân công chuồng Active; Manager, Head Trainer và Vet giữ quyền xem theo CLB. Groom mất quyền xem chuồng/ngựa ngay khi phân công bị thu hồi. POST/PATCH/chuyển chuồng tiếp tục bị BE từ chối với Groom.
- `backend/apps/core/exceptions.py`, `i18n.py`, `backend/apps/training/services.py`: nhận thông báo khóa tập dễ hiểu hơn và định dạng Decimal gọn cho tải tối đa; giữ mã lỗi `TRAINING_LOCK_FULL`/`TRAINING_LOCK_RESTRICTED` và kiểm tra khóa phía BE.
- Không nhận việc xóa cơ chế chặn email trong seed, helper validation, API tải ảnh, ký/đính chính bệnh án hoặc helper dinh dưỡng mà TARGET vẫn cần. Không thay `flow1/api.js` thành hệ xác thực riêng.

Các trường SOURCE đã có trong kết quả cuối: Horse `LeftDate`, `DeclaredHealth`, `MedicalHistory`, `OwnerNote`; Stall `MaintenanceUntil`; TrainingResult `EarlyEndReason`, `EarlyEndNote`; các chỉ số sinh hiệu; SupportRequest và các ràng buộc hộ chiếu/điện thoại. Các module `activity`, `codes`, `content_i18n`, `drf_messages`, `support`, `validators`, từ điển nội dung và test SOURCE từ lượt tích hợp trước tiếp tục được giữ.

### Năng lực TARGET được bảo toàn

Các tệp sau được so sánh byte với snapshot trước lượt G1 và giữ nguyên:

- `backend/apps/core/access.py`, `clubtime.py`, `locking.py`, `workflow.py`.
- `backend/apps/medical/attachments.py`, `injuries.py`.
- `backend/apps/care/orders.py`, `management/commands/run_operations.py`.
- `backend/apps/medical/tests/test_workflow_contracts.py`.
- `sql/migrations/20261102_health_care_workflows.sql`, `20261021_training_plan_templates.sql`.
- Báo cáo `docs/INTEGRATION_EQUITRACK.md`.

Không xóa test method TARGET nào. Marker/vị trí/lịch sử phục hồi tiếp tục lưu qua BE; ảnh theo AttachmentID tải bằng JWT. Phiếu đã ký không sửa trực tiếp. Mở khóa cần phiếu Follow-up đã ký, đúng ngựa/đợt; báo khẩn và dừng buổi giữ transaction/chống trùng. Head Trainer lập/chốt khẩu phần; Vet góp ý và đặt hạn chế. Groom ghi kết quả ăn hoặc lý do bỏ qua; đổi Groom giữ chuyển việc Pending. Kho duyệt trừ tồn một lần, có khóa giao dịch. Worker sinh việc/nhắc lịch độc lập với trình duyệt.

## Mapping route và API

| Đường truy cập | Vai trò và hành vi cuối |
|---|---|
| `/manager/staff`, `/manager/roles`, `/manager/owners/new` | Manager, dùng giao diện tài khoản/role hiện hành; tạo Owner qua trang tài khoản canonical. |
| `/manager/horses/:id/intake`, `/manager/stalls`, `/manager/vet-duty`, `/care/inventory` | Manager vẫn có tiếp nhận, chuồng, lịch trực và kho. |
| `/groom/stalls` | Mới: Groom + HORSE_VIEW; bản đồ/lưới chỉ xem; dữ liệu chỉ thuộc ngựa được giao. |
| `/training/my-plans`, `/training/sessions/new`, `/training/sessions/:id/edit` | Trainer/Head Trainer theo quyền route; bổ sung UI khóa tập, BE tiếp tục kiểm tra. |
| `/owner/training/activity` | Giữ trang hoạt động tổng hợp, dù G1 bỏ component này. |
| Các route dưới `/owner/horses/:id/training`: trang gốc, `/plans`, `/plans/:planId`, `/stages`, `/plans/:planId/stages/:stageId`, `/sessions/:sessionId` | Giữ các đường theo dõi kế hoạch, giai đoạn và buổi tập cho chủ ngựa. |
| `/vet/horses/:id/examination` | Giữ adapter TARGET: khám đầu vào chuyển sang `/vet/horses/:id/clinical`; khám ngựa đã tiếp nhận vào màn hình clinical TARGET hiện hành. |
| `/vet/records/:recordId/edit` | Giữ redirect theo bệnh án/ngựa, không tạo màn hình sửa riêng bỏ qua signed state. |
| `/care/today`, `/care/diets`, `/care/tasks`, `/care/diet-plans`, `/care/diet-approvals`, `/care/supplies` | Giữ ma trận quyền và các thao tác TARGET tương ứng. |

Contract BE giữ nguyên: `/api/horses/{id}/injury-markers`, `/api/injury-markers/{id}`, `/api/injury-markers/{id}/assessments`, `/api/horses/{id}/health-report-attachments`, `/api/health-report-attachments/{id}/file`, `/api/horses/{id}/care-orders`, `/api/care-orders/{id}/stop`, `/api/horses/{id}/diet-restrictions`, `/api/diet-restrictions/{id}/stop`.

Không tạo kho ảnh `health-report-images` thứ hai. Giữ PascalCase/camelCase theo từng API hiện hành, multipart/blob/JWT/refresh, lỗi API và hết phiên của `apiClient.ts`.

## SQL Server và cấu hình

Schema/migration trong G1 giống SOURCE archive trước. Không thêm migration rỗng hoặc sửa lịch sử. Kết quả TARGET tiếp tục có `sql/horse_v2.sql` cho DB mới và nâng cấp riêng cho DB có dữ liệu:

1. Sao lưu và xác nhận đúng database; dừng API/worker khi nâng cấp thật.
2. Kiểm tra prerequisite TARGET lịch sử 20261016–20261031 theo trạng thái triển khai.
3. Chạy `sql/migrations/20261108_equitrack_preflight.sql` chỉ đọc. Nếu trùng hộ chiếu, số điện thoại hoặc nhiều ca sức khỏe mở cùng ngựa, đối chiếu thủ công; không tự xóa/gộp bản ghi.
4. Áp dụng `20261102_health_care_workflows.sql` nếu còn thiếu.
5. Áp dụng `20261108_equitrack_integration.sql`: transaction, kiểm tra tồn tại/phụ thuộc và duplicate trước DDL; gồm các nâng cấp SOURCE 20261105/20261106 và Unicode Surface. Không cần chạy thêm các script SOURCE tương đương sau đó.
6. Kiểm tra schema/model, API và dữ liệu cũ sau nâng cấp.

`manage.py migrate` không nâng cấp các model nghiệp vụ `managed=False`. Không chạy `horse_v2.sql`, `setup_local_database.py` hoặc seed lên database đang dùng. `horse_v2.sql` có lệnh chọn database/tạo lại bảng, chỉ dùng cho database mới trống đã xác định rõ.

Đã bổ sung công cụ kiểm chứng riêng `backend/apps/core/tests/sql_server_g1.py`. Công cụ sinh tên database test mới, từ chối tái sử dụng DB có sẵn, loại bỏ preamble chọn/tạo DB SOURCE, kiểm tra đúng DB trước từng batch. Chạy từ `backend`:

```powershell
.\.venv\Scripts\python.exe -X utf8 -m apps.core.tests.sql_server_g1 --source-archive 'C:\Users\R9000P 2022\Downloads\EquiTrack_G1.zip'
```

Lượt đạt sử dụng `EquineG1Test_20261108_bfc3c287`: tạo fixture nhỏ trước nâng cấp, chạy cả hai script hai lần, so sánh giá trị cột cũ không đổi, đối chiếu đủ bảng/cột model, tiếp nhận/ký/chuyển chuồng/phân Groom và gọi API hồ sơ/thông báo/chuồng trả 200. Database test được giữ để kiểm tra. Công cụ không tự nâng cấp database cấu hình hiện hành.

Lượt G1 không có biến môi trường mới. Giữ `.env.example` tích hợp sẵn: `NOTIFICATION_EMAILS=True`, `CONTENT_TRANSLATION=False`, cấu hình SMTP/upload, `TIME_ZONE`, `CARE_REFUSAL_THRESHOLD`; `VITE_CLUB_TIME_ZONE` cần khớp giờ CLB. Email test dùng locmem; dịch nội dung ngoài bị tắt. `.env` thật không được sửa.

## Kết quả kiểm thử trong lượt G1

| Kiểm tra | Kết quả |
|---|---|
| `manage.py test --settings=config.settings_test --noinput` | **245 test đạt**, không skip; SQLite riêng cho toàn bộ model unmanaged. |
| `npm.cmd run typecheck` | Đạt. |
| `npm.cmd run lint` | Exit 0; **0 lỗi, 122 cảnh báo**. Module bản đồ mới không còn cảnh báo refs/render. |
| `npm.cmd run build` | Đạt; còn cảnh báo bundle >500 kB và dynamic import dùng chung module đã import tĩnh. |
| `npm.cmd run test:api` | **33 test đạt**, gồm route Groom mới và toàn bộ kiểm tra adapter/JWT/refresh/blob/multipart trước đó. |
| `npm.cmd run test:injury` | **19 test đạt**. |
| `npm.cmd run test:training-status` | **12 test đạt**, gồm khóa Active qua ngày dự kiến và chọn giới hạn đúng. |
| `npm.cmd run test:injury:browser` | Đạt trên Chromium + API fixture riêng. Cả hai bên, chín vùng, responsive 1440/1024/834/390, keyboard/touch, lưu/reload, lỗi mạng và Signed/read-only. |
| `npm.cmd run test:workflows:browser` | Đạt trên Chromium + API fixture mới riêng; giữ assertions nghiệp vụ và bổ sung G1 map/khóa tập/mobile. |
| SQL Server riêng | Hai migration áp dụng/rerun thành công, dữ liệu fixture cũ giữ nguyên, đủ model columns và API smoke 200. |
| Tệp bảo vệ/test methods | Các tệp liệt kê ở trên giữ nguyên byte; không xóa test method TARGET. |
| `git diff --check` | Đạt. |

BE bổ sung ba test: phạm vi chuồng khi đổi Groom và cách ly CLB; từ chối Groom thêm/sửa/chuyển chuồng; khóa đã qua ngày dự kiến vẫn chặn xếp tập và thông báo Restricted bằng tiếng Anh.

Chuỗi trình duyệt gồm: Owner khai/ngày sinh → Manager xác minh → Vet ghi sinh hiệu/ký → Manager tiếp nhận; kết thúc tập sớm; báo khẩn kèm ảnh → dừng tập → Vet nhận/khám/kê thuốc/ký/chỉ định; marker 2D lưu/reload; Groom ghi Partial; vật tư trừ tồn một lần; tái khám đúng đợt mở khóa; hỗ trợ/phản hồi/chuông; đổi mật khẩu; VI/EN. Bổ sung G1: thẻ Trainer và dialog khóa tập, zoom/kéo/la bàn bản đồ, Groom chỉ xem map/lưới ở 390 px.

Ảnh kiểm chứng lượt G1 (được gitignore):

- `frontend/artifacts/injury-regions-1794143802159/`: bài sơ đồ chấn thương.
- `frontend/artifacts/workflows-1794144221935/`: chuỗi nghiệp vụ và G1, gồm `g1-full-training-lock.png`, `g1-manager-map.png`, `g1-groom-mobile-map.png`, `g1-groom-mobile-stalls.png`. Lượt này cũng kiểm tra nhãn cảnh báo G1 khi chuyển EN rồi VI.

Không dùng ảnh/kết quả từ báo cáo cũ làm bằng chứng mới.

**Chưa kiểm chứng:** tranh chấp ghi/khóa dòng/deadlock thực sự đồng thời trên SQL Server; email tới SMTP thật; dịch nội dung qua nhà cung cấp ngoài. SQL Server smoke và SQLite không thay thế bài kiểm tra cạnh tranh. Cảnh báo lint/bundle nêu trên còn tồn tại.

## Chạy ứng dụng trên Windows PowerShell

Sau khi schema/cấu hình môi trường đã sẵn sàng, dùng ba terminal:

```powershell
# Backend
Set-Location C:\Equine_Project\backend
.\.venv\Scripts\python.exe manage.py runserver 8000
```

```powershell
# Frontend
Set-Location C:\Equine_Project\frontend
npm.cmd run dev
```

```powershell
# Worker độc lập với trình duyệt
Set-Location C:\Equine_Project\backend
.\.venv\Scripts\python.exe manage.py run_operations --interval 60
# Một lượt: .\.venv\Scripts\python.exe manage.py run_operations --once
```

Browser tests phải dùng fixture mới riêng, không trỏ vào DB nghiệp vụ. Injury dùng `EQUI_BROWSER_PORT=8001`, Vite `VITE_API_PROXY_TARGET=http://127.0.0.1:8001` cổng 5174. Workflows dùng fixture mới `EQUI_BROWSER_PORT=8002`, proxy cổng 8002 và Vite 5175. Khởi động BE bằng `python -m apps.core.tests.browser_fixture`, FE bằng `npm.cmd run dev -- --host 127.0.0.1 --port <cổng> --strictPort`, rồi chạy script browser tương ứng. Không tái sử dụng fixture sau khi chuỗi test đã ghi dữ liệu.
