import sqlite3
import json
from uuid import uuid4

from app.core.exceptions import NotFoundError, ValidationError
from app.database.database import Database
from app.models.entities import Category


def _category(row: sqlite3.Row) -> Category:
    return Category(row["id"], row["name"], row["type"], row["parent_id"], row["icon"], row["status"])


class CategoryRepository:
    def __init__(self, database: Database):
        self.database = database

    def list_all(self, *, include_archived: bool = False) -> list[Category]:
        query = "SELECT * FROM categories" if include_archived else "SELECT * FROM categories WHERE status='active'"
        return [_category(row) for row in self.database.connection.execute(query + " ORDER BY type,name").fetchall()]

    def create(self, *, name: str, category_type: str, parent_id: str | None = None, icon: str = "") -> Category:
        if category_type not in ("income", "expense"):
            raise ValidationError("Tipo de categoria inválido.")
        if not name.strip() or len(name.strip()) > 40:
            raise ValidationError("Informe um nome de categoria com até 40 caracteres.")
        if parent_id:
            parent = self.database.connection.execute("SELECT type,status FROM categories WHERE id=?", (parent_id,)).fetchone()
            if parent is None or parent["status"] != "active" or parent["type"] != category_type:
                raise ValidationError("Categoria superior inválida.")
        category_id = str(uuid4())
        try:
            with self.database.transaction() as connection:
                connection.execute("INSERT INTO categories(id,name,type,parent_id,icon,status) VALUES (?,?,?,?,?,'active')",
                                   (category_id, name.strip(), category_type, parent_id, icon.strip()))
                self._audit(connection, category_id, "create", None, {"name": name.strip(), "type": category_type, "parent_id": parent_id})
        except sqlite3.IntegrityError as error:
            raise ValidationError("Já existe uma categoria com esse nome.") from error
        row = self.database.connection.execute("SELECT * FROM categories WHERE id=?", (category_id,)).fetchone()
        return _category(row)

    def set_status(self, category_id: str, status: str) -> Category:
        if status not in ("active", "archived"):
            raise ValidationError("Status de categoria inválido.")
        with self.database.transaction() as connection:
            row = connection.execute("SELECT * FROM categories WHERE id=?", (category_id,)).fetchone()
            if row is None:
                raise NotFoundError("Categoria não encontrada.")
            connection.execute("UPDATE categories SET status=? WHERE id=?", (status, category_id))
            self._audit(connection, category_id, "archive" if status == "archived" else "restore",
                         {"name": row["name"], "status": row["status"]}, {"name": row["name"], "status": status})
        return _category(self.database.connection.execute("SELECT * FROM categories WHERE id=?", (category_id,)).fetchone())

    @staticmethod
    def _audit(connection, category_id, action, before, after):
        from app.core.dates import utc_timestamp
        connection.execute(
            "INSERT INTO audit_events(id,entity_type,entity_id,action,before_json,after_json,actor,created_at) VALUES (?,?,?,?,?,?,?,?)",
            (str(uuid4()), "category", category_id, action,
             json.dumps(before) if before is not None else None,
             json.dumps(after) if after is not None else None, "local-user", utc_timestamp()),
        )