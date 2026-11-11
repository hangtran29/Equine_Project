// Chủ ngựa: Hoạt động huấn luyện của ngựa – Buổi tập (CN-02), Chi tiết buổi tập (CN-03), Giáo án (CN-04),
// Tổng kết giáo án (CN-05), Tổng kết giai đoạn (CN-06). Số liệu buổi tập chỉ hiển thị sau khi huấn luyện viên đánh giá.
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiGet } from '../api/apiClient.ts'
import { Badge, Crumb, Dl, Heading, Loading, Notice, SectionTitle, errorText, fmtDate, fmtDateTime, useLoad } from '../flow1/ui.jsx'
import { HorseThumb } from '../flow1/horse.jsx'
import { EVALUATION, EVAL_KIND, INTENSITY, Pager, PlanBadge, Tabs, addMinutes, hhmm, km, minutes, num, shortRange, fullRange, usePager } from './common.jsx'

const Page = ({ children }) => <main className="page-content f1">{children}</main>
const Fail = ({ error }) => <Page><Notice kind="bad" style={{ marginTop: 30 }}>{errorText(error)}</Notice></Page>
const list = (v) => (Array.isArray(v) ? v : v?.results ?? [])
const owner = {
  horse: (id) => apiGet(`/horses/${id}`),
  plans: (id) => apiGet(`/owner/horses/${id}/training-plans`),
  plan: (id) => apiGet(`/owner/training-plans/${id}`),
  sessions: async (id) => list(await apiGet(`/owner/horses/${id}/training-sessions`)),
  session: (id) => apiGet(`/owner/training-sessions/${id}`),
}
const STAGE_STATE = { Closed: ['arch', 'Đã chốt'], InProgress: ['ok', 'Đang tập'], NotStarted: ['sent', 'Sắp tới'], Overdue: ['wait', 'Chờ chốt'] }
const stageBadge = (st) => { const [kind, text] = STAGE_STATE[st.IsOverdue ? 'Overdue' : st.StageState] || ['draft', st.StageState]; return <Badge kind={kind}>{text}</Badge> }
const intensityText = (v) => (INTENSITY[v] ? `Cường độ ${INTENSITY[v].toLowerCase()}` : '')

function ownerSessionBadge(s) {
  if (s.AwaitingReview) return <Badge kind="wait">Chờ huấn luyện viên đánh giá</Badge>
  if (s.Status === 'Completed') return <Badge kind="ok">Hoàn thành</Badge>
  if (s.IsStopped) return <Badge kind="arch">Đã dừng</Badge>
  if (s.Status === 'Missed') return <Badge kind="bad">Vắng</Badge>
  return <Badge kind="arch">Đã hủy</Badge>
}
const sessionTime = (s) => (s.DurationMinutes ? `${hhmm(s.StartTime)} – ${addMinutes(s.StartTime, s.DurationMinutes)}` : hhmm(s.StartTime))

/** Thẻ ngữ cảnh ngựa + thanh chuyển Buổi tập / Giáo án / Hồ sơ ngựa. */
function HorseHeader({ horseId, horse, plans, tab }) {
  const navigate = useNavigate()
  const active = plans.find((p) => p.Status === 'Active')
  const trainer = (active || plans[0])?.TrainerName
  return <>
    <div className="ctx"><div className="who"><HorseThumb horseId={horseId} size={64} />
      <div><h2>{horse.HorseName}</h2><p>{[horse.HorseCode, horse.Breed, trainer && `Huấn luyện viên ${trainer}`].filter(Boolean).join(' · ')}</p></div></div>
      {active ? <Badge kind="ok">Đang tập luyện</Badge> : <Badge kind="draft">Chưa có giáo án đang áp dụng</Badge>}</div>
    <div className="utabs" role="tablist">
      {[['sessions', 'Buổi tập', `/owner/horses/${horseId}/training`], ['plans', 'Giáo án', `/owner/horses/${horseId}/training/plans`], ['profile', 'Hồ sơ ngựa', `/owner/horses/${horseId}`]]
        .map(([k, label, to]) => <span key={k} role="tab" tabIndex={0} aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => navigate(to)}
          onKeyDown={(e) => { if (e.key === 'Enter') navigate(to) }}>{label}</span>)}
    </div>
  </>
}

function useHorse(horseId) {
  return useLoad(async () => {
    const [horse, plans] = await Promise.all([owner.horse(horseId), owner.plans(horseId)])
    return { horse, plans: plans.Plans || [] }
  }, [horseId])
}

