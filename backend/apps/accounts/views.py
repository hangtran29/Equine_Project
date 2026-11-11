import secrets

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.db.models import Q
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from django.contrib.auth import authenticate
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed, NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.i18n import is_english
from apps.core import emails
from apps.core import validators
from apps.core.audit import log_action
from apps.core.params import date_param, int_param
from apps.core.permissions import HasAnyPermission, user_has_any

from . import user_admin
from .models import Club, Role, User, UserRole
from .google_auth import verify_google_credential
from .serializers import (
    ChangePasswordSerializer, ClubSerializer, CurrentUserSerializer, GoogleLoginSerializer, GoogleSignupSerializer,
    LoginSerializer, OwnerRegisterSerializer, PasswordResetConfirmSerializer, PasswordResetRequestSerializer,
    PermissionCodesSerializer, ProfileUpdateSerializer, ReasonSerializer, RoleCodesSerializer, UserCreateSerializer,
    UserSerializer,
)


class LoginView(APIView):
    """
    POST /api/auth/login   body: {"Email": "...", "Password": "..."}
    -> {"access": "<JWT>", "refresh": "<JWT>", "User": {...kèm Roles, Permissions}}
    Frontend gửi access token trong header:  Authorization: Bearer <access>
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def get_authenticate_header(self, request):
        return 'Bearer realm="api"'  # để sai mật khẩu trả 401 (không phải 403)

    @extend_schema(request=LoginSerializer, auth=[], summary="Đăng nhập, lấy access / refresh token")
    def post(self, request):
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = authenticate(request, username=data.validated_data["Email"], password=data.validated_data["Password"])
        if user is None:
            raise AuthenticationFailed("Email hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.")
        refresh = RefreshToken.for_user(user)
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "User": CurrentUserSerializer(user).data,
        })


class RegisterThrottle(AnonRateThrottle):
    rate = "20/hour"  # chặn spam tạo tài khoản hàng loạt


class RegisterView(APIView):
    """
    POST /api/auth/register  (không cần đăng nhập) - chủ ngựa tự tạo tài khoản.
    body: {"FullName", "Email", "Phone", "Address", "Password", "ClubID"}
    -> 201 {"access", "refresh", "User"}  (đăng nhập luôn, giống /api/auth/login)
    Vai trò luôn là HORSE_OWNER; nhân viên CLB vẫn do Manager tạo qua POST /api/users.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [RegisterThrottle]

    @extend_schema(request=OwnerRegisterSerializer, auth=[], summary="Chủ ngựa tự đăng ký tài khoản")
    def post(self, request):
        data = OwnerRegisterSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        user = User.objects.create_user(
            email=v["Email"],
            password=v["Password"],
            full_name=v["FullName"].strip(),
            phone=v["Phone"],
            address=v["Address"].strip(),
            club_id=v["ClubID"],
        )
        UserRole.objects.create(user=user, role=Role.objects.get(code="HORSE_OWNER"), assigned_by=None)
        log_action(user, "REGISTER_OWNER", user, {"ClubID": v["ClubID"]})
        emails.account_registered(user)
        refresh = RefreshToken.for_user(user)
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "User": CurrentUserSerializer(user).data,
        }, status=status.HTTP_201_CREATED)


def _token_response(user, code=status.HTTP_200_OK):
    refresh = RefreshToken.for_user(user)
    return Response({
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "User": CurrentUserSerializer(user).data,
    }, status=code)


class GoogleThrottle(AnonRateThrottle):
    rate = "120/hour"


