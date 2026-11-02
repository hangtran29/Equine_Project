// Phần dùng chung giữa trang lập khẩu phần (Head Trainer) và duyệt khẩu phần (Vet).
import { Badge, MealList } from './careShared.jsx'
import { DIET_STATUS, INTENSITY, fmtDate, fmtDateTime, fmtNumber } from './careUtils.js'

const HEALTH = {
  Healthy: 'Khỏe mạnh', Monitor: 'Cần theo dõi', Injured: 'Chấn thương', Recovering: 'Đang hồi phục',
  Isolated: 'Cách ly', Unknown: 'Chưa rõ',
}

/** Bối cảnh tập luyện của ngựa – xem trước khi lập / duyệt khẩu phần (GET /horses/{id}/diet-context). */
export function DietContextPanel({ context }) {
  if (!context) return null
  const plan = context.ActiveTrainingPlan
  const stage = context.CurrentStage
  const past = context.Last14Days || {}
  const next = context.Next7Days || {}
  const lock = context.TrainingLock
  return <section className="panel care-context">
    <h2>Bối cảnh tập luyện của {context.HorseName}</h2>
    <div className="care-context-grid">
      <div><span>Sức khỏe</span><strong>{HEALTH[context.CurrentHealthStatus] || context.CurrentHealthStatus || '—'}</strong></div>
      <div><span>Cân nặng gần nhất</span><strong>{context.LatestWeightKg ? `${fmtNumber(context.LatestWeightKg)} kg` : 'Chưa có'}</strong></div>
      <div><span>Giáo án đang chạy</span><strong>{plan ? plan.Goal || `Giáo án #${plan.TrainingPlanID}` : 'Không có'}</strong>
        {plan && <small>{fmtDate(plan.StartDate)} – {fmtDate(plan.EndDate)} · {INTENSITY[plan.OverallIntensity] || plan.OverallIntensity || '—'}</small>}</div>
      <div><span>Giai đoạn hiện tại</span><strong>{stage ? stage.StageName : '—'}</strong>
        {stage && <small>Cường độ {INTENSITY[stage.Intensity] || stage.Intensity || '—'} · tải {fmtNumber(stage.TrainingLoad)}
          {stage.DistanceTargetKm ? ` · mục tiêu ${fmtNumber(stage.DistanceTargetKm)} km` : ''}</small>}</div>
      <div><span>14 ngày qua</span><strong>{past.CompletedSessions ?? 0} buổi hoàn thành</strong>
        <small>{fmtNumber(past.TotalDistanceKm)} km · tải TB {fmtNumber(past.AvgTrainingLoad)} · hồi phục TB {fmtNumber(past.AvgRecoveryMinutes)} phút</small></div>
      <div><span>7 ngày tới</span><strong>{next.PlannedSessions ?? 0} buổi đã xếp</strong>
        <small>Tải TB {fmtNumber(next.AvgTrainingLoad)}</small></div>
    </div>
    {lock && <p className="care-lock">Đang bị Vet khóa tập ({lock.LockLevel === 'Full' ? 'khóa toàn bộ' : 'giới hạn cường độ'}){lock.Reason ? `: ${lock.Reason}` : ''}.</p>}
    {context.Notes?.length > 0 && <ul className="care-notes">{context.Notes.map(note => <li key={note}>{note}</li>)}</ul>}
    {context.DietRestrictions?.length > 0 && <div className="care-vet-note"><h3>Chỉ định dinh dưỡng của Vet</h3>{context.DietRestrictions.map(r => <p key={r.VetDietRestrictionID}><strong>{r.Instructions}</strong> · {r.CreatedByName} · {fmtDate(r.StartDate)} → {r.EndDate ? fmtDate(r.EndDate) : 'Chưa định ngày kết thúc'}{r.FeedType && (r.MaxDailyQuantity == null ? ` · Không dùng ${r.FeedType}` : ` · ${r.FeedType}: tối đa ${r.MaxDailyQuantity} ${r.Unit}/ngày`)}</p>)}</div>}
  </section>
}

export function DietPlanCard({ plan, children, compact = false }) {
  return <article className="care-diet">
    <header>
      <div>
        <strong>{plan.DietDescription || `Khẩu phần #${plan.DietPlanID}`}</strong>
        <small>{plan.HorseName} · từ {fmtDate(plan.StartDate)}{plan.EndDate ? ` đến ${fmtDate(plan.EndDate)}` : ' (chưa định ngày kết thúc)'}</small>
      </div>
      <Badge map={DIET_STATUS} value={plan.Status} />
    </header>
    {!compact && <MealList meals={plan.Meals} />}
    <p className="care-task-meta">
      Lập bởi {plan.CreatedByName || '—'} lúc {fmtDateTime(plan.CreatedAt)}
      {plan.ReviewedByName && <> · Vet: {plan.ReviewedByName}{plan.ApprovedAt ? ` (${fmtDateTime(plan.ApprovedAt)})` : ''}</>}
      {plan.TrainingPlanID && <> · Theo giáo án #{plan.TrainingPlanID}</>}
    </p>
    {plan.VetNote && <p className={`care-vet-note${plan.Status === 'Rejected' ? ' care-vet-note-danger' : ''}`}>
      <b>Ghi chú của Vet:</b> {plan.VetNote}</p>}
    {children}
  </article>
}
