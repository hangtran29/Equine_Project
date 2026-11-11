"""
Quản trị tài khoản và phân quyền (Club Manager = admin của CLB, quyền RBAC_MANAGE).

Hai tầng phân quyền:
  1. Gán role cho tài khoản (UserRole)        -> PUT /api/users/<id>/roles
  2. Role được làm chức năng nào (RolePermission) -> PUT /api/roles/<RoleCode>/permissions
Quyền được đọc từ database mỗi lần gọi API nên sửa xong có hiệu lực ngay.

Luật:
  - Manager chỉ quản lý người trong CLB mình; không tự khóa / tự bỏ role Manager / tự đặt lại mật khẩu ở đây.
  - CLB luôn còn ít nhất 1 Manager đang hoạt động.
  - Chủ ngựa (HORSE_OWNER) không gộp chung với role nhân sự.
  - Không gỡ role / khóa tài khoản khi người đó còn việc dang dở (giao lại việc trước).
  - Bảng role -> quyền: các ô bị khóa (rbac.EXCLUSIVE_PERMISSIONS, LOCKED_ROLES) không sửa được,
    mỗi quyền luôn còn ít nhất 1 role có quyền đó.
  - Mọi thay đổi ghi AuditLog.
"""
import secrets

from django.db import transaction
from rest_framework.exceptions import NotFound, ValidationError

from apps.core import flows
from apps.core.audit import log_action
from apps.core.exceptions import BusinessRuleError

from . import rbac
from .models import AppPermission, Role, RolePermission, User, UserRole

OWNER_ROLE = "HORSE_OWNER"
MANAGER_ROLE = "CLUB_MANAGER"


def club_member(manager, user_id):
    user = User.objects.filter(pk=user_id, club_id=manager.club_id).prefetch_related("roles").first()
    if user is None:
        raise NotFound("Không tìm thấy người dùng trong câu lạc bộ của bạn.")
    return user


def _active_managers(club_id, exclude=None):
    qs = User.objects.filter(club_id=club_id, status=User.Status.ACTIVE, roles__code=MANAGER_ROLE).distinct()
    return qs.exclude(pk=exclude.pk) if exclude else qs


# ---------------------------------------------------------------------------
# Việc dang dở theo từng role (không gỡ role / khóa khi còn việc)
# ---------------------------------------------------------------------------
def pending_work(user, role_code):
    """Danh sách việc dang dở của user ở vai trò role_code (rỗng = gỡ được)."""
    items = []
    if role_code == "TRAINER" and flows.has_training():
        from apps.training.models import TrainerHorseAssignment, TrainingSession

        horses = TrainerHorseAssignment.objects.filter(trainer=user, status="Active").count()
        if horses:
            items.append(f"đang phụ trách {horses} ngựa (chuyển ngựa cho huấn luyện viên khác trước)")
        subs = TrainingSession.objects.filter(substitute_trainer=user, status__in=("Assigned", "In Progress")).count()
        if subs:
            items.append(f"đang giám sát thay {subs} buổi tập chưa xong")
    if role_code == "WORK_RIDER" and flows.has_training():
        from apps.training.models import TrainingSession

        rides = TrainingSession.objects.filter(work_rider=user, status__in=("Assigned", "In Progress")).count()
        if rides:
            items.append(f"còn {rides} buổi tập được giao chưa xong")
    if role_code == "VETERINARIAN":
        from apps.medical.models import MedicalRecord

        drafts = MedicalRecord.objects.filter(vet=user, record_status="Draft").count()
        if drafts:
            items.append(f"còn {drafts} phiếu khám nháp chưa chốt")
        if flows.has_flow3():
            from apps.medical.models import HealthReport

            cases = HealthReport.objects.filter(vet=user, status="Reviewing").count()
            if cases:
                items.append(f"đang xử lý {cases} báo cáo sức khỏe")
    if role_code == "GROOM" and flows.has_care():
        from apps.care.models import CareTask

        tasks = CareTask.objects.filter(groom=user, status="Pending").count()
        if tasks:
            items.append(f"còn {tasks} việc chăm sóc chưa làm")
    if role_code == OWNER_ROLE:
        from apps.horses.models import Horse

        horses = Horse.objects.filter(owner=user).exclude(registration_status="Archived").count()
        if horses:
            items.append(f"đang là chủ của {horses} ngựa")
    return items


