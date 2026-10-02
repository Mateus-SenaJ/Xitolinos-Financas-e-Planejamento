from dataclasses import dataclass
from datetime import date

from app.core.constants import AccountStatus, AccountType, TransactionStatus, TransactionType


@dataclass(frozen=True, slots=True)
class Account:
    id: str
    name: str
    institution: str
    type: AccountType
    opening_balance_cents: int
    is_liquid: bool
    priority: int
    status: AccountStatus
    notes: str = ""


@dataclass(frozen=True, slots=True)
class Category:
    id: str
    name: str
    type: str
    parent_id: str | None = None
    icon: str = ""
    status: str = "active"


@dataclass(frozen=True, slots=True)
class Transaction:
    id: str
    description: str
    original_description: str
    category: str
    date: date
    type: TransactionType
    amount_cents: int
    account_id: str
    counterparty_account_id: str | None = None
    subcategory_id: str | None = None
    establishment_id: str | None = None
    status: TransactionStatus = TransactionStatus.POSTED


@dataclass(frozen=True, slots=True)
class ExplanationRecord:
    id: str
    description: str
    date: date
    amount_cents: int
    effect_cents: int


@dataclass(frozen=True, slots=True)
class Explanation:
    label: str
    value_cents: int
    source: str
    records: tuple[ExplanationRecord, ...]


@dataclass(frozen=True, slots=True)
class AccountBalance:
    account: Account
    balance_cents: int


@dataclass(frozen=True, slots=True)
class LedgerSummary:
    month: str
    income_cents: int
    expense_cents: int
    net_balance_cents: int
    accounts: tuple[AccountBalance, ...]
    income_explanation: Explanation
    expense_explanation: Explanation
    balance_explanation: Explanation