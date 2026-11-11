"""
Y tế. Flow 1: phiếu khám đầu vào (nháp -> chốt -> đính chính).
Flow 3: khám định kỳ / chấn thương, Training Lock, thuốc điều trị, tiêm phòng, lịch y tế, báo cáo sức khỏe.
"""
from apps.core.clubtime import now as club_now, today as club_today
from datetime import date

from django.db.models import Exists, OuterRef
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core import flows
from apps.core.audit import log_action
from apps.core.exceptions import BusinessRuleError
from apps.core.models import AuditLog
from apps.core.locking import horse_serialized
from apps.horses.models import Horse, RegistrationRequest

from . import owner_emails
from .models import (
    HealthReport, HealthReportNote, MedicalRecord, MedicalRecordAmendment, MedicalSchedule, TrainingLock, Treatment,
    Vaccination,
)

ACTIVE_REQUEST_STATUSES = ("PendingExam", "Approved")

def signed_initial_exams():
    return MedicalRecord.objects.filter(
        exam_type=MedicalRecord.ExamType.INITIAL,
        record_status=MedicalRecord.RecordStatus.SIGNED,
        registration_request__status__in=ACTIVE_REQUEST_STATUSES,
    )


def annotate_initial_exam_signed(horse_queryset):
    """Thêm cột tạm initial_exam_signed cho danh sách ngựa (1 truy vấn, không lặp từng con)."""
    return horse_queryset.annotate(
        initial_exam_signed=Exists(signed_initial_exams().filter(horse=OuterRef("pk")))
    )


def has_signed_initial_exam(horse) -> bool:
    return signed_initial_exams().filter(horse=horse).exists()


def signed_initial_exam_for(horse):
    return signed_initial_exams().filter(horse=horse).order_by("-signed_at", "-id").first()


def latest_signed_record(horse):
    return (
        MedicalRecord.objects.filter(horse=horse, record_status=MedicalRecord.RecordStatus.SIGNED)
        .order_by("-exam_date", "-id")
        .first()
    )


def current_pending_request(horse):
    return (
        horse.registration_requests.filter(status=RegistrationRequest.Status.PENDING_EXAM)
        .order_by("-request_date", "-id")
        .first()
    )


def ensure_draft_owner(record, user):
    if record.is_signed:
        raise BusinessRuleError("Phiếu khám đã chốt không được sửa. Hãy thêm phiếu đính chính.", "RECORD_SIGNED")
    if record.vet_id != user.pk:
        raise BusinessRuleError("Chỉ bác sĩ thú y lập phiếu mới được sửa / chốt phiếu nháp này.", "NOT_RECORD_OWNER")


def check_restriction_note(values, record=None):
    """CK_MedicalRecord_Restriction: TrainingEligibility = Restricted thì phải có RestrictionNote (kể cả phiếu nháp)."""
    eligibility = values.get("training_eligibility", getattr(record, "training_eligibility", None))
    note = values.get("restriction_note", getattr(record, "restriction_note", None))
    if eligibility == MedicalRecord.TrainingEligibility.RESTRICTED and not note:
        raise ValidationError({"RestrictionNote": ["Mức Restricted cần ghi rõ hạn chế tập (RestrictionNote)."]})


@horse_serialized
def update_record(record, user, values: dict):
    ensure_draft_owner(record, user)
    check_restriction_note(values, record)
    check_follow_up_lock(record.horse, values, record)
    if values.get("training_session_id"):
        check_session(record.horse, values["training_session_id"])
    if "exam_type" in values and values["exam_type"] != record.exam_type:
        raise BusinessRuleError("Không được đổi loại khám. Hãy xóa phiếu nháp và lập phiếu mới.", "EXAM_TYPE_LOCKED")
    for attr, value in values.items():
        setattr(record, attr, value)
    record.save()
    log_action(user, "UPDATE_MEDICAL_RECORD", record)
    return record


def add_amendment(record, user, reason: str, content: str):
    if not record.is_signed:
        raise BusinessRuleError("Phiếu nháp thì sửa trực tiếp, không cần phiếu đính chính.", "RECORD_NOT_SIGNED")
    amendment = MedicalRecordAmendment.objects.create(
        medical_record=record, amended_by=user, amended_at=club_now(), reason=reason, amended_content=content,
    )
    log_action(user, "AMEND_MEDICAL_RECORD", record, {"MedicalRecordAmendmentID": amendment.id})
    return amendment


