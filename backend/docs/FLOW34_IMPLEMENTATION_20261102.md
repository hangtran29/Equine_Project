# Flow 3 và Flow 4 — triển khai ngày 02/11/2026

Tài liệu này dựa trên mã nguồn trong workspace. Không thay thế hay sửa các báo cáo trước đây. Không chạy cập nhật schema, seed hoặc kiểm thử ghi trên database nghiệp vụ.

## Phần được tái sử dụng

- Django/DRF, JWT và RolePermission hiện có; React/Vite, màu và component của Equi.
- HealthReport/HealthReportNote, hàng chờ Vet, MedicalRecord, ký và đính chính, Treatment, TrainingLock, MedicalSchedule, Vaccination và VetDutyShift.
- DietPlan/DietMeal, CareTask/CareTaskRule, HorseGroom, InventoryItem/InventoryRequest và trang Manager `InventoryPage.jsx` đã có nhưng trước đây chưa có đường truy cập.
- Lưu tệp và kiểm tra định dạng từ `horses/documents.py`; ảnh báo cáo được tải qua API riêng có kiểm tra quyền, không công khai thư mục media.
- NotificationRead, chuông thông báo/polling, `core/emails.py` gửi sau commit. Không bổ sung Celery/Redis.
- Hình ngựa 2D, đường vùng, bộ chọn nhiều vùng, phần nhập vị trí trong bệnh án và các component chi tiết/lịch sử phục hồi hiện có.

## Contract API

Đường dẫn dưới đây nằm sau `/api`; tên JSON cũ được giữ nguyên trừ contract marker mới dùng camelCase để khớp component sẵn có.

