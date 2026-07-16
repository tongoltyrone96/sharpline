"""
Phase 6 gate tests — Weather adapter.

All tests are pure (no real API calls). httpx.get is patched throughout.
"""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.adapters.weather_openweathermap import OpenWeatherAdapter

_LAT = -37.82
_LON = 144.98
_NOW = datetime(2026, 7, 18, 6, 0, 0, tzinfo=timezone.utc)

_FORECAST_PAYLOAD = {
    "list": [
        {
            "dt": int(_NOW.timestamp()),
            "main": {"temp": 14.5, "humidity": 72},
            "wind": {"speed": 7.2},   # m/s → 25.9 km/h
            "pop":  0.35,
            "weather": [{"description": "light rain"}],
        }
    ]
}

_ADAPTER = OpenWeatherAdapter("test-key")


class TestOpenWeatherAdapter:
    def test_returns_correct_fields(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.is_success = True
        mock_resp.json.return_value = _FORECAST_PAYLOAD

        with patch("httpx.get", return_value=mock_resp):
            result = _ADAPTER.fetch(_LAT, _LON, _NOW)

        assert result is not None
        assert abs(result["temp_c"] - 14.5) < 0.01
        assert abs(result["wind_kmh"] - 7.2 * 3.6) < 0.1    # m/s × 3.6, rounded to 1dp
        assert abs(result["rain_prob"] - 0.35) < 0.001
        assert result["humidity"] == 72
        assert result["condition"] == "light rain"
        assert result["is_indoor"] is False

    def test_wind_converted_from_ms_to_kmh(self):
        """7.2 m/s = 25.9 km/h (×3.6)."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.is_success = True
        mock_resp.json.return_value = _FORECAST_PAYLOAD

        with patch("httpx.get", return_value=mock_resp):
            result = _ADAPTER.fetch(_LAT, _LON, _NOW)

        assert result["wind_kmh"] == pytest.approx(7.2 * 3.6, abs=0.05)

    def test_401_returns_none_not_exception(self):
        """Key not yet active — must return None, never raise."""
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.is_success = False

        with patch("httpx.get", return_value=mock_resp):
            result = _ADAPTER.fetch(_LAT, _LON, _NOW)

        assert result is None

    def test_network_error_returns_none(self):
        """Connection failure — must return None, never raise."""
        with patch("httpx.get", side_effect=Exception("connection refused")):
            result = _ADAPTER.fetch(_LAT, _LON, _NOW)

        assert result is None

    def test_500_returns_none(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.is_success = False

        with patch("httpx.get", return_value=mock_resp):
            result = _ADAPTER.fetch(_LAT, _LON, _NOW)

        assert result is None

    def test_picks_slot_closest_to_target_time(self):
        """When multiple slots present, the one nearest to target_time is used."""
        target = _NOW
        payload = {
            "list": [
                {
                    "dt": int(target.timestamp()) - 7200,  # 2h before — farther
                    "main": {"temp": 10.0, "humidity": 80},
                    "wind": {"speed": 0.0},
                    "pop":  0.0,
                    "weather": [{"description": "clear sky"}],
                },
                {
                    "dt": int(target.timestamp()) + 900,  # 15 min after — closer
                    "main": {"temp": 15.0, "humidity": 65},
                    "wind": {"speed": 5.0},
                    "pop":  0.2,
                    "weather": [{"description": "partly cloudy"}],
                },
            ]
        }
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.is_success = True
        mock_resp.json.return_value = payload

        with patch("httpx.get", return_value=mock_resp):
            result = _ADAPTER.fetch(_LAT, _LON, target)

        assert result["temp_c"] == 15.0  # closer slot chosen

    def test_empty_list_returns_empty_dict(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.is_success = True
        mock_resp.json.return_value = {"list": []}

        with patch("httpx.get", return_value=mock_resp):
            result = _ADAPTER.fetch(_LAT, _LON, _NOW)

        assert result == {}


class TestWeatherServiceIndoorLogic:
    """Indoor venues must never call the API."""

    def test_indoor_team_skips_api_call(self):
        from app.services.weather_service import write_weather

        db = MagicMock()
        # home team has is_indoor=True
        event = MagicMock()
        event.id = "test-event-1"
        event.home_team = MagicMock()
        event.home_team.is_indoor = True
        event.home_team.venue_lat = 33.527
        event.home_team.venue_lon = -112.262

        adapter = MagicMock()

        with patch("app.services.weather_service._upsert_indoor") as mock_upsert:
            result = write_weather(db, event, adapter)

        # Adapter must NOT have been called
        adapter.fetch.assert_not_called()
        mock_upsert.assert_called_once_with(db, "test-event-1")
        assert result is True

    def test_outdoor_no_coords_skips_gracefully(self):
        from app.services.weather_service import write_weather

        db = MagicMock()
        event = MagicMock()
        event.id = "test-event-2"
        event.home_team = MagicMock()
        event.home_team.is_indoor = False
        event.home_team.venue_lat = None
        event.home_team.venue_lon = None

        adapter = MagicMock()
        result = write_weather(db, event, adapter)

        adapter.fetch.assert_not_called()
        assert result is False

    def test_adapter_returns_none_preserves_stale(self):
        """If adapter returns None (401 etc.), return False — do not delete stale data."""
        from app.services.weather_service import write_weather

        db = MagicMock()
        event = MagicMock()
        event.id = "test-event-3"
        event.home_team = MagicMock()
        event.home_team.is_indoor = False
        event.home_team.venue_lat = -37.82
        event.home_team.venue_lon = 144.98
        event.commence_time = _NOW

        adapter = MagicMock()
        adapter.fetch.return_value = None

        result = write_weather(db, event, adapter)

        assert result is False
        # DB should not be written to
        db.execute.assert_not_called()