def _ensure_free(user, role_codes, action):
    problems = [f"{code}: {text}" for code in role_codes for text in pending_work(user, code)]
    if problems:
        raise BusinessRuleError(f"Chưa {action} được vì {user.full_name} " + "; ".join(problems) + ".", "ROLE_IN_USE")


# ---------------------------------------------------------------------------
# Tài khoản
# ---------------------------------------------------------------------------
def update_profile(user, actor, values):
    for attr, value in values.items():
        setattr(user, attr, value)
    user.save(update_fields=list(values))
    log_action(actor, "UPDATE_USER", user, {"Fields": sorted(values)})
    return user


@transaction.atomic
def set_roles(manager, user, role_codes):
    codes = sorted(set(role_codes))
    if not codes:
        raise ValidationError({"RoleCodes": ["Cần chọn ít nhất 1 role."]})
    known = set(Role.objects.filter(code__in=codes).values_list("code", flat=True))
    unknown = [c for c in codes if c not in known]
    if unknown:
        raise ValidationError({"RoleCodes": [f"Role không tồn tại: {', '.join(unknown)}."]})
    if OWNER_ROLE in codes and len(codes) > 1:
        raise BusinessRuleError("Chủ ngựa là người ngoài câu lạc bộ: không gộp role HORSE_OWNER với role nhân sự.",
                                "OWNER_ROLE_EXCLUSIVE")
    current = set(user.role_codes)
    if (OWNER_ROLE in current) != (OWNER_ROLE in codes):
        if OWNER_ROLE in current:
            _ensure_free(user, [OWNER_ROLE], "đổi role")
        else:
            raise BusinessRuleError("Không chuyển tài khoản nhân sự thành chủ ngựa; chủ ngựa tự đăng ký tài khoản riêng.",
                                    "OWNER_ROLE_EXCLUSIVE")
    removed, added = sorted(current - set(codes)), sorted(set(codes) - current)
    if MANAGER_ROLE in removed:
        if user.pk == manager.pk:
            raise BusinessRuleError("Không tự bỏ chức vụ Quản lý câu lạc bộ của chính mình.", "SELF_ACTION")
        if not _active_managers(user.club_id, exclude=user).exists():
            raise BusinessRuleError("câu lạc bộ phải còn ít nhất 1 Quản lý câu lạc bộ đang hoạt động.", "LAST_MANAGER")
    _ensure_free(user, removed, "gỡ role")
    UserRole.objects.filter(user=user, role__code__in=removed).delete()
    for role in Role.objects.filter(code__in=added):
        UserRole.objects.create(user=user, role=role, assigned_by=manager)
    log_action(manager, "CHANGE_USER_ROLES", user, {"Added": added, "Removed": removed})
    user.__dict__.pop("role_codes", None)
    user.__dict__.pop("permission_codes", None)
    return user


def lock_user(manager, user, reason=None):
    if user.pk == manager.pk:
        raise BusinessRuleError("Không tự khóa tài khoản của chính mình.", "SELF_ACTION")
    if user.status == User.Status.SUSPENDED:
        raise BusinessRuleError("Tài khoản đã bị khóa.", "INVALID_STATUS")
    if MANAGER_ROLE in user.role_codes and not _active_managers(user.club_id, exclude=user).exists():
        raise BusinessRuleError("câu lạc bộ phải còn ít nhất 1 Quản lý câu lạc bộ đang hoạt động.", "LAST_MANAGER")
    _ensure_free(user, [c for c in user.role_codes if c != OWNER_ROLE], "khóa tài khoản")
    user.status = User.Status.SUSPENDED
    user.save(update_fields=["status"])
    log_action(manager, "LOCK_USER", user, {"Reason": reason})
    return user


def unlock_user(manager, user):
    if user.status == User.Status.ACTIVE:
        raise BusinessRuleError("Tài khoản đang hoạt động.", "INVALID_STATUS")
    user.status = User.Status.ACTIVE
    user.save(update_fields=["status"])
    log_action(manager, "UNLOCK_USER", user)
    return user


