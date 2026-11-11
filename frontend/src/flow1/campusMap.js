// Bản đồ minh họa khu câu lạc bộ (phối cảnh isometric). scene() trả về chuỗi SVG tĩnh do code này tự vẽ.
/* eslint-disable */
export const MAP_W = 1066, MAP_H = 650, SC = 7.0, OX = 450, OY = 46
const C = Math.cos(Math.PI / 6)
export function iso(x, y, z = 0) { return [OX + (x - y) * C * SC, OY + (x + y) * 0.5 * SC - z * SC] }
const pts = list => list.map(([x, y, z]) => iso(x, y, z).map(v => v.toFixed(1)).join(',')).join(' ')
const poly = (list, fill, stroke = 'none', sw = 1, extra = '') => `<polygon points="${pts(list)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" ${extra}/>`
function pathOf(list) { return list.map(([x, y, z], i) => (i ? 'L' : 'M') + iso(x, y, z).map(v => v.toFixed(1)).join(',')).join(' ') }

// ---------- số ngẫu nhiên cố định ----------
let seed = 7
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

// ---------- các khối ----------
function building(x0, y0, x1, y1, h, { rh = 2.2, roof = '#c4553b', roofDark = '#a5432d', wall = '#f3e8d2', wallDark = '#e2d1b0', doors = 0, windows = 0, cross = false } = {}) {
  const o = 0.6, ym = (y0 + y1) / 2
  let s = ''
  // tường
  s += poly([[x0, y1, 0], [x1, y1, 0], [x1, y1, h], [x0, y1, h]], wall, '#b9a782', 0.8)
  s += poly([[x1, y0, 0], [x1, y1, 0], [x1, y1, h], [x1, y0, h]], wallDark, '#b9a782', 0.8)
  // cửa chuồng / cửa sổ dọc mặt trước
  const n = doors || windows
  for (let i = 0; i < n; i++) {
    const a = x0 + (x1 - x0) * (i + 0.5) / n - 0.6, b = a + 1.2
    if (doors) s += poly([[a, y1, 0], [b, y1, 0], [b, y1, h * 0.62], [a, y1, h * 0.62]], '#8a5a3c', '#6b4329', 0.5)
    else s += poly([[a, y1, h * 0.35], [b, y1, h * 0.35], [b, y1, h * 0.7], [a, y1, h * 0.7]], '#9fb2b8', '#7b8f95', 0.4)
  }
  // đầu hồi + mái
  s += poly([[x1, y0, h], [x1, y1, h], [x1, ym, h + rh]], wall, '#b9a782', 0.8)
  s += poly([[x0 - o, y0 - o, h], [x1 + o, y0 - o, h], [x1 + o, ym, h + rh], [x0 - o, ym, h + rh]], roofDark, '#7f3322', 0.8)
  s += poly([[x0 - o, ym, h + rh], [x1 + o, ym, h + rh], [x1 + o, y1 + o, h], [x0 - o, y1 + o, h]], roof, '#7f3322', 0.8)
  // đường gờ mái
  for (let i = 1; i < 6; i++) {
    const t = i / 6
    s += `<path d="${pathOf([[x0 - o, ym + (y1 + o - ym) * t, h + rh * (1 - t)], [x1 + o, ym + (y1 + o - ym) * t, h + rh * (1 - t)]])}" stroke="rgba(0,0,0,.08)" stroke-width="0.8"/>`
  }
  if (cross) {
    const cx = (x0 + x1) / 2, cy = ym + (y1 - ym) / 2, cz = h + rh / 2
    const [px, py] = iso(cx, cy, cz)
    s += `<circle cx="${px}" cy="${py}" r="7" fill="#fff" stroke="#c9c2b2"/><path d="M${px - 4},${py}h8M${px},${py - 4}v8" stroke="#b7412c" stroke-width="2.6"/>`
  }
  return { key: x0 + y1, svg: s }
}

