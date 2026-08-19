# frontend.md — Frontend Architecture & Standards

> Applies to all React-based frontends in the stack.
> Tech: **React 18+**, **react-router-dom v6+**, **TailwindCSS v3+**, **shadcn/ui**,
> **Zustand**, **localStorage**, **IndexedDB**.
> All components are **modulable**, **scalable**, and **fully typed** (TypeScript strict mode).

---

## 1. Core Philosophy

- **One file = One responsibility.** A component renders. An action handles async logic. A store holds state. A hook composes them.
- **Fully typed.** No `any`. No implicit `unknown`. Every entity, DTO, store slice, and action has an explicit TypeScript type.
- **Actions in `.ts` files.** All async operations (API calls, storage reads/writes) live in dedicated action files — never inline in components or hooks.
- **Hooks as the composition layer.** Hooks wire actions + stores + local state together and expose a clean API to components.
- **Components are dumb by default.** A component receives props, renders UI, and delegates logic to hooks. It never calls `fetch`, reads from storage, or mutates global state directly.
- **Scalable module boundaries.** Each feature is a self-contained folder. Nothing leaks outside its module unless explicitly exported from `index.ts`.

---

## 2. TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@entities/*": ["src/entities/*"],
      "@modules/*": ["src/modules/*"],
      "@store/*": ["src/store/*"],
      "@hooks/*": ["src/hooks/*"],
      "@actions/*": ["src/actions/*"],
      "@lib/*": ["src/lib/*"],
      "@components/*": ["src/components/*"]
    }
  }
}
```

**Rules:**
- `strict: true` is non-negotiable — never disable strict mode.
- `noUncheckedIndexedAccess: true` — array/object indexing always returns `T | undefined`.
- `exactOptionalPropertyTypes: true` — `undefined` must be explicit, never implied by `?`.
- All imports use path aliases (`@/`, `@modules/`, etc.) — no relative `../../` beyond one level.

---

## 3. Entities — Full Type Definitions

All domain entities live in `src/entities/`. Each entity has its own file.
Entities are **pure TypeScript types** — no classes, no methods, no side effects.

### 3.1 File Naming

```
src/entities/
├── User.entity.ts
├── Order.entity.ts
├── Product.entity.ts
├── Auth.entity.ts
├── Notification.entity.ts
├── File.entity.ts
└── index.ts          ← re-exports all entities
```

### 3.2 Entity Rules

- Every entity type has a top-level JSDoc comment describing its purpose and origin.
- All IDs are `string` (UUID format) — never `number`.
- All dates are `string` (ISO 8601) — never `Date` object (serialization safety).
- Nullable fields are `field: T | null` — never `field?: T` when the field always exists but can be null.
- Optional fields (may be absent from API) are `field?: T`.
- Discriminated unions for variant types (e.g., different notification channel shapes).

### 3.3 Entity Examples

```ts
// src/entities/User.entity.ts

/**
 * # UserEntity
 *
 * Represents a fully authenticated user returned from the backend.
 * Source: GET /api/v1/external/users/profile
 * Related: RoleEntity, OrganizationEntity
 */

export type UserId = string & { readonly _brand: 'UserId' }
export type OrganizationId = string & { readonly _brand: 'OrganizationId' }

export type UserRole = 'super_admin' | 'admin' | 'moderator' | 'user' | 'guest'

export type UserStatus = 'active' | 'suspended' | 'pending_verification' | 'deleted'

export interface UserEntity {
  readonly id: UserId
  readonly email: string
  readonly fullName: string
  readonly avatarUrl: string | null
  readonly role: UserRole
  readonly status: UserStatus
  readonly organizationId: OrganizationId | null
  readonly twoFactorEnabled: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

/** Lightweight variant used in lists — avoids over-fetching */
export interface UserSummary {
  readonly id: UserId
  readonly email: string
  readonly fullName: string
  readonly avatarUrl: string | null
  readonly role: UserRole
}
```

```ts
// src/entities/Auth.entity.ts

/**
 * # AuthEntity
 *
 * Token pair returned on login, register, refresh, and OAuth callback.
 * Source: POST /api/v1/external/auth/login
 */
export interface TokenPair {
  readonly accessToken: string
  readonly refreshToken: string
  readonly tokenType: 'Bearer'
  readonly expiresIn: number       // seconds
  readonly scope: string[]
}

export interface AuthSession {
  readonly tokenPair: TokenPair
  readonly user: UserEntity
  readonly expiresAt: string       // ISO 8601 — derived from expiresIn at login time
}

export type TwoFactorMethod = 'totp' | 'sms' | 'whatsapp' | 'email' | 'backup'

export interface TwoFactorChallenge {
  readonly requiresTwoFactor: true
  readonly challengeToken: string
  readonly availableMethods: TwoFactorMethod[]
}

export type LoginResult = AuthSession | TwoFactorChallenge
```

```ts
// src/entities/Order.entity.ts

/**
 * # OrderEntity
 *
 * Full order with items, status, and totals.
 * Source: GET /api/v1/external/orders/{id}
 */
export type OrderId = string & { readonly _brand: 'OrderId' }
export type ProductId = string & { readonly _brand: 'ProductId' }

export type OrderStatus =
  | 'draft'
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

export interface OrderItem {
  readonly productId: ProductId
  readonly productName: string
  readonly quantity: number
  readonly unitPrice: number
  readonly subtotal: number
}

export interface OrderEntity {
  readonly id: OrderId
  readonly userId: UserId
  readonly status: OrderStatus
  readonly items: OrderItem[]
  readonly totalAmount: number
  readonly currency: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface OrderSummary {
  readonly id: OrderId
  readonly status: OrderStatus
  readonly totalAmount: number
  readonly itemCount: number
  readonly createdAt: string
}
```

```ts
// src/entities/Notification.entity.ts

/**
 * # NotificationEntity
 *
 * Discriminated union covering all notification channel shapes.
 * Source: GET /api/v1/external/notifications
 */
export type NotificationId = string & { readonly _brand: 'NotificationId' }

export type NotificationChannel = 'email' | 'sms' | 'whatsapp' | 'push' | 'in_app'
export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'read'

interface BaseNotification {
  readonly id: NotificationId
  readonly userId: UserId
  readonly status: NotificationStatus
  readonly createdAt: string
}

export interface EmailNotification extends BaseNotification {
  readonly channel: 'email'
  readonly subject: string
  readonly recipient: string
}

export interface SmsNotification extends BaseNotification {
  readonly channel: 'sms'
  readonly recipient: string   // E.164
}

export interface PushNotification extends BaseNotification {
  readonly channel: 'push'
  readonly title: string
  readonly body: string
}

export interface InAppNotification extends BaseNotification {
  readonly channel: 'in_app'
  readonly title: string
  readonly body: string
  readonly actionUrl: string | null
  readonly readAt: string | null
}

export type NotificationEntity =
  | EmailNotification
  | SmsNotification
  | PushNotification
  | InAppNotification
```

```ts
// src/entities/ApiResponse.entity.ts

/**
 * # ApiResponse
 *
 * Universal envelope matching backend response contract (RULES.md §10).
 */
export interface ApiSuccess<T> {
  readonly success: true
  readonly data: T
  readonly traceId?: string
}

export interface ApiError {
  readonly success: false
  readonly error: {
    readonly code: string
    readonly message: string
    readonly traceId?: string
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

export interface PaginatedData<T> {
  readonly items: T[]
  readonly meta: {
    readonly page: number
    readonly perPage: number
    readonly total: number
    readonly totalPages: number
  }
}
```

---

## 4. Actions — Async Logic in `.ts` Files

All API calls, storage reads/writes, and async operations live in **action files**.
Actions are plain async functions — not hooks, not classes.

### 4.1 File Naming & Location

```
src/actions/
├── auth/
│   ├── login.action.ts
│   ├── logout.action.ts
│   ├── register.action.ts
│   ├── refreshToken.action.ts
│   ├── verifyTwoFactor.action.ts
│   └── revokeToken.action.ts
├── users/
│   ├── getProfile.action.ts
│   ├── updateProfile.action.ts
│   └── uploadAvatar.action.ts
├── orders/
│   ├── getOrders.action.ts
│   ├── getOrder.action.ts
│   └── placeOrder.action.ts
├── notifications/
│   └── getNotifications.action.ts
└── index.ts
```

### 4.2 Action Rules

- One file = one async operation. `getOrders.action.ts` fetches orders. `placeOrder.action.ts` places orders. Two files.
- Actions receive a typed input DTO and return a typed output — never `any`.
- Actions throw typed `AppError` on failure — never return `null` or `undefined` to signal errors.
- Actions never access Zustand stores directly — they receive data as parameters.
- Actions never manipulate DOM or React state — they are pure async functions.
- HTTP client is always imported from `@lib/http` — never raw `fetch` in action files.

### 4.3 Action File Template

```ts
// src/actions/auth/login.action.ts

/**
 * # loginAction
 *
 * Action:  Authenticates user credentials against the backend.
 * Input:   LoginDto
 * Output:  LoginResult (AuthSession or TwoFactorChallenge)
 * Throws:  AppError('INVALID_CREDENTIALS') | AppError('ACCOUNT_LOCKED')
 * Endpoint: POST /api/v1/external/auth/login
 */

import { http } from '@lib/http'
import type { LoginResult } from '@entities/Auth.entity'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import { AppError } from '@lib/errors'

export interface LoginDto {
  readonly email: string
  readonly password: string
}

export async function loginAction(dto: LoginDto): Promise<LoginResult> {
  const response = await http.post<ApiResponse<LoginResult>>(
    '/api/v1/external/auth/login',
    dto
  )

  if (!response.data.success) {
    throw new AppError(response.data.error.code, response.data.error.message)
  }

  return response.data.data
}
```

```ts
// src/actions/orders/placeOrder.action.ts

/**
 * # placeOrderAction
 *
 * Action:  Submits a new order via the RPC-backed endpoint.
 * Input:   PlaceOrderDto
 * Output:  OrderEntity
 * Throws:  AppError('INSUFFICIENT_STOCK') | AppError('ORDER_EMPTY')
 * Endpoint: POST /api/v1/rpc/orders/place
 */

import { http } from '@lib/http'
import type { OrderEntity } from '@entities/Order.entity'
import type { ApiResponse } from '@entities/ApiResponse.entity'
import { AppError } from '@lib/errors'

export interface OrderItemDto {
  readonly productId: string
  readonly quantity: number
  readonly unitPrice: number
}

export interface PlaceOrderDto {
  readonly items: OrderItemDto[]
}

export async function placeOrderAction(dto: PlaceOrderDto): Promise<OrderEntity> {
  const response = await http.post<ApiResponse<OrderEntity>>(
    '/api/v1/rpc/orders/place',
    { params: dto }
  )

  if (!response.data.success) {
    throw new AppError(response.data.error.code, response.data.error.message)
  }

  return response.data.data
}
```

### 4.4 HTTP Client (`@lib/http`)

```ts
// src/lib/http.ts

/**
 * # http
 *
 * Action:  Configured Axios instance with auth interceptors, trace ID injection,
 *          and automatic token refresh on 401.
 * Side effects: Reads access token from AuthStore; triggers token refresh on expiry.
 */

import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import { useAuthStore } from '@store/auth.store'
import { AppError } from '@lib/errors'

export const http: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
})

// Inject auth token + trace ID
http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  const traceId = crypto.randomUUID()

