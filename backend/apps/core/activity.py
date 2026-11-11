"""
Thông báo "có người gửi việc cho bạn": tính từ nhật ký thao tác (dbo.AuditLog) trong 7 ngày gần nhất.

Mỗi thao tác có người nhận (ví dụ bác sĩ thú y duyệt khẩu phần -> huấn luyện viên trưởng đã lập khẩu phần và
người chăm sóc ngựa đó; huấn luyện viên trưởng xếp buổi tập -> kỵ sĩ tập luyện và huấn luyện viên phụ trách).
Người thực hiện thao tác không nhận thông báo của chính mình.
Thông báo dạng "việc đang chờ" (hồ sơ chờ duyệt, báo cáo chờ xử lý...) vẫn nằm ở các file notifications.py.
"""
import json
from collections import defaultdict
from datetime import timedelta

from django.apps import apps as django_apps
from django.utils import timezone

from . import flows
from .models import AuditLog

ACTIVITY_DAYS = 7
SHIFT = {"Morning": "ca sáng", "Afternoon": "ca chiều", "Night": "ca đêm", "Full Day": "cả ngày"}
TASK = {"Feeding": "Cho ăn", "Cleaning": "Dọn chuồng", "Bathing": "Tắm, kiểm tra chân", "Ice Leg Soak": "Ngâm chân nước đá"}

# bảng -> "app_label.Model" (chỉ nạp khi app đó có trong dự án)
TABLES = {
    "Horse": "horses.Horse", "User": "accounts.User",
    "TrainingPlan": "training.TrainingPlan", "TrainingSession": "training.TrainingSession",
    "MedicalRecord": "medical.MedicalRecord", "HealthReport": "medical.HealthReport",
    "VetDutyShift": "medical.VetDutyShift", "TrainingLock": "medical.TrainingLock",
    "DietPlan": "care.DietPlan", "InventoryRequest": "care.InventoryRequest", "CareTask": "care.CareTask",
}


def _day(value):
    return value.strftime("%d/%m/%Y") if value else ""


def _details(log):
    try:
        return json.loads(log.details) if log.details else {}
    except (TypeError, ValueError):
        return {}


def _actor(log):
    return log.user.full_name if log.user_id and log.user else "Hệ thống"


def _groom_id(horse):
    if not flows.has_care():
        return None
    from apps.care.models import HorseGroom

    link = HorseGroom.objects.filter(horse=horse).first()
    return link.groom_id if link else None


def _trainer_ids(horse):
    if not flows.has_training():
        return set()
    from apps.training.models import TrainerHorseAssignment

    return set(TrainerHorseAssignment.objects.filter(horse=horse, status="Active").values_list("trainer_id", flat=True))


def _is_head(user, horse):
    return "TRAINING_PLAN_APPROVE" in user.permission_codes and horse is not None and horse.club_id == user.club_id


def _is_manager(user, horse):
    return "CLUB_MANAGE" in user.permission_codes and horse is not None and horse.club_id == user.club_id


def _is_vet(user, horse):
    return "MEDICAL_MANAGE" in user.permission_codes and horse is not None and horse.club_id == user.club_id


def _session_people(session):
    plan_trainer = session.stage.plan.assignment.trainer_id
    return session.work_rider_id, plan_trainer, session.substitute_trainer_id


