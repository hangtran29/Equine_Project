import json
import re
from datetime import date

from rest_framework import serializers

from apps.core import validators

from apps.core.serializers import DBColumnModelSerializer, fmt_datetime
from apps.core.validators import ascii_code

from .documents import content_type, is_upload
from .models import Horse, HorseDocument, ProfileChangeRequest, RegistrationRequest, Stall

# Các trường lý lịch: Owner / Manager được nhập khi hồ sơ còn Draft hoặc Rejected,
# và là các trường được phép xin sửa (ProfileChangeRequest) sau khi đã Approved.
PROFILE_FIELDS = [
    "horse_name", "breed", "date_of_birth", "coat_color", "gender",
    "sire_name", "dam_name", "microchip_number", "passport_number",
]
# Chủ ngựa tự khai về sức khỏe (không bắt buộc, không thuộc lý lịch nên không đi qua yêu cầu sửa hồ sơ)
HEALTH_FIELDS = ["declared_health", "medical_history", "owner_note"]


class OwnerBriefSerializer(serializers.Serializer):
    UserID = serializers.IntegerField(source="id")
    FullName = serializers.CharField(source="full_name")
    Email = serializers.CharField(source="email")
    Phone = serializers.CharField(source="phone", allow_null=True)
    Address = serializers.CharField(source="address", allow_null=True)


class HorseSerializer(DBColumnModelSerializer):
    """
    Ngựa trả về đúng tên cột database, cộng thêm vài thông tin tính sẵn:
      SexClass          Foal / Colt / Filly / Stallion / Mare / Gelding (giống cột tính trong SQL)
      InitialExamSigned true khi Vet đã chốt phiếu khám đầu vào của lần nộp hiện tại
      Owner             thông tin liên hệ chủ ngựa
      CurrentStall      chuồng đang ở (null nếu chưa xếp)
    """

    SexClass = serializers.SerializerMethodField()
    InitialExamSigned = serializers.SerializerMethodField()
    Owner = OwnerBriefSerializer(source="owner", read_only=True)
    CurrentStall = serializers.SerializerMethodField()

    class Meta:
        model = Horse
        fields = [
            "id", "club", "owner", *PROFILE_FIELDS, *HEALTH_FIELDS, "horse_code", "verified_by", "verified_at",
            "registration_status", "current_health_status", "archived_at", "archived_by", "archive_reason", "left_date",
            "created_at", "updated_at", "SexClass", "InitialExamSigned", "Owner", "CurrentStall",
        ]
        read_only_fields = fields

    def get_SexClass(self, obj):
        return obj.sex_class

    def get_InitialExamSigned(self, obj):
        annotated = getattr(obj, "initial_exam_signed", None)
        if annotated is not None:
            return bool(annotated)
        from apps.medical.services import has_signed_initial_exam

        return has_signed_initial_exam(obj)

    def get_CurrentStall(self, obj):
        assignment = obj.stall_assignments.filter(status="Active").select_related("stall").first()
        if not assignment:
            return None
        return {"StallID": assignment.stall_id, "StallNumber": assignment.stall.stall_number,
                "StartDate": assignment.start_date}


class HorseDetailSerializer(HorseSerializer):
    """Chi tiết một ngựa: thêm tóm tắt sức khỏe (lần khám đã chốt gần nhất). Owner chỉ thấy phần tóm tắt này."""

    HealthSummary = serializers.SerializerMethodField()

    class Meta(HorseSerializer.Meta):
        fields = HorseSerializer.Meta.fields + ["HealthSummary"]
        read_only_fields = fields

    def get_HealthSummary(self, obj):
        from apps.medical.services import latest_signed_record

        record = latest_signed_record(obj)
        if record is None:
            return None
        return {
            "MedicalRecordID": record.id,
            "ExamDate": fmt_datetime(record.exam_date),
            "ExamType": record.exam_type,
            "HealthStatus": record.health_status,
            "TrainingEligibility": record.training_eligibility,
            "Conclusion": record.conclusion,
            "RestrictionNote": record.restriction_note,
            "FollowUpDate": record.follow_up_date,
        }


OLDEST_HORSE_YEARS = 40
TEXT_FIELDS = ["horse_name", "sire_name", "dam_name"]
_REQ = {"required": validators.MSG_REQUIRED, "null": validators.MSG_REQUIRED, "blank": validators.MSG_REQUIRED}


def _required_text(_label=None):
    """Bắt buộc gửi; bỏ trống / chỉ khoảng trắng do bộ kiểm tra dùng chung báo bằng câu thống nhất."""
    return {"required": True, "allow_null": False, "allow_blank": True, "trim_whitespace": False,
            "error_messages": _REQ}


