// Kiểm tra dữ liệu nhập dùng chung. Câu thông báo trùng với backend (backend/apps/core/validators.py).
// Mỗi hàm trả về chuỗi lỗi, hoặc '' khi hợp lệ.

export const MSG = {
  required: 'Vui lòng nhập thông tin này.',
  select: 'Vui lòng chọn thông tin này.',
  whitespace: 'Nội dung không được chỉ chứa khoảng trắng.',
  symbolsOnly: 'Nội dung phải có chữ hoặc chữ số, không chỉ gồm ký tự đặc biệt.',
  tooLong: (n) => `Nội dung vượt quá ${n} ký tự cho phép.`,
}

const hasAlnum = (s) => /[\p{L}\p{N}]/u.test(s)

/** Ô nội dung tự do: bỏ trống, chỉ khoảng trắng, vượt giới hạn, chỉ ký tự đặc biệt. */
export function checkText(value, max = 1000, { required = true } = {}) {
  const raw = value ?? ''
  const text = String(raw).trim()
  if (!text) return required ? (raw.length ? MSG.whitespace : MSG.required) : ''
  if (text.length > max) return MSG.tooLong(max)
  if (!hasAlnum(text)) return MSG.symbolsOnly
  return ''
}

/** Ô chọn (select / chọn ngựa / chọn người). */
export const checkSelect = (value) => (value === undefined || value === null || value === '' ? MSG.select : '')

