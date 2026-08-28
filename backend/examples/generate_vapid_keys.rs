//! `examples/generate_vapid_keys.rs` — Generates one VAPID keypair
//! (RFC 8292) in exactly the encoding `Settings::vapid_public_key`/
//! `vapid_private_key` and `WebPushCrypto::VapidKeys::from_env` expect
//! (base64url, no padding: 32-byte raw scalar private key, 65-byte
//! uncompressed-point public key) and prints them ready to paste into
//! `docker-compose.yml`/your env.
//!
//! Uses the same `p256`/`base64` machinery as `WebPushCrypto` itself
//! (verified against RFC 8291's own known-answer vector — see that
//! module's tests), rather than a hand-rolled DER-slicing one-liner in
//! another language that has no equivalent test coverage here.
//!
//! Run: `cargo run --example generate_vapid_keys`

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::SecretKey;
use rand::rngs::OsRng;

fn main() {
    let secret = SecretKey::random(&mut OsRng);
    let private_b64 = URL_SAFE_NO_PAD.encode(secret.to_bytes());
    let public_b64 = URL_SAFE_NO_PAD.encode(secret.public_key().to_encoded_point(false).as_bytes());

    println!("VAPID_PUBLIC_KEY={public_b64}");
    println!("VAPID_PRIVATE_KEY={private_b64}");
    println!("VAPID_SUBJECT=mailto:ops@example.com");
}
