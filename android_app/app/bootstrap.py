from uuid import uuid4

from app.core.constants import AccountType
from app.database.database import Database

DEFAULT_CATEGORIES = (
    ("Moradia", "expense"), ("Mercado", "expense"), ("Transporte", "expense"),
    ("Alimentação", "expense"), ("Saúde", "expense"), ("Assinaturas", "expense"),
    ("Lazer", "expense"), ("Outros", "expense"), ("Salário", "income"),
    ("Transferência", "transfer"),
)


def initialize_defaults(database: Database) -> None:
    with database.transaction() as connection:
        account_count = connection.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
        if account_count == 0:
            connection.execute(
                "INSERT INTO accounts(id,name,institution,type,opening_balance_cents,is_liquid,priority,status,notes) VALUES (?,?,?,?,0,1,1,'active','')",
                ("account-main", "Conta principal", "", AccountType.CHECKING.value),
            )
        for name, category_type in DEFAULT_CATEGORIES:
            connection.execute(
                "INSERT OR IGNORE INTO categories(id,name,type,parent_id,icon,status) VALUES (?,?,?,NULL,'','active')",
                (f"category-{uuid4()}", name, category_type),
            )