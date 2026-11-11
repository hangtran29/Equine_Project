from datetime import date

from rest_framework import serializers

from apps.core import validators

from apps.core import flows
from apps.core.serializers import DBColumnModelSerializer

from .models import (
    HorseAssessment, HorseWorkRiderPreference, Specialization, TrainerCredential, TrainerHorseAssignment, TrainerProfile,
    TrainerRaceResult, TrainingPlan, TrainingPlanStage, TrainingPlanTemplate, TrainingPlanTemplateStage, TrainingResult,
    TrainingReview, TrainingSession,
)


def _name(user):
    return user.full_name if user else None


# ---------------------------------------------------------------------------
# Chuyên môn, đánh giá, phân công
# ---------------------------------------------------------------------------
class SpecializationSerializer(DBColumnModelSerializer):
    class Meta:
        model = Specialization
        fields = ["id", "code", "name", "description", "status"]
        read_only_fields = fields


class HorseAssessmentSerializer(DBColumnModelSerializer):
    HeadTrainerName = serializers.CharField(source="head_trainer.full_name", read_only=True)
    SpecializationName = serializers.CharField(source="specialization.name", read_only=True)

    class Meta:
        model = HorseAssessment
        fields = ["id", "horse", "head_trainer", "HeadTrainerName", "specialization", "SpecializationName",
                  "assessment_date", "quality_score", "fitness_level", "assessment_note", "decision_status"]
        read_only_fields = ["id", "horse", "head_trainer", "HeadTrainerName", "SpecializationName",
                            "assessment_date"]

    def validate_quality_score(self, value):
        if value is not None and not (0 <= value <= 100):
            raise serializers.ValidationError("Điểm chất lượng từ 0 đến 100.")
        return value


class TrainerHorseAssignmentSerializer(DBColumnModelSerializer):
    HorseName = serializers.CharField(source="horse.horse_name", read_only=True)
    TrainerName = serializers.CharField(source="trainer.full_name", read_only=True)
    SpecializationName = serializers.CharField(source="specialization.name", read_only=True)
    AssignedByName = serializers.CharField(source="assigned_by.full_name", read_only=True)

    class Meta:
        model = TrainerHorseAssignment
        fields = ["id", "horse", "HorseName", "trainer", "TrainerName", "specialization", "SpecializationName",
                  "assigned_by", "AssignedByName", "assessment", "start_date", "end_date", "status",
                  "assignment_note"]
        read_only_fields = fields


class AssignTrainerSerializer(serializers.Serializer):
    HorseID = serializers.IntegerField()
    TrainerID = serializers.IntegerField()
    SpecializationID = serializers.IntegerField()
    AssessmentID = serializers.IntegerField(required=False, allow_null=True)
    StartDate = serializers.DateField(required=False, allow_null=True)
    AssignmentNote = serializers.CharField(max_length=1000, required=False, allow_blank=True, allow_null=True)


class WorkRiderPreferenceSerializer(DBColumnModelSerializer):
    WorkRiderName = serializers.CharField(source="work_rider.full_name", read_only=True)

    class Meta:
        model = HorseWorkRiderPreference
        fields = ["id", "horse", "work_rider", "WorkRiderName", "assigned_by", "start_date", "end_date",
                  "priority", "is_preferred", "note"]
        read_only_fields = fields


class WorkRiderPreferenceCreateSerializer(serializers.Serializer):
    WorkRiderID = serializers.IntegerField()
    Priority = serializers.IntegerField(min_value=1, default=1)
    StartDate = serializers.DateField(required=False, allow_null=True)
    Note = serializers.CharField(max_length=1000, required=False, allow_blank=True, allow_null=True)


# ---------------------------------------------------------------------------
# Giáo án
# ---------------------------------------------------------------------------
STAGE_FIELDS = ["stage_name", "stage_order", "goal", "start_date", "end_date", "intensity", "training_load",
                "distance_target_km", "surface", "note"]
