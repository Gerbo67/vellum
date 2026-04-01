import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Shield, UserX, UserCheck, Archive, RotateCcw, Plus, Copy, ChevronDown,
  ClockIcon, CheckCircle2, XCircle, Mail,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { User, Invitation } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

export default function AdminUsersPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const t = useI18n()

  const [archiveTarget, setArchiveTarget] = useState<User | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [showNewUser, setShowNewUser] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [inviteResult, setInviteResult] = useState<{ url: string; expires: string } | null>(null)

  const { data: usersData = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: api.users.list,
  })

  const { data: invitations = [] } = useQuery({
    queryKey: ['admin-invitations'],
    queryFn: api.admin.listInvitations,
  })

  const inviteMap = Object.fromEntries(invitations.map((i) => [i.user_id, i])) as Record<string, Invitation>

  const activeUsers = usersData.filter((u) => u.status !== 'archived')
  const archivedUsers = usersData.filter((u) => u.status === 'archived')

  const suspendMutation = useMutation({
    mutationFn: (id: string) => api.admin.suspendUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast({ title: t.adminUsers.suspended })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.admin.restoreUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast({ title: t.adminUsers.restored })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.admin.archiveUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setArchiveTarget(null)
      toast({ title: t.adminUsers.archived })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const createUserMutation = useMutation({
    mutationFn: () => api.admin.createUser(newEmail, newName),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-invitations'] })
      setShowNewUser(false)
      setNewEmail('')
      setNewName('')
      setInviteResult({ url: data.invitation_url, expires: data.expires_at })
      toast({ title: t.adminUsers.created })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const renewInviteMutation = useMutation({
    mutationFn: (userId: string) => api.admin.createInvitation(userId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-invitations'] })
      setInviteResult({ url: data.invitation_url, expires: data.expires_at })
      toast({ title: t.adminUsers.invited })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  const roleChangeMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'admin' | 'user' }) =>
      api.admin.changeRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast({ title: t.adminUsers.updated })
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  })

  function copyInviteUrl(url: string) {
    navigator.clipboard.writeText(url)
    toast({ title: t.adminUsers.inviteCopied })
  }

  const initials = (name: string) =>
    name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  function statusBadge(u: User) {
    if (u.status === 'suspended') return <Badge variant="destructive" className="text-xs">{t.adminUsers.statusSuspended}</Badge>
    if (u.status === 'pending') return <Badge variant="secondary" className="text-xs">{t.adminUsers.statusPending}</Badge>
    if (u.status === 'archived') return <Badge variant="outline" className="text-xs">{t.adminUsers.statusArchived}</Badge>
    return null
  }

  function inviteStatusBadge(inv: Invitation | undefined) {
    if (!inv) return null
    if (inv.status === 'used') return null
    if (inv.status === 'expired')
      return (
        <Badge variant="destructive" className="text-xs gap-1">
          <XCircle className="h-3 w-3" /> {t.adminUsers.inviteExpired}
        </Badge>
      )
    return (
      <Badge variant="secondary" className="text-xs gap-1">
        <ClockIcon className="h-3 w-3" /> {t.adminUsers.invitePending}
      </Badge>
    )
  }

  function UserRow({ u }: { u: User }) {
    const isSelf = u.id === currentUser?.id
    const inv = inviteMap[u.id]

    return (
      <div className="flex items-start gap-4 rounded-lg border p-4 bg-card">
        <Avatar className="h-9 w-9 shrink-0 mt-0.5">
          <AvatarFallback>{initials(u.name)}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{u.name}</span>
            {u.role === 'admin' && (
              <Badge variant="default" className="text-xs">
                <Shield className="h-3 w-3 mr-1" /> Admin
              </Badge>
            )}
            {statusBadge(u)}
            {inviteStatusBadge(inv)}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{u.email}</p>
          <p className="text-xs text-muted-foreground">{t.adminUsers.registered} {formatDate(u.created_at)}</p>
        </div>

        {!isSelf && (
          <div className="flex items-center gap-1 shrink-0">
            {/* Pending: show invitation actions */}
            {u.status === 'pending' && inv && (
              <Button
                variant="ghost"
                size="icon"
                title={inv.status === 'expired' ? t.adminUsers.inviteRenew : 'Ver URL de invitación'}
                onClick={() => {
                  if (inv.status === 'expired') {
                    renewInviteMutation.mutate(u.id)
                  } else if (inv.invitation_url) {
                    setInviteResult({ url: inv.invitation_url, expires: inv.expires_at })
                  }
                }}
              >
                <Mail className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}

            {/* Suspend / Restore */}
            {u.status === 'active' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => suspendMutation.mutate(u.id)}
                title={t.adminUsers.deactivateLabel}
              >
                <UserX className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
            {u.status === 'suspended' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => restoreMutation.mutate(u.id)}
                title={t.adminUsers.activateLabel}
              >
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}

            {/* Role toggle */}
            {u.status === 'active' && (
              <Button
                variant="ghost"
                size="icon"
                title={u.role === 'admin' ? t.adminUsers.makeUser : t.adminUsers.makeAdmin}
                onClick={() =>
                  roleChangeMutation.mutate({ id: u.id, role: u.role === 'admin' ? 'user' : 'admin' })
                }
              >
                <Shield className={`h-4 w-4 ${u.role === 'admin' ? 'text-primary' : 'text-muted-foreground'}`} />
              </Button>
            )}

            {/* Archive */}
            {u.status !== 'archived' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setArchiveTarget(u)}
                title={t.adminUsers.archiveLabel}
                className="text-muted-foreground hover:text-destructive"
              >
                <Archive className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 h-14 border-b shrink-0">
        <h1 className="text-base font-semibold">{t.adminUsers.title}</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t.adminUsers.userCount(activeUsers.length)}</span>
          <Button size="sm" onClick={() => setShowNewUser(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t.adminUsers.newUser}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-2 max-w-3xl">
          {isLoading && <p className="text-sm text-muted-foreground">{t.adminUsers.loading}</p>}

          {activeUsers.map((u) => <UserRow key={u.id} u={u} />)}

          {/* Archived section */}
          {archivedUsers.length > 0 && (
            <>
              <Separator className="my-2" />
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setShowArchived((v) => !v)}
              >
                <ChevronDown className={`h-4 w-4 mr-1 transition-transform ${showArchived ? '' : '-rotate-90'}`} />
                {showArchived ? t.adminUsers.hideArchived : t.adminUsers.showArchived} ({archivedUsers.length})
              </Button>
              {showArchived && archivedUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-4 rounded-lg border p-4 bg-card opacity-60">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback>{initials(u.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{u.name}</span>
                      <Badge variant="outline" className="text-xs">{t.adminUsers.statusArchived}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={t.adminUsers.activateLabel}
                    onClick={() => restoreMutation.mutate(u.id)}
                  >
                    <RotateCcw className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Archive confirmation */}
      <Dialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.adminUsers.archiveTitle}</DialogTitle>
            <DialogDescription>
              {archiveTarget && t.adminUsers.archiveDesc(archiveTarget.name)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveTarget(null)}>{t.adminUsers.cancel}</Button>
            <Button
              variant="destructive"
              onClick={() => archiveTarget && archiveMutation.mutate(archiveTarget.id)}
              disabled={archiveMutation.isPending}
            >
              {t.adminUsers.archiveLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New user dialog */}
      <Dialog open={showNewUser} onOpenChange={(open) => { if (!open) { setShowNewUser(false); setNewEmail(''); setNewName('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.adminUsers.newUser}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>{t.adminUsers.newUserEmail}</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="usuario@empresa.com"
              />
            </div>
            <div className="space-y-1">
              <Label>{t.adminUsers.newUserName}</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre Apellido"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewUser(false)}>{t.adminUsers.cancel}</Button>
            <Button
              onClick={() => createUserMutation.mutate()}
              disabled={createUserMutation.isPending || !newEmail || !newName}
            >
              {createUserMutation.isPending ? t.adminUsers.newUserCreating : t.adminUsers.newUserCreate}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invitation URL dialog */}
      <Dialog open={!!inviteResult} onOpenChange={(open) => !open && setInviteResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.adminUsers.inviteUrl}</DialogTitle>
            <DialogDescription>
              {inviteResult && t.adminUsers.inviteExpires(formatDate(inviteResult.expires))}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              readOnly
              value={inviteResult?.url ?? ''}
              className="font-mono text-xs"
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => inviteResult && copyInviteUrl(inviteResult.url)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setInviteResult(null)}>{t.adminUsers.cancel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
