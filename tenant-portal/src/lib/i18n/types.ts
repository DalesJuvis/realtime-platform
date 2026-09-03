/** Kept dependency-free (no import of the store or the dictionaries) so
 * `preferences.store.ts` can import just this type without any risk of a
 * circular module reference back through `useTranslation.ts`. */
export type Language = 'en' | 'fr'