def reset_password(manager, user):
    """Đặt mật khẩu tạm (trả về 1 lần); mọi phiên đăng nhập cũ của người đó hết hiệu lực."""
    if user.pk == manager.pk:
        raise BusinessRuleError("Đổi mật khẩu của chính mình ở mục Tài khoản (đổi mật khẩu).", "SELF_ACTION")
    temporary = secrets.token_urlsafe(9)
    user.set_password(temporary)
    user.must_change_password = True
    user.save(update_fields=["password", "must_change_password"])
    log_action(manager, "RESET_USER_PASSWORD", user)
    return temporary


# ---------------------------------------------------------------------------
# Bảng Role -> Permission
# ---------------------------------------------------------------------------
def matrix(club_id=None):
    roles = list(Role.objects.all())
    perms = {p.code: p for p in AppPermission.objects.all()}
    links = {}
    for role_id, code in RolePermission.objects.values_list("role_id", "permission__code"):
        links.setdefault(role_id, set()).add(code)
    counts = {}
    if club_id is not None:
        for role_id in UserRole.objects.filter(user__club_id=club_id).values_list("role_id", flat=True):
            counts[role_id] = counts.get(role_id, 0) + 1
    ordered = [code for _, codes in rbac.PERMISSION_GROUPS for code in codes if code in perms]
    ordered += sorted(code for code in perms if code not in ordered)
    return {
        "Roles": [{
            "RoleID": r.id, "RoleCode": r.code, "RoleName": r.name, "Description": r.description,
            "UserCount": counts.get(r.id, 0), "IsLocked": r.code in rbac.LOCKED_ROLES,
            "Permissions": sorted(links.get(r.id, set())),
        } for r in roles],
        "Permissions": [{
            "PermissionCode": code, "PermissionName": perms[code].name, "Description": perms[code].description,
            "Group": rbac.PERMISSION_GROUP.get(code, "Khác"),
            "ExclusiveRole": rbac.EXCLUSIVE_PERMISSIONS.get(code),
        } for code in ordered],
        "LockedCells": [{"RoleCode": r.code, "PermissionCode": code, "Reason": rbac.cell_lock_reason(r.code, code)}
                        for r in roles for code in ordered if rbac.cell_lock_reason(r.code, code)],
    }


@transaction.atomic
def set_role_permissions(manager, role_code, permission_codes):
    role = Role.objects.filter(code=role_code).first()
    if role is None:
        raise NotFound("Không tìm thấy role.")
    wanted = set(permission_codes)
    perms = {p.code: p for p in AppPermission.objects.all()}
    unknown = sorted(wanted - set(perms))
    if unknown:
        raise ValidationError({"PermissionCodes": [f"Quyền không tồn tại: {', '.join(unknown)}."]})
    current = set(RolePermission.objects.filter(role=role).values_list("permission__code", flat=True))
    added, removed = sorted(wanted - current), sorted(current - wanted)
    locked = [f"{code} ({rbac.cell_lock_reason(role_code, code)})" for code in added + removed
              if rbac.cell_lock_reason(role_code, code)]
    if locked:
        raise BusinessRuleError("Không sửa được: " + "; ".join(locked), "PERMISSION_LOCKED")
    orphan = [code for code in removed
              if not RolePermission.objects.filter(permission__code=code).exclude(role=role).exists()]
    if orphan:
        raise BusinessRuleError(
            "Mỗi chức năng phải còn ít nhất 1 role làm được; đang bỏ khỏi role cuối cùng: " + ", ".join(orphan),
            "PERMISSION_ORPHAN")
    RolePermission.objects.filter(role=role, permission__code__in=removed).delete()
    for code in added:
        RolePermission.objects.create(role=role, permission=perms[code])
    if added or removed:
        log_action(manager, "UPDATE_ROLE_PERMISSIONS", role, {"Added": added, "Removed": removed})
    return {"RoleCode": role_code, "Added": added, "Removed": removed}


@transaction.atomic
def reset_default_permissions(manager):
    """Đưa bảng role -> quyền về đúng mặc định trong horse_v2.sql (rbac.ROLE_PERMISSIONS)."""
    rbac.ensure_rbac_seed()
    changes = {}
    for role_code, codes in rbac.ROLE_PERMISSIONS.items():
        role = Role.objects.get(code=role_code)
        extra = RolePermission.objects.filter(role=role).exclude(permission__code__in=codes)
        removed = sorted(extra.values_list("permission__code", flat=True))
        extra.delete()
        if removed:
            changes[role_code] = removed
    log_action(manager, "RESET_ROLE_PERMISSIONS", manager, {"Removed": changes})
    return changes
