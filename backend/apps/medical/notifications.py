"""Thông báo Flow 3 (gộp vào GET /api/notifications khi đã có Flow 3)."""
from datetime import date, timedelta

from apps.core import flows

from .models import HealthReport, MedicalSchedule, TrainingLock, Vaccination


def _health_reports(user, make_item, horse_filter=None):
    reports = HealthReport.objects.filter(horse__club_id=user.club_id).exclude(status="Resolved").select_related(
        "horse", "reported_by")
    if horse_filter is not None:
        reports = reports.filter(**horse_filter)
    return [
        make_item("HEALTH_REPORT", f"Báo cáo sức khỏe ({r.severity}) - {r.status}", "HealthReport", r.id, r.horse,
                  r.reported_at, r.severity == "Urgent", f"{r.reported_by.full_name}: {r.description[:120]}")
        for r in reports
    ]


def medical_items(user, make_item):
    """Vet: báo cáo sức khỏe chưa xử lý, tiêm phòng / lịch y tế 7 ngày tới. Head Trainer, Trainer: báo cáo sức khỏe."""
    perms, club, today = user.permission_codes, user.club_id, date.today()
    soon = today + timedelta(days=7)
    items = []
    if "MEDICAL_MANAGE" in perms:  # Vet
        items += _health_reports(user, make_item)
        for v in Vaccination.objects.filter(horse__club_id=club, status="Scheduled",
                                            vaccination_date__lte=soon).select_related("horse"):
            items.append(make_item("VACCINATION_DUE", f"Tiêm {v.vaccine_name}", "Vaccination", v.id, v.horse,
                                   v.vaccination_date, v.vaccination_date < today))
        for s in MedicalSchedule.objects.filter(horse__club_id=club, status="Scheduled",
                                                scheduled_date__lte=soon).select_related("horse"):
            items.append(make_item("MEDICAL_SCHEDULE", f"Lịch {s.schedule_type}", "MedicalSchedule", s.id, s.horse,
                                   s.scheduled_date, s.scheduled_date < today))
    elif "TRAINING_PLAN_APPROVE" in perms:  # Head Trainer theo dõi mọi báo cáo
        items += _health_reports(user, make_item)
    if "TRAINING_PLAN_MANAGE" in perms and flows.has_training():  # Trainer: báo cáo về ngựa mình phụ trách
        items += _health_reports(user, make_item, {"horse__trainer_assignments__trainer": user,
                                                   "horse__trainer_assignments__status": "Active"})
    if flows.has_training() and ("TRAINING_PLAN_APPROVE" in perms or "TRAINING_PLAN_MANAGE" in perms):
        items += _lock_events(user, make_item, today)
    if "OWNER_VIEW" in perms:  # chủ ngựa: Vet đổi mức khóa (7 ngày)
        items += _lock_events(user, make_item, today, owner=True)
    if "OWNER_VIEW" in perms:  # Chủ ngựa: ngựa mình đang bị khóa tập / vừa được mở khóa (7 ngày)
        for lock in TrainingLock.objects.filter(horse__owner=user, lock_status="Active").select_related("horse"):
            items.append(make_item("OWNER_TRAINING_LOCKED", f"Ngựa tạm dừng huấn luyện ({lock.lock_level})",
                                   "TrainingLock", lock.id, lock.horse, lock.lock_start_date, True, lock.reason))
        for lock in TrainingLock.objects.filter(horse__owner=user, lock_status="Released",
                                                released_at__date__gte=today - timedelta(days=7)).select_related("horse"):
            items.append(make_item("OWNER_TRAINING_UNLOCKED", "Ngựa được tập lại", "TrainingLock", lock.id, lock.horse,
                                   lock.released_at))
    return items


LOCK_EVENTS = {
    "CREATE_TRAINING_LOCK": ("TRAINING_LOCKED", "Vet khóa tập ({level}): xem lại giáo án", True),
    "UPDATE_TRAINING_LOCK": ("TRAINING_LOCK_CHANGED", "Vet đổi mức khóa tập sang {level}: xem lại giáo án", True),
    "RELEASE_TRAINING_LOCK": ("TRAINING_UNLOCKED", "Ngựa được tập lại: xem lại lịch tập", False),
}


def _lock_events(user, make_item, today, owner=False):
    """
    Head Trainer (mọi ngựa) và Trainer (ngựa mình phụ trách): Vet khóa / đổi mức khóa / mở khóa trong 7 ngày qua,
    kèm nhắc xem lại giáo án. Chủ ngựa (owner=True): chỉ sự kiện đổi mức khóa (khóa / mở khóa đã có thông báo riêng).
    """
    import json

    from apps.core.models import AuditLog

    perms = user.permission_codes
    locks = TrainingLock.objects.filter(horse__club_id=user.club_id) if not owner else \
        TrainingLock.objects.filter(horse__owner=user)
    if not owner and "TRAINING_PLAN_APPROVE" not in perms:   # Trainer: chỉ ngựa đang phụ trách
        locks = locks.filter(horse__trainer_assignments__trainer=user, horse__trainer_assignments__status="Active")
    locks = {lock.id: lock for lock in locks.select_related("horse").distinct()}
    actions = ["UPDATE_TRAINING_LOCK"] if owner else list(LOCK_EVENTS)
    items = []
    for log in AuditLog.objects.filter(entity_name=TrainingLock._meta.db_table, entity_id__in=list(locks),
                                       action_type__in=actions,
                                       action_time__date__gte=today - timedelta(days=7)).order_by("action_time"):
        lock = locks[log.entity_id]
        try:
            details = json.loads(log.details or "{}")
        except (TypeError, ValueError):
            details = {}
        if log.action_type == "UPDATE_TRAINING_LOCK" and not details.get("LevelChanged"):
            continue
        kind, title, urgent = LOCK_EVENTS[log.action_type]
        if owner:
            kind, title = "OWNER_TRAINING_LOCK_CHANGED", "Vet đổi mức hạn chế huấn luyện ({level})"
        items.append(make_item(kind, title.format(level=details.get("LockLevel") or lock.lock_level), "TrainingLock",
                               lock.id, lock.horse, log.action_time, urgent, lock.reason))
    return items
