package com.yourorg.realtimesdk

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Tests du mini-encodeur/décodeur JSON interne (`MinimalJson`, `internal`
 * — accessible ici via le friend module Kotlin des tests, sans être une
 * API publique du SDK). Couvre uniquement ce dont `publishTemplate` a
 * besoin : objets plats, chaînes échappées, imbrication à un niveau,
 * booléens, `null`. */
class JsonTest {

    @Test
    fun `encode un objet plat avec une map imbriquee`() {
        val json = MinimalJson.encodeObject(
            "tenant_id" to "abc-123",
            "channel_id" to "orders:42",
            "template_id" to "tpl-1",
            "variables" to mapOf("name" to "Ada", "order_id" to "42"),
        )
        assertEquals(
            """{"tenant_id":"abc-123","channel_id":"orders:42","template_id":"tpl-1","variables":{"name":"Ada","order_id":"42"}}""",
            json,
        )
    }

    @Test
    fun `encode une map vide comme un objet vide`() {
        val json = MinimalJson.encodeObject("variables" to emptyMap<String, String>())
        assertEquals("""{"variables":{}}""", json)
    }

    @Test
    fun `echappe guillemets antislashs et sauts de ligne`() {
        val json = MinimalJson.encodeObject("payload" to "il a dit \"salut\"\n\\fin")
        assertEquals("""{"payload":"il a dit \"salut\"\n\\fin"}""", json)
    }

    @Test
    fun `parse une reponse de succes`() {
        val parsed = MinimalJson.parse("""{"success":true,"data":{"published":true},"trace_id":"abc"}""") as Map<*, *>
        assertEquals(true, parsed["success"])
        assertEquals(true, (parsed["data"] as Map<*, *>)["published"])
        assertEquals("abc", parsed["trace_id"])
    }

    @Test
    fun `parse une reponse d'erreur imbriquee`() {
        val parsed = MinimalJson.parse(
            """{"success":false,"error":{"code":"TEMPLATE_NOT_FOUND","message":"unknown template","trace_id":"xyz"}}""",
        ) as Map<*, *>
        assertEquals(false, parsed["success"])
        val error = parsed["error"] as Map<*, *>
        assertEquals("TEMPLATE_NOT_FOUND", error["code"])
        assertEquals("unknown template", error["message"])
    }

    @Test
    fun `parse gere les chaines echappees et unicode`() {
        val parsed = MinimalJson.parse(""""line1\nline2 \"quoted\" é"""") as String
        assertEquals("line1\nline2 \"quoted\" é", parsed)
    }

    @Test
    fun `parse gere null et les tableaux`() {
        val parsed = MinimalJson.parse("""{"a":null,"b":[1,2,3],"c":true}""") as Map<*, *>
        assertNull(parsed["a"])
        assertEquals(listOf(1.0, 2.0, 3.0), parsed["b"])
        assertTrue(parsed["c"] as Boolean)
    }

    @Test
    fun `roundtrip encode puis parse`() {
        val encoded = MinimalJson.encodeObject(
            "channel_id" to "orders:42",
            "variables" to mapOf("name" to "Ada"),
        )
        val parsed = MinimalJson.parse(encoded) as Map<*, *>
        assertEquals("orders:42", parsed["channel_id"])
        assertEquals(mapOf("name" to "Ada"), parsed["variables"])
    }

    @Test
    fun `rejette un json malforme`() {
        assertThrows(IllegalStateException::class.java) { MinimalJson.parse("""{"a":}""") }
    }
}
