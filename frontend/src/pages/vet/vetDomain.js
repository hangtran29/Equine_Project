// The legacy FE name ELIGIBLE here means Healthy, never permission to train.
export const healthLabels = {
  ELIGIBLE: 'Khỏe mạnh', MONITORING: 'Cần theo dõi', INJURED: 'Chấn thương',
  ISOLATION: 'Cách ly', RECOVERING: 'Đang hồi phục', NOT_ASSESSED: 'Chưa đánh giá',
}
export const recordHealthLabels = { Healthy: 'Khỏe mạnh', Monitor: 'Cần theo dõi', Injured: 'Chấn thương', Recovering: 'Đang hồi phục', Isolated: 'Cách ly' }
export const trainingLabels = { Eligible: 'Đủ điều kiện tập', Restricted: 'Hạn chế tập', 'Not Eligible': 'Không được tập' }
export const examLabels = { 'Initial Exam': 'Khám đầu vào', 'Routine Exam': 'Khám định kỳ', 'Injury Exam': 'Khám chấn thương', 'Follow-up': 'Tái khám', Emergency: 'Cấp cứu' }
export const medicineRoutes = { Oral: 'Uống', Injection: 'Tiêm', Topical: 'Bôi ngoài da', Inhalation: 'Hít', Other: 'Khác' }
export function vetDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(String(value))) return 'Chưa ghi nhận'
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}
export function vetAge(value, today = clubToday()) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return 'Chưa cập nhật'
  const [year, month, day] = value.split('-').map(Number)
  const [currentYear, currentMonth, currentDay] = today.split('-').map(Number)
  const months = (currentYear - year) * 12 + currentMonth - month - (currentDay < day ? 1 : 0)
  return months >= 12 ? `${Math.floor(months / 12)} tuổi${months % 12 ? ` ${months % 12} tháng` : ''}` : `${Math.max(0, months)} tháng tuổi`
}
export const scheduleTypes = { Deworming: 'Tẩy giun', Farrier: 'Chăm sóc móng', 'Routine Examination': 'Khám định kỳ' }
export function medicalEvents(vaccinations, schedules) {
  return [...vaccinations.map(v => ({ ...v, key: `v-${v.VaccinationID}`, kind: 'vaccination', day: v.VaccinationDate, label: `Tiêm phòng · ${v.VaccineName}` })),
    ...schedules.map(s => ({ ...s, key: `s-${s.MedicalScheduleID}`, kind: 'schedule', day: s.ScheduledDate, label: scheduleTypes[s.ScheduleType] || (s.ScheduleType === 'Vaccination' ? 'Tiêm phòng' : 'Công việc y tế') }))].sort((a, b) => a.day.localeCompare(b.day))
}
export const clubTimezone = import.meta.env?.VITE_CLUB_TIME_ZONE || 'Asia/Ho_Chi_Minh'
export function vetDateTime(value) {
  if (!value) return 'Chưa cập nhật'
  const normalized = String(value).replace(' ', 'T')
  const wallTime = !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
  const date = new Date(wallTime ? `${normalized}Z` : normalized)
  if (!Number.isFinite(date.getTime())) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN', { timeZone: wallTime ? 'UTC' : clubTimezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(date)
}
export function clubToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: clubTimezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (type) => parts.find(p => p.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function clubDateTimeInput(value) {
  // SQL DATETIME2 is local club time (USE_TZ=False). Offset timestamps are converted explicitly.
  if (value && !/(Z|[+-]\d\d:\d\d)$/i.test(value)) return value.replace(' ', 'T').slice(0, 19)
  const now = value ? new Date(value) : new Date()
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: clubTimezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const get = type => parts.find(p => p.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
}
export function latestSigned(records, horseId) {
  return records.filter(r => r.horseId === horseId && r.recordStatus === 'Signed')
    .sort((a, b) => b.examDate.localeCompare(a.examDate) || Number(b.id) - Number(a.id))[0]
}
export function dueGroup(day, today = clubToday()) {
  return !day ? 'unknown' : day < today ? 'overdue' : day === today ? 'today' : 'upcoming'
}
export function vetError(error, fallback = 'Không thể tải dữ liệu. Vui lòng thử lại.') {
  if (error?.status === 403) return 'Bạn không có quyền thực hiện thao tác này.'
  if (error?.status === 404) return 'Không tìm thấy hồ sơ hoặc bạn không có quyền truy cập.'
  return fallback
}
