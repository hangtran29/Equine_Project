// Lịch trực bác sĩ thú y (14, quản lý), Khám lâm sàng: hàng chờ (15), đánh giá lâm sàng (16–18).
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import * as api from './api.js'
import { ELIGIBILITY, HEALTH, HorseThumb, horseMeta, usePhotos } from './horse.jsx'
import {
  Badge, Crumb, DateField, Dialog, Dl, DocRow, Field, Heading, HorseCard, Icon, Loading, Notice, SectionTitle, SelectInput,
  TextArea, TextInput, errorText, fmtDate, fmtDateTime, todayIso, useAction, useLoad,
} from './ui.jsx'
import { currentLang } from '../i18n/runtime.js'
import './f1.css'

export const SHIFTS = [
  ['Morning', 'Ca sáng', '06:00–14:00'], ['Afternoon', 'Ca chiều', '14:00–22:00'],
  ['Night', 'Ca đêm', '22:00–06:00'], ['Full Day', 'Cả ngày', '00:00–24:00'],
]
const SHIFT_NAME = Object.fromEntries(SHIFTS.map(([k, n, t]) => [k, [n, t]]))
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function monday(date) { const d = new Date(date); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0); return d }
const DAY = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const shortDate = (d) => currentLang() === 'en' ? `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}` : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

// ---------------- 14: Lịch trực bác sĩ thú y ----------------
export function VetDutyRosterPage() {
  const [start, setStart] = useState(() => monday(new Date()))
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d }), [start])
  const from = iso(days[0]); const to = iso(days[6])
  const shifts = useLoad(() => api.getDutyShifts(from, to), [from, to])
  const vets = useLoad(() => api.getUsers({ RoleCode: 'VETERINARIAN', Status: 'Active' }), [])
  const [form, setForm] = useState({ VetID: '', DutyDate: todayIso(), Shift: 'Morning', Note: '' })
  const [errors, setErrors] = useState({})
  const { busy, error, run } = useAction()
  const today = todayIso()
  // sửa một ô thì bỏ thông báo thiếu của ô đó
  const change = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((x) => ({ ...x, [k]: undefined })) }
  async function add(e) {
    e.preventDefault()
    const errs = {}
    if (!form.VetID) errs.VetID = 'Vui lòng chọn bác sĩ phụ trách.'
    if (!form.DutyDate) errs.DutyDate = 'Vui lòng chọn ngày trực.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    if (await run(() => api.addDutyShift({ VetID: Number(form.VetID), DutyDate: form.DutyDate, Shift: form.Shift, ...(form.Note.trim() ? { Note: form.Note.trim() } : {}) }))) {
      setForm((f) => ({ ...f, Note: '' })); shifts.reload()
    }
  }
  const move = (n) => setStart((s) => { const d = new Date(s); d.setDate(d.getDate() + n * 7); return d })
  const rows = SHIFTS.filter(([k]) => k !== 'Full Day' || (shifts.data || []).some((s) => s.Shift === 'Full Day'))
  return <main className="page-content f1">
    <Crumb items={[['Lịch trực bác sĩ thú y']]} />
    <Heading title="Lịch trực bác sĩ thú y" />
    <section className="panel" style={{ marginTop: 48 }}>
      <form className="card" style={{ marginBottom: 18 }} onSubmit={add}><SectionTitle icon="plus">Phân công ca trực mới</SectionTitle>
        {/* canh theo đầu ô: lỗi hiện ngay dưới ô bị thiếu mà các ô khác không bị lệch hàng */}
        <div className="fgrid" style={{ gridTemplateColumns: 'repeat(4,1fr) auto', alignItems: 'start' }}>
          <SelectInput label="Bác sĩ phụ trách" required value={form.VetID} error={errors.VetID} onChange={change('VetID')}
            placeholder="Chọn bác sĩ" options={(vets.data || []).map((v) => [String(v.UserID), v.FullName])} />
          <DateField label="Ngày trực" required value={form.DutyDate} error={errors.DutyDate} min={today} onChange={change('DutyDate')} />
          <SelectInput label="Ca phân công" required value={form.Shift} onChange={(v) => setForm((f) => ({ ...f, Shift: v }))}
            options={SHIFTS.map(([k, n, t]) => [k, `${n} · ${t}`])} />
          <TextInput label="Ghi chú" value={form.Note} onChange={(v) => setForm((f) => ({ ...f, Note: v }))} maxLength={500} />
          <div className="field"><span aria-hidden="true">&nbsp;</span>
            <button type="submit" className="btn pri" style={{ height: 42 }} disabled={busy}>Phân công ca trực</button></div>
        </div>
        {error && <Notice kind="bad" style={{ marginTop: 12 }}>{error}</Notice>}
      </form>
      <div className="toolbar"><b style={{ fontSize: 16 }}>Tuần {shortDate(days[0])} – {fmtDate(to)}</b>
        <button type="button" className="btn sec sm" style={{ marginLeft: 'auto' }} onClick={() => move(-1)}>‹ Tuần trước</button>
        <button type="button" className="btn sec sm" onClick={() => setStart(monday(new Date()))}>Tuần này</button>
        <button type="button" className="btn sec sm" onClick={() => move(1)}>Tuần sau ›</button></div>
      {shifts.loading ? <Loading /> : shifts.error ? <Notice kind="bad">{errorText(shifts.error)}</Notice> :
        <div className="week">
          <div className="h">Ca</div>
          {days.map((d, i) => <div key={i} className={`h ${iso(d) === today ? 'today' : ''}`}>{DAY[i]}<small>{shortDate(d)}</small></div>)}
          {rows.map(([key, name, time]) => <FragmentRow key={key} name={name} time={time} days={days} today={today}
            items={(shifts.data || []).filter((s) => s.Shift === key)} onRemove={async (id) => { await api.deleteDutyShift(id).catch(() => {}); shifts.reload() }} />)}
        </div>}
      <p className="hint" style={{ marginTop: 14 }}><b>Lưu ý:</b> Các ca chưa được phân công sẽ ở trạng thái chờ chỉ định. Đối với các trường hợp khẩn cấp, vui lòng liên hệ Bác sĩ trưởng ca để được hỗ trợ kịp thời.</p>
    </section>
  </main>
}