@horse_serialized
def create_record(horse, user, values, health_report=None):
    """
    Lập phiếu khám nháp.
    - Khám đầu vào (Initial Exam): ngựa đang PendingExam, mỗi lần nộp hồ sơ 1 phiếu.
    - Khám định kỳ / chấn thương / tái khám / cấp cứu (Flow 3): ngựa đã Approved. health_report: báo cáo sức khỏe
      mà lần khám này xử lý -> báo cáo chuyển Reviewing, gắn Vet và MedicalRecordID.
    """
    check_restriction_note(values)
    values = dict(values)
    check_follow_up_lock(horse, values)
    if health_report is not None:
        health_report = HealthReport.objects.select_for_update().get(pk=health_report.pk)
        ensure_report_vet(health_report, user)
    exam_type = values.get("exam_type")
    request = None
    if exam_type == MedicalRecord.ExamType.INITIAL:
        if health_report is not None:
            raise ValidationError({"HealthReportID": ["Khám đầu vào không gắn với báo cáo sức khỏe."]})
        values.pop("training_session_id", None)      # khám đầu vào không thuộc buổi tập nào
        if horse.registration_status != Horse.RegistrationStatus.PENDING_EXAM:
            raise BusinessRuleError("Chỉ khám đầu vào khi hồ sơ ngựa đang chờ khám.", "INVALID_STATUS")
        request = current_pending_request(horse)
        if request is None:
            raise BusinessRuleError("Không tìm thấy hồ sơ tiếp nhận đang chờ khám.", "REQUEST_NOT_FOUND")
        if request.medical_records.filter(exam_type=MedicalRecord.ExamType.INITIAL).exists():
            raise BusinessRuleError("Hồ sơ tiếp nhận này đã có phiếu khám đầu vào.", "INITIAL_EXAM_EXISTS")
    else:
        if not flows.has_flow3():
            raise BusinessRuleError("Hệ thống hiện chỉ hỗ trợ phiếu khám lâm sàng nhập đàn.", "EXAM_TYPE_UNAVAILABLE")
        if horse.registration_status != Horse.RegistrationStatus.APPROVED:
            raise BusinessRuleError("Ngựa chưa được tiếp nhận nên chỉ được lập phiếu khám đầu vào.", "INVALID_STATUS")
        if health_report is not None:
            check_report_for_record(health_report, horse, values)
        check_session(horse, values.get("training_session_id"))
    values["exam_date"] = values.get("exam_date") or club_now()
    record = MedicalRecord.objects.create(horse=horse, vet=user, registration_request=request, **values)
    if health_report is not None:
        link_report_to_record(health_report, record, user)
    log_action(user, "CREATE_MEDICAL_RECORD", record, {
        "HorseID": horse.pk, "ExamType": record.exam_type,
        "HealthReportID": health_report.pk if health_report else None,
    })
    return record


@horse_serialized
def delete_draft(record, user):
    """Xóa phiếu nháp; có Flow 3 thì xóa luôn thuốc kê trên phiếu và gỡ liên kết báo cáo sức khỏe."""
    ensure_draft_owner(record, user)
    if record.injury_markers.exists() or record.injury_assessments.exists() or record.care_orders.exists() or record.care_tasks.exists():
        raise BusinessRuleError("Phiếu có chấn thương hoặc chỉ định chăm sóc; giữ lại để bảo toàn lịch sử.", "RECORD_IN_USE")
    if flows.has_flow3():
        record.treatments.all().delete()
        HealthReport.objects.filter(medical_record=record).update(medical_record=None)
    log_action(user, "DELETE_MEDICAL_RECORD", record, {"HorseID": record.horse_id})
    record.delete()


