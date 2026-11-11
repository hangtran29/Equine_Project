from django.db import transaction
from django.db.models import Q
from rest_framework import serializers
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.core.access import care_horses, operational_horse
from apps.core.audit import log_action
from apps.core.clubtime import today
from apps.core.permissions import HasAnyPermission
from apps.horses.models import Horse
from apps.medical.models import MedicalRecord, TrainingLock
from .models import VetCareOrder, VetDietRestriction, CareTask
from .serializers import DBColumnModelSerializer


class OrderSerializer(DBColumnModelSerializer):
    CreatedByName = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = VetCareOrder
        fields = ["id", "medical_record", "training_lock", "created_by", "CreatedByName", "task_type", "instructions",
                  "start_date", "end_date", "time_of_day", "is_active", "created_at"]
        read_only_fields = ["id", "created_by", "CreatedByName", "is_active", "created_at"]


class RestrictionSerializer(DBColumnModelSerializer):
    CreatedByName = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = VetDietRestriction
        fields = ["id", "horse", "created_by", "CreatedByName", "instructions", "feed_type", "max_daily_quantity",
                  "unit", "start_date", "end_date", "created_at", "is_active"]
        read_only_fields = ["id", "horse", "created_by", "CreatedByName", "created_at", "is_active"]


class CareOrderView(APIView):
    permission_classes = [HasAnyPermission("MEDICAL_MANAGE")]

    def get(self, request, horse_id):
        horse = operational_horse(request.user, horse_id)
        return Response(OrderSerializer(VetCareOrder.objects.filter(medical_record__horse=horse), many=True).data)

    @transaction.atomic
    def post(self, request, horse_id):
        horse = operational_horse(request.user, horse_id)
        Horse.objects.select_for_update().get(pk=horse.pk)
        data = OrderSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = dict(data.validated_data)
        record, lock = v["medical_record"], v.get("training_lock")
        if record.horse_id != horse.pk or record.vet_id != request.user.pk or not record.is_signed:
            raise ValidationError({"MedicalRecordID": ["Chọn phiếu đã ký của bạn cho ngựa này."]})
        if lock and (lock.horse_id != horse.pk or lock.lock_status != "Active"):
            raise ValidationError({"TrainingLockID": ["Chọn đợt khóa đang hoạt động của ngựa này."]})
        if v["end_date"] < v["start_date"] or v["start_date"] < today() or (v["end_date"] - v["start_date"]).days > 90:
            raise ValidationError({"EndDate": ["Chỉ định từ hôm nay, tối đa 90 ngày và không kết thúc trước ngày bắt đầu."]})
        order = VetCareOrder.objects.create(created_by=request.user, **v)
        log_action(request.user, "CREATE_VET_CARE_ORDER", order, {"HorseID": horse.pk})
        from .automation import generate_range
        transaction.on_commit(lambda: generate_range(horse.club, today(), 8, request.user), robust=True)
        return Response(OrderSerializer(order).data, status=201)


class CareOrderStopView(APIView):
    permission_classes = [HasAnyPermission("MEDICAL_MANAGE")]

    @transaction.atomic
    def post(self, request, order_id):
        order = VetCareOrder.objects.filter(pk=order_id, medical_record__horse__in=care_horses(request.user)).first()
        if not order:
            raise NotFound()
        Horse.objects.select_for_update().get(pk=order.medical_record.horse_id)
        reason = str(request.data.get("Reason") or "").strip()
        if not reason or len(reason) > 1000:
            raise ValidationError({"Reason": ["Cần lý do ngừng chỉ định (tối đa 1000 ký tự)."]})
        order.is_active = False
        order.save(update_fields=["is_active"])
        log_action(request.user, "STOP_VET_CARE_ORDER", order, {"Reason": reason})
        from .automation import generate_range
        transaction.on_commit(lambda: generate_range(order.medical_record.horse.club, today(), 8), robust=True)
        return Response(OrderSerializer(order).data)


class DietRestrictionView(APIView):
    permission_classes = [HasAnyPermission("DIET_MANAGE")]

    def get(self, request, horse_id):
        horse = operational_horse(request.user, horse_id)
        return Response(RestrictionSerializer(horse.diet_restrictions.select_related("created_by"), many=True).data)

    @transaction.atomic
    def post(self, request, horse_id):
        if not request.user.has_perm("MEDICAL_MANAGE"):
            raise PermissionDenied("Chỉ Vet đặt hạn chế y tế.")
        horse = operational_horse(request.user, horse_id)
        Horse.objects.select_for_update().get(pk=horse.pk)
        data = RestrictionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = dict(data.validated_data)
        if v.get("end_date") and v["end_date"] < v["start_date"]:
            raise ValidationError({"EndDate": ["Ngày kết thúc không trước ngày bắt đầu."]})
        maximum = v.get("max_daily_quantity")
        if maximum is not None and (maximum < 0 or not v.get("unit") or not v.get("feed_type")):
            raise ValidationError({"MaxDailyQuantity": ["Giới hạn không âm, cần loại thức ăn và đơn vị."]})
        restriction = VetDietRestriction.objects.create(horse=horse, created_by=request.user, **v)
        log_action(request.user, "VET_DIET_RESTRICTION", restriction, {"HorseID": horse.pk})
        from apps.core.workflow import clinical_recipients, notify
        notify(clinical_recipients(horse), horse, "DIET_RESTRICTION", f"diet-restriction:{restriction.pk}",
               f"{horse.horse_name}: {restriction.instructions}. Cần kiểm tra/chốt lại khẩu phần.")
        from .automation import generate_range
        transaction.on_commit(lambda: generate_range(horse.club, today(), 8), robust=True)
        return Response(RestrictionSerializer(restriction).data, status=201)


class DietRestrictionStopView(APIView):
    permission_classes = [HasAnyPermission("MEDICAL_MANAGE")]

    @transaction.atomic
    def post(self, request, restriction_id):
        r = VetDietRestriction.objects.filter(pk=restriction_id, horse__in=care_horses(request.user)).first()
        if not r:
            raise NotFound()
        Horse.objects.select_for_update().get(pk=r.horse_id)
        reason = str(request.data.get("Reason") or "").strip()
        if not reason or len(reason) > 1000:
            raise ValidationError({"Reason": ["Cần lý do ngừng hạn chế, tối đa 1000 ký tự."]})
        r.is_active = False
        r.save(update_fields=["is_active"])
        log_action(request.user, "STOP_DIET_RESTRICTION", r, {"Reason": reason})
        from .automation import generate_range
        transaction.on_commit(lambda: generate_range(r.horse.club, today(), 8), robust=True)
        return Response(RestrictionSerializer(r).data)
