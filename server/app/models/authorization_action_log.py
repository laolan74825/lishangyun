from datetime import datetime

from app.core.time import utcnow

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuthorizationActionLog(Base):
    """协作邀请操作日志（authorization_action_logs 表）。

    由旧授权码体系改造而来：authorization_code_id / client_id / record_id /
    grantee_user_id 等旧列已删除，invite_id 关联协作邀请。
    """

    __tablename__ = "authorization_action_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    invite_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("collaboration_invites.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action_type: Mapped[str] = mapped_column(String(30), nullable=False)
    operator_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow, index=True)
