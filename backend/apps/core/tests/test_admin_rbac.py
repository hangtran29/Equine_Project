"""Quản trị (Manager): gán role, khóa / mở, đặt lại mật khẩu, bảng phân quyền, nhật ký, CLB; tài khoản cá nhân;
thông báo đã đọc; thống kê; lệnh create_club; dữ liệu demo Flow 2."""
import re
import secrets
from io import StringIO
from urllib.parse import parse_qs, urlparse

from django.core import mail
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from apps.accounts import rbac
from apps.accounts.models import Club, User
from apps.core.tests.helpers import TEST_PASSWORD
from apps.training.tests.base import TrainingTestCase


def login(email, password):
    return APIClient().post("/api/auth/login", {"Email": email, "Password": password}, format="json")


class PermissionGroupTests(SimpleTestCase):
    def test_every_permission_has_a_group(self):
        self.assertEqual(set(rbac.PERMISSION_GROUP), set(rbac.PERMISSIONS))
        for code, role in rbac.EXCLUSIVE_PERMISSIONS.items():
            self.assertIn(code, rbac.ROLE_PERMISSIONS[role])


class UserAdminTests(TrainingTestCase):
    def test_manager_edits_user_and_sets_roles(self):
        manager = self.client_for(self.manager)
        res = manager.patch(f"/api/users/{self.trainer2.id}", {"FullName": "Trần Văn Hai", "Phone": "0901234567"},
                            format="json")
        self.assertEqual((res.status_code, res.data["FullName"], res.data["Phone"]), (200, "Trần Văn Hai", "0901234567"))
        res = manager.put(f"/api/users/{self.trainer2.id}/roles", {"RoleCodes": ["TRAINER", "HEAD_TRAINER"]},
                          format="json")
        self.assertEqual(res.data["Roles"], ["HEAD_TRAINER", "TRAINER"])
        self.assertEqual(self.client_for(self.trainer2).get("/api/auth/me").data["Permissions"].count(
            "TRAINING_PLAN_APPROVE"), 1)                                   # có hiệu lực ngay

        self.assertEqual(manager.put(f"/api/users/{self.trainer2.id}/roles", {"RoleCodes": ["TRAINER", "HORSE_OWNER"]},
                                     format="json").data["code"], "OWNER_ROLE_EXCLUSIVE")
        self.assertEqual(manager.put(f"/api/users/{self.trainer2.id}/roles", {"RoleCodes": ["HORSE_OWNER"]},
                                     format="json").data["code"], "OWNER_ROLE_EXCLUSIVE")
        self.assertEqual(manager.put(f"/api/users/{self.manager.id}/roles", {"RoleCodes": ["TRAINER"]},
                                     format="json").data["code"], "SELF_ACTION")
        self.assertEqual(manager.put(f"/api/users/{self.trainer2.id}/roles", {"RoleCodes": ["NOPE"]},
                                     format="json").status_code, 400)
        self.assertEqual(manager.patch(f"/api/users/{self.other_vet.id}", {"FullName": "x"},
                                       format="json").status_code, 404)        # CLB khác
        self.assertEqual(self.client_for(self.head).put(f"/api/users/{self.trainer2.id}/roles",
                                                        {"RoleCodes": ["GROOM"]}, format="json").status_code, 403)

    def test_last_manager_and_pending_work(self):
        second = self.make_user("manager2@one.test", "CLUB_MANAGER", self.club)
        manager = self.client_for(self.manager)
        self.assertEqual(manager.put(f"/api/users/{second.id}/roles", {"RoleCodes": ["GROOM"]}, format="json")
                         .status_code, 200)
        self.assertEqual(self.client_for(second).get("/api/roles").status_code, 403)  # mất quyền ngay

        self.ready_horse()                                          # self.trainer đang phụ trách 1 ngựa
        res = manager.put(f"/api/users/{self.trainer.id}/roles", {"RoleCodes": ["GROOM"]}, format="json")
        self.assertEqual(res.data["code"], "ROLE_IN_USE")
        self.assertIn("phụ trách 1 ngựa", res.data["detail"])
        self.assertEqual(manager.post(f"/api/users/{self.trainer.id}/lock", {"Reason": "Kiểm tra khóa tài khoản"}, format="json").data["code"],
                         "ROLE_IN_USE")
        self.assertEqual(manager.put(f"/api/users/{self.owner.id}/roles", {"RoleCodes": ["GROOM"]}, format="json")
                         .data["code"], "ROLE_IN_USE")              # chủ ngựa đang có ngựa

    def test_lock_unlock_takes_effect_immediately(self):
        manager = self.client_for(self.manager)
        rider = self.client_for(self.rider)
        self.assertEqual(rider.get("/api/auth/me").status_code, 200)
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            res = manager.post(f"/api/users/{self.rider.id}/lock", {"Reason": "Nghỉ việc"}, format="json")
        self.assertEqual(res.data["Status"], "Suspended")
        self.assertEqual(rider.get("/api/auth/me").status_code, 401)            # token cũ hết dùng được
        self.assertEqual(login(self.rider.email, TEST_PASSWORD).status_code, 401)
        self.assertIn("tạm khóa", mail.outbox[0].subject)
        self.assertEqual(manager.post(f"/api/users/{self.manager.id}/lock", {"Reason": "Kiểm tra khóa tài khoản"}, format="json").data["code"],
                         "SELF_ACTION")
        self.assertEqual(manager.post(f"/api/users/{self.rider.id}/unlock").data["Status"], "Active")
        self.assertEqual(login(self.rider.email, TEST_PASSWORD).status_code, 200)
        self.assertEqual(len(manager.get("/api/users?Status=Active&Search=rider").data), 2)

    def test_manager_reset_password_revokes_old_tokens(self):
        manager = self.client_for(self.manager)
        groom = self.client_for(self.groom)
        res = manager.post(f"/api/users/{self.groom.id}/reset-password")
        temporary = res.data["TemporaryPassword"]
        self.assertEqual(groom.get("/api/auth/me").status_code, 401)
        self.assertEqual(login(self.groom.email, temporary).status_code, 200)
        self.assertEqual(manager.post(f"/api/users/{self.manager.id}/reset-password").data["code"], "SELF_ACTION")


