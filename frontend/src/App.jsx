import { apiGet } from './api/apiClient.ts'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createBrowserRouter,
  RouterProvider,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'

import {
  ApiError,
  clearSession,
  getAccessToken,
} from './api/apiClient.ts'

import { clearPendingHorseDocumentUploads, getHorseById, getHorseDocuments, getMedicalRecords, getPendingInitialExams, getRegistrationHistory, saveExaminationDraft, signMedicalRecord } from './api/horseApi.ts'

import {
  getCurrentUser,
  login,
} from './api/userApi.ts'

import './pages/manager/ManagerWorkspace.css'
import LoginScreen from './components/layout/LoginScreen.jsx'
import OwnerTrainingStagesPage from './pages/owner/OwnerTrainingStagesPage.jsx'
import OwnerTrainingActivityPage from './pages/owner/OwnerTrainingActivityPage.jsx'

import VetExaminationForm from './pages/vet/VetExaminationForm.tsx'
import VetWorkspace from './pages/vet/VetWorkspace.jsx'
import VetMedicalProfile from './pages/vet/VetMedicalProfile.jsx'
import { vetError } from './pages/vet/vetDomain.js'
import VetLoading from './pages/vet/VetLoading.jsx'
import { ClinicalNavigationGuard, hasUnsavedClinicalChanges } from './pages/vet/useClinicalWarning.js'
import NotificationsPage from './pages/vet/NotificationsPage.jsx'

import { careHome, careNavItems, careRoutes } from './pages/care/careRoutes.jsx'
import HealthReportsPage from './pages/HealthReportsPage.jsx'

import LandingPage from './pages/landing/LandingPage.jsx'
import * as F1 from './flow1/ManagerPages.jsx'
import * as F1Owner from './flow1/OwnerPages.jsx'
import * as F1Vet from './flow1/VetPages.jsx'
import F1HorseFormPage from './flow1/HorseFormPage.jsx'
import F1StallPage from './flow1/StallPage.jsx'
import NotificationBell from './flow1/NotificationBell.jsx'
import { ForceChangePasswordScreen, NoRoleScreen, ResetPasswordScreen } from './flow1/AuthExtras.jsx'
import { SidebarSupport, SupportRequestsPage } from './flow1/SupportPages.jsx'
import * as F1Accounts from './flow1/AccountPages.jsx'
import * as F2Rider from './flow2/RiderPages.jsx'
import * as F2Head from './flow2/HeadPages.jsx'
import * as F2Trainer from './flow2/TrainerPages.jsx'
import * as F2Session from './flow2/SessionPages.jsx'
import * as F2Owner from './flow2/OwnerPages.jsx'
import * as F3Vet from './flow3/VetPages.jsx'
import * as F3Report from './flow3/ReportPages.jsx'
import SharedHorsePage from './flow1/SharedHorsePage.jsx'

/** /health-reports/:id - bác sĩ thú y xem báo cáo ở trang xử lý riêng. */
function VetReportRedirect() { const { reportId } = useParams(); return <Navigate to={`/vet/reports/${reportId}`} replace /> }

/** /horses/:id - Quản lý, chủ ngựa, bác sĩ về trang riêng; các chức vụ khác xem hồ sơ dùng chung (NG01). */
function HorseProfileByRole({ role }) {
  const { horseId } = useParams()
  if (role === 'manager') return <Navigate to={`/manager/horses/${horseId}/intake`} replace />
  if (role === 'owner') return <Navigate to={`/owner/horses/${horseId}`} replace />
  if (role === 'vet') return <Navigate to={`/vet/horses/${horseId}`} replace />
  const back = role === 'headTrainer' ? ['Tổng quan huấn luyện', '/training/dashboard'] : role === 'trainer' ? ['Giáo án huấn luyện', '/training/my-plans']
    : role === 'workRider' ? ['Buổi tập của tôi', '/training/work-rider-sessions'] : ['Việc chăm sóc', '/care/today']
  return <SharedHorsePage backLabel={back[0]} backTo={back[1]} />
}
import LanguageSwitch from './i18n/LanguageSwitch.jsx'
import { dateLocale } from './i18n/runtime.js'
import './flow1/f1.css'
import './App.css'
import AuditLogPage from './flow1/AuditLogPage.jsx'
import { AccessProvider, GuardedNavLink as NavLink, RouteAccessBoundary } from './routing/AccessBoundary.jsx'

const roleLabels = {
  manager: 'Quản lý câu lạc bộ',
  owner: 'Chủ sở hữu ngựa',
  vet: 'Bác sĩ thú y',
  headTrainer: 'Huấn luyện viên trưởng',
  trainer: 'Huấn luyện viên',
  workRider: 'Kỵ sĩ tập luyện',
  groom: 'Người chăm sóc ngựa',
}

function userRole(user) {
  if (user?.role === 'CLUB_MANAGER') {
    return 'manager'
  }

  if (
    user?.role === 'OWNER' ||
    user?.role === 'HORSE_OWNER'
  ) {
    return 'owner'
  }

  if (
    user?.role === 'VET' ||
    user?.role === 'VETERINARIAN'
  ) {
    return 'vet'
  }

  if (user?.role === 'HEAD_TRAINER') {
    return 'headTrainer'
  }

  if (user?.role === 'TRAINER') {
    return 'trainer'
  }

  if (user?.role === 'WORK_RIDER') {
    return 'workRider'
  }

  if (user?.role === 'GROOM') {
    return 'groom'
  }

  return ''
}

