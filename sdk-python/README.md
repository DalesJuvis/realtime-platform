# realtime-sdk (Python)

Client Python asyncio pour le moteur de notification et messagerie temps
réel multi-tenant (protocole binaire fixe 256 octets). API volontairement
proche des SDKs [TypeScript](../sdk-typescript) et [Rust](../sdk-rust) du
même projet — mêmes opérations, mêmes limitations documentées.

> **Statut de validation (soyons précis, pas juste rassurants) :**
> - `realtime_sdk/protocol.py` — **réellement testé** dans l'environnement
>   où ce SDK a été écrit : pur stdlib, aucune dépendance externe, 12/12
>   tests unitaires passants (`python -m unittest discover -s tests`).
> - `realtime_sdk/client.py` — **non testé au runtime**, faute d'accès
>   réseau pour installer son unique dépendance externe, `websockets`. La
>   logique suit fidèlement le même design que les SDKs TS/Rust (déjà
>   écrits dans les mêmes contraintes), mais un premier `pip install -e .`
>   suivi d'un test contre un vrai serveur reste nécessaire avant usage
>   réel. Le module s'importe cependant sans erreur même sans
>   `websockets` installé — `realtime_sdk.protocol` reste utilisable seul.

## Installation

```bash
pip install realtime-sdk  # une fois publié ; sinon `pip install -e .` depuis ce dossier
```

## Démarrage rapide

```python
import asyncio
from uuid import UUID
from realtime_sdk import ClientConfig, RealtimeClient

async def main():
    config = ClientConfig(
        url="wss://realtime.example.com/ws",
        tenant_id=UUID("..."),
        token=mon_jeton_emis_par_le_serveur,
    )

    async with RealtimeClient(config) as client:
        client.subscribe("orders:42", lambda msg: print(msg.payload))
        await client.publish("orders:42", "commande créée")
        await asyncio.sleep(3600)

asyncio.run(main())
```

Voir `examples/basic_usage.py` pour un exemple complet (souscription par
motif, UNICAST, REPLAY).

## Fonctionnalités

| Fonctionnalité | API |
|---|---|
| Publication | `await client.publish(channel_id, payload)` |
| Souscription (canal exact ou motif `orders:*`) | `client.subscribe(channel_id, handler) -> Callable[[], None]` |
| Envoi direct à un utilisateur | `await client.unicast(user_id, payload)` |
| Rattrapage d'historique | `await client.replay(channel_id, since_unix_secs=0)` |

Reconnexion automatique (backoff exponentiel + jitter), heartbeat PING
périodique, et ré-abonnement transparent à tous les canaux actifs après
une reconnexion — gérés en tâche de fond (`asyncio.Task`), rien à
orchestrer manuellement. `subscribe()` accepte plusieurs handlers pour un
même canal ; chacun reçoit tous les messages.

## Limitations connues (documentées, pas cachées)

- **`replay()` ne fonctionne pas sur un motif** (`orders:*`) — l'historique
  serveur est indexé par canal exact, la demande est ignorée
  silencieusement.
- **`unicast()` exige un `user_id` ≤ 24 octets UTF-8** (contrainte du
  frame fixe, champ `channel_id` repurposé).
- **Pas d'accusé de réception AUTH** ni d'évènement de connexion exposé
  (contrairement au SDK TypeScript) — seuls des logs via le module
  `logging` standard (`logger = logging.getLogger("realtime_sdk")`).
  Amélioration naturelle pour une v2.
- **Race légère à la connexion** : `connect()` ne cède la main qu'une
  fois (`await asyncio.sleep(0)`) avant de retourner, ce qui ne garantit
  pas que la connexion soit établie si vous enchaînez immédiatement avec
  `publish()`. Documenté dans le docstring de `connect()`.

*Résolu depuis la v0.1 : la fonction de désabonnement retournée par
`subscribe()` envoie désormais un vrai frame UNSUB (`Opcode 0x09`) au
serveur une fois le dernier handler retiré — plus un simple silence
côté client.*

## Développement

```bash
pip install -e ".[dev]"
python -m unittest discover -s tests -v   # tests du codec binaire, sans dépendance réseau
python examples/basic_usage.py
```