class AccountSelfServiceTests(TrainingTestCase):
    def test_change_password_and_profile(self):
        me = self.client_for(self.rider)
        self.assertEqual(me.patch("/api/auth/me", {"Address": "12 Lê Lợi, Q1", "Phone": "123"},
                                  format="json").status_code, 400)
        self.assertEqual(me.patch("/api/auth/me", {"Address": "12 Lê Lợi, Q1"}, format="json").data["Address"],
                         "12 Lê Lợi, Q1")
        res = me.post("/api/auth/change-password", {"CurrentPassword": "sai", "NewPassword": "newpass123"},
                      format="json")
        self.assertIn("CurrentPassword", res.data)
        res = me.post("/api/auth/change-password", {"CurrentPassword": TEST_PASSWORD, "NewPassword": "newpass123"},
                      format="json")
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.data)
        self.assertEqual(me.get("/api/auth/me").status_code, 401)                # token cũ bị thu hồi
        fresh = APIClient()
        fresh.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        self.assertEqual(fresh.get("/api/auth/me").status_code, 200)
        self.assertEqual(login(self.rider.email, "newpass123").status_code, 200)

    def test_forgot_password_flow(self):
        anonymous = APIClient()
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(anonymous.post("/api/auth/password-reset", {"Email": "nobody@one.test"},
                                            format="json").status_code, 200)
        self.assertEqual(mail.outbox, [])
        with self.captureOnCommitCallbacks(execute=True):
            anonymous.post("/api/auth/password-reset", {"Email": self.vet.email.upper()}, format="json")
        link = re.search(r"https?://\S+/reset-password\?\S+", mail.outbox[0].body).group(0)
        query = parse_qs(urlparse(link).query)
        body = {"Uid": query["uid"][0], "Token": query["token"][0], "NewPassword": "reset-pass-1"}
        self.assertEqual(anonymous.post("/api/auth/password-reset/confirm", {**body, "Token": "bad"},
                                        format="json").status_code, 400)
        self.assertEqual(anonymous.post("/api/auth/password-reset/confirm", body, format="json").status_code, 200)
        self.assertEqual(login(self.vet.email, "reset-pass-1").status_code, 200)
        self.assertEqual(anonymous.post("/api/auth/password-reset/confirm", body, format="json").status_code, 400)