function FragmentRow({ name, time, days, today, items, onRemove }) {
  return <>
    <div className="shift">{name}<small>{time}</small></div>
    {days.map((d) => {
      const day = iso(d)
      return <div key={day} className={day === today ? 'today' : ''}>
        {items.filter((s) => s.DutyDate === day).map((s) => <span key={s.VetDutyShiftID} className={`chip ${s.IsOnDutyNow ? 'now' : ''}`} title={s.Note || undefined}>
          <i />{s.VetName}{day >= today && <button type="button" aria-label="Bỏ ca trực" onClick={() => onRemove(s.VetDutyShiftID)}
            style={{ border: 0, background: 'none', color: '#842f28', cursor: 'pointer', padding: '0 0 0 4px' }}>×</button>}</span>)}
      </div>
    })}
  </>
}

// ---------------- 15: Khám lâm sàng – hàng chờ ----------------
export function VetQueuePage({ currentUser }) {
  const navigate = useNavigate()
  const pending = useLoad(() => api.getPendingExams(), [])
  const signed = useLoad(() => api.getHorses({ RegistrationStatus: 'PendingExam' }).then((l) => l.filter((h) => h.InitialExamSigned)), [])
  const duty = useLoad(() => api.getDutyNow().catch(() => []), [])
  const [tab, setTab] = useState('waiting')
  const mine = (duty.data || []).find((s) => String(s.VetID) === String(currentUser.id))
  const waiting = (pending.data || []).filter((p) => !p.DraftMedicalRecordID)
  const inProgress = (pending.data || []).filter((p) => p.DraftMedicalRecordID)
  const shown = tab === 'waiting' ? waiting : inProgress
  return <main className="page-content f1">
    <Crumb items={[['Khám lâm sàng']]} />
    <Heading eyebrow="BÁC SĨ THÚ Y" title="Khám lâm sàng" />
    <section className="panel">
      {mine ? <Notice kind="ok" title={`Ca trực hiện tại: ${SHIFT_NAME[mine.Shift][0]} (${SHIFT_NAME[mine.Shift][1].replace('–', ' – ')})`}>
        Bạn đang trong ca trực {SHIFT_NAME[mine.Shift][0].replace('Ca ', '').toLowerCase()}. Các hồ sơ chờ khám mới sẽ được ưu tiên thông báo đến bạn để tiếp nhận và xử lý.</Notice>
        : <Notice kind="info" title="Bạn không trong ca trực">Bạn vẫn có thể nhận khám các hồ sơ đang chờ khi cần hỗ trợ.</Notice>}
      <div className="toolbar" style={{ marginTop: 18 }}><div className="tabs">
        {[['waiting', 'Chờ khám', waiting.length], ['progress', 'Đang khám', inProgress.length], ['signed', 'Đã ký duyệt', (signed.data || []).length]].map(([k, l, n]) =>
          <span key={k} role="tab" tabIndex={0} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l} <em>{n}</em></span>)}</div></div>
      {pending.loading ? <Loading /> : pending.error ? <Notice kind="bad">{errorText(pending.error)}</Notice>
        : tab === 'signed' ? <table><thead><tr><th>Ngựa</th><th>Chủ sở hữu</th><th>Ký duyệt lúc</th><th>Kết luận</th><th>Thao tác</th></tr></thead>
          <tbody>{(signed.data || []).map((h) => <tr key={h.HorseID} className="click" onClick={() => navigate(`/vet/horses/${h.HorseID}/clinical`)}>
            <td><div className="hname"><HorseThumb horseId={h.HorseID} /><div><b>{h.HorseName}</b><small>{horseMeta(h)}</small></div></div></td>
            <td>{h.Owner?.FullName}</td><td>{fmtDateTime(h.HealthSummary?.ExamDate)}</td><td>{HEALTH[h.HealthSummary?.HealthStatus] || '—'}</td>
            <td><span className="link">Xem</span></td></tr>)}</tbody></table>
          : !shown.length ? <p className="empty">Không có hồ sơ nào.</p>
            : <table><thead><tr><th>Ngựa</th><th>Chủ sở hữu</th><th>Xác minh lúc</th><th>Hình thức khám</th><th>Bác sĩ phụ trách</th><th>Thao tác</th></tr></thead>
              <tbody>{shown.map((p) => {
                const mineDraft = String(p.DraftVetID) === String(currentUser.id)
                return <tr key={p.RegistrationRequestID} className="click" onClick={() => (!p.DraftVetID || mineDraft) && navigate(`/vet/horses/${p.HorseID}/clinical`)}>
                  <td><div className="hname"><HorseThumb horseId={p.HorseID} /><div><b>{p.HorseName}</b><small>{[p.Breed, { Male: 'Ngựa đực', Female: 'Ngựa cái', Gelding: 'Ngựa đực thiến' }[p.Gender]].filter(Boolean).join(' · ')}</small></div></div></td>
                  <td>{p.OwnerName}</td><td>{fmtDateTime(p.VerifiedAt)}</td><td>{p.IsReExam ? 'Khám lại (hồ sơ gửi lại)' : 'Khám lần đầu'}</td>
                  <td>{p.DraftVetName || '—'}</td>
                  <td>{!p.DraftVetID ? <span className="btn pri sm">Nhận khám</span> : mineDraft ? <span className="btn pri sm">Tiếp tục khám</span> : <Badge kind="wait">Đang khám</Badge>}</td></tr>
              })}</tbody></table>}
    </section>
  </main>
}

