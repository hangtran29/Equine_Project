// Chủ ngựa: Ngựa của tôi (07), Hồ sơ ngựa (09, 10, 13, 23), Yêu cầu sửa hồ sơ (24).
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import * as api from './api.js'
import { HorseThumb, PhotoGrid, ProfileList, StatusBadge, horseMeta, intakeSteps, usePhotos } from './horse.jsx'
import {
  Badge, ChoiceInput, Crumb, DateField, Dialog, DocRow, Dl, Field, Heading, HorseCard, Icon, Loading, Notice, SectionTitle, SelectInput,
  TextArea, TextInput, Timeline, errorText, fmtDate, fmtDateTime, todayIso, useAction, useLoad,
} from './ui.jsx'
import { checkBirthDate, checkChoiceOrText, checkHorseName, checkMicrochip, checkSelect, checkText, checkUeln, runChecks } from '../utils/validation.js'
import { apiGetPublic } from '../api/apiClient.ts'
import './f1.css'

const OWNER_TABS = [
  ['all', 'Tất cả', () => true],
  ['active', 'Đang xử lý', (h) => ['Submitted', 'PendingExam', 'Rejected'].includes(h.RegistrationStatus)],
  ['approved', 'Đã tiếp nhận', (h) => h.RegistrationStatus === 'Approved'],
  ['draft', 'Bản nháp', (h) => h.RegistrationStatus === 'Draft'],
]

// ---------------- 07: Ngựa của tôi ----------------
export function OwnerHorsesPage() {
  const navigate = useNavigate()
  const { data, error, loading } = useLoad(() => api.getHorses(), [])
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const horses = useMemo(() => (data || []).filter((h) => h.RegistrationStatus !== 'Archived'), [data])
  const shown = horses.filter(OWNER_TABS.find((t) => t[0] === tab)[2])
    .filter((h) => !search.trim() || h.HorseName.toLowerCase().includes(search.trim().toLowerCase()))
  const action = (h) => h.RegistrationStatus === 'Draft' ? 'Tiếp tục khai'
    : h.RegistrationStatus === 'Rejected' && !h.InitialExamSigned ? 'Chỉnh sửa' : 'Xem hồ sơ'
  const go = (h) => navigate(h.RegistrationStatus === 'Draft' ? `/owner/horses/${h.HorseID}/edit` : `/owner/horses/${h.HorseID}`)
  return <main className="page-content f1">
    <Crumb items={[['Ngựa của tôi']]} />
    <Heading eyebrow="CHỦ SỞ HỮU NGỰA" title="Ngựa của tôi" sub="Theo dõi hồ sơ đăng ký và tình trạng ngựa của bạn tại câu lạc bộ." />
    <section className="panel">
      <div className="toolbar">
        <div className="tabs" role="tablist">{OWNER_TABS.map(([key, label, test]) =>
          <span key={key} role="tab" tabIndex={0} aria-selected={tab === key} className={`tab ${tab === key ? 'on' : ''}`}
            onClick={() => setTab(key)} onKeyDown={(e) => e.key === 'Enter' && setTab(key)}>
            {label} <em>{horses.filter(test).length}</em></span>)}</div>
        <label className="search"><Icon name="search" size={16} />
          <input style={{ border: 0, outline: 0, font: 'inherit', width: '100%' }} placeholder="Tìm ngựa" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <Link className="btn pri" to="/owner/horses/new"><Icon name="plus" size={16} /> Đăng ký ngựa</Link>
      </div>
      {loading ? <Loading /> : error ? <Notice kind="bad">{errorText(error)}</Notice> : !shown.length
        ? <p className="empty">Chưa có ngựa nào. Bấm “Đăng ký ngựa” để bắt đầu khai hồ sơ.</p>
        : <table><thead><tr><th>Ngựa</th><th>Mã ngựa</th><th>Cập nhật</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>{shown.map((h) => <tr key={h.HorseID} className="click" onClick={() => go(h)}>
            <td><div className="hname"><HorseThumb horseId={h.HorseID} /><div><b>{h.HorseName}</b><small>{horseMeta(h)}</small></div></div></td>
            <td>{h.HorseCode || '—'}</td><td>{fmtDate(h.UpdatedAt)}</td><td><StatusBadge horse={h} forOwner /></td>
            <td><span className="link">{action(h)}</span></td></tr>)}</tbody></table>}
    </section>
  </main>
}

