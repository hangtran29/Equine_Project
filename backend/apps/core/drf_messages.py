"""
Câu lỗi chuẩn cho MỌI ô nhập của API (giống bảng quy tắc đã thống nhất), thay câu mặc định của DRF.

- Bỏ trống / thiếu / null: "Vui lòng nhập thông tin này."; ô chọn (danh mục, khóa ngoại): "Vui lòng chọn thông tin này."
- Chỉ gõ khoảng trắng: "Nội dung không được chỉ chứa khoảng trắng."
- Chỉ gồm ký tự đặc biệt (ô chữ tự do): "Nội dung phải có chữ hoặc chữ số, không chỉ gồm ký tự đặc biệt."
- Vượt giới hạn: "Nội dung vượt quá N ký tự cho phép."
- Số, ngày, giờ sai định dạng; lựa chọn ngoài danh mục.
Gọi install() một lần khi khởi động (CoreConfig.ready). Câu tiếng Anh: apps/core/i18n.py.
"""
from rest_framework import fields, relations

from . import validators as V

NUMBER = {
    "invalid": "Giá trị phải là số.",
    "max_value": "Giá trị không được lớn hơn {max_value}.",
    "min_value": "Giá trị không được nhỏ hơn {min_value}.",
    "max_string_length": "Giá trị quá dài.",
}
SKIP_TEXT_CHECK = ("password", "token", "uid", "credential", "url", "key")


def _set(cls, **messages):
    cls.default_error_messages = {**getattr(cls, "default_error_messages", {}), **messages}


def install():
    _set(fields.Field, required=V.MSG_REQUIRED, null=V.MSG_REQUIRED)
    _set(fields.CharField, blank=V.MSG_REQUIRED, invalid="Giá trị không hợp lệ.",
         max_length="Nội dung vượt quá {max_length} ký tự cho phép.",
         min_length="Nội dung phải có ít nhất {min_length} ký tự.")
    _set(fields.EmailField, invalid="Email không đúng định dạng.")
    for cls in (fields.IntegerField, fields.FloatField):
        _set(cls, **NUMBER)
    _set(fields.DecimalField, **NUMBER, max_digits="Giá trị vượt quá giới hạn cho phép.",
         max_decimal_places="Giá trị có quá nhiều chữ số thập phân.",
         max_whole_digits="Giá trị vượt quá giới hạn cho phép.")
    _set(fields.DateField, invalid="Ngày không đúng định dạng dd/mm/yyyy.", datetime="Ngày không đúng định dạng dd/mm/yyyy.")
    _set(fields.DateTimeField, invalid="Ngày giờ không đúng định dạng dd/mm/yyyy HH:mm.", date="Ngày giờ không đúng định dạng dd/mm/yyyy HH:mm.")
    _set(fields.TimeField, invalid="Giờ không đúng định dạng HH:mm.")
    _set(fields.BooleanField, invalid="Giá trị không hợp lệ.")
    _set(fields.ChoiceField, required=V.MSG_SELECT, null=V.MSG_SELECT, blank=V.MSG_SELECT,
         invalid_choice="Lựa chọn không có trong danh mục.")
    _set(fields.MultipleChoiceField, not_a_list="Lựa chọn không hợp lệ.", empty=V.MSG_SELECT)
    _set(fields.ListField, not_a_list="Danh sách không hợp lệ.", empty="Vui lòng chọn ít nhất một mục.",
         min_length="Vui lòng chọn ít nhất {min_length} mục.", max_length="Chỉ được chọn tối đa {max_length} mục.")
    _set(relations.RelatedField, required=V.MSG_SELECT, null=V.MSG_SELECT)
    _set(relations.PrimaryKeyRelatedField, required=V.MSG_SELECT, null=V.MSG_SELECT,
         does_not_exist="Không tìm thấy dữ liệu tương ứng.", incorrect_type="Lựa chọn không hợp lệ.")
    _set(relations.ManyRelatedField, required=V.MSG_SELECT, null=V.MSG_SELECT, empty="Vui lòng chọn ít nhất một mục.")

    # Ô chọn đối tượng gửi dạng số (HorseID, WorkRiderID...): thiếu thì "Vui lòng chọn thông tin này."
    original_bind = fields.Field.bind

    def bind(self, field_name, parent):
        original_bind(self, field_name, parent)
        if isinstance(self, fields.IntegerField) and str(field_name).endswith("ID"):
            self.error_messages = {**self.error_messages, "required": V.MSG_SELECT, "null": V.MSG_SELECT,
                                   "invalid": "Lựa chọn không hợp lệ."}

    fields.Field.bind = bind

    original = fields.CharField.run_validation

    def run_validation(self, data=fields.empty):
        # Chỉ có khoảng trắng: báo riêng (DRF mặc định cắt hết rồi báo "bỏ trống").
        if isinstance(data, str) and data and not data.strip() and not self.allow_blank:
            raise fields.ValidationError(V.MSG_WHITESPACE)
        value = original(self, data)
        name = (self.field_name or "").lower()
        has_own_check = self.parent is not None and hasattr(self.parent, f"validate_{self.field_name}")
        if (isinstance(value, str) and value.strip() and type(self) is fields.CharField and not has_own_check
                and not any(word in name for word in SKIP_TEXT_CHECK)
                and not any(ch.isalnum() for ch in value)):
            raise fields.ValidationError(V.MSG_SYMBOLS_ONLY)
        return value

    fields.CharField.run_validation = run_validation
