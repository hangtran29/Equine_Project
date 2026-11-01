"""
FLOW 4 - chăm sóc và dinh dưỡng (horse_v2.sql):
  DietPlan, DietMeal (Head Trainer lập khẩu phần theo giáo án đang chạy, Vet góp ý, Head Trainer chốt;
                     ngựa đang bệnh / bị khóa tập thì cần Vet duyệt),
  CareTask (việc chăm sóc của Groom: hệ thống tự sinh theo chỉ tiêu CareTaskRule; việc phát sinh do Vet / Trainer giao),
  CareTaskRule (chỉ tiêu sinh việc của từng CLB, Head Trainer chỉnh), HorseGroom (Groom phụ trách ngựa, Manager xếp),
  InventoryItem, InventoryRequest, InventoryRequestItem (kho vật tư của CLB).
"""
from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.accounts.models import Club
from apps.core import flows
from apps.horses.models import Horse


class DietPlan(models.Model):
    class Status(models.TextChoices):
        PENDING = "Pending"      # chờ Vet duyệt
        APPROVED = "Approved"    # đang áp dụng
        REJECTED = "Rejected"    # Vet trả về, Head Trainer sửa rồi gửi lại
        ADJUSTED = "Adjusted"    # Vet điều chỉnh trực tiếp (vd ngựa đang điều trị), vẫn áp dụng
        EXPIRED = "Expired"      # đã có khẩu phần mới thay thế / hết hạn

    id = models.AutoField(primary_key=True, db_column="DietPlanID")
    horse = models.ForeignKey(Horse, on_delete=models.DO_NOTHING, db_column="HorseID", related_name="diet_plans")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING,
                                   db_column="CreatedByHeadTrainerID", related_name="+")
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, null=True, blank=True,
                                    db_column="ReviewedByVetID", related_name="+")
    diet_description = models.CharField(max_length=2000, null=True, blank=True, db_column="DietDescription")
    start_date = models.DateField(db_column="StartDate")
    end_date = models.DateField(null=True, blank=True, db_column="EndDate")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_column="Status")
    vet_note = models.CharField(max_length=1500, null=True, blank=True, db_column="VetNote")
    created_at = models.DateTimeField(default=timezone.now, db_column="CreatedAt")
    approved_at = models.DateTimeField(null=True, blank=True, db_column="ApprovedAt")
    if flows.has_training():  # khẩu phần lập theo giáo án đang chạy (Flow 2)
        training_plan = models.ForeignKey("training.TrainingPlan", on_delete=models.DO_NOTHING, null=True, blank=True,
                                          db_column="TrainingPlanID", related_name="diet_plans")
    else:
        training_plan_id = models.IntegerField(null=True, blank=True, db_column="TrainingPlanID")

    class Meta:
        managed = False
        db_table = "DietPlan"
        ordering = ["-start_date", "-id"]


class DietMeal(models.Model):
    id = models.AutoField(primary_key=True, db_column="DietMealID")
    diet_plan = models.ForeignKey(DietPlan, on_delete=models.DO_NOTHING, db_column="DietPlanID", related_name="meals")
    meal_time = models.TimeField(db_column="MealTime")
    feed_type = models.CharField(max_length=100, db_column="FeedType")
    quantity = models.DecimalField(max_digits=10, decimal_places=2, db_column="Quantity")
    unit = models.CharField(max_length=30, db_column="Unit")
    note = models.CharField(max_length=1000, null=True, blank=True, db_column="Note")

    class Meta:
        managed = False
        db_table = "DietMeal"
        ordering = ["meal_time", "id"]


