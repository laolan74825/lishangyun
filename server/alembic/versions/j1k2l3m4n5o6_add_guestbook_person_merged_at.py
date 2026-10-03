"""m9_add_guestbook_person_merged_at

礼簿新增 person_merged_at（人员合并完成时间）字段：

- 礼簿执行"合并到人员库"后记录该时间，作为"已合并"标记
- 已合并礼簿中后续的修改/补录记录会按宾客姓名/电话自动解析 person_id，
  保持与人员库的关联同步（无需重复执行合并）

Revision ID: j1k2l3m4n5o6
Revises: i0j1k2l3m4n5
Create Date: 2026-10-03 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'j1k2l3m4n5o6'
down_revision: Union[str, None] = 'i0j1k2l3m4n5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'guestbooks',
        sa.Column('person_merged_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('guestbooks', 'person_merged_at')
