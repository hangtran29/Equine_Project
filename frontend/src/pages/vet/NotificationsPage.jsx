import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCompleteVetList } from '../../api/vetApi.ts'
import { useAction } from '../../components/common/useOperations.js'
import { Feedback } from '../../components/common/OperationUI.jsx'
import { scheduleTypes, vetDateTime } from './vetDomain.js'
import { notifyNotificationsChanged } from '../../flow1/api.js'

function destination(item, role) {
  const horse = encodeURIComponent(item.HorseID ?? '')
  const id = encodeURIComponent(item.EntityID)
  if (role === 'vet') {
    if (item.EntityName === 'HealthReport') return `/vet/reports?report=${id}&status=all`
    if (item.EntityName === 'MedicalRecord') return `/vet/horses/${horse}/examination?record=${id}`
    if (['Vaccination', 'MedicalSchedule'].includes(item.EntityName)) return `/vet/horses/${horse}?tab=calendar&event=${item.EntityName === 'Vaccination' ? 'v' : 's'}-${id}`
    return horse ? `/vet/horses/${horse}` : '/vet/overview'
  }
  if (item.EntityName === 'ProfileChangeRequest') return '/manager/profile-change-requests'
  if (['InventoryItem', 'InventoryRequest'].includes(item.EntityName)) return '/manager/inventory'
  return horse ? `/horses/${horse}` : '/manager/reports'
}

function title(item) {
  const known = { INITIAL_EXAM: 'Ngựa chờ khám đầu vào', DRAFT_RECORD: 'Phiếu khám nháp chưa chốt', HEALTH_REPORT: 'Báo cáo sức khỏe cần xử lý',
    HORSE_TO_VERIFY: 'Hồ sơ ngựa chờ xác minh', HORSE_TO_APPROVE: 'Đã khám đầu vào, chờ duyệt tiếp nhận', PROFILE_CHANGE: 'Yêu cầu sửa lý lịch chờ duyệt' }
  if (item.Type === 'MEDICAL_SCHEDULE') return `Lịch ${Object.values(scheduleTypes).find(label => item.Title.includes(label)) || Object.entries(scheduleTypes).find(([code]) => item.Title.includes(code))?.[1] || 'y tế'}`
  return known[item.Type] || item.Title
}

export default function NotificationsPage({ currentUser, role }) {
  const [state, setState] = useState({ loading: true, rows: [], error: '' })
  const [version, setVersion] = useState(0)
  const [unread, setUnread] = useState(false)
  const inFlight = useRef(null)
  const reload = () => setVersion(v => v + 1)
  const action = useAction(() => { reload(); notifyNotificationsChanged() })
  useEffect(() => {
    let active = true
    let timer
    async function load() {
      if (document.visibilityState === 'hidden') { timer = setTimeout(load, 30000); return }
      setState(s => ({ ...s, loading: true, error: '' }))
      if (!inFlight.current) inFlight.current = getCompleteVetList('/notifications').finally(() => { inFlight.current = null })
      try {
        const rows = await inFlight.current
        if (active) setState({ loading: false, rows, error: '' })
      } catch {
        if (active) setState({ loading: false, rows: [], error: 'Không thể tải thông báo. Vui lòng thử lại.' })
      }
      if (active) timer = setTimeout(load, 30000)
    }
    void load()
    return () => { active = false; clearTimeout(timer) }
  }, [currentUser.id, version])
  const rows = state.rows.filter(r => !unread || !r.IsRead)
  return <main className="page-content vet-workspace"><header className="page-heading"><div><h1>Thông báo</h1><p>Tự làm mới mỗi 30 giây khi trang thông báo đang mở và hiển thị.</p></div><button className="button button-secondary" disabled={state.loading} onClick={reload}>Làm mới</button></header><section className="panel"><div className="vet-toolbar"><label className="manager-choice"><input type="checkbox" checked={unread} onChange={e => setUnread(e.target.checked)} />Chỉ xem chưa đọc</label><button className="button button-secondary" disabled={state.loading || action.busy || !state.rows.some(r => !r.IsRead)} onClick={() => action.run('/notifications/read', { All: true })}>Đánh dấu tất cả đã đọc</button></div><Feedback action={action} />
    {state.loading ? <p role="status">Đang tải thông báo…</p> : state.error ? <div role="alert"><p>{state.error}</p><button className="button" onClick={reload}>Thử lại</button></div> : <>{!rows.length && <p>Không có thông báo phù hợp.</p>}{rows.map(item => <article className="vet-event" key={item.Key}><div><Link to={destination(item, role)}><strong>{title(item)}</strong></Link><p>{item.HorseName}</p>{item.Message && <p>{item.Message}</p>}<small>{item.At?.length === 10 ? item.At : item.At ? vetDateTime(item.At) : 'Chưa ghi thời điểm'} · {item.Priority === 'High' ? 'Cần chú ý' : 'Thông thường'} · {item.IsRead ? 'Đã đọc' : 'Chưa đọc'}</small></div>{!item.IsRead && <button className="button button-secondary" disabled={action.busy} onClick={() => action.run('/notifications/read', { Keys: [item.Key] })}>Đánh dấu đã đọc</button>}</article>)}</>}
  </section></main>
}