class GoogleLoginView(APIView):
    """
    POST /api/auth/google  (không cần đăng nhập)
      {"Credential": "<ID token Google>"}
        -> email đã có tài khoản: 200 {access, refresh, User}  (mọi vai trò, kể cả nhân viên CLB)
        -> chưa có: 200 {"SignupRequired": true, "Email", "FullName"}  -> FE hỏi thêm thông tin
      {"Credential", "FullName"?, "Phone", "Address", "ClubID"}
        -> tạo tài khoản CHỦ NGỰA (không có mật khẩu, đăng nhập bằng Google): 201 {access, refresh, User}
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [GoogleThrottle]

    def get_authenticate_header(self, request):
        return 'Bearer realm="api"'

    @extend_schema(request=GoogleLoginSerializer, auth=[], summary="Đăng nhập / đăng ký bằng Google")
    def post(self, request):
        data = GoogleLoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        google = verify_google_credential(data.validated_data["Credential"])
        user = User.objects.filter(email__iexact=google["email"]).first()
        if user is not None:
            if not user.is_active:
                raise AuthenticationFailed("Email hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.")
            log_action(user, "LOGIN_GOOGLE", user)
            return _token_response(user)

        if not data.wants_signup:
            return Response({"SignupRequired": True, "Email": google["email"], "FullName": google["name"]})

        body = {key: data.validated_data.get(key) for key in ("Phone", "Address", "ClubID")}
        body["FullName"] = (data.validated_data.get("FullName") or google["name"]).strip()
        body["Email"] = google["email"]
        signup = GoogleSignupSerializer(data=body)
        signup.is_valid(raise_exception=True)
        v = signup.validated_data
        user = User.objects.create_user(
            email=v["Email"], password=None, full_name=v["FullName"], phone=v["Phone"],
            address=v["Address"].strip(), club_id=v["ClubID"],
        )
        UserRole.objects.create(user=user, role=Role.objects.get(code="HORSE_OWNER"), assigned_by=None)
        log_action(user, "REGISTER_OWNER", user, {"ClubID": v["ClubID"], "Via": "Google"})
        emails.account_registered(user)
        return _token_response(user, status.HTTP_201_CREATED)


class MeView(APIView):
    """GET /api/auth/me -> người đang đăng nhập, kèm Roles và Permissions."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(CurrentUserSerializer(request.user).data)

    @extend_schema(request=ProfileUpdateSerializer, summary="Tự sửa hồ sơ (họ tên, số điện thoại, địa chỉ)")
    def patch(self, request):
        data = ProfileUpdateSerializer(data=request.data, context={"user_id": request.user.id})
        data.is_valid(raise_exception=True)
        user_admin.update_profile(request.user, request.user, data.model_values())
        return Response(CurrentUserSerializer(request.user).data)


class UserListCreateView(APIView):
    """
    GET  /api/users?RoleCode=HORSE_OWNER  -> người dùng trong CLB của mình (Manager, Head Trainer)
    POST /api/users                       -> Manager tạo tài khoản (mặc định chủ ngựa)
    """

    def get_permissions(self):
        if self.request.method == "POST":
            return [HasAnyPermission("RBAC_MANAGE")()]
        # Manager; Head Trainer cần danh sách Trainer / Work Rider / Groom để phân công
        return [HasAnyPermission("RBAC_MANAGE", "HORSE_REGISTER_REVIEW", "TRAINER_ASSIGN", "TRAINING_SESSION_ASSIGN")()]

    # Trainer chỉ có TRAINING_SESSION_ASSIGN: chỉ cần danh sách người để xếp buổi tập (rider, trainer giám sát thay)
    SESSION_ROLES = ("WORK_RIDER", "TRAINER", "HEAD_TRAINER")

    def get(self, request):
        users = User.objects.filter(club_id=request.user.club_id).prefetch_related("roles")
        p = request.query_params
        if p.get("Status"):
            users = users.filter(status=p["Status"])
        if p.get("Search"):
            users = users.filter(Q(full_name__icontains=p["Search"]) | Q(email__icontains=p["Search"])
                                 | Q(phone__icontains=p["Search"]))
        role_code = request.query_params.get("RoleCode")
        if not user_has_any(request.user, "RBAC_MANAGE", "HORSE_REGISTER_REVIEW", "TRAINER_ASSIGN"):
            if role_code and role_code not in self.SESSION_ROLES:
                raise PermissionDenied("Bạn chỉ xem được danh sách kỵ sĩ tập luyện / Huấn luyện viên.")
            users = users.filter(roles__code__in=self.SESSION_ROLES)
        if role_code:
            users = users.filter(roles__code=role_code)
        return Response(UserSerializer(users.distinct(), many=True).data)

    def post(self, request):
        data = UserCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        temporary_password = v.get("Password") or secrets.token_urlsafe(9)
        user = User.objects.create_user(
            email=v["Email"],
            password=temporary_password,
            full_name=v["FullName"],
            phone=v.get("Phone") or None,
            address=v.get("Address") or None,
            club_id=request.user.club_id,
            must_change_password=True,   # mật khẩu do Manager đặt / cấp tạm: chủ tài khoản phải đổi lần đầu
        )
        UserRole.objects.create(user=user, role=Role.objects.get(code=v["RoleCode"]), assigned_by=request.user)
        log_action(request.user, "CREATE_USER", user, {"RoleCode": v["RoleCode"]})
        emails.account_created_by_manager(user, request.user)
        body = UserSerializer(user).data
        if not v.get("Password"):
            body["TemporaryPassword"] = temporary_password  # chỉ trả một lần để Manager báo cho chủ ngựa
        return Response(body, status=status.HTTP_201_CREATED)


