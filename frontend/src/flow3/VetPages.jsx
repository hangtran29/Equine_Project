// Bác sĩ thú y: Tổng quan (BS01), Ngựa và chuồng trại (BS02), Hồ sơ y tế và các thẻ (BS03, BS03b–BS03f),
// Khóa tập khẩn cấp (BS04), Báo cáo sức khỏe (BS05–BS07), Lịch y tế (BS08, BS09), Thông báo (BS10),
// Cảnh báo khẩn trên màn hình (BS10b), Phiếu khám định kỳ / chấn thương (BS13, BS14).
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Badge, Crumb, DateField, Dialog, Dl, Heading, Icon, Loading, Notice, SectionTitle, SelectInput, TextArea, TextInput, Timeline, errorText, fmtDate, fmtDateTime, useAction, useLoad } from '../flow1/ui.jsx'
import { HorseThumb, SEX } from '../flow1/horse.jsx'
import { getNotifications, markRead } from '../flow1/api.js'
import { notificationTarget } from '../flow1/NotificationBell.jsx'
import { MSG, checkSelect, checkText, runChecks, serverFieldErrors } from '../utils/validation.js'
import { Pager, Search, Tabs, ageOf, matches, usePager } from '../flow2/common.jsx'
import {
  ELIGIBILITY, EXAM_TYPE, HEALTH, INJURY_LOCATIONS, LOCK_LEVEL, ROUTE, SCHEDULE_TYPE, VACCINES, dateOnly, healthBadge, healthText, isoToday, itemBadge,
  lockBadge, lockRange, med, medicalItems, plusDays, reportBadge, roleText, severityBadge, splitInjury, vetName,
} from './common.jsx'
import { regionAnchor } from '../components/injury/horseDiagram.js'
import { getMedicalRecords, normalizeHorse } from '../api/horseApi.ts'
import { resolveEffectiveTraining } from '../components/horse/effectiveTraining.js'
import EffectiveTrainingBadge from '../components/horse/EffectiveTrainingBadge.jsx'

const Page = ({ children }) => <main className="page-content f1">{children}</main>
const Fail = ({ error }) => <Page><Notice kind="bad" style={{ marginTop: 30 }}>{errorText(error)}</Notice></Page>
const activeLockOf = (locks, horseId) => locks.find((l) => l.HorseID === horseId && l.LockStatus === 'Active') || null
const horseMeta = (h) => [h.HorseCode, h.Breed, SEX[h.Gender], ageOf(h.DateOfBirth), h.CurrentStall?.StallNumber && `Chuồng ${h.CurrentStall.StallNumber}`].filter(Boolean).join(' · ')

async function herdTrainingState(horses, locks) {
  const rows = await Promise.all(horses.map(async horse => {
    let records = [], historyError = false
    try { records = await getMedicalRecords(String(horse.HorseID)) } catch { historyError = true }
    return [horse.HorseID, resolveEffectiveTraining({ horse: normalizeHorse(horse), records, locks, historyError })]
  }))
  return Object.fromEntries(rows)
}

// ====================================================================== BS01
export function VetOverviewPage() {
  const navigate = useNavigate()
  const data = useLoad(async () => {
    const [reports, pending, locks, schedules, vaccinations, horses] = await Promise.all([med.reports({ open: 1 }), med.pendingExams().catch(() => []),
      med.locks({ LockStatus: 'Active' }), med.schedules(), med.vaccinations(), med.horses()])
    return { reports, pending, locks, items: medicalItems(schedules, vaccinations), horses, training: await herdTrainingState(horses, locks) }
  }, [])
  const act = useAction()
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const { reports, pending, locks, items, horses, training } = data.data
  const today = isoToday(), week = plusDays(7)
  const upcoming = items.filter((it) => it.status === 'Scheduled' && it.date >= today && it.date <= week)
  const overdue = items.filter((it) => it.status === 'Scheduled' && (it.overdue || it.date < today))
  const urgentOpen = reports.filter((r) => r.Severity === 'Urgent')
  const counts = Object.fromEntries(Object.keys(HEALTH).map((k) => [k, horses.filter((h) => h.CurrentHealthStatus === k).length]))
  const max = Math.max(1, horses.length)
  async function take(r) { if (r.Status === 'Reported') { const ok = await act.run(async () => { await med.take(r.HealthReportID); return true }); if (!ok) return } navigate(`/vet/reports/${r.HealthReportID}`) }
  return <Page>
    <Crumb items={[['Tổng quan']]} />
    <Heading title="Tổng quan" />
    <section className="panel">
      <div className="kpis">
        <div className="kpi"><small>Báo cáo khẩn chưa xử lý</small><b className={urgentOpen.length ? 'bad' : ''}>{urgentOpen.length}</b></div>
        <div className="kpi"><small>Ngựa chờ khám lâm sàng</small><b>{pending.length}</b></div>
        <div className="kpi"><small>Ngựa đang khóa tập</small><b>{locks.length}</b></div>
        <div className="kpi"><small>Lịch y tế quá hạn</small><b className={overdue.length ? 'bad' : ''}>{overdue.length}</b></div>
      </div>
      {act.error && <Notice kind="bad" style={{ marginBottom: 14 }}>{act.error}</Notice>}
      <div className="grid">
        <div className="card"><div className="panel-head"><SectionTitle icon="bell">Việc cần xử lý</SectionTitle><Link className="link" to="/vet/reports">Xem tất cả</Link></div>
          {!reports.length && !pending.length ? <p className="empty">Không có việc cần xử lý.</p> : <>
            {reports.map((r) => <div className="todo" key={r.HealthReportID}><span className={`sicon ${r.Severity === 'Urgent' ? 'bad' : ''}`}><Icon name="heart" /></span>
              <div><b>{r.HorseName} · {r.Description.split(/[.,]/)[0]}</b><small>{r.Severity === 'Urgent' ? 'Báo cáo khẩn' : 'Báo cáo thông thường'} · {r.ReportedByName} · {fmtDateTime(r.ReportedAt)}</small></div>
              <button type="button" className={`btn sm ${r.Severity === 'Urgent' && r.Status === 'Reported' ? 'pri' : 'sec'}`} disabled={act.busy} onClick={() => take(r)}>{r.Status === 'Reported' ? 'Nhận xử lý' : 'Tiếp tục xử lý'}</button></div>)}
            {pending.map((p) => <div className="todo" key={p.HorseID}><span className="sicon"><Icon name="steth" /></span>
              <div><b>{p.HorseName} · Khám lâm sàng nhập đàn</b><small>Xác minh hồ sơ lúc {fmtDateTime(p.VerifiedAt || p.SubmittedAt)}</small></div>
              <Link className="btn sec sm" to={`/vet/horses/${p.HorseID}/clinical`}>Nhận khám</Link></div>)}
          </>}
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="card"><SectionTitle icon="cal">Lịch y tế 7 ngày tới</SectionTitle>
            {!upcoming.length ? <p className="hint" style={{ margin: 0 }}>Không có lịch y tế trong 7 ngày tới.</p> : upcoming.slice(0, 5).map((it) =>
              <div className="contact" key={it.key} style={{ marginTop: 8 }}><div><b>{it.HorseName} · {it.title}</b><small>{it.sub || vetName(it.VetName)}</small></div><b>{fmtDate(it.date)}</b></div>)}
          </div>
          <div className="card"><SectionTitle icon="horse">Sức khỏe đàn ngựa</SectionTitle>
            {[['Healthy', 'Khỏe mạnh', '#4c5b36'], ['Monitor', 'Cần theo dõi', '#d9a43a'], ['Injured', 'Chấn thương', '#a2352b'], ['Isolated', 'Cách ly', '#8a2f1d']].map(([k, label, color]) =>
              <div key={k} className="hbar"><span>{label}</span><div className="bar"><i style={{ width: `${(counts[k] / max) * 100}%`, background: color }} /></div><b>{counts[k]}</b></div>)}
            <div style={{ marginTop: 12 }}><Dl items={[['Được phép tập', String(Object.values(training).filter(s => s.status === 'allowed').length)], ['Giới hạn tập', String(Object.values(training).filter(s => s.status === 'restricted').length)],
              ['Khóa toàn bộ', String(Object.values(training).filter(s => s.status === 'full').length)], ['Chưa xác định điều kiện tập', String(Object.values(training).filter(s => s.status === 'unknown').length)]]} /></div>
          </div>
        </div>
      </div>
    </section>
  </Page>
}

// ====================================================================== BS02
export function VetHerdPage() {
  const navigate = useNavigate()
  const data = useLoad(async () => { const [horses, locks] = await Promise.all([med.horses(), med.locks({ LockStatus: 'Active' })]); return { horses, locks, training: await herdTrainingState(horses, locks) } }, [])
  const [text, setText] = useState('')
  const [health, setHealth] = useState('')
  const [elig, setElig] = useState('')
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const rows = data.data.horses.map((h) => ({ ...h, lock: activeLockOf(data.data.locks, h.HorseID) }))
    .filter((h) => matches(text, h.HorseName, h.HorseCode, h.MicrochipNumber) && (!health || h.CurrentHealthStatus === health)
      && (!elig || data.data.training[h.HorseID]?.status === ({ ok: 'allowed', Restricted: 'restricted', Full: 'full', Unknown: 'unknown' })[elig])).sort((a, b) => String(a.HorseCode || '').localeCompare(String(b.HorseCode || '')))
  return <Page>
    <Crumb items={[['Ngựa và chuồng trại']]} />
    <Heading title="Ngựa và chuồng trại" />
    <section className="panel">
      <div className="viewtabs"><span className="on"><Icon name="req" size={15} /> Danh sách ngựa</span><span onClick={() => navigate('/vet/stalls')}><Icon name="stall" size={15} /> Sơ đồ chuồng trại</span></div>
      <div className="toolbar">
        <Search value={text} onChange={setText} placeholder="Tìm theo tên, mã ngựa, mã định danh" />
        <select className="input" style={{ width: 190 }} value={health} onChange={(e) => setHealth(e.target.value)} aria-label="Sức khỏe">
          <option value="">Tất cả sức khỏe</option>{Object.entries(HEALTH).map(([k, [, t]]) => <option key={k} value={k}>{t}</option>)}</select>
        <select className="input" style={{ width: 210 }} value={elig} onChange={(e) => setElig(e.target.value)} aria-label="Điều kiện tập">
          <option value="">Tất cả điều kiện tập</option><option value="ok">Được phép tập</option><option value="Restricted">Giới hạn mức tập</option><option value="Full">Khóa toàn bộ</option><option value="Unknown">Chưa xác định</option></select>
      </div>
      {!rows.length ? <p className="empty">Không có ngựa phù hợp.</p> : <table>
        <thead><tr><th>Ngựa</th><th>Chuồng</th><th>Tình trạng sức khỏe</th><th>Điều kiện tập luyện</th><th>Cập nhật</th><th>Thao tác</th></tr></thead>
        <tbody>{rows.map((h) => <tr key={h.HorseID} className={h.lock?.LockLevel === 'Full' ? 'hl' : ''}>
          <td><div className="hname"><HorseThumb horseId={h.HorseID} /><div><b>{h.HorseName}</b><small>{h.HorseCode}</small></div></div></td>
          <td>{h.CurrentStall?.StallNumber || '—'}</td><td>{healthBadge(h.CurrentHealthStatus)}</td><td><EffectiveTrainingBadge state={data.data.training[h.HorseID]} /></td><td>{fmtDate(h.UpdatedAt)}</td>
          <td><Link className="btn sec sm" to={`/vet/horses/${h.HorseID}`}><Icon name="file" size={14} /> Hồ sơ y tế</Link></td></tr>)}</tbody></table>}
    </section>
  </Page>
}

