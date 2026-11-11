"""
Yêu cầu hỗ trợ (mục "Cần hỗ trợ?" cuối menu bên trái).

GET  /api/support-requests/options          người liên hệ (Quản lý câu lạc bộ), danh sách chủ đề, ngựa có thể chọn
GET  /api/support-requests?Status=Open      Quản lý: mọi yêu cầu trong câu lạc bộ; người khác: yêu cầu của mình
POST /api/support-requests                  {Topic, HorseID?, Content}
POST /api/support-requests/<id>/resolve     Quản lý gửi phản hồi và đóng yêu cầu {Response}

Phản hồi được gửi về chuông thông báo của người gửi (xem notification_items).
"""
from datetime import timedelta

from django.db.models import Q
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .exceptions import BusinessRuleError
from .models import SupportRequest
from .permissions import club_users_with_role
from .serializers import fmt_datetime
from .validators import clean_text

ROLE_LABELS = {
    "CLUB_MANAGER": "Quản lý câu lạc bộ",
    "HEAD_TRAINER": "Huấn luyện viên trưởng",
    "TRAINER": "Huấn luyện viên",
    "WORK_RIDER": "Kỵ sĩ tập luyện",
    "VETERINARIAN": "Bác sĩ thú y",
    "GROOM": "Người chăm sóc ngựa",
    "HORSE_OWNER": "Chủ sở hữu ngựa",
}
ROLE_ORDER = list(ROLE_LABELS)
CONTENT_MAX = 1000


def role_label(user):
    codes = user.role_codes
    for code in ROLE_ORDER:
        if code in codes:
            return ROLE_LABELS[code]
    return ""


def is_support_manager(user):
    return user.has_perm("CLUB_MANAGE")


def selectable_horses(user):
    from apps.horses.views import horses_visible_to

    qs = horses_visible_to(user).filter(club_id=user.club_id).exclude(registration_status="Archived")
    if user.has_perm("HORSE_VIEW"):
        qs = qs.exclude(registration_status="Draft")
    return qs.order_by("horse_name")


def serialize(req):
    return {
        "SupportRequestID": req.id,
        "Topic": req.topic,
        "TopicLabel": SupportRequest.TOPICS.get(req.topic, req.topic),
        "HorseID": req.horse_id,
        "HorseName": req.horse.horse_name if req.horse_id else None,
        "Content": req.content,
        "Status": req.status,
        "Response": req.response,
        "RequesterID": req.requester_id,
        "RequesterName": req.requester.full_name,
        "RequesterRole": role_label(req.requester),
        "ResolvedByName": req.resolved_by.full_name if req.resolved_by_id else None,
        "CreatedAt": fmt_datetime(req.created_at),
        "ResolvedAt": fmt_datetime(req.resolved_at),
    }


class SupportCreateSerializer(serializers.Serializer):
    Topic = serializers.ChoiceField(choices=list(SupportRequest.TOPICS), error_messages={
        "required": "Vui lòng chọn thông tin này.", "null": "Vui lòng chọn thông tin này.",
        "blank": "Vui lòng chọn thông tin này.", "invalid_choice": "Lựa chọn không hợp lệ."})
    HorseID = serializers.IntegerField(required=False, allow_null=True)
    Content = serializers.CharField(allow_blank=True, required=False, default="", trim_whitespace=False)

    def validate_Content(self, value):
        return clean_text(value, CONTENT_MAX)


class SupportResolveSerializer(serializers.Serializer):
    Response = serializers.CharField(allow_blank=True, required=False, default="", trim_whitespace=False)

    def validate_Response(self, value):
        return clean_text(value, CONTENT_MAX)


class SupportOptionsView(APIView):
    def get(self, request):
        user = request.user
        manager = (club_users_with_role(user.club_id, "CLUB_MANAGER").order_by("id").first()
                   if user.club_id else None)
        return Response({
            "Contact": {"FullName": manager.full_name, "Phone": manager.phone, "Email": manager.email,
                        "Role": ROLE_LABELS["CLUB_MANAGER"]} if manager else None,
            "Topics": [{"Value": k, "Label": v} for k, v in SupportRequest.TOPICS.items()],
            "Horses": [{"HorseID": h.id, "HorseName": h.horse_name} for h in selectable_horses(user)],
            "CanManage": is_support_manager(user),
        })


