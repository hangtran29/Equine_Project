// Hằng số, định dạng ngày giờ và hook dùng chung cho các trang Flow 4.
import { useCallback, useEffect, useRef, useState } from 'react'
import { clubToday } from '../vet/vetDomain.js'

export const TASK_TYPES = {
  Feeding: 'Cho ăn',
  Cleaning: 'Dọn chuồng',
  Bathing: 'Tắm, kiểm tra chân',
  'Ice Leg Soak': 'Ngâm chân nước đá',
  'Medical Care': 'Chăm sóc y tế',
  'Training Support': 'Hỗ trợ tập luyện',
}

export const TASK_STATUS = {
  Pending: ['Chưa làm', 'warning'],
  Completed: ['Đã làm', 'success'],
  Skipped: ['Bỏ qua', 'muted'],
}

export const DIET_STATUS = {
  Pending: ['Chờ Head Trainer chốt', 'warning'],
  Approved: ['Đang áp dụng', 'success'],
  Adjusted: ['Vet đã điều chỉnh', 'info'],
  Rejected: ['Bị trả về', 'danger'],
  Expired: ['Hết hiệu lực', 'muted'],
}

export const REQUEST_STATUS = {
  Pending: ['Chờ duyệt', 'warning'],
  Approved: ['Đã cấp', 'success'],
  Rejected: ['Bị từ chối', 'danger'],
  Cancelled: ['Đã hủy', 'muted'],
}

export const ITEM_TYPES = { Food: 'Thức ăn', Medicine: 'Thuốc', 'Care Equipment': 'Dụng cụ chăm sóc' }

export const ITEM_STATUS = {
  Available: ['Còn hàng', 'success'],
  'Low Stock': ['Sắp hết', 'warning'],
  'Out of Stock': ['Hết hàng', 'danger'],
  Inactive: ['Ngưng dùng', 'muted'],
}

export const INTENSITY = { Low: 'Nhẹ', Moderate: 'Vừa', High: 'Nặng', 'Very High': 'Rất nặng' }

export const RULE_HELP = {
  FEEDING_BY_DIET: 'Mỗi bữa trong khẩu phần đang áp dụng, đúng giờ bữa ăn.',
  DAILY_CLEANING: 'Mỗi ngày cho mọi ngựa đã tiếp nhận, vào giờ đã đặt.',
  BATH_AFTER_TRAINING: 'Sau mỗi buổi tập hoàn thành, cộng thêm số phút đã đặt.',
  ICE_SOAK_WHEN_LOCKED: 'Chỉ tạo theo chỉ định y tế riêng của Vet; khóa tập không tự chỉ định ngâm chân.',
}

// ---------- ngày giờ (giờ CLB, không đổi sang UTC) ----------
export function todayText() {
  return clubToday()
}

export function addDays(dateText, days) {
  const [y, m, d] = dateText.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function fmtDate(value) {
  if (!value) return '—'
  const [y, m, d] = String(value).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function fmtTime(value) {
  if (!value) return '—'
  const text = String(value)
  const time = text.includes('T') ? text.split('T')[1] : text
  return time.slice(0, 5)
}

export function fmtDateTime(value) {
  return value ? `${fmtTime(value)} ${fmtDate(value)}` : '—'
}

export function fmtNumber(value) {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : String(value)
}

// ---------- tải dữ liệu / gửi thao tác ----------
export function errorText(error) {
  if (!error) return ''
  if (error.status === 403) return error.message || 'Bạn không có quyền thực hiện thao tác này.'
  if (error.status === 404) return 'Không tìm thấy dữ liệu (có thể đã bị xóa hoặc không thuộc câu lạc bộ của bạn).'
  if (!error.status) return 'Không kết nối được máy chủ. Kiểm tra backend đang chạy rồi thử lại.'
  if (error.status === 400 && /HTTP 400/.test(error.message || '')) return 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại biểu mẫu.'
  return error.message || 'Có lỗi xảy ra. Vui lòng thử lại.'
}

export function useLoad(loader, deps) {
  const [version, setVersion] = useState(0)
  const key = JSON.stringify([deps, version])
  const [state, setState] = useState({ key: null, loading: true, error: '', data: null })
  const loaderRef = useRef(loader)
  useEffect(() => { loaderRef.current = loader }, [loader])
  const reload = useCallback(() => setVersion(v => v + 1), [])
  useEffect(() => {
    let active = true
    Promise.resolve().then(() => loaderRef.current())
      .then(data => { if (active) setState({ key, loading: false, error: '', data }) })
      .catch(error => { if (active) setState({ key, loading: false, error: errorText(error), data: null }) })
    return () => { active = false }
  }, [key])
  return { ...(state.key === key ? state : { loading: true, error: '', data: null }), reload }
}

/** run(fn, okMessage) – chặn bấm 2 lần, giữ lỗi từng trường (fields) và câu báo thành công. */
export function useSubmit() {
  const gate = useRef(false)
  const [state, setState] = useState({ busy: false, error: '', notice: '', fields: {} })
  const run = useCallback(async (fn, okMessage = 'Đã lưu.') => {
    if (gate.current) return undefined
    gate.current = true
    setState({ busy: true, error: '', notice: '', fields: {} })
    try {
      const result = await fn()
      setState({ busy: false, error: '', notice: okMessage, fields: {} })
      return result ?? true
    } catch (error) {
      setState({ busy: false, error: errorText(error), notice: '', fields: error.fieldErrors || {} })
      return undefined
    } finally {
      gate.current = false
    }
  }, [])
  const clear = useCallback(() => setState({ busy: false, error: '', notice: '', fields: {} }), [])
  return { ...state, run, clear }
}

// ---------- bữa ăn ----------
export const EMPTY_MEAL = { MealTime: '', FeedType: '', Quantity: '', Unit: 'kg', Note: '' }

export function mealsFromPlan(plan) {
  return (plan?.Meals || []).map(meal => ({
    MealTime: fmtTime(meal.MealTime), FeedType: meal.FeedType || '', Quantity: meal.Quantity ?? '',
    Unit: meal.Unit || 'kg', Note: meal.Note || '',
  }))
}

export function mealsForApi(meals) {
  return meals.map(meal => ({
    MealTime: meal.MealTime, FeedType: meal.FeedType.trim(), Quantity: Number(meal.Quantity), Unit: meal.Unit.trim(),
    Note: meal.Note.trim() || null,
  }))
}
