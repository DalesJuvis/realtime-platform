package com.yourorg.realtimesdk

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.logging.Logger
import kotlin.random.Random

/**
 * Client du moteur temps réel maison, pour Android/JVM. Repose sur
 * [OkHttp](https://square.github.io/okhttp/) pour le transport WebSocket
 * (bibliothèque déjà quasi omniprésente dans l'écosystème Android — pas
 * de dépendance réseau supplémentaire à justifier).
 *
 * Volontairement écrit sans coroutines Kotlin dans l'API publique : la
 * planification (heartbeat, backoff de reconnexion) repose sur un simple
 * [ScheduledExecutorService], et les souscriptions sur des interfaces
 * fonctionnelles (`fun interface`). Ce choix garde le SDK appelable de
 * façon strictement identique depuis Kotlin et depuis Java — les
 * coroutines auraient imposé soit une API `suspend` inutilisable
 * directement en Java, soit une double surface d'API à maintenir.
 *
 * API volontairement proche des SDKs TypeScript/Rust/Python du même
 * projet : mêmes opérations (`publish`, `subscribe`, `unicast`, `replay`,
 * `unsubscribe`), mêmes limitations documentées.
 */
class RealtimeClient(private val config: RealtimeClientConfig) {

    private val logger = Logger.getLogger("RealtimeSdk")

    private val scheduler: ScheduledExecutorService =
        Executors.newSingleThreadScheduledExecutor { runnable ->
            Thread(runnable, "realtime-sdk-scheduler").apply { isDaemon = true }
        }

    /** Clé = channelId exact ou motif (`orders:*`) → listeners enregistrés. */
    private val subscriptions = ConcurrentHashMap<String, CopyOnWriteArraySet<MessageListener>>()
    private val connectionListeners = CopyOnWriteArraySet<ConnectionListener>()

    @Volatile private var webSocket: WebSocket? = null
    @Volatile private var heartbeatFuture: ScheduledFuture<*>? = null
    private val closedByUser = AtomicBoolean(true)
    private val reconnectAttempt = AtomicInteger(0)

    fun connect() {
        closedByUser.set(false)
        openSocket()
    }

    /**
     * Ferme la connexion proprement (code de fermeture WebSocket standard
     * 1000) et arrête toute tentative de reconnexion automatique.
     */
    fun disconnect() {
        closedByUser.set(true)
        heartbeatFuture?.cancel(false)
        webSocket?.close(1000, "client disconnect")
        webSocket = null
    }

    /** S'abonne aux évènements de connexion (open/closed/error/authenticated). */
    fun onConnectionEvent(listener: ConnectionListener): AutoCloseable {
        connectionListeners.add(listener)
        return AutoCloseable { connectionListeners.remove(listener) }
    }

    /**
     * S'abonne à un canal exact ou à un motif (`orders:*`). Envoie le SUB
     * immédiatement si la connexion est active ; sinon il est différé et
     * rejoué automatiquement à la prochaine connexion réussie (y compris
     * après une reconnexion).
     *
     * Le [AutoCloseable] retourné (utilisable avec `.use { }` en Kotlin ou
     * try-with-resources en Java) envoie un vrai frame UNSUB au serveur
     * (Opcode `0x09`) une fois le dernier listener retiré pour ce canal —
     * la tâche de relais côté serveur est réellement arrêtée.
     */
    fun subscribe(channelId: String, listener: MessageListener): AutoCloseable {
        val isNewChannel = !subscriptions.containsKey(channelId)
        val listeners = subscriptions.getOrPut(channelId) { CopyOnWriteArraySet() }
        listeners.add(listener)

        if (isNewChannel) {
            webSocket?.let { send(it, Opcode.SUBSCRIBE, channelId, "") }
        }

        return AutoCloseable {
            val current = subscriptions[channelId] ?: return@AutoCloseable
            current.remove(listener)
            if (current.isEmpty()) {
                subscriptions.remove(channelId)
                webSocket?.let { send(it, Opcode.UNSUB, channelId, "") }
            }
        }
    }

