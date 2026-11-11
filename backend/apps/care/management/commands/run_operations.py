"""Lightweight worker, or --once from Windows Task Scheduler/cron."""
import time
from django.core.management.base import BaseCommand
from apps.accounts.models import Club
from apps.care.automation import generate_range
from apps.core.clubtime import today
from apps.core.workflow import notify
from apps.core.permissions import club_users_with_role
from apps.medical.models import MedicalSchedule, Vaccination


def run_once():
    for club in Club.objects.filter(status="Active"):
        generate_range(club, today(), 2)
        vets = list(club_users_with_role(club.pk, "VETERINARIAN"))
        from datetime import timedelta
        limit = today() + timedelta(days=7)
        for s in MedicalSchedule.objects.filter(horse__club=club, status__in=("Scheduled", "Overdue"), scheduled_date__lte=limit).select_related("horse"):
            notify(vets, s.horse, "MEDICAL_REMINDER", f"schedule:{s.pk}:{s.scheduled_date}",
                   f"{s.horse.horse_name}: {s.schedule_type}, hạn {s.scheduled_date:%d/%m/%Y}")
        for v in Vaccination.objects.filter(horse__club=club).exclude(status="Cancelled").select_related("horse"):
            due = v.next_due_date if v.status == "Completed" else v.vaccination_date
            if due and due <= limit:
                notify(vets, v.horse, "MEDICAL_REMINDER", f"vaccine:{v.pk}:{due}",
                       f"{v.horse.horse_name}: tiêm {v.vaccine_name}, hạn {due:%d/%m/%Y}")


class Command(BaseCommand):
    help = "Sinh việc chăm sóc và nhắc y tế trong ứng dụng, không cần người mở FE."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")
        parser.add_argument("--interval", type=int, default=60)

    def handle(self, *args, **options):
        if not 10 <= options["interval"] <= 3600:
            from django.core.management.base import CommandError
            raise CommandError("--interval từ 10 đến 3600 giây.")
        while True:
            run_once()
            self.stdout.write(f"Đã đối chiếu công việc và nhắc y tế ngày {today()}.")
            if options["once"]:
                return
            time.sleep(options["interval"])