class RoleMatrixTests(TrainingTestCase):
    def test_matrix_edit_with_safety_locks(self):
        manager = self.client_for(self.manager)
        data = manager.get("/api/roles").data
        roles = {r["RoleCode"]: r for r in data["Roles"]}
        self.assertIn("TRAINING_PLAN_MANAGE", roles["TRAINER"]["Permissions"])
        self.assertEqual(roles["TRAINER"]["UserCount"], 2)
        self.assertTrue(roles["HORSE_OWNER"]["IsLocked"])
        self.assertIn({"RoleCode": "GROOM", "PermissionCode": "MEDICAL_SIGN",
                       "Reason": "Quyền này chỉ dành cho VETERINARIAN."}, data["LockedCells"])
        self.assertEqual(self.client_for(self.trainer).get("/api/roles").status_code, 403)

        def put(role, codes):
            return manager.put(f"/api/roles/{role}/permissions", {"PermissionCodes": codes}, format="json")

        groom = roles["GROOM"]["Permissions"]
        self.assertEqual(put("GROOM", groom + ["MEDICAL_SIGN"]).data["code"], "PERMISSION_LOCKED")
        self.assertEqual(put("HORSE_OWNER", ["OWNER_VIEW"]).data["code"], "PERMISSION_LOCKED")
        manager_perms = [c for c in roles["CLUB_MANAGER"]["Permissions"] if c != "RBAC_MANAGE"]
        self.assertEqual(put("CLUB_MANAGER", manager_perms).data["code"], "PERMISSION_LOCKED")
        trainer_perms = [c for c in roles["TRAINER"]["Permissions"] if c != "TRAINING_REVIEW"]
        self.assertEqual(put("TRAINER", trainer_perms).data["code"], "PERMISSION_ORPHAN")

        # Cho Groom quyền xem ngựa đã có; thêm quyền báo cáo vật tư cho Work Rider -> có hiệu lực ngay
        res = put("WORK_RIDER", roles["WORK_RIDER"]["Permissions"] + ["INVENTORY_REQUEST"])
        self.assertEqual((res.status_code, res.data["Added"]), (200, ["INVENTORY_REQUEST"]))
        self.assertIn("INVENTORY_REQUEST", self.client_for(self.rider).get("/api/auth/me").data["Permissions"])

        # Trainer được quyền duyệt giáo án nhưng không tự duyệt giáo án của mình
        put("TRAINER", roles["TRAINER"]["Permissions"] + ["TRAINING_PLAN_APPROVE"])
        horse_id = self.approved_horse()
        self.assign(horse_id)
        trainer = self.client_for(self.trainer)
        plan = trainer.post("/api/training-plans", {
            "HorseID": horse_id, "Goal": "x", "StartDate": "2030-01-01",
            "Stages": [{"StageName": "A", "StartDate": "2030-01-01"}]}, format="json").data
        trainer.post(f"/api/training-plans/{plan['TrainingPlanID']}/submit")
        self.assertEqual(trainer.post(f"/api/training-plans/{plan['TrainingPlanID']}/approve", {}, format="json")
                         .data["code"], "SELF_APPROVAL")

        res = manager.post("/api/roles/reset-defaults")
        self.assertEqual(res.data["Removed"], {"TRAINER": ["TRAINING_PLAN_APPROVE"],
                                               "WORK_RIDER": ["INVENTORY_REQUEST"]})
        types = [log["ActionType"] for log in manager.get("/api/audit-logs?Limit=5").data["Items"]]
        self.assertIn("RESET_ROLE_PERMISSIONS", types)


