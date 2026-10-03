from datetime import date, datetime

from app.core.time import utcnow
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Guestbook(Base):
    __tablename__ = "guestbooks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    event_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    host_person_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("persons.id", ondelete="SET NULL"), nullable=True)
    operator_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    closing_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closing_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # 人员合并完成时间：礼簿执行"合并到人员库"后记录。
    # 已合并礼簿中后续的修改/补录会自动按宾客姓名/电话解析 person_id，保持关联同步。
    person_merged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    owner: Mapped["User"] = relationship(back_populates="guestbooks")
    host_person: Mapped["Person | None"] = relationship("Person", foreign_keys=[host_person_id])
    gb_records: Mapped[list["GbRecord"]] = relationship(back_populates="guestbook")
    terminal_settings: Mapped[list["TerminalSettings"]] = relationship(back_populates="guestbook")
    operation_logs: Mapped[list["OperationLog"]] = relationship(back_populates="guestbook")
    guestbook_hosts: Mapped[list["GuestbookHost"]] = relationship(back_populates="guestbook")
    collaboration_invites: Mapped[list["CollaborationInvite"]] = relationship(back_populates="guestbook")
