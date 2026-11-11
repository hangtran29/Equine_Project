// Nhật ký hệ thống: ai đã làm gì, lúc nào trong câu lạc bộ (quyền AUDIT_VIEW). Chỉ xem, không sửa.
import { useEffect, useState } from 'react'
import { apiGet } from '../api/apiClient.ts'
import { currentLang } from '../i18n/runtime.js'
import { ACTIONS, GROUPS, actionGroup, actionLabel, codeLabel, entityLabel, groupLabel } from './auditLabels.js'
import { Crumb, DateField, Heading, Loading, Notice, errorText, fmtDateTime, useLoad } from './ui.jsx'
import './f1.css'

const PAGE = 50
const GROUP_KIND = { account: 'arch', horse: 'ok', training: 'wait', medical: 'bad', care: 'draft', other: 'draft' }

// Tên dễ đọc cho các khóa hay gặp trong phần chi tiết; khóa ...ID và khóa lạ thì bỏ qua cho gọn
const DETAIL_KEYS = {
  Reason: ['Lý do', 'Reason'], Note: ['Ghi chú', 'Note'], VetNote: ['Ghi chú bác sĩ', 'Vet note'], ReviewNote: ['Nhận xét', 'Review note'],
  Added: ['Thêm', 'Added'], Removed: ['Bỏ', 'Removed'], Fields: ['Thông tin đã sửa', 'Changed fields'], RoleCode: ['Chức vụ', 'Role'],
  Via: ['Qua', 'Via'], Topic: ['Chủ đề', 'Topic'], Quantity: ['Số lượng', 'Quantity'], LeftDate: ['Ngày rời câu lạc bộ', 'Left on'],
  Shift: ['Ca', 'Shift'], ShiftDays: ['Số ngày', 'Days'], ItemCount: ['Số dòng', 'Items'], MovedTaskCount: ['Số việc đã chuyển', 'Tasks moved'],
  Status: ['Trạng thái', 'Status'], Decision: ['Quyết định', 'Decision'], RoleCodes: ['Chức vụ', 'Roles'],
}

// Mỗi giá trị là một mục riêng (span) để bộ dịch của trang dịch được từng tên quyền / chức vụ
function show(value) {
  if (value === null || value === undefined || value === '') return ['—']
  if (Array.isArray(value)) return value.length ? value.flatMap(show) : ['—']
  if (typeof value === 'object') return Object.entries(value).map(([k, v]) => `${codeLabel(k)}: ${show(v).join(', ')}`)
  return [codeLabel(String(value))]
}

function detailParts(details) {
  if (!details) return []
  let data
  try { data = JSON.parse(details) } catch { return [['', [details]]] }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [['', show(data)]]
  const en = currentLang() === 'en'
  return Object.entries(data).filter(([k, v]) => DETAIL_KEYS[k] && v !== null && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => [DETAIL_KEYS[k][en ? 1 : 0], show(v)])
}

const groupCodes = (group) => Object.keys(ACTIONS).filter((code) => ACTIONS[code][0] === group)

const fetchLogs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null))
  return apiGet(`/audit-logs?${s}`)
}

