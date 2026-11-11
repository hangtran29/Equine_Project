// Huấn luyện viên trưởng: Tổng quan (HT01), Đánh giá và phân công (HT02, HT03), Lịch sử đánh giá (HT04),
// Hồ sơ huấn luyện viên (HT05), Giáo án huấn luyện (HT06), Duyệt giáo án (HT07–HT09), Kết quả tập luyện (HT12),
// Điều chỉnh giáo án (HT13).
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge, Crumb, DateField, Dialog, Dl, Field, Heading, Icon, Loading, Notice, SectionTitle, SelectInput, TextArea, TextInput, errorText, fmtDate, fmtDateTime, useAction, useLoad } from '../flow1/ui.jsx'
import { HorseThumb, SEX } from '../flow1/horse.jsx'
import { MSG, checkSelect, checkText, runChecks, serverFieldErrors } from '../utils/validation.js'
import {
  DECISION, EvalBadge, FITNESS, INTENSITY, Pager, PlanBadge, PlanContext, Search, SessionBadge, SessionDonut, StageCard, Tabs,
  ageOf, api, daysBetween, fullRange, healthBadge, initials, km, matches, minutes, num, planMeta, planName, planState,
  specLabel, todayIso, usePager,
} from './common.jsx'

const HOME = '/training/dashboard'
const Page = ({ children }) => <main className="page-content f1">{children}</main>
const Fail = ({ error }) => <Page><Notice kind="bad" style={{ marginTop: 30 }}>{errorText(error)}</Notice></Page>
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

/** Giáo án "hiện hành" của một ngựa: chờ duyệt > đang áp dụng > bản nháp / bị trả về. */
function currentPlanOf(plans, horseId) {
  const mine = plans.filter((p) => p.HorseID === horseId)
  return mine.find((p) => p.Status === 'Pending Approval') || mine.find((p) => p.Status === 'Active')
    || mine.find((p) => p.Status === 'Draft') || null
}

// ====================================================================== HT01
const HORSE_FILTERS = [['', 'Tất cả trạng thái'], ['unassigned', 'Chưa phân công'], ['pending', 'Giáo án chờ duyệt'],
  ['active', 'Giáo án đang áp dụng'], ['noplan', 'Chưa có giáo án'], ['locked', 'Tạm dừng tập']]

