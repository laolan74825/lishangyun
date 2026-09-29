from datetime import datetime

from app.core.time import utcnow

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class GbRecord(Base):
    __tablename__ = "gb_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    uuid: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, index=True)
    owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    guestbook_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("guestbooks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    person_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("persons.id", ondelete="SET NULL"), nullable=True, index=True
    )
    guest_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    payment_method: Mapped[str] = mapped_column(String(10), nullable=False)
    account_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("payment_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    check_status: Mapped[str] = mapped_column(String(20), nullable=False, default="unchecked", index=True)
    record_time: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow, index=True)
    client_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    operator_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_private: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sync_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    owner: Mapped["User"] = relationship(back_populates="gb_records")
    guestbook: Mapped["Guestbook"] = relationship(back_populates="gb_records")
    person: Mapped["Person | None"] = relationship("Person", foreign_keys=[person_id])
    account: Mapped["PaymentAccount | None"] = relationship("PaymentAccount", foreign_keys=[account_id])