// ====================================================================== BS04
export function LockDialog({ horse, lock, onClose, onDone }) {
  const editing = Boolean(lock)
  const [form, setForm] = useState({ LockLevel: lock?.LockLevel || 'Full', LockEndDate: dateOnly(lock?.LockEndDate) || plusDays(7), MaxIntensity: lock?.MaxIntensity ?? '', Reason: lock?.Reason || '' })
  const [errors, setErrors] = useState({})
  const act = useAction()
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }
  async function go() {
    const found = runChecks({ Reason: () => checkText(form.Reason, 100), LockEndDate: () => (form.LockEndDate && form.LockEndDate < isoToday() ? 'Ngày dự kiến không được trước ngày hiện tại.' : ''),
      MaxIntensity: () => (form.LockLevel !== 'Restricted' ? '' : !String(form.MaxIntensity).trim() ? MSG.required : !/^\d+([.,]\d+)?$/.test(String(form.MaxIntensity).trim()) ? 'Giá trị phải là số.'
        : Number(String(form.MaxIntensity).replace(',', '.')) > 100 ? 'Giá trị phải từ 0 đến 100.' : '') })
    setErrors(found)
    if (Object.keys(found).length) return
    const body = { LockLevel: form.LockLevel, Reason: form.Reason.trim(), LockEndDate: form.LockEndDate ? `${form.LockEndDate}T18:00:00` : null,
      MaxIntensity: form.LockLevel === 'Restricted' ? Number(String(form.MaxIntensity).replace(',', '.')) : null }
    const ok = await act.run(async () => {
      try { if (editing) await med.updateLock(lock.TrainingLockID, body); else await med.lock(horse.HorseID, { ...body, LockStartDate: new Date().toISOString().slice(0, 19) }) }
      catch (err) { const f = serverFieldErrors(err); if (Object.keys(f).length) { setErrors(f); return false } throw err }
      return true
    })
    if (ok) onDone()
  }
  return <Dialog title={`${editing ? 'Điều chỉnh khóa tập' : 'Khóa tập khẩn cấp'} · ${horse.HorseName}`} onClose={onClose} actions={<>
    <button type="button" className="btn sec" onClick={onClose}>Hủy</button>
    <button type="button" className="btn danger fill" disabled={act.busy} onClick={go}><Icon name="shield" size={16} /> {editing ? 'Lưu khóa tập' : 'Khóa tập'}</button></>}>
    {!editing && <p>Hệ thống sẽ tự động hủy mọi lịch trình tập luyện chưa thực hiện. Thông báo đình chỉ sẽ được gửi ngay đến huấn luyện viên phụ trách.</p>}
    <div className="fgrid">
      <SelectInput label="Mức khóa" required value={form.LockLevel} onChange={set('LockLevel')} options={Object.entries(LOCK_LEVEL)} />
      <DateField label="Dự kiến đến ngày" value={form.LockEndDate} onChange={set('LockEndDate')} error={errors.LockEndDate} min={isoToday()} />
    </div>
    {form.LockLevel === 'Restricted' && <div style={{ marginTop: 12 }}><TextInput label="Mức tải tối đa" required value={form.MaxIntensity} onChange={set('MaxIntensity')} error={errors.MaxIntensity} inputMode="decimal" maxLength={5} /></div>}
    <div style={{ marginTop: 12 }}><TextArea label="Lý do" required value={form.Reason} onChange={set('Reason')} error={errors.Reason} rows={2} maxLength={100} /></div>
    {act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}
  </Dialog>
}

// ====================================================================== BS03 (các thẻ)
const PROFILE_TABS = [['overview', 'Tổng quan sức khỏe'], ['records', 'Bệnh án'], ['treatments', 'Điều trị và đơn thuốc'], ['injury', 'Chấn thương và phục hồi'],
  ['eligibility', 'Điều kiện huấn luyện'], ['schedule', 'Lịch y tế']]

export function VetProfilePage() {
  const { horseId } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'overview'
  const navigate = useNavigate()
  const data = useLoad(async () => {
    const [horse, records, locks, treatments, schedules, vaccinations] = await Promise.all([med.horse(horseId), med.records(horseId), med.locks({ HorseID: horseId }),
      med.treatments(horseId), med.schedules({ HorseID: horseId }), med.vaccinations({ HorseID: horseId })])
    return { horse, records, locks, treatments, items: medicalItems(schedules, vaccinations) }
  }, [horseId])
  const [dialog, setDialog] = useState(null)
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const d = data.data
  const lock = d.locks.find((l) => l.LockStatus === 'Active') || null
  const go = (t, extra = {}) => setParams({ tab: t, ...extra })
  return <Page>
    <Crumb items={[['Ngựa và chuồng trại', '/vet/herd'], [d.horse.HorseName]]} />
    <Heading title="Hồ sơ y tế" />
    <section className="panel">
      <div className="ctx"><div className="who"><HorseThumb horseId={d.horse.HorseID} size={64} /><div><h2>{d.horse.HorseName}</h2><p>{horseMeta(d.horse)}</p></div></div>
        <div className="btn-row">{healthBadge(d.horse.CurrentHealthStatus)}{lock && lockBadge(lock)}</div></div>
      <div className="btn-row" style={{ marginTop: 16 }}>
        <Link className="btn pri" to={`/vet/horses/${horseId}/exam/new`}><Icon name="plus" size={16} /> Lập phiếu khám mới</Link>
        <button type="button" className="btn danger" onClick={() => setDialog('lock')}><Icon name="shield" size={16} /> {lock ? 'Điều chỉnh khóa tập' : 'Khóa tập khẩn cấp'}</button>
      </div>
      <div className="utabs" role="tablist">{PROFILE_TABS.map(([k, label]) => <span key={k} role="tab" tabIndex={0} aria-selected={tab === k} className={tab === k ? 'on' : ''}
        onClick={() => go(k)} onKeyDown={(e) => { if (e.key === 'Enter') go(k) }}>{label}</span>)}</div>
      {tab === 'overview' && <OverviewTab d={d} lock={lock} go={go} onRelease={() => setDialog('release')} />}
      {tab === 'records' && <RecordsTab d={d} selected={params.get('record')} select={(id) => go('records', { record: id })} reload={data.reload} navigate={navigate} />}
      {tab === 'treatments' && <TreatmentsTab d={d} reload={data.reload} />}
      {tab === 'injury' && <InjuryTab d={d} lock={lock} />}
      {tab === 'eligibility' && <EligibilityTab d={d} lock={lock} onEdit={() => setDialog('lock')} onRelease={() => setDialog('release')} />}
      {tab === 'schedule' && <ScheduleTable items={d.items} horseFixed={d.horse} reload={data.reload} />}
    </section>
    {dialog === 'lock' && <LockDialog horse={d.horse} lock={lock} onClose={() => setDialog(null)} onDone={() => { setDialog(null); data.reload() }} />}
    {dialog === 'release' && lock && <ReleaseDialog lock={lock} horse={d.horse} onClose={() => setDialog(null)} onDone={() => { setDialog(null); data.reload() }} />}
  </Page>
}

function ReleaseDialog({ lock, horse, onClose, onDone }) {
  const [note, setNote] = useState('')
  const act = useAction()
  return <Dialog title={`Mở khóa tập · ${horse.HorseName}?`} onClose={onClose} actions={<>
    <button type="button" className="btn sec" onClick={onClose}>Hủy</button>
    <button type="button" className="btn pri" disabled={act.busy} onClick={async () => { const ok = await act.run(async () => { await med.releaseLock(lock.TrainingLockID, note.trim() || null); return true }); if (ok) onDone() }}>Mở khóa tập</button></>}>
    <p>Ngựa được phép tập luyện trở lại. Việc mở khóa cần có phiếu tái khám đã ký với kết luận đủ điều kiện tập luyện.</p>
    <TextArea label="Ghi chú" value={note} onChange={setNote} rows={2} maxLength={1000} />
    {act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}
  </Dialog>
}

function OverviewTab({ d, lock, go, onRelease }) {
  const signed = d.records.filter((r) => r.RecordStatus === 'Signed')
  const latest = signed[0]
  const initial = d.records.find((r) => r.ExamType === 'Initial Exam' && r.RecordStatus === 'Signed')
  const upcoming = d.items.filter((it) => it.status === 'Scheduled' && it.date >= isoToday()).slice(0, 3)
  return <div className="grid">
    <div className="card"><SectionTitle icon="heart">Sức khỏe hiện tại</SectionTitle>
      <Dl cols={2} items={[['Tình trạng', healthText(d.horse.CurrentHealthStatus)], ['Cập nhật', fmtDateTime(latest?.SignedAt || d.horse.UpdatedAt)],
        ['Kết luận gần nhất', latest?.Conclusion || 'Chưa có phiếu khám', 1], ['Bác sĩ', latest ? vetName(latest.VetName) : '—']]} />
      {latest && <div style={{ marginTop: 14 }}><button type="button" className="btn sec sm" onClick={() => go('records', { record: latest.MedicalRecordID })}>Xem phiếu khám</button></div>}</div>
    <div className="card"><SectionTitle icon="shield">Khóa tập đang áp dụng</SectionTitle>
      {lock ? <><div className="quote warm"><small>{LOCK_LEVEL[lock.LockLevel]} · từ {fmtDate(lock.LockStartDate)}{lock.LockEndDate ? ` · dự kiến đến ${fmtDate(lock.LockEndDate)}` : ''}</small>
        <p>{[lock.Reason, lock.Details].filter(Boolean).join('. ')}</p></div>
        <div style={{ marginTop: 14 }}><button type="button" className="btn sec sm" onClick={onRelease}>Mở khóa tập</button></div></>
        : <p className="hint" style={{ margin: 0 }}>Ngựa đang được phép tập luyện bình thường.</p>}</div>
    <div className="card"><SectionTitle icon="steth">Khám lâm sàng nhập đàn</SectionTitle>
      {initial ? <><Dl items={[['Kết quả', initial.TrainingEligibility === 'Not Eligible' ? 'Không đạt yêu cầu' : 'Đạt yêu cầu'], ['Ngày ký duyệt', fmtDate(initial.SignedAt)], ['Bác sĩ', vetName(initial.VetName)]]} />
        <div style={{ marginTop: 14 }}><button type="button" className="btn sec sm" onClick={() => go('records', { record: initial.MedicalRecordID })}>Xem kết quả</button></div></>
        : <p className="hint" style={{ margin: 0 }}>Chưa có phiếu khám lâm sàng nhập đàn.</p>}</div>
    <div className="card"><SectionTitle icon="cal">Lịch y tế sắp tới</SectionTitle>
      {!upcoming.length ? <p className="hint" style={{ margin: 0 }}>Không có lịch y tế sắp tới.</p> : upcoming.map((it) =>
        <div className="contact" key={it.key} style={{ marginTop: 8 }}><div><b>{it.title}{it.kind === 'vaccination' ? ` · ${it.raw.VaccineName}` : ''}</b><small>{vetName(it.VetName)}</small></div><b>{fmtDate(it.date)}</b></div>)}</div>
  </div>
}