# ---------- từng loại thao tác: trả (tiêu đề, ngựa, nội dung, khẩn) nếu user là người nhận, ngược lại None ----------
def _horse_actions(log, horse, user):
    d, kind = _details(log), log.action_type
    owner = horse.owner_id == user.id
    if kind == "VERIFY_REGISTRATION" and owner:
        return "Hồ sơ ngựa đã được xác minh, đang chờ bác sĩ thú y khám", horse, None, False
    if kind == "APPROVE_REGISTRATION":
        if owner:
            return "Ngựa đã được tiếp nhận chính thức vào câu lạc bộ", horse, None, False
        if _is_head(user, horse):
            return "Ngựa mới được tiếp nhận, cần đánh giá và phân công huấn luyện viên", horse, None, False
    if kind == "ARCHIVE_HORSE" and (owner or user.id == _groom_id(horse) or user.id in _trainer_ids(horse)):
        return "Hồ sơ ngựa đã được lưu trữ", horse, d.get("Reason"), False
    if kind == "MOVE_STALL" and (owner or user.id == _groom_id(horse)):
        return "Ngựa được chuyển sang chuồng mới", horse, None, False
    if kind == "SET_HORSE_GROOM" and d.get("GroomID") == user.id:
        return "Bạn được phân công chăm sóc ngựa", horse, None, False
    if kind == "ASSIGN_TRAINER":
        if d.get("TrainerID") == user.id:
            return "Bạn được phân công huấn luyện ngựa", horse, "Vui lòng lập giáo án để bắt đầu huấn luyện.", False
        if owner:
            return "Ngựa đã được phân công huấn luyện viên", horse, None, False
    if kind == "END_TRAINER_ASSIGNMENT" and flows.has_training():
        from apps.training.models import TrainerHorseAssignment

        assignment = TrainerHorseAssignment.objects.filter(pk=d.get("TrainerHorseAssignmentID")).first()
        if assignment and assignment.trainer_id == user.id:
            return "Kết thúc phân công huấn luyện ngựa", horse, d.get("Reason"), False
    return None


def _plan_actions(log, plan, user):
    horse, trainer = plan.assignment.horse, plan.assignment.trainer_id
    d, kind = _details(log), log.action_type
    if trainer != user.id:
        return None
    if kind == "APPROVE_TRAINING_PLAN":
        return "Giáo án đã được duyệt", horse, plan.review_note, False
    if kind == "CANCEL_TRAINING_PLAN":
        return "Giáo án đã bị hủy", horse, d.get("Reason"), False
    if kind == "COMPLETE_TRAINING_PLAN":
        return "Giáo án đã được hoàn tất", horse, None, False
    return None


def _session_actions(log, session, user):
    rider, trainer, substitute = _session_people(session)
    when = f"{_day(session.session_date)} lúc {session.start_time:%H:%M}"
    d, kind, horse = _details(log), log.action_type, session.horse
    if kind == "STOP_TRAINING_SESSION":
        if user.id in (rider, trainer, substitute) or _is_head(user, horse) or user.id == _groom_id(horse):
            return f"Buổi tập ngày {when} bị dừng giữa chừng", horse, d.get("Reason"), True
        return None
    if user.id not in (rider, trainer, substitute):
        return None
    if kind == "ASSIGN_TRAINING_SESSION":
        if user.id == rider:
            return f"Bạn được xếp buổi tập ngày {when}", horse, session.instructions, False
        if user.id == substitute:
            return f"Bạn giám sát thay buổi tập ngày {when}", horse, None, False
        return f"Buổi tập mới được xếp ngày {when}", horse, None, False
    if kind == "UPDATE_TRAINING_SESSION":
        return f"Buổi tập ngày {when} đã được cập nhật", horse, None, False
    if kind == "CANCEL_TRAINING_SESSION":
        return f"Buổi tập ngày {when} đã bị hủy", horse, d.get("Reason"), False
    if kind == "REVIEW_TRAINING_SESSION" and user.id == rider:
        return f"Huấn luyện viên đã đánh giá buổi tập ngày {_day(session.session_date)}", horse, None, False
    return None


def _record_actions(log, record, user):
    if log.action_type != "SIGN_MEDICAL_RECORD" or record.exam_type == "Initial Exam":
        return None
    horse = record.horse
    if horse.owner_id == user.id or _is_head(user, horse) or user.id in _trainer_ids(horse) \
            or user.id == _groom_id(horse):
        message = None if user.has_role("GROOM", "WORK_RIDER") else record.conclusion or record.diagnosis
        return "Bác sĩ thú y đã chốt phiếu khám", horse, message, False
    return None


