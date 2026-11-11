from apps.core.clubtime import now as club_now, today as club_today
from datetime import date

from rest_framework import serializers

from apps.core import flows
from apps.core.serializers import DBColumnModelSerializer

from .models import (
    HealthReport, HealthReportNote, MedicalRecord, MedicalRecordAmendment, MedicalSchedule, TrainingLock, Treatment,
    Vaccination, VetDutyShift,
)

# Có Flow 2 thì báo cáo sức khỏe gắn được với buổi tập (TrainingSessionID)
SESSION_FIELD = ["training_session"] if flows.has_training() else []

EXAM_FIELDS = ["exam_date", "weight_kg", "height_cm", "body_temperature_c", "heart_rate_bpm", "respiratory_rate", "symptoms", "diagnosis", "conclusion", "injury_location",
               "treatment_plan", "health_status", "training_eligibility", "restriction_note", "follow_up_date", "follow_up_lock", "note"]

class MedicalRecordSerializer(DBColumnModelSerializer):
    """Phiếu khám: trả về đúng tên cột MedicalRecord, thêm VetName và HorseName để hiển thị."""

    VetName = serializers.CharField(source="vet.full_name", read_only=True)
    HorseName = serializers.CharField(source="horse.horse_name", read_only=True)

    class Meta:
        model = MedicalRecord
        fields = ["id", "horse", "HorseName", "vet", "VetName", "registration_request", "training_session_id",
                  "exam_type", *EXAM_FIELDS, "record_status", "signed_at"]
        read_only_fields = fields


