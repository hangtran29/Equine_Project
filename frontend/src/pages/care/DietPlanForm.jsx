// Biểu mẫu khẩu phần: Head Trainer lập mới / sửa bản chờ duyệt hoặc bị trả về; Vet điều chỉnh bản đang áp dụng.
import { useState } from 'react'
import { FieldError, MealEditor, Notice } from './careShared.jsx'
import { EMPTY_MEAL, mealsForApi, mealsFromPlan, todayText, useSubmit } from './careUtils.js'

/**
 * mode: "create" | "edit" | "adjust"
 * save(body) trả về Promise; onSaved(result) khi thành công.
 */
export default function DietPlanForm({ mode, plan, copyFrom, horseName, save, onSaved, onCancel }) {
  const source = plan || copyFrom
  const [form, setForm] = useState({
    DietDescription: plan?.DietDescription || (copyFrom ? copyFrom.DietDescription || '' : ''),
    StartDate: plan?.StartDate || todayText(),
    EndDate: plan?.EndDate || '',
    VetNote: '',
  })
  const [meals, setMeals] = useState(() => {
    const list = mealsFromPlan(source)
    return list.length ? list : [{ ...EMPTY_MEAL, MealTime: '06:00' }]
  })
  const action = useSubmit()
  const set = key => event => setForm(f => ({ ...f, [key]: event.target.value }))
  const title = mode === 'create' ? `Lập khẩu phần mới cho ${horseName}`
    : mode === 'edit' ? 'Sửa khẩu phần theo góp ý của Vet' : 'Điều chỉnh khẩu phần'

  async function submit(event) {
    event.preventDefault()
    const body = { Meals: mealsForApi(meals), EndDate: form.EndDate || null }
    if (mode !== 'adjust') {
      body.DietDescription = form.DietDescription.trim() || null
      body.StartDate = form.StartDate
    } else {
      body.VetNote = form.VetNote.trim()
    }
    const result = await action.run(() => save(body), 'Đã lưu khẩu phần, chờ Head Trainer chốt.')
    if (result) onSaved(result)
  }

  return <form className="panel care-form" onSubmit={submit}>
    <h2>{title}</h2>
    {mode !== 'adjust' && <p className="care-muted">Khẩu phần mới ở trạng thái <b>Chờ chốt</b>. Sau khi Head Trainer chốt và hệ thống kiểm tra hạn chế y tế, các bữa được dùng để giao việc cho Groom.
      {copyFrom && ' Các bữa ăn được chép sẵn từ khẩu phần đang áp dụng, sửa lại cho phù hợp giai đoạn tập.'}</p>}
    <div className="care-form-grid">
      {mode !== 'adjust' && <label className="form-field care-span-2"><span>Mô tả khẩu phần</span>
        <input maxLength={1000} value={form.DietDescription} onChange={set('DietDescription')}
          placeholder="vd Khẩu phần giai đoạn tăng tốc – tăng năng lượng, bổ sung điện giải" />
        <FieldError fields={action.fields} name="DietDescription" /></label>}
      {mode !== 'adjust' && <label className="form-field"><span>Áp dụng từ ngày</span>
        <input type="date" required value={form.StartDate} onChange={set('StartDate')} />
        <FieldError fields={action.fields} name="StartDate" /></label>}
      <label className="form-field"><span>Đến ngày (không bắt buộc)</span>
        <input type="date" value={form.EndDate} min={form.StartDate} onChange={set('EndDate')} />
        <FieldError fields={action.fields} name="EndDate" /></label>
      {mode === 'adjust' && <label className="form-field care-span-2"><span>Lý do điều chỉnh (bắt buộc)</span>
        <textarea required maxLength={1500} rows={2} value={form.VetNote} onChange={set('VetNote')}
          placeholder="vd Ngựa đang điều trị viêm gân: giảm yến mạch, tăng cỏ khô" />
        <FieldError fields={action.fields} name="VetNote" /></label>}
    </div>
    <h3 className="care-subtitle">Các bữa ăn trong ngày</h3>
    <MealEditor meals={meals} onChange={setMeals} fields={action.fields} disabled={action.busy} />
    <Notice state={{ ...action, notice: '' }} />
    <div className="care-actions">
      <button className="button" type="submit" disabled={action.busy}>
        {action.busy ? 'Đang lưu…' : 'Lưu khẩu phần chờ chốt'}</button>
      <button className="button button-secondary" type="button" disabled={action.busy} onClick={onCancel}>Hủy</button>
    </div>
  </form>
}