// ---------------- 16–18: Đánh giá lâm sàng ----------------
const SYMPTOMS = ['Không phát hiện bất thường', 'Què / đi khập khiễng', 'Sưng khớp hoặc gân', 'Vết thương ngoài da', 'Ho / chảy dịch mũi',
  'Sốt', 'Gầy yếu / suy dinh dưỡng', 'Bỏ ăn', 'Khác']
const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')))

export function ClinicalExamPage({ currentUser }) {
  const { horseId } = useParams()
  const navigate = useNavigate()
  const data = useLoad(async () => {
    const [horse, records] = await Promise.all([api.getHorse(horseId), api.getMedicalRecords(horseId, 'Initial Exam')])
    const signed = horse.InitialExamSigned ? records.find((r) => r.RecordStatus === 'Signed') : null
    const draft = records.find((r) => r.RecordStatus === 'Draft')
    const amendments = signed ? await api.getAmendments(signed.MedicalRecordID).catch(() => []) : []
    const docs = await api.getDocuments(horseId).catch(() => [])
    return { horse, signed, draft, amendments, docs }
  }, [horseId])
  if (data.loading) return <main className="page-content f1"><Loading /></main>
  if (data.error) return <main className="page-content f1"><Notice kind="bad">{errorText(data.error)}</Notice></main>
  const { horse, signed, draft, amendments, docs } = data.data
  if (signed) return <SignedView horse={horse} record={signed} amendments={amendments} onChanged={data.reload} />
  if (draft && String(draft.VetID) !== String(currentUser.id)) {
    return <main className="page-content f1"><Notice kind="bad">{draft.VetName} đang khám hồ sơ này.</Notice></main>
  }
  return <ExamForm horse={horse} draft={draft} docs={docs} onSigned={data.reload} onBack={() => navigate('/vet/horses-needing-exam')} />
}

