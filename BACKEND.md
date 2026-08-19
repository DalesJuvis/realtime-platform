# backend.md — Backend Architecture, Routing & Capabilities

> Applies to all backend frameworks in the stack:
> **Actix Web** (Rust), **Loco** (Rust), **FastAPI** (Python), **Laravel** (PHP).
> This file is the **single source of truth** for backend rules — it supersedes and fully
> absorbs `RULES.md`. Keep both files in sync when making architectural changes.

---

## 1. Supported Frameworks

| Language | Framework  | Role                                     |
|----------|------------|------------------------------------------|
| Rust     | Actix Web  | High-performance API, real-time, system  |
| Rust     | Loco       | Full-stack MVC API (Rails-like for Rust) |
| Python   | FastAPI    | AI/ML services, HuggingFace pipelines    |
| PHP      | Laravel    | CMS, admin panels, rapid CRUD backends   |

Each framework follows the same **pipeline, naming, routing, and adapter contracts** defined here.
Framework-specific syntax is shown per section.

---

## 2. Core Philosophy

- **One file = One action.** Every file has a single, explicit responsibility.
- **Every file must include a top-level comment** describing: what it does, inputs, outputs, and side effects.
- **No logic leaks.** Controllers do not query. Repositories do not transform. Services do not route.
- **Modulable** — each module can be extracted, replaced, or mocked independently.
- **Scalable** — horizontal scaling must never require architectural changes.
- **Traceable** — every request carries a Trace ID from entry to database.

---

## 3. Universal Request Lifecycle

Every request **must** flow through this strict pipeline — no shortcuts:

```
Request
  ⇢ Controller       → validates HTTP input, returns HTTP response
  ⇢ UseCase          → orchestrates business logic, owns the transaction boundary
  ⇢ Service          → domain logic, calls repositories or external APIs
  ⇢ Repository       → data access only (read/write), no business logic
  ⇢ Model            → data shape / schema definition
  ⇢ Database
```

**Hard rules:**
- A Controller **never** calls a Repository directly.
- A UseCase **never** touches HTTP primitives (request/response objects).
- A Repository **never** calls another Repository.
- A Service **may** call other Services only across different domain boundaries.
- Models are **pure data** — no methods that trigger side effects.

---

## 4. File Naming Convention

| Layer       | Pattern                          | Example                          |
|-------------|----------------------------------|----------------------------------|
| Controller  | `{Action}{Resource}Controller`   | `CreateUserController`           |
| UseCase     | `{Action}{Resource}UseCase`      | `CreateUserUseCase`              |
| Service     | `{Resource}Service`              | `UserService`                    |
| Repository  | `{Resource}Repository`           | `UserRepository`                 |
| Model       | `{Resource}Model` / `{Resource}` | `UserModel`                      |
| Cache       | `{Resource}Cache`                | `UserCache`                      |
| Serializer  | `{Resource}{Format}Serializer`   | `UserCsvSerializer`              |
| External    | `{Provider}ApiService`           | `StripeApiService`               |
| LLM         | `{Provider}LlmService`           | `HuggingFaceLlmService`          |
| Adapter     | `{Provider}{Port}Adapter`        | `SupabaseAuthAdapter`            |
| Notification| `{Provider}{Channel}Adapter`     | `TwilioSmsAdapter`               |

> One file per action. `GetUserController` and `CreateUserController` are **two separate files**.

---

## 5. Mandatory File Header Comment

Every file must begin with a structured comment block.

**Rust:**
```rust
//! # CreateUserUseCase
//!
//! **Action:** Creates a new user after validating uniqueness and hashing credentials.
//! **Input:** `CreateUserDto { email, password, role }`
//! **Output:** `UserEntity`
//! **Side effects:** Sends welcome email via `EmailApiService`, invalidates user list cache.
//! **Dependencies:** `UserRepository`, `EmailApiService`, `UserCache`
```

**Python:**
```python
"""
# CreateUserUseCase

Action: Creates a new user after validating uniqueness and hashing credentials.
Input:  CreateUserDto(email, password, role)
Output: UserEntity
Side effects: Sends welcome email via EmailApiService, invalidates user list cache.
Dependencies: UserRepository, EmailApiService, UserCache
"""
```

**PHP:**
```php
/**
 * # CreateUserUseCase
 *
 * Action: Creates a new user after validating uniqueness and hashing credentials.
 * Input:  CreateUserRequest (validated DTO)
 * Output: UserResource
 * Side effects: Dispatches WelcomeMailJob, invalidates user list cache.
 * Dependencies: UserRepository, EmailApiService, UserCache
 */
```

---

## 6. URL Structure — Universal Routing Contract

Every route **must** follow this exact pattern:

```
/api/v{version}/{segment}/{domain}/{action?}
```

### 6.1 Segments

| Segment    | Audience                      | Auth required     | Description                                      |
|------------|-------------------------------|-------------------|--------------------------------------------------|
| `external` | Public clients, mobile, web   | Optional / JWT    | Public-facing API consumed by end users          |
| `internal` | Service-to-service only       | Service token     | Inter-microservice calls, never exposed publicly |
| `admin`    | Back-office, dashboard        | JWT + admin role  | Management endpoints, sensitive operations       |
| `system`   | Infra, CI/CD, health, cron    | System API key    | Health checks, metrics, cache flush, migrations  |
| `webhook`  | Third-party inbound callbacks | HMAC signature    | Stripe, GitHub, SendGrid, etc.                   |
| `rpc`      | Backend-to-DB RPC proxy       | Service token     | Secure proxy to PostgreSQL RPC functions         |

### 6.2 Examples

```
GET    /api/v1/external/users/profile
POST   /api/v1/external/auth/login
POST   /api/v1/external/auth/refresh
POST   /api/v1/external/auth/2fa/verify

GET    /api/v1/admin/users
DELETE /api/v1/admin/users/{id}
GET    /api/v1/admin/analytics/revenue

POST   /api/v1/internal/notifications/send
GET    /api/v1/internal/orders/{id}/status

POST   /api/v1/system/cache/flush
GET    /api/v1/system/health
GET    /api/v1/system/metrics

POST   /api/v1/webhook/stripe/payment
POST   /api/v1/webhook/sendgrid/events

POST   /api/v1/rpc/orders/place
POST   /api/v1/rpc/search/semantic
POST   /api/v1/rpc/analytics/revenue-rollup
```

### 6.3 Versioning Rules

- Version is an integer prefixed with `v`: `v1`, `v2`, `v3`.
- A new version is created only for **breaking changes** — never modify a live version.
- All versions run in parallel until the deprecated version's sunset date (minimum 6 months notice).
- Version is always in the URL path — never in a header or query param.
- Deprecation signaled via headers: `Deprecation: true`, `Sunset: 2027-01-01`.

### 6.4 Framework Route Registration

**Actix Web (Rust):**
```rust
// src/routes/mod.rs
pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/v1")
            .configure(external::configure)
            .configure(admin::configure)
            .configure(internal::configure)
            .configure(system::configure)
            .configure(webhook::configure)
            .configure(rpc::configure),
    );
}
```

**Loco (Rust):**
```rust
// src/app.rs
impl Hooks for App {
    async fn routes(_ctx: &AppContext) -> AppRoutes {
        AppRoutes::with_default_routes()
            .prefix("/api/v1")
            .add_route(controllers::external::auth::routes())
            .add_route(controllers::admin::users::routes())
            .add_route(controllers::system::health::routes())
            .add_route(controllers::rpc::orders::routes())
    }
}
```

**FastAPI (Python):**
```python
# app/routes/__init__.py
router = APIRouter(prefix="/api/v1")
router.include_router(auth.router,          prefix="/external/auth")
router.include_router(users.router,         prefix="/external/users")
router.include_router(admin_users.router,   prefix="/admin/users")
router.include_router(analytics.router,     prefix="/admin/analytics")
router.include_router(notifications.router, prefix="/internal/notifications")
router.include_router(health.router,        prefix="/system/health")
router.include_router(orders.router,        prefix="/rpc/orders")
```

**Laravel (PHP):**
```php
// routes/api.php
Route::prefix('api/v1')->group(function () {
    Route::prefix('external')->group(base_path('routes/segments/external.php'));
    Route::prefix('admin')->group(base_path('routes/segments/admin.php'));
    Route::prefix('internal')->group(base_path('routes/segments/internal.php'));
    Route::prefix('system')->group(base_path('routes/segments/system.php'));
    Route::prefix('webhook')->group(base_path('routes/segments/webhook.php'));
    Route::prefix('rpc')->group(base_path('routes/segments/rpc.php'));
});
```

---

## 7. Segment Middleware & Guards

Each segment has a dedicated middleware stack applied automatically:

```
Segment      │ Middleware Stack
─────────────┼──────────────────────────────────────────────────────────────────────
external     │ RateLimit → TraceId → CorsPublic → AuthOptional → Log
admin        │ RateLimit → TraceId → CorsInternal → AuthRequired → RoleAdmin → Log
internal     │ TraceId → ServiceTokenGuard → IpAllowList → Log
system       │ SystemApiKeyGuard → IpAllowList → Log
webhook      │ HmacSignatureGuard → RawBodyPreserve → Log
rpc          │ TraceId → ServiceTokenGuard → RpcInputSanitizer → Log
```

