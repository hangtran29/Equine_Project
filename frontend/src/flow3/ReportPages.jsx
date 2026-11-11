// Báo cáo sức khỏe của nhân sự (HT14, TR14, KS06, CS06) và hoạt động huấn luyện của chủ ngựa có khóa tập (CN-01).
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet, apiPostForm } from '../api/apiClient.ts'
import { Badge, Crumb, Dl, Heading, Icon, Loading, Notice, SectionTitle, SelectInput, TextArea, Timeline, errorText, fmtDate, fmtDateTime, useAction, useLoad } from '../flow1/ui.jsx'
import { getNotifications } from '../flow1/api.js'
import { checkSelect, checkText, runChecks, serverFieldErrors } from '../utils/validation.js'
import { EVALUATION, Tabs } from '../flow2/common.jsx'
import { HorseThumb } from '../flow1/horse.jsx'
import { LOCK_LEVEL, med } from './common.jsx'
import { ReportAttachments } from '../pages/HealthReportsPage.jsx'

const list = (v) => (Array.isArray(v) ? v : v?.results ?? [])
const STAFF_STATUS = { Reported: ['wait', 'Chờ bác sĩ tiếp nhận'], Reviewing: ['sent', 'Đang xử lý'], Resolved: ['ok', 'Đã xử lý'] }

/** Ngựa mà người báo cáo đang phụ trách: người chăm sóc, kỵ sĩ, huấn luyện viên; Huấn luyện viên trưởng thấy mọi ngựa đang tập. */
async function myHorses(role) {
  const all = await med.horses()
  if (role === 'headTrainer') return all
  try {
    if (role === 'groom') { const today = await apiGet('/care/training-today'); const ids = new Set(list(today).map((r) => r.HorseID)); if (ids.size) return all.filter((h) => ids.has(h.HorseID)) }
    if (role === 'trainer') { const a = list(await apiGet('/trainer-assignments?mine=1&Status=Active')); const ids = new Set(a.map((x) => x.HorseID)); return all.filter((h) => ids.has(h.HorseID)) }
    if (role === 'workRider') { const s = list(await apiGet('/training-sessions?mine=1')); const ids = new Set(s.map((x) => x.HorseID)); return all.filter((h) => ids.has(h.HorseID)) }
  } catch { /* dùng danh sách đầy đủ */ }
  return all
}

