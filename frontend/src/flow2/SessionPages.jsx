// Buổi tập dùng chung cho Huấn luyện viên trưởng và Huấn luyện viên: Lịch tập (HT10, TR07), Tạo / sửa buổi tập
// (HT11, TR08), Buổi tập giám sát (TR09), Chi tiết buổi tập và Dừng buổi tập (TR10, TR11),
// Đánh giá buổi tập (TR12, TR13).
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Crumb, DateField, Dialog, Dl, Heading, Icon, Loading, Notice, SectionTitle, SelectInput, TextArea, TextInput, TimeField, errorText, fmtDateTime, useAction, useLoad } from '../flow1/ui.jsx'
import { HorseThumb } from '../flow1/horse.jsx'
import { MSG, checkSelect, checkText, runChecks, serverFieldErrors } from '../utils/validation.js'
import { getCompleteVetList } from '../api/vetApi.ts'
import { activeLocksByHorse } from './trainingLocks.js'
import {
  EARLY_END_REASONS, EVALUATION, EvalBadge, Pager, SURFACES, Search, SessionBadge, SessionContext, TRAINING_TYPES, Tabs, addMinutes, api,
  exercise, hhmm, km, matches, minutes, num, planLabel, sessionDate, shortRange, stageLabel, timeRange, todayIso, usePager, withCurrent,
} from './common.jsx'

const Page = ({ children }) => <main className="page-content f1">{children}</main>
const Fail = ({ error }) => <Page><Notice kind="bad" style={{ marginTop: 30 }}>{errorText(error)}</Notice></Page>
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const byTime = (a, b) => (a.SessionDate + a.StartTime).localeCompare(b.SessionDate + b.StartTime)
const isHead = (role) => role === 'headTrainer'
/** Người đang đăng nhập được sửa / hủy buổi tập: Huấn luyện viên trưởng hoặc huấn luyện viên phụ trách ngựa. */
const canManage = (s, role, me) => isHead(role) || String(s.AssignedTrainerID) === String(me)

// ====================================================================== HT10 / TR07
const STATUS_FILTER = [['', 'Tất cả'], ['Assigned', 'Đã phân công'], ['In Progress', 'Đang tập'], ['Completed', 'Hoàn thành'], ['Cancelled', 'Đã hủy'], ['Missed', 'Vắng']]

export function SchedulePage({ role, currentUser }) {
  const [params] = useSearchParams()
  const [from, setFrom] = useState(params.get('from') || todayIso())
  const [to, setTo] = useState(params.get('to') || plusDays(14))
  const [plan, setPlan] = useState(params.get('planId') || '')
  const [status, setStatus] = useState('')
  const [cancelling, setCancelling] = useState(null)
  const mine = isHead(role) ? {} : { mine: 1 }
  const plans = useLoad(() => api.plans({ Status: 'Active', ...mine }), [role])
  const data = useLoad(() => api.sessions({ From: from || undefined, To: to || undefined, TrainingPlanID: plan || undefined, ...mine }), [from, to, plan, role])
  const rows = useMemo(() => (data.data || []).filter((s) => !status || s.Status === status).sort(byTime), [data.data, status])
  const pager = usePager(rows, 10)
  const all = data.data || []
  return <Page>
    <Crumb items={[['Lịch tập']]} />
    <Heading title="Lịch tập" />
    <section className="panel">
      <div className="kpis">
        <div className="kpi"><small>Tổng buổi tập</small><b>{all.length}</b></div>
        <div className="kpi"><small>Đã phân công</small><b>{all.filter((s) => s.Status === 'Assigned').length}</b></div>
        <div className="kpi"><small>Đang tập</small><b>{all.filter((s) => s.Status === 'In Progress').length}</b></div>
        <div className="kpi"><small>Hoàn thành</small><b>{all.filter((s) => s.Status === 'Completed').length}</b></div>
      </div>
      <div className="filters">
        <DateField label="Từ ngày" value={from} onChange={(v) => { setFrom(v); pager.setPage(1) }} />
        <DateField label="Đến ngày" value={to} onChange={(v) => { setTo(v); pager.setPage(1) }} min={from} />
        <SelectInput label="Giáo án" value={plan} onChange={(v) => { setPlan(v); pager.setPage(1) }} placeholder="Tất cả giáo án"
          options={(plans.data || []).map((p) => [String(p.TrainingPlanID), `#${p.TrainingPlanID} · ${p.HorseName}${isHead(role) ? ` · ${p.TrainerName}` : ''}`])} />
        <SelectInput label="Trạng thái" value={status} onChange={(v) => { setStatus(v); pager.setPage(1) }} options={STATUS_FILTER} />
        <Link className="btn pri" to={`/training/sessions/new${plan ? `?planId=${plan}` : ''}`}><Icon name="plus" size={16} /> Tạo buổi tập</Link>
      </div>
      {from && to && to < from && <Notice kind="bad" style={{ marginBottom: 14 }}>Đến ngày không được trước Từ ngày.</Notice>}
      {data.loading ? <Loading /> : data.error ? <Notice kind="bad">{errorText(data.error)}</Notice> : !rows.length ? <p className="empty">Không có buổi tập trong khoảng thời gian này.</p> : <>
        <table><thead><tr><th>Ngày tập</th><th>Ngựa</th><th>Giai đoạn</th><th>Bài tập</th><th>Kỵ sĩ tập luyện</th><th>Giám sát</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>{pager.slice.map((s) => <tr key={s.TrainingSessionID} className={s.Status === 'In Progress' ? 'hl' : ''}>
            <td style={{ whiteSpace: 'nowrap' }}><b>{sessionDate(s)}</b><small>{timeRange(s)}</small></td>
            <td><b>{s.HorseName}</b><small>{planLabel(s)}</small></td><td>{s.StageName}</td><td>{exercise(s)}</td><td>{s.WorkRiderName}</td>
            <td>{s.SupervisingTrainerName}{s.IsSubstitute && <span className="sub-note">Giám sát thay thế</span>}</td>
            <td><SessionBadge status={s.Status} stopped={s.IsStopped} /></td>
            <td><div className="btn-row">{s.Status === 'Completed' ? <Link className="btn sec sm" to={`/training/sessions/${s.TrainingSessionID}`}>Xem kết quả</Link>
              : s.Status === 'Assigned' && canManage(s, role, currentUser?.id) ? <>
                <Link className="btn sec sm" to={`/training/sessions/${s.TrainingSessionID}/edit`}>Sửa</Link>
                <button type="button" className="btn danger sm" onClick={() => setCancelling(s)}>Hủy</button></>
                : <Link className="btn sec sm" to={`/training/sessions/${s.TrainingSessionID}`}>Chi tiết</Link>}</div></td>
          </tr>)}</tbody></table>
        <Pager pager={pager} /></>}
    </section>
    {cancelling && <CancelDialog session={cancelling} onClose={() => setCancelling(null)} onDone={() => { setCancelling(null); data.reload() }} />}
  </Page>
}