@horse_serialized
def sign_record(record, user, lock_values=None):
    """
    Vet chốt phiếu: bắt buộc có HealthStatus, TrainingEligibility (và RestrictionNote nếu Restricted).
    Phiếu khám ngựa đã tiếp nhận (Flow 3): tạo / sửa Training Lock theo lock_values hoặc theo kết luận
    (Not Eligible -> tự khóa Full). Trả về (record, lock hoặc None).
    """
    ensure_draft_owner(record, user)
    initial = record.exam_type == MedicalRecord.ExamType.INITIAL
    if initial:
        current = current_pending_request(record.horse)
        if current is None or current.pk != record.registration_request_id:
            raise BusinessRuleError("Phiếu không thuộc hồ sơ tiếp nhận đang chờ khám.", "INVALID_STATUS")
    elif not flows.has_flow3():
        raise BusinessRuleError("Hệ thống hiện chỉ hỗ trợ phiếu khám lâm sàng nhập đàn.", "EXAM_TYPE_UNAVAILABLE")
    missing = [name for name, value in (("HealthStatus", record.health_status),
                                       ("TrainingEligibility", record.training_eligibility)) if not value]
    if missing:
        raise BusinessRuleError(f"Cần nhập đủ trước khi chốt phiếu: {', '.join(missing)}.", "MISSING_FIELDS")
    check_restriction_note({}, record)
    check_follow_up_lock(record.horse, {}, record)
    record.record_status = MedicalRecord.RecordStatus.SIGNED
    record.signed_at = club_now()
    record.save(update_fields=["record_status", "signed_at"])
    horse = record.horse
    horse.current_health_status = record.health_status
    horse.touch()
    horse.save(update_fields=["current_health_status", "updated_at"])
    log_action(user, "SIGN_MEDICAL_RECORD", record, {"HorseID": horse.pk,
               "HealthStatus": record.health_status, "TrainingEligibility": record.training_eligibility})
    if initial:
        from apps.core import emails
        emails.initial_exam_signed(record)
        return record, None
    lock = lock_after_sign(record, user, lock_values) if horse.registration_status == Horse.RegistrationStatus.APPROVED \
        else None
    if record.follow_up_date:
        MedicalSchedule.objects.get_or_create(horse=horse, schedule_type="Routine Examination",
            scheduled_date=record.follow_up_date, note=f"Tái khám theo phiếu #{record.pk}", defaults={"vet": user})
    return record, lock


# ===========================================================================
# FLOW 3 - y tế
# ===========================================================================
def check_session(horse, session_id):
    """TrainingSessionID của phiếu khám / báo cáo phải là buổi tập của chính ngựa này (khi đã có Flow 2)."""
    if not session_id:
        return
    if not flows.has_training():
        raise ValidationError({"TrainingSessionID": ["Chưa có phân hệ huấn luyện nên chưa gắn được buổi tập."]})
    from apps.training.models import TrainingSession

    session = TrainingSession.objects.filter(pk=session_id).select_related("stage__plan__assignment__horse").first()
    if session is None or session.horse.pk != horse.pk:
        raise ValidationError({"TrainingSessionID": ["Buổi tập không thuộc ngựa này."]})


def check_report_for_record(health_report, horse, values):
    """Lập phiếu khám để xử lý một báo cáo sức khỏe: kiểm tra báo cáo, lấy buổi tập của báo cáo nếu có."""
    if health_report.horse_id != horse.pk:
        raise ValidationError({"HealthReportID": ["Báo cáo sức khỏe không thuộc ngựa này."]})
    if health_report.status == HealthReport.Status.RESOLVED:
        raise BusinessRuleError("Báo cáo sức khỏe này đã xử lý xong.", "REPORT_RESOLVED")
    if health_report.medical_record_id is not None:
        raise BusinessRuleError("Báo cáo này đã gắn với một phiếu khám khác.", "REPORT_ALREADY_LINKED")
    if not values.get("training_session_id") and getattr(health_report, "training_session_id", None):
        values["training_session_id"] = health_report.training_session_id


def link_report_to_record(health_report, record, user):
    """Báo cáo chuyển Reviewing, gắn bác sĩ thú y và MedicalRecordID."""
    health_report.medical_record = record
    health_report.vet_id = health_report.vet_id or user.pk
    if health_report.status == HealthReport.Status.REPORTED:
        health_report.status = HealthReport.Status.REVIEWING
    health_report.save(update_fields=["medical_record", "vet", "status"])


