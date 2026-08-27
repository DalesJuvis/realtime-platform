/**
 * # MioLogo
 *
 * The platform's actual brand mark ("mio — Unified Push Messaging") —
 * replaces the earlier placeholder gradient-square badge. Cropped to just
 * the arrow+M mark (no wordmark, no background rect) from the provided
 * source SVG, so it can sit at any size next to HTML text ("mio") and on
 * either theme — the mark's own warm gradient doesn't depend on a dark
 * backing card the way the original asset's navy-background variant did.
 */

export function MioLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="275 106 250 264" className={className} role="img" aria-label="mio">
      <defs>
        <linearGradient id="mio-band1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFBD4A" />
          <stop offset="100%" stopColor="#FFA033" />
        </linearGradient>
        <linearGradient id="mio-band2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FF7A29" />
          <stop offset="100%" stopColor="#FF5E1A" />
        </linearGradient>
        <linearGradient id="mio-band3" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#E63B19" />
          <stop offset="100%" stopColor="#D02B13" />
        </linearGradient>
        <linearGradient id="mio-band4" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#B31910" />
          <stop offset="100%" stopColor="#8C0F0A" />
        </linearGradient>
        <mask id="mio-band1-mask">
          <rect x="0" y="0" width="800" height="225" fill="#ffffff" />
        </mask>
        <mask id="mio-band2-mask">
          <rect x="0" y="225" width="800" height="55" fill="#ffffff" />
        </mask>
        <mask id="mio-band3-mask">
          <rect x="0" y="280" width="800" height="55" fill="#ffffff" />
        </mask>
        <mask id="mio-band4-mask">
          <rect x="0" y="335" width="800" height="165" fill="#ffffff" />
        </mask>
      </defs>

      <path
        d="M 310,360 C 295,360 285,345 292,325 L 320,240 C 325,225 338,220 348,228 L 370,245 C 382,242 400,225 425,185 C 440,160 458,135 470,122 C 475,116 485,118 488,125 L 512,230 C 515,242 505,252 492,248 L 460,238 C 440,265 425,290 415,310 L 402,335 C 395,350 382,360 365,360 C 350,360 340,348 345,330 L 355,295 C 350,290 342,288 335,292 L 325,325 C 320,345 315,360 310,360 Z M 470,122 L 360,180 C 350,185 345,178 352,170 L 470,122 Z"
        fill="url(#mio-band1)"
        mask="url(#mio-band1-mask)"
      />
      <path
        d="M 310,360 C 295,360 285,345 292,325 L 320,240 C 325,225 338,220 348,228 L 370,245 C 382,242 400,225 425,185 C 440,160 458,135 470,122 C 475,116 485,118 488,125 L 512,230 C 515,242 505,252 492,248 L 460,238 C 440,265 425,290 415,310 L 402,335 C 395,350 382,360 365,360 C 350,360 340,348 345,330 L 355,295 C 350,290 342,288 335,292 L 325,325 C 320,345 315,360 310,360 Z"
        fill="url(#mio-band2)"
        mask="url(#mio-band2-mask)"
      />
      <path
        d="M 310,360 C 295,360 285,345 292,325 L 320,240 C 325,225 338,220 348,228 L 370,245 C 382,242 400,225 425,185 C 440,160 458,135 470,122 C 475,116 485,118 488,125 L 512,230 C 515,242 505,252 492,248 L 460,238 C 440,265 425,290 415,310 L 402,335 C 395,350 382,360 365,360 C 350,360 340,348 345,330 L 355,295 C 350,290 342,288 335,292 L 325,325 C 320,345 315,360 310,360 Z"
        fill="url(#mio-band3)"
        mask="url(#mio-band3-mask)"
      />
      <path
        d="M 310,360 C 295,360 285,345 292,325 L 320,240 C 325,225 338,220 348,228 L 370,245 C 382,242 400,225 425,185 C 440,160 458,135 470,122 C 475,116 485,118 488,125 L 512,230 C 515,242 505,252 492,248 L 460,238 C 440,265 425,290 415,310 L 402,335 C 395,350 382,360 365,360 C 350,360 340,348 345,330 L 355,295 C 350,290 342,288 335,292 L 325,325 C 320,345 315,360 310,360 Z"
        fill="url(#mio-band4)"
        mask="url(#mio-band4-mask)"
      />
    </svg>
  )
}
