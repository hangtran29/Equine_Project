// Run with the isolated apps.core.tests.browser_fixture backend and Vite proxy on 5174.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const base = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:5174'
const chrome = process.env.BROWSER_EXECUTABLE || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)
assert.ok(chrome, 'Set BROWSER_EXECUTABLE to a Chromium browser')
const temp = await mkdtemp(join(tmpdir(), 'equi-stalls-browser-'))
const artifacts = process.env.BROWSER_ARTIFACT_DIR || join(temp, 'screenshots')
await mkdir(artifacts, { recursive: true })
const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${join(temp, 'profile')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const waiting = new Map(), exceptions = []
let socket, nextId = 0

async function until(predicate, label) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const result = await predicate()
    if (result) return result
    await delay(100)
  }
  throw Error(`Timed out: ${label}`)
}
function cdp(method, params = {}) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(Error(`CDP timeout: ${method}`)) }, 15000)
    waiting.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value) }, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
const wait = (selector) => until(() => evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), selector)
const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
async function api(path, token, method = 'GET', body) {
  const response = await fetch(base + '/api' + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) })
  const result = response.status === 204 ? null : await response.json()
  assert.ok(response.ok, `${method} ${path}: ${JSON.stringify(result)}`)
  return result
}
async function screenshot(name) {
  await evaluate('window.scrollTo(0,0)')
  await delay(300)
  const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  await writeFile(join(artifacts, name), Buffer.from(result.data, 'base64'))
}
async function openRole(role, tokens) {
  await evaluate(`localStorage.setItem('equi.access-token', ${JSON.stringify(tokens.access)}); localStorage.setItem('equi.refresh-token', ${JSON.stringify(tokens.refresh)})`)
  await cdp('Page.navigate', { url: `${base}/${role}/stalls` })
  await wait('.map .mpin')
}
async function assertMap() {
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.mpin')).map(e => e.title).filter(t => t.startsWith('Dãy chuồng '))"),
    ['Dãy chuồng A', 'Dãy chuồng B', 'Dãy chuồng C', 'Dãy chuồng D'])
  assert.equal(await evaluate("document.querySelectorAll('.campus-stall').length"), 4)
}
async function openGrid() {
  await evaluate("Array.from(document.querySelectorAll('[role=tab]')).find(e => e.textContent.trim() === 'Sơ đồ chuồng').click()")
  await wait('.stall')
  assert.equal(await evaluate("document.querySelectorAll('.stall').length"), 24)
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.zone')).map(e => e.textContent)"), ['Dãy A', 'Dãy B', 'Dãy C', 'Dãy D'])
}

try {
  const portFile = join(temp, 'profile', 'DevToolsActivePort')
  const port = await until(async () => { try { return (await readFile(portFile, 'utf8')).split('\n')[0] } catch { return '' } }, 'Chromium startup')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const pending = waiting.get(message.id)
      waiting.delete(message.id)
      if (message.error) pending?.reject(Error(message.error.message))
      else pending?.resolve(message.result)
    } else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text)
  }
  await cdp('Page.enable')
  await cdp('Runtime.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false })
  const login = (role) => api('/auth/login', null, 'POST', { Email: `${role}@one.test`, Password: 'test-only-password' })
  const manager = await login('manager'), groom = await login('groom')
  let stalls = await api('/stalls', manager.access)
  for (const zone of ['A', 'B', 'C', 'D']) for (let i = 1; i <= 6; i++) {
    const StallNumber = `${zone}${String(i).padStart(2, '0')}`
    if (!stalls.some((stall) => stall.StallNumber === StallNumber)) await api('/stalls', manager.access, 'POST', { StallNumber })
  }
  const horse = (await api('/horses', manager.access)).find((h) => h.HorseName === 'Thunder')
  assert.ok(horse, 'Use a fresh isolated browser_fixture database')
  await api(`/horses/${horse.HorseID}/move-stall`, manager.access, 'POST', { StallID: stalls[0].StallID })
  stalls = await api('/stalls', manager.access)
  const groomStalls = await api('/stalls', groom.access)
  assert.deepEqual(groomStalls.map(({ StallID, Status }) => ({ StallID, Status })), stalls.map(({ StallID, Status }) => ({ StallID, Status })))

  await cdp('Page.navigate', { url: base + '/login' })
  await wait('.auth-login input[name=email]')
  await openRole('manager', manager)
  await assertMap()
  const positions = await evaluate("Array.from(document.querySelectorAll('.mpin')).map(e => [e.title, e.style.left, e.style.top])")
  await screenshot('manager-four-rows.png')
  await openGrid()
  assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Thêm chuồng'))"), true)

  await openRole('groom', groom)
  await assertMap()
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.mpin')).map(e => [e.title, e.style.left, e.style.top])"), positions)
  await screenshot('groom-four-rows.png')
  await click('.mpin[title="Dãy chuồng D"]')
  await wait('.mcard')
  assert.ok(await evaluate("document.querySelector('.mcard').textContent.includes('6 chuồng · 0 đang sử dụng · 6 còn trống')"))
  await openGrid()
  assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).some(b => /Thêm chuồng|Chuyển chuồng|bảo trì/.test(b.textContent))"), false)

  // Revoking horse access must retain every row and the occupied status.
  await api(`/horses/${horse.HorseID}/groom`, manager.access, 'DELETE')
  await openRole('groom', groom)
  await assertMap()
  await openGrid()
  assert.equal(await evaluate("document.querySelectorAll('.stall.occ').length"), 1)
  assert.equal(await evaluate("document.body.textContent.includes('Thunder')"), false)
  await click('.stall.occ')
  assert.ok(await evaluate("document.querySelector('.stall.occ').textContent.includes('Đang sử dụng')"))
  assert.equal(await evaluate("document.querySelector('.stall.occ').textContent.includes('Sẵn sàng')"), false)
  await screenshot('groom-occupied-outside-assignment.png')

  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await openRole('groom', groom)
  await assertMap()
  await click('.mpin[title="Dãy chuồng D"]')
  await wait('.mcard')
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.mcard')).position"), 'relative')
  await screenshot('groom-mobile-map.png')
  await openGrid()
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
  await screenshot('groom-mobile-grid.png')
  assert.deepEqual(exceptions, [], 'No uncaught browser errors')
  console.log('PASS: Manager and Groom share four rows and 24 stalls; matching pin positions; empty row D; read-only Groom; occupied stalls survive horse-access revocation; mobile map and grid.')
  console.log('Screenshots: ' + artifacts)
} catch (error) {
  try { await screenshot('failure.png') } catch { /* browser may not be available */ }
  throw error
} finally {
  try { await cdp('Browser.close') } catch { /* already closed */ }
  socket?.close()
  browser.kill()
  await delay(200)
  await rm(join(temp, 'profile'), { recursive: true, force: true }).catch(() => {})
}
