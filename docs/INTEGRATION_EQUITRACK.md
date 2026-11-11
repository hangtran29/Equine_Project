# Tích hợp EquiTrack vào Equine_Project — 08/11/2026

Kết quả nằm trong `C:\Equine_Project`, trên nhánh `integration/equitrack-into-equine-project`. SOURCE là `C:\Users\R9000P 2022\Desktop\EquiTrack.zip`; archive chỉ được đọc. Các thay đổi chưa commit ban đầu của TARGET được giữ lại. Không commit, push, merge vào main hoặc triển khai. Khi xử lý lỗi tải dữ liệu sau tích hợp, người dùng đã cho phép backup và bổ sung schema còn thiếu trên database đang dùng; chi tiết bên dưới.

## Đối chiếu và kết quả tích hợp

Đã đối chiếu 92 tệp khác nhau và 51 tệp mới trong phần mã nguồn/schema/tài liệu được lọc từ archive; 183 tệp tương ứng giống nhau. Đã đọc `backend/docs/FLOW34_IMPLEMENTATION_20261102.md` và kiểm tra bằng code/test thực tế. Không dùng kết quả kiểm thử trong báo cáo cũ làm bằng chứng cho lần gộp này.

| Nhóm | Chỉ SOURCE có | Chỉ TARGET có / cần bảo toàn | Quyết định sau gộp |
|---|---|---|---|
| Hồ sơ và tiếp nhận | Giao diện mới; khai báo sức khỏe, tiền sử, ghi chú Owner; ngày rời CLB; hạn bảo trì chuồng; sinh hiệu | Phạm vi ngựa theo người dùng và CLB | Dùng các trang mới cho Owner/Manager, hàng chờ và khám nhập đàn; giữ scope BE. |
| Tài khoản | Giao diện nhân sự/phân quyền; bắt đổi mật khẩu tạm; đặt lại mật khẩu | Các khóa an toàn RBAC và phân tách Owner với nhân sự | Giao diện mới dùng quyền khóa của TARGET; không cho chuyển quyền khám/ký sang Groom hay mở quyền nhân sự cho Owner. |
| Huấn luyện | Giao diện Head Trainer/Trainer/Work Rider/Owner; lý do và ghi chú kết thúc sớm | Khóa toàn phần/giới hạn tải, dừng tập gắn báo sức khỏe có transaction | Giữ kiểm tra khóa khi xếp/sửa/bắt đầu. Kết thúc sớm do Injury giữ kết quả đo, dừng buổi và tạo/bổ sung báo khẩn trong cùng transaction. |
| Y tế | Tổng quan/đàn ngựa và cảnh báo khẩn mới | Bệnh án đã ký, đính chính, ảnh JWT, marker 2D/phục hồi, tái khám đúng đợt khóa | Dùng tổng quan/đàn ngựa mới cùng cách tính điều kiện tập của TARGET. Hồ sơ y tế, xử lý ca, điều trị, lịch và sơ đồ 2D tiếp tục dùng các trang TARGET. |
| Chăm sóc | Giao diện bảng công việc, lịch tập cho Groom, phân công, kho và xin vật tư mới | FeedingOutcome; việc chưa phân công; chỉ định y tế; hạn chế dinh dưỡng; worker; khóa tồn kho | Đã nối giao diện mới với contract TARGET. Trang lập/chốt khẩu phần, góp ý/hạn chế dinh dưỡng và giao việc y tế/hỗ trợ tập giữ chức năng TARGET. |
| Thông báo/hỗ trợ/ngôn ngữ | Chuông, hoạt động từ audit, yêu cầu hỗ trợ và phản hồi; VI/EN, date picker | WorkflowNotice, chống lặp và thông báo của worker | Gộp thông báo, tránh hai thông báo cho cùng ca khẩn/khóa; giữ scope Groom kể cả khi bị gỡ phân công. Nhãn giao diện dùng từ điển cục bộ; dịch nội dung tự do qua dịch vụ ngoài là tùy chọn. |

