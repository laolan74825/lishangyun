import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import RecordFormPage from './pages/RecordFormPage'
import RecordsListPage from './pages/RecordsListPage'
import CollectPage from './pages/CollectPage'
import { GuestbookListPage, GuestbookNewPage } from './pages/GuestbookPage'
import GuestbookDetailPage from './pages/GuestbookDetailPage'
import AccountsPage from './pages/AccountsPage'
import PeoplePage from './pages/PeoplePage'
import StatsPage from './pages/StatsPage'
import SettingsPage from './pages/SettingsPage'
import { isAuthenticated } from './lib/auth'
import './styles/index.css'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/records" element={<RecordsListPage />} />
          <Route path="/records/new" element={<RecordFormPage />} />
          <Route path="/guestbooks" element={<GuestbookListPage />} />
          <Route path="/guestbooks/new" element={<GuestbookNewPage />} />
          <Route path="/guestbooks/:id" element={<GuestbookDetailPage />} />
          <Route path="/guestbooks/:id/collect" element={<CollectPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/people" element={<PeoplePage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/join" element={<PlaceholderPage title="加入协作" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
)

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-ink-secondary">
      <span className="text-4xl">🚧</span>
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <p className="text-sm">该模块正在开发中，敬请期待</p>
    </div>
  )
}
