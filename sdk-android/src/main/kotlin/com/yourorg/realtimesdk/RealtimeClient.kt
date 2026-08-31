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

/** Code de fermeture WS envoyé par le serveur quand AUTH est rejeté (jeton
 * invalide ou expiré — voir `WsController.rs::WS_CLOSE_CODE_AUTH_FAILED`
 * côté backend, seule source de vérité pour cette valeur). */
internal const val WS_CLOSE_CODE_AUTH_FAILED = 4001

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

    /** L'URL/le jeton effectivement utilisés pour la prochaine tentative de
     * connexion — distincts de `config.url`/`config.token` une fois
     * `config.tokenProvider` configuré : `openSocket()` les met à jour à
     * chaque tentative avec ce que le provider renvoie. Sans
     * `tokenProvider`, restent simplement égaux aux valeurs de `config`. */
    @Volatile private var currentUrl: String = config.url
    @Volatile private var currentToken: String? = config.token

    fun connect() {
        closedByUser.set(false)
        // Sur le scheduler, jamais sur le thread appelant : une fois
        // `tokenProvider` configuré, `openSocket()` peut bloquer le temps
        // de l'appel réseau vers votre propre backend — appeler ça
        // directement depuis le thread UI Android serait un risque d'ANR.
        scheduler.execute { openSocket() }
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
        // Résout un jeton frais avant *chaque* tentative, si `tokenProvider`
        // est configuré — le tout premier `connect()` comme chaque
        // reconnexion, y compris après un `ConnectionEvent.AuthFailed`
        // (voir `InternalListener.onClosed`, qui laisse simplement le
        // backoff normal reprogrammer un appel ici). Une exception ici est
        // traitée comme n'importe quel autre échec de connexion : `Error`,
        // puis reconnexion replanifiée avec le même backoff que le reste —
        // jamais de boucle serrée sur un backend applicatif temporairement
        // en panne.
        val provider = config.tokenProvider
        if (provider != null) {
            try {
                val fresh = provider.getToken()
                currentToken = fresh.token
                if (fresh.wsUrl != null) currentUrl = fresh.wsUrl
            } catch (e: Exception) {
                connectionListeners.forEach { it.onEvent(ConnectionEvent.Error(e)) }
                scheduleReconnect()
                return
            }
            if (closedByUser.get()) return
        }

        val token = currentToken ?: run {
            // Ne peut arriver que si `tokenProvider` n'est pas configuré et
            // que `config.token` n'a jamais été fourni — le constructeur de
            // `RealtimeClientConfig` l'empêche déjà, ceci est un filet de
            // sécurité si cette invariant venait à changer.
            connectionListeners.forEach {
                it.onEvent(ConnectionEvent.Error(IllegalStateException("aucun jeton disponible — fournissez token ou tokenProvider")))
            }
            return
        }

        val request = Request.Builder().url(currentUrl).build()
        webSocket = config.okHttpClient.newWebSocket(request, InternalListener(token))
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

    /** [token] est celui résolu par `openSocket()` pour *cette* tentative
     * précise — jamais `config.token` directement, qui peut être `null`
     * quand `tokenProvider` est configuré, et qui de toute façon ne serait
     * pas le jeton fraîchement obtenu après un renouvellement. */
    private inner class InternalListener(private val token: String) : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            reconnectAttempt.set(0)
            // AUTH systématiquement en premier.
            send(webSocket, Opcode.AUTH, "", token)
            resubscribeAll(webSocket)
            startHeartbeat(webSocket)
            connectionListeners.forEach { it.onEvent(ConnectionEvent.Open) }
            // Optimiste — le protocole n'a pas d'opcode d'ACK explicite ;
            // en cas d'échec d'AUTH, le serveur ferme la connexion avec un
            // code dédié (observez plutôt `ConnectionEvent.AuthFailed`).
            connectionListeners.forEach { it.onEvent(ConnectionEvent.Authenticated) }
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
            dispatch(bytes.toByteArray())
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            heartbeatFuture?.cancel(false)
            this@RealtimeClient.webSocket = null
            connectionListeners.forEach { it.onEvent(ConnectionEvent.Closed(code, reason)) }

            if (code == WS_CLOSE_CODE_AUTH_FAILED) {
                connectionListeners.forEach { it.onEvent(ConnectionEvent.AuthFailed(code, reason)) }

                if (config.tokenProvider == null) {
                    // Retenter avec le même jeton que le serveur vient de
                    // rejeter échouerait à nouveau, indéfiniment et
                    // silencieusement — jamais de reconnexion automatique
                    // ici, même avec `config.reconnect`.
                    return
                }
                // `tokenProvider` configuré : on tombe dans le chemin de
                // reconnexion normal ci-dessous. `openSocket()` rappelle
                // toujours `tokenProvider.getToken()` avant chaque
                // tentative, donc cette reconnexion récupère un jeton frais
                // automatiquement — rien à faire côté application au-delà
                // d'avoir configuré `tokenProvider` une seule fois.
            }

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

    /**
     * Émis juste après [Closed] quand la fermeture vient précisément d'un
     * AUTH rejeté (jeton invalide ou expiré — code de fermeture WS dédié,
     * [WS_CLOSE_CODE_AUTH_FAILED], distinct de toute autre raison de
     * déconnexion).
     *
     * Sans `RealtimeClientConfig.tokenProvider` : le client **n'essaie
     * jamais de se reconnecter automatiquement** après ceci, même avec
     * `reconnect = true` — retenter avec le même jeton que le serveur
     * vient de rejeter échouerait à nouveau, indéfiniment et
     * silencieusement. Réagissez ici (jeton frais depuis votre backend,
     * nouveau `RealtimeClient`) plutôt que de compter sur `Closed` seul.
     *
     * Avec `tokenProvider` configuré : plus la peine — le client rappelle
     * `tokenProvider.getToken()` automatiquement avant la prochaine
     * tentative et se reconnecte avec le jeton frais tout seul. Cet
     * évènement reste émis (utile pour un indicateur "renouvellement…"),
     * mais rien à faire pour que la connexion reprenne.
     */
    data class AuthFailed(val code: Int, val reason: String) : ConnectionEvent()
}