class HorseWriteSerializer(DBColumnModelSerializer):
    """
    Tạo / sửa lý lịch ngựa. Body dùng tên cột: {"HorseName": ..., "MicrochipNumber": ...}.
    Mọi trường lý lịch đều bắt buộc. Sai ở đâu thì báo đúng trường đó (apps/core/validators.py):
      MicrochipNumber  15 chữ số, 3 số đầu là mã quốc gia (704 = Việt Nam) hoặc mã nhà sản xuất 900–998
      PassportNumber   số UELN 15 ký tự; gửi NoPassport = true khi ngựa chưa được cấp hộ chiếu
      Breed, CoatColor chọn trong danh mục (apps/core/codes.py) hoặc tự nhập (có chữ cái, tối đa 100 / 50 ký tự)
      DateOfBirth      không sau ngày hiện tại, không quá 40 năm
      SireName / DamName  khác tên ngựa và khác nhau
    """

    NoPassport = serializers.BooleanField(required=False, write_only=True, default=False)

    class Meta:
        model = Horse
        fields = PROFILE_FIELDS + ["NoPassport"]
        extra_kwargs = {
            "horse_name": {**_required_text(), "max_length": None},
            "breed": {"required": True, "allow_null": False, "allow_blank": True, "error_messages": _REQ},
            "coat_color": {"required": True, "allow_null": False, "allow_blank": True, "error_messages": _REQ},
            "sire_name": {**_required_text(), "max_length": None},
            "dam_name": {**_required_text(), "max_length": None},
            "microchip_number": {**_required_text(), "validators": []},   # bộ kiểm tra riêng báo lỗi theo loại
            "passport_number": {"validators": [], "required": False, "allow_null": True, "allow_blank": True,
                                "trim_whitespace": False, "error_messages": _REQ},
            "date_of_birth": {"required": True, "allow_null": False, "error_messages": {
                **_REQ, "invalid": "Ngày không đúng định dạng dd/mm/yyyy."}},
            "gender": {"required": True, "allow_null": False, "allow_blank": False, "error_messages": {
                "required": validators.MSG_SELECT, "null": validators.MSG_SELECT, "blank": validators.MSG_SELECT,
                "invalid_choice": "Lựa chọn không có trong danh mục."}},
        }

    def validate_horse_name(self, value):
        return validators.clean_horse_name(value, "Tên ngựa")

    def validate_sire_name(self, value):
        return validators.clean_horse_name(value, "Tên ngựa bố")

    def validate_dam_name(self, value):
        return validators.clean_horse_name(value, "Tên ngựa mẹ")

    def validate_breed(self, value):
        # hồ sơ cũ có giống ngoài danh mục thì vẫn giữ được khi sửa các ô khác
        if self.instance is not None and value == self.instance.breed:
            return value
        return validators.clean_breed(value)

    def validate_coat_color(self, value):
        if self.instance is not None and value == self.instance.coat_color:
            return value
        return validators.clean_coat_color(value)

    def validate_date_of_birth(self, value):
        return validators.clean_birth_date(value, OLDEST_HORSE_YEARS)

    def _exclude_id(self):
        return self.instance.pk if self.instance is not None else None

    def validate_microchip_number(self, value):
        return validators.clean_microchip(value, exclude_horse_id=self._exclude_id())

    def validate_passport_number(self, value):
        if value in (None, ""):
            return value
        return validators.clean_ueln(value, exclude_horse_id=self._exclude_id())

    def validate(self, attrs):
        no_passport = attrs.pop("NoPassport", False)
        if no_passport:
            attrs["passport_number"] = None
        elif "passport_number" in attrs or self.instance is None:
            if not attrs.get("passport_number"):
                raise serializers.ValidationError({"PassportNumber": [validators.MSG_REQUIRED]})

        def current(attr):
            if attr in attrs:
                return attrs[attr]
            return getattr(self.instance, attr, None) if self.instance is not None else None

        name, sire, dam = (current(a) or "" for a in ("horse_name", "sire_name", "dam_name"))
        errors = {}
        if sire and sire.casefold() == name.casefold():
            errors["SireName"] = ["Tên ngựa bố không được trùng tên chính con ngựa này."]
        if dam and dam.casefold() == name.casefold():
            errors["DamName"] = ["Tên ngựa mẹ không được trùng tên chính con ngựa này."]
        if sire and dam and sire.casefold() == dam.casefold():
            errors.setdefault("DamName", []).append("Tên ngựa bố và ngựa mẹ không được giống nhau.")
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class HorseDraftSerializer(HorseWriteSerializer):
    """Tạo / sửa hồ sơ nháp: lý lịch + 3 ô sức khỏe chủ ngựa tự khai (để trống được)."""

    class Meta(HorseWriteSerializer.Meta):
        fields = HorseWriteSerializer.Meta.fields + HEALTH_FIELDS
        extra_kwargs = {
            **HorseWriteSerializer.Meta.extra_kwargs,
            **{attr: {"required": False, "allow_null": True, "allow_blank": True} for attr in HEALTH_FIELDS},
        }

    def to_internal_value(self, data):
        values = super().to_internal_value(data)
        for attr in HEALTH_FIELDS:
            if attr in values:
                values[attr] = (values[attr] or "").strip() or None
        return values


