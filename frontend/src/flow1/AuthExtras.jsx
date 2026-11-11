// Đặt mật khẩu mới từ liên kết email (05) và bắt buộc đổi mật khẩu tạm ở lần đăng nhập đầu (06).
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { saveSession } from '../api/apiClient.ts'
import { changePassword, confirmPasswordReset, getSupportOptions } from './api.js'
import '../components/layout/LoginScreen.css'

const LOCK = <svg className="auth-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v2" /></svg>

function PasswordInput({ label, value, onChange, autoComplete = 'new-password', error }) {
  const [visible, setVisible] = useState(false)
  return <div className="auth-field-box"><label className={`auth-field ${error ? 'auth-field-invalid' : ''}`}><span className="auth-sr">{label}</span>{LOCK}
    <input type={visible ? 'text' : 'password'} placeholder={label} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required minLength={6} aria-invalid={Boolean(error)} />
    <button type="button" className="auth-reveal" aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setVisible(!visible)}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible && <path d="m3 3 18 18" />}</svg></button>
  </label>{error && <p className="auth-field-error" role="alert">{error}</p>}</div>
}

// lỗi từng ô của form mật khẩu: { tên ô: câu lỗi } (chỉ các ô sai)
function passwordErrors({ current, password, confirm, needCurrent = false }) {
  const found = {}
  if (needCurrent && !current) found.current = 'Vui lòng nhập mật khẩu tạm thời hiện tại.'
  if (!password) found.password = 'Vui lòng nhập mật khẩu mới.'
  else if (password.length < 6) found.password = 'Mật khẩu mới phải có ít nhất 6 ký tự.'
  if (!confirm) found.confirm = 'Vui lòng xác nhận mật khẩu mới.'
  else if (password && confirm !== password) found.confirm = 'Mật khẩu xác nhận chưa khớp.'
  return found
}

function AuthFrame({ children, showHome = true }) {
  return <main className="auth-page auth-mode-login">
    {showHome && <Link to="/" className="auth-home"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>Trang chủ</Link>}
    <section className="auth-center">
      <span className="auth-logo"><img src="/auth/equitrack-mark.png" alt="" /></span>
      <h1 className="auth-title">EquiTrack</h1>
      <p className="auth-subtitle">Racehorse Training &amp; Management System</p>
      <span className="auth-rule" aria-hidden="true" />
      {children}
    </section>
  </main>
}

export function ResetPasswordScreen() {
  const [params] = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [fields, setFields] = useState({})
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    const found = passwordErrors({ password, confirm })
    setFields(found); setError('')
    if (Object.keys(found).length) return
    setBusy(true)
    try { await confirmPasswordReset({ Uid: params.get('uid') || '', Token: params.get('token') || '', NewPassword: password }); setDone(true) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Liên kết không hợp lệ hoặc đã hết hạn.') }
    finally { setBusy(false) }
  }
  return <AuthFrame><form className="auth-form" onSubmit={submit} noValidate>
    <h2 className="auth-page-title">Tạo mật khẩu mới</h2>
    {done ? <>
      <p className="auth-feedback auth-success">Mật khẩu mới đã được lưu. Bạn có thể đăng nhập bằng mật khẩu mới.</p>
      <Link className="auth-submit" to="/login" style={{ textDecoration: 'none' }}>Đăng nhập</Link></> : <>
      <p className="auth-heading">Mật khẩu có ít nhất 6 ký tự.</p>
      <PasswordInput label="Mật khẩu mới (ít nhất 6 ký tự)" value={password} onChange={(v) => { setPassword(v); setFields((f) => ({ ...f, password: undefined })) }} error={fields.password} />
      <PasswordInput label="Xác nhận mật khẩu mới" value={confirm} onChange={(v) => { setConfirm(v); setFields((f) => ({ ...f, confirm: undefined })) }} error={fields.confirm} />
      {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}
      <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu mật khẩu mới'}</button>
      <p className="auth-switch"><Link to="/login" style={{ color: 'var(--auth-green)', fontWeight: 700 }}>Quay lại đăng nhập</Link></p></>}
  </form></AuthFrame>
}

export function ForceChangePasswordScreen({ user, onDone, onLogout }) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [fields, setFields] = useState({})
  const [busy, setBusy] = useState(false)
  const typed = (setter, key) => (v) => { setter(v); setFields((f) => ({ ...f, [key]: undefined })) }
  async function submit(e) {
    e.preventDefault()
    const found = passwordErrors({ current, password, confirm, needCurrent: true })
    setFields(found); setError('')
    if (Object.keys(found).length) return
    setBusy(true)
    try {
      const result = await changePassword({ CurrentPassword: current, NewPassword: password })
      if (result?.access && result?.refresh) saveSession(result.access, result.refresh)
      onDone()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đổi được mật khẩu.') }
    finally { setBusy(false) }
  }
  return <AuthFrame showHome={false}><form className="auth-form" onSubmit={submit} noValidate>
    <h2 className="auth-page-title">Thiết lập mật khẩu mới</h2>
    <p className="auth-heading">Tài khoản <b>{user.email}</b> hiện đang sử dụng mật khẩu tạm thời cấp phát lần đầu. Vui lòng thiết lập mật khẩu bảo mật mới để kích hoạt quyền truy cập.</p>
    <PasswordInput label="Mật khẩu tạm thời hiện tại" value={current} onChange={typed(setCurrent, 'current')} autoComplete="current-password" error={fields.current} />
    <PasswordInput label="Mật khẩu mới" value={password} onChange={typed(setPassword, 'password')} error={fields.password} />
    <PasswordInput label="Xác nhận mật khẩu mới" value={confirm} onChange={typed(setConfirm, 'confirm')} error={fields.confirm} />
    {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}
    <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Xác nhận đổi mật khẩu'}</button>
    <p className="auth-switch"><button type="button" onClick={onLogout}>Đăng xuất</button></p>
  </form></AuthFrame>
}

/** Tài khoản đăng nhập được nhưng chưa có vai trò nào trong câu lạc bộ. */
export function NoRoleScreen({ email, onLogout }) {
  const [contact, setContact] = useState(null)
  useEffect(() => {
    let active = true
    getSupportOptions().then((r) => { if (active) setContact(r?.Contact || null) }).catch(() => {})
    return () => { active = false }
  }, [])
  const phone = contact?.Phone && /^\d{10}$/.test(contact.Phone) ? `${contact.Phone.slice(0, 4)} ${contact.Phone.slice(4, 7)} ${contact.Phone.slice(7)}` : contact?.Phone
  return <AuthFrame showHome={false}><div className="auth-form">
    <h2 className="auth-page-title">Tài khoản chưa được cấp quyền</h2>
    <p className="auth-heading">Tài khoản <b>{email}</b> hiện chưa được cấp quyền truy cập vào các chức năng vận hành trên hệ thống EquiTrack.<br />Vui lòng liên hệ Quản lý câu lạc bộ để được hỗ trợ cấp quyền và hoàn tất thiết lập tài khoản.</p>
    {contact && <div className="auth-contact"><span className="auth-contact-av">{contact.FullName.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase()}</span>
      <div><b>{contact.FullName}</b><small>Quản lý câu lạc bộ</small></div>
      {contact.Phone && <a href={`tel:${contact.Phone}`}>{phone}</a>}</div>}
    <button className="auth-submit" type="button" onClick={onLogout}>Đăng xuất</button>
  </div></AuthFrame>
}
