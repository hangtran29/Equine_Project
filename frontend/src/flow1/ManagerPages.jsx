// Quản lý câu lạc bộ: Danh sách ngựa (11), Xác minh / Xử lý hồ sơ (12, 19–22), Lưu trữ (26),
// Tạo tài khoản chủ ngựa (06), Yêu cầu sửa hồ sơ (25).
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import * as api from './api.js'
import { ELIGIBILITY, HEALTH, HorseThumb, PhotoGrid, ProfileList, StatusBadge, examPasses, horseMeta, intakeSteps, statusOf, usePhotos } from './horse.jsx'
import { DOC_TYPES, FIELD_LABEL } from './OwnerPages.jsx'
import {
  Badge, Crumb, DateField, Dl, DocRow, Field, Heading, HorseCard, Icon, Loading, Notice, SectionTitle, SelectInput,
  TextArea, TextInput, Timeline, errorText, fmtDate, fmtDateTime, todayIso, useAction, useLoad,
} from './ui.jsx'
import './f1.css'

const TABS = [
  ['submitted', 'Chờ xác minh', (h) => h.RegistrationStatus === 'Submitted'],
  ['exam', 'Chờ khám', (h) => h.RegistrationStatus === 'PendingExam' && !h.InitialExamSigned],
  ['decide', 'Chờ phê duyệt', (h) => h.RegistrationStatus === 'PendingExam' && h.InitialExamSigned],
  ['approved', 'Đã tiếp nhận', (h) => h.RegistrationStatus === 'Approved'],
  ['draft', 'Bản nháp', (h) => h.RegistrationStatus === 'Draft'],
  ['rejected', 'Bị từ chối', (h) => h.RegistrationStatus === 'Rejected'],
  ['archived', 'Lưu trữ', (h) => h.RegistrationStatus === 'Archived'],
]

// ---------------- 11: Danh sách ngựa ----------------
export function ManagerHorsesPage({ canCreate }) {
  const navigate = useNavigate()
  const { data, error, loading } = useLoad(() => api.getHorses(), [])
  const horses = useMemo(() => data || [], [data])
  const [tab, setTab] = useState(null)
  const firstWithItems = TABS.find(([, , t]) => horses.some(t))?.[0] || 'approved'
  const active = tab || firstWithItems
  const shown = horses.filter(TABS.find((t) => t[0] === active)[2])
  const count = (key) => horses.filter(TABS.find((t) => t[0] === key)[2]).length
  const actionText = (h) => ({ Submitted: 'Xác minh', PendingExam: h.InitialExamSigned ? 'Phê duyệt' : 'Xem', Draft: 'Xem' }[h.RegistrationStatus] || 'Xem')
  return <main className="page-content f1">
    <Crumb items={[['Danh sách ngựa']]} />
    <Heading title="Danh sách ngựa" sub="Hồ sơ đăng ký và ngựa đang thuộc câu lạc bộ." />
    <section className="panel">
      <div className="kpis">
        <div className="kpi"><small>Chờ xác minh</small><b>{count('submitted')}</b></div>
        <div className="kpi"><small>Chờ khám lâm sàng</small><b>{count('exam')}</b></div>
        <div className="kpi"><small>Chờ phê duyệt</small><b>{count('decide')}</b></div>
        <div className="kpi"><small>Đang ở câu lạc bộ</small><b>{count('approved')}</b></div>
      </div>
      <div className="toolbar">
        <div className="tabs" role="tablist">{TABS.map(([key, label]) =>
          <span key={key} role="tab" tabIndex={0} aria-selected={active === key} className={`tab ${active === key ? 'on' : ''}`}
            onClick={() => setTab(key)} onKeyDown={(e) => e.key === 'Enter' && setTab(key)}>{label} <em>{count(key)}</em></span>)}</div>
        {canCreate && <Link className="btn sec" style={{ marginLeft: 'auto' }} to="/manager/horses/new"><Icon name="plus" size={16} /> Hỗ trợ khai báo hồ sơ</Link>}
      </div>
      {loading ? <Loading /> : error ? <Notice kind="bad">{errorText(error)}</Notice> : !shown.length ? <p className="empty">Không có hồ sơ nào.</p>
        : <table><thead><tr><th>Ngựa</th><th>Chủ sở hữu</th><th>{active === 'approved' ? 'Mã ngựa' : 'Cập nhật'}</th><th>{active === 'approved' ? 'Chuồng' : 'Ngày gửi'}</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>{shown.map((h) => <tr key={h.HorseID} className="click" onClick={() => navigate(`/manager/horses/${h.HorseID}/intake`)}>
            <td><div className="hname"><HorseThumb horseId={h.HorseID} /><div><b>{h.HorseName}</b><small>{horseMeta(h)}</small></div></div></td>
            <td>{h.Owner?.FullName}</td>
            <td>{active === 'approved' ? h.HorseCode : fmtDate(h.UpdatedAt)}</td>
            <td>{active === 'approved' ? h.CurrentStall?.StallNumber || '—' : fmtDate(h.VerifiedAt || h.UpdatedAt)}</td>
            <td><StatusBadge horse={h} /></td>
            <td>{['Submitted'].includes(h.RegistrationStatus) || (h.RegistrationStatus === 'PendingExam' && h.InitialExamSigned)
              ? <span className="btn pri sm">{actionText(h)}</span> : <span className="link">{actionText(h)}</span>}</td>
          </tr>)}</tbody></table>}
    </section>
  </main>
}

