/**
 * # env
 *
 * `defaultApiUrl` points at this instance's Portal API (`PORTAL_BIND_ADDR`,
 * `http://localhost:8090` for docker-compose's `engine-a`) — the auth
 * forms use it directly and no longer expose it as an editable field;
 * override it at build time via `VITE_API_URL` if you deploy against a
 * different instance.
 */
export const env = {
  defaultApiUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8090',
  appName: (import.meta.env.VITE_APP_NAME as string | undefined) ?? 'mio',
  /** Which engine deployment this build talks to — shown in `WorkspaceBanner` since the API URL itself is no longer visible in the auth forms. */
  appEnv: (import.meta.env.VITE_APP_ENV as string | undefined) ?? 'development',
} as const