| Loại | Endpoint | Contract/quy tắc |
|---|---|---|
| Tái sử dụng | `GET /horses`, `GET /health-reports`, `GET /horses/{id}/health-reports` | BE tự giới hạn CLB và phạm vi ngựa; không tin `mine`, role hay user ID từ FE. |
| Hoàn thiện | `POST /horses/{id}/health-reports` | `{Description, Severity, AttachmentIDs?, TrainingSessionID?}`. Báo thường trùng trả 409 `OPEN_REPORT_EXISTS`; báo khẩn trùng bổ sung/nâng mức trên ca đang mở, trả 200 và `ReusedOpenReport:true`. Ca mới trả 201. `StoppedSession` phản ánh việc dừng thực tế. |
| Hoàn thiện | `POST /health-reports/{id}/notes` | `{Content, Severity?, AttachmentIDs?}`. Chỉ nâng mức khẩn, không tự hạ mức; ca đã đóng không được bổ sung. |
| Tái sử dụng | `POST /health-reports/{id}/take`, `/resolve` | Nhận ca có khóa và đọc lại trạng thái; Vet khác không chiếm ca. Đóng ca cần `VetNote`; nếu đã gắn bệnh án thì bệnh án phải đã ký. |
| Mới | `POST /horses/{id}/health-report-attachments` | Multipart `File`: JPG/PNG/WEBP, giới hạn `UPLOAD_MAX_MB`, trả `AttachmentID`. |
| Mới | `GET /health-report-attachments/{id}/file` | Tải ảnh đã lưu bằng JWT; kiểm tra ngựa và CLB. Ảnh chưa gắn báo cáo chỉ người tải xem được. |
| Tái sử dụng | `POST /horses/{id}/medical-records`, `PATCH /medical-records/{id}`, `/sign`, `/amendments` | Nháp chỉ Vet lập được sửa/ký; bệnh án và thuốc đã ký không sửa trực tiếp. Đính chính giữ nguyên bản gốc, người sửa, lý do, thời gian. |
| Bổ sung trường | MedicalRecord `FollowUpLockID` | Phiếu `Follow-up` có thể gắn đợt khóa đang hoạt động của cùng ngựa. Ngày `FollowUpDate` được tạo lịch tương ứng khi ký. |
| Mới | `GET/POST /horses/{id}/injury-markers`; `PATCH/DELETE /injury-markers/{id}` | `{medicalRecordId,bodyRegion,bodySide,view,xRatio,yRatio,diagramVersion,description,severity,status,detectedAt,notes}`. Phiếu cùng ngựa, nháp của người lập. Trái/phải độc lập; phiên bản hình `equi-horse-photo-v3`. Không đọc/import localStorage demo. |
| Mới | `POST /injury-markers/{id}/assessments` | `{medicalRecordId,date,status,comment}`. Gắn một phiếu `Follow-up` nháp khác của cùng ngựa do người ghi lập; tác giả/thời gian do BE đặt. Lưu nối tiếp; không sửa vị trí gốc đã ký. |
| Hoàn thiện | `POST /horses/{id}/training-locks`, `PATCH /training-locks/{id}`, `POST /training-locks/{id}/release` | Full chặn tập; Restricted bắt buộc tải tối đa. Kiểm tra khi xếp/sửa/bắt đầu buổi, và dừng/hủy buổi vượt giới hạn khi đổi khóa. Ngày kết thúc dự kiến không tự mở khóa. |
| Hoàn thiện | `POST /training-sessions/{id}/stop` | FE Trainer gửi `{Reason,ReportHealth:true,Severity:"Urgent",Description}`; dừng và tạo/bổ sung báo cáo trong transaction. Lưu liên kết và audit người báo/lý do. |
| Tái sử dụng | `GET/POST /vet-duty-shifts`, `DELETE /vet-duty-shifts/{id}`, `GET /vet-duty-shifts/now` | Manager phân lịch tại `/manager/vet-duty`. Email báo khẩn ưu tiên Vet đang trực; nếu không ai trực thì gửi các Vet hoạt động trong CLB. Vet khác vẫn nhận ca được. |
| Hoàn thiện | `PUT/DELETE /horses/{id}/groom` | Chỉ Manager phân công. BE chuyển **mọi việc Pending**, kể cả quá giờ và việc giao tay; giữ người đã làm trên việc Completed, cùng audit người chuyển/thời điểm/danh sách task. Không tự chia Groom khi chưa phân công. |
| Hoàn thiện | `GET/POST/PATCH /care-tasks` | Lọc `Date/From/To/HorseID/TaskType/Status/GroomID/Unassigned`. Groom luôn chỉ thấy task của mình, kể cả bỏ `mine=1`. Vet giao y tế, Trainer giao `Training Support` cho ngựa trong phạm vi. BE lấy Groom từ HorseGroom; không dùng GroomID do FE chọn. |
| Hoàn thiện | `POST /care-tasks/{id}/complete`, `/skip` | Hoàn thành `{Note?,FeedingOutcome?}`; bữa ăn bắt buộc `All/Partial/Refused`. Bỏ qua `{Reason}` bắt buộc. Khóa/đọc lại task nên thao tác lặp không ghi hoàn thành hai lần. Task trả giờ/ngựa/chuồng/nguồn/ưu tiên/trạng thái, không trả nội dung bệnh án cho Groom. |
| Mới | `GET/POST /horses/{id}/care-orders`; `POST /care-orders/{id}/stop` | Chỉ định y tế theo phiếu đã ký của Vet: `{MedicalRecordID,TrainingLockID?,TaskType,Instructions,StartDate,EndDate,TimeOfDay}`. Tối đa 90 ngày/lần; ngừng có `Reason`. UI ở hồ sơ ngựa → Điều trị và đơn thuốc. Ngâm chân lạnh phải được Vet chọn rõ. |
| Hoàn thiện | `POST /horses/{id}/diet-plans`, `PATCH /diet-plans/{id}`, `POST /diet-plans/{id}/approve` | **Head Trainer lập và chốt**; Vet không tạo/chốt khẩu phần chuẩn. `Pending` vẫn giữ trong contract nhưng nghĩa là chờ Head Trainer chốt. Khẩu phần được chốt kiểm tra hạn chế y tế và chấm dứt khoảng trùng của bản trước. |
| Tái sử dụng có siết quyền | `POST /diet-plans/{id}/reject`, `/adjust` | Vet gửi góp ý. `reject` cần lý do sửa; `adjust` chỉ nhận `VetNote`, không cho sửa trực tiếp Meals/ngày của bản đã chốt. Muốn thay khẩu phần cần Head Trainer tạo/chốt bản thay thế. |
| Mới | `GET/POST /horses/{id}/diet-restrictions`; `POST /diet-restrictions/{id}/stop` | Vet đặt `{Instructions,StartDate,EndDate?,FeedType?,MaxDailyQuantity?,Unit?}`. Có FeedType nhưng không có MaxDailyQuantity = không dùng thức ăn đó. Có giới hạn lượng = kiểm tra tổng lượng/ngày, cùng đơn vị; không tự quy đổi. Không có FeedType = góp ý dạng chữ. Lưu người chỉ định và thời gian. Ngừng có lý do. |
| Hoàn thiện | `GET /horses/{id}/diet-context`, `/current-diet`, `/diet-plans` | Head Trainer/Vet có bối cảnh giáo án, kết quả, cân nặng, khóa và chỉ định dinh dưỡng. Groom chỉ xem bản đã chốt trong phạm vi. Khẩu phần đang vi phạm hạn chế không được dùng sinh bữa; bữa Pending của bản đó bị chặn xác nhận nếu vi phạm hiện tại. |
| Tái sử dụng | `GET /inventory-items`, `POST /inventory-requests`, `/approve`, `/reject`, `/cancel` | Kho cấp **CLB**. Manager vào `/care/inventory`; duyệt yêu cầu cần `Note`, hỗ trợ duyệt một phần. Khóa request và vật tư theo thứ tự; trừ tồn có điều kiện, rollback cả phiếu nếu thiếu. Sửa tên/ngưỡng hoặc nhập kho cũng khóa dòng để không ghi đè tồn khi đang cấp. |

