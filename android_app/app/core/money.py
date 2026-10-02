import re

from app.core.constants import DEFAULT_CURRENCY
from app.core.exceptions import ValidationError

_AMOUNT_PATTERN = re.compile(r"^(\d+)(?:[.,](\d{1,2}))?$")


def parse_cents(value: str) -> int:
    normalized = value.strip().replace("R$", "").replace(" ", "")
    match = _AMOUNT_PATTERN.fullmatch(normalized)
    if not match:
        raise ValidationError("Informe um valor positivo com até duas casas decimais.")
    cents = int(match.group(1)) * 100 + int((match.group(2) or "").ljust(2, "0"))
    if cents <= 0:
        raise ValidationError("O valor deve ser maior que zero.")
    return cents


def format_cents(amount_cents: int, currency: str = DEFAULT_CURRENCY) -> str:
    if not isinstance(amount_cents, int) or isinstance(amount_cents, bool):
        raise TypeError("O valor monetário deve ser inteiro em centavos.")
    sign = "-" if amount_cents < 0 else ""
    whole, fraction = divmod(abs(amount_cents), 100)
    grouped = f"{whole:,}".replace(",", ".")
    symbol = "R$" if currency == "BRL" else currency
    return f"{sign}{symbol} {grouped},{fraction:02d}"