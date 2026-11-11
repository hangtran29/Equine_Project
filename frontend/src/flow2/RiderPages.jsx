// Kỵ sĩ tập luyện: Buổi tập của tôi (KS01, KS02), Ghi kết quả (KS03, KS03b, KS04), Kết quả buổi tập (KS05).
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Crumb, Dialog, Dl, Heading, Icon, Loading, Notice, SectionTitle, SelectInput, TextArea, TextInput, TimeField, errorText, useLoad } from '../flow1/ui.jsx'
import { HorseThumb } from '../flow1/horse.jsx'
import { MSG, checkSelect, checkText, runChecks, serverFieldErrors } from '../utils/validation.js'
import { EARLY_END_REASONS, EVALUATION, Pager, SessionBadge, SessionContext, addMinutes, api, exercise, hhmm, num, planLabel, sessionDate, timeRange, todayIso, usePager } from './common.jsx'

const BASE = '/training/work-rider-sessions'
const TABS = [['all', 'Tất cả'], ['upcoming', 'Sắp tới'], ['done', 'Hoàn thành'], ['off', 'Vắng / đã hủy']]
const inTab = (s, tab) => tab === 'all' || (tab === 'upcoming' && ['Assigned', 'In Progress'].includes(s.Status))
  || (tab === 'done' && s.Status === 'Completed') || (tab === 'off' && ['Cancelled', 'Missed'].includes(s.Status))

export function RiderSessionsPage() {
  const navigate = useNavigate()
  const data = useLoad(() => api.sessions({ mine: 1 }), [])
  const [tab, setTab] = useState('all')
  const [starting, setStarting] = useState(null)
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const rows = useMemo(() => (data.data || []).slice().sort((a, b) => (b.SessionDate + b.StartTime).localeCompare(a.SessionDate + a.StartTime)), [data.data])
  const today = todayIso()
  const todays = rows.filter((s) => s.SessionDate === today).sort((a, b) => a.StartTime.localeCompare(b.StartTime))
  const focus = todays.find((s) => s.Status === 'In Progress') || todays.find((s) => s.Status === 'Assigned') || null
  const shown = rows.filter((s) => inTab(s, tab))
  const pager = usePager(shown, 10)
  const count = (t) => rows.filter((s) => inTab(s, t)).length

  async function start() {
    setBusy(true); setFailure('')
    try { await api.start(starting.TrainingSessionID); setStarting(null); navigate(`${BASE}/${starting.TrainingSessionID}/result`) }
    catch (e) { setFailure(errorText(e)) } finally { setBusy(false) }
  }

  return <main className="page-content f1">
    <Crumb items={[['Buổi tập của tôi']]} />
    <Heading title="Buổi tập của tôi" />
    <section className="panel">
      {data.loading ? <Loading /> : data.error ? <Notice kind="bad">{errorText(data.error)}</Notice> : <>
        <div className="kpis">
          <div className="kpi"><small>Buổi hôm nay</small><b>{todays.length}</b></div>
          <div className="kpi"><small>Đã phân công</small><b>{rows.filter((s) => s.Status === 'Assigned').length}</b></div>
          <div className="kpi"><small>Đang tập</small><b>{rows.filter((s) => s.Status === 'In Progress').length}</b></div>
          <div className="kpi"><small>Hoàn thành</small><b>{rows.filter((s) => s.Status === 'Completed').length}</b></div>
        </div>
        {focus ? <TodayCard session={focus} onStart={() => { setFailure(''); setStarting(focus) }} />
          : <div className="card empty" style={{ padding: 22 }}>Hôm nay bạn không còn buổi tập nào cần thực hiện.</div>}
        <div className="toolbar" style={{ marginTop: 26, paddingTop: 22, borderTop: '1px solid #ecede6' }}>
          <h2 style={{ margin: '0 18px 0 0', fontSize: 19 }}>Lịch buổi tập</h2>
          <div className="tabs">{TABS.map(([k, label]) => <span key={k} role="tab" tabIndex={0} aria-selected={tab === k} className={`tab ${tab === k ? 'on' : ''}`}
            onClick={() => { setTab(k); pager.setPage(1) }}>{label} <em>{count(k)}</em></span>)}</div>
        </div>
        {!shown.length ? <p className="empty">Không có buổi tập nào.</p> : <>
          <table><thead><tr><th>Ngày tập</th><th>Ngựa</th><th>Giai đoạn</th><th>Bài tập</th><th>Người giám sát</th><th>Điểm</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>{pager.slice.map((s) => <tr key={s.TrainingSessionID}>
              <td style={{ whiteSpace: 'nowrap' }}><b>{sessionDate(s)}</b><small>{timeRange(s)}</small></td>
              <td><b>{s.HorseName}</b><small>{planLabel(s)}</small></td>
              <td>{s.StageName}</td><td>{exercise(s)}</td><td>{s.SupervisingTrainerName}</td>
              <td><b>{s.Result?.PerformanceScore != null ? num(s.Result.PerformanceScore, 0) : '—'}</b></td>
              <td><SessionBadge status={s.Status} stopped={s.IsStopped} /></td>
              <td>{s.Status === 'In Progress' ? <Link className="btn pri sm" to={`${BASE}/${s.TrainingSessionID}/result`}>Ghi kết quả</Link>
                : <Link className="btn sec sm" to={`${BASE}/${s.TrainingSessionID}`}>{s.Status === 'Completed' ? 'Xem kết quả' : 'Chi tiết'}</Link>}</td>
            </tr>)}</tbody></table>
          <Pager pager={pager} /></>}
      </>}
    </section>
    {starting && <Dialog title="Bắt đầu buổi tập?" onClose={() => setStarting(null)} actions={<>
      <button type="button" className="btn sec" onClick={() => setStarting(null)}>Hủy</button>
      <button type="button" className="btn pri" disabled={busy} onClick={start}><Icon name="check" size={16} /> Bắt đầu</button></>}>
      <p>Buổi tập {exercise(starting)} của {starting.HorseName} sẽ chuyển sang trạng thái đang tập. Huấn luyện viên {starting.SupervisingTrainerName} nhận thông báo để theo dõi.</p>
      {failure && <Notice kind="bad">{failure}</Notice>}
    </Dialog>}
  </main>
}

