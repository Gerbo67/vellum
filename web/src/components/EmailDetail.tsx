import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Trash2, Paperclip, X, ShieldCheck, Moon, Sun, Zap, Smartphone, Tablet, Monitor, Send, Download } from 'lucide-react'
import type { Email } from '@/lib/api'
import { api } from '@/lib/api'
import { formatDate, formatBytes } from '@/lib/utils'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { ScrollArea } from './ui/scroll-area'
import { EmailScore } from './EmailScore'
import { Alert, AlertTitle, AlertDescription } from './ui/alert'
import { RawViewer } from './RawViewer'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/hooks/use-toast'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'

interface EmailDetailProps {
  email: Email | null
  onDelete?: (id: string) => void
  onClose?: () => void
}

/** Simulated device viewport widths for responsive email preview. */
type Viewport = '320px' | '768px' | '100%'

/**
 * Dark mode rendering strategy for the HTML email preview.
 * - `light`: Standard rendering with no color manipulation.
 * - `dark-standard`: Applies `color-scheme: only dark`, simulating clients that honor `prefers-color-scheme` (Apple Mail, Thunderbird).
 * - `dark-forced`: Applies a CSS `invert(1) hue-rotate(180deg)` filter, simulating clients that force dark backgrounds (Gmail App, Outlook Desktop).
 */
type DarkMode = 'light' | 'dark-standard' | 'dark-forced'

/** Fixed virtual widths used to calculate the iframe scale factor for device previews. */
const VIRTUAL_WIDTHS: Record<Exclude<Viewport, '100%'>, number> = {
  '320px': 390,
  '768px': 768,
}

/**
 * Full email viewer panel with HTML/text/raw/analysis tabs, responsive viewport
 * simulation, dark mode preview, attachment list, SMTP relay dialog, and download capability.
 */