class UserDetailView(APIView):
    """GET /api/users/<UserID> - chính mình, hoặc Quản lý câu lạc bộ xem người trong câu lạc bộ."""

    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        is_self = user.pk == request.user.pk
        same_club_manager = (
            user_has_any(request.user, "RBAC_MANAGE", "HORSE_REGISTER_REVIEW")
            and user.club_id == request.user.club_id
        )
        if not (is_self or same_club_manager):
            raise PermissionDenied("Bạn không có quyền xem người dùng này.")
        return Response(UserSerializer(user).data)

    @extend_schema(request=ProfileUpdateSerializer, summary="Manager sửa thông tin người dùng trong CLB")
    def patch(self, request, user_id):
        if not request.user.has_perm("RBAC_MANAGE"):
            raise PermissionDenied("Chỉ Quản lý câu lạc bộ mới sửa thông tin người dùng.")
        user = user_admin.club_member(request.user, user_id)
        data = ProfileUpdateSerializer(data=request.data, context={"user_id": user.id})
        data.is_valid(raise_exception=True)
        user_admin.update_profile(user, request.user, data.model_values())
        return Response(UserSerializer(user).data)


# ---------------------------------------------------------------------------
# Tài khoản cá nhân: đổi mật khẩu, quên mật khẩu
# ---------------------------------------------------------------------------
class ChangePasswordView(APIView):
    """POST /api/auth/change-password {"CurrentPassword", "NewPassword"} -> token mới (token cũ hết hiệu lực)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=ChangePasswordSerializer, summary="Đổi mật khẩu")
    def post(self, request):
        data = ChangePasswordSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v, user = data.validated_data, request.user
        # Tài khoản tạo bằng Google chưa có mật khẩu thì được đặt mật khẩu lần đầu không cần mật khẩu cũ
        if user.has_usable_password() and not user.check_password(v.get("CurrentPassword") or ""):
            raise ValidationError({"CurrentPassword": ["Mật khẩu hiện tại không đúng."]})
        if user.check_password(v["NewPassword"]):
            raise ValidationError({"NewPassword": ["Mật khẩu mới phải khác mật khẩu hiện tại."]})
        user.set_password(v["NewPassword"])
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password"])
        log_action(user, "CHANGE_PASSWORD", user)
        return _token_response(user)


class PasswordResetThrottle(AnonRateThrottle):
    rate = "10/hour"


def _forward_reset_to_manager(user):
    """Keep one pending recovery request for a club-issued account."""
    from apps.core.models import SupportRequest

    content = "Quên mật khẩu, đề nghị Quản lý cấp lại mật khẩu tạm thời."
    if not SupportRequest.objects.filter(requester=user, topic="Account", status="Open", content=content).exists():
        support = SupportRequest.objects.create(club_id=user.club_id, requester=user, topic="Account", content=content)
        log_action(user, "REQUEST_PASSWORD_RESET", support, {"Via": "ClubManager"})


class PasswordResetRequestView(APIView):
    """
    POST /api/auth/password-reset {"Email"} -> gửi email có link đặt lại mật khẩu (hiệu lực 1 giờ).
    Luôn trả 200 dù email có tồn tại hay không (không lộ danh sách tài khoản).
    Link: <FRONTEND_URL>/reset-password?uid=<Uid>&token=<Token>
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetThrottle]

    @extend_schema(request=PasswordResetRequestSerializer, auth=[], summary="Quên mật khẩu: gửi link đặt lại")
    def post(self, request):
        data = PasswordResetRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email = data.validated_data["Email"]
        domain = email.rsplit("@", 1)[-1].lower()
        if domain in getattr(settings, "NO_MAILBOX_DOMAINS", []):
            user = User.objects.filter(email__iexact=email, status=User.Status.ACTIVE).first()
            if user is not None and user.club_id:
                _forward_reset_to_manager(user)
            # dựa vào tên miền, không dựa vào việc email có tài khoản hay không (không lộ danh sách tài khoản)
            return Response({"detail": "Tài khoản do câu lạc bộ cấp vui lòng liên hệ Quản lý câu lạc bộ để được cấp lại mật khẩu.",
                             "ContactManager": True})
        user = User.objects.filter(email__iexact=email, status=User.Status.ACTIVE).first()
        if user is not None:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            link = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?uid={uid}&token={token}"
            emails.password_reset_link(user, link, english=is_english())
            log_action(user, "REQUEST_PASSWORD_RESET", user)
            if settings.DEBUG and settings.EMAIL_BACKEND.endswith("console.EmailBackend"):
                # máy chạy thử chưa cấu hình Gmail: thư chỉ in ra cửa sổ backend, nên trả luôn link để bấm
                return Response({"detail": "Nếu email có tài khoản, link đặt lại mật khẩu đã được gửi tới email đó.",
                                 "ResetLink": link, "EmailNotConfigured": True})
        if user is None and settings.DEBUG:
            # chỉ khi chạy thử (DEBUG): báo rõ email chưa có tài khoản để người thử biết vì sao không có thư
            return Response({"detail": "Chưa có tài khoản nào dùng email này.", "AccountFound": False})
        return Response({"detail": "Nếu email có tài khoản, link đặt lại mật khẩu đã được gửi tới email đó."})


