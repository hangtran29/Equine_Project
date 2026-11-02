// Groom: khẩu phần đang áp dụng của từng ngựa (chỉ xem; việc cho ăn hằng ngày đã tự sinh theo khẩu phần này).
import { useMemo, useState } from 'react'
import { getApprovedHorses, getCurrentDiet, getHorseGroom } from '../../api/careApi.ts'
import { Badge, CarePage, Loading, MealList } from './careShared.jsx'
import { DIET_STATUS, fmtDate, useLoad } from './careUtils.js'

export default function HorseDietsPage({ currentUser }) {
  const [onlyMine, setOnlyMine] = useState(true)
  const data = useLoad(async () => {
    const horses = await getApprovedHorses()
    const [diets, grooms] = await Promise.all([
      Promise.all(horses.map(h => getCurrentDiet(h.HorseID))),
      Promise.all(horses.map(h => getHorseGroom(h.HorseID))),
    ])
    return horses.map((h, i) => ({ ...h, diet: diets[i], groom: grooms[i] }))
  }, [])
  const mine = (data.data || []).filter(h => String(h.groom?.GroomID) === String(currentUser?.id))
  const rows = useMemo(() => (onlyMine ? mine : data.data || []), [onlyMine, mine, data.data])

  return <CarePage crumb="Khẩu phần ngựa" eyebrow="GROOM" title="Khẩu phần ăn của ngựa"
    description="Khẩu phần do Head Trainer lập và chốt theo giai đoạn tập, tuân thủ chỉ định Vet. Việc cho ăn trong danh sách việc của bạn được tạo theo các bữa dưới đây.">
    <section className="filter-card care-toolbar">
      <label className="care-check"><input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} />
        Chỉ ngựa tôi phụ trách ({mine.length})</label>
    </section>
    <Loading state={data} isEmpty={!rows.length} empty={[onlyMine ? 'Bạn chưa được phân công phụ trách ngựa nào' : 'Chưa có ngựa nào được tiếp nhận']}>
      <div className="care-card-grid">
        {rows.map(h => <article className="panel care-horse-diet" key={h.HorseID}>
          <header>
            <div><h2>{h.HorseName}</h2><small>{h.HorseCode || '—'} · Groom phụ trách: {h.groom?.GroomName || 'chưa giao'}</small></div>
            {h.diet && <Badge map={DIET_STATUS} value={h.diet.Status} />}
          </header>
          {h.diet ? <>
            {h.diet.DietDescription && <p className="care-muted">{h.diet.DietDescription}</p>}
            <MealList meals={h.diet.Meals} />
            <p className="care-task-meta">Áp dụng từ {fmtDate(h.diet.StartDate)}{h.diet.EndDate ? ` đến ${fmtDate(h.diet.EndDate)}` : ''}</p>
            {h.diet.VetNote && <p className="care-vet-note"><b>Lưu ý của Vet:</b> {h.diet.VetNote}</p>}
          </> : <p className="care-muted">Ngựa chưa có khẩu phần được duyệt. Hỏi Head Trainer trước khi cho ăn.</p>}
        </article>)}
      </div>
    </Loading>
  </CarePage>
}
