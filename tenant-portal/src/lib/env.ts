/**
 * # env
 *
 * `defaultApiUrl` points at one engine instance's Portal API
 * (`PORTAL_BIND_ADDR`, e.g. `http://localhost:8090` for docker-compose's
 * `engine-a`) — just a default for the register/login forms, not fixed:
 * see `portalAuth.store.ts`.
 */
export const env = {
  defaultApiUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8090',
  appName: (import.meta.env.VITE_APP_NAME as string | undefined) ?? 'Realtime Portal',
} as const
