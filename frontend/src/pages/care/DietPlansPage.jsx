// Head Trainer: lập khẩu phần theo giai đoạn tập của từng ngựa, theo dõi Vet duyệt / trả về.
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { approveDietPlan, createDietPlan, getApprovedHorses, getDietContext, getHorseDietPlans, updateDietPlan } from '../../api/careApi.ts'
import { Badge, CarePage, Loading, Notice } from './careShared.jsx'
import { DIET_STATUS, useLoad, useSubmit } from './careUtils.js'
import { DietContextPanel, DietPlanCard } from './dietShared.jsx'
import DietPlanForm from './DietPlanForm.jsx'

function horseFlag(context) {
  if (!context) return ['', 'muted']
  if (!context.CurrentDiet) return ['Chưa có khẩu phần', 'danger']
  if (context.Notes?.some(note => /giáo án/i.test(note))) return ['Cần xem lại', 'warning']
  return ['Đã có khẩu phần', 'success']
}

export default function DietPlansPage() {
  const [params, setParams] = useSearchParams()
  const horseId = params.get('HorseID') || ''
  const [form, setForm] = useState(null)   // {mode, plan?, copyFrom?}
  const [message, setMessage] = useState('')
  const decision = useSubmit()

  const horses = useLoad(async () => {
    const rows = await getApprovedHorses()
    const contexts = await Promise.all(rows.map(h => getDietContext(h.HorseID)))
    return rows.map((h, i) => ({ ...h, context: contexts[i] }))
  }, [])
  const detail = useLoad(() => (horseId
    ? Promise.all([getDietContext(horseId), getHorseDietPlans(horseId)])
    : Promise.resolve(null)), [horseId])

  const [context, plans] = detail.data || [null, []]
  const sortedPlans = useMemo(() => [...(plans || [])].sort((a, b) =>
    String(b.CreatedAt).localeCompare(String(a.CreatedAt))), [plans])
  const current = sortedPlans.find(p => p.DietPlanID === context?.CurrentDiet?.DietPlanID)
  const waiting = sortedPlans.find(p => p.Status === 'Pending' || p.Status === 'Rejected')

  function choose(id) {
    setForm(null); setMessage('')
    setParams(id ? { HorseID: String(id) } : {})
  }
  function saved(text) {
    setForm(null); setMessage(text); detail.reload(); horses.reload()
  }

  return <CarePage crumb="Khẩu phần ăn" eyebrow="HUẤN LUYỆN VIÊN TRƯỞNG" title="Khẩu phần ăn theo giai đoạn tập"
    description="Lập và chốt khẩu phần theo giáo án, kết quả tập và hạn chế y tế của Vet. Khẩu phần chỉ áp dụng sau khi Head Trainer chốt.">
    <div className="care-split">
      <aside className="panel care-horse-list" aria-label="Danh sách ngựa">
        <h2>Ngựa đã tiếp nhận</h2>
        <Loading state={horses} isEmpty={!horses.data?.length} empty={['Chưa có ngựa nào được tiếp nhận']}>
          <ul>{(horses.data || []).map(h => {
            const [text, tone] = horseFlag(h.context)
            return <li key={h.HorseID}>
              <button type="button" className={String(h.HorseID) === horseId ? 'is-selected' : ''} onClick={() => choose(h.HorseID)}>
                <strong>{h.HorseName}</strong>
                <small>{h.HorseCode || '—'}{h.context?.CurrentStage ? ` · ${h.context.CurrentStage.StageName}` : ''}</small>
                {text && <span className={`care-badge care-badge-${tone}`}>{text}</span>}
              </button>
            </li>
          })}</ul>
        </Loading>
      </aside>

      <div className="care-detail">
        {!horseId && <section className="panel empty-state"><h3>Chọn một con ngựa</h3>
          <p>Danh sách bên trái cho biết ngựa nào chưa có khẩu phần hoặc khẩu phần cần xem lại theo giáo án mới.</p></section>}
        {horseId && <Loading state={detail}>
          {message && <div className="success-message" role="status">{message}</div>}
          <DietContextPanel context={context} />

          {form ? <DietPlanForm key={`${form.mode}-${form.plan?.DietPlanID || 'new'}`} mode={form.mode} plan={form.plan}
            copyFrom={form.copyFrom} horseName={context?.HorseName}
            save={body => (form.mode === 'create' ? createDietPlan(horseId, body) : updateDietPlan(form.plan.DietPlanID, body))}
            onSaved={() => saved(form.mode === 'create' ? 'Đã lưu khẩu phần nháp, chờ chốt.' : 'Đã lưu thay đổi khẩu phần, chờ chốt.')}
            onCancel={() => setForm(null)} />
            : <div className="care-toolbar-actions">
              {waiting
                ? <p className="care-muted">Ngựa đang có khẩu phần <Badge map={DIET_STATUS} value={waiting.Status} /> – sửa bản đó thay vì lập bản mới.</p>
                : <button className="button" type="button" onClick={() => setForm({ mode: 'create', copyFrom: current })}>+ Lập khẩu phần mới</button>}
            </div>}

          <section className="panel">
            <h2>Khẩu phần của {context?.HorseName}</h2>
            {!sortedPlans.length && <p className="care-muted">Ngựa chưa có khẩu phần nào.</p>}
            <div className="care-diet-list">
              {sortedPlans.map(plan => <DietPlanCard key={plan.DietPlanID} plan={plan} compact={plan.Status === 'Expired'}>
                {plan.DietPlanID === current?.DietPlanID && <p className="care-current">Đang áp dụng hôm nay</p>}
                {(plan.Status === 'Pending' || plan.Status === 'Rejected') && !form && <div className="care-actions">
                  <button className="button button-secondary" type="button" onClick={() => setForm({ mode: 'edit', plan })}>
                    {plan.Status === 'Rejected' ? 'Sửa theo góp ý của Vet' : 'Sửa khẩu phần'}</button></div>}
                {plan.Status === 'Pending' && !form && <button type="button" className="button" disabled={decision.busy} onClick={async () => {
                  if (await decision.run(() => approveDietPlan(plan.DietPlanID, ''), 'Đã chốt khẩu phần và cập nhật công việc cho ăn.')) { detail.reload(); horses.reload() }
                }}>Chốt và áp dụng khẩu phần</button>}
              </DietPlanCard>)}
            </div>
            <Notice state={decision} />
          </section>
        </Loading>}
      </div>
    </div>
  </CarePage>
}