Đã tiếp nhận `frontend/src/flow1`, `flow2`, `flow3`, `flow4`, `i18n`, validation và ảnh `public/app-header-horse-rider.jpg`; thêm các module core, test và migration của SOURCE. `HUONG-DAN-CHAY.md` và `tools/real_data/README.md` của SOURCE không được dùng làm hướng dẫn vận hành TARGET; dùng tài liệu này. Không chép `.git`, môi trường ảo, dependencies, dist, cache, `.env`, log, database seed hoặc media mẫu từ SOURCE.

Các nhóm tệp chính:

- `frontend/src/App.jsx`, `routing/*`, `pages/care/careRoutes.jsx`: ghép auth/layout/route theo từng phần, dùng chung kiểm tra quyền cho menu và đường dẫn trực tiếp. Giữ bộ xử lý bệnh án của TARGET; bỏ các khối giao diện cũ đã được thay thế khỏi App.
- `frontend/src/flow1/*`, `flow2/*`, `flow3/*`, `flow4/*`: giao diện mới và adapter cho contract hiện hành; các danh sách có phân trang dùng bộ tải đủ trang của TARGET, không gửi JWT theo URL phân trang khác origin/resource.
- `frontend/src/api/apiClient.ts`, `horseApi.ts`, `userApi.ts`, `types/index.ts`: giữ một cặp token và cơ chế refresh, lỗi API, multipart, blob JWT; thêm ngôn ngữ, cờ mật khẩu tạm, khai báo Owner và sinh hiệu.
- `backend/apps/core/{activity,codes,content_i18n,drf_messages,support,validators}.py`, `core/data/content_en.json`: bổ sung thông báo hoạt động, hỗ trợ, validation và dịch. Phone/microchip từ chối chữ số Unicode trước khi ghi vào cột VARCHAR.
- `backend/apps/{accounts,horses,training,medical,care}/*`: gộp model/serializer/service/view theo chức năng. Thêm trường và sinh hiệu, hỗ trợ khai báo của Manager, ngày rời CLB, bảo trì và kết thúc tập sớm.
- `sql/horse_v2.sql`, các migration mới và test tích hợp: đồng bộ schema cho database mới, cung cấp nâng cấp riêng cho database đang có dữ liệu.

## Các contract TARGET được bảo toàn

Đã đối chiếu byte với bản TARGET trước gộp: các tệp sau giữ nguyên nội dung:

`core/access.py`, `core/clubtime.py`, `core/locking.py`, `core/workflow.py`, `medical/attachments.py`, `medical/injuries.py`, `care/orders.py`, `care/management/commands/run_operations.py`, `medical/tests/test_workflow_contracts.py` và `sql/migrations/20261102_health_care_workflows.sql` (các đường dẫn Python thuộc `backend/apps/`).

Các API sau vẫn là contract chuẩn, không chuyển sang demo/localStorage:

| API sau `/api` | Hành vi |
|---|---|
| `/horses/{id}/injury-markers`, `/injury-markers/{id}`, `/injury-markers/{id}/assessments` | Lưu vị trí hai bên cơ thể và lịch sử phục hồi vào BE; phiếu đã ký không sửa vị trí gốc. |
| `/horses/{id}/health-report-attachments`, `/health-report-attachments/{id}/file` | Upload multipart trả AttachmentID; đọc ảnh bằng JWT và kiểm tra scope. |
| `/horses/{id}/care-orders`, `/care-orders/{id}/stop` | Chỉ định chăm sóc và ngừng có lý do, liên kết bệnh án/đợt khóa. |
| `/horses/{id}/diet-restrictions`, `/diet-restrictions/{id}/stop` | Hạn chế y tế; Head Trainer vẫn là người lập/chốt khẩu phần. |
| `/training-sessions/{id}/stop` | Dừng và báo sức khỏe giữ liên kết, transaction và chống báo trùng. |
| `/training-locks/{id}/release` | Cần phiếu Follow-up đã ký, Eligible, đúng ngựa/đợt khóa và đúng mốc thời gian. Ngày hết hạn dự kiến không tự mở khóa. |

