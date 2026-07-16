"""
WebSocket endpoint for real-time model updates.

Clients connect to /ws and receive JSON messages when models are recomputed.
The background redis_listener task subscribes to the Redis pub/sub channel
and fans out messages to all connected clients.

Pub/sub failures (common with Upstash free tier) are logged and retried
every 30 s without crashing the REST API.
"""

from __future__ import annotations

import asyncio
import logging
import ssl
from typing import TYPE_CHECKING

import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings
from app.services.publisher import CHANNEL

if TYPE_CHECKING:
    from fastapi import FastAPI

router = APIRouter(tags=["websocket"])
log = logging.getLogger(__name__)


class ConnectionManager:
    """Tracks active WebSocket connections."""

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)
        log.debug("WS connected: total=%d", len(self._connections))

    def disconnect(self, ws: WebSocket) -> None:
        try:
            self._connections.remove(ws)
        except ValueError:
            pass
        log.debug("WS disconnected: total=%d", len(self._connections))

    async def broadcast(self, message: str) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._connections):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await manager.connect(ws)
    try:
        while True:
            data = await ws.receive_text()
            # Echo ping/pong keepalive
            if data == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(ws)


async def redis_listener(app: "FastAPI") -> None:  # noqa: ARG001
    """
    Background task: subscribe to Redis pub/sub and fan out to WebSocket clients.

    Restarts automatically after any error (Upstash free tier may reject
    persistent pub/sub connections). REST endpoints are unaffected.
    """
    while True:
        client = None
        try:
            ssl_ctx = None
            if settings.REDIS_URL.startswith("rediss://"):
                ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
                ssl_ctx.check_hostname = False
                ssl_ctx.verify_mode = ssl.CERT_NONE

            client = await aioredis.from_url(settings.REDIS_URL, ssl=ssl_ctx)
            pubsub = client.pubsub()
            await pubsub.subscribe(CHANNEL)
            log.info("Redis listener subscribed to %s", CHANNEL)

            async for message in pubsub.listen():
                if message["type"] == "message":
                    data = message["data"]
                    if isinstance(data, bytes):
                        data = data.decode()
                    await manager.broadcast(data)

        except asyncio.CancelledError:
            log.info("Redis listener cancelled")
            break
        except Exception as exc:
            log.warning("Redis listener error: %s — retry in 30s", exc)
            await asyncio.sleep(30)
        finally:
            if client is not None:
                try:
                    await client.aclose()
                except Exception:
                    pass
