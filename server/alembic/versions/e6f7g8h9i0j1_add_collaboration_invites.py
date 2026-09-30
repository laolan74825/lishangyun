"""add_collaboration_invites

协作邀请功能落地（整体替代旧 authorization_codes 授权码体系）：

- 新建 collaboration_invites 表（含 pending 状态 partial unique index）
- 改造 authorization_action_logs：删除旧授权码体系列（authorization_code_id /
  client_id / record_id / grantee_user_id），新增 invite_id 关联协作邀请
- 删除 authorization_codes 表

Revision ID: e6f7g8h9i0j1
Revises: d5e6f7g8h9i0
Create Date: 2026-09-30 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e6f7g8h9i0j1'
down_revision: Union[str, None] = 'd5e6f7g8h9i0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- collaboration_invites: 新建 ---
    op.create_table(
        'collaboration_invites',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('inviter_id', sa.Integer(), nullable=False),
        sa.Column('invitee_id', sa.Integer(), nullable=False),
        sa.Column('guestbook_id', sa.Integer(), nullable=False),
        sa.Column('invite_code', sa.String(6), nullable=False),
        sa.Column('permissions', sa.String(10), nullable=False, server_default='record'),
        sa.Column('status', sa.String(10), nullable=False, server_default='pending'),
        sa.Column('signal_expires_at', sa.DateTime(), nullable=False),
        sa.Column('collaboration_start_at', sa.DateTime(), nullable=False),
        sa.Column('collaboration_end_at', sa.DateTime(), nullable=False),
        sa.Column('accepted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['guestbook_id'], ['guestbooks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['invitee_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['inviter_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_collaboration_invites_inviter_id', 'collaboration_invites', ['inviter_id'])
    op.create_index('ix_collaboration_invites_invitee_id', 'collaboration_invites', ['invitee_id'])
    op.create_index('ix_collaboration_invites_guestbook_id', 'collaboration_invites', ['guestbook_id'])
    op.create_index('ix_collaboration_invites_invite_code', 'collaboration_invites', ['invite_code'])
    op.create_index(
        'ix_collaboration_invites_invitee_status',
        'collaboration_invites',
        ['invitee_id', 'status'],
    )
    op.create_index(
        'ix_collaboration_invites_inviter_guestbook',
        'collaboration_invites',
        ['inviter_id', 'guestbook_id'],
    )
    # pending 唯一性（partial unique index，防并发重复发送）
    op.create_index(
        'uq_collaboration_invites_pending',
        'collaboration_invites',
        ['inviter_id', 'invitee_id', 'guestbook_id'],
        unique=True,
        sqlite_where=sa.text("status = 'pending'"),
        postgresql_where=sa.text("status = 'pending'"),
    )

    # --- authorization_action_logs: 旧数据随体系下线清空，删除旧列，新增 invite_id ---
    op.execute('DELETE FROM authorization_action_logs')
    with op.batch_alter_table('authorization_action_logs', schema=None) as batch_op:
        batch_op.drop_index('ix_authorization_action_logs_authorization_code_id')
        batch_op.drop_constraint(
            'authorization_action_logs_authorization_code_id_fkey', type_='foreignkey'
        )
        batch_op.drop_column('authorization_code_id')
        batch_op.drop_column('client_id')
        batch_op.drop_column('record_id')
        batch_op.drop_index('ix_authorization_action_logs_grantee_user_id')
        batch_op.drop_constraint(
            'fk_authorization_action_logs_grantee_user_id', type_='foreignkey'
        )
        batch_op.drop_column('grantee_user_id')
        batch_op.add_column(sa.Column('invite_id', sa.Integer(), nullable=False))
        batch_op.create_foreign_key(
            'fk_authorization_action_logs_invite_id',
            'collaboration_invites', ['invite_id'], ['id'], ondelete='CASCADE',
        )
        batch_op.create_index('ix_authorization_action_logs_invite_id', ['invite_id'])

    # --- authorization_codes: 删除旧授权码表 ---
    op.drop_table('authorization_codes')


def downgrade() -> None:
    # --- authorization_codes: 恢复旧结构 ---
    op.create_table(
        'authorization_codes',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('guestbook_id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(20), nullable=False),
        sa.Column('grantee_name', sa.String(50), nullable=False, server_default=''),
        sa.Column('grantee_account_id', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('grantee_user_id', sa.Integer(), nullable=True),
        sa.Column('permissions', sa.String(20), nullable=False, server_default='record'),
        sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('bound_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['guestbook_id'], ['guestbooks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(
            ['grantee_user_id'], ['users.id'], ondelete='SET NULL',
            name='fk_authorization_codes_grantee_user_id',
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
    )
    op.create_index('ix_authorization_codes_owner_id', 'authorization_codes', ['owner_id'])
    op.create_index('ix_authorization_codes_guestbook_id', 'authorization_codes', ['guestbook_id'])
    op.create_index('ix_authorization_codes_code', 'authorization_codes', ['code'])
    op.create_index(
        'ix_authorization_codes_grantee_account_id', 'authorization_codes', ['grantee_account_id']
    )
    op.create_index(
        'ix_authorization_codes_grantee_user_id', 'authorization_codes', ['grantee_user_id']
    )

    # --- authorization_action_logs: 恢复旧列，删除 invite_id ---
    op.execute('DELETE FROM authorization_action_logs')
    with op.batch_alter_table('authorization_action_logs', schema=None) as batch_op:
        batch_op.drop_index('ix_authorization_action_logs_invite_id')
        batch_op.drop_constraint('fk_authorization_action_logs_invite_id', type_='foreignkey')
        batch_op.drop_column('invite_id')
        batch_op.add_column(
            sa.Column('authorization_code_id', sa.Integer(), nullable=False, server_default='0')
        )
        batch_op.create_foreign_key(
            'authorization_action_logs_authorization_code_id_fkey',
            'authorization_codes', ['authorization_code_id'], ['id'], ondelete='CASCADE',
        )
        batch_op.create_index(
            'ix_authorization_action_logs_authorization_code_id', ['authorization_code_id']
        )
        batch_op.add_column(sa.Column('client_id', sa.String(50), nullable=True))
        batch_op.add_column(sa.Column('record_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('grantee_user_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_authorization_action_logs_grantee_user_id',
            'users', ['grantee_user_id'], ['id'], ondelete='SET NULL',
        )
        batch_op.create_index('ix_authorization_action_logs_grantee_user_id', ['grantee_user_id'])

    # --- collaboration_invites: 删除 ---
    op.drop_index('uq_collaboration_invites_pending', table_name='collaboration_invites')
    op.drop_index('ix_collaboration_invites_inviter_guestbook', table_name='collaboration_invites')
    op.drop_index('ix_collaboration_invites_invitee_status', table_name='collaboration_invites')
    op.drop_index('ix_collaboration_invites_invite_code', table_name='collaboration_invites')
    op.drop_index('ix_collaboration_invites_guestbook_id', table_name='collaboration_invites')
    op.drop_index('ix_collaboration_invites_invitee_id', table_name='collaboration_invites')
    op.drop_index('ix_collaboration_invites_inviter_id', table_name='collaboration_invites')
    op.drop_table('collaboration_invites')