### 7.1 Guard Definitions

- **AuthOptional** — extracts JWT if present; injects `current_user` or `null` without rejecting.
- **AuthRequired** — validates JWT (access token), checks blacklist, injects `current_user`. Rejects `401` if missing or invalid.
- **RoleAdmin** — checks `current_user.roles` contains `admin` or `super_admin`. Rejects `403`.
- **ServiceTokenGuard** — validates `X-Service-Token` header against `SERVICE_TOKEN` env var. Rotated per deployment.
- **SystemApiKeyGuard** — validates `X-System-Key` header, stricter than service token, IP-bound.
- **HmacSignatureGuard** — verifies `X-Signature` / `X-Hub-Signature-256` against payload using provider secret.
- **IpAllowList** — validates request IP against `INTERNAL_IP_ALLOWLIST` env var (CIDR ranges).
- **RpcInputSanitizer** — validates RPC function name against allowlist, sanitizes all params before DB call.

---

## 8. Secure RPC Proxy (`/rpc` segment)

The `/rpc` segment is a **secured backend proxy** to PostgreSQL RPC functions.
Never exposed to the public — called only from trusted internal backend services.

### 8.1 Flow

```
Backend UseCase
  ⇢ POST /api/v1/rpc/{domain}/{function}
  ⇢ RpcController          → validates function name against allowlist
  ⇢ RpcAuthMiddleware      → validates Service Token
  ⇢ RpcUseCase             → sanitizes params, builds call
  ⇢ RpcRepository          → executes SELECT rpc_{domain}_{function}(params)
  ⇢ PostgreSQL RPC function → atomic DB operation (see database.md §15)
  ⇢ RpcRepository          → maps result rows to DTO
  ⇢ RpcController          → returns JSON response
```

### 8.2 RPC Allowlist

```toml
# config/rpc_allowlist.toml
[rpc]
allowed = [
  "rpc_auth_rotate_token",
  "rpc_orders_place",
  "rpc_search_semantic",
  "rpc_geo_nearby",
  "rpc_analytics_revenue_rollup",
]
```

Any call to a function not in the allowlist returns `403 FORBIDDEN` before any DB connection is made.

### 8.3 RPC Request / Response Contract

```
POST /api/v1/rpc/orders/place
Headers:
  X-Service-Token: <token>
  X-Trace-ID: <uuid>
  Content-Type: application/json

Body:
{ "params": { "p_user_id": "uuid", "p_items": [...] } }

Response 200:
{ "success": true, "data": { "order_id": "uuid", "total_amount": 39.98 }, "trace_id": "abc-123" }

Response 422:
{ "success": false, "error": { "code": "INSUFFICIENT_STOCK", "message": "...", "trace_id": "abc-123" } }
```

### 8.4 RPC Security Rules

- Service Token rotated on every deployment via CI/CD secret injection.
- RPC endpoint is **not registered** in public API docs.
- All RPC calls logged: `trace_id`, `function`, `duration_ms`, `caller_service`, `status`.
- Raw PostgreSQL exceptions are **mapped to typed errors** — never leak to caller.
- Functions requiring admin access validate the role **inside the SQL function** (double enforcement).

---

## 9. API Documentation Route

Every backend exposes a live HTML documentation page:

```
GET /api/v1/docs           → Swagger UI / Scalar (HTML, interactive)
GET /api/v1/docs/openapi   → Raw OpenAPI 3.1 JSON spec
GET /api/v1/docs/redoc     → ReDoc alternative view
```

Protected in production by admin JWT or IP allowlist (`DOCS_REQUIRE_AUTH=true`).

### 9.1 Required Fields per Route

| Field            | Description                                                     |
|------------------|-----------------------------------------------------------------|
| Method + URL     | `POST /api/v1/external/auth/login`                              |
| Segment          | `external` / `admin` / `internal` / `system` / `rpc`           |
| Auth required    | None / JWT / Admin Role / Service Token                         |
| Request params   | Name, type, required/optional, description, example             |
| Request body     | JSON schema with all fields typed and annotated                 |
| Response 2xx     | Shape of success response with field types                      |
| Response errors  | All possible error codes with descriptions                      |
| Rate limit       | Requests per minute / per IP / per token                        |
| Deprecation      | Sunset date if route is deprecated                              |

### 9.2 Framework Implementation

**FastAPI** — automatic:
```python
app = FastAPI(title="API", version="1.0.0",
    docs_url="/api/v1/docs", redoc_url="/api/v1/docs/redoc",
    openapi_url="/api/v1/docs/openapi")
```

**Actix Web / Loco** — `utoipa` + `utoipa-swagger-ui`:
```rust
#[utoipa::path(post, path = "/api/v1/external/auth/login",
    request_body = LoginDto,
    responses(
        (status = 200, body = TokenResponseDto),
        (status = 401, body = ErrorDto),
    ), tag = "external/auth")]
async fn login(/* ... */) -> impl Responder { /* ... */ }
```

**Laravel** — `scribe` or `l5-swagger`:
```php
/** @OA\Post(path="/api/v1/external/auth/login", tags={"external/auth"}, ...) */
public function login(LoginRequest $request): JsonResponse { }
```

---

## 10. Caching — Strategy / Adapter Pattern

Cache implementations **must** use the **Strategy + Adapter pattern**.
Application code depends only on `CachePort` — never on a concrete driver.

```
CachePort (interface)
  ⇢ RedisCacheAdapter
  ⇢ FileCacheAdapter
  ⇢ SqliteCacheAdapter
```

- `CachePort` exposes: `get(key)`, `set(key, value, ttl)`, `delete(key)`, `flush(prefix)`.
- Active driver selected via `CACHE_DRIVER=redis|file|sqlite`.
- Cache keys are **namespaced**: `{module}:{resource}:{id}` (e.g., `users:profile:42`).
- TTL must always be explicit — no implicit infinite caching.
- Services **inject** the cache port — never instantiate a driver directly.
- Token blacklist uses the same `CachePort` pattern (`TOKEN_BLACKLIST_DRIVER=redis|sqlite|db`).

---

## 11. External API Services

Every third-party API integration lives in its own file under `services/external/`.

- One file per provider: `StripeApiService`, `SendGridApiService`, `TwilioApiService`.
- Each implements an **adapter interface** so it can be swapped or mocked.
- All HTTP calls include: timeout, retry logic (max 3, exponential backoff), structured error mapping.
- Credentials from environment variables only — never hardcoded.
- Responses mapped to internal DTOs before being returned to the UseCase.
- Log every outbound call: `provider`, `endpoint`, `duration_ms`, `status_code`.

---

## 12. LLM API Services

All LLM integrations under `services/llm/` follow the same adapter pattern.

| File                    | Provider                  |
|-------------------------|---------------------------|
| `HuggingFaceLlmService` | HuggingFace Inference API |
| `ElevenLabsLlmService`  | ElevenLabs (TTS/Voice)    |
| `OpenAiLlmService`      | OpenAI (ChatGPT, Whisper) |
| `AnthropicLlmService`   | Claude API                |
| `OllamaLlmService`      | Local models (Ollama)     |

**`LlmPort` interface exposes:**
```
complete(prompt, options)    → text completion
embed(text)                  → vector embedding
transcribe(audio)            → speech to text
synthesize(text, voice)      → text to speech
stream(prompt, options)      → streaming completion (SSE / WebSocket)
```

- Active provider via `LLM_PROVIDER=huggingface|openai|anthropic|ollama`.
- Prompt templates in `prompts/{feature}/{action}.txt` — never inline.
- Token usage logged per call: `provider`, `model`, `prompt_tokens`, `completion_tokens`, `cost_estimate`.
- Streaming responses handled with backpressure-safe iterators/generators.
- Model name and parameters (`temperature`, `max_tokens`) configurable per environment.

---

## 13. Module Structure

Each feature is a self-contained module. Example for `users`:

```
modules/
└── users/
    ├── controllers/
    │   ├── CreateUserController.{rs|py|php}
    │   ├── GetUserController.{rs|py|php}
    │   └── DeleteUserController.{rs|py|php}
    ├── usecases/
    │   ├── CreateUserUseCase.{rs|py|php}
    │   ├── GetUserUseCase.{rs|py|php}
    │   └── DeleteUserUseCase.{rs|py|php}
    ├── services/
    │   └── UserService.{rs|py|php}
    ├── repositories/
    │   └── UserRepository.{rs|py|php}
    ├── models/
    │   └── UserModel.{rs|py|php}
    ├── dto/
    │   ├── CreateUserDto.{rs|py|php}
    │   └── UserResponseDto.{rs|py|php}
    ├── serializers/
    │   ├── UserJsonSerializer.{rs|py|php}
    │   ├── UserCsvSerializer.{rs|py|php}
    │   └── UserXmlSerializer.{rs|py|php}
    ├── cache/
    │   └── UserCache.{rs|py|php}
    └── routes.{rs|py|php}

modules/auth/          (see §16)
modules/notifications/ (see §18)

services/
├── external/
│   ├── StripeApiService.{rs|py|php}
│   └── SendGridApiService.{rs|py|php}
└── llm/
    ├── ports/LlmPort.{rs|py|php}
    ├── HuggingFaceLlmService.{rs|py|php}
    ├── ElevenLabsLlmService.{rs|py|php}
    └── OllamaLlmService.{rs|py|php}

cache/
├── ports/CachePort.{rs|py|php}
├── RedisCacheAdapter.{rs|py|php}
├── FileCacheAdapter.{rs|py|php}
└── SqliteCacheAdapter.{rs|py|php}

prompts/
└── {feature}/{action}.txt | .md

database/
├── views/{Resource}_{action}_view.sql
└── rpc/{domain}/rpc_{domain}_{action}.sql
```