Groom tiếp tục chỉ thấy ngựa/công việc trong phạm vi được giao. Hoàn thành bữa ăn gửi `FeedingOutcome: All/Partial/Refused`, ghi chú riêng trong `OutcomeNote`; bỏ qua cần `Reason`. Đổi/gỡ Groom giữ xử lý mọi việc Pending và lịch sử người đã hoàn thành. Duyệt vật tư có ghi chú, duyệt một phần và không trừ tồn lần hai. Worker tiếp tục sinh việc/nhắc lịch độc lập với trình duyệt.

## Xử lý xung đột và mapping

- Không mở hệ upload `health-report-images` của SOURCE. Giao diện báo cáo dùng `AttachmentIDs` và tải ảnh bảo vệ bằng JWT từ kho đính kèm TARGET.
- Không dùng màn hình y tế SOURCE thiếu marker/phục hồi, chỉ định hoặc điều kiện tái khám để thay thế hồ sơ đầy đủ của TARGET. Một đường dẫn chính cho mỗi nghiệp vụ; các đường dẫn thông báo cũ được chuyển tiếp.
- `EarlyEndReason=Injury` kích hoạt quy trình báo khẩn/dừng tập của TARGET, giữ TrainingResult và EndTime. Các lý do khác như Fatigue lưu kết thúc sớm bình thường. Nếu báo sự cố thất bại thì kết quả và trạng thái buổi được rollback.
- Giữ RBAC an toàn của TARGET. Hai trường hợp test SOURCE mang hành vi cũ được đối chiếu bằng test TARGET nghiêm hơn: `test_signed_treatment_is_immutable` thay cho sửa ngày thuốc trên phiếu đã ký; `test_groom_assignment_and_unassigned_tasks` thay cho tự chia Groom theo tải. Không gỡ test TARGET hay nới assertion để vượt kiểm thử. Không có test bị skip.
- Fixture cũ được cập nhật theo validation UELN/phone và lý do khóa; bỏ tạo trùng HorseGroom trong fixture. Groom ngoài scope nhận 404 theo contract TARGET.
- Chuông kết hợp hoạt động audit, việc đang chờ, hỗ trợ và WorkflowNotice. Nội dung bệnh án không được đưa vào thông báo của Groom/Work Rider; hoạt động của ngựa đã bị thu hồi phân công không còn hiện cho Groom.
- Giữ `TIME_ZONE` từ môi trường, `CARE_REFUSAL_THRESHOLD`, transaction và khóa dòng TARGET. Các màn hình chăm sóc mới dùng ngày/giờ CLB. Khẩu phần/hạn chế y tế và kết luận khám được đối chiếu trước khi hiển thị ngựa được phép tập.
- CSS mới chủ yếu nằm dưới `.f1`; không đặt `.f1` lên trang bệnh án/diagram TARGET. Bản đồ khu CLB có nhãn minh họa, không khẳng định đó là vị trí thực địa đã cấu hình.

