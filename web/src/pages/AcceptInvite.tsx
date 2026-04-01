import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { VellumLogo } from '@/components/VellumLogo'

type InviteState = 'loading' | 'valid' | 'expired' | 'used' | 'not_found' | 'success'

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const t = useI18n()
  const { setUser } = useAuthStore()

  const [state, setState] = useState<InviteState>('loading')
  const [userEmail, setUserEmail] = useState('')
  const [userName, setUserName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setState('not_found')
      return
    }
    api.auth.validateInvite(token)
      .then((data) => {
        setUserEmail(data.user_email)
        setUserName(data.user_name)
        setState('valid')
      })
      .catch((err: Error) => {
        const msg = err.message.toLowerCase()
        if (msg.includes('expir')) setState('expired')
        else if (msg.includes('usada') || msg.includes('used')) setState('used')
        else setState('not_found')
      })
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !password) return
    setSubmitting(true)
    setError('')
    try {
      const user = await api.auth.acceptInvite(token, password)
      setUser(user)
      setState('success')
      setTimeout(() => navigate('/'), 1500)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <VellumLogo />
        </div>

        {state === 'loading' && (
          <p className="text-center text-sm text-muted-foreground">Verificando invitación...</p>
        )}

        {state === 'expired' && (
          <div className="text-center space-y-2">
            <h1 className="text-lg font-semibold">{t.acceptInvite.expiredTitle}</h1>
            <p className="text-sm text-muted-foreground">{t.acceptInvite.expiredDesc}</p>
          </div>
        )}

        {state === 'used' && (
          <div className="text-center space-y-2">
            <h1 className="text-lg font-semibold">{t.acceptInvite.usedTitle}</h1>
            <p className="text-sm text-muted-foreground">{t.acceptInvite.usedDesc}</p>
            <Button variant="outline" onClick={() => navigate('/login')}>
              Ir al inicio de sesión
            </Button>
          </div>
        )}

        {state === 'not_found' && (
          <div className="text-center space-y-2">
            <h1 className="text-lg font-semibold">{t.acceptInvite.notFoundTitle}</h1>
            <p className="text-sm text-muted-foreground">{t.acceptInvite.notFoundDesc}</p>
          </div>
        )}

        {state === 'success' && (
          <div className="text-center space-y-2">
            <p className="text-sm text-green-600 font-medium">{t.acceptInvite.success}</p>
          </div>
        )}

        {state === 'valid' && (
          <div className="space-y-4">
            <div className="text-center">
              <h1 className="text-lg font-semibold">{t.acceptInvite.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {t.acceptInvite.description}
              </p>
              <p className="text-sm font-medium mt-2">{userName} — {userEmail}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="password">{t.acceptInvite.password}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.acceptInvite.passwordHint}
                  autoFocus
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">{t.acceptInvite.passwordHint}</p>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={submitting || !password}>
                {submitting ? t.acceptInvite.submitting : t.acceptInvite.submit}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