  if (token) config.headers['Authorization'] = `Bearer ${token}`
  config.headers['X-Trace-ID'] = traceId

  return config
})

// Handle 401 → refresh token → retry once
http.interceptors.response.use(
  (res: AxiosResponse) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        await useAuthStore.getState().refresh()
        const token = useAuthStore.getState().accessToken
        original.headers['Authorization'] = `Bearer ${token}`
        return http(original)
      } catch {
        useAuthStore.getState().logout()
        throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please log in again.')
      }
    }
    throw error
  }
)
```

### 4.5 Error Types (`@lib/errors`)

```ts
// src/lib/errors.ts

/**
 * # AppError
 *
 * Typed application error propagated from action files.
 * Maps backend error codes to frontend error handling.
 */

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly traceId?: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export type AppErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'SESSION_EXPIRED'
  | 'INSUFFICIENT_STOCK'
  | 'ORDER_EMPTY'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR'
```

---

## 5. Zustand Stores

All global client state lives in **Zustand stores** under `src/store/`.
Each domain has its own store file — stores never import from each other.

### 5.1 File Naming

```
src/store/
├── auth.store.ts
├── user.store.ts
├── orders.store.ts
├── notifications.store.ts
├── ui.store.ts           ← toasts, modals, loading states
└── index.ts
```

### 5.2 Store Rules

- One store per domain — never a single global monolithic store.
- Store state is **fully typed** — the state interface and action signatures are explicit.
- Stores expose **actions as methods** on the store object — never mutate state from outside.
- Stores never call the backend directly — they call **action files** and update state with results.
- Derived/computed values use `zustand/middleware` `subscribeWithSelector` or plain getters.
- Persist middleware is used only for state that **must** survive page refresh (auth tokens, preferences).

### 5.3 Store Template

```ts
// src/store/auth.store.ts

/**
 * # AuthStore
 *
 * Holds authentication session state: tokens, current user, 2FA challenge.
 * Persisted: accessToken, refreshToken (via localStorage through zustand/persist).
 * Actions: login, logout, refresh, verify2fa, setUser
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { AuthSession, TwoFactorChallenge, LoginResult, TwoFactorMethod } from '@entities/Auth.entity'
import type { UserEntity } from '@entities/User.entity'
import { loginAction, type LoginDto } from '@actions/auth/login.action'
import { logoutAction } from '@actions/auth/logout.action'
import { refreshTokenAction } from '@actions/auth/refreshToken.action'
import { verifyTwoFactorAction } from '@actions/auth/verifyTwoFactor.action'

interface AuthState {
  // State
  readonly accessToken: string | null
  readonly refreshToken: string | null
  readonly user: UserEntity | null
  readonly twoFactorChallenge: TwoFactorChallenge | null
  readonly isAuthenticated: boolean
  readonly isLoading: boolean
  readonly error: string | null

  // Actions
  login: (dto: LoginDto) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  verify2fa: (code: string, method: TwoFactorMethod) => Promise<void>
  setUser: (user: UserEntity) => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    immer((set, get) => ({
      // Initial state
      accessToken: null,
      refreshToken: null,
      user: null,
      twoFactorChallenge: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (dto) => {
        set((s) => { s.isLoading = true; s.error = null })
        try {
          const result: LoginResult = await loginAction(dto)

          if ('requiresTwoFactor' in result) {
            set((s) => {
              s.twoFactorChallenge = result
              s.isLoading = false
            })
          } else {
            set((s) => {
              s.accessToken = result.tokenPair.accessToken
              s.refreshToken = result.tokenPair.refreshToken
              s.user = result.user
              s.isAuthenticated = true
              s.twoFactorChallenge = null
              s.isLoading = false
            })
          }
        } catch (err) {
          set((s) => {
            s.error = err instanceof Error ? err.message : 'Login failed'
            s.isLoading = false
          })
        }
      },

      logout: async () => {
        try {
          const token = get().refreshToken
          if (token) await logoutAction({ refreshToken: token })
        } finally {
          set((s) => {
            s.accessToken = null
            s.refreshToken = null
            s.user = null
            s.isAuthenticated = false
            s.twoFactorChallenge = null
          })
        }
      },

      refresh: async () => {
        const token = get().refreshToken
        if (!token) throw new Error('No refresh token')
        const result = await refreshTokenAction({ refreshToken: token })
        set((s) => {
          s.accessToken = result.accessToken
          s.refreshToken = result.refreshToken
        })
      },

      verify2fa: async (code, method) => {
        const challenge = get().twoFactorChallenge
        if (!challenge) throw new Error('No active 2FA challenge')
        set((s) => { s.isLoading = true })
        try {
          const session = await verifyTwoFactorAction({
            challengeToken: challenge.challengeToken,
            code,
            method,
          })
          set((s) => {
            s.accessToken = session.tokenPair.accessToken
            s.refreshToken = session.tokenPair.refreshToken
            s.user = session.user
            s.isAuthenticated = true
            s.twoFactorChallenge = null
            s.isLoading = false
          })
        } catch (err) {
          set((s) => {
            s.error = err instanceof Error ? err.message : '2FA verification failed'
            s.isLoading = false
          })
        }
      },

      setUser: (user) => set((s) => { s.user = user }),
      clearError: () => set((s) => { s.error = null }),
    })),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({         // only persist tokens — not loading/error state
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
```

```ts
// src/store/ui.store.ts

/**
 * # UiStore
 *
 * Manages global UI state: toasts, modal visibility, sidebar, theme.
 * Not persisted — resets on page load.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  readonly id: string
  readonly variant: ToastVariant
  readonly title: string
  readonly description?: string
  readonly duration?: number
}

interface UiState {
  readonly toasts: Toast[]
  readonly activeModal: string | null
  readonly sidebarOpen: boolean
  readonly theme: 'light' | 'dark' | 'system'

  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  openModal: (modalId: string) => void
  closeModal: () => void
  toggleSidebar: () => void
  setTheme: (theme: UiState['theme']) => void
}

export const useUiStore = create<UiState>()(
  immer((set) => ({
    toasts: [],
    activeModal: null,
    sidebarOpen: true,
    theme: 'system',

    addToast: (toast) => set((s) => {
      s.toasts.push({ ...toast, id: crypto.randomUUID() })
    }),
    removeToast: (id) => set((s) => {
      s.toasts = s.toasts.filter((t) => t.id !== id)
    }),
    openModal: (modalId) => set((s) => { s.activeModal = modalId }),
    closeModal: () => set((s) => { s.activeModal = null }),
    toggleSidebar: () => set((s) => { s.sidebarOpen = !s.sidebarOpen }),
    setTheme: (theme) => set((s) => { s.theme = theme }),
  }))
)
```

---

## 6. Hooks — Composition Layer

Hooks wire actions + stores + local state together and expose a clean API to components.
A hook **never** contains raw `fetch`, direct DOM manipulation, or inline business logic.

### 6.1 File Naming

```
src/hooks/
├── auth/
│   ├── useLogin.ts
│   ├── useLogout.ts
│   ├── useCurrentUser.ts
│   └── useTwoFactor.ts
├── orders/
│   ├── useOrders.ts
│   ├── useOrder.ts
│   └── usePlaceOrder.ts
├── notifications/
│   └── useNotifications.ts
├── storage/
│   ├── useLocalStorage.ts
│   └── useIndexedDb.ts
└── ui/
    ├── useToast.ts
    ├── useModal.ts
    └── useTheme.ts
```

### 6.2 Hook Rules

- One hook per concern — `useLogin` handles login only.
- Hooks always return a **typed object** — never positional tuples (except `useState`-style).
- Hooks expose: `data`, `isLoading`, `error`, and the relevant action functions.
- Hooks use `useCallback` on all returned functions to prevent re-render cascades.
- Hooks that fetch data use `useEffect` with a dependency array — never fire blind effects.

### 6.3 Hook Examples

```ts
// src/hooks/auth/useLogin.ts

/**
 * # useLogin
 *
 * Composes loginAction + AuthStore to provide a typed login flow to components.
 * Returns: { login, isLoading, error, requiresTwoFactor, clearError }
 */

import { useCallback } from 'react'
import { useAuthStore } from '@store/auth.store'
import type { LoginDto } from '@actions/auth/login.action'

export interface UseLoginReturn {
  login: (dto: LoginDto) => Promise<void>
  isLoading: boolean
  error: string | null
  requiresTwoFactor: boolean
  clearError: () => void
}

export function useLogin(): UseLoginReturn {
  const login = useAuthStore((s) => s.login)
  const isLoading = useAuthStore((s) => s.isLoading)
  const error = useAuthStore((s) => s.error)
  const requiresTwoFactor = useAuthStore((s) => s.twoFactorChallenge !== null)
  const clearError = useAuthStore((s) => s.clearError)

  const handleLogin = useCallback(
    async (dto: LoginDto) => { await login(dto) },
    [login]
  )

  return { login: handleLogin, isLoading, error, requiresTwoFactor, clearError }
}
```

```ts
// src/hooks/orders/usePlaceOrder.ts

/**
 * # usePlaceOrder
 *
 * Exposes placeOrder action with loading, error, and success state.
 * On success: adds a success toast via UiStore.
 * Returns: { placeOrder, isLoading, error, lastOrder }
 */

import { useState, useCallback } from 'react'
import { placeOrderAction, type PlaceOrderDto } from '@actions/orders/placeOrder.action'
import { useUiStore } from '@store/ui.store'
import type { OrderEntity } from '@entities/Order.entity'
import { AppError } from '@lib/errors'

interface UsePlaceOrderReturn {
  placeOrder: (dto: PlaceOrderDto) => Promise<OrderEntity | null>
  isLoading: boolean
  error: string | null
  lastOrder: OrderEntity | null
}