---

## 14. Data Response — `view_sql` Pattern

Any endpoint returning structured data (JSON, XML, CSV) **must** route its read query through a `view_sql` call.

### 14.1 Read Path Flow

```
Request
  ⇢ Controller    → parses filters, format (json|xml|csv), pagination
  ⇢ UseCase       → applies authorization checks, passes params
  ⇢ Repository    → calls view_sql(query, params)
  ⇢ view_sql      → executes JOIN query, returns raw rows
  ⇢ Serializer    → formats rows into JSON | XML | CSV
  ⇢ Controller    → returns response with correct Content-Type
```

- Write paths (create/update/delete) use Repository → Model → Database.
- `view_sql` is pure SQL: SELECT, JOIN, WHERE, ORDER, LIMIT — **no business logic**.
- The Repository is the **only** layer allowed to call `view_sql`.

### 14.2 view_sql File Rules

Files live in `database/views/`, named `{Resource}_{action}_view.sql`.
Every file requires the standard header comment (see §5 header template, adapted for SQL).
Parameters are always **named and bound** — never string-interpolated.

### 14.3 Response Format Negotiation

Priority order:
1. Query param `?format=csv`
2. `Accept` header: `application/json` | `application/xml` | `text/csv`
3. Default: `application/json`

```
application/json  → { "data": [...], "meta": { "page": 1, "total": 200 } }
application/xml   → <response><data>...</data><meta>...</meta></response>
text/csv          → header row + data rows, UTF-8 with BOM, Content-Disposition: attachment
```

### 14.4 Serializer Rules

- One serializer per resource per format: `UserJsonSerializer`, `UserCsvSerializer`, `UserXmlSerializer`.
- Serializers receive raw DTO rows — they never call the database.
- Datasets >1000 rows must use **streaming serialization** — no full in-memory accumulation.

---

## 15. Traceability & Logging

- Every inbound request receives a **Trace ID** (`X-Trace-ID` header or auto-generated UUID v7).
- Trace ID propagates through: Controller → UseCase → Service → Repository → External calls.
- Structured JSON logging only. Fields: `trace_id`, `module`, `action`, `duration_ms`, `status`, `user_id?`.
- Log levels: `DEBUG` (dev), `INFO` (staging), `WARN`/`ERROR` (production).
- Never log raw passwords, tokens, or PII — mask sensitive fields.
- Log `WARN` if any UseCase exceeds **500ms**, `ERROR` if it exceeds **2000ms**.

---

## 16. Error Handling

- All errors are typed and mapped to HTTP status codes **at the Controller layer only**.
- UseCases throw/return domain errors: `UserNotFoundError`, `DuplicateEmailError`, etc.
- Never expose stack traces or internal messages in production API responses.
- All error responses follow the consistent envelope:

```json
{
  "success": false,
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "No user found with this identifier.",
    "trace_id": "abc-123"
  }
}
```

---

## 17. Auth System — Adapter Pattern

The auth system is built on an **`AuthProviderPort`** interface.
Multiple providers can run **in parallel** — the system selects or chains them based on config.

### 17.1 AuthProviderPort Interface

```
AuthProviderPort
  ├── register(dto)                    → UserEntity + TokenPair
  ├── login(credentials)               → TokenPair
  ├── refresh(refreshToken)            → TokenPair
  ├── revoke(token)                    → void
  ├── revokeAll(userId)                → void
  ├── validate(accessToken)            → UserClaims
  ├── getUser(userId)                  → UserEntity
  └── linkOAuth(provider, code, userId)→ void
```

### 17.2 Implemented Adapters

```
AuthProviderPort
  ├── LocalAuthAdapter        → JWT + Argon2id, full local control
  ├── SupabaseAuthAdapter     → Supabase Auth (GoTrue), RLS-aware
  ├── FirebaseAuthAdapter     → Firebase Authentication
  ├── ChainedAuthProvider     → runs multiple adapters in priority order
  └── OAuthAdapter
        ├── GoogleOAuthAdapter
        ├── GithubOAuthAdapter
        ├── FacebookOAuthAdapter
        └── AppleOAuthAdapter
```

### 17.3 Parallel / Chained Provider Config

```env
# Single provider
AUTH_PROVIDER=local

# Parallel: first success wins
AUTH_PROVIDER=supabase,local

# Primary + fallback
AUTH_PROVIDER_PRIMARY=supabase
AUTH_PROVIDER_FALLBACK=local
```

`AuthProviderResolver` (factory) builds the correct chain at startup:

```python
class AuthProviderResolver:
    def resolve(self) -> AuthProviderPort:
        providers = settings.AUTH_PROVIDER.split(",")
        if len(providers) == 1:
            return self._build(providers[0])
        return ChainedAuthProvider([self._build(p) for p in providers])
```

```rust
pub fn resolve_auth_provider(config: &Config) -> Arc<dyn AuthProviderPort> {
    match config.auth_provider.as_str() {
        "supabase" => Arc::new(SupabaseAuthAdapter::new(config)),
        "local"    => Arc::new(LocalAuthAdapter::new(config)),
        _          => panic!("Unknown AUTH_PROVIDER"),
    }
}
```

### 17.4 Supported Auth Strategies

| Strategy       | Use Case                             |
|----------------|--------------------------------------|
| **JWT**        | Stateless API auth (default)         |
| **OAuth 2.0**  | Third-party login (Google, GitHub…)  |
| **Session**    | Server-side session (web apps)       |
| **API Key**    | Machine-to-machine / service accounts|
| **Magic Link** | Passwordless email login             |

### 17.5 Token Lifecycle — Required UseCases (one file per action)

```
modules/auth/usecases/
  ├── RegisterUseCase            → create account + issue tokens
  ├── LoginUseCase               → verify credentials + issue tokens
  ├── RefreshTokenUseCase        → validate refresh token + rotate
  ├── RevokeTokenUseCase         → blacklist / delete token
  ├── RevokeAllTokensUseCase     → logout from all devices
  ├── ValidateTokenUseCase       → verify signature + expiry + blacklist
  ├── InitiateOAuthUseCase       → redirect to provider
  ├── OAuthCallbackUseCase       → exchange code + issue tokens
  ├── RequestMagicLinkUseCase    → generate + send magic link
  ├── ConsumeMagicLinkUseCase    → validate link + issue tokens
  ├── ChangePasswordUseCase      → verify old + hash new + revoke all tokens
  └── ImpersonateUseCase         → admin-only, scoped token
```

### 17.6 JWT Rules

- **Access token** TTL: 15 minutes (`JWT_ACCESS_TTL=900`).
- **Refresh token** TTL: 7 days (`JWT_REFRESH_TTL=604800`), **rotated on every use**.
- Signed with **RS256** in production, HS256 in local dev only.
- Payload: `sub`, `iat`, `exp`, `jti` (unique ID), `roles`, `scope`.
- `jti` stored in token blacklist on revocation; checked on **every** protected request.
- Never store tokens in `localStorage` — use `httpOnly` cookies or secure memory.

### 17.7 OAuth 2.0 Rules

- Each provider is a separate adapter: `GoogleOAuthAdapter`, `GithubOAuthAdapter`.
- All implement `OAuthProviderPort`: `getAuthUrl()`, `exchangeCode()`, `getUserInfo()`.
- Provider tokens (access + refresh) stored **encrypted at rest** — never plain columns.

### 17.8 Session Rules

- Server-side only. `SESSION_DRIVER=redis|db|file`.
- Session ID in `httpOnly`, `Secure`, `SameSite=Strict` cookie.
- Regenerated on login and privilege escalation.
- Absolute TTL: 8 hours. Idle TTL: 2 hours.

### 17.9 API Key Rules

- Hashed (SHA-256) before storage — only prefix shown after creation.
- Keys carry `scope` list and optional `expires_at`.
- Actions: `CreateApiKeyUseCase`, `ListApiKeysUseCase`, `RevokeApiKeyUseCase`.
- Rate limiting applied per key via middleware.

### 17.10 Auth Module Structure

