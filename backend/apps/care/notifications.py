"""Thông báo Flow 4 (gộp vào GET /api/notifications khi đã có Flow 4)."""
from apps.core.clubtime import now as club_now, today as club_today
from datetime import date

from .models import CareTask, DietPlan, InventoryItem, InventoryRequest


TASK_LABEL = {"Feeding": "Cho ăn", "Cleaning": "Dọn chuồng", "Bathing": "Tắm, kiểm tra chân", "Ice Leg Soak": "Ngâm chân nước đá"}


def care_items(user, make_item):
    """Manager: yêu cầu vật tư, vật tư sắp hết. Vet: khẩu phần chờ duyệt. Head Trainer: khẩu phần bị trả về.
    Groom: việc chăm sóc tới hạn."""
    perms, club, today = user.permission_codes, user.club_id, club_today()
    items = []
    if "INVENTORY_MANAGE" in perms:  # Club Manager
        for req in InventoryRequest.objects.filter(club_id=club, status="Pending").select_related("requested_by"):
            items.append(make_item("INVENTORY_REQUEST", f"Yêu cầu vật tư của {req.requested_by.full_name}",
                                   "InventoryRequest", req.id, at=req.request_date, message=req.reason))
        for item in InventoryItem.objects.filter(club_id=club, status__in=("Low Stock", "Out of Stock")):
            items.append(make_item("LOW_STOCK", f"{item.item_name}: {item.status} ({item.quantity} {item.unit})",
                                   "InventoryItem", item.id, urgent=item.status == "Out of Stock"))
    if "MEDICAL_MANAGE" in perms and "DIET_MANAGE" in perms:  # Vet duyệt khẩu phần
        for plan in DietPlan.objects.filter(horse__club_id=club, status="Pending").select_related("horse"):
            items.append(make_item("DIET_TO_REVIEW", "Khẩu phần chờ bác sĩ thú y duyệt", "DietPlan", plan.id, plan.horse,
                                   plan.created_at))
    if "TRAINING_PLAN_APPROVE" in perms:  # Head Trainer lập khẩu phần
        for plan in DietPlan.objects.filter(horse__club_id=club, created_by=user, status="Rejected"):
            items.append(make_item("DIET_RETURNED", "Khẩu phần bị bác sĩ thú y trả về", "DietPlan", plan.id, plan.horse,
                                   plan.created_at, message=plan.vet_note))
        items += _diet_review_needed(club, today, make_item)
    if "CARE_MANAGE" in perms:  # Groom
        for task in CareTask.objects.filter(groom=user, status="Pending",
                                            scheduled_at__date__lte=today).select_related("horse"):
            label = TASK_LABEL.get(task.task_type, task.task_type)
            items.append(make_item("CARE_TASK", f"{label} lúc {task.scheduled_at:%H:%M %d/%m}", "CareTask",
                                   task.id, task.horse, task.scheduled_at, task.scheduled_at.date() < today))
    return items


def _diet_review_needed(club, today, make_item):
    """Ngựa đang có giáo án Active mà chưa có khẩu phần, hoặc khẩu phần đang dùng lập theo giáo án khác."""
    from apps.core import flows

    if not flows.has_training():
        return []
    from apps.training.models import TrainingPlan

    from .services import current_diet_plan

    items = []
    for plan in TrainingPlan.objects.filter(assignment__horse__club_id=club, status="Active",
                                            assignment__horse__registration_status="Approved").select_related(
            "assignment__horse"):
        horse = plan.assignment.horse
        if DietPlan.objects.filter(horse=horse, status="Pending").exists():
            continue
        diet = current_diet_plan(horse, today)
        if diet is None or diet.training_plan_id != plan.id:
            items.append(make_item("DIET_REVIEW_NEEDED", "Chưa có khẩu phần theo giáo án đang chạy" if diet is None
                                   else "Giáo án mới: nên lập lại khẩu phần", "TrainingPlan", plan.id, horse,
                                   plan.approved_at, message=plan.goal))
    return items
