import { getCompleteVetList } from '../api/vetApi.ts'
// Thành phần dùng chung cho các trang huấn luyện (Flow 2) theo bộ thiết kế HT / TR / KS.
import { useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost } from '../api/apiClient.ts'
import { Badge, Icon, fmtDate, fmtDateTime } from '../flow1/ui.jsx'
import { HorseThumb } from '../flow1/horse.jsx'

const q = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null))
  return s.size ? `?${s}` : ''
}

export const api = {
  sessions: async (params = {}) => await getCompleteVetList(`/training-sessions${q(params)}`),
  session: (id) => apiGet(`/training-sessions/${id}`),
  start: (id) => apiPost(`/training-sessions/${id}/start`, {}),
  result: (id, body) => apiPost(`/training-sessions/${id}/result`, body),
  createSession: (body) => apiPost('/training-sessions', body),
  updateSession: (id, body) => apiPatch(`/training-sessions/${id}`, body),
  cancelSession: (id, reason) => apiPost(`/training-sessions/${id}/cancel`, { Reason: reason }),
  missSession: (id, reason) => apiPost(`/training-sessions/${id}/missed`, { Reason: reason }),
  stopSession: (id, body) => apiPost(`/training-sessions/${id}/stop`, body),
  review: (id, body) => apiPost(`/training-sessions/${id}/review`, body),
  reviews: async (params = {}) => await getCompleteVetList(`/training-reviews${q(params)}`),
  dashboard: async () => await getCompleteVetList('/training-dashboard'),
  plans: async (params = {}) => await getCompleteVetList(`/training-plans${q(params)}`),
  plan: (id) => apiGet(`/training-plans/${id}`),
  createPlan: (body) => apiPost('/training-plans', body),
  updatePlan: (id, body) => apiPatch(`/training-plans/${id}`, body),
  addStage: (planId, body) => apiPost(`/training-plans/${planId}/stages`, body),
  updateStage: (id, body) => apiPatch(`/training-plan-stages/${id}`, body),
  deleteStage: (id) => apiDelete(`/training-plan-stages/${id}`),
  closeStage: (id, note) => apiPost(`/training-plan-stages/${id}/close`, { SummaryNote: note }),
  submitPlan: (id) => apiPost(`/training-plans/${id}/submit`, {}),
  approvePlan: (id, note) => apiPost(`/training-plans/${id}/approve`, { ReviewNote: note }),
  returnPlan: (id, note) => apiPost(`/training-plans/${id}/return`, { ReviewNote: note }),
  completePlan: (id) => apiPost(`/training-plans/${id}/complete`, {}),
  cancelPlan: (id, reason) => apiPost(`/training-plans/${id}/cancel`, { Reason: reason }),
  revisePlan: (id) => apiPost(`/training-plans/${id}/revise`, {}),
  templates: async () => await getCompleteVetList('/training-plan-templates'),
  template: (id) => apiGet(`/training-plan-templates/${id}`),
  assignments: async (params = {}) => await getCompleteVetList(`/trainer-assignments${q(params)}`),
  assign: (body) => apiPost('/trainer-assignments', body),
  endAssignment: (id, reason) => apiPost(`/trainer-assignments/${id}/end`, { Reason: reason }),
  assessments: async (horseId) => await getCompleteVetList(`/horses/${horseId}/assessments`),
  addAssessment: (horseId, body) => apiPost(`/horses/${horseId}/assessments`, body),
  specializations: async () => await getCompleteVetList('/specializations'),
  trainers: async () => await getCompleteVetList('/trainers'),
  trainer: (id) => apiGet(`/trainers/${id}`),
  updateTrainerProfile: (id, body) => apiPatch(`/trainers/${id}/profile`, body),
  credentials: async (id) => await getCompleteVetList(`/trainers/${id}/credentials`),
  addCredential: (id, body) => apiPost(`/trainers/${id}/credentials`, body),
  deleteCredential: (id) => apiDelete(`/trainer-credentials/${id}`),
  raceResults: async (id) => await getCompleteVetList(`/trainers/${id}/race-results`),
  addRaceResult: (id, body) => apiPost(`/trainers/${id}/race-results`, body),
  deleteRaceResult: (id) => apiDelete(`/trainer-race-results/${id}`),
  addSpecialization: (id, specId) => apiPost(`/trainers/${id}/specializations`, { SpecializationID: Number(specId) }),
  removeSpecialization: (id, specId) => apiDelete(`/trainers/${id}/specializations/${specId}`),
  users: async (role) => await getCompleteVetList(`/users${q({ RoleCode: role, Status: 'Active' })}`),
  horse: (id) => apiGet(`/horses/${id}`),
}