class HorseCreateSerializer(HorseDraftSerializer):
    """
    Tạo hồ sơ (trạng thái Draft).
      - Owner tự đăng ký: gửi thêm ClubID (CLB muốn gửi ngựa vào). OwnerID = chính mình.
      - Manager nhập hộ: gửi thêm OwnerID (chủ ngựa). ClubID = CLB của Manager.
    """

    ClubID = serializers.IntegerField(required=False, write_only=True)
    OwnerID = serializers.IntegerField(required=False, write_only=True)

    class Meta(HorseDraftSerializer.Meta):
        fields = HorseDraftSerializer.Meta.fields + ["ClubID", "OwnerID"]


class HorseDocumentSerializer(DBColumnModelSerializer):
    """Giấy tờ dạng link ngoài (JSON). File tải lên dùng HorseDocumentUploadSerializer (multipart)."""

    UploadedByName = serializers.CharField(source="uploaded_by.full_name", read_only=True, default=None)

    class Meta:
        model = HorseDocument
        fields = ["id", "horse", "document_name", "document_type", "file_url", "uploaded_by", "UploadedByName",
                  "is_visible_to_owner", "uploaded_at", "is_primary", "is_retired", "is_profile_image", "replaces_document"]
        read_only_fields = ["id", "horse", "uploaded_by", "uploaded_at", "is_primary", "is_retired", "is_profile_image", "replaces_document"]
        extra_kwargs = {"file_url": {"required": True, "allow_null": False}}

    def to_representation(self, instance):
        data = super().to_representation(instance)
        uploaded = is_upload(instance.file_url)
        data["IsUploadedFile"] = uploaded
        if uploaded:
            # không lộ đường dẫn trên ổ đĩa; FE tải file qua API (có kiểm tra quyền)
            data["FileUrl"] = f"/api/horse-documents/{instance.id}/file"
            data["ContentType"] = content_type(instance.file_url)
        return data


class HorseDocumentUploadSerializer(serializers.Serializer):
    """multipart/form-data: File, DocumentType, DocumentName (không bắt buộc), IsVisibleToOwner (Quản lý câu lạc bộ)."""

    File = serializers.FileField(error_messages={"required": "Cần chọn file.", "empty": "File rỗng."})
    DocumentType = serializers.ChoiceField(choices=HorseDocument.DocumentType.choices, error_messages={
        "required": "Cần chọn loại giấy tờ.", "invalid_choice": "Loại giấy tờ không hợp lệ."})
    DocumentName = serializers.CharField(max_length=150, required=False, allow_blank=True)
    IsVisibleToOwner = serializers.BooleanField(required=False, default=True)


class RegistrationRequestSerializer(DBColumnModelSerializer):
    class Meta:
        model = RegistrationRequest
        fields = ["id", "horse", "owner", "club", "request_date", "status", "manager_note",
                  "reviewed_by", "reviewed_at"]
        read_only_fields = fields


class StallSerializer(DBColumnModelSerializer):
    CurrentHorse = serializers.SerializerMethodField()

    class Meta:
        model = Stall
        fields = ["id", "club", "stall_number", "stall_type", "status", "maintenance_until", "CurrentHorse"]
        read_only_fields = fields

    def get_CurrentHorse(self, obj):
        assignment = obj.assignments.filter(status="Active").select_related("horse").first()
        if assignment is None:
            return None
        visible_horse_ids = self.context.get("visible_horse_ids")
        if visible_horse_ids is not None and assignment.horse_id not in visible_horse_ids:
            return None
        return {"HorseID": assignment.horse_id, "HorseName": assignment.horse.horse_name,
                "StartDate": assignment.start_date}


