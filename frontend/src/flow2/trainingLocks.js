// LockEndDate is a planned review date. Only the backend release workflow ends an active lock.
export function trainingLockCovers(lock, day) {
  return Boolean(lock && lock.LockStatus === 'Active' && day
    && String(day).slice(0, 10) >= String(lock.LockStartDate || '').slice(0, 10))
}

export function activeLocksByHorse(locks, day) {
  const result = {}
  for (const lock of locks) {
    if (lock.LockStatus !== 'Active' || (day && !trainingLockCovers(lock, day))) continue
    const previous = result[lock.HorseID]
    if (!previous || (lock.LockLevel === 'Full' && previous.LockLevel !== 'Full')
      || (lock.LockLevel === 'Restricted' && previous.LockLevel === 'Restricted'
        && Number(lock.MaxIntensity) < Number(previous.MaxIntensity))) result[lock.HorseID] = lock
  }
  return result
}
