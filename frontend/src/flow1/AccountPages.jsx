// Nhân sự và tài khoản (QL01–QL07) và Phân quyền chức vụ (QL08).
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import * as api from './api.js'
import { Badge, Crumb, Dialog, Field, Heading, Icon, Loading, Notice, SectionTitle, SelectInput, TextArea, TextInput, Timeline, errorText, useLoad } from './ui.jsx'
import { checkAddress, checkEmail, checkFullName, checkPhone, checkSelect, checkText, runChecks, serverFieldErrors } from '../utils/validation.js'
import { permissionLabels, roleLabels } from '../pages/manager/managerLabels.js'
import { TrainerProfileSection } from '../flow2/HeadPages.jsx'

const STAFF_ROLES = ['CLUB_MANAGER', 'HEAD_TRAINER', 'TRAINER', 'WORK_RIDER', 'VETERINARIAN', 'GROOM']
const ROLE_ORDER = [...STAFF_ROLES, 'HORSE_OWNER']
const initials = (name = '') => name.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase()
export const formatPhone = (p) => (p && /^\d{10}$/.test(p) ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p || '—')
const roleText = (codes = []) => ROLE_ORDER.filter((c) => codes.includes(c)).map((c) => roleLabels[c] || c).join(', ') || '—'
const isOwner = (u) => (u.Roles || []).includes('HORSE_OWNER')
const StatusBadge = ({ status }) => (status === 'Active' ? <Badge kind="ok">Đang hoạt động</Badge> : <Badge kind="arch">Đã khóa</Badge>)

/** Gửi form: chạy fn, lỗi theo ô đưa vào setErrors, lỗi chung trả về chuỗi. */
async function submitWith(fn, setErrors, setFailure, setBusy) {
  setBusy(true); setFailure('')
  try { return await fn() } catch (e) {
    const fields = serverFieldErrors(e)
    if (Object.keys(fields).length) setErrors(fields); else setFailure(errorText(e))
    return undefined
  } finally { setBusy(false) }
}

function TempPassword({ value }) {
  const [copied, setCopied] = useState(false)
  return <div className="temp-pass"><span className="sicon"><Icon name="shield" /></span>
    <div><small>Mật khẩu tạm thời</small><code data-no-translate>{value}</code></div>
    <button type="button" className="btn sec sm" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true) } catch { setCopied(false) } }}>{copied ? 'Đã sao chép' : 'Sao chép'}</button>
  </div>
}

