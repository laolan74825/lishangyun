import {
  createRouter,
  createRoute,
  createRootRoute,
  Outlet,
  Navigate,
  redirect,
} from '@tanstack/react-router'
import { isAuthenticated, isAdmin } from './lib/auth'
import AppLayout from './components/layout/AppLayout'
import AdminLayout from './components/layout/AdminLayout'
import LoginPage from './pages/LoginPage'
import PasswordResetPage from './pages/PasswordResetPage'
import DashboardPage from './pages/DashboardPage'
import RecordFormPage from './pages/RecordFormPage'
import RecordsListPage from './pages/RecordsListPage'
import CollectPage from './pages/CollectPage'
import { GuestbookListPage, GuestbookNewPage } from './pages/GuestbookPage'
import GuestbookDetailPage from './pages/GuestbookDetailPage'
import AccountsPage from './pages/AccountsPage'
import PeoplePage from './pages/PeoplePage'
import PersonDetailPage from './pages/PersonDetailPage'
import MergeWizardPage from './pages/MergeWizardPage'
import StatsPage from './pages/StatsPage'
import SettingsPage from './pages/SettingsPage'
import SecurityPage from './pages/SecurityPage'
import TerminalSettingsPage from './pages/TerminalSettingsPage'
import DataImportPage from './pages/DataImportPage'
import FamilyPage from './pages/FamilyPage'
import CollaborationPage from './pages/CollaborationPage'
import NotificationsPage from './pages/NotificationsPage'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import AdminAuditPage from './pages/admin/AdminAuditPage'
import AdminSettingsPage from './pages/admin/AdminSettingsPage'
import AdminAnnouncementsPage from './pages/admin/AdminAnnouncementsPage'
import AdminRecyclePage from './pages/admin/AdminRecyclePage'

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-ink-secondary">
      <span className="text-4xl">🚧</span>
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <p className="text-sm">该模块正在开发中，敬请期待</p>
    </div>
  )
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const passwordResetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/password-reset',
  component: PasswordResetPage,
})

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_layout',
  component: AppLayout,
  beforeLoad: () => {
    if (!isAuthenticated()) {
      throw redirect({ to: '/login' })
    }
  },
})

const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/',
  component: DashboardPage,
})

const recordsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/records',
  component: RecordsListPage,
})

const recordsNewRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/records/new',
  component: RecordFormPage,
})

const guestbooksRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/guestbooks',
  component: GuestbookListPage,
})

const guestbooksNewRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/guestbooks/new',
  component: GuestbookNewPage,
})

const guestbookDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/guestbooks/$id',
  component: GuestbookDetailPage,
})

const collectRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/guestbooks/$id/collect',
  component: CollectPage,
})

const terminalSettingsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/guestbooks/$id/terminal',
  component: TerminalSettingsPage,
})

const accountsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/accounts',
  component: AccountsPage,
})

const peopleRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/people',
  component: PeoplePage,
})

const personDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/people/$id',
  component: PersonDetailPage,
})

const mergeWizardRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/merge/$id',
  component: MergeWizardPage,
})

const statsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/stats',
  component: StatsPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/settings',
  component: SettingsPage,
})

const importRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/import',
  component: DataImportPage,
})

const joinRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/join',
  component: () => <PlaceholderPage title="加入协作" />,
})

const notificationsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/notifications',
  component: NotificationsPage,
})

const familyRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/family',
  component: FamilyPage,
})

const securityRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/security',
  component: SecurityPage,
})

const collaborationRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/collaboration',
  component: CollaborationPage,
})

const adminRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/admin',
  beforeLoad: () => {
    if (!isAdmin()) {
      throw redirect({ to: '/' })
    }
  },
  component: AdminLayout,
})

const adminIndexRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/',
  component: AdminDashboardPage,
})

const adminUsersRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/users',
  component: AdminUsersPage,
})

const adminAuditRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/audit',
  component: AdminAuditPage,
})

const adminSettingsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/settings',
  component: AdminSettingsPage,
})

const adminAnnouncementsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/announcements',
  component: AdminAnnouncementsPage,
})

const adminRecycleRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/recycle',
  component: AdminRecyclePage,
})

const catchAllRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '*',
  component: () => <Navigate to="/" />,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  passwordResetRoute,
  layoutRoute.addChildren([
    indexRoute,
    recordsRoute,
    recordsNewRoute,
    guestbooksRoute,
    guestbooksNewRoute,
    guestbookDetailRoute,
    collectRoute,
    terminalSettingsRoute,
    accountsRoute,
    peopleRoute,
    personDetailRoute,
    mergeWizardRoute,
    statsRoute,
    settingsRoute,
    importRoute,
    joinRoute,
    notificationsRoute,
    familyRoute,
    securityRoute,
    collaborationRoute,
    adminRoute.addChildren([
      adminIndexRoute,
      adminUsersRoute,
      adminAuditRoute,
      adminSettingsRoute,
      adminAnnouncementsRoute,
      adminRecycleRoute,
    ]),
  ]),
  catchAllRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
