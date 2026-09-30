"""m6_user_id_year_seq

用户 ID 格式升级：创建年份（4 位）+ 6 位流水号，如 2026000001。

- 已有用户按 created_at 的年份重排 ID（同年按创建顺序从 1 编号）
- 先临时删除所有引用 users.id 的外键约束，更新子表与 users 主键后重建
  （新 ID 均为 >= 2026000001 的大数，与旧 ID 不重叠，逐条 UPDATE 安全）
- 外键的删除动作按原定义保留（除 pending_approvals.reviewer_id 为 SET NULL
  外均为 CASCADE）， PostgreSQL 下同步 users_id_seq 序列

Revision ID: f7g8h9i0j1k2
Revises: e6f7g8h9i0j1
Create Date: 2026-10-01 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f7g8h9i0j1k2'
down_revision: Union[str, None] = 'e6f7g8h9i0j1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEQ_MODULUS = 1_000_000

# pg_constraint confdeltype 编码 → ON DELETE 子句
FK_DELETE_ACTIONS = {
    'a': 'NO ACTION',
    'r': 'RESTRICT',
    'c': 'CASCADE',
    'n': 'SET NULL',
    'd': 'SET DEFAULT',
}

# (表名, 引用 users.id 的列名)
USER_REF_COLUMNS = [
    ('persons', 'owner_id'),
    ('guestbooks', 'owner_id'),
    ('gb_records', 'owner_id'),
    ('daily_records', 'owner_id'),
    ('payment_accounts', 'owner_id'),
    ('operation_logs', 'owner_id'),
    ('security_emails', 'user_id'),
    ('family_groups', 'owner_id'),
    ('family_members', 'user_id'),
    ('notifications', 'user_id'),
    ('person_balance_adjustments', 'owner_id'),
    ('reset_codes', 'user_id'),
    ('user_key_configs', 'user_id'),
    ('collaboration_invites', 'inviter_id'),
    ('collaboration_invites', 'invitee_id'),
    ('pending_approvals', 'submitter_id'),
    ('pending_approvals', 'reviewer_id'),
]

# 查询所有引用 users.id 的外键约束（表、约束名、列、删除动作）
FK_QUERY = sa.text("""
    SELECT con.conrelid::regclass::text AS tbl,
           con.conname,
           (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
            FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS cols,
           con.confdeltype
    FROM pg_constraint con
    WHERE con.confrelid = 'users'::regclass AND con.contype = 'f'
    ORDER BY tbl
""")


def upgrade() -> None:
    conn = op.get_bind()

    # 1. 临时删除引用 users.id 的外键约束
    fks = conn.execute(FK_QUERY).fetchall()

    # 2. 计算旧 ID → 新 ID 映射；已是新格式的用户跳过（幂等，可重复执行）
    rows = conn.execute(
        sa.text('SELECT id, created_at FROM users ORDER BY created_at, id')
    ).fetchall()
    seq_by_year: dict[int, int] = {}
    mapping: dict[int, int] = {}
    for uid, created_at in rows:
        year = created_at.year
        base = year * SEQ_MODULUS
        if base < uid < base + SEQ_MODULUS:
            seq_by_year[year] = max(seq_by_year.get(year, 0), uid - base)
            continue
        seq = seq_by_year.get(year, 0) + 1
        seq_by_year[year] = seq
        mapping[uid] = base + seq

    if mapping:
        for tbl, conname, _cols, _del in fks:
            conn.execute(sa.text(f'ALTER TABLE {tbl} DROP CONSTRAINT {conname}'))

        # 3. 更新所有引用 users.id 的列，最后更新 users 主键
        for old_id, new_id in mapping.items():
            for table, column in USER_REF_COLUMNS:
                conn.execute(
                    sa.text(f'UPDATE {table} SET {column} = :new_id WHERE {column} = :old_id'),
                    {'new_id': new_id, 'old_id': old_id},
                )
        for old_id, new_id in mapping.items():
            conn.execute(
                sa.text('UPDATE users SET id = :new_id WHERE id = :old_id'),
                {'new_id': new_id, 'old_id': old_id},
            )

        # 4. 按原名重建外键约束，保留原删除动作
        for tbl, conname, cols, deltype in fks:
            action = FK_DELETE_ACTIONS.get(deltype, 'NO ACTION')
            conn.execute(sa.text(
                f'ALTER TABLE {tbl} ADD CONSTRAINT {conname} '
                f'FOREIGN KEY ({cols}) REFERENCES users(id) ON DELETE {action}'
            ))

    if conn.dialect.name == 'postgresql':
        conn.execute(sa.text("SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))"))


def downgrade() -> None:
    # ID 重排不可逆（旧 ID 已被新 ID 覆盖，无备份映射），不提供回退
    pass
