import assert from 'node:assert/strict'
import { test } from 'node:test'
import { campusPins, scene, stallLayout } from '../src/flow1/campusMap.js'

test('The overview renders all four database rows, including an empty row D', () => {
  const layout = stallLayout(['A', 'B', 'C', 'D'])
  const pins = campusPins(layout).filter((pin) => pin[1] === 'stall')
  assert.deepEqual(pins.map((pin) => pin[2]), ['Dãy chuồng A', 'Dãy chuồng B', 'Dãy chuồng C', 'Dãy chuồng D'])
  assert.equal((scene(layout).match(/class="campus-stall"/g) || []).length, 4)
  assert.equal(new Set(pins.map((pin) => pin.slice(3).join(','))).size, 4)
})

test('API order and duplicate stall prefixes do not move or rename rows', () => {
  assert.deepEqual(campusPins(stallLayout(['D', 'A', 'C', 'A', 'B'])), campusPins(stallLayout(['A', 'B', 'C', 'D'])))
})

test('Additional and nonstandard row names are retained with matching buildings', () => {
  const zones = ['A', 'B', 'C', 'D', 'ISOLATION', '#']
  const layout = stallLayout(zones)
  const pins = campusPins(layout).filter((pin) => pin[1] === 'stall')
  assert.deepEqual(pins.map((pin) => pin[0]), [...zones].sort())
  assert.equal((scene(layout).match(/class="campus-stall"/g) || []).length, zones.length)
})

test('A club without stalls has no fictional stall buildings or pins', () => {
  assert.equal(campusPins(stallLayout([])).some((pin) => pin[1] === 'stall'), false)
  assert.equal(scene(stallLayout([])).includes('class="campus-stall"'), false)
})