def lock_after_sign(record, user, lock_values=None):
    """
    Chốt phiếu khám của ngựa đã tiếp nhận:
      - lock_values có giá trị -> tạo (hoặc sửa) Training Lock theo đó;
      - không gửi lock_values mà kết luận Not Eligible -> tự khóa Full (hoặc nâng lock Restricted lên Full).
    """
    horse = record.horse
    current = active_lock(horse)
    if lock_values:
        effective_level = lock_values.get("lock_level", current.lock_level if current else "Full")
        effective_start = lock_values.get("lock_start_date") or (current.lock_start_date if current else club_now())
        if record.training_eligibility == "Not Eligible" and effective_level != "Full":
            raise ValidationError({"TrainingLock": ["Kết luận không được tập cần khóa Full."]})
        if record.training_eligibility in ("Not Eligible", "Restricted") and effective_start > club_now():
            raise ValidationError({"TrainingLock": ["Hạn chế trong kết luận cần có hiệu lực ngay khi ký."]})
        return update_lock(current, user, lock_values) if current else create_lock(horse, user, lock_values)
    if record.training_eligibility == MedicalRecord.TrainingEligibility.RESTRICTED and (current is None or not current.covers(club_today())):
        raise BusinessRuleError("Đặt khóa Restricted và tải tối đa ở phần Khóa tập trước khi ký kết luận hạn chế.", "RESTRICTION_LOCK_REQUIRED")
    if record.training_eligibility == MedicalRecord.TrainingEligibility.NOT_ELIGIBLE:
        if current is None:
            return create_lock(horse, user, {
                "reason": f"Phiếu khám #{record.id}: không đủ điều kiện tập"[:100],
                "lock_level": TrainingLock.Level.FULL,
                "details": record.diagnosis or record.conclusion,
            })
        if current.lock_level != TrainingLock.Level.FULL or current.lock_start_date > club_now():
            return update_lock(current, user, {"lock_level": TrainingLock.Level.FULL, "max_intensity": None,
                                               "lock_start_date": min(current.lock_start_date, club_now())})
        return current
    return None


# ---------------------------------------------------------------------------
# Training Lock
# ---------------------------------------------------------------------------
def active_lock(horse):
    return TrainingLock.objects.filter(horse=horse, lock_status=TrainingLock.Status.ACTIVE).first()


def _cancel_sessions_for_lock(lock, user):
    """
    Giống trigger TRG_TrainingLock_CancelSessions: hủy buổi Assigned trong thời gian khóa.
    Gọi TRƯỚC khi lưu lock (trên SQL Server trigger chạy lúc lưu, nên làm trước thì backend
    mới biết được buổi nào bị hủy để trả về và ghi audit log).
    """
    if not flows.has_training():  # chưa có Flow 2 thì không có buổi tập để hủy
        return []
    from django.db.models import Q

    from apps.training.models import TrainingSession
    from apps.training.services import cancel_sessions

    sessions = TrainingSession.objects.filter(
        stage__plan__assignment__horse=lock.horse, status__in=(TrainingSession.Status.ASSIGNED, TrainingSession.Status.IN_PROGRESS),
        session_date__gte=lock.lock_start_date.date(),
    )
    if lock.lock_level == TrainingLock.Level.RESTRICTED:
        if lock.max_intensity is None:
            return []
        sessions = sessions.filter(Q(training_load__isnull=True) | Q(training_load__gt=lock.max_intensity))
    return cancel_sessions(sessions, user, f"Training Lock {lock.reason}")


def _validate_lock(values):
    level = values.get("lock_level")
    if level == TrainingLock.Level.RESTRICTED and values.get("max_intensity") is None:
        raise ValidationError({"MaxIntensity": ["Mức Restricted cần ghi cường độ tối đa (so với TrainingLoad)."]})
    if level == TrainingLock.Level.FULL:
        values["max_intensity"] = None
    end = values.get("lock_end_date")
    if end and end < values["lock_start_date"]:
        raise ValidationError({"LockEndDate": ["Ngày mở khóa dự kiến phải sau ngày bắt đầu."]})


