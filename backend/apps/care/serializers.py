import json

from rest_framework import serializers

from apps.core.models import AuditLog
from apps.core.serializers import DBColumnModelSerializer

from .models import CareTask, CareTaskRule, DietMeal, DietPlan, InventoryItem, InventoryRequest, InventoryRequestItem


# ---------------------------------------------------------------------------
# Khẩu phần
# ---------------------------------------------------------------------------
class DietMealSerializer(DBColumnModelSerializer):
    class Meta:
        model = DietMeal
        fields = ["id", "meal_time", "feed_type", "quantity", "unit", "note"]
        read_only_fields = ["id"]

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Số lượng phải lớn hơn 0.")
        return value


DIET_FIELDS = ["diet_description", "start_date", "end_date"]


class DietPlanSerializer(DBColumnModelSerializer):
    HorseName = serializers.CharField(source="horse.horse_name", read_only=True)
    CreatedByName = serializers.CharField(source="created_by.full_name", read_only=True)
    ReviewedByName = serializers.CharField(source="reviewed_by.full_name", read_only=True, default=None)
    Meals = DietMealSerializer(source="meals", many=True, read_only=True)
    TrainingPlanID = serializers.IntegerField(source="training_plan_id", read_only=True)

    class Meta:
        model = DietPlan
        fields = ["id", "horse", "HorseName", "created_by", "CreatedByName", "reviewed_by", "ReviewedByName",
                  *DIET_FIELDS, "status", "vet_note", "created_at", "approved_at", "TrainingPlanID", "Meals"]
        read_only_fields = fields


class DietPlanWriteSerializer(DBColumnModelSerializer):
    """Body: {"DietDescription": "...", "StartDate": "2026-10-12", "EndDate": null,
              "Meals": [{"MealTime": "06:00", "FeedType": "Yến mạch", "Quantity": 3, "Unit": "kg"}]}"""

    Meals = DietMealSerializer(many=True, required=False)
    TrainingPlanID = serializers.IntegerField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = DietPlan
        fields = [*DIET_FIELDS, "Meals", "TrainingPlanID"]


class VetDietDecisionSerializer(DietPlanWriteSerializer):
    """bác sĩ thú y duyệt / trả về / điều chỉnh. Điều chỉnh được gửi kèm Meals, ngày áp dụng."""

    VetNote = serializers.CharField(max_length=1500, required=False, allow_blank=True, allow_null=True)

    TrainingPlanID = None

    class Meta(DietPlanWriteSerializer.Meta):
        fields = [*DIET_FIELDS, "Meals", "VetNote"]


# ---------------------------------------------------------------------------
# Việc chăm sóc
# ---------------------------------------------------------------------------
class CareTaskSerializer(DBColumnModelSerializer):
    HorseName = serializers.CharField(source="horse.horse_name", read_only=True)
    GroomName = serializers.CharField(source="groom.full_name", read_only=True, default=None)
    AssignedByName = serializers.CharField(source="assigned_by.full_name", read_only=True, default=None)
    StallNumber = serializers.SerializerMethodField()
    Source = serializers.SerializerMethodField()

    class Meta:
        model = CareTask
        fields = ["id", "horse", "HorseName", "groom", "GroomName", "assigned_by", "AssignedByName", "task_type",
                  "scheduled_at", "status", "completed_at", "note", "rule_code", "IsAuto", "priority",
                  "feeding_outcome", "outcome_note", "completed_by", "StallNumber", "Source"]
        read_only_fields = fields

    IsAuto = serializers.BooleanField(source="is_auto", read_only=True)

    def get_StallNumber(self, obj):
        return obj.horse.stall_assignments.filter(status="Active").values_list("stall__stall_number", flat=True).first()

    def get_Source(self, obj):
        if obj.medical_record_id:
            return "Chỉ định Vet"
        return "Hệ thống" if obj.rule_code else "Giao thêm"


class CareTaskWriteSerializer(DBColumnModelSerializer):
    """Head Trainer / Manager giao việc ngoài chỉ tiêu (Groom không tự tạo việc):
    {"HorseID": 1, "GroomID": 7, "TaskType": "Ice Leg Soak", "ScheduledAt": "2026-10-12T15:00:00", "Note": ""}"""

    HorseID = serializers.IntegerField(write_only=True)
    GroomID = serializers.IntegerField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = CareTask
        fields = ["HorseID", "GroomID", "task_type", "scheduled_at", "note", "medical_record", "training_lock", "priority"]

    def validate_priority(self, v):
        if v not in ("Normal", "Urgent"):
            raise serializers.ValidationError("Chọn Normal hoặc Urgent.")
        return v


class CareTaskRuleSerializer(DBColumnModelSerializer):
    UpdatedByName = serializers.CharField(source="updated_by.full_name", read_only=True, default=None)

    class Meta:
        model = CareTaskRule
        fields = ["id", "rule_code", "task_type", "title", "time_of_day", "offset_minutes", "is_active",
                  "updated_by", "UpdatedByName", "updated_at"]
        read_only_fields = ["id", "rule_code", "task_type", "updated_by", "UpdatedByName", "updated_at"]

    def validate_offset_minutes(self, value):
        if value is not None and not (0 <= value <= 240):
            raise serializers.ValidationError("Từ 0 đến 240 phút.")
        return value