export default function AuditLogPage() {
  const [group, setGroup] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [nameText, setNameText] = useState('')
  const [name, setName] = useState('')
  const [page, setPage] = useState(0)
  const en = currentLang() === 'en'

  // Gõ tên xong 0,4 giây mới tìm, đỡ gọi máy chủ mỗi lần bấm phím
  useEffect(() => { const t = setTimeout(() => { setName(nameText.trim()); setPage(0) }, 400); return () => clearTimeout(t) }, [nameText])

  const badRange = from && to && from > to
  const logs = useLoad(() => (badRange ? Promise.resolve(null)
    : fetchLogs({ ActionType: action || (group ? groupCodes(group).join(',') : ''), UserName: name, From: from, To: to, Limit: PAGE, Offset: page * PAGE })), [action, group, name, from, to, page, badRange])
  const items = logs.data?.Items || []
  const total = logs.data?.Total || 0
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const actionsInGroup = Object.keys(ACTIONS).filter((code) => !group || ACTIONS[code][0] === group)
    .sort((a, b) => actionLabel(a).localeCompare(actionLabel(b), en ? 'en' : 'vi'))

  const reset = () => { setGroup(''); setAction(''); setFrom(''); setTo(''); setNameText(''); setName(''); setPage(0) }
  const change = (setter) => (value) => { setter(value); setPage(0) }

  return <main className="page-content f1">
    <Crumb items={[['Nhật ký hệ thống']]} />
    <Heading title="Nhật ký hệ thống" />
    <p className="hint" style={{ marginTop: 8 }}>Ghi lại ai đã làm gì và lúc nào trong câu lạc bộ. Nhật ký chỉ để xem, không sửa hay xóa được.</p>

    <section className="panel" style={{ marginTop: 24 }}>
      <div className="audit-filters">
        <label className="field"><span>Người thực hiện</span>
          <input className="input" value={nameText} placeholder="Nhập tên để tìm" onChange={(e) => setNameText(e.target.value)} /></label>
        <label className="field"><span>Nhóm thao tác</span>
          <select className="input" value={group} onChange={(e) => { setGroup(e.target.value); setAction(''); setPage(0) }}>
            <option value="">Tất cả</option>
            {GROUPS.map(([key]) => <option key={key} value={key} data-no-translate>{groupLabel(key)}</option>)}
          </select></label>
        <label className="field"><span>Thao tác</span>
          <select className="input" value={action} onChange={(e) => change(setAction)(e.target.value)}>
            <option value="">Tất cả</option>
            {actionsInGroup.map((code) => <option key={code} value={code} data-no-translate>{actionLabel(code)}</option>)}
          </select></label>
        <DateField label="Từ ngày" value={from} onChange={change(setFrom)} max={to || undefined} />
        <DateField label="Đến ngày" value={to} onChange={change(setTo)} min={from || undefined} error={badRange ? 'Đến ngày phải sau Từ ngày.' : ''} />
        <div className="field"><span aria-hidden>&nbsp;</span>
          <button type="button" className="btn sec" onClick={reset}>Xóa bộ lọc</button></div>
      </div>

      {logs.loading ? <Loading /> : logs.error ? <Notice kind="bad">{errorText(logs.error)}</Notice>
        : !items.length ? <p className="empty">Không có thao tác nào khớp bộ lọc.</p>
          : <div className="table-wrap"><table className="table audit-table">
            <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Thao tác</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead>
            <tbody>{items.map((row) => {
              const parts = detailParts(row.Details)
              return <tr key={row.AuditLogID}>
                <td className="nowrap">{fmtDateTime(row.ActionTime)}</td>
                <td data-no-translate>{row.UserName || (en ? 'System' : 'Hệ thống')}</td>
                <td data-no-translate><span className={`badge b-${GROUP_KIND[actionGroup(row.ActionType)]}`}>{actionLabel(row.ActionType)}</span></td>
                <td data-no-translate>{entityLabel(row.EntityName)} #{row.EntityID}</td>
                <td className="audit-detail">{parts.length ? parts.map(([label, value], i) =>
                  <div key={i}>{label && <b data-no-translate>{label}: </b>}{value.map((v, j) => <span key={j}>{j ? ', ' : ''}<span>{v}</span></span>)}</div>) : '—'}</td>
              </tr>
            })}</tbody></table></div>}

      {!logs.loading && !logs.error && total > 0 && <div className="audit-pager">
        <span>Tổng <b>{total}</b> thao tác · trang <b>{page + 1}</b>/<b>{pages}</b></span>
        <button type="button" className="btn sec" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Trang trước</button>
        <button type="button" className="btn sec" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Trang sau</button>
      </div>}
    </section>
  </main>
}
