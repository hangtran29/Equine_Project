"""Yêu cầu hỗ trợ: gửi, quản lý phản hồi, thông báo cho hai phía, kiểm tra nội dung."""
from apps.core.models import SupportRequest
from apps.training.tests.base import TrainingTestCase


class SupportRequestTests(TrainingTestCase):
    def test_owner_sends_and_manager_resolves(self):
        horse_id = self.owner_creates_horse()
        owner = self.client_for(self.owner)
        options = owner.get("/api/support-requests/options").data
        self.assertEqual(options["Contact"]["FullName"], self.manager.full_name)
        self.assertEqual([h["HorseID"] for h in options["Horses"]], [horse_id])
        self.assertFalse(options["CanManage"])

        res = owner.post("/api/support-requests", {"Topic": "HorseProfile", "HorseID": horse_id,
                                                   "Content": "  Hồ sơ chưa được cập nhật trạng thái.  "},
                         format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["Content"], "Hồ sơ chưa được cập nhật trạng thái.")
        self.assertEqual(res.data["RequesterRole"], "Chủ sở hữu ngựa")
        req_id = res.data["SupportRequestID"]

        manager = self.client_for(self.manager)
        self.assertIn("SUPPORT_REQUEST", [i["Type"] for i in manager.get("/api/notifications").data])
        rows = manager.get("/api/support-requests?Status=Open").data
        self.assertEqual([r["SupportRequestID"] for r in rows], [req_id])
        self.assertEqual(rows[0]["HorseName"], "Thunder")

        self.assertEqual(owner.post(f"/api/support-requests/{req_id}/resolve", {"Response": "x"},
                                    format="json").status_code, 403)
        self.assertEqual(manager.post(f"/api/support-requests/{req_id}/resolve", {"Response": "   "},
                                      format="json").data["Response"][0], "Nội dung không được chỉ chứa khoảng trắng.")
        res = manager.post(f"/api/support-requests/{req_id}/resolve",
                           {"Response": "Hồ sơ đang chờ bác sĩ thú y khám lâm sàng."}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["Status"], "Resolved")
        self.assertEqual(manager.post(f"/api/support-requests/{req_id}/resolve", {"Response": "lại"},
                                      format="json").status_code, 409)

        notes = owner.get("/api/notifications").data
        done = [i for i in notes if i["Type"] == "SUPPORT_RESOLVED"]
        self.assertEqual(done[0]["Message"], "Hồ sơ đang chờ bác sĩ thú y khám lâm sàng.")
        self.assertNotIn("SUPPORT_REQUEST", [i["Type"] for i in manager.get("/api/notifications").data])
        self.assertEqual(len(owner.get("/api/support-requests").data), 1)

    def test_content_rules_and_horse_scope(self):
        rider = self.client_for(self.rider)
        cases = {"": "Vui lòng nhập thông tin này.", "   ": "Nội dung không được chỉ chứa khoảng trắng.",
                 "!!! ???": "Nội dung phải có chữ hoặc chữ số, không chỉ gồm ký tự đặc biệt.",
                 "a" * 1001: "Nội dung vượt quá 1000 ký tự cho phép."}
        for content, message in cases.items():
            res = rider.post("/api/support-requests", {"Topic": "Training", "Content": content}, format="json")
            self.assertEqual(res.data["Content"][0], message)
        self.assertEqual(rider.post("/api/support-requests", {"Content": "Lịch tập trùng giờ"}, format="json")
                         .data["Topic"][0], "Vui lòng chọn thông tin này.")
        # chủ ngựa khác câu lạc bộ không chọn được ngựa không phải của mình
        horse_id = self.owner_creates_horse()
        res = self.client_for(self.other_owner).post("/api/support-requests", {
            "Topic": "HorseProfile", "HorseID": horse_id, "Content": "Xem giúp hồ sơ"}, format="json")
        self.assertEqual(res.status_code, 409)
        res = self.client_for(self.trainer).post("/api/support-requests", {
            "Topic": "HorseProfile", "HorseID": 999999, "Content": "Xem giúp hồ sơ"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(SupportRequest.objects.count(), 0)
        # nhân viên không thấy yêu cầu của người khác
        self.client_for(self.groom).post("/api/support-requests", {"Topic": "Care", "Content": "Thiếu cỏ khô"},
                                         format="json")
        self.assertEqual(rider.get("/api/support-requests").data, [])
        self.assertEqual(len(self.client_for(self.manager).get("/api/support-requests").data), 1)
