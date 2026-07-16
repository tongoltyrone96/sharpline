"""
OpenWeatherMap weather adapter.

Uses the 5-day/3-hour forecast endpoint so we get the conditions closest
to event start time, including pop (probability of precipitation).

Graceful degradation:
  - 401 → key not yet active (can take up to 2 h after creation).
           Log a warning, return None. Never crash the poll cycle.
  - Any other HTTP/network error → log warning, return None.
  - Indoor venue → caller must NOT call this; use is_indoor flag instead.
"""

import logging
from datetime import datetime, timezone

import httpx

from app.adapters.base import WeatherAdapter

log = logging.getLogger(__name__)

_BASE = "https://api.openweathermap.org/data/2.5/forecast"
_TIMEOUT = 10


class OpenWeatherAdapter(WeatherAdapter):
    def __init__(self, api_key: str) -> None:
        self._key = api_key

    def fetch(self, lat: float, lon: float, target_time: datetime) -> dict | None:
        """
        Return weather dict for the 3-hour slot nearest to target_time.
        Returns None if the API is unreachable or key invalid.
        """
        try:
            resp = httpx.get(
                _BASE,
                params={
                    "lat": lat,
                    "lon": lon,
                    "appid": self._key,
                    "units": "metric",
                    "cnt": 16,  # 16 × 3 h = 48 h of forecast
                },
                timeout=_TIMEOUT,
            )
        except Exception as exc:
            log.warning("weather fetch network error (%.4f,%.4f): %s", lat, lon, exc)
            return None

        if resp.status_code == 401:
            log.warning(
                "OpenWeatherMap 401 at (%.4f,%.4f) — key may not be active yet",
                lat, lon,
            )
            return None

        if not resp.is_success:
            log.warning("weather fetch HTTP %d at (%.4f,%.4f)", resp.status_code, lat, lon)
            return None

        try:
            return self._parse(resp.json(), target_time)
        except Exception as exc:
            log.warning("weather parse error: %s", exc)
            return None

    @staticmethod
    def _parse(data: dict, target_time: datetime) -> dict:
        slots = data.get("list", [])
        if not slots:
            return {}

        target_ts = target_time.timestamp()

        def _distance(slot: dict) -> float:
            return abs(slot["dt"] - target_ts)

        best = min(slots, key=_distance)

        rain_mm = best.get("rain", {}).get("3h", 0.0)
        pop = best.get("pop", 0.0)
        wind_ms = best.get("wind", {}).get("speed", 0.0)

        return {
            "temp_c":    best["main"]["temp"],
            "wind_kmh":  round(wind_ms * 3.6, 1),
            "rain_prob": float(pop),
            "humidity":  best["main"]["humidity"],
            "condition": best["weather"][0]["description"] if best.get("weather") else None,
            "is_indoor": False,
        }
