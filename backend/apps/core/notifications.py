"""
GET /api/notifications - danh sách "việc cần chú ý" của người đang đăng nhập.

Database không có bảng thông báo, nên danh sách này được TÍNH từ dữ liệu hiện tại mỗi lần gọi
(không có trạng thái đã đọc). Frontend gọi khi mở trang / định kỳ để hiện chuông thông báo.

Flow 1: hồ sơ chờ xác minh/tiếp nhận, khám đầu vào, phiếu nháp và yêu cầu sửa lý lịch.
Flow 2 (khi có apps/training): giáo án chờ duyệt / bị trả về, buổi tập hôm nay, buổi tập chờ đánh giá.
Flow 3: báo cáo sức khỏe chưa xử lý, tiêm phòng / lịch y tế sắp tới.
Flow 4: khẩu phần chờ duyệt / bị trả về, việc chăm sóc tới hạn, yêu cầu vật tư, vật tư sắp hết.
"""
from datetime import date, timedelta

from django.db.models import Exists, OuterRef
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import flows
from .i18n import is_english, translate_text
from .serializers import fmt_datetime


def _item(kind, title, entity, entity_id, horse=None, at=None, urgent=False, message=None):
    return {
        "Type": kind,
        "Priority": "High" if urgent else "Normal",
        "Title": title,
        "Message": message,
        "EntityName": entity,
        "EntityID": entity_id,
        "HorseID": horse.id if horse else None,
        "HorseName": horse.horse_name if horse else None,
        "At": fmt_datetime(at) if hasattr(at, "hour") else (at.isoformat() if at else None),
    }


def build_notifications(user):
    from apps.horses.models import Horse, ProfileChangeRequest
    from apps.medical.models import MedicalRecord
    from apps.medical.services import signed_initial_exams

    today = date.today()
    club = user.club_id
    items = []
    perms = user.permission_codes

    # ---------------- Club Manager ----------------
    if "HORSE_REGISTER_REVIEW" in perms:
        for horse in Horse.objects.filter(club_id=club, registration_status="Submitted"):
            items.append(_item("HORSE_TO_VERIFY", "Hồ sơ ngựa chờ xác minh", "Horse", horse.id, horse,
                               horse.updated_at))
        signed = signed_initial_exams().filter(horse=OuterRef("pk"))
        for horse in Horse.objects.filter(club_id=club, registration_status="PendingExam").annotate(
                done=Exists(signed)).filter(done=True):
            items.append(_item("HORSE_TO_APPROVE", "Vet đã khám đầu vào, chờ duyệt tiếp nhận", "Horse", horse.id,
                               horse, horse.updated_at))
    if "CLUB_MANAGE" in perms:  # chưa xếp bác sĩ trực hôm nay / ngày mai
        from apps.core.permissions import club_users_with_role
        from apps.medical.models import VetDutyShift

        if club_users_with_role(club, "VETERINARIAN").exists():
            missing = [(day, label) for day, label in ((today, "hôm nay"), (today + timedelta(days=1), "ngày mai"))
                       if not VetDutyShift.objects.filter(club_id=club, duty_date=day).exists()]
            if missing:
                items.append(_item("VET_DUTY_MISSING", "Chưa xếp bác sĩ trực " + " và ".join(m[1] for m in missing),
                                   "Club", club, None, missing[0][0], urgent=missing[0][0] == today))
    if "PROFILE_EDIT_APPROVE" in perms:
        for req in ProfileChangeRequest.objects.filter(horse__club_id=club, status="Pending").select_related("horse"):
            items.append(_item("PROFILE_CHANGE", "Yêu cầu sửa lý lịch chờ duyệt", "ProfileChangeRequest", req.id,
                               req.horse, req.requested_at))
    # ---------------- Vet ----------------
    if "MEDICAL_MANAGE" in perms:
        pending = Horse.objects.filter(club_id=club, registration_status="PendingExam").annotate(
            done=Exists(signed_initial_exams().filter(horse=OuterRef("pk")))).filter(done=False)
        from apps.medical.duty import is_on_duty

        on_duty = is_on_duty(user)
        for horse in pending:
            items.append(_item("INITIAL_EXAM", "Ngựa chờ khám đầu vào" + (" (bạn đang trực)" if on_duty else ""),
                               "Horse", horse.id, horse, horse.verified_at, urgent=on_duty))
        for record in MedicalRecord.objects.filter(horse__club_id=club, vet=user, record_status="Draft"):
            items.append(_item("DRAFT_RECORD", "Phiếu khám nháp chưa chốt", "MedicalRecord", record.id,
                               record.horse, record.exam_date))
    # ---------------- Chủ ngựa ----------------
    if "OWNER_VIEW" in perms:
        for horse in Horse.objects.filter(owner=user, registration_status="Rejected"):
            items.append(_item("HORSE_REJECTED", "Hồ sơ ngựa bị từ chối, cần sửa và gửi lại", "Horse", horse.id,
                               horse, horse.updated_at))
        for req in ProfileChangeRequest.objects.filter(horse__owner=user, status__in=("Approved", "Rejected"),
                                                       reviewed_at__date__gte=today - timedelta(days=7)):
            items.append(_item("PROFILE_CHANGE_DONE", f"Yêu cầu sửa lý lịch: {req.status}", "ProfileChangeRequest",
                               req.id, req.horse, req.reviewed_at, message=req.review_note))

    if flows.has_training():  # Flow 2: giáo án, buổi tập
        from apps.training.notifications import training_items
        items += training_items(user, _item)
    if flows.has_flow3():  # Flow 3: báo cáo sức khỏe, tiêm phòng, lịch y tế
        from apps.medical.notifications import medical_items
        items += medical_items(user, _item)
    if flows.has_care():  # Flow 4: khẩu phần, việc chăm sóc, kho vật tư
        from apps.care.notifications import care_items
        items += care_items(user, _item)

    # Khẩn trước, mới trước; bỏ trùng (một người có nhiều vai trò)
    unique = {(i["Type"], i["EntityID"]): i for i in items}
    return sorted(unique.values(), key=lambda i: (i["Priority"] != "High", -(_ts(i["At"]))))


