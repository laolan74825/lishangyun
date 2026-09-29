"""m3_add_family_authz_fields

Revision ID: b3c4d5e6f7g8
Revises: a1b2c3d4e5f6
Create Date: 2026-09-26 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3c4d5e6f7g8'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- family_groups: add invite_expires_at ---
    with op.batch_alter_table('family_groups', schema=None) as batch_op:
        batch_op.add_column(sa.Column('invite_expires_at', sa.DateTime(), nullable=True))

    # --- family_members: add display_name, is_active, unique constraint ---
    with op.batch_alter_table('family_members', schema=None) as batch_op:
        batch_op.add_column(sa.Column('display_name', sa.String(50), nullable=True))
        batch_op.add_column(sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()))
        batch_op.create_unique_constraint('uq_family_members_group_user', ['family_group_id', 'user_id'])

    # --- authorization_codes: rename authorized_user_id → grantee_account_id, add new fields ---
    with op.batch_alter_table('authorization_codes', schema=None) as batch_op:
        batch_op.drop_index('ix_authorization_codes_authorized_user_id')
        batch_op.drop_constraint('authorization_codes_authorized_user_id_fkey', type_='foreignkey')
        batch_op.alter_column(
            'authorized_user_id',
            new_column_name='grantee_account_id',
            existing_type=sa.Integer(),
            nullable=False,
            server_default='0',
        )
        batch_op.add_column(sa.Column('grantee_name', sa.String(50), nullable=False, server_default=''))
        batch_op.add_column(sa.Column('grantee_user_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('bound_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('permissions', sa.String(20), nullable=False, server_default='record'))
        batch_op.create_foreign_key(
            'fk_authorization_codes_grantee_user_id',
            'users', ['grantee_user_id'], ['id'], ondelete='SET NULL',
        )
        batch_op.create_index('ix_authorization_codes_grantee_account_id', ['grantee_account_id'])
        batch_op.create_index('ix_authorization_codes_grantee_user_id', ['grantee_user_id'])

    # --- authorization_action_logs: add record_id, grantee_user_id ---
    with op.batch_alter_table('authorization_action_logs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('record_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('grantee_user_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_authorization_action_logs_grantee_user_id',
            'users', ['grantee_user_id'], ['id'], ondelete='SET NULL',
        )
        batch_op.create_index('ix_authorization_action_logs_grantee_user_id', ['grantee_user_id'])

    # --- notifications: add is_archived ---
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_archived', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.drop_column('is_archived')

    with op.batch_alter_table('authorization_action_logs', schema=None) as batch_op:
        batch_op.drop_index('ix_authorization_action_logs_grantee_user_id')
        batch_op.drop_constraint('fk_authorization_action_logs_grantee_user_id', type_='foreignkey')
        batch_op.drop_column('grantee_user_id')
        batch_op.drop_column('record_id')

    with op.batch_alter_table('authorization_codes', schema=None) as batch_op:
        batch_op.drop_index('ix_authorization_codes_grantee_user_id')
        batch_op.drop_index('ix_authorization_codes_grantee_account_id')
        batch_op.drop_constraint('fk_authorization_codes_grantee_user_id', type_='foreignkey')
        batch_op.drop_column('permissions')
        batch_op.drop_column('bound_at')
        batch_op.drop_column('grantee_user_id')
        batch_op.drop_column('grantee_name')
        batch_op.alter_column(
            'grantee_account_id',
            new_column_name='authorized_user_id',
            existing_type=sa.Integer(),
            nullable=True,
            server_default=None,
        )
        batch_op.create_foreign_key(
            'fk_authorization_codes_authorized_user_id',
            'users', ['authorized_user_id'], ['id'], ondelete='SET NULL',
        )
        batch_op.create_index('ix_authorization_codes_authorized_user_id', ['authorized_user_id'])

    with op.batch_alter_table('family_members', schema=None) as batch_op:
        batch_op.drop_constraint('uq_family_members_group_user', type_='unique')
        batch_op.drop_column('is_active')
        batch_op.drop_column('display_name')

    with op.batch_alter_table('family_groups', schema=None) as batch_op:
        batch_op.drop_column('invite_expires_at')