// ---------------- 09 / 10 / 13 / 23: Hồ sơ ngựa của chủ ngựa ----------------
export function OwnerHorseDetailPage() {
  const { horseId } = useParams()
  const navigate = useNavigate()
  const horse = useLoad(() => api.getHorse(horseId), [horseId])
  const requests = useLoad(() => api.getRegistrationRequests(horseId), [horseId])
  const docs = useLoad(() => api.getDocuments(horseId), [horseId])
  const [confirm, setConfirm] = useState(false)
  const { busy, error, run } = useAction()
  const photos = usePhotos(horseId)
  if (horse.loading) return <main className="page-content f1"><Loading /></main>
  if (horse.error) return <main className="page-content f1"><Notice kind="bad">{errorText(horse.error)}</Notice></main>
  const h = horse.data
  const reqs = requests.data || []
  const s = h.RegistrationStatus
  const returned = s === 'Rejected'
  const papers = (docs.data || []).filter((d) => !d.IsProfileImage && !d.IsRetired)

  async function send() {
    const done = await run(() => api.submitHorse(horseId))
    if (done) { setConfirm(false); horse.reload(); requests.reload() }
  }

  const meta = s === 'Approved' ? `Mã ngựa ${h.HorseCode} · ${horseMeta(h)}`
    : s === 'Draft' ? `${horseMeta(h)} · Lưu nháp lúc ${fmtDateTime(h.UpdatedAt)}`
      : `${horseMeta(h)} · Gửi ngày ${fmtDate(reqs[0]?.RequestDate)}`

  return <main className="page-content f1">
    <Crumb items={[['Ngựa của tôi', '/owner/horses'], [h.HorseName]]} />
    <Heading eyebrow="CHỦ SỞ HỮU NGỰA" title="Hồ sơ ngựa" />
    <section className="panel">
      <HorseCard name={h.HorseName} meta={meta} image={photos[0]} badge={<StatusBadge horse={h} forOwner />} />
      {s === 'Submitted' && <Notice kind="info" style={{ marginTop: 16 }}>Hồ sơ đã được gửi đến câu lạc bộ. Bạn sẽ nhận được thông báo khi có kết quả xác minh.</Notice>}
      {s === 'PendingExam' && <Notice kind="info" style={{ marginTop: 16 }}>Hồ sơ đã được xác minh. Ngựa đang chờ bác sĩ thú y khám lâm sàng.</Notice>}
      {returned && <Notice kind="bad" style={{ marginTop: 16 }} title={h.InitialExamSigned ? 'Hồ sơ bị từ chối' : 'Yêu cầu bổ sung hồ sơ từ Câu lạc bộ'}>
        {reqs[0]?.ManagerNote || 'Câu lạc bộ chưa ghi lý do.'}<br /><small>{fmtDateTime(reqs[0]?.ReviewedAt)}</small></Notice>}
      {s === 'Approved' && <Notice kind="ok" style={{ marginTop: 16 }} title={`${h.HorseName} đã được tiếp nhận chính thức từ ${fmtDate(reqs[0]?.ReviewedAt)}.`}>
        Mọi thay đổi thông tin hồ sơ cần gửi yêu cầu để Câu lạc bộ xét duyệt.</Notice>}
      {s === 'Archived' && <Notice style={{ marginTop: 16 }} title="Hồ sơ đã lưu trữ">{h.ArchiveReason} · {fmtDate(h.LeftDate)}</Notice>}
      {error && <Notice kind="bad" style={{ marginTop: 16 }}>{error}</Notice>}

      <div className="two" style={{ marginTop: 20 }}>
        <div><ProfileList horse={h} />
          <div className="section" style={{ marginTop: 18, paddingTop: 18 }}><h2 style={{ fontSize: 16 }}>Hình ảnh</h2><PhotoGrid horseId={horseId} /></div></div>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          {s === 'Draft' && <div className="card"><SectionTitle icon="shield">Giấy tờ đính kèm</SectionTitle>
            <div className="docs">{papers.length ? papers.map((d) => <DocRow key={d.DocumentID} name={d.DocumentName}
              meta={DOC_TYPES[d.DocumentType] || d.DocumentType} kind={/\.(jpe?g|png|webp)$/i.test(d.FileUrl || d.DocumentName) ? 'JPG' : 'PDF'} />)
              : <p className="hint" style={{ margin: 0 }}>Chưa có giấy tờ.</p>}</div></div>}
          {s === 'Approved' && <div className="card"><SectionTitle icon="stall">Thông tin tiếp nhận</SectionTitle>
            <Dl cols={2} items={[['Mã ngựa', h.HorseCode], ['Chuồng', h.CurrentStall?.StallNumber], ['Người chăm sóc phụ trách', <GroomName key="g" horseId={horseId} />],
              ['Ngày tiếp nhận', fmtDate(reqs[0]?.ReviewedAt)]]} />
            <div className="actions" style={{ justifyContent: 'flex-start' }}>
              <Link className="btn pri" to={`/owner/horses/${horseId}/correction-request`}><Icon name="edit" size={16} /> Gửi yêu cầu sửa hồ sơ</Link>
              <Link className="btn sec" to={`/owner/horses/${horseId}/training`}>Hoạt động huấn luyện</Link></div></div>}
          {s !== 'Draft' && s !== 'Archived' && <div className="card"><SectionTitle icon="shield">Tiến trình tiếp nhận</SectionTitle>
            <Timeline steps={intakeSteps(h, reqs)} /></div>}
        </div>
      </div>
      {s === 'Draft' && <div className="actions">
        <button type="button" className="btn sec" onClick={() => navigate(`/owner/horses/${horseId}/edit`)}><Icon name="edit" size={16} /> Chỉnh sửa</button>
        <button type="button" className="btn pri" onClick={() => setConfirm(true)}>Gửi hồ sơ cho câu lạc bộ</button></div>}
      {returned && !h.InitialExamSigned && <div className="actions">
        <button type="button" className="btn sec" onClick={() => navigate(`/owner/horses/${horseId}/edit`)}><Icon name="edit" size={16} /> Chỉnh sửa hồ sơ</button>
        <button type="button" className="btn pri" disabled={busy} onClick={() => setConfirm(true)}>Gửi lại hồ sơ</button></div>}
      {returned && h.InitialExamSigned && <div className="actions">
        <button type="button" className="btn sec" onClick={() => navigate(`/owner/horses/${horseId}/edit`)}><Icon name="edit" size={16} /> Chỉnh sửa hồ sơ</button>
        <button type="button" className="btn pri" disabled={busy} onClick={() => setConfirm(true)}>Gửi lại hồ sơ</button></div>}
    </section>
    {confirm && <Dialog title="Xác nhận gửi hồ sơ xét duyệt?" onClose={() => setConfirm(false)} actions={<>
      <button type="button" className="btn sec" onClick={() => setConfirm(false)}>Kiểm tra lại</button>
      <button type="button" className="btn pri" disabled={busy} onClick={send}>{busy ? 'Đang gửi...' : 'Gửi hồ sơ'}</button></>}>
      <p>Sau khi gửi, hồ sơ sẽ tạm khóa chỉnh sửa trong thời gian Câu lạc bộ xem xét. Nếu cần bổ sung thông tin, Câu lạc bộ sẽ gửi thông báo để bạn cập nhật.</p>
      <p>Thông báo sẽ được gửi ngay khi có kết quả xét duyệt.</p>
      {returned && h.InitialExamSigned && <p>Hồ sơ gửi lại sẽ được bác sĩ thú y khám lâm sàng lại từ đầu.</p>}
      {error && <Notice kind="bad">{error}</Notice>}
    </Dialog>}
  </main>
}