    /** Publie `payload` sur `channelId`. */
    fun publish(channelId: String, payload: String) {
        sendOrThrow(Opcode.PUBLISH, channelId, payload)
    }

    /**
     * Envoi direct à un utilisateur (`channelId` du frame repurposé pour
     * porter l'ID destinataire). ⚠️ L'ID doit tenir dans 24 octets UTF-8
     * (contrainte du frame fixe).
     */
    fun unicast(userId: String, payload: String) {
        sendOrThrow(Opcode.UNICAST, userId, payload)
    }

    /**
     * Demande le rattrapage de l'historique de `channelId` depuis
     * `sinceUnixSeconds` (0 = tout l'historique disponible). Les frames de
     * rattrapage arrivent comme des messages normaux sur les listeners
     * déjà enregistrés pour ce canal. Non supporté sur un motif
     * (`orders:*`) — le serveur l'ignore silencieusement.
     */
    @JvmOverloads
    fun replay(channelId: String, sinceUnixSeconds: Long = 0) {
        sendOrThrow(Opcode.REPLAY, channelId, sinceUnixSeconds.toString())
    }

    private fun sendOrThrow(opcode: Opcode, channelId: String, payload: String) {
        val ws = webSocket ?: throw IllegalStateException("connexion WebSocket non établie")
        send(ws, opcode, channelId, payload)
    }

    private fun send(ws: WebSocket, opcode: Opcode, channelId: String, payload: String) {
        val frame = encodeFrame(opcode, config.tenantId, channelId, payload)
        ws.send(ByteString.of(*frame))
    }

    private fun openSocket() {
        val request = Request.Builder().url(config.url).build()
        webSocket = config.okHttpClient.newWebSocket(request, InternalListener())
    }

    private fun resubscribeAll(ws: WebSocket) {
        for (channelId in subscriptions.keys) {
            send(ws, Opcode.SUBSCRIBE, channelId, "")
        }
    }

    private fun startHeartbeat(ws: WebSocket) {
        heartbeatFuture?.cancel(false)
        heartbeatFuture = scheduler.scheduleWithFixedDelay(
            {
                try {
                    send(ws, Opcode.PING, "", "")
                } catch (e: Exception) {
                    logger.fine("échec d'envoi du heartbeat : ${e.message}")
                }
            },
            config.heartbeatIntervalMs,
            config.heartbeatIntervalMs,
            TimeUnit.MILLISECONDS,
        )
    }

    private fun scheduleReconnect() {
        if (closedByUser.get() || !config.reconnect) return

        val attempt = reconnectAttempt.getAndIncrement().coerceAtMost(20) // évite un décalage qui déborde Long
        val backoff = (config.reconnectBaseDelayMs * (1L shl attempt)).coerceAtMost(config.reconnectMaxDelayMs)
        // Jitter ±20%, même principe que les SDKs TS/Rust/Python : évite
        // un effet troupeau si de nombreux clients se reconnectent en
        // même temps après une coupure côté infrastructure serveur.
        val jitter = (backoff * (0.8 + Random.nextDouble() * 0.4)).toLong()

        scheduler.schedule({ if (!closedByUser.get()) openSocket() }, jitter, TimeUnit.MILLISECONDS)
    }

    private fun dispatch(raw: ByteArray) {
        val frame = try {
            decodeFrame(raw)
        } catch (e: ProtocolException) {
            logger.fine("frame invalide ignoré : ${e.message}")
            return
        }

        val message = RealtimeMessage(frame.channelId, frame.payload, frame.tenantId)

        subscriptions[frame.channelId]?.forEach { it.onMessage(message) }

        // Correspondance par motif : le serveur ne renvoie que le canal
        // concret réel, jamais le motif d'origine — on refait le matching
        // glob côté client pour chaque motif actif.
        for ((pattern, listeners) in subscriptions) {
            if (pattern.contains('*') && globMatch(pattern, frame.channelId)) {
                listeners.forEach { it.onMessage(message) }
            }
        }
    }

