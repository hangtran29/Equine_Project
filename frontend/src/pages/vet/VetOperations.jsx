import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useVetMutation as useMutation } from './useVetMutation.jsx'
import { clubToday, clubTimezone, dueGroup, examLabels, medicalEvents, scheduleTypes, vetDate, vetDateTime } from './vetDomain.js'
import { useVetResource } from './useVetResource.js'
import CalendarEventEditor from './CalendarEventEditor.jsx'
import VetLoading from './VetLoading.jsx'
import useClinicalWarning from './useClinicalWarning.js'
import { Field } from '../../components/common/OperationUI.jsx'
import { ReportAttachments } from '../HealthReportsPage.jsx'

export function ResourceState({ data, children }) {
  if (data.loading) return <VetLoading label="Đang tải dữ liệu…" />
  if (data.error) return <div role="alert"><p>{data.error}</p><button className="button button-secondary" type="button" onClick={data.reload}>Thử lại</button></div>
  return children
}


const lockLabel = { Full: 'Khóa toàn bộ', Restricted: 'Giới hạn cường độ' }
export function LockBadge({ lock }) {
  return lock ? <span className={`vet-pill training-${lock.LockLevel === 'Full' ? 'Not-Eligible' : 'Restricted'}`}>⚑ {lockLabel[lock.LockLevel]}{lock.LockLevel === 'Restricted' ? ` · Tải tối đa ${lock.MaxIntensity}` : ''}</span> : null
}

export function TrainingLocks({ horse, currentUser, compact = false, onChanged = undefined }) {
  const data = useVetResource(`/training-locks?HorseID=${encodeURIComponent(horse.id)}`)
  const action = useMutation(() => { data.reload(); onChanged?.() })
  const [open, setOpen] = useState(false)
  const [level, setLevel] = useState('Full')
  const active = data.rows.find(l => l.LockStatus === 'Active')
  const canManage = currentUser.permissions.includes('TRAINING_LOCK_MANAGE') && horse.profileStatus === 'APPROVED'
  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const level = form.get('level')
    const body = { LockLevel: level, MaxIntensity: level === 'Restricted' ? Number(form.get('max')) : null,
      ...(!active ? { Reason: String(form.get('reason') || '').trim(), Details: String(form.get('details') || '').trim() } : {}) }
    if ((!active && !body.Reason) || (level === 'Restricted' && (form.get('max') === '' || Number(form.get('max')) < 0))) return
    if (await action.run(active ? `/training-locks/${active.TrainingLockID}` : `/horses/${horse.id}/training-locks`, body, !!active)) setOpen(false)
  }
  if (horse.profileStatus !== 'APPROVED') return <section className="panel vet-lock-panel"><h2>Huấn luyện</h2><p>Lệnh khóa huấn luyện áp dụng sau khi ngựa được tiếp nhận. Điều kiện tập được ghi riêng trong kết luận khám.</p></section>
  return <section className="panel vet-lock-panel">
    <h2>{compact ? 'Khóa tập khẩn cấp' : 'Khóa và hạn chế huấn luyện'}</h2>
    <ResourceState data={data}>
      {active ? <><LockBadge lock={active} /><p>{active.Reason}</p><p>{active.CreatedByName} · Hiệu lực từ {vetDateTime(active.LockStartDate)}</p><p className="vet-preserve">{active.Details}</p>{active.LockEndDate && <p role="note">Khóa có ngày kết thúc dự kiến {vetDateTime(active.LockEndDate)}. Cần đối chiếu hiệu lực và tái khám trước khi xếp tập.</p>}</> : <p>Chưa có khóa tập đang hoạt động được ghi nhận. Điều kiện tập theo bệnh án được xem riêng.</p>}
      {canManage && <button className="button vet-emergency" type="button" disabled={action.busy} onClick={() => { setLevel(active?.LockLevel || 'Full'); setOpen(!open) }}>{open ? 'Đóng biểu mẫu' : active ? 'Điều chỉnh khóa tập' : 'Khóa tập khẩn cấp'}</button>}
      {open && canManage && <form onSubmit={submit} className="vet-operation-form" key={active?.TrainingLockID || 'new'}><fieldset disabled={action.busy} className="vet-form-fields">
        {!active && <label className="form-field"><span>Lý do khóa</span><input name="reason" required maxLength={100} /></label>}
        <label className="form-field"><span>Mức hạn chế</span><select name="level" value={level} onChange={e => setLevel(e.target.value)}><option value="Full">Khóa toàn bộ</option><option value="Restricted">Giới hạn cường độ</option></select></label>
        {level === 'Restricted' && <label className="form-field"><span>Tải tập tối đa (cùng thang tải của buổi tập)</span><input name="max" type="number" min="0" max="99999999.99" step="0.01" required defaultValue={active?.MaxIntensity ?? ''} /></label>}
        {!active && <label className="form-field"><span>Ghi chú / giới hạn cụ thể</span><textarea name="details" maxLength={2000} /></label>}
        <p>Áp dụng ngay. Các buổi đã phân công trong phạm vi khóa có thể bị hủy; lịch sử được giữ lại.</p>
        <button className="button vet-emergency" disabled={action.busy}>{action.busy ? 'Đang áp dụng…' : 'Áp dụng khóa tập'}</button>
      </fieldset></form>}
      {active && canManage && !compact && <form className="vet-operation-form" onSubmit={async e => { e.preventDefault(); const note = new FormData(e.currentTarget).get('note').trim(); if (note) await action.run(`/training-locks/${active.TrainingLockID}/release`, { Note: note }) }}><label className="form-field"><span>Lý do mở khóa · cần kết luận tái khám hợp lệ</span><textarea name="note" maxLength={1000} required /></label><button className="button button-secondary" disabled={action.busy}>Mở khóa sau tái khám</button></form>}
      {!compact && data.rows.filter(l => l.LockStatus === 'Released').map(l => <article className="vet-amendment" key={l.TrainingLockID}><strong>Đã mở khóa · {lockLabel[l.LockLevel]}</strong><p>{l.Reason}</p><p>Bác sĩ mở: {l.ReleasedByVetID} · {vetDateTime(l.ReleasedAt)}</p><p>{l.Details}</p></article>)}
    </ResourceState>{action.feedback}
  </section>
}

