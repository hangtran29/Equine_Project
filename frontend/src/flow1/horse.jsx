// Tiện ích về hồ sơ ngựa dùng chung: nhãn trạng thái, ảnh đại diện, lý lịch, tiến trình tiếp nhận.
import { useEffect, useState } from 'react'
import { getDocumentFile, getDocuments } from './api.js'
import { Badge, Dl, fmtDate, fmtDateTime } from './ui.jsx'

export const SEX = { Male: 'Ngựa đực', Female: 'Ngựa cái', Gelding: 'Ngựa đực thiến' }
export const HEALTH = { Healthy: 'Khỏe mạnh', Monitor: 'Cần theo dõi', Injured: 'Không đạt', Recovering: 'Đang hồi phục', Isolated: 'Cách ly' }
export const ELIGIBILITY = { Eligible: 'Đủ điều kiện', Restricted: 'Tập giới hạn', 'Not Eligible': 'Không đủ điều kiện' }

export function examPasses(summary) {
  return summary && ['Healthy', 'Monitor'].includes(summary.HealthStatus) && summary.TrainingEligibility !== 'Not Eligible'
}

/** Nhãn trạng thái hồ sơ: [loại màu, chữ]. `forOwner` dùng chữ cho chủ ngựa. */
export function statusOf(horse, forOwner = false) {
  const s = horse.RegistrationStatus
  if (s === 'Draft') return ['draft', 'Bản nháp']
  if (s === 'Submitted') return ['sent', 'Chờ xác minh']
  if (s === 'PendingExam') {
    if (forOwner) return ['wait', 'Chờ khám lâm sàng']
    if (!horse.InitialExamSigned) return ['wait', 'Chờ kết quả lâm sàng']
    return examPasses(horse.HealthSummary) ? ['ok', 'Đủ điều kiện tiếp nhận'] : ['bad', 'Không đạt yêu cầu lâm sàng']
  }
  if (s === 'Approved') return ['ok', 'Đã tiếp nhận']
  if (s === 'Rejected') return ['bad', forOwner && !horse.InitialExamSigned ? 'Cần bổ sung hồ sơ' : 'Bị từ chối']
  if (s === 'Archived') return ['arch', 'Đã lưu trữ']
  return ['draft', s || '—']
}
export function StatusBadge({ horse, forOwner }) {
  const [kind, text] = statusOf(horse, forOwner)
  return <Badge kind={kind}>{text}</Badge>
}

export function horseMeta(horse) {
  return [horse.Breed, SEX[horse.Gender]].filter(Boolean).join(' · ')
}

/** Lý lịch ngựa dạng bảng 3 cột (giống thiết kế). */
export function ProfileList({ horse }) {
  return <Dl items={[
    ['Tên ngựa', horse.HorseName], ['Giống ngựa', horse.Breed], ['Ngày sinh', fmtDate(horse.DateOfBirth)],
    ['Giới tính', SEX[horse.Gender]], ['Màu lông', horse.CoatColor], ['Số hộ chiếu (UELN)', horse.PassportNumber || 'Chưa được cấp hộ chiếu'],
    ['Mã định danh', horse.MicrochipNumber], ['Tên ngựa bố', horse.SireName], ['Tên ngựa mẹ', horse.DamName],
  ]} />
}

// ----- ảnh ngựa (tải bằng token, nhớ tạm theo phiên) -----
const imageCache = new Map()
async function loadPhotos(horseId) {
  if (!imageCache.has(horseId)) {
    imageCache.set(horseId, (async () => {
      const docs = (await getDocuments(horseId)).filter((d) => d.IsProfileImage && !d.IsRetired)
      docs.sort((a, b) => Number(b.IsPrimary) - Number(a.IsPrimary))
      return Promise.all(docs.slice(0, 6).map(async (d) => URL.createObjectURL(await getDocumentFile(d.DocumentID))))
    })().catch(() => []))
  }
  return imageCache.get(horseId)
}
export function forgetPhotos(horseId) { imageCache.delete(String(horseId)); imageCache.delete(Number(horseId)) }

export function usePhotos(horseId) {
  const [photos, setPhotos] = useState([])
  useEffect(() => {
    let active = true
    if (horseId) void loadPhotos(horseId).then((list) => { if (active) setPhotos(list) })
    return () => { active = false }
  }, [horseId])
  return photos
}

export function HorseThumb({ horseId, size = 44 }) {
  const [first] = usePhotos(horseId)
  return first ? <img className="thumb" src={first} alt="" style={{ width: size, height: size }} />
    : <span className="thumb" style={{ width: size, height: size }} />
}

export function PhotoGrid({ horseId }) {
  const photos = usePhotos(horseId)
  if (!photos.length) return <p className="hint" style={{ margin: 0 }}>Chưa có hình ảnh.</p>
  return <div className="photos">{photos.slice(0, 3).map((src) => <img key={src} src={src} alt="" />)}</div>
}

/** Tiến trình tiếp nhận 4 bước (trang 10, 13, 23). */
export function intakeSteps(horse, requests = []) {
  const latest = requests[0]
  const first = requests[requests.length - 1]
  const s = horse.RegistrationStatus
  const sentAt = latest?.RequestDate || first?.RequestDate
  const send = ['done', 'Gửi yêu cầu tiếp nhận', fmtDateTime(sentAt)]
  if (s === 'Rejected' && !horse.InitialExamSigned) {
    return [send, ['now', 'Cần bổ sung hồ sơ', 'Chỉnh sửa theo yêu cầu'],
      ['', 'Kiểm tra lâm sàng & Phân chuồng', ''], ['', 'Phê duyệt & Tiếp nhận chính thức', '']]
  }
  const verified = ['PendingExam', 'Approved', 'Archived'].includes(s) || (s === 'Rejected' && horse.InitialExamSigned)
  const examined = horse.InitialExamSigned || ['Approved', 'Archived'].includes(s)
  const approved = ['Approved', 'Archived'].includes(s)
  return [
    send,
    [verified ? 'done' : 'now', 'Kiểm duyệt hồ sơ đăng ký', verified ? fmtDateTime(horse.VerifiedAt) : 'Đang chờ xử lý'],
    [examined ? 'done' : verified ? 'now' : '', 'Kiểm tra lâm sàng & Phân chuồng',
      examined ? fmtDateTime(horse.HealthSummary?.ExamDate) : verified ? 'Đang chờ khám' : ''],
    [approved ? 'done' : s === 'Rejected' ? 'now' : '', 'Phê duyệt & Tiếp nhận chính thức',
      approved ? fmtDateTime(latest?.ReviewedAt) : s === 'Rejected' ? 'Hồ sơ bị từ chối' : ''],
  ]
}
