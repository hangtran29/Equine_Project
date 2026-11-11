import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesEffectiveTraining, resolveEffectiveTraining } from '../src/components/horse/effectiveTraining.js'
import { activeLocksByHorse, trainingLockCovers } from '../src/flow2/trainingLocks.js'

test('Scheduling keeps an Active lock after its planned end, until explicit release', () => {
  const lock = { HorseID: 4, LockStatus: 'Active', LockLevel: 'Full', LockStartDate: '2026-10-01T08:00:00', LockEndDate: '2026-10-02T08:00:00' }
  assert.equal(trainingLockCovers(lock, '2026-11-08'), true)
  assert.equal(trainingLockCovers(lock, '2026-09-30'), false)
  assert.equal(trainingLockCovers({ ...lock, LockStatus: 'Released' }, '2026-11-08'), false)
  assert.equal(activeLocksByHorse([lock], '2026-11-08')[4], lock)
})

test('Trainer cards preserve Active orders and select the strictest applicable restriction', () => {
  const locks = [
    { HorseID: 4, LockStatus: 'Active', LockLevel: 'Restricted', MaxIntensity: 40, LockStartDate: '2026-10-01' },
    { HorseID: 4, LockStatus: 'Active', LockLevel: 'Restricted', MaxIntensity: 20, LockStartDate: '2026-10-01' },
    { HorseID: 4, LockStatus: 'Released', LockLevel: 'Full', LockStartDate: '2026-10-01' },
  ]
  assert.equal(activeLocksByHorse(locks, '2026-11-08')[4].MaxIntensity, 20)
  const full = { HorseID: 4, LockStatus: 'Active', LockLevel: 'Full', LockStartDate: '2099-01-01' }
  assert.equal(activeLocksByHorse([...locks, full])[4], full)
  assert.equal(activeLocksByHorse([...locks, full], '2026-11-08')[4].MaxIntensity, 20)
})

const horse = { id: '1', profileStatus: 'APPROVED', healthStatus: 'ELIGIBLE' }
const eligible = { id: '10', horseId: '1', recordStatus: 'Signed', examDate: '2026-10-20T09:00:00', trainingEligibility: 'Eligible' }
const full = { TrainingLockID: 1, HorseID: 1, LockStatus: 'Active', LockLevel: 'Full', LockStartDate: '2026-10-18T09:00:00', Reason: 'Nghỉ tập', CreatedByName: 'Bác sĩ A' }
const restricted = { ...full, TrainingLockID: 2, LockLevel: 'Restricted', MaxIntensity: '25.00' }
const resolve = overrides => resolveEffectiveTraining({ horse, records: [eligible], locks: [], ...overrides })

test('A full active lock outranks Eligible and every restriction, independent of API row order', () => {
  for (const locks of [[full, restricted], [restricted, full], [{ ...full, LockStatus: 'Released' }, full]]) {
    const state = resolve({ locks })
    assert.equal(state.status, 'full')
    assert.equal(state.label, 'Khóa toàn bộ')
    assert.deepEqual(state.locks, [full])
  }
  assert.equal(resolve({ locks: [full], historyLoading: true }).status, 'full')
  assert.equal(resolve({ locks: [full], historyError: true }).status, 'full')
})

test('Every full or restricted active order remains active past its planned end date', () => {
  for (const lock of [full, restricted]) {
    const state = resolve({ locks: [{ ...lock, LockEndDate: '2020-01-01T09:00:00' }] })
    assert.equal(state.status, lock.LockLevel === 'Full' ? 'full' : 'restricted')
  }
  // Do not infer permission from a start/end window; Active must be resolved by the existing workflow.
  assert.equal(resolve({ locks: [{ ...full, LockStartDate: '2099-01-01T00:00:00' }] }).status, 'full')
})

test('Only explicitly Released orders are ignored, including a released Full alongside an active Restricted', () => {
  assert.equal(resolve({ locks: [{ ...full, LockStatus: 'Released' }] }).status, 'allowed')
  assert.equal(resolve({ locks: [{ ...full, LockStatus: 'Released' }, restricted] }).status, 'restricted')
  assert.equal(resolve({ locks: [{ ...full, LockStatus: 'Expired' }] }).status, 'unknown', 'Expired is not a state in the current API')
  assert.equal(resolve({ locks: [{ ...full, LockStatus: '' }] }).status, 'unknown')
  assert.equal(resolve({ locks: [{ ...full, ReleasedAt: '2026-10-19T09:00:00' }] }).status, 'unknown')
})

