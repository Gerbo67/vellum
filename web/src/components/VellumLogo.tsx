interface VellumLogoProps {
  /** Icon dimensions in pixels. Defaults to 32. */
  size?: number
  /** Whether to render the "Vellum" text alongside the icon. Defaults to true. */
  showText?: boolean
  className?: string
}

/** SVG brand logo with optional wordmark. Used in the sidebar header and auth pages. */
export function VellumLogo({ size = 32, showText = true, className = '' }: VellumLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
        <path
          d="M7 9.5L14 22.5L16 18.5L18 22.5L25 9.5"
          stroke="hsl(var(--primary-foreground))"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="18.5" r="1.8" fill="hsl(var(--primary-foreground))" opacity="0.7" />
      </svg>
      {showText && (
        <span className="text-base font-semibold tracking-tight">Vellum</span>
      )}
    </div>
  )
}
