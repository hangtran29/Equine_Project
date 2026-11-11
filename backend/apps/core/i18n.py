"""
Song ngữ cho API: câu thông báo mặc định tiếng Việt, gửi kèm header `X-Language: en` (hoặc `?lang=en`)
thì backend trả câu tiếng Anh.

- Áp dụng cho: thông báo lỗi (detail, lỗi từng trường), tiêu đề thông báo (GET /api/notifications),
  câu mặc định của Django / DRF ("This field is required."...).
- KHÔNG đổi: mã lỗi (`code`), tên trường JSON, giá trị trạng thái (Draft, Approved...) và dữ liệu người dùng nhập.
- Câu chưa có trong EN thì giữ tiếng Việt. Thêm câu mới: thêm một dòng vào EN (hoặc PATTERNS nếu câu có phần thay đổi).

Không dùng Accept-Language của trình duyệt: trình duyệt tiếng Anh mà giao diện đang tiếng Việt thì lỗi sẽ lệch ngôn ngữ.
Frontend chủ động gửi X-Language theo nút VI / EN.
"""
import re

from django.utils import translation

SUPPORTED = ("vi", "en")
DEFAULT = "vi"


def request_language(request) -> str:
    value = (request.GET.get("lang") or request.headers.get("X-Language") or "").strip().lower()[:2]
    return value if value in SUPPORTED else DEFAULT


