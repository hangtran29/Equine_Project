import { useRef, useState } from 'react'
import { ApiError } from '../../api/apiClient.ts'
import { getCompleteVetList, saveVetResource } from '../../api/vetApi.ts'
import { useVetResource } from './useVetResource.js'
import { ResourceState } from './VetOperations.jsx'
import { medicineRoutes, vetDate, vetError } from './vetDomain.js'

export function PrescriptionSummary({ rows }) {
  if (!rows.length) return <p className="vet-empty">Chưa ghi thuốc cho lần khám này.</p>
  return <div className="vet-prescriptions">{rows.map(t => <article className="vet-prescription" key={t.TreatmentID}>
    <strong>{t.MedicineName}</strong><dl className="vet-details">
      <div><dt>Liều kèm đơn vị</dt><dd>{t.Dose}</dd></div><div><dt>Đường dùng</dt><dd>{medicineRoutes[t.Route] || 'Chưa ghi nhận'}</dd></div>
      <div><dt>Thời gian dùng</dt><dd>{vetDate(t.StartDate)} – {t.EndDate ? vetDate(t.EndDate) : 'Chưa ghi ngày kết thúc'}</dd></div>
      <div><dt>Ngưng thuốc đến</dt><dd>{t.WithdrawalUntil ? vetDate(t.WithdrawalUntil) : 'Chưa ghi thời gian ngưng thuốc; chưa xác định điều kiện thi đấu.'}{t.WithdrawalActive ? ' · Đang trong thời gian ngưng thuốc' : ''}</dd></div>
      <div className="vet-wide"><dt>Tần suất và hướng dẫn</dt><dd>{t.Note || 'Chưa ghi nhận'}</dd></div>
    </dl>
  </article>)}</div>
}

