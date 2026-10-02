class DomainError(Exception):
    """Base class for safe, user-facing domain failures."""


class ValidationError(DomainError):
    pass


class NotFoundError(DomainError):
    pass


class SecurityError(DomainError):
    pass


class StorageError(DomainError):
    pass