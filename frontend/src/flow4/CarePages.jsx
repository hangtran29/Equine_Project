import { getCompleteVetList } from '../api/vetApi.ts'
// Flow 4 – Chăm sóc và dinh dưỡng: Việc chăm sóc (QL25, QL26, HT17, TR15, BS11, CS01–CS03), Người chăm sóc phụ trách (QL27),
// Kho và cấp vật tư (QL28–QL30), Khẩu phần ăn (HT15, HT16), Chỉ tiêu chăm sóc (HT18), Xin vật tư (HT19, CS05),
// Khẩu phần ngựa (CS04), Góp ý dinh dưỡng (BS12).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../api/apiClient.ts'
import { Badge, Crumb, DateField, Dialog, Dl, Heading, Icon, Loading, Notice, SectionTitle, SelectInput, TextArea, TextInput, TimeField, errorText, fmtDate, fmtDateTime, useAction, useLoad } from '../flow1/ui.jsx'
import { HorseThumb } from '../flow1/horse.jsx'
import { MSG, checkSelect, checkText, runChecks, serverFieldErrors } from '../utils/validation.js'
import { INTENSITY, Search, Tabs, matches } from '../flow2/common.jsx'
import { healthText, isoToday, plusDays } from '../flow3/common.jsx'
import { clubDateTimeInput } from '../pages/vet/vetDomain.js'

const q = (p) => { const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null && v !== false)); return s.size ? `?${s}` : '' }
const care = {
  horses: async () => await getCompleteVetList('/horses?RegistrationStatus=Approved'),
  tasks: async (p = {}) => await getCompleteVetList(`/care-tasks${q(p)}`),
  createTask: (b) => apiPost('/care-tasks', b),
  complete: (id, note, outcome) => apiPost(`/care-tasks/${id}/complete`, { Note: note, ...(outcome ? { FeedingOutcome: outcome } : {}) }),
  skip: (id, reason) => apiPost(`/care-tasks/${id}/skip`, { Reason: reason }),
  generate: (date) => apiPost('/care-tasks/generate', { Date: date, Days: 1 }),
  trainingToday: async (date) => await getCompleteVetList(`/care/training-today${q({ Date: date })}`),
  grooms: async () => await getCompleteVetList('/users?RoleCode=GROOM&Status=Active'),
  groom: (id) => apiGet(`/horses/${id}/groom`).catch(() => null),
  setGroom: (id, groomId) => apiPut(`/horses/${id}/groom`, { GroomID: Number(groomId) }),
  removeGroom: (id) => apiDelete(`/horses/${id}/groom`),
  items: async () => await getCompleteVetList('/inventory-items'),
  addItem: (b) => apiPost('/inventory-items', b),
  updateItem: (id, b) => apiPatch(`/inventory-items/${id}`, b),
  stock: (id, b) => apiPost(`/inventory-items/${id}/stock`, b),
  requests: async (p = {}) => await getCompleteVetList(`/inventory-requests${q(p)}`),
  request: (b) => apiPost('/inventory-requests', b),
  approve: (id, b) => apiPost(`/inventory-requests/${id}/approve`, b),
  reject: (id, note) => apiPost(`/inventory-requests/${id}/reject`, { Note: note }),
  cancel: (id) => apiPost(`/inventory-requests/${id}/cancel`, {}),
  rules: async () => await getCompleteVetList('/care-rules'),
  updateRule: (code, b) => apiPatch(`/care-rules/${encodeURIComponent(code)}`, b),
  diets: async (p = {}) => await getCompleteVetList(`/diet-plans${q(p)}`),
  currentDiet: (id) => apiGet(`/horses/${id}/current-diet`).catch(() => null),
  dietContext: (id) => apiGet(`/horses/${id}/diet-context`),
  createDiet: (id, b) => apiPost(`/horses/${id}/diet-plans`, b),
  approveDiet: (id, note) => apiPost(`/diet-plans/${id}/approve`, note ? { VetNote: note } : {}),
  rejectDiet: (id, note) => apiPost(`/diet-plans/${id}/reject`, { VetNote: note }),
}
const Page = ({ children }) => <main className="page-content f1">{children}</main>
const Fail = ({ error }) => <Page><Notice kind="bad" style={{ marginTop: 30 }}>{errorText(error)}</Notice></Page>
export const TASK_TYPE = { Feeding: 'Cho ăn', Cleaning: 'Dọn chuồng', Bathing: 'Tắm, kiểm tra chân', 'Ice Leg Soak': 'Ngâm chân nước đá', 'Training Support': 'Hỗ trợ tập luyện', 'Medical Care': 'Chăm sóc y tế', Other: 'Công việc khác' }
const TASK_STATUS = { Pending: ['wait', 'Chưa thực hiện'], Completed: ['ok', 'Đã hoàn thành'], Skipped: ['arch', 'Đã bỏ qua'], Late: ['bad', 'Quá giờ'] }
const ITEM_TYPE = { Food: 'Thức ăn', Medicine: 'Thuốc', 'Care Equipment': 'Dụng cụ chăm sóc' }
const ITEM_STATUS = { Available: ['ok', 'Còn hàng'], 'Low Stock': ['wait', 'Sắp hết hàng'], 'Out of Stock': ['bad', 'Hết hàng'], Inactive: ['arch', 'Ngừng sử dụng'] }
const REQ_STATUS = { Pending: ['wait', 'Chờ duyệt'], Approved: ['ok', 'Đã duyệt'], Rejected: ['bad', 'Bị từ chối'], Cancelled: ['arch', 'Đã hủy'] }
const DIET_STATUS = { Pending: ['wait', 'Chờ góp ý'], Approved: ['ok', 'Đang áp dụng'], Adjusted: ['ok', 'Đang áp dụng'], Rejected: ['bad', 'Cần điều chỉnh'], Expired: ['arch', 'Đã thay thế'] }
const FEED_OUTCOME = [['All', 'Ăn hết'], ['Partial', 'Ăn một phần'], ['Refused', 'Bỏ ăn']]
const badge = (map, k) => { const [kind, t] = map[k] || ['draft', k]; return <Badge kind={kind}>{t}</Badge> }
const hm = (v) => String(v || '').slice(11, 16) || String(v || '').slice(0, 5)
const n2 = (v) => (v == null ? '—' : Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 2 }))
const late = (t) => t.Status === 'Pending' && String(t.ScheduledAt).slice(0, 19) < clubDateTimeInput()
const taskState = (t) => (late(t) ? 'Late' : t.Status)
const urgent = (t) => t.Priority === 'Urgent' || t.TaskType === 'Ice Leg Soak'
const noteLine = (t) => String(t.Note || '').split('\n')[0]
const outcomeLine = (t) => [FEED_OUTCOME.find(([v]) => v === t.FeedingOutcome)?.[1], t.OutcomeNote].filter(Boolean).join(' · ')
const dayLabel = (iso) => { const d = new Date(`${iso}T00:00:00`); return `${['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][d.getDay()]}, ${fmtDate(iso)}` }

