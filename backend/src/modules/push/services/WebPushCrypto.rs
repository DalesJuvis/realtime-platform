//! # WebPushCrypto
//!
//! **Action:** VAPID (RFC 8292) request-authorization signing and
//! `aes128gcm` (RFC 8291 / RFC 8188) payload encryption for browser Web
//! Push — the two pieces of crypto a push send needs, independent of how
//! the encrypted body actually gets to the push service (see
//! `adapters::WebPushAdapter` for the HTTP send).
//! **Input:** A VAPID keypair (from `Settings`), a subscriber's
//! `p256dh`/`auth` keys, a plaintext payload.
//! **Output:** A signed `Authorization` header value; an encrypted body
//! ready to POST as `Content-Encoding: aes128gcm`.
//! **Side effects:** None — pure functions plus one RNG draw per encryption
//! (a fresh ephemeral ECDH keypair and a fresh salt, both mandatory per
//! RFC 8291 — reusing either across sends would break forward secrecy).
//! **Dependencies:** `p256`, `hkdf`, `aes-gcm`, `sha2`, `base64`, `chrono`.
//!
//! Implemented from the RFC text directly (no bundled `web-push` crate:
//! its only HTTP-client backends are `isahc`/`hyper`, and this backend
//! already standardizes on `reqwest` — see `WebPushAdapter`). Verified
//! against RFC 8291 Appendix A's own known-answer vector in the test
//! below, fetched verbatim from the published RFC text — this is real,
//! byte-exact validation of the crypto, not just "it compiles and runs
//! without erroring." What is **not** verified in this environment: an
//! actual send against a live browser push service (Chrome/Firefox), for
//! which there is no way to get a real subscription without a real
//! browser. Test against a real subscription before trusting this in
//! production.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes128Gcm, Nonce};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use hkdf::Hkdf;
use p256::ecdsa::signature::Signer;
use p256::ecdsa::{Signature, SigningKey};
use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::{PublicKey, SecretKey};
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::Sha256;

#[derive(Debug, thiserror::Error)]
pub enum WebPushCryptoError {
    #[error("invalid base64url encoding")]
    Base64(#[from] base64::DecodeError),
    #[error("invalid P-256 key")]
    InvalidKey,
    #[error("HKDF expand failed (invalid output length)")]
    Hkdf,
    #[error("AEAD encryption failed")]
    Aead,
}

/// A VAPID keypair, loaded once at startup (`Settings::vapid_public_key`/
/// `vapid_private_key`/`vapid_subject`) and reused for every push send —
/// unlike the per-send ephemeral ECDH keypair in [`encrypt_aes128gcm`],
/// this one is meant to stay stable: it is how a push service recognizes
/// repeated sends as coming from the same sender.
pub struct VapidKeys {
    signing_key: SigningKey,
    public_key_b64url: String,
    subject: String,
}

impl VapidKeys {
    /// `private_key_b64url`: base64url (no padding) of the raw 32-byte
    /// P-256 private scalar — the same encoding `web-push`/`pywebpush`
    /// and browser DevTools produce. `subject`: a `mailto:` or `https:`
    /// URL identifying the sender, per RFC 8292 §2.
    pub fn from_env(private_key_b64url: &str, subject: String) -> Result<Self, WebPushCryptoError> {
        let raw = URL_SAFE_NO_PAD.decode(private_key_b64url)?;
        let secret = SecretKey::from_slice(&raw).map_err(|_| WebPushCryptoError::InvalidKey)?;
        let signing_key = SigningKey::from(&secret);
        let public_key_b64url = encode_public_key(&secret.public_key());
        Ok(Self { signing_key, public_key_b64url, subject })
    }

    /// Uncompressed public key, base64url — this is `applicationServerKey`
    /// on the browser side (`PushManager.subscribe({ applicationServerKey })`),
    /// and the `k=` parameter of every `Authorization` header this signs.
    pub fn public_key_b64url(&self) -> &str {
        &self.public_key_b64url
    }

    /// Builds one push send's `Authorization: vapid t=<jwt>, k=<publicKey>`
    /// header value (RFC 8292 §3.2). `audience` must be the push service's
    /// origin (`scheme://host`, no path) — the JWT `aud` claim is checked
    /// exactly against it, so this is computed fresh per subscription's
    /// endpoint, not cached across different push services.
    pub fn authorization_header(&self, audience: &str) -> String {
        format!("vapid t={}, k={}", self.sign_jwt(audience), self.public_key_b64url)
    }

