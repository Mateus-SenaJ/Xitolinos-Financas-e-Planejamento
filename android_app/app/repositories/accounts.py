import sqlite3
import json
from uuid import uuid4

from app.core.constants import AccountStatus, AccountType
from app.core.exceptions import NotFoundError, ValidationError
from app.core.dates import utc_timestamp
from app.database.database import Database
from app.models.entities import Account


def _account(row: sqlite3.Row) -> Account:
    return Account(row["id"], row["name"], row["institution"], AccountType(row["type"]),
                   row["opening_balance_cents"], bool(row["is_liquid"]), row["priority"],
                   AccountStatus(row["status"]), row["notes"])


class AccountRepository:
    def __init__(self, database: Database):
        self.database = database

    def list_all(self) -> list[Account]:
        rows = self.database.connection.execute("SELECT * FROM accounts ORDER BY priority, name").fetchall()
        return [_account(row) for row in rows]

    def get(self, account_id: str) -> Account:
        row = self.database.connection.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if row is None:
            raise NotFoundError("Conta não encontrada.")
        return _account(row)

    def create(self, *, name: str, account_type: AccountType, opening_balance_cents: int = 0,
               institution: str = "", is_liquid: bool = True, priority: int = 1, notes: str = "") -> Account:
        if not name.strip() or len(name.strip()) > 50:
            raise ValidationError("Informe um nome de conta com até 50 caracteres.")
        if not isinstance(opening_balance_cents, int) or opening_balance_cents < 0:
            raise ValidationError("Saldo inicial inválido.")
        if priority < 1:
            raise ValidationError("A prioridade deve ser maior que zero.")
        account_id = str(uuid4())
        with self.database.transaction() as connection:
            connection.execute(
                "INSERT INTO accounts(id,name,institution,type,opening_balance_cents,is_liquid,priority,status,notes) VALUES (?,?,?,?,?,?,?,'active',?)",
                (account_id, name.strip(), institution.strip(), account_type.value, opening_balance_cents,
                 int(is_liquid), priority, notes.strip()),
            )
              self._audit(connection, account_id, "create", None,
                        {"name": name.strip(), "type": account_type.value, "opening_balance_cents": opening_balance_cents})
        return self.get(account_id)

    def set_status(self, account_id: str, status: AccountStatus) -> Account:
        with self.database.transaction() as connection:
            before = connection.execute("SELECT id,name,type,status FROM accounts WHERE id=?", (account_id,)).fetchone()
            if before is None:
                raise NotFoundError("Conta não encontrada.")
            cursor = connection.execute("UPDATE accounts SET status = ? WHERE id = ?", (status.value, account_id))
            if cursor.rowcount != 1:
                raise NotFoundError("Conta não encontrada.")
            self._audit(connection, account_id, "update", dict(before), {**dict(before), "status": status.value})
        return self.get(account_id)

    @staticmethod
    def _audit(connection, account_id, action, before, after):
        from app.core.dates import utc_timestamp
        connection.execute(
            "INSERT INTO audit_events(id,entity_type,entity_id,action,before_json,after_json,actor,created_at) VALUES (?,?,?,?,?,?,?,?)",
            (str(uuid4()), "account", account_id, action,
             json.dumps(before) if before is not None else None,
             json.dumps(after) if after is not None else None, "local-user", utc_timestamp()),
        )