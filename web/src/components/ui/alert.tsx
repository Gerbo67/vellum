import * as React from 'react'
import { cn } from '@/lib/utils'

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'warning'
}

export function Alert({ variant = 'default', className, children, ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        'relative w-full rounded-lg border p-3 text-sm',
        variant === 'warning'
          ? 'border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200'
          : 'border-border bg-background text-foreground',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function AlertTitle({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('mb-1.5 font-semibold leading-none tracking-tight', className)} {...props}>
      {children}
    </p>
  )
}

export function AlertDescription({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-xs leading-relaxed', className)} {...props}>
      {children}
    </p>
  )
}

