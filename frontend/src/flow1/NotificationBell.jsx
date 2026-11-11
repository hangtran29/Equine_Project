// Chuông thông báo trên thanh trên cùng (thay cho email): số chưa đọc + danh sách thả xuống.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import * as api from './api.js'
import { fmtDateTime } from './ui.jsx'

/**
 * Trang mở ra khi bấm vào một thông báo: luôn là trang có đúng hồ sơ / giáo án / buổi tập / báo cáo đó,
 * theo chức vụ người nhận. Trả null khi nội dung đã nằm trọn trong thông báo (ví dụ phản hồi hỗ trợ).
 */
export function notificationTarget(role, item) {
  const id = item.EntityID, horse = item.HorseID, type = item.Type || ''
  const horsePage = horse ? (role === 'owner' ? `/owner/horses/${horse}` : role === 'vet' ? `/vet/horses/${horse}`
    : role === 'manager' ? `/manager/horses/${horse}/intake` : `/horses/${horse}`) : null
  const report = role === 'vet' ? `/vet/reports/${id}` : `/health-reports/${id}`
  const session = role === 'workRider' ? `/training/work-rider-sessions/${id}`
    : ['trainer', 'headTrainer'].includes(role) ? `/training/sessions/${id}` : horsePage
  const kind = type.startsWith('ACT_') ? type.slice(4) : type
  switch (kind) {
    // ---------- Flow 1: hồ sơ, tiếp nhận, tài khoản, hỗ trợ ----------
    case 'HORSE_TO_VERIFY': case 'HORSE_TO_APPROVE': return `/manager/horses/${horse}/intake`
    case 'VET_DUTY_MISSING': return '/manager/vet-duty'
    case 'PROFILE_CHANGE': return '/manager/profile-change-requests'
    case 'SUPPORT_REQUEST': return `/manager/support-requests?id=${id}`
    case 'SUPPORT_RESOLVED': return null
    case 'INITIAL_EXAM': return `/vet/horses/${horse}/clinical`
    case 'DRAFT_RECORD': return `/vet/records/${id}/edit`
    case 'HORSE_REJECTED': case 'PROFILE_CHANGE_DONE': case 'VERIFY_REGISTRATION': return `/owner/horses/${horse}`
    case 'APPROVE_REGISTRATION': return role === 'headTrainer' ? `/training/horses/${horse}/assessment` : horsePage
    case 'ARCHIVE_HORSE': return role === 'owner' ? horsePage : null
    case 'MOVE_STALL': case 'SIGN_MEDICAL_RECORD': return horsePage
    case 'CHANGE_USER_ROLES': return null
    // ---------- Flow 2: huấn luyện ----------
    case 'ASSIGN_TRAINER': return role === 'trainer' ? '/training/my-plans' : horsePage
    case 'END_TRAINER_ASSIGNMENT': return '/training/my-plans'
    case 'PLAN_TO_APPROVE': return `/training/approvals/${id}`
    case 'ADJUSTMENT_REQUIRED': return '/training/adjustments'
    case 'PLAN_DRAFT_FROM_TEMPLATE': case 'PLAN_RETURNED': return `/training/plans/${id}/edit`
    case 'APPROVE_TRAINING_PLAN': case 'CANCEL_TRAINING_PLAN': case 'COMPLETE_TRAINING_PLAN': case 'STAGE_TO_CLOSE':
      return `/training/plans/${id}`
    case 'SESSION_TO_REVIEW': return `/training/sessions/${id}/review`
    case 'SUPERVISE_TODAY': case 'SUBSTITUTE_OBSERVATION': case 'RIDE_TODAY': case 'ASSIGN_TRAINING_SESSION':
    case 'UPDATE_TRAINING_SESSION': case 'CANCEL_TRAINING_SESSION': case 'REVIEW_TRAINING_SESSION': case 'STOP_TRAINING_SESSION':
      return session
    case 'OWNER_SESSIONS_REVIEWED': case 'OWNER_STAGE_SUMMARY': return `/owner/horses/${horse}/training`
    case 'OWNER_PLAN_APPROVED': case 'OWNER_PLAN_SUMMARY': return `/owner/horses/${horse}/training/plans/${id}`
    case 'OWNER_SESSION_STOPPED': return `/owner/horses/${horse}/training/sessions/${id}`
    // ---------- Flow 3: sức khỏe, thú y ----------
    case 'HEALTH_REPORT': case 'TAKE_HEALTH_REPORT': case 'RESOLVE_HEALTH_REPORT': case 'ADD_HEALTH_REPORT_NOTE': return report
    case 'TRAINING_LOCKED': case 'TRAINING_UNLOCKED': case 'OWNER_TRAINING_LOCKED': case 'OWNER_TRAINING_UNLOCKED':
    case 'CREATE_TRAINING_LOCK': case 'RELEASE_TRAINING_LOCK': return horsePage
    case 'VACCINATION_DUE': case 'MEDICAL_SCHEDULE': return '/vet/calendar'
    case 'CREATE_VET_DUTY_SHIFT': return '/vet/overview'
    // ---------- Flow 4: chăm sóc, dinh dưỡng, vật tư ----------
    case 'DIET_TO_REVIEW': return '/care/diet-approvals'
    case 'DIET_RETURNED': case 'DIET_REVIEW_NEEDED': return '/care/diet-plans'
    case 'APPROVE_DIET_PLAN': case 'ADJUST_DIET_PLAN': return role === 'groom' ? '/care/diets' : '/care/diet-plans'
    case 'CARE_TASK': case 'CREATE_CARE_TASK': case 'SET_HORSE_GROOM': return role === 'groom' ? '/care/today' : '/care/tasks'
    case 'SKIP_CARE_TASK': return '/care/tasks'
    case 'INVENTORY_REQUEST': return '/care/inventory'
    case 'LOW_STOCK': return role === 'manager' ? '/care/inventory' : '/care/supplies'
    case 'APPROVE_INVENTORY_REQUEST': case 'REJECT_INVENTORY_REQUEST': return '/care/supplies'
    default: return horsePage
  }
}

