"""
Luật nghiệp vụ Flow 1. View chỉ gọi các hàm ở đây; mọi kiểm tra trạng thái nằm ở backend.

Draft ──submit──> Submitted ──verify──> PendingExam ──(Vet chốt khám đầu vào)──> approve ──> Approved ──archive──> Archived
  ^                   │                      │
  └──── sửa ──── Rejected <──── reject ──────┘
"""
import json

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core import emails, flows
from apps.core.audit import log_action
from apps.core.exceptions import BusinessRuleError
from apps.core.permissions import require_club_user
from apps.medical.services import signed_initial_exam_for

from .models import Horse, ProfileChangeRequest, RegistrationRequest, Stall, StallAssignment
from .serializers import PROFILE_FIELDS

S = Horse.RegistrationStatus
EDITABLE_STATUSES = (S.DRAFT, S.REJECTED)
SUBMIT_REQUIRED = {
    "horse_name": "HorseName",
    "date_of_birth": "DateOfBirth",
    "gender": "Gender",
    "microchip_number": "MicrochipNumber",
}


def _require_status(horse, allowed, action):
    if horse.registration_status not in allowed:
        raise BusinessRuleError(
            f"Không thể {action} khi hồ sơ đang ở trạng thái {horse.registration_status}.",
            "INVALID_STATUS",
        )


def latest_request(horse):
    return horse.registration_requests.order_by("-request_date", "-id").first()


def ensure_editable(horse):
    _require_status(horse, EDITABLE_STATUSES, "sửa lý lịch")


def submit(horse, user):
    _require_status(horse, EDITABLE_STATUSES, "gửi hồ sơ")
    missing = [col for attr, col in SUBMIT_REQUIRED.items() if not getattr(horse, attr)]
    if missing:
        raise BusinessRuleError(f"Cần nhập đủ thông tin trước khi gửi: {', '.join(missing)}.", "MISSING_FIELDS")
    now = timezone.now()
    request = RegistrationRequest.objects.create(
        horse=horse, owner_id=horse.owner_id, club_id=horse.club_id, request_date=now,
        status=RegistrationRequest.Status.SUBMITTED,
    )
    horse.registration_status = S.SUBMITTED
    horse.touch()
    horse.save(update_fields=["registration_status", "updated_at"])
    log_action(user, "SUBMIT_REGISTRATION", horse, {"RegistrationRequestID": request.id})
    emails.registration_submitted(horse)
    return horse


def verify(horse, user):
    """Quản lý câu lạc bộ đã đối chiếu giấy tờ, microchip -> chuyển sang chờ bác sĩ thú y trực khám."""
    _require_status(horse, (S.SUBMITTED,), "xác minh hồ sơ")
    request = latest_request(horse)
    now = timezone.now()
    horse.registration_status = S.PENDING_EXAM
    horse.verified_by = user
    horse.verified_at = now
    horse.touch()
    horse.save(update_fields=["registration_status", "verified_by", "verified_at", "updated_at"])
    request.status = RegistrationRequest.Status.PENDING_EXAM
    request.save(update_fields=["status"])
    log_action(user, "VERIFY_REGISTRATION", horse, {"RegistrationRequestID": request.id})
    emails.registration_verified(horse)
    emails.initial_exam_needed(horse)
    return horse


def reject(horse, user, reason):
    _require_status(horse, (S.SUBMITTED, S.PENDING_EXAM), "từ chối hồ sơ")
    request = latest_request(horse)
    now = timezone.now()
    horse.registration_status = S.REJECTED
    horse.touch()
    horse.save(update_fields=["registration_status", "updated_at"])
    request.status = RegistrationRequest.Status.REJECTED
    request.manager_note = reason
    request.reviewed_by = user
    request.reviewed_at = now
    request.save(update_fields=["status", "manager_note", "reviewed_by", "reviewed_at"])
    log_action(user, "REJECT_REGISTRATION", horse, {"Reason": reason})
    emails.registration_rejected(horse, reason)
    return horse


def auto_horse_code(horse):
    """Mã ngựa tự đánh theo số hồ sơ: EQ-004; trùng (mã nhập tay trước đây) thì thêm hậu tố EQ-004-2."""
    base = f"EQ-{horse.pk:03d}"
    code, n = base, 1
    while Horse.objects.filter(club_id=horse.club_id, horse_code__iexact=code).exclude(pk=horse.pk).exists():
        n += 1
        code = f"{base}-{n}"
    return code


