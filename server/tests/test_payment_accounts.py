from sqlalchemy import select

from app.models.payment_account import PaymentAccount


def _create_account(client, headers, name="现金账户", acct_type="cash"):
    return client.post("/api/payment-accounts/", json={
        "name": name,
        "type": acct_type,
    }, headers=headers)


class TestPaymentAccountCRUD:
    async def test_create_account(self, client, admin_headers, db_session):
        resp = _create_account(client, admin_headers)
        assert resp.status_code == 200
        account_id = resp.json()
        assert isinstance(account_id, int)

    async def test_list_accounts(self, client, admin_headers, db_session):
        _create_account(client, admin_headers, name="现金")
        _create_account(client, admin_headers, name="微信", acct_type="wechat")

        resp = client.get("/api/payment-accounts/", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["pagination"]["total_count"] == 2

    async def test_list_accounts_filter_by_type(self, client, admin_headers, db_session):
        _create_account(client, admin_headers, name="现金", acct_type="cash")
        _create_account(client, admin_headers, name="微信", acct_type="wechat")

        resp = client.get("/api/payment-accounts/?type=cash", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["pagination"]["total_count"] == 1
        assert data["items"][0]["type"] == "cash"

    async def test_get_account(self, client, admin_headers, db_session):
        account_id = _create_account(client, admin_headers).json()

        resp = client.get(f"/api/payment-accounts/{account_id}", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "现金账户"

    async def test_get_account_not_found(self, client, admin_headers):
        resp = client.get("/api/payment-accounts/9999", headers=admin_headers)
        assert resp.status_code == 404

    async def test_update_account(self, client, admin_headers, db_session):
        account_id = _create_account(client, admin_headers).json()

        resp = client.put(f"/api/payment-accounts/{account_id}", json={
            "name": "更新账户",
            "daily_limit": 10000000,
        }, headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/payment-accounts/{account_id}", headers=admin_headers)
        assert resp_get.json()["name"] == "更新账户"
        assert resp_get.json()["daily_limit"] == 10000000

    async def test_delete_account_soft(self, client, admin_headers, db_session):
        account_id = _create_account(client, admin_headers).json()

        resp = client.delete(f"/api/payment-accounts/{account_id}", headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/payment-accounts/{account_id}", headers=admin_headers)
        assert resp_get.status_code == 404


class TestReceivedToday:
    async def test_received_today_empty(self, client, admin_headers, db_session):
        account_id = _create_account(client, admin_headers).json()

        resp = client.get(
            f"/api/payment-accounts/{account_id}/received-today?date=2026-09-20",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["received"] == 0

    async def test_received_today_with_records(self, client, admin_headers, db_session):
        from datetime import date

        account_id = _create_account(client, admin_headers).json()

        gb_resp = client.post("/api/guestbooks/", json={
            "name": "测试礼簿",
            "event_type": "wedding",
            "event_date": "2026-09-20",
        }, headers=admin_headers)
        gb_id = gb_resp.json()["id"]

        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "张三",
            "amount": 50000,
            "payment_method": "cash",
            "account_id": account_id,
        }, headers=admin_headers)
        client.post(f"/api/guestbooks/{gb_id}/records", json={
            "guest_name": "李四",
            "amount": 30000,
            "payment_method": "cash",
            "account_id": account_id,
        }, headers=admin_headers)

        today = date.today().isoformat()
        resp = client.get(
            f"/api/payment-accounts/{account_id}/received-today?date={today}",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["received"] == 80000

    async def test_received_today_boundary_uses_local_date(self, client, admin_headers, db_session):
        """时区回归：record_time 以无时区 UTC 存储，查询按本地日期换算。
        本地零点整的记录必须计入当天，前一秒的记录必须排除。"""
        from datetime import date, datetime, timedelta, timezone

        account_id = _create_account(client, admin_headers).json()
        gb_id = client.post("/api/guestbooks/", json={
            "name": "边界礼簿",
            "event_type": "wedding",
            "event_date": "2026-09-20",
        }, headers=admin_headers).json()["id"]

        today = date.today()
        local_midnight = datetime.combine(today, datetime.min.time())
        start_utc = local_midnight.astimezone(timezone.utc).replace(tzinfo=None)
        before_utc = start_utc - timedelta(seconds=1)

        for amount, ts in ((50000, start_utc), (30000, before_utc)):
            resp = client.post(f"/api/guestbooks/{gb_id}/records", json={
                "guest_name": "边界",
                "amount": amount,
                "payment_method": "cash",
                "account_id": account_id,
                "record_time": ts.isoformat(),
            }, headers=admin_headers)
            assert resp.status_code == 200

        resp = client.get(
            f"/api/payment-accounts/{account_id}/received-today?date={today.isoformat()}",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["received"] == 50000


class TestDataIsolation:
    async def test_user_cannot_see_other_accounts(self, client, admin_headers, user_headers, db_session):
        _create_account(client, admin_headers)

        resp = client.get("/api/payment-accounts/", headers=user_headers)
        assert resp.status_code == 200
        assert resp.json()["pagination"]["total_count"] == 0

    async def test_user_cannot_access_other_account(self, client, admin_headers, user_headers, db_session):
        account_id = _create_account(client, admin_headers).json()

        resp = client.get(f"/api/payment-accounts/{account_id}", headers=user_headers)
        assert resp.status_code == 404


class TestRolePermissions:
    async def test_collaborator_can_create(self, client, collab_headers, db_session):
        resp = _create_account(client, collab_headers)
        assert resp.status_code == 200

    async def test_collaborator_cannot_delete(self, client, collab_headers, db_session):
        account_id = _create_account(client, collab_headers).json()

        resp = client.delete(f"/api/payment-accounts/{account_id}", headers=collab_headers)
        assert resp.status_code == 403


class TestDisableAccount:
    """is_disabled（停用）与 is_active（系统默认）相互独立的行为验证"""

    async def test_disable_account_clears_default_flag(self, client, admin_headers, db_session):
        """停用默认账户后，其 is_active 应被自动清除，避免'已停用但仍为默认'的歧义"""
        account_id = _create_account(client, admin_headers).json()
        # 新建账户默认为 is_active=True
        resp_get = client.get(f"/api/payment-accounts/{account_id}", headers=admin_headers)
        assert resp_get.json()["is_active"] is True

        resp = client.put(f"/api/payment-accounts/{account_id}", json={"is_disabled": True}, headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/payment-accounts/{account_id}", headers=admin_headers)
        data = resp_get.json()
        assert data["is_disabled"] is True
        assert data["is_active"] is False

    async def test_disabled_account_cannot_be_set_default(self, client, admin_headers, db_session):
        """已停用的账户不能设为默认账户"""
        account_id = _create_account(client, admin_headers).json()
        client.put(f"/api/payment-accounts/{account_id}", json={"is_disabled": True}, headers=admin_headers)

        resp = client.put(f"/api/payment-accounts/{account_id}", json={"is_active": True}, headers=admin_headers)
        assert resp.status_code == 400

        # 保持停用且非默认
        resp_get = client.get(f"/api/payment-accounts/{account_id}", headers=admin_headers)
        data = resp_get.json()
        assert data["is_disabled"] is True
        assert data["is_active"] is False

    async def test_enable_account_keeps_non_default(self, client, admin_headers, db_session):
        """重新启用账户后不会自动恢复默认身份"""
        account_id = _create_account(client, admin_headers).json()
        client.put(f"/api/payment-accounts/{account_id}", json={"is_disabled": True}, headers=admin_headers)

        resp = client.put(f"/api/payment-accounts/{account_id}", json={"is_disabled": False}, headers=admin_headers)
        assert resp.status_code == 200

        resp_get = client.get(f"/api/payment-accounts/{account_id}", headers=admin_headers)
        data = resp_get.json()
        assert data["is_disabled"] is False
        assert data["is_active"] is False

    async def test_non_default_account_is_not_disabled_by_default(self, client, admin_headers, db_session):
        """非默认账户默认不是停用状态（取消原'非默认即停用'的语义）"""
        _create_account(client, admin_headers, name="默认账户")
        # 显式以 is_active=False 创建备选账户
        resp = client.post("/api/payment-accounts/", json={
            "name": "备选账户",
            "type": "cash",
            "is_active": False,
        }, headers=admin_headers)
        second_id = resp.json()

        resp_get = client.get(f"/api/payment-accounts/{second_id}", headers=admin_headers)
        data = resp_get.json()
        assert data["is_active"] is False
        assert data["is_disabled"] is False

    async def test_create_disabled_account_cannot_be_default(self, client, admin_headers, db_session):
        """创建时同时指定 is_active 和 is_disabled，应强制 is_active=False"""
        resp = client.post("/api/payment-accounts/", json={
            "name": "停用账户",
            "type": "cash",
            "is_active": True,
            "is_disabled": True,
        }, headers=admin_headers)
        assert resp.status_code == 200
        account_id = resp.json()

        resp_get = client.get(f"/api/payment-accounts/{account_id}", headers=admin_headers)
        data = resp_get.json()
        assert data["is_disabled"] is True
        assert data["is_active"] is False
