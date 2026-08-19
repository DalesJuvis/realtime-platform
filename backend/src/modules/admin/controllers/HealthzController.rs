//! # HealthzController
//!
//! **Action:** Liveness probe.
//! **Input:** `GET /api/v1/system/health` (no auth — system segment).
//! **Output:** `200 OK`, body `"ok"`.
//! **Side effects:** None.
//! **Dependencies:** None.

pub async fn handle() -> &'static str {
    "ok"
}
