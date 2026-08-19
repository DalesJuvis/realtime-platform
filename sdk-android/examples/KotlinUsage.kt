package com.yourorg.realtimesdk.examples

import com.yourorg.realtimesdk.ConnectionEvent
import com.yourorg.realtimesdk.RealtimeClient
import com.yourorg.realtimesdk.RealtimeClientConfig
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

    Thread.sleep(5000)
    subscription.close() // envoie UNSUB pour "orders:42"
    client.disconnect()
}
