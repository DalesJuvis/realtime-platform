package com.yourorg.realtimesdk

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Tests de [RealtimeClient.publishTemplate] contre un vrai serveur HTTP
 * local ([MockWebServer], même famille qu'OkHttp déjà utilisé en
 * runtime) plutôt qu'un mock d'`OkHttpClient` à la main — couvre le vrai
 * chemin requête/réponse (URL, méthode, en-têtes, corps JSON) sans
 * dépendre du réseau.
 *
 * `publishTemplate` est asynchrone (callback invoqué depuis le
 * planificateur interne du client, jamais le thread appelant — voir sa
 * doc) : chaque test attend via un [CountDownLatch] plutôt que de lire le
 * résultat immédiatement après l'appel.
 */
class RealtimeClientTest {

    private val server = MockWebServer()
    private val sampleTenant = UUID.fromString("12345678-9abc-def0-1122-334455667788")

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    /** `wsUrl` construite à partir de l'URL réelle du [MockWebServer], en
     * remplaçant `http` par `ws` — miroir exact de ce que fait
     * [RealtimeClient.httpBaseUrl] en sens inverse. */
    private fun wsUrlForServer(): String =
        server.url("/ws").toString().replace("http", "ws")

    private fun newClient(): RealtimeClient =
        RealtimeClient(
            RealtimeClientConfig(
                url = wsUrlForServer(),
                tenantId = sampleTenant,
                token = "test-token",
            ),
        )

    @Test
    fun `httpBaseUrl derive http depuis wss et retire ws`() {
        val client = RealtimeClient(
            RealtimeClientConfig(
                url = "wss://realtime.example.com/ws",
                tenantId = sampleTenant,
                token = "t",
            ),
        )
        assertEquals("https://realtime.example.com", client.httpBaseUrl())
    }

    @Test
    fun `httpBaseUrl derive http depuis ws non securise`() {
        val client = RealtimeClient(
            RealtimeClientConfig(
                url = "ws://localhost:8080/ws",
                tenantId = sampleTenant,
                token = "t",
            ),
        )
        assertEquals("http://localhost:8080", client.httpBaseUrl())
    }

    @Test
    fun `publishTemplate en succes invoque le callback avec null`() {
        val client = newClient()
        server.enqueue(
            MockResponse().setResponseCode(200)
                .setBody("""{"success":true,"data":{"published":true},"trace_id":"t1"}"""),
        )

        val latch = CountDownLatch(1)
        var received: Exception? = IllegalStateException("callback jamais invoqué")
        client.publishTemplate("orders:42", "tpl-1", mapOf("name" to "Ada")) { error ->
            received = error
            latch.countDown()
        }

        assertTrue("timeout en attendant le callback", latch.await(5, TimeUnit.SECONDS))
        assertNull(received)

        val request = server.takeRequest(5, TimeUnit.SECONDS)!!
        assertEquals("POST", request.method)
        assertEquals("/api/v1/messages/template", request.path)
        assertEquals("Bearer test-token", request.getHeader("Authorization"))
        assertEquals("application/json; charset=utf-8", request.getHeader("Content-Type"))

        val body = MinimalJson.parse(request.body.readUtf8()) as Map<*, *>
        assertEquals(sampleTenant.toString(), body["tenant_id"])
        assertEquals("orders:42", body["channel_id"])
        assertEquals("tpl-1", body["template_id"])
        assertEquals(mapOf("name" to "Ada"), body["variables"])
    }

    @Test
    fun `publishTemplate sans variables envoie une map vide`() {
        val client = newClient()
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"success":true,"data":{"published":true}}"""))

        val latch = CountDownLatch(1)
        client.publishTemplate("orders:42", "tpl-1") { latch.countDown() }
        assertTrue(latch.await(5, TimeUnit.SECONDS))

        val body = MinimalJson.parse(server.takeRequest(5, TimeUnit.SECONDS)!!.body.readUtf8()) as Map<*, *>
        assertEquals(emptyMap<String, String>(), body["variables"])
    }

    @Test
    fun `publishTemplate sur TEMPLATE_NOT_FOUND remonte le code machine`() {
        val client = newClient()
        server.enqueue(
            MockResponse().setResponseCode(404)
                .setBody(
                    """{"success":false,"error":{"code":"TEMPLATE_NOT_FOUND","message":"unknown template","trace_id":"t2"}}""",
                ),
        )

        val latch = CountDownLatch(1)
        var received: Exception? = null
        client.publishTemplate("orders:42", "does-not-exist") { error ->
            received = error
            latch.countDown()
        }

        assertTrue(latch.await(5, TimeUnit.SECONDS))
        val error = received as? TemplatePublishException
        assertEquals("TEMPLATE_NOT_FOUND", error?.code)
        assertEquals("unknown template", error?.message)
    }

    @Test
    fun `publishTemplate sans jeton disponible echoue sans requete HTTP`() {
        val client = RealtimeClient(
            RealtimeClientConfig(
                url = wsUrlForServer(),
                tenantId = sampleTenant,
                tokenProvider = TokenProvider { throw RuntimeException("backend indisponible") },
            ),
        )

        val latch = CountDownLatch(1)
        var received: Exception? = null
        client.publishTemplate("orders:42", "tpl-1") { error ->
            received = error
            latch.countDown()
        }

        assertTrue(latch.await(5, TimeUnit.SECONDS))
        assertEquals("backend indisponible", received?.message)
        assertEquals(0, server.requestCount)
    }
}
