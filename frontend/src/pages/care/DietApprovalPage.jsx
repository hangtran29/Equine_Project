import { useState } from 'react'
import { apiPost } from '../../api/apiClient.ts'
import { getCompleteVetList } from '../../api/vetApi.ts'
import { getApprovedHorses, getDietContext, getHorseDietPlans, rejectDietPlan } from '../../api/careApi.ts'
import { CarePage, Loading, Notice } from './careShared.jsx'
import { DietContextPanel, DietPlanCard } from './dietShared.jsx'
import { todayText, useLoad, useSubmit, fmtDate } from './careUtils.js'

function HorseNutrition({ horse }) {
  const [mode, setMode] = useState('advice')
  const action = useSubmit()
  const data = useLoad(() => Promise.all([getDietContext(horse.HorseID), getHorseDietPlans(horse.HorseID),
    getCompleteVetList(`/horses/${horse.HorseID}/diet-restrictions`)]), [horse.HorseID])
  const [context, plans = [], restrictions = []] = data.data || []
  return <Loading state={data}>
    <DietContextPanel context={context} />
    <section className="panel"><h2>Góp ý và hạn chế y tế</h2><p>Vet đặt hạn chế cho từng ngựa. Head Trainer lập và chốt khẩu phần; hệ thống kiểm tra loại thức ăn và tổng lượng mỗi ngày khi chốt.</p>
      <form className="care-form" onSubmit={async e => {
        e.preventDefault(); const form = e.currentTarget, f = new FormData(form)
        const result = await action.run(() => apiPost(`/horses/${horse.HorseID}/diet-restrictions`, {
          Instructions: f.get('instructions'), StartDate: f.get('start'), EndDate: f.get('end') || null,
          FeedType: mode === 'advice' ? '' : f.get('feed'), Unit: mode === 'limit' ? f.get('unit') : '',
          MaxDailyQuantity: mode === 'limit' ? Number(f.get('maximum')) : null,
        }), 'Đã lưu chỉ định dinh dưỡng và thông báo Head Trainer.')
        if (result) { form.reset(); data.reload() }
      }}><fieldset className="vet-form-fields" disabled={action.busy}>
        <label className="form-field"><span>Loại chỉ định</span><select value={mode} onChange={e => setMode(e.target.value)}><option value="advice">Góp ý / hướng dẫn</option><option value="blocked">Không dùng một loại thức ăn</option><option value="limit">Giới hạn lượng mỗi ngày</option></select></label>
        {mode !== 'advice' && <label className="form-field"><span>Tên loại thức ăn (đúng tên trong khẩu phần)</span><input name="feed" required maxLength={100} /></label>}
        {mode === 'limit' && <><label className="form-field"><span>Lượng tối đa / ngày</span><input name="maximum" type="number" min="0" step="0.01" required /></label><label className="form-field"><span>Đơn vị</span><input name="unit" required maxLength={30} /></label></>}
        <label className="form-field"><span>Nội dung / lý do y tế</span><textarea name="instructions" required maxLength={1500} /></label>
        <label className="form-field"><span>Hiệu lực từ</span><input name="start" type="date" defaultValue={todayText()} required /></label>
        <label className="form-field"><span>Đến ngày (để trống nếu chưa xác định)</span><input name="end" type="date" /></label>
        <button className="button" disabled={action.busy}>Lưu chỉ định</button>
      </fieldset></form>
      {restrictions.map(r => <article key={r.VetDietRestrictionID} className="vet-amendment"><strong>{r.Instructions}</strong><p>{r.CreatedByName} · {fmtDate(r.StartDate)} → {r.EndDate ? fmtDate(r.EndDate) : 'Đến khi ngừng chỉ định'} · {r.IsActive ? 'Có hiệu lực theo ngày' : 'Đã ngừng'}</p>{r.FeedType && <p>{r.MaxDailyQuantity == null ? `Không dùng ${r.FeedType}` : `${r.FeedType}: tối đa ${r.MaxDailyQuantity} ${r.Unit}/ngày`}</p>}{r.IsActive && <form onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); if (await action.run(() => apiPost(`/diet-restrictions/${r.VetDietRestrictionID}/stop`, { Reason: f.get('reason') }), 'Đã ngừng hạn chế.')) data.reload() }}><label className="form-field"><span>Lý do ngừng</span><input name="reason" required maxLength={1000} /></label><button className="button button-secondary" disabled={action.busy}>Ngừng hạn chế</button></form>}</article>)}
      <Notice state={action} />
    </section>
    <section className="panel"><h2>Khẩu phần do Head Trainer lập</h2>{plans.map(p => <DietPlanCard key={p.DietPlanID} plan={p}>{p.Status === 'Pending' && <form onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); if (await action.run(() => rejectDietPlan(p.DietPlanID, String(f.get('note')).trim()), 'Đã gửi góp ý để Head Trainer sửa khẩu phần.')) data.reload() }}><label className="form-field"><span>Góp ý cần sửa trước khi chốt</span><textarea name="note" required maxLength={1500} /></label><button className="button button-secondary" disabled={action.busy}>Yêu cầu chỉnh sửa</button></form>}</DietPlanCard>)}</section>
  </Loading>
}

export default function DietApprovalPage() {
  const horses = useLoad(getApprovedHorses, [])
  const [horseId, setHorseId] = useState('')
  const selected = horses.data?.find(h => String(h.HorseID) === horseId)
  return <CarePage crumb="Góp ý dinh dưỡng" eyebrow="BÁC SĨ THÚ Y" title="Chỉ định dinh dưỡng theo sức khỏe" description="Xem khẩu phần và đưa hướng dẫn y tế cho từng ngựa. Head Trainer chịu trách nhiệm chốt khẩu phần chuẩn.">
    <Loading state={horses}><label className="form-field"><span>Ngựa</span><select value={horseId} onChange={e => setHorseId(e.target.value)}><option value="">Chọn ngựa</option>{(horses.data || []).map(h => <option key={h.HorseID} value={h.HorseID}>{h.HorseName}</option>)}</select></label></Loading>
    {selected && <HorseNutrition key={horseId} horse={selected} />}
  </CarePage>
}
