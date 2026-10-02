import sqlite3
import json
from datetime import date
from uuid import uuid4

from app.core.constants import TransactionStatus, TransactionType
from app.core.dates import utc_timestamp
from app.core.exceptions import NotFoundError
from app.database.database import Database
from app.models.entities import Transaction


def _transaction(row: sqlite3.Row) -> Transaction:
    return Transaction(row["id"], row["description"], row["original_description"], row["category"],
                       date.fromisoformat(row["date"]), TransactionType(row["type"]), row["amount_cents"],
                       row["account_id"], row["counterparty_account_id"], row["subcategory_id"],
                       row["establishment_id"], TransactionStatus(row["status"]))


class TransactionRepository:
    def __init__(self, database: Database):
        self.database = database

    def list_active(self, *, start: str | None = None, end: str | None = None) -> list[Transaction]:
        clauses = ["deleted_at IS NULL"]
        values: list[str] = []
        if start:
            clauses.append("date >= ?")
            values.append(start)
        if end:
            clauses.append("date <= ?")
            values.append(end)
        rows = self.database.connection.execute(
            f"SELECT * FROM transactions WHERE {' AND '.join(clauses)} ORDER BY date DESC, rowid DESC", values
        ).fetchall()
        return [_transaction(row) for row in rows]

    def create(self, *, description: str, category: str, transaction_date: date, transaction_type: TransactionType,
               amount_cents: int, account_id: str, counterparty_account_id: str | None = None,
               subcategory_id: str | None = None, establishment_id: str | None = None,
               original_description: str | None = None) -> Transaction:
        transaction_id = str(uuid4())
        timestamp = utc_timestamp()
        text = description.strip()
        with self.database.transaction() as connection:
            connection.execute(
                """INSERT INTO transactions(id,description,original_description,category,subcategory_id,date,type,
                   amount_cents,account_id,counterparty_account_id,establishment_id,status,created_at,updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,'POSTED',?,?)""",
                (transaction_id, text, original_description or text, category, subcategory_id,
                 transaction_date.isoformat(), transaction_type.value, amount_cents, account_id,
                 counterparty_account_id, establishment_id, timestamp, timestamp),
                        )
                        self._audit(connection, transaction_id, "create", None,
                                                {"description": text, "type": transaction_type.value, "amount_cents": amount_cents,
                                                 "date": transaction_date.isoformat(), "account_id": account_id}, timestamp)
        row = self.database.connection.execute("SELECT * FROM transactions WHERE id=?", (transaction_id,)).fetchone()
        return _transaction(row)

    def soft_delete(self, transaction_id: str) -> Transaction:
        timestamp = utc_timestamp()
        with self.database.transaction() as connection:
            row = connection.execute("SELECT * FROM transactions WHERE id=? AND deleted_at IS NULL", (transaction_id,)).fetchone()
            if row is None:
                raise NotFoundError("Lançamento não encontrado.")
            connection.execute("UPDATE transactions SET deleted_at=?,updated_at=? WHERE id=?", (timestamp, timestamp, transaction_id))
            self._audit(connection, transaction_id, "soft_delete", dict(row), {**dict(row), "deleted_at": timestamp}, timestamp)
        return _transaction(row)

    def restore(self, transaction_id: str) -> Transaction:
        timestamp = utc_timestamp()
        with self.database.transaction() as connection:
            row = connection.execute("SELECT * FROM transactions WHERE id=? AND deleted_at IS NOT NULL", (transaction_id,)).fetchone()
            if row is None:
                raise NotFoundError("Lançamento não encontrado na Lixeira.")
            connection.execute("UPDATE transactions SET deleted_at=NULL,updated_at=? WHERE id=?", (timestamp, transaction_id))
            self._audit(connection, transaction_id, "restore", dict(row), {**dict(row), "deleted_at": None}, timestamp)
        active = self.database.connection.execute("SELECT * FROM transactions WHERE id=?", (transaction_id,)).fetchone()
        return _transaction(active)

    @staticmethod
    def _audit(connection, entity_id, action, before, after, timestamp):
        connection.execute(
            "INSERT INTO audit_events(id,entity_type,entity_id,action,before_json,after_json,actor,created_at) VALUES (?,?,?,?,?,?,?,?)",
            (str(uuid4()), "transaction", entity_id, action,
             json.dumps(before) if before is not None else None,
             json.dumps(after) if after is not None else None, "local-user", timestamp),
        )