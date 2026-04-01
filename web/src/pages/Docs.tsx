import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { ArrowLeft, BookOpen, Menu, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLangStore } from '@/store/lang'
import { useI18n } from '@/lib/i18n'

// -- Doc registry --

/** Ordered list of all documentation slugs. Determines sidebar order. */
const DOC_SLUGS = ['analysis', 'smtp-relay', 'dark-mode', 'settings', 'users', 'projects', 'trash', 'message-id', 'analyzer', 'sentinel'] as const
type DocSlug = (typeof DOC_SLUGS)[number]
const DEFAULT_SLUG: DocSlug = 'analysis'

// -- Heading parser --

/** Parsed heading extracted from a Markdown document. */
interface Heading { level: number; text: string; id: string }

/**
 * Extracts headings with explicit anchor IDs (`{#anchor}`) from raw Markdown.
 * Only headings that contain an `{#id}` suffix are included in the result.
 */
function parseHeadings(markdown: string): Heading[] {
  const result: Heading[] = []
  for (const line of markdown.split('\n')) {
    const m = line.match(/^(#{1,3})\s+(.+)/)
    if (!m) continue
    const level = m[1].length
    const raw   = m[2]
    const idM   = raw.match(/\{#([^}]+)\}/)
    if (!idM) continue
    result.push({
      level,
      id:   idM[1],
      text: raw.replace(/\{#[^}]+\}/g, '').replace(/`([^`]+)`/g, '$1').trim(),
    })
  }
  return result
}

// -- Anchor extraction --

/**
 * Separates an optional `{#id}` anchor suffix from the children of a rendered heading.
 * Returns the anchor ID (if present) and the cleaned child nodes.
 */
function extractAnchor(children: React.ReactNode): { id?: string; nodes: React.ReactNode } {
  const arr  = Array.isArray(children) ? children : [children]
  const last = arr[arr.length - 1]
  if (typeof last === 'string') {
    const m = last.match(/\s*\{#([^}]+)\}\s*$/)
    if (m) {
      const clean = last.slice(0, last.length - m[0].length).trimEnd()
      return { id: m[1], nodes: [...arr.slice(0, -1), ...(clean ? [clean] : [])] }
    }
  }
  return { nodes: arr }
}

// -- Markdown components --

/** Custom react-markdown component overrides for consistent documentation styling. */
const mdComponents: Components = {
  h1: ({ children }) => {
    const { id, nodes } = extractAnchor(children)
    return <h1 id={id} className="text-[1.6rem] font-bold tracking-tight text-foreground mb-2 scroll-mt-8 leading-tight">{nodes}</h1>
  },
  h2: ({ children }) => {
    const { id, nodes } = extractAnchor(children)
    return <h2 id={id} className="text-base font-semibold text-foreground mt-12 mb-3 pb-2 border-b border-border scroll-mt-8">{nodes}</h2>
  },
  h3: ({ children }) => {
    const { id, nodes } = extractAnchor(children)
    return <h3 id={id} className="text-sm font-semibold text-foreground mt-8 mb-2 scroll-mt-8">{nodes}</h3>
  },
  p:        ({ children }) => <p className="text-sm leading-[1.8] text-foreground/80 mb-4">{children}</p>,
  ul:       ({ children }) => <ul className="mb-5 space-y-1.5 text-sm text-foreground/80">{children}</ul>,
  ol:       ({ children }) => <ol className="mb-5 space-y-1.5 text-sm text-foreground/80 list-decimal pl-4">{children}</ol>,
  li:       ({ children }) => (
    <li className="flex gap-2.5 leading-relaxed">
      <span className="mt-[0.6rem] h-1 w-1 rounded-full bg-muted-foreground/40 shrink-0" />
      <span>{children}</span>
    </li>
  ),
  strong:   ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  code: ({ children, className }) => {
    if (className?.startsWith('language-'))
      return <code className={cn('text-[0.78rem] font-mono', className)}>{children}</code>
    return (
      <code className="text-[0.8em] font-mono bg-muted border border-border/60 px-1.5 py-0.5 rounded-md text-foreground/90">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="bg-muted border border-border rounded-lg p-4 mb-5 overflow-x-auto text-[0.78rem] font-mono leading-relaxed">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-6 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50 border-b border-border">{children}</thead>,
  th:    ({ children }) => <th className="text-left text-xs font-semibold text-muted-foreground py-3 px-4 first:pl-5">{children}</th>,
  td:    ({ children }) => <td className="py-3 px-4 first:pl-5 text-sm text-foreground/80 border-t border-border/50 align-top">{children}</td>,
  hr:    () => <hr className="my-10 border-border/50" />,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-primary underline-offset-2 hover:underline"
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  ),
}

// -- Scroll helpers --

/** Vertical offset in pixels applied when scrolling to a heading. */
const SCROLL_OFFSET = 32

/** Smoothly scrolls the content container so the target heading is visible. */
function scrollContentTo(id: string, container: HTMLElement) {
  const el = container.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
  if (!el) return
  container.scrollTo({ top: el.offsetTop - SCROLL_OFFSET, behavior: 'smooth' })
}

/** Applies a brief highlight animation to the target heading element. */
function highlightElement(id: string, container: HTMLElement) {
  const el = container.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
  if (!el) return
  el.classList.remove('doc-section-highlight')
  void el.offsetWidth
  el.classList.add('doc-section-highlight')
  el.addEventListener('animationend', () => el.classList.remove('doc-section-highlight'), { once: true })
}

/** Scrolls the TOC sidebar to keep the active heading button visible without affecting main content scroll. */
function scrollTocTo(id: string, tocEl: HTMLElement) {
  const btn = tocEl.querySelector<HTMLElement>(`[data-hid="${CSS.escape(id)}"]`)
  if (!btn) return
  const btnTop    = btn.offsetTop
  const btnBottom = btnTop + btn.offsetHeight
  const panelTop  = tocEl.scrollTop
  const panelH    = tocEl.clientHeight
  const pad       = 40
  if (btnTop < panelTop + pad) {
    tocEl.scrollTo({ top: btnTop - pad, behavior: 'smooth' })
  } else if (btnBottom > panelTop + panelH - pad) {
    tocEl.scrollTo({ top: btnBottom - panelH + pad, behavior: 'smooth' })
  }
}

// -- Page --

/**
 * Documentation viewer with three-column layout (left nav, content, right TOC).
 * Fetches Markdown files from `/docs/{lang}/{slug}.md`, renders them with
 * react-markdown, and synchronizes scroll position with the table of contents.
 */
export default function DocsPage() {
  const params   = useParams<{ slug?: string }>()
  const slug     = (params.slug ?? DEFAULT_SLUG) as DocSlug
  const location = useLocation()
  const lang     = useLangStore(s => s.lang)
  const t        = useI18n()

  const DOCS = [
    { slug: 'analysis'  as const, label: t.docs.docLabels.analysis  },
    { slug: 'smtp-relay'as const, label: t.docs.docLabels.smtpRelay },
    { slug: 'dark-mode' as const, label: t.docs.docLabels.darkMode  },
    { slug: 'settings'  as const, label: t.docs.docLabels.settings  },
    { slug: 'users'     as const, label: t.docs.docLabels.users     },
    { slug: 'projects'  as const, label: t.docs.docLabels.projects  },
    { slug: 'trash'     as const, label: t.docs.docLabels.trash     },
    { slug: 'message-id'as const, label: t.docs.docLabels.messageId },
    { slug: 'analyzer'  as const, label: t.docs.docLabels.analyzer  },
    { slug: 'sentinel'  as const, label: t.docs.docLabels.sentinel  },
  ]

  const [content,  setContent]  = useState<string | null>(null)
  const [error,    setError]    = useState(false)
  const [headings, setHeadings] = useState<Heading[]>([])
  const [activeId, setActiveId] = useState<string>('')

  const mainRef = useRef<HTMLDivElement>(null)
  const tocRef  = useRef<HTMLDivElement>(null)

  const currentDoc = DOCS.find(d => d.slug === slug) ?? DOCS[0]

  // ── Fetch doc ───────────────────────────────────────────────────────────────
  useEffect(() => {
    setContent(null)
    setError(false)
    setActiveId('')
    fetch(`/docs/${lang}/${slug}.md`)
      .then(r => { if (!r.ok) throw new Error(); return r.text() })
      .then(text => { setContent(text); setHeadings(parseHeadings(text)) })
      .catch(() => setError(true))
  }, [slug, lang])

  // ── Scroll to hash after content renders ───────────────────────────────────
  useEffect(() => {
    const container = mainRef.current
    if (!content || !location.hash || !container) return
    const id = location.hash.slice(1)
    requestAnimationFrame(() => {
      scrollContentTo(id, container)
      highlightElement(id, container)
    })
  }, [content, location.hash])

  // ── Scroll-based active heading tracker ────────────────────────────────────
  useEffect(() => {
    const container = mainRef.current
    if (!container || !content) return

    const update = () => {
      const els = Array.from(
        container.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id]'),
      )
      if (!els.length) return
      const threshold = container.getBoundingClientRect().top + 88
      let active = els[0].id
      for (const el of els) {
        if (el.getBoundingClientRect().top <= threshold) active = el.id
        else break
      }
      setActiveId(prev => (prev === active ? prev : active))
    }

    const raf = requestAnimationFrame(update)
    container.addEventListener('scroll', update, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      container.removeEventListener('scroll', update)
    }
  }, [content])

  // ── Auto-scroll TOC to keep active item visible (without moving main scroll) ─
  useEffect(() => {
    if (!activeId || !tocRef.current) return
    scrollTocTo(activeId, tocRef.current)
  }, [activeId])

  // ── Click handler: force active immediately + scroll + highlight ──────────
  const handleNavClick = useCallback((id: string) => {
    setActiveId(id)
    if (mainRef.current) {
      scrollContentTo(id, mainRef.current)
      highlightElement(id, mainRef.current)
    }
  }, [])

  // ── Derived ─────────────────────────────────────────────────────────────────
  const activeSectionId = useMemo(() => {
    const idx = headings.findIndex(h => h.id === activeId)
    if (idx === -1) return ''
    for (let i = idx; i >= 0; i--) {
      if (headings[i].level <= 2) return headings[i].id
    }
    return ''
  }, [activeId, headings])

  const h2Headings  = headings.filter(h => h.level === 2)
  const tocHeadings = headings.filter(h => h.level <= 3)

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Mobile / tablet top bar (< xl) ───────────────────────────────── */}
      <div className="xl:hidden flex items-center gap-2 px-4 h-12 border-b shrink-0 bg-background/95 backdrop-blur-sm">
        <Link
          to="/"
          className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <span className="flex-1 text-sm font-medium truncate">{currentDoc.label}</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <Menu className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 max-h-[70vh] overflow-y-auto">

            <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">
              {t.docs.navTitle}
            </DropdownMenuLabel>
            {DOCS.map(doc => (
              <DropdownMenuItem key={doc.slug} asChild>
                <NavLink
                  to={`/docs/${doc.slug}`}
                  className="flex items-center justify-between cursor-pointer"
                >
                  {doc.label}
                  {doc.slug === slug && <Check className="h-3.5 w-3.5 text-primary" />}
                </NavLink>
              </DropdownMenuItem>
            ))}

            {h2Headings.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">
                  {t.docs.onThisPage}
                </DropdownMenuLabel>
                {h2Headings.map(h => (
                  <DropdownMenuItem
                    key={h.id}
                    onClick={() => handleNavClick(h.id)}
                    className={cn(
                      'cursor-pointer',
                      activeSectionId === h.id && 'font-medium text-foreground',
                    )}
                  >
                    {h.text}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Three-column body ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left nav (xl+) ─────────────────────────────────────────────── */}
        <aside className="hidden xl:flex flex-col w-56 shrink-0 border-r overflow-y-auto bg-card/30">
          <div className="py-7 px-3 flex flex-col gap-6">

            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2"
            >
              <ArrowLeft className="h-3 w-3 shrink-0" />
              {t.docs.back}
            </Link>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-2 px-2">
                {t.docs.navTitle}
              </p>
              <nav className="space-y-px">
                {DOCS.map(doc => {
                  const isActive = doc.slug === slug
                  return (
                    <div key={doc.slug}>
                      <NavLink
                        to={`/docs/${doc.slug}`}
                        className={cn(
                          'flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors',
                          isActive
                            ? 'bg-accent text-foreground font-semibold'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50 font-medium',
                        )}
                      >
                        <BookOpen className={cn(
                          'h-3.5 w-3.5 shrink-0',
                          isActive ? 'text-primary' : 'text-muted-foreground/50',
                        )} />
                        {doc.label}
                      </NavLink>

                      {isActive && h2Headings.length > 0 && (
                        <div className="mt-0.5 mb-1 pl-2 space-y-px">
                          {h2Headings.map(h => (
                            <button
                              key={h.id}
                              onClick={() => handleNavClick(h.id)}
                              className={cn(
                                'w-full text-left px-2 py-1 text-xs rounded transition-colors leading-snug flex items-center gap-2',
                                activeSectionId === h.id
                                  ? 'text-foreground font-medium'
                                  : 'text-muted-foreground/65 hover:text-foreground hover:bg-accent/40',
                              )}
                            >
                              <span className={cn(
                                'h-1 w-1 rounded-full shrink-0 transition-colors',
                                activeSectionId === h.id ? 'bg-primary' : 'bg-muted-foreground/30',
                              )} />
                              {h.text}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </nav>
            </div>
          </div>
        </aside>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <div ref={mainRef} className="flex-1 overflow-y-auto min-w-0">
          <div className="max-w-[740px] mx-auto px-5 sm:px-8 lg:px-10 py-8">
            {error && (
              <p className="text-sm text-muted-foreground mt-4">
                {t.docs.loadError}
              </p>
            )}

            {!error && !content && (
              <div className="space-y-4 animate-pulse pt-2">
                <div className="h-9 w-2/3 rounded-md bg-muted" />
                <div className="h-4 w-full rounded bg-muted" />
                <div className="h-4 w-5/6 rounded bg-muted" />
                <div className="h-4 w-4/6 rounded bg-muted" />
                <div className="mt-10 h-5 w-1/3 rounded bg-muted" />
                <div className="h-4 w-full rounded bg-muted" />
                <div className="h-4 w-full rounded bg-muted" />
                <div className="h-4 w-3/4 rounded bg-muted" />
              </div>
            )}

            {content && (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {content}
              </ReactMarkdown>
            )}

            <div className="h-20" />
          </div>
        </div>

        {/* ── Right TOC (lg+) ────────────────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-60 shrink-0 border-l bg-card/30">
          <div ref={tocRef} className="flex-1 overflow-y-auto py-7 px-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3 px-1">
              {t.docs.onThisPage}
            </p>
            <nav className="space-y-px">
              {tocHeadings.map(h => {
                const isActive = activeId === h.id
                return (
                  <button
                    key={h.id}
                    data-hid={h.id}
                    onClick={() => handleNavClick(h.id)}
                    className={cn(
                      'w-full text-left rounded transition-colors leading-snug flex items-center gap-1.5',
                      h.level === 2 && 'px-1 py-[5px] mt-3 first:mt-0',
                      h.level === 3 && 'px-1 py-[3px] pl-4',
                      isActive
                        ? 'text-foreground'
                        : h.level === 2
                          ? 'text-foreground/65 hover:text-foreground'
                          : 'text-muted-foreground/55 hover:text-foreground/80',
                    )}
                  >
                    {/* dot indicator */}
                    <span className={cn(
                      'shrink-0 rounded-full bg-primary transition-all duration-150 mt-px',
                      isActive ? 'opacity-100 w-1.5 h-1.5' : 'opacity-0 w-0 h-1.5',
                    )} />

                    <span className={cn(
                      h.level === 2 && (isActive ? 'text-[0.8rem] font-semibold' : 'text-[0.78rem] font-medium'),
                      h.level === 3 && (isActive ? 'text-[0.73rem] font-medium'  : 'text-[0.71rem]'),
                    )}>
                      {h.text}
                    </span>
                  </button>
                )
              })}
            </nav>
          </div>
        </aside>

      </div>
    </div>
  )
}
