// Yêu cầu hỗ trợ: hộp thoại gửi (mọi chức vụ, nút "Gửi yêu cầu hỗ trợ" cuối menu) và trang xử lý của Quản lý (HS01, HS02).
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import * as api from './api.js'
import { Badge, Crumb, Dl, Heading, Icon, Loading, Notice, SectionTitle, SelectInput, TextArea, errorText, fmtDateTime, useLoad } from './ui.jsx'
import { checkSelect, checkText, runChecks, serverFieldErrors } from '../utils/validation.js'

const initials = (name = '') => name.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase()
const formatPhone = (p = '') => (/^\d{10}$/.test(p) ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p)

export function SupportDialog({ onClose }) {
  const options = useLoad(() => api.getSupportOptions(), [])
  const [form, setForm] = useState({ Topic: '', HorseID: '', Content: '' })
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const set = (key) => (value) => { setForm((f) => ({ ...f, [key]: value })); setErrors((e) => ({ ...e, [key]: '' })) }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit() {
    const found = runChecks({ Topic: () => checkSelect(form.Topic), Content: () => checkText(form.Content, 1000) })
    setErrors(found)
    if (Object.keys(found).length) return
    setBusy(true); setFailure('')
    try {
      await api.createSupportRequest({ Topic: form.Topic, HorseID: form.HorseID ? Number(form.HorseID) : null, Content: form.Content })
      setSent(true)
    } catch (e) {
      const fields = serverFieldErrors(e)
      if (Object.keys(fields).length) setErrors(fields); else setFailure(errorText(e))
    } finally { setBusy(false) }
  }

  const contact = options.data?.Contact
  return createPortal(<div className="f1 f1-portal"><div className="overlay" role="dialog" aria-modal="true" aria-label="Liên hệ hỗ trợ" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <div className="dialog" style={{ width: 600 }}>
      <h2>Liên hệ hỗ trợ</h2>
      {sent ? <>
        <Notice kind="ok" title="Yêu cầu đã được gửi">Quản lý câu lạc bộ sẽ phản hồi qua chuông thông báo của bạn.</Notice>
        <div className="actions"><button type="button" className="btn pri" onClick={onClose}>Đóng</button></div>
      </> : <>
        <p style={{ color: '#6b6f62' }}>Gửi yêu cầu đến Quản lý câu lạc bộ. Phản hồi sẽ được gửi về chuông thông báo của bạn.</p>
        {options.loading ? <Loading /> : options.error ? <Notice kind="bad">{errorText(options.error)}</Notice> : <>
          {contact && <div className="contact"><span className="av">{initials(contact.FullName)}</span>
            <div><b>{contact.FullName}</b><small>{contact.Role}</small></div>
            {contact.Phone && <a className="link" href={`tel:${contact.Phone}`}>{formatPhone(contact.Phone)}</a>}
            {contact.Email && <a className="link" href={`mailto:${contact.Email}`}>{contact.Email}</a>}</div>}
          <div className="form" style={{ maxWidth: 'none', marginTop: 14 }}>
            <SelectInput label="Chủ đề" required value={form.Topic} onChange={set('Topic')} error={errors.Topic} placeholder="Chọn chủ đề"
              options={(options.data?.Topics || []).map((t) => [t.Value, t.Label])} />
            {(options.data?.Horses || []).length > 0 && <SelectInput label="Ngựa liên quan" value={form.HorseID} onChange={set('HorseID')} error={errors.HorseID} placeholder="Không liên quan đến ngựa cụ thể"
              options={options.data.Horses.map((h) => [String(h.HorseID), h.HorseName])} />}
            <TextArea label="Nội dung" required value={form.Content} onChange={set('Content')} error={errors.Content} rows={4} maxLength={1000} />
          </div>
          {failure && <Notice kind="bad">{failure}</Notice>}
        </>}
        <div className="actions">
          <button type="button" className="btn sec" onClick={onClose}>Hủy</button>
          <button type="button" className="btn pri" disabled={busy || options.loading || !!options.error} onClick={submit}>Gửi yêu cầu</button>
        </div>
      </>}
    </div>
  </div></div>, document.body)
}

/** Khối "Cần hỗ trợ?" cuối menu bên trái (không hiện với Quản lý câu lạc bộ, người nhận yêu cầu). */
export function SidebarSupport() {
  const [open, setOpen] = useState(false)
  return <>
    <div className="sidebar-support">
      <strong>Cần hỗ trợ?</strong>
      <span>Liên hệ quản lý câu lạc bộ</span>
      <button type="button" className="sup-btn" onClick={() => setOpen(true)}>Gửi yêu cầu hỗ trợ</button>
    </div>
    {open && <SupportDialog onClose={() => setOpen(false)} />}
  </>
}

const STATUS = { Open: ['wait', 'Chờ xử lý'], Resolved: ['ok', 'Đã xử lý'] }