function TodayCard({ session: s, onStart }) {
  return <div className="card">
    <div className="ctx" style={{ border: 0, padding: 0 }}><div className="who"><HorseThumb horseId={s.HorseID} size={64} />
      <div><p className="eyebrow" style={{ margin: '0 0 4px' }}>BUỔI TẬP HÔM NAY · {timeRange(s)}</p>
        <h2>{s.HorseName} · {exercise(s)}</h2>
        <p>{[planLabel(s), s.StageName, s.Location, s.Surface].filter(Boolean).join(' · ')}</p></div></div><SessionBadge status={s.Status} stopped={s.IsStopped} /></div>
    <div style={{ marginTop: 16 }}><Dl cols={4} items={[['Thời lượng dự kiến', s.DurationPlannedMinutes ? `${s.DurationPlannedMinutes} phút` : '—'],
      ['Tốc độ mục tiêu', s.TargetSpeedKmh ? `${num(s.TargetSpeedKmh)} km/h` : '—'], ['Mức tải tập luyện', num(s.TrainingLoad, 0)], ['Người giám sát', s.SupervisingTrainerName]]} /></div>
    {s.Instructions && <div className="quote" style={{ marginTop: 14 }}><small>Hướng dẫn buổi tập</small><p>{s.Instructions}</p></div>}
    <div className="actions">{s.Status === 'In Progress'
      ? <Link className="btn pri" to={`${BASE}/${s.TrainingSessionID}/result`}><Icon name="edit" size={16} /> Ghi kết quả</Link>
      : <button type="button" className="btn pri" onClick={onStart}>▷ Bắt đầu buổi tập</button>}</div>
  </div>
}

