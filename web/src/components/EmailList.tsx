import { useState } from 'react'
import { cn, formatDate, extractName } from '@/lib/utils'
import type { Email } from '@/lib/api'
import { Skeleton } from './ui/skeleton'
import { useAuthStore } from '@/store/auth'
import { Check, ChevronDown, ChevronRight, Minus } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

// -- Threading helpers -------------------------------------------------------

/** Strips RFC 5322 angle brackets from a Message-ID. */
function normalizeMessageId(mid: string): string {
  return mid.replace(/^<|>$/g, '').trim()
}

/** Retrieves the first value of a case-insensitive header from the email's raw headers. */
function getHeader(email: Email, key: string): string | null {
  const vals = email.raw_headers?.[key.toLowerCase()]
  return vals && vals.length > 0 ? vals[0] : null
}

/** Represents a conversation thread: one or more emails linked by Message-ID references. */
interface EmailThread {
  id: string
  emails: Email[]
  subject: string
  latestAt: string
  senders: string[]
  unreadCount: number
}

/**
 * Groups a flat list of emails into conversation threads using a Union-Find algorithm.
 *
 * Emails are linked when they share a Message-ID, or when one references another
 * via the `In-Reply-To` or `References` headers. The resulting threads are sorted
 * by the timestamp of their most recent email (descending).
 *
 * @param emails - Flat email list from the API.
 * @param userId - Current user ID, used to compute per-thread unread counts.
 */