export const SESSION_STATUS = {
  Assigned: ['sent', 'Đã phân công'],
  'In Progress': ['wait', 'Đang tập'],
  Completed: ['ok', 'Hoàn thành'],
  Cancelled: ['arch', 'Đã hủy'],
  Missed: ['bad', 'Vắng'],
}
export function SessionBadge({ status, stopped }) {
  const [kind, text] = stopped && status === 'Cancelled' ? ['arch', 'Đã dừng'] : SESSION_STATUS[status] || ['draft', status]
  return <Badge kind={kind}>{text}</Badge>
}

export const EARLY_END_REASONS = [
  ['Fatigue', 'Ngựa có dấu hiệu mệt'], ['Injury', 'Ngựa có dấu hiệu chấn thương'], ['Weather', 'Thời tiết không thuận lợi'],
  ['Surface', 'Mặt sân không bảo đảm an toàn'], ['Rider', 'Kỵ sĩ gặp sự cố'], ['Other', 'Lý do khác'],
]
export const EVALUATION = { Excellent: 'Xuất sắc', Good: 'Tốt', Average: 'Trung bình', 'Needs Improvement': 'Cần cải thiện' }
export const EVAL_KIND = { Excellent: 'ok', Good: 'ok', Average: 'wait', 'Needs Improvement': 'wait' }
export function EvalBadge({ review }) {
  if (!review?.Evaluation) return <Badge kind="draft">Chưa đánh giá</Badge>
  return <Badge kind={EVAL_KIND[review.Evaluation] || 'draft'}>{EVALUATION[review.Evaluation] || review.Evaluation}</Badge>
}

export const hhmm = (t) => (t ? String(t).slice(0, 5) : '')
export function addMinutes(t, minutes) {
  if (!t || minutes == null) return ''
  const [h, m] = String(t).split(':').map(Number)
  const total = h * 60 + m + Number(minutes)
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
/** "06:00 – 06:45": giờ kết thúc thực tế nếu có, không thì theo thời lượng dự kiến. */
export function timeRange(s) {
  const end = s.EndTime ? hhmm(s.EndTime) : addMinutes(s.StartTime, s.DurationPlannedMinutes)
  return end ? `${hhmm(s.StartTime)} – ${end}` : hhmm(s.StartTime)
}
export const num = (v, digits = 1) => (v == null || v === '' ? '—' : Number(v).toLocaleString('vi-VN', { maximumFractionDigits: digits }))
export const exercise = (s) => [s.TrainingType, s.DistancePlannedKm != null ? `${num(s.DistancePlannedKm)} km` : ''].filter(Boolean).join(' · ')
export const planLabel = (s) => `Giáo án #${s.TrainingPlanID}`
export const stageLabel = (s) => [s.StageOrder ? `Giai đoạn ${s.StageOrder}` : '', s.StageName].filter(Boolean).join(' · ')
export const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const sessionDate = (s) => fmtDate(s.SessionDate)

export function SessionContext({ session: s, extra, badge }) {
  return <div className="ctx"><div className="who"><HorseThumb horseId={s.HorseID} size={64} />
    <div><h2>{s.HorseName}</h2><p>{[planLabel(s), stageLabel(s), exercise(s), extra].filter(Boolean).join(' · ')}</p></div></div>
    {badge ?? <SessionBadge status={s.Status} />}</div>
}

export function usePager(rows, size = 10) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const current = Math.min(page, pages)
  return { page: current, pages, setPage, slice: rows.slice((current - 1) * size, current * size), size, total: rows.length }
}