| Route cũ / link | Route hoặc màn hình sau gộp |
|---|---|
| `/manager/horses`, `/manager/horses/{id}/intake`, `/manager/horses/new` | Giao diện quản lý/tiếp nhận mới, giữ quyền và API TARGET. |
| `/manager/staff`, `/manager/roles` | Giao diện tài khoản/phân quyền mới, giữ khóa RBAC. |
| `/manager/vet-duty` | Lịch trực mới; vẫn có menu Manager. |
| `/care/inventory`, `/care/grooms`, `/care/supplies` | Giao diện kho/phân công/xin vật tư mới với nghiệp vụ TARGET. |
| `/care/today` | Bảng việc mới, FeedingOutcome và lịch tập trong ngày. |
| `/care/tasks` | Giao diện mới cho Manager/Head Trainer; giữ form TARGET cho Vet/Trainer để không mất giao việc y tế/hỗ trợ tập. |
| `/care/diet-plans`, `/care/diet-approvals`, `/care/diets` | Giữ trang TARGET có chốt khẩu phần và hạn chế y tế. |
| `/owner/horses`, `/owner/horses/{id}` | Giao diện Owner mới. Các route `/training`, `/training/plans`, `/training/plans/{id}`, chi tiết buổi và tổng kết giai đoạn vẫn tồn tại. |
| `/owner/horses/{id}/training/stages`, `/owner/training/activity` | Giữ trang TARGET để không mất danh sách giai đoạn và hoạt động/thông báo. |
| `/training/*` | Giao diện Head Trainer/Trainer/Work Rider mới; các đường dẫn TARGET được giữ. |
| `/training/horses/{id}/assignment` | Redirect đến `/training/horses/{id}/assessment`, nơi có đánh giá/phân công. |
| `/vet/overview`, `/vet/herd` | Tổng quan/đàn ngựa mới, dùng trạng thái tập được tính từ kết luận và khóa TARGET. |
| `/vet/herd?view=stalls` | Redirect đến `/vet/stalls`, giữ sơ đồ chuồng TARGET. |
| `/vet/horses/{id}/examination` cho hồ sơ chờ nhập đàn | Redirect đến `/vet/horses/{id}/clinical`. Khám/điều trị ngựa đã tiếp nhận tiếp tục dùng trang TARGET. |
| `/vet/records/{id}/edit`, `/vet/horses/{id}/exam/new` | Adapter tới `/vet/horses/{horseId}/examination?record={id}` hoặc trang khám mới tương ứng. |
| `/vet/reports/{id}`, `/health-reports/{id}` của Vet | Chuyển đến trang xử lý TARGET `/vet/reports?report={id}&status=all`. |
| `/health-reports` | Giữ form TARGET có bổ sung báo cáo đang mở, nhiều ảnh và báo khẩn. Chi tiết nhân sự hiển thị ảnh qua AttachmentID. |
| `/manager/support-requests`, `/reset-password` | Route mới cho hỗ trợ và đặt lại mật khẩu. |

Hỗ trợ bổ sung `GET/POST /api/support-requests`, `/options`, `POST /{id}/resolve`; Groom có `GET /api/care/training-today`. `flow1/api.js` gọi chung apiClient hiện hành, không quản lý token hay refresh riêng.

## SQL Server và cấu hình

Các model nghiệp vụ vẫn `managed=False`. `manage.py migrate` không nâng cấp các bảng này trên SQL Server.

**Database đã có dữ liệu:**

1. Sao lưu, xác nhận đúng database; dừng API/worker khi áp dụng nâng cấp.
2. Bảo đảm các migration lịch sử cần thiết của TARGET đã có: 20261016/17/18, 20261020 (admin/notification và care), 20261021 (template), 20261031 (Vet duty), theo trạng thái triển khai hiện tại. Không sửa hoặc chạy lại lịch sử một cách mặc định.
3. Chạy `sql/migrations/20261108_equitrack_preflight.sql` để xem database đang chọn, hộ chiếu/phone trùng, định dạng cũ và nhiều báo cáo mở. Có truy vấn liệt kê các bản ghi trùng; xử lý thủ công, không tự xóa/gộp/chuẩn hóa dữ liệu.
4. Áp dụng `sql/migrations/20261102_health_care_workflows.sql` của TARGET nếu chưa áp dụng.
5. Áp dụng **`sql/migrations/20261108_equitrack_integration.sql`**. Script dùng transaction, rollback khi lỗi, kiểm tra tồn tại/phụ thuộc và dừng nếu có dữ liệu trùng trước khi tạo unique index. Các khối thêm cột/constraint chạy qua batch động để tránh lỗi biên dịch cột vừa thêm.
6. Kiểm tra lại schema, API và worker trên database test riêng trước khi triển khai thật.

