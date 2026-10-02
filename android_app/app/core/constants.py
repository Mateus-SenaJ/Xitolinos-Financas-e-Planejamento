from enum import Enum


class StringEnum(str, Enum):
    pass


class TransactionType(StringEnum):
    EXPENSE = "expense"
    INCOME = "income"
    TRANSFER = "transfer"


class AccountStatus(StringEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class TransactionStatus(StringEnum):
    POSTED = "POSTED"
    CANCELLED = "CANCELLED"
    REFUNDED_PARTIAL = "REFUNDED_PARTIAL"
    REFUNDED = "REFUNDED"


class AccountType(StringEnum):
    CHECKING = "checking"
    DIGITAL = "digital"
    CASH = "cash"
    SAVINGS = "savings"
    INVESTMENT = "investment"
    RESERVE = "reserve"
    OTHER = "other"


DEFAULT_CURRENCY = "BRL"
DEFAULT_FORECAST_HORIZON_DAYS = 30
DEFAULT_MINIMUM_MARGIN_CENTS = 100_000