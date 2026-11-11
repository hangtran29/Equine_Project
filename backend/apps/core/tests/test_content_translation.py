"""Dịch nội dung người dùng nhập khi giao diện ở chế độ EN (không gọi dịch máy trong test)."""
from apps.core.tests.helpers import Flow1TestCase
from django.test import SimpleTestCase, override_settings
from pathlib import Path
import tempfile
import json
from unittest.mock import patch


class ContentTranslationTests(Flow1TestCase):
    def test_translate_endpoint(self):
        client = self.client_for(self.owner)
        texts = ["Viêm gân gấp chân trước trái độ 2", "Reason: Viêm gân gấp chân trước trái độ 2 · Expected until: 19/11/2026",
                 "Cho ăn theo khẩu phần: Cỏ khô 5 kg (Trộn muối khoáng 30 g)", self.owner.full_name, "Already English"]
        res = client.post("/api/translate", {"Texts": texts}, format="json")
        self.assertEqual(res.status_code, 200)
        out = res.data["Translations"]
        self.assertEqual(out[texts[0]], "Grade 2 flexor tendinitis, left foreleg")
        self.assertEqual(out[texts[1]], "Reason: Grade 2 flexor tendinitis, left foreleg · Expected until: 19/11/2026")
        self.assertEqual(out[texts[2]], "Feed according to diet: Hay 5 kg (Mix in 30 g of mineral salt)")
        self.assertNotIn(texts[3], out)          # tên người giữ nguyên
        self.assertNotIn(texts[4], out)
        self.assertEqual(self.client.post("/api/translate", {"Texts": texts}, format="json").status_code, 401)


class ContentTranslationConfigTests(SimpleTestCase):
    @override_settings(CONTENT_TRANSLATION=False)
    def test_disabled_translation_never_contacts_a_provider(self):
        from apps.core import content_i18n
        with patch.object(content_i18n, "_machine_one") as provider:
            self.assertEqual(content_i18n.machine_translate(["Nội dung riêng"], set()), {})
        provider.assert_not_called()

    def test_opted_in_translations_are_cached_without_network_in_tests(self):
        from apps.core import content_i18n
        with tempfile.TemporaryDirectory(prefix="equi-translation-test-") as root:
            cache = Path(root) / "cache.json"
            with override_settings(CONTENT_TRANSLATION=True, TRANSLATION_CACHE_FILE=cache), \
                    patch.object(content_i18n, "_cache", None), \
                    patch.dict(content_i18n._offline, {"until": 0}), \
                    patch.object(content_i18n, "_machine_one", return_value="A translated note"):
                result = content_i18n.machine_translate(["Ghi chú mới"], set())
                self.assertEqual(result, {"Ghi chú mới": "A translated note"})
                self.assertEqual(json.loads(cache.read_text(encoding="utf8")), result)
