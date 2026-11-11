import { getCompleteVetList } from '../api/vetApi.ts'
// API cho các trang Flow 1. Dữ liệu giữ nguyên tên cột của backend (HorseName, RegistrationStatus...).
import { apiDelete, apiGet, apiGetNullable, apiGetBlob, apiGetPublic, apiPatch, apiPost, apiPostForm, apiPostPublic, apiPut } from '../api/apiClient.ts'

const list = (value) => (Array.isArray(value) ? value : value?.results ?? [])
const q = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null))
  return s.size ? `?${s}` : ''
}

// ----- ngựa -----
export const getHorses = async (params = {}) => await getCompleteVetList(`/horses${q(params)}`)
export const getHorse = (id) => apiGet(`/horses/${id}`)
export const createHorse = (body) => apiPost('/horses', body)
export const updateHorse = (id, body) => apiPatch(`/horses/${id}`, body)
export const submitHorse = (id) => apiPost(`/horses/${id}/submit`, {})
export const verifyHorse = (id) => apiPost(`/horses/${id}/verify`, {})
export const rejectHorse = (id, reason) => apiPost(`/horses/${id}/reject`, { Reason: reason })
export const approveHorse = (id, body) => apiPost(`/horses/${id}/approve`, body)
export const archiveHorse = (id, reason, leftDate) => apiPost(`/horses/${id}/archive`, { Reason: reason, LeftDate: leftDate || null })
export const getRegistrationRequests = async (id) => await getCompleteVetList(`/horses/${id}/registration-requests`)
export const getClubs = async () => list(await apiGetPublic('/clubs'))

// ----- giấy tờ, ảnh -----
export const getDocuments = async (id) => await getCompleteVetList(`/horses/${id}/documents`)
export function uploadDocument(horseId, file, type, name) {
  const body = new FormData()
  body.append('File', file, file.name)
  body.append('DocumentType', type)
  body.append('DocumentName', name || file.name)
  return apiPostForm(`/horses/${horseId}/documents`, body)
}
export const deleteDocument = (documentId) => apiDelete(`/horse-documents/${documentId}`)
export const getDocumentFile = (documentId) => apiGetBlob(`/horse-documents/${documentId}/file`)

// ----- chuồng, người chăm sóc -----
export const getStalls = async (params = {}) => await getCompleteVetList(`/stalls${q(params)}`)
export const createStall = (body) => apiPost('/stalls', body)
export const updateStall = (id, body) => apiPatch(`/stalls/${id}`, body)
export const moveStall = (horseId, stallId) => apiPost(`/horses/${horseId}/move-stall`, { StallID: Number(stallId) })
export const getGrooms = async () => await getCompleteVetList('/users?RoleCode=GROOM&Status=Active')
export const getHorseGroom = (horseId) => apiGetNullable(`/horses/${horseId}/groom`)

// ----- người dùng -----
export const getUsers = async (params = {}) => await getCompleteVetList(`/users${q(params)}`)
export const createUser = (body) => apiPost('/users', body)
export const changePassword = (body) => apiPost('/auth/change-password', body)
export const requestPasswordReset = (email) => apiPostPublic('/auth/password-reset', { Email: email })
export const confirmPasswordReset = (body) => apiPostPublic('/auth/password-reset/confirm', body)

