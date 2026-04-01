import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, ChevronLeft, ChevronRight, ArrowLeft, CheckSquare, Trash2, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { Email } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { EmailList } from '@/components/EmailList'
import { EmailDetail } from '@/components/EmailDetail'
import { TrashList } from '@/components/TrashList'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useI18n } from '@/lib/i18n'
import { formatBadge, formatBytes, cn } from '@/lib/utils'

/**
 * Main inbox view. Shows the email list for the selected project with threaded
 * conversations, pagination, read/unread state, bulk delete, and inline email preview.
 * Supports deep-linking to a specific email via the `eid` query parameter.
 */
export default function InboxPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const t = useI18n()

  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 50
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'inbox' | 'trash'>('inbox')

  const [searchParams, setSearchParams] = useSearchParams()
  const emailIdFromUrl = searchParams.get('eid')
  const prevProjectIdRef = useRef(projectId)

  // Limpia el correo seleccionado cuando cambia el proyecto sin desmontar el componente
  useEffect(() => {
    if (prevProjectIdRef.current === projectId) return
    prevProjectIdRef.current = projectId
    setSelectedEmail(null)
  }, [projectId])


  const { data, isLoading, refetch } = useQuery({
    queryKey: ['emails', projectId, page],
    queryFn: () => {
      if (!projectId) return null
      return api.emails.list(projectId, page, pageSize)
    },
    enabled: !!projectId,
    refetchInterval: false,
  })

  // Restaura el correo seleccionado desde la URL cuando los datos están disponibles
  useEffect(() => {
    if (!emailIdFromUrl || selectedEmail !== null) return
    const found = (data?.data ?? []).find((e) => e.id === emailIdFromUrl)
    if (found) setSelectedEmail(found)
  }, [emailIdFromUrl, data, selectedEmail])

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId!),
    enabled: !!projectId,
  })

  const { data: trashTotalData } = useQuery({
    queryKey: ['trash-total', projectId],
    queryFn: () => api.trash.list(projectId!, 1, 1),
    enabled: !!projectId,
  })
  const trashCount = trashTotalData?.meta.total ?? 0

  const { data: storageData } = useQuery({
    queryKey: ['project-storage', projectId],
    queryFn: () => api.projects.storage(projectId!),
    enabled: !!projectId,
  })

  const deleteMutation = useMutation({
    mutationFn: (emailId: string) => api.emails.delete(projectId!, emailId),
    onSuccess: (_, emailId) => {
      queryClient.invalidateQueries({ queryKey: ['emails', projectId] })
      queryClient.invalidateQueries({ queryKey: ['trash', projectId] })
      queryClient.invalidateQueries({ queryKey: ['trash-total', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-storage', projectId] })
      if (selectedEmail?.id === emailId) closeEmail()
      toast({ title: t.inbox.emailDeleted })
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: 'destructive' })
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => api.emails.delete(projectId!, id)))
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ['emails', projectId] })
      queryClient.invalidateQueries({ queryKey: ['trash', projectId] })
      queryClient.invalidateQueries({ queryKey: ['trash-total', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-storage', projectId] })
      queryClient.invalidateQueries({ queryKey: ['unread-counts'] })
      if (selectedEmail && ids.includes(selectedEmail.id)) closeEmail()
      setSelectedIds(new Set())
      setSelectMode(false)
      toast({ title: t.inbox.emailsDeleted(ids.length) })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  function closeEmail() {
    setSelectedEmail(null)
    setSearchParams((p) => { p.delete('eid'); return p }, { replace: true })
  }

  async function handleSelect(email: Email) {
    setSelectedEmail(email)
    setSearchParams((p) => { p.set('eid', email.id); return p }, { replace: true })
    if (user && !email.read_by?.includes(user.id)) {
      await api.emails.markRead(projectId!, email.id).catch(() => null)
      queryClient.invalidateQueries({ queryKey: ['unread-counts'] })
      queryClient.setQueryData(['emails', projectId, page], (old: typeof data) => {
        if (!old) return old
        return {
          ...old,
          data: (old.data ?? []).map((e) =>
            e.id === email.id ? { ...e, read_by: [...(e.read_by ?? []), user.id] } : e,
          ),
        }
      })
    }
  }

  function toggleSelectMode() {
    setSelectMode((v) => !v)
    setSelectedIds(new Set())
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="rounded-full bg-muted p-4 mb-4">
          <svg className="h-10 w-10 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />
          </svg>
        </div>
        <p className="text-sm font-medium">{t.inbox.selectProject}</p>
        <p className="text-xs text-muted-foreground mt-1">{t.inbox.selectProjectHint}</p>
      </div>
    )
  }

  const emails = data?.data ?? []
  const total = data?.meta.total ?? 0
  const totalPages = Math.ceil(total / pageSize)
  const unreadCount = emails.filter((e) => user && !e.read_by?.includes(user.id)).length
  const allSelected = emails.length > 0 && emails.every((e) => selectedIds.has(e.id))

  if (viewMode === 'trash') {
    return <TrashList projectId={projectId} onBack={() => setViewMode('inbox')} />
  }

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      {/* Panel de lista */}
      <div className={`flex flex-col w-full sm:w-80 shrink-0 border-r ${selectedEmail && !selectMode ? 'hidden sm:flex' : 'flex'}`}>

        {/* Encabezado — normal o modo selección */}
        {selectMode ? (
          <div className="flex items-center px-2 h-14 border-b gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={toggleSelectMode} aria-label={t.inbox.cancelSelection}>
              <X className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium flex-1 min-w-0 truncate px-1">
              {selectedIds.size > 0
                ? t.inbox.selectedCount(selectedIds.size)
                : t.inbox.selectEmails}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-8 px-2 shrink-0"
              onClick={() => allSelected ? setSelectedIds(new Set()) : setSelectedIds(new Set(emails.map((e) => e.id)))}
            >
              {allSelected ? t.inbox.none : t.inbox.all}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs gap-1 shrink-0"
              disabled={selectedIds.size === 0 || bulkDeleteMutation.isPending}
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">{t.inbox.delete}</span>
              {selectedIds.size > 0 && <span>{selectedIds.size}</span>}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 h-14 border-b gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm font-semibold truncate">{project?.name ?? '...'}</h2>
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium h-5 min-w-5 px-1">
                  {formatBadge(unreadCount)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => setViewMode('trash')}
                  aria-label={t.trash.title}
                  title={t.trash.openTrash}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                {trashCount > 0 && (
                  <span className="pointer-events-none absolute -top-0.5 -right-0.5 inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground text-[9px] font-semibold leading-none h-3.5 min-w-3.5 px-0.5">
                    {formatBadge(trashCount)}
                  </span>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSelectMode} aria-label={t.inbox.selectEmails}>
                <CheckSquare className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()} aria-label={t.inbox.refresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Barra de almacenamiento — solo si hay límite configurado */}
        {(() => {
          const limitBytes = project?.storage_limit ?? 0
          const usedBytes = storageData?.used_bytes ?? 0
          if (!storageData || limitBytes === 0) return null
          const pct = Math.min(100, Math.round((usedBytes / limitBytes) * 100))
          const exceeded = usedBytes >= limitBytes
          const warn = pct >= 80
          return (
            <div className="px-4 pt-2 pb-1.5 border-b shrink-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={cn('text-[10px] leading-none', exceeded ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                  {exceeded
                    ? `${formatBytes(usedBytes)} / ${formatBytes(limitBytes)}`
                    : `${formatBytes(usedBytes)} / ${formatBytes(limitBytes)}`}
                </span>
                <span className={cn('text-[10px] leading-none tabular-nums shrink-0', exceeded ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                  {pct}%
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-300', exceeded ? 'bg-destructive' : warn ? 'bg-amber-500' : 'bg-primary')}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })()}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          <EmailList
            emails={emails}
            selectedId={selectedEmail?.id}
            loading={isLoading}
            onSelect={handleSelect}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="border-t px-3 py-2 flex items-center justify-between text-xs text-muted-foreground shrink-0">
            <span>{t.inbox.emailsTotal(total)}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span>{page}/{totalPages}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Panel de detalle */}
      <div className={`flex flex-1 flex-col overflow-hidden min-w-0 ${selectedEmail ? 'flex' : 'hidden sm:flex'}`}>
        {selectedEmail && (
          <div className="flex items-center h-10 px-2 border-b shrink-0 sm:hidden">
            <Button variant="ghost" size="sm" className="gap-1 text-xs h-8" onClick={closeEmail}>
              <ArrowLeft className="h-3.5 w-3.5" />
              {t.inbox.back}
            </Button>
          </div>
        )}
        <EmailDetail
          email={selectedEmail}
          onDelete={(id) => deleteMutation.mutate(id)}
          onClose={closeEmail}
        />
      </div>
    </div>
  )
}
