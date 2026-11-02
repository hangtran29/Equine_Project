// Head Trainer: chỉ tiêu chăm sóc của CLB – hệ thống dựa vào đây để tự sinh việc cho Groom.
import { useState } from 'react'
import { getCareRules, updateCareRule } from '../../api/careApi.ts'
import { CarePage, FieldError, Loading, Notice } from './careShared.jsx'
import { RULE_HELP, TASK_TYPES, fmtDateTime, fmtTime, useLoad, useSubmit } from './careUtils.js'

function RuleCard({ rule, onSaved }) {
  const usesTime = ['DAILY_CLEANING', 'ICE_SOAK_WHEN_LOCKED'].includes(rule.RuleCode)
  const usesOffset = rule.RuleCode === 'BATH_AFTER_TRAINING'
  const [form, setForm] = useState({
    Title: rule.Title || '', IsActive: !!rule.IsActive,
    TimeOfDay: rule.TimeOfDay ? fmtTime(rule.TimeOfDay) : '', OffsetMinutes: rule.OffsetMinutes ?? '',
  })
  const action = useSubmit()
  async function submit(event) {
    event.preventDefault()
    const body = { Title: form.Title.trim(), IsActive: form.IsActive }
    if (usesTime) body.TimeOfDay = form.TimeOfDay || null
    if (usesOffset) body.OffsetMinutes = form.OffsetMinutes === '' ? null : Number(form.OffsetMinutes)
    const ok = await action.run(() => updateCareRule(rule.RuleCode, body),
      'Đã lưu. Việc hôm nay và các ngày đã sinh được cập nhật theo chỉ tiêu mới.')
    if (ok) onSaved()
  }
  return <form className={`panel care-rule${form.IsActive ? '' : ' care-rule-off'}`} onSubmit={submit}>
    <header>
      <div><span className="care-badge care-badge-info">{TASK_TYPES[rule.TaskType] || rule.TaskType}</span>
        <h2>{rule.Title}</h2></div>
      <label className="care-switch"><input type="checkbox" checked={form.IsActive}
        onChange={e => setForm(f => ({ ...f, IsActive: e.target.checked }))} /><span>{form.IsActive ? 'Đang bật' : 'Đang tắt'}</span></label>
    </header>
    <p className="care-muted">{RULE_HELP[rule.RuleCode]}</p>
    <div className="care-form-grid">
      <label className="form-field care-span-2"><span>Tên việc hiển thị cho Groom</span>
        <input required maxLength={150} value={form.Title} onChange={e => setForm(f => ({ ...f, Title: e.target.value }))} />
        <FieldError fields={action.fields} name="Title" /></label>
      {usesTime && <label className="form-field"><span>Giờ thực hiện</span>
        <input type="time" required value={form.TimeOfDay} onChange={e => setForm(f => ({ ...f, TimeOfDay: e.target.value }))} />
        <FieldError fields={action.fields} name="TimeOfDay" /></label>}
      {usesOffset && <label className="form-field"><span>Sau khi kết thúc buổi tập (phút)</span>
        <input type="number" min="0" max="240" required value={form.OffsetMinutes}
          onChange={e => setForm(f => ({ ...f, OffsetMinutes: e.target.value }))} />
        <FieldError fields={action.fields} name="OffsetMinutes" /></label>}
      {rule.RuleCode === 'FEEDING_BY_DIET' && <p className="care-muted care-span-2">Giờ cho ăn lấy theo từng bữa trong khẩu phần đã được Head Trainer chốt.</p>}
    </div>
    <Notice state={action} />
    <footer>
      <small className="care-muted">{rule.UpdatedByName ? `Sửa lần cuối: ${rule.UpdatedByName}, ${fmtDateTime(rule.UpdatedAt)}` : 'Đang dùng giá trị mặc định'}</small>
      <button className="button" type="submit" disabled={action.busy}>{action.busy ? 'Đang lưu…' : 'Lưu chỉ tiêu'}</button>
    </footer>
  </form>
}

export default function CareRulesPage() {
  const rules = useLoad(getCareRules, [])
  return <CarePage crumb="Chỉ tiêu chăm sóc" eyebrow="HUẤN LUYỆN VIÊN TRƯỞNG" title="Chỉ tiêu chăm sóc hằng ngày"
    description="Hệ thống sinh việc theo chỉ tiêu. Khi nguồn thay đổi, việc tự sinh chưa làm và chưa tới giờ được cập nhật hoặc đánh dấu bỏ qua, giữ lịch sử. Chỉ định y tế do Vet quản lý riêng.">
    <Loading state={rules} isEmpty={!rules.data?.length}>
      <div className="care-rule-grid">
        {(rules.data || []).filter(rule => rule.RuleCode !== 'ICE_SOAK_WHEN_LOCKED').map(rule => <RuleCard key={rule.CareTaskRuleID} rule={rule} onSaved={rules.reload} />)}
      </div>
    </Loading>
  </CarePage>
}
