"""``client.py`` — Client asyncio du moteur temps réel maison.

Dépend de la bibliothèque tierce ``websockets`` (non testable dans
l'environnement où ce SDK a été écrit — pas d'accès réseau pour
l'installer, cf. README). ``protocol.py``, lui, est pur stdlib et a été
réellement testé.

API volontairement proche des SDKs TypeScript et Rust du même projet :
mêmes opérations (``publish``, ``subscribe``, ``unicast``, ``replay``),
mêmes limitations documentées.
"""

from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass
from typing import Callable, Dict, Set
from uuid import UUID

import websockets
from websockets.exceptions import ConnectionClosed

from .protocol import Opcode, ProtocolError, decode_frame, encode_frame, glob_match

logger = logging.getLogger("realtime_sdk")

#: WS close code the server sends when AUTH is rejected (invalid or
#: expired token) — see ``WsController.rs::WS_CLOSE_CODE_AUTH_FAILED`` on
#: the backend, the one source of truth for this value.
WS_CLOSE_CODE_AUTH_FAILED = 4001


@dataclass(frozen=True)
class RealtimeMessage:
    channel_id: str
    payload: str
    tenant_id: UUID


MessageHandler = Callable[[RealtimeMessage], None]
Unsubscribe = Callable[[], None]


@dataclass
class ClientConfig:
    url: str
    tenant_id: UUID
    #: Jeton émis côté serveur (``auth.rs::AuthManager::issue_token``).
    #: Ce SDK ne le génère jamais lui-même.
    token: str
    heartbeat_interval: float = 15.0
    reconnect: bool = True
    reconnect_base_delay: float = 0.5
    reconnect_max_delay: float = 15.0


