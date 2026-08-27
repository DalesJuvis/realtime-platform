/**
 * # TemplateEntity
 *
 * Mirrors `TemplateResponseDto` from `modules::portal`. `{{variable}}`
 * placeholders inside `body` are a frontend-only convention — the backend
 * stores/returns it as opaque text.
 */
export interface Template {
  readonly id: string
  readonly name: string
  readonly body: string
  readonly created_at: string
  readonly updated_at: string
}