```
modules/auth/
├── ports/
│   └── AuthProviderPort.{rs|py|php}
├── adapters/
│   ├── LocalAuthAdapter.{rs|py|php}
│   ├── SupabaseAuthAdapter.{rs|py|php}
│   ├── FirebaseAuthAdapter.{rs|py|php}
│   ├── ChainedAuthProvider.{rs|py|php}
│   └── oauth/
│       ├── GoogleOAuthAdapter.{rs|py|php}
│       └── GithubOAuthAdapter.{rs|py|php}
├── resolver/
│   └── AuthProviderResolver.{rs|py|php}
├── controllers/
│   ├── RegisterController.{rs|py|php}
│   ├── LoginController.{rs|py|php}
│   ├── RefreshTokenController.{rs|py|php}
│   ├── RevokeTokenController.{rs|py|php}
│   ├── OAuthCallbackController.{rs|py|php}
│   └── MagicLinkController.{rs|py|php}
├── usecases/      (see §17.5)
├── services/
│   ├── TokenService.{rs|py|php}
│   ├── PasswordService.{rs|py|php}
│   ├── BlacklistService.{rs|py|php}
│   └── TwoFactorService.{rs|py|php}
├── repositories/
│   ├── TokenRepository.{rs|py|php}
│   └── ApiKeyRepository.{rs|py|php}
├── middleware/
│   ├── AuthMiddleware.{rs|py|php}
│   ├── RoleMiddleware.{rs|py|php}
│   ├── RateLimitMiddleware.{rs|py|php}
│   └── TwoFactorMiddleware.{rs|py|php}
├── dto/
│   ├── LoginDto.{rs|py|php}
│   ├── TokenResponseDto.{rs|py|php}
│   └── ApiKeyDto.{rs|py|php}
└── routes.{rs|py|php}
```

### 17.11 Auth Response Envelope

```json
{
  "success": true,
  "data": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "token_type": "Bearer",
    "expires_in": 900,
    "scope": ["read", "write"]
  }
}
```

### 17.12 Security Requirements

- Passwords hashed with **Argon2id** (preferred) or bcrypt (cost ≥ 12).
- Brute-force: lock after 5 failed attempts within 10 minutes.
- All auth events logged (append-only): `login`, `logout`, `token_refresh`, `token_revoke`, `oauth_link`, `password_change` — with `trace_id`, `user_id`, `ip`, `user_agent`.
- HTTPS enforced — auth endpoints reject plain HTTP in staging and production.

---

## 18. Two-Factor Authentication (2FA)

2FA is optional per user, **mandatory** for roles defined in `TWO_FACTOR_REQUIRED_ROLES`.
All methods implement `TwoFactorPort`.

### 18.1 TwoFactorPort Interface

```
TwoFactorPort
  ├── enroll(userId)               → EnrollmentDto
  ├── verify(userId, code)         → bool
  ├── generateBackupCodes(userId)  → string[]
  ├── disable(userId, code)        → void
  └── getStatus(userId)            → TwoFactorStatusDto
```

### 18.2 Supported Adapters

```
TwoFactorPort
  ├── TotpAdapter           → RFC 6238 TOTP (Google Authenticator, Authy)
  ├── SmsOtpAdapter         → OTP via SMS
  ├── WhatsAppOtpAdapter    → OTP via WhatsApp Business API
  ├── EmailOtpAdapter       → OTP via email
  └── BackupCodeAdapter     → one-time backup codes (always available)
```

`TWO_FACTOR_METHODS=totp,sms,whatsapp`

### 18.3 2FA Login Flow

```
POST /api/v1/external/auth/login
  → valid credentials + 2FA enabled
  → return { requires_2fa: true, challenge_token: "<15min JWT>" }

POST /api/v1/external/auth/2fa/verify
  Body: { challenge_token, code, method: "totp|sms|whatsapp|email|backup" }
  → TwoFactorService.verify(userId, code, method)
  → success: return full TokenPair
  → fail (5x): lock account
```

### 18.4 2FA Routes

```
POST   /api/v1/external/auth/2fa/verify
POST   /api/v1/external/auth/2fa/enroll
POST   /api/v1/external/auth/2fa/enroll/confirm
DELETE /api/v1/external/auth/2fa/disable
GET    /api/v1/external/auth/2fa/backup-codes
POST   /api/v1/external/auth/2fa/backup-codes/regenerate
GET    /api/v1/external/auth/2fa/status
```

---

## 19. Notification System — Adapter Pattern

All channels implement `NotificationPort`. `NotificationService` resolves the correct adapter per channel.

### 19.1 NotificationPort Interface

```
NotificationPort
  ├── send(recipient, message, options)              → NotificationResult
  ├── sendTemplate(recipient, templateId, variables) → NotificationResult
  ├── getStatus(notificationId)                      → NotificationStatus
  └── supports(channel)                              → bool
```

### 19.2 Supported Adapters

```
NotificationPort
  ├── email/
  │   ├── SmtpEmailAdapter          → Generic SMTP
  │   ├── SendGridEmailAdapter       → SendGrid API
  │   ├── MailgunEmailAdapter        → Mailgun API
  │   ├── GmailAdapter               → Gmail SMTP / Google Workspace
  │   └── SesEmailAdapter            → AWS SES
  ├── sms/
  │   ├── TwilioSmsAdapter           → Twilio SMS API
  │   ├── AwsSnsAdapter              → AWS SNS SMS
  │   └── VonageSmsAdapter           → Vonage (Nexmo) SMS
  ├── whatsapp/
  │   ├── WhatsAppBusinessAdapter    → Meta WhatsApp Business Cloud API
  │   └── TwilioWhatsAppAdapter      → Twilio WhatsApp channel
  └── push/
      ├── FcmPushAdapter             → Firebase Cloud Messaging
      └── ApnsPushAdapter            → Apple Push Notification Service
```

```env
NOTIFICATION_EMAIL_DRIVER=sendgrid
NOTIFICATION_SMS_DRIVER=twilio
NOTIFICATION_WHATSAPP_DRIVER=whatsapp_business
NOTIFICATION_PUSH_DRIVER=fcm
```

### 19.3 WhatsApp Business Adapter (example implementation)

```python
# WhatsAppBusinessAdapter.py
"""
Action: Send messages via Meta's WhatsApp Business Cloud API.
Input:  recipient (E.164), message text or template_id + variables
Output: NotificationResult(provider_message_id, status)
"""
class WhatsAppBusinessAdapter(NotificationPort):
    BASE_URL = "https://graph.facebook.com/v19.0"

    def send(self, recipient: str, message: str, options: dict = {}) -> NotificationResult:
        return self._post({"messaging_product": "whatsapp", "to": recipient,
                           "type": "text", "text": {"body": message}})

    def send_template(self, recipient: str, template_id: str, variables: list) -> NotificationResult:
        return self._post({"messaging_product": "whatsapp", "to": recipient,
                           "type": "template", "template": {
                               "name": template_id, "language": {"code": "en_US"},
                               "components": [{"type": "body",
                                   "parameters": [{"type": "text", "text": v} for v in variables]}]
                           }})

    def _post(self, payload: dict) -> NotificationResult:
        r = httpx.post(f"{self.BASE_URL}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages",
                       headers={"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"},
                       json=payload, timeout=10)
        r.raise_for_status()
        return NotificationResult(provider_message_id=r.json()["messages"][0]["id"], status="sent")
```

### 19.4 OTP Notification Flow

```
NotificationService.sendOtp(userId, channel, code)
  ⇢ resolve adapter for channel (sms | whatsapp | email)
  ⇢ load template from templates/{channel}/otp.txt
  ⇢ render: { code, expiry_minutes, app_name }
  ⇢ adapter.send(recipient, rendered_message)
  ⇢ log to notification_logs (template_id + recipient only — never the code)
  ⇢ return NotificationResult
```

### 19.5 Notification Module Structure

```
modules/notifications/
├── ports/NotificationPort.{rs|py|php}
├── adapters/
│   ├── email/{Smtp|SendGrid|Mailgun|Gmail|Ses}EmailAdapter.{rs|py|php}
│   ├── sms/{Twilio|AwsSns|Vonage}SmsAdapter.{rs|py|php}
│   ├── whatsapp/{WhatsAppBusiness|TwilioWhatsApp}Adapter.{rs|py|php}
│   └── push/{Fcm|Apns}PushAdapter.{rs|py|php}
├── services/NotificationService.{rs|py|php}
├── usecases/
│   ├── SendNotificationUseCase.{rs|py|php}
│   ├── SendTemplatedNotificationUseCase.{rs|py|php}
│   └── GetNotificationStatusUseCase.{rs|py|php}
├── repositories/NotificationLogRepository.{rs|py|php}
├── templates/
│   ├── email/{welcome,otp}.html
│   ├── sms/otp.txt
│   └── whatsapp/otp.txt
└── controllers/NotificationController.{rs|py|php}  ← internal segment only
```

### 19.6 Notification Routes

```
POST /api/v1/internal/notifications/send
POST /api/v1/internal/notifications/send-template
GET  /api/v1/internal/notifications/{id}/status
POST /api/v1/external/auth/notifications/resend-otp
```

### 19.7 Notification Rules

- All outbound calls: **timeout 10s**, **retry max 3** with exponential backoff.
- Failed notifications queued for retry (Redis worker / Laravel Queue / Tokio task).
- OTP codes expire in **10 minutes**, single-use — invalidated immediately after verification.
- Phone numbers stored in **E.164 format** only.
- Email addresses normalized (lowercased, trimmed) before sending.
- WhatsApp Business templates must be **pre-approved by Meta** before production use.

---

## 20. Testing Requirements