class RealtimeClient:
    """Client temps réel avec reconnexion automatique, heartbeat, et
    ré-abonnement transparent après reconnexion.

    Usage::

        async with RealtimeClient(config) as client:
            client.subscribe("orders:42", lambda msg: print(msg.payload))
            await client.publish("orders:42", "commande créée")
            await asyncio.sleep(3600)

    Ou sans context manager::

        client = RealtimeClient(config)
        await client.connect()
        ...
        await client.disconnect()
    """

    def __init__(self, config: ClientConfig) -> None:
        self._config = config
        self._ws: "websockets.WebSocketClientProtocol | None" = None
        self._subscriptions: Dict[str, Set[MessageHandler]] = {}
        # `publish()`/`unicast()`/`replay()` appelés avant que la connexion
        # ne soit établie (la race que `connect()`'s propre docstring
        # documente) — mis en file ici plutôt que de lever, vidée une
        # seule fois à la connexion, dans l'ordre d'appel d'origine (pas à
        # chaque reconnexion, contrairement aux souscriptions : chacun de
        # ces trois appels est une action ponctuelle, pas un état à
        # maintenir indéfiniment).
        self._pending_sends: list[tuple[Opcode, str, str]] = []
        self._connection_task: "asyncio.Task | None" = None
        self._heartbeat_task: "asyncio.Task | None" = None
        self._closed_by_user = True
        # Sérialise les écritures concurrentes sur le socket (heartbeat,
        # ré-abonnement au reconnect, et appels applicatifs directs
        # peuvent tous vouloir écrire au même moment).
        self._send_lock = asyncio.Lock()

    async def connect(self) -> None:
        self._closed_by_user = False
        self._connection_task = asyncio.create_task(self._run_connection())
        # Cède la main une fois pour laisser la tâche de fond démarrer sa
        # première tentative de connexion — évite une race triviale si
        # l'appelant enchaîne immédiatement avec `publish()`. N'élimine
        # pas complètement la race (la connexion peut prendre plus de
        # temps qu'un simple `sleep(0)`) : pour un besoin fort de
        # garantie, attendez plutôt un futur évènement de connexion
        # explicite (non exposé dans cette première version — cf. README).
        await asyncio.sleep(0)

    async def disconnect(self) -> None:
        self._closed_by_user = True
        if self._heartbeat_task is not None:
            self._heartbeat_task.cancel()
        if self._ws is not None:
            await self._ws.close()
        if self._connection_task is not None:
            self._connection_task.cancel()
            try:
                await self._connection_task
            except asyncio.CancelledError:
                pass

    async def __aenter__(self) -> "RealtimeClient":
        await self.connect()
        return self

    async def __aexit__(self, *_exc_info: object) -> None:
        await self.disconnect()

    def subscribe(self, channel_id: str, handler: MessageHandler) -> Unsubscribe:
        """S'abonne à un canal exact ou à un motif (``orders:*``).

        Envoie le SUB immédiatement si la connexion est active ; sinon il
        est différé et rejoué automatiquement à la prochaine connexion
        réussie (y compris après une reconnexion).

        La fonction retournée envoie un vrai frame UNSUB (Opcode `0x09`)
        au serveur une fois le dernier handler retiré pour ce canal — la
        tâche de relais côté serveur est réellement arrêtée, ce n'est pas
        un simple silence côté client.
        """
        is_new_channel = channel_id not in self._subscriptions
        self._subscriptions.setdefault(channel_id, set()).add(handler)

        if is_new_channel and self._ws is not None:
            asyncio.create_task(self._send(Opcode.SUBSCRIBE, channel_id, ""))

        def _unsubscribe() -> None:
            handlers = self._subscriptions.get(channel_id)
            if handlers is None:
                return
            handlers.discard(handler)
            if not handlers:
                del self._subscriptions[channel_id]
                if self._ws is not None:
                    # `_unsubscribe` est une fonction synchrone (retournée
                    # telle quelle à l'appelant, pas une coroutine) : on
                    # planifie l'envoi plutôt que d'attendre ici.
                    asyncio.create_task(self._send(Opcode.UNSUB, channel_id, ""))

        return _unsubscribe

    async def publish(self, channel_id: str, payload: str) -> None:
        """Appelé avant que la connexion ne soit établie (ex: juste après
        ``connect()`` — la race que son propre docstring documente) — mis
        en file et envoyé dès la connexion, plutôt que de lever
        ``ConnectionError``."""
        await self._send_or_queue(Opcode.PUBLISH, channel_id, payload)

    async def unicast(self, user_id: str, payload: str) -> None:
        """Envoi direct à un utilisateur. ⚠️ ``user_id`` doit tenir dans 24
        octets UTF-8 (contrainte du frame fixe, champ ``channel_id``
        repurposé). Même mise en file que ``publish()`` si appelé avant la
        connexion — voir sa doc."""
        await self._send_or_queue(Opcode.UNICAST, user_id, payload)

    async def replay(self, channel_id: str, since_unix_secs: int = 0) -> None:
        """Demande le rattrapage de l'historique depuis ``since_unix_secs``
        (0 = tout l'historique disponible). Non supporté sur un motif
        (``orders:*``) — le serveur ignore silencieusement la demande.
        Appelé avant que la connexion ne soit établie (ex: juste après
        ``connect()``) — mis en file et rejoué dès la connexion,
        plutôt que de lever ``ConnectionError``."""
        await self._send_or_queue(Opcode.REPLAY, channel_id, str(since_unix_secs))

    async def _send_or_queue(self, opcode: Opcode, channel_id: str, payload: str) -> None:
        if self._ws is not None:
            await self._send(opcode, channel_id, payload)
        else:
            self._pending_sends.append((opcode, channel_id, payload))

    async def _send(self, opcode: Opcode, channel_id: str, payload: str) -> None:
        if self._ws is None:
            raise ConnectionError("connexion WebSocket non établie")
        frame = encode_frame(opcode, self._config.tenant_id, channel_id, payload)
        async with self._send_lock:
            await self._ws.send(frame)

    async def _run_connection(self) -> None:
        backoff = self._config.reconnect_base_delay

        while True:
            close_code: "int | None" = None
            try:
                async with websockets.connect(self._config.url) as ws:
                    self._ws = ws
                    logger.info("connecté à %s", self._config.url)
                    backoff = self._config.reconnect_base_delay  # reset après un succès

                    # AUTH systématiquement en premier.
                    await self._send(Opcode.AUTH, "", self._config.token)

                    # Re-souscrit à tous les canaux déjà enregistrés —
                    # essentiel pour qu'une reconnexion soit transparente.
                    for channel_id in list(self._subscriptions.keys()):
                        await self._send(Opcode.SUBSCRIBE, channel_id, "")

                    pending_sends, self._pending_sends = self._pending_sends, []
                    for opcode, channel_id, payload in pending_sends:
                        await self._send(opcode, channel_id, payload)

                    self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
                    try:
                        async for raw in ws:
                            self._dispatch(raw)
                    finally:
                        self._heartbeat_task.cancel()
                close_code = ws.close_code

            except (ConnectionClosed, OSError) as err:
                logger.warning("connexion perdue : %s", err)
                close_code = getattr(err, "code", None)
            finally:
                self._ws = None

            if close_code == WS_CLOSE_CODE_AUTH_FAILED:
                # Retrying with the exact same token the server just
                # rejected would just fail again, forever, silently — stop
                # here rather than backing off and reconnecting. This SDK
                # has no event/callback system yet for connection-lifecycle
                # state (unlike sdk-typescript's `authFailed` event or
                # mio-client.js's `client.on('authFailed', ...)` — adding
                # one is a bigger change than this fix), so a clear log
                # line is the best signal available today.
                logger.error(
                    "authentification rejetée par le serveur (jeton invalide ou expiré, code WS %s) — "
                    "minez un nouveau jeton ; reconnexion volontairement abandonnée (retenter avec le "
                    "même jeton échouerait indéfiniment)",
                    WS_CLOSE_CODE_AUTH_FAILED,
                )
                return

            if self._closed_by_user or not self._config.reconnect:
                return

            # Jitter ±20%, même principe que les SDKs TS/Rust : évite un
            # effet troupeau si de nombreux clients se reconnectent en
            # même temps après une coupure côté infrastructure serveur.
            jitter = backoff * (0.8 + random.random() * 0.4)
            await asyncio.sleep(jitter)
            backoff = min(backoff * 2, self._config.reconnect_max_delay)

    async def _heartbeat_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(self._config.heartbeat_interval)
                if self._ws is not None:
                    await self._send(Opcode.PING, "", "")
        except asyncio.CancelledError:
            pass

    def _dispatch(self, raw: bytes) -> None:
        try:
            frame = decode_frame(raw)
        except ProtocolError as err:
            logger.debug("frame invalide ignoré : %s", err)
            return

        message = RealtimeMessage(channel_id=frame.channel_id, payload=frame.payload, tenant_id=frame.tenant_id)

        handlers = self._subscriptions.get(frame.channel_id)
        if handlers:
            for handler in list(handlers):
                handler(message)

        # Correspondance par motif : le serveur ne renvoie que le canal
        # concret réel, jamais le motif d'origine — on refait le matching
        # glob côté client pour chaque motif actif.
        for pattern, pattern_handlers in list(self._subscriptions.items()):
            if "*" in pattern and glob_match(pattern, frame.channel_id):
                for handler in list(pattern_handlers):
                    handler(message)
