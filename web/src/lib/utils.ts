import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges Tailwind CSS class names using `clsx` and `tailwind-merge`.
 * Resolves conflicting utility classes so the last one wins.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats an ISO 8601 date string into a human-readable relative timestamp.
 * Returns locale-aware short date for dates older than 7 days.
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)

  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes}m`
  if (hours < 24) return `hace ${hours}h`
  if (days < 7) return `hace ${days}d`
  return date.toLocaleDateString('es', { day: '2-digit', month: 'short' })
}

/**
 * Converts a byte count into a human-readable string (B, KB, or MB).
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Extracts the bare email address from an RFC 5322 formatted string.
 * Given `"John Doe <john@example.com>"`, returns `"john@example.com"`.
 * Returns the original string if no angle brackets are present.
 */
export function extractEmail(address: string): string {
  const match = address.match(/<(.+?)>/)
  return match ? match[1] : address
}

/**
 * Extracts the display name from an RFC 5322 formatted address.
 * Given `"John Doe <john@example.com>"`, returns `"John Doe"`.
 * Returns the original string if no display name is found.
 */
export function extractName(address: string): string {
  const match = address.match(/^([^<]+)</)
  return match ? match[1].trim() : address
}

/**
 * Formats a numeric count for display in a badge.
 * Caps at `"99+"` to prevent layout overflow.
 */
export function formatBadge(count: number): string {
  return count > 99 ? '99+' : String(count)
}