Migration tích hợp bao gồm các bổ sung của `20261105_flow1_design`, `20261105_unicode_text_columns`, `20261106_support_requests`, `20261106_training_early_end`, `20261106_unique_passport_phone`. Các tệp SOURCE này được giữ để đối chiếu; không cần chạy thêm sau script tích hợp. Nếu một phần SOURCE đã được áp dụng, các kiểm tra tồn tại cho phép bỏ qua phần đó.

Giữ nguyên `20261021_training_plan_templates.sql` của TARGET. Khác biệt `Surface VARCHAR → NVARCHAR` được xử lý trong migration mới. Bảng/cột/FK/index WorkflowNotice, marker, ảnh, chăm sóc và khóa của TARGET được giữ; thêm SupportRequest cùng FK/index/check, các trường Horse/Stall/User/MedicalRecord/TrainingResult và unique index hộ chiếu/phone.

**Database mới, trống:** `sql/horse_v2.sql` đã đồng bộ cả hai phía. Script có lệnh chọn database và tạo lại bảng; chỉ dùng cho database mới được xác định rõ. Khi chuẩn bị SQL Server test với tên riêng, phải kiểm tra/đổi rõ tên database trong bản sao script, không chỉ dựa vào tùy chọn `sqlcmd -d`. Không chạy script này, setup_local_database.py hoặc seed SOURCE lên database hiện hành.

Khi bàn giao tích hợp ban đầu, chưa chạy migration trên SQL Server. Trong lượt sửa lỗi tải dữ liệu sau đó, đã kiểm thử riêng và áp dụng bản nâng cấp TARGET còn thiếu theo xác nhận của người dùng, như ghi bên dưới. Với môi trường khác, thay đúng server/database test trong các lệnh sau:

```powershell
Set-Location C:\Equine_Project
sqlcmd -S '<SQL_SERVER_TEST>' -d '<DATABASE_TEST_RIENG>' -E -b -i .\sql\migrations\20261108_equitrack_preflight.sql
# Nếu chưa có nâng cấp Flow 3/4:
sqlcmd -S '<SQL_SERVER_TEST>' -d '<DATABASE_TEST_RIENG>' -E -b -i .\sql\migrations\20261102_health_care_workflows.sql
sqlcmd -S '<SQL_SERVER_TEST>' -d '<DATABASE_TEST_RIENG>' -E -b -i .\sql\migrations\20261108_equitrack_integration.sql
```

### Khắc phục lỗi tải dữ liệu ngày 08/11/2026

Ảnh lỗi tại `/manager/horses/15/intake` tương ứng với hai API `/api/horses/15` và `/api/notifications/unread-count` trả 500. SQL Server vẫn kết nối được; database `RacehorseTrainingManagement` đã có các trường SOURCE nhưng chưa có nâng cấp Flow 3/4 của TARGET: thiếu `MedicalRecord.FollowUpLockID`, bảy cột `CareTask` và sáu bảng `WorkflowNotice`, `HealthReportAttachment`, `InjuryMarker`, `InjuryAssessment`, `VetCareOrder`, `VetDietRestriction`.

