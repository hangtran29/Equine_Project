// Việc chăm sóc theo ngày.
//  mode="mine": Groom xem việc được giao, bấm Đã làm / Bỏ qua.
//  mode="club": Head Trainer xem việc của cả CLB, giao thêm việc, sinh việc trước cho ngày tới.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { clubDateTimeInput } from '../vet/vetDomain.js'
import {
  completeCareTask, createCareTask, generateCareTasks, getApprovedHorses, getCareTasks, getGrooms, skipCareTask,
} from '../../api/careApi.ts'
import { Badge, CarePage, FieldError, HorsePicker, Loading, Notice } from './careShared.jsx'
import { TASK_STATUS, TASK_TYPES, addDays, fmtDate, fmtTime, todayText, useLoad, useSubmit } from './careUtils.js'

function isOverdue(task) {
  return task.Status === 'Pending' && String(task.ScheduledAt).slice(0, 19) < clubDateTimeInput()
}

function TaskCard({ task, canComplete, canSkip, showGroom, onDone }) {
  const [mode, setMode] = useState('')
  const [text, setText] = useState('')
  const [outcome, setOutcome] = useState('')
  const action = useSubmit()
  async function submit(event) {
    event.preventDefault()
    const ok = mode === 'complete'
      ? await action.run(() => completeCareTask(task.CareTaskID, text.trim(), outcome), 'Đã ghi nhận hoàn thành.')
      : await action.run(() => skipCareTask(task.CareTaskID, text.trim()), 'Đã ghi nhận bỏ qua.')
    if (ok) { setMode(''); setText(''); onDone() }
  }
  const overdue = isOverdue(task)
  return <article className={`care-task${overdue ? ' care-task-overdue' : ''}${task.Status !== 'Pending' ? ' care-task-closed' : ''}`}>
    <time className="care-task-time">{fmtTime(task.ScheduledAt)}</time>
    <div className="care-task-body">
      <div className="care-task-title">
        <strong>{TASK_TYPES[task.TaskType] || task.TaskType}</strong>
        <span className="care-task-horse">{task.HorseName}</span>
        <Badge map={TASK_STATUS} value={task.Status} />
        {overdue && <span className="care-badge care-badge-danger">Quá giờ</span>}
        <span className={`care-badge care-badge-${task.Priority === 'Urgent' ? 'danger' : 'muted'}`}>{task.Priority === 'Urgent' ? 'Khẩn' : 'Thông thường'}</span>
        {!task.IsAuto && <span className="care-badge care-badge-info">Giao thêm</span>}
      </div>
      {task.Note && <p className="care-task-note">{task.Note}</p>}
      {task.OutcomeNote && <p className="care-task-note"><strong>{task.Status === 'Skipped' ? 'Lý do bỏ qua' : 'Ghi nhận của Groom'}:</strong> {task.OutcomeNote}</p>}
      <p className="care-task-meta">
        {showGroom && <>Groom: <b>{task.GroomName || 'Chưa phân công'}</b> · </>}
        Chuồng: {task.StallNumber || 'Chưa xếp'} · {task.Source}{task.AssignedByName && ` · ${task.AssignedByName}`}
        {task.FeedingOutcome && <> · Ăn: {({ All: 'hết', Partial: 'một phần', Refused: 'bỏ ăn' })[task.FeedingOutcome]}</>}
        {task.CompletedAt && <> · Xong lúc {fmtTime(task.CompletedAt)}</>}
      </p>
      {task.Status === 'Pending' && (canComplete || canSkip) && !mode && <div className="care-actions">
        {canComplete && <button className="button" type="button" onClick={() => { setMode('complete'); setText('') }}>Đã làm</button>}
        {canSkip && <button className="button button-secondary" type="button" onClick={() => { setMode('skip'); setText('') }}>Bỏ qua</button>}
      </div>}
      {mode && <form className="care-inline-form" onSubmit={submit}>
        {mode === 'complete' && task.TaskType === 'Feeding' && <label className="form-field"><span>Tình trạng ăn</span><select required value={outcome} onChange={e => setOutcome(e.target.value)}><option value="">Chọn tình trạng</option><option value="All">Ăn hết</option><option value="Partial">Ăn một phần</option><option value="Refused">Bỏ ăn</option></select></label>}
        <label className="form-field"><span>{mode === 'complete' ? 'Ghi chú (không bắt buộc)' : 'Lý do bỏ qua'}</span>
          <input value={text} onChange={e => setText(e.target.value)} maxLength={1000} required={mode === 'skip'} autoFocus
            placeholder={mode === 'complete' ? 'vd Ngựa ăn hết khẩu phần' : 'vd Ngựa đang đi khám, chưa cho ăn được'} />
          <FieldError fields={action.fields} name={mode === 'complete' ? 'Note' : 'Reason'} />
        </label>
        <div className="care-actions">
          <button className="button" type="submit" disabled={action.busy}>
            {action.busy ? 'Đang lưu…' : mode === 'complete' ? 'Xác nhận đã làm' : 'Xác nhận bỏ qua'}</button>
          <button className="button button-secondary" type="button" disabled={action.busy} onClick={() => setMode('')}>Hủy</button>
        </div>
      </form>}
      {action.error && <div className="alert-banner" role="alert">{action.error}</div>}
    </div>
  </article>
}

