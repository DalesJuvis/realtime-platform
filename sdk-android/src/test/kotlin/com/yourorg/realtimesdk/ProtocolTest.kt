package com.yourorg.realtimesdk

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

/**
 * Tests du codec binaire (JUnit4, cohérent avec les conventions Android).
 *
 * ⚠️ N'a pas pu être exécuté dans l'environnement où ce SDK a été écrit —
 * ni `kotlinc` ni `javac` (JDK complet) n'y étaient disponibles, seul un
 * JRE. Ces tests suivent scrupuleusement les mêmes cas que
 * `protocol.test.ts` (TypeScript) et `test_protocol.py` (Python), qui
 * eux ont été réellement exécutés avec succès — la logique est donc
 * dérivée de code déjà validé, mais ce fichier précis reste à faire
 * tourner chez vous (`./gradlew test`) avant de le considérer fiable.
 */
class ProtocolTest {

    private val sampleTenant = UUID.fromString("12345678-9abc-def0-1122-334455667788")

    @Test
    fun `encode puis decode restitue les memes champs`() {
        val raw = encodeFrame(Opcode.PUBLISH, sampleTenant, "room-42", "hello world")
        assertEquals(FRAME_SIZE, raw.size)

        val frame = decodeFrame(raw)
        assertEquals(Opcode.PUBLISH, frame.opcode)
        assertEquals(sampleTenant, frame.tenantId)
        assertEquals("room-42", frame.channelId)
        assertEquals("hello world", frame.payload)
    }

    @Test
    fun `unicast opcode roundtrip`() {
        val raw = encodeFrame(Opcode.UNICAST, sampleTenant, "user-42", "hey there")
        val frame = decodeFrame(raw)
        assertEquals(Opcode.UNICAST, frame.opcode)
        assertEquals("user-42", frame.channelId)
    }

    @Test
    fun `unsub opcode roundtrip`() {
        val raw = encodeFrame(Opcode.UNSUB, sampleTenant, "room-42")
        val frame = decodeFrame(raw)
        assertEquals(Opcode.UNSUB, frame.opcode)
        assertEquals("room-42", frame.channelId)
    }

    @Test
    fun `rejette une longueur de frame invalide`() {
        assertThrows(ProtocolException::class.java) { decodeFrame(ByteArray(100)) }
    }

    @Test
    fun `rejette un magic invalide`() {
        val raw = encodeFrame(Opcode.PING, sampleTenant)
        raw[0] = 0x00 // corrompt le magic
        assertThrows(ProtocolException::class.java) { decodeFrame(raw) }
    }

    @Test
    fun `rejette un CRC corrompu`() {
        val raw = encodeFrame(Opcode.MESSAGE, sampleTenant, payload = "data")
        raw[50] = (raw[50].toInt() xor 0xFF).toByte() // altère un octet sans mettre à jour le CRC
        assertThrows(ProtocolException::class.java) { decodeFrame(raw) }
    }

    @Test
    fun `tronque un channelId trop long sur une frontiere UTF-8 valide`() {
        val raw = encodeFrame(Opcode.SUBSCRIBE, sampleTenant, channelId = "x".repeat(100))
        val frame = decodeFrame(raw)
        assertEquals(24, frame.channelId.length)
    }

    @Test
    fun `la troncature ne produit jamais d'UTF-8 invalide`() {
        // Emoji multi-octets (4 octets en UTF-8) répété pour forcer une
        // coupure au milieu d'un caractère si la troncature était naïve.
        val raw = encodeFrame(Opcode.PUBLISH, sampleTenant, payload = "\uD83C\uDF89".repeat(60))
        val frame = decodeFrame(raw) // ne doit lever aucune exception
        assertTrue(frame.payload.isNotEmpty())
    }

    @Test
    fun `crc16 est deterministe et sensible a toute alteration`() {
        val a = "hello".toByteArray(Charsets.UTF_8)
        val b = "hellp".toByteArray(Charsets.UTF_8)
        assertEquals(crc16CcittFalse(a), crc16CcittFalse(a))
        assertNotEquals(crc16CcittFalse(a), crc16CcittFalse(b))
    }

    @Test
    fun `globMatch avec wildcard final`() {
        assertTrue(globMatch("orders:*", "orders:42"))
        assertTrue(!globMatch("orders:*", "invoices:42"))
    }

    @Test
    fun `globMatch avec wildcard au milieu`() {
        assertTrue(globMatch("app_123:*:eu", "app_123:orders:eu"))
        assertTrue(!globMatch("app_123:*:eu", "app_123:orders:us"))
    }
}
