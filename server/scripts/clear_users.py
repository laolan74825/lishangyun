"""清除所有用户数据，使系统回到初始状态（needs_init=true）"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from app.database import engine


async def main() -> None:
    async with engine.begin() as conn:
        result = await conn.execute(text("SELECT COUNT(*) FROM users"))
        count = result.scalar()
        print(f"当前用户数: {count}")

        if count == 0:
            print("数据库已为空，无需清除")
            return

        await conn.execute(text("DELETE FROM security_emails"))
        await conn.execute(text("DELETE FROM reset_codes"))
        await conn.execute(text("DELETE FROM email_verification_codes"))
        await conn.execute(text("DELETE FROM users"))

        result = await conn.execute(text("SELECT COUNT(*) FROM users"))
        print(f"清除后用户数: {result.scalar()}")
        print("系统已回到初始状态，重新打开页面将显示首次运行提示")


if __name__ == "__main__":
    asyncio.run(main())
