// Đăng ký ngựa (chủ ngựa, trang 08) và Hỗ trợ khai báo hồ sơ ngựa (quản lý, trang 11b).
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import * as api from './api.js'
import { forgetPhotos } from './horse.jsx'
import { DOC_TYPES } from './OwnerPages.jsx'
import {
  ChoiceInput, DateField, Dialog, DocRow, Field, Heading, Crumb, Icon, Loading, Notice, SectionTitle, SelectInput, TextArea, TextInput,
  errorText, todayIso, useLoad,
} from './ui.jsx'
import {
  checkAddress, checkBirthDate, checkEmail, checkFullName, checkHorseName, checkMicrochip, checkPhone, checkSelect, checkChoiceOrText,
  checkText, checkUeln, runChecks, serverFieldErrors,
} from '../utils/validation.js'
import { apiGetPublic } from '../api/apiClient.ts'
import './f1.css'

const EMPTY = {
  HorseName: '', Breed: '', DateOfBirth: '', Gender: '', CoatColor: '', PassportNumber: '', MicrochipNumber: '',
  SireName: '', DamName: '', DeclaredHealth: '', MedicalHistory: '', OwnerNote: '',
}
const OWNER_EMPTY = { OwnerFullName: '', OwnerEmail: '', OwnerPhone: '', OwnerAddress: '' }
const MAX_MB = 10
const IMAGE_RE = /^image\/(jpeg|png|webp)$/

function validate(form, noPassport) {
  return runChecks({
    HorseName: () => checkHorseName(form.HorseName, 'Tên ngựa'),
    Breed: () => checkChoiceOrText(form.Breed, 'Giống ngựa', 100),
    DateOfBirth: () => checkBirthDate(form.DateOfBirth),
    Gender: () => checkSelect(form.Gender),
    CoatColor: () => checkChoiceOrText(form.CoatColor, 'Màu lông', 50),
    PassportNumber: () => (noPassport ? '' : checkUeln(form.PassportNumber)),
    MicrochipNumber: () => checkMicrochip(form.MicrochipNumber),
    SireName: () => checkHorseName(form.SireName, 'Tên ngựa bố'),
    DamName: () => checkHorseName(form.DamName, 'Tên ngựa mẹ'),
    DeclaredHealth: () => checkText(form.DeclaredHealth, 1000, { required: false }),
    MedicalHistory: () => checkText(form.MedicalHistory, 1000, { required: false }),
    OwnerNote: () => checkText(form.OwnerNote, 1000, { required: false }),
  })
}

const validateOwner = (o) => runChecks({
  OwnerFullName: () => checkFullName(o.OwnerFullName),
  OwnerEmail: () => checkEmail(o.OwnerEmail),
  OwnerPhone: () => checkPhone(o.OwnerPhone),
  OwnerAddress: () => checkAddress(o.OwnerAddress),
})

function useObjectUrl(file) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!file) return undefined
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return url
}

function PendingPhoto({ file, onRemove }) {
  const url = useObjectUrl(file)
  return <div className="preview">{url && <img src={url} alt="" />}<button type="button" aria-label="Bỏ ảnh" onClick={onRemove}>×</button></div>
}
function SavedPhoto({ doc, onRemove }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let active = true; let made = ''
    api.getDocumentFile(doc.DocumentID).then((blob) => { if (active) { made = URL.createObjectURL(blob); setUrl(made) } }).catch(() => {})
    return () => { active = false; if (made) URL.revokeObjectURL(made) }
  }, [doc.DocumentID])
  return <div className="preview">{url && <img src={url} alt="" />}<button type="button" aria-label="Xóa ảnh" onClick={onRemove}>×</button></div>
}

// Mỗi hồ sơ một bản form riêng: chuyển từ /new sang /:horseId/edit thì dựng lại form,
// không dùng lại dữ liệu và hộp thoại của lần tạo mới.
export default function HorseFormPage(props) {
  const { horseId } = useParams()
  return <HorseForm key={horseId || 'new'} {...props} />
}