function RecordsTab({ d, selected, select, reload, navigate }) {
  const rec = d.records.find((r) => String(r.MedicalRecordID) === String(selected)) || d.records.find((r) => r.RecordStatus === 'Signed')
  return <>
    {!d.records.length ? <p className="empty">Chưa có phiếu khám.</p> : <table>
      <thead><tr><th>Ngày khám</th><th>Loại phiếu</th><th>Chẩn đoán</th><th>Kết luận sức khỏe</th><th>Điều kiện tập</th><th>Bác sĩ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>{d.records.map((r) => <tr key={r.MedicalRecordID} className={rec?.MedicalRecordID === r.MedicalRecordID ? 'hl' : ''}>
        <td style={{ whiteSpace: 'nowrap' }}><b>{fmtDate(r.ExamDate)}</b><small>{String(r.ExamDate || '').slice(11, 16)}</small></td><td>{EXAM_TYPE[r.ExamType] || r.ExamType}</td>
        <td style={{ maxWidth: 220 }}>{r.Diagnosis || '—'}</td><td>{healthBadge(r.HealthStatus)}</td><td>{ELIGIBILITY[r.TrainingEligibility] || '—'}</td><td>{vetName(r.VetName)}</td>
        <td>{r.RecordStatus === 'Signed' ? <Badge kind="ok">Đã ký</Badge> : <Badge kind="draft">Phiếu nháp</Badge>}</td>
        <td>{r.RecordStatus === 'Signed' ? <button type="button" className="btn sec sm" onClick={() => select(r.MedicalRecordID)}>Xem phiếu</button>
          : <button type="button" className="btn pri sm" onClick={() => navigate(r.ExamType === 'Initial Exam' ? `/vet/horses/${d.horse.HorseID}/clinical` : `/vet/records/${r.MedicalRecordID}/edit`)}>Tiếp tục</button>}</td>
      </tr>)}</tbody></table>}
    {rec && <RecordCard rec={rec} onChanged={reload} />}
  </>
}

function RecordCard({ rec, onChanged }) {
  const am = useLoad(() => med.amendments(rec.MedicalRecordID), [rec.MedicalRecordID])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ Reason: '', AmendedContent: '' })
  const [errors, setErrors] = useState({})
  const act = useAction()
  const [loc, grade] = splitInjury(rec.InjuryLocation)
  async function add() {
    const found = runChecks({ Reason: () => checkText(form.Reason, 1000), AmendedContent: () => checkText(form.AmendedContent, 4000) })
    setErrors(found)
    if (Object.keys(found).length) return
    const ok = await act.run(async () => { await med.addAmendment(rec.MedicalRecordID, { Reason: form.Reason.trim(), AmendedContent: form.AmendedContent.trim() }); return true })
    if (ok) { setOpen(false); setForm({ Reason: '', AmendedContent: '' }); am.reload(); onChanged?.() }
  }
  const unit = (v, u) => (v == null ? '—' : `${String(v).replace('.', ',')} ${u}`)
  return <div className="card" style={{ marginTop: 16 }}><SectionTitle icon="file">{EXAM_TYPE[rec.ExamType] || rec.ExamType} · {fmtDateTime(rec.ExamDate)}</SectionTitle>
    <Dl cols={4} items={[['Nhiệt độ', unit(rec.BodyTemperatureC, '°C')], ['Nhịp tim', unit(rec.HeartRateBpm, 'lần/phút')], ['Nhịp thở', unit(rec.RespiratoryRate, 'lần/phút')], ['Cân nặng', unit(rec.WeightKg, 'kg')],
      loc && ['Vị trí chấn thương', loc], grade && ['Mức độ', grade], ['Triệu chứng', rec.Symptoms, 1], ['Chẩn đoán', rec.Diagnosis, 1], ['Kết luận', rec.Conclusion, 1],
      rec.FollowUpDate && ['Ngày tái khám', fmtDate(rec.FollowUpDate)], rec.RestrictionNote && ['Ghi chú giới hạn', rec.RestrictionNote, 1]]} />
    {(am.data || []).map((a) => <div key={a.MedicalRecordAmendmentID} className="quote info" style={{ marginTop: 12 }}><small>Đính chính sau khi ký · {vetName(a.AmendedByName)} · {fmtDateTime(a.AmendedAt)} · {a.Reason}</small><p>{a.AmendedContent}</p></div>)}
    {rec.RecordStatus === 'Signed' && <div style={{ marginTop: 14 }}><button type="button" className="btn sec sm" onClick={() => setOpen(true)}><Icon name="edit" size={14} /> Thêm phiếu đính chính</button></div>}
    {open && <Dialog title="Thêm phiếu đính chính" onClose={() => setOpen(false)} actions={<>
      <button type="button" className="btn sec" onClick={() => setOpen(false)}>Hủy</button><button type="button" className="btn pri" disabled={act.busy} onClick={add}>Lưu đính chính</button></>}>
      <p>Phiếu khám đã ký không chỉnh sửa được. Nội dung đính chính được lưu kèm phiếu và hiển thị cho người có quyền xem bệnh án.</p>
      <TextInput label="Lý do đính chính" required value={form.Reason} onChange={(v) => { setForm((f) => ({ ...f, Reason: v })); setErrors({}) }} error={errors.Reason} maxLength={1000} />
      <div style={{ marginTop: 12 }}><TextArea label="Nội dung đính chính" required value={form.AmendedContent} onChange={(v) => { setForm((f) => ({ ...f, AmendedContent: v })); setErrors({}) }} error={errors.AmendedContent} rows={3} /></div>
      {act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}
    </Dialog>}
  </div>
}

function TreatmentsTab({ d, reload }) {
  const today = isoToday()
  const [tab, setTab] = useState('active')
  const [open, setOpen] = useState(false)
  const act = useAction()
  const active = d.treatments.filter((t) => !t.EndDate || t.EndDate >= today)
  const shown = tab === 'active' ? active : d.treatments.filter((t) => t.EndDate && t.EndDate < today)
  const withdrawal = d.treatments.filter((t) => t.WithdrawalUntil && t.WithdrawalUntil >= today).sort((a, b) => b.WithdrawalUntil.localeCompare(a.WithdrawalUntil))[0]
  const recDate = Object.fromEntries(d.records.map((r) => [r.MedicalRecordID, r.ExamDate]))
  return <>
    <div className="toolbar"><Tabs value={tab} onChange={setTab} tabs={[['active', 'Đang điều trị', active.length], ['ended', 'Đã kết thúc', d.treatments.length - active.length]]} />
      <button type="button" className="btn pri" style={{ marginLeft: 'auto' }} onClick={() => setOpen(true)}><Icon name="plus" size={16} /> Kê đơn điều trị</button></div>
    {act.error && <Notice kind="bad" style={{ marginBottom: 12 }}>{act.error}</Notice>}
    {!shown.length ? <p className="empty">{tab === 'active' ? 'Ngựa không có thuốc hoặc liệu pháp đang điều trị.' : 'Chưa có điều trị đã kết thúc.'}</p> : <table>
      <thead><tr><th>Thuốc / phương pháp</th><th>Liều dùng</th><th>Từ ngày</th><th>Đến ngày</th><th>Ngưng thuốc trước thi đấu</th><th>Phiếu khám</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>{shown.map((t) => { const running = !t.EndDate || t.EndDate >= today; return <tr key={t.TreatmentID}>
        <td><b>{t.MedicineName}</b><small>{[ROUTE[t.Route], t.Note].filter(Boolean).join(' · ')}</small></td><td style={{ maxWidth: 200 }}>{t.Dose}</td><td>{fmtDate(t.StartDate)}</td><td>{fmtDate(t.EndDate)}</td>
        <td>{t.WithdrawalUntil ? `Đến ${fmtDate(t.WithdrawalUntil)}` : '—'}</td><td>{fmtDate(recDate[t.MedicalRecordID])}</td>
        <td>{running ? <Badge kind="wait">Đang điều trị</Badge> : <Badge kind="arch">Đã kết thúc</Badge>}</td>
        <td>{running ? <button type="button" className="btn sec sm" disabled={act.busy} onClick={() => act.run(async () => { await med.updateTreatment(t.TreatmentID, { EndDate: today }); reload() })}>Kết thúc sớm</button> : '—'}</td></tr> })}</tbody></table>}
    {withdrawal && <Notice style={{ marginTop: 16 }} title="Thời gian ngưng thuốc">{d.horse.HorseName} không được thi đấu trước {fmtDate(withdrawal.WithdrawalUntil)} do đang dùng {withdrawal.MedicineName}.</Notice>}
    {open && <TreatmentDialog records={d.records} onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload() }} />}
  </>
}