// ====================================================================== QL25 / HT17 / TR15 / BS11 / CS01–CS03
export function CareTasksPage({ mode, role }) {
  const mine = mode === 'mine'
  const [date, setDate] = useState(isoToday())
  const [status, setStatus] = useState('')
  const [horse, setHorse] = useState('')
  const [type, setType] = useState('')
  const [groom, setGroom] = useState('')
  const [unassigned, setUnassigned] = useState(false)
  const [assign, setAssign] = useState(false)
  const [inline, setInline] = useState(null)
  const data = useLoad(async () => {
    const [tasks, training] = await Promise.all([care.tasks({ Date: date, mine: mine ? 1 : undefined }), mine ? care.trainingToday(date).catch(() => []) : Promise.resolve([])])
    return { tasks, training }
  }, [date, mine])
  const act = useAction()
  const canAssign = !mine && ['manager', 'headTrainer'].includes(role)
  const tasks = (data.data?.tasks || []).slice().sort((a, b) => a.ScheduledAt.localeCompare(b.ScheduledAt))
  const horses = [...new Map(tasks.map((t) => [t.HorseID, t.HorseName])).entries()]
  const groomsIn = [...new Map(tasks.filter((t) => t.GroomID).map((t) => [t.GroomID, t.GroomName])).entries()]
  const shown = tasks.filter((t) => (!status || taskState(t) === status || (status === 'Pending' && t.Status === 'Pending')) && (!horse || String(t.HorseID) === horse)
    && (!type || t.TaskType === type) && (!groom || String(t.GroomID) === groom) && (!unassigned || !t.GroomID))
  const done = tasks.filter((t) => t.Status !== 'Pending').length
  const move = (n) => setDate(plusDays(n, date))
  async function finish(t, form) {
    const msg = t.TaskType === 'Feeding' && !form.outcome ? MSG.select : ''
    if (msg) { setInline({ ...inline, error: msg }); return }
    const ok = await act.run(async () => { await care.complete(t.CareTaskID, form.note?.trim() || null, t.TaskType === 'Feeding' ? form.outcome : undefined); return true })
    if (ok) { setInline(null); data.reload() }
  }
  async function skip(t, reason) {
    const msg = checkText(reason || '', 1000)
    if (msg) { setInline({ ...inline, error: msg }); return }
    const ok = await act.run(async () => { await care.skip(t.CareTaskID, reason.trim()); return true })
    if (ok) { setInline(null); data.reload() }
  }
  return <Page>
    <Crumb items={[[mine ? 'Việc chăm sóc hôm nay' : 'Việc chăm sóc']]} />
    <Heading title={mine ? 'Việc chăm sóc hôm nay' : 'Việc chăm sóc'} />
    <section className="panel">
      <div className="filters" style={{ gridTemplateColumns: mine ? '260px repeat(3,1fr)' : '260px repeat(4,1fr)' }}>
        <div className="field"><span>Ngày</span><div className="daynav"><button type="button" className="btn sec sm" aria-label="Ngày trước" onClick={() => move(-1)}>‹</button>
          <b>{dayLabel(date)}</b><button type="button" className="btn sec sm" aria-label="Ngày sau" onClick={() => move(1)}>›</button></div></div>
        <SelectInput label="Trạng thái" value={status} onChange={setStatus} placeholder="Tất cả" options={[['Pending', 'Chưa thực hiện'], ['Late', 'Quá giờ'], ['Completed', 'Đã hoàn thành'], ['Skipped', 'Đã bỏ qua']]} />
        <SelectInput label="Ngựa" value={horse} onChange={setHorse} placeholder="Tất cả ngựa" options={horses.map(([id, n]) => [String(id), n])} />
        <SelectInput label="Loại công việc" value={type} onChange={setType} placeholder="Tất cả" options={Object.entries(TASK_TYPE)} />
        {!mine && <SelectInput label="Người chăm sóc" value={groom} onChange={setGroom} placeholder="Tất cả" options={groomsIn.map(([id, n]) => [String(id), n])} />}
      </div>
      {data.loading ? <Loading /> : data.error ? <Notice kind="bad">{errorText(data.error)}</Notice> : <>
        <div className="kpis">
          <div className="kpi"><small>Tổng công việc</small><b>{tasks.length}</b></div>
          <div className="kpi"><small>Chưa thực hiện</small><b>{tasks.filter((t) => t.Status === 'Pending').length}</b></div>
          <div className="kpi"><small>Đã hoàn thành</small><b>{tasks.filter((t) => t.Status === 'Completed').length}</b></div>
          <div className="kpi"><small>Quá giờ</small><b className={tasks.some(late) ? 'bad' : ''}>{tasks.filter(late).length}</b></div>
        </div>
        {mine && <TrainingToday rows={data.data.training} date={date} />}
        {mine ? <div className="progress-line"><b>Tiến độ hôm nay</b><div className="bar"><i style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} /></div><small>{done} / {tasks.length} công việc</small></div>
          : <div className="toolbar"><label className="check"><input type="checkbox" checked={unassigned} onChange={(e) => setUnassigned(e.target.checked)} /> Chỉ hiện công việc chưa phân công</label>
            {canAssign && <><button type="button" className="btn sec" style={{ marginLeft: 'auto' }} disabled={act.busy} onClick={() => act.run(async () => { await care.generate(date); data.reload() })}>Tạo công việc theo chỉ tiêu</button>
              <button type="button" className="btn pri" onClick={() => setAssign(true)}><Icon name="plus" size={16} /> Giao thêm công việc</button></>}</div>}
        {act.error && <Notice kind="bad" style={{ marginBottom: 12 }}>{act.error}</Notice>}
        {!shown.length ? <p className="empty">Không có công việc chăm sóc trong ngày này.</p> : <table>
          <thead><tr><th>Giờ</th><th>Công việc</th><th>Ngựa</th><th>Chuồng</th>{!mine && <th>Người chăm sóc</th>}<th>Ưu tiên</th><th>Trạng thái</th>{(mine || canAssign) && <th>Thao tác</th>}</tr></thead>
          <tbody>{shown.map((t) => { const open = inline?.id === t.CareTaskID; return [
            <tr key={t.CareTaskID} data-task-id={t.CareTaskID} className={late(t) ? 'hl' : ''}>
              <td><b>{hm(t.ScheduledAt)}</b></td><td><b>{TASK_TYPE[t.TaskType] || t.TaskType}</b><small>{noteLine(t)}</small></td><td><Link to={`/horses/${t.HorseID}`}>{t.HorseName}</Link></td><td>{t.StallNumber || '—'}</td>
              {!mine && <td>{t.GroomName || <span className="muted">Chưa phân công</span>}</td>}
              <td>{urgent(t) ? <Badge kind="bad">Khẩn</Badge> : <Badge kind="draft">Thông thường</Badge>}</td><td>{badge(TASK_STATUS, taskState(t))}</td>
              {(mine || canAssign) && <td>{t.Status !== 'Pending' ? <small>{t.Status === 'Completed' ? `${outcomeLine(t) || 'Đã xong'} · xong lúc ${hm(t.CompletedAt)}` : outcomeLine(t) || 'Đã bỏ qua'}</small>
                : mine ? <div className="btn-row"><button type="button" className="btn pri sm" onClick={() => setInline({ id: t.CareTaskID, kind: 'done', outcome: '', note: '' })}><Icon name="check" size={14} /> Hoàn thành</button>
                  <button type="button" className="btn sec sm" onClick={() => setInline({ id: t.CareTaskID, kind: 'skip', reason: '' })}>Bỏ qua</button></div>
                  : !t.GroomID ? <Link className="btn pri sm" to="/care/grooms">Phân công</Link>
                    : <button type="button" className="btn sec sm" onClick={() => setInline({ id: t.CareTaskID, kind: 'skip', reason: '' })}>Bỏ qua</button>}</td>}
            </tr>,
            open && <tr key={`${t.CareTaskID}-x`} data-task-editor={t.CareTaskID} className="inline-row"><td colSpan={mine ? 7 : 8}>{inline.kind === 'done'
              ? <div className="inline-form">{t.TaskType === 'Feeding' && <SelectInput label="Tình trạng ăn" required value={inline.outcome} onChange={(v) => setInline({ ...inline, outcome: v, error: '' })} error={inline.error} placeholder="Chọn tình trạng" options={FEED_OUTCOME} />}
                <TextInput label="Ghi chú" value={inline.note} onChange={(v) => setInline({ ...inline, note: v })} maxLength={500} />
                <div className="btn-row"><button type="button" className="btn sec sm" onClick={() => setInline(null)}>Hủy</button><button type="button" className="btn pri sm" disabled={act.busy} onClick={() => finish(t, inline)}>Xác nhận hoàn thành</button></div></div>
              : <div className="inline-form"><TextInput label="Lý do bỏ qua" required value={inline.reason} onChange={(v) => setInline({ ...inline, reason: v, error: '' })} error={inline.error} maxLength={1000} />
                <div className="btn-row"><button type="button" className="btn sec sm" onClick={() => setInline(null)}>Hủy</button><button type="button" className="btn pri sm" disabled={act.busy} onClick={() => skip(t, inline.reason)}>Xác nhận bỏ qua</button></div></div>}</td></tr>,
          ] })}</tbody></table>}
        {mine && <div style={{ marginTop: 16 }}><Link className="btn danger sm" to="/health-reports"><Icon name="heart" size={14} /> Báo cáo sức khỏe bất thường</Link></div>}
      </>}
    </section>
    {assign && <AssignDialog date={date} role={role} onClose={() => setAssign(false)} onDone={() => { setAssign(false); data.reload() }} />}
  </Page>
}

