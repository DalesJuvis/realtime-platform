/**
 * # env
 *
 * Typed access to Vite environment variables. All of these are optional
 * defaults for the connect form (docker-compose's engine-a) — the user can
 * always override them there, so nothing here is required at startup.
 */

export const env = {
  defaultWsUrl: (import.meta.env.VITE_DEFAULT_WS_URL as string | undefined) ?? 'ws://localhost:8080/ws',
  defaultTenantId:
    (import.meta.env.VITE_DEFAULT_TENANT_ID as string | undefined) ?? '00000000-0000-0000-0000-000000000001',
  appName: (import.meta.env.VITE_APP_NAME as string | undefined) ?? 'Realtime Chat',
} as const
