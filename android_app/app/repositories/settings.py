import json
from uuid import uuid4

from app.core.dates import utc_timestamp
from app.database.database import Database

DEFAULT_SETTINGS = {
    "currency": "BRL",
    "minimum_margin_cents": 100_000,
    "forecast_horizon_days": 30,
    "theme": "light",
    "auto_lock_on_background": True,
}


class SettingsRepository:
    def __init__(self, database: Database):
        self.database = database

    def get_all(self) -> dict:
        rows = self.database.connection.execute("SELECT key,value FROM app_settings").fetchall()
        settings = dict(DEFAULT_SETTINGS)
        for row in rows:
            settings[row["key"]] = json.loads(row["value"])
        return settings

    def set(self, key: str, value) -> None:
        timestamp = utc_timestamp()
        with self.database.transaction() as connection:
            before_row = connection.execute("SELECT value FROM app_settings WHERE key=?", (key,)).fetchone()
            connection.execute(
                """INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)
                   ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at""",
                (key, json.dumps(value), timestamp),
            )
            connection.execute(
                "INSERT INTO audit_events(id,entity_type,entity_id,action,before_json,after_json,actor,created_at) VALUES (?,?,?,?,?,?,?,?)",
                (str(uuid4()), "setting", key, "update", before_row["value"] if before_row else None,
                 json.dumps(value), "local-user", timestamp),
            )