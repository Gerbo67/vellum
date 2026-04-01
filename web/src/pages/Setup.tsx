import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useI18n } from '@/lib/i18n'
import { VellumLogo } from '@/components/VellumLogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

/**
 * First-run page shown when no users exist in the system.
 * Creates the master admin account via local credentials.
 */
export default function SetupPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { setUser } = useAuthStore()
  const t = useI18n()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { data: status } = useQuery({
    queryKey: ['setup-status'],
    queryFn: api.auth.setupStatus,
  })

  useEffect(() => {
    if (status?.has_users) {
      navigate('/login', { replace: true })
    }
  }, [status, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !email || !password) {
      toast({ title: t.setup.fillAll, variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const user = await api.auth.registerAdmin(name, email, password)
      setUser(user)
      navigate('/', { replace: true })
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <VellumLogo size={40} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t.setup.title}</CardTitle>
            <CardDescription>{t.setup.subtitle}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">{t.setup.name}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.setup.namePlaceholder}
                  autoComplete="name"
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">{t.setup.email}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@empresa.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{t.setup.password}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.setup.passwordPlaceholder}
                  autoComplete="new-password"
                  required
                />
                <p className="text-xs text-muted-foreground">{t.setup.passwordHint}</p>
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t.setup.submitting : t.setup.submit}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