class PasswordResetConfirmView(APIView):
    """POST /api/auth/password-reset/confirm {"Uid", "Token", "NewPassword"}"""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetThrottle]

    @extend_schema(request=PasswordResetConfirmSerializer, auth=[], summary="Đặt mật khẩu mới từ link trong email")
    def post(self, request):
        data = PasswordResetConfirmSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        try:
            user = User.objects.get(pk=int(force_str(urlsafe_base64_decode(v["Uid"]))), status=User.Status.ACTIVE)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            user = None
        if user is None or not default_token_generator.check_token(user, v["Token"]):
            raise ValidationError({"Token": ["Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn."]})
        user.set_password(v["NewPassword"])
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password"])
        log_action(user, "RESET_PASSWORD", user)
        return Response({"detail": "Đã đặt mật khẩu mới. Hãy đăng nhập lại."})


# ---------------------------------------------------------------------------
# Quản trị tài khoản (Manager, quyền RBAC_MANAGE)
# ---------------------------------------------------------------------------
class UserRolesView(APIView):
    """PUT /api/users/<id>/roles {"RoleCodes": ["TRAINER", "GROOM"]} - đặt lại toàn bộ role của tài khoản."""

    permission_classes = [HasAnyPermission("RBAC_MANAGE")]

    @extend_schema(request=RoleCodesSerializer, summary="Gán role cho tài khoản")
    def put(self, request, user_id):
        user = user_admin.club_member(request.user, user_id)
        data = RoleCodesSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user_admin.set_roles(request.user, user, data.validated_data["RoleCodes"])
        return Response(UserSerializer(user).data)


class UserLockView(APIView):
    """POST /api/users/<id>/lock {"Reason"} -> Suspended: không đăng nhập, không gọi API được nữa (ngay lập tức)."""

    permission_classes = [HasAnyPermission("RBAC_MANAGE")]

    @extend_schema(request=ReasonSerializer, summary="Khóa tài khoản")
    def post(self, request, user_id):
        user = user_admin.club_member(request.user, user_id)
        try:
            reason = validators.clean_text(request.data.get("Reason"), 500)   # lý do khóa bắt buộc (QL06)
        except ValidationError as exc:
            raise ValidationError({"Reason": exc.detail}) from exc
        user_admin.lock_user(request.user, user, reason)
        emails.account_status_changed(user, True, reason)
        return Response(UserSerializer(user).data)


class UserUnlockView(APIView):
    """POST /api/users/<id>/unlock"""

    permission_classes = [HasAnyPermission("RBAC_MANAGE")]

    @extend_schema(request=None, summary="Mở khóa tài khoản")
    def post(self, request, user_id):
        user = user_admin.unlock_user(request.user, user_admin.club_member(request.user, user_id))
        emails.account_status_changed(user, False)
        return Response(UserSerializer(user).data)


class UserResetPasswordView(APIView):
    """POST /api/users/<id>/reset-password -> {"TemporaryPassword"} (chỉ trả 1 lần, Quản lý câu lạc bộ báo trực tiếp)."""

    permission_classes = [HasAnyPermission("RBAC_MANAGE")]

    @extend_schema(request=None, summary="Manager đặt lại mật khẩu (mật khẩu tạm)")
    def post(self, request, user_id):
        user = user_admin.club_member(request.user, user_id)
        temporary = user_admin.reset_password(request.user, user)
        emails.password_reset_by_manager(user, request.user)
        return Response({**UserSerializer(user).data, "TemporaryPassword": temporary})


