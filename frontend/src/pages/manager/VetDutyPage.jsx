import { useState } from 'react'
import { apiDelete, apiPost } from '../../api/apiClient.ts'
import { getCompleteVetList } from '../../api/vetApi.ts'
import { CarePage, Loading, Notice } from '../care/careShared.jsx'
import { addDays, fmtDate, todayText, useLoad, useSubmit } from '../care/careUtils.js'

const SHIFTS = { Morning: 'Sáng · 06:00–14:00', Afternoon: 'Chiều · 14:00–22:00', Night: 'Đêm · 22:00–06:00 hôm sau', 'Full Day': 'Cả ngày' }
export default function VetDutyPage() {
  const [start, setStart] = useState(todayText())
  const data = useLoad(() => Promise.all([getCompleteVetList('/users?RoleCode=VETERINARIAN&Status=Active'), getCompleteVetList(`/vet-duty-shifts?From=${start}&To=${addDays(start, 6)}`)]), [start])
  const [vets = [], shifts = []] = data.data || []
  const action = useSubmit()
  return <CarePage crumb="Lịch trực Vet" eyebrow="QUẢN LÝ" title="Phân lịch trực thú y" description="Vet đang trực được ưu tiên báo khi có ca khẩn. Các Vet khác trong CLB vẫn có thể nhận hỗ trợ.">
    <label className="form-field"><span>Xem 7 ngày từ</span><input type="date" value={start} onChange={e => e.target.value && setStart(e.target.value)} /></label>
    <Loading state={data}><form className="panel care-form" onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); if (await action.run(() => apiPost('/vet-duty-shifts', { VetID: Number(f.get('vet')), DutyDate: f.get('day'), Shift: f.get('shift'), Note: f.get('note') }), 'Đã lưu ca trực.')) { form.reset(); data.reload() } }}>
      <fieldset className="vet-form-fields" disabled={action.busy}><label className="form-field"><span>Bác sĩ</span><select name="vet" required><option value="">Chọn bác sĩ</option>{vets.map(v => <option key={v.UserID} value={v.UserID}>{v.FullName}</option>)}</select></label>
        <label className="form-field"><span>Ngày trực</span><input name="day" type="date" min={todayText()} defaultValue={todayText()} required /></label><label className="form-field"><span>Ca</span><select name="shift">{Object.entries(SHIFTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label><label className="form-field"><span>Ghi chú</span><input name="note" maxLength={500} /></label><button className="button" disabled={action.busy}>Phân ca trực</button></fieldset>
    </form><Notice state={action} /><section className="panel"><h2>Các ca đã phân</h2>{!shifts.length && <p>Chưa có ca trực trong tuần này.</p>}{shifts.map(s => <article className="vet-amendment" key={s.VetDutyShiftID}><strong>{s.VetName} · {fmtDate(s.DutyDate)} · {SHIFTS[s.Shift]}</strong><p>{s.Note}{s.IsOnDutyNow && ' · Đang trực'}</p>{s.DutyDate >= todayText() && <button className="button button-secondary" disabled={action.busy} onClick={async () => { if (await action.run(() => apiDelete(`/vet-duty-shifts/${s.VetDutyShiftID}`), 'Đã bỏ ca trực.')) data.reload() }}>Bỏ ca</button>}</article>)}</section></Loading>
  </CarePage>
}
