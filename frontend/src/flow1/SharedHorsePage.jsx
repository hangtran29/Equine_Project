// NG01: Hồ sơ ngựa dùng chung cho các chức vụ (không có phần y tế chi tiết).
import { useParams } from 'react-router-dom'
import * as api from './api.js'
import { apiGet } from '../api/apiClient.ts'
import { horseMeta, PhotoGrid } from './horse.jsx'
import { Badge, Crumb, Dl, Heading, HorseCard, Loading, Notice, SectionTitle, errorText, fmtDate, useLoad } from './ui.jsx'
import { HEALTH, PLAN_STATUS, specLabel } from '../flow2/common.jsx'
import { usePhotos } from './horse.jsx'
import { clubToday } from '../pages/vet/vetDomain.js'

const SEX = { Male: 'Ngựa đực', Female: 'Ngựa cái', Gelding: 'Ngựa đực thiến' }
const quiet = (p) => p.catch(() => null)

export default function SharedHorsePage({ backLabel = 'Tổng quan huấn luyện', backTo = '/training/dashboard' }) {
  const { horseId } = useParams()
  const data = useLoad(async () => {
    const [horse, groom, assignments, plans, diet] = await Promise.all([
      api.getHorse(horseId), quiet(api.getHorseGroom(horseId)), quiet(apiGet(`/trainer-assignments?HorseID=${horseId}`)),
      quiet(apiGet(`/training-plans?HorseID=${horseId}`)), quiet(apiGet(`/horses/${horseId}/current-diet`)),
    ])
    return { horse, groom, assignments: assignments || [], plans: plans || [], diet }
  }, [horseId])
  const photos = usePhotos(horseId)
  if (data.loading) return <main className="page-content f1"><Loading /></main>
  if (data.error) return <main className="page-content f1"><Notice kind="bad">{errorText(data.error)}</Notice></main>
  const { horse: h, groom, assignments, plans, diet } = data.data
  const assignment = assignments.find((a) => a.Status === 'Active')
  const plan = plans.find((p) => p.Status === 'Active') || plans[0]
  const today = clubToday()
  const stage = plan?.Stages?.find((s) => s.StartDate <= today && (!s.EndDate || s.EndDate >= today))
  const [hk, ht] = HEALTH[h.CurrentHealthStatus] || ['draft', h.CurrentHealthStatus]
  return <main className="page-content f1">
    <Crumb items={[[backLabel, backTo], [h.HorseName]]} />
    <Heading title="Hồ sơ ngựa" />
    <section className="panel">
      <HorseCard name={h.HorseName} meta={[h.HorseCode, horseMeta(h), h.CurrentStall && `Chuồng ${h.CurrentStall.StallNumber}`].filter(Boolean).join(' · ')}
        image={photos[0]} badge={<div className="acts"><Badge kind={hk}>{ht}</Badge></div>} />
      <div className="grid" style={{ marginTop: 18 }}>
        <div className="card"><SectionTitle icon="user">Thông tin cơ bản</SectionTitle><Dl items={[['Tên ngựa', h.HorseName], ['Mã ngựa', h.HorseCode],
          ['Giống ngựa', h.Breed], ['Ngày sinh', fmtDate(h.DateOfBirth)], ['Giới tính', SEX[h.Gender]], ['Màu lông', h.CoatColor]]} /></div>
        <div className="card"><SectionTitle icon="card">Nhận diện và nguồn gốc</SectionTitle><Dl items={[['Số hộ chiếu (UELN)', h.PassportNumber || 'Chưa được cấp hộ chiếu'],
          ['Mã định danh', h.MicrochipNumber], ['Tên ngựa bố', h.SireName], ['Tên ngựa mẹ', h.DamName], ['Ngày tiếp nhận', fmtDate(h.VerifiedAt)]]} /></div>
        <div className="card"><SectionTitle icon="stall">Chuồng trại và chăm sóc</SectionTitle><Dl items={[['Chuồng', h.CurrentStall?.StallNumber || 'Chưa xếp chuồng'],
          ['Người chăm sóc', groom?.GroomName || 'Chưa phân công'], ['Khẩu phần đang áp dụng', diet?.DietDescription || 'Chưa có', 1]]} /></div>
        <div className="card"><SectionTitle icon="req">Huấn luyện</SectionTitle><Dl items={[['Huấn luyện viên', assignment?.TrainerName || 'Chưa phân công'],
          ['Chuyên môn', specLabel(assignment?.SpecializationName)], ['Giáo án', plan ? `Giáo án #${plan.TrainingPlanID} · ${(PLAN_STATUS[plan.Status]?.[1] || plan.Status)}` : 'Chưa có'],
          ['Giai đoạn', stage ? `${stage.StageName} · ${fmtDate(stage.StartDate)} – ${fmtDate(stage.EndDate)}` : '—']]} /></div>
      </div>
      <div className="card" style={{ marginTop: 14 }}><SectionTitle icon="image">Hình ảnh ngựa</SectionTitle><PhotoGrid horseId={horseId} /></div>
      <p className="hint" style={{ margin: '16px 0 0' }}>Thông tin lý lịch do Quản lý câu lạc bộ xác minh. Hồ sơ y tế chi tiết chỉ bác sĩ thú y xem và cập nhật.</p>
    </section>
  </main>
}
