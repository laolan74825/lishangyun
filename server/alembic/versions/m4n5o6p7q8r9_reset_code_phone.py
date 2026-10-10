"""m12_reset_code_phone

密码重置码支持手机号通道：

- reset_codes.email 改为可空（手机号找回的码没有邮箱）
- reset_codes 新增 phone 列（可空，索引）

Revision ID: m4n5o6p7q8r9
Revises: l3m4n5o6p7q8
Create Date: 2026-10-10 21:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'm4n5o6p7q8r9'
down_revision: Union[str, None] = 'l3m4n5o6p7q8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('reset_codes', 'email', existing_type=sa.String(length=100), nullable=True)
    op.add_column(
        'reset_codes',
        sa.Column('phone', sa.String(length=20), nullable=True),
    )
    op.create_index('ix_reset_codes_phone', 'reset_codes', ['phone'])


def downgrade() -> None:
    op.drop_index('ix_reset_codes_phone', table_name='reset_codes')
    op.drop_column('reset_codes', 'phone')
    op.alter_column('reset_codes', 'email', existing_type=sa.String(length=100), nullable=False)
