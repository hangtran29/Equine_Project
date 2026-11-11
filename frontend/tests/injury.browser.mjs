// Real Chromium and isolated Django browser_fixture on 8001; Vite on 5174.
// All medical mutations target the disposable fixture database only.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { clubToday } from '../src/pages/vet/vetDomain.js'
import { bodyRegions, DIAGRAM_WIDTH } from '../src/components/injury/horseDiagram.js'
import { readInjuryLocation, writeInjuryLocation } from '../src/components/injury/injuryLocation.js'

const base = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:5174'
const chrome = process.env.BROWSER_EXECUTABLE || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
assert.ok(chrome, 'Chromium executable required')
const temporary = await mkdtemp(join(tmpdir(), 'equi-injury-regions-'))
const artifacts = process.env.BROWSER_ARTIFACT_DIR || resolve('artifacts', `injury-regions-${Date.now()}`)
await mkdir(artifacts, { recursive: true })
const profile = resolve(temporary, 'profile')
assert.ok(profile.startsWith(resolve(temporary) + (process.platform === 'win32' ? '\\' : '/')))
const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0, acceptDialog = false, failPatch = false, loseReply = false
const pending = new Map(), exceptions = [], writes = []
async function until(predicate, label, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { const value = await predicate(); if (value) return value; await delay(100) }
  throw new Error(`Timed out: ${label}`)
}
function cdp(method, params = {}) {
  const id = ++sequence
  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 15000)
    pending.set(id, { resolve: value => { clearTimeout(timeout); resolvePromise(value) }, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
const waitSelector = selector => until(() => evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), selector)
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(80) }
async function fill(selector, value) {
  await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  await delay(60)
}
async function select(selector, value) {
  await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await delay(80)
}
async function screenshot(name) {
  await writeFile(join(artifacts, name), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64'))
}
async function api(path, token, method = 'GET', body, expected = 200) {
  const response = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = await response.json()
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  return data
}
const location = () => evaluate(`document.querySelector('textarea[name=InjuryLocation]').value`)
const selection = async () => readInjuryLocation(await location()).selected
const ready = () => until(() => evaluate(`document.querySelector('.injury-diagram-stage')?.dataset.photoState==='ready'`), 'photo ready')
const side = async right => {
  await evaluate(`document.querySelectorAll('.injury-diagram-toolbar button')[${right ? 1 : 0}].click()`); await delay(80)
}
async function diagramPoint(x, y, touch = false) {
  await evaluate(`document.querySelector('.injury-horse-svg').scrollIntoView({block:'center',behavior:'instant'})`)
  const point = await evaluate(`(() => {const p=new DOMPoint(${x},${y}).matrixTransform(document.querySelector('.injury-horse-svg').getScreenCTM());return {x:p.x,y:p.y}})()`)
  if (touch) {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] })
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } else {
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 })
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 })
  }
  await delay(90)
}
async function pixelAt(x, y) {
  const point = await evaluate(`(() => {const p=new DOMPoint(${x},${y}).matrixTransform(document.querySelector('.injury-horse-svg').getScreenCTM());return {x:Math.round(p.x),y:Math.round(p.y)}})()`)
  const shot = await cdp('Page.captureScreenshot', {format:'png'})
  return evaluate(`(async () => {const photo=new Image();photo.src='data:image/png;base64,${shot.data}';await photo.decode();const canvas=document.createElement('canvas');canvas.width=photo.width;canvas.height=photo.height;const ctx=canvas.getContext('2d');ctx.drawImage(photo,0,0);return Array.from(ctx.getImageData(${point.x},${point.y},1,1).data)})()`)
}
async function login(email) {
  await cdp('Page.navigate', { url: base + '/login' }); await waitSelector('.auth-login input[name=email]')
  await fill('.auth-login input[name=email]', email); await fill('.auth-login input[name=password]', 'test-only-password')
  await click('.auth-login button[type=submit]'); await waitSelector('.app-shell')
}
async function navigate(path) {
  await cdp('Page.navigate', { url: base + path }); await waitSelector('.injury-region-editor'); await ready()
  assert.equal(await evaluate("document.querySelectorAll('.injury-diagram-viewer').length"), 1, 'Vet uses one injury diagram')
  assert.equal(await evaluate("!!document.querySelector('.injury-region-editor .injury-diagram-viewer')"), true, 'The region picker with the dark green background is retained')
}