// ====================================================================== CN-02
export function OwnerSessionsPage() {
  const { horseId } = useParams()
  const base = useHorse(horseId)
  const data = useLoad(() => owner.sessions(horseId), [horseId])
  const [tab, setTab] = useState('all')
  const [stage, setStage] = useState('')
  const rows = useMemo(() => (data.data || []).filter((s) => (tab === 'all' || (tab === 'done' ? s.Status === 'Completed' : s.Status !== 'Completed'))
    && (!stage || String(s.TrainingPlanStageID) === stage)), [data.data, tab, stage])
  const pager = usePager(rows, 8)
  if (base.loading || data.loading) return <Page><Loading /></Page>
  if (base.error || data.error) return <Fail error={base.error || data.error} />
  const { horse, plans } = base.data
  const all = data.data
  const reviewed = all.filter((s) => s.Status === 'Completed' && !s.AwaitingReview)
  const scores = reviewed.map((s) => s.PerformanceScore).filter((v) => v != null)
  const dates = all.filter((s) => s.Status === 'Completed').map((s) => s.SessionDate).sort()
  const weeks = dates.length ? Math.max(1, Math.ceil((new Date(dates[dates.length - 1]) - new Date(dates[0])) / (7 * 86400000))) : 0
  const stages = [...new Map(all.map((s) => [s.TrainingPlanStageID, `Giáo án #${s.TrainingPlanID} · ${s.StageName}`])).entries()]
  return <Page>
    <Crumb items={[['Ngựa của tôi', '/owner/horses'], [horse.HorseName, `/owner/horses/${horseId}`], ['Buổi tập']]} />
    <Heading title="Hoạt động huấn luyện" />
    <section className="panel">
      <HorseHeader horseId={horseId} horse={horse} plans={plans} tab="sessions" />
      <div className="kpis">
        <div className="kpi"><small>Buổi đã tập</small><b>{dates.length}</b>{weeks > 0 && <small>trong {weeks} tuần</small>}</div>
        <div className="kpi"><small>Tổng quãng đường</small><b>{km(reviewed.reduce((a, s) => a + (Number(s.DistanceKm) || 0), 0))}</b></div>
        <div className="kpi"><small>Điểm trung bình</small><b>{scores.length ? num(scores.reduce((a, b) => a + Number(b), 0) / scores.length) : '—'}</b></div>
        <div className="kpi"><small>Chờ đánh giá</small><b>{all.filter((s) => s.AwaitingReview).length}</b></div>
      </div>
      <div className="toolbar">
        <Tabs value={tab} onChange={(t) => { setTab(t); pager.setPage(1) }} tabs={[['all', 'Tất cả', all.length], ['done', 'Hoàn thành', all.filter((s) => s.Status === 'Completed').length],
          ['off', 'Vắng / đã hủy', all.filter((s) => s.Status !== 'Completed').length]]} />
        <select className="input" style={{ marginLeft: 'auto', width: 260 }} value={stage} onChange={(e) => { setStage(e.target.value); pager.setPage(1) }} aria-label="Giai đoạn">
          <option value="">Tất cả giai đoạn</option>{stages.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      </div>
      {!rows.length ? <p className="empty">Chưa có buổi tập.</p> : <>
        <table><thead><tr><th>Ngày tập</th><th>Giai đoạn</th><th>Bài tập</th><th>Trạng thái</th><th>Quãng đường</th><th>Điểm</th><th>Đánh giá</th><th>Thao tác</th></tr></thead>
          <tbody>{pager.slice.map((s) => <tr key={s.TrainingSessionID}>
            <td style={{ whiteSpace: 'nowrap' }}><b>{fmtDate(s.SessionDate)}</b><small>{sessionTime(s)}</small></td>
            <td>{s.StageName}</td><td>{s.TrainingType}</td><td>{ownerSessionBadge(s)}</td>
            <td>{s.DistanceKm != null ? km(s.DistanceKm) : '—'}</td><td><b>{s.PerformanceScore != null ? num(s.PerformanceScore, 0) : '—'}</b></td>
            <td>{s.Evaluation ? EVALUATION[s.Evaluation] : '—'}</td>
            <td><Link className="btn sec sm" to={`/owner/horses/${horseId}/training/sessions/${s.TrainingSessionID}`}>{s.Status === 'Completed' && !s.AwaitingReview ? 'Xem kết quả' : 'Chi tiết'}</Link></td>
          </tr>)}</tbody></table>
        <Pager pager={pager} /></>}
      <p className="hint" style={{ marginTop: 14 }}>Số liệu của buổi tập được hiển thị sau khi huấn luyện viên đánh giá.</p>
    </section>
  </Page>
}

// ====================================================================== CN-03
export function OwnerSessionDetailPage() {
  const { horseId, sessionId } = useParams()
  const data = useLoad(() => owner.session(sessionId), [sessionId])
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const s = data.data
  const shown = s.Status === 'Completed' && !s.AwaitingReview
  return <Page>
    <Crumb items={[['Ngựa của tôi', '/owner/horses'], [s.HorseName, `/owner/horses/${horseId}/training`], [`Buổi tập ${fmtDate(s.SessionDate)}`]]} />
    <Heading title="Chi tiết buổi tập" />
    <section className="panel">
      <div className="ctx"><div className="who"><HorseThumb horseId={s.HorseID} size={64} />
        <div><h2>{s.HorseName}</h2><p>{[`Giáo án #${s.TrainingPlanID}`, s.StageName, [s.TrainingType, s.DistancePlannedKm != null ? km(s.DistancePlannedKm) : ''].filter(Boolean).join(' '), `${fmtDate(s.SessionDate)} ${sessionTime(s)}`].join(' · ')}</p></div></div>
        {ownerSessionBadge(s)}</div>
      {!shown ? <div style={{ marginTop: 18 }}>
        {s.Reason && <div className="quote warm" style={{ marginBottom: 12 }}><small>{s.IsStopped ? 'Lý do dừng buổi tập' : s.Status === 'Missed' ? 'Ghi chú vắng' : 'Lý do hủy'}</small><p>{s.Reason}</p></div>}
        <Notice kind="info">{s.AwaitingReview ? 'Số liệu buổi tập sẽ hiển thị sau khi huấn luyện viên đánh giá.' : 'Buổi tập không diễn ra nên không có số liệu.'}</Notice></div> : <>
        <h2 className="sec-h">Kết quả buổi tập</h2>
        <div className="kpis">
          <div className="kpi"><small>Thời lượng</small><b>{minutes(s.DurationMinutes)}</b>{s.DurationPlannedMinutes && <small>Dự kiến {s.DurationPlannedMinutes} phút</small>}</div>
          <div className="kpi"><small>Quãng đường</small><b>{km(s.DistanceKm)}</b>{s.DistancePlannedKm != null && <small>Mục tiêu {km(s.DistancePlannedKm)}</small>}</div>
          <div className="kpi"><small>Tốc độ trung bình / tối đa</small><b>{num(s.AvgSpeedKmh)} / {num(s.MaxSpeedKmh)} km/h</b>{s.TargetSpeedKmh && <small>Mục tiêu {num(s.TargetSpeedKmh)} km/h</small>}</div>
          <div className="kpi"><small>Điểm hiệu suất</small><b>{num(s.PerformanceScore, 0)}</b></div>
          <div className="kpi"><small>Nhịp tim trung bình</small><b>{s.AvgHeartRate != null ? `${s.AvgHeartRate} lần/phút` : '—'}</b></div>
          <div className="kpi"><small>Nhịp tim tối đa</small><b>{s.MaxHeartRate != null ? `${s.MaxHeartRate} lần/phút` : '—'}</b></div>
          <div className="kpi"><small>Hồi phục</small><b>{minutes(s.RecoveryMinutes)}</b></div>
          <div className="kpi"><small>Mặt sân</small><b>{s.Surface || '—'}</b></div>
        </div>
        <div className="grid">
          <div className="card"><SectionTitle icon="user">Thực hiện</SectionTitle>
            <Dl items={[['Kỵ sĩ tập luyện', s.WorkRiderName], ['Huấn luyện viên giám sát', s.TrainerName], ['Địa điểm', s.Location]]} /></div>
          <div className="card"><SectionTitle icon="file">Đánh giá của huấn luyện viên</SectionTitle>
            {s.Evaluation && <Badge kind={EVAL_KIND[s.Evaluation] || 'draft'}>{EVALUATION[s.Evaluation]}</Badge>}
            <div className="quote info" style={{ marginTop: 12 }}><small>{s.ReviewedBy} · {fmtDateTime(s.ReviewDate)}</small><p>{s.TrainerComment || 'Không có nhận xét.'}</p></div></div>
        </div>
        {s.RiderObservation && <div className="quote" style={{ marginTop: 14 }}><small>Nhận xét của kỵ sĩ tập luyện</small><p>{s.RiderObservation}</p></div>}
      </>}
    </section>
  </Page>
}

// ====================================================================== CN-04
export function OwnerPlansPage() {
  const { horseId } = useParams()
  const base = useHorse(horseId)
  const current = base.data?.plans.find((p) => p.Status === 'Active') || base.data?.plans[0]
  const detail = useLoad(() => (current ? owner.plan(current.TrainingPlanID) : Promise.resolve(null)), [current?.TrainingPlanID])
  if (base.loading) return <Page><Loading /></Page>
  if (base.error) return <Fail error={base.error} />
  const { horse, plans } = base.data
  return <Page>
    <Crumb items={[['Ngựa của tôi', '/owner/horses'], [horse.HorseName, `/owner/horses/${horseId}`], ['Giáo án']]} />
    <Heading title="Hoạt động huấn luyện" />
    <section className="panel">
      <HorseHeader horseId={horseId} horse={horse} plans={plans} tab="plans" />
      {!plans.length ? <p className="empty">Ngựa chưa có giáo án được duyệt.</p> : <table>
        <thead><tr><th>Giáo án</th><th>Mục tiêu</th><th>Thời gian</th><th>Cường độ</th><th>Tiến độ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>{plans.map((p) => <tr key={p.TrainingPlanID}>
          <td><b>Giáo án #{p.TrainingPlanID}</b><small>{p.TrainerName}</small></td><td style={{ maxWidth: 300 }}>{p.Goal}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{fullRange(p.StartDate, p.EndDate)}</td><td>{INTENSITY[p.OverallIntensity] || '—'}</td>
          <td style={{ minWidth: 150 }}><div className="bar"><i style={{ width: `${Math.min(100, p.ProgressPercent || 0)}%` }} /></div>
            <small>{p.CurrentStageOrder ? `Giai đoạn ${p.CurrentStageOrder}/${p.StageCount} · ` : ''}{num(p.ProgressPercent, 0)}%</small></td>
          <td><PlanBadge plan={p} /></td>
          <td><Link className="btn sec sm" to={`/owner/horses/${horseId}/training/plans/${p.TrainingPlanID}`}>Xem tổng kết</Link></td>
        </tr>)}</tbody></table>}
      {current && <>
        <h2 className="sec-h">Các giai đoạn · Giáo án #{current.TrainingPlanID}</h2>
        {detail.error ? <Notice kind="bad">{errorText(detail.error)}</Notice> : !detail.data?.Stages ? <Loading /> : <table>
          <thead><tr><th>Giai đoạn</th><th>Thời gian</th><th>Cường độ</th><th>Mục tiêu quãng đường</th><th>Đã tập</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>{detail.data.Stages.map((st) => <tr key={st.TrainingPlanStageID}>
            <td><b>{st.StageOrder}. {st.StageName}</b></td><td>{shortRange(st.StartDate, st.EndDate)}</td><td>{INTENSITY[st.Intensity] || '—'}</td>
            <td>{km(st.Summary?.DistanceTargetKm)}</td><td>{st.StageState === 'NotStarted' ? '—' : km(st.Summary?.TotalDistanceKm)}</td><td>{stageBadge(st)}</td>
            <td>{st.StageState === 'NotStarted' ? '—' : <Link className="btn sec sm" to={`/owner/horses/${horseId}/training/plans/${current.TrainingPlanID}/stages/${st.TrainingPlanStageID}`}>
              {st.StageState === 'Closed' ? 'Xem tổng kết' : 'Xem tiến độ'}</Link>}</td>
          </tr>)}</tbody></table>}
      </>}
    </section>
  </Page>
}

// ====================================================================== CN-05
export function OwnerPlanSummaryPage() {
  const { horseId, planId } = useParams()
  const data = useLoad(() => owner.plan(planId), [planId])
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const p = data.data
  const sm = p.Summary || {}
  const ev = sm.Evaluations || {}
  const first = p.Stages.find((st) => st.StageOrder === 1)?.Summary?.AvgPerformanceScore
  const diff = first != null && sm.AvgPerformanceScore != null ? sm.AvgPerformanceScore - first : null
  return <Page>
    <Crumb items={[['Ngựa của tôi', '/owner/horses'], [p.HorseName, `/owner/horses/${horseId}/training/plans`], [`Giáo án #${p.TrainingPlanID}`]]} />
    <Heading title="Tổng kết giáo án" />
    <section className="panel">
      <div className="ctx"><div className="who"><HorseThumb horseId={p.HorseID} size={64} />
        <div><h2>{p.HorseName}</h2><p>{[`Giáo án #${p.TrainingPlanID}`, p.Goal, fullRange(p.StartDate, p.EndDate)].join(' · ')}</p></div></div><PlanBadge plan={p} /></div>
      <h2 className="sec-h">Tính đến {fmtDate(sm.To)}</h2>
      <div className="kpis">
        <div className="kpi"><small>Buổi tập hoàn thành</small><b>{sm.CompletedSessions} / {sm.PlannedSessions}</b></div>
        <div className="kpi"><small>Tổng quãng đường</small><b>{num(sm.TotalDistanceKm)} / {num(sm.DistanceTargetKm)} km</b>{sm.DistanceProgressPercent != null && <small>Đạt {num(sm.DistanceProgressPercent, 0)}% mục tiêu</small>}</div>
        <div className="kpi"><small>Điểm trung bình</small><b>{num(sm.AvgPerformanceScore)}</b>{diff != null && p.Stages.length > 1 && <small>{diff >= 0 ? 'Tăng' : 'Giảm'} {num(Math.abs(diff))} so với giai đoạn 1</small>}</div>
        <div className="kpi"><small>Tốc độ trung bình</small><b>{sm.AvgSpeedKmh != null ? `${num(sm.AvgSpeedKmh)} km/h` : '—'}</b></div>
      </div>
      <div className="grid">
        <div className="card"><SectionTitle icon="check">Đánh giá của huấn luyện viên</SectionTitle>
          <Dl cols={4} items={Object.entries(EVALUATION).map(([k, label]) => [label, `${ev[k] || 0} buổi`])} /></div>
        <HealthCard health={sm.Health} title="Sức khỏe trong kỳ" />
      </div>
      {p.Stages.map((st) => <div key={st.TrainingPlanStageID} className={`card stage ${st.StageState === 'InProgress' ? 'cur' : ''}`}>
        <div className="stage-head"><div>
          <p className="stage-eyebrow">GIAI ĐOẠN {st.StageOrder} · {st.StageState === 'Closed' ? `ĐÃ CHỐT ${fmtDate(st.ClosedAt)}` : st.StageState === 'InProgress' ? 'ĐANG TẬP' : 'SẮP TỚI'}</p>
          <h3>{st.StageName}</h3>
          <small>{[shortRange(st.StartDate, st.EndDate), intensityText(st.Intensity), st.StageState === 'NotStarted' ? `Mục tiêu ${km(st.Summary?.DistanceTargetKm)}`
            : `${st.Summary?.CompletedSessions ?? 0} buổi · ${num(st.Summary?.TotalDistanceKm)} / ${km(st.Summary?.DistanceTargetKm)}${st.Summary?.AvgPerformanceScore != null ? ` · Điểm trung bình ${num(st.Summary.AvgPerformanceScore)}` : ''}`].filter(Boolean).join(' · ')}</small></div>
          <div className="stage-side">{stageBadge(st)}{st.StageState !== 'NotStarted' && <Link className="btn sec sm" to={`/owner/horses/${horseId}/training/plans/${p.TrainingPlanID}/stages/${st.TrainingPlanStageID}`}>Xem chi tiết</Link>}</div></div>
        {st.SummaryNote && <div className="quote" style={{ marginTop: 12 }}><small>Nhận xét khi chốt giai đoạn · {st.ClosedByName}</small><p>{st.SummaryNote}</p></div>}
      </div>)}
    </section>
  </Page>
}

function HealthCard({ health = {}, title, extra }) {
  return <div className="card"><SectionTitle icon="heart">{title}</SectionTitle>
    <Dl cols={2} items={[['Khóa tập', health.TrainingLockCount ? `${health.TrainingLockCount} lần` : 'Không có'],
      ['Báo cáo sức khỏe', health.HealthReportCount ? `${health.HealthReportCount} báo cáo${health.UrgentHealthReportCount ? `, ${health.UrgentHealthReportCount} báo cáo khẩn` : ' thông thường'}` : 'Không có'],
      extra !== false && ['Tình trạng hiện tại', health.IsLockedNow ? 'Đang tạm dừng tập luyện' : 'Được phép tập luyện']]} /></div>
}

// ====================================================================== CN-06
const DELTAS = [['AvgPerformanceScore', 'Điểm trung bình', ''], ['AvgSpeedKmh', 'Tốc độ trung bình', ' km/h'], ['AvgDistancePerSessionKm', 'Quãng đường mỗi buổi', ' km'], ['AvgRecoveryMinutes', 'Thời gian hồi phục', ' phút']]
export function OwnerStageSummaryPage() {
  const { horseId, planId, stageId } = useParams()
  const data = useLoad(async () => { const [plan, sessions] = await Promise.all([owner.plan(planId), owner.sessions(horseId)]); return { plan, sessions } }, [planId, horseId])
  const rows = (data.data?.sessions || []).filter((s) => String(s.TrainingPlanStageID) === String(stageId) && s.Status === 'Completed')
  const pager = usePager(rows, 6)
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const p = data.data.plan
  const st = p.Stages.find((x) => String(x.TrainingPlanStageID) === String(stageId))
  if (!st) return <Page><Notice kind="bad" style={{ marginTop: 30 }}>Không tìm thấy giai đoạn.</Notice></Page>
  const sm = st.Summary || {}
  const cmp = st.ComparedToPreviousStage
  const over = sm.DistanceProgressPercent != null ? sm.DistanceProgressPercent - 100 : null
  return <Page>
    <Crumb items={[['Ngựa của tôi', '/owner/horses'], [p.HorseName, `/owner/horses/${horseId}/training/plans`], [`Giáo án #${p.TrainingPlanID}`, `/owner/horses/${horseId}/training/plans/${p.TrainingPlanID}`], [st.StageName]]} />
    <Heading title={st.StageState === 'Closed' ? 'Tổng kết giai đoạn' : 'Tiến độ giai đoạn'} />
    <section className="panel">
      <div className="ctx"><div className="who"><HorseThumb horseId={p.HorseID} size={64} />
        <div><h2>{p.HorseName}</h2><p>{[`Giáo án #${p.TrainingPlanID}`, `Giai đoạn ${st.StageOrder}: ${st.StageName}`, fullRange(st.StartDate, st.EndDate)].join(' · ')}</p></div></div>{stageBadge(st)}</div>
      <div className="kpis" style={{ marginTop: 16 }}>
        <div className="kpi"><small>Buổi tập</small><b>{sm.CompletedSessions} / {sm.PlannedSessions}</b></div>
        <div className="kpi"><small>Quãng đường</small><b>{num(sm.TotalDistanceKm)} / {num(sm.DistanceTargetKm)} km</b>{over != null && <small>{over >= 0 ? `Vượt ${num(over)}% mục tiêu` : `Đạt ${num(sm.DistanceProgressPercent, 0)}% mục tiêu`}</small>}</div>
        <div className="kpi"><small>Điểm trung bình</small><b>{num(sm.AvgPerformanceScore)}</b></div>
        <div className="kpi"><small>Hồi phục trung bình</small><b>{minutes(sm.AvgRecoveryMinutes)}</b></div>
      </div>
      <div className="grid">
        <div className="card"><SectionTitle icon="check">So với giai đoạn trước</SectionTitle>
          {cmp ? <Dl cols={2} items={DELTAS.map(([k, label, unit]) => [label, cmp[k] == null ? '—' : `${cmp[k] > 0 ? '+' : ''}${num(cmp[k])}${unit}`])} />
            : <p className="hint" style={{ margin: 0 }}>Đây là giai đoạn đầu tiên của giáo án nên chưa có số liệu so sánh.</p>}</div>
        <HealthCard health={sm.Health} title="Sức khỏe trong giai đoạn" extra={false} />
      </div>
      {st.SummaryNote && <div className="quote" style={{ marginTop: 14 }}><small>Nhận xét khi chốt giai đoạn · {st.ClosedByName} · {fmtDateTime(st.ClosedAt)}</small><p>{st.SummaryNote}</p></div>}
      <h2 className="sec-h">Buổi tập trong giai đoạn</h2>
      {!rows.length ? <p className="empty">Chưa có buổi tập hoàn thành trong giai đoạn.</p> : <>
        <table><thead><tr><th>Ngày tập</th><th>Bài tập</th><th>Quãng đường</th><th>Điểm</th><th>Đánh giá</th></tr></thead>
          <tbody>{pager.slice.map((s) => <tr key={s.TrainingSessionID}><td><Link className="link" to={`/owner/horses/${horseId}/training/sessions/${s.TrainingSessionID}`}>{fmtDate(s.SessionDate)}</Link></td>
            <td>{s.TrainingType}</td><td>{s.DistanceKm != null ? km(s.DistanceKm) : '—'}</td><td><b>{s.PerformanceScore != null ? num(s.PerformanceScore, 0) : '—'}</b></td>
            <td>{s.AwaitingReview ? 'Chờ đánh giá' : EVALUATION[s.Evaluation] || '—'}</td></tr>)}</tbody></table>
        <Pager pager={pager} /></>}
    </section>
  </Page>
}

// ====================================================================== Hoạt động huấn luyện (tổng hợp các ngựa)
export function OwnerActivityPage() {
  const data = useLoad(async () => {
    const horses = list(await apiGet('/horses')).filter((h) => h.RegistrationStatus === 'Approved')
    return Promise.all(horses.map(async (h) => {
      const [plans, sessions] = await Promise.all([owner.plans(h.HorseID).catch(() => ({ Plans: [] })), owner.sessions(h.HorseID).catch(() => [])])
      return { horse: h, plans: plans.Plans || [], sessions }
    }))
  }, [])
  if (data.loading) return <Page><Loading /></Page>
  if (data.error) return <Fail error={data.error} />
  const rows = data.data
  return <Page>
    <Crumb items={[['Hoạt động huấn luyện']]} />
    <Heading title="Hoạt động huấn luyện" />
    <section className="panel">
      <div className="kpis">
        <div className="kpi"><small>Ngựa đang tập luyện</small><b>{rows.filter((r) => r.plans.some((p) => p.Status === 'Active')).length}</b></div>
        <div className="kpi"><small>Buổi tập hoàn thành</small><b>{rows.reduce((a, r) => a + r.sessions.filter((s) => s.Status === 'Completed').length, 0)}</b></div>
        <div className="kpi"><small>Chờ huấn luyện viên đánh giá</small><b>{rows.reduce((a, r) => a + r.sessions.filter((s) => s.AwaitingReview).length, 0)}</b></div>
        <div className="kpi"><small>Giáo án đang áp dụng</small><b>{rows.reduce((a, r) => a + r.plans.filter((p) => p.Status === 'Active').length, 0)}</b></div>
      </div>
      {!rows.length ? <p className="empty">Chưa có ngựa được tiếp nhận vào câu lạc bộ.</p> : <table>
        <thead><tr><th>Ngựa</th><th>Huấn luyện viên</th><th>Giáo án hiện hành</th><th>Tiến độ</th><th>Buổi gần nhất</th><th>Thao tác</th></tr></thead>
        <tbody>{rows.map(({ horse: h, plans, sessions }) => {
          const p = plans.find((x) => x.Status === 'Active') || plans[0]
          const last = sessions.find((s) => s.Status === 'Completed')
          return <tr key={h.HorseID}>
            <td><div className="hname"><HorseThumb horseId={h.HorseID} /><div><b>{h.HorseName}</b><small>{[h.HorseCode, h.Breed].filter(Boolean).join(' · ')}</small></div></div></td>
            <td>{p?.TrainerName || <span className="muted">Chưa phân công</span>}</td>
            <td>{p ? <><b>Giáo án #{p.TrainingPlanID}</b><small>{p.Goal}</small></> : <span className="muted">Chưa có giáo án được duyệt</span>}</td>
            <td style={{ minWidth: 140 }}>{p ? <><div className="bar"><i style={{ width: `${Math.min(100, p.ProgressPercent || 0)}%` }} /></div><small>{num(p.ProgressPercent, 0)}%</small></> : '—'}</td>
            <td>{last ? <><b>{fmtDate(last.SessionDate)}</b><small>{last.AwaitingReview ? 'Chờ huấn luyện viên đánh giá' : last.Evaluation ? EVALUATION[last.Evaluation] : last.TrainingType}</small></> : <span className="muted">Chưa có buổi tập</span>}</td>
            <td><Link className="btn pri sm" to={`/owner/horses/${h.HorseID}/training`}>Xem hoạt động</Link></td>
          </tr>
        })}</tbody></table>}
    </section>
  </Page>
}
