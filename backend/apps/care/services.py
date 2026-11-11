"""
Luật nghiệp vụ Flow 4 - chăm sóc và dinh dưỡng.

Khẩu phần:  Head Trainer lập (Pending) ──Head Trainer chốt──> Approved
                 ^                 │ Vet reject (kèm VetNote)
                 └── sửa, gửi lại ─┘ Rejected
            Vet góp ý / đặt hạn chế riêng; không sửa bữa của bản đã chốt.
            Khẩu phần mới được chốt -> khẩu phần cũ kết thúc hôm trước ngày áp dụng (hoặc Expired).
Khẩu phần gắn với giáo án đang chạy (TrainingPlanID): Head Trainer xem ngữ cảnh tập (diet_context) trước khi lập.
Việc chăm sóc: hệ thống tự sinh theo chỉ tiêu (automation.py), Head Trainer / Manager giao thêm việc ngoài chỉ tiêu.
               Groom KHÔNG tự tạo việc, chỉ hoàn thành / bỏ qua (kèm lý do). Pending -> Completed / Skipped.
Vật tư:     Groom / Head Trainer gửi yêu cầu (Pending) -> Manager duyệt (trừ kho) / từ chối; người gửi hủy được.
"""
from apps.core.clubtime import now as club_now, today as club_today
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone
from django.db import transaction
from django.db.models import F
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core import flows

from apps.core.audit import log_action
from apps.core.exceptions import BusinessRuleError
from apps.core.permissions import require_club_user, user_has_any
from apps.horses.models import Horse
from apps.core.locking import horse_serialized

from .models import CareTask, DietMeal, DietPlan, HorseGroom, InventoryItem, InventoryRequest, InventoryRequestItem, VetDietRestriction

D = DietPlan.Status
IN_FORCE = (D.APPROVED, D.ADJUSTED)
CARE_ASSIGNERS = ("TRAINER_ASSIGN", "CLUB_MANAGE")   # Head Trainer, Club Manager


def _ensure_horse(horse):
    if horse.registration_status != Horse.RegistrationStatus.APPROVED:
        raise BusinessRuleError("Chỉ áp dụng cho ngựa đang ở câu lạc bộ.", "HORSE_NOT_APPROVED")


# ---------------------------------------------------------------------------
# Khẩu phần
# ---------------------------------------------------------------------------
def current_diet_plan(horse, on_day=None):
    on_day = on_day or club_today()
    from django.db.models import Q

    plan = (horse.diet_plans.filter(status__in=IN_FORCE, start_date__lte=on_day)
            .filter(Q(end_date__isnull=True) | Q(end_date__gte=on_day)).order_by("-start_date", "-id").first())
    return plan if plan is None or not diet_violations(plan, on_day) else None


def _check_plan_dates(start, end):
    if end and end < start:
        raise ValidationError({"EndDate": ["Ngày kết thúc phải sau ngày bắt đầu."]})


def _replace_meals(plan, meals):
    if not meals:
        raise ValidationError({"Meals": ["Khẩu phần cần ít nhất một bữa ăn."]})
    plan.meals.all().delete()
    for meal in meals:
        DietMeal.objects.create(diet_plan=plan, **meal)


def active_training_plan(horse):
    if not flows.has_training():
        return None
    from apps.training.models import TrainingPlan

    return TrainingPlan.objects.filter(assignment__horse=horse, status="Active").order_by("-start_date", "-id").first()


def _training_plan_for(horse, training_plan_id):
    """TrainingPlanID gửi lên phải là giáo án Active của ngựa; không gửi -> tự gắn giáo án Active (nếu có)."""
    if training_plan_id is None:
        plan = active_training_plan(horse)
        return plan.id if plan else None
    if not flows.has_training():
        raise ValidationError({"TrainingPlanID": ["Chưa có phân hệ huấn luyện."]})
    from apps.training.models import TrainingPlan

    if not TrainingPlan.objects.filter(pk=training_plan_id, assignment__horse=horse, status="Active").exists():
        raise ValidationError({"TrainingPlanID": ["Cần chọn giáo án đang chạy của chính ngựa này."]})
    return training_plan_id


