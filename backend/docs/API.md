# API contract – Equi backend (Flow 1–4)

Documentation for the frontend team. Backend: Django REST, database `sql/horse_v2.sql`.

**Current checkout supports all 4 flows** (Flow 1 intake, Flow 2 training, Flow 3 medical, Flow 4 care and nutrition).

### Verified Flow 1 frontend mapping

All paths below use the `/api` prefix, with no trailing slash. Responses use SQL column names; lists currently return arrays (FE also accepts `results` wrappers). Dates use `YYYY-MM-DD`; datetimes use local ISO strings.

| Function | Method/path | Payload → response | Frontend caller |
|---|---|---|---|
| Login / session | `POST /auth/login`, `GET /auth/me`, `POST /auth/refresh` | `Email, Password` → `access, refresh, User`; refresh body `refresh` → `access` | `userApi.ts`, `apiClient.ts` |
| Public signup / clubs | `POST /auth/register`, `GET /clubs` | `FullName, Email, Phone, Address, ClubID, Password` → token pair + Owner `User`; clubs → `ClubID, ClubName` | `registrationApi.js`, `horseApi.ts`, `LoginScreen.jsx` |
| Users | `GET /users?RoleCode=HORSE_OWNER` | array of `UserID, Roles, Status, ...` | `userApi.ts`, `CreateHorse.jsx`, `App.jsx` |
| Horse list/detail/create/edit | `GET, POST /horses`, `GET, PATCH /horses/{id}` | `HorseName, Breed, DateOfBirth, Gender, CoatColor, PassportNumber, MicrochipNumber, SireName, DamName`; Owner create adds `ClubID`, Manager create adds `OwnerID` → horse | `horseApi.ts`, Owner/Manager forms |
| Register / verify / reject | `POST /horses/{id}/submit`, `/verify`, `/reject` | `{}` / `{}` / `{Reason}` → horse | `horseApi.ts`, `App.jsx`, `CompleteIntake.jsx` |
| Intake / stalls / archive | `POST /horses/{id}/approve`, `GET /stalls?Status=Available`, `POST /horses/{id}/archive` | `HorseCode, StallID?, ManagerNote?` → horse; archive `Reason` → horse | `horseApi.ts`, `CompleteIntake.jsx` |
| History / documents | `GET /horses/{id}/registration-requests`, `/documents` | requests with `Status, ManagerNote`; visible documents | `horseApi.ts`, `App.jsx` |
| Vet queue | `GET /vet/pending-initial-exams` | horse/request IDs, `DraftMedicalRecordID, DraftVetID` | `horseApi.ts`, `HorsesNeedingExam.jsx` |
| Exam create/read/update/sign | `GET, POST /horses/{id}/medical-records`, `PATCH /medical-records/{id}`, `POST /medical-records/{id}/sign` | `ExamType="Initial Exam", ExamDate?, WeightKg?, HeightCm?, Symptoms, Diagnosis, TreatmentPlan, Conclusion, HealthStatus, TrainingEligibility, RestrictionNote, FollowUpDate?` → record; sign `{}` | `horseApi.ts`, `VetExaminationForm.tsx` |
| Profile corrections | `POST /horses/{id}/profile-change-requests`, `GET /profile-change-requests?HorseID={id}`, `POST /profile-change-requests/{id}/approve` or `/reject` | create `Changes, Reason, EvidenceDocumentID?`; review `ReviewNote` → request with `ChangedFields, Status` | `horseApi.ts`, Owner/Manager correction pages |

Public signup ignores client roles; the backend grants only `HORSE_OWNER`. JWT/session logic lives exclusively in `apiClient.ts`; logout clears the local tokens (there is no logout/revoke endpoint). A refresh is shared by concurrent 401 responses and retried once. A 403 is shown as a permission error. Roles outside Owner/Manager/Vet can be normalized in lists and receive an explicit unsupported workspace screen at login.

