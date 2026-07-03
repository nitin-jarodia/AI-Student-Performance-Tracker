# models/models.py - SQLAlchemy Database Models for PostgreSQL

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Numeric,
    Boolean,
    Date,
    Text,
    ForeignKey,
    TIMESTAMP,
    UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id         = Column(Integer, primary_key=True, index=True)
    email      = Column(String(255), unique=True, nullable=False)
    full_name  = Column(String(255), nullable=False)
    password   = Column(String(255), nullable=False)
    role       = Column(String(50), nullable=False, default="teacher")
    is_active  = Column(Boolean, default=True)
    # When role == "student" this links back to the students row owned by the account.
    student_id = Column(Integer, ForeignKey("students.id", ondelete="SET NULL"), nullable=True, index=True)
    # Latest issued refresh token (rotated on every /auth/refresh). Cleared on logout.
    refresh_token = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())

    student = relationship("Student", foreign_keys=[student_id], backref="user_account")

class Student(Base):
    __tablename__ = "students"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String(255), nullable=False)
    email        = Column(String(255), unique=True)
    roll_number  = Column(String(50), unique=True, nullable=False)
    class_name   = Column(String(50), nullable=False)
    section      = Column(String(10), nullable=False)
    parent_name  = Column(String(255))
    parent_phone = Column(String(20))
    parent_email = Column(String(255))
    address      = Column(Text)
    learning_style = Column(String(120), nullable=True)
    created_at   = Column(TIMESTAMP, server_default=func.now())

    # Relationships
    performance = relationship("Performance", back_populates="student", cascade="all, delete")
    attendance  = relationship("Attendance",  back_populates="student", cascade="all, delete")
    predictions = relationship("Prediction",  back_populates="student", cascade="all, delete")

class Subject(Base):
    __tablename__ = "subjects"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(255), nullable=False)
    code        = Column(String(50), unique=True, nullable=False)
    class_name  = Column(String(50), nullable=False)
    teacher_id  = Column(Integer, ForeignKey("users.id"))
    description = Column(String(500))
    is_active   = Column(Boolean, nullable=False, default=True)
    created_at  = Column(TIMESTAMP, server_default=func.now())

    performance = relationship("Performance", back_populates="subject")


class TeacherSubjectAssignment(Base):
    __tablename__ = "teacher_subject_assignments"
    __table_args__ = (
        UniqueConstraint(
            "teacher_id",
            "subject_id",
            "class_name",
            "section",
            name="uq_teacher_subject_class_section",
        ),
    )

    id          = Column(Integer, primary_key=True, index=True)
    teacher_id  = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id  = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    class_name  = Column(String(50))
    section     = Column(String(10))
    assigned_at = Column(TIMESTAMP, server_default=func.now())

    teacher = relationship("User", foreign_keys=[teacher_id])
    subject = relationship("Subject")

class Performance(Base):
    __tablename__ = "performance"

    id         = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    score      = Column(Float, nullable=False)
    max_score  = Column(Float, nullable=False)
    exam_type  = Column(String(100), nullable=False)
    exam_date  = Column(Date, nullable=False)
    remarks    = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())

    student = relationship("Student", back_populates="performance")
    subject = relationship("Subject", back_populates="performance")

class Attendance(Base):
    __tablename__ = "attendance"

    id         = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    date       = Column(Date, nullable=False)
    status     = Column(String(20), nullable=False)  # present/absent/late
    remarks    = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())

    student = relationship("Student", back_populates="attendance")

class Prediction(Base):
    __tablename__ = "predictions"

    id             = Column(Integer, primary_key=True, index=True)
    student_id     = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    risk_level     = Column(String(20), nullable=False)   # LOW/MEDIUM/HIGH
    risk_score     = Column(Float, nullable=False)
    recommendation = Column(Text)
    predicted_at   = Column(TIMESTAMP, server_default=func.now())

    student = relationship("Student", back_populates="predictions")


class PortalToken(Base):
    """Time-limited token for parent/student read-only portal access."""

    __tablename__ = "portal_tokens"

    id         = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    token      = Column(String(64), unique=True, nullable=False, index=True)
    role       = Column(String(20), nullable=False, default="parent")
    expires_at = Column(TIMESTAMP, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())

    student = relationship("Student", backref="portal_tokens")


class AuditLog(Base):
    """Immutable audit trail for mutating operations."""

    __tablename__ = "audit_logs"

    id          = Column(Integer, primary_key=True, index=True)
    actor_email = Column(String(255), nullable=False)
    actor_role  = Column(String(50), nullable=False)
    action      = Column(String(100), nullable=False)
    target_type = Column(String(50), nullable=True)
    target_id   = Column(Integer, nullable=True)
    detail      = Column(JSONB, nullable=True)
    ip_address  = Column(String(45), nullable=True)
    created_at  = Column(TIMESTAMP, server_default=func.now())


class CheatingFlag(Base):
    __tablename__ = "cheating_flags"

    id               = Column(Integer, primary_key=True, index=True)
    student_id_1     = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    student_id_2     = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=True)
    exam_type        = Column(String(100), nullable=False)
    exam_date        = Column(Date, nullable=False)
    similarity_score = Column(Float, nullable=True)
    flag_reason      = Column(Text, nullable=False)
    status           = Column(String(20), nullable=False, default="pending")
    created_at       = Column(TIMESTAMP, server_default=func.now())


