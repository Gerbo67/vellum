import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Users, X, RotateCcw, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import type { Project } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'
import { formatDate, formatBytes, cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

/** Form state used for both project creation and editing dialogs. */
type ProjectForm = {
  name: string
  description: string
  senders: string
  storageLimit: string
}

/**
 * Admin page for managing projects: create, edit, delete, manage members,
 * view storage usage, and restore or permanently purge soft-deleted projects.
 */
export default function AdminProjectsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const t = useI18n()
  const [showForm, setShowForm] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [membersProject, setMembersProject] = useState<Project | null>(null)
  const [form, setForm] = useState<ProjectForm>({ name: '', description: '', senders: '', storageLimit: '' })
  const [purgeTarget, setPurgeTarget] = useState<Project | null>(null)

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ['admin-projects'],
    queryFn: api.projects.list,
  })
  const projects = projectsData ?? []

  const { data: storageUsagesData } = useQuery({
    queryKey: ['admin-projects-storage'],
    queryFn: api.projects.storageUsages,
  })
  const storageUsages = storageUsagesData ?? {}

  const { data: allUsersData = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: api.users.list,
    enabled: !!membersProject,
  })
  const allUsers = allUsersData ?? []

  const { data: membersData = [] } = useQuery({
    queryKey: ['project-members', membersProject?.id],
    queryFn: () => api.projects.listMembers(membersProject!.id),
    enabled: !!membersProject,
  })
  const members = membersData ?? []

  const createMutation = useMutation({
    mutationFn: () =>
      api.projects.create({
        name: form.name,
        description: form.description,
        senders: form.senders.split(',').map((s) => s.trim()).filter(Boolean),
        storage_limit: form.storageLimit ? Math.round(parseFloat(form.storageLimit) * 1024 * 1024) : 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] })
      queryClient.invalidateQueries({ queryKey: ['admin-projects-storage'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setShowForm(false)
      setForm({ name: '', description: '', senders: '', storageLimit: '' })
      toast({ title: t.adminProjects.created })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      api.projects.update(editProject!.id, {
        name: form.name,
        description: form.description,
        senders: form.senders.split(',').map((s) => s.trim()).filter(Boolean),
        storage_limit: form.storageLimit ? Math.round(parseFloat(form.storageLimit) * 1024 * 1024) : 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] })
      queryClient.invalidateQueries({ queryKey: ['admin-projects-storage'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setEditProject(null)
      toast({ title: t.adminProjects.updated })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] })
      queryClient.invalidateQueries({ queryKey: ['admin-projects-trash'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setDeleteTarget(null)
      toast({ title: t.adminProjects.deleted })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const addMemberMutation = useMutation({
    mutationFn: (userId: string) => api.projects.addMember(membersProject!.id, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-members', membersProject?.id] }),
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => api.projects.removeMember(membersProject!.id, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-members', membersProject?.id] }),
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const { data: trashedProjectsData } = useQuery({
    queryKey: ['admin-projects-trash'],
    queryFn: api.adminTrash.listProjects,
  })
  const trashedProjects = trashedProjectsData ?? []

  const restoreProjectMutation = useMutation({
    mutationFn: (id: string) => api.adminTrash.restoreProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] })
      queryClient.invalidateQueries({ queryKey: ['admin-projects-trash'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast({ title: t.adminTrash.restoreSuccess })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const purgeProjectMutation = useMutation({
    mutationFn: (id: string) => api.adminTrash.purgeProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-projects-trash'] })
      setPurgeTarget(null)
      toast({ title: t.adminTrash.purgeSuccess })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  function openEdit(p: Project) {
    setEditProject(p)
    setForm({
      name: p.name,
      description: p.description,
      senders: p.senders?.join(', ') ?? '',
      storageLimit: p.storage_limit ? String(Math.round(p.storage_limit / (1024 * 1024))) : '',
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name) {
      toast({ title: t.adminProjects.nameRequired, variant: 'destructive' })
      return
    }
    if (editProject) {
      updateMutation.mutate()
    } else {
      createMutation.mutate()
    }
  }

  const memberUserIds = new Set(members.map((m) => m.user_id))
  const nonMembers = allUsers.filter((u) => !memberUserIds.has(u.id))

  const initials = (name: string) =>
    name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 h-14 border-b shrink-0">
        <h1 className="text-base font-semibold">{t.adminProjects.title}</h1>
        <Button size="sm" onClick={() => { setShowForm(true); setForm({ name: '', description: '', senders: '', storageLimit: '' }) }}>
          <Plus className="h-4 w-4 mr-1" />
          {t.adminProjects.newProject}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-2 max-w-3xl">
          {isLoading && <p className="text-sm text-muted-foreground">{t.adminProjects.loading}</p>}
          {projects.map((p) => {
            const usage = storageUsages[p.id]
            const usedBytes = usage?.used_bytes ?? 0
            const limitBytes = p.storage_limit ?? 0
            const pct = limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : 0
            const exceeded = limitBytes > 0 && usedBytes >= limitBytes

            return (
            <div key={p.id} className="rounded-lg border p-4 bg-card space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{p.name}</span>
                    {!p.active && <Badge variant="secondary" className="text-xs">{t.adminProjects.inactive}</Badge>}
                    {exceeded && <Badge variant="destructive" className="text-xs">{t.adminProjects.storageExceeded}</Badge>}
                  </div>
                  {p.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{t.adminProjects.createdAt} {formatDate(p.created_at)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => setMembersProject(p)} title={t.adminProjects.manageMembers}>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title={t.adminProjects.editProject}>
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(p)}
                    className="text-destructive hover:text-destructive"
                    title={t.adminProjects.deleteTitle}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {(p.senders ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(p.senders ?? []).map((s) => (
                    <Badge key={s} variant="outline" className="text-xs font-mono">
                      {s}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="space-y-1 pt-0.5">
                <p className={cn('text-xs', exceeded ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                  {limitBytes > 0
                    ? t.adminProjects.storageUsed(formatBytes(usedBytes), formatBytes(limitBytes))
                    : t.adminProjects.storageUsedUnlimited(formatBytes(usedBytes))}
                </p>
                {limitBytes > 0 && (
                  <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        exceeded ? 'bg-destructive' : pct > 80 ? 'bg-amber-500' : 'bg-primary',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
            )
          })}

          {trashedProjects.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="flex items-center gap-2 mb-3">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-muted-foreground">{t.adminTrash.title}</h2>
              </div>
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3 mb-3 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300 leading-snug">
                  {t.adminTrash.emailsWillReset}
                </p>
              </div>
              {trashedProjects.map((p) => (
                <div key={p.id} className="rounded-lg border border-dashed p-4 bg-card/50 space-y-2 opacity-75">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-muted-foreground">{p.name}</span>
                        <Badge variant="destructive" className="text-xs">{t.adminTrash.title}</Badge>
                      </div>
                      {p.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                      )}
                      {p.deleted_at && (
                        <p className="text-xs text-muted-foreground">{t.adminTrash.deletedAt} {formatDate(p.deleted_at)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-primary"
                        onClick={() => restoreProjectMutation.mutate(p.id)}
                        disabled={restoreProjectMutation.isPending}
                        title={t.adminTrash.restore}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setPurgeTarget(p)}
                        title={t.adminTrash.purge}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {(p.senders ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(p.senders ?? []).map((s) => (
                        <Badge key={s} variant="outline" className="text-xs font-mono opacity-60">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </ScrollArea>

      <Dialog
        open={showForm || !!editProject}
        onOpenChange={(open) => { if (!open) { setShowForm(false); setEditProject(null) } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editProject ? t.adminProjects.editTitle : t.adminProjects.newTitle}</DialogTitle>
            <DialogDescription>
              {t.adminProjects.sendersDesc}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">{t.adminProjects.nameLbl}</Label>
              <Input
                id="p-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t.adminProjects.namePlaceholder}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-desc">{t.adminProjects.descLbl}</Label>
              <Input
                id="p-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t.adminProjects.descPlaceholder}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-senders">{t.adminProjects.sendersLbl}</Label>
              <Input
                id="p-senders"
                value={form.senders}
                onChange={(e) => setForm((f) => ({ ...f, senders: e.target.value }))}
                placeholder={t.adminProjects.sendersPlaceholder}
              />
              <p className="text-xs text-muted-foreground">
                {t.adminProjects.sendersHint}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-storage">{t.adminProjects.storageLbl}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="p-storage"
                  type="number"
                  min="0"
                  step="1"
                  value={form.storageLimit}
                  onChange={(e) => setForm((f) => ({ ...f, storageLimit: e.target.value }))}
                  placeholder="0"
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">MB</span>
              </div>
              <p className="text-xs text-muted-foreground">{t.adminProjects.storageHint}</p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowForm(false); setEditProject(null) }}
              >
                {t.adminProjects.cancel}
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editProject ? t.adminProjects.save : t.adminProjects.create}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!membersProject} onOpenChange={(open) => !open && setMembersProject(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.adminProjects.title} — {membersProject?.name}</DialogTitle>
            <DialogDescription>
              {t.adminProjects.membersDesc}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase">{t.adminProjects.currentMembers}</p>
            {members.length === 0 && (
              <p className="text-sm text-muted-foreground">{t.adminProjects.noMembers}</p>
            )}
            {members.map((m) => {
              const u = allUsers.find((u) => u.id === m.user_id)
              if (!u) return null
              return (
                <div key={m.user_id} className="flex items-center gap-3">
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="text-xs">{initials(u.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                    onClick={() => removeMemberMutation.mutate(u.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })}

            {nonMembers.length > 0 && (
              <>
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase">{t.adminProjects.addUser}</p>
                {nonMembers.map((u) => (
                  <div key={u.id} className="flex items-center gap-3">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="text-xs">{initials(u.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => addMemberMutation.mutate(u.id)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMembersProject(null)}>{t.adminProjects.close}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.adminProjects.deleteTitle}</DialogTitle>
            <DialogDescription>
              {deleteTarget && t.adminProjects.deleteDesc(deleteTarget.name)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t.adminProjects.cancel}</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {t.adminProjects.deleteBtn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!purgeTarget} onOpenChange={(open) => !open && setPurgeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.adminTrash.purge}</DialogTitle>
            <DialogDescription>
              {purgeTarget && t.adminTrash.purgeConfirm(purgeTarget.name)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurgeTarget(null)}>{t.adminProjects.cancel}</Button>
            <Button
              variant="destructive"
              onClick={() => purgeTarget && purgeProjectMutation.mutate(purgeTarget.id)}
              disabled={purgeProjectMutation.isPending}
            >
              {t.adminTrash.purge}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

