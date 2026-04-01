import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ServerCog, Wifi } from 'lucide-react'
import { api } from '@/lib/api'
import type { SMTPConfig } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { useI18n } from '@/lib/i18n'

/** Default empty SMTP configuration used as initial form state. */
const EMPTY: SMTPConfig = {
  host: '',
  port: 587,
  username: '',
  password: '',
  from_address: '',
  use_tls: false,
  enabled: false,
}

/**
 * Admin page for configuring the outbound SMTP relay.
 * Provides form fields for host, port, credentials, TLS, and a test-send action.
 */
export default function AdminSmtpPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const t = useI18n()
  const [form, setForm] = useState<SMTPConfig>(EMPTY)
  const [testing, setTesting] = useState(false)

  const { data: smtpData } = useQuery({
    queryKey: ['admin-smtp'],
    queryFn: api.smtp.get,
  })

  useEffect(() => {
    if (smtpData) setForm(smtpData)
  }, [smtpData])

  const saveMutation = useMutation({
    mutationFn: () => api.smtp.save(form),
    onSuccess: (data) => {
      setForm(data)
      queryClient.invalidateQueries({ queryKey: ['admin-smtp'] })
      toast({ title: t.adminSmtp.saved })
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: 'destructive' })
    },
  })

  async function handleTest() {
    setTesting(true)
    try {
      await api.smtp.test()
      toast({ title: t.adminSmtp.testOk })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t.adminSmtp.testFail
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setTesting(false)
    }
  }

  function handleSave() {
    if (!form.host || !form.port || !form.from_address) {
      toast({ title: t.adminSmtp.hostRequired, variant: 'destructive' })
      return
    }
    saveMutation.mutate()
  }

  const field = (id: keyof SMTPConfig, label: string, props?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={String(form[id] ?? '')}
        onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
        {...props}
      />
    </div>
  )

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto">
      <div className="px-4 sm:px-8 py-6 max-w-2xl w-full mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-primary/10 p-2">
            <ServerCog className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{t.adminSmtp.title}</h1>
            <p className="text-sm text-muted-foreground">{t.adminSmtp.subtitle}</p>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              {field('host', t.adminSmtp.hostLbl, { placeholder: 'smtp.ejemplo.com' })}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="port">{t.adminSmtp.portLbl}</Label>
              <Input
                id="port"
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))}
              />
            </div>
          </div>

          {field('username', t.adminSmtp.usernameLbl, { autoComplete: 'off' })}

          <div className="space-y-1.5">
            <Label htmlFor="password">{t.adminSmtp.passwordLbl}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder={t.adminSmtp.passwordPlaceholder}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="from_address">
              {t.adminSmtp.fromLbl}
              <span className="text-destructive ml-0.5">*</span>
            </Label>
            <Input
              id="from_address"
              type="email"
              required
              placeholder={t.adminSmtp.fromPlaceholder}
              value={form.from_address}
              onChange={(e) => setForm((f) => ({ ...f, from_address: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">{t.adminSmtp.fromHint}</p>
          </div>

          <div className="flex flex-col gap-3 pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-primary"
                checked={form.use_tls}
                onChange={(e) => setForm((f) => ({ ...f, use_tls: e.target.checked }))}
              />
              <span className="text-sm">{t.adminSmtp.useTlsLbl}</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-primary"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              <span className="text-sm">{t.adminSmtp.enabledLbl}</span>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? t.adminSmtp.saving : t.adminSmtp.save}
          </Button>
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testing || !form.host || !form.port}
          >
            <Wifi className="h-4 w-4 mr-2" />
            {testing ? t.adminSmtp.testing : t.adminSmtp.test}
          </Button>
        </div>
      </div>
    </div>
  )
}