export function Pager({ pager, noun = 'buổi tập' }) {
  if (pager.total <= pager.size) return null
  const from = (pager.page - 1) * pager.size + 1
  const to = Math.min(pager.total, pager.page * pager.size)
  return <div className="pager"><span>Hiển thị {from}–{to} trong {pager.total} {noun}</span>
    <div><button type="button" disabled={pager.page === 1} onClick={() => pager.setPage(pager.page - 1)} aria-label="Trang trước">‹</button>
      {Array.from({ length: pager.pages }, (_, i) => i + 1).filter((n) => Math.abs(n - pager.page) < 3 || n === 1 || n === pager.pages)
        .map((n) => <button type="button" key={n} className={n === pager.page ? 'on' : ''} onClick={() => pager.setPage(n)}>{n}</button>)}
      <button type="button" disabled={pager.page === pager.pages} onClick={() => pager.setPage(pager.page + 1)} aria-label="Trang sau">›</button></div></div>
}

export const SPECIALIZATION = { 'Flat Racing': 'Đua đường bằng', 'Steeplechase / Hurdle Racing': 'Đua vượt chướng ngại', 'Harness Racing': 'Đua xe kéo',
  'Endurance / Long-distance Racing': 'Đua đường trường', Other: 'Chuyên môn khác', FLAT_RACING: 'Đua đường bằng', STEEPLECHASE_HURDLE: 'Đua vượt chướng ngại',
  HARNESS_RACING: 'Đua xe kéo', ENDURANCE: 'Đua đường trường', OTHER: 'Chuyên môn khác' }
export const specLabel = (v) => SPECIALIZATION[v] || v || '—'
export const INTENSITY = { Low: 'Thấp', Moderate: 'Trung bình', Medium: 'Trung bình', High: 'Cao', 'Very High': 'Rất cao' }
export const PLAN_STATUS = { Draft: ['draft', 'Bản nháp'], 'Pending Approval': ['wait', 'Chờ duyệt'], Active: ['ok', 'Đang áp dụng'], Returned: ['bad', 'Bị trả về'],
  Rejected: ['bad', 'Bị từ chối'], Completed: ['arch', 'Đã hoàn thành'], Cancelled: ['arch', 'Đã hủy'] }
export const HEALTH = { Healthy: ['ok', 'Khỏe mạnh'], Monitoring: ['wait', 'Đang theo dõi'], Monitor: ['wait', 'Đang theo dõi'], Isolated: ['bad', 'Cách ly'], Injured: ['bad', 'Chấn thương'], Sick: ['bad', 'Đang bệnh'],
  Recovering: ['wait', 'Đang hồi phục'], Unknown: ['draft', 'Chưa khám'] }

export const INTENSITY_OPTIONS = [['Low', 'Thấp'], ['Moderate', 'Trung bình'], ['High', 'Cao'], ['Very High', 'Rất cao']]
const INTENSITY_KIND = { Low: 'draft', Moderate: 'wait', Medium: 'wait', High: 'bad', 'Very High': 'bad' }
export function IntensityBadge({ value }) {
  if (!value) return null
  return <Badge kind={INTENSITY_KIND[value] || 'draft'}>Cường độ {String(INTENSITY[value] || value).toLowerCase()}</Badge>
}
export const TRAINING_TYPES = ['Đi bộ', 'Phi nước kiệu nhẹ', 'Phi nước kiệu', 'Phi nước đại', 'Phi nước rút', 'Tập vượt chướng ngại', 'Tập ô xuất phát', 'Bơi hồi phục']
export const SURFACES = ['Sân cỏ', 'Sân cát', 'Đường đất', 'Cát, đường đất', 'Đường tổng hợp']
export const withCurrent = (list, value) => (value && !list.includes(value) ? [...list, value] : list).map((v) => [v, v])
export const FITNESS = { Excellent: 'Xuất sắc', Good: 'Tốt', Average: 'Trung bình', 'Needs Monitoring': 'Cần theo dõi' }
export const DECISION = { Recommended: ['ok', 'Đề xuất', 'Đề xuất tiếp tục huấn luyện'], Rejected: ['bad', 'Không đề xuất', 'Không đề xuất'],
  Superseded: ['arch', 'Đã thay thế', 'Đề xuất tiếp tục huấn luyện'] }
