"""API Flow 4 - chăm sóc và dinh dưỡng. Chi tiết từng API: docs/API.md mục Flow 4."""
from apps.core.clubtime import now as club_now, today as club_today
from datetime import date, datetime, time

from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import BasePermission
from apps.core.access import care_horses, require_care_access

from apps.core.serializers import fmt_datetime
from apps.core.params import date_param, flag_param, int_param
from apps.core.permissions import HasAnyPermission, require_club_user
from apps.horses.views import get_visible_horse

from . import automation, services
from .models import CareTask, CareTaskRule, DietPlan, HorseGroom, InventoryItem, InventoryRequest
from .serializers import (
    CareTaskRuleSerializer, CareTaskSerializer, CareTaskWriteSerializer, DietPlanSerializer, DietPlanWriteSerializer,
    GenerateTasksSerializer, HorseGroomSerializer,
    InventoryApproveSerializer, InventoryItemSerializer, InventoryItemWriteSerializer, InventoryRequestCreateSerializer,
    InventoryRequestSerializer, NoteSerializer, ReasonSerializer, RejectSerializer, StockSerializer,
    VetDietDecisionSerializer,
)

STAFF_VIEW = "HORSE_VIEW"


class CareAccess(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        require_care_access(request.user)
        return request.user.has_perm(STAFF_VIEW)


def diet_scope(user, qs):
    qs = qs.filter(horse__in=care_horses(user))
    return qs.filter(status__in=services.IN_FORCE) if user.has_role("GROOM") else qs




def _meals(values):
    meals = values.pop("Meals", None)
    return [dict(m) for m in meals] if meals is not None else None


# ---------------------------------------------------------------------------
# Khẩu phần
# ---------------------------------------------------------------------------
def can_create_diet(user):
    """Huấn luyện viên trưởng lập khẩu phần (cột CreatedByHeadTrainerID)."""
    return user.has_perm("DIET_MANAGE") and user.has_role("HEAD_TRAINER")


def can_review_diet(user):
    """Vet góp ý và yêu cầu Head Trainer sửa khẩu phần."""
    return user.has_perm("DIET_MANAGE") and user.has_perm("MEDICAL_MANAGE")


class HorseDietPlanView(APIView):
    """
    GET  /api/horses/<HorseID>/diet-plans
    POST /api/horses/<HorseID>/diet-plans   Head Trainer lập khẩu phần (Pending, chờ Vet duyệt)
    """

    permission_classes = [CareAccess]

    def get(self, request, horse_id):
        horse = get_visible_horse(request.user, horse_id)
        plans = horse.diet_plans.select_related("created_by", "reviewed_by", "horse").prefetch_related("meals")
        return Response(DietPlanSerializer(diet_scope(request.user, plans), many=True).data)

    def post(self, request, horse_id):
        if not can_create_diet(request.user):
            raise PermissionDenied("Chỉ Huấn luyện viên trưởng lập khẩu phần.")
        horse = get_visible_horse(request.user, horse_id)
        data = DietPlanWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        plan = services.create_diet_plan(horse, request.user, values, _meals(values) or [])
        return Response(DietPlanSerializer(plan).data, status=status.HTTP_201_CREATED)


class DietContextView(APIView):
    """
    GET /api/horses/<HorseID>/diet-context - ngữ cảnh để lập khẩu phần theo giáo án / kết quả tập:
    giáo án đang chạy, giai đoạn hiện tại (cường độ, tải), kết quả 14 ngày qua, buổi tập 7 ngày tới,
    khóa tập (Flow 3), cân nặng gần nhất, khẩu phần hiện tại và gợi ý (Notes).
    """

    permission_classes = [CareAccess]

    def get(self, request, horse_id):
        if not request.user.has_perm("DIET_MANAGE"):
            raise PermissionDenied("Ngữ cảnh lập khẩu phần dành cho Head Trainer và Vet.")
        return Response(services.diet_context(get_visible_horse(request.user, horse_id)))


class CurrentDietView(APIView):
    """GET /api/horses/<HorseID>/current-diet - khẩu phần đang áp dụng hôm nay (null nếu chưa có)."""

    permission_classes = [CareAccess]

    def get(self, request, horse_id):
        plan = services.current_diet_plan(get_visible_horse(request.user, horse_id))
        return Response(DietPlanSerializer(plan).data if plan else None)


class DietPlanViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    GET   /api/diet-plans?Status=Pending&HorseID=     (Vet xem khẩu phần chờ duyệt)
    PATCH /api/diet-plans/<id>                        Head Trainer sửa / gửi lại
    POST  /api/diet-plans/<id>/approve|reject|adjust  Vet
    """

    serializer_class = DietPlanSerializer
    permission_classes = [CareAccess]

    def get_queryset(self):
        qs = diet_scope(self.request.user, DietPlan.objects.all()).select_related(
            "horse", "created_by", "reviewed_by").prefetch_related("meals")
        p = self.request.query_params
        if p.get("Status"):
            qs = qs.filter(status=p["Status"])
        if p.get("HorseID"):
            qs = qs.filter(horse_id=int_param(p, "HorseID"))
        return qs

    def _out(self, plan):
        return Response(DietPlanSerializer(self.get_queryset().get(pk=plan.pk)).data)

    def _decision(self, request):
        if not can_review_diet(request.user):
            raise PermissionDenied("Chỉ bác sĩ thú y duyệt / điều chỉnh khẩu phần.")
        data = VetDietDecisionSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        return dict(data.validated_data)

    def partial_update(self, request, pk=None):
        if not can_create_diet(request.user):
            raise PermissionDenied("Chỉ Huấn luyện viên trưởng sửa khẩu phần.")
        data = DietPlanWriteSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        meals = _meals(values)
        return self._out(services.update_diet_plan(self.get_object(), request.user, values, meals))

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        if not can_create_diet(request.user):
            raise PermissionDenied("Chỉ Head Trainer chốt khẩu phần; Vet góp ý và đặt hạn chế y tế.")
        return self._out(services.approve_diet_plan(self.get_object(), request.user))

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        values = self._decision(request)
        return self._out(services.reject_diet_plan(self.get_object(), request.user, values.get("VetNote")))

    @action(detail=True, methods=["post"])
    def adjust(self, request, pk=None):
        values = self._decision(request)
        note = values.pop("VetNote", None)
        meals = _meals(values)
        return self._out(services.adjust_diet_plan(self.get_object(), request.user, note, values, meals))


# ---------------------------------------------------------------------------
# Việc chăm sóc
# ---------------------------------------------------------------------------
class CareTaskViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    GET  /api/care-tasks?Date=&From=&To=&HorseID=&GroomID=&Status=&Auto=1&mine=1
         (mỗi lần xem, hệ thống sinh việc theo chỉ tiêu cho hôm nay / ngày được hỏi - xem automation.py)
    POST /api/care-tasks                     Head Trainer / Manager giao việc ngoài chỉ tiêu (Groom không tự tạo)
    POST /api/care-tasks/generate            Head Trainer / Manager sinh việc ngay {"Date"?, "Days"?}
    PATCH /api/care-tasks/<id>               sửa việc chưa làm
    POST /api/care-tasks/<id>/complete       Groom xác nhận đã làm   {"Note"?}
    POST /api/care-tasks/<id>/skip           bỏ qua                  {"Reason"}
    """

    serializer_class = CareTaskSerializer
    permission_classes = [CareAccess]

    def get_queryset(self):
        user = self.request.user
        qs = CareTask.objects.filter(horse__club_id=user.club_id).select_related(
            "horse", "groom", "assigned_by")
        if user.has_role("GROOM"):
            qs = qs.filter(groom=user)
        else:
            qs = qs.filter(horse__in=care_horses(user))
        p = self.request.query_params
        if p.get("Date"):
            day = date_param(p, "Date")
            qs = qs.filter(scheduled_at__gte=datetime.combine(day, time.min),
                           scheduled_at__lte=datetime.combine(day, time.max))
        if p.get("From"):
            qs = qs.filter(scheduled_at__gte=datetime.combine(date_param(p, "From"), time.min))
        if p.get("To"):
            qs = qs.filter(scheduled_at__lte=datetime.combine(date_param(p, "To"), time.max))
        if p.get("HorseID"):
            qs = qs.filter(horse_id=int_param(p, "HorseID"))
        if p.get("GroomID"):
            qs = qs.filter(groom_id=int_param(p, "GroomID"))
        if p.get("Status"):
            qs = qs.filter(status=p["Status"])
        if p.get("TaskType"):
            qs = qs.filter(task_type=p["TaskType"])
        if flag_param(p, "Unassigned"):
            qs = qs.filter(groom__isnull=True)
        if p.get("Auto") in ("1", "true"):
            qs = qs.filter(rule_code__isnull=False)
        if flag_param(p, "mine"):
            qs = qs.filter(groom=self.request.user)
        return qs

    def list(self, request, *args, **kwargs):
        club = request.user.club
        if club is not None:
            p = request.query_params
            day = date_param(p, "Date") if p.get("Date") else club_today()
            automation.generate_for_day(club, club_today())
            if day != club_today():
                automation.generate_for_day(club, day)
        return super().list(request, *args, **kwargs)

    @extend_schema(request=GenerateTasksSerializer)
    @action(detail=False, methods=["post"])
    def generate(self, request):
        if not (request.user.has_perm("TRAINER_ASSIGN") or request.user.has_perm("CLUB_MANAGE")):
            raise PermissionDenied("Chỉ Head Trainer / Manager sinh việc chăm sóc.")
        data = GenerateTasksSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        return Response(automation.generate_range(request.user.club, v.get("Date") or club_today(), v["Days"],
                                                  request.user))

    def _out(self, task, code=status.HTTP_200_OK):
        return Response(CareTaskSerializer(task).data, status=code)

    def _require_care_role(self):
        if not (self.request.user.has_perm("CARE_MANAGE") or services.is_care_assigner(self.request.user)):
            raise PermissionDenied("Bạn không có quyền quản lý việc chăm sóc.")

    def create(self, request):
        if not services.is_care_assigner(request.user):
            raise PermissionDenied("người chăm sóc ngựa không tự tạo việc: việc hằng ngày do hệ thống sinh theo chỉ tiêu, "
                                   "việc khác do Huấn luyện viên trưởng / Quản lý câu lạc bộ giao.")
        data = CareTaskWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        horse = get_visible_horse(request.user, values.pop("HorseID"))
        groom_id = values.pop("GroomID", None)
        return self._out(services.create_care_task(horse, request.user, values, groom_id), status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        self._require_care_role()
        data = CareTaskWriteSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        values.pop("HorseID", None)
        groom_id = values.pop("GroomID", None)
        return self._out(services.update_care_task(self.get_object(), request.user, values, groom_id))

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        data = NoteSerializer(data=request.data or {})
        data.is_valid(raise_exception=True)
        return self._out(services.complete_care_task(self.get_object(), request.user, data.validated_data.get("Note"),
                                                    data.validated_data.get("FeedingOutcome")))

    @action(detail=True, methods=["post"])
    def skip(self, request, pk=None):
        self._require_care_role()
        data = ReasonSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return self._out(services.skip_care_task(self.get_object(), request.user, data.validated_data["Reason"]))


class CareRuleListView(APIView):
    """GET /api/care-rules - chỉ tiêu sinh việc chăm sóc của câu lạc bộ (tạo mặc định nếu chưa có)."""

    permission_classes = [CareAccess]

    def get(self, request):
        rules = automation.ensure_rules(request.user.club)
        return Response(CareTaskRuleSerializer(sorted(rules.values(), key=lambda r: r.id), many=True).data)


class CareRuleDetailView(APIView):
    """PATCH /api/care-rules/<RuleCode> {"IsActive", "TimeOfDay", "OffsetMinutes", "Title"} - Head Trainer / Manager."""

    permission_classes = [CareAccess]

    @extend_schema(request=CareTaskRuleSerializer)
    def patch(self, request, rule_code):
        if not (request.user.has_perm("TRAINER_ASSIGN") or request.user.has_perm("CLUB_MANAGE")):
            raise PermissionDenied("Chỉ Head Trainer / Manager sửa chỉ tiêu chăm sóc.")
        if rule_code == "ICE_SOAK_WHEN_LOCKED":
            raise ValidationError({"RuleCode": ["Ngâm chân lạnh được quản lý bằng chỉ định chăm sóc riêng của Vet."]})
        rule = automation.ensure_rules(request.user.club).get(rule_code)
        if rule is None:
            raise ValidationError({"RuleCode": ["Chỉ tiêu không tồn tại."]})
        data = CareTaskRuleSerializer(rule, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        return Response(CareTaskRuleSerializer(automation.update_rule(rule, request.user, dict(data.validated_data))).data)


class HorseGroomView(APIView):
    """
    GET    /api/horses/<HorseID>/groom   Groom phụ trách ngựa (null nếu chưa có)
    PUT    /api/horses/<HorseID>/groom   {"GroomID"} Head Trainer / Manager giao; việc tự sinh chưa làm chuyển theo
    DELETE /api/horses/<HorseID>/groom   bỏ Groom phụ trách (việc mới chia cho Groom ít việc nhất)
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [HasAnyPermission(STAFF_VIEW, "OWNER_VIEW")()]
        return [CareAccess()]

    @staticmethod
    def _body(link):
        return {"HorseID": link.horse_id, "GroomID": link.groom_id, "GroomName": link.groom.full_name,
                "AssignedBy": link.assigned_by_id, "AssignedAt": link.assigned_at} if link else None

    def get(self, request, horse_id):
        horse = get_visible_horse(request.user, horse_id)
        return Response(self._body(HorseGroom.objects.filter(horse=horse).select_related("groom").first()))

    def _assigner(self, request, horse_id):
        if not request.user.has_perm("CLUB_MANAGE"):
            raise PermissionDenied("Chỉ Manager phân công Groom phụ trách ngựa.")
        return get_visible_horse(request.user, horse_id)

    @extend_schema(request=HorseGroomSerializer)
    def put(self, request, horse_id):
        horse = self._assigner(request, horse_id)
        data = HorseGroomSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        groom = require_club_user(data.validated_data["GroomID"], horse.club_id, "GROOM", field="GroomID")
        link, moved = automation.set_horse_groom(horse, groom, request.user)
        return Response({**self._body(link), "MovedTaskCount": moved})

    def delete(self, request, horse_id):
        automation.clear_horse_groom(self._assigner(request, horse_id), request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Kho vật tư
# ---------------------------------------------------------------------------
INVENTORY_ANY = ("INVENTORY_MANAGE", "INVENTORY_REQUEST")


class InventoryItemViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    GET   /api/inventory-items?ItemType=&Status=&LowStock=1
    POST  /api/inventory-items                 Manager thêm vật tư
    PATCH /api/inventory-items/<id>            Manager sửa / ngưng dùng
    POST  /api/inventory-items/<id>/stock      Manager nhập kho / điều chỉnh {"Change": 50, "Note"}
    """

    serializer_class = InventoryItemSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [CareAccess(), HasAnyPermission(*INVENTORY_ANY)()]
        return [CareAccess(), HasAnyPermission("INVENTORY_MANAGE")()]

    def get_queryset(self):
        qs = InventoryItem.objects.filter(club_id=self.request.user.club_id)
        p = self.request.query_params
        if p.get("ItemType"):
            qs = qs.filter(item_type=p["ItemType"])
        if p.get("Status"):
            qs = qs.filter(status=p["Status"])
        if flag_param(p, "LowStock"):
            qs = qs.filter(status__in=(InventoryItem.Status.LOW_STOCK, InventoryItem.Status.OUT_OF_STOCK))
        return qs

    def create(self, request):
        data = InventoryItemWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        item = services.save_item(request.user, dict(data.validated_data), club_id=request.user.club_id)
        return Response(InventoryItemSerializer(item).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        data = InventoryItemWriteSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        if "quantity" in values:
            raise ValidationError({"Quantity": ["Đổi tồn kho qua POST /inventory-items/<id>/stock."]})
        return Response(InventoryItemSerializer(services.save_item(request.user, values, self.get_object())).data)

    @action(detail=True, methods=["post"])
    def stock(self, request, pk=None):
        data = StockSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        item = services.adjust_stock(self.get_object(), request.user, v["Change"], v.get("Note"))
        return Response(InventoryItemSerializer(item).data)


class InventoryRequestViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    GET  /api/inventory-requests?Status=Pending&mine=1  (Manager: cả CLB; người gửi: của mình)
    POST /api/inventory-requests                        Groom / Head Trainer gửi yêu cầu
    POST /api/inventory-requests/<id>/approve           Manager duyệt + xuất kho  {"Items": [{"InventoryItemID", "ApprovedQuantity"}]}
    POST /api/inventory-requests/<id>/reject            Manager từ chối           {"Note"}
    POST /api/inventory-requests/<id>/cancel            người gửi hủy (khi còn Pending)
    """

    serializer_class = InventoryRequestSerializer

    action_permissions = {
        "create": ("INVENTORY_REQUEST",),
        "cancel": ("INVENTORY_REQUEST",),
        "approve": ("INVENTORY_MANAGE",),
        "reject": ("INVENTORY_MANAGE",),
    }

    def get_permissions(self):
        return [CareAccess(), HasAnyPermission(*self.action_permissions.get(self.action, INVENTORY_ANY))()]

    def get_queryset(self):
        user = self.request.user
        qs = InventoryRequest.objects.filter(club_id=user.club_id).select_related(
            "requested_by", "approved_by").prefetch_related("items__item")
        if not user.has_perm("INVENTORY_MANAGE") or flag_param(self.request.query_params, "mine"):
            qs = qs.filter(requested_by=user)
        if self.request.query_params.get("Status"):
            qs = qs.filter(status=self.request.query_params["Status"])
        return qs

    def _out(self, req, code=status.HTTP_200_OK):
        return Response(InventoryRequestSerializer(
            InventoryRequest.objects.prefetch_related("items__item").get(pk=req.pk)).data, status=code)

    def create(self, request):
        data = InventoryRequestCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        req = services.create_inventory_request(request.user, v.get("Reason"), [dict(i) for i in v["Items"]])
        return self._out(req, status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        data = InventoryApproveSerializer(data=request.data or {})
        data.is_valid(raise_exception=True)
        approved = {i["InventoryItemID"]: i["ApprovedQuantity"] for i in data.validated_data.get("Items", [])}
        return self._out(services.approve_inventory_request(self.get_object(), request.user, approved, data.validated_data["Note"]))

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        data = RejectSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return self._out(services.reject_inventory_request(self.get_object(), request.user,
                                                           data.validated_data["Note"]))

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        return self._out(services.cancel_inventory_request(self.get_object(), request.user))



class GroomTrainingTodayView(APIView):
    """
    GET /api/care/training-today?Date=YYYY-MM-DD - lịch tập trong ngày của các ngựa mình đang chăm sóc (CS01),
    để Người chăm sóc chuẩn bị ngựa trước giờ tập. Mỗi buổi kèm việc chăm sóc kế tiếp sau giờ tập (nếu có).
    Quản lý / HLV trưởng xem được cho toàn câu lạc bộ.
    """

    permission_classes = [CareAccess]

    def get(self, request):
        from apps.training.models import TrainingSession

        user = request.user
        raw = request.query_params.get("Date")
        try:
            day = date.fromisoformat(raw) if raw else club_today()
        except ValueError:
            raise ValidationError({"Date": ["Ngày không đúng định dạng dd/mm/yyyy."]}) from None
        sessions = TrainingSession.objects.filter(session_date=day, stage__plan__assignment__horse__in=care_horses(user))
        if not user.has_perm("CLUB_MANAGE") and not user.has_perm("TRAINER_ASSIGN"):
            horse_ids = HorseGroom.objects.filter(groom=user).values_list("horse_id", flat=True)
            sessions = sessions.filter(stage__plan__assignment__horse_id__in=list(horse_ids))
        sessions = sessions.select_related("stage__plan__assignment__horse", "stage__plan__assignment__trainer",
                                           "work_rider", "substitute_trainer").order_by("start_time", "id")
        rows = []
        for s in sessions:
            horse = s.horse
            start = datetime.combine(day, s.start_time)
            follow = (CareTask.objects.filter(horse=horse, scheduled_at__gte=start, scheduled_at__date=day,
                                              status=CareTask.Status.PENDING).order_by("scheduled_at").first()
                      or CareTask.objects.filter(horse=horse, scheduled_at__gte=start, scheduled_at__date=day)
                      .order_by("scheduled_at").first())
            supervisor = s.substitute_trainer or s.assignment.trainer
            rows.append({
                "TrainingSessionID": s.id, "HorseID": horse.id, "HorseName": horse.horse_name,
                "StartTime": s.start_time, "EndTime": s.end_time, "DurationPlannedMinutes": s.duration_planned_minutes,
                "TrainingType": s.training_type, "DistancePlannedKm": float(s.distance_planned_km) if s.distance_planned_km is not None else None,
                "TrainerName": supervisor.full_name if supervisor else None,
                "TrainerIsHead": bool(supervisor and "HEAD_TRAINER" in supervisor.role_codes),
                "WorkRiderName": s.work_rider.full_name, "Status": s.status,
                "NextCareTask": {"CareTaskID": follow.id, "TaskType": follow.task_type, "Note": follow.note,
                                 "ScheduledAt": fmt_datetime(follow.scheduled_at), "Status": follow.status} if follow else None,
            })
        return Response(rows)
