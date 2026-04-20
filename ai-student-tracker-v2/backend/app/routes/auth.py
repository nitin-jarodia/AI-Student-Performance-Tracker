# routes/auth.py - JWT authentication endpoints

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.core.rate_limit import limiter
from app.core.security import (
    TOKEN_TYPE_REFRESH,
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
    verify_token,
)
from app.database import get_db
from app.dependencies.auth import CurrentUser, get_current_user, require_admin
from app.models.models import Student, User
from app.services.audit import client_ip_from_request, log_action
from app.services.rbac import ROLE_ADMIN, ROLE_STUDENT, ROLE_TEACHER

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ── Schemas ──────────────────────────────────────────────────────────────────


class RegisterPayload(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=255)
    full_name: str = Field(..., min_length=1, max_length=255)
    role: Optional[str] = ROLE_TEACHER


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class RefreshPayload(BaseModel):
    refresh_token: str = Field(..., min_length=10)


class ChangePasswordPayload(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=255)


class StudentRegisterPayload(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=255)
    full_name: str = Field(..., min_length=1, max_length=255)
    student_id: int = Field(..., gt=0)


class UserPublic(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    student_id: Optional[int] = None
    created_at: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserPublic


# ── Helpers ──────────────────────────────────────────────────────────────────


def _serialize_user(user: User) -> dict:
    """Return the safe public shape for a ``User`` row (never includes password)."""
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": (user.role or ROLE_TEACHER).lower(),
        "is_active": bool(user.is_active),
        "student_id": user.student_id,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def _issue_tokens(db: Session, user: User) -> dict:
    """Generate access + refresh tokens for ``user`` and persist the refresh hash."""
    claims = {
        "sub": str(user.id),
        "email": user.email,
        "role": (user.role or ROLE_TEACHER).lower(),
    }
    access = create_access_token(claims)
    refresh = create_refresh_token(claims)
    user.refresh_token = refresh
    db.commit()
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "user": _serialize_user(user),
    }


def _normalize_role(value: Optional[str], *, allowed: tuple = (ROLE_ADMIN, ROLE_TEACHER, ROLE_STUDENT)) -> str:
    role = (value or ROLE_TEACHER).lower().strip()
    if role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Role must be one of: {', '.join(allowed)}",
        )
    return role