## Quy tắc automation và thông báo

- Tác vụ sinh bữa theo DietMeal của bản đã chốt, dọn chuồng mỗi sáng, tắm/kiểm tra chân sau kết quả buổi tập thực tế, chăm sóc theo VetCareOrder. Thời điểm sau tập lấy `TrainingResult.RecordedAt`, kể cả chuyển sang ngày hôm sau.
- Một nguồn/ngựa chỉ có một task: khóa transaction và unique `(HorseID,SourceKey)`. Không có Groom thì vẫn lưu task với GroomID NULL, Manager có bộ lọc xem việc chưa phân công.
- Chỉ sửa task tự sinh **Pending và chưa tới giờ** khi nguồn thay đổi. Task nguồn không còn phù hợp được đánh dấu Skipped kèm lý do và audit, không xóa. Task Completed/Skipped và task đã tới giờ được giữ; không tự hồi sinh task đã bỏ qua khi bật lại một quy tắc trong cùng ngày.
- Khẩu phần/task đã hoàn thành không bị sửa ngược; task sinh từ bữa giữ `DietMealID` và nội dung hướng dẫn tại lúc giao.
- `CARE_REFUSAL_THRESHOLD` mặc định 2, tối thiểu 2. Các bữa theo thứ tự ScheduledAt phải đều Completed/Refused liên tiếp; Pending, Skipped hoặc ăn lại ngắt chuỗi. Mỗi chuỗi gửi một thông báo cho Trainer phụ trách, Head Trainer và Vet; không tự suy đoán chẩn đoán. Groom luôn có nút báo khẩn thủ công.
- Khóa/thay mức/mở khóa tạo thông báo cho Trainer, Head Trainer và Owner. Owner nhận email khi khóa; báo khẩn email Vet trực. Email dùng cơ chế sau commit sẵn có; lỗi gửi không rollback báo cáo hay buổi tập.
- Mở khóa cần phiếu **Follow-up, Signed, Eligible**, cùng ngựa và `FollowUpLockID`, khám/ký sau thời điểm tạo hoặc thay đổi khóa gần nhất. Có thể gửi thêm `FollowUpMedicalRecordID`; phải là phiếu hợp lệ mới nhất. Không dùng một phiếu Routine hoặc giấy khám cũ để mở đợt khóa khác.
- Lịch tiêm/tẩy giun/móng/tái khám tiếp tục dùng API và UI hiện có. Thời gian ngưng thuốc chỉ lấy `WithdrawalUntil` từ đơn; không suy ra từ tên thuốc hoặc kết luận đủ điều kiện thi đấu khi thiếu dữ liệu.
- Thông báo trong ứng dụng được lưu/chống lặp bằng WorkflowNotice và gộp vào chuông hiện có. FE polling chỉ tải thông báo, **không phải tác vụ nền**. Worker sinh task và nhắc lịch y tế dù không ai mở ứng dụng; nhắc y tế của worker là thông báo trong ứng dụng, không phải email nhắc tự động.
- SMTP chưa cấu hình: backend email console hiện có chỉ in email phát triển, không chứng minh đã gửi thư thật. SMTP thật chưa được kiểm thử trong lần bàn giao này.

## Schema và cấu hình

Các model nghiệp vụ là **unmanaged**. `manage.py migrate` không tạo/nâng cấp các bảng này trên SQL Server.

