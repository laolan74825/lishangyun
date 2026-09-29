from datetime import datetime

from app.core.time import utcnow

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserKeyConfig(Base):
    __tablename__ = "user_key_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    security_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="normal")
    encrypted_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    mnemonic_hash: Mapped[str | None] = mapped_column(String(200), nullable=True)
    encrypted_family_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)
