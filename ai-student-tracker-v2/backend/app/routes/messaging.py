"""
In-app messaging between students and teachers, with optional email mirroring.

Key concepts:
- A ``Conversation`` always has one ``teacher_id`` and at most one ``student_id``
  (so students never DM other students; teachers/admins may write to any student).
- ``Message`` rows are strictly ordered by ``sent_at``. Polling the thread endpoint
  is enough for near-real-time UX on the frontend.
- Posting a message also drops an in-app notification for the counterpart user.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import CurrentUser, require_authenticated
from app.models.models import Conversation, Message, Student, User
from app.services.notification_service import (
    create_in_app_notification,
    send_email_async,
)
from app.services.rbac import ROLE_ADMIN, ROLE_STUDENT, ROLE_TEACHER

router = APIRouter(prefix="/messaging", tags=["Messaging"])


# ---------- schemas ----------------------------------------------------------


class ConversationCreate(BaseModel):
    subject_line: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1, max_length=5000)
    # Exactly one of (teacher_id, student_id) must be supplied by the caller,
    # corresponding to the counterpart they want to contact.
    teacher_id: Optional[int] = None
    student_id: Optional[int] = None
    send_email: bool = False


class MessagePost(BaseModel):
    message_body: str = Field(..., min_length=1, max_length=5000)
    message_type: str = Field("in_app", pattern="^(in_app|email)$")


# ---------- helpers ----------------------------------------------------------


def _serialize_conversation(conv: Conversation, teacher: Optional[User], student: Optional[Student]) -> dict:
    return {
        "id": conv.id,
        "subject_line": conv.subject_line,
        "student_id": conv.student_id,
        "student_name": student.name if student else None,
        "teacher_id": conv.teacher_id,
        "teacher_name": teacher.full_name if teacher else None,
        "teacher_email": teacher.email if teacher else None,
        "status": conv.status,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "last_message_at": conv.last_message_at.isoformat() if conv.last_message_at else None,
    }


def _serialize_message(msg: Message) -> dict:
    return {
        "id": msg.id,
        "conversation_id": msg.conversation_id,
        "sender_id": msg.sender_id,
        "sender_role": msg.sender_role,
        "message_body": msg.message_body,
        "message_type": msg.message_type,
        "is_read": bool(msg.is_read),
        "sent_at": msg.sent_at.isoformat() if msg.sent_at else None,
    }


def _user_can_access_conversation(current: CurrentUser, conv: Conversation) -> bool:
    if current.role == ROLE_ADMIN:
        return True
    if current.role == ROLE_TEACHER:
        return conv.teacher_id == current.user_id
    if current.role == ROLE_STUDENT:
        return (
            current.student_id is not None
            and conv.student_id == current.student_id
        )
    return False


def _conversation_counterpart_user_id(conv: Conversation, current: CurrentUser, db: Session) -> Optional[int]:
    """Return the user id of the other participant for notification delivery."""
    if current.role in (ROLE_ADMIN, ROLE_TEACHER):
        if conv.student_id:
            student_user = (
                db.query(User)
                .filter(User.student_id == conv.student_id, User.role == ROLE_STUDENT)
                .first()
            )
            return student_user.id if student_user else None
        return None
    # Student -> respond to teacher.
    return conv.teacher_id


# ---------- routes -----------------------------------------------------------


@router.get("/conversations")
def list_conversations(
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    q = db.query(Conversation)
    if current.role == ROLE_TEACHER:
        q = q.filter(Conversation.teacher_id == current.user_id)
    elif current.role == ROLE_STUDENT:
        if current.student_id is None:
            return {"conversations": [], "total": 0}
        q = q.filter(Conversation.student_id == current.student_id)
    elif current.role != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Access denied")

    rows = q.order_by(func.coalesce(Conversation.last_message_at, Conversation.created_at).desc()).all()

    teachers = {u.id: u for u in db.query(User).filter(User.id.in_([c.teacher_id for c in rows])).all()}
    students = {
        s.id: s
        for s in db.query(Student).filter(Student.id.in_([c.student_id for c in rows if c.student_id])).all()
    }

    # Unread counts per conversation for the current user.
    unread_counts: dict[int, int] = {}
    if rows:
        unread_rows = (
            db.query(Message.conversation_id, func.count(Message.id))
            .filter(
                Message.conversation_id.in_([c.id for c in rows]),
                Message.is_read.is_(False),
                Message.sender_id != current.user_id,
            )
            .group_by(Message.conversation_id)
            .all()
        )
        unread_counts = {cid: cnt for cid, cnt in unread_rows}

    result = []
    for c in rows:
        data = _serialize_conversation(c, teachers.get(c.teacher_id), students.get(c.student_id))
        data["unread_count"] = int(unread_counts.get(c.id, 0))
        result.append(data)
    return {"conversations": result, "total": len(result)}


@router.post("/conversations", status_code=status.HTTP_201_CREATED)
def create_conversation(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    if not current.user_id:
        raise HTTPException(status_code=401, detail="Login required")

    teacher_id: Optional[int] = None
    student_id: Optional[int] = None

    if current.role == ROLE_STUDENT:
        if current.student_id is None:
            raise HTTPException(status_code=403, detail="Student account is not linked to a roster entry")
        if not payload.teacher_id:
            raise HTTPException(status_code=400, detail="Students must specify a teacher_id to contact")
        teacher_id = payload.teacher_id
        student_id = current.student_id
    elif current.role in (ROLE_ADMIN, ROLE_TEACHER):
        if not payload.student_id:
            raise HTTPException(status_code=400, detail="Teachers must specify a student_id to contact")
        student_id = payload.student_id
        teacher_id = current.user_id if current.role == ROLE_TEACHER else (payload.teacher_id or current.user_id)
    else:
        raise HTTPException(status_code=403, detail="Access denied")

    teacher = db.query(User).filter(User.id == teacher_id).first()
    if not teacher or (teacher.role or "").lower() not in (ROLE_TEACHER, ROLE_ADMIN):
        raise HTTPException(status_code=404, detail="Target teacher not found")

    student = db.query(Student).filter(Student.id == student_id).first() if student_id else None
    if student_id and not student:
        raise HTTPException(status_code=404, detail="Target student not found")

    now = datetime.utcnow()
    conv = Conversation(
        student_id=student_id,
        teacher_id=teacher_id,
        started_by_user_id=current.user_id,
        subject_line=payload.subject_line.strip(),
        last_message_at=now,
        status="open",
    )
    db.add(conv)
    db.flush()

    msg = Message(
        conversation_id=conv.id,
        sender_id=current.user_id,
        sender_role=current.role,
        message_body=payload.body.strip(),
        message_type="email" if payload.send_email else "in_app",
    )
    db.add(msg)
    db.commit()
    db.refresh(conv)
    db.refresh(msg)

    counterpart_id = _conversation_counterpart_user_id(conv, current, db)
    if counterpart_id:
        create_in_app_notification(
            db,
            user_id=counterpart_id,
            title=f"New message: {conv.subject_line}",
            message=(payload.body[:300] + ("…" if len(payload.body) > 300 else "")),
            notif_type="info",
            link=f"/messages/{conv.id}",
        )

    if payload.send_email:
        target_email = None
        if current.role == ROLE_STUDENT:
            target_email = teacher.email
        elif student and student.parent_email:
            target_email = student.parent_email
        if target_email:
            send_email_async(
                to_email=target_email,
                subject=f"[Message] {conv.subject_line}",
                body=f"{current.full_name or current.email} wrote:\n\n{payload.body}",
            )

    return {
        "conversation": _serialize_conversation(conv, teacher, student),
        "message": _serialize_message(msg),
    }


@router.get("/conversations/{conversation_id}")
def get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not _user_can_access_conversation(current, conv):
        raise HTTPException(status_code=403, detail="Access denied")

    teacher = db.query(User).filter(User.id == conv.teacher_id).first()
    student = db.query(Student).filter(Student.id == conv.student_id).first() if conv.student_id else None
    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conv.id)
        .order_by(Message.sent_at.asc())
        .all()
    )

    # Mark inbound messages as read for the viewer.
    unread_ids = [m.id for m in messages if (not m.is_read) and m.sender_id != current.user_id]
    if unread_ids:
        db.query(Message).filter(Message.id.in_(unread_ids)).update(
            {Message.is_read: True}, synchronize_session=False
        )
        db.commit()

    return {
        "conversation": _serialize_conversation(conv, teacher, student),
        "messages": [_serialize_message(m) for m in messages],
    }


@router.post("/conversations/{conversation_id}/messages", status_code=status.HTTP_201_CREATED)
def post_message(
    conversation_id: int,
    payload: MessagePost,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not _user_can_access_conversation(current, conv):
        raise HTTPException(status_code=403, detail="Access denied")
    if conv.status != "open":
        raise HTTPException(status_code=409, detail="Conversation is not open")

    msg = Message(
        conversation_id=conv.id,
        sender_id=current.user_id,
        sender_role=current.role,
        message_body=payload.message_body.strip(),
        message_type=payload.message_type,
    )
    conv.last_message_at = datetime.utcnow()
    db.add(msg)
    db.commit()
    db.refresh(msg)

    counterpart_id = _conversation_counterpart_user_id(conv, current, db)
    if counterpart_id:
        create_in_app_notification(
            db,
            user_id=counterpart_id,
            title=f"Reply: {conv.subject_line}",
            message=(payload.message_body[:300] + ("…" if len(payload.message_body) > 300 else "")),
            notif_type="info",
            link=f"/messages/{conv.id}",
        )

    if payload.message_type == "email":
        target_email: Optional[str] = None
        if current.role == ROLE_STUDENT:
            teacher = db.query(User).filter(User.id == conv.teacher_id).first()
            target_email = teacher.email if teacher else None
        else:
            if conv.student_id:
                student = db.query(Student).filter(Student.id == conv.student_id).first()
                target_email = student.parent_email if student else None
        if target_email:
            send_email_async(
                to_email=target_email,
                subject=f"[Message] {conv.subject_line}",
                body=f"{current.full_name or current.email} wrote:\n\n{payload.message_body}",
            )

    return _serialize_message(msg)


@router.post("/conversations/{conversation_id}/close")
def close_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not _user_can_access_conversation(current, conv):
        raise HTTPException(status_code=403, detail="Access denied")
    if current.role == ROLE_STUDENT:
        raise HTTPException(status_code=403, detail="Only teachers or admins can close conversations")

    conv.status = "closed"
    db.commit()
    return {"ok": True, "id": conv.id, "status": conv.status}


@router.get("/contacts")
def list_contacts(
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_authenticated),
):
    """Return the set of people the caller can start a conversation with."""
    if current.role == ROLE_STUDENT:
        rows = (
            db.query(User)
            .filter(User.role.in_([ROLE_TEACHER, ROLE_ADMIN]), User.is_active.is_(True))
            .order_by(User.full_name.asc())
            .all()
        )
        return {
            "contacts": [
                {"id": u.id, "full_name": u.full_name, "email": u.email, "role": u.role}
                for u in rows
            ]
        }

    if current.role in (ROLE_ADMIN, ROLE_TEACHER):
        rows = db.query(Student).order_by(Student.name.asc()).all()
        return {
            "contacts": [
                {
                    "id": s.id,
                    "full_name": s.name,
                    "roll_number": s.roll_number,
                    "class_name": s.class_name,
                    "section": s.section,
                    "parent_email": s.parent_email,
                }
                for s in rows
            ]
        }

    raise HTTPException(status_code=403, detail="Access denied")