class MedicalRecordWriteSerializer(DBColumnModelSerializer):
    """
    Tạo / sửa phiếu khám (Draft).
    Body ví dụ: {"ExamType": "Initial Exam", "WeightKg": 480.5, "HeightCm": 162, "Symptoms": "...",
                 "HealthStatus": "Healthy", "TrainingEligibility": "Eligible", "Conclusion": "..."}
    ExamDate bỏ trống = thời điểm hiện tại.
    Khám ngựa đã tiếp nhận (Flow 3) gửi thêm được "HealthReportID" (báo cáo đang xử lý) và "TrainingSessionID".
    """

    HealthReportID = serializers.IntegerField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = MedicalRecord
        fields = ["exam_type", *EXAM_FIELDS, "training_session_id", "HealthReportID"]
        extra_kwargs = {"exam_date": {"required": False}}

    def validate_exam_type(self, value):
        if value != MedicalRecord.ExamType.INITIAL and not flows.has_flow3():
            from apps.core.exceptions import BusinessRuleError
            raise BusinessRuleError("Hệ thống hiện chỉ hỗ trợ phiếu khám lâm sàng nhập đàn.", "EXAM_TYPE_UNAVAILABLE")
        return value

    def validate_weight_kg(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("Cân nặng phải lớn hơn 0.")
        return value

    def validate_height_cm(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("Chiều cao phải lớn hơn 0.")
        return value

    def validate_body_temperature_c(self, value):
        if value is not None and not 30 <= value <= 45:
            raise serializers.ValidationError("Thân nhiệt phải trong khoảng 30–45 °C.")
        return value

    def validate_heart_rate_bpm(self, value):
        if value is not None and not 10 <= value <= 250:
            raise serializers.ValidationError("Nhịp tim phải trong khoảng 10–250 lần/phút.")
        return value

    def validate_respiratory_rate(self, value):
        if value is not None and not 2 <= value <= 150:
            raise serializers.ValidationError("Nhịp thở phải trong khoảng 2–150 lần/phút.")
        return value

    def validate(self, attrs):
        exam_date = attrs.get("exam_date") or getattr(self.instance, "exam_date", None)
        follow_up = attrs.get("follow_up_date", getattr(self.instance, "follow_up_date", None))
        exam_day = exam_date.date() if exam_date else club_today()
        if follow_up and follow_up < exam_day:
            raise serializers.ValidationError({"FollowUpDate": ["Ngày tái khám không được trước ngày khám."]})
        return attrs


class MedicalRecordAmendmentSerializer(DBColumnModelSerializer):
    AmendedByName = serializers.CharField(source="amended_by.full_name", read_only=True)

    class Meta:
        model = MedicalRecordAmendment
        fields = ["id", "medical_record", "amended_by", "AmendedByName", "amended_at", "reason", "amended_content"]
        read_only_fields = ["id", "medical_record", "amended_by", "AmendedByName", "amended_at"]


class TrainingLockSerializer(DBColumnModelSerializer):
    HorseName = serializers.CharField(source="horse.horse_name", read_only=True)
    CreatedByName = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = TrainingLock
        fields = ["id", "horse", "HorseName", "created_by", "CreatedByName", "reason", "lock_level", "max_intensity",
                  "lock_start_date", "lock_end_date", "lock_status", "details", "released_by", "released_at"]
        read_only_fields = fields


class TrainingLockWriteSerializer(DBColumnModelSerializer):
    """Body: {"Reason": "Viêm gân", "LockLevel": "Restricted", "MaxIntensity": 30, "LockEndDate": "...", "Details": "..."}"""

    class Meta:
        model = TrainingLock
        fields = ["reason", "lock_level", "max_intensity", "lock_start_date", "lock_end_date", "details"]
        extra_kwargs = {"lock_start_date": {"required": False}}

    def validate_max_intensity(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Không được âm.")
        return value


class SignSerializer(serializers.Serializer):
    """Body tùy chọn khi chốt phiếu khám: {"TrainingLock": {...}}"""

    TrainingLock = TrainingLockWriteSerializer(required=False, allow_null=True)


class TreatmentSerializer(DBColumnModelSerializer):
    WithdrawalActive = serializers.SerializerMethodField()

    class Meta:
        model = Treatment
        fields = ["id", "medical_record", "medicine_name", "dose", "route", "start_date", "end_date",
                  "withdrawal_until", "note", "WithdrawalActive"]
        read_only_fields = ["id", "medical_record", "WithdrawalActive"]

    def get_WithdrawalActive(self, obj):
        """true = còn trong thời gian ngưng thuốc (chưa được thi đấu / kiểm tra doping)."""
        return bool(obj.withdrawal_until and obj.withdrawal_until >= club_today())


class VaccinationSerializer(DBColumnModelSerializer):
    HorseName = serializers.CharField(source="horse.horse_name", read_only=True)
    VetName = serializers.CharField(source="vet.full_name", read_only=True, default=None)
    IsOverdue = serializers.SerializerMethodField()
    ExternalVet = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = Vaccination
        fields = ["id", "horse", "HorseName", "vet", "VetName", "vaccine_name", "vaccination_date", "next_due_date",
                  "status", "note", "IsOverdue", "ExternalVet"]
        read_only_fields = ["id", "horse", "HorseName", "vet", "VetName", "IsOverdue"]

    def get_IsOverdue(self, obj):
        return obj.status == "Overdue" or obj.status == "Scheduled" and obj.vaccination_date < club_today()


class MedicalScheduleSerializer(DBColumnModelSerializer):
    HorseName = serializers.CharField(source="horse.horse_name", read_only=True)
    VetName = serializers.CharField(source="vet.full_name", read_only=True, default=None)
    IsOverdue = serializers.SerializerMethodField()
    ExternalVet = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = MedicalSchedule
        fields = ["id", "horse", "HorseName", "vet", "VetName", "schedule_type", "scheduled_date", "status", "note",
                  "IsOverdue", "ExternalVet"]
        read_only_fields = ["id", "horse", "HorseName", "vet", "VetName", "IsOverdue"]

    def get_IsOverdue(self, obj):
        return obj.status == "Overdue" or obj.status == "Scheduled" and obj.scheduled_date < club_today()


class HealthReportNoteSerializer(DBColumnModelSerializer):
    NoteByName = serializers.CharField(source="note_by.full_name", read_only=True)

    class Meta:
        model = HealthReportNote
        fields = ["id", "report", "note_by", "NoteByName", "note_at", "content"]
        read_only_fields = ["id", "report", "note_by", "NoteByName", "note_at"]


class HealthReportSerializer(DBColumnModelSerializer):
    HorseName = serializers.CharField(source="horse.horse_name", read_only=True)
    ReportedByName = serializers.CharField(source="reported_by.full_name", read_only=True)
    ReportedByRoles = serializers.SerializerMethodField()
    VetName = serializers.CharField(source="vet.full_name", read_only=True, default=None)
    Notes = HealthReportNoteSerializer(source="notes", many=True, read_only=True)
    Attachments = serializers.SerializerMethodField()

    class Meta:
        model = HealthReport
        fields = ["id", "horse", "HorseName", "reported_by", "ReportedByName", "ReportedByRoles", *SESSION_FIELD,
                  "reported_at", "severity", "description", "image_url", "status", "vet", "VetName",
                  "medical_record", "vet_note", "resolved_at", "Notes", "Attachments"]
        read_only_fields = fields

    def get_ReportedByRoles(self, obj):
        return sorted(obj.reported_by.role_codes)

    def get_Attachments(self, obj):
        return [{"AttachmentID": a.pk, "FilePath": f"/health-report-attachments/{a.pk}/file"} for a in obj.attachments.all()]


class HealthReportCreateSerializer(DBColumnModelSerializer):
    """Body: {"Severity": "Urgent", "Description": "Chân trước trái sưng nóng", "ImageUrl": null, "TrainingSessionID": 12}"""

    AttachmentIDs = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False, max_length=8)

    class Meta:
        model = HealthReport
        fields = ["severity", "description", "image_url", *SESSION_FIELD, "AttachmentIDs"]

    def validate_image_url(self, value):
        if value:
            raise serializers.ValidationError("Hãy tải ảnh lên qua API đính kèm; không nhận đường dẫn file từ trình duyệt.")
        return value


class ContentSerializer(serializers.Serializer):
    Content = serializers.CharField(max_length=2000)
    Severity = serializers.ChoiceField(choices=["Normal", "Urgent"], required=False)
    AttachmentIDs = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False, max_length=8)


class ResolveReportSerializer(serializers.Serializer):
    VetNote = serializers.CharField(max_length=2000, required=False, allow_blank=True, allow_null=True)
    MedicalRecordID = serializers.IntegerField(required=False, allow_null=True)


class ReleaseLockSerializer(serializers.Serializer):
    Note = serializers.CharField(max_length=1000, required=False, allow_blank=True, allow_null=True)
    FollowUpMedicalRecordID = serializers.IntegerField(required=False, min_value=1)


class VetDutyShiftSerializer(DBColumnModelSerializer):
    """Ca trực của bác sĩ thú y (Flow 1)."""

    VetName = serializers.CharField(source="vet.full_name", read_only=True)
    CreatedByName = serializers.CharField(source="created_by.full_name", read_only=True)
    IsOnDutyNow = serializers.SerializerMethodField()

    class Meta:
        model = VetDutyShift
        fields = ["id", "vet", "VetName", "duty_date", "shift", "note", "created_by", "CreatedByName", "created_at",
                  "IsOnDutyNow"]
        read_only_fields = ["id", "VetName", "created_by", "CreatedByName", "created_at", "IsOnDutyNow"]

    def get_IsOnDutyNow(self, obj):
        from .duty import _local_now, shift_covers

        return shift_covers(obj.shift, obj.duty_date, _local_now())


class VetDutyShiftWriteSerializer(serializers.Serializer):
    VetID = serializers.IntegerField()
    DutyDate = serializers.DateField()
    Shift = serializers.ChoiceField(choices=VetDutyShift.Shift.choices)
    Note = serializers.CharField(max_length=500, required=False, allow_blank=True)