const statusLabels = { Scheduled: 'Đã lên lịch', Completed: 'Đã hoàn thành', Overdue: 'Quá hạn', Cancelled: 'Đã hủy' }
export function VetCalendar({ horses, currentUser, horseId }) {
  const vaccinations = useVetResource(horseId ? `/horses/${horseId}/vaccinations` : '/vaccinations')
  const schedules = useVetResource(horseId ? `/horses/${horseId}/medical-schedules` : '/medical-schedules')
  const [params, setParams] = useSearchParams()
  const group = params.get('due') || 'all'
  const type = params.get('kind') || ''
  const selectedHorse = horseId || params.get('horse') || ''
  const from = params.get('from') || ''
  const to = params.get('to') || ''
  const eventStatus = params.get('state') || ''
  function filterEvent(key, value) { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next) }
  const [creating, setCreating] = useState(false)
  const [kind, setKind] = useState('Vaccination')
  const [view, setView] = useState('list')
  const action = useMutation(() => { vaccinations.reload(); schedules.reload() })
  const canManage = currentUser.permissions.includes('MEDICAL_MANAGE')
  const boosters = vaccinations.rows.filter(v => v.Status === 'Completed' && v.NextDueDate
    && (!eventStatus || eventStatus === 'Scheduled')
    && (!selectedHorse || String(v.HorseID) === selectedHorse) && (!type || type === 'Vaccination')
    && (!from || v.NextDueDate >= from) && (!to || v.NextDueDate <= to)
    && (group === 'all' || group === dueGroup(v.NextDueDate)))
  const rows = medicalEvents(vaccinations.rows, schedules.rows).filter(row => (!type || (type === 'Vaccination' ? row.kind === 'vaccination' : row.ScheduleType === type)) && (!selectedHorse || String(row.HorseID) === selectedHorse) && (!from || row.day >= from) && (!to || row.day <= to) && (!eventStatus || row.Status === eventStatus)).filter(row => group === 'all' || (group === 'completed' ? row.Status === 'Completed' : ['Scheduled', 'Overdue'].includes(row.Status) && (group === 'overdue' ? row.Status === 'Overdue' || dueGroup(row.day) === 'overdue' : row.Status !== 'Overdue' && dueGroup(row.day) === group)))
  async function create(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const id = horseId || values.get('horse')
    const body = { Status: 'Scheduled', Note: values.get('Note').trim(), ...(kind === 'Vaccination' ? { VaccineName: values.get('VaccineName').trim(), VaccinationDate: values.get('VaccinationDate'), NextDueDate: values.get('NextDueDate') || null } : { ScheduleType: kind, ScheduledDate: values.get('ScheduledDate') }) }
    if (await action.run(`/horses/${id}/${kind === 'Vaccination' ? 'vaccinations' : 'medical-schedules'}`, body)) setCreating(false)
  }
  return <section className="panel">
    <h2>Lịch y tế</h2><p>Giờ CLB {clubTimezone}. Ngày tiêm nhắc lại được lưu theo chỉ định; không tự tạo chu kỳ hoặc lịch trùng.</p>
    <div className="vet-toolbar"><label className="form-field"><span>Lọc thời hạn</span><select value={group} onChange={e => { const next = new URLSearchParams(params); next.set('due', e.target.value); setParams(next) }}>{Object.entries({ all: 'Tất cả', overdue: 'Quá hạn', today: 'Hôm nay', upcoming: 'Sắp tới', completed: 'Đã hoàn thành' }).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label><label className="form-field"><span>Loại công việc</span><select value={type} onChange={e => filterEvent('kind', e.target.value)}><option value="">Tất cả</option><option value="Vaccination">Tiêm phòng</option>{Object.entries(scheduleTypes).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      {!horseId && <label className="form-field"><span>Ngựa</span><select value={selectedHorse} onChange={e => filterEvent('horse', e.target.value)}><option value="">Tất cả ngựa</option>{horses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>}
      <label className="form-field"><span>Trạng thái</span><select value={eventStatus} onChange={e => filterEvent('state', e.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(statusLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="form-field"><span>Từ ngày</span><input type="date" value={from} max={to || undefined} onChange={e => filterEvent('from', e.target.value)} /></label>
      <label className="form-field"><span>Đến ngày</span><input type="date" value={to} min={from || undefined} onChange={e => filterEvent('to', e.target.value)} /></label>
      <button type="button" className="button button-secondary" onClick={() => setView(view === 'list' ? 'days' : 'list')}>{view === 'list' ? 'Nhóm theo ngày' : 'Xem danh sách'}</button>{canManage && <button type="button" className={creating ? "button button-secondary" : "button"} onClick={() => setCreating(!creating)}>{creating ? 'Đóng biểu mẫu' : 'Đặt lịch y tế'}</button>}</div>
    {creating && <form onSubmit={create} className="vet-operation-form"><fieldset disabled={action.busy} className="vet-form-fields">
      {!horseId && <label className="form-field"><span>Ngựa</span><select name="horse" required><option value="">Chọn ngựa</option>{horses.filter(h => h.profileStatus === 'APPROVED').map(h => <option key={h.id} value={h.id}>{h.name} · {h.code || h.microchipNumber || 'Chưa cấp mã'}</option>)}</select></label>}
      <label className="form-field"><span>Loại công việc</span><select value={kind} onChange={e => setKind(e.target.value)}><option value="Vaccination">Tiêm phòng</option>{Object.entries(scheduleTypes).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      {kind === 'Vaccination' && <><Field label="Tên vắc xin theo chỉ định" name="VaccineName" action={action} required maxLength={150} /><Field label="Ngày tiêm nhắc lại theo chỉ định (không tự tạo lịch)" name="NextDueDate" type="date" action={action} /></>}
      <Field label="Ngày đến hạn" name={kind === 'Vaccination' ? 'VaccinationDate' : 'ScheduledDate'} type="date" required action={action} /><Field label="Ghi chú" name="Note" multiline maxLength={1000} action={action} /><button className="button" disabled={action.busy}>Lưu lịch</button>
    </fieldset></form>}
    {action.feedback}
    {!!boosters.length && <div className="vet-event-list"><h3>Mốc tiêm nhắc lại đã được chỉ định</h3>{boosters.map(v => <article className="vet-event" key={`booster-${v.VaccinationID}`}><time>{vetDate(v.NextDueDate)}</time><div><strong>{v.HorseName} · {v.VaccineName}</strong><p>{({ overdue: 'Quá hạn nhắc lại', today: 'Đến hạn hôm nay', upcoming: 'Sắp đến hạn' })[dueGroup(v.NextDueDate)]} · Ngày chỉ định, chưa xác nhận đã tiêm mũi tiếp theo.</p></div></article>)}</div>}
    <ResourceState data={vaccinations}><ResourceState data={schedules}>
      {!rows.length && <p className="vet-empty">Không có lịch phù hợp.</p>}
      <div className={view === 'days' ? 'vet-calendar-days' : 'vet-event-list'}>{rows.map(row => <article className="vet-event" id={row.key} data-selected={params.get('event') === row.key || undefined} key={row.key}><time>{vetDate(row.day)}</time><div><Link to={`/vet/horses/${row.HorseID}?tab=calendar`}><strong>{row.HorseName}</strong></Link><p>{row.label}</p><span className={`vet-pill due-${row.Status === 'Completed' ? 'completed' : row.Status === 'Overdue' ? 'overdue' : dueGroup(row.day)}`}>{statusLabels[row.Status]}{row.Status === 'Scheduled' && dueGroup(row.day) === 'overdue' ? ' · Quá hạn' : ''}</span><p>Bác sĩ: {row.VetName || 'Chưa xác định'}</p>{row.NextDueDate && <p>Nhắc lại theo chỉ định: {row.NextDueDate}</p>}<p className="vet-preserve">{row.Note}</p></div>
        {canManage && <CalendarEventEditor row={row} onChanged={() => { vaccinations.reload(); schedules.reload() }} />}
      </article>)}</div>
    </ResourceState></ResourceState>
    <p className="vet-caption">Theo dõi nhắc hạn trong mục Thông báo. Nhắc trong ứng dụng và email là hai kênh riêng.</p>
  </section>
}

export function VetReports({ horses, currentUser }) {
  const data = useVetResource('/health-reports')
  const [params, setParams] = useSearchParams()
  const severity = params.get('severity') || ''
  const status = params.get('status') || 'open'
  const canManage = currentUser.permissions.includes('MEDICAL_MANAGE')
  const search = params.get('q') || ''
  const rows = data.rows.filter(r => !search || [r.HorseName, r.Description, r.ReportedByName].some(v => v?.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()))).filter(r => (!params.get('report') || String(r.HealthReportID) === params.get('report')) && (!severity || r.Severity === severity) && (status === 'all' || (status === 'open' ? r.Status !== 'Resolved' : r.Status === status))).sort((a, b) => (a.Severity === 'Urgent' ? 0 : 1) - (b.Severity === 'Urgent' ? 0 : 1) || a.ReportedAt.localeCompare(b.ReportedAt))
  function filter(key, value) { const next = new URLSearchParams(params); next.set(key, value); setParams(next) }
  return <section className="panel"><h2>Tiếp nhận báo cáo sức khỏe</h2><div className="vet-toolbar"><label className="form-field"><span>Tìm báo cáo</span><input type="search" placeholder="Tên ngựa, triệu chứng, người báo" value={search} onChange={e => filter('q', e.target.value)} /></label><label className="form-field"><span>Mức độ</span><select value={severity} onChange={e => filter('severity', e.target.value)}><option value="">Tất cả mức độ</option><option value="Urgent">Khẩn</option><option value="Normal">Thông thường</option></select></label><label className="form-field"><span>Tiến trình</span><select value={status} onChange={e => filter('status', e.target.value)}>{Object.entries({ open: 'Chưa xử lý xong', all: 'Tất cả', Reported: 'Chờ nhận', Reviewing: 'Đang xử lý', Resolved: 'Đã xử lý' }).map(([v, l]) => <option value={v} key={v}>{l}</option>)}</select></label><></></div><ResourceState data={data}>{!rows.length && <p className="vet-empty">Không có báo cáo phù hợp.</p>}{rows.map(r => <ReportCard key={r.HealthReportID} report={r} horse={horses.find(h => String(h.id) === String(r.HorseID))} currentUser={currentUser} canManage={canManage} reload={data.reload} />)}</ResourceState></section>
}

function ReportCard({ report: r, horse, currentUser, canManage, reload }) {
  const action = useMutation(reload)
  const [showLock, setShowLock] = useState(false)
  const base = `/health-reports/${r.HealthReportID}`
  const examUrl = `/vet/horses/${r.HorseID}/examination?${r.MedicalRecordID ? `record=${r.MedicalRecordID}` : `report=${r.HealthReportID}`}`
  const owns = !r.VetID || String(r.VetID) === currentUser.id
  return <article className={`vet-report ${r.Severity === 'Urgent' ? 'vet-report-urgent' : ''}`}><div className="vet-toolbar"><Link to={`/vet/horses/${r.HorseID}`}><strong>{r.HorseName}</strong></Link><span className={`vet-pill ${r.Severity === 'Urgent' ? 'due-overdue' : ''}`}>{r.Severity === 'Urgent' ? '⚠ Khẩn' : 'Thông thường'}</span><span className="vet-pill">{({ Reported: 'Chờ nhận', Reviewing: 'Đang xử lý', Resolved: 'Đã xử lý' })[r.Status]}</span></div><p>{r.ReportedByName} · {vetDateTime(r.ReportedAt)}</p><p className="vet-preserve">{r.Description}</p>{r.ImageUrl && <ReportImage url={r.ImageUrl} />}{r.TrainingSessionID && <p>Buổi tập liên quan: #{r.TrainingSessionID}</p>}<p>Bác sĩ xử lý: {r.VetName || 'Chưa nhận'}</p>{r.VetNote && <p>Kết luận xử lý: {r.VetNote}</p>}{r.ResolvedAt && <p>Hoàn tất: {vetDateTime(r.ResolvedAt)}</p>}
    {r.MedicalRecordID && (r.Status === 'Resolved' || !canManage || !owns) && <Link to={examUrl}>Xem phiếu khám #{r.MedicalRecordID}</Link>}
    {r.Notes?.map(n => <p key={n.HealthReportNoteID} className="vet-amendment">{n.NoteByName} · {vetDateTime(n.NoteAt)}<br />{n.Content}</p>)}
    <ReportAttachments attachments={r.Attachments} />
    {canManage && r.Status !== 'Resolved' && <><div className="vet-toolbar">{r.Status === 'Reported' && <button className="button" disabled={action.busy} onClick={() => action.run(`${base}/take`, {})}>Nhận xử lý</button>}{r.Status === 'Reviewing' && owns && <Link className="button" to={examUrl}>{r.MedicalRecordID ? 'Mở bệnh án liên quan' : 'Tạo phiếu khám'}</Link>}{horse && currentUser.permissions.includes('TRAINING_LOCK_MANAGE') && <button type="button" className="button vet-emergency" onClick={() => setShowLock(!showLock)}>Khóa tập khẩn cấp</button>}</div>
      {showLock && horse && <TrainingLocks horse={horse} currentUser={currentUser} compact />}
      <form className="vet-operation-form" onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const content = new FormData(form).get('content').trim(); if (content && await action.run(`${base}/notes`, { Content: content })) form.reset() }}><label className="form-field"><span>Diễn biến / ghi chú xử lý</span><textarea name="content" required maxLength={2000} /></label><button className="button button-secondary" disabled={action.busy}>Thêm ghi chú</button></form>
      {r.Status === 'Reviewing' && owns && <form className="vet-operation-form" onSubmit={e => { e.preventDefault(); const note = new FormData(e.currentTarget).get('note').trim(); if (note) void action.run(`${base}/resolve`, { VetNote: note }) }}><label className="form-field"><span>Kết luận xử lý (chỉ đóng khi đã xử lý thực tế)</span><textarea name="note" required maxLength={2000} /></label><button className="button button-secondary" disabled={action.busy}>Hoàn tất xử lý báo cáo</button></form>}
    </>}{action.feedback}</article>
}

function ReportImage({ url }) {
  const [failed, setFailed] = useState(false)
  if (!/^https?:\/\//i.test(url)) return null
  return <a className="vet-report-photo" href={url} target="_blank" rel="noreferrer">{!failed && <img src={url} alt="Ảnh ghi nhận trong báo cáo sức khỏe" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}<span>{failed ? 'Ảnh chưa tải được · Mở ảnh báo cáo' : 'Xem ảnh báo cáo'}</span></a>
}

const routes = { Oral: 'Uống', Injection: 'Tiêm', Topical: 'Bôi ngoài da', Inhalation: 'Hít', Other: 'Khác' }
export function VetTreatments({ horse, records, currentUser, onChanged }) {
  const data = useVetResource(`/horses/${horse.id}/treatments`)
  const [editing, setEditing] = useState(null)
  const [version, setVersion] = useState(0)
  const [dirty, setDirty] = useState(false)
  useClinicalWarning(dirty)
  const action = useMutation(() => { setDirty(false); setEditing(null); setVersion(v => v + 1); data.reload(); onChanged?.() })
  const drafts = records.filter(r => r.recordStatus === 'Draft' && r.vetId === currentUser.id)
  const canManage = currentUser.permissions.includes('MEDICAL_MANAGE')
  function editor(treatment) {
    const signed = treatment && records.find(r => r.id === String(treatment.MedicalRecordID))?.recordStatus === 'Signed'
    return <form key={treatment?.TreatmentID || `new-${version}`} className="vet-operation-form" onChangeCapture={() => setDirty(true)} onSubmit={e => {
      e.preventDefault()
      const f = new FormData(e.currentTarget)
      const body = { EndDate: f.get('EndDate') || null, WithdrawalUntil: f.get('WithdrawalUntil') || null,
        ...(!signed ? { MedicineName: f.get('MedicineName').trim(), Dose: f.get('Dose').trim(), Route: f.get('Route'), StartDate: f.get('StartDate'), Note: f.get('Note').trim() } : {}) }
      void action.run(treatment ? `/treatments/${treatment.TreatmentID}` : `/medical-records/${f.get('record')}/treatments`, body, !!treatment)
    }}><h3>{treatment ? 'Cập nhật thuốc' : 'Thêm thuốc vào phiếu nháp của bạn'}</h3><fieldset className="vet-form-fields" disabled={action.busy}>
      {!treatment && <Field label="Phiếu khám" name="record" required options={drafts.map(r => [r.id, `#${r.id} · ${examLabels[r.examType] || 'Lần khám'}`])} />}
      {signed ? <p>Phiếu đã chốt: chỉ cập nhật ngày kết thúc và thời gian ngưng thuốc.</p> : <>
        <Field label="Tên thuốc" name="MedicineName" action={action} required maxLength={150} defaultValue={treatment?.MedicineName || ''} />
        <Field label="Liều kèm đơn vị" name="Dose" action={action} required maxLength={100} defaultValue={treatment?.Dose || ''} />
        <Field label="Đường dùng" name="Route" action={action} options={Object.entries(routes)} defaultValue={treatment?.Route || 'Oral'} />
        <Field label="Ngày bắt đầu" name="StartDate" action={action} type="date" required defaultValue={treatment?.StartDate || ''} />
        <Field label="Tần suất và hướng dẫn dùng thuốc" name="Note" action={action} multiline required maxLength={1000} defaultValue={treatment?.Note || ''} />
      </>}
      <Field label="Ngày kết thúc" name="EndDate" action={action} type="date" min={signed ? treatment.StartDate : undefined} defaultValue={treatment?.EndDate || ''} />
      <Field label="Ngưng thuốc đến (theo chỉ định)" name="WithdrawalUntil" action={action} type="date" min={signed ? treatment.StartDate : undefined} defaultValue={treatment?.WithdrawalUntil || ''} />
      {action.feedback}<button className="button">{action.busy ? 'Đang lưu…' : treatment ? 'Lưu cập nhật thuốc' : 'Lưu thuốc vào phiếu nháp'}</button>
      {treatment && <button className="button button-secondary" type="button" onClick={() => { setEditing(null); setDirty(false) }}>Hủy chỉnh sửa</button>}
    </fieldset></form>
  }
  return <section className="panel"><div className="vet-toolbar"><h2>Điều trị và đơn thuốc</h2><button className="button button-secondary" disabled={data.loading || action.busy} onClick={data.reload}>Làm mới đơn thuốc</button></div>
    <ResourceState data={data}>{!data.rows.length && <p>Chưa có thuốc được ghi nhận.</p>}{data.rows.map(t => {
      const record = records.find(r => r.id === String(t.MedicalRecordID))
      const canEdit = canManage && record?.recordStatus === 'Draft' && record.vetId === currentUser.id
      return <article className="vet-amendment" key={t.TreatmentID}><strong>{t.MedicineName} · Phiếu #{t.MedicalRecordID} · {record?.recordStatus === 'Draft' ? 'Nháp' : record?.recordStatus === 'Signed' ? 'Đã chốt' : 'Chưa xác định trạng thái'}</strong><p>Liều và đơn vị: {t.Dose} · Đường dùng: {routes[t.Route] || 'Chưa ghi nhận'}</p><p>{vetDate(t.StartDate)} → {t.EndDate ? vetDate(t.EndDate) : 'Chưa ghi ngày kết thúc'}</p>{t.WithdrawalUntil && <p>Ngưng thuốc đến: {vetDate(t.WithdrawalUntil)}{t.WithdrawalActive ? ' · Còn trong thời gian ngưng thuốc' : ''}</p>}<p>{t.Note}</p>
        {canEdit && <button className="button button-secondary" disabled={action.busy} onClick={() => setEditing(t.TreatmentID)}>Cập nhật thuốc</button>}
        {editing === t.TreatmentID && canEdit && editor(t)}
      </article>
    })}</ResourceState>
    {canManage && drafts.length > 0 && !editing ? editor(null) : canManage && !drafts.length && <p>Lưu một phiếu khám nháp của bạn trước khi thêm thuốc.</p>}
    {action.notice && <p role="status">{action.notice}</p>}<p className="vet-caption">Tần suất được lưu cùng hướng dẫn dùng thuốc. Chưa hỗ trợ xóa riêng thuốc đã lưu; hãy kiểm tra trước khi kê.</p>
  </section>
}

export function VetOperationalOverview({ horses, initialExams, intakeError, intakeLoading }) {
  const locks = useVetResource('/training-locks?LockStatus=Active')
  const reports = useVetResource('/health-reports?open=1')
  const vaccinations = useVetResource('/vaccinations')
  const schedules = useVetResource('/medical-schedules')
  const eventsReady = !vaccinations.loading && !schedules.loading && !vaccinations.error && !schedules.error
  const events = eventsReady ? medicalEvents(vaccinations.rows, schedules.rows).filter(r => ['Scheduled', 'Overdue'].includes(r.Status)) : []
  const pending = events.filter(r => r.Status === 'Overdue' || dueGroup(r.day) === 'overdue')
  const reportsReady = !reports.loading && !reports.error
  const urgent = reports.rows.filter(r => r.Severity === 'Urgent')
  const approved = new Set(horses.map(h => h.id))
  const activeLocks = locks.rows.filter(l => approved.has(String(l.HorseID)))
  const intakeReady = !intakeError && !intakeLoading
  const stats = [
    ['/vet/reports?severity=Urgent', 'Báo cáo khẩn chưa hoàn tất', reportsReady ? urgent.length : 'Chưa có số liệu'],
    ['/vet/horses-needing-exam', 'Hồ sơ chờ khám đầu vào', intakeReady ? initialExams.length : 'Chưa có số liệu'],
    ['/vet/herd?lock=active', 'Ngựa có lệnh khóa tập', !locks.loading && !locks.error ? new Set(activeLocks.map(l => l.HorseID)).size : 'Chưa có số liệu'],
    ['/vet/calendar?due=overdue', 'Lịch y tế quá hạn', eventsReady ? pending.length : 'Chưa có số liệu'],
  ]
  const attention = [
    ...(reportsReady ? reports.rows.map(r => ({ key: 'r-' + r.HealthReportID, name: r.HorseName, reason: r.Description, priority: r.Severity === 'Urgent' ? 'Khẩn' : 'Thông thường', rank: r.Severity === 'Urgent' ? 0 : 3, time: vetDateTime(r.ReportedAt), path: '/vet/reports?report=' + r.HealthReportID + '&status=all', action: r.Status === 'Reported' ? 'Nhận xử lý' : 'Tiếp tục xử lý' })) : []),
    ...(intakeReady ? initialExams.map(e => ({ key: 'i-' + e.requestId, name: e.horse.name, reason: 'Khám đầu vào · Hồ sơ tiếp nhận #' + e.requestId, priority: e.draftMedicalRecordId ? 'Đang khám' : 'Chưa bắt đầu', rank: 2, time: 'Gửi hồ sơ: ' + vetDateTime(e.requestDate), path: '/vet/horses/' + e.horse.id + '/examination', action: e.draftMedicalRecordId ? 'Xem ca khám' : 'Bắt đầu khám' })) : []),
    ...pending.map(e => ({ key: e.key, name: e.HorseName, reason: e.label, priority: 'Quá hạn', rank: 1, time: 'Đến hạn: ' + vetDate(e.day), path: '/vet/horses/' + e.HorseID + '?tab=calendar&event=' + e.key, action: 'Xem lịch' })),
  ].sort((a,b) => a.rank - b.rank)
  return <>
    <section className="vet-stats vet-work-stats" aria-label="Công việc thú y">{stats.map(([path, label, count]) => <Link className="vet-stat" key={path} to={path}><span>{label}</span><strong className={typeof count === 'string' ? 'vet-stat-unavailable' : undefined}>{count}</strong><small>Xem danh sách →</small></Link>)}</section>
    <div className="vet-two-columns"><section className="panel"><div className="vet-record-heading"><h2>Cần xử lý</h2><Link to="/vet/horses-needing-exam">Mở hàng chờ →</Link></div>
      {(reports.loading || intakeLoading || vaccinations.loading || schedules.loading) && <VetLoading label="Đang tổng hợp công việc…" />}
      {reports.error && <div role="alert"><p>Chưa tải được báo cáo sức khỏe.</p><button className="button button-secondary" onClick={reports.reload}>Thử lại báo cáo</button></div>}
      {intakeError && <p role="alert">Chưa tải được hàng chờ khám đầu vào.</p>}
      {(vaccinations.error || schedules.error) && <div role="alert"><p>Chưa tải đủ lịch y tế.</p><button className="button button-secondary" onClick={() => { vaccinations.reload(); schedules.reload() }}>Thử lại lịch y tế</button></div>}
      {!attention.length && reportsReady && eventsReady && intakeReady && <p className="vet-empty">Không có công việc cần xử lý từ hàng chờ, báo cáo và lịch quá hạn.</p>}
      {attention.slice(0, 8).map(row => <article className="vet-attention-row" key={row.key}><div><strong>{row.name}</strong><p>{row.reason}</p><small>{row.time}</small></div><div><span className={'vet-pill ' + (row.rank <= 1 ? 'due-overdue' : '')}>{row.priority}</span><Link className="button button-secondary" to={row.path}>{row.action}</Link></div></article>)}
      {attention.length > 8 && <p className="vet-caption">Đang hiển thị 8 công việc ưu tiên. Mở từng danh sách để xem đầy đủ.</p>}
    </section><section className="panel"><h2>Lệnh khóa và giới hạn tải tập</h2><ResourceState data={locks}>{!activeLocks.length && <p>Chưa ghi nhận lệnh khóa đang hoạt động cho đàn ngựa đã tiếp nhận.</p>}{activeLocks.map(l => <div className="vet-task" key={l.TrainingLockID}><div><Link to={'/vet/horses/' + l.HorseID + '?tab=training'}><strong>{l.HorseName}</strong></Link><p>{l.Reason}</p><small>{l.CreatedByName} · {vetDateTime(l.LockStartDate)}</small><LockBadge lock={l} /></div></div>)}</ResourceState><p className="vet-caption">Lệnh khóa được theo dõi riêng với kết luận điều kiện tập. Không tự mở khóa theo ngày dự kiến.</p></section></div>
    <section className="panel"><h2>Lịch y tế hôm nay và sắp tới</h2><ResourceState data={vaccinations}><ResourceState data={schedules}><div className="vet-toolbar">{['today', 'upcoming'].map(group => <Link key={group} className="button button-secondary" to={'/vet/calendar?due=' + group}>{group === 'today' ? 'Hôm nay' : 'Sắp tới'} · {events.filter(r => r.Status !== 'Overdue' && dueGroup(r.day) === group).length}</Link>)}</div>
      {!events.some(r => r.Status !== 'Overdue' && r.day >= clubToday()) && <p>Không có lịch hôm nay hoặc sắp tới.</p>}
      {events.filter(r => r.Status !== 'Overdue' && r.day >= clubToday()).slice(0, 8).map(r => <Link className="vet-task" key={r.key} to={'/vet/horses/' + r.HorseID + '?tab=calendar&event=' + r.key}><span>{r.HorseName} · {r.label}</span><time>{r.day === clubToday() ? 'Hôm nay' : vetDate(r.day)}</time></Link>)}
    </ResourceState></ResourceState><Link to="/vet/calendar">Xem toàn bộ lịch →</Link></section>
  </>
}