| Layer           | Test Type          | Minimum Coverage |
|-----------------|--------------------|-----------------|
| UseCase         | Unit               | 90%             |
| Service         | Unit + Integration | 80%             |
| Repository      | Integration        | 70%             |
| Controller      | E2E / HTTP         | Key flows only  |
| Auth Adapter    | Unit (mocked)      | All methods     |
| LLM Service     | Unit (mocked)      | All methods     |
| Notification    | Unit per adapter   | All channels    |
| Cache           | Unit per adapter   | All drivers     |

- External APIs, LLM services, and notification providers are **always mocked** in tests.
- Each test file mirrors its source: `CreateUserUseCase` → `CreateUserUseCase.test.{rs|py|php}`.
- 2FA flows must be tested with both valid and expired/reused codes.

---

## 21. Environment & Configuration Reference

```env
# ── Framework ────────────────────────────────────
APP_ENV=development              # development | staging | production
APP_PORT=8000
APP_URL=https://api.example.com

# ── Auth ─────────────────────────────────────────
AUTH_PROVIDER=supabase,local
AUTH_PROVIDER_FALLBACK=local
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=604800
JWT_ALGORITHM=RS256
TWO_FACTOR_METHODS=totp,sms,whatsapp
TWO_FACTOR_REQUIRED_ROLES=admin,super_admin

# ── RPC ──────────────────────────────────────────
SERVICE_TOKEN=<rotated-per-deploy>
RPC_ALLOWLIST_PATH=config/rpc_allowlist.toml

# ── Cache ─────────────────────────────────────────
CACHE_DRIVER=redis
REDIS_URL=redis://localhost:6379
TOKEN_BLACKLIST_DRIVER=redis
SESSION_DRIVER=redis

# ── LLM ──────────────────────────────────────────
LLM_PROVIDER=huggingface
HUGGINGFACE_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434

# ── Notifications ─────────────────────────────────
NOTIFICATION_EMAIL_DRIVER=sendgrid
NOTIFICATION_SMS_DRIVER=twilio
NOTIFICATION_WHATSAPP_DRIVER=whatsapp_business
NOTIFICATION_PUSH_DRIVER=fcm
SENDGRID_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
FCM_SERVER_KEY=

# ── Supabase ──────────────────────────────────────
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # backend only — never expose to client

# ── Docs ─────────────────────────────────────────
DOCS_ENABLED=true
DOCS_REQUIRE_AUTH=true
DOCS_IP_ALLOWLIST=10.0.0.0/8,127.0.0.1
```

---

## 22. Production Readiness Checklist

Before declaring any route production-ready:

- [ ] URL follows `/api/v{n}/{segment}/{domain}/{action?}`
- [ ] Correct segment with its full middleware stack applied
- [ ] Route documented in OpenAPI spec (params, types, all error codes, rate limits)
- [ ] Auth level matches segment; RLS policies on affected tables verified
- [ ] File header comment present with action, input, output, side effects
- [ ] One file per action — no logic shared between unrelated actions
- [ ] Cache keys namespaced; TTL explicit
- [ ] view_sql used for all read endpoints returning structured data
- [ ] Serializer used per format (JSON / XML / CSV)
- [ ] 2FA challenge enforced for sensitive operations
- [ ] RPC functions in allowlist if route calls `/rpc` segment
- [ ] Notifications tested with sandbox credentials; templates approved (WhatsApp)
- [ ] Auth provider chain configured and fallback tested
- [ ] Deprecation header set if route replaces an older version
- [ ] Trace ID propagated end-to-end; performance thresholds logged

---

---

## 23. Actix Web — Official Extras & Middleware

All Actix Web backends **must** use the official `actix-extras` crates for cross-cutting concerns.
Never reimplement what these crates already provide.

### 23.1 Cargo.toml — Required Dependencies

```toml
[dependencies]
# Core
actix-web          = "4"

# actix-extras (official)
actix-cors         = "0.7"          # CORS controls
actix-identity     = "0.7"          # Identity / session-backed user management
actix-limitation   = "0.5"          # Redis-backed fixed-window rate limiting
actix-protobuf     = "0.10"         # Protobuf payload extractor
actix-session      = { version = "0.9", features = ["redis-session"] }
actix-settings     = "0.8"          # TOML + env var config management
actix-web-httpauth = "0.8"          # HTTP auth schemes (Bearer, Basic, Digest)
actix-ws           = "0.3"          # WebSockets without actors

# Observability
tracing-actix-web  = "0.7"          # Structured logging middleware (OpenTelemetry-compatible)
tracing            = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
```

### 23.2 `actix-cors` — Cross-Origin Resource Sharing

Apply per segment — public segments allow broader origins, internal/admin segments are locked down.

```rust
// src/middleware/cors.rs
//! # CorsMiddleware
//!
//! Action: Configures CORS per segment (external = permissive, admin/internal = strict).
//! Side effects: Adds Access-Control-* headers to all responses.

use actix_cors::Cors;
use actix_web::http;

pub fn external_cors() -> Cors {
    Cors::default()
        .allowed_origin_fn(|origin, _| {
            // Allow configured origins from env
            std::env::var("CORS_ALLOWED_ORIGINS")
                .unwrap_or_default()
                .split(',')
                .any(|o| o.trim() == origin.to_str().unwrap_or(""))
        })
        .allowed_methods(vec!["GET", "POST", "PUT", "PATCH", "DELETE"])
        .allowed_headers(vec![
            http::header::AUTHORIZATION,
            http::header::CONTENT_TYPE,
            http::header::ACCEPT,
        ])
        .expose_headers(vec!["X-Trace-ID", "X-RateLimit-Remaining"])
        .max_age(3600)
}

pub fn admin_cors() -> Cors {
    Cors::default()
        .allowed_origin("https://admin.example.com")
        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
        .allowed_headers(vec![http::header::AUTHORIZATION, http::header::CONTENT_TYPE])
        .max_age(600)
}

pub fn internal_cors() -> Cors {
    Cors::default()  // No cross-origin — internal calls are same-network
        .allowed_origin("http://localhost")
        .allowed_methods(vec!["POST"])
}
```

```env
CORS_ALLOWED_ORIGINS=https://app.example.com,https://www.example.com
```

### 23.3 `actix-identity` — Identity Management

Use `actix-identity` for **session-backed user identity** (web apps, admin panels).
Works on top of `actix-session` — always pair them together.

```rust
// src/middleware/identity.rs
//! # IdentityMiddleware
//!
//! Action: Wraps actix-identity over actix-session to provide login/logout identity tracking.
//! Input:  Configured SessionMiddleware (see §23.4)
//! Side effects: Attaches Identity extractor to request pipeline.

use actix_identity::IdentityMiddleware;
use actix_web::web;

pub fn configure_identity() -> IdentityMiddleware {
    IdentityMiddleware::builder()
        .visit_deadline(Some(std::time::Duration::from_secs(7200))) // 2h idle
        .build()
}

// In a controller:
use actix_identity::Identity;
use actix_web::{HttpRequest, HttpResponse};

pub async fn login(request: HttpRequest, identity: Option<Identity>) -> HttpResponse {
    // After credential verification by LoginUseCase:
    Identity::login(&request.extensions(), user_id.to_string()).unwrap();
    HttpResponse::Ok().json(response)
}

pub async fn logout(identity: Identity) -> HttpResponse {
    identity.logout();
    HttpResponse::Ok().finish()
}
```

### 23.4 `actix-session` — Session Management

```rust
// src/middleware/session.rs
//! # SessionMiddleware
//!
//! Action: Configures Redis-backed sessions with secure, httpOnly, SameSite=Strict cookies.
//! Input:  REDIS_URL, SESSION_SECRET_KEY from env
//! Side effects: Attaches session store to every request.

use actix_session::{SessionMiddleware, storage::RedisSessionStore};
use actix_web::cookie::{Key, SameSite};

pub async fn build_session_middleware() -> SessionMiddleware<RedisSessionStore> {
    let store = RedisSessionStore::new(
        std::env::var("REDIS_URL").expect("REDIS_URL required")
    ).await.expect("Redis session store failed");

    let secret_key = Key::from(
        std::env::var("SESSION_SECRET_KEY")
            .expect("SESSION_SECRET_KEY required")
            .as_bytes()
    );

    SessionMiddleware::builder(store, secret_key)
        .cookie_secure(true)                        // HTTPS only
        .cookie_http_only(true)                     // No JS access
        .cookie_same_site(SameSite::Strict)         // CSRF protection
        .cookie_name("sid".to_string())
        .session_lifecycle(
            actix_session::config::PersistentSession::default()
                .session_ttl(actix_web::cookie::time::Duration::hours(8))
        )
        .build()
}
```

### 23.5 `actix-limitation` — Rate Limiting

Redis-backed fixed-window rate limiting applied at the segment middleware level.

```rust
// src/middleware/rate_limit.rs
//! # RateLimitMiddleware
//!
//! Action: Applies per-IP or per-token fixed-window rate limiting via Redis.
//! Input:  REDIS_URL, RATE_LIMIT_RPM from env
//! Side effects: Returns 429 with Retry-After header when limit exceeded.

use actix_limitation::{Limiter, RateLimiter};
use std::sync::Arc;

pub async fn build_rate_limiter() -> Arc<Limiter> {
    Arc::new(
        Limiter::builder(
            std::env::var("REDIS_URL").expect("REDIS_URL required")
        )
        .limit(
            std::env::var("RATE_LIMIT_RPM")
                .unwrap_or("60".into())
                .parse()
                .unwrap()
        )
        .period(std::time::Duration::from_secs(60))
        .build()
        .await
        .expect("Rate limiter init failed")
    )
}

// Register on scopes:
// web::scope("/external").wrap(RateLimiter::default())
```

