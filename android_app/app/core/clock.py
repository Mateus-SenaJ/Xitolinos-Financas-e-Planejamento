from datetime import date, datetime, timezone
from typing import Protocol


class Clock(Protocol):
    def today(self) -> date: ...

    def now(self) -> datetime: ...


class SystemClock:
    def today(self) -> date:
        return date.today()

    def now(self) -> datetime:
        return datetime.now(timezone.utc)