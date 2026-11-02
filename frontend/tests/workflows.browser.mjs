// Real Chromium + disposable backend browser_fixture on 8002, Vite proxy on 5175.
// Never run against the business database. See backend/docs/FLOW34_IMPLEMENTATION_20261102.md.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { clubToday } from '../src/pages/vet/vetDomain.js'

const base = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:5175'
assert.ok(new URL(base).hostname === '127.0.0.1', 'Only the disposable local fixture is supported')
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
assert.ok(chrome)
const temporary = await mkdtemp(join(tmpdir(), 'equi-workflows-'))
const profile = join(temporary, 'profile')
const artifacts = resolve('artifacts', `workflows-${Date.now()}`)
await mkdir(artifacts, { recursive: true })
const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, seq = 0
const pending = new Map(), exceptions = []
async function until(fn, label, timeout = 20000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { const result = await fn(); if (result) return result; await delay(120) }
  throw new Error('Timed out: ' + label)
}
function cdp(method, params = {}) {
  const id = ++seq
  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(method)) }, 20000)
    pending.set(id, { resolve: v => { clearTimeout(timeout); resolvePromise(v) }, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}
const wait = selector => until(() => evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), selector)
async function fill(selector, value) {
  await wait(selector)
  await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); const prototype=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true})); })()`)
  await delay(80)
}
async function clickText(text, root = 'document') {
  const expression = `Array.from(${root}.querySelectorAll('button')).find(e=>e.textContent.trim()===${JSON.stringify(text)}&&!e.disabled)`
  await until(() => evaluate(`!!(${expression})`), text)
  await evaluate(`(${expression}).click()`); await delay(120)
}
async function navigate(path, selector = '.page-content') {
  await cdp('Page.navigate', { url: base + path }); await wait(selector)
}
async function login(role) {
  await navigate('/login', 'body')
  await evaluate('localStorage.clear()')
  await navigate('/login', '.auth-login input[name=email]')
  await fill('.auth-login input[name=email]', `${role}@one.test`)
  await fill('.auth-login input[name=password]', 'test-only-password')
  await evaluate("document.querySelector('.auth-login button[type=submit]').click()")
  await wait('.app-shell')
}
async function api(path, token, method = 'GET', body, expected = 200) {
  const response = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const text = await response.text(), data = text ? JSON.parse(text) : null
  assert.equal(response.status, expected, `${method} ${path}: ${text.slice(0, 500)}`)
  return data
}
async function screenshot(name) { await writeFile(join(artifacts, name), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64')) }

try {
  const port = await until(async () => { try { return (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0] } catch { return null } }, 'browser startup')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolvePromise, reject) => { socket.onopen = resolvePromise; socket.onerror = reject })
  socket.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p?.reject(new Error(m.error.message)); else p?.resolve(m.result) } else if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.text) }
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  const tokens = {}
  for (const role of ['manager', 'head', 'trainer', 'rider', 'vet', 'groom']) tokens[role] = (await api('/auth/login', null, 'POST', { Email: `${role}@one.test`, Password: 'test-only-password' })).access
  const horse = (await api('/horses', tokens.manager)).find(h => h.HorseName === 'Thunder')
  const hid = horse.HorseID
  const today = clubToday(), tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)
  const clearance = await api(`/horses/${hid}/medical-records`, tokens.vet, 'POST', { ExamType: 'Routine Exam', HealthStatus: 'Healthy', TrainingEligibility: 'Eligible' }, 201)
  await api(`/medical-records/${clearance.MedicalRecordID}/sign`, tokens.vet, 'POST')
  const trainers = await api('/users?RoleCode=TRAINER', tokens.head)
  await api('/trainer-assignments', tokens.head, 'POST', { HorseID: hid, TrainerID: trainers.find(u => u.Email === 'trainer@one.test').UserID, SpecializationID: 1 }, 201)
  const plan = await api('/training-plans', tokens.trainer, 'POST', { HorseID: hid, Goal: 'Browser test only', StartDate: today, EndDate: tomorrow,
    OverallIntensity: 'Low', Stages: [{ StageName: 'Test', StartDate: today, EndDate: tomorrow, Intensity: 'Low', TrainingLoad: 20 }] }, 201)
  await api(`/training-plans/${plan.TrainingPlanID}/submit`, tokens.trainer, 'POST')
  const active = await api(`/training-plans/${plan.TrainingPlanID}/approve`, tokens.head, 'POST', {})
  const riders = await api('/users?RoleCode=WORK_RIDER', tokens.head)
  const session = await api('/training-sessions', tokens.head, 'POST', { TrainingPlanStageID: active.Stages[0].TrainingPlanStageID,
    WorkRiderID: riders.find(u => u.Email === 'rider@one.test').UserID, SessionDate: today, StartTime: '06:00', TrainingType: 'Walk', TrainingLoad: 20, DurationPlannedMinutes: 30 }, 201)
  await api(`/training-sessions/${session.TrainingSessionID}/start`, tokens.rider, 'POST')

  await login('groom'); await navigate(`/health-reports?horse=${hid}`, 'textarea')
  await fill('textarea', 'Browser fixture: swollen foreleg')
  // Select by the label's select rather than a positional index across the page.
  await evaluate("document.querySelectorAll('.care-form select')[1].value='Urgent';document.querySelectorAll('.care-form select')[1].dispatchEvent(new Event('change',{bubbles:true}))")
  const dom = await cdp('DOM.getDocument')
  const fileNode = await cdp('DOM.querySelector', { nodeId: dom.root.nodeId, selector: 'input[type=file]' })
  await cdp('DOM.setFileInputFiles', { nodeId: fileNode.nodeId, files: [resolve('public/images/injury/horse-reference-cutout-v2.png')] })
  await clickText('Gửi báo cáo')
  const report = await until(async () => (await api('/health-reports?open=1', tokens.vet)).find(r => r.HorseID === hid), 'saved report')
  assert.equal(report.Severity, 'Urgent'); assert.equal(report.Attachments.length, 1)
  assert.equal((await api(`/training-sessions/${session.TrainingSessionID}`, tokens.head)).Status, 'Cancelled')
  await screenshot('groom-report.png')

  await login('vet'); await navigate(`/vet/reports?report=${report.HealthReportID}&status=all`, '.vet-report')
  await until(() => evaluate("!!document.querySelector('.care-report-photos img')?.naturalWidth"), 'private report image')
  await clickText('Nhận xử lý')
  await navigate(`/vet/horses/${hid}/examination?report=${report.HealthReportID}`, '#clinical-examType')
  await fill('#clinical-examType', 'Injury Exam'); await fill('#clinical-healthStatus', 'Injured')
  await fill('#clinical-trainingEligibility', 'Not Eligible'); await fill('#clinical-diagnosis', 'Browser test injury')
  await fill('#clinical-conclusion', 'Rest and follow-up'); await fill('#clinical-followUpDate', tomorrow)
  await evaluate("document.querySelector('[data-region-option=\"foreleg:left\"]').click()")
  await clickText('Lưu nháp')
  const record = await until(async () => (await api(`/horses/${hid}/medical-records`, tokens.vet)).find(r => r.Diagnosis === 'Browser test injury'), 'saved examination')
  const rid = record.MedicalRecordID
  await wait('#clinical-examType'); await clickText('Thêm thuốc')
  for (const [key, value] of Object.entries({ MedicineName: 'Fixture medicine', Dose: '1 test unit', StartDate: today, EndDate: tomorrow, WithdrawalUntil: tomorrow, Note: 'Fixture instructions only' })) await fill(`#drug-${key}`, value)
  await fill('#drug-Route', 'Oral'); await clickText('Lưu thuốc')
  await until(async () => (await api(`/medical-records/${rid}/treatments`, tokens.vet)).length === 1, 'saved prescription')
  await navigate(`/vet/horses/${hid}?tab=injuries`, '.injury-layout')
  await clickText('Thêm vị trí chấn thương', "document.querySelector('.injury-layout')")
  await fill('.injury-layout select[name=diagramRegion]', 'foreleg')
  await fill('.injury-layout textarea[name=description]', 'Persistent browser marker')
  await clickText('Lưu chấn thương')
  await until(async () => (await api(`/horses/${hid}/injury-markers`, tokens.vet)).some(m => m.description === 'Persistent browser marker'), 'persisted marker')
  await navigate(`/vet/horses/${hid}?tab=injuries`, '.injury-layout')
  await until(() => evaluate("document.querySelector('.injury-layout').textContent.includes('Persistent browser marker')"), 'reloaded marker')
  await screenshot('persistent-marker.png')
  await navigate(`/vet/horses/${hid}/examination?record=${rid}`, '#clinical-examType')
  await clickText('Kiểm tra và chốt'); await clickText('Chốt bệnh án')
  await until(async () => (await api(`/medical-records/${rid}`, tokens.vet)).RecordStatus === 'Signed', 'signed record')
  const lock = (await api(`/training-locks?HorseID=${hid}&LockStatus=Active`, tokens.vet))[0]
  assert.equal(lock.LockLevel, 'Full')
  await navigate(`/vet/horses/${hid}?tab=treatments`, 'select[name=record]')
  await fill('select[name=record]', String(rid)); await fill('select[name=lock]', String(lock.TrainingLockID)); await fill('select[name=kind]', 'Ice Leg Soak')
  await fill('textarea[name=instructions]', 'Fixture cold care instructions'); await fill('input[name=end]', tomorrow)
  await clickText('Lưu chỉ định chăm sóc')
  await until(async () => (await api(`/horses/${hid}/care-orders`, tokens.vet)).length > 0, 'saved care order')
  await api(`/health-reports/${report.HealthReportID}/resolve`, tokens.vet, 'POST', { VetNote: 'Examined, signed and care ordered' })
  const diet = await api(`/horses/${hid}/diet-plans`, tokens.head, 'POST', { StartDate: today, Meals: [{ MealTime: '17:00', FeedType: 'Hay', Quantity: 2, Unit: 'kg' }] }, 201)
  await api(`/diet-plans/${diet.DietPlanID}/approve`, tokens.head, 'POST', {})

  await login('groom'); await navigate('/care/today', '.care-task-list')
  const tasks = await api('/care-tasks', tokens.groom)
  assert.ok(tasks.some(t => t.TaskType === 'Ice Leg Soak'))
  const feeding = tasks.find(t => t.TaskType === 'Feeding')
  const feedingRoot = "Array.from(document.querySelectorAll('.care-task')).find(e=>e.textContent.includes('Cho ăn'))"
  await clickText('Đã làm', feedingRoot)
  await evaluate(`(${feedingRoot}).querySelector('select').value='Partial';(${feedingRoot}).querySelector('select').dispatchEvent(new Event('change',{bubbles:true}))`)
  await clickText('Xác nhận đã làm', feedingRoot)
  await until(async () => (await api(`/care-tasks/${feeding.CareTaskID}`, tokens.groom)).FeedingOutcome === 'Partial', 'feeding outcome')
  await screenshot('groom-tasks.png')

  const item = await api('/inventory-items', tokens.manager, 'POST', { ItemName: 'Browser fixture hay', ItemType: 'Food', Unit: 'kg', Quantity: 10, MinimumQuantity: 3 }, 201)
  await navigate('/care/supplies', '.care-table')
  await clickText('Thêm vào phiếu')
  await fill('.care-line input[type=number]', '4')
  await clickText('Gửi phiếu (1 vật tư)')
  const request = await until(async () => (await api('/inventory-requests', tokens.manager)).find(r => r.Items.some(i => i.InventoryItemID === item.InventoryItemID)), 'supply request')
  await login('manager'); await navigate('/care/inventory', 'input[name=approvalNote]')
  await fill('input[name=approvalNote]', 'Issue for assigned care tasks'); await clickText('Duyệt và xuất kho')
  await until(async () => (await api(`/inventory-items/${item.InventoryItemID}`, tokens.manager)).Quantity === 6, 'deducted stock')
  await api(`/inventory-requests/${request.InventoryRequestID}/approve`, tokens.manager, 'POST', { Note: 'Retry' }, 409)
  assert.equal((await api(`/inventory-items/${item.InventoryItemID}`, tokens.manager)).Quantity, 6)
  await screenshot('manager-inventory.png')

  await login('vet'); await navigate(`/vet/horses/${hid}/examination?new=1`, '#clinical-examType')
  await fill('#clinical-examType', 'Follow-up'); await fill('#clinical-healthStatus', 'Healthy'); await fill('#clinical-trainingEligibility', 'Eligible')
  await fill('#clinical-followUpLockId', String(lock.TrainingLockID))
  await clickText('Kiểm tra và chốt'); await clickText('Chốt bệnh án')
  await until(async () => (await api(`/horses/${hid}/medical-records`, tokens.vet)).some(r => r.ExamType === 'Follow-up' && r.RecordStatus === 'Signed' && r.FollowUpLockID === lock.TrainingLockID), 'signed matching follow-up')
  await navigate(`/vet/horses/${hid}?tab=training`, '.vet-lock-panel textarea[name=note]')
  await fill('.vet-lock-panel textarea[name=note]', 'Follow-up cleared this episode'); await clickText('Mở khóa sau tái khám')
  await until(async () => (await api(`/training-locks/${lock.TrainingLockID}`, tokens.vet)).LockStatus === 'Released', 'released lock')
  assert.deepEqual(exceptions, [], 'No uncaught browser errors')
  console.log('PASS: real API + Chromium: Groom urgent photo report stops training; Vet views photo, takes case, saves exam, drug, 2D marker/reload, signs and orders care; Groom records meal outcome; supply request -> Manager approval -> stock changes once; matching signed follow-up -> unlock.')
  console.log('Screenshots: ' + artifacts)
} catch (error) {
  try { await screenshot('failure.png'); console.error(await evaluate("document.body.innerText.slice(-3000)")) } catch { /* browser may have closed */ }
  throw error
} finally {
  try { await cdp('Browser.close') } catch { browser.kill() }
  socket?.close(); await delay(300)
  assert.ok(resolve(temporary).startsWith(resolve(tmpdir()) + sep))
  await rm(temporary, { recursive: true, force: true, maxRetries: 4, retryDelay: 300 })
}
