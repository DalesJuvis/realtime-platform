/**
 * # useTranslation
 *
 * `const { t } = useTranslation()` — `t` is the whole merged dictionary
 * for the current language (`t.overview.title`, `t.common.save`, ...),
 * not a `t('key')` string-lookup function: direct property access gets
 * full autocomplete and a compile error on a typo'd/missing key, which a
 * string-keyed lookup can't give you for free. An entry that needs a
 * dynamic value is a function (`t.common.copied('Template ID')`), not a
 * template string with placeholders — same reasoning, no runtime
 * interpolation engine needed for two languages.
 *
 * Reactive: reads `language` off `usePreferencesStore`, so every
 * consumer re-renders on a language switch with no reload.
 */
import { usePreferencesStore } from '@store/preferences.store'
import { en } from './en'
import { fr } from './fr'

const dictionaries = { en, fr }

export function useTranslation() {
  const language = usePreferencesStore((s) => s.language)
  return { t: dictionaries[language], language }
}