function HorseForm({ manager = false, currentUser }) {
  const { horseId } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(horseId)
  const loaded = useLoad(async () => {
    const [horse, docs, clubs, catalogs] = await Promise.all([
      editing ? api.getHorse(horseId) : null,
      editing ? api.getDocuments(horseId) : [],
      api.getClubs(),
      apiGetPublic('/catalogs'),
    ])
    return { horse, docs, clubs, catalogs }
  }, [horseId, manager])
  const [form, setForm] = useState(EMPTY)
  const [clubId, setClubId] = useState('')
  const [ownerForm, setOwnerForm] = useState(OWNER_EMPTY)
  const [noPassport, setNoPassport] = useState(false)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null)       // QL10b: hồ sơ đã lưu + tài khoản chủ ngựa vừa tạo
  const [photos, setPhotos] = useState([])          // ảnh chờ tải lên
  const [papers, setPapers] = useState([])          // giấy tờ chờ tải lên: {file, type}
  const [docType, setDocType] = useState('Passport')
  const [removed, setRemoved] = useState([])        // DocumentID đã bấm xóa
  const [fileError, setFileError] = useState('')
  const filled = useRef(false)
  const savedDraft = useRef(null)
  const uploadedFiles = useRef(new Set())
  const deletedDocuments = useRef(new Set())

  useEffect(() => {
    const horse = loaded.data?.horse
    if (horse && !filled.current) {
      filled.current = true
      setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, horse[k] ?? ''])))
      setNoPassport(!horse.PassportNumber)
    }
  }, [loaded.data])

  if (loaded.loading) return <main className="page-content f1"><Loading /></main>
  if (loaded.error) return <main className="page-content f1"><Notice kind="bad">{errorText(loaded.error)}</Notice></main>
  const { horse, docs, clubs, catalogs } = loaded.data
  const selectedClub = clubId || String(clubs.find(c => String(c.ClubID) === String(currentUser?.clubId))?.ClubID || clubs[0]?.ClubID || '')
  if (horse && !['Draft', 'Rejected'].includes(horse.RegistrationStatus)) {
    return <main className="page-content f1"><Notice kind="bad">Hồ sơ đang được xét duyệt nên không chỉnh sửa được.</Notice></main>
  }
  const breedOptions = catalogs.Breeds.map((b) => [b.Value, b.Label])
  const colorOptions = catalogs.CoatColors.map((c) => [c.Value, c.Label])
  // hồ sơ cũ có giá trị ngoài danh mục vẫn hiện đúng
  const ownerInput = manager && !editing
  const savedPhotos = docs.filter((d) => d.IsProfileImage && !d.IsRetired && !removed.includes(d.DocumentID))
  const savedPapers = docs.filter((d) => !d.IsProfileImage && !d.IsRetired && !removed.includes(d.DocumentID))
  const set = (key) => (value) => { setForm((f) => ({ ...f, [key]: value })); setErrors((e) => ({ ...e, [key]: undefined })) }
  const setOwner = (key) => (value) => { setOwnerForm((f) => ({ ...f, [key]: value })); setErrors((e) => ({ ...e, [key]: undefined })) }

  function addFiles(list, kind) {
    setFileError('')
    for (const file of list) {
      if (file.size > MAX_MB * 1048576) { setFileError(`${file.name}: dung lượng vượt quá ${MAX_MB}MB.`); continue }
      if (kind === 'photo') {
        if (!IMAGE_RE.test(file.type)) { setFileError(`${file.name}: chỉ nhận ảnh JPG, PNG hoặc WebP.`); continue }
        setPhotos((p) => [...p, file])
      } else {
        if (!IMAGE_RE.test(file.type) && file.type !== 'application/pdf') { setFileError(`${file.name}: chỉ nhận PDF, JPG, PNG hoặc WebP.`); continue }
        setPapers((p) => [...p, { file, type: docType }])
      }
    }
  }

  async function save(e) {
    e.preventDefault()
    const found = { ...validate(form, noPassport), ...(ownerInput ? validateOwner(ownerForm) : {}), ...(!manager && !editing && !selectedClub ? { ClubID: 'Vui lòng chọn câu lạc bộ.' } : {}) }
    setErrors(found); setFailure('')
    if (Object.keys(found).length) return
    const body = {
      ...form, PassportNumber: noPassport ? '' : form.PassportNumber.trim().toUpperCase(), NoPassport: noPassport,
      DeclaredHealth: form.DeclaredHealth.trim(), MedicalHistory: form.MedicalHistory.trim(), OwnerNote: form.OwnerNote.trim(),
    }
    setBusy(true)
    try {
      const existingId = horseId || savedDraft.current?.HorseID
      const result = existingId ? { ...await api.updateHorse(existingId, body), ...(savedDraft.current?.OwnerAccount ? { OwnerAccount: savedDraft.current.OwnerAccount } : {}) }
        : await api.createHorse({ ...body, ...(ownerInput ? ownerForm : { ClubID: Number(selectedClub) }) })
      savedDraft.current = result
      const id = result.HorseID
      for (const docId of removed) if (!deletedDocuments.current.has(docId)) { await api.deleteDocument(docId); deletedDocuments.current.add(docId) }
      for (const file of photos) if (!uploadedFiles.current.has(file)) { await api.uploadDocument(id, file, 'Other', file.name); uploadedFiles.current.add(file) }
      for (const { file, type } of papers) if (!uploadedFiles.current.has(file)) { await api.uploadDocument(id, file, type, file.name); uploadedFiles.current.add(file) }
      forgetPhotos(id)
      if (ownerInput) setCreated(result)
      else navigate(manager ? `/manager/horses/${id}/intake` : `/owner/horses/${id}`)
    } catch (err) {
      const fields = serverFieldErrors(err)
      if (Object.keys(fields).length) setErrors(fields); else setFailure(errorText(err))
    } finally { setBusy(false) }
  }

  const title = manager ? 'Hỗ trợ khai báo hồ sơ ngựa' : 'Đăng ký ngựa'
  return <main className="page-content f1">
    {manager ? <Crumb items={[['Danh sách ngựa', '/manager/horses'], [title]]} />
      : <Crumb items={[['Ngựa của tôi', '/owner/horses'], [editing ? form.HorseName || 'Hồ sơ' : 'Đăng ký ngựa']]} />}
    <Heading title={title} />
    <form className="panel" onSubmit={save} noValidate>
      {failure && <Notice kind="bad" style={{ marginBottom: 14 }}>{failure}</Notice>}
      {!manager && !editing && <div style={{ marginBottom: 18 }}><SelectInput label="Câu lạc bộ tiếp nhận" required value={selectedClub} onChange={setClubId} error={errors.ClubID} placeholder="Chọn câu lạc bộ" options={clubs.map(c => [String(c.ClubID), c.ClubName])} /></div>}
      <div className="grid">
        <div className="card"><SectionTitle icon="user">Thông tin cơ bản</SectionTitle><div className="fgrid">
          <TextInput label="Tên ngựa" required value={form.HorseName} onChange={set('HorseName')} error={errors.HorseName} maxLength={100} />
          <ChoiceInput label="Giống ngựa" required value={form.Breed} onChange={set('Breed')} error={errors.Breed} placeholder="Chọn giống ngựa" options={breedOptions} otherPlaceholder="Nhập giống ngựa" maxLength={100} />
          <DateField label="Ngày sinh" required value={form.DateOfBirth} onChange={set('DateOfBirth')} error={errors.DateOfBirth} max={todayIso()} />
          <SelectInput label="Giới tính" required value={form.Gender} onChange={set('Gender')} error={errors.Gender} placeholder="Chọn giới tính"
            options={[['Male', 'Ngựa đực'], ['Female', 'Ngựa cái'], ['Gelding', 'Ngựa đực thiến']]} />
          <ChoiceInput label="Màu lông" required value={form.CoatColor} onChange={set('CoatColor')} error={errors.CoatColor} placeholder="Chọn màu lông" options={colorOptions} otherPlaceholder="Nhập màu lông" maxLength={50} />
        </div></div>
        <div className="card"><SectionTitle icon="card">Thông tin nhận diện và nguồn gốc</SectionTitle><div className="fgrid">
          <div className="field-stack">
            <TextInput label="Số hộ chiếu (UELN)" required={!noPassport} value={noPassport ? '' : form.PassportNumber} disabled={noPassport}
              onChange={(v) => set('PassportNumber')(v.toUpperCase())} error={errors.PassportNumber} maxLength={20} autoComplete="off" />
            <label className="check"><input type="checkbox" checked={noPassport}
              onChange={(e) => { setNoPassport(e.target.checked); setErrors((x) => ({ ...x, PassportNumber: undefined })) }} />Ngựa chưa được cấp hộ chiếu</label>
          </div>
          <TextInput label="Mã định danh" required value={form.MicrochipNumber} onChange={set('MicrochipNumber')} error={errors.MicrochipNumber} inputMode="numeric" maxLength={20} autoComplete="off" />
          <TextInput label="Tên ngựa bố" required value={form.SireName} onChange={set('SireName')} error={errors.SireName} maxLength={100} />
          <TextInput label="Tên ngựa mẹ" required value={form.DamName} onChange={set('DamName')} error={errors.DamName} maxLength={100} />
        </div></div>
        {manager && editing && <div className="card"><SectionTitle icon="phone">Thông tin chủ sở hữu và liên hệ</SectionTitle><div className="fgrid">
          <Field label="Họ và tên chủ sở hữu"><input className="input ro" readOnly value={horse.Owner?.FullName || ''} /></Field>
          <Field label="Email"><input className="input ro" readOnly value={horse.Owner?.Email || ''} /></Field>
          <Field label="Số điện thoại"><input className="input ro" readOnly value={horse.Owner?.Phone || ''} /></Field>
          <Field label="Địa chỉ"><input className="input ro" readOnly value={horse.Owner?.Address || ''} /></Field>
        </div></div>}
        {ownerInput && <div className="card"><SectionTitle icon="phone">Thông tin chủ sở hữu và liên hệ</SectionTitle><div className="fgrid">
          <TextInput label="Họ và tên chủ sở hữu" required value={ownerForm.OwnerFullName} onChange={setOwner('OwnerFullName')} error={errors.OwnerFullName} maxLength={160} autoComplete="off" />
          <TextInput label="Email" required value={ownerForm.OwnerEmail} onChange={setOwner('OwnerEmail')} error={errors.OwnerEmail} maxLength={120} autoComplete="off" inputMode="email" />
          <TextInput label="Số điện thoại" required value={ownerForm.OwnerPhone} onChange={setOwner('OwnerPhone')} error={errors.OwnerPhone} maxLength={20} autoComplete="off" inputMode="tel" />
          <TextInput label="Địa chỉ" required value={ownerForm.OwnerAddress} onChange={setOwner('OwnerAddress')} error={errors.OwnerAddress} maxLength={255} autoComplete="off" />
          <p className="owner-note">Hệ thống sẽ tự động khởi tạo tài khoản chủ sở hữu từ dữ liệu này khi lưu hồ sơ. Trường hợp email đã đăng ký trước đó, hồ sơ sẽ được liên kết trực tiếp vào tài khoản hiện hữu.</p>
        </div></div>}
        <div className="card"><SectionTitle icon="image">Hình ảnh ngựa</SectionTitle>
          {savedPhotos.length + photos.length === 0
            ? <label className="upload" style={{ height: 150 }}><div><Icon name="image" size={34} /><b>Tải lên ảnh</b><small>JPG, PNG, WebP, tối đa 10MB</small></div>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => { addFiles([...e.target.files], 'photo'); e.target.value = '' }} /></label>
            : <div className="thumbs">
              {savedPhotos.map((d) => <SavedPhoto key={d.DocumentID} doc={d} onRemove={() => setRemoved((r) => [...r, d.DocumentID])} />)}
              {photos.map((f, i) => <PendingPhoto key={`${f.name}-${i}`} file={f} onRemove={() => setPhotos((p) => p.filter((_, j) => j !== i))} />)}
              <label className="add"><span><Icon name="plus" size={18} /><br />Thêm ảnh</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => { addFiles([...e.target.files], 'photo'); e.target.value = '' }} /></label>
            </div>}
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}><SectionTitle icon="shield">Giấy tờ đính kèm</SectionTitle>
          <SelectInput label="Loại giấy tờ" value={docType} onChange={setDocType}
            options={['Passport', 'Microchip Certificate', 'Ownership Proof', 'Other'].map((t) => [t, DOC_TYPES[t]])} />
          <label className="upload" style={{ margin: '14px 0', padding: 18, flex: savedPapers.length + papers.length ? '0 0 auto' : 1 }}>
            <div><Icon name="cloud" size={28} /><b>Tải lên giấy tờ</b><small>PDF, JPG, PNG, WebP, tối đa 10MB</small></div>
            <input type="file" accept=".pdf,image/jpeg,image/png,image/webp" multiple onChange={(e) => { addFiles([...e.target.files], 'paper'); e.target.value = '' }} /></label>
          <div className="docs">
            {savedPapers.map((d) => <DocRow key={d.DocumentID} name={d.DocumentName} meta={DOC_TYPES[d.DocumentType] || d.DocumentType}
              kind={/\.pdf$/i.test(d.DocumentName) ? 'PDF' : 'JPG'} action={<button type="button" className="link" onClick={() => setRemoved((r) => [...r, d.DocumentID])}>Xóa</button>} />)}
            {papers.map(({ file, type }, i) => <DocRow key={`${file.name}-${i}`} name={file.name} meta={`${DOC_TYPES[type]} · ${(file.size / 1048576).toFixed(1)} MB`}
              kind={file.type === 'application/pdf' ? 'PDF' : 'JPG'} action={<button type="button" className="link" onClick={() => setPapers((p) => p.filter((_, j) => j !== i))}>Xóa</button>} />)}
          </div>
          {fileError && <span className="field-error" style={{ marginTop: 8 }}>{fileError}</span>}
        </div>
        <div className="card"><SectionTitle icon="heart">Thông tin sức khỏe</SectionTitle><div style={{ display: 'grid', gap: 14 }}>
          <TextArea label="Tình trạng sức khỏe hiện tại" value={form.DeclaredHealth} onChange={set('DeclaredHealth')} error={errors.DeclaredHealth} maxLength={1000} />
          <TextArea label="Tiền sử bệnh (nếu có)" value={form.MedicalHistory} onChange={set('MedicalHistory')} error={errors.MedicalHistory} maxLength={1000} />
          <TextArea label="Ghi chú khác" value={form.OwnerNote} onChange={set('OwnerNote')} error={errors.OwnerNote} maxLength={1000} />
        </div></div>
      </div>
      <div className="actions">
        {!manager && <span className="left">Bạn có thể lưu nháp và quay lại bổ sung bất cứ lúc nào.</span>}
        <Link className="btn sec" to={manager ? '/manager/horses' : editing ? `/owner/horses/${horseId}` : '/owner/horses'}>Hủy</Link>
        <button type="submit" className="btn pri" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu hồ sơ nháp'}</button>
      </div>
    </form>
    {created && <SavedDialog horse={created} onEdit={() => navigate(`/manager/horses/${created.HorseID}/edit`, { replace: true })}
      onView={() => navigate(`/manager/horses/${created.HorseID}/intake`)} />}
  </main>
}

