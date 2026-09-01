"""``examples/basic_usage.py`` — Utilisation minimale du SDK.

Nécessite ``websockets`` (``pip install realtime-sdk`` l'installe déjà en
dépendance) : ``python examples/basic_usage.py``
"""

import asyncio
import os
from uuid import UUID

from realtime_sdk import ClientConfig, RealtimeClient, RealtimeMessage


def on_order(message: RealtimeMessage) -> None:
    print(f"[orders:42] {message.payload}")


def on_any_order(message: RealtimeMessage) -> None:
    print(f"[wildcard orders:*] {message.channel_id} -> {message.payload}")


async def main() -> None:
    config = ClientConfig(
        url="wss://realtime.example.com/ws",
        tenant_id=UUID("12345678-9abc-def0-1122-334455667788"),
        # Jeton émis côté serveur — jamais généré côté client.
        token=os.environ.get("REALTIME_TOKEN", ""),
    )

    async with RealtimeClient(config) as client:
        client.subscribe("orders:42", on_order)
        client.subscribe("orders:*", on_any_order)  # souscription par motif

        await asyncio.sleep(1)  # laisse le temps à AUTH/SUB de s'établir

        await client.publish("orders:42", "commande créée")
        await client.unicast("user-789", "message direct")
        await client.replay("orders:42", 0)  # rattrape tout l'historique disponible

        # Appel HTTP séparé (pas un frame du protocole binaire) : le
        # serveur interpole lui-même les `{{variable}}` du template
        # `template_id`, choisi côté tenant-portal → Templates.
        await client.publish_template("orders:42", "tmpl-order-created", {"order_id": "42"})

        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())