    fn sign_jwt(&self, audience: &str) -> String {
        let header = URL_SAFE_NO_PAD.encode(br#"{"typ":"JWT","alg":"ES256"}"#);
        let exp = (chrono::Utc::now() + chrono::Duration::hours(12)).timestamp();
        // `audience`/`subject` are server-controlled (push service origin,
        // `Settings::vapid_subject`), never end-user input — safe to
        // interpolate into this fixed-shape JSON without an escaper.
        let claims = format!(r#"{{"aud":"{audience}","exp":{exp},"sub":"{}"}}"#, self.subject);
        let payload = URL_SAFE_NO_PAD.encode(claims.as_bytes());
        let signing_input = format!("{header}.{payload}");

        // Deterministic ECDSA (RFC 6979, `p256`'s default `Signer` impl) —
        // no RNG involved, so this is reproducible for the same inputs.
        let signature: Signature = self.signing_key.sign(signing_input.as_bytes());
        let sig_b64 = URL_SAFE_NO_PAD.encode(signature.to_bytes());
        format!("{signing_input}.{sig_b64}")
    }
}

fn encode_public_key(public: &PublicKey) -> String {
    URL_SAFE_NO_PAD.encode(public.to_encoded_point(false).as_bytes())
}

/// Encrypts `payload` for one subscriber per RFC 8291 (`aes128gcm` content
/// coding, RFC 8188). Draws a fresh ephemeral ECDH keypair and a fresh
/// 16-byte salt from the OS RNG — mandatory per-send randomness, not a
/// place to inject determinism outside of tests (see
/// `encrypt_aes128gcm_with` below, which the known-answer test calls
/// directly with the RFC's fixed values instead).
///
/// Returns the raw body to POST as `Content-Encoding: aes128gcm` — the
/// header (salt + record size + sender's ephemeral public key) followed by
/// the AES-128-GCM ciphertext, exactly as the wire format expects; no
/// further encoding (this is binary, not base64) on top.
pub fn encrypt_aes128gcm(payload: &[u8], p256dh_b64url: &str, auth_b64url: &str) -> Result<Vec<u8>, WebPushCryptoError> {
    let ua_public_bytes = URL_SAFE_NO_PAD.decode(p256dh_b64url)?;
    let ua_public = PublicKey::from_sec1_bytes(&ua_public_bytes).map_err(|_| WebPushCryptoError::InvalidKey)?;
    let auth_secret = URL_SAFE_NO_PAD.decode(auth_b64url)?;

    let as_secret = SecretKey::random(&mut OsRng);
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);

    encrypt_aes128gcm_with(payload, &ua_public_bytes, &ua_public, &auth_secret, &as_secret, &salt)
}

fn encrypt_aes128gcm_with(
    payload: &[u8],
    ua_public_bytes: &[u8],
    ua_public: &PublicKey,
    auth_secret: &[u8],
    as_secret: &SecretKey,
    salt: &[u8; 16],
) -> Result<Vec<u8>, WebPushCryptoError> {
    let as_public_point = as_secret.public_key().to_encoded_point(false);
    let as_public_bytes = as_public_point.as_bytes();

    let shared = p256::elliptic_curve::ecdh::diffie_hellman(as_secret.to_nonzero_scalar(), ua_public.as_affine());
    let ecdh_secret = shared.raw_secret_bytes();

    // RFC 8291 §3.4: info = "WebPush: info" || 0x00 || ua_public || as_public.
    let mut key_info = Vec::with_capacity(14 + 65 + 65);
    key_info.extend_from_slice(b"WebPush: info\0");
    key_info.extend_from_slice(ua_public_bytes);
    key_info.extend_from_slice(as_public_bytes);

    let stage1 = Hkdf::<Sha256>::new(Some(auth_secret), ecdh_secret.as_slice());
    let mut ikm = [0u8; 32];
    stage1.expand(&key_info, &mut ikm).map_err(|_| WebPushCryptoError::Hkdf)?;

    // RFC 8188 §2.1 ("aes128gcm"): CEK/nonce derived from IKM + a per-record salt.
    let stage2 = Hkdf::<Sha256>::new(Some(salt), &ikm);
    let mut cek = [0u8; 16];
    stage2.expand(b"Content-Encoding: aes128gcm\0", &mut cek).map_err(|_| WebPushCryptoError::Hkdf)?;
    let mut nonce_bytes = [0u8; 12];
    stage2.expand(b"Content-Encoding: nonce\0", &mut nonce_bytes).map_err(|_| WebPushCryptoError::Hkdf)?;

    // Single record (web push payloads are always small): delimiter 0x02
    // marks it as the last (and only) record, no padding beyond that byte.
    let mut plaintext = Vec::with_capacity(payload.len() + 1);
    plaintext.extend_from_slice(payload);
    plaintext.push(0x02);

    let cipher = Aes128Gcm::new_from_slice(&cek).map_err(|_| WebPushCryptoError::Aead)?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, plaintext.as_slice()).map_err(|_| WebPushCryptoError::Aead)?;

