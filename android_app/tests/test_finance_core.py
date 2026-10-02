import tempfile
import unittest
from datetime import date
from pathlib import Path

from app.bootstrap import initialize_defaults
from app.core.constants import AccountType, TransactionType
from app.core.exceptions import SecurityError, ValidationError
from app.core.money import format_cents, parse_cents
from app.database.database import Database
from app.repositories.accounts import AccountRepository
from app.repositories.categories import CategoryRepository
from app.repositories.security import AuditRepository, SecurityRepository
from app.repositories.transactions import TransactionRepository
from app.services.ledger import LedgerService
from app.services.transactions import TransactionService
from app.core.security import PinSecurityService


class FinanceCoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = Database(Path(self.temp.name) / "finance.sqlite")
        initialize_defaults(self.database)
        self.accounts = AccountRepository(self.database)
        self.categories = CategoryRepository(self.database)
        self.transactions = TransactionRepository(self.database)
        self.service = TransactionService(self.accounts, self.categories, self.transactions)
        self.ledger = LedgerService(self.accounts, self.transactions)

    def tearDown(self):
        self.database.close()
        self.temp.cleanup()

    def test_money_uses_integer_cents_and_formats_pt_br(self):
        self.assertEqual(parse_cents("1.234,56"), 123456)
        self.assertEqual(parse_cents("10,29"), 1029)
        self.assertEqual(format_cents(123456), "R$ 1.234,56")
        with self.assertRaises(ValidationError):
            parse_cents("10,999")

    def test_transfer_changes_account_balances_without_becoming_income_or_expense(self):
        destination = self.accounts.create(name="Poupança", account_type=AccountType.SAVINGS, opening_balance_cents=5000)
        self.service.create(description="Salário", amount_cents=10000, transaction_date="2026-10-01",
                            transaction_type=TransactionType.INCOME, account_id="account-main", category_name="Salário")
        self.service.create(description="Guardar", amount_cents=3000, transaction_date="2026-10-01",
                            transaction_type=TransactionType.TRANSFER, account_id="account-main",
                            category_name="Transferência", counterparty_account_id=destination.id)
        self.service.create(description="Almoço", amount_cents=1000, transaction_date="2026-10-01",
                            transaction_type=TransactionType.EXPENSE, account_id="account-main", category_name="Alimentação")
        summary = self.ledger.summarize("2026-10", through=date(2026, 10, 1))
        self.assertEqual(summary.income_cents, 10000)
        self.assertEqual(summary.expense_cents, 1000)
        self.assertEqual(summary.net_balance_cents, 14000)
        balances = {item.account.name: item.balance_cents for item in summary.accounts}
        self.assertEqual(balances["Conta principal"], 6000)
        self.assertEqual(balances["Poupança"], 8000)

    def test_transfer_is_soft_deleted_and_restored_with_audit(self):
        destination = self.accounts.create(name="Conta destino", account_type=AccountType.CHECKING)
        transfer = self.service.create(description="Entre contas", amount_cents=1250, transaction_date="2026-10-01",
                                       transaction_type=TransactionType.TRANSFER, account_id="account-main",
                                       category_name="Transferência", counterparty_account_id=destination.id)
        self.transactions.soft_delete(transfer.id)
        self.assertEqual(self.transactions.list_active(), [])
        self.transactions.restore(transfer.id)
        self.assertEqual(len(self.transactions.list_active()), 1)
        events = AuditRepository(self.database).recent()
        self.assertEqual([event["action"] for event in events[:3]], ["restore", "soft_delete", "create"])

    def test_pin_is_hashed_persisted_and_rate_limited(self):
        security = PinSecurityService(SecurityRepository(self.database), clock=lambda: 1000)
        security.configure("123456")
        record = SecurityRepository(self.database).read_pin_record()
        self.assertNotEqual(record.digest, "123456")
        self.assertTrue(security.verify("123456"))
        for _ in range(5):
            self.assertFalse(security.verify("000000"))
        with self.assertRaises(SecurityError):
            security.verify("123456")

    def test_database_schema_is_versioned_and_node_compatible(self):
        tables = {row[0] for row in self.database.connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue({"accounts", "categories", "transactions", "audit_events", "schema_migrations"}.issubset(tables))
        version = self.database.connection.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0]
        self.assertEqual(version, 4)


if __name__ == "__main__":
    unittest.main()