/**
 * # DialogProvider / useDialog
 *
 * Global, stack-capable dialog system callable via function anywhere in the
 * app (FRONTEND.md §18) — components never hold local `useState` modal flags.
 * Respects the user's overlay-blur preference (`PreferencesStore`).
 *
 * Usage:
 *   const dialog = useDialog()
 *   dialog.openDialog(<MyForm />, { title: 'Edit tenant', animation: 'slide-up' })
 *   dialog.closeDialog(id)
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion, type TargetAndTransition } from 'framer-motion'
import { cn } from '@lib/utils'
import { usePreferencesStore } from '@store/preferences.store'

export type DialogAnimation = 'slide-up' | 'fade' | 'scale'
export type DialogSize = 'sm' | 'md' | 'lg' | 'xl'

export interface DialogOptions {
  readonly title?: string
  readonly description?: string
  readonly size?: DialogSize
  readonly animation?: DialogAnimation
  readonly closable?: boolean
  readonly persistent?: boolean
}

interface ResolvedDialogOptions {
  readonly title: string | undefined
  readonly description: string | undefined
  readonly size: DialogSize
  readonly animation: DialogAnimation
  readonly closable: boolean
  readonly persistent: boolean
}

interface DialogInstance {
  readonly id: string
  readonly component: ReactNode
  readonly options: ResolvedDialogOptions
}

const animationVariants: Record<DialogAnimation, { initial: TargetAndTransition; animate: TargetAndTransition; exit: TargetAndTransition }> = {
  'slide-up': { initial: { y: 24, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: 24, opacity: 0 } },
  fade: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  scale: { initial: { scale: 0.95, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.95, opacity: 0 } },
}

const sizeMap: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
}

interface DialogContextValue {
  openDialog: (component: ReactNode, options?: DialogOptions) => string
  closeDialog: (id: string) => void
  closeAll: () => void
}

const DialogContext = createContext<DialogContextValue | null>(null)

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used inside <DialogProvider>')
  return ctx
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<DialogInstance[]>([])
  const overlayBlur = usePreferencesStore((s) => s.overlayBlur)

  const openDialog = useCallback((component: ReactNode, options: DialogOptions = {}): string => {
    const id = crypto.randomUUID()
    setStack((prev) => [
      ...prev,
      {
        id,
        component,
        options: {
          title: options.title,
          description: options.description,
          size: options.size ?? 'md',
          animation: options.animation ?? 'scale',
          closable: options.closable ?? true,
          persistent: options.persistent ?? false,
        },
      },
    ])
    return id
  }, [])

  const closeDialog = useCallback((id: string) => {
    setStack((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const closeAll = useCallback(() => setStack([]), [])

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setStack((prev) => {
        const top = prev.at(-1)
        if (!top || top.options.persistent === true || top.options.closable === false) return prev
        return prev.slice(0, -1)
      })
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])

  return (
    <DialogContext.Provider value={{ openDialog, closeDialog, closeAll }}>
      {children}

      <AnimatePresence>
        {stack.map((dialog, index) => {
          const variant = animationVariants[dialog.options.animation]

          return (
            <div key={dialog.id} className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 50 + index }}>
              {index === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={cn('absolute inset-0 bg-black/60', overlayBlur && 'backdrop-blur-sm')}
                  onClick={() => !dialog.options.persistent && closeDialog(dialog.id)}
                />
              )}

              <motion.div
                initial={variant.initial}
                animate={variant.animate}
                exit={variant.exit}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className={cn(
                  'relative z-10 w-full rounded-xl border border-border bg-card text-card-foreground shadow-2xl',
                  sizeMap[dialog.options.size],
                )}
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                {(dialog.options.title || dialog.options.closable) && (
                  <div className="flex items-start justify-between border-b border-border px-6 py-4">
                    <div>
                      {dialog.options.title && <h2 className="text-base font-semibold leading-none">{dialog.options.title}</h2>}
                      {dialog.options.description && (
                        <p className="mt-1.5 text-sm text-muted-foreground">{dialog.options.description}</p>
                      )}
                    </div>
                    {dialog.options.closable && (
                      <button
                        onClick={() => closeDialog(dialog.id)}
                        className="ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Close dialog"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}

                <div className="px-6 py-5">{dialog.component}</div>
              </motion.div>
            </div>
          )
        })}
      </AnimatePresence>
    </DialogContext.Provider>
  )
}
