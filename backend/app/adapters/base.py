from abc import ABC, abstractmethod
from datetime import datetime


class OddsAdapter(ABC):
    @abstractmethod
    def fetch_odds(self, sport_key: str) -> tuple[list[dict], dict]:
        """Return (payload, quota_headers). Raises on HTTP error."""

    @abstractmethod
    def fetch_sports(self) -> list[dict]:
        """Free call — returns the /sports list."""


class WeatherAdapter(ABC):
    @abstractmethod
    def fetch(self, lat: float, lon: float, target_time: datetime) -> dict | None:
        """
        Return a weather dict or None if unavailable (e.g. key not yet active).

        Keys: temp_c, wind_kmh, rain_prob, humidity, condition, is_indoor.
        Implementations must never raise — log and return None on any failure.
        """


class LineupAdapter(ABC):
    @abstractmethod
    def fetch(
        self,
        home_team: str,
        away_team: str,
        commence_time: datetime,
    ) -> list[dict]:
        """
        Return a list of player status dicts for the event.

        Each dict: {player_name, team_side ("home"|"away"), status
                    ("in"|"out"|"doubtful"|"questionable"), reason, importance}.

        Must NEVER raise — log any failure and return [].
        """
