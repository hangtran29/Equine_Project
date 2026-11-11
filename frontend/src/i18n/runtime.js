// Đổi giao diện ứng dụng sang tiếng Anh ngay trên trình duyệt (VI mặc định).
// Cách làm: theo dõi DOM, chữ tiếng Việt nào có trong từ điển en.json thì thay bằng tiếng Anh (text, placeholder,
// title, aria-label). Nội dung người dùng nhập (ghi chú, kết luận, mô tả...) chưa có trong từ điển được gửi
// POST /api/translate để dịch (backend apps/core/content_i18n.py); tên người, tên ngựa giữ nguyên.
// Lựa chọn lưu ở localStorage "equi.lang" – dùng chung với trang giới thiệu.

import { currentLang } from './locale.js'
export { currentLang, dateLocale } from './locale.js'
const KEY = 'equi.lang'
const ATTRS = ['placeholder', 'title', 'aria-label']
let dict = null
let observer = null
let loading = null
const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i
const content = new Map()       // văn bản -> bản dịch ('' = không dịch được)
const waiting = new Map()       // văn bản -> các text node đang chờ bản dịch
let flushTimer = null
const viCount = (text) => (text.match(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi) || []).length
const sourceOf = new WeakMap()   // text node -> [chữ gốc tiếng Việt, chữ đã thay] để dịch lại từ bản gốc