function ExamForm({ horse: h, draft, docs, onSigned }) {
  const photos = usePhotos(h.HorseID)
  const known = draft?.Symptoms && SYMPTOMS.includes(draft.Symptoms)
  const [f, setF] = useState(() => ({
    WeightKg: draft?.WeightKg ?? '', HeightCm: draft?.HeightCm ?? '', BodyTemperatureC: draft?.BodyTemperatureC ?? '',
    HeartRateBpm: draft?.HeartRateBpm ?? '', RespiratoryRate: draft?.RespiratoryRate ?? '',
    Symptom: draft?.Symptoms ? (known ? draft.Symptoms : 'Khác') : 'Không phát hiện bất thường',
    SymptomText: draft?.Symptoms && !known ? draft.Symptoms : '',
    HealthStatus: draft?.HealthStatus || '', TrainingEligibility: draft?.TrainingEligibility || '',
    RestrictionNote: draft?.RestrictionNote || '', Conclusion: draft?.Conclusion || '',
  }))
  const [recordId, setRecordId] = useState(draft?.MedicalRecordID || null)
  const [errors, setErrors] = useState({})
  const [confirm, setConfirm] = useState(false)
  const [saved, setSaved] = useState('')
  const { busy, error, run } = useAction()
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); setSaved('') }
  const symptoms = f.Symptom === 'Khác' ? f.SymptomText.trim() : f.Symptom
  const papers = docs.filter((d) => !d.IsProfileImage && !d.IsRetired)

  function check(full) {
    const e = {}
    if (full) {
      if (!num(f.WeightKg)) e.WeightKg = 'Nhập cân nặng.'
      if (!num(f.HeightCm)) e.HeightCm = 'Nhập chiều cao.'
      if (!symptoms) e.SymptomText = 'Mô tả triệu chứng.'
      if (!f.HealthStatus) e.HealthStatus = 'Chọn tình trạng sức khỏe.'
      if (!f.TrainingEligibility) e.TrainingEligibility = 'Chọn điều kiện tập luyện.'
      if (!f.Conclusion.trim()) e.Conclusion = 'Nhập kết luận.'
    }
    if (f.TrainingEligibility === 'Restricted' && !f.RestrictionNote.trim()) e.RestrictionNote = 'Ghi rõ giới hạn tập luyện.'
    setErrors(e)
    return !Object.keys(e).length
  }
  async function save() {
    const body = {
      ExamType: 'Initial Exam', WeightKg: num(f.WeightKg), HeightCm: num(f.HeightCm), BodyTemperatureC: num(f.BodyTemperatureC),
      HeartRateBpm: num(f.HeartRateBpm), RespiratoryRate: num(f.RespiratoryRate), Symptoms: symptoms || null,
      Conclusion: f.Conclusion.trim() || null, ...(f.HealthStatus ? { HealthStatus: f.HealthStatus } : {}),
      ...(f.TrainingEligibility ? { TrainingEligibility: f.TrainingEligibility } : {}),
      RestrictionNote: f.TrainingEligibility === 'Restricted' ? f.RestrictionNote.trim() : null,
    }
    const record = recordId ? await api.updateMedicalRecord(recordId, body) : await api.createMedicalRecord(h.HorseID, body)
    setRecordId(record.MedicalRecordID)
    return record
  }
  async function saveDraft() { if (check(false) && await run(save)) setSaved('Đã lưu nháp.') }
  async function sign() {
    const done = await run(async () => { const record = await save(); await api.signMedicalRecord(record.MedicalRecordID); return true })
    if (done) { setConfirm(false); onSigned() }
  }
  const age = h.DateOfBirth ? `${Math.floor((Date.now() - new Date(h.DateOfBirth)) / 31557600000)} tuổi` : ''
  return <main className="page-content f1">
    <Crumb items={[['Khám lâm sàng', '/vet/horses-needing-exam'], [h.HorseName]]} />
    <Heading title="Đánh giá lâm sàng" />
    <section className="panel" style={{ marginTop: 48 }}>
      <HorseCard name={h.HorseName} meta={[horseMeta(h), age, `Chủ sở hữu: ${h.Owner?.FullName}`].filter(Boolean).join(' · ')} image={photos[0]} badge={<Badge kind="wait">Đang khám</Badge>} />
      <div className="two" style={{ marginTop: 20 }}><div>
        <div className="card"><SectionTitle icon="steth">Chỉ số sinh hiệu</SectionTitle><div className="fgrid three">
          <TextInput label="Cân nặng" required unit="kg" inputMode="decimal" value={f.WeightKg} onChange={set('WeightKg')} error={errors.WeightKg} />
          <TextInput label="Chiều cao" required unit="cm" inputMode="decimal" value={f.HeightCm} onChange={set('HeightCm')} error={errors.HeightCm} />
          <TextInput label="Thân nhiệt" unit="°C" inputMode="decimal" value={f.BodyTemperatureC} onChange={set('BodyTemperatureC')} />
          <TextInput label="Nhịp tim" unit="lần/phút" inputMode="numeric" value={f.HeartRateBpm} onChange={set('HeartRateBpm')} />
          <TextInput label="Nhịp thở" unit="lần/phút" inputMode="numeric" value={f.RespiratoryRate} onChange={set('RespiratoryRate')} />
          <Field label="Ngày khám"><input className="input" readOnly value={fmtDate(todayIso())} /></Field></div></div>
        <div className="card" style={{ marginTop: 14 }}><SectionTitle icon="heart">Triệu chứng và kết luận</SectionTitle><div className="form" style={{ marginTop: 0, maxWidth: 'none' }}>
          <SelectInput label="Triệu chứng ghi nhận" required value={f.Symptom} onChange={set('Symptom')} options={SYMPTOMS.map((s) => [s, s])} />
          {f.Symptom === 'Khác' && <TextInput label="Mô tả triệu chứng" required value={f.SymptomText} onChange={set('SymptomText')} error={errors.SymptomText} maxLength={1500} />}
          <div className="row">
            <SelectInput label="Tình trạng sức khỏe" required value={f.HealthStatus} onChange={set('HealthStatus')} error={errors.HealthStatus} placeholder="Chọn tình trạng"
              options={[['Healthy', 'Khỏe mạnh'], ['Monitor', 'Cần theo dõi'], ['Injured', 'Không đạt']]} />
            <SelectInput label="Điều kiện tập luyện" required value={f.TrainingEligibility} onChange={set('TrainingEligibility')} error={errors.TrainingEligibility} placeholder="Chọn điều kiện"
              options={[['Eligible', 'Đủ điều kiện'], ['Restricted', 'Tập giới hạn'], ['Not Eligible', 'Không đủ điều kiện']]} /></div>
          {f.TrainingEligibility === 'Restricted' && <TextInput label="Giới hạn tập luyện" required value={f.RestrictionNote} onChange={set('RestrictionNote')} error={errors.RestrictionNote} maxLength={1000} />}
          <TextArea label="Kết luận" required value={f.Conclusion} onChange={set('Conclusion')} error={errors.Conclusion} rows={2} maxLength={1500} />
        </div></div></div>
        <div className="card"><SectionTitle icon="file">Thông tin khai báo từ chủ sở hữu</SectionTitle>
          <Dl items={[['Tình trạng sức khỏe hiện tại', h.DeclaredHealth, 1], ['Tiền sử bệnh', h.MedicalHistory, 1], ['Ghi chú khác', h.OwnerNote, 1]]} />
          {papers.length > 0 && <div className="section docs" style={{ marginTop: 16, paddingTop: 16 }}>{papers.map((d) => <DocRow key={d.DocumentID} name={d.DocumentName}
            meta="Giấy tờ chủ ngựa đính kèm" kind={/\.pdf$/i.test(d.DocumentName) ? 'PDF' : 'JPG'}
            action={<button type="button" className="link" onClick={async () => window.open(URL.createObjectURL(await api.getDocumentFile(d.DocumentID)), '_blank', 'noopener')}>Xem</button>} />)}</div>}
        </div></div>
      {error && !confirm && <Notice kind="bad" style={{ marginTop: 14 }}>{error}</Notice>}
      <div className="actions"><span className="left">{saved || 'Kết quả chỉ có hiệu lực sau khi ký duyệt.'}</span>
        <button type="button" className="btn sec" disabled={busy} onClick={saveDraft}>Lưu nháp</button>
        <button type="button" className="btn pri" disabled={busy} onClick={() => { if (check(true)) setConfirm(true) }}><Icon name="sign" size={16} /> Ký duyệt</button></div>
    </section>
    {confirm && <Dialog title="Xác nhận ký?" onClose={() => setConfirm(false)} actions={<>
      <button type="button" className="btn sec" onClick={() => setConfirm(false)}>Kiểm tra lại</button>
      <button type="button" className="btn pri" disabled={busy} onClick={sign}><Icon name="sign" size={16} /> {busy ? 'Đang ký...' : 'Ký duyệt'}</button></>}>
      <p>Kết quả xác minh chỉ được xác nhận chính thức sau khi hoàn tất ký duyệt điện tử và không thể chỉnh sửa sau khi ký. Mọi thay đổi phát sinh sau thời điểm này sẽ được ghi nhận bằng phụ lục đính chính.</p>
      <p>Sau khi ký duyệt, kết quả sẽ được chuyển đến Ban quản lý để tiếp tục hoàn tất thủ tục tiếp nhận.</p>
      {error && <Notice kind="bad">{error}</Notice>}
    </Dialog>}
  </main>
}

