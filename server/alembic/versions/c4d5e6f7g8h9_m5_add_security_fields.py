"""m5_add_security_fields

Revision ID: c4d5e6f7g8h9
Revises: b3c4d5e6f7g8
Create Date: 2026-09-26 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4d5e6f7g8h9'
down_revision: Union[str, None] = 'b3c4d5e6f7g8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('user_key_configs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('encrypted_family_key', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()))
        batch_op.alter_column(
            'mnemonic_hash',
            existing_type=sa.String(256),
            type_=sa.String(200),
            existing_nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table('user_key_configs', schema=None) as batch_op:
        batch_op.alter_column(
            'mnemonic_hash',
            existing_type=sa.String(200),
            type_=sa.String(256),
            existing_nullable=True,
        )
        batch_op.drop_column('is_active')
        batch_op.drop_column('encrypted_family_key')
