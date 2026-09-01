"""``realtime_sdk`` — Client Python pour le moteur de notification et
messagerie temps réel multi-tenant (protocole binaire 256 octets).

Voir ``README.md`` pour le démarrage rapide. API volontairement proche
des SDKs TypeScript et Rust du même projet.
"""

from .protocol import DecodedFrame, Opcode, ProtocolError

__all__ = [
    "ClientConfig",
    "RealtimeClient",
    "RealtimeMessage",
    "DecodedFrame",
    "Opcode",
    "ProtocolError",
]

__version__ = "0.1.0"

try:
    # `client.py` dépend des bibliothèques tierces `websockets` (frames du
    # protocole binaire) et `httpx` (utilisée uniquement par
    # `publish_template()`). On garde cet import optionnel pour que
    # `realtime_sdk.protocol` (pur stdlib, testé) reste utilisable seul —
    # ex: un script de debug qui encode/décode des frames capturées sans
    # avoir besoin d'ouvrir de connexion réseau — même si ni l'une ni
    # l'autre n'est installée.
    from .client import ClientConfig, RealtimeClient, RealtimeMessage
except ImportError as _err:  # pragma: no cover - dépend de l'environnement d'installation
    _import_error = _err

    class _MissingWebsocketsDependency:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            raise ImportError(
                "RealtimeClient nécessite les paquets 'websockets' et 'httpx' : "
                "`pip install websockets httpx`"
            ) from _import_error

    ClientConfig = _MissingWebsocketsDependency  # type: ignore[assignment,misc]
    RealtimeClient = _MissingWebsocketsDependency  # type: ignore[assignment,misc]
    RealtimeMessage = _MissingWebsocketsDependency  # type: ignore[assignment,misc]