- Tạo database SQL Server riêng `EquineSchemaRepairTest_20261108_ea72d7c1`; dựng schema SOURCE tại đó, chạy `20261102_health_care_workflows.sql` hai lần thành công và kiểm tra đủ bảng/cột so với model. Chuỗi fixture Owner khai hồ sơ → Manager xác minh → Vet ký khám đầu vào thành công; API hồ sơ và số thông báo trả 200. Database test này được giữ riêng, không dùng làm database ứng dụng.
- Kiểm tra trước nâng cấp trên database hiện hành: không có nhiều báo cáo sức khỏe đang mở cho cùng ngựa hoặc loại công việc/quy tắc chăm sóc vi phạm constraint mới.
- Sau khi người dùng xác nhận **“Cho phép backup và cập nhật schema”**, tạo backup `COPY_ONLY, CHECKSUM` và chạy `RESTORE VERIFYONLY WITH CHECKSUM` thành công. Backup nằm tại `C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\RacehorseTrainingManagement_before_health_care_20261108_c2347662.bak`.
- Áp dụng duy nhất `sql/migrations/20261102_health_care_workflows.sql` trên `RacehorseTrainingManagement`. Không chạy script tạo lại database hoặc seed. Nội dung script lịch sử được giữ nguyên.
- So sánh toàn bộ giá trị các cột có sẵn trước/sau nâng cấp: **47 bảng, 8.057 dòng giữ nguyên**. Sau nâng cấp có 53 bảng; không còn bảng/cột nghiệp vụ thiếu so với model.
- Gọi lại hai API trên backend thật đang chạy ở cổng 8000 bằng quyền Manager: `/api/horses/15` trả **200**, đúng HorseID 15; `/api/notifications/unread-count` trả **200**.

Nâng cấp schema có hiệu lực ngay; trang đang hiển thị lỗi cần tải lại. Không cần chỉnh `HorseProfile.jsx` cho lỗi này.

`.env` thực tế của TARGET không bị sửa. `.env.example` thêm:

| Biến | Mặc định / ý nghĩa |
|---|---|
| `NOTIFICATION_EMAILS` | `True`, giữ email nghiệp vụ. Email đặt lại mật khẩu vẫn gửi khi tắt email thông báo. |
| `CONTENT_TRANSLATION` | `False`, dịch nội dung tự do qua dịch vụ ngoài là opt-in; từ điển nhãn VI/EN hoạt động độc lập. |
| `TRANSLATION_CACHE_FILE` | Để trống dùng `backend/translation_cache.json`, đã gitignore; có thể cấu hình đường dẫn riêng. |
| `NO_MAILBOX_DOMAINS` | Rỗng, không tự chặn đặt lại mật khẩu theo tên miền. Chỉ cấu hình các miền tài khoản không có hộp thư thật khi cần. |
| `TIME_ZONE`, `CARE_REFUSAL_THRESHOLD` | Giữ cấu hình TARGET; mặc định `Asia/Ho_Chi_Minh` và 2. `VITE_CLUB_TIME_ZONE` của FE cần khớp BE. |

## Kiểm thử thực tế

Chạy ngày 08/11/2026, dùng dependencies sẵn có trong TARGET. Không lấy môi trường hoặc kết quả kiểm thử từ SOURCE.

| Kiểm tra | Kết quả |
|---|---|
| `manage.py test --settings=config.settings_test --noinput` | **242 test đạt**, không skip; test runner tạo mọi model unmanaged, gồm SupportRequest, trên SQLite test riêng. |
| `npm.cmd run typecheck` | Đạt. |
| `npm.cmd run lint` | Exit 0, **0 lỗi, 122 cảnh báo**. |
| `npm.cmd run build` | Đạt; còn cảnh báo bundle >500 kB và dynamic import chung module đã được import tĩnh. |
| `npm.cmd run test:api` | **32 test đạt**, gồm token/refresh/multipart/JWT, pagination, route permission và trường tích hợp. |
| `npm.cmd run test:injury` | **19 test đạt**. |
| `npm.cmd run test:training-status` | **10 test đạt**. |
| `npm.cmd run test:injury:browser` | Đạt trên Chromium + API fixture riêng: hai bên hình, 9 vùng, bàn phím/touch, responsive, lưu/reload, mất phản hồi, quyền khác Vet và phiếu Signed, không lưu bệnh án trong localStorage. |
| `npm.cmd run test:workflows:browser` | Đạt trên Chromium + API fixture mới riêng; cập nhật selector theo bảng chăm sóc mới, giữ kiểm tra nghiệp vụ/BE. |
| `git diff --check` | Đạt. |