export function usePlaceOrder(): UsePlaceOrderReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastOrder, setLastOrder] = useState<OrderEntity | null>(null)
  const addToast = useUiStore((s) => s.addToast)

  const placeOrder = useCallback(async (dto: PlaceOrderDto): Promise<OrderEntity | null> => {
    setIsLoading(true)
    setError(null)
    try {
      const order = await placeOrderAction(dto)
      setLastOrder(order)
      addToast({ variant: 'success', title: 'Order placed!', description: `Order #${order.id} confirmed.` })
      return order
    } catch (err) {
      const message = err instanceof AppError ? err.message : 'Failed to place order.'
      setError(message)
      addToast({ variant: 'error', title: 'Order failed', description: message })
      return null
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  return { placeOrder, isLoading, error, lastOrder }
}
```

---

## 7. localStorage — Typed Wrapper

`localStorage` is accessed **only** through a typed hook and a typed service.
Never call `localStorage.getItem` raw in a component or store.

### 7.1 `useLocalStorage` Hook

```ts
// src/hooks/storage/useLocalStorage.ts

/**
 * # useLocalStorage
 *
 * Type-safe hook for reading and writing a single localStorage key.
 * Handles JSON serialization, SSR safety, and parse errors.
 * Input:  key (LocalStorageKey), defaultValue (T)
 * Output: [value, setValue, removeValue]
 */

import { useState, useCallback } from 'react'
import type { LocalStorageKey, LocalStorageSchema } from '@lib/storage/localStorage.schema'

export function useLocalStorage<K extends LocalStorageKey>(
  key: K,
  defaultValue: LocalStorageSchema[K]
): [
  LocalStorageSchema[K],
  (value: LocalStorageSchema[K]) => void,
  () => void
] {
  const [stored, setStored] = useState<LocalStorageSchema[K]>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? (JSON.parse(item) as LocalStorageSchema[K]) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const setValue = useCallback((value: LocalStorageSchema[K]) => {
    try {
      setStored(value)
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch (err) {
      console.error(`[localStorage] Failed to write key "${key}"`, err)
    }
  }, [key])

  const removeValue = useCallback(() => {
    try {
      setStored(defaultValue)
      window.localStorage.removeItem(key)
    } catch (err) {
      console.error(`[localStorage] Failed to remove key "${key}"`, err)
    }
  }, [key, defaultValue])

  return [stored, setValue, removeValue]
}
```

### 7.2 localStorage Schema (typed keys)

```ts
// src/lib/storage/localStorage.schema.ts

/**
 * # LocalStorageSchema
 *
 * Defines ALL keys and their value types stored in localStorage.
 * Any key not in this schema cannot be used via useLocalStorage.
 */

export interface LocalStorageSchema {
  'auth-storage':       AuthStorageSnapshot      // managed by Zustand persist
  'user-preferences':   UserPreferences
  'ui-theme':           'light' | 'dark' | 'system'
  'ui-sidebar-open':    boolean
  'draft-order':        DraftOrder | null
  'recent-searches':    string[]
  'locale':             SupportedLocale
}

export type LocalStorageKey = keyof LocalStorageSchema

export interface UserPreferences {
  readonly emailNotifications: boolean
  readonly smsNotifications: boolean
  readonly language: SupportedLocale
  readonly timezone: string
}

export interface DraftOrder {
  readonly items: Array<{ productId: string; quantity: number }>
  readonly savedAt: string
}

export type SupportedLocale = 'en' | 'fr' | 'es' | 'de' | 'ar'
```

---

## 8. IndexedDB — Typed Service

`IndexedDB` is used for **large or structured offline data** (documents, media metadata, cached API responses, draft content).
All access is through a typed `IndexedDbService` and a `useIndexedDb` hook.

### 8.1 Schema Definition

```ts
// src/lib/storage/indexedDb.schema.ts

/**
 * # IndexedDbSchema
 *
 * Defines all object stores, their key paths, and record types.
 * Never access IndexedDB outside of IndexedDbService.
 */

import type { OrderEntity, OrderSummary } from '@entities/Order.entity'
import type { NotificationEntity } from '@entities/Notification.entity'
import type { UserEntity } from '@entities/User.entity'

export const DB_NAME = 'app-db'
export const DB_VERSION = 1

export interface IndexedDbSchema {
  'cached-orders':        { key: string; value: OrderSummary }
  'cached-notifications': { key: string; value: NotificationEntity }
  'draft-documents':      { key: string; value: DraftDocument }
  'offline-queue':        { key: string; value: OfflineQueueItem }
}

export type IndexedDbStoreName = keyof IndexedDbSchema

export interface DraftDocument {
  readonly id: string
  readonly title: string
  readonly content: string
  readonly updatedAt: string
  readonly synced: boolean
}

export interface OfflineQueueItem {
  readonly id: string
  readonly action: string        // action name (e.g. 'placeOrder')
  readonly payload: unknown
  readonly createdAt: string
  readonly retries: number
}
```

### 8.2 IndexedDB Service

```ts
// src/lib/storage/IndexedDbService.ts

/**
 * # IndexedDbService
 *
 * Action:  Type-safe CRUD operations over IndexedDB object stores.
 * Input:   Store name (IndexedDbStoreName), typed record
 * Output:  Typed record(s) or void
 * Side effects: Reads/writes browser IndexedDB.
 */

import { openDB, type IDBPDatabase } from 'idb'
import { DB_NAME, DB_VERSION, type IndexedDbSchema, type IndexedDbStoreName } from './indexedDb.schema'

class IndexedDbService {
  private db: IDBPDatabase<IndexedDbSchema> | null = null

  async init(): Promise<void> {
    this.db = await openDB<IndexedDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('cached-orders'))
          db.createObjectStore('cached-orders', { keyPath: 'id' })

        if (!db.objectStoreNames.contains('cached-notifications'))
          db.createObjectStore('cached-notifications', { keyPath: 'id' })

        if (!db.objectStoreNames.contains('draft-documents'))
          db.createObjectStore('draft-documents', { keyPath: 'id' })

        if (!db.objectStoreNames.contains('offline-queue'))
          db.createObjectStore('offline-queue', { keyPath: 'id' })
      },
    })
  }

  private getDb(): IDBPDatabase<IndexedDbSchema> {
    if (!this.db) throw new Error('IndexedDB not initialized. Call init() first.')
    return this.db
  }

  async get<S extends IndexedDbStoreName>(
    store: S,
    key: string
  ): Promise<IndexedDbSchema[S]['value'] | undefined> {
    return this.getDb().get(store, key)
  }

  async getAll<S extends IndexedDbStoreName>(
    store: S
  ): Promise<IndexedDbSchema[S]['value'][]> {
    return this.getDb().getAll(store)
  }

  async put<S extends IndexedDbStoreName>(
    store: S,
    value: IndexedDbSchema[S]['value']
  ): Promise<void> {
    await this.getDb().put(store, value)
  }

  async delete<S extends IndexedDbStoreName>(
    store: S,
    key: string
  ): Promise<void> {
    await this.getDb().delete(store, key)
  }

  async clear<S extends IndexedDbStoreName>(store: S): Promise<void> {
    await this.getDb().clear(store)
  }
}

export const indexedDbService = new IndexedDbService()
```

### 8.3 `useIndexedDb` Hook

```ts
// src/hooks/storage/useIndexedDb.ts

/**
 * # useIndexedDb
 *
 * Type-safe hook for reading and writing a single IndexedDB object store.
 * Initializes DB on first use; exposes get, put, delete, getAll.
 */

import { useCallback } from 'react'
import { indexedDbService } from '@lib/storage/IndexedDbService'
import type { IndexedDbStoreName, IndexedDbSchema } from '@lib/storage/indexedDb.schema'

export function useIndexedDb<S extends IndexedDbStoreName>(store: S) {
  const get = useCallback(
    async (key: string): Promise<IndexedDbSchema[S]['value'] | undefined> => {
      await indexedDbService.init()
      return indexedDbService.get(store, key)
    },
    [store]
  )

  const getAll = useCallback(
    async (): Promise<IndexedDbSchema[S]['value'][]> => {
      await indexedDbService.init()
      return indexedDbService.getAll(store)
    },
    [store]
  )

  const put = useCallback(
    async (value: IndexedDbSchema[S]['value']): Promise<void> => {
      await indexedDbService.init()
      return indexedDbService.put(store, value)
    },
    [store]
  )

  const remove = useCallback(
    async (key: string): Promise<void> => {
      await indexedDbService.init()
      return indexedDbService.delete(store, key)
    },
    [store]
  )

  const clear = useCallback(async (): Promise<void> => {
    await indexedDbService.init()
    return indexedDbService.clear(store)
  }, [store])

  return { get, getAll, put, remove, clear }
}
```

---

## 9. React Router DOM — Route Structure

All routing is defined in `src/router/` with typed route params and lazy-loaded pages.

### 9.1 Route Structure

```ts
// src/router/index.tsx

/**
 * # Router
 *
 * Defines all application routes with:
 * - Lazy-loaded page components
 * - Auth guards via ProtectedRoute
 * - Role guards via RoleRoute
 * - Segment-based layout nesting
 */

import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { ProtectedRoute } from './guards/ProtectedRoute'
import { RoleRoute } from './guards/RoleRoute'
import { AppLayout } from '@components/layouts/AppLayout'
import { AuthLayout } from '@components/layouts/AuthLayout'
import { AdminLayout } from '@components/layouts/AdminLayout'
import { PageLoader } from '@components/ui/PageLoader'

const LoginPage         = lazy(() => import('@modules/auth/pages/LoginPage'))
const RegisterPage      = lazy(() => import('@modules/auth/pages/RegisterPage'))
const TwoFactorPage     = lazy(() => import('@modules/auth/pages/TwoFactorPage'))
const DashboardPage     = lazy(() => import('@modules/dashboard/pages/DashboardPage'))
const OrdersPage        = lazy(() => import('@modules/orders/pages/OrdersPage'))
const OrderDetailPage   = lazy(() => import('@modules/orders/pages/OrderDetailPage'))
const ProfilePage       = lazy(() => import('@modules/users/pages/ProfilePage'))
const AdminUsersPage    = lazy(() => import('@modules/admin/pages/AdminUsersPage'))
const NotFoundPage      = lazy(() => import('@modules/common/pages/NotFoundPage'))

const withSuspense = (Component: React.LazyExoticComponent<() => JSX.Element>) => (
  <Suspense fallback={<PageLoader />}><Component /></Suspense>
)

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AuthLayout />,
    children: [
      { path: 'login',    element: withSuspense(LoginPage) },
      { path: 'register', element: withSuspense(RegisterPage) },
      { path: '2fa',      element: withSuspense(TwoFactorPage) },
    ],
  },
  {
    path: '/app',
    element: <ProtectedRoute><AppLayout /></ProtectedRoute>,
    children: [
      { index: true,               element: withSuspense(DashboardPage) },
      { path: 'orders',            element: withSuspense(OrdersPage) },
      { path: 'orders/:orderId',   element: withSuspense(OrderDetailPage) },
      { path: 'profile',           element: withSuspense(ProfilePage) },
    ],
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute>
        <RoleRoute roles={['admin', 'super_admin']}>
          <AdminLayout />
        </RoleRoute>
      </ProtectedRoute>
    ),
    children: [
      { path: 'users', element: withSuspense(AdminUsersPage) },
    ],
  },
  { path: '*', element: withSuspense(NotFoundPage) },
])
```

### 9.2 Route Guards

```ts
// src/router/guards/ProtectedRoute.tsx