class RoleMatrixView(APIView):
    """
    GET /api/roles - bảng phân quyền: Roles (kèm Permissions, số người trong CLB), Permissions (theo nhóm),
    LockedCells (ô không sửa được, kèm lý do).
    """

    permission_classes = [HasAnyPermission("RBAC_MANAGE")]

    def get(self, request):
        return Response(user_admin.matrix(request.user.club_id))


class RolePermissionsView(APIView):
    """PUT /api/roles/<RoleCode>/permissions {"PermissionCodes": [...]} - đặt lại quyền của role (dùng chung mọi câu lạc bộ)."""

    permission_classes = [HasAnyPermission("RBAC_MANAGE")]

    @extend_schema(request=PermissionCodesSerializer, summary="Sửa chức năng của một role")
    def put(self, request, role_code):
        data = PermissionCodesSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        result = user_admin.set_role_permissions(request.user, role_code, data.validated_data["PermissionCodes"])
        return Response({**result, **user_admin.matrix(request.user.club_id)})


class RoleResetDefaultsView(APIView):
    """POST /api/roles/reset-defaults - đưa bảng phân quyền về mặc định (giống sql/horse_v2.sql)."""

    permission_classes = [HasAnyPermission("RBAC_MANAGE")]

    @extend_schema(request=None, summary="Khôi phục phân quyền mặc định")
    def post(self, request):
        removed = user_admin.reset_default_permissions(request.user)
        return Response({"Removed": removed, **user_admin.matrix(request.user.club_id)})


class AuditLogListView(APIView):
    """
    GET /api/audit-logs?UserID=&UserName=&ActionType=&EntityName=&EntityID=&From=&To=&Limit=100&Offset=0
    Nhật ký thao tác của người dùng trong CLB (mới nhất trước). UserName: tìm theo một phần họ tên.
    """

    permission_classes = [HasAnyPermission("AUDIT_VIEW")]

    def get(self, request):
        from apps.core.models import AuditLog

        p = request.query_params
        logs = AuditLog.objects.filter(user__club_id=request.user.club_id).select_related("user")
        if p.get("UserID"):
            logs = logs.filter(user_id=int_param(p, "UserID"))
        if p.get("UserName", "").strip():
            logs = logs.filter(user__full_name__icontains=p["UserName"].strip())
        if p.get("ActionType"):  # một mã hoặc nhiều mã cách nhau dấu phẩy (lọc theo nhóm thao tác)
            logs = logs.filter(action_type__in=[code.strip() for code in p["ActionType"].split(",") if code.strip()])
        if p.get("EntityName"):
            logs = logs.filter(entity_name=p["EntityName"])
        if p.get("EntityID"):
            logs = logs.filter(entity_id=int_param(p, "EntityID"))
        if p.get("From"):
            logs = logs.filter(action_time__date__gte=date_param(p, "From"))
        if p.get("To"):
            logs = logs.filter(action_time__date__lte=date_param(p, "To"))
        limit = min(int_param(p, "Limit") if p.get("Limit") else 100, 500)
        offset = int_param(p, "Offset") if p.get("Offset") else 0
        total = logs.count()
        rows = [{
            "AuditLogID": log.id, "UserID": log.user_id, "UserName": log.user.full_name if log.user_id else None,
            "ActionType": log.action_type, "EntityName": log.entity_name, "EntityID": log.entity_id,
            "ActionTime": log.action_time, "Details": log.details,
        } for log in logs[offset:offset + limit]]
        return Response({"Total": total, "Limit": limit, "Offset": offset, "Items": rows})


class MyClubView(APIView):
    """GET /api/clubs/mine - câu lạc bộ của người đang đăng nhập; PATCH - Quản lý câu lạc bộ sửa thông tin câu lạc bộ (CLUB_MANAGE)."""

    permission_classes = [IsAuthenticated]

    def _club(self, request):
        club = Club.objects.filter(pk=request.user.club_id).first()
        if club is None:
            raise NotFound("Tài khoản chưa thuộc câu lạc bộ nào.")
        return club

    def get(self, request):
        return Response(ClubSerializer(self._club(request)).data)

    @extend_schema(request=ClubSerializer, summary="Manager sửa thông tin CLB")
    def patch(self, request):
        if not request.user.has_perm("CLUB_MANAGE"):
            raise PermissionDenied("Chỉ Quản lý câu lạc bộ mới sửa thông tin câu lạc bộ.")
        club = self._club(request)
        data = ClubSerializer(club, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        data.save()
        log_action(request.user, "UPDATE_CLUB", club, {"Fields": sorted(data.validated_data)})
        return Response(ClubSerializer(club).data)