test('Multiple active restrictions keep all instructions available; missing or invalid limits remain unknown', () => {
  const state = resolve({ locks: [restricted, { ...restricted, TrainingLockID: 3, MaxIntensity: 10 }] })
  assert.equal(state.status, 'restricted')
  assert.equal(state.locks.length, 2)
  for (const max of [undefined, null, '', 'n/a', -1, Infinity]) assert.equal(resolve({ locks: [{ ...restricted, MaxIntensity: max }] }).status, 'unknown')
  assert.equal(resolve({ locks: [{ ...restricted, MaxIntensity: 0 }] }).status, 'restricted')
})

test('Permission requires approved admission, a valid Signed conclusion and a complete lock response', () => {
  assert.equal(resolve().status, 'allowed')
  assert.equal(resolve().label, 'Được phép tập')
  for (const profileStatus of ['PENDING_EXAM', 'DRAFT', 'ARCHIVED', 'UNKNOWN', undefined]) assert.equal(resolve({ horse: { ...horse, profileStatus } }).status, 'unknown')
  for (const override of [{ records: [] }, { records: undefined }, { locks: undefined }, { historyLoading: true }, { historyError: true }, { locksLoading: true }, { locksError: true }, { horse: undefined }]) assert.equal(resolve(override).status, 'unknown')
  assert.equal(resolve({ records: [{ ...eligible, recordStatus: 'Draft' }] }).status, 'unknown')
  assert.equal(resolve({ records: [{ ...eligible, examDate: '' }] }).status, 'unknown')
  assert.equal(resolve({ records: [{ ...eligible, trainingEligibility: '' }] }).status, 'unknown')
})

test('The latest Signed conclusion decides clinical restrictions; Draft or foreign-horse records cannot clear them', () => {
  const limited = { ...eligible, id: '11', examDate: '2026-10-21T10:00:00', trainingEligibility: 'Restricted' }
  assert.equal(resolve({ records: [limited, eligible] }).status, 'restricted')
  assert.equal(resolve({ records: [limited, { ...eligible, id: '12', recordStatus: 'Draft', examDate: '2026-10-22T10:00:00' }] }).status, 'restricted')
  assert.equal(resolve({ records: [limited, { ...eligible, id: '12', horseId: 'other', examDate: '2026-10-22T10:00:00' }] }).status, 'restricted')
  assert.equal(resolve({ records: [limited, { ...eligible, id: '12', examDate: limited.examDate }] }).status, 'allowed')
})

test('Clinical prohibition without a matching full lock, or disagreement with a restricted lock, is unknown', () => {
  const prohibited = { ...eligible, trainingEligibility: 'Not Eligible' }
  assert.equal(resolve({ records: [prohibited] }).status, 'unknown')
  assert.equal(resolve({ records: [prohibited], locks: [restricted] }).status, 'unknown')
  assert.equal(resolve({ records: [prohibited], locks: [full] }).status, 'full')
  assert.equal(resolve({ locks: [{ ...restricted, LockLevel: 'Unrecognized' }] }).status, 'unknown')
  assert.equal(resolve({ locks: [{ ...restricted, LockLevel: 'Unrecognized' }, full] }).status, 'full')
  assert.equal(resolve({ locks: [{ LockLevel: 'Full', LockStatus: 'Active' }] }).status, 'unknown')
})

test('An old pre-lock clearance does not become valid merely because a released order was fetched', () => {
  const released = { ...full, LockStatus: 'Released', LockStartDate: '2026-10-21T08:00:00', ReleasedAt: '2026-10-22T09:00:00' }
  assert.equal(resolve({ locks: [released] }).status, 'unknown')
  assert.equal(resolve({ locks: [released], records: [{ ...eligible, examDate: '2026-10-22T08:00:00' }] }).status, 'allowed')
})

test('The projection preserves original records, health and orders and ignores orders for a different horse', () => {
  const input = { horse: Object.freeze({ ...horse }), records: Object.freeze([Object.freeze({ ...eligible })]), locks: Object.freeze([Object.freeze({ ...full, HorseID: 'other' })]) }
  assert.equal(resolveEffectiveTraining(input).status, 'allowed')
  assert.equal(input.horse.healthStatus, 'ELIGIBLE')
  assert.equal(input.records[0].trainingEligibility, 'Eligible')
  assert.equal(input.locks[0].LockStatus, 'Active')
})

test('Training filters match the single effective state, including existing bookmarked URLs', () => {
  const locked = resolve({ locks: [full] })
  assert.equal(matchesEffectiveTraining(locked, 'full'), true)
  assert.equal(matchesEffectiveTraining(locked, 'Not Eligible'), true)
  assert.equal(matchesEffectiveTraining(locked, 'Eligible'), false)
  assert.equal(matchesEffectiveTraining(locked, 'allowed'), false)
  assert.equal(matchesEffectiveTraining(locked, 'limited'), true)
  assert.equal(matchesEffectiveTraining(resolve(), 'Eligible'), true)
  assert.equal(matchesEffectiveTraining(resolve({ locksError: true }), 'unknown'), true)
})