function TreatmentDialog({ records, onClose, onDone }) {
  const choices = records.filter((r) => r.ExamType !== 'Initial Exam')
  const [form, setForm] = useState({ MedicalRecordID: choices[0] ? String(choices[0].MedicalRecordID) : '', MedicineName: '', Dose: '', Route: 'Oral', StartDate: isoToday(), EndDate: '', WithdrawalUntil: '', Note: '' })
  const [errors, setErrors] = useState({})
  const act = useAction()
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }
  async function save() {
    const found = runChecks({ MedicalRecordID: () => checkSelect(form.MedicalRecordID), MedicineName: () => checkText(form.MedicineName, 150), Dose: () => checkText(form.Dose, 100),
      StartDate: () => (form.StartDate ? '' : MSG.required), EndDate: () => (form.EndDate && form.EndDate < form.StartDate ? 'Đến ngày không được trước Từ ngày.' : ''),
      WithdrawalUntil: () => (form.WithdrawalUntil && form.WithdrawalUntil < form.StartDate ? 'Ngày ngưng thuốc không được trước ngày bắt đầu điều trị.' : '') })
    setErrors(found)
    if (Object.keys(found).length) return
    const ok = await act.run(async () => {
      try { await med.addTreatment(form.MedicalRecordID, { MedicineName: form.MedicineName.trim(), Dose: form.Dose.trim(), Route: form.Route, StartDate: form.StartDate, EndDate: form.EndDate || null, WithdrawalUntil: form.WithdrawalUntil || null, Note: form.Note.trim() || null }) }
      catch (err) { const f = serverFieldErrors(err); if (Object.keys(f).length) { setErrors(f); return false } throw err }
      return true
    })
    if (ok) onDone()
  }
  return <Dialog title="Kê đơn điều trị" onClose={onClose} actions={<><button type="button" className="btn sec" onClick={onClose}>Hủy</button><button type="button" className="btn pri" disabled={act.busy} onClick={save}>Lưu đơn điều trị</button></>}>
    <SelectInput label="Phiếu khám" required value={form.MedicalRecordID} onChange={set('MedicalRecordID')} error={errors.MedicalRecordID} placeholder="Chọn phiếu khám"
      options={choices.map((r) => [String(r.MedicalRecordID), `${fmtDate(r.ExamDate)} · ${EXAM_TYPE[r.ExamType]}`])} />
    <div className="fgrid" style={{ marginTop: 12 }}>
      <TextInput label="Thuốc / phương pháp" required value={form.MedicineName} onChange={set('MedicineName')} error={errors.MedicineName} maxLength={150} />
      <SelectInput label="Đường dùng" required value={form.Route} onChange={set('Route')} options={Object.entries(ROUTE)} />
      <TextInput label="Liều dùng" required value={form.Dose} onChange={set('Dose')} error={errors.Dose} maxLength={100} />
      <TextInput label="Ghi chú" value={form.Note} onChange={set('Note')} maxLength={1000} />
      <DateField label="Từ ngày" required value={form.StartDate} onChange={set('StartDate')} error={errors.StartDate} />
      <DateField label="Đến ngày" value={form.EndDate} onChange={set('EndDate')} error={errors.EndDate} min={form.StartDate} />
    </div>
    <div style={{ marginTop: 12 }}><DateField label="Ngưng thuốc trước thi đấu đến ngày" value={form.WithdrawalUntil} onChange={set('WithdrawalUntil')} error={errors.WithdrawalUntil} min={form.StartDate} /></div>
    {act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}
  </Dialog>
}

/** Hình ngựa tham chiếu, đánh dấu vùng chấn thương theo vị trí ghi trên phiếu khám. */
function InjuryFigure({ location }) {
  const text = String(location || '').toLowerCase()
  const region = /chân trước|móng · chân trước/.test(text) ? 'foreleg' : /chân sau/.test(text) ? 'hindleg' : /lưng/.test(text) ? 'back' : /cổ/.test(text) && !/cổ chân/.test(text) ? 'neck'
    : /vai/.test(text) ? 'shoulder' : /đầu/.test(text) ? 'head' : /bụng/.test(text) ? 'abdomen' : /mông/.test(text) ? 'hindquarters' : ''
  const view = /phải/.test(text) ? 'right' : 'left'
  const at = region ? regionAnchor(region, view) : null
  return <div className="injury-fig"><img src="/images/injury/horse-reference-cutout-v2.png" alt="Hình ngựa tham chiếu" style={view === 'right' ? { transform: 'scaleX(-1)' } : undefined} />
    {at && <i style={{ left: `${at.xRatio * 100}%`, top: `${at.yRatio * 100}%` }} aria-label={location} />}</div>
}

function InjuryTab({ d, lock }) {
  const injuries = d.records.filter((r) => r.RecordStatus === 'Signed' && (r.ExamType === 'Injury Exam' || r.InjuryLocation))
  const current = injuries[0]
  const recovered = current && d.records.some((r) => r.RecordStatus === 'Signed' && r.ExamType === 'Follow-up' && r.ExamDate > current.ExamDate && r.TrainingEligibility === 'Eligible')
  const [loc, grade] = splitInjury(current?.InjuryLocation)
  const steps = current ? [
    ['done', `Phát hiện chấn thương${lock && !recovered ? `, ${LOCK_LEVEL[lock.LockLevel].toLowerCase()}` : ''}`, `${fmtDate(current.ExamDate)} · ${vetName(current.VetName)}`],
    [recovered ? 'done' : 'now', 'Tái khám, đánh giá mức hồi phục', current.FollowUpDate ? `Dự kiến ${fmtDate(current.FollowUpDate)}` : 'Chưa đặt lịch tái khám'],
    [recovered ? 'done' : '', 'Mở khóa hoặc chuyển sang giới hạn mức tập', lock?.LockEndDate ? `Dự kiến ${fmtDate(lock.LockEndDate)}` : ''],
  ] : []
  return <>
    <div className="grid">
      <div className="card"><SectionTitle icon="heart">Vị trí chấn thương</SectionTitle><InjuryFigure location={current && !recovered ? loc : ''} />
        <p className="hint" style={{ marginTop: 10 }}>{current && !recovered ? `Vị trí ghi trên phiếu khám ngày ${fmtDate(current.ExamDate)}: ${loc || 'chưa xác định'}.` : 'Ngựa không có chấn thương đang theo dõi.'}</p></div>
      <div className="card"><SectionTitle icon="file">Chấn thương đang theo dõi</SectionTitle>
        {current && !recovered ? <>
          <Dl items={[['Vị trí', loc || '—'], ['Mức độ', grade || '—'], ['Ngày phát hiện', fmtDate(current.ExamDate)], ['Dự kiến hồi phục', fmtDate(lock?.LockEndDate || current.FollowUpDate)],
            ['Ghi chú', current.Diagnosis, 1]]} />
          <p style={{ margin: '16px 0 8px', fontWeight: 700 }}>Tiến triển hồi phục</p><Timeline steps={steps} />
          <div className="btn-row" style={{ marginTop: 14 }}><Link className="btn sec sm" to={`/vet/horses/${d.horse.HorseID}/exam/new?type=Follow-up`}><Icon name="edit" size={14} /> Lập phiếu tái khám</Link></div>
        </> : <p className="hint" style={{ margin: 0 }}>Ngựa không có chấn thương đang theo dõi.</p>}</div>
    </div>
    <h2 className="sec-h">Lịch sử chấn thương</h2>
    {!injuries.length ? <p className="empty">Chưa ghi nhận chấn thương.</p> : <table><thead><tr><th>Ngày phát hiện</th><th>Vị trí</th><th>Chẩn đoán</th><th>Ngày hồi phục</th><th>Trạng thái</th></tr></thead>
      <tbody>{injuries.map((r, i) => { const [l, g] = splitInjury(r.InjuryLocation); const healed = i > 0 || recovered
        return <tr key={r.MedicalRecordID}><td><b>{fmtDate(r.ExamDate)}</b></td><td>{[l, g].filter(Boolean).join(' · ') || '—'}</td><td style={{ maxWidth: 280 }}>{r.Diagnosis}</td>
          <td>{healed ? fmtDate(r.FollowUpDate) : '—'}</td><td>{healed ? <Badge kind="ok">Đã hồi phục</Badge> : <Badge kind="wait">Đang theo dõi</Badge>}</td></tr> })}</tbody></table>}
  </>
}

function EligibilityTab({ d, lock, onEdit, onRelease }) {
  const impact = useLoad(async () => {
    if (!lock) return null
    const [sessions, assignments] = await Promise.all([med.sessions({ HorseID: d.horse.HorseID, Status: 'Cancelled', From: dateOnly(lock.LockStartDate) }).catch(() => []),
      med.assignments({ HorseID: d.horse.HorseID, Status: 'Active' }).catch(() => [])])
    return { sessions, trainer: assignments[0]?.TrainerName }
  }, [lock?.TrainingLockID])
  const cancelled = impact.data?.sessions || []
  const dates = cancelled.map((s) => s.SessionDate).sort()
  return <>
    <div className="grid">
      <div className="card"><SectionTitle icon="shield">Khóa tập đang áp dụng</SectionTitle>
        {lock ? <><Dl items={[['Mức khóa', lock.LockLevel === 'Full' ? 'Khóa toàn bộ, không được tập' : `Giới hạn mức tập, mức tải tối đa ${lock.MaxIntensity}`], ['Từ ngày', fmtDate(lock.LockStartDate)],
          ['Dự kiến đến', fmtDate(lock.LockEndDate)], ['Bác sĩ khóa', vetName(lock.CreatedByName)], ['Lý do', lock.Reason, 1], lock.Details && ['Ghi chú', lock.Details, 1]]} />
          <div className="btn-row" style={{ marginTop: 14 }}><button type="button" className="btn sec sm" onClick={onEdit}>{lock.LockLevel === 'Full' ? 'Chuyển sang giới hạn mức tập' : 'Điều chỉnh khóa tập'}</button>
            <button type="button" className="btn pri sm" onClick={onRelease}>Mở khóa tập</button></div></>
          : <p className="hint" style={{ margin: 0 }}>Ngựa đang được phép tập luyện bình thường.</p>}</div>
      <div className="card"><SectionTitle icon="cal">Ảnh hưởng đến lịch tập</SectionTitle>
        {!lock ? <p className="hint" style={{ margin: 0 }}>Không có lịch tập bị ảnh hưởng.</p> : impact.loading ? <Loading /> :
          <Dl cols={1} items={[['Buổi tập đã hủy', cancelled.length ? `${cancelled.length} buổi (${fmtDate(dates[0]).slice(0, 5)} – ${fmtDate(dates[dates.length - 1])})` : 'Không có'],
            ['Huấn luyện viên đã nhận thông báo', [impact.data?.trainer, 'Huấn luyện viên trưởng'].filter(Boolean).join(', ')], ['Chủ ngựa đã nhận thông báo', d.horse.Owner?.FullName || '—']]} />}</div>
    </div>
    <h2 className="sec-h">Lịch sử khóa tập</h2>
    {!d.locks.length ? <p className="empty">Chưa có lần khóa tập nào.</p> : <table><thead><tr><th>Thời gian</th><th>Mức khóa</th><th>Mức tải tối đa</th><th>Lý do</th><th>Bác sĩ</th><th>Trạng thái</th></tr></thead>
      <tbody>{d.locks.map((l) => <tr key={l.TrainingLockID}><td><b>{lockRange(l)}</b></td><td>{LOCK_LEVEL[l.LockLevel]}</td><td>{l.MaxIntensity ?? '—'}</td><td style={{ maxWidth: 280 }}>{l.Reason}</td>
        <td>{vetName(l.CreatedByName)}</td><td>{l.LockStatus === 'Active' ? <Badge kind="bad">Đang áp dụng</Badge> : <Badge kind="arch">Đã mở khóa</Badge>}</td></tr>)}</tbody></table>}
  </>
}