Chuỗi browser đã kiểm chứng: báo khẩn kèm ảnh → dừng buổi → Vet nhận ca/khám/kê thuốc/marker lưu/reload/ký/đặt chăm sóc; Groom ghi Partial; xin vật tư → Manager duyệt → tồn giảm một lần, duyệt lại trả 409; ký Follow-up đúng đợt → mở khóa; Work Rider ghi kết thúc sớm; hỗ trợ → Manager phản hồi → chuông người gửi; VI/EN; mật khẩu tạm → đổi mật khẩu → đăng nhập; Owner khai ngựa và chọn ngày bằng date picker → Manager xác minh → route khám cũ chuyển đúng trang mới → Vet ghi sinh hiệu/ký → Manager xếp chuồng/Groom và tiếp nhận; đăng xuất bằng giao diện.

Test BE bổ sung kiểm tra Injury kết thúc sớm giữ kết quả và dừng/báo một lần, rollback khi báo lỗi, không lộ chẩn đoán qua thông báo Groom, scope khi thu hồi phân công, Owner chỉ đọc Groom của ngựa mình, chữ số không phải ASCII và cấu hình/cache dịch không gọi mạng. Không xóa test method nào của TARGET trước gộp.

Ảnh kiểm chứng lượt cuối:

- `frontend/artifacts/injury-regions-1794109948325/`
- `frontend/artifacts/workflows-1794109948322/`

**Bổ sung kiểm thử SQL Server:** `20261102_health_care_workflows.sql` đã áp dụng/rerun thành công và chuỗi khám đầu vào cùng API hồ sơ/thông báo đã chạy trên SQL Server test riêng trong lượt sửa lỗi tải dữ liệu nêu trên.

**Chưa kiểm chứng:** áp dụng/rerun migration tích hợp `20261108_equitrack_integration.sql` và cạnh tranh/khóa dòng/deadlock trên SQL Server test; email tới hộp thư SMTP thật; dịch máy với nhà cung cấp thật. SQLite không chứng minh hành vi cạnh tranh trên SQL Server. Test email dùng locmem và dịch ngoài bị tắt/mock. Cảnh báo lint/bundle nêu trên còn tồn tại.

## Chạy trên Windows PowerShell

Sau khi schema database đích và cấu hình TARGET đã sẵn sàng, dùng ba terminal:

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
# Worker chạy độc lập với trình duyệt
Set-Location C:\Equine_Project\backend
.\.venv\Scripts\python.exe manage.py run_operations --interval 60
# Chạy một lượt khi cần: .\.venv\Scripts\python.exe manage.py run_operations --once
```

Để lặp lại browser test, dùng hai fixture **mới** riêng, không trỏ proxy vào DB nghiệp vụ:

```powershell
# Backend A cho injury (giữ terminal chạy):
Set-Location C:\Equine_Project\backend
$env:EQUI_BROWSER_PORT='8001'
.\.venv\Scripts\python.exe -m apps.core.tests.browser_fixture
# Frontend A, terminal riêng:
Set-Location C:\Equine_Project\frontend
$env:VITE_API_PROXY_TARGET='http://127.0.0.1:8001'
npm.cmd run dev -- --host 127.0.0.1 --port 5174 --strictPort
# Terminal kiểm thử: npm.cmd run test:injury:browser
```

Cho workflows, khởi động một fixture mới với `EQUI_BROWSER_PORT=8002`, Vite riêng với `VITE_API_PROXY_TARGET=http://127.0.0.1:8002` và `--port 5175`, rồi chạy `npm.cmd run test:workflows:browser`. Mỗi lần chạy lại chuỗi phải tạo fixture mới. Không chạy worker nghiệp vụ hoặc seed SOURCE để dựng fixture này.
