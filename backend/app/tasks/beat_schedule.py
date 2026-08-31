BEAT_SCHEDULE = {
    "poll-odds": {
        "task": "app.tasks.poll_odds.poll_odds",
        "schedule": 30.0,
    },
    "poll-weather": {
        "task": "app.tasks.poll_weather.poll_weather",
        "schedule": 1800.0,  # 30 min
    },
    "poll-lineups": {
        "task": "app.tasks.poll_lineups.poll_lineups",
        "schedule": 900.0,  # 15 min
    },
    # Trim odds_history once a day. Cheap now that unchanged prices are no
    # longer recorded, but the table is append-only so it still needs a floor.
    "prune-odds-history": {
        "task": "app.tasks.prune_history.prune_odds_history",
        "schedule": 86400.0,  # 24 h
    },
}