function SavedDialog({ horse, onEdit, onView }) {
  const account = horse.OwnerAccount || {}
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(account.TemporaryPassword); setCopied(true) } catch { setCopied(false) }
  }
  return <Dialog title="Đã lưu hồ sơ nháp" onClose={onView} actions={<>
    <button type="button" className="btn sec" onClick={onEdit}>Tiếp tục chỉnh sửa</button>
    <button type="button" className="btn pri" onClick={onView}>Xem hồ sơ ngựa</button></>}>
    {account.Created ? <>
      <p>Hồ sơ ngựa <b>{horse.HorseName}</b> đã được lưu nháp. Tài khoản chủ ngựa <b>{account.Email}</b> đã được tạo.</p>
      <div className="temp-pass"><span className="sicon"><Icon name="shield" /></span>
        <div><small>Mật khẩu tạm thời của chủ ngựa</small><code>{account.TemporaryPassword}</code></div>
        <button type="button" className="btn sec sm" onClick={copy}>{copied ? 'Đã sao chép' : 'Sao chép'}</button></div>
      <p className="hint">Mật khẩu chỉ hiển thị một lần. Chủ ngựa phải đổi mật khẩu ở lần đăng nhập đầu tiên.</p>
    </> : <p>Hồ sơ ngựa <b>{horse.HorseName}</b> đã được lưu nháp và liên kết vào tài khoản chủ ngựa hiện hữu <b>{account.Email}</b>.</p>}
  </Dialog>
}