@horse_serialized
def create_lock(horse, user, values):
    if horse.registration_status != Horse.RegistrationStatus.APPROVED:
        raise BusinessRuleError("Chỉ khóa huấn luyện ngựa đã được tiếp nhận.", "HORSE_NOT_APPROVED")
    if active_lock(horse) is not None:
        raise BusinessRuleError("Ngựa đã có khóa tập đang hiệu lực. Vui lòng cập nhật khóa tập hiện tại.", "LOCK_EXISTS")
    values = dict(values)
    values.setdefault("lock_level", TrainingLock.Level.FULL)
    values["lock_start_date"] = values.get("lock_start_date") or club_now()
    _validate_lock(values)
    lock = TrainingLock(horse=horse, created_by=user, lock_status=TrainingLock.Status.ACTIVE, **values)
    cancelled = _cancel_sessions_for_lock(lock, user)
    lock.save()
    lock.cancelled_session_ids = cancelled
    log_action(user, "CREATE_TRAINING_LOCK", lock, {
        "HorseID": horse.pk, "LockLevel": lock.lock_level, "CancelledSessionIDs": lock.cancelled_session_ids,
    })
    owner_emails.lock_created(lock)
    notify_lock(lock, "Khóa tập")
    return lock


@horse_serialized
def update_lock(lock, user, values):
    if lock.lock_status != TrainingLock.Status.ACTIVE:
        raise BusinessRuleError("Khóa tập đã được mở.", "INVALID_STATUS")
    merged = {
        "lock_level": lock.lock_level, "max_intensity": lock.max_intensity,
        "lock_start_date": lock.lock_start_date, "lock_end_date": lock.lock_end_date,
        **{k: v for k, v in values.items() if k != "lock_start_date" or v is not None},
    }
    _validate_lock(merged)
    for attr, value in merged.items():
        setattr(lock, attr, value)
    cancelled = _cancel_sessions_for_lock(lock, user)
    lock.save()
    lock.cancelled_session_ids = cancelled
    log_action(user, "UPDATE_TRAINING_LOCK", lock, {
        "LockLevel": lock.lock_level, "MaxIntensity": lock.max_intensity,
        "CancelledSessionIDs": lock.cancelled_session_ids,
    })
    notify_lock(lock, "Điều chỉnh khóa tập")
    return lock


@horse_serialized
def release_lock(lock, user, note=None, follow_up_id=None):
    """Mọi Vet được mở lock, nhưng phải có lần khám đã chốt sau khi khóa với kết luận không còn 'Not Eligible'."""
    if lock.lock_status != TrainingLock.Status.ACTIVE:
        raise BusinessRuleError("Khóa tập đã được mở.", "INVALID_STATUS")
    # Tái khám phải được chốt SAU lúc tạo lock (không tính chính phiếu đã tạo ra lock, kể cả khi LockStartDate lùi ngày)
    created = (AuditLog.objects.filter(entity_name="TrainingLock", entity_id=lock.pk, action_type="CREATE_TRAINING_LOCK")
               .order_by("action_time").values_list("action_time", flat=True).first())
    changed = AuditLog.objects.filter(entity_name="TrainingLock", entity_id=lock.pk,
                                      action_type="UPDATE_TRAINING_LOCK").order_by("-action_time").first()
    locked_at = max(created or lock.lock_start_date, lock.lock_start_date, changed.action_time if changed else lock.lock_start_date)
    follow_up = (MedicalRecord.objects.filter(
        horse=lock.horse, follow_up_lock=lock, exam_type="Follow-up", record_status=MedicalRecord.RecordStatus.SIGNED,
        signed_at__gt=locked_at, exam_date__gte=locked_at,
    ).order_by("-signed_at", "-id").first())
    if follow_up_id and (follow_up is None or follow_up.pk != follow_up_id):
        raise ValidationError({"FollowUpMedicalRecordID": ["Chọn phiếu tái khám mới nhất của đợt khóa này."]})
    if follow_up is None or follow_up.training_eligibility != MedicalRecord.TrainingEligibility.ELIGIBLE:
        raise BusinessRuleError("Cần một lần tái khám đã chốt (sau khi khóa) với kết luận được tập trước khi mở khóa.",
                                "FOLLOW_UP_EXAM_REQUIRED")
    now = club_now()
    lock.lock_status = TrainingLock.Status.RELEASED
    lock.released_by = user
    lock.released_at = now
    if lock.lock_end_date is None or lock.lock_end_date > now:
        lock.lock_end_date = max(now, lock.lock_start_date)
    if note:
        lock.details = ((lock.details or "") + f"\n[Mở khóa] {note}").strip()[:2000]
    lock.save(update_fields=["lock_status", "released_by", "released_at", "lock_end_date", "details"])
    log_action(user, "RELEASE_TRAINING_LOCK", lock, {"FollowUpMedicalRecordID": follow_up.id})
    owner_emails.lock_released(lock)
    notify_lock(lock, "Mở khóa tập")
    return lock