function TrainingToday({ rows, date }) {
  return <div className="card" style={{ marginBottom: 16 }}><div className="panel-head"><SectionTitle icon="cal">Lịch tập hôm nay của ngựa bạn phụ trách</SectionTitle><small className="muted">{dayLabel(date)}</small></div>
    {!rows.length ? <p className="hint" style={{ margin: 0 }}>Ngựa bạn phụ trách không có buổi tập trong ngày.</p> : <table>
      <thead><tr><th>Giờ</th><th>Ngựa</th><th>Bài tập</th><th>Huấn luyện viên</th><th>Kỵ sĩ tập luyện</th><th>Trạng thái</th><th>Cần chuẩn bị</th></tr></thead>
      <tbody>{rows.map((s) => <tr key={s.TrainingSessionID}><td style={{ whiteSpace: 'nowrap' }}><b>{hm(s.StartTime)}{s.EndTime ? ` – ${hm(s.EndTime)}` : ''}</b></td><td>{s.HorseName}</td>
        <td>{[s.TrainingType, s.DistancePlannedKm ? `${n2(s.DistancePlannedKm)} km` : ''].filter(Boolean).join(' · ')}</td><td>{s.TrainerName}{s.TrainerIsHead && <small className="sub-note">Huấn luyện viên trưởng</small>}</td>
        <td>{s.WorkRiderName}</td><td>{badge({ Completed: ['ok', 'Hoàn thành'], Assigned: ['sent', 'Đã phân công'], 'In Progress': ['wait', 'Đang tập'], Cancelled: ['arch', 'Đã hủy'], Missed: ['bad', 'Vắng'] }, s.Status)}</td>
        <td>{s.NextCareTask ? `${TASK_TYPE[s.NextCareTask.TaskType] || s.NextCareTask.TaskType} lúc ${hm(s.NextCareTask.ScheduledAt)}` : '—'}</td></tr>)}</tbody></table>}</div>
}

function AssignDialog({ date, role, onClose, onDone }) {
  const horses = useLoad(() => care.horses(), [])
  const [form, setForm] = useState({ HorseID: '', TaskType: '', Time: '', Note: '' })
  const [groom, setGroom] = useState(null)
  const [errors, setErrors] = useState({})
  const act = useAction()
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); if (k === 'HorseID') { setGroom(null); if (v) care.groom(v).then(setGroom) } }
  async function save() {
    const found = runChecks({ HorseID: () => checkSelect(form.HorseID), TaskType: () => checkSelect(form.TaskType), Time: () => (form.Time ? '' : MSG.required), Note: () => checkText(form.Note, 1000) })
    setErrors(found)
    if (Object.keys(found).length) return
    const ok = await act.run(async () => {
      try { await care.createTask({ HorseID: Number(form.HorseID), TaskType: form.TaskType, ScheduledAt: `${date}T${form.Time}:00`, Note: form.Note.trim(), GroomID: groom?.GroomID || null }) }
      catch (err) { const f = serverFieldErrors(err); if (Object.keys(f).length) { setErrors(f); return false } throw err }
      return true
    })
    if (ok) onDone()
  }
  return <Dialog title={`Giao thêm công việc · ${fmtDate(date)}`} onClose={onClose} actions={<><button type="button" className="btn sec" onClick={onClose}>Hủy</button><button type="button" className="btn pri" disabled={act.busy} onClick={save}>Giao công việc</button></>}>
    <div className="fgrid">
      <SelectInput label="Ngựa" required value={form.HorseID} onChange={set('HorseID')} error={errors.HorseID} placeholder="Chọn ngựa" options={(horses.data || []).map((h) => [String(h.HorseID), h.HorseName])} />
      <SelectInput label="Loại công việc" required value={form.TaskType} onChange={set('TaskType')} error={errors.TaskType} placeholder="Chọn loại" options={Object.entries(TASK_TYPE).filter(([key]) => !['Medical Care', 'Ice Leg Soak'].includes(key) && (role !== 'trainer' || key === 'Training Support'))} />
      <TimeField label="Giờ thực hiện" required value={form.Time} onChange={set('Time')} error={errors.Time} />
    </div>
    <div style={{ marginTop: 12 }}><TextArea label="Ghi chú cho người chăm sóc" required value={form.Note} onChange={set('Note')} error={errors.Note} rows={2} maxLength={1000} /></div>
    {form.HorseID && <p className="hint" style={{ marginTop: 10 }}>{groom?.GroomName ? <>Công việc được giao cho người chăm sóc đang phụ trách ngựa: <b>{groom.GroomName}</b>.</> : 'Ngựa chưa có người chăm sóc phụ trách; công việc sẽ ở trạng thái chưa phân công.'}</p>}
    {act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}
  </Dialog>
}

// ====================================================================== QL27
export function GroomsPage() {
  const data = useLoad(async () => {
    const [horses, grooms, tasks] = await Promise.all([care.horses(), care.grooms(), care.tasks({ Date: isoToday() })])
    const links = await Promise.all(horses.map((h) => care.groom(h.HorseID)))
    return { horses, grooms, tasks, links: Object.fromEntries(horses.map((h, i) => [h.HorseID, links[i]])) }
  }, [])
  const [pick, setPick] = useState({})
  const act = useAction()
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const { horses, grooms, tasks, links } = data.data
  const load = grooms.map((g) => ({ ...g, horses: horses.filter((h) => links[h.HorseID]?.GroomID === g.UserID).length, tasks: tasks.filter((t) => t.GroomID === g.UserID).length }))
  const maxTasks = Math.max(1, ...load.map((g) => g.tasks))
  return <Page>
    <Crumb items={[['Người chăm sóc phụ trách']]} />
    <Heading title="Người chăm sóc phụ trách" />
    <section className="panel">
      <div className="kpis three">
        <div className="kpi"><small>Ngựa đã tiếp nhận</small><b>{horses.length}</b></div>
        <div className="kpi"><small>Ngựa chưa có người chăm sóc</small><b className={horses.some((h) => !links[h.HorseID]) ? 'warm' : ''}>{horses.filter((h) => !links[h.HorseID]).length}</b></div>
        <div className="kpi"><small>Người chăm sóc đang làm việc</small><b>{grooms.length}</b></div>
      </div>
      {act.error && <Notice kind="bad" style={{ marginBottom: 12 }}>{act.error}</Notice>}
      <div className="two">
        <table><thead><tr><th>Ngựa</th><th>Chuồng</th><th>Người chăm sóc hiện tại</th><th>Giao cho</th><th>Thao tác</th></tr></thead>
          <tbody>{horses.map((h) => { const cur = links[h.HorseID]; const value = pick[h.HorseID] ?? (cur ? String(cur.GroomID) : '')
            return <tr key={h.HorseID} className={!cur ? 'hl' : ''}><td><b>{h.HorseName}</b><small>{h.HorseCode}</small></td><td>{h.CurrentStall?.StallNumber || '—'}</td>
              <td>{cur ? <><b>{cur.GroomName}</b><small>Từ {fmtDate(cur.AssignedAt)}</small></> : <span className="muted">Chưa phân công</span>}</td>
              <td><select className="input" value={value} onChange={(e) => setPick((p) => ({ ...p, [h.HorseID]: e.target.value }))} aria-label={`Người chăm sóc cho ${h.HorseName}`}>
                <option value="">Chọn người chăm sóc</option>{grooms.map((g) => <option key={g.UserID} value={g.UserID}>{g.FullName}</option>)}</select></td>
              <td><button type="button" className={`btn sm ${!cur && value ? 'pri' : 'sec'}`} disabled={act.busy || !value || value === String(cur?.GroomID || '')}
                onClick={() => act.run(async () => { await care.setGroom(h.HorseID, value); setPick((p) => ({ ...p, [h.HorseID]: undefined })); data.reload() })}>Lưu</button>
                {cur && <button type="button" className="btn sec sm" disabled={act.busy} onClick={() => act.run(async () => { await care.removeGroom(h.HorseID); setPick(p => ({ ...p, [h.HorseID]: '' })); data.reload() })}>Gỡ phân công</button>}</td></tr> })}</tbody></table>
        <div className="card"><SectionTitle icon="user">Khối lượng hôm nay</SectionTitle>
          {load.map((g) => <div key={g.UserID} className="load-row"><div><b>{g.FullName}</b><small>{g.horses} ngựa · {g.tasks} việc</small></div><div className="bar"><i style={{ width: `${(g.tasks / maxTasks) * 100}%` }} /></div></div>)}
          <p className="hint" style={{ marginTop: 12 }}>Khi đổi người chăm sóc, các công việc chưa hoàn thành của ngựa được chuyển cho người mới.</p></div>
      </div>
    </section>
  </Page>
}

