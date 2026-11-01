"""Thông báo Flow 4 (gộp vào GET /api/notifications khi đã có Flow 4)."""
from datetime import date

from .models import CareTask, DietPlan, InventoryItem, InventoryRequest


def care_items(user, make_item):
    """Manager: yêu cầu vật tư, vật tư sắp hết, ngựa chưa có Groom. Vet: khẩu phần chờ góp ý / duyệt, ngựa bỏ ăn.
    Head Trainer: khẩu phần bị trả về / chờ chốt. Trainer: ngựa mình phụ trách bỏ ăn. Groom: việc chăm sóc tới hạn."""
    perms, club, today = user.permission_codes, user.club_id, date.today()
    items = []
    if "INVENTORY_MANAGE" in perms:  # Club Manager
        for req in InventoryRequest.objects.filter(club_id=club, status="Pending").select_related("requested_by"):
            items.append(make_item("INVENTORY_REQUEST", f"Yêu cầu vật tư của {req.requested_by.full_name}",
                                   "InventoryRequest", req.id, at=req.request_date, message=req.reason))
        for item in InventoryItem.objects.filter(club_id=club, status__in=("Low Stock", "Out of Stock")):
            items.append(make_item("LOW_STOCK", f"{item.item_name}: {item.status} ({item.quantity} {item.unit})",
                                   "InventoryItem", item.id, urgent=item.status == "Out of Stock"))
    if "CLUB_MANAGE" in perms:  # Manager xếp Groom: ngựa đang ở CLB chưa có Groom phụ trách
        from apps.horses.models import Horse

        for horse in Horse.objects.filter(club_id=club, registration_status="Approved", groom_link__isnull=True):
            items.append(make_item("HORSE_WITHOUT_GROOM", "Ngựa chưa có Groom phụ trách", "Horse", horse.id, horse,
                                   horse.updated_at))
    if "MEDICAL_MANAGE" in perms and "DIET_MANAGE" in perms:  # Vet góp ý / duyệt khẩu phần
        from .services import needs_vet_approval

        for plan in DietPlan.objects.filter(horse__club_id=club, status="Pending").select_related("horse"):
            if needs_vet_approval(plan.horse):
                items.append(make_item("DIET_TO_REVIEW", "Khẩu phần chờ bác sĩ duyệt (ngựa đang điều trị / khóa tập)",
                                       "DietPlan", plan.id, plan.horse, plan.created_at, True))
            elif plan.reviewed_by_id is None:
                items.append(make_item("DIET_TO_REVIEW", "Khẩu phần chờ bác sĩ góp ý", "DietPlan", plan.id,
                                       plan.horse, plan.created_at))
    if "TRAINING_PLAN_APPROVE" in perms:  # Head Trainer lập khẩu phần
        from .services import needs_vet_approval

        for plan in DietPlan.objects.filter(horse__club_id=club, created_by=user, status="Rejected"):
            items.append(make_item("DIET_RETURNED", "Khẩu phần bị bác sĩ trả về", "DietPlan", plan.id, plan.horse,
                                   plan.created_at, message=plan.vet_note))
        for plan in DietPlan.objects.filter(horse__club_id=club, created_by=user, status="Pending",
                                            reviewed_by__isnull=False).select_related("horse"):
            if not needs_vet_approval(plan.horse):
                items.append(make_item("DIET_COMMENTED", "Bác sĩ đã góp ý khẩu phần, chờ bạn chốt", "DietPlan",
                                       plan.id, plan.horse, plan.created_at, message=plan.vet_note))
        items += _diet_review_needed(club, today, make_item)
    if "MEDICAL_MANAGE" in perms or "TRAINING_PLAN_MANAGE" in perms:  # ngựa bỏ ăn liên tiếp
        items += _feed_refused(user, make_item, today)
    if "CARE_MANAGE" in perms and user.club is not None:  # Groom: sinh việc hôm nay theo chỉ tiêu trước khi báo
        from .automation import generate_for_day

        generate_for_day(user.club, today)
    if "CARE_MANAGE" in perms:  # Groom
        for task in CareTask.objects.filter(groom=user, status="Pending",
                                            scheduled_at__date__lte=today).select_related("horse"):
            items.append(make_item("CARE_TASK", f"{task.task_type} lúc {task.scheduled_at:%H:%M %d/%m}", "CareTask",
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


REFUSED_IN_A_ROW = 2


def _feed_refused(user, make_item, today):
    """
    Ngựa bỏ ăn {REFUSED_IN_A_ROW} bữa liên tiếp gần nhất (trong 2 ngày qua) -> báo Vet (mọi ngựa) và Trainer phụ trách.
    Bỏ ăn thường là dấu hiệu bệnh sớm nhất.
    """
    from datetime import timedelta

    from . import access

    horses = CareTask.objects.filter(horse__club_id=user.club_id, task_type="Feeding", status="Completed",
                                     intake_status="Refused", completed_at__date__gte=today - timedelta(days=2))
    if not access.is_vet(user):
        horses = horses.filter(horse_id__in=access.trainer_horse_ids(user))
    items = []
    for horse_id in set(horses.values_list("horse_id", flat=True)):
        recent = list(CareTask.objects.filter(horse_id=horse_id, task_type="Feeding", status="Completed")
                      .select_related("horse").order_by("-scheduled_at", "-id")[:REFUSED_IN_A_ROW])
        if len(recent) == REFUSED_IN_A_ROW and all(t.intake_status == "Refused" for t in recent):
            latest = recent[0]
            items.append(make_item("FEED_REFUSED", f"Ngựa bỏ ăn {REFUSED_IN_A_ROW} bữa liên tiếp", "CareTask",
                                   latest.id, latest.horse, latest.completed_at, True,
                                   f"Groom {latest.groom.full_name} ghi nhận lúc {latest.completed_at:%H:%M %d/%m}"))
    return items