export function HeadDashboardPage() {
  const data = useLoad(async () => {
    const [horses, plans, sessions, reviews] = await Promise.all([api.dashboard(), api.plans(), api.sessions(), api.reviews({ AdjustmentRequired: 1, Days: 30 })])
    return { horses, plans, sessions, reviews }
  }, [])
  const [text, setText] = useState('')
  const [filter, setFilter] = useState('')
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const { horses, plans, sessions, reviews } = data.data
  const lastSession = {}
  for (const s of sessions) if (s.Status === 'Completed' && (!lastSession[s.HorseID] || lastSession[s.HorseID].SessionDate < s.SessionDate)) lastSession[s.HorseID] = s
  const pending = plans.filter((p) => p.Status === 'Pending Approval')
  const unassigned = horses.filter((h) => !h.TrainerID)
  const rows = horses.map((h) => ({ ...h, plan: currentPlanOf(plans, h.HorseID), last: lastSession[h.HorseID] }))
  const inFilter = (h) => !filter || (filter === 'unassigned' && !h.TrainerID) || (filter === 'pending' && h.plan?.Status === 'Pending Approval')
    || (filter === 'active' && h.plan?.Status === 'Active') || (filter === 'noplan' && h.TrainerID && !h.plan) || (filter === 'locked' && h.IsTrainingLocked)
  const shown = rows.filter((h) => inFilter(h) && matches(text, h.HorseName, h.HorseCode, h.TrainerName))
  const todos = [
    pending.length && { icon: 'check', title: `${pending.length} giáo án chờ duyệt`, note: pending.slice(0, 2).map((p) => `${p.HorseName} · Huấn luyện viên ${p.TrainerName}`).join('; '),
      to: pending.length === 1 ? `/training/approvals/${pending[0].TrainingPlanID}` : '/training/approvals', action: 'Xem' },
    unassigned.length && { icon: 'user', title: `${unassigned.length} ngựa chưa có huấn luyện viên`, note: unassigned.map((h) => h.HorseName).join(', '),
      to: `/training/horses/${unassigned[0].HorseID}/assessment`, action: 'Phân công' },
    reviews.length && { icon: 'edit', title: `${reviews.length} đề xuất điều chỉnh giáo án`, note: `${reviews[0].HorseName} · buổi tập ${fmtDate(reviews[0].SessionDate)}`,
      to: '/training/adjustments', action: 'Xem' },
  ].filter(Boolean)
  const todoCount = pending.length + unassigned.length + reviews.length
  return <Page>
    <Crumb items={[['Tổng quan huấn luyện']]} />
    <Heading title="Tổng quan huấn luyện" />
    <section className="panel">
      <div className="kpis">
        <div className="kpi"><small>Ngựa đủ điều kiện tập</small><b>{horses.filter((h) => !h.IsTrainingLocked && ['Healthy', 'Monitor'].includes(h.CurrentHealthStatus)).length}</b></div>
        <div className="kpi"><small>Đã phân công huấn luyện viên</small><b>{horses.filter((h) => h.TrainerID).length}</b></div>
        <div className="kpi"><small>Giáo án đang áp dụng</small><b>{plans.filter((p) => p.Status === 'Active').length}</b></div>
        <div className="kpi"><small>Việc cần xử lý</small><b className={todoCount ? 'warm' : ''}>{todoCount}</b></div>
      </div>
      <div className="grid">
        <SessionDonut sessions={sessions} />
        <div className="card"><h2 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 600 }}>Việc cần xử lý</h2>
          {todos.length ? todos.map((t) => <div className="todo" key={t.title}><span className="sicon"><Icon name={t.icon} /></span>
            <div><b>{t.title}</b><small>{t.note}</small></div><Link className="btn sec sm" to={t.to}>{t.action}</Link></div>)
            : <p className="empty">Không có việc cần xử lý.</p>}
        </div>
      </div>
      <div className="toolbar" style={{ marginTop: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Ngựa huấn luyện</h2>
        <Search value={text} onChange={setText} placeholder="Tìm ngựa, mã ngựa, huấn luyện viên" />
        <select className="input" style={{ width: 210 }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Lọc trạng thái">
          {HORSE_FILTERS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
      </div>
      {!shown.length ? <p className="empty">Không có ngựa phù hợp.</p> : <table>
        <thead><tr><th>Ngựa</th><th>Sức khỏe</th><th>Huấn luyện viên</th><th>Giáo án</th><th>Buổi gần nhất</th><th>Hiệu suất gần nhất</th><th>Thao tác</th></tr></thead>
        <tbody>{shown.map((h) => <tr key={h.HorseID} className={!h.TrainerID ? 'hl' : ''}>
          <td><div className="hname"><HorseThumb horseId={h.HorseID} /><div><b>{h.HorseName}</b><small>{[h.HorseCode, SEX[h.Gender]].filter(Boolean).join(' · ')}</small></div></div></td>
          <td>{h.IsTrainingLocked ? <Badge kind="bad">Tạm dừng tập</Badge> : healthBadge(h.CurrentHealthStatus)}</td>
          <td>{h.TrainerID ? <><b>{h.TrainerName}</b><small>{specLabel(h.SpecializationName)}</small></> : <Badge kind="wait">Chưa phân công</Badge>}</td>
          <td>{h.plan ? <PlanBadge plan={h.plan} /> : <span className="muted">Chưa có</span>}</td>
          <td>{h.last ? <><b>{fmtDate(h.last.SessionDate)}</b><small>{[km(h.last.Result?.ActualDistanceKm), minutes(h.last.Result?.ActualDurationMinutes)].join(' · ')}</small></>
            : <span className="muted">Chưa có buổi tập</span>}</td>
          <td>{h.LatestPerformanceScore != null ? <><b>Điểm {num(h.LatestPerformanceScore, 0)}</b><small>{num(h.LatestAvgSpeedKmh)} km/h · hồi phục {num(h.LatestRecoveryMinutes, 0)} phút</small></>
            : <span className="muted">Chưa có dữ liệu</span>}</td>
          <td><div className="btn-row">{h.TrainerID ? <>
            <Link className="btn pri sm" to={`/training/horses/${h.HorseID}/assessment`}>Đánh giá</Link>
            <Link className="btn sec sm" to={`/training/horses/${h.HorseID}/assessment-history`}>Lịch sử</Link></>
            : <Link className="btn pri sm" to={`/training/horses/${h.HorseID}/assessment`}>Đánh giá và phân công</Link>}</div></td>
        </tr>)}</tbody></table>}
    </section>
  </Page>
}

// ====================================================================== HT02 / HT03
function useHorseTraining(horseId) {
  return useLoad(async () => {
    const [horse, assessments, assignments, plans] = await Promise.all([api.horse(horseId), api.assessments(horseId),
      api.assignments({ HorseID: horseId, Status: 'Active' }), api.plans({ HorseID: horseId })])
    return { horse, assessments, assignment: assignments[0] || null, plan: currentPlanOf(plans, Number(horseId)) }
  }, [horseId])
}

function HorseTrainingContext({ horse, assignment, plan, assessments }) {
  const spec = assignment?.SpecializationName || assessments.find((a) => a.DecisionStatus === 'Recommended')?.SpecializationName
  const planText = plan ? `#${plan.TrainingPlanID} · ${({ Active: 'Đang áp dụng', 'Pending Approval': 'Chờ duyệt', Draft: 'Bản nháp', Returned: 'Bị trả về' })[planState(plan)] || plan.Status}` : 'Chưa có'
  return <div className="ctx"><div className="who"><HorseThumb horseId={horse.HorseID} size={64} />
    <div><h2>{horse.HorseName}</h2><p>{[horse.HorseCode, horse.Breed, SEX[horse.Gender], ageOf(horse.DateOfBirth)].filter(Boolean).join(' · ')}</p></div></div>
    <div className="mini">
      <div><small>Sức khỏe</small><b>{healthBadgeText(horse.CurrentHealthStatus || horse.HealthSummary?.HealthStatus)}</b></div>
      <div><small>Huấn luyện viên</small><b>{assignment?.TrainerName || 'Chưa phân công'}</b></div>
      <div><small>Chuyên môn</small><b>{spec ? specLabel(spec) : 'Chưa xác định'}</b></div>
      <div><small>Giáo án</small><b>{planText}</b></div>
    </div></div>
}
const HEALTH_TEXT = { Healthy: 'Khỏe mạnh', Monitor: 'Đang theo dõi', Monitoring: 'Đang theo dõi', Injured: 'Chấn thương', Sick: 'Đang bệnh', Recovering: 'Đang hồi phục', Isolated: 'Cách ly' }
const healthBadgeText = (s) => HEALTH_TEXT[s] || 'Chưa cập nhật'

export function AssessmentPage() {
  const { horseId } = useParams()
  const data = useHorseTraining(horseId)
  const specs = useLoad(() => api.specializations(), [])
  if (data.loading || specs.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const { horse, assessments, assignment, plan } = data.data
  const latest = assessments[0]
  return <Page>
    <Crumb items={[['Tổng quan huấn luyện', HOME], [horse.HorseName], ['Đánh giá và phân công']]} />
    <Heading title="Đánh giá và phân công" />
    <section className="panel">
      <HorseTrainingContext horse={horse} assignment={assignment} plan={plan} assessments={assessments} />
      {!assignment && <Notice style={{ marginTop: 16 }}>{horse.HorseName} chưa có huấn luyện viên phụ trách. Vui lòng hoàn tất đánh giá để xác định chuyên môn, sau đó phân công huấn luyện viên phù hợp.</Notice>}
      <div className="two" style={{ marginTop: 18, gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr)' }}>
        <AssessmentForm horseId={horseId} specs={specs.data || []} defaultSpec={assignment?.SpecializationID || latest?.SpecializationID} onSaved={data.reload} />
        <div style={{ display: 'grid', gap: 16 }}>
          {assignment ? <>
            {latest && <LatestAssessment a={latest} horseId={horseId} />}
            <CurrentTrainer assignment={assignment} onEnded={data.reload} />
          </> : <AssignTrainer horse={horse} assessments={assessments} onAssigned={data.reload} />}
        </div>
      </div>
    </section>
  </Page>
}

function AssessmentForm({ horseId, specs, defaultSpec, onSaved }) {
  const blank = { SpecializationID: defaultSpec ? String(defaultSpec) : '', QualityScore: '', FitnessLevel: '', DecisionStatus: '', AssessmentNote: '' }
  const [form, setForm] = useState(blank)
  const [errors, setErrors] = useState({})
  const [done, setDone] = useState('')
  const act = useAction()
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); setDone('') }
  async function save(e) {
    e.preventDefault()
    const found = runChecks({
      SpecializationID: () => checkSelect(form.SpecializationID), FitnessLevel: () => checkSelect(form.FitnessLevel), DecisionStatus: () => checkSelect(form.DecisionStatus),
      QualityScore: () => { const t = String(form.QualityScore).trim(); if (!t) return ''; const n = Number(t.replace(',', '.')); return Number.isNaN(n) ? 'Giá trị phải là số.' : n < 0 || n > 100 ? 'Giá trị phải từ 0 đến 100.' : '' },
      AssessmentNote: () => (form.AssessmentNote.trim() ? checkText(form.AssessmentNote, 2000) : ''),
    })
    setErrors(found)
    if (Object.keys(found).length) return
    await act.run(async () => {
      try {
        await api.addAssessment(horseId, { SpecializationID: Number(form.SpecializationID), FitnessLevel: form.FitnessLevel, DecisionStatus: form.DecisionStatus,
          QualityScore: String(form.QualityScore).trim() ? Number(String(form.QualityScore).replace(',', '.')) : null, AssessmentNote: form.AssessmentNote.trim() || null })
      } catch (err) { const f = serverFieldErrors(err); if (Object.keys(f).length) { setErrors(f); return } throw err }
      setForm({ ...blank, SpecializationID: form.SpecializationID }); setDone('Đã lưu đánh giá.'); onSaved()
    })
  }
  return <form className="card" onSubmit={save} noValidate><SectionTitle icon="check">Đánh giá mới</SectionTitle>
    <div className="fgrid">
      <SelectInput label="Chuyên môn đề xuất" required value={form.SpecializationID} onChange={set('SpecializationID')} error={errors.SpecializationID}
        placeholder="Chọn chuyên môn" options={specs.map((s) => [String(s.SpecializationID), specLabel(s.SpecializationName)])} />
      <TextInput label="Điểm chất lượng" unit="/ 100" inputMode="decimal" maxLength={6} value={form.QualityScore} onChange={set('QualityScore')} error={errors.QualityScore} />
      <SelectInput label="Thể trạng" required value={form.FitnessLevel} onChange={set('FitnessLevel')} error={errors.FitnessLevel} placeholder="Chọn thể trạng" options={Object.entries(FITNESS)} />
      <SelectInput label="Kết luận" required value={form.DecisionStatus} onChange={set('DecisionStatus')} error={errors.DecisionStatus} placeholder="Chọn kết luận"
        options={[['Recommended', 'Đề xuất tiếp tục huấn luyện'], ['Rejected', 'Không đề xuất']]} />
    </div>
    <div style={{ marginTop: 14 }}><TextArea label="Ghi chú đánh giá" value={form.AssessmentNote} onChange={set('AssessmentNote')} error={errors.AssessmentNote} rows={3} maxLength={2000} /></div>
    {act.error && <Notice kind="bad" style={{ marginTop: 14 }}>{act.error}</Notice>}
    {done && <Notice kind="ok" style={{ marginTop: 14 }}>{done}</Notice>}
    <div className="actions"><button type="submit" className="btn pri" disabled={act.busy}>{act.busy ? 'Đang lưu...' : 'Lưu đánh giá'}</button></div>
  </form>
}

function LatestAssessment({ a, horseId }) {
  return <div className="card"><SectionTitle icon="file">Đánh giá gần nhất</SectionTitle>
    <Dl cols={2} items={[['Chuyên môn', specLabel(a.SpecializationName)], ['Điểm chất lượng', a.QualityScore != null ? `${num(a.QualityScore, 0)} / 100` : '—'],
      ['Thể trạng', FITNESS[a.FitnessLevel] || '—', 1], ['Kết luận', (DECISION[a.DecisionStatus] || [])[2] || a.DecisionStatus, 1],
      ['Người đánh giá', a.HeadTrainerName], ['Thời điểm', fmtDateTime(a.AssessmentDate)]]} />
    <div style={{ marginTop: 16 }}><Link className="btn sec sm" to={`/training/horses/${horseId}/assessment-history`}>Xem lịch sử đánh giá</Link></div>
  </div>
}

function CurrentTrainer({ assignment: a, onEnded }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const act = useAction()
  async function end() {
    const msg = checkText(reason, 1000)
    setError(msg)
    if (msg) return
    const ok = await act.run(async () => { await api.endAssignment(a.TrainerHorseAssignmentID, reason.trim()); return true })
    if (ok) { setOpen(false); onEnded() }
  }
  return <div className="card"><SectionTitle icon="user">Huấn luyện viên phụ trách</SectionTitle>
    <div className="contact" style={{ marginTop: 0 }}><span className="av">{initials(a.TrainerName)}</span>
      <div><b>{a.TrainerName}</b><small>{specLabel(a.SpecializationName)} · từ {fmtDate(a.StartDate)}</small></div>
      <Link className="link" to={`/training/trainers/${a.TrainerID}`}>Hồ sơ</Link></div>
    <div style={{ marginTop: 16 }}><button type="button" className="btn danger sm" onClick={() => { setOpen(true); setReason(''); setError('') }}>Kết thúc phân công</button></div>
    {open && <Dialog title="Kết thúc phân công?" onClose={() => setOpen(false)} actions={<>
      <button type="button" className="btn sec" onClick={() => setOpen(false)}>Hủy</button>
      <button type="button" className="btn danger fill" disabled={act.busy} onClick={end}>Kết thúc phân công</button></>}>
      <p>{a.TrainerName} sẽ thôi phụ trách {a.HorseName}. Các buổi tập chưa diễn ra của giáo án hiện hành sẽ được hủy.</p>
      <TextArea label="Lý do kết thúc" required value={reason} onChange={(v) => { setReason(v); setError('') }} error={error} rows={3} maxLength={1000} />
      {act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}
    </Dialog>}
  </div>
}

function AssignTrainer({ horse, assessments, onAssigned }) {
  const trainers = useLoad(() => api.trainers(), [])
  const basis = assessments.find((a) => a.DecisionStatus === 'Recommended')
  const [pick, setPick] = useState('')
  const [start, setStart] = useState(todayIso())
  const [errors, setErrors] = useState({})
  const act = useAction()
  if (!basis) return <div className="card"><SectionTitle icon="user">Phân công huấn luyện viên</SectionTitle>
    <p className="hint" style={{ margin: 0 }}>Vui lòng lưu đánh giá với kết luận đề xuất tiếp tục huấn luyện để xác định chuyên môn trước khi phân công.</p></div>
  if (trainers.loading) return <div className="card"><Loading /></div>
  const fit = (trainers.data || []).filter((t) => t.Specializations.some((s) => s.SpecializationID === basis.SpecializationID))
  async function assign() {
    const found = runChecks({ TrainerID: () => checkSelect(pick), StartDate: () => (start ? '' : MSG.required) })
    setErrors(found)
    if (Object.keys(found).length) return
    const ok = await act.run(async () => {
      await api.assign({ HorseID: horse.HorseID, TrainerID: Number(pick), SpecializationID: basis.SpecializationID, AssessmentID: basis.AssessmentID, StartDate: start })
      return true
    })
    if (ok) onAssigned()
  }
  return <div className="card"><SectionTitle icon="user">Phân công huấn luyện viên</SectionTitle>
    <p className="hint" style={{ margin: '-4px 0 12px' }}>Huấn luyện viên có chuyên môn {specLabel(basis.SpecializationName)}</p>
    {!fit.length ? <p className="empty">Chưa có huấn luyện viên thuộc chuyên môn này.</p> : fit.map((t) => <label key={t.UserID} className={`pick ${pick === String(t.UserID) ? 'on' : ''}`}>
      <input type="radio" name="trainer" checked={pick === String(t.UserID)} onChange={() => { setPick(String(t.UserID)); setErrors({}) }} />
      <span className="av">{initials(t.FullName)}</span>
      <div><b>{t.FullName}</b><small>{[t.ExperienceLevelName, t.YearsOfExperience != null ? `${t.YearsOfExperience} năm` : '', t.TrainerRating != null ? `Xếp hạng ${num(t.TrainerRating)}/5` : ''].filter(Boolean).join(' · ')}</small></div>
      <em>{t.ActiveHorseCount} ngựa</em></label>)}
    {errors.TrainerID && <span className="field-error" role="alert">{errors.TrainerID}</span>}
    <div style={{ marginTop: 12 }}><DateField label="Ngày bắt đầu" required value={start} onChange={(v) => { setStart(v); setErrors((e) => ({ ...e, StartDate: undefined })) }} error={errors.StartDate} min={todayIso()} /></div>
    {act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}
    <div className="actions"><button type="button" className="btn pri" disabled={act.busy} onClick={assign}><Icon name="check" size={16} /> Phân công</button></div>
  </div>
}

// ====================================================================== HT04
export function AssessmentHistoryPage() {
  const { horseId } = useParams()
  const data = useHorseTraining(horseId)
  const [tab, setTab] = useState('all')
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const { horse, assessments, assignment, plan } = data.data
  const count = (d) => assessments.filter((a) => a.DecisionStatus === d).length
  const shown = assessments.filter((a) => tab === 'all' || a.DecisionStatus === tab)
  const order = Object.fromEntries(assessments.slice().reverse().map((a, i) => [a.AssessmentID, i + 1]))
  return <Page>
    <Crumb items={[['Tổng quan huấn luyện', HOME], [horse.HorseName, `/training/horses/${horseId}/assessment`], ['Lịch sử đánh giá']]} />
    <Heading title="Lịch sử đánh giá" />
    <section className="panel">
      <HorseTrainingContext horse={horse} assignment={assignment} plan={plan} assessments={assessments} />
      <div className="toolbar" style={{ marginTop: 18 }}>
        <Tabs value={tab} onChange={setTab} tabs={[['all', 'Tất cả', assessments.length], ['Recommended', 'Đề xuất', count('Recommended')],
          ['Rejected', 'Không đề xuất', count('Rejected')], ['Superseded', 'Đã thay thế', count('Superseded')]]} />
        <Link className="btn pri" style={{ marginLeft: 'auto' }} to={`/training/horses/${horseId}/assessment`}><Icon name="plus" size={16} /> Đánh giá mới</Link>
      </div>
      {!shown.length ? <p className="empty">Chưa có lần đánh giá nào.</p> : <div className="tl">{shown.map((a, i) => {
        const [kind, label, conclusion] = DECISION[a.DecisionStatus] || ['draft', a.DecisionStatus, a.DecisionStatus]
        return <div key={a.AssessmentID} className={`tl-item ${i === 0 && tab === 'all' ? 'first' : ''}`}><i />
          <div className="card"><div className="tl-head"><div><h3>{specLabel(a.SpecializationName)} <Badge kind={kind}>{label}</Badge></h3>
            <small>Lần đánh giá #{order[a.AssessmentID]} · {fmtDateTime(a.AssessmentDate)} · {a.HeadTrainerName}</small></div>
            {a.QualityScore != null && <div className="score">{num(a.QualityScore, 0)}<small>/ 100</small></div>}</div>
            <div style={{ marginTop: 12 }}><Dl cols={2} items={[['Thể trạng', FITNESS[a.FitnessLevel] || '—'], ['Kết luận', conclusion], ['Ghi chú', a.AssessmentNote || '—', 1]]} /></div>
          </div></div>
      })}</div>}
    </section>
  </Page>
}

// ====================================================================== HT05
const CREDENTIAL_TYPES = [['License', 'Giấy phép'], ['Certificate', 'Chứng chỉ'], ['Degree', 'Bằng cấp'], ['Award', 'Giải thưởng']]
const RACE_CLASSES = [['Group 1', 'Hạng 1'], ['Group 2', 'Hạng 2'], ['Group 3', 'Hạng 3'], ['Listed', 'Hạng danh sách'], ['Handicap', 'Đua chấp'],
  ['Maiden', 'Đua cho ngựa chưa thắng'], ['Other', 'Hạng khác']]

// Hồ sơ dùng chung cho Huấn luyện viên trưởng và Chi tiết tài khoản của Quản lý.
const TRAINERS = '/training/trainers'
const LEVEL_OPTIONS = [['Expert', 'Chuyên gia'], ['Senior', 'Kỳ cựu'], ['Intermediate', 'Trung cấp'], ['Junior', 'Mới vào nghề']]
const winRateText = (t) => (t.CareerWinRate != null ? `${num(t.CareerWinRate)}%` : '—')
const yearsText = (t) => (t.YearsOfExperience != null ? `${t.YearsOfExperience} năm` : '—')
const specText = (t) => t.Specializations.map((s) => specLabel(s.SpecializationName)).join(', ') || 'Chưa có'

export function TrainersPage() {
  const data = useLoad(async () => {
    const [trainers, specs] = await Promise.all([api.trainers(), api.specializations()])
    return { trainers, specs }
  }, [])
  const [text, setText] = useState('')
  const [spec, setSpec] = useState('')
  const [level, setLevel] = useState('')
  const all = data.data?.trainers || []
  const shown = all.filter((t) => matches(text, t.FullName, t.Email, t.Phone)
    && (!spec || t.Specializations.some((s) => String(s.SpecializationID) === spec)) && (!level || t.ExperienceLevel === level))
  const pager = usePager(shown, 10)
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const avgYears = all.length ? all.reduce((sum, t) => sum + (t.YearsOfExperience || 0), 0) / all.length : null
  const seniors = all.filter((t) => ['Senior', 'Expert'].includes(t.ExperienceLevel)).length
  const horses = all.reduce((sum, t) => sum + (t.ActiveHorseCount || 0), 0)
  return <Page>
    <Crumb items={[['Hồ sơ huấn luyện viên']]} />
    <Heading title="Hồ sơ huấn luyện viên" />
    <section className="panel">
      <div className="kpis">
        <div className="kpi"><small>Huấn luyện viên</small><b>{all.length}</b></div>
        <div className="kpi"><small>Kinh nghiệm trung bình</small><b>{avgYears != null ? `${num(avgYears)} năm` : '—'}</b></div>
        <div className="kpi"><small>Kỳ cựu và chuyên gia</small><b>{seniors}</b></div>
        <div className="kpi"><small>Ngựa đang phụ trách</small><b>{horses}</b></div>
      </div>
      <div className="toolbar">
        <Search value={text} onChange={setText} placeholder="Tìm theo tên hoặc email" />
        <select className="input" style={{ width: 210 }} value={spec} onChange={(e) => setSpec(e.target.value)} aria-label="Chuyên môn">
          <option value="">Tất cả chuyên môn</option>
          {data.data.specs.map((s) => <option key={s.SpecializationID} value={s.SpecializationID}>{specLabel(s.SpecializationName)}</option>)}</select>
        <select className="input" style={{ width: 190 }} value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Cấp độ">
          <option value="">Tất cả cấp độ</option>
          {LEVEL_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select>
      </div>
      {!shown.length ? <p className="empty">Không có huấn luyện viên phù hợp.</p> : <>
        <table><thead><tr><th>Huấn luyện viên</th><th>Chuyên môn</th><th>Kinh nghiệm</th><th>Cấp độ</th><th>Bằng cấp, chứng chỉ</th>
          <th>Ngựa đang phụ trách</th><th>Tỷ lệ thắng</th><th>Thao tác</th></tr></thead>
          <tbody>{pager.slice.map((t) => <tr key={t.UserID}>
            <td><div className="hname"><span className="av">{initials(t.FullName)}</span><div><b>{t.FullName}</b><small>{t.Email}</small></div></div></td>
            <td style={{ maxWidth: 260 }}>{specText(t)}</td><td>{yearsText(t)}</td><td>{t.ExperienceLevelName || '—'}</td>
            <td>{(t.QualificationCount || 0) + (t.AwardCount || 0)}</td><td>{t.ActiveHorseCount}</td><td>{winRateText(t)}</td>
            <td><Link className="btn sec sm" to={`${TRAINERS}/${t.UserID}`}>Xem hồ sơ</Link></td></tr>)}</tbody></table>
        <Pager pager={pager} noun="huấn luyện viên" /></>}
    </section>
  </Page>
}

function useTrainerProfile(trainerId) {
  return useLoad(async () => {
    const [trainer, credentials, races, specs] = await Promise.all([api.trainer(trainerId), api.credentials(trainerId), api.raceResults(trainerId), api.specializations()])
    return { trainer, credentials, races, specs }
  }, [trainerId])
}

export function TrainerProfilePage({ canEdit = true }) {
  const { trainerId } = useParams()
  const data = useTrainerProfile(trainerId)
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const t = data.data.trainer
  return <Page>
    <Crumb items={[['Hồ sơ huấn luyện viên', TRAINERS], [t.FullName]]} />
    <Heading title="Hồ sơ huấn luyện viên" />
    <section className="panel">
      <div className="ctx"><div className="who"><span className="av lg">{initials(t.FullName)}</span>
        <div><h2>{t.FullName}</h2><p>{[t.Email, t.Phone, `Chuyên môn: ${specText(t)}`].filter(Boolean).join(' · ')}</p></div></div></div>
      <TrainerProfileView data={data.data} canEdit={canEdit} onChanged={data.reload} />
    </section>
  </Page>
}

/** Hồ sơ huấn luyện viên trong Chi tiết tài khoản của Quản lý câu lạc bộ (được sửa). */
export function TrainerProfileSection({ trainerId }) {
  const data = useTrainerProfile(trainerId)
  if (data.loading) return <Loading />
  if (data.error) return <Notice kind="bad">{errorText(data.error)}</Notice>
  return <TrainerProfileView data={data.data} canEdit onChanged={data.reload} />
}

function TrainerProfileView({ data: { trainer: t, credentials, races, specs }, canEdit, onChanged }) {
  return <>
    <div className="kpis five" style={{ marginTop: 16 }}>
      <div className="kpi"><small>Kinh nghiệm</small><b>{yearsText(t)}</b></div>
      <div className="kpi"><small>Cấp độ</small><b>{t.ExperienceLevelName || '—'}</b></div>
      <div className="kpi"><small>Bằng cấp, chứng chỉ</small><b>{credentials.length}</b></div>
      <div className="kpi"><small>Ngựa đang phụ trách</small><b>{t.ActiveHorseCount}</b></div>
      <div className="kpi"><small>Tỷ lệ thắng</small><b>{winRateText(t)}</b></div>
    </div>
    <div className="grid">
      <ProfileForm trainer={t} specs={specs} canEdit={canEdit} onSaved={onChanged} />
      <Credentials trainerId={t.UserID} items={credentials} canEdit={canEdit} onChanged={onChanged} />
    </div>
    <RaceResults trainerId={t.UserID} items={races} canEdit={canEdit} onChanged={onChanged} />
  </>
}

function ProfileForm({ trainer: t, specs, canEdit, onSaved }) {
  const [start, setStart] = useState(t.CareerStartDate || '')
  const [rating, setRating] = useState(t.TrainerRating != null ? String(t.TrainerRating).replace('.', ',') : '')
  const [ratingError, setRatingError] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const act = useAction()
  const owned = new Set(t.Specializations.map((s) => s.SpecializationID))
  async function save() {
    const found = !start ? MSG.required : start > todayIso() ? 'Ngày bắt đầu sự nghiệp không được sau ngày hiện tại.' : ''
    setError(found)
    const ratingValue = rating.trim() === '' ? null : Number(rating.replace(',', '.'))
    const invalidRating = ratingValue !== null && (!Number.isFinite(ratingValue) || ratingValue < 0 || ratingValue > 5)
    setRatingError(invalidRating ? 'Giá trị phải từ 0 đến 5.' : '')
    if (found || invalidRating) return
    await act.run(async () => {
      try { await api.updateTrainerProfile(t.UserID, { CareerStartDate: start, ...(ratingValue !== null ? { TrainerRating: ratingValue } : {}) }) }
      catch (err) { const f = serverFieldErrors(err); if (f.CareerStartDate || f.TrainerRating) { setError(f.CareerStartDate || ''); setRatingError(f.TrainerRating || ''); return } throw err }
      setDone('Đã lưu hồ sơ.'); onSaved()
    })
  }
  const toggle = (fn) => act.run(async () => { await fn(); onSaved() })
  return <div className="card"><SectionTitle icon="user">Thông tin chuyên môn</SectionTitle>
    <div className="fgrid">
      {canEdit ? <DateField label="Ngày bắt đầu sự nghiệp" required value={start} onChange={(v) => { setStart(v); setError(''); setDone('') }} error={error} max={todayIso()} />
        : <Field label="Ngày bắt đầu sự nghiệp"><input className="input ro" readOnly value={t.CareerStartDate ? fmtDate(t.CareerStartDate) : 'Chưa cập nhật'} /></Field>}
      <Field label="Số năm kinh nghiệm"><input className="input ro" readOnly value={yearsText(t)} /></Field>
      <TextInput label="Điểm xếp hạng" unit="/ 5" inputMode="decimal" maxLength={4} value={rating} onChange={(value) => { setRating(value); setRatingError(''); setDone('') }} error={ratingError} disabled={!canEdit} />
    </div>
    {canEdit && <p className="hint" style={{ marginTop: 8 }}>Số năm kinh nghiệm và cấp độ tự tính từ ngày bắt đầu sự nghiệp.</p>}
    <div className="field" style={{ marginTop: 14 }}><span>Chuyên môn</span>
      <div className="chips">{!t.Specializations.length && !canEdit && <span className="hint">Chưa có</span>}
        {t.Specializations.map((s) => <span key={s.SpecializationID} className="spec-chip">{specLabel(s.SpecializationName)}
        {canEdit && <button type="button" aria-label={`Bỏ chuyên môn ${specLabel(s.SpecializationName)}`} onClick={() => toggle(() => api.removeSpecialization(t.UserID, s.SpecializationID))}>×</button>}</span>)}
        {canEdit && specs.some((s) => !owned.has(s.SpecializationID)) && <label className="spec-add"><Icon name="plus" size={14} />
          <select value="" aria-label="Thêm chuyên môn" onChange={(e) => e.target.value && toggle(() => api.addSpecialization(t.UserID, e.target.value))}>
            <option value="">Thêm chuyên môn</option>{specs.filter((s) => !owned.has(s.SpecializationID)).map((s) => <option key={s.SpecializationID} value={s.SpecializationID}>{specLabel(s.SpecializationName)}</option>)}</select></label>}
      </div></div>
    {act.error && <Notice kind="bad" style={{ marginTop: 14 }}>{act.error}</Notice>}
    {done && <Notice kind="ok" style={{ marginTop: 14 }}>{done}</Notice>}
    {canEdit && <div className="actions"><button type="button" className="btn pri" disabled={act.busy} onClick={save}>Lưu hồ sơ</button></div>}
  </div>
}

function Credentials({ trainerId, items, canEdit, onChanged }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  const act = useAction()
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }
  const typeText = Object.fromEntries(CREDENTIAL_TYPES)
  async function add() {
    const found = runChecks({ CredentialType: () => checkSelect(form.CredentialType), Title: () => checkText(form.Title, 200),
      IssuedBy: () => (form.IssuedBy?.trim() ? checkText(form.IssuedBy, 200) : ''), IssuedDate: () => (form.IssuedDate ? '' : MSG.required),
      ExpiryDate: () => (form.ExpiryDate && form.IssuedDate && form.ExpiryDate < form.IssuedDate ? 'Ngày hết hạn không được trước ngày cấp.' : '') })
    setErrors(found)
    if (Object.keys(found).length) return
    const ok = await act.run(async () => {
      try { await api.addCredential(trainerId, { CredentialType: form.CredentialType, Title: form.Title.trim(), IssuedBy: form.IssuedBy?.trim() || null, IssuedDate: form.IssuedDate, ExpiryDate: form.ExpiryDate || null }) }
      catch (err) { const f = serverFieldErrors(err); if (Object.keys(f).length) { setErrors(f); return false } throw err }
      return true
    })
    if (ok) { setOpen(false); onChanged() }
  }
  return <div className="card">
    <div className="panel-head"><SectionTitle icon="shield">Bằng cấp và chứng nhận</SectionTitle>
      {canEdit && <button type="button" className="btn sec sm" onClick={() => { setForm({}); setErrors({}); setOpen(true) }}><Icon name="plus" size={14} /> Thêm</button>}</div>
    {!items.length ? <p className="empty">Chưa có bằng cấp hoặc chứng nhận.</p> : items.map((c) => <div key={c.CredentialID} className="cred">
      <span className={`ft ${c.CredentialType === 'Award' ? 'award' : ''}`}>{c.FileUrl ? (c.FileUrl.split('.').pop() || '').toUpperCase().slice(0, 4) : { License: 'GP', Certificate: 'CC', Degree: 'BC', Award: 'GT' }[c.CredentialType]}</span>
      <div><b>{c.Title}</b><small>{[typeText[c.CredentialType], c.IssuedBy, `cấp ${fmtDate(c.IssuedDate)}`, c.ExpiryDate ? `hết hạn ${fmtDate(c.ExpiryDate)}` : ''].filter(Boolean).join(' · ')}</small></div>
      {canEdit && <button type="button" className="link" onClick={() => act.run(async () => { await api.deleteCredential(c.CredentialID); onChanged() })}>Xóa</button>}</div>)}
    {open && <Dialog title="Thêm bằng cấp, chứng nhận" onClose={() => setOpen(false)} actions={<>
      <button type="button" className="btn sec" onClick={() => setOpen(false)}>Hủy</button>
      <button type="button" className="btn pri" disabled={act.busy} onClick={add}>Lưu</button></>}>
      <div className="fgrid">
        <SelectInput label="Loại" required value={form.CredentialType} onChange={set('CredentialType')} error={errors.CredentialType} placeholder="Chọn loại" options={CREDENTIAL_TYPES} />
        <TextInput label="Đơn vị cấp" value={form.IssuedBy} onChange={set('IssuedBy')} error={errors.IssuedBy} maxLength={200} />
      </div>
      <div style={{ marginTop: 14 }}><TextInput label="Tên bằng cấp, chứng nhận" required value={form.Title} onChange={set('Title')} error={errors.Title} maxLength={200} /></div>
      <div className="fgrid" style={{ marginTop: 14 }}>
        <DateField label="Ngày cấp" required value={form.IssuedDate} onChange={set('IssuedDate')} error={errors.IssuedDate} max={todayIso()} />
        <DateField label="Ngày hết hạn" value={form.ExpiryDate} onChange={set('ExpiryDate')} error={errors.ExpiryDate} />
      </div>
      {act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}
    </Dialog>}
    {!open && act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}
  </div>
}

function RaceResults({ trainerId, items, canEdit, onChanged }) {
  const pager = usePager(items, 5)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  const act = useAction()
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }
  const classText = Object.fromEntries(RACE_CLASSES)
  const int = (v, low, high) => { const t = String(v ?? '').trim(); if (!t) return MSG.required; if (!/^\d+$/.test(t)) return 'Giá trị phải là số nguyên.'; const n = Number(t); return n < low || n > high ? `Giá trị phải từ ${low} đến ${high}.` : '' }
  async function add() {
    const found = runChecks({ RaceDate: () => (form.RaceDate ? (form.RaceDate > todayIso() ? 'Ngày đua không được sau ngày hiện tại.' : '') : MSG.required),
      RaceName: () => checkText(form.RaceName, 200), HorseName: () => checkText(form.HorseName, 100), RaceClass: () => checkSelect(form.RaceClass),
      FieldSize: () => int(form.FieldSize, 1, 40), FinishPosition: () => int(form.FinishPosition, 1, 40) || (Number(form.FinishPosition) > Number(form.FieldSize) ? 'Thứ hạng không được lớn hơn số ngựa tham gia.' : '') })
    setErrors(found)
    if (Object.keys(found).length) return
    const ok = await act.run(async () => {
      try { await api.addRaceResult(trainerId, { RaceDate: form.RaceDate, RaceName: form.RaceName.trim(), HorseName: form.HorseName.trim(), RaceClass: form.RaceClass, FinishPosition: Number(form.FinishPosition), FieldSize: Number(form.FieldSize) }) }
      catch (err) { const f = serverFieldErrors(err); if (Object.keys(f).length) { setErrors(f); return false } throw err }
      return true
    })
    if (ok) { setOpen(false); onChanged() }
  }
  return <>
    <div className="toolbar" style={{ marginTop: 24, paddingTop: 22, borderTop: '1px solid #ecede6' }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Kết quả đua</h2>
      {canEdit && <button type="button" className="btn pri" style={{ marginLeft: 'auto' }} onClick={() => { setForm({}); setErrors({}); setOpen(true) }}><Icon name="plus" size={16} /> Thêm kết quả đua</button>}
    </div>
    {!items.length ? <p className="empty">Chưa có kết quả đua.</p> : <>
      <table><thead><tr><th>Ngày đua</th><th>Cuộc đua</th><th>Ngựa</th><th>Hạng đua</th><th>Thứ hạng</th>{canEdit && <th>Thao tác</th>}</tr></thead>
        <tbody>{pager.slice.map((r) => <tr key={r.RaceResultID}><td>{fmtDate(r.RaceDate)}</td><td><b>{r.RaceName}</b></td><td>{r.HorseName}</td>
          <td>{classText[r.RaceClass] || r.RaceClass}</td><td><b style={{ display: 'inline' }}>{r.FinishPosition}</b> / {r.FieldSize}</td>
          {canEdit && <td><button type="button" className="btn sec sm" onClick={() => act.run(async () => { await api.deleteRaceResult(r.RaceResultID); onChanged() })}>Xóa</button></td>}</tr>)}</tbody></table>
      <Pager pager={pager} noun="kết quả" /></>}
    {open && <Dialog title="Thêm kết quả đua" onClose={() => setOpen(false)} actions={<>
      <button type="button" className="btn sec" onClick={() => setOpen(false)}>Hủy</button>
      <button type="button" className="btn pri" disabled={act.busy} onClick={add}>Lưu</button></>}>
      <div className="fgrid">
        <DateField label="Ngày đua" required value={form.RaceDate} onChange={set('RaceDate')} error={errors.RaceDate} max={todayIso()} />
        <SelectInput label="Hạng đua" required value={form.RaceClass} onChange={set('RaceClass')} error={errors.RaceClass} placeholder="Chọn hạng đua" options={RACE_CLASSES} />
      </div>
      <div style={{ marginTop: 14 }}><TextInput label="Cuộc đua" required value={form.RaceName} onChange={set('RaceName')} error={errors.RaceName} maxLength={200} /></div>
      <div className="fgrid three" style={{ marginTop: 14 }}>
        <TextInput label="Ngựa" required value={form.HorseName} onChange={set('HorseName')} error={errors.HorseName} maxLength={100} />
        <TextInput label="Thứ hạng" required inputMode="numeric" maxLength={2} value={form.FinishPosition} onChange={set('FinishPosition')} error={errors.FinishPosition} />
        <TextInput label="Số ngựa tham gia" required inputMode="numeric" maxLength={2} value={form.FieldSize} onChange={set('FieldSize')} error={errors.FieldSize} />
      </div>
      {act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}
    </Dialog>}
  </>
}

// ====================================================================== HT06
export function HeadPlansPage() {
  const data = useLoad(() => api.plans(), [])
  const [tab, setTab] = useState('all')
  const [text, setText] = useState('')
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const plans = data.data.slice().sort((a, b) => b.TrainingPlanID - a.TrainingPlanID)
  const TABS = [['Pending Approval', 'Chờ duyệt'], ['Active', 'Đang áp dụng'], ['Completed', 'Đã hoàn thành'], ['Returned', 'Bị trả về'], ['Draft', 'Bản nháp'], ['Cancelled', 'Đã hủy']]
  const count = (k) => plans.filter((p) => planState(p) === k).length
  const shown = plans.filter((p) => (tab === 'all' || planState(p) === tab) && matches(text, `#${p.TrainingPlanID}`, p.HorseName, p.HorseCode, p.TrainerName, p.Goal))
  return <Page>
    <Crumb items={[['Giáo án huấn luyện']]} />
    <Heading title="Giáo án huấn luyện" />
    <section className="panel">
      <div className="toolbar">
        <Tabs value={tab} onChange={setTab} tabs={[['all', 'Tất cả', plans.length], ...TABS.filter(([k]) => count(k) || ['Pending Approval', 'Active', 'Completed', 'Returned'].includes(k)).map(([k, l]) => [k, l, count(k)])]} />
        <Search value={text} onChange={setText} placeholder="Tìm theo mã, ngựa, huấn luyện viên" />
      </div>
      {!shown.length ? <p className="empty">Không có giáo án phù hợp.</p> : <table>
        <thead><tr><th>Mã</th><th>Ngựa</th><th>Huấn luyện viên</th><th>Mục tiêu</th><th>Thời gian</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>{shown.map((p) => <tr key={p.TrainingPlanID}>
          <td><b>#{p.TrainingPlanID}</b></td>
          <td><div className="hname"><HorseThumb horseId={p.HorseID} /><div><b>{p.HorseName}</b><small>{p.HorseCode}</small></div></div></td>
          <td>{p.TrainerName}</td><td style={{ maxWidth: 320 }}>{p.Goal}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.StartDate)} –<br />{p.EndDate ? fmtDate(p.EndDate) : '…'}</td>
          <td><PlanBadge plan={p} /></td>
          <td>{p.Status === 'Pending Approval' ? <Link className="btn pri sm" to={`/training/approvals/${p.TrainingPlanID}`}>Xem và duyệt</Link>
            : <Link className="btn sec sm" to={`/training/plans/${p.TrainingPlanID}`}>Xem giáo án</Link>}</td>
        </tr>)}</tbody></table>}
    </section>
  </Page>
}

// ====================================================================== HT07
export function ApprovalsPage() {
  const data = useLoad(() => api.plans(), [])
  const [tab, setTab] = useState('pending')
  const [text, setText] = useState('')
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const plans = data.data.slice().sort((a, b) => String(b.SubmittedAt || b.CreatedAt).localeCompare(String(a.SubmittedAt || a.CreatedAt)))
  const groups = { pending: plans.filter((p) => p.Status === 'Pending Approval'), approved: plans.filter((p) => p.ApprovedAt),
    returned: plans.filter((p) => planState(p) === 'Returned') }
  const shown = groups[tab].filter((p) => matches(text, p.HorseName, p.TrainerName, p.Goal))
  return <Page>
    <Crumb items={[['Duyệt giáo án']]} />
    <Heading title="Duyệt giáo án" />
    <section className="panel">
      <div className="toolbar">
        <Tabs value={tab} onChange={setTab} tabs={[['pending', 'Chờ duyệt', groups.pending.length], ['approved', 'Đã duyệt', groups.approved.length], ['returned', 'Đã trả về', groups.returned.length]]} />
        <Search value={text} onChange={setText} placeholder="Tìm theo ngựa, huấn luyện viên, mục tiêu" />
      </div>
      {!shown.length ? <p className="empty">{tab === 'pending' ? 'Không có giáo án chờ duyệt.' : 'Không có giáo án phù hợp.'}</p>
        : shown.map((p) => <div key={p.TrainingPlanID} className="card" style={{ marginBottom: 14 }}>
          <PlanContext plan={p} meta={planMeta(p, { withTrainer: true })} />
          <div style={{ marginTop: 16 }}><Dl cols={4} items={[['Mục tiêu', p.Goal, 1], ['Thời gian', fullRange(p.StartDate, p.EndDate)],
            ['Cường độ tổng thể', INTENSITY[p.OverallIntensity] || '—'], ['Số giai đoạn', String(p.Stages.length)]]} /></div>
          {planState(p) === 'Returned' && p.ReviewNote && <div className="quote warm" style={{ marginTop: 14 }}><small>Lý do trả về</small><p>{p.ReviewNote}</p></div>}
          <div style={{ marginTop: 16 }}>{p.Status === 'Pending Approval'
            ? <Link className="btn pri" to={`/training/approvals/${p.TrainingPlanID}`}>Xem và duyệt giáo án</Link>
            : <Link className="btn sec" to={`/training/plans/${p.TrainingPlanID}`}>Xem giáo án</Link>}</div>
        </div>)}
    </section>
  </Page>
}

// ====================================================================== HT08 / HT09
export function ApprovalDetailPage() {
  const { planId } = useParams()
  const navigate = useNavigate()
  const data = useLoad(async () => {
    const plan = await api.plan(planId)
    const templates = await api.templates().catch(() => [])
    const brief = plan.TemplateID ? templates.find((t) => t.TemplateID === plan.TemplateID) : templates.find((t) => t.SpecializationID === plan.SpecializationID && t.IsActive !== false)
    const template = brief ? await api.template(brief.TemplateID).catch(() => brief) : null
    return { plan, template }
  }, [planId])
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const act = useAction()
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const { plan: p, template } = data.data
  const pending = p.Status === 'Pending Approval'
  async function approve() {
    const ok = await act.run(async () => { await api.approvePlan(p.TrainingPlanID, note.trim() || null); return true })
    if (ok) navigate('/training/approvals')
  }
  async function giveBack() {
    const msg = checkText(note, 1000)
    setNoteError(msg ? (msg === MSG.required ? 'Vui lòng nhập lý do trả về.' : msg) : '')
    if (msg) return
    const ok = await act.run(async () => { await api.returnPlan(p.TrainingPlanID, note.trim()); return true })
    if (ok) navigate('/training/approvals')
  }
  const planDays = p.EndDate ? daysBetween(p.StartDate, p.EndDate) : null
  const tStages = template?.Stages || []
  const loadRows = tStages.length ? p.Stages.map((st, i) => [st, tStages[i]]).filter(([st, ts]) => ts && ts.TrainingLoad != null && st.TrainingLoad != null && Number(ts.TrainingLoad) !== Number(st.TrainingLoad)) : []
  return <Page>
    <Crumb items={[['Duyệt giáo án', '/training/approvals'], [`${p.HorseName} · ${planName(p)}`]]} />
    <Heading title="Duyệt giáo án" />
    <section className="panel">
      <PlanContext plan={p} meta={planMeta(p, { withTrainer: true })} />
      <h2 className="sec-h">Thông tin giáo án</h2>
      <Dl cols={4} items={[['Mục tiêu', p.Goal, 1], ['Bắt đầu', fmtDate(p.StartDate)], ['Kết thúc', fmtDate(p.EndDate)], ['Cường độ tổng thể', INTENSITY[p.OverallIntensity] || '—'],
        ['Giáo án mẫu', template?.TemplateName || p.TemplateName || 'Không sử dụng'], ['Tạo lúc', fmtDateTime(p.CreatedAt)], ['Số giai đoạn', String(p.Stages.length)],
        p.Note && ['Ghi chú', p.Note, 1]]} />
      <h2 className="sec-h">Các giai đoạn huấn luyện</h2>
      {p.Stages.map((st, i) => <StageCard key={st.TrainingPlanStageID} stage={st} index={i} />)}
      {template && <>
        <h2 className="sec-h">Đối chiếu giáo án mẫu</h2>
        <table><thead><tr><th>Nội dung</th><th>Giáo án mẫu</th><th>Giáo án đề xuất</th></tr></thead><tbody>
          <tr><td><b>Thời lượng</b></td><td>{template.DurationDays} ngày · {tStages.length || '—'} giai đoạn</td>
            <td><b>{planDays ? `${planDays} ngày` : 'Chưa xác định ngày kết thúc'} · {p.Stages.length} giai đoạn</b></td></tr>
          <tr><td><b>Cường độ tổng thể</b></td><td>{INTENSITY[template.OverallIntensity] || '—'}</td><td><b>{INTENSITY[p.OverallIntensity] || '—'}</b></td></tr>
          {loadRows.map(([st, ts], i) => <tr key={st.TrainingPlanStageID}><td><b>Giai đoạn {st.StageOrder || i + 1} – mức tải</b></td><td>{num(ts.TrainingLoad, 0)}</td><td><b>{num(st.TrainingLoad, 0)}</b></td></tr>)}
        </tbody></table></>}
      {pending ? <>
        <h2 className="sec-h">Quyết định duyệt</h2>
        <TextArea label="Nhận xét duyệt / lý do trả về" value={note} onChange={(v) => { setNote(v); setNoteError('') }} error={noteError} rows={3} maxLength={1000} />
        {act.error && <Notice kind="bad" style={{ marginTop: 12 }}>{act.error}</Notice>}
        <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="btn pri" disabled={act.busy} onClick={() => setConfirm(true)}><Icon name="check" size={16} /> Duyệt giáo án</button>
          <button type="button" className="btn danger" disabled={act.busy} onClick={giveBack}>Trả về huấn luyện viên</button></div>
      </> : <Notice kind="info" style={{ marginTop: 18 }}>Giáo án không còn ở trạng thái chờ duyệt. <Link className="link" to={`/training/plans/${p.TrainingPlanID}`}>Xem giáo án</Link></Notice>}
    </section>
    {confirm && <Dialog title={`Duyệt giáo án #${p.TrainingPlanID}?`} onClose={() => setConfirm(false)} actions={<>
      <button type="button" className="btn sec" onClick={() => setConfirm(false)}>Kiểm tra lại</button>
      <button type="button" className="btn pri" disabled={act.busy} onClick={approve}><Icon name="check" size={16} /> Duyệt giáo án</button></>}>
      <p>Giáo án sẽ được áp dụng cho {p.HorseName} từ ngày {fmtDate(p.StartDate)}. Huấn luyện viên {p.TrainerName} có thể bắt đầu xếp lịch tập theo các giai đoạn đã duyệt.</p>
      {act.error && <Notice kind="bad">{act.error}</Notice>}
    </Dialog>}
  </Page>
}

// ====================================================================== HT12
const PERIODS = [['', 'Toàn bộ thời gian'], ['7', '7 ngày gần đây'], ['30', '30 ngày gần đây'], ['90', '90 ngày gần đây']]
export function ResultsPage() {
  const data = useLoad(async () => { const [sessions, horses] = await Promise.all([api.sessions(), api.dashboard()]); return { sessions, horses } }, [])
  const [horse, setHorse] = useState('')
  const [period, setPeriod] = useState('')
  const today = todayIso()
  const rows = useMemo(() => (data.data?.sessions || []).filter((s) => s.SessionDate <= today && (!horse || String(s.HorseID) === horse) && (!period || s.SessionDate >= daysAgo(Number(period))))
    .sort((a, b) => (b.SessionDate + b.StartTime).localeCompare(a.SessionDate + a.StartTime)), [data.data, horse, period, today])
  const pager = usePager(rows, 8)
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const recorded = rows.filter((s) => s.Result)
  const scores = recorded.map((s) => s.Result.PerformanceScore).filter((v) => v != null)
  return <Page>
    <Crumb items={[['Kết quả tập luyện']]} />
    <Heading title="Kết quả tập luyện" />
    <section className="panel">
      <div className="toolbar">
        <select className="input" style={{ width: 230 }} value={horse} onChange={(e) => { setHorse(e.target.value); pager.setPage(1) }} aria-label="Ngựa">
          <option value="">Tất cả ngựa</option>{data.data.horses.map((h) => <option key={h.HorseID} value={h.HorseID}>{h.HorseName}</option>)}</select>
        <select className="input" style={{ width: 230 }} value={period} onChange={(e) => { setPeriod(e.target.value); pager.setPage(1) }} aria-label="Thời gian">
          {PERIODS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
      </div>
      <div className="two" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
        <SessionDonut sessions={rows} />
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="kpi"><small>Buổi hoàn thành</small><b>{rows.filter((s) => s.Status === 'Completed').length}</b></div>
          <div className="kpi"><small>Đã ghi kết quả</small><b>{recorded.length}</b></div>
          <div className="kpi"><small>Điểm trung bình</small><b>{scores.length ? num(scores.reduce((a, b) => a + Number(b), 0) / scores.length) : '—'}</b></div>
        </div>
      </div>
      <h2 className="sec-h">Chi tiết buổi tập</h2>
      {!rows.length ? <p className="empty">Chưa có buổi tập trong khoảng thời gian này.</p> : <>
        <table><thead><tr><th>Ngày tập</th><th>Ngựa</th><th>Bài tập</th><th>Huấn luyện viên</th><th>Trạng thái</th><th>Thời lượng</th><th>Quãng đường</th><th>Điểm</th><th>Đánh giá</th></tr></thead>
          <tbody>{pager.slice.map((s) => <tr key={s.TrainingSessionID}>
            <td><Link className="link" to={`/training/sessions/${s.TrainingSessionID}`}>{fmtDate(s.SessionDate)}</Link></td><td><b>{s.HorseName}</b></td><td>{s.TrainingType}</td>
            <td>{s.SupervisingTrainerName}</td><td><SessionBadge status={s.Status} stopped={s.IsStopped} /></td>
            <td>{s.Result ? minutes(s.Result.ActualDurationMinutes) : '—'}</td><td>{s.Result ? km(s.Result.ActualDistanceKm) : '—'}</td>
            <td><b>{s.Result?.PerformanceScore != null ? num(s.Result.PerformanceScore, 0) : '—'}</b></td><td><EvalBadge review={s.Review} /></td>
          </tr>)}</tbody></table>
        <Pager pager={pager} /></>}
    </section>
  </Page>
}

// ====================================================================== HT13
const ADJ_PERIODS = [['7', '7 ngày gần đây'], ['30', '30 ngày gần đây'], ['90', '90 ngày gần đây'], ['', 'Toàn bộ thời gian']]
export function AdjustmentsPage() {
  const [days, setDays] = useState('30')
  const data = useLoad(() => api.reviews({ AdjustmentRequired: 1, Days: days || undefined }), [days])
  const items = (data.data || []).slice().sort((a, b) => String(b.SessionDate).localeCompare(String(a.SessionDate)))
  const pager = usePager(items, 6)
  return <Page>
    <Crumb items={[['Điều chỉnh giáo án']]} />
    <Heading title="Điều chỉnh giáo án" />
    <section className="panel">
      <div className="panel-head"><h2>{items.length} đề xuất điều chỉnh</h2>
        <select className="input" style={{ width: 220 }} value={days} onChange={(e) => { setDays(e.target.value); pager.setPage(1) }} aria-label="Thời gian">
          {ADJ_PERIODS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
      {data.loading ? <Loading /> : data.error ? <Notice kind="bad">{errorText(data.error)}</Notice> : !items.length ? <p className="empty">Không có đề xuất điều chỉnh trong khoảng thời gian này.</p> : <>
        {pager.slice.map((r) => <div key={r.TrainingReviewID} className="card adj" style={{ marginBottom: 14 }}>
          <div className="ctx" style={{ border: 0, padding: 0 }}><div className="who"><HorseThumb horseId={r.HorseID} size={52} />
            <div><h2>{r.HorseName}</h2><p>Buổi tập {fmtDate(r.SessionDate)} · Huấn luyện viên {r.TrainerName}</p></div></div><EvalBadge review={r} /></div>
          <div className="quotes">
            <div className="quote"><small>Nhận xét của huấn luyện viên</small><p>{r.TrainerComment || '—'}</p></div>
            <div className="quote warm"><small>Nội dung cần điều chỉnh</small><p>{r.AdjustmentNote || '—'}</p></div>
          </div>
          <div className="actions"><Link className="btn sec sm" to={`/training/sessions/${r.TrainingSessionID}`}>Xem buổi tập</Link>
            {r.TrainingPlanID && <Link className="btn pri sm" to={`/training/plans/${r.TrainingPlanID}`}>Mở giáo án</Link>}</div>
        </div>)}
        <Pager pager={pager} noun="đề xuất" /></>}
    </section>
  </Page>
}

