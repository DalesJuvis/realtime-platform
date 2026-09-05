/**
 * # GoogleButton
 *
 * Disabled placeholder — Google sign-in needs a real Google Cloud OAuth
 * client (Client ID/Secret) and a backend callback route, neither of
 * which exist yet. Shown so the intended sign-in surface is visible, per
 * "google (later), email/password (first)".
 */

import { Button } from '@components/ui/button'
import { useTranslation } from '@lib/i18n'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l3.99-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l3.99 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  )
}

export function GoogleButton() {
  const { t } = useTranslation()
  return (
    <Button type="button" variant="outline" className="h-auto w-full py-3" disabled title={t.auth.comingSoon}>
      <GoogleIcon />
      {t.auth.continueWithGoogle}
      <span className="ml-auto text-xs text-muted-foreground">{t.auth.soon}</span>
    </Button>
  )
}
