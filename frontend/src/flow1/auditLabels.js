// Tên dễ đọc (VI / EN) cho nhật ký hệ thống. Mã thao tác và tên bảng lấy đúng theo backend (log_action).
import { currentLang } from '../i18n/runtime.js'
import { permissionLabels, roleLabels } from '../pages/manager/managerLabels.js'

// [nhóm, tiếng Việt, English]
export const ACTIONS = {
  // Tài khoản và phân quyền
  CREATE_USER: ['account', 'Tạo tài khoản', 'Created an account'],
  UPDATE_USER: ['account', 'Sửa thông tin tài khoản', 'Updated an account'],
  LOCK_USER: ['account', 'Khóa tài khoản', 'Locked an account'],
  UNLOCK_USER: ['account', 'Mở khóa tài khoản', 'Unlocked an account'],
  CHANGE_USER_ROLES: ['account', 'Đổi chức vụ', 'Changed roles'],
  UPDATE_ROLE_PERMISSIONS: ['account', 'Sửa quyền của chức vụ', 'Changed role permissions'],
  RESET_ROLE_PERMISSIONS: ['account', 'Khôi phục quyền mặc định', 'Restored default permissions'],
  CHANGE_PASSWORD: ['account', 'Đổi mật khẩu', 'Changed password'],
  REQUEST_PASSWORD_RESET: ['account', 'Yêu cầu đặt lại mật khẩu', 'Requested a password reset'],
  RESET_PASSWORD: ['account', 'Đặt lại mật khẩu', 'Reset password'],
  RESET_USER_PASSWORD: ['account', 'Cấp lại mật khẩu cho tài khoản', 'Reset a user password'],
  LOGIN_GOOGLE: ['account', 'Đăng nhập bằng Google', 'Signed in with Google'],
  REGISTER_OWNER: ['account', 'Đăng ký chủ ngựa', 'Registered a horse owner'],
  CREATE_CLUB: ['account', 'Tạo câu lạc bộ', 'Created the club'],
  UPDATE_CLUB: ['account', 'Sửa thông tin câu lạc bộ', 'Updated club details'],
  SUPPORT_REQUEST_CREATE: ['account', 'Gửi yêu cầu hỗ trợ', 'Sent a support request'],
  SUPPORT_REQUEST_RESOLVE: ['account', 'Xử lý yêu cầu hỗ trợ', 'Resolved a support request'],
  // Hồ sơ ngựa
  CREATE_HORSE: ['horse', 'Tạo hồ sơ ngựa', 'Created a horse profile'],
  UPDATE_HORSE: ['horse', 'Sửa hồ sơ ngựa', 'Updated a horse profile'],
  SUBMIT_REGISTRATION: ['horse', 'Gửi hồ sơ đăng ký', 'Submitted a registration'],
  VERIFY_REGISTRATION: ['horse', 'Xác minh hồ sơ đăng ký', 'Verified a registration'],
  APPROVE_REGISTRATION: ['horse', 'Duyệt tiếp nhận ngựa', 'Approved a horse intake'],
  REJECT_REGISTRATION: ['horse', 'Trả lại hồ sơ đăng ký', 'Returned a registration'],
  ARCHIVE_HORSE: ['horse', 'Lưu trữ hồ sơ ngựa', 'Archived a horse'],
  ADD_DOCUMENT: ['horse', 'Thêm giấy tờ', 'Added a document'],
  DELETE_DOCUMENT: ['horse', 'Xóa giấy tờ', 'Deleted a document'],
  REQUEST_PROFILE_CHANGE: ['horse', 'Gửi yêu cầu sửa hồ sơ', 'Requested a profile change'],
  CREATE_STALL: ['horse', 'Tạo ô chuồng', 'Created a stall'],
  MOVE_STALL: ['horse', 'Chuyển chuồng', 'Moved stalls'],
  // Huấn luyện
  ASSESS_HORSE: ['training', 'Đánh giá ngựa', 'Assessed a horse'],
  ASSIGN_TRAINER: ['training', 'Phân công huấn luyện viên', 'Assigned a trainer'],
  END_TRAINER_ASSIGNMENT: ['training', 'Kết thúc phân công huấn luyện viên', 'Ended a trainer assignment'],
  UPDATE_TRAINER_PROFILE: ['training', 'Sửa hồ sơ huấn luyện viên', 'Updated a trainer profile'],
  ADD_TRAINER_CREDENTIAL: ['training', 'Thêm chứng chỉ huấn luyện viên', 'Added a trainer credential'],
  DELETE_TRAINER_CREDENTIAL: ['training', 'Xóa chứng chỉ huấn luyện viên', 'Deleted a trainer credential'],
  ADD_TRAINER_RACE_RESULT: ['training', 'Thêm thành tích thi đấu', 'Added a race result'],
  DELETE_TRAINER_RACE_RESULT: ['training', 'Xóa thành tích thi đấu', 'Deleted a race result'],
  ADD_TRAINER_SPECIALIZATION: ['training', 'Thêm chuyên môn', 'Added a specialization'],
  REMOVE_TRAINER_SPECIALIZATION: ['training', 'Bỏ chuyên môn', 'Removed a specialization'],
  ADD_WORK_RIDER_PREFERENCE: ['training', 'Thêm kỵ sĩ ưu tiên', 'Added a preferred work rider'],
  END_WORK_RIDER_PREFERENCE: ['training', 'Bỏ kỵ sĩ ưu tiên', 'Removed a preferred work rider'],
  CREATE_TRAINING_PLAN: ['training', 'Tạo giáo án', 'Created a training plan'],
  CREATE_PLAN_FROM_TEMPLATE: ['training', 'Tạo giáo án từ mẫu', 'Created a plan from a template'],
  UPDATE_TRAINING_PLAN: ['training', 'Sửa giáo án', 'Updated a training plan'],
  SUBMIT_TRAINING_PLAN: ['training', 'Gửi duyệt giáo án', 'Submitted a training plan'],
  APPROVE_TRAINING_PLAN: ['training', 'Duyệt giáo án', 'Approved a training plan'],
  RETURN_TRAINING_PLAN: ['training', 'Trả lại giáo án', 'Returned a training plan'],
  REVISE_TRAINING_PLAN: ['training', 'Chỉnh sửa giáo án đã duyệt', 'Revised a training plan'],
  RESCHEDULE_TRAINING_PLAN: ['training', 'Dời lịch giáo án', 'Rescheduled a training plan'],
  CANCEL_TRAINING_PLAN: ['training', 'Hủy giáo án', 'Cancelled a training plan'],
  COMPLETE_TRAINING_PLAN: ['training', 'Hoàn thành giáo án', 'Completed a training plan'],
  ADD_PLAN_STAGE: ['training', 'Thêm giai đoạn', 'Added a plan stage'],
  UPDATE_PLAN_STAGE: ['training', 'Sửa giai đoạn', 'Updated a plan stage'],
  DELETE_PLAN_STAGE: ['training', 'Xóa giai đoạn', 'Deleted a plan stage'],
  CLOSE_PLAN_STAGE: ['training', 'Đóng giai đoạn', 'Closed a plan stage'],
  UPDATE_PLAN_TEMPLATE: ['training', 'Sửa giáo án mẫu', 'Updated a plan template'],
  DISCARD_TEMPLATE_DRAFT: ['training', 'Bỏ bản nháp giáo án mẫu', 'Discarded a template draft'],
  ASSIGN_TRAINING_SESSION: ['training', 'Phân công buổi tập', 'Assigned a training session'],
  UPDATE_TRAINING_SESSION: ['training', 'Sửa buổi tập', 'Updated a training session'],
  START_TRAINING_SESSION: ['training', 'Bắt đầu buổi tập', 'Started a training session'],
  CANCEL_TRAINING_SESSION: ['training', 'Hủy buổi tập', 'Cancelled a training session'],
  MISS_TRAINING_SESSION: ['training', 'Ghi nhận vắng buổi tập', 'Marked a session missed'],
  RECORD_TRAINING_RESULT: ['training', 'Ghi kết quả buổi tập', 'Recorded a training result'],
  REVIEW_TRAINING_SESSION: ['training', 'Nhận xét buổi tập', 'Reviewed a training session'],
  SUBSTITUTE_OBSERVATION: ['training', 'Theo dõi thay buổi tập', 'Observed a session as substitute'],
  // Y tế
  CREATE_MEDICAL_RECORD: ['medical', 'Tạo phiếu khám', 'Created a medical record'],
  UPDATE_MEDICAL_RECORD: ['medical', 'Sửa phiếu khám', 'Updated a medical record'],
  DELETE_MEDICAL_RECORD: ['medical', 'Xóa phiếu khám nháp', 'Deleted a draft medical record'],
  SIGN_MEDICAL_RECORD: ['medical', 'Ký phiếu khám', 'Signed a medical record'],
  AMEND_MEDICAL_RECORD: ['medical', 'Bổ sung phiếu khám đã ký', 'Amended a medical record'],
  ADD_TREATMENT: ['medical', 'Thêm điều trị', 'Added a treatment'],
  UPDATE_TREATMENT: ['medical', 'Sửa điều trị', 'Updated a treatment'],
  ADD_VACCINATION: ['medical', 'Thêm tiêm phòng', 'Added a vaccination'],
  ADD_MEDICAL_SCHEDULE: ['medical', 'Thêm lịch y tế', 'Added a medical schedule'],
  CREATE_TRAINING_LOCK: ['medical', 'Khóa tập', 'Locked training'],
  UPDATE_TRAINING_LOCK: ['medical', 'Sửa khóa tập', 'Updated a training lock'],
  RELEASE_TRAINING_LOCK: ['medical', 'Mở khóa tập', 'Released a training lock'],
  REPORT_HEALTH_ISSUE: ['medical', 'Báo cáo sức khỏe', 'Reported a health issue'],
  TAKE_HEALTH_REPORT: ['medical', 'Nhận xử lý báo cáo sức khỏe', 'Took a health report'],
  ADD_HEALTH_REPORT_NOTE: ['medical', 'Ghi chú báo cáo sức khỏe', 'Added a health report note'],
  RESOLVE_HEALTH_REPORT: ['medical', 'Đóng báo cáo sức khỏe', 'Resolved a health report'],
  CREATE_VET_DUTY_SHIFT: ['medical', 'Xếp lịch trực bác sĩ', 'Added a vet duty shift'],
  DELETE_VET_DUTY_SHIFT: ['medical', 'Xóa lịch trực bác sĩ', 'Removed a vet duty shift'],
  // Chăm sóc, dinh dưỡng, vật tư
  SET_HORSE_GROOM: ['care', 'Giao người chăm sóc', 'Assigned a groom'],
  CLEAR_HORSE_GROOM: ['care', 'Bỏ người chăm sóc', 'Removed a groom'],
  CREATE_CARE_TASK: ['care', 'Tạo việc chăm sóc', 'Created a care task'],
  GENERATE_CARE_TASKS: ['care', 'Tạo việc chăm sóc theo chỉ tiêu', 'Generated care tasks'],
  UPDATE_CARE_TASK: ['care', 'Sửa việc chăm sóc', 'Updated a care task'],
  COMPLETE_CARE_TASK: ['care', 'Hoàn thành việc chăm sóc', 'Completed a care task'],
  SKIP_CARE_TASK: ['care', 'Bỏ qua việc chăm sóc', 'Skipped a care task'],
  UPDATE_CARE_RULE: ['care', 'Sửa chỉ tiêu chăm sóc', 'Updated a care rule'],
  CREATE_DIET_PLAN: ['care', 'Tạo khẩu phần', 'Created a diet plan'],
  UPDATE_DIET_PLAN: ['care', 'Sửa khẩu phần', 'Updated a diet plan'],
  ADJUST_DIET_PLAN: ['care', 'Điều chỉnh khẩu phần', 'Adjusted a diet plan'],
  APPROVE_DIET_PLAN: ['care', 'Duyệt khẩu phần', 'Approved a diet plan'],
  REJECT_DIET_PLAN: ['care', 'Góp ý lại khẩu phần', 'Returned a diet plan'],
  CREATE_INVENTORY_ITEM: ['care', 'Thêm vật tư vào kho', 'Added an inventory item'],
  ADJUST_STOCK: ['care', 'Điều chỉnh tồn kho', 'Adjusted stock'],
  CREATE_INVENTORY_REQUEST: ['care', 'Gửi phiếu xin vật tư', 'Sent a supply request'],
  APPROVE_INVENTORY_REQUEST: ['care', 'Duyệt phiếu xin vật tư', 'Approved a supply request'],
  REJECT_INVENTORY_REQUEST: ['care', 'Từ chối phiếu xin vật tư', 'Rejected a supply request'],
  CANCEL_INVENTORY_REQUEST: ['care', 'Hủy phiếu xin vật tư', 'Cancelled a supply request'],
}