const empty = { MedicineName: '', Dose: '', Route: '', StartDate: '', EndDate: '', WithdrawalUntil: '', Note: '' }
export default function VetPrescription({ recordId, canEdit = false, onDirtyChange, disabled = false }) {
  const path = recordId ? `/medical-records/${encodeURIComponent(recordId)}/treatments` : null
  const data = useVetResource(path)
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState({})
  const [uncertain, setUncertain] = useState(false)
  const [notice, setNotice] = useState('')
  const pending = useRef(null)
  const gate = useRef(false)
  const formRef = useRef(null)
  function change(key, value) { setForm(s => ({ ...s, [key]: value })); setNotice(''); onDirtyChange?.(true) }
  function reset() { setOpen(false); setEditing(null); setForm(empty); onDirtyChange?.(false); setUncertain(false); pending.current = null }
  async function reconcile() {
    if (!pending.current) return
    setBusy(true)
    try {
      const rows = await getCompleteVetList(path)
      const { body, previousIds, id } = pending.current
      const candidates = rows.filter(row => (id ? String(row.TreatmentID) === String(id) : !previousIds.includes(String(row.TreatmentID))) &&
        Object.entries(body).every(([key, value]) => (row[key] ?? '') === (value ?? '')))
      if (candidates.length === 1) { reset(); setError(''); setNotice('Đã kiểm tra: thuốc đã được lưu.'); data.reload() }
      else setError('Chưa xác định được kết quả lưu thuốc. Hãy đối chiếu đơn thuốc đã lưu trước khi tiếp tục; không gửi lại tự động.')
    } catch { setError('Chưa kết nối được để kiểm tra đơn thuốc. Hãy thử kiểm tra lại khi có mạng.') }
    finally { setBusy(false) }
  }
  async function save(event) {
    event.preventDefault()
    if (gate.current || disabled || uncertain) return
    const invalid = {}
    if (form.EndDate && form.EndDate < form.StartDate) invalid.EndDate = 'Ngày kết thúc phải từ ngày bắt đầu trở đi.'
    if (form.WithdrawalUntil && form.WithdrawalUntil < form.StartDate) invalid.WithdrawalUntil = 'Ngày ngưng thuốc không được trước ngày bắt đầu.'
    setFields(invalid)
    if (Object.keys(invalid).length) { formRef.current?.querySelector(`[name="${Object.keys(invalid)[0]}"]`)?.focus(); return }
    gate.current = true; setBusy(true); setError(''); setNotice('')
    const body = { ...form, MedicineName: form.MedicineName.trim(), Dose: form.Dose.trim(), Note: form.Note.trim(), EndDate: form.EndDate || null, WithdrawalUntil: form.WithdrawalUntil || null }
    pending.current = { body, id: editing, previousIds: data.rows.map(r => String(r.TreatmentID)) }
    try {
      await saveVetResource(editing ? `/treatments/${editing}` : path, body, !!editing)
      reset(); setNotice('Đã lưu thuốc vào bệnh án.'); data.reload()
    } catch (failure) {
      if (!(failure instanceof ApiError) || !failure.status || failure.status >= 500) {
        setUncertain(true); setError('Chưa xác nhận được kết quả lưu thuốc. Kiểm tra đơn thuốc trước khi tiếp tục để tránh kê trùng.')
      } else {
        const keys = Object.keys(failure.fieldErrors || {}).filter(key => Object.hasOwn(empty, key))
        setFields(Object.fromEntries(keys.map(key => [key, 'Vui lòng kiểm tra giá trị và giới hạn của mục này.'])))
        setError(vetError(failure, failure.status === 409 ? 'Trạng thái bệnh án đã thay đổi. Hãy tải lại hồ sơ trước khi sửa thuốc.' : 'Chưa lưu được thuốc. Kiểm tra các mục bên dưới.'))
        formRef.current?.querySelector(`[name="${keys[0]}"]`)?.focus()
      }
    } finally { gate.current = false; setBusy(false) }
  }
  function field(key, label, type = 'text', maxLength) {
    const props = { id: `drug-${key}`, name: key, value: form[key], onChange: e => change(key, e.target.value), 'aria-invalid': !!fields[key], 'aria-describedby': fields[key] ? `drug-error-${key}` : undefined }
    return <label className="form-field" key={key}><span>{label}</span>{key === 'Route' ? <select {...props} required><option value="">Chọn đường dùng</option>{Object.entries(medicineRoutes).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select> : key === 'Note' ? <textarea {...props} rows={3} maxLength={1000} /> : <input {...props} type={type} maxLength={maxLength} required={['MedicineName', 'Dose', 'StartDate'].includes(key)} />}{fields[key] && <small className="error-message" id={`drug-error-${key}`}>{fields[key]}</small>}</label>
  }
  return <section className="vet-prescription-section" aria-label="Đơn thuốc của lần khám">
    {!recordId ? <p>Lưu nháp lần khám trước khi thêm thuốc. Nội dung khám và đơn thuốc được lưu riêng.</p> : <>
      <ResourceState data={data}><PrescriptionSummary rows={data.rows} />
        {canEdit && !open && data.rows.map(row => <button key={row.TreatmentID} type="button" className="button button-secondary" disabled={disabled} onClick={() => { setForm(Object.fromEntries(Object.keys(empty).map(k => [k, row[k] || '']))); setEditing(row.TreatmentID); setOpen(true); setError(''); setFields({}) }}>Sửa thuốc: {row.MedicineName}</button>)}
      </ResourceState>
      {error && <p role="alert" className="error-message">{error}</p>}{notice && <p role="status" className="success-message">{notice}</p>}
      {uncertain && <button className="button button-secondary" type="button" disabled={busy || disabled} onClick={() => void reconcile()}>Kiểm tra kết quả lưu thuốc</button>}
      {canEdit && !open && <button className="button button-secondary" type="button" disabled={data.loading || !!data.error || disabled} onClick={() => { setOpen(true); setForm(empty); setError(''); setFields({}); setNotice(''); onDirtyChange?.(true) }}>Thêm thuốc</button>}
      {canEdit && open && <form ref={formRef} onSubmit={save} className="vet-operation-form"><h3>{editing ? 'Cập nhật thuốc' : 'Thêm thuốc vào phiếu'}</h3><fieldset disabled={busy || disabled || uncertain} className="vet-form-fields">
        <div className="horse-form-grid">{field('MedicineName', 'Tên thuốc', 'text', 150)}{field('Dose', 'Liều kèm đơn vị', 'text', 100)}{field('Route', 'Đường dùng')}{field('StartDate', 'Ngày bắt đầu', 'date')}{field('EndDate', 'Ngày kết thúc', 'date')}{field('WithdrawalUntil', 'Ngưng thuốc đến (theo chỉ định)', 'date')}</div>
        {field('Note', 'Tần suất và hướng dẫn dùng thuốc')}
        <p className="vet-caption">Nhập đầy đủ đơn vị trong liều dùng và tần suất trong hướng dẫn. Không tự tính thời gian ngưng thuốc.</p>
        <div className="form-actions"><button type="submit" className="button">{busy ? 'Đang lưu thuốc…' : 'Lưu thuốc'}</button><button type="button" className="button button-secondary" onClick={reset}>Bỏ thay đổi thuốc</button></div>
      </fieldset></form>}
    </>}
  </section>
}