function AssignedPanel({ session: s }) {
  return <div className="card"><SectionTitle icon="file">Nội dung được giao</SectionTitle>
    <Dl cols={2} items={[['Bài tập', s.TrainingType], ['Quãng đường', s.DistancePlannedKm != null ? `${num(s.DistancePlannedKm)} km` : '—'],
      ['Thời lượng dự kiến', s.DurationPlannedMinutes ? `${s.DurationPlannedMinutes} phút` : '—'], ['Tốc độ mục tiêu', s.TargetSpeedKmh ? `${num(s.TargetSpeedKmh)} km/h` : '—'],
      ['Mức tải tập luyện', num(s.TrainingLoad, 0)], ['Mặt sân', s.Surface], ['Địa điểm', s.Location, 1], ['Người giám sát', s.SupervisingTrainerName, 1]]} />
    {s.Instructions && <div className="quote" style={{ marginTop: 14 }}><small>Hướng dẫn buổi tập</small><p>{s.Instructions}</p></div>}
  </div>
}

// ---------------- KS03, KS03b, KS04 ----------------
const NUMBER_FIELDS = [
  ['ActualDurationMinutes', 'Thời lượng thực tế', 'phút', true, 1, 600, true],
  ['ActualDistanceKm', 'Quãng đường thực tế', 'km', true, 0, 100],
  ['PerformanceScore', 'Điểm đánh giá', '/ 100', true, 0, 100],
  ['AvgSpeedKmh', 'Tốc độ trung bình', 'km/h', true, 0, 90],
  ['MaxSpeedKmh', 'Tốc độ tối đa', 'km/h', true, 0, 90],
  ['RecoveryMinutes', 'Hồi phục', 'phút', true, 0, 240, true],
  ['AvgHeartRate', 'Nhịp tim trung bình', 'lần/phút', false, 20, 300, true],
  ['MaxHeartRate', 'Nhịp tim tối đa', 'lần/phút', false, 20, 300, true],
]
const toNumber = (v) => Number(String(v).replace(',', '.'))
function checkNumber(value, [, , , required, low, high, integer]) {
  const text = String(value ?? '').trim()
  if (!text) return required ? (String(value ?? '').length ? MSG.whitespace : MSG.required) : ''
  if (!/^\d+([.,]\d+)?$/.test(text)) return 'Giá trị phải là số.'
  const n = toNumber(text)
  if (integer && !Number.isInteger(n)) return 'Giá trị phải là số nguyên.'
  if (n < low || n > high) return `Giá trị phải từ ${low} đến ${high}.`
  return ''
}
const TOLERANCE = 5