// ====================================================================== QL28 / QL29 / QL30
export function InventoryPage() {
  const data = useLoad(async () => { const [items, requests] = await Promise.all([care.items(), care.requests()]); return { items, requests } }, [])
  const [tab, setTab] = useState('stock')
  const [text, setText] = useState('')
  const [type, setType] = useState('')
  const [st, setSt] = useState('')
  const [reqStatus, setReqStatus] = useState('Pending')
  const [dialog, setDialog] = useState(null)
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const { items, requests } = data.data
  const pending = requests.filter((r) => r.Status === 'Pending')
  const shown = items.filter((i) => matches(text, i.ItemName) && (!type || i.ItemType === type) && (!st || i.Status === st))
  return <Page>
    <Crumb items={[['Kho và cấp vật tư']]} />
    <Heading title="Kho và cấp vật tư" />
    <section className="panel">
      <div className="kpis">
        <div className="kpi"><small>Tổng vật tư</small><b>{items.filter((i) => i.Status !== 'Inactive').length}</b></div>
        <div className="kpi"><small>Sắp hết hàng</small><b className={items.some((i) => i.Status === 'Low Stock') ? 'warm' : ''}>{items.filter((i) => i.Status === 'Low Stock').length}</b></div>
        <div className="kpi"><small>Hết hàng</small><b className={items.some((i) => i.Status === 'Out of Stock') ? 'bad' : ''}>{items.filter((i) => i.Status === 'Out of Stock').length}</b></div>
        <div className="kpi"><small>Yêu cầu chờ duyệt</small><b>{pending.length}</b></div>
      </div>
      <div className="toolbar"><Tabs value={tab} onChange={setTab} tabs={[['stock', 'Tồn kho', items.length], ['requests', 'Yêu cầu cấp vật tư', pending.length]]} />
        {tab === 'stock' ? <button type="button" className="btn pri" style={{ marginLeft: 'auto' }} onClick={() => setDialog({ item: null })}><Icon name="plus" size={16} /> Thêm vật tư</button>
          : <select className="input" style={{ marginLeft: 'auto', width: 200 }} value={reqStatus} onChange={(e) => setReqStatus(e.target.value)} aria-label="Trạng thái yêu cầu">
            <option value="">Tất cả</option>{Object.entries(REQ_STATUS).map(([k, [, t]]) => <option key={k} value={k}>{t}</option>)}</select>}</div>
      {tab === 'stock' ? <>
        <div className="toolbar"><Search value={text} onChange={setText} placeholder="Tìm vật tư" />
          <select className="input" style={{ width: 200 }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Loại"><option value="">Tất cả loại vật tư</option>{Object.entries(ITEM_TYPE).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
          <select className="input" style={{ width: 200 }} value={st} onChange={(e) => setSt(e.target.value)} aria-label="Trạng thái"><option value="">Tất cả trạng thái</option>{Object.entries(ITEM_STATUS).map(([k, [, t]]) => <option key={k} value={k}>{t}</option>)}</select></div>
        <table><thead><tr><th>Vật tư</th><th>Loại</th><th>Tồn kho</th><th>Mức tối thiểu</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>{shown.map((i) => <tr key={i.InventoryItemID} className={i.Status === 'Low Stock' || i.Status === 'Out of Stock' ? 'hl' : ''}><td><b>{i.ItemName}</b></td><td>{ITEM_TYPE[i.ItemType] || i.ItemType}</td>
            <td style={{ minWidth: 140 }}><b>{n2(i.Quantity)} {i.Unit}</b><div className={`bar ${i.Status === 'Low Stock' ? 'warn' : ''}`}><i style={{ width: `${Math.min(100, (Number(i.Quantity) / Math.max(1, Number(i.MinimumQuantity) * 4)) * 100)}%` }} /></div></td>
            <td>{n2(i.MinimumQuantity)} {i.Unit}</td><td>{badge(ITEM_STATUS, i.Status)}</td><td><button type="button" className="btn sec sm" onClick={() => setDialog({ item: i })}>Chi tiết</button></td></tr>)}</tbody></table>
      </> : <RequestList requests={requests.filter((r) => !reqStatus || r.Status === reqStatus)} items={items} onChanged={data.reload} />}
    </section>
    {dialog && <ItemDialog item={dialog.item} onClose={() => setDialog(null)} onDone={() => { setDialog(null); data.reload() }} />}
  </Page>
}

function ItemDialog({ item, onClose, onDone }) {
  const [form, setForm] = useState({ ItemName: item?.ItemName || '', ItemType: item?.ItemType || '', Unit: item?.Unit || '', MinimumQuantity: item ? String(item.MinimumQuantity).replace('.', ',') : '',
    Quantity: '', Change: '', Note: '' })
  const [errors, setErrors] = useState({})
  const act = useAction()
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }
  const num = (v) => Number(String(v).replace(',', '.').replace(/^\+/, ''))
  const numErr = (v, req, signed) => { const t = String(v ?? '').trim(); if (!t) return req ? MSG.required : ''; return (signed ? /^[+-]?\d+([.,]\d+)?$/ : /^\d+([.,]\d+)?$/).test(t) ? '' : 'Giá trị phải là số.' }
  async function save() {
    const found = runChecks({ ItemName: () => checkText(form.ItemName, 150), ItemType: () => checkSelect(form.ItemType), Unit: () => checkText(form.Unit, 30), MinimumQuantity: () => numErr(form.MinimumQuantity, true),
      Quantity: () => (item ? '' : numErr(form.Quantity, true)), Change: () => numErr(form.Change, false, true), Note: () => (String(form.Change).trim() ? checkText(form.Note, 500) : '') })
    setErrors(found)
    if (Object.keys(found).length) return
    const ok = await act.run(async () => {
      try {
        const body = { ItemName: form.ItemName.trim(), ItemType: form.ItemType, Unit: form.Unit.trim(), MinimumQuantity: num(form.MinimumQuantity) }
        if (!item) await care.addItem({ ...body, Quantity: num(form.Quantity) })
        else {
          await care.updateItem(item.InventoryItemID, body)
          if (String(form.Change).trim()) await care.stock(item.InventoryItemID, { Change: String(form.Change).trim().startsWith('-') ? -num(String(form.Change).trim().slice(1)) : num(form.Change), Note: form.Note.trim() })
        }
      } catch (err) { const f = serverFieldErrors(err); if (Object.keys(f).length) { setErrors(f); return false } throw err }
      return true
    })
    if (ok) onDone()
  }
  return <Dialog title={item ? item.ItemName : 'Thêm vật tư'} onClose={onClose} actions={<>
    {item && item.Status !== 'Inactive' && <button type="button" className="btn danger" style={{ marginRight: 'auto' }} disabled={act.busy}
      onClick={async () => { const ok = await act.run(async () => { await care.updateItem(item.InventoryItemID, { Status: 'Inactive' }); return true }); if (ok) onDone() }}>Ngừng sử dụng</button>}
    <button type="button" className="btn sec" onClick={onClose}>Đóng</button><button type="button" className="btn pri" disabled={act.busy} onClick={save}>{item ? 'Lưu thay đổi' : 'Thêm vật tư'}</button></>}>
    {item && <p>Thức ăn · Tồn kho hiện tại: <b>{n2(item.Quantity)} {item.Unit}</b>{item.Status === 'Low Stock' ? ` (dưới mức tối thiểu ${n2(item.MinimumQuantity)} ${item.Unit})` : ''}</p>}
    <div className="fgrid">
      <TextInput label="Tên vật tư" required value={form.ItemName} onChange={set('ItemName')} error={errors.ItemName} maxLength={150} />
      <SelectInput label="Loại vật tư" required value={form.ItemType} onChange={set('ItemType')} error={errors.ItemType} placeholder="Chọn loại" options={Object.entries(ITEM_TYPE)} />
      <TextInput label="Đơn vị tính" required value={form.Unit} onChange={set('Unit')} error={errors.Unit} maxLength={30} />
      <TextInput label="Mức tồn tối thiểu" required unit={form.Unit || undefined} value={form.MinimumQuantity} onChange={set('MinimumQuantity')} error={errors.MinimumQuantity} inputMode="decimal" maxLength={10} />
      {!item && <TextInput label="Tồn kho ban đầu" required unit={form.Unit || undefined} value={form.Quantity} onChange={set('Quantity')} error={errors.Quantity} inputMode="decimal" maxLength={10} />}
    </div>
    {item && <><h3 style={{ margin: '18px 0 10px', fontSize: 15 }}>Điều chỉnh tồn kho</h3><div className="fgrid">
      <TextInput label="Số lượng nhập / xuất" unit={item.Unit} value={form.Change} onChange={set('Change')} error={errors.Change} inputMode="decimal" maxLength={10} />
      <TextInput label="Lý do điều chỉnh" required={Boolean(String(form.Change).trim())} value={form.Note} onChange={set('Note')} error={errors.Note} maxLength={500} /></div>
      <p className="hint" style={{ marginTop: 8 }}>Nhập số âm để giảm tồn kho.</p></>}
    {act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}
  </Dialog>
}