function ExtraTaskForm({ horses, date, onSaved, currentUser }) {
  const [open, setOpen] = useState(false)
  const vet = currentUser.permissions.includes('MEDICAL_MANAGE')
  const trainer = currentUser.permissions.includes('TRAINING_PLAN_MANAGE')
  const [form, setForm] = useState({ HorseID: '', TaskType: vet ? 'Medical Care' : trainer ? 'Training Support' : 'Cleaning', Time: '08:00', Note: '', MedicalRecordID: '', Priority: 'Normal' })
  const action = useSubmit()
  const set = key => event => setForm(f => ({ ...f, [key]: event.target.value }))
  async function submit(event) {
    event.preventDefault()
    const ok = await action.run(() => createCareTask({
      HorseID: Number(form.HorseID), TaskType: form.TaskType, Priority: form.Priority,
      ...(vet && form.MedicalRecordID ? { MedicalRecordID: Number(form.MedicalRecordID) } : {}),
      ScheduledAt: `${date}T${form.Time}:00`, Note: form.Note.trim() || null,
    }), 'Đã lưu công việc. Việc chưa có Groom sẽ chờ Manager phân công.')
    if (ok) { setForm(f => ({ ...f, Note: '' })); setOpen(false); onSaved() }
  }
  if (!open) return <>
    <button className="button" type="button" onClick={() => { action.clear(); setOpen(true) }}>+ Giao thêm việc</button>
    {action.notice && <span className="care-inline-notice" role="status">{action.notice}</span>}
  </>
  return <form className="panel care-form" onSubmit={submit}>
    <h2>Giao thêm việc ngày {fmtDate(date)}</h2>
    <p className="care-muted">Việc hằng ngày đã được hệ thống tự sinh theo chỉ tiêu. Chỉ giao thêm việc ngoài chỉ tiêu.</p>
    <div className="care-form-grid">
      <label className="form-field"><span>Ngựa</span>
        <select required value={form.HorseID} onChange={set('HorseID')}>
          <option value="">Chọn ngựa</option>
          {horses.map(h => <option key={h.HorseID} value={h.HorseID}>{h.HorseName}</option>)}
        </select><FieldError fields={action.fields} name="HorseID" /></label>
      <p>Hệ thống giao cho Groom đang phụ trách ngựa. Nếu chưa có Groom, Manager sẽ thấy việc chưa phân công.</p>
      {vet && <label className="form-field"><span>Mã phiếu chỉ định (bắt buộc nếu đang khóa tập)</span><input type="number" min="1" value={form.MedicalRecordID} onChange={set('MedicalRecordID')} /><FieldError fields={action.fields} name="MedicalRecordID" /></label>}
      <label className="form-field"><span>Ưu tiên</span><select value={form.Priority} onChange={set('Priority')}><option value="Normal">Thông thường</option><option value="Urgent">Khẩn</option></select></label>
      <label className="form-field"><span>Loại việc</span>
        <select value={form.TaskType} onChange={set('TaskType')}>
          {Object.entries(TASK_TYPES).filter(([value]) => trainer ? value === 'Training Support' : vet || !['Medical Care', 'Ice Leg Soak'].includes(value)).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select></label>
      <label className="form-field"><span>Giờ</span>
        <input type="time" required value={form.Time} onChange={set('Time')} />
        <FieldError fields={action.fields} name="ScheduledAt" /></label>
      <label className="form-field care-span-2"><span>Ghi chú cho Groom</span>
        <input required maxLength={1000} value={form.Note} onChange={set('Note')} placeholder="Hướng dẫn cụ thể cho Groom" /></label>
    </div>
    <Notice state={action} />
    <div className="care-actions">
      <button className="button" type="submit" disabled={action.busy}>{action.busy ? 'Đang lưu…' : 'Giao việc'}</button>
      <button className="button button-secondary" type="button" onClick={() => setOpen(false)}>Đóng</button>
    </div>
  </form>
}

export default function CareTasksPage({ mode = 'mine', currentUser }) {
  const club = mode === 'club'
  const today = todayText()
  const [date, setDate] = useState(today)
  const [status, setStatus] = useState('')
  const [horseId, setHorseId] = useState('')
  const [groomId, setGroomId] = useState('')
  const [taskType, setTaskType] = useState('')
  const [unassigned, setUnassigned] = useState(false)
  const canGenerate = currentUser.permissions.some(p => ['CLUB_MANAGE', 'TRAINER_ASSIGN'].includes(p))
  const tasks = useLoad(() => getCareTasks({ Date: date, mine: !club, GroomID: club ? groomId : undefined, Unassigned: unassigned }), [date, club, groomId, unassigned])
  const lookups = useLoad(() => (club ? Promise.all([getApprovedHorses(), canGenerate ? getGrooms() : Promise.resolve([])]) : Promise.resolve([[], []])), [club, canGenerate])
  const generate = useSubmit()
  const [generated, setGenerated] = useState('')
  const [horses, grooms] = lookups.data || [[], []]
  const rows = useMemo(() => (tasks.data || [])
    .filter(t => (!status || t.Status === status) && (!horseId || String(t.HorseID) === horseId) && (!taskType || t.TaskType === taskType))
    .sort((a, b) => String(a.ScheduledAt).localeCompare(String(b.ScheduledAt))), [tasks.data, status, horseId, taskType])
  const all = useMemo(() => tasks.data || [], [tasks.data])
  const summary = {
    total: all.length, pending: all.filter(t => t.Status === 'Pending').length,
    done: all.filter(t => t.Status === 'Completed').length, overdue: all.filter(isOverdue).length,
  }
  const taskHorses = useMemo(() => {
    const seen = new Map()
    all.forEach(t => seen.set(t.HorseID, { HorseID: t.HorseID, HorseName: t.HorseName }))
    return [...seen.values()].sort((a, b) => a.HorseName.localeCompare(b.HorseName))
  }, [all])
  const canSkip = club || currentUser?.permissions?.includes('CARE_MANAGE')

  async function runGenerate() {
    const result = await generate.run(() => generateCareTasks(date, 1), 'Đã sinh việc.')
    if (Array.isArray(result) && result[0]) {
      const r = result[0]
      generate.clear()
      window.setTimeout(() => tasks.reload(), 0)
      setGenerated(`Ngày ${fmtDate(r.Date)}: thêm ${r.Created} việc, gỡ ${r.Removed} việc cũ${r.Unassigned ? `, ${r.Unassigned} việc chưa có Groom để giao` : ''}.`)
    }
  }
  return <CarePage
    crumb={club ? 'Việc chăm sóc toàn CLB' : 'Việc của tôi'}
    eyebrow={club ? 'HUẤN LUYỆN VIÊN TRƯỞNG' : 'GROOM'}
    title={club ? 'Việc chăm sóc toàn câu lạc bộ' : 'Việc chăm sóc của tôi'}
    description={club
      ? 'Theo dõi công việc trong phạm vi được giao. Việc y tế phát sinh theo chỉ định Vet; việc chưa có Groom được giữ để Manager phân công.'
      : 'Việc được hệ thống tự giao theo khẩu phần, lịch tập và chỉ tiêu của câu lạc bộ. Làm xong bấm "Đã làm"; không làm được thì bấm "Bỏ qua" và ghi lý do.'}
  >
    <section className="filter-card care-toolbar">
      <div className="care-day-switch" role="group" aria-label="Chọn ngày">
        <button className="button button-secondary" type="button" onClick={() => setDate(addDays(date, -1))}>‹ Hôm trước</button>
        <label className="filter-field"><span>Ngày</span>
          <input type="date" value={date} max={addDays(today, 7)} onChange={e => e.target.value && setDate(e.target.value)} /></label>
        <button className="button button-secondary" type="button" disabled={date >= addDays(today, 7)}
          onClick={() => setDate(addDays(date, 1))}>Hôm sau ›</button>
        {date !== today && <button className="button button-secondary" type="button" onClick={() => setDate(today)}>Hôm nay</button>}
      </div>
      <label className="filter-field"><span>Trạng thái</span>
        <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Tất cả</option>
          {Object.entries(TASK_STATUS).map(([value, [text]]) => <option key={value} value={value}>{text}</option>)}
        </select></label>
      <HorsePicker horses={taskHorses} value={horseId} onChange={setHorseId} allowAll />
      <label className="filter-field"><span>Loại việc</span><select value={taskType} onChange={e => setTaskType(e.target.value)}><option value="">Tất cả</option>{Object.entries(TASK_TYPES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
      {club && <label><input type="checkbox" checked={unassigned} onChange={e => setUnassigned(e.target.checked)} />Chưa có Groom</label>}
      {club && canGenerate && <label className="filter-field"><span>Groom</span>
        <select value={groomId} onChange={e => setGroomId(e.target.value)}>
          <option value="">Tất cả Groom</option>
          {grooms.map(g => <option key={g.UserID} value={g.UserID}>{g.FullName}</option>)}
        </select></label>}
    </section>

    <section className="care-stats" aria-label="Tổng quan trong ngày">
      <article><span>Tổng việc</span><strong>{summary.total}</strong></article>
      <article><span>Chưa làm</span><strong>{summary.pending}</strong></article>
      <article><span>Đã làm</span><strong>{summary.done}</strong></article>
      <article className={summary.overdue ? 'care-stat-alert' : ''}><span>Quá giờ</span><strong>{summary.overdue}</strong></article>
    </section>

    {club && <div className="care-toolbar-actions">
      <ExtraTaskForm horses={horses} date={date} onSaved={tasks.reload} currentUser={currentUser} />
      {canGenerate && date >= today && <button className="button button-secondary" type="button" disabled={generate.busy} onClick={runGenerate}>
        {generate.busy ? 'Đang sinh việc…' : 'Sinh lại việc theo chỉ tiêu'}</button>}
      {generated && <span className="care-inline-notice" role="status">{generated}</span>}
      {generate.error && <span className="error-message" role="alert">{generate.error}</span>}
    </div>}

    <section className="panel care-task-panel">
      <Loading state={tasks} isEmpty={!rows.length}
        empty={all.length ? ['Không có việc khớp bộ lọc', 'Thử bỏ bớt bộ lọc.']
          : ['Không có việc trong ngày này', date < today ? 'Ngày đã qua không sinh thêm việc.' : 'Khi có khẩu phần, buổi tập hoặc chỉ tiêu, việc sẽ tự xuất hiện ở đây.']}>
        <div className="care-task-list">
          {rows.map(task => <TaskCard key={task.CareTaskID} task={task} showGroom={club}
            canComplete={!club && String(task.GroomID) === String(currentUser?.id)} canSkip={canSkip && (!club || canGenerate || String(task.AssignedBy) === String(currentUser.id))} onDone={tasks.reload} />)}
        </div>
      </Loading>
    </section>
    {!club && <p className="care-muted care-footnote">Thấy ngựa có dấu hiệu bất thường: <Link to="/health-reports">Báo sức khỏe hoặc báo khẩn ngay</Link>.</p>}
  </CarePage>
}