function CancelDialog({ session: s, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const act = useAction()
  async function go() {
    const msg = checkText(reason, 1000)
    setError(msg)
    if (msg) return
    const ok = await act.run(async () => { await api.cancelSession(s.TrainingSessionID, reason.trim()); return true })
    if (ok) onDone()
  }
  return <Dialog title="Hủy buổi tập?" onClose={onClose} actions={<>
    <button type="button" className="btn sec" onClick={onClose}>Đóng</button>
    <button type="button" className="btn danger fill" disabled={act.busy} onClick={go}>Hủy buổi tập</button></>}>
    <p>Buổi tập {exercise(s)} của {s.HorseName} ngày {sessionDate(s)} lúc {hhmm(s.StartTime)} sẽ được hủy. Kỵ sĩ {s.WorkRiderName} nhận thông báo về thay đổi lịch.</p>
    <TextArea label="Lý do hủy" required value={reason} onChange={(v) => { setReason(v); setError('') }} error={error} rows={3} maxLength={1000} />
    {act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}
  </Dialog>
}

// ====================================================================== HT11 / TR08
const NUMBERS = [
  ['DurationPlannedMinutes', 'Thời lượng dự kiến', 'phút', 1, 600, true],
  ['DistancePlannedKm', 'Quãng đường dự kiến', 'km', 0, 100],
  ['TargetSpeedKmh', 'Tốc độ mục tiêu', 'km/h', 0, 90],
  ['TrainingLoad', 'Mức tải tập luyện', '', 0, 100],
]
function checkNumber(value, [, , , low, high, integer]) {
  const t = String(value ?? '').trim()
  if (!t) return ''
  if (!/^\d+([.,]\d+)?$/.test(t)) return 'Giá trị phải là số.'
  const n = Number(t.replace(',', '.'))
  if (integer && !Number.isInteger(n)) return 'Giá trị phải là số nguyên.'
  return n < low || n > high ? `Giá trị phải từ ${low} đến ${high}.` : ''
}
const toNum = (v) => (String(v ?? '').trim() ? Number(String(v).replace(',', '.')) : null)
const fromNum = (v) => (v == null ? '' : String(v).replace('.', ','))

// Khóa tập do bác sĩ thú y đặt (Flow 3). Full: không được xếp buổi tập; Restricted: Mức tải tập luyện bắt buộc và không vượt MaxIntensity.
const dayOf = (v) => (v ? String(v).slice(0, 10) : '')
const maxText = (v) => String(Number(v)).replace('.', ',')
const fmtDay = (iso) => { const [y, m, d] = dayOf(iso).split('-'); return y ? `${d}/${m}/${y}` : '' }

export function SessionFormPage({ role }) {
  const { sessionId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const editing = Boolean(sessionId)
  const data = useLoad(async () => {
    const [plans, riders, trainers, session, locks] = await Promise.all([api.plans({ Status: 'Active', ...(isHead(role) ? {} : { mine: 1 }) }), api.users('WORK_RIDER'), api.users('TRAINER'),
      editing ? api.session(sessionId) : Promise.resolve(null),
      getCompleteVetList('/training-locks?LockStatus=Active')])
    return { plans, riders, trainers, session, locks }
  }, [sessionId, role])
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  return <SessionForm {...data.data} editing={editing} presetPlan={params.get('planId')} onDone={(planId) => navigate(`/training/schedule${planId ? `?planId=${planId}` : ''}`)} />
}

function SessionForm({ plans, riders, trainers, session, locks = [], editing, presetPlan, onDone }) {
  const initialPlan = session ? String(session.TrainingPlanID) : presetPlan && plans.some((p) => String(p.TrainingPlanID) === presetPlan) ? presetPlan : plans.length === 1 ? String(plans[0].TrainingPlanID) : ''
  const stagesOf = (planId) => (plans.find((p) => String(p.TrainingPlanID) === String(planId))?.Stages || []).filter((st) => !st.ClosedAt && (!st.EndDate || st.EndDate >= todayIso()))
  const defaultStage = (planId) => { const list = stagesOf(planId); const cur = list.find((st) => st.StartDate <= todayIso()); return String((cur || list[0])?.TrainingPlanStageID || '') }
  const [form, setForm] = useState(() => session ? {
    plan: initialPlan, TrainingPlanStageID: String(session.TrainingPlanStageID), WorkRiderID: String(session.WorkRiderID), SubstituteTrainerID: session.SubstituteTrainerID ? String(session.SubstituteTrainerID) : '',
    SessionDate: session.SessionDate, StartTime: hhmm(session.StartTime), TrainingType: session.TrainingType || '', DurationPlannedMinutes: fromNum(session.DurationPlannedMinutes),
    DistancePlannedKm: fromNum(session.DistancePlannedKm), TargetSpeedKmh: fromNum(session.TargetSpeedKmh), TrainingLoad: fromNum(session.TrainingLoad), Surface: session.Surface || '',
    Location: session.Location || '', Instructions: session.Instructions || '',
  } : { plan: initialPlan, TrainingPlanStageID: initialPlan ? defaultStage(initialPlan) : '', WorkRiderID: '', SubstituteTrainerID: '', SessionDate: todayIso(), StartTime: '',
    TrainingType: '', DurationPlannedMinutes: '', DistancePlannedKm: '', TargetSpeedKmh: '', TrainingLoad: '', Surface: '', Location: '', Instructions: '' })
  const [errors, setErrors] = useState({})
  const act = useAction()
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v, ...(k === 'plan' ? { TrainingPlanStageID: defaultStage(v) } : {}) })); setErrors((e) => ({ ...e, [k]: undefined })) }
  const plan = plans.find((p) => String(p.TrainingPlanID) === String(form.plan))
  const stages = form.plan ? (session ? plan?.Stages || [] : stagesOf(form.plan)) : []
  const stage = stages.find((st) => String(st.TrainingPlanStageID) === String(form.TrainingPlanStageID))
  const end = form.StartTime && form.DurationPlannedMinutes ? addMinutes(form.StartTime, toNum(form.DurationPlannedMinutes)) : ''
  const lock = plan ? activeLocksByHorse(locks, form.SessionDate)[plan.HorseID] : null
  const fullLock = lock?.LockLevel === 'Full' ? lock : null
  const limit = lock?.LockLevel === 'Restricted' && lock.MaxIntensity != null ? Number(lock.MaxIntensity) : null
  const [lockDialog, setLockDialog] = useState(null) // khóa tập toàn bộ: hiện hộp thoại giữa màn hình
  const loadRule = (value = form.TrainingLoad) => {
    const base = checkNumber(value, NUMBERS.find(([k]) => k === 'TrainingLoad'))
    if (base || limit == null) return base
    if (!String(value).trim()) return `Ngựa đang giới hạn mức tập: cần nhập mức tải (tối đa ${maxText(limit)}).`
    return toNum(value) > limit ? `Ngựa đang giới hạn mức tập: mức tải tối đa là ${maxText(limit)}.` : ''
  }

  async function save(e) {
    e.preventDefault()
    const rules = {
      plan: () => (editing ? '' : checkSelect(form.plan)), TrainingPlanStageID: () => checkSelect(form.TrainingPlanStageID), WorkRiderID: () => checkSelect(form.WorkRiderID),
      SessionDate: () => (!form.SessionDate ? MSG.required : !editing && form.SessionDate < todayIso() ? 'Ngày tập không được trước ngày hiện tại.'
        : stage && (form.SessionDate < stage.StartDate || (stage.EndDate && form.SessionDate > stage.EndDate)) ? `Ngày tập phải nằm trong thời gian giai đoạn (${shortRange(stage.StartDate, stage.EndDate)}).` : ''),
      StartTime: () => (form.StartTime ? '' : MSG.required), TrainingType: () => checkSelect(form.TrainingType),
      Location: () => (form.Location.trim() ? checkText(form.Location, 200) : ''), Instructions: () => (form.Instructions.trim() ? checkText(form.Instructions, 2000) : ''),
    }
    for (const f of NUMBERS) rules[f[0]] = () => checkNumber(form[f[0]], f)
    rules.TrainingLoad = loadRule
    const found = runChecks(rules)
    setErrors(found)
    if (Object.keys(found).length) return
    if (fullLock) { setLockDialog(fullLock); return }
    const body = { TrainingPlanStageID: Number(form.TrainingPlanStageID), WorkRiderID: Number(form.WorkRiderID), SubstituteTrainerID: form.SubstituteTrainerID ? Number(form.SubstituteTrainerID) : null,
      SessionDate: form.SessionDate, StartTime: form.StartTime, TrainingType: form.TrainingType, Surface: form.Surface || null, Location: form.Location.trim() || null, Instructions: form.Instructions.trim() || null }
    for (const [k] of NUMBERS) body[k] = toNum(form[k])
    await act.run(async () => {
      try { if (editing) await api.updateSession(session.TrainingSessionID, body); else await api.createSession(body) }
      catch (err) {
        // Backend vẫn là lớp chặn cuối: đổi lỗi khóa tập thành hộp thoại / lỗi dưới ô Mức tải
        if (err?.code === 'TRAINING_LOCK_FULL') { setLockDialog(fullLock || { HorseName: plan?.HorseName }); return }
        if (err?.code === 'TRAINING_LOCK_RESTRICTED') { setErrors((e) => ({ ...e, TrainingLoad: err.message })); return }
        const f = serverFieldErrors(err); if (Object.keys(f).length) { setErrors(f); return } throw err
      }
      onDone(form.plan)
    })
  }
  const substitutes = trainers.filter((t) => !plan || t.UserID !== plan.TrainerID)
  return <Page>
    <Crumb items={[['Lịch tập', '/training/schedule'], [editing ? 'Sửa buổi tập' : 'Tạo buổi tập']]} />
    <Heading title={editing ? 'Sửa buổi tập' : 'Tạo buổi tập'} />
    <form className="panel" onSubmit={save} noValidate>
      {!plans.length && !editing && <Notice style={{ marginBottom: 16 }}>Chưa có giáo án đang áp dụng để lập buổi tập.</Notice>}
      {act.error && <Notice kind="bad" style={{ marginBottom: 16 }}>{act.error}</Notice>}
      <div className="grid">
        <div className="card"><SectionTitle icon="file">Giáo án và giai đoạn</SectionTitle>
          <div className="fgrid">
            <SelectInput label="Giáo án" required value={form.plan} onChange={set('plan')} error={errors.plan} placeholder="Chọn giáo án" disabled={editing}
              options={(editing && plan && !plans.includes(plan) ? [plan, ...plans] : plans).map((p) => [String(p.TrainingPlanID), `#${p.TrainingPlanID} · ${p.HorseName} · ${p.TrainerName}`])} />
            <SelectInput label="Giai đoạn" required value={form.TrainingPlanStageID} onChange={set('TrainingPlanStageID')} error={errors.TrainingPlanStageID} placeholder={form.plan ? 'Chọn giai đoạn' : 'Chọn giáo án trước'}
              options={stages.map((st) => [String(st.TrainingPlanStageID), `Giai đoạn ${st.StageOrder} · ${st.StageName}`])} />
          </div>
          {plan && <div style={{ marginTop: 14 }}><Dl items={[['Ngựa', plan.HorseName], ['Huấn luyện viên', plan.TrainerName], ['Thời gian giai đoạn', stage ? shortRange(stage.StartDate, stage.EndDate) : '—']]} /></div>}
        </div>
        <div className="card"><SectionTitle icon="user">Phân công</SectionTitle>
          <div className="fgrid">
            <SelectInput label="Kỵ sĩ tập luyện" required value={form.WorkRiderID} onChange={set('WorkRiderID')} error={errors.WorkRiderID} placeholder="Chọn kỵ sĩ tập luyện"
              options={riders.map((r) => [String(r.UserID), r.FullName])} />
            <SelectInput label="Giám sát thay thế" value={form.SubstituteTrainerID} onChange={set('SubstituteTrainerID')} error={errors.SubstituteTrainerID} placeholder="Không chọn"
              options={substitutes.map((t) => [String(t.UserID), t.FullName])} />
          </div>
          <p className="hint" style={{ marginTop: 10 }}>Chỉ chọn giám sát thay thế khi huấn luyện viên phụ trách vắng mặt.</p>
        </div>
        <div className="card"><SectionTitle icon="cal">Thời gian</SectionTitle>
          <div className="fgrid">
            <DateField label="Ngày tập" required value={form.SessionDate} onChange={set('SessionDate')} error={errors.SessionDate} min={editing ? undefined : todayIso()} />
            <div className="field"><span>Thứ tự buổi trong ngày</span><div className="read">{session?.SequenceNo ? `Buổi ${session.SequenceNo}` : 'Tự động'}</div></div>
            <TimeField label="Giờ bắt đầu" required value={form.StartTime} onChange={set('StartTime')} error={errors.StartTime} />
            <div className="field"><span>Giờ kết thúc dự kiến</span><div className="read">{end || '—'}</div></div>
          </div>
        </div>
        <div className="card"><SectionTitle icon="heart">Nội dung tập luyện</SectionTitle>
          <div className="fgrid">
            <SelectInput label="Loại bài tập" required value={form.TrainingType} onChange={set('TrainingType')} error={errors.TrainingType} placeholder="Chọn loại bài tập" options={withCurrent(TRAINING_TYPES, form.TrainingType)} />
            {NUMBERS.map(([k, label, unit]) => k === 'TrainingLoad' && limit != null
              ? <div key={k}><TextInput label={label} required value={form[k]} onChange={(v) => { set(k)(v); if (String(v).trim()) setErrors((e) => ({ ...e, [k]: loadRule(v) || undefined })) }} onBlur={() => setErrors((e) => ({ ...e, [k]: loadRule() || undefined }))}
                  error={errors[k]} inputMode="decimal" maxLength={6} placeholder={`Tối đa ${maxText(limit)}`} />
                {!errors[k] && <p className="hint" style={{ margin: '5px 0 0', color: '#854f0b' }}>Ngựa đang giới hạn mức tập · tối đa {maxText(limit)}</p>}</div>
              : <TextInput key={k} label={label} unit={unit || undefined} value={form[k]} onChange={set(k)} error={errors[k]} inputMode="decimal" maxLength={6} />)}
            <SelectInput label="Mặt sân" value={form.Surface} onChange={set('Surface')} error={errors.Surface} placeholder="Chọn mặt sân" options={withCurrent(SURFACES, form.Surface)} />
          </div>
          <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
            <TextInput label="Địa điểm" value={form.Location} onChange={set('Location')} error={errors.Location} maxLength={200} />
            <TextArea label="Hướng dẫn" value={form.Instructions} onChange={set('Instructions')} error={errors.Instructions} rows={3} maxLength={2000} />
          </div>
        </div>
      </div>
      <div className="actions"><Link className="btn sec" to="/training/schedule">Hủy</Link>
        <button type="submit" className="btn pri" disabled={act.busy}>{editing ? <><Icon name="check" size={16} /> Lưu thay đổi</> : <><Icon name="plus" size={16} /> Tạo buổi tập</>}</button></div>
    </form>
    {lockDialog && <Dialog title="Không thể xếp buổi tập" onClose={() => setLockDialog(null)}
      actions={<button type="button" className="btn pri" autoFocus onClick={() => setLockDialog(null)}>Đã hiểu</button>}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <span style={{ width: 44, height: 44, borderRadius: '50%', background: '#fcebeb', color: '#a32d2d', display: 'grid', placeItems: 'center', flex: 'none' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg></span>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, lineHeight: 1.55 }}>Không thể xếp buổi tập vì ngựa đang khóa tập toàn bộ.</p>
          {(lockDialog.HorseName || lockDialog.Reason || lockDialog.LockEndDate) && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 8, background: '#fcebeb', color: '#791f1f', fontSize: 13, overflowWrap: 'anywhere' }}>
            {[lockDialog.HorseName || plan?.HorseName, lockDialog.LockEndDate ? `dự kiến tái đánh giá ${fmtDay(lockDialog.LockEndDate)}` : lockDialog.TrainingLockID ? 'chưa có ngày tái đánh giá' : ''].filter(Boolean).join(' · ')}
            {lockDialog.Reason && <div>Lý do: {lockDialog.Reason}</div>}</div>}
          <p className="hint">Chỉ tập lại sau khi bác sĩ xác nhận mở khóa.</p>
        </div>
      </div>
    </Dialog>}
  </Page>
}