function tree(x, y, r = 1) {
  const [px, py] = iso(x, y)
  const k = (6 + rnd() * 3) * r, hgt = 8 * r
  const tone = ['#e3e7c4', '#dfe5bd', '#e8eacb'][Math.floor(rnd() * 3)]
  return { key: x + y, svg: `<ellipse cx="${px + 5}" cy="${py + 1}" rx="${k * 1.2}" ry="${k * 0.45}" fill="#dde0c8" opacity=".75"/>
    <path d="M${px},${py}v-${hgt}" stroke="#8d8466" stroke-width="1.4"/>
    <circle cx="${px - k * 0.45}" cy="${py - hgt - k * 0.2}" r="${k * 0.72}" fill="${tone}" stroke="#9aa679" stroke-width="1"/>
    <circle cx="${px + k * 0.45}" cy="${py - hgt - k * 0.25}" r="${k * 0.72}" fill="${tone}" stroke="#9aa679" stroke-width="1"/>
    <circle cx="${px}" cy="${py - hgt - k * 0.75}" r="${k * 0.8}" fill="${tone}" stroke="#9aa679" stroke-width="1"/>
    <path d="M${px - k * 0.5},${py - hgt - k * 0.2}q${k * 0.4},-${k * 0.5} ${k * 0.9},0" stroke="#b5bf93" fill="none" stroke-width=".8"/>` }
}

