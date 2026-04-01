import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Supported locale identifiers. */
export type Lang = 'es' | 'en'

/**
 * Zustand store for the active UI language.
 * Persisted to localStorage under `vellum-lang`.
 */
interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: 'es',
      setLang: (lang) => set({ lang }),
    }),
    { name: 'vellum-lang' },
  ),
)

