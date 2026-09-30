from datetime import datetime

from app.core.time import utcnow

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="user", index=True)
    nickname: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    security_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="normal")
    encryption_key_hash: Mapped[str | None] = mapped_column(String(256), nullable=True)
    auto_lock_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    persons: Mapped[list["Person"]] = relationship(back_populates="owner")
    guestbooks: Mapped[list["Guestbook"]] = relationship(back_populates="owner")
    gb_records: Mapped[list["GbRecord"]] = relationship(back_populates="owner")
    daily_records: Mapped[list["DailyRecord"]] = relationship(back_populates="owner")
    payment_accounts: Mapped[list["PaymentAccount"]] = relationship(back_populates="owner")
    operation_logs: Mapped[list["OperationLog"]] = relationship(back_populates="owner")
    security_emails: Mapped[list["SecurityEmail"]] = relationship(back_populates="user")
    family_groups_owned: Mapped[list["FamilyGroup"]] = relationship(back_populates="owner")
    family_memberships: Mapped[list["FamilyMember"]] = relationship(back_populates="user")
    notifications: Mapped[list["Notification"]] = relationship(back_populates="user")
    person_balance_adjustments: Mapped[list["PersonBalanceAdjustment"]] = relationship(back_populates="owner")