function ground(list, fill, stroke = 'none', sw = 1) { return poly(list.map(([x, y]) => [x, y, 0]), fill, stroke, sw) }
function road(list, w = 15) {
  const d = pathOf(list.map(([x, y]) => [x, y, 0]))
  return `<path d="${d}" stroke="#d9d4c8" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" stroke="#ebe7de" stroke-width="${w - 4}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
}
function ellipse(cx, cy, rx, ry, n = 72) { return Array.from({ length: n }, (_, i) => { const t = i / n * Math.PI * 2; return [cx + rx * Math.cos(t), cy + ry * Math.sin(t), 0] }) }
function fence(list, closed = true) {
  const l = closed ? [...list, list[0]] : list
  let s = `<path d="${pathOf(l.map(([x, y]) => [x, y, 0.6]))}" stroke="#a89474" stroke-width="1" fill="none"/>`
  for (let i = 0; i < l.length - 1; i++) {
    const [ax, ay] = l[i], [bx, by] = l[i + 1], len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / 2.2))
    for (let k = 0; k <= n; k++) { const x = ax + (bx - ax) * k / n, y = ay + (by - ay) * k / n; s += `<path d="${pathOf([[x, y, 0], [x, y, 0.9]])}" stroke="#a89474" stroke-width="1"/>` }
  }
  return s
}

// ---------- vùng không trồng cây ----------
const BUSY = [
  [28, 15, 32, 36], [30, 36, 36, 43],
  [56, 0, 86, 36], [34, 4, 52, 32], [2, 4, 30, 30], [2, 38, 44, 68], [44, 41, 64, 73], [84, 16, 99, 32], [82, 40, 99, 54], [84, 56, 104, 74],
]
const onRoad = (x, y) => Math.abs(y - 36) < 3.2 && x > -30 || Math.abs(x - 53) < 3 && y > -30 || Math.abs(x - y * 0.0 - 92) < 2.5 && y > 36
function busy(x, y) { return BUSY.some(([a, b, c, d]) => x > a - 1 && x < c + 1 && y > b - 1 && y < d + 1) || onRoad(x, y) }

// ---------- ghim ----------
export const PIN_ICON = {
  stall: '<path d="M7.5 5v6.5a4.5 4.5 0 0 0 9 0V5"/><path d="M6 5h3M15 5h3"/>',
  clinic: '<path d="M12 6v12M6 12h12" stroke-width="2.6"/>',
  store: '<path d="M4 8.5 12 4.5l8 4v7.5l-8 4-8-4z"/><path d="M4 8.5l8 4 8-4M12 12.5v7.5"/>',
  wash: '<path d="M12 4.5c3 4 5.5 6.6 5.5 9.5a5.5 5.5 0 0 1-11 0c0-2.9 2.5-5.5 5.5-9.5z"/>',
  track: '<path d="M6.5 20V4.5M6.5 4.5h10l-2 3.6 2 3.6h-10"/>',
  jump: '<path d="M5.5 19V8M18.5 19V8M5.5 11h13M5.5 15h13"/>',
  paddock: '<path d="M5 19C5 11 10.5 5.5 19 5c0 8.5-5.5 14-14 14z"/><path d="M5 19l8-8"/>',
  trail: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h5.5a3.5 3.5 0 0 0 0-7h-3a3.5 3.5 0 0 1 0-7H16"/>',
  office: '<path d="M4 20h16M6 20V8l6-4 6 4v12M10 20v-5h4v5M9 10h.01M15 10h.01"/>',
}
export const PINS = [
  ['clinic', 'clinic', 'Phòng khám thú y', 91.5, 24, 7],
  ['store', 'store', 'Kho thức ăn & vật tư', 43, 9, 7.5],
  ['wash', 'wash', 'Khu tắm & ngâm chân', 43, 26, 5],
  ['track', 'track', 'Đường đua', 20, 47, 1],
  ['jump', 'jump', 'Sân vượt rào', 15, 17, 1],
  ['paddock', 'paddock', 'Bãi chăn thả', 54, 58, 1],
  ['trail', 'trail', 'Đường mòn sức bền', -8, 20, 1],
  ['office', 'office', 'Văn phòng câu lạc bộ', 90, 47, 8.5],
]
export const pinIcon = (k, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${PIN_ICON[k]}</svg>`

// Bố trí minh họa đủ các dãy hiện có, dùng chung cho khối nhà và ghim.
export function stallLayout(zones) {
  const sorted = [...new Set(zones)].sort()
  const columns = Math.max(1, Math.ceil(sorted.length / 4))
  const gap = Math.min(3, 11 / columns), width = (22 - (columns - 1) * gap) / columns
  return sorted.map((zone, index) => {
    const x0 = 60 + Math.floor(index / 4) * (width + gap), y0 = 4 + (index % 4) * 8
    return { zone, x0, y0, x1: x0 + width, y1: y0 + 5.5 }
  })
}

export function campusPins(layout) {
  return [...layout.map(({ zone, x0, y0, x1 }) => [zone, 'stall', `Dãy chuồng ${zone}`, (x0 + x1) / 2, y0 + 4.5, 6.5]), ...PINS]
}

export function scene(layout = []) {
  seed = 7
  let flat = ''
  // nền
  flat += `<rect x="0" y="0" width="${MAP_W}" height="${MAP_H}" fill="#f5f3ed"/>`
  ;[[-10, 70, 30], [100, -10, 26], [104, 20, 18]].forEach(([x, y, r]) => { flat += poly(ellipse(x, y, r, r * 0.7), '#ecebd8') })
  // đường mòn sức bền (vòng ngoài)
  flat += `<path d="${pathOf([[-4, 76, 0], [-10, 50, 0], [-8, 22, 0], [2, -2, 0], [30, -10, 0], [60, -8, 0], [92, -6, 0], [106, 8, 0]])}" stroke="#c7ae8b" stroke-width="3.2" fill="none" stroke-dasharray="7 5" stroke-linecap="round"/>`
  // đường nội bộ
  flat += road([[-30, 36], [110, 36]])
  flat += road([[53, -30], [53, 36]])
  flat += road([[92, 36], [92, 80]], 13)
  flat += road([[53, 36], [53, 40], [60, 44]], 11)
  flat += road([[30, 36], [30, 17], [27.5, 17]], 10)
  flat += road([[30, 36], [33, 41]], 10)
  // bãi đỗ xe
  flat += ground([[85, 57], [103, 57], [103, 73], [85, 73]], '#e1ded6', '#cfcac0')
  for (let i = 0; i < 6; i++) flat += `<path d="${pathOf([[87 + i * 2.8, 59, 0], [87 + i * 2.8, 64, 0]])}" stroke="#fff" stroke-width="1.2"/>`
  for (let i = 0; i < 6; i++) flat += `<path d="${pathOf([[87 + i * 2.8, 66, 0], [87 + i * 2.8, 71, 0]])}" stroke="#fff" stroke-width="1.2"/>`
  // sân trong khu chuồng
  flat += ground([[57, 5], [86, 5], [86, 35], [57, 35]], '#ece6d6')
  // đường đua
  flat += poly(ellipse(22, 53, 21, 14), '#e3d4b4', '#c8b48e', 1)
  flat += poly(ellipse(22, 53, 16.5, 9.5), '#e3e8cc', '#fff', 1.6)
  flat += `<path d="${pathOf(ellipse(22, 53, 21, 14).concat([ellipse(22, 53, 21, 14)[0]]))}" stroke="#fff" stroke-width="1.4" fill="none"/>`
  flat += `<path d="${pathOf(ellipse(22, 53, 18.7, 11.7).concat([ellipse(22, 53, 18.7, 11.7)[0]]))}" stroke="#f6efe0" stroke-width="1" stroke-dasharray="5 4" fill="none"/>`
  // sân vượt rào
  flat += ground([[4, 6], [27, 6], [27, 28], [4, 28]], '#efe1c4', '#cdb791', 1)
  flat += fence([[4, 6], [27, 6], [27, 28], [4, 28]])
  // bãi chăn thả
  flat += ground([[45, 42], [63, 42], [63, 56], [45, 56]], '#e8e4c6')
  flat += ground([[45, 58], [63, 58], [63, 72], [45, 72]], '#e8e4c6')
  flat += fence([[45, 42], [63, 42], [63, 56], [45, 56]]) + fence([[45, 58], [63, 58], [63, 72], [45, 72]])
  // khu tắm: nền nước
  flat += ground([[38, 23], [48, 23], [48, 29], [38, 29]], '#d5e4e6', '#aec7cb')

  const items = []
  // Các dãy chuồng từ dữ liệu hiện tại; không giới hạn ba dãy.
  layout.forEach(({ x0, y0, x1, y1 }) => {
    const item = building(x0, y0, x1, y1, 3, { doors: Math.max(1, Math.round((x1 - x0) / 2.4)) })
    items.push({ ...item, svg: `<g class="campus-stall">${item.svg}</g>` })
  })
  // phòng khám thú y (mái xám nhạt + chữ thập)
  items.push(building(87, 20, 96, 27, 3.6, { roof: '#d9d4c9', roofDark: '#c2bcae', cross: true, windows: 4 }))
  // kho
  items.push(building(37, 5, 49, 13, 4.2, { roof: '#b55a3f', roofDark: '#984731', windows: 0, doors: 2 }))
  // khu tắm: mái che hở
  const shed = []
  ;[[38.5, 23.5], [47.5, 23.5], [38.5, 28.5], [47.5, 28.5]].forEach(([x, y]) => shed.push(`<path d="${pathOf([[x, y, 0], [x, y, 2.6]])}" stroke="#8a7a5c" stroke-width="1.6"/>`))
  items.push({ key: 76, svg: shed.join('') + poly([[37.5, 22.5, 2.6], [48.5, 22.5, 2.6], [48.5, 26, 3.6], [37.5, 26, 3.6]], '#a5432d', '#7f3322', 0.8) + poly([[37.5, 26, 3.6], [48.5, 26, 3.6], [48.5, 29.5, 2.6], [37.5, 29.5, 2.6]], '#c4553b', '#7f3322', 0.8) })
  // văn phòng (2 tầng)
  items.push(building(84, 42, 97, 52, 6, { windows: 6, rh: 2.6 }))
  // khán đài bên đường đua
  items.push(building(10, 66, 34, 70, 2.4, { roof: '#cfcabe', roofDark: '#b9b3a5', rh: 1.2, windows: 10 }))
  // chướng ngại vật trong sân vượt rào
  ;[[9, 11], [17, 10], [22, 17], [12, 20], [19, 24], [8, 25]].forEach(([x, y], i) => {
    const col = ['#c4553b', '#d9a43a', '#5f7046'][i % 3]
    items.push({ key: x + y, svg: `<path d="${pathOf([[x, y, 0], [x, y, 1.3]])}" stroke="#fff" stroke-width="2"/><path d="${pathOf([[x + 3, y, 0], [x + 3, y, 1.3]])}" stroke="#fff" stroke-width="2"/>
      <path d="${pathOf([[x, y, 0.8], [x + 3, y, 0.8]])}" stroke="${col}" stroke-width="2.2"/><path d="${pathOf([[x, y, 1.25], [x + 3, y, 1.25]])}" stroke="#fff" stroke-width="2.2"/><path d="${pathOf([[x, y, 1.25], [x + 3, y, 1.25]])}" stroke="${col}" stroke-width="2.2" stroke-dasharray="3 3"/>` })
  })
  // ngựa
  ;[[46.5, 54], [61.5, 59.5], [47, 70.5]].forEach(([x, y]) => items.push(tree(x, y, 1)))
  // cây
  for (let i = 0; i < 1300; i++) {
    const x = -40 + rnd() * 170, y = -40 + rnd() * 140
    const [px, py] = iso(x, y)
    if (px < 8 || px > MAP_W - 8 || py < 20 || py > MAP_H - 4) continue
    if (busy(x, y)) continue
    items.push(tree(x, y, 0.8 + rnd() * 0.45))
  }
  for (let x = -24; x < 108; x += 4.2) { if (x > 50 && x < 56) continue; if (!busy(x, 31.5)) items.push(tree(x, 31.5, 0.9)); if (!busy(x, 40.5) && !(x > 88 && x < 96)) items.push(tree(x, 40.5, 0.9)) }
  for (let y = 42; y < 82; y += 4.2) { items.push(tree(89, y, 0.85)) }
  items.sort((a, b) => a.key - b.key)
  return flat + items.map(i => i.svg).join('')
}