export const GROUPS = [
  ['account', 'Tài khoản và phân quyền', 'Accounts and permissions'],
  ['horse', 'Hồ sơ ngựa', 'Horse profiles'],
  ['training', 'Huấn luyện', 'Training'],
  ['medical', 'Y tế', 'Medical'],
  ['care', 'Chăm sóc, dinh dưỡng, vật tư', 'Care, diet and supplies'],
]

const ENTITIES = {
  User: ['Tài khoản', 'Account'], Role: ['Chức vụ', 'Role'], RolePermission: ['Quyền của chức vụ', 'Role permission'],
  UserRole: ['Chức vụ của tài khoản', 'User role'], Club: ['Câu lạc bộ', 'Club'], SupportRequest: ['Yêu cầu hỗ trợ', 'Support request'],
  Horse: ['Ngựa', 'Horse'], HorseDocument: ['Giấy tờ', 'Document'], RegistrationRequest: ['Hồ sơ đăng ký', 'Registration'],
  ProfileChangeRequest: ['Yêu cầu sửa hồ sơ', 'Profile change request'], Stall: ['Ô chuồng', 'Stall'], StallAssignment: ['Xếp chuồng', 'Stall assignment'],
  HorseAssessment: ['Đánh giá ngựa', 'Assessment'], TrainerHorseAssignment: ['Phân công huấn luyện viên', 'Trainer assignment'],
  TrainerProfile: ['Hồ sơ huấn luyện viên', 'Trainer profile'], TrainerCredential: ['Chứng chỉ', 'Credential'],
  TrainerRaceResult: ['Thành tích thi đấu', 'Race result'], TrainerSpecialization: ['Chuyên môn', 'Specialization'], Specialization: ['Chuyên môn', 'Specialization'],
  HorseWorkRiderPreference: ['Kỵ sĩ ưu tiên', 'Preferred rider'], TrainingPlan: ['Giáo án', 'Training plan'],
  TrainingPlanStage: ['Giai đoạn giáo án', 'Plan stage'], TrainingPlanTemplate: ['Giáo án mẫu', 'Plan template'],
  TrainingPlanTemplateStage: ['Giai đoạn giáo án mẫu', 'Template stage'], TrainingSession: ['Buổi tập', 'Training session'],
  TrainingResult: ['Kết quả buổi tập', 'Training result'], TrainingReview: ['Nhận xét buổi tập', 'Session review'],
  MedicalRecord: ['Phiếu khám', 'Medical record'], MedicalRecordAmendment: ['Bổ sung phiếu khám', 'Record amendment'],
  Treatment: ['Điều trị', 'Treatment'], Vaccination: ['Tiêm phòng', 'Vaccination'], MedicalSchedule: ['Lịch y tế', 'Medical schedule'],
  TrainingLock: ['Khóa tập', 'Training lock'], HealthReport: ['Báo cáo sức khỏe', 'Health report'],
  HealthReportNote: ['Ghi chú báo cáo', 'Report note'], VetDutyShift: ['Ca trực bác sĩ', 'Vet duty shift'],
  HorseGroom: ['Người chăm sóc phụ trách', 'Assigned groom'], CareTask: ['Việc chăm sóc', 'Care task'],
  CareTaskRule: ['Chỉ tiêu chăm sóc', 'Care rule'], DietPlan: ['Khẩu phần', 'Diet plan'], DietMeal: ['Bữa ăn', 'Meal'],
  InventoryItem: ['Vật tư', 'Inventory item'], InventoryRequest: ['Phiếu xin vật tư', 'Supply request'],
  InventoryRequestItem: ['Dòng phiếu vật tư', 'Supply request line'],
}

const en = () => currentLang() === 'en'

/** Mã chưa có trong bảng: CREATE_FOO_BAR -> "Create foo bar" */
const humanize = (code) => String(code || '').toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

export const actionLabel = (code) => (ACTIONS[code] ? ACTIONS[code][en() ? 2 : 1] : humanize(code))
export const actionGroup = (code) => ACTIONS[code]?.[0] || 'other'
export const groupLabel = (key) => { const g = GROUPS.find(([k]) => k === key); return g ? g[en() ? 2 : 1] : (en() ? 'Other' : 'Khác') }
export const entityLabel = (table) => (ENTITIES[table] ? ENTITIES[table][en() ? 1 : 0] : table)

/** Mã quyền / mã chức vụ trong phần chi tiết -> tên tiếng Việt (bộ dịch của trang tự đổi sang tiếng Anh); giá trị khác giữ nguyên. */
export const codeLabel = (value) => permissionLabels[value] || roleLabels[value] || value