// ----- bác sĩ thú y -----
export const getDutyShifts = async (from, to) => await getCompleteVetList(`/vet-duty-shifts${q({ From: from, To: to })}`)
export const getDutyNow = async () => await getCompleteVetList('/vet-duty-shifts/now')
export const addDutyShift = (body) => apiPost('/vet-duty-shifts', body)
export const deleteDutyShift = (id) => apiDelete(`/vet-duty-shifts/${id}`)
export const getPendingExams = async () => await getCompleteVetList('/vet/pending-initial-exams')
export const getMedicalRecords = async (horseId, examType) => await getCompleteVetList(`/horses/${horseId}/medical-records${q({ ExamType: examType })}`)
export const createMedicalRecord = (horseId, body) => apiPost(`/horses/${horseId}/medical-records`, body)
export const updateMedicalRecord = (recordId, body) => apiPatch(`/medical-records/${recordId}`, body)
export const signMedicalRecord = (recordId) => apiPost(`/medical-records/${recordId}/sign`, {})
export const getAmendments = async (recordId) => await getCompleteVetList(`/medical-records/${recordId}/amendments`)
export const addAmendment = (recordId, body) => apiPost(`/medical-records/${recordId}/amendments`, body)

// ----- yêu cầu sửa hồ sơ -----
export const getChangeRequests = async (params = {}) => await getCompleteVetList(`/profile-change-requests${q(params)}`)
export const createChangeRequest = (horseId, body) => apiPost(`/horses/${horseId}/profile-change-requests`, body)
export function createChangeRequestWithEvidence(horseId, changes, reason, file) {
  const form = new FormData()
  const attachments = []
  if (file) {
    form.append('file0', file, file.name)
    attachments.push({ Purpose: 'evidence', DocumentName: file.name, DocumentType: 'Other', FileKey: 'file0' })
  }
  form.append('Payload', JSON.stringify({ Changes: changes, Reason: reason, Attachments: attachments }))
  return apiPostForm(`/horses/${horseId}/profile-change-requests`, form)
}
export const getChangeAttachment = (url) => apiGetBlob(url.replace(/^\/api/, ''))
export const reviewChangeRequest = (id, decision, note) => apiPost(`/profile-change-requests/${id}/${decision}`, { ReviewNote: note })

// ----- thông báo -----
export const getNotifications = async () => await getCompleteVetList('/notifications')
export const getUnreadCount = () => apiGet('/notifications/unread-count')
/** Báo cho chuông thông báo đếm lại ngay (khi đánh dấu đã đọc ở bất kỳ trang nào). */
export const notifyNotificationsChanged = () => window.dispatchEvent(new Event('equi:notifications-changed'))
export const markRead = async (body) => { const r = await apiPost('/notifications/read', body); notifyNotificationsChanged(); return r }

// ----- khác (thẻ bản đồ) -----
export const getTrainingSessions = async (params = {}) => await getCompleteVetList(`/training-sessions${q(params)}`)
export const getHealthReports = async (params = {}) => await getCompleteVetList(`/health-reports${q(params)}`)
export const getTrainingLocks = async (params = {}) => await getCompleteVetList(`/training-locks${q(params)}`)

// ----- yêu cầu hỗ trợ -----
export const getSupportOptions = () => apiGet('/support-requests/options')
export const getSupportRequests = async (params = {}) => await getCompleteVetList(`/support-requests${q(params)}`)
export const createSupportRequest = (body) => apiPost('/support-requests', body)
export const resolveSupportRequest = (id, response) => apiPost(`/support-requests/${id}/resolve`, { Response: response })

// ----- tài khoản, phân quyền (Quản lý) -----
export const getUser = (id) => apiGet(`/users/${id}`)
export const updateUser = (id, body) => apiPatch(`/users/${id}`, body)
export const setUserRoles = (id, roleCodes) => apiPut(`/users/${id}/roles`, { RoleCodes: roleCodes })
export const lockUser = (id, reason) => apiPost(`/users/${id}/lock`, { Reason: reason })
export const unlockUser = (id) => apiPost(`/users/${id}/unlock`, {})
export const resetUserPassword = (id) => apiPost(`/users/${id}/reset-password`, {})
export const getRoleMatrix = () => apiGet('/roles')
export const setRolePermissions = (code, permissionCodes) => apiPut(`/roles/${encodeURIComponent(code)}/permissions`, { PermissionCodes: permissionCodes })
export const resetRoleDefaults = () => apiPost('/roles/reset-defaults', {})
