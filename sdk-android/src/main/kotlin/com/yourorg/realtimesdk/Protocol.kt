package com.yourorg.realtimesdk

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.CharBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.util.UUID

/**
 * Encodeur/décodeur du frame binaire fixe de 256 octets.
 *
 * Doit rester **identique bit à bit** à `protocol.rs` côté serveur : mêmes
 * offsets, même CRC16, même ordre d'octets (big-endian). Toute dérive
 * entre les implémentations casse silencieusement la compatibilité.
 *
 * Aucune dépendance externe (Java/Kotlin stdlib uniquement) — ce fichier
 * reste utilisable indépendamment du reste du SDK, par ex. dans un outil
 * de debug qui inspecte des frames capturées sans ouvrir de connexion.
 */

const val FRAME_SIZE = 256
const val MAGIC = 0xAA01

private const val OFF_MAGIC = 0
private const val OFF_OPCODE = 2
private const val OFF_TENANT = 3
private const val LEN_TENANT = 16
private const val OFF_CHANNEL = OFF_TENANT + LEN_TENANT // 19
private const val LEN_CHANNEL = 24
private const val OFF_PAYLOAD = OFF_CHANNEL + LEN_CHANNEL // 43
private const val LEN_PAYLOAD = 211
private const val OFF_CRC = OFF_PAYLOAD + LEN_PAYLOAD // 254
private const val LEN_CRC = 2

private val layoutCheck: Unit =
    check(OFF_CRC + LEN_CRC == FRAME_SIZE) { "layout de frame incohérent avec FRAME_SIZE" }

/** Opcodes du protocole. `value` correspond à l'octet 2 du frame. */
enum class Opcode(val value: Int) {
    SUBSCRIBE(0x01),
    PUBLISH(0x02),
    MESSAGE(0x03),
    AUTH(0x04),
    PING(0x05),
    PRESENCE(0x06),

    /** Rattrapage : payload = timestamp Unix (secondes, ASCII décimal). */
    REPLAY(0x07),

    /**
     * Envoi direct : `channelId` est repurposé pour porter l'ID du
     * destinataire, résolu côté serveur vers sa boîte privée `user:{id}`.
     */
    UNICAST(0x08),

    /** Désabonnement explicite d'un canal ou motif déjà souscrit. */
    UNSUB(0x09);

    companion object {
        fun fromByte(value: Int): Opcode? = values().firstOrNull { it.value == value }
    }
}

/** Erreur de décodage d'un frame — message toujours explicite sur la cause. */
class ProtocolException(message: String) : Exception(message)

/** Un frame décodé, entièrement possédé (pas de vue empruntée sur le buffer d'origine). */
data class DecodedFrame(
    val opcode: Opcode,
    val tenantId: UUID,
    val channelId: String,
    val payload: String,
)

private fun strictUtf8Decode(bytes: ByteArray): String {
    val decoder = Charsets.UTF_8.newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT)
    return try {
        val chars: CharBuffer = decoder.decode(ByteBuffer.wrap(bytes))
        chars.toString()
    } catch (e: CharacterCodingException) {
        throw ProtocolException("section channel/payload non UTF-8")
    }
}

/**
 * Encode `s` en UTF-8, tronqué pour tenir dans `width` octets sans jamais
 * couper un caractère multi-octets au milieu, puis paddé à zéro.
 *
 * Même stratégie que le SDK Python : on tronque brutalement au nombre
 * d'octets voulu, puis on redécode en ignorant la séquence UTF-8 finale
 * potentiellement coupée en deux (`CodingErrorAction.IGNORE`), avant de
 * ré-encoder pour obtenir des octets propres sur une frontière de caractère.
 */
private fun writePadded(width: Int, s: String): ByteArray {
    var encoded = s.toByteArray(Charsets.UTF_8)
    if (encoded.size > width) {
        val truncated = encoded.copyOfRange(0, width)
        val decoder = Charsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.IGNORE)
            .onUnmappableCharacter(CodingErrorAction.IGNORE)
        val chars = decoder.decode(ByteBuffer.wrap(truncated))
        encoded = chars.toString().toByteArray(Charsets.UTF_8)
    }
    val out = ByteArray(width) // déjà initialisé à 0 par la JVM
    System.arraycopy(encoded, 0, out, 0, encoded.size)
    return out
}

private fun readTrimmed(data: ByteArray): String {
    val end = data.indexOf(0).let { if (it == -1) data.size else it }
    return strictUtf8Decode(data.copyOfRange(0, end))
}

/**
 * CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF, pas de reflet, pas de
 * xorout) — identique à `crc16_ccitt_false` dans `protocol.rs`.
 */