// ---------------- QL01: danh sách ----------------
export function StaffListPage() {
  const users = useLoad(() => api.getUsers(), [])
  const navigate = useNavigate()
  const [group, setGroup] = useState('staff')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const all = useMemo(() => users.data || [], [users.data])
  const staff = all.filter((u) => !isOwner(u))
  const owners = all.filter(isOwner)
  const q = search.trim().toLowerCase()
  const rows = (group === 'staff' ? staff : owners).filter((u) => (!role || u.Roles.includes(role)) && (!status || u.Status === status)
    && (!q || [u.FullName, u.Email, u.Phone].some((v) => v?.toLowerCase().includes(q))))
  return <main className="page-content f1">
    <Crumb items={[['Nhân sự và tài khoản']]} />
    <Heading title="Nhân sự và tài khoản" />
    <section className="panel" style={{ marginTop: 48 }}>
      <div className="toolbar">
        <div className="tabs" role="tablist">
          <span role="tab" tabIndex={0} aria-selected={group === 'staff'} className={`tab ${group === 'staff' ? 'on' : ''}`} onClick={() => { setGroup('staff'); setRole('') }}>Nhân sự nội bộ <em>{staff.length}</em></span>
          <span role="tab" tabIndex={0} aria-selected={group === 'owners'} className={`tab ${group === 'owners' ? 'on' : ''}`} onClick={() => { setGroup('owners'); setRole('') }}>Chủ ngựa <em>{owners.length}</em></span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <Link className="btn sec" to="/manager/owners/new"><Icon name="plus" size={16} /> Tạo tài khoản chủ ngựa</Link>
          <Link className="btn pri" to="/manager/staff/new"><Icon name="plus" size={16} /> Tạo tài khoản nhân sự</Link>
        </div>
      </div>
      <div className="toolbar">
        <label className="search" style={{ marginLeft: 0, width: 340 }}><Icon name="search" size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, email hoặc số điện thoại" aria-label="Tìm kiếm tài khoản" /></label>
        {group === 'staff' && <select className="input" style={{ width: 240 }} value={role} onChange={(e) => setRole(e.target.value)} aria-label="Lọc theo chức vụ">
          <option value="">Tất cả chức vụ</option>{STAFF_ROLES.map((c) => <option key={c} value={c}>{roleLabels[c]}</option>)}</select>}
        <select className="input" style={{ width: 200 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc theo trạng thái">
          <option value="">Tất cả trạng thái</option><option value="Active">Đang hoạt động</option><option value="Suspended">Đã khóa</option></select>
      </div>
      {users.loading ? <Loading /> : users.error ? <Notice kind="bad">{errorText(users.error)}</Notice> : !rows.length ? <p className="empty">Không có tài khoản phù hợp.</p>
        : <table><thead><tr><th>Họ và tên</th><th>Email</th><th>Số điện thoại</th><th>{group === 'staff' ? 'Chức vụ' : 'Địa chỉ'}</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>{rows.map((u) => <tr key={u.UserID}>
            <td><span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span className="av">{initials(u.FullName)}</span><b>{u.FullName}</b></span></td>
            <td>{u.Email}</td><td style={{ whiteSpace: 'nowrap' }}>{formatPhone(u.Phone)}</td>
            <td>{group === 'staff' ? roleText(u.Roles) : u.Address || '—'}</td>
            <td><StatusBadge status={u.Status} /></td>
            <td><button type="button" className="btn sec sm" onClick={() => navigate(`/manager/staff/${u.UserID}`)}>Xem chi tiết</button></td></tr>)}</tbody></table>}
    </section>
  </main>
}

// ---------------- QL02–QL04, QL07: tạo tài khoản ----------------
const EMPTY = { FullName: '', Email: '', Phone: '', Address: '', RoleCode: '' }
const validateAccount = (f, withRole) => runChecks({
  FullName: () => checkFullName(f.FullName), Email: () => checkEmail(f.Email), Phone: () => checkPhone(f.Phone),
  Address: () => checkAddress(f.Address), ...(withRole ? { RoleCode: () => checkSelect(f.RoleCode) } : {}),
})

export function CreateAccountPage({ owner = false }) {
  const navigate = useNavigate()
  const matrix = useLoad(() => (owner ? Promise.resolve(null) : api.getRoleMatrix()), [owner])
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null)
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }
  const title = owner ? 'Tạo tài khoản chủ ngựa' : 'Tạo tài khoản nhân sự'
  const role = matrix.data?.Roles?.find((r) => r.RoleCode === form.RoleCode)

  async function submit(e) {
    e.preventDefault()
    const found = validateAccount(form, !owner)
    setErrors(found)
    if (Object.keys(found).length) return
    const result = await submitWith(() => api.createUser({ ...form, Email: form.Email.trim().toLowerCase(), RoleCode: owner ? 'HORSE_OWNER' : form.RoleCode }),
      setErrors, setFailure, setBusy)
    if (result) setCreated(result)
  }

  return <main className="page-content f1">
    <Crumb items={[['Nhân sự và tài khoản', '/manager/staff'], [title]]} />
    <Heading title={title} />
    <section className="panel"><div className="two">
      <form className="card" onSubmit={submit} noValidate><SectionTitle icon="user">{owner ? 'Thông tin chủ ngựa' : 'Thông tin nhân sự'}</SectionTitle><div className="fgrid">
        <TextInput label="Họ và tên" required value={form.FullName} onChange={set('FullName')} error={errors.FullName} maxLength={160} autoComplete="off" />
        <TextInput label="Email" required value={form.Email} onChange={set('Email')} error={errors.Email} maxLength={120} inputMode="email" autoComplete="off" />
        <TextInput label="Số điện thoại" required value={form.Phone} onChange={set('Phone')} error={errors.Phone} maxLength={20} inputMode="tel" autoComplete="off" />
        <TextInput label="Địa chỉ" required value={form.Address} onChange={set('Address')} error={errors.Address} maxLength={255} autoComplete="off" />
        {owner ? <Field label="Loại tài khoản"><input className="input ro" readOnly value="Chủ sở hữu ngựa" /></Field>
          : <SelectInput label="Chức vụ" required value={form.RoleCode} onChange={set('RoleCode')} error={errors.RoleCode} placeholder="Chọn chức vụ"
            options={STAFF_ROLES.map((c) => [c, roleLabels[c]])} />}
        <Field label="Mật khẩu tạm thời"><input className="input ro" readOnly value="Tạo tự động khi lưu" /></Field></div>
        <p className="owner-note" style={{ marginTop: 14 }}>{owner ? 'Chủ ngựa' : 'Nhân sự'} đăng nhập bằng mật khẩu tạm thời và phải đổi mật khẩu ở lần đăng nhập đầu tiên.</p>
        {failure && <Notice kind="bad" style={{ marginTop: 12 }}>{failure}</Notice>}
        <div className="actions"><Link className="btn sec" to="/manager/staff">Hủy</Link>
          <button type="submit" className="btn pri" disabled={busy}><Icon name="plus" size={16} /> {busy ? 'Đang tạo...' : 'Tạo tài khoản'}</button></div></form>
      {owner ? <div className="card"><SectionTitle icon="shield">Quy trình tiếp nhận</SectionTitle><Timeline steps={[
        ['done', '1. Khởi tạo tài khoản', 'Hoàn tất'], ['now', '2. Khai báo thông tin ngựa', 'Đang thực hiện'],
        ['', '3. Nộp hồ sơ xét duyệt', 'Chưa thực hiện'], ['', '4. Kiểm tra lâm sàng và xác minh', 'Chưa thực hiện'],
        ['', '5. Phê duyệt và tiếp nhận chính thức', 'Chưa thực hiện']]} /></div>
        : <div className="card"><SectionTitle icon="shield">Quyền của chức vụ</SectionTitle>
          {!role ? <p className="hint">Chọn chức vụ để xem các quyền đi kèm.</p> : <>
            <b style={{ display: 'block', marginBottom: 10 }}>{roleLabels[role.RoleCode]}</b>
            <div className="chips">{role.Permissions.map((p) => <span key={p} className="chip">{permissionLabels[p] || p}</span>)}</div></>}
        </div>}
    </div></section>
    {created && <Dialog title={owner ? 'Đã tạo tài khoản chủ ngựa' : 'Đã tạo tài khoản nhân sự'} onClose={() => navigate(`/manager/staff/${created.UserID}`)} actions={<>
      <button type="button" className="btn sec" onClick={() => { setCreated(null); setForm(EMPTY) }}>Tạo tài khoản khác</button>
      <button type="button" className="btn pri" onClick={() => navigate(`/manager/staff/${created.UserID}`)}>Xem tài khoản</button></>}>
      <p>Tài khoản <b>{created.Email}</b> đã được tạo{owner ? '' : <> với chức vụ {roleText(created.Roles)}</>}.</p>
      {created.TemporaryPassword && <TempPassword value={created.TemporaryPassword} />}
      <p className="hint">Mật khẩu chỉ hiển thị một lần. Vui lòng bàn giao trực tiếp cho {owner ? 'chủ ngựa' : 'nhân sự'}.</p>
    </Dialog>}
  </main>
}

