import { useState } from 'react'
import { useResource, useAction } from '../../components/common/useOperations.js'
import { DataState, Feedback, Field } from '../../components/common/OperationUI.jsx'
import { itemStatuses, itemTypes } from './managerLabels.js'

export default function InventoryPage() {
  const data = useResource('/inventory-items', true)
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const rows = (data.value || []).filter(r => (!type || r.ItemType === type) && (!status || r.Status === status) && r.ItemName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  return <main className="page-content manager-workspace"><header className="page-heading"><div><h1>Vật tư y tế và thức ăn</h1><p>Tồn kho và yêu cầu cấp vật tư trong câu lạc bộ.</p></div><button className="button button-secondary" disabled={data.loading} onClick={data.reload}>Làm mới</button></header>
    <section className="panel"><div className="vet-toolbar"><Field label="Tìm vật tư" name="search" type="search" value={search} onChange={e => setSearch(e.target.value)} /><Field label="Loại vật tư" name="type" value={type} onChange={e => setType(e.target.value)} options={[["", 'Tất cả'], ...Object.entries(itemTypes)]} /><Field label="Trạng thái" name="status" value={status} onChange={e => setStatus(e.target.value)} options={[["", 'Tất cả'], ...Object.entries(itemStatuses)]} /><button className="button" onClick={() => { setCreating(!creating); setEditing(null) }}>Thêm vật tư</button></div>
      <DataState data={data}>{!rows.length ? <p>Chưa có vật tư phù hợp.</p> : <div className="table-wrapper"><table className="horse-table"><thead><tr><th>Vật tư</th><th>Loại</th><th>Tồn kho</th><th>Mức tối thiểu</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{rows.map(r => <tr key={r.InventoryItemID}><td>{r.ItemName}</td><td>{itemTypes[r.ItemType]}</td><td>{r.Quantity} {r.Unit}</td><td>{r.MinimumQuantity} {r.Unit}</td><td>{itemStatuses[r.Status]}</td><td><button className="button button-secondary" onClick={() => { setEditing(r); setCreating(false) }}>Chi tiết / điều chỉnh</button></td></tr>)}</tbody></table></div>}</DataState>
    </section>
    {(creating || editing) && <InventoryEditor key={editing?.InventoryItemID || 'new'} item={editing} onChanged={() => { setEditing(null); setCreating(false); data.reload() }} onClose={() => { setEditing(null); setCreating(false) }} />}
    <InventoryRequests onStockChanged={data.reload} />
  </main>
}

function InventoryEditor({ item, onChanged, onClose }) {
  const action = useAction(onChanged)
  const base = item ? `/inventory-items/${item.InventoryItemID}` : '/inventory-items'
  return <section className="panel"><h2>{item ? `Điều chỉnh ${item.ItemName}` : 'Thêm vật tư'}</h2><Feedback action={action} /><form className="vet-operation-form" onSubmit={e => { e.preventDefault(); void action.run(base, Object.fromEntries(new FormData(e.currentTarget)), item ? 'PATCH' : 'POST') }}><fieldset className="vet-form-fields" disabled={action.busy}>
    <Field label="Tên vật tư" name="ItemName" action={action} defaultValue={item?.ItemName || ''} required maxLength={150} /><Field label="Loại" name="ItemType" action={action} defaultValue={item?.ItemType || 'Food'} options={Object.entries(itemTypes)} />
    <Field label="Đơn vị" name="Unit" action={action} defaultValue={item?.Unit || ''} required maxLength={30} />
    {!item && <Field label="Số lượng ban đầu" name="Quantity" action={action} type="number" defaultValue="0" min="0" max="9999999999.99" step="0.01" required />}
    <Field label="Mức tồn tối thiểu" name="MinimumQuantity" action={action} type="number" defaultValue={item?.MinimumQuantity || '0'} min="0" max="9999999999.99" step="0.01" required /><button className="button">Lưu vật tư</button>
  </fieldset></form>
  {item && <><form className="vet-operation-form" onSubmit={e => { e.preventDefault(); void action.run(`${base}/stock`, Object.fromEntries(new FormData(e.currentTarget))) }}><fieldset className="vet-form-fields" disabled={action.busy || item.Status === 'Inactive'}><legend>Điều chỉnh tồn kho · hiện có {item.Quantity} {item.Unit}</legend><Field label="Số lượng thay đổi (số âm để giảm)" name="Change" action={action} type="number" step="0.01" required /><Field label="Lý do điều chỉnh" name="Note" action={action} maxLength={500} required /><button className="button">Ghi nhận điều chỉnh</button></fieldset></form>
    <button className="button button-secondary" disabled={action.busy} onClick={() => action.run(base, item.Status === 'Inactive' ? { Reactivate: true } : { Status: 'Inactive' }, 'PATCH')}>{item.Status === 'Inactive' ? 'Sử dụng lại vật tư' : 'Ngưng sử dụng vật tư'}</button></>}
    <button className="button button-secondary" disabled={action.busy} onClick={onClose}>Đóng</button>
  </section>
}

function InventoryRequests({ onStockChanged }) {
  const [status, setStatus] = useState('Pending')
  const data = useResource(`/inventory-requests${status ? `?Status=${status}` : ''}`, true)
  return <section className="panel"><h2>Yêu cầu cấp vật tư</h2><div className="vet-toolbar"><Field label="Lọc yêu cầu" name="request-status" value={status} onChange={e => setStatus(e.target.value)} options={[["", 'Tất cả'], ['Pending', 'Chờ duyệt'], ['Approved', 'Đã duyệt'], ['Rejected', 'Đã từ chối'], ['Cancelled', 'Đã hủy']]} /><button className="button button-secondary" disabled={data.loading} onClick={data.reload}>Làm mới yêu cầu</button></div>
    <DataState data={data}>{!data.value?.length && <p>Không có yêu cầu phù hợp.</p>}{data.value?.map(r => <RequestCard key={r.InventoryRequestID} request={r} onChanged={() => { data.reload(); onStockChanged() }} />)}</DataState></section>
}

function RequestCard({ request: r, onChanged }) {
  const action = useAction(onChanged)
  const base = `/inventory-requests/${r.InventoryRequestID}`
  return <article className="vet-amendment"><h3>Yêu cầu #{r.InventoryRequestID} · {r.RequestedByName}</h3><p>{r.Reason}</p><p>{({ Pending: 'Chờ duyệt', Approved: 'Đã duyệt', Rejected: 'Đã từ chối', Cancelled: 'Đã hủy' })[r.Status]}</p><Feedback action={action} />
    <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void action.run(`${base}/approve`, { Note: f.get('approvalNote'), Items: r.Items.map(i => ({ InventoryItemID: i.InventoryItemID, ApprovedQuantity: f.get(String(i.InventoryItemID)) })) }) }}>
      <fieldset className="vet-form-fields" disabled={action.busy || r.Status !== 'Pending'}>
        {r.Items.map(i => <div key={i.InventoryRequestItemID}><p>{i.ItemName} · Yêu cầu {i.RequestedQuantity} {i.Unit}{i.ApprovedQuantity != null && ` · Đã cấp ${i.ApprovedQuantity} ${i.Unit}`}</p>{i.Note && <p>{i.Note}</p>}{r.Status === 'Pending' && <Field label={`Số lượng duyệt · ${i.ItemName}`} name={String(i.InventoryItemID)} type="number" min="0" max={i.RequestedQuantity} step="0.01" required defaultValue={i.RequestedQuantity} />}</div>)}
        {r.Status === 'Pending' && <><Field label="Lý do duyệt" name="approvalNote" action={action} required maxLength={1000} /><button className="button">Duyệt và xuất kho</button></>}
      </fieldset>
    </form>
    {r.Status === 'Pending' && <form className="vet-operation-form" onSubmit={e => { e.preventDefault(); void action.run(`${base}/reject`, Object.fromEntries(new FormData(e.currentTarget))) }}><fieldset className="vet-form-fields" disabled={action.busy}><Field label="Lý do từ chối" name="Note" action={action} required maxLength={1000} /><button className="button button-secondary">Từ chối yêu cầu</button></fieldset></form>}{r.RejectNote && <p>Lý do từ chối: {r.RejectNote}</p>}
  </article>
}
