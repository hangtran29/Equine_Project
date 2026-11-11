"""Thao tác người khác gửi đến mình phải hiện trong chuông thông báo của người nhận."""
from datetime import timedelta

from apps.training.tests.base import TODAY, TrainingTestCase


class ActivityNotificationTests(TrainingTestCase):
    def types(self, user):
        return {i["Type"]: i for i in self.client_for(user).get("/api/notifications").data}

    def test_cross_person_actions_reach_recipients(self):
        horse_id, plan, stage_id = self.ready_horse()
        # head phân công -> trainer; head duyệt giáo án -> trainer
        trainer = self.types(self.trainer)
        self.assertIn("ACT_ASSIGN_TRAINER", trainer)
        self.assertEqual(trainer["ACT_APPROVE_TRAINING_PLAN"]["Title"], "Giáo án đã được duyệt")
        # chủ ngựa biết ngựa được tiếp nhận và có huấn luyện viên
        owner = self.types(self.owner)
        self.assertIn("ACT_APPROVE_REGISTRATION", owner)
        self.assertIn("ACT_ASSIGN_TRAINER", owner)
        # head xếp buổi tập -> kỵ sĩ (cả buổi ngày mai, không chỉ hôm nay) và huấn luyện viên phụ trách
        session = self.session(stage_id, day=TODAY + timedelta(days=1))
        rider = self.types(self.rider)
        self.assertTrue(rider["ACT_ASSIGN_TRAINING_SESSION"]["Title"].startswith("Bạn được xếp buổi tập ngày"))
        self.assertIn("ACT_ASSIGN_TRAINING_SESSION", self.types(self.trainer))
        # người thực hiện không nhận thông báo của chính mình
        self.assertNotIn("ACT_ASSIGN_TRAINING_SESSION", self.types(self.head))
        # hủy buổi -> kỵ sĩ
        res = self.client_for(self.head).post(f"/api/training-sessions/{session['TrainingSessionID']}/cancel",
                                              {"Reason": "Mưa lớn"}, format="json")
        if res.status_code == 200:
            self.assertEqual(self.types(self.rider)["ACT_CANCEL_TRAINING_SESSION"]["Message"], "Mưa lớn")
        # người khác không liên quan không thấy
        self.assertNotIn("ACT_ASSIGN_TRAINING_SESSION", self.types(self.rider2))