function RequestList({ requests, items, onChanged }) {
  const stock = Object.fromEntries(items.map((i) => [i.InventoryItemID, i]))
  if (!requests.length) return <p className="empty">Không có yêu cầu cấp vật tư.</p>
  return requests.map((r) => <RequestCard key={r.InventoryRequestID} r={r} stock={stock} onChanged={onChanged} />)
}
function RequestCard({ r, stock, onChanged }) {
  const [qty, setQty] = useState(() => Object.fromEntries(r.Items.map((l) => [l.InventoryItemID, String(l.ApprovedQuantity ?? l.RequestedQuantity).replace('.', ',')])))
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const act = useAction()
  const pending = r.Status === 'Pending'
  async function approve() {
    const bad = r.Items.find((l) => !/^\d+([.,]\d+)?$/.test(String(qty[l.InventoryItemID]).trim()))
    if (bad) { setError(`Số lượng duyệt của ${bad.ItemName} phải là số.`); return }
    const msg = checkText(note, 1000); setError(msg); if (msg) return
    const ok = await act.run(async () => { await care.approve(r.InventoryRequestID, { Note: note.trim(), Items: r.Items.map((l) => ({ InventoryItemID: l.InventoryItemID, ApprovedQuantity: Number(String(qty[l.InventoryItemID]).replace(',', '.')) })) }); return true })
    if (ok) onChanged()
  }
  async function reject() { const msg = checkText(note, 1000); setError(msg); if (msg) return; const ok = await act.run(async () => { await care.reject(r.InventoryRequestID, note.trim()); return true }); if (ok) onChanged() }
  return <div className="card" data-request-id={r.InventoryRequestID} style={{ marginBottom: 14 }}>
    <div className="tl-head"><div><h3 style={{ margin: 0, fontSize: 16 }}>Yêu cầu #{r.InventoryRequestID} · {r.RequestedByName}</h3><small>Gửi lúc {fmtDateTime(r.RequestDate)}</small></div>{badge(REQ_STATUS, r.Status)}</div>
    {r.Reason && <p style={{ margin: '10px 0' }}>{r.Reason}</p>}
    <table><thead><tr><th>Vật tư</th><th>Tồn kho</th><th>Số lượng yêu cầu</th><th>Số lượng duyệt</th></tr></thead>
      <tbody>{r.Items.map((l) => <tr key={l.InventoryRequestItemID}><td><b>{l.ItemName}</b></td><td>{n2(stock[l.InventoryItemID]?.Quantity)} {l.Unit}</td><td>{n2(l.RequestedQuantity)} {l.Unit}</td>
        <td>{pending ? <div className="input-wrap" style={{ maxWidth: 150 }}><input className="input" value={qty[l.InventoryItemID]} inputMode="decimal" onChange={(e) => { setQty((x) => ({ ...x, [l.InventoryItemID]: e.target.value })); setError('') }} aria-label={`Số lượng duyệt ${l.ItemName}`} /><span className="unit">{l.Unit}</span></div>
          : `${n2(l.ApprovedQuantity)} ${l.Unit}`}</td></tr>)}</tbody></table>
    {pending ? <><div style={{ marginTop: 12 }}><TextArea label="Ghi chú duyệt" name="approvalNote" required value={note} onChange={(v) => { setNote(v); setError('') }} rows={2} maxLength={1000} /></div>
      {(error || act.error) && <Notice kind="bad" style={{ marginTop: 10 }}>{error || act.error}</Notice>}
      <div className="btn-row" style={{ marginTop: 12 }}><button type="button" className="btn pri sm" disabled={act.busy} onClick={approve}><Icon name="check" size={14} /> Duyệt và xuất kho</button>
        <button type="button" className="btn danger sm" disabled={act.busy} onClick={reject}>Từ chối yêu cầu</button></div>
      <p className="hint" style={{ marginTop: 8 }}>Khi từ chối, vui lòng ghi rõ lý do trong ô ghi chú.</p></>
      : r.RejectNote && <div className="quote warm" style={{ marginTop: 12 }}><small>Lý do từ chối</small><p>{r.RejectNote}</p></div>}
  </div>
}

