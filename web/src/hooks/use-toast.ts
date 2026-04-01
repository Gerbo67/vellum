import * as React from 'react'
import { useReducer, useEffect } from 'react'
import type { ToastActionElement, ToastProps } from '@/components/ui/toast'

/** Maximum number of simultaneous toasts rendered in the viewport. */
const TOAST_LIMIT = 5
/** Milliseconds before a dismissed toast is removed from the DOM. */
const TOAST_REMOVE_DELAY = 4000

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

type Action =
  | { type: 'ADD_TOAST'; toast: ToasterToast }
  | { type: 'UPDATE_TOAST'; toast: Partial<ToasterToast> }
  | { type: 'DISMISS_TOAST'; toastId?: string }
  | { type: 'REMOVE_TOAST'; toastId?: string }

interface State {
  toasts: ToasterToast[]
}

let count = 0

/** Generates a monotonically increasing ID that wraps at MAX_SAFE_INTEGER. */
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

/** Schedules DOM removal of a dismissed toast after TOAST_REMOVE_DELAY. */
function addToRemoveQueue(toastId: string, dispatch: React.Dispatch<Action>) {
  if (toastTimeouts.has(toastId)) return
  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({ type: 'REMOVE_TOAST', toastId })
  }, TOAST_REMOVE_DELAY)
  toastTimeouts.set(toastId, timeout)
}

/** Pure reducer that manages the toast collection. */
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_TOAST':
      return { ...state, toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) }
    case 'UPDATE_TOAST':
      return { ...state, toasts: state.toasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t)) }
    case 'DISMISS_TOAST':
      return { ...state, toasts: state.toasts.map((t) => (t.id === action.toastId || !action.toastId ? { ...t, open: false } : t)) }
    case 'REMOVE_TOAST':
      return action.toastId ? { ...state, toasts: state.toasts.filter((t) => t.id !== action.toastId) } : { ...state, toasts: [] }
  }
}

/**
 * Module-level listeners and state.
 * This pattern enables `toast()` to be called outside of React component scope
 * while still triggering re-renders in components that consume `useToast()`.
 */
const listeners: Array<(state: State) => void> = []
let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((l) => l(memoryState))
}

type Toast = Omit<ToasterToast, 'id'>

/**
 * Imperatively creates a toast notification.
 * Can be called from any module, not only from within React components.
 *
 * @returns An object with `id`, `dismiss`, and `update` methods for programmatic control.
 */
function toast(props: Toast) {
  const id = genId()
  const update = (p: ToasterToast) => dispatch({ type: 'UPDATE_TOAST', toast: { ...p, id } })
  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id })

  dispatch({
    type: 'ADD_TOAST',
    toast: { ...props, id, open: true, onOpenChange: (open) => { if (!open) dismiss() } },
  })

  return { id, dismiss, update }
}

/**
 * React hook that subscribes to the global toast state.
 * Returns the current list of toasts together with the `toast` and `dismiss` helpers.
 */
function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) listeners.splice(index, 1)
    }
  }, [])

  useEffect(() => {
    state.toasts.forEach((t) => {
      if (t.open === false) addToRemoveQueue(t.id, dispatch)
    })
  }, [state.toasts])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  }
}

export { useToast, toast }
