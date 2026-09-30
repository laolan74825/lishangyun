from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utcnow
from app.database import Base


class CollaborationInvite(Base):
    __tablename__ = "collaboration_invites"
    __table_args__ = (
        Index("ix_collaboration_invites_invitee_status", "invitee_id", "status"),
        Index("ix_collaboration_invites_inviter_guestbook", "inviter_id", "guestbook_id"),
        Index(
            "uq_collaboration_invites_pending",
            "inviter_id",
            "invitee_id",
            "guestbook_id",
            unique=True,
            sqlite_where=text("status = 'pending'"),
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    inviter_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    invitee_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    guestbook_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("guestbooks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    invite_code: Mapped[str] = mapped_column(String(6), nullable=False, index=True)
    permissions: Mapped[str] = mapped_column(String(10), nullable=False, default="record")
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending")
    signal_expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    collaboration_start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    collaboration_end_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    inviter: Mapped["User"] = relationship("User", foreign_keys=[inviter_id])
    invitee: Mapped["User"] = relationship("User", foreign_keys=[invitee_id])
    guestbook: Mapped["Guestbook"] = relationship(back_populates="collaboration_invites")