def _ts(value):
    if not value:
        return 0
    digits = "".join(ch for ch in value if ch.isdigit())
    return int((digits + "0" * 14)[:14])


def notification_key(item):
    return f"{item['Type']}|{item['EntityName']}|{item['EntityID']}|{item['At'] or ''}"[:200]


def with_read_state(user, items):
    """Thêm Key, IsRead cho từng thông báo (đã đọc = có trong bảng NotificationRead)."""
    from .models import NotificationRead

    for item in items:
        item["Key"] = notification_key(item)
    read = set(NotificationRead.objects.filter(user=user, notification_key__in=[i["Key"] for i in items])
               .values_list("notification_key", flat=True))
    for item in items:
        item["IsRead"] = item["Key"] in read
    return items


class NotificationView(APIView):
    """GET /api/notifications?unread=1 - mỗi thông báo có Key, IsRead (unread=1: chỉ thông báo chưa đọc)."""

    def get(self, request):
        items = with_read_state(request.user, build_notifications(request.user))
        if request.query_params.get("unread") in ("1", "true"):
            items = [i for i in items if not i["IsRead"]]
        if is_english():  # header X-Language: en
            for item in items:
                item["Title"] = translate_text(item["Title"])
                item["Message"] = translate_text(item["Message"])
        return Response(items)


class NotificationUnreadCountView(APIView):
    """GET /api/notifications/unread-count -> {"Unread": 3, "Total": 5} (số trên chuông)."""

    def get(self, request):
        items = with_read_state(request.user, build_notifications(request.user))
        return Response({"Unread": sum(1 for i in items if not i["IsRead"]), "Total": len(items)})


class NotificationReadView(APIView):
    """POST /api/notifications/read {"Keys": [...]} hoặc {"All": true} - đánh dấu đã đọc."""

    def post(self, request):
        from django.utils import timezone

        from .models import NotificationRead

        if request.data.get("All") in (True, "true", 1, "1"):
            keys = [notification_key(i) for i in build_notifications(request.user)]
        else:
            keys = request.data.get("Keys")
            if not isinstance(keys, list) or not all(isinstance(k, str) for k in keys):
                raise ValidationError({"Keys": ["Gửi danh sách Key của thông báo, hoặc {\"All\": true}."]})
        keys = {k[:200] for k in keys}
        known = set(NotificationRead.objects.filter(user=request.user, notification_key__in=keys)
                    .values_list("notification_key", flat=True))
        NotificationRead.objects.bulk_create([NotificationRead(user=request.user, notification_key=k)
                                              for k in sorted(keys - known)])
        # dọn bản ghi cũ (thông báo đó đã hết từ lâu)
        NotificationRead.objects.filter(user=request.user,
                                        read_at__lt=timezone.now() - timedelta(days=90)).delete()
        return Response({"Marked": len(keys - known)})
