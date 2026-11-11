// Bảng chọn ngày dùng chung cho mọi ô ngày của ứng dụng (thay bảng lịch của trình duyệt).
// Lịch của trình duyệt hiện theo ngôn ngữ cài trên máy (November, Su Mo Tu...), nên ứng dụng tự vẽ lịch:
// tiếng Việt "Tháng 11", tuần bắt đầu từ Thứ Hai, giờ 24h; tiếng Anh khi người dùng chọn EN.
// Áp dụng cho <input type="date"> và <input type="datetime-local">: bấm vào ô, nhấn Alt+↓ / F4 / Space,
// hoặc gọi input.showPicker(). Giá trị được ghi lại vào ô gốc và phát sự kiện input/change để React nhận.
import { currentLang } from '../i18n/runtime.js'

const TEXT = {
  vi: {
    months: Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`),
    days: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'],
    clear: 'Xóa', today: 'Hôm nay', done: 'Xong', time: 'Giờ', prev: 'Tháng trước', next: 'Tháng sau',
    month: 'Chọn tháng', year: 'Chọn năm', hour: 'Giờ', minute: 'Phút', pickTime: 'Chọn giờ', now: 'Bây giờ',
  },
  en: {
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    days: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
    clear: 'Clear', today: 'Today', done: 'Done', time: 'Time', prev: 'Previous month', next: 'Next month',
    month: 'Select month', year: 'Select year', hour: 'Hour', minute: 'Minute', pickTime: 'Select time', now: 'Now',
  },
}
const TYPES = new Set(['date', 'datetime-local'])
const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
const isPickable = (el) => el instanceof HTMLInputElement && TYPES.has(el.type) && !el.disabled && !el.readOnly
const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set

let state = null // { input, anchor, year, month, popup }

function parseValue(input) {
  const v = input.value || ''
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return null
  return { y: +m[1], mo: +m[2] - 1, d: +m[3], h: m[4] ? +m[4] : null, mi: m[5] ? +m[5] : null }
}
function bound(input, attr) {
  const v = input.getAttribute(attr)
  return v ? v.slice(0, 10) : ''
}

function commit(input, value) {
  valueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k === 'text') node.textContent = v
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v)
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v)
  }
  for (const c of [].concat(children)) if (c) node.append(c)
  return node
}

function select(label, value, options, onChange) {
  const s = el('select', { class: 'vdp-sel', 'aria-label': label, onchange: (e) => onChange(+e.target.value) },
    options.map(([v, t]) => el('option', { value: v, text: t })))
  s.value = String(value)
  return s
}

function render() {
  if (!state) return
  if (state.kind === 'time') { renderTime(); return }
  const { input, year, month } = state
  const t = TEXT[currentLang()] || TEXT.vi
  const withTime = input.type === 'datetime-local'
  const current = parseValue(input)
  const selected = current ? iso(current.y, current.mo, current.d) : ''
  const now = new Date()
  const todayIso = iso(now.getFullYear(), now.getMonth(), now.getDate())
  const min = bound(input, 'min'), max = bound(input, 'max')
  const out = (d) => Boolean((min && d < min) || (max && d > max))

  const minYear = min ? Math.min(+min.slice(0, 4), year) : Math.min(now.getFullYear() - 60, year)
  const maxYear = max ? Math.max(+max.slice(0, 4), year) : Math.max(now.getFullYear() + 10, year)
  const years = []
  for (let y = maxYear; y >= minYear; y -= 1) years.push([y, String(y)])

  const go = (delta) => { const d = new Date(year, month + delta, 1); state.year = d.getFullYear(); state.month = d.getMonth(); render() }
  const header = el('div', { class: 'vdp-head' }, [
    el('button', { type: 'button', class: 'vdp-nav', 'aria-label': t.prev, text: '‹', onclick: () => go(-1) }),
    el('div', { class: 'vdp-title' }, [
      select(t.month, month, t.months.map((n, i) => [i, n]), (v) => { state.month = v; render() }),
      select(t.year, year, years, (v) => { state.year = v; render() }),
    ]),
    el('button', { type: 'button', class: 'vdp-nav', 'aria-label': t.next, text: '›', onclick: () => go(1) }),
  ])

  const grid = el('div', { class: 'vdp-grid', role: 'grid' }, t.days.map((d) => el('span', { class: 'vdp-dow', text: d })))
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7 // Thứ Hai đầu tuần
  const start = new Date(year, month, 1 - offset)
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const key = iso(d.getFullYear(), d.getMonth(), d.getDate())
    const cls = ['vdp-day']
    if (d.getMonth() !== month) cls.push('other')
    if (key === todayIso) cls.push('today')
    if (key === selected) cls.push('sel')
    grid.append(el('button', {
      type: 'button', class: cls.join(' '), text: String(d.getDate()), disabled: out(key),
      'aria-label': `${d.getDate()} ${t.months[d.getMonth()]} ${d.getFullYear()}`, 'aria-selected': key === selected ? 'true' : 'false',
      onclick: () => pickDay(key),
    }))
  }

  const children = [header, grid]
  if (withTime) {
    const h = current?.h ?? now.getHours(), mi = current?.mi ?? now.getMinutes()
    const setTime = (nh, nm) => {
      const day = current ? selected : (out(todayIso) ? (min || max) : todayIso)
      commit(input, `${day}T${pad(nh)}:${pad(nm)}`)
      render()
    }
    children.push(el('div', { class: 'vdp-time' }, [
      el('span', { text: t.time }),
      select(t.hour, h, Array.from({ length: 24 }, (_, i) => [i, pad(i)]), (v) => setTime(v, mi)),
      el('b', { text: ':' }),
      select(t.minute, mi, Array.from({ length: 60 }, (_, i) => [i, pad(i)]), (v) => setTime(h, v)),
    ]))
  }
  children.push(el('div', { class: 'vdp-foot' }, [
    el('button', { type: 'button', class: 'vdp-link', text: t.clear, onclick: () => { commit(input, ''); close() } }),
    withTime
      ? el('button', { type: 'button', class: 'vdp-done', text: t.done, onclick: () => close() })
      : el('button', { type: 'button', class: 'vdp-link', text: t.today, disabled: out(todayIso), onclick: () => pickDay(todayIso) }),
  ]))

  state.popup.replaceChildren(...children)
  place()
}

// ---------- bảng chọn giờ (kiểu đồng hồ báo thức: cột giờ 00–23, cột phút 00–59) ----------
function parseTime(v) {
  const m = String(v || '').match(/^(\d{1,2}):(\d{2})/)
  return m ? { h: Math.min(23, +m[1]), mi: Math.min(59, +m[2]) } : null
}
function renderTime() {
  const t = TEXT[currentLang()] || TEXT.vi
  const cur = parseTime(state.value)
  const now = new Date()
  const set = (h, mi) => { state.value = `${pad(h)}:${pad(mi)}`; state.set(state.value); renderTime() }
  const column = (label, count, selected, pick) => {
    const col = el('div', { class: 'vtp-col', role: 'listbox', 'aria-label': label },
      Array.from({ length: count }, (_, i) => el('button', {
        type: 'button', class: `vtp-item${i === selected ? ' sel' : ''}`, text: pad(i), 'aria-selected': i === selected ? 'true' : 'false',
        onclick: () => pick(i),
      })))
    return el('div', { class: 'vtp-colwrap' }, [el('span', { class: 'vtp-label', text: label }), col])
  }
  const h = cur?.h, mi = cur?.mi
  state.popup.replaceChildren(
    el('div', { class: 'vtp-head' }, [el('span', { text: t.pickTime }), el('b', { class: 'vtp-value', text: cur ? `${pad(h)}:${pad(mi)}` : '--:--' })]),
    el('div', { class: 'vtp-cols' }, [
      column(t.hour, 24, h, (v) => set(v, mi ?? 0)),
      el('b', { class: 'vtp-colon', text: ':' }),
      column(t.minute, 60, mi, (v) => set(h ?? now.getHours(), v)),
    ]),
    el('div', { class: 'vdp-foot' }, [
      el('button', { type: 'button', class: 'vdp-link', text: t.clear, onclick: () => { state.set(''); close() } }),
      el('button', { type: 'button', class: 'vdp-link', text: t.now, onclick: () => set(now.getHours(), now.getMinutes()) }),
      el('button', { type: 'button', class: 'vdp-done', text: t.done, onclick: () => close() }),
    ]),
  )
  // cuộn cho giờ/phút đang chọn nằm giữa cột
  state.popup.querySelectorAll('.vtp-col').forEach((col) => {
    const sel = col.querySelector('.sel')
    if (sel) col.scrollTop = sel.offsetTop - col.clientHeight / 2 + sel.offsetHeight / 2
  })
  place()
}

/** Mở bảng chọn giờ. get/set đọc và ghi giá trị 'HH:mm'; anchor là phần tử để canh vị trí. */
export function openTimePicker({ anchor, get, set, key, toggle = true }) {
  if (state?.key && state.key === key) { if (toggle) close(); return }
  close()
  const popup = el('div', { class: 'vdp vtp', role: 'dialog', 'aria-modal': 'false', lang: currentLang() })
  state = { kind: 'time', key, input: null, anchor, popup, set, value: get() }
  document.body.append(popup)
  render()
  document.addEventListener('mousedown', onOutside, true)
  document.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', close)
  window.addEventListener('scroll', place, true)
}

function openNativeTime(input) {
  openTimePicker({ anchor: input, key: input, get: () => input.value, set: (v) => commit(input, v) })
}

function pickDay(day) {
  const { input } = state
  if (input.type === 'datetime-local') {
    const cur = parseValue(input)
    const now = new Date()
    commit(input, `${day}T${pad(cur?.h ?? now.getHours())}:${pad(cur?.mi ?? now.getMinutes())}`)
    state.year = +day.slice(0, 4); state.month = +day.slice(5, 7) - 1
    render()
  } else {
    commit(input, day)
    close()
    state = null
  }
}

function place() {
  if (!state) return
  const { anchor, popup } = state
  const r = anchor.getBoundingClientRect()
  const w = popup.offsetWidth, h = popup.offsetHeight
  const vw = document.documentElement.clientWidth, vh = window.innerHeight
  let top = r.bottom + 6
  if (top + h > vh - 8 && r.top - h - 6 > 8) top = r.top - h - 6
  const left = Math.max(8, Math.min(r.left, vw - w - 8))
  popup.style.top = `${Math.max(8, top)}px`
  popup.style.left = `${left}px`
}

function onOutside(e) {
  if (!state) return
  if (state.popup.contains(e.target) || (state.input && e.target === state.input) || state.anchor.contains(e.target)) return
  close()
}
function onKey(e) {
  if (e.key === 'Escape' && state) { e.stopPropagation(); const { input } = state; close(); if (input?.isConnected && input.type !== 'hidden') input.focus?.() }
}

export function closeDatePicker() { close() }
function close() {
  if (!state) return
  state.popup.remove()
  document.removeEventListener('mousedown', onOutside, true)
  document.removeEventListener('keydown', onKey, true)
  window.removeEventListener('resize', close)
  window.removeEventListener('scroll', place, true)
  state = null
}

/** Mở bảng chọn ngày cho một ô ngày; anchor là phần tử để canh vị trí (mặc định chính ô đó). */
export function openDatePicker(input, anchor) {
  if (!isPickable(input) && !(input instanceof HTMLInputElement && TYPES.has(input.type))) return
  if (state?.input === input) { close(); return }
  close()
  const cur = parseValue(input)
  const now = new Date()
  const fallback = bound(input, 'max') && bound(input, 'max') < iso(now.getFullYear(), now.getMonth(), now.getDate())
    ? new Date(`${bound(input, 'max')}T00:00:00`) : now
  const popup = el('div', { class: 'vdp', role: 'dialog', 'aria-modal': 'false', lang: currentLang() })
  state = { input, anchor: anchor || input, year: cur ? cur.y : fallback.getFullYear(), month: cur ? cur.mo : fallback.getMonth(), popup }
  document.body.append(popup)
  render()
  document.addEventListener('mousedown', onOutside, true)
  document.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', close)
  window.addEventListener('scroll', place, true)
}

let installed = false
/** Gắn bảng chọn ngày cho toàn ứng dụng. Gọi một lần ở main.jsx. */
export function installDatePicker() {
  if (installed || typeof document === 'undefined') return
  installed = true
  const native = HTMLInputElement.prototype.showPicker
  HTMLInputElement.prototype.showPicker = function showPicker() {
    if (TYPES.has(this.type)) { openDatePicker(this, this.closest('.date-field') || this); return }
    if (this.type === 'time') { openNativeTime(this); return }
    return native?.call(this)
  }
  document.addEventListener('click', (e) => {
    const target = e.target
    if (target instanceof HTMLInputElement && target.type === 'time' && !target.disabled && !target.readOnly) {
      e.preventDefault()
      if (state?.key !== target) openNativeTime(target)
      return
    }
    if (!isPickable(target)) return
    e.preventDefault()
    if (state?.input !== target) openDatePicker(target, target)
  }, true)
  document.addEventListener('keydown', (e) => {
    const target = e.target
    if (!isPickable(target)) return
    if (e.key === 'F4' || e.key === ' ' || (e.altKey && e.key === 'ArrowDown')) {
      e.preventDefault()
      openDatePicker(target, target)
    }
  }, true)
  // Gõ tay vào ô trong lúc bảng đang mở: cập nhật tháng hiển thị theo giá trị mới
  document.addEventListener('input', (e) => {
    if (!state || !state.input || e.target !== state.input) return
    const cur = parseValue(state.input)
    if (cur) { state.year = cur.y; state.month = cur.mo }
    render()
  })
}
