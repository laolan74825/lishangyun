"""add_guestbook_closing_summary

礼簿新增 closing_summary（收礼总结说明）字段：

- 结束收礼（close）时可填写一份总结说明，随礼簿保存
- 仅记录用，不影响礼簿生命周期状态机

Revision ID: i0j1k2l3m4n5
Revises: h9i0j1k2l3m4
Create Date: 2026-10-01 15:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'i0j1k2l3m4n5'
down_revision: Union[str, None] = 'h9i0j1k2l3m4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'guestbooks',
        sa.Column('closing_summary', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('guestbooks', 'closing_summary')
