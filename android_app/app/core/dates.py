from datetime import date, datetime, timezone

from app.core.exceptions import ValidationError


def parse_civil_date(value: str) -> date:
    try:
        parsed = date.fromisoformat(value)
    except (TypeError, ValueError) as error:
        raise ValidationError("Data inválida. Use AAAA-MM-DD.") from error
    if parsed.isoformat() != value:
        raise ValidationError("Data inválida. Use AAAA-MM-DD.")
    return parsed


def utc_timestamp(value: datetime | None = None) -> str:
    current = value or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return current.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")