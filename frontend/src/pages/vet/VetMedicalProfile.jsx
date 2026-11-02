import { examLabels, vetDateTime } from './vetDomain.js'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import RecordDetails from './VetRecordDetails.jsx'
import HorseAvatar from '../../components/horse/HorseAvatar.jsx'
import { formatHorseCode } from '../../components/horse/horseDisplay.js'
import { HealthBadge, TrainingBadge } from './VetWorkspace.jsx'
import { latestSigned } from './vetDomain.js'
import HorseInjuryMapping from '../../components/injury/HorseInjuryMapping.jsx'
import VetCareOrders from './VetCareOrders.jsx'

import { TrainingLocks, VetCalendar, VetTreatments } from './VetOperations.jsx'

const tabs = { overview: 'Tổng quan sức khỏe', history: 'Bệnh án', treatments: 'Điều trị và đơn thuốc', injuries: 'Chấn thương và phục hồi', training: 'Điều kiện huấn luyện', calendar: 'Lịch y tế' }

export default function VetMedicalProfile({ horse, records, currentUser, onRefresh, activeRequestId }) {
  const [params, setParams] = useSearchParams()
  const tab = Object.hasOwn(tabs, params.get('tab')) ? params.get('tab') : 'overview'
  const selected = params.get('record') || ''
  function setSelected(id) { const next = new URLSearchParams(params); next.set('tab', 'history'); if (id) next.set('record', id); else next.delete('record'); setParams(next) }
  function filter(key, value) { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next) }
  const filtered = records.filter(r => (!params.get('type') || r.examType === params.get('type')) && (!params.get('status') || r.recordStatus === params.get('status')) &&
    (!params.get('from') || r.examDate.slice(0, 10) >= params.get('from')) && (!params.get('to') || r.examDate.slice(0, 10) <= params.get('to')) &&
    (!params.get('q') || [r.id, r.diagnosis, r.symptoms, r.vetName].some(v => v?.toLocaleLowerCase().includes(params.get('q').toLocaleLowerCase().trim()))))

  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const [lockRevision, setLockRevision] = useState(0)
  const latest = latestSigned(records, horse.id)
  const currentExam = records.find(r => r.registrationRequestId === activeRequestId && r.examType === 'Initial Exam')
  const selectedRecord = records.find(r => r.id === selected)
  const canManage = currentUser.permissions.includes('MEDICAL_MANAGE')
  async function refresh() {
    if (refreshing) return
    setRefreshing(true); setRefreshError('')
    setLockRevision(value => value + 1)
    try { await onRefresh(horse.id) } catch { setRefreshError('Không thể tải lại hồ sơ. Vui lòng thử lại.') }
    finally { setRefreshing(false) }
  }
  return <main className="page-content vet-workspace">
    <Link className="breadcrumb-back-button" to="/vet/herd">← Sức khỏe toàn đàn</Link>
    <header className="page-heading vet-profile-heading"><div className="vet-profile-identity"><HorseAvatar horseId={horse.id} documents={horse.documents} name={horse.name} size="small" /><div><p className="eyebrow">HỒ SƠ Y TẾ</p><h1>{horse.name}</h1><p>{formatHorseCode(horse.code)} · Microchip: {horse.microchipNumber || 'Chưa cập nhật'}</p><small>Ô chuồng: {horse.currentStall?.StallNumber || 'Chưa xếp chuồng'}</small></div></div>{horse.profileStatus === 'APPROVED' && currentUser.permissions.includes('TRAINING_LOCK_MANAGE') && <div className="profile-actions"><a className="button button-secondary vet-danger-outline" href="#vet-emergency-lock">Khóa tập khẩn cấp</a></div>}</header>
    {tab !== 'injuries' && <div id="vet-emergency-lock"><TrainingLocks key={horse.id} horse={horse} currentUser={currentUser} compact={tab !== 'training'} onChanged={() => { void refresh() }} /></div>}
    {refreshError && <p className="error-message" role="alert">{refreshError}</p>}
    <div className="vet-profile-badges"><HealthBadge status={horse.healthStatus} /><TrainingBadge record={latest} /></div>
    {horse.profileStatus === 'APPROVED' && canManage && <Link className="button vet-new-exam" to={`/vet/horses/${horse.id}/examination?new=1`}>Lập phiếu khám mới</Link>}
    <nav className="vet-tabs" aria-label="Các phần hồ sơ y tế">{Object.entries(tabs).map(([key, label]) => <Link key={key} to={`?tab=${key}`} aria-current={tab === key ? 'page' : undefined} >{label}</Link>)}</nav>
    {tab === 'overview' && <div className="vet-two-columns"><section className="panel"><h2>Sức khỏe hiện tại</h2><HealthBadge status={horse.healthStatus} /><p>Cập nhật: {vetDateTime(horse.updatedAt)}</p><h3>Kết luận đã chốt gần nhất</h3>{latest ? <><p>{latest.conclusion || 'Chưa ghi kết luận'}</p><p>{latest.vetName} · {vetDateTime(latest.examDate)}</p><button className="button button-secondary" onClick={() => { setParams({ tab: 'history' }); setSelected(latest.id) }}>Xem kết quả</button></> : <p>Chưa có bệnh án đã chốt.</p>}</section><section className="panel"><h2>Khám đầu vào</h2><p>Trạng thái hồ sơ đăng ký: {({ PENDING_EXAM: 'Chờ khám / xử lý tiếp nhận', APPROVED: 'Đã tiếp nhận', REJECTED: 'Bị từ chối', ARCHIVED: 'Đã lưu trữ', SUBMITTED: 'Chờ xác minh', DRAFT: 'Nháp đăng ký' })[horse.profileStatus] || 'Chưa xác định'}</p><p>Phiếu khám: {currentExam ? currentExam.recordStatus === 'Signed' ? 'Đã chốt' : 'Nháp' : 'Chưa có phiếu cho lần đăng ký hiện tại'}</p>
      {currentExam?.recordStatus === 'Signed' ? <button className="button" onClick={() => { setParams({ tab: 'history' }); setSelected(currentExam.id) }}>Xem kết quả</button> : horse.profileStatus === 'PENDING_EXAM' && canManage ? currentExam && currentExam.vetId !== currentUser.id ? <p>Phiếu nháp đang do {currentExam.vetName} xử lý.</p> : <Link className="button" to={`/vet/horses/${horse.id}/examination`}>{currentExam ? 'Tiếp tục phiếu nháp' : 'Bắt đầu khám'}</Link> : null}<p>Bác sĩ thú y đưa kết luận; quản lý quyết định tiếp nhận.</p></section></div>}
    {tab === 'history' && <section className="panel"><h2>Bệnh án · {records.length} phiếu</h2><div className="vet-toolbar vet-history-filters">
      <label className="form-field"><span>Tìm bệnh án</span><input type="search" value={params.get('q') || ''} placeholder="Số phiếu, triệu chứng, chẩn đoán, bác sĩ" onChange={e => filter('q', e.target.value)} /></label>
      <label className="form-field"><span>Loại khám</span><select value={params.get('type') || ''} onChange={e => filter('type', e.target.value)}><option value="">Tất cả loại khám</option>{Object.entries(examLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="form-field"><span>Trạng thái</span><select value={params.get('status') || ''} onChange={e => filter('status', e.target.value)}><option value="">Tất cả</option><option value="Draft">Đang khám</option><option value="Signed">Đã chốt</option></select></label>
      <label className="form-field"><span>Từ ngày</span><input type="date" value={params.get('from') || ''} max={params.get('to') || undefined} onChange={e => filter('from', e.target.value)} /></label>
      <label className="form-field"><span>Đến ngày</span><input type="date" value={params.get('to') || ''} min={params.get('from') || undefined} onChange={e => filter('to', e.target.value)} /></label>
    </div>{records.length > 0 && !filtered.length && <p className="vet-empty">Không có bệnh án phù hợp bộ lọc.</p>}{selected && !selectedRecord && <p className="error-message" role="alert">Không tìm thấy bệnh án đã chọn trong hồ sơ ngựa này.</p>}{!records.length && <p>Chưa có phiếu khám.</p>}<div className="vet-record-list">{filtered.map(record => <button key={record.id} className={`vet-record-button${selected === record.id ? ' selected' : ''}`} onClick={() => setSelected(record.id)}><strong>Phiếu #{record.id} · {examLabels[record.examType] || 'Lần khám'}</strong><span>{vetDateTime(record.examDate)} · {record.vetName}</span><span className="vet-pill">{record.recordStatus === 'Signed' ? 'Đã chốt' : 'Nháp'}</span></button>)}</div>{selectedRecord?.recordStatus === 'Draft' && selectedRecord.vetId === currentUser.id && <Link className="button" to={`/vet/horses/${horse.id}/examination?record=${selectedRecord.id}`}>Tiếp tục phiếu nháp</Link>}{selectedRecord && <RecordDetails key={selectedRecord.id} record={selectedRecord} canAmend={canManage} />}</section>}
    {tab === 'treatments' && <><section className="panel"><h2>Hướng điều trị ghi trong bệnh án</h2>{records.filter(r => r.treatmentPlan).map(r => <article className="vet-amendment" key={r.id}><strong>Phiếu #{r.id} · {r.recordStatus === 'Signed' ? 'Đã chốt' : 'Nháp'} · {vetDateTime(r.examDate)}</strong><p>{r.treatmentPlan}</p></article>)}{!records.some(r => r.treatmentPlan) && <p>Chưa ghi hướng điều trị.</p>}</section><VetCareOrders horse={horse} records={records} currentUser={currentUser} /><VetTreatments key={horse.id} horse={horse} records={records} currentUser={currentUser} /></>}
    {tab === 'injuries' && <><HorseInjuryMapping key={horse.id} horse={horse} records={records} currentUser={currentUser} lockRevision={lockRevision} onSaved={() => onRefresh(horse.id)} /><div id="vet-emergency-lock"><TrainingLocks key={horse.id} horse={horse} currentUser={currentUser} compact onChanged={() => { void refresh() }} /></div></>}
    {tab === 'training' && <><section className="panel"><h2>Điều kiện tập theo kết luận gần nhất</h2><TrainingBadge record={latest} /><p>{latest?.restrictionNote || 'Chưa ghi hạn chế cụ thể.'}</p>{latest && <p>{latest.vetName} · {vetDateTime(latest.signedAt)} · Phiếu #{latest.id}</p>}<p>Sức khỏe và điều kiện tập được kết luận riêng. Không tự mở hạn chế theo ngày dự kiến.</p></section><a href="#vet-emergency-lock">Xem và điều chỉnh khóa tập ở đầu hồ sơ ↑</a></>}
    {tab === 'calendar' && <><section className="panel"><h2>Ngày tái khám theo kết luận gần nhất</h2><p>{latest?.followUpDate || 'Chưa có chỉ định ngày tái khám.'}</p><p>Đây là ngày chỉ định trên bệnh án, chưa phải lịch đã đặt; chưa xác nhận đã hoàn thành tái khám.</p><Link to="/vet/calendar">Xem các mốc tái khám của đàn →</Link></section><VetCalendar key={horse.id} horses={[horse]} horseId={horse.id} currentUser={currentUser} /></>}
  </main>
}
