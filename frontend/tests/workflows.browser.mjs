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
async function fillLabel(label, value) {
  const field = `Array.from(document.querySelectorAll('label')).find(l => l.querySelector(':scope > span')?.textContent.replaceAll('*', '').trim() === ${JSON.stringify(label)})?.querySelector('input:not([type=hidden]),select,textarea')`
  await until(() => evaluate(`!!(${field})`), 'field ' + label)
  await evaluate(`(() => { const e=${field}; const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true})); })()`)
  await delay(80)
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
  for (const role of ['manager', 'head', 'trainer', 'rider', 'vet', 'groom', 'owner']) tokens[role] = (await api('/auth/login', null, 'POST', { Email: `${role}@one.test`, Password: 'test-only-password' })).access
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
  await navigate(`/vet/horses/${hid}?tab=injuries`, '.injury-region-editor')
  assert.equal(await evaluate("document.querySelectorAll('.injury-diagram-viewer').length"), 1)
  assert.equal(await evaluate("document.querySelector('[data-region-option=\"foreleg:left\"]').checked"), true)
  await evaluate("document.querySelector('[data-region-option=\"neck:left\"]').click()")
  await clickText('Lưu vị trí chấn thương')
  await until(async () => (await api(`/medical-records/${rid}`, tokens.vet)).InjuryLocation.includes('Cổ (bên trái)'), 'persisted selected injury region')
  await navigate(`/vet/horses/${hid}?tab=injuries`, '.injury-region-editor')
  assert.equal(await evaluate("document.querySelector('[data-region-option=\"neck:left\"]').checked"), true)
  await screenshot('injury-regions.png')
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

  await login('groom'); await navigate('/care/today', 'tr[data-task-id]')
  const tasks = await api('/care-tasks', tokens.groom)
  assert.ok(tasks.some(t => t.TaskType === 'Ice Leg Soak'))
  const feeding = tasks.find(t => t.TaskType === 'Feeding')
  const feedingRoot = `document.querySelector('tr[data-task-id="${feeding.CareTaskID}"]')`
  const feedingEditor = `document.querySelector('tr[data-task-editor="${feeding.CareTaskID}"]')`
  await clickText('Hoàn thành', feedingRoot)
  await fill(`tr[data-task-editor="${feeding.CareTaskID}"] select`, 'Partial')
  await clickText('Xác nhận hoàn thành', feedingEditor)
  await until(async () => (await api(`/care-tasks/${feeding.CareTaskID}`, tokens.groom)).FeedingOutcome === 'Partial', 'feeding outcome')
  await screenshot('groom-tasks.png')

  const item = await api('/inventory-items', tokens.manager, 'POST', { ItemName: 'Browser fixture hay', ItemType: 'Food', Unit: 'kg', Quantity: 10, MinimumQuantity: 3 }, 201)
  await navigate('/care/supplies', 'table')
  await clickText('Thêm vào phiếu')
  await fill('input[aria-label="Số lượng Browser fixture hay"]', '4')
  await fill('textarea', 'Hay for assigned care tasks')
  await clickText('Gửi phiếu')
  const request = await until(async () => (await api('/inventory-requests', tokens.manager)).find(r => r.Items.some(i => i.InventoryItemID === item.InventoryItemID)), 'supply request')
  await login('manager'); await navigate('/care/inventory', '.tabs')
  await evaluate("Array.from(document.querySelectorAll('[role=tab]')).find(e=>e.textContent.includes('Yêu cầu cấp vật tư')).click()")
  await fill('textarea[name=approvalNote]', 'Issue for assigned care tasks'); await clickText('Duyệt và xuất kho')
  await until(async () => (await api(`/inventory-items/${item.InventoryItemID}`, tokens.manager)).Quantity === 6, 'deducted stock')
  await api(`/inventory-requests/${request.InventoryRequestID}/approve`, tokens.manager, 'POST', { Note: 'Retry' }, 409)
  assert.equal((await api(`/inventory-items/${item.InventoryItemID}`, tokens.manager)).Quantity, 6)
  await screenshot('manager-inventory.png')

  await login('trainer'); await navigate('/training/my-plans', '.hcards')
  await until(() => evaluate("document.querySelector('.hcards')?.textContent.includes('Đã khóa tập')"), 'G1 trainer lock card')
  assert.ok(await evaluate("document.querySelector('.hcards')?.textContent.includes('Chỉ tập lại sau khi bác sĩ xác nhận mở khóa.')"))
  await clickText('EN')
  await until(() => evaluate("document.querySelector('.hcards')?.textContent.includes('planned review') && document.querySelector('.hcards')?.textContent.includes('Training locked')"), 'English G1 lock instructions')
  await clickText('VI')
  await until(() => evaluate("document.querySelector('.hcards')?.textContent.includes('Đã khóa tập')"), 'Vietnamese G1 lock instructions')
  await navigate(`/training/sessions/new?planId=${plan.TrainingPlanID}`, '.f1 form')
  await fillLabel('Kỵ sĩ tập luyện', String(riders.find(u => u.Email === 'rider@one.test').UserID))
  await fillLabel('Giờ bắt đầu', '10:00'); await fillLabel('Loại bài tập', 'Đi bộ')
  await clickText('Tạo buổi tập'); await wait('[role=dialog]')
  assert.ok(await evaluate("document.querySelector('[role=dialog]')?.textContent.includes('đang khóa tập toàn bộ')"))
  await screenshot('g1-full-training-lock.png')

  await login('vet'); await navigate(`/vet/horses/${hid}/examination?new=1`, '#clinical-examType')
  await fill('#clinical-examType', 'Follow-up'); await fill('#clinical-healthStatus', 'Healthy'); await fill('#clinical-trainingEligibility', 'Eligible')
  await fill('#clinical-followUpLockId', String(lock.TrainingLockID))
  await clickText('Kiểm tra và chốt'); await clickText('Chốt bệnh án')
  await until(async () => (await api(`/horses/${hid}/medical-records`, tokens.vet)).some(r => r.ExamType === 'Follow-up' && r.RecordStatus === 'Signed' && r.FollowUpLockID === lock.TrainingLockID), 'signed matching follow-up')
  await navigate(`/vet/horses/${hid}?tab=training`, '.vet-lock-panel textarea[name=note]')
  await fill('.vet-lock-panel textarea[name=note]', 'Follow-up cleared this episode'); await clickText('Mở khóa sau tái khám')
  await until(async () => (await api(`/training-locks/${lock.TrainingLockID}`, tokens.vet)).LockStatus === 'Released', 'released lock')

  // New SOURCE screens must retain the TARGET contracts as well.
  const earlySession = await api('/training-sessions', tokens.head, 'POST', {
    TrainingPlanStageID: active.Stages[0].TrainingPlanStageID, WorkRiderID: riders.find(u => u.Email === 'rider@one.test').UserID,
    SessionDate: today, StartTime: '08:00', TrainingType: 'Walk', TrainingLoad: 20, DurationPlannedMinutes: 45,
  }, 201)
  await api(`/training-sessions/${earlySession.TrainingSessionID}/start`, tokens.rider, 'POST')
  await login('rider'); await navigate(`/training/work-rider-sessions/${earlySession.TrainingSessionID}/result`, '.f1 form')
  for (const [label, value] of [['Thời lượng thực tế', '20'], ['Quãng đường thực tế', '1'], ['Điểm đánh giá', '70'], ['Tốc độ trung bình', '3'], ['Tốc độ tối đa', '5'], ['Hồi phục', '10']]) await fillLabel(label, value)
  await fillLabel('Lý do kết thúc sớm', 'Fatigue'); await fillLabel('Kết thúc lúc', '08:20')
  await fillLabel('Mô tả lý do kết thúc sớm', 'Browser integration: tired after twenty minutes')
  await fillLabel('Nhận xét buổi tập', 'Recovered with rest')
  await clickText('Lưu kết quả')
  const earlyResult = await until(async () => { const s = await api(`/training-sessions/${earlySession.TrainingSessionID}`, tokens.rider); return s.Status === 'Completed' && s }, 'early session result')
  assert.equal(earlyResult.Result.EarlyEndReason, 'Fatigue'); assert.equal(earlyResult.EndTime, '08:20:00')

  await login('groom'); await clickText('Gửi yêu cầu hỗ trợ')
  await fillLabel('Chủ đề', 'Care'); await fillLabel('Ngựa liên quan', String(hid)); await fillLabel('Nội dung', 'Browser integration support')
  await clickText('Gửi yêu cầu')
  const support = await until(async () => (await api('/support-requests', tokens.manager)).find(r => r.Content === 'Browser integration support'), 'support created')
  await login('manager'); await navigate(`/manager/support-requests?id=${support.SupportRequestID}`, '.f1 textarea')
  await fillLabel('Phản hồi', 'Browser integration support resolved'); await clickText('Gửi phản hồi và đóng yêu cầu')
  await until(async () => (await api('/support-requests', tokens.manager)).some(r => r.SupportRequestID === support.SupportRequestID && r.Status === 'Resolved'), 'support resolved')
  await login('groom'); await evaluate("document.querySelector('.nb-bell').click()")
  await until(() => evaluate("document.querySelector('.nb-drop')?.textContent.includes('Browser integration support resolved')"), 'support reply in notification bell')

  await login('manager'); await navigate('/manager/horses', '.f1 h1')
  await clickText('EN')
  await until(() => evaluate("document.documentElement.lang==='en' && /horse/i.test(document.querySelector('.f1 h1')?.textContent || '')"), 'English UI after reload')
  await clickText('VI'); await until(() => evaluate("document.documentElement.lang==='vi' && document.querySelector('.f1 h1')?.textContent==='Danh sách ngựa'"), 'Vietnamese UI after reload')
  await screenshot('integrated-manager.png')

  const account = await api('/users', tokens.manager, 'POST', { FullName: 'Integration Owner', Email: 'integration.owner@example.test', Phone: '0912345678', Address: '1 Integration Street', RoleCode: 'HORSE_OWNER' }, 201)
  await navigate('/login', 'body'); await evaluate('localStorage.clear()'); await navigate('/login', '.auth-login input[name=email]')
  await fill('.auth-login input[name=email]', account.Email); await fill('.auth-login input[name=password]', account.TemporaryPassword)
  await evaluate("document.querySelector('.auth-login button[type=submit]').click()")
  await wait('input[placeholder="Mật khẩu tạm thời hiện tại"]')
  await fill('input[placeholder="Mật khẩu tạm thời hiện tại"]', account.TemporaryPassword)
  await fill('input[placeholder="Mật khẩu mới"]', 'integration-new-password')
  await fill('input[placeholder="Xác nhận mật khẩu mới"]', 'integration-new-password'); await clickText('Xác nhận đổi mật khẩu')
  await wait('.app-shell')
  const newLogin = await api('/auth/login', null, 'POST', { Email: account.Email, Password: 'integration-new-password' })
  assert.equal((await api('/auth/me', newLogin.access)).MustChangePassword, false)

  await login('owner'); await navigate('/owner/horses/new', '.f1 form')
  const catalogs = await api('/catalogs', tokens.owner)
  for (const [label, value] of [['Tên ngựa', 'Browser Integration Horse'], ['Giống ngựa', 'Thoroughbred'], ['Ngày sinh', '10/03/2021'], ['Giới tính', 'Male'], ['Màu lông', catalogs.CoatColors[0].Value], ['Số hộ chiếu (UELN)', '704001000000987'], ['Mã định danh', '985000000000987'], ['Tên ngựa bố', 'Integration Sire'], ['Tên ngựa mẹ', 'Integration Dam'], ['Tình trạng sức khỏe hiện tại', 'Khỏe mạnh theo quan sát của chủ ngựa']]) await fillLabel(label, value)
  await evaluate("document.querySelector('.date-native').showPicker()")
  await wait('.vdp')
  assert.ok(await evaluate("document.querySelector('.vdp').textContent.includes('Hôm nay')"))
  await evaluate("Array.from(document.querySelectorAll('.vdp-day')).find(e=>e.textContent==='11'&&!e.classList.contains('other')).click()")
  await clickText('Lưu hồ sơ nháp')
  const registered = await until(async () => (await api('/horses', tokens.owner)).find(h => h.HorseName === 'Browser Integration Horse'), 'owner draft horse')
  assert.equal(registered.DateOfBirth, '2021-03-11')
  await until(() => evaluate("document.querySelector('h1')?.textContent==='Hồ sơ ngựa'"), 'owner detail')
  await clickText('Gửi hồ sơ cho câu lạc bộ'); await clickText('Gửi hồ sơ')
  await until(async () => (await api(`/horses/${registered.HorseID}`, tokens.owner)).RegistrationStatus === 'Submitted', 'submitted registration')
  await login('manager'); await navigate(`/manager/horses/${registered.HorseID}/intake`, '.f1 h1'); await clickText('Xác nhận hồ sơ hợp lệ')
  await until(async () => (await api(`/horses/${registered.HorseID}`, tokens.manager)).RegistrationStatus === 'PendingExam', 'verified registration')
  await login('vet'); await navigate(`/vet/horses/${registered.HorseID}/examination`, '.f1 h1')
  assert.ok(await evaluate("location.pathname.endsWith('/clinical')"), 'Legacy intake route uses the canonical clinical screen')
  for (const [label, value] of [['Cân nặng', '450'], ['Chiều cao', '155'], ['Thân nhiệt', '38.4'], ['Nhịp tim', '42'], ['Nhịp thở', '18'], ['Tình trạng sức khỏe', 'Healthy'], ['Điều kiện tập luyện', 'Eligible'], ['Kết luận', 'Đủ điều kiện tiếp nhận']]) await fillLabel(label, value)
  await clickText('Ký duyệt'); await wait('[role=dialog]'); await clickText('Ký duyệt', "document.querySelector('[role=dialog]')")
  await until(async () => (await api(`/horses/${registered.HorseID}/medical-records`, tokens.vet)).some(r => r.RecordStatus === 'Signed' && Number(r.BodyTemperatureC) === 38.4), 'signed intake exam')
  await login('manager'); await navigate(`/manager/horses/${registered.HorseID}/intake`, '.f1 h1')
  const stalls = await api('/stalls?Status=Available', tokens.manager)
  const grooms = await api('/users?RoleCode=GROOM', tokens.manager)
  await fillLabel('Chuồng', String(stalls[0].StallID)); await fillLabel('Người chăm sóc phụ trách', String(grooms[0].UserID)); await clickText('Phê duyệt hồ sơ')
  await until(async () => (await api(`/horses/${registered.HorseID}`, tokens.manager)).RegistrationStatus === 'Approved', 'completed intake')
  await screenshot('integrated-intake.png')

  // The G1 map uses the same BE and role scope as care; only Manager may change stalls.
  await navigate('/manager/stalls', '.map .mzoom')
  await delay(250)
  const transformBefore = await evaluate("document.querySelector('.map > div').style.transform")
  await evaluate("document.querySelector('[aria-label=\"Phóng to\"]').click()")
  await until(async () => (await evaluate("document.querySelector('.map > div').style.transform")) !== transformBefore, 'map zoom')
  const compass = await evaluate("(() => { const r=document.querySelector('.mcompass').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()")
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...compass, button: 'left', clickCount: 1 })
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...compass, button: 'left', clickCount: 1 })
  await until(() => evaluate("document.querySelector('.mcompass').style.transform==='rotate(90deg)'"), 'map compass')
  const mapPoint = await evaluate("(() => { const r=document.querySelector('.map').getBoundingClientRect(); return {x:r.x+12,y:r.y+80} })()")
  const beforePan = await evaluate("document.querySelector('.map > div').style.transform")
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...mapPoint, button: 'left', clickCount: 1 })
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mapPoint.x + 45, y: mapPoint.y + 15, buttons: 1 })
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mapPoint.x + 45, y: mapPoint.y + 15, button: 'left', clickCount: 1 })
  await until(async () => (await evaluate("document.querySelector('.map > div').style.transform")) !== beforePan, 'map pan')
  await screenshot('g1-manager-map.png')

  await login('groom'); await navigate('/groom/stalls', '.map .mzoom')
  assert.ok(await evaluate("!!document.querySelector('nav a[href=\"/groom/stalls\"]')"))
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await evaluate("document.querySelector('.mpin').click()")
  await wait('.mcard')
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.mcard')).position"), 'relative')
  await screenshot('g1-groom-mobile-map.png')
  await evaluate("Array.from(document.querySelectorAll('[role=tab]')).find(e=>e.textContent.trim()==='Sơ đồ chuồng').click()")
  await wait('.stall'); await evaluate("document.querySelector('.stall').click()")
  assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).some(b=>/Thêm chuồng|Chuyển chuồng|Lưu hạn bảo trì|Hoàn tất bảo trì/.test(b.textContent))"), false)
  assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), 'No page overflow at 390px')
  await screenshot('g1-groom-mobile-stalls.png')
  await clickText('Đăng xuất'); await wait('.auth-login input[name=email]')
  assert.deepEqual(exceptions, [], 'No uncaught browser errors')
  console.log('PASS: real API + Chromium: health incident, drug, persisted injury region selections in one diagram, signed care orders, FeedingOutcome, one stock deduction, matching follow-up unlock; early-end result, support/reply bell, VI/EN, temporary password change, Owner registration/date picker -> Manager verification -> Vet vital signs/signature -> Manager intake; G1 trainer lock warning, scheduling lock dialog, map zoom/pan/compass, Groom read-only map/grid at 390px.')
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
