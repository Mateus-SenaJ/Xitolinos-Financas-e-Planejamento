from dataclasses import dataclass

from app.database.database import Database
from app.repositories.accounts import AccountRepository
from app.repositories.categories import CategoryRepository
from app.repositories.security import AuditRepository, SecurityRepository
from app.repositories.settings import SettingsRepository
from app.repositories.transactions import TransactionRepository
from app.services.ledger import LedgerService
from app.services.transactions import TransactionService
from app.core.security import PinSecurityService
from app.services.settings import SettingsService


@dataclass(slots=True)
class Services:
    database: Database
    accounts: AccountRepository
    categories: CategoryRepository
    transactions: TransactionRepository
    transaction_service: TransactionService
    ledger: LedgerService
    security: PinSecurityService
    audit: AuditRepository
    settings: SettingsService


def build_services(database_path: str) -> Services:
    database = Database(database_path)
    accounts = AccountRepository(database)
    categories = CategoryRepository(database)
    transactions = TransactionRepository(database)
    security_repository = SecurityRepository(database)
    return Services(database, accounts, categories, transactions,
                    TransactionService(accounts, categories, transactions),
                    LedgerService(accounts, transactions),
                    PinSecurityService(security_repository), AuditRepository(database),
                    SettingsService(SettingsRepository(database)))