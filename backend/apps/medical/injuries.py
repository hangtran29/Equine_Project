"""Persistent 2D markers. Browser demo storage is never read by this API."""
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.access import operational_horse
from apps.core.audit import log_action
from apps.core.locking import horse_serialized
from apps.core.permissions import HasAnyPermission
from apps.core.clubtime import today
from .models import InjuryAssessment, InjuryMarker, MedicalRecord
from .services import ensure_draft_owner

REGIONS = ("head", "neck", "shoulder", "back", "thorax", "abdomen", "hindquarters", "foreleg", "hindleg")
STATUSES = ("treating", "monitoring", "recovered")
VERSION = "equi-horse-photo-v3"


class MarkerInput(serializers.Serializer):
    medicalRecordId = serializers.IntegerField(min_value=1)
    bodyRegion = serializers.ChoiceField(choices=REGIONS)
    bodySide = serializers.ChoiceField(choices=("left", "right"))
    view = serializers.ChoiceField(choices=("left", "right"))
    xRatio = serializers.FloatField(min_value=0, max_value=1)
    yRatio = serializers.FloatField(min_value=0, max_value=1)
    diagramVersion = serializers.ChoiceField(choices=(VERSION,))
    description = serializers.CharField(max_length=1500)
    severity = serializers.ChoiceField(choices=("mild", "moderate", "severe"))
    status = serializers.ChoiceField(choices=STATUSES)
    detectedAt = serializers.DateField()
    notes = serializers.CharField(max_length=2000, allow_blank=True, default="")

    def validate(self, v):
        import math
        if v["bodySide"] != v["view"] or not all(math.isfinite(v[k]) for k in ("xRatio", "yRatio")):
            raise ValidationError("Vị trí hoặc bên cơ thể không hợp lệ.")
        if v["detectedAt"] > today():
            raise ValidationError({"detectedAt": "Ngày phát hiện không sau hôm nay."})
        return v


class AssessmentInput(serializers.Serializer):
    medicalRecordId = serializers.IntegerField(min_value=1)
    date = serializers.DateField()
    status = serializers.ChoiceField(choices=STATUSES)
    comment = serializers.CharField(max_length=1500)


FIELDS = {"bodyRegion": "body_region", "bodySide": "body_side", "view": "view", "xRatio": "x_ratio",
          "yRatio": "y_ratio", "diagramVersion": "diagram_version", "description": "description",
          "severity": "severity", "status": "status", "detectedAt": "detected_at", "notes": "notes"}


def marker_body(m):
    return {"id": str(m.pk), "horseId": str(m.medical_record.horse_id), "medicalRecordId": str(m.medical_record_id),
            **{k: getattr(m, attr) for k, attr in FIELDS.items()},
            "history": [{"id": str(h.pk), "medicalRecordId": str(h.medical_record_id), "date": h.date,
                         "status": h.status, "comment": h.comment, "author": h.author.full_name, "at": h.at}
                        for h in m.history.select_related("author").all()]}


def marker_for(user, marker_id):
    from .views import records_visible_to
    m = InjuryMarker.objects.filter(pk=marker_id, medical_record__in=records_visible_to(user)).first()
    if not m:
        raise NotFound("Không tìm thấy chấn thương.")
    return m


def record_for(horse, user, record_id):
    record = MedicalRecord.objects.select_for_update().filter(pk=record_id, horse=horse).first()
    if not record:
        raise ValidationError({"medicalRecordId": "Phiếu khám không thuộc ngựa này."})
    ensure_draft_owner(record, user)
    return record


@horse_serialized
def save_marker(horse, user, v, marker_id=None):
    record = record_for(horse, user, v["medicalRecordId"])
    m = marker_for(user, marker_id) if marker_id else InjuryMarker(medical_record=record)
    if m.medical_record_id != record.pk:
        raise ValidationError("Không chuyển chấn thương sang bệnh án khác.")
    for key, attr in FIELDS.items():
        setattr(m, attr, v[key])
    m.save()
    log_action(user, "SAVE_INJURY_MARKER", m, {"HorseID": horse.pk, "MedicalRecordID": record.pk})
    return m


class MarkerListView(APIView):
    def get_permissions(self):
        return [HasAnyPermission("MEDICAL_MANAGE" if self.request.method == "POST" else "HORSE_VIEW")()]

    def get(self, request, horse_id):
        from .views import records_visible_to
        horse = operational_horse(request.user, horse_id)
        markers = InjuryMarker.objects.filter(medical_record__in=records_visible_to(request.user).filter(horse=horse))
        return Response([marker_body(m) for m in markers.select_related("medical_record")])

    def post(self, request, horse_id):
        v = MarkerInput(data=request.data)
        v.is_valid(raise_exception=True)
        m = save_marker(operational_horse(request.user, horse_id), request.user, v.validated_data)
        return Response(marker_body(m), status=status.HTTP_201_CREATED)


class MarkerDetailView(APIView):
    permission_classes = [HasAnyPermission("MEDICAL_MANAGE")]

    def patch(self, request, marker_id):
        m = marker_for(request.user, marker_id)
        v = MarkerInput(data=request.data)
        v.is_valid(raise_exception=True)
        return Response(marker_body(save_marker(m.medical_record.horse, request.user, v.validated_data, m.pk)))

    @transaction.atomic
    def delete(self, request, marker_id):
        m = marker_for(request.user, marker_id)
        from apps.horses.models import Horse
        Horse.objects.select_for_update().get(pk=m.medical_record.horse_id)
        record_for(m.medical_record.horse, request.user, m.medical_record_id)
        if m.history.exists():
            raise ValidationError("Chấn thương đã có lịch sử phục hồi; không được xóa.")
        log_action(request.user, "DELETE_INJURY_MARKER", m)
        m.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssessmentView(APIView):
    permission_classes = [HasAnyPermission("MEDICAL_MANAGE")]

    @transaction.atomic
    def post(self, request, marker_id):
        m = marker_for(request.user, marker_id)
        from apps.horses.models import Horse
        Horse.objects.select_for_update().get(pk=m.medical_record.horse_id)
        data = AssessmentInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        record = record_for(m.medical_record.horse, request.user, v["medicalRecordId"])
        if record.pk == m.medical_record_id or record.exam_type != "Follow-up":
            raise ValidationError({"medicalRecordId": "Cần phiếu tái khám riêng của cùng ngựa."})
        last = m.history.order_by("-date", "-id").first()
        if not max(m.detected_at, last.date if last else m.detected_at) <= v["date"] <= today():
            raise ValidationError({"date": "Ngày theo dõi phải từ lần theo dõi gần nhất đến hôm nay."})
        h = InjuryAssessment.objects.create(marker=m, medical_record=record, date=v["date"], status=v["status"],
                                            comment=v["comment"], author=request.user)
        log_action(request.user, "ASSESS_INJURY", m, {"InjuryAssessmentID": h.pk, "MedicalRecordID": record.pk})
        return Response(marker_body(m), status=status.HTTP_201_CREATED)
