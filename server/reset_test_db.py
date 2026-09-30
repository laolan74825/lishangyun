import asyncio

import asyncpg


async def main():
    conn = await asyncpg.connect(
        "postgresql://postgres:postgres@localhost:5432/postgres"
    )
    rows = await conn.fetch(
        """
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = 'giftregistry_test' AND pid <> pg_backend_pid()
        """
    )
    print(f"terminated {len(rows)} backend(s)")
    await conn.execute("DROP DATABASE IF EXISTS giftregistry_test")
    await conn.execute("CREATE DATABASE giftregistry_test")
    await conn.close()
    print("test database recreated")


asyncio.run(main())