class StallWriteSerializer(DBColumnModelSerializer):
    class Meta:
        model = Stall
        fields = ["stall_number", "stall_type", "status", "maintenance_until"]
        extra_kwargs = {"status": {"required": False}, "maintenance_until": {"required": False, "allow_null": True}}

    def validate_status(self, value):
        if value == Stall.Status.OCCUPIED:
            raise serializers.ValidationError("Occupied do hệ thống tự đặt khi xếp ngựa vào chuồng.")
        return value


class ProfileChangeRequestSerializer(DBColumnModelSerializer):
    """ChangedFields trả về dạng object: {"Reason": "...", "Changes": [{"Field", "OldValue", "NewValue"}]}."""

    ChangedFields = serializers.SerializerMethodField()
    HorseName = serializers.CharField(source="horse.horse_name", read_only=True)
    ReviewedByName = serializers.CharField(source="reviewed_by.full_name", read_only=True, default=None)

    class Meta:
        model = ProfileChangeRequest
        fields = ["id", "horse", "HorseName", "requested_by", "requested_at", "ChangedFields",
                  "evidence_document", "status", "reviewed_by", "ReviewedByName", "reviewed_at", "review_note"]
        read_only_fields = fields

    def get_ChangedFields(self, obj):
        try:
            payload = json.loads(obj.changed_fields)
            payload.pop("Snapshot", None)
            if obj.evidence_document_id and not payload.get("EvidenceDocuments"):
                doc = obj.evidence_document
                if doc.is_visible_to_owner:
                    payload["EvidenceDocuments"] = [{"DocumentID": doc.id, "DocumentName": doc.document_name,
                        "DocumentType": doc.document_type, "IsUploadedFile": is_upload(doc.file_url),
                        "FileUrl": f"/api/horse-documents/{doc.id}/file" if is_upload(doc.file_url) else doc.file_url}]
            for index, item in enumerate(payload.get("Attachments", [])):
                path = item.pop("StoredFile", None)
                if path:
                    item["FileUrl"] = f"/api/profile-change-requests/{obj.id}/attachments/{index}"
            return payload
        except (TypeError, ValueError):
            return obj.changed_fields


class ProfileChangeRequestCreateSerializer(serializers.Serializer):
    """Body: {"Changes": {"CoatColor": "Dark Bay"}, "Reason": "...", "EvidenceDocumentID": 3}"""

    Changes = serializers.DictField(child=serializers.CharField(allow_blank=True, allow_null=True), default=dict)
    Reason = serializers.CharField(max_length=1000)
    EvidenceDocumentID = serializers.IntegerField(required=False, allow_null=True)
    EvidenceDocumentIDs = serializers.ListField(child=serializers.IntegerField(min_value=1), default=list, max_length=20)
    AvatarDocumentID = serializers.IntegerField(required=False, min_value=1)
    RemoveImageIDs = serializers.ListField(child=serializers.IntegerField(min_value=1), default=list, max_length=20)
    Attachments = serializers.ListField(child=serializers.DictField(), default=list)


class ChangeAttachmentSerializer(serializers.Serializer):
    FileKey = serializers.RegexField(r"^file[0-9]+$")
    Purpose = serializers.ChoiceField(choices=["avatar", "image", "evidence", "add", "replace"])
    DocumentName = serializers.CharField(max_length=150)
    DocumentType = serializers.ChoiceField(choices=HorseDocument.DocumentType.choices, default="Other")
    ReplacesDocumentID = serializers.IntegerField(min_value=1, required=False)
    Note = serializers.CharField(max_length=1000, required=False, allow_blank=True)


class ReasonSerializer(serializers.Serializer):
    Reason = serializers.CharField(max_length=1000)


class ArchiveSerializer(ReasonSerializer):
    LeftDate = serializers.DateField(required=False, allow_null=True)   # ngày ngựa rời CLB, mặc định hôm nay


class ApproveSerializer(serializers.Serializer):
    HorseCode = serializers.CharField(max_length=30, required=False, allow_blank=True,   # bỏ trống: tự đánh số EQ-xxx
                                      validators=[ascii_code])
    StallID = serializers.IntegerField(required=False, allow_null=True)
    GroomID = serializers.IntegerField(required=False, allow_null=True)   # Groom phụ trách ngựa (Flow 4)
    ManagerNote = serializers.CharField(max_length=1000, required=False, allow_blank=True)


class ReviewNoteSerializer(serializers.Serializer):
    ReviewNote = serializers.CharField(max_length=1000, required=False, allow_blank=True)
