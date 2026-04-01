import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Visual theme options. `system` defers to the OS preference via `prefers-color-scheme`. */
type Theme = 'light' | 'dark' | 'system'

/**
 * Zustand store for the visual theme preference.
 * Persisted to localStorage under `vellum-theme`.
 */
interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'vellum-theme' },
  ),
)

