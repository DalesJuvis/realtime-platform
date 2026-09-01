package com.yourorg.realtimesdk.examples;

import com.yourorg.realtimesdk.ConnectionEvent;
import com.yourorg.realtimesdk.RealtimeClient;
import com.yourorg.realtimesdk.RealtimeClientConfig;
import com.yourorg.realtimesdk.TokenProvider;
import com.yourorg.realtimesdk.TokenRefreshResult;

import java.util.Collections;
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
            } else if (event instanceof ConnectionEvent.AuthFailed authFailed) {
                System.out.println("AUTH rejeté (jeton invalide/expiré) : " + authFailed.getReason());
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

        // HTTP, pas un frame du protocole binaire — fonctionne même sans
        // connexion WS active. `{{variable}}` interpolées côté serveur,
        // jamais ici (le SDK ne voit jamais le texte du template).
        client.publishTemplate(
                "orders:42",
                "tpl-commande-creee",
                Collections.singletonMap("name", "Ada"),
                error -> {
                    if (error != null) {
                        System.out.println("publishTemplate a échoué : " + error.getMessage());
                    } else {
                        System.out.println("template publié");
                    }
                }
        );

        Thread.sleep(5000);
        try {
            subscription.close(); // envoie UNSUB
        } catch (Exception e) {
            // AutoCloseable.close() déclare `throws Exception` de façon
            // générique ; notre implémentation ne lève jamais rien ici.
        }
        client.disconnect();
    }

    /**
     * Renouvellement silencieux : {@code tokenProvider} remplace {@code token}.
     * {@code getToken()} appelle <b>votre propre backend</b> (jamais l'API mio
     * directement, et jamais avec le secret tenant en dur ici) — appelé avant
     * la première connexion, puis automatiquement à chaque reconnexion, y
     * compris après un {@code ConnectionEvent.AuthFailed} (jeton expiré).
     * Aucun code applicatif supplémentaire nécessaire pour que la connexion
     * reprenne. Java n'ayant pas d'arguments nommés/optionnels, il faut
     * passer explicitement {@code null} pour {@code token} et remplir les
     * paramètres suivants (aucune surcharge {@code @JvmOverloads} ne saute
     * {@code token} pour atteindre {@code tokenProvider} directement).
     */
    public static void mainWithSilentTokenRenewal() {
        TokenProvider tokenProvider = () -> {
            // Appelé sur le thread de fond dédié du client — bloquer ici
            // le temps de l'appel réseau vers votre backend est sûr et attendu.
            MyAppBackendClient.MintedToken minted =
                    new MyAppBackendClient().mintRealtimeToken("user-789");
            return new TokenRefreshResult(minted.token, minted.wsUrl);
        };

        RealtimeClientConfig config = new RealtimeClientConfig(
                "wss://realtime.example.com/ws", // valeur de repli — le ws_url renvoyé par getToken() prend le dessus
                UUID.fromString("12345678-9abc-def0-1122-334455667788"),
                null, // token
                tokenProvider,
                15_000L, // heartbeatIntervalMs (défaut)
                true, // reconnect (défaut)
                500L, // reconnectBaseDelayMs (défaut)
                15_000L, // reconnectMaxDelayMs (défaut)
                new okhttp3.OkHttpClient() // (défaut)
        );

        RealtimeClient client = new RealtimeClient(config);
        client.onConnectionEvent(event -> {
            if (event instanceof ConnectionEvent.AuthFailed) {
                System.out.println("jeton expiré, renouvellement automatique en cours…");
            }
        });
        client.connect();
    }

    /** Signature d'exemple seulement — remplacez par votre propre client HTTP
     * appelant votre backend applicatif (qui, lui, détient le secret tenant et
     * appelle {@code POST /api/v1/auth/tokens}/{@code Client::mintToken()} côté PHP/etc.). */
    private static final class MyAppBackendClient {
        static final class MintedToken {
            final String token;
            final String wsUrl;
            MintedToken(String token, String wsUrl) {
                this.token = token;
                this.wsUrl = wsUrl;
            }
        }
        MintedToken mintRealtimeToken(String userId) {
            throw new UnsupportedOperationException("exemple — remplacez par un vrai appel à votre backend");
        }
    }
}
