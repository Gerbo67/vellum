import { useMemo, useState, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'
import type { Email } from '@/lib/api'
import { Button } from './ui/button'
import { useI18n } from '@/lib/i18n'

/** Props for {@link RawViewer}. */
interface RawViewerProps {
  email: Email
}

/** Discriminated union representing a single lexical token produced by the HTML tokenizer. */
type Token =
  | { type: 'tag-open'; value: string }
  | { type: 'tag-close'; value: string }
  | { type: 'tag-name'; value: string }
  | { type: 'attr-name'; value: string }
  | { type: 'attr-value'; value: string }
  | { type: 'comment'; value: string }
  | { type: 'doctype'; value: string }
  | { type: 'bracket'; value: string }
  | { type: 'text'; value: string }

/**
 * Lightweight HTML tokenizer for syntax highlighting purposes.
 * Produces a flat array of typed tokens that can be mapped to colored spans.
 * Not intended as a standards-compliant parser.
 */
function tokenizeHTML(html: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4)
      const endIdx = end === -1 ? html.length : end + 3
      tokens.push({ type: 'comment', value: html.slice(i, endIdx) })
      i = endIdx
      continue
    }

    if (html.startsWith('<!', i)) {
      const end = html.indexOf('>', i)
      const endIdx = end === -1 ? html.length : end + 1
      tokens.push({ type: 'doctype', value: html.slice(i, endIdx) })
      i = endIdx
      continue
    }

    if (html[i] === '<') {
      tokens.push({ type: 'tag-open', value: '<' })
      i++

      if (html[i] === '/') {
        tokens.push({ type: 'bracket', value: '/' })
        i++
      }

      const tagMatch = html.slice(i).match(/^[a-zA-Z][a-zA-Z0-9\-_.:]*/)
      if (tagMatch) {
        tokens.push({ type: 'tag-name', value: tagMatch[0] })
        i += tagMatch[0].length
      }

      while (i < html.length && html[i] !== '>') {
        if (html[i] === '/' && html[i + 1] === '>') {
          tokens.push({ type: 'bracket', value: '/>' })
          i += 2
          break
        }

        const ws = html.slice(i).match(/^\s+/)
        if (ws) {
          tokens.push({ type: 'text', value: ws[0] })
          i += ws[0].length
          continue
        }

        const attrName = html.slice(i).match(/^[a-zA-Z_:][a-zA-Z0-9_:\-.]*/)

        if (attrName) {
          tokens.push({ type: 'attr-name', value: attrName[0] })
          i += attrName[0].length

          if (html[i] === '=') {
            tokens.push({ type: 'bracket', value: '=' })
            i++

            if (html[i] === '"' || html[i] === "'") {
              const quote = html[i]
              const end = html.indexOf(quote, i + 1)
              const endIdx = end === -1 ? html.length : end + 1
              tokens.push({ type: 'attr-value', value: html.slice(i, endIdx) })
              i = endIdx
            } else {
              const unquoted = html.slice(i).match(/^[^\s>]+/)
              if (unquoted) {
                tokens.push({ type: 'attr-value', value: unquoted[0] })
                i += unquoted[0].length
              }
            }
          }
          continue
        }

        tokens.push({ type: 'text', value: html[i] })
        i++
      }

      if (i < html.length && html[i] === '>') {
        tokens.push({ type: 'tag-close', value: '>' })
        i++
      }
      continue
    }

    const textEnd = html.indexOf('<', i)
    const end = textEnd === -1 ? html.length : textEnd
    tokens.push({ type: 'text', value: html.slice(i, end) })
    i = end
  }

  return tokens
}

/** Returns the Tailwind color class for a given token type. */
function colorClass(type: Token['type']): string {
  switch (type) {
    case 'tag-open':
    case 'tag-close':
      return 'text-slate-400 dark:text-slate-500'
    case 'tag-name':
      return 'text-violet-600 dark:text-violet-400'
    case 'attr-name':
      return 'text-sky-600 dark:text-sky-400'
    case 'attr-value':
      return 'text-amber-600 dark:text-amber-400'
    case 'comment':
      return 'text-slate-400 dark:text-slate-500 italic'
    case 'doctype':
      return 'text-slate-400 dark:text-slate-500'
    case 'bracket':
      return 'text-slate-500 dark:text-slate-400'
    default:
      return 'text-foreground'
  }
}

/**
 * Reconstructs a pseudo-raw representation of an email by combining
 * headers (in canonical order) with the HTML or text body.
 */
function buildRawContent(email: Email): string {
  const lines: string[] = []

  const headerOrder = ['from', 'to', 'cc', 'subject', 'message-id', 'date', 'content-type', 'mime-version']
  const seen = new Set<string>()

  if (email.raw_headers) {
    for (const key of headerOrder) {
      const vals = email.raw_headers[key]
      if (vals?.length) {
        for (const v of vals) lines.push(`${key}: ${v}`)
        seen.add(key)
      }
    }
    for (const [key, vals] of Object.entries(email.raw_headers)) {
      if (!seen.has(key)) {
        for (const v of vals) lines.push(`${key}: ${v}`)
      }
    }
  } else {
    if (email.from)    lines.push(`From: ${email.from}`)
    if (email.to?.length) lines.push(`To: ${email.to.join(', ')}`)
    if (email.cc?.length) lines.push(`Cc: ${email.cc.join(', ')}`)
    if (email.subject) lines.push(`Subject: ${email.subject}`)
    if (email.message_id) lines.push(`Message-ID: ${email.message_id}`)
  }

  lines.push('')

  const body = email.html_body || email.text_body || ''
  lines.push(body)

  return lines.join('\n')
}

/**
 * Displays the raw email source with syntax-highlighted HTML body.
 * Headers are rendered in a distinct color. Provides a one-click copy button.
 */
export function RawViewer({ email }: RawViewerProps) {
  const raw = useMemo(() => buildRawContent(email), [email])
  const t = useI18n()
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [raw])

  const separatorIdx = raw.indexOf('\n\n')
  const headersPart = separatorIdx !== -1 ? raw.slice(0, separatorIdx) : raw
  const bodyPart = separatorIdx !== -1 ? raw.slice(separatorIdx + 2) : ''
  const isHTML = !!email.html_body

  const bodyTokens = useMemo(() => {
    if (!isHTML || !bodyPart) return null
    return tokenizeHTML(bodyPart)
  }, [bodyPart, isHTML])

  return (
    <div className="relative flex-1 min-h-0 overflow-auto bg-[#fafafa] dark:bg-[#0d0d0d]">
      <div className="absolute top-3 right-3 z-10">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 bg-background/80 backdrop-blur-sm border border-border/60 hover:bg-background"
          onClick={handleCopy}
          title={copied ? t.emailDetail.copied : t.emailDetail.copyRaw}
          aria-label={copied ? t.emailDetail.copied : t.emailDetail.copyRaw}
        >
          {copied
            ? <Check className="h-3.5 w-3.5 text-green-500" />
            : <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </Button>
      </div>
      <pre className="p-4 sm:p-6 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all">
        <span className="text-emerald-700 dark:text-emerald-400">{headersPart}</span>
        {'\n\n'}
        {isHTML && bodyTokens
          ? bodyTokens.map((tok, i) => (
              <span key={i} className={colorClass(tok.type)}>{tok.value}</span>
            ))
          : <span className="text-foreground">{bodyPart}</span>
        }
      </pre>
    </div>
  )
}