export function StaffHealthReportPage({ role }) {
  const horses = useLoad(() => myHorses(role), [role])
  const reports = useLoad(() => med.reports({ mine: 1 }), [])
  const [form, setForm] = useState({ HorseID: '', Severity: 'Normal', Description: '' })
  const [file, setFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [done, setDone] = useState('')
  const act = useAction()
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); setDone('') }
  async function send(e) {
    e.preventDefault()
    const found = runChecks({ HorseID: () => checkSelect(form.HorseID), Severity: () => checkSelect(form.Severity), Description: () => checkText(form.Description, 2500),
      File: () => (file && !/^image\/(jpeg|png|webp)$/.test(file.type) ? 'Ảnh phải có định dạng JPG, PNG hoặc WebP.' : file && file.size > 5 * 1024 * 1024 ? 'Ảnh không được vượt quá 5 MB.' : '') })
    setErrors(found)
    if (Object.keys(found).length) return
    await act.run(async () => {
      try {
        const AttachmentIDs = []
        if (file) { const fd = new FormData(); fd.append('File', file); AttachmentIDs.push((await apiPostForm(`/horses/${form.HorseID}/health-report-attachments`, fd)).AttachmentID) }
        await med.createReport(form.HorseID, { Severity: form.Severity, Description: form.Description.trim(), AttachmentIDs })
      } catch (err) { const f = serverFieldErrors(err); if (Object.keys(f).length) { setErrors(f); return } throw err }
      setForm({ HorseID: form.HorseID, Severity: 'Normal', Description: '' }); setFile(null)
      setDone(form.Severity === 'Urgent' ? 'Đã gửi báo cáo khẩn. Bác sĩ thú y đang trực nhận cảnh báo ngay trên màn hình.' : 'Đã gửi báo cáo đến bác sĩ thú y.')
      reports.reload()
    })
  }
  const rows = (reports.data || []).slice().sort((a, b) => String(b.ReportedAt).localeCompare(String(a.ReportedAt)))
  return <main className="page-content f1">
    <Crumb items={[['Báo cáo sức khỏe']]} />
    <Heading title="Báo cáo sức khỏe" />
    <section className="panel">
      <div className="grid">
        <form className="card" onSubmit={send} noValidate><SectionTitle icon="heart">Báo cáo bất thường</SectionTitle>
          {horses.error && <Notice kind="bad" style={{ marginBottom: 12 }}>{errorText(horses.error)}</Notice>}
          <div className="fgrid">
            <SelectInput label={role === 'groom' ? 'Ngựa phụ trách' : 'Ngựa'} required value={form.HorseID} onChange={set('HorseID')} error={errors.HorseID} placeholder="Chọn ngựa"
              options={(horses.data || []).map((h) => [String(h.HorseID), h.HorseName])} />
            <SelectInput label="Mức độ" required value={form.Severity} onChange={set('Severity')} error={errors.Severity} options={[['Normal', 'Thông thường'], ['Urgent', 'Khẩn']]} />
          </div>
          <div style={{ marginTop: 14 }}><TextArea label="Triệu chứng / mô tả" required value={form.Description} onChange={set('Description')} error={errors.Description} rows={3} maxLength={2500} /></div>
          <div className="field" style={{ marginTop: 14 }}><span>Hình ảnh</span>
            <label className="upload" style={{ cursor: 'pointer' }}><input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={(e) => { setFile(e.target.files?.[0] || null); setErrors((x) => ({ ...x, File: undefined })) }} />
              <div><Icon name="image" size={22} /><b>{file ? file.name : 'Tải lên ảnh'}</b><small>JPG, PNG, WebP · tối đa 5 MB</small></div></label>
            {errors.File && <span className="field-error" role="alert">{errors.File}</span>}</div>
          {form.Severity === 'Urgent' && <Notice style={{ marginTop: 14 }}>Báo cáo khẩn được gửi ngay đến bác sĩ thú y đang trực kèm cảnh báo trên màn hình.</Notice>}
          {act.error && <Notice kind="bad" style={{ marginTop: 14 }}>{act.error}</Notice>}
          {done && <Notice kind="ok" style={{ marginTop: 14 }}>{done}</Notice>}
          <div className="actions"><button type="submit" className="btn pri" disabled={act.busy}>{act.busy ? 'Đang gửi...' : 'Gửi báo cáo'}</button></div>
        </form>
        <div className="card"><SectionTitle icon="file">Báo cáo đã gửi</SectionTitle>
          {reports.loading ? <Loading /> : !rows.length ? <p className="hint" style={{ margin: 0 }}>Bạn chưa gửi báo cáo sức khỏe nào.</p> : rows.slice(0, 8).map((r) => {
            const [kind, text] = STAFF_STATUS[r.Status] || ['draft', r.Status]
            return <Link key={r.HealthReportID} to={`/health-reports/${r.HealthReportID}`} className="contact" style={{ marginTop: 8, color: 'inherit', textDecoration: 'none' }}><div><b>{r.HorseName} · {r.Description.split(/[.,]/)[0]}</b>
              <small>{fmtDateTime(r.ReportedAt)} · {r.Severity === 'Urgent' ? 'Khẩn' : 'Thông thường'}{r.VetName ? ` · BS. ${r.VetName}` : ''}{r.VetNote ? ` · ${r.VetNote}` : ''}</small></div><Badge kind={kind}>{text}</Badge></Link>
          })}</div>
      </div>
    </section>
  </main>
}