/**
 * # ProtectedRoute
 *
 * Redirects unauthenticated users to /login.
 * Preserves the attempted URL in location state for post-login redirect.
 */

import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@store/auth.store'

interface ProtectedRouteProps { children: React.ReactNode }

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
```

```ts
// src/router/guards/RoleRoute.tsx

/**
 * # RoleRoute
 *
 * Redirects users who lack the required role to /app (forbidden).
 */

import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@store/auth.store'
import type { UserRole } from '@entities/User.entity'

interface RoleRouteProps {
  roles: UserRole[]
  children: React.ReactNode
}

export function RoleRoute({ roles, children }: RoleRouteProps) {
  const userRole = useAuthStore((s) => s.user?.role)

  if (!userRole || !roles.includes(userRole)) {
    return <Navigate to="/app" replace />
  }

  return <>{children}</>
}
```

### 9.3 Typed Route Params

```ts
// src/router/params.ts

/**
 * # Route Params
 *
 * Typed wrappers for useParams() — never use raw string keys.
 */

import { useParams } from 'react-router-dom'
import type { OrderId } from '@entities/Order.entity'

export function useOrderParams(): { orderId: OrderId } {
  const { orderId } = useParams<{ orderId: string }>()
  if (!orderId) throw new Error('orderId param is required')
  return { orderId: orderId as OrderId }
}
```

---

## 10. TailwindCSS — Configuration & Rules

### 10.1 `tailwind.config.ts`

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss'
import { fontFamily } from 'tailwindcss/defaultTheme'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // shadcn/ui CSS variable tokens
        border:      'hsl(var(--border))',
        input:       'hsl(var(--input))',
        ring:        'hsl(var(--ring))',
        background:  'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', ...fontFamily.sans],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config
```

### 10.2 Tailwind Rules

- Use **CSS variables** for all design tokens — never hardcode hex colors in class names.
- Class ordering follows: `layout → sizing → spacing → typography → color → border → effects → state`.
- Use `cn()` (from `@lib/utils`) for **conditional class merging** — never string interpolation.
- Extract repeated class patterns into a Tailwind component or `@apply` in a CSS module — never copy-paste >3 identical class strings.
- Dark mode via `dark:` prefix — never manual theme switching with JS class manipulation.

```ts
// src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

---

## 11. shadcn/ui — Component Rules

### 11.1 Installation & Component Location

```
src/components/ui/         ← shadcn/ui generated components (do not modify directly)
  ├── button.tsx
  ├── card.tsx
  ├── dialog.tsx
  ├── form.tsx
  ├── input.tsx
  ├── select.tsx
  ├── table.tsx
  ├── toast.tsx
  └── ...

src/components/            ← custom app components built on top of shadcn/ui
  ├── layouts/
  │   ├── AppLayout.tsx
  │   ├── AuthLayout.tsx
  │   └── AdminLayout.tsx
  ├── forms/
  │   ├── LoginForm.tsx
  │   └── PlaceOrderForm.tsx
  └── shared/
      ├── UserAvatar.tsx
      ├── StatusBadge.tsx
      └── PageLoader.tsx
```

### 11.2 shadcn/ui Rules

- **Never modify files in `src/components/ui/` directly** — extend via wrapper components.
- All form components use **react-hook-form** + **zod** for validation (shadcn/ui `Form` primitive).
- Custom variants are added via `cva` (class-variance-authority) — never via inline conditional Tailwind.
- shadcn components receive **typed props** — always define a `Props` interface for wrappers.

### 11.3 Custom Component Template

```tsx
// src/components/shared/StatusBadge.tsx

/**
 * # StatusBadge
 *
 * Displays a colored badge for OrderStatus and UserStatus values.
 * Input:  status (OrderStatus | UserStatus), size? ('sm' | 'md')
 * Output: Rendered badge with correct Tailwind variant
 */

import { cn } from '@lib/utils'
import type { OrderStatus } from '@entities/Order.entity'
import type { UserStatus } from '@entities/User.entity'
import { cva, type VariantProps } from 'class-variance-authority'