function NavIcon({ kind }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }

  const pathByKind = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    plan: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20" /></>,
    approval: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5h6M8.5 13l2.5 2.5 4.5-5" /></>,
    schedule: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M8 14h3M14 14h3" /></>,
    results: <><path d="M4 20V12M10 20V5M16 20V9M22 20V3" /></>,
    edit: <><path d="M4 20h4l11-11-4-4L4 16zM13 7l4 4M4 4h7" /></>,
    staff: <><circle cx="9" cy="8" r="2.5" /><path d="M4.5 18a4.5 4.5 0 0 1 9 0" /><circle cx="17" cy="9" r="2" /><path d="M15 18a3.8 3.8 0 0 1 5 0" /></>,
    roles: <><path d="M12 3l7 3v5c0 5-3.4 8.1-7 10-3.6-1.9-7-5-7-10V6l7-3Z" /><path d="m9.5 12.2 1.7 1.7 3.4-3.9" /></>,
    horses: <><path d="M4 20v-4l3-3 2-5 4-3 5 1 2 4-3 2-2-2-2 3 1 4v3" /><path d="M7 20v-3M15 20v-3M13 6l-1-3" /></>,
    requests: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h3" /><path d="m15 17 2 2 3-4" /></>,
    activity: <><path d="M3 12h4l3-6 4 12 3-6h4" /><path d="M3 21h18" /></>,
    supervision: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></>,
    review: <><path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h4" /><path d="m15 16 1.5 1.5L20 14" /></>,
    stall: <><path d="M3 10 12 4l9 6v10H3z" /><path d="M8 20v-6h8v6" /></>,
    rider: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /><circle cx="18" cy="18" r="3" /></>,
  }
  if (pathByKind[kind]) return <svg {...common}>{pathByKind[kind]}</svg>

  if (kind === 'owner') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c.5-3.5 3.1-5.5 7-5.5s6.5 2 7 5.5" />
      </svg>
    )
  }

  if (kind === 'vet') {
    return (
      <svg {...common}>
        <rect
          x="4"
          y="4"
          width="16"
          height="16"
          rx="4"
        />
        <path d="M12 8v8M8 12h8" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M4 5h16M4 10h16M4 15h10M4 20h10" />
      <circle cx="19" cy="17.5" r="2.5" />
    </svg>
  )
}

function VetHorseRoute({
  currentUser,
  onRefresh,
  examination = false,
}) {
  const { horseId } = useParams()
  const { search: examSearch } = useLocation()
  const navigate = useNavigate()
  const loadSequence = useRef(0)
  const examParams = new URLSearchParams(examSearch)
  const requestedRecordId = examParams.get('record')
  const healthReportId = examParams.get('report') || undefined
  const [conflictNotice, setConflictNotice] = useState('')

  const [horse, setHorse] =
    useState(null)

  const [records, setRecords] =
    useState([])

  const [
    registrationHistory,
    setRegistrationHistory,
  ] = useState([])

  const [
    loadedHorseId,
    setLoadedHorseId,
  ] = useState('')

  const [error, setError] =
    useState('')

  const load = useCallback(
    async (
      preserveExistingError = false,
    ) => {
      const sequence = ++loadSequence.current
      try {
        const [
          horseResult,
          recordResult,
          documents,
          history,
        ] = await Promise.all([
          getHorseById(
            String(horseId),
          ),

          getMedicalRecords(
            String(horseId),
          ),

          getHorseDocuments(
            String(horseId),
          ),

          getRegistrationHistory(
            String(horseId),
          ),
        ])

        if (sequence !== loadSequence.current) return false
        setError('')

        setHorse({
          ...horseResult,
          documents,
        })

        setRecords(recordResult)

        setRegistrationHistory(
          history,
        )

        return true
      } catch (loadError) {
        if (sequence !== loadSequence.current) return false
        if (!preserveExistingError) {
          setError(
            vetError(loadError, 'Không thể tải hồ sơ khám. Vui lòng thử lại.'),
          )
        }

        return false
      } finally {
        if (sequence === loadSequence.current) setLoadedHorseId(String(horseId))
      }
    },
    [horseId],
  )

  useEffect(() => {
    void load()
    return () => { loadSequence.current += 1 }
  }, [load])

  const loading =
    loadedHorseId !==
    String(horseId)

  if (loading) {
    return (
      <main className="page-content">
        <section
          className="panel"
          role="status"
        >
          <VetLoading label="Đang tải hồ sơ khám…" />
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="page-content">
        <section
          className="panel"
          role="alert"
        >
          <h1>
            Không thể tải hồ sơ khám
          </h1>

          <p>{error}</p>

          <button className="button button-secondary" onClick={() => void load()}>Thử lại</button>
        </section>
      </main>
    )
  }

  if (!horse) {
    return null
  }

  const requestStatus = {
    PENDING_EXAM: 'PendingExam',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
  }[horse.profileStatus]

  const activeRequest =
    requestStatus
      ? registrationHistory.find(
          (item) =>
            item.status ===
            requestStatus,
        )
      : undefined

  const draft = activeRequest ? records.find(record =>
    record.registrationRequestId === activeRequest.id
    && record.examType === 'Initial Exam' && record.recordStatus === 'Draft') : undefined

  const signedRecord =
    activeRequest
      ? records.find(
          (record) =>
            record.registrationRequestId ===
              activeRequest.id &&
            record.examType ===
              'Initial Exam' &&
            record.recordStatus ===
              'Signed',
        )
      : undefined

  if (examination) {
    const initialRecord = requestedRecordId && records.find(r => r.id === requestedRecordId && r.examType === 'Initial Exam' && r.registrationRequestId === activeRequest?.id)
    if (!healthReportId && (initialRecord || (!requestedRecordId && (horse.profileStatus === 'PENDING_EXAM' || examParams.get('intake') === '1')))) {
      return <Navigate to={`/vet/horses/${horse.id}/clinical`} replace />
    }
    const approvedExam = horse.profileStatus === 'APPROVED' && examParams.get('intake') !== '1'
    const requestedRecord = records.find(r => r.id === requestedRecordId)
    if (requestedRecordId && (!requestedRecord || requestedRecord.horseId !== horse.id)) {
      return <main className="page-content"><section className="panel" role="alert"><p>Không tìm thấy phiếu khám của ngựa này.</p><Link to={`/vet/horses/${horse.id}`}>Quay về hồ sơ</Link></section></main>
    }
    const examDraft = requestedRecord?.recordStatus === 'Draft' ? requestedRecord : approvedExam ? undefined : draft
    const examSigned = requestedRecord?.recordStatus === 'Signed' ? requestedRecord : approvedExam ? undefined : signedRecord
    return (
      <VetExaminationForm
        key={`${horse.id}:${activeRequest?.id || ''}:${examDraft?.id || ''}:${examSigned?.id || ''}:${healthReportId || ''}`}
        horse={horse}
        records={records}
        registrationRequestId={activeRequest?.id}
        onDraftSaved={record => {
          setRecords(rows => [record, ...rows.filter(r => r.id !== record.id)])
          const next = new URLSearchParams(examSearch)
          next.set('record', record.id)
          next.delete('new')
          navigate({ search: next.toString() }, { replace: true })
        }}
        currentUser={
          currentUser
        }
        draft={examDraft}
        healthReportId={healthReportId}
        signedRecord={
          examSigned
        }
        onSaveDraft={saveExaminationDraft}
        onConflict={async () => {
          setConflictNotice('Trạng thái ca khám đã thay đổi hoặc lần lưu chưa được xác nhận. Đã yêu cầu cập nhật hàng chờ; hãy đối chiếu dữ liệu mới nhất trước khi tiếp tục.')
          const results = await Promise.allSettled([onRefresh(horse.id), load(true)])
          if (results.some(result => result.status === 'rejected' || result.value === false)) {
            throw new Error('Không thể cập nhật đầy đủ hàng chờ và hồ sơ.')
          }
        }}
        conflictNotice={conflictNotice}
        onSign={
          signMedicalRecord
        }
        onAfterSign={async () => {
          const loaded =
            await load(true)

          if (!loaded) {
            throw new Error(
              'Phiếu đã chốt nhưng không tải lại được hồ sơ. Hãy tải lại để xác nhận dữ liệu mới nhất.',
            )
          }

          await onRefresh(
            horse.id,
          )
        }}
      />
    )
  }

  return <VetMedicalProfile horse={horse} records={records} currentUser={currentUser}
    activeRequestId={activeRequest?.id}
    onRefresh={async (id) => {
      const loaded = await load()
      if (!loaded) throw new Error('Không thể tải lại hồ sơ.')
      await onRefresh(id)
    }} />
}


