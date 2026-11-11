import { useEffect, useRef, useState } from 'react'
import { addMedicalAmendment, getMedicalAmendments } from '../../api/vetApi.ts'
import { ApiError } from '../../api/apiClient.ts'
import { examLabels, recordHealthLabels, trainingLabels, vetDate, vetDateTime, vetError } from './vetDomain.js'
import VetPrescription from './VetPrescription.jsx'
import VetLoading from './VetLoading.jsx'
import useClinicalWarning from './useClinicalWarning.js'
import HorseInjuryRegionPicker from '../../components/injury/HorseInjuryRegionPicker.jsx'

function Details({ rows }) {
  return <dl className="vet-details">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Chưa ghi nhận'}</dd></div>)}</dl>
}
export default function VetRecordDetails({ record, canAmend = false }) {
  const [items, setItems] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [version, setVersion] = useState(0)
  const [uncertain, setUncertain] = useState(false)
  const pending = useRef(null)
  const gate = useRef(false)
  useClinicalWarning(!!reason || !!content)
  useEffect(() => {
    if (record.recordStatus !== 'Signed') return undefined
    let active = true
    getMedicalAmendments(record.id).then(rows => { if (active) { setItems(rows); setLoadError('') } })
      .catch(e => { if (active) setLoadError(vetError(e, 'Không thể tải lịch sử đính chính. Vui lòng thử lại.')) })
    return () => { active = false }
  }, [record.id, record.recordStatus, version])
  async function check() {
    setBusy(true)
    try {
      const rows = await getMedicalAmendments(record.id)
      setItems(rows); setLoadError('')
      const matches = rows.filter(r => !pending.current.ids.includes(r.id) && r.reason === pending.current.reason && r.content === pending.current.content)
      if (matches.length === 1) { setReason(''); setContent(''); setUncertain(false); setError(''); setNotice('Đã kiểm tra: đính chính đã được lưu, bệnh án gốc được giữ nguyên.') }
      else setError('Chưa xác định được kết quả. Hãy đối chiếu lịch sử vừa tải; giữ nội dung để kiểm tra trước khi gửi lại.')
    } catch { setError('Chưa tải được lịch sử. Hãy kiểm tra lại khi kết nối ổn định.') }
    finally { setBusy(false) }
  }
  async function submit(event) {
    event.preventDefault()
    if (gate.current || uncertain || !reason.trim() || !content.trim() || !items || loadError) return
    gate.current = true; setBusy(true); setError(''); setNotice('')
    pending.current = { ids: items.map(i => i.id), reason: reason.trim(), content: content.trim() }
    try {
      const result = await addMedicalAmendment(record.id, reason, content)
      setItems(rows => [...rows, result]); setReason(''); setContent(''); setNotice('Đã lưu đính chính; bệnh án gốc được giữ nguyên.')
    } catch (failure) {
      if (!(failure instanceof ApiError) || !failure.status || failure.status >= 500) setUncertain(true)
      setError(vetError(failure, 'Chưa xác nhận lưu đính chính. Hãy kiểm tra lại lịch sử trước khi gửi lại.'))
    } finally { gate.current = false; setBusy(false) }
  }
  return <article className="vet-record-details" aria-label={`Bệnh án số ${record.id}`}>
    <header className="vet-record-heading"><div><p className="eyebrow">BỆNH ÁN #{record.id}</p><h2>{examLabels[record.examType] || 'Lần khám'}</h2><p>{record.vetName} · {vetDateTime(record.examDate)}</p></div><span className="vet-pill">{record.recordStatus === 'Signed' ? 'Đã chốt' : 'Đang khám'}</span></header>
    <section className="vet-clinical-section"><h3>Thông tin lần khám</h3><Details rows={[
      ['Bác sĩ', record.vetName], ['Ngày giờ khám', vetDateTime(record.examDate)],
      ['Nguồn tiếp nhận', record.registrationRequestId ? `Hồ sơ tiếp nhận #${record.registrationRequestId}` : 'Khám sau tiếp nhận'],
      ['Buổi tập liên quan', record.trainingSessionId ? `#${record.trainingSessionId}` : 'Không ghi nhận'],
      ...(record.signedAt ? [['Ngày giờ chốt', vetDateTime(record.signedAt)]] : []),
    ]} /></section>
    <section className="vet-clinical-section"><h3>Triệu chứng và kiểm tra</h3><Details rows={[
      ['Cân nặng', record.weightKg == null ? '' : `${record.weightKg} kg`], ['Chiều cao', record.heightCm == null ? '' : `${record.heightCm} cm`],
      ['Thân nhiệt (°C)', record.bodyTemperatureC], ['Nhịp tim (lần/phút)', record.heartRateBpm], ['Nhịp thở (lần/phút)', record.respiratoryRate],
      ['Triệu chứng / lý do khám', record.symptoms], ['Kết quả kiểm tra / ghi chú', record.note],
    ]} /></section>
    <section className="vet-clinical-section"><h3>Chẩn đoán và chấn thương</h3><Details rows={[
      ['Chẩn đoán', record.diagnosis], ['Vị trí chấn thương', record.injuryLocation],
    ]} />{record.injuryLocation && <HorseInjuryRegionPicker key={record.id} value={record.injuryLocation} onChange={() => {}} readOnly />}</section>
    <section className="vet-clinical-section"><h3>Điều trị và đơn thuốc</h3><p className="vet-preserve">{record.treatmentPlan || 'Chưa ghi hướng điều trị.'}</p><VetPrescription recordId={record.id} />{record.recordStatus === 'Signed' && <p className="vet-caption">Đơn thuốc hiển thị thông tin điều trị hiện tại. Ngày kết thúc và thời gian ngưng thuốc được theo dõi tại mục Điều trị và đơn thuốc.</p>}</section>
    <section className="vet-clinical-section"><h3>Kết luận và tái khám</h3><Details rows={[
      ['Kết luận', record.conclusion], ['Trạng thái sức khỏe', recordHealthLabels[record.healthStatus]], ['Điều kiện tập', trainingLabels[record.trainingEligibility]],
      ['Hạn chế cụ thể', record.restrictionNote], ['Ngày chỉ định tái khám', vetDate(record.followUpDate)],
    ]} /><p className="vet-caption">Ngày chỉ định tái khám cần được đối chiếu với lịch y tế. Lệnh khóa tập được theo dõi riêng trong hồ sơ ngựa.</p></section>
    {record.recordStatus === 'Signed' && <section className="vet-amendments vet-clinical-section"><h3>Lịch sử đính chính</h3><p>Đính chính bổ sung vào lịch sử và giữ nguyên bệnh án gốc.</p>
      {loadError ? <div role="alert"><p>{loadError}</p><button type="button" className="button button-secondary" onClick={() => setVersion(v => v + 1)}>Thử lại</button></div> : items === null ? <VetLoading label="Đang tải lịch sử đính chính…" /> : <>
        {!items.length && <p>Chưa có đính chính.</p>}{items.map(item => <article className="vet-amendment" key={item.id}><strong>{item.author} · {vetDateTime(item.at)}</strong><p>Lý do: {item.reason}</p><p>{item.content}</p></article>)}
      </>}
      {error && <p className="error-message" role="alert">{error}</p>}{uncertain && <button type="button" disabled={busy} className="button button-secondary" onClick={() => void check()}>Kiểm tra kết quả đính chính</button>}
      {canAmend && <form onSubmit={submit}><fieldset className="vet-form-fields" disabled={busy || uncertain || !items || !!loadError}><legend>Thêm đính chính</legend><label className="form-field"><span>Lý do đính chính</span><input required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label><label className="form-field"><span>Nội dung đính chính</span><textarea required rows={4} value={content} onChange={e => setContent(e.target.value)} /></label><button className="button" disabled={!reason.trim() || !content.trim()}>{busy ? 'Đang lưu…' : 'Thêm đính chính'}</button></fieldset></form>}
      {notice && <p className="success-message" role="status">{notice}</p>}
    </section>}
  </article>
}
