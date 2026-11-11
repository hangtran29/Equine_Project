"""
Tạo CLB mới kèm tài khoản Manager đầu tiên (việc của người quản trị hệ thống, làm trên máy chủ):

    python manage.py create_club --name "Saigon Racing Club" --address "..." --phone 0281234567 \\
        --manager-email manager@saigonracing.vn --manager-name "Nguyễn Văn A" --manager-phone 0901234567

Không có --password: tạo mật khẩu tạm và in ra màn hình (Manager đăng nhập rồi tự đổi mật khẩu).
Từ đó Manager tự tạo tài khoản, gán role, phân quyền trong CLB của mình qua API.
"""
import secrets

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Club, Role, User, UserRole
from apps.accounts.rbac import ensure_rbac_seed
from apps.accounts.serializers import clean_phone
from apps.core.validators import clean_phone_number
from apps.core.audit import log_action


class Command(BaseCommand):
    help = "Tạo CLB mới và tài khoản Club Manager đầu tiên."

    def add_arguments(self, parser):
        parser.add_argument("--name", required=True, help="Tên câu lạc bộ (không trùng)")
        parser.add_argument("--address", default=None)
        parser.add_argument("--phone", default=None)
        parser.add_argument("--email", default=None, help="Email liên hệ của câu lạc bộ")
        parser.add_argument("--manager-email", required=True)
        parser.add_argument("--manager-name", required=True)
        parser.add_argument("--manager-phone", default=None)
        parser.add_argument("--password", default=None, help="Mật khẩu ban đầu (bỏ trống = tạo ngẫu nhiên)")

    @transaction.atomic
    def handle(self, *args, **o):
        ensure_rbac_seed()
        if Club.objects.filter(club_name__iexact=o["name"]).exists():
            raise CommandError(f"Đã có câu lạc bộ tên \"{o['name']}\".")
        if User.objects.filter(email__iexact=o["manager_email"]).exists():
            raise CommandError(f"Email {o['manager_email']} đã có tài khoản.")
        try:
            phone = clean_phone_number(o["phone"], check_unique=False, landline=True) if o["phone"] else None
            manager_phone = clean_phone(o["manager_phone"]) if o["manager_phone"] else None
        except Exception as exc:  # noqa: BLE001 - ValidationError của serializer
            raise CommandError(f"Số điện thoại không hợp lệ: {exc}") from exc
        club = Club.objects.create(club_name=o["name"], address=o["address"], phone=phone, email=o["email"],
                                   status="Active")
        password = o["password"] or secrets.token_urlsafe(9)
        manager = User.objects.create_user(email=o["manager_email"], password=password, full_name=o["manager_name"],
                                           phone=manager_phone, club=club)
        UserRole.objects.create(user=manager, role=Role.objects.get(code="CLUB_MANAGER"))
        log_action(None, "CREATE_CLUB", club, {"ManagerID": manager.id})
        self.stdout.write(self.style.SUCCESS(f"Đã tạo câu lạc bộ {club.club_name} (ClubID={club.id})"))
        self.stdout.write(f"  Manager: {manager.email}")
        if not o["password"]:
            self.stdout.write(self.style.WARNING(f" Mật khẩu tạm: {password} (đăng nhập xong hãy đổi mật khẩu)"))
