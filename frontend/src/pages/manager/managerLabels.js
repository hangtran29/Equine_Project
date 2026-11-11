export const roleLabels = { CLUB_MANAGER: 'Quản lý câu lạc bộ', HEAD_TRAINER: 'Huấn luyện viên trưởng', TRAINER: 'Huấn luyện viên', WORK_RIDER: 'Kỵ sĩ tập luyện', VETERINARIAN: 'Bác sĩ thú y', GROOM: 'Người chăm sóc ngựa', HORSE_OWNER: 'Chủ ngựa' }
export const permissionLabels = {
  CLUB_MANAGE: 'Quản lý câu lạc bộ', RBAC_MANAGE: 'Quản lý tài khoản và phân quyền', AUDIT_VIEW: 'Xem nhật ký hệ thống',
  HORSE_VIEW: 'Xem ngựa trong câu lạc bộ', HORSE_REGISTER: 'Đăng ký ngựa', HORSE_REGISTER_REVIEW: 'Duyệt tiếp nhận ngựa',
  HORSE_ARCHIVE: 'Lưu trữ hồ sơ ngựa', PROFILE_EDIT_REQUEST: 'Đề nghị sửa lý lịch', PROFILE_EDIT_APPROVE: 'Duyệt sửa lý lịch',
  HORSE_ASSESS: 'Đánh giá năng lực ngựa', TRAINER_ASSIGN: 'Phân công huấn luyện viên', TRAINING_PLAN_MANAGE: 'Lập giáo án',
  TRAINING_PLAN_APPROVE: 'Duyệt giáo án', TRAINING_SESSION_ASSIGN: 'Xếp buổi tập', TRAINING_SESSION_SUPERVISE: 'Giám sát buổi tập',
  TRAINING_RESULT_UPDATE: 'Cập nhật kết quả tập', TRAINING_REVIEW: 'Đánh giá kết quả tập', HEALTH_REPORT: 'Báo cáo sức khỏe',
  MEDICAL_MANAGE: 'Quản lý khám và điều trị', MEDICAL_SIGN: 'Chốt phiếu khám', TRAINING_LOCK_MANAGE: 'Quản lý khóa huấn luyện',
  CARE_MANAGE: 'Quản lý chăm sóc', DIET_MANAGE: 'Quản lý khẩu phần', INVENTORY_REQUEST: 'Yêu cầu vật tư', INVENTORY_MANAGE: 'Quản lý kho', OWNER_VIEW: 'Xem thông tin ngựa sở hữu',
}

// Mã loại vật tư và trạng thái trùng khớp lựa chọn từ backend/apps/care/models.py.
// Không thay đổi giá trị (key) vì API lưu và lọc theo các mã này.
export const itemTypes = {
  Food: 'Thức ăn',
  Medicine: 'Thuốc',
  'Care Equipment': 'Dụng cụ chăm sóc',
}

export const itemStatuses = {
  Available: 'Còn hàng',
  'Low Stock': 'Sắp hết hàng',
  'Out of Stock': 'Hết hàng',
  Inactive: 'Ngừng sử dụng',
}
