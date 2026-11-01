"""Flow 3 bổ sung: email báo khẩn cho bác sĩ đang trực; báo Trainer / HLV trưởng / chủ ngựa khi khóa, đổi mức, mở khóa."""
from django.core import mail

from apps.medical.models import VetDutyShift
from apps.training.tests.base import TODAY, TrainingTestCase


class UrgentReportEmailTests(TrainingTestCase):
    def report(self, horse_id, severity):
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            res = self.client_for(self.groom).post(f"/api/horses/{horse_id}/health-reports", {
                "Severity": severity, "Description": "Ngựa đi khập khiễng chân sau phải"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return [m for m in mail.outbox if "Báo cáo sức khỏe" in m.subject]

    def test_urgent_report_emails_on_duty_vet(self):
        horse_id = self.approved_horse()
        VetDutyShift.objects.create(club=self.club, vet=self.vet2, duty_date=TODAY, shift="Full Day",
                                    created_by=self.manager)
        self.assertEqual(self.report(horse_id, "Normal"), [])                 # báo thường: chỉ hiện trên chuông
        urgent = self.report(horse_id, "Urgent")
        self.assertEqual(urgent[0].to, [self.vet2.email])
        self.assertIn("[KHẨN]", urgent[0].subject)

    def test_no_duty_emails_every_vet(self):
        horse_id = self.approved_horse()
        urgent = self.report(horse_id, "Urgent")
        self.assertEqual(sorted(urgent[0].to), sorted([self.vet.email, self.vet2.email]))


class LockNotificationTests(TrainingTestCase):
    def types(self, user):
        return {(n["Type"], n["EntityID"]) for n in self.client_for(user).get("/api/notifications").data}

    def test_lock_events_reach_trainer_head_and_owner(self):
        horse_id, plan, stage_id = self.ready_horse()
        vet = self.client_for(self.vet)
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            res = vet.post(f"/api/horses/{horse_id}/training-locks", {
                "Reason": "Viêm gân", "LockLevel": "Restricted", "MaxIntensity": 20}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        lock_id = res.data["TrainingLockID"]
        staff_mail = [m for m in mail.outbox if self.trainer.email in m.to]
        self.assertTrue(staff_mail and self.head.email in staff_mail[0].to)
        self.assertIn("xem lại giáo án", staff_mail[0].body)
        for user in (self.trainer, self.head):
            self.assertIn(("TRAINING_LOCKED", lock_id), self.types(user))
        self.assertNotIn(("TRAINING_LOCKED", lock_id), self.types(self.trainer2))   # không phụ trách ngựa này

        # đổi ngày dự kiến mở khóa: không phải đổi mức -> không báo đổi mức
        vet.patch(f"/api/training-locks/{lock_id}", {"LockEndDate": f"{TODAY.year + 1}-01-15T00:00:00"},
                  format="json")
        self.assertNotIn(("TRAINING_LOCK_CHANGED", lock_id), self.types(self.head))
        # nâng lên Full: Trainer, HLV trưởng, chủ ngựa đều được báo
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            res = vet.patch(f"/api/training-locks/{lock_id}", {"LockLevel": "Full"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        for user in (self.trainer, self.head):
            self.assertIn(("TRAINING_LOCK_CHANGED", lock_id), self.types(user))
        self.assertIn(("OWNER_TRAINING_LOCK_CHANGED", lock_id), self.types(self.owner))
        self.assertTrue([m for m in mail.outbox if self.owner.email in m.to and "mức hạn chế" in m.subject])