/**
 * Ce que [TokenProvider.getToken] doit renvoyer — exactement la forme de
 * la réponse de `POST /api/v1/auth/tokens`/`POST /api/v1/portal/tokens`
 * côté appelant (votre propre backend, pas ce SDK). [wsUrl] omis (`null`)
 * réutilise celui déjà configuré — quasi toujours ce qu'on veut, `ws_url`
 * ne varie pas d'un mint à l'autre pour un même déploiement.
 */
data class TokenRefreshResult @JvmOverloads constructor(
    val token: String,
    val wsUrl: String? = null,
)

/**
 * Fournit un jeton frais à la demande — **votre propre backend** (qui
 * détient le secret tenant, jamais ce SDK ni l'app appelante), pas
 * directement l'API mio. [getToken] est appelé avant *chaque* tentative de
 * connexion : le premier `connect()`, et automatiquement à chaque
 * reconnexion — y compris après un [ConnectionEvent.AuthFailed] (jeton
 * expiré/invalide), ce qui rend le renouvellement transparent pour le code
 * applicatif une fois configuré une seule fois ici.
 *
 * Appelé de façon synchrone sur le thread de fond dédié de ce client
 * (jamais le thread appelant de `connect()`, voir sa propre doc) — bloquer
 * ici le temps d'un appel réseau vers votre backend est sûr et attendu, ni
 * coroutine `suspend` ni callback-de-callback à gérer. Une exception levée
 * ici est traitée comme n'importe quel autre échec de connexion :
 * [ConnectionEvent.Error] est émis et une reconnexion est replanifiée avec
 * le même backoff exponentiel que le reste — pas de boucle serrée si votre
 * backend est temporairement indisponible.
 */
fun interface TokenProvider {
    fun getToken(): TokenRefreshResult
}

/**
 * Configuration du client. `@JvmOverloads` génère les surcharges
 * nécessaires pour que les paramètres par défaut restent utilisables
 * proprement depuis Java (sans lui, Java verrait un seul constructeur
 * exigeant tous les paramètres).
 *
 * Fournissez exactement l'un de [token] (jeton statique) ou
 * [tokenProvider] (renouvellement automatique et silencieux — voir sa
 * propre doc) ; le constructeur lève [IllegalArgumentException] sinon.
 */
data class RealtimeClientConfig @JvmOverloads constructor(
    /** URL du endpoint WebSocket, ex: `wss://realtime.example.com/ws`. Si
     * [tokenProvider] est configuré et renvoie un [TokenRefreshResult.wsUrl],
     * celui-ci prend le dessus pour chaque connexion — cette valeur ne sert
     * alors que de première valeur / repli. */
    val url: String,
    /** Tenant ID — doit correspondre au tenant du jeton [token]/[tokenProvider]. */
    val tenantId: UUID,
    /**
     * Jeton d'authentification émis côté serveur
     * (`auth.rs::AuthManager::issue_token`). Ce SDK ne le génère jamais
     * lui-même : un jeton signé HMAC ne doit être émis que côté serveur,
     * qui seul détient le secret du tenant. Statique — s'il expire, voir
     * [ConnectionEvent.AuthFailed] (aucune tentative de reconnexion
     * automatique dans ce cas, contrairement à [tokenProvider]).
     */
    val token: String? = null,
    /** Voir la doc de [TokenProvider]. Alternative à [token] pour un
     * renouvellement automatique et silencieux. */
    val tokenProvider: TokenProvider? = null,
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
) {
    init {
        require((token != null) != (tokenProvider != null)) {
            "RealtimeClientConfig: fournissez exactement l'un de token ou tokenProvider, pas les deux, pas aucun."
        }
    }
}
