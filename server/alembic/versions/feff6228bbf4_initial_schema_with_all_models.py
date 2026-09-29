"""initial_schema_with_all_models

Revision ID: feff6228bbf4
Revises:
Create Date: 2026-09-24 20:15:39.754840

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'feff6228bbf4'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('username', sa.String(50), nullable=False),
        sa.Column('password_hash', sa.String(128), nullable=False),
        sa.Column('role', sa.String(20), nullable=False, server_default='user'),
        sa.Column('nickname', sa.String(50), nullable=True),
        sa.Column('email', sa.String(100), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        sa.Column('security_mode', sa.String(20), nullable=False, server_default='normal'),
        sa.Column('encryption_key_hash', sa.String(256), nullable=True),
        sa.Column('auto_lock_minutes', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('username')
    )
    op.create_index('ix_users_role', 'users', ['role'])

    # Persons table
    op.create_table(
        'persons',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(50), nullable=False),
        sa.Column('nickname', sa.String(50), nullable=True),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('aliases', sa.Text(), nullable=False, server_default='[]'),
        sa.Column('relationship_tag', sa.String(20), nullable=False, server_default='other'),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('is_private', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('sync_version', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE')
    )
    op.create_index('ix_persons_owner_id', 'persons', ['owner_id'])
    op.create_index('ix_persons_name', 'persons', ['name'])
    op.create_index('ix_persons_phone', 'persons', ['phone'])
    op.create_index('ix_persons_relationship_tag', 'persons', ['relationship_tag'])

    # Payment accounts table
    op.create_table(
        'payment_accounts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(50), nullable=False),
        sa.Column('type', sa.String(10), nullable=False),
        sa.Column('identifier', sa.String(50), nullable=True),
        sa.Column('daily_limit', sa.Integer(), nullable=False, server_default='20000000'),
        sa.Column('qr_code', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE')
    )
    op.create_index('ix_payment_accounts_owner_id', 'payment_accounts', ['owner_id'])
    op.create_index('ix_payment_accounts_type', 'payment_accounts', ['type'])
    op.create_index('ix_payment_accounts_is_active', 'payment_accounts', ['is_active'])

    # Guestbooks table
    op.create_table(
        'guestbooks',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('event_type', sa.String(30), nullable=False),
        sa.Column('event_date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        sa.Column('host_person_id', sa.Integer(), nullable=True),
        sa.Column('operator_note', sa.Text(), nullable=True),
        sa.Column('closing_at', sa.DateTime(), nullable=True),
        sa.Column('archived_at', sa.DateTime(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['host_person_id'], ['persons.id'], ondelete='SET NULL')
    )
    op.create_index('ix_guestbooks_owner_id', 'guestbooks', ['owner_id'])
    op.create_index('ix_guestbooks_event_date', 'guestbooks', ['event_date'])
    op.create_index('ix_guestbooks_status', 'guestbooks', ['status'])

    # GB records table
    op.create_table(
        'gb_records',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('uuid', sa.String(36), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('guestbook_id', sa.Integer(), nullable=False),
        sa.Column('person_id', sa.Integer(), nullable=True),
        sa.Column('guest_name', sa.String(50), nullable=False),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('payment_method', sa.String(10), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('agent_name', sa.String(50), nullable=True),
        sa.Column('check_status', sa.String(20), nullable=False, server_default='unchecked'),
        sa.Column('record_time', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('client_id', sa.String(50), nullable=True),
        sa.Column('operator_name', sa.String(50), nullable=True),
        sa.Column('is_private', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('sync_version', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('uuid'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['guestbook_id'], ['guestbooks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['person_id'], ['persons.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['account_id'], ['payment_accounts.id'], ondelete='SET NULL')
    )
    op.create_index('ix_gb_records_uuid', 'gb_records', ['uuid'])
    op.create_index('ix_gb_records_owner_id', 'gb_records', ['owner_id'])
    op.create_index('ix_gb_records_guestbook_id', 'gb_records', ['guestbook_id'])
    op.create_index('ix_gb_records_person_id', 'gb_records', ['person_id'])
    op.create_index('ix_gb_records_guest_name', 'gb_records', ['guest_name'])
    op.create_index('ix_gb_records_account_id', 'gb_records', ['account_id'])
    op.create_index('ix_gb_records_check_status', 'gb_records', ['check_status'])
    op.create_index('ix_gb_records_record_time', 'gb_records', ['record_time'])

    # Daily records table
    op.create_table(
        'daily_records',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('uuid', sa.String(36), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(3), nullable=False),
        sa.Column('person_id', sa.Integer(), nullable=True),
        sa.Column('person_name', sa.String(50), nullable=False),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(30), nullable=False),
        sa.Column('payment_method', sa.String(10), nullable=True),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('event_date', sa.Date(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('source', sa.String(10), nullable=False, server_default='daily'),
        sa.Column('source_id', sa.Integer(), nullable=True),
        sa.Column('created_by', sa.String(50), nullable=True),
        sa.Column('is_private', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('sync_version', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('uuid'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['person_id'], ['persons.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['account_id'], ['payment_accounts.id'], ondelete='SET NULL')
    )
    op.create_index('ix_daily_records_uuid', 'daily_records', ['uuid'])
    op.create_index('ix_daily_records_owner_id', 'daily_records', ['owner_id'])
    op.create_index('ix_daily_records_type', 'daily_records', ['type'])
    op.create_index('ix_daily_records_person_id', 'daily_records', ['person_id'])
    op.create_index('ix_daily_records_account_id', 'daily_records', ['account_id'])
    op.create_index('ix_daily_records_event_date', 'daily_records', ['event_date'])

    # Operation logs table
    op.create_table(
        'operation_logs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('target_table', sa.String(50), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('guestbook_id', sa.Integer(), nullable=True),
        sa.Column('action_type', sa.String(30), nullable=False),
        sa.Column('operator_name', sa.String(50), nullable=True),
        sa.Column('client_id', sa.String(50), nullable=True),
        sa.Column('before_data', sa.Text(), nullable=True),
        sa.Column('after_data', sa.Text(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['guestbook_id'], ['guestbooks.id'], ondelete='SET NULL')
    )
    op.create_index('ix_operation_logs_owner_id', 'operation_logs', ['owner_id'])
    op.create_index('ix_operation_logs_target_table', 'operation_logs', ['target_table'])
    op.create_index('ix_operation_logs_target_id', 'operation_logs', ['target_id'])
    op.create_index('ix_operation_logs_guestbook_id', 'operation_logs', ['guestbook_id'])
    op.create_index('ix_operation_logs_created_at', 'operation_logs', ['created_at'])

    # Terminal settings table
    op.create_table(
        'terminal_settings',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('guestbook_id', sa.Integer(), nullable=False),
        sa.Column('client_id', sa.String(50), nullable=False),
        sa.Column('operator_name', sa.String(50), nullable=False),
        sa.Column('default_cash_account', sa.Integer(), nullable=True),
        sa.Column('default_wechat_account', sa.Integer(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('guestbook_id', 'client_id'),
        sa.ForeignKeyConstraint(['guestbook_id'], ['guestbooks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['default_cash_account'], ['payment_accounts.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['default_wechat_account'], ['payment_accounts.id'], ondelete='SET NULL')
    )
    op.create_index('ix_terminal_settings_guestbook_id', 'terminal_settings', ['guestbook_id'])
    op.create_index('ix_terminal_settings_client_id', 'terminal_settings', ['client_id'])

    # System settings table
    op.create_table(
        'system_settings',
        sa.Column('key', sa.String(50), nullable=False),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('key')
    )

    # Reset codes table
    op.create_table(
        'reset_codes',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(100), nullable=False),
        sa.Column('code', sa.String(10), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )
    op.create_index('ix_reset_codes_user_id', 'reset_codes', ['user_id'])
    op.create_index('ix_reset_codes_email', 'reset_codes', ['email'])

    # Security emails table
    op.create_table(
        'security_emails',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(100), nullable=False),
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('verified_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )
    op.create_index('ix_security_emails_user_id', 'security_emails', ['user_id'])
    op.create_index('ix_security_emails_email', 'security_emails', ['email'])

    # Guestbook hosts table
    op.create_table(
        'guestbook_hosts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('guestbook_id', sa.Integer(), nullable=False),
        sa.Column('person_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['guestbook_id'], ['guestbooks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['person_id'], ['persons.id'], ondelete='CASCADE')
    )
    op.create_index('ix_guestbook_hosts_guestbook_id', 'guestbook_hosts', ['guestbook_id'])
    op.create_index('ix_guestbook_hosts_person_id', 'guestbook_hosts', ['person_id'])

    # Family groups table
    op.create_table(
        'family_groups',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(50), nullable=False),
        sa.Column('invite_code', sa.String(20), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('invite_code'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE')
    )
    op.create_index('ix_family_groups_owner_id', 'family_groups', ['owner_id'])
    op.create_index('ix_family_groups_invite_code', 'family_groups', ['invite_code'])

    # Family members table
    op.create_table(
        'family_members',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('family_group_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(20), nullable=False, server_default='member'),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('joined_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['family_group_id'], ['family_groups.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )
    op.create_index('ix_family_members_family_group_id', 'family_members', ['family_group_id'])
    op.create_index('ix_family_members_user_id', 'family_members', ['user_id'])

    # Pending approvals table
    op.create_table(
        'pending_approvals',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('family_group_id', sa.Integer(), nullable=False),
        sa.Column('submitter_id', sa.Integer(), nullable=False),
        sa.Column('action_type', sa.String(20), nullable=False),
        sa.Column('target_table', sa.String(50), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=True),
        sa.Column('data_snapshot', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('reviewer_id', sa.Integer(), nullable=True),
        sa.Column('review_note', sa.Text(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['family_group_id'], ['family_groups.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['submitter_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['reviewer_id'], ['users.id'], ondelete='SET NULL')
    )
    op.create_index('ix_pending_approvals_family_group_id', 'pending_approvals', ['family_group_id'])
    op.create_index('ix_pending_approvals_submitter_id', 'pending_approvals', ['submitter_id'])
    op.create_index('ix_pending_approvals_status', 'pending_approvals', ['status'])

    # User key configs table
    op.create_table(
        'user_key_configs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('security_mode', sa.String(20), nullable=False, server_default='normal'),
        sa.Column('encrypted_key', sa.Text(), nullable=True),
        sa.Column('mnemonic_hash', sa.String(256), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )
    op.create_index('ix_user_key_configs_user_id', 'user_key_configs', ['user_id'])

    # Notifications table
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(20), nullable=False),
        sa.Column('title', sa.String(100), nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('related_type', sa.String(50), nullable=True),
        sa.Column('related_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])
    op.create_index('ix_notifications_type', 'notifications', ['type'])
    op.create_index('ix_notifications_created_at', 'notifications', ['created_at'])

    # Person balance adjustments table
    op.create_table(
        'person_balance_adjustments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('person_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('created_by', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['person_id'], ['persons.id'], ondelete='CASCADE')
    )
    op.create_index('ix_person_balance_adjustments_owner_id', 'person_balance_adjustments', ['owner_id'])
    op.create_index('ix_person_balance_adjustments_person_id', 'person_balance_adjustments', ['person_id'])

    # Authorization codes table
    op.create_table(
        'authorization_codes',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('guestbook_id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(20), nullable=False),
        sa.Column('authorized_user_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['guestbook_id'], ['guestbooks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['authorized_user_id'], ['users.id'], ondelete='SET NULL')
    )
    op.create_index('ix_authorization_codes_owner_id', 'authorization_codes', ['owner_id'])
    op.create_index('ix_authorization_codes_guestbook_id', 'authorization_codes', ['guestbook_id'])
    op.create_index('ix_authorization_codes_code', 'authorization_codes', ['code'])
    op.create_index('ix_authorization_codes_authorized_user_id', 'authorization_codes', ['authorized_user_id'])

    # Authorization action logs table
    op.create_table(
        'authorization_action_logs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('authorization_code_id', sa.Integer(), nullable=False),
        sa.Column('action_type', sa.String(30), nullable=False),
        sa.Column('operator_name', sa.String(50), nullable=True),
        sa.Column('client_id', sa.String(50), nullable=True),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['authorization_code_id'], ['authorization_codes.id'], ondelete='CASCADE')
    )
    op.create_index('ix_authorization_action_logs_authorization_code_id', 'authorization_action_logs', ['authorization_code_id'])
    op.create_index('ix_authorization_action_logs_created_at', 'authorization_action_logs', ['created_at'])


def downgrade() -> None:
    op.drop_table('authorization_action_logs')
    op.drop_table('authorization_codes')
    op.drop_table('person_balance_adjustments')
    op.drop_table('notifications')
    op.drop_table('user_key_configs')
    op.drop_table('pending_approvals')
    op.drop_table('family_members')
    op.drop_table('family_groups')
    op.drop_table('guestbook_hosts')
    op.drop_table('security_emails')
    op.drop_table('reset_codes')
    op.drop_table('system_settings')
    op.drop_table('terminal_settings')
    op.drop_table('operation_logs')
    op.drop_table('daily_records')
    op.drop_table('gb_records')
    op.drop_table('guestbooks')
    op.drop_table('payment_accounts')
    op.drop_table('persons')
    op.drop_table('users')