    private inner class InternalListener : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            reconnectAttempt.set(0)
            // AUTH systématiquement en premier.
            send(webSocket, Opcode.AUTH, "", config.token)
            resubscribeAll(webSocket)
            startHeartbeat(webSocket)
            connectionListeners.forEach { it.onEvent(ConnectionEvent.Open) }
            // Optimiste — le protocole n'a pas d'opcode d'ACK explicite ;
            // en cas d'échec d'AUTH, le serveur ferme simplement la
            // connexion (observez plutôt `ConnectionEvent.Closed`).
            connectionListeners.forEach { it.onEvent(ConnectionEvent.Authenticated) }
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
            dispatch(bytes.toByteArray())
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            heartbeatFuture?.cancel(false)
            this@RealtimeClient.webSocket = null
            connectionListeners.forEach { it.onEvent(ConnectionEvent.Closed(code, reason)) }
            scheduleReconnect()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            heartbeatFuture?.cancel(false)
            this@RealtimeClient.webSocket = null
            connectionListeners.forEach { it.onEvent(ConnectionEvent.Error(t)) }
            scheduleReconnect()
        }
    }
}

/** Un message reçu, indépendant du transport (miroir des autres SDKs du projet). */
data class RealtimeMessage(
    val channelId: String,
    val payload: String,
    val tenantId: UUID,
)

/**
 * Interface fonctionnelle (SAM) — utilisable comme lambda aussi bien
 * depuis Kotlin (`client.subscribe("x") { msg -> ... }`) que depuis Java
 * (`client.subscribe("x", msg -> { ... })`).
 */
fun interface MessageListener {
    fun onMessage(message: RealtimeMessage)
}

/** Interface fonctionnelle pour les évènements de connexion. */
fun interface ConnectionListener {
    fun onEvent(event: ConnectionEvent)
}

/**
 * Évènement de connexion. `sealed class` plutôt qu'enum car `Closed` et
 * `Error` portent des données propres — depuis Java, filtrez avec
 * `instanceof` (pas de `when` exhaustif disponible hors Kotlin).
 */
sealed class ConnectionEvent {
    object Open : ConnectionEvent()
    data class Closed(val code: Int, val reason: String) : ConnectionEvent()
    data class Error(val throwable: Throwable) : ConnectionEvent()

    /** Cf. note sur l'absence d'ACK AUTH dans `InternalListener.onOpen`. */
    object Authenticated : ConnectionEvent()
}

/**
 * Configuration du client. `@JvmOverloads` génère les surcharges
 * nécessaires pour que les paramètres par défaut restent utilisables
 * proprement depuis Java (sans lui, Java verrait un seul constructeur
 * exigeant tous les paramètres).
 */
data class RealtimeClientConfig @JvmOverloads constructor(
    /** URL du endpoint WebSocket, ex: `wss://realtime.example.com/ws`. */
    val url: String,
    /** Tenant ID — doit correspondre au tenant du jeton [token]. */
    val tenantId: UUID,
    /**
     * Jeton d'authentification émis côté serveur
     * (`auth.rs::AuthManager::issue_token`). Ce SDK ne le génère jamais
     * lui-même : un jeton signé HMAC ne doit être émis que côté serveur,
     * qui seul détient le secret du tenant.
     */
    val token: String,
    /** Intervalle entre deux PING, en ms. Défaut : 15000. */
    val heartbeatIntervalMs: Long = 15_000,
    /** Reconnexion automatique sur perte de connexion. Défaut : true. */
    val reconnect: Boolean = true,
    /** Délai de base du backoff exponentiel, en ms. Défaut : 500. */
    val reconnectBaseDelayMs: Long = 500,
    /** Plafond du backoff, en ms. Défaut : 15000. */
    val reconnectMaxDelayMs: Long = 15_000,
    /**
     * Client OkHttp à utiliser. Fournissez le vôtre si votre application
     * en a déjà un configuré (intercepteurs, timeouts, certificate
     * pinning...) plutôt que d'en laisser un second s'instancier.
     */
    val okHttpClient: OkHttpClient = OkHttpClient(),
)
