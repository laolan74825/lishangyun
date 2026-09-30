"""add_code_created_at

Revision ID: d5e6f7g8h9i0
Revises: c4d5e6f7g8h9
Create Date: 2026-09-30 17:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd5e6f7g8h9i0'
down_revision: Union[str, None] = 'c4d5e6f7g8h9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 既有行的 created_at 无法回溯，用当前时间填充
    with op.batch_alter_table('email_verification_codes', schema=None) as batch_op:
        batch_op.add_column(sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()))

    with op.batch_alter_table('reset_codes', schema=None) as batch_op:
        batch_op.add_column(sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()))


def downgrade() -> None:
    with op.batch_alter_table('reset_codes', schema=None) as batch_op:
        batch_op.drop_column('created_at')

    with op.batch_alter_table('email_verification_codes', schema=None) as batch_op:
        batch_op.drop_column('created_at')
