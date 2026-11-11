// Sơ đồ chuồng trại (27): bản đồ tổng thể khu câu lạc bộ + sơ đồ chuồng dạng lưới.
// readOnly: người chăm sóc ngựa (Groom) chỉ xem — không thêm chuồng, không chuyển chuồng, không đổi trạng thái bảo trì.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from './api.js'
import { MAP_W, MAP_H, campusPins, iso, pinIcon, scene, stallLayout } from './campusMap.js'
import { HorseThumb } from './horse.jsx'
import {
  Crumb, DateField, Dialog, Dl, Heading, Icon, Loading, Notice, SelectInput, TextInput, errorText, fmtDate, todayIso, useAction, useLoad,
} from './ui.jsx'
import './f1.css'

const zoneOf = (number) => (String(number).match(/^[A-Za-z]+/)?.[0] || '#').toUpperCase()
const STATUS_TEXT = { Available: 'Còn trống', Occupied: 'Đang sử dụng', Maintenance: 'Đang bảo trì' }
const isOccupied = (stall) => Boolean(stall.CurrentHorse) || stall.Status === 'Occupied'

export default function StallPage({ readOnly = false }) {
  const [view, setView] = useState('map')
  const stalls = useLoad(() => api.getStalls(), [])
  return <main className="page-content f1">
    <Crumb items={[['Sơ đồ chuồng trại']]} />
    <Heading title="Sơ đồ chuồng trại" />
    <section className="panel" style={{ marginTop: 48 }}>
      <div className="viewtabs" role="tablist">
        <span role="tab" tabIndex={0} aria-selected={view === 'map'} className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}><Icon name="club" size={16} /> Bản đồ tổng thể</span>
        <span role="tab" tabIndex={0} aria-selected={view === 'grid'} className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}><Icon name="stall" size={16} /> Sơ đồ chuồng</span>
      </div>
      {stalls.loading ? <Loading /> : stalls.error ? <Notice kind="bad">{errorText(stalls.error)}</Notice>
        : view === 'map' ? <CampusMap stalls={stalls.data} onOpenGrid={() => setView('grid')} readOnly={readOnly} />
          : <StallGrid stalls={stalls.data} onChanged={stalls.reload} readOnly={readOnly} />}
    </section>
  </main>
}

// ---------------- bản đồ tổng thể ----------------
const PIN_LABEL = { stall: 'Dãy chuồng', clinic: 'Phòng khám thú y', store: 'Kho thức ăn & vật tư', wash: 'Khu tắm & ngâm chân',
  track: 'Đường đua', jump: 'Sân vượt rào', paddock: 'Bãi chăn thả', trail: 'Đường mòn sức bền', office: 'Văn phòng câu lạc bộ' }

// Điều khiển bản đồ: + / − để phóng to, thu nhỏ; kéo nền bản đồ để di chuyển;
// kéo mũi tên N để xoay; bấm N để quay về hướng Bắc (đang ở hướng Bắc thì xoay 90°).
const ZOOM_MIN = 0.6, ZOOM_MAX = 3, ZOOM_STEP = 1.3
const CX = MAP_W / 2, CY = MAP_H / 2
const rad = (deg) => (deg * Math.PI) / 180
const rotate = ([x, y], deg) => { const c = Math.cos(rad(deg)), s = Math.sin(rad(deg)); return [x * c - y * s, x * s + y * c] }
// Tọa độ trên bản đồ gốc -> tọa độ trong khung sau khi phóng to / xoay / di chuyển
const project = ([px, py], v) => { const [rx, ry] = rotate([(px - CX) * v.z, (py - CY) * v.z], v.r); return [CX + v.x + rx, CY + v.y + ry] }