// ====================================================================== Chi tiết báo cáo sức khỏe (nhân sự)
/** Người gửi báo cáo và người được báo (Huấn luyện viên trưởng, Huấn luyện viên, người chăm sóc) xem tiến trình xử lý, bổ sung ghi chú. */
export function StaffReportDetailPage() {
  const { reportId } = useParams()
  const data = useLoad(() => med.report(reportId), [reportId])
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState('')
  const act = useAction()
  const r = data.data
  if (data.loading) return <main className="page-content f1"><Loading /></main>
  if (data.error) return <main className="page-content f1"><Crumb items={[['Báo cáo sức khỏe', '/health-reports'], ['Chi tiết']]} /><Notice kind="bad">{errorText(data.error)}</Notice></main>
  const [kind, text] = STAFF_STATUS[r.Status] || ['draft', r.Status]
  async function addNote(e) {
    e.preventDefault()
    const msg = checkText(note, 2000)
    setNoteError(msg)
    if (msg) return
    await act.run(async () => { await med.addNote(r.HealthReportID, note.trim()); setNote(''); data.reload() })
  }
  const steps = [
    ['done', 'Gửi báo cáo', `${r.ReportedByName} · ${fmtDateTime(r.ReportedAt)}`],
    ...(r.Notes || []).map((n) => ['done', `Ghi chú của ${n.NoteByName}`, `${fmtDateTime(n.NoteAt)} · ${n.Content}`]),
    [r.Status === 'Reported' ? 'current' : 'done', 'Bác sĩ thú y tiếp nhận', r.VetName ? `BS. ${r.VetName}` : 'Chờ bác sĩ thú y tiếp nhận'],
    [r.Status === 'Resolved' ? 'done' : r.Status === 'Reviewing' ? 'current' : '', 'Hoàn tất xử lý', r.ResolvedAt ? `${fmtDateTime(r.ResolvedAt)}${r.VetNote ? ` · ${r.VetNote}` : ''}` : ''],
  ]
  return <main className="page-content f1">
    <Crumb items={[['Báo cáo sức khỏe', '/health-reports'], [`Báo cáo #${r.HealthReportID}`]]} />
    <Heading title={`Báo cáo sức khỏe #${r.HealthReportID}`} />
    <section className="panel"><div className="two">
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><HorseThumb horseId={r.HorseID} size={56} />
          <div style={{ flex: 1 }}><b style={{ fontSize: 17 }}>{r.HorseName}</b><div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <Badge kind={kind}>{text}</Badge>{r.Severity === 'Urgent' ? <Badge kind="bad">Khẩn</Badge> : <Badge kind="draft">Thông thường</Badge>}</div></div></div>
        <div style={{ marginTop: 16 }}><Dl cols={2} items={[['Người báo cáo', r.ReportedByName], ['Thời điểm báo cáo', fmtDateTime(r.ReportedAt)],
          ['Bác sĩ xử lý', r.VetName ? `BS. ${r.VetName}` : 'Chưa tiếp nhận'], ['Hoàn tất lúc', r.ResolvedAt ? fmtDateTime(r.ResolvedAt) : '—'],
          ['Triệu chứng / mô tả', r.Description, true], r.VetNote && ['Kết luận xử lý', r.VetNote, true]]} /></div>
        <ReportAttachments attachments={r.Attachments} />
      </div>
      <div className="card"><SectionTitle icon="clock">Tiến trình xử lý</SectionTitle>
        <Timeline steps={steps} />
        {r.Status !== 'Resolved' && <form onSubmit={addNote} noValidate style={{ marginTop: 16 }}>
          <TextArea label="Bổ sung báo cáo" value={note} onChange={(v) => { setNote(v); setNoteError('') }} error={noteError} rows={3} maxLength={2000} />
          {act.error && <Notice kind="bad" style={{ marginTop: 10 }}>{act.error}</Notice>}
          <div className="actions"><button type="submit" className="btn pri" disabled={act.busy}>{act.busy ? 'Đang gửi...' : 'Gửi ghi chú'}</button></div>
        </form>}
      </div>
    </div></section>
  </main>
}