function GroomName({ horseId }) {
  const { data } = useLoad(() => api.getHorseGroom(horseId), [horseId])
  return data?.GroomName || data?.FullName || '—'
}

export const DOC_TYPES = {
  Passport: 'Hộ chiếu / giấy đăng ký ngựa',
  'Microchip Certificate': 'Giấy chứng nhận mã định danh',
  'Ownership Proof': 'Giấy chứng nhận quyền sở hữu',
  'Handover Record': 'Biên bản bàn giao',
  Contract: 'Hợp đồng',
  Other: 'Giấy tờ khác',
}

// ---------------- 24: Yêu cầu sửa hồ sơ ----------------
const EDITABLE = [
  ['HorseName', 'Tên ngựa'], ['Breed', 'Giống ngựa'], ['DateOfBirth', 'Ngày sinh'], ['Gender', 'Giới tính'],
  ['CoatColor', 'Màu lông'], ['PassportNumber', 'Số hộ chiếu (UELN)'], ['MicrochipNumber', 'Mã định danh'],
  ['SireName', 'Tên ngựa bố'], ['DamName', 'Tên ngựa mẹ'],
]
export const FIELD_LABEL = Object.fromEntries(EDITABLE)

export function OwnerChangeRequestPage() {
  const { horseId } = useParams()
  const navigate = useNavigate()
  const horse = useLoad(() => api.getHorse(horseId), [horseId])
  const history = useLoad(() => api.getChangeRequests({ HorseID: horseId }), [horseId])
  const [field, setField] = useState('DamName')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [file, setFile] = useState(null)
  const [errors, setErrors] = useState({})
  const catalogs = useLoad(() => apiGetPublic('/catalogs'), [])
  const { busy, error, run } = useAction()
  if (horse.loading) return <main className="page-content f1"><Loading /></main>
  if (horse.error) return <main className="page-content f1"><Notice kind="bad">{errorText(horse.error)}</Notice></main>
  const h = horse.data
  const current = field === 'Gender' ? { Male: 'Ngựa đực', Female: 'Ngựa cái', Gelding: 'Ngựa đực thiến' }[h.Gender]
    : field === 'DateOfBirth' ? fmtDate(h.DateOfBirth) : h[field]

  const check = {
    HorseName: (v) => checkHorseName(v, 'Tên ngựa'), SireName: (v) => checkHorseName(v, 'Tên ngựa bố'), DamName: (v) => checkHorseName(v, 'Tên ngựa mẹ'),
    Breed: (v) => checkChoiceOrText(v, 'Giống ngựa', 100), CoatColor: (v) => checkChoiceOrText(v, 'Màu lông', 50), Gender: checkSelect, DateOfBirth: (v) => checkBirthDate(v),
    PassportNumber: checkUeln, MicrochipNumber: checkMicrochip,
  }[field]

  async function submit(e) {
    e.preventDefault()
    const found = runChecks({ Value: () => check(value), Reason: () => checkText(reason, 1000), File: () => (file ? '' : 'Vui lòng tải lên tài liệu chứng minh.') })
    setErrors(found)
    if (Object.keys(found).length) return
    const next = field === 'PassportNumber' ? value.trim().toUpperCase() : value.trim()
    const done = await run(() => api.createChangeRequestWithEvidence(horseId, { [field]: next }, reason.trim(), file))
    if (done) navigate(`/owner/horses/${horseId}`)
  }
  const options = field === 'Breed' ? (catalogs.data?.Breeds || []).map((b) => [b.Value, b.Label])
    : field === 'CoatColor' ? (catalogs.data?.CoatColors || []).map((c) => [c.Value, c.Label])
      : field === 'Gender' ? [['Male', 'Ngựa đực'], ['Female', 'Ngựa cái'], ['Gelding', 'Ngựa đực thiến']] : null
  const setVal = (v) => { setValue(v); setErrors((x) => ({ ...x, Value: undefined })) }

  return <main className="page-content f1">
    <Crumb items={[['Ngựa của tôi', '/owner/horses'], [h.HorseName, `/owner/horses/${horseId}`], ['Yêu cầu sửa hồ sơ']]} />
    <Heading title="Yêu cầu sửa hồ sơ" />
    <section className="panel"><div className="two">
      <form className="card" onSubmit={submit} noValidate><SectionTitle icon="edit">Nội dung cần chỉnh sửa</SectionTitle>
        <div className="form" style={{ marginTop: 0 }}>
          <div className="row">
            <SelectInput label="Thông tin cần chỉnh sửa" required value={field} onChange={(v) => { setField(v); setValue(''); setErrors({}) }} options={EDITABLE} />
            <Field label="Giá trị hiện tại"><input className="input" readOnly value={current || '—'} /></Field></div>
          {field === 'Breed' || field === 'CoatColor' ? <ChoiceInput key={field} label="Giá trị đề xuất" required value={value} onChange={setVal} placeholder="Chọn giá trị" options={options}
            error={errors.Value} otherPlaceholder={field === 'Breed' ? 'Nhập giống ngựa' : 'Nhập màu lông'} maxLength={field === 'Breed' ? 100 : 50} />
            : options ? <SelectInput label="Giá trị đề xuất" required value={value} onChange={setVal} placeholder="Chọn giá trị" options={options} error={errors.Value} />
            : field === 'DateOfBirth' ? <DateField label="Giá trị đề xuất" required value={value} onChange={setVal} error={errors.Value} max={todayIso()} />
              : <TextInput label="Giá trị đề xuất" required value={value} onChange={setVal} error={errors.Value} maxLength={120} autoComplete="off" />}
          <TextArea label="Lý do chỉnh sửa" required value={reason} onChange={(v) => { setReason(v); setErrors((x) => ({ ...x, Reason: undefined })) }} error={errors.Reason} rows={3} maxLength={1000} />
          <Field label="Tài liệu chứng minh" required error={errors.File}>
            {file ? <DocRow name={file.name} meta={`${(file.size / 1048576).toFixed(1)} MB`} kind={/\.pdf$/i.test(file.name) ? 'PDF' : 'JPG'}
              action={<button type="button" className="link" onClick={() => setFile(null)}>Xóa</button>} />
              : <div className="upload" style={{ padding: 16 }}><div><Icon name="cloud" size={24} /><b>Tải lên tài liệu</b><small>PDF, JPG, PNG, WebP, tối đa 10MB</small></div>
                <input type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => { setFile(e.target.files?.[0] || null); setErrors((x) => ({ ...x, File: undefined })) }} /></div>}
          </Field>
          {error && <Notice kind="bad">{error}</Notice>}
          <div className="actions" style={{ marginTop: 0 }}>
            <Link className="btn sec" to={`/owner/horses/${horseId}`}>Hủy</Link>
            <button type="submit" className="btn pri" disabled={busy}>{busy ? 'Đang gửi...' : 'Gửi yêu cầu'}</button></div>
        </div></form>
      <div className="card"><SectionTitle icon="req">Lịch sử điều chỉnh</SectionTitle>
        <div className="docs">{(history.data || []).length ? history.data.map((r) => {
          const c = r.ChangedFields?.Changes?.[0]
          const [kind, text] = { Pending: ['wait', 'Chờ duyệt'], Approved: ['ok', 'Đã duyệt'], Rejected: ['bad', 'Đã từ chối'], Withdrawn: ['arch', 'Đã rút'] }[r.Status] || ['draft', r.Status]
          return <div className="doc" key={r.ProfileChangeRequestID}><div><b>{c ? `${FIELD_LABEL[c.Field] || c.Field}: ${c.OldValue ?? '—'} → ${c.NewValue ?? '—'}` : 'Cập nhật hình ảnh / giấy tờ'}</b>
            <small>Gửi ngày {fmtDate(r.RequestedAt)}</small></div><Badge kind={kind}>{text}</Badge></div>
        }) : <p className="hint" style={{ margin: 0 }}>Chưa có yêu cầu nào.</p>}</div></div>
    </div></section>
  </main>
}
