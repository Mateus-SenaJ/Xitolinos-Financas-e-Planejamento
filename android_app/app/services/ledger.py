from collections import defaultdict
from datetime import date

from app.core.constants import TransactionType
from app.core.exceptions import ValidationError
from app.models.entities import AccountBalance, Explanation, ExplanationRecord, LedgerSummary
from app.repositories.accounts import AccountRepository
from app.repositories.transactions import TransactionRepository


class LedgerService:
    def __init__(self, accounts: AccountRepository, transactions: TransactionRepository):
        self.accounts = accounts
        self.transactions = transactions

    def summarize(self, month: str, *, through: date | None = None) -> LedgerSummary:
        try:
            year, month_number = (int(part) for part in month.split("-", maxsplit=1))
            start = date(year, month_number, 1)
        except (ValueError, TypeError) as error:
            raise ValidationError("Período inválido. Use AAAA-MM.") from error
        if not 1 <= month_number <= 12:
            raise ValidationError("Período inválido. Use AAAA-MM.")
        if month_number == 12:
            next_month = date(year + 1, 1, 1)
        else:
            next_month = date(year, month_number + 1, 1)
        month_end = date.fromordinal(next_month.toordinal() - 1)
        end = min(month_end, through) if through and through.year == year and through.month == month_number else month_end
        transactions = self.transactions.list_active(end=end.isoformat())
        accounts = self.accounts.list_all()
        income = [item for item in transactions if item.type == TransactionType.INCOME and start <= item.date <= end]
        expenses = [item for item in transactions if item.type == TransactionType.EXPENSE and start <= item.date <= end]
        income_cents = sum(item.amount_cents for item in income)
        expense_cents = sum(item.amount_cents for item in expenses)

        balances: list[AccountBalance] = []
        for account in accounts:
            balance = account.opening_balance_cents
            for item in transactions:
                if item.account_id == account.id:
                    if item.type == TransactionType.INCOME:
                        balance += item.amount_cents
                    elif item.type in (TransactionType.EXPENSE, TransactionType.TRANSFER):
                        balance -= item.amount_cents
                if item.type == TransactionType.TRANSFER and item.counterparty_account_id == account.id:
                    balance += item.amount_cents
            balances.append(AccountBalance(account, balance))

        liquid_balance = sum(item.balance_cents for item in balances if item.account.is_liquid)
        return LedgerSummary(
            month=month,
            income_cents=income_cents,
            expense_cents=expense_cents,
            net_balance_cents=liquid_balance,
            accounts=tuple(balances),
            income_explanation=self._explanation("Entradas no período", income_cents, income, 1),
            expense_explanation=self._explanation("Saídas no período", expense_cents, expenses, -1),
            balance_explanation=self._balance_explanation(liquid_balance, balances, transactions),
        )

    @staticmethod
    def _explanation(label: str, value: int, records, direction: int) -> Explanation:
        items = tuple(ExplanationRecord(record.id, record.description, record.date,
                                        record.amount_cents, record.amount_cents * direction)
                      for record in records)
        return Explanation(label, value, "transactions", items)

    @staticmethod
    def _balance_explanation(value: int, balances, transactions) -> Explanation:
        liquid_ids = {entry.account.id for entry in balances if entry.account.is_liquid}
        records: list[ExplanationRecord] = []
        for entry in balances:
            if entry.account.is_liquid and entry.account.opening_balance_cents:
                records.append(ExplanationRecord(entry.account.id, f"Saldo inicial · {entry.account.name}",
                                                 date.min, entry.account.opening_balance_cents,
                                                 entry.account.opening_balance_cents))
        for item in transactions:
            effect = 0
            if item.account_id in liquid_ids:
                if item.type == TransactionType.INCOME:
                    effect += item.amount_cents
                elif item.type in (TransactionType.EXPENSE, TransactionType.TRANSFER):
                    effect -= item.amount_cents
            if item.type == TransactionType.TRANSFER and item.counterparty_account_id in liquid_ids:
                effect += item.amount_cents
            if effect:
                records.append(ExplanationRecord(item.id, item.description, item.date, item.amount_cents, effect))
        return Explanation("Saldo das contas líquidas", value, "accounts_and_transactions", tuple(records))