@horse_serialized
def create_diet_plan(horse, user, values, meals):
    _ensure_horse(horse)
    _check_plan_dates(values["start_date"], values.get("end_date"))
    values["training_plan_id"] = _training_plan_for(horse, values.pop("TrainingPlanID", None))
    plan = DietPlan.objects.create(horse=horse, created_by=user, status=D.PENDING, created_at=club_now(),
                                   **values)
    _replace_meals(plan, meals)
    log_action(user, "CREATE_DIET_PLAN", plan, {"HorseID": horse.pk, "TrainingPlanID": plan.training_plan_id})
    return plan


def diet_context(horse, today=None):
    """Thông tin để Huấn luyện viên trưởng lập khẩu phần theo giáo án / kết quả tập (GET /api/horses/<id>/diet-context)."""
    from django.db.models import Avg, Count, Sum

    today = today or club_today()
    body = {"HorseID": horse.id, "HorseName": horse.horse_name, "CurrentHealthStatus": horse.current_health_status,
            "LatestWeightKg": None, "ActiveTrainingPlan": None, "CurrentStage": None, "Last14Days": None,
            "Next7Days": None, "TrainingLock": None, "CurrentDiet": None, "Notes": []}
    from apps.medical.models import MedicalRecord

    weight = (MedicalRecord.objects.filter(horse=horse, record_status="Signed", weight_kg__isnull=False)
              .order_by("-exam_date", "-id").values_list("weight_kg", flat=True).first())
    body["LatestWeightKg"] = float(weight) if weight is not None else None
    plan = active_training_plan(horse)
    if plan is not None:
        from apps.training.models import TrainingSession

        stage = plan.stages.filter(start_date__lte=today).filter(
            _open_on(today)).order_by("-start_date").first()
        body["ActiveTrainingPlan"] = {"TrainingPlanID": plan.id, "Goal": plan.goal, "StartDate": plan.start_date,
                                      "EndDate": plan.end_date, "OverallIntensity": plan.overall_intensity}
        if stage is not None:
            body["CurrentStage"] = {"TrainingPlanStageID": stage.id, "StageName": stage.stage_name,
                                    "Intensity": stage.intensity, "TrainingLoad": _float(stage.training_load),
                                    "DistanceTargetKm": _float(stage.distance_target_km), "EndDate": stage.end_date}
            if stage.intensity in ("High", "Very High"):
                body["Notes"].append("Giai đoạn cường độ cao: cân nhắc tăng năng lượng và bổ sung điện giải.")
        sessions = TrainingSession.objects.filter(stage__plan__assignment__horse=horse)
        done = sessions.filter(status="Completed", session_date__gte=today - timedelta(days=14),
                               session_date__lte=today)
        agg = done.aggregate(n=Count("id"), dist=Sum("result__actual_distance_km"), load=Avg("training_load"),
                             score=Avg("result__performance_score"), rec=Avg("result__recovery_minutes"))
        body["Last14Days"] = {
            "CompletedSessions": agg["n"], "TotalDistanceKm": float(agg["dist"] or 0),
            "AvgTrainingLoad": round(float(agg["load"]), 1) if agg["load"] is not None else None,
            "AvgPerformanceScore": round(float(agg["score"]), 1) if agg["score"] is not None else None,
            "AvgRecoveryMinutes": round(float(agg["rec"]), 1) if agg["rec"] is not None else None}
        upcoming = sessions.filter(status="Assigned", session_date__gt=today, session_date__lte=today + timedelta(days=7))
        up = upcoming.aggregate(n=Count("id"), load=Avg("training_load"))
        body["Next7Days"] = {"PlannedSessions": up["n"],
                             "AvgTrainingLoad": round(float(up["load"]), 1) if up["load"] is not None else None}
        if agg["rec"] is not None and agg["rec"] > 20:
            body["Notes"].append("Thời gian hồi phục dài (> 20 phút): xem lại năng lượng và nước uống.")
    if flows.has_flow3():
        from apps.medical.models import TrainingLock

        lock = TrainingLock.objects.filter(horse=horse, lock_status="Active").first()
        if lock is not None:
            body["TrainingLock"] = {"TrainingLockID": lock.id, "LockLevel": lock.lock_level, "Reason": lock.reason,
                                    "MaxIntensity": _float(lock.max_intensity)}
            body["Notes"].append("Ngựa đang bị khóa tập: giảm năng lượng, ưu tiên chất xơ, theo chỉ định của bác sĩ thú y.")
    diet = current_diet_plan(horse, today)
    if diet is not None:
        body["CurrentDiet"] = {"DietPlanID": diet.id, "Status": diet.status, "StartDate": diet.start_date,
                               "EndDate": diet.end_date, "TrainingPlanID": diet.training_plan_id}
    if plan is not None and (diet is None or diet.training_plan_id != plan.id):
        body["Notes"].append("Khẩu phần hiện tại chưa lập theo giáo án đang chạy: nên lập khẩu phần mới."
                             if diet else "Ngựa đang tập nhưng chưa có khẩu phần: cần lập khẩu phần.")
    from .orders import RestrictionSerializer
    body["DietRestrictions"] = RestrictionSerializer(horse.diet_restrictions.filter(is_active=True).select_related("created_by"), many=True).data
    return body


