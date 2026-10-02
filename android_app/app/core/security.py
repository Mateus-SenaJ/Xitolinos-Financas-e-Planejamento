import base64
import hashlib
import hmac
import os
import time
from dataclasses import dataclass
from typing import Protocol

from app.core.exceptions import SecurityError, ValidationError

PIN_ITERATIONS = 310_000
PIN_MIN_LENGTH = 6
PIN_MAX_ATTEMPTS = 5
PIN_LOCK_SECONDS = 60


@dataclass(frozen=True, slots=True)
class PinRecord:
    salt: str
    digest: str
    iterations: int = PIN_ITERATIONS
    failed_attempts: int = 0
    locked_until: int = 0


class PinStore(Protocol):
    def read_pin_record(self) -> PinRecord | None: ...

    def write_pin_record(self, record: PinRecord) -> None: ...


class PinSecurityService:
    def __init__(self, store: PinStore, clock=time.time):
        self.store = store
        self.clock = clock

    def configure(self, pin: str) -> None:
        if not pin.isdigit() or len(pin) < PIN_MIN_LENGTH or len(pin) > 12:
            raise ValidationError("O PIN deve conter de 6 a 12 dígitos.")
        salt = os.urandom(16)
        digest = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, PIN_ITERATIONS)
        self.store.write_pin_record(PinRecord(base64.b64encode(salt).decode(), base64.b64encode(digest).decode()))

    def verify(self, pin: str) -> bool:
        record = self.store.read_pin_record()
        if record is None:
            raise SecurityError("Configure um PIN antes de desbloquear o aplicativo.")
        now = int(self.clock())
        if record.locked_until > now:
            raise SecurityError("Muitas tentativas. Aguarde antes de tentar novamente.")
        salt = base64.b64decode(record.salt)
        expected = base64.b64decode(record.digest)
        actual = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, record.iterations)
        if hmac.compare_digest(actual, expected):
            self.store.write_pin_record(PinRecord(record.salt, record.digest, record.iterations))
            return True
        attempts = record.failed_attempts + 1
        locked_until = now + PIN_LOCK_SECONDS if attempts >= PIN_MAX_ATTEMPTS else 0
        self.store.write_pin_record(PinRecord(record.salt, record.digest, record.iterations, attempts, locked_until))
        return False


class BiometricAuthenticator(Protocol):
    def is_available(self) -> bool: ...

    def authenticate(self, reason: str) -> bool: ...


class UnavailableBiometricAuthenticator:
    """Explicit fallback; it never reports a simulated biometric success."""

    def is_available(self) -> bool:
        return False

    def authenticate(self, reason: str) -> bool:
        raise SecurityError("Biometria indisponível nesta compilação. Use o PIN local.")