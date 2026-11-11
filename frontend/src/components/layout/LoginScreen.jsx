import { useEffect, useRef, useState } from 'react'
import { registerOwner } from '../../api/registrationApi.js'
import { getClubs } from '../../api/horseApi.ts'
import { googleClientId, loadGoogleIdentity, signInWithGoogle } from '../../api/googleAuthApi.ts'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../../flow1/api.js'
import { checkAddress, checkEmail, checkFullName, checkPhone } from '../../utils/validation.js'
import './LoginScreen.css'

// Biểu tượng nét mảnh đặt đầu mỗi ô nhập.
const ICONS = {
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  phone: <path d="M6.5 3h3l1.5 4.5-2 1.5a12 12 0 0 0 6 6l1.5-2L21 14.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5a2 2 0 0 1 2-2Z" />,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  club: <><path d="M3 21h18M5 21V10l7-5 7 5v11" /><path d="M10 21v-5h4v5" /></>,
}

// Kiểm tra form bằng code (form đặt noValidate): lỗi của ô nào hiện chữ đỏ ngay dưới ô đó, theo ngôn ngữ đang chọn,
// thay cho bong bóng mặc định của trình duyệt (luôn theo ngôn ngữ của trình duyệt). Mọi ô sai báo cùng lúc.
const need = (value, message) => () => (String(value ?? '').trim() ? '' : message)
const firstError = (...checks) => { for (const check of checks) { const message = check(); if (message) return message } return '' }
/** rules: { tên ô: [các hàm kiểm tra] } -> { tên ô: câu lỗi đầu tiên } (chỉ các ô sai) */
const fieldErrorsOf = (rules) => Object.fromEntries(Object.entries(rules).map(([k, checks]) => [k, firstError(...checks)]).filter(([, m]) => m))
const emailChecks = (email) => [need(email, 'Vui lòng nhập email.'), () => checkEmail(String(email).trim())]
const nameChecks = (name) => [need(name, 'Vui lòng nhập họ và tên.'), () => checkFullName(name)]
const phoneChecks = (phone, empty = 'Vui lòng nhập số điện thoại.') => [need(phone, empty), () => checkPhone(String(phone).trim())]
const addressChecks = (address) => [need(address, 'Vui lòng nhập địa chỉ.'), () => checkAddress(address)]

function FieldIcon({ name }) {
  return <svg className="auth-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
}

// Ô nhập tối giản: nhãn ẩn cho trình đọc màn hình, chữ gợi ý hiện trong ô, biểu tượng ở đầu ô.
function Field({ label, name, type = 'text', value, onChange, autoComplete, minLength, maxLength, icon = 'user', className = '', error, children }) {
  return <div className={`auth-field-box ${className}`}>
    <label className={`auth-field ${error ? 'auth-field-invalid' : ''}`}>
      <span className="auth-sr">{label}</span>
      <FieldIcon name={icon} />
      <input name={name} type={type} value={value} onChange={onChange} autoComplete={autoComplete} minLength={minLength}
        maxLength={maxLength} placeholder={label} required aria-invalid={Boolean(error)} />
      {children}
    </label>
    {error && <p className="auth-field-error" role="alert">{error}</p>}
  </div>
}

function PasswordField(props) {
  const [visible, setVisible] = useState(false)
  return <Field {...props} icon="lock" type={visible ? 'text' : 'password'}>
    <button type="button" className="auth-reveal" aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={visible} onClick={() => setVisible(!visible)}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible && <path d="m3 3 18 18" />}</svg>
    </button>
  </Field>
}

const GOOGLE_G = <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5Z" />
  <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7Z" />
  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44Z" />
  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5Z" />
</svg>

