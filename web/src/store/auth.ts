import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/lib/api'

/**
 * Zustand store that holds the authenticated user session.
 * Persisted to localStorage under `vellum-auth` so the session survives page reloads.
 */
interface AuthState {
  user: User | null
  setUser: (user: User | null) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      clear: () => set({ user: null }),
    }),
    { name: 'vellum-auth' },
  ),
)