| Part | Contents |
|---|---|
| [1–3](#1-general-conventions) | General conventions, error codes, horse registration status, roles and permissions |
| [4](#4-flow-1--horse-intake) | **Flow 1** – login, horses, documents, intake examination, profile changes, stalls |
| [5](#5-flow-2--training) | **Flow 2** – assessment, trainer assignment, training plans, training sessions, results, session reviews |
| [6](#6-flow-3--medical) | **Flow 3** – health reports, medical records, Training Lock, treatments, vaccinations, medical schedule |
| [7](#7-flow-4--care-and-nutrition) | **Flow 4** – diet plans, care tasks, inventory |
| [8](#8-notifications) | Notifications (bell) for each role |
| [9](#9-frontend-changes-flow-1) | What the frontend needs to change in the existing Flow 1 |
| [10](#10-frontend-for-flow-24) | Suggested frontend screens for Flow 2–4 |
| [12](#12-administration-club-manager) | **Administration** (Club Manager): accounts, roles, permission matrix, audit log, club, dashboard |

## 1. General conventions

| Item | Convention |
|---|---|
| Base URL | `http://localhost:8000/api` (the frontend calls `/api/...` through the Vite proxy) |
| Swagger | `http://127.0.0.1:8000/api/docs` to try every API in the browser; OpenAPI schema at `/api/schema` (import into Postman) |
| Trailing `/` | **None**: `/api/horses/5`, not `/api/horses/5/` |
| Format | JSON for both requests and responses |
| JSON key names | **Exactly the database column names**: `HorseID`, `HorseName`, `RegistrationStatus`... |
| Status values | **Exactly the values in the database**: `Draft`, `PendingExam`, `Approved`... |
| Date | `"2021-03-10"` |
| Date-time | `"2026-10-10T08:30:00"` (Vietnam time, no time zone) |
| Decimal numbers | Plain numbers: `"WeightKg": 480.5` |
| Time | `"06:00:00"` (sending `"06:00"` also works) |
| List filtering | Query string by column name: `?HorseID=5&Status=Pending`; on / off flags use `=1` (`?mine=1`, `?open=1`) |
| Login | Header `Authorization: Bearer <access>` for every API (except `auth/login`, `auth/register`, `auth/google`, `clubs`, `health`) |
| Language | Messages (error `detail`, field errors, notification titles) are **Vietnamese by default**. Send header `X-Language: en` (or `?lang=en`) to get **English**. The response header `Content-Language` says which one was used. `code`, JSON keys and status values never change. Messages without a translation stay Vietnamese (add them to `apps/core/i18n.py`) |

### Error codes

| HTTP | When | Body shape |
|---|---|---|
| 400 | Invalid / missing data (including invalid filter parameters, e.g. `?HorseID=abc`) | `{"HorseName": ["This field is required."], "Gender": ["\"Unknown\" is not a valid choice."]}` |
| 401 | Not logged in, token expired, wrong password | `{"detail": "...", "code": "..."}` |
| 403 | Role lacks permission | `{"detail": "You do not have permission to perform this action.", "code": "PERMISSION_DENIED"}` |
| 404 | Does not exist **or is not visible** (horse of another club, horse of another owner) | `{"detail": "...", "code": "NOT_FOUND"}` |
| 409 | Business rule violation | `{"detail": "The horse does not have a signed intake examination record.", "code": "INITIAL_EXAM_REQUIRED"}` |

The frontend shows `detail` to the user; use `code` when special handling is needed.

Errors coming from the database itself are also specific (the backend usually catches them earlier):

| `code` | When | Example `detail` |
|---|---|---|
| name of the CHECK constraint, e.g. `CK_Horse_Gender` | a value breaks a CHECK rule in `horse_v2.sql` | "Giới tính ngựa phải là Male (đực), Female (cái) hoặc Gelding (đực đã thiến)." |
| `REQUIRED_VALUE_MISSING` | a required column would be NULL | "Thiếu dữ liệu bắt buộc: câu lạc bộ (ClubID) (bảng Horse) không được để trống." |
| `RELATED_NOT_FOUND` / `IN_USE` | foreign key: the referenced row does not exist / the row is still used elsewhere | "Không tìm thấy dữ liệu liên quan: Owner không tồn tại (FK_Horse_Owner)." |
| unique index name, or `DUPLICATE` | duplicate value | "Số microchip đã tồn tại ở một ngựa khác." |
| `VALUE_TOO_LONG` | text longer than the column allows | "Tên ngựa quá dài so với giới hạn của database." |

409 error `code`s (common and Flow 1; codes specific to Flow 2–4 are listed in each part):

| code | Meaning |
|---|---|
| `INVALID_STATUS` | Action not valid for the current status (e.g. editing a submitted profile) |
| `MISSING_FIELDS` | Submitting a profile / signing a medical record before all fields are filled in (`detail` lists the missing column names) |
| `INITIAL_EXAM_REQUIRED` | Approving a profile before the Vet has signed the intake examination record |
| `INITIAL_EXAM_FAILED` | Intake examination did not pass → can only reject |
| `USER_NO_CLUB` | The Manager's account has no club (`ClubID` is empty), so it cannot create horses. Fix the account, e.g. run `seed_demo` again |
| `DUPLICATE_HORSE_CODE` | Horse code already exists in the club |
| `STALL_NOT_FOUND`, `STALL_NOT_AVAILABLE` | Stall does not belong to the club / is no longer available |
| `INITIAL_EXAM_EXISTS` | This submission already has an intake examination record (it may be another Vet's draft) |
| `RECORD_SIGNED` | Medical record is signed and cannot be edited / deleted |
| `NOT_RECORD_OWNER` | Only the Vet who created the record can edit / sign a draft record |
| `EXAM_TYPE_LOCKED` | Cannot change the exam type of an existing record |
| `RECORD_NOT_SIGNED` | Draft records are edited directly, not through an amendment |
| `PENDING_REQUEST_EXISTS` | The horse already has 1 pending profile change request |
| `FIELD_NOT_EDITABLE` | Requested change to a field that is not allowed |
| `REVIEW_NOTE_REQUIRED` | Rejecting / returning without a reason (profile change request, training plan) |
| `HORSE_NOT_APPROVED` | Flow 2–4 action on a horse that has not been taken in (not yet `Approved`) |
| `DUPLICATE_STALL`, `STALL_OCCUPIED` | Duplicate stall number / stall currently has a horse |
| `TRAINING_LOCK_FULL`, `TRAINING_LOCK_RESTRICTED` | Horse is under a training lock (see Flow 3). The SQL Server trigger returns the same code |
| `UX_...`, `UQ_...`, `DB_INTEGRITY` | Unique index / database constraint violation (translated into Vietnamese) |

## 2. Horse registration status (`RegistrationStatus`)

```
Draft ──submit──> Submitted ──verify──> PendingExam ──(Vet signs exam)──> approve ──> Approved ──archive──> Archived
  ^                   │                      │
  └──── edit ──── Rejected <──── reject ──────┘
```

| Value | Meaning | Who does what next |
|---|---|---|
| `Draft` | Draft | Owner / Manager edits, submits |
| `Submitted` | Submitted | Manager verifies or rejects |
| `PendingExam` + `InitialExamSigned: false` | Waiting for the Vet's intake examination | On-duty Vet examines; Manager can reject |
| `PendingExam` + `InitialExamSigned: true` | Vet has signed the exam (the old screen calls this `PENDING_COMPLETION`) | Manager approves (if passed) or rejects |
| `Approved` | Taken in, has a `HorseCode` | Owner requests profile changes; Manager archives |
| `Rejected` | Rejected (reason in `RegistrationRequest.ManagerNote`) | Owner / Manager edits and resubmits |
| `Archived` | Has left the club | View only |

When resubmitting after `Rejected`, the backend creates a new `RegistrationRequest` and **the Vet must examine again**
(`InitialExamSigned` goes back to `false`).

`CurrentHealthStatus`: `Unknown`, `Healthy`, `Monitor`, `Injured`, `Recovering`, `Isolated`.
`Gender`: `Male`, `Female`, `Gelding`. `SexClass` (computed by the backend): `Foal` (< 1 year old), `Colt`/`Filly` (< 4 years old), `Stallion`/`Mare`, `Gelding`.

## 3. Roles and permissions

Login returns `Roles` and `Permissions`. The frontend uses `Permissions` to hide / show buttons.

| Role (`RoleCode`) | Permissions | Main tasks |
|---|---|---|
| `CLUB_MANAGER` | `CLUB_MANAGE`, `RBAC_MANAGE`, `AUDIT_VIEW`, `HORSE_VIEW`, `HORSE_REGISTER_REVIEW`, `HORSE_ARCHIVE`, `PROFILE_EDIT_APPROVE`, `INVENTORY_MANAGE` | Approve horse profiles, stalls, accounts, **vet duty roster**, **Groom in charge of each horse**, inventory |
| `HEAD_TRAINER` | `HORSE_VIEW`, `HORSE_ASSESS`, `TRAINER_ASSIGN`, `TRAINING_PLAN_APPROVE`, `TRAINING_SESSION_SUPERVISE`, `HEALTH_REPORT`, `DIET_MANAGE`, `INVENTORY_REQUEST` | Assess horses, assign the trainer **and the main work rider**, approve training plans, choose substitute supervisors (does **not** schedule daily sessions), write and finalize diet plans, set the club-wide care rules |
| `TRAINER` | `HORSE_VIEW`, `TRAINING_PLAN_MANAGE`, `TRAINING_SESSION_ASSIGN`, `TRAINING_SESSION_SUPERVISE`, `TRAINING_REVIEW`, `HEALTH_REPORT` | Write training plans, schedule sessions **for the horses they are in charge of** (main work rider filled in), supervise (including as Substitute: may change rider / time of that session), review training sessions, close plan stages, training-related care tasks for Grooms |
| `WORK_RIDER` | `HORSE_VIEW`, `TRAINING_RESULT_UPDATE`, `HEALTH_REPORT` | Start training sessions, record results |
| `VETERINARIAN` | `HORSE_VIEW`, `MEDICAL_MANAGE`, `MEDICAL_SIGN`, `TRAINING_LOCK_MANAGE`, `DIET_MANAGE`, `INVENTORY_REQUEST` | Examinations (on-duty vet is alerted first), signing records, Training Lock, treatments, vaccinations, commenting on diet plans (approving them only for sick / locked horses), medical care tasks for Grooms, supply requests |
| `GROOM` | `HORSE_VIEW`, `CARE_MANAGE`, `HEALTH_REPORT`, `INVENTORY_REQUEST` | Care tasks (feeding: records eaten all / part / refused), reporting incidents, requesting inventory items |
| `HORSE_OWNER` | `HORSE_REGISTER`, `PROFILE_EDIT_REQUEST`, `OWNER_VIEW` | Register horses, request profile changes, view own horses and their training results (section 5.7) |

Data scope: staff only see data **within their own club**; horse owners only see **their own horses**
(health summary and training results reviewed by the trainer – section 5.7; not medical records or internal notes).

## 4. Flow 1 – Horse intake

### 4.1 Login, users

| Method | URL | Used by | Body / parameters |
|---|---|---|---|
| GET | `/health` | no login required | → `{"backend": "UP", "database": "UP"}` (503 if the DB fails) |
| POST | `/auth/login` | everyone | `{"Email", "Password"}` → `{access, refresh, User}` |
| POST | `/auth/register` | no login required | Horse owner signs up: `{"FullName", "Email", "Phone", "Address", "Password" (min 6), "ClubID"}` → **201** `{access, refresh, User}` (logged in right away). Role is always `HORSE_OWNER`; max 20 sign-ups per hour per IP |
| POST | `/auth/google` | no login required | Sign in with Google: `{"Credential": "<Google ID token>"}` → existing email: `{access, refresh, User}`; unknown email: `{"SignupRequired": true, "Email", "FullName"}`. Send again with `"Phone", "Address", "ClubID"` (and optional `"FullName"`) to create a **horse owner** account → **201** `{access, refresh, User}`. Needs `GOOGLE_CLIENT_ID` in `.env` (otherwise 409 `GOOGLE_LOGIN_DISABLED`) |
| POST | `/auth/refresh` | everyone | `{"refresh"}` → `{access}` |
| GET | `/auth/me` | logged in | → `User` with `Roles`, `Permissions` |
| PATCH | `/auth/me` | logged in | edit own profile `{"FullName"?, "Phone"?, "Address"?}` (email cannot change) |
| POST | `/auth/change-password` | logged in | `{"CurrentPassword", "NewPassword" (min 6)}` → new `{access, refresh, User}`; **all old tokens stop working**. Google accounts without a password may omit `CurrentPassword` the first time |
| POST | `/auth/password-reset` | no login required | forgot password: `{"Email"}` → always 200; if the account exists an email with a link `<FRONTEND_URL>/reset-password?uid=...&token=...` (valid 1 hour) is sent. Max 10 per hour per IP |
| POST | `/auth/password-reset/confirm` | no login required | `{"Uid", "Token", "NewPassword"}` (values from the link) → 200; wrong / expired / already used link → 400 `Token` |
| GET | `/users?RoleCode=&Status=&Search=` | Manager, Head Trainer, Trainer | users in the club (`Search`: name / email / phone) (`RoleCode` = `TRAINER`, `WORK_RIDER`, `GROOM`... to pick people for assignments). A Trainer only gets `WORK_RIDER` / `TRAINER` / `HEAD_TRAINER` (other `RoleCode` → 403) |
| POST | `/users` | Manager | `{"FullName", "Email", "Phone", "Address", "RoleCode"? (default HORSE_OWNER), "Password"?}`; `Phone` = 10 digits starting with 0 or `+84` + 9 digits |
| GET | `/users/{UserID}` | self / Manager of the same club | |
| PATCH | `/users/{UserID}` | Manager | `{"FullName"?, "Phone"?, "Address"?}` – more account actions in section 12 |
| GET | `/clubs` | no login required | Active clubs (picked on the sign-up form and when an Owner registers a horse) |

If `POST /users` is sent without `Password`, the backend generates a temporary password and returns `TemporaryPassword` **only once**.

Example `POST /auth/login`:

```json
{
  "access": "eyJhbGciOi...",
  "refresh": "eyJhbGciOi...",
  "User": {
    "UserID": 7, "ClubID": 1, "FullName": "Demo Horse Owner", "Email": "owner@equi.local",
    "Phone": null, "Address": null, "Status": "Active", "CreatedAt": "2026-10-10T08:00:00",
    "Roles": ["HORSE_OWNER"],
    "Permissions": ["HORSE_REGISTER", "OWNER_VIEW", "PROFILE_EDIT_REQUEST"]
  }
}
```

`access` expires after 60 minutes, `refresh` after 7 days (change in `.env`).

### 4.2 Horses

| Method | URL | Used by | Notes |
|---|---|---|---|
| GET | `/horses?RegistrationStatus=&OwnerID=&search=` | all roles | `search` matches name, code, microchip |
| GET | `/horses/{HorseID}` | all roles | includes `HealthSummary` |
| POST | `/horses` | Owner, Manager | creates a `Draft` |
| PATCH | `/horses/{HorseID}` | Owner (own horse), Manager | only when `Draft` / `Rejected`; send the fields to change |
| POST | `/horses/{HorseID}/submit` | Owner, Manager | `Draft`/`Rejected` → `Submitted` |
| POST | `/horses/{HorseID}/verify` | Manager | `Submitted` → `PendingExam` |
| POST | `/horses/{HorseID}/reject` | Manager | `{"Reason"}`; `Submitted`/`PendingExam` → `Rejected` |
| POST | `/horses/{HorseID}/approve` | Manager | `{"HorseCode", "StallID"?, "GroomID"?, "ManagerNote"?}`; `PendingExam` → `Approved`. `GroomID` = Groom in charge of the horse (Flow 4) |
| POST | `/horses/{HorseID}/archive` | Manager | `{"Reason"}`; `Approved` → `Archived` |
| GET | `/horses/{HorseID}/registration-requests` | can view the horse | history of submissions, rejection reasons |
| GET | `/horses/{HorseID}/audit-logs` | Manager | action history |
| GET | `/stalls?Status=Available` | Manager, staff | pick a stall when approving (see also section 4.6) |

Body of `POST /horses`:

```json
{
  "HorseName": "Thunder", "Breed": "Thoroughbred", "DateOfBirth": "2021-03-10",
  "CoatColor": "Bay", "Gender": "Male", "SireName": "Storm King", "DamName": "Lady Rain",
  "MicrochipNumber": "985000000000001", "PassportNumber": "VN-001",
  "ClubID": 1
}
```

**All profile fields are required** (no `null` / empty string), on `POST /horses` and when changed with `PATCH`
or a profile change request. A 400 error names the exact field and the reason:

| Field | Rule | Example error (`detail` in Vietnamese) |
|---|---|---|
| `HorseName`, `Breed`, `CoatColor`, `SireName`, `DamName` | not empty | `{"Breed": ["Cần nhập giống ngựa (Breed)."]}` |
| `DateOfBirth` | `YYYY-MM-DD`, not in the future, not older than 40 years | `{"DateOfBirth": ["Ngày sinh không được ở tương lai."]}` |
| `Gender` | `Male`, `Female` or `Gelding` | `{"Gender": ["Giới tính phải là Male (đực), Female (cái) hoặc Gelding (đực đã thiến)."]}` |
| `MicrochipNumber` | exactly **15 digits** (ISO 11784/11785; the first 3 digits are the country or manufacturer code), spaces are removed; unique | `{"MicrochipNumber": ["Số microchip phải gồm đúng 15 chữ số ..."]}` |
| `PassportNumber` | letters, digits, `-` or `/`, 5–50 characters, saved in upper case; unique | `{"PassportNumber": ["Số hộ chiếu / đăng ký đã được dùng cho một ngựa khác."]}` |
| `SireName`, `DamName` | different from the horse's own name and from each other | `{"SireName": ["Tên ngựa cha không được trùng tên chính con ngựa này."]}` |

- **Owner registers themselves**: send `ClubID`; `OwnerID` = themselves.
- **Manager enters on the owner's behalf**: send `OwnerID` (a `HORSE_OWNER` account); `ClubID` = the Manager's club.

Returned horse (`GET /horses/1`):

```json
{
  "HorseID": 1, "ClubID": 1, "OwnerID": 5,
  "HorseName": "Thunder", "Breed": "Thoroughbred", "DateOfBirth": "2021-03-10", "CoatColor": "Bay",
  "Gender": "Male", "SireName": "Storm King", "DamName": "Lady Rain",
  "MicrochipNumber": "985000000000001", "PassportNumber": "VN-001",
  "HorseCode": "EQ-001", "VerifiedBy": 1, "VerifiedAt": "2026-10-10T09:00:00",
  "RegistrationStatus": "Approved", "CurrentHealthStatus": "Healthy",
  "ArchivedAt": null, "ArchivedBy": null, "ArchiveReason": null,
  "CreatedAt": "2026-10-10T08:00:00", "UpdatedAt": "2026-10-10T10:00:00",
  "SexClass": "Stallion",
  "InitialExamSigned": true,
  "Owner": {"UserID": 5, "FullName": "Hoàng Gia Huy", "Email": "owner@equi.local", "Phone": "0918034567",
            "Address": "86 Nguyễn Văn Trỗi, Phường 8, Quận Phú Nhuận, TP. Hồ Chí Minh"},
  "CurrentStall": {"StallID": 1, "StallNumber": "A01", "StartDate": "2026-10-10"},
  "HealthSummary": {
    "MedicalRecordID": 1, "ExamDate": "2026-10-10T09:30:00", "ExamType": "Initial Exam",
    "HealthStatus": "Healthy", "TrainingEligibility": "Eligible",
    "Conclusion": "Eligible for intake", "RestrictionNote": null, "FollowUpDate": null
  }
}
```

`GET /horses` returns an array of horses in the same shape but **without** `HealthSummary`.
Every action API (`submit`, `verify`, `approve`...) returns the horse after the update; the frontend can use it directly to redraw the screen.

Approval conditions (`approve`): the Vet has signed the intake examination record for the current submission,
`HealthStatus` is `Healthy` or `Monitor`, and `TrainingEligibility` is not `Not Eligible`.

### 4.3 Documents

| Method | URL | Used by | Notes |
|---|---|---|---|
| GET | `/horses/{HorseID}/documents` | can view the horse | Owner only sees documents with `IsVisibleToOwner: true` |
| POST | `/horses/{HorseID}/documents` | Owner (own horse), Manager | **Upload a file**: `multipart/form-data` with `File` (PDF / JPG / PNG / WEBP, max `UPLOAD_MAX_MB` = 10 MB), `DocumentType`, `DocumentName`? (default = file name), `IsVisibleToOwner`? (Manager only). Or JSON link: `{"DocumentName", "DocumentType", "FileUrl", "IsVisibleToOwner"?}`. Response has `IsUploadedFile`; for uploads `FileUrl` = `/api/horse-documents/{DocumentID}/file` |
| GET | `/horse-documents/{DocumentID}/file` | can view the horse | File content (needs the `Authorization` header, so the FE downloads it with `fetch` then opens a blob URL). `?download=1` = save as attachment |
| DELETE | `/horse-documents/{DocumentID}` | Owner (own upload, horse in Draft / Rejected), Manager | **204**. 409 `INVALID_STATUS` after submit (owner), 409 `DOCUMENT_IN_USE` if it is evidence of a profile change request |

`DocumentType`: `Passport`, `Microchip Certificate`, `Ownership Proof`, `Handover Record`, `Contract`, `Other`.
Uploaded files are stored on the backend server (`MEDIA_ROOT`, default `backend/media/`, never committed). A JSON link (`FileUrl`, e.g. a Google Drive link) is still accepted for files kept elsewhere.

### 4.4 Examinations (Vet)

| Method | URL | Used by | Notes |
|---|---|---|---|
| GET | `/vet/pending-initial-exams` | Vet | `PendingExam` horses in the club without a signed intake examination record |
| GET | `/horses/{HorseID}/medical-records` | club staff | The Vet also sees draft records; others only see signed records. Owners view `HealthSummary` |
| POST | `/horses/{HorseID}/medical-records` | Vet | creates a draft record |
| GET | `/medical-records/{MedicalRecordID}` | club staff | |
| PATCH | `/medical-records/{MedicalRecordID}` | Vet who created the record | while still `Draft` |
| DELETE | `/medical-records/{MedicalRecordID}` | Vet who created the record | while still `Draft` |
| POST | `/medical-records/{MedicalRecordID}/sign` | Vet who created the record | signs the record (`Signed`), updates `Horse.CurrentHealthStatus` |
| GET | `/medical-records/{MedicalRecordID}/amendments` | club staff | |
| POST | `/medical-records/{MedicalRecordID}/amendments` | Vet | `{"Reason", "AmendedContent"}`; only for signed records |

Vets examine **on duty**: no Vet is assigned in advance; any Vet in the club can pick up a horse from the queue.
Each submission has only **one** intake examination record; a non-`null` `DraftMedicalRecordID` means a Vet has an examination in progress.

Body for creating a record:

```json
{
  "ExamType": "Initial Exam",
  "WeightKg": 480.5, "HeightCm": 162.0,
  "Symptoms": "No abnormal signs",
  "Diagnosis": "Normal",
  "Conclusion": "Eligible for intake",
  "TreatmentPlan": null,
  "HealthStatus": "Healthy",
  "TrainingEligibility": "Eligible",
  "RestrictionNote": null,
  "FollowUpDate": null,
  "Note": "Purpose of exam: intake into the club"
}
```

- `ExamType`: `Initial Exam` (only when `PendingExam`), `Routine Exam`, `Injury Exam`, `Follow-up`, `Emergency` (only when the horse is `Approved`).
- Leaving `ExamDate` empty = the current time.
- When signing, `HealthStatus` and `TrainingEligibility` are required; if `Restricted`, `RestrictionNote` is required.
- Record `HealthStatus`: `Healthy`, `Monitor`, `Injured`, `Recovering`, `Isolated`.
- `TrainingEligibility`: `Eligible`, `Restricted`, `Not Eligible`.

Returned record:

```json
{
  "MedicalRecordID": 1, "HorseID": 1, "HorseName": "Thunder", "VetID": 2, "VetName": "Demo Veterinarian",
  "RegistrationRequestID": 1, "TrainingSessionID": null,
  "ExamType": "Initial Exam", "ExamDate": "2026-10-10T09:30:00",
  "WeightKg": 480.5, "HeightCm": 162.0,
  "Symptoms": "No abnormal signs", "Diagnosis": "Normal", "Conclusion": "Eligible for intake",
  "InjuryLocation": null, "TreatmentPlan": null,
  "HealthStatus": "Healthy", "TrainingEligibility": "Eligible", "RestrictionNote": null,
  "FollowUpDate": null, "Note": null,
  "RecordStatus": "Signed", "SignedAt": "2026-10-10T09:45:00"
}
```

### 4.5 Profile change requests (after `Approved`)

| Method | URL | Used by | Notes |
|---|---|---|---|
| POST | `/horses/{HorseID}/profile-change-requests` | The horse's Owner | `{"Changes": {"CoatColor": "Dark Bay"}, "Reason", "EvidenceDocumentID"?}` |
| GET | `/profile-change-requests?Status=Pending&HorseID=` | Manager (own club), Owner (own requests) | |
| GET | `/profile-change-requests/{id}` | same as above | |
| POST | `/profile-change-requests/{id}/approve` | Manager | `{"ReviewNote"?}`; the backend applies the changes to the horse |
| POST | `/profile-change-requests/{id}/reject` | Manager | `{"ReviewNote"}` required |

Fields that can be requested for change: `HorseName`, `Breed`, `DateOfBirth`, `CoatColor`, `Gender`, `SireName`, `DamName`, `MicrochipNumber`, `PassportNumber`.
Each horse can have only 1 `Pending` request at a time.

```json
{
  "ProfileChangeRequestID": 1, "HorseID": 1, "HorseName": "Thunder",
  "RequestedBy": 5, "RequestedAt": "2026-10-11T08:00:00",
  "ChangedFields": {
    "Reason": "Coat color changed with age",
    "Changes": [{"Field": "CoatColor", "OldValue": "Bay", "NewValue": "Dark Bay"}]
  },
  "EvidenceDocumentID": 1, "Status": "Pending",
  "ReviewedBy": null, "ReviewedAt": null, "ReviewNote": null
}
```

### 4.6 Stalls

| Method | URL | Used by | Notes |
|---|---|---|---|
| GET | `/stalls?Status=` | Manager, staff | includes `CurrentHorse` (the horse currently in the stall) |
| POST | `/stalls` | Manager | `{"StallNumber": "A05", "StallType": "Standard"}` |
| PATCH | `/stalls/{StallID}` | Manager | `{"StallType"?, "Status": "Maintenance" \| "Available"}`; a stall that currently has a horse cannot change status (`STALL_OCCUPIED`) |
| POST | `/horses/{HorseID}/move-stall` | Manager | `{"StallID": 3}` – move stall (the old stall automatically returns to `Available`) |

`Status = Occupied` is set automatically by the backend when a horse is placed in a stall; the frontend does not send this value.

```json
{"StallID": 1, "ClubID": 1, "StallNumber": "A01", "StallType": "Standard", "Status": "Occupied",
 "CurrentHorse": {"HorseID": 1, "HorseName": "Thunder", "StartDate": "2026-10-10"}}
```

Archiving a horse (`POST /horses/{id}/archive`) now also: ends the trainer assignment (unfinished training plans → `Cancelled`,
`Assigned` training sessions → `Cancelled`), pending care tasks → `Skipped`, active diet plans → `Expired`.

### 4.7 Vet duty roster

The Club Manager schedules which vet is on duty. The on-duty vet is alerted first (email + `High` notification) when a
horse is verified and waits for its intake exam, and when an **urgent** health report arrives (6.1). Other vets still see
the queues and can take a case. Nobody on duty → every active vet of the club is alerted, and the Manager sees
`VET_DUTY_MISSING` (today / tomorrow without any shift).

Shifts: `Morning` 06:00–14:00, `Afternoon` 14:00–22:00, `Night` 22:00–06:00 next day, `Full Day`.

| Method | URL | Used by | Notes |
|---|---|---|---|
| GET | `/vet-duty-shifts?From=&To=&VetID=` | Manager, Vet | default: 7 days from today; each row has `IsOnDutyNow` |
| POST | `/vet-duty-shifts` | Manager | `{"VetID", "DutyDate", "Shift", "Note"?}`; past date → 409 `PAST_DATE`, same vet / day / shift → 409 `ALREADY_EXISTS` |
| DELETE | `/vet-duty-shifts/{VetDutyShiftID}` | Manager | **204**; shifts in the past are kept as history (`PAST_DATE`) |
| GET | `/vet-duty-shifts/now` | staff | shifts covering the current time (`[]` = nobody on duty) |

Database: on an existing database run `sql/migrations/20261031_flow1_vet_duty.sql` (table `VetDutyShift`).

## 5. Flow 2 – Training

```
Head Trainer assesses the horse ──> assigns 1 responsible Trainer ──> Trainer drafts the training plan ──> Head Trainer approves
──> responsible Trainer schedules training sessions (Work Rider, Substitute Trainer if needed; Head Trainer can do it for any horse)
──> Work Rider starts, records the result ──> (Substitute records an observation) ──> responsible Trainer reviews
──> if adjustment is needed, create a new training plan version
──> at the end of each stage the Trainer closes the stage ──> the horse owner receives the stage summary (5.7)
```

Only `Approved` horses can enter training. All Flow 2 APIs require the `HORSE_VIEW` permission to view (club staff).

### 5.1 Specializations, Trainers, trainer profile

| Method | URL | Used by | Notes |
|---|---|---|---|
| GET | `/specializations` | everyone | `Flat Racing`, `Steeplechase / Hurdle Racing`, `Harness Racing`, `Endurance / Long-distance Racing`, `Other` |
| GET | `/trainers?SpecializationID=` | Head Trainer, Manager | trainers in the club: specializations, **profile** (see table below) and number of horses currently assigned |
| GET | `/trainers?HorseID=` | Head Trainer, Manager | **trainer suggestions for a horse** (see below): suitable trainers first |
| GET | `/trainers/{UserID}` | Head Trainer, Manager, the trainer themself | same fields + `ActiveHorses`, `Credentials`, `RecentRaceResults` (last 10) |
| PATCH | `/trainers/{UserID}/profile` | Head Trainer, Manager | `{"CareerStartDate"?, "TrainerRating"?}` |
| GET / POST | `/trainers/{UserID}/credentials` | view: as above · add: Head Trainer, Manager | degrees, certificates, licences, awards |
| DELETE | `/trainer-credentials/{CredentialID}` | Head Trainer, Manager | |
| GET / POST | `/trainers/{UserID}/race-results?From=&To=` | view: as above · add: Head Trainer, Manager | each time a horse prepared by the trainer ran a race |
| DELETE | `/trainer-race-results/{RaceResultID}` | Head Trainer, Manager | remove a wrong entry |
| POST | `/trainers/{UserID}/specializations` | Head Trainer, Manager | `{"SpecializationID": 1}` – assign a specialization to a trainer |
| DELETE | `/trainers/{UserID}/specializations/{SpecializationID}` | Head Trainer, Manager | cannot be deleted if already used in a trainer assignment (`IN_USE`) |

```json
[{"UserID": 4, "FullName": "Phạm Quốc Bảo", "Email": "trainer@equi.local", "Phone": "0938452116",
  "Specializations": [{"SpecializationID": 1, "SpecializationName": "Flat Racing"}],
  "CareerStartDate": "2013-06-01", "YearsOfExperience": 13, "ExperienceLevel": "Expert", "ExperienceLevelName": "Chuyên gia",
  "Seniority": 12, "SenioritySince": "2014-03-10", "QualificationCount": 2, "AwardCount": 2,
  "CareerStarts": 240, "CareerWins": 58, "CareerWinRate": 24.2, "RecentStarts": 40, "RecentWins": 9,
  "WinRate": 22.5, "PlaceRate": 45.0, "WinRateNote": null, "TrainerRating": 4.6, "ActiveHorseCount": 2, "HasProfile": true}]
```

Every number is **computed** from what is recorded, nothing is typed in by hand:

| Field | How it is computed |
|---|---|
| `YearsOfExperience` | full years since `CareerStartDate` (the day the trainer started the profession) – grows by itself every year |
| `ExperienceLevel` | from `YearsOfExperience`: 0–2 `Junior`, 3–5 `Intermediate`, 6–10 `Senior`, more than 10 `Expert` (`ExperienceLevelName` = Vietnamese name) |
| `Seniority` | **proven** professional seniority: full years since the earliest `Degree` / `Certificate` / `License` (`SenioritySince`); `null` if none recorded. `QualificationCount`, `AwardCount` = number of those papers / awards |
| `WinRate` | like the "strike rate" used in racing: wins / starts in the **last 12 months** (`RecentWins` / `RecentStarts`), %. `null` with `WinRateNote` when there are fewer than **10** starts in 12 months (too few to be meaningful) |
| `PlaceRate` | finishes in the top 3 / starts in the last 12 months (same 10-start rule) |
| `CareerStarts`, `CareerWins`, `CareerWinRate` | the whole career (all race results) |
| `TrainerRating` | 0–5 (1 decimal) given by the Head Trainer / Manager, `null` = not rated |
| `HasProfile` | `false` = profile not entered yet |

Example on screen: *Phạm Quốc Bảo – Flat Racing – Kinh nghiệm: 13 năm – Cấp độ: Expert – Đang phụ trách: 2 ngựa*.

Credential body: `{"CredentialType": "Degree" | "Certificate" | "License" | "Award", "Title", "IssuedBy"?, "IssuedDate",
"ExpiryDate"?, "FileUrl"? (link to the scanned paper), "Note"?}`. An award does not count towards `Seniority`.

Race result body: `{"RaceDate", "RaceName", "RaceClass"? ("Group 1", "Group 2", "Group 3", "Listed", "Handicap",
"Maiden", "Other"), "HorseID"? (horse of the club) or "HorseName" (horse from outside), "FinishPosition", "FieldSize", "Note"?}`;
`FinishPosition` must be between 1 and `FieldSize` (at least 2 horses), the date cannot be in the future.

**Trainer suggestions** `GET /trainers?HorseID=5` use the horse's latest `Recommended` assessment (5.2):

- trainers with the recommended specialization come first;
- then higher `TrainerRating`, then more experience (`ExperienceLevel`, `YearsOfExperience`),
  then fewer horses currently in charge (spreads the work);
- each row gets `IsSuggested`, `MatchesSpecialization` and `SuggestionReason` (Vietnamese sentence to show).

The trainer must have a specialization (`TrainerSpecialization`) matching the specialization of the assignment (a foreign key constraint in SQL).

### 5.2 Horse assessment

| Method | URL | Used by | Notes |
|---|---|---|---|
| GET | `/horses/{HorseID}/assessments` | staff | newest first |
| POST | `/horses/{HorseID}/assessments` | Head Trainer | `{"SpecializationID", "QualityScore"? (0–100), "FitnessLevel"?, "AssessmentNote"?, "DecisionStatus"?}` |

- `FitnessLevel`: `Excellent`, `Good`, `Average`, `Needs Monitoring`.
- `DecisionStatus`: `Recommended` (default, suitable) or `Rejected` (not suitable). A new `Recommended` assessment
  moves older `Recommended` assessments **of the same specialization** to `Superseded`.

### 5.3 Trainer assignment

| Method | URL | Used by | Notes |
|---|---|---|---|
| GET | `/trainer-assignments?HorseID=&TrainerID=&Status=Active&mine=1` | staff | `mine=1`: a trainer sees the horses assigned to them |
| GET | `/trainer-assignments/{id}` | staff | |
| POST | `/trainer-assignments` | Head Trainer | `{"HorseID", "TrainerID", "SpecializationID", "AssessmentID"?, "StartDate"?, "AssignmentNote"?}` |
| POST | `/trainer-assignments/{id}/end` | Head Trainer | `{"Reason"?}` – ends the assignment; unfinished training plans and `Assigned` training sessions are cancelled |

Each horse has only **1** `Active` responsible trainer (`ALREADY_ASSIGNED` if one exists; to change, `end` it and then assign a new one).

```json
{"TrainerHorseAssignmentID": 1, "HorseID": 1, "HorseName": "Thunder", "TrainerID": 4, "TrainerName": "Demo Trainer",
 "SpecializationID": 1, "SpecializationName": "Flat Racing", "AssignedByHeadTrainerID": 2, "AssignedByName": "Demo Head Trainer",
 "AssessmentID": 1, "StartDate": "2026-10-10", "EndDate": null, "Status": "Active", "AssignmentNote": null}
```

`POST /trainer-assignments` accepts `"WorkRiderID"?` = the horse's **main work rider** (5.4) and returns
`TrainerExperienceLevel`, `MainWorkRiderID`, `MainWorkRiderName` and `DraftTrainingPlanID`: the `Draft` training plan created automatically from the specialization's template (5.5.1),
or `null` when that template is switched off.

### 5.4 Main work rider, backup riders, work rider specializations

The Head Trainer chooses one **main work rider** per horse (when assigning the trainer, or later). It is stored as the
active `HorseWorkRiderPreference` with `Priority = 1`; only the Head Trainer can change it. Backup riders have
`Priority >= 2`. When the trainer schedules a session without `WorkRiderID`, the main work rider is filled in (5.6).
Work Riders also have specializations (riding flat, jumping, driving a harness cart and long-distance riding are
different skills); riders with the horse's specialization are suggested first.

| Method | URL | Used by | Notes |
|---|---|---|---|
| GET | `/horses/{HorseID}/main-work-rider` | staff | the main work rider preference (`null` if none) |
| PUT | `/horses/{HorseID}/main-work-rider` | Head Trainer | `{"WorkRiderID", "Note"?}`; the previous main rider ends; sessions already scheduled keep their rider |
| GET | `/horses/{HorseID}/work-rider-preferences?all=1` | staff | by default returns only preferences still in effect |
| POST | `/horses/{HorseID}/work-rider-preferences` | Head Trainer | backup rider `{"WorkRiderID", "Priority"? (>= 2, default 2), "Note"?}` |
| POST | `/work-rider-preferences/{PreferenceID}/end` | Head Trainer | |
| GET | `/work-riders?HorseID=&Date=&StartTime=&EndTime=&DurationPlannedMinutes=&ExcludeSessionID=` | Trainer, Head Trainer, Manager | riders to pick for a session: main rider first, then matching specialization, then free at that time. Each row: `IsMainRider`, `MatchesSpecialization`, `IsBusy`, `BusyWithSessionID`, `Specializations`. Without `HorseID`: all riders with their specializations |
| POST | `/work-riders/{UserID}/specializations` | Head Trainer, Manager | `{"SpecializationID"}` (`ALREADY_EXISTS`) |
| DELETE | `/work-riders/{UserID}/specializations/{SpecializationID}` | Head Trainer, Manager | **204** |

Database: on an existing database run `sql/migrations/20261031_flow2_main_rider.sql` (table `WorkRiderSpecialization`,
and the Head Trainer loses `TRAINING_SESSION_ASSIGN`).

### 5.5 Training plans

```
Draft ──submit──> Pending Approval ──approve──> Active ──complete──> Completed
  ^                      │ return (ReviewNote required)
  └──────────────────────┘
Draft / Pending Approval / Active ──cancel──> Cancelled
Active ──revise──> new Draft version; when the new version is approved, the old one becomes Completed automatically
```

| Method | URL | Used by | Notes |
|---|---|---|---|
| GET | `/training-plans?HorseID=&TrainerID=&Status=&mine=1` | staff | `Status=Pending Approval` for the Head Trainer's approval screen |
| GET | `/training-plans/{id}` | staff | includes `Stages` |
| POST | `/training-plans` | responsible Trainer | creates a `Draft`, can send `Stages` at the same time |
| PATCH | `/training-plans/{id}` | responsible Trainer | only when `Draft`; `Goal`, `StartDate`, `EndDate`, `OverallIntensity`, `Note` |
| POST | `/training-plans/{id}/stages` | responsible Trainer | add a stage (when `Draft`) |
| PATCH / DELETE | `/training-plan-stages/{TrainingPlanStageID}` | responsible Trainer | when `Draft` |
| POST | `/training-plans/{id}/submit` | responsible Trainer | requires at least 1 stage (`NO_STAGES`) |
| POST | `/training-plans/{id}/approve` | Head Trainer | `{"ReviewNote"?}` → `Active` |
| POST | `/training-plans/{id}/return` | Head Trainer | `{"ReviewNote"}` → back to `Draft` |
| POST | `/training-plans/{id}/complete` | responsible Trainer, Head Trainer | remaining `Assigned` sessions are cancelled |
| POST | `/training-plans/{id}/cancel` | responsible Trainer, Head Trainer | `{"Reason"?}` |
| POST | `/training-plans/{id}/revise` | responsible Trainer | copies an `Active`/`Completed` training plan into a new `Draft` version for adjustment |
| POST | `/training-plan-stages/{TrainingPlanStageID}/close` | responsible Trainer, Head Trainer | `{"SummaryNote"?}` close a stage → stage summary sent to the horse owner **and the Head Trainer** (bell `STAGE_SUMMARY` + email). Returns the stage summary (5.7) |

Closing a stage: the training plan must be `Active` / `Completed`, the stage must have started (`NOT_STARTED`), not be closed yet
(`ALREADY_CLOSED`) and have no `Assigned` / `In Progress` sessions left (`SESSIONS_PENDING`: finish, cancel or mark them missed).
When the stage end date has passed and it is still open, the Trainer and Head Trainer see `STAGE_TO_CLOSE` in notifications.
Completing a training plan closes its started stages automatically and sends the plan summary to the owner.
Each stage in `Stages` also returns `ClosedAt`, `ClosedByID`, `ClosedByName`, `SummaryNote`.

Body `POST /training-plans`:

```json
{
  "HorseID": 1, "Goal": "Prepare for the December race", "StartDate": "2026-10-12", "EndDate": "2026-12-10",
  "OverallIntensity": "Moderate", "Note": null,
  "Stages": [
    {"StageName": "Foundation", "StartDate": "2026-10-12", "EndDate": "2026-11-01", "Intensity": "Low",
     "TrainingLoad": 30, "DistanceTargetKm": 3, "Surface": "Turf", "Goal": "Familiarization", "Note": null},
    {"StageName": "Speed build-up", "StartDate": "2026-11-02", "Intensity": "High", "TrainingLoad": 70}
  ]
}
```

- `OverallIntensity`, `Intensity`: `Low`, `Moderate`, `High`, `Very High`.
- `StageOrder` left empty = auto-numbered 1, 2, 3...; stages must fall within the training plan's period.
- If the horse has a `Full` lock overlapping the training plan's period, the plan cannot be approved (`TRAINING_LOCK_FULL`).

Returned training plan:

```json
{
  "TrainingPlanID": 1, "TrainerHorseAssignmentID": 1, "HorseID": 1, "HorseName": "Thunder",
  "TrainerID": 4, "TrainerName": "Demo Trainer", "Goal": "Prepare for the December race",
  "StartDate": "2026-10-12", "EndDate": "2026-12-10", "OverallIntensity": "Moderate", "Note": null,
  "Status": "Active", "CreatedAt": "2026-10-10T08:00:00", "SubmittedAt": "2026-10-10T08:05:00",
  "ApprovedByHeadTrainerID": 2, "ApprovedAt": "2026-10-10T09:00:00", "ReviewNote": "Agreed",
  "TemplateID": 1, "TemplateName": "Chương trình chuẩn – Đua đường bằng 1.200–2.000 m",
  "Stages": [{"TrainingPlanStageID": 1, "TrainingPlanID": 1, "StageName": "Foundation", "StageOrder": 1, "Goal": null,
              "StartDate": "2026-10-12", "EndDate": "2026-11-01", "Intensity": "Low", "TrainingLoad": 30.0,
              "DistanceTargetKm": 3.0, "Surface": "Turf", "Note": null}]
}
```

Specific error codes: `NOT_PLAN_OWNER` (not the currently assigned trainer), `NO_STAGES`, `DRAFT_EXISTS` (a version is already being drafted / pending approval),
`ASSIGNMENT_ENDED`, `IN_USE` (the stage already has training sessions).

### 5.5.1 Training plan templates (one per specialization)

Each club has **one template per specialization** (Flat Racing 84 days / 4 stages, Steeplechase & Hurdle 98 / 5,
Harness 84 / 4, Endurance 84 / 5, Other 56 / 3). Missing templates are created with the default content the first time
they are read. Stages use **day numbers** (`StartDay`, `DurationDays`), not dates. Only the Head Trainer edits templates.

```
Head Trainer assigns a trainer (5.3)
   └─> Draft training plan copied from the template, day numbers turned into dates from the assignment start (or today)
Trainer reads it with the horse assessment (template-review), edits or keeps it, may move the start date (reschedule)
   └─> submit ──> Head Trainer sees what changed vs. the template ──> approve ──> Active ──> schedule sessions (5.6)
                                                                 └─> return (ReviewNote) ──> trainer edits again ...
```

| Method | URL | Used by | Notes |
|---|---|---|---|
| GET | `/training-plan-templates?SpecializationID=` | staff | templates of the club, with `Stages` |
| GET | `/training-plan-templates/{TemplateID}` | staff | |
| PUT | `/training-plan-templates/{TemplateID}` | Head Trainer | whole template, `Stages` required (replaces all stages) |
| PATCH | `/training-plan-templates/{TemplateID}` | Head Trainer | some fields; `Stages` sent = replaces all stages. `IsActive: false` = assignments no longer create a draft |
| GET | `/training-plans/{id}/template-review` | staff | template info + latest horse assessment + list of changes vs. the template |
| POST | `/training-plans/{id}/reschedule` | responsible Trainer | `{"StartDate"}` – `Draft` only, every stage moves by the same number of days; past date → 400 |
| POST | `/training-plans/from-template` | responsible Trainer | `{"HorseID"}` – new draft from the template (e.g. after it was replaced, or to adjust an `Active` plan). 400 if a `Draft` / `Pending Approval` plan exists |

- Editing a template does **not** change plans already created from it.
- If the trainer creates a plan by hand (`POST /training-plans`), the template draft that was never submitted is cancelled
  (no two drafts for one horse).
- The trainer edits the draft with the normal endpoints of 5.5 (`PATCH /training-plans/{id}`, stages ...). The stage `Note`
  carries the template content plus `Điều kiện sang giai đoạn sau: ...` (exit criteria).
- Trainer notification `PLAN_DRAFT_FROM_TEMPLATE` until the draft is submitted; returned plans show `PLAN_RETURNED` as before.

Template:

```json
{"TemplateID": 1, "ClubID": 1, "SpecializationID": 4, "SpecializationName": "Endurance", "SpecializationCode": "ENDURANCE",
 "TemplateName": "Chương trình chuẩn – Đua đường dài 80–120 km", "Goal": "...", "DurationDays": 84,
 "OverallIntensity": "Moderate", "DailyStructure": "...", "WeeklyPattern": "...", "Note": "...", "IsActive": true,
 "UpdatedBy": null, "UpdatedByName": null, "UpdatedAt": "2026-10-21T08:00:00",
 "Stages": [{"TemplateStageID": 1, "StageOrder": 1, "StageName": "Làm quen & nền tảng", "Goal": "...", "StartDay": 1,
             "DurationDays": 14, "Intensity": "Low", "TrainingLoad": 25.0, "DistanceTargetKm": 60.0,
             "Surface": "...", "Note": "...", "ExitCriteria": "..."}]}
```

Validation: `DurationDays` > 0, at least 1 stage, no duplicate `StageOrder`, each stage inside the template
(`StartDay` ≥ 1, `StartDay + DurationDays − 1 ≤ DurationDays` of the template).

`template-review`:

```json
{"TrainingPlanID": 7, "Status": "Pending Approval", "TemplateID": 1, "TemplateName": "...",
 "DailyStructure": "...", "WeeklyPattern": "...", "TemplateNote": "...",
 "Assessment": {"AssessmentID": 3, "QualityScore": 78.0, "FitnessLevel": "Good", "AssessmentNote": "...", "SpecializationID": 1},
 "ChangedFromTemplate": true, "ChangeCount": 1,
 "Changes": [{"StageOrder": 1, "Field": "TrainingLoad", "Template": 25.0, "Plan": 20.0, "Change": "Changed"}]}
```

`Field`: `Goal`, `DurationDays`, `OverallIntensity` (whole plan, `StageOrder: null`), or per stage `StageName`, `StartDay`,
`DurationDays`, `Intensity`, `TrainingLoad`, `DistanceTargetKm`, `Surface`, `Goal`; `Field: "Stage"` with
`Change: "Added" / "Removed"`. Moving the whole plan (reschedule) is not a change. Plans not made from a template:
`TemplateID`, `Changes`, `ChangedFromTemplate` are `null`.

Database: on an existing database run `sql/migrations/20261021_training_plan_templates.sql` (tables `TrainingPlanTemplate`,
`TrainingPlanTemplateStage`, column `TrainingPlan.TemplateID`). `seed_demo` creates the default templates.

### 5.6 Training sessions

```
Assigned ──start (Work Rider, on the session day)──> In Progress ──result (Work Rider)──> Completed
Assigned / In Progress ──stop (supervising trainer, responsible Trainer, Head Trainer) / cancel──> Cancelled
Assigned / In Progress ──missed (from the session day onward)──> Missed
```

Who schedules: only the **responsible Trainer** of the horse (create, edit, cancel, mark missed). The Head Trainer does
**not** schedule daily sessions; when the trainer is away the Head Trainer chooses a **substitute supervisor**, who may
change the rider and the time of the sessions they supervise. Others get `403`. `AssignedByHeadTrainerID` stores whoever
scheduled the session (column name kept for compatibility). `stop` = the horse has a problem (the owner is alerted;
supervising trainer, responsible Trainer or Head Trainer); `cancel` = ordinary cancellation (weather, schedule change).

| Method | URL | Used by | Notes |
|---|---|---|---|
| GET | `/training-sessions?Date=&From=&To=&HorseID=&TrainingPlanID=&WorkRiderID=&Status=&mine=1` | staff | `mine=1`: Work Rider → sessions they ride; Trainer → sessions they supervise (responsible or Substitute) |
| GET | `/training-sessions/{id}` | staff | |
| POST | `/training-sessions` | responsible Trainer | schedule a training session (the training plan must be `Active`); no `WorkRiderID` = main work rider |
| PATCH | `/training-sessions/{id}` | responsible Trainer; the session's substitute supervisor (only `WorkRiderID`, `StartTime`, `EndTime`, `SequenceNo`, `RiderChangeReason`) | when `Assigned`: change Work Rider, date/time, intensity... |
| POST | `/training-sessions/{id}/start` | the session's Work Rider | on the session day |
| POST | `/training-sessions/{id}/result` | the session's Work Rider | record the result → `Completed` |
| POST | `/training-sessions/{id}/substitute-observation` | the session's Substitute Trainer | `{"SubstituteObservation"}` (required for substitute-supervised sessions) |
| POST | `/training-sessions/{id}/stop` | supervising trainer, responsible Trainer, Head Trainer | `{"Reason", "ReportHealth"?, "Severity"?, "Description"?}`; the owner gets an urgent alert + email |
| POST | `/training-sessions/{id}/substitute` | Head Trainer | `{"SubstituteTrainerID": 6 \| null, "Reason"?}` – `Assigned` sessions only; the substitute gets `SUBSTITUTE_ASSIGNED`, the responsible trainer `SUBSTITUTE_SET` |
| POST | `/training-sessions/substitute-day` | Head Trainer | `{"TrainerID", "Date", "SubstituteTrainerID", "Reason"?}` – trainer away all day: one substitute for all their `Assigned` sessions that day; returns the sessions |
| GET | `/training-sessions/{id}/substitute-suggestions` | Head Trainer | Trainers / Head Trainers: same specialization first, then free at that time (`MatchesSpecialization`, `IsBusy`) – a different specialization is still allowed |
| POST | `/training-sessions/{id}/cancel` | responsible Trainer | `{"Reason"?}` |
| POST | `/training-sessions/{id}/missed` | responsible Trainer | `{"Reason"?}` |
| POST | `/training-sessions/{id}/review` | responsible Trainer | review a `Completed` session (once per session) |
| GET | `/training-reviews?AdjustmentRequired=1&HorseID=&Days=14` | staff | Head Trainer tracks training plan adjustment requests |
| GET | `/training-dashboard?HorseID=` | staff | overview screen before scheduling (same as the `vw_HorseTrainingDashboard` view) |

Body `POST /training-sessions`:

```json
{
  "TrainingPlanStageID": 1, "WorkRiderID": 5, "SubstituteTrainerID": null,
  "SessionDate": "2026-10-12", "StartTime": "06:00", "EndTime": null, "SequenceNo": null,
  "TrainingType": "Canter", "DurationPlannedMinutes": 45, "DistancePlannedKm": 3.5, "TargetSpeedKmh": 30,
  "TrainingLoad": 30, "Surface": "Turf", "Location": "Track no. 2", "Instructions": "Warm up for 10 minutes"
}
```

- `WorkRiderID` left empty = the horse's **main work rider**. If that rider already has another session overlapping
  this time (`EndTime`, or `StartTime` + `DurationPlannedMinutes`, default 60 minutes) → 409 `MAIN_RIDER_BUSY`
  (another chosen rider → `RIDER_BUSY`); pick another rider for this session only.
- `RiderChangeReason`? (write only): why this session is not ridden by the main rider / why the rider changed. Whenever a
  session goes to someone other than the main rider (or the rider of a session is changed), the Head Trainer gets
  `RIDER_CHANGED` (with the reason) and the replaced rider gets `RIDER_REMOVED`.
- `SubstituteTrainerID`: only `null` is accepted here; the Head Trainer sets the substitute with the endpoints below.
- `SequenceNo` left empty = the next slot in the Work Rider's day (`RIDER_SLOT_TAKEN` if it conflicts).
- Cannot schedule on a past date; the session date must fall within the stage.
- **Training Lock**: `Full` → cannot schedule / start (`TRAINING_LOCK_FULL`); `Restricted` → `TrainingLoad` is required
  and must not exceed `MaxIntensity` (`TRAINING_LOCK_RESTRICTED`). The scheduling screen should call `/training-dashboard` to show restrictions.

Body `POST /training-sessions/{id}/result`:

```json
{
  "ActualDurationMinutes": 44, "ActualDistanceKm": 3.4, "AvgSpeedKmh": 28.5, "MaxSpeedKmh": 41,
  "AvgHeartRate": 150, "MaxHeartRate": 190, "RecoveryMinutes": 12, "PerformanceScore": 78,
  "RiderObservation": "Slightly heavy on the right leg at the end of the session", "VideoUrl": null
}
```

Body `POST /training-sessions/{id}/review`:

```json
{"Evaluation": "Good", "TrainerComment": "Fine", "AdjustmentRequired": true, "AdjustmentNote": "Reduce distance next week"}
```

`Evaluation`: `Excellent`, `Good`, `Average`, `Needs Improvement`. If `AdjustmentRequired: true`, `AdjustmentNote` is required
and the Head Trainer sees it in notifications.

Returned training session (same as the `vw_WorkRiderDailySchedule` view, plus result and review):

```json
{
  "TrainingSessionID": 1, "TrainingPlanStageID": 1, "TrainingPlanID": 1, "StageName": "Foundation",
  "HorseID": 1, "HorseName": "Thunder", "HorseCode": "EQ-001",
  "WorkRiderID": 5, "WorkRiderName": "Demo Work Rider", "AssignedByHeadTrainerID": 2,
  "SubstituteTrainerID": 6, "AssignedTrainerID": 4, "AssignedTrainerName": "Demo Trainer",
  "SupervisingTrainerID": 6, "SupervisingTrainerName": "Trainer B", "IsSubstitute": true,
  "SessionDate": "2026-10-12", "StartTime": "06:00:00", "EndTime": "06:45:00", "SequenceNo": 1,
  "TrainingType": "Canter", "DurationPlannedMinutes": 45, "DistancePlannedKm": 3.5, "TargetSpeedKmh": null,
  "TrainingLoad": 30.0, "Surface": "Turf", "Location": "Track no. 2", "Instructions": "Warm up for 10 minutes",
  "Status": "Completed",
  "Result": {"TrainingResultID": 1, "TrainingSessionID": 1, "ActualDurationMinutes": 44, "ActualDistanceKm": 3.4,
             "AvgSpeedKmh": 28.5, "MaxSpeedKmh": 41.0, "AvgHeartRate": 150, "MaxHeartRate": 190, "RecoveryMinutes": 12,
             "PerformanceScore": 78.0, "RiderObservation": "Slightly heavy on the right leg at the end of the session", "VideoUrl": null,
             "SubstituteObservation": "The horse ran steadily", "RecordedAt": "2026-10-12T06:50:00"},
  "Review": null
}
```

Specific error codes: `PLAN_NOT_ACTIVE`, `RIDER_SLOT_TAKEN`, `NOT_SESSION_RIDER`, `WRONG_DAY`, `NOT_SUBSTITUTE`,
`NOT_ASSIGNED_TRAINER`, `ALREADY_REVIEWED`, `NOT_YET` (marking a session as missed before its date).

`GET /training-dashboard`:

```json
[{"HorseID": 1, "HorseCode": "EQ-001", "HorseName": "Thunder", "Gender": "Male", "SexClass": "Stallion",
  "CurrentHealthStatus": "Recovering", "TrainerHorseAssignmentID": 1, "TrainerID": 4, "TrainerName": "Demo Trainer",
  "SpecializationName": "Flat Racing", "ActiveTrainingPlanID": 1,
  "IsTrainingLocked": true, "TrainingLockID": 3, "LockLevel": "Restricted", "MaxIntensity": 25.0, "LockEndDate": null,
  "LatestTrainingDate": "2026-10-12", "LatestPerformanceScore": 78.0, "LatestActualDistanceKm": 3.4,
  "LatestAvgSpeedKmh": 28.5, "LatestAvgHeartRate": 150, "LatestRecoveryMinutes": 12}]
```

### 5.7 Horse owner: training results

The owner (`OWNER_VIEW`) only sees **their own horses**, only training plans that were approved, and:
- `Completed` sessions **after the responsible Trainer reviewed them** (overview + detail);
- `Cancelled` / `Missed` sessions that are due, with the reason (no numbers);
- never: sessions not yet done / in progress / not reviewed, the Substitute Trainer's observation.

Summaries follow the **stages of the training plan** (not weeks / months). A running stage shows numbers "as of today" (`AsOf`);
when the Trainer closes it (5.5) the owner receives the stage summary; when the plan ends, the plan summary.
Result numbers in summaries only count reviewed sessions (what the owner can see).

| Method | URL | Notes |
|---|---|---|
| GET | `/owner/horses/{HorseID}/training-plans` | approved training plans (newest first) with the overall `Summary` |
| GET | `/owner/training-plans/{TrainingPlanID}` | plan summary + `Stages` (each with `Summary`, `ComparedToPreviousStage`, `SummaryNote`) |
| GET | `/owner/horses/{HorseID}/training-sessions?From=&To=&TrainingPlanID=&TrainingPlanStageID=` | session overview list (newest first) |
| GET | `/owner/training-sessions/{TrainingSessionID}` | session detail; `404` if the session is not reviewed yet |

Session overview (list) – detail adds the fields after `Reason`:

```json
{"TrainingSessionID": 1, "SessionDate": "2026-10-17", "StartTime": "06:00:00", "TrainingType": "Canter",
 "TrainingPlanID": 1, "TrainingPlanStageID": 1, "StageName": "Làm quen", "Status": "Completed",
 "DurationMinutes": 47, "DistanceKm": 5.2, "PerformanceScore": 82.0, "Evaluation": "Excellent",
 "IsStopped": false, "Reason": null,
 "HorseID": 3, "HorseName": "Hắc Long", "TrainerName": "Phạm Quốc Bảo", "WorkRiderName": "Võ Thanh Tùng",
 "Surface": "Turf", "Location": "Track no. 2", "DurationPlannedMinutes": 45, "DistancePlannedKm": 5.0, "TargetSpeedKmh": 40.0,
 "AvgSpeedKmh": 41.3, "MaxSpeedKmh": 55.0, "AvgHeartRate": 152, "MaxHeartRate": 205, "RecoveryMinutes": 11,
 "RiderObservation": "Ngựa hơi mệt km cuối", "VideoUrl": "https://...", "TrainerComment": "Thích nghi tốt",
 "AdjustmentRequired": false, "AdjustmentNote": null, "ReviewedBy": "Phạm Quốc Bảo", "ReviewDate": "2026-10-17T09:15:00"}
```

`IsStopped: true` = stopped because the horse had a problem; `Status` is then `Cancelled` and `Reason` explains why.

`GET /owner/training-plans/{id}`:

```json
{"HorseID": 3, "HorseName": "Hắc Long", "HorseCode": "EQ-003",
 "TrainingPlanID": 1, "Goal": "Chuẩn bị giải tháng 12", "StartDate": "2026-10-17", "EndDate": "2026-11-26", "Status": "Active",
 "TrainerName": "Phạm Quốc Bảo", "SpecializationName": "Flat Racing", "ApprovedAt": "2026-10-17T08:00:00",
 "ProgressPercent": 12.5, "StageCount": 2, "CurrentStageName": "Làm quen",
 "Summary": {"From": "2026-10-17", "To": "2026-10-22", "PlannedSessions": 6, "CompletedSessions": 4, "ReviewedSessions": 4,
             "AwaitingReviewSessions": 0, "CancelledSessions": 1, "MissedSessions": 0, "UpcomingSessions": 1,
             "TotalDistanceKm": 20.4, "DistanceTargetKm": 50.0, "DistanceProgressPercent": 40.8, "TotalDurationMinutes": 180,
             "AvgDistancePerSessionKm": 5.1, "AvgSpeedKmh": 40.6, "MaxSpeedKmh": 55.0, "AvgPerformanceScore": 80.5,
             "AvgHeartRate": 151.0, "AvgRecoveryMinutes": 11.5,
             "Evaluations": {"Excellent": 1, "Good": 3, "Average": 0, "Needs Improvement": 0},
             "Health": {"TrainingLockCount": 0, "HealthReportCount": 0, "UrgentHealthReportCount": 0, "IsLockedNow": false,
                        "Text": "Bình thường"}},
 "Stages": [{"TrainingPlanStageID": 1, "StageOrder": 1, "StageName": "Làm quen", "Goal": null,
             "StartDate": "2026-10-17", "EndDate": "2026-10-30", "Intensity": "Low",
             "StageState": "InProgress", "IsOverdue": false, "AsOf": "2026-10-22",
             "ClosedAt": null, "ClosedByName": null, "SummaryNote": null,
             "Summary": {"...": "same fields as above"},
             "ComparedToPreviousStage": null}]}
```

- `StageState`: `NotStarted` (`Summary` = null), `InProgress` (numbers as of `AsOf`), `Closed`.
- `ComparedToPreviousStage`: differences of `AvgSpeedKmh`, `AvgPerformanceScore`, `AvgDistancePerSessionKm`, `AvgRecoveryMinutes`
  against the previous stage (positive = higher).
- `Health` is `null` until Flow 3 is installed.

Emails to the owner (only important events): plan approved, stage closed (stage summary), plan completed (plan summary),
session stopped (urgent); with Flow 3 also Training Lock created (urgent) / released.

## 6. Flow 3 – Medical

```
Groom / Work Rider / Trainer / Head Trainer reports an issue ──> Vet queue (Urgent first)
   (responsible Trainer and Head Trainer see it in notifications)
──> Vet takes the case ──> creates a medical record linked to the report ──> prescribes treatment ──> signs the record (+ Training Lock)
──> resolves the report ──> follow-up examination passes ──> release the lock
```

Medical records (`/horses/{id}/medical-records`, `/medical-records/...`) are shared with Flow 1, see section 4.4. Flow 3 adds:

| Item | Change |
|---|---|
| Create record | adds `"HealthReportID"` (which report the record handles) and `"TrainingSessionID"` (which training session the issue was found in) |
| `TrainingEligibility = Restricted` | must have `RestrictionNote` even when saving a draft (CHECK constraint in SQL) |
| Delete draft record | also deletes the treatments prescribed on the record and unlinks the health report |
| Sign record | optional body `{"TrainingLock": {...}}`; response additionally includes `TrainingLock` (see 6.3) |

### 6.1 Health reports

| Method | URL | Used by | Notes |
|---|---|---|---|
| GET | `/horses/{HorseID}/health-reports?open=1` | staff | **call this first when opening the report form**: if there is an open report, add a note instead of filing a duplicate |
| POST | `/horses/{HorseID}/health-reports` | Groom, Work Rider, Trainer, Head Trainer | `{"Severity": "Urgent" \| "Normal", "Description", "ImageUrl"?, "TrainingSessionID"?}` |
| GET | `/health-reports?open=1&Status=&Severity=&HorseID=&mine=1` | staff | `open=1`: Vet queue, `Urgent` first, then oldest first |
| GET | `/health-reports/{id}` | staff | includes `Notes` |
| POST | `/health-reports/{id}/notes` | anyone allowed to report, Vet | `{"Content"}` |
| POST | `/health-reports/{id}/take` | Vet | the on-duty Vet takes the case: `Reported` → `Reviewing` |
| POST | `/health-reports/{id}/resolve` | Vet | `{"VetNote"?, "MedicalRecordID"?}` (one of the two is required) → `Resolved` |

- An `Urgent` report linked to the `TrainingSessionID` of a session that is `In Progress` → the session stops automatically (`Cancelled`), and the response includes `"StoppedSession": true`.
- The supervising trainer can also stop the session and report at once: `POST /training-sessions/{id}/stop` with `"ReportHealth": true` (section 5.6).
- An `Urgent` report is **emailed at once** to the on-duty vet (4.7); nobody on duty → every vet of the club.
- Vet creates a medical record with `"HealthReportID"` → the report is automatically linked to the record and moves to `Reviewing`. Each report is linked to 1 record (`REPORT_ALREADY_LINKED`).

```json
{
  "HealthReportID": 1, "HorseID": 1, "HorseName": "Thunder", "ReportedBy": 7, "ReportedByName": "Demo Groom",
  "ReportedByRoles": ["GROOM"], "TrainingSessionID": null, "ReportedAt": "2026-10-12T07:30:00",
  "Severity": "Normal", "Description": "Left front leg is slightly warm", "ImageUrl": null,
  "Status": "Reviewing", "VetID": 3, "VetName": "Demo Veterinarian", "MedicalRecordID": 2, "VetNote": null,
  "ResolvedAt": null,
  "Notes": [{"HealthReportNoteID": 1, "HealthReportID": 1, "NoteBy": 5, "NoteByName": "Demo Work Rider",
             "NoteAt": "2026-10-12T07:45:00", "Content": "Gait seemed slightly uneven during warm-up"}]
}
```

Specific error codes: `REPORT_RESOLVED`, `REPORT_ALREADY_LINKED`.

### 6.2 Treatments

| Method | URL | Used by | Notes |
|---|---|---|---|
| GET | `/medical-records/{id}/treatments` | staff | |
| POST | `/medical-records/{id}/treatments` | Vet who created the record (record still `Draft`) | `{"MedicineName", "Dose", "Route", "StartDate", "EndDate"?, "WithdrawalUntil"?, "Note"?}` |
| PATCH | `/treatments/{TreatmentID}` | Vet | draft record: the Vet who created it can edit freely; signed record: only `EndDate`, `WithdrawalUntil` |
| GET | `/horses/{HorseID}/treatments?WithdrawalActive=1` | staff | treatments still within the withdrawal period (doping check) |

`Route`: `Oral`, `Injection`, `Topical`, `Inhalation`, `Other`. Also returns `"WithdrawalActive": true/false`.

### 6.3 Training Lock

| Method | URL | Used by | Notes |
|---|---|---|---|
| GET | `/training-locks?HorseID=&LockStatus=Active` | staff | |
| GET | `/training-locks/{id}` | staff | |
| POST | `/horses/{HorseID}/training-locks` | Vet | `{"Reason", "LockLevel", "MaxIntensity"?, "LockStartDate"?, "LockEndDate"?, "Details"?}` |
| PATCH | `/training-locks/{id}` | Vet | change level, maximum intensity, expected release date |
| POST | `/training-locks/{id}/release` | Vet | `{"Note"?}` – requires a follow-up examination **signed after the lock** with a conclusion other than `Not Eligible` |

- `LockLevel`: `Full` (no training) or `Restricted` (`MaxIntensity` required, compared against the training session's `TrainingLoad`).
- Each horse has at most 1 `Active` lock (`LOCK_EXISTS` → use PATCH).
- Creating / tightening a lock → `Assigned` training sessions within the lock period are cancelled; the response includes `"CancelledSessionIDs": [..]`.
- **Signing a medical record** of a horse that has been taken in:
  - sending `{"TrainingLock": {...}}` → creates a lock (or updates the existing lock) accordingly;
  - not sending it with a `Not Eligible` conclusion → the backend automatically locks `Full` (or raises a `Restricted` lock to `Full`);
  - an `Eligible` conclusion does **not** release the lock automatically: the Vet releases it after the follow-up examination.
- Creating a lock, changing its level / `MaxIntensity`, and releasing it are reported to the **responsible Trainer** and
  the **Head Trainers** (bell `TRAINING_LOCKED` / `TRAINING_LOCK_CHANGED` / `TRAINING_UNLOCKED` + email, reminding them
  to review the training plan). A level change is also sent to the owner (`OWNER_TRAINING_LOCK_CHANGED` + email).

```json
{"TrainingLockID": 3, "HorseID": 1, "HorseName": "Thunder", "CreatedByVetID": 3, "CreatedByName": "Demo Veterinarian",
 "Reason": "Mild tendinitis", "LockLevel": "Restricted", "MaxIntensity": 25.0, "LockStartDate": "2026-10-12T09:00:00",
 "LockEndDate": null, "LockStatus": "Active", "Details": null, "ReleasedByVetID": null, "ReleasedAt": null,
 "CancelledSessionIDs": [12]}
```

Specific error codes: `LOCK_EXISTS`, `FOLLOW_UP_EXAM_REQUIRED`.

### 6.4 Vaccinations, medical schedules

| Method | URL | Used by | Notes |
|---|---|---|---|
| GET | `/vaccinations?HorseID=&Status=&DueWithinDays=14` | staff | `DueWithinDays`: upcoming / overdue vaccinations and upcoming boosters |
| GET / POST | `/horses/{HorseID}/vaccinations` | view: staff; create: Vet | `{"VaccineName", "VaccinationDate", "NextDueDate"?, "Status"?, "Note"?, "ExternalVet"?}` |
| PATCH | `/vaccinations/{id}` | Vet | e.g. `{"Status": "Completed", "NextDueDate": "2027-04-01"}` |
| GET | `/medical-schedules?From=&To=&HorseID=&Status=&ScheduleType=` | staff | |
| GET / POST | `/horses/{HorseID}/medical-schedules` | view: staff; create: Vet | `{"ScheduleType", "ScheduledDate", "Status"?, "Note"?, "ExternalVet"?}` |
| PATCH | `/medical-schedules/{id}` | Vet | |

- Vaccination `Status`: `Scheduled`, `Completed`, `Overdue`, `Cancelled`. Also returns `IsOverdue` (past the date but still `Scheduled`).
- `ScheduleType`: `Vaccination`, `Deworming`, `Farrier`, `Routine Examination`. `Status`: `Scheduled`, `Completed`, `Cancelled`, `Overdue`.
- `"ExternalVet": true` → external vet (no account), `VetID = null`. By default `VetID` = the currently logged-in Vet.

## 7. Flow 4 – Care and nutrition

On an existing database run `sql/migrations/20261020_care_rules_diet_training.sql` (diet ↔ training plan link, generated care
tasks, `CareTaskRule`, `HorseGroom`), then `sql/migrations/20261031_flow4_care_roles.sql` (`CareTask.IntakeStatus`, task types
`Medical Care` / `Training Care`, Vet gets `INVENTORY_REQUEST`).

**Who sees what** (backend returns 403 otherwise):

| Role | Care tasks, diet plans |
|---|---|
| Vet, Head Trainer | whole club |
| Trainer | horses they are in charge of (+ tasks they assigned) |
| Groom | their own tasks; diets of the horses they look after |
| Manager | only the Groom board (`/horse-grooms`, `/grooms`) and inventory |
| Work Rider, Owner | nothing |

### 7.1 Diet plans

```
Head Trainer creates (Pending) ──Vet comment (advice)──> Head Trainer finalize ──> Approved
Sick / injured / isolated horse, or horse under an active Training Lock (NeedsVetApproval = true):
Head Trainer creates (Pending) ──Vet approve──> Approved ──Vet adjust──> Adjusted
     ^                          │ Vet reject (VetNote required)
     └── Head Trainer edits ── Rejected
```

The project has no separate nutritionist role: the **Vet gives the nutrition advice** and the **Head Trainer decides**.
For a sick horse (or one under a Training Lock) the Vet's opinion comes first: the plan needs the Vet's approval and only
the Vet adjusts the plan in effect.

| Method | URL | Who uses it | Notes |
|---|---|---|---|
| GET | `/horses/{HorseID}/diet-plans` | staff | |
| GET | `/horses/{HorseID}/diet-context` | staff | **what the Head Trainer looks at before writing a diet**: active training plan, current stage (intensity, load, distance target), last 14 days of training, sessions in the next 7 days, Training Lock, latest weight, current diet, `Notes` (suggestions) |
| POST | `/horses/{HorseID}/diet-plans` | Head Trainer | `{"DietDescription"?, "StartDate", "EndDate"?, "TrainingPlanID"?, "Meals": [...]}` (at least 1 meal). Without `TrainingPlanID` the horse's `Active` training plan is linked automatically |
| GET | `/horses/{HorseID}/current-diet` | staff | diet plan in effect today (`null` if none) – the Groom's screen |
| GET | `/diet-plans?Status=Pending&HorseID=` | see the table above | each plan has `VetCommented`, `NeedsVetApproval` |
| GET | `/diet-plans/{id}` | staff | |
| PATCH | `/diet-plans/{id}` | Head Trainer | when `Pending`/`Rejected`; sending `Meals` replaces all meals; after editing → `Pending` |
| POST | `/diet-plans/{id}/comment` | Vet | `{"VetNote"}` advice; the plan stays `Pending`; the Head Trainer gets `DIET_COMMENTED` |
| POST | `/diet-plans/{id}/finalize` | Head Trainer | `Pending` → `Approved`; needs a Vet comment first (`VET_COMMENT_REQUIRED`); sick / locked horse → `VET_APPROVAL_REQUIRED` |
| POST | `/diet-plans/{id}/approve` | Vet | sick / locked horse only (otherwise `VET_APPROVAL_NOT_NEEDED`): `{"VetNote"?}` |
| POST | `/diet-plans/{id}/reject` | Vet | sick / locked horse only: `{"VetNote"}` |
| POST | `/diet-plans/{id}/adjust` | Vet | sick / locked horse only: `{"VetNote", "Meals"?, "EndDate"?...}` – adjust the diet plan currently in effect |

```json
{"MealTime": "06:00", "FeedType": "Oats", "Quantity": 3, "Unit": "kg", "Note": null}
```

A diet plan follows the training plan: `TrainingPlanID` = the `Active` training plan when it was written (another horse's
plan / a plan that is not `Active` → 400). When the horse has an `Active` training plan but no diet in effect, or the diet in
effect was written for another (older) training plan, the Head Trainer sees `DIET_REVIEW_NEEDED` in notifications.

`GET /horses/{id}/diet-context`:

```json
{"HorseID": 1, "HorseName": "Sao Mai", "CurrentHealthStatus": "Healthy", "LatestWeightKg": 465.0,
 "ActiveTrainingPlan": {"TrainingPlanID": 1, "Goal": "Winter Cup 1,600 m", "StartDate": "2026-10-06", "EndDate": "2026-11-19", "OverallIntensity": "Moderate"},
 "CurrentStage": {"TrainingPlanStageID": 2, "StageName": "Endurance", "Intensity": "Moderate", "TrainingLoad": 50.0, "DistanceTargetKm": 100.0, "EndDate": "2026-11-19"},
 "Last14Days": {"CompletedSessions": 6, "TotalDistanceKm": 28.0, "AvgTrainingLoad": 33.3, "AvgPerformanceScore": 75.3, "AvgRecoveryMinutes": 12.0},
 "Next7Days": {"PlannedSessions": 2, "AvgTrainingLoad": 50.0},
 "TrainingLock": null,
 "CurrentDiet": {"DietPlanID": 1, "Status": "Approved", "StartDate": "2026-10-20", "EndDate": null, "TrainingPlanID": 1},
 "Notes": []}
```

`Notes` examples: high-intensity stage → more energy and electrolytes; long recovery time; Training Lock → less energy, more fibre;
current diet not written for the active plan / no diet yet.

When a new diet plan takes effect (finalized or approved): an overlapping old plan that started earlier ends on the day before the new plan's start date;
one that starts on the same day / later becomes `Expired`. If the new plan starts in the future, the current plan stays in use until that day.

```json
{"DietPlanID": 1, "HorseID": 1, "HorseName": "Thunder", "CreatedByHeadTrainerID": 2, "CreatedByName": "Demo Head Trainer",
 "ReviewedByVetID": 3, "ReviewedByName": "Demo Veterinarian", "DietDescription": "Recovery diet",
 "StartDate": "2026-10-12", "EndDate": null, "Status": "Approved", "VetNote": null,
 "CreatedAt": "2026-10-10T08:00:00", "ApprovedAt": "2026-10-10T10:00:00",
 "Meals": [{"DietMealID": 1, "MealTime": "06:00:00", "FeedType": "Oats", "Quantity": 3.0, "Unit": "kg", "Note": null}]}
```

Specific error codes: `SELF_APPROVAL`, `VET_COMMENT_REQUIRED`, `VET_APPROVAL_REQUIRED`, `VET_APPROVAL_NOT_NEEDED`.

### 7.2 Care tasks

**Grooms do not create tasks.** Daily tasks are **generated by the system from the club's rules** (`CareTaskRule`, set by
the Head Trainer) for the Groom in charge of the horse (the Manager assigns Grooms to horses). Extra tasks come from the
people with the expertise: the **Vet** assigns medical care (`Medical Care`, `Ice Leg Soak`) for any horse, the
**responsible Trainer** assigns training-related care (`Training Care`, `Bathing`) for their own horses. The person who
assigns a task does not pick the Groom: it goes to the Groom in charge of the horse (none → the Groom with the fewest
tasks that day). The Groom completes (feeding: records `IntakeStatus`) or skips (with a reason).

| Rule (`RuleCode`) | Task | When |
|---|---|---|
| `FEEDING_BY_DIET` | `Feeding` | every meal of the diet plan in effect, at the meal time (note = feed + quantity) |
| `DAILY_CLEANING` | `Cleaning` | every day at `TimeOfDay` (default 07:30) for every `Approved` horse |
| `BATH_AFTER_TRAINING` | `Bathing` | after each `Completed` training session of the day, `EndTime + OffsetMinutes` (default 30) |
| `ICE_SOAK_WHEN_LOCKED` | `Ice Leg Soak` | every day the horse has an active Training Lock (Flow 3), at `TimeOfDay` (default 16:00) |

- Tasks are generated for today up to 7 days ahead (never for past days) when the task list is opened (`GET /care-tasks`),
  when the Groom opens notifications, with `POST /care-tasks/generate`, or with `python manage.py generate_care_tasks --days 2`.
- No duplicates: each generated task has a `SourceKey`. When the source changes (new diet, rule turned off, lock released),
  generated tasks that are still `Pending` and not yet due are removed.
- Assignee: the horse's Groom in charge (`/horses/{id}/groom`, set by the Manager); if the horse has none, the active Groom with the fewest tasks that day.
- Changing the Groom in charge moves **all** pending tasks of the horse (generated and assigned) to the new Groom.

| Method | URL | Who uses it | Notes |
|---|---|---|---|
| GET | `/care-tasks?Date=&From=&To=&HorseID=&GroomID=&Status=&Auto=1&mine=1` | Vet, Head Trainer, Trainer, Groom (scope above) | `mine=1`: tasks of the logged-in Groom; `Auto=1`: generated tasks only |
| GET | `/care-tasks/{id}` | same | |
| POST | `/care-tasks` | Vet, responsible Trainer | extra task `{"HorseID", "TaskType", "ScheduledAt", "Note"?}` – Vet: `Medical Care` / `Ice Leg Soak`; Trainer: `Training Care` / `Bathing` (own horses). Others `403`; no Groom in the club → `NO_GROOM` |
| POST | `/care-tasks/generate` | Head Trainer | `{"Date"?, "Days"? (1–8)}` → `[{"Date", "Created", "Removed", "Unassigned"}]` |
| PATCH | `/care-tasks/{id}` | the person who assigned it | when `Pending`: `TaskType`, `ScheduledAt`, `Note` (`NOT_TASK_OWNER`) |
| POST | `/care-tasks/{id}/complete` | assigned Groom | `{"Note"?, "IntakeStatus"?}` → `Completed`. Feeding only: `IntakeStatus` = `Full` (ate all) / `Partial` / `Refused` |
| POST | `/care-tasks/{id}/skip` | assigned Groom, the person who assigned it | `{"Reason"}` → `Skipped` |
| GET | `/care-rules` | Vet, Head Trainer, Trainer, Groom | the club's rules (default rules are created automatically) |
| PATCH | `/care-rules/{RuleCode}` | Head Trainer | `{"IsActive"?, "TimeOfDay"?, "OffsetMinutes"? (0–240), "Title"?}` – applied at once to today and already generated days |
| GET | `/horses/{HorseID}/groom` | Manager, Vet, Head Trainer; Trainer / Groom for their horses | Groom in charge (`null` if none) |
| PUT / DELETE | `/horses/{HorseID}/groom` | Manager | `{"GroomID"}`; response adds `MovedTaskCount`, `GroomHorseCount`, `Warning` (Groom keeps more than 4 horses – not blocked) |
| GET | `/horse-grooms` | Manager, Vet, Head Trainer | Groom board: every `Approved` horse with its Groom (`GroomID` `null` = none) |
| GET | `/grooms` | Manager, Vet, Head Trainer | active Grooms with `HorseCount`, `OverLimit` |

Two completed feedings in a row with `IntakeStatus = Refused` → `FEED_REFUSED` (High) for the Vets and the responsible
Trainer: refusing food is usually the first sign of illness.

`TaskType`: `Feeding`, `Cleaning`, `Bathing`, `Ice Leg Soak`. Generated tasks have `RuleCode` and `IsAuto: true`,
`AssignedBy: null`. If the horse looks abnormal during care → report it via section 6.1.

```json
{"CareTaskID": 1, "HorseID": 1, "HorseName": "Thunder", "GroomID": 7, "GroomName": "Demo Groom", "AssignedBy": null,
 "AssignedByName": null, "TaskType": "Feeding", "ScheduledAt": "2026-10-12T05:30:00",
 "Status": "Pending", "CompletedAt": null, "Note": "Cho ăn theo khẩu phần: Yến mạch 3 kg",
 "RuleCode": "FEEDING_BY_DIET", "IsAuto": true}
```

Specific error codes: `NOT_TASK_OWNER`, `NOT_TASK_GROOM`.

### 7.3 Inventory

| Method | URL | Who uses it | Notes |
|---|---|---|---|
| GET | `/inventory-items?ItemType=&Status=&LowStock=1` | Manager, Groom, Vet, Head Trainer | the Vet checks medicine stock before prescribing |
| POST | `/inventory-items` | Manager | `{"ItemName", "ItemType", "Unit", "Quantity"?, "MinimumQuantity"?}` |
| PATCH | `/inventory-items/{id}` | Manager | `ItemName`, `ItemType`, `Unit`, `MinimumQuantity`; `"Status": "Inactive"` to discontinue, `"Reactivate": true` to reactivate |
| POST | `/inventory-items/{id}/stock` | Manager | `{"Change": 50, "Note"?}` – stock in (positive number) / adjust down (negative number) |
| GET | `/inventory-requests?Status=&mine=1` | Manager (whole club), Groom / Vet / Head Trainer (their own) | |
| POST | `/inventory-requests` | Groom, Vet, Head Trainer | `{"Reason"?, "Items": [{"InventoryItemID", "RequestedQuantity", "Note"?}]}` |
| POST | `/inventory-requests/{id}/approve` | Manager | `{"Items"?: [{"InventoryItemID", "ApprovedQuantity"}]}` – empty = approve in full; deducts stock |
| POST | `/inventory-requests/{id}/reject` | Manager | `{"Note"}` |
| POST | `/inventory-requests/{id}/cancel` | requester | while still `Pending` |

- `ItemType`: `Food`, `Medicine`, `Care Equipment`.
- Inventory item `Status` is computed automatically: `Out of Stock` (none left), `Low Stock` (≤ `MinimumQuantity`), `Available`; `Inactive` is set by the Manager.
- The `InventoryRequest` table has no Manager note column: the rejection reason is returned in `RejectNote` (taken from the Audit Log).
  `ApprovedBy` / `ApprovedAt` are the person / time that processed the request (approved or rejected).
- Inventory has no stock-movement history table; every stock in / stock out is recorded in the Audit Log.

```json
{"InventoryRequestID": 1, "ClubID": 1, "RequestedBy": 7, "RequestedByName": "Demo Groom", "ApprovedBy": 1,
 "ApprovedByName": "Demo Club Manager", "RequestDate": "2026-10-12T08:00:00", "Status": "Approved", "Reason": "Out of bran",
 "ApprovedAt": "2026-10-12T09:00:00", "RejectNote": null,
 "Items": [{"InventoryRequestItemID": 1, "InventoryItemID": 1, "ItemName": "Bran pellets", "Unit": "kg",
            "RequestedQuantity": 20.0, "ApprovedQuantity": 20.0, "Note": null}]}
```

Specific error codes: `INSUFFICIENT_STOCK`, `NOT_REQUESTER`.

## 8. Notifications

`GET /notifications?unread=1` – items needing the logged-in user's attention. The list is **recomputed on every call** from
current data; the `NotificationRead` table only remembers which items the user has read. Every item has `Key` and `IsRead`.
The frontend calls it on page load or every 1–2 minutes to show the bell.

| Method | URL | Notes |
|---|---|---|
| GET | `/notifications?unread=1` | `unread=1`: only unread items |
| GET | `/notifications/unread-count` | `{"Unread": 3, "Total": 5}` – the number on the bell |
| POST | `/notifications/read` | `{"Keys": ["<Key>", ...]}` or `{"All": true}` → `{"Marked": n}` |

`Key` = `Type|EntityName|EntityID|At`: a new event (new time) is a new, unread item.

```json
[{"Type": "HEALTH_REPORT", "Priority": "High", "Title": "Health report (Urgent) - Reported",
  "Message": "Demo Work Rider: Horse lame in the right hind leg when cantering", "EntityName": "HealthReport", "EntityID": 4,
  "HorseID": 1, "HorseName": "Thunder", "At": "2026-10-12T06:20:00"}]
```

Sorting: `Priority = High` first, newest first. `EntityName` + `EntityID` tell which screen to open when clicked.

| Role | `Type` |
|---|---|
| Club Manager | `HORSE_TO_VERIFY`, `HORSE_TO_APPROVE`, `PROFILE_CHANGE`, `INVENTORY_REQUEST`, `LOW_STOCK`, `VET_DUTY_MISSING`, `HORSE_WITHOUT_GROOM` |
| Vet | `HEALTH_REPORT`, `INITIAL_EXAM` (High when on duty), `VACCINATION_DUE`, `MEDICAL_SCHEDULE`, `DRAFT_RECORD`, `DIET_TO_REVIEW` (advice, or approval for sick / locked horses), `FEED_REFUSED` |
| Head Trainer | `HEALTH_REPORT` (all horses in the club), `PLAN_TO_APPROVE`, `ADJUSTMENT_REQUIRED`, `STAGE_TO_CLOSE`, `STAGE_SUMMARY`, `RIDER_CHANGED`, `TRAINING_LOCKED`, `TRAINING_LOCK_CHANGED`, `TRAINING_UNLOCKED`, `DIET_RETURNED`, `DIET_COMMENTED`, `DIET_REVIEW_NEEDED` |
| Trainer | `HEALTH_REPORT` (horses they are in charge of), `PLAN_DRAFT_FROM_TEMPLATE`, `PLAN_RETURNED`, `SUPERVISE_TODAY`, `SUBSTITUTE_ASSIGNED`, `SUBSTITUTE_SET`, `SUBSTITUTE_OBSERVATION`, `SESSION_TO_REVIEW`, `STAGE_TO_CLOSE`, `TRAINING_LOCKED`, `TRAINING_LOCK_CHANGED`, `TRAINING_UNLOCKED`, `FEED_REFUSED` |
| Work Rider | `RIDE_TODAY`, `RIDER_REMOVED` |
| Groom | `CARE_TASK` (generated + assigned tasks due today / overdue) |
| Horse Owner | `HORSE_REJECTED`, `PROFILE_CHANGE_DONE`, `OWNER_SESSIONS_REVIEWED` (new reviewed sessions, grouped per horse), `OWNER_STAGE_SUMMARY`, `OWNER_PLAN_SUMMARY`, `OWNER_PLAN_APPROVED`, `OWNER_SESSION_STOPPED` (High); Flow 3: `OWNER_TRAINING_LOCKED` (High), `OWNER_TRAINING_LOCK_CHANGED` (High), `OWNER_TRAINING_UNLOCKED` |

## 9. Frontend changes (Flow 1)

### 9.0 Connect the frontend to the backend (do this first)

| # | Task | Reason |
|---|---|---|
| 1 | `vite.config.js`: change `'http://localhost:8080'` to `'http://127.0.0.1:8000'` | The Django backend runs on port 8000 (8080 was the old Java backend). Use `127.0.0.1` because on some machines `localhost` does not reach Django |
| 2 | `src/api/apiClient.ts`: change the default base URL from MockAPI to `/api` | Call the real backend through the Vite proxy instead of MockAPI |
| 3 | `apiClient.ts`: attach the `Authorization: Bearer <access>` header to every request | Every API (except `auth/login`, `auth/register`, `auth/google`, `clubs`, `health`) requires login; a missing token returns **401** |
| 4 | `apiClient.ts`: on 401, call `POST /auth/refresh` with `refresh` to get a new `access`, then retry | `access` expires after 60 minutes |
| 5 | `apiClient.ts`: on errors read `detail` (show to the user) and `code` (special handling); a 400 error is an object keyed by field | See section 1, error codes part |
| 6 | `apiClient.ts`: add `apiPatch`, `apiDelete` | Partial updates use `PATCH`, not `PUT` of the whole horse |
| 7 | **Login** screen (Email + Password → `POST /auth/login`), store `access` / `refresh`; remove the demo role picker `DemoPicker` | Route by `Roles`: `CLUB_MANAGER` → `/manager`, `VETERINARIAN` → `/vet`, `HORSE_OWNER` → `/owner` |
| 8 | `src/types/index.ts`: redeclare data types using database column names | Per tables 9.2–9.6 and the JSON examples in section 4 |

To override the addresses on your own machine, create `.env.local` (do not commit it):

```
VITE_API_BASE_URL=/api
VITE_API_PROXY_TARGET=http://127.0.0.1:8000
```

### 9.1 Functions in `horseApi.ts` (rewrite per this table)

| Old function (MockAPI) | Replace with |
|---|---|
| `getHorses()` | `getHorses({RegistrationStatus?, OwnerID?, search?})` → `GET /horses` |
| `getHorseById(id)` | keep the name → `GET /horses/{id}` |
| `createHorse(payload)` | keep the name, body uses column names + `ClubID` (Owner) or `OwnerID` (Manager) |
| `updateHorse(id, payload)` (PUT of the whole horse) | `PATCH /horses/{id}`, send only the fields to change, only when `Draft`/`Rejected` |
| *(not yet)* | `submitHorse`, `verifyHorse`, `rejectHorse`, `archiveHorse` |
| `saveExaminationDraft(horseId, vet, input)` | `saveExaminationDraft(horseId, input, draftId?)` → POST the first time, PATCH afterwards |
| `finalizeExamination(horseId, vet, input)` | `finalizeExamination(horseId, input, draftId?)` → save then `POST /medical-records/{id}/sign` |
| `completeHorseIntake(horseId, managerId)` | `completeHorseIntake(horseId, HorseCode, StallID?, ManagerNote?)` → `POST /horses/{id}/approve` |
| `isHorseAssignedToVet(horse, user)` | **remove**: Vets are on duty, not assigned |
| `getLatestHorse`, `putHorsePreservingData`, `toExamination` | **remove**: the backend handles status and audit log |
| `normalizeHorse`, `normalizeUser` | **remove**: use the backend JSON directly |
| *(not yet)* | `getPendingInitialExams`, `getMedicalRecords`, `addAmendment`, `getHorseDocuments`, `addHorseDocument`, `requestProfileChange`, `getProfileChangeRequests`, `approveProfileChange`, `rejectProfileChange`, `getStalls`, `getClubs`, `getRegistrationRequests`, `getHorseAuditLogs` |

### 9.2 Horse field renames

| Old frontend | Backend | Notes |
|---|---|---|
| `id` | `HorseID` | number, not string |
| `clubId` | `ClubID` | |
| `code` | `HorseCode` | `null` until `Approved` |
| `name` | `HorseName` | |
| `breed`, `dateOfBirth`, `coatColor`, `microchipNumber` | `Breed`, `DateOfBirth`, `CoatColor`, `MicrochipNumber` | |
| `sex`: `MALE`/`FEMALE`/`GELDING` | `Gender`: `Male`/`Female`/`Gelding` | plus `SexClass` for display |
| `registrationNumber` | `PassportNumber` | |
| `sireId`, `damId` | `SireName`, `DamName` | enter the parents' **names**, not select horses |
| `ownerUserId` | `OwnerID` | contact info is in `Owner` |
| `profileStatus` | `RegistrationStatus` | see table 5.3 |
| `healthStatus` | `CurrentHealthStatus` | see table 5.4 |
| `archiveReason` | `ArchiveReason` | |
| `createdAt`, `updatedAt` | `CreatedAt`, `UpdatedAt` | |
| `intake.assignedVetId` | **remove** | Vets are on duty |
| `intake.completedAt`, `completedBy` | `RegistrationRequest.ReviewedAt`, `ReviewedByClubManagerID` | `GET /horses/{id}/registration-requests` |
| `intake.handoverNotes`, `intakeNotes` | `RegistrationRequest.ManagerNote` | sent with `approve` |
| `intake.handoverDocuments` | documents of type `Handover Record` | `/horses/{id}/documents` |
| `healthAssessment` | `HealthSummary` | only in `GET /horses/{id}` |
| `examinations[]` | `GET /horses/{id}/medical-records` | |
| `documents[]` | `GET /horses/{id}/documents` | |
| `correctionRequests[]` | `GET /profile-change-requests?HorseID={id}` | |
| `auditLogs[]` | `GET /horses/{id}/audit-logs` | |
| `ownershipHistory[]` | **remove** | the team decided not to store ownership history |
| `medicalRecords[]`, `vaccinations[]` | Flow 3 APIs | see section 6 |

### 9.3 Profile status

| Old `profileStatus` | New `RegistrationStatus` |
|---|---|
| `DRAFT` | `Draft` |
| *(not yet)* | `Submitted` (Manager must click **Verify**) |
| `PENDING_EXAM` | `PendingExam` and `InitialExamSigned === false` |
| `PENDING_COMPLETION` | `PendingExam` and `InitialExamSigned === true` |
| `RECEIVED` | `Approved` |
| *(not yet)* | `Rejected` |
| `ARCHIVED` | `Archived` |

### 9.4 Health status

The database separates **health** (`HealthStatus`) from **whether the horse may train** (`TrainingEligibility`).

| Old `healthStatus` | New |
|---|---|
| `NOT_ASSESSED` | `CurrentHealthStatus: "Unknown"` |
| `ELIGIBLE` | `HealthStatus: "Healthy"` + `TrainingEligibility: "Eligible"` |
| `MONITORING` | `"Monitor"` |
| `INJURED` | `"Injured"` |
| `ISOLATION` | `"Isolated"` |
| *(not yet)* | `"Recovering"` |

The examination form needs an extra `TrainingEligibility` selector. The old approval condition `healthStatus === 'ELIGIBLE'`
becomes: `HealthStatus` is `Healthy`/`Monitor` **and** `TrainingEligibility !== 'Not Eligible'` (the backend checks this itself).

### 9.5 Examination form (old `ExaminationInput` → medical record body in section 4.4)

| Old | New |
|---|---|
| `examinedAt` | `ExamDate` |
| `weightKg`, `heightCm` | `WeightKg`, `HeightCm` |
| `symptoms` | `Symptoms` |
| `diagnosis` | `Diagnosis` |
| `treatmentPlan` | `TreatmentPlan` |
| `conclusion` | `Conclusion` |
| `healthStatus` | `HealthStatus` + `TrainingEligibility` |
| `exerciseRestrictions` | `RestrictionNote` |
| `followUpDate` | `FollowUpDate` |
| `purpose` | `ExamType` (`Initial Exam` at intake); extra notes go in `Note` |
| `status: DRAFT/FINALIZED` | `RecordStatus: Draft/Signed` |

### 9.6 Users, login

| Old | New |
|---|---|
| demo role picker screen | login screen → `POST /auth/login` (section 4.1) |
| `user.id` | `UserID` |
| `user.clubId` | `ClubID` |
| `user.role`: `CLUB_MANAGER`/`OWNER`/`VET` | `user.Roles`: `CLUB_MANAGER`/`HORSE_OWNER`/`VETERINARIAN` (array) |
| `user.isActive` | `Status === "Active"` |
| `fullName`, `email`, `phone`, `address`, `createdAt` | `FullName`, `Email`, `Phone`, `Address`, `CreatedAt` |

### 9.7 Screens

| Route | API calls |
|---|---|
| `/manager/horses` | `getHorses({RegistrationStatus})` |
| `/manager/horses/new` | `getUsers('HORSE_OWNER')` to pick the owner, then `createHorse({... , OwnerID})` |
| `/horses/:id` | `getHorseById`, `getHorseDocuments`, `getRegistrationRequests` |
| `/manager/horses/:id/intake` | `verifyHorse` / `rejectHorse` |
| `/manager/horses/:id/post-exam` | `getHorseById` (view `HealthSummary`), `getStalls('Available')`, `completeHorseIntake` or `rejectHorse` |
| `/owner/horses` | `getHorses()` (the backend filters to the owner's own horses) |
| `/owner/horses/:id` | `getHorseById`, `getHorseDocuments` |
| `/owner/horses/:id/correction-request` | `submitProfileProposal` (multipart), `getChangeRequestOptions`, `withdrawProfileProposal` |
| `/vet/horses-needing-exam` | `getPendingInitialExams` |
| `/vet/horses/:id` | `getHorseById`, `getMedicalRecords` |
| `/vet/horses/:id/examination` | `saveExaminationDraft`, `finalizeExamination` (pass `DraftMedicalRecordID`) |
| `/manager/profile-change-requests` | `getProfileChangeRequests`, `reviewProfileChangeRequest` |

## 10. Frontend for Flow 2–4

The table below is historical screen guidance. The current frontend already has training and
veterinary workspaces; API support must be checked against current routes, serializers and services.
For the implemented Vet screens, connected endpoints and remaining rules/assets, see
[Vet workspace handoff, 22/10/2026](VET_WORKSPACE_20261022.md).

Suggested screens by role:

| Role | Screen | Main APIs |
|---|---|---|
| Head Trainer | Horse overview (training lock, trainer, latest session) | `GET /training-dashboard` |
| Head Trainer | Horse assessment, trainer assignment | `POST /horses/{id}/assessments`, `GET /trainers`, `POST /trainer-assignments`, `POST /trainer-assignments/{id}/end` |
| Head Trainer | Approve training plans | `GET /training-plans?Status=Pending Approval`, `POST /training-plans/{id}/approve`, `.../return` |
| Head Trainer | Training schedule (view), substitute supervisors, main work riders | `GET /training-sessions?From=&To=`, `POST /training-sessions/substitute-day`, `POST /training-sessions/{id}/substitute`, `GET .../substitute-suggestions`, `PUT /horses/{id}/main-work-rider`, `POST /work-riders/{id}/specializations` |
| Head Trainer | Diet plans (finalize after the Vet's advice) | `POST /horses/{id}/diet-plans`, `POST /diet-plans/{id}/finalize` |
| Trainer | Assigned horses, write training plans | `GET /trainer-assignments?mine=1`, `POST /training-plans`, `.../stages`, `.../submit`, `.../revise` |
| Trainer | Schedule sessions for own horses, close stages, training-related care tasks | `POST /training-sessions`, `PATCH /training-sessions/{id}`, `.../cancel`, `GET /work-riders?HorseID=&Date=&StartTime=`, `POST /training-plan-stages/{id}/close`, `POST /care-tasks` |
| Trainer | Today's supervised sessions, session review | `GET /training-sessions?mine=1&Date=`, `.../stop`, `.../substitute-observation`, `.../review` |
| Work Rider | Today's rides, record results | `GET /training-sessions?mine=1&Date=`, `.../start`, `.../result` |
| Vet | Health report queue | `GET /health-reports?open=1`, `.../take`, `.../resolve` |
| Vet | Examination, prescribe treatments, sign, Training Lock | `POST /horses/{id}/medical-records`, `.../treatments`, `POST /medical-records/{id}/sign`, `POST /training-locks/{id}/release` |
| Vet | Vaccinations, medical schedule, diet advice / approval, medical care tasks, supply requests | `GET /vaccinations?DueWithinDays=14`, `POST /diet-plans/{id}/comment`, `.../approve`, `POST /care-tasks`, `POST /inventory-requests` |
| Groom | Today's tasks (generated by rules), diet plan, report incidents, request inventory | `GET /care-tasks?mine=1&Date=`, `.../complete` (`IntakeStatus` for feeding), `.../skip`, `GET /horses/{id}/current-diet`, `POST /horses/{id}/health-reports`, `POST /inventory-requests` |
| Head Trainer | Write diet by training plan, care rules | `GET /horses/{id}/diet-context`, `POST /horses/{id}/diet-plans`, `GET/PATCH /care-rules`, `POST /care-tasks/generate` |
| Manager | Inventory, approve requests, Groom board, vet duty roster | `GET /inventory-items`, `POST /inventory-items/{id}/stock`, `POST /inventory-requests/{id}/approve`, `GET /horse-grooms`, `GET /grooms`, `PUT /horses/{id}/groom`, `GET/POST /vet-duty-shifts` |
| Horse Owner | Training tab of a horse: plan + stage summaries, session list, session detail | `GET /owner/horses/{id}/training-plans`, `GET /owner/training-plans/{id}`, `GET /owner/horses/{id}/training-sessions`, `GET /owner/training-sessions/{id}` |
| All roles | Notification bell | `GET /notifications` |

## 11. Profile update proposals (2026-10-16)

The Owner correction screen and Manager review screen now use the same complete proposal.
The old JSON creation contract and existing request IDs remain supported. All paths below
have the `/api` prefix.

| Method / route | Contract / access |
|---|---|
| `GET /horses/{id}/profile-change-options` | Owner + `PROFILE_EDIT_REQUEST`: `MaxFileMB`, `MaxFiles`, `DocumentTypes`, `ClearableFields` |
| `POST /horses/{id}/profile-change-requests` | Owner's approved horse, `PROFILE_EDIT_REQUEST`; JSON for fields/existing media, multipart for new files |
| `GET /profile-change-requests[?HorseID=…&Status=…]` | Owner's horses or Manager's club, with the corresponding profile permission |
| `GET /profile-change-requests/{id}` | Same scope as list; immutable proposal with all changes and attachments |
| `GET /profile-change-requests/{id}/attachments/{index}[?download=1]` | Same request scope; authenticated file response, private/no-store, no public media URLs |
| `POST /profile-change-requests/{id}/approve` | Club Manager + `PROFILE_EDIT_APPROVE`, optional `ReviewNote` |
| `POST /profile-change-requests/{id}/reject` | Club Manager + `PROFILE_EDIT_APPROVE`, nonblank `ReviewNote` required |
| `POST /profile-change-requests/{id}/withdraw` | Original requester who still owns the horse + `PROFILE_EDIT_REQUEST`; pending only |

For multipart creation, send `Payload` containing JSON and files under `file0`, `file1`, etc.:

```json
{
  "Changes": {"HorseName": "Thunder II", "CoatColor": "Grey"},
  "Reason": "Correct the name using the certificate",
  "EvidenceDocumentIDs": [12],
  "RemoveImageIDs": [8],
  "AvatarDocumentID": 10,
  "Attachments": [
    {"FileKey": "file0", "Purpose": "replace", "DocumentName": "Corrected certificate",
     "DocumentType": "Passport", "ReplacesDocumentID": 11, "Note": "Corrected spelling"},
    {"FileKey": "file1", "Purpose": "add", "DocumentName": "Owner supporting record", "DocumentType": "Other"}
  ]
}
```

`Purpose` is `avatar`, `image`, `evidence`, `add`, or `replace`. Choose one uploaded avatar
or one `AvatarDocumentID`, never both. Image purposes accept JPG/JPEG/PNG/WebP; documents
use the existing PDF/image upload validator. Extension and file signature must agree;
empty/oversized/disallowed files are rejected. Defaults: `UPLOAD_MAX_MB=10`,
`CHANGE_REQUEST_MAX_FILES=12`. The UI reads these limits from the server. There is no
pre-upload step: failed request creation removes its staged files, including partial disk writes.

The server reads old values, ownership, club, and media from the database. It normalizes
values, omits unchanged fields, and rejects a proposal without an actual change (evidence
alone is not a profile change). Existing `EvidenceDocumentID` is also supported. Owner
may only reference visible, active documents on the same horse. Replacement is restricted
to the Owner's own documents, excluding profile photos, contracts, and handover records.
Only the Owner's own profile photos may be proposed for removal. Removing the current
avatar requires a replacement. Scanned documents remain documents, distinct from profile photos.

The existing stricter rule remains: **one pending request per horse**. A conflict returns
HTTP 409 with `code=PENDING_REQUEST_EXISTS` and `RequestID`; the UI links to that request.
Fields in the current write serializer are all required, so `ClearableFields=[]`; blank and
null values are invalid rather than interpreted as deletion. There are no model fields for
origin, identification description, Owner health notes, document issue date, or expiry date.
Those fields have not been added. Owner can attach supporting health documents without
changing Vet conclusions or records.

`ChangedFields` now includes `Changes` (all old/new values), `Attachments`, `EvidenceDocuments`,
`CurrentAvatar`, `AvatarDocument`, and `RemovedImages`. File records include name, size,
content type, purpose, optional note, and previous-document metadata. Internal disk paths
and the server snapshot are omitted from API responses. Review responses also expose
`ReviewedAt`, `ReviewedBy`, `ReviewedByName`, and `ReviewNote`. Status values are `Pending`,
`Approved`, `Rejected`, `Withdrawn`. Resolved requests cannot be edited or processed again.
Creating a new proposal from a rejection re-fetches the horse/documents and revalidates;
the Owner explicitly reselects files for the new request.

Approval locks the horse then the request, checks club/permission/status, compares the full
profile/ownership/active and historical document snapshot, and revalidates proposed values
and file availability. A stale snapshot returns HTTP 409 `STALE_PROFILE`. All field updates,
document versions, photo flags, reviewer information, and audit records commit together or
roll back together. Legacy requests without a snapshot compare their changed fields' old values.
Pending/rejected/withdrawn uploads never enter `HorseDocument`. Evidence stays request-only
even after approval. Replaced/removed records and physical files remain available to authorized
history viewers. Documents referenced by request history cannot be permanently deleted.
Owner direct upload to the approved profile now returns `APPROVAL_REQUIRED`; draft/rejected
registration editing and upload continue through the existing endpoints.

Changed implementation files:

- Backend: `apps/horses/change_requests.py`, `models.py`, `serializers.py`, `services.py`,
  `views.py`, `documents.py`; `config/settings.py`, `.env.example`.
- Frontend: `pages/owner/OwnerCorrectionRequest.jsx` and `.css`,
  `pages/manager/ProfileChangeRequests.jsx`, `api/horseApi.ts`, `App.jsx` (navigation blocking),
  `components/horse/ProfileProposalDetails.jsx`, `proposalLabels.js`, `HorseAvatar.jsx`, `HorseDocuments.jsx`.
- Schema: `sql/migrations/20261016_profile_change_media.sql` is the additive, re-runnable
  existing-database migration. `sql/horse_v2.sql` reflects the same schema for new demo databases.
  The additive migration was applied to local SQL Server on 2026-10-16 to correct the initial
  missing-column regression; original document/request values were verified unchanged.
  No database reset was run. `python manage.py upgrade_profile_media` checks another database;
  use `--apply` to perform the additive upgrade explicitly.
- Tests: `apps/core/tests/test_profile_proposals.py`, `browser_fixture.py`,
  `frontend/tests/api.test.mjs`, `frontend/tests/profile-proposal.browser.mjs`.

Validation uses the actual Django services with temporary SQLite, FE adapter HTTP contract
tests, and a real Chromium browser against the isolated Django fixture API. The browser
exercises desktop/mobile, unsaved navigation, failed-network retry retaining fields/files,
combined proposals, unchanged live profiles while pending, Manager approval and Owner withdrawal.
Run commands are in the backend/frontend READMEs. Local SQL Server schema deployment and live
read APIs for horse 8 were subsequently verified after fixing the initial deployment mismatch.
SQL Server locking under simultaneous requests and production storage deployment still require
verification in the target environment; SQLite tests cannot verify those database-specific behaviors.

## 12. Administration (Club Manager)

The Club Manager is the club's administrator (`RBAC_MANAGE`, `AUDIT_VIEW`, `CLUB_MANAGE`). Two levels of authorization:

```
Account ──assigned──> Role ──can do──> Permission (function)
  PUT /users/{id}/roles      PUT /roles/{RoleCode}/permissions
```

Permissions are read from the database on every request, so changes apply **immediately** (no code change, no re-login).

### 12.1 Accounts

| Method | URL | Notes |
|---|---|---|
| PUT | `/users/{UserID}/roles` | `{"RoleCodes": ["TRAINER", "GROOM"]}` – replaces all roles of the account → `User` |
| POST | `/users/{UserID}/lock` | `{"Reason"?}` → `Status: Suspended`; the user cannot log in and **existing tokens are rejected at once** (401); email to the user |
| POST | `/users/{UserID}/unlock` | → `Status: Active` |
| POST | `/users/{UserID}/reset-password` | → `User` + `TemporaryPassword` (**returned once**, give it to the person); old tokens stop working; email to the user |

Rules (error `code`):
- only people in the Manager's own club (`404` otherwise); no self-lock / self password reset / removing one's own `CLUB_MANAGER` role (`SELF_ACTION`);
- the club keeps at least one active Manager (`LAST_MANAGER`);
- `HORSE_OWNER` is never combined with staff roles, and staff accounts are not turned into owners (`OWNER_ROLE_EXCLUSIVE`);
- a role is not removed / an account is not locked while the person still has pending work (`ROLE_IN_USE`, the message lists it):
  Trainer – horses in charge or substitute sessions; Work Rider – assigned sessions; Vet – draft medical records or health
  reports in progress; Groom – pending care tasks; Owner – owned horses. Reassign the work first.

### 12.2 Permission matrix (role → functions)

| Method | URL | Notes |
|---|---|---|
| GET | `/roles` | `{"Roles": [{RoleCode, RoleName, UserCount, IsLocked, Permissions: [...]}], "Permissions": [{PermissionCode, PermissionName, Description, Group, ExclusiveRole}], "LockedCells": [{RoleCode, PermissionCode, Reason}]}` |
| PUT | `/roles/{RoleCode}/permissions` | `{"PermissionCodes": [...]}` – replaces the role's permissions → `{"Added", "Removed"}` + the matrix |
| POST | `/roles/reset-defaults` | back to the default matrix of `sql/horse_v2.sql` → `{"Removed": {...}}` + the matrix |

The frontend draws a table (rows = permissions grouped by `Group`, columns = roles, checkboxes) and greys out `LockedCells`.
Safety locks:
- exclusive permissions: `MEDICAL_MANAGE`, `MEDICAL_SIGN`, `TRAINING_LOCK_MANAGE` only `VETERINARIAN`; `RBAC_MANAGE` only `CLUB_MANAGER`
  (always kept); `HORSE_REGISTER`, `PROFILE_EDIT_REQUEST`, `OWNER_VIEW` only `HORSE_OWNER` → `PERMISSION_LOCKED`;
- `HORSE_OWNER` permissions cannot change (owners are outside the club) → `PERMISSION_LOCKED`;
- every permission keeps at least one role → `PERMISSION_ORPHAN`;
- separation of duties stays in code: nobody approves their own training plan (`SELF_APPROVAL`) or own diet plan.

The matrix is **shared by all clubs** (`Role` / `RolePermission` have no `ClubID`). Every change is in the audit log.

### 12.3 Audit log, club, dashboard

| Method | URL | Who | Notes |
|---|---|---|---|
| GET | `/audit-logs?UserID=&ActionType=&EntityName=&EntityID=&From=&To=&Limit=100&Offset=0` | Manager (`AUDIT_VIEW`) | actions of people in the club, newest first → `{"Total", "Limit", "Offset", "Items": [{AuditLogID, UserID, UserName, ActionType, EntityName, EntityID, ActionTime, Details}]}` (max `Limit` 500) |
| GET | `/clubs/mine` | logged in | own club |
| PATCH | `/clubs/mine` | Manager (`CLUB_MANAGE`) | `{"ClubName"?, "Address"?, "Phone"?, "Email"?}` |
| GET | `/dashboard` | Manager (`CLUB_MANAGE`) | club statistics (below) |

`GET /dashboard` (`Training` / `Medical` / `Care` are `null` until that flow is installed):

```json
{"ClubID": 1, "GeneratedAt": "2026-10-20T22:04:04",
 "Users": {"Total": 18, "ByStatus": {"Active": 18}, "ByRole": {"CLUB_MANAGER": 1, "TRAINER": 3, "GROOM": 3}},
 "Horses": {"Total": 6, "ByRegistrationStatus": {"Approved": 3, "PendingExam": 1}, "ApprovedByHealthStatus": {"Healthy": 3},
            "Stalls": {"Total": 6, "ByStatus": {"Occupied": 3, "Available": 3}}},
 "Training": {"ActiveAssignments": 1, "PlansByStatus": {"Active": 1}, "SessionsToday": {"Completed": 1},
              "SessionsThisWeek": {"Completed": 1, "Assigned": 2}, "SessionsLast30Days": {"Completed": 6, "Cancelled": 1, "Missed": 1},
              "AvgPerformanceScore30Days": 75.3, "SessionsAwaitingReview": 0},
 "Medical": {"OpenHealthReports": 1, "UrgentOpenHealthReports": 0, "ActiveTrainingLocks": {}, "VaccinationsDue14Days": 1,
             "MedicalSchedulesDue14Days": 1},
 "Care": {"DietPlansByStatus": {"Approved": 1}, "CareTasksToday": {"Pending": 8}, "OverdueCareTasks": 2,
          "InventoryByStatus": {"Available": 4, "Low Stock": 1}, "PendingInventoryRequests": 0}}
```

### 12.4 New club and first Manager

Creating a club is a system administration task done on the server (there is no system-admin role in the app):

```powershell
python manage.py create_club --name "Saigon Racing Club" --phone 0281234567 --manager-email manager@sgr.vn --manager-name "Nguyễn Văn A"
```

It prints a temporary password; the Manager logs in, changes the password and manages the club from section 12.1–12.3.

### 12.5 Database

On an existing database run `sql/migrations/20261020_admin_notification_read.sql` (adds `NotificationRead`). Everything else
uses existing tables. After this version is deployed, tokens issued before it are rejected once (they do not carry the password
check) – everyone logs in again one time.