export function RiderResultPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const data = useLoad(() => api.session(sessionId), [sessionId])
  const [form, setForm] = useState({ RiderObservation: '', VideoUrl: '', EarlyEndReason: '', EarlyEndNote: '', EndTime: '' })
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }
  if (data.loading) return <main className="page-content f1"><Loading /></main>
  if (data.error) return <main className="page-content f1"><Notice kind="bad">{errorText(data.error)}</Notice></main>
  const s = data.data
  if (s.Status !== 'In Progress') return <main className="page-content f1"><Crumb items={[['Buổi tập của tôi', BASE]]} />
    <Notice kind="bad" style={{ marginTop: 30 }}>Chỉ ghi kết quả khi buổi tập đang diễn ra. <Link className="link" to={`${BASE}/${s.TrainingSessionID}`}>Xem buổi tập</Link></Notice></main>

  const planned = s.DurationPlannedMinutes
  const actual = toNumber(form.ActualDurationMinutes)
  const shortBy = planned && form.ActualDurationMinutes && !Number.isNaN(actual) ? planned - actual : 0
  const early = shortBy > TOLERANCE

  async function save(e) {
    e.preventDefault()
    const rules = Object.fromEntries(NUMBER_FIELDS.map((f) => [f[0], () => checkNumber(form[f[0]], f)]))
    rules.RiderObservation = () => checkText(form.RiderObservation, 2000)
    if (early) {
      rules.EarlyEndReason = () => checkSelect(form.EarlyEndReason)
      rules.EarlyEndNote = () => checkText(form.EarlyEndNote, 1000)
      rules.EndTime = () => (!form.EndTime ? MSG.required : form.EndTime < hhmm(s.StartTime) ? 'Giờ kết thúc không được trước giờ bắt đầu.' : '')
    }
    const found = runChecks(rules)
    if (!found.MaxSpeedKmh && form.MaxSpeedKmh && form.AvgSpeedKmh && toNumber(form.MaxSpeedKmh) < toNumber(form.AvgSpeedKmh)) found.MaxSpeedKmh = 'Tốc độ tối đa không được nhỏ hơn tốc độ trung bình.'
    if (!found.MaxHeartRate && form.MaxHeartRate && form.AvgHeartRate && toNumber(form.MaxHeartRate) < toNumber(form.AvgHeartRate)) found.MaxHeartRate = 'Nhịp tim tối đa không được nhỏ hơn nhịp tim trung bình.'
    setErrors(found)
    if (Object.keys(found).length) return
    const body = { RiderObservation: form.RiderObservation.trim(), VideoUrl: form.VideoUrl.trim() || null }
    for (const [key] of NUMBER_FIELDS) body[key] = String(form[key] ?? '').trim() ? toNumber(form[key]) : null
    if (early) Object.assign(body, { EarlyEndReason: form.EarlyEndReason, EarlyEndNote: form.EarlyEndNote.trim(), EndTime: form.EndTime })
    setBusy(true); setFailure('')
    try { await api.result(s.TrainingSessionID, body); navigate(`${BASE}/${s.TrainingSessionID}`) } catch (err) {
      const fields = serverFieldErrors(err)
      if (Object.keys(fields).length) setErrors(fields); else setFailure(errorText(err))
    } finally { setBusy(false) }
  }

  return <main className="page-content f1">
    <Crumb items={[['Buổi tập của tôi', BASE], [`${s.HorseName} · ${sessionDate(s)}`]]} />
    <Heading title="Ghi kết quả buổi tập" />
    <form className="panel" onSubmit={save} noValidate>
      <SessionContext session={s} extra={`Bắt đầu lúc ${hhmm(s.StartTime)}${early ? ` · Dự kiến kết thúc ${addMinutes(s.StartTime, planned)}` : ''}`} />
      {early && <Notice kind="" style={{ marginTop: 16 }} title={`Buổi tập kết thúc sớm hơn dự kiến ${shortBy} phút`}>
        <span style={{ display: 'block' }}>Vui lòng ghi rõ lý do kết thúc sớm trước khi lưu kết quả.</span></Notice>}
      {early && form.EarlyEndReason === 'Injury' && <Notice kind="bad" style={{ marginTop: 12 }}>Khi lưu, buổi tập sẽ dừng và báo cáo khẩn được gửi đến bác sĩ thú y. Kết quả đo được vẫn được giữ lại.</Notice>}
      {failure && <Notice kind="bad" style={{ marginTop: 16 }}>{failure}</Notice>}
      <div className="two" style={{ marginTop: 18 }}>
        <div className="card"><SectionTitle icon="cal">Kết quả thực tế</SectionTitle>
          <div className="fgrid three">{NUMBER_FIELDS.map(([key, label, unit, required]) =>
            <TextInput key={key} label={label} required={required} unit={unit} value={form[key]} onChange={set(key)} error={errors[key]} inputMode="decimal" maxLength={8} />)}</div>
          {early && <div className="fgrid" style={{ marginTop: 14 }}>
            <SelectInput label="Lý do kết thúc sớm" required value={form.EarlyEndReason} onChange={set('EarlyEndReason')} error={errors.EarlyEndReason} placeholder="Chọn lý do" options={EARLY_END_REASONS} />
            <TimeField label="Kết thúc lúc" required value={form.EndTime} onChange={set('EndTime')} error={errors.EndTime} />
          </div>}
          <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
            {early && <TextArea label="Mô tả lý do kết thúc sớm" required value={form.EarlyEndNote} onChange={set('EarlyEndNote')} error={errors.EarlyEndNote} rows={2} maxLength={1000} />}
            <TextArea label="Nhận xét buổi tập" required value={form.RiderObservation} onChange={set('RiderObservation')} error={errors.RiderObservation} rows={3} maxLength={2000} />
            <TextInput label="Đường dẫn video buổi tập" value={form.VideoUrl} onChange={set('VideoUrl')} error={errors.VideoUrl} maxLength={500} inputMode="url" />
          </div>
        </div>
        <AssignedPanel session={s} />
      </div>
      <div className="actions"><Link className="btn sec" to={BASE}>Hủy</Link>
        <button type="submit" className="btn pri" disabled={busy}><Icon name="check" size={16} /> {busy ? 'Đang lưu...' : 'Lưu kết quả'}</button></div>
    </form>
  </main>
}

