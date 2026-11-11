"""Giống ngựa và màu lông: chọn trong danh mục hoặc tự nhập."""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from apps.core.validators import clean_breed, clean_coat_color


class FreeBreedColorTests(SimpleTestCase):
    def fail_message(self, fn, value):
        with self.assertRaises((ValidationError, DjangoValidationError)) as ctx:
            fn(value)
        detail = getattr(ctx.exception, "detail", None) or getattr(ctx.exception, "messages", None)
        return str(detail[0] if isinstance(detail, list) else detail)

    def test_catalog_and_custom_values(self):
        self.assertEqual(clean_breed("Thoroughbred"), "Thoroughbred")
        self.assertEqual(clean_breed("  Hanoverian   (Đức) "), "Hanoverian (Đức)")
        self.assertEqual(clean_coat_color("Nâu đỏ"), "Nâu đỏ")
        self.assertEqual(clean_coat_color("Xám đốm trắng"), "Xám đốm trắng")

    def test_invalid_custom_values(self):
        self.assertEqual(self.fail_message(clean_breed, "   "), "Vui lòng chọn hoặc nhập giống ngựa.")
        self.assertEqual(self.fail_message(clean_coat_color, None), "Vui lòng chọn hoặc nhập màu lông.")
        self.assertEqual(self.fail_message(clean_breed, "12345"), "Giống ngựa phải có chữ cái, không chỉ gồm chữ số hoặc ký tự đặc biệt.")
        self.assertEqual(self.fail_message(clean_coat_color, "Nâu <b>"), "Màu lông chứa ký tự không hợp lệ.")
        self.assertEqual(self.fail_message(clean_coat_color, "a" * 51), "Màu lông vượt quá 50 ký tự cho phép.")
