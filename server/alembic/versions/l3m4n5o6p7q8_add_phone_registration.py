"""m11_add_phone_registration

手机号注册改造：

- users 新增 phone 字段（唯一，可空；存量用户为 NULL 不受影响，
  Postgres 唯一约束允许多个 NULL）
- 新建 phone_verification_codes 表：结构与 email_verification_codes 同构，
  按手机号节流、一次性使用、10 分钟有效

Revision ID: l3m4n5o6p7q8
Revises: k2l3m4n5o6p7
Create Date: 2026-10-10 20:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'l3m4n5o6p7q8'
down_revision: Union[str, None] = 'k2l3m4n5o6p7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('phone', sa.String(length=20), nullable=True),
    )
    op.create_index('ix_users_phone', 'users', ['phone'], unique=True)

    op.create_table(
        'phone_verification_codes',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('phone', sa.String(length=20), nullable=False),
        sa.Column('code', sa.String(length=10), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_phone_verification_codes_phone', 'phone_verification_codes', ['phone'])


def downgrade() -> None:
    op.drop_index('ix_phone_verification_codes_phone', table_name='phone_verification_codes')
    op.drop_table('phone_verification_codes')
    op.drop_index('ix_users_phone', table_name='users')
    op.drop_column('users', 'phone')