PLAN_FIELDS = ["goal", "start_date", "end_date", "overall_intensity", "note"]


class TrainingPlanStageSerializer(DBColumnModelSerializer):
    ClosedByName = serializers.CharField(source="closed_by.full_name", read_only=True, default=None)

    class Meta:
        model = TrainingPlanStage
        fields = ["id", "plan", *STAGE_FIELDS, "closed_at", "closed_by", "ClosedByName", "summary_note"]
        read_only_fields = ["id", "plan", "closed_at", "closed_by", "ClosedByName", "summary_note"]
        extra_kwargs = {"stage_order": {"required": False}}

    def validate_stage_order(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("Thứ tự giai đoạn phải lớn hơn 0.")
        return value

    def validate(self, attrs):
        for name in ("training_load", "distance_target_km"):
            if attrs.get(name) is not None and attrs[name] < 0:
                raise serializers.ValidationError({self.fields_by_attr(name): ["Không được âm."]})
        return attrs

    def fields_by_attr(self, attr):
        return next((key for key, field in self.fields.items() if field.source == attr), attr)


class TrainingPlanSerializer(DBColumnModelSerializer):
    """Giáo án kèm thông tin ngựa, huấn luyện viên và các giai đoạn."""

    HorseID = serializers.IntegerField(source="assignment.horse_id", read_only=True)
    HorseName = serializers.CharField(source="assignment.horse.horse_name", read_only=True)
    TrainerID = serializers.IntegerField(source="assignment.trainer_id", read_only=True)
    TrainerName = serializers.CharField(source="assignment.trainer.full_name", read_only=True)
    HorseCode = serializers.CharField(source="assignment.horse.horse_code", read_only=True)
    SpecializationID = serializers.IntegerField(source="assignment.specialization_id", read_only=True)
    SpecializationName = serializers.CharField(source="assignment.specialization.name", read_only=True)
    ApprovedByName = serializers.CharField(source="approved_by.full_name", read_only=True, default=None)
    Stages = TrainingPlanStageSerializer(source="stages", many=True, read_only=True)
    TemplateName = serializers.CharField(source="template.template_name", read_only=True, default=None)

    class Meta:
        model = TrainingPlan
        fields = ["id", "assignment", "HorseID", "HorseName", "HorseCode", "TrainerID", "TrainerName",
                  "SpecializationID", "SpecializationName", *PLAN_FIELDS, "status",
                  "created_at", "submitted_at", "approved_by", "ApprovedByName", "approved_at", "review_note",
                  "template", "TemplateName", "Stages"]
        read_only_fields = fields


class TrainingPlanWriteSerializer(DBColumnModelSerializer):
    class Meta:
        model = TrainingPlan
        fields = PLAN_FIELDS


class TrainingPlanCreateSerializer(TrainingPlanWriteSerializer):
    """Body: {"HorseID": 1, "Goal": ..., "StartDate": ..., "Stages": [{"StageName": ..., "StartDate": ...}]}"""

    HorseID = serializers.IntegerField(write_only=True)
    Stages = TrainingPlanStageSerializer(many=True, required=False)

    class Meta(TrainingPlanWriteSerializer.Meta):
        fields = PLAN_FIELDS + ["HorseID", "Stages"]
        extra_kwargs = {"goal": {"required": True, "allow_blank": False, "allow_null": False}}   # Mục tiêu bắt buộc


class NoteSerializer(serializers.Serializer):
    ReviewNote = serializers.CharField(max_length=1000, required=False, allow_blank=True, allow_null=True)


class ReasonOptionalSerializer(serializers.Serializer):
    Reason = serializers.CharField(max_length=1000, required=False, allow_blank=True, allow_null=True)


class StageCloseSerializer(serializers.Serializer):
    SummaryNote = serializers.CharField(max_length=2000, required=False, allow_blank=True, allow_null=True)


# ---------------------------------------------------------------------------
# Buổi tập
# ---------------------------------------------------------------------------
SESSION_FIELDS = ["session_date", "start_time", "end_time", "sequence_no", "training_type",
                  "duration_planned_minutes", "distance_planned_km", "target_speed_kmh", "training_load", "surface",
                  "location", "instructions"]
RESULT_FIELDS = ["actual_duration_minutes", "actual_distance_km", "avg_speed_kmh", "max_speed_kmh",
                 "avg_heart_rate", "max_heart_rate", "recovery_minutes", "performance_score", "rider_observation",
                 "video_url", "early_end_reason", "early_end_note"]
# Ô bắt buộc khi Kỵ sĩ tập luyện ghi kết quả (KS03)
RESULT_REQUIRED = {"actual_duration_minutes": "ActualDurationMinutes", "actual_distance_km": "ActualDistanceKm",
                   "performance_score": "PerformanceScore", "avg_speed_kmh": "AvgSpeedKmh",
                   "max_speed_kmh": "MaxSpeedKmh", "recovery_minutes": "RecoveryMinutes"}
EARLY_END_TOLERANCE_MINUTES = 5   # ngắn hơn dự kiến quá 5 phút thì tính là kết thúc sớm, phải ghi lý do


class TrainingResultSerializer(DBColumnModelSerializer):
    """
    Kết quả buổi tập. context["session"] (buổi tập đang ghi) dùng để nhận biết kết thúc sớm:
    thời lượng thực tế ngắn hơn dự kiến quá 5 phút thì bắt buộc EarlyEndReason, EarlyEndNote và EndTime.
    """

    EndTime = serializers.TimeField(required=False, allow_null=True, write_only=True,
                                    error_messages={"invalid": "Giờ không đúng định dạng HH:mm."})
    _NUM = {"invalid": "Giá trị phải là số.", "max_string_length": "Giá trị quá dài.",
            "max_digits": "Giá trị vượt quá giới hạn cho phép.", "max_decimal_places": "Giá trị có quá nhiều chữ số thập phân.",
            "max_whole_digits": "Giá trị vượt quá giới hạn cho phép."}

    class Meta:
        model = TrainingResult
        fields = ["id", "session", *RESULT_FIELDS, "substitute_observation", "recorded_at", "EndTime"]
        read_only_fields = ["id", "session", "substitute_observation", "recorded_at"]
        extra_kwargs = {
            "rider_observation": {"trim_whitespace": False, "allow_blank": True, "allow_null": True, "max_length": None},
            "early_end_note": {"trim_whitespace": False, "allow_blank": True, "allow_null": True, "max_length": None},
        }

    def get_fields(self):
        fields = super().get_fields()
        for field in fields.values():
            if isinstance(field, (serializers.IntegerField, serializers.DecimalField)):
                field.error_messages.update(self._NUM)
        return fields

    def validate(self, attrs):
        errors = {}

        def need(attr, key):
            if attrs.get(attr) is None:
                errors[key] = [validators.MSG_REQUIRED]
                return False
            return True

        for attr, key in RESULT_REQUIRED.items():
            need(attr, key)

        def in_range(attr, key, low, high, message):
            value = attrs.get(attr)
            if value is not None and not (low <= value <= high) and key not in errors:
                errors[key] = [message]

        in_range("actual_duration_minutes", "ActualDurationMinutes", 1, 600, "Thời lượng phải từ 1 đến 600 phút.")
        in_range("actual_distance_km", "ActualDistanceKm", 0, 100, "Quãng đường phải từ 0 đến 100 km.")
        in_range("performance_score", "PerformanceScore", 0, 100, "Điểm từ 0 đến 100.")
        in_range("avg_speed_kmh", "AvgSpeedKmh", 0, 90, "Tốc độ phải từ 0 đến 90 km/h.")
        in_range("max_speed_kmh", "MaxSpeedKmh", 0, 90, "Tốc độ phải từ 0 đến 90 km/h.")
        in_range("recovery_minutes", "RecoveryMinutes", 0, 240, "Thời gian hồi phục phải từ 0 đến 240 phút.")
        in_range("avg_heart_rate", "AvgHeartRate", 20, 300, "Nhịp tim phải từ 20 đến 300 lần/phút.")
        in_range("max_heart_rate", "MaxHeartRate", 20, 300, "Nhịp tim phải từ 20 đến 300 lần/phút.")
        avg, top = attrs.get("avg_speed_kmh"), attrs.get("max_speed_kmh")
        if avg is not None and top is not None and top < avg and "MaxSpeedKmh" not in errors:
            errors["MaxSpeedKmh"] = ["Tốc độ tối đa không được nhỏ hơn tốc độ trung bình."]
        avg, top = attrs.get("avg_heart_rate"), attrs.get("max_heart_rate")
        if avg is not None and top is not None and top < avg and "MaxHeartRate" not in errors:
            errors["MaxHeartRate"] = ["Nhịp tim tối đa không được nhỏ hơn nhịp tim trung bình."]
        try:
            attrs["rider_observation"] = validators.clean_text(attrs.get("rider_observation"), 2000)
        except serializers.ValidationError as exc:
            errors["RiderObservation"] = exc.detail

        session = self.context.get("session")
        planned = getattr(session, "duration_planned_minutes", None)
        actual = attrs.get("actual_duration_minutes")
        end_time = attrs.pop("EndTime", None)
        early = planned is not None and actual is not None and actual < planned - EARLY_END_TOLERANCE_MINUTES
        if early:
            reason = attrs.get("early_end_reason")
            if not reason:
                errors["EarlyEndReason"] = [validators.MSG_SELECT]
            elif reason not in TrainingResult.EARLY_END_REASONS:
                errors["EarlyEndReason"] = ["Lựa chọn không có trong danh mục."]
            try:
                attrs["early_end_note"] = validators.clean_text(attrs.get("early_end_note"), 1000)
            except serializers.ValidationError as exc:
                errors["EarlyEndNote"] = exc.detail
            if end_time is None:
                errors["EndTime"] = [validators.MSG_REQUIRED]
            elif session is not None and end_time < session.start_time:
                errors["EndTime"] = ["Giờ kết thúc không được trước giờ bắt đầu."]
            attrs["_end_time"] = end_time
        else:
            attrs["early_end_reason"] = None
            attrs["early_end_note"] = None
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class TrainingReviewSerializer(DBColumnModelSerializer):
    TrainerName = serializers.CharField(source="trainer.full_name", read_only=True)
    HorseID = serializers.IntegerField(source="session.stage.plan.assignment.horse_id", read_only=True)
    HorseName = serializers.CharField(source="session.stage.plan.assignment.horse.horse_name", read_only=True)
    SessionDate = serializers.DateField(source="session.session_date", read_only=True)
    TrainingPlanID = serializers.IntegerField(source="session.stage.plan_id", read_only=True)

    class Meta:
        model = TrainingReview
        fields = ["id", "session", "HorseID", "HorseName", "SessionDate", "TrainingPlanID", "trainer", "TrainerName", "review_date",
                  "evaluation", "trainer_comment", "adjustment_required", "adjustment_note"]
        read_only_fields = ["id", "session", "HorseID", "HorseName", "SessionDate", "TrainingPlanID", "trainer", "TrainerName",
                            "review_date"]


class TrainingSessionSerializer(DBColumnModelSerializer):
    """
    Buổi tập kèm thông tin tính sẵn (giống view vw_WorkRiderDailySchedule):
    HorseID, HorseName, TrainingPlanID, AssignedTrainerID, SupervisingTrainerID, IsSubstitute, Result, Review.
    """

    HorseID = serializers.IntegerField(source="stage.plan.assignment.horse_id", read_only=True)
    HorseName = serializers.CharField(source="stage.plan.assignment.horse.horse_name", read_only=True)
    HorseCode = serializers.CharField(source="stage.plan.assignment.horse.horse_code", read_only=True)
    TrainingPlanID = serializers.IntegerField(source="stage.plan_id", read_only=True)
    StageName = serializers.CharField(source="stage.stage_name", read_only=True)
    StageOrder = serializers.IntegerField(source="stage.stage_order", read_only=True)
    WorkRiderName = serializers.CharField(source="work_rider.full_name", read_only=True)
    AssignedTrainerID = serializers.IntegerField(source="stage.plan.assignment.trainer_id", read_only=True)
    AssignedTrainerName = serializers.CharField(source="stage.plan.assignment.trainer.full_name", read_only=True)
    SupervisingTrainerID = serializers.SerializerMethodField()
    SupervisingTrainerName = serializers.SerializerMethodField()
    IsSubstitute = serializers.SerializerMethodField()
    Result = serializers.SerializerMethodField()
    Review = serializers.SerializerMethodField()
    IsStopped = serializers.SerializerMethodField()
    EndReason = serializers.SerializerMethodField()

    class Meta:
        model = TrainingSession
        fields = ["id", "stage", "TrainingPlanID", "StageName", "StageOrder", "HorseID", "HorseName", "HorseCode", "work_rider",
                  "WorkRiderName", "assigned_by", "substitute_trainer", "AssignedTrainerID", "AssignedTrainerName",
                  "SupervisingTrainerID", "SupervisingTrainerName", "IsSubstitute", *SESSION_FIELDS, "status",
                  "Result", "Review", "IsStopped", "EndReason"]
        read_only_fields = fields

    def get_SupervisingTrainerID(self, obj):
        return obj.supervising_trainer_id

    def get_SupervisingTrainerName(self, obj):
        return _name(obj.substitute_trainer) or _name(obj.stage.plan.assignment.trainer)

    def get_IsSubstitute(self, obj):
        return obj.substitute_trainer_id is not None

    def get_Result(self, obj):
        try:
            return TrainingResultSerializer(obj.result).data
        except TrainingResult.DoesNotExist:
            return None

    def get_Review(self, obj):
        review = obj.reviews.first()
        return TrainingReviewSerializer(review).data if review else None

    def _end(self, obj):
        """(ActionType, Reason) của lần dừng / hủy / đánh vắng; danh sách truyền sẵn qua context để khỏi truy vấn từng dòng."""
        if obj.status not in ("Cancelled", "Missed"):
            return None, None
        reasons = self.context.get("end_reasons")
        if reasons is None:
            from .summaries import end_reasons
            reasons = end_reasons([obj.pk])
        return reasons.get(obj.pk, (None, None))

    def get_IsStopped(self, obj):
        return self._end(obj)[0] == "STOP_TRAINING_SESSION"

    def get_EndReason(self, obj):
        return self._end(obj)[1]


class TrainingSessionWriteSerializer(DBColumnModelSerializer):
    """
    Head Trainer xếp / sửa buổi tập.
    Body: {"TrainingPlanStageID": 3, "WorkRiderID": 9, "SubstituteTrainerID": null, "SessionDate": "2026-10-12",
           "StartTime": "06:00", "TrainingType": "Canter", "TrainingLoad": 40, ...}
    SequenceNo bỏ trống = tự lấy thứ tự tiếp theo trong ngày của Work Rider.
    """

    TrainingPlanStageID = serializers.PrimaryKeyRelatedField(source="stage", queryset=TrainingPlanStage.objects.all())
    WorkRiderID = serializers.IntegerField(source="work_rider_id")
    SubstituteTrainerID = serializers.IntegerField(source="substitute_trainer_id", required=False, allow_null=True)

    class Meta:
        model = TrainingSession
        fields = ["TrainingPlanStageID", "WorkRiderID", "SubstituteTrainerID", *SESSION_FIELDS]
        extra_kwargs = {"sequence_no": {"required": False}}

    def validate(self, attrs):
        if attrs.get("sequence_no") is not None and attrs["sequence_no"] <= 0:
            raise serializers.ValidationError({"SequenceNo": ["Phải lớn hơn 0."]})
        if attrs.get("duration_planned_minutes") is not None and attrs["duration_planned_minutes"] <= 0:
            raise serializers.ValidationError({"DurationPlannedMinutes": ["Phải lớn hơn 0."]})
        for attr, key in (("distance_planned_km", "DistancePlannedKm"), ("training_load", "TrainingLoad")):
            if attrs.get(attr) is not None and attrs[attr] < 0:
                raise serializers.ValidationError({key: ["Không được âm."]})
        return attrs


class StopSessionSerializer(serializers.Serializer):
    """Dừng buổi tập; có Flow 3 thì báo luôn được sự cố sức khỏe (vào hàng chờ bác sĩ thú y)."""

    Reason = serializers.CharField(max_length=1000)
    if flows.has_flow3():
        ReportHealth = serializers.BooleanField(default=False)
        Severity = serializers.ChoiceField(choices=["Urgent", "Normal"], default="Urgent")
        Description = serializers.CharField(max_length=2500, required=False, allow_blank=True)


class SubstituteObservationSerializer(serializers.Serializer):
    SubstituteObservation = serializers.CharField(max_length=2000)


def _not_future(value, message):
    if value is not None and value > date.today():
        raise serializers.ValidationError(message)
    return value


class TrainerProfileWriteSerializer(DBColumnModelSerializer):
    """
    PATCH /api/trainers/<UserID>/profile - Head Trainer / Manager cập nhật hồ sơ trainer.
    Body ví dụ: {"CareerStartDate": "2013-06-01", "TrainerRating": 4.6}
    """

    class Meta:
        model = TrainerProfile
        fields = ["career_start_date", "trainer_rating"]
        extra_kwargs = {field: {"required": False} for field in fields}

    def validate_career_start_date(self, value):
        if value is not None and value < date(1950, 1, 1):
            raise serializers.ValidationError("Ngày bắt đầu làm nghề không hợp lệ.")
        return _not_future(value, "Ngày bắt đầu làm nghề không được ở tương lai.")

    def validate_trainer_rating(self, value):
        if value is not None and not 0 <= value <= 5:
            raise serializers.ValidationError("Điểm đánh giá huấn luyện viên phải từ 0 đến 5.")
        return value


class TrainerCredentialSerializer(DBColumnModelSerializer):
    """
    Bằng cấp / chứng chỉ / giấy phép / bằng khen. Body ví dụ:
    {"CredentialType": "License", "Title": "Giấy phép huấn luyện ngựa đua hạng A", "IssuedBy": "...",
     "IssuedDate": "2014-03-10", "ExpiryDate": null, "FileUrl": "https://drive.google.com/..."}
    """

    CreatedByName = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = TrainerCredential
        fields = ["id", "trainer", "credential_type", "title", "issued_by", "issued_date", "expiry_date", "file_url",
                  "note", "created_by", "CreatedByName", "created_at"]
        read_only_fields = ["id", "trainer", "created_by", "CreatedByName", "created_at"]

    def validate_issued_date(self, value):
        return _not_future(value, "Ngày cấp không được ở tương lai.")

    def validate(self, attrs):
        if attrs.get("expiry_date") and attrs["expiry_date"] < attrs["issued_date"]:
            raise serializers.ValidationError({"ExpiryDate": ["Ngày hết hạn phải sau ngày cấp."]})
        return attrs


class TrainerRaceResultSerializer(DBColumnModelSerializer):
    """
    Một lần ngựa của trainer ra đường đua. Body ví dụ:
    {"RaceDate": "2026-09-14", "RaceName": "Cúp Mùa Thu", "RaceClass": "Group 3", "HorseID": 3,
     "FinishPosition": 1, "FieldSize": 12}
    Ngựa ngoài CLB: bỏ HorseID, gửi "HorseName".
    """

    class Meta:
        model = TrainerRaceResult
        fields = ["id", "trainer", "horse", "horse_name", "race_date", "race_name", "race_class", "finish_position",
                  "field_size", "note", "created_by", "created_at"]
        read_only_fields = ["id", "trainer", "created_by", "created_at"]
        extra_kwargs = {"horse_name": {"required": False}, "horse": {"required": False}}

    def validate_race_date(self, value):
        return _not_future(value, "Ngày đua không được ở tương lai.")

    def validate(self, attrs):
        size, position = attrs.get("field_size"), attrs.get("finish_position")
        if size is not None and size < 2:
            raise serializers.ValidationError({"FieldSize": ["Một cuộc đua có ít nhất 2 ngựa."]})
        if position is not None and size is not None and not 1 <= position <= size:
            raise serializers.ValidationError({"FinishPosition": ["Thứ hạng phải từ 1 đến số ngựa tham gia (FieldSize)."]})
        if not attrs.get("horse") and not (attrs.get("horse_name") or "").strip():
            raise serializers.ValidationError({"HorseName": ["Vui lòng chọn ngựa trong câu lạc bộ hoặc nhập tên ngựa."]})
        return attrs


class TrainerSpecializationSerializer(serializers.Serializer):
    SpecializationID = serializers.IntegerField()


# ---------------------------------------------------------------------------
# Giáo án mẫu
# ---------------------------------------------------------------------------
TEMPLATE_STAGE_FIELDS = ["stage_order", "stage_name", "goal", "start_day", "duration_days", "intensity", "training_load",
                         "distance_target_km", "surface", "note", "exit_criteria"]
TEMPLATE_FIELDS = ["template_name", "goal", "duration_days", "overall_intensity", "daily_structure", "weekly_pattern",
                   "note", "is_active"]


class TrainingPlanTemplateStageSerializer(DBColumnModelSerializer):
    class Meta:
        model = TrainingPlanTemplateStage
        fields = ["id", *TEMPLATE_STAGE_FIELDS]
        read_only_fields = ["id"]

    def validate(self, attrs):
        for name in ("training_load", "distance_target_km"):
            if attrs.get(name) is not None and attrs[name] < 0:
                raise serializers.ValidationError({name: ["Không được âm."]})
        return attrs


class TrainingPlanTemplateSerializer(DBColumnModelSerializer):
    SpecializationName = serializers.CharField(source="specialization.name", read_only=True)
    SpecializationCode = serializers.CharField(source="specialization.code", read_only=True)
    UpdatedByName = serializers.CharField(source="updated_by.full_name", read_only=True, default=None)
    Stages = TrainingPlanTemplateStageSerializer(source="stages", many=True, read_only=True)

    class Meta:
        model = TrainingPlanTemplate
        fields = ["id", "club", "specialization", "SpecializationName", "SpecializationCode", *TEMPLATE_FIELDS,
                  "updated_by", "UpdatedByName", "updated_at", "Stages"]
        read_only_fields = fields


class TrainingPlanTemplateWriteSerializer(DBColumnModelSerializer):
    """PUT / PATCH /api/training-plan-templates/<id>: thông tin chung (+ Stages thì thay toàn bộ giai đoạn)."""

    Stages = TrainingPlanTemplateStageSerializer(many=True, required=False)

    class Meta:
        model = TrainingPlanTemplate
        fields = [*TEMPLATE_FIELDS, "Stages"]


class RescheduleSerializer(serializers.Serializer):
    StartDate = serializers.DateField()


class FromTemplateSerializer(serializers.Serializer):
    HorseID = serializers.IntegerField()

