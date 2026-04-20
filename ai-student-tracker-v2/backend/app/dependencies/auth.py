"""
Authentication dependencies (JWT + RBAC).

This module re-exports the canonical implementations from ``app.core.dependencies``
so existing routes that import ``from app.dependencies.auth import ...`` keep
working after the Firebase → JWT migration.
"""

from app.core.dependencies import (
    get_current_user,
    get_current_user_row,
    require_admin,
    require_any_role,
    require_authenticated,
    require_student,
    require_teacher,
    require_teacher_or_admin,
    security,
)
from app.services.rbac import CurrentUser

__all__ = [
    "CurrentUser",
    "get_current_user",
    "get_current_user_row",
    "require_authenticated",
    "require_any_role",
    "require_admin",
    "require_teacher",
    "require_teacher_or_admin",
    "require_student",
    "security",
]