def _report_actions(log, report, user):
    kind, horse = log.action_type, report.horse
    if report.reported_by_id == user.id:
        if kind == "TAKE_HEALTH_REPORT":
            return f"Bác sĩ {_actor(log)} đã tiếp nhận báo cáo sức khỏe của bạn", horse, None, False
        if kind == "RESOLVE_HEALTH_REPORT":
            return "Báo cáo sức khỏe của bạn đã được xử lý", horse, report.vet_note, False
        if kind == "ADD_HEALTH_REPORT_NOTE":
            return f"{_actor(log)} đã thêm ghi chú vào báo cáo sức khỏe", horse, None, False
    if kind == "ADD_HEALTH_REPORT_NOTE" and report.vet_id == user.id:
        return f"{_actor(log)} đã bổ sung báo cáo sức khỏe", horse, None, report.severity == "Urgent"
    return None


def _diet_actions(log, plan, user):
    kind, horse = log.action_type, plan.horse
    creator, groom = plan.created_by_id == user.id, user.id == _groom_id(horse)
    if kind == "APPROVE_DIET_PLAN":
        if creator:
            return "Khẩu phần đã được huấn luyện viên trưởng chốt", horse, plan.vet_note, False
        if groom:
            return "Khẩu phần mới được áp dụng cho ngựa", horse, plan.diet_description, False
    if kind == "ADJUST_DIET_PLAN" and (creator or groom):
        return "Bác sĩ thú y đã điều chỉnh khẩu phần", horse, _details(log).get("VetNote"), False
    return None


def _qty(value):
    text = f"{value:f}" if value is not None else "0"
    return text.rstrip("0").rstrip(".") if "." in text else text


def _inventory_actions(log, req, user):
    """Người gửi phiếu xin vật tư nhận thông báo khi phiếu được duyệt (kèm số lượng được cấp) hoặc bị từ chối (kèm lý do)."""
    if req.requested_by_id != user.id:
        return None
    if log.action_type == "APPROVE_INVENTORY_REQUEST":
        lines = [f"{line.item.item_name} {_qty(line.approved_quantity)} {line.item.unit}"
                 for line in req.items.select_related("item") if line.approved_quantity]
        return (f"Phiếu xin vật tư #{req.id} đã được duyệt", None,
                f"Đã cấp: {', '.join(lines)}" if lines else None, False)
    if log.action_type == "REJECT_INVENTORY_REQUEST":
        note = _details(log).get("Note")
        return f"Phiếu xin vật tư #{req.id} bị từ chối", None, f"Lý do: {note}" if note else None, False
    return None


def _task_actions(log, task, user):
    label = TASK.get(task.task_type, task.task_type)
    if log.action_type == "CREATE_CARE_TASK" and task.groom_id == user.id:
        return f"Việc chăm sóc mới: {label} lúc {task.scheduled_at:%H:%M %d/%m}", task.horse, task.note, False
    if log.action_type == "SKIP_CARE_TASK":
        horse = task.horse
        vet_order = task.task_type == "Ice Leg Soak" and _is_vet(user, horse)
        if _is_head(user, horse) or _is_manager(user, horse) or vet_order:
            return (f"{_actor(log)} bỏ qua việc {label} lúc {task.scheduled_at:%H:%M %d/%m}", horse,
                    _details(log).get("Reason"), vet_order)
    return None


def _lock_actions(log, lock, user):
    horse = lock.horse
    if user.id != _groom_id(horse):
        return None
    if user.has_perm("TRAINING_PLAN_APPROVE") or user.id in _trainer_ids(horse):
        return None  # đã nhận thông báo khóa từ medical/WorkflowNotice
    if log.action_type == "CREATE_TRAINING_LOCK":
        title = "Ngựa bị khóa tập toàn bộ" if lock.lock_level == "Full" else "Ngựa bị giới hạn mức tập"
        return title, horse, lock.reason, True
    if log.action_type == "RELEASE_TRAINING_LOCK":
        return "Ngựa được tập lại", horse, "Bác sĩ thú y đã mở khóa tập.", False
    return None


def _duty_actions(log, shift, user):
    if log.action_type == "CREATE_VET_DUTY_SHIFT" and shift.vet_id == user.id:
        return f"Bạn được xếp trực ngày {_day(shift.duty_date)} ({SHIFT.get(shift.shift, shift.shift)})", None, \
            shift.note, False
    return None


def _user_actions(log, target, user):
    if log.action_type == "CHANGE_USER_ROLES" and target.id == user.id:
        return "Chức vụ của bạn đã được cập nhật", None, None, False
    return None