def notify_lock(lock, label):
    from apps.core.workflow import clinical_recipients, notify
    log = AuditLog.objects.filter(entity_name="TrainingLock", entity_id=lock.pk).first()
    notify(clinical_recipients(lock.horse, owner=True), lock.horse, "TRAINING_LOCK_CHANGED",
           f"lock:{lock.pk}:{log.pk}", f"{label}: {lock.horse.horse_name} · {lock.lock_level} · {lock.reason}")


def check_follow_up_lock(horse, values, record=None):
    lock = values.get("follow_up_lock", getattr(record, "follow_up_lock", None))
    exam_type = values.get("exam_type", getattr(record, "exam_type", None))
    if lock and (lock.horse_id != horse.pk or lock.lock_status != "Active" or exam_type != "Follow-up"):
        raise ValidationError({"FollowUpLockID": ["Cần chọn đợt khóa đang hoạt động của ngựa này cho phiếu tái khám."]})


# ---------------------------------------------------------------------------
# Thuốc điều trị, tiêm phòng, lịch y tế
# ---------------------------------------------------------------------------
def _check_dates(start, end, field="EndDate", message="Ngày kết thúc phải sau ngày bắt đầu."):
    if start and end and end < start:
        raise ValidationError({field: [message]})


@horse_serialized
def add_treatment(record, user, values):
    """Kê thuốc trên phiếu khám nháp (người lập phiếu). Phiếu đã chốt muốn thêm thuốc thì lập phiếu khám mới."""
    ensure_draft_owner(record, user)
    _check_dates(values["start_date"], values.get("end_date"))
    _check_dates(values["start_date"], values.get("withdrawal_until"), "WithdrawalUntil",
                 "Ngày hết ngưng thuốc phải sau ngày bắt đầu.")
    _check_dates(values.get("end_date"), values.get("withdrawal_until"), "WithdrawalUntil",
                 "Ngày hết ngưng thuốc không trước ngày kết thúc điều trị.")
    treatment = Treatment.objects.create(medical_record=record, **values)
    log_action(user, "ADD_TREATMENT", record, {"TreatmentID": treatment.id})
    return treatment


@horse_serialized
def update_treatment(treatment, user, values):
    """Vet lập phiếu sửa thuốc trên nháp; đơn đã ký được giữ nguyên để đối chiếu."""
    record = treatment.medical_record
    if record.is_signed:
        raise BusinessRuleError("Đơn thuốc thuộc phiếu đã ký. Hãy lập phiếu tái khám hoặc đính chính có lý do.", "RECORD_SIGNED")
    else:
        ensure_draft_owner(record, user)
    for attr, value in values.items():
        setattr(treatment, attr, value)
    _check_dates(treatment.start_date, treatment.end_date)
    _check_dates(treatment.start_date, treatment.withdrawal_until, "WithdrawalUntil",
                 "Ngày hết ngưng thuốc phải sau ngày bắt đầu.")
    _check_dates(treatment.end_date, treatment.withdrawal_until, "WithdrawalUntil",
                 "Ngày hết ngưng thuốc không trước ngày kết thúc điều trị.")
    treatment.save()
    log_action(user, "UPDATE_TREATMENT", treatment.medical_record, {"TreatmentID": treatment.id})
    return treatment


