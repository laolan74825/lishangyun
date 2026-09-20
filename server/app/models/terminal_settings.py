from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TerminalSettings(Base):
    __tablename__ = "terminal_settings"
    __table_args__ = (UniqueConstraint("guestbook_id", "client_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    guestbook_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    client_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    operator_name: Mapped[str] = mapped_column(String(50), nullable=False)
    default_cash_account: Mapped[int | None] = mapped_column(Integer, nullable=True)
    default_wechat_account: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
