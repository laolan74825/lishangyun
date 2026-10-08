"""m10_add_user_lock_pin_hash

用户新增 lock_pin_hash（锁屏密码哈希）字段：

- 设置页可设置/清除 4 位数字锁屏密码（设置与清除都需先验证登录密码）
- 自动锁屏后，输入登录密码或锁屏密码均可解锁
- 仅存哈希，与密码哈希同列宽；未设置时为 NULL

Revision ID: k2l3m4n5o6p7
Revises: j1k2l3m4n5o6
Create Date: 2026-10-08 17:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'k2l3m4n5o6p7'
down_revision: Union[str, None] = 'j1k2l3m4n5o6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('lock_pin_hash', sa.String(length=256), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('users', 'lock_pin_hash')