def approve(horse, user, horse_code=None, stall_id=None, manager_note=None, groom_id=None):
    """
    Hoàn tất tiếp nhận: cần phiếu khám đầu vào đã chốt và đạt; gán mã ngựa, xếp chuồng (nếu có)
    và xếp Groom phụ trách (nếu có, cần Flow 4).
    """
    _require_status(horse, (S.PENDING_EXAM,), "duyệt hồ sơ")
    exam = signed_initial_exam_for(horse)
    if exam is None:
        raise BusinessRuleError("Ngựa chưa có phiếu khám đầu vào đã chốt.", "INITIAL_EXAM_REQUIRED")
    if not exam.passes_intake:
        raise BusinessRuleError(
            "Kết quả khám đầu vào không đạt (sức khỏe phải là Healthy hoặc Monitor và không bị cấm tập). "
            "Hãy từ chối hồ sơ.",
            "INITIAL_EXAM_FAILED",
        )
    horse_code = (horse_code or "").strip() or auto_horse_code(horse)
    if Horse.objects.filter(club_id=horse.club_id, horse_code__iexact=horse_code).exclude(pk=horse.pk).exists():
        raise BusinessRuleError("Mã ngựa đã tồn tại trong câu lạc bộ.", "DUPLICATE_HORSE_CODE")

    groom = None
    if groom_id:
        if not flows.has_care():
            raise ValidationError({"GroomID": ["Chưa có phân hệ chăm sóc nên chưa xếp người chăm sóc ngựa được."]})
        groom = require_club_user(groom_id, horse.club_id, "GROOM", field="GroomID")

    now = timezone.now()
    stall = None
    if stall_id:
        stall = Stall.objects.filter(pk=stall_id, club_id=horse.club_id).first()
        if stall is None:
            raise BusinessRuleError("Chuồng không tồn tại trong câu lạc bộ.", "STALL_NOT_FOUND")
        if stall.status != Stall.Status.AVAILABLE or stall.assignments.filter(status="Active").exists():
            raise BusinessRuleError("Chuồng này không còn trống.", "STALL_NOT_AVAILABLE")

    horse.registration_status = S.APPROVED
    horse.horse_code = horse_code
    horse.current_health_status = exam.health_status
    horse.touch()
    horse.save(update_fields=["registration_status", "horse_code", "current_health_status", "updated_at"])

    request = exam.registration_request
    request.status = RegistrationRequest.Status.APPROVED
    request.reviewed_by = user
    request.reviewed_at = now
    if manager_note:
        request.manager_note = manager_note
    request.save(update_fields=["status", "reviewed_by", "reviewed_at", "manager_note"])

    if stall is not None:
        StallAssignment.objects.create(stall=stall, horse=horse, start_date=now.date())
        stall.status = Stall.Status.OCCUPIED
        stall.save(update_fields=["status"])

    if groom is not None:
        from apps.care.automation import set_horse_groom

        set_horse_groom(horse, groom, user)

    log_action(user, "APPROVE_REGISTRATION", horse, {"HorseCode": horse_code, "StallID": stall_id,
                                                     "GroomID": groom.pk if groom else None})
    emails.registration_approved(horse)
    return horse


def archive(horse, user, reason, left_date=None):
    """
    Ngựa rời CLB: lưu trữ hồ sơ và trả chuồng; có Flow 2 thì kết thúc phân công trainer
    (hủy giáo án / buổi tập chưa diễn ra); có Flow 4 thì bỏ các việc chăm sóc chưa làm
    và khẩu phần đang áp dụng chuyển Expired.
    """
    _require_status(horse, (S.APPROVED,), "lưu trữ hồ sơ")
    now = timezone.now()
    for assignment in horse.stall_assignments.filter(status="Active").select_related("stall"):
        assignment.status = StallAssignment.Status.ENDED
        assignment.end_date = now.date()
        assignment.save(update_fields=["status", "end_date"])
        assignment.stall.status = Stall.Status.AVAILABLE
        assignment.stall.save(update_fields=["status"])
    if flows.has_training():
        from apps.training.services import active_assignment, end_assignment

        trainer_assignment = active_assignment(horse)
        if trainer_assignment is not None:
            end_assignment(trainer_assignment, user, "Ngựa rời câu lạc bộ")
    if flows.has_care():
        from apps.care.models import CareTask, DietPlan

        for task in CareTask.objects.filter(horse=horse, status=CareTask.Status.PENDING):
            task.status = CareTask.Status.SKIPPED
            task.note = ((task.note or "") + "\n[Bỏ qua] Ngựa đã rời câu lạc bộ").strip()[:1000]
            task.save(update_fields=["status", "note"])
        DietPlan.objects.filter(horse=horse, status__in=("Pending", "Approved", "Adjusted")).update(status="Expired")
    horse.registration_status = S.ARCHIVED
    horse.archived_at = now
    horse.archived_by = user
    horse.archive_reason = reason
    horse.left_date = left_date or now.date()
    horse.touch()
    horse.save(update_fields=["registration_status", "archived_at", "archived_by", "archive_reason", "left_date",
                              "updated_at"])
    log_action(user, "ARCHIVE_HORSE", horse, {"Reason": reason, "LeftDate": str(horse.left_date)})
    return horse


# ---------------------------------------------------------------------------
# Yêu cầu sửa lý lịch (sau khi ngựa đã Approved)
# ---------------------------------------------------------------------------
COLUMN_TO_ATTR = {Horse._meta.get_field(attr).db_column: attr for attr in PROFILE_FIELDS}


# Preserve the existing public service names.
from .change_requests import (  # noqa: E402
    create as create_change_request,
    approve as approve_change_request,
    reject as reject_change_request,
)