class ScholarshipScheme(Base):
    __tablename__ = "scholarship_schemes"

    id                     = Column(Integer, primary_key=True, index=True)
    name                   = Column(String(255), nullable=False)
    description            = Column(Text)
    min_attendance         = Column(Float, nullable=False)
    min_avg_score          = Column(Float, nullable=False)
    max_failed_subjects    = Column(Integer, nullable=False, default=0)
    min_consecutive_months = Column(Integer, nullable=False, default=1)
    is_active              = Column(Boolean, default=True)
    created_by             = Column(Integer, ForeignKey("users.id"))
    created_at             = Column(TIMESTAMP, server_default=func.now())


class ScholarshipEligibility(Base):
    __tablename__ = "scholarship_eligibility"
    __table_args__ = (
        UniqueConstraint("student_id", "scheme_id", name="uq_scholarship_eligibility_student_scheme"),
    )

    id             = Column(Integer, primary_key=True, index=True)
    student_id     = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    scheme_id      = Column(Integer, ForeignKey("scholarship_schemes.id", ondelete="CASCADE"), nullable=False)
    is_eligible    = Column(Boolean, nullable=False)
    attendance_pct = Column(Float)
    avg_score      = Column(Float)
    evaluated_at   = Column(TIMESTAMP, server_default=func.now())
    notes          = Column(Text)


class ReportTemplate(Base):
    __tablename__ = "report_templates"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(255), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"))
    blocks     = Column(JSONB, nullable=False)
    filters    = Column(JSONB)
    created_at = Column(TIMESTAMP, server_default=func.now())


class QrSession(Base):
    __tablename__ = "qr_sessions"

    id         = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    class_name = Column(String(50), nullable=False)
    section    = Column(String(10), nullable=False)
    date       = Column(Date, nullable=False)
    # Signed HMAC payload encoded in urlsafe base64 + sha256 hex (~200-280 chars).
    token      = Column(String(512), unique=True, nullable=False, index=True)
    expires_at = Column(TIMESTAMP, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    is_active  = Column(Boolean, default=True)


class QrScan(Base):
    __tablename__ = "qr_scans"

    id         = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("qr_sessions.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    scanned_at = Column(TIMESTAMP, server_default=func.now())
    latitude   = Column(Float)
    longitude  = Column(Float)


class AlertLog(Base):
    """Email / SMS alert audit trail. Powers duplicate suppression via ``sent_at``."""

    __tablename__ = "alert_logs"

    id            = Column(Integer, primary_key=True, index=True)
    student_id    = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    alert_type    = Column(String(50), nullable=False)   # e.g. low_grade, low_attendance
    channel       = Column(String(20), nullable=False)    # email | sms | in_app
    recipient     = Column(String(255))
    message       = Column(Text)
    subject_name  = Column(String(255))
    score         = Column(Numeric(6, 2))
    threshold_pct = Column(Numeric(6, 2))
    sent_at       = Column(TIMESTAMP, server_default=func.now())
    status        = Column(String(20), nullable=False, default="queued")  # queued|sent|failed|skipped
    error_message = Column(Text)

    student = relationship("Student", backref="alert_logs")


Index("ix_alert_logs_student_type", AlertLog.student_id, AlertLog.alert_type)


class InAppNotification(Base):
    __tablename__ = "in_app_notifications"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title      = Column(String(255), nullable=False)
    message    = Column(Text, nullable=False)
    type       = Column(String(50), nullable=False, default="info")
    link       = Column(String(500))
    is_read    = Column(Boolean, nullable=False, default=False)
    created_at = Column(TIMESTAMP, server_default=func.now())


Index("ix_in_app_notifications_user_read", InAppNotification.user_id, InAppNotification.is_read)


class Conversation(Base):
    __tablename__ = "conversations"

    id                 = Column(Integer, primary_key=True, index=True)
    student_id         = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=True)
    teacher_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    started_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    subject_line       = Column(String(255), nullable=False)
    created_at         = Column(TIMESTAMP, server_default=func.now())
    last_message_at    = Column(TIMESTAMP, nullable=True)
    status             = Column(String(20), nullable=False, default="open")  # open|closed|archived

    student          = relationship("Student", foreign_keys=[student_id])
    teacher          = relationship("User", foreign_keys=[teacher_id])
    messages         = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete",
        order_by="Message.sent_at.asc()",
    )


class Message(Base):
    __tablename__ = "messages"

    id              = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    sender_id       = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    sender_role     = Column(String(20), nullable=False)
    message_body    = Column(Text, nullable=False)
    message_type    = Column(String(20), nullable=False, default="in_app")  # in_app|email
    is_read         = Column(Boolean, nullable=False, default=False)
    sent_at         = Column(TIMESTAMP, server_default=func.now())

    conversation = relationship("Conversation", back_populates="messages")
    sender       = relationship("User", foreign_keys=[sender_id])


Index("ix_messages_conversation", Message.conversation_id, Message.sent_at)