class LanguageMiddleware:
    """Bật ngôn ngữ theo X-Language / ?lang= cho từng request; trả header Content-Language."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        language = request_language(request)
        request.LANGUAGE_CODE = language
        with translation.override(language):
            response = self.get_response(request)
        response.headers["Content-Language"] = language
        return response


def is_english() -> bool:
    return (translation.get_language() or DEFAULT).startswith("en")


EN = {
    # ---------- tài khoản / đăng nhập ----------
    "Email hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.": "Wrong email or password, or the account is locked.",
    "Email đã được sử dụng.": "This email is already in use.",
    "Cần nhập số điện thoại (Phone).": "Please enter a phone number (Phone).",
    "Cần nhập địa chỉ (Address).": "Please enter an address (Address).",
    "Số điện thoại không hợp lệ: 10 số bắt đầu bằng 0 (vd 0901234567) hoặc dạng +84 (vd +84901234567).":
        "Invalid phone number: 10 digits starting with 0 (e.g. 0901234567) or +84 (e.g. +84901234567).",
    "RoleCode không tồn tại.": "RoleCode does not exist.",
    "Cần nhập mật khẩu.": "Please enter a password.",
    "Mật khẩu phải có ít nhất 6 ký tự.": "Password must be at least 6 characters.",
    "Cần chọn câu lạc bộ.": "Please select a club.",
    "Câu lạc bộ không tồn tại hoặc đã ngừng hoạt động.": "The club does not exist or is inactive.",
    "Bạn không có quyền xem người dùng này.": "You are not allowed to view this user.",
    "Thiếu Credential từ Google.": "Missing Credential from Google.",
    "Máy chủ chưa bật đăng nhập Google (thiếu GOOGLE_CLIENT_ID trong.env).":
        "Google sign-in is not enabled on the server (GOOGLE_CLIENT_ID missing in .env).",
    "Tài khoản Google này chưa xác minh email.": "This Google account has not verified its email.",
    "Không xác minh được tài khoản Google, vui lòng thử lại.": "Could not verify the Google account, please try again.",
    "Bạn không có quyền thực hiện thao tác này.": "You do not have permission to do this.",
    # ---------- giấy tờ ----------
    "Chỉ nhận file PDF, JPG, PNG hoặc WEBP.": "Only PDF, JPG, PNG or WEBP files are accepted.",
    "File rỗng.": "The file is empty.",
    "Nội dung file không đúng định dạng (file hỏng hoặc đổi đuôi).":
        "The file content does not match its type (corrupted or renamed file).",
    "Đường dẫn file không hợp lệ.": "Invalid file path.",
    "Cần chọn file.": "Please choose a file.",
    "Cần chọn loại giấy tờ.": "Please select a document type.",
    "Loại giấy tờ không hợp lệ.": "Invalid document type.",
    "Không tìm thấy giấy tờ.": "Document not found.",
    "Bạn không được thêm giấy tờ cho ngựa này.": "You are not allowed to add documents to this horse.",
    "Ngựa đã lưu trữ, không thêm giấy tờ được.": "The horse is archived; documents cannot be added.",
    "Bạn không được xóa giấy tờ của ngựa này.": "You are not allowed to delete this horse's documents.",
    "Chỉ xóa được giấy tờ do chính bạn tải lên.": "You can only delete documents you uploaded.",
    "Hồ sơ đã gửi, không xóa giấy tờ được nữa.": "The record has been submitted; documents can no longer be deleted.",
    "Giấy tờ đang là bằng chứng của yêu cầu sửa lý lịch, không xóa được.":
        "This document is evidence for a profile change request and cannot be deleted.",
    "Giấy tờ này là link ngoài, mở bằng FileUrl.": "This document is an external link; open it with FileUrl.",
    "Không tìm thấy file trên máy chủ.": "File not found on the server.",
    "Loại tài liệu không hợp lệ (Passport, Microchip Certificate, Ownership Proof, Handover Record, Contract, Other).":
        "Invalid document type (Passport, Microchip Certificate, Ownership Proof, Handover Record, Contract, Other).",
    # ---------- hồ sơ ngựa ----------
    "Ngày sinh không được ở tương lai.": "Date of birth cannot be in the future.",
    "Số microchip phải gồm đúng 15 chữ số (chuẩn ISO 11784/11785; 3 số đầu là mã quốc gia hoặc nhà sản xuất), "
    "vd 985141000123401.":
        "Microchip number must be exactly 15 digits (ISO 11784/11785; the first 3 digits are the country or "
        "manufacturer code), e.g. 985141000123401.",
    "Số microchip đã tồn tại ở một ngựa khác.": "This microchip number already belongs to another horse.",
    "Số hộ chiếu / đăng ký chỉ gồm chữ, số, dấu '-' hoặc '/', dài 5-50 ký tự, vd VN-TB-2021-0142.":
        "Passport / registration number may only contain letters, digits, '-' or '/', 5-50 characters, "
        "e.g. VN-TB-2021-0142.",
    "Số hộ chiếu / đăng ký đã được dùng cho một ngựa khác.":
        "This passport / registration number is already used by another horse.",
    "Tên ngựa cha không được trùng tên chính con ngựa này.": "The sire name cannot be the same as the horse name.",
    "Tên ngựa mẹ không được trùng tên chính con ngựa này.": "The dam name cannot be the same as the horse name.",
    "Tên ngựa cha và ngựa mẹ không được giống nhau.": "The sire and dam names cannot be the same.",
    "Cần nhập ngày sinh (DateOfBirth).": "Please enter the date of birth (DateOfBirth).",
    "Ngày sinh phải theo dạng YYYY-MM-DD, vd 2021-03-12.": "Date of birth must be YYYY-MM-DD, e.g. 2021-03-12.",
    "Cần chọn giới tính (Gender).": "Please select the sex (Gender).",
    "Giới tính phải là Male (đực), Female (cái) hoặc Gelding (đực đã thiến).": "Sex must be Male, Female or Gelding.",
    "Giới tính ngựa phải là Male (đực), Female (cái) hoặc Gelding (đực đã thiến).": "Sex must be Male, Female or Gelding.",
    "tên ngựa (HorseName)": "horse name (HorseName)",
    "giống ngựa (Breed)": "breed (Breed)",
    "màu lông (CoatColor)": "coat color (CoatColor)",
    "tên ngựa cha (SireName)": "sire name (SireName)",
    "tên ngựa mẹ (DamName)": "dam name (DamName)",
    "số microchip (MicrochipNumber)": "microchip number (MicrochipNumber)",
    "số hộ chiếu / đăng ký (PassportNumber)": "passport / registration number (PassportNumber)",
    "Không tìm thấy ngựa.": "Horse not found.",
    "Bạn không được sửa hồ sơ ngựa này.": "You are not allowed to edit this horse record.",
    "Bạn không được gửi hồ sơ ngựa này.": "You are not allowed to submit this horse record.",
    "Tài khoản của bạn chưa thuộc câu lạc bộ nào (ClubID trống) nên chưa tạo được ngựa.":
        "Your account does not belong to any club (ClubID is empty), so you cannot create horses.",
    "Quản lý câu lạc bộ tạo hồ sơ cần chọn chủ ngựa (OwnerID).": "Please select the horse owner (OwnerID).",
    "Không tìm thấy chủ ngựa với OwnerID này.": "No horse owner found with this OwnerID.",
    "Cần chọn câu lạc bộ đang hoạt động (ClubID).": "Please select an active club (ClubID).",
    "Ngựa chưa có phiếu khám đầu vào đã chốt.": "The horse has no signed intake exam yet.",
    "Kết quả khám đầu vào không đạt (sức khỏe phải là Healthy hoặc Monitor và không bị cấm tập). Hãy từ chối hồ sơ.":
        "The intake exam did not pass (health must be Healthy or Monitor and the horse must not be barred from "
        "training). Reject the record.",
    "Mã ngựa đã tồn tại trong câu lạc bộ.": "This horse code already exists in the club.",
    "Ngựa này đang có một yêu cầu sửa lý lịch chờ duyệt.": "This horse already has a pending profile change request.",
    "Chưa có trường nào cần sửa.": "No field to change.",
    "Tài liệu bằng chứng không thuộc ngựa này.": "The evidence document does not belong to this horse.",
    "Yêu cầu này đã được xử lý.": "This request has already been processed.",
    "Cần ghi lý do từ chối (ReviewNote).": "Please enter a rejection reason (ReviewNote).",
    "Chỉ chủ ngựa được gửi yêu cầu sửa lý lịch.": "Only the horse owner can request profile changes.",
    "Trạng thái hồ sơ ngựa không hợp lệ.": "Invalid horse registration status.",
    "Tình trạng sức khỏe ngựa không hợp lệ.": "Invalid horse health status.",
    "Ngựa đã duyệt phải có mã ngựa (HorseCode).": "An approved horse must have a horse code (HorseCode).",
    "Trạng thái hồ sơ tiếp nhận không hợp lệ.": "Invalid registration request status.",
    "Trạng thái yêu cầu sửa lý lịch không hợp lệ.": "Invalid profile change request status.",
    "sửa lý lịch": "edit the profile",
    "gửi hồ sơ": "submit the record",
    "xác minh hồ sơ": "verify the record",
    "từ chối hồ sơ": "reject the record",
    "duyệt hồ sơ": "approve the record",
    "lưu trữ hồ sơ": "archive the record",
    "gửi yêu cầu sửa lý lịch": "request a profile change",
    "xếp chuồng": "assign a stall",
    # ---------- chuồng ----------
    "Không tìm thấy chuồng.": "Stall not found.",
    "Cần chọn chuồng.": "Please select a stall.",
    "Số chuồng đã tồn tại trong câu lạc bộ.": "This stall number already exists in the club.",
    "Chuồng đang có ngựa, chuyển ngựa đi trước khi đổi trạng thái.":
        "The stall is occupied; move the horse out before changing its status.",
    "Chuồng không tồn tại trong câu lạc bộ.": "The stall does not exist in this club.",
    "Chuồng này không còn trống.": "This stall is no longer available.",
    "Chuồng này đang có ngựa khác.": "This stall already has another horse.",
    "Ngựa này đang ở một chuồng khác.": "This horse is already in another stall.",
    "Occupied do hệ thống tự đặt khi xếp ngựa vào chuồng.": "Occupied is set automatically when a horse is assigned.",
    # ---------- khám đầu vào ----------
    "Chỉ khám đầu vào khi hồ sơ ngựa đang chờ khám.":
        "Intake exams are only possible while the record is awaiting an exam (PendingExam).",
    "Không tìm thấy hồ sơ tiếp nhận đang chờ khám.": "No intake record awaiting an exam was found.",
    "Hồ sơ tiếp nhận này đã có phiếu khám đầu vào.": "This intake already has an intake exam.",
    "Ngựa chưa được tiếp nhận nên chỉ được lập phiếu khám đầu vào.":
        "The horse has not been accepted yet, so only an intake exam is allowed.",
    "Phiếu khám đã chốt không được sửa. Hãy thêm phiếu đính chính.":
        "A signed exam record cannot be edited. Add an amendment instead.",
    "Chỉ bác sĩ thú y lập phiếu mới được sửa / chốt phiếu nháp này.": "Only the vet who started this draft can edit or sign it.",
    "Không được đổi loại khám. Hãy xóa phiếu nháp và lập phiếu mới.":
        "The exam type cannot be changed. Delete the draft and start a new one.",
    "Phiếu nháp thì sửa trực tiếp, không cần phiếu đính chính.": "Edit a draft directly; no amendment is needed.",
    "Mức Restricted cần ghi rõ hạn chế tập (RestrictionNote).": "Restricted requires a training restriction (RestrictionNote).",
    "Cân nặng phải lớn hơn 0.": "Weight must be greater than 0.",
    "Chiều cao phải lớn hơn 0.": "Height must be greater than 0.",
    "Không được âm.": "Must not be negative.",
    "Ngày tái khám không được trước ngày khám.": "The follow-up date cannot be before the exam date.",
    "Không tìm thấy phiếu khám.": "Exam record not found.",
    "Bệnh án đã chốt không được sửa hoặc xóa. Hãy thêm phiếu đính chính.":
        "A signed medical record cannot be edited or deleted. Add an amendment instead.",
    "Loại khám phải là Initial Exam, Routine Exam, Injury Exam, Follow-up hoặc Emergency.":
        "Exam type must be Initial Exam, Routine Exam, Injury Exam, Follow-up or Emergency.",
    "Tình trạng sức khỏe phải là Healthy, Monitor, Injured, Recovering hoặc Isolated.":
        "Health status must be Healthy, Monitor, Injured, Recovering or Isolated.",
    "Kết luận tập luyện phải là Eligible, Restricted hoặc Not Eligible.":
        "Training eligibility must be Eligible, Restricted or Not Eligible.",
    "Cân nặng và chiều cao phải lớn hơn 0.": "Weight and height must be greater than 0.",
    "Ngày tái khám phải sau hoặc bằng ngày khám.": "The follow-up date must be on or after the exam date.",
    "Phiếu khám đã chốt phải có thời điểm chốt.": "A signed exam record must have a signing time.",
    # ---------- chung ----------
    "Thao tác không hợp lệ với trạng thái hiện tại.": "This action is not allowed in the current state.",
    "Không tìm thấy.": "Not found.",
    "Phải là số nguyên.": "Must be a whole number.",
    "Ngày không hợp lệ, dùng dạng YYYY-MM-DD.": "Invalid date, use YYYY-MM-DD.",
    "Có giá trị nhập vào quá dài so với giới hạn của database.": "A value is too long for the database.",
    "Dữ liệu vi phạm ràng buộc của database.": "The data violates a database constraint.",
    "câu lạc bộ (ClubID)": "club (ClubID)",
    "chủ ngựa (OwnerID)": "horse owner (OwnerID)",
    "ngựa (HorseID)": "horse (HorseID)",
    "người dùng (UserID)": "user (UserID)",
    "bác sĩ thú y (VetID)": "veterinarian (VetID)",
    "chuồng (StallID)": "stall (StallID)",
    "vai trò (RoleID)": "role (RoleID)",
    "tên ngựa": "horse name",
    "số microchip": "microchip number",
    "số hộ chiếu / đăng ký": "passport / registration number",
    "họ tên": "full name",
    "số điện thoại": "phone number",
    "địa chỉ": "address",
    # ---------- tiêu đề thông báo (GET /api/notifications) ----------
    "Hồ sơ ngựa chờ xác minh": "Horse record awaiting verification",
    "bác sĩ thú y đã khám đầu vào, chờ duyệt tiếp nhận": "Intake exam done, awaiting approval",
    "Yêu cầu sửa lý lịch chờ duyệt": "Profile change request awaiting review",
    "Ngựa chờ khám đầu vào": "Horse awaiting intake exam",
    "Phiếu khám nháp chưa chốt": "Unsigned draft exam record",
    "Hồ sơ ngựa bị từ chối, cần sửa và gửi lại": "Horse record rejected; edit and resubmit",
    "Khẩu phần chờ bác sĩ thú y duyệt": "Diet plan awaiting vet review",
    "Huấn luyện viên đề nghị điều chỉnh giáo án": "Trainer requested a training plan adjustment",
    "Khẩu phần bị bác sĩ thú y trả về": "Diet plan returned by the vet",
    "Giáo án bị trả về": "Training plan returned",
    "Cần ghi nhận xét buổi tập đã giám sát thay": "Add notes for the session you supervised as substitute",
    "Buổi tập chờ đánh giá": "Training session awaiting review",
}

PATTERNS = [
    (re.compile(r"^Không thể (.+) khi hồ sơ đang ở trạng thái (.+)\.$"),
     lambda m: f"Cannot {translate_text(m[1])} while the record is {m[2]}."),
    (re.compile(r"^Cần nhập đủ thông tin trước khi gửi: (.+)\.$"),
     lambda m: f"Fill in these fields before submitting: {m[1]}."),
    (re.compile(r"^Cần nhập đủ trước khi chốt phiếu: (.+)\.$"), lambda m: f"Fill in these fields before signing: {m[1]}."),
    (re.compile(r"^Không được xin sửa các trường: (.+)\. Chỉ được: (.+)\.$"),
     lambda m: f"These fields cannot be changed: {m[1]}. Allowed: {m[2]}."),
    (re.compile(r"^Ngày sinh không hợp lệ: ngựa không thể quá (\d+) tuổi\.$"),
     lambda m: f"Invalid date of birth: a horse cannot be older than {m[1]}."),
    (re.compile(r"^File quá lớn, tối đa (\d+) MB\.$"), lambda m: f"File too large, maximum {m[1]} MB."),
    (re.compile(r"^Cần chọn người dùng đang hoạt động trong câu lạc bộ có vai trò (.+)\.$"),
     lambda m: f"Select an active club member with the role {m[1]}."),
    (re.compile(r"^Thiếu dữ liệu bắt buộc: (.+) \(bảng (.+)\) không được để trống\.$"),
     lambda m: f"Missing required data: {translate_text(m[1])} (table {m[2]}) cannot be empty."),
    (re.compile(r"^Không tìm thấy dữ liệu liên quan: (.+) không tồn tại \((.+)\)\.$"),
     lambda m: f"Related data not found: {translate_text(m[1])} does not exist ({m[2]})."),
    (re.compile(r"^Dữ liệu bị trùng với một bản ghi đã có \((.+)\)\.$"),
     lambda m: f"This duplicates an existing record ({m[1]})."),
    (re.compile(r"^(.+) quá dài so với giới hạn của database\.$"),
     lambda m: f"{translate_text(m[1]).capitalize()} is too long for the database."),
    (re.compile(r"^Dữ liệu không hợp lệ \(vi phạm ràng buộc (.+)\)\.$"),
     lambda m: f"Invalid data (violates constraint {m[1]})."),
    (re.compile(r"^Không xóa được vì dữ liệu này đang được dùng ở nơi khác \((.+)\)\.$"),
     lambda m: f"Cannot delete: this data is used elsewhere ({m[1]})."),
    (re.compile(r"^Báo cáo sức khỏe \((.+)\) - (.+)$"), lambda m: f"Health report ({m[1]}) - {m[2]}"),
    (re.compile(r"^Yêu cầu sửa lý lịch: (.+)$"), lambda m: f"Profile change request: {m[1]}"),
    (re.compile(r"^Yêu cầu vật tư của (.+)$"), lambda m: f"Supply request from {m[1]}"),
    (re.compile(r"^Giáo án của (.+) chờ duyệt$"), lambda m: f"Training plan by {m[1]} awaiting approval"),
    (re.compile(r"^Tiêm (.+)$"), lambda m: f"Vaccination: {m[1]}"),
    (re.compile(r"^Lịch (.+)$"), lambda m: f"Schedule: {m[1]}"),
    (re.compile(r"^Cần nhập (.+)\.$"), lambda m: f"Please enter {translate_text(m[1])}."),  # để cuối: câu chung
]


def translate_text(text: str) -> str:
    """Câu tiếng Việt -> tiếng Anh; chưa có bản dịch thì trả lại nguyên văn."""
    if not isinstance(text, str) or not text:
        return text
    if text in EN:
        return EN[text]
    for pattern, build in PATTERNS:
        match = pattern.match(text)
        if match:
            return build(match)
    return text


def translate_data(data, key=None):
    """Dịch các chuỗi trong dict / list lỗi trả về (giữ nguyên tên khóa và trường `code`)."""
    if key == "code":
        return data
    if isinstance(data, dict):
        return {k: translate_data(v, k) for k, v in data.items()}
    if isinstance(data, list):
        return [translate_data(item, key) for item in data]
    if isinstance(data, str):
        translated = translate_text(str(data))
        if translated is not data and hasattr(data, "code"):  # ErrorDetail: giữ code của DRF
            from rest_framework.exceptions import ErrorDetail
            return ErrorDetail(translated, code=data.code)
        return translated
    return data


# ---------- bộ kiểm tra dữ liệu dùng chung (apps/core/validators.py) và yêu cầu hỗ trợ ----------
EN.update({
    "Vui lòng nhập thông tin này.": "Please fill in this field.",
    "Vui lòng chọn thông tin này.": "Please make a selection.",
    "Nội dung không được chỉ chứa khoảng trắng.": "This field cannot contain only spaces.",
    "Nội dung phải có chữ hoặc chữ số, không chỉ gồm ký tự đặc biệt.": "Use letters or digits, not only special characters.",
    "Lựa chọn không hợp lệ.": "Invalid selection.",
    "Lựa chọn không có trong danh mục.": "This option is not in the list.",
    "Email không được chứa khoảng trắng.": "Email cannot contain spaces.",
    "Email phải có ký tự @.": "Email must contain @.",
    "Email chỉ được có một ký tự @.": "Email can contain only one @.",
    "Email thiếu tên người dùng trước ký tự @.": "Email is missing the user name before @.",
    "Email thiếu tên miền sau ký tự @.": "Email is missing the domain after @.",
    "Email chứa ký tự không hợp lệ.": "Email contains invalid characters.",
    "Dấu chấm trong email đặt sai vị trí.": "A dot in the email is in the wrong place.",
    "Email thiếu phần đuôi tên miền.": "Email is missing the domain extension.",
    "Email thiếu tên miền trước dấu chấm.": "Email is missing the domain name before the dot.",
    "Email thiếu nội dung sau dấu chấm.": "Email is missing text after the dot.",
    "Tên miền của email không hợp lệ.": "The email domain is invalid.",
    "Phần đuôi tên miền không hợp lệ.": "The domain extension is invalid.",
    "Email vượt quá 100 ký tự cho phép.": "Email exceeds 100 characters.",
    "Email này đã được sử dụng trong hệ thống.": "This email is already used in the system.",
    "Số điện thoại không được chứa khoảng trắng.": "Phone number cannot contain spaces.",
    "Số điện thoại chỉ được chứa chữ số.": "Phone number can contain digits only.",
    "Số điện thoại không được chứa ký tự đặc biệt.": "Phone number cannot contain special characters.",
    "Số điện thoại phải bắt đầu bằng số 0.": "Phone number must start with 0.",
    "Số điện thoại chưa đủ 10 chữ số.": "Phone number must have 10 digits.",
    "Số điện thoại vượt quá 10 chữ số.": "Phone number has more than 10 digits.",
    "Đầu số điện thoại không hợp lệ.": "The phone prefix is not valid.",
    "Số điện thoại bàn phải có 10 hoặc 11 chữ số.": "A landline number must have 10 or 11 digits.",
    "Số điện thoại bàn vượt quá 11 chữ số.": "A landline number has more than 11 digits.",
    "Số điện thoại này đã được sử dụng trong hệ thống.": "This phone number is already used in the system.",
    "Họ và tên vượt quá 150 ký tự cho phép.": "Full name exceeds 150 characters.",
    "Họ và tên không được chứa chữ số.": "Full name cannot contain digits.",
    "Họ và tên không được chứa ký tự đặc biệt.": "Full name cannot contain special characters.",
    "Họ và tên phải có ít nhất 2 ký tự.": "Full name must have at least 2 letters.",
    "Ngày không đúng định dạng dd/mm/yyyy.": "Use the date format mm/dd/yyyy.",
    "Ngày sinh không được sau ngày hiện tại.": "Date of birth cannot be in the future.",
    "Năm sinh không hợp lệ.": "Invalid year of birth.",
    "Mã chưa đủ số ký tự theo quy định.": "The code is shorter than required.",
    "Mã vượt quá số ký tự cho phép.": "The code is longer than allowed.",
    "Mã không đúng cấu trúc quy định.": "The code does not follow the required structure.",
    "Mã phải bắt đầu bằng tiền tố được cấp.": "The code must start with an issued prefix.",
    "Chỉ được sử dụng các ký tự theo quy định.": "Only the permitted characters can be used.",
    "Không tìm thấy thông tin ngựa tương ứng với mã đã nhập.": "No horse matches the code entered.",
    "Mã này đã được sử dụng trong hệ thống.": "This code is already used in the system.",
    "Chức vụ không tồn tại.": "The position does not exist.",
    "Tài khoản chưa thuộc câu lạc bộ nào nên chưa gửi được yêu cầu hỗ trợ.":
        "This account does not belong to a club, so support requests cannot be sent yet.",
    "Yêu cầu này đã được xử lý.": "This request has already been resolved.",
    "Không tìm thấy yêu cầu hỗ trợ.": "Support request not found.",
    "Không tìm thấy thông tin ngựa tương ứng.": "Horse not found.",
    "Yêu cầu hỗ trợ đã được phản hồi": "Your support request has been answered",
})
PATTERNS.extend([
    (re.compile(r"^Nội dung vượt quá (\d+) ký tự cho phép\.$"), lambda m: f"This field exceeds {m[1]} characters."),
    (re.compile(r"^(Tên ngựa|Tên ngựa bố|Tên ngựa mẹ|Giống ngựa|Màu lông) vượt quá (\d+) ký tự cho phép\.$"),
     lambda m: f"{translate_text(m[1])} exceeds {m[2]} characters."),
    (re.compile(r"^(Tên ngựa|Tên ngựa bố|Tên ngựa mẹ|Giống ngựa|Màu lông) phải có chữ cái, không chỉ gồm chữ số hoặc ký tự đặc biệt\.$"),
     lambda m: f"{translate_text(m[1])} must contain letters."),
    (re.compile(r"^(Tên ngựa|Tên ngựa bố|Tên ngựa mẹ|Giống ngựa|Màu lông) chứa ký tự không hợp lệ\.$"),
     lambda m: f"{translate_text(m[1])} contains invalid characters."),
    (re.compile(r"^Yêu cầu hỗ trợ mới: (.+)$"), lambda m: f"New support request: {translate_text(m[1])}"),
])
EN.update({"Tài khoản do câu lạc bộ cấp vui lòng liên hệ Quản lý câu lạc bộ để được cấp lại mật khẩu.":
           "Club-issued accounts should contact the club manager to get a new password.",
           "Tên ngựa": "Horse name", "Tên ngựa bố": "Sire name", "Tên ngựa mẹ": "Dam name",
           "Giống ngựa": "Breed", "Màu lông": "Coat color",
           "Vui lòng chọn hoặc nhập giống ngựa.": "Please select or enter a breed.",
           "Vui lòng chọn hoặc nhập màu lông.": "Please select or enter a coat color.",
           "Hồ sơ ngựa": "Horse records", "Tài khoản và đăng nhập": "Account and sign-in",
           "Lịch tập và huấn luyện": "Training schedule", "Sức khỏe và thú y": "Health and veterinary",
           "Chăm sóc và dinh dưỡng": "Care and nutrition", "Vấn đề khác": "Other"})

# ---------- câu lỗi chuẩn của mọi ô nhập (apps/core/drf_messages.py) và các form Flow 2–4 ----------
EN.update({
    "Chỉ dùng chữ không dấu, chữ số và các ký tự - _ /.": "Use unaccented letters, digits and - _ / . only.",
    "Danh sách không hợp lệ.": "Invalid list.",
    "Email không đúng định dạng.": "Invalid email format.",
    "Giá trị có quá nhiều chữ số thập phân.": "Too many decimal places.",
    "Giá trị không hợp lệ.": "Invalid value.",
    "Giá trị phải là số.": "Please enter a number.",
    "Giá trị phải là số nguyên.": "Please enter a whole number.",
    "Giá trị quá dài.": "The value is too long.",
    "Giá trị vượt quá giới hạn cho phép.": "The value exceeds the allowed limit.",
    "Giờ không đúng định dạng HH:mm.": "Use the time format HH:mm.",
    "Không tìm thấy dữ liệu tương ứng.": "No matching record found.",
    "Ngày giờ không đúng định dạng dd/mm/yyyy HH:mm.": "Use the format mm/dd/yyyy HH:mm.",
    "Vui lòng chọn ít nhất một mục.": "Please select at least one item.",
    "Tháng không hợp lệ.": "Invalid month.",
    "Năm không hợp lệ.": "Invalid year.",
    "Ngày không tồn tại trong lịch.": "This date does not exist.",
    "Giờ kết thúc không được trước giờ bắt đầu.": "End time cannot be before start time.",
    "Tốc độ tối đa không được nhỏ hơn tốc độ trung bình.": "Max speed cannot be lower than average speed.",
    "Nhịp tim tối đa không được nhỏ hơn nhịp tim trung bình.": "Max heart rate cannot be lower than average heart rate.",
    "Điểm từ 0 đến 100.": "Score must be between 0 and 100.",
    "Thời lượng phải từ 1 đến 600 phút.": "Duration must be between 1 and 600 minutes.",
    "Quãng đường phải từ 0 đến 100 km.": "Distance must be between 0 and 100 km.",
    "Tốc độ phải từ 0 đến 90 km/h.": "Speed must be between 0 and 90 km/h.",
    "Thời gian hồi phục phải từ 0 đến 240 phút.": "Recovery must be between 0 and 240 minutes.",
    "Nhịp tim phải từ 20 đến 300 lần/phút.": "Heart rate must be between 20 and 300 bpm.",
    "Email này thuộc tài khoản nhân sự, không dùng làm chủ sở hữu ngựa.": "This email belongs to a staff account and cannot be used as a horse owner.",
    "Tên ngựa bố không được trùng tên chính con ngựa này.": "The sire name cannot be the same as this horse's name.",
    "Tên ngựa mẹ không được trùng tên chính con ngựa này.": "The dam name cannot be the same as this horse's name.",
    "Tên ngựa bố và ngựa mẹ không được giống nhau.": "Sire and dam names cannot be the same.",
    "Quyền này chỉ dành cho Quản lý câu lạc bộ.": "This permission is reserved for the club manager.",
    "Quản lý câu lạc bộ luôn phải có quyền này.": "The club manager must always keep this permission.",
})
PATTERNS.extend([
    (re.compile(r"^Giá trị không được lớn hơn (.+)\.$"), lambda m: f"The value cannot be greater than {m[1]}."),
    (re.compile(r"^Giá trị không được nhỏ hơn (.+)\.$"), lambda m: f"The value cannot be less than {m[1]}."),
    (re.compile(r"^Nội dung phải có ít nhất (\d+) ký tự\.$"), lambda m: f"This field needs at least {m[1]} characters."),
    (re.compile(r"^Chỉ được chọn tối đa (\d+) mục\.$"), lambda m: f"Select at most {m[1]} items."),
    (re.compile(r"^Vui lòng chọn ít nhất (\d+) mục\.$"), lambda m: f"Select at least {m[1]} items."),
])

# Flow 2: thông báo nghiệp vụ huấn luyện
EN.update({
    "Huấn luyện viên đã có chuyên môn này.": "The trainer already has this specialization.",
    "Ngựa không thuộc câu lạc bộ của huấn luyện viên.": "The horse does not belong to the trainer's club.",
    "Huấn luyện viên không có chuyên môn này.": "The trainer does not have this specialization.",
    "Kết luận chỉ được chọn Đề xuất hoặc Không đề xuất.": "The conclusion must be Recommended or Not recommended.",
    "Ngựa đã có huấn luyện viên phụ trách. Vui lòng kết thúc phân công hiện tại trước khi phân công huấn luyện viên mới.":
        "The horse already has a trainer. End the current assignment before assigning a new trainer.",
    "Huấn luyện viên chưa có chuyên môn này.": "The trainer does not have this specialization yet.",
    "Kỵ sĩ tập luyện này đã có trong danh sách ưu tiên của ngựa.": "This work rider is already on the horse's preferred list.",
    "Chỉ huấn luyện viên đang phụ trách ngựa mới được soạn hoặc chỉnh sửa giáo án này.": "Only the horse's assigned trainer can write or edit this plan.",
    "Chỉ chỉnh sửa được giáo án ở trạng thái bản nháp.": "Only draft plans can be edited.",
    "Chỉ huấn luyện viên đang phụ trách ngựa mới được soạn giáo án.": "Only the horse's assigned trainer can write a plan.",
    "Phân công huấn luyện viên của giáo án này đã kết thúc.": "The trainer assignment for this plan has ended.",
    "Vui lòng nhập lý do trả về.": "Please enter the reason for returning the plan.",
    "Chỉ hoàn tất được giáo án đang áp dụng.": "Only active plans can be completed.",
    "Chỉ tạo bản điều chỉnh từ giáo án đang áp dụng hoặc đã hoàn thành.": "Revisions can only be created from active or completed plans.",
    "Chỉ lập buổi tập cho giáo án đang áp dụng (đã được duyệt).": "Sessions can only be scheduled for active (approved) plans.",
    "Kỵ sĩ tập luyện đã có buổi tập khác cùng ngày và cùng thứ tự buổi.": "The work rider already has another session on the same day and slot.",
    "Chỉ chỉnh sửa được buổi tập chưa bắt đầu.": "Only sessions that have not started can be edited.",
    "Chỉ kỵ sĩ tập luyện được phân công mới bắt đầu được buổi tập này.": "Only the assigned work rider can start this session.",
    "Buổi tập không ở trạng thái đã phân công.": "The session is not in the assigned state.",
    "Giáo án của buổi tập không còn được áp dụng.": "The session's plan is no longer active.",
    "Chỉ kỵ sĩ tập luyện của buổi tập mới ghi được kết quả.": "Only the session's work rider can record results.",
    "Vui lòng bắt đầu buổi tập trước khi ghi kết quả.": "Please start the session before recording results.",
    "Chỉ huấn luyện viên giám sát thay thế của buổi tập mới ghi được nhận xét này.": "Only the session's substitute supervisor can add this observation.",
    "Chỉ huấn luyện viên đang phụ trách ngựa mới đánh giá được buổi tập.": "Only the horse's assigned trainer can review the session.",
    "Chỉ huấn luyện viên đang phụ trách ngựa hoặc Huấn luyện viên trưởng mới chốt được giai đoạn.": "Only the assigned trainer or the head trainer can close a stage.",
    "Chỉ chốt được giai đoạn của giáo án đang áp dụng hoặc đã hoàn thành.": "Stages can only be closed on active or completed plans.",
    "Không tìm thấy huấn luyện viên trong câu lạc bộ.": "Trainer not found in the club.",
    "Bạn không có quyền xem hồ sơ huấn luyện viên.": "You do not have permission to view trainer profiles.",
    "Bạn chỉ quản lý kỵ sĩ tập luyện và buổi tập của ngựa mình đang phụ trách.": "You can only manage work riders and sessions of horses you are assigned to.",
    "Chỉ huấn luyện viên đang phụ trách ngựa mới tạo được giáo án.": "Only the horse's assigned trainer can create a plan.",
    "Giai đoạn không thuộc câu lạc bộ của bạn.": "The stage does not belong to your club.",
    "Chỉ huấn luyện viên đang giám sát, huấn luyện viên phụ trách hoặc Huấn luyện viên trưởng mới dừng được buổi tập.":
        "Only the supervising trainer, the assigned trainer or the head trainer can stop the session.",
    "Vui lòng chọn ngựa trong câu lạc bộ hoặc nhập tên ngựa.": "Please select a club horse or enter a horse name.",
    "Chỉ Huấn luyện viên trưởng mới chỉnh sửa được giáo án mẫu.": "Only the head trainer can edit plan templates.",
    "Không tìm thấy buổi tập hoặc buổi tập chưa được huấn luyện viên đánh giá.": "Session not found or not yet reviewed by the trainer.",
})
PATTERNS.extend([
    (re.compile(r"^Giai đoạn còn (\d+) buổi tập chưa kết thúc\. Vui lòng hoàn thành, hủy hoặc đánh dấu vắng các buổi tập này trước khi chốt giai đoạn\.$"),
     lambda m: f"The stage still has {m[1]} unfinished sessions. Complete, cancel or mark them missed before closing the stage."),
])

# ---------- thông báo việc chăm sóc ----------
EN.update({"Cho ăn": "Feeding", "Dọn chuồng": "Stall cleaning", "Tắm, kiểm tra chân": "Bath, leg check",
           "Ngâm chân nước đá": "Ice-water leg soak"})
PATTERNS.append((re.compile(r"^(Cho ăn|Dọn chuồng|Tắm, kiểm tra chân|Ngâm chân nước đá) lúc (.+)$"),
                 lambda m: f"{translate_text(m[1])} at {m[2]}"))


# ---------- thông báo thao tác gửi đến người nhận (apps/core/activity.py) ----------
EN.update({
    "Hồ sơ ngựa đã được xác minh, đang chờ bác sĩ thú y khám": "The horse profile was verified and is awaiting the vet's exam",
    "Ngựa đã được tiếp nhận chính thức vào câu lạc bộ": "The horse was officially admitted to the club",
    "Ngựa mới được tiếp nhận, cần đánh giá và phân công huấn luyện viên":
        "A new horse was admitted and needs assessment and trainer assignment",
    "Hồ sơ ngựa đã được lưu trữ": "The horse profile was archived",
    "Ngựa được chuyển sang chuồng mới": "The horse was moved to a new stall",
    "Bạn được phân công chăm sóc ngựa": "You were assigned to care for a horse",
    "Bạn được phân công huấn luyện ngựa": "You were assigned to train a horse",
    "Vui lòng lập giáo án để bắt đầu huấn luyện.": "Please create a training plan to start training.",
    "Ngựa đã được phân công huấn luyện viên": "A trainer was assigned to the horse",
    "Kết thúc phân công huấn luyện ngựa": "Training assignment ended",
    "Giáo án đã được duyệt": "The training plan was approved",
    "Giáo án đã bị hủy": "The training plan was cancelled",
    "Giáo án đã được hoàn tất": "The training plan was completed",
    "Bác sĩ thú y đã chốt phiếu khám": "The vet finalized an exam record",
    "Báo cáo sức khỏe của bạn đã được xử lý": "Your health report was resolved",
    "Khẩu phần đã được bác sĩ thú y duyệt": "The diet plan was approved by the vet",
    "Khẩu phần mới được áp dụng cho ngựa": "A new diet plan applies to the horse",
    "Bác sĩ thú y đã điều chỉnh khẩu phần": "The vet adjusted the diet plan",
    "Yêu cầu vật tư đã được duyệt": "The supply request was approved",
    "Yêu cầu vật tư bị từ chối": "The supply request was rejected",
    "Chức vụ của bạn đã được cập nhật": "Your position was updated",
    "ca sáng": "morning shift", "ca chiều": "afternoon shift", "ca đêm": "night shift", "cả ngày": "full day",
})
PATTERNS.extend([
    (re.compile(r"^Bạn được xếp buổi tập ngày (.+) lúc (.+)$"), lambda m: f"You were scheduled for a session on {m[1]} at {m[2]}"),
    (re.compile(r"^Bạn giám sát thay buổi tập ngày (.+) lúc (.+)$"), lambda m: f"You will substitute-supervise the session on {m[1]} at {m[2]}"),
    (re.compile(r"^Buổi tập mới được xếp ngày (.+) lúc (.+)$"), lambda m: f"A new session was scheduled on {m[1]} at {m[2]}"),
    (re.compile(r"^Buổi tập ngày (.+) lúc (.+) đã được cập nhật$"), lambda m: f"The session on {m[1]} at {m[2]} was updated"),
    (re.compile(r"^Buổi tập ngày (.+) lúc (.+) đã bị hủy$"), lambda m: f"The session on {m[1]} at {m[2]} was cancelled"),
    (re.compile(r"^Huấn luyện viên đã đánh giá buổi tập ngày (.+)$"), lambda m: f"The trainer reviewed the session on {m[1]}"),
    (re.compile(r"^Bác sĩ (.+) đã tiếp nhận báo cáo sức khỏe của bạn$"), lambda m: f"Dr. {m[1]} took over your health report"),
    (re.compile(r"^(.+) đã thêm ghi chú vào báo cáo sức khỏe$"), lambda m: f"{m[1]} added a note to the health report"),
    (re.compile(r"^(.+) đã bổ sung báo cáo sức khỏe$"), lambda m: f"{m[1]} added details to the health report"),
    (re.compile(r"^Việc chăm sóc mới: (.+) lúc (.+)$"), lambda m: f"New care task: {translate_text(m[1])} at {m[2]}"),
    (re.compile(r"^Bạn được xếp trực ngày (.+) \((.+)\)$"), lambda m: f"You are on duty on {m[1]} ({translate_text(m[2])})"),
])
EN.update({"Ngựa bị giới hạn mức tập": "Horse has restricted training", "Ngựa bị khóa tập toàn bộ": "Horse is fully locked from training",
           "Ngựa được tập lại": "The horse may train again", "Bác sĩ thú y đã mở khóa tập.": "The vet lifted the training lock."})
PATTERNS.extend([
    (re.compile(r"^Buổi tập ngày (.+) lúc (.+) bị dừng giữa chừng$"), lambda m: f"The session on {m[1]} at {m[2]} was stopped midway"),
    (re.compile(r"^(.+) bỏ qua việc (.+) lúc (.+)$"), lambda m: f"{m[1]} skipped the task {translate_text(m[2])} at {m[3]}"),
])
EN.update({"đang xử lý": "in progress", "chờ bác sĩ tiếp nhận": "awaiting vet", "đã xử lý": "resolved",
           "Ngựa bị khóa tập toàn bộ": "Horse is fully locked from training", "Chưa có ngày dự kiến mở": "No expected unlock date",
           "tiêm phòng": "vaccination", "tẩy giun": "deworming", "chăm sóc móng": "hoof care", "khám định kỳ": "routine exam",
           "y tế": "medical"})
PATTERNS.append((re.compile(r"^Báo cáo sức khỏe khẩn #(\d+)$"), lambda m: f"Urgent health report #{m[1]}"))
PATTERNS.append((re.compile(r"^Báo cáo sức khỏe #(\d+)$"), lambda m: f"Health report #{m[1]}"))

# ---------- tiêu đề thông báo (đủ mọi loại, dịch cả phần có số / tên ở giữa) ----------
for _k, _v in {
    "Huấn luyện viên đề nghị điều chỉnh giáo án": "The trainer proposed a training plan adjustment",
    "Khẩu phần bị bác sĩ thú y trả về": "The diet plan was returned by the vet",
    "Chưa có khẩu phần theo giáo án đang chạy": "No diet plan for the active training plan",
    "Giáo án mới: nên lập lại khẩu phần": "New training plan: the diet plan should be redone",
    "Khẩu phần chờ bác sĩ thú y duyệt": "Diet plan awaiting vet approval",
    "Giáo án huấn luyện mới được duyệt": "A new training plan was approved",
    "Giáo án đã kết thúc, có tổng kết": "The training plan ended with a summary",
    "Buổi tập bị dừng giữa chừng": "Session stopped midway",
    "Giáo án bị trả về": "The training plan was returned",
    "Buổi tập chờ đánh giá": "Session awaiting review",
    "Cần ghi nhận xét buổi tập đã giám sát thay": "Comments needed for the session you supervised as substitute",
    "Yêu cầu hỗ trợ đã được phản hồi": "Your support request was answered",
    "Phiếu khám nháp chưa chốt": "Draft exam record not finalized",
    "Ngựa chờ khám đầu vào": "Horse awaiting intake exam",
    "Ngựa chờ khám đầu vào (bạn đang trực)": "Horse awaiting intake exam (you are on duty)",
    "Hồ sơ ngựa chờ xác minh": "Horse profile awaiting verification",
    "bác sĩ thú y đã khám đầu vào, chờ duyệt tiếp nhận": "Intake exam done by the vet, awaiting intake approval",
    "Yêu cầu sửa lý lịch chờ duyệt": "Profile correction request awaiting approval",
    "Hồ sơ ngựa bị từ chối, cần sửa và gửi lại": "The horse profile was rejected; edit and resubmit it",
    "Báo cáo sức khỏe": "Health report", "Báo cáo sức khỏe khẩn": "Urgent health report",
    "Ngựa được tập lại": "The horse may train again",
    "Assigned": "Assigned", "In Progress": "In progress",
}.items():
    EN.setdefault(_k, _v)
PATTERNS[:0] = [
    (re.compile(r"^(\d+) buổi tập mới được huấn luyện viên đánh giá$"), lambda m: f"{m[1]} session(s) newly reviewed by the trainer"),
    (re.compile(r'^Đã có tổng kết giai đoạn "(.+)"$'), lambda m: f'Stage summary available: "{translate_text(m[1])}"'),
    (re.compile(r'^Giai đoạn "(.+)" đã hết hạn, cần chốt tổng kết$'), lambda m: f'Stage "{translate_text(m[1])}" has ended and needs closing'),
    (re.compile(r'^Giáo án nháp từ mẫu "(.+)" cần xem, sửa và gửi duyệt$'), lambda m: f'Draft plan from template "{m[1]}" needs review, editing and submission'),
    (re.compile(r"^Giáo án của (.+) chờ duyệt$"), lambda m: f"Training plan by {m[1]} awaiting approval"),
    (re.compile(r"^Buổi tập (\d\d:\d\d) - (.+)$"), lambda m: f"Session at {m[1]} - {translate_text(m[2])}"),
    (re.compile(r"^Giám sát buổi tập (\d\d:\d\d)(.*)$"), lambda m: f"Supervise the session at {m[1]}{m[2]}"),
    (re.compile(r"^Báo cáo sức khỏe( khẩn)? · (.+)$"), lambda m: ("Urgent health report" if m[1] else "Health report") + f" · {translate_text(m[2])}"),
    (re.compile(r"^Lịch tiêm (.+)$"), lambda m: f"Vaccination schedule: {m[1]}"),
    (re.compile(r"^Lịch (khám định kỳ|tẩy giun|chăm sóc móng|tiêm phòng|y tế)$"), lambda m: f"Schedule: {translate_text(m[1])}"),
    (re.compile(r"^Yêu cầu vật tư của (.+)$"), lambda m: f"Supply request from {m[1]}"),
    (re.compile(r"^Yêu cầu hỗ trợ mới: (.+)$"), lambda m: f"New support request: {translate_text(m[1])}"),
    (re.compile(r"^Yêu cầu sửa lý lịch: (.+)$"), lambda m: f"Profile correction request: {translate_text(m[1])}"),
    (re.compile(r"^Chưa xếp bác sĩ trực (.+)$"), lambda m: "No vet on duty " + m[1].replace("hôm nay", "today").replace("ngày mai", "tomorrow").replace(" và ", " and ")),
    (re.compile(r"^(.+): (Low Stock|Out of Stock) \((.+)\)$"), lambda m: f"{m[1]}: {m[2]} ({m[3]})"),
]
EN.setdefault("Chưa có tài khoản nào dùng email này.", "No account uses this email.")

# Thông báo khóa tập khi xếp buổi tập (Flow 2 + Flow 3)
EN.update({"Không thể xếp buổi tập vì ngựa đang khóa tập toàn bộ.":
           "Cannot schedule a training session because the horse is fully locked from training."})
PATTERNS.append((re.compile(r"^Ngựa đang giới hạn mức tập: mức tải tối đa là (.+)\.$"),
                 lambda m: f"The horse has restricted training: the maximum training load is {m[1]}."))
PATTERNS.extend([
    (re.compile(r"^Phiếu xin vật tư #(\d+) đã được duyệt$"), lambda m: f"Supply request #{m[1]} was approved"),
    (re.compile(r"^Phiếu xin vật tư #(\d+) bị từ chối$"), lambda m: f"Supply request #{m[1]} was rejected"),
    (re.compile(r"^Đã cấp: (.+)$", re.S), lambda m: f"Issued: {m[1]}"),
    (re.compile(r"^Lý do: (.+)$", re.S), lambda m: f"Reason: {translate_text(m[1])}"),
])