class GenerateTasksSerializer(serializers.Serializer):
    Date = serializers.DateField(required=False)
    Days = serializers.IntegerField(required=False, min_value=1, max_value=8, default=1)


class HorseGroomSerializer(serializers.Serializer):
    GroomID = serializers.IntegerField()


class NoteSerializer(serializers.Serializer):
    Note = serializers.CharField(max_length=1000, required=False, allow_blank=True, allow_null=True)
    FeedingOutcome = serializers.ChoiceField(choices=("All", "Partial", "Refused"), required=False)


class ReasonSerializer(serializers.Serializer):
    Reason = serializers.CharField(max_length=1000)


# ---------------------------------------------------------------------------
# Kho vật tư
# ---------------------------------------------------------------------------
class InventoryItemSerializer(DBColumnModelSerializer):
    class Meta:
        model = InventoryItem
        fields = ["id", "club", "item_name", "item_type", "quantity", "unit", "minimum_quantity", "status"]
        read_only_fields = fields


class InventoryItemWriteSerializer(DBColumnModelSerializer):
    """Tạo: {"ItemName", "ItemType", "Unit", "Quantity"?, "MinimumQuantity"?}. Sửa: thêm "Status": "Inactive" để ngưng dùng,
    "Reactivate": true để dùng lại. Số lượng tồn đổi qua POST /inventory-items/<id>/stock."""

    Reactivate = serializers.BooleanField(source="reactivate", required=False, default=False)

    class Meta:
        model = InventoryItem
        fields = ["item_name", "item_type", "quantity", "unit", "minimum_quantity", "status", "Reactivate"]
        extra_kwargs = {"quantity": {"required": False}, "minimum_quantity": {"required": False},
                        "status": {"required": False}}

    def validate_status(self, value):
        if value not in (None, InventoryItem.Status.INACTIVE):
            raise serializers.ValidationError("Chỉ được đặt Inactive; các trạng thái khác tự tính theo số lượng.")
        return value


class StockSerializer(serializers.Serializer):
    Change = serializers.DecimalField(max_digits=12, decimal_places=2)
    Note = serializers.CharField(max_length=500, required=False, allow_blank=True, allow_null=True)

    def validate_Change(self, value):
        if value == 0:
            raise serializers.ValidationError("Số lượng thay đổi phải khác 0.")
        return value


class InventoryRequestItemSerializer(DBColumnModelSerializer):
    ItemName = serializers.CharField(source="item.item_name", read_only=True)
    Unit = serializers.CharField(source="item.unit", read_only=True)

    class Meta:
        model = InventoryRequestItem
        fields = ["id", "item", "ItemName", "Unit", "requested_quantity", "approved_quantity", "note"]
        read_only_fields = fields


class InventoryRequestSerializer(DBColumnModelSerializer):
    RequestedByName = serializers.CharField(source="requested_by.full_name", read_only=True)
    ApprovedByName = serializers.CharField(source="approved_by.full_name", read_only=True, default=None)
    Items = InventoryRequestItemSerializer(source="items", many=True, read_only=True)
    RejectNote = serializers.SerializerMethodField()

    class Meta:
        model = InventoryRequest
        fields = ["id", "club", "requested_by", "RequestedByName", "approved_by", "ApprovedByName", "request_date",
                  "status", "reason", "approved_at", "RejectNote", "Items"]
        read_only_fields = fields

    def get_RejectNote(self, obj):
        """Bảng InventoryRequest không có cột ghi chú của Quản lý câu lạc bộ; lý do từ chối lấy từ AuditLog."""
        if obj.status != InventoryRequest.Status.REJECTED:
            return None
        log = AuditLog.objects.filter(entity_name="InventoryRequest", entity_id=obj.pk,
                                      action_type="REJECT_INVENTORY_REQUEST").first()
        try:
            return json.loads(log.details).get("Note") if log and log.details else None
        except ValueError:
            return None


class RequestLineSerializer(serializers.Serializer):
    InventoryItemID = serializers.IntegerField()
    RequestedQuantity = serializers.DecimalField(max_digits=12, decimal_places=2)
    Note = serializers.CharField(max_length=1000, required=False, allow_blank=True, allow_null=True)

    def validate_RequestedQuantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Số lượng phải lớn hơn 0.")
        return value


class InventoryRequestCreateSerializer(serializers.Serializer):
    """Body: {"Reason": "Hết cám buổi chiều", "Items": [{"InventoryItemID": 1, "RequestedQuantity": 20}]}"""

    Reason = serializers.CharField(max_length=1500, required=False, allow_blank=True, allow_null=True)
    Items = RequestLineSerializer(many=True)


class ApproveLineSerializer(serializers.Serializer):
    InventoryItemID = serializers.IntegerField()
    ApprovedQuantity = serializers.DecimalField(max_digits=12, decimal_places=2)


class InventoryApproveSerializer(serializers.Serializer):
    Items = ApproveLineSerializer(many=True, required=False)
    Note = serializers.CharField(max_length=1000)


class RejectSerializer(serializers.Serializer):
    Note = serializers.CharField(max_length=1000)
