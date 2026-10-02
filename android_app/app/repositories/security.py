from app.core.dates import utc_timestamp
from app.core.security import PinRecord
from app.database.database import Database


class SecurityRepository:
    def __init__(self, database: Database):
        self.database = database

    def read_pin_record(self) -> PinRecord | None:
        row = self.database.connection.execute("SELECT * FROM security_credentials WHERE id=1").fetchone()
        if row is None:
            return None
        return PinRecord(row["salt"], row["digest"], row["iterations"], row["failed_attempts"], row["locked_until"])

    def write_pin_record(self, record: PinRecord) -> None:
        with self.database.transaction() as connection:
            connection.execute(
                """INSERT INTO security_credentials(id,salt,digest,iterations,failed_attempts,locked_until,updated_at)
                   VALUES (1,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET salt=excluded.salt,digest=excluded.digest,
                   iterations=excluded.iterations,failed_attempts=excluded.failed_attempts,
                   locked_until=excluded.locked_until,updated_at=excluded.updated_at""",
                (record.salt, record.digest, record.iterations, record.failed_attempts,
                 record.locked_until, utc_timestamp()),
            )


class AuditRepository:
    def __init__(self, database: Database):
        self.database = database

    def recent(self, limit: int = 100) -> list[dict]:
        rows = self.database.connection.execute(
            "SELECT entity_type,action,actor,created_at FROM audit_events ORDER BY created_at DESC,rowid DESC LIMIT ?",
            (max(1, min(limit, 250)),),
        ).fetchall()
        return [dict(row) for row in rows]