// ====================================================================== TR09
const SUP_TABS = [['all', 'Tất cả'], ['In Progress', 'Đang tập'], ['Assigned', 'Đã phân công'], ['Completed', 'Hoàn thành'], ['off', 'Đã hủy / vắng']]
const inSupTab = (s, t) => t === 'all' || s.Status === t || (t === 'off' && ['Cancelled', 'Missed'].includes(s.Status))

export function SupervisedSessionsPage({ currentUser }) {
  const data = useLoad(() => api.sessions({ mine: 1 }), [])
  const [tab, setTab] = useState('all')
  const [text, setText] = useState('')
  const [stopping, setStopping] = useState(null)
  const rows = useMemo(() => (data.data || []).slice().sort((a, b) => (a.Status === 'In Progress') !== (b.Status === 'In Progress') ? (a.Status === 'In Progress' ? -1 : 1) : byTime(b, a)), [data.data])
  const shown = rows.filter((s) => inSupTab(s, tab) && matches(text, s.HorseName, s.WorkRiderName, s.TrainingType))
  const pager = usePager(shown, 10)
  const count = (t) => rows.filter((s) => inSupTab(s, t)).length
  return <Page>
    <Crumb items={[['Buổi tập giám sát']]} />
    <Heading title="Buổi tập giám sát" />
    <section className="panel">
      {data.loading ? <Loading /> : data.error ? <Notice kind="bad">{errorText(data.error)}</Notice> : <>
        <div className="kpis">
          <div className="kpi"><small>Tổng buổi tập</small><b>{rows.length}</b></div>
          <div className="kpi"><small>Chưa bắt đầu</small><b>{count('Assigned')}</b></div>
          <div className="kpi"><small>Đang tập</small><b className={count('In Progress') ? 'warm' : ''}>{count('In Progress')}</b></div>
          <div className="kpi"><small>Giám sát thay</small><b>{rows.filter((s) => s.IsSubstitute && String(s.SupervisingTrainerID) === String(currentUser?.id)).length}</b></div>
        </div>
        <div className="toolbar">
          <Tabs value={tab} onChange={(t) => { setTab(t); pager.setPage(1) }} tabs={SUP_TABS.map(([k, l]) => [k, l, count(k)])} />
          <Search value={text} onChange={(v) => { setText(v); pager.setPage(1) }} placeholder="Tìm theo ngựa, kỵ sĩ, bài tập" />
        </div>
        {!shown.length ? <p className="empty">Không có buổi tập phù hợp.</p> : <>
          <table><thead><tr><th>Ngày tập</th><th>Ngựa</th><th>Giai đoạn</th><th>Bài tập</th><th>Kỵ sĩ tập luyện</th><th>Điểm</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>{pager.slice.map((s) => <tr key={s.TrainingSessionID} className={s.Status === 'In Progress' ? 'hl' : ''}>
              <td style={{ whiteSpace: 'nowrap' }}><b>{sessionDate(s)}</b><small>{timeRange(s)}</small></td>
              <td><b>{s.HorseName}</b><small>{planLabel(s)}</small></td><td>{s.StageName}</td><td>{exercise(s)}</td><td>{s.WorkRiderName}</td>
              <td><b>{s.Result?.PerformanceScore != null ? num(s.Result.PerformanceScore, 0) : '—'}</b></td><td><SessionBadge status={s.Status} stopped={s.IsStopped} /></td>
              <td><div className="btn-row"><Link className="btn sec sm" to={`/training/sessions/${s.TrainingSessionID}`}>Chi tiết</Link>
                {s.Status === 'In Progress' && <button type="button" className="btn danger sm" onClick={() => setStopping(s)}>Dừng tập</button>}</div></td>
            </tr>)}</tbody></table>
          <Pager pager={pager} /></>}
      </>}
    </section>
    {stopping && <StopDialog session={stopping} onClose={() => setStopping(null)} onDone={() => { setStopping(null); data.reload() }} />}
  </Page>
}

