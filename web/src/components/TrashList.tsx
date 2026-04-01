import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Trash2, X, CheckSquare, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import type { Email } from '@/lib/api'
import { formatDate, formatBytes } from '@/lib/utils'
import { Button } from './ui/button'
import { useToast } from '@/hooks/use-toast'
import { useI18n } from '@/lib/i18n'
import { EmailDetail } from './EmailDetail'

/** Props for {@link TrashList}. */
interface TrashListProps {
  /** Project whose trashed emails are displayed. */
  projectId: string
  /** Callback invoked when the user navigates back to the inbox view. */
  onBack: () => void
}

/**
 * Calculates the number of full days remaining before an email is permanently purged.
 * Returns -1 if no purge date is set.
 */
function daysUntilPurge(purgeAt?: string): number {
  if (!purgeAt) return -1
  const ms = new Date(purgeAt).getTime() - Date.now()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

/**
 * Displays the trash view for a single project: soft-deleted emails with expiry countdowns,
 * restore/purge actions, multi-select support, and inline email preview via EmailDetail.
 */
export function TrashList({ projectId, onBack }: TrashListProps) {
  const t = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 50
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['trash', projectId, page],
    queryFn: () => api.trash.list(projectId, page, pageSize),
    enabled: !!projectId,
  })

  const { data: trashStats } = useQuery({
    queryKey: ['trash-stats', projectId],
    queryFn: () => api.trash.stats(projectId),
    enabled: !!projectId,
  })

  const emails = data?.data ?? []
  const total = data?.meta.total ?? 0
  const totalPages = Math.ceil(total / pageSize)
  const allSelected = emails.length > 0 && emails.every((e) => selectedIds.has(e.id))

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['trash', projectId] })
    queryClient.invalidateQueries({ queryKey: ['trash-total', projectId] })
    queryClient.invalidateQueries({ queryKey: ['trash-stats', projectId] })
    queryClient.invalidateQueries({ queryKey: ['project-storage', projectId] })
    queryClient.invalidateQueries({ queryKey: ['emails', projectId] })
    queryClient.invalidateQueries({ queryKey: ['unread-counts'] })
  }

  const restoreMutation = useMutation({
    mutationFn: (ids: string[]) => api.trash.restore(projectId, ids),
    onSuccess: (_, ids) => {
      invalidate()
      setSelectedIds(new Set())
      setSelectMode(false)
      if (selectedEmail && ids.includes(selectedEmail.id)) setSelectedEmail(null)
      toast({ title: ids.length === 1 ? t.trash.restoreSuccess : t.trash.restoreSuccessMultiple(ids.length) })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const deleteForeverMutation = useMutation({
    mutationFn: (emailId: string) => api.trash.deleteOne(projectId, emailId),
    onSuccess: (_, emailId) => {
      invalidate()
      if (selectedEmail?.id === emailId) setSelectedEmail(null)
      toast({ title: t.trash.deleteForeverSuccess })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const purgeMutation = useMutation({
    mutationFn: () => api.trash.purge(projectId),
    onSuccess: () => {
      invalidate()
      setSelectedEmail(null)
      setSelectedIds(new Set())
      setSelectMode(false)
      toast({ title: t.trash.purgeSuccess })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(emails.map((e) => e.id)))
  }

  function handlePurge() {
    if (window.confirm(t.trash.purgeConfirm)) purgeMutation.mutate()
  }

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      <div className={`flex flex-col w-full sm:w-80 shrink-0 border-r ${selectedEmail && !selectMode ? 'hidden sm:flex' : 'flex'}`}>

        {selectMode ? (
          <div className="flex items-center px-2 h-14 border-b gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }}>
              <X className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium flex-1 min-w-0 truncate px-1">
              {selectedIds.size > 0 ? `${selectedIds.size} sel.` : t.trash.title}
            </span>
            <Button variant="ghost" size="sm" className="text-xs h-8 px-2 shrink-0" onClick={toggleAll}>
              {allSelected ? t.inbox.none : t.inbox.all}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1 shrink-0 text-primary"
              disabled={selectedIds.size === 0 || restoreMutation.isPending}
              onClick={() => restoreMutation.mutate(Array.from(selectedIds))}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 h-14 border-b gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7 px-2 -ml-1 text-muted-foreground" onClick={onBack}>
                <ChevronLeft className="h-3.5 w-3.5" />
                {t.trash.backToInbox}
              </Button>
            </div>
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectMode(true)} aria-label={t.inbox.selectEmails}>
                <CheckSquare className="h-4 w-4" />
              </Button>
              {emails.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={handlePurge}
                  disabled={purgeMutation.isPending}
                  aria-label={t.trash.purge}
                  title={t.trash.purge}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="px-3 py-2 border-b bg-amber-50/60 dark:bg-amber-900/10 shrink-0">
          <div className="flex gap-1.5 items-start">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-snug">{t.trash.disclaimer}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-14 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <Trash2 className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-muted-foreground">{t.trash.empty}</p>
              <p className="text-xs text-muted-foreground mt-1">{t.trash.emptyHint}</p>
            </div>
          ) : (
            <ul>
              {emails.map((email) => {
                const days = daysUntilPurge(email.purge_at)
                const isProjectDeleted = email.project_deleted
                return (
                  <li
                    key={email.id}
                    className={`flex items-start gap-2 px-3 py-2.5 border-b cursor-pointer hover:bg-accent transition-colors ${selectedEmail?.id === email.id ? 'bg-accent' : ''}`}
                    onClick={() => !selectMode ? setSelectedEmail(email) : toggleSelect(email.id)}
                  >
                    {selectMode && (
                      <input
                        type="checkbox"
                        className="mt-1 shrink-0 accent-primary"
                        checked={selectedIds.has(email.id)}
                        onChange={() => toggleSelect(email.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{email.subject || t.inbox.noSubject}</p>
                      <p className="text-xs text-muted-foreground truncate">{email.from}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground tabular-nums">{formatDate(email.received_at)}</span>
                        {isProjectDeleted ? (
                          <span className="text-[10px] bg-destructive/10 text-destructive rounded px-1">{t.trash.projectDeletedBadge}</span>
                        ) : days >= 0 ? (
                          <span className={`text-[10px] rounded px-1 ${days === 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                            {t.trash.expiresIn(days)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {!selectMode && !isProjectDeleted && (
                      <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-primary"
                          onClick={(e) => { e.stopPropagation(); restoreMutation.mutate([email.id]) }}
                          title={t.trash.restore}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {(totalPages > 1 || (trashStats?.size_bytes ?? 0) > 0) && (
          <div className="border-t px-3 py-2 flex items-center justify-between text-xs text-muted-foreground shrink-0">
            <div className="flex items-center gap-1.5">
              <span>{total} {total === 1 ? 'correo' : 'correos'}</span>
              {(trashStats?.size_bytes ?? 0) > 0 && (
                <span className="text-muted-foreground/60">· {t.trash.trashSize(formatBytes(trashStats!.size_bytes))}</span>
              )}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span>{page}/{totalPages}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`flex flex-1 flex-col overflow-hidden min-w-0 ${selectedEmail ? 'flex' : 'hidden sm:flex'}`}>
        {selectedEmail && (
          <div className="flex items-center justify-between h-10 px-3 border-b shrink-0 bg-muted/30">
            <Button variant="ghost" size="sm" className="gap-1 text-xs h-8 sm:hidden" onClick={() => setSelectedEmail(null)}>
              <ChevronLeft className="h-3.5 w-3.5" />
              {t.inbox.back}
            </Button>
            {!selectedEmail.project_deleted && (
              <div className="flex items-center gap-1 ml-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs h-7 text-primary"
                  onClick={() => restoreMutation.mutate([selectedEmail.id])}
                  disabled={restoreMutation.isPending}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t.trash.restore}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs h-7 text-destructive hover:text-destructive"
                  onClick={() => deleteForeverMutation.mutate(selectedEmail.id)}
                  disabled={deleteForeverMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t.trash.deleteForever}
                </Button>
              </div>
            )}
          </div>
        )}
        <EmailDetail
          email={selectedEmail}
          onClose={() => setSelectedEmail(null)}
        />
      </div>
    </div>
  )
}

