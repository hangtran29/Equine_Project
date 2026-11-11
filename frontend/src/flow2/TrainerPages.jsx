// Huấn luyện viên: Ngựa và giáo án (TR01), Lập giáo án và Gửi duyệt (TR02, TR03),
// Chi tiết giáo án, Chốt giai đoạn, Giáo án bị trả về (TR04–TR06; Huấn luyện viên trưởng dùng chung trang chi tiết).
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Badge, Crumb, DateField, Dialog, Dl, Heading, Icon, Loading, Notice, SectionTitle, SelectInput, TextArea, TextInput, errorText, fmtDate, fmtDateTime, useAction, useLoad } from '../flow1/ui.jsx'
import { HorseThumb, SEX } from '../flow1/horse.jsx'
import { MSG, checkSelect, checkText, runChecks, serverFieldErrors } from '../utils/validation.js'
import { getCompleteVetList } from '../api/vetApi.ts'
import { activeLocksByHorse } from './trainingLocks.js'
import {
  INTENSITY, INTENSITY_OPTIONS, PlanBadge, PlanContext, SURFACES, Search, StageCard, Tabs, api, currentStage, fullRange, matches,
  planMeta, planName, planState, specLabel, todayIso, withCurrent,
} from './common.jsx'

const Page = ({ children }) => <main className="page-content f1">{children}</main>
const Fail = ({ error }) => <Page><Notice kind="bad" style={{ marginTop: 30 }}>{errorText(error)}</Notice></Page>
const isHead = (role) => role === 'headTrainer'
const nextDay = (iso) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// ====================================================================== TR01
const PLAN_TABS = [['Draft', 'Bản nháp'], ['Pending Approval', 'Chờ duyệt'], ['Returned', 'Bị trả về'], ['Active', 'Đang áp dụng'], ['Completed', 'Đã hoàn thành'], ['Cancelled', 'Đã hủy']]

export function MyPlansPage() {
  const data = useLoad(async () => {
    const [assignments, plans] = await Promise.all([api.assignments({ mine: 1, Status: 'Active' }), api.plans({ mine: 1 })])
    const [horses, locks] = await Promise.all([
      Promise.all(assignments.map((a) => api.horse(a.HorseID).catch(() => null))),
      getCompleteVetList('/training-locks?LockStatus=Active'),
    ])
    return { assignments, plans, horses: Object.fromEntries(horses.filter(Boolean).map((h) => [h.HorseID, h])), locks: activeLocksByHorse(locks) }
  }, [])
  const [tab, setTab] = useState('all')
  const [text, setText] = useState('')
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const { assignments, plans, horses, locks } = data.data
  const sorted = plans.slice().sort((a, b) => b.TrainingPlanID - a.TrainingPlanID)
  const count = (k) => sorted.filter((p) => planState(p) === k).length
  const shown = sorted.filter((p) => (tab === 'all' || planState(p) === tab) && matches(text, p.HorseName, `#${p.TrainingPlanID}`, p.Goal))
  return <Page>
    <Crumb items={[['Ngựa và giáo án']]} />
    <Heading title="Ngựa và giáo án" />
    <section className="panel">
      <div className="kpis">
        <div className="kpi"><small>Ngựa đang phụ trách</small><b>{assignments.length}</b></div>
        <div className="kpi"><small>Bản nháp</small><b>{count('Draft') + count('Returned')}</b></div>
        <div className="kpi"><small>Chờ duyệt</small><b>{count('Pending Approval')}</b></div>
        <div className="kpi"><small>Đang áp dụng</small><b>{count('Active')}</b></div>
      </div>
      {!assignments.length ? <p className="empty">Bạn chưa được phân công phụ trách ngựa nào.</p>
        : <div className="hcards">{assignments.map((a) => <HorseCard key={a.TrainerHorseAssignmentID} assignment={a} horse={horses[a.HorseID]} lock={locks[a.HorseID]} plans={sorted.filter((p) => p.HorseID === a.HorseID)} />)}</div>}
      <div className="toolbar" style={{ marginTop: 26, paddingTop: 22, borderTop: '1px solid #ecede6' }}>
        <h2 style={{ margin: '0 12px 0 0', fontSize: 18 }}>Tất cả giáo án</h2>
        <Tabs value={tab} onChange={setTab} tabs={[['all', 'Tất cả', sorted.length], ...PLAN_TABS.filter(([k]) => count(k)).map(([k, l]) => [k, l, count(k)])]} />
        <Search value={text} onChange={setText} placeholder="Tìm theo ngựa, mã, mục tiêu" />
      </div>
      {!shown.length ? <p className="empty">Chưa có giáo án.</p> : <table>
        <thead><tr><th>Mã</th><th>Ngựa</th><th>Mục tiêu</th><th>Thời gian</th><th>Giai đoạn</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>{shown.map((p) => <tr key={p.TrainingPlanID}>
          <td><b>#{p.TrainingPlanID}</b></td><td><b>{p.HorseName}</b></td><td style={{ maxWidth: 340 }}>{p.Goal}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{fullRange(p.StartDate, p.EndDate)}</td><td>{p.Stages.length}</td><td><PlanBadge plan={p} /></td>
          <td>{p.Status === 'Draft' ? <Link className="btn sec sm" to={`/training/plans/${p.TrainingPlanID}/edit`}>Tiếp tục soạn</Link>
            : <Link className="btn sec sm" to={`/training/plans/${p.TrainingPlanID}`}>Xem giáo án</Link>}</td>
        </tr>)}</tbody></table>}
    </section>
  </Page>
}