def save_vaccination(user, values, vaccination=None, horse=None):
    vaccination = vaccination or Vaccination(horse=horse)
    for attr, value in values.items():
        setattr(vaccination, attr, value)
    _check_dates(vaccination.vaccination_date, vaccination.next_due_date, "NextDueDate",
                 "Ngày tiêm nhắc lại phải sau ngày tiêm.")
    created = vaccination.pk is None
    vaccination.save()
    log_action(user, "ADD_VACCINATION" if created else "UPDATE_VACCINATION", vaccination,
               {"HorseID": vaccination.horse_id, "Status": vaccination.status})
    return vaccination


def save_schedule(user, values, schedule=None, horse=None):
    schedule = schedule or MedicalSchedule(horse=horse)
    for attr, value in values.items():
        setattr(schedule, attr, value)
    created = schedule.pk is None
    schedule.save()
    log_action(user, "ADD_MEDICAL_SCHEDULE" if created else "UPDATE_MEDICAL_SCHEDULE", schedule,
               {"HorseID": schedule.horse_id, "Status": schedule.status})
    return schedule


def overdue(status_value, planned_date):
    return status_value == "Scheduled" and planned_date < club_today()


# ---------------------------------------------------------------------------
# Báo cáo sức khỏe
# ---------------------------------------------------------------------------
@horse_serialized
def create_health_report(horse, user, values):
    """
    Groom / Work Rider / Trainer / Head Trainer báo sự cố -> vào hàng chờ Vet trực.
    Urgent + gắn buổi tập đang diễn ra (Flow 2) -> buổi tập tự dừng (Cancelled).
    """
    if horse.registration_status != Horse.RegistrationStatus.APPROVED:
        raise BusinessRuleError("Chỉ báo sự cố cho ngựa đang ở CLB (Approved).", "HORSE_NOT_APPROVED")
    attachment_ids = values.pop("AttachmentIDs", [])
    session = values.get("training_session")
    if session is not None and session.horse.pk != horse.pk:
        raise ValidationError({"TrainingSessionID": ["Buổi tập không thuộc ngựa này."]})
    existing = HealthReport.objects.filter(horse=horse).exclude(status="Resolved").first()
    if existing:
        if values.get("severity") == "Urgent":
            note = add_report_note(existing, user, values["description"][:2000], "Urgent", attachment_ids)
            if len(values["description"]) > 2000:
                add_report_note(existing, user, values["description"][2000:])
            existing.refresh_from_db()
            existing.stopped_session = getattr(note, "stopped_session", False)
            existing.reused_open_report = True
            return existing
        raise BusinessRuleError(f"Ngựa đã có báo cáo đang xử lý #{existing.pk}. Bổ sung ghi chú/ảnh hoặc nâng mức khẩn vào báo cáo này.", "OPEN_REPORT_EXISTS")
    report = HealthReport.objects.create(horse=horse, reported_by=user, reported_at=club_now(), **values)
    attach_images(report, user, attachment_ids)
    report.stopped_session = stop_urgent_sessions(report, user)
    log_action(user, "REPORT_HEALTH_ISSUE", report, {
        "HorseID": horse.pk, "Severity": report.severity, "StoppedSession": report.stopped_session,
    })
    if report.severity == "Urgent":
        alert_urgent(report)
    return report


@horse_serialized
def add_report_note(report, user, content, severity=None, attachment_ids=None):
    if report.status == HealthReport.Status.RESOLVED:
        raise BusinessRuleError("Báo cáo đã xử lý xong; nếu có sự cố mới hãy tạo báo cáo mới.", "REPORT_RESOLVED")
    note = HealthReportNote.objects.create(report=report, note_by=user, note_at=club_now(), content=content)
    attach_images(report, user, attachment_ids or [])
    if severity == "Urgent":
        escalated = report.severity != "Urgent"
        report.severity = "Urgent"
        report.save(update_fields=["severity"])
        note.stopped_session = stop_urgent_sessions(report, user)
        if escalated:
            alert_urgent(report)
    log_action(user, "ADD_HEALTH_REPORT_NOTE", report, {"HealthReportNoteID": note.id})
    return note


