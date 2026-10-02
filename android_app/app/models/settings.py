from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class AppSettings:
    currency: str = "BRL"
    minimum_margin_cents: int = 100_000
    forecast_horizon_days: int = 30
    theme: str = "light"
    auto_lock_on_background: bool = True