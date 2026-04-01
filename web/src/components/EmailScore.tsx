import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, XCircle, AlertTriangle, Info, ChevronDown, ChevronRight, Minus, ExternalLink, ShieldCheck, ShieldX, BookOpen, Radar } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type { AnalysisCategory, AnalysisCheck } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Skeleton } from './ui/skeleton'
import { useLangStore } from '@/store/lang'
import { useI18n } from '@/lib/i18n'

interface EmailScoreProps {
  projectId?: string
  emailId?: string
  /** Pre-fetched analysis data. When provided, the component skips the API call. */
  data?: import('@/lib/api').EmailAnalysis
}

/**
 * Renders the full email analysis report: overall score, Vellum Verified badge,
 * Sentinel spam risk indicator, expandable category rows, and guideline references.
 */
export function EmailScore({ projectId, emailId, data: directData }: EmailScoreProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const lang = useLangStore((s) => s.lang)
  const t = useI18n()

  const { data: fetchedData, isLoading } = useQuery({
    queryKey: ['email-analysis', projectId, emailId, lang],
    queryFn: () => api.emails.analyze(projectId!, emailId!, lang),
    staleTime: Infinity,
    enabled: !!projectId && !!emailId && !directData,
  })

  const data = directData ?? fetchedData

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    )
  }

  if (!data) return null

  const { score, grade, summary, categories, is_vellum_verified, verification_disclaimer } = data

  return (
    <div className="flex flex-col gap-4 p-5 overflow-y-auto">
      {/* Resumen principal */}
      <div className="flex items-center gap-5">
        <ScoreCircle score={score} grade={grade} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug">
            {(t.analysis.grades as Record<string, string>)[grade] ?? grade}
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{summary}</p>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{t.analysis.overallScore}</span>
          <span className="font-medium" style={{ color: scoreColor(score) }}>{score}/100</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${score}%`, backgroundColor: scoreColor(score) }}
          />
        </div>
      </div>

      {/* Badges: Vellum Verified + Sentinel */}
      {(() => {
        const deliverability = categories.find((c) => c.id === 'deliverability')
        const spamCheck = deliverability?.checks.find((c) => c.id === 'no_spam_triggers')
        const spamPct = spamCheck?.detail?.match(/(\d+)%/)?.[1]
        const spamProbability = spamPct ? parseInt(spamPct, 10) : null
        const isSpamSkipped = spamCheck?.skipped ?? true

        const getSentinelLevel = () => {
          if (isSpamSkipped || spamProbability === null) return { label: t.analysis.sentinelSkipped, color: 'text-muted-foreground', border: 'border-border', bg: 'bg-muted/30' }
          if (spamProbability >= 75) return { label: t.analysis.sentinelHigh, color: 'text-red-600 dark:text-red-400', border: 'border-red-500/40', bg: 'bg-red-500/5' }
          if (spamProbability >= 40) return { label: t.analysis.sentinelMedium, color: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/40', bg: 'bg-amber-500/5' }
          return { label: t.analysis.sentinelLow, color: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-500/5' }
        }
        const sentinel = getSentinelLevel()

        return (
          <div className="flex flex-col gap-2">
            {/* Vellum Verified */}
            {is_vellum_verified ? (
              <div className="flex items-start gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
                <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{t.analysis.vellumVerified}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{verification_disclaimer}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <ShieldX className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">{t.analysis.vellumNotVerified}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{t.analysis.vellumNotVerifiedDetail}</p>
                </div>
              </div>
            )}

            {/* Vellum Sentinel */}
            <button
              type="button"
              onClick={() => setExpanded(expanded === 'deliverability' ? null : 'deliverability')}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent/50',
                sentinel.border, sentinel.bg,
              )}
            >
              <Radar className={cn('h-5 w-5 shrink-0 mt-0.5', sentinel.color)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={cn('text-xs font-bold', sentinel.color)}>{t.analysis.sentinelTitle}</p>
                  <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', sentinel.bg, sentinel.color)}>
                    {sentinel.label}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  {isSpamSkipped || spamProbability === null
                    ? t.analysis.sentinelSkipped
                    : t.analysis.sentinelDesc(spamProbability)}
                </p>
              </div>
              <ChevronRight className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform mt-0.5',
                expanded === 'deliverability' && 'rotate-90',
              )} />
            </button>
          </div>
        )
      })()}

      {/* Categorías */}
      <div className="space-y-1">
        {categories.map((cat) => (
          <CategoryRow
            key={cat.id}
            category={cat}
            isOpen={expanded === cat.id}
            onToggle={() => setExpanded(expanded === cat.id ? null : cat.id)}
          />
        ))}
      </div>

      {/* Disclaimer offline */}
      <div className="border-t pt-3 space-y-2">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {t.analysis.offlineNote}
        </p>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">{t.analysis.guidelinesLabel}:</span>
          <div className="flex flex-wrap gap-1.5">
            <GuidelineLink
              href="https://support.google.com/a/answer/81126"
              label="Google Workspace"
            />
            <GuidelineLink
              href="https://sendersupport.olc.protection.outlook.com/pm/policies"
              label="Microsoft Outlook"
            />
            <GuidelineLink
              href="https://support.apple.com/en-us/102322"
              label="Apple Mail"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Animated SVG circular progress indicator that displays the letter grade and numeric score. */
function ScoreCircle({ score, grade }: { score: number; grade: string }) {
  const color = scoreColor(score)
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  return (
    <div className="relative shrink-0 w-16 h-16">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="5" className="text-muted" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-base font-bold" style={{ color }}>{grade}</span>
        <span className="text-[10px] text-muted-foreground mt-0.5">{score}pts</span>
      </div>
    </div>
  )
}

/** Expandable row that summarizes a single analysis category with a progress bar. */
function CategoryRow({ category, isOpen, onToggle }: { category: AnalysisCategory; isOpen: boolean; onToggle: () => void }) {
  const failedBlockers = category.checks.filter((c) => !c.passed && !c.skipped && (c.severity === 'blocker' || c.severity === 'critical')).length
  const allPassed = category.passed === category.total && category.total > 0
  const isInfoOnly = category.checks.every((c) => c.skipped || c.passed || c.severity === 'info')
  const t = useI18n()

  return (
    <div className="rounded-md border overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 transition-colors"
      >
        {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="flex-1 text-left font-medium text-xs">{category.name}</span>
        {isInfoOnly && (
          <span className="text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
            {t.analysis.infoOnly}
          </span>
        )}
        {!isInfoOnly && failedBlockers > 0 && (
          <span className="text-[10px] font-medium bg-destructive/15 text-destructive px-1.5 py-0.5 rounded">
            {t.analysis.blockerCount(failedBlockers)}
          </span>
        )}
        <span className={cn(
          'text-[10px] font-medium ml-1',
          allPassed ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
        )}>
          {category.total > 0 ? `${category.passed}/${category.total}` : '—'}
        </span>
        <CategoryBar passed={category.passed} total={category.total} infoOnly={isInfoOnly} />
      </button>

      {isOpen && (
        <div className="border-t divide-y">
          {category.checks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Micro progress bar representing the pass/total ratio within a category. */
function CategoryBar({ passed, total, infoOnly }: { passed: number; total: number; infoOnly: boolean }) {
  if (total === 0) {
    return <div className="h-1.5 w-12 rounded-full bg-muted shrink-0" />
  }
  const pct = (passed / total) * 100
  let color: string
  if (pct === 100) {
    color = '#10b981'
  } else if (infoOnly) {
    color = '#3b82f6'
  } else if (pct >= 60) {
    color = '#f59e0b'
  } else {
    color = '#ef4444'
  }
  return (
    <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden shrink-0">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}

/** Individual check result row within an expanded category. */
function CheckRow({ check }: { check: AnalysisCheck }) {
  if (check.skipped) {
    return (
      <div className="flex items-start gap-2.5 px-3 py-2 text-xs opacity-40">
        <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-medium leading-tight text-muted-foreground">{check.name}</p>
            {check.id === 'no_spam_triggers' && <SentinelBadge />}
            <DocLink id={check.id} />
          </div>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">{check.detail}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      'flex items-start gap-2.5 px-3 py-2 text-xs',
      !check.passed && (check.severity === 'blocker' || check.severity === 'critical') && 'bg-destructive/5',
      !check.passed && check.severity === 'warning' && 'bg-amber-500/5',
      !check.passed && check.severity === 'info' && 'bg-blue-500/5',
    )}>
      <CheckIcon check={check} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={cn('font-medium leading-tight', !check.passed && severityTextColor(check.severity))}>
            {check.name}
          </p>
          {check.id === 'no_spam_triggers' && <SentinelBadge />}
          <DocLink id={check.id} />
        </div>
        <p className="text-muted-foreground mt-0.5 leading-relaxed">{check.detail}</p>
      </div>
      {!check.passed && (
        <span className={cn(
          'shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide',
          severityBadgeClass(check.severity),
        )}>
          -{check.impact}
        </span>
      )}
    </div>
  )
}

/** Small badge linking to the Vellum Sentinel documentation page. */
function SentinelBadge() {
  return (
    <Link
      to="/docs/sentinel"
      title="Vellum Sentinel"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20 transition-colors uppercase tracking-wide"
    >
      <ShieldCheck className="h-2.5 w-2.5" />
      Sentinel
    </Link>
  )
}

/** Icon linking a specific check to its section in the analysis documentation. */
function DocLink({ id }: { id: string }) {
  const t = useI18n()
  return (
    <Link
      to={`/docs/analysis#${id}`}
      title={t.docs.tooltip}
      className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
    >
      <BookOpen className="h-3 w-3" />
    </Link>
  )
}