1. Dừng phiên bản API/worker đang chạy khi triển khai; sao lưu và xác định database đích.
2. Database phải có schema dự án hiện hành, gồm các nâng cấp CareTaskRule/HorseGroom ngày 20/10 và VetDutyShift ngày 31/10 nếu được tạo trước các lần nâng cấp đó.
3. Xem và áp dụng rõ ràng bằng SSMS `sql/migrations/20261102_health_care_workflows.sql`. **Script này chưa được chạy trên database nghiệp vụ hoặc SQL Server test trong phiên này.** Script không xóa dòng; có transaction, kiểm tra tồn tại, thêm cột/bảng/FK và index. Nếu đang có nhiều báo cáo mở cho một ngựa, script dừng để xử lý thủ công, không tự đóng/xóa ca.
4. Bảng mới: HealthReportAttachment, InjuryMarker, InjuryAssessment, VetCareOrder, VetDietRestriction, WorkflowNotice. Cột mới: MedicalRecord.FollowUpLockID; CareTask.MedicalRecordID/TrainingLockID/Priority/FeedingOutcome/OutcomeNote/CompletedBy/DietMealID. GroomID cho phép NULL. Có filtered unique index cho một báo cáo mở/ngựa; unique nguồn task được tái sử dụng. Ghi chú hoàn thành/lý do bỏ qua nằm trong OutcomeNote riêng để không cắt mất ghi nhận khi hướng dẫn ban đầu dài.
5. Các dòng cũ được giữ nguyên. CompletedBy và các liên kết mới của dữ liệu cũ có thể NULL; không suy đoán hoặc nhập dữ liệu demo/localStorage vào bệnh án thật.
6. Database **mới, trống** có thể dùng `sql/horse_v2.sql` đã cập nhật. Không dùng script tạo lại này để nâng cấp database có dữ liệu.
7. `.env.example` có `TIME_ZONE=Asia/Ho_Chi_Minh` và `CARE_REFUSAL_THRESHOLD=2`; frontend `.env.example` có `VITE_CLUB_TIME_ZONE` cần khớp `TIME_ZONE` của BE. Uploads và email giữ cấu hình hiện có. DATETIME2 tiếp tục lưu giờ CLB, USE_TZ=False; FE giữ giờ địa phương của dữ liệu DATETIME2 và chuyển đổi rõ các timestamp có offset.

## Chạy ứng dụng và worker trên Windows

Trong `backend` sau khi schema đã sẵn sàng:

```powershell
.venv\Scripts\python.exe manage.py runserver 8000
```

Trong `frontend`:

```powershell
npm.cmd run dev
```

Một cửa sổ PowerShell thứ hai trong `backend`:

```powershell
.venv\Scripts\python.exe manage.py run_operations --interval 60
```

Hoặc tạo một tác vụ Windows Task Scheduler do môi trường triển khai quản lý: lặp mỗi phút, chương trình là đường dẫn tuyệt đối tới `backend\.venv\Scripts\python.exe`, arguments `manage.py run_operations --once`, Start in là thư mục `backend`. Task không cần người mở trình duyệt. Không tự đăng ký tác vụ hệ điều hành hoặc chạy worker lên DB nghiệp vụ trong phiên này. Lệnh cũ `generate_care_tasks --days 2` vẫn dùng được để sinh thủ công.

## Kiểm thử

Kết quả đã chạy trong workspace: **204 kiểm thử BE đạt**, **59 kiểm thử FE đạt** (30 API, 19 injury, 10 training status); typecheck/build đạt. Lint có **0 lỗi, 59 cảnh báo**; Vite cảnh báo bundle lớn. Hai bài Chromium đạt. Ảnh kiểm chứng của chuỗi Flow 3/4 nằm tại `frontend/artifacts/workflows-1793587346205/`; bài sơ đồ có ảnh tại `frontend/artifacts/injury-regions-1793585807909/`.

```powershell
# Trong backend: SQLite test riêng, media tạm, email trong bộ nhớ; không kết nối DB nghiệp vụ.
.venv\Scripts\python.exe manage.py test apps.medical.tests apps.care.tests apps.training.tests apps.core.tests --settings=config.settings_test --noinput

# Trong frontend:
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:api
npm.cmd run test:injury
npm.cmd run test:training-status
```

Chromium test dùng API thật trên SQLite/media tạm, không mock nghiệp vụ. Các server phải chạy riêng, không trỏ proxy vào database thật:

