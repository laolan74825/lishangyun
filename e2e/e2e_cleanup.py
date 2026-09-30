"""清理 E2E 测试数据：e2e_owner / e2e_invitee 及其礼簿、邀请、礼金、日志。

用法（在仓库根目录）：
    server/.venv/Scripts/python.exe e2e/e2e_cleanup.py
"""
import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

ENGINE = create_async_engine(
    "postgresql+asyncpg://postgres:postgres@localhost:5432/giftregistry"
)
Session = async_sessionmaker(ENGINE, expire_on_commit=False)


async def main():
    async with Session() as db:
        uids = [r[0] for r in (await db.execute(
            text("SELECT id FROM users WHERE username IN ('e2e_owner','e2e_invitee')")
        )).all()]
        if not uids:
            print("没有找到测试用户，无需清理")
            return
        print(f"测试用户 id: {uids}")

        gb_rows = (await db.execute(
            text("SELECT id FROM guestbooks WHERE owner_id = ANY(:uids)").params(uids=uids)
        )).all()
        gb_ids = [r[0] for r in gb_rows]
        inv_rows = (await db.execute(
            text("SELECT id FROM collaboration_invites "
                 "WHERE inviter_id = ANY(:uids) OR invitee_id = ANY(:uids)").params(uids=uids)
        )).all()
        inv_ids = [r[0] for r in inv_rows]
        print(f"涉及礼簿 {len(gb_ids)} 个，邀请 {len(inv_ids)} 条")

        if inv_ids:
            n = (await db.execute(
                text("DELETE FROM authorization_action_logs WHERE invite_id = ANY(:iids)").params(iids=inv_ids)
            )).rowcount
            print(f"authorization_action_logs: 删除 {n} 行")
            n = (await db.execute(
                text("DELETE FROM collaboration_invites WHERE id = ANY(:iids)").params(iids=inv_ids)
            )).rowcount
            print(f"collaboration_invites: 删除 {n} 行")

        if gb_ids:
            for t, col in (("gb_records", "guestbook_id"),
                           ("guestbook_hosts", "guestbook_id"),
                           ("guestbooks", "id")):
                n = (await db.execute(
                    text(f"DELETE FROM {t} WHERE {col} = ANY(:gids)").params(gids=gb_ids)
                )).rowcount
                print(f"{t}: 删除 {n} 行")

        USER_TABLES = {
            # 表名: (用户关联列, 是否含 owner 语义)
            "operation_logs": "owner_id",
            "notifications": "user_id",
            "persons": "owner_id",
            "person_balance_adjustments": "owner_id",
            "family_members": "user_id",
            "family_groups": "owner_id",
            "payment_accounts": "owner_id",
            "daily_records": "owner_id",
            "reset_codes": "user_id",
            "security_emails": "user_id",
            "user_key_configs": "user_id",
        }
        for t, col in USER_TABLES.items():
            async with db.begin_nested():
                n = (await db.execute(
                    text(f"DELETE FROM {t} WHERE {col} = ANY(:uids)").params(uids=uids)
                )).rowcount
                if n:
                    print(f"{t}: 删除 {n} 行")

        n = (await db.execute(
            text("DELETE FROM users WHERE id = ANY(:uids)").params(uids=uids)
        )).rowcount
        print(f"users: 删除 {n} 行")
        await db.commit()

        left = (await db.execute(
            text("SELECT count(*) FROM users WHERE username IN ('e2e_owner','e2e_invitee')")
        )).scalar()
        gb_left = (await db.execute(
            text("SELECT count(*) FROM guestbooks WHERE name LIKE 'E2E协作验证%'")
        )).scalar()
        print(f"清理完成：残留测试用户 {left}，残留 E2E 礼簿 {gb_left}")


asyncio.run(main())