// Khóa tập do bác sĩ thú y đặt: Full = cấm tập hoàn toàn (đỏ), Restricted = chỉ tập nhẹ, giới hạn cường độ (vàng cam).
// Thẻ ngựa đổi màu, nhãn và hiện lý do ngay trên danh sách, không cần bấm vào xem.
const dayOf = (v) => (v ? String(v).slice(0, 10) : '')
const LOCK_STYLE = {
  Full: { line: '#a32d2d', border: '#f0b4ad', bg: '#fcebeb', text: '#791f1f', sub: '#a32d2d', badge: { background: '#fcebeb', color: '#791f1f', borderColor: '#f09595' } },
  Restricted: { line: '#a86a12', border: '#efc77d', bg: '#faeeda', text: '#633806', sub: '#854f0b', badge: { background: '#faeeda', color: '#633806', borderColor: '#ef9f27' } },
}
const LockIcon = ({ size = 13 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
const AlertIcon = ({ size = 13 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.5h.01" /></svg>

function LockBanner({ lock }) {
  const full = lock.LockLevel === 'Full'
  const c = LOCK_STYLE[full ? 'Full' : 'Restricted']
  const until = lock.LockEndDate ? `dự kiến tái đánh giá ${fmtDate(dayOf(lock.LockEndDate))}` : 'chưa có ngày tái đánh giá'
  const head = full ? `Khóa tập · ${until}` : `${lock.MaxIntensity != null ? `Mức tải tối đa ${lock.MaxIntensity}` : 'Chỉ được tập nhẹ'} · ${until}`
  const by = [lock.CreatedByName && `BS. ${lock.CreatedByName}`, lock.LockStartDate && `khóa ngày ${fmtDate(dayOf(lock.LockStartDate))}`].filter(Boolean).join(' ')
  return <div role="status" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, padding: '11px 13px', borderRadius: 10, background: c.bg, color: c.text }}>
    <span style={{ marginTop: 2, display: 'flex' }}>{full ? <LockIcon size={17} /> : <AlertIcon size={17} />}</span>
    <div style={{ minWidth: 0 }}><b style={{ fontSize: 13.5 }}>{head}</b>
      <div style={{ fontSize: 12.5, color: c.sub, marginTop: 2, overflowWrap: 'anywhere' }}>{[lock.Reason && `Lý do: ${lock.Reason}`, by].filter(Boolean).join(' · ')}</div>
      <small>Chỉ tập lại sau khi bác sĩ xác nhận mở khóa.</small></div>
  </div>
}

function HorseCard({ assignment: a, horse, plans, lock }) {
  const current = plans.find((p) => p.Status === 'Active') || plans.find((p) => p.Status === 'Pending Approval') || plans.find((p) => p.Status === 'Draft')
  const full = lock?.LockLevel === 'Full'
  const c = lock ? LOCK_STYLE[full ? 'Full' : 'Restricted'] : null
  const cardStyle = c ? { borderColor: c.border, borderLeft: `5px solid ${c.line}` } : undefined
  return <div className="card" style={cardStyle}>
    <div className="hcard-head"><div className="who">
      <span style={{ position: 'relative', display: 'inline-flex', flex: 'none', filter: full ? 'grayscale(.7)' : undefined }}><HorseThumb horseId={a.HorseID} size={56} /></span>
      {c && <span title={full ? 'Đã khóa tập' : 'Hạn chế tập'} style={{ position: 'relative', alignSelf: 'flex-start', marginLeft: -26, marginRight: -8, marginTop: 34, width: 22, height: 22, borderRadius: '50%', background: c.line, color: '#fff', display: 'grid', placeItems: 'center', border: '2px solid #fff', flex: 'none' }}>
        {full ? <LockIcon size={11} /> : <AlertIcon size={11} />}</span>}
      <div><h3>{a.HorseName}</h3><small>{[horse?.HorseCode, horse?.Breed, SEX[horse?.Gender]].filter(Boolean).join(' · ')}</small></div></div>
      {c ? <span className="badge" style={{ ...c.badge, gap: 5 }}>{full ? <LockIcon /> : <AlertIcon />}{full ? 'Đã khóa tập' : 'Hạn chế tập'}</span>
        : <Badge kind="ok">Đang phụ trách</Badge>}</div>
    <Dl items={[['Bắt đầu phụ trách', fmtDate(a.StartDate)], ['Chuyên môn', specLabel(a.SpecializationName)], ['Số giáo án', String(plans.length)]]} />
    {lock && <LockBanner lock={lock} />}
    {current ? <div className="quote" style={{ marginTop: 14, ...(full ? { opacity: 0.6 } : {}) }}><small>Giáo án hiện tại · #{current.TrainingPlanID}{full && current.Status === 'Active' ? ' · tạm dừng do khóa tập' : ''}</small><p>{current.Goal}</p>
      <div style={{ marginTop: 8 }}><PlanBadge plan={current} /></div></div>
      : <div className="quote warm" style={{ marginTop: 14 }}><small>Chưa có giáo án</small><p>Ngựa mới được phân công, cần lập giáo án để bắt đầu huấn luyện.</p></div>}
    <div className="actions">{!current ? <Link className="btn pri sm" to={`/training/plans/new?horseId=${a.HorseID}`}><Icon name="plus" size={14} /> Lập giáo án</Link>
      : current.Status === 'Draft' ? <Link className="btn pri sm" to={`/training/plans/${current.TrainingPlanID}/edit`}>Tiếp tục soạn</Link>
        : <>{current.Status === 'Active' && (full
          ? <span className="btn sec sm" aria-disabled="true" title="Ngựa đang bị khóa tập, chưa xếp lịch tập được" style={{ opacity: 0.45, cursor: 'not-allowed' }}>Lịch tập</span>
          : <Link className="btn sec sm" to={`/training/schedule?planId=${current.TrainingPlanID}`}>Lịch tập</Link>)}
          <Link className="btn pri sm" to={`/training/plans/${current.TrainingPlanID}`}>Xem giáo án</Link></>}</div>
  </div>
}

// ====================================================================== TR02 / TR03
const blankStage = (start) => ({ key: Math.random().toString(36).slice(2), StageName: '', StartDate: start || '', EndDate: '', Intensity: '', TrainingLoad: '', DistanceTargetKm: '', Surface: '', Goal: '' })
const fromNum = (v) => (v == null ? '' : String(v).replace('.', ','))
const toNum = (v) => (String(v ?? '').trim() ? Number(String(v).replace(',', '.')) : null)
const stageFromApi = (st) => ({ key: String(st.TrainingPlanStageID), id: st.TrainingPlanStageID, StageName: st.StageName || '', StartDate: st.StartDate || '', EndDate: st.EndDate || '',
  Intensity: st.Intensity || '', TrainingLoad: fromNum(st.TrainingLoad), DistanceTargetKm: fromNum(st.DistanceTargetKm), Surface: st.Surface || '', Goal: st.Goal || '' })
const stageBody = (st, i) => ({ StageName: st.StageName.trim(), StageOrder: i + 1, StartDate: st.StartDate, EndDate: st.EndDate, Intensity: st.Intensity,
  TrainingLoad: toNum(st.TrainingLoad), DistanceTargetKm: toNum(st.DistanceTargetKm), Surface: st.Surface || null, Goal: st.Goal.trim() || null })
function checkDecimal(value, low, high) {
  const t = String(value ?? '').trim()
  if (!t) return ''
  if (!/^\d+([.,]\d+)?$/.test(t)) return 'Giá trị phải là số.'
  const n = Number(t.replace(',', '.'))
  return n < low || n > high ? `Giá trị phải từ ${low} đến ${high}.` : ''
}

export function PlanFormPage() {
  const { planId } = useParams()
  const [params] = useSearchParams()
  const data = useLoad(async () => {
    const [assignments, plan] = await Promise.all([api.assignments({ mine: 1, Status: 'Active' }), planId ? api.plan(planId) : Promise.resolve(null)])
    const horses = await Promise.all(assignments.map((a) => api.horse(a.HorseID).catch(() => ({ HorseID: a.HorseID, HorseName: a.HorseName }))))
    return { assignments, plan, horses }
  }, [planId])
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const { plan } = data.data
  if (plan && plan.Status !== 'Draft') return <Page><Crumb items={[['Ngựa và giáo án', '/training/my-plans'], [planName(plan)]]} />
    <Notice kind="info" style={{ marginTop: 30 }}>Chỉ chỉnh sửa được giáo án ở trạng thái bản nháp. <Link className="link" to={`/training/plans/${plan.TrainingPlanID}`}>Xem giáo án</Link></Notice></Page>
  return <PlanForm key={planId || 'new'} {...data.data} presetHorse={params.get('horseId')} />
}

function PlanForm({ plan, horses, presetHorse }) {
  const navigate = useNavigate()
  const [info, setInfo] = useState(() => plan ? { HorseID: String(plan.HorseID), OverallIntensity: plan.OverallIntensity || '', StartDate: plan.StartDate || '', EndDate: plan.EndDate || '', Goal: plan.Goal || '', Note: plan.Note || '' }
    : { HorseID: presetHorse || (horses.length === 1 ? String(horses[0].HorseID) : ''), OverallIntensity: '', StartDate: '', EndDate: '', Goal: '', Note: '' })
  const [stages, setStages] = useState(() => (plan?.Stages || []).map(stageFromApi))
  const [removed, setRemoved] = useState([])
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(null)
  const [errors, setErrors] = useState({})
  const [stageErrors, setStageErrors] = useState({})
  const [savedAt, setSavedAt] = useState('')
  const [confirm, setConfirm] = useState(false)
  const act = useAction()
  const setI = (k) => (v) => { setInfo((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined, form: undefined })) }
  const setS = (k) => (v) => { setDraft((d) => ({ ...d, [k]: v })); setStageErrors((e) => ({ ...e, [k]: undefined })) }
  const horse = horses.find((h) => String(h.HorseID) === String(info.HorseID))
  const returned = plan && planState(plan) === 'Returned'

  function startStage(st) {
    if (editing) return
    if (st) { setEditing(st.key); setDraft({ ...st }) } else {
      const last = stages[stages.length - 1]
      const fresh = blankStage(last?.EndDate ? nextDay(last.EndDate) : info.StartDate)
      setStages((list) => [...list, fresh]); setEditing(fresh.key); setDraft({ ...fresh, isNew: true })
    }
    setStageErrors({}); setErrors((e) => ({ ...e, stages: undefined }))
  }
  function cancelStage() {
    if (draft?.isNew) setStages((list) => list.filter((s) => s.key !== draft.key))
    setEditing(null); setDraft(null); setStageErrors({})
  }
  function saveStage() {
    const d = draft
    const found = runChecks({
      StageName: () => checkText(d.StageName, 100), Intensity: () => checkSelect(d.Intensity),
      StartDate: () => (!d.StartDate ? MSG.required : info.StartDate && d.StartDate < info.StartDate ? 'Giai đoạn không được bắt đầu trước ngày bắt đầu giáo án.' : ''),
      EndDate: () => (!d.EndDate ? MSG.required : d.StartDate && d.EndDate < d.StartDate ? 'Đến ngày không được trước Từ ngày.' : info.EndDate && d.EndDate > info.EndDate ? 'Giai đoạn không được kết thúc sau ngày kết thúc giáo án.' : ''),
      TrainingLoad: () => checkDecimal(d.TrainingLoad, 0, 100), DistanceTargetKm: () => checkDecimal(d.DistanceTargetKm, 0, 2000),
      Goal: () => (d.Goal.trim() ? checkText(d.Goal, 1000) : ''),
    })
    setStageErrors(found)
    if (Object.keys(found).length) return
    const { isNew, ...clean } = d
    void isNew
    setStages((list) => list.map((s) => (s.key === d.key ? clean : s)).sort((a, b) => String(a.StartDate).localeCompare(String(b.StartDate))))
    setEditing(null); setDraft(null)
  }
  function removeStage(st) {
    if (editing) return
    setStages((list) => list.filter((s) => s.key !== st.key))
    if (st.id) setRemoved((r) => [...r, st.id])
  }
  function checkInfo(forSubmit) {
    const found = runChecks({
      HorseID: () => (plan ? '' : checkSelect(info.HorseID)), OverallIntensity: () => checkSelect(info.OverallIntensity),
      StartDate: () => (!info.StartDate ? MSG.required : !plan && info.StartDate < todayIso() ? 'Ngày bắt đầu không được trước ngày hiện tại.' : ''),
      EndDate: () => (info.EndDate && info.StartDate && info.EndDate < info.StartDate ? 'Ngày kết thúc không được trước ngày bắt đầu.' : forSubmit && !info.EndDate ? MSG.required : ''),
      Goal: () => checkText(info.Goal, 1000), Note: () => (info.Note.trim() ? checkText(info.Note, 1000) : ''),
    })
    if (editing) found.stages = 'Vui lòng lưu hoặc hủy giai đoạn đang soạn trước khi tiếp tục.'
    else if (forSubmit && !stages.length) found.stages = 'Vui lòng thêm ít nhất một giai đoạn huấn luyện trước khi gửi duyệt.'
    setErrors(found)
    return !Object.keys(found).length
  }
  async function persist() {
    const body = { Goal: info.Goal.trim(), StartDate: info.StartDate, EndDate: info.EndDate || null, OverallIntensity: info.OverallIntensity, Note: info.Note.trim() || null }
    try {
      if (!plan) {
        const created = await api.createPlan({ ...body, HorseID: Number(info.HorseID), Stages: stages.map(stageBody) })
        return created
      }
      await api.updatePlan(plan.TrainingPlanID, body)
      for (const id of removed) await api.deleteStage(id)
      for (const [i, st] of stages.entries()) {
        if (st.id) await api.updateStage(st.id, stageBody(st, i)); else await api.addStage(plan.TrainingPlanID, stageBody(st, i))
      }
      return api.plan(plan.TrainingPlanID)
    } catch (err) {
      const f = serverFieldErrors(err)
      if (Object.keys(f).length) { setErrors((e) => ({ ...e, ...f, form: 'Vui lòng kiểm tra lại các thông tin được đánh dấu.' })); return null }
      throw err
    }
  }
  async function saveDraft() {
    if (!checkInfo(false)) return
    await act.run(async () => {
      const saved = await persist()
      if (!saved) return
      setSavedAt(new Date().toISOString())
      if (!plan) navigate(`/training/plans/${saved.TrainingPlanID}/edit`, { replace: true })
      else { setStages(saved.Stages.map(stageFromApi)); setRemoved([]) }
    })
  }
  async function submit() {
    setConfirm(false)
    await act.run(async () => {
      const saved = await persist()
      if (!saved) return
      await api.submitPlan(saved.TrainingPlanID)
      navigate(`/training/plans/${saved.TrainingPlanID}`)
    })
  }
  const stamp = savedAt ? `Bản nháp lưu lúc ${fmtDateTime(savedAt.slice(0, 19).replace(/Z$/, ''))}` : plan ? `Bản nháp tạo lúc ${fmtDateTime(plan.CreatedAt)}` : ''
  return <Page>
    <Crumb items={[['Ngựa và giáo án', '/training/my-plans'], [plan ? `${planName(plan)} · Chỉnh sửa` : 'Lập giáo án']]} />
    <Heading title={plan ? 'Chỉnh sửa giáo án' : 'Lập giáo án'} />
    <section className="panel">
      {returned && <Notice kind="bad" style={{ marginBottom: 16 }} title="Huấn luyện viên trưởng đã trả giáo án về">{plan.ReviewNote}</Notice>}
      {!horses.length && !plan && <Notice style={{ marginBottom: 16 }}>Bạn chưa được phân công phụ trách ngựa nào nên chưa thể lập giáo án.</Notice>}
      <div className="card"><SectionTitle icon="file">Thông tin giáo án</SectionTitle>
        <div className="fgrid" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
          <SelectInput label="Ngựa" required value={info.HorseID} onChange={setI('HorseID')} error={errors.HorseID} placeholder="Chọn ngựa" disabled={Boolean(plan)}
            options={(plan && !horse ? [{ HorseID: plan.HorseID, HorseName: plan.HorseName, HorseCode: plan.HorseCode }, ...horses] : horses).map((h) => [String(h.HorseID), [h.HorseName, h.HorseCode].filter(Boolean).join(' · ')])} />
          <SelectInput label="Cường độ tổng thể" required value={info.OverallIntensity} onChange={setI('OverallIntensity')} error={errors.OverallIntensity} placeholder="Chọn cường độ" options={INTENSITY_OPTIONS} />
          <DateField label="Ngày bắt đầu" required value={info.StartDate} onChange={setI('StartDate')} error={errors.StartDate} min={plan ? undefined : todayIso()} />
          <DateField label="Ngày kết thúc" value={info.EndDate} onChange={setI('EndDate')} error={errors.EndDate} min={info.StartDate || undefined} />
        </div>
        <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
          <TextArea label="Mục tiêu giáo án" required value={info.Goal} onChange={setI('Goal')} error={errors.Goal} rows={2} maxLength={1000} />
          <TextArea label="Ghi chú" value={info.Note} onChange={setI('Note')} error={errors.Note} rows={2} maxLength={1000} />
        </div>
      </div>
      <div className="toolbar" style={{ marginTop: 24, paddingTop: 22, borderTop: '1px solid #ecede6', marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Các giai đoạn huấn luyện</h2>
        <button type="button" className="btn sec" style={{ marginLeft: 'auto' }} disabled={Boolean(editing)} onClick={() => startStage(null)}><Icon name="plus" size={16} /> Thêm giai đoạn</button>
      </div>
      {!stages.length && <p className="empty">Chưa có giai đoạn huấn luyện. Vui lòng thêm giai đoạn đầu tiên.</p>}
      {stages.map((st, i) => editing === st.key ? <StageEditor key={st.key} index={i} draft={draft} errors={stageErrors} set={setS} onCancel={cancelStage} onSave={saveStage} min={info.StartDate} />
        : <StageCard key={st.key} index={i} stage={{ ...st, StageOrder: i + 1, TrainingLoad: toNum(st.TrainingLoad), DistanceTargetKm: toNum(st.DistanceTargetKm) }}
          action={!editing && <><button type="button" className="btn sec sm" onClick={() => startStage(st)}><Icon name="edit" size={14} /> Sửa</button>
            <button type="button" className="btn sec sm" onClick={() => removeStage(st)}>Xóa</button></>} />)}
      {errors.stages && <span className="field-error" role="alert" style={{ display: 'block', marginTop: 10 }}>{errors.stages}</span>}
      {errors.form && <Notice kind="bad" style={{ marginTop: 14 }}>{errors.form}</Notice>}
      {act.error && <Notice kind="bad" style={{ marginTop: 14 }}>{act.error}</Notice>}
      <div className="actions"><span className="left">{stamp}</span>
        <button type="button" className="btn sec" disabled={act.busy} onClick={saveDraft}>Lưu bản nháp</button>
        <button type="button" className="btn pri" disabled={act.busy} onClick={() => { if (checkInfo(true)) setConfirm(true) }}>Gửi duyệt</button></div>
    </section>
    {confirm && <Dialog title="Gửi giáo án duyệt?" onClose={() => setConfirm(false)} actions={<>
      <button type="button" className="btn sec" onClick={() => setConfirm(false)}>Kiểm tra lại</button>
      <button type="button" className="btn pri" disabled={act.busy} onClick={submit}>Gửi duyệt</button></>}>
      <p>{plan ? planName(plan) : 'Giáo án'} của {horse?.HorseName || plan?.HorseName} sẽ được gửi đến Huấn luyện viên trưởng. Trong thời gian chờ duyệt, giáo án tạm khóa chỉnh sửa.</p>
    </Dialog>}
  </Page>
}

function StageEditor({ index, draft: d, errors, set, onCancel, onSave, min }) {
  return <div className="card stage edit">
    <p className="stage-eyebrow">GIAI ĐOẠN {index + 1} · ĐANG SOẠN</p>
    <div className="fgrid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)', marginTop: 8 }}>
      <TextInput label="Tên giai đoạn" required value={d.StageName} onChange={set('StageName')} error={errors.StageName} maxLength={100} autoFocus />
      <DateField label="Từ ngày" required value={d.StartDate} onChange={set('StartDate')} error={errors.StartDate} min={min || undefined} />
      <DateField label="Đến ngày" required value={d.EndDate} onChange={set('EndDate')} error={errors.EndDate} min={d.StartDate || undefined} />
    </div>
    <div className="fgrid" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', marginTop: 14 }}>
      <SelectInput label="Cường độ" required value={d.Intensity} onChange={set('Intensity')} error={errors.Intensity} placeholder="Chọn cường độ" options={INTENSITY_OPTIONS} />
      <TextInput label="Mức tải tập luyện" value={d.TrainingLoad} onChange={set('TrainingLoad')} error={errors.TrainingLoad} inputMode="decimal" maxLength={6} />
      <TextInput label="Quãng đường mục tiêu" unit="km" value={d.DistanceTargetKm} onChange={set('DistanceTargetKm')} error={errors.DistanceTargetKm} inputMode="decimal" maxLength={7} />
      <SelectInput label="Mặt sân" value={d.Surface} onChange={set('Surface')} error={errors.Surface} placeholder="Chọn mặt sân" options={withCurrent(SURFACES, d.Surface)} />
    </div>
    <div style={{ marginTop: 14 }}><TextArea label="Mục tiêu giai đoạn" value={d.Goal} onChange={set('Goal')} error={errors.Goal} rows={2} maxLength={1000} /></div>
    <div className="actions"><button type="button" className="btn sec sm" onClick={onCancel}>Hủy</button><button type="button" className="btn pri sm" onClick={onSave}>Lưu giai đoạn</button></div>
  </div>
}

// ====================================================================== TR04 / TR05 / TR06
export function PlanDetailPage({ role, currentUser }) {
  const { planId } = useParams()
  const navigate = useNavigate()
  const data = useLoad(() => api.plan(planId), [planId])
  const [dialog, setDialog] = useState(null)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState('')
  const act = useAction()
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const p = data.data
  const head = isHead(role)
  const owner = String(p.TrainerID) === String(currentUser?.id)
  const state = planState(p)
  const today = todayIso()
  const cur = p.Status === 'Active' ? currentStage(p, today) : null
  const open = (kind, stage) => { setDialog({ kind, stage }); setNote(''); setNoteError(''); act.setError('') }
  async function run(fn) { const ok = await act.run(async () => { await fn(); return true }); if (ok) { setDialog(null); data.reload() } }
  async function closeStage() { const msg = note.trim() ? checkText(note, 2000) : ''; setNoteError(msg); if (!msg) await run(() => api.closeStage(dialog.stage.TrainingPlanStageID, note.trim() || null)) }
  async function cancelPlan() { const msg = checkText(note, 1000); setNoteError(msg); if (!msg) await run(() => api.cancelPlan(p.TrainingPlanID, note.trim())) }
  async function revise() { const ok = await act.run(async () => api.revisePlan(p.TrainingPlanID)); if (ok) navigate(`/training/plans/${ok.TrainingPlanID}/edit`) }
  const back = head ? ['Giáo án huấn luyện', '/training/plans'] : ['Ngựa và giáo án', '/training/my-plans']
  const showNote = p.ReviewNote && state !== 'Returned'
  return <Page>
    <Crumb items={[back, [planName(p)]]} />
    <Heading title="Chi tiết giáo án" />
    <section className="panel">
      <PlanContext plan={p} meta={planMeta(p, { withTrainer: head })} />
      {state === 'Returned' && <Notice kind="bad" style={{ marginTop: 16 }} title="Huấn luyện viên trưởng đã trả giáo án về">{p.ReviewNote}</Notice>}
      {p.Status === 'Pending Approval' && <Notice kind="info" style={{ marginTop: 16 }}>Giáo án đang chờ Huấn luyện viên trưởng duyệt. Trong thời gian chờ duyệt, giáo án tạm khóa chỉnh sửa.</Notice>}
      {act.error && !dialog && <Notice kind="bad" style={{ marginTop: 16 }}>{act.error}</Notice>}
      <div className="btn-row" style={{ marginTop: 16 }}>
        {p.Status === 'Draft' && owner && <Link className="btn pri" to={`/training/plans/${p.TrainingPlanID}/edit`}><Icon name="edit" size={16} /> {state === 'Returned' ? 'Chỉnh sửa giáo án' : 'Tiếp tục soạn'}</Link>}
        {p.Status === 'Pending Approval' && head && <Link className="btn pri" to={`/training/approvals/${p.TrainingPlanID}`}>Xem và duyệt</Link>}
        {p.Status === 'Active' && <>
          <Link className="btn sec" to={`/training/schedule?planId=${p.TrainingPlanID}`}><Icon name="cal" size={16} /> Lịch tập</Link>
          {owner && <button type="button" className="btn sec" disabled={act.busy} onClick={revise}>Tạo bản điều chỉnh</button>}
          {(owner || head) && <button type="button" className="btn pri" onClick={() => open('complete')}><Icon name="check" size={16} /> Hoàn tất giáo án</button>}
          {(owner || head) && <button type="button" className="btn danger" style={{ marginLeft: 'auto' }} onClick={() => open('cancel')}>Hủy giáo án</button>}
        </>}
        {p.Status === 'Completed' && owner && <button type="button" className="btn sec" disabled={act.busy} onClick={revise}>Tạo bản điều chỉnh</button>}
      </div>
      <h2 className="sec-h">Thông tin giáo án</h2>
      <Dl cols={4} items={[['Mục tiêu', p.Goal, 1], ['Bắt đầu', fmtDate(p.StartDate)], ['Kết thúc', fmtDate(p.EndDate)], ['Cường độ tổng thể', INTENSITY[p.OverallIntensity] || '—'],
        showNote ? ['Ghi chú duyệt', p.ReviewNote] : ['Số giai đoạn', String(p.Stages.length)], p.Note && ['Ghi chú', p.Note, 1]]} />
      <h2 className="sec-h">Các giai đoạn huấn luyện</h2>
      {!p.Stages.length ? <p className="empty">Chưa có giai đoạn huấn luyện.</p> : p.Stages.map((st, i) => {
        const closable = (owner || head) && ['Active', 'Completed'].includes(p.Status) && !st.ClosedAt && st.StartDate <= today
        return <StageCard key={st.TrainingPlanStageID} stage={st} index={i} current={cur?.TrainingPlanStageID === st.TrainingPlanStageID}
          action={closable ? <button type="button" className="btn pri sm" onClick={() => open('close', st)}>Chốt giai đoạn</button> : null} />
      })}
    </section>
    {dialog?.kind === 'close' && <Dialog title={`Chốt giai đoạn ${dialog.stage.StageOrder} · ${dialog.stage.StageName}?`} onClose={() => setDialog(null)} actions={<>
      <button type="button" className="btn sec" onClick={() => setDialog(null)}>Hủy</button>
      <button type="button" className="btn pri" disabled={act.busy} onClick={closeStage}>Chốt giai đoạn</button></>}>
      <p>Sau khi chốt, giai đoạn không thể chỉnh sửa và các buổi tập tiếp theo sẽ thuộc giai đoạn kế tiếp. Tổng kết giai đoạn được gửi đến chủ ngựa.</p>
      <TextArea label="Nhận xét tổng kết" value={note} onChange={(v) => { setNote(v); setNoteError('') }} error={noteError} rows={3} maxLength={2000} />
      {act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}
    </Dialog>}
    {dialog?.kind === 'complete' && <Dialog title={`Hoàn tất ${planName(p).toLowerCase()}?`} onClose={() => setDialog(null)} actions={<>
      <button type="button" className="btn sec" onClick={() => setDialog(null)}>Kiểm tra lại</button>
      <button type="button" className="btn pri" disabled={act.busy} onClick={() => run(() => api.completePlan(p.TrainingPlanID))}><Icon name="check" size={16} /> Hoàn tất giáo án</button></>}>
      <p>Giáo án của {p.HorseName} sẽ chuyển sang trạng thái đã hoàn thành. Các buổi tập chưa diễn ra sẽ được hủy và các giai đoạn đã bắt đầu sẽ được chốt cùng giáo án.</p>
      {act.error && <Notice kind="bad">{act.error}</Notice>}
    </Dialog>}
    {dialog?.kind === 'cancel' && <Dialog title={`Hủy ${planName(p).toLowerCase()}?`} onClose={() => setDialog(null)} actions={<>
      <button type="button" className="btn sec" onClick={() => setDialog(null)}>Đóng</button>
      <button type="button" className="btn danger fill" disabled={act.busy} onClick={cancelPlan}>Hủy giáo án</button></>}>
      <p>Giáo án của {p.HorseName} sẽ dừng áp dụng và các buổi tập chưa diễn ra sẽ được hủy. Thao tác này không thể hoàn tác.</p>
      <TextArea label="Lý do hủy" required value={note} onChange={(v) => { setNote(v); setNoteError('') }} error={noteError} rows={3} maxLength={1000} />
      {act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}
    </Dialog>}
  </Page>
}