// ====================================================================== CN-01
const FEED_TABS = [['all', 'Tất cả'], ['health', 'Sức khỏe và khóa tập'], ['plan', 'Giáo án'], ['session', 'Buổi tập']]
const kindOf = (n) => (/LOCK|HEALTH|STOPPED|RELEASE/.test(n.Type) ? 'health' : /PLAN|STAGE/.test(n.Type) ? 'plan' : 'session')

export function OwnerActivityFeedPage() {
  const data = useLoad(async () => {
    const [notes, horses] = await Promise.all([getNotifications(), med.horses()])
    const locks = {}
    const sessions = {}
    await Promise.all([...new Set(notes.filter((n) => n.Type === 'OWNER_SESSIONS_REVIEWED').map((n) => n.HorseID))].map(async (id) => {
      sessions[id] = list(await apiGet(`/owner/horses/${id}/training-sessions`).catch(() => [])) }))
    return { notes, horses, locks, sessions }
  }, [])
  const [tab, setTab] = useState('all')
  const [horse, setHorse] = useState('')
  if (data.loading) return <main className="page-content f1"><Loading /></main>
  if (data.error) return <main className="page-content f1"><Notice kind="bad" style={{ marginTop: 30 }}>{errorText(data.error)}</Notice></main>
  const { notes, horses, locks, sessions } = data.data
  const feed = notes.filter((n) => n.HorseID && (!horse || String(n.HorseID) === horse))
  const shown = feed.filter((n) => tab === 'all' || kindOf(n) === tab)
  return <main className="page-content f1">
    <Crumb items={[['Hoạt động huấn luyện']]} />
    <Heading title="Hoạt động huấn luyện" />
    <section className="panel">
      <div className="toolbar"><Tabs value={tab} onChange={setTab} tabs={FEED_TABS.map(([k, l]) => [k, l, k === 'all' ? feed.length : feed.filter((n) => kindOf(n) === k).length])} />
        <select className="input" style={{ marginLeft: 'auto', width: 220 }} value={horse} onChange={(e) => setHorse(e.target.value)} aria-label="Ngựa">
          <option value="">Tất cả ngựa</option>{horses.map((h) => <option key={h.HorseID} value={h.HorseID}>{h.HorseName}</option>)}</select></div>
      {!shown.length ? <p className="empty">Chưa có hoạt động huấn luyện.</p> : shown.map((n) => <FeedItem key={n.Key} n={n} lock={locks[n.EntityID]} sessions={sessions[n.HorseID]} />)}
      <div className="actions" style={{ justifyContent: 'flex-start' }}>{horses.map((h) => <Link key={h.HorseID} className="btn sec sm" to={`/owner/horses/${h.HorseID}/training`}>
        <HorseThumb horseId={h.HorseID} size={22} /> Hoạt động của {h.HorseName}</Link>)}</div>
    </section>
  </main>
}

function parseLock(n) {
  const parts = Object.fromEntries(String(n.Message || '').split(' · ').map((p) => { const i = p.indexOf(': '); return i > 0 ? [p.slice(0, i), p.slice(i + 2)] : ['Ghi chú', p] }))
  return { LockLevel: /giới hạn|tập nhẹ/i.test(n.Title) ? 'Restricted' : 'Full', Reason: parts['Lý do'], LockEndDate: null, EndText: parts['Dự kiến đến'],
    MaxIntensity: parts['Mức tải tối đa'], Details: parts['Ghi chú'], LockStartDate: n.At, LockStatus: /mở khóa/i.test(n.Title) ? 'Released' : 'Active' }
}