function SignedView({ horse: h, record: r, amendments, onChanged }) {
  const photos = usePhotos(h.HorseID)
  const [adding, setAdding] = useState(false)
  const [reason, setReason] = useState('')
  const [content, setContent] = useState('')
  const { busy, error, run } = useAction()
  async function addAmendment() {
    if (!reason.trim() || !content.trim()) return
    if (await run(() => api.addAmendment(r.MedicalRecordID, { Reason: reason.trim(), AmendedContent: content.trim() }))) {
      setAdding(false); setReason(''); setContent(''); onChanged()
    }
  }
  return <main className="page-content f1">
    <Crumb items={[['Khám lâm sàng', '/vet/horses-needing-exam'], [h.HorseName]]} />
    <Heading title="Đánh giá lâm sàng" />
    <section className="panel" style={{ marginTop: 48 }}>
      <HorseCard name={h.HorseName} meta={`${horseMeta(h)} · Chủ sở hữu: ${h.Owner?.FullName}`} image={photos[0]} badge={<Badge kind="ok">Đã ký duyệt</Badge>} />
      <div className="signed" style={{ marginTop: 16 }}><Icon name="sign" size={22} /><div><b>{r.VetName} đã ký duyệt lúc {fmtDateTime(r.SignedAt)}</b>
        <small>Phiếu khám đã được khóa bảo mật. Mọi thay đổi phát sinh sẽ được ghi nhận vào phụ lục đính chính.</small></div>
        <button type="button" className="btn sec sm" style={{ marginLeft: 'auto' }} onClick={() => setAdding(true)}>Thêm phụ lục đính chính</button></div>
      <div className="section"><h2>Chỉ số sinh hiệu</h2><Dl items={[['Cân nặng', r.WeightKg != null ? `${r.WeightKg} kg` : null], ['Chiều cao', r.HeightCm != null ? `${r.HeightCm} cm` : null],
        ['Thân nhiệt', r.BodyTemperatureC != null ? `${r.BodyTemperatureC} °C` : null], ['Nhịp tim', r.HeartRateBpm != null ? `${r.HeartRateBpm} lần/phút` : null],
        ['Nhịp thở', r.RespiratoryRate != null ? `${r.RespiratoryRate} lần/phút` : null], ['Ngày khám', fmtDate(r.ExamDate)]]} /></div>
      <div className="section"><h2>Triệu chứng và kết luận</h2><Dl items={[['Triệu chứng ghi nhận', r.Symptoms, 1],
        ['Tình trạng sức khỏe', HEALTH[r.HealthStatus] || r.HealthStatus], ['Điều kiện tập luyện', ELIGIBILITY[r.TrainingEligibility] || r.TrainingEligibility],
        r.RestrictionNote ? ['Giới hạn tập luyện', r.RestrictionNote] : null, ['Kết luận', r.Conclusion, 1]]} /></div>
      {amendments.length > 0 && <div className="section"><h2>Phụ lục đính chính</h2><div className="docs">{amendments.map((a) =>
        <div className="doc" key={a.MedicalRecordAmendmentID}><div><b>{a.Reason}</b><small>{a.AmendedContent}</small><br /><small>{a.AmendedByName} · {fmtDateTime(a.AmendedAt)}</small></div></div>)}</div></div>}
    </section>
    {adding && <Dialog title="Thêm phụ lục đính chính" onClose={() => setAdding(false)} actions={<>
      <button type="button" className="btn sec" onClick={() => setAdding(false)}>Hủy</button>
      <button type="button" className="btn pri" disabled={busy || !reason.trim() || !content.trim()} onClick={addAmendment}>Lưu phụ lục</button></>}>
      <TextInput label="Lý do đính chính" required value={reason} onChange={setReason} maxLength={1000} />
      <TextArea label="Nội dung đính chính" required value={content} onChange={setContent} rows={3} />
      {error && <Notice kind="bad">{error}</Notice>}
    </Dialog>}
  </main>
}