// ====================================================================== BS08 / BS09 / BS03f
export function VetCalendarPage() {
  const [from, setFrom] = useState(isoToday())
  const [to, setTo] = useState(plusDays(30))
  const data = useLoad(async () => {
    const [schedules, vaccinations, horses] = await Promise.all([med.schedules(), med.vaccinations(), med.horses()])
    return { items: medicalItems(schedules, vaccinations), horses }
  }, [])
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const { items, horses } = data.data
  const today = isoToday()
  const ranged = items.filter((it) => (!from || it.date >= from) && (!to || it.date <= to))
  return <Page>
    <Crumb items={[['Lịch y tế']]} />
    <Heading title="Lịch y tế" />
    <section className="panel">
      <div className="kpis">
        <div className="kpi"><small>Hôm nay</small><b>{items.filter((it) => it.date === today && it.status === 'Scheduled').length}</b></div>
        <div className="kpi"><small>7 ngày tới</small><b>{items.filter((it) => it.status === 'Scheduled' && it.date >= today && it.date <= plusDays(7)).length}</b></div>
        <div className="kpi"><small>Quá hạn</small><b>{items.filter((it) => it.status === 'Scheduled' && (it.overdue || it.date < today)).length}</b></div>
        <div className="kpi"><small>Chỉ định tái khám</small><b>{items.filter((it) => it.kind === 'schedule' && it.raw.ScheduleType === 'Routine Examination' && it.status === 'Scheduled' && /Tái khám/.test(it.sub || '')).length}</b></div>
      </div>
      <ScheduleTable items={ranged} horses={horses} reload={data.reload} filters={<><DateField label="Từ ngày" value={from} onChange={setFrom} /><DateField label="Đến ngày" value={to} onChange={setTo} min={from} /></>} />
    </section>
  </Page>
}

function ScheduleTable({ items, horses, horseFixed, reload, filters }) {
  const [type, setType] = useState('')
  const [horse, setHorse] = useState('')
  const [status, setStatus] = useState('')
  const [dialog, setDialog] = useState(null)
  const act = useAction()
  const today = isoToday()
  const rows = items.filter((it) => (!type || (type === 'Vaccination' ? it.kind === 'vaccination' : it.raw.ScheduleType === type)) && (!horse || String(it.HorseID) === horse)
    && (!status || (status === 'Overdue' ? it.status === 'Scheduled' && (it.overdue || it.date < today) : it.status === status)))
  const pager = usePager(rows, 10)
  const patch = (it, body) => act.run(async () => { await (it.kind === 'vaccination' ? med.updateVaccination(it.id, body) : med.updateSchedule(it.id, body)); reload() })
  return <>
    <div className="filters" style={{ gridTemplateColumns: filters ? '170px 170px 1fr 1fr 1fr auto' : '1fr 1fr 1fr auto' }}>
      {filters}
      <SelectInput label="Loại công việc" value={type} onChange={setType} placeholder="Tất cả" options={Object.entries(SCHEDULE_TYPE)} />
      {!horseFixed && <SelectInput label="Ngựa" value={horse} onChange={setHorse} placeholder="Tất cả ngựa" options={(horses || []).map((h) => [String(h.HorseID), h.HorseName])} />}
      <SelectInput label="Trạng thái" value={status} onChange={setStatus} placeholder="Tất cả" options={[['Scheduled', 'Đã lên lịch'], ['Overdue', 'Quá hạn'], ['Completed', 'Đã hoàn thành'], ['Cancelled', 'Đã hủy']]} />
      <button type="button" className="btn pri" onClick={() => setDialog({ kind: 'new' })}><Icon name="plus" size={16} /> Đặt lịch y tế</button>
    </div>
    {act.error && <Notice kind="bad" style={{ marginBottom: 12 }}>{act.error}</Notice>}
    {!rows.length ? <p className="empty">Không có lịch y tế phù hợp.</p> : <>
      <table><thead><tr><th>Ngày</th>{!horseFixed && <th>Ngựa</th>}<th>Công việc</th><th>Bác sĩ phụ trách</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>{pager.slice.map((it) => <tr key={it.key}><td><b>{fmtDate(it.date)}</b></td>{!horseFixed && <td><b>{it.HorseName}</b></td>}
          <td><b>{it.title}</b><small>{it.sub || ''}</small></td><td>{it.raw.VetID || it.VetName ? vetName(it.VetName) : 'Bác sĩ ngoài câu lạc bộ'}</td><td>{itemBadge(it)}</td>
          <td>{it.status === 'Scheduled' ? <div className="btn-row"><button type="button" className="btn pri sm" onClick={() => setDialog({ kind: 'done', it })}>Ghi kết quả</button>
            <button type="button" className="btn danger sm" disabled={act.busy} onClick={() => patch(it, { Status: 'Cancelled' })}>Hủy</button></div> : '—'}</td></tr>)}</tbody></table>
      <Pager pager={pager} noun="lịch y tế" /></>}
    {dialog?.kind === 'new' && <BookDialog horses={horseFixed ? [horseFixed] : horses} onClose={() => setDialog(null)} onDone={() => { setDialog(null); reload() }} />}
    {dialog?.kind === 'done' && <DoneDialog it={dialog.it} onClose={() => setDialog(null)} onDone={async (note) => { await patch(dialog.it, { Status: 'Completed', Note: note || dialog.it.raw.Note }); setDialog(null) }} />}
  </>
}

function DoneDialog({ it, onClose, onDone }) {
  const [note, setNote] = useState(it.raw.Note || '')
  return <Dialog title={`Ghi kết quả · ${it.HorseName}`} onClose={onClose} actions={<><button type="button" className="btn sec" onClick={onClose}>Hủy</button>
    <button type="button" className="btn pri" onClick={() => onDone(note.trim())}><Icon name="check" size={16} /> Xác nhận hoàn thành</button></>}>
    <p>{it.title}{it.kind === 'vaccination' ? ` ${it.raw.VaccineName}` : ''} ngày {fmtDate(it.date)} sẽ được ghi nhận là đã hoàn thành.</p>
    <TextArea label="Kết quả / ghi chú" value={note} onChange={setNote} rows={2} maxLength={1000} />
  </Dialog>
}

function BookDialog({ horses, onClose, onDone }) {
  const [form, setForm] = useState({ HorseID: horses.length === 1 ? String(horses[0].HorseID) : '', Type: 'Vaccination', Date: plusDays(7), Vet: '', VaccineName: '', Months: '', Note: '' })
  const [errors, setErrors] = useState({})
  const act = useAction()
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }
  async function save() {
    const found = runChecks({ HorseID: () => checkSelect(form.HorseID), Type: () => checkSelect(form.Type), Date: () => (!form.Date ? MSG.required : form.Date < isoToday() ? 'Ngày thực hiện không được trước ngày hiện tại.' : ''),
      VaccineName: () => (form.Type === 'Vaccination' ? checkSelect(form.VaccineName) : ''), Months: () => (form.Months && !/^\d{1,2}$/.test(form.Months) ? 'Giá trị phải là số nguyên.' : '') })
    setErrors(found)
    if (Object.keys(found).length) return
    const vet = form.Vet === 'external' ? { ExternalVet: true } : {}
    const ok = await act.run(async () => {
      try {
        if (form.Type === 'Vaccination') {
          const next = form.Months ? (() => { const d = new Date(`${form.Date}T00:00:00`); d.setMonth(d.getMonth() + Number(form.Months)); return d.toISOString().slice(0, 10) })() : null
          await med.addVaccination(form.HorseID, { VaccineName: form.VaccineName, VaccinationDate: form.Date, NextDueDate: next, Note: form.Note.trim() || null, ...vet })
        } else await med.addSchedule(form.HorseID, { ScheduleType: form.Type, ScheduledDate: form.Date, Note: form.Note.trim() || null, ...vet })
      } catch (err) { const f = serverFieldErrors(err); if (Object.keys(f).length) { setErrors(f); return false } throw err }
      return true
    })
    if (ok) onDone()
  }
  return <Dialog title="Đặt lịch y tế" onClose={onClose} actions={<><button type="button" className="btn sec" onClick={onClose}>Hủy</button><button type="button" className="btn pri" disabled={act.busy} onClick={save}>Đặt lịch</button></>}>
    <div className="fgrid">
      <SelectInput label="Ngựa" required value={form.HorseID} onChange={set('HorseID')} error={errors.HorseID} placeholder="Chọn ngựa" options={horses.map((h) => [String(h.HorseID), h.HorseName])} />
      <SelectInput label="Loại công việc" required value={form.Type} onChange={set('Type')} error={errors.Type} options={Object.entries(SCHEDULE_TYPE)} />
      <DateField label="Ngày thực hiện" required value={form.Date} onChange={set('Date')} error={errors.Date} min={isoToday()} />
      <SelectInput label="Bác sĩ phụ trách" value={form.Vet} onChange={set('Vet')} placeholder="Tôi phụ trách" options={[['external', 'Bác sĩ ngoài câu lạc bộ']]} />
      {form.Type === 'Vaccination' && <><SelectInput label="Loại vắc xin" required value={form.VaccineName} onChange={set('VaccineName')} error={errors.VaccineName} placeholder="Chọn vắc xin" options={VACCINES.map((v) => [v, v])} />
        <TextInput label="Nhắc lại sau" unit="tháng" value={form.Months} onChange={set('Months')} error={errors.Months} inputMode="numeric" maxLength={2} /></>}
    </div>
    <div style={{ marginTop: 12 }}><TextArea label="Ghi chú" value={form.Note} onChange={set('Note')} rows={2} maxLength={1000} /></div>
    {act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}
  </Dialog>
}

