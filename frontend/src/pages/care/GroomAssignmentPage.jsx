// Head Trainer: giao Groom phụ trách từng ngựa. Việc tự sinh chưa làm của ngựa chuyển theo Groom mới.
import { useMemo, useState } from 'react'
import { clearHorseGroom, getApprovedHorses, getCareTasks, getGrooms, getHorseGroom, setHorseGroom } from '../../api/careApi.ts'
import { CarePage, Loading } from './careShared.jsx'
import { fmtDateTime, todayText, useLoad, useSubmit } from './careUtils.js'

function Row({ horse, grooms, onSaved }) {
  const [value, setValue] = useState(horse.groom ? String(horse.groom.GroomID) : '')
  const action = useSubmit()
  const changed = value !== (horse.groom ? String(horse.groom.GroomID) : '')
  async function save() {
    const ok = await action.run(() => (value ? setHorseGroom(horse.HorseID, value) : clearHorseGroom(horse.HorseID)),
      value ? 'Đã giao.' : 'Đã bỏ phân công.')
    if (ok) onSaved()
  }
  return <tr>
    <td><strong>{horse.HorseName}</strong><small className="care-cell-sub">{horse.HorseCode || '—'}</small></td>
    <td>{horse.groom ? <>{horse.groom.GroomName}<small className="care-cell-sub">từ {fmtDateTime(horse.groom.AssignedAt)}</small></>
      : <span className="care-muted">Chưa phân công · việc được giữ để Manager xử lý</span>}</td>
    <td>
      <select aria-label={`Groom phụ trách ${horse.HorseName}`} value={value} onChange={e => setValue(e.target.value)}>
        <option value="">— Không giao cố định —</option>
        {grooms.map(g => <option key={g.UserID} value={g.UserID}>{g.FullName} ({g.todayCount} việc hôm nay)</option>)}
      </select>
      {action.error && <small className="error-message" role="alert">{action.error}</small>}
    </td>
    <td className="care-cell-actions">
      <button className="button" type="button" disabled={!changed || action.busy} onClick={save}>{action.busy ? 'Đang lưu…' : 'Lưu'}</button>
      {action.notice && !changed && <small className="care-ok" role="status">{action.notice}</small>}
    </td>
  </tr>
}

export default function GroomAssignmentPage() {
  const data = useLoad(async () => {
    const [horses, grooms, tasks] = await Promise.all([getApprovedHorses(), getGrooms(), getCareTasks({ Date: todayText() })])
    const links = await Promise.all(horses.map(h => getHorseGroom(h.HorseID)))
    return {
      horses: horses.map((h, i) => ({ ...h, groom: links[i] })),
      grooms: grooms.map(g => ({ ...g, todayCount: tasks.filter(t => t.GroomID === g.UserID).length })),
    }
  }, [])
  const { horses = [], grooms = [] } = data.data || {}
  const unassigned = useMemo(() => horses.filter(h => !h.groom).length, [horses])

  return <CarePage crumb="Groom phụ trách" eyebrow="QUẢN LÝ" title="Groom phụ trách ngựa"
    description="Manager phân công Groom cho từng ngựa. Khi đổi người, mọi việc chưa hoàn thành được chuyển cho Groom mới; lịch sử việc đã làm được giữ nguyên.">
    <section className="care-stats">
      <article><span>Ngựa đã tiếp nhận</span><strong>{horses.length}</strong></article>
      <article className={unassigned ? 'care-stat-alert' : ''}><span>Chưa có Groom cố định</span><strong>{unassigned}</strong></article>
      <article><span>Groom đang làm việc</span><strong>{grooms.length}</strong></article>
    </section>
    <Loading state={data} isEmpty={!horses.length} empty={['Chưa có ngựa nào được tiếp nhận']}>
      {!grooms.length && <div className="alert-banner" role="alert">Câu lạc bộ chưa có tài khoản Groom đang hoạt động. Nhờ Quản lý tạo tài khoản Groom trước.</div>}
      <section className="table-card">
        <div className="table-wrapper">
          <table className="data-table care-table">
            <thead><tr><th>Ngựa</th><th>Groom hiện tại</th><th>Giao cho</th><th /></tr></thead>
            <tbody>{horses.map(h => <Row key={`${h.HorseID}-${h.groom?.GroomID || ''}`} horse={h} grooms={grooms} onSaved={data.reload} />)}</tbody>
          </table>
        </div>
      </section>
    </Loading>
  </CarePage>
}
