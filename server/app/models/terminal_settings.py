from datetime import datetime

from app.core.time import utcnow

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TerminalSettings(Base):
    __tablename__ = "terminal_settings"
    __table_args__ = (UniqueConstraint("guestbook_id", "client_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    guestbook_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("guestbooks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    operator_name: Mapped[str] = mapped_column(String(50), nullable=False)
    default_cash_account: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("payment_accounts.id", ondelete="SET NULL"), nullable=True
    )
    default_wechat_account: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("payment_accounts.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    guestbook: Mapped["Guestbook"] = relationship(back_populates="terminal_settings")
