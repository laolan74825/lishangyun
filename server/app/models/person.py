import json
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Person(Base):
    __tablename__ = "persons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    nickname: Mapped[str | None] = mapped_column(String(50), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    _aliases: Mapped[str] = mapped_column("aliases", Text, nullable=False, default="[]")
    relation_tag: Mapped[str] = mapped_column(String(20), nullable=False, default="其他")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    @property
    def aliases(self) -> list[str]:
        return json.loads(self._aliases) if self._aliases else []

    @aliases.setter
    def aliases(self, value: list[str]) -> None:
        self._aliases = json.dumps(value, ensure_ascii=False)