Rate limit response headers:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1719484800
Retry-After: 37          ← only on 429
```

### 23.6 `actix-web-httpauth` — HTTP Authentication Schemes

Use for **Bearer token** validation middleware on protected routes.

```rust
// src/middleware/auth.rs
//! # BearerAuthMiddleware
//!
//! Action: Extracts and validates Bearer JWT on protected routes.
//! Input:  Authorization: Bearer <token> header
//! Output: Injects validated UserClaims into request data

use actix_web_httpauth::{
    extractors::bearer::{BearerAuth, Config},
    middleware::HttpAuthentication,
};

async fn bearer_validator(
    req: ServiceRequest,
    credentials: BearerAuth,
) -> Result<ServiceRequest, (Error, ServiceRequest)> {
    let token = credentials.token();
    match validate_token(token).await {
        Ok(claims) => {
            req.extensions_mut().insert(claims);
            Ok(req)
        }
        Err(_) => {
            let config = req.app_data::<Config>()
                .cloned()
                .unwrap_or_default()
                .scope("api");
            Err((AuthenticationError::from(config).into(), req))
        }
    }
}

// Apply to admin scope:
// web::scope("/admin").wrap(HttpAuthentication::bearer(bearer_validator))
```

### 23.7 `actix-protobuf` — Protobuf Payload Extractor

Use for **high-throughput internal / system routes** where JSON overhead is unacceptable.

```rust
// src/dto/proto/orders.proto (compile with prost-build)
// message PlaceOrderRequest { string user_id = 1; repeated OrderItem items = 2; }

use actix_protobuf::ProtoBuf;

//! # PlaceOrderController (Protobuf variant)
//!
//! Action: Accepts Protobuf-encoded order payload on internal segment.
//! Content-Type: application/protobuf
pub async fn place_order_proto(
    body: ProtoBuf<PlaceOrderRequest>,
) -> impl Responder {
    let dto = body.0;
    // pass to PlaceOrderUseCase...
    HttpResponse::Ok().protobuf(response).unwrap()
}
```

Rules:
- Protobuf is used only on `internal` and `rpc` segments — never on `external` (clients use JSON).
- `.proto` files live in `src/dto/proto/` and are compiled at build time via `build.rs`.
- Always version proto messages: `PlaceOrderRequestV1`, `PlaceOrderRequestV2`.

### 23.8 `actix-settings` — TOML + Env Config Management

```toml
# config/settings.toml
[actix]
hosts = [{ host = "0.0.0.0", port = 8000 }]
num_workers = "auto"
backlog = 1024
max_connections = 25000
max_connection_rate = 256
keep_alive = { secs = 75, nanos = 0 }
client_timeout = { secs = 5, nanos = 0 }
client_shutdown = { secs = 5, nanos = 0 }
tls = { enabled = false }

[application]
env = "${APP_ENV}"
redis_url = "${REDIS_URL}"
database_url = "${DATABASE_URL}"
```

```rust
// src/settings.rs
use actix_settings::{AppsettingsError, BasicSettings};

#[derive(Debug, Clone, serde::Deserialize)]
pub struct AppSettings {
    pub env: String,
    pub redis_url: String,
    pub database_url: String,
}

// In main():
let settings = BasicSettings::<AppSettings>::parse_toml("config/settings.toml")
    .expect("Failed to parse settings");
// env vars override TOML values automatically
```

### 23.9 `actix-ws` — WebSockets (Actor-free)

For real-time features: live notifications, chat, streaming LLM responses, live dashboards.

```rust
// src/modules/realtime/controllers/WsController.rs
//! # WsController
//!
//! Action: Upgrades HTTP connection to WebSocket for real-time event streaming.
//! Input:  GET /api/v1/external/realtime/ws (with valid JWT in query or header)
//! Output: WebSocket stream of ServerSentEvent payloads
//! Side effects: Spawns async task per connection; subscribes to Redis pub/sub channel.

use actix_ws::AggregatedMessage;

pub async fn ws_handler(
    req: HttpRequest,
    stream: web::Payload,
    claims: web::Data<UserClaims>,
) -> impl Responder {
    let (res, mut session, mut stream) = actix_ws::handle(&req, stream)?;

    actix_web::rt::spawn(async move {
        while let Some(Ok(msg)) = stream.recv().await {
            match msg {
                AggregatedMessage::Text(text) => {
                    // Handle incoming client message
                    session.text(text).await.unwrap();
                }
                AggregatedMessage::Ping(bytes) => {
                    session.pong(&bytes).await.unwrap();
                }
                AggregatedMessage::Close(reason) => {
                    session.close(reason).await.unwrap();
                    break;
                }
                _ => {}
            }
        }
    });

    Ok::<_, actix_web::Error>(res)
}
```

WebSocket route registered on `external` segment:
```
GET /api/v1/external/realtime/ws        → live event stream (JWT via ?token= or header)
GET /api/v1/internal/realtime/broadcast → admin broadcast to all connected clients
```

### 23.10 `tracing-actix-web` — Structured Request Logging

Every Actix Web backend uses `tracing-actix-web` as the **single logging middleware**.
Produces structured JSON spans compatible with OpenTelemetry, Jaeger, and Datadog.

```rust
// src/main.rs
use tracing_actix_web::TracingLogger;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

fn init_tracing() {
    tracing_subscriber::registry()
        .with(EnvFilter::from_default_env())       // RUST_LOG=info,actix_web=warn
        .with(tracing_subscriber::fmt::layer()
            .json()                                // structured JSON output
            .with_current_span(true)
            .with_span_list(true))
        .init();
}

HttpServer::new(|| {
    App::new()
        .wrap(TracingLogger::default())            // ← applied first, outermost
        .wrap(session_middleware)
        .wrap(cors)
        // ... routes
})
```

`TracingLogger` automatically records per request:
```json
{
  "trace_id": "abc123",
  "span_id": "def456",
  "method": "POST",
  "path": "/api/v1/external/auth/login",
  "status": 200,
  "duration_ms": 42,
  "user_agent": "...",
  "ip": "1.2.3.4"
}
```

Rules:
- `TracingLogger` is always the **outermost** wrapper — before CORS, rate limit, and auth.
- Use `tracing::instrument` on all UseCase and Service methods for automatic span nesting.
- Log level controlled via `RUST_LOG` env var per module.

---

## 24. Worker System — Queues, Messaging & Background Jobs

All backends support asynchronous processing via a pluggable worker system.
Workers follow the same **one file = one action** rule as the request pipeline.

### 24.1 WorkerPort — Adapter Interface

```
WorkerPort
  ├── publish(topic, payload, options) → MessageId
  ├── subscribe(topic, handler)        → Subscription
  ├── acknowledge(messageId)           → void
  ├── reject(messageId, requeue)       → void
  └── getStatus(messageId)            → MessageStatus
```

### 24.2 Supported Backends

```
WorkerPort
  ├── KafkaWorkerAdapter      → Apache Kafka (high-throughput event streaming)
  ├── RabbitMqWorkerAdapter   → RabbitMQ (AMQP, task queues, fanout)
  ├── RedisWorkerAdapter      → Redis Streams / BullMQ (lightweight queues)
  └── DatabaseWorkerAdapter   → PostgreSQL-backed queue (simple, no extra infra)
```

Active backend via: `WORKER_DRIVER=kafka|rabbitmq|redis|database`

### 24.3 Cargo Dependencies (Rust)

```toml
# Kafka
rdkafka = { version = "0.36", features = ["cmake-build"] }

# RabbitMQ
lapin    = "2"                  # AMQP 0-9-1 client
tokio-executor-trait = "2"

# Redis Streams
redis = { version = "0.25", features = ["tokio-comp", "streams"] }

# Background task scheduling
tokio-cron-scheduler = "0.10"
```

### 24.4 Kafka Integration

```rust
// src/workers/kafka/KafkaWorkerAdapter.rs
//! # KafkaWorkerAdapter
//!
//! Action: Publishes and consumes messages via Apache Kafka.
//! Input:  KAFKA_BROKERS, KAFKA_GROUP_ID from env
//! Side effects: Maintains persistent consumer group offsets.

use rdkafka::{
    producer::{FutureProducer, FutureRecord},
    consumer::{StreamConsumer, Consumer, CommitMode},
    ClientConfig, Message,
};

pub struct KafkaWorkerAdapter {
    producer: FutureProducer,
    consumer: StreamConsumer,
}

impl KafkaWorkerAdapter {
    pub fn new() -> Self {
        let producer = ClientConfig::new()
            .set("bootstrap.servers", env("KAFKA_BROKERS"))
            .set("message.timeout.ms", "5000")
            .create::<FutureProducer>()
            .expect("Kafka producer failed");

        let consumer: StreamConsumer = ClientConfig::new()
            .set("bootstrap.servers", env("KAFKA_BROKERS"))
            .set("group.id", env("KAFKA_GROUP_ID"))
            .set("enable.auto.commit", "false")        // manual ack
            .set("auto.offset.reset", "earliest")
            .create()
            .expect("Kafka consumer failed");

        Self { producer, consumer }
    }

