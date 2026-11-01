"""
Danh sách Role / Permission giống hệt phần SEED DATA trong sql/horse_v2.sql.

Trên SQL Server thật, dữ liệu này đã có sẵn sau khi chạy horse_v2.sql.
File này dùng để:
  - tạo dữ liệu khi chạy test bằng SQLite;
  - lệnh `seed_demo` bổ sung nếu thiếu (không ghi đè dữ liệu có sẵn).
Test `test_rbac_matches_sql` kiểm tra file này luôn khớp với horse_v2.sql.
"""

ROLES = {
    "CLUB_MANAGER": "Club Manager",
    "HEAD_TRAINER": "Head Trainer",
    "TRAINER": "Trainer",
    "WORK_RIDER": "Work Rider",
    "VETERINARIAN": "Veterinarian",
    "GROOM": "Groom / Stable Hand",
    "HORSE_OWNER": "Horse Owner",
}

PERMISSIONS = [
    "CLUB_MANAGE", "RBAC_MANAGE", "AUDIT_VIEW", "HORSE_VIEW", "HORSE_REGISTER", "HORSE_REGISTER_REVIEW",
    "HORSE_ARCHIVE", "PROFILE_EDIT_REQUEST", "PROFILE_EDIT_APPROVE", "HORSE_ASSESS", "TRAINER_ASSIGN",
    "TRAINING_PLAN_MANAGE", "TRAINING_PLAN_APPROVE", "TRAINING_SESSION_ASSIGN", "TRAINING_SESSION_SUPERVISE",
    "TRAINING_RESULT_UPDATE", "TRAINING_REVIEW", "HEALTH_REPORT", "MEDICAL_MANAGE", "MEDICAL_SIGN",
    "TRAINING_LOCK_MANAGE", "CARE_MANAGE", "DIET_MANAGE", "INVENTORY_REQUEST", "INVENTORY_MANAGE", "OWNER_VIEW",
]

ROLE_PERMISSIONS = {
    "CLUB_MANAGER": [
        "CLUB_MANAGE", "RBAC_MANAGE", "AUDIT_VIEW", "HORSE_VIEW", "HORSE_REGISTER_REVIEW",
        "HORSE_ARCHIVE", "PROFILE_EDIT_APPROVE", "INVENTORY_MANAGE",
    ],
    # Head Trainer không xếp / sửa buổi tập hằng ngày (việc của Trainer phụ trách); chỉ chọn người giám sát thay
    "HEAD_TRAINER": [
        "HORSE_VIEW", "HORSE_ASSESS", "TRAINER_ASSIGN", "TRAINING_PLAN_APPROVE",
        "TRAINING_SESSION_SUPERVISE", "HEALTH_REPORT", "DIET_MANAGE", "INVENTORY_REQUEST",
    ],
    "TRAINER": [
        "HORSE_VIEW", "TRAINING_PLAN_MANAGE", "TRAINING_SESSION_ASSIGN", "TRAINING_SESSION_SUPERVISE",
        "TRAINING_REVIEW", "HEALTH_REPORT",
    ],
    "WORK_RIDER": ["HORSE_VIEW", "TRAINING_RESULT_UPDATE", "HEALTH_REPORT"],
    "VETERINARIAN": ["HORSE_VIEW", "MEDICAL_MANAGE", "MEDICAL_SIGN", "TRAINING_LOCK_MANAGE", "DIET_MANAGE",
                     "INVENTORY_REQUEST"],
    "GROOM": ["HORSE_VIEW", "CARE_MANAGE", "HEALTH_REPORT", "INVENTORY_REQUEST"],
    "HORSE_OWNER": ["HORSE_REGISTER", "PROFILE_EDIT_REQUEST", "OWNER_VIEW"],
}


def ensure_rbac_seed() -> None:
    """Tạo Role / Permission / RolePermission nếu chưa có (không xóa, không sửa dòng có sẵn)."""
    from .models import AppPermission, Role, RolePermission

    roles = {}
    for code, name in ROLES.items():
        roles[code], _ = Role.objects.get_or_create(code=code, defaults={"name": name})
    perms = {}
    for code in PERMISSIONS:
        perms[code], _ = AppPermission.objects.get_or_create(code=code, defaults={"name": code})
    for role_code, codes in ROLE_PERMISSIONS.items():
        for perm_code in codes:
            if not RolePermission.objects.filter(role=roles[role_code], permission=perms[perm_code]).exists():
                RolePermission.objects.create(role=roles[role_code], permission=perms[perm_code])


# ---------------------------------------------------------------------------
# Manager sửa bảng Role -> Permission (PUT /api/roles/<RoleCode>/permissions): các khóa an toàn.
# Bảng này dùng chung cho mọi CLB (Role / RolePermission không có ClubID).
# ---------------------------------------------------------------------------
# Quyền chỉ thuộc đúng 1 role: không gán cho role khác, không gỡ khỏi role đó.
EXCLUSIVE_PERMISSIONS = {
    "MEDICAL_MANAGE": "VETERINARIAN",          # khám bệnh chỉ bác sĩ thú y
    "MEDICAL_SIGN": "VETERINARIAN",            # ký phiếu khám
    "TRAINING_LOCK_MANAGE": "VETERINARIAN",    # khóa / mở khóa tập
    "RBAC_MANAGE": "CLUB_MANAGER",             # quản lý tài khoản, phân quyền (không ai tự khóa mất quyền quản trị)
    "HORSE_REGISTER": "HORSE_OWNER",
    "PROFILE_EDIT_REQUEST": "HORSE_OWNER",
    "OWNER_VIEW": "HORSE_OWNER",
}
# Role có quyền cố định: chủ ngựa là người ngoài CLB, không được thêm quyền nhân sự (vd HORSE_VIEW thấy cả CLB).
LOCKED_ROLES = {"HORSE_OWNER"}

PERMISSION_GROUPS = [
    ("Hệ thống", ["CLUB_MANAGE", "RBAC_MANAGE", "AUDIT_VIEW"]),
    ("Ngựa - Flow 1", ["HORSE_VIEW", "HORSE_REGISTER", "HORSE_REGISTER_REVIEW", "HORSE_ARCHIVE",
                       "PROFILE_EDIT_REQUEST", "PROFILE_EDIT_APPROVE", "OWNER_VIEW"]),
    ("Huấn luyện - Flow 2", ["HORSE_ASSESS", "TRAINER_ASSIGN", "TRAINING_PLAN_MANAGE", "TRAINING_PLAN_APPROVE",
                             "TRAINING_SESSION_ASSIGN", "TRAINING_SESSION_SUPERVISE", "TRAINING_RESULT_UPDATE",
                             "TRAINING_REVIEW"]),
    ("Y tế - Flow 3", ["HEALTH_REPORT", "MEDICAL_MANAGE", "MEDICAL_SIGN", "TRAINING_LOCK_MANAGE"]),
    ("Chăm sóc - Flow 4", ["CARE_MANAGE", "DIET_MANAGE", "INVENTORY_REQUEST", "INVENTORY_MANAGE"]),
]
PERMISSION_GROUP = {code: group for group, codes in PERMISSION_GROUPS for code in codes}


def cell_lock_reason(role_code, permission_code):
    """Lý do ô (role, quyền) trong bảng phân quyền không sửa được; None = sửa được."""
    if role_code in LOCKED_ROLES:
        return "Quyền của chủ ngựa cố định."
    owner = EXCLUSIVE_PERMISSIONS.get(permission_code)
    if owner and owner != role_code:
        return f"Quyền này chỉ dành cho {owner}."
    if owner == role_code:
        return f"{role_code} luôn phải có quyền này."
    return None
