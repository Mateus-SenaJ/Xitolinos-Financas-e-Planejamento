from app.core.exceptions import ValidationError
from app.repositories.settings import SettingsRepository


class SettingsService:
    ALLOWED_HORIZONS = {7, 30, 90, 180, 365}
    ALLOWED_THEMES = {"light", "dark", "system"}

    def __init__(self, repository: SettingsRepository):
        self.repository = repository

    def get(self) -> dict:
        return self.repository.get_all()

    def set_minimum_margin(self, amount_cents: int) -> None:
        if not isinstance(amount_cents, int) or isinstance(amount_cents, bool) or amount_cents < 0:
            raise ValidationError("A margem mínima deve ser um valor inteiro em centavos, igual ou maior que zero.")
        self.repository.set("minimum_margin_cents", amount_cents)

    def set_forecast_horizon(self, days: int) -> None:
        if days not in self.ALLOWED_HORIZONS:
            raise ValidationError("Horizonte deve ser 7, 30, 90, 180 ou 365 dias.")
        self.repository.set("forecast_horizon_days", days)

    def set_theme(self, theme: str) -> None:
        if theme not in self.ALLOWED_THEMES:
            raise ValidationError("Tema inválido.")
        self.repository.set("theme", theme)