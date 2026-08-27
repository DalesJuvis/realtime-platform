/**
 * # WorkspaceProfileEntity
 *
 * Mirrors `ProfileResponseDto` from `modules::portal` — a tenant's
 * optional display profile (name/website/logo), purely cosmetic.
 */
export interface WorkspaceProfile {
  readonly name: string | null
  readonly website_url: string | null
  readonly logo_data_uri: string | null
}
