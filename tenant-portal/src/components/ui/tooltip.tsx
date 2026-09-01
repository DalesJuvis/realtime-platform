import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

import { cn } from '@lib/utils'
import { isApplePlatform } from '@lib/platform'

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-md border px-3 py-1.5 text-xs shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        // macOS/iOS get the real glassmorphism treatment — heavily
        // translucent, saturated blur, a soft light border — since that's
        // the platform's own vernacular (menu bar, Control Center,
        // Notification Center all read this way). Everywhere else gets a
        // faint blur over an otherwise-solid tooltip: enough to soften
        // whatever's behind it without pretending to be a material this
        // platform doesn't have.
        isApplePlatform
          ? 'border-white/15 bg-popover/60 text-popover-foreground backdrop-blur-xl backdrop-saturate-150 dark:border-white/10'
          : 'border-border bg-popover/95 text-popover-foreground backdrop-blur-sm',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
