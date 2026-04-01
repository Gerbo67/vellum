import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useThemeStore } from '@/store/theme'
import { useAuthStore } from '@/store/auth'
import { Toaster } from '@/components/ui/toaster'
import { AuthInitializer } from '@/components/AuthInitializer'
import Layout from '@/components/Layout'

const SetupPage = lazy(() => import('@/pages/Setup'))
const LoginPage = lazy(() => import('@/pages/Login'))
const InboxPage = lazy(() => import('@/pages/Inbox'))
const AdminUsersPage = lazy(() => import('@/pages/admin/Users'))
const AdminProjectsPage = lazy(() => import('@/pages/admin/Projects'))
const AdminSmtpPage = lazy(() => import('@/pages/admin/Smtp'))
const AdminAuthPage = lazy(() => import('@/pages/admin/AuthConfig'))
const DocsPage = lazy(() => import('@/pages/Docs'))
const AnalyzerPage = lazy(() => import('@/pages/Analyzer'))
const ProfilePage = lazy(() => import('@/pages/Profile'))
const AcceptInvitePage = lazy(() => import('@/pages/AcceptInvite'))

/**
 * Route guard that redirects unauthenticated users to the login page.
 * Wraps any route that requires a valid session.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

/**
 * Route guard that restricts access to users with the `admin` role.
 * Unauthenticated users are sent to login; non-admin users are sent to the root.
 */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

/**
 * Root application component.
 * Configures routing, lazy-loaded pages, theme synchronization, and global toast rendering.
 */
export default function App() {
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (theme === 'light') {
      root.classList.remove('dark')
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.toggle('dark', prefersDark)
    }
  }, [theme])

  return (
    <BrowserRouter>
      <AuthInitializer>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/invite/:token" element={<AcceptInvitePage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<InboxPage />} />
              <Route path="inbox/:projectId" element={<InboxPage />} />
              <Route path="analyzer" element={<AnalyzerPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route
                path="admin/users"
                element={
                  <AdminRoute>
                    <AdminUsersPage />
                  </AdminRoute>
                }
              />
              <Route
                path="admin/projects"
                element={
                  <AdminRoute>
                    <AdminProjectsPage />
                  </AdminRoute>
                }
              />
              <Route
                path="admin/smtp"
                element={
                  <AdminRoute>
                    <AdminSmtpPage />
                  </AdminRoute>
                }
              />
              <Route
                path="admin/auth"
                element={
                  <AdminRoute>
                    <AdminAuthPage />
                  </AdminRoute>
                }
              />
              <Route path="docs" element={<DocsPage />} />
              <Route path="docs/:slug" element={<DocsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthInitializer>
      <Toaster />
    </BrowserRouter>
  )
}
