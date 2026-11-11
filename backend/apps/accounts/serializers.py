from rest_framework import serializers

from apps.core import validators

from apps.core.serializers import DBColumnModelSerializer

from .models import Club, Role, User


class UserSerializer(DBColumnModelSerializer):
    """Thông tin người dùng (không bao giờ trả PasswordHash)."""

    Roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "club", "full_name", "email", "phone", "address", "status", "must_change_password",
                  "created_at", "Roles"]
        read_only_fields = fields

    def get_Roles(self, obj):
        return sorted(obj.role_codes)


class CurrentUserSerializer(UserSerializer):
    """Người đang đăng nhập: kèm danh sách quyền để frontend ẩn / hiện nút."""

    Permissions = serializers.SerializerMethodField()

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ["Permissions"]
        read_only_fields = fields

    def get_Permissions(self, obj):
        return sorted(obj.permission_codes)


class LoginSerializer(serializers.Serializer):
    Email = serializers.EmailField()
    Password = serializers.CharField(trim_whitespace=False)


def _loose(**extra):
    """Ô chữ để bộ kiểm tra dùng chung tự báo lỗi (bỏ trống, khoảng trắng...) bằng câu thống nhất."""
    return serializers.CharField(required=False, allow_blank=True, allow_null=True, trim_whitespace=False,
                                 default="", **extra)


class UserCreateSerializer(serializers.Serializer):
    """Quản lý câu lạc bộ tạo tài khoản trong câu lạc bộ của mình (mặc định là chủ ngựa)."""

    FullName = _loose()
    Email = _loose()
    Phone = _loose()
    Address = _loose()
    RoleCode = serializers.CharField(required=False, default="HORSE_OWNER")
    Password = serializers.CharField(required=False, allow_blank=True, min_length=6, trim_whitespace=False)

    def validate_FullName(self, value):
        return validators.clean_full_name(value)

    def validate_Email(self, value):
        return validators.clean_email(value)

    def validate_Phone(self, value):
        return validators.clean_phone_number(value)

    def validate_Address(self, value):
        return validators.clean_address(value)

    def validate_RoleCode(self, value):
        if not Role.objects.filter(code=value).exists():
            raise serializers.ValidationError("Chức vụ không tồn tại.")
        return value


class OwnerRegisterSerializer(UserCreateSerializer):
    """Chủ ngựa tự tạo tài khoản ở trang đăng nhập (luôn là HORSE_OWNER, không chọn vai trò khác)."""

    RoleCode = None
    Password = serializers.CharField(min_length=6, trim_whitespace=False, error_messages={
        "required": "Cần nhập mật khẩu.", "blank": "Cần nhập mật khẩu.",
        "min_length": "Mật khẩu phải có ít nhất 6 ký tự."})
    ClubID = serializers.IntegerField(error_messages={
        "required": "Cần chọn câu lạc bộ.", "invalid": "Cần chọn câu lạc bộ."})

    def validate_ClubID(self, value):
        if not Club.objects.filter(pk=value, status="Active").exists():
            raise serializers.ValidationError("Câu lạc bộ không tồn tại hoặc đã ngừng hoạt động.")
        return value


class GoogleLoginSerializer(serializers.Serializer):
    """
    Bước 1: chỉ gửi Credential -> có tài khoản thì đăng nhập; chưa có thì trả SignupRequired.
    Bước 2 (chủ ngựa mới): gửi lại Credential kèm Phone, Address, ClubID (FullName không bắt buộc).
    """

    Credential = serializers.CharField(error_messages={"required": "Thiếu Credential từ Google."})
    FullName = serializers.CharField(max_length=150, required=False, allow_blank=True)
    Phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    Address = serializers.CharField(max_length=255, required=False, allow_blank=True)
    ClubID = serializers.IntegerField(required=False, allow_null=True)

    @property
    def wants_signup(self):
        v = self.validated_data
        return bool(v.get("Phone") or v.get("Address") or v.get("ClubID"))


class GoogleSignupSerializer(OwnerRegisterSerializer):
    """Kiểm tra thông tin bổ sung khi tạo tài khoản chủ ngựa bằng Google (không cần mật khẩu)."""

    Password = None


# ---------------------------------------------------------------------------
# Tài khoản cá nhân, quản trị (Manager), CLB
# ---------------------------------------------------------------------------
def clean_phone(value, exclude_user_id=None):
    return validators.clean_phone_number(value, exclude_user_id=exclude_user_id)


class ProfileUpdateSerializer(serializers.Serializer):
    """PATCH /api/auth/me và PATCH /api/users/<id>: họ tên, số điện thoại, địa chỉ (email không đổi)."""

    FullName = serializers.CharField(required=False, allow_blank=True, allow_null=True, trim_whitespace=False)
    Phone = serializers.CharField(required=False, allow_blank=True, allow_null=True, trim_whitespace=False)
    Address = serializers.CharField(required=False, allow_blank=True, allow_null=True, trim_whitespace=False)

    FIELD_MAP = {"FullName": "full_name", "Phone": "phone", "Address": "address"}

    def validate_FullName(self, value):
        return validators.clean_full_name(value)

    def validate_Phone(self, value):
        return clean_phone(value, exclude_user_id=self.context.get("user_id"))

    def validate_Address(self, value):
        return validators.clean_address(value)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Cần gửi ít nhất một trường: FullName, Phone, Address.")
        return attrs

    def model_values(self):
        return {self.FIELD_MAP[k]: v for k, v in self.validated_data.items()}


PASSWORD_ERRORS = {"min_length": "Mật khẩu phải có ít nhất 6 ký tự.", "required": "Cần nhập mật khẩu mới.",
                   "blank": "Cần nhập mật khẩu mới."}


class ChangePasswordSerializer(serializers.Serializer):
    CurrentPassword = serializers.CharField(trim_whitespace=False, required=False, allow_blank=True)
    NewPassword = serializers.CharField(min_length=6, trim_whitespace=False, error_messages=PASSWORD_ERRORS)


class PasswordResetRequestSerializer(serializers.Serializer):
    Email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    Uid = serializers.CharField()
    Token = serializers.CharField()
    NewPassword = serializers.CharField(min_length=6, trim_whitespace=False, error_messages=PASSWORD_ERRORS)


class RoleCodesSerializer(serializers.Serializer):
    RoleCodes = serializers.ListField(child=serializers.CharField(max_length=40), allow_empty=True)


class PermissionCodesSerializer(serializers.Serializer):
    PermissionCodes = serializers.ListField(child=serializers.CharField(max_length=60), allow_empty=True)


class ReasonSerializer(serializers.Serializer):
    Reason = serializers.CharField(max_length=500, required=False, allow_blank=True, allow_null=True)


class ClubSerializer(DBColumnModelSerializer):
    class Meta:
        model = Club
        fields = ["id", "club_name", "address", "phone", "email", "status", "created_at"]
        read_only_fields = ["id", "status", "created_at"]

    def validate_club_name(self, value):
        if Club.objects.filter(club_name__iexact=value).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError("Tên câu lạc bộ đã được dùng.")
        return value

    def validate_phone(self, value):
        return validators.clean_phone_number(value, check_unique=False, landline=True) if value else value