function StopDialog({ session: s, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [report, setReport] = useState(true)
  const [error, setError] = useState('')
  const act = useAction()
  async function go() {
    const msg = checkText(reason, 1000)
    setError(msg)
    if (msg) return
    const ok = await act.run(async () => { await api.stopSession(s.TrainingSessionID, { Reason: reason.trim(), ReportHealth: report, Severity: 'Urgent', Description: reason.trim() }); return true })
    if (ok) onDone()
  }
  return <Dialog title="Dừng buổi tập và báo sự cố?" onClose={onClose} actions={<>
    <button type="button" className="btn sec" onClick={onClose}>Hủy</button>
    <button type="button" className="btn danger fill" disabled={act.busy} onClick={go}>■ Dừng buổi tập</button></>}>
    <p>Buổi tập của {s.HorseName} sẽ dừng ngay và chuyển sang trạng thái đã dừng. Kỵ sĩ tập luyện nhận thông báo để đưa ngựa về chuồng.</p>
    <TextArea label="Lý do dừng" required value={reason} onChange={(v) => { setReason(v); setError('') }} error={error} rows={3} maxLength={1000} />
    <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={report} onChange={(e) => setReport(e.target.checked)} /> Gửi báo cáo sức khỏe khẩn cho bác sĩ thú y đang trực</label>
    {act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}
  </Dialog>
}

// ====================================================================== TR10 / TR11
export function SessionDetailPage({ role, currentUser }) {
  const { sessionId } = useParams()
  const data = useLoad(() => api.session(sessionId), [sessionId])
  const [dialog, setDialog] = useState('')
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const s = data.data
  const me = currentUser?.id
  const manage = canManage(s, role, me)
  const supervise = isHead(role) || String(s.SupervisingTrainerID) === String(me) || manage
  const back = isHead(role) ? ['Lịch tập', '/training/schedule'] : ['Buổi tập giám sát', '/training/trainer-sessions']
  const canReview = !isHead(role) && s.Status === 'Completed' && s.Result && !s.Review && String(s.AssignedTrainerID) === String(me)
  return <Page>
    <Crumb items={[back, [`${s.HorseName} · ${sessionDate(s)}`]]} />
    <Heading title="Chi tiết buổi tập" />
    <section className="panel">
      <SessionContext session={s} extra={`${sessionDate(s)} ${timeRange(s)}`} />
      {(s.Status === 'In Progress' && supervise) || (s.Status === 'Assigned' && manage) || canReview ? <div className="btn-row" style={{ marginTop: 16 }}>
        {s.Status === 'In Progress' && supervise && <button type="button" className="btn danger" onClick={() => setDialog('stop')}>■ Dừng tập và báo sự cố</button>}
        {s.Status === 'Assigned' && manage && <>
          <Link className="btn sec" to={`/training/sessions/${s.TrainingSessionID}/edit`}><Icon name="edit" size={16} /> Sửa buổi tập</Link>
          <button type="button" className="btn danger" onClick={() => setDialog('cancel')}>Hủy buổi tập</button></>}
        {canReview && <Link className="btn pri" to={`/training/sessions/${s.TrainingSessionID}/review`}>Đánh giá buổi tập</Link>}
      </div> : null}
      <h2 className="sec-h">Nội dung buổi tập</h2>
      <Dl cols={4} items={[['Bài tập', s.TrainingType], ['Kỵ sĩ tập luyện', s.WorkRiderName], ['Người giám sát', `${s.SupervisingTrainerName}${s.IsSubstitute ? ' (giám sát thay thế)' : ''}`],
        ['Địa điểm', s.Location], ['Thời lượng', minutes(s.DurationPlannedMinutes)], ['Quãng đường', km(s.DistancePlannedKm)],
        ['Tốc độ mục tiêu', s.TargetSpeedKmh != null ? `${num(s.TargetSpeedKmh)} km/h` : '—'], ['Mức tải tập luyện', num(s.TrainingLoad, 0)], ['Mặt sân', s.Surface]]} />
      {s.Instructions && <div className="quote" style={{ marginTop: 16 }}><small>Hướng dẫn buổi tập</small><p>{s.Instructions}</p></div>}
      <h2 className="sec-h">Kết quả thực tế</h2>
      <ResultBlock session={s} />
      {s.Review && <><h2 className="sec-h">Đánh giá của huấn luyện viên</h2>
        <div className="quote info"><small>{s.Review.TrainerName} · {fmtDateTime(s.Review.ReviewDate)} · {EVALUATION[s.Review.Evaluation] || s.Review.Evaluation}</small><p>{s.Review.TrainerComment || 'Không có nhận xét.'}</p></div>
        {s.Review.AdjustmentRequired && <div className="quote warm" style={{ marginTop: 12 }}><small>Đề xuất điều chỉnh giáo án</small><p>{s.Review.AdjustmentNote}</p></div>}</>}
    </section>
    {dialog === 'stop' && <StopDialog session={s} onClose={() => setDialog('')} onDone={() => { setDialog(''); data.reload() }} />}
    {dialog === 'cancel' && <CancelDialog session={s} onClose={() => setDialog('')} onDone={() => { setDialog(''); data.reload() }} />}
  </Page>
}

function ResultBlock({ session: s }) {
  const r = s.Result
  if (!r) {
    const text = s.Status === 'Cancelled' ? (s.IsStopped ? 'Buổi tập đã được dừng giữa chừng, không có kết quả.' : 'Buổi tập đã được hủy, không có kết quả.')
      : s.Status === 'Missed' ? 'Kỵ sĩ tập luyện vắng mặt, buổi tập không có kết quả.' : 'Kỵ sĩ tập luyện sẽ ghi kết quả sau khi kết thúc buổi tập.'
    return <>{s.EndReason && <div className="quote warm" style={{ marginBottom: 12 }}><small>{s.IsStopped ? 'Lý do dừng' : s.Status === 'Missed' ? 'Ghi chú vắng' : 'Lý do hủy'}</small><p>{s.EndReason}</p></div>}
      <Notice kind="info">{text}</Notice></>
  }
  const reason = Object.fromEntries(EARLY_END_REASONS)
  return <>
    <ResultKpis session={s} />
    {r.EarlyEndReason && <div className="quote warm" style={{ marginBottom: 12 }}><small>Kết thúc sớm · {reason[r.EarlyEndReason]}</small><p>{r.EarlyEndNote}</p></div>}
    {r.RiderObservation && <div className="quote"><small>Nhận xét của kỵ sĩ tập luyện</small><p>{r.RiderObservation}</p></div>}
    {r.SubstituteObservation && <div className="quote" style={{ marginTop: 12 }}><small>Nhận xét của huấn luyện viên giám sát thay thế</small><p>{r.SubstituteObservation}</p></div>}
  </>
}

function ResultKpis({ session: s }) {
  const r = s.Result
  return <div className="kpis">
    <div className="kpi"><small>Thời lượng</small><b>{minutes(r.ActualDurationMinutes)}</b></div>
    <div className="kpi"><small>Quãng đường</small><b>{km(r.ActualDistanceKm)}</b></div>
    <div className="kpi"><small>Tốc độ trung bình / tối đa</small><b>{num(r.AvgSpeedKmh)} / {num(r.MaxSpeedKmh)} km/h</b></div>
    <div className="kpi"><small>Điểm hiệu suất</small><b>{num(r.PerformanceScore, 0)}</b></div>
    <div className="kpi"><small>Nhịp tim trung bình</small><b>{r.AvgHeartRate != null ? `${r.AvgHeartRate} lần/phút` : '—'}</b></div>
    <div className="kpi"><small>Nhịp tim tối đa</small><b>{r.MaxHeartRate != null ? `${r.MaxHeartRate} lần/phút` : '—'}</b></div>
    <div className="kpi"><small>Hồi phục</small><b>{minutes(r.RecoveryMinutes)}</b></div>
    <div className="kpi"><small>Mức tải tập luyện</small><b>{num(s.TrainingLoad, 0)}</b></div>
  </div>
}

// ====================================================================== TR12
export function ReviewQueuePage({ currentUser }) {
  const data = useLoad(() => api.sessions({ mine: 1, Status: 'Completed' }), [])
  const [tab, setTab] = useState('pending')
  const [text, setText] = useState('')
  const me = String(currentUser?.id)
  const done = (data.data || []).filter((s) => s.Result)
  const groups = { pending: done.filter((s) => !s.Review && String(s.AssignedTrainerID) === me), reviewed: done.filter((s) => s.Review) }
  const shown = groups[tab].filter((s) => matches(text, s.HorseName, s.WorkRiderName, s.TrainingType)).sort((a, b) => byTime(b, a))
  const pager = usePager(shown, 10)
  return <Page>
    <Crumb items={[['Đánh giá buổi tập']]} />
    <Heading title="Đánh giá buổi tập" />
    <section className="panel">
      {data.loading ? <Loading /> : data.error ? <Notice kind="bad">{errorText(data.error)}</Notice> : <>
        <div className="toolbar">
          <Tabs value={tab} onChange={(t) => { setTab(t); pager.setPage(1) }} tabs={[['pending', 'Chờ đánh giá', groups.pending.length], ['reviewed', 'Đã đánh giá', groups.reviewed.length]]} />
          <Search value={text} onChange={(v) => { setText(v); pager.setPage(1) }} placeholder="Tìm theo ngựa, kỵ sĩ, bài tập" />
        </div>
        {!shown.length ? <p className="empty">{tab === 'pending' ? 'Không có buổi tập chờ đánh giá.' : 'Chưa có buổi tập đã đánh giá.'}</p> : <>
          <table><thead><tr><th>Ngày tập</th><th>Ngựa</th><th>Bài tập</th><th>Kỵ sĩ tập luyện</th><th>Thời lượng</th><th>Điểm hiệu suất</th><th>Đánh giá</th><th>Thao tác</th></tr></thead>
            <tbody>{pager.slice.map((s) => <tr key={s.TrainingSessionID} className={!s.Review ? 'hl' : ''}>
              <td><b>{sessionDate(s)}</b></td><td><b>{s.HorseName}</b></td><td>{exercise(s)}</td><td>{s.WorkRiderName}</td>
              <td>{minutes(s.Result.ActualDurationMinutes)}</td><td><b>{num(s.Result.PerformanceScore, 0)}</b></td><td><EvalBadge review={s.Review} /></td>
              <td>{s.Review ? <Link className="btn sec sm" to={`/training/sessions/${s.TrainingSessionID}/review`}>Xem</Link>
                : <Link className="btn pri sm" to={`/training/sessions/${s.TrainingSessionID}/review`}>Đánh giá</Link>}</td>
            </tr>)}</tbody></table>
          <Pager pager={pager} /></>}
      </>}
    </section>
  </Page>
}

// ====================================================================== TR13
export function ReviewFormPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const data = useLoad(() => api.session(sessionId), [sessionId])
  const [form, setForm] = useState({ Evaluation: '', TrainerComment: '', AdjustmentRequired: false, AdjustmentNote: '' })
  const [errors, setErrors] = useState({})
  const act = useAction()
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const s = data.data
  async function save(e) {
    e.preventDefault()
    const found = runChecks({ Evaluation: () => checkSelect(form.Evaluation), TrainerComment: () => checkText(form.TrainerComment, 2000),
      AdjustmentNote: () => (form.AdjustmentRequired ? checkText(form.AdjustmentNote, 1000) : '') })
    setErrors(found)
    if (Object.keys(found).length) return
    await act.run(async () => {
      try { await api.review(s.TrainingSessionID, { Evaluation: form.Evaluation, TrainerComment: form.TrainerComment.trim(), AdjustmentRequired: form.AdjustmentRequired, AdjustmentNote: form.AdjustmentRequired ? form.AdjustmentNote.trim() : null }) }
      catch (err) { const f = serverFieldErrors(err); if (Object.keys(f).length) { setErrors(f); return } throw err }
      navigate('/training/reviews')
    })
  }
  return <Page>
    <Crumb items={[['Đánh giá buổi tập', '/training/reviews'], [`${s.HorseName} · ${sessionDate(s)}`]]} />
    <Heading title="Đánh giá buổi tập" />
    <form className="panel" onSubmit={save} noValidate>
      <div className="ctx"><div className="who"><HorseThumb horseId={s.HorseID} size={64} />
        <div><h2>{s.HorseName}</h2><p>{[planLabel(s), stageLabel(s), s.TrainingType, `${sessionDate(s)} ${hhmm(s.StartTime)}`, `Kỵ sĩ ${s.WorkRiderName}`].filter(Boolean).join(' · ')}</p></div></div>
        <SessionBadge status={s.Status} stopped={s.IsStopped} /></div>
      <h2 className="sec-h">Kết quả thực tế</h2>
      <ResultBlock session={s} />
      <h2 className="sec-h">Đánh giá của huấn luyện viên</h2>
      {s.Review ? <>
        <Dl cols={2} items={[['Mức đánh giá', EVALUATION[s.Review.Evaluation] || s.Review.Evaluation], ['Thời điểm đánh giá', fmtDateTime(s.Review.ReviewDate)], ['Nhận xét', s.Review.TrainerComment, 1]]} />
        {s.Review.AdjustmentRequired && <div className="quote warm" style={{ marginTop: 14 }}><small>Nội dung cần điều chỉnh</small><p>{s.Review.AdjustmentNote}</p></div>}
        <div className="actions"><Link className="btn sec" to="/training/reviews">Quay lại danh sách</Link></div>
      </> : s.Status !== 'Completed' || !s.Result ? <Notice kind="info">Chỉ đánh giá được buổi tập đã hoàn thành và có kết quả.</Notice> : <>
        <div style={{ maxWidth: 360 }}><SelectInput label="Mức đánh giá" required value={form.Evaluation} onChange={set('Evaluation')} error={errors.Evaluation} placeholder="Chọn mức đánh giá" options={Object.entries(EVALUATION)} /></div>
        <div style={{ marginTop: 14 }}><TextArea label="Nhận xét" required value={form.TrainerComment} onChange={set('TrainerComment')} error={errors.TrainerComment} rows={3} maxLength={2000} /></div>
        <label className="check" style={{ marginTop: 14 }}><input type="checkbox" checked={form.AdjustmentRequired} onChange={(e) => set('AdjustmentRequired')(e.target.checked)} /> Cần điều chỉnh giáo án</label>
        {form.AdjustmentRequired && <div style={{ marginTop: 12 }}><TextArea label="Nội dung cần điều chỉnh" required value={form.AdjustmentNote} onChange={set('AdjustmentNote')} error={errors.AdjustmentNote} rows={3} maxLength={1000} />
          <p className="hint" style={{ marginTop: 8 }}>Đề xuất điều chỉnh sẽ được gửi đến Huấn luyện viên trưởng.</p></div>}
        {act.error && <Notice kind="bad" style={{ marginTop: 14 }}>{act.error}</Notice>}
        <div className="actions"><Link className="btn sec" to="/training/reviews">Hủy</Link>
          <button type="submit" className="btn pri" disabled={act.busy}>{act.busy ? 'Đang lưu...' : 'Lưu đánh giá'}</button></div>
      </>}
    </form>
  </Page>
}
