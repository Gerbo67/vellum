import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'

/** Routes that do not require authentication. */
const PUBLIC_PATHS = ['/setup', '/login', '/register']

/**
 * Bootstrap component that runs once on mount to determine the initial auth state.
 *
 * Sequentially checks:
 * 1. Whether the platform has completed first-time setup; redirects to `/setup` if not.
 * 2. Whether the current session cookie resolves to a valid user via `/auth/me`.
 * 3. Clears state and redirects to `/login` on failure (unless already on a public path).
 *
 * Renders a loading spinner until the initialization sequence completes.
 */
export function AuthInitializer({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const { setUser, clear } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    let active = true

    async function init() {
      try {
        const status = await api.auth.setupStatus()
        if (!active) return

        if (!status.setup_complete) {
          if (location.pathname !== '/setup') {
            navigate('/setup', { replace: true })
          }
          return
        }

        const me = await api.auth.me()
        if (!active) return
        setUser(me)
      } catch {
        if (!active) return
        clear()
        if (!PUBLIC_PATHS.includes(location.pathname)) {
          navigate('/login', { replace: true })
        }
      } finally {
        if (active) setReady(true)
      }
    }

    init()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  return <>{children}</>
}