// ---------------- 12 + 19–22: Xác minh / Xử lý hồ sơ ----------------
export function ManagerProcessPage({ onChanged }) {
  const { horseId } = useParams()
  const horse = useLoad(() => api.getHorse(horseId), [horseId])
  const reload = () => { horse.reload(); onChanged?.() }
  if (horse.loading) return <main className="page-content f1"><Loading /></main>
  if (horse.error) return <main className="page-content f1"><Notice kind="bad">{errorText(horse.error)}</Notice></main>
  const h = horse.data
  if (h.RegistrationStatus === 'Submitted') return <VerifyView horse={h} onDone={reload} />
  return <IntakeView horse={h} onDone={reload} />
}

function VerifyView({ horse: h, onDone }) {
  const docs = useLoad(() => api.getDocuments(h.HorseID), [h.HorseID])
  const photos = usePhotos(h.HorseID)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const { busy, error, run } = useAction()
  const papers = (docs.data || []).filter((d) => !d.IsProfileImage && !d.IsRetired)
  async function open(doc) {
    const blob = await api.getDocumentFile(doc.DocumentID)
    window.open(URL.createObjectURL(blob), '_blank', 'noopener')
  }
  async function returnToOwner() {
    if (!reason.trim()) { setReasonError('Vui lòng nhập lý do hoàn trả.'); return }
    if (await run(() => api.rejectHorse(h.HorseID, reason.trim()))) onDone()
  }
  return <main className="page-content f1">
    <Crumb items={[['Danh sách ngựa', '/manager/horses'], [h.HorseName], ['Xác minh hồ sơ']]} />
    <Heading title="Xác minh hồ sơ" />
    <section className="panel" style={{ marginTop: 48 }}>
      <HorseCard name={h.HorseName} meta={`Chủ sở hữu: ${h.Owner?.FullName} · Gửi ngày ${fmtDate(h.UpdatedAt)}`} image={photos[0]} badge={<Badge kind="sent">Chờ xác minh</Badge>} />
      <div className="two" style={{ marginTop: 20 }}>
        <div><h2 style={{ fontSize: 16, margin: '0 0 14px' }}>Thông tin hồ sơ</h2><ProfileList horse={h} />
          <div className="section" style={{ marginTop: 18, paddingTop: 18 }}><h2 style={{ fontSize: 16 }}>Khai báo tình trạng sức khỏe</h2>
            <Dl items={[['Tình trạng sức khỏe hiện tại', h.DeclaredHealth, 1], ['Tiền sử bệnh', h.MedicalHistory, 1], ['Ghi chú khác', h.OwnerNote, 1]]} /></div>
          <div className="section" style={{ marginTop: 18, paddingTop: 18 }}><h2 style={{ fontSize: 16 }}>Hình ảnh</h2><PhotoGrid horseId={h.HorseID} /></div></div>
        <div className="card"><SectionTitle icon="shield">Giấy tờ đính kèm</SectionTitle>
          <div className="docs">{papers.length ? papers.map((d) => <DocRow key={d.DocumentID} name={d.DocumentName} meta={DOC_TYPES[d.DocumentType] || d.DocumentType}
            kind={/\.pdf$/i.test(d.DocumentName) ? 'PDF' : 'JPG'} action={<button type="button" className="link" onClick={() => void open(d)}>Xem</button>} />)
            : <p className="hint" style={{ margin: 0 }}>Chủ ngựa chưa đính kèm giấy tờ.</p>}</div>
          <p className="hint" style={{ marginTop: 14 }}>Vui lòng đối chiếu số hộ chiếu, mã định danh và nguồn gốc với tài liệu đính kèm trước khi phê duyệt.</p></div>
      </div>
      <div className="section"><h2>Kết quả xác minh</h2><div className="form" style={{ marginTop: 0 }}>
        <TextArea label="Lý do hoàn trả" required value={reason} onChange={(v) => { setReason(v); setReasonError('') }} error={reasonError} maxLength={1000} />
        {error && <Notice kind="bad">{error}</Notice>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn pri" disabled={busy} onClick={async () => { if (await run(() => api.verifyHorse(h.HorseID))) onDone() }}>
            <Icon name="check" size={16} /> Xác nhận hồ sơ hợp lệ</button>
          <button type="button" className="btn danger" disabled={busy} onClick={returnToOwner}>Hoàn trả hồ sơ</button></div>
      </div></div>
    </section>
  </main>
}

function IntakeView({ horse: h, onDone }) {
  const navigate = useNavigate()
  const photos = usePhotos(h.HorseID)
  const s = h.RegistrationStatus
  const signed = h.InitialExamSigned
  const exam = h.HealthSummary
  const passes = examPasses(exam)
  const ready = s === 'PendingExam' && signed && passes
  const fail = s === 'PendingExam' && signed && !passes
  const options = useLoad(async () => ready ? {
    stalls: await api.getStalls({ Status: 'Available' }).catch(() => []),
    grooms: await api.getGrooms().catch(() => []),
    load: await groomLoads(),
    records: await api.getMedicalRecords(h.HorseID, 'Initial Exam').catch(() => []),
  } : { records: signed || s === 'Approved' ? await api.getMedicalRecords(h.HorseID, 'Initial Exam').catch(() => []) : [] }, [ready, h.HorseID])
  const requests = useLoad(() => api.getRegistrationRequests(h.HorseID), [h.HorseID])
  const groomInfo = useLoad(() => s === 'Approved' ? api.getHorseGroom(h.HorseID) : Promise.resolve(null), [s, h.HorseID])
  const [stallId, setStallId] = useState('')
  const [groomId, setGroomId] = useState('')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState(fail ? `Kết quả khám lâm sàng không đạt: ${exam?.Conclusion || ''} Chủ ngựa có thể gửi lại hồ sơ sau khi ngựa được điều trị; bác sĩ thú y sẽ khám lâm sàng lại từ đầu.` : '')
  const [reasonError, setReasonError] = useState('')
  const [fieldError, setFieldError] = useState({})
  const { busy, error, run } = useAction()
  const code = h.HorseCode || `EQ-${String(h.HorseID).padStart(3, '0')}`
  const record = (options.data?.records || []).find((r) => r.RecordStatus === 'Signed')

  const badge = s === 'Approved' ? <Badge kind="ok">Đã tiếp nhận</Badge>
    : s === 'PendingExam' && !signed ? <Badge kind="wait">Chờ kết quả lâm sàng</Badge>
      : (() => { const [k, t] = statusOf(h); return <Badge kind={k}>{t}</Badge> })()

  async function approve() {
    const errs = {}
    if (!stallId && options.data?.stalls?.length) errs.stall = 'Vui lòng chọn chuồng.'
    if (!groomId && options.data?.grooms?.length) errs.groom = 'Vui lòng chọn người chăm sóc phụ trách.'
    setFieldError(errs)
    if (Object.keys(errs).length) return
    const done = await run(() => api.approveHorse(h.HorseID, {
      ...(stallId ? { StallID: Number(stallId) } : {}), ...(groomId ? { GroomID: Number(groomId) } : {}), ...(note.trim() ? { ManagerNote: note.trim() } : {}),
    }))
    if (done) onDone()
  }
  async function reject() {
    if (!reason.trim()) { setReasonError('Vui lòng nhập lý do từ chối.'); return }
    if (await run(() => api.rejectHorse(h.HorseID, reason.trim()))) onDone()
  }

  const examBox = record || exam ? <div className={`exam ${fail ? 'bad' : ''}`}>
    <h3><Icon name="sign" size={16} /> Kết quả khám lâm sàng · {record?.VetName ? `${record.VetName} ký duyệt lúc ${fmtDateTime(record.SignedAt)}` : fmtDateTime(exam?.ExamDate)}</h3>
    <Dl items={[['Tình trạng sức khỏe', HEALTH[exam?.HealthStatus] || exam?.HealthStatus], ['Điều kiện tập luyện', ELIGIBILITY[exam?.TrainingEligibility] || exam?.TrainingEligibility],
      ['Cân nặng / chiều cao', record ? `${record.WeightKg ?? '—'} kg · ${record.HeightCm ?? '—'} cm` : '—'],
      ['Kết luận của bác sĩ thú y', exam?.Conclusion, 1]]} /></div> : null

  const groomCount = (gid) => options.data?.load?.[String(gid)] || 0
  return <main className="page-content f1">
    <Crumb items={[['Danh sách ngựa', '/manager/horses'], [h.HorseName], ['Xử lý hồ sơ']]} />
    <Heading title="Xử lý hồ sơ ngựa" />
    <section className="panel" style={{ marginTop: 48 }}>
      <HorseCard name={h.HorseName} meta={`Mã ngựa ${code} · ${h.Breed || ''}`} image={photos[0]} badge={badge} />
      {s !== 'Approved' && <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
        <Link className="btn sec" to={`/manager/horses/${h.HorseID}/profile`}>Xem hồ sơ ngựa</Link></div>}

      {s === 'Archived' && <div className="section"><h2>Hồ sơ đã lưu trữ</h2>
        <Notice title={`Lưu trữ lúc ${fmtDateTime(h.ArchivedAt)}`}>{h.ArchiveReason || '—'}</Notice>
        <div style={{ marginTop: 16 }}><Dl cols={4} items={[['Mã ngựa', h.HorseCode], ['Ngày tiếp nhận', fmtDate(h.VerifiedAt)], ['Ngày rời câu lạc bộ', fmtDate(h.LeftDate)],
          ['Chủ sở hữu', h.Owner?.FullName]]} /></div></div>}

      {s === 'Draft' && <div className="section"><h2>Hồ sơ nháp</h2>
        <Notice kind="info">Hồ sơ chưa được gửi cho câu lạc bộ. Chủ ngựa hoặc quản lý có thể chỉnh sửa và gửi khi đã đủ giấy tờ.</Notice>
        {error && <Notice kind="bad" style={{ marginTop: 12 }}>{error}</Notice>}
        <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <Link className="btn sec" to={`/manager/horses/${h.HorseID}/edit`}><Icon name="edit" size={16} /> Chỉnh sửa</Link>
          <button type="button" className="btn pri" disabled={busy} onClick={async () => { if (await run(() => api.submitHorse(h.HorseID))) onDone() }}>Gửi hồ sơ cho câu lạc bộ</button></div></div>}

      {s === 'Rejected' && <div className="section"><h2>Hồ sơ đã bị từ chối</h2>
        <Notice kind="bad" title="Lý do">{requests.data?.[0]?.ManagerNote || '—'}</Notice></div>}

      {(s === 'PendingExam' || s === 'Approved') && <div className="section"><h2>Phê duyệt và hoàn tất quy trình tiếp nhận</h2>
        {s === 'PendingExam' && !signed && <>
          <Notice>Đang chờ bác sĩ thú y hoàn tất khám lâm sàng. Hồ sơ chưa đủ điều kiện tiếp nhận chính thức.</Notice>
          <div className="form"><Field label="Mã ngựa"><input className="input" readOnly value={code} /></Field>
            <TextArea label="Ghi chú" value={note} onChange={setNote} maxLength={1000} />
            <div><button type="button" className="btn pri" disabled>Phê duyệt hồ sơ</button></div></div></>}
        {ready && <>{examBox}
          {options.loading ? <Loading /> : <div className="form">
            <div className="row"><Field label="Mã ngựa"><input className="input" readOnly value={code} /></Field>
              <SelectInput label="Chuồng" required value={stallId} onChange={(v) => { setStallId(v); setFieldError((e) => ({ ...e, stall: undefined })) }} error={fieldError.stall}
                placeholder={options.data.stalls.length ? 'Chọn chuồng' : 'Không còn chuồng trống'} options={options.data.stalls.map((st) => [String(st.StallID), st.StallNumber])} /></div>
            <SelectInput label="Người chăm sóc phụ trách" required value={groomId} onChange={(v) => { setGroomId(v); setFieldError((e) => ({ ...e, groom: undefined })) }} error={fieldError.groom}
              placeholder="Chọn người chăm sóc" options={options.data.grooms.map((g) => [String(g.UserID), groomCount(g.UserID) ? `${g.FullName} · đang phụ trách ${groomCount(g.UserID)} ngựa` : g.FullName])} />
            <TextArea label="Ghi chú" value={note} onChange={setNote} maxLength={1000} />
            {error && <Notice kind="bad">{error}</Notice>}
            <div><button type="button" className="btn pri" disabled={busy} onClick={approve}><Icon name="check" size={16} /> {busy ? 'Đang phê duyệt...' : 'Phê duyệt hồ sơ'}</button></div>
          </div>}</>}
        {fail && <>{examBox}<Notice kind="bad" style={{ marginTop: 14 }}>Kết quả khám lâm sàng không đạt yêu cầu. Hồ sơ không đủ điều kiện tiếp nhận chính thức. Vui lòng hoàn tất thông báo từ chối gửi đến chủ sở hữu.</Notice></>}
        {s === 'Approved' && <>
          <Notice kind="ok" title={`Đã phê duyệt và tiếp nhận chính thức lúc ${fmtDateTime(requests.data?.[0]?.ReviewedAt)}.`}>
            {h.HorseName} đã chính thức thuộc Câu lạc bộ. Thông báo kết quả đã được gửi đến chủ sở hữu ngựa.</Notice>
          <div style={{ marginTop: 16 }}><Dl cols={4} items={[['Mã ngựa', h.HorseCode], ['Chuồng', h.CurrentStall?.StallNumber], ['Người chăm sóc phụ trách', groomInfo.data?.GroomName],
            ['Ngày tiếp nhận', fmtDate(requests.data?.[0]?.ReviewedAt)]]} /></div>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <Link className="btn sec" to={`/manager/horses/${h.HorseID}/profile`}>Xem hồ sơ ngựa</Link>
            <Link className="btn sec" to="/manager/stalls"><Icon name="stall" size={16} /> Xem vị trí chuồng trại</Link></div></>}
      </div>}

      {s === 'Approved' && <div className="section"><h2>Lưu trữ hồ sơ</h2>
        <button type="button" className="btn sec" onClick={() => navigate(`/manager/horses/${h.HorseID}/archive`)}><Icon name="archive" size={16} /> Lưu trữ hồ sơ</button></div>}

      {s === 'PendingExam' && <div className="section"><h2>Từ chối hồ sơ</h2><div className="form" style={{ marginTop: 0 }}>
        <TextArea label="Lý do từ chối" required value={reason} onChange={(v) => { setReason(v); setReasonError('') }} error={reasonError} maxLength={1000} />
        {fail && error && <Notice kind="bad">{error}</Notice>}
        <div><button type="button" className={`btn ${fail ? 'danger fill' : 'sec'}`} disabled={busy} onClick={reject}>Từ chối hồ sơ</button></div></div></div>}
    </section>
  </main>
}

/** Số ngựa mỗi người chăm sóc đang phụ trách (đọc từng ngựa đã tiếp nhận). */
async function groomLoads() {
  const horses = await api.getHorses({ RegistrationStatus: 'Approved' }).catch(() => [])
  const links = await Promise.all(horses.map((x) => api.getHorseGroom(x.HorseID)))
  return links.filter(Boolean).reduce((acc, l) => ({ ...acc, [String(l.GroomID)]: (acc[String(l.GroomID)] || 0) + 1 }), {})
}

// ---------------- Hồ sơ ngựa (quản lý xem đầy đủ, kể cả hồ sơ đã lưu trữ) ----------------
export function ManagerHorseProfilePage() {
  const { horseId } = useParams()
  const horse = useLoad(() => api.getHorse(horseId), [horseId])
  const requests = useLoad(() => api.getRegistrationRequests(horseId), [horseId])
  const docs = useLoad(() => api.getDocuments(horseId), [horseId])
  const groom = useLoad(() => api.getHorseGroom(horseId).catch(() => null), [horseId])
  const photos = usePhotos(horseId)
  if (horse.loading) return <main className="page-content f1"><Loading /></main>
  if (horse.error) return <main className="page-content f1"><Notice kind="bad">{errorText(horse.error)}</Notice></main>
  const h = horse.data
  const s = h.RegistrationStatus
  const reqs = requests.data || []
  const papers = (docs.data || []).filter((d) => !d.IsProfileImage && !d.IsRetired)
  const intakeDate = reqs.find((r) => r.Status === 'Approved')?.ReviewedAt || h.VerifiedAt
  async function open(doc) {
    const blob = await api.getDocumentFile(doc.DocumentID)
    window.open(URL.createObjectURL(blob), '_blank', 'noopener')
  }
  return <main className="page-content f1">
    <Crumb items={[['Danh sách ngựa', '/manager/horses'], [h.HorseName, `/manager/horses/${horseId}/intake`], ['Hồ sơ ngựa']]} />
    <Heading title="Hồ sơ ngựa" />
    <section className="panel" style={{ marginTop: 48 }}>
      <HorseCard name={h.HorseName} meta={[h.HorseCode && `Mã ngựa ${h.HorseCode}`, horseMeta(h)].filter(Boolean).join(' · ')} image={photos[0]} badge={<StatusBadge horse={h} />} />
      {s === 'Archived' && <Notice style={{ marginTop: 16 }} title="Hồ sơ đã lưu trữ">{h.ArchiveReason || '—'}<br /><small>Ngày rời câu lạc bộ: {fmtDate(h.LeftDate)}</small></Notice>}
      <div className="two" style={{ marginTop: 20 }}>
        <div><h2 style={{ fontSize: 16, margin: '0 0 14px' }}>Thông tin hồ sơ</h2><ProfileList horse={h} />
          <div className="section" style={{ marginTop: 18, paddingTop: 18 }}><h2 style={{ fontSize: 16 }}>Khai báo tình trạng sức khỏe</h2>
            <Dl items={[['Tình trạng sức khỏe hiện tại', h.DeclaredHealth, 1], ['Tiền sử bệnh', h.MedicalHistory, 1], ['Ghi chú khác', h.OwnerNote, 1]]} /></div>
          <div className="section" style={{ marginTop: 18, paddingTop: 18 }}><h2 style={{ fontSize: 16 }}>Hình ảnh</h2><PhotoGrid horseId={horseId} /></div></div>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <div className="card"><SectionTitle icon="user">Chủ sở hữu</SectionTitle>
            <Dl cols={2} items={[['Họ và tên', h.Owner?.FullName], ['Số điện thoại', h.Owner?.Phone], ['Email', h.Owner?.Email, 1], ['Địa chỉ', h.Owner?.Address, 1]]} /></div>
          {(s === 'Approved' || s === 'Archived') && <div className="card"><SectionTitle icon="stall">Thông tin tiếp nhận</SectionTitle>
            <Dl cols={2} items={[['Mã ngựa', h.HorseCode], ['Ngày tiếp nhận', fmtDate(intakeDate)],
              ['Chuồng', s === 'Archived' ? 'Đã giải phóng' : h.CurrentStall?.StallNumber || 'Chưa xếp chuồng'],
              ['Người chăm sóc phụ trách', s === 'Archived' ? '—' : groom.data?.GroomName || 'Chưa phân công'],
              ['Sức khỏe hiện tại', HEALTH[h.CurrentHealthStatus] || h.CurrentHealthStatus || '—'],
              ...(s === 'Archived' ? [['Ngày rời câu lạc bộ', fmtDate(h.LeftDate)]] : [])]} /></div>}
          <div className="card"><SectionTitle icon="shield">Giấy tờ đính kèm</SectionTitle>
            <div className="docs">{papers.length ? papers.map((d) => <DocRow key={d.DocumentID} name={d.DocumentName} meta={DOC_TYPES[d.DocumentType] || d.DocumentType}
              kind={/\.pdf$/i.test(d.DocumentName) ? 'PDF' : 'JPG'} action={<button type="button" className="link" onClick={() => void open(d)}>Xem</button>} />)
              : <p className="hint" style={{ margin: 0 }}>Chưa có giấy tờ.</p>}</div></div>
          {s !== 'Draft' && <div className="card"><SectionTitle icon="shield">Tiến trình tiếp nhận</SectionTitle>
            <Timeline steps={intakeSteps(h, reqs)} /></div>}
        </div>
      </div>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <Link className="btn sec" to={`/manager/horses/${horseId}/intake`}>Quay lại xử lý hồ sơ</Link></div>
    </section>
  </main>
}

// ---------------- 26: Lưu trữ hồ sơ ----------------
const LEAVE_REASONS = ['Chủ ngựa chuyển sang câu lạc bộ khác', 'Chủ ngựa đưa ngựa về', 'Ngựa giải nghệ', 'Ngựa được bán', 'Ngựa chết', 'Lý do khác']
export function ArchivePage({ onChanged }) {
  const { horseId } = useParams()
  const navigate = useNavigate()
  const horse = useLoad(() => api.getHorse(horseId), [horseId])
  const groom = useLoad(() => api.getHorseGroom(horseId), [horseId])
  const photos = usePhotos(horseId)
  const [leftDate, setLeftDate] = useState(todayIso())
  const [reason, setReason] = useState(LEAVE_REASONS[0])
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const { busy, error, run } = useAction()
  if (horse.loading) return <main className="page-content f1"><Loading /></main>
  if (horse.error) return <main className="page-content f1"><Notice kind="bad">{errorText(horse.error)}</Notice></main>
  const h = horse.data
  async function archive() {
    const text = note.trim() ? `${reason}. ${note.trim()}` : reason
    if (await run(() => api.archiveHorse(horseId, text, leftDate))) { onChanged?.(); navigate(`/manager/horses/${horseId}/intake`) }
  }
  return <main className="page-content f1">
    <Crumb items={[['Danh sách ngựa', '/manager/horses'], [h.HorseName, `/manager/horses/${horseId}/intake`], ['Lưu trữ hồ sơ']]} />
    <Heading title="Lưu trữ hồ sơ" />
    <section className="panel" style={{ marginTop: 48 }}>
      <HorseCard name={h.HorseName} meta={`Mã ngựa ${h.HorseCode} · ${h.Breed} · Chủ sở hữu: ${h.Owner?.FullName}`} image={photos[0]} badge={<StatusBadge horse={h} />} />
      {h.RegistrationStatus !== 'Approved' ? <Notice kind="bad" style={{ marginTop: 16 }}>Chỉ lưu trữ được hồ sơ ngựa đã tiếp nhận.</Notice> : <>
        <Notice style={{ marginTop: 16 }}>Thao tác được thực hiện khi ngựa xuất chuồng hoặc chấm dứt quản lý. Dữ liệu lịch sử vẫn được bảo lưu để tra cứu; toàn bộ phân bổ chuồng trại, kế hoạch huấn luyện và lịch chăm sóc sẽ tự động đóng.</Notice>
        <div className="section"><h2>Thông tin hiện tại</h2>
          <Dl items={[['Chuồng', h.CurrentStall ? `${h.CurrentStall.StallNumber} · sẽ được giải phóng` : 'Chưa xếp chuồng'], ['Người chăm sóc phụ trách', groom.data?.GroomName], ['Ngày tiếp nhận', fmtDate(h.VerifiedAt)]]} /></div>
        <div className="section"><h2>Thông tin lưu trữ</h2><div className="form" style={{ marginTop: 0 }}>
          <div className="row"><DateField label="Ngày rời câu lạc bộ" required value={leftDate} onChange={setLeftDate} />
            <SelectInput label="Lý do lưu trữ" required value={reason} onChange={setReason} options={LEAVE_REASONS.map((r) => [r, r])} /></div>
          <TextArea label="Ghi chú" value={note} onChange={setNote} maxLength={800} />
          <label className="check-field" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#4c5b36' }} />
            Xác nhận lưu trữ hồ sơ. Các lịch trình huấn luyện và chăm sóc chưa thực hiện sẽ tự động hủy.</label>
          {error && <Notice kind="bad">{error}</Notice>}
          <div><button type="button" className="btn danger fill" disabled={busy || !confirmed || !leftDate} onClick={archive}><Icon name="archive" size={16} /> {busy ? 'Đang lưu trữ...' : 'Lưu trữ hồ sơ'}</button></div>
        </div></div></>}
    </section>
  </main>
}

// ---------------- 06: Tạo tài khoản chủ ngựa ----------------
export function CreateOwnerPage() {
  const owners = useLoad(() => api.getUsers({ RoleCode: 'HORSE_OWNER' }), [])
  const horses = useLoad(() => api.getHorses(), [])
  const [form, setForm] = useState({ FullName: '', Email: '', Phone: '', Address: '' })
  const [created, setCreated] = useState(null)
  const [tab, setTab] = useState('owners')
  const staff = useLoad(() => tab === 'staff' ? api.getUsers() : Promise.resolve([]), [tab])
  const { busy, error, run } = useAction()
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  async function submit(e) {
    e.preventDefault()
    const result = await run(() => api.createUser({ ...form, Email: form.Email.trim().toLowerCase(), RoleCode: 'HORSE_OWNER' }))
    if (result) { setCreated(result); setForm({ FullName: '', Email: '', Phone: '', Address: '' }); owners.reload() }
  }
  const horseCount = (id) => (horses.data || []).filter((h) => String(h.OwnerID) === String(id)).length
  const rows = tab === 'owners' ? owners.data || [] : (staff.data || []).filter((u) => !u.Roles?.includes('HORSE_OWNER'))
  return <main className="page-content f1">
    <Crumb items={[['Nhân sự và tài khoản', '/manager/staff'], ['Tạo tài khoản chủ ngựa']]} />
    <Heading title="Tạo tài khoản chủ ngựa" />
    <section className="panel"><div className="two">
      <form className="card" onSubmit={submit}><SectionTitle icon="user">Thông tin chủ ngựa</SectionTitle><div className="fgrid">
        <TextInput label="Họ và tên" required value={form.FullName} onChange={set('FullName')} maxLength={150} />
        <TextInput label="Email" required type="email" value={form.Email} onChange={set('Email')} maxLength={100} />
        <TextInput label="Số điện thoại" required value={form.Phone} onChange={set('Phone')} maxLength={20} inputMode="tel" />
        <TextInput label="Địa chỉ" required value={form.Address} onChange={set('Address')} maxLength={255} />
        <Field label="Loại tài khoản"><input className="input" readOnly value="Chủ sở hữu ngựa" /></Field>
        <Field label="Mật khẩu tạm thời"><input className="input" readOnly value={created?.TemporaryPassword || 'Tạo tự động khi lưu'} /></Field></div>
        <p className="hint warm" style={{ marginTop: 14 }}>Chủ ngựa đăng nhập bằng mật khẩu tạm thời và phải đổi mật khẩu ở lần đăng nhập đầu tiên.</p>
        {created && <Notice kind="ok" style={{ marginTop: 12 }} title={`Đã tạo tài khoản cho ${created.FullName}.`}>
          Mật khẩu tạm thời: <b data-no-translate>{created.TemporaryPassword}</b>. Mật khẩu chỉ hiện một lần, vui lòng gửi trực tiếp cho chủ ngựa.</Notice>}
        {error && <Notice kind="bad" style={{ marginTop: 12 }}>{error}</Notice>}
        <div className="actions"><Link className="btn sec" to="/manager/staff">Hủy</Link>
          <button type="submit" className="btn pri" disabled={busy}><Icon name="plus" size={16} /> {busy ? 'Đang tạo...' : 'Tạo tài khoản'}</button></div></form>
      <div className="card"><SectionTitle icon="shield">Quy trình tiếp nhận</SectionTitle><Timeline steps={[
        ['done', '1. Khởi tạo tài khoản', 'Hoàn tất'], ['now', '2. Khai báo thông tin ngựa', 'Đang thực hiện'],
        ['', '3. Nộp hồ sơ xét duyệt', 'Chưa thực hiện'], ['', '4. Kiểm tra lâm sàng & Xác minh', 'Chưa thực hiện'],
        ['', '5. Phê duyệt & Tiếp nhận chính thức', 'Chưa thực hiện']]} /></div>
    </div></section>
    <section className="panel">
      <div className="toolbar"><div className="tabs">
        <span className={`tab ${tab === 'owners' ? 'on' : ''}`} onClick={() => setTab('owners')} role="tab" tabIndex={0}>Chủ ngựa <em>{(owners.data || []).length}</em></span>
        <span className={`tab ${tab === 'staff' ? 'on' : ''}`} onClick={() => setTab('staff')} role="tab" tabIndex={0}>Nhân viên</span></div></div>
      {owners.loading ? <Loading /> : <table><thead><tr><th>Họ và tên</th><th>Email</th><th>Số điện thoại</th><th>{tab === 'owners' ? 'Số ngựa' : 'Vai trò'}</th><th>Trạng thái</th></tr></thead>
        <tbody>{rows.map((u) => <tr key={u.UserID}><td><b>{u.FullName}</b></td><td>{u.Email}</td><td>{u.Phone || '—'}</td>
          <td>{tab === 'owners' ? horseCount(u.UserID) : (u.Roles || []).join(', ')}</td>
          <td>{u.Status === 'Active' ? <Badge kind="ok">Đang hoạt động</Badge> : <Badge kind="arch">Đã khóa</Badge>}</td></tr>)}</tbody></table>}
    </section>
  </main>
}

// ---------------- 25: Yêu cầu sửa hồ sơ (quản lý duyệt) ----------------
export function ChangeRequestsPage({ onChanged }) {
  const [status, setStatus] = useState('Pending')
  const all = useLoad(() => api.getChangeRequests(), [])
  const shown = (all.data || []).filter((r) => r.Status === status)
  const count = (s) => (all.data || []).filter((r) => r.Status === s).length
  return <main className="page-content f1">
    <Crumb items={[['Yêu cầu sửa hồ sơ']]} />
    <Heading title="Yêu cầu sửa hồ sơ" />
    <section className="panel" style={{ marginTop: 48 }}>
      <div className="toolbar"><div className="tabs">{[['Pending', 'Chờ duyệt'], ['Approved', 'Đã duyệt'], ['Rejected', 'Đã từ chối']].map(([s, label]) =>
        <span key={s} role="tab" tabIndex={0} className={`tab ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>{label} <em>{count(s)}</em></span>)}</div></div>
      {all.loading ? <Loading /> : all.error ? <Notice kind="bad">{errorText(all.error)}</Notice> : !shown.length ? <p className="empty">Không có yêu cầu nào.</p>
        : shown.map((r, i) => <ChangeRequestCard key={r.ProfileChangeRequestID} request={r} open={i === 0} onDone={() => { all.reload(); onChanged?.() }} />)}
    </section>
  </main>
}

function ChangeRequestCard({ request: r, open, onDone }) {
  const [expanded, setExpanded] = useState(open)
  const [note, setNote] = useState('')
  const { busy, error, run } = useAction()
  const photos = usePhotos(r.HorseID)
  const changes = r.ChangedFields?.Changes || []
  const evidence = [...(r.ChangedFields?.Attachments || []).filter((a) => a.Purpose === 'evidence'), ...(r.ChangedFields?.EvidenceDocuments || [])]
  const [kind, text] = { Pending: ['wait', 'Chờ duyệt'], Approved: ['ok', 'Đã duyệt'], Rejected: ['bad', 'Đã từ chối'], Withdrawn: ['arch', 'Đã rút'] }[r.Status] || ['draft', r.Status]
  async function view(item) {
    const blob = await api.getChangeAttachment(item.FileUrl)
    window.open(URL.createObjectURL(blob), '_blank', 'noopener')
  }
  async function decide(decision) {
    if (decision === 'reject' && !note.trim()) return
    if (await run(() => api.reviewChangeRequest(r.ProfileChangeRequestID, decision, note.trim()))) onDone()
  }
  return <div className="card" style={{ marginTop: 14 }}>
    <div onClick={() => setExpanded((v) => !v)} style={{ cursor: 'pointer' }}>
      <HorseCard name={r.HorseName} meta={`Gửi ngày ${fmtDateTime(r.RequestedAt)}`} image={photos[0]} badge={<Badge kind={kind}>{text}</Badge>} /></div>
    {expanded && <>
      <table className="compare" style={{ marginTop: 16 }}><thead><tr><th>Thông tin</th><th>Giá trị hiện tại</th><th>Giá trị đề xuất</th></tr></thead>
        <tbody>{changes.length ? changes.map((c) => <tr key={c.Field}><td><b>{FIELD_LABEL[c.Field] || c.Field}</b></td><td className="old">{c.OldValue ?? '—'}</td><td className="new">{c.NewValue ?? '—'}</td></tr>)
          : <tr><td colSpan={3}>Cập nhật hình ảnh / giấy tờ</td></tr>}</tbody></table>
      <div className="two" style={{ marginTop: 16 }}><div><Dl items={[['Lý do chỉnh sửa', r.ChangedFields?.Reason, 1]]} /></div>
        <div className="docs">{evidence.map((d, i) => <DocRow key={i} name={d.DocumentName} meta="Tài liệu chứng minh" kind={/\.pdf$/i.test(d.DocumentName || '') ? 'PDF' : 'JPG'}
          action={d.FileUrl ? <button type="button" className="link" onClick={() => void view(d)}>Xem</button> : null} />)}</div></div>
      {r.Status === 'Pending' ? <>
        <p className="hint" style={{ margin: '14px 0 0' }}>Vui lòng đối chiếu giá trị đề xuất với tài liệu chứng minh trước khi phê duyệt.</p>
        <div className="form" style={{ maxWidth: 'none' }}>
          <TextArea label="Ghi chú phản hồi" value={note} onChange={setNote} rows={2} maxLength={1000} />
          {error && <Notice kind="bad">{error}</Notice>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn pri" disabled={busy} onClick={() => decide('approve')}><Icon name="check" size={16} /> Phê duyệt và cập nhật hồ sơ</button>
            <button type="button" className="btn danger" disabled={busy || !note.trim()} title={!note.trim() ? 'Nhập ghi chú phản hồi để từ chối' : undefined} onClick={() => decide('reject')}>Từ chối yêu cầu</button></div></div></>
        : <div style={{ marginTop: 14 }}><Dl items={[['Người xét duyệt', r.ReviewedByName], ['Thời gian', fmtDateTime(r.ReviewedAt)], ['Ghi chú phản hồi', r.ReviewNote]]} /></div>}
    </>}
  </div>
}
