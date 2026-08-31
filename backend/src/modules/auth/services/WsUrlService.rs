//! # WsUrlService
//!
//! **Action:** Derives the WebSocket URL a client should actually dial,
//! returned alongside every minted client token so no SDK ever has to
//! guess/hardcode a host, port, or `ws`/`wss` scheme itself.
//! **Input:** The token-minting HTTP request's own headers, plus an
//! optional operator-configured override (`Settings::public_ws_url`).
//! **Output:** A complete `ws://`/`wss://.../ws` URL string.
//! **Side effects:** None — pure function.
//! **Dependencies:** `axum::http::HeaderMap`.
//!
//! ## Why deriving from the request works in production, unprompted
//! `Caddyfile` proxies both `/api/*` and `/ws` under the exact same
//! `{$DOMAIN}` site block — whatever host+scheme a client's backend used
//! to reach `POST /api/v1/auth/tokens` (or the Portal API's own
//! `POST /api/v1/portal/tokens`) is *always* the right host+scheme for
//! the WS upgrade too, in every documented production topology
//! (`docker-compose.prod.yml`, `docker-compose.shared-proxy.yml`). Caddy
//! sets `X-Forwarded-Proto` on every proxied request by default, which is
//! what actually tells us `https` happened even though Caddy terminates
//! TLS and forwards to this service over plain HTTP internally.
//!
//! ## Why `Settings::public_ws_url` still exists
//! Local dev / `docker-compose.yml`'s 2-instance demo has no reverse
//! proxy unifying the ports: the Portal API and the WS server listen on
//! two genuinely different ports (8090 vs 8080), so the incoming
//! request's own `Host` header (`localhost:8090`) is the *wrong* one to
//! reuse for `/ws` — swapping only the path would silently point at a
//! port nothing is listening on for WebSocket upgrades. The explicit
//! override exists for exactly that case (and any other topology where
//! the two aren't on the same public host+scheme) — set once, used
//! as-is, no derivation attempted.

use axum::http::HeaderMap;

/// Returns the override if configured; otherwise derives
/// `{ws|wss}://{host}/ws` from the request's own `Host` and
/// `X-Forwarded-Proto` headers, defaulting to `ws://localhost/ws` if even
/// `Host` is somehow absent (should not happen for a real HTTP request,
/// but this function never panics on a malformed/missing header either way).
pub fn derive_ws_url(headers: &HeaderMap, configured_override: Option<&str>) -> String {
    if let Some(url) = configured_override {
        return url.to_string();
    }

    let host = headers
        .get(axum::http::header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("localhost");

    let secure = headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .map(|proto| proto.eq_ignore_ascii_case("https"))
        .unwrap_or(false);

    let scheme = if secure { "wss" } else { "ws" };
    format!("{scheme}://{host}/ws")
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn configured_override_wins_regardless_of_headers() {
        let mut headers = HeaderMap::new();
        headers.insert(axum::http::header::HOST, HeaderValue::from_static("example.com"));
        headers.insert("x-forwarded-proto", HeaderValue::from_static("https"));

        assert_eq!(
            derive_ws_url(&headers, Some("ws://localhost:8080/ws")),
            "ws://localhost:8080/ws"
        );
    }

    #[test]
    fn derives_wss_behind_a_tls_terminating_proxy() {
        let mut headers = HeaderMap::new();
        headers.insert(axum::http::header::HOST, HeaderValue::from_static("mio.example.com"));
        headers.insert("x-forwarded-proto", HeaderValue::from_static("https"));

        assert_eq!(derive_ws_url(&headers, None), "wss://mio.example.com/ws");
    }

    #[test]
    fn derives_plain_ws_without_a_forwarded_https_proto() {
        let mut headers = HeaderMap::new();
        headers.insert(axum::http::header::HOST, HeaderValue::from_static("localhost:8090"));

        assert_eq!(derive_ws_url(&headers, None), "ws://localhost:8090/ws");
    }

    #[test]
    fn falls_back_to_localhost_when_host_header_is_absent() {
        let headers = HeaderMap::new();
        assert_eq!(derive_ws_url(&headers, None), "ws://localhost/ws");
    }
}