    pub async fn publish(&self, topic: &str, key: &str, payload: &[u8]) {
        self.producer
            .send(FutureRecord::to(topic).key(key).payload(payload),
                  std::time::Duration::from_secs(5))
            .await
            .expect("Kafka publish failed");
    }

    pub async fn subscribe(&self, topics: &[&str], handler: impl Fn(Vec<u8>) + Send + 'static) {
        self.consumer.subscribe(topics).expect("Kafka subscribe failed");
        loop {
            match self.consumer.recv().await {
                Ok(msg) => {
                    if let Some(payload) = msg.payload() {
                        handler(payload.to_vec());
                        self.consumer.commit_message(&msg, CommitMode::Async).unwrap();
                    }
                }
                Err(e) => tracing::error!("Kafka recv error: {:?}", e),
            }
        }
    }
}
```

### 24.5 RabbitMQ Integration

```rust
// src/workers/rabbitmq/RabbitMqWorkerAdapter.rs
//! # RabbitMqWorkerAdapter
//!
//! Action: Task queue publishing and consumption via AMQP (RabbitMQ).
//! Input:  RABBITMQ_URL from env
//! Side effects: Creates durable queues and exchanges on first connect.

use lapin::{
    Connection, ConnectionProperties, Channel,
    options::*, types::FieldTable,
    BasicProperties, ExchangeKind,
};

pub struct RabbitMqWorkerAdapter {
    channel: Channel,
}

impl RabbitMqWorkerAdapter {
    pub async fn new() -> Self {
        let conn = Connection::connect(
            &env("RABBITMQ_URL"),
            ConnectionProperties::default(),
        ).await.expect("RabbitMQ connection failed");

        let channel = conn.create_channel().await.expect("Channel failed");

        // Declare durable dead-letter exchange
        channel.exchange_declare("dlx", ExchangeKind::Direct,
            ExchangeDeclareOptions { durable: true, ..Default::default() },
            FieldTable::default()).await.unwrap();

        Self { channel }
    }

    pub async fn publish(&self, queue: &str, payload: &[u8]) {
        self.channel.basic_publish("", queue,
            BasicPublishOptions::default(),
            payload,
            BasicProperties::default().with_delivery_mode(2), // persistent
        ).await.unwrap().await.unwrap();
    }

    pub async fn consume(&self, queue: &str, handler: impl Fn(Vec<u8>) + Send + 'static) {
        // Declare durable queue with DLX
        let mut args = FieldTable::default();
        args.insert("x-dead-letter-exchange".into(), "dlx".into());

        self.channel.queue_declare(queue,
            QueueDeclareOptions { durable: true, ..Default::default() },
            args).await.unwrap();

        let mut consumer = self.channel.basic_consume(queue, "worker",
            BasicConsumeOptions::default(), FieldTable::default()).await.unwrap();

        while let Some(Ok(delivery)) = consumer.next().await {
            handler(delivery.data.clone());
            delivery.ack(BasicAckOptions::default()).await.unwrap();
        }
    }
}
```

### 24.6 Worker File Structure

```
workers/
├── ports/
│   └── WorkerPort.{rs|py|php}
├── adapters/
│   ├── KafkaWorkerAdapter.{rs|py|php}
│   ├── RabbitMqWorkerAdapter.{rs|py|php}
│   ├── RedisWorkerAdapter.{rs|py|php}
│   └── DatabaseWorkerAdapter.{rs|py|php}
├── handlers/                          ← one file per job type (one file = one action)
│   ├── SendEmailJobHandler.{rs|py|php}
│   ├── ProcessOrderJobHandler.{rs|py|php}
│   ├── RefreshMaterializedViewHandler.{rs|py|php}
│   └── SyncEmbeddingsJobHandler.{rs|py|php}
├── scheduler/
│   └── TaskScheduler.{rs|py|php}
└── WorkerRegistry.{rs|py|php}         ← maps topic/queue names to handlers
```

### 24.7 Worker Rules

- One handler file per job type — same `one file = one action` rule as the rest of the backend.
- Handlers **never** call Controllers or touch HTTP context — they call UseCases directly.
- All jobs are **idempotent** — safe to retry on failure without side effects.
- Jobs carry the originating `trace_id` so the full trace spans request + async processing.
- Dead-letter queue (DLQ) configured for all queues — failed messages never silently dropped.
- Max retry count per job type configured in `WorkerRegistry`; after exhaustion → DLQ + alert.
- Queue/topic names follow: `{env}.{domain}.{action}` (e.g., `prod.orders.placed`).

---

## 25. Task Scheduling

Scheduled tasks use `tokio-cron-scheduler` (Rust), `APScheduler` (Python/FastAPI), or Laravel Scheduler (PHP).

### 25.1 Scheduler Rules

- One file per scheduled task — same naming convention: `{Action}{Resource}Task`.
- Tasks call **UseCases** — never repositories or DB directly.
- Cron expressions documented inline with the task.
- All tasks emit a `trace_id` for observability.
- Tasks are **idempotent** — safe if triggered twice within the same window.

### 25.2 Rust — `tokio-cron-scheduler`

```rust
// src/workers/scheduler/TaskScheduler.rs
//! # TaskScheduler
//!
//! Action: Registers and runs all periodic background tasks.
//! Side effects: Triggers UseCases on cron schedule; emits trace spans per execution.

use tokio_cron_scheduler::{JobScheduler, Job};

pub async fn start_scheduler() {
    let sched = JobScheduler::new().await.unwrap();

    // Refresh materialized views every 5 minutes
    sched.add(Job::new_async("0 */5 * * * *", |_uuid, _lock| Box::pin(async {
        tracing::info!(task = "RefreshDashboardStats", "Running");
        refresh_dashboard_stats_use_case().await;
    })).unwrap()).await.unwrap();

    // Clean expired tokens every hour
    sched.add(Job::new_async("0 0 * * * *", |_uuid, _lock| Box::pin(async {
        tracing::info!(task = "PurgeExpiredTokens", "Running");
        purge_expired_tokens_use_case().await;
    })).unwrap()).await.unwrap();

    sched.start().await.unwrap();
}
```

### 25.3 Common Scheduled Tasks

| Task                              | Schedule         | UseCase called                      |
|-----------------------------------|------------------|-------------------------------------|
| Refresh `mv_dashboard_stats`      | Every 5 min      | `RefreshDashboardStatsUseCase`      |
| Purge expired auth tokens         | Every hour       | `PurgeExpiredTokensUseCase`         |
| Sync LLM embeddings               | Every 30 min     | `SyncDocumentEmbeddingsUseCase`     |
| Retry failed notifications        | Every 2 min      | `RetryFailedNotificationsUseCase`   |
| Archive old partitions            | Daily at 02:00   | `ArchiveOldEventPartitionsUseCase`  |
| Rotate API key secrets            | Weekly           | `RotateExpiredApiKeysUseCase`       |

---

## 26. File Upload

All frameworks handle file uploads through a unified `FileUploadService` backed by a pluggable storage adapter.

### 26.1 StoragePort Interface

```
StoragePort
  ├── upload(file, path, options)    → StorageResult { url, key, size, mime }
  ├── delete(key)                    → void
  ├── getUrl(key, expiry?)           → string       ← signed URL if private
  └── exists(key)                    → bool
```

```
StoragePort
  ├── LocalStorageAdapter      → disk (dev only)
  ├── S3StorageAdapter         → AWS S3 / Supabase Storage / MinIO
  └── GcsStorageAdapter        → Google Cloud Storage
```

`STORAGE_DRIVER=local|s3|gcs`

### 26.2 Upload Rules

- Max file size enforced at middleware level (not in UseCase): `UPLOAD_MAX_SIZE_MB=10`.
- Allowed MIME types validated server-side — never trust client `Content-Type`.
- Files are **renamed on upload**: `{uuid}.{ext}` — original filename stored in DB metadata only.
- Virus scanning hook in `FileUploadService` (configurable: `UPLOAD_SCAN_ENABLED=true`).
- Private files served via **signed URLs** with short expiry (default 15 minutes).
- Upload route on `external` segment: `POST /api/v1/external/files/upload`.
- Multipart streaming — files are **never fully buffered** in memory; streamed directly to storage.

### 26.3 Rust — Actix Web Multipart

```rust
// src/modules/files/controllers/UploadFileController.rs
//! # UploadFileController
//!
//! Action: Streams multipart file upload to storage via FileUploadUseCase.
//! Input:  multipart/form-data with file field
//! Output: FileResponseDto { id, url, size, mime, created_at }
//! Max size enforced by MultipartFormConfig.

use actix_multipart::Multipart;
use futures_util::TryStreamExt;