const badge = cva(
  'inline-flex items-center rounded-full font-medium ring-1 ring-inset',
  {
    variants: {
      variant: {
        active:    'bg-green-50  text-green-700  ring-green-600/20  dark:bg-green-900/20  dark:text-green-400',
        pending:   'bg-yellow-50 text-yellow-700 ring-yellow-600/20 dark:bg-yellow-900/20 dark:text-yellow-400',
        cancelled: 'bg-red-50    text-red-700    ring-red-600/20    dark:bg-red-900/20    dark:text-red-400',
        default:   'bg-gray-50   text-gray-700   ring-gray-600/20   dark:bg-gray-900/20   dark:text-gray-400',
      },
      size: {
        sm: 'px-2   py-0.5 text-xs',
        md: 'px-2.5 py-1   text-sm',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
)

type Status = OrderStatus | UserStatus

const statusVariantMap: Record<Status, VariantProps<typeof badge>['variant']> = {
  active:               'active',
  confirmed:            'active',
  delivered:            'active',
  pending:              'pending',
  pending_verification: 'pending',
  processing:           'pending',
  shipped:              'pending',
  draft:                'default',
  cancelled:            'cancelled',
  refunded:             'cancelled',
  suspended:            'cancelled',
  deleted:              'cancelled',
}

interface StatusBadgeProps extends VariantProps<typeof badge> {
  status: Status
  className?: string
}

export function StatusBadge({ status, size, className }: StatusBadgeProps) {
  return (
    <span className={cn(badge({ variant: statusVariantMap[status], size }), className)}>
      {status.replace('_', ' ')}
    </span>
  )
}
```

---

## 12. Module Structure

Each feature is a self-contained module. Nothing leaks outside its `index.ts`.

```
src/
├── entities/                  ← §3: all domain types
├── actions/                   ← §4: async operations
├── store/                     ← §5: Zustand stores
├── hooks/                     ← §6: composition hooks
├── lib/
│   ├── http.ts                ← Axios instance
│   ├── errors.ts              ← AppError
│   ├── utils.ts               ← cn(), formatters
│   └── storage/
│       ├── localStorage.schema.ts
│       └── IndexedDbService.ts
├── router/
│   ├── index.tsx
│   ├── params.ts
│   └── guards/
│       ├── ProtectedRoute.tsx
│       └── RoleRoute.tsx
├── components/
│   ├── ui/                    ← shadcn/ui (do not modify)
│   ├── layouts/
│   ├── forms/
│   └── shared/
├── modules/
│   ├── auth/
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   └── TwoFactorPage.tsx
│   │   ├── components/
│   │   │   ├── LoginForm.tsx
│   │   │   └── TwoFactorForm.tsx
│   │   └── index.ts
│   ├── orders/
│   │   ├── pages/
│   │   │   ├── OrdersPage.tsx
│   │   │   └── OrderDetailPage.tsx
│   │   ├── components/
│   │   │   ├── OrderCard.tsx
│   │   │   ├── OrderTable.tsx
│   │   │   └── PlaceOrderForm.tsx
│   │   └── index.ts
│   ├── users/
│   ├── dashboard/
│   ├── admin/
│   └── common/
│       └── pages/
│           └── NotFoundPage.tsx
└── main.tsx
```

---

## 13. Environment Variables

```env
# .env.example
VITE_API_URL=https://api.example.com
VITE_APP_NAME=MyApp
VITE_APP_ENV=development
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

```ts
// src/lib/env.ts

/**
 * # env
 *
 * Typed, validated access to Vite environment variables.
 * Throws at startup if required variables are missing.
 */

function requireEnv(key: string): string {
  const value = import.meta.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

export const env = {
  apiUrl:        requireEnv('VITE_API_URL'),
  appName:       requireEnv('VITE_APP_NAME'),
  appEnv:        import.meta.env.VITE_APP_ENV ?? 'development',
  supabaseUrl:   import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnon:  import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
} as const
```

---

## 14. Testing Requirements

| Layer           | Tool                        | Coverage                     |
|-----------------|-----------------------------|------------------------------|
| Entities        | TypeScript compiler         | 100% (compile-time)          |
| Actions         | Vitest + MSW (API mocking)  | All success + error paths    |
| Stores          | Vitest                      | All actions + state transitions |
| Hooks           | Vitest + React Testing Library | All states (loading/error/success) |
| Components      | React Testing Library       | Interaction + accessibility  |
| Router guards   | Vitest + React Testing Library | Authenticated / unauthenticated |

- Mock Service Worker (`msw`) intercepts API calls in tests — never call real endpoints.
- Each test file mirrors its source: `useLogin.ts` → `useLogin.test.ts`.
- Test files co-locate with source files: `src/hooks/auth/useLogin.test.ts`.
- Snapshot tests are **forbidden** — test behavior, not markup.

---

## 15. Frontend Checklist

Before any component or module is considered production-ready:

- [ ] Entity type defined in `src/entities/` — no inline types in components
- [ ] Action in a `.action.ts` file with typed input/output and `AppError` on failure
- [ ] Hook composes store + action — no raw `fetch` or `localStorage` in components
- [ ] Store slice fully typed with state interface and action signatures
- [ ] `localStorage` access only via `useLocalStorage` with a schema key
- [ ] `IndexedDB` access only via `useIndexedDb` with a typed store name
- [ ] Route params typed via param hooks (`useOrderParams`, etc.)
- [ ] Auth guard applied to all protected routes; role guard for admin routes
- [ ] `cn()` used for all conditional class merging — no string interpolation
- [ ] shadcn/ui components wrapped, never modified directly
- [ ] Dark mode supported via `dark:` Tailwind prefix
- [ ] All components have a JSDoc comment (purpose, input props, output)
- [ ] No `any` — TypeScript strict mode passes with zero errors
- [ ] Tests cover action success + error paths and hook loading/error/success states

---

---

## 16. Shimmer Skeleton Loader System

All loading states use **shimmer skeleton loaders** — never spinners alone.
The shimmer effect mimics the shape of the actual content before it loads, inspired by ElevenLabs' design system aesthetic: dark, minimal, glassmorphic.

### 16.1 Base Shimmer Primitive

```tsx
// src/components/ui/Shimmer.tsx

/**
 * # Shimmer
 *
 * Base animated shimmer block. Used as building block for all skeleton variants.
 * Adapts to light/dark theme via CSS variables.
 * Input:  className? (override width/height/border-radius)
 * Output: Animated shimmer div
 */

import { cn } from '@lib/utils'

interface ShimmerProps {
  className?: string
  rounded?: 'sm' | 'md' | 'lg' | 'full'
}

export function Shimmer({ className, rounded = 'md' }: ShimmerProps) {
  const radiusMap = {
    sm:   'rounded-sm',
    md:   'rounded-md',
    lg:   'rounded-lg',
    full: 'rounded-full',
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-muted',
        radiusMap[rounded],
        className
      )}
      aria-hidden="true"
    >
      {/* Shimmer sweep animation */}
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent dark:via-white/5" />
    </div>
  )
}
```

```css
/* src/styles/animations.css — add to global CSS */
@keyframes shimmer {
  100% { transform: translateX(100%); }
}
```

### 16.2 Skeleton Component Variants

```tsx
// src/components/ui/Skeleton.tsx

/**
 * # Skeleton
 *
 * Composed shimmer skeletons matching real content shapes.
 * Export one named export per content type.
 */

import { Shimmer } from './Shimmer'
import { cn } from '@lib/utils'

/** Single text line */
export function SkeletonText({ className }: { className?: string }) {
  return <Shimmer className={cn('h-4 w-full', className)} />
}

/** Avatar / profile image */
export function SkeletonAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-14 w-14' }
  return <Shimmer className={sizeMap[size]} rounded="full" />
}

/** Card block */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border p-4 space-y-3', className)}>
      <div className="flex items-center gap-3">
        <SkeletonAvatar />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-4 w-1/2" />
          <Shimmer className="h-3 w-1/3" />
        </div>
      </div>
      <Shimmer className="h-3 w-full" />
      <Shimmer className="h-3 w-5/6" />
      <Shimmer className="h-3 w-4/6" />
    </div>
  )
}

/** Table row */
export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Shimmer className="h-4 w-full" />
        </td>
      ))}
    </tr>
  )
}

/** Table skeleton block (n rows) */
export function SkeletonTable({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} cols={cols} />
      ))}
    </>
  )
}

/** Form field */
export function SkeletonField({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <Shimmer className="h-4 w-24" />
      <Shimmer className="h-10 w-full rounded-md" />
    </div>
  )
}

/** Form skeleton block (n fields) */
export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <SkeletonField key={i} />
      ))}
      <Shimmer className="h-10 w-28 rounded-md" />
    </div>
  )
}
```

---

## 17. UI Preferences System

Users control their visual experience via a **Preferences UI section** in Settings.
Preferences are **persisted in `localStorage`** and applied globally via a `PreferencesContext`.

### 17.1 Preference Entity

```ts
// src/entities/Preferences.entity.ts

/**
 * # UserPreferencesEntity
 *
 * Full UI preference state controlled by the user.
 * Persisted to localStorage key 'user-preferences'.
 */

export type OverlayColor =
  | 'black'
  | 'white'
  | 'slate'
  | 'indigo'
  | 'violet'
  | 'zinc'

export type ThemeMode = 'light' | 'dark' | 'system'
export type DisplayMode = 'table' | 'card-grid'
export type SupportedLocale = 'fr' | 'en'

export interface UserPreferencesEntity {
  readonly theme: ThemeMode
  readonly locale: SupportedLocale
  readonly displayMode: DisplayMode
  readonly overlayColor: OverlayColor
  readonly overlayBlur: boolean         // true = blur backdrop; false = plain tinted overlay
  readonly accentColor: string          // hex color chosen from dot picker
}

export const DEFAULT_PREFERENCES: UserPreferencesEntity = {
  theme:        'system',
  locale:       'en',
  displayMode:  'table',
  overlayColor: 'black',
  overlayBlur:  true,
  accentColor:  '#6366f1',              // indigo-500 default
}
```

### 17.2 Preferences Store

```ts
// src/store/preferences.store.ts

/**
 * # PreferencesStore
 *
 * Persisted Zustand store for all UI preferences.
 * Syncs to localStorage key 'user-preferences' automatically.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import {
  DEFAULT_PREFERENCES,
  type UserPreferencesEntity,
  type OverlayColor,
  type ThemeMode,
  type DisplayMode,
  type SupportedLocale,
} from '@entities/Preferences.entity'

interface PreferencesState extends UserPreferencesEntity {
  setTheme:        (theme: ThemeMode)           => void
  setLocale:       (locale: SupportedLocale)    => void
  setDisplayMode:  (mode: DisplayMode)          => void
  setOverlayColor: (color: OverlayColor)        => void
  setOverlayBlur:  (enabled: boolean)           => void
  setAccentColor:  (hex: string)                => void
  reset:           ()                           => void
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    immer((set) => ({
      ...DEFAULT_PREFERENCES,
      setTheme:        (theme)   => set((s) => { s.theme = theme }),
      setLocale:       (locale)  => set((s) => { s.locale = locale }),
      setDisplayMode:  (mode)    => set((s) => { s.displayMode = mode }),
      setOverlayColor: (color)   => set((s) => { s.overlayColor = color }),
      setOverlayBlur:  (enabled) => set((s) => { s.overlayBlur = enabled }),
      setAccentColor:  (hex)     => set((s) => { s.accentColor = hex }),
      reset:           ()        => set(() => ({ ...DEFAULT_PREFERENCES })),
    })),
    {
      name: 'user-preferences',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
```

### 17.3 Preferences Provider — Theme & Accent Injection

```tsx
// src/providers/PreferencesProvider.tsx

/**
 * # PreferencesProvider
 *
 * Reads PreferencesStore and applies:
 * - dark/light/system class on <html>
 * - --accent-color CSS variable on :root
 * - --overlay-color and --overlay-blur for the dialog system
 * Must wrap the entire app inside <RouterProvider>.
 */

import { useEffect } from 'react'
import { usePreferencesStore } from '@store/preferences.store'

const overlayColorMap: Record<string, string> = {
  black:  '0 0 0',
  white:  '255 255 255',
  slate:  '15 23 42',
  indigo: '49 46 129',
  violet: '46 16 101',
  zinc:   '24 24 27',
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { theme, accentColor, overlayColor, overlayBlur } = usePreferencesStore()

  useEffect(() => {
    const root = document.documentElement
    // Theme
    root.classList.remove('light', 'dark')
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.add(prefersDark ? 'dark' : 'light')
    } else {
      root.classList.add(theme)
    }
    // Accent color
    root.style.setProperty('--accent-user', accentColor)
    // Overlay
    root.style.setProperty('--overlay-rgb', overlayColorMap[overlayColor] ?? '0 0 0')
    root.style.setProperty('--overlay-blur', overlayBlur ? '1' : '0')
  }, [theme, accentColor, overlayColor, overlayBlur])

  return <>{children}</>
}
```

### 17.4 Settings Page — Preference UI Section

```tsx
// src/modules/settings/pages/SettingsPage.tsx

/**
 * # SettingsPage — Preference UI Section
 *
 * Renders the full Preference UI section in Settings.
 * All changes are persisted immediately to localStorage via PreferencesStore.
 */

import { usePreferencesStore } from '@store/preferences.store'
import { cn } from '@lib/utils'
import { Switch } from '@components/ui/switch'
import { Label } from '@components/ui/label'
import type {
  OverlayColor, ThemeMode, DisplayMode, SupportedLocale
} from '@entities/Preferences.entity'

const ACCENT_COLORS = [
  { label: 'Indigo',  hex: '#6366f1' },
  { label: 'Violet',  hex: '#8b5cf6' },
  { label: 'Rose',    hex: '#f43f5e' },
  { label: 'Amber',   hex: '#f59e0b' },
  { label: 'Emerald', hex: '#10b981' },
  { label: 'Sky',     hex: '#0ea5e9' },
  { label: 'Zinc',    hex: '#71717a' },
]

const OVERLAY_COLORS: { label: string; value: OverlayColor }[] = [
  { label: 'Black',  value: 'black' },
  { label: 'Slate',  value: 'slate' },
  { label: 'Indigo', value: 'indigo' },
  { label: 'Violet', value: 'violet' },
  { label: 'Zinc',   value: 'zinc' },
]

export default function SettingsPage() {
  const {
    theme, locale, displayMode, overlayColor, overlayBlur, accentColor,
    setTheme, setLocale, setDisplayMode, setOverlayColor, setOverlayBlur, setAccentColor,
    reset,
  } = usePreferencesStore()

  return (
    <div className="max-w-2xl mx-auto space-y-10 py-8 px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      {/* ── Preference UI Section ──────────────────────── */}
      <section aria-labelledby="pref-ui-heading" className="space-y-8">
        <h2 id="pref-ui-heading" className="text-lg font-medium border-b border-border pb-2">
          Preference UI
        </h2>

        {/* Colors (accent dot picker) */}
        <div className="space-y-3">
          <Label>Accent Color</Label>
          <div className="flex flex-wrap gap-3">
            {ACCENT_COLORS.map(({ label, hex }) => (
              <button
                key={hex}
                title={label}
                onClick={() => setAccentColor(hex)}
                className={cn(
                  'h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-background transition-transform hover:scale-110',
                  accentColor === hex ? 'ring-foreground scale-110' : 'ring-transparent'
                )}
                style={{ backgroundColor: hex }}
                aria-pressed={accentColor === hex}
                aria-label={label}
              />
            ))}
          </div>
        </div>

        {/* Overlay color */}
        <div className="space-y-3">
          <Label>Overlay Color</Label>
          <div className="flex flex-wrap gap-3">
            {OVERLAY_COLORS.map(({ label, value }) => (
              <button
                key={value}
                title={label}
                onClick={() => setOverlayColor(value)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                  overlayColor === value
                    ? 'border-foreground bg-muted font-medium'
                    : 'border-border hover:border-muted-foreground'
                )}
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: `rgb(var(--overlay-rgb))` }}
                />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Active Blur */}
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="overlay-blur">Active Blur</Label>
            <p className="text-sm text-muted-foreground mt-0.5">
              Apply backdrop blur to overlays and dialogs
            </p>
          </div>
          <Switch
            id="overlay-blur"
            checked={overlayBlur}
            onCheckedChange={setOverlayBlur}
          />
        </div>

        {/* Theme */}
        <div className="space-y-2">
          <Label>Theme</Label>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as ThemeMode[]).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  'capitalize rounded-md border px-4 py-2 text-sm transition-colors',
                  theme === t
                    ? 'border-foreground bg-muted font-medium'
                    : 'border-border hover:border-muted-foreground'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="space-y-2">
          <Label>Language</Label>
          <div className="flex gap-2">
            {([{ value: 'en', label: '🇬🇧 English' }, { value: 'fr', label: '🇫🇷 Français' }] as
              { value: SupportedLocale; label: string }[]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setLocale(value)}
                className={cn(
                  'rounded-md border px-4 py-2 text-sm transition-colors',
                  locale === value
                    ? 'border-foreground bg-muted font-medium'
                    : 'border-border hover:border-muted-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Display Mode */}
        <div className="space-y-2">
          <Label>Display Data</Label>
          <div className="flex gap-2">
            {([
              { value: 'table',     label: '▤ Table' },
              { value: 'card-grid', label: '⊞ Card Grid' },
            ] as { value: DisplayMode; label: string }[]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setDisplayMode(value)}
                className={cn(
                  'rounded-md border px-4 py-2 text-sm transition-colors',
                  displayMode === value
                    ? 'border-foreground bg-muted font-medium'
                    : 'border-border hover:border-muted-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Reset */}
        <button
          onClick={reset}
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Reset to defaults
        </button>
      </section>
    </div>
  )
}
```

---

## 18. Dialog Context System

A context-driven dialog system callable **via function** anywhere in the app.
Supports **stacked dialogs**, **animation variants**, and respects the user's overlay preferences.

### 18.1 Dialog Entity

```ts
// src/entities/Dialog.entity.ts

/**
 * # DialogEntity
 *
 * Describes a single dialog instance in the dialog stack.
 */

export type DialogAnimation = 'slide-up' | 'slide-down' | 'fade' | 'scale' | 'slide-right'
export type DialogSize      = 'sm' | 'md' | 'lg' | 'xl' | 'full'

export interface DialogOptions {
  readonly title?:      string
  readonly size?:       DialogSize
  readonly animation?:  DialogAnimation
  readonly closable?:   boolean          // show close button (default: true)
  readonly persistent?: boolean          // prevent close on overlay click (default: false)
}

export interface DialogInstance {
  readonly id:        string
  readonly component: React.ReactNode
  readonly options:   Required<DialogOptions>
}
```

### 18.2 Dialog Context

```tsx
// src/contexts/DialogContext.tsx

/**
 * # DialogContext
 *
 * Global context providing openDialog, closeDialog, closeAll.
 * Manages a stack of dialogs with animation and overlay preference support.
 *
 * Usage:
 *   const dialog = useDialog()
 *   dialog.openDialog(<MyComponent />, { title: 'Edit User', animation: 'slide-up' })
 *   dialog.closeDialog(id)
 *   dialog.closeAll()
 */

import {
  createContext, useContext, useState, useCallback, useId,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@lib/utils'
import { usePreferencesStore } from '@store/preferences.store'
import type { DialogInstance, DialogOptions, DialogAnimation, DialogSize } from '@entities/Dialog.entity'

// ── Animation variants ───────────────────────────────────────────────────────

const animationVariants: Record<DialogAnimation, {
  initial: object; animate: object; exit: object
}> = {
  'slide-up':    { initial: { y: 40, opacity: 0 },  animate: { y: 0, opacity: 1 },  exit: { y: 40, opacity: 0 } },
  'slide-down':  { initial: { y: -40, opacity: 0 }, animate: { y: 0, opacity: 1 },  exit: { y: -40, opacity: 0 } },
  'slide-right': { initial: { x: 60, opacity: 0 },  animate: { x: 0, opacity: 1 },  exit: { x: 60, opacity: 0 } },
  'fade':        { initial: { opacity: 0 },          animate: { opacity: 1 },         exit: { opacity: 0 } },
  'scale':       { initial: { scale: 0.92, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.92, opacity: 0 } },
}

const sizeMap: Record<DialogSize, string> = {
  sm:   'max-w-sm',
  md:   'max-w-md',
  lg:   'max-w-lg',
  xl:   'max-w-xl',
  full: 'max-w-full mx-4',
}

// ── Context ──────────────────────────────────────────────────────────────────

interface DialogContextValue {
  openDialog:  (component: ReactNode, options?: DialogOptions) => string
  closeDialog: (id: string) => void
  closeAll:    () => void
  stack:       DialogInstance[]
}

const DialogContext = createContext<DialogContextValue | null>(null)

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used inside <DialogProvider>')
  return ctx
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function DialogProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<DialogInstance[]>([])
  const { overlayColor, overlayBlur } = usePreferencesStore()

  const openDialog = useCallback((component: ReactNode, options: DialogOptions = {}): string => {
    const id = crypto.randomUUID()
    const instance: DialogInstance = {
      id,
      component,
      options: {
        title:      options.title      ?? '',
        size:       options.size       ?? 'md',
        animation:  options.animation  ?? 'scale',
        closable:   options.closable   ?? true,
        persistent: options.persistent ?? false,
      },
    }
    setStack((prev) => [...prev, instance])
    return id
  }, [])

  const closeDialog = useCallback((id: string) => {
    setStack((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const closeAll = useCallback(() => setStack([]), [])

  return (
    <DialogContext.Provider value={{ openDialog, closeDialog, closeAll, stack }}>
      {children}

      {/* ── Dialog Stack Portal ─────────────────────────────── */}
      <AnimatePresence>
        {stack.map((dialog, index) => {
          const variant = animationVariants[dialog.options.animation]
          const isTop = index === stack.length - 1

          return (
            <div
              key={dialog.id}
              className="fixed inset-0 z-[50] flex items-center justify-center"
              style={{ zIndex: 50 + index }}
            >
              {/* Overlay — only render for top dialog or first */}
              {index === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    'absolute inset-0 transition-all',
                    overlayBlur && 'backdrop-blur-sm'
                  )}
                  style={{
                    backgroundColor: `rgb(var(--overlay-rgb) / ${isTop ? 0.7 : 0.4})`,
                  }}
                  onClick={() => !dialog.options.persistent && closeDialog(dialog.id)}
                />
              )}

              {/* Dialog panel */}
              <motion.div
                key={dialog.id}
                initial={variant.initial}
                animate={variant.animate}
                exit={variant.exit}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                className={cn(
                  'relative z-10 w-full rounded-xl border border-border bg-card text-card-foreground shadow-2xl',
                  sizeMap[dialog.options.size]
                )}
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialog.options.title ? `dialog-title-${dialog.id}` : undefined}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                {(dialog.options.title || dialog.options.closable) && (
                  <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    {dialog.options.title && (
                      <h2
                        id={`dialog-title-${dialog.id}`}
                        className="text-base font-semibold leading-none"
                      >
                        {dialog.options.title}
                      </h2>
                    )}
                    {dialog.options.closable && (
                      <button
                        onClick={() => closeDialog(dialog.id)}
                        className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        aria-label="Close dialog"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}

                {/* Content */}
                <div className="px-6 py-5">{dialog.component}</div>
              </motion.div>
            </div>
          )
        })}
      </AnimatePresence>
    </DialogContext.Provider>
  )
}
```

### 18.3 Usage Examples

```tsx
// Anywhere in the app — no import of Dialog component needed

const dialog = useDialog()

// Basic
dialog.openDialog(<UserEditForm userId={id} />, {
  title: 'Edit User',
  animation: 'slide-up',
  size: 'lg',
})

// Persistent (can't close by clicking overlay)
dialog.openDialog(<DeleteConfirmation onConfirm={handleDelete} />, {
  title: 'Confirm Delete',
  animation: 'scale',
  persistent: true,
})

// Stack two dialogs
const id1 = dialog.openDialog(<OrderDetail orderId={orderId} />, { title: 'Order' })
dialog.openDialog(<ProductDetail />, { title: 'Product', animation: 'slide-right' })

// Close specific
dialog.closeDialog(id1)

// Close all
dialog.closeAll()
```

---

## 19. DataTable Component

A universal table component similar to React Native's `FlatList` — with typed rows, auto-constructed headers, filters, sort, shimmer loading, and multi-source data ingestion.

### 19.1 DataTable Entity & Types

```ts
// src/entities/DataTable.entity.ts

/**
 * # DataTable types
 *
 * Full type system for the DataTable component.
 */

export type SortDirection = 'asc' | 'desc' | null

export interface ColumnDef<TRow> {
  readonly key:          keyof TRow & string
  readonly header:       string
  readonly sortable?:    boolean
  readonly filterable?:  boolean
  readonly width?:       string
  readonly align?:       'left' | 'center' | 'right'
  readonly renderCell?:  (value: TRow[keyof TRow], row: TRow) => React.ReactNode
}

export type DataSource<TRow> =
  | { type: 'json';    data: TRow[] }
  | { type: 'url';     url: string; transform?: (raw: unknown) => TRow[] }
  | { type: 'csv';     raw: string; headers?: (keyof TRow)[] }
  | { type: 'xml';     raw: string; rowTag: string }
  | { type: 'request'; fn: () => Promise<TRow[]> }

export interface DataTableProps<TRow extends Record<string, unknown>> {
  // Data
  source:           DataSource<TRow>
  columns?:         ColumnDef<TRow>[]     // auto-inferred from data if omitted
  // Rendering
  renderRow?:       (row: TRow, index: number) => React.ReactNode
  renderCell?:      (col: ColumnDef<TRow>, row: TRow) => React.ReactNode
  renderEmpty?:     () => React.ReactNode
  // Features
  searchable?:      boolean
  selectable?:      boolean
  pagination?:      boolean
  pageSize?:        number
  skeletonRows?:    number
  // Events
  onRowClick?:      (row: TRow) => void
  onSelectionChange?: (rows: TRow[]) => void
  // Style
  className?:       string
  rowClassName?:    (row: TRow) => string
  headerClassName?: string
}
```

### 19.2 DataTable Implementation

```tsx
// src/components/DataTable/DataTable.tsx

/**
 * # DataTable
 *
 * Universal, fully typed table component.
 * Features: multi-source ingestion, auto headers, sort, search, filter,
 *           shimmer skeleton, pagination, row selection, custom renderers.
 *
 * Input:  DataTableProps<TRow>
 * Output: Rendered responsive table with loading, error, and empty states.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { cn } from '@lib/utils'
import { SkeletonTable } from '@components/ui/Skeleton'
import type { ColumnDef, DataSource, DataTableProps, SortDirection } from '@entities/DataTable.entity'

// ── Data Loaders ─────────────────────────────────────────────────────────────

async function loadDataSource<TRow>(source: DataSource<TRow>): Promise<TRow[]> {
  switch (source.type) {
    case 'json':    return source.data
    case 'request': return source.fn()
    case 'url': {
      const res = await fetch(source.url)
      const raw = await res.json()
      return source.transform ? source.transform(raw) : (raw as TRow[])
    }
    case 'csv': {
      const [headerLine, ...lines] = source.raw.trim().split('\n')
      const keys = (source.headers ?? (headerLine?.split(',') ?? [])) as (keyof TRow)[]
      return lines.map((line) => {
        const values = line.split(',')
        return Object.fromEntries(keys.map((k, i) => [k, values[i]])) as TRow
      })
    }
    case 'xml': {
      const parser = new DOMParser()
      const doc = parser.parseFromString(source.raw, 'application/xml')
      const nodes = Array.from(doc.getElementsByTagName(source.rowTag))
      return nodes.map((node) => {
        const obj: Record<string, string> = {}
        Array.from(node.children).forEach((child) => {
          obj[child.tagName] = child.textContent ?? ''
        })
        return obj as unknown as TRow
      })
    }
  }
}

function inferColumns<TRow extends Record<string, unknown>>(data: TRow[]): ColumnDef<TRow>[] {
  if (!data[0]) return []
  return Object.keys(data[0]).map((key) => ({
    key:       key as keyof TRow & string,
    header:    key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
    sortable:  true,
    filterable: true,
  }))
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DataTable<TRow extends Record<string, unknown>>({
  source, columns: colsProp, renderRow, renderCell, renderEmpty,
  searchable = true, selectable = false, pagination = true, pageSize = 20,
  skeletonRows = 8, onRowClick, onSelectionChange,
  className, rowClassName, headerClassName,
}: DataTableProps<TRow>) {

  const [data,       setData]      = useState<TRow[]>([])
  const [isLoading,  setLoading]   = useState(true)
  const [error,      setError]     = useState<string | null>(null)
  const [search,     setSearch]    = useState('')
  const [sortKey,    setSortKey]   = useState<string | null>(null)
  const [sortDir,    setSortDir]   = useState<SortDirection>(null)
  const [page,       setPage]      = useState(1)
  const [selected,   setSelected]  = useState<Set<number>>(new Set())

  // Load data
  useEffect(() => {
    setLoading(true)
    setError(null)
    loadDataSource(source)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load data'))
      .finally(() => setLoading(false))
  }, []) // source identity stable per render — caller memoizes

  const columns = useMemo(
    () => colsProp ?? inferColumns(data),
    [colsProp, data]
  )

  // Filter
  const filtered = useMemo(() => {
    if (!search) return data
    const q = search.toLowerCase()
    return data.filter((row) =>
      Object.values(row).some((v) => String(v).toLowerCase().includes(q))
    )
  }, [data, search])

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered
    return [...filtered].sort((a, b) => {
      const av = String(a[sortKey] ?? '')
      const bv = String(b[sortKey] ?? '')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [filtered, sortKey, sortDir])

  // Paginate
  const totalPages = Math.ceil(sorted.length / pageSize)
  const paginated  = pagination ? sorted.slice((page - 1) * pageSize, page * pageSize) : sorted

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev !== key) { setSortDir('asc'); return key }
      setSortDir((d) => d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc')
      return key
    })
  }, [])

  const handleSelect = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(index) ? next.delete(index) : next.add(index)
      onSelectionChange?.(paginated.filter((_, i) => next.has(i)))
      return next
    })
  }, [paginated, onSelectionChange])

  return (
    <div className={cn('w-full space-y-3', className)}>

      {/* Search */}
      {searchable && !isLoading && (
        <input
          type="search"
          placeholder="Search…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className={cn('border-b border-border bg-muted/40', headerClassName)}>
            <tr>
              {selectable && <th className="w-10 px-4 py-3"><span className="sr-only">Select</span></th>}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 font-medium text-muted-foreground',
                    col.align === 'center' && 'text-center',
                    col.align === 'right'  && 'text-right',
                    col.sortable && 'cursor-pointer select-none hover:text-foreground'
                  )}
                  style={{ width: col.width }}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      <span className="text-xs">{sortDir === 'asc' ? '↑' : sortDir === 'desc' ? '↓' : ''}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <SkeletonTable rows={skeletonRows} cols={columns.length + (selectable ? 1 : 0)} />
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-12 text-center text-muted-foreground">
                  {renderEmpty ? renderEmpty() : 'No data found.'}
                </td>
              </tr>
            ) : (
              paginated.map((row, i) =>
                renderRow ? (
                  <tr key={i}>{renderRow(row, i)}</tr>
                ) : (
                  <tr
                    key={i}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      'transition-colors hover:bg-muted/50',
                      onRowClick && 'cursor-pointer',
                      selected.has(i) && 'bg-accent/20',
                      rowClassName?.(row)
                    )}
                  >
                    {selectable && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(i)}
                          onChange={() => handleSelect(i)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-border"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          'px-4 py-3 text-foreground',
                          col.align === 'center' && 'text-center',
                          col.align === 'right'  && 'text-right'
                        )}
                      >
                        {renderCell
                          ? renderCell(col, row)
                          : col.renderCell
                          ? col.renderCell(row[col.key], row)
                          : String(row[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && !isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{sorted.length} results</span>
          <div className="flex gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded px-2 py-1 hover:bg-muted disabled:opacity-40"
            >‹</button>
            <span className="px-2 py-1">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded px-2 py-1 hover:bg-muted disabled:opacity-40"
            >›</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

### 19.3 DataTable Usage Examples

```tsx
// From typed entity array
<DataTable
  source={{ type: 'json', data: orders }}
  columns={[
    { key: 'id',          header: 'ID',     width: '80px' },
    { key: 'status',      header: 'Status', renderCell: (v) => <StatusBadge status={v as OrderStatus} /> },
    { key: 'totalAmount', header: 'Total',  align: 'right', sortable: true,
      renderCell: (v) => `$${Number(v).toFixed(2)}` },
    { key: 'createdAt',   header: 'Date',   sortable: true },
  ]}
  onRowClick={(row) => navigate(`/app/orders/${row.id}`)}
/>

// From async API request with shimmer
<DataTable
  source={{ type: 'request', fn: () => getOrdersAction({ page: 1 }) }}
  skeletonRows={10}
  searchable
  pagination
  pageSize={25}
/>

// From URL (JSON endpoint)
<DataTable source={{ type: 'url', url: '/api/v1/external/products' }} />

// From CSV string
<DataTable source={{ type: 'csv', raw: csvString, headers: ['id', 'name', 'price'] }} />

// Custom row renderer (FlatList-style)
<DataTable
  source={{ type: 'json', data: users }}
  renderRow={(user) => (
    <>
      <td className="px-4 py-3"><UserAvatar user={user} /></td>
      <td className="px-4 py-3">{user.email}</td>
    </>
  )}
/>
```

---

## 20. SmartForm Component

A universal form builder with auto-construction from schema or data, section/field renderers, multi-source data ingestion, shimmer loading, and a plugin system for custom fields.

### 20.1 SmartForm Entity & Types

```ts
// src/entities/SmartForm.entity.ts

/**
 * # SmartForm types
 *
 * Full type system for the SmartForm component.
 */

export type FieldType =
  | 'text' | 'email' | 'password' | 'number' | 'tel' | 'url'
  | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'radio'
  | 'date' | 'datetime-local' | 'file' | 'custom'

export interface SelectOption {
  readonly value:    string | number
  readonly label:    string
  readonly disabled?: boolean
}

export interface FieldDef {
  readonly key:          string
  readonly label:        string
  readonly type:         FieldType
  readonly required?:    boolean
  readonly placeholder?: string
  readonly hint?:        string
  readonly options?:     SelectOption[]    // for select / radio / multiselect
  readonly defaultValue?: unknown
  readonly disabled?:    boolean
  readonly validation?:  {
    readonly min?:       number
    readonly max?:       number
    readonly minLength?: number
    readonly maxLength?: number
    readonly pattern?:   string
    readonly custom?:    (value: unknown) => string | null  // returns error message or null
  }
  /** Plugin: completely custom field renderer */
  readonly component?:   React.ComponentType<FieldPluginProps>
}

export interface FieldPluginProps {
  field:    FieldDef
  value:    unknown
  onChange: (value: unknown) => void
  error:    string | null
}

export interface SectionDef {
  readonly key:      string
  readonly title?:   string
  readonly fields:   FieldDef[]
  readonly columns?: 1 | 2 | 3   // grid columns for this section (default: 1)
}

export type FormDataSource =
  | { type: 'schema';  sections: SectionDef[] }
  | { type: 'json';    data: Record<string, unknown> }
  | { type: 'url';     url: string; method?: 'GET' | 'POST' }
  | { type: 'csv';     raw: string }
  | { type: 'xml';     raw: string; fieldTag: string }
  | { type: 'entity';  schema: SectionDef[] }
  | { type: 'request'; fn: () => Promise<Record<string, unknown>> }

export interface SmartFormProps {
  // Data
  source:            FormDataSource
  initialValues?:    Record<string, unknown>
  // Rendering
  renderSection?:    (section: SectionDef, fields: React.ReactNode) => React.ReactNode
  renderField?:      (field: FieldDef, input: React.ReactNode) => React.ReactNode
  // Actions
  onSubmit:          (values: Record<string, unknown>) => Promise<void> | void
  onReset?:          () => void
  // Labels
  submitLabel?:      string
  resetLabel?:       string
  clearLabel?:       string
  // Plugins
  fieldPlugins?:     Record<string, React.ComponentType<FieldPluginProps>>
  // Style
  className?:        string
  sectionClassName?: string
  fieldClassName?:   string
  actionsClassName?: string
}
```

### 20.2 SmartForm Implementation

```tsx
// src/components/SmartForm/SmartForm.tsx

/**
 * # SmartForm
 *
 * Universal, auto-constructing form component.
 * Features: multi-source ingestion, section/field renderers, validation,
 *           shimmer skeleton, plugin system for custom fields.
 *
 * Input:  SmartFormProps
 * Output: Rendered accessible form with sections, validation, and action buttons.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@lib/utils'
import { SkeletonForm } from '@components/ui/Skeleton'
import type {
  SmartFormProps, SectionDef, FieldDef, FieldPluginProps, FormDataSource
} from '@entities/SmartForm.entity'

// ── Schema Loaders ────────────────────────────────────────────────────────────

async function loadFormSource(source: FormDataSource): Promise<{
  sections: SectionDef[]
  defaults: Record<string, unknown>
}> {
  switch (source.type) {
    case 'schema':
    case 'entity':
      return {
        sections: source.sections,
        defaults: Object.fromEntries(
          source.sections.flatMap((s) => s.fields.map((f) => [f.key, f.defaultValue ?? '']))
        ),
      }

    case 'json': {
      const keys = Object.keys(source.data)
      return {
        sections: [{ key: 'main', fields: keys.map((k) => ({
          key: k, label: k, type: 'text' as const,
        })) }],
        defaults: source.data,
      }
    }

    case 'url': {
      const res  = await fetch(source.url, { method: source.method ?? 'GET' })
      const data = (await res.json()) as Record<string, unknown>
      const keys = Object.keys(data)
      return {
        sections: [{ key: 'main', fields: keys.map((k) => ({
          key: k, label: k, type: 'text' as const,
        })) }],
        defaults: data,
      }
    }

    case 'request': {
      const data = await source.fn()
      const keys = Object.keys(data)
      return {
        sections: [{ key: 'main', fields: keys.map((k) => ({
          key: k, label: k, type: 'text' as const,
        })) }],
        defaults: data,
      }
    }

    case 'csv': {
      const [headerLine] = source.raw.trim().split('\n')
      const keys = headerLine?.split(',') ?? []
      return {
        sections: [{ key: 'main', fields: keys.map((k) => ({
          key: k.trim(), label: k.trim(), type: 'text' as const,
        })) }],
        defaults: {},
      }
    }

    case 'xml': {
      const parser = new DOMParser()
      const doc    = parser.parseFromString(source.raw, 'application/xml')
      const nodes  = Array.from(doc.getElementsByTagName(source.fieldTag))
      const fields = nodes.map((n) => ({
        key:   n.getAttribute('name') ?? n.tagName,
        label: n.getAttribute('label') ?? n.tagName,
        type:  (n.getAttribute('type') ?? 'text') as FieldDef['type'],
      }))
      return { sections: [{ key: 'main', fields }], defaults: {} }
    }
  }
}

// ── Field Renderer ────────────────────────────────────────────────────────────

function FieldInput({
  field, value, onChange, error, plugin,
}: {
  field: FieldDef
  value: unknown
  onChange: (v: unknown) => void
  error: string | null
  plugin?: React.ComponentType<FieldPluginProps>
}) {
  const baseClass = cn(
    'w-full rounded-md border bg-background px-3 py-2 text-sm transition-colors',
    'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
    error ? 'border-destructive focus:ring-destructive/30' : 'border-input'
  )

  if (plugin) {
    const Plugin = plugin
    return <Plugin field={field} value={value} onChange={onChange} error={error} />
  }

  if (field.component) {
    const Custom = field.component
    return <Custom field={field} value={value} onChange={onChange} error={error} />
  }

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          id={field.key} value={String(value ?? '')} placeholder={field.placeholder}
          disabled={field.disabled} required={field.required}
          onChange={(e) => onChange(e.target.value)}
          className={cn(baseClass, 'min-h-[100px] resize-y')}
        />
      )

    case 'select':
      return (
        <select
          id={field.key} value={String(value ?? '')}
          disabled={field.disabled} required={field.required}
          onChange={(e) => onChange(e.target.value)}
          className={baseClass}
        >
          <option value="">Select…</option>
          {field.options?.map((o) => (
            <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      )

    case 'checkbox':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox" id={field.key} checked={Boolean(value)}
            disabled={field.disabled} required={field.required}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded border-input"
          />
          <span className="text-sm text-muted-foreground">{field.placeholder}</span>
        </label>
      )

    case 'radio':
      return (
        <div className="flex flex-wrap gap-4">
          {field.options?.map((o) => (
            <label key={String(o.value)} className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio" name={field.key} value={String(o.value)}
                checked={value === o.value} disabled={field.disabled || o.disabled}
                onChange={() => onChange(o.value)}
                className="border-input"
              />
              {o.label}
            </label>
          ))}
        </div>
      )

    case 'file':
      return (
        <input
          type="file" id={field.key} disabled={field.disabled} required={field.required}
          onChange={(e) => onChange(e.target.files)}
          className={cn(baseClass, 'cursor-pointer file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm')}
        />
      )

    default:
      return (
        <input
          type={field.type} id={field.key} value={String(value ?? '')}
          placeholder={field.placeholder} disabled={field.disabled} required={field.required}
          onChange={(e) => onChange(e.target.value)}
          className={baseClass}
        />
      )
  }
}

// ── SmartForm ─────────────────────────────────────────────────────────────────

export function SmartForm({
  source, initialValues,
  renderSection, renderField,
  onSubmit, onReset,
  submitLabel = 'Submit', resetLabel = 'Reset', clearLabel = 'Clear',
  fieldPlugins = {},
  className, sectionClassName, fieldClassName, actionsClassName,
}: SmartFormProps) {

  const [sections,    setSections]    = useState<SectionDef[]>([])
  const [values,      setValues]      = useState<Record<string, unknown>>({})
  const [errors,      setErrors]      = useState<Record<string, string>>({})
  const [isLoading,   setLoading]     = useState(true)
  const [isSubmitting, setSubmitting] = useState(false)
  const [loadError,   setLoadError]   = useState<string | null>(null)
  const initialRef = useRef(initialValues)

  useEffect(() => {
    setLoading(true)
    loadFormSource(source)
      .then(({ sections: s, defaults }) => {
        setSections(s)
        setValues({ ...defaults, ...initialRef.current })
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load form'))
      .finally(() => setLoading(false))
  }, [])

  const setValue = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => { const next = { ...prev }; delete next[key]; return next })
  }, [])

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {}
    sections.flatMap((s) => s.fields).forEach((field) => {
      const value = values[field.key]
      if (field.required && (value === '' || value === null || value === undefined)) {
        newErrors[field.key] = `${field.label} is required.`
        return
      }
      if (field.validation?.custom) {
        const msg = field.validation.custom(value)
        if (msg) newErrors[field.key] = msg
      }
    })
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [sections, values])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try { await onSubmit(values) }
    finally { setSubmitting(false) }
  }, [validate, onSubmit, values])

  const handleReset = useCallback(() => {
    setValues(initialRef.current ?? {})
    setErrors({})
    onReset?.()
  }, [onReset])

  const handleClear = useCallback(() => {
    setValues(Object.fromEntries(sections.flatMap((s) => s.fields.map((f) => [f.key, '']))))
    setErrors({})
  }, [sections])

  if (isLoading) return <SkeletonForm fields={4} />
  if (loadError)  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {loadError}
    </div>
  )

  return (
    <form onSubmit={handleSubmit} noValidate className={cn('space-y-8', className)}>
      {sections.map((section) => {
        const fieldsNode = (
          <div
            className={cn(
              'grid gap-4',
              section.columns === 2 && 'sm:grid-cols-2',
              section.columns === 3 && 'sm:grid-cols-3',
            )}
          >
            {section.fields.map((field) => {
              const inputNode = (
                <div key={field.key} className={cn('space-y-1.5', fieldClassName)}>
                  {field.type !== 'checkbox' && (
                    <label htmlFor={field.key} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      {field.label}
                      {field.required && <span className="ml-0.5 text-destructive">*</span>}
                    </label>
                  )}
                  <FieldInput
                    field={field}
                    value={values[field.key]}
                    onChange={(v) => setValue(field.key, v)}
                    error={errors[field.key] ?? null}
                    plugin={fieldPlugins[field.key]}
                  />
                  {field.hint && !errors[field.key] && (
                    <p className="text-xs text-muted-foreground">{field.hint}</p>
                  )}
                  {errors[field.key] && (
                    <p className="text-xs text-destructive">{errors[field.key]}</p>
                  )}
                </div>
              )
              return renderField ? renderField(field, inputNode) : inputNode
            })}
          </div>
        )

        const sectionNode = (
          <div key={section.key} className={cn('space-y-4', sectionClassName)}>
            {section.title && (
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {section.title}
              </h3>
            )}
            {fieldsNode}
          </div>
        )

        return renderSection ? renderSection(section, fieldsNode) : sectionNode
      })}

      {/* Actions */}
      <div className={cn('flex flex-wrap gap-3 pt-2', actionsClassName)}>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isSubmitting && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
          )}
          {submitLabel}
        </button>
        <button
          type="button" onClick={handleReset}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          {resetLabel}
        </button>
        <button
          type="button" onClick={handleClear}
          className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {clearLabel}
        </button>
      </div>
    </form>
  )
}
```

### 20.3 SmartForm Usage Examples

```tsx
// From typed schema
<SmartForm
  source={{
    type: 'schema',
    sections: [
      {
        key: 'identity',
        title: 'Identity',
        columns: 2,
        fields: [
          { key: 'firstName', label: 'First Name', type: 'text',  required: true },
          { key: 'lastName',  label: 'Last Name',  type: 'text',  required: true },
          { key: 'email',     label: 'Email',      type: 'email', required: true },
          { key: 'role',      label: 'Role',       type: 'select',
            options: [{ value: 'admin', label: 'Admin' }, { value: 'user', label: 'User' }] },
        ],
      },
    ],
  }}
  onSubmit={async (values) => await createUserAction(values as CreateUserDto)}
  submitLabel="Create User"
