import { getCompleteVetList } from '../api/vetApi.ts'
// Thành phần dùng chung cho Flow 3 (sức khỏe và thú y).
import { apiDelete, apiGet, apiPatch, apiPost } from '../api/apiClient.ts'
import { Badge, fmtDate } from '../flow1/ui.jsx'
import { clubToday } from '../pages/vet/vetDomain.js'

const q = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null))
  return s.size ? `?${s}` : ''
}
export const med = {
  horses: async () => await getCompleteVetList('/horses?RegistrationStatus=Approved'),
  horse: (id) => apiGet(`/horses/${id}`),
  records: async (horseId) => await getCompleteVetList(`/horses/${horseId}/medical-records`),
  record: (id) => apiGet(`/medical-records/${id}`),
  createRecord: (horseId, body) => apiPost(`/horses/${horseId}/medical-records`, body),
  updateRecord: (id, body) => apiPatch(`/medical-records/${id}`, body),
  signRecord: (id, body) => apiPost(`/medical-records/${id}/sign`, body || {}),
  amendments: async (id) => await getCompleteVetList(`/medical-records/${id}/amendments`),
  addAmendment: (id, body) => apiPost(`/medical-records/${id}/amendments`, body),
  treatments: async (horseId) => await getCompleteVetList(`/horses/${horseId}/treatments`),
  addTreatment: (recordId, body) => apiPost(`/medical-records/${recordId}/treatments`, body),
  updateTreatment: (id, body) => apiPatch(`/treatments/${id}`, body),
  locks: async (params = {}) => await getCompleteVetList(`/training-locks${q(params)}`),
  lock: (horseId, body) => apiPost(`/horses/${horseId}/training-locks`, body),
  updateLock: (id, body) => apiPatch(`/training-locks/${id}`, body),
  releaseLock: (id, note) => apiPost(`/training-locks/${id}/release`, { Note: note }),
  vaccinations: async (params = {}) => await getCompleteVetList(`/vaccinations${q(params)}`),
  addVaccination: (horseId, body) => apiPost(`/horses/${horseId}/vaccinations`, body),
  updateVaccination: (id, body) => apiPatch(`/vaccinations/${id}`, body),
  schedules: async (params = {}) => await getCompleteVetList(`/medical-schedules${q(params)}`),
  addSchedule: (horseId, body) => apiPost(`/horses/${horseId}/medical-schedules`, body),
  updateSchedule: (id, body) => apiPatch(`/medical-schedules/${id}`, body),
  reports: async (params = {}) => await getCompleteVetList(`/health-reports${q(params)}`),
  report: (id) => apiGet(`/health-reports/${id}`),
  createReport: (horseId, body) => apiPost(`/horses/${horseId}/health-reports`, body),
  addNote: (id, content) => apiPost(`/health-reports/${id}/notes`, { Content: content }),
  take: (id) => apiPost(`/health-reports/${id}/take`, {}),
  resolve: (id, body) => apiPost(`/health-reports/${id}/resolve`, body),
  pendingExams: async () => await getCompleteVetList('/vet/pending-initial-exams'),
  sessions: async (params = {}) => await getCompleteVetList(`/training-sessions${q(params)}`),
  assignments: async (params = {}) => await getCompleteVetList(`/trainer-assignments${q(params)}`),
  groom: (horseId) => apiGet(`/horses/${horseId}/groom`).catch(() => null),
  del: apiDelete,
}