class CareTask(models.Model):
    class TaskType(models.TextChoices):
        FEEDING = "Feeding"
        CLEANING = "Cleaning"
        BATHING = "Bathing"
        ICE_LEG_SOAK = "Ice Leg Soak"
        MEDICAL_CARE = "Medical Care"      # Vet giao: thay băng, bôi thuốc, cắt móng...
        TRAINING_CARE = "Training Care"    # Trainer giao: dắt đi bộ thả lỏng, chườm chân sau buổi tập nặng...

    class Intake(models.TextChoices):      # Groom ghi khi cho ăn
        FULL = "Full"          # ăn hết
        PARTIAL = "Partial"    # ăn một phần
        REFUSED = "Refused"    # bỏ ăn

    class Status(models.TextChoices):
        PENDING = "Pending"
        COMPLETED = "Completed"
        SKIPPED = "Skipped"

    id = models.AutoField(primary_key=True, db_column="CareTaskID")
    horse = models.ForeignKey(Horse, on_delete=models.DO_NOTHING, db_column="HorseID", related_name="care_tasks")
    groom = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="GroomID",
                              related_name="+")
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, null=True, blank=True,
                                    db_column="AssignedBy", related_name="+")
    task_type = models.CharField(max_length=50, choices=TaskType.choices, db_column="TaskType")
    scheduled_at = models.DateTimeField(db_column="ScheduledAt")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_column="Status")
    completed_at = models.DateTimeField(null=True, blank=True, db_column="CompletedAt")
    note = models.CharField(max_length=1000, null=True, blank=True, db_column="Note")
    # Việc hệ thống tự sinh: chỉ tiêu nào + khóa nguồn (không sinh trùng). Việc giao tay: cả hai NULL.
    rule_code = models.CharField(max_length=40, null=True, blank=True, db_column="RuleCode")
    source_key = models.CharField(max_length=120, null=True, blank=True, db_column="SourceKey")
    intake_status = models.CharField(max_length=20, choices=Intake.choices, null=True, blank=True,
                                     db_column="IntakeStatus")

    class Meta:
        managed = False
        db_table = "CareTask"
        ordering = ["scheduled_at", "id"]

    @property
    def is_auto(self):
        return self.rule_code is not None


class CareTaskRule(models.Model):
    """Chỉ tiêu sinh việc chăm sóc của CLB (bật / tắt, giờ làm). Mỗi CLB mỗi chỉ tiêu 1 dòng."""

    class Code(models.TextChoices):
        FEEDING_BY_DIET = "FEEDING_BY_DIET"            # cho ăn theo từng bữa của khẩu phần đang áp dụng
        DAILY_CLEANING = "DAILY_CLEANING"              # dọn chuồng mỗi ngày
        BATH_AFTER_TRAINING = "BATH_AFTER_TRAINING"    # tắm, kiểm tra chân sau mỗi buổi tập đã xong
        ICE_SOAK_WHEN_LOCKED = "ICE_SOAK_WHEN_LOCKED"  # ngâm chân nước đá mỗi ngày khi ngựa bị khóa tập

    id = models.AutoField(primary_key=True, db_column="CareTaskRuleID")
    club = models.ForeignKey(Club, on_delete=models.DO_NOTHING, db_column="ClubID", related_name="care_rules")
    rule_code = models.CharField(max_length=40, choices=Code.choices, db_column="RuleCode")
    # Chỉ tiêu chỉ sinh 4 loại việc hằng ngày (việc y tế / tập luyện do Vet / Trainer giao tay)
    RULE_TASK_TYPES = [(t, t) for t in ("Feeding", "Cleaning", "Bathing", "Ice Leg Soak")]
    task_type = models.CharField(max_length=50, choices=RULE_TASK_TYPES, db_column="TaskType")
    title = models.CharField(max_length=150, db_column="Title")
    time_of_day = models.TimeField(null=True, blank=True, db_column="TimeOfDay")
    offset_minutes = models.IntegerField(null=True, blank=True, db_column="OffsetMinutes")
    is_active = models.BooleanField(default=True, db_column="IsActive")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, null=True, blank=True,
                                   db_column="UpdatedBy", related_name="+")
    updated_at = models.DateTimeField(default=timezone.now, db_column="UpdatedAt")

    class Meta:
        managed = False
        db_table = "CareTaskRule"
        ordering = ["id"]
        constraints = [models.UniqueConstraint(fields=["club", "rule_code"], name="UQ_CareTaskRule_Club_Code")]


