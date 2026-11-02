import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiGetBlob, apiPost, apiPostForm } from '../api/apiClient.ts'
import { getCompleteVetList } from '../api/vetApi.ts'
import { getApprovedHorses } from '../api/careApi.ts'
import { CarePage, Loading, Notice } from './care/careShared.jsx'
import { fmtDateTime, useLoad, useSubmit } from './care/careUtils.js'

export function ReportAttachments({ attachments = [] }) {
  return <div className="care-report-photos">{attachments.map(a => <PrivatePhoto key={a.AttachmentID} attachment={a} />)}</div>
}

function PrivatePhoto({ attachment }) {
  const [state, setState] = useState({ url: '', error: '' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true, url = ''
    apiGetBlob(`/health-report-attachments/${encodeURIComponent(attachment.AttachmentID)}/file`).then(blob => {
      if (active) { url = URL.createObjectURL(blob); setState({ url, error: '' }) }
    }).catch(() => { if (active) setState({ url: '', error: 'Chưa tải được ảnh' }) })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [attachment.AttachmentID, attempt])
  return state.url ? <a href={state.url} target="_blank" rel="noreferrer"><img src={state.url} alt="Ảnh báo cáo sức khỏe" /></a>
    : <span role="status">{state.error || 'Đang tải ảnh…'}{state.error && <button type="button" onClick={() => setAttempt(n => n + 1)}>Thử lại ảnh</button>}</span>
}

const labels = { Reported: 'Chờ Vet nhận', Reviewing: 'Vet đang xử lý', Resolved: 'Đã xử lý' }

export default function HealthReportsPage() {
  const [params] = useSearchParams()
  const [horseId, setHorseId] = useState(params.get('horse') || '')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState(params.get('urgent') ? 'Urgent' : 'Normal')
  const [files, setFiles] = useState([])
  const [merged, setMerged] = useState('')
  const uploaded = useRef(new Map())
  const horses = useLoad(getApprovedHorses, [])
  const reports = useLoad(() => getCompleteVetList(horseId ? `/horses/${horseId}/health-reports` : '/health-reports'), [horseId])
  const action = useSubmit()
  const open = reports.data?.find(r => String(r.HorseID) === horseId && r.Status !== 'Resolved')
  function chooseHorse(value) { setHorseId(value); setFiles([]); uploaded.current.clear(); action.clear() }
  async function submit(event) {
    event.preventDefault()
    if (!horseId || reports.loading || reports.error || !description.trim()) return
    const saved = await action.run(async () => {
      const ids = []
      for (const file of files) {
        if (!uploaded.current.has(file)) {
          const form = new FormData(); form.append('File', file)
          const row = await apiPostForm(`/horses/${horseId}/health-report-attachments`, form)
          uploaded.current.set(file, row.AttachmentID)
        }
        ids.push(uploaded.current.get(file))
      }
      if (open) return apiPost(`/health-reports/${open.HealthReportID}/notes`, {
        Content: description.trim(), Severity: severity, AttachmentIDs: ids,
      })
      return apiPost(`/horses/${horseId}/health-reports`, { Description: description.trim(), Severity: severity, AttachmentIDs: ids })
    }, open ? 'Đã bổ sung vào báo cáo đang xử lý.' : 'Đã lưu báo cáo và đưa vào hàng chờ Vet.')
    reports.reload()
    if (saved) { setMerged(saved.ReusedOpenReport ? `Đã bổ sung và nâng mức khẩn trên báo cáo đang mở #${saved.HealthReportID}.` : ''); setDescription(''); setFiles([]); uploaded.current.clear() }
  }
  return <CarePage crumb="Báo sức khỏe" eyebrow="SỨC KHỎE NGỰA" title="Báo cáo bất thường"
    description="Ghi nhận dấu hiệu quan sát được. Khi báo khẩn, hệ thống dừng buổi đang tập và ưu tiên báo cho bác sĩ đang trực.">
    <form className="panel care-form" onSubmit={submit}>
      <fieldset disabled={action.busy} className="vet-form-fields">
        <label className="form-field"><span>Ngựa được giao</span><select required value={horseId} onChange={e => chooseHorse(e.target.value)}><option value="">Chọn ngựa</option>{(horses.data || []).map(h => <option key={h.HorseID} value={h.HorseID}>{h.HorseName}</option>)}</select></label>
        {horses.error && <p role="alert">{horses.error}</p>}
        {open && <div className="alert-banner" role="status">Ngựa đang có báo cáo #{open.HealthReportID} · {labels[open.Status]}. Nội dung mới sẽ bổ sung vào báo cáo này. Bạn vẫn có thể nâng mức khẩn.</div>}
        <label className="form-field"><span>{open ? 'Ghi chú bổ sung' : 'Triệu chứng / mô tả'}</span><textarea required maxLength={open ? 2000 : 2500} value={description} onChange={e => setDescription(e.target.value)} rows={4} /></label>
        <label className="form-field"><span>Mức độ</span><select value={severity} onChange={e => setSeverity(e.target.value)}><option value="Normal">Thông thường</option><option value="Urgent">Khẩn cấp</option></select></label>
        <label className="form-field"><span>Ảnh tùy chọn (tối đa 8 ảnh, JPG/PNG/WEBP)</span><input key={files.length ? 'selected' : 'empty'} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { setFiles(Array.from(e.target.files || []).slice(0, 8)); uploaded.current.clear() }} /></label>
        {!!files.length && <p>{files.map(f => f.name).join(', ')}</p>}
        <button className="button" disabled={!horseId || reports.loading || !!reports.error || action.busy}>{action.busy ? 'Đang tải ảnh và lưu…' : open ? severity === 'Urgent' ? 'Bổ sung và báo khẩn' : 'Bổ sung báo cáo' : 'Gửi báo cáo'}</button>
      </fieldset><Notice state={action} />{merged && <p role="status">{merged}</p>}
    </form>
    <section className="panel"><h2>Báo cáo trong phạm vi của bạn</h2><Loading state={reports} isEmpty={!reports.data?.length} empty={['Chưa có báo cáo']}>
      {(reports.data || []).map(r => <article className="vet-amendment" key={r.HealthReportID}><h3>{r.HorseName} · #{r.HealthReportID}</h3><p>{labels[r.Status]} · {r.Severity === 'Urgent' ? 'Khẩn cấp' : 'Thông thường'} · {fmtDateTime(r.ReportedAt)}</p><p>{r.Description}</p><ReportAttachments attachments={r.Attachments} />{r.Notes?.map(n => <p key={n.HealthReportNoteID}>{n.NoteByName}: {n.Content}</p>)}{r.VetNote && <p>Kết luận Vet: {r.VetNote}</p>}</article>)}
    </Loading></section>
  </CarePage>
}