export const EXPERIENCE = { Junior: 'Sơ cấp', Intermediate: 'Thành thạo', Senior: 'Kỳ cựu', Expert: 'Chuyên gia' }

/** Trạng thái hiển thị của giáo án: bản nháp có lý do trả về và đã từng gửi duyệt là "Bị trả về". */
export function planState(p) {
  if (p.Status === 'Draft' && p.ReviewNote && p.SubmittedAt) return 'Returned'
  return p.Status
}
export function PlanBadge({ plan }) {
  const [kind, text] = PLAN_STATUS[planState(plan)] || ['draft', plan.Status]
  return <Badge kind={kind}>{text}</Badge>
}
export const planName = (p) => `Giáo án #${p.TrainingPlanID}`

/** "10/11 – 30/11/2026" (cùng năm) hoặc "10/11/2026 – 31/01/2027". */
export function shortRange(start, end) {
  if (!start) return '—'
  if (!end) return `Từ ${fmtDate(start)}`
  const a = fmtDate(start), b = fmtDate(end)
  return start.slice(0, 4) === end.slice(0, 4) ? `${a.slice(0, 5)} – ${b}` : `${a} – ${b}`
}
export const fullRange = (start, end) => (start ? `${fmtDate(start)} – ${end ? fmtDate(end) : '…'}` : '—')
export const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000) + 1
export function initials(name = '') {
  const parts = name.trim().split(/\s+/)
  return ((parts.length > 1 ? parts[parts.length - 2][0] : '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase()
}
export function ageOf(dob) {
  if (!dob) return ''
  const d = new Date(`${dob}T00:00:00`), now = new Date()
  let y = now.getFullYear() - d.getFullYear()
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) y -= 1
  return `${y} tuổi`
}
export const healthBadge = (status) => { const [kind, text] = HEALTH[status] || ['draft', status || '—']; return <Badge kind={kind}>{text}</Badge> }
export const km = (v) => (v == null ? '—' : `${num(v)} km`)
export const minutes = (v) => (v == null ? '—' : `${num(v, 0)} phút`)
export const dt = fmtDateTime
export const matches = (text, ...values) => !text.trim() || values.some((v) => String(v ?? '').toLowerCase().includes(text.trim().toLowerCase()))

export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs" role="tablist">{tabs.map(([k, label, count]) => <span key={k} role="tab" tabIndex={0} aria-selected={value === k}
    className={`tab ${value === k ? 'on' : ''}`} onClick={() => onChange(k)} onKeyDown={(e) => { if (e.key === 'Enter') onChange(k) }}>
    {label}{count != null && <em>{count}</em>}</span>)}</div>
}
export function Search({ value, onChange, placeholder }) {
  return <label className="search"><Icon name="search" size={16} /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} /></label>
}

