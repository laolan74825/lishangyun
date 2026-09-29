from datetime import datetime

from app.core.time import utcnow

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AuthorizationCode(Base):
    __tablename__ = "authorization_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    guestbook_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("guestbooks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    grantee_name: Mapped[str] = mapped_column(String(50), nullable=False)
    grantee_account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    grantee_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    permissions: Mapped[str] = mapped_column(String(20), nullable=False, default="record")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    bound_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    owner: Mapped["User"] = relationship(back_populates="authorization_codes", foreign_keys=[owner_id])
    guestbook: Mapped["Guestbook"] = relationship(back_populates="authorization_codes")
