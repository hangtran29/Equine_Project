"""
Luật nghiệp vụ Flow 4 - chăm sóc và dinh dưỡng.

Khẩu phần:  Head Trainer lập (Pending) ──Vet góp ý (comment)──> Head Trainer chốt (finalize) ──> Approved
            Ngựa đang bệnh / chấn thương / bị khóa tập: cần Vet duyệt (approve) hoặc trả về (reject, kèm VetNote);
            Vet điều chỉnh khẩu phần đang áp dụng (adjust) của ngựa đó.
            Khẩu phần mới có hiệu lực -> khẩu phần cũ trùng thời gian kết thúc hôm trước ngày khẩu phần mới (hoặc Expired).
Khẩu phần gắn với giáo án đang chạy (TrainingPlanID): Head Trainer xem ngữ cảnh tập (diet_context) trước khi lập.
Việc chăm sóc: hệ thống tự sinh theo chỉ tiêu (automation.py) cho Groom phụ trách ngựa (Manager xếp).
               Việc phát sinh: Vet giao việc y tế (mọi ngựa), Trainer giao việc tập luyện (ngựa mình phụ trách);
               người giao không chọn Groom - việc về tay Groom phụ trách ngựa.
               Groom hoàn thành (việc cho ăn ghi ăn hết / một phần / bỏ ăn) hoặc bỏ qua (kèm lý do).
Vật tư:     Groom / Vet / Head Trainer gửi yêu cầu (Pending) -> Manager duyệt (trừ kho) / từ chối; người gửi hủy được.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core import flows

from apps.core.audit import log_action
from apps.core.exceptions import BusinessRuleError
from apps.horses.models import Horse

from . import access
from .models import CareTask, DietMeal, DietPlan, InventoryItem, InventoryRequest, InventoryRequestItem

D = DietPlan.Status
IN_FORCE = (D.APPROVED, D.ADJUSTED)
SICK_STATUSES = ("Injured", "Recovering", "Isolated")


def _ensure_horse(horse):
    if horse.registration_status != Horse.RegistrationStatus.APPROVED:
        raise BusinessRuleError("Chỉ áp dụng cho ngựa đang ở CLB (Approved).", "HORSE_NOT_APPROVED")


# ---------------------------------------------------------------------------
# Khẩu phần
# ---------------------------------------------------------------------------
def current_diet_plan(horse, on_day=None):
    on_day = on_day or date.today()
    from django.db.models import Q

    return (horse.diet_plans.filter(status__in=IN_FORCE, start_date__lte=on_day)
            .filter(Q(end_date__isnull=True) | Q(end_date__gte=on_day)).order_by("-start_date", "-id").first())


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
        raise ValidationError({"TrainingPlanID": ["Chưa có Flow 2 (huấn luyện)."]})
    from apps.training.models import TrainingPlan

    if not TrainingPlan.objects.filter(pk=training_plan_id, assignment__horse=horse, status="Active").exists():
        raise ValidationError({"TrainingPlanID": ["Cần chọn giáo án đang chạy (Active) của chính ngựa này."]})
    return training_plan_id


def create_diet_plan(horse, user, values, meals):
    _ensure_horse(horse)
    _check_plan_dates(values["start_date"], values.get("end_date"))
    values["training_plan_id"] = _training_plan_for(horse, values.pop("TrainingPlanID", None))
    plan = DietPlan.objects.create(horse=horse, created_by=user, status=D.PENDING, created_at=timezone.now(),
                                   **values)
    _replace_meals(plan, meals)
    log_action(user, "CREATE_DIET_PLAN", plan, {"HorseID": horse.pk, "TrainingPlanID": plan.training_plan_id})
    return plan


def diet_context(horse, today=None):
    """Thông tin để Head Trainer lập khẩu phần theo giáo án / kết quả tập (GET /api/horses/<id>/diet-context)."""
    from django.db.models import Avg, Count, Sum

    today = today or date.today()
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
            body["Notes"].append("Ngựa đang bị khóa tập: giảm năng lượng, ưu tiên chất xơ, theo chỉ định của Vet.")
    diet = current_diet_plan(horse, today)
    if diet is not None:
        body["CurrentDiet"] = {"DietPlanID": diet.id, "Status": diet.status, "StartDate": diet.start_date,
                               "EndDate": diet.end_date, "TrainingPlanID": diet.training_plan_id}
    if plan is not None and (diet is None or diet.training_plan_id != plan.id):
        body["Notes"].append("Khẩu phần hiện tại chưa lập theo giáo án đang chạy: nên lập khẩu phần mới."
                             if diet else "Ngựa đang tập nhưng chưa có khẩu phần: cần lập khẩu phần.")
    return body


def _float(value):
    return float(value) if value is not None else None


def _open_on(day):
    from django.db.models import Q

    return Q(end_date__isnull=True) | Q(end_date__gte=day)


def update_diet_plan(plan, user, values, meals=None):
    """Head Trainer sửa khẩu phần đang chờ duyệt hoặc bị trả về -> gửi lại (Pending)."""
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


def needs_vet_approval(horse):
    """Ngựa đang bệnh / chấn thương / cách ly hoặc đang bị khóa tập: khẩu phần phải được Vet duyệt."""
    if horse.current_health_status in SICK_STATUSES:
        return True
    if flows.has_flow3():
        from apps.medical.models import TrainingLock

        return TrainingLock.objects.filter(horse=horse, lock_status="Active").exists()
    return False


def _ensure_diet_pending(plan):
    if plan.status != D.PENDING:
        raise BusinessRuleError("Khẩu phần không ở trạng thái chờ chốt / chờ duyệt.", "INVALID_STATUS")


def _activate(plan, user, action, details=None):
    """
    Khẩu phần có hiệu lực. Khẩu phần đang áp dụng bị trùng thời gian: bắt đầu trước -> kết thúc vào hôm trước ngày
    khẩu phần mới; bắt đầu cùng ngày hoặc sau -> Expired. Khẩu phần mới bắt đầu trong tương lai thì khẩu phần hiện
    tại vẫn dùng tới hôm đó.
    """
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
    plan.approved_at = timezone.now()
    plan.save(update_fields=["status", "reviewed_by", "approved_at", "vet_note"])
    log_action(user, action, plan, {"ExpiredDietPlanIDs": expired, "ShortenedDietPlanIDs": shortened,
                                    **(details or {})})
    return plan


def comment_diet_plan(plan, user, note):
    """Vet góp ý khẩu phần (vai trò tư vấn dinh dưỡng). Khẩu phần vẫn chờ Head Trainer chốt."""
    _ensure_diet_pending(plan)
    if not (note or "").strip():
        raise ValidationError({"VetNote": ["Cần ghi nội dung góp ý."]})
    plan.reviewed_by = user
    plan.vet_note = note.strip()
    plan.save(update_fields=["reviewed_by", "vet_note"])
    log_action(user, "COMMENT_DIET_PLAN", plan, {"VetNote": plan.vet_note})
    return plan


def finalize_diet_plan(plan, user):
    """Head Trainer chốt khẩu phần sau khi Vet góp ý. Ngựa đang bệnh / bị khóa tập thì Vet phải duyệt."""
    _ensure_diet_pending(plan)
    if needs_vet_approval(plan.horse):
        raise BusinessRuleError("Ngựa đang bệnh hoặc bị khóa tập: khẩu phần cần bác sĩ thú y duyệt.",
                                "VET_APPROVAL_REQUIRED")
    if plan.reviewed_by_id is None:
        raise BusinessRuleError("Gửi bác sĩ thú y góp ý trước khi chốt khẩu phần.", "VET_COMMENT_REQUIRED")
    return _activate(plan, user, "FINALIZE_DIET_PLAN")


def _ensure_vet_case(plan):
    if not needs_vet_approval(plan.horse):
        raise BusinessRuleError("Ngựa không bệnh / không bị khóa tập: bác sĩ góp ý, huấn luyện viên trưởng chốt.",
                                "VET_APPROVAL_NOT_NEEDED")


def approve_diet_plan(plan, user, note=None):
    """Vet duyệt khẩu phần của ngựa đang bệnh / bị khóa tập."""
    _ensure_diet_pending(plan)
    _ensure_vet_case(plan)
    if plan.created_by_id == user.pk:
        raise BusinessRuleError("Người lập khẩu phần không tự duyệt.", "SELF_APPROVAL")
    plan.reviewed_by = user
    plan.vet_note = note or plan.vet_note
    return _activate(plan, user, "APPROVE_DIET_PLAN")


def reject_diet_plan(plan, user, note):
    """Vet trả về khẩu phần của ngựa đang bệnh / bị khóa tập (Head Trainer sửa rồi gửi lại)."""
    _ensure_diet_pending(plan)
    _ensure_vet_case(plan)
    if not note:
        raise ValidationError({"VetNote": ["Cần ghi lý do trả về."]})
    plan.status = D.REJECTED
    plan.reviewed_by = user
    plan.vet_note = note
    plan.save(update_fields=["status", "reviewed_by", "vet_note"])
    log_action(user, "REJECT_DIET_PLAN", plan, {"VetNote": note})
    return plan


def adjust_diet_plan(plan, user, note, values=None, meals=None):
    """Vet điều chỉnh khẩu phần đang áp dụng của ngựa đang bệnh / chấn thương / bị khóa tập."""
    if plan.status not in IN_FORCE:
        raise BusinessRuleError("Chỉ điều chỉnh khẩu phần đang áp dụng.", "INVALID_STATUS")
    _ensure_vet_case(plan)
    if not note:
        raise ValidationError({"VetNote": ["Cần ghi lý do điều chỉnh."]})
    for attr, value in (values or {}).items():
        setattr(plan, attr, value)
    _check_plan_dates(plan.start_date, plan.end_date)
    plan.status = D.ADJUSTED
    plan.reviewed_by = user
    plan.vet_note = note
    plan.save()
    if meals is not None:
        _replace_meals(plan, meals)
    log_action(user, "ADJUST_DIET_PLAN", plan, {"VetNote": note})
    return plan


# ---------------------------------------------------------------------------
# Việc chăm sóc
# ---------------------------------------------------------------------------
def create_care_task(horse, user, values):
    """
    Việc phát sinh ngoài chỉ tiêu: Vet giao việc y tế (mọi ngựa), Trainer giao việc tập luyện (ngựa mình phụ trách).
    Người giao không chọn Groom: việc về tay Groom phụ trách ngựa (chưa có thì Groom ít việc nhất ngày đó).
    """
    _ensure_horse(horse)
    types = access.allowed_task_types(user, horse)
    if not types:
        raise PermissionDenied("Chỉ bác sĩ thú y (việc y tế) hoặc trainer phụ trách ngựa (việc tập luyện) giao thêm "
                               "việc; việc hằng ngày do hệ thống tự tạo.")
    if values.get("task_type") not in types:
        raise ValidationError({"TaskType": [f"Bạn chỉ giao được: {', '.join(sorted(types))}."]})
    from .automation import GroomPicker

    groom = GroomPicker(horse.club, values["scheduled_at"].date()).pick(horse)
    if groom is None:
        raise BusinessRuleError("CLB chưa có Groom nào đang hoạt động để nhận việc.", "NO_GROOM")
    task = CareTask.objects.create(horse=horse, groom=groom, assigned_by=user, status=CareTask.Status.PENDING,
                                   **values)
    log_action(user, "CREATE_CARE_TASK", task, {"HorseID": horse.pk, "GroomID": groom.pk,
                                                "TaskType": task.task_type})
    return task


def _ensure_task_manager(task, user):
    if task.assigned_by_id != user.pk:
        raise BusinessRuleError("Chỉ người giao việc này mới sửa / bỏ được.", "NOT_TASK_OWNER")


def update_care_task(task, user, values):
    if task.status != CareTask.Status.PENDING:
        raise BusinessRuleError("Chỉ sửa được việc chưa làm (Pending).", "INVALID_STATUS")
    _ensure_task_manager(task, user)
    if "task_type" in values and values["task_type"] not in access.allowed_task_types(user, task.horse):
        raise ValidationError({"TaskType": ["Bạn không giao được loại việc này."]})
    for attr, value in values.items():
        setattr(task, attr, value)
    task.save()
    log_action(user, "UPDATE_CARE_TASK", task)
    return task


def _append_note(task, text):
    if text:
        task.note = ((task.note or "") + ("\n" if task.note else "") + text)[:1000]


def complete_care_task(task, user, note=None, intake=None):
    """Groom xác nhận đã làm; việc cho ăn ghi ngựa ăn hết (Full) / một phần (Partial) / bỏ ăn (Refused)."""
    if task.groom_id != user.pk:
        raise BusinessRuleError("Chỉ Groom được giao mới xác nhận hoàn thành.", "NOT_TASK_GROOM")
    if task.status != CareTask.Status.PENDING:
        raise BusinessRuleError("Việc này đã xử lý.", "INVALID_STATUS")
    if intake and task.task_type != CareTask.TaskType.FEEDING:
        raise ValidationError({"IntakeStatus": ["Chỉ ghi mức ăn cho việc cho ăn (Feeding)."]})
    task.status = CareTask.Status.COMPLETED
    task.completed_at = timezone.now()
    task.intake_status = intake or None
    _append_note(task, note)
    task.save(update_fields=["status", "completed_at", "note", "intake_status"])
    log_action(user, "COMPLETE_CARE_TASK", task, {"IntakeStatus": intake} if intake else None)
    return task


def skip_care_task(task, user, reason):
    if task.groom_id != user.pk:
        _ensure_task_manager(task, user)
    if task.status != CareTask.Status.PENDING:
        raise BusinessRuleError("Việc này đã xử lý.", "INVALID_STATUS")
    if not reason:
        raise ValidationError({"Reason": ["Cần ghi lý do bỏ qua."]})
    task.status = CareTask.Status.SKIPPED
    _append_note(task, f"[Bỏ qua] {reason}")
    task.save(update_fields=["status", "note"])
    log_action(user, "SKIP_CARE_TASK", task, {"Reason": reason})
    return task


# ---------------------------------------------------------------------------
# Kho vật tư
# ---------------------------------------------------------------------------
def save_item(user, values, item=None, club_id=None):
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


def adjust_stock(item, user, change, note=None):
    """Nhập kho (change > 0) hoặc điều chỉnh giảm (change < 0, vd hư hỏng). Lịch sử ghi ở AuditLog."""
    new_quantity = item.quantity + change
    if new_quantity < 0:
        raise BusinessRuleError(f"Tồn kho chỉ còn {item.quantity} {item.unit}.", "INSUFFICIENT_STOCK")
    item.quantity = new_quantity
    item.refresh_status()
    item.save(update_fields=["quantity", "status"])
    log_action(user, "ADJUST_STOCK", item, {"Change": change, "Quantity": item.quantity, "Note": note})
    return item


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
    request = InventoryRequest.objects.create(club_id=user.club_id, requested_by=user, request_date=timezone.now(),
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


def approve_inventory_request(request, user, approved=None):
    """
    Manager duyệt và xuất kho. approved: {InventoryItemID: ApprovedQuantity}; bỏ trống = duyệt đủ số yêu cầu.
    ApprovedQuantity = 0 nghĩa là không cấp vật tư đó.
    """
    _ensure_pending(request)
    approved = approved or {}
    lines = list(request.items.select_related("item"))
    unknown = set(approved) - {line.item_id for line in lines}
    if unknown:
        raise ValidationError({"Items": [f"Vật tư #{', #'.join(map(str, unknown))} không có trong yêu cầu."]})
    for line in lines:
        quantity = approved.get(line.item_id, line.requested_quantity)
        if quantity < 0 or quantity > line.requested_quantity:
            raise ValidationError({"Items": [f"Số lượng duyệt của '{line.item.item_name}' phải từ 0 đến "
                                             f"{line.requested_quantity}."]})
        item = InventoryItem.objects.get(pk=line.item_id)
        if quantity > item.quantity:
            raise BusinessRuleError(f"Không đủ '{item.item_name}' trong kho (còn {item.quantity} {item.unit}).",
                                    "INSUFFICIENT_STOCK")
        line.approved_quantity = quantity
    for line in lines:
        line.save(update_fields=["approved_quantity"])
        item = InventoryItem.objects.get(pk=line.item_id)
        item.quantity -= line.approved_quantity
        item.refresh_status()
        item.save(update_fields=["quantity", "status"])
    request.status = InventoryRequest.Status.APPROVED
    request.approved_by = user
    request.approved_at = timezone.now()
    request.save(update_fields=["status", "approved_by", "approved_at"])
    log_action(user, "APPROVE_INVENTORY_REQUEST", request,
               {str(line.item_id): str(line.approved_quantity) for line in lines})
    return request


def reject_inventory_request(request, user, note):
    _ensure_pending(request)
    if not note:
        raise ValidationError({"Note": ["Cần ghi lý do từ chối."]})
    request.status = InventoryRequest.Status.REJECTED
    request.approved_by = user          # người xử lý
    request.approved_at = timezone.now()
    request.save(update_fields=["status", "approved_by", "approved_at"])
    log_action(user, "REJECT_INVENTORY_REQUEST", request, {"Note": note})
    return request


def cancel_inventory_request(request, user):
    _ensure_pending(request)
    if request.requested_by_id != user.pk:
        raise BusinessRuleError("Chỉ người gửi mới hủy được yêu cầu.", "NOT_REQUESTER")
    request.status = InventoryRequest.Status.CANCELLED
    request.save(update_fields=["status"])
    log_action(user, "CANCEL_INVENTORY_REQUEST", request)
    return request
