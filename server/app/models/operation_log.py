from datetime import datetime

from app.core.time import utcnow

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class OperationLog(Base):
    __tablename__ = "operation_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    target_table: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    target_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    guestbook_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("guestbooks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action_type: Mapped[str] = mapped_column(String(30), nullable=False)
    operator_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    client_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    before_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    after_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow, index=True)

    owner: Mapped["User"] = relationship(back_populates="operation_logs")
    guestbook: Mapped["Guestbook | None"] = relationship(back_populates="operation_logs")