export function SupportRequestsPage() {
  const [params] = useSearchParams()
  const focusId = Number(params.get('id')) || null          // mở từ thông báo
  const [pickedStatus, setStatus] = useState(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(focusId)
  const all = useLoad(() => api.getSupportRequests(), [])
  const rows = useMemo(() => all.data || [], [all.data])
  const status = pickedStatus ?? rows.find((r) => r.SupportRequestID === focusId)?.Status ?? 'Open'
  const count = (s) => rows.filter((r) => r.Status === s).length
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => r.Status === status && (!q || [r.RequesterName, r.Content, r.HorseName, r.TopicLabel].some((v) => v?.toLowerCase().includes(q))))
  }, [rows, status, search])

  const current = shown.find((r) => r.SupportRequestID === selected) || shown[0]

  return <main className="page-content f1">
    <Crumb items={[['Yêu cầu hỗ trợ']]} />
    <Heading title="Yêu cầu hỗ trợ" />
    <section className="panel" style={{ marginTop: 48 }}>
      <div className="toolbar">
        <div className="tabs" role="tablist">{Object.entries(STATUS).map(([s, [, label]]) =>
          <span key={s} role="tab" tabIndex={0} aria-selected={status === s} className={`tab ${status === s ? 'on' : ''}`}
            onClick={() => { setStatus(s); setSelected(null) }} onKeyDown={(e) => { if (e.key === 'Enter') { setStatus(s); setSelected(null) } }}>{label} <em>{count(s)}</em></span>)}</div>
        <label className="search"><Icon name="search" size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo người gửi, nội dung" aria-label="Tìm kiếm yêu cầu hỗ trợ" /></label>
      </div>
      {all.loading ? <Loading /> : all.error ? <Notice kind="bad">{errorText(all.error)}</Notice> : !shown.length
        ? <p className="empty">{status === 'Open' ? 'Không có yêu cầu nào đang chờ xử lý.' : 'Chưa có yêu cầu nào đã xử lý.'}</p>
        : <div className="two" style={{ gridTemplateColumns: 'minmax(0,1fr) 400px', alignItems: 'start' }}>
          <table><thead><tr><th>Người gửi</th><th>Chủ đề</th><th>Thời điểm</th><th>Trạng thái</th></tr></thead>
            <tbody>{shown.map((r) => <tr key={r.SupportRequestID} className={r === current ? 'sel-row' : ''} style={{ cursor: 'pointer' }}
              tabIndex={0} onClick={() => setSelected(r.SupportRequestID)} onKeyDown={(e) => { if (e.key === 'Enter') setSelected(r.SupportRequestID) }}>
              <td style={{ whiteSpace: 'nowrap' }}><b>{r.RequesterName}</b><small>{r.RequesterRole}</small></td>
              <td><b style={{ fontWeight: 600 }}>{r.TopicLabel}</b><small className="clamp2" style={{ maxWidth: 260 }}>{r.Content}</small></td>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.CreatedAt)}</td>
              <td><Badge kind={STATUS[r.Status][0]}>{STATUS[r.Status][1]}</Badge></td></tr>)}</tbody></table>
          {current && <RequestDetail key={current.SupportRequestID} request={current} onDone={() => { all.reload(); api.notifyNotificationsChanged() }} />}
        </div>}
    </section>
  </main>
}

function RequestDetail({ request: r, onDone }) {
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  async function resolve() {
    const message = checkText(reply, 1000)
    setError(message)
    if (message) return
    setBusy(true); setFailure('')
    try { await api.resolveSupportRequest(r.SupportRequestID, reply); onDone() } catch (e) {
      const fields = serverFieldErrors(e)
      if (fields.Response) setError(fields.Response); else setFailure(errorText(e))
    } finally { setBusy(false) }
  }
  return <div className="card">
    <SectionTitle icon="req">{r.TopicLabel}</SectionTitle>
    <Dl cols={2} items={[['Người gửi', `${r.RequesterName} · ${r.RequesterRole}`, 1], ['Ngựa liên quan', r.HorseName || 'Không có'], ['Thời điểm', fmtDateTime(r.CreatedAt)]]} />
    <div className="quote" style={{ marginTop: 12 }}><small>Nội dung</small><p>{r.Content}</p></div>
    {r.Status === 'Open' ? <>
      <div className="form" style={{ maxWidth: 'none' }}>
        <TextArea label="Phản hồi" required value={reply} onChange={(v) => { setReply(v); setError('') }} error={error} rows={3} maxLength={1000} />
      </div>
      {failure && <Notice kind="bad">{failure}</Notice>}
      <div className="actions"><button type="button" className="btn pri" disabled={busy} onClick={resolve}><Icon name="check" size={16} /> Gửi phản hồi và đóng yêu cầu</button></div>
    </> : <div className="quote info" style={{ marginTop: 12 }}><small>Phản hồi của {r.ResolvedByName} · {fmtDateTime(r.ResolvedAt)}</small><p>{r.Response}</p></div>}
  </div>
}