// ====================================================================== HT19 / CS05
export function SuppliesPage() {
  const data = useLoad(async () => { const [items, mine] = await Promise.all([care.items(), care.requests({ mine: 1 })]); return { items, mine } }, [])
  const [text, setText] = useState('')
  const [type, setType] = useState('')
  const [lines, setLines] = useState([])
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const [done, setDone] = useState('')
  const act = useAction()
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const items = data.data.items.filter((i) => i.Status !== 'Inactive')
  const shown = items.filter((i) => matches(text, i.ItemName) && (!type || i.ItemType === type))
  const inSlip = new Set(lines.map((l) => l.item.InventoryItemID))
  async function send() {
    const found = {}
    if (!lines.length) found.lines = 'Vui lòng thêm ít nhất một vật tư vào phiếu.'
    lines.forEach((l) => { if (!/^\d+([.,]\d+)?$/.test(String(l.qty).trim()) || Number(String(l.qty).replace(',', '.')) <= 0) found[`q${l.item.InventoryItemID}`] = 'Số lượng phải lớn hơn 0.' })
    const r = checkText(reason, 1500); if (r) found.reason = r
    setErrors(found)
    if (Object.keys(found).length) return
    const ok = await act.run(async () => { await care.request({ Reason: reason.trim(), Items: lines.map((l) => ({ InventoryItemID: l.item.InventoryItemID, RequestedQuantity: Number(String(l.qty).replace(',', '.')) })) }); return true })
    if (ok) { setLines([]); setReason(''); setDone('Đã gửi phiếu xin vật tư đến Quản lý câu lạc bộ.'); data.reload() }
  }
  const mine = data.data.mine.slice().sort((a, b) => String(b.RequestDate).localeCompare(String(a.RequestDate)))
  return <Page>
    <Crumb items={[['Xin vật tư']]} />
    <Heading title="Xin vật tư" />
    <section className="panel">
      <div className="two">
        <div className="card"><div className="panel-head"><SectionTitle icon="archive">Kho vật tư</SectionTitle></div>
          <div className="toolbar"><Search value={text} onChange={setText} placeholder="Tìm vật tư" />
            <select className="input" style={{ width: 180 }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Loại"><option value="">Tất cả loại</option>{Object.entries(ITEM_TYPE).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
          <table><thead><tr><th>Vật tư</th><th>Loại</th><th>Tồn kho</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>{shown.map((i) => <tr key={i.InventoryItemID}><td><b>{i.ItemName}</b></td><td>{ITEM_TYPE[i.ItemType]}</td><td>{n2(i.Quantity)} {i.Unit}</td><td>{badge(ITEM_STATUS, i.Status)}</td>
              <td>{inSlip.has(i.InventoryItemID) ? <span className="muted">Đã thêm</span> : <button type="button" className="link" disabled={i.Status === 'Out of Stock'} onClick={() => { setLines((x) => [...x, { item: i, qty: '' }]); setErrors({}); setDone('') }}>Thêm vào phiếu</button>}</td></tr>)}</tbody></table></div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card"><SectionTitle icon="req">Phiếu xin vật tư</SectionTitle>
            {!lines.length ? <p className="hint" style={{ margin: 0 }}>Chọn “Thêm vào phiếu” ở danh sách kho để bắt đầu.</p> : <table><thead><tr><th>Vật tư</th><th>Số lượng</th><th /></tr></thead>
              <tbody>{lines.map((l, idx) => <tr key={l.item.InventoryItemID}><td><b>{l.item.ItemName}</b><small>Tồn kho {n2(l.item.Quantity)} {l.item.Unit}</small></td>
                <td><div className="input-wrap" style={{ maxWidth: 130 }}><input className="input" inputMode="decimal" value={l.qty} aria-invalid={Boolean(errors[`q${l.item.InventoryItemID}`])} aria-label={`Số lượng ${l.item.ItemName}`}
                  onChange={(e) => { const v = e.target.value; setLines((x) => x.map((y, j) => (j === idx ? { ...y, qty: v } : y))); setErrors({}) }} /><span className="unit">{l.item.Unit}</span></div>
                  {errors[`q${l.item.InventoryItemID}`] && <span className="field-error">{errors[`q${l.item.InventoryItemID}`]}</span>}</td>
                <td><button type="button" className="link" onClick={() => setLines((x) => x.filter((_, j) => j !== idx))}>Xóa</button></td></tr>)}</tbody></table>}
            {errors.lines && <span className="field-error" style={{ display: 'block', marginTop: 8 }}>{errors.lines}</span>}
            <div style={{ marginTop: 12 }}><TextArea label="Lý do" required value={reason} onChange={(v) => { setReason(v); setErrors((e) => ({ ...e, reason: undefined })) }} error={errors.reason} rows={2} maxLength={1500} /></div>
            {act.error && <Notice kind="bad" style={{ marginTop: 10 }}>{act.error}</Notice>}
            {done && <Notice kind="ok" style={{ marginTop: 10 }}>{done}</Notice>}
            <div className="actions"><button type="button" className="btn pri" disabled={act.busy} onClick={send}>Gửi phiếu</button></div></div>
          <div className="card"><SectionTitle icon="file">Phiếu đã gửi</SectionTitle>
            {!mine.length ? <p className="hint" style={{ margin: 0 }}>Bạn chưa gửi phiếu xin vật tư nào.</p> : mine.slice(0, 6).map((r) => <div key={r.InventoryRequestID} className="contact" style={{ marginTop: 8 }}>
              <div><b>Phiếu #{r.InventoryRequestID} · {r.Items.map((l) => `${l.ItemName} ${n2(l.RequestedQuantity)} ${l.Unit}`).join(', ')}</b>
                <small>Gửi lúc {fmtDateTime(r.RequestDate)}{r.Status === 'Approved' ? ` · Đã cấp ${r.Items.map((l) => `${n2(l.ApprovedQuantity)} ${l.Unit}`).join(', ')}` : ''}{r.RejectNote ? ` · ${r.RejectNote}` : ''}</small></div>
              {r.Status === 'Pending' ? <div className="btn-row">{badge(REQ_STATUS, r.Status)}<button type="button" className="link" onClick={() => act.run(async () => { await care.cancel(r.InventoryRequestID); data.reload() })}>Hủy phiếu</button></div> : badge(REQ_STATUS, r.Status)}</div>)}</div>
        </div>
      </div>
    </section>
  </Page>
}

// ====================================================================== HT18
const RULE_TEXT = { FEEDING_BY_DIET: 'Mỗi bữa trong khẩu phần đang áp dụng tạo một việc cho ăn, đúng giờ bữa ăn.',
  DAILY_CLEANING: 'Mỗi ngày một việc dọn chuồng cho mọi ngựa đã tiếp nhận, vào giờ đã đặt.',
  BATH_AFTER_TRAINING: 'Sau mỗi buổi tập hoàn thành, tạo việc tắm và kiểm tra chân sau số phút đã đặt.',
  ICE_LEG_SOAK_WHEN_LOCKED: 'Ngựa đang khóa tập do chấn thương được ngâm chân nước đá mỗi ngày theo chỉ định của bác sĩ thú y.' }
export function CareRulesPage() {
  const data = useLoad(() => care.rules(), [])
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  return <Page>
    <Crumb items={[['Chỉ tiêu chăm sóc']]} />
    <Heading title="Chỉ tiêu chăm sóc" />
    <section className="panel"><p>Chăm sóc y tế và ngâm chân lạnh được bác sĩ chỉ định riêng trong hồ sơ ngựa.</p><div className="rule-grid">{data.data.filter(r => r.RuleCode !== 'ICE_SOAK_WHEN_LOCKED').map((r) => <RuleCard key={r.RuleCode} rule={r} onSaved={data.reload} />)}</div></section>
  </Page>
}
function RuleCard({ rule, onSaved }) {
  const [form, setForm] = useState({ Title: rule.Title || '', TimeOfDay: hm(rule.TimeOfDay), OffsetMinutes: rule.OffsetMinutes ?? '', IsActive: rule.IsActive })
  const [errors, setErrors] = useState({})
  const [done, setDone] = useState('')
  const act = useAction()
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors({}); setDone('') }
  const byDiet = rule.TaskType === 'Feeding', offset = rule.OffsetMinutes != null || rule.TaskType === 'Bathing'
  async function save() {
    const found = runChecks({ Title: () => checkText(form.Title, 150), TimeOfDay: () => (!byDiet && !offset && !form.TimeOfDay ? MSG.required : ''),
      OffsetMinutes: () => (offset ? (!String(form.OffsetMinutes).trim() ? MSG.required : !/^\d{1,3}$/.test(String(form.OffsetMinutes).trim()) ? 'Giá trị phải là số nguyên.' : '') : '') })
    setErrors(found)
    if (Object.keys(found).length) return
    const body = { Title: form.Title.trim(), IsActive: form.IsActive }
    if (!byDiet && !offset) body.TimeOfDay = `${form.TimeOfDay}:00`
    if (offset) body.OffsetMinutes = Number(form.OffsetMinutes)
    const ok = await act.run(async () => { try { await care.updateRule(rule.RuleCode, body) } catch (err) { const f = serverFieldErrors(err); if (Object.keys(f).length) { setErrors(f); return false } throw err } return true })
    if (ok) { setDone('Đã lưu chỉ tiêu.'); onSaved() }
  }
  return <div className="card"><div className="stage-head"><p className="stage-eyebrow">{(TASK_TYPE[rule.TaskType] || rule.TaskType).toUpperCase()}</p>
    <label className="switch"><input type="checkbox" checked={form.IsActive} onChange={(e) => set('IsActive')(e.target.checked)} /><i /><span className="sr">{form.IsActive ? 'Đang bật' : 'Đang tắt'}</span></label></div>
    <h3 style={{ margin: '6px 0' }}>{rule.Title}</h3><p className="hint" style={{ margin: '0 0 14px' }}>{RULE_TEXT[rule.RuleCode] || ''}</p>
    <TextInput label="Tên công việc hiển thị cho người chăm sóc" required value={form.Title} onChange={set('Title')} error={errors.Title} maxLength={150} />
    <div style={{ marginTop: 12 }}>{byDiet ? <div className="field"><span>Giờ thực hiện</span><div className="read">Theo giờ từng bữa ăn</div></div>
      : offset ? <TextInput label="Sau khi kết thúc buổi tập" required unit="phút" value={form.OffsetMinutes} onChange={set('OffsetMinutes')} error={errors.OffsetMinutes} inputMode="numeric" maxLength={3} />
        : <TimeField label="Giờ thực hiện" required value={form.TimeOfDay} onChange={set('TimeOfDay')} error={errors.TimeOfDay} />}</div>
    {act.error && <Notice kind="bad" style={{ marginTop: 10 }}>{act.error}</Notice>}
    {done && <Notice kind="ok" style={{ marginTop: 10 }}>{done}</Notice>}
    <div className="actions"><span className="left">{rule.UpdatedByName ? `Cập nhật bởi ${rule.UpdatedByName} · ${fmtDateTime(rule.UpdatedAt)}` : ''}</span><button type="button" className="btn pri sm" disabled={act.busy} onClick={save}>Lưu chỉ tiêu</button></div>
  </div>
}

// ====================================================================== HT15 / HT16
function Meals({ meals }) {
  return <table><thead><tr><th>Giờ</th><th>Thức ăn</th><th>Số lượng</th><th>Ghi chú</th></tr></thead>
    <tbody>{meals.map((m) => <tr key={m.DietMealID || m.MealTime + m.FeedType}><td><b>{hm(m.MealTime)}</b></td><td>{m.FeedType}</td><td>{n2(m.Quantity)} {m.Unit}</td><td>{m.Note || '—'}</td></tr>)}</tbody></table>
}
const dietState = (diet, pending) => (pending ? ['wait', 'Chờ duyệt'] : diet ? ['ok', 'Đang áp dụng'] : ['bad', 'Chưa có khẩu phần'])