class SupportRequestListView(APIView):
    def get(self, request):
        user = request.user
        qs = SupportRequest.objects.select_related("requester", "horse", "resolved_by")
        if is_support_manager(user) and request.query_params.get("mine") not in ("1", "true"):
            qs = qs.filter(club_id=user.club_id)
        else:
            qs = qs.filter(requester=user)
        status = request.query_params.get("Status")
        if status in ("Open", "Resolved"):
            qs = qs.filter(status=status)
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(content__icontains=q) | Q(requester__full_name__icontains=q)
                           | Q(horse__horse_name__icontains=q))
        rows = list(qs[:300])
        # thứ tự vai trò của người gửi cần prefetch để không truy vấn từng dòng
        from apps.accounts.models import User

        users = User.objects.filter(pk__in={r.requester_id for r in rows}).prefetch_related("roles")
        by_id = {u.id: u for u in users}
        for r in rows:
            r.requester = by_id.get(r.requester_id, r.requester)
        return Response([serialize(r) for r in rows])

    def post(self, request):
        user = request.user
        if not user.club_id:
            raise BusinessRuleError("Tài khoản chưa thuộc câu lạc bộ nào nên chưa gửi được yêu cầu hỗ trợ.", "NO_CLUB")
        data = SupportCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        horse = None
        if v.get("HorseID"):
            horse = selectable_horses(user).filter(pk=v["HorseID"]).first()
            if horse is None:
                raise ValidationError({"HorseID": ["Không tìm thấy thông tin ngựa tương ứng."]})
        req = SupportRequest.objects.create(club_id=user.club_id, requester=user, topic=v["Topic"], horse=horse,
                                            content=v["Content"])
        from .audit import log_action

        log_action(user, "SUPPORT_REQUEST_CREATE", req, {"Topic": req.topic})
        return Response(serialize(req), status=201)


class SupportResolveView(APIView):
    @transaction.atomic
    def post(self, request, pk):
        user = request.user
        if not is_support_manager(user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Bạn không có quyền thực hiện thao tác này.")
        req = SupportRequest.objects.select_for_update().select_related("requester", "horse").filter(pk=pk, club_id=user.club_id).first()
        if req is None:
            raise NotFound("Không tìm thấy yêu cầu hỗ trợ.")
        if req.status == "Resolved":
            raise BusinessRuleError("Yêu cầu này đã được xử lý.", "ALREADY_RESOLVED")
        data = SupportResolveSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        req.response = data.validated_data["Response"]
        req.status = "Resolved"
        req.resolved_by = user
        req.resolved_at = timezone.now()
        req.save(update_fields=["response", "status", "resolved_by", "resolved_at"])
        from .audit import log_action

        log_action(user, "SUPPORT_REQUEST_RESOLVE", req)
        return Response(serialize(req))


def notification_items(user, make_item):
    """Quản lý: yêu cầu đang chờ xử lý. Người gửi: phản hồi trong 7 ngày gần nhất."""
    items = []
    if is_support_manager(user) and user.club_id:
        for req in SupportRequest.objects.filter(club_id=user.club_id, status="Open").select_related("requester"):
            items.append(make_item("SUPPORT_REQUEST", f"Yêu cầu hỗ trợ mới: {SupportRequest.TOPICS[req.topic]}",
                                   "SupportRequest", req.id, None, req.created_at,
                                   message=f"{req.requester.full_name}: {req.content[:160]}"))
    since = timezone.now() - timedelta(days=7)
    for req in SupportRequest.objects.filter(requester=user, status="Resolved", resolved_at__gte=since):
        items.append(make_item("SUPPORT_RESOLVED", "Yêu cầu hỗ trợ đã được phản hồi", "SupportRequest", req.id,
                               None, req.resolved_at, message=req.response))
    return items
