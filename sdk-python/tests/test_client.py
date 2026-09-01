"""``test_client.py`` — Tests de ``RealtimeClient.publish_template()``, via
``unittest`` de la bibliothèque standard (même choix que
``test_protocol.py`` : aucune dépendance de test supplémentaire pour un
SDK destiné à être installé par des tiers — l'appel HTTP `httpx` est mocké
avec ``unittest.mock``, pas de serveur réel ni de librairie de mock HTTP
tierce).

Ne couvre que ``publish_template()`` et sa dérivation d'URL HTTP
(``_http_base_url()``) : le reste de ``client.py`` (connexion WS,
reconnexion, heartbeat) reste non testé au runtime dans cet environnement,
faute d'accès réseau pour installer ``websockets`` — voir le README.
"""

import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

from realtime_sdk.client import ClientConfig, RealtimeClient

SAMPLE_TENANT = UUID("12345678-9abc-def0-1122-334455667788")


def _make_client(url: str = "wss://realtime.example.com/ws") -> RealtimeClient:
    config = ClientConfig(url=url, tenant_id=SAMPLE_TENANT, token="tok-123")
    return RealtimeClient(config)


class _FakeResponse:
    """Imite juste assez de ``httpx.Response`` pour ce que
    ``publish_template()`` en lit : ``.json()`` et ``.status_code``."""

    def __init__(self, json_body: dict, status_code: int = 200) -> None:
        self._json_body = json_body
        self.status_code = status_code

    def json(self) -> dict:
        return self._json_body


def _patch_http_post(json_body: dict, status_code: int = 200):
    """Remplace ``httpx.AsyncClient`` par un mock dont le ``async with ...
    as http_client`` et ``await http_client.post(...)`` fonctionnent, sans
    ouvrir de vraie connexion réseau. Retourne le patcher (à utiliser en
    context manager) et le mock du client, pour inspecter les appels
    (``post.assert_awaited_once()``, ``post.call_args``, ...)."""
    fake_response = _FakeResponse(json_body, status_code)

    mock_async_client = MagicMock()
    mock_async_client.__aenter__ = AsyncMock(return_value=mock_async_client)
    mock_async_client.__aexit__ = AsyncMock(return_value=False)
    mock_async_client.post = AsyncMock(return_value=fake_response)

    mock_client_cls = MagicMock(return_value=mock_async_client)
    return patch("realtime_sdk.client.httpx.AsyncClient", mock_client_cls), mock_async_client


class TestPublishTemplate(unittest.TestCase):
    def test_success_posts_expected_url_body_and_headers(self) -> None:
        client = _make_client()
        patcher, mock_async_client = _patch_http_post(
            {"success": True, "data": {"published": True}, "trace_id": "t-1"}
        )
        with patcher:
            asyncio.run(client.publish_template("orders:42", "tmpl-1", {"name": "Ada"}))

        mock_async_client.post.assert_awaited_once()
        args, kwargs = mock_async_client.post.call_args
        self.assertEqual(args[0], "https://realtime.example.com/api/v1/messages/template")
        self.assertEqual(
            kwargs["json"],
            {
                "tenant_id": str(SAMPLE_TENANT),
                "channel_id": "orders:42",
                "template_id": "tmpl-1",
                "variables": {"name": "Ada"},
            },
        )
        self.assertEqual(kwargs["headers"], {"Authorization": "Bearer tok-123"})

    def test_variables_defaults_to_empty_dict(self) -> None:
        client = _make_client()
        patcher, mock_async_client = _patch_http_post({"success": True, "data": {"published": True}})
        with patcher:
            asyncio.run(client.publish_template("orders:42", "tmpl-1"))

        _, kwargs = mock_async_client.post.call_args
        self.assertEqual(kwargs["json"]["variables"], {})

    def test_raises_with_server_error_message_on_failure_envelope(self) -> None:
        client = _make_client()
        patcher, _ = _patch_http_post(
            {
                "success": False,
                "error": {
                    "code": "TEMPLATE_NOT_FOUND",
                    "message": "template introuvable",
                    "trace_id": "t-2",
                },
            },
            status_code=404,
        )
        with patcher:
            with self.assertRaisesRegex(RuntimeError, "template introuvable"):
                asyncio.run(client.publish_template("orders:42", "missing-id"))

    def test_raises_generic_message_when_error_envelope_absent(self) -> None:
        client = _make_client()
        patcher, _ = _patch_http_post({"success": False}, status_code=500)
        with patcher:
            with self.assertRaisesRegex(RuntimeError, "500"):
                asyncio.run(client.publish_template("orders:42", "tmpl-1"))

    def test_does_not_raise_on_success_envelope(self) -> None:
        client = _make_client()
        patcher, _ = _patch_http_post({"success": True, "data": {"published": True}})
        with patcher:
            asyncio.run(client.publish_template("orders:42", "tmpl-1"))  # ne doit lever aucune exception


class TestHttpBaseUrlDerivation(unittest.TestCase):
    def test_strips_wss_scheme_and_trailing_ws_path(self) -> None:
        client = _make_client(url="wss://realtime.example.com/ws")
        self.assertEqual(client._http_base_url(), "https://realtime.example.com")

    def test_strips_plain_ws_scheme(self) -> None:
        client = _make_client(url="ws://localhost:8090/ws")
        self.assertEqual(client._http_base_url(), "http://localhost:8090")

    def test_used_for_the_actual_http_call(self) -> None:
        client = _make_client(url="ws://localhost:8090/ws")
        patcher, mock_async_client = _patch_http_post({"success": True, "data": {"published": True}})
        with patcher:
            asyncio.run(client.publish_template("orders:42", "tmpl-1"))

        args, _ = mock_async_client.post.call_args
        self.assertEqual(args[0], "http://localhost:8090/api/v1/messages/template")


if __name__ == "__main__":
    unittest.main()
