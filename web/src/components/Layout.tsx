import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  InboxIcon, Users, FolderOpen, LogOut, ChevronDown, Shield,
  Bell, BellOff, Menu, X, Settings2, Sun, Moon, Monitor, Check, Languages, ServerCog, Book, ScanSearch, UserCircle, KeyRound,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { Project, Email } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useNotifications } from '@/hooks/useNotifications'
import { useThemeStore } from '@/store/theme'
import { useLangStore } from '@/store/lang'
import { useI18n } from '@/lib/i18n'
import { VellumLogo } from './VellumLogo'
import { Avatar, AvatarFallback } from './ui/avatar'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { ScrollArea } from './ui/scroll-area'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuGroup,
} from './ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import { cn, formatBadge } from '@/lib/utils'

/**
 * Primary application shell. Renders the sidebar (projects, admin nav, settings),
 * subscribes to SSE for real-time email events, and renders child routes via `<Outlet />`.
 */
export default function Layout() {
  const { user, clear } = useAuthStore()
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const eventSourceRef = useRef<EventSource | null>(null)
  const [activeProject, setActiveProject] = useState<string | null>(null)
  const [newEmailCount, setNewEmailCount] = useState(0)
  const { supported, enabled, toggle, notify, permission } = useNotifications()
  const { theme, setTheme } = useThemeStore()
  const { lang, setLang } = useLangStore()
  const t = useI18n()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: api.projects.list,
    enabled: !!user,
  })
  const projects = projectsData ?? []

  const { data: unreadCountsData } = useQuery({
    queryKey: ['unread-counts'],
    queryFn: api.projects.unreadCounts,
    enabled: !!user,
  })
  const unreadCounts = unreadCountsData ?? {}

  useEffect(() => {
    document.title = newEmailCount > 0 ? `(${formatBadge(newEmailCount)}) Vellum` : 'Vellum'
    return () => { document.title = 'Vellum' }
  }, [newEmailCount])

  useEffect(() => {
    if (!user) return

    const es = new EventSource('/api/events', { withCredentials: true })
    eventSourceRef.current = es

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        if (data.type === 'email') {
          const email = data.email as Email
          queryClient.invalidateQueries({ queryKey: ['emails', email.project_id] })
          queryClient.invalidateQueries({ queryKey: ['unread-counts'] })

          const project = (queryClient.getQueryData<Project[]>(['projects']) ?? []).find(
            (p) => p.id === email.project_id,
          )
          const projectName = project?.name ?? 'Vellum'
          const subject = email.subject || t.inbox.noSubject

          setNewEmailCount((c) => c + 1)
          toast({ title: projectName, description: subject })
          notify(projectName, subject)
        }
      } catch {
        // ignorar mensajes malformados
      }
    }

    return () => es.close()
  }, [user, queryClient, toast, notify])

  async function handleLogout() {
    await api.auth.logout()
    clear()
    navigate('/login')
  }

  const initials = user?.name
    ?.split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Backdrop móvil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={cn(
        'flex w-60 flex-col border-r bg-card shrink-0 z-50',
        'fixed inset-y-0 left-0 transition-transform duration-200 lg:static lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="flex h-14 items-center justify-between px-4 border-b">
          <VellumLogo />
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-7 w-7"
            onClick={() => setSidebarOpen(false)}
            aria-label={t.settings.label}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 py-2">
          <nav className="px-2 space-y-0.5">
            <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t.sidebar.projects}
            </p>
            {projects.map((p) => (
              <Link
                key={p.id}
                to={`/inbox/${p.id}`}
                onClick={() => { setActiveProject(p.id); setNewEmailCount(0); setSidebarOpen(false) }}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                  activeProject === p.id && 'bg-accent text-accent-foreground font-medium',
                )}
              >
                <InboxIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{p.name}</span>
                {(unreadCounts[p.id] ?? 0) > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium h-4 min-w-4 px-1 shrink-0">
                    {formatBadge(unreadCounts[p.id])}
                  </span>
                )}
              </Link>
            ))}
            {projects.length === 0 && (
              <p className="px-2 py-2 text-xs text-muted-foreground">{t.sidebar.noProjects}</p>
            )}

            <Separator className="my-2" />
            <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t.sidebar.tools}
            </p>
            <Link
              to="/analyzer"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ScanSearch className="h-4 w-4 shrink-0 text-muted-foreground" />
              {t.analyzer.sidebarLabel}
            </Link>
          </nav>

          {user?.role === 'admin' && (
            <>
              <Separator className="my-2 mx-2" />
              <nav className="px-2 space-y-0.5">
                <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t.sidebar.admin}
                </p>
                <Link
                  to="/admin/users"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {t.sidebar.users}
                </Link>
                <Link
                  to="/admin/projects"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {t.sidebar.adminProjects}
                </Link>
                <Link
                  to="/admin/smtp"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <ServerCog className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {t.sidebar.smtpRelay}
                </Link>
              </nav>
            </>
          )}
        </ScrollArea>

        <div className="border-t p-3 flex items-center gap-1 min-w-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex-1 min-w-0 justify-start gap-2 h-auto px-2 py-1.5">
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium truncate leading-none">{user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{user?.email}</p>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <div className="flex items-center gap-2">
                  {user?.role === 'admin' && <Shield className="h-3 w-3 text-primary" />}
                  <span className="text-xs text-muted-foreground capitalize">{user?.role}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile" onClick={() => setSidebarOpen(false)}>
                  <UserCircle className="mr-2 h-4 w-4" />
                  {t.profile.title}
                </Link>
              </DropdownMenuItem>
              {user?.role === 'admin' && (
                <DropdownMenuItem asChild>
                  <Link to="/admin/auth" onClick={() => setSidebarOpen(false)}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    {t.adminAuth.title}
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                {t.user.logout}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Link
            to="/docs"
            className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={t.docs.tooltip}
            aria-label={t.docs.label}
          >
            <Book className="h-4 w-4" />
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0" aria-label={t.settings.label} title={t.settings.label}>
                <Settings2 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground pb-1">
                  {t.settings.notifications}
                </DropdownMenuLabel>
                {supported && permission !== 'denied' ? (
                  <DropdownMenuItem onClick={toggle} className="justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      {enabled && permission === 'granted'
                        ? <Bell className="h-4 w-4" />
                        : <BellOff className="h-4 w-4" />}
                      <span>{t.settings.desktop}</span>
                    </div>
                    {enabled && permission === 'granted' && <Check className="h-3.5 w-3.5 text-primary" />}
                  </DropdownMenuItem>
                ) : (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    {!supported ? t.settings.notSupported : t.settings.blocked}
                  </p>
                )}
              </DropdownMenuGroup>

              <DropdownMenuSeparator />

              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground pb-1">
                  {t.settings.appearance}
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setTheme('light')} className="justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Sun className="h-4 w-4" />
                    <span>{t.settings.light}</span>
                  </div>
                  {theme === 'light' && <Check className="h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')} className="justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Moon className="h-4 w-4" />
                    <span>{t.settings.dark}</span>
                  </div>
                  {theme === 'dark' && <Check className="h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')} className="justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    <span>{t.settings.system}</span>
                  </div>
                  {theme === 'system' && <Check className="h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />

              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground pb-1">
                  {t.settings.language}
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setLang('es')} className="justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Languages className="h-4 w-4" />
                    <span>{t.settings.spanish}</span>
                  </div>
                  {lang === 'es' && <Check className="h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLang('en')} className="justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Languages className="h-4 w-4" />
                    <span>{t.settings.english}</span>
                  </div>
                  {lang === 'en' && <Check className="h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Barra superior móvil */}
        <div className="flex items-center h-14 px-4 border-b shrink-0 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            aria-label={t.settings.label}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="ml-2">
            <VellumLogo />
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
