"""m8_add_payment_account_is_disabled

收款账户新增 is_disabled（停用）字段，与 is_active（系统默认）相互独立：

- is_active：每种类型（cash/wechat）唯一的"系统默认"账户（原语义不变）
- is_disabled：停用标记。停用账户在所有业务页面（收礼、记账、新建礼簿、
  礼簿账户设置）不可选择，仅账户管理页可见、可重新启用。
  非默认但未停用的账户是正常备选账户，不再显示为"已停用"。

历史数据全部回填为未停用（is_disabled=false），行为与升级前一致。

Revision ID: h9i0j1k2l3m4
Revises: g8h9i0j1k2l3
Create Date: 2026-10-01 14:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'h9i0j1k2l3m4'
down_revision: Union[str, None] = 'g8h9i0j1k2l3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'payment_accounts',
        sa.Column('is_disabled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index('idx_payment_disabled', 'payment_accounts', ['is_disabled'])


def downgrade() -> None:
    op.drop_index('idx_payment_disabled', table_name='payment_accounts')
    op.drop_column('payment_accounts', 'is_disabled')
