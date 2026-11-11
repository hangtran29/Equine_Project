// Thành phần giao diện dùng chung cho các trang Flow 1 (theo bộ thiết kế 32 trang).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { currentLang } from '../i18n/runtime.js'
import { openTimePicker } from './datePicker.js'
import { checkDateText } from '../utils/validation.js'
import { clubToday } from '../pages/vet/vetDomain.js'

const PATHS = {
  horse: <><path d="M4 20v-4l3-3 2-5 4-3 5 1 2 4-3 2-2-2-2 3 1 4v3" /><path d="M7 20v-3M15 20v-3M13 6l-1-3" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.5-3.5 3.1-5.5 7-5.5s6.5 2 7 5.5" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="11" r="1.8" /><path d="M6 15.5c.6-1.4 1.5-2 2.5-2s1.9.6 2.5 2M14 10h4M14 13h4" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>,
  shield: <><path d="M12 3l7 3v5c0 5-3.4 8.1-7 10-3.6-1.9-7-5-7-10V6l7-3Z" /><path d="m9.5 12.2 1.7 1.7 3.4-3.9" /></>,
  heart: <><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /><path d="M8 12h2l1-2 2 4 1-2h2" /></>,
  cal: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  cloud: <><path d="M7 18a5 5 0 0 1-.6-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9" /><path d="M12 12v8M9 15l3-3 3 3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>,
  steth: <><path d="M6 3v6a5 5 0 0 0 10 0V3" /><path d="M11 14v2a4 4 0 0 0 8 0v-2" /><circle cx="19" cy="12" r="2" /></>,
  file: <><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4M9 13h6M9 17h4" /></>,
  sign: <><path d="M3 17c3 0 4-6 6-6s1 6 3 6 2-3 4-3 2 3 5 3" /><path d="M3 21h18" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v11h14V9M10 13h4" /></>,
  edit: <path d="M4 20h4l11-11-4-4L4 16zM13 7l4 4" />,
  check: <path d="m5 12 4.5 4.5L19 7" />,
  req: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h3" /></>,
  stall: <><path d="M3 10 12 4l9 6v10H3z" /><path d="M8 20v-6h8v6" /></>,
  club: <><path d="M4 21V8l8-5 8 5v13" /><path d="M9 21v-6h6v6" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
}

export function Icon({ name, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
}

export function Crumb({ items }) {
  return <div className="crumb">{items.map(([label, to], i) => <span key={label} style={{ margin: 0 }}>
    {i > 0 && <span>/</span>}{to ? <Link to={to}>{label}</Link> : label}</span>)}</div>
}

// Quy ước giao diện: chỉ có tiêu đề trang, không có dòng ghi chú phía trên / phía dưới tiêu đề.
export function Heading({ title }) {
  return <h1 className="h1top">{title}</h1>
}

export const Req = () => <b className="req" aria-hidden="true">*</b>

export function Field({ label, required, error, children, className = '' }) {
  return <label className={`field ${className}`}>
    <span>{label}{required && <Req />}</span>
    {children}
    {error && <span className="field-error" role="alert">{error}</span>}
  </label>
}

export function TextInput({ label, required, error, value, onChange, unit, ...rest }) {
  const input = <input className="input" value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} aria-required={required} aria-invalid={Boolean(error)} {...rest} />
  return <Field label={label} required={required} error={error}>
    {unit ? <div className="input-wrap">{input}<span className="unit">{unit}</span></div> : input}
  </Field>
}

export function SelectInput({ label, required, error, value, onChange, options, placeholder, ...rest }) {
  return <Field label={label} required={required} error={error}>
    <select className="input" value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} aria-required={required} aria-invalid={Boolean(error)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
    </select>
  </Field>
}

export function TextArea({ label, required, error, value, onChange, rows = 3, ...rest }) {
  return <Field label={label} required={required} error={error}>
    <textarea className="ta" rows={rows} value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} aria-required={required} aria-invalid={Boolean(error)} {...rest} />
  </Field>
}