/** Renders the appropriate status icon (pass, fail, warning, info) for a check. */
function CheckIcon({ check }: { check: AnalysisCheck }) {
  if (check.passed) {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500 mt-0.5" />
  }
  switch (check.severity) {
    case 'blocker':
    case 'critical':
      return <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive mt-0.5" />
    case 'warning':
      return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
    default:
      return <Info className="h-3.5 w-3.5 shrink-0 text-blue-500 mt-0.5" />
  }
}

/** Returns the foreground text color class for a given severity level. */
function severityTextColor(severity: string) {
  switch (severity) {
    case 'blocker':
    case 'critical': return 'text-destructive'
    case 'warning': return 'text-amber-600 dark:text-amber-400'
    default: return 'text-blue-600 dark:text-blue-400'
  }
}

/** Returns combined background and text color classes for severity badge styling. */
function severityBadgeClass(severity: string) {
  switch (severity) {
    case 'blocker':
    case 'critical': return 'bg-destructive/15 text-destructive'
    case 'warning': return 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
    default: return 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
  }
}

/** External link button pointing to an email provider's sender guidelines. */
function GuidelineLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {label}
      <ExternalLink className="h-2.5 w-2.5 shrink-0" />
    </a>
  )
}

/** Maps a numeric score (0-100) to a color for visual indicators. */
function scoreColor(score: number): string {
  if (score >= 90) return '#10b981'
  if (score >= 75) return '#84cc16'
  if (score >= 60) return '#f59e0b'
  if (score >= 40) return '#f97316'
  return '#ef4444'
}