pub async fn upload(
    mut payload: Multipart,
    upload_use_case: web::Data<FileUploadUseCase>,
) -> impl Responder {
    while let Some(mut field) = payload.try_next().await? {
        let content_type = field.content_type().cloned();
        let filename = field.content_disposition()
            .get_filename()
            .map(str::to_owned)
            .unwrap_or_default();

        let mut bytes = web::BytesMut::new();
        while let Some(chunk) = field.try_next().await? {
            bytes.extend_from_slice(&chunk);
        }

        let result = upload_use_case
            .execute(bytes.freeze(), filename, content_type)
            .await?;

        return HttpResponse::Created().json(result);
    }
    HttpResponse::BadRequest().finish()
}
```

---

## 27. Compression

Response compression is applied at the framework middleware level — never in business logic.

### 27.1 Rules

- Enable compression for all `external` and `admin` segment responses.
- Use **Brotli** (preferred) with **Gzip** as fallback, based on `Accept-Encoding` header.
- Never compress: already-compressed formats (`image/jpeg`, `image/png`, `video/*`, `application/zip`).
- Minimum response size for compression: **1 KB** — skip for small payloads.
- Streaming responses (WebSocket, SSE) are **not compressed** at middleware level.

### 27.2 Rust — Actix Web

```rust
use actix_web::middleware::Compress;
use actix_web::middleware::DefaultHeaders;

App::new()
    .wrap(Compress::default())   // Auto-negotiates brotli / gzip / deflate
    .wrap(DefaultHeaders::new()
        .add(("Vary", "Accept-Encoding")))
```

### 27.3 FastAPI / Python

```python
# pip install brotli-asgi
from brotli_asgi import BrotliMiddleware
app.add_middleware(BrotliMiddleware, minimum_size=1024, gzip_fallback=True)
```

### 27.4 Laravel / PHP

```php
// config/middleware.php — apply globally
\Illuminate\Http\Middleware\GzipMiddleware::class,
```

---

## 28. Events (Internal Event Bus)

An internal event bus decouples domain actions from their side effects.
Domain events flow: UseCase emits → EventBus dispatches → EventHandler reacts.

### 28.1 EventBusPort Interface

```
EventBusPort
  ├── emit(event)               → void
  ├── subscribe(eventType, handler) → void
  └── unsubscribe(eventType)    → void
```

```
EventBusPort
  ├── InMemoryEventBus          → local (dev / monolith)
  ├── RedisEventBus             → Redis pub/sub (distributed)
  ├── KafkaEventBus             → Kafka topics (high-throughput)
  └── RabbitMqEventBus          → RabbitMQ fanout exchange
```

`EVENT_BUS_DRIVER=memory|redis|kafka|rabbitmq`

### 28.2 Event Naming Convention

```
{Domain}.{Resource}.{Action}    →  orders.order.placed
                                    auth.user.registered
                                    files.document.uploaded
                                    notifications.email.delivered
```

### 28.3 Event File Structure

```
events/
├── ports/
│   └── EventBusPort.{rs|py|php}
├── adapters/
│   ├── InMemoryEventBus.{rs|py|php}
│   ├── RedisEventBus.{rs|py|php}
│   ├── KafkaEventBus.{rs|py|php}
│   └── RabbitMqEventBus.{rs|py|php}
├── definitions/                     ← one file per event (one file = one action)
│   ├── OrderPlacedEvent.{rs|py|php}
│   ├── UserRegisteredEvent.{rs|py|php}
│   └── DocumentUploadedEvent.{rs|py|php}
└── handlers/                        ← one file per reaction
    ├── SendWelcomeEmailOnUserRegistered.{rs|py|php}
    ├── SyncEmbeddingsOnDocumentUploaded.{rs|py|php}
    └── NotifyAdminOnOrderPlaced.{rs|py|php}
```

### 28.4 Rust — Event Example

```rust
// events/definitions/OrderPlacedEvent.rs
//! # OrderPlacedEvent
//!
//! Action: Domain event emitted after rpc_orders_place succeeds.
//! Payload: order_id, user_id, total_amount, item_count, trace_id

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OrderPlacedEvent {
    pub order_id:     uuid::Uuid,
    pub user_id:      uuid::Uuid,
    pub total_amount: f64,
    pub item_count:   u32,
    pub trace_id:     String,
    pub occurred_at:  chrono::DateTime<chrono::Utc>,
}
```

```rust
// events/handlers/NotifyAdminOnOrderPlaced.rs
//! # NotifyAdminOnOrderPlaced
//!
//! Action: Sends admin push notification when an order is placed above threshold.
//! Input:  OrderPlacedEvent
//! Side effects: Calls SendNotificationUseCase

pub async fn handle(event: OrderPlacedEvent, use_case: Arc<SendNotificationUseCase>) {
    if event.total_amount >= 500.0 {
        use_case.execute(SendNotificationDto {
            channel: "push",
            recipient: "admin-topic",
            template_id: "admin.high_value_order",
            variables: vec![event.order_id.to_string(), event.total_amount.to_string()],
        }).await.ok();
    }
}
```

### 28.5 Event Rules

- Events are **immutable value objects** — never mutated after emission.
- All events carry `trace_id` and `occurred_at` timestamp.
- Handlers must be **idempotent** — safe to replay on failure.
- Events are **persisted** to an `event_store` table before dispatching (outbox pattern).
- The outbox is processed by a worker — guarantees at-least-once delivery.

---

## 29. Cookies

Cookie management follows strict security defaults across all backends.

### 29.1 Rules

| Property      | Required Value            | Reason                          |
|---------------|---------------------------|---------------------------------|
| `HttpOnly`    | `true`                    | No JS access — XSS protection   |
| `Secure`      | `true` (prod/staging)     | HTTPS only                      |
| `SameSite`    | `Strict` (auth cookies)   | CSRF protection                 |
| `SameSite`    | `Lax` (preference cookies)| Allow top-level navigation      |
| `Path`        | `/api`                    | Scope to API routes only        |
| `Domain`      | explicit                  | Never wildcard in production    |
| `Max-Age`     | explicit                  | Never rely on session-only      |

### 29.2 Cookie Types & Naming

| Cookie name     | Purpose                        | SameSite | TTL        |
|-----------------|--------------------------------|----------|------------|
| `sid`           | Session ID                     | Strict   | 8h         |
| `rt`            | Refresh token (httpOnly)       | Strict   | 7d         |
| `csrf`          | CSRF token (readable by JS)    | Strict   | Session    |
| `locale`        | User language preference       | Lax      | 1 year     |
| `theme`         | UI theme preference            | Lax      | 1 year     |

### 29.3 Rust — Cookie Handling

```rust
// Setting a secure auth cookie
use actix_web::cookie::{Cookie, SameSite};
use time::Duration;

fn make_refresh_cookie(token: &str) -> Cookie<'static> {
    Cookie::build("rt", token.to_owned())
        .http_only(true)
        .secure(true)
        .same_site(SameSite::Strict)
        .path("/api/v1/external/auth")   // scoped to auth routes only
        .max_age(Duration::days(7))
        .finish()
}

// Reading a cookie
pub async fn refresh(req: HttpRequest) -> impl Responder {
    let token = req.cookie("rt")
        .map(|c| c.value().to_owned())
        .ok_or(AppError::Unauthorized("Missing refresh token"))?;
    // pass to RefreshTokenUseCase...
}
```

### 29.4 Cookie Security Rules

- **Never** store JWT access tokens in cookies accessible to JavaScript — use `httpOnly`.
- CSRF protection: double-submit cookie pattern or `SameSite=Strict` on all auth cookies.
- Cookie signing: all cookies set by the backend are **signed** with `actix-session`'s secret key.
- On logout: **explicitly expire** all auth cookies (`Max-Age=0`) — don't rely on client deletion.
- In development (`APP_ENV=development`): `Secure=false` is acceptable; document this explicitly.

---

## 30. Updated Production Readiness Checklist

Before declaring any route or feature production-ready:

- [ ] URL follows `/api/v{n}/{segment}/{domain}/{action?}`
- [ ] Correct segment with its full middleware stack applied (see §7)
- [ ] `actix-cors` configured per segment — never use `Cors::permissive()` in production
- [ ] `tracing-actix-web` registered as **outermost** middleware
- [ ] `actix-limitation` applied on `external` and `admin` segments
- [ ] `actix-session` using Redis backend with secure cookie flags
- [ ] File header comment on every file (action, input, output, side effects)
- [ ] One file per action — no multi-action files
- [ ] Cache keys namespaced; TTL explicit
- [ ] `view_sql` used for all read endpoints returning structured data
- [ ] Serializer per format (JSON / XML / CSV)
- [ ] Compression middleware active; MIME type exclusions verified
- [ ] File uploads: MIME validated, renamed, streamed (not buffered), size limited
- [ ] Events emitted for all state-changing domain actions; handlers idempotent
- [ ] Worker handlers idempotent; DLQ configured; trace_id propagated
- [ ] Scheduled tasks logged with trace_id; idempotent on double-trigger
- [ ] Cookies: HttpOnly, Secure, SameSite=Strict on auth cookies; explicit Max-Age
- [ ] 2FA challenge enforced for sensitive operations
- [ ] RPC proxy functions in allowlist; typed error mapping from DB exceptions
- [ ] Notifications tested with sandbox; WhatsApp templates approved
- [ ] Auth provider chain and fallback configured and tested
- [ ] Deprecation header set if route replaces an older version
- [ ] Trace ID propagated end-to-end; WARN >500ms, ERROR >2000ms

---

*Last updated: 2026 — maintain this file alongside any new route, adapter, module, or auth strategy.*