function FeedItem({ n, lock: fetched, sessions }) {
  const lock = fetched || (n.EntityName === 'TrainingLock' && /TRAINING_LOCKED/.test(n.Type) ? parseLock(n) : null)
  if (n.EntityName === 'TrainingLock' && lock) {
    const full = lock.LockLevel === 'Full'
    return <div className={`card feed ${full ? 'bad' : 'warm'}`}><span className={`sicon ${full ? 'bad' : 'warn'}`}><Icon name="shield" /></span><div>
      <p className="stage-eyebrow">{full ? 'KHÓA TẬP' : 'GIỚI HẠN MỨC TẬP'}</p><h3>{n.HorseName} {full ? 'bị khóa tập toàn bộ' : 'được tập nhẹ'}</h3>
      <dl className="dl four"><div><dt>Lý do</dt><dd>{lock.Reason}</dd></div><div><dt>{full ? 'Mức khóa' : 'Mức tải tối đa'}</dt><dd>{full ? `${LOCK_LEVEL.Full}, không được tập` : lock.MaxIntensity}</dd></div>
        <div><dt>Từ ngày</dt><dd>{fmtDate(lock.LockStartDate)}</dd></div><div><dt>Dự kiến mở</dt><dd>{lock.EndText || fmtDate(lock.LockEndDate)}</dd></div>
        {lock.CreatedByName && <div><dt>Bác sĩ thú y</dt><dd>BS. {lock.CreatedByName}</dd></div>}{lock.Details && <div className="full"><dt>Ghi chú</dt><dd>{lock.Details}</dd></div>}</dl>
      <div className="feed-foot"><small>{fmtDateTime(n.At)}</small>{lock.LockStatus !== 'Active' && <Badge kind="arch">Đã mở khóa</Badge>}
        <Link className="link" to={`/owner/horses/${n.HorseID}`}>Xem hồ sơ của {n.HorseName}</Link></div></div></div>
  }
  if (n.Type === 'OWNER_SESSIONS_REVIEWED') {
    const s = (sessions || []).find((x) => x.Evaluation && !x.AwaitingReview && x.SessionDate <= String(n.At).slice(0, 10))
    return <div className="card feed"><span className="sicon"><Icon name="check" /></span><div>
      <p className="stage-eyebrow">BUỔI TẬP</p><h3>{s ? `${n.HorseName} hoàn thành buổi ${String(s.TrainingType).toLowerCase()}${s.DistanceKm ? ` ${String(s.DistanceKm).replace('.', ',')} km` : ''}` : `${n.HorseName} có buổi tập mới được đánh giá`}</h3>
      {s && <dl className="dl four"><div><dt>Điểm hiệu suất</dt><dd>{s.PerformanceScore ?? '—'}</dd></div><div><dt>Đánh giá của huấn luyện viên</dt><dd>{EVALUATION[s.Evaluation]}</dd></div><div><dt>Ngày tập</dt><dd>{fmtDate(s.SessionDate)}</dd></div></dl>}
      <div className="feed-foot"><small>{fmtDateTime(n.At)}</small><Link className="link" to={s ? `/owner/horses/${n.HorseID}/training/sessions/${s.TrainingSessionID}` : `/owner/horses/${n.HorseID}/training`}>Xem kết quả buổi tập</Link></div></div></div>
  }
  const isPlan = kindOf(n) === 'plan'
  return <div className={`card feed ${n.Priority === 'High' ? 'warm' : ''}`}><span className="sicon"><Icon name={isPlan ? 'file' : n.Type.includes('STOPPED') ? 'heart' : 'cal'} /></span><div>
    <p className="stage-eyebrow">{isPlan ? 'GIÁO ÁN' : kindOf(n) === 'health' ? 'SỨC KHỎE' : 'BUỔI TẬP'}</p><h3>{n.Title}{n.HorseName ? ` · ${n.HorseName}` : ''}</h3>
    {n.Message && <p style={{ margin: '4px 0 0', color: '#4a4f40' }}>{n.Message}</p>}
    <div className="feed-foot"><small>{fmtDateTime(n.At)}</small><Link className="link" to={isPlan ? `/owner/horses/${n.HorseID}/training/plans` : `/owner/horses/${n.HorseID}/training`}>{isPlan ? 'Xem giáo án' : 'Xem hoạt động'}</Link></div></div></div>
}