/** Biểu đồ vành khuyên trạng thái buổi tập. */
export const SESSION_PARTS = [
  ['Hoàn thành', (s) => s.Status === 'Completed', '#4c5b36'],
  ['Đã hủy hoặc dừng', (s) => s.Status === 'Cancelled', '#c9d6b6'],
  ['Vắng', (s) => s.Status === 'Missed', '#e4c58e'],
  ['Sắp diễn ra / đang tập', (s) => ['Assigned', 'In Progress'].includes(s.Status), '#e7e8e1'],
]
export function SessionDonut({ sessions, title = 'Kết quả buổi tập' }) {
  const total = sessions.length
  const parts = SESSION_PARTS.map(([label, test, color]) => [label, sessions.filter(test).length, color])
  let acc = 0
  const stops = parts.map(([, n, color]) => { const from = acc; acc += total ? (n / total) * 100 : 0; return `${color} ${from}% ${acc}%` })
  const pct = total ? Math.round((parts[0][1] / total) * 100) : 0
  return <div className="card donut-card"><h2>{title}</h2>
    <div className="donut-body">
      <div className="donut" style={{ background: total ? `conic-gradient(${stops.join(',')})` : '#e7e8e1' }}><div><b>{pct}%</b><small>Hoàn thành</small></div></div>
      <div className="donut-legend"><p><b>{total}</b> buổi tập</p>
        {parts.map(([label, n, color]) => <div key={label}><i style={{ background: color }} /><span>{label}</span><b>{n}</b></div>)}</div>
    </div></div>
}

/** Thẻ một giai đoạn huấn luyện. */
export function StageCard({ stage: st, index, current, action, extra, showIntensity = true }) {
  return <div className={`card stage ${current ? 'cur' : ''}`}>
    <div className="stage-head"><div><p className="stage-eyebrow">GIAI ĐOẠN {st.StageOrder || index + 1}{current ? ' · ĐANG DIỄN RA' : ''}</p>
      <h3>{st.StageName}</h3><small>{shortRange(st.StartDate, st.EndDate)}</small></div>
      <div className="stage-side">{action}{st.ClosedAt ? <Badge kind="ok">Đã chốt</Badge> : !action && showIntensity ? <IntensityBadge value={st.Intensity} /> : null}</div></div>
    <dl className="dl four" style={{ marginTop: 12 }}>
      <div><dt>Cường độ</dt><dd>{INTENSITY[st.Intensity] || '—'}</dd></div>
      <div><dt>Mức tải tập luyện</dt><dd>{num(st.TrainingLoad, 0)}</dd></div>
      <div><dt>Quãng đường mục tiêu</dt><dd>{km(st.DistanceTargetKm)}</dd></div>
      <div><dt>Mặt sân</dt><dd>{st.Surface || '—'}</dd></div>
      {st.Goal && <div className="full"><dt>Mục tiêu giai đoạn</dt><dd>{st.Goal}</dd></div>}
    </dl>
    {st.ClosedAt && <div className="quote" style={{ marginTop: 12 }}><small>Tổng kết · {st.ClosedByName || '—'} chốt lúc {fmtDateTime(st.ClosedAt)}</small><p>{st.SummaryNote || 'Không có nhận xét tổng kết.'}</p></div>}
    {extra}
  </div>
}

/** Thẻ ngữ cảnh giáo án: ảnh ngựa, tên, dòng mô tả, nhãn trạng thái. */
export function PlanContext({ plan, meta, badge }) {
  return <div className="ctx"><div className="who"><HorseThumb horseId={plan.HorseID} size={64} />
    <div><h2>{plan.HorseName}</h2><p>{meta}</p></div></div>{badge ?? <PlanBadge plan={plan} />}</div>
}
export function planMeta(p, { withTrainer = false } = {}) {
  const parts = [planName(p)]
  if (withTrainer) parts.push(`Huấn luyện viên ${p.TrainerName}`)
  if (p.ApprovedAt && ['Active', 'Completed', 'Cancelled'].includes(p.Status)) parts.push(`Được duyệt ${fmtDateTime(p.ApprovedAt)}${p.ApprovedByName ? ` bởi ${p.ApprovedByName}` : ''}`)
  else if (p.SubmittedAt) parts.push(`Gửi duyệt ${fmtDateTime(p.SubmittedAt)}`)
  else parts.push(`Tạo lúc ${fmtDateTime(p.CreatedAt)}`)
  return parts.join(' · ')
}
/** Giai đoạn đang diễn ra (chưa chốt, đã tới ngày bắt đầu). */
export function currentStage(plan, today = todayIso()) {
  const open = (plan.Stages || []).filter((st) => !st.ClosedAt && st.StartDate <= today)
  return open.length ? open[open.length - 1] : null
}
