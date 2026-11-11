"""Thông báo Flow 3 (gộp vào GET /api/notifications khi đã có Flow 3)."""
from apps.core.clubtime import now as club_now, today as club_today
from datetime import date, timedelta

from apps.core import flows

from .models import HealthReport, MedicalSchedule, TrainingLock, Vaccination

# Nhãn tiếng Việt cho giá trị lưu trong database (không đưa chữ "Full", "Urgent"... ra giao diện)
REPORT_STATUS = {"Reported": "chờ bác sĩ tiếp nhận", "Reviewing": "đang xử lý", "Resolved": "đã xử lý"}
SCHEDULE_TYPE = {"Vaccination": "tiêm phòng", "Deworming": "tẩy giun", "Farrier": "chăm sóc móng",
                 "Routine Examination": "khám định kỳ"}
LOCK_TITLE = {"Full": "Ngựa bị khóa tập toàn bộ", "Restricted": "Ngựa bị giới hạn mức tập"}


def _day(value):
    return value.strftime("%d/%m/%Y") if value else None


def _health_reports(user, make_item, horse_filter=None):
    reports = HealthReport.objects.filter(horse__club_id=user.club_id).exclude(status="Resolved").select_related(
        "horse", "reported_by")
    if horse_filter is not None:
        reports = reports.filter(**horse_filter)
    return [
        make_item("HEALTH_REPORT",
                  ("Báo cáo sức khỏe khẩn" if r.severity == "Urgent" else "Báo cáo sức khỏe")
                  + f" · {REPORT_STATUS.get(r.status, r.status)}",
                  "HealthReport", r.id, r.horse, r.reported_at, r.severity == "Urgent",
                  f"{r.reported_by.full_name}: {r.description[:120]}")
        for r in reports
    ]


def lock_message(lock):
    """Nội dung thông báo khóa tập: lý do, mức tải tối đa (nếu giới hạn), ngày dự kiến mở, chi tiết."""
    parts = [f"Lý do: {lock.reason}"]
    if lock.lock_level == "Restricted" and lock.max_intensity is not None:
        parts.append(f"Mức tải tối đa: {lock.max_intensity:g}")
    parts.append(f"Dự kiến đến: {_day(lock.lock_end_date)}" if lock.lock_end_date else "Chưa có ngày dự kiến mở")
    if lock.details:
        parts.append(lock.details[:200])
    return " · ".join(parts)


def _locks(make_item, locks, released, prefix=""):
    items = []
    for lock in locks.filter(lock_status="Active").select_related("horse"):
        items.append(make_item(prefix + "TRAINING_LOCKED", LOCK_TITLE.get(lock.lock_level, LOCK_TITLE["Full"]),
                               "TrainingLock", lock.id, lock.horse, lock.lock_start_date, True, lock_message(lock)))
    for lock in released.filter(lock_status="Released").select_related("horse"):
        items.append(make_item(prefix + "TRAINING_UNLOCKED", "Ngựa được tập lại", "TrainingLock", lock.id, lock.horse,
                               lock.released_at, message="Bác sĩ thú y đã mở khóa tập."))
    return items


def medical_items(user, make_item):
    """Vet: báo cáo sức khỏe chưa xử lý, tiêm phòng / lịch y tế 7 ngày tới. Head Trainer, Trainer: báo cáo sức khỏe."""
    perms, club, today = user.permission_codes, user.club_id, club_today()
    soon = today + timedelta(days=7)
    items = []
    if "MEDICAL_MANAGE" in perms:  # Vet
        items += _health_reports(user, make_item)
        for v in Vaccination.objects.filter(horse__club_id=club, status="Scheduled",
                                            vaccination_date__lte=soon).select_related("horse"):
            items.append(make_item("VACCINATION_DUE", f"Lịch tiêm {v.vaccine_name}", "Vaccination", v.id, v.horse,
                                   v.vaccination_date, v.vaccination_date < today))
        for s in MedicalSchedule.objects.filter(horse__club_id=club, status="Scheduled",
                                                scheduled_date__lte=soon).select_related("horse"):
            items.append(make_item("MEDICAL_SCHEDULE", f"Lịch {SCHEDULE_TYPE.get(s.schedule_type, 'y tế')}",
                                   "MedicalSchedule", s.id, s.horse,
                                   s.scheduled_date, s.scheduled_date < today))
    elif "TRAINING_PLAN_APPROVE" in perms:  # Head Trainer theo dõi mọi báo cáo
        items += _health_reports(user, make_item)
    if "TRAINING_PLAN_MANAGE" in perms and flows.has_training():  # Trainer: báo cáo về ngựa mình phụ trách
        items += _health_reports(user, make_item, {"horse__trainer_assignments__trainer": user,
                                                   "horse__trainer_assignments__status": "Active"})
    # Khóa tập / mở khóa (mở khóa giữ 7 ngày): chủ ngựa, huấn luyện viên phụ trách, huấn luyện viên trưởng
    recent = {"released_at__date__gte": today - timedelta(days=7)}
    club_locks = TrainingLock.objects.filter(horse__club_id=club)
    if "OWNER_VIEW" in perms:
        mine = club_locks.filter(horse__owner=user) if club else TrainingLock.objects.filter(horse__owner=user)
        items += _locks(make_item, mine, mine.filter(**recent), "OWNER_")
    if "TRAINING_PLAN_APPROVE" in perms:
        items += _locks(make_item, club_locks, club_locks.filter(**recent))
    elif "TRAINING_PLAN_MANAGE" in perms and flows.has_training():
        mine = club_locks.filter(horse__trainer_assignments__trainer=user,
                                 horse__trainer_assignments__status="Active").distinct()
        items += _locks(make_item, mine, mine.filter(**recent))
    return items