/>

// From async request with shimmer
<SmartForm
  source={{ type: 'request', fn: () => getUserAction(userId) }}
  onSubmit={async (values) => await updateUserAction(userId, values)}
  submitLabel="Save Changes"
/>

// From URL
<SmartForm
  source={{ type: 'url', url: `/api/v1/external/users/${id}` }}
  onSubmit={handleSubmit}
/>

// Custom section renderer
<SmartForm
  source={{ type: 'schema', sections }}
  renderSection={(section, fields) => (
    <Card key={section.key} className="p-6">
      <CardHeader><CardTitle>{section.title}</CardTitle></CardHeader>
      <CardContent>{fields}</CardContent>
    </Card>
  )}
  onSubmit={handleSubmit}
/>

// Plugin: custom upload field
const FileUploadPlugin: React.FC<FieldPluginProps> = ({ field, onChange }) => (
  <div className="rounded-lg border-2 border-dashed border-border p-6 text-center cursor-pointer hover:border-primary transition-colors">
    <input type="file" className="sr-only" id={field.key}
      onChange={(e) => onChange(e.target.files?.[0])} />
    <label htmlFor={field.key} className="cursor-pointer text-sm text-muted-foreground">
      Drop file here or <span className="text-primary underline">browse</span>
    </label>
  </div>
)