class ClubAuditDashboardTests(TrainingTestCase):
    def test_my_club_audit_logs_dashboard(self):
        manager = self.client_for(self.manager)
        self.assertEqual(self.client_for(self.trainer).get("/api/clubs/mine").data["ClubName"], "Club One")
        self.assertEqual(self.client_for(self.trainer).patch("/api/clubs/mine", {"Phone": "0281234567"},
                                                             format="json").status_code, 403)
        res = manager.patch("/api/clubs/mine", {"Phone": "0281234567", "Address": "1 Lê Duẩn"}, format="json")
        self.assertEqual((res.data["Phone"], res.data["Address"]), ("0281234567", "1 Lê Duẩn"))
        self.assertEqual(manager.patch("/api/clubs/mine", {"ClubName": "club two"}, format="json").status_code, 400)

        self.ready_horse()
        logs = manager.get("/api/audit-logs").data
        self.assertGreater(logs["Total"], 3)
        self.assertTrue(all(row["UserName"] for row in logs["Items"]))
        other = self.client_for(self.other_manager).get("/api/audit-logs").data
        self.assertEqual(other["Total"], 0)                          # CLB khác không thấy
        self.assertEqual(self.client_for(self.trainer).get("/api/audit-logs").status_code, 403)

        board = manager.get("/api/dashboard").data
        self.assertEqual(board["Horses"]["ByRegistrationStatus"]["Approved"], 1)
        self.assertEqual(board["Training"]["ActiveAssignments"], 1)
        self.assertEqual(board["Training"]["PlansByStatus"]["Active"], 1)
        self.assertIn("TRAINER", board["Users"]["ByRole"])
        self.assertEqual(self.client_for(self.head).get("/api/dashboard").status_code, 403)


class NotificationReadTests(TrainingTestCase):
    def test_mark_read(self):
        horse_id = self.owner_creates_horse()
        self.client_for(self.owner).post(f"/api/horses/{horse_id}/submit")          # Manager có việc cần xác minh
        manager = self.client_for(self.manager)
        items = manager.get("/api/notifications").data
        self.assertTrue(items and not items[0]["IsRead"] and items[0]["Key"])
        self.assertEqual(manager.get("/api/notifications/unread-count").data["Unread"], len(items))
        self.assertEqual(manager.post("/api/notifications/read", {"Keys": [items[0]["Key"]]}, format="json")
                         .data["Marked"], 1)
        self.assertTrue(next(i for i in manager.get("/api/notifications").data if i["Key"] == items[0]["Key"])["IsRead"])
        self.assertEqual(len(manager.get("/api/notifications?unread=1").data), len(items) - 1)
        manager.post("/api/notifications/read", {"All": True}, format="json")
        self.assertEqual(manager.get("/api/notifications/unread-count").data["Unread"], 0)
        self.assertEqual(manager.post("/api/notifications/read", {"Keys": "x"}, format="json").status_code, 400)


class CreateClubCommandTests(TestCase):
    def test_create_club_with_first_manager(self):
        out = StringIO()
        call_command("create_club", "--name=Saigon Racing", "--phone=0281234567", "--manager-email=boss@sgr.test",
                     "--manager-name=Nguyễn Văn A", stdout=out)
        club = Club.objects.get(club_name="Saigon Racing")
        boss = User.objects.get(email="boss@sgr.test")
        self.assertEqual((boss.club_id, sorted(boss.role_codes)), (club.id, ["CLUB_MANAGER"]))
        password = re.search(r"Mật khẩu tạm: (\S+)", out.getvalue()).group(1)
        self.assertEqual(login("boss@sgr.test", password).status_code, 200)
        with self.assertRaises(Exception):
            call_command("create_club", "--name=Saigon Racing", "--manager-email=x@sgr.test",
                         "--manager-name=X", stdout=StringIO())


class SeedPlanDemoTests(TestCase):
    def test_seed_creates_training_demo_once(self):
        from apps.training.models import TrainingPlan, TrainingSession

        call_command("seed_demo", f"--password={secrets.token_urlsafe(18)}", stdout=StringIO())
        call_command("seed_demo", f"--password={secrets.token_urlsafe(18)}", stdout=StringIO())
        self.assertEqual(TrainingPlan.objects.count(), 1)
        self.assertEqual(TrainingSession.objects.count(), 10)
        owner = APIClient()
        owner.force_authenticate(User.objects.get(email="owner@equi.local"))
        plan = TrainingPlan.objects.get()
        body = owner.get(f"/api/owner/training-plans/{plan.id}").data
        self.assertEqual([s["StageState"] for s in body["Stages"]], ["Closed", "InProgress"])
        self.assertEqual(body["Stages"][0]["Summary"]["ReviewedSessions"], 5)
        self.assertEqual(len(owner.get(f"/api/owner/horses/{plan.assignment.horse_id}/training-sessions").data), 8)
