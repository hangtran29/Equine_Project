// Shared menu/route permission checks. Backend scope checks remain authoritative.
export function hasRouteAccess(pathname, role, permissions = []) {
  const path = pathname.split('?')[0]
  const has = (...codes) => codes.some(code => permissions.includes(code))
  if (path === '/audit-logs') return ['manager', 'headTrainer', 'trainer', 'workRider', 'vet', 'groom'].includes(role) && has('AUDIT_VIEW')
  if (path.startsWith('/groom/')) return role === 'groom' && path === '/groom/stalls' && has('HORSE_VIEW')
  if (path.startsWith('/manager/')) {
    if (role !== 'manager') return false
    if (/^\/manager\/(staff|roles)/.test(path)) return has('RBAC_MANAGE')
    if (/^\/manager\/(stalls|vet-duty|support-requests)/.test(path)) return has('CLUB_MANAGE')
    if (path.includes('profile-change-requests')) return has('PROFILE_EDIT_APPROVE')
    if (path.endsWith('/archive')) return has('HORSE_ARCHIVE')
    if (path.endsWith('/new')) return has('HORSE_REGISTER_REVIEW', 'HORSE_REGISTER')
    return has('HORSE_VIEW')
  }
  if (path.startsWith('/owner/')) return role === 'owner' && has('OWNER_VIEW')
  if (path.startsWith('/vet/')) {
    if (role !== 'vet') return false
    if (path === '/vet/notifications') return true
    if (/\/(clinical|examination|exam\/new|records\/\d+\/edit)/.test(path)) return has('MEDICAL_MANAGE')
    return has('HORSE_VIEW')
  }
  if (path.startsWith('/training/')) {
    if (!['headTrainer', 'trainer', 'workRider'].includes(role)) return false
    if (/^\/training\/trainers(\/|$)/.test(path)) return role === 'headTrainer' && has('TRAINER_ASSIGN')
    if (path.includes('work-rider-sessions')) return role === 'workRider' && has('TRAINING_RESULT_UPDATE')
    if (path.includes('assessment-history')) return has('HORSE_ASSESS')
    if (/\/(assessment|assignment)$/.test(path)) return has('HORSE_ASSESS', 'TRAINER_ASSIGN')
    if (/\/(approvals|adjustments|results)(\/|$)/.test(path)) return has('TRAINING_PLAN_APPROVE')
    if (path.includes('/reviews') || path.endsWith('/review')) return has('TRAINING_REVIEW')
    if (/\/(sessions\/new|sessions\/\d+\/edit)$/.test(path)) return has('TRAINING_SESSION_ASSIGN')
    if (path.includes('/my-plans') || /\/plans\/(new|\d+\/edit)$/.test(path)) return has('TRAINING_PLAN_MANAGE')
    return has('HORSE_VIEW')
  }
  if (path.startsWith('/health-reports')) return ['groom', 'workRider', 'trainer', 'headTrainer'].includes(role) && has('HEALTH_REPORT')
  if (path.startsWith('/horses/')) return has('HORSE_VIEW', 'OWNER_VIEW')
  // Care routes have their role and permission matrix in careRoutes.jsx.
  return true
}
