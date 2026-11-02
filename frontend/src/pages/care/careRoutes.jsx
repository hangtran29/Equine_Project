// Menu + route của Flow 4 (chăm sóc, dinh dưỡng). App.jsx chỉ gọi 2 hàm dưới đây để giảm đụng code của flow khác.
import { Navigate, Route } from 'react-router-dom'
import CareRulesPage from './CareRulesPage.jsx'
import CareTasksPage from './CareTasksPage.jsx'
import DietApprovalPage from './DietApprovalPage.jsx'
import DietPlansPage from './DietPlansPage.jsx'
import GroomAssignmentPage from './GroomAssignmentPage.jsx'
import HorseDietsPage from './HorseDietsPage.jsx'
import SupplyRequestsPage from './SupplyRequestsPage.jsx'
import InventoryPage from '../manager/InventoryPage.jsx'
import VetDutyPage from '../manager/VetDutyPage.jsx'
import './Care.css'

// [đường dẫn, tên menu, icon (NavIcon của App.jsx), role được dùng, quyền cần có]
const PAGES = [
  ['/care/today', 'Việc chăm sóc hôm nay', 'schedule', ['groom'], 'CARE_MANAGE'],
  ['/care/diets', 'Khẩu phần ngựa', 'plan', ['groom'], 'CARE_MANAGE'],
  ['/care/diet-plans', 'Khẩu phần ăn', 'plan', ['headTrainer'], 'DIET_MANAGE'],
  ['/care/tasks', 'Việc chăm sóc', 'schedule', ['headTrainer', 'manager', 'trainer', 'vet'], 'HORSE_VIEW'],
  ['/care/grooms', 'Groom phụ trách', 'staff', ['manager'], 'CLUB_MANAGE'],
  ['/care/rules', 'Chỉ tiêu chăm sóc', 'edit', ['headTrainer'], 'TRAINER_ASSIGN'],
  ['/care/diet-approvals', 'Góp ý dinh dưỡng', 'approval', ['vet'], 'DIET_MANAGE'],
  ['/care/inventory', 'Kho và cấp vật tư', 'requests', ['manager'], 'INVENTORY_MANAGE'],
  ['/manager/vet-duty', 'Lịch trực Vet', 'schedule', ['manager'], 'CLUB_MANAGE'],
  ['/care/supplies', 'Xin vật tư', 'requests', ['groom', 'headTrainer'], 'INVENTORY_REQUEST'],
]

function allowed(page, role, permissions) {
  const granted = permissions || []
  return page[3].includes(role) && granted.includes(page[4])
    && (page[0] === '/care/supplies' || granted.includes('HORSE_VIEW'))
    && (page[0] !== '/care/diet-approvals' || granted.includes('MEDICAL_MANAGE'))
}

export const careHome = '/care/today'

/** Mục menu Flow 4 cho role hiện tại: [{to, label, icon}] */
export function careNavItems(role, permissions) {
  return PAGES.filter(page => allowed(page, role, permissions)).map(([to, label, icon]) => ({ to, label, icon }))
}

/** Các <Route> của Flow 4; role không được dùng trang nào thì quay về trang chủ của role đó. */
export function careRoutes({ role, currentUser, home }) {
  const element = {
    '/care/today': <CareTasksPage mode="mine" currentUser={currentUser} />,
    '/care/diets': <HorseDietsPage currentUser={currentUser} />,
    '/care/diet-plans': <DietPlansPage />,
    '/care/tasks': <CareTasksPage mode="club" currentUser={currentUser} />,
    '/care/grooms': <GroomAssignmentPage />,
    '/care/rules': <CareRulesPage />,
    '/care/diet-approvals': <DietApprovalPage />,
    '/care/supplies': <SupplyRequestsPage />,
    '/care/inventory': <InventoryPage />,
    '/manager/vet-duty': <VetDutyPage />,
  }
  const noAccess = <main className="page-content narrow-content"><section className="panel">
    <h1>Chưa được cấp quyền</h1><p>Tài khoản của bạn chưa có quyền dùng trang này. Liên hệ Quản lý câu lạc bộ.</p></section></main>
  return PAGES.map(page => <Route key={page[0]} path={page[0]}
    element={allowed(page, role, currentUser?.permissions) ? element[page[0]]
      : page[0] === home ? noAccess : <Navigate to={home} replace />} />)
}
