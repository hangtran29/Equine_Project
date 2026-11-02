import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiDelete, apiPatch, apiPost } from '../../api/apiClient.ts'
import { getCompleteVetList } from '../../api/vetApi.ts'
import { useLoad, useSubmit } from '../../pages/care/careUtils.js'
import { Loading, Notice } from '../../pages/care/careShared.jsx'
import { clubToday } from '../../pages/vet/vetDomain.js'
import useClinicalWarning from '../../pages/vet/useClinicalWarning.js'
import HorseInjuryDiagram from './HorseInjuryDiagram.jsx'
import InjuryDetailPanel from './InjuryDetailPanel.jsx'
import { DIAGRAM_VERSION } from './horseDiagram.js'
import { markerIsEditable, validateDiagramMarker } from './injuryDiagramDomain.js'

export default function PersistentInjuryMarkers({ horse, records, currentUser }) {
  const data = useLoad(() => getCompleteVetList(`/horses/${horse.id}/injury-markers`), [horse.id])
  const action = useSubmit()
  const [view, setView] = useState('left')
  const [mode, setMode] = useState('view')
  const [draft, setDraft] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [recoveryDirty, setRecoveryDirty] = useState(false)
  const [errors, setErrors] = useState({})
  const [ready, setReady] = useState(false)
  useClinicalWarning(dirty || recoveryDirty)
  const canManage = currentUser.permissions.includes('MEDICAL_MANAGE')
  const available = records.filter(r => r.recordStatus === 'Signed' || r.vetId === currentUser.id).map(r => ({ ...r, label: `#${r.id} · ${r.examType} · ${r.recordStatus === 'Signed' ? 'Đã ký' : 'Nháp'}` }))
  const editableDrafts = available.filter(r => r.recordStatus === 'Draft')
  const canEdit = canManage && draft && markerIsEditable(draft, available, currentUser.permissions)
  function leave() { return !(dirty || recoveryDirty) || window.confirm('Có nội dung chưa lưu. Bỏ thay đổi để tiếp tục?') }
  function select(marker) {
    if (!leave()) return
    setDraft(marker); setView(marker.view); setMode('view'); setDirty(false); setRecoveryDirty(false); setErrors({}); action.clear()
  }
  function pick(bodyRegion, side, point) {
    const base = mode === 'reposition' && draft ? draft : { horseId: horse.id, medicalRecordId: editableDrafts[0]?.id || '',
      description: '', severity: 'moderate', status: 'treating', detectedAt: clubToday(), notes: '', history: [] }
    setDraft({ ...base, bodyRegion, bodySide: side, view: side, ...point, diagramVersion: DIAGRAM_VERSION })
    setDirty(true); setMode('view'); setErrors({})
  }
  async function save(event) {
    event.preventDefault()
    if (!canEdit || action.busy) return
    const invalid = validateDiagramMarker(draft, clubToday(), available)
    if (!draft.medicalRecordId) invalid.medicalRecordId = 'Cần liên kết phiếu khám nháp của bạn.'
    setErrors(invalid)
    if (Object.keys(invalid).length) return
    const result = await action.run(() => draft.id ? apiPatch(`/injury-markers/${draft.id}`, draft)
      : apiPost(`/horses/${horse.id}/injury-markers`, draft), 'Đã lưu chấn thương.')
    if (result) { setDraft(result); setDirty(false); data.reload() }
  }
  return <section className="injury-card"><header className="injury-card-heading"><div><h3>Vị trí và lịch sử phục hồi</h3><p>Mỗi dấu gắn với một bệnh án của {horse.name}. Vị trí đã ký được giữ nguyên; theo dõi phục hồi qua phiếu tái khám riêng.</p></div></header>
    {!editableDrafts.length && canManage && <p>Cần một phiếu nháp của bạn để thêm vị trí. <Link to={`/vet/horses/${horse.id}/examination?new=1`}>Lập phiếu khám</Link></p>}
    <Loading state={data}><div className="injury-layout">
      <div><HorseInjuryDiagram view={view} onView={setView} mode={mode} canAdd={canManage && editableDrafts.length > 0}
        onMode={next => { if (leave()) { setMode(next); if (next === 'add') { setDraft(null); setDirty(false) } } }}
        markers={data.data || []} filters={{}} draft={draft} selectedId={draft?.id} onPick={pick} onSelect={select} onReady={setReady} busy={action.busy} />
        <ol>{(data.data || []).map(marker => <li key={marker.id}><button type="button" className="button button-secondary" aria-pressed={draft?.id === marker.id} onClick={() => select(marker)}>{marker.description}</button></li>)}</ol>
        {!data.data?.length && <p>Chưa có dấu chấn thương được lưu.</p>}
      </div>
      <InjuryDetailPanel horse={horse} draft={draft} onChange={(key, value) => { setDraft(d => ({ ...d, [key]: value })); setDirty(true) }}
        onSave={save} onCancel={() => { if (leave()) { setDraft(null); setDirty(false); setMode('view') } }}
        onDelete={async () => { if (!window.confirm('Xóa vị trí chấn thương trên phiếu nháp?')) return; if (await action.run(() => apiDelete(`/injury-markers/${draft.id}`), 'Đã xóa vị trí.')) { setDraft(null); setDirty(false); data.reload() } }}
        onReposition={() => setMode('reposition')} canEdit={!!canEdit} canPosition={ready} canManage={canManage}
        busy={action.busy} dirty={dirty} errors={errors} demo={false} records={available}
        onAssessment={async (id, input) => { const result = await action.run(() => apiPost(`/injury-markers/${id}/assessments`, input), 'Đã lưu lần theo dõi trên máy chủ.'); if (result) { setDraft(result); data.reload(); return true } return false }} onRecoveryDirty={setRecoveryDirty} />
    </div></Loading><Notice state={action} />
  </section>
}
