"""Flow 1 bổ sung: Manager xếp lịch trực bác sĩ thú y; bác sĩ đang trực được báo trước; xếp Groom khi nhận ngựa."""
from datetime import date, datetime, time, timedelta

from django.core import mail

from apps.care.models import HorseGroom
from apps.medical import duty
from apps.medical.models import VetDutyShift

from .helpers import Flow1TestCase

TODAY = date.today()


class VetDutyTests(Flow1TestCase):
    def add_shift(self, vet, day=TODAY, shift="Full Day", client=None):
        return (client or self.client_for(self.manager)).post("/api/vet-duty-shifts", {
            "VetID": vet.id, "DutyDate": day.isoformat(), "Shift": shift}, format="json")

    def test_manager_schedules_and_vets_read(self):
        res = self.add_shift(self.vet)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["Shift"], "Full Day")
        self.assertTrue(res.data["IsOnDutyNow"])
        # trùng ca, ngày đã qua, người không phải bác sĩ, bác sĩ CLB khác
        self.assertEqual(self.add_shift(self.vet).data["code"], "ALREADY_EXISTS")
        self.assertEqual(self.add_shift(self.vet, TODAY - timedelta(days=1)).data["code"], "PAST_DATE")
        self.assertEqual(self.add_shift(self.trainer).status_code, 400)
        self.assertEqual(self.add_shift(self.other_vet).status_code, 400)
        # chỉ Manager xếp lịch; Vet xem được; chủ ngựa không xem
        self.assertEqual(self.add_shift(self.vet2, client=self.client_for(self.vet)).status_code, 403)
        listed = self.client_for(self.vet2).get("/api/vet-duty-shifts").data
        self.assertEqual([s["VetID"] for s in listed], [self.vet.id])
        self.assertEqual(self.client_for(self.owner).get("/api/vet-duty-shifts").status_code, 403)
        # CLB khác không thấy
        self.assertEqual(self.client_for(self.other_manager).get("/api/vet-duty-shifts").data, [])
        now = self.client_for(self.trainer).get("/api/vet-duty-shifts/now").data
        self.assertEqual([s["VetID"] for s in now], [self.vet.id])
        # bỏ ca
        shift_id = listed[0]["VetDutyShiftID"]
        self.assertEqual(self.client_for(self.manager).delete(f"/api/vet-duty-shifts/{shift_id}").status_code, 204)
        self.assertEqual(self.client_for(self.vet).get("/api/vet-duty-shifts/now").data, [])

    def test_shift_hours(self):
        night = VetDutyShift.Shift.NIGHT
        self.assertTrue(duty.shift_covers(night, TODAY, datetime.combine(TODAY, time(23, 0))))
        self.assertTrue(duty.shift_covers(night, TODAY, datetime.combine(TODAY + timedelta(days=1), time(5, 0))))
        self.assertFalse(duty.shift_covers(night, TODAY, datetime.combine(TODAY, time(12, 0))))
        self.assertTrue(duty.shift_covers("Morning", TODAY, datetime.combine(TODAY, time(6, 0))))
        self.assertFalse(duty.shift_covers("Morning", TODAY, datetime.combine(TODAY, time(14, 0))))

    def test_on_duty_vet_is_alerted_first(self):
        self.add_shift(self.vet)
        horse_id = self.owner_creates_horse()
        self.client_for(self.owner).post(f"/api/horses/{horse_id}/submit")
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            self.client_for(self.manager).post(f"/api/horses/{horse_id}/verify")
        exam_mails = [m for m in mail.outbox if "chờ khám đầu vào" in m.subject]
        self.assertEqual(exam_mails[0].to, [self.vet.email])          # chỉ bác sĩ đang trực
        on_duty = {n["Type"]: n for n in self.client_for(self.vet).get("/api/notifications").data}
        other = {n["Type"]: n for n in self.client_for(self.vet2).get("/api/notifications").data}
        self.assertEqual(on_duty["INITIAL_EXAM"]["Priority"], "High")
        self.assertEqual(other["INITIAL_EXAM"]["Priority"], "Normal")   # bác sĩ khác vẫn thấy, nhận ca được
        self.vet_signs_initial_exam(horse_id, vet=self.vet2)

    def test_no_one_on_duty_alerts_all_vets_and_reminds_manager(self):
        notes = {n["Type"]: n for n in self.client_for(self.manager).get("/api/notifications").data}
        self.assertEqual(notes["VET_DUTY_MISSING"]["Title"], "Chưa xếp bác sĩ trực hôm nay và ngày mai")
        self.assertEqual(notes["VET_DUTY_MISSING"]["Priority"], "High")
        horse_id = self.owner_creates_horse()
        self.client_for(self.owner).post(f"/api/horses/{horse_id}/submit")
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            self.client_for(self.manager).post(f"/api/horses/{horse_id}/verify")
        exam_mails = [m for m in mail.outbox if "chờ khám đầu vào" in m.subject]
        self.assertEqual(sorted(exam_mails[0].to), sorted([self.vet.email, self.vet2.email]))
        self.add_shift(self.vet)
        notes = {n["Type"]: n for n in self.client_for(self.manager).get("/api/notifications").data}
        self.assertEqual(notes["VET_DUTY_MISSING"]["Title"], "Chưa xếp bác sĩ trực ngày mai")
        self.add_shift(self.vet2, TODAY + timedelta(days=1), "Morning")
        notes = {n["Type"] for n in self.client_for(self.manager).get("/api/notifications").data}
        self.assertNotIn("VET_DUTY_MISSING", notes)


class ApproveWithGroomTests(Flow1TestCase):
    def test_manager_assigns_groom_when_approving(self):
        groom = self.make_user("groom@one.test", "GROOM", self.club)
        horse_id = self.owner_creates_horse()
        self.submit_and_verify(horse_id)
        self.vet_signs_initial_exam(horse_id)
        manager = self.client_for(self.manager)
        res = manager.post(f"/api/horses/{horse_id}/approve", {"HorseCode": "EQ-009", "GroomID": self.trainer.id},
                           format="json")
        self.assertEqual(res.status_code, 400)                     # không phải Groom -> chưa nhận ngựa
        self.assertEqual(manager.get(f"/api/horses/{horse_id}").data["RegistrationStatus"], "PendingExam")
        res = manager.post(f"/api/horses/{horse_id}/approve",
                           {"HorseCode": "EQ-009", "StallID": self.stall.id, "GroomID": groom.id}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(HorseGroom.objects.get(horse_id=horse_id).groom_id, groom.id)
