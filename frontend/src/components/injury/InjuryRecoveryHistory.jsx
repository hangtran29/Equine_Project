import { useEffect, useState } from 'react'
import { clubToday, vetDate, vetDateTime } from '../../pages/vet/vetDomain.js'
import { injuryStatuses, markerStatus, validateAssessment } from './injuryDiagramDomain.js'

export default function InjuryRecoveryHistory({ marker, records, canManage, busy, dirty, onSave, onDirty }) {
  const [entry, setEntry] = useState({ date: clubToday(), status: markerStatus(marker), comment: '', medicalRecordId: '' })
  const [errors, setErrors] = useState({})
  const [changed, setChanged] = useState(false)
  useEffect(() => { onDirty(changed); return () => onDirty(false) }, [changed, onDirty])
  const change = (key, value) => { setEntry(current => ({ ...current, [key]: value })); setErrors({}); setChanged(true) }
  async function submit(event) {
    event.preventDefault()
    if (!canManage || busy || dirty) return
    const invalid = validateAssessment(entry, marker, clubToday(), records)
    setErrors(invalid)
    if (Object.keys(invalid).length) return
    if (await onSave(marker.id, entry)) { setEntry({ date: clubToday(), status: entry.status, comment: '', medicalRecordId: '' }); setErrors({}); setChanged(false) }
  }
  const error = key => errors[key] && <small id={`recovery-error-${key}`} className="injury-field-error" role="alert">{errors[key]}</small>
  const invalid = key => ({ 'aria-invalid': !!errors[key], 'aria-describedby': errors[key] ? `recovery-error-${key}` : undefined })
  return <section className="injury-recovery" aria-label="Lịch sử phục hồi">
    <h4>Lịch sử phục hồi <span className="injury-count">{marker.history.length}</span></h4>
    <p className="injury-current-status">Hiện tại: <strong>{injuryStatuses[markerStatus(marker)]}</strong></p>
    {!marker.history.length ? <p className="injury-recovery-empty">Chưa có lần theo dõi bổ sung.</p> : <ol>{marker.history.map(entry => <li key={entry.id}><strong>{injuryStatuses[entry.status]}</strong><span>Ngày theo dõi: {vetDate(entry.date)}</span><p>{entry.comment}</p><small>{entry.author} · Ghi lúc {vetDateTime(entry.at)}</small><span>{records.find(record => record.id === entry.medicalRecordId)?.label || 'Phiếu không còn khả dụng'}</span></li>)}</ol>}
    {canManage && <form className="injury-recovery-form" onSubmit={submit} noValidate>
      <h4>Thêm lần theo dõi</h4><p>Mỗi lần theo dõi tạo một bản ghi mới, giữ nguyên lịch sử.</p>
      {dirty && <p className="injury-read-only">Lưu hoặc hủy thay đổi chấn thương trước khi thêm theo dõi.</p>}
      <fieldset disabled={busy || dirty}>
        <label className="form-field"><span>Phiếu tái khám *</span><select name="recoveryRecord" value={entry.medicalRecordId} onChange={event => change('medicalRecordId', event.target.value)} {...invalid('medicalRecordId')}><option value="">Chọn phiếu đang khám…</option>{records.filter(record => record.recordStatus === 'Draft' && (!record.examType || record.examType === 'Follow-up') && record.id !== marker.medicalRecordId).map(record => <option key={record.id} value={record.id}>{record.label}</option>)}</select>{error('medicalRecordId')}</label>
        <label className="form-field"><span>Ngày theo dõi *</span><input name="recoveryDate" type="date" min={marker.detectedAt} max={clubToday()} value={entry.date} onChange={event => change('date', event.target.value)} {...invalid('date')} />{error('date')}</label>
        <label className="form-field"><span>Tình trạng *</span><select name="recoveryStatus" value={entry.status} onChange={event => change('status', event.target.value)} {...invalid('status')}>{Object.entries(injuryStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{error('status')}</label>
        <label className="form-field"><span>Nhận xét phục hồi *</span><textarea name="recoveryComment" maxLength={1500} rows={3} value={entry.comment} onChange={event => change('comment', event.target.value)} {...invalid('comment')} />{error('comment')}</label>
        <button className="button injury-primary" type="submit" disabled={busy || dirty}>{busy ? 'Đang lưu…' : 'Lưu lần theo dõi'}</button>
      </fieldset>
    </form>}
  </section>
}
