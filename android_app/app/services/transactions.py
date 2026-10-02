from datetime import date

from app.core.constants import AccountStatus, TransactionType
from app.core.dates import parse_civil_date
from app.core.exceptions import ValidationError
from app.repositories.accounts import AccountRepository
from app.repositories.categories import CategoryRepository
from app.repositories.transactions import TransactionRepository


class TransactionService:
	def __init__(self, accounts: AccountRepository, categories: CategoryRepository,
				 transactions: TransactionRepository):
		self.accounts = accounts
		self.categories = categories
		self.transactions = transactions

	def create(self, *, description: str, amount_cents: int, transaction_date: str,
			   transaction_type: TransactionType, account_id: str, category_name: str,
			   counterparty_account_id: str | None = None, subcategory_id: str | None = None,
			   establishment_id: str | None = None) -> object:
		text = description.strip()
		if not text or len(text) > 120:
			raise ValidationError("Informe uma descrição com até 120 caracteres.")
		if not isinstance(amount_cents, int) or isinstance(amount_cents, bool) or amount_cents <= 0:
			raise ValidationError("O valor deve ser um inteiro positivo em centavos.")
		civil_date = parse_civil_date(transaction_date)
		source = self.accounts.get(account_id)
		if source.status != AccountStatus.ACTIVE:
			raise ValidationError("A conta de origem está arquivada.")

		if transaction_type == TransactionType.TRANSFER:
			if not counterparty_account_id or counterparty_account_id == account_id:
				raise ValidationError("Selecione duas contas diferentes para a transferência.")
			destination = self.accounts.get(counterparty_account_id)
			if destination.status != AccountStatus.ACTIVE:
				raise ValidationError("A conta de destino está arquivada.")
			category_name = "Transferência"
			subcategory_id = None
		else:
			if counterparty_account_id:
				raise ValidationError("Conta contraparte só pode ser informada em uma transferência.")
			category = next((item for item in self.categories.list_all()
							 if item.name == category_name and item.status == "active"), None)
			if category is None or category.type != transaction_type.value:
				raise ValidationError("Selecione uma categoria ativa compatível com o tipo de lançamento.")
			if subcategory_id:
				subcategory = next((item for item in self.categories.list_all()
									if item.id == subcategory_id and item.parent_id == category.id
									and item.status == "active"), None)
				if subcategory is None:
					raise ValidationError("A subcategoria não pertence à categoria escolhida.")

		return self.transactions.create(
			description=text,
			category=category_name,
			transaction_date=civil_date,
			transaction_type=transaction_type,
			amount_cents=amount_cents,
			account_id=account_id,
			counterparty_account_id=counterparty_account_id,
			subcategory_id=subcategory_id,
			establishment_id=establishment_id,
		)