// ----- ngày: hiển thị dd/mm/yyyy (VI) hoặc mm/dd/yyyy (EN), giá trị luôn là YYYY-MM-DD -----
export function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  if (!y || !m || !d) return '—'
  return currentLang() === 'en' ? `${m}/${d}/${y}` : `${d}/${m}/${y}`
}
export function fmtDateTime(value) {
  if (!value) return '—'
  const text = String(value)
  const time = text.length > 10 ? text.slice(11, 16) : ''
  return `${fmtDate(text)}${time ? ` ${time}` : ''}`
}
export const todayIso = clubToday
function toDisplay(iso) { return iso ? fmtDate(iso) : '' }
function toIso(text) {
  const digits = text.replace(/\D/g, '')
  if (digits.length !== 8) return ''
  const en = currentLang() === 'en'
  const [a, b, y] = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)]
  const [d, m] = en ? [b, a] : [a, b]
  const date = new Date(`${y}-${m}-${d}T00:00:00`)
  if (Number.isNaN(date.getTime()) || date.getDate() !== Number(d)) return ''
  return `${y}-${m}-${d}`
}
function mask(text) {
  const digits = text.replace(/\D/g, '').slice(0, 8)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/')
}

const OTHER = '__other__'
/** Ô chọn có thêm lựa chọn "Khác (tự nhập)": chọn trong danh mục hoặc gõ giá trị riêng (giống ngựa, màu lông). */
export function ChoiceInput({ label, required, error, value, onChange, options, placeholder, otherPlaceholder, maxLength = 50 }) {
  const known = options.some(([v]) => v === value)
  const [typing, setTyping] = useState(Boolean(value) && !known)
  const custom = typing || (Boolean(value) && !known)
  return <Field label={label} required={required} error={error}>
    <select className="input" value={custom ? OTHER : value ?? ''} aria-required={required} aria-invalid={Boolean(error) && !custom}
      onChange={(e) => { const v = e.target.value; if (v === OTHER) { setTyping(true); onChange?.('') } else { setTyping(false); onChange?.(v) } }}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      <option value={OTHER}>Khác (tự nhập)</option>
    </select>
    {custom && <input className="input choice-other" value={value ?? ''} placeholder={otherPlaceholder} maxLength={maxLength} autoFocus
      aria-label={otherPlaceholder} aria-invalid={Boolean(error)} onChange={(e) => onChange?.(e.target.value)} />}
  </Field>
}

export function DateField({ label, required, error, value, onChange, max, min }) {
  const [text, setText] = useState(toDisplay(value))
  const [lastValue, setLastValue] = useState(value)
  const [textError, setTextError] = useState('')
  const native = useRef(null)
  if (value !== lastValue) { setLastValue(value); setText(toDisplay(value)); if (value) setTextError('') }
  return <Field label={label} required={required} error={textError || error}>
    <div className="date-field">
      <input className="input" inputMode="numeric" placeholder={currentLang() === 'en' ? 'mm/dd/yyyy' : 'dd/mm/yyyy'}
        value={text} aria-invalid={Boolean(textError || error)}
        onChange={(e) => { const next = mask(e.target.value); setText(next); setTextError(''); onChange?.(toIso(next)) }}
        onBlur={() => setTextError(checkDateText(text, currentLang() === 'en'))} />
      <button type="button" className="ic" aria-label="Chọn ngày" onClick={() => native.current?.showPicker?.()}><Icon name="cal" size={17} /></button>
      <input ref={native} type="date" className="date-native" tabIndex={-1} aria-hidden="true" value={value || ''} max={max} min={min}
        onChange={(e) => { setTextError(''); onChange?.(e.target.value) }} />
    </div>
  </Field>
}