HANDLERS = {
    "Horse": (_horse_actions, ("VERIFY_REGISTRATION", "APPROVE_REGISTRATION", "ARCHIVE_HORSE", "MOVE_STALL",
                               "SET_HORSE_GROOM", "ASSIGN_TRAINER", "END_TRAINER_ASSIGNMENT")),
    "TrainingPlan": (_plan_actions, ("APPROVE_TRAINING_PLAN", "CANCEL_TRAINING_PLAN", "COMPLETE_TRAINING_PLAN")),
    "TrainingSession": (_session_actions, ("ASSIGN_TRAINING_SESSION", "UPDATE_TRAINING_SESSION",
                                           "CANCEL_TRAINING_SESSION", "REVIEW_TRAINING_SESSION",
                                           "STOP_TRAINING_SESSION")),
    "MedicalRecord": (_record_actions, ("SIGN_MEDICAL_RECORD",)),
    "HealthReport": (_report_actions, ("TAKE_HEALTH_REPORT", "RESOLVE_HEALTH_REPORT", "ADD_HEALTH_REPORT_NOTE")),
    "DietPlan": (_diet_actions, ("APPROVE_DIET_PLAN", "ADJUST_DIET_PLAN")),
    "InventoryRequest": (_inventory_actions, ("APPROVE_INVENTORY_REQUEST", "REJECT_INVENTORY_REQUEST")),
    "CareTask": (_task_actions, ("CREATE_CARE_TASK", "SKIP_CARE_TASK")),
    "TrainingLock": (_lock_actions, ("CREATE_TRAINING_LOCK", "RELEASE_TRAINING_LOCK")),
    "VetDutyShift": (_duty_actions, ("CREATE_VET_DUTY_SHIFT",)),
    "User": (_user_actions, ("CHANGE_USER_ROLES",)),
}
RELATED = {
    "TrainingPlan": ("assignment__horse",),
    "TrainingSession": ("stage__plan__assignment", "work_rider"),
    "MedicalRecord": ("horse",), "HealthReport": ("horse",), "DietPlan": ("horse",), "CareTask": ("horse",),
    "TrainingLock": ("horse",),
}


def _model(table):
    try:
        return django_apps.get_model(TABLES[table])
    except (LookupError, KeyError):
        return None


def activity_items(user, make_item):
    groom_scope = None
    if user.has_role("GROOM"):
        from .access import operational_horses
        groom_scope = set(operational_horses(user).values_list("pk", flat=True))
    since = timezone.now() - timedelta(days=ACTIVITY_DAYS)
    actions = {a: table for table, (_, kinds) in HANDLERS.items() for a in kinds}
    logs = list(AuditLog.objects.filter(action_type__in=list(actions), action_time__gte=since)
                .exclude(user=user).select_related("user").order_by("action_time", "id"))
    ids = defaultdict(set)
    for log in logs:
        if log.entity_name in HANDLERS and log.entity_id:
            ids[log.entity_name].add(log.entity_id)
    objects = {}
    for table, pks in ids.items():
        model = _model(table)
        if model is None:
            continue
        query = model.objects.all()
        if RELATED.get(table):
            query = query.select_related(*RELATED[table])
        objects[table] = query.in_bulk(list(pks))
    items = []
    for log in logs:
        obj = objects.get(log.entity_name, {}).get(log.entity_id)
        if obj is None or actions.get(log.action_type) != log.entity_name:
            continue
        horse = obj if log.entity_name == "Horse" else getattr(obj, "horse", None)
        if horse is None and log.entity_name == "TrainingPlan":
            horse = obj.assignment.horse
        if groom_scope is not None and horse is not None and horse.pk not in groom_scope:
            continue
        club_id = horse.club_id if horse is not None else getattr(obj, "club_id", None)
        if club_id != user.club_id and not (horse is not None and horse.owner_id == user.pk):
            continue
        found = HANDLERS[log.entity_name][0](log, obj, user)
        if found:
            title, horse, message, urgent = found
            items.append(make_item(f"ACT_{log.action_type}", title, log.entity_name, log.entity_id, horse,
                                   log.action_time, urgent, message[:200] if message else None))
    return items
