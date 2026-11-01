"""API Flow 4 - chăm sóc và dinh dưỡng. Chi tiết từng API: docs/API.md mục Flow 4."""
from datetime import date, datetime, time

from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.params import date_param, flag_param, int_param
from apps.core.permissions import HasAnyPermission, require_club_user
from apps.horses.views import get_visible_horse

from . import access, automation, services
from .models import CareTask, CareTaskRule, DietPlan, HorseGroom, InventoryItem, InventoryRequest
from .serializers import (
    CareTaskRuleSerializer, CareTaskSerializer, CareTaskWriteSerializer, DietPlanSerializer, DietPlanWriteSerializer,
    GenerateTasksSerializer, HorseGroomSerializer,
    InventoryApproveSerializer, InventoryItemSerializer, InventoryItemWriteSerializer, InventoryRequestCreateSerializer,
    InventoryRequestSerializer, CompleteTaskSerializer, ReasonSerializer, RejectSerializer, StockSerializer,
    VetDietDecisionSerializer,
)

STAFF_VIEW = "HORSE_VIEW"




def _meals(values):
    meals = values.pop("Meals", None)
    return [dict(m) for m in meals] if meals is not None else None


# ---------------------------------------------------------------------------
# Khẩu phần
# ---------------------------------------------------------------------------
def can_create_diet(user):
    """Head Trainer lập / sửa / chốt khẩu phần (cột CreatedByHeadTrainerID)."""
    return user.has_perm("DIET_MANAGE") and user.has_role("HEAD_TRAINER")


def can_review_diet(user):
    """Vet góp ý; với ngựa đang bệnh / bị khóa tập thì duyệt, trả về, điều chỉnh."""
    return user.has_perm("DIET_MANAGE") and user.has_perm("MEDICAL_MANAGE")


def care_horse(user, horse_id):
    """Ngựa trong CLB mà người dùng được xem phần chăm sóc (Groom: ngựa mình giữ; Trainer: ngựa mình phụ trách)."""
    horse = get_visible_horse(user, horse_id)
    access.ensure_horse_visible(user, horse)
    return horse


class HorseDietPlanView(APIView):
    """
    GET  /api/horses/<HorseID>/diet-plans
    POST /api/horses/<HorseID>/diet-plans   Head Trainer lập khẩu phần (Pending: chờ Vet góp ý, rồi Head Trainer chốt)
    """

    permission_classes = [HasAnyPermission(STAFF_VIEW)]

    def get(self, request, horse_id):
        horse = care_horse(request.user, horse_id)
        plans = horse.diet_plans.select_related("created_by", "reviewed_by", "horse").prefetch_related("meals")
        return Response(DietPlanSerializer(plans, many=True).data)

    def post(self, request, horse_id):
        if not can_create_diet(request.user):
            raise PermissionDenied("Chỉ Head Trainer lập khẩu phần.")
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

    permission_classes = [HasAnyPermission(STAFF_VIEW)]

    def get(self, request, horse_id):
        return Response(services.diet_context(care_horse(request.user, horse_id)))


class CurrentDietView(APIView):
    """GET /api/horses/<HorseID>/current-diet - khẩu phần đang áp dụng hôm nay (null nếu chưa có)."""

    permission_classes = [HasAnyPermission(STAFF_VIEW)]

    def get(self, request, horse_id):
        plan = services.current_diet_plan(care_horse(request.user, horse_id))
        return Response(DietPlanSerializer(plan).data if plan else None)


class DietPlanViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    GET   /api/diet-plans?Status=Pending&HorseID=
    PATCH /api/diet-plans/<id>                        Head Trainer sửa / gửi lại
    POST  /api/diet-plans/<id>/comment                Vet góp ý {"VetNote"}
    POST  /api/diet-plans/<id>/finalize               Head Trainer chốt (sau khi Vet góp ý; ngựa khỏe)
    POST  /api/diet-plans/<id>/approve|reject|adjust  Vet - chỉ với ngựa đang bệnh / chấn thương / bị khóa tập
    """

    serializer_class = DietPlanSerializer
    permission_classes = [HasAnyPermission(STAFF_VIEW)]

    def get_queryset(self):
        qs = DietPlan.objects.filter(horse__club_id=self.request.user.club_id).select_related(
            "horse", "created_by", "reviewed_by").prefetch_related("meals")
        qs = access.filter_horses(self.request.user, qs)
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
            raise PermissionDenied("Chỉ bác sĩ thú y góp ý / duyệt / điều chỉnh khẩu phần.")
        data = VetDietDecisionSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        return dict(data.validated_data)

    def partial_update(self, request, pk=None):
        if not can_create_diet(request.user):
            raise PermissionDenied("Chỉ Head Trainer sửa khẩu phần.")
        data = DietPlanWriteSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        meals = _meals(values)
        return self._out(services.update_diet_plan(self.get_object(), request.user, values, meals))

    @action(detail=True, methods=["post"])
    def comment(self, request, pk=None):
        values = self._decision(request)
        return self._out(services.comment_diet_plan(self.get_object(), request.user, values.get("VetNote")))

    @action(detail=True, methods=["post"])
    def finalize(self, request, pk=None):
        if not can_create_diet(request.user):
            raise PermissionDenied("Chỉ Head Trainer chốt khẩu phần.")
        return self._out(services.finalize_diet_plan(self.get_object(), request.user))

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        values = self._decision(request)
        return self._out(services.approve_diet_plan(self.get_object(), request.user, values.get("VetNote")))

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
         Vet, Head Trainer: toàn CLB; Trainer: ngựa mình phụ trách; Groom: việc của mình. Manager / Work Rider: 403.
         (mỗi lần xem, hệ thống sinh việc theo chỉ tiêu cho hôm nay / ngày được hỏi - xem automation.py)
    POST /api/care-tasks                     Vet (việc y tế) / Trainer (việc tập luyện, ngựa mình phụ trách) giao thêm
    POST /api/care-tasks/generate            Head Trainer sinh việc trước {"Date"?, "Days"?}
    PATCH /api/care-tasks/<id>               người giao sửa việc chưa làm
    POST /api/care-tasks/<id>/complete       Groom xác nhận đã làm   {"Note"?, "IntakeStatus"?: Full|Partial|Refused}
    POST /api/care-tasks/<id>/skip           Groom / người giao bỏ qua {"Reason"}
    """

    serializer_class = CareTaskSerializer
    permission_classes = [HasAnyPermission(STAFF_VIEW)]

    def get_queryset(self):
        qs = CareTask.objects.filter(horse__club_id=self.request.user.club_id).select_related(
            "horse", "groom", "assigned_by")
        qs = access.filter_tasks(self.request.user, qs)
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
        if p.get("Auto") in ("1", "true"):
            qs = qs.filter(rule_code__isnull=False)
        if flag_param(p, "mine"):
            qs = qs.filter(groom=self.request.user)
        return qs

    def list(self, request, *args, **kwargs):
        access.ensure_care_viewer(request.user)
        club = request.user.club
        if club is not None:
            p = request.query_params
            day = date_param(p, "Date") if p.get("Date") else date.today()
            automation.generate_for_day(club, date.today())
            if day != date.today():
                automation.generate_for_day(club, day)
        return super().list(request, *args, **kwargs)

    @extend_schema(request=GenerateTasksSerializer)
    @action(detail=False, methods=["post"])
    def generate(self, request):
        if not access.is_rule_owner(request.user):
            raise PermissionDenied("Chỉ Head Trainer sinh trước việc chăm sóc theo chỉ tiêu.")
        data = GenerateTasksSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        return Response(automation.generate_range(request.user.club, v.get("Date") or date.today(), v["Days"],
                                                  request.user))

    def _out(self, task, code=status.HTTP_200_OK):
        return Response(CareTaskSerializer(self.get_queryset().get(pk=task.pk)).data, status=code)

    def create(self, request):
        data = CareTaskWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        horse = get_visible_horse(request.user, values.pop("HorseID"))
        return self._out(services.create_care_task(horse, request.user, values), status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        data = CareTaskWriteSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        values.pop("HorseID", None)
        return self._out(services.update_care_task(self.get_object(), request.user, values))

    @extend_schema(request=CompleteTaskSerializer)
    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        data = CompleteTaskSerializer(data=request.data or {})
        data.is_valid(raise_exception=True)
        v = data.validated_data
        return self._out(services.complete_care_task(self.get_object(), request.user, v.get("Note"),
                                                     v.get("IntakeStatus")))

    @action(detail=True, methods=["post"])
    def skip(self, request, pk=None):
        data = ReasonSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return self._out(services.skip_care_task(self.get_object(), request.user, data.validated_data["Reason"]))


class CareRuleListView(APIView):
    """GET /api/care-rules - chỉ tiêu sinh việc chăm sóc của CLB (Vet, Head Trainer, Trainer, Groom xem)."""

    permission_classes = [HasAnyPermission(STAFF_VIEW)]

    def get(self, request):
        access.ensure_care_viewer(request.user)
        rules = automation.ensure_rules(request.user.club)
        return Response(CareTaskRuleSerializer(sorted(rules.values(), key=lambda r: r.id), many=True).data)


class CareRuleDetailView(APIView):
    """PATCH /api/care-rules/<RuleCode> {"IsActive", "TimeOfDay", "OffsetMinutes", "Title"} - Head Trainer."""

    permission_classes = [HasAnyPermission(STAFF_VIEW)]

    @extend_schema(request=CareTaskRuleSerializer)
    def patch(self, request, rule_code):
        if not access.is_rule_owner(request.user):
            raise PermissionDenied("Chỉ Head Trainer chỉnh chỉ tiêu chăm sóc chung.")
        rule = automation.ensure_rules(request.user.club).get(rule_code)
        if rule is None:
            raise ValidationError({"RuleCode": ["Chỉ tiêu không tồn tại."]})
        data = CareTaskRuleSerializer(rule, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        return Response(CareTaskRuleSerializer(automation.update_rule(rule, request.user, dict(data.validated_data))).data)


MAX_HORSES_PER_GROOM = 4   # quá số này thì cảnh báo (không chặn) để Manager chia việc đều


def groom_loads(club_id):
    """{GroomID: số ngựa đang giữ} của Groom đang hoạt động trong CLB."""
    from django.db.models import Count

    from apps.core.permissions import club_users_with_role

    counts = dict(HorseGroom.objects.filter(horse__club_id=club_id, horse__registration_status="Approved")
                  .values_list("groom_id").annotate(n=Count("horse_id")).values_list("groom_id", "n"))
    return {g.pk: (g, counts.get(g.pk, 0)) for g in club_users_with_role(club_id, "GROOM").order_by("full_name")}


class GroomListView(APIView):
    """GET /api/grooms - Groom đang hoạt động kèm số ngựa đang giữ (Manager xếp Groom; Vet, Head Trainer xem)."""

    permission_classes = [HasAnyPermission("CLUB_MANAGE", "MEDICAL_MANAGE", "TRAINING_PLAN_APPROVE")]

    def get(self, request):
        return Response([{"UserID": g.pk, "FullName": g.full_name, "Phone": g.phone, "HorseCount": n,
                          "OverLimit": n > MAX_HORSES_PER_GROOM}
                         for g, n in groom_loads(request.user.club_id).values()])


class HorseGroomBoardView(APIView):
    """GET /api/horse-grooms - bảng xếp Groom: mọi ngựa đang ở CLB và Groom phụ trách (null nếu chưa có)."""

    permission_classes = [HasAnyPermission("CLUB_MANAGE", "MEDICAL_MANAGE", "TRAINING_PLAN_APPROVE")]

    def get(self, request):
        from apps.horses.models import Horse

        links = {link.horse_id: link for link in HorseGroom.objects.filter(
            horse__club_id=request.user.club_id).select_related("groom")}
        rows = []
        for horse in Horse.objects.filter(club_id=request.user.club_id,
                                          registration_status="Approved").order_by("horse_name"):
            link = links.get(horse.pk)
            rows.append({"HorseID": horse.pk, "HorseName": horse.horse_name, "HorseCode": horse.horse_code,
                         "GroomID": link.groom_id if link else None,
                         "GroomName": link.groom.full_name if link else None,
                         "AssignedAt": link.assigned_at if link else None})
        return Response(rows)


class HorseGroomView(APIView):
    """
    GET    /api/horses/<HorseID>/groom   Groom phụ trách ngựa (null nếu chưa có)
    PUT    /api/horses/<HorseID>/groom   {"GroomID"} Manager xếp; mọi việc chưa làm của ngựa chuyển theo
    DELETE /api/horses/<HorseID>/groom   Manager bỏ Groom phụ trách (việc mới chia cho Groom ít việc nhất)
    """

    permission_classes = [HasAnyPermission(STAFF_VIEW)]

    @staticmethod
    def _body(link):
        return {"HorseID": link.horse_id, "GroomID": link.groom_id, "GroomName": link.groom.full_name,
                "AssignedBy": link.assigned_by_id, "AssignedAt": link.assigned_at} if link else None

    def get(self, request, horse_id):
        if access.is_groom_manager(request.user):
            horse = get_visible_horse(request.user, horse_id)
        else:
            horse = care_horse(request.user, horse_id)
        return Response(self._body(HorseGroom.objects.filter(horse=horse).select_related("groom").first()))

    def _manager(self, request, horse_id):
        if not access.is_groom_manager(request.user):
            raise PermissionDenied("Chỉ quản lý câu lạc bộ xếp Groom phụ trách ngựa.")
        return get_visible_horse(request.user, horse_id)

    @extend_schema(request=HorseGroomSerializer)
    def put(self, request, horse_id):
        horse = self._manager(request, horse_id)
        data = HorseGroomSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        groom = require_club_user(data.validated_data["GroomID"], horse.club_id, "GROOM", field="GroomID")
        link, moved = automation.set_horse_groom(horse, groom, request.user)
        count = groom_loads(horse.club_id).get(groom.pk, (groom, 0))[1]
        warning = (f"{groom.full_name} đang giữ {count} ngựa (khuyến nghị tối đa {MAX_HORSES_PER_GROOM})."
                   if count > MAX_HORSES_PER_GROOM else None)
        return Response({**self._body(link), "MovedTaskCount": moved, "GroomHorseCount": count, "Warning": warning})

    def delete(self, request, horse_id):
        automation.clear_horse_groom(self._manager(request, horse_id), request.user)
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
            return [HasAnyPermission(*INVENTORY_ANY)()]
        return [HasAnyPermission("INVENTORY_MANAGE")()]

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
        return [HasAnyPermission(*self.action_permissions.get(self.action, INVENTORY_ANY))()]

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
        return self._out(services.approve_inventory_request(self.get_object(), request.user, approved))

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        data = RejectSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return self._out(services.reject_inventory_request(self.get_object(), request.user,
                                                           data.validated_data["Note"]))

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        return self._out(services.cancel_inventory_request(self.get_object(), request.user))