function CampusMap({ stalls, onOpenGrid, readOnly }) {
  const [selected, setSelected] = useState('')
  const [filter, setFilter] = useState('')
  const [view, setView] = useState({ z: 1, r: 0, x: 0, y: 0 })
  const [dragging, setDragging] = useState(null)
  const drag = useRef(null)
  const compass = useRef(null)
  const mapRef = useRef(null)
  const touched = useRef(false) // người dùng đã zoom / kéo / xoay thì không tự canh lại nữa
  // Kích thước khung bản đồ thật (điện thoại hẹp hơn 1066px): thu nhỏ vừa khung, canh giữa
  const [box, setBox] = useState({ w: MAP_W, h: MAP_H })
  useEffect(() => {
    const el = mapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth || MAP_W, h = el.clientHeight || MAP_H
      setBox({ w, h })
      if (!touched.current) setView({ z: Math.min(1, w / MAP_W), r: 0, x: w / 2 - CX, y: h / 2 - CY })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const fit = Math.min(1, box.w / MAP_W)
  const narrow = box.w < 700
  const zMin = Math.min(ZOOM_MIN, fit)
  const bx = box.w / 2 - CX, by = box.h / 2 - CY // độ lệch để tâm bản đồ nằm giữa khung
  useEffect(() => {
    if (!selected) return undefined
    const onKey = (event) => { if (event.key === 'Escape') setSelected('') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])
  // Giữ phần bản đồ không bị kéo trôi hẳn ra ngoài khung
  const clampPan = ([x, y], z) => [Math.max(bx - MAP_W * z / 2, Math.min(bx + MAP_W * z / 2, x)), Math.max(by - MAP_H * z / 2, Math.min(by + MAP_H * z / 2, y))]
  const zones = useMemo(() => [...new Set(stalls.map((s) => zoneOf(s.StallNumber)))].sort(), [stalls])
  const layout = useMemo(() => stallLayout(zones), [zones])
  const pins = useMemo(() => campusPins(layout), [layout])
  const html = useMemo(() => scene(layout), [layout])
  const types = Object.keys(PIN_LABEL)
  const pin = pins.find((p) => p[0] === selected)

  // Phóng to / thu nhỏ quanh tâm khung đang nhìn
  const zoomBy = (factor) => { touched.current = true; setView((v) => {
    const z = Math.max(zMin, Math.min(ZOOM_MAX, +(v.z * factor).toFixed(3)))
    const k = z / v.z
    const [x, y] = clampPan([bx + (v.x - bx) * k, by + (v.y - by) * k], z)
    return { ...v, z, x, y }
  }) }
  // Xoay quanh tâm khung đang nhìn
  const rotateTo = (r) => { touched.current = true; setView((v) => {
    const [dx, dy] = rotate([v.x - bx, v.y - by], r - v.r)
    return { ...v, r, x: bx + dx, y: by + dy }
  }) }
  const compassAngle = (e) => {
    const box = compass.current.getBoundingClientRect()
    return (Math.atan2(e.clientX - (box.left + box.width / 2), -(e.clientY - (box.top + box.height / 2))) * 180) / Math.PI
  }

  function onMapDown(e) {
    if (e.button !== 0 || e.target.closest('.mpin, .mcard, .mzoom, .mcompass')) return
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, x: view.x, y: view.y, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onCompassDown(e) {
    if (e.button !== 0) return
    e.stopPropagation()
    drag.current = { kind: 'rotate', start: compassAngle(e), r: view.r, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onMove(e) {
    const d = drag.current
    if (!d) return
    if (d.kind === 'pan') {
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy
      if (!d.moved && Math.hypot(dx, dy) < 4) return
      d.moved = true; touched.current = true; setDragging('pan')
      const [x, y] = clampPan([d.x + dx, d.y + dy], view.z)
      setView((v) => ({ ...v, x, y }))
    } else {
      const delta = compassAngle(e) - d.start
      if (!d.moved && Math.abs(delta) < 3) return
      d.moved = true; setDragging('rotate')
      rotateTo(Math.round(d.r + delta))
    }
  }
  function onUp(e) {
    const d = drag.current
    drag.current = null
    setDragging(null)
    if (!d) return
    if (d.kind === 'rotate' && !d.moved) {
      const north = ((view.r % 360) + 360) % 360 === 0
      rotateTo(north ? view.r + 90 : 0)
    }
    if (d.kind === 'pan' && !d.moved && e.target.closest('svg.scene')) setSelected('')
  }

  const inv = `rotate(${-view.r}deg) scale(${1 / view.z})` // giữ ghim, nhãn đứng thẳng và đúng cỡ
  const btn = (disabled) => ({ cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1, userSelect: 'none' })
  const key = (e, fn) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() } }
  const [gx, gy] = iso(92, 76)
  return <>
    <p className="hint">Bản đồ minh họa các khu vực. Vị trí thực địa chưa được cấu hình; danh sách chuồng dùng dữ liệu hiện tại của câu lạc bộ.</p>
    <div className="mlegend">{types.map((t) => <span key={t} role="button" tabIndex={0} className={filter === t ? 'on' : ''}
      onClick={() => setFilter((f) => (f === t ? '' : t))}><i dangerouslySetInnerHTML={{ __html: pinIcon(t, 13) }} />{PIN_LABEL[t]}</span>)}</div>
    <div ref={mapRef} className="map" style={{ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
      onPointerDown={onMapDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: MAP_W, height: MAP_H, transformOrigin: `${CX}px ${CY}px`, transform: `translate(${view.x}px, ${view.y}px) rotate(${view.r}deg) scale(${view.z})`,
        transition: dragging ? 'none' : 'transform .25s ease' }}>
        <svg className="scene" width={MAP_W} height={MAP_H} viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-label="Bản đồ khu câu lạc bộ" role="img" style={{ display: 'block', maxWidth: 'none' }}>
          <g id="campus-scene" dangerouslySetInnerHTML={{ __html: html }} /></svg>
        <div className="mlabel" style={{ left: gx - 40, top: gy - 8, transform: inv, transformOrigin: '40px 8px', transition: 'inherit' }}>Cổng chính</div>
        {pins.filter((p) => !filter || p[1] === filter).map(([id, icon, label, x, y, z]) => {
          const [px, py] = iso(x, y, z)
          return <button key={id} type="button" className={`mpin ${selected === id ? 'on' : ''}`} title={label} aria-label={label}
            style={{ left: px, top: py, transform: inv, transformOrigin: '50% calc(100% + 8px)', transition: 'inherit' }}
            onClick={(e) => { e.stopPropagation(); setSelected((cur) => (cur === id ? '' : id)) }}>
            {id.length <= 2 && icon === 'stall' ? <b>{id}</b> : <span dangerouslySetInnerHTML={{ __html: pinIcon(icon, selected === id ? 20 : 17) }} style={{ display: 'flex' }} />}
          </button>
        })}
      </div>
      {pin && !narrow && <MapCard pin={pin} at={project(iso(pin[3], pin[4], pin[5]), view)} box={box} stalls={stalls} onOpenGrid={onOpenGrid} readOnly={readOnly} onClose={() => setSelected('')} />}
      <div className="mzoom" style={{ cursor: 'default' }}>
        <span role="button" tabIndex={0} aria-label="Phóng to" title="Phóng to" aria-disabled={view.z >= ZOOM_MAX} style={btn(view.z >= ZOOM_MAX)}
          onClick={() => zoomBy(ZOOM_STEP)} onKeyDown={(event) => key(event, () => zoomBy(ZOOM_STEP))}>+</span>
        <span role="button" tabIndex={0} aria-label="Thu nhỏ" title="Thu nhỏ" aria-disabled={view.z <= zMin} style={btn(view.z <= zMin)}
          onClick={() => zoomBy(1 / ZOOM_STEP)} onKeyDown={(event) => key(event, () => zoomBy(1 / ZOOM_STEP))}>−</span>
      </div>
      <div ref={compass} className="mcompass" role="button" tabIndex={0} aria-label="Xoay bản đồ (bấm để về hướng Bắc)" title="Kéo để xoay · Bấm để về hướng Bắc"
        style={{ cursor: dragging === 'rotate' ? 'grabbing' : 'pointer', userSelect: 'none', touchAction: 'none',
          transform: `rotate(${view.r}deg)`, transition: dragging ? 'none' : 'transform .25s ease' }}
        onPointerDown={onCompassDown}
        onKeyDown={(event) => key(event, () => rotateTo(((view.r % 360) + 360) % 360 === 0 ? view.r + 90 : 0))}>
        N<svg width="14" height="18" viewBox="0 0 14 18"><path d="M7 1l5 16-5-4-5 4z" fill="#3d4a2c" /></svg></div>
    </div>
    {/* Điện thoại: thẻ thông tin nằm dưới bản đồ, không che bản đồ */}
    {pin && narrow && <MapCard pin={pin} at={[0, 0]} box={box} inline stalls={stalls} onOpenGrid={onOpenGrid} readOnly={readOnly} onClose={() => setSelected('')} />}
  </>
}

function MapCard({ pin, at, box = { w: MAP_W, h: MAP_H }, inline = false, stalls, onOpenGrid, readOnly, onClose }) {
  const [id, icon, label, x, y] = pin
  const [px, py] = at // vị trí ghim trong khung (đã tính phóng to / xoay)
  const focus = icon === 'track' ? [26, 64] : [x, y]
  const [gx, gy] = iso(...focus, 0)
  const left = Math.max(12, Math.min(box.w - 322, px > box.w * 0.55 ? px - 350 : px + 34))
  const top = Math.max(12, Math.min(py - 150, box.h - 400))
  // thẻ luôn nằm gọn trong khung bản đồ; nội dung dài thì cuộn trong thẻ
  return <div className="mcard" style={inline ? { position: 'relative', left: 0, top: 0, width: '100%', marginTop: 12, boxShadow: 'none', border: '1px solid #e4e6dc' }
    : { left, top, maxHeight: Math.max(220, box.h - top - 12), overflowY: 'auto' }}
    onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
    <button type="button" className="mcard-close" aria-label="Đóng" title="Đóng" onClick={onClose}>×</button>
    <svg className="mcard-img" viewBox={`${gx - 150} ${gy - 95} 300 140`} preserveAspectRatio="xMidYMid slice" aria-hidden="true"><use href="#campus-scene" /></svg>
    <div className="mcard-body">
      <div className="mcard-head"><span className="mcard-ic" dangerouslySetInnerHTML={{ __html: pinIcon(icon, 15) }} /><div><h3>{label}</h3><p>{CARD_TEXT[icon] || ''}</p></div></div>
      {icon === 'stall' ? <ZoneCard zone={id} stalls={stalls} onOpenGrid={onOpenGrid} />
        : icon === 'track' ? <TrackCard readOnly={readOnly} /> : icon === 'clinic' ? <ClinicCard readOnly={readOnly} /> : null}
    </div>
  </div>
}
const CARD_TEXT = {
  clinic: 'Khám lâm sàng, điều trị và theo dõi sức khỏe ngựa', store: 'Thức ăn, thuốc và dụng cụ chăm sóc', wash: 'Tắm sau buổi tập, ngâm chân lạnh',
  track: 'Đua bằng và đua xe kéo', jump: 'Tập vượt chướng ngại vật', paddock: 'Thả lỏng, dắt bộ sau tập', trail: 'Tập sức bền đường dài',
  office: 'Ban quản lý câu lạc bộ, tiếp nhận hồ sơ',
}

function ZoneCard({ zone, stalls, onOpenGrid }) {
  const list = stalls.filter((s) => zoneOf(s.StallNumber) === zone).sort((a, b) => a.StallNumber.localeCompare(b.StallNumber))
  const used = list.filter(isOccupied).length
  return <>
    <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#6b6f62' }}>{list.length} chuồng · {used} đang sử dụng · {list.filter((s) => s.Status === 'Available').length} còn trống</p>
    <div className="mcard-stalls">{list.slice(0, 9).map((s) => <span key={s.StallID} className={isOccupied(s) ? 'occ' : ''}>
      <b>{s.StallNumber}</b>{s.CurrentHorse?.HorseName || STATUS_TEXT[s.Status]}</span>)}</div>
    <button type="button" className="mcard-link" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }} onClick={onOpenGrid}>Xem dãy chuồng →</button>
  </>
}

/** Giờ buổi tập: bắt đầu – kết thúc; chưa có giờ kết thúc thì tính từ thời lượng dự kiến, không có thì chỉ ghi giờ bắt đầu. */
function timeRange(s) {
  const start = String(s.StartTime || '').slice(0, 5)
  let end = String(s.EndTime || '').slice(0, 5)
  if (!end && start && s.DurationPlannedMinutes) {
    const [h, m] = start.split(':').map(Number)
    const total = h * 60 + m + Number(s.DurationPlannedMinutes)
    end = `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  }
  return end ? `${start}–${end}` : start
}

function TrackCard({ readOnly }) {
  const { data, error, loading } = useLoad(() => api.getTrainingSessions({ Date: todayIso() }), [])
  const today = (data || []).filter((s) => String(s.SessionDate || s.ScheduledDate || '').startsWith(todayIso())).slice(0, 4)
  return <>
    {loading ? <p className="hint">Đang tải...</p> : error ? <p className="hint">Không xem được lịch tập hôm nay.</p>
      : !today.length ? <p className="hint" style={{ marginTop: 10 }}>Hôm nay chưa có buổi tập nào.</p>
        : <div className="mcard-list">{today.map((s) => <div key={s.TrainingSessionID}><span className={s.Status === 'In Progress' ? 'live' : ''} />
          <b>{s.HorseName}</b><small>{timeRange(s)}{s.WorkRiderName ? ` · Kỵ sĩ ${s.WorkRiderName}` : ''}</small></div>)}</div>}
    {!readOnly && <Link className="mcard-link" to="/training/schedule">Xem lịch tập hôm nay →</Link>}
  </>
}

function ClinicCard({ readOnly }) {
  const { data } = useLoad(async () => {
    const [duty, horses] = await Promise.all([api.getDutyNow().catch(() => []), api.getHorses({ RegistrationStatus: 'PendingExam' }).catch(() => [])])
    const locks = await api.getTrainingLocks({ LockStatus: 'Active' }).catch(() => null)
    const reports = await api.getHealthReports().catch(() => null)
    return { duty, waiting: horses.filter((h) => !h.InitialExamSigned).length, locks, reports }
  }, [])
  return <>
    <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#6b6f62' }}>Bác sĩ đang trực: {data?.duty?.length ? data.duty.map((d) => d.VetName).join(', ') : 'chưa phân công'}</p>
    <div className="mcard-kpi"><div><b>{data?.waiting ?? '—'}</b><small>Chờ khám lâm sàng</small></div>
      <div><b>{data?.reports ? data.reports.filter((r) => r.Status !== 'Resolved').length : '—'}</b><small>Báo cáo sức khỏe</small></div>
      <div><b>{data?.locks ? data.locks.length : '—'}</b><small>Ngựa khóa tập</small></div></div>
    {!readOnly && <Link className="mcard-link" to="/manager/vet-duty">Xem lịch trực →</Link>}
  </>
}

// ---------------- sơ đồ chuồng dạng lưới ----------------
function StallGrid({ stalls, onChanged, readOnly }) {
  const [selectedId, setSelectedId] = useState(null)
  const [adding, setAdding] = useState(false)
  const zones = useMemo(() => {
    const map = {}
    stalls.forEach((s) => { (map[zoneOf(s.StallNumber)] ||= []).push(s) })
    Object.values(map).forEach((l) => l.sort((a, b) => a.StallNumber.localeCompare(b.StallNumber, undefined, { numeric: true })))
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [stalls])
  const counts = { Available: 0, Occupied: 0, Maintenance: 0 }
  stalls.forEach((s) => { counts[isOccupied(s) ? 'Occupied' : s.Status] = (counts[isOccupied(s) ? 'Occupied' : s.Status] || 0) + 1 })
  const selected = stalls.find((s) => s.StallID === selectedId)
  return <>
    <div className="toolbar"><div className="legend">
      <span><i style={{ background: '#8fa06e' }} />Còn trống · {counts.Available}</span><span><i style={{ background: '#4c5b36' }} />Đang sử dụng · {counts.Occupied}</span>
      <span><i style={{ background: '#c9962b' }} />Đang bảo trì · {counts.Maintenance}</span></div>
      {!readOnly && <button type="button" className="btn sec" style={{ marginLeft: 'auto' }} onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Thêm chuồng</button>}</div>
    <div className="two" style={{ gridTemplateColumns: selected ? 'minmax(0,1fr) 310px' : '1fr' }}><div>
      {zones.map(([zone, list]) => <div key={zone}><p className="zone">Dãy {zone}</p><div className="stalls">{list.map((s) => {
        const occ = isOccupied(s)
        const cls = occ ? 'occ' : s.Status === 'Maintenance' ? 'mt' : ''
        return <button type="button" key={s.StallID} className={`stall ${cls} ${selectedId === s.StallID ? 'sel' : ''}`} onClick={() => setSelectedId(s.StallID)}>
          <b>{s.StallNumber}</b><span>{s.CurrentHorse?.HorseName || STATUS_TEXT[s.Status]}</span>
          <small>{occ ? 'Đang sử dụng' : s.Status === 'Maintenance' ? (s.MaintenanceUntil ? `Đến ${fmtDate(s.MaintenanceUntil)}` : 'Chưa có hạn') : 'Sẵn sàng'}</small></button>
      })}</div></div>)}
      {!zones.length && <p className="empty">{readOnly ? 'Câu lạc bộ chưa có chuồng.' : 'Câu lạc bộ chưa có chuồng. Bấm “Thêm chuồng” để tạo.'}</p>}
    </div>
      {selected && <StallPanel stall={selected} stalls={stalls} onClose={() => setSelectedId(null)} onChanged={onChanged} readOnly={readOnly} />}</div>
    {adding && !readOnly && <AddStallDialog onClose={() => setAdding(false)} onSaved={() => { setAdding(false); onChanged() }} />}
  </>
}

function StallPanel({ stall: s, stalls, onClose, onChanged, readOnly }) {
  const groom = useLoad(() => (s.CurrentHorse ? api.getHorseGroom(s.CurrentHorse.HorseID) : Promise.resolve(null)), [s.StallID])
  const [moving, setMoving] = useState(false)
  const [target, setTarget] = useState('')
  const [until, setUntil] = useState(s.MaintenanceUntil || '')
  const { busy, error, run } = useAction()
  const free = stalls.filter((x) => x.Status === 'Available' && !x.CurrentHorse)
  return <div className="card" style={{ alignSelf: 'start' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}><div><h2 style={{ margin: 0, fontSize: 22 }}>{s.StallNumber}</h2>
      <small style={{ color: '#6b6f62' }}>Dãy {zoneOf(s.StallNumber)} · {s.CurrentHorse ? 'Đang sử dụng' : STATUS_TEXT[s.Status]}</small></div>
      <button type="button" className="link" onClick={onClose}>Đóng</button></div>
    {s.CurrentHorse ? <>
      <div className="ctx" style={{ marginTop: 14, padding: 12 }}><div className="who"><HorseThumb horseId={s.CurrentHorse.HorseID} size={48} />
        <div><h2 style={{ fontSize: 16, margin: '0 0 3px' }}>{s.CurrentHorse.HorseName}</h2></div></div></div>
      <div style={{ marginTop: 14 }}><Dl cols={1} items={[['Người chăm sóc phụ trách', groom.data?.GroomName], ['Ngày nhận chuồng', fmtDate(s.CurrentHorse.StartDate)]]} /></div>
      {readOnly ? null : moving ? <div className="form" style={{ marginTop: 12 }}>
        <SelectInput label="Chuyển sang chuồng" required value={target} onChange={setTarget} placeholder="Chọn chuồng trống" options={free.map((x) => [String(x.StallID), x.StallNumber])} />
        <div style={{ display: 'flex', gap: 8 }}><button type="button" className="btn pri sm" disabled={busy || !target}
          onClick={async () => { if (await run(() => api.moveStall(s.CurrentHorse.HorseID, target))) { setMoving(false); onChanged() } }}>Xác nhận</button>
          <button type="button" className="btn sec sm" onClick={() => setMoving(false)}>Hủy</button></div></div>
        : <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="btn sec sm" onClick={() => setMoving(true)}>Chuyển chuồng</button>
          <Link className="btn sec sm" to={`/manager/horses/${s.CurrentHorse.HorseID}/intake`}>Xem hồ sơ ngựa</Link></div>}
    </> : readOnly || isOccupied(s) ? <div style={{ marginTop: 14 }}><Dl cols={1} items={[['Trạng thái', STATUS_TEXT[s.Status]], ...(s.Status === 'Maintenance' ? [['Dự kiến xong bảo trì', s.MaintenanceUntil ? fmtDate(s.MaintenanceUntil) : 'Chưa có hạn']] : [])]} /></div>
      : <div className="form" style={{ marginTop: 14 }}>
      {s.Status === 'Maintenance' ? <>
        <DateField label="Dự kiến xong bảo trì" value={until} onChange={setUntil} min={todayIso()} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn sec sm" disabled={busy} onClick={async () => { if (await run(() => api.updateStall(s.StallID, { MaintenanceUntil: until || null }))) onChanged() }}>Lưu hạn bảo trì</button>
          <button type="button" className="btn pri sm" disabled={busy} onClick={async () => { if (await run(() => api.updateStall(s.StallID, { Status: 'Available' }))) onChanged() }}>Hoàn tất bảo trì</button></div></>
        : <><DateField label="Dự kiến xong bảo trì" value={until} onChange={setUntil} min={todayIso()} />
          <button type="button" className="btn sec sm" disabled={busy} onClick={async () => { if (await run(() => api.updateStall(s.StallID, { Status: 'Maintenance', MaintenanceUntil: until || null }))) onChanged() }}>Chuyển sang bảo trì</button></>}
    </div>}
    {error && <Notice kind="bad" style={{ marginTop: 12 }}>{error}</Notice>}
  </div>
}

function AddStallDialog({ onClose, onSaved }) {
  const [number, setNumber] = useState('')
  const [type, setType] = useState('Standard')
  const { busy, error, run } = useAction()
  return <Dialog title="Thêm chuồng" onClose={onClose} actions={<>
    <button type="button" className="btn sec" onClick={onClose}>Hủy</button>
    <button type="button" className="btn pri" disabled={busy || !number.trim()} onClick={async () => { if (await run(() => api.createStall({ StallNumber: number.trim().toUpperCase(), StallType: type }))) onSaved() }}>Thêm chuồng</button></>}>
    <TextInput label="Số chuồng" required value={number} onChange={setNumber} placeholder="Ví dụ: A-07" maxLength={30} />
    <SelectInput label="Loại chuồng" value={type} onChange={setType} options={[['Standard', 'Tiêu chuẩn'], ['Large', 'Rộng'], ['Isolation', 'Cách ly']]} />
    {error && <Notice kind="bad">{error}</Notice>}
  </Dialog>
}