export const HEALTH = { Healthy: ['ok', 'Khỏe mạnh'], Monitor: ['wait', 'Cần theo dõi'], Injured: ['bad', 'Chấn thương'], Recovering: ['wait', 'Đang hồi phục'], Isolated: ['bad', 'Cách ly'] }
export const healthBadge = (s) => { const [k, t] = HEALTH[s] || ['draft', 'Chưa cập nhật']; return <Badge kind={k}>{t}</Badge> }
export const healthText = (s) => (HEALTH[s] || [null, 'Chưa cập nhật'])[1]
export const ELIGIBILITY = { Eligible: 'Đủ điều kiện', Restricted: 'Giới hạn mức tập', 'Not Eligible': 'Không đủ điều kiện' }
export const LOCK_LEVEL = { Full: 'Khóa toàn bộ', Restricted: 'Giới hạn mức tập' }
export function lockBadge(lock) {
  if (!lock) return <Badge kind="ok">Được phép tập</Badge>
  return lock.LockLevel === 'Full' ? <Badge kind="bad">Khóa toàn bộ</Badge> : <Badge kind="wait">Giới hạn mức tập</Badge>
}
export const EXAM_TYPE = { 'Initial Exam': 'Khám lâm sàng nhập đàn', 'Routine Exam': 'Khám định kỳ', 'Injury Exam': 'Khám chấn thương', 'Follow-up': 'Tái khám', Emergency: 'Khám cấp cứu' }
export const SCHEDULE_TYPE = { Vaccination: 'Tiêm phòng', Deworming: 'Tẩy giun', Farrier: 'Chăm sóc móng', 'Routine Examination': 'Khám định kỳ' }
export const ROUTE = { Oral: 'Uống', Injection: 'Tiêm', Topical: 'Dùng ngoài', Inhalation: 'Xông hít', Other: 'Khác' }
export const SEVERITY = { Urgent: ['bad', 'Khẩn'], Normal: ['draft', 'Thông thường'] }
export const severityBadge = (s) => { const [k, t] = SEVERITY[s] || ['draft', s]; return <Badge kind={k}>{t}</Badge> }
export const REPORT_STATUS = { Reported: ['sent', 'Chờ tiếp nhận'], Reviewing: ['wait', 'Đang xử lý'], Resolved: ['ok', 'Đã xử lý'] }
export const reportBadge = (s) => { const [k, t] = REPORT_STATUS[s] || ['draft', s]; return <Badge kind={k}>{t}</Badge> }
export const ROLE_TEXT = { HEAD_TRAINER: 'Huấn luyện viên trưởng', TRAINER: 'Huấn luyện viên', WORK_RIDER: 'Kỵ sĩ tập luyện', GROOM: 'Người chăm sóc ngựa',
  VET: 'Bác sĩ thú y', CLUB_MANAGER: 'Quản lý câu lạc bộ', HORSE_OWNER: 'Chủ ngựa' }
export const roleText = (codes = []) => codes.map((c) => ROLE_TEXT[c]).filter(Boolean)[0] || ''
export const VACCINES = ['Cúm ngựa', 'Uốn ván', 'Viêm não ngựa', 'Dại', 'Herpes ngựa (EHV)', 'Viêm mũi ngựa']
export const INJURY_LOCATIONS = ['Gân gấp · chân trước trái', 'Gân gấp · chân trước phải', 'Khớp cổ chân · chân trước trái', 'Khớp cổ chân · chân trước phải',
  'Khớp gối · chân sau trái', 'Khớp gối · chân sau phải', 'Móng · chân trước', 'Móng · chân sau', 'Lưng', 'Cổ', 'Khác']
/** "Gân gấp · chân trước trái · Độ 2" -> ["Gân gấp · chân trước trái", "Độ 2"] */
export function splitInjury(text) {
  if (!text) return ['', '']
  const m = String(text).match(/^(.*?)(?:\s·\s(Độ \d))?$/)
  return [m[1], m[2] || '']
}
export const dateOnly = (v) => (v ? String(v).slice(0, 10) : '')
export const isoToday = clubToday
export const plusDays = (n, base) => { const d = new Date(`${base || clubToday()}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const vetName = (name) => (name ? `BS. ${name}` : 'Chưa phân công')
export const lockRange = (l) => `${fmtDate(l.LockStartDate)}${l.LockEndDate ? ` – ${fmtDate(l.LockEndDate)}` : ''}`

/** Lịch y tế hợp nhất: lịch y tế + mũi tiêm. */
export function medicalItems(schedules, vaccinations) {
  return [
    ...schedules.map((s) => ({ key: `s${s.MedicalScheduleID}`, kind: 'schedule', id: s.MedicalScheduleID, HorseID: s.HorseID, HorseName: s.HorseName, date: s.ScheduledDate,
      title: SCHEDULE_TYPE[s.ScheduleType] || s.ScheduleType, sub: s.Note, VetName: s.VetName, status: s.Status, overdue: s.IsOverdue, raw: s })),
    ...vaccinations.map((v) => ({ key: `v${v.VaccinationID}`, kind: 'vaccination', id: v.VaccinationID, HorseID: v.HorseID, HorseName: v.HorseName, date: v.VaccinationDate,
      title: 'Tiêm phòng', sub: [v.VaccineName, v.Note].filter(Boolean).join(' · '), VetName: v.VetName, status: v.Status, overdue: v.IsOverdue, raw: v })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)))
}
export const ITEM_STATUS = { Scheduled: ['sent', 'Đã lên lịch'], Completed: ['ok', 'Đã hoàn thành'], Cancelled: ['arch', 'Đã hủy'], Overdue: ['bad', 'Quá hạn'] }
export const itemBadge = (it) => { const [k, t] = it.overdue && it.status === 'Scheduled' ? ITEM_STATUS.Overdue : ITEM_STATUS[it.status] || ['draft', it.status]; return <Badge kind={k}>{t}</Badge> }