def save_stall(user, values, stall=None, club_id=None):
    stall = stall or Stall(club_id=club_id)
    number = values.get("stall_number")
    if number and Stall.objects.filter(club_id=stall.club_id, stall_number__iexact=number).exclude(pk=stall.pk).exists():
        raise BusinessRuleError("Số chuồng đã tồn tại trong câu lạc bộ.", "DUPLICATE_STALL")
    if values.get("status") and stall.pk and stall.assignments.filter(status="Active").exists():
        raise BusinessRuleError("Chuồng đang có ngựa, chuyển ngựa đi trước khi đổi trạng thái.", "STALL_OCCUPIED")
    if values.get("status") and values["status"] != Stall.Status.MAINTENANCE:
        values = {**values, "maintenance_until": None}   # hết bảo trì thì bỏ ngày dự kiến
    for attr, value in values.items():
        setattr(stall, attr, value)
    created = stall.pk is None
    stall.save()
    log_action(user, "CREATE_STALL" if created else "UPDATE_STALL", stall)
    return stall


def move_stall(horse, user, stall_id):
    _require_status(horse, (S.APPROVED,), "xếp chuồng")
    stall = Stall.objects.filter(pk=stall_id, club_id=horse.club_id).first()
    if stall is None:
        raise BusinessRuleError("Chuồng không tồn tại trong câu lạc bộ.", "STALL_NOT_FOUND")
    if stall.status != Stall.Status.AVAILABLE or stall.assignments.filter(status="Active").exists():
        raise BusinessRuleError("Chuồng này không còn trống.", "STALL_NOT_AVAILABLE")
    today = timezone.now().date()
    old_ids = []
    for assignment in horse.stall_assignments.filter(status="Active").select_related("stall"):
        assignment.status = StallAssignment.Status.ENDED
        assignment.end_date = max(today, assignment.start_date)
        assignment.save(update_fields=["status", "end_date"])
        assignment.stall.status = Stall.Status.AVAILABLE
        assignment.stall.save(update_fields=["status"])
        old_ids.append(assignment.stall_id)
    StallAssignment.objects.create(stall=stall, horse=horse, start_date=today)
    stall.status = Stall.Status.OCCUPIED
    stall.save(update_fields=["status"])
    log_action(user, "MOVE_STALL", horse, {"FromStallIDs": old_ids, "ToStallID": stall.id})
    return horse


def _owner_input(data):
    """Kiểm tra OwnerFullName, OwnerEmail, OwnerPhone, OwnerAddress. Trả (tài khoản có sẵn | None, giá trị, lỗi)."""
    from rest_framework.exceptions import ValidationError

    from apps.accounts.models import User
    from apps.core import validators

    errors, values = {}, {}

    def check(key, fn):
        try:
            values[key] = fn(data.get(key))
        except ValidationError as exc:
            detail = exc.detail
            errors[key] = detail if isinstance(detail, list) else [detail]

    check("OwnerEmail", lambda v: validators.clean_email(v, check_unique=False))
    existing = None
    if "OwnerEmail" in values:
        existing = User.objects.filter(email__iexact=values["OwnerEmail"]).prefetch_related("roles").first()
    if existing is not None:
        if "HORSE_OWNER" not in existing.role_codes:
            errors["OwnerEmail"] = ["Email này thuộc tài khoản nhân sự, không dùng làm chủ sở hữu ngựa."]
        return existing, values, errors
    check("OwnerFullName", validators.clean_full_name)
    check("OwnerPhone", validators.clean_phone_number)
    check("OwnerAddress", validators.clean_address)
    return None, values, errors


def owner_input_errors(data):
    return _owner_input(data)[2]


def owner_from_manager_input(manager, data):
    """
    Quản lý khai giúp hồ sơ (QL10): OwnerFullName, OwnerEmail, OwnerPhone, OwnerAddress.
    - Email đã có tài khoản chủ ngựa: gắn hồ sơ vào tài khoản đó (Created = False).
    - Chưa có: tạo tài khoản chủ ngựa trong câu lạc bộ, mật khẩu tạm, bắt đổi ở lần đăng nhập đầu.
    Trả (owner, {"Created", "Email", "FullName", "TemporaryPassword"?}).
    """
    import secrets

    from rest_framework.exceptions import ValidationError

    from apps.accounts.models import Role, User, UserRole
    from apps.core import emails

    existing, v, errors = _owner_input(data)
    if errors:
        raise ValidationError(errors)
    if existing is not None:
        return existing, {"Created": False, "Email": existing.email, "FullName": existing.full_name}
    temporary = secrets.token_urlsafe(9)
    owner = User.objects.create_user(email=v["OwnerEmail"], password=temporary, full_name=v["OwnerFullName"],
                                     phone=v["OwnerPhone"], address=v["OwnerAddress"], club_id=manager.club_id,
                                     must_change_password=True)
    UserRole.objects.create(user=owner, role=Role.objects.get(code="HORSE_OWNER"), assigned_by=manager)
    log_action(manager, "CREATE_USER", owner, {"RoleCode": "HORSE_OWNER", "From": "HorseIntake"})
    emails.account_created_by_manager(owner, manager)
    return owner, {"Created": True, "Email": owner.email, "FullName": owner.full_name, "TemporaryPassword": temporary}