function IntegratedHerdPage() {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  if (params.get('view') === 'stalls') { params.delete('view'); return <Navigate to={`/vet/stalls?${params}`} replace /> }
  return <F3Vet.VetHerdPage />
}

function IntegratedAssignmentRedirect() {
  const { horseId } = useParams()
  return <Navigate to={`/training/horses/${horseId}/assessment`} replace />
}

function IntegratedReportRedirect() {
  const { reportId } = useParams()
  return <Navigate to={`/vet/reports?report=${reportId}&status=all`} replace />
}

function IntegratedExamRedirect() {
  const { horseId, recordId } = useParams()
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  if (recordId) params.set('record', recordId)
  return <Navigate to={`/vet/horses/${horseId}/examination?${params}`} replace />
}

function IntegratedRecordRedirect() {
  const { recordId } = useParams()
  const [record, setRecord] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    apiGet(`/medical-records/${recordId}`).then(r => { if (active) setRecord(r) })
      .catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [recordId])
  if (error) return <main className="page-content"><p role="alert">{error}</p></main>
  return record ? <Navigate to={`/vet/horses/${record.HorseID}/examination?record=${recordId}`} replace /> : <VetLoading />
}

function AppContent() {
  const location = useLocation()
  const independentManagerPage = /^\/manager\/(staff|roles)(?:\/|$)/.test(location.pathname)
  const independentVetPage = /^\/vet\/(overview|herd|stalls|reports|calendar|intake-results|notifications|horses-needing-exam|horses\/)/.test(location.pathname)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const [
    currentUser,
    setCurrentUser,
  ] = useState(null)

  const [
    authChecking,
    setAuthChecking,
  ] = useState(
    Boolean(getAccessToken()),
  )

  const [
    authError,
    setAuthError,
  ] = useState('')

  const [
    loggingIn,
    setLoggingIn,
  ] = useState(false)

  const [
    initialExams,
    setInitialExams,
  ] = useState([])

  const [
    loadingData,
    setLoadingData,
  ] = useState(
    Boolean(getAccessToken()),
  )

  const [
    loadError,
    setLoadError,
  ] = useState('')

  const [
    reloadCount,
    setReloadCount,
  ] = useState(0)

  useEffect(() => {
    const expire = () => {
      clearPendingHorseDocumentUploads()
      setCurrentUser(null)

      setAuthError(
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      )
    }

    window.addEventListener(
      'equi:session-expired',
      expire,
    )

    return () =>
      window.removeEventListener(
        'equi:session-expired',
        expire,
      )
  }, [])

  useEffect(() => {
    if (!getAccessToken()) {
      setAuthChecking(false)
      return
    }

    let current = true

    getCurrentUser()
      .then((user) => {
        if (current) {
          setCurrentUser(user)
          setAuthError('')
        }
      })
      .catch((error) => {
        if (current) {
          const expired = error instanceof ApiError && error.status === 401
          if (expired) {
            clearPendingHorseDocumentUploads()
            clearSession()
          }

          setCurrentUser(null)

          // Phiên cũ hết hạn / không còn hợp lệ (vd. đổi database): chỉ cần đăng nhập lại, không hiện lỗi kỹ thuật
          setAuthError(
            expired ? ''
              : error instanceof Error
                ? error.message
                : 'Không thể xác minh phiên đăng nhập.',
          )
        }
      })
      .finally(() => {
        if (current) {
          setAuthChecking(false)
        }
      })

    return () => {
      current = false
    }
  }, [])

  const loadData = useCallback(async () => {
    if (!currentUser || userRole(currentUser) !== 'vet' || !currentUser.permissions.includes('MEDICAL_MANAGE')) {
      setInitialExams([]); setLoadingData(false); setLoadError(''); return
    }
    setLoadingData(true)
    try {
      setInitialExams(await getPendingInitialExams()); setLoadError('')
    } catch (error) {
      setInitialExams([])
      setLoadError(error instanceof Error ? error.message : 'Không thể tải hàng chờ khám.')
    } finally { setLoadingData(false) }
  }, [currentUser])

  useEffect(() => {
    void loadData()
  }, [
    loadData,
    reloadCount,
  ])

  const retryLoad = () => {
    setLoadingData(true)

    setLoadError('')

    setReloadCount(
      (count) => count + 1,
    )
  }

  async function handleLogin(
    email,
    password,
  ) {
    setLoggingIn(true)
    setLoadingData(true)
    setAuthError('')
    setLoadError('')

    try {
      const result =
        await login(
          email,
          password,
        )

      setCurrentUser(
        result.user,
      )
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'Không thể đăng nhập.',
      )

      throw error
    } finally {
      setLoggingIn(false)
    }
  }

  function logout() {
    if (userRole(currentUser) === 'vet' && hasUnsavedClinicalChanges() && !window.confirm('Nội dung y tế chưa được lưu. Đăng xuất và bỏ thay đổi?')) return
    clearPendingHorseDocumentUploads()
    clearSession()

    setCurrentUser(null)

    setLoadingData(false)

    setInitialExams([])

    setAuthError('')
    setLoadError('')
  }

  async function refreshVetData(
    horseId,
  ) {
    const [
      horse,
      examRows,
    ] = await Promise.all([
      getHorseById(
        String(horseId),
      ),

      getPendingInitialExams(),
    ])

    setInitialExams(
      examRows,
    )

    return horse
  }

  const role =
    userRole(currentUser)

  const home =
    role === 'owner'
      ? '/owner/horses'
      : role === 'vet'
        ? currentUser?.permissions.includes('HORSE_VIEW') ? '/vet/overview' : '/vet/notifications'
        : role === 'headTrainer'
          ? '/training/dashboard'
          : role === 'trainer'
            ? '/training/my-plans'
            : role === 'workRider'
              ? '/training/work-rider-sessions'
              : role === 'groom'
                ? careHome
                : currentUser?.permissions.includes('HORSE_VIEW') ? '/manager/horses' : '/manager/staff'

  /*
   * ======================================
   * PUBLIC LANDING PAGE
   * ======================================
   *
   * Trang "/" luôn truy cập được,
   * không cần đăng nhập.
   */
  if (location.pathname === '/') {
    return <LandingPage />
  }

  /*
   * ======================================
   * AUTH CHECKING
   * ======================================
   */
  if (authChecking) {
    return (
      <main className="page-content">
        <section
          className="panel"
          role="status"
        >
          Đang xác minh phiên đăng
          nhập...
        </section>
      </main>
    )
  }

  /*
   * ======================================
   * LOGIN
   * ======================================
   */
  if (location.pathname === '/reset-password') {
    return <ResetPasswordScreen />
  }

  if (
    location.pathname ===
    '/login'
  ) {
    if (currentUser) {
      return (
        <Navigate
          to={home}
          replace
        />
      )
    }

    return (
      <LoginScreen
        onLogin={
          handleLogin
        }
        error={authError}
        busy={loggingIn}
      />
    )
  }

  /*
   * ======================================
   * PROTECTED ROUTES
   * ======================================
   *
   * Chưa login mà truy cập Manager,
   * Owner hoặc Vet thì về /login.
   */
  if (!currentUser) {
    return (
      <Navigate
        to="/login"
        replace
      />
    )
  }

  if (currentUser.mustChangePassword) {
    return <ForceChangePasswordScreen user={currentUser} onLogout={logout}
      onDone={() => { void getCurrentUser().then(setCurrentUser).catch(() => setAuthError('Không thể cập nhật thông tin tài khoản.')) }} />
  }

  if (!role) {
    return <NoRoleScreen email={currentUser.email} onLogout={logout} />
  }

  return (
    <AccessProvider role={role} permissions={currentUser.permissions}>
    <div className={`app-shell${role === 'vet' ? ' vet-shell' : ''}${sidebarCollapsed ? " sidebar-is-collapsed" : ""}`}>
      {role === 'vet' && <ClinicalNavigationGuard />}
      {role === 'vet' && <F3Vet.UrgentAlert />}
      <aside className="app-sidebar" aria-label="Thanh menu">
        <div className="sidebar-brand-row">
          <Link className="brand" to={home} title="EquiTrack">
            <span className="brand-mark" aria-hidden="true">
              <img src="/equitrack-mark.jpg" alt="" />
            </span>
            <span>
              <strong>EQUITRACK</strong>
              <small>RACEHORSE PERFORMANCE</small>
            </span>
          </Link>
          <button
            className="sidebar-collapse-button"
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            title={sidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
              {sidebarCollapsed ? <path d="m14 9 3 3-3 3" /> : <path d="m17 9-3 3 3 3" />}
            </svg>
          </button>
        </div>

        <p className="sidebar-label">
          KHÔNG GIAN LÀM VIỆC
        </p>

        <nav
          className="side-nav"
          aria-label="Điều hướng chính"
        >
          {role ===
            'manager' && (
            <>
              {currentUser.permissions.includes('RBAC_MANAGE') && <>
                <NavLink to="/manager/staff" title="Nhân sự và tài khoản"><NavIcon kind="staff" /><span>Nhân sự và tài khoản</span></NavLink>
                <NavLink to="/manager/roles" title="Phân quyền chức vụ"><NavIcon kind="roles" /><span>Phân quyền chức vụ</span></NavLink>
              </>}
              <NavLink
                end
                to="/manager/horses" title="Danh sách ngựa"
              >
                <NavIcon kind="horses" />

                <span>
                  Danh sách ngựa
                </span>
              </NavLink>

              {currentUser.permissions.includes(
                'PROFILE_EDIT_APPROVE',
              ) && (
                <NavLink to="/manager/profile-change-requests" title="Yêu cầu sửa hồ sơ">
                  <NavIcon kind="requests" />

                  <span>
                    Yêu cầu sửa hồ sơ
                  </span>
                </NavLink>
              )}
              <NavLink to="/manager/stalls" title="Sơ đồ chuồng trại"><NavIcon kind="stall" /><span>Sơ đồ chuồng trại</span></NavLink>
              {currentUser.permissions.includes('CLUB_MANAGE') && <NavLink to="/manager/vet-duty" title="Lịch trực bác sĩ thú y"><NavIcon kind="schedule" /><span>Lịch trực bác sĩ thú y</span></NavLink>}
              {currentUser.permissions.includes('CLUB_MANAGE') && <NavLink to="/manager/support-requests" title="Yêu cầu hỗ trợ"><NavIcon kind="requests" /><span>Yêu cầu hỗ trợ</span></NavLink>}
            </>
          )}

          {role === 'owner' && (
            <>
              <NavLink
                end
                to="/owner/horses" title="Ngựa của tôi"
              >
                <NavIcon kind="horses" />

                <span>
                  Ngựa của tôi
                </span>
              </NavLink>

              <NavLink to="/owner/training/activity" title="Hoạt động huấn luyện">
                <NavIcon kind="activity" />

                <span>
                  Hoạt động huấn luyện
                </span>
              </NavLink>
            </>
          )}

          {role === 'vet' && <>
            {currentUser.permissions.includes('HORSE_VIEW') && <>
              <NavLink to="/vet/overview" title="Tổng quan"><NavIcon kind="overview" /><span>Tổng quan</span></NavLink>
              <NavLink to="/vet/horses-needing-exam" title="Khám lâm sàng"><NavIcon kind="vet" /><span>Khám lâm sàng</span></NavLink>
              <NavLink to="/vet/herd" title="Đàn ngựa và chuồng trại"><NavIcon kind="horses" /><span>Đàn ngựa và chuồng trại</span></NavLink>
              <NavLink to="/vet/reports" title="Báo cáo sức khỏe"><NavIcon kind="requests" /><span>Báo cáo sức khỏe</span></NavLink>
              <NavLink to="/vet/calendar" title="Lịch y tế"><NavIcon kind="schedule" /><span>Lịch y tế</span></NavLink>
            </>}
            <NavLink to="/vet/notifications" title="Thông báo"><NavIcon kind="activity" /><span>Thông báo</span></NavLink>
          </>}

          {role === 'headTrainer' && (
            <>
              <NavLink
                end
                to="/training/dashboard" title="Tổng quan huấn luyện"
              >
                <NavIcon kind="overview" />

                <span>
                  Tổng quan huấn luyện
                </span>
              </NavLink>

              <NavLink to="/training/plans" title="Giáo án huấn luyện">
                <NavIcon kind="plan" />
                <span>Giáo án huấn luyện</span>
              </NavLink>

              <NavLink to="/training/trainers" title="Hồ sơ huấn luyện viên"><NavIcon kind="staff" /><span>Hồ sơ huấn luyện viên</span></NavLink>

              <NavLink to="/training/approvals" title="Duyệt giáo án">
                <NavIcon kind="approval" />

                <span>
                  Duyệt giáo án
                </span>
              </NavLink>

              <NavLink to="/training/schedule" title="Lịch tập">
                <NavIcon kind="schedule" />

                <span>
                  Lịch tập
                </span>
              </NavLink>

              <NavLink to="/training/results" title="Kết quả tập luyện">
                <NavIcon kind="results" />
                <span>Kết quả tập luyện</span>
              </NavLink>

              <NavLink to="/training/adjustments" title="Điều chỉnh giáo án">
                <NavIcon kind="edit" />

                <span>
                  Điều chỉnh giáo án
                </span>
              </NavLink>
            </>
          )}

          {role === 'trainer' && (
            <>
              <NavLink
                end
                to="/training/my-plans" title="Ngựa và giáo án"
              >
                <NavIcon kind="plan" />

                <span>
                  Ngựa & giáo án
                </span>
              </NavLink>

              <NavLink to="/training/schedule" title="Lịch tập">
  <NavIcon kind="schedule" />

  <span>
    Lịch tập
  </span>
</NavLink>

              <NavLink to="/training/trainer-sessions" title="Buổi tập giám sát">
                <NavIcon kind="supervision" />

                <span>
                  Buổi tập giám sát
                </span>
              </NavLink>
              <NavLink to="/training/reviews" title="Đánh giá buổi tập">
  <NavIcon kind="review" />

  <span>
    Đánh giá buổi tập
  </span>
</NavLink>
            </>
          )}

          {role === 'workRider' && (
            <NavLink
              end
              to="/training/work-rider-sessions" title="Buổi tập của tôi"
            >
              <NavIcon kind="rider" />

              <span>
                Buổi tập của tôi
              </span>
            </NavLink>
          )}

          {role !== 'owner' && currentUser.permissions.includes('AUDIT_VIEW') && <NavLink to="/audit-logs" title="Nhật ký hệ thống"><NavIcon kind="activity" /><span>Nhật ký hệ thống</span></NavLink>}

          {/* Flow 4 – chăm sóc, dinh dưỡng (menu khai báo trong pages/care/careRoutes.jsx) */}
          {currentUser.permissions.includes('HEALTH_REPORT') && ['groom', 'workRider', 'trainer', 'headTrainer'].includes(role) && <NavLink to="/health-reports" title="Báo cáo sức khỏe"><NavIcon kind="health" /><span>Báo cáo sức khỏe</span></NavLink>}
          {careNavItems(role, currentUser.permissions).length > 0 && role !== 'groom' && (
            <p className="sidebar-label">CHĂM SÓC &amp; DINH DƯỠNG</p>
          )}
          {careNavItems(role, currentUser.permissions).map((item) => (
            <NavLink key={item.to} to={item.to} title={item.label}>
              <NavIcon kind={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
          {role === 'groom' && currentUser.permissions.includes('HORSE_VIEW') && <NavLink to="/groom/stalls" title="Sơ đồ chuồng trại"><NavIcon kind="stall" /><span>Sơ đồ chuồng trại</span></NavLink>}
        </nav>

        {role !== 'manager' && <SidebarSupport />}
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-workspace">
            <strong className="topbar-role">{roleLabels[role]}</strong>
          </div>

          <div className="topbar-account">
            <time className="topbar-date" dateTime={new Date().toISOString().slice(0, 10)}>
              {new Date().toLocaleDateString(dateLocale(), { day: "2-digit", month: "2-digit", year: "numeric" })}
            </time>
            <LanguageSwitch />
            <NotificationBell role={role} />
            <div className="topbar-user">
              <span
                className="avatar"
                aria-hidden="true"
              >
                {currentUser.fullName
                  .split(' ')
                  .map(
                    (part) =>
                      part[0],
                  )
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </span>

              <div className="account-name">
                <strong>
                  {
                    currentUser.fullName
                  }
                </strong>

                <span>
                  <i />

                  {loadingData
                    ? 'Đang tải...'
                    : 'Đang hoạt động'}
                </span>
              </div>
            </div>

            {/* Về trang giới thiệu (/) mà không đăng xuất */}
            <Link className="button button-secondary topbar-home" to="/" title="Về trang chủ EquiTrack" style={{ gap: 6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v10h13V10" /><path d="M10 20v-5h4v5" /></svg>
              <span className="topbar-home-text">Trang chủ</span>
            </Link>

            <button
              className="button button-secondary"
              type="button"
              onClick={logout}
            >
              Đăng xuất
            </button>
          </div>
        </header>

        {loadError && !independentManagerPage && !independentVetPage && (
          <div
            className="alert-banner"
            role="alert"
            style={{
              margin:
                '12px 24px 0',
              background:
                '#fff4f4',
              color: '#7a1d1d',
              border:
                '1px solid #f7c2c2',
              borderRadius: 8,
              padding: '10px 12px',
            }}
          >
            {role === 'vet' ? 'Không thể tải dữ liệu khám. Vui lòng thử lại.' : loadError}{' '}
            <button className="button button-secondary" onClick={retryLoad}>Thử lại</button>
          </div>
        )}

        {loadingData && !independentManagerPage && !independentVetPage && (
          <main className="page-content">
            <section
              className="panel"
              role="status"
            >
              Đang tải dữ liệu...
            </section>
          </main>
        )}

        {(independentManagerPage || independentVetPage || (!loadingData && !loadError)) && (
          <RouteAccessBoundary><Routes>
<Route path="/manager/staff" element={role === 'manager' && currentUser.permissions.includes('RBAC_MANAGE') ? <F1Accounts.StaffListPage /> : <Navigate to={home} replace />} />

<Route path="/manager/staff/new" element={role === 'manager' && currentUser.permissions.includes('RBAC_MANAGE') ? <F1Accounts.CreateAccountPage /> : <Navigate to={home} replace />} />

<Route path="/manager/staff/:userId" element={role === 'manager' && currentUser.permissions.includes('RBAC_MANAGE')
              ? <F1Accounts.AccountDetailPage currentUser={currentUser} onIdentityChanged={() => { void getCurrentUser().then(setCurrentUser).catch(() => setAuthError('Không thể cập nhật thông tin tài khoản.')) }} />
              : <Navigate to={home} replace />} />

<Route path="/manager/roles" element={role === 'manager' && currentUser.permissions.includes('RBAC_MANAGE')
              ? <F1Accounts.RolesPage onIdentityChanged={() => { void getCurrentUser().then(setCurrentUser).catch(() => setAuthError('Không thể cập nhật quyền. Vui lòng đăng nhập lại.')) }} />
              : <Navigate to={home} replace />} />

<Route path="/manager/horses" element={role === 'manager' && currentUser.permissions.includes('HORSE_VIEW') ? <F1.ManagerHorsesPage canCreate={currentUser.permissions.some(p => ['HORSE_REGISTER', 'HORSE_REGISTER_REVIEW'].includes(p))} /> : <Navigate to={home} replace />} />

<Route path="/manager/horses/new" element={role === 'manager' && currentUser.permissions.some((permission) => ['HORSE_REGISTER', 'HORSE_REGISTER_REVIEW'].includes(permission)) ? <F1HorseFormPage manager currentUser={currentUser} /> : <Navigate to={home} replace />} />

<Route path="/manager/horses/:horseId/edit" element={role === 'manager' && currentUser.permissions.some((permission) => ['HORSE_REGISTER', 'HORSE_REGISTER_REVIEW'].includes(permission)) ? <F1HorseFormPage manager currentUser={currentUser} /> : <Navigate to={home} replace />} />

<Route path="/manager/horses/:horseId/archive" element={role === 'manager' && currentUser.permissions.includes('HORSE_ARCHIVE') ? <F1.ArchivePage onChanged={retryLoad} /> : <Navigate to={home} replace />} />

<Route path="/manager/owners/new" element={role === 'manager' && currentUser.permissions.includes('RBAC_MANAGE') ? <F1Accounts.CreateAccountPage owner /> : <Navigate to={home} replace />} />

<Route path="/manager/stalls" element={role === 'manager' && currentUser.permissions.includes('HORSE_VIEW') ? <F1StallPage /> : <Navigate to={home} replace />} />

<Route path="/manager/support-requests" element={role === 'manager' && currentUser.permissions.includes('CLUB_MANAGE') ? <SupportRequestsPage /> : <Navigate to={home} replace />} />

<Route path="/manager/horses/:horseId/profile" element={role === 'manager' ? <F1.ManagerHorseProfilePage /> : <Navigate to={home} replace />} />

<Route path="/audit-logs" element={role !== 'owner' && currentUser.permissions.includes('AUDIT_VIEW') ? <AuditLogPage /> : <Navigate to={home} replace />} />

<Route path="/manager/profile-change-requests" element={role === 'manager' && currentUser.permissions.includes('PROFILE_EDIT_APPROVE') ? <F1.ChangeRequestsPage onChanged={retryLoad} /> : <Navigate to={home} replace />} />

<Route path="/manager/horses/:horseId/intake" element={role === 'manager' ? <F1.ManagerProcessPage onChanged={retryLoad} /> : <Navigate to={home} replace />} />
<Route path="/groom/stalls" element={role === 'groom' && currentUser.permissions.includes('HORSE_VIEW') ? <F1StallPage readOnly /> : <Navigate to={home} replace />} />

<Route path="/owner/horses" element={role === 'owner' ? <F1Owner.OwnerHorsesPage /> : <Navigate to={home} replace />} />

<Route path="/owner/horses/new" element={role === 'owner' ? <F1HorseFormPage currentUser={currentUser} /> : <Navigate to={home} replace />} />

<Route path="/owner/horses/:horseId/edit" element={role === 'owner' ? <F1HorseFormPage currentUser={currentUser} /> : <Navigate to={home} replace />} />

<Route
  path="/owner/horses/:horseId/training/plans"
  element={
    role === 'owner' ? (
      <F2Owner.OwnerPlansPage />
    ) : (
      <Navigate
        to={home}
        replace
      />
    )
  }
/>

<Route
  path="/owner/horses/:horseId/training/plans/:planId"
  element={
    role === 'owner' ? (
      <F2Owner.OwnerPlanSummaryPage />
    ) : (
      <Navigate
        to={home}
        replace
      />
    )
  }
/>

<Route
  path="/owner/training/activity"
  element={
    role === 'owner' ? (
      <OwnerTrainingActivityPage />
    ) : (
      <Navigate
        to={home}
        replace
      />
    )
  }
/>

<Route path="/vet/stalls" element={role === 'vet' && currentUser.permissions.includes('HORSE_VIEW') ? <VetWorkspace currentUser={currentUser} mode="stalls" /> : <Navigate to={home} replace />} />

<Route path="/vet/overview" element={role === 'vet' ? <F3Vet.VetOverviewPage /> : <Navigate to={home} replace />} />

<Route path="/vet/herd" element={role === 'vet' ? <IntegratedHerdPage currentUser={currentUser} /> : <Navigate to={home} replace />} />

<Route path="/vet/reports/:reportId" element={role === "vet" ? <IntegratedReportRedirect /> : <Navigate to={home} replace />} />

<Route path="/vet/horses/:horseId/exam/new" element={role === "vet" ? <IntegratedExamRedirect /> : <Navigate to={home} replace />} />

<Route path="/vet/records/:recordId/edit" element={role === "vet" ? <IntegratedRecordRedirect /> : <Navigate to={home} replace />} />

<Route path="/vet/notifications" element={role === 'vet' ? <NotificationsPage currentUser={currentUser} role="vet" /> : <Navigate to={home} replace />} />

<Route path="/vet/horses-needing-exam" element={role === 'vet' ? <F1Vet.VetQueuePage currentUser={currentUser} /> : <Navigate to={home} replace />} />

<Route path="/vet/horses/:horseId/clinical" element={role === 'vet' ? <F1Vet.ClinicalExamPage currentUser={currentUser} /> : <Navigate to={home} replace />} />

<Route
              path="/vet/horses/:horseId"
              element={
                role ===
                'vet' ? (
                  <VetHorseRoute
                    currentUser={
                      currentUser
                    }
                    initialExams={
                      initialExams
                    }
                    onRefresh={
                      refreshVetData
                    }
                  />
                ) : (
                  <Navigate
                    to={home}
                    replace
                  />
                )
              }
            />

<Route
              path="/vet/horses/:horseId/examination"
              element={
                role ===
                'vet' ? (
                  <VetHorseRoute
                    currentUser={
                      currentUser
                    }
                    initialExams={
                      initialExams
                    }
                    onRefresh={
                      refreshVetData
                    }
                    examination
                  />
                ) : (
                  <Navigate
                    to={home}
                    replace
                  />
                )
              }
            />

<Route path="/owner/horses/:horseId" element={role === 'owner' ? <F1Owner.OwnerHorseDetailPage /> : <Navigate to={home} replace />} />

<Route
  path="/owner/horses/:horseId/training"
  element={
    role ===
    'owner' ? (
      <F2Owner.OwnerSessionsPage />
    ) : (
      <Navigate
        to={home}
        replace
      />
    )
  }
/>

<Route
  path="/owner/horses/:horseId/training/sessions/:sessionId"
  element={
    role ===
    'owner' ? (
      <F2Owner.OwnerSessionDetailPage />
    ) : (
      <Navigate
        to={home}
        replace
      />
    )
  }
/>

<Route path="/owner/horses/:horseId/correction-request" element={role === 'owner' ? <F1Owner.OwnerChangeRequestPage /> : <Navigate to={home} replace />} />

<Route
  path="/owner/horses/:horseId/training/stages"
  element={
    role === 'owner' ? (
      <OwnerTrainingStagesPage />
    ) : (
      <Navigate
        to={home}
        replace
      />
    )
  }
/>

<Route
  path="/owner/horses/:horseId/training/plans/:planId/stages/:stageId"
  element={
    role === 'owner' ? (
      <F2Owner.OwnerStageSummaryPage />
    ) : (
      <Navigate
        to={home}
        replace
      />
    )
  }
/>

<Route path="/horses/:horseId" element={<HorseProfileByRole role={role} />} />

<Route path="/training/dashboard" element={role === 'headTrainer' ? <F2Head.HeadDashboardPage /> : <Navigate to={home} replace />} />

<Route path="/training/results" element={role === 'headTrainer' ? <F2Head.ResultsPage /> : <Navigate to={home} replace />} />

<Route path="/training/horses/:horseId/assessment" element={role === 'headTrainer' ? <F2Head.AssessmentPage /> : <Navigate to={home} replace />} />

<Route path="/training/horses/:horseId/assignment" element={role === 'headTrainer' ? <IntegratedAssignmentRedirect /> : <Navigate to={home} replace />} />

<Route path="/training/horses/:horseId/assessment-history" element={role === 'headTrainer' ? <F2Head.AssessmentHistoryPage /> : <Navigate to={home} replace />} />

<Route path="/training/trainers/:trainerId" element={role === 'headTrainer' ? <F2Head.TrainerProfilePage /> : <Navigate to={home} replace />} />

<Route path="/training/trainers" element={role === 'headTrainer' ? <F2Head.TrainersPage /> : <Navigate to={home} replace />} />

<Route path="/training/plans" element={role === 'headTrainer' ? <F2Head.HeadPlansPage /> : <Navigate to={home} replace />} />

<Route path="/training/approvals" element={role === 'headTrainer' ? <F2Head.ApprovalsPage /> : <Navigate to={home} replace />} />

<Route path="/training/approvals/:planId" element={role === 'headTrainer' ? <F2Head.ApprovalDetailPage /> : <Navigate to={home} replace />} />

<Route path="/training/adjustments" element={role === 'headTrainer' ? <F2Head.AdjustmentsPage /> : <Navigate to={home} replace />} />

<Route path="/training/my-plans" element={role === 'trainer' ? <F2Trainer.MyPlansPage /> : <Navigate to={home} replace />} />

<Route path="/training/plans/new" element={role === 'trainer' ? <F2Trainer.PlanFormPage /> : <Navigate to={home} replace />} />

<Route path="/training/plans/:planId/edit" element={role === 'trainer' ? <F2Trainer.PlanFormPage /> : <Navigate to={home} replace />} />

<Route path="/training/plans/:planId" element={['trainer', 'headTrainer'].includes(role) ? <F2Trainer.PlanDetailPage role={role} currentUser={currentUser} /> : <Navigate to={home} replace />} />

<Route path="/training/schedule" element={['trainer', 'headTrainer'].includes(role) ? <F2Session.SchedulePage role={role} currentUser={currentUser} /> : <Navigate to={home} replace />} />

<Route path="/training/sessions/new" element={['trainer', 'headTrainer'].includes(role) ? <F2Session.SessionFormPage role={role} /> : <Navigate to={home} replace />} />

<Route path="/training/sessions/:sessionId/edit" element={['trainer', 'headTrainer'].includes(role) ? <F2Session.SessionFormPage role={role} /> : <Navigate to={home} replace />} />

<Route path="/training/sessions/:sessionId" element={['trainer', 'headTrainer'].includes(role) ? <F2Session.SessionDetailPage role={role} currentUser={currentUser} /> : <Navigate to={home} replace />} />

<Route path="/training/trainer-sessions" element={role === 'trainer' ? <F2Session.SupervisedSessionsPage currentUser={currentUser} /> : <Navigate to={home} replace />} />

<Route path="/training/reviews" element={role === 'trainer' ? <F2Session.ReviewQueuePage currentUser={currentUser} /> : <Navigate to={home} replace />} />

<Route path="/training/sessions/:sessionId/review" element={role === 'trainer' ? <F2Session.ReviewFormPage /> : <Navigate to={home} replace />} />

<Route path="/training/work-rider-sessions" element={role === 'workRider' ? <F2Rider.RiderSessionsPage /> : <Navigate to={home} replace />} />

<Route path="/training/work-rider-sessions/:sessionId" element={role === 'workRider' ? <F2Rider.RiderSessionDetailPage /> : <Navigate to={home} replace />} />

<Route path="/training/work-rider-sessions/:sessionId/result" element={role === 'workRider' ? <F2Rider.RiderResultPage /> : <Navigate to={home} replace />} />

<Route path="/health-reports" element={currentUser.permissions.includes('HEALTH_REPORT') && ['groom', 'workRider', 'trainer', 'headTrainer'].includes(role) ? <HealthReportsPage /> : <Navigate to={home} replace />} />

<Route path="/health-reports/:reportId" element={['groom', 'workRider', 'trainer', 'headTrainer'].includes(role) ? <F3Report.StaffReportDetailPage /> : role === 'vet' ? <VetReportRedirect /> : <Navigate to={home} replace />} />

{['reports', 'calendar', 'intake-results'].map(mode => <Route key={mode} path={`/vet/${mode}`} element={role === 'vet' && currentUser.permissions.includes('HORSE_VIEW')
  ? <VetWorkspace currentUser={currentUser} mode={mode} initialExams={initialExams} intakeError={loadError} intakeLoading={loadingData} /> : <Navigate to={home} replace />} />)}

{careRoutes({ role, currentUser, home })}

<Route
              path="*"
              element={
                <main className="page-content">
                  <section className="panel">
                    <h1>
                      Không tìm thấy
                      trang
                    </h1>

                    <Link
                      to={home}
                    >
                      Quay lại
                    </Link>
                  </section>
                </main>
              }
            />
</Routes></RouteAccessBoundary>
        )}

        <footer className="app-footer">
          EQUITRACK
        </footer>
      </div>
    </div>
    </AccessProvider>
  )
}

const router = createBrowserRouter([{ path: '*', element: <AppContent /> }])

function App() {
  return <RouterProvider router={router} />
}

export default App
