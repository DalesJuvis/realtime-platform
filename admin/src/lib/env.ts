/**
 * # env
 *
 * Typed access to Vite environment variables. `apiUrl` is only a *default*
 * for the connect form — this app talks to one engine instance's Admin API
 * (`ADMIN_BIND_ADDR`, e.g. `http://localhost:9090` for docker-compose's
 * `engine-a`) at a time, chosen by the user and stored in `adminAuth.store`,
 * since a real deployment may run several instances with independent,
 * unshared tenant registries.
 */

export const env = {
  defaultApiUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:9090',
  appName: (import.meta.env.VITE_APP_NAME as string | undefined) ?? 'Realtime Admin',
  appEnv: (import.meta.env.VITE_APP_ENV as string | undefined) ?? 'development',
} as const