try {
  const port = await until(async () => { try { return (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0] } catch { return '' } }, 'browser startup')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolvePromise, reject) => { socket.onopen = resolvePromise; socket.onerror = reject })
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (message.id) { const request = pending.get(message.id); pending.delete(message.id); if (message.error) request?.reject(new Error(message.error.message)); else request?.resolve(message.result) }
    else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text)
    else if (message.method === 'Page.javascriptDialogOpening') void cdp('Page.handleJavaScriptDialog', { accept: acceptDialog })
    else if (message.method === 'Network.requestWillBeSent' && message.params.request.url.includes('/api/') && !['GET', 'OPTIONS'].includes(message.params.request.method)) writes.push({ url: message.params.request.url, method: message.params.request.method, body: message.params.request.postData })
    else if (message.method === 'Fetch.requestPaused') {
      const p = message.params
      if (p.request.method === 'PATCH' && failPatch) { failPatch = false; void cdp('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 503, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from('{"detail":"Fixture failure"}').toString('base64') }) }
      else if (p.request.method === 'PATCH' && loseReply && p.responseStatusCode) { loseReply = false; void cdp('Fetch.failRequest', { requestId: p.requestId, errorReason: 'ConnectionClosed' }) }
      else void cdp('Fetch.continueRequest', { requestId: p.requestId })
    }
  }
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  const auth = await api('/auth/login', null, 'POST', { Email: 'vet@one.test', Password: 'test-only-password' })
  const vet2 = await api('/auth/login', null, 'POST', { Email: 'vet2@one.test', Password: 'test-only-password' })
  const horses = await api('/horses', auth.access)
  const horse = (Array.isArray(horses) ? horses : horses.results).find(row => row.HorseName === 'Thunder')
  assert.ok(horse)
  const horseId = horse.HorseID
  const payload = { ExamType: 'Injury Exam', ExamDate: `${clubToday()}T09:00:00`, InjuryLocation: 'Cổ chân trước trái — hồ sơ thật', Diagnosis: 'Ghi nhận kiểm tra', TreatmentPlan: 'Giữ nguyên phác đồ', Symptoms: 'Giữ nguyên triệu chứng', Note: 'Giữ nguyên ghi chú', HealthStatus: 'Injured', TrainingEligibility: 'Not Eligible' }
  const record = await api(`/horses/${horseId}/medical-records`, auth.access, 'POST', payload, 201)
  const recordId = record.MedicalRecordID
  await login('vet@one.test')
  const profilePath = `/vet/horses/${horseId}?tab=injuries`
  await navigate(profilePath)
  await click(`[data-injury-record="${recordId}"]`)
  assert.equal(await location(), payload.InjuryLocation)
  assert.deepEqual(await selection(), [], 'legacy prose is not guessed into diagram regions')
  assert.equal(await evaluate(`document.querySelectorAll('.injury-region-editor .injury-horse-svg > image').length`), 1)
  assert.equal(await evaluate(`document.querySelectorAll('.injury-region-editor .injury-body-region').length`), bodyRegions.length)
  const initialLocal = await evaluate(`JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.includes('token'))))`)

  // Both views retain the photo and reflect photo, mask and paths together.
  // Real pointer events must select the anatomical side currently displayed.
  for (const view of ['left', 'right']) {
    await side(view === 'right')
    assert.equal(await evaluate(`document.querySelectorAll('.injury-region-editor .injury-horse-svg > image').length`),1,`${view} photo visible`)
    const transforms = await evaluate(`(() => { const image = document.querySelector('.injury-horse-svg > image'); const path = document.querySelector('[data-region=head]'); return {image:image.getCTM().a,region:path.getCTM().a} })()`)
    assert.equal(Math.sign(transforms.image),view==='right'?-1:1,`${view} photo orientation`)
    assert.equal(Math.sign(transforms.region),Math.sign(transforms.image),`${view} paths match photo orientation`)
    for (const region of bodyRegions) {
      const [x,y] = region.anchor
      const point = [view==='right'?DIAGRAM_WIDTH-x:x,y]
      await diagramPoint(...point)
      assert.ok((await selection()).includes(`${region.id}:${view}`), `pointer selects ${region.id}:${view}`)
      assert.equal(await evaluate(`document.querySelector('[data-region=${region.id}]').getAttribute('aria-pressed')`), 'true')
      assert.equal(await evaluate(`document.querySelector('[data-region-option="${region.id}:${view}"]').checked`), true)
      assert.ok((await evaluate(`document.querySelector('.injury-region-caption').textContent`)).includes(region.label))
      await diagramPoint(...point)
      assert.ok(!(await selection()).includes(`${region.id}:${view}`), `second click removes ${region.id}:${view}`)
    }
    const [headX,headY] = bodyRegions[0].anchor
    const headPoint = [view==='right'?DIAGRAM_WIDTH-headX:headX,headY]
    await diagramPoint(...headPoint)
    const selectedPixel = await pixelAt(...headPoint)
    await diagramPoint(...headPoint)
    const originalPixel = await pixelAt(...headPoint)
    assert.notDeepEqual(selectedPixel,originalPixel,`${view} selection visibly changes rendered photo pixels`)
    const beforeBackground = await location()
    for (const [x,y] of [[40,40],[600,850],[130,600],[420,930]]) await diagramPoint(view==='right'?DIAGRAM_WIDTH-x:x,y)
    assert.equal(await location(), beforeBackground, `${view} background, tail, gaps and far leg cannot be selected`)
  }
  await side(false)

  // Keyboard focuses a path, exposes its label, and Space toggles without submit.
  await evaluate(`document.querySelector('[data-region=head]').focus()`)
  assert.ok((await evaluate(`document.querySelector('.injury-region-caption').textContent`)).includes('Đầu'))
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }); await delay(80)
  assert.ok((await selection()).includes('head:left'))
  await click('[data-region-option="back:left"]')
  const beforeRightView = await location()
  await side(true)
  assert.equal(await location(),beforeRightView,'changing views preserves anatomy and body-side labels')
  assert.equal(await evaluate(`document.querySelectorAll('.injury-region-editor .injury-body-region').length`), bodyRegions.length, 'right view has interactive regions')
  assert.equal(await evaluate(`document.querySelector('[data-region=head]').getAttribute('aria-pressed')`),'false','left head does not highlight the right head')
  await evaluate(`document.querySelector('[data-region=head]').focus()`)
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13}); await delay(80)
  assert.ok((await selection()).includes('head:right'),'keyboard selects right head')
  assert.ok((await selection()).includes('head:left'),'keyboard does not relabel left head')
  await diagramPoint(DIAGRAM_WIDTH-bodyRegions[0].anchor[0],bodyRegions[0].anchor[1])
  await click('[data-region-option="foreleg:right"]')
  assert.equal(await evaluate(`document.querySelector('[data-region=foreleg]').getAttribute('aria-pressed')`),'true','right checkbox paints the right diagram')
  assert.deepEqual(new Set(await selection()), new Set(['head:left', 'back:left', 'foreleg:right']))
  for (const key of ['shoulder','hindleg']) { const [x,y]=bodyRegions.find(region=>region.id===key).anchor; await diagramPoint(DIAGRAM_WIDTH-x,y) }
  await screenshot('regions-right-restored.png')
  for (const key of ['shoulder','hindleg']) { const [x,y]=bodyRegions.find(region=>region.id===key).anchor; await diagramPoint(DIAGRAM_WIDTH-x,y) }
  await side(false)
  assert.equal(await evaluate(`document.querySelector('[data-region=head]').getAttribute('aria-pressed')`), 'true')
  assert.equal(await evaluate(`document.querySelector('[data-region=foreleg]').getAttribute('aria-pressed')`), 'false', 'right foreleg never paints left foreleg')
  await click('button[aria-label="Bỏ chọn Đầu (bên trái)"]')
  assert.equal(await evaluate(`document.querySelector('[data-region=head]').getAttribute('aria-pressed')`), 'false')
  await click('.injury-clear-regions')
  assert.equal(await location(), payload.InjuryLocation, 'clear selection preserves previous prose')

  // Editing the form text also updates the diagram and checkbox list.
  await fill('textarea[name=InjuryLocation]', writeInjuryLocation(['neck:left', 'hindleg:right'], 'Mô tả thử'))
  assert.equal(await evaluate(`document.querySelector('[data-region=neck]').getAttribute('aria-pressed')`), 'true')
  assert.equal(await evaluate(`document.querySelector('[data-region-option="neck:left"]').checked`), true)
  await fill('textarea[name=InjuryLocation]', 'x'.repeat(490))
  await click('[data-region-option="head:left"]')
  assert.equal(await location(), 'x'.repeat(490), 'over-limit selection preserves form')
  assert.ok((await evaluate(`document.querySelector('.injury-field-error').textContent`)).includes('500'))
  await fill('textarea[name=InjuryLocation]', '')

  // Responsive, page zoom, scroll and mobile taps use the SVG screen matrix.
  for (const width of [1440,1024,834,390]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width===390 })
    await delay(120)
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: width===390 })
    for (const view of ['left','right']) {
      await side(view==='right')
      for (const key of ['head','abdomen','foreleg']) {
        const [x,y] = bodyRegions.find(item => item.id===key).anchor
        const point = [view==='right'?DIAGRAM_WIDTH-x:x,y]
        await diagramPoint(...point, width===390)
        assert.ok((await selection()).includes(`${key}:${view}`), `${width}px ${key}:${view}`)
        await diagramPoint(...point, width===390)
        assert.ok(!(await selection()).includes(`${key}:${view}`))
      }
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth+1`), true, 'no mobile horizontal overflow')
      const [x,y] = bodyRegions[0].anchor
      const head = [view==='right'?DIAGRAM_WIDTH-x:x,y]
      await diagramPoint(...head, width===390)
      await screenshot(`regions-${view}-${width}.png`)
      await diagramPoint(...head, width===390)
    }
  }
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: false })
  await cdp('Emulation.setDeviceMetricsOverride', { width:1440,height:1000,deviceScaleFactor:1,mobile:false })
  for (const view of ['left','right']) {
    await side(view==='right')
    for (const zoom of [0.8,1.25,1.5]) {
      await evaluate(`document.querySelector('.injury-region-editor').style.zoom=${zoom}`)
      const [x,y]=bodyRegions.find(item=>item.id==='shoulder').anchor
      const point=[view==='right'?DIAGRAM_WIDTH-x:x,y]
      await diagramPoint(...point)
      assert.ok((await selection()).includes(`shoulder:${view}`), `${view} zoom ${zoom}`)
      await diagramPoint(...point)
    }
  }
  await side(false)
  await evaluate(`document.querySelector('.injury-region-editor').style.zoom=1`)
  await fill('textarea[name=InjuryLocation]', writeInjuryLocation(['head:left','abdomen:left','foreleg:right'], payload.InjuryLocation))
  const intended = await location()

  // A failed API write keeps the draft. Successful writes touch exactly one field.
  await cdp('Fetch.enable', { patterns:[{urlPattern:'*/api/medical-records/*',requestStage:'Request'}] })
  failPatch = true
  await click('.injury-save-location')
  await until(() => evaluate(`!!document.querySelector('.injury-record-editor .injury-feedback.is-error')`), 'failed PATCH')
  assert.equal(await location(), intended)
  assert.equal((await api(`/medical-records/${recordId}`, auth.access)).InjuryLocation, payload.InjuryLocation)
  await cdp('Fetch.disable')
  await click('.injury-save-location')
  await until(async () => (await api(`/medical-records/${recordId}`,auth.access)).InjuryLocation===intended, 'actual API persisted')
  await until(() => evaluate(`document.querySelector('.injury-save-location')?.disabled`), 'saved state')
  const saved = await api(`/medical-records/${recordId}`,auth.access)
  for (const key of ['Diagnosis','TreatmentPlan','Symptoms','Note']) assert.equal(saved[key],payload[key])
  const patches = writes.filter(row=>row.method==='PATCH' && row.url.endsWith(`/medical-records/${recordId}`))
  assert.ok(patches.length>=2)
  for (const row of patches) assert.deepEqual(Object.keys(JSON.parse(row.body)),['InjuryLocation'])
  await navigate(profilePath)
  await click(`[data-injury-record="${recordId}"]`)
  assert.equal(await location(), intended)
  assert.equal(await evaluate(`document.querySelector('[data-region=head]').getAttribute('aria-pressed')`),'true')
  await side(true)
  assert.equal(await evaluate(`document.querySelector('[data-region-option="foreleg:right"]').checked`),true)
  assert.equal(await evaluate(`document.querySelector('[data-region=foreleg]').getAttribute('aria-pressed')`),'true','saved right foreleg is highlighted on the mirrored right view')
  assert.equal(await evaluate(`document.querySelector('[data-region=head]').getAttribute('aria-pressed')`),'false','saved left head is not painted on the right view')
  await side(false)

  // A lost success response is reconciled via GET, without a second PATCH.
  await click('[data-region-option="neck:left"]')
  const lostValue = await location()
  await cdp('Fetch.enable', {patterns:[{urlPattern:'*/api/medical-records/*',requestStage:'Response'}]})
  loseReply = true
  await click('.injury-save-location')
  await until(() => evaluate(`!!document.querySelector('.injury-record-editor .injury-feedback.is-error')`),'lost reply')
  assert.equal(await location(),lostValue)
  await cdp('Fetch.disable')
  assert.equal((await api(`/medical-records/${recordId}`,auth.access)).InjuryLocation,lostValue)
  const patchesBefore = writes.filter(row=>row.method==='PATCH').length
  await click('.injury-save-location')
  await until(() => evaluate(`document.querySelector('.injury-save-location')?.disabled`),'reconciled saved state')
  assert.equal(writes.filter(row=>row.method==='PATCH').length,patchesBefore)

  // Another doctor's draft is read-only, including event-handler bypass attempts.
  const other = await api(`/horses/${horseId}/medical-records`,vet2.access,'POST',{...payload,InjuryLocation:writeInjuryLocation(['back:left'])},201)
  await navigate(profilePath)
  await click(`[data-injury-record="${other.MedicalRecordID}"]`)
  const readOnlyText = await location()
  assert.equal(await evaluate(`document.querySelector('.injury-region-options').disabled`),true)
  assert.equal(await evaluate(`document.querySelector('textarea[name=InjuryLocation]').readOnly`),true)
  assert.equal(await evaluate(`!!document.querySelector('.injury-save-location')`),false)
  await diagramPoint(...bodyRegions[0].anchor)
  await evaluate(`document.querySelector('[data-region=head]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`)
  assert.equal(await location(),readOnlyText)
  await side(true)
  await diagramPoint(DIAGRAM_WIDTH-bodyRegions[0].anchor[0],bodyRegions[0].anchor[1])
  assert.equal(await location(),readOnlyText,'right diagram is also read-only for another vet')
  await side(false)
  await api(`/medical-records/${other.MedicalRecordID}`,auth.access,'PATCH',{InjuryLocation:'Forbidden'},409)

  // A record signed elsewhere while this editor is open must refuse a stale
  // write and retain the unsaved input for comparison.
  await click(`[data-injury-record="${recordId}"]`)
  await click('[data-region-option="shoulder:left"]')
  const unsavedAtSign = await location()
  await api(`/medical-records/${recordId}/sign`,auth.access,'POST',{})
  const beforeStaleSave = writes.length
  await click('.injury-save-location')
  await until(() => evaluate(`!!document.querySelector('.injury-record-editor .injury-feedback.is-error')`),'signed during edit')
  assert.equal(await location(),unsavedAtSign,'stale signed draft retained for comparison')
  assert.equal(writes.length,beforeStaleSave,'Signed preflight prevents PATCH')
  assert.equal(await evaluate(`document.querySelector('.injury-region-options').disabled`),true)
  // Signing freezes the saved selection; it stays visible after reload.
  acceptDialog = true
  await navigate(profilePath)
  acceptDialog = false
  await click(`[data-injury-record="${recordId}"]`)
  assert.equal(await location(),lostValue)
  const writeCount = writes.length
  await diagramPoint(...bodyRegions[0].anchor)
  await click('[data-region-option="head:left"]')
  assert.equal(await location(),lostValue)
  await side(true)
  await diagramPoint(DIAGRAM_WIDTH-bodyRegions[0].anchor[0],bodyRegions[0].anchor[1])
  assert.equal(await location(),lostValue,'Signed right diagram is read-only')
  await side(false)
  assert.equal(writes.length,writeCount)
  await api(`/medical-records/${recordId}`,auth.access,'PATCH',{InjuryLocation:'Forbidden'},409)
  await screenshot('regions-signed.png')

  // The clinical examination form uses the same picker and real draft API.
  await navigate(`/vet/horses/${horseId}/examination?new=1`)
  await until(() => evaluate("document.querySelector('.vet-profile-heading .horse-avatar img')?.naturalWidth > 0"), 'clinical horse photo loaded')
  for (const width of [1440, 834, 390]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width === 390 })
    await delay(150)
    const dimensions = await evaluate("(() => { const avatar = document.querySelector('.vet-profile-heading .horse-avatar').getBoundingClientRect(); const image = document.querySelector('.vet-profile-heading .horse-avatar img').getBoundingClientRect(); return { avatarWidth: avatar.width, avatarHeight: avatar.height, imageWidth: image.width, imageHeight: image.height, headerHeight: document.querySelector('.vet-profile-heading').getBoundingClientRect().height, overflow: document.documentElement.scrollWidth > innerWidth + 1 } })()")
    assert.ok(dimensions.avatarWidth > 0 && dimensions.avatarWidth <= 90, `${width}px compact horse avatar`)
    assert.ok(dimensions.imageWidth <= dimensions.avatarWidth && dimensions.imageHeight <= dimensions.avatarHeight, `${width}px photo stays inside its frame`)
    assert.ok(dimensions.headerHeight < 360, `${width}px exam heading does not fill the page`)
    assert.equal(dimensions.overflow, false, `${width}px examination has no horizontal overflow`)
    await evaluate('window.scrollTo(0, 0)')
    await screenshot(`clinical-header-${width}.png`)
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await select('#clinical-examType','Injury Exam')
  await diagramPoint(...bodyRegions.find(item=>item.id==='hindquarters').anchor)
  await side(true)
  const [rightLegX,rightLegY] = bodyRegions.find(item=>item.id==='hindleg').anchor
  await diagramPoint(DIAGRAM_WIDTH-rightLegX,rightLegY)
  await side(false)
  const clinicalValue = await location()
  await evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Lưu nháp').click()`)
  await until(async () => {const rows=await api(`/horses/${horseId}/medical-records`,auth.access);return rows.some(row=>row.InjuryLocation===clinicalValue)},'clinical draft persisted')
  assert.equal(await evaluate(`JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.includes('token'))))`),initialLocal,'no medical draft or region data written to localStorage')
  assert.deepEqual(exceptions,[],'no uncaught browser exceptions')
  console.log('PASS: actual Chromium; one dark green injury diagram per Vet screen, compact clinical horse photo at 1440/834/390px; left/right views retain the photo with matching mirrored paths/mask, all 9 regions and visible highlight pixels on each side, keyboard, multi-select, form/list/SVG sync, correct independent body sides, background rejection, both views at 1440/1024/834/390px, touch/scroll/zoom, 500-char limit, real text API persistence/reload, one-field PATCH, failure retention, lost-response reconciliation, both views read-only for other-vet and Signed records, Signed during edit prevents writes and retains input, clinical-form save from both views, no medical localStorage.')
  console.log(`Screenshots: ${artifacts}`)
} finally {
  try { await cdp('Browser.close') } catch { browser.kill() }
  socket?.close(); await delay(300)
  const resolvedTemporary = resolve(temporary)
  assert.ok(resolvedTemporary.startsWith(resolve(tmpdir()) + (process.platform==='win32'?'\\':'/')))
  await rm(resolvedTemporary,{recursive:true,force:true,maxRetries:4,retryDelay:300})
}
