"""m7_normalize_user_roles

角色体系收敛为三种：一般用户(user) / 系统管理员(admin) / 超级管理员(super_admin)。

- 历史遗留角色值（family_member、collaborator 等）统一归位为一般用户(user)
- 超级管理员(super_admin) 仅由系统首个注册用户产生，不在本迁移中调整

Revision ID: g8h9i0j1k2l3
Revises: f7g8h9i0j1k2
Create Date: 2026-10-01 01:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'g8h9i0j1k2l3'
down_revision: Union[str, None] = 'f7g8h9i0j1k2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("UPDATE users SET role = 'user' WHERE role NOT IN ('super_admin', 'admin', 'user')")
    )


def downgrade() -> None:
    # 归一化不可逆（旧角色值分布已丢失），不提供回退
    pass