    // RFC 8188 §2.1 header: salt(16) || record_size(4, BE) || keyid_len(1) || keyid(as_public, 65).
    let mut body = Vec::with_capacity(16 + 4 + 1 + as_public_bytes.len() + ciphertext.len());
    body.extend_from_slice(salt);
    body.extend_from_slice(&4096u32.to_be_bytes());
    body.push(as_public_bytes.len() as u8);
    body.extend_from_slice(as_public_bytes);
    body.extend_from_slice(&ciphertext);

    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    // RFC 8291 Appendix A, "Encryption of a Push Message" — fetched
    // verbatim from https://www.rfc-editor.org/rfc/rfc8291.html. A
    // byte-exact match against the RFC's own worked example is the
    // strongest verification available without a live browser/push
    // service in this environment.
    const UA_PUBLIC: &str =
        "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    const AUTH_SECRET: &str = "BTBZMqHH6r4Tts7J_aSIgg";
    const AS_PRIVATE: &str = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
    const SALT: &str = "DGv6ra1nlYgDCS1FRnbzlw";
    const PLAINTEXT_B64: &str = "V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24";
    const EXPECTED_BODY: &str = "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";

    #[test]
    fn rfc8291_known_answer_vector() {
        let ua_public_bytes = URL_SAFE_NO_PAD.decode(UA_PUBLIC).unwrap();
        let ua_public = PublicKey::from_sec1_bytes(&ua_public_bytes).unwrap();
        let auth_secret = URL_SAFE_NO_PAD.decode(AUTH_SECRET).unwrap();
        let as_secret = SecretKey::from_slice(&URL_SAFE_NO_PAD.decode(AS_PRIVATE).unwrap()).unwrap();
        let salt_bytes = URL_SAFE_NO_PAD.decode(SALT).unwrap();
        let salt: [u8; 16] = salt_bytes.try_into().unwrap();
        let plaintext = URL_SAFE_NO_PAD.decode(PLAINTEXT_B64).unwrap();
        assert_eq!(plaintext, b"When I grow up, I want to be a watermelon");

        let body = encrypt_aes128gcm_with(&plaintext, &ua_public_bytes, &ua_public, &auth_secret, &as_secret, &salt).unwrap();

        assert_eq!(URL_SAFE_NO_PAD.encode(&body), EXPECTED_BODY);
    }

    #[test]
    fn vapid_jwt_is_well_formed_and_self_verifies() {
        // No RFC8292 test vector to check against, unlike the encryption
        // above — this instead checks internal consistency: the JWT this
        // produces must actually verify under the public key it also
        // reports, using the exact algorithm (ES256, raw r||s signature)
        // a push service expects.
        use p256::ecdsa::signature::Verifier;
        use p256::ecdsa::VerifyingKey;

        let private = SecretKey::random(&mut OsRng);
        let private_b64 = URL_SAFE_NO_PAD.encode(private.to_bytes());
        let vapid = VapidKeys::from_env(&private_b64, "mailto:ops@example.com".to_string()).unwrap();

        let header_value = vapid.authorization_header("https://fcm.googleapis.com");
        let jwt = header_value.strip_prefix("vapid t=").unwrap().split(", k=").next().unwrap();
        let parts: Vec<&str> = jwt.split('.').collect();
        assert_eq!(parts.len(), 3);

        let signing_input = format!("{}.{}", parts[0], parts[1]);
        let sig_bytes = URL_SAFE_NO_PAD.decode(parts[2]).unwrap();
        let signature = Signature::from_slice(&sig_bytes).unwrap();
        let verifying_key = VerifyingKey::from(&private.public_key());
        assert!(verifying_key.verify(signing_input.as_bytes(), &signature).is_ok());

        let claims_json = String::from_utf8(URL_SAFE_NO_PAD.decode(parts[1]).unwrap()).unwrap();
        assert!(claims_json.contains(r#""aud":"https://fcm.googleapis.com""#));
        assert!(claims_json.contains(r#""sub":"mailto:ops@example.com""#));
    }
}