// ---------------- QL05, QL06: chi tiết tài khoản ----------------
export function AccountDetailPage({ currentUser, onIdentityChanged }) {
  const { userId } = useParams()
  const user = useLoad(() => api.getUser(userId), [userId])
  if (user.loading) return <main className="page-content f1"><Loading /></main>
  if (user.error) return <main className="page-content f1"><Notice kind="bad">{errorText(user.error)}</Notice></main>
  return <AccountDetail key={`${user.data.UserID}-${user.data.Status}-${(user.data.Roles || []).join()}`} u={user.data}
    self={String(user.data.UserID) === String(currentUser.id)} onChanged={() => { user.reload(); if (String(user.data.UserID) === String(currentUser.id)) onIdentityChanged?.() }} />
}

function AccountDetail({ u, self, onChanged }) {
  const owner = isOwner(u)
  const [info, setInfo] = useState({ FullName: u.FullName || '', Phone: u.Phone || '', Address: u.Address || '' })
  const [roles, setRoles] = useState(u.Roles || [])
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')
  const [dialog, setDialog] = useState('')       // 'lock' | 'reset'
  const [reason, setReason] = useState('')
  const [secret, setSecret] = useState('')
  const set = (k) => (v) => { setInfo((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); setSaved('') }

  async function saveInfo() {
    const found = runChecks({ FullName: () => checkFullName(info.FullName), Phone: () => checkPhone(info.Phone), Address: () => checkAddress(info.Address) })
    setErrors(found)
    if (Object.keys(found).length) return
    if (await submitWith(() => api.updateUser(u.UserID, info), setErrors, setFailure, setBusy)) { setSaved('Đã lưu thông tin cá nhân.'); onChanged() }
  }
  async function saveRoles() {
    if (!roles.length) { setFailure('Vui lòng chọn ít nhất một chức vụ.'); return }
    if (await submitWith(() => api.setUserRoles(u.UserID, roles), setErrors, setFailure, setBusy)) onChanged()
  }
  async function lock() {
    const message = checkText(reason, 500)
    setErrors({ Reason: message })
    if (message) return
    if (await submitWith(() => api.lockUser(u.UserID, reason.trim()), setErrors, setFailure, setBusy)) { setDialog(''); onChanged() }
  }
  async function unlock() { if (await submitWith(() => api.unlockUser(u.UserID), setErrors, setFailure, setBusy)) onChanged() }
  async function reset() {
    const result = await submitWith(() => api.resetUserPassword(u.UserID), setErrors, setFailure, setBusy)
    if (result) setSecret(result.TemporaryPassword)
  }

  return <main className="page-content f1">
    <Crumb items={[['Nhân sự và tài khoản', '/manager/staff'], [u.FullName]]} />
    <Heading title="Chi tiết tài khoản" />
    <section className="panel">
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span className="av lg">{initials(u.FullName)}</span>
        <div style={{ flex: 1 }}><h2 style={{ margin: 0, fontSize: 20 }}>{u.FullName}</h2><small style={{ color: '#6b6f62' }}>{u.Email} · {roleText(u.Roles)}</small></div>
        <StatusBadge status={u.Status} />
      </div>
      {failure && <Notice kind="bad" style={{ marginTop: 14 }}>{failure}</Notice>}
      <div className="two" style={{ marginTop: 18 }}>
        <div className="card"><SectionTitle icon="user">Thông tin cá nhân</SectionTitle><div className="fgrid">
          <TextInput label="Họ và tên" required value={info.FullName} onChange={set('FullName')} error={errors.FullName} maxLength={160} />
          <Field label="Email"><input className="input ro" readOnly value={u.Email} /></Field>
          <TextInput label="Số điện thoại" required value={info.Phone} onChange={set('Phone')} error={errors.Phone} maxLength={20} inputMode="tel" />
          <TextInput label="Địa chỉ" required value={info.Address} onChange={set('Address')} error={errors.Address} maxLength={255} /></div>
          {saved && <Notice kind="ok" style={{ marginTop: 12 }}>{saved}</Notice>}
          <div className="actions"><button type="button" className="btn pri" disabled={busy} onClick={saveInfo}>Lưu thông tin</button></div></div>
        <div className="card"><SectionTitle icon="shield">Chức vụ</SectionTitle>
          {owner ? <p className="hint">Tài khoản chủ ngựa được quản lý riêng với nhân sự nội bộ.</p> : <>
            <div style={{ display: 'grid', gap: 14 }}>{STAFF_ROLES.map((c) => <label key={c} className="check" style={{ fontWeight: 500, fontSize: 14 }}>
              <input type="checkbox" checked={roles.includes(c)} disabled={self && c === 'CLUB_MANAGER'}
                onChange={(e) => setRoles((r) => (e.target.checked ? [...r, c] : r.filter((x) => x !== c)))} />{roleLabels[c]}</label>)}</div>
            <div className="actions"><button type="button" className="btn pri" disabled={busy || roles.slice().sort().join() === (u.Roles || []).slice().sort().join()} onClick={saveRoles}>Lưu chức vụ</button></div></>}
        </div>
      </div>
      {(u.Roles || []).includes('TRAINER') && <>
        <h2 style={{ margin: '28px 0 0', fontSize: 18, paddingTop: 22, borderTop: '1px solid #ecede6' }}>Hồ sơ huấn luyện viên</h2>
        <TrainerProfileSection trainerId={u.UserID} /></>}
      {!self && <>
        <h2 style={{ margin: '28px 0 14px', fontSize: 18, paddingTop: 22, borderTop: '1px solid #ecede6' }}>Bảo mật tài khoản</h2>
        <div className="grid">
          <div className="card sec-row"><span className="sicon"><Icon name="shield" /></span>
            <div><b>Đặt lại mật khẩu</b><small>Hệ thống tạo mật khẩu tạm thời mới và kết thúc các phiên đăng nhập hiện tại của tài khoản.</small></div>
            <button type="button" className="btn sec" disabled={busy || u.Status !== 'Active'} onClick={() => { setSecret(''); setDialog('reset') }}>Đặt lại mật khẩu</button></div>
          <div className="card sec-row"><span className="sicon bad"><Icon name="archive" /></span>
            {u.Status === 'Active' ? <><div><b>Khóa tài khoản</b><small>Tài khoản bị khóa không thể đăng nhập cho đến khi được mở khóa.</small></div>
              <button type="button" className="btn danger" disabled={busy} onClick={() => { setReason(''); setErrors({}); setDialog('lock') }}>Khóa tài khoản</button></>
              : <><div><b>Mở khóa tài khoản</b><small>Tài khoản đang bị khóa. Mở khóa để người dùng đăng nhập lại.</small></div>
                <button type="button" className="btn sec" disabled={busy} onClick={unlock}>Mở khóa tài khoản</button></>}</div>
        </div></>}
    </section>
    {dialog === 'lock' && <Dialog title={`Khóa tài khoản ${u.FullName}?`} onClose={() => setDialog('')} actions={<>
      <button type="button" className="btn sec" onClick={() => setDialog('')}>Hủy</button>
      <button type="button" className="btn danger fill" disabled={busy} onClick={lock}>Khóa tài khoản</button></>}>
      <p>Tài khoản sẽ không thể đăng nhập cho đến khi được mở khóa. Các phiên đăng nhập hiện tại sẽ kết thúc ngay.</p>
      <TextArea label="Lý do khóa tài khoản" required value={reason} onChange={(v) => { setReason(v); setErrors({}) }} error={errors.Reason} rows={3} maxLength={500} />
    </Dialog>}
    {dialog === 'reset' && <Dialog title={secret ? 'Đã đặt lại mật khẩu' : `Đặt lại mật khẩu cho ${u.FullName}?`} onClose={() => setDialog('')} actions={secret
      ? <button type="button" className="btn pri" onClick={() => setDialog('')}>Hoàn tất</button>
      : <><button type="button" className="btn sec" onClick={() => setDialog('')}>Hủy</button>
        <button type="button" className="btn pri" disabled={busy} onClick={reset}>Đặt lại mật khẩu</button></>}>
      {secret ? <><TempPassword value={secret} /><p className="hint">Mật khẩu chỉ hiển thị một lần. Người dùng phải đổi mật khẩu ở lần đăng nhập tiếp theo.</p></>
        : <p>Hệ thống sẽ tạo mật khẩu tạm thời mới và kết thúc các phiên đăng nhập hiện tại của tài khoản này.</p>}
    </Dialog>}
  </main>
}

// ---------------- QL08: phân quyền chức vụ ----------------
export function RolesPage({ onIdentityChanged }) {
  const matrix = useLoad(() => api.getRoleMatrix(), [])
  const [open, setOpen] = useState(() => new Set())
  const [confirmReset, setConfirmReset] = useState(false)
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const roles = (matrix.data?.Roles || []).slice().sort((a, b) => ROLE_ORDER.indexOf(a.RoleCode) - ROLE_ORDER.indexOf(b.RoleCode))
  const toggle = (code) => setOpen((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n })
  async function resetDefaults() {
    if (await submitWith(() => api.resetRoleDefaults(), () => {}, setFailure, setBusy)) { setConfirmReset(false); matrix.reload(); onIdentityChanged?.() }
  }
  return <main className="page-content f1">
    <Crumb items={[['Phân quyền chức vụ']]} />
    <Heading title="Phân quyền chức vụ" />
    <section className="panel" style={{ marginTop: 48 }}>
      {matrix.loading ? <Loading /> : matrix.error ? <Notice kind="bad">{errorText(matrix.error)}</Notice> : <>
        <div className="toolbar"><b style={{ fontSize: 16 }}>{roles.length} chức vụ</b>
          <button type="button" className="link" style={{ marginLeft: 16 }} onClick={() => setOpen(new Set(roles.map((r) => r.RoleCode)))}>Mở rộng tất cả</button>
          <button type="button" className="link" onClick={() => setOpen(new Set())}>Thu gọn tất cả</button>
          <button type="button" className="btn sec" style={{ marginLeft: 'auto' }} onClick={() => setConfirmReset(true)}>Khôi phục quyền mặc định</button></div>
        {failure && <Notice kind="bad" style={{ marginBottom: 12 }}>{failure}</Notice>}
        {roles.map((r) => <RoleCard key={`${r.RoleCode}:${r.Permissions.join()}`} role={r} matrix={matrix.data} open={open.has(r.RoleCode)}
          onToggle={() => toggle(r.RoleCode)} onSaved={() => { matrix.reload(); onIdentityChanged?.() }} />)}
      </>}
    </section>
    {confirmReset && <Dialog title="Khôi phục quyền mặc định?" onClose={() => setConfirmReset(false)} actions={<>
      <button type="button" className="btn sec" onClick={() => setConfirmReset(false)}>Hủy</button>
      <button type="button" className="btn pri" disabled={busy} onClick={resetDefaults}>Khôi phục</button></>}>
      <p>Quyền của mọi chức vụ sẽ trở về thiết lập ban đầu. Thay đổi áp dụng cho mọi câu lạc bộ.</p></Dialog>}
  </main>
}

function RoleCard({ role, matrix, open, onToggle, onSaved }) {
  const [selected, setSelected] = useState(role.Permissions)
  const [confirmed, setConfirmed] = useState(false)
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const dirty = selected.slice().sort().join() !== role.Permissions.slice().sort().join()
  const groups = []
  for (const p of matrix.Permissions) {
    let g = groups.find((x) => x.name === p.Group)
    if (!g) groups.push(g = { name: p.Group, items: [] })
    g.items.push(p)
  }
  const lockedReason = (code) => matrix.LockedCells.find((c) => c.RoleCode === role.RoleCode && c.PermissionCode === code)?.Reason
  async function save() {
    if (await submitWith(() => api.setRolePermissions(role.RoleCode, selected), () => {}, setFailure, setBusy)) onSaved()
  }
  return <div className={`acc ${open ? 'open' : ''}`}>
    <button type="button" className="acc-head" aria-expanded={open} onClick={onToggle}>
      <span className="caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
      <b>{roleLabels[role.RoleCode] || role.RoleName}</b><small>{role.UserCount} tài khoản</small>
      <span className="badge b-ok" style={{ marginLeft: 'auto' }}>{role.Permissions.length} quyền đang bật</span>
      {!open && <span className="link">Mở rộng</span>}
    </button>
    {open && <div className="acc-body">
      {groups.map((g) => <div key={g.name} className="perm-group"><p className="eyebrow" style={{ margin: '0 0 10px' }}>{g.name.toUpperCase()}</p>
        <div className="perm-grid">{g.items.map((p) => {
          const reason = lockedReason(p.PermissionCode)
          return <label key={p.PermissionCode} className="check" style={{ fontWeight: 500, fontSize: 14 }} title={reason || undefined}>
            <input type="checkbox" checked={selected.includes(p.PermissionCode)} disabled={Boolean(reason)}
              onChange={(e) => setSelected((v) => (e.target.checked ? [...v, p.PermissionCode] : v.filter((c) => c !== p.PermissionCode)))} />
            {permissionLabels[p.PermissionCode] || p.PermissionName}</label>
        })}</div></div>)}
      {failure && <Notice kind="bad" style={{ marginTop: 12 }}>{failure}</Notice>}
      <div className="acc-foot">
        <label className="check" style={{ fontWeight: 500 }}><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />Tôi xác nhận thay đổi này áp dụng cho chức vụ ở mọi câu lạc bộ.</label>
        <button type="button" className="btn sec" disabled={!dirty || busy} onClick={() => { setSelected(role.Permissions); setConfirmed(false) }}>Hủy thay đổi</button>
        <button type="button" className="btn pri" disabled={!dirty || !confirmed || busy} onClick={save}>Lưu phân quyền</button>
      </div>
    </div>}
  </div>
}