def _float(value):
    return float(value) if value is not None else None


def _open_on(day):
    from django.db.models import Q

    return Q(end_date__isnull=True) | Q(end_date__gte=day)


@horse_serialized
def update_diet_plan(plan, user, values, meals=None):
    """Huấn luyện viên trưởng sửa khẩu phần đang chờ duyệt hoặc bị trả về -> gửi lại (Pending)."""
    if plan.status not in (D.PENDING, D.REJECTED):
        raise BusinessRuleError("Chỉ sửa được khẩu phần đang chờ duyệt hoặc bị trả về.", "INVALID_STATUS")
    if "TrainingPlanID" in values:
        plan.training_plan_id = _training_plan_for(plan.horse, values.pop("TrainingPlanID"))
    for attr, value in values.items():
        setattr(plan, attr, value)
    _check_plan_dates(plan.start_date, plan.end_date)
    plan.status = D.PENDING
    plan.save()
    if meals is not None:
        _replace_meals(plan, meals)
    log_action(user, "UPDATE_DIET_PLAN", plan)
    return plan


@horse_serialized
def approve_diet_plan(plan, user, note=None):
    if not user.has_role("HEAD_TRAINER") or not user.has_perm("DIET_MANAGE"):
        raise PermissionDenied("Chỉ Head Trainer chốt khẩu phần.")
    if plan.status != D.PENDING:
        raise BusinessRuleError("Khẩu phần không ở trạng thái chờ duyệt.", "INVALID_STATUS")
    if plan.start_date < club_today():
        raise ValidationError({"StartDate": ["Khẩu phần mới chỉ áp dụng từ hôm nay hoặc tương lai."]})
    validate_diet_restrictions(plan)
    # Khẩu phần đang áp dụng bị trùng thời gian: bắt đầu trước -> kết thúc vào hôm trước ngày khẩu phần mới;
    # bắt đầu cùng ngày hoặc sau -> Expired. Khẩu phần mới bắt đầu trong tương lai thì khẩu phần hiện tại vẫn dùng tới hôm đó.
    expired, shortened = [], []
    for old in plan.horse.diet_plans.filter(status__in=IN_FORCE).exclude(pk=plan.pk):
        overlaps = (old.end_date is None or old.end_date >= plan.start_date) and \
                   (plan.end_date is None or old.start_date <= plan.end_date)
        if not overlaps:
            continue
        if old.start_date < plan.start_date:
            old.end_date = plan.start_date - timedelta(days=1)
            old.save(update_fields=["end_date"])
            shortened.append(old.id)
        else:
            old.status = D.EXPIRED
            old.save(update_fields=["status"])
            expired.append(old.id)
    plan.status = D.APPROVED
    # ReviewedByVetID continues to identify the Vet who supplied advice, never the Head Trainer.
    plan.approved_at = club_now()
    plan.vet_note = note or plan.vet_note
    plan.save(update_fields=["status", "reviewed_by", "approved_at", "vet_note"])
    log_action(user, "APPROVE_DIET_PLAN", plan, {"ExpiredDietPlanIDs": expired, "ShortenedDietPlanIDs": shortened})
    from .automation import generate_range, MAX_DAYS_AHEAD
    transaction.on_commit(lambda: generate_range(plan.horse.club, club_today(), MAX_DAYS_AHEAD + 1, user), robust=True)
    return plan