<SmartForm
  source={{ type: 'schema', sections }}
  fieldPlugins={{ avatar: FileUploadPlugin }}
  onSubmit={handleSubmit}
/>
```

---

## 21. Updated Frontend Checklist

Before any component or module is considered production-ready:

- [ ] Entity type defined in `src/entities/` — no inline types in components
- [ ] Action in a `.action.ts` file with typed input/output and `AppError` on failure
- [ ] Hook composes store + action — no raw `fetch` or `localStorage` in components
- [ ] Store slice fully typed; persisted keys documented in `LocalStorageSchema`
- [ ] `localStorage` via `useLocalStorage`; `IndexedDB` via `useIndexedDb` — no raw access
- [ ] Route params typed via param hooks; auth + role guards applied
- [ ] `cn()` for all conditional classes; no string interpolation
- [ ] shadcn/ui components wrapped, never modified directly
- [ ] All loading states use `Shimmer` / `Skeleton*` — no raw spinners alone
- [ ] `PreferencesProvider` wraps app; theme/accent/overlay applied via CSS variables
- [ ] Settings page includes Preference UI section (colors, blur, theme, language, display)
- [ ] Dialogs opened via `dialogContext.openDialog()` — no local modal state in components
- [ ] `DataTable` used for all tabular data; `source` prop typed and correct
- [ ] `DataTable` loading state uses `SkeletonTable` automatically
- [ ] `SmartForm` used for all forms; field plugins registered for custom inputs
- [ ] `SmartForm` loading state uses `SkeletonForm` automatically
- [ ] Dark mode supported via `dark:` prefix; overlay blur respects user preference
- [ ] All components have JSDoc comment (purpose, input props, output)
- [ ] No `any` — TypeScript strict mode passes with zero errors
- [ ] Tests cover action success + error, hook states, and Shimmer render during loading

---

*Last updated: 2026 — maintain this file alongside any new entity, module, or stack change.*