/** Ô chọn trong danh mục hoặc tự nhập (giống ngựa, màu lông). Trùng luật với backend clean_choice_or_text. */
export function checkChoiceOrText(value, label, max = 50) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!text) return `Vui lòng chọn hoặc nhập ${label.toLowerCase()}.`
  if (text.length > max) return `${label} vượt quá ${max} ký tự cho phép.`
  if (!/\p{L}/u.test(text)) return `${label} phải có chữ cái, không chỉ gồm chữ số hoặc ký tự đặc biệt.`
  if (!/^[\p{L}\p{M}\p{N} '.,&()/–-]+$/u.test(text)) return `${label} chứa ký tự không hợp lệ.`
  return ''
}

/** Chạy một bảng luật {field: () => lỗi} và trả về {field: lỗi} cho các ô sai. */
export function runChecks(rules) {
  const errors = {}
  for (const [field, check] of Object.entries(rules)) {
    const message = check()
    if (message) errors[field] = message
  }
  return errors
}

/** Lỗi theo từng ô do backend trả về (ApiError.fieldErrors) -> {field: câu đầu tiên}. */
export function serverFieldErrors(error) {
  const out = {}
  for (const [field, messages] of Object.entries(error?.fieldErrors || {})) out[field] = messages[0]
  return out
}

// ---------------------------------------------------------------------------
// Từng loại dữ liệu (cùng thứ tự kiểm tra và cùng câu lỗi với backend)
// ---------------------------------------------------------------------------
const ISO_COUNTRY = new Set('004 008 010 012 016 020 024 028 031 032 036 040 044 048 050 051 052 056 060 064 068 070 072 074 076 084 086 090 092 096 100 104 108 112 116 120 124 132 136 140 144 148 152 156 158 162 166 170 174 175 178 180 184 188 191 192 196 203 204 208 212 214 218 222 226 231 232 233 234 238 239 242 246 248 250 254 258 260 262 266 268 270 275 276 288 292 296 300 304 308 312 316 320 324 328 332 334 336 340 344 348 352 356 360 364 368 372 376 380 384 388 392 398 400 404 408 410 414 417 418 422 426 428 430 434 438 440 442 446 450 454 458 462 466 470 474 478 480 484 492 496 498 499 500 504 508 512 516 520 524 528 531 533 534 535 540 548 554 558 562 566 570 574 578 580 581 583 584 585 586 591 598 600 604 608 612 616 620 624 626 630 634 638 642 643 646 652 654 659 660 662 663 666 670 674 678 682 686 688 690 694 702 703 704 705 706 710 716 724 728 729 732 740 744 748 752 756 760 762 764 768 772 776 780 784 788 792 795 796 798 800 804 807 818 826 831 832 833 834 840 850 854 858 860 862 876 882 887 894'.split(' '))
const MOBILE_PREFIX = new Set(['032', '033', '034', '035', '036', '037', '038', '039', '052', '055', '056', '058', '059', '070', '076', '077', '078', '079',
  '081', '082', '083', '084', '085', '086', '087', '088', '089', '090', '091', '092', '093', '094', '095', '096', '097', '098', '099'])
export const CODE_MSG = {
  short: 'Mã chưa đủ số ký tự theo quy định.',
  long: 'Mã vượt quá số ký tự cho phép.',
  structure: 'Mã không đúng cấu trúc quy định.',
  prefix: 'Mã phải bắt đầu bằng tiền tố được cấp.',
  chars: 'Chỉ được sử dụng các ký tự theo quy định.',
  missing: 'Không tìm thấy thông tin ngựa tương ứng với mã đã nhập.',
  exists: 'Mã này đã được sử dụng trong hệ thống.',
}

function blank(value) {
  const raw = value == null ? '' : String(value)
  if (!raw.trim()) return raw.length ? MSG.whitespace : MSG.required
  return ''
}

export function checkEmail(value) {
  const empty = blank(value)
  if (empty) return empty
  const email = String(value)
  if (/\s/.test(email)) return 'Email không được chứa khoảng trắng.'
  if (!email.includes('@')) return 'Email phải có ký tự @.'
  if (email.split('@').length > 2) return 'Email chỉ được có một ký tự @.'
  const [local, domain] = email.split('@')
  if (!local) return 'Email thiếu tên người dùng trước ký tự @.'
  if (!domain) return 'Email thiếu tên miền sau ký tự @.'
  if (!/^[A-Za-z0-9._%+-]+$/.test(local) || !/^[A-Za-z0-9.-]+$/.test(domain)) return 'Email chứa ký tự không hợp lệ.'
  if (local.startsWith('.') || local.endsWith('.') || email.includes('..')) return 'Dấu chấm trong email đặt sai vị trí.'
  if (!domain.includes('.')) return 'Email thiếu phần đuôi tên miền.'
  if (domain.startsWith('.')) return 'Email thiếu tên miền trước dấu chấm.'
  if (domain.endsWith('.')) return 'Email thiếu nội dung sau dấu chấm.'
  const labels = domain.split('.')
  if (labels.some((l) => !l || l.startsWith('-') || l.endsWith('-'))) return 'Tên miền của email không hợp lệ.'
  if (!/^[A-Za-z]{2,}$/.test(labels[labels.length - 1])) return 'Phần đuôi tên miền không hợp lệ.'
  if (email.length > 100) return 'Email vượt quá 100 ký tự cho phép.'
  return ''
}

/** Số di động 10 chữ số; landline = true nhận thêm số bàn 10–11 chữ số bắt đầu bằng 02. */
export function checkPhone(value, { landline = false } = {}) {
  const empty = blank(value)
  if (empty) return empty
  const raw = String(value)
  if (/\s/.test(raw)) return 'Số điện thoại không được chứa khoảng trắng.'
  if (/\p{L}/u.test(raw)) return 'Số điện thoại chỉ được chứa chữ số.'
  if (!/^\d+$/.test(raw)) return 'Số điện thoại không được chứa ký tự đặc biệt.'
  if (!raw.startsWith('0')) return 'Số điện thoại phải bắt đầu bằng số 0.'
  if (landline && raw.startsWith('02')) {
    if (raw.length < 10) return 'Số điện thoại bàn phải có 10 hoặc 11 chữ số.'
    if (raw.length > 11) return 'Số điện thoại bàn vượt quá 11 chữ số.'
    return ''
  }
  if (raw.length < 10) return 'Số điện thoại chưa đủ 10 chữ số.'
  if (raw.length > 10) return 'Số điện thoại vượt quá 10 chữ số.'
  if (!MOBILE_PREFIX.has(raw.slice(0, 3))) return 'Đầu số điện thoại không hợp lệ.'
  return ''
}

export function checkFullName(value) {
  const empty = blank(value)
  if (empty) return empty
  const text = String(value).trim().replace(/\s+/g, ' ')
  if (text.length > 150) return 'Họ và tên vượt quá 150 ký tự cho phép.'
  if (/\d/.test(text)) return 'Họ và tên không được chứa chữ số.'
  if (!/^[\p{L}\p{M} '.-]+$/u.test(text)) return 'Họ và tên không được chứa ký tự đặc biệt.'
  if ((text.match(/\p{L}/gu) || []).length < 2) return 'Họ và tên phải có ít nhất 2 ký tự.'
  return ''
}

export function checkAddress(value, max = 255) {
  const empty = blank(value)
  if (empty) return empty
  return String(value).trim().length > max ? MSG.tooLong(max) : ''
}

export function checkHorseName(value, label = 'Tên ngựa', { required = true, max = 100 } = {}) {
  const raw = value == null ? '' : String(value)
  const text = raw.trim().replace(/\s+/g, ' ')
  if (!text) return required ? (raw.length ? MSG.whitespace : MSG.required) : ''
  if (text.length > max) return `${label} vượt quá ${max} ký tự cho phép.`
  if (!/\p{L}/u.test(text)) return `${label} phải có chữ cái, không chỉ gồm chữ số hoặc ký tự đặc biệt.`
  if (!/^[\p{L}\p{M}\p{N} '.&-]+$/u.test(text)) return `${label} chứa ký tự không hợp lệ.`
  return ''
}

/** Ngày dạng YYYY-MM-DD đã hợp lệ; kiểm tra ngày sinh không sau hôm nay, không quá maxAge năm. */
export function checkBirthDate(iso, maxAge = 40) {
  if (!iso) return MSG.required
  const today = new Date()
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  if (iso > todayIso) return 'Ngày sinh không được sau ngày hiện tại.'
  if (Number(iso.slice(0, 4)) < today.getFullYear() - maxAge) return 'Năm sinh không hợp lệ.'
  return ''
}

/** Chuỗi ngày người dùng gõ (dd/mm/yyyy hoặc mm/dd/yyyy): sai định dạng, tháng sai, ngày không tồn tại. */
export function checkDateText(text, en = false) {
  if (!text) return ''
  const digits = text.replace(/\D/g, '')
  if (digits.length !== 8) return 'Ngày không đúng định dạng dd/mm/yyyy.'
  const [a, b, y] = [Number(digits.slice(0, 2)), Number(digits.slice(2, 4)), Number(digits.slice(4))]
  const [d, m] = en ? [b, a] : [a, b]
  if (m < 1 || m > 12) return 'Tháng không hợp lệ.'
  if (y < 1900) return 'Năm không hợp lệ.'
  const date = new Date(y, m - 1, d)
  if (d < 1 || date.getMonth() !== m - 1) return 'Ngày không tồn tại trong lịch.'
  return ''
}

/** Microchip ISO 11784: 15 chữ số; 3 số đầu là mã quốc gia (704 = Việt Nam) hoặc mã nhà sản xuất 900–998. */
export function checkMicrochip(value) {
  const empty = blank(value)
  if (empty) return empty
  const code = String(value)
  if (!/^\d+$/.test(code)) return CODE_MSG.chars
  if (code.length < 15) return CODE_MSG.short
  if (code.length > 15) return CODE_MSG.long
  const prefix = code.slice(0, 3)
  if (!ISO_COUNTRY.has(prefix) && !(Number(prefix) >= 900 && Number(prefix) <= 998)) return CODE_MSG.prefix
  return ''
}

/** UELN 15 ký tự: 3 số mã quốc gia + 3 ký tự mã cơ sở dữ liệu + 9 ký tự định danh. */
export function checkUeln(value) {
  const empty = blank(value)
  if (empty) return empty
  const code = String(value).toUpperCase()
  if (!/^[A-Z0-9]+$/.test(code)) return CODE_MSG.chars
  if (code.length < 15) return CODE_MSG.short
  if (code.length > 15) return CODE_MSG.long
  if (!/^\d{3}/.test(code)) return CODE_MSG.structure
  if (!ISO_COUNTRY.has(code.slice(0, 3))) return CODE_MSG.prefix
  return ''
}