@horse_serialized
def reject_diet_plan(plan, user, note):
    if plan.status != D.PENDING:
        raise BusinessRuleError("Khẩu phần không ở trạng thái chờ duyệt.", "INVALID_STATUS")
    if not note:
        raise ValidationError({"VetNote": ["Cần ghi lý do trả về."]})
    plan.status = D.REJECTED
    plan.reviewed_by = user
    plan.vet_note = note
    plan.save(update_fields=["status", "reviewed_by", "vet_note"])
    log_action(user, "REJECT_DIET_PLAN", plan, {"VetNote": note})
    return plan


@horse_serialized
def adjust_diet_plan(plan, user, note, values=None, meals=None):
    """bác sĩ thú y điều chỉnh khẩu phần đang áp dụng (vd ngựa dị ứng, đang điều trị)."""
    if plan.status not in IN_FORCE:
        raise BusinessRuleError("Chỉ điều chỉnh khẩu phần đang áp dụng.", "INVALID_STATUS")
    if not note:
        raise ValidationError({"VetNote": ["Cần ghi lý do điều chỉnh."]})
    if values or meals is not None:
        raise ValidationError({"Meals": ["Vet ghi góp ý/hạn chế y tế; Head Trainer tạo và chốt khẩu phần thay thế."]})
    plan.reviewed_by = user
    plan.vet_note = note
    plan.save()
    log_action(user, "ADJUST_DIET_PLAN", plan, {"VetNote": note})
    return plan


# ---------------------------------------------------------------------------
# Việc chăm sóc
# ---------------------------------------------------------------------------
def is_care_assigner(user) -> bool:
    return user_has_any(user, *CARE_ASSIGNERS, "MEDICAL_MANAGE", "TRAINING_PLAN_MANAGE")


@horse_serialized
def create_care_task(horse, user, values, groom_id=None):
    """Huấn luyện viên trưởng / Quản lý câu lạc bộ giao việc ngoài chỉ tiêu. người chăm sóc ngựa không tự tạo việc (việc hằng ngày do hệ thống sinh)."""
    if not is_care_assigner(user):
        raise PermissionDenied("người chăm sóc ngựa không tự tạo việc: việc hằng ngày do hệ thống sinh theo chỉ tiêu, "
                               "việc khác do Huấn luyện viên trưởng / Quản lý câu lạc bộ giao.")
    _ensure_horse(horse)
    from apps.core.access import operational_horse
    operational_horse(user, horse.pk)
    link = HorseGroom.objects.filter(horse=horse, groom__status="Active").select_related("groom").first()
    groom = link.groom if link else None
    task_type = values.get("task_type")
    record = values.get("medical_record")
    lock = values.get("training_lock")
    if user.has_role("TRAINER") and task_type != "Training Support":
        raise PermissionDenied("Trainer chỉ giao việc hỗ trợ tập luyện.")
    if task_type in ("Medical Care", "Ice Leg Soak") and not user.has_perm("MEDICAL_MANAGE"):
        raise PermissionDenied("Việc y tế cần chỉ định của Vet.")
    if task_type in ("Medical Care", "Ice Leg Soak"):
        from apps.medical.services import active_lock
        current = active_lock(horse)
        if current and not record:
            raise ValidationError({"MedicalRecordID": ["Chăm sóc y tế trong đợt khóa cần liên kết phiếu chỉ định của Vet."]})
        if current and not lock:
            values["training_lock"] = lock = current
    if record and (record.horse_id != horse.pk or record.vet_id != user.pk):
        raise ValidationError({"MedicalRecordID": ["Chọn phiếu khám của bạn cho ngựa này."]})
    if lock and (lock.horse_id != horse.pk or lock.lock_status != "Active" or not record):
        raise ValidationError({"TrainingLockID": ["Cần đợt khóa đang hoạt động và phiếu chỉ định cùng ngựa."]})
    if not (values.get("note") or "").strip():
        raise ValidationError({"Note": ["Cần ghi hướng dẫn thực hiện cho Groom."]})
    task = CareTask.objects.create(horse=horse, groom=groom, assigned_by=user, status=CareTask.Status.PENDING,
                                   **values)
    log_action(user, "CREATE_CARE_TASK", task, {"HorseID": horse.pk, "GroomID": groom.pk if groom else None})
    return task


