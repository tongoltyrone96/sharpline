from celery.schedules import crontab

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
    "refresh-sports": {
        "task": "app.tasks.refresh_sports.refresh_sports",
        "schedule": 21600.0,  # 6 h, free endpoint
    },
    "prune-history": {
        "task": "app.tasks.prune_history.prune_history",
        "schedule": crontab(hour=3, minute=0),  # 3 AM UTC nightly
    },
}
