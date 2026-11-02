import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMedicalRecords, updateInjuryLocation } from '../../api/horseApi.ts'
import { examLabels, latestSigned, vetDateTime, vetError } from '../../pages/vet/vetDomain.js'
import { useVetResource } from '../../pages/vet/useVetResource.js'
import useClinicalWarning from '../../pages/vet/useClinicalWarning.js'
import HorseInjuryRegionPicker from './HorseInjuryRegionPicker.jsx'
import TrainingRestrictionAlert from './TrainingRestrictionAlert.jsx'
import PersistentInjuryMarkers from './PersistentInjuryMarkers.jsx'
import './HorseInjuryMapping.css'

export default function HorseInjuryMapping(props) {
  return <InjuryMappingWorkspace key={JSON.stringify([props.currentUser.id, props.currentUser.clubId, props.horse.id])} {...props} />
}

function InjuryMappingWorkspace({ horse, records, currentUser, lockRevision = 0, onSaved }) {
  const locks = useVetResource(`/training-locks?HorseID=${encodeURIComponent(horse.id)}`)
  const reloadLocks = locks.reload
  useEffect(() => { if (lockRevision) reloadLocks() }, [lockRevision, reloadLocks])
  const [selectedId, setSelectedId] = useState(records.find(record => record.recordStatus === 'Draft' && record.vetId === currentUser.id)?.id || records[0]?.id || '')
  const [dirty, setDirty] = useState(false)
  const selected = records.find(record => record.id === selectedId)
  return <div className="horse-injury-mapping">
    <header className="injury-page-heading"><div><p className="injury-eyebrow">THEO DÕI CHẤN THƯƠNG & PHỤC HỒI</p><h2>Sơ đồ chấn thương</h2><p>{horse.name} · Chọn vị trí trong từng bệnh án.</p></div></header>
    <TrainingRestrictionAlert data={locks} latest={latestSigned(records, horse.id)} horse={horse} />
    <div className="injury-mode-note" role="note"><strong>Vùng chọn và vị trí chi tiết</strong><span>Vùng chọn được lưu cùng bệnh án. Các dấu chấn thương bên dưới lưu vị trí và lịch sử phục hồi theo từng lần khám.</span></div>
    <section className="injury-card">
      <header className="injury-card-heading"><div><h3>Chọn bệnh án</h3><p>Chỉ bác sĩ lập phiếu được sửa phiếu nháp. Bệnh án đã chốt chỉ xem.</p></div></header>
      <div className="injury-record-selector" role="group" aria-label="Bệnh án để xem vị trí">{records.map(record => <button type="button" key={record.id} data-injury-record={record.id} aria-pressed={selectedId === record.id}
        onClick={() => { if (record.id !== selectedId && (!dirty || window.confirm('Vị trí chưa lưu. Bỏ thay đổi để mở bệnh án khác?'))) setSelectedId(record.id) }} className="button button-secondary">#{record.id} · {examLabels[record.examType]} · {record.recordStatus === 'Signed' ? 'Đã chốt' : 'Nháp'}</button>)}</div>
      {selected ? <RecordInjuryEditor key={selected.id} horse={horse} record={selected} currentUser={currentUser} onSaved={onSaved} onDirty={setDirty} /> : <p className="injury-record-empty">Chưa có bệnh án. Lập phiếu khám để chọn và lưu vị trí chấn thương.</p>}
      {currentUser.permissions.includes('MEDICAL_MANAGE') && horse.profileStatus === 'APPROVED' && <p className="injury-record-empty"><Link to={`/vet/horses/${horse.id}/examination?new=1`}>Lập phiếu khám mới</Link></p>}
    </section>
    <section className="injury-card injury-records"><header className="injury-card-heading"><h3>Vị trí đã ghi trong bệnh án</h3></header><ul>{records.filter(record => record.injuryLocation).map(record => <li key={record.id}><div><h4>{record.injuryLocation}</h4><p>{record.diagnosis}</p><small>{record.vetName} · {vetDateTime(record.examDate)}</small></div><Link to={`?tab=history&record=${encodeURIComponent(record.id)}`}>Xem bệnh án #{record.id}</Link></li>)}</ul></section>
    <PersistentInjuryMarkers horse={horse} records={records} currentUser={currentUser} />
  </div>
}

function RecordInjuryEditor({ horse, record, currentUser, onSaved, onDirty }) {
  const [value, setValue] = useState(record.injuryLocation || '')
  const [baseline, setBaseline] = useState(record.injuryLocation || '')
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const gate = useRef(false)
  const editable = !blocked && record.recordStatus === 'Draft' && record.vetId === currentUser.id && currentUser.permissions.includes('MEDICAL_MANAGE')
  useClinicalWarning(value !== baseline)
  useEffect(() => { onDirty(value !== baseline) }, [value, baseline, onDirty])
  async function save(event) {
    event.preventDefault()
    if (!editable || gate.current || value === baseline || value.length > 500) return
    gate.current = true; setBusy(true); setFeedback(null)
    try {
      // Recheck ownership and Signed state; PATCH only InjuryLocation rather
      // than replaying a stale whole record. Reconcile a previously lost reply.
      const rows = await getMedicalRecords(horse.id)
      const latest = rows.find(row => row.id === record.id)
      if (!latest || latest.recordStatus !== 'Draft' || latest.vetId !== currentUser.id) {
        setBlocked(true); setFeedback({ error: true, message: 'Bệnh án đã chốt hoặc quyền sửa đã thay đổi. Nội dung đang nhập được giữ để đối chiếu; hãy tải lại hồ sơ.' }); return
      }
      if ((latest.injuryLocation || '') !== baseline && latest.injuryLocation !== value) {
        setBlocked(true); setFeedback({ error: true, message: 'Vị trí đã được cập nhật ở phiên khác. Nội dung đang nhập được giữ để đối chiếu; hãy tải lại hồ sơ.' }); return
      }
      const saved = latest.injuryLocation === value ? latest : await updateInjuryLocation(record.id, value)
      setBaseline(saved.injuryLocation || '')
      setFeedback({ message: 'Đã lưu vị trí chấn thương vào bệnh án trên máy chủ.' })
      try { await onSaved?.(saved) } catch { setFeedback({ message: 'Vị trí đã lưu trên máy chủ. Chưa tải lại được danh sách hồ sơ; hãy tải lại khi kết nối ổn định.' }) }
    } catch (failure) {
      if ([403, 409].includes(failure.status)) setBlocked(true)
      setFeedback({ error: true, message: vetError(failure, 'Chưa xác nhận được kết quả lưu. Nội dung được giữ nguyên; thử lại sẽ đối chiếu máy chủ trước khi gửi.') })
    } finally { gate.current = false; setBusy(false) }
  }
  return <form className="injury-record-editor" onSubmit={save}>
    <div className="injury-card-heading"><div><h3>Bệnh án #{record.id}</h3><p>{record.vetName} · {vetDateTime(record.examDate)}</p></div></div>
    {!editable && <p className="injury-read-only">Chỉ xem · {record.recordStatus === 'Signed' ? 'Bệnh án đã chốt.' : 'Chỉ bác sĩ lập phiếu có quyền sửa phiếu nháp, hoặc cần tải lại trạng thái hồ sơ.'}</p>}
    <HorseInjuryRegionPicker value={value} onChange={next => { if (editable && !gate.current) { setValue(next); setFeedback(null) } }} readOnly={!editable} disabled={busy} inputId="record-injury-location" />
    {feedback && <p className={`injury-feedback${feedback.error ? ' is-error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
    {editable && <button className="button injury-save-location" type="submit" disabled={busy || value === baseline}>{busy ? 'Đang lưu…' : 'Lưu vị trí chấn thương'}</button>}
  </form>
}