def _ensure_task_manager(task, user):
    allowed = task.assigned_by_id == user.pk or user_has_any(user, *CARE_ASSIGNERS)
    if not allowed:
        raise BusinessRuleError("Bạn không được sửa việc chăm sóc này.", "NOT_TASK_OWNER")


@horse_serialized
def update_care_task(task, user, values, groom_id=None):
    if task.status != CareTask.Status.PENDING:
        raise BusinessRuleError("Chỉ sửa được việc chưa làm (Pending).", "INVALID_STATUS")
    _ensure_task_manager(task, user)
    if groom_id is not None or any(k in values for k in ("medical_record", "training_lock", "task_type")):
        raise ValidationError("Thay người chăm qua phân công ngựa; chỉ định y tế cần tạo việc mới để giữ lịch sử.")
    for attr, value in values.items():
        setattr(task, attr, value)
    task.save()
    log_action(user, "UPDATE_CARE_TASK", task)
    return task


@horse_serialized
def complete_care_task(task, user, note=None, feeding_outcome=None):
    if task.groom_id != user.pk:
        raise BusinessRuleError("Chỉ người chăm sóc ngựa được giao mới xác nhận hoàn thành.", "NOT_TASK_GROOM")
    if task.status != CareTask.Status.PENDING:
        raise BusinessRuleError("Việc này đã xử lý.", "INVALID_STATUS")
    if task.task_type == "Feeding" and feeding_outcome not in ("All", "Partial", "Refused"):
        raise ValidationError({"FeedingOutcome": ["Chọn ăn hết, ăn một phần hoặc bỏ ăn."]})
    if task.diet_meal_id and diet_violations(task.diet_meal.diet_plan, club_today()):
        raise ValidationError({"FeedingOutcome": ["Khẩu phần cũ vi phạm hạn chế y tế hiện tại. Liên hệ Head Trainer trước khi cho ăn."]})
    task.feeding_outcome = feeding_outcome if task.task_type == "Feeding" else None
    task.completed_by = user
    task.status = CareTask.Status.COMPLETED
    task.completed_at = club_now()
    task.outcome_note = (note or "").strip() or None
    task.save(update_fields=["status", "completed_at", "outcome_note", "feeding_outcome", "completed_by"])
    log_action(user, "COMPLETE_CARE_TASK", task, {"Note": task.outcome_note, "FeedingOutcome": task.feeding_outcome})
    if task.task_type == "Feeding":
        feeding_alert(task)
    return task


@horse_serialized
def skip_care_task(task, user, reason):
    if task.groom_id != user.pk:
        _ensure_task_manager(task, user)
    if task.status != CareTask.Status.PENDING:
        raise BusinessRuleError("Việc này đã xử lý.", "INVALID_STATUS")
    if not reason:
        raise ValidationError({"Reason": ["Cần ghi lý do bỏ qua."]})
    task.status = CareTask.Status.SKIPPED
    task.outcome_note = reason
    task.save(update_fields=["status", "outcome_note"])
    log_action(user, "SKIP_CARE_TASK", task, {"Reason": reason})
    return task


# ---------------------------------------------------------------------------
# Kho vật tư
# ---------------------------------------------------------------------------
@transaction.atomic
def save_item(user, values, item=None, club_id=None):
    if item is not None:
        item = InventoryItem.objects.select_for_update().get(pk=item.pk, club_id=user.club_id)
    item = item or InventoryItem(club_id=club_id, quantity=Decimal("0"))
    reactivate = values.pop("reactivate", False)
    for attr, value in values.items():
        setattr(item, attr, value)
    if item.minimum_quantity is not None and item.minimum_quantity < 0:
        raise ValidationError({"MinimumQuantity": ["Không được âm."]})
    if item.quantity < 0:
        raise ValidationError({"Quantity": ["Không được âm."]})
    if reactivate and item.status == InventoryItem.Status.INACTIVE:
        item.status = InventoryItem.Status.AVAILABLE
    item.refresh_status()
    created = item.pk is None
    item.save()
    log_action(user, "CREATE_INVENTORY_ITEM" if created else "UPDATE_INVENTORY_ITEM", item)
    return item