@horse_serialized
def take_report(report, user):
    """bác sĩ thú y trực nhận ca."""
    if report.status != HealthReport.Status.REPORTED:
        raise BusinessRuleError("Báo cáo đã có bác sĩ thú y nhận hoặc đã xử lý.", "INVALID_STATUS")
    report.status = HealthReport.Status.REVIEWING
    report.vet = user
    report.save(update_fields=["status", "vet"])
    log_action(user, "TAKE_HEALTH_REPORT", report)
    return report


@horse_serialized
def resolve_report(report, user, vet_note=None, medical_record=None):
    ensure_report_vet(report, user)
    if report.status == HealthReport.Status.RESOLVED:
        raise BusinessRuleError("Báo cáo đã xử lý xong.", "INVALID_STATUS")
    if medical_record is not None:
        if medical_record.horse_id != report.horse_id:
            raise ValidationError({"MedicalRecordID": ["Phiếu khám không thuộc ngựa này."]})
        report.medical_record = medical_record
    if not vet_note or not vet_note.strip():
        raise ValidationError({"VetNote": ["Cần ghi kết luận xử lý."]})
    if report.medical_record_id and not report.medical_record.is_signed:
        raise BusinessRuleError("Ký bệnh án liên quan trước khi đóng báo cáo.", "RECORD_NOT_SIGNED")
    report.status = HealthReport.Status.RESOLVED
    report.vet_id = report.vet_id or user.pk
    report.vet_note = vet_note or report.vet_note
    report.resolved_at = club_now()
    report.save(update_fields=["status", "vet", "vet_note", "resolved_at", "medical_record"])
    log_action(user, "RESOLVE_HEALTH_REPORT", report, {"MedicalRecordID": report.medical_record_id})
    return report


def ensure_report_vet(report, user):
    if report.vet_id and report.vet_id != user.pk:
        raise BusinessRuleError("Ca này do bác sĩ khác nhận xử lý.", "NOT_REPORT_VET")


def attach_images(report, user, ids):
    from .models import HealthReportAttachment
    from django.db.models import Q
    rows = list(HealthReportAttachment.objects.select_for_update().filter(pk__in=ids, horse=report.horse,
                uploaded_by=user).filter(Q(report__isnull=True) | Q(report=report)))
    if len(rows) != len(set(ids)):
        raise ValidationError({"AttachmentIDs": ["Ảnh không tồn tại, đã được dùng hoặc không thuộc lần tải của bạn."]})
    HealthReportAttachment.objects.filter(pk__in=[r.pk for r in rows]).update(report=report)


def stop_urgent_sessions(report, user):
    if report.severity != "Urgent" or not flows.has_training():
        return False
    from apps.training.models import TrainingSession
    from apps.training.services import stop_session
    sessions = list(TrainingSession.objects.select_for_update().filter(stage__plan__assignment__horse=report.horse,
                                                                      status="In Progress"))
    for session in sessions:
        if not report.training_session_id:
            report.training_session = session
            report.save(update_fields=["training_session"])
        stop_session(session, user, f"Báo cáo khẩn #{report.pk}: {report.description[:300]}")
        log_action(user, "HEALTH_REPORT_STOP_SESSION", session, {"HealthReportID": report.pk, "ReportedBy": user.pk,
                                                                "Reason": report.description[:300]})
    return bool(sessions)


def alert_urgent(report):
    from apps.core.emails import send_email
    from apps.core.workflow import notify
    from .duty import vets_to_alert
    vets = vets_to_alert(report.horse.club_id)
    notify(vets, report.horse, "HEALTH_REPORT_ESCALATED", f"urgent-report:{report.pk}",
           f"Báo cáo khẩn #{report.pk}: {report.horse.horse_name} · {report.description[:200]}")
    send_email([v.email for v in vets],
               f"[Khẩn] {report.horse.horse_name}: báo cáo sức khỏe #{report.pk}",
               f"{report.description}\nNgười báo: {report.reported_by.full_name}. Vui lòng nhận ca trong hàng chờ thú y.")


@horse_serialized
def training_incident(session, user, description):
    report = HealthReport.objects.filter(horse=session.horse).exclude(status="Resolved").first()
    if report:
        add_report_note(report, user, f"Buổi tập #{session.pk}: {description}"[:2000], "Urgent")
        return report
    return create_health_report(session.horse, user, {"description": description, "severity": "Urgent", "training_session": session})
