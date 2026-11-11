"""
Sinh việc chăm sóc theo chỉ tiêu cho mọi CLB đang hoạt động (chạy hằng ngày bằng Task Scheduler nếu muốn):

    python manage.py generate_care_tasks            # hôm nay
    python manage.py generate_care_tasks --days 3   # hôm nay + 2 ngày tới

Không chạy lệnh này thì việc vẫn được sinh khi Groom / Head Trainer mở danh sách việc hoặc chuông thông báo.
"""
from apps.core.clubtime import now as club_now, today as club_today
from datetime import date

from django.core.management.base import BaseCommand

from apps.accounts.models import Club
from apps.care.automation import generate_range


class Command(BaseCommand):
    help = "Sinh việc chăm sóc theo chỉ tiêu (cho ăn theo khẩu phần, dọn chuồng, tắm sau buổi tập, ngâm chân)."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=1)

    def handle(self, *args, **options):
        for club in Club.objects.filter(status="Active"):
            for row in generate_range(club, club_today(), options["days"]):
                self.stdout.write(f"{club.club_name} {row['Date']}: +{row['Created']} việc, "
                                  f"-{row['Removed']} việc cũ, {row['Unassigned']} chưa có người chăm sóc ngựa")