// ====================================================================== BS05
export function VetReportsPage() {
  const navigate = useNavigate()
  const data = useLoad(() => med.reports(), [])
  const [tab, setTab] = useState('open')
  const [text, setText] = useState('')
  const [sev, setSev] = useState('')
  const act = useAction()
  const all = (data.data || []).slice().sort((a, b) => (a.Severity === 'Urgent') !== (b.Severity === 'Urgent') && a.Status !== 'Resolved' && b.Status !== 'Resolved'
    ? (a.Severity === 'Urgent' ? -1 : 1) : String(b.ReportedAt).localeCompare(String(a.ReportedAt)))
  const groups = { open: all.filter((r) => r.Status !== 'Resolved'), done: all.filter((r) => r.Status === 'Resolved'), all }
  const shown = groups[tab].filter((r) => (!sev || r.Severity === sev) && matches(text, r.HorseName, r.Description))
  const pager = usePager(shown, 10)
  async function take(r) { const ok = await act.run(async () => { await med.take(r.HealthReportID); return true }); if (ok) navigate(`/vet/reports/${r.HealthReportID}`) }
  return <Page>
    <Crumb items={[['Báo cáo sức khỏe']]} />
    <Heading title="Báo cáo sức khỏe" />
    <section className="panel">
      {data.loading ? <Loading /> : data.error ? <Notice kind="bad">{errorText(data.error)}</Notice> : <>
        <div className="toolbar"><Tabs value={tab} onChange={(t) => { setTab(t); pager.setPage(1) }} tabs={[['open', 'Chưa xử lý xong', groups.open.length], ['done', 'Đã xử lý', groups.done.length], ['all', 'Tất cả', all.length]]} />
          <Search value={text} onChange={setText} placeholder="Tìm theo ngựa, triệu chứng" />
          <select className="input" style={{ width: 180 }} value={sev} onChange={(e) => setSev(e.target.value)} aria-label="Mức độ"><option value="">Tất cả mức độ</option><option value="Urgent">Khẩn</option><option value="Normal">Thông thường</option></select></div>
        {act.error && <Notice kind="bad" style={{ marginBottom: 12 }}>{act.error}</Notice>}
        {!shown.length ? <p className="empty">Không có báo cáo phù hợp.</p> : <>
          <table><thead><tr><th>Ngựa</th><th>Triệu chứng</th><th>Người báo cáo</th><th>Thời điểm</th><th>Mức độ</th><th>Bác sĩ xử lý</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>{pager.slice.map((r) => <tr key={r.HealthReportID} className={r.Severity === 'Urgent' && r.Status !== 'Resolved' ? 'hl' : ''}>
              <td><b>{r.HorseName}</b></td><td style={{ maxWidth: 230 }}>{r.Description}</td><td><b>{r.ReportedByName}</b><small>{roleText(r.ReportedByRoles)}</small></td>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.ReportedAt)}</td><td>{severityBadge(r.Severity)}</td><td>{r.VetName ? vetName(r.VetName) : <span className="muted">Chưa có</span>}</td>
              <td>{reportBadge(r.Status)}</td>
              <td>{r.Status === 'Reported' ? <button type="button" className="btn pri sm" disabled={act.busy} onClick={() => take(r)}>Nhận xử lý</button>
                : <Link className="btn sec sm" to={`/vet/reports/${r.HealthReportID}`}>Chi tiết</Link>}</td></tr>)}</tbody></table>
          <Pager pager={pager} noun="báo cáo" /></>}
      </>}
    </section>
  </Page>
}

// ====================================================================== BS06 / BS07
export function VetReportDetailPage() {
  const { reportId } = useParams()
  const navigate = useNavigate()
  const data = useLoad(async () => {
    const report = await med.report(reportId)
    const [horse, groom, assignments, locks] = await Promise.all([med.horse(report.HorseID), med.groom(report.HorseID), med.assignments({ HorseID: report.HorseID, Status: 'Active' }).catch(() => []),
      med.locks({ HorseID: report.HorseID })])
    return { report, horse, groom, trainer: assignments[0]?.TrainerName, locks }
  }, [reportId])
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState('')
  const [dialog, setDialog] = useState(null)
  const [result, setResult] = useState('')
  const [resultError, setResultError] = useState('')
  const act = useAction()
  const image = useBlob(data.data?.report?.ImageUrl)
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const { report: r, horse, groom, trainer, locks } = data.data
  const lock = locks.find((l) => l.LockStatus === 'Active')
  const lockAfter = locks.find((l) => l.LockStartDate >= r.ReportedAt)
  const steps = [['done', `${r.ReportedByName} gửi báo cáo`, fmtDateTime(r.ReportedAt)]]
  if (r.VetName) steps.push(['done', `${vetName(r.VetName)} nhận xử lý`, ''])
  if (r.MedicalRecordID) steps.push(['done', 'Đã lập phiếu khám', ''])
  if (lockAfter) steps.push(['done', `${lockAfter.LockLevel === 'Full' ? 'Khóa tập toàn bộ' : 'Giới hạn mức tập'}${lockAfter.LockEndDate ? ` đến ${fmtDate(lockAfter.LockEndDate)}` : ''}`, fmtDateTime(lockAfter.LockStartDate)])
  for (const n of r.Notes || []) steps.push(['done', n.Content, `${n.NoteByName} · ${fmtDateTime(n.NoteAt)}`])
  steps.push(r.Status === 'Resolved' ? ['done', 'Đã hoàn tất xử lý', `${fmtDateTime(r.ResolvedAt)}${r.VetNote ? ` · ${r.VetNote}` : ''}`] : ['now', r.Status === 'Reported' ? 'Chờ bác sĩ thú y tiếp nhận' : 'Đang theo dõi', ''])
  async function addNote() { const msg = checkText(note, 2000); setNoteError(msg); if (msg) return; const ok = await act.run(async () => { await med.addNote(r.HealthReportID, note.trim()); return true }); if (ok) { setNote(''); data.reload() } }
  async function resolve() { const msg = checkText(result, 2000); setResultError(msg); if (msg) return
    const ok = await act.run(async () => { await med.resolve(r.HealthReportID, { VetNote: result.trim(), MedicalRecordID: r.MedicalRecordID || null }); return true }); if (ok) { setDialog(null); data.reload() } }
  return <Page>
    <Crumb items={[['Báo cáo sức khỏe', '/vet/reports'], [`${r.HorseName} · ${fmtDate(r.ReportedAt)}`]]} />
    <Heading title="Xử lý báo cáo sức khỏe" />
    <section className="panel">
      <div className="ctx"><div className="who"><HorseThumb horseId={r.HorseID} size={64} /><div><h2>{r.HorseName}</h2><p>Báo cáo bởi {r.ReportedByName}{roleText(r.ReportedByRoles) ? ` (${roleText(r.ReportedByRoles)})` : ''} · {fmtDateTime(r.ReportedAt)}</p></div></div>
        <div className="btn-row">{severityBadge(r.Severity)}{reportBadge(r.Status)}</div></div>
      {act.error && !dialog && <Notice kind="bad" style={{ marginTop: 14 }}>{act.error}</Notice>}
      <div className="two" style={{ marginTop: 18, gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card"><SectionTitle icon="heart">Nội dung báo cáo</SectionTitle><p style={{ margin: 0, lineHeight: 1.55 }}>{r.Description}</p>
            {image && <div className="photos" style={{ marginTop: 14 }}><img src={image} alt="Ảnh đính kèm báo cáo" /></div>}</div>
          <div className="card"><SectionTitle icon="file">Diễn biến xử lý</SectionTitle><Timeline steps={steps} />
            {r.Status !== 'Resolved' && <><div style={{ marginTop: 14 }}><TextArea label="Ghi chú xử lý" value={note} onChange={(v) => { setNote(v); setNoteError('') }} error={noteError} rows={2} maxLength={2000} /></div>
              <div className="actions"><button type="button" className="btn sec" disabled={act.busy} onClick={addNote}>Thêm ghi chú</button></div></>}</div>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          {r.Status !== 'Resolved' && <div className="card"><SectionTitle icon="steth">Thao tác</SectionTitle><div style={{ display: 'grid', gap: 10 }}>
            {r.Status === 'Reported' && <button type="button" className="btn pri" disabled={act.busy} onClick={() => act.run(async () => { await med.take(r.HealthReportID); data.reload() })}>Nhận xử lý</button>}
            <button type="button" className={`btn ${r.Status === 'Reported' ? 'sec' : 'pri'}`} onClick={() => navigate(`/vet/horses/${r.HorseID}/exam/new?type=${r.Severity === 'Urgent' ? 'Injury Exam' : 'Routine Exam'}&report=${r.HealthReportID}`)}><Icon name="plus" size={16} /> Lập phiếu khám</button>
            <button type="button" className="btn danger" onClick={() => setDialog('lock')}><Icon name="shield" size={16} /> {lock ? 'Điều chỉnh khóa tập' : 'Khóa tập khẩn cấp'}</button>
            <button type="button" className="btn sec" disabled={r.Status === 'Reported'} onClick={() => { setResult(''); setResultError(''); setDialog('resolve') }}><Icon name="check" size={16} /> Hoàn tất xử lý</button></div></div>}
          <div className="card"><SectionTitle icon="horse">Thông tin ngựa</SectionTitle>
            <Dl cols={2} items={[['Chuồng', horse.CurrentStall?.StallNumber], ['Sức khỏe', healthText(horse.CurrentHealthStatus)], ['Người chăm sóc', groom?.GroomName], ['Huấn luyện viên', trainer]]} />
            <div style={{ marginTop: 14 }}><Link className="btn sec sm" to={`/vet/horses/${r.HorseID}`}>Xem hồ sơ y tế</Link></div></div>
        </div>
      </div>
    </section>
    {dialog === 'lock' && <LockDialog horse={horse} lock={lock} onClose={() => setDialog(null)} onDone={() => { setDialog(null); data.reload() }} />}
    {dialog === 'resolve' && <Dialog title="Hoàn tất xử lý báo cáo?" onClose={() => setDialog(null)} actions={<><button type="button" className="btn sec" onClick={() => setDialog(null)}>Hủy</button>
      <button type="button" className="btn pri" disabled={act.busy} onClick={resolve}><Icon name="check" size={16} /> Hoàn tất</button></>}>
      <p>Trạng thái báo cáo sẽ được chuyển sang “Đã xử lý”. Kết quả xử lý sẽ được gửi thông báo đến người báo cáo.</p>
      <TextArea label="Kết quả xử lý" required value={result} onChange={(v) => { setResult(v); setResultError('') }} error={resultError} rows={3} maxLength={2000} />
      {act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}</Dialog>}
  </Page>
}

/** Tải ảnh đính kèm có token (đường dẫn /api/...). */
export function useBlob(url) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let active = true, made = ''
    if (url && url.startsWith('/api/')) {
      import('../api/apiClient.ts').then(({ apiGetBlob }) => apiGetBlob(url.replace(/^\/api/, ''))).then((blob) => { if (active) { made = URL.createObjectURL(blob); setSrc(made) } }).catch(() => {})
    } else if (url) setSrc(url)
    return () => { active = false; if (made) URL.revokeObjectURL(made) }
  }, [url])
  return src
}

// ====================================================================== BS13 / BS14 (phiếu khám)
const NUM = [['BodyTemperatureC', 'Nhiệt độ', '°C', 35, 43, true], ['HeartRateBpm', 'Nhịp tim', 'lần/phút', 20, 120, true], ['RespiratoryRate', 'Nhịp thở', 'lần/phút', 4, 80, true],
  ['WeightKg', 'Cân nặng', 'kg', 100, 1200], ['HeightCm', 'Chiều cao', 'cm', 80, 220]]
