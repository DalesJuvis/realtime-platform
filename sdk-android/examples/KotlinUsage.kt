package com.yourorg.realtimesdk.examples

import com.yourorg.realtimesdk.ConnectionEvent
import com.yourorg.realtimesdk.RealtimeClient
import com.yourorg.realtimesdk.RealtimeClientConfig
import com.yourorg.realtimesdk.TokenProvider
import com.yourorg.realtimesdk.TokenRefreshResult
import java.util.UUID

/**
 * Exemple d'utilisation depuis Kotlin — typiquement dans un `ViewModel`
 * Android, avec `client.connect()` dans `init {}` et `client.disconnect()`
 * dans `onCleared()`.
 */
fun main() {
    val config = RealtimeClientConfig(
        url = "wss://realtime.example.com/ws",
        tenantId = UUID.fromString("12345678-9abc-def0-1122-334455667788"),
        token = System.getenv("REALTIME_TOKEN") ?: "",
    )

    val client = RealtimeClient(config)

    client.onConnectionEvent { event ->
        when (event) {
            is ConnectionEvent.Open -> println("connecté")
            is ConnectionEvent.Authenticated -> println("AUTH envoyé")
            is ConnectionEvent.Closed -> println("déconnecté : ${event.code} ${event.reason}")
            is ConnectionEvent.AuthFailed -> println("AUTH rejeté (jeton invalide/expiré) : ${event.reason}")
            is ConnectionEvent.Error -> println("erreur : ${event.throwable.message}")
        }
    }

    // `.use { }` désabonne proprement (envoie UNSUB) à la fin du bloc.
    val subscription = client.subscribe("orders:42") { message ->
        println("[orders:42] ${message.payload}")
    }

    // Souscription par motif.
    client.subscribe("orders:*") { message ->
        println("[wildcard orders:*] ${message.channelId} -> ${message.payload}")
    }

    client.connect()

    Thread.sleep(1000)
    client.publish("orders:42", "commande créée")
    client.unicast("user-789", "message direct")
    client.replay("orders:42")

    // HTTP, pas un frame du protocole binaire — fonctionne même sans
    // connexion WS active. `{{variable}}` interpolées côté serveur, jamais
    // ici (le SDK ne voit jamais le texte du template).
    client.publishTemplate("orders:42", "tpl-commande-creee", mapOf("name" to "Ada")) { error ->
        if (error != null) println("publishTemplate a échoué : ${error.message}") else println("template publié")
    }

    Thread.sleep(5000)
    subscription.close() // envoie UNSUB pour "orders:42"
    client.disconnect()
}

/**
 * Renouvellement silencieux : `tokenProvider` remplace `token`.
 * `getToken()` appelle **votre propre backend** (jamais l'API mio
 * directement, et jamais avec le secret tenant en dur ici) — appelé avant
 * la première connexion, puis automatiquement à chaque reconnexion, y
 * compris après un `ConnectionEvent.AuthFailed` (jeton expiré). Aucun code
 * applicatif supplémentaire nécessaire pour que la connexion reprenne.
 */
fun mainWithSilentTokenRenewal() {
    val myBackend = MyAppBackendClient() // votre propre client HTTP, pas fourni par ce SDK

    val config = RealtimeClientConfig(
        url = "wss://realtime.example.com/ws", // valeur de repli — le ws_url renvoyé par getToken() prend le dessus
        tenantId = UUID.fromString("12345678-9abc-def0-1122-334455667788"),
        tokenProvider = TokenProvider {
            // Appelé sur le thread de fond dédié du client — bloquer ici
            // le temps de l'appel réseau est sûr et attendu.
            val response = myBackend.mintRealtimeToken(userId = "user-789")
            TokenRefreshResult(token = response.token, wsUrl = response.wsUrl)
        },
    )

    val client = RealtimeClient(config)
    client.onConnectionEvent { event ->
        if (event is ConnectionEvent.AuthFailed) {
            println("jeton expiré, renouvellement automatique en cours…")
        }
    }
    client.connect()
}

/** Signature d'exemple seulement — remplacez par votre propre client HTTP
 * appelant votre backend applicatif (qui, lui, détient le secret tenant et
 * appelle `POST /api/v1/auth/tokens`/`Client::mintToken()` côté PHP/etc.). */
private class MyAppBackendClient {
    data class MintedToken(val token: String, val wsUrl: String?)
    fun mintRealtimeToken(userId: String): MintedToken =
        throw NotImplementedError("exemple — remplacez par un vrai appel à votre backend")
}