/** Giờ 24h dạng HH:mm: bấm vào ô để chọn giờ và phút trên bảng (kiểu đồng hồ báo thức), hoặc gõ trực tiếp. */
export function TimeField({ label, required, error, value, onChange }) {
  const [text, setText] = useState(value || '')
  const [lastValue, setLastValue] = useState(value)
  const [textError, setTextError] = useState('')
  const wrap = useRef(null)
  if (value !== lastValue) { setLastValue(value); setText(value || ''); if (value) setTextError('') }
  const mask = (raw) => { const d = raw.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d }
  const parse = (t) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : '')
  const open = (toggle = true) => openTimePicker({ anchor: wrap.current, key: wrap.current, toggle, get: () => text,
    set: (v) => { setText(v); setTextError(''); onChange?.(v) } })
  return <Field label={label} required={required} error={textError || error}>
    <div className="date-field" ref={wrap}>
      <input className="input" inputMode="numeric" placeholder="Chọn giờ" value={text} aria-invalid={Boolean(textError || error)}
        onClick={() => open(false)}
        onChange={(e) => { const next = mask(e.target.value); setText(next); setTextError(''); onChange?.(parse(next)) }}
        onBlur={() => setTextError(text && !parse(text) ? 'Giờ không hợp lệ. Vui lòng chọn lại trên bảng giờ.' : '')} />
      <button type="button" className="ic" aria-label="Chọn giờ" onClick={() => open()}><Icon name="clock" size={17} /></button>
    </div>
  </Field>
}

export function Badge({ kind, children }) { return <span className={`badge b-${kind}`}>{children}</span> }

export function Dl({ items, cols }) {
  return <dl className="dl" style={cols ? { gridTemplateColumns: `repeat(${cols},minmax(0,1fr))` } : undefined}>
    {items.filter(Boolean).map(([k, v, full]) => <div key={k} className={full ? 'full' : ''}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}
  </dl>
}

export function SectionTitle({ icon, children }) {
  return <h2 className="stitle"><span className="sicon"><Icon name={icon} /></span>{children}</h2>
}

export function Timeline({ steps }) {
  return <ul className="timeline">{steps.map(([state, title, note]) =>
    <li key={title} className={state}><i /><div><b>{title}</b>{note && <small>{note}</small>}</div></li>)}</ul>
}

export function Notice({ kind = '', title, children, style }) {
  return <div className={`notice ${kind}`} style={style} role={kind === 'bad' ? 'alert' : 'status'}>
    {title && <b>{title}</b>}{children}
  </div>
}

export function Dialog({ title, children, actions, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
    <div className="dialog"><h2>{title}</h2>{children}<div className="actions">{actions}</div></div>
  </div>
}

export function HorseCard({ name, meta, badge, image }) {
  return <div className="ctx"><div className="who">
    {image ? <img src={image} alt="" /> : <span className="thumb" style={{ width: 64, height: 64 }} />}
    <div><h2>{name}</h2><p>{meta}</p></div></div>{badge}</div>
}

export function DocRow({ name, meta, kind = 'PDF', action }) {
  return <div className="doc"><span className={`ft ${kind === 'PDF' ? '' : 'img'}`}>{kind}</span>
    <div><b>{name}</b><small>{meta}</small></div>{action}</div>
}

export function Loading() { return <div className="loading" role="status">Đang tải...</div> }

export function errorText(error) {
  if (!error) return ''
  return error instanceof Error ? error.message : String(error)
}

/** Tải dữ liệu: trả {data, error, loading, reload}. */
export function useLoad(loader, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true, keys: null })
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])
  const keys = [...deps, tick]
  useEffect(() => {
    let active = true
    loader().then((data) => { if (active) setState({ data, error: null, loading: false, keys }) })
      .catch((error) => { if (active) setState({ data: null, error, loading: false, keys }) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const current = state.keys?.length === keys.length && state.keys.every((value, index) => Object.is(value, keys[index]))
  return { ...(current ? state : { data: null, error: null, loading: true }), reload }
}

/** Gọi thao tác: tránh bấm 2 lần, giữ lỗi để hiện. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const running = useRef(false)
  const run = useCallback(async (fn) => {
    if (running.current) return undefined
    running.current = true
    setBusy(true); setError('')
    try { return await fn() } catch (e) { setError(errorText(e)); return undefined }
    finally { running.current = false; setBusy(false) }
  }, [])
  return { busy, error, setError, run }
}