export function EmailDetail({ email, onDelete, onClose }: EmailDetailProps) {
  const [viewMode, setViewMode] = useState<'html' | 'text' | 'analysis' | 'raw'>('html')
  const [darkMode, setDarkMode] = useState<DarkMode>('light')
  const [viewport, setViewport] = useState<Viewport>('100%')
  const [containerWidth, setContainerWidth] = useState(0)
  const [iframeContentHeight, setIframeContentHeight] = useState(0)
  const [relayOpen, setRelayOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [relayTo, setRelayTo] = useState('')
  const [savedAddrs, setSavedAddrs] = useState<string[]>([])
  const [relaying, setRelaying] = useState(false)
  const t = useI18n()
  const { toast } = useToast()

  const { data: smtpStatus } = useQuery({
    queryKey: ['smtp-status'],
    queryFn: api.smtp.status,
    staleTime: 60_000,
  })

  useEffect(() => {
    setDarkMode('light')
    setViewport('100%')
    setIframeContentHeight(0)
  }, [email?.id])

  useEffect(() => {
    if (!relayOpen) return
    setRelayTo(email?.to?.[0] ?? '')
    api.relayAddresses.list().then(setSavedAddrs).catch(() => {})
  }, [relayOpen])

  const hasHTML = !!email?.html_body
  const hasText = !!email?.text_body

  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Observa el ancho real del contenedor para calcular el factor de escala
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [viewMode])

  // Re-mide la altura del contenido tras el reflejo que produce el cambio de viewport
  useEffect(() => {
    if (viewport === '100%') return
    const raf = requestAnimationFrame(() => {
      const doc = iframeRef.current?.contentDocument?.documentElement
      if (doc) setIframeContentHeight(doc.scrollHeight)
    })
    return () => cancelAnimationFrame(raf)
  }, [viewport])

  const handleIframeLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument?.documentElement
    if (doc) setIframeContentHeight(doc.scrollHeight)
  }, [])

  // Ancho virtual del dispositivo y factor de escala para encajar en el panel disponible
  const virtualWidth = viewport !== '100%' ? VIRTUAL_WIDTHS[viewport] : 0
  const scale =
    viewport !== '100%' && containerWidth > 0 && virtualWidth > 0
      ? Math.min(1, (containerWidth - 32) / virtualWidth)
      : 1

  const iframeColorScheme = darkMode === 'dark-standard' ? 'only dark' : 'only light'
  const iframeFilter = darkMode === 'dark-forced' ? 'invert(1) hue-rotate(180deg)' : undefined

  const iframeSrcDoc = useMemo(() => {
    if (!hasHTML || !email?.html_body) return ''
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: cid:; font-src data:;">`
    if (/<head[^>]*>/i.test(email.html_body)) {
      return email.html_body.replace(/<head[^>]*>/i, (tag) => `${tag}${csp}`)
    }
    if (/<\/head>/i.test(email.html_body)) {
      return email.html_body.replace(/<\/head>/i, `${csp}</head>`)
    }
    return csp + email.html_body
  }, [email?.html_body, hasHTML])

  async function handleRelay() {
    if (!email || !relayTo.trim()) return
    setRelaying(true)
    try {
      await api.emails.relay(email.project_id, email.id, [relayTo.trim()])
      const updated = await api.relayAddresses.add(relayTo.trim())
      setSavedAddrs(updated)
      toast({ title: t.emailDetail.relaySuccess })
      setRelayOpen(false)
      setRelayTo('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setRelaying(false)
    }
  }

  function handleDownloadHtml() {
    if (!email?.html_body) return
    const blob = new Blob([email.html_body], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${email.subject || 'email'}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleDeleteSavedAddr(addr: string) {    try {
      const updated = await api.relayAddresses.remove(addr)
      setSavedAddrs(updated)
    } catch {
      // ignorar error silencioso
    }
  }

  if (!email) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center p-8">
        <div className="rounded-full bg-muted p-4 mb-4">
          <svg className="h-10 w-10 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.98l7.5-4.04a2.25 2.25 0 012.134 0l7.5 4.04a2.25 2.25 0 011.183 1.98V19.5z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-muted-foreground">{t.inbox.selectEmailHint}</p>
      </div>
    )
  }

  const body = viewMode === 'html' && hasHTML ? email.html_body : email.text_body


  const tabBtn = (mode: typeof viewMode, label: React.ReactNode) => (
    <button
      onClick={() => setViewMode(mode)}
      className={`px-2.5 py-1 transition-colors flex items-center gap-1 whitespace-nowrap ${viewMode === mode ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
    >
      {label}
    </button>
  )

  const viewportOptions: { value: Viewport; icon: React.ElementType; label: string }[] = [
    { value: '320px', icon: Smartphone, label: t.emailDetail.mobile  },
    { value: '768px', icon: Tablet,     label: t.emailDetail.tablet  },
    { value: '100%',  icon: Monitor,    label: t.emailDetail.desktop },
  ]

  const darkModeOptions: { mode: DarkMode; Icon: React.ElementType; label: string; tooltip: string }[] = [
    { mode: 'light',         Icon: Sun,  label: t.emailDetail.darkLight,    tooltip: t.emailDetail.darkLight            },
    { mode: 'dark-standard', Icon: Moon, label: t.emailDetail.darkStandard, tooltip: t.emailDetail.darkStandardTooltip  },
    { mode: 'dark-forced',   Icon: Zap,  label: t.emailDetail.darkForced,   tooltip: t.emailDetail.darkForcedTooltip    },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-3 sm:px-5 pt-2.5 pb-2 border-b shrink-0 space-y-1.5">
        {/* Fila 1: asunto + botones acción */}
        <div className="flex items-start gap-2">
          <h2 className="flex-1 min-w-0 text-sm font-semibold leading-snug line-clamp-2">
            {email.subject || t.emailDetail.noSubject}
          </h2>
          <div className="flex items-center gap-0.5 shrink-0 -mt-0.5">
            {smtpStatus?.configured && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setRelayOpen(true)}
                aria-label={t.emailDetail.sendRelay}
                title={t.emailDetail.sendRelay}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
            {hasHTML && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={handleDownloadHtml}
                aria-label={t.emailDetail.downloadHtml}
                title={t.emailDetail.downloadHtml}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => onDelete(email.id)}
                aria-label={t.emailDetail.deleteEmail}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {onClose && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label={t.emailDetail.close}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Fila 2: metadatos compactos con fecha inline */}
        <div className="text-xs text-muted-foreground space-y-0.5">
          <div className="flex items-baseline gap-1 min-w-0">
            <span className="text-foreground font-medium shrink-0">{t.emailDetail.from}</span>
            <span className="truncate flex-1 min-w-0">{email.from}</span>
            <span className="shrink-0 ml-2 text-[10px] tabular-nums">{formatDate(email.received_at)}</span>
          </div>
          <div className="flex items-baseline gap-1 min-w-0">
            <span className="text-foreground font-medium shrink-0">{t.emailDetail.to}</span>
            <span className="truncate">{(email.to ?? []).join(', ')}</span>
          </div>
          {(email.cc ?? []).length > 0 && (
            <div className="flex items-baseline gap-1 min-w-0">
              <span className="text-foreground font-medium shrink-0">{t.emailDetail.cc}</span>
              <span className="truncate">{email.cc.join(', ')}</span>
            </div>
          )}
        </div>

        {/* Fila 3: tabs de vista + controles viewport + toggle dark mode */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-md border text-xs w-fit overflow-hidden">
            {hasHTML && tabBtn('html', t.emailDetail.html)}
            {hasText && tabBtn('text', t.emailDetail.text)}
            {tabBtn('raw', t.emailDetail.raw)}
            {tabBtn('analysis', <><ShieldCheck className="h-3 w-3" />{t.emailDetail.analysis}</>)}
          </div>
          {viewMode === 'html' && hasHTML && (
            <>
              <div className="w-px h-4 bg-border shrink-0" />
              <div className="flex items-center gap-0.5">
                {viewportOptions.map(({ value, icon: Icon, label }) => (
                  <Button
                    key={value}
                    variant="ghost"
                    size="icon"
                    className={`h-6 w-6 rounded transition-colors ${
                      viewport === value
                        ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setViewport(value)}
                    title={label}
                    aria-label={label}
                  >
                    <Icon className="h-3 w-3" />
                  </Button>
                ))}
              </div>
              <div className="w-px h-4 bg-border shrink-0" />
              <div className="flex rounded-md border text-xs overflow-hidden shrink-0">
                {darkModeOptions.map(({ mode, Icon, label, tooltip }) => (
                  <button
                    key={mode}
                    onClick={() => setDarkMode(mode)}
                    className={`px-2 py-1 transition-colors ${darkMode === mode ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}`}
                    title={tooltip}
                    aria-label={label}
                  >
                    <Icon className="h-3 w-3" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Adjuntos */}
      {(email.attachments ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 sm:px-5 py-2 border-b bg-muted/30 shrink-0">
          {(email.attachments ?? []).map((att) => (
            <div key={att.id} className="flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs">
              <Paperclip className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">{att.filename || 'adjunto'}</span>
              <span className="text-muted-foreground">{formatBytes(att.size)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cuerpo */}
      {viewMode === 'analysis' ? (
        <ScrollArea className="flex-1 min-h-0">
          <EmailScore projectId={email.project_id} emailId={email.id} />
        </ScrollArea>
      ) : viewMode === 'raw' ? (
        <RawViewer email={email} />
      ) : viewMode === 'html' && hasHTML ? (
        <>
          {darkMode === 'dark-forced' && (
            <div className="shrink-0 border-b px-3 sm:px-5 py-2.5">
              <Alert variant="warning">
                <AlertTitle>{t.vellumInsights.forcedDarkTitle}</AlertTitle>
                <AlertDescription>{t.vellumInsights.forcedDarkBody}</AlertDescription>
                <AlertDescription className="mt-1.5 font-medium opacity-90">{t.vellumInsights.forcedDarkTip}</AlertDescription>
              </Alert>
            </div>
          )}
          <div ref={containerRef} className="flex-1 min-h-0 overflow-auto">
            {viewport === '100%' ? (
              <iframe
                ref={iframeRef}
                srcDoc={iframeSrcDoc}
                className="border-0 block w-full min-h-full"
                style={{ colorScheme: iframeColorScheme, filter: iframeFilter }}
                onLoad={handleIframeLoad}
                sandbox="allow-same-origin"
                title={t.emailDetail.emailContent}
              />
            ) : (
              <div className="flex justify-center items-start min-h-full bg-muted/20 py-6 px-4">
                <div
                  style={{
                    position: 'relative',
                    width: Math.round(virtualWidth * scale),
                    height: Math.max(Math.round(iframeContentHeight * scale), 200),
                    flexShrink: 0,
                  }}
                  className="rounded-xl shadow-xl overflow-hidden ring-1 ring-border/40"
                >
                  <iframe
                    ref={iframeRef}
                    srcDoc={iframeSrcDoc}
                    className="border-0 absolute top-0 left-0 origin-top-left"
                    style={{
                      width: virtualWidth,
                      height: iframeContentHeight || 200,
                      transform: `scale(${scale})`,
                      colorScheme: iframeColorScheme,
                      filter: iframeFilter,
                    }}
                    onLoad={handleIframeLoad}
                    sandbox="allow-same-origin"
                    title={t.emailDetail.emailContent}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <pre className="p-4 sm:p-6 text-sm whitespace-pre-wrap font-mono leading-relaxed text-foreground">
            {body || t.emailDetail.noContent}
          </pre>
        </ScrollArea>
      )}

      {/* Footer */}
      <div className="border-t px-3 sm:px-5 py-2 flex items-center gap-3 text-xs text-muted-foreground shrink-0">
        <span>{formatBytes(email.size)}</span>
        {(email.attachments ?? []).length > 0 && (
          <>
            <Separator orientation="vertical" className="h-3" />
            <span className="flex items-center gap-1">
              <Paperclip className="h-3 w-3" />
              {t.emailDetail.attachmentCount((email.attachments ?? []).length)}
            </span>
          </>
        )}
        {email.message_id && (
          <>
            <Separator orientation="vertical" className="h-3" />
            <span className="truncate font-mono hidden sm:inline">{email.message_id}</span>
          </>
        )}
      </div>

      {/* Dialog relay */}
      <Dialog open={relayOpen} onOpenChange={setRelayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.emailDetail.relayDialogTitle}</DialogTitle>
            <DialogDescription>{t.emailDetail.relayDialogDesc}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {smtpStatus?.from_address && (
              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground shrink-0">{t.emailDetail.relaySenderLbl}:</span>
                <span className="font-medium truncate">{smtpStatus.from_address}</span>
              </div>
            )}
            {(email?.to ?? []).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t.emailDetail.relayOriginalTo}</p>
                <div className="flex flex-wrap gap-1.5">
                  {(email?.to ?? []).map((addr) => (
                    <button
                      key={addr}
                      type="button"
                      onClick={() => setRelayTo(addr)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        relayTo === addr
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'hover:bg-accent border-border'
                      }`}
                    >
                      {addr}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {savedAddrs.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">{t.emailDetail.relaySavedAddrs}</p>
                  <button
                    type="button"
                    onClick={() => setManageOpen(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    {t.emailDetail.relayManage}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {savedAddrs.map((addr) => (
                    <button
                      key={addr}
                      type="button"
                      onClick={() => setRelayTo(addr)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        relayTo === addr
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'hover:bg-accent border-border'
                      }`}
                    >
                      {addr}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="relay-to">{t.emailDetail.relayCustomAddr}</Label>
              <Input
                id="relay-to"
                type="email"
                placeholder={t.emailDetail.relayToPlaceholder}
                value={relayTo}
                onChange={(e) => setRelayTo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRelay() }}
              />
            </div>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setManageOpen(true)}
            >
              {t.emailDetail.relayManage}
            </Button>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setRelayOpen(false)} disabled={relaying}>
                {t.emailDetail.relayCancel}
              </Button>
              <Button onClick={handleRelay} disabled={relaying || !relayTo.trim()}>
                {relaying ? t.emailDetail.relaySending : t.emailDetail.relaySend}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog gestión de direcciones guardadas */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t.emailDetail.relayManageTitle}</DialogTitle>
            <DialogDescription>{t.emailDetail.relayManageDesc}</DialogDescription>
          </DialogHeader>
          <div className="py-1 min-h-[80px]">
            {savedAddrs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t.emailDetail.relayNoSaved}</p>
            ) : (
              <div className="space-y-0.5">
                {savedAddrs.map((addr) => (
                  <div key={addr} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50">
                    <span className="text-sm truncate flex-1 mr-2">{addr}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteSavedAddr(addr)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setManageOpen(false)}>
              {t.emailDetail.relayClose}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