export function DietPlansPage() {
  const data = useLoad(async () => { const [horses, diets] = await Promise.all([care.horses(), care.diets()]); return { horses, diets } }, [])
  const [sel, setSel] = useState(null)
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const { horses, diets } = data.data
  const active = (id) => diets.find((d) => d.HorseID === id && ['Approved', 'Adjusted'].includes(d.Status))
  const pending = (id) => diets.find((d) => d.HorseID === id && ['Pending', 'Rejected'].includes(d.Status))
  const current = sel || horses[0]?.HorseID
  return <Page>
    <Crumb items={[['Khẩu phần ăn']]} />
    <Heading title="Khẩu phần ăn" />
    <section className="panel"><div className="split">
      <div className="card side-list"><p className="stage-eyebrow">NGỰA ĐÃ TIẾP NHẬN</p>{horses.map((h) => { const [k, t] = dietState(active(h.HorseID), pending(h.HorseID)?.Status === 'Pending')
        return <button type="button" key={h.HorseID} className={`side-item ${current === h.HorseID ? 'on' : ''}`} onClick={() => setSel(h.HorseID)}><b>{h.HorseName}</b><small>{h.HorseCode}</small><Badge kind={k}>{t}</Badge></button> })}</div>
      <DietDetail key={current} horseId={current} active={active(current)} pending={pending(current)} onChanged={data.reload} />
    </div></section>
  </Page>
}

function DietDetail({ horseId, active, pending, onChanged }) {
  const ctx = useLoad(() => (horseId ? care.dietContext(horseId) : Promise.resolve(null)), [horseId])
  const [open, setOpen] = useState(false)
  if (!horseId) return <p className="empty">Chưa có ngựa được tiếp nhận.</p>
  if (ctx.loading) return <div className="card"><Loading /></div>
  const c = ctx.data || {}
  return <div style={{ display: 'grid', gap: 16 }}>
    <div className="card"><div className="panel-head"><SectionTitle icon="horse">Bối cảnh tập luyện · {c.HorseName}</SectionTitle>
      <button type="button" className="btn pri sm" disabled={pending?.Status === 'Pending'} onClick={() => setOpen(true)}><Icon name="plus" size={14} /> Lập khẩu phần mới</button></div>
      <Dl items={[['Sức khỏe', healthText(c.CurrentHealthStatus)], ['Cân nặng gần nhất', c.LatestWeightKg ? `${n2(c.LatestWeightKg)} kg` : '—'],
        ['Giáo án', c.ActiveTrainingPlan ? `${c.ActiveTrainingPlan.Goal} · ${fmtDate(c.ActiveTrainingPlan.StartDate)} – ${fmtDate(c.ActiveTrainingPlan.EndDate)}` : 'Chưa có giáo án'],
        ['Giai đoạn hiện tại', c.CurrentStage ? `${c.CurrentStage.StageName} · cường độ ${String(INTENSITY[c.CurrentStage.Intensity] || '').toLowerCase()}` : '—'],
        ['14 ngày qua', c.Last14Days ? `${c.Last14Days.CompletedSessions} buổi hoàn thành · ${n2(c.Last14Days.TotalDistanceKm)} km` : '—'],
        ['7 ngày tới', c.Next7Days ? `${c.Next7Days.PlannedSessions} buổi đã xếp` : '—'], c.TrainingLock && ['Khóa tập', `${c.TrainingLock.LockLevel === 'Full' ? 'Khóa toàn bộ' : 'Giới hạn mức tập'} đến ${fmtDate(c.TrainingLock.LockEndDate)}`, 1]]} /></div>
    {pending && <DietCard diet={pending} title={pending.Status === 'Pending' ? 'Khẩu phần mới chờ bác sĩ thú y góp ý' : 'Khẩu phần cần điều chỉnh'} />}
    {active ? <DietCard diet={active} title={active.DietDescription} /> : <Notice>Ngựa chưa có khẩu phần đang áp dụng. Vui lòng lập khẩu phần để người chăm sóc cho ăn đúng chế độ.</Notice>}
    {open && <DietDialog horseId={horseId} name={c.HorseName} planId={c.ActiveTrainingPlan?.TrainingPlanID} base={active} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onChanged() }} />}
  </div>
}
function DietCard({ diet: d, title }) {
  return <div className="card"><div className="tl-head"><div><h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3><small>Áp dụng từ {fmtDate(d.StartDate)}{d.EndDate ? ` đến ${fmtDate(d.EndDate)}` : ''}</small></div>{badge(DIET_STATUS, d.Status)}</div>
    <div style={{ marginTop: 12 }}><Meals meals={d.Meals} /></div>
    {d.VetNote && <div className="quote info" style={{ marginTop: 12 }}><small>Góp ý của bác sĩ thú y{d.ReviewedByName ? ` · BS. ${d.ReviewedByName}` : ''}</small><p>{d.VetNote}</p></div>}
    <p className="hint" style={{ marginTop: 10 }}>Lập bởi {d.CreatedByName} lúc {fmtDateTime(d.CreatedAt)}{d.TrainingPlanID ? ` · theo giáo án #${d.TrainingPlanID}` : ''}</p></div>
}
function DietDialog({ horseId, name, planId, base, onClose, onDone }) {
  const foods = useLoad(async () => (await care.items()).filter((i) => i.ItemType === 'Food' && i.Status !== 'Inactive'), [])
  const [form, setForm] = useState({ DietDescription: '', StartDate: plusDays(1), EndDate: '' })
  const [meals, setMeals] = useState(() => (base?.Meals || [{ MealTime: '05:30', FeedType: '', Quantity: '', Note: '' }]).map((m) => ({ MealTime: hm(m.MealTime), FeedType: m.FeedType, Quantity: m.Quantity != null ? String(m.Quantity).replace('.', ',') : '', Unit: m.Unit || 'kg', Note: m.Note || '' })))
  const [errors, setErrors] = useState({})
  const act = useAction()
  const setM = (i, k) => (v) => { setMeals((x) => x.map((m, j) => (j === i ? { ...m, [k]: v } : m))); setErrors({}) }
  async function save() {
    const found = runChecks({ DietDescription: () => checkText(form.DietDescription, 1000), StartDate: () => (!form.StartDate ? MSG.required : form.StartDate < isoToday() ? 'Ngày áp dụng không được trước ngày hiện tại.' : ''),
      EndDate: () => (form.EndDate && form.EndDate < form.StartDate ? 'Đến ngày không được trước ngày áp dụng.' : '') })
    if (!meals.length) found.meals = 'Vui lòng thêm ít nhất một bữa ăn.'
    meals.forEach((m, i) => { if (!m.MealTime) found[`t${i}`] = MSG.required; if (!m.FeedType) found[`f${i}`] = MSG.select; if (!/^\d+([.,]\d+)?$/.test(String(m.Quantity).trim())) found[`q${i}`] = 'Giá trị phải là số.' })
    setErrors(found)
    if (Object.keys(found).length) return
    const ok = await act.run(async () => {
      try { await care.createDiet(horseId, { DietDescription: form.DietDescription.trim(), StartDate: form.StartDate, EndDate: form.EndDate || null, TrainingPlanID: planId || null,
        Meals: meals.map((m) => ({ MealTime: `${m.MealTime}:00`, FeedType: m.FeedType, Quantity: Number(String(m.Quantity).replace(',', '.')), Unit: m.Unit || 'kg', Note: m.Note.trim() || null })) }) }
      catch (err) { const f = serverFieldErrors(err); if (Object.keys(f).length) { setErrors(f); return false } throw err }
      return true
    })
    if (ok) onDone()
  }
  const feedOptions = [...new Set([...(foods.data || []).map((i) => i.ItemName), ...meals.map((m) => m.FeedType).filter(Boolean)])].map((v) => [v, v])
  return <Dialog title={`Lập khẩu phần mới · ${name}`} onClose={onClose} actions={<><button type="button" className="btn sec" onClick={onClose}>Hủy</button><button type="button" className="btn pri" disabled={act.busy} onClick={save}>Lưu khẩu phần</button></>}>
    <TextInput label="Mô tả khẩu phần" required value={form.DietDescription} onChange={(v) => { setForm((f) => ({ ...f, DietDescription: v })); setErrors({}) }} error={errors.DietDescription} maxLength={1000} />
    <div className="fgrid" style={{ marginTop: 12 }}>
      <DateField label="Áp dụng từ ngày" required value={form.StartDate} onChange={(v) => setForm((f) => ({ ...f, StartDate: v }))} error={errors.StartDate} min={isoToday()} />
      <DateField label="Đến ngày" value={form.EndDate} onChange={(v) => setForm((f) => ({ ...f, EndDate: v }))} error={errors.EndDate} min={form.StartDate} /></div>
    <p style={{ margin: '14px 0 6px', fontWeight: 700, fontSize: 13 }}>Các bữa ăn trong ngày</p>
    {meals.map((m, i) => <div key={i} className="meal-row">
      <TimeField label={i ? '' : 'Giờ'} value={m.MealTime} onChange={setM(i, 'MealTime')} error={errors[`t${i}`]} />
      <SelectInput label={i ? '' : 'Thức ăn'} value={m.FeedType} onChange={setM(i, 'FeedType')} error={errors[`f${i}`]} placeholder="Chọn" options={feedOptions} />
      <TextInput label={i ? '' : 'Số lượng'} unit={m.Unit} value={m.Quantity} onChange={setM(i, 'Quantity')} error={errors[`q${i}`]} inputMode="decimal" maxLength={6} />
      <TextInput label={i ? '' : 'Ghi chú'} value={m.Note} onChange={setM(i, 'Note')} maxLength={200} />
      <button type="button" className="link" aria-label="Xóa bữa ăn" onClick={() => setMeals((x) => x.filter((_, j) => j !== i))}>×</button></div>)}
    {errors.meals && <span className="field-error">{errors.meals}</span>}
    <button type="button" className="link" onClick={() => setMeals((x) => [...x, { MealTime: '', FeedType: '', Quantity: '', Unit: 'kg', Note: '' }])}>+ Thêm bữa ăn</button>
    <p className="hint" style={{ marginTop: 10 }}>Khẩu phần mới ở trạng thái chờ chốt và gửi bác sĩ thú y góp ý trước khi áp dụng.</p>
    {act.error && <Notice kind="bad" style={{ marginTop: 10 }}>{act.error}</Notice>}
  </Dialog>
}

