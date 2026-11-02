import { apiPost } from '../../api/apiClient.ts'
import { getCompleteVetList } from '../../api/vetApi.ts'
import { useLoad, useSubmit, todayText, TASK_TYPES, fmtDate } from '../care/careUtils.js'
import { Loading, Notice } from '../care/careShared.jsx'

export default function VetCareOrders({ horse, records, currentUser }) {
  const orders = useLoad(() => getCompleteVetList(`/horses/${horse.id}/care-orders`), [horse.id])
  const locks = useLoad(() => getCompleteVetList(`/training-locks?HorseID=${horse.id}&LockStatus=Active`), [horse.id])
  const action = useSubmit()
  const signed = records.filter(r => r.recordStatus === 'Signed' && r.vetId === currentUser.id)
  return <section className="panel"><h2>Chỉ định chăm sóc cho Groom</h2><p>Chỉ chia sẻ hướng dẫn cần thực hiện. Ngâm chân lạnh cần chỉ định riêng; không tự áp dụng cho mọi nguyên nhân khóa tập.</p>
    <Loading state={orders}>{(orders.data || []).map(o => <article className="vet-amendment" key={o.VetCareOrderID}><strong>{TASK_TYPES[o.TaskType]} · {o.IsActive ? 'Đang chỉ định' : 'Đã ngừng'}</strong><p>{o.Instructions}</p><p>Phiếu #{o.MedicalRecordID}{o.TrainingLockID && ` · Khóa #${o.TrainingLockID}`} · {fmtDate(o.StartDate)} → {fmtDate(o.EndDate)} · {String(o.TimeOfDay).slice(0, 5)}</p>{o.IsActive && <form onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); if (await action.run(() => apiPost(`/care-orders/${o.VetCareOrderID}/stop`, { Reason: f.get('reason') }), 'Đã ngừng chỉ định.')) orders.reload() }}><label className="form-field"><span>Lý do ngừng</span><input name="reason" required maxLength={1000} /></label><button className="button button-secondary" disabled={action.busy}>Ngừng chỉ định</button></form>}</article>)}</Loading>
    {!signed.length ? <p>Ký phiếu khám của bạn trước khi giao chỉ định chăm sóc định kỳ.</p> : <form className="vet-operation-form" onSubmit={async e => {
      e.preventDefault(); const form = e.currentTarget; const f = new FormData(form)
      const body = { MedicalRecordID: Number(f.get('record')), TrainingLockID: f.get('lock') ? Number(f.get('lock')) : null,
        TaskType: f.get('kind'), Instructions: f.get('instructions'), StartDate: f.get('start'), EndDate: f.get('end'), TimeOfDay: f.get('at') }
      if (await action.run(() => apiPost(`/horses/${horse.id}/care-orders`, body), 'Đã lưu chỉ định; tác vụ nền sẽ giao cho Groom.')) { form.reset(); orders.reload() }
    }}><fieldset className="vet-form-fields" disabled={action.busy || locks.loading || !!locks.error}>
      <label className="form-field"><span>Phiếu chỉ định đã ký</span><select name="record" required>{signed.map(r => <option key={r.id} value={r.id}>#{r.id} · {r.examType}</option>)}</select></label>
      <label className="form-field"><span>Đợt khóa liên quan</span><select name="lock"><option value="">Không liên quan khóa tập</option>{(locks.data || []).map(l => <option key={l.TrainingLockID} value={l.TrainingLockID}>#{l.TrainingLockID} · {l.Reason}</option>)}</select></label>
      <label className="form-field"><span>Biện pháp</span><select name="kind"><option value="Medical Care">Chăm sóc y tế theo hướng dẫn</option><option value="Ice Leg Soak">Ngâm chân lạnh theo chỉ định</option></select></label>
      <label className="form-field"><span>Hướng dẫn cụ thể cho Groom</span><textarea name="instructions" required maxLength={1000} /></label>
      <label className="form-field"><span>Từ ngày</span><input name="start" type="date" min={todayText()} defaultValue={todayText()} required /></label>
      <label className="form-field"><span>Đến ngày (tối đa 90 ngày)</span><input name="end" type="date" min={todayText()} required /></label>
      <label className="form-field"><span>Giờ thực hiện hằng ngày</span><input name="at" type="time" defaultValue="16:00" required /></label>
      <button className="button" disabled={action.busy}>Lưu chỉ định chăm sóc</button>
    </fieldset></form>}
    {locks.error && <p role="alert">{locks.error}</p>}<Notice state={action} />
  </section>
}