// ---------------- KS05 ----------------
export function RiderSessionDetailPage() {
  const { sessionId } = useParams()
  const data = useLoad(() => api.session(sessionId), [sessionId])
  if (data.loading) return <main className="page-content f1"><Loading /></main>
  if (data.error) return <main className="page-content f1"><Notice kind="bad">{errorText(data.error)}</Notice></main>
  const s = data.data
  const r = s.Result
  const reasonText = Object.fromEntries(EARLY_END_REASONS)
  return <main className="page-content f1">
    <Crumb items={[['Buổi tập của tôi', BASE], [`${s.HorseName} · ${sessionDate(s)}`]]} />
    <Heading title={s.Status === 'Completed' ? 'Kết quả buổi tập' : 'Chi tiết buổi tập'} />
    <section className="panel">
      <SessionContext session={s} extra={`${sessionDate(s)} ${timeRange(s)}`} />
      {s.Status === 'Completed' && r ? <>
        <h2 className="sec-h">Kết quả đã ghi</h2>
        <div className="kpis">
          <div className="kpi"><small>Thời lượng</small><b>{num(r.ActualDurationMinutes, 0)} phút</b></div>
          <div className="kpi"><small>Quãng đường</small><b>{num(r.ActualDistanceKm)} km</b></div>
          <div className="kpi"><small>Tốc độ trung bình / tối đa</small><b>{num(r.AvgSpeedKmh)} / {num(r.MaxSpeedKmh)} km/h</b></div>
          <div className="kpi"><small>Điểm đánh giá</small><b>{num(r.PerformanceScore, 0)}</b></div>
          <div className="kpi"><small>Nhịp tim trung bình</small><b>{r.AvgHeartRate != null ? `${r.AvgHeartRate} lần/phút` : '—'}</b></div>
          <div className="kpi"><small>Nhịp tim tối đa</small><b>{r.MaxHeartRate != null ? `${r.MaxHeartRate} lần/phút` : '—'}</b></div>
          <div className="kpi"><small>Hồi phục</small><b>{num(r.RecoveryMinutes, 0)} phút</b></div>
          <div className="kpi"><small>Mức tải tập luyện</small><b>{num(s.TrainingLoad, 0)}</b></div>
        </div>
        {r.EarlyEndReason && <div className="quote warm" style={{ marginBottom: 12 }}><small>Kết thúc sớm · {reasonText[r.EarlyEndReason]}</small><p>{r.EarlyEndNote}</p></div>}
        {r.RiderObservation && <div className="quote"><small>Nhận xét của tôi</small><p>{r.RiderObservation}</p></div>}
        <h2 className="sec-h">Đánh giá của huấn luyện viên</h2>
        {s.Review ? <div className="quote info"><small>{s.Review.TrainerName} · {sessionDateTime(s.Review.ReviewDate)} · {EVALUATION[s.Review.Evaluation] || s.Review.Evaluation}</small>
          <p>{s.Review.TrainerComment || 'Không có nhận xét.'}</p></div>
          : <p className="hint">Chờ huấn luyện viên đánh giá.</p>}
      </> : <div style={{ marginTop: 18 }}><AssignedPanel session={s} /></div>}
    </section>
  </main>
}

function sessionDateTime(value) {
  if (!value) return ''
  const [d, t] = String(value).split('T')
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}${t ? ` ${t.slice(0, 5)}` : ''}`
}
