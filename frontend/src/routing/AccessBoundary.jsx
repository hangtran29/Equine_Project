import { createContext, useContext } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { hasRouteAccess } from './access.js'

const AccessContext = createContext({ role: '', permissions: [] })

export function AccessProvider({ role, permissions, children }) {
  return <AccessContext.Provider value={{ role, permissions }}>{children}</AccessContext.Provider>
}

export function GuardedNavLink(props) {
  const { role, permissions } = useContext(AccessContext)
  const path = typeof props.to === 'string' ? props.to : props.to?.pathname || ''
  return hasRouteAccess(path, role, permissions) ? <NavLink {...props} /> : null
}

export function RouteAccessBoundary({ children }) {
  const { role, permissions } = useContext(AccessContext)
  const { pathname } = useLocation()
  return hasRouteAccess(pathname, role, permissions) ? children : <main className="page-content"><section className="panel">
    <h1>Chưa được cấp quyền</h1><p>Liên hệ Quản lý câu lạc bộ để được cấp quyền dùng trang này.</p>
  </section></main>
}