const num2 = (v) => (v == null ? '' : String(v).replace('.', ','))

export function ExamFormPage() {
  const { horseId, recordId } = useParams()
  const [params] = useSearchParams()
  const data = useLoad(async () => {
    const record = recordId ? await med.record(recordId) : null
    const hid = record?.HorseID || horseId
    const [horse, records, locks, report] = await Promise.all([med.horse(hid), med.records(hid), med.locks({ HorseID: hid, LockStatus: 'Active' }),
      params.get('report') ? med.report(params.get('report')).catch(() => null) : Promise.resolve(null)])
    return { record, horse, records, lock: locks[0] || null, report }
  }, [horseId, recordId])
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  if (data.data.record && data.data.record.RecordStatus === 'Signed') return <Page><Notice kind="info" style={{ marginTop: 30 }}>Phiếu khám đã ký không chỉnh sửa được, chỉ thêm phiếu đính chính.</Notice></Page>
  return <ExamForm {...data.data} type={data.data.record?.ExamType || params.get('type') || 'Routine Exam'} />
}

function ExamForm({ record, horse, records, lock, report, type: initialType }) {
  const navigate = useNavigate()
  const [loc0, grade0] = splitInjury(record?.InjuryLocation)
  const [form, setForm] = useState(() => ({ ExamType: initialType, ExamDate: dateOnly(record?.ExamDate) || isoToday(), ExamTime: record?.ExamDate ? String(record.ExamDate).slice(11, 16) : new Date().toTimeString().slice(0, 5),
    ...Object.fromEntries(NUM.map(([k]) => [k, num2(record?.[k])])), Location: loc0, Grade: grade0, Symptoms: record?.Symptoms || report?.Description || '', Diagnosis: record?.Diagnosis || '',
    HealthStatus: record?.HealthStatus || '', TrainingEligibility: record?.TrainingEligibility || '', RestrictionNote: record?.RestrictionNote || '', Conclusion: record?.Conclusion || '', FollowUpDate: record?.FollowUpDate || '',
    lockOn: initialType === 'Injury Exam', LockLevel: 'Full', LockEndDate: plusDays(14), MaxIntensity: '' }))
  const [errors, setErrors] = useState({})
  const [saved, setSaved] = useState(record)
  const [confirm, setConfirm] = useState(false)
  const act = useAction()
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v, ...(k === 'TrainingEligibility' && v !== 'Eligible' && !lock ? { lockOn: true, LockLevel: v === 'Restricted' ? 'Restricted' : 'Full' } : {}) })); setErrors((e) => ({ ...e, [k]: undefined })) }
  const injury = form.ExamType === 'Injury Exam'
  const last = records.find((r) => r.RecordStatus === 'Signed')
  const restricted = form.TrainingEligibility === 'Restricted'
  function validate(forSign) {
    const rules = { ExamDate: () => (form.ExamDate ? (form.ExamDate > isoToday() ? 'Ngày khám không được sau ngày hiện tại.' : '') : MSG.required) }
    // Database bắt buộc RestrictionNote khi điều kiện tập là "Giới hạn mức tập" (CK_MedicalRecord_Restriction), kể cả phiếu nháp
    if (restricted) rules.RestrictionNote = () => (form.RestrictionNote.trim() ? checkText(form.RestrictionNote, 1000) : MSG.required)
    for (const [k, , , low, high, req] of NUM) rules[k] = () => { const t = String(form[k]).trim(); if (!t) return req && forSign ? MSG.required : ''; if (!/^\d+([.,]\d+)?$/.test(t)) return 'Giá trị phải là số.'; const n = Number(t.replace(',', '.')); return n < low || n > high ? `Giá trị phải từ ${low} đến ${high}.` : '' }
    if (forSign) Object.assign(rules, { Symptoms: () => checkText(form.Symptoms, 2000), Diagnosis: () => checkText(form.Diagnosis, 2000), HealthStatus: () => checkSelect(form.HealthStatus),
      TrainingEligibility: () => checkSelect(form.TrainingEligibility), Conclusion: () => checkText(form.Conclusion, 2000) })
    if (forSign && injury) Object.assign(rules, { Location: () => checkSelect(form.Location), Grade: () => checkSelect(form.Grade) })
    if (forSign && form.lockOn && !lock) Object.assign(rules, { LockEndDate: () => (form.LockEndDate ? (form.LockEndDate < isoToday() ? 'Ngày dự kiến không được trước ngày hiện tại.' : '') : MSG.required),
      MaxIntensity: () => {
        if (form.LockLevel !== 'Restricted') return ''
        const t = String(form.MaxIntensity).trim()
        if (!t) return MSG.required
        if (!/^\d+([.,]\d+)?$/.test(t)) return 'Giá trị phải là số.'
        return Number(t.replace(',', '.')) > 100 ? 'Giá trị phải từ 0 đến 100.' : ''
      } })
    rules.FollowUpDate = () => (form.FollowUpDate && form.FollowUpDate < form.ExamDate ? 'Ngày tái khám không được trước ngày khám.' : '')
    const found = runChecks(rules)
    setErrors(found)
    return !Object.keys(found).length
  }
  async function persist() {
    const body = { ExamType: form.ExamType, ExamDate: `${form.ExamDate}T${form.ExamTime || '08:00'}:00`, Symptoms: form.Symptoms.trim() || null, Diagnosis: form.Diagnosis.trim() || null,
      HealthStatus: form.HealthStatus || null, TrainingEligibility: form.TrainingEligibility || null, RestrictionNote: restricted ? form.RestrictionNote.trim() : null,
      Conclusion: form.Conclusion.trim() || null, FollowUpDate: form.FollowUpDate || null,
      InjuryLocation: injury && form.Location ? [form.Location, form.Grade].filter(Boolean).join(' · ') : null }
    for (const [k] of NUM) body[k] = String(form[k]).trim() ? Number(String(form[k]).replace(',', '.')) : null
    try {
      if (saved) return await med.updateRecord(saved.MedicalRecordID, body)
      return await med.createRecord(horse.HorseID, { ...body, HealthReportID: report?.HealthReportID || null, TrainingSessionID: report?.TrainingSessionID || null })
    } catch (err) {
      const f = serverFieldErrors(err)
      // Chỉ hiện lỗi dưới ô khi ô đó có trên form; lỗi khác phải báo ra ngoài, không được nuốt im lặng
      if (Object.keys(f).length && Object.keys(f).every((k) => k in form)) { setErrors(f); return null }
      throw err
    }
  }
  async function saveDraft() {
    if (!validate(false)) return
    await act.run(async () => { const r = await persist(); if (r) { setSaved(r); if (!saved) navigate(`/vet/records/${r.MedicalRecordID}/edit`, { replace: true }) } })
  }
  async function sign() {
    setConfirm(false)
    await act.run(async () => {
      const r = await persist(); if (!r) return
      const lockBody = form.lockOn && !lock && form.TrainingEligibility !== 'Eligible' ? { TrainingLock: { LockLevel: form.LockLevel, Reason: (form.Diagnosis.trim() || 'Theo phiếu khám').slice(0, 100),
        LockEndDate: `${form.LockEndDate}T18:00:00`, MaxIntensity: form.LockLevel === 'Restricted' ? Number(String(form.MaxIntensity).replace(',', '.')) : null, Details: form.FollowUpDate ? `Tái khám ngày ${fmtDate(form.FollowUpDate)} trước khi mở khóa.` : null } } : undefined
      await med.signRecord(r.MedicalRecordID, lockBody)
      navigate(`/vet/horses/${horse.HorseID}?tab=records&record=${r.MedicalRecordID}`)
    })
  }
  const title = EXAM_TYPE[form.ExamType] ? `Phiếu ${EXAM_TYPE[form.ExamType].charAt(0).toLowerCase()}${EXAM_TYPE[form.ExamType].slice(1)}` : 'Phiếu khám'
  return <Page>
    <Crumb items={[['Ngựa và chuồng trại', '/vet/herd'], [horse.HorseName, `/vet/horses/${horse.HorseID}`], [title]]} />
    <Heading title={title} />
    <section className="panel">
      <div className="ctx"><div className="who"><HorseThumb horseId={horse.HorseID} size={64} /><div><h2>{horse.HorseName}</h2>
        <p>{[horse.HorseCode, horse.Breed, horse.CurrentStall?.StallNumber && `Chuồng ${horse.CurrentStall.StallNumber}`, report && `Báo cáo ${report.Severity === 'Urgent' ? 'khẩn' : 'thông thường'} của ${report.ReportedByName} lúc ${String(report.ReportedAt).slice(11, 16)}`].filter(Boolean).join(' · ')}</p></div></div>
        <Badge kind="draft">Phiếu nháp</Badge></div>
      {act.error && <Notice kind="bad" style={{ marginTop: 14 }}>{act.error}</Notice>}
      <div className="two" style={{ marginTop: 18, gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
        <div className="card"><SectionTitle icon="steth">Chỉ số sinh hiệu</SectionTitle>
          {!saved && <div style={{ marginBottom: 14, maxWidth: 320 }}><SelectInput label="Loại phiếu khám" required value={form.ExamType} onChange={set('ExamType')}
            options={Object.entries(EXAM_TYPE).filter(([k]) => k !== 'Initial Exam')} /></div>}
          <div className="fgrid three">
            {NUM.slice(0, 3).map(([k, label, unit, , , req]) => <TextInput key={k} label={label} required={req} unit={unit} value={form[k]} onChange={set(k)} error={errors[k]} inputMode="decimal" maxLength={6} />)}
            {NUM.slice(3).map(([k, label, unit]) => <TextInput key={k} label={label} unit={unit} value={form[k]} onChange={set(k)} error={errors[k]} inputMode="decimal" maxLength={6} />)}
            <DateField label="Ngày khám" required value={form.ExamDate} onChange={set('ExamDate')} error={errors.ExamDate} max={isoToday()} />
          </div>
          {injury && <div className="fgrid" style={{ marginTop: 14 }}>
            <SelectInput label="Vị trí chấn thương" required value={form.Location} onChange={set('Location')} error={errors.Location} placeholder="Chọn vị trí" options={INJURY_LOCATIONS.map((v) => [v, v])} />
            <SelectInput label="Mức độ" required value={form.Grade} onChange={set('Grade')} error={errors.Grade} placeholder="Chọn mức độ" options={['Độ 1', 'Độ 2', 'Độ 3'].map((v) => [v, v])} /></div>}
          <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
            <TextArea label="Triệu chứng" required value={form.Symptoms} onChange={set('Symptoms')} error={errors.Symptoms} rows={2} maxLength={2000} />
            <TextArea label="Chẩn đoán" required value={form.Diagnosis} onChange={set('Diagnosis')} error={errors.Diagnosis} rows={2} maxLength={2000} />
            <div className="fgrid">
              <SelectInput label="Kết luận sức khỏe" required value={form.HealthStatus} onChange={set('HealthStatus')} error={errors.HealthStatus} placeholder="Chọn kết luận" options={Object.entries(HEALTH).map(([k, [, t]]) => [k, t])} />
              <SelectInput label="Điều kiện tập luyện" required value={form.TrainingEligibility} onChange={set('TrainingEligibility')} error={errors.TrainingEligibility} placeholder="Chọn điều kiện" options={Object.entries(ELIGIBILITY)} />
            </div>
            {restricted && <TextArea label="Ghi chú giới hạn tập" required value={form.RestrictionNote} onChange={set('RestrictionNote')} error={errors.RestrictionNote} rows={2} maxLength={1000}
              placeholder="Chỉ đi bộ và chạy nước kiệu nhẹ, không phi nước đại" />}
            <TextArea label="Kết luận và chỉ định" required value={form.Conclusion} onChange={set('Conclusion')} error={errors.Conclusion} rows={2} maxLength={2000} />
            <div style={{ maxWidth: 320 }}><DateField label="Ngày tái khám" value={form.FollowUpDate} onChange={set('FollowUpDate')} error={errors.FollowUpDate} min={form.ExamDate} /></div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          {report ? <div className="card"><SectionTitle icon="file">Báo cáo sức khỏe liên quan</SectionTitle>
            <div className="quote warm"><small>{report.ReportedByName} · {roleText(report.ReportedByRoles)} · {fmtDateTime(report.ReportedAt)} · {report.Severity === 'Urgent' ? 'Khẩn' : 'Thông thường'}</small><p>{report.Description}</p></div></div>
            : <div className="card"><SectionTitle icon="file">Lần khám gần nhất</SectionTitle>
              {last ? <Dl items={[['Ngày khám', fmtDate(last.ExamDate)], ['Kết luận', healthText(last.HealthStatus)], ['Bác sĩ', vetName(last.VetName)]]} /> : <p className="hint" style={{ margin: 0 }}>Chưa có phiếu khám đã ký.</p>}</div>}
          <div className="card"><SectionTitle icon="shield">Khóa tập</SectionTitle>
            {lock ? <p className="hint" style={{ margin: 0 }}>Ngựa đang {LOCK_LEVEL[lock.LockLevel].toLowerCase()} đến {fmtDate(lock.LockEndDate)}. Điều chỉnh khóa tập tại hồ sơ y tế.</p> : <>
              <label className="check"><input type="checkbox" checked={form.lockOn} onChange={(e) => set('lockOn')(e.target.checked)} /> Khóa tập khi ký phiếu</label>
              {form.lockOn && <div className="fgrid" style={{ marginTop: 12 }}>
                <SelectInput label="Mức khóa" required value={form.LockLevel} onChange={set('LockLevel')} options={Object.entries(LOCK_LEVEL)} />
                <DateField label="Dự kiến đến ngày" required value={form.LockEndDate} onChange={set('LockEndDate')} error={errors.LockEndDate} min={isoToday()} />
                {form.LockLevel === 'Restricted' && <TextInput label="Mức tải tối đa" required value={form.MaxIntensity} onChange={set('MaxIntensity')} error={errors.MaxIntensity} inputMode="decimal" maxLength={5} />}</div>}
              <p className="hint" style={{ marginTop: 10 }}>Khóa tập chỉ được tạo khi điều kiện tập luyện không phải “Đủ điều kiện”.</p></>}</div>
        </div>
      </div>
      <div className="actions"><span className="left">Phiếu đã ký không sửa được, chỉ thêm phiếu đính chính.</span>
        <button type="button" className="btn sec" disabled={act.busy} onClick={saveDraft}>Lưu nháp</button>
        <button type="button" className="btn pri" disabled={act.busy} onClick={() => { if (validate(true)) setConfirm(true) }}><Icon name="sign" size={16} /> Ký phiếu khám</button></div>
    </section>
    {confirm && <Dialog title="Ký phiếu khám?" onClose={() => setConfirm(false)} actions={<><button type="button" className="btn sec" onClick={() => setConfirm(false)}>Kiểm tra lại</button>
      <button type="button" className="btn pri" disabled={act.busy} onClick={sign}><Icon name="sign" size={16} /> Ký phiếu khám</button></>}>
      <p>Sau khi ký, kết luận sức khỏe của {horse.HorseName} được cập nhật{form.lockOn && !lock && form.TrainingEligibility !== 'Eligible' ? ' và khóa tập được áp dụng ngay, các buổi tập chưa diễn ra sẽ được hủy' : ''}. Phiếu đã ký không chỉnh sửa được.</p>
    </Dialog>}
  </Page>
}

// ====================================================================== BS10
const NOTE_ICON = { HEALTH_REPORT: 'heart', INITIAL_EXAM: 'steth', MEDICAL_SCHEDULE: 'cal', VACCINATION_DUE: 'cal', DIET_TO_REVIEW: 'file' }
export function noteTarget(n) {
  if (n.Type?.startsWith('ACT_')) { const to = notificationTarget('vet', n); return [to, to ? 'Xem' : ''] }
  if (n.EntityName === 'HealthReport') return [`/vet/reports/${n.EntityID}`, 'Xử lý']
  if (n.Type === 'INITIAL_EXAM') return [`/vet/horses/${n.EntityID}/clinical`, 'Nhận khám']
  if (n.EntityName === 'MedicalSchedule' || n.EntityName === 'Vaccination') return ['/vet/calendar', 'Xem lịch']
  if (n.EntityName === 'DietPlan') return ['/care/diet-approvals', 'Xem khẩu phần']
  if (n.HorseID) return [`/vet/horses/${n.HorseID}`, 'Xem hồ sơ']
  return [null, '']
}
export function VetNotificationsPage() {
  const navigate = useNavigate()
  const data = useLoad(() => getNotifications(), [])
  const [tab, setTab] = useState('all')
  const items = data.data || []
  const shown = items.filter((n) => tab === 'all' || !n.IsRead)
  async function open(n) { await markRead({ Keys: [n.Key] }).catch(() => {}); const [to] = noteTarget(n); if (to) navigate(to); else data.reload() }
  return <Page>
    <Crumb items={[['Thông báo']]} />
    <Heading title="Thông báo" />
    <section className="panel">
      <div className="toolbar"><Tabs value={tab} onChange={setTab} tabs={[['all', 'Tất cả', items.length], ['unread', 'Chưa đọc', items.filter((n) => !n.IsRead).length]]} />
        <button type="button" className="btn sec" style={{ marginLeft: 'auto' }} onClick={async () => { await markRead({ All: true }).catch(() => {}); data.reload() }}><Icon name="check" size={16} /> Đánh dấu tất cả đã đọc</button></div>
      {data.loading ? <Loading /> : !shown.length ? <p className="empty">Không có thông báo.</p> : shown.map((n) => { const [to, label] = noteTarget(n); const urgent = n.Priority === 'High'
        return <div key={n.Key} className={`note-row ${urgent && !n.IsRead ? 'urgent' : ''} ${n.IsRead ? 'is-read' : ''}`}><i className="dot" />
          <span className={`sicon ${urgent ? 'bad' : ''}`}><Icon name={NOTE_ICON[n.Type] || 'bell'} /></span>
          <div><b>{n.Title.split(' · ')[0]} {urgent && <Badge kind="bad">Khẩn</Badge>}</b><p>{n.Message || [n.HorseName, n.Title.split(' · ')[1]].filter(Boolean).join(' · ')}</p><small>{fmtDateTime(n.At)}</small></div>
          {to && <button type="button" className={`btn sm ${urgent && !n.IsRead ? 'danger fill' : n.IsRead ? 'sec' : 'pri'}`} onClick={() => open(n)}>{label}</button>}</div> })}
    </section>
  </Page>
}

// ====================================================================== BS10b
/** Cảnh báo khẩn trên màn hình cho bác sĩ thú y: kiểm tra mỗi 30 giây báo cáo khẩn chưa đọc. */
export function UrgentAlert() {
  const navigate = useNavigate()
  const [item, setItem] = useState(null)
  const [snooze, setSnooze] = useState(() => Number(sessionStorage.getItem('equi.urgent-snooze') || 0))
  useEffect(() => {
    let active = true
    async function check() {
      if (Date.now() < snooze) return
      const list = await getNotifications().catch(() => [])
      const urgent = list.find((n) => n.Priority === 'High' && !n.IsRead && n.EntityName === 'HealthReport')
      if (!active) return
      if (!urgent) { setItem(null); return }
      const report = await med.report(urgent.EntityID).catch(() => null)
      const horse = report ? await med.horse(report.HorseID).catch(() => null) : null
      if (active) setItem(report?.Status === 'Reported' ? { n: urgent, report, horse } : null)
    }
    check()
    const timer = setInterval(check, 30000)
    return () => { active = false; clearInterval(timer) }
  }, [snooze])
  if (!item?.report) return null
  const { n, report: r, horse } = item
  async function takeNow() {
    await markRead({ Keys: [n.Key] }).catch(() => {})
    if (r.Status === 'Reported') await med.take(r.HealthReportID).catch(() => {})
    setItem(null); navigate(`/vet/reports/${r.HealthReportID}`)
  }
  function later() { const until = Date.now() + 10 * 60000; try { sessionStorage.setItem('equi.urgent-snooze', String(until)) } catch { /* bỏ qua */ } setSnooze(until); setItem(null) }
  return <div className="f1"><div className="urgent-pop" role="alertdialog" aria-label="Báo cáo sức khỏe khẩn">
    <div className="urgent-head"><span><i /> BÁO CÁO SỨC KHỎE KHẨN</span><small>{minutesAgo(r.ReportedAt)}</small></div>
    <div className="urgent-body"><HorseThumb horseId={r.HorseID} size={56} /><div><b>{r.HorseName}{horse?.CurrentStall?.StallNumber ? ` · Chuồng ${horse.CurrentStall.StallNumber}` : ''}</b>
      <p>{r.Description}</p><small>{r.ReportedByName}{roleText(r.ReportedByRoles) ? ` (${roleText(r.ReportedByRoles)})` : ''} · {fmtDateTime(r.ReportedAt)}</small></div></div>
    <div className="urgent-actions"><button type="button" className="btn sec sm" onClick={later}>Nhắc lại sau 10 phút</button><button type="button" className="btn danger fill sm" onClick={takeNow}>Nhận xử lý ngay</button></div>
  </div></div>
}
function minutesAgo(at) {
  const diff = Math.round((Date.now() - new Date(at).getTime()) / 60000)
  if (diff < 2) return 'Vừa xong'
  if (diff < 60) return `${diff} phút trước`
  if (diff < 1440) return `${Math.round(diff / 60)} giờ trước`
  return fmtDate(at)
}