@transaction.atomic
def adjust_stock(item, user, change, note=None):
    """Nhập kho (change > 0) hoặc điều chỉnh giảm (change < 0, vd hư hỏng). Lịch sử ghi ở AuditLog."""
    item = InventoryItem.objects.select_for_update().get(pk=item.pk, club_id=user.club_id)
    new_quantity = item.quantity + change
    if new_quantity < 0:
        raise BusinessRuleError(f"Tồn kho chỉ còn {item.quantity} {item.unit}.", "INSUFFICIENT_STOCK")
    item.quantity = new_quantity
    item.refresh_status()
    item.save(update_fields=["quantity", "status"])
    log_action(user, "ADJUST_STOCK", item, {"Change": change, "Quantity": item.quantity, "Note": note})
    return item


@transaction.atomic
def create_inventory_request(user, reason, items):
    if not items:
        raise ValidationError({"Items": ["Cần ít nhất một vật tư."]})
    seen = set()
    rows = []
    for entry in items:
        item = InventoryItem.objects.filter(pk=entry["InventoryItemID"], club_id=user.club_id).first()
        if item is None or item.status == InventoryItem.Status.INACTIVE:
            raise ValidationError({"Items": [f"Vật tư #{entry['InventoryItemID']} không tồn tại hoặc đã ngưng dùng."]})
        if item.pk in seen:
            raise ValidationError({"Items": ["Một vật tư chỉ được ghi một lần trong yêu cầu."]})
        seen.add(item.pk)
        rows.append((item, entry))
    request = InventoryRequest.objects.create(club_id=user.club_id, requested_by=user, request_date=club_now(),
                                              status=InventoryRequest.Status.PENDING, reason=reason or None)
    for item, entry in rows:
        InventoryRequestItem.objects.create(request=request, item=item,
                                            requested_quantity=entry["RequestedQuantity"],
                                            note=entry.get("Note") or None)
    log_action(user, "CREATE_INVENTORY_REQUEST", request, {"ItemCount": len(rows)})
    return request


def _ensure_pending(request):
    if request.status != InventoryRequest.Status.PENDING:
        raise BusinessRuleError("Yêu cầu này đã được xử lý.", "INVALID_STATUS")


@transaction.atomic
def approve_inventory_request(request, user, approved=None, note=None):
    """
    Manager duyệt và xuất kho. approved: {InventoryItemID: ApprovedQuantity}; bỏ trống = duyệt đủ số yêu cầu.
    ApprovedQuantity = 0 nghĩa là không cấp vật tư đó.
    """
    request = InventoryRequest.objects.select_for_update().get(pk=request.pk, club_id=user.club_id)
    _ensure_pending(request)
    approved = approved or {}
    lines = list(request.items.select_related("item").order_by("item_id"))
    unknown = set(approved) - {line.item_id for line in lines}
    if unknown:
        raise ValidationError({"Items": [f"Vật tư #{', #'.join(map(str, unknown))} không có trong yêu cầu."]})
    for line in lines:
        quantity = approved.get(line.item_id, line.requested_quantity)
        if quantity < 0 or quantity > line.requested_quantity:
            raise ValidationError({"Items": [f"Số lượng duyệt của '{line.item.item_name}' phải từ 0 đến "
                                             f"{line.requested_quantity}."]})
        item = InventoryItem.objects.select_for_update().get(pk=line.item_id, club_id=user.club_id)
        if item.status == "Inactive":
            raise BusinessRuleError("Vật tư đã ngừng sử dụng.", "ITEM_INACTIVE")
        if quantity > item.quantity:
            raise BusinessRuleError(f"Không đủ '{item.item_name}' trong kho (còn {item.quantity} {item.unit}).",
                                    "INSUFFICIENT_STOCK")
        line.approved_quantity = quantity
    for line in lines:
        line.save(update_fields=["approved_quantity"])
        item = InventoryItem.objects.get(pk=line.item_id)
        changed = InventoryItem.objects.filter(pk=item.pk, quantity__gte=line.approved_quantity).update(
            quantity=F("quantity") - line.approved_quantity)
        if not changed:
            raise BusinessRuleError("Tồn kho đã thay đổi; hãy tải lại.", "INSUFFICIENT_STOCK")
        item.refresh_from_db()
        item.refresh_status()
        item.save(update_fields=["quantity", "status"])
    request.status = InventoryRequest.Status.APPROVED
    request.approved_by = user
    request.approved_at = club_now()
    request.save(update_fields=["status", "approved_by", "approved_at"])
    log_action(user, "APPROVE_INVENTORY_REQUEST", request,
               {"Items": {str(line.item_id): str(line.approved_quantity) for line in lines}, "Note": note})
    return request