fun crc16CcittFalse(data: ByteArray, offset: Int = 0, length: Int = data.size - offset): Int {
    var crc = 0xFFFF
    for (i in offset until offset + length) {
        crc = crc xor ((data[i].toInt() and 0xFF) shl 8)
        repeat(8) {
            crc = if (crc and 0x8000 != 0) {
                ((crc shl 1) xor 0x1021) and 0xFFFF
            } else {
                (crc shl 1) and 0xFFFF
            }
        }
    }
    return crc and 0xFFFF
}

/** Encode un frame sortant, checksummé et paddé à 256 octets. */
@JvmOverloads
fun encodeFrame(opcode: Opcode, tenantId: UUID, channelId: String = "", payload: String = ""): ByteArray {
    val buf = ByteBuffer.allocate(FRAME_SIZE).order(ByteOrder.BIG_ENDIAN)

    buf.putShort(MAGIC.toShort())
    buf.put(opcode.value.toByte())
    // UUID.mostSignificantBits/leastSignificantBits mis bout à bout donne
    // le layout standard RFC 4122 sur 16 octets big-endian — identique à
    // `Uuid::as_bytes()` côté Rust, pas de conversion supplémentaire.
    buf.putLong(tenantId.mostSignificantBits)
    buf.putLong(tenantId.leastSignificantBits)
    buf.put(writePadded(LEN_CHANNEL, channelId))
    buf.put(writePadded(LEN_PAYLOAD, payload))

    // La position du buffer est maintenant exactement à OFF_CRC (254) :
    // 2 + 1 + 16 + 24 + 211 = 254 octets déjà écrits ci-dessus.
    val array = buf.array()
    val crc = crc16CcittFalse(array, 0, OFF_CRC)
    buf.putShort(crc.toShort())

    return array
}

/**
 * Décode et valide intégralement un buffer de 256 octets. Ordre de
 * validation identique au serveur : longueur → magic → opcode → CRC16 → UTF-8.
 */
fun decodeFrame(data: ByteArray): DecodedFrame {
    if (data.size != FRAME_SIZE) {
        throw ProtocolException("longueur de frame invalide : $FRAME_SIZE attendus, ${data.size} reçus")
    }

    val magic = ((data[OFF_MAGIC].toInt() and 0xFF) shl 8) or (data[OFF_MAGIC + 1].toInt() and 0xFF)
    if (magic != MAGIC) {
        throw ProtocolException("magic/version invalide : 0x${magic.toString(16).padStart(4, '0')}")
    }

    val opcodeByte = data[OFF_OPCODE].toInt() and 0xFF
    val opcode = Opcode.fromByte(opcodeByte)
        ?: throw ProtocolException("opcode inconnu : 0x${opcodeByte.toString(16).padStart(2, '0')}")

    val expectedCrc = ((data[OFF_CRC].toInt() and 0xFF) shl 8) or (data[OFF_CRC + 1].toInt() and 0xFF)
    val actualCrc = crc16CcittFalse(data, 0, OFF_CRC)
    if (expectedCrc != actualCrc) {
        throw ProtocolException(
            "CRC16 invalide : frame annonce 0x${expectedCrc.toString(16)}, calculé 0x${actualCrc.toString(16)}",
        )
    }

    val tenantBuf = ByteBuffer.wrap(data, OFF_TENANT, LEN_TENANT).order(ByteOrder.BIG_ENDIAN)
    val tenantId = UUID(tenantBuf.long, tenantBuf.long)

    val channelId = readTrimmed(data.copyOfRange(OFF_CHANNEL, OFF_CHANNEL + LEN_CHANNEL))
    val payload = readTrimmed(data.copyOfRange(OFF_PAYLOAD, OFF_PAYLOAD + LEN_PAYLOAD))

    return DecodedFrame(opcode, tenantId, channelId, payload)
}

/**
 * Correspondance de glob simple (`*` = n'importe quelle sous-chaîne),
 * portée depuis `glob_match` dans `state.rs`. Le serveur ne renvoie que le
 * canal concret réel dans chaque frame, jamais le motif d'origine — c'est
 * au client de refaire la correspondance pour router vers les bons
 * abonnés locaux (cf. `RealtimeClient.dispatch`).
 */
fun globMatch(pattern: String, candidate: String): Boolean {
    fun helper(p: String, c: String): Boolean {
        if (p.isEmpty()) return c.isEmpty()
        if (p[0] == '*') {
            for (i in 0..c.length) {
                if (helper(p.substring(1), c.substring(i))) return true
            }
            return false
        }
        return c.isNotEmpty() && c[0] == p[0] && helper(p.substring(1), c.substring(1))
    }
    return helper(pattern, candidate)
}
