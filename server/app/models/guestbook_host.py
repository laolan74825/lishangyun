from datetime import datetime

from app.core.time import utcnow

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class GuestbookHost(Base):
    __tablename__ = "guestbook_hosts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    guestbook_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("guestbooks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    person_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    guestbook: Mapped["Guestbook"] = relationship(back_populates="guestbook_hosts")
    person: Mapped["Person"] = relationship("Person", foreign_keys=[person_id])
