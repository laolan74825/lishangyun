"""M5 security API integration test."""
import asyncio
import hashlib
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, delete

from app.main import app
from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.user_key_config import UserKeyConfig
from app.core.security import hash_password


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


async def cleanup():
    async with AsyncSessionLocal() as db:
        await db.execute(delete(UserKeyConfig))
        existing = await db.execute(select(User).where(User.username == "sectest"))
        if not existing.scalar_one_or_none():
            db.add(User(username="sectest", nickname="SecTest", password_hash=hash_password("Test1234!"), role="user"))
        await db.commit()
    print("Cleaned & ready")


async def test_all():
    await cleanup()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post("/api/auth/login", json={"username": "sectest", "password": "Test1234!"})
        assert r.status_code == 200, f"Login failed: {r.text}"
        token = r.json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        print("=== Logged in ===")

        mnemonic1 = "abandon ability able about above absent"
        mnemonic1_hash = sha256_hex(mnemonic1)
        mnemonic2 = "new mnemonic phrase for testing"
        mnemonic2_hash = sha256_hex(mnemonic2)
        wrong_hash = sha256_hex("wrong mnemonic phrase")

        # 1. Get initial config (should be normal mode)
        r = await c.get("/api/security/config", headers=h)
        assert r.status_code == 200, f"Get config failed: {r.text}"
        cfg = r.json()
        assert cfg["security_mode"] == "normal"
        assert cfg["has_encrypted_key"] == False
        assert cfg["is_active"] == True
        print(f"1. [PASS] Initial config: mode={cfg['security_mode']}")

        # 2. Get detail config
        r = await c.get("/api/security/config/detail", headers=h)
        assert r.status_code == 200
        detail = r.json()
        assert detail["security_mode"] == "normal"
        print(f"2. [PASS] Detail config: id={detail['id']}")

        # 3. Enable enhanced mode
        r = await c.post("/api/security/enable-enhanced", json={
            "encrypted_key": "test_encrypted_key_base64_data",
            "mnemonic_hash": mnemonic1_hash,
        }, headers=h)
        assert r.status_code == 200, f"Enable enhanced failed: {r.text}"
        print("3. [PASS] Enhanced mode enabled")

        # 4. Verify config reflects enhanced mode
        r = await c.get("/api/security/config", headers=h)
        cfg = r.json()
        assert cfg["security_mode"] == "enhanced"
        assert cfg["has_encrypted_key"] == True
        assert cfg["has_mnemonic_hash"] == True
        assert cfg["is_active"] == True
        print(f"4. [PASS] Config updated: mode={cfg['security_mode']}, has_key={cfg['has_encrypted_key']}")

        # 5. Try enabling again (should fail)
        r = await c.post("/api/security/enable-enhanced", json={
            "encrypted_key": "another_key",
            "mnemonic_hash": "another_hash",
        }, headers=h)
        assert r.status_code == 400
        print("5. [PASS] Duplicate enable rejected (400)")

        # 6. Verify mnemonic (correct)
        r = await c.post("/api/security/verify-mnemonic", json={
            "mnemonic_hash": mnemonic1_hash,
        }, headers=h)
        assert r.status_code == 200
        print("6. [PASS] Mnemonic verified successfully")

        # 7. Verify mnemonic (wrong)
        r = await c.post("/api/security/verify-mnemonic", json={
            "mnemonic_hash": wrong_hash,
        }, headers=h)
        assert r.status_code == 401
        print("7. [PASS] Wrong mnemonic rejected (401)")

        # 8. Upload family key
        r = await c.post("/api/security/upload-family-key", json={
            "encrypted_family_key": "encrypted_family_master_key_data",
        }, headers=h)
        assert r.status_code == 200
        print("8. [PASS] Family key uploaded")

        # 9. Verify family key is stored
        r = await c.get("/api/security/config", headers=h)
        cfg = r.json()
        assert cfg["has_encrypted_family_key"] == True
        print(f"9. [PASS] Family key stored: has_family_key={cfg['has_encrypted_family_key']}")

        # 10. Disable enhanced mode (correct mnemonic)
        r = await c.post("/api/security/disable-enhanced", json={
            "mnemonic_hash": mnemonic1_hash,
        }, headers=h)
        assert r.status_code == 200
        print("10. [PASS] Enhanced mode disabled")

        # 11. Verify config back to normal
        r = await c.get("/api/security/config", headers=h)
        cfg = r.json()
        assert cfg["security_mode"] == "normal"
        assert cfg["has_encrypted_key"] == False
        assert cfg["is_active"] == False
        print(f"11. [PASS] Config reset: mode={cfg['security_mode']}, is_active={cfg['is_active']}")

        # 12. Try disable again (should fail)
        r = await c.post("/api/security/disable-enhanced", json={
            "mnemonic_hash": wrong_hash,
        }, headers=h)
        assert r.status_code == 400
        print("12. [PASS] Double disable rejected (400)")

        # 13. Re-enable enhanced mode
        r = await c.post("/api/security/enable-enhanced", json={
            "encrypted_key": "new_encrypted_key",
            "mnemonic_hash": mnemonic2_hash,
        }, headers=h)
        assert r.status_code == 200
        print("13. [PASS] Re-enabled enhanced mode")

        # 14. Disable with wrong mnemonic
        r = await c.post("/api/security/disable-enhanced", json={
            "mnemonic_hash": wrong_hash,
        }, headers=h)
        assert r.status_code == 401
        print("14. [PASS] Disable with wrong mnemonic rejected (401)")

        # 15. Verify audit logs exist
        from app.models.operation_log import OperationLog
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(OperationLog).where(
                    OperationLog.target_table == "user_key_config",
                    OperationLog.action_type == "SECURITY_SWITCH",
                )
            )
            logs = result.scalars().all()
            assert len(logs) >= 2, f"Expected >= 2 audit logs, got {len(logs)}"
            print(f"15. [PASS] Audit logs: {len(logs)} SECURITY_SWITCH entries")

        print()
        print("=" * 30)
        print("  ALL 15 TESTS PASSED [PASS]")
        print("=" * 30)


asyncio.run(test_all())