```powershell
# Backend, terminal A: cho test sơ đồ có sẵn
.venv\Scripts\python.exe -m apps.core.tests.browser_fixture
# Frontend, terminal B
$env:VITE_API_PROXY_TARGET='http://127.0.0.1:8001'
npm.cmd run dev -- --host 127.0.0.1 --port 5174 --strictPort
# Frontend, terminal C
npm.cmd run test:injury:browser
```

Cho bài kiểm thử chuỗi Flow 3/4, dùng một fixture **mới** (không dùng lại database đã được test sơ đồ ghi dữ liệu):

```powershell
# Backend, terminal A
$env:EQUI_BROWSER_PORT='8002'
.venv\Scripts\python.exe -m apps.core.tests.browser_fixture
# Frontend, terminal B
$env:VITE_API_PROXY_TARGET='http://127.0.0.1:8002'
npm.cmd run dev -- --host 127.0.0.1 --port 5175 --strictPort
# Frontend, terminal C
npm.cmd run test:workflows:browser
```

Đã kiểm chứng trong Chromium: báo khẩn kèm ảnh dừng buổi đang tập; Vet xem ảnh/nhận ca/khám/kê thuốc/ký/đặt chỉ định; marker 2D lưu và mở lại; Groom xác nhận tình trạng ăn; Groom xin vật tư → Manager duyệt → tồn giảm đúng một lần; ký tái khám liên kết đúng đợt → mở khóa. Bài test sơ đồ kiểm tra cả hai bên, bàn phím, tap, highlight, responsive 1440/1024/834/390, lỗi mạng và giữ nội dung nhập.

Test BE mới ở `apps/medical/tests/test_workflow_contracts.py` kiểm tra phân quyền trực tiếp, cách ly CLB, báo khẩn/chống trùng, hai Vet với đối tượng đọc trước, ảnh, signed immutability, marker/phục hồi, điều kiện mở khóa, đổi Groom, việc chưa phân công, worker/nhắc lịch không lặp, chuỗi bỏ ăn, giới hạn khẩu phần và kho không trừ hai lần. Test cũ đã được cập nhật theo quyền và quy tắc mới; không bị bỏ qua hoặc vô hiệu hóa.

SQLite không chứng minh được khóa dòng và deadlock khi gửi yêu cầu đồng thời trên **SQL Server**. Cần chạy migration cùng kiểm thử cạnh tranh thực trên SQL Server test được xác nhận trước khi triển khai thật. Kiểm thử email dùng locmem và mô phỏng lỗi SMTP; không kiểm chứng thư đã tới hộp thư thật. Còn cảnh báo lint trong mã có sẵn và cảnh báo bundle lớn của Vite; không có lỗi build/typecheck.

## Tệp chính để xem thay đổi

- `apps/core/access.py`, `locking.py`, `clubtime.py`, `workflow.py`: phạm vi ngựa, khóa giao dịch, giờ CLB, thông báo có chống lặp.
- `apps/medical/services.py`, `views.py`, `serializers.py`, `attachments.py`, `injuries.py`, `models.py`: báo cáo/ảnh, ca Vet, ký, khóa và marker/phục hồi.
- `apps/care/services.py`, `views.py`, `automation.py`, `orders.py`, `models.py`, `serializers.py`, `management/commands/run_operations.py`: task, Groom, khẩu phần/hạn chế, chỉ định, kho và worker.
- `frontend/src/pages/HealthReportsPage.jsx`, `pages/care/*`, `pages/manager/VetDutyPage.jsx`, `pages/manager/InventoryPage.jsx`: màn hình báo cáo, chăm sóc và đường truy cập Manager.
- `frontend/src/components/injury/HorseInjuryDiagram.jsx`, `HorseInjuryMapping.jsx`, `PersistentInjuryMarkers.jsx`: chọn vùng 2D, lưu vị trí và phục hồi vào BE; tái sử dụng HorseInjuryRegionPicker hiện có.
- `frontend/src/pages/vet/VetClinicalExam.tsx`, `VetOperations.jsx`, `VetCareOrders.jsx`, `VetPrescription.jsx`, `pages/training/TrainerSessionsPage.jsx`, `src/api/*`: tích hợp khám/thuốc/tái khám/chăm sóc và dừng tập báo sự cố.
- `apps/medical/tests/test_workflow_contracts.py`, `frontend/tests/workflows.browser.mjs`: kiểm thử nghiệm thu mới. `sql/migrations/20261102_health_care_workflows.sql`: nâng cấp hiện hành; `sql/horse_v2.sql`: schema cho DB mới.
