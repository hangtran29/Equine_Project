"""Flow 1 theo bộ thiết kế mới: sức khỏe chủ ngựa khai, mã ngựa tự đánh số, chỉ số sinh hiệu,
đổi mật khẩu lần đầu, ngày rời CLB, hạn bảo trì chuồng, tắt email thông báo."""
from datetime import date, timedelta

from django.core import mail
from django.test import override_settings

from apps.accounts.models import User
from apps.horses.models import Horse, Stall

from .helpers import Flow1TestCase


class DeclaredHealthTests(Flow1TestCase):
    def test_owner_declares_health_and_vet_sees_it(self):
        horse_id = self.owner_creates_horse(DeclaredHealth="  Khỏe mạnh  ", MedicalHistory="Viêm gân 2024", OwnerNote="")
        horse = self.client_for(self.owner).get(f"/api/horses/{horse_id}").data
        self.assertEqual(horse["DeclaredHealth"], "Khỏe mạnh")
        self.assertEqual(horse["MedicalHistory"], "Viêm gân 2024")
        self.assertIsNone(horse["OwnerNote"])          # để trống thì lưu null
        res = self.client_for(self.owner).patch(f"/api/horses/{horse_id}", {"OwnerNote": "Ăn ít cỏ khô"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["OwnerNote"], "Ăn ít cỏ khô")
        self.submit_and_verify(horse_id)
        seen = self.client_for(self.vet).get(f"/api/horses/{horse_id}").data
        self.assertEqual(seen["MedicalHistory"], "Viêm gân 2024")

    def test_health_fields_are_optional(self):
        horse_id = self.owner_creates_horse()
        self.assertIsNone(self.client_for(self.owner).get(f"/api/horses/{horse_id}").data["DeclaredHealth"])


class AutoHorseCodeTests(Flow1TestCase):
    def test_code_follows_profile_number(self):
        horse_id = self.owner_creates_horse()
        self.submit_and_verify(horse_id)
        self.vet_signs_initial_exam(horse_id)
        res = self.client_for(self.manager).post(f"/api/horses/{horse_id}/approve", {}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["HorseCode"], f"EQ-{horse_id:03d}")

    def test_suffix_when_code_already_taken(self):
        horse_id = self.owner_creates_horse()
        self.submit_and_verify(horse_id)
        self.vet_signs_initial_exam(horse_id)
        other = self.owner_creates_horse(MicrochipNumber="985141000999001", PassportNumber="704001000000999",
                                         HorseName="Sao Băng")
        Horse.objects.filter(pk=other).update(horse_code=f"EQ-{horse_id:03d}")   # mã nhập tay trước đây
        res = self.client_for(self.manager).post(f"/api/horses/{horse_id}/approve", {"HorseCode": ""}, format="json")
        self.assertEqual(res.data["HorseCode"], f"EQ-{horse_id:03d}-2")


class VitalSignsTests(Flow1TestCase):
    def test_exam_stores_vitals_and_rejects_impossible_values(self):
        horse_id = self.owner_creates_horse()
        self.submit_and_verify(horse_id)
        client = self.client_for(self.vet)
        base = {"ExamType": "Initial Exam", "WeightKg": 412, "HeightCm": 152, "HealthStatus": "Healthy",
                "TrainingEligibility": "Eligible", "Conclusion": "Tốt"}
        bad = client.post(f"/api/horses/{horse_id}/medical-records", {**base, "BodyTemperatureC": 50}, format="json")
        self.assertEqual(bad.status_code, 400)
        self.assertIn("BodyTemperatureC", bad.data["errors"] if "errors" in bad.data else bad.data)
        res = client.post(f"/api/horses/{horse_id}/medical-records",
                          {**base, "BodyTemperatureC": 37.8, "HeartRateBpm": 36, "RespiratoryRate": 12}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(float(res.data["BodyTemperatureC"]), 37.8)
        self.assertEqual(res.data["HeartRateBpm"], 36)
        self.assertEqual(res.data["RespiratoryRate"], 12)


class MustChangePasswordTests(Flow1TestCase):
    def test_manager_created_owner_must_change_password(self):
        res = self.client_for(self.manager).post("/api/users", {
            "FullName": "Phạm Thanh Tùng", "Email": "tung@equi.local", "Phone": "0903226718",
            "Address": "12 Lê Lợi, Quận 1", "RoleCode": "HORSE_OWNER"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(res.data["MustChangePassword"])
        temporary = res.data["TemporaryPassword"]
        login = self.client.post("/api/auth/login", {"Email": "tung@equi.local", "Password": temporary}, format="json")
        self.assertTrue(login.data["User"]["MustChangePassword"])
        user = User.objects.get(email="tung@equi.local")
        changed = self.client_for(user).post("/api/auth/change-password", {
            "CurrentPassword": temporary, "NewPassword": "MatKhauMoi#2026"}, format="json")
        self.assertEqual(changed.status_code, 200, changed.data)
        user.refresh_from_db()
        self.assertFalse(user.must_change_password)

    def test_manager_reset_sets_flag_again(self):
        res = self.client_for(self.manager).post(f"/api/users/{self.owner.id}/reset-password")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data["MustChangePassword"])


class LeftDateAndMaintenanceTests(Flow1TestCase):
    def test_archive_keeps_left_date(self):
        horse_id = self.approved_horse()
        left = date.today() + timedelta(days=5)
        res = self.client_for(self.manager).post(f"/api/horses/{horse_id}/archive", {
            "Reason": "Chủ ngựa chuyển sang câu lạc bộ khác", "LeftDate": left.isoformat()}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["LeftDate"], left.isoformat())

    def test_archive_defaults_left_date_to_today(self):
        horse_id = self.approved_horse()
        res = self.client_for(self.manager).post(f"/api/horses/{horse_id}/archive", {"Reason": "Rời CLB"}, format="json")
        self.assertEqual(res.data["LeftDate"], date.today().isoformat())

    def test_maintenance_until_cleared_when_stall_reopens(self):
        until = (date.today() + timedelta(days=3)).isoformat()
        res = self.client_for(self.manager).post("/api/stalls", {
            "StallNumber": "B-04", "Status": "Maintenance", "MaintenanceUntil": until}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["MaintenanceUntil"], until)
        stall_id = res.data["StallID"]
        res = self.client_for(self.manager).patch(f"/api/stalls/{stall_id}", {"Status": "Available"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertIsNone(Stall.objects.get(pk=stall_id).maintenance_until)


@override_settings(NOTIFICATION_EMAILS=False)
class NotificationEmailsOffTests(Flow1TestCase):
    def test_workflow_emails_off_but_bell_and_password_reset_still_work(self):
        horse_id = self.owner_creates_horse()
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            self.client_for(self.owner).post(f"/api/horses/{horse_id}/submit")
        self.assertEqual(mail.outbox, [])
        notes = self.client_for(self.manager).get("/api/notifications").data
        self.assertTrue(notes, "chuông thông báo vẫn có")
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post("/api/auth/password-reset", {"Email": self.owner.email}, format="json")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Đặt lại mật khẩu", mail.outbox[0].subject)


class ManagerIntakeOwnerTests(Flow1TestCase):
    """QL10: Quản lý khai giúp hồ sơ, nhập tay thông tin chủ ngựa."""

    def payload(self, **owner):
        body = self.horse_payload(MicrochipNumber="704000000000321")
        body.update({"OwnerFullName": "Phạm Thanh Tùng", "OwnerEmail": "thanhtung.pham@gmail.com",
                     "OwnerPhone": "0903226718", "OwnerAddress": "12 Lê Lợi, Quận 1", **owner})
        return body

    def test_creates_owner_account(self):
        res = self.client_for(self.manager).post("/api/horses", self.payload(), format="json")
        self.assertEqual(res.status_code, 201, res.data)
        account = res.data["OwnerAccount"]
        self.assertTrue(account["Created"] and account["TemporaryPassword"])
        owner = User.objects.get(email="thanhtung.pham@gmail.com")
        self.assertTrue(owner.must_change_password)
        self.assertEqual((owner.club_id, owner.phone), (self.club.id, "0903226718"))
        self.assertIn("HORSE_OWNER", owner.role_codes)
        self.assertEqual(res.data["OwnerID"], owner.id)

    def test_links_existing_owner_and_reports_all_errors(self):
        res = self.client_for(self.manager).post("/api/horses", self.payload(OwnerEmail=self.owner.email.upper(),
                                                                             OwnerPhone=""), format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data["OwnerID"], res.data["OwnerAccount"]["Created"]), (self.owner.id, False))
        res = self.client_for(self.manager).post("/api/horses", self.payload(
            MicrochipNumber="704000000000322", OwnerEmail="moi@gmail", OwnerPhone="0903 226 718",
            HorseName=""), format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["OwnerEmail"], ["Email thiếu phần đuôi tên miền."])
        self.assertEqual(res.data["OwnerPhone"], ["Số điện thoại không được chứa khoảng trắng."])
        self.assertEqual(res.data["HorseName"], ["Vui lòng nhập thông tin này."])
        res = self.client_for(self.manager).post("/api/horses", self.payload(OwnerEmail=self.vet.email), format="json")
        self.assertEqual(res.data["OwnerEmail"], ["Email này thuộc tài khoản nhân sự, không dùng làm chủ sở hữu ngựa."])