// ====================================================================== CS04
export function HorseDietsPage() {
  const data = useLoad(async () => {
    const [horses, tasks] = await Promise.all([care.horses(), care.tasks({ mine: 1, From: plusDays(-7), To: plusDays(1) }).catch(() => [])])
    const mineIds = new Set(tasks.map((t) => t.HorseID))
    const diets = await Promise.all(horses.map((h) => care.currentDiet(h.HorseID)))
    return { horses: horses.map((h, i) => ({ ...h, diet: diets[i], mine: mineIds.has(h.HorseID) })) }
  }, [])
  const [tab, setTab] = useState('mine')
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const all = data.data.horses
  const shown = all.filter((h) => tab === 'all' || h.mine)
  return <Page>
    <Crumb items={[['Khẩu phần ngựa']]} />
    <Heading title="Khẩu phần ngựa" />
    <section className="panel">
      <div className="toolbar"><Tabs value={tab} onChange={setTab} tabs={[['mine', 'Ngựa tôi phụ trách', all.filter((h) => h.mine).length], ['all', 'Tất cả ngựa', all.length]]} /></div>
      {!shown.length ? <p className="empty">Không có ngựa.</p> : <div className="hcards">{shown.map((h) => <div key={h.HorseID} className="card">
        <div className="hcard-head"><div className="who"><HorseThumb horseId={h.HorseID} size={52} /><div><h3>{h.HorseName}</h3><small>{[h.HorseCode, h.CurrentStall?.StallNumber && `Chuồng ${h.CurrentStall.StallNumber}`].filter(Boolean).join(' · ')}</small></div></div>
          {h.diet ? badge(DIET_STATUS, h.diet.Status) : <Badge kind="bad">Chưa có khẩu phần</Badge>}</div>
        {h.diet ? <><p style={{ margin: '0 0 4px' }}>{h.diet.DietDescription}</p><small className="muted">Áp dụng từ {fmtDate(h.diet.StartDate)}</small>
          <div style={{ marginTop: 10 }}><Meals meals={h.diet.Meals || []} /></div>
          {h.diet.VetNote && <div className="quote info" style={{ marginTop: 12 }}><small>Lưu ý của bác sĩ thú y</small><p>{h.diet.VetNote}</p></div>}</>
          : <div className="quote warm"><small>Chưa có khẩu phần được duyệt</small><p>Vui lòng liên hệ Huấn luyện viên trưởng trước khi cho ngựa ăn.</p></div>}
      </div>)}</div>}
    </section>
  </Page>
}

// ====================================================================== BS12
export function DietApprovalPage() {
  const data = useLoad(async () => { const [diets, horses] = await Promise.all([care.diets(), care.horses()]); return { diets, horses } }, [])
  const [sel, setSel] = useState(null)
  const list2 = useMemo(() => (data.data?.diets || []).filter((d) => d.Status !== 'Expired').sort((a, b) => (a.Status === 'Pending') !== (b.Status === 'Pending') ? (a.Status === 'Pending' ? -1 : 1) : String(b.CreatedAt).localeCompare(String(a.CreatedAt))), [data.data])
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const cur = list2.find((d) => d.DietPlanID === sel) || list2[0]
  return <Page>
    <Crumb items={[['Góp ý dinh dưỡng']]} />
    <Heading title="Góp ý dinh dưỡng" />
    <section className="panel">{!list2.length ? <p className="empty">Không có khẩu phần cần góp ý.</p> : <div className="split">
      <div className="card side-list"><p className="stage-eyebrow">KHẨU PHẦN CHỜ GÓP Ý</p>{list2.map((d) => <button type="button" key={d.DietPlanID} className={`side-item ${cur?.DietPlanID === d.DietPlanID ? 'on' : ''}`} onClick={() => setSel(d.DietPlanID)}>
        <b>{d.HorseName}</b><small>{d.DietDescription.slice(0, 38)}{d.DietDescription.length > 38 ? '…' : ''} · từ {fmtDate(d.StartDate).slice(0, 5)}</small>{badge({ ...DIET_STATUS, Approved: ['ok', 'Đã góp ý'], Adjusted: ['ok', 'Đã góp ý'] }, d.Status)}</button>)}</div>
      {cur && <ReviewDiet key={cur.DietPlanID} d={cur} onDone={data.reload} />}</div>}</section>
  </Page>
}
function ReviewDiet({ d, onDone }) {
  const ctx = useLoad(() => care.dietContext(d.HorseID).catch(() => null), [d.HorseID])
  const [note, setNote] = useState(d.VetNote || '')
  const [error, setError] = useState('')
  const act = useAction()
  const pending = d.Status === 'Pending'
  async function decide(ok) {
    if (!ok) { const msg = checkText(note, 1500); setError(msg ? (msg === MSG.required ? 'Vui lòng nêu nội dung cần điều chỉnh.' : msg) : ''); if (msg) return }
    const done = await act.run(async () => { await (ok ? care.approveDiet(d.DietPlanID, note.trim()) : care.rejectDiet(d.DietPlanID, note.trim())); return true })
    if (done) onDone()
  }
  const c = ctx.data
  return <div style={{ display: 'grid', gap: 16 }}>
    <div className="card"><div className="tl-head"><div><h3 style={{ margin: 0, fontSize: 17 }}>{d.HorseName} · {d.DietDescription}</h3><small>{d.CreatedByName} lập lúc {fmtDateTime(d.CreatedAt)} · áp dụng từ {fmtDate(d.StartDate)}</small></div>{badge(DIET_STATUS, d.Status)}</div>
      <div style={{ marginTop: 12 }}><Meals meals={d.Meals} /></div>
      <div style={{ marginTop: 14 }}><Dl items={[['Sức khỏe', healthText(c?.CurrentHealthStatus)], ['Cân nặng gần nhất', c?.LatestWeightKg ? `${n2(c.LatestWeightKg)} kg` : '—'],
        ['Hạn chế y tế', c?.TrainingLock ? `${c.TrainingLock.LockLevel === 'Full' ? 'Khóa tập toàn bộ' : 'Giới hạn mức tập'} đến ${fmtDate(c.TrainingLock.LockEndDate)}` : 'Không có']]} /></div></div>
    <div className="card"><SectionTitle icon="steth">Góp ý của bác sĩ thú y</SectionTitle>
      {pending ? <><TextArea label="Góp ý" value={note} onChange={(v) => { setNote(v); setError('') }} error={error} rows={3} maxLength={1500} />
        {act.error && <Notice kind="bad" style={{ marginTop: 10 }}>{act.error}</Notice>}
        <div className="btn-row" style={{ marginTop: 14 }}><button type="button" className="btn pri" disabled={act.busy} onClick={() => decide(true)}><Icon name="check" size={16} /> Đồng ý khẩu phần</button>
          <button type="button" className="btn danger" disabled={act.busy} onClick={() => decide(false)}>Yêu cầu điều chỉnh</button></div></>
        : <div className="quote info"><small>{d.ReviewedByName ? `BS. ${d.ReviewedByName}` : 'Bác sĩ thú y'}{d.ApprovedAt ? ` · ${fmtDateTime(d.ApprovedAt)}` : ''}</small><p>{d.VetNote || 'Đồng ý khẩu phần.'}</p></div>}</div>
  </div>
}