@transaction.atomic
def reject_inventory_request(request, user, note):
    request = InventoryRequest.objects.select_for_update().get(pk=request.pk, club_id=user.club_id)
    _ensure_pending(request)
    if not note:
        raise ValidationError({"Note": ["Cần ghi lý do từ chối."]})
    request.status = InventoryRequest.Status.REJECTED
    request.approved_by = user          # người xử lý
    request.approved_at = club_now()
    request.save(update_fields=["status", "approved_by", "approved_at"])
    log_action(user, "REJECT_INVENTORY_REQUEST", request, {"Note": note})
    return request


@transaction.atomic
def cancel_inventory_request(request, user):
    request = InventoryRequest.objects.select_for_update().get(pk=request.pk, club_id=user.club_id)
    _ensure_pending(request)
    if request.requested_by_id != user.pk:
        raise BusinessRuleError("Chỉ người gửi mới hủy được yêu cầu.", "NOT_REQUESTER")
    request.status = InventoryRequest.Status.CANCELLED
    request.save(update_fields=["status"])
    log_action(user, "CANCEL_INVENTORY_REQUEST", request)
    return request


def diet_violations(plan, on_day=None):
    from django.db.models import Q
    restrictions = VetDietRestriction.objects.filter(horse=plan.horse, is_active=True)
    if on_day:
        restrictions = restrictions.filter(start_date__lte=on_day).filter(Q(end_date__isnull=True) | Q(end_date__gte=on_day))
    else:
        restrictions = restrictions.filter(Q(end_date__isnull=True) | Q(end_date__gte=plan.start_date))
        if plan.end_date:
            restrictions = restrictions.filter(start_date__lte=plan.end_date)
    errors = []
    for r in restrictions:
        if not r.feed_type:
            continue  # Narrative advice is shown to the Head Trainer; no guessed food rules.
        meals = [m for m in plan.meals.all() if m.feed_type.strip().casefold() == r.feed_type.strip().casefold()]
        if r.max_daily_quantity is None and meals:
            errors.append(f"Không dùng {r.feed_type}: {r.instructions}")
        elif meals and (any(m.unit.strip().casefold() != r.unit.strip().casefold() for m in meals) or
                       sum(m.quantity for m in meals) > r.max_daily_quantity):
            errors.append(f"{r.feed_type}: tối đa {r.max_daily_quantity} {r.unit}/ngày. {r.instructions}")
    return errors


def validate_diet_restrictions(plan):
    errors = diet_violations(plan)
    if errors:
        raise ValidationError({"Meals": errors})


def feeding_alert(task):
    from django.conf import settings
    from apps.core.permissions import club_users_with_role
    from apps.core.workflow import clinical_recipients, notify
    limit = max(2, settings.CARE_REFUSAL_THRESHOLD)
    history = CareTask.objects.filter(horse=task.horse, task_type="Feeding", scheduled_at__lte=task.scheduled_at).order_by("-scheduled_at", "-id")
    refused = []
    for row in history:
        if row.status != "Completed" or row.feeding_outcome != "Refused":
            break
        refused.append(row)
    if len(refused) >= limit:
        recipients = clinical_recipients(task.horse) + list(club_users_with_role(task.horse.club_id, "VETERINARIAN"))
        notify(recipients, task.horse, "FEEDING_ALERT", f"refusal:{task.horse_id}:{refused[-1].pk}",
               f"{task.horse.horse_name} bỏ ăn {len(refused)} bữa liên tiếp (ngưỡng {limit}). Cần kiểm tra sức khỏe.")
