package com.yourorg.realtimesdk

/**
 * Encodage/décodage JSON minimal — strictement suffisant pour le corps et
 * la réponse de `POST /api/v1/messages/template` (voir
 * [RealtimeClient.publishTemplate]), pas un parseur JSON généraliste.
 *
 * Pas de dépendance ajoutée pour ça : `org.json` (fourni par la
 * plateforme Android) est stub côté tests JVM purs de ce module
 * (`unitTests.isReturnDefaultValues = true` dans `build.gradle.kts` —
 * les méthodes renvoient silencieusement des valeurs par défaut plutôt
 * que de lever, ce qui rendrait des tests basés dessus trompeurs sans
 * Robolectric), et une bibliothèque tierce (Gson/Moshi) serait
 * disproportionnée pour ce seul besoin. Suffisant pour cet usage unique :
 * objets, chaînes (avec échappement), booléens, nombres, `null`, tableaux
 * — même stratégie « aucune dépendance externe » que le codec binaire
 * dans `Protocol.kt`.
 *
 * `internal` plutôt que `private` : accessible depuis les tests JVM de ce
 * module (même « friend module » Kotlin que le code de production) sans
 * élargir la surface d'API publique du SDK.
 */
internal object MinimalJson {

    /** Encode un objet JSON plat à partir de paires clé/valeur. Valeurs
     * supportées : [String] et `Map<String, String>` (imbriqué un niveau
     * — c'est tout ce dont [RealtimeClient.publishTemplate] a besoin pour
     * son champ `variables`). */
    fun encodeObject(vararg fields: Pair<String, Any>): String =
        fields.joinToString(prefix = "{", postfix = "}") { (key, value) ->
            "${encodeString(key)}:${encodeValue(value)}"
        }

    private fun encodeValue(value: Any): String = when (value) {
        is String -> encodeString(value)
        is Map<*, *> -> value.entries.joinToString(prefix = "{", postfix = "}") { (k, v) ->
            "${encodeString(k.toString())}:${encodeValue(v as Any? ?: "")}"
        }
        else -> throw IllegalArgumentException("MinimalJson: type non supporté : ${value::class}")
    }

    private fun encodeString(s: String): String {
        val sb = StringBuilder(s.length + 8).append('"')
        for (c in s) {
            when (c) {
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                else -> if (c.code < 0x20) {
                    sb.append("\\u").append(c.code.toString(16).padStart(4, '0'))
                } else {
                    sb.append(c)
                }
            }
        }
        return sb.append('"').toString()
    }

    /**
     * Parse `text` en une structure Kotlin générique : `Map<String, Any?>`
     * pour un objet, `List<Any?>` pour un tableau, `String`, `Boolean`,
     * `Double` ou `null` pour les scalaires. Lève [IllegalStateException]
     * (jamais silencieux) sur tout JSON malformé.
     */
    fun parse(text: String): Any? {
        val parser = Parser(text)
        parser.skipWhitespace()
        val value = parser.parseValue()
        parser.skipWhitespace()
        return value
    }

    private class Parser(private val s: String) {
        var i = 0

        fun skipWhitespace() {
            while (i < s.length && s[i].isWhitespace()) i++
        }

        private fun expect(c: Char) {
            check(i < s.length && s[i] == c) { "MinimalJson : « $c » attendu à l'offset $i" }
            i++
        }

        fun parseValue(): Any? {
            skipWhitespace()
            check(i < s.length) { "MinimalJson : fin de texte inattendue" }
            return when {
                s[i] == '{' -> parseObject()
                s[i] == '[' -> parseArray()
                s[i] == '"' -> parseString()
                s.startsWith("true", i) -> { i += 4; true }
                s.startsWith("false", i) -> { i += 5; false }
                s.startsWith("null", i) -> { i += 4; null }
                else -> parseNumber()
            }
        }

        private fun parseObject(): Map<String, Any?> {
            val map = LinkedHashMap<String, Any?>()
            expect('{')
            skipWhitespace()
            if (i < s.length && s[i] == '}') { i++; return map }
            while (true) {
                skipWhitespace()
                val key = parseString()
                skipWhitespace()
                expect(':')
                map[key] = parseValue()
                skipWhitespace()
                check(i < s.length) { "MinimalJson : fin de texte inattendue dans un objet" }
                when (s[i]) {
                    ',' -> { i++ }
                    '}' -> { i++; return map }
                    else -> error("MinimalJson : « , » ou « } » attendu à l'offset $i")
                }
            }
        }

        private fun parseArray(): List<Any?> {
            val list = ArrayList<Any?>()
            expect('[')
            skipWhitespace()
            if (i < s.length && s[i] == ']') { i++; return list }
            while (true) {
                list.add(parseValue())
                skipWhitespace()
                check(i < s.length) { "MinimalJson : fin de texte inattendue dans un tableau" }
                when (s[i]) {
                    ',' -> { i++ }
                    ']' -> { i++; return list }
                    else -> error("MinimalJson : « , » ou « ] » attendu à l'offset $i")
                }
            }
        }

        private fun parseString(): String {
            expect('"')
            val sb = StringBuilder()
            while (true) {
                check(i < s.length) { "MinimalJson : chaîne non terminée" }
                val c = s[i]
                when {
                    c == '"' -> { i++; return sb.toString() }
                    c == '\\' -> {
                        i++
                        check(i < s.length) { "MinimalJson : échappement incomplet" }
                        when (s[i]) {
                            '"' -> sb.append('"')
                            '\\' -> sb.append('\\')
                            '/' -> sb.append('/')
                            'n' -> sb.append('\n')
                            'r' -> sb.append('\r')
                            't' -> sb.append('\t')
                            'b' -> sb.append('\b')
                            'f' -> sb.append('\u000C')
                            'u' -> {
                                check(i + 4 < s.length) { "MinimalJson : échappement \\u incomplet" }
                                sb.append(s.substring(i + 1, i + 5).toInt(16).toChar())
                                i += 4
                            }
                            else -> error("MinimalJson : échappement inconnu \\${s[i]}")
                        }
                        i++
                    }
                    else -> { sb.append(c); i++ }
                }
            }
        }

        private fun parseNumber(): Double {
            val start = i
            while (i < s.length && (s[i].isDigit() || s[i] in "-+.eE")) i++
            check(i > start) { "MinimalJson : valeur inattendue à l'offset $i" }
            return s.substring(start, i).toDouble()
        }
    }
}