class HorseGroom(models.Model):
    """Groom phụ trách ngựa: việc tự sinh của ngựa giao cho người này (chưa có thì chia cho Groom ít việc nhất)."""

    horse = models.OneToOneField(Horse, primary_key=True, on_delete=models.DO_NOTHING, db_column="HorseID",
                                 related_name="groom_link")
    groom = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="GroomID",
                              related_name="+")
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, null=True, blank=True,
                                    db_column="AssignedBy", related_name="+")
    assigned_at = models.DateTimeField(default=timezone.now, db_column="AssignedAt")

    class Meta:
        managed = False
        db_table = "HorseGroom"


class InventoryItem(models.Model):
    class ItemType(models.TextChoices):
        FOOD = "Food"
        MEDICINE = "Medicine"
        CARE_EQUIPMENT = "Care Equipment"

    class Status(models.TextChoices):
        AVAILABLE = "Available"
        LOW_STOCK = "Low Stock"
        OUT_OF_STOCK = "Out of Stock"
        INACTIVE = "Inactive"

    id = models.AutoField(primary_key=True, db_column="InventoryItemID")
    club = models.ForeignKey(Club, on_delete=models.DO_NOTHING, db_column="ClubID", related_name="inventory_items")
    item_name = models.CharField(max_length=150, db_column="ItemName")
    item_type = models.CharField(max_length=50, choices=ItemType.choices, db_column="ItemType")
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0, db_column="Quantity")
    unit = models.CharField(max_length=30, db_column="Unit")
    minimum_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0, db_column="MinimumQuantity")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AVAILABLE, db_column="Status")

    class Meta:
        managed = False
        db_table = "InventoryItem"
        ordering = ["item_type", "item_name", "id"]

    def refresh_status(self):
        """Tự tính trạng thái theo số lượng (giữ nguyên nếu đã ngưng dùng - Inactive)."""
        if self.status == self.Status.INACTIVE:
            return
        if self.quantity <= 0:
            self.status = self.Status.OUT_OF_STOCK
        elif self.quantity <= self.minimum_quantity:
            self.status = self.Status.LOW_STOCK
        else:
            self.status = self.Status.AVAILABLE


class InventoryRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "Pending"
        APPROVED = "Approved"
        REJECTED = "Rejected"
        CANCELLED = "Cancelled"

    id = models.AutoField(primary_key=True, db_column="InventoryRequestID")
    club = models.ForeignKey(Club, on_delete=models.DO_NOTHING, db_column="ClubID", related_name="+")
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="RequestedBy",
                                     related_name="+")
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, null=True, blank=True,
                                    db_column="ApprovedBy", related_name="+")
    request_date = models.DateTimeField(default=timezone.now, db_column="RequestDate")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_column="Status")
    reason = models.CharField(max_length=1500, null=True, blank=True, db_column="Reason")
    approved_at = models.DateTimeField(null=True, blank=True, db_column="ApprovedAt")

    class Meta:
        managed = False
        db_table = "InventoryRequest"
        ordering = ["-request_date", "-id"]


class InventoryRequestItem(models.Model):
    id = models.AutoField(primary_key=True, db_column="InventoryRequestItemID")
    request = models.ForeignKey(InventoryRequest, on_delete=models.DO_NOTHING, db_column="InventoryRequestID",
                                related_name="items")
    item = models.ForeignKey(InventoryItem, on_delete=models.DO_NOTHING, db_column="InventoryItemID",
                             related_name="+")
    requested_quantity = models.DecimalField(max_digits=12, decimal_places=2, db_column="RequestedQuantity")
    approved_quantity = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True,
                                            db_column="ApprovedQuantity")
    note = models.CharField(max_length=1000, null=True, blank=True, db_column="Note")

    class Meta:
        managed = False
        db_table = "InventoryRequestItem"
        ordering = ["id"]