// Chỉ hiện đăng nhập Google khi đã cấu hình client ID.
function GoogleButton({ onCredential, onUnavailable, disabled }) {
  const box = useRef(null)
  const callback = useRef(onCredential)
  const [failed, setFailed] = useState(false)
  useEffect(() => { callback.current = onCredential }, [onCredential])
  useEffect(() => {
    if (!googleClientId) return undefined
    let active = true
    loadGoogleIdentity().then((google) => {
      if (!active || !box.current) return
      google.accounts.id.initialize({ client_id: googleClientId, callback: (answer) => callback.current(answer.credential) })
      google.accounts.id.renderButton(box.current, {
        theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'vi', logo_alignment: 'center',
        width: Math.min(400, box.current.offsetWidth || 400),
      })
    }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [])
  if (!googleClientId) return null
  const official = googleClientId && !failed
  return <>
    <div className="auth-or"><span>hoặc</span></div>
    {official
      ? <div className={`auth-google${disabled ? ' is-disabled' : ''}`} ref={box} />
      : <button type="button" className="auth-google-fallback" disabled={disabled}
        onClick={() => onUnavailable(failed ? 'Không tải được Google Sign-In. Kiểm tra kết nối mạng rồi thử lại.'
          : 'Đăng nhập bằng Google chưa được bật trên hệ thống này. Vui lòng đăng nhập bằng email.')}>
        {GOOGLE_G}<span>Đăng nhập với Google</span>
      </button>}
  </>
}

export default function LoginScreen({ onLogin, error = '', busy = false, onRegister = registerOwner }) {
  // /login?mode=register mở thẳng form đăng ký (nút "Đăng ký" ở trang giới thiệu)
  const [mode, setMode] = useState(() => (new URLSearchParams(window.location.search).get('mode') === 'register' ? 'register' : 'login'))
  const [changed, setChanged] = useState(false)
  const [login, setLogin] = useState({ email: '', password: '' })
  const emptyRegistration = { fullName: '', email: '', phone: '', address: '', password: '', confirmPassword: '' }
  const [registration, setRegistration] = useState(emptyRegistration)
  const [google, setGoogle] = useState({ credential: '', email: '', fullName: '', phone: '', address: '', clubId: '' })
  const [clubs, setClubs] = useState([])
  const [clubsLoading, setClubsLoading] = useState(false)
  const [clubsError, setClubsError] = useState('')
  const [clubRetry, setClubRetry] = useState(0)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  // kiểm tra các ô; còn ô sai thì hiện lỗi dưới từng ô và trả về false
  const validate = (rules) => { const found = fieldErrorsOf(rules); setFieldErrors(found); return !Object.keys(found).length }
  const clearField = (name) => setFieldErrors((e) => (e[name] ? { ...e, [name]: undefined } : e))
  const [forgotEmail, setForgotEmail] = useState('')
  const [resetLink, setResetLink] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const formRef = useRef(null)
  // CLB duy nhất (EquiTrack): tự gán câu lạc bộ đang hoạt động đầu tiên khi đăng ký
  const needsClubs = mode === 'google' || mode === 'register'
  const pending = busy || submitting

  useEffect(() => {
    if (!needsClubs) return
    let active = true
    getClubs().then((rows) => {
      if (active) { setClubs(rows); setClubsError('') }
    }).catch((cause) => {
      if (active) setClubsError(cause instanceof Error ? cause.message : 'Không thể tải câu lạc bộ.')
    }).finally(() => { if (active) setClubsLoading(false) })
    return () => { active = false }
  }, [needsClubs, clubRetry])

  useEffect(() => {
    if (changed) formRef.current?.querySelector('input:not([disabled])')?.focus({ preventScroll: true })
  }, [mode, changed])

  function switchMode(next) {
    if (pending) return
    setChanged(true)
    setFormError('')
    setFieldErrors({})
    setNotice('')
    setResetLink('')
    if ((next === 'google' || next === 'register') && !clubs.length) setClubsLoading(true)
    setMode(next)
  }

  const update = (setter) => (event) => {
    const { name, value } = event.target
    setter((previous) => ({ ...previous, [name]: value }))
    setFormError('')
    clearField(name)
    if (name === 'confirmPassword' || name === 'password') {
      formRef.current?.elements.confirmPassword?.setCustomValidity('')
    }
  }

  async function submitLogin(event) {
    event.preventDefault()
    if (pending) return
    setNotice('')
    setFormError('')
    if (!validate({ email: emailChecks(login.email), password: [need(login.password, 'Vui lòng nhập mật khẩu.')] })) return
    setSubmitting(true)
    try { await onLogin(login.email.trim(), login.password) }
    catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Không thể đăng nhập. Vui lòng thử lại.') }
    finally { setSubmitting(false) }
  }

  async function submitRegistration(event) {
    event.preventDefault()
    if (pending) return
    const r = registration
    setFormError('')
    if (!validate({ fullName: nameChecks(r.fullName), email: emailChecks(r.email), phone: phoneChecks(r.phone), address: addressChecks(r.address),
      password: [need(r.password, 'Vui lòng nhập mật khẩu.'), () => (r.password.length < 6 ? 'Mật khẩu phải có ít nhất 6 ký tự.' : '')],
      confirmPassword: [need(r.confirmPassword, 'Vui lòng xác nhận mật khẩu.'), () => (r.password !== r.confirmPassword ? 'Mật khẩu xác nhận chưa khớp.' : '')] })) return
    setSubmitting(true)
    try {
      await onRegister({ fullName: registration.fullName.trim(), email: registration.email.trim(), phone: registration.phone.trim(), address: registration.address.trim(), clubId: clubs[0]?.id, password: registration.password })
      setLogin({ email: registration.email.trim(), password: '' })
      setRegistration(emptyRegistration)
      setChanged(true)
      setMode('login')
      setNotice('Đăng ký thành công. Bạn có thể đăng nhập bằng tài khoản vừa tạo.')
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Không thể đăng ký. Vui lòng thử lại.') }
    finally { setSubmitting(false) }
  }

  // Sau khi có phiên đăng nhập, tải lại ứng dụng để App đọc tài khoản (GET /auth/me) và chuyển về trang chủ của vai trò.
  function enterApp() { window.location.replace('/login') }

  async function handleGoogle(credential) {
    if (pending || !credential) return
    setFormError('')
    setNotice('')
    setSubmitting(true)
    try {
      const result = await signInWithGoogle(credential)
      if (result.status === 'signed-in') { enterApp(); return }
      setGoogle({ credential, email: result.email, fullName: result.fullName, phone: '', address: '', clubId: '' })
      setChanged(true)
      if (!clubs.length) setClubsLoading(true)
      setMode('google')
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Không thể đăng nhập bằng Google.') }
    finally { setSubmitting(false) }
  }

  async function submitForgot(event) {
    event.preventDefault()
    if (pending) return
    setFormError('')
    setNotice('')
    setSubmitting(true)
    try {
      const result = await requestPasswordReset(forgotEmail.trim())
      setResetLink(result?.ResetLink || '')
      if (result?.ContactManager) { setNotice(result.detail); return }
      if (result?.AccountFound === false) { setFormError('Chưa có tài khoản nào dùng email này. Vui lòng kiểm tra lại email hoặc đăng ký tài khoản chủ ngựa.'); return }
      setNotice('Chúng tôi đã gửi liên kết đặt lại mật khẩu đến địa chỉ email của bạn. Vui lòng kiểm tra hộp thư đến và nhấn vào liên kết để tiếp tục tạo mật khẩu mới.')
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Không gửi được yêu cầu. Vui lòng thử lại.') }
    finally { setSubmitting(false) }
  }

  async function submitGoogleSignup(event) {
    event.preventDefault()
    if (pending) return
    setFormError('')
    if (!validate({ fullName: nameChecks(google.fullName), phone: phoneChecks(google.phone), address: addressChecks(google.address) })) return
    setSubmitting(true)
    try {
      const result = await signInWithGoogle(google.credential, { ...google, clubId: google.clubId || clubs[0]?.id || '' })
      if (result.status === 'signed-in') enterApp()
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Không thể tạo tài khoản. Vui lòng thử lại.') }
    finally { setSubmitting(false) }
  }

  const feedback = <>
    {(formError || (!changed && mode === 'login' && error)) && <p className="auth-feedback auth-error" role="alert">{formError || error}</p>}
    {notice && <p className="auth-feedback auth-success" role="status">{notice}</p>}
  </>
  const clubProblem = <>
    {clubsError && <p className="auth-feedback auth-error" role="alert">{clubsError}{' '}
      <button type="button" className="auth-retry" disabled={pending} onClick={() => { setClubsLoading(true); setClubsError(''); setClubRetry(v => v + 1) }}>Thử lại</button></p>}
    {!clubsLoading && !clubsError && clubs.length === 0 && <p className="auth-feedback" role="status">Chưa có câu lạc bộ đang hoạt động để đăng ký.</p>}
  </>
  const noClub = clubsLoading || Boolean(clubsError) || clubs.length === 0

  return <main className={`auth-page auth-mode-${mode}`}>

    <Link to="/" className="auth-home">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
      Trang chủ
    </Link>

    <section className="auth-center">
      <Link to="/" className="auth-logo" aria-label="EquiTrack – trang chủ"><img src="/auth/equitrack-mark.png" alt="" /></Link>
      <h1 className="auth-title">EquiTrack</h1>
      <p className="auth-subtitle">Racehorse Training &amp; Management System</p>
      <span className="auth-rule" aria-hidden="true" />

      {mode === 'login' && <form ref={formRef} key="login" className="auth-form auth-login" onSubmit={submitLogin} noValidate aria-label="Đăng nhập" aria-busy={pending}>
        <Field label="Email" icon="mail" name="email" type="email" autoComplete="username" value={login.email} onChange={update(setLogin)} maxLength={254} error={fieldErrors.email} />
        <PasswordField label="Mật khẩu" name="password" autoComplete="current-password" value={login.password} onChange={update(setLogin)} error={fieldErrors.password} />
        <p className="auth-forgot"><button type="button" onClick={() => { setForgotEmail(login.email); switchMode('forgot') }} disabled={pending}>Quên mật khẩu?</button></p>
        {feedback}
        <button className="auth-submit" type="submit" disabled={pending}>{pending ? 'Đang đăng nhập…' : <>Đăng nhập <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6" /></svg></>}</button>
        <GoogleButton onCredential={handleGoogle} onUnavailable={(message) => { setNotice(''); setFormError(message) }} disabled={pending} />
        <p className="auth-switch">Chưa có tài khoản? <button type="button" onClick={() => switchMode('register')} disabled={pending}>Đăng ký chủ ngựa</button></p>
      </form>}

      {mode === 'register' && <form ref={formRef} key="register" className="auth-form auth-form-wide auth-register" onSubmit={submitRegistration} noValidate aria-label="Đăng ký chủ ngựa" aria-busy={pending}>
        <p className="auth-heading">Đăng ký tài khoản chủ ngựa</p>
        <div className="auth-grid">
          <Field label="Họ và tên" name="fullName" autoComplete="name" value={registration.fullName} onChange={update(setRegistration)} maxLength={150} error={fieldErrors.fullName} />
          <Field label="Email" icon="mail" name="email" type="email" autoComplete="email" value={registration.email} onChange={update(setRegistration)} maxLength={254} error={fieldErrors.email} />
          <Field label="Số điện thoại" icon="phone" name="phone" type="tel" autoComplete="tel" value={registration.phone} onChange={update(setRegistration)} maxLength={20} error={fieldErrors.phone} />
          <Field label="Địa chỉ" icon="pin" name="address" autoComplete="street-address" value={registration.address} onChange={update(setRegistration)} maxLength={255} error={fieldErrors.address} />
          <PasswordField className="auth-field-wide" label="Mật khẩu (ít nhất 6 ký tự)" name="password" autoComplete="new-password" value={registration.password} onChange={update(setRegistration)} minLength={6} error={fieldErrors.password} />
          <PasswordField className="auth-field-wide" label="Xác nhận mật khẩu" name="confirmPassword" autoComplete="new-password" value={registration.confirmPassword} onChange={update(setRegistration)} minLength={6} error={fieldErrors.confirmPassword} />
        </div>
        {feedback}
        <button className="auth-submit" type="submit" disabled={pending}>{pending ? 'Đang đăng ký…' : 'Tạo tài khoản'}</button>
        <p className="auth-switch">Đã có tài khoản? <button type="button" onClick={() => switchMode('login')} disabled={pending}>Đăng nhập</button></p>
      </form>}

      {mode === 'forgot' && <form ref={formRef} key="forgot" className="auth-form" onSubmit={submitForgot} aria-label="Quên mật khẩu" aria-busy={pending}>
        <h2 className="auth-page-title">Quên mật khẩu</h2>
        <p className="auth-heading">Vui lòng nhập email đã đăng ký để thiết lập lại mật khẩu.</p>
        <Field label="Email" icon="mail" name="email" type="email" autoComplete="username" value={forgotEmail} onChange={(e) => { setForgotEmail(e.target.value); setFormError('') }} maxLength={254} />
        {feedback}
        {resetLink && <p className="auth-feedback auth-success" role="status">Máy chủ chưa cấu hình gửi email nên thư chỉ được in ở cửa sổ backend. Đường link đặt lại mật khẩu:{' '}
          <a href={resetLink} style={{ fontWeight: 700, color: 'inherit' }}>Đặt mật khẩu mới</a></p>}
        <button className="auth-submit" type="submit" disabled={pending}>{pending ? 'Đang gửi…' : 'Gửi liên kết đặt lại'}</button>
        <p className="auth-switch"><button type="button" onClick={() => switchMode('login')} disabled={pending}>Quay lại đăng nhập</button></p>
      </form>}

      {mode === 'google' && <form ref={formRef} key="google" className="auth-form" onSubmit={submitGoogleSignup} noValidate aria-label="Hoàn tất đăng ký bằng Google" aria-busy={pending}>
        <p className="auth-heading">Hoàn tất tài khoản chủ ngựa cho <b>{google.email}</b></p>
        <Field label="Họ và tên" name="fullName" autoComplete="name" value={google.fullName} onChange={update(setGoogle)} maxLength={150} error={fieldErrors.fullName} />
        <Field label="Số điện thoại" icon="phone" name="phone" type="tel" autoComplete="tel" value={google.phone} onChange={update(setGoogle)} maxLength={20} error={fieldErrors.phone} />
        <Field label="Địa chỉ" icon="pin" name="address" autoComplete="street-address" value={google.address} onChange={update(setGoogle)} maxLength={255} error={fieldErrors.address} />
        {clubProblem}
        {feedback}
        <button className="auth-submit" type="submit" disabled={pending || noClub}>{pending ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
        <p className="auth-switch"><button type="button" onClick={() => switchMode('login')} disabled={pending}>Quay lại đăng nhập</button></p>
      </form>}
    </section>
  </main>
}
