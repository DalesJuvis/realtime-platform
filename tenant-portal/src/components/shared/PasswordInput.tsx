/**
 * # PasswordInput
 *
 * A plain `Input` with a show/hide toggle — masked by default, revealed
 * as plain text on click. `type`/`className` aren't accepted: this always
 * renders a password field, and the toggle button needs the padding it
 * reserves on the right.
 */

import { forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input, type InputProps } from '@components/ui/input'
import { useTranslation } from '@lib/i18n'

type PasswordInputProps = Omit<InputProps, 'type' | 'className'>

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>((props, ref) => {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input ref={ref} type={visible ? 'text' : 'password'} className="pr-9" {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={visible ? t.auth.hidePassword : t.auth.showPassword}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
})
PasswordInput.displayName = 'PasswordInput'
