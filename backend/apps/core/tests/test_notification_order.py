"""Thứ tự chuông thông báo: mới nhất trước, thông báo khẩn cũ không che thông báo mới (chuông chỉ hiện 5 mục đầu)."""
from datetime import datetime

from django.test import SimpleTestCase

from apps.core.notifications import _item, ordered


class NotificationOrderTests(SimpleTestCase):
    def test_newest_first_even_when_older_items_are_urgent(self):
        old_urgent = [_item("TRAINING_LOCK", "Ngựa bị khóa tập", "TrainingLock", n, at=datetime(2026, 11, 8, 15, n), urgent=True)
                      for n in range(1, 6)]
        plan = _item("PLAN_TO_APPROVE", "Giáo án chờ duyệt", "TrainingPlan", 9, at=datetime(2026, 11, 9, 12, 40))
        result = ordered(old_urgent + [plan])
        self.assertEqual(result[0]["Type"], "PLAN_TO_APPROVE")
        self.assertEqual([i["EntityID"] for i in result[1:]], [5, 4, 3, 2, 1])

    def test_same_time_urgent_first_and_duplicates_removed(self):
        at = datetime(2026, 11, 9, 9, 0)
        normal = _item("A", "x", "E", 1, at=at)
        urgent = _item("B", "y", "E", 2, at=at, urgent=True)
        result = ordered([normal, urgent, dict(normal)])
        self.assertEqual([i["Type"] for i in result], ["B", "A"])