// Chuỗi có số / tên ở giữa (ghép lúc chạy): dịch theo mẫu. Phần trong ngoặc được dịch tiếp bằng từ điển (t) nếu có.
const t = (x) => (dict && dict[x.trim()]) || x
const DAYS = { 'Thứ hai': 'Monday', 'Thứ ba': 'Tuesday', 'Thứ tư': 'Wednesday', 'Thứ năm': 'Thursday', 'Thứ sáu': 'Friday', 'Thứ bảy': 'Saturday', 'Chủ nhật': 'Sunday' }
const PATTERNS = [
  [/^Ngựa (.+)$/, 'Horse $1'],
  [/^Tổng (\d+) thao tác · trang (\d+)\/(\d+)$/, '$1 actions · page $2/$3'],
  [/^dự kiến tái đánh giá (.+)$/, 'planned review $1'],
  [/^Khóa tập · (.+)$/, (m, detail) => `Training locked · ${lookupPart(detail) || detail}`],
  [/^Mức tải tối đa ([\d.,]+)$/, 'Maximum training load $1'],
  [/^Mức tải tối đa ([\d.,]+) · (.+)$/, (m, load, detail) => `Maximum training load ${load} · ${lookupPart(detail) || detail}`],
  [/^Ngựa đang giới hạn mức tập · tối đa ([\d.,]+)$/, 'Training restricted · maximum load $1'],
  [/^Ngựa đang giới hạn mức tập: cần nhập mức tải \(tối đa ([\d.,]+)\)\.$/, 'Enter the training load (maximum $1).'],
  [/^Ngựa đang giới hạn mức tập: mức tải tối đa là ([\d.,]+)\.$/, 'The maximum training load is $1.'],
  [/^Tối đa ([\d.,]+)$/, 'Maximum $1'],
  [/^(\d+) tuổi$/, '$1 years old'],
  [/^(\d+) ngựa$/, '$1 horses'],
  [/^(\d+) tệp$/, '$1 files'],
  [/^(\d+) chuồng$/, '$1 stalls'],
  [/^(\d+) phút$/, '$1 min'],
  [/^(\d+) năm$/, '$1 years'],
  [/^(\d+) ngày$/, '$1 days'],
  [/^(\d+) tháng$/, '$1 months'],
  [/^(\d+) tuần$/, '$1 weeks'],
  [/^(\d+) giờ$/, '$1 hours'],
  [/^(\d+) lần\/phút$/, '$1 bpm'],
  [/^([\d.,]+) km · (\d+) phút$/, '$1 km · $2 min'],
  [/^1 giáo án chờ duyệt$/, '1 training plan pending approval'],
  [/^(\d+) giáo án chờ duyệt$/, '$1 training plans pending approval'],
  [/^1 ngựa chưa có huấn luyện viên$/, '1 horse without a trainer'],
  [/^(\d+) ngựa chưa có huấn luyện viên$/, '$1 horses without a trainer'],
  [/^(\d+) đề xuất điều chỉnh giáo án$/, '$1 training plan adjustment proposals'],
  [/^(\d+) buổi hoàn thành$/, '$1 sessions completed'],
  [/^(\d+) buổi đã xếp$/, '$1 sessions scheduled'],
  [/^(\d+) buổi$/, '$1 sessions'],
  [/^Buổi (\d+)$/, 'Session $1'],
  [/^Buổi tập (.+)$/, 'Session $1'],
  [/^Giáo án #(\d+)$/, 'Training plan #$1'],
  [/^Báo cáo sức khỏe #(\d+)$/, 'Health report #$1'],
  [/^Báo cáo sức khỏe khẩn #(\d+)$/, 'Urgent health report #$1'],
  [/^Báo cáo #(\d+)$/, 'Report #$1'],
  [/^Ghi chú của (.+)$/, 'Note from $1'],
  [/^Giai đoạn (\d+)$/, 'Stage $1'],
  [/^Lần (\d+)$/, 'Attempt $1'],
  [/^Đường đua số (\d+)$/, 'Track no. $1'],
  [/^Mã ngựa (.+)$/, 'Horse code $1'],
  [/^Chủ sở hữu: (.+)$/, 'Owner: $1'],
  [/^Chuồng (.+)$/, 'Stall $1'],
  [/^Gửi ngày (.+)$/, 'Submitted on $1'],
  [/^Gửi duyệt (.+)$/, 'Submitted for approval $1'],
  [/^Được duyệt (.+) bởi (.+)$/, 'Approved $1 by $2'],
  [/^Tạo lúc (.+)$/, 'Created at $1'],
  [/^Lưu nháp lúc (.+)$/, 'Draft saved at $1'],
  [/^Bản nháp tạo lúc (.+)$/, 'Draft created at $1'],
  [/^Tài khoản (.+)$/, 'Account $1'],
  [/^Tuần (.+)$/, 'Week $1'],
  [/^Đến (.+)$/, 'Until $1'],
  [/^Huấn luyện viên (.+)$/, 'Trainer $1'],
  [/^Kỵ sĩ (.+)$/, 'Rider $1'],
  [/^BS\. (.+)$/, (m, a) => `Dr. ${lookupPart(a) || a}`],
  [/^Người chăm sóc cho (.+)$/, 'Groom for $1'],
  [/^Xếp hạng (.+)$/, 'Rating $1'],
  [/^cấp (.+)$/, 'issued $1'],
  [/^xong lúc (.+)$/, 'done at $1'],
  [/^chốt lúc (.+)$/, 'closed at $1'],
  [/^lập lúc (.+)$/, 'created at $1'],
  [/^dự kiến đến (.+)$/, 'expected until $1'],
  [/^Khóa tập toàn bộ đến (.+)$/, 'Full training lock until $1'],
  [/^Khóa toàn bộ đến (.+)$/, 'Full lock until $1'],
  [/^(.+) gửi báo cáo$/, '$1 sent a report'],
  [/^(.+) nhận xử lý$/, '$1 took over'],
  [/^(.+) đã được tiếp nhận chính thức từ (.+)\.$/, '$1 was officially admitted on $2.'],
  [/^(.+) hoàn thành buổi (.+)$/, (m, a, b) => `${a} completed a ${lookupPart(b) || b} session`],
  [/^Bỏ chuyên môn (.+)$/, (m, a) => `Remove specialization ${t(a)}`],
  [/^(Phi nước kiệu|Phi nước đại|Phi nước rút|Phi nước kiệu nhẹ|Đi bộ) (.+)$/, (m, a, b) => `${t(a)} ${b}`],
  [/^(Thứ hai|Thứ ba|Thứ tư|Thứ năm|Thứ sáu|Thứ bảy|Chủ nhật), (.+)$/, (m, a, b) => `${DAYS[a]}, ${b}`],
  [/^(.+) lúc (\d{1,2}:\d{2})$/, (m, a, b) => { const x = lookupPart(a) || (/[À-ỹđĐ]/.test(a) ? null : a); return x ? `${x} at ${b}` : m }],
  [/^\((.+)\)$/, (m, a) => { const x = lookupPart(a); return x ? `(${x})` : m }],
  [/^· (.+)$/, (m, a) => { const x = lookup(a); return x ? `· ${x}` : m }],
  [/^buổi tập (.+)$/, 'session $1'],
  [/^theo giáo án #(\d+)$/, 'per training plan #$1'],
  [/^tiêm (.+)$/, (m, a) => `vaccination: ${t(a)}`],
  [/^(phi nước kiệu|phi nước đại|phi nước rút|đi bộ) (.+)$/, (m, a, b) => `${{ 'phi nước kiệu': 'trot', 'phi nước đại': 'gallop', 'phi nước rút': 'sprint', 'đi bộ': 'walk' }[a]} ${b}`],
  [/^(.+) (\(.+\))$/, (m, a, b) => (dict[a] ? `${dict[a]} ${lookupPart(b.slice(1, -1)) ? `(${lookupPart(b.slice(1, -1))})` : b}` : m)],
]

function lookupPart(text) {
  const key = text.replace(/\s+/g, ' ').trim()
  if (!key || !dict) return null
  if (dict[key]) return dict[key]
  for (const [re, out] of PATTERNS) {
    if (!re.test(key)) continue
    const res = key.replace(re, out)
    if (res !== key) return res
  }
  return null
}

const SEPS = [' · ', ' – ', ': ', ', ']

function lookup(text, from = 0) {
  const key = text.replace(/\s+/g, ' ').trim()
  if (!key || !dict) return null
  if (dict[key]) return dict[key]
  // chuỗi ghép bằng " · ", " – ", ": ", ", ": dịch từng đoạn (đệ quy), chỉ dùng khi dịch được ít nhất một đoạn
  for (let i = from; i < SEPS.length; i++) {
    const sep = SEPS[i]
    if (!key.includes(sep)) continue
    let hit = false
    const out = key.split(sep).map(part => {
      const found = lookup(part, i + 1)
      if (found) hit = true
      return found || part
    })
    if (hit) return out.join(sep)
  }
  const direct = lookupPart(key)
  if (direct) return direct
  if (key.endsWith(' *') && dict[key.slice(0, -2)]) return `${dict[key.slice(0, -2)]} *`
  return null
}

function translateText(node) {
  const value = node.nodeValue
  if (!value || !/[^\s\d.,:;·–—()/%+-]/.test(value)) return
  const known = sourceOf.get(node)
  const original = known && known[1] === value ? known[0] : value.trim()   // chữ ta đã thay: dịch lại từ bản gốc
  let result = lookup(original) || original
  if (VI.test(result)) {                     // còn tiếng Việt: nội dung người dùng nhập -> dịch cả câu gốc
    const done = content.get(original)
    if (done) { const merged = lookup(done) || done; if (viCount(merged) <= viCount(result)) result = merged }   // lấy bản còn ít chữ tiếng Việt hơn
    else if (done !== '') wait(original, node)     // chưa dịch hoặc đang dịch
  }
  if (result === value.trim()) return
  const lead = value.match(/^\s*/)[0]
  const tail = value.match(/\s*$/)[0]
  node.nodeValue = `${lead}${result}${tail}`
  sourceOf.set(node, [original, node.nodeValue])
}

/** Gom các nội dung chưa có bản dịch, gửi backend theo lô. */
function wait(text, node) {
  let token = null
  try { token = localStorage.getItem('equi.access-token') } catch { /* bỏ qua */ }
  if (!token) return
  if (!waiting.has(text)) waiting.set(text, new Set())
  waiting.get(text).add(node)
  if (!flushTimer && !content.has(text)) flushTimer = setTimeout(flush, 120)
}

async function flush() {
  flushTimer = null
  const batch = [...waiting.keys()].filter((t) => !content.has(t)).slice(0, 150)
  if (!batch.length) return
  batch.forEach((t) => content.set(t, null))          // đang dịch, không gửi lại
  let found = {}
  try {
    const { apiPost } = await import('../api/apiClient.ts')
    found = (await apiPost('/translate', { Texts: batch })).Translations || {}
  } catch { /* mất kết nối: giữ tiếng Việt */ }
  for (const text of batch) {
    content.set(text, found[text] || '')
    const nodes = waiting.get(text)
    waiting.delete(text)
    if (found[text]) nodes?.forEach((n) => { if (n.isConnected) translateText(n) })
  }
  if ([...waiting.keys()].some((t) => !content.has(t))) flushTimer = setTimeout(flush, 120)
}

function translateElement(element) {
  for (const attr of ATTRS) {
    const value = element.getAttribute?.(attr)
    if (value) {
      const found = lookup(value)
      if (found && found !== value) element.setAttribute(attr, found)
    }
  }
}

function translateTree(root) {
  if (!root) return
  if (root.nodeType === Node.TEXT_NODE) { translateText(root); return }
  if (root.nodeType !== Node.ELEMENT_NODE) return
  if (root.closest?.('[data-no-translate]')) return
  translateElement(root)
  if (root.tagName === 'INPUT' || root.tagName === 'TEXTAREA') return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: node => (node.nodeType === Node.ELEMENT_NODE && (node.hasAttribute('data-no-translate')
      || ['SCRIPT', 'STYLE'].includes(node.tagName)) ? NodeFilter.FILTER_REJECT
      // textarea: chỉ dịch placeholder, không đụng chữ người dùng gõ
      : node.nodeType === Node.ELEMENT_NODE && node.tagName === 'TEXTAREA' ? (translateElement(node), NodeFilter.FILTER_REJECT)
      : NodeFilter.FILTER_ACCEPT),
  })
  let node = walker.nextNode()
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateText(node)
    else translateElement(node)
    node = walker.nextNode()
  }
}

function observe() {
  if (observer) return
  observer = new MutationObserver(records => {
    if (currentLang() !== 'en') return
    for (const record of records) {
      if (record.type === 'characterData') translateText(record.target)
      else if (record.type === 'attributes') translateElement(record.target)
      else record.addedNodes.forEach(translateTree)
    }
  })
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS })
}

/** Bật dịch nếu người dùng đã chọn tiếng Anh. Gọi một lần ở main.jsx. */
export function startTranslator() {
  document.documentElement.lang = currentLang()
  if (currentLang() !== 'en') {
    window.addEventListener('equi:lang', () => { if (currentLang() === 'en') void startTranslator() }, { once: true })
    return Promise.resolve()
  }
  if (!loading) {
    loading = import('./en.json').then(module => {
      dict = module.default || module
      translateTree(document.body)
      observe()
    })
  }
  return loading
}

/** Đổi ngôn ngữ: tải lại trang để mọi chữ, ngày tháng và dữ liệu từ máy chủ hiện đúng ngôn ngữ mới. */
export function setLang(code) {
  try { localStorage.setItem(KEY, code) } catch { /* trình duyệt chặn lưu */ }
  window.location.reload()
}

/** Locale cho mọi chỗ định dạng ngày giờ: tiếng Việt dd/mm/yyyy 24 giờ, tiếng Anh mm/dd/yyyy. */