# ── /auth/register ──────────────────────────────────────────────────────────


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=UserPublic)
def register(payload: RegisterPayload, request: Request, db: Session = Depends(get_db)):
    """
    Create an admin / teacher / student user with a bcrypt-hashed password.

    Returns the public user record. Duplicate emails return 400.
    """
    role = _normalize_role(payload.role)

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user = User(
        email=payload.email,
        full_name=payload.full_name.strip(),
        password=hash_password(payload.password),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    log_action(
        user.email,
        role,
        "AUTH_REGISTER",
        target_type="user",
        target_id=user.id,
        detail={"role": role},
        ip_address=client_ip_from_request(request),
    )
    return _serialize_user(user)


# ── /auth/login ─────────────────────────────────────────────────────────────


def _authenticate(db: Session, email: str, password: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")
    return user


@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def login(payload: LoginPayload, request: Request, db: Session = Depends(get_db)):
    """
    JSON login. Returns ``{access_token, refresh_token, token_type, user}``.

    The refresh token is persisted on ``users.refresh_token`` for rotation.
    """
    user = _authenticate(db, payload.email, payload.password)
    tokens = _issue_tokens(db, user)
    log_action(
        user.email,
        (user.role or ROLE_TEACHER).lower(),
        "AUTH_LOGIN",
        target_type="user",
        target_id=user.id,
        ip_address=client_ip_from_request(request),
    )
    return tokens


@router.post("/token", response_model=TokenResponse, include_in_schema=False)
@limiter.limit("10/minute")
def login_oauth2_form(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """OAuth2 password flow (x-www-form-urlencoded) — used by the FastAPI docs button."""
    user = _authenticate(db, form_data.username, form_data.password)
    tokens = _issue_tokens(db, user)
    log_action(
        user.email,
        (user.role or ROLE_TEACHER).lower(),
        "AUTH_LOGIN",
        target_type="user",
        target_id=user.id,
        detail={"flow": "oauth2_form"},
        ip_address=client_ip_from_request(request),
    )
    return tokens


# ── /auth/refresh ───────────────────────────────────────────────────────────


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_REFRESH)
def refresh(payload: RefreshPayload, request: Request, db: Session = Depends(get_db)):
    """
    Rotate tokens. The submitted refresh token must match the one stored on the
    user row (token rotation defence). A fresh refresh token is issued and
    persisted; the old one is invalidated implicitly.
    """
    claims = verify_token(payload.refresh_token, expected_type=TOKEN_TYPE_REFRESH)
    sub = claims.get("sub")
    try:
        user_id = int(sub) if sub is not None else None
    except (TypeError, ValueError):
        user_id = None
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account no longer valid")
    if not user.refresh_token or user.refresh_token != payload.refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
        )
    return _issue_tokens(db, user)


# ── /auth/logout ────────────────────────────────────────────────────────────


@router.post("/logout")
def logout(
    request: Request,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear the stored refresh token for the caller so it can never be rotated again."""
    user = db.query(User).filter(User.id == current.user_id).first()
    if user:
        user.refresh_token = None
        db.commit()
    log_action(
        current.email,
        current.role,
        "AUTH_LOGOUT",
        target_type="user",
        target_id=current.user_id,
        ip_address=client_ip_from_request(request),
    )
    return {"message": "Logged out successfully"}


# ── /auth/me ────────────────────────────────────────────────────────────────


@router.get("/me")
def auth_me(
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the profile for the caller's access token."""
    row = db.query(User).filter(User.id == current.user_id).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return _serialize_user(row)


# ── /auth/change-password ───────────────────────────────────────────────────


@router.put("/change-password")
def change_password(
    payload: ChangePasswordPayload,
    request: Request,
    current: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rotate the caller's password. Invalidates the stored refresh token."""
    user = db.query(User).filter(User.id == current.user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not verify_password(payload.current_password, user.password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    user.password = hash_password(payload.new_password)
    user.refresh_token = None  # force re-login on other devices
    db.commit()

    log_action(
        current.email,
        current.role,
        "AUTH_CHANGE_PASSWORD",
        target_type="user",
        target_id=user.id,
        ip_address=client_ip_from_request(request),
    )
    return {"message": "Password changed successfully"}


# ── /auth/register-student (admin) ──────────────────────────────────────────


@router.post("/register-student", status_code=status.HTTP_201_CREATED)
def register_student(
    payload: StudentRegisterPayload,
    request: Request,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_admin),
):
    """Admin-only: provision a student login linked to an existing students row."""
    student = db.query(Student).filter(Student.id == payload.student_id).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student record not found")

    if db.query(User).filter(User.student_id == payload.student_id).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This student already has a login account",
        )

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing and existing.student_id not in (None, payload.student_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already in use by another account",
        )

    hashed = hash_password(payload.password)
    if existing:
        existing.full_name = payload.full_name.strip()
        existing.password = hashed
        existing.role = ROLE_STUDENT
        existing.student_id = payload.student_id
        existing.is_active = True
        user = existing
    else:
        user = User(
            email=payload.email,
            full_name=payload.full_name.strip(),
            password=hashed,
            role=ROLE_STUDENT,
            student_id=payload.student_id,
            is_active=True,
        )
        db.add(user)
    db.commit()
    db.refresh(user)

    log_action(
        payload.email,
        ROLE_STUDENT,
        "STUDENT_REGISTER",
        target_type="user",
        target_id=user.id,
        detail={"student_id": payload.student_id},
        ip_address=client_ip_from_request(request),
    )
    return _serialize_user(user)


# ── /auth/users (admin) ─────────────────────────────────────────────────────


@router.get("/users")
def list_users(
    role: Optional[str] = None,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_admin),
):
    """Admin-only: list users, optionally filtered by ``?role=teacher``."""
    q = db.query(User)
    if role:
        q = q.filter(User.role == role.lower().strip())
    users = q.order_by(User.id.asc()).all()
    return {"users": [_serialize_user(u) for u in users]}


@router.put("/users/{user_id}/deactivate")
def deactivate_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: CurrentUser = Depends(require_admin),
):
    """Admin-only: disable a user and revoke their refresh token."""
    if user_id == admin.user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot deactivate your own account")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_active = False
    user.refresh_token = None
    db.commit()

    log_action(
        admin.email,
        admin.role,
        "USER_DEACTIVATE",
        target_type="user",
        target_id=user.id,
        ip_address=client_ip_from_request(request),
    )
    return {"message": "User deactivated", "id": user.id}


@router.put("/users/{user_id}/activate")
def activate_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: CurrentUser = Depends(require_admin),
):
    """Admin-only: re-enable a previously deactivated user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_active = True
    db.commit()

    log_action(
        admin.email,
        admin.role,
        "USER_ACTIVATE",
        target_type="user",
        target_id=user.id,
        ip_address=client_ip_from_request(request),
    )
    return {"message": "User activated", "id": user.id}
