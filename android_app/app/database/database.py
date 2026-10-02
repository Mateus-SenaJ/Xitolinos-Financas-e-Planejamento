import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

SCHEMA_VERSION = 4


class Database:
    def __init__(self, path: str | Path):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self.connection = sqlite3.connect(self.path, isolation_level=None, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.execute("PRAGMA journal_mode = WAL")
        self.migrate()

    def migrate(self) -> None:
        with self._lock:
            try:
                self.connection.executescript(
                    """
                    BEGIN IMMEDIATE;
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS accounts (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, institution TEXT NOT NULL DEFAULT '',
                    type TEXT NOT NULL, opening_balance_cents INTEGER NOT NULL DEFAULT 0,
                    is_liquid INTEGER NOT NULL DEFAULT 1, priority INTEGER NOT NULL DEFAULT 1,
                    status TEXT NOT NULL DEFAULT 'active', notes TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS categories (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, type TEXT NOT NULL,
                    parent_id TEXT REFERENCES categories(id), icon TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'active'
                );
                CREATE TABLE IF NOT EXISTS budgets (
                    category TEXT PRIMARY KEY, limit_cents INTEGER NOT NULL CHECK(limit_cents >= 0)
                );
                CREATE TABLE IF NOT EXISTS goals (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, saved_cents INTEGER NOT NULL CHECK(saved_cents >= 0),
                    target_cents INTEGER NOT NULL CHECK(target_cents > 0), symbol TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS establishments (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, default_category TEXT,
                    tags_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active'
                );
                CREATE TABLE IF NOT EXISTS establishment_aliases (
                    id TEXT PRIMARY KEY, establishment_id TEXT NOT NULL REFERENCES establishments(id),
                    alias TEXT NOT NULL, normalized_alias TEXT NOT NULL UNIQUE
                );
                CREATE TABLE IF NOT EXISTS transactions (
                    id TEXT PRIMARY KEY, description TEXT NOT NULL, original_description TEXT NOT NULL,
                    category TEXT NOT NULL, subcategory_id TEXT REFERENCES categories(id), date TEXT NOT NULL,
                    type TEXT NOT NULL CHECK(type IN ('income','expense','transfer')),
                    amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
                    account_id TEXT NOT NULL REFERENCES accounts(id),
                    counterparty_account_id TEXT REFERENCES accounts(id),
                    establishment_id TEXT REFERENCES establishments(id), status TEXT NOT NULL DEFAULT 'POSTED',
                    deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(date DESC);
                CREATE INDEX IF NOT EXISTS transactions_category_idx ON transactions(category);
                CREATE INDEX IF NOT EXISTS transactions_account_date_idx ON transactions(account_id, date DESC);
                CREATE INDEX IF NOT EXISTS transactions_active_date_idx ON transactions(deleted_at, date DESC);
                CREATE TABLE IF NOT EXISTS audit_events (
                    id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
                    action TEXT NOT NULL, before_json TEXT, after_json TEXT,
                    actor TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_events(entity_type, entity_id, created_at DESC);
                CREATE TABLE IF NOT EXISTS security_credentials (
                    id INTEGER PRIMARY KEY CHECK(id = 1), salt TEXT NOT NULL, digest TEXT NOT NULL,
                    iterations INTEGER NOT NULL, failed_attempts INTEGER NOT NULL DEFAULT 0,
                    locked_until INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                    """
                )
                now = "1970-01-01T00:00:00Z"
                for version in range(1, SCHEMA_VERSION + 1):
                    self.connection.execute(
                        "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)",
                        (version, now),
                    )
                self.connection.commit()
            except Exception:
                self.connection.rollback()
                raise

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            self.connection.execute("BEGIN IMMEDIATE")
            try:
                yield self.connection
            except Exception:
                self.connection.rollback()
                raise
            else:
                self.connection.commit()

    def close(self) -> None:
        with self._lock:
            self.connection.close()