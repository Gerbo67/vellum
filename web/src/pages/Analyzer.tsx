import { useRef, useState } from 'react'
import { Upload, AlertTriangle, X, FileCode } from 'lucide-react'
import { api } from '@/lib/api'
import type { EmailAnalysis } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { EmailScore } from '@/components/EmailScore'
import { cn } from '@/lib/utils'
import { useLangStore } from '@/store/lang'

/**
 * Standalone HTML file analyzer page.
 * Accepts a drag-and-drop or file-picker HTML file, sends it to the analysis endpoint,
 * and renders the results using the shared EmailScore component.
 * Results are ephemeral and lost on navigation or reload.
 */
export default function AnalyzerPage() {
  const t = useI18n()
  const lang = useLangStore((s) => s.lang)
  const inputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<EmailAnalysis | null>(null)

  function validateFile(f: File): string | null {
    if (!f.name.toLowerCase().endsWith('.html')) return t.analyzer.errorInvalidType
    if (f.size > 5 * 1024 * 1024) return t.analyzer.errorTooLarge
    return null
  }

  function handleFileChange(f: File | null) {
    if (!f) return
    const err = validateFile(f)
    if (err) {
      setError(err)
      return
    }
    setError(null)
    setResult(null)
    setFile(f)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFileChange(e.target.files?.[0] ?? null)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    handleFileChange(e.dataTransfer.files?.[0] ?? null)
  }

  function handleClear() {
    setFile(null)
    setResult(null)
    setError(null)
  }

  async function handleAnalyze() {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.analyzer.analyzeHtml(file, lang)
      setResult(data)
    } catch {
      setError(t.analyzer.errorAnalysis)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex flex-col gap-5 p-6 max-w-2xl w-full mx-auto">
        <div>
          <h1 className="text-lg font-semibold">{t.analyzer.title}</h1>
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t.analyzer.disclaimer}
          </p>
        </div>

        {/* Zona de carga */}
        {!result && (
          <div
            className={cn(
              'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer',
              dragging
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-accent/30',
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !file && inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".html"
              className="hidden"
              onChange={handleInputChange}
            />

            {file ? (
              <>
                <FileCode className="h-8 w-8 text-primary" />
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate max-w-xs">{file.name}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleClear() }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={t.analyzer.changeFile}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {t.analyzer.dropLabel}{' '}
                    <span
                      className="font-medium text-primary underline-offset-2 hover:underline cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
                    >
                      {t.analyzer.browseBtn}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{t.analyzer.dropHint}</p>
                </div>
              </>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        {/* Botón de analizar */}
        {file && !result && (
          <Button onClick={handleAnalyze} disabled={loading} className="w-full">
            {loading ? t.analyzer.analyzing : t.analyzer.analyzeBtn}
          </Button>
        )}

        {/* Resultados */}
        {result && (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground truncate max-w-xs">
                  {file?.name}
                </span>
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t.analyzer.changeFile}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <EmailScore data={result} />
          </div>
        )}
      </div>
    </div>
  )
}

