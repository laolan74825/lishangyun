"""引导脚本：在空库中直接创建首个系统管理员（super_admin）。

用途：注册流程要求邮箱验证码，而验证码依赖 SMTP 配置，首次部署时
无法完成注册。此脚本跳过验证码，直接写入首个管理员账号。

安全约束：
- 仅在没有任何非删除用户时允许执行，避免被滥用创建第二个管理员；
- 用户名和密码通过交互输入（或 --username/--password 参数传入，优先用于自动化部署），不落盘、不写进代码；
- 密码使用与登录一致的哈希算法存储；
- 可选绑定一个安全邮箱（标记为已验证），用于后续密码找回。
"""
import argparse
import asyncio
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, select

from app.core.security import hash_password
from app.core.time import utcnow
from app.database import AsyncSessionLocal
from app.models.security_email import SecurityEmail
from app.models.user import User


async def main() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(func.count(User.id)).where(User.is_deleted == False)
        )
        existing = result.scalar_one()
        if existing > 0:
            print(f"系统中已存在 {existing} 个用户，拒绝创建额外管理员。")
            print("如需重置，请先运行 scripts/clear_users.py 清空数据。")
            sys.exit(1)

        args = _parse_args()
        username = (args.username or input("管理员用户名: ")).strip()
        if not username:
            print("用户名不能为空")
            sys.exit(1)
        dup = await db.execute(
            select(func.count(User.id)).where(User.username == username)
        )
        if dup.scalar_one() > 0:
            print("该用户名已存在")
            sys.exit(1)

        if args.password:
            password = args.password
        else:
            password = getpass.getpass("管理员密码: ")
        if len(password) < 8:
            print("密码长度至少 8 位")
            sys.exit(1)
        if not args.password:
            confirm = getpass.getpass("再次输入密码: ")
            if password != confirm:
                print("两次输入的密码不一致")
                sys.exit(1)

        nickname = args.nickname or input("昵称（可留空）: ").strip() or username
        if args.email is not None:
            email = args.email.strip().lower() or None
        else:
            email = input("安全邮箱（可留空，登录后可在后台绑定）: ").strip().lower() or None

        user = User(
            username=username,
            password_hash=hash_password(password),
            role="super_admin",
            nickname=nickname,
            status="active",
            is_active=True,
        )
        db.add(user)
        await db.flush()

        if email:
            db.add(SecurityEmail(
                user_id=user.id,
                email=email,
                is_primary=True,
                is_verified=True,
                verified_at=utcnow(),
            ))

        await db.commit()
        print(f"管理员 [{username}] 创建成功，role=super_admin")
        print("请立即登录后台配置 SMTP，并按需修改密码。")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="创建首个系统管理员（仅空库可用）")
    parser.add_argument("--username", help="管理员用户名（缺省为交互输入）")
    parser.add_argument("--password", help="初始密码（缺省为交互输入，注意 shell 历史泄露风险）")
    parser.add_argument("--nickname", help="昵称（缺省同用户名）")
    parser.add_argument("--email", help="安全邮箱（可选）")
    return parser.parse_args()


if __name__ == "__main__":
    asyncio.run(main())
