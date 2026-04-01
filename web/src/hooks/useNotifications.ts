import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'vellum-notifications-enabled'
const supported = typeof window !== 'undefined' && 'Notification' in window

/**
 * Manages browser desktop notification permissions and delivery.
 *
 * Encapsulates the Notification API lifecycle: permission requests, enable/disable
 * toggle persisted in localStorage, and the actual notification dispatch.
 *
 * @returns `supported` - whether the Notification API is available in this context.
 * @returns `permission` - current browser permission state.
 * @returns `enabled` - user-level opt-in preference (independent of browser permission).
 * @returns `toggle` - switches notifications on/off, requesting permission when necessary.
 * @returns `notify` - dispatches a desktop notification for a new incoming email.
 */
export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'denied',
  )
  const [enabled, setEnabled] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  })

  useEffect(() => {
    if (supported) setPermission(Notification.permission)
  }, [])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!supported) return false
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result === 'granted') {
      setEnabled(true)
      localStorage.setItem(STORAGE_KEY, 'true')
      return true
    }
    return false
  }, [])

  const toggle = useCallback(async () => {
    if (enabled) {
      setEnabled(false)
      localStorage.setItem(STORAGE_KEY, 'false')
      return
    }
    if (permission === 'granted') {
      setEnabled(true)
      localStorage.setItem(STORAGE_KEY, 'true')
    } else if (permission !== 'denied') {
      await requestPermission()
    }
  }, [enabled, permission, requestPermission])

  const notify = useCallback(
    (projectName: string, subject: string) => {
      if (!enabled || !supported || permission !== 'granted') return
      try {
        const n = new Notification(projectName, {
          body: subject || '(sin asunto)',
          icon: '/vellum-icon.svg',
          badge: '/vellum-icon.svg',
          tag: 'vellum-new-email',
          silent: false,
        } as NotificationOptions)
        n.onclick = () => {
          window.focus()
          n.close()
        }
      } catch {
        // La API de Notification puede no estar disponible en algunos contextos
      }
    },
    [enabled, permission],
  )

  return {
    supported,
    permission,
    enabled,
    toggle,
    notify,
  }
}

