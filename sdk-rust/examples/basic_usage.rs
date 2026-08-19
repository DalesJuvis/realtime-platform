//! `examples/basic_usage.rs` — Utilisation minimale du SDK.
//!
//! `cargo run --example basic_usage`

use std::time::Duration;

use realtime_sdk::{ClientConfig, RealtimeClient};
use uuid::Uuid;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let config = ClientConfig {
        url: "wss://realtime.example.com/ws".to_string(),
        tenant_id: Uuid::parse_str("12345678-9abc-def0-1122-334455667788").unwrap(),
        token: std::env::var("REALTIME_TOKEN").unwrap_or_default(),
        ..Default::default()
    };

    let client = RealtimeClient::connect(config);

    let mut orders_rx = client.subscribe("orders:42");
    let mut wildcard_rx = client.subscribe("orders:*");

    tokio::spawn(async move {
        while let Ok(msg) = orders_rx.recv().await {
            println!("[orders:42] {}", msg.payload);
        }
    });

    tokio::spawn(async move {
        while let Ok(msg) = wildcard_rx.recv().await {
            println!("[wildcard orders:*] {} -> {}", msg.channel_id, msg.payload);
        }
    });

    // Laisse le temps à la connexion + AUTH + SUB de s'établir avant de
    // publier — dans une vraie application, préférez réagir à un
    // évènement de connexion plutôt qu'un délai fixe (ce SDK n'expose pas
    // encore d'évènement "authenticated" explicite comme le SDK TS ;
    // amélioration possible en v2).
    tokio::time::sleep(Duration::from_millis(500)).await;

    client.publish("orders:42", "commande créée").ok();
    client.unicast("user-789", "message direct").ok();
    client.replay("orders:42", 0).ok();

    tokio::signal::ctrl_c().await.ok();
    client.disconnect();
}
