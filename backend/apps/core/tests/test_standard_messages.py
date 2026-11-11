"""Câu lỗi chuẩn trên các form Flow 2–4 (bỏ trống, khoảng trắng, ký tự đặc biệt, ô chọn, định dạng) và bản tiếng Anh."""
import re
from pathlib import Path

from django.test import SimpleTestCase

from apps.core.i18n import translate_text
from apps.training.tests.base import TrainingTestCase


class StandardMessageTests(TrainingTestCase):
    def test_flow2_to_flow4_forms(self):
        horse_id, _, stage_id = self.ready_horse()

        def post(user, url, body):
            return self.client_for(user).post(url, body, format="json").data

        res = post(self.trainer, "/api/training-plans", {"Goal": "   ", "StartDate": "31/02/2026"})
        self.assertEqual(res["HorseID"], ["Vui lòng chọn thông tin này."])
        self.assertEqual(res["Goal"], ["Nội dung không được chỉ chứa khoảng trắng."])
        self.assertEqual(res["StartDate"], ["Ngày không đúng định dạng dd/mm/yyyy."])
        res = post(self.head, "/api/training-sessions", {"TrainingPlanStageID": stage_id, "TrainingType": "!!!",
                                                         "StartTime": "25:00", "TrainingLoad": "abc"})
        self.assertEqual(res["WorkRiderID"], ["Vui lòng chọn thông tin này."])
        self.assertEqual(res["StartTime"], ["Giờ không đúng định dạng HH:mm."])
        self.assertEqual(res["TrainingType"], ["Nội dung phải có chữ hoặc chữ số, không chỉ gồm ký tự đặc biệt."])
        self.assertEqual(res["TrainingLoad"], ["Giá trị phải là số."])
        res = post(self.groom, f"/api/horses/{horse_id}/health-reports", {"Severity": "X", "Description": "   "})
        self.assertEqual(res["Severity"], ["Lựa chọn không có trong danh mục."])
        self.assertEqual(res["Description"], ["Nội dung không được chỉ chứa khoảng trắng."])
        res = post(self.vet, f"/api/horses/{horse_id}/vaccinations", {})
        self.assertEqual(res["VaccineName"], ["Vui lòng nhập thông tin này."])
        res = post(self.vet, f"/api/horses/{horse_id}/medical-schedules", {})
        self.assertEqual(res["ScheduleType"], ["Vui lòng chọn thông tin này."])
        res = post(self.manager, "/api/care-tasks", {})
        self.assertEqual((res["HorseID"], res["TaskType"]), (["Vui lòng chọn thông tin này."], ["Vui lòng chọn thông tin này."]))
        res = post(self.manager, "/api/inventory-items", {"ItemName": "@@", "Unit": ""})
        self.assertEqual(res["ItemName"], ["Nội dung phải có chữ hoặc chữ số, không chỉ gồm ký tự đặc biệt."])
        self.assertEqual(res["Unit"], ["Vui lòng nhập thông tin này."])
        res = post(self.vet, f"/api/horses/{horse_id}/training-locks", {})
        self.assertEqual(res["Reason"], ["Vui lòng nhập thông tin này."])
        # tiếng Anh khi bấm EN
        res = self.client_for(self.manager).post("/api/care-tasks?lang=en", {}, format="json").data
        self.assertEqual(res["TaskType"], ["Please make a selection."])

    def test_urgent_count(self):
        horse_id, _, stage_id = self.ready_horse()
        self.session(stage_id)
        res = self.client_for(self.rider).post(f"/api/horses/{horse_id}/health-reports", {
            "Severity": "Urgent", "Description": "Ngựa đi khập khiễng chân trước trái"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        vet = self.client_for(self.vet)
        count = vet.get("/api/notifications/unread-count").data
        self.assertGreaterEqual(count["UrgentUnread"], 1)
        self.assertTrue(all(i["Priority"] == "High" for i in vet.get("/api/notifications?urgent=1").data))


class EnglishCoverageTests(SimpleTestCase):
    """Mọi câu lỗi chuẩn tiếng Việt trong bộ kiểm tra dùng chung đều có bản tiếng Anh."""

    def test_messages_translated(self):
        root = Path(__file__).resolve().parents[1]
        text = (root / "validators.py").read_text(encoding="utf-8") + (root / "drf_messages.py").read_text(encoding="utf-8")
        missing = []
        for message in set(re.findall(r'"([^"{}]*[À-ỹà-ỹ][^"{}]*\.)"', text)):
            if len(message) > 90 or ";" in message or message.startswith(("Kiểm tra", "Ô nhập", "Nội dung vượt quá N")):
                continue                                   # chú thích trong mã, không phải câu lỗi
            if translate_text(message) == message:
                missing.append(message)
        self.assertEqual(sorted(missing), [])
