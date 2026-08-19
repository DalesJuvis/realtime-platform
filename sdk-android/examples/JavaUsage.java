package com.yourorg.realtimesdk.examples;

import com.yourorg.realtimesdk.ConnectionEvent;
import com.yourorg.realtimesdk.RealtimeClient;
import com.yourorg.realtimesdk.RealtimeClientConfig;

import java.util.UUID;

/**
 * Exemple d'utilisation depuis Java pur — démontre que les interfaces
 * fonctionnelles (MessageListener, ConnectionListener) et
 * {@code @JvmOverloads} rendent le SDK aussi confortable en Java qu'en
 * Kotlin, sans wrapper supplémentaire à écrire.
 */
public final class JavaUsage {

    private JavaUsage() {}

    public static void main(String[] args) throws InterruptedException {
        RealtimeClientConfig config = new RealtimeClientConfig(
                "wss://realtime.example.com/ws",
                UUID.fromString("12345678-9abc-def0-1122-334455667788"),
                System.getenv("REALTIME_TOKEN") == null ? "" : System.getenv("REALTIME_TOKEN")
                // Les autres paramètres (heartbeatIntervalMs, reconnect, ...) restent à
                // leur valeur par défaut grâce à @JvmOverloads sur le constructeur.
        );

        RealtimeClient client = new RealtimeClient(config);

        client.onConnectionEvent(event -> {
            if (event instanceof ConnectionEvent.Open) {
                System.out.println("connecté");
            } else if (event instanceof ConnectionEvent.Closed closed) {
                System.out.println("déconnecté : " + closed.getCode() + " " + closed.getReason());
            } else if (event instanceof ConnectionEvent.Error error) {
                System.out.println("erreur : " + error.getThrowable().getMessage());
            }
        });

        AutoCloseable subscription = client.subscribe(
                "orders:42",
                message -> System.out.println("[orders:42] " + message.getPayload())
        );

        client.connect();

        Thread.sleep(1000);
        client.publish("orders:42", "commande créée");
        client.unicast("user-789", "message direct");
        client.replay("orders:42", 0); // surcharge générée par @JvmOverloads

        Thread.sleep(5000);
        try {
            subscription.close(); // envoie UNSUB
        } catch (Exception e) {
            // AutoCloseable.close() déclare `throws Exception` de façon
            // générique ; notre implémentation ne lève jamais rien ici.
        }
        client.disconnect();
    }
}