// Thông báo về một con ngựa: ghi tên ngựa phía trên tiêu đề (tiêu đề đã có tên thì thôi)
const showHorse = (item) => Boolean(item.HorseName) && !String(item.Title || '').includes(item.HorseName)

export default function NotificationBell({ role }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(null)
  const [unread, setUnread] = useState(0)
  const [all, setAll] = useState(false)
  const box = useRef(null)

  useEffect(() => {
    let active = true
    const tick = () => api.getUnreadCount().then((r) => { if (active) setUnread(r?.Unread || 0) }).catch(() => {})
    tick()
    // Đếm lại khi: đổi trang, quay lại tab, có trang khác đánh dấu đã đọc, và định kỳ 30 giây
    const timer = setInterval(tick, 30000)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    window.addEventListener('equi:notifications-changed', tick)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false; clearInterval(timer)
      window.removeEventListener('equi:notifications-changed', tick)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pathname])
  useEffect(() => {
    if (!open) return undefined
    let active = true
    api.getNotifications().then((list) => { if (active) setItems(list) }).catch(() => { if (active) setItems([]) })
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => { active = false; document.removeEventListener('mousedown', close) }
  }, [open])

  async function readAll() {
    await api.markRead({ All: true }).catch(() => {})
    setUnread(0)
    setItems((list) => (list || []).map((i) => ({ ...i, IsRead: true })))
  }
  async function openItem(item) {
    if (!item.IsRead) {
      await api.markRead({ Keys: [item.Key] }).catch(() => {})
      setUnread((n) => Math.max(0, n - 1))
    }
    const to = notificationTarget(role, item)
    setOpen(false)
    if (to) navigate(to)
  }
  const shown = (items || []).slice(0, all ? 50 : 5)
  return <div className="nb" ref={box}>
    <button type="button" className={`nb-bell ${open ? 'open' : ''}`} aria-label="Thông báo" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
      {unread > 0 && <i>{unread > 99 ? '99+' : unread}</i>}
    </button>
    {open && <div className="nb-drop" role="dialog" aria-label="Thông báo">
      <header><b>Thông báo</b>{unread > 0 && <button type="button" onClick={readAll}>Đánh dấu đã đọc tất cả</button>}</header>
      <div className="nb-list">
        {items === null ? <p className="nb-empty">Đang tải...</p> : !shown.length ? <p className="nb-empty">Chưa có thông báo nào.</p>
          : shown.map((item) => <button type="button" key={item.Key} className={`nb-note ${item.IsRead ? '' : 'unread'} ${item.Priority === 'High' ? 'high' : ''}`} onClick={() => void openItem(item)}>
            <span className="dot" /><span className="nb-text">{showHorse(item) && <span className="nb-horse">Ngựa {item.HorseName}</span>}
              <b>{item.Title}</b>{item.Message && <p>{item.Message}</p>}<small>{fmtDateTime(item.At)}</small></span></button>)}
      </div>
      {(items || []).length > 5 && <footer><button type="button" onClick={() => setAll((v) => !v)}>{all ? 'Thu gọn' : 'Xem tất cả thông báo'}</button></footer>}
    </div>}
  </div>
}