function buildThreads(emails: Email[], userId?: string): EmailThread[] {
  if (!emails.length) return []

  const byMsgId = new Map<string, string[]>()
  for (const e of emails) {
    if (e.message_id) {
      const mid = normalizeMessageId(e.message_id)
      if (mid) {
        if (!byMsgId.has(mid)) byMsgId.set(mid, [])
        byMsgId.get(mid)!.push(e.id)
      }
    }
  }

  const uf = new Map<string, string>()

  function find(id: string): string {
    let x = id
    while (uf.has(x)) x = uf.get(x)!
    let curr = id
    while (uf.has(curr)) {
      const next = uf.get(curr)!
      uf.set(curr, x)
      curr = next
    }
    return x
  }

  function union(a: string, b: string) {
    const ra = find(a), rb = find(b)
    if (ra !== rb) uf.set(rb, ra)
  }

  // Agrupar emails con Message-ID duplicado
  for (const [, ids] of byMsgId) {
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i])
  }

  // Enlazar emails con su padre via In-Reply-To / References
  for (const e of emails) {
    const inReplyTo = getHeader(e, 'in-reply-to')
    const references = getHeader(e, 'references')
    let parentId: string | null = null

    if (inReplyTo) {
      const norm = normalizeMessageId(inReplyTo.trim())
      parentId = byMsgId.get(norm)?.[0] ?? null
    }
    if (!parentId && references) {
      const refs = references.split(/\s+/).map(r => normalizeMessageId(r)).filter(Boolean)
      for (let i = refs.length - 1; i >= 0; i--) {
        const p = byMsgId.get(refs[i])?.[0]
        if (p) { parentId = p; break }
      }
    }
    if (parentId && parentId !== e.id) union(parentId, e.id)
  }

  const groups = new Map<string, Email[]>()
  for (const e of emails) {
    const root = find(e.id)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(e)
  }

  const threads: EmailThread[] = []
  for (const [root, threadEmails] of groups) {
    const sorted = [...threadEmails].sort(
      (a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime(),
    )
    const latest = sorted[sorted.length - 1]
    const unreadCount = userId
      ? sorted.filter(e => !(e.read_by ?? []).includes(userId)).length
      : 0
    threads.push({
      id: root,
      emails: sorted,
      subject: sorted[0].subject || '',
      latestAt: latest.received_at,
      senders: [...new Set(sorted.map(e => extractName(e.from) || e.from))],
      unreadCount,
    })
  }

  return threads.sort(
    (a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime(),
  )
}

// -- Component ---------------------------------------------------------------

interface EmailListProps {
  emails: Email[]
  selectedId?: string
  loading?: boolean
  onSelect: (email: Email) => void
  /** When true, clicking an email toggles its checkbox instead of opening it. */
  selectMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
}

/**
 * Renders the email list panel, grouping messages into conversation threads.
 * Supports both single-click navigation and multi-select bulk operations.
 */
export function EmailList({
  emails,
  selectedId,
  loading,
  onSelect,
  selectMode,
  selectedIds,
  onToggleSelect,
}: EmailListProps) {
  const user = useAuthStore((s) => s.user)
  const t = useI18n()
  const [expandedThreadIds, setExpandedThreadIds] = useState<Set<string>>(new Set())

  const threads = buildThreads(emails, user?.id)

  function toggleThread(threadId: string) {
    setExpandedThreadIds(prev => {
      const next = new Set(prev)
      if (next.has(threadId)) next.delete(threadId)
      else next.add(threadId)
      return next
    })
  }

  function toggleThreadSelect(thread: EmailThread) {
    if (!onToggleSelect) return
    const allSelected = thread.emails.every(e => selectedIds?.has(e.id))
    for (const e of thread.emails) {
      const isSelected = selectedIds?.has(e.id) ?? false
      if (allSelected && isSelected) onToggleSelect(e.id)
      if (!allSelected && !isSelected) onToggleSelect(e.id)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-1 p-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-md p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    )
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="rounded-full bg-muted p-4 mb-4">
          <svg className="h-8 w-8 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </div>
        <p className="text-sm font-medium">{t.inbox.noEmails}</p>
        <p className="text-xs text-muted-foreground mt-1">{t.inbox.noEmailsHint}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {threads.map((thread) => {
        const isSingle = thread.emails.length === 1
        const hasUnread = thread.unreadCount > 0

        if (isSingle) {
          const email = thread.emails[0]
          const isRead = user ? (email.read_by ?? []).includes(user.id) : false
          const isSelected = email.id === selectedId
          const isChecked = selectedIds?.has(email.id) ?? false

          return (
            <button
              key={email.id}
              onClick={() => selectMode ? onToggleSelect?.(email.id) : onSelect(email)}
              className={cn(
                'flex items-stretch w-full text-left border-b border-border transition-colors hover:bg-accent/50',
                isRead ? 'border-l-2 border-l-transparent' : 'border-l-2 border-l-primary',
                isSelected && !selectMode && 'bg-accent',
                isChecked && 'bg-primary/10',
              )}
            >
              {selectMode && (
                <div className="flex items-center justify-center w-10 shrink-0">
                  <div className={cn(
                    'h-4 w-4 rounded border-2 transition-colors flex items-center justify-center',
                    isChecked ? 'bg-primary border-primary' : 'border-muted-foreground/40',
                  )}>
                    {isChecked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                  </div>
                </div>
              )}
              <div className={cn('flex flex-col gap-1 min-w-0 flex-1 py-3', selectMode ? 'pr-4' : 'px-4')}>
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('text-sm truncate', isRead ? 'opacity-60' : 'font-semibold')}>
                    {extractName(email.from) || email.from}
                  </span>
                  <span className={cn('text-xs whitespace-nowrap shrink-0', isRead ? 'opacity-60' : 'text-muted-foreground')}>
                    {formatDate(email.received_at)}
                  </span>
                </div>
                <span className={cn('text-sm truncate', isRead ? 'opacity-60' : 'font-medium text-foreground')}>
                  {email.subject || t.inbox.noSubject}
                </span>
              </div>
            </button>
          )
        }

        // Hilo con múltiples correos
        const isExpanded = expandedThreadIds.has(thread.id)
        const allChecked = thread.emails.every(e => selectedIds?.has(e.id))
        const someChecked = thread.emails.some(e => selectedIds?.has(e.id))
        const isThreadSelected = !selectMode && thread.emails.some(e => e.id === selectedId)

        return (
          <div key={thread.id} className="border-b border-border">
            <button
              onClick={() => selectMode ? toggleThreadSelect(thread) : toggleThread(thread.id)}
              className={cn(
                'flex items-stretch w-full text-left transition-colors hover:bg-accent/50',
                hasUnread ? 'border-l-2 border-l-primary' : 'border-l-2 border-l-transparent',
                isThreadSelected && !isExpanded && 'bg-accent',
                allChecked && 'bg-primary/10',
                someChecked && !allChecked && 'bg-primary/5',
              )}
            >
              {selectMode ? (
                <div className="flex items-center justify-center w-10 shrink-0">
                  <div className={cn(
                    'h-4 w-4 rounded border-2 transition-colors flex items-center justify-center',
                    allChecked
                      ? 'bg-primary border-primary'
                      : someChecked
                        ? 'bg-primary/20 border-primary/50'
                        : 'border-muted-foreground/40',
                  )}>
                    {allChecked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    {someChecked && !allChecked && <Minus className="h-2.5 w-2.5 text-primary" />}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center w-8 shrink-0">
                  {isExpanded
                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />
                    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
                </div>
              )}

              <div className="flex flex-col gap-1 min-w-0 flex-1 py-3 pr-4">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('text-sm truncate', hasUnread ? 'font-semibold' : 'opacity-60')}>
                    {thread.senders.slice(0, 2).join(', ')}
                    {thread.senders.length > 2 ? ` +${thread.senders.length - 2}` : ''}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={cn(
                      'text-[10px] font-medium rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center leading-none',
                      hasUnread ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground/70',
                    )}>
                      {thread.emails.length}
                    </span>
                    <span className={cn('text-xs whitespace-nowrap', hasUnread ? 'text-muted-foreground' : 'opacity-60')}>
                      {formatDate(thread.latestAt)}
                    </span>
                  </div>
                </div>
                <span className={cn('text-sm truncate', hasUnread ? 'font-medium text-foreground' : 'opacity-60')}>
                  {thread.subject || t.inbox.noSubject}
                </span>
              </div>
            </button>

            {isExpanded && (
              <div className="bg-muted/20">
                {thread.emails.map((email) => {
                  const isRead = user ? (email.read_by ?? []).includes(user.id) : false
                  const isSelected = email.id === selectedId
                  const isChecked = selectedIds?.has(email.id) ?? false

                  return (
                    <button
                      key={email.id}
                      onClick={() => selectMode ? onToggleSelect?.(email.id) : onSelect(email)}
                      className={cn(
                        'flex items-center w-full text-left border-t border-border/40 transition-colors hover:bg-accent/50',
                        isRead ? 'border-l-2 border-l-transparent' : 'border-l-2 border-l-primary/60',
                        isSelected && !selectMode && 'bg-accent',
                        isChecked && 'bg-primary/10',
                      )}
                    >
                      {selectMode ? (
                        <div className="flex items-center justify-center w-10 shrink-0">
                          <div className={cn(
                            'h-3.5 w-3.5 rounded border-2 transition-colors flex items-center justify-center',
                            isChecked ? 'bg-primary border-primary' : 'border-muted-foreground/40',
                          )}>
                            {isChecked && <Check className="h-2 w-2 text-primary-foreground" />}
                          </div>
                        </div>
                      ) : (
                        <div className="w-8 shrink-0" />
                      )}
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1 py-2.5 pr-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn('text-xs truncate', isRead ? 'opacity-60' : 'font-semibold')}>
                            {extractName(email.from) || email.from}
                          </span>
                          <span className={cn('text-[10px] whitespace-nowrap shrink-0', isRead ? 'opacity-50' : 'text-muted-foreground')}>
                            {formatDate(email.received_at)}
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
